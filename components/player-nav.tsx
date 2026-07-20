"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookingIcon, EntriesIcon, EventIcon, MatchIcon, StageIcon } from "@/components/playr-icons";
import { playrNavigationVisuals } from "@/lib/navigation-visuals";

const playerLinks = [
  { href: "/dashboard/venues", label: "Book", icon: BookingIcon, matches: ["/dashboard/venues", "/dashboard/book-court", "/dashboard/my-bookings", "/dashboard/memberships"] },
  { href: "/dashboard/play", label: "Play", icon: MatchIcon, matches: ["/dashboard/play"] },
  { href: "/dashboard", label: "MyPlayR", icon: StageIcon, matches: ["/dashboard", "/dashboard/players"], isHub: true },
  { href: "/dashboard/events", label: "Compete", icon: EventIcon, matches: ["/dashboard/events", "/dashboard/my-entries", "/dashboard/results"] },
  { href: "/dashboard/profile", label: "Profile", icon: EntriesIcon, matches: ["/dashboard/profile", "/dashboard/juniors", "/dashboard/notifications"] }
];

function pathMatches(pathname: string, match: string) {
  return pathname === match || (match !== "/dashboard" && pathname.startsWith(`${match}/`));
}

function isActivePath(pathname: string, matches: string[]) {
  return matches.some((match) => pathMatches(pathname, match));
}

export function PlayerDesktopNav({
  adminHref = "/admin",
  adminLabel = "ClubR Admin",
  showAdmin,
  showCoach
}: {
  adminHref?: string;
  adminLabel?: string;
  showAdmin: boolean;
  showCoach: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className={playrNavigationVisuals.desktopNav} aria-label="Player navigation">
      {playerLinks.map((link) => {
        const active = isActivePath(pathname, link.matches);
        const Icon = link.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              playrNavigationVisuals.desktopItem,
              link.isHub
                ? active ? playrNavigationVisuals.desktopHub : "bg-white/10 text-white hover:bg-white/15"
                : active ? playrNavigationVisuals.desktopActive : playrNavigationVisuals.desktopInactive
            )}
            href={link.href}
            key={link.href}
          >
            <Icon size={17} />
            <span>{link.label}</span>
          </Link>
        );
      })}
      {showCoach ? (
        <Link aria-current={pathname.startsWith("/dashboard/coachr") ? "page" : undefined} className="ml-1 inline-flex min-h-11 items-center rounded-playr-md border border-white/20 px-3 py-2 text-slate-100 transition duration-fast hover:bg-white/10 focus-ring" href="/dashboard/coachr">CoachR</Link>
      ) : null}
      {showAdmin ? (
        <Link aria-current={pathname.startsWith(adminHref) ? "page" : undefined} className="ml-1 inline-flex min-h-11 items-center rounded-playr-md border border-white/20 px-3 py-2 text-slate-100 transition duration-fast hover:bg-white/10 focus-ring" href={adminHref}>{adminLabel}</Link>
      ) : null}
    </nav>
  );
}

export function PlayerBottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard/coachr") || pathname.startsWith("/dashboard/clubr") || pathname.startsWith("/admin")) return null;

  return (
    <nav aria-label="Player navigation" className={playrNavigationVisuals.mobileBar}>
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {playerLinks.map((link) => {
          const active = isActivePath(pathname, link.matches);
          const Icon = link.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={clsx(
                playrNavigationVisuals.mobileItem,
                link.isHub
                  ? active ? playrNavigationVisuals.mobileHubActive : playrNavigationVisuals.mobileHubInactive
                  : active ? playrNavigationVisuals.mobileActive : playrNavigationVisuals.mobileInactive
              )}
              href={link.href}
              key={link.href}
            >
              <Icon size={link.isHub ? 20 : 18} />
              <span className="max-w-full break-words">{link.label}</span>
              {active && !link.isHub ? <span aria-hidden className="absolute bottom-1 h-0.5 w-5 rounded-full bg-court-teal" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
