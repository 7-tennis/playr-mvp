import { canAccessClubR, getPermissionContext, roleLabel, type PermissionContext, type UserRole } from "@/lib/permissions";
import type { Venue } from "@/types/courtside";

export type AuthenticatedClubRContext = Extract<PermissionContext, { kind: "authenticated" }>;
export type ClubRAccess = Awaited<ReturnType<typeof getClubRAccess>>;

export function dateInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dayRange(dateValue = dateInput()) {
  const dayStart = new Date(`${dateValue}T00:00:00+02:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayEnd, dayStart };
}

export function weekRange(date = new Date()) {
  const localDate = new Date(`${dateInput(date)}T00:00:00+02:00`);
  const mondayOffset = (localDate.getDay() + 6) % 7;
  const weekStart = new Date(localDate.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekEnd, weekStart };
}

export function isPlatformClubR(context: AuthenticatedClubRContext) {
  return context.role === "platform_admin";
}

export function clubRScopeLabel(context: AuthenticatedClubRContext, venue: Pick<Venue, "name"> | null) {
  if (context.role === "platform_admin") {
    return "All venues";
  }

  return venue?.name ?? "Assigned venue";
}

export async function getClubRAccess() {
  const context = await getPermissionContext();

  if (context.kind === "no-config") {
    return {
      allowed: false,
      context,
      reason: "Supabase is not configured.",
      requiredRoles: ["club_admin", "platform_admin"] as UserRole[]
    };
  }

  const roleAllowed = canAccessClubR(context.role);
  const venueAllowed = context.role === "platform_admin" || Boolean(context.venueId);

  return {
    allowed: roleAllowed && venueAllowed,
    context,
    reason: roleAllowed
      ? "ClubR access needs an assigned venue."
      : `Your current role is ${roleLabel(context.role)}.`,
    requiredRoles: ["club_admin", "platform_admin"] as UserRole[]
  };
}

export async function loadClubRVenue(context: AuthenticatedClubRContext) {
  if (!context.venueId) {
    return null;
  }

  const { data } = await context.supabase.from("venues").select("id,name,slug,status,organisation_type,created_at,updated_at").eq("id", context.venueId).maybeSingle();
  return (data as Venue | null) ?? null;
}
