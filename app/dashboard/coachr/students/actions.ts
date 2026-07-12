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

  if (["access", "duplicate_invitation", "invalid_venue", "missing_fields"].includes(message)) {
    return message;
  }

  return fallback;
}

function revalidateStudentSurfaces() {
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/organisations/invitations");
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
      playerLastName
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
