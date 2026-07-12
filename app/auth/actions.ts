"use server";

import { redirect } from "next/navigation";
import { getPostLoginPathForUser } from "@/lib/auth-routing";
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

  if (!email || !password) {
    redirect(`/login?error=${encoded("Enter your email and password.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    console.error("CourtSide login failed", { email, error });
    redirect(`/login?error=${encoded("We could not log you in. Check your email and password, and verify your email if you just created your account.")}`);
  }

  redirect(await getPostLoginPathForUser(supabase, data.user.id));
}

export async function signUpWithPassword(formData: FormData) {
  const email = formText(formData, "email");
  const password = formText(formData, "password");
  const phone = formText(formData, "phone");
  const marketingConsent = formData.get("marketing_consent") === "on";

  if (!email || !password) {
    redirect(`/signup?error=${encoded("Enter an email and password to create your account.")}`);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        phone: phone || null,
        marketing_consent: marketingConsent,
        marketing_consent_at: marketingConsent ? new Date().toISOString() : null
      }
    }
  });

  if (error || !data.user) {
    console.error("CourtSide signup failed", { email, error });
    redirect(`/signup?error=${encoded("We could not create your account. The email may already be registered, or the password may need to be longer.")}`);
  }

  if (!data.session) {
    redirect(`/signup?message=${encoded("Check your email to verify your account. Open the confirmation link from Supabase, then return here and log in.")}`);
  }

  redirect("/dashboard/profile");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
