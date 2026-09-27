import type { Notification, NotificationType, OrganisationType } from "@/types/courtside";

export type NotificationFilter = "action" | "all" | "club" | "district" | "events" | "school";

export const notificationFilters: Array<{ label: string; value: NotificationFilter }> = [
  { label: "All", value: "all" },
  { label: "Action", value: "action" },
  { label: "School", value: "school" },
  { label: "District", value: "district" },
  { label: "Club", value: "club" },
  { label: "Events", value: "events" }
];

export function normalizeNotificationFilter(value?: string): NotificationFilter {
  return notificationFilters.some((filter) => filter.value === value) ? value as NotificationFilter : "all";
}

export function notificationIsEvent(type: NotificationType) {
  return type.startsWith("event_") || type.startsWith("match_");
}

export function notificationMatchesFilter(
  notification: Notification,
  filter: NotificationFilter,
  organisationType?: OrganisationType | null
) {
  if (filter === "all") return true;
  if (filter === "action") return notification.action_required || notification.status === "action_required";
  if (filter === "events") return notificationIsEvent(notification.type);
  if (filter === "school") return organisationType === "school" || organisationType === "school_district";
  if (filter === "district") return organisationType === "district";
  return organisationType === "club" || organisationType === "club_academy";
}

export function notificationProfileId(notification: Notification) {
  if (notification.junior_profile_id) return notification.junior_profile_id;
  if (notification.profile_id) return notification.profile_id;

  for (const key of ["juniorProfileId", "junior_profile_id", "playerProfileId", "player_profile_id", "profileId"]) {
    const value = notification.metadata?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}

export function normalizeNotificationProfile(value: string | undefined, manageableProfileIds: string[]) {
  return value && manageableProfileIds.includes(value) ? value : null;
}

export function notificationMatchesProfile(notification: Notification, profileId: string | null) {
  return profileId === null || notificationProfileId(notification) === profileId;
}

export function updatesFilterHref({
  filter = "all",
  hub,
  profileId
}: {
  filter?: NotificationFilter;
  hub?: string | null;
  profileId?: string | null;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (profileId) params.set("profile", profileId);
  if (hub) params.set("hub", hub);
  const query = params.toString();
  return `/dashboard/messages${query ? `?${query}` : ""}`;
}

export function safeNotificationHref(value: string | null | undefined) {
  if (!value || !value.startsWith("/dashboard/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const target = new URL(value, "https://playr.local");
    return target.origin === "https://playr.local" && target.pathname.startsWith("/dashboard/")
      ? `${target.pathname}${target.search}${target.hash}`
      : null;
  } catch {
    return null;
  }
}

export function organisationContextLabel(type: OrganisationType, name: string) {
  const label = type === "school" || type === "school_district"
    ? "School"
    : type === "district"
      ? "District"
      : type === "club" || type === "club_academy"
        ? "Club"
        : "Academy";
  return `${label} · ${name}`;
}
