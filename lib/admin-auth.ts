import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export async function getAdminContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminUser } = await supabase.from("admin_users").select("id,role").eq("user_id", user.id).maybeSingle();

  return {
    supabase,
    user,
    isAdmin: Boolean(adminUser),
    adminRole: adminUser?.role ?? null
  };
}
