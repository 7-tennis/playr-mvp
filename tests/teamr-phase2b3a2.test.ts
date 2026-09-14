import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadPublicRankings, publicRankingRpcArguments, type PublicRankingRow } from "../lib/public-rankings.ts";
import { rankingMetricForCategory } from "../lib/ranking-categories.ts";
import { resolveRankingContext } from "../lib/ranking-scope.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = () => repoFile("supabase/migrations/20260907201004_teamr_phase2b3a_district_players_ranking_staff_access.sql");
const phase2a2 = () => repoFile("supabase/migrations/20260818193306_teamr_phase2a2_ranking_context_inheritance.sql");

const james = { ranking_profile_id: "james", public_display_name: "James M.", ranking_category: "green", development_stage: "green", player_classification: "junior", organisation_summary: "Laerskool Kenmare", school_affiliation: "Laerskool Kenmare", public_region: null, metric_value: 15, events_played: 1, matches_played: 0, ranking_position: 1, total_count: 2, updated_at: "2026-09-01T00:00:00Z", is_managed: true } satisfies PublicRankingRow;
const steyn = { ...james, ranking_profile_id: "steyn", public_display_name: "Steyn J.", metric_value: 0, ranking_position: 2, is_managed: false } satisfies PublicRankingRow;

function fakeSupabase(result: { data: PublicRankingRow[] | null; error: null | { code: string; details: string | null; hint: string | null; message: string } }) {
  let request: { name: string; args: unknown } | null = null;
  return {
    client: { rpc: async (name: string, args: unknown) => { request = { name, args }; return result; } },
    request: () => request
  };
}

test("Overall Green Rating uses the public RPC without organisation eligibility", () => {
  const args = publicRankingRpcArguments({ category: "green", metric: "rating", region: " ", search: "" });
  assert.deepEqual(args, { p_category: "green", p_classification: null, p_limit: 25, p_metric: "rating", p_offset: 0, p_organisation_id: null, p_region: null, p_scope: "overall", p_search: null });
  assert.match(migration(), /p_scope = 'overall' or ranking_context\.is_eligible/);
});

test("Overall Green Participation accepts James and zero-point Steyn", async () => {
  const fake = fakeSupabase({ data: [james, steyn], error: null });
  const result = await loadPublicRankings(fake.client as never, { category: "green", metric: "participation" });
  assert.deepEqual(result.rows.map((row) => [row.public_display_name, row.metric_value]), [["James M.", 15], ["Steyn J.", 0]]);
  assert.equal(result.error, false);
});

test("Kenmare Green Rating preserves School scope and organisation", () => {
  const args = publicRankingRpcArguments({ category: "green", metric: "rating", organisationId: "kenmare", scope: "school" });
  assert.equal(args.p_scope, "school");
  assert.equal(args.p_organisation_id, "kenmare");
});

test("Kenmare Green Participation uses the same School context contract", () => {
  const args = publicRankingRpcArguments({ category: "green", metric: "participation", organisationId: "kenmare", scope: "school" });
  assert.equal(args.p_metric, "participation");
  assert.equal(args.p_organisation_id, "kenmare");
});

test("D2 Green Rating inherits players through Kenmare", () => {
  assert.match(phase2a2(), /district\.id = relationship\.parent_venue_id/);
  assert.match(phase2a2(), /relationship\.relationship_type = 'belongs_to'/);
  assert.match(migration(), /context\.organisation_id = p_organisation_id/);
  assert.equal(publicRankingRpcArguments({ category: "green", metric: "rating", organisationId: "d2", scope: "district" }).p_scope, "district");
});

test("D2 Green Participation uses the shared inherited context predicate", () => {
  assert.match(migration(), /private\.get_playr_ranking_contexts\(publication\.player_id\)/);
  assert.match(migration(), /context\.ranking_scope = p_scope/);
});

test("Overall never requires organisation affiliation", () => {
  const args = publicRankingRpcArguments({ category: "open", metric: "rating", organisationId: undefined, scope: "overall" });
  assert.equal(args.p_organisation_id, null);
  assert.equal(args.p_scope, "overall");
});

test("published Red players use Overall Participation without affiliation", () => {
  assert.equal(rankingMetricForCategory("red", "rating"), "participation");
  const args = publicRankingRpcArguments({ category: "red", metric: "participation" });
  assert.equal(args.p_organisation_id, null);
});

test("zero-point published players remain valid Participation rows", () => {
  assert.match(migration(), /p_metric = 'participation' and profile\.participation_score >= 0/);
  assert.equal(steyn.metric_value, 0);
});

test("ranking RPC errors produce a load error and log details", async () => {
  const fake = fakeSupabase({ data: null, error: { code: "PGRST202", details: "detail", hint: "hint", message: "failure" } });
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...values: unknown[]) => { logged.push(values); };
  try {
    const result = await loadPublicRankings(fake.client as never, { category: "green", metric: "rating" });
    assert.deepEqual(result, { error: true, rows: [] });
    assert.deepEqual(logged[0]?.[0], "[public-rankings] ranking_load_failed");
  } finally {
    console.error = originalError;
  }
  const page = repoFile("app/dashboard/rankings/page.tsx");
  assert.match(page, /!rankingData\.error \? <span[^>]*>\{total\} published/);
  assert.match(page, /Rankings could not be loaded\. Please try again\./);
});

test("a successful empty response remains a legitimate empty leaderboard", async () => {
  const fake = fakeSupabase({ data: [], error: null });
  assert.deepEqual(await loadPublicRankings(fake.client as never, { category: "green", metric: "rating" }), { error: false, rows: [] });
});

test("metric switching preserves category, scope and organisation", () => {
  const rating = publicRankingRpcArguments({ category: "green", metric: "rating", organisationId: "d2", scope: "district" });
  const participation = publicRankingRpcArguments({ category: "green", metric: "participation", organisationId: "d2", scope: "district" });
  assert.deepEqual({ ...rating, p_metric: participation.p_metric }, participation);
});

test("metric switching rejects incompatible hidden Red and Orange rating state", () => {
  assert.equal(rankingMetricForCategory("red", "rating"), "participation");
  assert.equal(rankingMetricForCategory("orange", "rating"), "participation");
  assert.equal(rankingMetricForCategory("green", "participation"), "participation");
  assert.equal(rankingMetricForCategory("open", "participation"), "participation");
});

test("scope switching cannot retain a stale organisation ID", () => {
  const organisations = [{ organisation_id: "kenmare", organisation_name: "Kenmare", organisation_type: "school", ranking_scope: "school" as const }];
  assert.deepEqual(resolveRankingContext(organisations, "district", "kenmare"), { organisation: null, scope: "overall" });
  assert.deepEqual(resolveRankingContext(organisations, "overall", "kenmare"), { organisation: null, scope: "overall" });
  assert.match(repoFile("components/ranking-scope-filter.tsx"), /setOrganisationId\(""\)/);
});

test("MyPlayR connected ranking summaries remain on their separate RPC", () => {
  const helper = repoFile("lib/connected-rankings.ts");
  assert.match(helper, /rpc\("get_managed_playr_connected_rankings"/);
  assert.doesNotMatch(helper, /get_public_playr_rankings"/);
});
