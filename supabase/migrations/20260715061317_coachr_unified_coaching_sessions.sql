-- Phase 1.11: unified coaching sessions. Existing coach_lessons remain the
-- compatibility source for historical private lessons. New private,
-- semi-private and squad sessions use one occurrence and one booking per court.

create table public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  session_type text not null,
  name text not null,
  description text,
  primary_coach_id uuid not null references public.profiles(id) on delete restrict,
  capacity integer not null default 1,
  status text not null default 'active',
  repeat_mode text not null default 'none',
  weekday smallint,
  start_local_time time not null,
  duration_minutes integer not null,
  start_date date not null,
  end_mode text,
  end_date date,
  occurrence_count integer,
  generated_through date,
  location_type text not null default 'managed_court',
  external_venue_id uuid references public.organisation_external_venues(id) on delete set null,
  custom_location text,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  ended_by_user_id uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_sessions_type_valid check (session_type in ('private', 'semi_private', 'squad')),
  constraint coach_sessions_name_not_blank check (length(btrim(name)) > 0),
  constraint coach_sessions_capacity_valid check (
    capacity between 1 and 80
    and (session_type <> 'private' or capacity = 1)
    and (session_type <> 'semi_private' or capacity >= 2)
  ),
  constraint coach_sessions_status_valid check (status in ('active', 'paused', 'ended', 'cancelled')),
  constraint coach_sessions_repeat_valid check (repeat_mode in ('none', 'weekly')),
  constraint coach_sessions_duration_valid check (duration_minutes between 5 and 480),
  constraint coach_sessions_schedule_valid check (
    (repeat_mode = 'none' and weekday is null and end_mode is null and end_date is null and occurrence_count is null)
    or (
      repeat_mode = 'weekly'
      and weekday between 1 and 7
      and end_mode in ('until_cancelled', 'until_date', 'occurrence_count')
      and (
        (end_mode = 'until_cancelled' and end_date is null and occurrence_count is null)
        or (end_mode = 'until_date' and end_date is not null and end_date >= start_date and occurrence_count is null)
        or (end_mode = 'occurrence_count' and end_date is null and occurrence_count between 1 and 104)
      )
    )
  ),
  constraint coach_sessions_location_valid check (
    location_type = 'managed_court'
    or (location_type = 'custom' and (external_venue_id is not null or length(btrim(coalesce(custom_location, ''))) > 0))
    or (location_type = 'none' and external_venue_id is null and custom_location is null)
  )
);

create table public.coach_session_coaches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  coach_profile_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'assistant',
  status text not null default 'active',
  added_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_coaches_role_valid check (role in ('primary', 'assistant')),
  constraint coach_session_coaches_status_valid check (status in ('active', 'removed')),
  constraint coach_session_coaches_unique unique (session_id, coach_profile_id)
);

create table public.coach_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete restrict,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  joined_on date not null default current_date,
  ends_on date,
  added_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_participants_status_valid check (status in ('active', 'pending', 'paused', 'removed')),
  constraint coach_session_participants_dates_valid check (ends_on is null or ends_on >= joined_on),
  constraint coach_session_participants_unique unique (session_id, player_profile_id)
);

create table public.coach_session_courts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint coach_session_courts_unique unique (session_id, court_id)
);

create table public.coach_session_occurrences (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete restrict,
  occurrence_date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled',
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_occurrences_time_valid check (end_time > start_time),
  constraint coach_session_occurrences_status_valid check (status in ('scheduled', 'completed', 'cancelled', 'rain', 'sick')),
  constraint coach_session_occurrences_unique unique (session_id, occurrence_date)
);

alter table public.court_bookings
  add column if not exists coach_session_occurrence_id uuid references public.coach_session_occurrences(id) on delete set null;

create table public.coach_session_occurrence_courts (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.coach_session_occurrences(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  court_booking_id uuid not null references public.court_bookings(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint coach_session_occurrence_courts_unique unique (occurrence_id, court_id),
  constraint coach_session_occurrence_booking_unique unique (court_booking_id)
);

create table public.coach_session_attendance (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.coach_session_occurrences(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance_status text not null default 'not_recorded',
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_attendance_status_valid check (attendance_status in ('present', 'absent', 'excused', 'late', 'not_recorded')),
  constraint coach_session_attendance_unique unique (occurrence_id, player_profile_id)
);

create index coach_sessions_venue_status_idx on public.coach_sessions(venue_id, status, start_date);
create index coach_sessions_primary_coach_idx on public.coach_sessions(primary_coach_id, status, start_date);
create index coach_session_coaches_coach_idx on public.coach_session_coaches(coach_profile_id, status, session_id);
create index coach_session_participants_player_idx on public.coach_session_participants(player_profile_id, status, session_id);
create index coach_session_occurrences_range_idx on public.coach_session_occurrences(start_time, end_time) where status = 'scheduled';
create index coach_session_occurrences_session_idx on public.coach_session_occurrences(session_id, occurrence_date);
create index court_bookings_session_occurrence_idx on public.court_bookings(coach_session_occurrence_id) where coach_session_occurrence_id is not null;
create index coach_session_attendance_player_idx on public.coach_session_attendance(player_profile_id, recorded_at desc);

create unique index coach_session_primary_coach_unique
on public.coach_session_coaches(session_id)
where role = 'primary' and status = 'active';

create unique index court_bookings_session_occurrence_court_unique
on public.court_bookings(coach_session_occurrence_id, court_id)
where coach_session_occurrence_id is not null;

create trigger coach_sessions_set_updated_at before update on public.coach_sessions
for each row execute function public.set_updated_at();
create trigger coach_session_coaches_set_updated_at before update on public.coach_session_coaches
for each row execute function public.set_updated_at();
create trigger coach_session_participants_set_updated_at before update on public.coach_session_participants
for each row execute function public.set_updated_at();
create trigger coach_session_occurrences_set_updated_at before update on public.coach_session_occurrences
for each row execute function public.set_updated_at();
create trigger coach_session_attendance_set_updated_at before update on public.coach_session_attendance
for each row execute function public.set_updated_at();

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
            join public.profiles coach on coach.id = session_coach.coach_profile_id
            join public.organisation_memberships membership
              on membership.profile_id = coach.id
             and membership.venue_id = session.venue_id
             and membership.status = 'active'
             and membership.role in ('head_coach', 'coach', 'assistant_coach')
            where session_coach.session_id = session.id
              and session_coach.status = 'active'
              and coach.user_id = p_user_id
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
    );
$$;

alter table public.coach_sessions enable row level security;
alter table public.coach_session_coaches enable row level security;
alter table public.coach_session_participants enable row level security;
alter table public.coach_session_courts enable row level security;
alter table public.coach_session_occurrences enable row level security;
alter table public.coach_session_occurrence_courts enable row level security;
alter table public.coach_session_attendance enable row level security;

grant select on public.coach_sessions to authenticated;
grant select on public.coach_session_coaches to authenticated;
grant select on public.coach_session_participants to authenticated;
grant select on public.coach_session_courts to authenticated;
grant select on public.coach_session_occurrences to authenticated;
grant select on public.coach_session_occurrence_courts to authenticated;
grant select on public.coach_session_attendance to authenticated;

create policy "Authorised users can read coaching sessions"
on public.coach_sessions for select to authenticated
using (public.coachr_can_read_session(id));

create policy "Authorised users can read session coaches"
on public.coach_session_coaches for select to authenticated
using (public.coachr_can_read_session(session_id));

create policy "Authorised users can read session participants"
on public.coach_session_participants for select to authenticated
using (public.coachr_can_read_session(session_id));

create policy "Authorised users can read session courts"
on public.coach_session_courts for select to authenticated
using (public.coachr_can_read_session(session_id));

create policy "Authorised users can read session occurrences"
on public.coach_session_occurrences for select to authenticated
using (public.coachr_can_read_session(session_id));

create policy "Authorised users can read occurrence courts"
on public.coach_session_occurrence_courts for select to authenticated
using (
  exists (
    select 1 from public.coach_session_occurrences occurrence
    where occurrence.id = occurrence_id
      and public.coachr_can_read_session(occurrence.session_id)
  )
);

create policy "Authorised users can read session attendance"
on public.coach_session_attendance for select to authenticated
using (
  exists (
    select 1 from public.coach_session_occurrences occurrence
    where occurrence.id = occurrence_id
      and public.coachr_can_read_session(occurrence.session_id)
  )
);

create or replace function public.coachr_generate_session_occurrences(
  p_session_id uuid,
  p_through_date date,
  p_strict boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_session public.coach_sessions%rowtype;
  candidate_date date;
  scan_start date;
  boundary date;
  occurrence_start timestamptz;
  occurrence_end timestamptz;
  new_occurrence_id uuid;
  new_booking_id uuid;
  participant record;
  session_coach record;
  selected_court record;
  generated_count integer := 0;
  existing_count integer := 0;
  conflict_message text;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select * into target_session
  from public.coach_sessions
  where id = p_session_id
  for update;

  if target_session.id is null or not public.coachr_can_manage_session(target_session.id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if target_session.status <> 'active' then
    return 0;
  end if;

  select count(*) into existing_count
  from public.coach_session_occurrences
  where session_id = target_session.id;

  scan_start := greatest(target_session.start_date, coalesce(target_session.generated_through + 1, target_session.start_date));
  boundary := greatest(scan_start, p_through_date);

  if target_session.repeat_mode = 'none' then
    boundary := target_session.start_date;
    scan_start := target_session.start_date;
  elsif target_session.end_mode = 'until_date' then
    boundary := least(boundary, target_session.end_date);
  end if;

  for candidate_date in
    select day_value::date
    from generate_series(scan_start, boundary, interval '1 day') day_value
    where (
      target_session.repeat_mode = 'none'
      and day_value::date = target_session.start_date
    ) or (
      target_session.repeat_mode = 'weekly'
      and extract(isodow from day_value)::integer = target_session.weekday
    )
    order by day_value
  loop
    exit when target_session.end_mode = 'occurrence_count'
      and existing_count + generated_count >= target_session.occurrence_count;

    if exists (
      select 1 from public.coach_session_occurrences existing
      where existing.session_id = target_session.id
        and existing.occurrence_date = candidate_date
    ) then
      continue;
    end if;

    occurrence_start := public.coachr_local_datetime(candidate_date, target_session.start_local_time);
    occurrence_end := occurrence_start + make_interval(mins => target_session.duration_minutes);
    conflict_message := null;

    for participant in
      select membership.player_profile_id, profile.first_name, profile.last_name
      from public.coach_session_participants membership
      join public.profiles profile on profile.id = membership.player_profile_id
      where membership.session_id = target_session.id
        and membership.status = 'active'
        and membership.joined_on <= candidate_date
        and (membership.ends_on is null or membership.ends_on >= candidate_date)
    loop
      perform pg_advisory_xact_lock(hashtextextended('player:' || participant.player_profile_id::text, 0));
      if exists (
        select 1
        from public.coach_session_occurrences other_occurrence
        join public.coach_session_participants other_participant
          on other_participant.session_id = other_occurrence.session_id
         and other_participant.player_profile_id = participant.player_profile_id
         and other_participant.status = 'active'
        where other_occurrence.status = 'scheduled'
          and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
      ) or exists (
        select 1 from public.coach_lessons legacy
        where legacy.player_id = participant.player_profile_id
          and legacy.status not in ('cancelled', 'rain', 'sick')
          and tstzrange(legacy.start_time, legacy.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
      ) then
        conflict_message := 'player_conflict:' || concat_ws(' ', participant.first_name, participant.last_name);
        exit;
      end if;
    end loop;

    if conflict_message is null then
      for session_coach in
        select membership.coach_profile_id, profile.first_name, profile.last_name
        from public.coach_session_coaches membership
        join public.profiles profile on profile.id = membership.coach_profile_id
        where membership.session_id = target_session.id and membership.status = 'active'
      loop
        perform pg_advisory_xact_lock(hashtextextended('coach:' || session_coach.coach_profile_id::text, 0));
        if exists (
          select 1
          from public.coach_session_occurrences other_occurrence
          join public.coach_session_coaches other_coach
            on other_coach.session_id = other_occurrence.session_id
           and other_coach.coach_profile_id = session_coach.coach_profile_id
           and other_coach.status = 'active'
          where other_occurrence.status = 'scheduled'
            and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
        ) or exists (
          select 1 from public.coach_lessons legacy
          where legacy.coach_id = session_coach.coach_profile_id
            and legacy.status not in ('cancelled', 'rain', 'sick')
            and tstzrange(legacy.start_time, legacy.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
        ) then
          conflict_message := 'coach_conflict:' || concat_ws(' ', session_coach.first_name, session_coach.last_name);
          exit;
        end if;
      end loop;
    end if;

    if conflict_message is null then
      for selected_court in
        select court.id, court.name
        from public.coach_session_courts session_court
        join public.courts court on court.id = session_court.court_id
        where session_court.session_id = target_session.id
        order by session_court.sort_order, court.name
      loop
        if exists (
          select 1 from public.court_bookings booking
          where booking.court_id = selected_court.id
            and booking.status = 'confirmed'
            and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
        ) then
          conflict_message := 'court_conflict:' || selected_court.name;
          exit;
        end if;
      end loop;
    end if;

    if conflict_message is not null then
      if p_strict then
        raise exception '%', conflict_message using errcode = 'P0001';
      end if;
      continue;
    end if;

    insert into public.coach_session_occurrences (
      session_id, occurrence_date, start_time, end_time, status
    ) values (
      target_session.id, candidate_date, occurrence_start, occurrence_end, 'scheduled'
    ) returning id into new_occurrence_id;

    for selected_court in
      select court.id, court.name, court.venue_id
      from public.coach_session_courts session_court
      join public.courts court on court.id = session_court.court_id
      where session_court.session_id = target_session.id
      order by session_court.sort_order, court.name
    loop
      insert into public.court_bookings (
        court_id, booked_by_user_id, player_profile_id, coach_profile_id,
        start_time, end_time, status, booking_type, is_public, notes,
        booking_organisation_id, owner_organisation_id, booking_purpose,
        source_product, coach_session_occurrence_id
      ) values (
        selected_court.id, actor_user_id, null, target_session.primary_coach_id,
        occurrence_start, occurrence_end, 'confirmed', 'lesson', false,
        'Coach Session: ' || target_session.name,
        target_session.venue_id, selected_court.venue_id, 'coaching_session',
        'coachr', new_occurrence_id
      ) returning id into new_booking_id;

      insert into public.coach_session_occurrence_courts (
        occurrence_id, court_id, court_booking_id
      ) values (
        new_occurrence_id, selected_court.id, new_booking_id
      );
    end loop;

    generated_count := generated_count + 1;
  end loop;

  update public.coach_sessions
  set generated_through = greatest(coalesce(generated_through, boundary), boundary),
      updated_by_user_id = actor_user_id
  where id = target_session.id;

  return generated_count;
exception
  when exclusion_violation then
    raise exception 'court_conflict:Selected court' using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_create_session(
  p_venue_id uuid,
  p_session_type text,
  p_name text,
  p_description text,
  p_primary_coach_id uuid,
  p_additional_coach_ids uuid[],
  p_participant_ids uuid[],
  p_capacity integer,
  p_court_ids uuid[],
  p_location_type text,
  p_external_venue_id uuid,
  p_custom_location text,
  p_repeat_mode text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_recurrence_start_date date,
  p_recurrence_end_mode text,
  p_recurrence_end_date date,
  p_recurrence_occurrence_count integer,
  p_day_of_week integer,
  p_recurrence_start_time time,
  p_recurrence_end_time time,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  new_session_id uuid;
  selected_player record;
  selected_coach_id uuid;
  selected_court_id uuid;
  participant_ids uuid[];
  additional_coach_ids uuid[];
  court_ids uuid[];
  participant_count integer;
  selected_capacity integer;
  local_start_date date;
  local_start_time time;
  duration integer;
  generation_count integer;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_venue_id is null or p_primary_coach_id is null or p_session_type not in ('private', 'semi_private', 'squad') then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if not (
    public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id)
    or public.coach_can_manage_own_lesson(p_primary_coach_id, p_venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if not public.coach_profile_can_teach_at_venue(p_primary_coach_id, p_venue_id, actor_user_id) then
    raise exception 'coach_venue' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct value), array[]::uuid[]) into participant_ids
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) value where value is not null;
  select coalesce(array_agg(distinct value), array[]::uuid[]) into additional_coach_ids
  from unnest(coalesce(p_additional_coach_ids, array[]::uuid[])) value
  where value is not null and value <> p_primary_coach_id;
  select coalesce(array_agg(distinct value), array[]::uuid[]) into court_ids
  from unnest(coalesce(p_court_ids, array[]::uuid[])) value where value is not null;

  participant_count := coalesce(array_length(participant_ids, 1), 0);
  if (p_session_type = 'private' and participant_count <> 1)
    or (p_session_type = 'semi_private' and participant_count < 2)
    or (p_session_type = 'squad' and participant_count < 1) then
    raise exception 'participant_count' using errcode = 'P0001';
  end if;

  selected_capacity := case
    when p_session_type = 'private' then 1
    else greatest(participant_count, coalesce(p_capacity, participant_count))
  end;
  if selected_capacity > 80 then
    raise exception 'capacity' using errcode = 'P0001';
  end if;

  foreach selected_coach_id in array array_append(additional_coach_ids, p_primary_coach_id) loop
    if not public.coach_profile_can_teach_at_venue(selected_coach_id, p_venue_id, actor_user_id) then
      raise exception 'coach_venue' using errcode = 'P0001';
    end if;
  end loop;

  for selected_player in
    select profile.id, profile.is_junior, profile.parent_profile_id
    from public.profiles profile
    where profile.id = any(participant_ids)
  loop
    if not public.coachr_player_is_active_student(p_venue_id, selected_player.id, p_primary_coach_id) then
      raise exception 'invalid_student' using errcode = 'P0001';
    end if;
  end loop;
  if (select count(*) from public.profiles profile where profile.id = any(participant_ids)) <> participant_count then
    raise exception 'invalid_student' using errcode = 'P0001';
  end if;

  if p_location_type = 'managed_court' then
    if coalesce(array_length(court_ids, 1), 0) = 0 then
      raise exception 'missing_court' using errcode = 'P0001';
    end if;
    foreach selected_court_id in array court_ids loop
      if not public.coachr_court_is_authorised(p_venue_id, selected_court_id, actor_user_id) then
        raise exception 'court_access' using errcode = 'P0001';
      end if;
    end loop;
  elsif p_location_type = 'custom' then
    if p_external_venue_id is null and length(btrim(coalesce(p_custom_location, ''))) = 0 then
      raise exception 'custom_location' using errcode = 'P0001';
    end if;
    if p_external_venue_id is not null and not exists (
      select 1 from public.organisation_external_venues external
      where external.id = p_external_venue_id
        and external.organisation_id = p_venue_id
        and external.status = 'active'
    ) then
      raise exception 'external_venue' using errcode = 'P0001';
    end if;
    court_ids := array[]::uuid[];
  elsif p_location_type = 'none' then
    court_ids := array[]::uuid[];
  else
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if p_repeat_mode = 'none' then
    if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
      raise exception 'time_order' using errcode = 'P0001';
    end if;
    local_start_date := (p_start_time at time zone 'Africa/Johannesburg')::date;
    local_start_time := (p_start_time at time zone 'Africa/Johannesburg')::time;
    duration := round(extract(epoch from (p_end_time - p_start_time)) / 60)::integer;
  elsif p_repeat_mode = 'weekly' then
    if p_recurrence_start_date is null or p_day_of_week not between 1 and 7
      or p_recurrence_start_time is null or p_recurrence_end_time is null
      or p_recurrence_end_time <= p_recurrence_start_time
      or p_recurrence_end_mode not in ('until_cancelled', 'until_date', 'occurrence_count') then
      raise exception 'recurrence_range' using errcode = 'P0001';
    end if;
    if (p_recurrence_end_mode = 'until_date' and (p_recurrence_end_date is null or p_recurrence_end_date < p_recurrence_start_date))
      or (p_recurrence_end_mode = 'occurrence_count' and (p_recurrence_occurrence_count is null or p_recurrence_occurrence_count not between 1 and 104)) then
      raise exception 'recurrence_range' using errcode = 'P0001';
    end if;
    local_start_date := p_recurrence_start_date;
    local_start_time := p_recurrence_start_time;
    duration := round(extract(epoch from (p_recurrence_end_time - p_recurrence_start_time)) / 60)::integer;
  else
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if duration not between 5 and 480 then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  insert into public.coach_sessions (
    venue_id, session_type, name, description, primary_coach_id, capacity,
    repeat_mode, weekday, start_local_time, duration_minutes, start_date,
    end_mode, end_date, occurrence_count, location_type, external_venue_id,
    custom_location, notes, created_by_user_id, updated_by_user_id
  ) values (
    p_venue_id, p_session_type, coalesce(nullif(btrim(p_name), ''), initcap(replace(p_session_type, '_', ' '))),
    nullif(btrim(coalesce(p_description, '')), ''), p_primary_coach_id, selected_capacity,
    p_repeat_mode, case when p_repeat_mode = 'weekly' then p_day_of_week else null end,
    local_start_time, duration, local_start_date,
    case when p_repeat_mode = 'weekly' then p_recurrence_end_mode else null end,
    case when p_recurrence_end_mode = 'until_date' then p_recurrence_end_date else null end,
    case when p_recurrence_end_mode = 'occurrence_count' then p_recurrence_occurrence_count else null end,
    p_location_type,
    case when p_location_type = 'custom' then p_external_venue_id else null end,
    case when p_location_type = 'custom' then btrim(p_custom_location) else null end,
    nullif(btrim(coalesce(p_notes, '')), ''), actor_user_id, actor_user_id
  ) returning id into new_session_id;

  insert into public.coach_session_coaches (session_id, coach_profile_id, role, status, added_by_user_id)
  values (new_session_id, p_primary_coach_id, 'primary', 'active', actor_user_id);
  insert into public.coach_session_coaches (session_id, coach_profile_id, role, status, added_by_user_id)
  select new_session_id, coach_id, 'assistant', 'active', actor_user_id
  from unnest(additional_coach_ids) coach_id;

  insert into public.coach_session_participants (
    session_id, player_profile_id, parent_profile_id, status, joined_on, added_by_user_id
  )
  select new_session_id, profile.id, profile.parent_profile_id, 'active', local_start_date, actor_user_id
  from public.profiles profile where profile.id = any(participant_ids);

  insert into public.coach_session_courts (session_id, court_id, sort_order)
  select new_session_id, court_id, (row_number() over () - 1)::integer
  from unnest(court_ids) court_id;

  generation_count := public.coachr_generate_session_occurrences(
    new_session_id,
    case when p_repeat_mode = 'none' then local_start_date else local_start_date + 83 end,
    true
  );
  if generation_count = 0 then
    raise exception 'session_create_failed' using errcode = 'P0001';
  end if;

  return new_session_id;
exception
  when exclusion_violation then
    raise exception 'court_conflict:Selected court' using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_cancel_session_occurrence(
  p_occurrence_id uuid,
  p_scope text default 'single',
  p_end_date date default null,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_occurrence public.coach_session_occurrences%rowtype;
  affected_count integer;
begin
  select * into target_occurrence from public.coach_session_occurrences where id = p_occurrence_id;
  if actor_user_id is null or target_occurrence.id is null
    or not public.coachr_can_manage_session(target_occurrence.session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_scope not in ('single', 'future', 'series', 'through') then
    raise exception 'cancel_scope' using errcode = 'P0001';
  end if;

  with targets as (
    select occurrence.id
    from public.coach_session_occurrences occurrence
    where occurrence.session_id = target_occurrence.session_id
      and occurrence.status = 'scheduled'
      and (
        (p_scope = 'single' and occurrence.id = target_occurrence.id)
        or (p_scope = 'future' and occurrence.occurrence_date >= target_occurrence.occurrence_date)
        or (p_scope = 'series' and occurrence.end_time >= now())
        or (p_scope = 'through' and p_end_date is not null and occurrence.occurrence_date > p_end_date)
      )
  ), released as (
    update public.court_bookings booking
    set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = actor_user_id
    where booking.coach_session_occurrence_id in (select id from targets)
      and booking.status = 'confirmed'
    returning booking.coach_session_occurrence_id
  )
  update public.coach_session_occurrences occurrence
  set status = 'cancelled', cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      cancelled_at = now(), cancelled_by_user_id = actor_user_id
  where occurrence.id in (select id from targets);
  get diagnostics affected_count = row_count;

  if p_scope in ('future', 'series', 'through') then
    update public.coach_sessions
    set status = 'ended', ended_at = now(), ended_by_user_id = actor_user_id,
        end_mode = case when repeat_mode = 'weekly' then 'until_date' else end_mode end,
        end_date = case
          when repeat_mode = 'weekly' then greatest(start_date, coalesce(p_end_date, target_occurrence.occurrence_date - 1))
          else end_date
        end,
        occurrence_count = case when repeat_mode = 'weekly' then null else occurrence_count end,
        updated_by_user_id = actor_user_id
    where id = target_occurrence.session_id;
  end if;

  return affected_count;
end;
$$;

create or replace function public.coachr_move_session_occurrence(
  p_occurrence_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_court_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
  selected_court_id uuid;
  selected_court record;
  selected_player record;
  selected_coach record;
  selected_court_ids uuid[];
  new_booking_id uuid;
begin
  select * into target_occurrence from public.coach_session_occurrences where id = p_occurrence_id for update;
  if target_occurrence.id is null then raise exception 'invalid_session' using errcode = 'P0001'; end if;
  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  if actor_user_id is null or not public.coachr_can_manage_session(target_session.id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if target_occurrence.status <> 'scheduled' then raise exception 'session_history_protected' using errcode = 'P0001'; end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct value), array[]::uuid[]) into selected_court_ids
  from unnest(coalesce(p_court_ids, array[]::uuid[])) value where value is not null;
  if target_session.location_type = 'managed_court' and coalesce(array_length(selected_court_ids, 1), 0) = 0 then
    raise exception 'missing_court' using errcode = 'P0001';
  end if;
  if target_session.location_type <> 'managed_court' then selected_court_ids := array[]::uuid[]; end if;

  for selected_player in
    select participant.player_profile_id, profile.first_name, profile.last_name
    from public.coach_session_participants participant
    join public.profiles profile on profile.id = participant.player_profile_id
    where participant.session_id = target_session.id and participant.status = 'active'
  loop
    perform pg_advisory_xact_lock(hashtextextended('player:' || selected_player.player_profile_id::text, 0));
    if exists (
      select 1
      from public.coach_session_occurrences other_occurrence
      join public.coach_session_participants other_participant
        on other_participant.session_id = other_occurrence.session_id
       and other_participant.player_profile_id = selected_player.player_profile_id
       and other_participant.status = 'active'
      where other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) or exists (
      select 1 from public.coach_lessons legacy
      where legacy.player_id = selected_player.player_profile_id
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) then
      raise exception 'player_conflict:%', concat_ws(' ', selected_player.first_name, selected_player.last_name) using errcode = 'P0001';
    end if;
  end loop;

  for selected_coach in
    select session_coach.coach_profile_id, profile.first_name, profile.last_name
    from public.coach_session_coaches session_coach
    join public.profiles profile on profile.id = session_coach.coach_profile_id
    where session_coach.session_id = target_session.id and session_coach.status = 'active'
  loop
    perform pg_advisory_xact_lock(hashtextextended('coach:' || selected_coach.coach_profile_id::text, 0));
    if exists (
      select 1
      from public.coach_session_occurrences other_occurrence
      join public.coach_session_coaches other_coach
        on other_coach.session_id = other_occurrence.session_id
       and other_coach.coach_profile_id = selected_coach.coach_profile_id
       and other_coach.status = 'active'
      where other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) or exists (
      select 1 from public.coach_lessons legacy
      where legacy.coach_id = selected_coach.coach_profile_id
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) then
      raise exception 'coach_conflict:%', concat_ws(' ', selected_coach.first_name, selected_coach.last_name) using errcode = 'P0001';
    end if;
  end loop;

  foreach selected_court_id in array selected_court_ids loop
    if not public.coachr_court_is_authorised(target_session.venue_id, selected_court_id, actor_user_id) then
      raise exception 'court_access' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('court:' || selected_court_id::text, 0));
    if exists (
      select 1 from public.court_bookings booking
      where booking.court_id = selected_court_id
        and booking.status = 'confirmed'
        and booking.coach_session_occurrence_id is distinct from target_occurrence.id
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) then
      select court.name into selected_court from public.courts court where court.id = selected_court_id;
      raise exception 'court_conflict:%', coalesce(selected_court.name, 'Selected court') using errcode = 'P0001';
    end if;
  end loop;

  update public.court_bookings
  set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = actor_user_id
  where coach_session_occurrence_id = target_occurrence.id and status = 'confirmed';
  delete from public.coach_session_occurrence_courts where occurrence_id = target_occurrence.id;

  update public.coach_session_occurrences
  set start_time = p_start_time,
      end_time = p_end_time,
      occurrence_date = (p_start_time at time zone 'Africa/Johannesburg')::date
  where id = target_occurrence.id;

  for selected_court in
    select court.id, court.name, court.venue_id
    from public.courts court
    where court.id = any(selected_court_ids)
    order by court.name
  loop
    insert into public.court_bookings (
      court_id, booked_by_user_id, player_profile_id, coach_profile_id,
      start_time, end_time, status, booking_type, is_public, notes,
      booking_organisation_id, owner_organisation_id, booking_purpose,
      source_product, coach_session_occurrence_id
    ) values (
      selected_court.id, actor_user_id, null, target_session.primary_coach_id,
      p_start_time, p_end_time, 'confirmed', 'lesson', false,
      'Coach Session: ' || target_session.name,
      target_session.venue_id, selected_court.venue_id, 'coaching_session',
      'coachr', target_occurrence.id
    ) returning id into new_booking_id;
    insert into public.coach_session_occurrence_courts (occurrence_id, court_id, court_booking_id)
    values (target_occurrence.id, selected_court.id, new_booking_id);
  end loop;
exception
  when exclusion_violation then
    raise exception 'court_conflict:Selected court' using errcode = 'P0001';
  when unique_violation then
    raise exception 'occurrence_conflict' using errcode = 'P0001';
end;
$$;

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
  from public.coach_session_occurrences occurrence where occurrence.id = p_occurrence_id;
  if actor_user_id is null or target_session_id is null
    or not public.coachr_can_manage_session(target_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_attendance_status not in ('present', 'absent', 'excused', 'late', 'not_recorded') then
    raise exception 'attendance_status' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.coach_session_participants participant
    where participant.session_id = target_session_id
      and participant.player_profile_id = p_player_profile_id
      and participant.status in ('active', 'paused', 'removed')
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
    select 1 from public.coach_session_participants participant
    where participant.session_id = target_session_id
      and participant.status = 'active'
      and not exists (
        select 1 from public.coach_session_attendance attendance
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
  from public.coach_session_occurrences occurrence where occurrence.id = p_occurrence_id;
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
  from public.coach_session_participants participant
  where participant.session_id = target_session_id and participant.status = 'active'
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
  where session_id = target_session.id and status = 'active' and player_profile_id <> p_player_profile_id;
  if p_status = 'active' and active_count >= target_session.capacity then
    raise exception 'capacity' using errcode = 'P0001';
  end if;

  select profile.parent_profile_id into parent_id from public.profiles profile where profile.id = p_player_profile_id;
  if not found then raise exception 'invalid_student' using errcode = 'P0001'; end if;

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

  return participant_id;
end;
$$;

create or replace function public.coachr_top_up_sessions(
  p_venue_id uuid,
  p_through_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_session record;
  total_created integer := 0;
begin
  if actor_user_id is null or not (
    public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id)
    or exists (
      select 1
      from public.coach_sessions session
      where session.venue_id = p_venue_id
        and public.coachr_can_manage_session(session.id, actor_user_id)
    )
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  for selected_session in
    select session.id from public.coach_sessions session
    where session.venue_id = p_venue_id
      and session.status = 'active'
      and session.repeat_mode = 'weekly'
      and (session.end_mode <> 'until_date' or session.end_date >= current_date)
      and public.coachr_can_manage_session(session.id, actor_user_id)
  loop
    total_created := total_created + public.coachr_generate_session_occurrences(selected_session.id, p_through_date, false);
  end loop;
  return total_created;
end;
$$;

create or replace function public.coachr_public_academy_affiliations(p_player_profile_id uuid)
returns table (academy_id uuid, academy_name text)
language sql
security definer
set search_path = public
stable
as $$
  select venue.id, venue.name
  from public.organisation_player_links link
  join public.venues venue on venue.id = link.venue_id
  where link.player_profile_id = p_player_profile_id
    and link.status = 'active'
    and venue.status = 'active'
    and venue.organisation_type in ('academy', 'club_academy')
  order by venue.name;
$$;

create or replace function public.coachr_private_player_sessions(p_player_profile_id uuid)
returns table (
  session_id uuid,
  academy_id uuid,
  academy_name text,
  session_name text,
  session_type text,
  coach_name text,
  next_start_time timestamptz,
  location_name text,
  participant_status text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    session.id,
    venue.id,
    venue.name,
    session.name,
    session.session_type,
    concat_ws(' ', coach.first_name, coach.last_name),
    next_occurrence.start_time,
    coalesce(court_names.names, session.custom_location, external.name),
    participant.status
  from public.coach_session_participants participant
  join public.coach_sessions session on session.id = participant.session_id
  join public.venues venue on venue.id = session.venue_id
  join public.profiles coach on coach.id = session.primary_coach_id
  left join public.organisation_external_venues external on external.id = session.external_venue_id
  left join lateral (
    select occurrence.start_time
    from public.coach_session_occurrences occurrence
    where occurrence.session_id = session.id
      and occurrence.status = 'scheduled'
      and occurrence.end_time >= now()
    order by occurrence.start_time
    limit 1
  ) next_occurrence on true
  left join lateral (
    select string_agg(court.name, ', ' order by session_court.sort_order, court.name) as names
    from public.coach_session_courts session_court
    join public.courts court on court.id = session_court.court_id
    where session_court.session_id = session.id
  ) court_names on true
  where participant.player_profile_id = p_player_profile_id
    and participant.status in ('active', 'paused')
    and (
      public.can_manage_profile(p_player_profile_id, actor_user_id)
      or public.coachr_can_read_session(session.id, actor_user_id)
    )
  order by next_occurrence.start_time nulls last, session.name;
end;
$$;

create or replace function public.coachr_session_diagnostics(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if actor_user_id is null or not public.coachr_can_manage_session(p_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'sessionId', session.id,
    'sessionType', session.session_type,
    'organisationId', session.venue_id,
    'primaryCoachId', session.primary_coach_id,
    'participantCount', (select count(*) from public.coach_session_participants participant where participant.session_id = session.id and participant.status = 'active'),
    'occurrenceCount', (select count(*) from public.coach_session_occurrences occurrence where occurrence.session_id = session.id),
    'linkedCourtCount', (select count(*) from public.coach_session_courts court where court.session_id = session.id),
    'confirmedBookingCount', (
      select count(*) from public.court_bookings booking
      join public.coach_session_occurrences occurrence on occurrence.id = booking.coach_session_occurrence_id
      where occurrence.session_id = session.id and booking.status = 'confirmed'
    ),
    'publicAcademyEligible', exists (
      select 1 from public.coach_session_participants participant
      join public.organisation_player_links link
        on link.player_profile_id = participant.player_profile_id
       and link.venue_id = session.venue_id
       and link.status = 'active'
      where participant.session_id = session.id
    ),
    'privateAccess', public.coachr_can_read_session(session.id, actor_user_id)
  ) into result
  from public.coach_sessions session where session.id = p_session_id;
  return result;
end;
$$;

revoke all on function public.coachr_can_manage_session(uuid, uuid) from public;
revoke all on function public.coachr_can_read_session(uuid, uuid) from public;
revoke all on function public.coachr_generate_session_occurrences(uuid, date, boolean) from public;
revoke all on function public.coachr_create_session(uuid, text, text, text, uuid, uuid[], uuid[], integer, uuid[], text, uuid, text, text, timestamptz, timestamptz, date, text, date, integer, integer, time, time, text) from public;
revoke all on function public.coachr_cancel_session_occurrence(uuid, text, date, text) from public;
revoke all on function public.coachr_move_session_occurrence(uuid, timestamptz, timestamptz, uuid[]) from public;
revoke all on function public.coachr_mark_session_attendance(uuid, uuid, text, text) from public;
revoke all on function public.coachr_mark_all_session_attendance(uuid, text) from public;
revoke all on function public.coachr_update_session_participant(uuid, uuid, text, date) from public;
revoke all on function public.coachr_top_up_sessions(uuid, date) from public;
revoke all on function public.coachr_public_academy_affiliations(uuid) from public;
revoke all on function public.coachr_private_player_sessions(uuid) from public;
revoke all on function public.coachr_session_diagnostics(uuid) from public;

grant execute on function public.coachr_create_session(uuid, text, text, text, uuid, uuid[], uuid[], integer, uuid[], text, uuid, text, text, timestamptz, timestamptz, date, text, date, integer, integer, time, time, text) to authenticated;
grant execute on function public.coachr_can_read_session(uuid, uuid) to authenticated;
grant execute on function public.coachr_cancel_session_occurrence(uuid, text, date, text) to authenticated;
grant execute on function public.coachr_move_session_occurrence(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.coachr_mark_session_attendance(uuid, uuid, text, text) to authenticated;
grant execute on function public.coachr_mark_all_session_attendance(uuid, text) to authenticated;
grant execute on function public.coachr_update_session_participant(uuid, uuid, text, date) to authenticated;
grant execute on function public.coachr_top_up_sessions(uuid, date) to authenticated;
grant execute on function public.coachr_public_academy_affiliations(uuid) to anon, authenticated;
grant execute on function public.coachr_private_player_sessions(uuid) to authenticated;
grant execute on function public.coachr_session_diagnostics(uuid) to authenticated;
