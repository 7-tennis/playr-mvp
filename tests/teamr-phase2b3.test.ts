import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { partitionProfileEvents, type ProfileEventRelevance } from "../lib/event-relevance.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = () => repoFile("supabase/migrations/20260831195304_teamr_phase2b3_event_participation_lifecycle.sql");
const phase2b2 = () => repoFile("supabase/migrations/20260827085033_teamr_phase2b2_profile_event_relevance_assignments.sql");
const compete = () => repoFile("app/dashboard/compete/page.tsx");
const playerDetail = () => repoFile("app/dashboard/compete/events/[eventId]/page.tsx");
const playerActions = () => repoFile("app/dashboard/compete/events/[eventId]/actions.ts");
const organiserDetail = () => repoFile("app/dashboard/teamr/competitions/[eventId]/page.tsx");
const organiserActions = () => repoFile("app/dashboard/teamr/competitions/actions.ts");

function functionBody(name: string, source = sql()) {
  return source.match(new RegExp(`create(?: or replace)? function (?:public|private)\\.${name}[\\s\\S]*?\\$\\$;`))?.[0] ?? "";
}

const event = (overrides: Partial<ProfileEventRelevance> = {}): ProfileEventRelevance => ({
  event_id: "event-1", title: "Green Event", description: null, host_id: "host-1",
  host_name: "Laerskool Kenmare", host_type: "school", visibility: "closed",
  junior_stage: "green_ball", starts_at: "2026-09-10T08:00:00Z", ends_at: "2026-09-10T10:00:00Z",
  location: null, capacity: 16, relevance_kind: "eligible", relevance_reason: "Eligible through Laerskool Kenmare",
  is_assigned: false, participation_id: null, participation_status: null, participation_source: null,
  confirmed_count: 0, ...overrides
});

test("Phase 2B.2 active selections migrate forward as invitations", () => {
  assert.match(sql(), /update public\.event_player_assignments[\s\S]*set status = 'invited',[\s\S]*participation_source = 'organiser_invite'[\s\S]*where status = 'active'/);
});

test("the lifecycle uses only the five deliberate statuses", () => {
  assert.match(sql(), /status in \('invited', 'entry_requested', 'confirmed', 'declined', 'removed'\)/);
  assert.doesNotMatch(sql(), /waitlisted|pending_parent|viewed|opened|maybe/);
});

test("participation source distinguishes organiser invitations from player requests", () => {
  assert.match(sql(), /participation_source in \('organiser_invite', 'player_request'\)/);
});

test("invited lifecycle metadata must remain unresponded and unconfirmed", () => {
  assert.match(sql(), /status = 'invited'[\s\S]*participation_source = 'organiser_invite'[\s\S]*responded_at is null[\s\S]*confirmed_at is null/);
});

test("entry requests must be player-originated and unconfirmed", () => {
  assert.match(sql(), /status = 'entry_requested'[\s\S]*participation_source = 'player_request'[\s\S]*responded_at is null[\s\S]*confirmed_at is null/);
});

test("confirmed rows require both response and confirmation timestamps", () => {
  assert.match(sql(), /status = 'confirmed'[\s\S]*responded_at is not null[\s\S]*confirmed_at is not null/);
});

test("declined rows cannot retain confirmation metadata", () => {
  assert.match(sql(), /status = 'declined'[\s\S]*responded_at is not null[\s\S]*confirmed_at is null/);
});

test("removed rows preserve history through durable removal metadata", () => {
  assert.match(sql(), /status = 'removed'[\s\S]*removed_at is not null/);
  assert.doesNotMatch(functionBody("remove_event_player_assignment"), /delete from/);
});

test("organiser invite creates an invited organiser-source relationship", () => {
  const fn = functionBody("invite_event_player");
  assert.match(fn, /'invited', 'organiser_invite'/);
  assert.match(organiserActions(), /rpc\("invite_event_player"/);
});

test("organiser invitation is restricted to Closed events", () => {
  assert.match(functionBody("invite_event_player"), /target_event\.visibility <> 'closed'[\s\S]*invitation_unavailable/);
});

test("Closed School invitation revalidates current exact-host eligibility", () => {
  assert.match(functionBody("invite_event_player"), /private\.player_is_eligible_for_event\(p_event_id, p_player_profile_id\)/);
  assert.match(phase2b2(), /host\.organisation_type in \('school', 'school_district'\)[\s\S]*link\.venue_id = host\.id[\s\S]*link\.status = 'active'/);
});

test("Closed School outsiders fail the shared eligibility predicate", () => {
  assert.match(functionBody("invite_event_player"), /raise exception 'player_not_eligible'/);
});

test("inherited District invitations reuse School to District eligibility", () => {
  assert.match(phase2b2(), /host\.organisation_type in \('district', 'school_district'\)[\s\S]*relationship\.parent_venue_id = host\.id[\s\S]*relationship_type = 'belongs_to'/);
  assert.match(functionBody("invite_event_player"), /private\.player_is_eligible_for_event/);
});

test("District invitation creates no direct District player membership", () => {
  const fn = functionBody("invite_event_player");
  assert.doesNotMatch(fn, /insert into public\.organisation_player_links|insert into public\.club_memberships/);
});

test("Club-compatible invitation continues through canonical active membership", () => {
  assert.match(phase2b2(), /host\.organisation_type in \('club', 'club_academy'\)[\s\S]*club_memberships membership[\s\S]*membership\.status = 'active'/);
});

test("managed-Junior entry requests require canonical profile authority", () => {
  assert.match(functionBody("request_event_entry"), /public\.can_manage_profile\(p_player_profile_id, actor_user_id\)/);
});

test("arbitrary-profile entry requests are rejected inside the RPC", () => {
  assert.match(functionBody("request_event_entry"), /raise exception 'profile_access'/);
  assert.doesNotMatch(playerActions(), /from\("profiles"\).*update|service_role/);
});

test("adult self-management uses the same canonical authority helper", () => {
  assert.match(phase2b2(), /public\.can_manage_profile\(p_player_profile_id, actor_user_id\)/);
  assert.match(functionBody("respond_event_invitation"), /public\.can_manage_profile\(target_profile_id, actor_user_id\)/);
});

test("Open entry requests are unavailable for Closed events", () => {
  assert.match(functionBody("request_event_entry"), /target_event\.visibility <> 'open'[\s\S]*entry_unavailable/);
});

test("Open entry request revalidates stage and all shared eligibility", () => {
  assert.match(functionBody("request_event_entry"), /private\.player_is_eligible_for_event\(p_event_id, p_player_profile_id\)/);
  assert.match(phase2b2(), /private\.event_stage_matches_profile/);
});

test("Draft, Cancelled, Completed, Archived and past events reject mutations", () => {
  const helper = functionBody("event_accepts_participation_mutations");
  assert.match(helper, /event\.status = 'published'/);
  assert.match(helper, /event\.archived_at is null/);
  assert.match(helper, /coalesce\(event\.starts_at, event\.start_datetime\) >= now\(\)/);
  for (const fn of ["invite_event_player", "request_event_entry", "respond_event_invitation", "review_event_entry_request", "remove_event_player_assignment"]) {
    assert.match(functionBody(fn), /event_accepts_participation_mutations/);
  }
});

test("parent or player can only respond to an active organiser invitation", () => {
  const fn = functionBody("respond_event_invitation");
  assert.match(fn, /target\.status <> 'invited'/);
  assert.match(fn, /target\.participation_source <> 'organiser_invite'/);
});

test("accepting an invitation transitions exactly to confirmed", () => {
  const fn = functionBody("respond_event_invitation");
  assert.match(fn, /if p_accept then[\s\S]*set status = 'confirmed'/);
});

test("declining an invitation transitions exactly to declined", () => {
  const fn = functionBody("respond_event_invitation");
  assert.match(fn, /else[\s\S]*set status = 'declined'/);
  assert.match(playerDetail(), />Decline<\/SubmitButton>/);
});

test("declined invitations never count as confirmed", () => {
  assert.doesNotMatch(functionBody("respond_event_invitation").match(/set status = 'declined'[\s\S]*?where id = target\.id/)?.[0] ?? "", /confirmed_at = now\(\)/);
});

test("Open eligible player request creates entry_requested", () => {
  assert.match(functionBody("request_event_entry"), /'entry_requested', 'player_request'/);
  assert.match(playerActions(), /rpc\("request_event_entry"/);
});

test("organiser review requires Event Manager or Coordinator authority", () => {
  assert.match(functionBody("review_event_entry_request"), /private\.user_can_manage_event_players\(target_event_id, actor_user_id\)/);
  assert.match(phase2b2(), /user_can_manage_event_players[\s\S]*array\['event_manager', 'coordinator'\]/);
});

test("organiser can only review a pending player request", () => {
  const fn = functionBody("review_event_entry_request");
  assert.match(fn, /target\.status <> 'entry_requested'/);
  assert.match(fn, /target\.participation_source <> 'player_request'/);
});

test("organiser approval confirms and rejection declines", () => {
  const fn = functionBody("review_event_entry_request");
  assert.match(fn, /if p_approve then[\s\S]*set status = 'confirmed'/);
  assert.match(fn, /else[\s\S]*set status = 'declined'/);
});

test("unauthorised organiser review fails before mutation", () => {
  assert.match(functionBody("review_event_entry_request"), /raise exception 'request_access'/);
});

test("current eligibility is revalidated at both confirmation paths", () => {
  assert.match(functionBody("respond_event_invitation"), /private\.player_is_eligible_for_event\(target\.event_id, target\.player_profile_id\)/);
  assert.match(functionBody("review_event_entry_request"), /private\.player_is_eligible_for_event\(target\.event_id, target\.player_profile_id\)/);
});

test("capacity counts confirmed participants only", () => {
  for (const fn of ["request_event_entry", "respond_event_invitation", "review_event_entry_request"]) {
    assert.match(functionBody(fn), /where assignment\.event_id = [^;]+ and assignment\.status = 'confirmed'/);
  }
});

test("invitations and entry requests do not consume capacity", () => {
  const capacityQueries = ["request_event_entry", "respond_event_invitation", "review_event_entry_request"].map((name) => functionBody(name));
  for (const fn of capacityQueries) {
    assert.doesNotMatch(fn.match(/select count\(\*\)::integer into confirmed_count[\s\S]*?;/)?.[0] ?? "", /invited|entry_requested/);
  }
});

test("confirmation locks the event row before counting capacity", () => {
  for (const fn of ["respond_event_invitation", "review_event_entry_request"]) {
    const body = functionBody(fn);
    assert.ok(body.indexOf("from public.events event where event.id = target_event_id for update") < body.indexOf("into confirmed_count"));
  }
});

test("concurrent final-slot confirmations fail safely instead of overbooking", () => {
  for (const fn of ["respond_event_invitation", "review_event_entry_request"]) {
    assert.match(functionBody(fn), /target_event\.capacity is not null and confirmed_count >= target_event\.capacity[\s\S]*raise exception 'event_full'/);
  }
});

test("requesting at an already-full Open event also returns event_full", () => {
  assert.match(functionBody("request_event_entry"), /confirmed_count >= target_event\.capacity[\s\S]*raise exception 'event_full'/);
});

test("duplicate current participation is database prevented", () => {
  assert.match(sql(), /create unique index event_player_assignments_current_unique[\s\S]*where status in \('invited', 'entry_requested', 'confirmed'\)/);
});

test("invalid duplicate invitation and request transitions are rejected", () => {
  for (const fn of ["invite_event_player", "request_event_entry"]) {
    assert.match(functionBody(fn), /target\.status in \('invited', 'entry_requested', 'confirmed'\)[\s\S]*duplicate_participation/);
  }
});

test("declined and removed rows can be safely reused without duplicate history", () => {
  for (const fn of ["invite_event_player", "request_event_entry"]) {
    const body = functionBody(fn);
    assert.match(body, /if target\.id is null then[\s\S]*else[\s\S]*update public\.event_player_assignments/);
    assert.match(body, /responded_at = null[\s\S]*confirmed_at = null[\s\S]*removed_at = null/);
  }
});

test("organiser removal is a soft transition from only current states", () => {
  const fn = functionBody("remove_event_player_assignment");
  assert.match(fn, /target\.status not in \('invited', 'entry_requested', 'confirmed'\)/);
  assert.match(fn, /set status = 'removed'/);
});

test("Event Manager and Coordinator manage participation while Coach and Official do not", () => {
  const manage = functionBody("user_can_manage_event_players", phase2b2());
  assert.match(manage, /array\['event_manager', 'coordinator'\]/);
  assert.doesNotMatch(manage, /'coach'|'official'/);
});

test("Coach and Official participant visibility is confirmed-only", () => {
  const list = functionBody("get_event_player_assignments");
  assert.match(list, /array\['event_manager', 'coordinator', 'coach', 'official'\]/);
  assert.match(list, /can_manage or assignment\.status = 'confirmed'/);
  assert.match(sql(), /status = 'confirmed'[\s\S]*private\.user_can_view_event_operations/);
});

test("participant RLS allows own profile, managers, or confirmed operational access only", () => {
  assert.match(sql(), /create policy "Participation is visible to its player or authorised event staff"[\s\S]*can_manage_profile\(player_profile_id[\s\S]*user_can_manage_event_players[\s\S]*status = 'confirmed'/);
});

test("direct participation writes remain unavailable to authenticated clients", () => {
  assert.match(sql(), /revoke all privileges on table public\.event_player_assignments from public, anon, authenticated, service_role/);
  assert.match(sql(), /grant select on table public\.event_player_assignments to authenticated/);
  assert.doesNotMatch(sql(), /grant (insert|update|delete).*event_player_assignments to authenticated/i);
});

test("security-definer lifecycle RPCs pin search_path and revoke default execution", () => {
  for (const fn of ["invite_event_player", "request_event_entry", "respond_event_invitation", "review_event_entry_request"]) {
    assert.match(functionBody(fn), /security definer[\s\S]*set search_path = ''/);
    assert.match(sql(), new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(sql(), new RegExp(`grant execute on function public\\.${fn}[^;]+to authenticated`));
  }
});

test("event-read RLS retains explicit access to its hardened private helper", () => {
  assert.match(sql(), /revoke all on function private\.user_can_read_profile_event\(uuid, uuid\)[\s\S]*grant execute on function private\.user_can_read_profile_event\(uuid, uuid\) to authenticated, service_role/);
});

test("Open-event profile discovery remains search-gated and capped", () => {
  const fn = functionBody("get_event_assignment_candidates");
  assert.match(fn, /event_visibility = 'open' and length\(btrim[\s\S]*< 2/);
  assert.match(fn, /limit 60/);
});

test("Compete groups lifecycle events in highest-priority order", () => {
  assert.match(compete(), /title="Action Required"[\s\S]*title="My Competitions"[\s\S]*title="Pending"[\s\S]*title="For You"[\s\S]*title="Open Events"/);
});

test("partitioning prevents one event from appearing in multiple Compete groups", () => {
  const rows = [
    event({ event_id: "invite", participation_id: "p1", participation_status: "invited", participation_source: "organiser_invite", relevance_kind: "invited", is_assigned: true }),
    event({ event_id: "request", participation_id: "p2", participation_status: "entry_requested", participation_source: "player_request", relevance_kind: "entry_requested", is_assigned: true, visibility: "open" }),
    event({ event_id: "confirmed", participation_id: "p3", participation_status: "confirmed", participation_source: "organiser_invite", relevance_kind: "confirmed", is_assigned: true }),
    event({ event_id: "closed" }),
    event({ event_id: "open", visibility: "open" })
  ];
  const groups = partitionProfileEvents(rows);
  const ids = [...groups.actionRequired, ...groups.confirmed, ...groups.pending, ...groups.connected, ...groups.open].map((row) => row.event_id);
  assert.equal(new Set(ids).size, rows.length);
  assert.deepEqual(ids, ["invite", "confirmed", "request", "closed", "open"]);
});

test("player detail exposes Accept and Decline only for invitations", () => {
  const page = playerDetail();
  assert.match(page, /participation_status === "invited"[\s\S]*>Accept<[\s\S]*>Decline</);
});

test("player detail exposes Request Entry only for eligible Open events", () => {
  assert.match(playerDetail(), /!relevance\?\.participation_status && relevance\?\.visibility === "open"[\s\S]*Request Entry/);
});

test("confirmed and pending player states are explicit", () => {
  const page = playerDetail();
  assert.match(page, /participation_status === "entry_requested"[\s\S]*Entry requested/);
  assert.match(page, /participation_status === "confirmed"[\s\S]*You&apos;re entered for this event/);
});

test("selected profile survives detail actions and return navigation", () => {
  assert.match(playerActions(), /new URLSearchParams\(\{ player: playerId \}\)/);
  assert.match(playerDetail(), /dashboard\/compete\?player=\$\{encodeURIComponent\(profile\.id\)\}/);
});

test("organiser UI shows confirmed capacity plus invitation and request queues", () => {
  const page = organiserDetail();
  assert.match(page, /Confirmed \{operations\.confirmedCount\}/);
  assert.match(page, /Invited \{invitationCount\}/);
  assert.match(page, /Requests \{requestCount\}/);
  assert.match(page, />Approve<\/SubmitButton>[\s\S]*>Reject<\/SubmitButton>/);
});

test("organiser UI hides lifecycle actions once event mutations close", () => {
  assert.match(organiserDetail(), /participationMutable = event\.status === "published"[\s\S]*new Date\(startsAt\).*Date\.now/);
  assert.match(organiserDetail(), /operations\.canManagePlayers && participationMutable/);
});

test("confirmed counts returned to players count confirmed rows only", () => {
  const fn = functionBody("get_profile_event_relevance");
  assert.match(fn, /select count\(\*\)[\s\S]*confirmed\.status = 'confirmed'/);
});

test("legacy paid event_entries remains completely isolated", () => {
  const migration = sql();
  assert.doesNotMatch(migration, /alter table public\.event_entries|insert into public\.event_entries|update public\.event_entries|delete from public\.event_entries/);
  assert.match(repoFile("app/events/[slug]/actions.ts"), /from\("event_entries"\)/);
});

test("participation is ranking-publication independent", () => {
  assert.doesNotMatch(sql(), /ranking_publication|public_playr_rank|ranking_entry/);
});

test("participation always references the canonical PlayR profile", () => {
  assert.match(phase2b2(), /player_profile_id uuid not null references public\.profiles\(id\)/);
  assert.doesNotMatch(sql(), /create table[^;]*(teamr|clubr).*participant/i);
});

test("Phase 2A Team and Roster architecture remains untouched", () => {
  assert.doesNotMatch(sql(), /alter table public\.(teamr_teams|teamr_roster_memberships|organisation_player_links|organisation_relationships)/);
});

test("notifications, attendance, draws and scoring remain deferred", () => {
  assert.doesNotMatch(sql(), /insert into public\.notifications|create table[^;]*(notification|attendance|check_in|draw|fixture|standing|score)/i);
});
