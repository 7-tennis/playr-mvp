"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestJuniorSchoolConnection(formData: FormData) {
  const juniorProfileId = text(formData, "juniorProfileId");
  const venueId = text(formData, "venueId");
  const returnPath = `/dashboard/juniors/${juniorProfileId}/schools`;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  if (!juniorProfileId || !venueId) redirect(`${returnPath}?error=invalid_request`);

  const { data: parent } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const { data: junior } = parent ? await supabase
    .from("profiles")
    .select("id")
    .eq("id", juniorProfileId)
    .eq("parent_profile_id", parent.id)
    .eq("is_junior", true)
    .maybeSingle() : { data: null };

  if (!parent || !junior) redirect("/dashboard/juniors?error=profile_access");

  const { data, error } = await supabase.rpc("teamr_request_school_link", {
    p_player_profile_id: juniorProfileId,
    p_venue_id: venueId
  });

  if (error) {
    const code = error.message.includes("connection_suspended") ? "connection_suspended"
      : error.message.includes("profile_access") ? "profile_access"
        : error.message.includes("ineligible_school") ? "ineligible_school"
          : "request_failed";
    redirect(`${returnPath}?error=${code}`);
  }

  const status = typeof data === "object" && data && "status" in data ? String(data.status) : "pending";
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/players/${juniorProfileId}`);
  revalidatePath(returnPath);
  redirect(`${returnPath}?message=${status === "active" ? "already_connected" : "pending"}`);
}
