import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageOrganisationEvents, eventDateTimeToIso, eventLocalParts, organisationCanHostEvents, organisationEventStages } from "../lib/organisation-event-policy.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = () => repoFile("supabase/migrations/20260820185627_teamr_phase2b1_shared_event_foundation.sql");

test("School is a supported shared event host", () => assert.equal(organisationCanHostEvents("school"), true));
test("District and School District are supported event hosts", () => {
  assert.equal(organisationCanHostEvents("district"), true);
  assert.equal(organisationCanHostEvents("school_district"), true);
});
test("Club and capable Club hybrid are supported by the same event model", () => {
  assert.equal(organisationCanHostEvents("club"), true);
  assert.equal(organisationCanHostEvents("club_academy"), true);
});
test("unsupported Academy hosting remains deferred", () => assert.equal(organisationCanHostEvents("academy"), false));

test("TeamR Organisation Admin can manage School events", () => assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "organisation_admin", organisationType: "school", role: "player" }), true));
test("Sports Coordinator can manage School and District events", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "sports_coordinator", organisationType: "school", role: "player" }), true);
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "sports_coordinator", organisationType: "district", role: "player" }), true);
});
test("Team Manager event authority remains read-only", () => assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "team_manager", organisationType: "school", role: "player" }), false));
test("Club Manager can manage compatible Club events", () => assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "club_manager", organisationType: "club", role: "club_admin" }), true));
test("ClubR-only authority does not grant School event management", () => assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "club_manager", organisationType: "school", role: "club_admin" }), false));
test("platform admin authority remains explicit", () => assert.equal(canManageOrganisationEvents({ activeOrganisationRole: null, organisationType: null, role: "platform_admin" }), true));

test("event stages reuse canonical PlayR values without not_sure", () => assert.deepEqual(organisationEventStages.map((stage) => stage.value), ["red_ball", "orange_ball", "green_ball", "yellow_ball"]));
test("SAST form values round-trip to timezone-safe timestamps", () => {
  const value = eventDateTimeToIso("2026-09-12", "09:30");
  assert.equal(value, "2026-09-12T07:30:00.000Z");
  assert.deepEqual(eventLocalParts(value), { date: "2026-09-12", time: "09:30" });
});
test("invalid event date/time input is rejected", () => {
  assert.equal(eventDateTimeToIso("12/09/2026", "09:30"), null);
  assert.equal(eventDateTimeToIso("2026-09-12", "9:30"), null);
});

test("migration extends the canonical events table instead of creating a duplicate engine", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.events[\s\S]*add column if not exists venue_id/);
  assert.doesNotMatch(sql, /create table[^;]*(teamr_events|organisation_events)/i);
});
test("shared host validation accepts only deliberate capability types", () => {
  const sql = migration();
  assert.match(sql, /venue\.organisation_type in \('school', 'district', 'school_district', 'club', 'club_academy'\)/);
  assert.doesNotMatch(sql.match(/create or replace function public\.organisation_can_host_events[\s\S]*?\$\$;/)?.[0] ?? "", /'academy'/);
});
test("Open and Closed are database constrained", () => assert.match(migration(), /events_visibility_valid check \(visibility in \('closed', 'open'\)\)/));
test("invalid capacity and time ordering remain database constrained", () => {
  const sql = repoFile("supabase/migrations/202605190001_create_courtside_mvp_schema.sql") + migration();
  assert.match(sql, /events_datetime_order check \(end_datetime > start_datetime\)/);
  assert.match(sql, /events_max_entries_positive check \(max_entries is null or max_entries > 0\)/);
});
test("event host is immutable after creation", () => assert.match(migration(), /new\.venue_id is distinct from old\.venue_id[\s\S]*event_host_immutable/));
test("Draft, Published, Cancelled and Completed transitions are constrained", () => {
  const sql = migration();
  assert.match(sql, /old\.status = 'draft' and new\.status in \('published', 'cancelled'\)/);
  assert.match(sql, /old\.status = 'published' and new\.status in \('draft', 'cancelled', 'completed'\)/);
  assert.match(sql, /invalid_event_status_transition/);
});
test("archive is durable metadata and archived events become immutable", () => {
  const sql = migration();
  assert.match(sql, /archived_at timestamptz/);
  assert.match(sql, /archived_by_user_id uuid references auth\.users/);
  assert.match(sql, /old\.archived_at is not null[\s\S]*archived_event_immutable/);
});
test("cross-organisation create and update are enforced by shared RLS helpers", () => {
  const sql = migration();
  assert.match(sql, /create policy "Organisation managers can create events"[\s\S]*user_can_manage_organisation_events\(venue_id\)/);
  assert.match(sql, /create policy "Organisation managers can update events"[\s\S]*using \([\s\S]*user_can_manage_organisation_events\(venue_id\)[\s\S]*with check/);
});
test("organisation events do not leak through legacy public event discovery", () => {
  const sql = migration();
  const publicPolicy = sql.match(/create policy "Public users can read public events"[\s\S]*?\);/)?.[0] ?? "";
  assert.match(publicPolicy, /status in \('published', 'completed'\)[\s\S]*venue_id is null/);
  assert.doesNotMatch(publicPolicy, /visibility = '(open|closed)'/);
});
test("organisation events cannot enter the legacy paid-entry workflow", () => {
  const sql = migration();
  assert.match(sql, /drop policy if exists "Users can create entries for own or linked junior profiles"/);
  assert.match(sql, /event\.id = event_entries\.event_id[\s\S]*event\.venue_id is null[\s\S]*event\.status = 'published'/);
  for (const path of ["app/events/page.tsx", "app/events/[slug]/page.tsx", "app/events/[slug]/actions.ts", "app/dashboard/events/page.tsx", "app/dashboard/events/[id]/page.tsx", "app/dashboard/events/actions.ts", "app/dashboard/compete/page.tsx"]) {
    assert.match(repoFile(path), /\.is\("venue_id", null\)/, path);
  }
});
test("Team Manager read and management role sets are intentionally different", () => {
  const sql = migration();
  const viewer = sql.match(/create or replace function public\.user_can_view_organisation_events[\s\S]*?\$\$;/)?.[0] ?? "";
  const manager = sql.match(/create or replace function public\.user_can_manage_organisation_events[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(viewer, /'team_manager'/);
  assert.doesNotMatch(manager, /'team_manager'/);
});
test("Data API grants are rebuilt REVOKE-first with immutable columns excluded", () => {
  const sql = migration();
  assert.match(sql, /revoke all privileges on table public\.events[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.events to anon, authenticated/);
  assert.match(sql, /grant insert on table public\.events to authenticated/);
  const updateGrant = sql.match(/grant update \([\s\S]*?\) on table public\.events to authenticated;/)?.[0] ?? "";
  assert.doesNotMatch(updateGrant, /\bvenue_id\b|\bcreated_by\b|\bcreated_at\b/);
  assert.doesNotMatch(sql, /grant delete on table public\.events to authenticated/i);
  assert.match(sql, /grant all privileges on table public\.events to service_role/);
});
test("new public helpers revoke anonymous execution and pin search_path", () => {
  const sql = migration();
  assert.match(sql, /organisation_can_host_events[\s\S]*set search_path = ''/);
  assert.match(sql, /revoke all on function public\.user_can_manage_organisation_events\(uuid, uuid\) from public, anon/);
  assert.match(sql, /grant execute on function public\.user_can_manage_organisation_events\(uuid, uuid\) to authenticated, service_role/);
});

test("server actions scope reads and writes to the active organisation", () => {
  const source = repoFile("app/dashboard/teamr/competitions/actions.ts");
  assert.match(source, /venue_id: context\.venueId/);
  assert.match(source, /\.eq\("venue_id", context\.venueId\)/);
  assert.match(source, /loadOrganisationEvent\(context, eventId\)/);
  assert.doesNotMatch(source, /formData.*venueId|text\(formData, "venueId"\)/);
});
test("TeamR provides listing, create, detail, edit and lifecycle surfaces", () => {
  const listing = repoFile("app/dashboard/teamr/competitions/page.tsx");
  const detail = repoFile("app/dashboard/teamr/competitions/[eventId]/page.tsx");
  assert.match(listing, /Upcoming[\s\S]*Draft[\s\S]*Completed[\s\S]*Cancelled/);
  assert.match(listing, /Create Event/);
  assert.match(detail, /Publish[\s\S]*Unpublish[\s\S]*Cancel[\s\S]*Archive/);
  assert.match(detail, /Players and staff will be assigned in the next phase/);
});
test("MyTeamR exposes a minimal connected event summary", () => {
  const source = repoFile("app/dashboard/teamr/page.tsx");
  assert.match(source, /Upcoming Events/);
  assert.match(source, /nextEvent/);
  assert.match(source, /draftEventCount/);
});
test("Phase 2A team and roster architecture remains untouched", () => {
  const sql = migration();
  const phase2a = repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql");
  assert.doesNotMatch(sql, /alter table public\.(profiles|teamr_teams|teamr_roster_memberships|organisation_player_links)/i);
  assert.match(phase2a, /create table if not exists public\.teamr_teams/);
  assert.match(phase2a, /create table if not exists public\.teamr_roster_memberships/);
});
test("Phase 2B.1 introduces no participant, staff, invitation or notification tables", () => {
  assert.doesNotMatch(migration(), /create table[^;]*(participant|staff|assignment|invitation|notification|match|draw|standing)/i);
});
test("one-profile architecture remains untouched", () => {
  assert.doesNotMatch(migration(), /create table[^;]*(player|profile)/i);
  assert.doesNotMatch(migration(), /insert into public\.profiles/i);
});
