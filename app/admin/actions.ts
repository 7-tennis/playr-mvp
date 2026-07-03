"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-auth";
import type { CourtBookingType, CourtStatus, EntryStatus, EventStatus, JuniorStage, MatchVerificationStatus, MemberStatus, PaymentStatus, Sport } from "@/types/courtside";

const eventStatuses: EventStatus[] = ["draft", "published", "cancelled", "completed"];
const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const courtStatuses: CourtStatus[] = ["active", "inactive"];
const courtBookingTypes: CourtBookingType[] = ["player_booking", "lesson", "maintenance", "club_programme", "competition", "americano"];
const matchVerificationStatuses: MatchVerificationStatus[] = ["pending_confirmation", "verified", "disputed", "admin_verified", "cancelled"];
const juniorStages: JuniorStage[] = ["red_ball", "orange_ball", "green_ball", "yellow_ball", "not_sure"];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function datetimeValue(formData: FormData, key: string) {
  const value = text(formData, key);
  return value ? new Date(value).toISOString() : "";
}

function requireStatus<T extends string>(value: string, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function messageRedirect(fallbackPath: string, key: string, value: string): never {
  const referer = headers().get("referer");
  const target = referer ? new URL(referer) : new URL(fallbackPath, "http://localhost");
  target.searchParams.set(key, value);
  redirect(`${target.pathname}${target.search}`);
}

async function requireAdminSupabase() {
  const { supabase, isAdmin, user } = await getAdminContext();

  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return { supabase, user };
}

async function applyRatingForVerifiedMatch(supabase: Awaited<ReturnType<typeof requireAdminSupabase>>["supabase"], matchId: string, userId: string) {
  const { error } = await supabase.rpc("apply_verified_match_progress", { target_match_id: matchId });

  if (error) {
    console.error("PlayR match progress calculation failed after admin verification", { userId, matchId, error });
  }
}

export async function updateProfileMemberStatus(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const profileId = text(formData, "profileId");
  const memberStatus = requireStatus<MemberStatus>(text(formData, "memberStatus"), ["member", "non_member", "pending", "inactive"], "pending");

  if (profileId) {
    await supabase.from("profiles").update({ member_status: memberStatus }).eq("id", profileId);
  }

  revalidatePath("/admin/profiles");
}

export async function updateJuniorRatingControls(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const profileId = text(formData, "profileId");
  const stage = requireStatus<JuniorStage>(text(formData, "juniorStage"), juniorStages, "red_ball");
  const rating = numberValue(formData, "juniorRating", 2.5);
  const stageReadiness = numberValue(formData, "stageReadinessScore", 0);
  const ratingLocked = text(formData, "ratingLocked") === "on";
  const ratingNotes = nullableText(formData, "ratingNotes");

  if (!profileId) {
    redirect("/admin/profiles?admin_message=invalid_profile");
  }

  const { error } = await supabase.rpc("admin_adjust_junior_rating", {
    target_player_id: profileId,
    target_stage: stage,
    target_rating: rating,
    target_locked: ratingLocked,
    target_stage_readiness: stageReadiness,
    target_notes: ratingNotes,
    target_reason: "manual_adjustment"
  });

  if (error) {
    console.error("PlayR junior rating update failed", { profileId, error });
    redirect("/admin/profiles?admin_message=junior_rating_failed");
  }

  revalidatePath("/admin/profiles");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/juniors");
  redirect("/admin/profiles?admin_message=junior_rating_updated&profile_type=junior");
}

export async function transitionJuniorStage(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const profileId = text(formData, "profileId");
  const stage = requireStatus<JuniorStage>(text(formData, "targetStage"), juniorStages, "orange_ball");
  const notes = nullableText(formData, "transitionNotes");

  if (!profileId) {
    redirect("/admin/profiles?admin_message=invalid_profile");
  }

  const { error } = await supabase.rpc("admin_transition_junior_stage", {
    target_player_id: profileId,
    target_stage: stage,
    target_notes: notes
  });

  if (error) {
    console.error("PlayR junior stage transition failed", { profileId, stage, error });
    redirect("/admin/profiles?admin_message=junior_transition_failed");
  }

  revalidatePath("/admin/profiles");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/juniors");
  redirect("/admin/profiles?admin_message=junior_stage_updated&profile_type=junior");
}

export async function awardJuniorAchievement(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const profileId = text(formData, "profileId");
  const badgeKey = text(formData, "badgeKey") || "coach_achievement";
  const badgeName = text(formData, "badgeName") || "Coach Achievement";
  const notes = nullableText(formData, "achievementNotes");

  if (!profileId) {
    redirect("/admin/profiles?admin_message=invalid_profile");
  }

  const { error } = await supabase.rpc("admin_award_junior_badge", {
    target_player_id: profileId,
    target_badge_key: badgeKey,
    target_badge_name: badgeName,
    target_category: "coach",
    target_stage: "all",
    target_badge_type: "admin_approved",
    target_notes: notes
  });

  if (error) {
    console.error("PlayR junior achievement award failed", { profileId, badgeKey, error });
    redirect("/admin/profiles?admin_message=junior_badge_failed");
  }

  revalidatePath("/admin/profiles");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/juniors");
  redirect("/admin/profiles?admin_message=junior_badge_awarded&profile_type=junior");
}

function eventPayload(formData: FormData) {
  const startDatetime = datetimeValue(formData, "start_datetime");
  const endDatetime = datetimeValue(formData, "end_datetime");
  const category = nullableText(formData, "category");
  const maxEntries = nullableInteger(formData, "max_entries");
  const nonMemberPrice = numberValue(formData, "non_member_price");

  return {
    title: text(formData, "title"),
    slug: text(formData, "slug"),
    description: nullableText(formData, "description"),
    event_type: nullableText(formData, "event_type") ?? category,
    sport: requireStatus<Sport>(text(formData, "sport"), sports, "tennis"),
    category,
    age_group: nullableText(formData, "age_group"),
    starts_at: startDatetime,
    ends_at: endDatetime,
    start_datetime: startDatetime,
    end_datetime: endDatetime,
    location: nullableText(formData, "location"),
    member_price: numberValue(formData, "member_price"),
    non_member_price: nonMemberPrice,
    entry_fee: nonMemberPrice,
    max_entries: maxEntries,
    capacity: maxEntries,
    status: requireStatus<EventStatus>(text(formData, "status"), eventStatuses, "draft")
  };
}

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireAdminSupabase();
  const payload = { ...eventPayload(formData), created_by: user.id };
  const { data, error } = await supabase.from("events").insert(payload).select("id").single();

  if (error || !data) {
    redirect("/admin/events/new?error=save_failed");
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect(`/admin/events/${data.id}/edit?admin_message=event_created`);
}

export async function updateEvent(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const eventId = text(formData, "eventId");

  if (!eventId) {
    redirect("/admin/events");
  }

  await supabase.from("events").update(eventPayload(formData)).eq("id", eventId);

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath("/events");
  redirect(`/admin/events/${eventId}/edit?admin_message=event_updated`);
}

export async function updateEventStatus(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const eventId = text(formData, "eventId");
  const status = requireStatus<EventStatus>(text(formData, "status"), eventStatuses, "draft");

  if (eventId) {
    await supabase.from("events").update({ status }).eq("id", eventId);
  }

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath("/events");
  messageRedirect("/admin/events", "admin_message", `event_${status}`);
}

export async function updateEntryStatuses(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const entryId = text(formData, "entryId");
  const eventId = text(formData, "eventId");
  const paymentStatus = requireStatus<PaymentStatus>(
    text(formData, "paymentStatus"),
    ["unpaid", "pending", "paid", "refunded", "cancelled"],
    "unpaid"
  );
  const entryStatus = requireStatus<EntryStatus>(
    text(formData, "entryStatus"),
    ["active", "cancelled", "checked_in", "no_show"],
    "active"
  );

  if (!entryId) {
    messageRedirect("/admin/entries", "admin_message", "invalid_entry");
  }

  const { data: existingEntry } = await supabase
    .from("event_entries")
    .select("id,event_id,payment_received_at")
    .eq("id", entryId)
    .maybeSingle();

  if (!existingEntry) {
    messageRedirect("/admin/entries", "admin_message", "invalid_entry");
  }

  const receivedAt =
    paymentStatus === "paid"
      ? existingEntry.payment_received_at ?? new Date().toISOString()
      : paymentStatus === "refunded"
        ? existingEntry.payment_received_at
        : null;

  await supabase
    .from("event_entries")
    .update({
      payment_status: paymentStatus,
      payment_received_at: receivedAt,
      payment_reference: nullableText(formData, "paymentReference"),
      payment_notes: nullableText(formData, "paymentNotes"),
      entry_status: entryStatus
    })
    .eq("id", entryId);

  revalidatePath("/admin/entries");
  const resolvedEventId = eventId || existingEntry.event_id;
  if (resolvedEventId) {
    revalidatePath(`/admin/events/${resolvedEventId}/entries`);
  }
  messageRedirect("/admin/entries", "admin_message", "payment_updated");
}

export async function createResult(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const eventId = text(formData, "eventId");
  const profileId = text(formData, "profileId");

  if (!eventId || !profileId) {
    redirect("/admin/results?error=missing_result_fields");
  }

  await supabase.from("event_results").upsert(
    {
      event_id: eventId,
      profile_id: profileId,
      placement: nullableInteger(formData, "placement"),
      points: nullableNumber(formData, "points"),
      result_notes: nullableText(formData, "result_notes")
    },
    { onConflict: "event_id,profile_id" }
  );

  revalidatePath("/admin/results");
  redirect(`/admin/results?event_id=${eventId}&admin_message=result_saved`);
}

export async function updateMatchVerificationStatus(formData: FormData) {
  const { supabase, user } = await requireAdminSupabase();
  const matchId = text(formData, "matchId");
  const status = requireStatus<MatchVerificationStatus>(text(formData, "verificationStatus"), matchVerificationStatuses, "admin_verified");

  if (!matchId) {
    messageRedirect("/admin/results", "admin_message", "invalid_match");
  }

  const confirmed = status === "verified" || status === "admin_verified";
  const { error } = await supabase
    .from("matches")
    .update({
      verification_status: status,
      confirmed_by_user_id: confirmed ? user.id : null,
      confirmed_at: confirmed ? new Date().toISOString() : null
    })
    .eq("id", matchId);

  if (error) {
    console.error("CourtSide admin match verification update failed", { matchId, status, error });
    messageRedirect("/admin/results", "admin_message", "match_update_failed");
  }

  if (confirmed) {
    await applyRatingForVerifiedMatch(supabase, matchId, user.id);
  }

  revalidatePath("/admin/results");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/profile");
  messageRedirect("/admin/results", "admin_message", "match_updated");
}

export async function createCourt(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const name = text(formData, "name");

  if (!name) {
    redirect("/admin/courts?admin_message=missing_court_name");
  }

  const { error } = await supabase.from("courts").insert({
    name,
    status: requireStatus<CourtStatus>(text(formData, "status"), courtStatuses, "active"),
    sort_order: nullableInteger(formData, "sort_order") ?? 0,
    notes: nullableText(formData, "notes")
  });

  if (error) {
    console.error("CourtSide admin court create failed", { name, error });
    redirect("/admin/courts?admin_message=court_save_failed");
  }

  revalidatePath("/admin/courts");
  revalidatePath("/dashboard/book-court");
  redirect("/admin/courts?admin_message=court_created");
}

export async function updateCourt(formData: FormData) {
  const { supabase } = await requireAdminSupabase();
  const courtId = text(formData, "courtId");

  if (!courtId) {
    redirect("/admin/courts?admin_message=invalid_court");
  }

  const { error } = await supabase
    .from("courts")
    .update({
      name: text(formData, "name"),
      status: requireStatus<CourtStatus>(text(formData, "status"), courtStatuses, "active"),
      sort_order: nullableInteger(formData, "sort_order") ?? 0,
      notes: nullableText(formData, "notes")
    })
    .eq("id", courtId);

  if (error) {
    console.error("CourtSide admin court update failed", { courtId, error });
    redirect("/admin/courts?admin_message=court_save_failed");
  }

  revalidatePath("/admin/courts");
  revalidatePath("/dashboard/book-court");
  redirect("/admin/courts?admin_message=court_updated");
}

export async function createCourtBlock(formData: FormData) {
  const { supabase, user } = await requireAdminSupabase();
  const courtId = text(formData, "courtId");
  const startTime = datetimeValue(formData, "start_time");
  const endTime = datetimeValue(formData, "end_time");
  const bookingType = requireStatus<CourtBookingType>(text(formData, "booking_type"), courtBookingTypes, "maintenance");

  if (!courtId || !startTime || !endTime) {
    redirect("/admin/bookings?admin_message=missing_booking_fields");
  }

  const { error } = await supabase.from("court_bookings").insert({
    court_id: courtId,
    booked_by_user_id: user.id,
    player_profile_id: null,
    start_time: startTime,
    end_time: endTime,
    status: "confirmed",
    booking_type: bookingType,
    is_public: true,
    notes: nullableText(formData, "notes")
  });

  if (error) {
    console.error("CourtSide admin court block create failed", { courtId, startTime, endTime, bookingType, error });
    redirect("/admin/bookings?admin_message=booking_save_failed");
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/dashboard/book-court");
  redirect("/admin/bookings?admin_message=booking_created");
}

export async function cancelCourtBookingAdmin(formData: FormData) {
  const { supabase, user } = await requireAdminSupabase();
  const bookingId = text(formData, "bookingId");

  if (!bookingId) {
    redirect("/admin/bookings?admin_message=invalid_booking");
  }

  const { error } = await supabase
    .from("court_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_id: user.id
    })
    .eq("id", bookingId);

  if (error) {
    console.error("CourtSide admin court booking cancellation failed", { bookingId, error });
    redirect("/admin/bookings?admin_message=booking_cancel_failed");
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/my-bookings");
  messageRedirect("/admin/bookings", "admin_message", "booking_cancelled");
}
