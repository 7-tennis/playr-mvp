"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function uuid(candidate: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function dateTime(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+02:00` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeReturnTo(formData: FormData, fallback: string) {
  const candidate = value(formData, "returnTo");
  return candidate.startsWith("/dashboard") && !candidate.startsWith("//") ? candidate : fallback;
}

function redirectWith(returnTo: string, key: string, status: string): never {
  const target = new URL(returnTo, "http://localhost");
  target.searchParams.set(key, status);
  redirect(`${target.pathname}${target.search}${target.hash}`);
}

function requestError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.split("\n")[0] ?? "";
  const known = [
    "access",
    "approval_failed",
    "coach_conflict",
    "invalid_request",
    "makeup_not_available",
    "missing_court",
    "player_conflict",
    "request_not_pending",
    "time_order",
    "time_unavailable"
  ];
  if (known.includes(message)) return message;
  if (message.startsWith("court_conflict:")) return "time_unavailable";
  if (error?.code === "PGRST202" || message.toLowerCase().includes("could not find the function")) return "missing_migration";
  return "request_failed";
}

function revalidateRequestSurfaces(playerProfileId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/book-court");
  revalidatePath("/dashboard/my-bookings");
  revalidatePath("/dashboard/clubr/bookings");
  if (playerProfileId) revalidatePath(`/dashboard/players/${playerProfileId}`);
}

export async function createMakeupSessionRequest(formData: FormData) {
  const returnTo = safeReturnTo(formData, "/dashboard");
  const occurrenceId = uuid(value(formData, "occurrenceId"));
  const playerProfileId = uuid(value(formData, "playerProfileId"));
  const courtId = uuid(value(formData, "courtId"));
  const startTime = dateTime(formData, "startTime");
  const endTime = dateTime(formData, "endTime");
  if (!occurrenceId || !playerProfileId || !courtId || !startTime || !endTime) {
    redirectWith(returnTo, "request_error", "missing_fields");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("coachr_create_makeup_request", {
    p_message: value(formData, "message") || null,
    p_occurrence_id: occurrenceId,
    p_proposed_court_id: courtId,
    p_proposed_end_time: endTime,
    p_proposed_start_time: startTime
  });
  if (error) {
    console.error("Player make-up request failed", {
      code: error.code,
      occurrenceId,
      userId: user.id
    });
    redirectWith(returnTo, "request_error", requestError(error));
  }

  revalidateRequestSurfaces(playerProfileId);
  redirectWith(returnTo, "request", "makeup_requested");
}

export async function respondToSessionRequest(formData: FormData) {
  const returnTo = safeReturnTo(formData, "/dashboard");
  const requestId = uuid(value(formData, "requestId"));
  const playerProfileId = uuid(value(formData, "playerProfileId"));
  const response = value(formData, "response");
  if (!requestId || !["approve", "decline"].includes(response)) {
    redirectWith(returnTo, "request_error", "invalid_request");
  }
  if (value(formData, "confirmResponse") !== "confirmed") {
    redirectWith(returnTo, "request_error", "confirmation_required");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("coachr_respond_to_session_request", {
    p_message: value(formData, "message") || null,
    p_request_id: requestId,
    p_response: response
  });
  if (error) {
    console.error("Session request response failed", {
      code: error.code,
      requestId,
      response,
      userId: user.id
    });
    redirectWith(returnTo, "request_error", requestError(error));
  }

  const result = data as { status?: string; error?: string } | null;
  if (result?.status === "failed") {
    revalidateRequestSurfaces(playerProfileId);
    redirectWith(returnTo, "request_error", result.error ?? "approval_failed");
  }

  revalidateRequestSurfaces(playerProfileId);
  redirectWith(returnTo, "request", response === "approve" ? "approved" : "declined");
}
