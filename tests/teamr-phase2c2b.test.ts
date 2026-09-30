import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCompetitionSchedule,
  CompetitionScheduleError,
  type ScheduleMatch
} from "../lib/competition-scheduler.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = repoFile("supabase/migrations/20260930160000_phase_2c2b_automated_competition_scheduler.sql");
const planner = repoFile("lib/competition-scheduler.ts");
const actions = repoFile("app/dashboard/teamr/competitions/[eventId]/operations/actions.ts");
const page = repoFile("app/dashboard/teamr/competitions/[eventId]/operations/page.tsx");

const migrationChecks: Array<[string, RegExp]> = [
  ["one neutral settings table persists generation inputs", /create table public\.competition_schedule_settings/],
  ["settings support timed and queue modes", /mode text not null check \(mode in \('timed', 'queue'\)\)/],
  ["duration is bounded", /match_duration_minutes between 5 and 180/],
  ["rest is bounded", /minimum_rest_minutes between 0 and 240/],
  ["generation lifecycle supports generated adjusted and stale", /generation_status in \('generated', 'adjusted', 'stale'\)/],
  ["settings preserve structure version", /structure_version integer not null/],
  ["generated identity and time are persisted", /generated_at timestamptz not null[\s\S]*generated_by_user_id uuid not null/],
  ["estimated finish is persisted", /estimated_finish timestamptz/],
  ["selected court IDs are persisted", /active_court_ids uuid\[\] not null/],
  ["logical wave is added to operational rows", /add column schedule_wave integer/],
  ["wave values are positive", /schedule_wave is null or schedule_wave > 0/],
  ["court changes mark schedules stale", /event_competition_courts_mark_schedule_stale/],
  ["structure version changes mark schedules stale", /event_competitions_mark_schedule_stale/],
  ["manual operation changes mark schedules adjusted", /competition_match_operations_mark_schedule_adjusted/],
  ["input RPC is manager only", /get_event_competition_schedule_input[\s\S]*user_can_manage_event_competition/],
  ["input RPC exposes stable participant IDs", /'playerIds'[\s\S]*slot_a_profile_id/],
  ["input RPC exposes feeder IDs", /'sourceMatchIds'[\s\S]*slot_a_source_match_id/],
  ["input RPC exposes stage order", /'stageOrder', stage\.stage_order/],
  ["input RPC exposes existing staff", /'staffUserIds'[\s\S]*competition_match_staff_assignments/],
  ["primary mutation is one generation RPC", /create function public\.generate_event_competition_schedule/],
  ["generation reuses event management authority", /generate_event_competition_schedule[\s\S]*user_can_manage_event_competition/],
  ["generated and locked structures are supported", /competition\.status not in \('generated', 'locked'\)/],
  ["closed events reuse the Phase 2C.2 lifecycle gate", /event_accepts_competition_operations/],
  ["generation takes an event transaction lock", /generate_event_competition_schedule[\s\S]*pg_advisory_xact_lock/],
  ["existing schedules require confirmation", /competition_schedule_confirmation_required/],
  ["default courts are inserted inside generation transaction", /insert into public\.event_competition_courts/],
  ["cross-event courts are rejected", /court\.event_id <> p_event_id/],
  ["inactive courts are rejected", /or not court\.active/],
  ["every structural match is required", /plan_count <> structural_count/],
  ["one plan row per match is enforced", /phase2c2b_plan \([\s\S]*match_id uuid primary key/],
  ["court queue positions are unique", /group by event_court_id, queue_position having count\(\*\) > 1/],
  ["one match per court wave is enforced", /group by event_court_id, wave having count\(\*\) > 1/],
  ["timed mode requires exact times", /schedule_mode = 'timed'[\s\S]*scheduled_at is null/],
  ["queue mode forbids fabricated times", /schedule_mode = 'queue'[\s\S]*scheduled_at is not null/],
  ["timed slots align to configured duration", /extract\(epoch from \(scheduled_at - schedule_start\)\)/],
  ["player wave collisions are rejected", /group by plan\.wave, player_id having count\(\*\) > 1/],
  ["staff wave collisions are rejected", /group by plan\.wave, event_staff\.staff_user_id having count\(\*\) > 1/],
  ["minimum rest is revalidated", /competition_player_rest_conflict/],
  ["feeder waves precede downstream waves", /feeder\.wave >= downstream\.wave/],
  ["group stages precede qualifier placeholders", /slot_a_source_type = 'group_placement'[\s\S]*earlier_stage\.stage_order < stage\.stage_order/],
  ["atomic replacement deletes then inserts in one RPC", /delete from public\.competition_match_operations[\s\S]*insert into public\.competition_match_operations/],
  ["the validation RPC reports all hard conflict classes", /'unscheduled_matches'[\s\S]*'player_conflicts'[\s\S]*'court_conflicts'[\s\S]*'staff_conflicts'[\s\S]*'dependency_conflicts'[\s\S]*'event_window_conflicts'/],
  ["settings table enables RLS", /alter table public\.competition_schedule_settings enable row level security/],
  ["authenticated settings access is read only", /grant select on table public\.competition_schedule_settings to authenticated/],
  ["anonymous generation is revoked", /revoke all on function public\.generate_event_competition_schedule[\s\S]*from public, anon/],
  ["generation is granted only to authenticated and service role", /grant execute on function public\.generate_event_competition_schedule[\s\S]*to authenticated, service_role/],
  ["security definer functions pin an empty search path", /generate_event_competition_schedule[\s\S]*security definer[\s\S]*set search_path = ''/],
  ["migration remains isolated from legacy event entries", /^(?![\s\S]*(?:alter|insert into|update|delete from) public\.event_entries)/],
  ["migration remains isolated from ClubR bookings", /^(?![\s\S]*(?:insert into|update|delete from) public\.court_bookings)/],
  ["migration is transactional", /\nbegin;[\s\S]*\ncommit;\s*$/]
];

for (const [name, pattern] of migrationChecks) test(name, () => assert.match(migration, pattern));

const courts = [
  { id: "court-1", label: "Court 1", order: 1 },
  { id: "court-2", label: "Court 2", order: 2 }
];
const timed = { mode: "timed" as const, startAt: "2030-01-01T07:00:00.000Z", eventEndAt: "2030-01-01T18:00:00.000Z", matchDurationMinutes: 20, minimumRestMinutes: 0 };

function match(id: string, players: string[], extra: Partial<ScheduleMatch> = {}): ScheduleMatch {
  return { id, groupOrder: 1, hasGroupPlacementSource: false, playerIds: players, roundNumber: 1, sequence: Number(id.replace(/\D/g, "")) || 1, sourceMatchIds: [], staffUserIds: [], stageOrder: 1, ...extra };
}

function roundRobin(prefix: string, playerCount: number, groupOrder = 1) {
  const result: ScheduleMatch[] = [];
  let sequence = 1;
  for (let left = 0; left < playerCount; left += 1) for (let right = left + 1; right < playerCount; right += 1) {
    result.push(match(`${prefix}-${sequence}`, [`${prefix}-p${left}`, `${prefix}-p${right}`], { groupOrder, sequence }));
    sequence += 1;
  }
  return result;
}

test("two courts generate parallel timed slots", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"]), match("m2", ["c", "d"])], courts, timed);
  assert.equal(new Set(plan.operations.map((row) => row.scheduled_at)).size, 1);
  assert.equal(new Set(plan.operations.map((row) => row.event_court_id)).size, 2);
});
test("match duration determines slot starts", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"]), match("m2", ["a", "c"])], courts, timed);
  assert.equal(new Date(plan.operations[1].scheduled_at!).getTime() - new Date(plan.operations[0].scheduled_at!).getTime(), 20 * 60_000);
});
test("configured start time is respected", () => assert.equal(buildCompetitionSchedule([match("m1", ["a", "b"])], courts, timed).operations[0].scheduled_at, timed.startAt));
test("named regression: Player A is never on Court 1 and Court 2 in one slot", () => {
  const plan = buildCompetitionSchedule([match("m1", ["A", "B"]), match("m2", ["A", "C"]), match("m3", ["D", "E"])], courts, timed);
  const playerATimes = plan.operations.filter((row) => ["m1", "m2"].includes(row.match_id)).map((row) => row.scheduled_at);
  assert.equal(new Set(playerATimes).size, 2);
});
test("court cannot be double booked in one wave", () => {
  const plan = buildCompetitionSchedule(roundRobin("g", 4), courts, timed);
  assert.equal(new Set(plan.operations.map((row) => `${row.event_court_id}:${row.wave}`)).size, plan.operations.length);
});
test("minimum rest zero permits the next slot", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"]), match("m2", ["a", "c"])], courts, timed);
  assert.equal(plan.operations[1].wave, 2);
});
test("one-duration rest forces one empty player slot", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"]), match("m2", ["a", "c"])], courts, { ...timed, minimumRestMinutes: 20 });
  assert.equal(plan.operations[1].wave, 3);
});
test("same inputs generate the same deterministic plan", () => {
  const fixture = roundRobin("g", 8);
  assert.deepEqual(buildCompetitionSchedule(fixture, courts, timed), buildCompetitionSchedule(fixture, courts, timed));
});
test("estimated finish follows the last wave", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"]), match("m2", ["a", "c"])], courts, timed);
  assert.equal(plan.estimatedFinish, "2030-01-01T07:40:00.000Z");
});
test("four-player round robin is collision free", () => {
  const fixture = roundRobin("g", 4);
  const plan = buildCompetitionSchedule(fixture, courts, timed);
  for (const wave of new Set(plan.operations.map((row) => row.wave))) {
    const players = plan.operations.filter((row) => row.wave === wave).flatMap((row) => fixture.find((item) => item.id === row.match_id)!.playerIds);
    assert.equal(new Set(players).size, players.length);
  }
});
test("four-player logical waves use both courts", () => assert.equal(new Set(buildCompetitionSchedule(roundRobin("g", 4), courts, timed).operations.map((row) => row.event_court_id)).size, 2));
test("eight-player round robin has no collision", () => {
  const fixture = roundRobin("g", 8);
  const plan = buildCompetitionSchedule(fixture, [{ ...courts[0] }, { ...courts[1] }, { id: "c3", label: "Court 3", order: 3 }, { id: "c4", label: "Court 4", order: 4 }], timed);
  for (const wave of new Set(plan.operations.map((row) => row.wave))) {
    const players = plan.operations.filter((row) => row.wave === wave).flatMap((row) => fixture.find((item) => item.id === row.match_id)!.playerIds);
    assert.equal(new Set(players).size, players.length);
  }
});
test("multiple groups share the first wave", () => {
  const fixture = [...roundRobin("a", 4, 1), ...roundRobin("b", 4, 2)];
  const plan = buildCompetitionSchedule(fixture, courts, timed);
  const first = plan.operations.filter((row) => row.wave === 1).map((row) => fixture.find((item) => item.id === row.match_id)!.groupOrder);
  assert.deepEqual(new Set(first), new Set([1, 2]));
});
test("queue mode generates no exact times", () => {
  const plan = buildCompetitionSchedule(roundRobin("g", 4), courts, { ...timed, mode: "queue", startAt: null, matchDurationMinutes: null });
  assert.ok(plan.operations.every((row) => row.scheduled_at === null));
  assert.equal(plan.estimatedFinish, null);
});
test("queue positions are unique per court", () => {
  const plan = buildCompetitionSchedule(roundRobin("g", 8), courts, { ...timed, mode: "queue", startAt: null, matchDurationMinutes: null });
  assert.equal(new Set(plan.operations.map((row) => `${row.event_court_id}:${row.queue_position}`)).size, plan.operations.length);
});
test("queue court loads stay reasonably balanced", () => {
  const usage = buildCompetitionSchedule(roundRobin("g", 8), courts, { ...timed, mode: "queue", startAt: null, matchDurationMinutes: null }).courtUsage.map((row) => row.matches);
  assert.ok(Math.max(...usage) - Math.min(...usage) <= 1);
});
test("feeder matches precede downstream match", () => {
  const fixture = [match("m1", ["a", "b"]), match("m2", ["c", "d"]), match("m3", [], { groupOrder: null, roundNumber: 2, sourceMatchIds: ["m1", "m2"] })];
  const plan = buildCompetitionSchedule(fixture, courts, timed);
  assert.ok(plan.operations.find((row) => row.match_id === "m3")!.wave > Math.max(...plan.operations.filter((row) => row.match_id !== "m3").map((row) => row.wave)));
});
test("group qualification placeholder waits for all group matches", () => {
  const fixture = [...roundRobin("g", 4), match("k1", [], { groupOrder: null, hasGroupPlacementSource: true, stageOrder: 2 })];
  const plan = buildCompetitionSchedule(fixture, courts, timed);
  assert.ok(plan.operations.find((row) => row.match_id === "k1")!.wave > Math.max(...plan.operations.filter((row) => row.match_id !== "k1").map((row) => row.wave)));
});
test("placeholder identity remains unknown", () => {
  const placeholder = match("k1", [], { groupOrder: null, hasGroupPlacementSource: true, stageOrder: 2 });
  assert.deepEqual(placeholder.playerIds, []);
});
test("existing staff cannot be simultaneous", () => {
  const plan = buildCompetitionSchedule([match("m1", ["a", "b"], { staffUserIds: ["official"] }), match("m2", ["c", "d"], { staffUserIds: ["official"] })], courts, timed);
  assert.notEqual(plan.operations[0].wave, plan.operations[1].wave);
});
test("32-player four-group 112-match fixture schedules automatically", () => {
  const fixture = [1, 2, 3, 4].flatMap((group) => roundRobin(`g${group}`, 8, group));
  const fourCourts = [1, 2, 3, 4].map((order) => ({ id: `c${order}`, label: `Court ${order}`, order }));
  const plan = buildCompetitionSchedule(fixture, fourCourts, { ...timed, eventEndAt: "2030-01-03T18:00:00.000Z" });
  assert.equal(plan.operations.length, 112);
  assert.equal(new Set(plan.operations.map((row) => row.match_id)).size, 112);
  const loads = plan.courtUsage.map((row) => row.matches);
  assert.ok(Math.max(...loads) - Math.min(...loads) <= 1);
});
test("impossible event window returns actionable failure", () => {
  assert.throws(() => buildCompetitionSchedule(roundRobin("g", 8), courts, { ...timed, eventEndAt: "2030-01-01T07:20:00.000Z" }), (error) => error instanceof CompetitionScheduleError && error.code === "competition_schedule_event_window_conflict");
});
test("missing courts are rejected", () => assert.throws(() => buildCompetitionSchedule([match("m1", ["a", "b"])], [], timed), /active court/));
test("invalid duration is rejected", () => assert.throws(() => buildCompetitionSchedule([match("m1", ["a", "b"])], courts, { ...timed, matchDurationMinutes: 0 }), /5–180/));
test("missing feeder identity is rejected", () => assert.throws(() => buildCompetitionSchedule([match("m1", [], { sourceMatchIds: ["missing"] })], courts, timed), /feeder match is missing/));
test("cyclic queue dependencies fail within a bound", () => {
  const fixture = [match("m1", [], { sourceMatchIds: ["m2"] }), match("m2", [], { sourceMatchIds: ["m1"] })];
  assert.throws(() => buildCompetitionSchedule(fixture, courts, { ...timed, mode: "queue", startAt: null, matchDurationMinutes: null }), /cannot form a safe running order/);
});

test("planner is bounded rather than exponential", () => assert.match(planner, /maxWaves = matches\.length \* \(dependencyWaveGap \+ 1\) \+ 1/));
test("server action performs planning outside React client code", () => assert.match(actions, /buildCompetitionSchedule/));
test("server action calls the authorised atomic generation RPC", () => assert.match(actions, /generate_event_competition_schedule/));
test("new default court IDs are supplied to the transaction", () => assert.match(actions, /crypto\.randomUUID/));
test("automatic scheduling is the primary UI action", () => assert.match(page, /PlayR automatic scheduling[\s\S]*Generate Schedule/));
test("manual controls are labelled advanced", () => assert.match(page, /Advanced \/ Adjust Schedule/));
test("regeneration requires explicit UI confirmation", () => assert.match(page, /confirmReplace[\s\S]*required/));
test("review summary shows every hard conflict count", () => assert.match(page, /unscheduled_matches[\s\S]*player_conflicts[\s\S]*court_conflicts[\s\S]*staff_conflicts[\s\S]*dependency_conflicts[\s\S]*event_window_conflicts/));
test("score entry remains absent", () => assert.doesNotMatch(`${migration}\n${actions}\n${page}`, /Save Score|name="score"|record_match_result/));
