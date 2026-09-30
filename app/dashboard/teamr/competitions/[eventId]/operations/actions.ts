"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

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
  ];
  return codes.find((code) => message.includes(code)) ?? "competition_operation_failed";
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
