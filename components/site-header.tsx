import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { PlayerBottomNav, PlayerDesktopNav } from "@/components/player-nav";
import { NotificationIcon } from "@/components/playr-icons";
import { canAccessClubAdmin, canAccessCoachR, loadActiveRoleRow, normalizeStoredRole, roleLabel, type UserRole } from "@/lib/permissions";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

async function getSessionState() {
  if (!hasSupabaseConfig()) {
    return { isLoggedIn: false, isAdmin: false, isCoach: false, role: "player" as UserRole, unreadNotifications: 0 };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { isLoggedIn: false, isAdmin: false, isCoach: false, role: "player" as UserRole, unreadNotifications: 0 };
    }

    const [activeRole, { count: unreadCount }] = await Promise.all([
      loadActiveRoleRow(supabase, user.id),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
    ]);
    const role = normalizeStoredRole(activeRole?.role ?? null);

    return { isLoggedIn: true, isAdmin: canAccessClubAdmin(role), isCoach: canAccessCoachR(role), role, unreadNotifications: unreadCount ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown session state error";

    if (!message.includes("Dynamic server usage")) {
      console.warn("[playr-permissions]", {
        event: "site_header_session_state_failed",
        message
      });
    }

    return { isLoggedIn: false, isAdmin: false, isCoach: false, role: "player" as UserRole, unreadNotifications: 0 };
  }
}

export async function SiteHeader() {
  const { isLoggedIn, isAdmin, isCoach, role, unreadNotifications } = await getSessionState();
  const brandHref = isLoggedIn ? "/dashboard" : "/";
  const adminLabel = role === "platform_admin" ? roleLabel(role) : "ClubR Admin";

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link className="flex shrink-0 items-center gap-2 font-black tracking-tight text-court-navy" href={brandHref}>
            <span className="grid h-9 w-9 place-items-center rounded bg-court-teal text-white">PR</span>
            <span>PlayR</span>
          </Link>

          {isLoggedIn ? (
            <PlayerDesktopNav adminLabel={adminLabel} showAdmin={isAdmin} showCoach={isCoach} />
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
              <>
                <Link
                  aria-label={unreadNotifications > 0 ? `${unreadNotifications} unread notifications` : "Notifications"}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-white text-court-navy shadow-sm transition hover:border-court-teal hover:bg-court-mist"
                  href="/dashboard/notifications"
                >
                  <NotificationIcon size={18} />
                  {unreadNotifications > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-court-teal px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white ring-2 ring-white">
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </span>
                  ) : null}
                </Link>
                <form action={signOut}>
                  <button className="rounded bg-court-blue px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" type="submit">
                    Sign out
                  </button>
                </form>
              </>
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
      {isLoggedIn ? <PlayerBottomNav adminLabel={adminLabel} showAdmin={isAdmin} showCoach={isCoach} /> : null}
    </>
  );
}
