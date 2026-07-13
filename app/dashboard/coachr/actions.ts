"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coachLessonAttendanceResults, coachLessonStatuses, coachLessonTypes } from "@/lib/coach-lessons";
import { assertCoachRAccess } from "@/lib/permissions";
import type { CoachLessonAttendanceResult, CoachLessonLocationType, CoachLessonStatus, CoachLessonType } from "@/types/courtside";

const repeatModes = ["none", "weekly"] as const;
const seriesScopes = ["single", "future", "series"] as const;
const locationTypes: CoachLessonLocationType[] = ["managed_court", "custom", "none"];

type RepeatMode = (typeof repeatModes)[number];
type SeriesScope = (typeof seriesScopes)[number];
type AuthenticatedCoachRContext = Awaited<ReturnType<typeof assertCoachRAccess>> & { kind: "authenticated" };

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = nullableText(formData, key);
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function datetimeValue(formData: FormData, key: string) {
  const value = text(formData, key);
  return value ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+02:00` : value).toISOString() : "";
}

function dateValue(formData: FormData, key: string) {
  const value = text(formData, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function timeValue(formData: FormData, key: string) {
  const value = text(formData, key);
  return /^\d{2}:\d{2}$/.test(value) ? value : "";
}

function allowedValue<T extends string>(value: string, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function redirectWithParam(returnTo: string, key: string, value: string): never {
  const target = new URL(returnTo || "/dashboard/coachr/schedule", "http://localhost");
  target.searchParams.set(key, value);
  redirect(`${target.pathname}${target.search}`);
}

function lessonErrorValue(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (error?.code === "PGRST202" || message.toLowerCase().includes("could not find the function")) {
    return "missing_rpc";
  }

  if (message.startsWith("court_conflict:")) {
    return message;
  }
  if (message.startsWith("recurrence_conflicts:")) {
    return message;
  }

  if (
    [
      "access",
      "attendance_confirm",
      "attendance_player",
      "coach_profile_missing",
      "coach_conflict",
      "coach_venue_missing",
      "coach_venue",
      "court_venue",
      "court_access",
      "custom_location",
      "invalid_lesson",
      "invalid_student",
      "missing_rpc",
      "no_active_courts",
      "no_students",
      "missing_court",
      "missing_fields",
      "player_profile",
      "recurrence_range",
      "time_order"
    ].includes(message)
  ) {
    return message;
  }

  if (error?.code === "23P01") {
    return "court_conflict";
  }

  return fallback;
}

function revalidateCoachLessonSurfaces() {
  revalidatePath("/admin/bookings");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/head-coach");
  revalidatePath("/dashboard/coachr/messages");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/my-bookings");
  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/play/plan-match");
}

async function preflightCoachLessonCreate({
  coachId,
  context,
  courtId,
  customLocation,
  locationType,
  playerId,
  venueId
}: {
  coachId: string | null;
  context: AuthenticatedCoachRContext;
  courtId: string | null;
  customLocation: string | null;
  locationType: CoachLessonLocationType;
  playerId: string | null;
  venueId: string | null;
}) {
  if (context.role === "coach" && !context.adultProfileId) {
    return "coach_profile_missing";
  }
  if (context.role === "coach" && !context.venueId) {
    return "coach_venue_missing";
  }
  if (!venueId) {
    return "coach_venue_missing";
  }
  if (!coachId) {
    return "coach_profile_missing";
  }
  if (locationType === "managed_court" && !courtId) {
    return "no_active_courts";
  }
  if (locationType === "custom" && !customLocation) {
    return "custom_location";
  }
  if (!playerId) {
    return "no_students";
  }

  const [courtResult, playerResult, coachVenueResult] = await Promise.all([
    courtId
      ? context.supabase.from("courts").select("id,name,venue_id,status").eq("id", courtId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.supabase.from("profiles").select("id").eq("id", playerId).maybeSingle(),
    context.supabase.rpc("coach_profile_can_teach_at_venue", {
      check_coach_id: coachId,
      check_user_id: context.user.id,
      check_venue_id: venueId
    })
  ]);

  if (coachVenueResult.error) {
    return lessonErrorValue(coachVenueResult.error, "create_failed");
  }
  if (!coachVenueResult.data) {
    return "coach_venue";
  }
  if (courtResult.error) {
    return "create_failed";
  }
  if (locationType === "managed_court" && (!courtResult.data || courtResult.data.status !== "active")) {
    return "court_venue";
  }
  if (playerResult.error) {
    return "create_failed";
  }
  if (!playerResult.data) {
    return "invalid_student";
  }

  return null;
}

export async function createCoachLesson(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";

  if (context.kind !== "authenticated") {
    redirectWithParam(returnTo, "lesson_error", "access");
  }

  const venueId = optionalUuid(formData, "venueId") ?? context.venueId;
  const coachId = context.role === "coach" ? context.adultProfileId : optionalUuid(formData, "coachId") ?? context.adultProfileId;
  const playerId = optionalUuid(formData, "playerId");
  const courtId = optionalUuid(formData, "courtId");
  const locationType = allowedValue<CoachLessonLocationType>(text(formData, "locationType"), locationTypes, "managed_court");
  const customLocation = nullableText(formData, "customLocation");
  const startTime = datetimeValue(formData, "startTime");
  const endTime = datetimeValue(formData, "endTime");
  const lessonType = allowedValue<CoachLessonType>(text(formData, "lessonType"), coachLessonTypes, "private");
  const title = text(formData, "title") || "Coaching lesson";
  const repeatMode = allowedValue<RepeatMode>(text(formData, "repeatMode"), [...repeatModes], "none");
  const setupError = await preflightCoachLessonCreate({
    coachId,
    context,
    courtId,
    customLocation,
    locationType,
    playerId,
    venueId
  });

  if (setupError) {
    redirectWithParam(returnTo, "lesson_error", setupError);
  }

  const recurrenceStartDate = repeatMode === "weekly" ? dateValue(formData, "recurrenceStartDate") : null;
  const recurrenceEndDate = repeatMode === "weekly" ? dateValue(formData, "recurrenceEndDate") : null;
  const dayOfWeek = repeatMode === "weekly" ? Number(text(formData, "dayOfWeek")) : null;
  const lessonStartTime = repeatMode === "weekly" ? timeValue(formData, "lessonStartTime") : null;
  const lessonEndTime = repeatMode === "weekly" ? timeValue(formData, "lessonEndTime") : null;

  if (repeatMode === "weekly") {
    if (!venueId || !coachId || !playerId || !recurrenceStartDate || !recurrenceEndDate || !lessonStartTime || !lessonEndTime || !Number.isInteger(dayOfWeek)) {
      redirectWithParam(returnTo, "lesson_error", "missing_fields");
    }

    if ((dayOfWeek ?? 0) < 1 || (dayOfWeek ?? 0) > 7 || new Date(`${recurrenceEndDate}T00:00:00Z`).getTime() < new Date(`${recurrenceStartDate}T00:00:00Z`).getTime()) {
      redirectWithParam(returnTo, "lesson_error", "recurrence_range");
    }

    if (new Date(`${recurrenceEndDate}T00:00:00Z`).getTime() > new Date(`${recurrenceStartDate}T00:00:00Z`).getTime() + 366 * 24 * 60 * 60 * 1000) {
      redirectWithParam(returnTo, "lesson_error", "recurrence_range");
    }

    if (lessonEndTime <= lessonStartTime) {
      redirectWithParam(returnTo, "lesson_error", "time_order");
    }

  }

  if (!venueId || !coachId || !playerId || (repeatMode === "none" && (!startTime || !endTime))) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (repeatMode === "none" && new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  const { error } = await context.supabase.rpc("coachr_create_lesson_plan", {
    p_coach_id: coachId,
    p_court_id: courtId,
    p_custom_location: customLocation,
    p_day_of_week: dayOfWeek,
    p_end_time: repeatMode === "none" ? endTime : null,
    p_lesson_type: lessonType,
    p_location_type: locationType,
    p_notes: nullableText(formData, "notes"),
    p_player_id: playerId,
    p_recurrence_end_date: recurrenceEndDate,
    p_recurrence_end_time: lessonEndTime,
    p_recurrence_start_date: recurrenceStartDate,
    p_recurrence_start_time: lessonStartTime,
    p_repeat_mode: repeatMode,
    p_start_time: repeatMode === "none" ? startTime : null,
    p_title: title,
    p_venue_id: venueId
  });

  if (error) {
    console.error("CoachR lesson create failed", { error, role: context.role, venueId, coachId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "create_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", repeatMode === "weekly" ? "series_created" : "created");
}

export async function updateCoachLesson(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";
  const lessonId = optionalUuid(formData, "lessonId");

  if (context.kind !== "authenticated" || !lessonId) {
    redirectWithParam(returnTo, "lesson_error", "invalid_lesson");
  }

  const status = allowedValue<CoachLessonStatus>(text(formData, "status"), coachLessonStatuses, "scheduled");
  const title = text(formData, "title");
  const startTime = datetimeValue(formData, "startTime");
  const endTime = datetimeValue(formData, "endTime");
  const lessonType = allowedValue<CoachLessonType>(text(formData, "lessonType"), coachLessonTypes, "private");
  const playerId = optionalUuid(formData, "playerId");
  const courtId = optionalUuid(formData, "courtId");
  const locationType = allowedValue<CoachLessonLocationType>(text(formData, "locationType"), locationTypes, "managed_court");
  const customLocation = nullableText(formData, "customLocation");
  const editScope = allowedValue<SeriesScope>(text(formData, "editScope"), [...seriesScopes], "single");

  if (!playerId || !startTime || !endTime || (locationType === "managed_court" && !courtId) || (locationType === "custom" && !customLocation)) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  const { error } = await context.supabase.rpc("coachr_update_lesson_plan", {
    p_court_id: courtId,
    p_custom_location: customLocation,
    p_end_time: endTime,
    p_lesson_id: lessonId,
    p_lesson_type: lessonType,
    p_location_type: locationType,
    p_notes: nullableText(formData, "notes"),
    p_player_id: playerId,
    p_scope: editScope,
    p_start_time: startTime,
    p_status: status,
    p_title: title || "Coaching lesson"
  });

  if (error) {
    console.error("CoachR lesson update failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "update_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", editScope === "single" ? "updated" : "series_updated");
}

export async function cancelCoachLesson(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";
  const lessonId = optionalUuid(formData, "lessonId");
  const cancelStatus = allowedValue<CoachLessonStatus>(text(formData, "cancelStatus"), ["cancelled", "rain", "sick"], "cancelled");
  const cancelScope = allowedValue<SeriesScope>(text(formData, "cancelScope"), [...seriesScopes], "single");

  if (context.kind !== "authenticated" || !lessonId) {
    redirectWithParam(returnTo, "lesson_error", "invalid_lesson");
  }

  const { error } = await context.supabase.rpc("coachr_cancel_lesson_series_with_booking", {
    p_cancel_status: cancelStatus,
    p_lesson_id: lessonId,
    p_scope: cancelScope,
    p_notes: nullableText(formData, "notes")
  });

  if (error) {
    console.error("CoachR lesson cancel failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "cancel_failed"));
  }

  const { error: notificationError } = await context.supabase.rpc("coachr_notify_lesson_cancellation", {
    p_lesson_id: lessonId
  });

  if (notificationError) {
    console.error("CoachR lesson cancellation notification failed", {
      error: notificationError,
      lessonId,
      role: context.role
    });
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", cancelScope === "single" ? "cancelled" : "series_cancelled");
}

export async function markCoachLessonAttendance(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";
  const lessonId = optionalUuid(formData, "lessonId");
  const playerId = optionalUuid(formData, "playerId");
  const attendanceStatus = allowedValue<CoachLessonAttendanceResult>(text(formData, "attendanceStatus"), coachLessonAttendanceResults, "attended");
  const markAll = text(formData, "markAll") === "true";
  const confirmCorrection = text(formData, "confirmCorrection") === "on" || text(formData, "confirmCorrection") === "true";

  if (context.kind !== "authenticated" || !lessonId) {
    redirectWithParam(returnTo, "lesson_error", "invalid_lesson");
  }

  if (!markAll && !playerId) {
    redirectWithParam(returnTo, "lesson_error", "attendance_player");
  }

  const { error } = await context.supabase.rpc("coachr_mark_lesson_attendance", {
    p_attendance_status: attendanceStatus,
    p_confirm_correction: confirmCorrection,
    p_lesson_id: lessonId,
    p_mark_all: markAll,
    p_notes: nullableText(formData, "attendanceNotes"),
    p_player_id: markAll ? null : playerId
  });

  if (error) {
    console.error("CoachR attendance mark failed", { error, role: context.role, lessonId, playerId, markAll });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "attendance_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", "attendance_marked");
}
