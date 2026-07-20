import type { JuniorStage, Profile } from "@/types/courtside";

export type PlayRRankingCategory = "red" | "orange" | "green" | "open";
export type PlayRRankingMetric = "rating" | "participation";

export const playrRankingCategories: Array<{ id: PlayRRankingCategory; label: string }> = [
  { id: "red", label: "Red" },
  { id: "orange", label: "Orange" },
  { id: "green", label: "Green" },
  { id: "open", label: "Open" }
];

export function rankingCategoryForProfile(profile: Pick<Profile, "is_junior" | "junior_stage">): PlayRRankingCategory {
  if (!profile.is_junior || profile.junior_stage === "yellow_ball") return "open";
  if (profile.junior_stage === "orange_ball") return "orange";
  if (profile.junior_stage === "green_ball") return "green";
  return "red";
}

export function rankingCategoryForStage(stage: JuniorStage | null | undefined): PlayRRankingCategory {
  if (stage === "orange_ball") return "orange";
  if (stage === "green_ball") return "green";
  if (stage === "yellow_ball") return "open";
  return "red";
}

export function rankingMetricForCategory(category: PlayRRankingCategory, requested?: string): PlayRRankingMetric {
  if (category === "red" || category === "orange") return "participation";
  return requested === "participation" ? "participation" : "rating";
}

export function rankingCategoryLabel(category: PlayRRankingCategory) {
  return playrRankingCategories.find((item) => item.id === category)?.label ?? "Open";
}

export function rankingCategoryDescription(category: PlayRRankingCategory) {
  switch (category) {
    case "red": return "Participation-first rankings for Red development players.";
    case "orange": return "Participation-first rankings for Orange development players.";
    case "green": return "Green rating and participation leaderboards.";
    case "open": return "Full-court ratings for Yellow-stage juniors and adult players.";
  }
}
