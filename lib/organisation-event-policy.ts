import { organisationCapabilities } from "./organisation-capabilities.ts";
import type { CourtSideEvent, EventStatus, EventVisibility, JuniorStage, OrganisationRole, OrganisationType, UserRole } from "../types/courtside.ts";

export type OrganisationEventStage = Exclude<JuniorStage, "not_sure">;
export type OrganisationEventState = EventStatus | "archived";

export const organisationEventStages: Array<{ label: string; value: OrganisationEventStage }> = [
  { label: "Red Ball", value: "red_ball" },
  { label: "Orange Ball", value: "orange_ball" },
  { label: "Green Ball", value: "green_ball" },
  { label: "Yellow / Open", value: "yellow_ball" }
];

export function organisationCanHostEvents(type: OrganisationType) {
  return organisationCapabilities(type).eventHost;
}

export function canManageOrganisationEvents(context: {
  activeOrganisationRole: OrganisationRole | null;
  organisationType: OrganisationType | null | undefined;
  role: UserRole;
}) {
  if (context.role === "platform_admin") return true;
  if (!context.organisationType || !organisationCanHostEvents(context.organisationType)) return false;
  if (["school", "district", "school_district"].includes(context.organisationType)) {
    return context.activeOrganisationRole === "organisation_admin" || context.activeOrganisationRole === "sports_coordinator";
  }
  if (["club", "club_academy"].includes(context.organisationType)) {
    return context.activeOrganisationRole === "organisation_admin" || context.activeOrganisationRole === "club_manager";
  }
  return false;
}

export function organisationEventState(event: Pick<CourtSideEvent, "archived_at" | "status">): OrganisationEventState {
  return event.archived_at ? "archived" : event.status;
}

export function eventDateTimeToIso(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00+02:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function eventLocalParts(value: string | null | undefined) {
  if (!value) return { date: "", time: "" };
  const serial = new Date(value).getTime();
  if (Number.isNaN(serial)) return { date: "", time: "" };
  const sast = new Date(serial + 2 * 60 * 60 * 1000).toISOString();
  return { date: sast.slice(0, 10), time: sast.slice(11, 16) };
}

export function eventVisibilityDescription(visibility: EventVisibility) {
  return visibility === "closed"
    ? "Only eligible players connected to this organisation can participate."
    : "Eligible PlayR players outside this organisation may participate when entries are introduced.";
}
