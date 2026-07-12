"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCoachRAccess } from "@/lib/permissions";
import type { OrganisationRole } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const coachInvitationRoles: OrganisationRole[] = ["head_coach", "coach", "assistant_coach"];

function allowedValue<T extends string>(value: string, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function errorCode(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (["access", "adult_profile_required", "confirm_required", "duplicate_invitation", "invalid_assignment", "invalid_role", "missing_fields", "protected_role"].includes(message)) {
    return message;
  }

  return fallback;
}

function revalidateCoachAccess() {
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/coaches");
  revalidatePath("/dashboard/coachr/more");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/students");
}

export async function assignVenueCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const profileId = text(formData, "profileId");
  const confirmed = text(formData, "confirmAssignment") === "on";

  if (context.kind !== "authenticated") {
    redirect("/dashboard/coachr/coaches?error=access");
  }
  if (!profileId || !confirmed) {
    redirect("/dashboard/coachr/coaches?error=confirm_required");
  }

  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("id,user_id,is_junior")
    .eq("id", profileId)
    .eq("is_junior", false)
    .maybeSingle();

  if (profileError || !profile?.user_id) {
    redirect("/dashboard/coachr/coaches?error=adult_profile_required");
  }

  const { error } = await context.supabase.rpc("head_coach_assign_coach", {
    p_confirm: true,
    p_target_user_id: profile.user_id
  });

  if (error) {
    console.error("CoachR coach assignment failed", { error, profileId, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "assign_failed")}`);
  }

  revalidateCoachAccess();
  redirect("/dashboard/coachr/coaches?message=coach_assigned");
}

export async function deactivateVenueCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const targetUserId = text(formData, "targetUserId");
  const membershipId = text(formData, "membershipId");
  const confirmed = text(formData, "confirmDeactivate") === "on";

  if (context.kind !== "authenticated" || (!targetUserId && !membershipId) || !confirmed) {
    redirect("/dashboard/coachr/coaches?error=confirm_required");
  }

  if (membershipId) {
    let update = context.supabase
      .from("organisation_memberships")
      .update({
        removed_at: new Date().toISOString(),
        status: "removed"
      })
      .eq("id", membershipId)
      .in("role", ["coach", "assistant_coach"]);

    if (context.role !== "platform_admin" && context.venueId) {
      update = update.eq("venue_id", context.venueId);
    }

    const { error } = await update;

    if (error) {
      console.error("CoachR coach membership removal failed", { error, membershipId, role: context.role, venueId: context.venueId });
      redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "deactivate_failed")}`);
    }

    revalidateCoachAccess();
    redirect("/dashboard/coachr/coaches?message=coach_deactivated");
  }

  const { error } = await context.supabase.rpc("head_coach_deactivate_coach", {
    p_confirm: true,
    p_target_user_id: targetUserId
  });

  if (error) {
    console.error("CoachR coach deactivation failed", { error, targetUserId, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "deactivate_failed")}`);
  }

  revalidateCoachAccess();
  redirect("/dashboard/coachr/coaches?message=coach_deactivated");
}

export async function inviteVenueCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const email = text(formData, "email").toLowerCase();
  const invitedName = text(formData, "invitedName") || null;
  const invitedPhone = text(formData, "invitedPhone") || null;
  const intendedRole = allowedValue<OrganisationRole>(text(formData, "intendedRole"), coachInvitationRoles, "coach");

  if (context.kind !== "authenticated" || !context.venueId || !email) {
    redirect("/dashboard/coachr/coaches?error=missing_fields");
  }

  if (intendedRole === "head_coach" && context.activeOrganisationRole !== "organisation_admin" && context.activeOrganisationRole !== "club_manager" && context.role !== "platform_admin") {
    redirect("/dashboard/coachr/coaches?error=access");
  }

  const { data: token, error } = await context.supabase.rpc("create_organisation_invitation", {
    p_invitation_kind: "coach",
    p_invited_email: email,
    p_invited_name: invitedName,
    p_invited_phone: invitedPhone,
    p_intended_role: intendedRole,
    p_metadata: {},
    p_parent_profile_id: null,
    p_target_junior_profile_id: null,
    p_target_profile_id: null,
    p_venue_id: context.venueId
  });

  if (error || !token) {
    console.error("Coach invitation failed", { error, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "invite_failed")}`);
  }

  revalidateCoachAccess();
  redirect(`/dashboard/coachr/coaches?message=coach_invited&token=${token}`);
}

export async function cancelVenueCoachInvitation(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const invitationId = text(formData, "invitationId");
  const confirmed = text(formData, "confirmCancel") === "on";

  if (context.kind !== "authenticated" || !invitationId || !confirmed) {
    redirect("/dashboard/coachr/coaches?error=confirm_required");
  }

  const { error } = await context.supabase.rpc("cancel_organisation_invitation", {
    p_confirm: true,
    p_invitation_id: invitationId
  });

  if (error) {
    console.error("Coach invitation cancellation failed", { error, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "invitation_cancel_failed")}`);
  }

  revalidateCoachAccess();
  redirect("/dashboard/coachr/coaches?message=invitation_cancelled");
}
