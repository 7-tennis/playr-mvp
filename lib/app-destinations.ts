import { appAreaDefinitions, type AppAreaDestination } from "./app-areas.ts";
import { canAccessCoachR, canAccessClubR, type UserRole } from "./authorization-policy.ts";
import { pickOrganisationMembershipForProduct, type OrganisationMembershipWithVenue } from "./organisations.ts";

export function appDestinationsForUser(storedRole: UserRole, memberships: OrganisationMembershipWithVenue[]) {
  const destinations: AppAreaDestination[] = [{ ...appAreaDefinitions.playr }];
  const clubMembership = pickOrganisationMembershipForProduct(memberships, "clubr");
  const coachMembership = pickOrganisationMembershipForProduct(memberships, "coachr");
  const teamMembership = pickOrganisationMembershipForProduct(memberships, "teamr");

  if (clubMembership || (storedRole !== "platform_admin" && canAccessClubR(storedRole))) {
    destinations.push({ ...appAreaDefinitions.clubr, membershipId: clubMembership?.id });
  }

  if (coachMembership || (storedRole !== "platform_admin" && canAccessCoachR(storedRole))) {
    destinations.push({ ...appAreaDefinitions.coachr, membershipId: coachMembership?.id });
  }

  if (teamMembership) {
    destinations.push({ ...appAreaDefinitions.teamr, membershipId: teamMembership.id });
  }

  if (storedRole === "platform_admin") {
    destinations.push({ ...appAreaDefinitions.superuser });
  }

  return destinations;
}
