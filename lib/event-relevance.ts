import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type { EventStaffRole, JuniorStage } from "@/types/courtside";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type ProfileEventRelevance = {
  event_id: string;
  title: string;
  description: string | null;
  host_id: string;
  host_name: string;
  host_type: string;
  visibility: "closed" | "open";
  junior_stage: Exclude<JuniorStage, "not_sure"> | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  capacity: number | null;
  relevance_kind: "eligible" | "selected";
  relevance_reason: string;
  is_assigned: boolean;
};

export type EventPlayerAssignmentView = {
  assignment_id: string;
  player_profile_id: string;
  player_name: string;
  is_junior: boolean;
  junior_stage: JuniorStage | null;
  assigned_at: string;
};

export type EventPlayerCandidate = {
  player_profile_id: string;
  player_name: string;
  is_junior: boolean;
  junior_stage: JuniorStage | null;
  context_name: string;
};

export type EventStaffAssignmentView = {
  assignment_id: string;
  staff_profile_id: string;
  staff_user_id: string;
  staff_name: string;
  event_role: EventStaffRole;
  organisation_role: string;
  assigned_at: string;
};

export type EventStaffCandidate = {
  membership_id: string;
  staff_profile_id: string;
  staff_user_id: string;
  staff_name: string;
  organisation_role: string;
};

export type MyEventStaffAssignment = {
  assignment_id: string;
  event_id: string;
  event_role: EventStaffRole;
  title: string;
  host_name: string;
  host_type: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
};

export const eventStaffRoles: Array<{ label: string; value: EventStaffRole }> = [
  { label: "Event Manager", value: "event_manager" },
  { label: "Coordinator", value: "coordinator" },
  { label: "Coach", value: "coach" },
  { label: "Official", value: "official" }
];

export function eventStageMatchesProfile(eventStage: string | null, profile: { is_junior: boolean; junior_stage: string | null }) {
  return eventStage === null || (profile.is_junior && profile.junior_stage === eventStage);
}

export function partitionProfileEvents(events: ProfileEventRelevance[]) {
  return {
    selected: events.filter((event) => event.is_assigned),
    connected: events.filter((event) => !event.is_assigned && event.visibility === "closed"),
    open: events.filter((event) => !event.is_assigned && event.visibility === "open")
  };
}

export function eventStaffRoleLabel(role: EventStaffRole | string) {
  return eventStaffRoles.find((option) => option.value === role)?.label ?? role.replaceAll("_", " ");
}

export function allowedEventRolesForOrganisationRole(role: string): EventStaffRole[] {
  const roles: EventStaffRole[] = ["official"];
  if (["organisation_admin", "sports_coordinator", "club_manager"].includes(role)) roles.unshift("event_manager", "coordinator");
  else if (role === "team_manager") roles.unshift("coordinator");
  if (["head_coach", "coach", "assistant_coach"].includes(role)) roles.unshift("coach");
  return roles;
}

export async function loadProfileEventRelevance(supabase: ServerSupabase, profileId: string) {
  const { data, error } = await supabase.rpc("get_profile_event_relevance", { p_player_profile_id: profileId });
  if (error) {
    console.error("[event-relevance] profile_events_load_failed", { code: error.code, profileId });
    return { data: [] as ProfileEventRelevance[], error: "Relevant events could not be loaded." };
  }
  return { data: (data ?? []) as ProfileEventRelevance[], error: null };
}

export async function loadMyEventStaffAssignments(supabase: ServerSupabase) {
  const { data, error } = await supabase.rpc("get_my_event_staff_assignments");
  if (error) {
    console.error("[event-relevance] staff_events_load_failed", { code: error.code });
    return { data: [] as MyEventStaffAssignment[], error: "Assigned staff events could not be loaded." };
  }
  return { data: (data ?? []) as MyEventStaffAssignment[], error: null };
}

export async function loadEventOperations(supabase: ServerSupabase, eventId: string, search = "") {
  const [players, candidates, staff, staffCandidates] = await Promise.all([
    supabase.rpc("get_event_player_assignments", { p_event_id: eventId }),
    supabase.rpc("get_event_assignment_candidates", { p_event_id: eventId, p_search: search || null }),
    supabase.rpc("get_event_staff_assignments", { p_event_id: eventId }),
    supabase.rpc("get_event_staff_candidates", { p_event_id: eventId })
  ]);
  return {
    players: (players.data ?? []) as EventPlayerAssignmentView[],
    playerCandidates: (candidates.data ?? []) as EventPlayerCandidate[],
    staff: (staff.data ?? []) as EventStaffAssignmentView[],
    staffCandidates: (staffCandidates.data ?? []) as EventStaffCandidate[],
    canManagePlayers: !players.error && !candidates.error,
    canManageStaff: !staff.error && !staffCandidates.error,
    error: players.error ?? staff.error
  };
}
