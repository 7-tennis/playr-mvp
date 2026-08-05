import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { parseAuthConfirmationUrl } from "@/lib/auth-confirmation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function loginErrorUrl(requestUrl: URL) {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("error", "This confirmation link is invalid or expired. Request a fresh email and try again within one hour.");
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const confirmation = parseAuthConfirmationUrl(requestUrl);

  if (confirmation.kind === "invalid") {
    return NextResponse.redirect(loginErrorUrl(requestUrl));
  }

  const supabase = await createServerSupabaseClient();
  const result = confirmation.kind === "token_hash"
    ? await supabase.auth.verifyOtp({ token_hash: confirmation.tokenHash, type: confirmation.type as EmailOtpType })
    : await supabase.auth.exchangeCodeForSession(confirmation.code);

  if (result.error) {
    console.error("[playr-auth] confirmation_failed", {
      code: result.error.code ?? "unknown",
      name: result.error.name,
      status: result.error.status ?? null
    });
    return NextResponse.redirect(loginErrorUrl(requestUrl));
  }

  return NextResponse.redirect(new URL(confirmation.next, requestUrl.origin));
}
