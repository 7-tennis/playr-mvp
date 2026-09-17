import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { notificationMatchesFilter, organisationContextLabel, safeNotificationHref } from "../lib/notification-centre.ts";
import type { Notification } from "../types/courtside.ts";

const migrationPath = "supabase/migrations/20260914090800_playr_teamr_phase2b4_targeted_notifications.sql";
const migration = readFileSync(migrationPath, "utf8");
const notificationFoundation = readFileSync("supabase/migrations/202607050001_create_notifications_v1.sql", "utf8");
const page = readFileSync("app/dashboard/notifications/page.tsx", "utf8");
const actions = readFileSync("app/dashboard/notifications/actions.ts", "utf8");
const eventActions = readFileSync("app/dashboard/teamr/competitions/actions.ts", "utf8");
const eventPage = readFileSync("app/dashboard/teamr/competitions/[eventId]/page.tsx", "utf8");
const centre = readFileSync("lib/notification-centre.ts", "utf8");
const notificationClient = readFileSync("lib/notifications.ts", "utf8");
const playerNavigation = readFileSync("lib/player-navigation.ts", "utf8");
const navigation = readFileSync("components/player-nav.tsx", "utf8");
const legacyEvents = readFileSync("app/dashboard/events/actions.ts", "utf8");

test("reuses the shared notifications table instead of a TeamR-only inbox", () => {
  assert.match(migration, /alter table public\.notifications/);
  assert.doesNotMatch(migration, /create table public\.(teamr_notifications|notification_recipients)/);
});

test("adds structured organisation, event and category context", () => {
  assert.match(migration, /add column organisation_id uuid references public\.venues/);
  assert.match(migration, /add column event_id uuid references public\.events/);
  assert.match(migration, /add column category text/);
});

test("closed invitation creates an action-required participant notification", () => {
  assert.match(migration, /new\.status = 'invited'[\s\S]*'event_invitation'[\s\S]*true/);
});

test("Junior notification routing uses the canonical profile owner", () => {
  assert.match(migration, /recipient_user_id := public\.notification_profile_owner\(new\.player_profile_id\)/);
  assert.match(migration, /when profile\.is_junior then coalesce\(parent\.user_id, profile\.user_id\)/);
});

test("adult notification routing resolves to the adult profile user", () => {
  assert.match(migration, /else profile\.user_id/);
});

test("accepting an invitation notifies operational managers", () => {
  assert.match(migration, /'event_invitation_accepted'/);
  assert.match(migration, /target_profile\.first_name \|\| case when new\.status = 'confirmed' then ' accepted/);
});

test("declining an invitation notifies operational managers", () => {
  assert.match(migration, /'event_invitation_declined'/);
  assert.match(migration, /else ' declined the invitation to '/);
});

test("an open entry request creates an action-required manager notification", () => {
  assert.match(migration, /'event_entry_requested'[\s\S]*'Entry request'[\s\S]*true/);
});

test("entry approval notifies the participant owner", () => {
  assert.match(migration, /'event_entry_approved'/);
  assert.match(migration, /'''s entry to ' \|\| target_event\.title \|\| ' has been approved\.'/);
});

test("entry rejection uses neutral participant language", () => {
  assert.match(migration, /'event_entry_rejected'/);
  assert.match(migration, /' was not approved\.'/);
});

test("participant removal produces a targeted notification", () => {
  assert.match(migration, /new\.status = 'removed'[\s\S]*'event_participant_removed'/);
});

test("event manager and coordinator are the first operational recipients", () => {
  assert.match(migration, /assignment\.event_role in \('event_manager', 'coordinator'\)/);
});

test("organisation managers are a deliberate fallback only", () => {
  assert.match(migration, /if recipient_count = 0 then[\s\S]*organisation_admin[\s\S]*sports_coordinator/);
});

test("event staff assignment notifies the assigned user", () => {
  assert.match(migration, /tg_op = 'INSERT'[\s\S]*'event_staff_assigned'/);
});

test("event staff role changes notify only the affected user", () => {
  assert.match(migration, /new\.event_role is distinct from old\.event_role[\s\S]*'event_staff_role_changed'/);
});

test("event staff removal notifies the removed user", () => {
  assert.match(migration, /new\.status = 'removed' and old\.status = 'active'[\s\S]*'event_staff_removed'/);
});

test("meaningful start or end time changes are detected", () => {
  assert.match(migration, /time_changed boolean :=[\s\S]*starts_at[\s\S]*ends_at/);
});

test("meaningful location changes are detected", () => {
  assert.match(migration, /location_changed boolean := new\.location is distinct from old\.location/);
});

test("description-only edits do not fire the event-change trigger", () => {
  assert.match(migration, /after update of status, starts_at, ends_at, start_datetime, end_datetime, location on public\.events/);
  assert.doesNotMatch(migration, /after update of[^\n]*description/);
});

test("cancellation reaches confirmed, invited and pending participants", () => {
  assert.match(migration, /is_cancelled and assignment\.status in \('invited', 'entry_requested', 'confirmed'\)/);
  assert.match(migration, /case when is_cancelled then 'cancelled' else 'participant' end/);
  assert.match(migration, /get_notification_event_detail/);
});

test("normal event changes target confirmed participants only", () => {
  assert.match(migration, /not is_cancelled and assignment\.status = 'confirmed'/);
});

test("unrelated eligible players are never selected as recipients", () => {
  assert.doesNotMatch(migration, /player_is_eligible_for_event[\s\S]*insert_event_notification/);
});

test("event announcements are durable one-way records", () => {
  assert.match(migration, /create table public\.event_announcements/);
  assert.doesNotMatch(migration, /reply|reaction|thread_id|attachment/i);
});

test("announcements target confirmed participants", () => {
  assert.match(migration, /send_event_announcement[\s\S]*assignment\.status = 'confirmed'/);
});

test("announcements target active assigned staff", () => {
  assert.match(migration, /send_event_announcement[\s\S]*event_staff_assignments[\s\S]*assignment\.status = 'active'/);
});

test("declined and removed players do not receive announcements", () => {
  const announcement = migration.match(/create function public\.send_event_announcement[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(announcement, /status in \([^)]*declined|status in \([^)]*removed/);
});

test("only Event Managers, Coordinators or existing organisation managers can announce", () => {
  assert.match(migration, /array\['event_manager', 'coordinator'\]/);
  assert.match(migration, /user_can_manage_organisation_events/);
});

test("Coach and Official receive no broadcast authority", () => {
  const permission = migration.match(/create function public\.send_event_announcement[\s\S]*?announcement_access/)?.[0] ?? "";
  assert.doesNotMatch(permission, /array\[[^\]]*'coach'|array\[[^\]]*'official'/);
});

test("announcement content is plain text limited to 1000 characters", () => {
  assert.match(migration, /length\(btrim\(message\)\) between 1 and 1000/);
  assert.match(eventPage, /maxLength=\{1000\}/);
});

test("notification creation is transactionally attached through database triggers", () => {
  assert.match(migration, /after insert or update of status on public\.event_player_assignments/);
  assert.match(migration, /after insert or update of status, event_role on public\.event_staff_assignments/);
});

test("dedupe keys and the existing unique index prevent duplicate delivery", () => {
  assert.match(notificationFoundation, /notifications_user_dedupe_key_unique/);
  assert.match(migration, /on conflict do nothing/g);
  assert.match(migration, /notification_profile_owner\(player_assignment\.player_profile_id\) = assignment\.staff_user_id/g);
});

test("direct authenticated notification insertion is removed", () => {
  assert.match(migration, /revoke insert on table public\.notifications from public, anon, authenticated/);
  assert.match(migration, /drop policy if exists "Users can create their own notifications"/);
});

test("legacy self-confirmations use a narrowly validated RPC", () => {
  assert.match(notificationClient, /rpc\("create_my_notification"/);
  assert.match(migration, /p_type not in \('court_booking_confirmed', 'event_entry_confirmed'\)/);
});

test("anonymous execution is revoked and authenticated execution is explicit", () => {
  assert.match(migration, /revoke all on function public\.send_event_announcement\(uuid, text\) from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.send_event_announcement\(uuid, text\) to authenticated, service_role/);
});

test("notification reads remain isolated to the addressed user", () => {
  assert.match(notificationFoundation, /using \(user_id = \(select auth\.uid\(\)\)\)/);
});

test("another user cannot mark a notification read through the server action", () => {
  assert.match(actions, /\.eq\("id", notificationId\)[\s\S]*\.eq\("user_id", user\.id\)/);
});

test("mark-all-read is scoped to the current user", () => {
  assert.match(actions, /markAllNotificationsRead[\s\S]*\.eq\("user_id", user\.id\)[\s\S]*\.is\("read_at", null\)/);
});

test("deep links are validated and opened through a POST read transition", () => {
  assert.match(centre, /safeNotificationHref/);
  assert.match(centre, /startsWith\("\/dashboard\/"\)/);
  assert.match(page, /form action=\{openNotification\}/);
});

test("deep-link validation accepts local dashboard routes and rejects external targets", () => {
  assert.equal(safeNotificationHref("/dashboard/compete/events/abc?player=def"), "/dashboard/compete/events/abc?player=def");
  assert.equal(safeNotificationHref("https://example.com/dashboard/messages"), null);
  assert.equal(safeNotificationHref("//example.com/dashboard/messages"), null);
});

test("context filters classify the same event under its organisation and Events", () => {
  const notification = { action_required: false, status: "unread", type: "event_changed" } as Notification;
  assert.equal(notificationMatchesFilter(notification, "events", "school"), true);
  assert.equal(notificationMatchesFilter(notification, "school", "school"), true);
  assert.equal(notificationMatchesFilter(notification, "district", "school"), false);
  assert.equal(organisationContextLabel("district", "D2 Tennis"), "District · D2 Tennis");
});

test("the Updates centre exposes compact contextual filters", () => {
  for (const label of ["All", "Action", "School", "District", "Club", "Events"]) assert.match(centre, new RegExp(`label: "${label}"`));
  assert.match(page, /overflow-x-auto/);
});

test("School, District and Club context labels are user-facing", () => {
  assert.match(centre, /return `\$\{label\} · \$\{name\}`/);
  assert.match(page, /organisationContextLabel/);
});

test("action-required notifications are prioritised without inline lifecycle actions", () => {
  assert.match(page, /id="action-required"/);
  assert.match(page, /actionRequired \? "Review" : "Open"/);
  assert.doesNotMatch(page, /Accept Invitation|Decline Invitation/);
});

test("the existing navigation destination is renamed Updates and retains its unread badge", () => {
  assert.match(playerNavigation, /href: "\/dashboard\/messages"[\s\S]*label: "Updates"/);
  assert.match(navigation, /unread \$\{count === 1 \? "update" : "updates"\}/);
});

test("legacy event_entries isolation remains intact", () => {
  assert.match(legacyEvents, /\.from\("event_entries"\)\.insert/);
  assert.doesNotMatch(migration, /alter table public\.event_entries|create trigger[^;]*event_entries/i);
});

test("publishing alone does not generate a notification", () => {
  assert.doesNotMatch(migration, /event_published/);
  assert.match(migration, /new\.status = 'cancelled'/);
});

test("event reminders remain deferred without a page-load scheduler", () => {
  assert.doesNotMatch(migration, /cron|pg_cron|create[^;]*event_reminder/i);
  assert.doesNotMatch(page, /create.*reminder/i);
});

test("the TeamR event page offers a short one-way announcement instead of chat", () => {
  assert.match(eventPage, /This is one-way; there are no replies or group chat/);
  assert.match(eventActions, /rpc\("send_event_announcement"/);
});
