import type { PlayRRankingCategory, PlayRRankingMetric } from "@/lib/ranking-categories";
import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type ConnectedRankingSummary = {
  organisationId: string;
  organisationName: string;
  playerProfileId: string;
  rankingCategory: PlayRRankingCategory;
  rankingMetric: PlayRRankingMetric;
  rankingPosition: number;
  rankingScope: "school" | "district";
};

type ConnectedRankingRow = {
  organisation_id: string;
  organisation_name: string;
  player_profile_id: string;
  ranking_category: PlayRRankingCategory;
  ranking_metric: PlayRRankingMetric;
  ranking_position: number;
  ranking_scope: "school" | "district";
};

export async function loadConnectedRankingSummaries(
  supabase: ServerSupabaseClient,
  playerProfileIds: string[]
) {
  if (playerProfileIds.length === 0) return { data: [] as ConnectedRankingSummary[], error: false };

  const { data, error } = await supabase.rpc("get_managed_playr_connected_rankings", {
    p_player_profile_ids: playerProfileIds
  });

  if (error) {
    console.error("[connected-rankings] summary_load_failed", { code: error.code, playerCount: playerProfileIds.length });
    return { data: [] as ConnectedRankingSummary[], error: true };
  }

  return {
    data: ((data ?? []) as ConnectedRankingRow[]).map((row) => ({
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      playerProfileId: row.player_profile_id,
      rankingCategory: row.ranking_category,
      rankingMetric: row.ranking_metric,
      rankingPosition: Number(row.ranking_position),
      rankingScope: row.ranking_scope
    })),
    error: false
  };
}

export function connectedRankingForScope(
  rankings: ConnectedRankingSummary[],
  playerProfileId: string,
  rankingScope: ConnectedRankingSummary["rankingScope"],
  preferredOrganisationId?: string | null
) {
  const scoped = rankings.filter((ranking) =>
    ranking.playerProfileId === playerProfileId && ranking.rankingScope === rankingScope
  );

  if (preferredOrganisationId) {
    return scoped.find((ranking) => ranking.organisationId === preferredOrganisationId) ?? null;
  }

  return scoped[0] ?? null;
}
