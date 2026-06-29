"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, Profile } from "@/types/courtside";

export type EntryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type ExistingEntry = {
  id: string;
};

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createEventEntry(_previousState: EntryActionState, formData: FormData): Promise<EntryActionState> {
  const eventId = getStringValue(formData, "eventId");
  const eventSlug = getStringValue(formData, "eventSlug");
  const profileId = getStringValue(formData, "profileId");

  if (!eventId || !eventSlug || !profileId) {
    return { status: "error", message: "Choose a player profile before entering." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: "error", message: "Log in or sign up before entering this event." };
  }

  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id,title,slug,member_price,non_member_price,max_entries,status")
    .eq("id", eventId)
    .eq("status", "published")
    .single();

  if (eventError || !eventData) {
    return { status: "error", message: "This event is no longer available for entries." };
  }

  const event = eventData as Pick<CourtSideEvent, "id" | "title" | "slug" | "member_price" | "non_member_price" | "max_entries" | "status">;

  const { data: countData } = await supabase.rpc("event_entry_count", { check_event_id: event.id });
  const entryCount = typeof countData === "number" ? countData : null;

  if (event.max_entries && entryCount !== null && entryCount >= event.max_entries) {
    return { status: "error", message: "Event full. Entries are closed for this event." };
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,member_status,is_junior,parent_profile_id")
    .eq("id", profileId)
    .single();

  if (profileError || !profileData) {
    return { status: "error", message: "Choose one of your own profiles or a linked junior profile." };
  }

  const profile = profileData as Pick<Profile, "id" | "first_name" | "last_name" | "member_status" | "is_junior" | "parent_profile_id">;

  const { data: existingEntry } = await supabase
    .from("event_entries")
    .select("id")
    .eq("event_id", event.id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if ((existingEntry as ExistingEntry | null)?.id) {
    return { status: "error", message: `${profile.first_name} ${profile.last_name} is already entered for this event.` };
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
      return { status: "error", message: `${profile.first_name} ${profile.last_name} is already entered for this event.` };
    }

    return { status: "error", message: "We could not submit this entry. Please try again or contact the club desk." };
  }

  revalidatePath(`/events/${eventSlug}`);
  revalidatePath("/events");
  revalidatePath("/dashboard/my-entries");

  return {
    status: "success",
    message: `Entry confirmed for ${profile.first_name} ${profile.last_name}. Please pay ${priceCharged.toLocaleString("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0
    })} by EFT or at the club desk. Your payment status will remain unpaid until an admin marks it as received.`
  };
}
