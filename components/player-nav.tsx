"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LeaderboardIcon, LocationIcon, MatchIcon, MessagesIcon, StageIcon } from "@/components/playr-icons";
import { playrNavigationVisuals } from "@/lib/navigation-visuals";
import { isPlayerNavigationActive, playerNavigationDestinations, type PlayerNavigationKey } from "@/lib/player-navigation";

const playerIcons = {
  venues: LocationIcon,
  compete: MatchIcon,
  myplayr: StageIcon,
  messages: MessagesIcon,
  rankings: LeaderboardIcon
} satisfies Record<PlayerNavigationKey, typeof StageIcon>;

function NavigationCount({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={`${count} unread ${count === 1 ? "message" : "messages"}`}
      className="absolute right-1 top-1 min-w-[1.15rem] rounded-full bg-court-lime px-1 py-0.5 text-center text-[9px] font-black leading-none text-court-navy ring-2 ring-court-navy"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function isOutsidePlayR(pathname: string) {
  return pathname.startsWith("/dashboard/coachr")
    || pathname.startsWith("/dashboard/clubr")
    || pathname.startsWith("/dashboard/setup/coachr")
    || pathname.startsWith("/dashboard/setup/clubr")
    || pathname.startsWith("/admin");
}

export function PlayerDesktopNav({
  messageCount = 0
}: {
  messageCount?: number;
}) {
  const pathname = usePathname();

  if (isOutsidePlayR(pathname)) return null;

  return (
    <nav className={playrNavigationVisuals.desktopNav} aria-label="Player navigation">
      {playerNavigationDestinations.map((link) => {
        const active = isPlayerNavigationActive(pathname, link);
        const Icon = playerIcons[link.key];

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              playrNavigationVisuals.desktopItem,
              "relative",
              link.isHub
                ? active ? playrNavigationVisuals.desktopHub : "bg-white/10 text-white hover:bg-white/15"
                : active ? playrNavigationVisuals.desktopActive : playrNavigationVisuals.desktopInactive
            )}
            href={link.href}
            key={link.href}
          >
            <Icon size={17} />
            <span>{link.label}</span>
            {link.key === "messages" ? <NavigationCount count={messageCount} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlayerBottomNav({ messageCount = 0 }: { messageCount?: number }) {
  const pathname = usePathname();

  if (isOutsidePlayR(pathname)) return null;

  return (
    <nav aria-label="Player navigation" className={playrNavigationVisuals.mobileBar}>
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {playerNavigationDestinations.map((link) => {
          const active = isPlayerNavigationActive(pathname, link);
          const Icon = playerIcons[link.key];

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
              {link.key === "messages" ? <NavigationCount count={messageCount} /> : null}
              {active && !link.isHub ? <span aria-hidden className="absolute bottom-1 h-0.5 w-5 rounded-full bg-court-teal" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
