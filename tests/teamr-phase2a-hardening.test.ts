import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "../supabase/migrations/20260820091535_teamr_phase2a_acl_hardening_and_grant_cleanup.sql";
const migration = () => readFileSync(new URL(migrationPath, import.meta.url), "utf8");

test("TeamR team grants are rebuilt from an explicit least-privilege baseline", () => {
  const sql = migration();

  assert.match(sql, /revoke all privileges on table public\.teamr_teams\s+from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert on table public\.teamr_teams to authenticated/);
  assert.match(sql, /grant update \(name, junior_stage, status\) on table public\.teamr_teams to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*delete[^;]*public\.teamr_teams to authenticated/i);
});

test("TeamR team column grants cannot retain inherited update access", () => {
  const sql = migration();

  assert.match(sql, /revoke all privileges \([\s\S]*id,[\s\S]*venue_id,[\s\S]*created_by_user_id,[\s\S]*updated_at[\s\S]*\) on table public\.teamr_teams[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant update \([^)]*(id|venue_id|created_by_user_id|created_at|updated_at)/i);
});

test("TeamR roster grants retain only the existing workflow operations", () => {
  const sql = migration();

  assert.match(sql, /revoke all privileges on table public\.teamr_roster_memberships\s+from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert, delete on table public\.teamr_roster_memberships to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*update[^;]*public\.teamr_roster_memberships to authenticated/i);
});

test("Phase 1 TeamR helpers explicitly reject anonymous execution", () => {
  const sql = migration();

  assert.match(sql, /revoke all on function public\.teamr_user_has_access\(uuid, uuid\)\s+from public, anon/);
  assert.match(sql, /revoke all on function public\.teamr_user_can_read_player_profile\(uuid, uuid\)\s+from public, anon/);
  assert.match(sql, /grant execute on function public\.teamr_user_has_access\(uuid, uuid\)\s+to authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.teamr_user_can_read_player_profile\(uuid, uuid\)\s+to authenticated, service_role/);
});

test("hardening is atomic and does not alter data, RLS, functions, or ranking logic", () => {
  const sql = migration();

  assert.match(sql, /^--[\s\S]*\nbegin;/);
  assert.match(sql, /commit;\s*$/);
  assert.doesNotMatch(sql, /\b(create|alter|drop)\s+(table|policy|function)|\b(insert|update|delete)\s+(into|public\.)/i);
  assert.doesNotMatch(sql, /get_public_playr_rankings|ranking_position|publication_status|safeguarding_hidden/i);
});
