"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { PlayerLevel, Sport } from "@/types/courtside";

const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const playerLevels: PlayerLevel[] = ["beginner", "social", "intermediate", "club_competitive", "advanced", "unknown"];

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

export async function saveOwnProfile(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const marketingConsent = formData.get("marketing_consent") === "on";
  const payload = {
    user_id: user.id,
    first_name: text(formData, "first_name"),
    last_name: text(formData, "last_name"),
    email: user.email ?? nullableText(formData, "email"),
    phone: nullableText(formData, "phone"),
    date_of_birth: nullableText(formData, "date_of_birth"),
    is_junior: false,
    parent_profile_id: null,
    primary_sport: allowed<Sport>(text(formData, "primary_sport"), sports, "tennis"),
    player_level: allowed<PlayerLevel>(text(formData, "player_level"), playerLevels, "unknown"),
    marketing_consent: marketingConsent,
    marketing_consent_at: marketingConsent ? new Date().toISOString() : null,
    notes: nullableText(formData, "notes")
  };

  if (!payload.first_name || !payload.last_name) {
    redirect("/dashboard/profile?error=missing_name");
  }

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("CourtSide profile save failed", { userId: user.id, error });
    redirect("/dashboard/profile?error=save_failed");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  redirect("/dashboard?profile=saved");
}
