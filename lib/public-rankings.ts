import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type { PlayRRankingCategory, PlayRRankingMetric } from "@/lib/ranking-categories";
import type { RankingScope } from "@/lib/ranking-scope";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type PublicRankingRow = {
  ranking_profile_id: string;
  public_display_name: string;
  ranking_category: PlayRRankingCategory;
  development_stage: "red" | "orange" | "green" | "yellow" | null;
  player_classification: "junior" | "adult";
  organisation_summary: string | null;
  school_affiliation: string | null;
  public_region: string | null;
  metric_value: number;
  events_played: number;
  matches_played: number;
  ranking_position: number;
  total_count: number;
  updated_at: string;
  is_managed: boolean;
};

export type PublicRankingOrganisation = {
  organisation_id: string;
  organisation_name: string;
  organisation_type: string;
  ranking_scope?: Exclude<RankingScope, "overall">;
};

export type PublicRankingQuery = {
  category: PlayRRankingCategory;
  classification?: "junior" | "adult";
  limit?: number;
  metric: PlayRRankingMetric;
  offset?: number;
  organisationId?: string;
  region?: string;
  search?: string;
  scope?: RankingScope;
};

export async function loadPublicRankingFilters(supabase: ServerSupabaseClient, category: PlayRRankingCategory) {
  const [organisationResult, regionResult] = await Promise.all([
    supabase.rpc("get_public_playr_ranking_organisations", { p_category: category }),
    supabase.rpc("get_public_playr_ranking_regions", { p_category: category })
  ]);

  return {
    error: Boolean(organisationResult.error || regionResult.error),
    organisations: (organisationResult.data ?? []) as PublicRankingOrganisation[],
    regions: ((regionResult.data ?? []) as Array<{ region: string }>).map((item) => item.region)
  };
}

export async function loadPublicRankings(supabase: ServerSupabaseClient, query: PublicRankingQuery) {
  const { data, error } = await supabase.rpc("get_public_playr_rankings", {
    p_category: query.category,
    p_classification: query.classification ?? null,
    p_limit: query.limit ?? 25,
    p_metric: query.metric,
    p_offset: query.offset ?? 0,
    p_organisation_id: query.organisationId ?? null,
    p_region: query.region ?? null,
    p_scope: query.scope ?? "overall",
    p_search: query.search ?? null
  });

  return {
    error: Boolean(error),
    rows: (data ?? []) as PublicRankingRow[]
  };
}
