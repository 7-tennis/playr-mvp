-- TeamR Phase 2B.2: shared profile-aware event relevance and event-scoped
-- player/staff assignments. Eligibility remains derived; assignment is a
-- separate durable relationship around the canonical PlayR profile.

create table public.event_player_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  removed_by_user_id uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_player_assignments_removal_complete check (
    (status = 'active' and removed_at is null and removed_by_user_id is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create unique index event_player_assignments_active_unique
on public.event_player_assignments(event_id, player_profile_id)
where status = 'active';

create index event_player_assignments_player_status_idx
on public.event_player_assignments(player_profile_id, status, event_id);

create index event_player_assignments_event_status_idx
on public.event_player_assignments(event_id, status, assigned_at);

create index event_player_assignments_assigned_by_idx
on public.event_player_assignments(assigned_by_user_id);

create index event_player_assignments_removed_by_idx
on public.event_player_assignments(removed_by_user_id)
where removed_by_user_id is not null;

create trigger event_player_assignments_set_updated_at
before update on public.event_player_assignments
for each row execute function public.set_updated_at();

create table public.event_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete restrict,
  staff_user_id uuid not null references auth.users(id) on delete restrict,
  event_role text not null check (event_role in ('event_manager', 'coordinator', 'coach', 'official')),
  source_organisation_membership_id uuid not null references public.organisation_memberships(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'removed')),
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  removed_by_user_id uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_staff_assignments_removal_complete check (
    (status = 'active' and removed_at is null and removed_by_user_id is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create unique index event_staff_assignments_active_unique
on public.event_staff_assignments(event_id, staff_user_id)
where status = 'active';

create index event_staff_assignments_user_status_idx
on public.event_staff_assignments(staff_user_id, status, event_id);

create index event_staff_assignments_event_status_idx
on public.event_staff_assignments(event_id, status, assigned_at);

create index event_staff_assignments_profile_idx
on public.event_staff_assignments(staff_profile_id, status);

create index event_staff_assignments_membership_idx
on public.event_staff_assignments(source_organisation_membership_id);

create index event_staff_assignments_assigned_by_idx
on public.event_staff_assignments(assigned_by_user_id);

create index event_staff_assignments_removed_by_idx
on public.event_staff_assignments(removed_by_user_id)
where removed_by_user_id is not null;

create trigger event_staff_assignments_set_updated_at
before update on public.event_staff_assignments
for each row execute function public.set_updated_at();

create function private.event_stage_matches_profile(
  check_event_stage text,
  check_profile_is_junior boolean,
  check_profile_stage text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select check_event_stage is null
    or (check_profile_is_junior and check_profile_stage = check_event_stage);
$$;

create function private.player_is_eligible_for_event(
  check_event_id uuid,
  check_player_profile_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.events event
    join public.venues host on host.id = event.venue_id
    join public.profiles profile on profile.id = check_player_profile_id
    where event.id = check_event_id
      and event.status = 'published'
      and event.archived_at is null
      and coalesce(event.starts_at, event.start_datetime) >= now()
      and host.status = 'active'
      and private.event_stage_matches_profile(event.junior_stage, profile.is_junior, profile.junior_stage::text)
      and (
        event.visibility = 'open'
        or (
          event.visibility = 'closed'
          and (
            (
              host.organisation_type in ('school', 'school_district')
              and exists (
                select 1
                from public.organisation_player_links link
                where link.venue_id = host.id
                  and link.player_profile_id = profile.id
                  and link.status = 'active'
              )
            )
            or (
              host.organisation_type in ('district', 'school_district')
              and exists (
                select 1
                from public.organisation_player_links link
                join public.venues school
                  on school.id = link.venue_id
                 and school.status = 'active'
                 and school.organisation_type in ('school', 'school_district')
                join public.organisation_relationships relationship
                  on relationship.child_venue_id = school.id
                 and relationship.parent_venue_id = host.id
                 and relationship.relationship_type = 'belongs_to'
                 and relationship.status = 'active'
                where link.player_profile_id = profile.id
                  and link.status = 'active'
              )
            )
            or (
              host.organisation_type in ('club', 'club_academy')
              and exists (
                select 1
                from public.club_memberships membership
                where membership.venue_id = host.id
                  and membership.profile_id = profile.id
                  and membership.status = 'active'
              )
            )
          )
        )
      )
  );
$$;

create function private.user_has_event_role(
  check_event_id uuid,
  allowed_event_roles text[],
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.event_staff_assignments assignment
      where assignment.event_id = check_event_id
        and assignment.staff_user_id = check_user_id
        and assignment.status = 'active'
        and assignment.event_role = any(allowed_event_roles)
    );
$$;

create function private.user_can_manage_event_players(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.events event
      where event.id = check_event_id
        and event.venue_id is not null
        and (
          public.user_is_platform_admin(check_user_id)
          or public.user_can_manage_organisation_events(event.venue_id, check_user_id)
          or private.user_has_event_role(event.id, array['event_manager', 'coordinator'], check_user_id)
        )
    );
$$;

create function private.user_can_manage_event_staff(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.events event
      where event.id = check_event_id
        and event.venue_id is not null
        and (
          public.user_is_platform_admin(check_user_id)
          or public.user_can_manage_organisation_events(event.venue_id, check_user_id)
          or private.user_has_event_role(event.id, array['event_manager'], check_user_id)
        )
    );
$$;

create function private.user_can_view_event_operations(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      private.user_can_manage_event_players(check_event_id, check_user_id)
      or private.user_has_event_role(
        check_event_id,
        array['event_manager', 'coordinator', 'coach', 'official'],
        check_user_id
      )
    );
$$;

create function private.user_can_read_profile_event(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      private.user_can_view_event_operations(check_event_id, check_user_id)
      or exists (
        select 1
        from public.profiles profile
        where public.can_manage_profile(profile.id, check_user_id)
          and (
            private.player_is_eligible_for_event(check_event_id, profile.id)
            or exists (
              select 1
              from public.event_player_assignments assignment
              where assignment.event_id = check_event_id
                and assignment.player_profile_id = profile.id
                and assignment.status = 'active'
            )
          )
      )
    );
$$;

revoke all on function private.event_stage_matches_profile(text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function private.player_is_eligible_for_event(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_has_event_role(uuid, text[], uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_manage_event_players(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_manage_event_staff(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_view_event_operations(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_read_profile_event(uuid, uuid) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function private.user_can_manage_event_players(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_can_manage_event_staff(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_can_view_event_operations(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_can_read_profile_event(uuid, uuid) to authenticated, service_role;

create function public.get_profile_event_relevance(p_player_profile_id uuid)
returns table (
  event_id uuid,
  title text,
  description text,
  host_id uuid,
  host_name text,
  host_type text,
  visibility text,
  junior_stage text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  capacity integer,
  relevance_kind text,
  relevance_reason text,
  is_assigned boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.can_manage_profile(p_player_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  return query
  select
    event.id,
    event.title,
    event.description,
    host.id,
    host.name,
    host.organisation_type::text,
    event.visibility,
    event.junior_stage::text,
    coalesce(event.starts_at, event.start_datetime),
    coalesce(event.ends_at, event.end_datetime),
    event.location,
    event.capacity,
    case when assignment.id is not null then 'selected' else 'eligible' end,
    case
      when assignment.id is not null then 'Selected by ' || host.name
      when event.visibility = 'open' then 'Open to eligible players'
      else 'Eligible through ' || host.name
    end,
    assignment.id is not null
  from public.events event
  join public.venues host on host.id = event.venue_id
  left join public.event_player_assignments assignment
    on assignment.event_id = event.id
   and assignment.player_profile_id = p_player_profile_id
   and assignment.status = 'active'
  where event.status = 'published'
    and event.archived_at is null
    and coalesce(event.starts_at, event.start_datetime) >= now()
    and (
      private.player_is_eligible_for_event(event.id, p_player_profile_id)
      or assignment.id is not null
    )
  order by assignment.id is not null desc, coalesce(event.starts_at, event.start_datetime), event.title;
end;
$$;

create function public.get_my_event_staff_assignments()
returns table (
  assignment_id uuid,
  event_id uuid,
  event_role text,
  title text,
  host_name text,
  host_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    assignment.id,
    event.id,
    assignment.event_role,
    event.title,
    host.name,
    host.organisation_type::text,
    coalesce(event.starts_at, event.start_datetime),
    coalesce(event.ends_at, event.end_datetime),
    event.location
  from public.event_staff_assignments assignment
  join public.events event on event.id = assignment.event_id
  join public.venues host on host.id = event.venue_id
  where (select auth.uid()) is not null
    and assignment.staff_user_id = (select auth.uid())
    and assignment.status = 'active'
    and event.status = 'published'
    and event.archived_at is null
    and coalesce(event.starts_at, event.start_datetime) >= now()
  order by coalesce(event.starts_at, event.start_datetime), event.title;
$$;

create function public.get_event_player_assignments(p_event_id uuid)
returns table (
  assignment_id uuid,
  player_profile_id uuid,
  player_name text,
  is_junior boolean,
  junior_stage text,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not private.user_can_view_event_operations(p_event_id, (select auth.uid())) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  return query
  select assignment.id, profile.id, profile.first_name || ' ' || profile.last_name,
    profile.is_junior, profile.junior_stage::text, assignment.assigned_at
  from public.event_player_assignments assignment
  join public.profiles profile on profile.id = assignment.player_profile_id
  where assignment.event_id = p_event_id and assignment.status = 'active'
  order by profile.first_name, profile.last_name;
end;
$$;

create function public.get_event_assignment_candidates(p_event_id uuid, p_search text default null)
returns table (
  player_profile_id uuid,
  player_name text,
  is_junior boolean,
  junior_stage text,
  context_name text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  event_visibility text;
begin
  if not private.user_can_manage_event_players(p_event_id, (select auth.uid())) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  select event.visibility into event_visibility from public.events event where event.id = p_event_id;
  if event_visibility = 'open' and length(btrim(coalesce(p_search, ''))) < 2 then
    return;
  end if;
  return query
  select profile.id, profile.first_name || ' ' || profile.last_name,
    profile.is_junior, profile.junior_stage::text,
    case when event.visibility = 'closed' then host.name else 'PlayR' end
  from public.profiles profile
  join public.events event on event.id = p_event_id
  join public.venues host on host.id = event.venue_id
  where private.player_is_eligible_for_event(event.id, profile.id)
    and not exists (
      select 1 from public.event_player_assignments assignment
      where assignment.event_id = event.id
        and assignment.player_profile_id = profile.id
        and assignment.status = 'active'
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or profile.first_name ilike '%' || btrim(p_search) || '%'
      or profile.last_name ilike '%' || btrim(p_search) || '%'
      or concat_ws(' ', profile.first_name, profile.last_name) ilike '%' || btrim(p_search) || '%'
    )
  order by profile.first_name, profile.last_name
  limit 60;
end;
$$;

create function public.assign_event_player(p_event_id uuid, p_player_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  assignment_id uuid;
begin
  if not private.user_can_manage_event_players(p_event_id, actor_user_id) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  if not private.player_is_eligible_for_event(p_event_id, p_player_profile_id) then
    raise exception 'player_not_eligible' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_player_assignments assignment
    where assignment.event_id = p_event_id
      and assignment.player_profile_id = p_player_profile_id
      and assignment.status = 'active'
  ) then
    raise exception 'duplicate_assignment' using errcode = '23505';
  end if;
  insert into public.event_player_assignments (
    event_id, player_profile_id, assigned_by_user_id
  ) values (
    p_event_id, p_player_profile_id, actor_user_id
  ) returning id into assignment_id;
  return assignment_id;
end;
$$;

create function public.remove_event_player_assignment(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.event_player_assignments;
begin
  select * into target from public.event_player_assignments where id = p_assignment_id for update;
  if target.id is null or target.status <> 'active'
    or not private.user_can_manage_event_players(target.event_id, actor_user_id) then
    raise exception 'assignment_access' using errcode = 'P0001';
  end if;
  update public.event_player_assignments
  set status = 'removed', removed_at = now(), removed_by_user_id = actor_user_id
  where id = target.id;
  return target.id;
end;
$$;

create function public.get_event_staff_assignments(p_event_id uuid)
returns table (
  assignment_id uuid,
  staff_profile_id uuid,
  staff_user_id uuid,
  staff_name text,
  event_role text,
  organisation_role text,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not private.user_can_view_event_operations(p_event_id, (select auth.uid())) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  return query
  select assignment.id, profile.id, assignment.staff_user_id,
    profile.first_name || ' ' || profile.last_name, assignment.event_role,
    membership.role::text, assignment.assigned_at
  from public.event_staff_assignments assignment
  join public.profiles profile on profile.id = assignment.staff_profile_id
  join public.organisation_memberships membership on membership.id = assignment.source_organisation_membership_id
  where assignment.event_id = p_event_id and assignment.status = 'active'
  order by case assignment.event_role when 'event_manager' then 1 when 'coordinator' then 2 when 'coach' then 3 else 4 end,
    profile.first_name, profile.last_name;
end;
$$;

create function public.get_event_staff_candidates(p_event_id uuid)
returns table (
  membership_id uuid,
  staff_profile_id uuid,
  staff_user_id uuid,
  staff_name text,
  organisation_role text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not private.user_can_manage_event_staff(p_event_id, (select auth.uid())) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  return query
  select membership.id, profile.id, membership.user_id,
    profile.first_name || ' ' || profile.last_name, membership.role::text
  from public.events event
  join public.organisation_memberships membership
    on membership.venue_id = event.venue_id
   and membership.status = 'active'
   and membership.user_id is not null
  join public.profiles profile
    on profile.id = membership.profile_id
   and profile.is_junior = false
   and profile.user_id = membership.user_id
  where event.id = p_event_id
    and membership.role in (
      'organisation_admin', 'sports_coordinator', 'team_manager', 'club_manager',
      'head_coach', 'coach', 'assistant_coach', 'committee', 'reception'
    )
    and not exists (
      select 1 from public.event_staff_assignments assignment
      where assignment.event_id = event.id
        and assignment.staff_user_id = membership.user_id
        and assignment.status = 'active'
    )
  order by profile.first_name, profile.last_name;
end;
$$;

create function public.assign_event_staff(
  p_event_id uuid,
  p_membership_id uuid,
  p_event_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_membership public.organisation_memberships;
  target_event public.events;
  target_profile public.profiles;
  assignment_id uuid;
begin
  if p_event_role not in ('event_manager', 'coordinator', 'coach', 'official')
    or not private.user_can_manage_event_staff(p_event_id, actor_user_id) then
    raise exception 'staff_access' using errcode = 'P0001';
  end if;
  select * into target_event from public.events where id = p_event_id;
  select * into target_membership from public.organisation_memberships where id = p_membership_id;
  select * into target_profile from public.profiles where id = target_membership.profile_id;
  if target_event.id is null
    or target_event.venue_id is distinct from target_membership.venue_id
    or target_membership.status <> 'active'
    or target_membership.user_id is null
    or target_profile.id is null
    or target_profile.is_junior
    or target_profile.user_id is distinct from target_membership.user_id then
    raise exception 'staff_not_eligible' using errcode = 'P0001';
  end if;
  if p_event_role = 'event_manager'
    and target_membership.role not in ('organisation_admin', 'sports_coordinator', 'club_manager') then
    raise exception 'staff_role_not_eligible' using errcode = 'P0001';
  end if;
  if p_event_role = 'coordinator'
    and target_membership.role not in ('organisation_admin', 'sports_coordinator', 'team_manager', 'club_manager') then
    raise exception 'staff_role_not_eligible' using errcode = 'P0001';
  end if;
  if p_event_role = 'coach'
    and target_membership.role not in ('head_coach', 'coach', 'assistant_coach') then
    raise exception 'staff_role_not_eligible' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.event_staff_assignments assignment
    where assignment.event_id = p_event_id
      and assignment.staff_user_id = target_membership.user_id
      and assignment.status = 'active'
  ) then
    raise exception 'duplicate_assignment' using errcode = '23505';
  end if;
  insert into public.event_staff_assignments (
    event_id, staff_profile_id, staff_user_id, event_role,
    source_organisation_membership_id, assigned_by_user_id
  ) values (
    p_event_id, target_profile.id, target_membership.user_id, p_event_role,
    target_membership.id, actor_user_id
  ) returning id into assignment_id;
  return assignment_id;
end;
$$;

create function public.update_event_staff_role(p_assignment_id uuid, p_event_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.event_staff_assignments;
begin
  select * into target from public.event_staff_assignments where id = p_assignment_id for update;
  if target.id is null or target.status <> 'active'
    or not private.user_can_manage_event_staff(target.event_id, (select auth.uid())) then
    raise exception 'staff_access' using errcode = 'P0001';
  end if;
  -- Reuse candidate and source-role validation in the assignment function's
  -- role matrix without creating another assignment row.
  if p_event_role not in ('event_manager', 'coordinator', 'coach', 'official')
    or (p_event_role = 'event_manager' and not exists (
      select 1 from public.organisation_memberships membership
      where membership.id = target.source_organisation_membership_id
        and membership.status = 'active'
        and membership.role in ('organisation_admin', 'sports_coordinator', 'club_manager')
    ))
    or (p_event_role = 'coordinator' and not exists (
      select 1 from public.organisation_memberships membership
      where membership.id = target.source_organisation_membership_id
        and membership.status = 'active'
        and membership.role in ('organisation_admin', 'sports_coordinator', 'team_manager', 'club_manager')
    ))
    or (p_event_role = 'coach' and not exists (
      select 1 from public.organisation_memberships membership
      where membership.id = target.source_organisation_membership_id
        and membership.status = 'active'
        and membership.role in ('head_coach', 'coach', 'assistant_coach')
    )) then
    raise exception 'staff_role_not_eligible' using errcode = 'P0001';
  end if;
  update public.event_staff_assignments set event_role = p_event_role where id = target.id;
  return target.id;
end;
$$;

create function public.remove_event_staff_assignment(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.event_staff_assignments;
begin
  select * into target from public.event_staff_assignments where id = p_assignment_id for update;
  if target.id is null or target.status <> 'active'
    or not private.user_can_manage_event_staff(target.event_id, actor_user_id) then
    raise exception 'staff_access' using errcode = 'P0001';
  end if;
  update public.event_staff_assignments
  set status = 'removed', removed_at = now(), removed_by_user_id = actor_user_id
  where id = target.id;
  return target.id;
end;
$$;

alter table public.event_player_assignments enable row level security;
alter table public.event_staff_assignments enable row level security;

create policy "Manage or own player assignments are visible"
on public.event_player_assignments for select to authenticated
using (
  public.can_manage_profile(player_profile_id, (select auth.uid()))
  or private.user_can_view_event_operations(event_id, (select auth.uid()))
);

create policy "Event staff assignments are event scoped"
on public.event_staff_assignments for select to authenticated
using (
  staff_user_id = (select auth.uid())
  or private.user_can_view_event_operations(event_id, (select auth.uid()))
);

-- Client writes go through RPCs so event/profile IDs and role changes are
-- validated atomically. service_role retains maintenance access.
revoke all privileges on table public.event_player_assignments from public, anon, authenticated, service_role;
revoke all privileges on table public.event_staff_assignments from public, anon, authenticated, service_role;
grant select on table public.event_player_assignments to authenticated;
grant select on table public.event_staff_assignments to authenticated;
grant all privileges on table public.event_player_assignments to service_role;
grant all privileges on table public.event_staff_assignments to service_role;

drop policy if exists "Players and assigned staff can read relevant organisation events" on public.events;
create policy "Players and assigned staff can read relevant organisation events"
on public.events for select to authenticated
using (
  venue_id is not null
  and private.user_can_read_profile_event(id, (select auth.uid()))
);

revoke all on function public.get_profile_event_relevance(uuid) from public, anon;
revoke all on function public.get_my_event_staff_assignments() from public, anon;
revoke all on function public.get_event_player_assignments(uuid) from public, anon;
revoke all on function public.get_event_assignment_candidates(uuid, text) from public, anon;
revoke all on function public.assign_event_player(uuid, uuid) from public, anon;
revoke all on function public.remove_event_player_assignment(uuid) from public, anon;
revoke all on function public.get_event_staff_assignments(uuid) from public, anon;
revoke all on function public.get_event_staff_candidates(uuid) from public, anon;
revoke all on function public.assign_event_staff(uuid, uuid, text) from public, anon;
revoke all on function public.update_event_staff_role(uuid, text) from public, anon;
revoke all on function public.remove_event_staff_assignment(uuid) from public, anon;

grant execute on function public.get_profile_event_relevance(uuid) to authenticated;
grant execute on function public.get_my_event_staff_assignments() to authenticated;
grant execute on function public.get_event_player_assignments(uuid) to authenticated;
grant execute on function public.get_event_assignment_candidates(uuid, text) to authenticated;
grant execute on function public.assign_event_player(uuid, uuid) to authenticated;
grant execute on function public.remove_event_player_assignment(uuid) to authenticated;
grant execute on function public.get_event_staff_assignments(uuid) to authenticated;
grant execute on function public.get_event_staff_candidates(uuid) to authenticated;
grant execute on function public.assign_event_staff(uuid, uuid, text) to authenticated;
grant execute on function public.update_event_staff_role(uuid, text) to authenticated;
grant execute on function public.remove_event_staff_assignment(uuid) to authenticated;

comment on table public.event_player_assignments is
'Organisation selection of a canonical PlayR profile for an event. This is distinct from derived eligibility and from the legacy paid event_entries lifecycle.';
comment on table public.event_staff_assignments is
'Shared event-scoped operational staff roles. Roles do not grant organisation-wide authority.';
comment on function public.get_profile_event_relevance(uuid) is
'Returns published upcoming organisation events relevant to one caller-managed canonical profile, with derived eligibility and assignment kept distinct.';
