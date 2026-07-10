"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { coachLessonStatuses, coachLessonTypes } from "@/lib/coach-lessons";
import { assertCoachRAccess } from "@/lib/permissions";
import type { CoachLessonStatus, CoachLessonType } from "@/types/courtside";

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

  if (message.startsWith("court_conflict:")) {
    return message;
  }

  if (
    [
      "access",
      "coach_conflict",
      "coach_venue",
      "court_venue",
      "invalid_lesson",
      "missing_court",
      "missing_fields",
      "player_profile",
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
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/my-bookings");
  revalidatePath("/dashboard/play");
  revalidatePath("/dashboard/play/plan-match");
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

  if (!playerId || !courtId || !startTime || !endTime) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  const { error } = await context.supabase.rpc("coachr_update_lesson_with_booking", {
    p_court_id: courtId,
    p_end_time: endTime,
    p_lesson_id: lessonId,
    p_lesson_type: lessonType,
    p_notes: nullableText(formData, "notes"),
    p_player_id: playerId,
    p_start_time: startTime,
    p_status: status,
    p_title: title || "Coaching lesson"
  });

  if (error) {
    console.error("CoachR lesson update failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "update_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", "updated");
}

export async function cancelCoachLesson(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";
  const lessonId = optionalUuid(formData, "lessonId");
  const cancelStatus = allowedValue<CoachLessonStatus>(text(formData, "cancelStatus"), ["cancelled", "rain", "sick"], "cancelled");

  if (context.kind !== "authenticated" || !lessonId) {
    redirectWithParam(returnTo, "lesson_error", "invalid_lesson");
  }

  const { error } = await context.supabase.rpc("coachr_cancel_lesson_with_booking", {
    p_cancel_status: cancelStatus,
    p_lesson_id: lessonId,
    p_notes: nullableText(formData, "notes")
  });

  if (error) {
    console.error("CoachR lesson cancel failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", lessonErrorValue(error, "cancel_failed"));
  }

  revalidateCoachLessonSurfaces();
  redirectWithParam(returnTo, "lesson", "cancelled");
}
