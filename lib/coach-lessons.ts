import type { PermissionContext } from "@/lib/permissions";
import type {
  CoachLesson,
  CoachLessonAttendanceStatus,
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
export const coachLessonFeedbackStatuses: CoachLessonFeedbackStatus[] = ["not_started", "draft", "shared", "completed"];

export type CoachLessonProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "parent_profile_id">;
export type CoachLessonVenue = Pick<Venue, "id" | "name">;
export type CoachLessonCourt = Pick<Court, "id" | "name" | "venue_id">;
export type CoachLessonBooking = Pick<CourtBooking, "id" | "start_time" | "end_time" | "status">;

export type CoachLessonWithRelations = CoachLesson & {
  coach: CoachLessonProfile | null;
  player: CoachLessonProfile | null;
  junior: CoachLessonProfile | null;
  parent: CoachLessonProfile | null;
  court: CoachLessonCourt | null;
  venue: CoachLessonVenue | null;
  court_booking: CoachLessonBooking | null;
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
  court_booking:court_booking_id(id,start_time,end_time,status)
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

export async function loadCoachLessonOptions(context: AuthenticatedContext): Promise<CoachLessonOptionData> {
  const [coachProfilesResult, playerProfilesResult, courtsResult, venuesResult] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("id,first_name,last_name,is_junior,parent_profile_id")
      .eq("is_junior", false)
      .order("first_name", { ascending: true })
      .limit(80),
    context.supabase
      .from("profiles")
      .select("id,first_name,last_name,is_junior,parent_profile_id")
      .order("first_name", { ascending: true })
      .limit(120),
    context.venueId && context.role !== "platform_admin"
      ? context.supabase.from("courts").select("id,name,venue_id").eq("venue_id", context.venueId).eq("status", "active").order("sort_order", { ascending: true })
      : context.supabase.from("courts").select("id,name,venue_id").eq("status", "active").order("sort_order", { ascending: true }),
    context.venueId && context.role !== "platform_admin"
      ? context.supabase.from("venues").select("id,name").eq("id", context.venueId).order("name", { ascending: true })
      : context.supabase.from("venues").select("id,name").eq("status", "active").order("name", { ascending: true })
  ]);

  const ownCoachProfile = context.adultProfileId
    ? ((coachProfilesResult.data ?? []) as CoachLessonProfile[]).find((profile) => profile.id === context.adultProfileId) ?? null
    : null;

  return {
    coachProfiles:
      context.role === "coach" && ownCoachProfile
        ? [ownCoachProfile]
        : (((coachProfilesResult.data ?? []) as CoachLessonProfile[]) ?? []),
    playerProfiles: ((playerProfilesResult.data ?? []) as CoachLessonProfile[]) ?? [],
    courts: ((courtsResult.data ?? []) as CoachLessonCourt[]) ?? [],
    venues: ((venuesResult.data ?? []) as CoachLessonVenue[]) ?? []
  };
}

export function upcomingCoachLessons(lessons: CoachLessonWithRelations[]) {
  const now = Date.now();
  return lessons.filter((lesson) => new Date(lesson.start_time).getTime() >= now && lesson.status === "scheduled");
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
