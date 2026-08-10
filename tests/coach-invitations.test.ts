import assert from "node:assert/strict";
import test from "node:test";
import { createCoachInvitation, type CoachInvitationDependencies, type CoachInvitationInput } from "../lib/coach-invitations.ts";

const existingPlayerInput: CoachInvitationInput = {
  email: " EXISTING.PLAYER@example.com ",
  invitedName: "Existing Player",
  invitedPhone: null,
  role: "coach",
  venueId: "venue-1"
};

test("creates a Coach invitation for an existing PlayR-only email", async () => {
  const received: CoachInvitationInput[] = [];
  const dependencies: CoachInvitationDependencies = {
    create: async (input) => {
      received.push(input);
      return { data: "token-1", error: null };
    },
    findPending: async () => null
  };

  assert.deepEqual(await createCoachInvitation(existingPlayerInput, dependencies), { ok: true, reused: false, token: "token-1" });
  assert.equal(received[0]?.email, "existing.player@example.com");
  assert.equal(received[0]?.role, "coach");
});

test("recovers a duplicate pending invitation for idempotent retry", async () => {
  const dependencies: CoachInvitationDependencies = {
    create: async () => ({ data: null, error: { message: "duplicate_invitation" } }),
    findPending: async () => "existing-token"
  };

  assert.deepEqual(await createCoachInvitation(existingPlayerInput, dependencies), { ok: true, reused: true, token: "existing-token" });
});

test("recovers a partially completed request after the response times out", async () => {
  const dependencies: CoachInvitationDependencies = {
    create: async () => await new Promise(() => undefined),
    findPending: async () => "committed-token"
  };

  assert.deepEqual(await createCoachInvitation(existingPlayerInput, dependencies, 5), { ok: true, reused: true, token: "committed-token" });
});

test("returns an actionable timeout without changing authentication", async () => {
  const dependencies: CoachInvitationDependencies = {
    create: async () => await new Promise(() => undefined),
    findPending: async () => null
  };

  assert.deepEqual(await createCoachInvitation(existingPlayerInput, dependencies, 5), { ok: false, error: "invite_timeout" });
});

test("surfaces database failures without treating them as login failures", async () => {
  const dependencies: CoachInvitationDependencies = {
    create: async () => ({ data: null, error: { message: "access" } }),
    findPending: async () => null
  };

  assert.deepEqual(await createCoachInvitation(existingPlayerInput, dependencies), { ok: false, error: "access" });
});
