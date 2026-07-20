import type { JuniorStage } from "@/types/courtside";

export type PlayerStageVisualKey = "adult" | "red" | "orange" | "green" | "yellow" | "unclassified";

export type PlayerStageVisual = {
  key: PlayerStageVisualKey;
  label: string;
  gradient: string;
  border: string;
  ring: string;
  avatar: string;
  badge: string;
  foreground: string;
  mutedForeground: string;
  metricSurface: string;
};

export const playerStageVisuals: Record<PlayerStageVisualKey, PlayerStageVisual> = {
  adult: {
    key: "adult",
    label: "Adult Player",
    gradient: "playr-gradient-player-adult",
    border: "border-court-teal/55",
    ring: "group-hover:ring-court-teal/25",
    avatar: "border-white/60 bg-court-navy/30 text-white",
    badge: "border-white/50 bg-white/15 text-white",
    foreground: "text-white",
    mutedForeground: "text-blue-50",
    metricSurface: "border-court-teal/20 bg-court-mist/70"
  },
  red: {
    key: "red",
    label: "Red Ball",
    gradient: "playr-gradient-player-red",
    border: "border-red-300",
    ring: "group-hover:ring-red-200",
    avatar: "border-white/60 bg-red-950/20 text-white",
    badge: "border-white/60 bg-red-950/20 text-white",
    foreground: "text-white",
    mutedForeground: "text-red-50",
    metricSurface: "border-red-200 bg-red-50/80"
  },
  orange: {
    key: "orange",
    label: "Orange Ball",
    gradient: "playr-gradient-player-orange",
    border: "border-orange-300",
    ring: "group-hover:ring-orange-200",
    avatar: "border-white/70 bg-orange-950/20 text-white",
    badge: "border-white/70 bg-orange-950/20 text-white",
    foreground: "text-white",
    mutedForeground: "text-orange-50",
    metricSurface: "border-orange-200 bg-orange-50/80"
  },
  green: {
    key: "green",
    label: "Green Ball",
    gradient: "playr-gradient-player-green",
    border: "border-emerald-300",
    ring: "group-hover:ring-emerald-200",
    avatar: "border-white/70 bg-emerald-950/25 text-white",
    badge: "border-white/70 bg-emerald-950/25 text-white",
    foreground: "text-white",
    mutedForeground: "text-emerald-50",
    metricSurface: "border-emerald-200 bg-emerald-50/80"
  },
  yellow: {
    key: "yellow",
    label: "Yellow Ball",
    gradient: "playr-gradient-player-yellow",
    border: "border-amber-300",
    ring: "group-hover:ring-amber-200",
    avatar: "border-court-navy/25 bg-white/35 text-court-navy",
    badge: "border-court-navy/25 bg-white/35 text-court-navy",
    foreground: "text-court-navy",
    mutedForeground: "text-slate-800",
    metricSurface: "border-amber-200 bg-amber-50/80"
  },
  unclassified: {
    key: "unclassified",
    label: "Stage Not Set",
    gradient: "playr-gradient-player-neutral",
    border: "border-slate-300",
    ring: "group-hover:ring-slate-200",
    avatar: "border-white/60 bg-slate-950/20 text-white",
    badge: "border-white/60 bg-slate-950/20 text-white",
    foreground: "text-white",
    mutedForeground: "text-slate-100",
    metricSurface: "border-slate-200 bg-slate-50"
  }
};

export function playerStageVisual(isJunior: boolean, stage: JuniorStage | null | undefined) {
  if (!isJunior) return playerStageVisuals.adult;

  switch (stage) {
    case "red_ball": return playerStageVisuals.red;
    case "orange_ball": return playerStageVisuals.orange;
    case "green_ball": return playerStageVisuals.green;
    case "yellow_ball": return playerStageVisuals.yellow;
    case "not_sure":
    default: return playerStageVisuals.unclassified;
  }
}

export function juniorParticipationLeads(stage: JuniorStage | null | undefined) {
  return stage === "red_ball" || stage === "orange_ball" || stage === "not_sure" || stage == null;
}
