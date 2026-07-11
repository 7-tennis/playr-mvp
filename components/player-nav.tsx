"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const playerLinks = [
  { href: "/dashboard/book-court", label: "Book", mobileLabel: "Book" },
  { href: "/dashboard/play", label: "Play", mobileLabel: "Play" },
  { href: "/dashboard", label: "MyPlayR", mobileLabel: "MyPlayR", isHub: true },
  { href: "/dashboard/events", label: "Events", mobileLabel: "Events" },
  { href: "/dashboard/shop", label: "Shop", mobileLabel: "Shop" }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlayerDesktopNav({ showAdmin, showCoach }: { showAdmin: boolean; showCoach: boolean }) {
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
              link.isHub && active
                ? "bg-court-navy text-white"
                : link.isHub
                  ? "bg-court-mist text-court-navy hover:bg-court-navy hover:text-white"
                  : active
                    ? "bg-court-mist text-court-navy"
                    : "hover:bg-slate-100 hover:text-court-blue"
            )}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
      {showCoach ? (
        <Link
          className={clsx(
            "ml-2 rounded border px-3 py-2 transition",
            pathname.startsWith("/dashboard/coachr")
              ? "border-court-teal bg-court-mist text-court-navy"
              : "border-slate-200 text-court-navy hover:border-court-teal"
          )}
          href="/dashboard/coachr"
        >
          CoachR
        </Link>
      ) : null}
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

export function PlayerBottomNav({ showAdmin, showCoach }: { showAdmin: boolean; showCoach: boolean }) {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard/coachr")) {
    return null;
  }

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
                "grid min-h-12 place-items-center rounded px-1 text-center text-[11px] font-black transition",
                link.isHub
                  ? "bg-court-navy text-white shadow-court"
                  : active
                    ? "bg-court-mist text-court-navy"
                    : "text-slate-600 hover:bg-court-mist hover:text-court-navy"
              )}
              href={link.href}
              key={link.href}
            >
              {link.mobileLabel}
            </Link>
          );
        })}
      </div>
      {showCoach ? (
        <div className="mx-auto mt-2 max-w-md">
          <Link className="block rounded bg-court-mist px-3 py-2 text-center text-xs font-black text-court-navy" href="/dashboard/coachr">
            CoachR
          </Link>
        </div>
      ) : null}
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
