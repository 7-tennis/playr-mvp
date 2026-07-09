import { redirect } from "next/navigation";
import { canAccessClubAdmin, getPermissionContext } from "@/lib/permissions";

export async function getAdminContext() {
  const context = await getPermissionContext();

  if (context.kind === "no-config") {
    redirect("/login");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    isAdmin: canAccessClubAdmin(context.role),
    adminRole: context.role,
    venueId: context.venueId
  };
}
