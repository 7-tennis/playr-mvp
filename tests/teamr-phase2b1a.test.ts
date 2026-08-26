import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageOrganisationEvents, organisationEventErrorMessage, validateOrganisationEventInput, type OrganisationEventFormInput } from "../lib/organisation-event-policy.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = () => repoFile("app/dashboard/teamr/competitions/actions.ts");
const migration = () => repoFile("supabase/migrations/20260820185627_teamr_phase2b1_shared_event_foundation.sql");

function validInput(overrides: Partial<OrganisationEventFormInput> = {}): OrganisationEventFormInput {
  return {
    capacity: "16",
    date: "2026-09-12",
    description: "Kenmare Green development event",
    endTime: "11:00",
    juniorStage: "green_ball",
    location: "Laerskool Kenmare courts",
    startTime: "09:00",
    title: "Kenmare Green Event",
    visibility: "closed",
    ...overrides
  };
}

test("Sports Coordinator can submit a valid Closed School event", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "sports_coordinator", organisationType: "school", role: "player" }), true);
  const result = validateOrganisationEventInput(validInput());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.visibility, "closed");
});

test("Sports Coordinator can submit a valid Open School event", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "sports_coordinator", organisationType: "school", role: "player" }), true);
  const result = validateOrganisationEventInput(validInput({ visibility: "open" }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.visibility, "open");
});

test("Organisation Admin can create a School event", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "organisation_admin", organisationType: "school", role: "club_admin" }), true);
});

test("valid District event creation remains authorised", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "sports_coordinator", organisationType: "district", role: "player" }), true);
});

test("cross-organisation host input remains impossible in the server action", () => {
  const source = actions();
  assert.match(source, /venue_id: context\.venueId/);
  assert.match(source, /\.eq\("venue_id", context\.venueId\)/);
  assert.doesNotMatch(source, /text\(formData, "venueId"\)/);
});

test("unsupported event host remains rejected", () => {
  assert.equal(canManageOrganisationEvents({ activeOrganisationRole: "organisation_admin", organisationType: "academy", role: "club_admin" }), false);
  assert.match(migration(), /unsupported_event_host/);
});

test("same-day SAST start and end become ordered UTC timestamps", () => {
  const result = validateOrganisationEventInput(validInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.startsAt, "2026-09-12T07:00:00.000Z");
  assert.equal(result.value.endsAt, "2026-09-12T09:00:00.000Z");
});

test("end-before-start is rejected with the time-specific error", () => {
  assert.deepEqual(validateOrganisationEventInput(validInput({ endTime: "08:59" })), { error: "invalid_time", ok: false });
  assert.match(organisationEventErrorMessage("invalid_time") ?? "", /end time is later/);
});

test("Green stage persists in the validated database payload", () => {
  const result = validateOrganisationEventInput(validInput());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.juniorStage, "green_ball");
});

test("capacity persists as a positive integer", () => {
  const result = validateOrganisationEventInput(validInput({ capacity: "32" }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.capacity, 32);
});

test("invalid capacity is rejected with a specific safe message", () => {
  assert.deepEqual(validateOrganisationEventInput(validInput({ capacity: "1.5" })), { error: "invalid_capacity", ok: false });
  assert.match(organisationEventErrorMessage("invalid_capacity") ?? "", /whole number greater than zero/);
});

test("missing required values are identified before database submission", () => {
  assert.deepEqual(validateOrganisationEventInput(validInput({ location: "" })), { error: "missing_required", ok: false });
  assert.match(organisationEventErrorMessage("missing_required") ?? "", /required event field/);
});

test("Draft and Published creation values remain explicit", () => {
  const source = actions();
  assert.match(source, /requestedStatus === "published" \? "published" : "draft"/);
  assert.match(source, /status,/);
});

test("schema-cache failures are logged in detail and mapped to safe UX", () => {
  const source = actions();
  assert.match(source, /error\?\.code === "PGRST204"/);
  assert.match(source, /database_operation_failed/);
  assert.match(source, /message: error\?\.message/);
  assert.equal(organisationEventErrorMessage("schema_unavailable"), "Event creation is temporarily unavailable. Please contact PlayR support.");
});

test("unauthorised organisations receive a distinct safe error", () => {
  assert.match(organisationEventErrorMessage("access") ?? "", /not authorised/);
  assert.match(actions(), /error\?\.code === "42501"/);
});

test("event grants and RLS remain least privilege", () => {
  const sql = migration();
  assert.match(sql, /revoke all privileges on table public\.events[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant insert on table public\.events to authenticated/);
  assert.doesNotMatch(sql, /grant delete on table public\.events to authenticated/i);
  assert.match(sql, /create policy "Organisation managers can create events"[\s\S]*user_can_manage_organisation_events\(venue_id\)/);
});
