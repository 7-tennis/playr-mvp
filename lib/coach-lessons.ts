import type { PermissionContext } from "@/lib/permissions";
import type {
  CoachLesson,
  CoachLessonAttendance,
  CoachLessonAttendanceStatus,
  CoachLessonAttendanceResult,
  CoachLessonFeedbackStatus,
  CoachLessonStatus,
  CoachLessonType,
  Court,
  CourtBooking,
  Profile,
  Venue
} from "@/types/courtside";

export const coachLessonTypes: CoachLessonType[] = ["private", "group", "squad", "matchplay", "assessment", "other"];
export const coachLessonStatuses: CoachLessonStatus[] = ["scheduled", "completed", "missed", "cancelled", "rain", "sick"];
export const coachLessonAttendanceStatuses: CoachLessonAttendanceStatus[] = ["not_marked", "attended", "partial", "missed", "excused"];
export const coachLessonAttendanceResults: CoachLessonAttendanceResult[] = ["attended", "missed", "cancelled", "rain", "sick"];
export const coachLessonFeedbackStatuses: CoachLessonFeedbackStatus[] = ["not_started", "draft", "shared", "completed"];

export type CoachLessonProfile = Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "is_junior" | "parent_profile_id" | "junior_stage" | "player_level">;
export type CoachLessonVenue = Pick<Venue, "id" | "name">;
export type CoachLessonCourt = Pick<Court, "id" | "name" | "venue_id">;
export type CoachLessonBooking = Pick<CourtBooking, "id" | "start_time" | "end_time" | "status">;
export type CoachLessonAttendanceWithProfile = CoachLessonAttendance & {
  player: CoachLessonProfile | null;
  junior: CoachLessonProfile | null;
};

export type CoachLessonWithRelations = CoachLesson & {
  coach: CoachLessonProfile | null;
  player: CoachLessonProfile | null;
  junior: CoachLessonProfile | null;
  parent: CoachLessonProfile | null;
  court: CoachLessonCourt | null;
  venue: CoachLessonVenue | null;
  court_booking: CoachLessonBooking | null;
  attendance: CoachLessonAttendanceWithProfile[] | null;
};

export type CoachLessonOptionData = {
  coachProfiles: CoachLessonProfile[];
  playerProfiles: CoachLessonProfile[];
  courts: CoachLessonCourt[];
  venues: CoachLessonVenue[];
};

type AuthenticatedContext = Extract<PermissionContext, { kind: "authenticated" }>;

const coachLessonSelect = `
  id,
  venue_id,
  coach_id,
  player_id,
  junior_profile_id,
  parent_id,
  court_id,
  court_booking_id,
  lesson_type,
  title,
  start_time,
  end_time,
  repeat_rule,
  recurring_group_id,
  status,
  attendance_status,
  feedback_status,
  notes,
  created_by_user_id,
  updated_by_user_id,
  cancelled_at,
  cancelled_by_user_id,
  created_at,
  updated_at,
  coach:coach_id(id,first_name,last_name,is_junior,parent_profile_id),
  player:player_id(id,first_name,last_name,is_junior,parent_profile_id),
  junior:junior_profile_id(id,first_name,last_name,is_junior,parent_profile_id),
  parent:parent_id(id,first_name,last_name,is_junior,parent_profile_id),
  court:court_id(id,name,venue_id),
  venue:venue_id(id,name),
  court_booking:court_booking_id(id,start_time,end_time,status),
  attendance:coach_lesson_attendance(
    id,
    lesson_id,
    player_profile_id,
    junior_profile_id,
    attendance_status,
    recorded_by_user_id,
    recorded_at,
    notes,
    created_at,
    updated_at,
    player:player_profile_id(id,first_name,last_name,is_junior,parent_profile_id),
    junior:junior_profile_id(id,first_name,last_name,is_junior,parent_profile_id)
  )
`;

export function profileDisplayName(profile: Pick<Profile, "first_name" | "last_name"> | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile to be confirmed";
}

export function canUseCoachLessonVenue(context: AuthenticatedContext, venueId: string | null | undefined) {
  if (context.role === "platform_admin") {
    return Boolean(venueId);
  }

  return Boolean(context.venueId && venueId && context.venueId === venueId);
}

export function canUseCoachForLesson(context: AuthenticatedContext, coachId: string | null | undefined) {
  if (context.role === "coach") {
    return Boolean(context.adultProfileId && coachId && coachId === context.adultProfileId);
  }

  return Boolean(coachId);
}

export async function loadCoachLessons(context: AuthenticatedContext, limit = 40) {
  if (context.role !== "platform_admin" && !context.venueId) {
    return [] as CoachLessonWithRelations[];
  }

  let query = context.supabase
    .from("coach_lessons")
    .select(coachLessonSelect)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (context.role === "coach") {
    if (!context.adultProfileId) {
      return [] as CoachLessonWithRelations[];
    }
    query = query.eq("coach_id", context.adultProfileId);
  } else if (context.role !== "platform_admin" && context.venueId) {
    query = query.eq("venue_id", context.venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("CoachR lessons could not be loaded", { error, role: context.role, venueId: context.venueId });
    return [] as CoachLessonWithRelations[];
  }

  return (data ?? []) as unknown as CoachLessonWithRelations[];
}

export async function loadCoachLessonsForRange(context: AuthenticatedContext, startTime: string, endTime: string, limit = 160) {
  if (context.role !== "platform_admin" && !context.venueId) {
    return [] as CoachLessonWithRelations[];
  }

  let query = context.supabase
    .from("coach_lessons")
    .select(coachLessonSelect)
    .gte("start_time", startTime)
    .lt("start_time", endTime)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (context.role === "coach") {
    if (!context.adultProfileId) {
      return [] as CoachLessonWithRelations[];
    }
    query = query.eq("coach_id", context.adultProfileId);
  } else if (context.role !== "platform_admin" && context.venueId) {
    query = query.eq("venue_id", context.venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("CoachR lessons could not be loaded for range", { error, role: context.role, venueId: context.venueId });
    return [] as CoachLessonWithRelations[];
  }

  return (data ?? []) as unknown as CoachLessonWithRelations[];
}

export async function loadCoachLessonOptions(context: AuthenticatedContext): Promise<CoachLessonOptionData> {
  const coachRoleQuery =
    context.role === "platform_admin"
      ? context.supabase.from("admin_users").select("user_id,venue_id,role").in("role", ["coach", "head_coach"]).is("deactivated_at", null).limit(160)
      : context.venueId
        ? context.supabase
            .from("admin_users")
            .select("user_id,venue_id,role")
            .in("role", ["coach", "head_coach"])
            .eq("venue_id", context.venueId)
            .is("deactivated_at", null)
            .limit(160)
        : null;
  const coachMembershipQuery =
    context.role === "platform_admin"
      ? context.supabase
          .from("organisation_memberships")
          .select("profile_id,user_id,venue_id,role,status")
          .in("role", ["head_coach", "coach", "assistant_coach"])
          .eq("status", "active")
          .limit(220)
      : context.venueId
        ? context.supabase
            .from("organisation_memberships")
            .select("profile_id,user_id,venue_id,role,status")
            .in("role", ["head_coach", "coach", "assistant_coach"])
            .eq("status", "active")
            .eq("venue_id", context.venueId)
            .limit(220)
        : null;
  const linkedPlayerQuery =
    context.role === "platform_admin"
      ? null
      : context.venueId
        ? context.supabase.from("organisation_player_links").select("player_profile_id").eq("venue_id", context.venueId).eq("status", "active").limit(240)
        : null;
  const assignedPlayerQuery =
    context.role === "platform_admin"
      ? null
      : context.role === "coach" && context.adultProfileId
        ? context.supabase.from("coach_player_assignments").select("player_profile_id").eq("coach_profile_id", context.adultProfileId).eq("status", "active").limit(240)
        : context.venueId
          ? context.supabase.from("coach_player_assignments").select("player_profile_id").eq("venue_id", context.venueId).eq("status", "active").limit(240)
          : null;

  const [ownCoachProfileResult, coachRolesResult, coachMembershipsResult, linkedPlayersResult, assignedPlayersResult, courtsResult, venuesResult] = await Promise.all([
    context.adultProfileId
      ? context.supabase
          .from("profiles")
          .select("id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level")
          .eq("id", context.adultProfileId)
          .eq("is_junior", false)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    coachRoleQuery ?? Promise.resolve({ data: [], error: null }),
    coachMembershipQuery ?? Promise.resolve({ data: [], error: null }),
    linkedPlayerQuery ?? Promise.resolve({ data: [], error: null }),
    assignedPlayerQuery ?? Promise.resolve({ data: [], error: null }),
    context.venueId && context.role !== "platform_admin"
      ? context.supabase.from("courts").select("id,name,venue_id").eq("venue_id", context.venueId).eq("status", "active").order("sort_order", { ascending: true })
      : context.supabase.from("courts").select("id,name,venue_id").eq("status", "active").order("sort_order", { ascending: true }),
    context.venueId && context.role !== "platform_admin"
      ? context.supabase.from("venues").select("id,name").eq("id", context.venueId).order("name", { ascending: true })
      : context.supabase.from("venues").select("id,name").eq("status", "active").order("name", { ascending: true })
  ]);

  const ownCoachProfile = (ownCoachProfileResult.data as CoachLessonProfile | null) ?? null;
  const coachUserIds = Array.from(new Set(((coachRolesResult.data ?? []) as { user_id: string | null }[]).map((row) => row.user_id).filter(Boolean) as string[]));
  const coachProfileIds = Array.from(new Set(((coachMembershipsResult.data ?? []) as { profile_id: string | null }[]).map((row) => row.profile_id).filter(Boolean) as string[]));
  const coachProfilesResult =
    context.role === "coach"
      ? { data: ownCoachProfile ? [ownCoachProfile] : [], error: null }
      : coachUserIds.length > 0 || coachProfileIds.length > 0
        ? await context.supabase
            .from("profiles")
            .select("id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level")
            .or(
              [
                coachUserIds.length > 0 ? `user_id.in.(${coachUserIds.join(",")})` : null,
                coachProfileIds.length > 0 ? `id.in.(${coachProfileIds.join(",")})` : null
              ]
                .filter(Boolean)
                .join(",")
            )
            .eq("is_junior", false)
            .order("first_name", { ascending: true })
            .limit(220)
        : { data: [], error: null };
  const playerProfileIds = Array.from(
    new Set([
      ...(((linkedPlayersResult.data ?? []) as { player_profile_id: string | null }[]).map((row) => row.player_profile_id).filter(Boolean) as string[]),
      ...(((assignedPlayersResult.data ?? []) as { player_profile_id: string | null }[]).map((row) => row.player_profile_id).filter(Boolean) as string[])
    ])
  );
  const playerProfilesResult =
    context.role === "platform_admin"
      ? await context.supabase
          .from("profiles")
          .select("id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level")
          .order("first_name", { ascending: true })
          .limit(160)
      : playerProfileIds.length > 0
        ? await context.supabase
            .from("profiles")
            .select("id,user_id,first_name,last_name,is_junior,parent_profile_id,junior_stage,player_level")
            .in("id", playerProfileIds)
            .order("first_name", { ascending: true })
            .limit(220)
        : { data: [], error: null };

  return {
    coachProfiles: ((coachProfilesResult.data ?? []) as CoachLessonProfile[]) ?? [],
    playerProfiles: ((playerProfilesResult.data ?? []) as CoachLessonProfile[]) ?? [],
    courts: ((courtsResult.data ?? []) as CoachLessonCourt[]) ?? [],
    venues: ((venuesResult.data ?? []) as CoachLessonVenue[]) ?? []
  };
}

export function upcomingCoachLessons(lessons: CoachLessonWithRelations[]) {
  const now = Date.now();
  return lessons.filter((lesson) => new Date(lesson.start_time).getTime() >= now && lesson.status === "scheduled");
}

export function lessonAttendanceRows(lesson: CoachLessonWithRelations) {
  return lesson.attendance ?? [];
}

export function hasAttendanceRecorded(lesson: CoachLessonWithRelations) {
  return lessonAttendanceRows(lesson).length > 0 || lesson.attendance_status !== "not_marked" || lesson.status !== "scheduled";
}

export function attendanceResultLabel(status: CoachLessonAttendanceResult) {
  switch (status) {
    case "attended":
      return "Attended";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    case "rain":
      return "Rain";
    case "sick":
      return "Sick";
  }
}

export function attendanceResultTone(status: CoachLessonAttendanceResult) {
  switch (status) {
    case "attended":
      return "ui-chip-success";
    case "missed":
      return "bg-rose-50 text-rose-700";
    case "cancelled":
    case "rain":
    case "sick":
      return "ui-chip-warning";
  }
}

export function lessonHasAttendanceResult(lesson: CoachLessonWithRelations, status: CoachLessonAttendanceResult) {
  const rows = lessonAttendanceRows(lesson);

  if (rows.length > 0) {
    return rows.some((row) => row.attendance_status === status);
  }

  if (status === "attended") {
    return lesson.status === "completed" || lesson.attendance_status === "attended";
  }
  if (status === "missed") {
    return lesson.status === "missed" || lesson.attendance_status === "missed";
  }

  return lesson.status === status;
}

export function lessonNeedsAttendance(lesson: CoachLessonWithRelations, now = Date.now()) {
  return lesson.status === "scheduled" && new Date(lesson.end_time).getTime() <= now && lessonAttendanceRows(lesson).length === 0;
}

export function lessonStatusTone(status: CoachLessonStatus) {
  switch (status) {
    case "completed":
      return "ui-chip-success";
    case "cancelled":
    case "rain":
    case "sick":
      return "ui-chip-warning";
    case "missed":
      return "bg-rose-50 text-rose-700";
    default:
      return "ui-chip-brand";
  }
}
