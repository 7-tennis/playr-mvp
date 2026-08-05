export const authConfirmationPath = "/auth/confirm";

const emailOtpTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export type AuthConfirmationRequest =
  | { kind: "code"; code: string; next: string }
  | { kind: "invalid"; next: string }
  | { kind: "token_hash"; tokenHash: string; type: string; next: string };

export function safeAuthNextPath(value: string | null | undefined, fallback = "/dashboard/profile") {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function parseAuthConfirmationUrl(url: URL): AuthConfirmationRequest {
  const next = safeAuthNextPath(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");

  if (tokenHash && type && emailOtpTypes.has(type)) {
    return { kind: "token_hash", tokenHash, type, next };
  }

  if (code) {
    return { kind: "code", code, next };
  }

  return { kind: "invalid", next };
}

export function buildAuthConfirmationUrl(origin: string, next: string | null | undefined) {
  const url = new URL(authConfirmationPath, origin);
  const safeNext = safeAuthNextPath(next, "");

  if (safeNext) {
    url.searchParams.set("next", safeNext);
  }

  return url.toString();
}
