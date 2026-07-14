"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCoachRAccess } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function invitationError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (["access", "confirm_required", "duplicate_invitation", "invalid_venue", "invitation_closed", "missing_fields"].includes(message)) {
    return message;
  }

  return fallback;
}

function proposal(formData: FormData) {
  const values: Record<string, string | number> = {};
  const fields = [
    ["lessonType", "lessonType"],
    ["proposedDay", "day"],
    ["proposedStartTime", "startTime"],
    ["proposedStartDate", "startDate"],
    ["proposalRecurrence", "recurrence"],
    ["proposalVenue", "venue"],
    ["proposalNotes", "notes"]
  ] as const;

  fields.forEach(([formKey, metadataKey]) => {
    const value = text(formData, formKey);
    if (value) values[metadataKey] = value;
  });
  const duration = Number.parseInt(text(formData, "proposedDuration"), 10);
  if (Number.isFinite(duration) && duration > 0) values.durationMinutes = duration;
  return values;
}

function revalidateStudentSurfaces() {
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/organisations/invitations");
  revalidatePath("/dashboard/notifications");
}

export async function requestAdultPlayerLink(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const playerEmail = text(formData, "playerEmail").toLowerCase();

  if (context.kind !== "authenticated" || !context.venueId || !playerEmail) {
    redirect("/dashboard/coachr/students?error=missing_fields");
  }

  const { data: token, error } = await context.supabase.rpc("create_adult_player_invitation_with_context", {
    p_coach_profile_id: text(formData, "coachProfileId") || context.adultProfileId,
    p_invited_email: playerEmail,
    p_invited_name: text(formData, "playerName") || null,
    p_invited_phone: text(formData, "playerPhone") || null,
    p_proposal: proposal(formData),
    p_venue_id: context.venueId
  });

  if (error || !token) {
    console.error("CoachR adult player link request failed", { code: error?.code, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/students?error=${invitationError(error, "player_invite_failed")}`);
  }

  revalidateStudentSurfaces();
  redirect(`/dashboard/coachr/students?message=player_invited&token=${token}`);
}

export async function requestPlayerLink(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const parentEmail = text(formData, "parentEmail").toLowerCase();
  const parentName = text(formData, "parentName");
  const parentPhone = text(formData, "parentPhone");
  const playerFirstName = text(formData, "playerFirstName");
  const playerLastName = text(formData, "playerLastName");

  if (context.kind !== "authenticated" || !context.venueId || !parentEmail || !playerFirstName || !playerLastName) {
    redirect("/dashboard/coachr/students?error=missing_fields");
  }

  const coachProfileId = text(formData, "coachProfileId") || context.adultProfileId;

  const { data: token, error } = await context.supabase.rpc("create_organisation_invitation", {
    p_invitation_kind: "player_junior",
    p_invited_email: parentEmail,
    p_invited_name: parentName || null,
    p_invited_phone: parentPhone || null,
    p_intended_role: "viewer",
    p_metadata: {
      coachProfileId,
      playerFirstName,
      playerLastName,
      ...(Object.keys(proposal(formData)).length > 0 ? { proposal: proposal(formData) } : {})
    },
    p_parent_profile_id: null,
    p_target_junior_profile_id: null,
    p_target_profile_id: null,
    p_venue_id: context.venueId
  });

  if (error || !token) {
    console.error("CoachR player link request failed", { error, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/students?error=${invitationError(error, "player_invite_failed")}`);
  }

  revalidateStudentSurfaces();
  redirect(`/dashboard/coachr/students?message=player_invited&token=${token}`);
}

export async function cancelPlayerLinkRequest(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const invitationId = text(formData, "invitationId");
  const confirmed = text(formData, "confirmCancel") === "on";

  if (context.kind !== "authenticated" || !invitationId || !confirmed) {
    redirect("/dashboard/coachr/students?error=confirm_required");
  }

  const { error } = await context.supabase.rpc("cancel_organisation_invitation", {
    p_confirm: true,
    p_invitation_id: invitationId
  });

  if (error) {
    console.error("CoachR player link request cancellation failed", { error, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/students?error=${invitationError(error, "player_invite_cancel_failed")}`);
  }

  revalidateStudentSurfaces();
  redirect("/dashboard/coachr/students?message=player_invite_cancelled");
}
