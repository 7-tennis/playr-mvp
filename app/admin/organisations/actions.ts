"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-auth";
import type { AdminRole, OrganisationRole, Venue } from "@/types/courtside";

const assignableRoles: AdminRole[] = ["platform_admin", "club_admin", "head_coach", "coach"];
const organisationTypes: Venue["organisation_type"][] = ["academy", "club", "school", "district", "club_academy", "school_district"];
const invitationRoles: OrganisationRole[] = ["organisation_admin", "head_coach", "coach", "assistant_coach", "club_manager", "sports_coordinator", "team_manager", "viewer"];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function allowedValue<T extends string>(value: string, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

async function requirePlatformAdmin() {
  const context = await getAdminContext();

  if (context.adminRole !== "platform_admin") {
    redirect("/admin/organisations?error=access");
  }

  return context;
}

function revalidateAccessSurfaces() {
  revalidatePath("/admin");
  revalidatePath("/admin/organisations");
  revalidatePath("/dashboard/clubr");
  revalidatePath("/dashboard/clubr/bookings");
  revalidatePath("/dashboard/clubr/events");
  revalidatePath("/dashboard/clubr/members");
  revalidatePath("/dashboard/clubr/more");
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/coaches");
  revalidatePath("/dashboard/coachr/more");
}

function rpcErrorCode(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (
    [
      "access",
      "adult_profile_required",
      "confirm_required",
      "invalid_assignment",
      "invalid_role",
      "invalid_venue",
      "invalid_invitation",
      "invitation_closed",
      "last_platform_admin",
      "missing_fields"
    ].includes(message)
  ) {
    return message;
  }

  if (message === "duplicate_invitation") {
    return message;
  }

  return fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createOrganisation(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const name = text(formData, "name");
  const organisationType = allowedValue<Venue["organisation_type"]>(text(formData, "organisationType"), organisationTypes, "academy");
  const slug = slugify(text(formData, "slug") || name);

  if (!name || !slug) {
    redirect("/admin/organisations?error=missing_fields");
  }

  const { error } = await supabase.from("venues").insert({
    address: text(formData, "address") || null,
    contact_email: text(formData, "contactEmail") || null,
    contact_phone: text(formData, "contactPhone") || null,
    description: text(formData, "description") || null,
    name,
    organisation_type: organisationType,
    slug,
    status: "active"
  });

  if (error) {
    console.error("Organisation creation failed", { error, name, organisationType });
    redirect("/admin/organisations?error=organisation_create_failed");
  }

  revalidatePath("/admin/organisations");
  redirect("/admin/organisations?message=organisation_created");
}

export async function updateOrganisationDetails(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const venueId = text(formData, "venueId");
  const name = text(formData, "name");
  const organisationType = allowedValue<Venue["organisation_type"]>(text(formData, "organisationType"), organisationTypes, "academy");
  const status = allowedValue<"active" | "inactive">(text(formData, "status"), ["active", "inactive"], "active");
  const slug = slugify(text(formData, "slug") || name);

  if (!venueId || !name || !slug) {
    redirect("/admin/organisations?error=missing_fields");
  }

  const { error } = await supabase
    .from("venues")
    .update({
      address: text(formData, "address") || null,
      contact_email: text(formData, "contactEmail") || null,
      contact_phone: text(formData, "contactPhone") || null,
      description: text(formData, "description") || null,
      name,
      organisation_type: organisationType,
      slug,
      status
    })
    .eq("id", venueId);

  if (error) {
    console.error("Organisation details update failed", { error, venueId });
    redirect("/admin/organisations?error=organisation_update_failed");
  }

  revalidateAccessSurfaces();
  redirect("/admin/organisations?message=organisation_updated");
}

export async function createOrganisationInvitation(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const venueId = text(formData, "venueId");
  const email = text(formData, "email").toLowerCase();
  const invitedName = text(formData, "invitedName") || null;
  const invitedPhone = text(formData, "invitedPhone") || null;
  const intendedRole = allowedValue<OrganisationRole>(text(formData, "intendedRole"), invitationRoles, "viewer");

  if (!venueId || !email) {
    redirect("/admin/organisations?error=missing_fields");
  }

  const { data: token, error } = await supabase.rpc("create_organisation_invitation", {
    p_invitation_kind: intendedRole === "head_coach" || intendedRole === "coach" || intendedRole === "assistant_coach" ? "coach" : "organisation_member",
    p_invited_email: email,
    p_invited_name: invitedName,
    p_invited_phone: invitedPhone,
    p_intended_role: intendedRole,
    p_metadata: {},
    p_parent_profile_id: null,
    p_target_junior_profile_id: null,
    p_target_profile_id: null,
    p_venue_id: venueId
  });

  if (error || !token) {
    console.error("Organisation invitation creation failed", { error, venueId, intendedRole });
    redirect(`/admin/organisations?error=${rpcErrorCode(error, "invitation_failed")}`);
  }

  revalidatePath("/admin/organisations");
  redirect(`/admin/organisations?message=invitation_created&token=${token}`);
}

export async function cancelOrganisationInvitation(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const invitationId = text(formData, "invitationId");
  const confirmed = text(formData, "confirmCancel") === "on";

  if (!invitationId || !confirmed) {
    redirect("/admin/organisations?error=confirm_required");
  }

  const { error } = await supabase.rpc("cancel_organisation_invitation", {
    p_confirm: true,
    p_invitation_id: invitationId
  });

  if (error) {
    console.error("Organisation invitation cancellation failed", { error, invitationId });
    redirect(`/admin/organisations?error=${rpcErrorCode(error, "invitation_cancel_failed")}`);
  }

  revalidatePath("/admin/organisations");
  redirect("/admin/organisations?message=invitation_cancelled");
}

export async function assignOrganisationRole(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const profileId = text(formData, "profileId");
  const venueId = text(formData, "venueId") || null;
  const role = allowedValue<AdminRole>(text(formData, "role"), assignableRoles, "head_coach");
  const confirmed = text(formData, "confirmAssignment") === "on";

  if (!profileId || !confirmed) {
    redirect("/admin/organisations?error=confirm_required");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,user_id,is_junior,first_name,last_name")
    .eq("id", profileId)
    .eq("is_junior", false)
    .maybeSingle();

  if (profileError || !profile?.user_id) {
    redirect("/admin/organisations?error=adult_profile_required");
  }

  const { data: venue } =
    role === "platform_admin" || !venueId
      ? { data: null }
      : await supabase.from("venues").select("id,name,organisation_type").eq("id", venueId).maybeSingle();

  const { error } = await supabase.rpc("platform_assign_organisation_role", {
    p_confirm: true,
    p_role: role,
    p_target_user_id: profile.user_id,
    p_venue_id: role === "platform_admin" ? null : venueId
  });

  if (error) {
    console.error("Organisation role assignment failed", { error, profileId, role, venueId });
    redirect(`/admin/organisations?error=${rpcErrorCode(error, "assign_failed")}`);
  }

  revalidateAccessSurfaces();
  const params = new URLSearchParams({
    message: `${role}_assigned`,
    person: `${profile.first_name} ${profile.last_name}`
  });

  if (venue?.name) {
    params.set("venue", venue.name);
  }

  redirect(`/admin/organisations?${params.toString()}`);
}

export async function deactivateOrganisationRole(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const targetUserId = text(formData, "targetUserId");
  const confirmed = text(formData, "confirmDeactivate") === "on";

  if (!targetUserId || !confirmed) {
    redirect("/admin/organisations?error=confirm_required");
  }

  const { error } = await supabase.rpc("platform_deactivate_organisation_role", {
    p_confirm: true,
    p_target_user_id: targetUserId
  });

  if (error) {
    console.error("Organisation role deactivation failed", { error, targetUserId });
    redirect(`/admin/organisations?error=${rpcErrorCode(error, "deactivate_failed")}`);
  }

  revalidateAccessSurfaces();
  redirect("/admin/organisations?message=role_deactivated");
}

export async function updateOrganisationType(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const venueId = text(formData, "venueId");
  const organisationType = allowedValue<Venue["organisation_type"]>(text(formData, "organisationType"), organisationTypes, "club_academy");

  if (!venueId) {
    redirect("/admin/organisations?error=invalid_venue");
  }

  const { error } = await supabase.from("venues").update({ organisation_type: organisationType }).eq("id", venueId);

  if (error) {
    console.error("Organisation type update failed", { error, venueId, organisationType });
    redirect("/admin/organisations?error=organisation_update_failed");
  }

  revalidatePath("/admin/organisations");
  redirect("/admin/organisations?message=organisation_updated");
}
