import type { PermissionContext } from "@/lib/permissions";
import type {
  AcademyConnectionCandidate,
  AcademyStudentCoachAssignment,
  ActiveAcademyStudent,
  CoachingProposalStatus,
  JuniorStage,
  PlayerLevel
} from "@/types/courtside";

type AuthenticatedContext = Extract<PermissionContext, { kind: "authenticated" }>;

type ActiveStudentRow = {
  organisation_player_link_id: string;
  venue_id: string;
  player_profile_id: string;
  first_name: string;
  last_name: string;
  is_junior: boolean;
  parent_profile_id: string | null;
  parent_name: string | null;
  junior_stage: string | null;
  player_level: string | null;
  link_status: "active";
  proposal_status: CoachingProposalStatus;
  connection_context: Record<string, unknown> | null;
  approved_at: string | null;
  assigned_coaches: unknown;
  assigned_to_current_user: boolean;
};

type ConnectionCandidateRow = {
  player_profile_id: string;
  player_name: string;
  is_junior: boolean;
  parent_profile_id: string | null;
  parent_name: string | null;
  masked_email: string | null;
  relationship_status: AcademyConnectionCandidate["relationshipStatus"];
};

export type AcademyStudentLoadResult = {
  students: ActiveAcademyStudent[];
  venueId: string | null;
  error: "missing_organisation" | "load_failed" | null;
};

export function activeCoachRVenueId(context: AuthenticatedContext, venueId?: string | null) {
  return venueId ?? context.venueId ?? context.activeOrganisationMembership?.venue_id ?? null;
}

function assignedCoaches(value: unknown): AcademyStudentCoachAssignment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.assignmentId !== "string" ||
      typeof record.coachProfileId !== "string" ||
      typeof record.coachName !== "string" ||
      typeof record.assignedAt !== "string"
    ) {
      return [];
    }

    return [{
      assignedAt: record.assignedAt,
      assignmentId: record.assignmentId,
      coachName: record.coachName,
      coachProfileId: record.coachProfileId
    }];
  });
}

export async function loadActiveAcademyStudents(
  context: AuthenticatedContext,
  requestedVenueId?: string | null
): Promise<AcademyStudentLoadResult> {
  const venueId = activeCoachRVenueId(context, requestedVenueId);

  if (!venueId) {
    return { error: "missing_organisation", students: [], venueId: null };
  }

  const { data, error } = await context.supabase.rpc("coachr_active_academy_students", {
    p_venue_id: venueId
  });

  if (error) {
    console.error("CoachR active academy students could not be loaded", {
      code: error.code,
      role: context.role,
      venueId
    });
    return { error: "load_failed", students: [], venueId };
  }

  const students = ((data ?? []) as ActiveStudentRow[]).map((row) => ({
    approvedAt: row.approved_at,
    assignedCoaches: assignedCoaches(row.assigned_coaches),
    assignedToCurrentUser: row.assigned_to_current_user,
    connectionContext: row.connection_context ?? {},
    firstName: row.first_name,
    isJunior: row.is_junior,
    juniorStage: row.junior_stage as JuniorStage | null,
    lastName: row.last_name,
    organisationPlayerLinkId: row.organisation_player_link_id,
    parentName: row.parent_name,
    parentProfileId: row.parent_profile_id,
    playerLevel: row.player_level as PlayerLevel | null,
    playerProfileId: row.player_profile_id,
    proposalStatus: row.proposal_status,
    status: row.link_status,
    venueId: row.venue_id
  }));

  return { error: null, students, venueId };
}

export async function searchAcademyConnectionCandidates(
  context: AuthenticatedContext,
  query: string,
  requestedVenueId?: string | null
) {
  const venueId = activeCoachRVenueId(context, requestedVenueId);
  const normalizedQuery = query.trim();

  if (!venueId || normalizedQuery.length < 3 || normalizedQuery.length > 120) {
    return { candidates: [] as AcademyConnectionCandidate[], error: null, venueId };
  }

  const { data, error } = await context.supabase.rpc("coachr_search_connection_candidates", {
    p_query: normalizedQuery,
    p_venue_id: venueId
  });

  if (error) {
    console.error("CoachR connection candidate search failed", {
      code: error.code,
      role: context.role,
      venueId
    });
    return { candidates: [] as AcademyConnectionCandidate[], error: "search_failed" as const, venueId };
  }

  const candidates = ((data ?? []) as ConnectionCandidateRow[]).map((row) => ({
    isJunior: row.is_junior,
    maskedEmail: row.masked_email,
    parentName: row.parent_name,
    parentProfileId: row.parent_profile_id,
    playerName: row.player_name,
    playerProfileId: row.player_profile_id,
    relationshipStatus: row.relationship_status
  }));

  return { candidates, error: null, venueId };
}

export function activeAcademyStudentName(student: Pick<ActiveAcademyStudent, "firstName" | "lastName">) {
  return `${student.firstName} ${student.lastName}`;
}

export function academyStudentProposal(student: ActiveAcademyStudent) {
  const value = student.connectionContext.proposal;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
