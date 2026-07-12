import { canAccessClubAdmin, canAccessCoachR, loadActiveRoleRow, normalizeStoredRole } from "@/lib/permissions";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function getPostLoginPathForUser(supabase: ServerSupabaseClient, userId: string) {
  const activeRole = await loadActiveRoleRow(supabase, userId);
  const role = normalizeStoredRole(activeRole?.role ?? null);

  if (role === "platform_admin") {
    return "/admin/organisations";
  }

  if (canAccessClubAdmin(role)) {
    return "/admin";
  }

  if (canAccessCoachR(role)) {
    return "/dashboard/coachr";
  }

  return "/dashboard";
}
