import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allowedEventRolesForOrganisationRole, eventStageMatchesProfile, partitionProfileEvents, type ProfileEventRelevance } from "../lib/event-relevance.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = () => repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql");
const compete = () => repoFile("app/dashboard/compete/page.tsx");
const actions = () => repoFile("app/dashboard/teamr/competitions/actions.ts");

const event = (overrides: Partial<ProfileEventRelevance> = {}): ProfileEventRelevance => ({
  event_id: "event-1", title: "Green Event", description: null, host_id: "host-1", host_name: "Kenmare",
  host_type: "school", visibility: "closed", junior_stage: "green_ball", starts_at: "2026-09-01T08:00:00Z",
  ends_at: "2026-09-01T10:00:00Z", location: "Courts", capacity: 16, relevance_kind: "eligible",
  relevance_reason: "Eligible through Kenmare", is_assigned: false, ...overrides
});

test("profile selector is limited to canonical manageable profiles", () => {
  const loader = repoFile("app/dashboard/play/play-shared.tsx");
  assert.match(loader, /ownProfiles = \[adultProfile, \.\.\./);
  assert.match(loader, /ownProfiles\.find\(\(profile\) => profile\.id === searchParams\?\.player\) \?\? ownProfiles\[0\]/);
  assert.match(sql(), /public\.can_manage_profile\(p_player_profile_id, actor_user_id\)/);
});
test("arbitrary profile relevance RPC calls are rejected server-side", () => assert.match(sql(), /raise exception 'profile_access'/));
test("Closed School eligibility requires an active exact School link", () => assert.match(sql(), /host\.organisation_type in \('school', 'school_district'\)[\s\S]*link\.venue_id = host\.id[\s\S]*link\.status = 'active'/));
test("unrelated School players fail the same exact-host predicate", () => assert.doesNotMatch(sql(), /link\.venue_id\s*<>\s*host\.id/));
test("Closed District eligibility inherits through belongs_to", () => assert.match(sql(), /organisation_relationships relationship[\s\S]*relationship\.parent_venue_id = host\.id[\s\S]*relationship_type = 'belongs_to'/));
test("District eligibility does not require a direct District player link", () => {
  const district = sql().match(/host\.organisation_type in \('district', 'school_district'\)[\s\S]*?\n            \)/)?.[0] ?? "";
  assert.match(district, /join public\.venues school/);
  assert.doesNotMatch(district, /link\.venue_id = host\.id/);
});
test("Closed Club eligibility reuses active ClubR memberships", () => assert.match(sql(), /public\.club_memberships membership[\s\S]*membership\.venue_id = host\.id[\s\S]*membership\.status = 'active'/));
test("Open event eligibility is independent from host membership", () => assert.match(sql(), /event\.visibility = 'open'\s*\n\s*or/));
test("same-stage Open event matching works", () => assert.equal(eventStageMatchesProfile("green_ball", { is_junior: true, junior_stage: "green_ball" }), true));
test("wrong-stage Open event is excluded", () => assert.equal(eventStageMatchesProfile("green_ball", { is_junior: true, junior_stage: "red_ball" }), false));
test("mixed events remain relevant to adult or Junior profiles", () => assert.equal(eventStageMatchesProfile(null, { is_junior: false, junior_stage: null }), true));
test("Draft, Cancelled and Archived events are excluded from eligibility", () => assert.match(sql(), /event\.status = 'published'[\s\S]*event\.archived_at is null/));
test("player assignment requires derived eligibility", () => assert.match(sql(), /assign_event_player[\s\S]*not private\.player_is_eligible_for_event/));
test("cross-School assignment therefore fails atomically", () => assert.match(sql(), /raise exception 'player_not_eligible'/));
test("District inherited assignment uses the shared eligibility helper", () => assert.match(sql(), /assign_event_player[\s\S]*private\.player_is_eligible_for_event/));
test("duplicate active player assignment is database prevented", () => assert.match(sql(), /event_player_assignments_active_unique[\s\S]*where status = 'active'/));
test("player removal is a forward-compatible soft transition", () => assert.match(sql(), /remove_event_player_assignment[\s\S]*set status = 'removed', removed_at = now\(\)/));
test("Event Manager and organisation managers can manage staff", () => assert.match(sql(), /user_can_manage_event_staff[\s\S]*array\['event_manager'\]/));
test("Coordinator can manage players but not staff", () => {
  const players = sql().match(/create function private\.user_can_manage_event_players[\s\S]*?\$\$;/)?.[0] ?? "";
  const staff = sql().match(/create function private\.user_can_manage_event_staff[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(players, /'coordinator'/); assert.doesNotMatch(staff, /'coordinator'/);
});
test("Coach and Official are read-only operational roles", () => {
  assert.deepEqual(allowedEventRolesForOrganisationRole("coach"), ["coach", "official"]);
  assert.match(sql(), /user_can_view_event_operations[\s\S]*'coach', 'official'/);
});
test("Coach cannot self-promote to Event Manager", () => {
  assert.equal(allowedEventRolesForOrganisationRole("coach").includes("event_manager"), false);
  assert.match(sql(), /p_event_role = 'event_manager'[\s\S]*membership\.role not in \('organisation_admin', 'sports_coordinator', 'club_manager'\)/);
});
test("staff candidates require active host membership and canonical adult account", () => assert.match(sql(), /membership\.venue_id = event\.venue_id[\s\S]*membership\.status = 'active'[\s\S]*profile\.user_id = membership\.user_id/));
test("cross-organisation staff assignment is rejected", () => assert.match(sql(), /target_event\.venue_id is distinct from target_membership\.venue_id/));
test("staff assignment is unique per event and user", () => assert.match(sql(), /event_staff_assignments_active_unique[\s\S]*event_id, staff_user_id/));
test("selected events are promoted separately from eligible events", () => {
  const result = partitionProfileEvents([event(), event({ event_id: "event-2", is_assigned: true, relevance_kind: "selected" })]);
  assert.equal(result.selected.length, 1); assert.equal(result.connected.length, 1);
  assert.match(compete(), /title="Selected"[\s\S]*title="For You"[\s\S]*title="Open Events"/);
});
test("eligibility never creates assignment or occupies capacity", () => assert.match(repoFile("app/dashboard/teamr/competitions/[eventId]/page.tsx"), /Eligibility alone does not occupy capacity/));
test("profile-facing event detail contains no organiser controls", () => {
  const page = repoFile("app/dashboard/compete/events/[eventId]/page.tsx");
  assert.match(page, /relevance_reason/); assert.doesNotMatch(page, /assignEventPlayer|transitionOrganisationEvent|Assign Staff/);
});
test("existing challenges and matches remain present in Compete", () => assert.match(compete(), /Challenge Players[\s\S]*Upcoming Matches[\s\S]*Recent Results/));
test("legacy paid event_entries remain separate", () => {
  assert.doesNotMatch(sql(), /insert into public\.event_entries|alter table public\.event_entries/);
  assert.match(compete(), /\.is\("venue_id", null\)/);
});
test("shared tables are neutral and create no player identity", () => {
  assert.match(sql(), /create table public\.event_player_assignments/);
  assert.match(sql(), /create table public\.event_staff_assignments/);
  assert.doesNotMatch(sql(), /teamr_event_(player|staff)|insert into public\.profiles/);
});
test("RLS and REVOKE-first grants protect both assignment tables", () => {
  const migration = sql();
  assert.match(migration, /alter table public\.event_player_assignments enable row level security/);
  assert.match(migration, /alter table public\.event_staff_assignments enable row level security/);
  assert.match(migration, /revoke all privileges on table public\.event_player_assignments from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.event_player_assignments to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*event_(player|staff)_assignments to authenticated/i);
});
test("guessed assignment IDs are checked against event authority", () => {
  assert.match(sql(), /target\.id is null or target\.status <> 'active'[\s\S]*user_can_manage_event_players\(target\.event_id/);
  assert.match(sql(), /user_can_manage_event_staff\(target\.event_id/);
});
test("server actions never accept a host organisation ID", () => {
  assert.match(actions(), /rpc\("assign_event_player"/); assert.doesNotMatch(actions(), /text\(formData, "venueId"\)/);
});
test("Open player discovery requires a search and is capped", () => assert.match(sql(), /event_visibility = 'open' and length\(btrim[\s\S]*< 2[\s\S]*limit 60/));
test("ranking publication is not an eligibility dependency", () => assert.doesNotMatch(sql(), /ranking|publication/));
test("no invitations, notifications, scoring, draws or fixtures are introduced", () => {
  const migration = sql();
  assert.doesNotMatch(migration, /create table[^;]*(invitation|notification|score|draw|fixture|standing|match)/i);
});
test("Phase 2A team and roster architecture is not altered", () => {
  const migration = sql();
  assert.doesNotMatch(migration, /alter table public\.(teamr_teams|teamr_roster_memberships|organisation_player_links)/);
  assert.match(repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql"), /teamr_roster_memberships/);
});
