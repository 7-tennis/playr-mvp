import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type { OrganisationLinkStatus, OrganisationType, Venue } from "@/types/courtside";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type PlayerOrganisation = {
  connectionContext: Record<string, unknown>;
  id: string;
  playerProfileId: string;
  proposalStatus: string | null;
  status: OrganisationLinkStatus;
  venue: Pick<
    Venue,
    "id" | "name" | "slug" | "status" | "organisation_type" | "logo_url" | "address" | "suburb" | "town" | "city"
  > | null;
};

export type PlayerClubMembership = {
  id: string;
  memberRole: string;
  status: string;
  venueId: string;
  planName: string | null;
  subscription: {
    id: string;
    status: string;
    startDate: string;
    expiryDate: string | null;
  } | null;
};

export type PlayerOrganisationResult<T> = {
  data: T;
  error: boolean;
};

type LinkRow = {
  connection_context: Record<string, unknown> | null;
  id: string;
  player_profile_id: string;
  proposal_status: string | null;
  status: OrganisationLinkStatus;
  venue: PlayerOrganisation["venue"];
};

type MembershipRow = {
  id: string;
  member_role: string;
  status: string;
  venue_id: string;
  selected_plan: { name: string } | null;
  subscription: {
    id: string;
    status: string;
    start_date: string;
    expiry_date: string | null;
  } | null;
};

const organisationOrder: Record<OrganisationType, number> = {
  club: 1,
  club_academy: 2,
  academy: 3,
  school: 4,
  school_district: 5,
  district: 6
};

export function comparePlayerOrganisations(left: PlayerOrganisation, right: PlayerOrganisation) {
  const leftOrder = left.venue ? organisationOrder[left.venue.organisation_type] : 99;
  const rightOrder = right.venue ? organisationOrder[right.venue.organisation_type] : 99;
  return leftOrder - rightOrder || (left.venue?.name ?? "").localeCompare(right.venue?.name ?? "");
}

export function organisationTypeLabel(type: OrganisationType) {
  switch (type) {
    case "club": return "Club";
    case "academy": return "Academy";
    case "school": return "School";
    case "district": return "District";
    case "club_academy": return "Club & Academy";
    case "school_district": return "School & District";
  }
}

export function organisationSummaryLabel(organisations: PlayerOrganisation[]) {
  const labels = Array.from(new Set(organisations.flatMap((organisation) => {
    switch (organisation.venue?.organisation_type) {
      case "club_academy": return ["Club", "Academy"];
      case "school_district": return ["School", "District"];
      case "club": return ["Club"];
      case "academy": return ["Academy"];
      case "school": return ["School"];
      case "district": return ["District"];
      default: return [];
    }
  })));

  if (organisations.length === 0) return "No organisations linked yet";
  if (labels.length <= 2) return `${labels.join(" and ")} linked`;
  return `${organisations.length} organisation${organisations.length === 1 ? "" : "s"} linked`;
}

export async function loadPlayerOrganisations(
  supabase: ServerSupabaseClient,
  profileIds: string[]
): Promise<PlayerOrganisationResult<PlayerOrganisation[]>> {
  if (profileIds.length === 0) return { data: [], error: false };

  const { data, error } = await supabase
    .from("organisation_player_links")
    .select(`
      id,
      player_profile_id,
      status,
      connection_context,
      proposal_status,
      venue:venue_id(id,name,slug,status,organisation_type,logo_url,address,suburb,town,city)
    `)
    .in("player_profile_id", profileIds)
    .in("status", ["pending", "active", "suspended"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[player-organisations] links_load_failed", { code: error.code });
    return { data: [], error: true };
  }

  const organisations = ((data ?? []) as unknown as LinkRow[])
    .map((row) => ({
      connectionContext: row.connection_context ?? {},
      id: row.id,
      playerProfileId: row.player_profile_id,
      proposalStatus: row.proposal_status,
      status: row.status,
      venue: row.venue
    }))
    .filter((organisation) => organisation.venue)
    .sort(comparePlayerOrganisations);

  return { data: organisations, error: false };
}

export async function loadPlayerClubMemberships(
  supabase: ServerSupabaseClient,
  profileId: string
): Promise<PlayerOrganisationResult<PlayerClubMembership[]>> {
  const { data, error } = await supabase
    .from("club_membership_subscription_members")
    .select(`
      id,
      venue_id,
      member_role,
      status,
      selected_plan:selected_plan_id(name),
      subscription:subscription_id(id,status,start_date,expiry_date)
    `)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[player-organisations] memberships_load_failed", { code: error.code, profileId });
    return { data: [], error: true };
  }

  return {
    data: ((data ?? []) as unknown as MembershipRow[]).map((row) => ({
      id: row.id,
      memberRole: row.member_role,
      planName: row.selected_plan?.name ?? null,
      status: row.status,
      subscription: row.subscription ? {
        expiryDate: row.subscription.expiry_date,
        id: row.subscription.id,
        startDate: row.subscription.start_date,
        status: row.subscription.status
      } : null,
      venueId: row.venue_id
    })),
    error: false
  };
}
