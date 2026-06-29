"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, Profile } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeDashboardRedirect(value: string) {
  if (value.startsWith("/dashboard/events")) {
    return value;
  }

  return "/dashboard/events";
}

function redirectWithParams(path: string, params: Record<string, string>) {
  const target = new URL(path, "http://localhost");
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
  redirect(`${target.pathname}${target.search}`);
}

export async function enterDashboardEvent(formData: FormData) {
  const eventId = text(formData, "eventId");
  const profileId = text(formData, "profileId");
  const returnTo = safeDashboardRedirect(text(formData, "returnTo"));

  if (!eventId || !profileId) {
    redirectWithParams(returnTo, { error: "missing_fields" });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id,title,slug,member_price,non_member_price,max_entries,status,start_datetime")
    .eq("id", eventId)
    .eq("status", "published")
    .single();

  if (eventError || !eventData) {
    redirectWithParams(returnTo, { error: "event_unavailable" });
  }

  const event = eventData as Pick<
    CourtSideEvent,
    "id" | "title" | "slug" | "member_price" | "non_member_price" | "max_entries" | "status" | "start_datetime"
  >;

  if (new Date(event.start_datetime).getTime() < Date.now()) {
    redirectWithParams(returnTo, { error: "event_closed" });
  }

  const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
  const entryCount = typeof countData === "number" ? countData : null;

  if (event.max_entries && entryCount !== null && entryCount >= event.max_entries) {
    redirectWithParams(returnTo, { error: "event_full" });
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,member_status,is_junior,parent_profile_id")
    .eq("id", profileId)
    .single();

  if (profileError || !profileData) {
    redirectWithParams(returnTo, { error: "profile_not_allowed" });
  }

  const profile = profileData as Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior" | "parent_profile_id">;

  const { data: existingEntry } = await supabase
    .from("event_entries")
    .select("id,entry_status")
    .eq("event_id", event.id)
    .eq("profile_id", profile.id)
    .neq("entry_status", "cancelled")
    .maybeSingle();

  if (existingEntry) {
    redirectWithParams(returnTo, { error: "already_entered" });
  }

  const priceCharged = profile.member_status === "member" ? event.member_price : event.non_member_price;
  const { error: insertError } = await supabase.from("event_entries").insert({
    event_id: event.id,
    profile_id: profile.id,
    entered_by_user_id: user.id,
    price_charged: priceCharged,
    payment_status: "unpaid",
    entry_status: "active"
  });

  if (insertError) {
    if (insertError.code === "23505") {
      redirectWithParams(returnTo, { error: "already_entered" });
    }

    redirectWithParams(returnTo, { error: "entry_failed" });
  }

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath("/dashboard/my-entries");
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/events");

  redirectWithParams(returnTo, {
    entered: "1",
    player: `${profile.first_name} ${profile.last_name}`,
    event: event.title
  });
}

export async function withdrawDashboardEventEntry(formData: FormData) {
  const entryId = text(formData, "entryId");
  const returnTo = safeDashboardRedirect(text(formData, "returnTo"));

  if (!entryId) {
    redirectWithParams(returnTo, { error: "invalid_entry" });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: entryData, error: entryError } = await supabase
    .from("event_entries")
    .select("id,event_id,entry_status,events:event_id(id,slug,start_datetime,status)")
    .eq("id", entryId)
    .maybeSingle();

  if (entryError || !entryData) {
    redirectWithParams(returnTo, { error: "invalid_entry" });
  }

  const entry = entryData as unknown as {
    id: string;
    event_id: string;
    entry_status: string;
    events: Pick<CourtSideEvent, "id" | "slug" | "start_datetime" | "status"> | Pick<CourtSideEvent, "id" | "slug" | "start_datetime" | "status">[] | null;
  };
  const entryEvent = Array.isArray(entry.events) ? entry.events[0] : entry.events;

  if (entry.entry_status === "cancelled") {
    redirectWithParams(returnTo, { error: "already_withdrawn" });
  }

  if (!entryEvent || entryEvent.status !== "published" || new Date(entryEvent.start_datetime).getTime() <= Date.now()) {
    redirectWithParams(returnTo, { error: "withdraw_closed" });
  }

  const { error: updateError } = await supabase
    .from("event_entries")
    .update({
      entry_status: "cancelled",
      status: "cancelled"
    })
    .eq("id", entry.id);

  if (updateError) {
    console.error("CourtSide event withdrawal failed", { entryId, userId: user.id, error: updateError });
    redirectWithParams(returnTo, { error: "withdraw_failed" });
  }

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${entry.event_id}`);
  revalidatePath("/dashboard/my-entries");
  if (entryEvent?.slug) {
    revalidatePath(`/events/${entryEvent.slug}`);
  }
  revalidatePath("/events");

  redirectWithParams(returnTo, { withdrawn: "1" });
}
