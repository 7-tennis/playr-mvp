export type PlayerNavigationKey = "venues" | "compete" | "myplayr" | "messages" | "rankings";

export type PlayerNavigationDestination = {
  href: string;
  key: PlayerNavigationKey;
  label: string;
  matches: string[];
  isHub?: boolean;
};

export const playerNavigationDestinations: PlayerNavigationDestination[] = [
  {
    href: "/dashboard/venues",
    key: "venues",
    label: "Venues",
    matches: ["/dashboard/venues", "/dashboard/book-court", "/dashboard/my-bookings", "/dashboard/memberships"]
  },
  {
    href: "/dashboard/compete",
    key: "compete",
    label: "Compete",
    matches: ["/dashboard/compete", "/dashboard/play", "/dashboard/events", "/dashboard/my-entries", "/dashboard/results"]
  },
  {
    href: "/dashboard",
    key: "myplayr",
    label: "MyPlayR",
    matches: ["/dashboard", "/dashboard/players", "/dashboard/juniors"],
    isHub: true
  },
  {
    href: "/dashboard/messages",
    key: "messages",
    label: "Messages",
    matches: ["/dashboard/messages", "/dashboard/notifications"]
  },
  {
    href: "/dashboard/rankings",
    key: "rankings",
    label: "Rankings",
    matches: ["/dashboard/rankings"]
  }
];

function pathMatches(pathname: string, match: string) {
  return pathname === match || (match !== "/dashboard" && pathname.startsWith(`${match}/`));
}

export function isPlayerNavigationActive(pathname: string, destination: PlayerNavigationDestination) {
  return destination.matches.some((match) => pathMatches(pathname, match));
}
