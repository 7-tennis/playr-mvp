import { getPermissionContext, type PermissionContext } from "@/lib/permissions";
import { productForOrganisationMembership } from "@/lib/organisations";
import { canReviewTeamRPlayerRequests } from "@/lib/teamr-policy";
import type { JuniorStage, OrganisationRole, OrganisationType, RatingConfidence, Venue } from "@/types/courtside";

export type AuthenticatedTeamRContext = Extract<PermissionContext, { kind: "authenticated" }>;

export type TeamRPlayer = {
  approvedAt: string | null;
  id: string;
  isJunior: boolean;
  juniorStage: JuniorStage | null;
  linkId: string;
  name: string;
  organisationRole: "player";
  participationScore: number;
  rating: number | null;
  ratingConfidence: RatingConfidence | null;
};

export type TeamRPlayerRequest = {
  id: string;
  juniorStage: JuniorStage | null;
  name: string;
  parentName: string | null;
  requestedAt: string;
};

export type TeamRTeam = {
  createdAt: string;
  id: string;
  juniorStage: JuniorStage | null;
  name: string;
  rosterSize: number;
  status: "active" | "archived";
};

export type TeamRRosterMember = TeamRPlayer & {
  rosterMembershipId: string;
};

type TeamRPlayerLinkRow = {
  approved_at: string | null;
  id: string;
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

type TeamRPlayerRequestRow = {
  id: string;
  parent: { first_name: string; last_name: string } | null;
  profile: { first_name: string; junior_stage: JuniorStage | null; last_name: string } | null;
  updated_at: string;
};

type TeamRTeamRow = {
  created_at: string;
  id: string;
  junior_stage: JuniorStage | null;
  name: string;
  roster: { count: number }[] | null;
  status: "active" | "archived";
};

export const teamRJuniorStages: Array<{ label: string; value: JuniorStage }> = [
  { label: "Red Ball", value: "red_ball" },
  { label: "Orange Ball", value: "orange_ball" },
  { label: "Green Ball", value: "green_ball" },
  { label: "Yellow Ball", value: "yellow_ball" },
  { label: "Stage not confirmed", value: "not_sure" }
];

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
      id,
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
        linkId: link.id,
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

export { canReviewTeamRPlayerRequests };

export async function loadTeamRPlayerRequests(context: AuthenticatedTeamRContext) {
  if (!context.venueId) return { data: [] as TeamRPlayerRequest[], error: null };

  const { data, error } = await context.supabase
    .from("organisation_player_links")
    .select(`
      id,
      updated_at,
      profile:player_profile_id(first_name,last_name,junior_stage),
      parent:parent_profile_id(first_name,last_name)
    `)
    .eq("venue_id", context.venueId)
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[teamr] player_requests_load_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as TeamRPlayerRequest[], error: "Pending player requests could not be loaded." };
  }

  return {
    data: ((data ?? []) as unknown as TeamRPlayerRequestRow[]).flatMap((row) => row.profile ? [{
      id: row.id,
      juniorStage: row.profile.junior_stage,
      name: `${row.profile.first_name} ${row.profile.last_name}`,
      parentName: row.parent ? `${row.parent.first_name} ${row.parent.last_name}` : null,
      requestedAt: row.updated_at
    }] : []),
    error: null
  };
}

export async function loadTeamRTeams(context: AuthenticatedTeamRContext, includeArchived = false) {
  if (!context.venueId) return { data: [] as TeamRTeam[], error: null };

  let query = context.supabase
    .from("teamr_teams")
    .select("id,name,junior_stage,status,created_at,roster:teamr_roster_memberships(count)")
    .eq("venue_id", context.venueId)
    .order("created_at", { ascending: false });

  if (!includeArchived) query = query.eq("status", "active");
  const { data, error } = await query;

  if (error) {
    console.error("[teamr] teams_load_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as TeamRTeam[], error: "Teams could not be loaded." };
  }

  return {
    data: ((data ?? []) as unknown as TeamRTeamRow[]).map((team) => ({
      createdAt: team.created_at,
      id: team.id,
      juniorStage: team.junior_stage,
      name: team.name,
      rosterSize: team.roster?.[0]?.count ?? 0,
      status: team.status
    })),
    error: null
  };
}

export async function loadTeamRTeam(context: AuthenticatedTeamRContext, teamId: string) {
  if (!context.venueId) return { data: null, error: "Team context is unavailable." };

  const { data: teamData, error: teamError } = await context.supabase
    .from("teamr_teams")
    .select("id,name,junior_stage,status,created_at")
    .eq("id", teamId)
    .eq("venue_id", context.venueId)
    .maybeSingle();

  if (teamError || !teamData) return { data: null, error: "Team not found in this organisation." };

  const [{ data: rosterData, error: rosterError }, playersResult] = await Promise.all([
    context.supabase
      .from("teamr_roster_memberships")
      .select(`
        id,
        organisation_player_link:organisation_player_link_id(
          id,
          approved_at,
          player_profile_id,
          profile:player_profile_id(id,first_name,last_name,is_junior,junior_stage,junior_rating,participation_score)
        )
      `)
      .eq("team_id", teamId)
      .eq("venue_id", context.venueId)
      .order("created_at", { ascending: true }),
    loadTeamRPlayers(context)
  ]);

  if (rosterError) return { data: null, error: "The team roster could not be loaded." };

  const rosterRows = (rosterData ?? []) as unknown as Array<{
    id: string;
    organisation_player_link: TeamRPlayerLinkRow | null;
  }>;
  const playersByLink = new Map(playersResult.data.map((player) => [player.linkId, player]));
  const roster = rosterRows.flatMap((row) => {
    const player = row.organisation_player_link ? playersByLink.get(row.organisation_player_link.id) : null;
    return player ? [{ ...player, rosterMembershipId: row.id }] : [];
  });
  const rosterLinkIds = new Set(roster.map((member) => member.linkId));

  return {
    data: {
      team: {
        createdAt: String(teamData.created_at),
        id: String(teamData.id),
        juniorStage: (teamData.junior_stage as JuniorStage | null) ?? null,
        name: String(teamData.name),
        rosterSize: roster.length,
        status: teamData.status as "active" | "archived"
      },
      roster,
      availablePlayers: playersResult.data.filter((player) => !rosterLinkIds.has(player.linkId))
    },
    error: playersResult.error
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
