"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getPostLoginPathForUser } from "@/lib/auth-routing";
import { loginPathFor, safeInternalPath } from "@/lib/auth-navigation";
import { buildAuthConfirmationUrl } from "@/lib/auth-confirmation";
import { createServerSupabaseClient } from "@/utils/supabase/server";

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function encoded(message: string) {
  return encodeURIComponent(message);
}

export async function signInWithPassword(formData: FormData) {
  const email = formText(formData, "email");
  const password = formText(formData, "password");
  const next = safeInternalPath(formText(formData, "next"));

  if (!email || !password) {
    redirect(loginPathFor(next, "Enter your email and password."));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    console.error("CourtSide login failed", { email, error });
    redirect(loginPathFor(next, "We could not log you in. Check your email and password, and verify your email if you just created your account."));
  }

  redirect(next ?? (await getPostLoginPathForUser(supabase, data.user.id)));
}

export async function signUpWithPassword(formData: FormData) {
  const email = formText(formData, "email");
  const password = formText(formData, "password");
  const phone = formText(formData, "phone");
  const next = safeInternalPath(formText(formData, "next"));
  const marketingConsent = formData.get("marketing_consent") === "on";

  if (!email || !password) {
    redirect(`/signup?error=${encoded("Enter an email and password to create your account.")}`);
  }

  const requestHeaders = headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const requestOrigin = host ? `${protocol}://${host}` : "https://playr-mvp.vercel.app";
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? requestOrigin;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildAuthConfirmationUrl(configuredOrigin, next),
      data: {
        phone: phone || null,
        marketing_consent: marketingConsent,
        marketing_consent_at: marketingConsent ? new Date().toISOString() : null
      }
    }
  });

  if (error) {
    console.error("[playr-auth] signup_failed", {
      code: error.code ?? "unknown",
      name: error.name,
      status: error.status ?? null
    });
    redirect(`/signup?error=${encoded("We could not create your account. Check the address and password, wait a few minutes, then try again.")}`);
  }

  if (!data.session) {
    const nextParam = next ? `&next=${encodeURIComponent(next)}` : "";
    redirect(`/signup?message=${encoded("Check your email and open the newest confirmation link within one hour. Older confirmation emails expire automatically.")}${nextParam}`);
  }

  redirect(next ?? "/dashboard/profile");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
