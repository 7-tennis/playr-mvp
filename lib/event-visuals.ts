import { formatLabel } from "@/lib/courtside-format";
import type { CourtSideEvent, Profile } from "@/types/courtside";

export type EventProfile = Pick<Profile, "is_junior" | "junior_stage">;

export type EventVisual = {
  accent: string;
  badge: string;
  border: string;
  gradient: string;
  icon: string;
};

const visuals: Record<string, EventVisual> = {
  red: { accent: "bg-red-500", badge: "bg-red-50 text-red-700", border: "border-red-300", gradient: "from-red-600 via-red-500 to-orange-400", icon: "bg-white/20 text-white" },
  orange: { accent: "bg-orange-500", badge: "bg-orange-50 text-orange-700", border: "border-orange-300", gradient: "from-orange-600 via-orange-500 to-teal-400", icon: "bg-white/20 text-white" },
  green: { accent: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700", border: "border-emerald-300", gradient: "from-emerald-700 via-emerald-500 to-teal-400", icon: "bg-white/20 text-white" },
  yellow: { accent: "bg-amber-400", badge: "bg-amber-50 text-amber-800", border: "border-amber-300", gradient: "from-amber-600 via-amber-400 to-yellow-300", icon: "bg-white/25 text-court-navy" },
  navy: { accent: "bg-court-navy", badge: "bg-court-navy text-white", border: "border-court-navy/20", gradient: "from-court-navy via-court-blue to-court-teal", icon: "bg-white/15 text-white" },
  default: { accent: "bg-court-teal", badge: "bg-court-mist text-court-teal", border: "border-court-teal/35", gradient: "from-court-navy via-court-teal to-emerald-400", icon: "bg-white/15 text-white" }
};

export function eventSearchText(event: CourtSideEvent) {
  return [event.title, event.description, event.event_type, event.category, event.age_group, event.location].filter(Boolean).join(" ").toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function eventStageKey(event: CourtSideEvent) {
  const text = eventSearchText(event);
  for (const stage of ["red", "orange", "green", "yellow"] as const) {
    if (includesAny(text, [`${stage} ball`, `${stage}_ball`, `${stage}-ball`])) return stage;
  }
  return null;
}

export function eventAudienceLabel(event: CourtSideEvent) {
  const stage = eventStageKey(event);
  if (stage) return `${stage.charAt(0).toUpperCase()}${stage.slice(1)} Ball`;
  const text = eventSearchText(event);
  if (includesAny(text, ["junior", "kids", "children", "primary"])) return "Junior";
  if (includesAny(text, ["adult", "open", "senior"])) return "Adult/Open";
  return formatLabel(event.age_group ?? event.category ?? event.event_type ?? event.sport);
}

export function eventVisual(event: CourtSideEvent) {
  const stage = eventStageKey(event);
  if (stage) return visuals[stage];
  return includesAny(eventSearchText(event), ["adult", "open", "league", "tournament"]) ? visuals.navy : visuals.default;
}

export function eventHostKind(event: CourtSideEvent) {
  const text = eventSearchText(event);
  if (text.includes("school")) return "school";
  if (text.includes("district")) return "district";
  if (text.includes("club")) return "club";
  if (text.includes("academy")) return "academy";
  if (text.includes("coach")) return "coach";
  if (text.includes("playr")) return "playr";
  return null;
}

export function eventHostLabel(event: CourtSideEvent) {
  const kind = eventHostKind(event);
  return kind ? `${kind === "playr" ? "PlayR" : formatLabel(kind)} Event` : null;
}

export function isRatingRelevantEvent(event: CourtSideEvent) {
  return includesAny(eventSearchText(event), ["rating", "rated", "matchplay", "match play", "competition", "competitive", "tournament", "league", "results"]);
}

export function isSocialEvent(event: CourtSideEvent) {
  return includesAny(eventSearchText(event), ["social", "fun", "friendly", "americano"]);
}

export function isJuniorEvent(event: CourtSideEvent) {
  return eventStageKey(event) !== null || includesAny(eventSearchText(event), ["junior", "kids", "children", "primary"]);
}

export function isAdultEvent(event: CourtSideEvent) {
  return includesAny(eventSearchText(event), ["adult", "open", "senior"]) || !isJuniorEvent(event);
}

export function eventMatchesProfile(event: CourtSideEvent, profile: EventProfile) {
  const text = eventSearchText(event);
  const stage = eventStageKey(event);
  if (profile.is_junior) {
    if (profile.junior_stage) {
      const readableStage = profile.junior_stage.replace("_", " ");
      if (text.includes(readableStage) || text.includes(profile.junior_stage)) return true;
    }
    return stage === null && isJuniorEvent(event);
  }
  return isAdultEvent(event);
}
