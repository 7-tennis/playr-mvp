"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageTeamRPeople, getTeamRAccess, teamRStaffRolesForContext } from "@/lib/teamr";
import type { OrganisationRole } from "@/types/courtside";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorCode(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";
  return ["access", "already_member", "invalid_invitation", "invalid_membership", "invalid_role", "invalid_role_change", "invalid_venue", "missing_fields"]
    .find((code) => message.includes(code)) ?? fallback;
}

async function requirePeopleContext() {
  const access = await getTeamRAccess();
  if (access.context.kind !== "authenticated" || !access.allowed || !access.context.venueId || !canManageTeamRPeople(access.context)) {
    redirect("/dashboard/teamr/people?error=access");
  }
  return access.context;
}

function allowedRole(context: Awaited<ReturnType<typeof requirePeopleContext>>, value: string): OrganisationRole | null {
  return teamRStaffRolesForContext(context).some((role) => role.value === value) ? value as OrganisationRole : null;
}

function revalidatePeople() {
  revalidatePath("/dashboard/teamr/more");
  revalidatePath("/dashboard/teamr/people");
  revalidatePath("/dashboard/teamr/competitions");
}

export async function inviteTeamRStaff(formData: FormData) {
  const context = await requirePeopleContext();
  const email = text(formData, "email").toLowerCase();
  const name = text(formData, "name");
  const role = allowedRole(context, text(formData, "role"));

  if (!email || !role) redirect("/dashboard/teamr/people?error=missing_fields");
  const { data, error } = await context.supabase.rpc("create_teamr_staff_invitation", {
    p_intended_role: role,
    p_invited_email: email,
    p_invited_name: name || null,
    p_venue_id: context.venueId
  });
  if (error || !data) redirect(`/dashboard/teamr/people?error=${errorCode(error, "invite_failed")}`);

  revalidatePeople();
  redirect(`/dashboard/teamr/people?message=invited&token=${encodeURIComponent(String(data))}`);
}

export async function updateTeamRStaffRole(formData: FormData) {
  const context = await requirePeopleContext();
  const membershipId = text(formData, "membershipId");
  const role = allowedRole(context, text(formData, "role"));
  if (!membershipId || !role) redirect("/dashboard/teamr/people?error=invalid_role_change");

  const { error } = await context.supabase.rpc("update_teamr_staff_role", {
    p_membership_id: membershipId,
    p_role: role,
    p_venue_id: context.venueId
  });
  if (error) redirect(`/dashboard/teamr/people?error=${errorCode(error, "update_failed")}`);
  revalidatePeople();
  redirect("/dashboard/teamr/people?message=updated");
}

export async function removeTeamRStaff(formData: FormData) {
  const context = await requirePeopleContext();
  const membershipId = text(formData, "membershipId");
  const confirmed = text(formData, "confirm") === "on";
  if (!membershipId || !confirmed) redirect("/dashboard/teamr/people?error=confirm_required");

  const { error } = await context.supabase.rpc("remove_teamr_staff_membership", {
    p_confirm: true,
    p_membership_id: membershipId,
    p_venue_id: context.venueId
  });
  if (error) redirect(`/dashboard/teamr/people?error=${errorCode(error, "remove_failed")}`);
  revalidatePeople();
  redirect("/dashboard/teamr/people?message=removed");
}

export async function cancelTeamRStaffInvitation(formData: FormData) {
  const context = await requirePeopleContext();
  const invitationId = text(formData, "invitationId");
  const confirmed = text(formData, "confirm") === "on";
  if (!invitationId || !confirmed) redirect("/dashboard/teamr/people?error=confirm_required");

  const { error } = await context.supabase.rpc("cancel_teamr_staff_invitation", {
    p_confirm: true,
    p_invitation_id: invitationId,
    p_venue_id: context.venueId
  });
  if (error) redirect(`/dashboard/teamr/people?error=${errorCode(error, "cancel_failed")}`);
  revalidatePeople();
  redirect("/dashboard/teamr/people?message=cancelled");
}
