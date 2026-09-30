import type { createServerSupabaseClient } from "@/utils/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type CompetitionOperationsCourt = {
  id: string;
  label: string;
  court_order: number;
  notes: string | null;
  linked_court_id: string | null;
  linked_court_name: string | null;
};

export type CompetitionOperationsStaff = {
  id: string;
  event_staff_assignment_id: string;
  staff_user_id: string;
  staff_name: string;
  event_role: "coach" | "official";
  is_me: boolean;
};

export type CompetitionOperationsMatch = {
  id: string;
  stage_id: string;
  match_kind: "knockout" | "round_robin";
  round_label: string;
  round_match_number: number;
  sequence: number;
  slot_a_label: string;
  slot_b_label: string;
  event_court_id: string | null;
  queue_position: number | null;
  scheduled_at: string | null;
  staff: CompetitionOperationsStaff[];
};

export type CompetitionOperations = {
  can_manage: boolean;
  competition_status: "generated" | "locked";
  event: { id: string; starts_at: string; ends_at: string; timezone: string };
  summary: { active_courts: number; scheduled_matches: number; timed_matches: number; total_matches: number };
  courts: CompetitionOperationsCourt[];
  available_linked_courts: Array<{ id: string; name: string }>;
  staff_candidates: Array<{
    assignment_id: string;
    staff_user_id: string;
    staff_name: string;
    event_role: "coach" | "official";
  }>;
  matches: CompetitionOperationsMatch[];
};

export async function loadCompetitionOperations(supabase: ServerSupabase, eventId: string) {
  const { data, error } = await supabase.rpc("get_event_competition_operations", { p_event_id: eventId });
  if (error) {
    console.error("[competition-operations] load_failed", { code: error.code, eventId, message: error.message });
    return { data: null as CompetitionOperations | null, error: "Competition operations could not be loaded." };
  }
  return { data: data as unknown as CompetitionOperations, error: null };
}

export function eventDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const serial = new Date(value).getTime();
  if (Number.isNaN(serial)) return "";
  return new Date(serial + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function competitionOperationsMessage(code: string | null | undefined) {
  const messages: Record<string, string> = {
    court_saved: "Court saved.",
    court_deactivated: "Court deactivated.",
    match_scheduled: "Match schedule saved.",
    match_unscheduled: "Match returned to Unscheduled.",
    queue_moved: "Court queue updated.",
    matches_distributed: "Unscheduled matches distributed across active courts.",
    staff_assigned: "Operational staff assigned to the match.",
    staff_removed: "Operational staff removed from the match."
  };
  return code ? messages[code] ?? null : null;
}

export function competitionOperationsError(code: string | null | undefined) {
  const errors: Record<string, string> = {
    competition_operations_access: "Your event role does not allow operational changes.",
    competition_operations_event_not_mutable: "Operations are closed for draft, cancelled, completed, archived or past events.",
    competition_structure_required: "Generate the competition structure before scheduling matches.",
    competition_court_invalid: "Choose a valid active event court and check its details.",
    competition_linked_court_invalid: "That ClubR court is not available to this event organisation.",
    competition_court_duplicate: "Court labels and positions must be unique within this event.",
    competition_court_in_use: "Move or unschedule every match on this court before deactivating it.",
    competition_court_time_conflict: "Another match already starts on that court at this time.",
    competition_time_outside_event: "Choose a start time within the event window.",
    competition_player_time_conflict: "A known player is already scheduled in another match at this time.",
    competition_staff_time_conflict: "An assigned staff member is already scheduled in another match at this time.",
    competition_progression_time_conflict: "Schedule feeder matches before their downstream knockout match.",
    competition_progression_queue_conflict: "That queue order would place a downstream knockout match before its feeder.",
    competition_queue_position_invalid: "Choose a valid position in the court queue.",
    competition_match_not_scheduled: "That match is already unscheduled.",
    competition_match_staff_invalid: "Choose an active event Coach or Official.",
    competition_match_staff_duplicate: "That staff member is already assigned to this match.",
    competition_operations_exist: "Remove match schedules and operational assignments before regenerating structure.",
    competition_courts_required: "Add at least one active event court before distributing matches."
  };
  return code ? errors[code] ?? "The competition operation could not be completed." : null;
}
