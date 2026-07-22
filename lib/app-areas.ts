export type AppAreaId = "playr" | "clubr" | "coachr" | "superuser";

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
  superuser: { href: "/admin/organisations", id: "superuser", label: "SupeR UseR", shortLabel: "SupeR" }
};

export function appAreaForPath(pathname: string): AppAreaId {
  if (pathname.startsWith("/admin")) return "superuser";
  if (pathname.startsWith("/dashboard/setup/clubr")) return "clubr";
  if (pathname.startsWith("/dashboard/setup/coachr")) return "coachr";
  if (pathname.startsWith("/dashboard/clubr")) return "clubr";
  if (pathname.startsWith("/dashboard/coachr")) return "coachr";
  return "playr";
}
