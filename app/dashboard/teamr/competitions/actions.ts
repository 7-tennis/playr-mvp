"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageOrganisationEvents, eventDateTimeToIso, loadOrganisationEvent, organisationEventStages } from "@/lib/organisation-events";
import { getTeamRAccess, loadTeamRVenue } from "@/lib/teamr";
import type { EventStatus, EventVisibility } from "@/types/courtside";

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

function databaseErrorCode(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("event_host_immutable")) return "host_immutable";
  if (message.includes("invalid_event_status_transition")) return "invalid_transition";
  if (message.includes("unsupported_event_host")) return "unsupported_host";
  return error?.code === "23505" ? "duplicate" : "save_failed";
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
  const title = text(formData, "title");
  const description = text(formData, "description") || null;
  const visibilityValue = text(formData, "visibility");
  const visibility: EventVisibility | null = visibilityValue === "closed" || visibilityValue === "open" ? visibilityValue : null;
  const location = text(formData, "location");
  const startsAt = eventDateTimeToIso(text(formData, "date"), text(formData, "startTime"));
  const endsAt = eventDateTimeToIso(text(formData, "date"), text(formData, "endTime"));
  const stageValue = text(formData, "juniorStage");
  const juniorStage = organisationEventStages.some((stage) => stage.value === stageValue) ? stageValue : null;
  const capacityValue = text(formData, "capacity");
  const capacity = capacityValue ? Number(capacityValue) : null;
  if (!title || title.length > 120 || !visibility || !location || location.length > 200 || description && description.length > 1000 || !startsAt || !endsAt || endsAt <= startsAt || capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return null;
  }
  return { title, description, visibility, location, startsAt, endsAt, juniorStage, capacity };
}

export async function createOrganisationEvent(formData: FormData) {
  const { context } = await requireEventManagementContext();
  const values = formPayload(formData);
  const requestedStatus = text(formData, "status");
  const status: EventStatus = requestedStatus === "published" ? "published" : "draft";
  if (!values) redirect(`${eventsPath}/new?error=invalid_event`);
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
  if (error || !data?.id) redirect(`${eventsPath}/new?error=${databaseErrorCode(error)}`);
  revalidatePath(eventsPath);
  revalidatePath("/dashboard/teamr");
  redirect(`${eventPath(String(data.id))}?message=created`);
}

export async function updateOrganisationEvent(formData: FormData) {
  const { context } = await requireEventManagementContext();
  const eventId = text(formData, "eventId");
  const values = formPayload(formData);
  if (!eventId || !values) redirect(`${eventsPath}?error=invalid_event`);
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
  if (error || !data) redirect(`${eventPath(eventId)}/edit?error=${databaseErrorCode(error)}`);
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
  if (error || !data) redirect(`${eventPath(eventId)}?error=${databaseErrorCode(error)}`);
  revalidatePath(eventsPath);
  revalidatePath(eventPath(eventId));
  revalidatePath("/dashboard/teamr");
  redirect(action === "archive" ? `${eventsPath}?message=archived` : `${eventPath(eventId)}?message=${action}ed`);
}
