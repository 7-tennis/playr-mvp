import type { NotificationType, OrganisationType } from "@/types/courtside";

export type MessageHubKind = "academy" | "club" | "competition" | "district" | "playr" | "school";

export const messageHubVisuals: Record<MessageHubKind, { accent: string; icon: string; label: string }> = {
  academy: { accent: "from-court-navy to-court-blue", icon: "bg-court-blue text-white", label: "Academy" },
  club: { accent: "from-court-navy to-court-teal", icon: "bg-court-navy text-white", label: "Club" },
  competition: { accent: "from-emerald-700 to-court-teal", icon: "bg-emerald-600 text-white", label: "Competition" },
  district: { accent: "from-violet-800 to-court-blue", icon: "bg-violet-700 text-white", label: "District" },
  playr: { accent: "from-court-blue to-court-teal", icon: "bg-court-teal text-white", label: "PlayR" },
  school: { accent: "from-amber-700 to-orange-500", icon: "bg-amber-600 text-white", label: "School" }
};

export function hubKindForOrganisation(type: OrganisationType): MessageHubKind {
  if (type === "academy" || type === "club_academy") return "academy";
  if (type === "school" || type === "school_district") return "school";
  return type;
}

export function hubKindForNotification(type: NotificationType): MessageHubKind {
  if (type.startsWith("event_") || type.startsWith("match_") || type === "leaderboard_changed" || type === "rating_updated") return "competition";
  return "playr";
}
