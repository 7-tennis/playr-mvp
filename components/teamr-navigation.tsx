"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ChevronDownIcon, EntriesIcon, EventIcon, MatchIcon, SchoolIcon } from "@/components/playr-icons";

const teamRLinks = [
  { href: "/dashboard/teamr/players", label: "Players", icon: EntriesIcon },
  { href: "/dashboard/teamr/teams", label: "Teams", icon: MatchIcon },
  { href: "/dashboard/teamr", label: "MyTeamR", icon: SchoolIcon, isHub: true },
  { href: "/dashboard/teamr/competitions", label: "Events & Competitions", icon: EventIcon },
  { href: "/dashboard/teamr/more", label: "More", icon: ChevronDownIcon }
];

function isActivePath(pathname: string, href: string) {
  return href === "/dashboard/teamr" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function TeamRNavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return teamRLinks.map((link) => {
    const active = isActivePath(pathname, link.href);
    const Icon = link.icon;

    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={clsx(
          mobile
            ? "grid min-h-14 place-items-center rounded-xl px-1 py-1 text-center text-[10px] font-black transition"
            : "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition",
          link.isHub
            ? "bg-court-navy text-white shadow-court"
            : active
              ? "bg-court-mist text-court-navy"
              : "text-slate-600 hover:bg-court-mist hover:text-court-navy"
        )}
        href={link.href}
        key={link.href}
      >
        <Icon size={link.isHub ? 19 : 17} />
        <span>{link.label}</span>
      </Link>
    );
  });
}

export function TeamRDesktopNav() {
  return (
    <nav aria-label="TeamR navigation" className="mb-5 hidden gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:flex">
      <TeamRNavLinks />
    </nav>
  );
}

export function TeamRBottomNav() {
  return (
    <nav aria-label="TeamR navigation" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-court-teal/20 bg-white/95 p-2 shadow-[0_-12px_35px_rgba(8,36,58,0.18)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1"><TeamRNavLinks mobile /></div>
    </nav>
  );
}
