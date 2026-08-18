export function safeSchoolConnectionsReturnTo(
  value: string | null | undefined,
  juniorId: string,
  onboarding = false
) {
  if (onboarding) return "/dashboard/juniors";
  if (value === `/dashboard/players/${juniorId}`) return value;
  if (value === "/dashboard/juniors") return value;
  return "/dashboard/juniors";
}

export function schoolConnectionsHref(
  juniorId: string,
  options: {
    error?: string;
    message?: string;
    onboarding?: boolean;
    q?: string;
    returnTo?: string | null;
    schoolId?: string;
  } = {}
) {
  const params = new URLSearchParams();
  if (options.onboarding) params.set("onboarding", "1");
  if (!options.onboarding && options.returnTo) {
    const safeReturnTo = safeSchoolConnectionsReturnTo(options.returnTo, juniorId);
    if (safeReturnTo !== "/dashboard/juniors") params.set("returnTo", safeReturnTo);
  }
  if (options.q) params.set("q", options.q);
  if (options.error) params.set("error", options.error);
  if (options.message) params.set("message", options.message);
  if (options.schoolId) params.set("school", options.schoolId);
  const query = params.toString();
  return `/dashboard/juniors/${juniorId}/schools${query ? `?${query}` : ""}`;
}
