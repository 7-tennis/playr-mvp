export type UserRole = "player" | "parent" | "coach" | "head_coach" | "club_admin" | "committee" | "reception" | "platform_admin";
export type StoredUserRole = UserRole | "admin" | "staff";
export type ClubRPermission =
  | "clubr"
  | "clubr:members"
  | "clubr:members:manage"
  | "clubr:memberships"
  | "clubr:memberships:catalog:manage"
  | "clubr:memberships:applications"
  | "clubr:memberships:applications:review"
  | "clubr:memberships:subscriptions"
  | "clubr:memberships:subscriptions:manage"
  | "clubr:memberships:billing"
  | "clubr:memberships:payments:record"
  | "clubr:roles:manage"
  | "clubr:bookings"
  | "clubr:courts"
  | "clubr:courts:manage"
  | "clubr:notices"
  | "clubr:notices:manage"
  | "clubr:settings"
  | "clubr:settings:manage"
  | "clubr:diagnostics";
export type CoachRPermission =
  | "coachr"
  | "coachr:schedule"
  | "coachr:students"
  | "coachr:availability"
  | "coachr:coaches"
  | "coachr:messages"
  | "coachr:more"
  | "coachr:head_coach";

export function canAccessCoachR(role: UserRole) {
  return role === "coach" || role === "head_coach" || role === "platform_admin";
}

export function canAccessHeadCoach(role: UserRole) {
  return role === "head_coach" || role === "platform_admin";
}

export function canAccessClubAdmin(role: UserRole) {
  return role === "club_admin" || role === "platform_admin";
}

export function canAccessClubR(role: UserRole) {
  return role === "club_admin" || role === "committee" || role === "reception" || role === "platform_admin";
}

export function canAccessClubRPermission(role: UserRole, permission: ClubRPermission) {
  if (role === "platform_admin" || role === "club_admin") {
    return true;
  }

  if (role === "committee") {
    return ![
      "clubr:roles:manage",
      "clubr:settings:manage",
      "clubr:diagnostics",
      "clubr:memberships:catalog:manage",
      "clubr:memberships:applications:review",
      "clubr:memberships:subscriptions:manage",
      "clubr:memberships:payments:record"
    ].includes(permission);
  }

  if (role === "reception") {
    return [
      "clubr",
      "clubr:members",
      "clubr:bookings",
      "clubr:courts",
      "clubr:notices",
      "clubr:settings",
      "clubr:memberships",
      "clubr:memberships:applications",
      "clubr:memberships:subscriptions",
      "clubr:memberships:billing"
    ].includes(permission);
  }

  return false;
}

export function canAccessCoachRPermission(role: UserRole, permission: CoachRPermission) {
  if (permission === "coachr:coaches" || permission === "coachr:head_coach") {
    return canAccessHeadCoach(role);
  }

  return canAccessCoachR(role);
}

export function coachRRequiredRoles(permission: CoachRPermission): UserRole[] {
  if (permission === "coachr:coaches" || permission === "coachr:head_coach") {
    return ["head_coach", "platform_admin"];
  }

  return ["coach", "head_coach", "platform_admin"];
}

export function canAccessProductWithRoles(roles: readonly UserRole[], product: "coachr" | "clubr") {
  return roles.some((role) => product === "coachr" ? canAccessCoachR(role) : canAccessClubR(role));
}
