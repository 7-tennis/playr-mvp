"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const playerLinks = [
  { href: "/dashboard", label: "My PlayR", mobileLabel: "My PlayR" },
  { href: "/dashboard/book-court", label: "Book a Court", mobileLabel: "Book" },
  { href: "/dashboard/play", label: "Play", mobileLabel: "Play" },
  { href: "/dashboard/events", label: "Events", mobileLabel: "Events" },
  { href: "/dashboard/profile", label: "Player Profile", mobileLabel: "Profile" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlayerDesktopNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-sm font-bold text-slate-700 md:flex" aria-label="Player navigation">
      {playerLinks.map((link) => {
        const active = isActivePath(pathname, link.href);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              "rounded px-3 py-2 transition",
              active ? "bg-court-mist text-court-navy" : "hover:bg-slate-100 hover:text-court-blue"
            )}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
      {showAdmin ? (
        <Link
          className={clsx(
            "ml-2 rounded border px-3 py-2 transition",
            pathname.startsWith("/admin")
              ? "border-court-teal bg-court-mist text-court-navy"
              : "border-slate-200 text-court-navy hover:border-court-teal"
          )}
          href="/admin"
        >
          ClubR Admin
        </Link>
      ) : null}
    </nav>
  );
}

export function PlayerBottomNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Player navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-12px_35px_rgba(8,36,58,0.12)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {playerLinks.map((link) => {
          const active = isActivePath(pathname, link.href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={clsx(
                "rounded px-2 py-2 text-center text-xs font-black transition",
                active ? "bg-court-navy text-white" : "text-slate-600 hover:bg-court-mist hover:text-court-navy"
              )}
              href={link.href}
              key={link.href}
            >
              {link.mobileLabel}
            </Link>
          );
        })}
      </div>
      {showAdmin ? (
        <div className="mx-auto mt-2 max-w-md">
          <Link className="block rounded bg-court-mist px-3 py-2 text-center text-xs font-black text-court-navy" href="/admin">
            ClubR Admin
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
