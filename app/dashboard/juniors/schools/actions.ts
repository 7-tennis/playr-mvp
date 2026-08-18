"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schoolConnectionsHref } from "@/lib/school-connections-navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestJuniorSchoolConnection(formData: FormData) {
  const juniorProfileId = text(formData, "juniorProfileId");
  const venueId = text(formData, "venueId");
  const onboarding = text(formData, "onboarding") === "1";
  const returnTo = text(formData, "returnTo");
  const connectionsRoute = `/dashboard/juniors/${juniorProfileId}/schools`;
  const returnPath = schoolConnectionsHref(juniorProfileId, { onboarding, returnTo });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  if (!juniorProfileId || !venueId) redirect(schoolConnectionsHref(juniorProfileId, { error: "invalid_request", onboarding, returnTo }));

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
    redirect(schoolConnectionsHref(juniorProfileId, { error: code, onboarding, returnTo }));
  }

  const status = typeof data === "object" && data && "status" in data ? String(data.status) : "pending";
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/players/${juniorProfileId}`);
  revalidatePath(connectionsRoute);
  redirect(schoolConnectionsHref(juniorProfileId, {
    message: status === "active" ? "already_connected" : "pending",
    onboarding,
    returnTo,
    schoolId: venueId
  }));
}
