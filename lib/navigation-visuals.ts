export const playrNavigationVisuals = {
  desktopNav: "hidden items-center gap-1 rounded-playr-lg border border-white/10 bg-white/[0.06] p-1 text-sm font-bold text-white shadow-playr-subtle lg:flex",
  desktopItem: "inline-flex min-h-11 items-center gap-2 rounded-playr-md px-3 py-2 transition duration-fast focus-ring active:translate-y-px",
  desktopActive: "bg-white text-court-navy shadow-playr-card",
  desktopInactive: "text-slate-200 hover:bg-white/10 hover:text-white",
  desktopHub: "playr-gradient-navigation-active text-white shadow-playr-card",
  mobileBar: "playr-navigation-surface fixed inset-x-2 z-40 rounded-playr-xl border border-white/15 p-2 shadow-playr-navigation sm:inset-x-4 lg:hidden",
  mobileItem: "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-playr-md px-0.5 py-1 text-center text-[10px] font-black leading-none transition duration-fast focus-ring active:scale-[0.98]",
  mobileActive: "bg-white text-court-navy shadow-playr-card",
  mobileInactive: "text-slate-200 hover:bg-white/10 hover:text-white",
  mobileHubActive: "playr-gradient-navigation-active -translate-y-1 text-white shadow-playr-elevated",
  mobileHubInactive: "-translate-y-1 bg-white/10 text-white ring-1 ring-white/15"
} as const;
