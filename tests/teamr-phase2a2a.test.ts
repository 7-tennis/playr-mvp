import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveRankingContext } from "../lib/ranking-scope.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260819080153_teamr_phase2a2a_ranking_context_discovery.sql";
const migration = () => repoFile(migrationPath);
const phase2a2 = () => repoFile("supabase/migrations/20260818193306_teamr_phase2a2_ranking_context_inheritance.sql");

const school = {
  organisation_id: "school-1",
  organisation_name: "Laerskool Kenmare",
  organisation_type: "school",
  ranking_scope: "school" as const
};
const district = {
  organisation_id: "district-1",
  organisation_name: "D2 Tennis",
  organisation_type: "district",
  ranking_scope: "district" as const
};

function cte(sql: string, name: string, nextName: string) {
  return sql.match(new RegExp(`${name} as \\([\\s\\S]*?\\n  \\), ${nextName} as \\(`))?.[0] ?? "";
}

test("a valid public School context does not require an approved publication", () => {
  const context = cte(migration(), "public_organisation_contexts", "inherited_district_contexts");
  assert.match(context, /venue\.status = 'active'/);
  assert.match(context, /venue\.discovery_visibility = 'public'/);
  assert.match(context, /when 'school' then array\['school'\]/);
  assert.doesNotMatch(context, /player_ranking_profiles|publication_status/);
});

test("a valid inherited District context does not require an approved publication", () => {
  const context = cte(migration(), "inherited_district_contexts", "published_legacy_contexts");
  assert.match(context, /relationship\.relationship_type = 'belongs_to'/);
  assert.match(context, /relationship\.status = 'active'/);
  assert.match(context, /school\.discovery_visibility = 'public'/);
  assert.match(context, /district\.status = 'active'/);
  assert.doesNotMatch(context, /player_ranking_profiles|publication_status/);
});

test("pending Juniors remain excluded from public ranking rows", () => {
  const rankingFunction = phase2a2().match(/create function private\.get_public_playr_rankings[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(rankingFunction, /publication\.publication_status = 'approved'/);
  assert.doesNotMatch(migration(), /create or replace function private\.get_public_playr_rankings\(/);
});

test("School context remains selected when its leaderboard is empty", () => {
  assert.deepEqual(resolveRankingContext([school], "school", school.organisation_id), {
    organisation: school,
    scope: "school"
  });
});

test("District context remains selected when its leaderboard is empty", () => {
  assert.deepEqual(resolveRankingContext([district], "district", district.organisation_id), {
    organisation: district,
    scope: "district"
  });
});

test("empty School leaderboards use a contextual published-ranking state", () => {
  const page = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(page, /selectedOrganisation[\s\S]*`No published \$\{rankingCategoryLabel\(category\)\} rankings yet`/);
  assert.match(page, /No eligible published players are currently ranked for/);
});

test("empty District leaderboards use the same contextual empty-state contract", () => {
  const page = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(page, /const emptyStateTitle = selectedOrganisation/);
  assert.match(page, /<EmptyState description=\{emptyStateDescription\}[\s\S]*title=\{emptyStateTitle\}/);
});

test("an approved one-player leaderboard can still produce rank one", () => {
  const sql = phase2a2();
  assert.match(sql, /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(sql, /having\s+count\(\*\)\s*>\s*1/i);
});

test("District ranking rows still derive the represented School", () => {
  const sql = phase2a2();
  assert.match(sql, /string_agg\(distinct context\.school_affiliation/);
  assert.match(repoFile("app/dashboard/rankings/page.tsx"), /row\.school_affiliation/);
});

test("District discovery and ranking require no direct District player link", () => {
  const sql = migration();
  assert.match(sql, /relationship\.child_venue_id = school\.id/);
  assert.match(sql, /district\.id = relationship\.parent_venue_id/);
  assert.doesNotMatch(sql, /insert into public\.organisation_player_links/i);
});

test("safeguarding-hidden players remain excluded from ranking rows", () => {
  const rankingFunction = phase2a2().match(/create function private\.get_public_playr_rankings[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(rankingFunction, /not publication\.safeguarding_hidden/);
});

test("inactive School and District hierarchy cannot create a District context", () => {
  const context = cte(migration(), "inherited_district_contexts", "published_legacy_contexts");
  assert.match(context, /school\.status = 'active'/);
  assert.match(context, /relationship\.status = 'active'/);
  assert.match(context, /district\.status = 'active'/);
});

test("Overall ranking behavior remains in the unchanged canonical RPC", () => {
  assert.match(phase2a2(), /p_scope = 'overall' or ranking_context\.is_eligible/);
  assert.doesNotMatch(migration(), /get_public_playr_rankings\(\n/);
});

test("public Club and Academy contexts may be empty without regressing legacy choices", () => {
  const sql = migration();
  assert.match(sql, /when 'academy' then array\['academy'\]/);
  assert.match(sql, /when 'club_academy' then array\['club', 'academy'\]/);
  assert.match(sql, /published_legacy_contexts as/);
  assert.match(sql, /context\.ranking_scope in \('club', 'academy'\)/);
});

test("hybrid Club discovery retains its existing capability requirement", () => {
  const sql = migration();
  assert.match(sql, /venue\.organisation_type = 'club_academy'/);
  assert.match(sql, /public\.courts court/);
  assert.match(sql, /public\.club_membership_plans plan/);
});

test("Rating and Participation keep the same ranking-row scope predicate", () => {
  const sql = phase2a2();
  assert.match(sql, /when p_metric = 'participation' then profile\.participation_score::numeric/);
  assert.match(sql, /else profile\.junior_rating/);
  assert.equal((sql.match(/p_scope = 'overall' or ranking_context\.is_eligible/g) ?? []).length, 1);
});

test("context discovery returns organisation identity only", () => {
  const signature = migration().match(/returns table \([^)]+\)/)?.[0] ?? "";
  assert.match(signature, /organisation_id uuid/);
  assert.match(signature, /organisation_name text/);
  assert.match(signature, /organisation_type text/);
  assert.match(signature, /ranking_scope text/);
  assert.doesNotMatch(signature, /player|profile|rating|roster|user/);
});

test("Phase 2A.2A changes no tables, RLS, teams, rosters or migration ledger", () => {
  const sql = migration();
  assert.doesNotMatch(sql, /create table|alter table|create policy|alter policy/i);
  assert.doesNotMatch(sql, /teamr_teams|teamr_roster_memberships|supabase_migrations/i);
});
