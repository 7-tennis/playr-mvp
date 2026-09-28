"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function structurePath(eventId: string) {
  return `/dashboard/teamr/competitions/${eventId}/structure`;
}

function numberOrNull(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function errorCode(error: { message?: string } | null) {
  const message = error?.message ?? "";
  for (const code of ["competition_access", "competition_event_not_mutable", "competition_format_invalid", "competition_participants_invalid", "competition_participants_changed", "competition_groups_invalid", "competition_knockout_invalid", "competition_progression_invalid", "competition_locked", "competition_stale", "competition_not_configured", "competition_not_adjustable", "competition_group_mismatch", "competition_group_would_be_empty"]) {
    if (message.includes(code)) return code;
  }
  return "competition_operation_failed";
}

async function client() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function revalidate(eventId: string) {
  revalidatePath(structurePath(eventId));
  revalidatePath(`/dashboard/teamr/competitions/${eventId}`);
}

export async function configureCompetition(formData: FormData) {
  const eventId = text(formData, "eventId");
  const format = text(formData, "format");
  if (!eventId) redirect("/dashboard/teamr/competitions?error=invalid_event");
  const participantIds = formData.getAll("participantAssignmentId").filter((value): value is string => typeof value === "string" && value.length > 0);
  const supabase = await client();
  const { error } = await supabase.rpc("configure_event_competition", {
    p_advancing_per_group: format === "round_robin_knockout" ? numberOrNull(text(formData, "advancingPerGroup")) : null,
    p_event_id: eventId,
    p_format: format,
    p_group_count: format === "knockout" ? null : numberOrNull(text(formData, "groupCount")),
    p_participant_assignment_ids: participantIds
  });
  if (error) redirect(`${structurePath(eventId)}?error=${errorCode(error)}`);
  revalidate(eventId);
  redirect(`${structurePath(eventId)}?message=configured`);
}

export async function generateCompetition(formData: FormData) {
  const eventId = text(formData, "eventId");
  if (!eventId) redirect("/dashboard/teamr/competitions?error=invalid_event");
  const supabase = await client();
  const { error } = await supabase.rpc("generate_event_competition", { p_event_id: eventId });
  if (error) redirect(`${structurePath(eventId)}?error=${errorCode(error)}`);
  revalidate(eventId);
  redirect(`${structurePath(eventId)}?message=generated`);
}

export async function moveGroupParticipant(formData: FormData) {
  const eventId = text(formData, "eventId");
  const memberId = text(formData, "memberId");
  const targetGroupId = text(formData, "targetGroupId");
  if (!eventId || !memberId || !targetGroupId) redirect(`${structurePath(eventId)}?error=competition_group_mismatch`);
  const supabase = await client();
  const { error } = await supabase.rpc("move_competition_group_member", { p_member_id: memberId, p_target_group_id: targetGroupId });
  if (error) redirect(`${structurePath(eventId)}?error=${errorCode(error)}`);
  revalidate(eventId);
  redirect(`${structurePath(eventId)}?message=participant_moved`);
}

export async function lockCompetition(formData: FormData) {
  const eventId = text(formData, "eventId");
  if (!eventId) redirect("/dashboard/teamr/competitions?error=invalid_event");
  const supabase = await client();
  const { error } = await supabase.rpc("lock_event_competition", { p_event_id: eventId });
  if (error) redirect(`${structurePath(eventId)}?error=${errorCode(error)}`);
  revalidate(eventId);
  redirect(`${structurePath(eventId)}?message=locked`);
}
