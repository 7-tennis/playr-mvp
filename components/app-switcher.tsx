"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { switchApplicationArea } from "@/app/dashboard/organisations/actions";
import { AppSwitcherIcon, ChevronDownIcon } from "@/components/playr-icons";
import { appAreaDefinitions, appAreaForPath, type AppAreaDestination } from "@/lib/app-areas";

export function AppIdentity() {
  const pathname = usePathname();
  const area = appAreaDefinitions[appAreaForPath(pathname)];

  return (
    <Link className="flex min-w-0 shrink items-center gap-2 rounded-playr-md font-black tracking-tight text-white focus-ring" href={area.href}>
      <span className="playr-gradient-navigation-active grid h-9 w-9 shrink-0 place-items-center rounded-playr-md text-white shadow-playr-card">PR</span>
      <span className="min-w-0 truncate text-sm min-[375px]:text-base" title={area.label}>{area.shortLabel}</span>
    </Link>
  );
}

export function AppSwitcher({ destinations }: { destinations: AppAreaDestination[] }) {
  const pathname = usePathname();
  const currentAreaId = appAreaForPath(pathname);
  const currentArea = appAreaDefinitions[currentAreaId];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  if (destinations.length <= 1) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Switch app. Current app: ${currentArea.label}`}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-playr-md border border-white/20 bg-white/10 px-2 text-white shadow-playr-subtle transition hover:border-court-teal hover:bg-white/15 focus-ring sm:px-3"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <AppSwitcherIcon size={18} />
        <span className="hidden max-w-24 truncate text-xs font-black sm:inline">{currentArea.shortLabel}</span>
        <ChevronDownIcon className={`hidden transition sm:inline ${open ? "rotate-180" : ""}`} size={14} />
      </button>
      {open ? (
        <div
          aria-label="Available app areas"
          className="fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-playr-lg border border-playr-border-subtle bg-white p-2 text-court-navy shadow-playr-floating sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64"
          role="menu"
        >
          <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Switch app</p>
          {destinations.map((destination) => {
            const selected = destination.id === currentAreaId;
            const className = `flex min-h-11 w-full items-center justify-between gap-3 rounded-playr-md px-3 py-2 text-left text-sm font-black transition focus-ring ${selected ? "bg-court-mist text-court-navy" : "text-slate-700 hover:bg-slate-100"}`;
            const content = <><span>{destination.label}</span>{selected ? <span className="ui-chip ui-chip-brand">Current</span> : null}</>;

            return destination.membershipId && !selected ? (
              <form action={switchApplicationArea} key={destination.id}>
                <input name="appArea" type="hidden" value={destination.id} />
                <input name="membershipId" type="hidden" value={destination.membershipId} />
                <button className={className} onClick={() => setOpen(false)} role="menuitem" type="submit">{content}</button>
              </form>
            ) : (
              <Link aria-current={selected ? "page" : undefined} className={className} href={destination.href} key={destination.id} onClick={() => setOpen(false)} role="menuitem">{content}</Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
