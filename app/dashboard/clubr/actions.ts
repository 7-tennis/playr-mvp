"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessClubRPermission, getPermissionContext, type ClubRPermission } from "@/lib/permissions";
import type { ClubNoticeCategory, ClubOperationalBlockReason, OrganisationRole } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function integer(formData: FormData, key: string, fallback: number) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(value) ? value : fallback;
}

function textList(formData: FormData, key: string) {
  return text(formData, key).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function localDateTimeIso(value: string) {
  if (!value) return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}:00+02:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function resultPath(path: string, key: "error" | "message", value: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

async function requireClubR(permission: ClubRPermission, formData: FormData) {
  const context = await getPermissionContext();
  const venueId = text(formData, "venueId");

  if (
    context.kind !== "authenticated"
    || !canAccessClubRPermission(context.role, permission)
    || !venueId
    || (context.role !== "platform_admin" && context.venueId !== venueId)
  ) {
    throw new Error("clubr_access_denied");
  }

  return { context, venueId };
}

function revalidateClubR() {
  revalidatePath("/dashboard/clubr");
  revalidatePath("/dashboard/clubr/members");
  revalidatePath("/dashboard/clubr/bookings");
  revalidatePath("/dashboard/clubr/courts");
  revalidatePath("/dashboard/clubr/notices");
  revalidatePath("/dashboard/clubr/settings");
  revalidatePath("/dashboard/clubr/settings/public-page");
  revalidatePath("/dashboard/clubr/settings/guest-booking");
  revalidatePath("/dashboard/venues");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/coachr/schedule");
}

export async function saveClubPublicSettings(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:settings:manage", formData);
  const visibility = text(formData, "discoveryVisibility");
  const clubName = text(formData, "clubName");
  if (!clubName) redirect(resultPath("/dashboard/clubr/settings/public-page", "error", "public_name_required"));
  const leaderboardVisibility = (key: string) => {
    const value = text(formData, key);
    return ["public", "members_only", "hidden"].includes(value) ? value : "hidden";
  };
  const { error } = await context.supabase.from("venues").update({
    address: text(formData, "address") || null,
    booking_notes: text(formData, "bookingNotes") || null,
    city: text(formData, "city") || null,
    contact_email: text(formData, "contactEmail") || null,
    contact_phone: text(formData, "contactPhone") || null,
    competition_leaderboard_visibility: leaderboardVisibility("competitionLeaderboardVisibility"),
    development_leaderboard_visibility: leaderboardVisibility("developmentLeaderboardVisibility"),
    discovery_visibility: ["public", "members_only", "hidden"].includes(visibility) ? visibility : "hidden",
    facilities: textList(formData, "facilities"),
    membership_contact: text(formData, "membershipContact") || null,
    name: clubName,
    opening_hours_text: text(formData, "openingHours") || null,
    parking_information: text(formData, "parkingInformation") || null,
    participation_leaderboard_visibility: leaderboardVisibility("participationLeaderboardVisibility"),
    public_description: text(formData, "publicDescription") || null,
    public_image_url: text(formData, "publicImageUrl") || null,
    suburb: text(formData, "suburb") || null,
    surface_types: textList(formData, "surfaceTypes"),
    town: text(formData, "town") || null,
    visitor_information: text(formData, "visitorInformation") || null,
    website_url: text(formData, "websiteUrl") || null
  }).eq("id", venueId);
  if (error) {
    console.error("[clubr] public_settings_save_failed", { code: error.code, venueId });
    redirect(resultPath("/dashboard/clubr/settings/public-page", "error", "public_settings_failed"));
  }
  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/settings/public-page", "message", "public_settings_updated"));
}

export async function saveGuestBookingSettings(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:settings:manage", formData);
  const guestOpeningTime = text(formData, "guestOpeningTime") || "08:00";
  const guestClosingTime = text(formData, "guestClosingTime") || "18:00";
  if (guestClosingTime <= guestOpeningTime) redirect(resultPath("/dashboard/clubr/settings/guest-booking", "error", "guest_hours_invalid"));
  const courtIds = formData.getAll("guestCourtIds").flatMap((value) => typeof value === "string" && value ? [value] : []);
  if (courtIds.length > 0) {
    const { data: venueCourts, error: venueCourtsError } = await context.supabase
      .from("courts")
      .select("id")
      .eq("venue_id", venueId)
      .in("id", courtIds);
    if (venueCourtsError || (venueCourts ?? []).length !== new Set(courtIds).size) {
      redirect(resultPath("/dashboard/clubr/settings/guest-booking", "error", "guest_courts_invalid"));
    }
  }
  const availabilityVisibility = text(formData, "publicAvailabilityVisibility");
  const { error } = await context.supabase.from("organisation_booking_settings").upsert({
    guest_accessible_court_ids: courtIds,
    guest_advance_booking_days: Math.max(0, Math.min(90, integer(formData, "guestAdvanceBookingDays", 3))),
    guest_approval_required: checked(formData, "guestApprovalRequired"),
    guest_booking_period_days: Math.max(1, Math.min(90, integer(formData, "guestBookingPeriodDays", 7))),
    guest_closing_time: guestClosingTime,
    guest_email_required: checked(formData, "guestEmailRequired"),
    guest_future_payment_required: checked(formData, "guestFuturePaymentRequired"),
    guest_max_duration_minutes: Math.max(15, Math.min(240, integer(formData, "guestMaxDurationMinutes", 60))),
    guest_name_required: checked(formData, "guestNameRequired"),
    guest_opening_time: guestOpeningTime,
    guest_phone_required: checked(formData, "guestPhoneRequired"),
    max_guest_bookings_per_period: Math.max(1, Math.min(100, integer(formData, "maxGuestBookingsPerPeriod", 1))),
    non_member_booking_enabled: checked(formData, "allowGuestBookings"),
    non_member_price_cents: Math.max(0, Math.round(Number(text(formData, "guestPrice") || "0") * 100)),
    public_availability_visibility: ["full", "guest_eligible", "sign_in_required", "after_approval"].includes(availabilityVisibility) ? availabilityVisibility : "sign_in_required",
    updated_by_user_id: context.user.id,
    venue_id: venueId
  }, { onConflict: "venue_id" });
  if (error) {
    console.error("[clubr] guest_booking_settings_failed", { code: error.code, venueId });
    redirect(resultPath("/dashboard/clubr/settings/guest-booking", "error", "guest_settings_failed"));
  }
  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/settings/guest-booking", "message", "guest_settings_updated"));
}

export async function updateClubMemberStatus(formData: FormData) {
  const membershipId = text(formData, "membershipId");
  const status = text(formData, "status");
  const returnPath = `/dashboard/clubr/members/${membershipId}`;
  const { context } = await requireClubR("clubr:members:manage", formData);

  if (!membershipId || !["active", "inactive", "pending"].includes(status)) {
    redirect(resultPath("/dashboard/clubr/members", "error", "member_status_invalid"));
  }

  const { error } = await context.supabase.rpc("clubr_set_member_status", {
    p_membership_id: membershipId,
    p_status: status
  });

  if (error) {
    console.error("[clubr] member_status_update_failed", { code: error.code, membershipId });
    redirect(resultPath(returnPath, "error", "member_status_failed"));
  }

  revalidateClubR();
  redirect(resultPath(returnPath, "message", status === "inactive" ? "member_deactivated" : status === "active" ? "member_activated" : "member_pending"));
}

export async function updateClubMemberRole(formData: FormData) {
  const profileId = text(formData, "profileId");
  const membershipId = text(formData, "membershipId");
  const role = text(formData, "role") as OrganisationRole;
  const active = text(formData, "intent") === "add";
  const returnPath = `/dashboard/clubr/members/${membershipId}`;
  const { context, venueId } = await requireClubR("clubr:roles:manage", formData);

  if (!profileId || !["committee", "reception", "viewer"].includes(role)) {
    redirect(resultPath(returnPath, "error", "member_role_invalid"));
  }

  const { error } = await context.supabase.rpc("clubr_set_member_role", {
    p_active: active,
    p_profile_id: profileId,
    p_role: role,
    p_venue_id: venueId
  });

  if (error) {
    console.error("[clubr] member_role_update_failed", { code: error.code, membershipId, role });
    redirect(resultPath(returnPath, "error", "member_role_failed"));
  }

  revalidateClubR();
  redirect(resultPath(returnPath, "message", active ? "member_role_added" : "member_role_removed"));
}

export async function updateClubCourt(formData: FormData) {
  const courtId = text(formData, "courtId");
  const returnPath = `/dashboard/clubr/courts/${courtId}`;
  const { context } = await requireClubR("clubr:courts:manage", formData);
  const name = text(formData, "name");
  const openingTime = text(formData, "openingTime") || null;
  const closingTime = text(formData, "closingTime") || null;

  if (!courtId || !name || (openingTime && closingTime && closingTime <= openingTime)) {
    redirect(resultPath(returnPath, "error", "court_invalid"));
  }

  const { error } = await context.supabase.rpc("clubr_update_court", {
    p_closing_time: closingTime,
    p_court_id: courtId,
    p_name: name,
    p_opening_time: openingTime,
    p_status: text(formData, "status") === "inactive" ? "inactive" : "active",
    p_surface: text(formData, "surface") || null
  });

  if (error) {
    console.error("[clubr] court_update_failed", { code: error.code, courtId });
    redirect(resultPath(returnPath, "error", "court_save_failed"));
  }

  revalidateClubR();
  redirect(resultPath(returnPath, "message", "court_updated"));
}

export async function createClubOperationalBlock(formData: FormData) {
  const courtId = text(formData, "courtId");
  const returnPath = `/dashboard/clubr/courts/${courtId}`;
  const { context, venueId } = await requireClubR("clubr:courts:manage", formData);
  const startTime = localDateTimeIso(text(formData, "startTime"));
  const endTime = localDateTimeIso(text(formData, "endTime"));
  const reason = text(formData, "reason") as ClubOperationalBlockReason;

  if (!courtId || !startTime || !endTime || new Date(endTime) <= new Date(startTime)) {
    redirect(resultPath(returnPath, "error", "block_time_invalid"));
  }

  const { error } = await context.supabase.rpc("clubr_create_operational_block", {
    p_court_id: courtId,
    p_end_time: endTime,
    p_note: text(formData, "note") || null,
    p_reason: reason,
    p_start_time: startTime,
    p_venue_id: venueId
  });

  if (error) {
    console.error("[clubr] operational_block_create_failed", { code: error.code, courtId });
    redirect(resultPath(returnPath, "error", error.code === "23P01" ? "block_conflict" : "block_create_failed"));
  }

  revalidateClubR();
  redirect(resultPath(returnPath, "message", "block_created"));
}

export async function releaseClubOperationalBlock(formData: FormData) {
  const blockId = text(formData, "blockId");
  const courtId = text(formData, "courtId");
  const returnPath = `/dashboard/clubr/courts/${courtId}`;
  const { context } = await requireClubR("clubr:courts:manage", formData);
  const { error } = await context.supabase.rpc("clubr_release_operational_block", { p_block_id: blockId });

  if (error) {
    console.error("[clubr] operational_block_release_failed", { blockId, code: error.code });
    redirect(resultPath(returnPath, "error", "block_release_failed"));
  }

  revalidateClubR();
  redirect(resultPath(returnPath, "message", "block_released"));
}

export async function saveClubNotice(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:notices:manage", formData);
  const noticeId = text(formData, "noticeId");
  const category = text(formData, "category") as ClubNoticeCategory;
  const title = text(formData, "title");
  const message = text(formData, "noticeMessage");
  const startsAt = localDateTimeIso(text(formData, "startsAt"));
  const endsAt = localDateTimeIso(text(formData, "endsAt"));

  if (!title || !message || !["pinned", "general", "maintenance", "important"].includes(category) || (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))) {
    redirect(resultPath("/dashboard/clubr/notices", "error", "notice_invalid"));
  }

  const values = {
    category,
    ends_at: endsAt,
    is_active: checked(formData, "isActive"),
    is_public: checked(formData, "isPublic"),
    message,
    starts_at: startsAt,
    title,
    updated_by_user_id: context.user.id
  };
  const result = noticeId
    ? await context.supabase.from("club_notices").update(values).eq("id", noticeId).eq("venue_id", venueId)
    : await context.supabase.from("club_notices").insert({ ...values, created_by_user_id: context.user.id, venue_id: venueId });

  if (result.error) {
    console.error("[clubr] notice_save_failed", { code: result.error.code, noticeId });
    redirect(resultPath("/dashboard/clubr/notices", "error", "notice_save_failed"));
  }

  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/notices", "message", noticeId ? "notice_updated" : "notice_published"));
}

export async function toggleClubNotice(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:notices:manage", formData);
  const noticeId = text(formData, "noticeId");
  const { error } = await context.supabase
    .from("club_notices")
    .update({ is_active: text(formData, "active") === "true", updated_by_user_id: context.user.id })
    .eq("id", noticeId)
    .eq("venue_id", venueId);

  if (error) {
    redirect(resultPath("/dashboard/clubr/notices", "error", "notice_save_failed"));
  }

  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/notices", "message", "notice_updated"));
}

export async function saveClubDetails(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:settings:manage", formData);
  const name = text(formData, "name");
  if (!name) redirect(resultPath("/dashboard/clubr/settings", "error", "club_details_invalid"));

  const { error } = await context.supabase.from("venues").update({
    address: text(formData, "address") || null,
    contact_email: text(formData, "contactEmail") || null,
    contact_phone: text(formData, "contactPhone") || null,
    name,
    timezone: text(formData, "timezone") || "Africa/Johannesburg"
  }).eq("id", venueId);

  if (error) {
    console.error("[clubr] club_details_save_failed", { code: error.code, venueId });
    redirect(resultPath("/dashboard/clubr/settings", "error", "club_details_failed"));
  }

  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/settings", "message", "club_details_updated"));
}

export async function saveClubBookingSettings(formData: FormData) {
  const { context, venueId } = await requireClubR("clubr:settings:manage", formData);
  const openingTime = text(formData, "openingTime") || "06:00";
  const closingTime = text(formData, "closingTime") || "21:00";
  const slotMinutes = integer(formData, "slotMinutes", 60);

  if (closingTime <= openingTime || ![15, 30, 45, 60, 90, 120].includes(slotMinutes)) {
    redirect(resultPath("/dashboard/clubr/settings", "error", "booking_settings_invalid"));
  }

  const { error } = await context.supabase.from("organisation_booking_settings").upsert({
    advance_booking_days: Math.max(1, Math.min(90, integer(formData, "advanceBookingDays", 7))),
    closing_time: closingTime,
    max_active_bookings: Math.max(1, Math.min(100, integer(formData, "maxActiveBookings", 3))),
    member_booking_enabled: checked(formData, "memberBookingEnabled"),
    non_member_booking_enabled: checked(formData, "nonMemberBookingEnabled"),
    non_member_price_cents: Math.max(0, Math.round(Number(text(formData, "nonMemberPrice") || "0") * 100)),
    opening_time: openingTime,
    slot_minutes: slotMinutes,
    updated_by_user_id: context.user.id,
    venue_id: venueId
  }, { onConflict: "venue_id" });

  if (error) {
    console.error("[clubr] booking_settings_save_failed", { code: error.code, venueId });
    redirect(resultPath("/dashboard/clubr/settings", "error", "booking_settings_failed"));
  }

  revalidateClubR();
  redirect(resultPath("/dashboard/clubr/settings", "message", "booking_settings_updated"));
}
