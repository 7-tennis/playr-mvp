-- TeamR Phase 2B.3: evolve the shared organisation-event player assignment
-- into a neutral invitation, entry-request and confirmed-participation
-- lifecycle. Legacy paid public.event_entries remains deliberately separate.

begin;

alter table public.event_player_assignments
  drop constraint if exists event_player_assignments_status_check,
  drop constraint if exists event_player_assignments_removal_complete;

alter table public.event_player_assignments
  add column participation_source text,
  add column responded_at timestamptz,
  add column responded_by_user_id uuid references auth.users(id) on delete set null,
  add column confirmed_at timestamptz,
  add column confirmed_by_user_id uuid references auth.users(id) on delete set null;

-- Every existing Phase 2B.2 selection becomes a parent/player invitation.
update public.event_player_assignments
set status = 'invited',
    participation_source = 'organiser_invite'
where status = 'active';

update public.event_player_assignments
set participation_source = 'organiser_invite'
where participation_source is null;

alter table public.event_player_assignments
  alter column participation_source set not null,
  alter column participation_source set default 'organiser_invite',
  add constraint event_player_assignments_status_check
    check (status in ('invited', 'entry_requested', 'confirmed', 'declined', 'removed')),
  add constraint event_player_assignments_source_check
    check (participation_source in ('organiser_invite', 'player_request')),
  add constraint event_player_assignments_lifecycle_complete check (
    (
      status = 'invited'
      and participation_source = 'organiser_invite'
      and responded_at is null
      and confirmed_at is null
      and removed_at is null
    )
    or (
      status = 'entry_requested'
      and participation_source = 'player_request'
      and responded_at is null
      and confirmed_at is null
      and removed_at is null
    )
    or (
      status = 'confirmed'
      and responded_at is not null
      and confirmed_at is not null
      and removed_at is null
    )
    or (
      status = 'declined'
      and responded_at is not null
      and confirmed_at is null
      and removed_at is null
    )
    or (
      status = 'removed'
      and removed_at is not null
    )
  );

drop index if exists public.event_player_assignments_active_unique;

create unique index event_player_assignments_current_unique
on public.event_player_assignments(event_id, player_profile_id)
where status in ('invited', 'entry_requested', 'confirmed');

create index event_player_assignments_confirmed_capacity_idx
on public.event_player_assignments(event_id, confirmed_at)
where status = 'confirmed';

create index event_player_assignments_responded_by_idx
on public.event_player_assignments(responded_by_user_id)
where responded_by_user_id is not null;

create index event_player_assignments_confirmed_by_idx
on public.event_player_assignments(confirmed_by_user_id)
where confirmed_by_user_id is not null;

create or replace function private.event_accepts_participation_mutations(check_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.events event
    where event.id = check_event_id
      and event.venue_id is not null
      and event.status = 'published'
      and event.archived_at is null
      and coalesce(event.starts_at, event.start_datetime) >= now()
  );
$$;

create or replace function private.user_can_read_profile_event(
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
                and assignment.status in ('invited', 'entry_requested', 'confirmed')
            )
          )
      )
    );
$$;

drop function public.get_profile_event_relevance(uuid);

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
  is_assigned boolean,
  participation_id uuid,
  participation_status text,
  participation_source text,
  confirmed_count bigint
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
    case when assignment.status in ('invited', 'entry_requested', 'confirmed') then assignment.status else 'eligible' end,
    case assignment.status
      when 'invited' then 'You have been invited by ' || host.name
      when 'entry_requested' then 'Entry requested'
      when 'confirmed' then 'Confirmed for ' || host.name
      else case when event.visibility = 'open' then 'Open to eligible players' else 'Eligible through ' || host.name end
    end,
    assignment.status in ('invited', 'entry_requested', 'confirmed'),
    case when assignment.status in ('invited', 'entry_requested', 'confirmed') then assignment.id end,
    case when assignment.status in ('invited', 'entry_requested', 'confirmed') then assignment.status end,
    case when assignment.status in ('invited', 'entry_requested', 'confirmed') then assignment.participation_source end,
    (
      select count(*)
      from public.event_player_assignments confirmed
      where confirmed.event_id = event.id
        and confirmed.status = 'confirmed'
    )
  from public.events event
  join public.venues host on host.id = event.venue_id
  left join lateral (
    select participation.id, participation.status, participation.participation_source
    from public.event_player_assignments participation
    where participation.event_id = event.id
      and participation.player_profile_id = p_player_profile_id
    order by participation.created_at desc, participation.id desc
    limit 1
  ) assignment on true
  where event.status = 'published'
    and event.archived_at is null
    and coalesce(event.starts_at, event.start_datetime) >= now()
    and (
      assignment.status in ('invited', 'entry_requested', 'confirmed')
      or (
        private.player_is_eligible_for_event(event.id, p_player_profile_id)
        and (
          assignment.id is null
          or assignment.status = 'removed'
          or (assignment.status = 'declined' and assignment.participation_source = 'player_request')
        )
      )
    )
  order by
    case assignment.status when 'invited' then 1 when 'confirmed' then 2 when 'entry_requested' then 3 else 4 end,
    coalesce(event.starts_at, event.start_datetime),
    event.title;
end;
$$;

drop function public.get_event_player_assignments(uuid);

create function public.get_event_player_assignments(p_event_id uuid)
returns table (
  assignment_id uuid,
  player_profile_id uuid,
  player_name text,
  is_junior boolean,
  junior_stage text,
  context_name text,
  participation_status text,
  participation_source text,
  assigned_at timestamptz,
  responded_at timestamptz,
  confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  can_manage boolean;
  can_view_confirmed boolean;
begin
  can_manage := private.user_can_manage_event_players(p_event_id, actor_user_id);
  can_view_confirmed := private.user_has_event_role(
    p_event_id,
    array['event_manager', 'coordinator', 'coach', 'official'],
    actor_user_id
  );
  if not can_manage and not can_view_confirmed then
    raise exception 'event_access' using errcode = 'P0001';
  end if;

  return query
  select
    assignment.id,
    profile.id,
    profile.first_name || ' ' || profile.last_name,
    profile.is_junior,
    profile.junior_stage::text,
    case
      when host.organisation_type in ('district', 'school_district') then coalesce((
        select school.name
        from public.organisation_player_links link
        join public.venues school on school.id = link.venue_id and school.status = 'active'
        join public.organisation_relationships relationship
          on relationship.child_venue_id = school.id
         and relationship.parent_venue_id = host.id
         and relationship.relationship_type = 'belongs_to'
         and relationship.status = 'active'
        where link.player_profile_id = profile.id and link.status = 'active'
        order by link.created_at desc
        limit 1
      ), host.name)
      else host.name
    end,
    assignment.status,
    assignment.participation_source,
    assignment.assigned_at,
    assignment.responded_at,
    assignment.confirmed_at
  from public.event_player_assignments assignment
  join public.profiles profile on profile.id = assignment.player_profile_id
  join public.events event on event.id = assignment.event_id
  join public.venues host on host.id = event.venue_id
  where assignment.event_id = p_event_id
    and assignment.status <> 'removed'
    and (can_manage or assignment.status = 'confirmed')
  order by
    case assignment.status when 'entry_requested' then 1 when 'invited' then 2 when 'confirmed' then 3 else 4 end,
    profile.first_name,
    profile.last_name;
end;
$$;

create or replace function public.get_event_assignment_candidates(p_event_id uuid, p_search text default null)
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
  select
    profile.id,
    profile.first_name || ' ' || profile.last_name,
    profile.is_junior,
    profile.junior_stage::text,
    case when event.visibility = 'closed' then host.name else 'PlayR' end
  from public.profiles profile
  join public.events event on event.id = p_event_id
  join public.venues host on host.id = event.venue_id
  where private.player_is_eligible_for_event(event.id, profile.id)
    and not exists (
      select 1
      from public.event_player_assignments assignment
      where assignment.event_id = event.id
        and assignment.player_profile_id = profile.id
        and assignment.status in ('invited', 'entry_requested', 'confirmed')
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

create function public.invite_event_player(p_event_id uuid, p_player_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_event public.events;
  target public.event_player_assignments;
begin
  if not private.user_can_manage_event_players(p_event_id, actor_user_id) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  select * into target_event from public.events event where event.id = p_event_id for update;
  if target_event.id is null
    or target_event.visibility <> 'closed'
    or not private.event_accepts_participation_mutations(p_event_id) then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;
  if not private.player_is_eligible_for_event(p_event_id, p_player_profile_id) then
    raise exception 'player_not_eligible' using errcode = 'P0001';
  end if;
  select * into target
  from public.event_player_assignments assignment
  where assignment.event_id = p_event_id
    and assignment.player_profile_id = p_player_profile_id
  order by assignment.created_at desc, assignment.id desc
  limit 1
  for update;
  if target.status in ('invited', 'entry_requested', 'confirmed') then
    raise exception 'duplicate_participation' using errcode = '23505';
  end if;
  if target.id is null then
    insert into public.event_player_assignments (
      event_id, player_profile_id, status, participation_source,
      assigned_by_user_id, assigned_at
    ) values (
      p_event_id, p_player_profile_id, 'invited', 'organiser_invite',
      actor_user_id, now()
    ) returning * into target;
  else
    update public.event_player_assignments
    set status = 'invited',
        participation_source = 'organiser_invite',
        assigned_by_user_id = actor_user_id,
        assigned_at = now(),
        responded_at = null,
        responded_by_user_id = null,
        confirmed_at = null,
        confirmed_by_user_id = null,
        removed_at = null,
        removed_by_user_id = null
    where id = target.id
    returning * into target;
  end if;
  return target.id;
end;
$$;

create function public.request_event_entry(p_event_id uuid, p_player_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_event public.events;
  target public.event_player_assignments;
  confirmed_count integer;
begin
  if actor_user_id is null
    or not public.can_manage_profile(p_player_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;
  select * into target_event from public.events event where event.id = p_event_id for update;
  if target_event.id is null
    or target_event.visibility <> 'open'
    or not private.event_accepts_participation_mutations(p_event_id) then
    raise exception 'entry_unavailable' using errcode = 'P0001';
  end if;
  if not private.player_is_eligible_for_event(p_event_id, p_player_profile_id) then
    raise exception 'player_not_eligible' using errcode = 'P0001';
  end if;
  select count(*)::integer into confirmed_count
  from public.event_player_assignments assignment
  where assignment.event_id = p_event_id and assignment.status = 'confirmed';
  if target_event.capacity is not null and confirmed_count >= target_event.capacity then
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  select * into target
  from public.event_player_assignments assignment
  where assignment.event_id = p_event_id
    and assignment.player_profile_id = p_player_profile_id
  order by assignment.created_at desc, assignment.id desc
  limit 1
  for update;
  if target.status in ('invited', 'entry_requested', 'confirmed') then
    raise exception 'duplicate_participation' using errcode = '23505';
  end if;
  if target.id is null then
    insert into public.event_player_assignments (
      event_id, player_profile_id, status, participation_source,
      assigned_by_user_id, assigned_at
    ) values (
      p_event_id, p_player_profile_id, 'entry_requested', 'player_request',
      actor_user_id, now()
    ) returning * into target;
  else
    update public.event_player_assignments
    set status = 'entry_requested',
        participation_source = 'player_request',
        assigned_by_user_id = actor_user_id,
        assigned_at = now(),
        responded_at = null,
        responded_by_user_id = null,
        confirmed_at = null,
        confirmed_by_user_id = null,
        removed_at = null,
        removed_by_user_id = null
    where id = target.id
    returning * into target;
  end if;
  return target.id;
end;
$$;

create function public.respond_event_invitation(p_assignment_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_event_id uuid;
  target_profile_id uuid;
  target_event public.events;
  target public.event_player_assignments;
  confirmed_count integer;
begin
  select assignment.event_id, assignment.player_profile_id
  into target_event_id, target_profile_id
  from public.event_player_assignments assignment
  where assignment.id = p_assignment_id;
  if actor_user_id is null
    or target_event_id is null
    or not public.can_manage_profile(target_profile_id, actor_user_id) then
    raise exception 'invitation_access' using errcode = 'P0001';
  end if;
  select * into target_event from public.events event where event.id = target_event_id for update;
  select * into target from public.event_player_assignments assignment where assignment.id = p_assignment_id for update;
  if target.status <> 'invited'
    or target.participation_source <> 'organiser_invite'
    or not private.event_accepts_participation_mutations(target.event_id) then
    raise exception 'invitation_unavailable' using errcode = 'P0001';
  end if;
  if p_accept then
    if not private.player_is_eligible_for_event(target.event_id, target.player_profile_id) then
      raise exception 'player_not_eligible' using errcode = 'P0001';
    end if;
    select count(*)::integer into confirmed_count
    from public.event_player_assignments assignment
    where assignment.event_id = target.event_id and assignment.status = 'confirmed';
    if target_event.capacity is not null and confirmed_count >= target_event.capacity then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
    update public.event_player_assignments
    set status = 'confirmed',
        responded_at = now(),
        responded_by_user_id = actor_user_id,
        confirmed_at = now(),
        confirmed_by_user_id = actor_user_id
    where id = target.id;
  else
    update public.event_player_assignments
    set status = 'declined',
        responded_at = now(),
        responded_by_user_id = actor_user_id,
        confirmed_at = null,
        confirmed_by_user_id = null
    where id = target.id;
  end if;
  return target.id;
end;
$$;

create function public.review_event_entry_request(p_assignment_id uuid, p_approve boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_event_id uuid;
  target_event public.events;
  target public.event_player_assignments;
  confirmed_count integer;
begin
  select assignment.event_id into target_event_id
  from public.event_player_assignments assignment
  where assignment.id = p_assignment_id;
  if target_event_id is null
    or not private.user_can_manage_event_players(target_event_id, actor_user_id) then
    raise exception 'request_access' using errcode = 'P0001';
  end if;
  select * into target_event from public.events event where event.id = target_event_id for update;
  select * into target from public.event_player_assignments assignment where assignment.id = p_assignment_id for update;
  if target.status <> 'entry_requested'
    or target.participation_source <> 'player_request'
    or not private.event_accepts_participation_mutations(target.event_id) then
    raise exception 'request_unavailable' using errcode = 'P0001';
  end if;
  if p_approve then
    if not private.player_is_eligible_for_event(target.event_id, target.player_profile_id) then
      raise exception 'player_not_eligible' using errcode = 'P0001';
    end if;
    select count(*)::integer into confirmed_count
    from public.event_player_assignments assignment
    where assignment.event_id = target.event_id and assignment.status = 'confirmed';
    if target_event.capacity is not null and confirmed_count >= target_event.capacity then
      raise exception 'event_full' using errcode = 'P0001';
    end if;
    update public.event_player_assignments
    set status = 'confirmed',
        responded_at = now(),
        responded_by_user_id = actor_user_id,
        confirmed_at = now(),
        confirmed_by_user_id = actor_user_id
    where id = target.id;
  else
    update public.event_player_assignments
    set status = 'declined',
        responded_at = now(),
        responded_by_user_id = actor_user_id,
        confirmed_at = null,
        confirmed_by_user_id = null
    where id = target.id;
  end if;
  return target.id;
end;
$$;

create or replace function public.assign_event_player(p_event_id uuid, p_player_profile_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.invite_event_player(p_event_id, p_player_profile_id);
$$;

create or replace function public.remove_event_player_assignment(p_assignment_id uuid)
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
  if target.id is null
    or target.status not in ('invited', 'entry_requested', 'confirmed')
    or not private.event_accepts_participation_mutations(target.event_id)
    or not private.user_can_manage_event_players(target.event_id, actor_user_id) then
    raise exception 'assignment_access' using errcode = 'P0001';
  end if;
  update public.event_player_assignments
  set status = 'removed', removed_at = now(), removed_by_user_id = actor_user_id
  where id = target.id;
  return target.id;
end;
$$;

drop policy if exists "Manage or own player assignments are visible" on public.event_player_assignments;
create policy "Participation is visible to its player or authorised event staff"
on public.event_player_assignments for select to authenticated
using (
  public.can_manage_profile(player_profile_id, (select auth.uid()))
  or private.user_can_manage_event_players(event_id, (select auth.uid()))
  or (
    status = 'confirmed'
    and private.user_can_view_event_operations(event_id, (select auth.uid()))
  )
);

-- The table remains readable only through row-scoped RLS. Every lifecycle
-- write goes through a validated RPC; clients receive no direct write grant.
revoke all privileges on table public.event_player_assignments from public, anon, authenticated, service_role;
grant select on table public.event_player_assignments to authenticated;
grant all privileges on table public.event_player_assignments to service_role;

revoke all on function private.event_accepts_participation_mutations(uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_read_profile_event(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.user_can_read_profile_event(uuid, uuid) to authenticated, service_role;

revoke all on function public.get_profile_event_relevance(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_event_player_assignments(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_event_assignment_candidates(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.invite_event_player(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_event_entry(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.respond_event_invitation(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.review_event_entry_request(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.assign_event_player(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_event_player_assignment(uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_profile_event_relevance(uuid) to authenticated, service_role;
grant execute on function public.get_event_player_assignments(uuid) to authenticated, service_role;
grant execute on function public.get_event_assignment_candidates(uuid, text) to authenticated, service_role;
grant execute on function public.invite_event_player(uuid, uuid) to authenticated, service_role;
grant execute on function public.request_event_entry(uuid, uuid) to authenticated, service_role;
grant execute on function public.respond_event_invitation(uuid, boolean) to authenticated, service_role;
grant execute on function public.review_event_entry_request(uuid, boolean) to authenticated, service_role;
grant execute on function public.assign_event_player(uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_event_player_assignment(uuid) to authenticated, service_role;

comment on table public.event_player_assignments is
'Shared organisation-event participation lifecycle for canonical PlayR profiles. Eligibility, invitations, entry requests and confirmation remain distinct from legacy paid event_entries.';
comment on column public.event_player_assignments.assigned_at is
'Timestamp when the current invitation or entry request was initiated.';
comment on column public.event_player_assignments.assigned_by_user_id is
'User who initiated the current invitation or entry request.';
comment on function public.request_event_entry(uuid, uuid) is
'Creates an approval-required entry request for a caller-managed profile in an eligible Open organisation event.';
comment on function public.respond_event_invitation(uuid, boolean) is
'Lets the canonical profile owner or managing parent accept or decline an active event invitation.';
comment on function public.review_event_entry_request(uuid, boolean) is
'Lets authorised event managers/coordinators approve or reject an Open-event entry request with atomic capacity enforcement.';

commit;
