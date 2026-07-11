import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export type UserRole = "player" | "parent" | "coach" | "head_coach" | "club_admin" | "platform_admin";
export type StoredUserRole = UserRole | "admin" | "staff";
export type CoachRPermission =
  | "coachr"
  | "coachr:schedule"
  | "coachr:students"
  | "coachr:availability"
  | "coachr:coaches"
  | "coachr:messages"
  | "coachr:more"
  | "coachr:head_coach";

type RoleRow = {
  id: string;
  role: StoredUserRole;
  venue_id?: string | null;
};

type AdultProfileRow = {
  id: string;
};

export type PermissionContext =
  | { kind: "no-config" }
  | {
      kind: "authenticated";
      supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      user: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof createServerSupabaseClient>>["auth"]["getUser"]>>["data"]["user"]>;
      role: UserRole;
      storedRole: StoredUserRole | null;
      roleSource: "stored" | "derived";
      venueId: string | null;
      adultProfileId: string | null;
      linkedJuniorCount: number;
    };

export function normalizeStoredRole(role: StoredUserRole | string | null | undefined, fallback: UserRole = "player"): UserRole {
  switch (role) {
    case "admin":
    case "staff":
      return "club_admin";
    case "player":
    case "parent":
    case "coach":
    case "head_coach":
    case "club_admin":
    case "platform_admin":
      return role;
    default:
      return fallback;
  }
}

export function roleLabel(role: UserRole) {
  switch (role) {
    case "player":
      return "Player";
    case "parent":
      return "Parent";
    case "coach":
      return "Coach";
    case "head_coach":
      return "Head Coach";
    case "club_admin":
      return "Club Admin";
    case "platform_admin":
      return "SupeR UseR";
  }
}

export function canAccessCoachR(role: UserRole) {
  return role === "coach" || role === "head_coach" || role === "club_admin" || role === "platform_admin";
}

export function canAccessHeadCoach(role: UserRole) {
  return role === "head_coach" || role === "club_admin" || role === "platform_admin";
}

export function canAccessClubAdmin(role: UserRole) {
  return role === "club_admin" || role === "platform_admin";
}

export function canManageOwnCoachResources({
  actorRole,
  actorUserId,
  actorVenueId = null,
  resourceCoachUserId,
  resourceVenueId = null
}: {
  actorRole: UserRole;
  actorUserId: string;
  actorVenueId?: string | null;
  resourceCoachUserId: string | null | undefined;
  resourceVenueId?: string | null;
}) {
  if (actorRole === "platform_admin") {
    return true;
  }

  if (actorRole === "club_admin" || actorRole === "head_coach") {
    return canManageVenueResources({ actorRole, actorVenueId, resourceVenueId });
  }

  return actorRole === "coach" && resourceCoachUserId === actorUserId;
}

export function canManageVenueResources({
  actorRole,
  actorVenueId,
  resourceVenueId
}: {
  actorRole: UserRole;
  actorVenueId: string | null;
  resourceVenueId: string | null | undefined;
}) {
  if (actorRole === "platform_admin") {
    return true;
  }

  if (actorRole !== "club_admin" && actorRole !== "head_coach") {
    return false;
  }

  return Boolean(actorVenueId && resourceVenueId && actorVenueId === resourceVenueId);
}

export function canAccessCoachRPermission(role: UserRole, permission: CoachRPermission) {
  if (permission === "coachr:head_coach" || permission === "coachr:coaches") {
    return canAccessHeadCoach(role);
  }

  return canAccessCoachR(role);
}

async function loadRoleRow(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const withVenue = await supabase
    .from("admin_users")
    .select("id,role,venue_id")
    .eq("user_id", userId)
    .is("deactivated_at", null)
    .maybeSingle();

  if (!withVenue.error) {
    return (withVenue.data as RoleRow | null) ?? null;
  }

  const withoutVenue = await supabase
    .from("admin_users")
    .select("id,role")
    .eq("user_id", userId)
    .is("deactivated_at", null)
    .maybeSingle();

  if (withoutVenue.error) {
    return null;
  }

  return withoutVenue.data ? ({ ...(withoutVenue.data as Omit<RoleRow, "venue_id">), venue_id: null } satisfies RoleRow) : null;
}

export async function getPermissionContext(): Promise<PermissionContext> {
  if (!hasSupabaseConfig()) {
    return { kind: "no-config" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [roleRow, adultProfileResult] = await Promise.all([
    loadRoleRow(supabase, user.id),
    supabase.from("profiles").select("id").eq("user_id", user.id).eq("is_junior", false).maybeSingle()
  ]);
  const adultProfile = (adultProfileResult.data as AdultProfileRow | null) ?? null;
  const { count } = adultProfile
    ? await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("parent_profile_id", adultProfile.id)
        .eq("is_junior", true)
    : { count: 0 };
  const linkedJuniorCount = count ?? 0;
  const derivedRole: UserRole = linkedJuniorCount > 0 ? "parent" : "player";

  return {
    kind: "authenticated",
    supabase,
    user,
    role: normalizeStoredRole(roleRow?.role, derivedRole),
    storedRole: roleRow?.role ?? null,
    roleSource: roleRow ? "stored" : "derived",
    venueId: roleRow?.venue_id ?? null,
    adultProfileId: adultProfile?.id ?? null,
    linkedJuniorCount
  };
}

export async function getCoachRAccess(permission: CoachRPermission = "coachr") {
  const context = await getPermissionContext();

  if (context.kind === "no-config") {
    return { allowed: false, context, requiredRoles: requiredCoachRRoles(permission) };
  }

  return {
    allowed: canAccessCoachRPermission(context.role, permission),
    context,
    requiredRoles: requiredCoachRRoles(permission)
  };
}

export async function assertCoachRAccess(permission: CoachRPermission = "coachr") {
  const access = await getCoachRAccess(permission);

  if (!access.allowed) {
    throw new Error("coachr_access_denied");
  }

  return access.context;
}

function requiredCoachRRoles(permission: CoachRPermission) {
  if (permission === "coachr:head_coach" || permission === "coachr:coaches") {
    return ["head_coach", "club_admin", "platform_admin"] as UserRole[];
  }

  return ["coach", "head_coach", "club_admin", "platform_admin"] as UserRole[];
}
