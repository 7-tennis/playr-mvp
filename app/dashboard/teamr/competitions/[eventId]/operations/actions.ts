"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import {
  buildCompetitionSchedule,
  CompetitionScheduleError,
  type ScheduleCourt,
  type ScheduleMatch
} from "@/lib/competition-scheduler";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function path(eventId: string) {
  return `/dashboard/teamr/competitions/${eventId}/operations`;
}

function integerOrNull(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function sastOrNull(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "invalid";
  const parsed = new Date(`${value}:00+02:00`);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed.toISOString();
}

function errorCode(error: { message?: string } | null) {
  const message = error?.message ?? "";
  const codes = [
    "competition_operations_access", "competition_operations_event_not_mutable", "competition_structure_required",
    "competition_court_invalid", "competition_linked_court_invalid", "competition_court_duplicate",
    "competition_court_in_use", "competition_court_time_conflict", "competition_player_time_conflict",
    "competition_staff_time_conflict", "competition_progression_time_conflict", "competition_progression_queue_conflict",
    "competition_time_outside_event", "competition_queue_position_invalid", "competition_match_not_scheduled", "competition_match_staff_invalid",
    "competition_match_staff_duplicate", "competition_operations_exist", "competition_courts_required"
    ,"competition_schedule_confirmation_required", "competition_schedule_settings_invalid", "competition_schedule_plan_invalid"
    ,"competition_schedule_structure_invalid", "competition_schedule_courts_invalid", "competition_schedule_unfeasible"
    ,"competition_schedule_event_window_conflict", "competition_player_rest_conflict"
  ];
  return codes.find((code) => message.includes(code)) ?? "competition_operation_failed";
}

type ScheduleInput = {
  event: { starts_at: string; ends_at: string };
  courts: ScheduleCourt[];
  matches: ScheduleMatch[];
  has_existing_operations: boolean;
};

function selectedCourts(input: ScheduleInput, requestedCount: number) {
  const selected = input.courts.slice(0, requestedCount).map((court, index) => ({
    id: court.id,
    is_new: false,
    label: court.label,
    order: index + 1
  }));
  const labels = new Set(input.courts.map((court) => court.label.toLocaleLowerCase()));
  let suffix = 1;
  while (selected.length < requestedCount) {
    while (labels.has(`court ${suffix}`)) suffix += 1;
    const label = `Court ${suffix}`;
    labels.add(label.toLocaleLowerCase());
    selected.push({ id: crypto.randomUUID(), is_new: true, label, order: selected.length + 1 });
    suffix += 1;
  }
  return selected;
}

export async function generateCompetitionSchedule(formData: FormData) {
  const eventId = text(formData, "eventId");
  const mode = text(formData, "mode");
  const courtCount = integerOrNull(text(formData, "courtCount"));
  const duration = integerOrNull(text(formData, "matchDurationMinutes"));
  const minimumRest = integerOrNull(text(formData, "minimumRestMinutes")) ?? 0;
  const requestedStart = sastOrNull(text(formData, "scheduleStart"));
  const confirmReplace = text(formData, "confirmReplace") === "yes";
  if (!eventId || !["timed", "queue"].includes(mode) || courtCount === null || courtCount < 1 || courtCount > 32
    || minimumRest < 0 || minimumRest > 240 || (mode === "timed" && (duration === null || requestedStart === "invalid" || !requestedStart))) {
    redirect(`${path(eventId)}?error=competition_schedule_settings_invalid`);
  }

  const supabase = await client();
  const { data, error: inputError } = await supabase.rpc("get_event_competition_schedule_input", { p_event_id: eventId });
  if (inputError) redirect(`${path(eventId)}?error=${errorCode(inputError)}`);
  const input = data as unknown as ScheduleInput;
  if (input.has_existing_operations && !confirmReplace) {
    redirect(`${path(eventId)}?error=competition_schedule_confirmation_required`);
  }

  const courts = selectedCourts(input, courtCount);
  let plan;
  try {
    plan = buildCompetitionSchedule(input.matches, courts, {
      eventEndAt: input.event.ends_at,
      matchDurationMinutes: mode === "timed" ? duration : null,
      minimumRestMinutes: minimumRest,
      mode: mode as "timed" | "queue",
      startAt: mode === "timed" ? requestedStart as string : null
    });
  } catch (error) {
    const code = error instanceof CompetitionScheduleError ? error.code : "competition_schedule_unfeasible";
    redirect(`${path(eventId)}?error=${code}`);
  }

  const { error } = await supabase.rpc("generate_event_competition_schedule", {
    p_confirm_replace: confirmReplace,
    p_event_id: eventId,
    p_operations: plan.operations,
    p_settings: {
      courts: courts.map((court) => ({ court_order: court.order, id: court.id, is_new: court.is_new, label: court.label })),
      estimated_finish: plan.estimatedFinish,
      match_duration_minutes: mode === "timed" ? duration : null,
      minimum_rest_minutes: minimumRest,
      mode,
      schedule_start: mode === "timed" ? requestedStart : null
    }
  });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=schedule_generated`);
}

async function client() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function refresh(eventId: string) {
  revalidatePath(path(eventId));
  revalidatePath(`/dashboard/teamr/competitions/${eventId}/structure`);
  revalidatePath(`/dashboard/teamr/competitions/${eventId}`);
}

export async function saveCompetitionCourt(formData: FormData) {
  const eventId = text(formData, "eventId");
  if (!eventId) redirect("/dashboard/teamr/competitions?error=invalid_event");
  const supabase = await client();
  const { error } = await supabase.rpc("save_event_competition_court", {
    p_court_id: text(formData, "courtId") || null,
    p_court_order: integerOrNull(text(formData, "courtOrder")),
    p_event_id: eventId,
    p_label: text(formData, "label"),
    p_linked_court_id: text(formData, "linkedCourtId") || null,
    p_notes: text(formData, "notes") || null
  });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=court_saved`);
}

export async function deactivateCompetitionCourt(formData: FormData) {
  const eventId = text(formData, "eventId");
  const courtId = text(formData, "courtId");
  if (!eventId || !courtId) redirect(`${path(eventId)}?error=competition_court_invalid`);
  const supabase = await client();
  const { error } = await supabase.rpc("deactivate_event_competition_court", { p_court_id: courtId });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=court_deactivated`);
}

export async function scheduleCompetitionMatch(formData: FormData) {
  const eventId = text(formData, "eventId");
  const matchId = text(formData, "matchId");
  const scheduledAt = sastOrNull(text(formData, "scheduledAt"));
  if (!eventId || !matchId || scheduledAt === "invalid") redirect(`${path(eventId)}?error=competition_time_outside_event`);
  const supabase = await client();
  const { error } = await supabase.rpc("schedule_competition_match", {
    p_event_court_id: text(formData, "eventCourtId") || null,
    p_match_id: matchId,
    p_queue_position: integerOrNull(text(formData, "queuePosition")),
    p_scheduled_at: scheduledAt
  });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=match_scheduled`);
}

export async function unscheduleCompetitionMatch(formData: FormData) {
  const eventId = text(formData, "eventId");
  const matchId = text(formData, "matchId");
  if (!eventId || !matchId) redirect(`${path(eventId)}?error=competition_match_not_scheduled`);
  const supabase = await client();
  const { error } = await supabase.rpc("unschedule_competition_match", { p_match_id: matchId });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=match_unscheduled`);
}

export async function moveCompetitionMatchQueue(formData: FormData) {
  const eventId = text(formData, "eventId");
  const matchId = text(formData, "matchId");
  const direction = text(formData, "direction");
  if (!eventId || !matchId || !["up", "down"].includes(direction)) redirect(`${path(eventId)}?error=competition_queue_position_invalid`);
  const supabase = await client();
  const { error } = await supabase.rpc("move_competition_match_queue", { p_direction: direction, p_match_id: matchId });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=queue_moved`);
}

export async function autoDistributeCompetitionMatches(formData: FormData) {
  const eventId = text(formData, "eventId");
  if (!eventId) redirect("/dashboard/teamr/competitions?error=invalid_event");
  const supabase = await client();
  const { error } = await supabase.rpc("auto_distribute_competition_matches", { p_event_id: eventId });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=matches_distributed`);
}

export async function assignCompetitionMatchStaff(formData: FormData) {
  const eventId = text(formData, "eventId");
  const matchId = text(formData, "matchId");
  const assignmentId = text(formData, "eventStaffAssignmentId");
  if (!eventId || !matchId || !assignmentId) redirect(`${path(eventId)}?error=competition_match_staff_invalid`);
  const supabase = await client();
  const { error } = await supabase.rpc("assign_competition_match_staff", {
    p_event_staff_assignment_id: assignmentId,
    p_match_id: matchId
  });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=staff_assigned`);
}

export async function removeCompetitionMatchStaff(formData: FormData) {
  const eventId = text(formData, "eventId");
  const assignmentId = text(formData, "assignmentId");
  if (!eventId || !assignmentId) redirect(`${path(eventId)}?error=competition_match_staff_invalid`);
  const supabase = await client();
  const { error } = await supabase.rpc("remove_competition_match_staff", { p_assignment_id: assignmentId });
  if (error) redirect(`${path(eventId)}?error=${errorCode(error)}`);
  refresh(eventId);
  redirect(`${path(eventId)}?message=staff_removed`);
}
