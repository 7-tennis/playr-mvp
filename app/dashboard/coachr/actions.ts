"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coachLessonAttendanceResults, coachLessonStatuses, coachLessonTypes } from "@/lib/coach-lessons";
import { assertCoachRAccess } from "@/lib/permissions";
import type { CoachLessonAttendanceResult, CoachLessonStatus, CoachLessonType } from "@/types/courtside";

const repeatModes = ["none", "weekly"] as const;
const seriesScopes = ["single", "future", "series"] as const;

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
  return value ? new Date(value).toISOString() : "";
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
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/my-bookings");
  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/play/plan-match");
}

async function preflightCoachLessonCreate({
  coachId,
  context,
  courtId,
  playerId,
  venueId
}: {
  coachId: string | null;
  context: AuthenticatedCoachRContext;
  courtId: string | null;
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
  if (!courtId) {
    return "no_active_courts";
  }
  if (!playerId) {
    return "no_students";
  }

  const [courtResult, playerResult, coachVenueResult] = await Promise.all([
    context.supabase.from("courts").select("id,name,venue_id,status").eq("id", courtId).maybeSingle(),
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
  if (!courtResult.data || courtResult.data.venue_id !== venueId || courtResult.data.status !== "active") {
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
  const startTime = datetimeValue(formData, "startTime");
  const endTime = datetimeValue(formData, "endTime");
  const lessonType = allowedValue<CoachLessonType>(text(formData, "lessonType"), coachLessonTypes, "private");
  const title = text(formData, "title") || "Coaching lesson";
  const repeatMode = allowedValue<RepeatMode>(text(formData, "repeatMode"), [...repeatModes], "none");
  const setupError = await preflightCoachLessonCreate({
    coachId,
    context,
    courtId,
    playerId,
    venueId
  });

  if (setupError) {
    redirectWithParam(returnTo, "lesson_error", setupError);
  }

  if (repeatMode === "weekly") {
    const recurrenceStartDate = dateValue(formData, "recurrenceStartDate");
    const recurrenceEndDate = dateValue(formData, "recurrenceEndDate");
    const dayOfWeek = Number(text(formData, "dayOfWeek"));
    const lessonStartTime = timeValue(formData, "lessonStartTime");
    const lessonEndTime = timeValue(formData, "lessonEndTime");

    if (!venueId || !coachId || !playerId || !courtId || !recurrenceStartDate || !recurrenceEndDate || !lessonStartTime || !lessonEndTime || !Number.isInteger(dayOfWeek)) {
      redirectWithParam(returnTo, "lesson_error", "missing_fields");
    }

    if (dayOfWeek < 1 || dayOfWeek > 7 || new Date(`${recurrenceEndDate}T00:00:00Z`).getTime() < new Date(`${recurrenceStartDate}T00:00:00Z`).getTime()) {
      redirectWithParam(returnTo, "lesson_error", "recurrence_range");
    }

    if (new Date(`${recurrenceEndDate}T00:00:00Z`).getTime() > new Date(`${recurrenceStartDate}T00:00:00Z`).getTime() + 366 * 24 * 60 * 60 * 1000) {
      redirectWithParam(returnTo, "lesson_error", "recurrence_range");
    }

    if (lessonEndTime <= lessonStartTime) {
      redirectWithParam(returnTo, "lesson_error", "time_order");
    }

    const { error } = await context.supabase.rpc("coachr_create_weekly_lesson_series", {
      p_coach_id: coachId,
      p_court_id: courtId,
      p_day_of_week: dayOfWeek,
      p_end_date: recurrenceEndDate,
      p_end_time: lessonEndTime,
      p_lesson_type: lessonType,
      p_notes: nullableText(formData, "notes"),
      p_player_id: playerId,
      p_start_date: recurrenceStartDate,
      p_start_time: lessonStartTime,
      p_title: title,
      p_venue_id: venueId
    });

    if (error) {
      console.error("CoachR weekly lesson series create failed", { error, role: context.role, venueId, coachId });
      redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "create_failed"));
    }

    revalidateCoachLessonSurfaces();
    redirectWithParam(returnTo, "lesson", "series_created");
  }

  if (!venueId || !coachId || !playerId || !courtId || !startTime || !endTime) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  const { error } = await context.supabase.rpc("coachr_create_lesson_with_booking", {
    p_coach_id: coachId,
    p_court_id: courtId,
    p_end_time: endTime,
    p_lesson_type: lessonType,
    p_notes: nullableText(formData, "notes"),
    p_player_id: playerId,
    p_start_time: startTime,
    p_title: title,
    p_venue_id: venueId
  });

  if (error) {
    console.error("CoachR lesson create failed", { error, role: context.role, venueId, coachId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "create_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", "created");
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
  const editScope = allowedValue<SeriesScope>(text(formData, "editScope"), [...seriesScopes], "single");

  if (!playerId || !courtId || !startTime || !endTime) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  const { error } = await context.supabase.rpc("coachr_update_lesson_series_with_bookings", {
    p_court_id: courtId,
    p_end_time: endTime,
    p_lesson_id: lessonId,
    p_lesson_type: lessonType,
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
