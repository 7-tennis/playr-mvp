"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNotification } from "@/lib/notifications";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Profile } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(formData: FormData) {
  const candidate = text(formData, "returnTo");
  return candidate.startsWith("/dashboard/venues/") || candidate.startsWith("/dashboard/book-court") ? candidate : "/dashboard/venues";
}

function redirectWithError(error: string, returnTo = "/dashboard/venues"): never {
  const target = new URL(returnTo, "http://localhost");
  target.searchParams.set("error", error);
  redirect(`${target.pathname}${target.search}`);
}

function bookingErrorMessage(message?: string, code?: string) {
  if (code === "23P01" || message?.includes("court_unavailable")) return "That court is already booked at this time.";
  if (message?.includes("member_booking_limit_reached")) return "You have reached this club's active member booking limit.";
  if (message?.includes("guest_booking_limit_reached")) return "You have reached this club's guest booking limit.";
  if (message?.includes("booking_time_outside_rules")) return "Choose a time within this club's booking hours and advance window.";
  if (message?.includes("court_not_eligible")) return "That court is not available for this booking type.";
  if (message?.includes("guest_name_required")) return "Add the guest name before confirming.";
  if (message?.includes("guest_email_required")) return "Add the guest email before confirming.";
  if (message?.includes("guest_phone_required")) return "Add the guest phone number before confirming.";
  if (message?.includes("guest_approval_required")) return "This club requires approval before guest court booking.";
  if (message?.includes("guest_booking_disabled")) return "Guest bookings are not available at this club.";
  return "We could not create that booking. Please choose another time.";
}

export async function createCourtBooking(formData: FormData) {
  const courtId = text(formData, "courtId");
  const venueId = text(formData, "venueId");
  const profileId = text(formData, "profileId");
  const startValue = text(formData, "startTime");
  const endValue = text(formData, "endTime");
  const returnTo = safeReturnTo(formData);
  const startTime = new Date(startValue);
  const endTime = new Date(endValue);

  if (!courtId || !venueId || !profileId || !Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || endTime <= startTime) {
    redirectWithError("Choose a valid court, time and player before booking.", returnTo);
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,is_junior")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError || !profileData) redirectWithError("Choose your own profile or an authorised linked junior.", returnTo);
  const player = profileData as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior">;

  const { data: bookingData, error } = await supabase.rpc("playr_create_venue_booking", {
    p_court_id: courtId,
    p_end_time: endTime.toISOString(),
    p_guest_email: text(formData, "guestEmail") || null,
    p_guest_name: text(formData, "guestName") || null,
    p_guest_phone: text(formData, "guestPhone") || null,
    p_notes: text(formData, "notes") || null,
    p_profile_id: profileId,
    p_start_time: startTime.toISOString(),
    p_venue_id: venueId
  });

  if (error || !bookingData) {
    console.error("[venues] court_booking_failed", { code: error?.code ?? null, courtId, profileId, venueId });
    redirectWithError(bookingErrorMessage(error?.message, error?.code), returnTo);
  }

  const result = bookingData as { bookingId: string; bookingType: "member_booking" | "guest_booking"; status: string };
  await createNotification(supabase, {
    userId: user.id,
    actorUserId: user.id,
    profileId: player.id,
    juniorProfileId: player.is_junior ? player.id : null,
    type: "court_booking_confirmed",
    title: "Court booking confirmed",
    message: `${player.first_name} ${player.last_name}'s ${result.bookingType === "guest_booking" ? "guest " : ""}court booking is confirmed.`,
    href: "/dashboard/my-bookings",
    metadata: { booking_id: result.bookingId, booking_type: result.bookingType, court_id: courtId, profile_id: player.id, start_time: startTime.toISOString(), venue_id: venueId },
    dedupeKey: `court_booking_confirmed:${result.bookingId}`
  });

  revalidatePath("/dashboard/venues");
  revalidatePath(`/dashboard/venues/${venueId}`);
  revalidatePath(`/dashboard/venues/${venueId}/book`);
  revalidatePath("/dashboard/my-bookings");
  const successTarget = new URL(returnTo, "http://localhost");
  successTarget.searchParams.set("booking", "created");
  successTarget.searchParams.delete("error");
  redirect(`${successTarget.pathname}${successTarget.search}`);
}

export async function cancelOwnCourtBooking(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  if (!bookingId) redirect("/dashboard/my-bookings?error=invalid_booking");
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: booking } = await supabase
    .from("court_bookings")
    .select("id,start_time,status,booked_by_user_id,booking_type,source_product,coach_lesson_id,coach_session_occurrence_id")
    .eq("id", bookingId)
    .eq("booked_by_user_id", user.id)
    .maybeSingle();
  const playerOwned = booking?.booking_type === "player_booking" && booking.source_product === "playr" && !booking.coach_lesson_id && !booking.coach_session_occurrence_id;
  if (!booking || !playerOwned || booking.status !== "confirmed" || new Date(booking.start_time).getTime() <= Date.now()) {
    redirect("/dashboard/my-bookings?error=cannot_cancel");
  }

  const { error } = await supabase.from("court_bookings").update({ cancelled_at: new Date().toISOString(), cancelled_by_user_id: user.id, status: "cancelled" }).eq("id", bookingId).eq("booked_by_user_id", user.id);
  if (error) {
    console.error("[venues] user_booking_cancellation_failed", { bookingId, code: error.code, userId: user.id });
    redirect("/dashboard/my-bookings?error=cancel_failed");
  }

  revalidatePath("/dashboard/venues");
  revalidatePath("/dashboard/my-bookings");
  redirect("/dashboard/my-bookings?booking=cancelled");
}
