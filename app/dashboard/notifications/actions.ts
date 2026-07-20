"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getNotificationContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function markNotificationRead(formData: FormData) {
  const notificationId = text(formData, "notificationId");

  if (!notificationId) {
    redirect("/dashboard/messages?error=invalid_notification");
  }

  const { supabase, user } = await getNotificationContext();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) {
    console.error("PlayR notification mark-read failed", { userId: user.id, notificationId, error });
    redirect("/dashboard/messages?error=mark_read_failed");
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/messages");
  redirect("/dashboard/messages?marked=read");
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await getNotificationContext();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("PlayR notifications mark-all-read failed", { userId: user.id, error });
    redirect("/dashboard/messages?error=mark_all_failed");
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/messages");
  redirect("/dashboard/messages?marked=all");
}
