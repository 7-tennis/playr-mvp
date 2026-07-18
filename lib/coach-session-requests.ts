import type { SupabaseClient } from "@supabase/supabase-js";
import type { PermissionContext } from "@/lib/permissions";
import type {
  CoachSessionRequestStatus,
  CoachSessionRescheduleRequest,
  Profile
} from "@/types/courtside";

type AuthenticatedContext = Extract<PermissionContext, { kind: "authenticated" }>;

type RequestProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior">;

export type CoachSessionRequestWithRelations = CoachSessionRescheduleRequest & {
  player: RequestProfile | null;
  coach: RequestProfile | null;
  current_venue: { id: string; name: string } | null;
  proposed_venue: { id: string; name: string } | null;
  proposed_court: { id: string; name: string } | null;
  occurrence: {
    id: string;
    status: string;
    cancellation_reason: string | null;
    session: {
      id: string;
      name: string;
      session_type: "private" | "semi_private" | "squad";
      duration_minutes: number;
      repeat_mode: "none" | "weekly";
    } | null;
  } | null;
};

export type PrivatePlayerSessionActivity = {
  occurrence_id: string;
  session_id: string;
  session_name: string;
  session_type: "private" | "semi_private" | "squad";
  coach_name: string | null;
  venue_name: string;
  start_time: string;
  end_time: string;
  occurrence_status: "scheduled" | "completed" | "cancelled" | "rain" | "sick";
  cancellation_reason: string | null;
  court_names: string[];
};

export type SessionAvailabilityOption = {
  court_id: string;
  court_name: string;
  venue_id: string;
  venue_name: string;
  start_time: string;
  end_time: string;
  availability_state: "available";
};

export const pendingSessionRequestStatuses: CoachSessionRequestStatus[] = [
  "pending_parent",
  "pending_player",
  "pending_coach"
];

const requestSelect = `
  id,
  venue_id,
  occurrence_id,
  requested_by_user_id,
  request_origin,
  player_profile_id,
  responder_user_id,
  coach_profile_id,
  current_start_time,
  current_end_time,
  current_venue_id,
  current_court_ids,
  current_court_names,
  current_booking_ids,
  proposed_start_time,
  proposed_end_time,
  proposed_venue_id,
  proposed_court_id,
  status,
  message,
  response_message,
  responded_by_user_id,
  responded_at,
  approval_error,
  replacement_occurrence_id,
  expires_at,
  created_at,
  updated_at,
  player:player_profile_id(id,first_name,last_name,is_junior),
  coach:coach_profile_id(id,first_name,last_name,is_junior),
  current_venue:current_venue_id(id,name),
  proposed_venue:proposed_venue_id(id,name),
  proposed_court:proposed_court_id(id,name),
  occurrence:occurrence_id(
    id,
    status,
    cancellation_reason,
    session:session_id(id,name,session_type,duration_minutes,repeat_mode)
  )
`;

export function requestProfileName(profile: RequestProfile | null) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Player";
}

export function isPendingSessionRequest(status: CoachSessionRequestStatus) {
  return pendingSessionRequestStatuses.includes(status);
}

export async function loadCoachSessionRequests(context: AuthenticatedContext, limit = 60) {
  const venueId = context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
  let query = context.supabase
    .from("coach_session_reschedule_requests")
    .select(requestSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (context.role !== "platform_admin" && venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("CoachR session requests could not be loaded", {
        code: error.code,
        role: context.role,
        venueId
      });
    }
    return [] as CoachSessionRequestWithRelations[];
  }

  return (data ?? []) as unknown as CoachSessionRequestWithRelations[];
}

export async function loadPlayerSessionRequests(
  supabase: SupabaseClient,
  playerProfileIds: string[],
  limit = 60
) {
  if (playerProfileIds.length === 0) return [] as CoachSessionRequestWithRelations[];

  const { data, error } = await supabase
    .from("coach_session_reschedule_requests")
    .select(requestSelect)
    .in("player_profile_id", playerProfileIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("Player session requests could not be loaded", {
        code: error.code,
        playerProfileIds
      });
    }
    return [] as CoachSessionRequestWithRelations[];
  }

  return (data ?? []) as unknown as CoachSessionRequestWithRelations[];
}

export async function loadPrivatePlayerSessionActivity(
  supabase: SupabaseClient,
  playerProfileId: string
) {
  const { data, error } = await supabase.rpc("coachr_private_player_session_activity", {
    p_player_profile_id: playerProfileId
  });

  if (error) {
    if (error.code !== "PGRST202") {
      console.error("Private player session activity could not be loaded", {
        code: error.code,
        playerProfileId
      });
    }
    return [] as PrivatePlayerSessionActivity[];
  }

  return (data ?? []) as PrivatePlayerSessionActivity[];
}
