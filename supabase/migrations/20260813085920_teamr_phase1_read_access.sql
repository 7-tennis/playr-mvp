-- TeamR Phase 1 reuses organisation memberships and player links. These
-- helpers extend read access only to explicit TeamR roles at eligible
-- school/district organisations; no TeamR write capability is introduced.

create or replace function public.teamr_user_has_access(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or exists (
        select 1
        from public.organisation_memberships membership
        join public.venues venue on venue.id = membership.venue_id
        where membership.user_id = check_user_id
          and membership.venue_id = check_venue_id
          and membership.status = 'active'
          and membership.role in ('organisation_admin', 'sports_coordinator', 'team_manager')
          and venue.status = 'active'
          and venue.organisation_type in ('school', 'district', 'school_district')
      )
    );
$$;

create or replace function public.teamr_user_can_read_player_profile(
  check_profile_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.organisation_player_links link
      where link.player_profile_id = check_profile_id
        and link.status = 'active'
        and public.teamr_user_has_access(link.venue_id, check_user_id)
    );
$$;

revoke all on function public.teamr_user_has_access(uuid, uuid) from public;
revoke all on function public.teamr_user_can_read_player_profile(uuid, uuid) from public;
grant execute on function public.teamr_user_has_access(uuid, uuid) to authenticated;
grant execute on function public.teamr_user_can_read_player_profile(uuid, uuid) to authenticated;

drop policy if exists "TeamR staff can read organisation player links" on public.organisation_player_links;
create policy "TeamR staff can read organisation player links"
on public.organisation_player_links
for select
to authenticated
using (public.teamr_user_has_access(venue_id));

drop policy if exists "TeamR staff can read linked player profiles" on public.profiles;
create policy "TeamR staff can read linked player profiles"
on public.profiles
for select
to authenticated
using (public.teamr_user_can_read_player_profile(id));

drop policy if exists "TeamR staff can read linked player ratings" on public.ratings;
create policy "TeamR staff can read linked player ratings"
on public.ratings
for select
to authenticated
using (public.teamr_user_can_read_player_profile(profile_id));
