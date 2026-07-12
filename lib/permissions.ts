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
  deactivated_at?: string | null;
  created_at?: string | null;
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

function safeUserId(userId: string | null | undefined) {
  return userId ? `${userId.slice(0, 8)}...` : "unknown";
}

function rolePriority(role: StoredUserRole | string | null | undefined) {
  switch (normalizeStoredRole(role)) {
    case "platform_admin":
      return 60;
    case "club_admin":
      return 50;
    case "head_coach":
      return 40;
    case "coach":
      return 30;
    case "parent":
      return 20;
    case "player":
      return 10;
  }
}

function permissionDebugEnabled() {
  return process.env.PLAYR_AUTH_DEBUG === "true" || process.env.NODE_ENV !== "production";
}

function logPermissionDiagnostic(level: "info" | "warn", event: string, details: Record<string, unknown>) {
  if (level === "info" && !permissionDebugEnabled()) {
    return;
  }

  const payload = { event, ...details };

  if (level === "warn") {
    console.warn("[playr-permissions]", payload);
  } else {
    console.info("[playr-permissions]", payload);
  }
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined, columnName: string) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42703" || (message.includes(columnName.toLowerCase()) && message.includes("column"));
}

function pickHighestActiveRole(rows: RoleRow[]) {
  return [...rows].sort((a, b) => {
    const priorityDelta = rolePriority(b.role) - rolePriority(a.role);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  })[0] ?? null;
}

export async function loadActiveRoleRow(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  logPermissionDiagnostic("info", "active_role_lookup_start", { userId: safeUserId(userId) });

  const activeRoleResult = await supabase
    .from("admin_users")
    .select("id,role,venue_id,deactivated_at,created_at")
    .eq("user_id", userId)
    .is("deactivated_at", null)
    .order("created_at", { ascending: false });

  if (activeRoleResult.error) {
    logPermissionDiagnostic("warn", "active_role_query_error", {
      userId: safeUserId(userId),
      code: activeRoleResult.error.code,
      message: activeRoleResult.error.message,
      missingMigrationColumn: isMissingColumnError(activeRoleResult.error, "deactivated_at")
    });

    const fallbackResult = await supabase.from("admin_users").select("id,role,venue_id,created_at").eq("user_id", userId).order("created_at", { ascending: false });

    if (fallbackResult.error) {
      logPermissionDiagnostic("warn", "legacy_role_query_error", {
        userId: safeUserId(userId),
        code: fallbackResult.error.code,
        message: fallbackResult.error.message,
        missingVenueColumn: isMissingColumnError(fallbackResult.error, "venue_id")
      });
      return null;
    }

    const fallbackRows = ((fallbackResult.data ?? []) as RoleRow[]).filter((row) => row.deactivated_at == null);
    const fallbackRole = pickHighestActiveRole(fallbackRows);

    if (fallbackRole) {
      logPermissionDiagnostic("info", "legacy_role_found", {
        userId: safeUserId(userId),
        role: normalizeStoredRole(fallbackRole.role),
        venueLinked: Boolean(fallbackRole.venue_id),
        rowCount: fallbackRows.length
      });
    }

    return fallbackRole;
  }

  const rows = (activeRoleResult.data ?? []) as RoleRow[];

  if (rows.length === 0) {
    logPermissionDiagnostic("info", "active_role_missing", { userId: safeUserId(userId) });
    return null;
  }

  if (rows.length > 1) {
    logPermissionDiagnostic("warn", "multiple_active_role_rows", {
      userId: safeUserId(userId),
      rowCount: rows.length,
      roles: rows.map((row) => normalizeStoredRole(row.role))
    });
  }

  const roleRow = pickHighestActiveRole(rows);

  if (roleRow) {
    logPermissionDiagnostic("info", "active_role_found", {
      userId: safeUserId(userId),
      role: normalizeStoredRole(roleRow.role),
      venueLinked: Boolean(roleRow.venue_id),
      rowCount: rows.length
    });
  }

  return roleRow;
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
    loadActiveRoleRow(supabase, user.id),
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
