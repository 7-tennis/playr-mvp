export type AppAreaId = "playr" | "clubr" | "coachr" | "teamr" | "superuser";

export type AppAreaDestination = {
  href: string;
  id: AppAreaId;
  label: string;
  membershipId?: string;
  shortLabel: string;
};

export const appAreaDefinitions: Record<AppAreaId, Omit<AppAreaDestination, "membershipId">> = {
  playr: { href: "/dashboard", id: "playr", label: "PlayR", shortLabel: "PlayR" },
  clubr: { href: "/dashboard/clubr", id: "clubr", label: "ClubR Admin", shortLabel: "ClubR" },
  coachr: { href: "/dashboard/coachr", id: "coachr", label: "CoachR", shortLabel: "CoachR" },
  teamr: { href: "/dashboard/teamr", id: "teamr", label: "TeamR", shortLabel: "TeamR" },
  superuser: { href: "/admin/organisations", id: "superuser", label: "SupeR UseR", shortLabel: "SupeR" }
};

export function appAreaLandingPath(appArea: AppAreaId) {
  return appAreaDefinitions[appArea].href;
}

export function appAreaForPath(pathname: string): AppAreaId {
  if (pathname.startsWith("/admin")) return "superuser";
  if (pathname.startsWith("/dashboard/setup/clubr")) return "clubr";
  if (pathname.startsWith("/dashboard/setup/coachr")) return "coachr";
  if (pathname.startsWith("/dashboard/clubr")) return "clubr";
  if (pathname.startsWith("/dashboard/coachr")) return "coachr";
  if (pathname.startsWith("/dashboard/teamr")) return "teamr";
  return "playr";
}

export function authorisedAppAreaForPath(pathname: string, destinations: AppAreaDestination[]): AppAreaId {
  const inferredArea = appAreaForPath(pathname);

  return destinations.some((destination) => destination.id === inferredArea) ? inferredArea : "playr";
}
