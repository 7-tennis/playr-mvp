export type CoachInvitationRole = "head_coach" | "coach" | "assistant_coach";

export type CoachInvitationInput = {
  email: string;
  invitedName: string | null;
  invitedPhone: string | null;
  role: CoachInvitationRole;
  venueId: string;
};

type InvitationError = { message?: string } | null;

export type CoachInvitationDependencies = {
  create: (input: CoachInvitationInput) => Promise<{ data: string | null; error: InvitationError }>;
  findPending: (input: CoachInvitationInput) => Promise<string | null>;
};

export type CoachInvitationResult =
  | { ok: true; reused: boolean; token: string }
  | { ok: false; error: string };

const actionableErrors = new Set([
  "access",
  "duplicate_invitation",
  "invalid_role",
  "invalid_venue",
  "missing_fields"
]);

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function recoverPendingInvitation(input: CoachInvitationInput, dependencies: CoachInvitationDependencies, timeoutMs: number) {
  const recovered = await settleWithin(dependencies.findPending(input), Math.min(timeoutMs, 3_000));
  return recovered.timedOut ? null : recovered.value;
}

export async function createCoachInvitation(
  input: CoachInvitationInput,
  dependencies: CoachInvitationDependencies,
  timeoutMs = 15_000
): Promise<CoachInvitationResult> {
  const normalizedInput = { ...input, email: input.email.trim().toLowerCase() };
  const created = await settleWithin(dependencies.create(normalizedInput), timeoutMs);

  if (created.timedOut) {
    const recoveredToken = await recoverPendingInvitation(normalizedInput, dependencies, timeoutMs);
    return recoveredToken ? { ok: true, reused: true, token: recoveredToken } : { ok: false, error: "invite_timeout" };
  }

  if (!created.value.error && created.value.data) {
    return { ok: true, reused: false, token: created.value.data };
  }

  const error = created.value.error?.message ?? "invite_failed";

  if (error === "duplicate_invitation") {
    const recoveredToken = await recoverPendingInvitation(normalizedInput, dependencies, timeoutMs);
    if (recoveredToken) return { ok: true, reused: true, token: recoveredToken };
  }

  return { ok: false, error: actionableErrors.has(error) ? error : "invite_failed" };
}
