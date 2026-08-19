import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  organisationMatchesRankingScope,
  rankingContextHref,
  rankingOrganisationsForScope,
  resolveRankingContext
} from "../lib/ranking-scope.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260818193306_teamr_phase2a2_ranking_context_inheritance.sql";
const migration = () => repoFile(migrationPath);

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

test("School Rankings links preserve School and Green context", () => {
  assert.equal(
    rankingContextHref({ category: "green", organisationId: school.organisation_id, scope: "school" }),
    "/dashboard/rankings?organisation=school-1&scope=school&category=green"
  );
});

test("an allowed School remains the visibly selected School context", () => {
  assert.deepEqual(resolveRankingContext([school], "school", school.organisation_id), {
    organisation: school,
    scope: "school"
  });
});

test("District Rankings links preserve District and Green context", () => {
  assert.equal(
    rankingContextHref({ category: "green", organisationId: district.organisation_id, scope: "district" }),
    "/dashboard/rankings?organisation=district-1&scope=district&category=green"
  );
});

test("an inherited District remains the visibly selected District context", () => {
  assert.deepEqual(resolveRankingContext([district], "district", district.organisation_id), {
    organisation: district,
    scope: "district"
  });
});

test("scope validation rejects mismatched and unknown organisation context", () => {
  assert.deepEqual(resolveRankingContext([school, district], "district", school.organisation_id), {
    organisation: null,
    scope: "overall"
  });
  assert.deepEqual(resolveRankingContext([school, district], "school", "unknown"), {
    organisation: null,
    scope: "overall"
  });
});

test("hybrid organisations may be represented independently in School and District scope", () => {
  const hybridSchool = { organisation_id: "hybrid-1", organisation_name: "Hybrid", organisation_type: "school_district", ranking_scope: "school" as const };
  const hybridDistrict = { ...hybridSchool, ranking_scope: "district" as const };
  assert.equal(organisationMatchesRankingScope(hybridSchool, "school"), true);
  assert.equal(organisationMatchesRankingScope(hybridSchool, "district"), false);
  assert.deepEqual(rankingOrganisationsForScope([hybridSchool, hybridDistrict], "district"), [hybridDistrict]);
});

test("the filter dataset is scope-aware and includes inherited contexts", () => {
  const sql = migration();
  assert.match(sql, /returns table \(organisation_id uuid, organisation_name text, organisation_type text, ranking_scope text\)/);
  assert.match(sql, /cross join lateral private\.get_playr_ranking_contexts\(publication\.player_id\) context/);
  assert.match(repoFile("lib/public-rankings.ts"), /ranking_scope\?: Exclude<RankingScope, "overall">/);
});

test("the canonical rankings RPC receives the visible scope", () => {
  const source = repoFile("lib/public-rankings.ts");
  assert.match(source, /rpc\("get_public_playr_rankings"/);
  assert.match(source, /p_scope: query\.scope \?\? "overall"/);
  assert.doesNotMatch(source, /district_rankings/i);
});

test("District eligibility follows active Player to School to District joins", () => {
  const helper = migration().match(/create function private\.get_playr_ranking_contexts[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(helper, /link\.player_profile_id = p_player_profile_id/);
  assert.match(helper, /link\.status = 'active'/);
  assert.match(helper, /relationship\.child_venue_id = school\.id/);
  assert.match(helper, /relationship\.relationship_type = 'belongs_to'/);
  assert.match(helper, /relationship\.status = 'active'/);
  assert.match(helper, /district\.id = relationship\.parent_venue_id/);
});

test("District inheritance does not require or create a direct District player link", () => {
  const sql = migration();
  const inherited = sql.match(/-- District context is inherited[\s\S]*?where link\.player_profile_id = p_player_profile_id[\s\S]*?;/)?.[0] ?? "";
  assert.doesNotMatch(inherited, /link\.venue_id = district\.id/);
  assert.doesNotMatch(sql, /insert into public\.organisation_player_links/i);
});

test("District rows derive School affiliation from the hierarchy", () => {
  const sql = migration();
  const page = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(sql, /school\.name[\s\S]*school_affiliation/);
  assert.match(sql, /string_agg\(distinct context\.school_affiliation/);
  assert.match(page, /rankingContext\.scope === "district" && row\.school_affiliation/);
  assert.match(page, /<SchoolIcon[\s\S]*row\.school_affiliation/);
});

test("District filtering is isolated to the exact requested District", () => {
  const sql = migration();
  assert.match(sql, /context\.ranking_scope = p_scope/);
  assert.match(sql, /context\.organisation_id = p_organisation_id/);
});

test("inactive relationships and inactive organisations cannot confer District eligibility", () => {
  const helper = migration().match(/create function private\.get_playr_ranking_contexts[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(helper, /relationship\.status = 'active'/);
  assert.match(helper, /school\.status = 'active'/);
  assert.match(helper, /district\.status = 'active'/);
});

test("a one-player scoped leaderboard remains rank one", () => {
  const sql = migration();
  assert.match(sql, /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(sql, /having\s+count\(\*\)\s*>\s*1/i);
  assert.doesNotMatch(sql, /minimum_participant|minimum_player/i);
});

test("public publication and safeguarding rules remain mandatory", () => {
  const sql = migration();
  assert.match(sql, /publication\.publication_status = 'approved'/);
  assert.match(sql, /not publication\.safeguarding_hidden/);
  assert.match(sql, /profile\.member_status <> 'inactive'/);
});

test("Rating and Participation share the same scoped eligibility predicate", () => {
  const sql = migration();
  assert.match(sql, /when p_metric = 'participation' then profile\.participation_score::numeric/);
  assert.match(sql, /when publication\.player_classification = 'adult' then rating\.rating_value/);
  assert.match(sql, /else profile\.junior_rating/);
  assert.equal((sql.match(/p_scope = 'overall' or ranking_context\.is_eligible/g) ?? []).length, 1);
});

test("Overall remains unscoped while Club and Academy retain direct scope behavior", () => {
  const sql = migration();
  assert.match(sql, /when 'club' then array\['club'\]/);
  assert.match(sql, /when 'academy' then array\['academy'\]/);
  assert.match(sql, /when 'club_academy' then array\['club', 'academy'\]/);
  assert.match(sql, /p_scope = 'overall' and p_organisation_id is not null/);
  assert.match(sql, /p_scope = 'overall' or ranking_context\.is_eligible/);
});

test("the contextual header names the organisation and scope", () => {
  const page = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(page, /`\$\{selectedOrganisation\.organisation_name\} Rankings`/);
  assert.match(page, /`\$\{rankingCategoryLabel\(category\)\} · \$\{scopeLabel\}`/);
});

test("Junior category mapping and managed-player highlighting are preserved", () => {
  const playerPage = repoFile("app/dashboard/players/[id]/page.tsx");
  const rankingsPage = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(playerPage, /rankingCategoryForStage\(player\.junior_stage\)/);
  assert.match(rankingsPage, /row\.is_managed/);
  assert.match(rankingsPage, /Your player/);
});

test("Phase 2A Team and Roster schema stays intact and no ranking table is added", () => {
  const phase2a = repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql");
  const sql = migration();
  assert.match(phase2a, /create table if not exists public\.teamr_teams/);
  assert.match(phase2a, /create table if not exists public\.teamr_roster_memberships/);
  assert.doesNotMatch(sql, /create table/i);
  assert.doesNotMatch(sql, /alter table public\.organisation_relationships/i);
});
