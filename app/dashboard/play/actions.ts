"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Court, MatchInviteStatus, MatchInviteType, MatchVerificationStatus, Profile } from "@/types/courtside";

const matchTypes: MatchInviteType[] = ["casual", "verified"];
const responseStatuses: MatchInviteStatus[] = ["accepted", "declined"];
const resultResponseStatuses: MatchVerificationStatus[] = ["verified", "disputed"];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function allowed<T extends string>(value: string, options: T[], fallback: T) {
  return options.includes(value as T) ? (value as T) : fallback;
}

function isWithinUserBookingWindow(start: Date) {
  const now = Date.now();
  const max = now + 7 * 24 * 60 * 60 * 1000;
  return start.getTime() >= now && start.getTime() < max;
}

function playRedirect(params: Record<string, string>): never {
  const searchParams = new URLSearchParams(params);
  redirect(`/dashboard/play?${searchParams.toString()}`);
}

async function applyRatingForVerifiedMatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, matchId: string, userId: string) {
  const { error } = await supabase.rpc("apply_verified_match_rating", { target_match_id: matchId });

  if (error) {
    console.error("CourtSide rating calculation failed after player verification", { userId, matchId, error });
  }
}

async function getPlayContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adultProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  if (!adultProfile?.id) {
    redirect("/dashboard/profile?error=parent_profile_required");
  }

  const { data: juniorProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("parent_profile_id", adultProfile.id)
    .eq("is_junior", true);

  const profileIds = [
    adultProfile.id as string,
    ...((juniorProfiles ?? []) as Pick<Profile, "id">[]).map((profile) => profile.id)
  ];

  return { supabase, user, profileIds };
}

export async function createMatchInvite(formData: FormData) {
  const { supabase, user, profileIds } = await getPlayContext();
  const inviterProfileId = text(formData, "inviter_profile_id");
  const opponentProfileId = text(formData, "opponent_profile_id");
  const bookingMode = text(formData, "booking_mode") || "existing";
  const bookingId = text(formData, "booking_id");

  if (!inviterProfileId || !opponentProfileId) {
    playRedirect({ error: "missing_fields" });
  }

  if (!profileIds.includes(inviterProfileId)) {
    playRedirect({ error: "profile_not_allowed" });
  }

  if (profileIds.includes(opponentProfileId) || inviterProfileId === opponentProfileId) {
    playRedirect({ error: "opponent_not_allowed" });
  }

  let resolvedBookingId: string | null = null;
  if (bookingMode === "new") {
    const courtId = text(formData, "new_court_id");
    const startValue = text(formData, "new_start_time");

    if (!courtId || !startValue) {
      playRedirect({ error: "missing_booking_slot" });
    }

    const startTime = new Date(startValue);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    if (!Number.isFinite(startTime.getTime()) || !isWithinUserBookingWindow(startTime)) {
      playRedirect({ error: "booking_window" });
    }

    const { data: courtData, error: courtError } = await supabase
      .from("courts")
      .select("id,status")
      .eq("id", courtId)
      .eq("status", "active")
      .single();

    if (courtError || !courtData) {
      playRedirect({ error: "court_unavailable" });
    }

    const { data: createdBooking, error: bookingCreateError } = await supabase
      .from("court_bookings")
      .insert({
        court_id: (courtData as Pick<Court, "id">).id,
        booked_by_user_id: user.id,
        player_profile_id: inviterProfileId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: "confirmed",
        booking_type: "player_booking",
        is_public: false,
        notes: nullableText(formData, "booking_notes") ?? "Created from Play match invite."
      })
      .select("id")
      .single();

    if (bookingCreateError || !createdBooking) {
      console.error("CourtSide match invite booking create failed", { userId: user.id, courtId, inviterProfileId, startValue, error: bookingCreateError });
      if (bookingCreateError?.code === "23P01") {
        playRedirect({ error: "slot_unavailable" });
      }

      playRedirect({ error: "booking_create_failed" });
    }

    resolvedBookingId = createdBooking.id as string;
  } else if (bookingId) {
    const { data: booking } = await supabase
      .from("court_bookings")
      .select("id,start_time,status,player_profile_id")
      .eq("id", bookingId)
      .eq("status", "confirmed")
      .gt("start_time", new Date().toISOString())
      .maybeSingle();

    if (!booking || !profileIds.includes(String(booking.player_profile_id))) {
      playRedirect({ error: "booking_not_allowed" });
    }

    resolvedBookingId = booking.id as string;
  }

  const { error } = await supabase.from("match_invites").insert({
    booking_id: resolvedBookingId,
    invited_by_user_id: user.id,
    inviter_profile_id: inviterProfileId,
    opponent_profile_id: opponentProfileId,
    match_type: allowed<MatchInviteType>(text(formData, "match_type"), matchTypes, "casual"),
    status: "pending",
    message: nullableText(formData, "message")
  });

  if (error) {
    console.error("CourtSide match invite create failed", { userId: user.id, inviterProfileId, opponentProfileId, bookingId: resolvedBookingId, error });
    playRedirect({ error: "invite_failed" });
  }

  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/my-bookings");
  playRedirect({ invite: "created" });
}

export async function respondToMatchInvite(formData: FormData) {
  const { supabase, user } = await getPlayContext();
  const inviteId = text(formData, "invite_id");
  const status = allowed<MatchInviteStatus>(text(formData, "status"), responseStatuses, "declined");

  if (!inviteId) {
    playRedirect({ error: "invalid_invite" });
  }

  const { error } = await supabase
    .from("match_invites")
    .update({
      status,
      responded_at: new Date().toISOString()
    })
    .eq("id", inviteId)
    .eq("status", "pending");

  if (error) {
    console.error("CourtSide match invite response failed", { userId: user.id, inviteId, status, error });
    playRedirect({ error: "invite_update_failed" });
  }

  revalidatePath("/dashboard/play");
  playRedirect({ invite: status });
}

export async function cancelMatchInvite(formData: FormData) {
  const { supabase, user } = await getPlayContext();
  const inviteId = text(formData, "invite_id");

  if (!inviteId) {
    playRedirect({ error: "invalid_invite" });
  }

  const { error } = await supabase
    .from("match_invites")
    .update({
      status: "cancelled",
      responded_at: new Date().toISOString()
    })
    .eq("id", inviteId)
    .eq("status", "pending");

  if (error) {
    console.error("CourtSide match invite cancel failed", { userId: user.id, inviteId, error });
    playRedirect({ error: "invite_update_failed" });
  }

  revalidatePath("/dashboard/play");
  playRedirect({ invite: "cancelled" });
}

export async function submitMatchResult(formData: FormData) {
  const { supabase, user, profileIds } = await getPlayContext();
  const inviteId = text(formData, "match_invite_id");
  const winnerProfileId = text(formData, "winner_profile_id");
  const scoreText = text(formData, "score_text");

  if (!inviteId || !winnerProfileId || !scoreText) {
    playRedirect({ error: "missing_result_fields" });
  }

  const { data: inviteData, error: inviteError } = await supabase
    .from("match_invites")
    .select("id,booking_id,inviter_profile_id,opponent_profile_id,status")
    .eq("id", inviteId)
    .eq("status", "accepted")
    .maybeSingle();

  if (inviteError || !inviteData) {
    playRedirect({ error: "result_invite_unavailable" });
  }

  const invite = inviteData as {
    id: string;
    booking_id: string | null;
    inviter_profile_id: string;
    opponent_profile_id: string;
    status: MatchInviteStatus;
  };

  if (!profileIds.includes(invite.inviter_profile_id) && !profileIds.includes(invite.opponent_profile_id)) {
    playRedirect({ error: "profile_not_allowed" });
  }

  if (![invite.inviter_profile_id, invite.opponent_profile_id].includes(winnerProfileId)) {
    playRedirect({ error: "winner_not_allowed" });
  }

  const { error } = await supabase.from("matches").insert({
    match_invite_id: invite.id,
    booking_id: invite.booking_id,
    submitted_by_user_id: user.id,
    winner_profile_id: winnerProfileId,
    score_text: scoreText,
    verification_status: "pending_confirmation"
  });

  if (error) {
    console.error("CourtSide match result submit failed", { userId: user.id, inviteId: invite.id, winnerProfileId, error });
    playRedirect({ error: error.code === "23505" ? "result_exists" : "result_failed" });
  }

  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/profile");
  playRedirect({ result: "submitted" });
}

export async function respondToMatchResult(formData: FormData) {
  const { supabase, user } = await getPlayContext();
  const matchId = text(formData, "match_id");
  const status = allowed<MatchVerificationStatus>(text(formData, "verification_status"), resultResponseStatuses, "disputed");

  if (!matchId) {
    playRedirect({ error: "invalid_result" });
  }

  const { error } = await supabase
    .from("matches")
    .update({
      verification_status: status,
      confirmed_by_user_id: user.id,
      confirmed_at: new Date().toISOString()
    })
    .eq("id", matchId)
    .eq("verification_status", "pending_confirmation");

  if (error) {
    console.error("CourtSide match result response failed", { userId: user.id, matchId, status, error });
    playRedirect({ error: "result_update_failed" });
  }

  if (status === "verified") {
    await applyRatingForVerifiedMatch(supabase, matchId, user.id);
  }

  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  playRedirect({ result: status });
}
