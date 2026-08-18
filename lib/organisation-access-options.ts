import type { OrganisationRole, OrganisationType } from "@/types/courtside";

export type OrganisationAccessApplication = "coachr" | "clubr" | "teamr";

export const organisationAccessApplications: Array<{ label: string; value: OrganisationAccessApplication }> = [
  { label: "ClubR", value: "clubr" },
  { label: "CoachR", value: "coachr" },
  { label: "TeamR", value: "teamr" }
];

export const initialRolesByApplication: Record<OrganisationAccessApplication, OrganisationRole[]> = {
  clubr: ["organisation_admin", "club_manager"],
  coachr: ["head_coach"],
  teamr: ["organisation_admin", "sports_coordinator"]
};

export function safeOrganisationAccessApplication(value: string | null | undefined): OrganisationAccessApplication {
  return organisationAccessApplications.some((application) => application.value === value)
    ? value as OrganisationAccessApplication
    : "clubr";
}

export function applicationAllowsInitialRole(application: OrganisationAccessApplication, role: OrganisationRole) {
  return initialRolesByApplication[application].includes(role);
}

export function applicationSupportsOrganisationType(application: OrganisationAccessApplication, type: OrganisationType) {
  if (application === "teamr") return ["school", "district", "school_district"].includes(type);
  if (application === "coachr") return ["academy", "club", "club_academy"].includes(type);
  return ["academy", "club", "club_academy"].includes(type);
}
