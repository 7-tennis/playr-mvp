"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageOrganisationEvents, loadOrganisationEvent, validateOrganisationEventInput } from "@/lib/organisation-events";
import { getTeamRAccess, loadTeamRVenue } from "@/lib/teamr";
import type { EventStatus } from "@/types/courtside";

const eventsPath = "/dashboard/teamr/competitions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function eventPath(eventId: string) {
  return `${eventsPath}/${eventId}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "event";
}

type DatabaseError = { code?: string; details?: string; hint?: string; message?: string } | null;

function databaseErrorCode(error: DatabaseError) {
  const message = error?.message ?? "";
  if (error?.code === "PGRST204" || message.includes("schema cache")) return "schema_unavailable";
  if (error?.code === "42501" || message.includes("row-level security")) return "access";
  if (message.includes("events_datetime_order") || message.includes("events_v1_datetime_order")) return "invalid_time";
  if (message.includes("events_max_entries_positive") || message.includes("events_v1_capacity_positive")) return "invalid_capacity";
  if (message.includes("event_host_immutable")) return "host_immutable";
  if (message.includes("invalid_event_status_transition")) return "invalid_transition";
  if (message.includes("unsupported_event_host")) return "unsupported_host";
  return error?.code === "23505" ? "duplicate" : "save_failed";
}

function logDatabaseError(operation: "create" | "transition" | "update", error: DatabaseError, context: { eventId?: string; venueId: string | null }) {
  console.error("[organisation-events] database_operation_failed", {
    code: error?.code,
    details: error?.details,
    eventId: context.eventId,
    hint: error?.hint,
    message: error?.message,
    operation,
    venueId: context.venueId
  });
}

async function requireEventManagementContext() {
  const access = await getTeamRAccess();
  if (access.context.kind !== "authenticated" || !access.allowed || !access.context.venueId) redirect(`${eventsPath}?error=access`);
  const venue = await loadTeamRVenue(access.context);
  if (!venue || !canManageOrganisationEvents({ activeOrganisationRole: access.context.activeOrganisationRole, organisationType: venue.organisation_type, role: access.context.role })) {
    redirect(`${eventsPath}?error=access`);
  }
  return { context: access.context, venue };
}

function formPayload(formData: FormData) {
  return validateOrganisationEventInput({
    capacity: text(formData, "capacity"),
    date: text(formData, "date"),
    description: text(formData, "description"),
    endTime: text(formData, "endTime"),
    juniorStage: text(formData, "juniorStage"),
    location: text(formData, "location"),
    startTime: text(formData, "startTime"),
    title: text(formData, "title"),
    visibility: text(formData, "visibility")
  });
}

export async function createOrganisationEvent(formData: FormData) {
  const { context } = await requireEventManagementContext();
  const validation = formPayload(formData);
  const requestedStatus = text(formData, "status");
  const status: EventStatus = requestedStatus === "published" ? "published" : "draft";
  if (!validation.ok) redirect(`${eventsPath}/new?error=${validation.error}`);
  const values = validation.value;
  const slug = `${slugify(values.title)}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await context.supabase.from("events").insert({
    venue_id: context.venueId,
    title: values.title,
    slug,
    description: values.description,
    event_type: "organisation_event",
    sport: "tennis",
    category: null,
    age_group: null,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    start_datetime: values.startsAt,
    end_datetime: values.endsAt,
    location: values.location,
    capacity: values.capacity,
    max_entries: values.capacity,
    entry_fee: 0,
    member_price: 0,
    non_member_price: 0,
    status,
    visibility: values.visibility,
    junior_stage: values.juniorStage,
    created_by: context.user.id
  }).select("id").single();
  if (error || !data?.id) {
    logDatabaseError("create", error, { venueId: context.venueId });
    redirect(`${eventsPath}/new?error=${databaseErrorCode(error)}`);
  }
  revalidatePath(eventsPath);
  revalidatePath("/dashboard/teamr");
  redirect(`${eventPath(String(data.id))}?message=created`);
}

export async function updateOrganisationEvent(formData: FormData) {
  const { context } = await requireEventManagementContext();
  const eventId = text(formData, "eventId");
  const validation = formPayload(formData);
  if (!eventId) redirect(`${eventsPath}?error=invalid_event`);
  if (!validation.ok) redirect(`${eventPath(eventId)}/edit?error=${validation.error}`);
  const values = validation.value;
  const existing = await loadOrganisationEvent(context, eventId);
  if (!existing.data || existing.data.archived_at || !["draft", "published"].includes(existing.data.status)) redirect(`${eventPath(eventId)}?error=edit_unavailable`);
  const { data, error } = await context.supabase.from("events").update({
    title: values.title,
    description: values.description,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    start_datetime: values.startsAt,
    end_datetime: values.endsAt,
    location: values.location,
    capacity: values.capacity,
    max_entries: values.capacity,
    visibility: values.visibility,
    junior_stage: values.juniorStage
  }).eq("id", eventId).eq("venue_id", context.venueId).select("id").maybeSingle();
  if (error || !data) {
    logDatabaseError("update", error, { eventId, venueId: context.venueId });
    redirect(`${eventPath(eventId)}/edit?error=${databaseErrorCode(error)}`);
  }
  revalidatePath(eventsPath);
  revalidatePath(eventPath(eventId));
  revalidatePath("/dashboard/teamr");
  redirect(`${eventPath(eventId)}?message=updated`);
}

export async function transitionOrganisationEvent(formData: FormData) {
  const { context } = await requireEventManagementContext();
  const eventId = text(formData, "eventId");
  const action = text(formData, "eventAction");
  if (!eventId || !["publish", "unpublish", "cancel", "complete", "archive"].includes(action)) redirect(`${eventsPath}?error=invalid_transition`);
  const existing = await loadOrganisationEvent(context, eventId);
  if (!existing.data || existing.data.archived_at) redirect(`${eventPath(eventId)}?error=invalid_transition`);
  const allowed = (action === "publish" && existing.data.status === "draft")
    || (action === "unpublish" && existing.data.status === "published")
    || (action === "cancel" && ["draft", "published"].includes(existing.data.status))
    || (action === "complete" && existing.data.status === "published")
    || action === "archive";
  if (!allowed) redirect(`${eventPath(eventId)}?error=invalid_transition`);
  const payload = action === "archive"
    ? { archived_at: new Date().toISOString(), archived_by_user_id: context.user.id }
    : { status: ({ publish: "published", unpublish: "draft", cancel: "cancelled", complete: "completed" } as const)[action as "publish" | "unpublish" | "cancel" | "complete"] };
  const { data, error } = await context.supabase.from("events").update(payload).eq("id", eventId).eq("venue_id", context.venueId).select("id").maybeSingle();
  if (error || !data) {
    logDatabaseError("transition", error, { eventId, venueId: context.venueId });
    redirect(`${eventPath(eventId)}?error=${databaseErrorCode(error)}`);
  }
  revalidatePath(eventsPath);
  revalidatePath(eventPath(eventId));
  revalidatePath("/dashboard/teamr");
  redirect(action === "archive" ? `${eventsPath}?message=archived` : `${eventPath(eventId)}?message=${action}ed`);
}
