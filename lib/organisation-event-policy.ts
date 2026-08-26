import { organisationCapabilities } from "./organisation-capabilities.ts";
import type { CourtSideEvent, EventStatus, EventVisibility, JuniorStage, OrganisationRole, OrganisationType, UserRole } from "../types/courtside.ts";

export type OrganisationEventStage = Exclude<JuniorStage, "not_sure">;
export type OrganisationEventState = EventStatus | "archived";
export type OrganisationEventValidationError = "invalid_capacity" | "invalid_event" | "invalid_time" | "missing_required";

export type OrganisationEventFormInput = {
  capacity: string;
  date: string;
  description: string;
  endTime: string;
  juniorStage: string;
  location: string;
  startTime: string;
  title: string;
  visibility: string;
};

export type ValidatedOrganisationEventInput = {
  capacity: number | null;
  description: string | null;
  endsAt: string;
  juniorStage: OrganisationEventStage | null;
  location: string;
  startsAt: string;
  title: string;
  visibility: EventVisibility;
};

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

export function validateOrganisationEventInput(input: OrganisationEventFormInput):
  | { error: OrganisationEventValidationError; ok: false }
  | { ok: true; value: ValidatedOrganisationEventInput } {
  if (!input.title || !input.visibility || !input.date || !input.startTime || !input.endTime || !input.location) {
    return { error: "missing_required", ok: false };
  }

  const startsAt = eventDateTimeToIso(input.date, input.startTime);
  const endsAt = eventDateTimeToIso(input.date, input.endTime);
  if (!startsAt || !endsAt || endsAt <= startsAt) return { error: "invalid_time", ok: false };

  const capacity = input.capacity ? Number(input.capacity) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return { error: "invalid_capacity", ok: false };

  const stage = organisationEventStages.find((option) => option.value === input.juniorStage)?.value ?? null;
  if (input.juniorStage && !stage) return { error: "invalid_event", ok: false };
  if (!["closed", "open"].includes(input.visibility) || input.title.length > 120 || input.location.length > 200 || input.description.length > 1000) return { error: "invalid_event", ok: false };

  return {
    ok: true,
    value: {
      capacity,
      description: input.description || null,
      endsAt,
      juniorStage: stage,
      location: input.location,
      startsAt,
      title: input.title,
      visibility: input.visibility as EventVisibility
    }
  };
}

export function organisationEventErrorMessage(code: string | null | undefined) {
  switch (code) {
    case "missing_required":
      return "Complete every required event field and try again.";
    case "invalid_time":
      return "Choose a valid date and make sure the end time is later than the start time.";
    case "invalid_capacity":
      return "Capacity must be a whole number greater than zero, or left blank.";
    case "access":
    case "unsupported_host":
      return "Your current organisation or role is not authorised to manage this event.";
    case "schema_unavailable":
      return "Event creation is temporarily unavailable. Please contact PlayR support.";
    case "invalid_event":
      return "Check the event details and try again.";
    default:
      return code ? "The event could not be saved. Please try again." : null;
  }
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
