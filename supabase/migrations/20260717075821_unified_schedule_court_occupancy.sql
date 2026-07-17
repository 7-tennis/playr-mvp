-- Phase 1.12: make session occurrences the operational schedule and
-- court_bookings the single court-occupancy source.

create table public.coach_session_occurrence_coaches (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.coach_session_occurrences(id) on delete cascade,
  coach_profile_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'assistant',
  status text not null default 'active',
  assigned_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_occurrence_coaches_role_valid check (role in ('primary', 'assistant', 'replacement')),
  constraint coach_session_occurrence_coaches_status_valid check (status in ('active', 'removed')),
  constraint coach_session_occurrence_coaches_unique unique (occurrence_id, coach_profile_id)
);

create table public.coach_session_occurrence_participants (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.coach_session_occurrences(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete restrict,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_occurrence_participants_status_valid check (status in ('active', 'removed')),
  constraint coach_session_occurrence_participants_unique unique (occurrence_id, player_profile_id)
);

create index coach_session_occurrence_coaches_coach_idx
on public.coach_session_occurrence_coaches(coach_profile_id, status, occurrence_id);

create index coach_session_occurrence_participants_player_idx
on public.coach_session_occurrence_participants(player_profile_id, status, occurrence_id);

create trigger coach_session_occurrence_coaches_set_updated_at
before update on public.coach_session_occurrence_coaches
for each row execute function public.set_updated_at();

create trigger coach_session_occurrence_participants_set_updated_at
before update on public.coach_session_occurrence_participants
for each row execute function public.set_updated_at();

create or replace function public.coachr_snapshot_occurrence_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coach_session_occurrence_coaches (
    occurrence_id, coach_profile_id, role, status, assigned_by_user_id
  )
  select new.id, session_coach.coach_profile_id, session_coach.role, 'active', session_coach.added_by_user_id
  from public.coach_session_coaches session_coach
  where session_coach.session_id = new.session_id
    and session_coach.status = 'active'
  on conflict (occurrence_id, coach_profile_id) do nothing;

  insert into public.coach_session_occurrence_participants (
    occurrence_id, player_profile_id, parent_profile_id, status
  )
  select new.id, participant.player_profile_id, participant.parent_profile_id, 'active'
  from public.coach_session_participants participant
  where participant.session_id = new.session_id
    and participant.status = 'active'
    and participant.joined_on <= new.occurrence_date
    and (participant.ends_on is null or participant.ends_on >= new.occurrence_date)
  on conflict (occurrence_id, player_profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists coach_session_occurrences_snapshot_assignments on public.coach_session_occurrences;
create trigger coach_session_occurrences_snapshot_assignments
after insert on public.coach_session_occurrences
for each row execute function public.coachr_snapshot_occurrence_assignments();

insert into public.coach_session_occurrence_coaches (
  occurrence_id, coach_profile_id, role, status, assigned_by_user_id
)
select occurrence.id, session_coach.coach_profile_id, session_coach.role, 'active', session_coach.added_by_user_id
from public.coach_session_occurrences occurrence
join public.coach_session_coaches session_coach
  on session_coach.session_id = occurrence.session_id
 and session_coach.status = 'active'
on conflict (occurrence_id, coach_profile_id) do nothing;

insert into public.coach_session_occurrence_participants (
  occurrence_id, player_profile_id, parent_profile_id, status
)
select occurrence.id, participant.player_profile_id, participant.parent_profile_id, 'active'
from public.coach_session_occurrences occurrence
join public.coach_session_participants participant
  on participant.session_id = occurrence.session_id
 and participant.status = 'active'
 and participant.joined_on <= occurrence.occurrence_date
 and (participant.ends_on is null or participant.ends_on >= occurrence.occurrence_date)
on conflict (occurrence_id, player_profile_id) do nothing;

create or replace function public.coachr_user_matches_coach_profile(
  p_coach_profile_id uuid,
  p_venue_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles coach
      join public.organisation_memberships membership
        on membership.profile_id = coach.id
       and membership.venue_id = p_venue_id
       and membership.status = 'active'
       and membership.role in ('head_coach', 'coach', 'assistant_coach')
      where coach.id = p_coach_profile_id
        and coach.is_junior = false
        and (coach.user_id = p_user_id or membership.user_id = p_user_id)
    );
$$;

create or replace function public.coachr_can_manage_session(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.coach_sessions session
      where session.id = p_session_id
        and (
          public.user_can_manage_organisation_coaches(session.venue_id, p_user_id)
          or exists (
            select 1
            from public.coach_session_coaches session_coach
            where session_coach.session_id = session.id
              and session_coach.status = 'active'
              and public.coachr_user_matches_coach_profile(
                session_coach.coach_profile_id,
                session.venue_id,
                p_user_id
              )
          )
        )
    );
$$;

create or replace function public.coachr_can_read_session(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and (
      public.coachr_can_manage_session(p_session_id, p_user_id)
      or exists (
        select 1
        from public.coach_session_participants participant
        join public.profiles player on player.id = participant.player_profile_id
        where participant.session_id = p_session_id
          and participant.status in ('active', 'paused')
          and (
            public.can_manage_profile(player.id, p_user_id)
            or (player.parent_profile_id is not null and public.profile_belongs_to_user(player.parent_profile_id, p_user_id))
          )
      )
      or exists (
        select 1
        from public.coach_session_occurrence_coaches occurrence_coach
        join public.coach_session_occurrences occurrence on occurrence.id = occurrence_coach.occurrence_id
        join public.coach_sessions session on session.id = occurrence.session_id
        where occurrence.session_id = p_session_id
          and occurrence_coach.status = 'active'
          and public.coachr_user_matches_coach_profile(
            occurrence_coach.coach_profile_id,
            session.venue_id,
            p_user_id
          )
      )
    );
$$;

create or replace function public.coachr_can_read_occurrence(
  p_occurrence_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.coach_session_occurrences occurrence
      join public.coach_sessions session on session.id = occurrence.session_id
      where occurrence.id = p_occurrence_id
        and (
          public.coachr_can_manage_session(session.id, p_user_id)
          or exists (
            select 1
            from public.coach_session_occurrence_coaches occurrence_coach
            where occurrence_coach.occurrence_id = occurrence.id
              and occurrence_coach.status = 'active'
              and public.coachr_user_matches_coach_profile(
                occurrence_coach.coach_profile_id,
                session.venue_id,
                p_user_id
              )
          )
          or exists (
            select 1
            from public.coach_session_occurrence_participants occurrence_participant
            join public.profiles player on player.id = occurrence_participant.player_profile_id
            where occurrence_participant.occurrence_id = occurrence.id
              and occurrence_participant.status = 'active'
              and (
                public.can_manage_profile(player.id, p_user_id)
                or (player.parent_profile_id is not null and public.profile_belongs_to_user(player.parent_profile_id, p_user_id))
              )
          )
        )
    );
$$;

alter table public.coach_session_occurrence_coaches enable row level security;
alter table public.coach_session_occurrence_participants enable row level security;

grant select on public.coach_session_occurrence_coaches to authenticated;
grant select on public.coach_session_occurrence_participants to authenticated;

create policy "Authorised users can read occurrence coaches"
on public.coach_session_occurrence_coaches for select to authenticated
using (public.coachr_can_read_occurrence(occurrence_id));

create policy "Authorised users can read occurrence participants"
on public.coach_session_occurrence_participants for select to authenticated
using (public.coachr_can_read_occurrence(occurrence_id));

drop policy if exists "Authorised users can read session occurrences" on public.coach_session_occurrences;
create policy "Authorised users can read session occurrences"
on public.coach_session_occurrences for select to authenticated
using (public.coachr_can_read_occurrence(id));

drop policy if exists "Authorised users can read occurrence courts" on public.coach_session_occurrence_courts;
create policy "Authorised users can read occurrence courts"
on public.coach_session_occurrence_courts for select to authenticated
using (public.coachr_can_read_occurrence(occurrence_id));

drop policy if exists "Authorised users can read session attendance" on public.coach_session_attendance;
create policy "Authorised users can read session attendance"
on public.coach_session_attendance for select to authenticated
using (public.coachr_can_read_occurrence(occurrence_id));

create or replace function public.coachr_prevent_occurrence_coach_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_coach record;
begin
  if new.status <> 'scheduled'
    or (
      tg_op = 'UPDATE'
      and new.start_time is not distinct from old.start_time
      and new.end_time is not distinct from old.end_time
    ) then
    return new;
  end if;

  for assigned_coach in
    select occurrence_coach.coach_profile_id, profile.first_name, profile.last_name
    from public.coach_session_occurrence_coaches occurrence_coach
    join public.profiles profile on profile.id = occurrence_coach.coach_profile_id
    where occurrence_coach.occurrence_id = new.id
      and occurrence_coach.status = 'active'
  loop
    perform pg_advisory_xact_lock(hashtextextended('coach:' || assigned_coach.coach_profile_id::text, 0));

    if exists (
      select 1
      from public.coach_session_occurrences other_occurrence
      join public.coach_session_occurrence_coaches other_coach
        on other_coach.occurrence_id = other_occurrence.id
       and other_coach.coach_profile_id = assigned_coach.coach_profile_id
       and other_coach.status = 'active'
      where other_occurrence.id <> new.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
          && tstzrange(new.start_time, new.end_time, '[)')
    ) or exists (
      select 1
      from public.coach_lessons legacy
      where legacy.coach_id = assigned_coach.coach_profile_id
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)')
          && tstzrange(new.start_time, new.end_time, '[)')
    ) then
      raise exception 'coach_conflict:%', concat_ws(' ', assigned_coach.first_name, assigned_coach.last_name) using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists coach_session_occurrences_prevent_coach_overlap on public.coach_session_occurrences;
create trigger coach_session_occurrences_prevent_coach_overlap
before update of start_time, end_time, status on public.coach_session_occurrences
for each row execute function public.coachr_prevent_occurrence_coach_overlap();

create or replace function public.coachr_assign_occurrence_coach(
  p_occurrence_id uuid,
  p_coach_profile_id uuid,
  p_role text default 'replacement'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
  assignment_id uuid;
  coach_name text;
  target_user_id uuid;
begin
  select * into target_occurrence
  from public.coach_session_occurrences
  where id = p_occurrence_id
  for update;
  if target_occurrence.id is null or target_occurrence.status <> 'scheduled' then
    raise exception 'invalid_session' using errcode = 'P0001';
  end if;

  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  if actor_user_id is null
    or not public.user_can_manage_organisation_coaches(target_session.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_role not in ('primary', 'assistant', 'replacement')
    or not public.coach_profile_can_teach_at_venue(p_coach_profile_id, target_session.venue_id, actor_user_id) then
    raise exception 'coach_venue' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coach:' || p_coach_profile_id::text, 0));
  select concat_ws(' ', profile.first_name, profile.last_name) into coach_name
  from public.profiles profile where profile.id = p_coach_profile_id;

  if exists (
    select 1
    from public.coach_session_occurrences other_occurrence
    join public.coach_session_occurrence_coaches other_coach
      on other_coach.occurrence_id = other_occurrence.id
     and other_coach.coach_profile_id = p_coach_profile_id
     and other_coach.status = 'active'
    where other_occurrence.id <> target_occurrence.id
      and other_occurrence.status = 'scheduled'
      and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
        && tstzrange(target_occurrence.start_time, target_occurrence.end_time, '[)')
  ) or exists (
    select 1 from public.coach_lessons legacy
    where legacy.coach_id = p_coach_profile_id
      and legacy.status not in ('cancelled', 'rain', 'sick')
      and tstzrange(legacy.start_time, legacy.end_time, '[)')
        && tstzrange(target_occurrence.start_time, target_occurrence.end_time, '[)')
  ) then
    raise exception 'coach_conflict:%', coalesce(coach_name, 'Selected coach') using errcode = 'P0001';
  end if;

  insert into public.coach_session_occurrence_coaches (
    occurrence_id, coach_profile_id, role, status, assigned_by_user_id
  ) values (
    target_occurrence.id, p_coach_profile_id, p_role, 'active', actor_user_id
  )
  on conflict (occurrence_id, coach_profile_id) do update
  set role = excluded.role,
      status = 'active',
      assigned_by_user_id = excluded.assigned_by_user_id,
      updated_at = now()
  returning id into assignment_id;

  select coalesce(membership.user_id, coach.user_id) into target_user_id
  from public.profiles coach
  left join public.organisation_memberships membership
    on membership.profile_id = coach.id
   and membership.venue_id = target_session.venue_id
   and membership.status = 'active'
  where coach.id = p_coach_profile_id
  limit 1;

  if target_user_id is not null and target_user_id <> actor_user_id then
    begin
      perform public.create_system_notification(
        target_user_id => target_user_id,
        notification_type => 'lesson_created',
        notification_title => 'Session added to your schedule',
        notification_message => target_session.name || ' has been added to your CoachR schedule.',
        notification_href => '/dashboard/coachr/schedule?session=' || target_session.id::text,
        notification_actor_user_id => actor_user_id,
        notification_metadata => jsonb_build_object(
          'sessionId', target_session.id,
          'occurrenceId', target_occurrence.id,
          'organisationId', target_session.venue_id,
          'coachProfileId', p_coach_profile_id,
          'role', p_role
        ),
        notification_dedupe_key => 'coach-occurrence-assigned:' || target_occurrence.id::text || ':' || p_coach_profile_id::text
      );
    exception when others then
      raise warning 'occurrence coach notification failed for occurrence %: % %', target_occurrence.id, sqlstate, sqlerrm;
    end;
  end if;

  return assignment_id;
end;
$$;

-- Repair and normalise any existing occurrence booking links before enforcing
-- the invariant for new writes.
update public.court_bookings booking
set booking_purpose = 'coaching_session',
    source_product = 'coachr',
    booking_type = 'lesson',
    is_public = false,
    coach_profile_id = session.primary_coach_id,
    booking_organisation_id = session.venue_id,
    owner_organisation_id = court.venue_id,
    notes = 'Coach Session: ' || session.name
from public.coach_session_occurrences occurrence
join public.coach_sessions session on session.id = occurrence.session_id
join public.courts court on true
where booking.coach_session_occurrence_id = occurrence.id
  and court.id = booking.court_id;

insert into public.coach_session_occurrence_courts (occurrence_id, court_id, court_booking_id)
select booking.coach_session_occurrence_id, booking.court_id, booking.id
from public.court_bookings booking
where booking.coach_session_occurrence_id is not null
on conflict do nothing;

update public.court_bookings booking
set status = 'confirmed', cancelled_at = null, cancelled_by_user_id = null
from public.coach_session_occurrence_courts occurrence_court
join public.coach_session_occurrences occurrence on occurrence.id = occurrence_court.occurrence_id
where occurrence_court.court_booking_id = booking.id
  and occurrence.status = 'scheduled'
  and booking.status = 'cancelled'
  and not exists (
    select 1
    from public.court_bookings conflict
    where conflict.court_id = booking.court_id
      and conflict.id <> booking.id
      and conflict.status = 'confirmed'
      and tstzrange(conflict.start_time, conflict.end_time, '[)')
        && tstzrange(occurrence.start_time, occurrence.end_time, '[)')
  );

with missing as (
  select
    occurrence.id as occurrence_id,
    session_court.court_id,
    session.primary_coach_id,
    session.venue_id as booking_organisation_id,
    court.venue_id as owner_organisation_id,
    occurrence.start_time,
    occurrence.end_time,
    session.created_by_user_id,
    session.name
  from public.coach_session_occurrences occurrence
  join public.coach_sessions session on session.id = occurrence.session_id
  join public.coach_session_courts session_court on session_court.session_id = session.id
  join public.courts court on court.id = session_court.court_id
  where occurrence.status = 'scheduled'
    and session.location_type = 'managed_court'
    and session.created_by_user_id is not null
    and not exists (
      select 1
      from public.coach_session_occurrence_courts linked
      where linked.occurrence_id = occurrence.id
        and linked.court_id = session_court.court_id
    )
    and not exists (
      select 1
      from public.court_bookings conflict
      where conflict.court_id = session_court.court_id
        and conflict.status = 'confirmed'
        and tstzrange(conflict.start_time, conflict.end_time, '[)')
          && tstzrange(occurrence.start_time, occurrence.end_time, '[)')
    )
), inserted as (
  insert into public.court_bookings (
    court_id, booked_by_user_id, player_profile_id, coach_profile_id,
    start_time, end_time, status, booking_type, is_public, notes,
    booking_organisation_id, owner_organisation_id, booking_purpose,
    source_product, coach_session_occurrence_id
  )
  select
    missing.court_id, missing.created_by_user_id, null, missing.primary_coach_id,
    missing.start_time, missing.end_time, 'confirmed', 'lesson', false,
    'Coach Session: ' || missing.name,
    missing.booking_organisation_id, missing.owner_organisation_id,
    'coaching_session', 'coachr', missing.occurrence_id
  from missing
  returning id, coach_session_occurrence_id, court_id
)
insert into public.coach_session_occurrence_courts (occurrence_id, court_id, court_booking_id)
select inserted.coach_session_occurrence_id, inserted.court_id, inserted.id
from inserted
on conflict do nothing;

create or replace function public.coachr_validate_occurrence_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_occurrence_id uuid;
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
begin
  if tg_table_name = 'coach_session_occurrences' then
    target_occurrence_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'coach_session_occurrence_courts' then
    target_occurrence_id := case when tg_op = 'DELETE' then old.occurrence_id else new.occurrence_id end;
  else
    target_occurrence_id := case
      when tg_op = 'DELETE' then old.coach_session_occurrence_id
      else coalesce(new.coach_session_occurrence_id, old.coach_session_occurrence_id)
    end;
  end if;

  if target_occurrence_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into target_occurrence
  from public.coach_session_occurrences
  where id = target_occurrence_id;

  if target_occurrence.id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into target_session
  from public.coach_sessions
  where id = target_occurrence.session_id;

  if target_occurrence.status = 'scheduled' and target_session.location_type = 'managed_court' then
    if not exists (
      select 1
      from public.coach_session_occurrence_courts occurrence_court
      join public.court_bookings booking on booking.id = occurrence_court.court_booking_id
      where occurrence_court.occurrence_id = target_occurrence.id
        and booking.coach_session_occurrence_id = target_occurrence.id
        and booking.court_id = occurrence_court.court_id
        and booking.status = 'confirmed'
        and booking.start_time = target_occurrence.start_time
        and booking.end_time = target_occurrence.end_time
        and booking.booking_purpose = 'coaching_session'
        and booking.source_product = 'coachr'
    ) then
      raise exception 'booking_synchronisation_failed' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.coach_session_occurrence_courts occurrence_court
      left join public.court_bookings booking on booking.id = occurrence_court.court_booking_id
      where occurrence_court.occurrence_id = target_occurrence.id
        and (
          booking.id is null
          or booking.coach_session_occurrence_id is distinct from target_occurrence.id
          or booking.court_id is distinct from occurrence_court.court_id
          or booking.status <> 'confirmed'
          or booking.start_time is distinct from target_occurrence.start_time
          or booking.end_time is distinct from target_occurrence.end_time
        )
    ) then
      raise exception 'booking_synchronisation_failed' using errcode = 'P0001';
    end if;
  elsif target_occurrence.status in ('cancelled', 'rain', 'sick') and exists (
    select 1
    from public.court_bookings booking
    where booking.coach_session_occurrence_id = target_occurrence.id
      and booking.status = 'confirmed'
  ) then
    raise exception 'booking_release_failed' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists coach_session_occurrences_validate_reservation on public.coach_session_occurrences;
create constraint trigger coach_session_occurrences_validate_reservation
after insert or update on public.coach_session_occurrences
deferrable initially deferred
for each row execute function public.coachr_validate_occurrence_reservation();

drop trigger if exists coach_session_occurrence_courts_validate_reservation on public.coach_session_occurrence_courts;
create constraint trigger coach_session_occurrence_courts_validate_reservation
after insert or update or delete on public.coach_session_occurrence_courts
deferrable initially deferred
for each row execute function public.coachr_validate_occurrence_reservation();

drop trigger if exists court_bookings_validate_session_occurrence on public.court_bookings;
create constraint trigger court_bookings_validate_session_occurrence
after insert or update or delete on public.court_bookings
deferrable initially deferred
for each row
execute function public.coachr_validate_occurrence_reservation();

create or replace function public.playr_court_occupancy_for_range(
  check_start_time timestamptz,
  check_end_time timestamptz
)
returns table (
  court_id uuid,
  player_profile_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  booking_type public.court_booking_type,
  player_name text,
  occupancy_type text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    booking.court_id,
    case when public.can_manage_profile(booking.player_profile_id) then booking.player_profile_id else null end,
    booking.start_time,
    booking.end_time,
    case when public.can_manage_profile(booking.player_profile_id) then booking.booking_type else null end,
    case when public.can_manage_profile(booking.player_profile_id) then concat_ws(' ', profile.first_name, profile.last_name) else null end,
    case when public.can_manage_profile(booking.player_profile_id) then 'own_booking' else 'unavailable' end
  from public.court_bookings booking
  left join public.profiles profile on profile.id = booking.player_profile_id
  where (select auth.uid()) is not null
    and check_end_time > check_start_time
    and booking.status = 'confirmed'
    and tstzrange(booking.start_time, booking.end_time, '[)')
      && tstzrange(check_start_time, check_end_time, '[)')
  order by booking.start_time, booking.court_id;
$$;

create or replace function public.playr_booking_within_venue_window(
  p_court_id uuid,
  p_start_time timestamptz,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and p_start_time >= now()
    and p_start_time < now() + make_interval(
      days => greatest(
        1,
        least(90, coalesce(settings.advance_booking_days, 7))
      )
    )
  from public.courts court
  left join public.organisation_booking_settings settings on settings.venue_id = court.venue_id
  where court.id = p_court_id
    and court.status = 'active';
$$;

drop policy if exists "Users can create court bookings for own profiles" on public.court_bookings;
create policy "Users can create court bookings for own profiles"
on public.court_bookings
for insert
to authenticated
with check (
  booked_by_user_id = (select auth.uid())
  and booking_type = 'player_booking'
  and status = 'confirmed'
  and public.can_manage_profile(player_profile_id)
  and public.playr_booking_within_venue_window(court_id, start_time)
  and end_time = start_time + interval '1 hour'
  and booking_organisation_id is null
  and owner_organisation_id is not distinct from (select court.venue_id from public.courts court where court.id = court_id)
  and coach_lesson_id is null
  and coach_session_occurrence_id is null
  and coach_profile_id is null
  and booking_purpose = 'member_booking'
  and source_product = 'playr'
);

create or replace function public.clubr_court_occupancy_for_range(
  p_owner_venue_id uuid,
  check_start_time timestamptz,
  check_end_time timestamptz
)
returns table (
  booking_id uuid,
  court_id uuid,
  court_name text,
  start_time timestamptz,
  end_time timestamptz,
  booking_status public.court_booking_status,
  booking_type public.court_booking_type,
  occupancy_type text,
  source_product text,
  booking_organisation_id uuid,
  academy_name text,
  session_name text,
  session_type text,
  coach_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if (select auth.uid()) is null
    or (
      p_owner_venue_id is null
      and not public.user_is_platform_admin((select auth.uid()))
    )
    or (
      p_owner_venue_id is not null
      and not public.user_can_manage_court_access(p_owner_venue_id)
    ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    booking.id,
    booking.court_id,
    court.name,
    booking.start_time,
    booking.end_time,
    booking.status,
    booking.booking_type,
    case
      when booking.booking_purpose = 'coaching_session' then 'coaching_session'
      when booking.booking_purpose = 'coaching_lesson' then 'coaching_lesson'
      when booking.booking_type = 'player_booking' then 'member_booking'
      when booking.booking_type = 'maintenance' then 'maintenance'
      when booking.booking_type in ('competition', 'americano') then 'event'
      when booking.booking_type = 'club_programme' then 'club_programme'
      else coalesce(booking.booking_purpose, booking.booking_type::text, 'occupied')
    end,
    booking.source_product,
    booking.booking_organisation_id,
    academy.name,
    session.name,
    session.session_type,
    nullif(concat_ws(' ', coach.first_name, coach.last_name), '')
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  left join public.venues academy on academy.id = booking.booking_organisation_id
  left join public.coach_session_occurrences occurrence on occurrence.id = booking.coach_session_occurrence_id
  left join public.coach_sessions session on session.id = occurrence.session_id
  left join public.profiles coach on coach.id = booking.coach_profile_id
  where (p_owner_venue_id is null or court.venue_id = p_owner_venue_id)
    and check_end_time > check_start_time
    and tstzrange(booking.start_time, booking.end_time, '[)')
      && tstzrange(check_start_time, check_end_time, '[)')
  order by booking.start_time, court.sort_order, court.name;
end;
$$;

create or replace function public.coachr_occurrence_diagnostics(p_occurrence_id uuid)
returns table (
  occurrence_id uuid,
  session_id uuid,
  session_name text,
  coach_names text,
  court_id uuid,
  court_name text,
  booking_id uuid,
  booking_status public.court_booking_status,
  availability_resolver_result text,
  occupancy_type text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_session_id uuid;
begin
  select occurrence.session_id into target_session_id
  from public.coach_session_occurrences occurrence
  where occurrence.id = p_occurrence_id;

  if actor_user_id is null
    or target_session_id is null
    or not public.coachr_can_manage_session(target_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    occurrence.id,
    session.id,
    session.name,
    coalesce(coaches.names, 'No coach assignment'),
    occurrence_court.court_id,
    court.name,
    booking.id,
    booking.status,
    case
      when occurrence_court.court_id is null then 'not_applicable'
      when exists (
        select 1
        from public.playr_court_occupancy_for_range(occurrence.start_time, occurrence.end_time) resolved
        where resolved.court_id = occurrence_court.court_id
      ) then 'unavailable'
      else 'available'
    end,
    case
      when booking.booking_purpose = 'coaching_session' then 'coaching_session'
      when booking.booking_purpose = 'coaching_lesson' then 'coaching_lesson'
      else coalesce(booking.booking_purpose, booking.booking_type::text, 'missing')
    end
  from public.coach_session_occurrences occurrence
  join public.coach_sessions session on session.id = occurrence.session_id
  left join lateral (
    select string_agg(concat_ws(' ', profile.first_name, profile.last_name), ', ' order by occurrence_coach.role, profile.first_name, profile.last_name) as names
    from public.coach_session_occurrence_coaches occurrence_coach
    join public.profiles profile on profile.id = occurrence_coach.coach_profile_id
    where occurrence_coach.occurrence_id = occurrence.id
      and occurrence_coach.status = 'active'
  ) coaches on true
  left join public.coach_session_occurrence_courts occurrence_court on occurrence_court.occurrence_id = occurrence.id
  left join public.courts court on court.id = occurrence_court.court_id
  left join public.court_bookings booking on booking.id = occurrence_court.court_booking_id
  where occurrence.id = p_occurrence_id
  order by court.name nulls last;
end;
$$;

create or replace function public.notify_coach_session_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  target_session public.coach_sessions%rowtype;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select * into target_session from public.coach_sessions where id = new.session_id;
  select coalesce(membership.user_id, coach.user_id) into target_user_id
  from public.profiles coach
  left join public.organisation_memberships membership
    on membership.profile_id = coach.id
   and membership.venue_id = target_session.venue_id
   and membership.status = 'active'
  where coach.id = new.coach_profile_id
  limit 1;

  if target_user_id is null or target_user_id = target_session.created_by_user_id then
    return new;
  end if;

  begin
    perform public.create_system_notification(
      target_user_id => target_user_id,
      notification_type => 'lesson_created',
      notification_title => 'Session added to your schedule',
      notification_message => target_session.name || ' has been added to your CoachR schedule.',
      notification_href => '/dashboard/coachr/schedule?session=' || target_session.id::text,
      notification_actor_user_id => target_session.created_by_user_id,
      notification_metadata => jsonb_build_object(
        'sessionId', target_session.id,
        'organisationId', target_session.venue_id,
        'coachProfileId', new.coach_profile_id,
        'role', new.role
      ),
      notification_dedupe_key => 'coach-session-assigned:' || target_session.id::text || ':' || new.coach_profile_id::text
    );
  exception when others then
    raise warning 'session assignment notification failed for session %: % %', target_session.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists coach_session_coaches_notify_assignment on public.coach_session_coaches;
create trigger coach_session_coaches_notify_assignment
after insert on public.coach_session_coaches
for each row execute function public.notify_coach_session_assignment();

create or replace function public.notify_coaches_of_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_coach record;
  target_session public.coach_sessions%rowtype;
  notification_kind text;
  notification_title text;
  notification_message text;
  notification_key text;
begin
  if new.status is distinct from old.status and new.status in ('cancelled', 'rain', 'sick') then
    notification_kind := 'lesson_cancelled';
    notification_title := 'Coaching session cancelled';
    notification_key := 'coach-session-cancelled:' || new.id::text || ':' || new.status;
  elsif new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time then
    notification_kind := 'lesson_updated';
    notification_title := 'Coaching session rescheduled';
    notification_key := 'coach-session-moved:' || new.id::text || ':' || extract(epoch from new.start_time)::bigint::text;
  else
    return new;
  end if;

  select * into target_session from public.coach_sessions where id = new.session_id;
  notification_message := target_session.name || case
    when notification_kind = 'lesson_cancelled' then ' has been cancelled.'
    else ' has a new date or time.'
  end;

  for assigned_coach in
    select distinct
      occurrence_coach.coach_profile_id,
      coalesce(membership.user_id, coach.user_id) as user_id
    from public.coach_session_occurrence_coaches occurrence_coach
    join public.profiles coach on coach.id = occurrence_coach.coach_profile_id
    left join public.organisation_memberships membership
      on membership.profile_id = coach.id
     and membership.venue_id = target_session.venue_id
     and membership.status = 'active'
    where occurrence_coach.occurrence_id = new.id
      and occurrence_coach.status = 'active'
  loop
    if assigned_coach.user_id is null or assigned_coach.user_id = (select auth.uid()) then
      continue;
    end if;
    begin
      perform public.create_system_notification(
        target_user_id => assigned_coach.user_id,
        notification_type => notification_kind,
        notification_title => notification_title,
        notification_message => notification_message,
        notification_href => '/dashboard/coachr/schedule?session=' || target_session.id::text,
        notification_actor_user_id => (select auth.uid()),
        notification_metadata => jsonb_build_object(
          'sessionId', target_session.id,
          'occurrenceId', new.id,
          'organisationId', target_session.venue_id,
          'startTime', new.start_time,
          'status', new.status
        ),
        notification_dedupe_key => notification_key || ':' || assigned_coach.coach_profile_id::text
      );
    exception when others then
      raise warning 'session occurrence notification failed for occurrence %: % %', new.id, sqlstate, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists coach_session_occurrences_notify_change on public.coach_session_occurrences;
create trigger coach_session_occurrences_notify_change
after update of start_time, end_time, status on public.coach_session_occurrences
for each row execute function public.notify_coaches_of_occurrence_change();

create or replace function public.coachr_mark_session_attendance(
  p_occurrence_id uuid,
  p_player_profile_id uuid,
  p_attendance_status text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_session_id uuid;
  attendance_id uuid;
begin
  select occurrence.session_id into target_session_id
  from public.coach_session_occurrences occurrence
  where occurrence.id = p_occurrence_id;

  if actor_user_id is null or target_session_id is null
    or not public.coachr_can_manage_session(target_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_attendance_status not in ('present', 'absent', 'excused', 'late', 'not_recorded') then
    raise exception 'attendance_status' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.coach_session_occurrence_participants participant
    where participant.occurrence_id = p_occurrence_id
      and participant.player_profile_id = p_player_profile_id
      and participant.status = 'active'
  ) then
    raise exception 'attendance_player' using errcode = 'P0001';
  end if;

  insert into public.coach_session_attendance (
    occurrence_id, player_profile_id, attendance_status, recorded_by_user_id,
    recorded_at, notes
  ) values (
    p_occurrence_id, p_player_profile_id, p_attendance_status, actor_user_id,
    case when p_attendance_status = 'not_recorded' then null else now() end,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  on conflict (occurrence_id, player_profile_id) do update
  set attendance_status = excluded.attendance_status,
      recorded_by_user_id = excluded.recorded_by_user_id,
      recorded_at = excluded.recorded_at,
      notes = excluded.notes,
      updated_at = now()
  returning id into attendance_id;

  if not exists (
    select 1
    from public.coach_session_occurrence_participants participant
    where participant.occurrence_id = p_occurrence_id
      and participant.status = 'active'
      and not exists (
        select 1
        from public.coach_session_attendance attendance
        where attendance.occurrence_id = p_occurrence_id
          and attendance.player_profile_id = participant.player_profile_id
          and attendance.attendance_status <> 'not_recorded'
      )
  ) then
    update public.coach_session_occurrences
    set status = 'completed'
    where id = p_occurrence_id and status = 'scheduled' and end_time <= now();
  end if;

  return attendance_id;
end;
$$;

create or replace function public.coachr_mark_all_session_attendance(
  p_occurrence_id uuid,
  p_attendance_status text default 'present'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_session_id uuid;
  marked_count integer;
begin
  select occurrence.session_id into target_session_id
  from public.coach_session_occurrences occurrence
  where occurrence.id = p_occurrence_id;

  if actor_user_id is null or target_session_id is null
    or not public.coachr_can_manage_session(target_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_attendance_status not in ('present', 'absent', 'excused', 'late') then
    raise exception 'attendance_status' using errcode = 'P0001';
  end if;

  insert into public.coach_session_attendance (
    occurrence_id, player_profile_id, attendance_status,
    recorded_by_user_id, recorded_at
  )
  select p_occurrence_id, participant.player_profile_id, p_attendance_status,
    actor_user_id, now()
  from public.coach_session_occurrence_participants participant
  where participant.occurrence_id = p_occurrence_id
    and participant.status = 'active'
  on conflict (occurrence_id, player_profile_id) do update
  set attendance_status = excluded.attendance_status,
      recorded_by_user_id = excluded.recorded_by_user_id,
      recorded_at = excluded.recorded_at,
      updated_at = now();
  get diagnostics marked_count = row_count;

  update public.coach_session_occurrences
  set status = 'completed'
  where id = p_occurrence_id and status = 'scheduled' and end_time <= now();

  return marked_count;
end;
$$;

create or replace function public.coachr_update_session_participant(
  p_session_id uuid,
  p_player_profile_id uuid,
  p_status text,
  p_effective_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_session public.coach_sessions%rowtype;
  participant_id uuid;
  active_count integer;
  parent_id uuid;
  player_name text;
begin
  select * into target_session from public.coach_sessions where id = p_session_id;
  if actor_user_id is null or target_session.id is null
    or not public.coachr_can_manage_session(target_session.id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_status not in ('active', 'pending', 'paused', 'removed') then
    raise exception 'participant_status' using errcode = 'P0001';
  end if;
  if p_status = 'active'
    and not public.coachr_player_is_active_student(target_session.venue_id, p_player_profile_id, target_session.primary_coach_id) then
    raise exception 'invalid_student' using errcode = 'P0001';
  end if;

  select count(*) into active_count
  from public.coach_session_participants
  where session_id = target_session.id
    and status = 'active'
    and player_profile_id <> p_player_profile_id;
  if p_status = 'active' and active_count >= target_session.capacity then
    raise exception 'capacity' using errcode = 'P0001';
  end if;

  select profile.parent_profile_id, concat_ws(' ', profile.first_name, profile.last_name)
  into parent_id, player_name
  from public.profiles profile
  where profile.id = p_player_profile_id;
  if not found then raise exception 'invalid_student' using errcode = 'P0001'; end if;

  if p_status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended('player:' || p_player_profile_id::text, 0));
    if exists (
      select 1
      from public.coach_session_occurrences target_occurrence
      join public.coach_session_occurrences other_occurrence
        on other_occurrence.id <> target_occurrence.id
       and other_occurrence.session_id <> target_session.id
       and other_occurrence.status = 'scheduled'
       and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
         && tstzrange(target_occurrence.start_time, target_occurrence.end_time, '[)')
      join public.coach_session_occurrence_participants other_participant
        on other_participant.occurrence_id = other_occurrence.id
       and other_participant.player_profile_id = p_player_profile_id
       and other_participant.status = 'active'
      where target_occurrence.session_id = target_session.id
        and target_occurrence.status = 'scheduled'
        and target_occurrence.occurrence_date >= p_effective_date
    ) or exists (
      select 1
      from public.coach_session_occurrences target_occurrence
      join public.coach_lessons legacy
        on legacy.player_id = p_player_profile_id
       and legacy.status not in ('cancelled', 'rain', 'sick')
       and tstzrange(legacy.start_time, legacy.end_time, '[)')
         && tstzrange(target_occurrence.start_time, target_occurrence.end_time, '[)')
      where target_occurrence.session_id = target_session.id
        and target_occurrence.status = 'scheduled'
        and target_occurrence.occurrence_date >= p_effective_date
    ) then
      raise exception 'player_conflict:%', coalesce(player_name, 'Selected player') using errcode = 'P0001';
    end if;
  end if;

  insert into public.coach_session_participants (
    session_id, player_profile_id, parent_profile_id, status, joined_on,
    ends_on, added_by_user_id
  ) values (
    target_session.id, p_player_profile_id, parent_id, p_status,
    p_effective_date, case when p_status = 'removed' then p_effective_date else null end,
    actor_user_id
  )
  on conflict (session_id, player_profile_id) do update
  set status = excluded.status,
      joined_on = case when excluded.status = 'active' then least(coach_session_participants.joined_on, excluded.joined_on) else coach_session_participants.joined_on end,
      ends_on = case when excluded.status = 'removed' then excluded.ends_on else null end,
      updated_at = now()
  returning id into participant_id;

  if p_status = 'active' then
    insert into public.coach_session_occurrence_participants (
      occurrence_id, player_profile_id, parent_profile_id, status
    )
    select occurrence.id, p_player_profile_id, parent_id, 'active'
    from public.coach_session_occurrences occurrence
    where occurrence.session_id = target_session.id
      and occurrence.status = 'scheduled'
      and occurrence.occurrence_date >= p_effective_date
    on conflict (occurrence_id, player_profile_id) do update
    set parent_profile_id = excluded.parent_profile_id,
        status = 'active',
        updated_at = now();
  elsif p_status in ('paused', 'removed') then
    update public.coach_session_occurrence_participants occurrence_participant
    set status = 'removed', updated_at = now()
    from public.coach_session_occurrences occurrence
    where occurrence.id = occurrence_participant.occurrence_id
      and occurrence.session_id = target_session.id
      and occurrence.status = 'scheduled'
      and occurrence.occurrence_date >= p_effective_date
      and occurrence_participant.player_profile_id = p_player_profile_id;
  end if;

  return participant_id;
end;
$$;

revoke all on function public.coachr_snapshot_occurrence_assignments() from public;
revoke all on function public.coachr_user_matches_coach_profile(uuid, uuid, uuid) from public;
revoke all on function public.coachr_can_read_occurrence(uuid, uuid) from public;
revoke all on function public.coachr_prevent_occurrence_coach_overlap() from public;
revoke all on function public.coachr_assign_occurrence_coach(uuid, uuid, text) from public;
revoke all on function public.coachr_validate_occurrence_reservation() from public;
revoke all on function public.playr_court_occupancy_for_range(timestamptz, timestamptz) from public;
revoke all on function public.playr_booking_within_venue_window(uuid, timestamptz, uuid) from public;
revoke all on function public.clubr_court_occupancy_for_range(uuid, timestamptz, timestamptz) from public;
revoke all on function public.coachr_occurrence_diagnostics(uuid) from public;
revoke all on function public.notify_coach_session_assignment() from public;
revoke all on function public.notify_coaches_of_occurrence_change() from public;

grant execute on function public.coachr_can_read_occurrence(uuid, uuid) to authenticated;
grant execute on function public.coachr_assign_occurrence_coach(uuid, uuid, text) to authenticated;
grant execute on function public.playr_court_occupancy_for_range(timestamptz, timestamptz) to authenticated;
grant execute on function public.playr_booking_within_venue_window(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.clubr_court_occupancy_for_range(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.coachr_occurrence_diagnostics(uuid) to authenticated;
