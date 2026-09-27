import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeNotificationProfile,
  notificationMatchesFilter,
  notificationMatchesProfile,
  notificationProfileId,
  safeNotificationHref,
  updatesFilterHref
} from "../lib/notification-centre.ts";
import type { Notification } from "../types/courtside.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const setup = repoFile("lib/organisation-setup.ts");
const authRouting = repoFile("lib/auth-routing.ts");
const organisationActions = repoFile("app/dashboard/organisations/actions.ts");
const invitationActions = repoFile("app/dashboard/organisations/invitations/actions.ts");
const updatesPage = repoFile("app/dashboard/notifications/page.tsx");
const notificationActions = repoFile("app/dashboard/notifications/actions.ts");
const phase2b4Migration = repoFile("supabase/migrations/20260914090800_playr_teamr_phase2b4_targeted_notifications.sql");

function notification(overrides: Partial<Notification> = {}) {
  return {
    action_required: false,
    actor_user_id: null,
    category: "events",
    created_at: "2026-09-27T00:00:00Z",
    dedupe_key: null,
    event_id: null,
    href: "/dashboard/messages",
    id: "notification-1",
    invitation_id: null,
    junior_profile_id: null,
    message: "Update",
    metadata: {},
    organisation_id: null,
    profile_id: null,
    read_at: null,
    resolved_at: null,
    status: "unread",
    title: "Update",
    type: "event_changed",
    user_id: "user-1",
    ...overrides
  } satisfies Notification;
}

test("CoachR completion is resolved across active coaching memberships", () => {
  assert.match(setup, /organisation_memberships[\s\S]*\.eq\("user_id", userId\)[\s\S]*\.eq\("status", "active"\)[\s\S]*\.in\("role", \[\.\.\.coachRMembershipRoles\]\)/);
});

test("only CoachR-capable roles contribute to identity completion", () => {
  assert.match(setup, /\["head_coach", "coach", "assistant_coach"\] as const/);
  assert.doesNotMatch(setup, /coachRMembershipRoles = \[[^\]]*sports_coordinator/);
});

test("a completed CoachR product setup is required", () => {
  assert.match(setup, /\.eq\("product_context", "coachr"\)[\s\S]*\.eq\("status", "complete"\)/);
});

test("identity lookup failures fail closed into normal onboarding", () => {
  assert.match(setup, /coachr_identity_memberships_failed[\s\S]*return false/);
  assert.match(setup, /coachr_identity_setup_failed[\s\S]*return false/);
});

test("invitation acceptance still uses the canonical acceptance RPC", () => {
  assert.match(invitationActions, /rpc\("accept_organisation_invitation"/);
});

test("invitation acceptance does not create a profile", () => {
  assert.doesNotMatch(invitationActions, /from\("profiles"\)\.insert|from\("profiles"\)\.upsert/);
});

test("completed CoachR users land in CoachR after accepting a leader invitation", () => {
  assert.match(invitationActions, /userHasCompletedCoachRIdentity[\s\S]*redirect\(productDashboardPath\(setupProduct\)\)/);
});

test("new CoachR users retain the required setup route", () => {
  assert.match(invitationActions, /productSetupPath\(setupProduct, setup\.setup\.current_step\)/);
});

test("post-login routing recognises the canonical CoachR completion", () => {
  assert.match(authRouting, /product === "coachr" && await userHasCompletedCoachRIdentity[\s\S]*return "\/dashboard\/coachr"/);
});

test("active organisation switching recognises the canonical CoachR completion", () => {
  assert.match(organisationActions, /productContext === "coachr" && await userHasCompletedCoachRIdentity[\s\S]*redirect\(productLanding\(productContext\)\)/);
});

test("non-CoachR organisation setup routing remains intact", () => {
  assert.match(organisationActions, /productContext === "clubr"/);
  assert.match(authRouting, /product === "clubr" && role === "club_admin"/);
});

test("no migration is introduced for Phase 2B.4A", () => {
  assert.doesNotMatch(setup, /rpc\(/);
  assert.doesNotMatch(setup, /create (table|function|policy)|alter table/i);
});

test("direct profile context takes precedence over metadata", () => {
  const item = notification({ profile_id: "adult", metadata: { profileId: "other" } });
  assert.equal(notificationProfileId(item), "adult");
});

test("Junior profile context takes precedence over adult profile context", () => {
  assert.equal(notificationProfileId(notification({ junior_profile_id: "james", profile_id: "adult" })), "james");
});

test("legacy camel-case player metadata remains filterable", () => {
  assert.equal(notificationProfileId(notification({ metadata: { playerProfileId: "steyn" } })), "steyn");
});

test("legacy snake-case player metadata remains filterable", () => {
  assert.equal(notificationProfileId(notification({ metadata: { player_profile_id: "james" } })), "james");
});

test("staff-only updates have no player profile context", () => {
  assert.equal(notificationProfileId(notification({ type: "event_staff_assigned" })), null);
});

test("All includes adult, Junior and staff-only updates", () => {
  for (const item of [notification({ profile_id: "adult" }), notification({ junior_profile_id: "steyn" }), notification()]) {
    assert.equal(notificationMatchesProfile(item, null), true);
  }
});

test("Steyn shows only Steyn-targeted updates", () => {
  assert.equal(notificationMatchesProfile(notification({ junior_profile_id: "steyn" }), "steyn"), true);
  assert.equal(notificationMatchesProfile(notification({ junior_profile_id: "james" }), "steyn"), false);
});

test("James shows only James-targeted updates", () => {
  assert.equal(notificationMatchesProfile(notification({ junior_profile_id: "james" }), "james"), true);
  assert.equal(notificationMatchesProfile(notification(), "james"), false);
});

test("arbitrary profile IDs are rejected", () => {
  assert.equal(normalizeNotificationProfile("stranger", ["adult", "steyn", "james"]), null);
});

test("an adult/self profile can be selected", () => {
  assert.equal(normalizeNotificationProfile("adult", ["adult", "steyn", "james"]), "adult");
});

test("School context composes with a selected profile", () => {
  const item = notification({ junior_profile_id: "james" });
  assert.equal(notificationMatchesProfile(item, "james") && notificationMatchesFilter(item, "school", "school"), true);
});

test("District context composes with a selected profile", () => {
  const item = notification({ junior_profile_id: "steyn" });
  assert.equal(notificationMatchesProfile(item, "steyn") && notificationMatchesFilter(item, "district", "district"), true);
});

test("Events context composes with a selected profile", () => {
  const item = notification({ junior_profile_id: "james", type: "event_changed" });
  assert.equal(notificationMatchesProfile(item, "james") && notificationMatchesFilter(item, "events"), true);
});

test("Action context composes with a selected profile", () => {
  const item = notification({ action_required: true, junior_profile_id: "steyn", status: "action_required" });
  assert.equal(notificationMatchesProfile(item, "steyn") && notificationMatchesFilter(item, "action"), true);
});

test("profile links preserve an active context filter", () => {
  assert.equal(updatesFilterHref({ filter: "school", profileId: "james" }), "/dashboard/messages?filter=school&profile=james");
});

test("context links preserve an active profile filter", () => {
  assert.equal(updatesFilterHref({ filter: "events", profileId: "steyn" }), "/dashboard/messages?filter=events&profile=steyn");
});

test("hub links preserve both filter dimensions", () => {
  assert.equal(updatesFilterHref({ filter: "district", hub: "organisation-d2", profileId: "james" }), "/dashboard/messages?filter=district&profile=james&hub=organisation-d2");
});

test("the All/All route stays compact", () => {
  assert.equal(updatesFilterHref({}), "/dashboard/messages");
});

test("the Updates page derives manageable profiles from the signed-in adult", () => {
  assert.match(updatesPage, /\.eq\("user_id", user\.id\)[\s\S]*\.eq\("is_junior", false\)/);
  assert.match(updatesPage, /\.eq\("parent_profile_id", adultProfile\.id\)[\s\S]*\.eq\("is_junior", true\)/);
});

test("profile query parameters are server-side allow-listed", () => {
  assert.match(updatesPage, /normalizeNotificationProfile\(searchParams\?\.profile, manageableProfileIds\)/);
});

test("account-wide unread and action counts are calculated before profile filtering", () => {
  assert.ok(updatesPage.indexOf("const unreadCount = notifications.filter") < updatesPage.indexOf("const profileVisibleNotifications"));
  assert.ok(updatesPage.indexOf("const actionRequiredCount = notifications.filter") < updatesPage.indexOf("const profileVisibleNotifications"));
});

test("mark-all-read remains scoped to the authenticated user", () => {
  assert.match(notificationActions, /markAllNotificationsRead[\s\S]*\.eq\("user_id", user\.id\)/);
});

test("notification deep links retain dashboard-only validation", () => {
  assert.equal(safeNotificationHref("/dashboard/compete/events/event-1?player=james"), "/dashboard/compete/events/event-1?player=james");
  assert.equal(safeNotificationHref("https://example.com/dashboard/compete"), null);
});

test("Phase 2B.4 trigger-based notification delivery remains unchanged", () => {
  assert.match(phase2b4Migration, /after insert or update of status on public\.event_player_assignments/);
  assert.match(phase2b4Migration, /after insert or update of status, event_role on public\.event_staff_assignments/);
});

test("event staff candidate architecture remains membership-based", () => {
  assert.match(phase2b4Migration, /event_staff_assignments/);
  assert.doesNotMatch(invitationActions, /event_staff_assignments/);
});
