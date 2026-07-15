import type { PermissionContext } from "@/lib/permissions";
import type {
  CoachLessonLocationType,
  CoachSession,
  CoachSessionAttendance,
  CoachSessionAttendanceStatus,
  CoachSessionOccurrence,
  CoachSessionParticipantStatus,
  CoachSessionType,
  Profile
} from "@/types/courtside";

type AuthenticatedContext = Extract<PermissionContext, { kind: "authenticated" }>;

export type CoachSessionProfile = Pick<
  Profile,
  "id" | "first_name" | "last_name" | "is_junior" | "parent_profile_id" | "junior_stage" | "player_level"
>;

export type CoachSessionParticipantWithProfile = {
  id: string;
  player_profile_id: string;
  parent_profile_id: string | null;
  status: CoachSessionParticipantStatus;
  joined_on: string;
  ends_on: string | null;
  player: CoachSessionProfile | null;
};

export type CoachSessionCoachWithProfile = {
  id: string;
  coach_profile_id: string;
  role: "primary" | "assistant";
  status: "active" | "removed";
  coach: CoachSessionProfile | null;
};

export type CoachSessionCourtWithCourt = {
  id: string;
  court_id: string;
  sort_order: number;
  court: { id: string; name: string; venue_id: string | null; owner: { name: string } | null } | null;
};

export type CoachSessionWithRelations = CoachSession & {
  primary_coach: CoachSessionProfile | null;
  participants: CoachSessionParticipantWithProfile[];
  coaches: CoachSessionCoachWithProfile[];
  courts: CoachSessionCourtWithCourt[];
  venue: { id: string; name: string } | null;
  external_venue: { id: string; name: string } | null;
};

export type CoachSessionAttendanceWithProfile = CoachSessionAttendance & {
  player: CoachSessionProfile | null;
};

export type CoachSessionOccurrenceCourt = {
  id: string;
  court_id: string;
  court_booking_id: string;
  court: { id: string; name: string } | null;
  booking: { id: string; status: "confirmed" | "cancelled" } | null;
};

export type CoachSessionOccurrenceWithRelations = CoachSessionOccurrence & {
  session: CoachSessionWithRelations | null;
  attendance: CoachSessionAttendanceWithProfile[];
  court_links: CoachSessionOccurrenceCourt[];
};

export type PrivatePlayerSession = {
  session_id: string;
  academy_id: string;
  academy_name: string;
  session_name: string;
  session_type: CoachSessionType;
  coach_name: string;
  next_start_time: string | null;
  location_name: string | null;
  participant_status: CoachSessionParticipantStatus;
};

export const coachSessionTypes: CoachSessionType[] = ["private", "semi_private", "squad"];
export const coachSessionAttendanceStatuses: CoachSessionAttendanceStatus[] = ["present", "absent", "excused", "late", "not_recorded"];

const sessionSelect = `
  id,
  venue_id,
  session_type,
  name,
  description,
  primary_coach_id,
  capacity,
  status,
  repeat_mode,
  weekday,
  start_local_time,
  duration_minutes,
  start_date,
  end_mode,
  end_date,
  occurrence_count,
  generated_through,
  location_type,
  external_venue_id,
  custom_location,
  notes,
  created_by_user_id,
  updated_by_user_id,
  ended_by_user_id,
  ended_at,
  created_at,
  updated_at,
  venue:venue_id(id,name),
  primary_coach:primary_coach_id(id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level),
  external_venue:external_venue_id(id,name),
  coaches:coach_session_coaches(
    id,
    coach_profile_id,
    role,
    status,
    coach:coach_profile_id(id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)
  ),
  participants:coach_session_participants(
    id,
    player_profile_id,
    parent_profile_id,
    status,
    joined_on,
    ends_on,
    player:player_profile_id(id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)
  ),
  courts:coach_session_courts(
    id,
    court_id,
    sort_order,
    court:court_id(id,name,venue_id,owner:venue_id(name))
  )
`;

const occurrenceSelect = `
  id,
  session_id,
  occurrence_date,
  start_time,
  end_time,
  status,
  cancellation_reason,
  cancelled_at,
  cancelled_by_user_id,
  created_at,
  updated_at,
  session:session_id(${sessionSelect}),
  attendance:coach_session_attendance(
    id,
    occurrence_id,
    player_profile_id,
    attendance_status,
    recorded_by_user_id,
    recorded_at,
    notes,
    created_at,
    updated_at,
    player:player_profile_id(id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level)
  ),
  court_links:coach_session_occurrence_courts(
    id,
    court_id,
    court_booking_id,
    court:court_id(id,name),
    booking:court_booking_id(id,status)
  )
`;

function johannesburgDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Johannesburg",
    year: "numeric"
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function coachSessionTypeLabel(value: CoachSessionType) {
  switch (value) {
    case "private":
      return "Private";
    case "semi_private":
      return "Semi-private";
    case "squad":
      return "Squad";
  }
}

export function coachSessionLocation(session: Pick<CoachSessionWithRelations, "courts" | "custom_location" | "external_venue" | "location_type">) {
  if (session.location_type === "custom") {
    return session.external_venue?.name ?? session.custom_location ?? "Off-site";
  }
  if (session.location_type === "none") {
    return "No court";
  }
  const names = session.courts
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.court?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Court to be confirmed";
}

export function activeSessionParticipants(session: Pick<CoachSessionWithRelations, "participants">) {
  return session.participants.filter((participant) => participant.status === "active");
}

export async function topUpCoachSessions(context: AuthenticatedContext, through: Date) {
  const venueId = context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
  if (!venueId) return;

  const { error } = await context.supabase.rpc("coachr_top_up_sessions", {
    p_through_date: johannesburgDate(through),
    p_venue_id: venueId
  });
  if (error && error.code !== "PGRST202") {
    console.warn("CoachR session rolling generation could not run", {
      code: error.code,
      role: context.role,
      venueId
    });
  }
}

export async function loadCoachSessions(context: AuthenticatedContext, limit = 120) {
  const venueId = context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
  let query = context.supabase.from("coach_sessions").select(sessionSelect).order("start_date", { ascending: true }).limit(limit);
  if (context.role !== "platform_admin" && venueId) query = query.eq("venue_id", venueId);

  const { data, error } = await query;
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("CoachR sessions could not be loaded", { code: error.code, role: context.role, venueId });
    }
    return [] as CoachSessionWithRelations[];
  }
  return (data ?? []) as unknown as CoachSessionWithRelations[];
}

export async function loadCoachSessionOccurrencesForRange(
  context: AuthenticatedContext,
  startTime: string,
  endTime: string,
  limit = 240
) {
  await topUpCoachSessions(context, new Date(endTime));
  const { data, error } = await context.supabase
    .from("coach_session_occurrences")
    .select(occurrenceSelect)
    .gte("start_time", startTime)
    .lt("start_time", endTime)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") {
      console.error("CoachR session occurrences could not be loaded", { code: error.code, role: context.role });
    }
    return [] as CoachSessionOccurrenceWithRelations[];
  }
  return (data ?? []) as unknown as CoachSessionOccurrenceWithRelations[];
}

export async function loadPrivatePlayerSessions(context: AuthenticatedContext, playerProfileId: string) {
  const { data, error } = await context.supabase.rpc("coachr_private_player_sessions", {
    p_player_profile_id: playerProfileId
  });
  if (error) {
    if (error.code !== "PGRST202") {
      console.error("Private academy sessions could not be loaded", {
        code: error.code,
        playerProfileId,
        userId: context.user.id
      });
    }
    return [] as PrivatePlayerSession[];
  }
  return (data ?? []) as PrivatePlayerSession[];
}

export function sessionAttendanceSummary(occurrence: CoachSessionOccurrenceWithRelations) {
  const activePlayers = activeSessionParticipants(occurrence.session ?? { participants: [] });
  const marked = occurrence.attendance.filter((row) => row.attendance_status !== "not_recorded").length;
  return { due: Math.max(0, activePlayers.length - marked), marked, total: activePlayers.length };
}

export function sessionLocationTypeLabel(value: CoachLessonLocationType) {
  if (value === "managed_court") return "Managed court";
  if (value === "custom") return "Off-site";
  return "No court";
}
