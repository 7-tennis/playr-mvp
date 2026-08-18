import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  organisationMatchesRankingScope,
  rankingContextHref,
  resolveRankingContext
} from "../lib/ranking-scope.ts";
import {
  safeSchoolConnectionsReturnTo,
  schoolConnectionsHref
} from "../lib/school-connections-navigation.ts";
import {
  applicationAllowsInitialRole,
  applicationSupportsOrganisationType,
  initialRolesByApplication
} from "../lib/organisation-access-options.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const school = { organisation_id: "school-1", organisation_name: "Laerskool Kenmare", organisation_type: "school" };
const club = { organisation_id: "club-1", organisation_name: "Kenmare Tennis Club", organisation_type: "club" };

test("School Rankings deep-link carries School and Junior stage context", () => {
  const href = rankingContextHref({ category: "green", organisationId: school.organisation_id, scope: "school" });
  assert.equal(href, "/dashboard/rankings?organisation=school-1&scope=school&category=green");
  assert.match(repoFile("app/dashboard/players/[id]/page.tsx"), /rankingCategoryForStage\(player\.junior_stage\)/);
});

test("ranking scope resolves a visible School and rejects mismatched context", () => {
  assert.equal(organisationMatchesRankingScope(school, "school"), true);
  assert.equal(resolveRankingContext([school, club], "school", school.organisation_id).organisation?.organisation_id, school.organisation_id);
  assert.deepEqual(resolveRankingContext([school, club], "school", club.organisation_id), { organisation: null, scope: "overall" });
  assert.deepEqual(resolveRankingContext([school, club], "school", "guessed-id"), { organisation: null, scope: "overall" });
});

test("ranking page validates filter context before calling the ranking RPC", () => {
  const source = repoFile("app/dashboard/rankings/page.tsx");
  assert.ok(source.indexOf("loadPublicRankingFilters") < source.indexOf("loadPublicRankings(supabase"));
  assert.match(source, /organisationId: rankingContext\.organisation\?\.organisation_id/);
  assert.match(repoFile("components/ranking-scope-filter.tsx"), /Ranking scope/);
  assert.doesNotMatch(source, />Organisation\s*</);
});

test("parent-facing School messages contain no TeamR implementation terminology", () => {
  const source = repoFile("app/dashboard/juniors/[juniorId]/schools/page.tsx");
  const messageBlock = source.match(/function messageText[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(messageBlock, /School request sent/);
  assert.match(messageBlock, /will review the request/);
  assert.doesNotMatch(messageBlock, /TeamR|organisation-player|RLS/i);
});

test("MyPlayR School management returns to the same Junior profile", () => {
  const juniorId = "junior-1";
  const returnTo = `/dashboard/players/${juniorId}`;
  assert.equal(safeSchoolConnectionsReturnTo(returnTo, juniorId), returnTo);
  assert.equal(
    schoolConnectionsHref(juniorId, { returnTo }),
    `/dashboard/juniors/${juniorId}/schools?returnTo=${encodeURIComponent(returnTo)}`
  );
  assert.match(repoFile("app/dashboard/players/[id]/page.tsx"), /returnTo: `\/dashboard\/players\/\$\{player\.id\}`/);
});

test("School onboarding always returns to Junior setup", () => {
  assert.equal(safeSchoolConnectionsReturnTo("/dashboard/players/junior-1", "junior-1", true), "/dashboard/juniors");
  assert.equal(schoolConnectionsHref("junior-1", { onboarding: true }), "/dashboard/juniors/junior-1/schools?onboarding=1");
  assert.match(repoFile("app/dashboard/juniors/[juniorId]/schools/page.tsx"), /Not now — finish Junior setup/);
});

test("School Connections rejects external and cross-player return targets", () => {
  assert.equal(safeSchoolConnectionsReturnTo("https://example.com", "junior-1"), "/dashboard/juniors");
  assert.equal(safeSchoolConnectionsReturnTo("//example.com", "junior-1"), "/dashboard/juniors");
  assert.equal(safeSchoolConnectionsReturnTo("/dashboard/players/junior-2", "junior-1"), "/dashboard/juniors");
});

test("product-first assignment maps TeamR to canonical existing roles", () => {
  assert.deepEqual(initialRolesByApplication.teamr, ["organisation_admin", "sports_coordinator"]);
  assert.equal(applicationAllowsInitialRole("teamr", "sports_coordinator"), true);
  assert.equal(applicationSupportsOrganisationType("teamr", "school"), true);
  assert.equal(applicationSupportsOrganisationType("teamr", "club"), false);
  assert.match(repoFile("app/admin/organisations/actions.ts"), /applicationAllowsInitialRole\(application, leaderRole\)/);
});

test("CoachR initial roles are not presented as TeamR roles", () => {
  assert.deepEqual(initialRolesByApplication.coachr, ["head_coach"]);
  assert.equal(initialRolesByApplication.coachr.includes("sports_coordinator"), false);
  assert.equal(initialRolesByApplication.teamr.includes("head_coach"), false);
});

test("ClubR initial roles are not presented as TeamR roles", () => {
  assert.deepEqual(initialRolesByApplication.clubr, ["organisation_admin", "club_manager"]);
  assert.equal(initialRolesByApplication.clubr.includes("sports_coordinator"), false);
  assert.equal(initialRolesByApplication.teamr.includes("club_manager"), false);
});

test("Phase 2A.1B remains code-only and preserves Club-specific Venues", () => {
  assert.match(repoFile("lib/venues.ts"), /rpc\("playr_profile_club_venues"/);
  assert.doesNotMatch(repoFile("tests/teamr-phase2a1b.test.ts"), /supabase\/migrations\/2026081[6-9]/);
});
