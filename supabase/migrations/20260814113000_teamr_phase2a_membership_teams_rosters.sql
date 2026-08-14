-- TeamR Phase 2A: school join requests, organisation-scoped teams and rosters.
--
-- This migration deliberately uses the canonical profiles and
-- organisation_player_links tables. It does not depend on the Phase 1
-- migration being present in Supabase's migration ledger.

create or replace function public.teamr_user_can_manage_teams(
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

create or replace function public.teamr_user_can_review_player_requests(
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
          and membership.role in ('organisation_admin', 'sports_coordinator')
          and venue.status = 'active'
          and venue.organisation_type in ('school', 'district', 'school_district')
      )
    );
$$;

create or replace function public.teamr_user_can_read_pending_profile(
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
      where link.status = 'pending'
        and (link.player_profile_id = check_profile_id or link.parent_profile_id = check_profile_id)
        and public.teamr_user_can_manage_teams(link.venue_id, check_user_id)
    );
$$;

revoke all on function public.teamr_user_can_manage_teams(uuid, uuid) from public, anon;
revoke all on function public.teamr_user_can_review_player_requests(uuid, uuid) from public, anon;
revoke all on function public.teamr_user_can_read_pending_profile(uuid, uuid) from public, anon;
grant execute on function public.teamr_user_can_manage_teams(uuid, uuid) to authenticated;
grant execute on function public.teamr_user_can_review_player_requests(uuid, uuid) to authenticated;
grant execute on function public.teamr_user_can_read_pending_profile(uuid, uuid) to authenticated;

create or replace function public.teamr_discover_schools(
  p_player_profile_id uuid,
  p_search text default null
)
returns table (
  id uuid,
  name text,
  organisation_type text,
  address text,
  suburb text,
  town text,
  city text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.profile_is_linked_junior(p_player_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  return query
  select
    venue.id,
    venue.name,
    venue.organisation_type::text,
    venue.address,
    venue.suburb,
    venue.town,
    venue.city
  from public.venues venue
  where venue.status = 'active'
    and venue.organisation_type in ('school', 'school_district')
    and venue.discovery_visibility = 'public'
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or venue.name ilike '%' || replace(replace(btrim(p_search), '%', ''), '_', '') || '%'
    )
  order by venue.name
  limit 30;
end;
$$;

revoke all on function public.teamr_discover_schools(uuid, text) from public, anon;
grant execute on function public.teamr_discover_schools(uuid, text) to authenticated;

create or replace function public.teamr_request_school_link(
  p_venue_id uuid,
  p_player_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_parent_profile_id uuid;
  venue_record public.venues%rowtype;
  link_record public.organisation_player_links%rowtype;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select parent.id into actor_parent_profile_id
  from public.profiles junior
  join public.profiles parent on parent.id = junior.parent_profile_id
  where junior.id = p_player_profile_id
    and junior.is_junior = true
    and parent.is_junior = false
    and parent.user_id = actor_user_id
  limit 1;

  if actor_parent_profile_id is null then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  select * into venue_record
  from public.venues venue
  where venue.id = p_venue_id
    and venue.status = 'active'
    and venue.organisation_type in ('school', 'school_district')
    and venue.discovery_visibility = 'public'
  limit 1;

  if venue_record.id is null then
    raise exception 'ineligible_school' using errcode = 'P0001';
  end if;

  select * into link_record
  from public.organisation_player_links link
  where link.venue_id = p_venue_id
    and link.player_profile_id = p_player_profile_id
  order by
    case link.status when 'active' then 1 when 'pending' then 2 when 'suspended' then 3 else 4 end,
    link.created_at desc
  limit 1
  for update;

  if link_record.status = 'active' then
    return jsonb_build_object('id', link_record.id, 'status', 'active', 'reused', true);
  elsif link_record.status = 'pending' then
    return jsonb_build_object('id', link_record.id, 'status', 'pending', 'reused', true);
  elsif link_record.status = 'suspended' then
    raise exception 'connection_suspended' using errcode = 'P0001';
  elsif link_record.id is not null then
    update public.organisation_player_links
    set status = 'pending',
        parent_profile_id = actor_parent_profile_id,
        requested_by_user_id = actor_user_id,
        approved_by_user_id = null,
        approved_at = null,
        declined_at = null,
        removed_at = null,
        notes = null
    where id = link_record.id
    returning * into link_record;
  else
    insert into public.organisation_player_links (
      venue_id,
      player_profile_id,
      parent_profile_id,
      status,
      requested_by_user_id
    ) values (
      p_venue_id,
      p_player_profile_id,
      actor_parent_profile_id,
      'pending',
      actor_user_id
    )
    returning * into link_record;
  end if;

  return jsonb_build_object('id', link_record.id, 'status', link_record.status, 'reused', false);
end;
$$;

create or replace function public.teamr_review_player_request(
  p_link_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  link_record public.organisation_player_links%rowtype;
  target_status public.organisation_link_status;
begin
  if actor_user_id is null or p_decision not in ('approve', 'reject') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  select * into link_record
  from public.organisation_player_links link
  where link.id = p_link_id
  for update;

  if link_record.id is null
    or not public.teamr_user_can_review_player_requests(link_record.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  target_status := case when p_decision = 'approve' then 'active' else 'declined' end;

  if link_record.status = target_status then
    return jsonb_build_object('id', link_record.id, 'status', link_record.status, 'reused', true);
  end if;

  if link_record.status <> 'pending' then
    raise exception 'request_closed' using errcode = 'P0001';
  end if;

  update public.organisation_player_links
  set status = target_status,
      approved_by_user_id = case when target_status = 'active' then actor_user_id else null end,
      approved_at = case when target_status = 'active' then now() else null end,
      declined_at = case when target_status = 'declined' then now() else null end,
      removed_at = null
  where id = link_record.id
  returning * into link_record;

  return jsonb_build_object('id', link_record.id, 'status', link_record.status, 'reused', false);
end;
$$;

revoke all on function public.teamr_request_school_link(uuid, uuid) from public, anon;
revoke all on function public.teamr_review_player_request(uuid, text) from public, anon;
grant execute on function public.teamr_request_school_link(uuid, uuid) to authenticated;
grant execute on function public.teamr_review_player_request(uuid, text) to authenticated;

-- School and district links are created through guarded database workflows.
-- Preserve the existing direct-insert path for other organisation products.
drop policy if exists "Authorised users can create player organisation links" on public.organisation_player_links;
create policy "Authorised users can create player organisation links"
on public.organisation_player_links
for insert
to authenticated
with check (
  public.user_can_invite_players(venue_id)
  or (
    public.can_manage_profile(player_profile_id)
    and status = 'pending'
    and requested_by_user_id = (select auth.uid())
    and not exists (
      select 1
      from public.venues venue
      where venue.id = organisation_player_links.venue_id
        and venue.organisation_type in ('school', 'district', 'school_district')
    )
  )
);

drop policy if exists "TeamR staff can read pending player profiles" on public.profiles;
create policy "TeamR staff can read pending player profiles"
on public.profiles
for select
to authenticated
using (public.teamr_user_can_read_pending_profile(id));

drop policy if exists "TeamR staff can read organisation player requests" on public.organisation_player_links;
create policy "TeamR staff can read organisation player requests"
on public.organisation_player_links
for select
to authenticated
using (public.teamr_user_can_manage_teams(venue_id));

create table if not exists public.teamr_teams (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  junior_stage text,
  status text not null default 'active',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teamr_teams_name_not_blank check (length(btrim(name)) > 0),
  constraint teamr_teams_name_length check (length(btrim(name)) <= 100),
  constraint teamr_teams_stage_valid check (
    junior_stage is null or junior_stage in ('red_ball', 'orange_ball', 'green_ball', 'yellow_ball', 'not_sure')
  ),
  constraint teamr_teams_status_valid check (status in ('active', 'archived')),
  constraint teamr_teams_id_venue_unique unique (id, venue_id)
);

create unique index if not exists teamr_teams_active_name_unique
on public.teamr_teams(venue_id, lower(btrim(name)))
where status = 'active';

create index if not exists teamr_teams_venue_status_idx
on public.teamr_teams(venue_id, status, created_at desc);

create index if not exists teamr_teams_created_by_idx
on public.teamr_teams(created_by_user_id);

drop trigger if exists teamr_teams_set_updated_at on public.teamr_teams;
create trigger teamr_teams_set_updated_at
before update on public.teamr_teams
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organisation_player_links'::regclass
      and conname = 'organisation_player_links_id_venue_unique'
  ) then
    alter table public.organisation_player_links
      add constraint organisation_player_links_id_venue_unique unique (id, venue_id);
  end if;
end $$;

create table if not exists public.teamr_roster_memberships (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null,
  team_id uuid not null,
  organisation_player_link_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint teamr_roster_team_fk foreign key (team_id, venue_id)
    references public.teamr_teams(id, venue_id) on delete cascade,
  constraint teamr_roster_player_link_fk foreign key (organisation_player_link_id, venue_id)
    references public.organisation_player_links(id, venue_id) on delete restrict,
  constraint teamr_roster_team_player_unique unique (team_id, organisation_player_link_id)
);

create index if not exists teamr_roster_venue_team_idx
on public.teamr_roster_memberships(venue_id, team_id, created_at);

create index if not exists teamr_roster_player_link_idx
on public.teamr_roster_memberships(organisation_player_link_id);

create index if not exists teamr_roster_created_by_idx
on public.teamr_roster_memberships(created_by_user_id);

alter table public.teamr_teams enable row level security;
alter table public.teamr_roster_memberships enable row level security;

grant select, insert on public.teamr_teams to authenticated;
grant update (name, junior_stage, status) on public.teamr_teams to authenticated;
grant select, insert, delete on public.teamr_roster_memberships to authenticated;
grant select, insert, update, delete on public.teamr_teams to service_role;
grant select, insert, update, delete on public.teamr_roster_memberships to service_role;

drop policy if exists "TeamR staff can read teams" on public.teamr_teams;
create policy "TeamR staff can read teams"
on public.teamr_teams
for select
to authenticated
using (public.teamr_user_can_manage_teams(venue_id));

drop policy if exists "TeamR staff can create teams" on public.teamr_teams;
create policy "TeamR staff can create teams"
on public.teamr_teams
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and public.teamr_user_can_manage_teams(venue_id)
);

drop policy if exists "TeamR staff can update teams" on public.teamr_teams;
create policy "TeamR staff can update teams"
on public.teamr_teams
for update
to authenticated
using (
  status = 'active'
  and public.teamr_user_can_manage_teams(venue_id)
)
with check (
  status in ('active', 'archived')
  and public.teamr_user_can_manage_teams(venue_id)
);

drop policy if exists "TeamR staff can read rosters" on public.teamr_roster_memberships;
create policy "TeamR staff can read rosters"
on public.teamr_roster_memberships
for select
to authenticated
using (public.teamr_user_can_manage_teams(venue_id));

drop policy if exists "TeamR staff can add active organisation players to rosters" on public.teamr_roster_memberships;
create policy "TeamR staff can add active organisation players to rosters"
on public.teamr_roster_memberships
for insert
to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and public.teamr_user_can_manage_teams(venue_id)
  and exists (
    select 1
    from public.teamr_teams team
    where team.id = teamr_roster_memberships.team_id
      and team.venue_id = teamr_roster_memberships.venue_id
      and team.status = 'active'
  )
  and exists (
    select 1
    from public.organisation_player_links link
    where link.id = teamr_roster_memberships.organisation_player_link_id
      and link.venue_id = teamr_roster_memberships.venue_id
      and link.status = 'active'
  )
);

drop policy if exists "TeamR staff can remove roster memberships" on public.teamr_roster_memberships;
create policy "TeamR staff can remove roster memberships"
on public.teamr_roster_memberships
for delete
to authenticated
using (
  public.teamr_user_can_manage_teams(venue_id)
  and exists (
    select 1
    from public.teamr_teams team
    where team.id = teamr_roster_memberships.team_id
      and team.venue_id = teamr_roster_memberships.venue_id
      and team.status = 'active'
  )
);
