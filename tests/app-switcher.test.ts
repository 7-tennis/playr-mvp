import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appDestinationsForUser } from "../lib/app-destinations.ts";
import { appAreaLandingPath, authorisedAppAreaForPath } from "../lib/app-areas.ts";
import type { OrganisationMembershipWithVenue } from "../lib/organisations.ts";
import type { OrganisationRole, OrganisationType } from "../types/courtside.ts";

function membership(id: string, role: OrganisationRole, organisationType: OrganisationType): OrganisationMembershipWithVenue {
  const createdAt = "2026-08-11T12:00:00Z";

  return {
    accepted_at: createdAt,
    created_at: createdAt,
    id,
    invited_by_user_id: null,
    notes: null,
    profile_id: `profile-${id}`,
    removed_at: null,
    role,
    status: "active",
    suspended_at: null,
    updated_at: createdAt,
    user_id: `user-${id}`,
    venue: {
      id: `venue-${id}`,
      name: `Venue ${id}`,
      organisation_type: organisationType,
      slug: `venue-${id}`,
      status: "active"
    },
    venue_id: `venue-${id}`
  };
}

function idsAndPaths(destinations: ReturnType<typeof appDestinationsForUser>) {
  return destinations.map(({ href, id }) => [id, href]);
}

test("player-only switcher exposes PlayR only", () => {
  assert.deepEqual(idsAndPaths(appDestinationsForUser("player", [])), [["playr", "/dashboard"]]);
});

test("coach-only switcher exposes PlayR and membership-backed CoachR", () => {
  const destinations = appDestinationsForUser("coach", [membership("coach", "coach", "academy")]);

  assert.deepEqual(idsAndPaths(destinations), [["playr", "/dashboard"], ["coachr", "/dashboard/coachr"]]);
  assert.equal(destinations[1]?.membershipId, "coach");
  assert.equal(appAreaLandingPath("coachr"), "/dashboard/coachr");
});

test("club-admin-only switcher exposes PlayR and ClubR without CoachR", () => {
  const destinations = appDestinationsForUser("club_admin", [membership("club", "club_manager", "club")]);

  assert.deepEqual(idsAndPaths(destinations), [["playr", "/dashboard"], ["clubr", "/dashboard/clubr"]]);
  assert.equal(appAreaLandingPath("clubr"), "/dashboard/clubr");
});

test("explicit coach plus club-admin memberships expose and route to both products", () => {
  const destinations = appDestinationsForUser("club_admin", [
    membership("club", "club_manager", "club"),
    membership("coach", "coach", "academy")
  ]);

  assert.deepEqual(idsAndPaths(destinations), [
    ["playr", "/dashboard"],
    ["clubr", "/dashboard/clubr"],
    ["coachr", "/dashboard/coachr"]
  ]);
});

test("membership-backed switcher forms remain mounted while their server action is pending", () => {
  const source = readFileSync(new URL("../components/app-switcher.tsx", import.meta.url), "utf8");

  assert.match(source, /useFormStatus/);
  assert.match(source, /Opening \$\{label\}/);
  assert.doesNotMatch(source, /<button[^>]+onClick=\{\(\) => setOpen\(false\)\}[^>]+type="submit"/);
});

test("non-platform users never receive SupeR context from a direct admin URL", () => {
  for (const role of ["player", "coach", "club_admin"] as const) {
    const destinations = appDestinationsForUser(role, []);

    assert.equal(authorisedAppAreaForPath("/admin/rankings", destinations), "playr");
    assert.equal(authorisedAppAreaForPath("/admin/organisations", destinations), "playr");
    assert.equal(destinations.some(({ id }) => id === "superuser"), false);
  }
});

test("platform administrators retain SupeR context on admin routes", () => {
  const destinations = appDestinationsForUser("platform_admin", []);

  assert.equal(authorisedAppAreaForPath("/admin/rankings", destinations), "superuser");
  assert.equal(authorisedAppAreaForPath("/admin/organisations", destinations), "superuser");
  assert.equal(destinations.some(({ id }) => id === "superuser"), true);
});

test("admin denials describe platform administrator and SupeR authority", () => {
  const source = readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");

  assert.match(source, /only platform administrators with SupeR UseR authority/i);
  assert.doesNotMatch(source, /does not have ClubR admin permission/i);
});
