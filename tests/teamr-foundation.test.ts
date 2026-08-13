import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("TeamR player data is server-scoped to the authorised context venue", () => {
  const source = repoFile("lib/teamr.ts");

  assert.match(source, /getPermissionContext\("teamr"\)/);
  assert.match(source, /\.eq\("venue_id", context\.venueId\)/);
  assert.match(source, /\.eq\("status", "active"\)/);
  assert.doesNotMatch(source, /searchParams|formData/);
});

test("every TeamR route uses the shared server-side guard", () => {
  for (const path of [
    "app/dashboard/teamr/page.tsx",
    "app/dashboard/teamr/players/page.tsx",
    "app/dashboard/teamr/teams/page.tsx",
    "app/dashboard/teamr/competitions/page.tsx",
    "app/dashboard/teamr/more/page.tsx"
  ]) {
    assert.match(repoFile(path), /getProtectedTeamRPage\(\)/, path);
  }
});

test("TeamR RLS grants read access only for eligible types and explicit roles", () => {
  const sql = repoFile("supabase/migrations/20260813085920_teamr_phase1_read_access.sql");

  assert.match(sql, /check_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /membership\.role in \('organisation_admin', 'sports_coordinator', 'team_manager'\)/);
  assert.match(sql, /venue\.organisation_type in \('school', 'district', 'school_district'\)/);
  assert.match(sql, /for select\s+to authenticated/g);
  assert.doesNotMatch(sql, /for (insert|update|delete|all)/i);
  assert.doesNotMatch(sql, /'academy'|'club'/);
});

test("PlayR navigation yields to TeamR navigation on TeamR routes", () => {
  assert.match(repoFile("components/player-nav.tsx"), /pathname\.startsWith\("\/dashboard\/teamr"\)/);
  assert.match(repoFile("components/teamr-navigation.tsx"), /Players[\s\S]*Teams[\s\S]*MyTeamR[\s\S]*Competitions[\s\S]*More/);
});

test("post-login and organisation switching route TeamR memberships naturally", () => {
  assert.match(repoFile("lib/auth-routing.ts"), /product === "teamr"[\s\S]*return "\/dashboard\/teamr"/);
  assert.match(repoFile("app/dashboard/organisations/actions.ts"), /case "teamr":[\s\S]*return "\/dashboard\/teamr"/);
});
