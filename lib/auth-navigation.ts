export function safeInternalPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export function loginPathFor(returnTo: string | null | undefined, error?: string) {
  const params = new URLSearchParams();
  const safeReturnTo = safeInternalPath(returnTo);

  if (error) params.set("error", error);
  if (safeReturnTo) params.set("next", safeReturnTo);

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export function requestPathFromHeaders(requestHeaders: Pick<Headers, "get">) {
  return safeInternalPath(requestHeaders.get("x-playr-request-path"));
}
