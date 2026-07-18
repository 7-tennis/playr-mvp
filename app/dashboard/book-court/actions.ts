"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNotification } from "@/lib/notifications";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, Profile } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(formData: FormData) {
  const candidate = text(formData, "returnTo");
  return candidate.startsWith("/dashboard/book-court") ? candidate : "/dashboard/book-court";
}

function redirectWithError(error: string, returnTo = "/dashboard/book-court"): never {
  const target = new URL(returnTo, "http://localhost");
  target.searchParams.set("error", error);
  redirect(`${target.pathname}${target.search}`);
}

function isWithinUserBookingWindow(start: Date, advanceBookingDays: number) {
  const now = Date.now();
  const max = now + advanceBookingDays * 24 * 60 * 60 * 1000;
  return start.getTime() >= now && start.getTime() < max;
}

export async function createCourtBooking(formData: FormData) {
  const courtId = text(formData, "courtId");
  const profileId = text(formData, "profileId");
  const startValue = text(formData, "startTime");
  const notes = text(formData, "notes");
  const returnTo = safeReturnTo(formData);

  if (!courtId || !profileId || !startValue) {
    redirectWithError("Choose a court, time, and player before booking.", returnTo);
  }

  const startTime = new Date(startValue);

  if (!Number.isFinite(startTime.getTime())) {
    redirectWithError("Choose a valid court time.", returnTo);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: courtData, error: courtError } = await supabase.from("courts").select("id,status,venue_id").eq("id", courtId).eq("status", "active").single();

  if (courtError || !courtData) {
    redirectWithError("That court is not available.", returnTo);
  }

  const { data: bookingSettings, error: bookingSettingsError } = courtData.venue_id
    ? await supabase.from("organisation_booking_settings").select("advance_booking_days,slot_minutes").eq("venue_id", courtData.venue_id).maybeSingle()
    : { data: null, error: null };
  if (bookingSettingsError) {
    console.error("CourtSide booking settings could not be loaded", { code: bookingSettingsError.code, courtId });
    redirectWithError("Court booking rules could not be confirmed. Please try again.", returnTo);
  }
  const advanceBookingDays = Math.max(1, Math.min(90, Number(bookingSettings?.advance_booking_days ?? 7)));
  const slotMinutes = Math.max(15, Math.min(120, Number(bookingSettings?.slot_minutes ?? 60)));
  const endTime = new Date(startTime.getTime() + slotMinutes * 60 * 1000);
  if (!isWithinUserBookingWindow(startTime, advanceBookingDays)) {
    redirectWithError(`Choose a time in the next ${advanceBookingDays} days.`, returnTo);
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior")
    .eq("id", profileId)
    .single();

  if (profileError || !profileData) {
    redirectWithError("Choose your own profile or a linked junior profile.", returnTo);
  }

  const player = profileData as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior">;
  const { data: bookingData, error } = await supabase
    .from("court_bookings")
    .insert({
      court_id: (courtData as Pick<Court, "id">).id,
      booked_by_user_id: user.id,
      player_profile_id: player.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status: "confirmed",
      booking_type: "player_booking",
      is_public: false,
      notes: notes || null,
      owner_organisation_id: courtData.venue_id,
      booking_organisation_id: null,
      booking_purpose: "member_booking",
      source_product: "playr"
    })
    .select("id")
    .single();

  if (error || !bookingData) {
    console.error("CourtSide court booking failed", { courtId, profileId, startValue, error });
    if (error?.code === "23P01") {
      redirectWithError("That slot has just been booked. Choose another time.", returnTo);
    }
    redirectWithError("We could not create that booking. Please try another slot.", returnTo);
  }

  await createNotification(supabase, {
    userId: user.id,
    actorUserId: user.id,
    profileId: player.id,
    juniorProfileId: player.is_junior ? player.id : null,
    type: "court_booking_confirmed",
    title: "Court booking confirmed",
    message: `${player.first_name} ${player.last_name}'s court booking is confirmed.`,
    href: "/dashboard/my-bookings",
    metadata: {
      booking_id: bookingData.id as string,
      profile_id: player.id,
      court_id: (courtData as Pick<Court, "id">).id,
      start_time: startTime.toISOString()
    },
    dedupeKey: `court_booking_confirmed:${bookingData.id as string}`
  });

  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/my-bookings");
  const successTarget = new URL(returnTo, "http://localhost");
  successTarget.searchParams.set("booking", "created");
  successTarget.searchParams.delete("error");
  redirect(`${successTarget.pathname}${successTarget.search}`);
}

export async function cancelOwnCourtBooking(formData: FormData) {
  const bookingId = text(formData, "bookingId");

  if (!bookingId) {
    redirect("/dashboard/my-bookings?error=invalid_booking");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: booking } = await supabase
    .from("court_bookings")
    .select("id,start_time,status,booked_by_user_id")
    .eq("id", bookingId)
    .eq("booked_by_user_id", user.id)
    .maybeSingle();

  if (!booking || booking.status !== "confirmed" || new Date(booking.start_time).getTime() <= Date.now()) {
    redirect("/dashboard/my-bookings?error=cannot_cancel");
  }

  const { error } = await supabase
    .from("court_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_id: user.id
    })
    .eq("id", bookingId)
    .eq("booked_by_user_id", user.id);

  if (error) {
    console.error("CourtSide user booking cancellation failed", { bookingId, userId: user.id, error });
    redirect("/dashboard/my-bookings?error=cancel_failed");
  }

  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/my-bookings");
  redirect("/dashboard/my-bookings?booking=cancelled");
}
