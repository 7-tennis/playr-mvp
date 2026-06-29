import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/utils/supabase/config";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const createClient = (request: NextRequest) => {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  if (!supabaseUrl || !supabaseKey) {
    return {
      supabase: null,
      getResponse: () => supabaseResponse
    };
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: {
            headers: request.headers
          }
        });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      }
    }
  });

  return {
    supabase,
    getResponse: () => supabaseResponse
  };
};

export async function updateSession(request: NextRequest) {
  const { supabase, getResponse } = createClient(request);

  if (supabase) {
    await supabase.auth.getUser();
  }

  return getResponse();
}
