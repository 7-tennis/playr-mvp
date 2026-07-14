"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { searchAcademyConnectionCandidates } from "@/lib/academy-students";
import { assertCoachRAccess } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function invitationError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (
    [
      "access",
      "already_connected",
      "confirm_required",
      "duplicate_invitation",
      "invalid_coach",
      "invalid_player",
      "invalid_student",
      "invalid_venue",
      "invitation_closed",
      "missing_fields",
      "parent_contact_missing",
      "player_contact_missing"
    ].includes(message)
  ) {
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
  revalidatePath("/dashboard/players/[id]", "page");
}

export async function searchExistingPlayerConnections(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const query = text(formData, "query");
  const venueId = context.kind === "authenticated" ? context.venueId ?? context.activeOrganisationMembership?.venue_id : null;

  if (context.kind !== "authenticated" || !venueId || query.length < 3) {
    return { candidates: [], error: "search_too_broad" as const };
  }

  const result = await searchAcademyConnectionCandidates(context, query, venueId);
  return {
    candidates: result.candidates,
    error: result.error
  };
}

export async function requestExistingPlayerLink(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const playerProfileId = text(formData, "playerProfileId");
  const venueId = context.kind === "authenticated" ? context.venueId ?? context.activeOrganisationMembership?.venue_id : null;

  if (context.kind !== "authenticated" || !venueId || !playerProfileId) {
    redirect("/dashboard/coachr/students?error=missing_fields");
  }

  const { data: token, error } = await context.supabase.rpc("coachr_request_existing_player_connection", {
    p_coach_profile_id: text(formData, "coachProfileId") || null,
    p_player_profile_id: playerProfileId,
    p_proposal: {},
    p_venue_id: venueId
  });

  if (error || !token) {
    console.error("CoachR existing player connection request failed", {
      code: error?.code,
      role: context.role,
      venueId
    });
    redirect(`/dashboard/coachr/students?error=${invitationError(error, "player_invite_failed")}`);
  }

  revalidateStudentSurfaces();
  redirect(`/dashboard/coachr/students?message=player_invited&token=${token}`);
}

export async function assignStudentCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const playerProfileId = text(formData, "playerProfileId");
  const coachProfileId = text(formData, "coachProfileId");
  const venueId = context.kind === "authenticated" ? context.venueId ?? context.activeOrganisationMembership?.venue_id : null;

  if (context.kind !== "authenticated" || !venueId || !playerProfileId || !coachProfileId) {
    redirect("/dashboard/coachr/students?error=missing_fields");
  }

  const { error } = await context.supabase.rpc("coachr_assign_student_coach", {
    p_coach_profile_id: coachProfileId,
    p_player_profile_id: playerProfileId,
    p_venue_id: venueId
  });

  if (error) {
    console.error("CoachR student coach assignment failed", {
      code: error.code,
      role: context.role,
      venueId
    });
    redirect(`/dashboard/coachr/students?error=${invitationError(error, "assignment_failed")}`);
  }

  revalidateStudentSurfaces();
  redirect("/dashboard/coachr/students?message=coach_assigned");
}

export async function requestAdultPlayerLink(formData: FormData) {
  const context = await assertCoachRAccess("coachr:students");
  const playerEmail = text(formData, "playerEmail").toLowerCase();
  const venueId = context.kind === "authenticated" ? context.venueId ?? context.activeOrganisationMembership?.venue_id : null;

  if (context.kind !== "authenticated" || !venueId || !playerEmail) {
    redirect("/dashboard/coachr/students?error=missing_fields");
  }

  const { data: token, error } = await context.supabase.rpc("create_adult_player_invitation_with_context", {
    p_coach_profile_id: text(formData, "coachProfileId") || context.adultProfileId,
    p_invited_email: playerEmail,
    p_invited_name: text(formData, "playerName") || null,
    p_invited_phone: text(formData, "playerPhone") || null,
    p_proposal: proposal(formData),
    p_venue_id: venueId
  });

  if (error || !token) {
    console.error("CoachR adult player link request failed", { code: error?.code, role: context.role, venueId });
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
  const venueId = context.kind === "authenticated" ? context.venueId ?? context.activeOrganisationMembership?.venue_id : null;

  if (context.kind !== "authenticated" || !venueId || !parentEmail || !playerFirstName || !playerLastName) {
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
    p_venue_id: venueId
  });

  if (error || !token) {
    console.error("CoachR player link request failed", { error, role: context.role, venueId });
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
