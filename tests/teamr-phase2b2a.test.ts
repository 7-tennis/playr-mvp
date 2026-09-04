import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { partitionProfileEvents, type ProfileEventRelevance } from "../lib/event-relevance.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compete = () => repoFile("app/dashboard/compete/page.tsx");
const detail = () => repoFile("app/dashboard/compete/events/[eventId]/page.tsx");
const cardSource = () => compete().match(/function RelevantEventCard[\s\S]*?\n}\n\nfunction EventSection/)?.[0] ?? "";

const event = (overrides: Partial<ProfileEventRelevance> = {}): ProfileEventRelevance => ({
  event_id: "event-1",
  title: "Green Event",
  description: "Long organiser description",
  host_id: "host-1",
  host_name: "Laerskool Kenmare",
  host_type: "school",
  visibility: "closed",
  junior_stage: "green_ball",
  starts_at: "2026-09-01T08:00:00Z",
  ends_at: "2026-09-01T10:00:00Z",
  location: "Court 1",
  capacity: 16,
  relevance_kind: "eligible",
  relevance_reason: "Eligible through Laerskool Kenmare",
  is_assigned: false,
  participation_id: null,
  participation_status: null,
  participation_source: null,
  confirmed_count: 0,
  ...overrides
});

test("compact player selector appears before event discovery", () => {
  const page = compete();
  assert.ok(page.indexOf("Playing as") < page.indexOf('title="Action Required"'));
  assert.match(page, /aria-label="Choose player"/);
  assert.match(page, /aria-current=\{profile\.id === selectedPlayer\.id \? "page"/);
});

test("event hierarchy promotes participation before discovery", () => {
  assert.match(compete(), /title="Action Required"[\s\S]*title="My Competitions"[\s\S]*title="Pending"[\s\S]*title="For You"[\s\S]*title="Open Events"/);
});

test("Selected events are assigned and never repeated in another group", () => {
  const selected = event({ is_assigned: true, relevance_kind: "selected", visibility: "open" });
  const groups = partitionProfileEvents([selected]);
  assert.deepEqual(groups.selected.map((item) => item.event_id), ["event-1"]);
  assert.equal(groups.connected.length, 0);
  assert.equal(groups.open.length, 0);
});

test("unassigned Closed events appear in For You", () => {
  const groups = partitionProfileEvents([event()]);
  assert.equal(groups.connected.length, 1);
  assert.equal(groups.selected.length + groups.open.length, 0);
});

test("unassigned Open events appear in Open Events", () => {
  const groups = partitionProfileEvents([event({ visibility: "open" })]);
  assert.equal(groups.open.length, 1);
  assert.equal(groups.selected.length + groups.connected.length, 0);
});

test("Action Required group is hidden when empty", () => {
  assert.match(compete(), /if \(count === 0 && !empty\) return null/);
  assert.match(compete(), /<EventSection count=\{relevant\.actionRequired\.length\} id="event-invitations" title="Action Required">/);
});

test("For You and Open Events use compact empty messages", () => {
  const page = compete();
  assert.match(page, /empty="No upcoming events from your connected organisations\."/);
  assert.match(page, /empty="No eligible open events right now\."/);
  assert.doesNotMatch(page, /title="No connected events"|title="No Open events"/);
});

test("event cards are whole-card links preserving the player context", () => {
  const card = cardSource();
  assert.match(card, /return <Link/);
  assert.match(card, /events\/\$\{event\.event_id\}\?player=\$\{encodeURIComponent\(playerId\)\}/);
  assert.match(card, /aria-label=\{`View \$\{event\.title\}`\}/);
});

test("event details preserve selected-player context on the return path", () => {
  const page = detail();
  assert.match(page, /loadPlayData\(\{ player: searchParams\?\.player \}\)/);
  assert.match(page, /href=\{`\/dashboard\/compete\?player=\$\{encodeURIComponent\(profile\.id\)\}`\}/);
});

test("compact event cards retain essential discovery metadata", () => {
  const card = cardSource();
  assert.match(card, /eventContextLabel\(event\.host_type\).*event\.host_name/);
  assert.match(card, /event\.title/);
  assert.match(card, /formatDate\(event\.starts_at\).*formatTime\(event\.starts_at\)/);
  assert.match(card, /event\.junior_stage/);
  assert.match(card, /event\.visibility/);
  assert.match(card, /event\.participation_status/);
});

test("compact cards omit location, descriptions and relevance prose", () => {
  const card = cardSource();
  assert.doesNotMatch(card, /event\.location/);
  assert.doesNotMatch(card, /event\.description/);
  assert.doesNotMatch(card, /event\.relevance_reason/);
});

test("School, District and Club contexts remain explicitly labelled", () => {
  const page = compete();
  assert.match(page, /\["school", "school_district"\][\s\S]*return "School"/);
  assert.match(page, /type === "district"[\s\S]*return "District"/);
  assert.match(page, /\["club", "club_academy"\][\s\S]*return "Club"/);
});

test("mobile event rows scroll horizontally with compact card widths", () => {
  assert.match(compete(), /auto-cols-\[minmax\(17rem,82vw\)\][\s\S]*grid-flow-col[\s\S]*overflow-x-auto/);
});

test("desktop event discovery uses efficient multi-column grids", () => {
  assert.match(compete(), /md:grid-flow-row[\s\S]*md:grid-cols-2[\s\S]*xl:grid-cols-3/);
});

test("Matches and Challenges follow the three event groups", () => {
  assert.match(compete(), /title="Open Events"[\s\S]*Matches & Challenges[\s\S]*Challenge Players/);
});

test("existing challenge, upcoming match and recent result journeys remain", () => {
  assert.match(compete(), /Challenge Players[\s\S]*Upcoming Matches[\s\S]*Recent Results/);
});

test("legacy public event discovery remains available below relevance groups", () => {
  const page = compete();
  assert.match(page, /title="More Events"/);
  assert.match(page, /\.is\("venue_id", null\)/);
});

test("Compete does not introduce entry, invitation or scoring controls", () => {
  const page = compete();
  assert.doesNotMatch(page, />\s*(Enter|Register|Invite player|Record score)\s*</i);
});

test("Phase 2B.2A adds no database migration", () => {
  const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url));
  assert.equal(migrations.some((name) => /phase2b2a/i.test(name)), false);
});
