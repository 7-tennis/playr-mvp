import type { JuniorStage } from "@/types/courtside";

export type PlayRAccentKey = "member" | "red" | "orange" | "green" | "yellow" | "neutral";

export type PlayRAccent = {
  border: string;
  strip: string;
  tint: string;
  badge: string;
  avatar: string;
  ring: string;
  icon: string;
};

export const playrAccents: Record<PlayRAccentKey, PlayRAccent> = {
  member: {
    border: "border-court-teal/55",
    strip: "bg-court-teal",
    tint: "bg-court-mist",
    badge: "bg-court-mist text-court-teal",
    avatar: "bg-court-teal text-white",
    ring: "group-hover:ring-court-teal/25",
    icon: "text-court-teal"
  },
  red: {
    border: "border-red-300",
    strip: "bg-red-500",
    tint: "bg-red-50",
    badge: "bg-red-50 text-red-700",
    avatar: "bg-red-500 text-white",
    ring: "group-hover:ring-red-200",
    icon: "text-red-500"
  },
  orange: {
    border: "border-orange-300",
    strip: "bg-orange-500",
    tint: "bg-orange-50",
    badge: "bg-orange-50 text-orange-700",
    avatar: "bg-orange-500 text-white",
    ring: "group-hover:ring-orange-200",
    icon: "text-orange-500"
  },
  green: {
    border: "border-emerald-300",
    strip: "bg-emerald-500",
    tint: "bg-emerald-50",
    badge: "bg-emerald-50 text-emerald-700",
    avatar: "bg-emerald-500 text-white",
    ring: "group-hover:ring-emerald-200",
    icon: "text-emerald-500"
  },
  yellow: {
    border: "border-amber-300",
    strip: "bg-amber-400",
    tint: "bg-amber-50",
    badge: "bg-amber-50 text-amber-700",
    avatar: "bg-amber-400 text-court-navy",
    ring: "group-hover:ring-amber-200",
    icon: "text-amber-500"
  },
  neutral: {
    border: "border-slate-300",
    strip: "bg-slate-500",
    tint: "bg-slate-50",
    badge: "bg-slate-100 text-slate-700",
    avatar: "bg-slate-600 text-white",
    ring: "group-hover:ring-slate-200",
    icon: "text-slate-500"
  }
};

export function playrStageKey(stage: JuniorStage | string | null | undefined): PlayRAccentKey {
  switch (stage) {
    case "red_ball":
    case "red":
      return "red";
    case "orange_ball":
    case "orange":
      return "orange";
    case "green_ball":
    case "green":
      return "green";
    case "yellow_ball":
    case "yellow":
      return "yellow";
    case "not_sure":
    default:
      return "neutral";
  }
}

export function playrAccentForJuniorStage(stage: JuniorStage | string | null | undefined) {
  return playrAccents[playrStageKey(stage)];
}

export function playrJuniorStageLabel(stage: JuniorStage | string | null | undefined) {
  switch (stage) {
    case "red_ball":
    case "red":
      return "Red Ball";
    case "orange_ball":
    case "orange":
      return "Orange Ball";
    case "green_ball":
    case "green":
      return "Green Ball";
    case "yellow_ball":
    case "yellow":
      return "Yellow Ball";
    case "not_sure":
      return "Ball stage pending";
    default:
      return "Junior Player";
  }
}
