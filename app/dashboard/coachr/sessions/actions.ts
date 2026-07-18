"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCoachRAccess } from "@/lib/permissions";
import { coachSessionAttendanceStatuses, coachSessionTypes } from "@/lib/coach-sessions";
import type { CoachLessonLocationType, CoachSessionAttendanceStatus, CoachSessionParticipantStatus, CoachSessionType } from "@/types/courtside";

const locationTypes: CoachLessonLocationType[] = ["managed_court", "custom", "none"];
const repeatModes = ["none", "weekly"] as const;
const recurrenceEndModes = ["until_cancelled", "until_date", "occurrence_count"] as const;
const participantStatuses: CoachSessionParticipantStatus[] = ["active", "pending", "paused", "removed"];

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function nullableValue(formData: FormData, key: string) {
  return value(formData, key) || null;
}

function uuid(valueToCheck: string | null | undefined) {
  return valueToCheck && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valueToCheck)
    ? valueToCheck
    : null;
}

function uuidValues(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).flatMap((item) => {
    if (typeof item !== "string") return [];
    const parsed = uuid(item.trim());
    return parsed ? [parsed] : [];
  })));
}

function dateTime(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+02:00` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function date(formData: FormData, key: string) {
  const raw = value(formData, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function time(formData: FormData, key: string) {
  const raw = value(formData, key);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : null;
}

function integer(formData: FormData, key: string) {
  const parsed = Number.parseInt(value(formData, key), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function allowed<T extends string>(candidate: string, options: readonly T[], fallback: T) {
  return options.includes(candidate as T) ? candidate as T : fallback;
}

function safeReturnTo(formData: FormData, fallback: string) {
  const candidate = value(formData, "returnTo");
  return candidate.startsWith("/dashboard/coachr") ? candidate : fallback;
}

function redirectWith(returnTo: string, key: string, status: string): never {
  const target = new URL(returnTo, "http://localhost");
  target.searchParams.set(key, status);
  redirect(`${target.pathname}${target.search}${target.hash}`);
}

function sessionError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.split("\n")[0] ?? "";
  const knownPrefixes = ["player_conflict:", "coach_conflict:", "court_conflict:"];
  const known = [
    "access",
    "attendance_player",
    "attendance_status",
    "cancel_scope",
    "capacity",
    "coach_venue",
    "court_access",
    "custom_location",
    "external_venue",
    "invalid_student",
    "missing_court",
    "missing_fields",
    "participant_count",
    "participant_status",
    "recurrence_range",
    "booking_creation_failed",
    "booking_refresh_failed",
    "booking_release_failed",
    "booking_synchronisation_failed",
    "confirmation_required",
    "duration",
    "invalid_request",
    "makeup_not_available",
    "managed_court_required",
    "move_request_required",
    "occurrence_generation_failed",
    "request_not_pending",
    "request_recipient_missing",
    "session_create_failed",
    "session_history_protected",
    "single_player_request_required",
    "time_unavailable",
    "time_order"
  ];

  if (knownPrefixes.some((prefix) => message.startsWith(prefix))) return message;
  if (known.includes(message)) return message;
  if (error?.code === "PGRST202" || message.toLowerCase().includes("could not find the function")) return "missing_migration";
  if (error?.code === "23P01") return "court_conflict:Selected court";
  return "session_failed";
}

function revalidateSessionSurfaces() {
  revalidatePath("/admin/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/sessions");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/clubr");
  revalidatePath("/dashboard/clubr/bookings");
  revalidatePath("/dashboard/my-bookings");
}

export async function createCoachSession(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/sessions/new");
  if (context.kind !== "authenticated") redirectWith(returnTo, "session_error", "access");

  const venueId = uuid(value(formData, "venueId")) ?? context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
  const sessionType = allowed<CoachSessionType>(value(formData, "sessionType"), coachSessionTypes, "private");
  const primaryCoachId = context.role === "coach" ? context.adultProfileId : uuid(value(formData, "primaryCoachId")) ?? context.adultProfileId;
  const participantIds = uuidValues(formData, "participantIds");
  const courtIds = uuidValues(formData, "courtIds");
  const additionalCoachIds = uuidValues(formData, "additionalCoachIds").filter((id) => id !== primaryCoachId);
  const locationType = allowed<CoachLessonLocationType>(value(formData, "locationType"), locationTypes, "managed_court");
  const repeatMode = allowed(value(formData, "repeatMode"), repeatModes, "none");
  const recurrenceEndMode = repeatMode === "weekly"
    ? allowed(value(formData, "recurrenceEndMode"), recurrenceEndModes, "until_cancelled")
    : null;
  const startTime = repeatMode === "none" ? dateTime(formData, "startTime") : null;
  const endTime = repeatMode === "none" ? dateTime(formData, "endTime") : null;
  const recurrenceStartDate = repeatMode === "weekly" ? date(formData, "recurrenceStartDate") : null;
  const recurrenceStartTime = repeatMode === "weekly" ? time(formData, "recurrenceStartTime") : null;
  const recurrenceEndTime = repeatMode === "weekly" ? time(formData, "recurrenceEndTime") : null;
  const dayOfWeek = repeatMode === "weekly" ? integer(formData, "dayOfWeek") : null;

  if (!venueId || !primaryCoachId || participantIds.length === 0) {
    redirectWith(returnTo, "session_error", "missing_fields");
  }
  if (locationType === "managed_court" && courtIds.length === 0) {
    redirectWith(returnTo, "session_error", "missing_court");
  }
  if (repeatMode === "none" && (!startTime || !endTime)) {
    redirectWith(returnTo, "session_error", "missing_fields");
  }
  if (repeatMode === "weekly" && (!recurrenceStartDate || !recurrenceStartTime || !recurrenceEndTime || !dayOfWeek)) {
    redirectWith(returnTo, "session_error", "recurrence_range");
  }

  const { data, error } = await context.supabase.rpc("coachr_create_session", {
    p_additional_coach_ids: additionalCoachIds,
    p_capacity: integer(formData, "capacity"),
    p_court_ids: courtIds,
    p_custom_location: nullableValue(formData, "customLocation"),
    p_day_of_week: dayOfWeek,
    p_description: nullableValue(formData, "description"),
    p_end_time: endTime,
    p_external_venue_id: uuid(value(formData, "externalVenueId")),
    p_location_type: locationType,
    p_name: value(formData, "name"),
    p_notes: nullableValue(formData, "notes"),
    p_participant_ids: participantIds,
    p_primary_coach_id: primaryCoachId,
    p_recurrence_end_date: recurrenceEndMode === "until_date" ? date(formData, "recurrenceEndDate") : null,
    p_recurrence_end_mode: recurrenceEndMode,
    p_recurrence_end_time: recurrenceEndTime,
    p_recurrence_occurrence_count: recurrenceEndMode === "occurrence_count" ? integer(formData, "recurrenceOccurrenceCount") : null,
    p_recurrence_start_date: recurrenceStartDate,
    p_recurrence_start_time: recurrenceStartTime,
    p_repeat_mode: repeatMode,
    p_session_type: sessionType,
    p_start_time: startTime,
    p_venue_id: venueId
  });

  if (error || !data) {
    console.error("CoachR session create failed", {
      code: error?.code,
      message: error?.message,
      role: context.role,
      sessionType,
      venueId
    });
    redirectWith(returnTo, "session_error", sessionError(error));
  }

  revalidateSessionSurfaces();
  redirect(`/dashboard/coachr/sessions?session=created&focus=${data}`);
}

export async function cancelCoachSessionOccurrence(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/schedule");
  const occurrenceId = uuid(value(formData, "occurrenceId"));
  if (context.kind !== "authenticated" || !occurrenceId) redirectWith(returnTo, "session_error", "access");
  if (value(formData, "confirmCancellation") !== "confirmed") {
    redirectWith(returnTo, "session_error", "confirmation_required");
  }

  const scope = allowed(value(formData, "scope"), ["single", "future", "series", "through"] as const, "single");
  const { error } = await context.supabase.rpc("coachr_cancel_session_occurrence", {
    p_end_date: scope === "through" ? date(formData, "endDate") : null,
    p_occurrence_id: occurrenceId,
    p_reason: nullableValue(formData, "reason"),
    p_scope: scope
  });
  if (error) {
    console.error("CoachR session cancellation failed", { code: error.code, message: error.message, occurrenceId, userId: context.user.id });
    redirectWith(returnTo, "session_error", sessionError(error));
  }

  revalidateSessionSurfaces();
  redirectWith(returnTo, "session", "session_cancelled");
}

export async function moveCoachSessionOccurrence(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/schedule");
  const occurrenceId = uuid(value(formData, "occurrenceId"));
  const startTime = dateTime(formData, "startTime");
  const endTime = dateTime(formData, "endTime");
  const courtId = uuid(value(formData, "courtId"));
  const supersedesRequestId = uuid(value(formData, "supersedesRequestId"));
  if (context.kind !== "authenticated" || !occurrenceId || !startTime || !endTime || !courtId) redirectWith(returnTo, "session_error", "missing_fields");

  const { error } = await context.supabase.rpc("coachr_create_move_request", {
    p_message: nullableValue(formData, "message"),
    p_occurrence_id: occurrenceId,
    p_proposed_court_id: courtId,
    p_proposed_end_time: endTime,
    p_proposed_start_time: startTime,
    p_supersedes_request_id: supersedesRequestId
  });
  if (error) {
    console.error("CoachR session move request failed", { code: error.code, message: error.message, occurrenceId, userId: context.user.id });
    redirectWith(returnTo, "session_error", sessionError(error));
  }

  revalidateSessionSurfaces();
  revalidatePath("/dashboard/notifications");
  redirectWith(returnTo, "session", "move_request_sent");
}

export async function markCoachSessionAttendance(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/schedule");
  const occurrenceId = uuid(value(formData, "occurrenceId"));
  const playerProfileId = uuid(value(formData, "playerProfileId"));
  const attendanceStatus = allowed<CoachSessionAttendanceStatus>(value(formData, "attendanceStatus"), coachSessionAttendanceStatuses, "not_recorded");
  if (context.kind !== "authenticated" || !occurrenceId || !playerProfileId) redirectWith(returnTo, "session_error", "attendance_player");

  const { error } = await context.supabase.rpc("coachr_mark_session_attendance", {
    p_attendance_status: attendanceStatus,
    p_notes: nullableValue(formData, "notes"),
    p_occurrence_id: occurrenceId,
    p_player_profile_id: playerProfileId
  });
  if (error) {
    console.error("CoachR session attendance failed", { code: error.code, message: error.message, occurrenceId, userId: context.user.id });
    redirectWith(returnTo, "session_error", sessionError(error));
  }
  revalidateSessionSurfaces();
  redirectWith(returnTo, "session", "attendance_marked");
}

export async function markAllCoachSessionAttendance(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/schedule");
  const occurrenceId = uuid(value(formData, "occurrenceId"));
  if (context.kind !== "authenticated" || !occurrenceId) redirectWith(returnTo, "session_error", "attendance_player");

  const { error } = await context.supabase.rpc("coachr_mark_all_session_attendance", {
    p_attendance_status: "present",
    p_occurrence_id: occurrenceId
  });
  if (error) {
    console.error("CoachR mark-all attendance failed", { code: error.code, message: error.message, occurrenceId, userId: context.user.id });
    redirectWith(returnTo, "session_error", sessionError(error));
  }
  revalidateSessionSurfaces();
  redirectWith(returnTo, "session", "attendance_marked");
}

export async function updateCoachSessionParticipant(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const returnTo = safeReturnTo(formData, "/dashboard/coachr/sessions");
  const sessionId = uuid(value(formData, "sessionId"));
  const playerProfileId = uuid(value(formData, "playerProfileId"));
  const participantStatus = allowed<CoachSessionParticipantStatus>(value(formData, "participantStatus"), participantStatuses, "active");
  if (context.kind !== "authenticated" || !sessionId || !playerProfileId) redirectWith(returnTo, "session_error", "invalid_student");

  const { error } = await context.supabase.rpc("coachr_update_session_participant", {
    p_effective_date: date(formData, "effectiveDate"),
    p_player_profile_id: playerProfileId,
    p_session_id: sessionId,
    p_status: participantStatus
  });
  if (error) {
    console.error("CoachR session participant update failed", { code: error.code, message: error.message, sessionId, userId: context.user.id });
    redirectWith(returnTo, "session_error", sessionError(error));
  }
  revalidateSessionSurfaces();
  redirectWith(returnTo, "session", "roster_updated");
}
