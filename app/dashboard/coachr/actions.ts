"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canUseCoachForLesson,
  canUseCoachLessonVenue,
  coachLessonAttendanceStatuses,
  coachLessonFeedbackStatuses,
  coachLessonStatuses,
  coachLessonTypes
} from "@/lib/coach-lessons";
import { assertCoachRAccess } from "@/lib/permissions";
import type { CoachLessonAttendanceStatus, CoachLessonFeedbackStatus, CoachLessonStatus, CoachLessonType } from "@/types/courtside";

type LessonScopeRow = {
  id: string;
  venue_id: string;
  coach_id: string;
};

type LessonPlayerRow = {
  id: string;
  is_junior: boolean;
  parent_profile_id: string | null;
};

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

async function getLessonScope(context: Awaited<ReturnType<typeof assertCoachRAccess>>, lessonId: string) {
  if (context.kind !== "authenticated") {
    return null;
  }

  const { data } = await context.supabase.from("coach_lessons").select("id,venue_id,coach_id").eq("id", lessonId).maybeSingle();
  return (data as LessonScopeRow | null) ?? null;
}

function canManageLessonScope(context: Extract<Awaited<ReturnType<typeof assertCoachRAccess>>, { kind: "authenticated" }>, lesson: LessonScopeRow) {
  if (context.role === "coach") {
    return canUseCoachForLesson(context, lesson.coach_id);
  }

  return canUseCoachLessonVenue(context, lesson.venue_id);
}

async function coachCanTeachAtVenue(
  context: Extract<Awaited<ReturnType<typeof assertCoachRAccess>>, { kind: "authenticated" }>,
  coachId: string,
  venueId: string
) {
  const { data, error } = await context.supabase.rpc("coach_profile_can_teach_at_venue", {
    check_coach_id: coachId,
    check_venue_id: venueId
  });

  if (error) {
    console.error("CoachR coach venue validation failed", { error, role: context.role, coachId, venueId });
    return false;
  }

  return data === true;
}

async function visibleLessonPlayer(
  context: Extract<Awaited<ReturnType<typeof assertCoachRAccess>>, { kind: "authenticated" }>,
  playerId: string
) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("id,is_junior,parent_profile_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    console.error("CoachR lesson player validation failed", { error, role: context.role, playerId });
    return null;
  }

  return (data as LessonPlayerRow | null) ?? null;
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
  const courtBookingId = optionalUuid(formData, "courtBookingId");
  const juniorProfileId = optionalUuid(formData, "juniorProfileId");
  const parentId = optionalUuid(formData, "parentId");
  const startTime = datetimeValue(formData, "startTime");
  const endTime = datetimeValue(formData, "endTime");
  const lessonType = allowedValue<CoachLessonType>(text(formData, "lessonType"), coachLessonTypes, "private");
  const title = text(formData, "title") || "Coaching lesson";

  if (!venueId || !coachId || !playerId || !startTime || !endTime) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  if (!canUseCoachLessonVenue(context, venueId) || !canUseCoachForLesson(context, coachId)) {
    redirectWithParam(returnTo, "lesson_error", "access");
  }

  if (!(await coachCanTeachAtVenue(context, coachId, venueId))) {
    redirectWithParam(returnTo, "lesson_error", "coach_venue");
  }

  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    redirectWithParam(returnTo, "lesson_error", "time_order");
  }

  if (courtId) {
    const { data: court } = await context.supabase.from("courts").select("id,venue_id").eq("id", courtId).maybeSingle();
    if (!court || (court as { venue_id: string | null }).venue_id !== venueId) {
      redirectWithParam(returnTo, "lesson_error", "court_venue");
    }
  }

  const { error } = await context.supabase.from("coach_lessons").insert({
    venue_id: venueId,
    coach_id: coachId,
    player_id: playerId,
    junior_profile_id: juniorProfileId,
    parent_id: parentId,
    court_id: courtId,
    court_booking_id: courtBookingId,
    lesson_type: lessonType,
    title,
    start_time: startTime,
    end_time: endTime,
    repeat_rule: nullableText(formData, "repeatRule"),
    recurring_group_id: optionalUuid(formData, "recurringGroupId"),
    status: "scheduled",
    attendance_status: "not_marked",
    feedback_status: "not_started",
    notes: nullableText(formData, "notes"),
    created_by_user_id: context.user.id,
    updated_by_user_id: context.user.id
  });

  if (error) {
    console.error("CoachR lesson create failed", { error, role: context.role, venueId, coachId });
    redirectWithParam(returnTo, "lesson_error", "create_failed");
  }

  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/schedule");
  redirectWithParam(returnTo, "lesson", "created");
}

export async function updateCoachLesson(formData: FormData) {
  const context = await assertCoachRAccess("coachr:schedule");
  const returnTo = text(formData, "returnTo") || "/dashboard/coachr/schedule";
  const lessonId = optionalUuid(formData, "lessonId");

  if (context.kind !== "authenticated" || !lessonId) {
    redirectWithParam(returnTo, "lesson_error", "invalid_lesson");
  }

  const lesson = await getLessonScope(context, lessonId);

  if (!lesson || !canManageLessonScope(context, lesson)) {
    redirectWithParam(returnTo, "lesson_error", "access");
  }

  const status = allowedValue<CoachLessonStatus>(text(formData, "status"), coachLessonStatuses, "scheduled");
  const attendanceStatus = allowedValue<CoachLessonAttendanceStatus>(text(formData, "attendanceStatus"), coachLessonAttendanceStatuses, "not_marked");
  const feedbackStatus = allowedValue<CoachLessonFeedbackStatus>(text(formData, "feedbackStatus"), coachLessonFeedbackStatuses, "not_started");
  const title = text(formData, "title");
  const startTime = datetimeValue(formData, "startTime");
  const endTime = datetimeValue(formData, "endTime");
  const lessonType = allowedValue<CoachLessonType>(text(formData, "lessonType"), coachLessonTypes, "private");
  const playerId = optionalUuid(formData, "playerId");
  const courtId = optionalUuid(formData, "courtId");

  if ((formData.has("startTime") || formData.has("endTime")) && (!startTime || !endTime)) {
    redirectWithParam(returnTo, "lesson_error", "missing_fields");
  }

  const update: Record<string, string | null> = {
    updated_by_user_id: context.user.id
  };

  if (formData.has("status")) {
    update.status = status;
  }
  if (formData.has("attendanceStatus")) {
    update.attendance_status = attendanceStatus;
  }
  if (formData.has("feedbackStatus")) {
    update.feedback_status = feedbackStatus;
  }
  if (formData.has("lessonType")) {
    update.lesson_type = lessonType;
  }
  if (formData.has("notes")) {
    update.notes = nullableText(formData, "notes");
  }
  if (title) {
    update.title = title;
  }

  if (startTime && endTime) {
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      redirectWithParam(returnTo, "lesson_error", "time_order");
    }

    update.start_time = startTime;
    update.end_time = endTime;
  }

  if (formData.has("playerId")) {
    if (!playerId) {
      redirectWithParam(returnTo, "lesson_error", "missing_fields");
    }

    const player = await visibleLessonPlayer(context, playerId);

    if (!player) {
      redirectWithParam(returnTo, "lesson_error", "player_profile");
    }

    update.player_id = player.id;
    update.junior_profile_id = player.is_junior ? player.id : null;
    update.parent_id = player.parent_profile_id;
  }

  if (formData.has("courtId")) {
    if (courtId) {
      const { data: court } = await context.supabase.from("courts").select("id,venue_id").eq("id", courtId).maybeSingle();
      if (!court || (court as { venue_id: string | null }).venue_id !== lesson.venue_id) {
        redirectWithParam(returnTo, "lesson_error", "court_venue");
      }
    }

    update.court_id = courtId;
  }

  const { error } = await context.supabase.from("coach_lessons").update(update).eq("id", lessonId);

  if (error) {
    console.error("CoachR lesson update failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", "update_failed");
  }

  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/schedule");
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

  const lesson = await getLessonScope(context, lessonId);

  if (!lesson || !canManageLessonScope(context, lesson)) {
    redirectWithParam(returnTo, "lesson_error", "access");
  }

  const update: Record<string, string | null> = {
    status: cancelStatus,
    cancelled_at: new Date().toISOString(),
    cancelled_by_user_id: context.user.id,
    updated_by_user_id: context.user.id
  };

  if (formData.has("notes")) {
    update.notes = nullableText(formData, "notes");
  }

  const { error } = await context.supabase.from("coach_lessons").update(update).eq("id", lessonId);

  if (error) {
    console.error("CoachR lesson cancel failed", { error, role: context.role, lessonId });
    redirectWithParam(returnTo, "lesson_error", "cancel_failed");
  }

  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/schedule");
  redirectWithParam(returnTo, "lesson", "cancelled");
}
