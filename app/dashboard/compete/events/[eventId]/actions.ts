"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function detailPath(eventId: string, playerId: string, result: { error?: string; message?: string } = {}) {
  const params = new URLSearchParams({ player: playerId });
  if (result.error) params.set("error", result.error);
  if (result.message) params.set("message", result.message);
  return `/dashboard/compete/events/${encodeURIComponent(eventId)}?${params.toString()}`;
}

function participationError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("event_full")) return "event_full";
  if (message.includes("not_eligible")) return "not_eligible";
  if (message.includes("unavailable")) return "unavailable";
  if (message.includes("duplicate")) return "already_requested";
  if (message.includes("access")) return "access";
  return "participation_failed";
}

async function participationClient() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function revalidateParticipation(eventId: string, playerId: string) {
  revalidatePath("/dashboard/compete");
  revalidatePath(`/dashboard/compete/events/${eventId}`);
  revalidatePath(`/dashboard/teamr/competitions/${eventId}`);
  revalidatePath(`/dashboard/compete?player=${playerId}`);
}

export async function requestOrganisationEventEntry(formData: FormData) {
  const eventId = text(formData, "eventId");
  const playerId = text(formData, "playerId");
  if (!eventId || !playerId) redirect("/dashboard/compete?error=participation_failed");
  const supabase = await participationClient();
  const { error } = await supabase.rpc("request_event_entry", {
    p_event_id: eventId,
    p_player_profile_id: playerId
  });
  if (error) {
    console.error("[event-participation] request_failed", { code: error.code, eventId, playerId });
    redirect(detailPath(eventId, playerId, { error: participationError(error) }));
  }
  revalidateParticipation(eventId, playerId);
  redirect(detailPath(eventId, playerId, { message: "entry_requested" }));
}

export async function respondOrganisationEventInvitation(formData: FormData) {
  const eventId = text(formData, "eventId");
  const playerId = text(formData, "playerId");
  const assignmentId = text(formData, "assignmentId");
  const decision = text(formData, "decision");
  if (!eventId || !playerId || !assignmentId || !["accept", "decline"].includes(decision)) {
    redirect("/dashboard/compete?error=participation_failed");
  }
  const supabase = await participationClient();
  const { error } = await supabase.rpc("respond_event_invitation", {
    p_accept: decision === "accept",
    p_assignment_id: assignmentId
  });
  if (error) {
    console.error("[event-participation] response_failed", { assignmentId, code: error.code, eventId, playerId });
    redirect(detailPath(eventId, playerId, { error: participationError(error) }));
  }
  revalidateParticipation(eventId, playerId);
  if (decision === "decline") redirect(`/dashboard/compete?player=${encodeURIComponent(playerId)}&participation=declined`);
  redirect(detailPath(eventId, playerId, { message: "confirmed" }));
}
