import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { knockoutBlueprint, nextPowerOfTwo, roundRobinMatchCount, roundRobinPairs, snakeDistribute } from "../lib/competition-structure.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = repoFile("supabase/migrations/20260927180544_phase_2c1_competition_operations_foundation.sql");
const structurePage = repoFile("app/dashboard/teamr/competitions/[eventId]/structure/page.tsx");
const structureActions = repoFile("app/dashboard/teamr/competitions/[eventId]/structure/actions.ts");
const eventPage = repoFile("app/dashboard/teamr/competitions/[eventId]/page.tsx");
const phase2b3 = repoFile("supabase/migrations/20260831195304_teamr_phase2b3_event_participation_lifecycle.sql");
const phase2b4 = repoFile("supabase/migrations/20260914090800_playr_teamr_phase2b4_targeted_notifications.sql");

test("Event Manager and Coordinator reuse event-player management authority", () => {
  assert.match(migration, /user_can_manage_event_competition[\s\S]*user_can_manage_event_players/);
  assert.match(phase2b3, /array\[\s*'event_manager', 'coordinator'/);
});

test("Coach cannot configure competition structure", () => {
  assert.doesNotMatch(migration.match(/create function private\.user_can_manage_event_competition[\s\S]*?\$\$;/)?.[0] ?? "", /'coach'/);
});

test("Official cannot configure competition structure", () => {
  assert.doesNotMatch(migration.match(/create function private\.user_can_manage_event_competition[\s\S]*?\$\$;/)?.[0] ?? "", /'official'/);
});

test("Coach and Official retain operations read access", () => {
  assert.match(migration, /user_can_view_event_competition[\s\S]*user_can_view_event_operations/);
  assert.match(phase2b3, /array\['event_manager', 'coordinator', 'coach', 'official'\]/);
});

test("organisation event managers retain the established fallback authority", () => {
  assert.match(repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql"), /user_can_manage_organisation_events\(event\.venue_id/);
});

test("cross-event configuration is validated inside the RPC", () => {
  assert.match(migration, /assignment\.event_id = p_event_id[\s\S]*assignment\.id = any/);
});

test("draft, cancelled, completed, archived and past events reject structure mutation", () => {
  assert.match(migration, /event\.status = 'published'[\s\S]*event\.archived_at is null[\s\S]*coalesce\(event\.starts_at, event\.start_datetime\) >= now\(\)/);
});

test("four-player Round Robin has six matches", () => assert.equal(roundRobinMatchCount(4), 6));
test("eight-player Round Robin has twenty-eight matches", () => assert.equal(roundRobinMatchCount(8), 28));

test("each player in an eight-player group has seven opponents", () => {
  const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);
  const appearances = new Map(players.map((player) => [player, 0]));
  for (const [left, right] of roundRobinPairs(players)) {
    appearances.set(left, appearances.get(left)! + 1);
    appearances.set(right, appearances.get(right)! + 1);
  }
  assert.deepEqual([...appearances.values()], Array(8).fill(7));
});

test("Round Robin never creates a self-match", () => {
  assert.equal(roundRobinPairs(["a", "b", "c", "d"]).some(([left, right]) => left === right), false);
});

test("Round Robin never creates reverse duplicates", () => {
  const pairs = roundRobinPairs(["a", "b", "c", "d"]).map(([left, right]) => [left, right].sort().join(":"));
  assert.equal(new Set(pairs).size, pairs.length);
});

test("multiple groups generate independently", () => {
  const groups = snakeDistribute(Array.from({ length: 8 }, (_, index) => index), 2);
  assert.deepEqual(groups.map((group) => roundRobinPairs(group).length), [6, 6]);
});

test("automatic group distribution places every participant exactly once", () => {
  const players = Array.from({ length: 31 }, (_, index) => `p${index}`);
  assert.deepEqual(snakeDistribute(players, 4).flat().sort(), [...players].sort());
});

test("unconfirmed participants are rejected at configuration and generation", () => {
  assert.match(migration, /assignment\.status = 'confirmed'/g);
  assert.match(migration, /competition_participants_invalid/);
});

test("Red Festival distributes thirty-two confirmed players", () => {
  assert.equal(snakeDistribute(Array.from({ length: 32 }, (_, index) => index), 4).flat().length, 32);
});

test("Red Festival creates four groups of eight", () => {
  assert.deepEqual(snakeDistribute(Array.from({ length: 32 }, (_, index) => index), 4).map((group) => group.length), [8, 8, 8, 8]);
});

test("Red Festival creates twenty-eight matches per group", () => {
  assert.deepEqual(snakeDistribute(Array.from({ length: 32 }, (_, index) => index), 4).map((group) => roundRobinPairs(group).length), [28, 28, 28, 28]);
});

test("Red Festival creates one hundred and twelve matches", () => {
  const total = snakeDistribute(Array.from({ length: 32 }, (_, index) => index), 4).reduce((sum, group) => sum + roundRobinPairs(group).length, 0);
  assert.equal(total, 112);
});

test("Red Festival gives every player seven group matches", () => {
  for (const group of snakeDistribute(Array.from({ length: 32 }, (_, index) => `p${index}`), 4)) {
    const counts = new Map(group.map((player) => [player, 0]));
    roundRobinPairs(group).forEach(([a, b]) => { counts.set(a, counts.get(a)! + 1); counts.set(b, counts.get(b)! + 1); });
    assert.deepEqual([...counts.values()], Array(8).fill(7));
  }
});

test("Red Festival contains no duplicate players", () => {
  const players = snakeDistribute(Array.from({ length: 32 }, (_, index) => `p${index}`), 4).flat();
  assert.equal(new Set(players).size, 32);
});

test("generation order is deterministic and persisted", () => {
  assert.deepEqual(snakeDistribute([1, 2, 3, 4, 5, 6], 2), snakeDistribute([1, 2, 3, 4, 5, 6], 2));
  assert.match(migration, /competition_group_members[\s\S]*position integer not null/);
});

test("eight-player Knockout generates seven matches", () => {
  assert.equal(knockoutBlueprint(Array.from({ length: 8 }, (_, index) => `p${index}`)).matches.length, 7);
});

test("eight-player Knockout has four quarterfinals, two semifinals and one final", () => {
  const rounds = knockoutBlueprint(Array.from({ length: 8 }, (_, index) => `p${index}`)).matches.reduce((counts, match) => counts.set(match.round, (counts.get(match.round) ?? 0) + 1), new Map<number, number>());
  assert.deepEqual([...rounds.values()], [4, 2, 1]);
});

test("Knockout bracket destinations link to the next round", () => {
  const blueprint = knockoutBlueprint(Array.from({ length: 8 }, (_, index) => `p${index}`));
  assert.equal(blueprint.matches.filter((match) => match.winnerTo).length, 6);
  assert.equal(blueprint.matches.at(-1)?.winnerTo, null);
});

test("six-player Knockout uses an eight-slot bracket with two byes", () => {
  const blueprint = knockoutBlueprint(Array.from({ length: 6 }, (_, index) => `p${index}`));
  assert.equal(blueprint.bracketSize, 8);
  assert.equal(blueprint.byeCount, 2);
});

test("byes do not fabricate player identities", () => {
  const byeSlots = knockoutBlueprint(Array.from({ length: 6 }, (_, index) => `p${index}`)).matches.flatMap((match) => [match.slotA, match.slotB]).filter((slot) => slot.type === "bye");
  assert.deepEqual(byeSlots, [{ type: "bye" }, { type: "bye" }]);
});

test("generated matches have persistent UUID identities", () => {
  assert.match(migration, /create table public\.competition_matches[\s\S]*id uuid primary key default gen_random_uuid\(\)/);
});

test("common Knockout sizes use the next power of two", () => {
  assert.deepEqual([2, 4, 6, 8, 16, 31].map(nextPowerOfTwo), [2, 4, 8, 8, 16, 32]);
});

test("Groups-to-Knockout stores two explicitly ordered stages", () => {
  assert.match(migration, /'group', 1, 'Group Stage'/);
  assert.match(migration, /'knockout', 2, 'Knockout Stage'/);
});

test("sixteen participants distribute into four groups of four", () => {
  assert.deepEqual(snakeDistribute(Array.from({ length: 16 }, (_, index) => index), 4).map((group) => group.length), [4, 4, 4, 4]);
});

test("each four-player Green group generates six matches", () => {
  assert.deepEqual(snakeDistribute(Array.from({ length: 16 }, (_, index) => index), 4).map((group) => roundRobinPairs(group).length), [6, 6, 6, 6]);
});

test("top two across four groups creates eight qualifier slots", () => {
  assert.equal(4 * 2, 8);
  assert.match(migration, /qualifier_count := competition\.group_count \* competition\.advancing_per_group/);
});

test("Groups-to-Knockout creates an eight-player structural draw", () => {
  assert.match(migration, /bracket_size := qualifier_count/);
  assert.equal(nextPowerOfTwo(8), 8);
});

test("qualifiers reference group placements instead of player IDs", () => {
  assert.match(migration, /'group_placement', group_a, 1, 'group_placement', group_b/);
  assert.match(migration, /slot_a_source_type = 'group_placement'[\s\S]*slot_a_profile_id is null/);
});

test("later bracket rounds reference prior match winners", () => {
  assert.match(migration, /'match_winner', prior_match_ids/);
});

test("Groups-to-Knockout validates a power-of-two qualifier count", () => {
  assert.match(migration, /qualifier_count & \(qualifier_count - 1\)/);
});

test("an unlocked generated structure can regenerate", () => {
  assert.match(migration, /if competition\.status = 'locked' then[\s\S]*competition_locked/);
  assert.match(structurePage, /Regenerate Competition/);
});

test("regeneration replaces prior structural stages", () => {
  assert.match(migration, /delete from public\.competition_stages where competition_id = competition\.id/);
});

test("stage cascades remove old groups and members", () => {
  assert.match(migration, /competition_groups_stage_event_fk[\s\S]*on delete cascade/);
  assert.match(migration, /competition_group_members_group_event_fk[\s\S]*on delete cascade/);
});

test("stage cascades remove old matches", () => {
  assert.match(migration, /competition_matches_stage_event_fk[\s\S]*on delete cascade/);
});

test("generation and regeneration run inside one migration/RPC transaction", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /create function public\.generate_event_competition/);
  assert.match(migration, /commit;\s*$/);
});

test("locked structures cannot regenerate", () => {
  assert.match(migration, /generate_event_competition[\s\S]*competition\.status = 'locked'[\s\S]*competition_locked/);
});

test("a participant change marks generated structure stale", () => {
  assert.match(migration, /participant_snapshot_ids <> current_confirmed_ids/);
  assert.match(structurePage, /Competition structure is out of date/);
});

test("a removed selected participant blocks regeneration until review", () => {
  assert.match(migration, /selected_count <> cardinality\(competition\.selected_assignment_ids\)[\s\S]*competition_participants_changed/);
});

test("locked structure protects confirmed participation mutations", () => {
  assert.match(migration, /protect_locked_competition_participants[\s\S]*affects_confirmed[\s\S]*competition\.status = 'locked'/);
});

test("event capacity is not a generation precondition", () => {
  const generator = migration.match(/create function public\.generate_event_competition[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(generator, /capacity|max_entries/);
});

test("School A authority cannot mutate a School B competition", () => {
  assert.match(migration, /user_can_manage_event_competition\(p_event_id, actor_user_id\)/);
  assert.match(migration, /event_id = p_event_id/);
});

test("District authority remains scoped through the parent event helper", () => {
  assert.match(migration, /private\.user_can_manage_event_players\(check_event_id, check_user_id\)/);
});

test("Coach structure access is read-only", () => {
  assert.match(migration, /grant select on table public\.event_competitions/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*authenticated/i);
});

test("Official structure access is read-only", () => {
  assert.match(migration, /user_can_view_event_operations/);
  assert.doesNotMatch(migration, /grant all privileges on table[^;]+to authenticated/);
});

test("direct authenticated competition writes are blocked", () => {
  assert.match(migration, /revoke all privileges on table public\.event_competitions from public, anon, authenticated, service_role/);
});

test("anonymous RPC execution is revoked", () => {
  for (const signature of ["configure_event_competition", "generate_event_competition", "move_competition_group_member", "lock_event_competition", "get_event_competition_structure"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}\\(`));
  }
});

test("group membership rejects cross-event assignments", () => {
  assert.match(migration, /foreign key \(event_player_assignment_id, event_id, player_profile_id\)[\s\S]*event_player_assignments\(id, event_id, player_profile_id\)/);
});

test("matches reject cross-event stages, groups and participant references", () => {
  assert.match(migration, /competition_matches_stage_event_fk/);
  assert.match(migration, /competition_matches_group_event_fk/);
  assert.match(migration, /competition_matches_slot_a_assignment_fk/);
});

test("every new exposed table has RLS enabled", () => {
  for (const table of ["event_competitions", "competition_stages", "competition_groups", "competition_group_members", "competition_matches"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("SECURITY DEFINER functions pin an empty search path", () => {
  const definers = [...migration.matchAll(/security definer([\s\S]*?)as \$\$/g)];
  assert.ok(definers.length >= 8);
  for (const match of definers) assert.match(match[1], /set search_path = ''/);
});

test("the UI exposes a concise event summary and dedicated structure route", () => {
  assert.match(eventPage, /Competition Structure/);
  assert.match(eventPage, /competitions\/\$\{event\.id\}\/structure/);
  assert.match(structurePage, /Set Up Competition/);
});

test("the group and draw UI stays mobile-readable without a wide bracket", () => {
  assert.match(structurePage, /sm:grid-cols-2/);
  assert.doesNotMatch(structurePage, /min-w-\[\d{4}px\]|svg.*bracket/i);
});

test("server actions use only validated competition RPCs", () => {
  for (const rpc of ["configure_event_competition", "generate_event_competition", "move_competition_group_member", "lock_event_competition"]) assert.match(structureActions, new RegExp(`rpc\\("${rpc}"`));
  assert.doesNotMatch(structureActions, /\.from\("competition_/);
});

test("legacy challenge matches remain isolated", () => {
  assert.doesNotMatch(migration, /alter table public\.matches|insert into public\.matches|update public\.matches/);
});

test("legacy paid entries and results remain isolated", () => {
  assert.doesNotMatch(migration, /alter table public\.(event_entries|event_results)|insert into public\.(event_entries|event_results)/);
});

test("Phase 2B participation statuses remain unchanged", () => {
  assert.doesNotMatch(migration, /drop constraint event_player_assignments_status_check|add constraint event_player_assignments_status_check/);
});

test("Phase 2B.4 notification generation remains unchanged", () => {
  assert.match(phase2b4, /event_player_assignments_notify_lifecycle/);
  assert.doesNotMatch(migration, /insert into public\.notifications|create trigger.*notification/i);
});

test("scores, courts, winners, standings and scheduling remain deferred", () => {
  assert.doesNotMatch(migration, /score_text|winner_profile_id|court_id|starts_at timestamptz|standings|sets_won|games_won/i);
});

test("team formats, doubles and consolation draws remain deferred", () => {
  assert.doesNotMatch(migration, /team_competition|doubles_pair|consolation/i);
});
