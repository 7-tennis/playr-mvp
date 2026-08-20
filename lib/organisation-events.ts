import type { AuthenticatedTeamRContext } from "@/lib/teamr";
import type { CourtSideEvent, Venue } from "@/types/courtside";

export {
  canManageOrganisationEvents,
  eventDateTimeToIso,
  eventLocalParts,
  eventVisibilityDescription,
  organisationCanHostEvents,
  organisationEventStages,
  organisationEventState
} from "@/lib/organisation-event-policy";
export type { OrganisationEventStage, OrganisationEventState } from "@/lib/organisation-event-policy";

export type OrganisationEvent = CourtSideEvent & {
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
  return { data: (data ?? []) as unknown as OrganisationEvent[], error: null };
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
  return { data: data as unknown as OrganisationEvent, error: null };
}
