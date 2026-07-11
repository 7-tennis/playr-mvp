"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCoachRAccess } from "@/lib/permissions";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function errorCode(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message ?? "";

  if (["access", "adult_profile_required", "confirm_required", "invalid_assignment", "missing_fields", "protected_role"].includes(message)) {
    return message;
  }

  return fallback;
}

function revalidateCoachAccess() {
  revalidatePath("/dashboard/coachr");
  revalidatePath("/dashboard/coachr/coaches");
  revalidatePath("/dashboard/coachr/more");
  revalidatePath("/dashboard/coachr/schedule");
  revalidatePath("/dashboard/coachr/students");
}

export async function assignVenueCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const profileId = text(formData, "profileId");
  const confirmed = text(formData, "confirmAssignment") === "on";

  if (context.kind !== "authenticated") {
    redirect("/dashboard/coachr/coaches?error=access");
  }
  if (!profileId || !confirmed) {
    redirect("/dashboard/coachr/coaches?error=confirm_required");
  }

  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("id,user_id,is_junior")
    .eq("id", profileId)
    .eq("is_junior", false)
    .maybeSingle();

  if (profileError || !profile?.user_id) {
    redirect("/dashboard/coachr/coaches?error=adult_profile_required");
  }

  const { error } = await context.supabase.rpc("head_coach_assign_coach", {
    p_confirm: true,
    p_target_user_id: profile.user_id
  });

  if (error) {
    console.error("CoachR coach assignment failed", { error, profileId, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "assign_failed")}`);
  }

  revalidateCoachAccess();
  redirect("/dashboard/coachr/coaches?message=coach_assigned");
}

export async function deactivateVenueCoach(formData: FormData) {
  const context = await assertCoachRAccess("coachr:coaches");
  const targetUserId = text(formData, "targetUserId");
  const confirmed = text(formData, "confirmDeactivate") === "on";

  if (context.kind !== "authenticated" || !targetUserId || !confirmed) {
    redirect("/dashboard/coachr/coaches?error=confirm_required");
  }

  const { error } = await context.supabase.rpc("head_coach_deactivate_coach", {
    p_confirm: true,
    p_target_user_id: targetUserId
  });

  if (error) {
    console.error("CoachR coach deactivation failed", { error, targetUserId, role: context.role, venueId: context.venueId });
    redirect(`/dashboard/coachr/coaches?error=${errorCode(error, "deactivate_failed")}`);
  }

  revalidateCoachAccess();
  redirect("/dashboard/coachr/coaches?message=coach_deactivated");
}
