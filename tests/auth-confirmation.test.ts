import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthConfirmationUrl, parseAuthConfirmationUrl, safeAuthNextPath } from "../lib/auth-confirmation.ts";

test("builds the exact deployed PKCE confirmation callback", () => {
  assert.equal(
    buildAuthConfirmationUrl("https://playr-mvp.vercel.app", "/dashboard/profile"),
    "https://playr-mvp.vercel.app/auth/confirm?next=%2Fdashboard%2Fprofile"
  );
});

test("accepts a PKCE authorization code", () => {
  assert.deepEqual(
    parseAuthConfirmationUrl(new URL("https://playr-mvp.vercel.app/auth/confirm?code=code-value&next=%2Fdashboard")),
    { kind: "code", code: "code-value", next: "/dashboard" }
  );
});

test("accepts a Supabase email token hash", () => {
  assert.deepEqual(
    parseAuthConfirmationUrl(new URL("https://playr-mvp.vercel.app/auth/confirm?token_hash=hash-value&type=signup")),
    { kind: "token_hash", tokenHash: "hash-value", type: "signup", next: "/dashboard/profile" }
  );
});

test("rejects fragments, unsupported token types, and unsafe next paths", () => {
  assert.deepEqual(
    parseAuthConfirmationUrl(new URL("https://playr-mvp.vercel.app/auth/confirm#access_token=secret")),
    { kind: "invalid", next: "/dashboard/profile" }
  );
  assert.deepEqual(
    parseAuthConfirmationUrl(new URL("https://playr-mvp.vercel.app/auth/confirm?token_hash=hash&type=phone&next=https://evil.example")),
    { kind: "invalid", next: "/dashboard/profile" }
  );
  assert.equal(safeAuthNextPath("//evil.example"), "/dashboard/profile");
});
