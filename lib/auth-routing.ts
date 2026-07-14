import { canAccessCoachR, loadActiveRoleRow, normalizeStoredRole } from "@/lib/permissions";
import {
  appRoleForOrganisationMembership,
  loadActiveOrganisationPreference,
  loadOrganisationMembershipsForUser,
  pickActiveOrganisationMembership,
  productForOrganisationMembership
} from "@/lib/organisations";
import { loadOrganisationSetup, productSetupPath } from "@/lib/organisation-setup";
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
  const role = storedRole === "platform_admin" ? "platform_admin" : activeMembership ? appRoleForOrganisationMembership(activeMembership) : storedRole;

  if (role === "platform_admin") {
    return "/admin/organisations";
  }

  if (activeMembership) {
    const product = productForOrganisationMembership(activeMembership);

    if (product === "clubr" || product === "coachr") {
      const setup = await loadOrganisationSetup(supabase, activeMembership.venue_id, product);

      if (setup.migrationReady && setup.setup.status !== "complete") {
        return productSetupPath(product, setup.setup.current_step);
      }
    }
  }

  if (role === "club_admin") {
    return "/dashboard/clubr";
  }

  if (canAccessCoachR(role)) {
    return "/dashboard/coachr";
  }

  return "/dashboard";
}
