"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPermissionContext } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function invitationError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (
    [
      "access",
      "adult_profile_required",
      "invalid_invitation",
      "invalid_player",
      "invitation_closed",
      "invitation_expired"
    ].includes(message)
  ) {
    return message;
  }

  return fallback;
}

function revalidateInvitationSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/organisations/invitations");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/students");
  revalidatePath("/dashboard/coachr/coaches");
  revalidatePath("/dashboard/clubr");
}

export async function acceptOrganisationInvitation(formData: FormData) {
  const context = await getPermissionContext();
  const token = text(formData, "token");
  const profileId = text(formData, "profileId") || null;
  const juniorProfileId = text(formData, "juniorProfileId") || null;

  if (context.kind !== "authenticated" || !token) {
    redirect("/dashboard/organisations/invitations?error=invalid_invitation");
  }

  const { error } = await context.supabase.rpc("accept_organisation_invitation", {
    p_junior_profile_id: juniorProfileId,
    p_profile_id: profileId,
    p_token: token
  });

  if (error) {
    console.error("Organisation invitation acceptance failed", { error, userId: context.user.id.slice(0, 8) });
    redirect(`/dashboard/organisations/invitations?token=${token}&error=${invitationError(error, "accept_failed")}`);
  }

  revalidateInvitationSurfaces();
  redirect("/dashboard/organisations/invitations?message=accepted");
}

export async function declineOrganisationInvitation(formData: FormData) {
  const context = await getPermissionContext();
  const token = text(formData, "token");

  if (context.kind !== "authenticated" || !token) {
    redirect("/dashboard/organisations/invitations?error=invalid_invitation");
  }

  const { error } = await context.supabase.rpc("decline_organisation_invitation", {
    p_token: token
  });

  if (error) {
    console.error("Organisation invitation decline failed", { error, userId: context.user.id.slice(0, 8) });
    redirect(`/dashboard/organisations/invitations?token=${token}&error=${invitationError(error, "decline_failed")}`);
  }

  revalidateInvitationSurfaces();
  redirect("/dashboard/organisations/invitations?message=declined");
}
