"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageOrganisationCourtAccess } from "@/lib/organisations";
import { getPermissionContext } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalUuid(formData: FormData, key: string) {
  const value = text(formData, key);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function returnPath(ownerVenueId: string | null, key: "error" | "message", value: string) {
  const params = new URLSearchParams({ [key]: value });
  if (ownerVenueId) {
    params.set("venue", ownerVenueId);
  }
  return `/dashboard/coachr/courts?${params.toString()}`;
}

async function courtAccessContext(formData: FormData) {
  const context = await getPermissionContext();

  if (context.kind !== "authenticated") {
    return { context: null, ownerVenueId: null };
  }

  const requestedOwner = optionalUuid(formData, "ownerVenueId");
  const ownerVenueId = context.role === "platform_admin" ? requestedOwner : context.venueId;
  const allowed = context.role === "platform_admin" || (ownerVenueId === context.venueId && canManageOrganisationCourtAccess(context.activeOrganisationRole));

  return { context: allowed ? context : null, ownerVenueId };
}

export async function grantOrganisationCourtAccess(formData: FormData) {
  const { context, ownerVenueId } = await courtAccessContext(formData);
  const approvedVenueId = optionalUuid(formData, "approvedVenueId");
  const courtId = optionalUuid(formData, "courtId");

  if (!context || !ownerVenueId || !approvedVenueId || ownerVenueId === approvedVenueId) {
    redirect(returnPath(ownerVenueId, "error", "access"));
  }

  const { error } = await context.supabase.rpc("grant_organisation_court_access", {
    p_approved_venue_id: approvedVenueId,
    p_court_id: courtId,
    p_notes: text(formData, "notes") || null,
    p_owner_venue_id: ownerVenueId,
    p_valid_from: text(formData, "validFrom") || null,
    p_valid_until: text(formData, "validUntil") || null
  });

  if (error) {
    console.error("CoachR court access grant failed", { code: error.code, ownerVenueId });
    redirect(returnPath(ownerVenueId, "error", error.message === "date_order" ? "date_order" : "grant_failed"));
  }

  revalidatePath("/dashboard/coachr/courts");
  revalidatePath("/dashboard/coachr/schedule");
  redirect(returnPath(ownerVenueId, "message", "granted"));
}

export async function revokeOrganisationCourtAccess(formData: FormData) {
  const { context, ownerVenueId } = await courtAccessContext(formData);
  const accessId = optionalUuid(formData, "accessId");

  if (!context || !ownerVenueId || !accessId || text(formData, "confirm") !== "on") {
    redirect(returnPath(ownerVenueId, "error", "confirm"));
  }

  const { error } = await context.supabase.rpc("revoke_organisation_court_access", {
    p_access_id: accessId
  });

  if (error) {
    console.error("CoachR court access revoke failed", { accessId, code: error.code, ownerVenueId });
    redirect(returnPath(ownerVenueId, "error", "revoke_failed"));
  }

  revalidatePath("/dashboard/coachr/courts");
  revalidatePath("/dashboard/coachr/schedule");
  redirect(returnPath(ownerVenueId, "message", "revoked"));
}
