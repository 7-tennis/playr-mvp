import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loginPathFor, requestPathFromHeaders, safeInternalPath } from "../lib/auth-navigation.ts";
import { canAccessCoachR, canAccessClubR } from "../lib/authorization-policy.ts";

test("preserves a safe requested destination through login", () => {
  assert.equal(loginPathFor("/dashboard/coachr/coaches?view=pending"), "/login?next=%2Fdashboard%2Fcoachr%2Fcoaches%3Fview%3Dpending");
  assert.equal(loginPathFor("/dashboard/teamr/players?stage=red_ball"), "/login?next=%2Fdashboard%2Fteamr%2Fplayers%3Fstage%3Dred_ball");
  assert.equal(
    loginPathFor("/dashboard/clubr/settings", "Session expired"),
    "/login?error=Session+expired&next=%2Fdashboard%2Fclubr%2Fsettings"
  );
  assert.equal(safeInternalPath("https://example.com/dashboard"), null);
  assert.equal(safeInternalPath("//example.com/dashboard"), null);
});

test("reads only a safe middleware-provided request path", () => {
  assert.equal(requestPathFromHeaders(new Headers({ "x-playr-request-path": "/dashboard/coachr/coaches" })), "/dashboard/coachr/coaches");
  assert.equal(requestPathFromHeaders(new Headers({ "x-playr-request-path": "https://example.com" })), null);
});

test("More pages use POST server actions instead of a prefetchable logout GET", () => {
  const coachRMore = readFileSync(new URL("../app/dashboard/coachr/more/page.tsx", import.meta.url), "utf8");
  const clubRMore = readFileSync(new URL("../app/dashboard/clubr/more/page.tsx", import.meta.url), "utf8");
  const logoutRoute = readFileSync(new URL("../app/logout/route.ts", import.meta.url), "utf8");

  for (const source of [coachRMore, clubRMore]) {
    assert.doesNotMatch(source, /href=["']\/logout["']/);
    assert.match(source, /form action=\{signOut\}/);
  }

  assert.match(logoutRoute, /NextResponse\.redirect/);
  assert.doesNotMatch(logoutRoute, /auth\.signOut\(/);
});

test("authorization denials remain distinct from authentication", () => {
  assert.equal(canAccessCoachR("player"), false);
  assert.equal(canAccessClubR("player"), false);
  assert.equal(canAccessCoachR("head_coach"), true);
  assert.equal(canAccessClubR("club_admin"), true);
  assert.equal(canAccessCoachR("club_admin"), false);
});
