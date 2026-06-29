import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl, supabaseConfigMessage } from "@/utils/supabase/config";

export const createClient = () => {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(supabaseConfigMessage);
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
};
