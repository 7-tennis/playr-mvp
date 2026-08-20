-- TeamR Phase 2A grant hardening.
--
-- Existing projects may grant broad Data API privileges to newly created
-- public tables and functions through default privileges. Revoke those
-- inherited grants before restoring the explicit Phase 2A access contract.

begin;

revoke all privileges on table public.teamr_teams
from public, anon, authenticated, service_role;
revoke all privileges (
  id,
  venue_id,
  name,
  junior_stage,
  status,
  created_by_user_id,
  created_at,
  updated_at
) on table public.teamr_teams
from public, anon, authenticated, service_role;

grant select, insert on table public.teamr_teams to authenticated;
grant update (name, junior_stage, status) on table public.teamr_teams to authenticated;
grant select, insert, update, delete on table public.teamr_teams to service_role;

revoke all privileges on table public.teamr_roster_memberships
from public, anon, authenticated, service_role;
revoke all privileges (
  id,
  team_id,
  venue_id,
  organisation_player_link_id,
  created_by_user_id,
  created_at
) on table public.teamr_roster_memberships
from public, anon, authenticated, service_role;

grant select, insert, delete on table public.teamr_roster_memberships to authenticated;
grant select, insert, update, delete on table public.teamr_roster_memberships to service_role;

revoke all on function public.teamr_user_has_access(uuid, uuid)
from public, anon;
revoke all on function public.teamr_user_can_read_player_profile(uuid, uuid)
from public, anon;

grant execute on function public.teamr_user_has_access(uuid, uuid)
to authenticated, service_role;
grant execute on function public.teamr_user_can_read_player_profile(uuid, uuid)
to authenticated, service_role;

commit;
