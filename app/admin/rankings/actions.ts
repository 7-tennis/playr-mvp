"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-auth";

const actions = ["approve", "reject", "hide", "restore", "suspend"] as const;

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function updateRankingPublication(formData: FormData) {
  const { adminRole, supabase } = await getAdminContext();
  const rankingProfileId = value(formData, "rankingProfileId");
  const action = value(formData, "action");
  const reason = value(formData, "reason");
  const confirmed = value(formData, "confirmed") === "on";

  if (adminRole !== "platform_admin") {
    throw new Error("Platform administrator access required");
  }

  if (!rankingProfileId || !actions.includes(action as (typeof actions)[number]) || !confirmed) {
    redirect("/admin/rankings?message=confirmation_required");
  }

  if (["reject", "hide", "suspend"].includes(action) && !reason) {
    redirect(`/admin/rankings?record=${encodeURIComponent(rankingProfileId)}&message=reason_required`);
  }

  const { error } = await supabase.rpc("admin_update_player_ranking_publication", {
    p_action: action,
    p_ranking_profile_id: rankingProfileId,
    p_reason: reason || null
  });

  if (error) {
    console.error("[playr-rankings-admin] publication update failed", {
      action,
      code: error.code,
      rankingProfileId
    });
    redirect(`/admin/rankings?status=all&record=${encodeURIComponent(rankingProfileId)}&message=update_failed`);
  }

  revalidatePath("/admin/rankings");
  revalidatePath("/dashboard/rankings");
  redirect(`/admin/rankings?status=all&record=${encodeURIComponent(rankingProfileId)}&message=updated`);
}
