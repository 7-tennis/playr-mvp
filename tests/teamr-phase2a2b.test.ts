import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { connectedRankingForScope, type ConnectedRankingSummary } from "../lib/connected-rankings.ts";
import { rankingContextHref } from "../lib/ranking-scope.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260819083603_teamr_phase2a2b_connected_ranking_summary.sql";
const migration = () => repoFile(migrationPath);
const phase2a2 = () => repoFile("supabase/migrations/20260818193306_teamr_phase2a2_ranking_context_inheritance.sql");

const schoolRanking: ConnectedRankingSummary = {
  organisationId: "school-1",
  organisationName: "Laerskool Kenmare",
  playerProfileId: "player-1",
  rankingCategory: "green",
  rankingMetric: "rating",
  rankingPosition: 1,
  rankingScope: "school"
};
const districtRanking: ConnectedRankingSummary = {
  ...schoolRanking,
  organisationId: "district-1",
  organisationName: "D2 Tennis",
  rankingScope: "district"
};

test("approved ranked Juniors receive their canonical School summary", () => {
  const sql = migration();
  assert.match(sql, /private\.get_public_playr_rankings_core\(/);
  assert.match(sql, /'school'::text, player\.school_id, player\.school_name/);
  assert.deepEqual(connectedRankingForScope([schoolRanking], "player-1", "school"), schoolRanking);
});

test("ranked Juniors receive an inherited District summary", () => {
  assert.deepEqual(connectedRankingForScope([schoolRanking, districtRanking], "player-1", "district"), districtRanking);
  assert.match(migration(), /public\.teamr_school_context\(player\.player_profile_id\)/);
});

test("summary and public leaderboard share one canonical ranked core", () => {
  const sql = migration();
  assert.match(sql, /create or replace function private\.get_public_playr_rankings[\s\S]*from private\.get_public_playr_rankings_core\(/);
  assert.match(sql, /create function private\.get_managed_playr_connected_rankings[\s\S]*private\.get_public_playr_rankings_core\(/);
  assert.equal((sql.match(/dense_rank\(\) over/g) ?? []).length, 1);
});

test("one eligible player remains rank one", () => {
  assert.match(migration(), /dense_rank\(\) over \(order by public_rows\.metric_value desc\)/);
  assert.doesNotMatch(migration(), /having\s+count\(\*\)\s*>\s*1|minimum_player/i);
  assert.equal(schoolRanking.rankingPosition, 1);
});

test("pending publications cannot produce a connected public rank", () => {
  assert.match(migration(), /publication\.publication_status = 'approved'/);
  assert.doesNotMatch(migration(), /publication_status in \('pending', 'approved'\)/);
});

test("safeguarding-hidden players cannot produce a connected public rank", () => {
  assert.match(migration(), /not publication\.safeguarding_hidden/);
});

test("District summaries require no direct District player link", () => {
  assert.doesNotMatch(migration(), /insert into public\.organisation_player_links/i);
  assert.match(phase2a2(), /-- District context is inherited/);
});

test("District summaries retain active School relationship inheritance", () => {
  const helper = phase2a2().match(/create function private\.get_playr_ranking_contexts[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(helper, /link\.status = 'active'/);
  assert.match(helper, /relationship\.relationship_type = 'belongs_to'/);
  assert.match(helper, /relationship\.status = 'active'/);
  assert.match(helper, /district\.status = 'active'/);
});

test("School rank deep links preserve School and Green context", () => {
  assert.equal(
    rankingContextHref({ category: schoolRanking.rankingCategory, organisationId: schoolRanking.organisationId, scope: "school" }),
    "/dashboard/rankings?organisation=school-1&scope=school&category=green"
  );
  assert.match(repoFile("app/dashboard/players/[id]/page.tsx"), /rankingContextHref\([\s\S]*ranking\.rankingScope/);
});

test("District rank deep links preserve District and Green context", () => {
  assert.equal(
    rankingContextHref({ category: districtRanking.rankingCategory, organisationId: districtRanking.organisationId, scope: "district" }),
    "/dashboard/rankings?organisation=district-1&scope=district&category=green"
  );
});

test("Green Juniors use the canonical rating metric", () => {
  assert.match(migration(), /case when context\.ranking_category in \('red', 'orange'\) then 'participation' else 'rating' end/);
  assert.equal(schoolRanking.rankingMetric, "rating");
});

test("Yellow Juniors remain Open-category Junior rankings", () => {
  const sql = migration();
  assert.match(sql, /private\.playr_ranking_category\(profile\.is_junior, profile\.junior_stage::text\)/);
  assert.match(sql, /case when context\.ranking_category = 'open' then 'junior' else null end/);
});

test("missing District context omits a District summary", () => {
  assert.equal(connectedRankingForScope([schoolRanking], "player-1", "district"), null);
  assert.match(repoFile("components/player-profile-card.tsx"), /rankings\.length > 0/);
});

test("MyPlayR ranking chips remain mobile-safe", () => {
  const card = repoFile("components/player-profile-card.tsx");
  assert.match(card, /flex min-w-0 flex-wrap gap-2/);
  assert.match(card, /max-w-full rounded-full/);
  assert.doesNotMatch(card, /whitespace-nowrap/);
});

test("MyPlayR batches all Junior summaries into one RPC", () => {
  const dashboard = repoFile("app/dashboard/page.tsx");
  const loader = repoFile("lib/connected-rankings.ts");
  assert.match(dashboard, /loadConnectedRankingSummaries\(supabase, juniorRows\.map/);
  assert.match(dashboard, /connectedRankingForScope\(connectedRankingResult\.data, junior\.id, "school"\)/);
  assert.match(dashboard, /connectedRankingForScope\(connectedRankingResult\.data, junior\.id, "district"\)/);
  assert.equal((loader.match(/rpc\("get_managed_playr_connected_rankings"/g) ?? []).length, 1);
  assert.match(migration(), /requested_count > 50/);
});

test("managed-profile authorisation protects the batch RPC", () => {
  const sql = migration();
  assert.match(sql, /public\.can_manage_profile\(profile\.id, actor_user_id\)/);
  assert.match(sql, /managed_count <> requested_count/);
  assert.match(sql, /raise exception 'profile_access'/);
});

test("multiple School links follow the existing current-School ordering", () => {
  const sql = migration();
  assert.match(sql, /where context\.school_link_status = 'active'/);
  assert.match(sql, /order by context\.school_name, context\.school_id[\s\S]*limit 1/);
  assert.match(repoFile("app/dashboard/players/[id]/page.tsx"), /schoolContextResult\.data\[0\]/);
});

test("Overall public Rankings retain their existing public contract", () => {
  const sql = migration();
  assert.match(sql, /create or replace function private\.get_public_playr_rankings\(/);
  assert.doesNotMatch(sql, /create or replace function public\.get_public_playr_rankings\(/);
  assert.match(sql, /p_scope text default 'overall'/);
});

test("Phase 2A.2B stores no ranks and changes no TeamR or RLS schema", () => {
  const sql = migration();
  assert.doesNotMatch(sql, /school_rank|district_rank|create table|alter table|create policy|alter policy/i);
  assert.doesNotMatch(sql, /teamr_teams|teamr_roster_memberships|supabase_migrations/i);
});
