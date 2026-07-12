import { canAccessCoachR, loadActiveRoleRow, normalizeStoredRole } from "@/lib/permissions";
import { appRoleForOrganisationRole, loadActiveOrganisationPreference, loadOrganisationMembershipsForUser, pickActiveOrganisationMembership } from "@/lib/organisations";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function getPostLoginPathForUser(supabase: ServerSupabaseClient, userId: string) {
  const [activeRole, memberships, preference] = await Promise.all([
    loadActiveRoleRow(supabase, userId),
    loadOrganisationMembershipsForUser(supabase, userId),
    loadActiveOrganisationPreference(supabase, userId)
  ]);
  const storedRole = normalizeStoredRole(activeRole?.role ?? null);
  const activeMembership = pickActiveOrganisationMembership(memberships, preference);
  const role = storedRole === "platform_admin" ? "platform_admin" : activeMembership ? appRoleForOrganisationRole(activeMembership.role) : storedRole;

  if (role === "platform_admin") {
    return "/admin/organisations";
  }

  if (role === "club_admin") {
    return "/dashboard/clubr";
  }

  if (canAccessCoachR(role)) {
    return "/dashboard/coachr";
  }

  return "/dashboard";
}
