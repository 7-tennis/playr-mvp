import type { AuthenticatedTeamRContext } from "@/lib/teamr";
import type { CourtSideEvent, Venue } from "@/types/courtside";

export {
  canManageOrganisationEvents,
  eventDateTimeToIso,
  eventLocalParts,
  eventVisibilityDescription,
  organisationCanHostEvents,
  organisationEventErrorMessage,
  organisationEventStages,
  organisationEventState,
  validateOrganisationEventInput
} from "@/lib/organisation-event-policy";
export type { OrganisationEventFormInput, OrganisationEventStage, OrganisationEventState, OrganisationEventValidationError, ValidatedOrganisationEventInput } from "@/lib/organisation-event-policy";

export type OrganisationEvent = CourtSideEvent & {
  assignedPlayerCount: number;
  assignedStaffCount: number;
  host: Pick<Venue, "id" | "name" | "organisation_type"> | null;
};

export async function loadOrganisationEvents(context: AuthenticatedTeamRContext, includeArchived = false) {
  if (!context.venueId) return { data: [] as OrganisationEvent[], error: null };
  let query = context.supabase
    .from("events")
    .select("*,host:venue_id(id,name,organisation_type)")
    .eq("venue_id", context.venueId)
    .order("starts_at", { ascending: true });
  query = includeArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) {
    console.error("[organisation-events] list_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as OrganisationEvent[], error: "Events could not be loaded." };
  }
  const events = (data ?? []) as unknown as Array<Omit<OrganisationEvent, "assignedPlayerCount" | "assignedStaffCount">>;
  const eventIds = events.map((event) => event.id);
  const [playerResult, staffResult] = eventIds.length ? await Promise.all([
    context.supabase.from("event_player_assignments").select("event_id").in("event_id", eventIds).eq("status", "active"),
    context.supabase.from("event_staff_assignments").select("event_id").in("event_id", eventIds).eq("status", "active")
  ]) : [{ data: [] }, { data: [] }];
  const counts = (rows: Array<{ event_id: string }> | null) => rows?.reduce((map, row) => map.set(row.event_id, (map.get(row.event_id) ?? 0) + 1), new Map<string, number>()) ?? new Map<string, number>();
  const playerCounts = counts(playerResult.data as Array<{ event_id: string }> | null);
  const staffCounts = counts(staffResult.data as Array<{ event_id: string }> | null);
  return { data: events.map((event) => ({ ...event, assignedPlayerCount: playerCounts.get(event.id) ?? 0, assignedStaffCount: staffCounts.get(event.id) ?? 0 })), error: null };
}

export async function loadOrganisationEvent(context: AuthenticatedTeamRContext, eventId: string) {
  if (!context.venueId) return { data: null as OrganisationEvent | null, error: "Organisation context is unavailable." };
  const { data, error } = await context.supabase
    .from("events")
    .select("*,host:venue_id(id,name,organisation_type)")
    .eq("id", eventId)
    .eq("venue_id", context.venueId)
    .maybeSingle();
  if (error || !data) return { data: null as OrganisationEvent | null, error: "Event not found in this organisation." };
  return { data: { ...(data as unknown as OrganisationEvent), assignedPlayerCount: 0, assignedStaffCount: 0 }, error: null };
}
