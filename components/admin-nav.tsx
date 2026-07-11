"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/profiles", label: "Players" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/entries", label: "Entries" },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/courts", label: "Courts" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/organisations", label: "Organisations" }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-2 overflow-x-auto" aria-label="ClubR navigation">
      {adminLinks.map((link) => {
        const active = link.href === "/admin" ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={clsx(
              "shrink-0 rounded border px-3 py-2 text-sm font-bold transition",
              active ? "border-court-teal bg-court-mist text-court-navy" : "border-slate-200 bg-white text-court-navy hover:border-court-teal"
            )}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
