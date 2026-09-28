import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type CompetitionFormat = "knockout" | "round_robin" | "round_robin_knockout";
export type CompetitionStatus = "draft" | "generated" | "locked";
export type CompetitionSlotSource = "bye" | "group_placement" | "match_winner" | "participant";

export type CompetitionParticipant = {
  assignment_id: string;
  profile_id: string;
  player_name: string;
  is_junior: boolean;
  junior_stage: string | null;
  selected: boolean;
};

export type CompetitionGroupMember = {
  id: string;
  assignment_id: string;
  profile_id: string;
  player_name: string;
  position: number;
};

export type CompetitionGroup = {
  id: string;
  label: string;
  group_order: number;
  members: CompetitionGroupMember[];
};

export type CompetitionMatch = {
  id: string;
  group_id: string | null;
  match_kind: "knockout" | "round_robin";
  round_number: number;
  round_label: string;
  round_match_number: number;
  sequence: number;
  slot_a_label: string;
  slot_b_label: string;
  slot_a_source_type: CompetitionSlotSource;
  slot_b_source_type: CompetitionSlotSource;
  winner_to_match_id: string | null;
  winner_to_slot: "a" | "b" | null;
};

export type CompetitionStage = {
  id: string;
  stage_type: "group" | "knockout";
  stage_order: number;
  label: string;
  groups: CompetitionGroup[];
  matches: CompetitionMatch[];
};

export type EventCompetition = {
  id: string;
  event_id: string;
  format: CompetitionFormat;
  status: CompetitionStatus;
  group_count: number | null;
  advancing_per_group: number | null;
  selected_assignment_ids: string[];
  participant_count: number;
  structure_version: number;
  generated_at: string | null;
  locked_at: string | null;
  is_stale: boolean;
};

export type CompetitionStructure = {
  can_manage: boolean;
  competition: EventCompetition | null;
  confirmed_participants: CompetitionParticipant[];
  stages: CompetitionStage[];
};

export function competitionFormatLabel(format: CompetitionFormat) {
  if (format === "round_robin") return "Round Robin";
  if (format === "knockout") return "Knockout";
  return "Round Robin → Knockout";
}

export function roundRobinMatchCount(playerCount: number) {
  return playerCount > 1 ? playerCount * (playerCount - 1) / 2 : 0;
}

export function roundRobinPairs<T>(players: T[]) {
  const pairs: Array<[T, T]> = [];
  for (let left = 0; left < players.length; left += 1) {
    for (let right = left + 1; right < players.length; right += 1) {
      pairs.push([players[left], players[right]]);
    }
  }
  return pairs;
}

export function snakeDistribute<T>(players: T[], groupCount: number) {
  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > players.length) throw new Error("invalid_group_count");
  const groups = Array.from({ length: groupCount }, () => [] as T[]);
  players.forEach((player, index) => {
    const offset = index % (groupCount * 2);
    const groupIndex = offset < groupCount ? offset : (groupCount * 2) - offset - 1;
    groups[groupIndex].push(player);
  });
  return groups;
}

export function nextPowerOfTwo(playerCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 64) throw new Error("invalid_knockout_size");
  let size = 2;
  while (size < playerCount) size *= 2;
  return size;
}

type BlueprintSlot = { type: "bye" } | { type: "participant"; id: string } | { type: "match_winner"; matchKey: string };
export type KnockoutBlueprintMatch = {
  key: string;
  round: number;
  match: number;
  slotA: BlueprintSlot;
  slotB: BlueprintSlot;
  winnerTo: { matchKey: string; slot: "a" | "b" } | null;
};

export function knockoutBlueprint(participantIds: string[]) {
  const bracketSize = nextPowerOfTwo(participantIds.length);
  const byeCount = bracketSize - participantIds.length;
  const matches: KnockoutBlueprintMatch[] = [];
  let cursor = 0;
  let previous: KnockoutBlueprintMatch[] = [];

  for (let match = 1; match <= bracketSize / 2; match += 1) {
    const hasBye = match <= byeCount;
    const row: KnockoutBlueprintMatch = {
      key: `r1m${match}`,
      round: 1,
      match,
      slotA: { type: "participant", id: participantIds[cursor++] },
      slotB: hasBye ? { type: "bye" } : { type: "participant", id: participantIds[cursor++] },
      winnerTo: null
    };
    matches.push(row);
    previous.push(row);
  }

  let round = 2;
  while (previous.length > 1) {
    const next: KnockoutBlueprintMatch[] = [];
    for (let index = 0; index < previous.length; index += 2) {
      const match = index / 2 + 1;
      const row: KnockoutBlueprintMatch = {
        key: `r${round}m${match}`,
        round,
        match,
        slotA: { type: "match_winner", matchKey: previous[index].key },
        slotB: { type: "match_winner", matchKey: previous[index + 1].key },
        winnerTo: null
      };
      previous[index].winnerTo = { matchKey: row.key, slot: "a" };
      previous[index + 1].winnerTo = { matchKey: row.key, slot: "b" };
      matches.push(row);
      next.push(row);
    }
    previous = next;
    round += 1;
  }

  return { bracketSize, byeCount, matches };
}

export async function loadCompetitionStructure(supabase: ServerSupabase, eventId: string) {
  const { data, error } = await supabase.rpc("get_event_competition_structure", { p_event_id: eventId });
  if (error) {
    console.error("[competition-structure] load_failed", { code: error.code, eventId, message: error.message });
    return { data: null, error: "Competition structure could not be loaded." };
  }
  return { data: data as unknown as CompetitionStructure, error: null };
}

export function competitionMatchCount(structure: CompetitionStructure | null) {
  return structure?.stages.reduce((total, stage) => total + stage.matches.length, 0) ?? 0;
}
