import type { AuthenticatedClubRContext } from "@/lib/clubr";
import type { Court, CourtBooking, CourtBookingStatus, CourtBookingType, CourtSideEvent, EventEntry, Profile, Venue } from "@/types/courtside";

export type ClubRBooking = CourtBooking & {
  courts: (Pick<Court, "id" | "name" | "venue_id"> & { venues: Pick<Venue, "name"> | null }) | null;
  profiles: Pick<Profile, "id" | "first_name" | "last_name" | "email" | "is_junior" | "member_status"> | null;
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

export type ClubRMember = Pick<
  Profile,
  "id" | "first_name" | "last_name" | "email" | "phone" | "is_junior" | "parent_profile_id" | "member_status" | "created_at"
> & {
  parent: Pick<Profile, "first_name" | "last_name"> | null;
};

export type ClubREvent = CourtSideEvent & {
  entry_count?: number | null;
};

const bookingSelect =
  "*,courts:court_id!inner(id,name,venue_id,venues:venue_id(name)),profiles:player_profile_id(id,first_name,last_name,email,is_junior,member_status)";

function hasVenueScope(context: AuthenticatedClubRContext) {
  return context.role === "club_admin" && Boolean(context.venueId);
}

function eventMatchesVenue(event: Pick<CourtSideEvent, "location" | "title">, venue: Pick<Venue, "name" | "slug"> | null) {
  if (!venue) {
    return false;
  }

  const haystack = `${event.location ?? ""} ${event.title}`.toLowerCase();
  return haystack.includes(venue.name.toLowerCase()) || haystack.includes(venue.slug.toLowerCase());
}

export async function loadClubRCourts(context: AuthenticatedClubRContext) {
  let query = context.supabase.from("courts").select("*").order("sort_order", { ascending: true });

  if (hasVenueScope(context) && context.venueId) {
    query = query.eq("venue_id", context.venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ClubR courts could not be loaded", { error, role: context.role, venueId: context.venueId });
  }

  return ((data ?? []) as Court[]) ?? [];
}

export async function loadClubRBookings(context: AuthenticatedClubRContext, startTime: string, endTime: string, limit = 120) {
  let query = context.supabase
    .from("court_bookings")
    .select(bookingSelect)
    .gte("start_time", startTime)
    .lt("start_time", endTime)
    .order("start_time", { ascending: true })
    .limit(limit);

  if (hasVenueScope(context) && context.venueId) {
    query = query.eq("courts.venue_id", context.venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ClubR bookings could not be loaded", { error, role: context.role, venueId: context.venueId });
  }

  return ((data ?? []) as unknown as ClubRBooking[]) ?? [];
}

export async function loadClubRCourtOccupancy(context: AuthenticatedClubRContext, startTime: string, endTime: string) {
  const { data, error } = await context.supabase.rpc("clubr_court_occupancy_for_range", {
    check_end_time: endTime,
    check_start_time: startTime,
    p_owner_venue_id: context.venueId
  });

  if (error) {
    console.error("ClubR court occupancy could not be loaded", {
      code: error.code,
      role: context.role,
      venueId: context.venueId
    });
    return [] as ClubRCourtOccupancy[];
  }

  return (data ?? []) as ClubRCourtOccupancy[];
}

export async function loadClubRMembers(context: AuthenticatedClubRContext, search = "") {
  const trimmedSearch = search.trim();
  const linkedProfileIds = new Set<string>();

  if (hasVenueScope(context) && context.venueId) {
    const [bookingProfiles, lessonProfiles] = await Promise.all([
      context.supabase
        .from("court_bookings")
        .select("player_profile_id,courts:court_id!inner(venue_id)")
        .eq("courts.venue_id", context.venueId)
        .not("player_profile_id", "is", null)
        .limit(240),
      context.supabase.from("coach_lessons").select("player_id").eq("venue_id", context.venueId).limit(240)
    ]);

    ((bookingProfiles.data ?? []) as { player_profile_id: string | null }[]).forEach((row) => {
      if (row.player_profile_id) {
        linkedProfileIds.add(row.player_profile_id);
      }
    });
    ((lessonProfiles.data ?? []) as { player_id: string | null }[]).forEach((row) => {
      if (row.player_id) {
        linkedProfileIds.add(row.player_id);
      }
    });

    if (linkedProfileIds.size === 0) {
      return [] as ClubRMember[];
    }
  }

  let query = context.supabase
    .from("profiles")
    .select("id,first_name,last_name,email,phone,is_junior,parent_profile_id,member_status,created_at,parent:parent_profile_id(first_name,last_name)")
    .order("created_at", { ascending: false })
    .limit(120);

  if (linkedProfileIds.size > 0) {
    query = query.in("id", Array.from(linkedProfileIds));
  }

  if (trimmedSearch) {
    query = query.or(`first_name.ilike.%${trimmedSearch}%,last_name.ilike.%${trimmedSearch}%,email.ilike.%${trimmedSearch}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("ClubR members could not be loaded", { error, role: context.role, venueId: context.venueId });
  }

  return ((data ?? []) as unknown as ClubRMember[]) ?? [];
}

export async function loadClubREvents(context: AuthenticatedClubRContext, venue: Venue | null, nowIso = new Date().toISOString()) {
  const { data, error } = await context.supabase
    .from("events")
    .select("*,entry_count:event_entries(count)")
    .gte("start_datetime", nowIso)
    .order("start_datetime", { ascending: true })
    .limit(80);

  if (error) {
    console.error("ClubR events could not be loaded", { error, role: context.role, venueId: context.venueId });
  }

  const events = ((data ?? []) as unknown as ClubREvent[]) ?? [];

  if (!hasVenueScope(context)) {
    return events;
  }

  return events.filter((event) => eventMatchesVenue(event, venue));
}

export async function loadClubREntriesForEvents(context: AuthenticatedClubRContext, eventIds: string[]) {
  if (eventIds.length === 0) {
    return [] as EventEntry[];
  }

  const { data, error } = await context.supabase.from("event_entries").select("*").in("event_id", eventIds).limit(240);

  if (error) {
    console.error("ClubR event entries could not be loaded", { error, role: context.role, venueId: context.venueId });
  }

  return ((data ?? []) as EventEntry[]) ?? [];
}
