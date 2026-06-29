import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { PlayerBottomNav, PlayerDesktopNav } from "@/components/player-nav";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

async function getSessionState() {
  if (!hasSupabaseConfig()) {
    return { isLoggedIn: false, isAdmin: false };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { isLoggedIn: false, isAdmin: false };
    }

    const { data: adminUser } = await supabase.from("admin_users").select("id").eq("user_id", user.id).maybeSingle();
    return { isLoggedIn: true, isAdmin: Boolean(adminUser) };
  } catch {
    return { isLoggedIn: false, isAdmin: false };
  }
}

export async function SiteHeader() {
  const { isLoggedIn, isAdmin } = await getSessionState();
  const brandHref = isLoggedIn ? "/dashboard" : "/";

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link className="flex shrink-0 items-center gap-2 font-black tracking-tight text-court-navy" href={brandHref}>
            <span className="grid h-9 w-9 place-items-center rounded bg-court-teal text-white">PR</span>
            <span>PlayR</span>
          </Link>

          {isLoggedIn ? (
            <PlayerDesktopNav showAdmin={isAdmin} />
          ) : (
            <nav className="hidden items-center gap-5 text-sm font-bold text-slate-700 md:flex" aria-label="Public navigation">
              <Link className="transition hover:text-court-blue" href="/events">
                Events
              </Link>
              <Link className="transition hover:text-court-blue" href="/about">
                About
              </Link>
            </nav>
          )}

          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <form action={signOut}>
                <button className="rounded bg-court-blue px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" type="submit">
                  Sign out
                </button>
              </form>
            ) : (
              <>
                <Link className="rounded px-3 py-2 text-sm font-semibold text-court-navy transition hover:bg-court-mist" href="/login">
                  Log in
                </Link>
                <Link className="rounded bg-court-blue px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" href="/signup">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {isLoggedIn ? <PlayerBottomNav showAdmin={isAdmin} /> : null}
    </>
  );
}
