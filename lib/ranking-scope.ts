import type { PublicRankingOrganisation } from "@/lib/public-rankings";
import type { PlayRRankingCategory } from "@/lib/ranking-categories";

export type RankingScope = "overall" | "school" | "club" | "academy" | "district";

export const rankingScopes: Array<{ label: string; value: RankingScope }> = [
  { label: "Overall", value: "overall" },
  { label: "School", value: "school" },
  { label: "Club", value: "club" },
  { label: "Academy", value: "academy" },
  { label: "District", value: "district" }
];

const organisationTypesByScope: Record<Exclude<RankingScope, "overall">, string[]> = {
  academy: ["academy", "club_academy"],
  club: ["club", "club_academy"],
  district: ["district", "school_district"],
  school: ["school", "school_district"]
};

export function safeRankingScope(value: string | null | undefined): RankingScope | null {
  return rankingScopes.some((scope) => scope.value === value) ? value as RankingScope : null;
}

export function rankingScopeLabel(scope: RankingScope) {
  return rankingScopes.find((item) => item.value === scope)?.label ?? "Overall";
}

export function rankingScopeSelectorLabel(scope: Exclude<RankingScope, "overall">) {
  return `Choose ${scope}`;
}

export function organisationMatchesRankingScope(organisation: PublicRankingOrganisation, scope: RankingScope) {
  return scope === "overall" || organisationTypesByScope[scope].includes(organisation.organisation_type);
}

export function rankingOrganisationsForScope(organisations: PublicRankingOrganisation[], scope: RankingScope) {
  return scope === "overall" ? [] : organisations.filter((organisation) => organisationMatchesRankingScope(organisation, scope));
}

function scopeForOrganisation(organisation: PublicRankingOrganisation): Exclude<RankingScope, "overall"> | null {
  if (["school", "school_district"].includes(organisation.organisation_type)) return "school";
  if (["club", "club_academy"].includes(organisation.organisation_type)) return "club";
  if (organisation.organisation_type === "academy") return "academy";
  if (organisation.organisation_type === "district") return "district";
  return null;
}

export function resolveRankingContext(
  organisations: PublicRankingOrganisation[],
  requestedScope: string | null | undefined,
  requestedOrganisationId: string | null | undefined
) {
  const scope = safeRankingScope(requestedScope);
  if (scope === "overall") return { organisation: null, scope };

  const organisation = organisations.find((item) => item.organisation_id === requestedOrganisationId) ?? null;
  if (!organisation) return { organisation: null, scope: "overall" as const };

  if (scope) {
    return organisationMatchesRankingScope(organisation, scope)
      ? { organisation, scope }
      : { organisation: null, scope: "overall" as const };
  }

  const inferredScope = scopeForOrganisation(organisation);
  return inferredScope ? { organisation, scope: inferredScope } : { organisation: null, scope: "overall" as const };
}

export function rankingContextHref({
  category,
  classification,
  organisationId,
  scope
}: {
  category?: PlayRRankingCategory;
  classification?: "junior" | "adult";
  organisationId: string;
  scope: Exclude<RankingScope, "overall">;
}) {
  const params = new URLSearchParams({ organisation: organisationId, scope });
  if (category) params.set("category", category);
  if (classification) params.set("classification", classification);
  return `/dashboard/rankings?${params.toString()}`;
}
