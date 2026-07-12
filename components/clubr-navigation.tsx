"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookingIcon, ChevronDownIcon, ClubIcon, EntriesIcon, EventIcon } from "@/components/playr-icons";

const clubRLinks = [
  { href: "/dashboard/clubr/members", label: "Members", icon: EntriesIcon },
  { href: "/dashboard/clubr/bookings", label: "Bookings", icon: BookingIcon },
  { href: "/dashboard/clubr", label: "MyClubR", icon: ClubIcon, isHub: true },
  { href: "/dashboard/clubr/events", label: "Events", icon: EventIcon },
  { href: "/dashboard/clubr/more", label: "More", icon: ChevronDownIcon }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard/clubr") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClubRDesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-5 hidden gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:flex" aria-label="ClubR navigation">
      {clubRLinks.map((link) => {
        const active = isActivePath(pathname, link.href);
        const Icon = link.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition",
              link.isHub
                ? active
                  ? "bg-court-navy text-white shadow-court"
                  : "bg-court-mist text-court-navy hover:bg-court-navy hover:text-white"
                : active
                  ? "bg-court-mist text-court-navy"
                  : "text-slate-600 hover:bg-court-mist hover:text-court-navy"
            )}
            href={link.href}
            key={link.href}
          >
            <Icon size={16} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ClubRBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ClubR navigation"
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-court-teal/20 bg-white/95 p-2 shadow-[0_-12px_35px_rgba(8,36,58,0.18)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {clubRLinks.map((link) => {
          const active = isActivePath(pathname, link.href);
          const Icon = link.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={clsx(
                "grid min-h-14 place-items-center rounded-xl px-1 py-1 text-center text-[10px] font-black transition",
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
        })}
      </div>
    </nav>
  );
}
