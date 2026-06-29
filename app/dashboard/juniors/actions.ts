"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { JuniorStage, PlayerLevel, Sport } from "@/types/courtside";

const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const playerLevels: PlayerLevel[] = ["beginner", "social", "intermediate", "club_competitive", "advanced", "unknown"];
const juniorStages: JuniorStage[] = ["red_ball", "orange_ball", "green_ball", "yellow_ball", "not_sure"];

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function allowed<T extends string>(value: string, options: T[], fallback: T) {
  return options.includes(value as T) ? (value as T) : fallback;
}

async function getParentProfileId() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: parentProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  if (!parentProfile?.id) {
    redirect("/dashboard/profile?error=parent_profile_required");
  }

  return { supabase, parentProfileId: parentProfile.id as string };
}

export async function createJuniorProfile(formData: FormData) {
  const { supabase, parentProfileId } = await getParentProfileId();
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");

  if (!firstName || !lastName) {
    redirect("/dashboard/juniors?error=missing_name");
  }

  const { error } = await supabase.from("profiles").insert({
    user_id: null,
    first_name: firstName,
    last_name: lastName,
    email: null,
    phone: nullableText(formData, "phone"),
    date_of_birth: nullableText(formData, "date_of_birth"),
    is_junior: true,
    parent_profile_id: parentProfileId,
    junior_stage: allowed<JuniorStage>(text(formData, "junior_stage"), juniorStages, "not_sure"),
    member_status: "pending",
    player_level: allowed<PlayerLevel>(text(formData, "player_level"), playerLevels, "unknown"),
    primary_sport: allowed<Sport>(text(formData, "primary_sport"), sports, "tennis"),
    notes: nullableText(formData, "notes")
  });

  if (error) {
    redirect("/dashboard/juniors?error=save_failed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/juniors");
  redirect("/dashboard/juniors?saved=created");
}

export async function updateJuniorProfile(formData: FormData) {
  const { supabase, parentProfileId } = await getParentProfileId();
  const juniorProfileId = text(formData, "junior_profile_id");
  const firstName = text(formData, "first_name");
  const lastName = text(formData, "last_name");

  if (!juniorProfileId || !firstName || !lastName) {
    redirect("/dashboard/juniors?error=missing_name");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      phone: nullableText(formData, "phone"),
      date_of_birth: nullableText(formData, "date_of_birth"),
      is_junior: true,
      parent_profile_id: parentProfileId,
      junior_stage: allowed<JuniorStage>(text(formData, "junior_stage"), juniorStages, "not_sure"),
      player_level: allowed<PlayerLevel>(text(formData, "player_level"), playerLevels, "unknown"),
      primary_sport: allowed<Sport>(text(formData, "primary_sport"), sports, "tennis"),
      notes: nullableText(formData, "notes")
    })
    .eq("id", juniorProfileId)
    .eq("parent_profile_id", parentProfileId)
    .eq("is_junior", true);

  if (error) {
    redirect("/dashboard/juniors?error=save_failed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/juniors");
  redirect("/dashboard/juniors?saved=updated");
}
