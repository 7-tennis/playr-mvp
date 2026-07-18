import type { AuthenticatedClubRContext } from "@/lib/clubr";
import type {
  ClubMembershipStatus,
  ClubNotice,
  ClubOperationalBlock,
  Court,
  CourtBookingStatus,
  CourtBookingType,
  OrganisationBookingSettings,
  OrganisationRole,
  Profile,
  Venue
} from "@/types/courtside";

export type ClubRDataError = {
  code: string | null;
  message: string;
};

export type ClubRDataResult<T> = {
  data: T;
  error: ClubRDataError | null;
};

export type ClubRCourtOccupancy = {
  booking_id: string;
  court_id: string;
  court_name: string;
  start_time: string;
  end_time: string;
  booking_status: CourtBookingStatus;
  booking_type: CourtBookingType;
  occupancy_type: string;
  source_product: string | null;
  booking_organisation_id: string | null;
  academy_name: string | null;
  session_name: string | null;
  session_type: string | null;
  coach_name: string | null;
};

export type ClubRMember = {
  membership_id: string;
  venue_id: string;
  status: ClubMembershipStatus;
  joined_at: string | null;
  deactivated_at: string | null;
  notes: string | null;
  profile: Pick<
    Profile,
    "id" | "user_id" | "first_name" | "last_name" | "email" | "phone" | "date_of_birth" | "is_junior" | "parent_profile_id" | "created_at"
  >;
  parent: Pick<Profile, "id" | "first_name" | "last_name"> | null;
  roles: OrganisationRole[];
  linked_junior_count: number;
};

export type ClubRBookingDetail = {
  booking_id: string;
  court_id: string;
  court_name: string;
  venue_id: string;
  venue_name: string;
  start_time: string;
  end_time: string;
  booking_status: CourtBookingStatus;
  booking_type: CourtBookingType;
  occupancy_type: string;
  source_product: string | null;
  created_at: string;
  owner_name: string | null;
  coach_name: string | null;
  coach_lesson_id: string | null;
  coach_session_occurrence_id: string | null;
  operational_block_id: string | null;
  operational_block_reason: string | null;
};

export type ClubRMemberBooking = Pick<
  ClubRBookingDetail,
  "booking_id" | "court_id" | "court_name" | "start_time" | "end_time" | "booking_status" | "booking_type" | "source_product"
>;

export type ClubRBookingSettings = OrganisationBookingSettings;
export type ClubRNotice = ClubNotice & { author_name: string | null };

type MemberRow = {
  id: string;
  venue_id: string;
  status: ClubMembershipStatus;
  joined_at: string | null;
  deactivated_at: string | null;
  notes: string | null;
  profile: (ClubRMember["profile"] & { parent: ClubRMember["parent"] }) | null;
};

type RoleRow = {
  venue_id: string;
  profile_id: string;
  role: OrganisationRole;
};

function venueScoped(context: AuthenticatedClubRContext) {
  return context.role !== "platform_admin" && Boolean(context.venueId);
}

function errorResult<T>(fallback: T, error: { code?: string; message?: string } | null, event: string, context: AuthenticatedClubRContext): ClubRDataResult<T> {
  const safeError = {
    code: error?.code ?? null,
    message: "This ClubR information could not be loaded right now."
  };

  console.error(`[clubr] ${event}`, {
    code: error?.code ?? null,
    role: context.role,
    venueId: context.venueId
  });

  return { data: fallback, error: safeError };
}

function success<T>(data: T): ClubRDataResult<T> {
  return { data, error: null };
}

export async function loadClubRCourts(context: AuthenticatedClubRContext): Promise<ClubRDataResult<Court[]>> {
  let query = context.supabase.from("courts").select("*").order("sort_order", { ascending: true });

  if (venueScoped(context) && context.venueId) {
    query = query.eq("venue_id", context.venueId);
  }

  const { data, error } = await query;
  return error ? errorResult([], error, "courts_load_failed", context) : success((data ?? []) as Court[]);
}

export async function loadClubRCourtOccupancy(
  context: AuthenticatedClubRContext,
  startTime: string,
  endTime: string
): Promise<ClubRDataResult<ClubRCourtOccupancy[]>> {
  const { data, error } = await context.supabase.rpc("clubr_court_occupancy_for_range", {
    check_end_time: endTime,
    check_start_time: startTime,
    p_owner_venue_id: context.venueId
  });

  return error
    ? errorResult([], error, "occupancy_load_failed", context)
    : success((data ?? []) as ClubRCourtOccupancy[]);
}

export async function loadClubRMembers(context: AuthenticatedClubRContext): Promise<ClubRDataResult<ClubRMember[]>> {
  let membershipQuery = context.supabase
    .from("club_memberships")
    .select(
      "id,venue_id,status,joined_at,deactivated_at,notes,profile:profile_id(id,user_id,first_name,last_name,email,phone,date_of_birth,is_junior,parent_profile_id,created_at,parent:parent_profile_id(id,first_name,last_name))"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  let roleQuery = context.supabase
    .from("organisation_memberships")
    .select("venue_id,profile_id,role")
    .eq("status", "active")
    .limit(500);

  if (venueScoped(context) && context.venueId) {
    membershipQuery = membershipQuery.eq("venue_id", context.venueId);
    roleQuery = roleQuery.eq("venue_id", context.venueId);
  }

  const [membershipResult, roleResult] = await Promise.all([membershipQuery, roleQuery]);

  if (membershipResult.error) {
    return errorResult([], membershipResult.error, "members_load_failed", context);
  }

  if (roleResult.error) {
    return errorResult([], roleResult.error, "member_roles_load_failed", context);
  }

  const rolesByProfile = new Map<string, OrganisationRole[]>();
  ((roleResult.data ?? []) as RoleRow[]).forEach((row) => {
    const key = `${row.venue_id}:${row.profile_id}`;
    rolesByProfile.set(key, [...(rolesByProfile.get(key) ?? []), row.role]);
  });
  const rows = (membershipResult.data ?? []) as unknown as MemberRow[];
  const juniorCountByParent = new Map<string, number>();

  rows.forEach((row) => {
    if (row.profile?.is_junior && row.profile.parent_profile_id) {
      juniorCountByParent.set(row.profile.parent_profile_id, (juniorCountByParent.get(row.profile.parent_profile_id) ?? 0) + 1);
    }
  });

  const members = rows.flatMap((row) => {
    if (!row.profile) return [];
    const { parent, ...profile } = row.profile;
    return [{
      deactivated_at: row.deactivated_at,
      joined_at: row.joined_at,
      linked_junior_count: juniorCountByParent.get(profile.id) ?? 0,
      membership_id: row.id,
      notes: row.notes,
      parent,
      profile,
      roles: rolesByProfile.get(`${row.venue_id}:${profile.id}`) ?? [],
      status: row.status,
      venue_id: row.venue_id
    } satisfies ClubRMember];
  });

  return success(members);
}

export async function loadClubRMember(context: AuthenticatedClubRContext, membershipId: string): Promise<ClubRDataResult<ClubRMember | null>> {
  const result = await loadClubRMembers(context);
  if (result.error) return { data: null, error: result.error };
  return success(result.data.find((member) => member.membership_id === membershipId) ?? null);
}

export async function loadClubRMemberFamily(context: AuthenticatedClubRContext, member: ClubRMember): Promise<ClubRDataResult<ClubRMember[]>> {
  const members = await loadClubRMembers(context);
  if (members.error) return members;

  const profileId = member.profile.id;
  const parentId = member.profile.parent_profile_id;
  return success(
    members.data.filter((candidate) =>
      candidate.profile.id !== profileId
      && (
        candidate.profile.parent_profile_id === profileId
        || candidate.profile.id === parentId
        || (parentId && candidate.profile.parent_profile_id === parentId)
      )
    )
  );
}

export async function loadClubRMemberBookings(
  context: AuthenticatedClubRContext,
  member: ClubRMember,
  startTime: string,
  endTime: string
): Promise<ClubRDataResult<ClubRMemberBooking[]>> {
  const { data, error } = await context.supabase.rpc("clubr_member_bookings", {
    p_end_time: endTime,
    p_profile_id: member.profile.id,
    p_start_time: startTime,
    p_venue_id: member.venue_id
  });
  return error
    ? errorResult([], error, "member_bookings_load_failed", context)
    : success((data ?? []) as ClubRMemberBooking[]);
}

export async function loadClubRNotices(context: AuthenticatedClubRContext): Promise<ClubRDataResult<ClubRNotice[]>> {
  let query = context.supabase.from("club_notices").select("*").order("created_at", { ascending: false }).limit(100);
  if (venueScoped(context) && context.venueId) query = query.eq("venue_id", context.venueId);
  const { data, error } = await query;
  if (error) return errorResult([], error, "notices_load_failed", context);
  const notices = (data ?? []) as ClubNotice[];
  const authorIds = Array.from(new Set(notices.map((notice) => notice.created_by_user_id)));
  const authors = authorIds.length > 0
    ? await context.supabase.from("profiles").select("user_id,first_name,last_name").in("user_id", authorIds)
    : { data: [], error: null };
  if (authors.error) return errorResult([], authors.error, "notice_authors_load_failed", context);
  const authorNames = new Map(((authors.data ?? []) as Pick<Profile, "user_id" | "first_name" | "last_name">[]).map((author) => [author.user_id, `${author.first_name} ${author.last_name}`]));
  return success(notices.map((notice) => ({ ...notice, author_name: authorNames.get(notice.created_by_user_id) ?? null })));
}

export async function loadClubROperationalBlocks(context: AuthenticatedClubRContext): Promise<ClubRDataResult<ClubOperationalBlock[]>> {
  let query = context.supabase.from("club_operational_blocks").select("*").order("created_at", { ascending: false }).limit(120);
  if (venueScoped(context) && context.venueId) query = query.eq("venue_id", context.venueId);
  const { data, error } = await query;
  return error ? errorResult([], error, "operational_blocks_load_failed", context) : success((data ?? []) as ClubOperationalBlock[]);
}

export async function loadClubRBookingSettings(
  context: AuthenticatedClubRContext,
  venueId = context.venueId
): Promise<ClubRDataResult<ClubRBookingSettings | null>> {
  if (!venueId) return success(null);
  const { data, error } = await context.supabase.from("organisation_booking_settings").select("*").eq("venue_id", venueId).maybeSingle();
  return error ? errorResult(null, error, "booking_settings_load_failed", context) : success((data as ClubRBookingSettings | null) ?? null);
}

export async function loadClubRBookingDetail(context: AuthenticatedClubRContext, bookingId: string): Promise<ClubRDataResult<ClubRBookingDetail | null>> {
  const { data, error } = await context.supabase.rpc("clubr_booking_detail", { p_booking_id: bookingId });
  if (error) return errorResult(null, error, "booking_detail_load_failed", context);
  const row = ((data ?? []) as ClubRBookingDetail[])[0] ?? null;
  return success(row);
}

export async function loadClubRBlockConflicts(
  context: AuthenticatedClubRContext,
  courtId: string,
  startTime: string,
  endTime: string
) {
  if (!context.venueId) return success([] as { booking_id: string; start_time: string; end_time: string; occupancy_type: string; description: string }[]);
  const { data, error } = await context.supabase.rpc("clubr_operational_block_conflicts", {
    p_court_id: courtId,
    p_end_time: endTime,
    p_start_time: startTime,
    p_venue_id: context.venueId
  });
  return error
    ? errorResult([], error, "block_conflicts_load_failed", context)
    : success((data ?? []) as { booking_id: string; start_time: string; end_time: string; occupancy_type: string; description: string }[]);
}

export function noticeIsActive(notice: Pick<ClubNotice, "is_active" | "starts_at" | "ends_at">, now = new Date()) {
  const nowMs = now.getTime();
  return notice.is_active
    && (!notice.starts_at || new Date(notice.starts_at).getTime() <= nowMs)
    && (!notice.ends_at || new Date(notice.ends_at).getTime() > nowMs);
}

export function occupancySourceLabel(booking: Pick<ClubRCourtOccupancy, "occupancy_type">) {
  switch (booking.occupancy_type) {
    case "coaching_session": return "CoachR";
    case "coaching_lesson": return "CoachR";
    case "member_booking": return "Member";
    case "maintenance": return "Maintenance";
    case "club_programme": return "Club";
    case "event": return "Event";
    default: return "Club";
  }
}

export function occupancyDescription(booking: ClubRCourtOccupancy) {
  if (booking.occupancy_type === "coaching_session") {
    return booking.session_name ?? "CoachR Session";
  }
  if (booking.occupancy_type === "coaching_lesson") {
    return booking.coach_name ? `Coach Lesson · ${booking.coach_name}` : "Coach Lesson";
  }
  if (booking.occupancy_type === "member_booking") return "Member Booking";
  if (booking.occupancy_type === "maintenance") return "Maintenance";
  if (booking.occupancy_type === "club_programme") return "Club Operations";
  return "Occupied";
}
