import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultDiscoveryVisibility, organisationCapabilities } from "../lib/organisation-capabilities.ts";

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = () => repoFile("supabase/migrations/20260815120000_teamr_phase2a1_school_district_context.sql");

test("organisation types resolve to explicit product capabilities", () => {
  assert.equal(organisationCapabilities("club").courtBooking, true);
  assert.equal(organisationCapabilities("school").courtBooking, false);
  assert.equal(organisationCapabilities("school").membershipPlans, false);
  assert.equal(organisationCapabilities("school").schoolDiscovery, true);
  assert.equal(organisationCapabilities("district").districtContext, true);
  assert.equal(organisationCapabilities("district").clubDiscovery, false);
  assert.equal(defaultDiscoveryVisibility("school"), "public");
  assert.equal(defaultDiscoveryVisibility("club"), "hidden");
});

test("ClubR connected venues exclude schools and capability-less hybrids", () => {
  const sql = migration();
  const source = repoFile("lib/venues.ts");
  assert.match(source, /rpc\("playr_profile_club_venues"/);
  assert.match(sql, /venue\.organisation_type = 'club'/);
  assert.match(sql, /venue\.organisation_type = 'club_academy'[\s\S]*public\.courts[\s\S]*club_membership_plans/);
  assert.doesNotMatch(sql.match(/create function public\.playr_profile_club_venues[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /organisation_type in \('school'/);
});

test("school discovery exposes minimal public school identity and optional district context", () => {
  const sql = migration();
  assert.match(sql, /school\.organisation_type in \('school', 'school_district'\)/);
  assert.match(sql, /school\.discovery_visibility = 'public'/);
  assert.match(sql, /district\.organisation_type in \('district', 'school_district'\)/);
  assert.doesNotMatch(sql.match(/create function public\.teamr_discover_schools[\s\S]*?end;\n\$\$;/)?.[0] ?? "", /contact_email|contact_phone|membership|court_count/);
});

test("school creation and admin controls make discovery deliberate", () => {
  const action = repoFile("app/admin/organisations/actions.ts");
  const page = repoFile("app/admin/organisations/page.tsx");
  assert.match(action, /defaultDiscoveryVisibility\(organisationType\)/);
  assert.match(action, /updateSchoolDiscovery/);
  assert.match(page, /Make Discoverable/);
  assert.match(page, /Public school identity and location only/);
});

test("Junior creation enters school onboarding and keeps an explicit skip", () => {
  const action = repoFile("app/dashboard/juniors/actions.ts");
  const page = repoFile("app/dashboard/juniors/[juniorId]/schools/page.tsx");
  assert.match(action, /\.select\("id"\)\.single\(\)/);
  assert.match(action, /\/schools\?onboarding=1/);
  assert.match(page, /Not now — finish Junior setup/);
});

test("Junior cards show approved or pending school state prominently", () => {
  const page = repoFile("app/dashboard/juniors/page.tsx");
  assert.match(page, /loadPlayerSchoolContexts/);
  assert.match(page, /School connection/);
  assert.match(page, /Approval pending/);
  assert.match(page, /No school connected yet/);
});

test("school linking continues to reuse the canonical player profile", () => {
  const phase2a = repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql");
  const action = repoFile("app/dashboard/juniors/schools/actions.ts");
  assert.match(action, /teamr_request_school_link/);
  assert.doesNotMatch(action, /from\("profiles"\)\.insert/);
  assert.match(phase2a, /insert into public\.organisation_player_links/);
  assert.doesNotMatch(migration(), /create table[^;]*(profile|player)(s|_identity)/i);
});

test("School to District is a constrained generic organisation relationship", () => {
  const sql = migration();
  assert.match(sql, /create table public\.organisation_relationships/);
  assert.match(sql, /child_venue_id uuid not null references public\.venues\(id\)/);
  assert.match(sql, /parent_venue_id uuid not null references public\.venues\(id\)/);
  assert.match(sql, /relationship_type = 'belongs_to'/);
  assert.match(sql, /organisation_relationships_not_self/);
  assert.match(sql, /unique \(child_venue_id, relationship_type\)/);
  assert.match(sql, /organisation_relationships_parent_status_idx/);
  assert.match(sql, /child_type not in \('school', 'school_district'\)/);
  assert.match(sql, /parent_type not in \('district', 'school_district'\)/);
});

test("organisation relationships have explicit grants and platform-admin RLS", () => {
  const sql = migration();
  assert.match(sql, /alter table public\.organisation_relationships enable row level security/);
  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /for insert to authenticated/);
  assert.match(sql, /for update to authenticated/);
  assert.match(sql, /for delete to authenticated/);
  assert.match(sql, /revoke all on table public\.organisation_relationships from public, anon/);
  assert.match(sql, /grant select, insert, update, delete on table public\.organisation_relationships to authenticated/);
});

test("district context is derived through the active school relationship, not player duplication", () => {
  const sql = migration();
  const context = sql.match(/create function public\.teamr_school_context[\s\S]*?end;\n\$\$;/)?.[0] ?? "";
  assert.match(context, /link\.player_profile_id = p_player_profile_id/);
  assert.match(context, /relationship\.child_venue_id = school\.id/);
  assert.match(context, /relationship\.status = 'active'/);
  assert.match(context, /district\.id = relationship\.parent_venue_id/);
  assert.doesNotMatch(context, /link\.venue_id = district\.id/);
});

test("Junior MyPlayR surfaces school status and supported ranking deep links", () => {
  const page = repoFile("app/dashboard/players/[id]/page.tsx");
  assert.match(page, /Approved school/);
  assert.match(page, /School approval pending/);
  assert.match(page, /rankingContextHref/);
  assert.match(page, /organisationId: schoolContext\.schoolId, scope: "school"/);
  assert.match(page, /organisationId: schoolContext\.districtId, scope: "district"/);
});

test("Phase 2A approvals, teams and rosters remain intact", () => {
  const phase2a = repoFile("supabase/migrations/20260814113000_teamr_phase2a_membership_teams_rosters.sql");
  assert.match(phase2a, /teamr_review_player_request/);
  assert.match(phase2a, /create table if not exists public\.teamr_teams/);
  assert.match(phase2a, /create table if not exists public\.teamr_roster_memberships/);
  assert.match(phase2a, /foreign key \(organisation_player_link_id, venue_id\)/);
});
