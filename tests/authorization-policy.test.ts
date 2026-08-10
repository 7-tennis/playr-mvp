import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessCoachR,
  canAccessCoachRPermission,
  canAccessClubR,
  canAccessProductWithRoles,
  coachRRequiredRoles,
  type UserRole
} from "../lib/authorization-policy.ts";
import {
  appRoleForOrganisationMembership,
  pickOrganisationMembershipForProduct,
  productForOrganisationMembership,
  type OrganisationMembershipWithVenue
} from "../lib/organisations.ts";
import type { OrganisationRole, OrganisationType } from "../types/courtside.ts";

function membership({
  createdAt,
  id,
  organisationType,
  role,
  venueId
}: {
  createdAt: string;
  id: string;
  organisationType: OrganisationType;
  role: OrganisationRole;
  venueId: string;
}): OrganisationMembershipWithVenue {
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
      id: venueId,
      name: `Venue ${id}`,
      organisation_type: organisationType,
      slug: `venue-${id}`,
      status: "active"
    },
    venue_id: venueId
  };
}

test("enforces the explicit single-role PlayR, CoachR and ClubR matrix", () => {
  const expected: Array<{ coachr: boolean; clubr: boolean; role: UserRole }> = [
    { role: "player", coachr: false, clubr: false },
    { role: "parent", coachr: false, clubr: false },
    { role: "coach", coachr: true, clubr: false },
    { role: "head_coach", coachr: true, clubr: false },
    { role: "club_admin", coachr: false, clubr: true },
    { role: "committee", coachr: false, clubr: true },
    { role: "reception", coachr: false, clubr: true },
    { role: "platform_admin", coachr: true, clubr: true }
  ];

  for (const row of expected) {
    assert.equal(canAccessCoachR(row.role), row.coachr, `${row.role} CoachR access`);
    assert.equal(canAccessClubR(row.role), row.clubr, `${row.role} ClubR access`);
  }
});

test("allows both products only when explicit roles are combined", () => {
  assert.equal(canAccessProductWithRoles(["coach"], "coachr"), true);
  assert.equal(canAccessProductWithRoles(["coach"], "clubr"), false);
  assert.equal(canAccessProductWithRoles(["club_admin"], "coachr"), false);
  assert.equal(canAccessProductWithRoles(["club_admin"], "clubr"), true);
  assert.equal(canAccessProductWithRoles(["coach", "club_admin"], "coachr"), true);
  assert.equal(canAccessProductWithRoles(["coach", "club_admin"], "clubr"), true);
});

test("keeps head-coach operations explicit and excludes club admins", () => {
  assert.equal(canAccessCoachRPermission("coach", "coachr:schedule"), true);
  assert.equal(canAccessCoachRPermission("coach", "coachr:coaches"), false);
  assert.equal(canAccessCoachRPermission("head_coach", "coachr:coaches"), true);
  assert.equal(canAccessCoachRPermission("club_admin", "coachr"), false);
  assert.equal(canAccessCoachRPermission("club_admin", "coachr:coaches"), false);
  assert.deepEqual(coachRRequiredRoles("coachr"), ["coach", "head_coach", "platform_admin"]);
  assert.deepEqual(coachRRequiredRoles("coachr:coaches"), ["head_coach", "platform_admin"]);
});

test("uses the same explicit product memberships for switcher and direct-route context", () => {
  const club = membership({ createdAt: "2026-08-10T08:00:00Z", id: "club", organisationType: "club", role: "club_manager", venueId: "club-venue" });
  const coach = membership({ createdAt: "2026-08-10T09:00:00Z", id: "coach", organisationType: "academy", role: "coach", venueId: "coach-venue" });

  assert.equal(productForOrganisationMembership(club), "clubr");
  assert.equal(appRoleForOrganisationMembership(club), "club_admin");
  assert.equal(productForOrganisationMembership(coach), "coachr");
  assert.equal(appRoleForOrganisationMembership(coach), "coach");
  assert.equal(pickOrganisationMembershipForProduct([club], "coachr"), null);
  assert.equal(pickOrganisationMembershipForProduct([coach], "clubr"), null);
  assert.equal(pickOrganisationMembershipForProduct([club, coach], "clubr")?.id, "club");
  assert.equal(pickOrganisationMembershipForProduct([club, coach], "coachr")?.id, "coach");
});

test("academy managers do not inherit CoachR without a coaching role", () => {
  const academyManager = membership({
    createdAt: "2026-08-10T10:00:00Z",
    id: "academy-manager",
    organisationType: "academy",
    role: "organisation_admin",
    venueId: "academy-venue"
  });

  assert.equal(productForOrganisationMembership(academyManager), "clubr");
  assert.equal(appRoleForOrganisationMembership(academyManager), "club_admin");
  assert.equal(canAccessCoachR(appRoleForOrganisationMembership(academyManager)), false);
  assert.equal(pickOrganisationMembershipForProduct([academyManager], "coachr"), null);
  assert.equal(pickOrganisationMembershipForProduct([academyManager], "clubr")?.id, "academy-manager");
});
