import type { createServerSupabaseClient } from "@/utils/supabase/server";
import type {
  OrganisationInvitation,
  OrganisationInvitationKind,
  OrganisationMembership,
  OrganisationMembershipStatus,
  OrganisationRole,
  ProductContext,
  Profile,
  UserRole,
  Venue
} from "@/types/courtside";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type OrganisationMembershipWithVenue = OrganisationMembership & {
  venue: Pick<Venue, "id" | "name" | "slug" | "organisation_type" | "status"> | null;
  profile?: Pick<Profile, "id" | "first_name" | "last_name" | "email" | "phone" | "is_junior" | "user_id"> | null;
};

export type ActiveOrganisationPreference = {
  venue_id: string;
  product_context: ProductContext;
};

export const organisationRoles: OrganisationRole[] = [
  "organisation_admin",
  "head_coach",
  "coach",
  "assistant_coach",
  "club_manager",
  "sports_coordinator",
  "team_manager",
  "viewer"
];

export const coachingOrganisationRoles: OrganisationRole[] = ["head_coach", "coach", "assistant_coach"];
export const coachManagerOrganisationRoles: OrganisationRole[] = ["organisation_admin", "club_manager", "head_coach"];
export const clubROrganisationRoles: OrganisationRole[] = ["organisation_admin", "club_manager"];
export const organisationMembershipStatuses: OrganisationMembershipStatus[] = ["pending", "active", "declined", "suspended", "removed"];

export function organisationRoleLabel(role: OrganisationRole | string | null | undefined) {
  switch (role) {
    case "organisation_admin":
      return "Organisation Admin";
    case "head_coach":
      return "Head Coach";
    case "coach":
      return "Coach";
    case "assistant_coach":
      return "Assistant Coach";
    case "club_manager":
      return "Club Manager";
    case "sports_coordinator":
      return "Sports Coordinator";
    case "team_manager":
      return "Team Manager";
    case "viewer":
      return "Viewer";
    default:
      return "Member";
  }
}

export function organisationStatusLabel(status: OrganisationMembershipStatus | string | null | undefined) {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    case "declined":
      return "Declined";
    case "suspended":
      return "Suspended";
    case "removed":
      return "Removed";
    default:
      return "Unknown";
  }
}

export function organisationRolePriority(role: OrganisationRole | string | null | undefined) {
  switch (role) {
    case "organisation_admin":
      return 70;
    case "club_manager":
      return 60;
    case "head_coach":
      return 50;
    case "sports_coordinator":
      return 45;
    case "team_manager":
      return 40;
    case "coach":
      return 35;
    case "assistant_coach":
      return 30;
    case "viewer":
      return 10;
    default:
      return 0;
  }
}

export function appRoleForOrganisationRole(role: OrganisationRole | string | null | undefined): UserRole {
  switch (role) {
    case "organisation_admin":
    case "club_manager":
      return "club_admin";
    case "head_coach":
      return "head_coach";
    case "coach":
    case "assistant_coach":
      return "coach";
    default:
      return "player";
  }
}

export function productForOrganisationRole(role: OrganisationRole | string | null | undefined): ProductContext {
  switch (appRoleForOrganisationRole(role)) {
    case "club_admin":
      return "clubr";
    case "head_coach":
    case "coach":
      return "coachr";
    default:
      return "playr";
  }
}

export function productForOrganisationMembership(membership: Pick<OrganisationMembershipWithVenue, "role" | "venue">): ProductContext {
  const organisationType = membership.venue?.organisation_type;

  if (membership.role === "sports_coordinator" || membership.role === "team_manager") {
    return "teamr";
  }

  if (
    organisationType === "academy" ||
    membership.role === "head_coach" ||
    membership.role === "coach" ||
    membership.role === "assistant_coach"
  ) {
    return "coachr";
  }

  return productForOrganisationRole(membership.role);
}

export function appRoleForOrganisationMembership(membership: Pick<OrganisationMembershipWithVenue, "role" | "venue">): UserRole {
  const product = productForOrganisationMembership(membership);

  if (product === "coachr" && (membership.role === "organisation_admin" || membership.role === "club_manager")) {
    return "head_coach";
  }

  return appRoleForOrganisationRole(membership.role);
}

export function productLabelForOrganisationRole(role: OrganisationRole | string | null | undefined) {
  switch (appRoleForOrganisationRole(role)) {
    case "club_admin":
      return "ClubR";
    case "head_coach":
    case "coach":
      return "CoachR";
    default:
      return "MyPlayR";
  }
}

export function canManageOrganisationRoles(role: OrganisationRole | string | null | undefined) {
  return role === "organisation_admin" || role === "club_manager";
}

export function canManageOrganisationCoaches(role: OrganisationRole | string | null | undefined) {
  return canManageOrganisationRoles(role) || role === "head_coach";
}

export function canInviteOrganisationPlayers(role: OrganisationRole | string | null | undefined) {
  return canManageOrganisationCoaches(role) || role === "coach" || role === "assistant_coach";
}

export function canManageOrganisationCourtAccess(role: OrganisationRole | string | null | undefined) {
  return role === "organisation_admin" || role === "club_manager" || role === "sports_coordinator";
}

export function invitationKindLabel(kind: OrganisationInvitationKind | string | null | undefined) {
  switch (kind) {
    case "coach":
      return "Coach invitation";
    case "player_junior":
      return "Player link request";
    case "player":
      return "Adult player request";
    default:
      return "Organisation invitation";
  }
}

export function invitationLink(token: string) {
  return `/dashboard/organisations/invitations?token=${token}`;
}

function membershipSelect() {
  return `
    id,
    venue_id,
    profile_id,
    user_id,
    role,
    status,
    invited_by_user_id,
    accepted_at,
    suspended_at,
    removed_at,
    notes,
    created_at,
    updated_at,
    venue:venue_id(id,name,slug,organisation_type,status),
    profile:profile_id(id,first_name,last_name,email,phone,is_junior,user_id)
  `;
}

export async function loadAllOrganisationMembershipsForUser(supabase: ServerSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("organisation_memberships")
    .select(membershipSelect())
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[playr-organisations]", {
      event: "organisation_memberships_load_failed",
      code: error.code,
      message: error.message
    });
    return [] as OrganisationMembershipWithVenue[];
  }

  return ((data ?? []) as unknown as OrganisationMembershipWithVenue[]) ?? [];
}

export async function loadOrganisationMembershipsForUser(supabase: ServerSupabaseClient, userId: string) {
  const memberships = await loadAllOrganisationMembershipsForUser(supabase, userId);
  return memberships.filter((membership) => membership.status === "active" && membership.venue?.status !== "inactive");
}

export async function loadActiveOrganisationPreference(supabase: ServerSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_active_organisations")
    .select("venue_id,product_context")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[playr-organisations]", {
      event: "active_organisation_preference_load_failed",
      code: error.code,
      message: error.message
    });
    return null;
  }

  return (data as ActiveOrganisationPreference | null) ?? null;
}

export function pickActiveOrganisationMembership(memberships: OrganisationMembershipWithVenue[], preference: ActiveOrganisationPreference | null) {
  if (memberships.length === 0) {
    return null;
  }

  if (preference) {
    const preferred = memberships
      .filter((membership) => membership.venue_id === preference.venue_id)
      .sort((left, right) => organisationRolePriority(right.role) - organisationRolePriority(left.role))[0];

    if (preferred) {
      return preferred;
    }
  }

  return [...memberships].sort((left, right) => {
    const priorityDelta = organisationRolePriority(right.role) - organisationRolePriority(left.role);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  })[0] ?? null;
}

export async function loadOrganisationInvitationsForVenue(supabase: ServerSupabaseClient, venueId: string) {
  const { data, error } = await supabase
    .from("organisation_invitations")
    .select("*,venue:venue_id(id,name,slug,organisation_type,status)")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.warn("[playr-organisations]", {
      event: "organisation_invitations_load_failed",
      code: error.code,
      message: error.message,
      venueId
    });
    return [] as (OrganisationInvitation & { venue: Pick<Venue, "id" | "name" | "slug" | "organisation_type" | "status"> | null })[];
  }

  return (data ?? []) as unknown as (OrganisationInvitation & { venue: Pick<Venue, "id" | "name" | "slug" | "organisation_type" | "status"> | null })[];
}

export function profileName(profile: Pick<Profile, "first_name" | "last_name"> | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile to be confirmed";
}
