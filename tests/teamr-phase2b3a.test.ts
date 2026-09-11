import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatJuniorRating, formatRating } from "../lib/courtside-format.ts";

const migrationPath = "supabase/migrations/20260907201004_teamr_phase2b3a_district_players_ranking_staff_access.sql";
const repoFile = (path: string) => readFileSync(path, "utf8");
const migration = () => repoFile(migrationPath);

function functionBody(name: string) {
  return migration().match(new RegExp(`create (?:or replace )?function (?:public|private)\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
}

test("District players derive through active School belongs_to relationships", () => {
  const fn = functionBody("get_teamr_players");
  assert.match(fn, /relationship\.parent_venue_id = target\.id/);
  assert.match(fn, /relationship\.relationship_type = 'belongs_to'/);
  assert.match(fn, /relationship\.status = 'active'/);
  assert.match(fn, /school\.status = 'active'/);
  assert.match(fn, /link\.status = 'active'/);
});

test("District population requires no direct District player link", () => {
  const inherited = functionBody("get_teamr_players").match(/-- District contexts derive[\s\S]*?union all/)?.[0] ?? "";
  assert.match(inherited, /relationship\.child_venue_id/);
  assert.doesNotMatch(inherited, /link\.venue_id = target\.id/);
  assert.doesNotMatch(migration(), /insert into public\.organisation_player_links/);
});

test("multiple School populations are aggregated and canonical players deduplicated", () => {
  const fn = functionBody("get_teamr_players");
  assert.match(fn, /group by candidate\.player_profile_id/);
  assert.match(fn, /string_agg\(distinct candidate\.school_name/);
  assert.match(fn, /join public\.profiles profile[\s\S]*profile\.id = deduplicated\.player_profile_id/);
});

test("School affiliation is exposed by the compact District player UI", () => {
  assert.match(migration(), /school_affiliation text/);
  assert.match(repoFile("app/dashboard/teamr/players/page.tsx"), /player\.schoolAffiliation/);
});

test("District operational players require authenticated TeamR authority", () => {
  const fn = functionBody("get_teamr_players");
  assert.match(fn, /actor_user_id is null[\s\S]*teamr_user_can_manage_teams\(p_venue_id, actor_user_id\)/);
  assert.match(migration(), /revoke all on function public\.get_teamr_players\(uuid, boolean\) from public, anon/);
  assert.match(migration(), /grant execute on function public\.get_teamr_players\(uuid, boolean\) to authenticated/);
});

test("School rosters retain the exact-host player-link path", () => {
  assert.match(repoFile("lib/teamr.ts"), /loadTeamRPlayers\(context, false\)/);
  assert.match(repoFile("app/dashboard/teamr/actions.ts"), /eq\("venue_id", context\.venueId\)/);
});

test("canonical ratings retain two-decimal database storage", () => {
  assert.match(repoFile("supabase/migrations/202606050001_create_ratings_v1.sql"), /rating_value numeric\(4,2\)/);
  assert.match(repoFile("supabase/migrations/202607020001_create_junior_ratings_v1.sql"), /junior_rating numeric\(4,2\)/);
});

test("rating presentation exposes canonical two-decimal precision", () => {
  assert.equal(formatRating(2.5), "2.50");
  assert.equal(formatRating(2.54), "2.54");
  assert.equal(formatJuniorRating("green_ball", 2.5), "Green 2.50");
  assert.match(repoFile("app/dashboard/rankings/page.tsx"), /formatRating\(row\.metric_value\)/);
});

test("ranking sorts the raw canonical value before display formatting", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(fn, /round\(public_rows\.metric_value/);
  assert.ok(2.54 > 2.51);
});

test("true equal ratings preserve dense-rank ties without a hidden tie-breaker", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(fn, /participation_score[^\n]*order by|matches_played[^\n]*order by|ranking_updated_at[^\n]*order by/);
});

test("rating calculation functions remain untouched", () => {
  assert.doesNotMatch(migration(), /create or replace function public\.(apply_verified_match_rating|apply_junior|rating_score_multiplier)/);
  assert.doesNotMatch(migration(), /update public\.(ratings|profiles)[\s\S]*(rating_value|junior_rating)/);
});

test("participation includes zero-point published eligible players", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /p_metric = 'participation' and profile\.participation_score >= 0/);
  assert.doesNotMatch(fn, /participation_score > 0/);
});

test("participation preserves publication and safeguarding gates", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /publication\.publication_status = 'approved'/);
  assert.match(fn, /not publication\.safeguarding_hidden/);
  assert.match(fn, /profile\.member_status <> 'inactive'/);
});

test("School and inherited District ranking share the existing context predicate", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /private\.get_playr_ranking_contexts\(publication\.player_id\)/);
  assert.match(fn, /context\.ranking_scope = p_scope/);
  assert.match(fn, /context\.organisation_id = p_organisation_id/);
  assert.match(repoFile("supabase/migrations/20260818193306_teamr_phase2a2_ranking_context_inheritance.sql"), /relationship\.relationship_type = 'belongs_to'/);
});

test("higher participation points rank higher using the same honest tie semantics", () => {
  const fn = functionBody("get_public_playr_rankings_core");
  assert.match(fn, /when p_metric = 'participation' then profile\.participation_score::numeric/);
  assert.match(fn, /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(fn, /rating_value[^\n]*participation[^\n]*order by/);
});

test("metric switching retains scope and organisation form values", () => {
  const page = repoFile("app/dashboard/rankings/page.tsx");
  const filter = repoFile("components/ranking-scope-filter.tsx");
  assert.match(page, /name="metric"/);
  assert.match(filter, /name="scope"/);
  assert.match(filter, /name="organisation"/);
  assert.match(page, /selectedScope=\{rankingContext\.scope\}/);
  assert.match(page, /selectedOrganisationId=\{selectedOrganisation\?\.organisation_id \?\? null\}/);
});

test("People & Access reuses canonical memberships and invitations", () => {
  const sql = migration();
  assert.match(sql, /from public\.organisation_memberships membership/);
  assert.match(sql, /insert into public\.organisation_invitations/);
  assert.doesNotMatch(sql, /create table/);
  assert.doesNotMatch(sql, /create type/);
});

test("TeamR exposes a compact People & Access destination", () => {
  assert.match(repoFile("app/dashboard/teamr/more/page.tsx"), /People & Access/);
  assert.match(repoFile("app/dashboard/teamr/more/page.tsx"), /\/dashboard\/teamr\/people/);
  assert.match(repoFile("app/dashboard/teamr/people/page.tsx"), /title="People & Access"/);
});

test("Organisation Admin and Sports Coordinator manage operational invitations", () => {
  const fn = functionBody("create_teamr_staff_invitation");
  assert.match(fn, /membership\.role in \('organisation_admin', 'sports_coordinator'\)/);
  assert.match(fn, /venue\.organisation_type in \('school', 'district', 'school_district'\)/);
});

test("Sports Coordinator cannot create an equal or higher coordinator grant", () => {
  const fn = functionBody("create_teamr_staff_invitation");
  assert.match(fn, /actor_role = 'sports_coordinator' and p_intended_role = 'sports_coordinator'/);
  assert.doesNotMatch(fn, /p_intended_role[^\n]*organisation_admin/);
});

test("Team Manager and Coach receive no organisation access mutation authority", () => {
  for (const name of ["create_teamr_staff_invitation", "update_teamr_staff_role", "remove_teamr_staff_membership", "cancel_teamr_staff_invitation"]) {
    const fn = functionBody(name);
    assert.doesNotMatch(fn.match(/membership\.role in \([^)]*\)/)?.[0] ?? "", /team_manager|coach|assistant_coach|head_coach/);
  }
});

test("self-promotion and protected Organisation Admin mutation are rejected", () => {
  const update = functionBody("update_teamr_staff_role");
  const remove = functionBody("remove_teamr_staff_membership");
  assert.match(update, /target\.user_id = actor_user_id/);
  assert.match(update, /target\.role = 'organisation_admin'/);
  assert.match(remove, /target\.user_id = actor_user_id/);
  assert.match(remove, /target\.role = 'organisation_admin'/);
});

test("all access mutations are constrained to the active exact organisation", () => {
  for (const name of ["update_teamr_staff_role", "remove_teamr_staff_membership", "cancel_teamr_staff_invitation"]) {
    assert.match(functionBody(name), /\.venue_id = p_venue_id/);
  }
  assert.doesNotMatch(repoFile("app/dashboard/teamr/people/actions.ts"), /formData, "venueId"|text\(formData, "venue/);
});

test("pending invitations remain separate from active event candidates", () => {
  const people = functionBody("get_teamr_people");
  const candidates = repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql");
  assert.match(people, /invitation\.status = 'pending'/);
  assert.match(candidates, /membership\.status = 'active'/);
  assert.match(candidates, /membership\.user_id is not null/);
});

test("active canonical Coaches remain eligible event staff candidates", () => {
  const candidates = repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql");
  assert.match(candidates, /'head_coach', 'coach', 'assistant_coach'/);
  assert.match(candidates, /profile\.user_id = membership\.user_id/);
});

test("organisation roles remain distinct from event-scoped roles", () => {
  const phase2b2 = repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql");
  assert.match(phase2b2, /source_organisation_membership_id/);
  assert.match(phase2b2, /p_event_role not in \('event_manager', 'coordinator', 'coach', 'official'\)/);
  assert.doesNotMatch(migration(), /alter table public\.event_staff_assignments/);
});

test("ClubR membership handling is not modified", () => {
  assert.doesNotMatch(migration(), /clubr_memberships|membership_applications|membership_subscriptions/);
  assert.doesNotMatch(migration(), /organisation_type in \([^)]*'club'/);
});

test("Phase 2A teams and rosters remain structurally untouched", () => {
  assert.doesNotMatch(migration(), /alter table public\.teamr_teams|alter table public\.teamr_roster_memberships/);
  assert.doesNotMatch(migration(), /insert into public\.teamr_teams|insert into public\.teamr_roster_memberships/);
});

test("new definer RPCs pin search_path and expose authenticated execution only", () => {
  for (const name of ["get_teamr_players", "get_public_playr_rankings_core", "get_teamr_people", "create_teamr_staff_invitation", "update_teamr_staff_role", "remove_teamr_staff_membership", "cancel_teamr_staff_invitation"]) {
    assert.match(functionBody(name), /security definer[\s\S]*set search_path = ''/);
  }
  assert.doesNotMatch(migration(), /grant execute[^\n]*to anon/);
});

test("TeamR Players and People clients match the deployed migration RPC contracts", () => {
  const teamr = repoFile("lib/teamr.ts");
  assert.match(teamr, /rpc\("get_teamr_players", \{[\s\S]*?p_include_inherited: includeInherited,[\s\S]*?p_venue_id: context\.venueId[\s\S]*?\}\)/);
  assert.match(teamr, /rpc\("get_teamr_people", \{ p_venue_id: context\.venueId \}\)/);
  assert.match(migration(), /create function public\.get_teamr_players\(\s*p_venue_id uuid,\s*p_include_inherited boolean default true\s*\)/);
  assert.match(migration(), /create function public\.get_teamr_people\(p_venue_id uuid\)/);
});

test("TeamR read failures stay explicit instead of being presented as authoritative empty data", () => {
  const teamr = repoFile("lib/teamr.ts");
  const playersPage = repoFile("app/dashboard/teamr/players/page.tsx");
  const peoplePage = repoFile("app/dashboard/teamr/people/page.tsx");
  assert.match(teamr, /error: "TeamR player data could not be loaded\."/);
  assert.match(teamr, /error: "People and access could not be loaded\."/);
  assert.match(playersPage, /No player records were assumed/);
  assert.match(peoplePage, /result\.error \?/);
});

test("MyPlayR and public participation rankings use the same canonical profile score", () => {
  const dashboard = repoFile("app/dashboard/page.tsx");
  const rankingCore = functionBody("get_public_playr_rankings_core");
  assert.match(dashboard, /participation_score/);
  assert.match(rankingCore, /when p_metric = 'participation' then profile\.participation_score::numeric/);
  assert.doesNotMatch(rankingCore, /event_results|event_player_assignments/);
});

test("Phase 2B.4 and tournament operations remain deferred", () => {
  assert.doesNotMatch(migration(), /create table[^;]*(notification|draw|fixture|attendance|check_in|standing)/i);
  assert.doesNotMatch(repoFile("app/dashboard/teamr/people/page.tsx"), /send email|push notification|message centre/i);
});
