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
  schoolAffiliation: string | null;
};

export type TeamRPlayerRequest = {
  id: string;
  juniorStage: JuniorStage | null;
  name: string;
  parentName: string | null;
  requestedAt: string;
};

export type TeamRPerson = {
  createdAt: string;
  email: string | null;
  id: string;
  kind: "membership" | "invitation";
  name: string;
  role: OrganisationRole;
  status: "active" | "pending" | "suspended";
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

type TeamRPlayerRpcRow = {
  approved_at: string | null;
  is_junior: boolean;
  junior_stage: JuniorStage | null;
  participation_score: number;
  player_name: string;
  player_profile_id: string;
  rating_confidence: RatingConfidence | null;
  rating_value: number | null;
  school_affiliation: string | null;
  source_organisation_player_link_id: string;
};

type TeamRPlayerRequestRow = {
  id: string;
  parent: { first_name: string; last_name: string } | null;
  profile: { first_name: string; junior_stage: JuniorStage | null; last_name: string } | null;
  updated_at: string;
};

type TeamRPersonRow = {
  access_status: TeamRPerson["status"];
  created_at: string;
  email: string | null;
  organisation_role: OrganisationRole;
  person_name: string;
  record_id: string;
  record_kind: TeamRPerson["kind"];
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

export async function loadTeamRPlayers(context: AuthenticatedTeamRContext, includeInherited = true) {
  if (!context.venueId) return { data: [] as TeamRPlayer[], error: null };

  const { data, error } = await context.supabase.rpc("get_teamr_players", {
    p_include_inherited: includeInherited,
    p_venue_id: context.venueId
  });

  if (error) {
    console.error("[teamr] players_load_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as TeamRPlayer[], error: "TeamR player data could not be loaded." };
  }

  return {
    data: ((data ?? []) as TeamRPlayerRpcRow[]).map((row) => ({
        approvedAt: row.approved_at,
        id: row.player_profile_id,
        isJunior: row.is_junior,
        juniorStage: row.junior_stage,
        linkId: row.source_organisation_player_link_id,
        name: row.player_name,
        organisationRole: "player" as const,
        participationScore: row.participation_score ?? 0,
        rating: row.rating_value,
        ratingConfidence: row.rating_confidence,
        schoolAffiliation: row.school_affiliation
      })),
    error: null
  };
}

export { canReviewTeamRPlayerRequests };

export const teamRStaffRoles: Array<{ label: string; value: OrganisationRole }> = [
  { label: "Sports Coordinator", value: "sports_coordinator" },
  { label: "Team Manager", value: "team_manager" },
  { label: "Head Coach", value: "head_coach" },
  { label: "Coach", value: "coach" },
  { label: "Assistant Coach", value: "assistant_coach" }
];

export function canManageTeamRPeople(context: AuthenticatedTeamRContext) {
  return context.role === "platform_admin"
    || context.activeOrganisationRole === "organisation_admin"
    || context.activeOrganisationRole === "sports_coordinator";
}

export function teamRStaffRolesForContext(context: AuthenticatedTeamRContext) {
  return context.activeOrganisationRole === "sports_coordinator"
    ? teamRStaffRoles.filter((role) => role.value !== "sports_coordinator")
    : teamRStaffRoles;
}

export async function loadTeamRPeople(context: AuthenticatedTeamRContext) {
  if (!context.venueId) return { data: [] as TeamRPerson[], error: null };
  const { data, error } = await context.supabase.rpc("get_teamr_people", { p_venue_id: context.venueId });

  if (error) {
    console.error("[teamr] people_load_failed", { code: error.code, venueId: context.venueId });
    return { data: [] as TeamRPerson[], error: "People and access could not be loaded." };
  }

  return {
    data: ((data ?? []) as TeamRPersonRow[]).map((row) => ({
      createdAt: row.created_at,
      email: row.email,
      id: row.record_id,
      kind: row.record_kind,
      name: row.person_name,
      role: row.organisation_role,
      status: row.access_status
    })),
    error: null
  };
}

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
    loadTeamRPlayers(context, false)
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
