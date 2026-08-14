export function canReviewTeamRPlayerRequests(context: { activeOrganisationRole: string | null; role: string }) {
  return context.role === "platform_admin"
    || context.activeOrganisationRole === "organisation_admin"
    || context.activeOrganisationRole === "sports_coordinator";
}
