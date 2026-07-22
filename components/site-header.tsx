import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { AppIdentity, AppSwitcher } from "@/components/app-switcher";
import { PlayerBottomNav, PlayerDesktopNav } from "@/components/player-nav";
import { SettingsIcon, SignOutIcon } from "@/components/playr-icons";
import { appAreaDefinitions, type AppAreaDestination } from "@/lib/app-areas";
import { loadActiveRoleRow, normalizeStoredRole, type UserRole } from "@/lib/permissions";
import { loadOrganisationMembershipsForUser, productForOrganisationMembership } from "@/lib/organisations";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

async function getSessionState() {
  if (!hasSupabaseConfig()) {
    return { appDestinations: [] as AppAreaDestination[], isLoggedIn: false, role: "player" as UserRole, unreadNotifications: 0 };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return { appDestinations: [] as AppAreaDestination[], isLoggedIn: false, role: "player" as UserRole, unreadNotifications: 0 };
    }

    const [activeRole, memberships, { count: unreadCount }] = await Promise.all([
      loadActiveRoleRow(supabase, user.id),
      loadOrganisationMembershipsForUser(supabase, user.id),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
    ]);
    const storedRole = normalizeStoredRole(activeRole?.role ?? null);
    const appDestinations: AppAreaDestination[] = [{ ...appAreaDefinitions.playr }];
    const clubMembership = memberships.find((membership) => productForOrganisationMembership(membership) === "clubr");
    const coachMembership = memberships.find((membership) => productForOrganisationMembership(membership) === "coachr");

    if (clubMembership) appDestinations.push({ ...appAreaDefinitions.clubr, membershipId: clubMembership.id });
    if (coachMembership) appDestinations.push({ ...appAreaDefinitions.coachr, membershipId: coachMembership.id });
    if (storedRole === "platform_admin") appDestinations.push({ ...appAreaDefinitions.superuser });

    return { appDestinations, isLoggedIn: true, role: storedRole, unreadNotifications: unreadCount ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown session state error";

    if (!message.includes("Dynamic server usage")) {
      console.warn("[playr-permissions]", {
        event: "site_header_session_state_failed",
        message
      });
    }

    return { appDestinations: [] as AppAreaDestination[], isLoggedIn: false, role: "player" as UserRole, unreadNotifications: 0 };
  }
}

export async function SiteHeader() {
  const { appDestinations, isLoggedIn, unreadNotifications } = await getSessionState();

  return (
    <>
      <header className="playr-gradient-navigation sticky top-0 z-30 border-b border-white/10 text-white shadow-playr-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
          {isLoggedIn ? <AppIdentity /> : <Link className="flex shrink-0 items-center gap-2 rounded-playr-md font-black tracking-tight text-white focus-ring" href="/"><span className="playr-gradient-navigation-active grid h-9 w-9 place-items-center rounded-playr-md text-white shadow-playr-card">PR</span><span>PlayR</span></Link>}

          {isLoggedIn ? (
            <PlayerDesktopNav messageCount={unreadNotifications} />
          ) : (
            <nav className="hidden items-center gap-5 text-sm font-bold text-slate-200 md:flex" aria-label="Public navigation">
              <Link className="rounded transition hover:text-white focus-ring" href="/events">
                Events
              </Link>
              <Link className="rounded transition hover:text-white focus-ring" href="/about">
                About
              </Link>
            </nav>
          )}

          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <AppSwitcher destinations={appDestinations} />
                <Link
                  aria-label="Open settings"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-playr-md border border-white/20 bg-white/10 text-white shadow-playr-subtle transition hover:border-court-teal hover:bg-white/15 focus-ring"
                  href="/dashboard/settings"
                >
                  <SettingsIcon size={19} />
                </Link>
                <form action={signOut}>
                  <button aria-label="Sign out" className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-playr-md border border-white/20 bg-white/10 px-2 text-sm font-semibold text-white shadow-playr-subtle transition hover:bg-white/15 focus-ring sm:px-3" type="submit">
                    <SignOutIcon className="sm:hidden" size={18} /><span className="hidden sm:inline">Sign out</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link className="min-h-11 rounded-playr-md px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-ring" href="/login">
                  Log in
                </Link>
                <Link className="playr-gradient-navigation-active min-h-11 rounded-playr-md px-3 py-2.5 text-sm font-semibold text-white shadow-playr-card transition hover:brightness-110 focus-ring" href="/signup">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {isLoggedIn ? <PlayerBottomNav messageCount={unreadNotifications} /> : null}
    </>
  );
}
