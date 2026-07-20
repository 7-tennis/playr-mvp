import type { OrganisationType } from "@/types/courtside";

export const organisationVisuals: Record<OrganisationType, {
  badge: "club" | "academy" | "school" | "district";
  gradient: string;
  icon: string;
  surface: string;
}> = {
  club: { badge: "club", gradient: "playr-gradient-club", icon: "bg-emerald-50 text-court-teal", surface: "bg-emerald-50/50" },
  academy: { badge: "academy", gradient: "playr-gradient-academy", icon: "bg-sky-50 text-court-blue", surface: "bg-sky-50/50" },
  school: { badge: "school", gradient: "playr-gradient-school", icon: "bg-blue-50 text-court-navy", surface: "bg-blue-50/50" },
  district: { badge: "district", gradient: "playr-gradient-district", icon: "bg-slate-100 text-slate-800", surface: "bg-slate-50" },
  club_academy: { badge: "academy", gradient: "playr-gradient-academy", icon: "bg-court-mist text-court-teal", surface: "bg-court-mist/60" },
  school_district: { badge: "district", gradient: "playr-gradient-district", icon: "bg-blue-50 text-court-navy", surface: "bg-blue-50/50" }
};

export const playrLayout = {
  standard: "max-w-6xl",
  wide: "max-w-7xl",
  reading: "max-w-3xl",
  gutters: "px-4 sm:px-6 lg:px-8"
} as const;

export const playrMotion = {
  fast: "duration-fast",
  standard: "duration-standard",
  slow: "duration-slow"
} as const;
