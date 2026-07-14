"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPermissionContext } from "@/lib/permissions";
import { loadOrganisationSetup, productDashboardPath, productSetupPath } from "@/lib/organisation-setup";
import type { OrganisationRole, OrganisationSetupProduct, OrganisationType, PlayerConnectionAcceptanceResult } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function invitationError(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (
    [
      "access",
      "accepted_connection_missing",
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
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/coachr/messages");
  revalidatePath("/dashboard/players/[id]", "page");
}

export async function acceptOrganisationInvitation(formData: FormData) {
  const context = await getPermissionContext();
  const token = text(formData, "token");
  const profileId = text(formData, "profileId") || null;
  const juniorProfileId = text(formData, "juniorProfileId") || null;

  if (context.kind !== "authenticated" || !token) {
    redirect("/dashboard/organisations/invitations?error=invalid_invitation");
  }

  const invitationResult = await context.supabase
    .from("organisation_invitations")
    .select("invitation_kind,intended_role,status,venue_id,venue:venue_id(organisation_type)")
    .eq("token", token)
    .maybeSingle();

  if (invitationResult.error || !invitationResult.data) {
    console.error("Organisation invitation lookup failed before acceptance", {
      code: invitationResult.error?.code,
      userId: context.user.id.slice(0, 8)
    });
    redirect(`/dashboard/organisations/invitations?token=${token}&error=invalid_invitation`);
  }

  const isPlayerConnection = invitationResult.data.invitation_kind === "player" || invitationResult.data.invitation_kind === "player_junior";
  const acceptance = isPlayerConnection
    ? await context.supabase.rpc("accept_player_connection_invitation", {
        p_junior_profile_id: juniorProfileId,
        p_profile_id: profileId,
        p_token: token
      })
    : await context.supabase.rpc("accept_organisation_invitation", {
        p_junior_profile_id: juniorProfileId,
        p_profile_id: profileId,
        p_token: token
      });

  if (acceptance.error) {
    console.error("Organisation invitation acceptance failed", {
      code: acceptance.error.code,
      message: acceptance.error.message,
      userId: context.user.id.slice(0, 8)
    });
    redirect(`/dashboard/organisations/invitations?token=${token}&error=${invitationError(acceptance.error, "accept_failed")}`);
  }

  revalidateInvitationSurfaces();

  if (isPlayerConnection) {
    const result = acceptance.data as PlayerConnectionAcceptanceResult | null;

    if (!result || result.status !== "accepted") {
      redirect(`/dashboard/organisations/invitations?token=${token}&error=${result?.status === "expired" ? "invitation_expired" : "invitation_closed"}`);
    }

    const params = new URLSearchParams({
      message: result.alreadyAccepted ? "connection_already_accepted" : "connection_accepted",
      token
    });

    if (result.warning) {
      params.set("warning", result.warning);
    }

    redirect(`/dashboard/organisations/invitations?${params.toString()}`);
  }

  const invitation = invitationResult.data as unknown as {
    invitation_kind: string;
    intended_role: OrganisationRole;
    venue_id: string;
    venue: { organisation_type: OrganisationType } | null;
  } | null;
  const leaderRoles: OrganisationRole[] = ["organisation_admin", "club_manager", "head_coach", "sports_coordinator", "team_manager"];

  if (invitation && leaderRoles.includes(invitation.intended_role)) {
    const setupProduct: OrganisationSetupProduct = invitation.intended_role === "sports_coordinator" || invitation.intended_role === "team_manager"
      ? "teamr"
      : invitation.venue?.organisation_type === "academy" || invitation.intended_role === "head_coach"
        ? "coachr"
        : "clubr";

    if (setupProduct !== "teamr") {
      const setup = await loadOrganisationSetup(context.supabase, invitation.venue_id, setupProduct);
      redirect(setup.setup.status === "complete" ? productDashboardPath(setupProduct) : productSetupPath(setupProduct, setup.setup.current_step));
    }
  }

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
