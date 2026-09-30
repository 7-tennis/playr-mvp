import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = repoFile("supabase/migrations/20260930112338_phase_2c2_courts_match_scheduling_staff_assignments.sql");
const phase2c1 = repoFile("supabase/migrations/20260927180544_phase_2c1_competition_operations_foundation.sql");
const operationsPage = repoFile("app/dashboard/teamr/competitions/[eventId]/operations/page.tsx");
const operationsActions = repoFile("app/dashboard/teamr/competitions/[eventId]/operations/actions.ts");
const eventPage = repoFile("app/dashboard/teamr/competitions/[eventId]/page.tsx");
const structurePage = repoFile("app/dashboard/teamr/competitions/[eventId]/structure/page.tsx");

const migrationChecks: Array<[string, RegExp]> = [
  ["event courts are event scoped", /create table public\.event_competition_courts[\s\S]*event_id uuid not null references public\.events/],
  ["event courts support neutral labels", /event_competition_courts[\s\S]*label text not null/],
  ["ClubR court links are optional", /linked_court_id uuid references public\.courts/],
  ["court labels are unique per active event", /event_competition_courts_active_label_unique[\s\S]*event_id, lower\(btrim\(label\)\)/],
  ["duplicate active linked courts are prevented", /event_competition_courts_active_link_unique/],
  ["court order must be positive", /event_competition_courts_order_valid check \(court_order > 0\)/],
  ["court deactivation blocks in-use courts", /deactivate_event_competition_court[\s\S]*competition_court_in_use/],
  ["operations use a separate match table", /create table public\.competition_match_operations/],
  ["one operation row exists per match", /competition_match_operations_match_unique unique \(match_id\)/],
  ["operations reference stable structural matches", /competition_match_operations_match_event_fk[\s\S]*public\.competition_matches\(id, event_id\)/],
  ["court and match event consistency is constrained", /competition_match_operations_court_event_fk[\s\S]*event_competition_courts\(id, event_id\)/],
  ["queue position is persisted", /queue_position integer not null/],
  ["exact start time remains optional", /scheduled_at timestamptz,/],
  ["queue positions are unique and deferrable", /competition_match_operations_court_queue_unique[\s\S]*deferrable initially deferred/],
  ["court exact times are unique and deferrable", /competition_match_operations_court_time_unique[\s\S]*deferrable initially deferred/],
  ["match staff is a separate many-to-many relation", /create table public\.competition_match_staff_assignments/],
  ["staff event consistency is constrained", /competition_match_staff_event_staff_fk[\s\S]*event_staff_assignments\(id, event_id\)/],
  ["duplicate match staff is prevented", /competition_match_staff_unique unique \(match_id, event_staff_assignment_id\)/],
  ["Event Manager and Coordinator reuse competition management authority", /user_can_manage_event_competition\(p_event_id/],
  ["Coach and Official reuse competition read authority", /user_can_view_event_competition\(p_event_id/],
  ["draft cancelled completed archived events reject operations", /event_accepts_competition_operations[\s\S]*event\.status = 'published'[\s\S]*event\.archived_at is null/],
  ["past events reject operations", /event_accepts_competition_operations[\s\S]*coalesce\(event\.ends_at, event\.end_datetime\) >= now\(\)/],
  ["generated structures allow scheduling", /competition\.status in \('generated', 'locked'\)/],
  ["locked structures allow scheduling", /competition\.status in \('generated', 'locked'\)/],
  ["cross-event courts are rejected", /court\.event_id = target_match\.event_id/],
  ["cross-event matches are resolved server-side", /select \* into target_match from public\.competition_matches where id = p_match_id/],
  ["linked courts require compatible organisation access", /organisation_court_access[\s\S]*approved_venue_id = event\.venue_id/],
  ["schedule moves take an event advisory lock", /schedule_competition_match[\s\S]*pg_advisory_xact_lock/],
  ["queue swaps defer uniqueness atomically", /move_competition_match_queue[\s\S]*set constraints public\.competition_match_operations_court_queue_unique deferred/],
  ["unscheduling closes queue gaps", /unschedule_competition_match[\s\S]*set queue_position = queue_position - 1/],
  ["same-court same-time conflicts are rejected", /competition_court_time_conflict/],
  ["same-player same-time conflicts are rejected", /competition_player_time_conflict/],
  ["same-staff same-time conflicts are rejected", /competition_staff_time_conflict/],
  ["downstream exact-time conflicts are rejected", /competition_progression_time_conflict/],
  ["downstream queue conflicts are rejected", /competition_progression_queue_conflict/],
  ["back-to-back matches have no invented duration rule", /other_operation\.scheduled_at = p_scheduled_at/],
  ["exact times stay within event window", /p_scheduled_at < event_start or p_scheduled_at >= event_end/],
  ["only active event staff are eligible", /assignment\.status = 'active'/],
  ["Coach is operationally assignable", /assignment\.event_role in \('coach', 'official'\)/],
  ["Official is operationally assignable", /assignment\.event_role in \('coach', 'official'\)/],
  ["inactive and removed staff are rejected", /competition_match_staff_invalid/],
  ["staff assignment is removable", /create function public\.remove_competition_match_staff/],
  ["operational assignment does not update staff roles", /insert into public\.competition_match_staff_assignments/],
  ["auto-distribution orders by structural sequence", /auto_distribute_competition_matches[\s\S]*order by match\.sequence/],
  ["auto-distribution is deterministic round robin", /court_ids\[\(scheduled_count % court_count\) \+ 1\]/],
  ["auto-distribution does not assign exact times", /insert into public\.competition_match_operations \([\s\S]*event_id, match_id, event_court_id, queue_position,[\s\S]*created_by_user_id/],
  ["structure deletion is protected when operations exist", /competition_matches_protect_operations/],
  ["schedule rows prevent orphan match deletion", /competition_match_operations_match_event_fk[\s\S]*on delete restrict/],
  ["staff rows prevent orphan match deletion", /competition_match_staff_match_event_fk[\s\S]*on delete restrict/],
  ["all new tables enable RLS", /alter table public\.event_competition_courts enable row level security;[\s\S]*alter table public\.competition_match_operations enable row level security;[\s\S]*alter table public\.competition_match_staff_assignments enable row level security/],
  ["authenticated table writes are revoked", /revoke all privileges on table public\.event_competition_courts from public, anon, authenticated, service_role/],
  ["authenticated access is select only", /grant select on table public\.event_competition_courts, public\.competition_match_operations/],
  ["anonymous RPC execution is revoked", /revoke all on function public\.schedule_competition_match[\s\S]*from public, anon, authenticated, service_role/],
  ["mutation RPCs pin an empty search path", /create function public\.schedule_competition_match[\s\S]*security definer[\s\S]*set search_path = ''/],
  ["operations read RPC validates caller authority", /get_event_competition_operations[\s\S]*competition_operations_access/]
];

for (const [name, pattern] of migrationChecks) {
  test(name, () => assert.match(migration, pattern));
}

test("Phase 2C.1 structural table has no operational columns", () => {
  const table = phase2c1.match(/create table public\.competition_matches[\s\S]*?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(table, /event_court_id|queue_position|scheduled_at|event_staff_assignment_id/);
});

test("Phase 2C.1 structural sequence remains the scheduling source", () => assert.match(phase2c1, /sequence integer not null/));
test("event detail exposes a compact Manage Schedule action", () => assert.match(eventPage, /Manage Schedule/));
test("event detail reports court scheduled and unscheduled counts", () => assert.match(eventPage, /active_courts[\s\S]*scheduled_matches[\s\S]*unscheduled/));
test("structure page links to Courts and Schedule", () => assert.match(structurePage, /Courts & Schedule/));
test("structure regeneration shows the operations blocker", () => assert.match(structurePage, /competition_operations_exist/));
test("operations route shows a court-grouped board", () => assert.match(operationsPage, /Courts & Match Schedule[\s\S]*data\.courts\.map/));
test("unscheduled matches remain visible", () => assert.match(operationsPage, /Planning queue[\s\S]*Unscheduled/));
test("operations route exposes My Assignments", () => assert.match(operationsPage, /My Assignments/));
test("court sections use progressive disclosure", () => assert.match(operationsPage, /ui-collapsible/));
test("mobile layout stacks before wide breakpoints", () => assert.match(operationsPage, /grid gap-3[\s\S]*lg:grid-cols-2/));
test("queue move controls are simple up and down actions", () => assert.match(operationsPage, /Move Up[\s\S]*Move Down/));
test("moving between courts reuses the same match schedule form", () => assert.match(operationsPage, /defaultValue=\{match\.event_court_id/));
test("exact start time is optional in UI", () => assert.match(operationsPage, /Start \(optional\)/));
test("SAST is explicit in operations UI", () => assert.match(operationsPage, /SAST/));
test("only managers receive mutation controls", () => assert.match(operationsPage, /data\.can_manage && mutable/));
test("read-only roles receive an explicit explanation", () => assert.match(operationsPage, /Coach and Official access is read-only/));
test("server actions convert local SAST to UTC", () => assert.match(operationsActions, /\$\{value\}:00\+02:00/));
test("operations UI has no score entry control", () => assert.doesNotMatch(operationsPage, /name="score|Save Score|Enter Score/));
test("operations UI has no winner or result mutation", () => assert.doesNotMatch(operationsActions, /winner|result|standing|rating/));
test("legacy event_entries remain isolated", () => assert.doesNotMatch(migration, /alter table public\.event_entries|insert into public\.event_entries|update public\.event_entries/));
test("ClubR court bookings remain isolated", () => assert.doesNotMatch(migration, /insert into public\.court_bookings|update public\.court_bookings|delete from public\.court_bookings/));
test("one fresh migration wraps changes transactionally", () => {
  assert.match(migration, /^-- TeamR Phase 2C\.2/);
  assert.match(migration, /\nbegin;[\s\S]*\ncommit;\s*$/);
});
