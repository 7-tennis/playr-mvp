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

  const { data, error } = await supabase.rpc("create_my_notification", {
    p_dedupe_key: input.dedupeKey ?? null,
    p_href: input.href ?? null,
    p_junior_profile_id: input.juniorProfileId ?? null,
    p_message: input.message,
    p_metadata: cleanMetadata(input.metadata),
    p_profile_id: input.profileId ?? null,
    p_title: input.title,
    p_type: input.type
  });

  if (error) {
    if (error.code !== "23505") {
      console.error("PlayR notification create failed", { userId: input.userId, type: input.type, error });
    }
    return null;
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/messages");
  return data as string | null;
}
