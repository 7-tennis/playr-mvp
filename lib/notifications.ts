import { revalidatePath } from "next/cache";
import type { NotificationType } from "@/types/courtside";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type NotificationMetadata = Record<string, boolean | number | string | null | undefined>;

type CreateNotificationInput = {
  userId: string;
  actorUserId?: string | null;
  profileId?: string | null;
  juniorProfileId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  metadata?: NotificationMetadata;
  dedupeKey?: string | null;
};

function cleanMetadata(metadata: NotificationMetadata = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

export async function createNotification(supabase: SupabaseServerClient, input: CreateNotificationInput) {
  if (!input.userId) {
    return null;
  }

  if (input.dedupeKey) {
    const { data: existing, error: existingError } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", input.userId)
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();

    if (existing?.id) {
      return existing.id as string;
    }

    if (existingError) {
      console.error("PlayR notification dedupe check failed", { userId: input.userId, type: input.type, error: existingError });
    }
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      actor_user_id: input.actorUserId ?? null,
      profile_id: input.profileId ?? null,
      junior_profile_id: input.juniorProfileId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      metadata: cleanMetadata(input.metadata),
      dedupe_key: input.dedupeKey ?? null
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== "23505") {
      console.error("PlayR notification create failed", { userId: input.userId, type: input.type, error });
    }
    return null;
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/messages");
  return data.id as string;
}
