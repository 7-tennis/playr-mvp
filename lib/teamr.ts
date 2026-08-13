import { getPermissionContext, type PermissionContext } from "@/lib/permissions";
import { productForOrganisationMembership } from "@/lib/organisations";
import type { JuniorStage, OrganisationRole, OrganisationType, RatingConfidence, Venue } from "@/types/courtside";

export type AuthenticatedTeamRContext = Extract<PermissionContext, { kind: "authenticated" }>;

export type TeamRPlayer = {
  approvedAt: string | null;
  id: string;
  isJunior: boolean;
  juniorStage: JuniorStage | null;
  name: string;
  organisationRole: "player";
  participationScore: number;
  rating: number | null;
  ratingConfidence: RatingConfidence | null;
};

type TeamRPlayerLinkRow = {
  approved_at: string | null;
  player_profile_id: string;
  profile: {
    first_name: string;
    id: string;
    is_junior: boolean;
    junior_rating: number | null;
    junior_stage: JuniorStage | null;
    last_name: string;
    participation_score: number | null;
  } | null;
};

type RatingRow = {
  confidence: RatingConfidence;
  profile_id: string;
  rating_value: number;
};

export function isTeamRMembership(membership: AuthenticatedTeamRContext["organisationMemberships"][number]) {
  return productForOrganisationMembership(membership) === "teamr";
}

export async function getTeamRAccess() {
  const context = await getPermissionContext("teamr");

  if (context.kind === "no-config") {
    return { allowed: false, context, reason: "Supabase is not configured." };
  }

  const membershipAllowed = Boolean(context.activeOrganisationMembership && isTeamRMembership(context.activeOrganisationMembership));
  const allowed = context.role === "platform_admin" || membershipAllowed;

  return {
    allowed,
    context,
    reason: allowed
      ? null
      : "TeamR requires an active school or district membership as an organisation administrator, sports coordinator or team manager."
  };
}

export async function loadTeamRVenue(context: AuthenticatedTeamRContext) {
  if (!context.venueId) return null;

  const { data, error } = await context.supabase
    .from("venues")
    .select("id,name,slug,status,organisation_type")
    .eq("id", context.venueId)
    .maybeSingle();

  if (error) {
    console.error("[teamr] venue_load_failed", { code: error.code, venueId: context.venueId });
    return null;
  }

  return (data as Pick<Venue, "id" | "name" | "slug" | "status" | "organisation_type"> | null) ?? null;
}

export async function loadTeamRPlayers(context: AuthenticatedTeamRContext) {
  if (!context.venueId) return { data: [] as TeamRPlayer[], error: null };

  const { data, error } = await context.supabase
    .from("organisation_player_links")
    .select(`
      player_profile_id,
      approved_at,
      profile:player_profile_id(id,first_name,last_name,is_junior,junior_stage,junior_rating,participation_score)
    `)
    .eq("venue_id", context.venueId)
    .eq("status", "active")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    console.error("[teamr] players_load_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as TeamRPlayer[], error: "TeamR player data could not be loaded." };
  }

  const links = ((data ?? []) as unknown as TeamRPlayerLinkRow[]).filter((link) => link.profile);
  const profileIds = links.map((link) => link.player_profile_id);
  const ratingsResult = profileIds.length
    ? await context.supabase.from("ratings").select("profile_id,rating_value,confidence").in("profile_id", profileIds)
    : { data: [] as RatingRow[], error: null };

  if (ratingsResult.error) {
    console.warn("[teamr] ratings_load_failed", { code: ratingsResult.error.code, venueId: context.venueId });
  }

  const ratings = new Map(((ratingsResult.data ?? []) as RatingRow[]).map((rating) => [rating.profile_id, rating]));

  return {
    data: links.map((link) => {
      const profile = link.profile!;
      const adultRating = ratings.get(profile.id) ?? null;

      return {
        approvedAt: link.approved_at,
        id: profile.id,
        isJunior: profile.is_junior,
        juniorStage: profile.junior_stage,
        name: `${profile.first_name} ${profile.last_name}`,
        organisationRole: "player" as const,
        participationScore: profile.participation_score ?? 0,
        rating: profile.is_junior ? profile.junior_rating : adultRating?.rating_value ?? null,
        ratingConfidence: profile.is_junior ? null : adultRating?.confidence ?? null
      };
    }),
    error: null
  };
}

export function teamRRoleLabel(role: OrganisationRole | null) {
  if (role === "organisation_admin") return "Organisation Admin";
  if (role === "sports_coordinator") return "Sports Coordinator";
  if (role === "team_manager") return "Team Manager";
  return "TeamR Staff";
}

export function teamROrganisationTypeLabel(type: OrganisationType | null | undefined) {
  if (type === "school_district") return "School District";
  if (type === "school") return "School";
  if (type === "district") return "District";
  return "Organisation";
}
