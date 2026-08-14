import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReviewTeamRPlayerRequests } from "../lib/teamr-policy.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = () => repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql");

test("school Join uses the canonical linked Junior and rejects arbitrary profiles", () => {
  const action = repoFile("app/dashboard/juniors/schools/actions.ts");
  const sql = migration();

  assert.match(action, /\.eq\("parent_profile_id", parent\.id\)/);
  assert.match(action, /\.eq\("is_junior", true\)/);
  assert.match(action, /teamr_request_school_link/);
  assert.match(sql, /join public\.profiles parent on parent\.id = junior\.parent_profile_id/);
  assert.match(sql, /parent\.user_id = actor_user_id/);
  assert.match(sql, /venue\.organisation_type in \('school', 'school_district'\)/);
  assert.match(sql, /teamr_discover_schools[\s\S]*venue\.discovery_visibility = 'public'/);
  assert.match(sql, /teamr_request_school_link[\s\S]*venue\.discovery_visibility = 'public'/);
  assert.match(sql, /not exists \([\s\S]*venue\.organisation_type in \('school', 'district', 'school_district'\)/);
  assert.doesNotMatch(action, /\.insert\([\s\S]*profiles/);
});

test("pending and active school requests are idempotent with deliberate rejoin handling", () => {
  const sql = migration();

  assert.match(sql, /if link_record\.status = 'active'[\s\S]*'reused', true/);
  assert.match(sql, /elsif link_record\.status = 'pending'[\s\S]*'reused', true/);
  assert.match(sql, /elsif link_record\.status = 'suspended'[\s\S]*connection_suspended/);
  assert.match(sql, /set status = 'pending'[\s\S]*declined_at = null/);
  assert.match(repoFile("supabase/migrations/202607120002_playr_foundation_phase.sql"), /organisation_player_links_active_unique[\s\S]*where status in \('pending', 'active', 'suspended'\)/);
});

test("only coordinators and organisation admins review requests while team managers manage teams", () => {
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: "organisation_admin", role: "club_admin" }), true);
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: "sports_coordinator", role: "player" }), true);
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: "team_manager", role: "player" }), false);
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: "coach", role: "coach" }), false);
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: "club_manager", role: "club_admin" }), false);
  assert.equal(canReviewTeamRPlayerRequests({ activeOrganisationRole: null, role: "platform_admin" }), true);

  const sql = migration();
  assert.match(sql, /teamr_user_can_review_player_requests[\s\S]*membership\.role in \('organisation_admin', 'sports_coordinator'\)/);
  assert.match(sql, /teamr_user_can_manage_teams[\s\S]*membership\.role in \('organisation_admin', 'sports_coordinator', 'team_manager'\)/);
});

test("approval and rejection lock the request and enforce its organisation on the server", () => {
  const action = repoFile("app/dashboard/teamr/actions.ts");
  const sql = migration();

  assert.match(action, /canReviewTeamRPlayerRequests\(context\)/);
  assert.match(action, /rpc\("teamr_review_player_request"/);
  assert.match(sql, /where link\.id = p_link_id\s+for update/);
  assert.match(sql, /teamr_user_can_review_player_requests\(link_record\.venue_id, actor_user_id\)/);
  assert.match(sql, /if link_record\.status <> 'pending'/);
  assert.match(sql, /target_status := case when p_decision = 'approve' then 'active' else 'declined' end/);
});

test("approved players and pending requests are kept separate in TeamR", () => {
  const source = repoFile("lib/teamr.ts");
  const page = repoFile("app/dashboard/teamr/players/page.tsx");

  assert.match(source, /\.eq\("status", "active"\)/);
  assert.match(source, /\.eq\("status", "pending"\)/);
  assert.match(page, /Active Players/);
  assert.match(page, /Pending Requests/);
  assert.match(page, /juniorStage/);
});

test("teams are created and updated only in the active organisation context", () => {
  const action = repoFile("app/dashboard/teamr/actions.ts");
  const sql = migration();

  assert.match(action, /venue_id: context\.venueId/);
  assert.match(action, /\.eq\("venue_id", context\.venueId\)/g);
  assert.doesNotMatch(action, /text\(formData, "venueId"\)/);
  assert.match(sql, /teamr_teams_id_venue_unique unique \(id, venue_id\)/);
  assert.match(sql, /grant update \(name, junior_stage, status\) on public\.teamr_teams/);
  assert.doesNotMatch(sql, /grant select, insert, update on public\.teamr_teams to authenticated/);
});

test("rosters structurally require the team and canonical player link to share an organisation", () => {
  const sql = migration();

  assert.match(sql, /foreign key \(team_id, venue_id\)[\s\S]*references public\.teamr_teams\(id, venue_id\)/);
  assert.match(sql, /foreign key \(organisation_player_link_id, venue_id\)[\s\S]*references public\.organisation_player_links\(id, venue_id\)/);
  assert.match(sql, /link\.status = 'active'/);
  assert.match(sql, /teamr_roster_team_player_unique unique \(team_id, organisation_player_link_id\)/);
});

test("roster server actions reject pending, cross-organisation and guessed records", () => {
  const action = repoFile("app/dashboard/teamr/actions.ts");

  assert.match(action, /\.from\("organisation_player_links"\)[\s\S]*\.eq\("venue_id", context\.venueId\)\.eq\("status", "active"\)/);
  assert.match(action, /\.from\("teamr_teams"\)[\s\S]*\.eq\("venue_id", context\.venueId\)\.eq\("status", "active"\)/);
  assert.match(action, /\.delete\(\)[\s\S]*\.eq\("team_id", teamId\)[\s\S]*\.eq\("venue_id", context\.venueId\)/);
});

test("RLS covers every TeamR table operation and intentionally omits team deletion", () => {
  const sql = migration();

  assert.match(sql, /alter table public\.teamr_teams enable row level security/);
  assert.match(sql, /alter table public\.teamr_roster_memberships enable row level security/);
  assert.match(sql, /on public\.teamr_teams\s+for select/);
  assert.match(sql, /on public\.teamr_teams\s+for insert/);
  assert.match(sql, /on public\.teamr_teams\s+for update/);
  assert.doesNotMatch(sql, /on public\.teamr_teams\s+for delete/);
  assert.match(sql, /on public\.teamr_roster_memberships\s+for select/);
  assert.match(sql, /on public\.teamr_roster_memberships\s+for insert/);
  assert.match(sql, /on public\.teamr_roster_memberships\s+for delete/);
  assert.match(sql, /to authenticated/g);
  assert.match(sql, /revoke all on function public\.teamr_request_school_link\(uuid, uuid\) from public, anon/);
});

test("Phase 2A remains connected-profile only and does not implement deferred event or messaging tables", () => {
  const sql = migration();

  assert.doesNotMatch(sql, /create table[^;]*(profile|player)(s|_identity)/i);
  assert.doesNotMatch(sql, /create table[^;]*(event|fixture|message|notification|attendance|result)/i);
  assert.doesNotMatch(sql, /create table[^;]*rating/i);
  assert.match(sql, /organisation_player_link_id uuid not null/);
});
