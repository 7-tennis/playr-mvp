-- Phase 1.10: one occupancy source for managed courts and bounded, open-ended
-- recurring lesson series. A confirmed managed lesson cannot commit without a
-- matching confirmed court_bookings row.

alter table public.court_bookings
  add column if not exists coach_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists source_product text;

update public.court_bookings booking
set coach_profile_id = lesson.coach_id,
    source_product = 'coachr',
    booking_purpose = coalesce(booking.booking_purpose, 'coaching_lesson'),
    booking_organisation_id = coalesce(booking.booking_organisation_id, lesson.venue_id),
    owner_organisation_id = coalesce(booking.owner_organisation_id, court.venue_id),
    coach_lesson_id = coalesce(booking.coach_lesson_id, lesson.id)
from public.coach_lessons lesson
join public.courts court on court.id = lesson.court_id
where lesson.court_booking_id = booking.id;

drop index if exists public.court_bookings_confirmed_lesson_unique;

with ranked as (
  select
    booking.id,
    row_number() over (
      partition by booking.coach_lesson_id
      order by (booking.status = 'confirmed') desc, booking.updated_at desc, booking.id
    ) as position
  from public.court_bookings booking
  where booking.coach_lesson_id is not null
)
update public.court_bookings booking
set coach_lesson_id = null
from ranked
where ranked.id = booking.id
  and ranked.position > 1;

create unique index if not exists court_bookings_lesson_unique
on public.court_bookings(coach_lesson_id)
where coach_lesson_id is not null;

create index if not exists court_bookings_coach_start_idx
on public.court_bookings(coach_profile_id, start_time)
where coach_profile_id is not null;

alter table public.court_bookings
  drop constraint if exists court_bookings_source_product_valid;

alter table public.court_bookings
  add constraint court_bookings_source_product_valid
  check (source_product is null or source_product in ('playr', 'coachr', 'clubr', 'eventr'));

create table if not exists public.coach_lesson_series (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  coach_id uuid not null references public.profiles(id) on delete restrict,
  player_id uuid not null references public.profiles(id) on delete restrict,
  junior_profile_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.profiles(id) on delete set null,
  lesson_type public.coach_lesson_type not null default 'private',
  title text not null default 'Coaching lesson',
  frequency text not null default 'weekly',
  weekday smallint not null,
  start_local_time time not null,
  duration_minutes integer not null,
  start_date date not null,
  end_mode text not null default 'until_cancelled',
  end_date date,
  occurrence_count integer,
  generated_through date,
  generated_occurrence_count integer not null default 0,
  status text not null default 'active',
  location_type text not null default 'managed_court',
  court_id uuid references public.courts(id) on delete restrict,
  external_venue_id uuid references public.organisation_external_venues(id) on delete set null,
  custom_location text,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  ended_by_user_id uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_lesson_series_title_not_blank check (length(btrim(title)) > 0),
  constraint coach_lesson_series_frequency_valid check (frequency = 'weekly'),
  constraint coach_lesson_series_weekday_valid check (weekday between 1 and 7),
  constraint coach_lesson_series_duration_valid check (duration_minutes between 5 and 480),
  constraint coach_lesson_series_status_valid check (status in ('active', 'ended', 'cancelled')),
  constraint coach_lesson_series_end_valid check (
    (end_mode = 'until_cancelled' and end_date is null and occurrence_count is null)
    or (end_mode = 'until_date' and end_date is not null and end_date >= start_date and occurrence_count is null)
    or (end_mode = 'occurrence_count' and end_date is null and occurrence_count between 1 and 104)
  ),
  constraint coach_lesson_series_location_valid check (
    (location_type = 'managed_court' and court_id is not null and external_venue_id is null and custom_location is null)
    or (location_type = 'custom' and court_id is null and length(btrim(coalesce(custom_location, ''))) > 0)
    or (location_type = 'none' and court_id is null and external_venue_id is null and custom_location is null)
  )
);

create table if not exists public.coach_lesson_series_exceptions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.coach_lesson_series(id) on delete cascade,
  occurrence_date date not null,
  lesson_id uuid references public.coach_lessons(id) on delete set null,
  status text not null,
  reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_lesson_series_exceptions_status_valid check (status in ('conflict', 'cancelled', 'edited')),
  constraint coach_lesson_series_exceptions_unique unique (series_id, occurrence_date)
);

create index if not exists coach_lesson_series_venue_status_idx
on public.coach_lesson_series(venue_id, status, generated_through);

create index if not exists coach_lesson_series_coach_status_idx
on public.coach_lesson_series(coach_id, status, start_date);

create index if not exists coach_lesson_series_player_idx
on public.coach_lesson_series(player_id, start_date desc);

create index if not exists coach_lesson_series_exceptions_series_idx
on public.coach_lesson_series_exceptions(series_id, occurrence_date);

drop trigger if exists coach_lesson_series_set_updated_at on public.coach_lesson_series;
create trigger coach_lesson_series_set_updated_at
before update on public.coach_lesson_series
for each row execute function public.set_updated_at();

drop trigger if exists coach_lesson_series_exceptions_set_updated_at on public.coach_lesson_series_exceptions;
create trigger coach_lesson_series_exceptions_set_updated_at
before update on public.coach_lesson_series_exceptions
for each row execute function public.set_updated_at();

with grouped as (
  select
    lesson.recurring_group_id as id,
    min((lesson.start_time at time zone 'Africa/Johannesburg')::date) as first_date,
    max((lesson.start_time at time zone 'Africa/Johannesburg')::date) as last_date,
    count(*)::integer as lesson_count,
    bool_or(lesson.status = 'scheduled' and lesson.start_time >= now()) as has_future,
    min(lesson.created_at) as first_created_at
  from public.coach_lessons lesson
  where lesson.recurring_group_id is not null
  group by lesson.recurring_group_id
), first_lesson as (
  select distinct on (lesson.recurring_group_id)
    lesson.*
  from public.coach_lessons lesson
  where lesson.recurring_group_id is not null
  order by lesson.recurring_group_id, lesson.start_time, lesson.id
)
insert into public.coach_lesson_series (
  id, venue_id, coach_id, player_id, junior_profile_id, parent_id, lesson_type, title,
  weekday, start_local_time, duration_minutes, start_date, end_mode, end_date,
  generated_through, generated_occurrence_count, status, location_type, court_id,
  external_venue_id, custom_location, notes, created_by_user_id, updated_by_user_id,
  created_at, updated_at
)
select
  grouped.id,
  lesson.venue_id,
  lesson.coach_id,
  lesson.player_id,
  lesson.junior_profile_id,
  lesson.parent_id,
  lesson.lesson_type,
  lesson.title,
  extract(isodow from lesson.start_time at time zone 'Africa/Johannesburg')::smallint,
  (lesson.start_time at time zone 'Africa/Johannesburg')::time,
  greatest(5, least(480, round(extract(epoch from (lesson.end_time - lesson.start_time)) / 60)::integer)),
  grouped.first_date,
  'until_date',
  grouped.last_date,
  grouped.last_date,
  grouped.lesson_count,
  case when grouped.has_future then 'active' else 'ended' end,
  lesson.location_type,
  lesson.court_id,
  lesson.external_venue_id,
  lesson.custom_location,
  lesson.notes,
  coalesce(lesson.created_by_user_id, lesson.updated_by_user_id),
  lesson.updated_by_user_id,
  grouped.first_created_at,
  greatest(lesson.updated_at, grouped.first_created_at)
from grouped
join first_lesson lesson on lesson.recurring_group_id = grouped.id
on conflict (id) do nothing;

alter table public.coach_lessons
  add column if not exists recurrence_date date;

update public.coach_lessons
set recurrence_date = (start_time at time zone 'Africa/Johannesburg')::date
where recurring_group_id is not null
  and recurrence_date is null;

with duplicate_dates as (
  select
    lesson.id,
    row_number() over (
      partition by lesson.recurring_group_id, lesson.recurrence_date
      order by lesson.start_time, lesson.created_at, lesson.id
    ) as position
  from public.coach_lessons lesson
  where lesson.recurring_group_id is not null
    and lesson.recurrence_date is not null
)
update public.coach_lessons lesson
set recurrence_date = null
from duplicate_dates duplicate
where duplicate.id = lesson.id
  and duplicate.position > 1;

create unique index if not exists coach_lessons_series_occurrence_unique
on public.coach_lessons(recurring_group_id, recurrence_date)
where recurring_group_id is not null and recurrence_date is not null;

alter table public.coach_lessons
  drop constraint if exists coach_lessons_recurring_series_fk;

alter table public.coach_lessons
  add constraint coach_lessons_recurring_series_fk
  foreign key (recurring_group_id)
  references public.coach_lesson_series(id)
  on delete restrict
  not valid;

alter table public.coach_lessons validate constraint coach_lessons_recurring_series_fk;

alter table public.coach_lesson_series enable row level security;
alter table public.coach_lesson_series_exceptions enable row level security;

grant select on public.coach_lesson_series to authenticated;
grant select on public.coach_lesson_series_exceptions to authenticated;

create or replace function public.coachr_can_manage_lesson_series(
  p_series_id uuid,
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
      from public.coach_lesson_series series
      where series.id = p_series_id
        and (
          public.coach_can_manage_own_lesson(series.coach_id, series.venue_id, p_user_id)
          or public.can_manage_venue(series.venue_id, p_user_id)
        )
    );
$$;

create or replace function public.coachr_can_read_lesson_series(
  p_series_id uuid,
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
      from public.coach_lesson_series series
      where series.id = p_series_id
        and (
          public.coach_can_manage_own_lesson(series.coach_id, series.venue_id, p_user_id)
          or public.can_manage_venue(series.venue_id, p_user_id)
          or public.can_manage_profile(series.player_id)
        )
    );
$$;

drop policy if exists "Permitted users can read lesson series" on public.coach_lesson_series;
create policy "Permitted users can read lesson series"
on public.coach_lesson_series
for select
to authenticated
using (public.coachr_can_read_lesson_series(id));

drop policy if exists "Permitted users can read lesson series exceptions" on public.coach_lesson_series_exceptions;
create policy "Permitted users can read lesson series exceptions"
on public.coach_lesson_series_exceptions
for select
to authenticated
using (public.coachr_can_read_lesson_series(series_id));

create or replace function public.coachr_prevent_coach_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('cancelled', 'rain', 'sick') then
    perform pg_advisory_xact_lock(hashtextextended('coach:' || new.coach_id::text, 0));

    if exists (
      select 1
      from public.coach_lessons lesson
      where lesson.coach_id = new.coach_id
        and lesson.id <> new.id
        and lesson.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(new.start_time, new.end_time, '[)')
    ) then
      raise exception 'coach_conflict' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists coach_lessons_prevent_coach_overlap on public.coach_lessons;
create trigger coach_lessons_prevent_coach_overlap
before insert or update of coach_id, start_time, end_time, status on public.coach_lessons
for each row execute function public.coachr_prevent_coach_overlap();

create or replace function public.coachr_validate_managed_lesson_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lesson public.coach_lessons%rowtype;
  target_lesson_id uuid;
  target_booking_id uuid;
begin
  if tg_table_name = 'coach_lessons' then
    target_lesson_id := case when tg_op = 'DELETE' then old.id else new.id end;
    select * into target_lesson
    from public.coach_lessons
    where id = target_lesson_id;
  else
    if tg_op = 'DELETE' then
      target_lesson_id := old.coach_lesson_id;
      target_booking_id := old.id;
    elsif tg_op = 'INSERT' then
      target_lesson_id := new.coach_lesson_id;
      target_booking_id := new.id;
    else
      target_lesson_id := coalesce(new.coach_lesson_id, old.coach_lesson_id);
      target_booking_id := new.id;
    end if;

    select lesson.* into target_lesson
    from public.coach_lessons lesson
    where lesson.id = target_lesson_id
       or lesson.court_booking_id = target_booking_id
    order by (lesson.court_booking_id = target_booking_id) desc
    limit 1;
  end if;

  if target_lesson.id is not null
    and target_lesson.status = 'scheduled'
    and target_lesson.location_type = 'managed_court'
    and not exists (
      select 1
      from public.court_bookings booking
      join public.courts court on court.id = booking.court_id
      where booking.id = target_lesson.court_booking_id
        and booking.coach_lesson_id = target_lesson.id
        and booking.status = 'confirmed'
        and booking.booking_type = 'lesson'
        and booking.booking_purpose = 'coaching_lesson'
        and booking.source_product = 'coachr'
        and booking.court_id = target_lesson.court_id
        and booking.coach_profile_id = target_lesson.coach_id
        and booking.start_time = target_lesson.start_time
        and booking.end_time = target_lesson.end_time
        and booking.booking_organisation_id = target_lesson.venue_id
        and booking.owner_organisation_id = court.venue_id
    ) then
      raise exception 'managed_lesson_booking_required' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_lessons_validate_managed_reservation on public.coach_lessons;
create constraint trigger coach_lessons_validate_managed_reservation
after insert or update of court_id, court_booking_id, coach_id, start_time, end_time, status, location_type on public.coach_lessons
deferrable initially deferred
for each row execute function public.coachr_validate_managed_lesson_reservation();

drop trigger if exists court_bookings_validate_managed_lesson on public.court_bookings;
create constraint trigger court_bookings_validate_managed_lesson
after insert or update or delete on public.court_bookings
deferrable initially deferred
for each row execute function public.coachr_validate_managed_lesson_reservation();

-- Repair safe legacy gaps before the deferred invariant applies to future writes.
do $$
declare
  lesson record;
  new_booking_id uuid;
  booking_user_id uuid;
begin
  for lesson in
    select
      item.*,
      court.venue_id as owner_venue_id,
      coach.user_id as coach_user_id
    from public.coach_lessons item
    join public.courts court on court.id = item.court_id and court.status = 'active'
    left join public.profiles coach on coach.id = item.coach_id
    left join public.court_bookings linked on linked.id = item.court_booking_id and linked.status = 'confirmed'
    where item.status = 'scheduled'
      and item.location_type = 'managed_court'
      and item.end_time > now()
      and linked.id is null
    order by item.start_time
  loop
    booking_user_id := coalesce(lesson.created_by_user_id, lesson.updated_by_user_id, lesson.coach_user_id);

    if booking_user_id is not null and not exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = lesson.court_id
        and booking.status = 'confirmed'
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(lesson.start_time, lesson.end_time, '[)')
    ) then
      insert into public.court_bookings (
        court_id, booked_by_user_id, player_profile_id, coach_profile_id,
        start_time, end_time, status, booking_type, is_public, notes,
        booking_organisation_id, owner_organisation_id, coach_lesson_id,
        booking_purpose, source_product
      ) values (
        lesson.court_id, booking_user_id, lesson.player_id, lesson.coach_id,
        lesson.start_time, lesson.end_time, 'confirmed', 'lesson', false,
        'Coach Lesson: repaired managed-court reservation', lesson.venue_id,
        lesson.owner_venue_id, lesson.id, 'coaching_lesson', 'coachr'
      ) returning id into new_booking_id;

      update public.coach_lessons
      set court_booking_id = new_booking_id
      where id = lesson.id;
    end if;
  end loop;
end;
$$;

create or replace function public.coachr_generate_series_occurrences(
  p_series_id uuid,
  p_through_date date default null,
  p_strict boolean default false
)
returns table(generated_count integer, conflict_dates date[], generation_boundary date)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  series public.coach_lesson_series%rowtype;
  candidate_dates date[];
  conflict_messages text[] := array[]::text[];
  conflicts date[] := array[]::date[];
  occurrence_day date;
  occurrence_start timestamptz;
  occurrence_end timestamptz;
  scan_start date;
  boundary date;
  remaining_count integer;
  new_lesson_id uuid;
  new_booking_id uuid;
  created_count integer := 0;
  conflict_reason text;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select * into series
  from public.coach_lesson_series
  where id = p_series_id
  for update;

  if series.id is null then
    raise exception 'invalid_series' using errcode = 'P0001';
  end if;

  if not public.coachr_can_manage_lesson_series(series.id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if series.status <> 'active' then
    return query select 0, array[]::date[], series.generated_through;
    return;
  end if;

  boundary := least(
    coalesce(p_through_date, greatest(current_date, series.start_date) + 83),
    greatest(current_date, series.start_date) + 83
  );

  if series.end_mode = 'until_date' then
    boundary := least(boundary, series.end_date);
  end if;

  scan_start := greatest(series.start_date, coalesce(series.generated_through + 1, series.start_date));

  if boundary < scan_start then
    return query select 0, array[]::date[], boundary;
    return;
  end if;

  remaining_count := case
    when series.end_mode = 'occurrence_count'
      then greatest(series.occurrence_count - series.generated_occurrence_count, 0)
    else null
  end;

  if series.end_mode = 'occurrence_count' and remaining_count = 0 then
    update public.coach_lesson_series target
    set status = 'ended',
        ended_at = coalesce(target.ended_at, now()),
        ended_by_user_id = coalesce(target.ended_by_user_id, actor_user_id)
    where target.id = series.id
      and not exists (
        select 1
        from public.coach_lessons lesson
        where lesson.recurring_group_id = target.id
          and lesson.end_time >= now()
      );
    return query select 0, array[]::date[], series.generated_through;
    return;
  end if;

  select array_agg(candidate.occurrence_day order by candidate.occurrence_day)
  into candidate_dates
  from (
    select day_value::date as occurrence_day
    from generate_series(scan_start, boundary, interval '1 day') day_value
    where extract(isodow from day_value)::integer = series.weekday
      and not exists (
        select 1
        from public.coach_lessons lesson
        where lesson.recurring_group_id = series.id
          and lesson.recurrence_date = day_value::date
      )
      and not exists (
        select 1
        from public.coach_lesson_series_exceptions exception
        where exception.series_id = series.id
          and exception.occurrence_date = day_value::date
      )
    order by day_value
    limit case when remaining_count is null then 2147483647 else remaining_count end
  ) candidate;

  if candidate_dates is null then
    update public.coach_lesson_series
    set generated_through = greatest(coalesce(generated_through, boundary), boundary)
    where id = series.id;
    return query select 0, array[]::date[], boundary;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coach:' || series.coach_id::text, 0));
  if series.location_type = 'managed_court' then
    if not public.coachr_court_is_authorised(series.venue_id, series.court_id, actor_user_id) then
      raise exception 'court_access' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('court:' || series.court_id::text, 0));
  end if;

  foreach occurrence_day in array candidate_dates loop
    occurrence_start := public.coachr_local_datetime(occurrence_day, series.start_local_time);
    occurrence_end := occurrence_start + make_interval(mins => series.duration_minutes);
    conflict_reason := null;

    if series.location_type = 'managed_court' and exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = series.court_id
        and booking.status = 'confirmed'
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
    ) then
      conflict_reason := 'Court is already booked.';
    elsif exists (
      select 1
      from public.coach_lessons lesson
      where lesson.coach_id = series.coach_id
        and lesson.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(occurrence_start, occurrence_end, '[)')
    ) then
      conflict_reason := 'Coach already has another lesson.';
    end if;

    if conflict_reason is not null then
      conflicts := array_append(conflicts, occurrence_day);
      conflict_messages := array_append(conflict_messages, to_char(occurrence_day, 'Dy DD Mon YYYY') || ': ' || conflict_reason);
    end if;
  end loop;

  if p_strict and array_length(conflict_messages, 1) is not null then
    raise exception 'recurrence_conflicts:%', array_to_string(conflict_messages, '; ') using errcode = 'P0001';
  end if;

  foreach occurrence_day in array candidate_dates loop
    occurrence_start := public.coachr_local_datetime(occurrence_day, series.start_local_time);
    occurrence_end := occurrence_start + make_interval(mins => series.duration_minutes);

    if occurrence_day = any(conflicts) then
      insert into public.coach_lesson_series_exceptions (
        series_id, occurrence_date, status, reason, created_by_user_id
      ) values (
        series.id, occurrence_day, 'conflict', conflict_messages[array_position(conflicts, occurrence_day)], actor_user_id
      )
      on conflict (series_id, occurrence_date) do update
      set status = excluded.status,
          reason = excluded.reason,
          created_by_user_id = excluded.created_by_user_id,
          updated_at = now();
      continue;
    end if;

    begin
      insert into public.coach_lessons (
        venue_id, coach_id, player_id, junior_profile_id, parent_id,
        court_id, court_booking_id, location_type, custom_location, external_venue_id,
        lesson_type, title, start_time, end_time, repeat_rule, recurring_group_id,
        recurrence_date, status, attendance_status, feedback_status, notes,
        created_by_user_id, updated_by_user_id
      ) values (
        series.venue_id, series.coach_id, series.player_id, series.junior_profile_id, series.parent_id,
        case when series.location_type = 'managed_court' then series.court_id else null end,
        null, series.location_type, series.custom_location, series.external_venue_id,
        series.lesson_type, series.title, occurrence_start, occurrence_end,
        concat(
          'weekly;start=', series.start_date::text,
          ';end_mode=', series.end_mode,
          ';end=', coalesce(series.end_date::text, ''),
          ';count=', coalesce(series.occurrence_count::text, ''),
          ';dow=', series.weekday::text,
          ';start_time=', series.start_local_time::text,
          ';duration=', series.duration_minutes::text
        ),
        series.id, occurrence_day, 'scheduled', 'not_marked', 'not_started', series.notes,
        actor_user_id, actor_user_id
      ) returning id into new_lesson_id;

      new_booking_id := null;
      if series.location_type = 'managed_court' then
        insert into public.court_bookings (
          court_id, booked_by_user_id, player_profile_id, coach_profile_id,
          start_time, end_time, status, booking_type, is_public, notes,
          booking_organisation_id, owner_organisation_id, coach_lesson_id,
          booking_purpose, source_product
        )
        select
          series.court_id, actor_user_id, series.player_id, series.coach_id,
          occurrence_start, occurrence_end, 'confirmed', 'lesson', false,
          'Coach Lesson: ' || series.title, series.venue_id, court.venue_id,
          new_lesson_id, 'coaching_lesson', 'coachr'
        from public.courts court
        where court.id = series.court_id
          and court.status = 'active'
        returning id into new_booking_id;

        if new_booking_id is null then
          raise exception 'court_access' using errcode = 'P0001';
        end if;

        update public.coach_lessons
        set court_booking_id = new_booking_id
        where id = new_lesson_id;
      end if;

      created_count := created_count + 1;
    exception
      when exclusion_violation then
        if p_strict then
          raise exception 'recurrence_conflicts:%: Court is already booked.', to_char(occurrence_day, 'Dy DD Mon YYYY') using errcode = 'P0001';
        end if;
        insert into public.coach_lesson_series_exceptions (
          series_id, occurrence_date, status, reason, created_by_user_id
        ) values (
          series.id, occurrence_day, 'conflict', 'Court is already booked.', actor_user_id
        )
        on conflict (series_id, occurrence_date) do update
        set status = excluded.status, reason = excluded.reason, updated_at = now();
        conflicts := array_append(conflicts, occurrence_day);
    end;
  end loop;

  update public.coach_lesson_series target
  set generated_through = greatest(coalesce(target.generated_through, boundary), boundary),
      generated_occurrence_count = (
        select count(*)::integer
        from public.coach_lessons lesson
        where lesson.recurring_group_id = target.id
      ),
      status = case
        when target.end_mode = 'occurrence_count'
          and (select count(*) from public.coach_lessons lesson where lesson.recurring_group_id = target.id) >= target.occurrence_count
          and not exists (select 1 from public.coach_lessons lesson where lesson.recurring_group_id = target.id and lesson.end_time >= now())
          then 'ended'
        when target.end_mode = 'until_date' and target.end_date < current_date then 'ended'
        else target.status
      end,
      ended_at = case
        when (target.end_mode = 'occurrence_count'
          and (select count(*) from public.coach_lessons lesson where lesson.recurring_group_id = target.id) >= target.occurrence_count
          and not exists (select 1 from public.coach_lessons lesson where lesson.recurring_group_id = target.id and lesson.end_time >= now()))
          or (target.end_mode = 'until_date' and target.end_date < current_date)
          then coalesce(target.ended_at, now())
        else target.ended_at
      end
  where target.id = series.id;

  return query select created_count, coalesce(conflicts, array[]::date[]), boundary;
end;
$$;

create or replace function public.coachr_create_lesson_plan_v2(
  p_venue_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
  p_external_venue_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
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
  selected_player record;
  new_series_id uuid;
  new_plan_id uuid;
  duration integer;
  generation record;
  first_lesson_id uuid;
  recipient_user_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_repeat_mode = 'none' then
    new_plan_id := public.coachr_create_lesson_plan_with_location(
      p_venue_id, p_coach_id, p_player_id, p_court_id, p_location_type,
      p_custom_location, p_external_venue_id, p_lesson_type, p_title,
      p_repeat_mode, p_start_time, p_end_time, null, null, null, null, null, p_notes
    );

    update public.court_bookings booking
    set coach_profile_id = lesson.coach_id,
        source_product = 'coachr',
        booking_purpose = 'coaching_lesson',
        coach_lesson_id = lesson.id
    from public.coach_lessons lesson
    where lesson.id = new_plan_id
      and lesson.court_booking_id = booking.id;

    return new_plan_id;
  end if;

  if p_repeat_mode <> 'weekly'
    or p_venue_id is null
    or p_coach_id is null
    or p_player_id is null
    or p_recurrence_start_date is null
    or p_recurrence_end_mode is null
    or p_recurrence_end_mode not in ('until_cancelled', 'until_date', 'occurrence_count')
    or p_day_of_week not between 1 and 7
    or p_recurrence_start_time is null
    or p_recurrence_end_time is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if p_recurrence_end_time <= p_recurrence_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  if (p_recurrence_end_mode = 'until_date' and (p_recurrence_end_date is null or p_recurrence_end_date < p_recurrence_start_date))
    or (p_recurrence_end_mode = 'occurrence_count' and (p_recurrence_occurrence_count is null or p_recurrence_occurrence_count not between 1 and 104)) then
    raise exception 'recurrence_range' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(p_coach_id, p_venue_id, actor_user_id)
    or (
      public.can_manage_venue(p_venue_id, actor_user_id)
      and public.coach_profile_can_teach_at_venue(p_coach_id, p_venue_id, actor_user_id)
    )
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select profile.id, profile.is_junior, profile.parent_profile_id
  into selected_player
  from public.profiles profile
  where profile.id = p_player_id;

  if selected_player.id is null
    or not public.user_can_read_organisation_player_link(p_venue_id, p_player_id, selected_player.parent_profile_id, actor_user_id) then
    raise exception 'invalid_student' using errcode = 'P0001';
  end if;

  if p_location_type = 'managed_court' then
    if p_court_id is null or not public.coachr_court_is_authorised(p_venue_id, p_court_id, actor_user_id) then
      raise exception 'court_access' using errcode = 'P0001';
    end if;
  elsif p_location_type = 'custom' then
    if length(btrim(coalesce(p_custom_location, ''))) = 0 then
      raise exception 'custom_location' using errcode = 'P0001';
    end if;
    if p_external_venue_id is not null and not exists (
      select 1
      from public.organisation_external_venues external
      where external.id = p_external_venue_id
        and external.organisation_id = p_venue_id
        and external.status = 'active'
    ) then
      raise exception 'external_venue' using errcode = 'P0001';
    end if;
  elsif p_location_type <> 'none' then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  duration := round(extract(epoch from (p_recurrence_end_time - p_recurrence_start_time)) / 60)::integer;

  insert into public.coach_lesson_series (
    venue_id, coach_id, player_id, junior_profile_id, parent_id,
    lesson_type, title, weekday, start_local_time, duration_minutes,
    start_date, end_mode, end_date, occurrence_count, location_type,
    court_id, external_venue_id, custom_location, notes,
    created_by_user_id, updated_by_user_id
  ) values (
    p_venue_id, p_coach_id, p_player_id,
    case when selected_player.is_junior then p_player_id else null end,
    selected_player.parent_profile_id,
    coalesce(p_lesson_type, 'private'::public.coach_lesson_type),
    coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'),
    p_day_of_week, p_recurrence_start_time, duration, p_recurrence_start_date,
    p_recurrence_end_mode,
    case when p_recurrence_end_mode = 'until_date' then p_recurrence_end_date else null end,
    case when p_recurrence_end_mode = 'occurrence_count' then p_recurrence_occurrence_count else null end,
    p_location_type,
    case when p_location_type = 'managed_court' then p_court_id else null end,
    case when p_location_type = 'custom' then p_external_venue_id else null end,
    case when p_location_type = 'custom' then btrim(p_custom_location) else null end,
    p_notes, actor_user_id, actor_user_id
  ) returning id into new_series_id;

  select * into generation
  from public.coachr_generate_series_occurrences(
    new_series_id,
    p_recurrence_start_date + 83,
    true
  );

  if coalesce(generation.generated_count, 0) = 0 then
    raise exception 'recurrence_range' using errcode = 'P0001';
  end if;

  select lesson.id into first_lesson_id
  from public.coach_lessons lesson
  where lesson.recurring_group_id = new_series_id
  order by lesson.start_time
  limit 1;

  recipient_user_id := public.notification_profile_owner(p_player_id);
  perform public.create_system_notification(
    target_user_id => recipient_user_id,
    notification_type => 'lesson_created',
    notification_title => 'Weekly lessons scheduled',
    notification_message => concat(coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'), ' has been added to the coaching schedule.'),
    notification_href => '/dashboard/players/' || p_player_id::text,
    notification_actor_user_id => actor_user_id,
    notification_profile_id => p_player_id,
    notification_junior_profile_id => case when selected_player.is_junior then p_player_id else null end,
    notification_metadata => jsonb_build_object('lessonId', first_lesson_id, 'seriesId', new_series_id, 'organisationId', p_venue_id),
    notification_dedupe_key => 'coach-series-created:' || new_series_id::text
  );

  return new_series_id;
exception
  when exclusion_violation then
    raise exception 'recurrence_conflicts:Court is already booked for one or more lessons.' using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_update_lesson_plan_v2(
  p_lesson_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
  p_external_venue_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status public.coach_lesson_status,
  p_scope text default 'single',
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_lesson public.coach_lessons%rowtype;
  affected_ids uuid[];
  new_duration integer;
begin
  select * into target_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if actor_user_id is null or target_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_coach_id is null
    or not public.coach_profile_can_teach_at_venue(p_coach_id, target_lesson.venue_id, actor_user_id) then
    raise exception 'coach_venue' using errcode = 'P0001';
  end if;

  if p_scope = 'single' or target_lesson.recurring_group_id is null then
    affected_ids := array[target_lesson.id];
  else
    select coalesce(array_agg(lesson.id), array[]::uuid[])
    into affected_ids
    from public.coach_lessons lesson
    where lesson.recurring_group_id = target_lesson.recurring_group_id
      and lesson.status = 'scheduled'
      and not exists (
        select 1 from public.coach_lesson_attendance attendance where attendance.lesson_id = lesson.id
      )
      and (p_scope = 'series' or lesson.start_time >= target_lesson.start_time);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('coach:' || p_coach_id::text, 0));

  if p_coach_id <> target_lesson.coach_id and exists (
    select 1
    from public.coach_lessons lesson
    where lesson.coach_id = p_coach_id
      and not (lesson.id = any(affected_ids))
      and lesson.status not in ('cancelled', 'rain', 'sick')
      and exists (
        select 1
        from public.coach_lessons affected
        where affected.id = any(affected_ids)
          and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(
            case when array_length(affected_ids, 1) = 1 then p_start_time else public.coachr_local_datetime(affected.recurrence_date, (p_start_time at time zone 'Africa/Johannesburg')::time) end,
            case when array_length(affected_ids, 1) = 1 then p_end_time else public.coachr_local_datetime(affected.recurrence_date, (p_end_time at time zone 'Africa/Johannesburg')::time) end,
            '[)'
          )
      )
  ) then
    raise exception 'coach_conflict' using errcode = 'P0001';
  end if;

  perform public.coachr_update_lesson_plan_with_location(
    p_lesson_id, p_player_id, p_court_id, p_location_type, p_custom_location,
    p_external_venue_id, p_lesson_type, p_title, p_start_time, p_end_time,
    p_status, p_scope, p_notes
  );

  update public.coach_lessons
  set coach_id = p_coach_id,
      updated_by_user_id = actor_user_id
  where id = any(affected_ids);

  update public.court_bookings booking
  set coach_profile_id = p_coach_id,
      source_product = 'coachr',
      booking_purpose = 'coaching_lesson'
  from public.coach_lessons lesson
  where lesson.id = any(affected_ids)
    and lesson.court_booking_id = booking.id;

  if target_lesson.recurring_group_id is not null and p_scope <> 'single' then
    new_duration := round(extract(epoch from (p_end_time - p_start_time)) / 60)::integer;
    update public.coach_lesson_series
    set coach_id = p_coach_id,
        player_id = p_player_id,
        junior_profile_id = (select case when profile.is_junior then profile.id else null end from public.profiles profile where profile.id = p_player_id),
        parent_id = (select profile.parent_profile_id from public.profiles profile where profile.id = p_player_id),
        lesson_type = p_lesson_type,
        title = coalesce(nullif(btrim(p_title), ''), title),
        start_local_time = (p_start_time at time zone 'Africa/Johannesburg')::time,
        duration_minutes = new_duration,
        location_type = p_location_type,
        court_id = case when p_location_type = 'managed_court' then p_court_id else null end,
        external_venue_id = case when p_location_type = 'custom' then p_external_venue_id else null end,
        custom_location = case when p_location_type = 'custom' then btrim(p_custom_location) else null end,
        notes = p_notes,
        updated_by_user_id = actor_user_id
    where id = target_lesson.recurring_group_id;
  end if;
end;
$$;

create or replace function public.coachr_cancel_lesson_plan_v2(
  p_lesson_id uuid,
  p_cancel_status public.coach_lesson_status default 'cancelled'::public.coach_lesson_status,
  p_scope text default 'single',
  p_effective_end_date date default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_lesson public.coach_lessons%rowtype;
  effective_end date;
  affected_ids uuid[];
  recipient_user_id uuid;
begin
  select * into target_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if actor_user_id is null or target_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_scope = 'single' or target_lesson.recurring_group_id is null then
    perform public.coachr_cancel_lesson_series_with_booking(p_lesson_id, p_cancel_status, 'single', p_notes);
    return;
  end if;

  if p_scope not in ('future', 'series') then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if p_cancel_status <> 'cancelled' then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  effective_end := coalesce(
    p_effective_end_date,
    case
      when p_scope = 'series' then (select start_date - 1 from public.coach_lesson_series where id = target_lesson.recurring_group_id)
      else coalesce(target_lesson.recurrence_date, (target_lesson.start_time at time zone 'Africa/Johannesburg')::date) - 1
    end
  );

  select coalesce(array_agg(lesson.id), array[]::uuid[])
  into affected_ids
  from public.coach_lessons lesson
  where lesson.recurring_group_id = target_lesson.recurring_group_id
    and lesson.status = 'scheduled'
    and coalesce(lesson.recurrence_date, (lesson.start_time at time zone 'Africa/Johannesburg')::date) > effective_end
    and not exists (
      select 1 from public.coach_lesson_attendance attendance where attendance.lesson_id = lesson.id
    );

  update public.court_bookings booking
  set status = 'cancelled',
      cancelled_at = coalesce(booking.cancelled_at, now()),
      cancelled_by_user_id = actor_user_id
  from public.coach_lessons lesson
  where lesson.id = any(affected_ids)
    and lesson.court_booking_id = booking.id
    and booking.status = 'confirmed';

  update public.coach_lessons lesson
  set status = 'cancelled',
      notes = coalesce(p_notes, lesson.notes),
      cancelled_at = coalesce(lesson.cancelled_at, now()),
      cancelled_by_user_id = actor_user_id,
      updated_by_user_id = actor_user_id
  where lesson.id = any(affected_ids);

  update public.coach_lesson_series
  set end_mode = case when effective_end < start_date then 'until_cancelled' else 'until_date' end,
      end_date = case when effective_end < start_date then null else effective_end end,
      occurrence_count = null,
      status = case
        when effective_end < start_date then 'cancelled'
        when effective_end < current_date then 'ended'
        else 'active'
      end,
      ended_at = case when effective_end < current_date then coalesce(ended_at, now()) else null end,
      ended_by_user_id = case when effective_end < current_date then actor_user_id else null end,
      updated_by_user_id = actor_user_id
  where id = target_lesson.recurring_group_id;

  recipient_user_id := public.notification_profile_owner(target_lesson.player_id);
  perform public.create_system_notification(
    target_user_id => recipient_user_id,
    notification_type => 'lesson_cancelled',
    notification_title => 'Weekly lesson arrangement updated',
    notification_message => case
      when p_effective_end_date is null then 'This weekly lesson arrangement has ended and future lessons were cancelled.'
      else 'This weekly lesson arrangement will end after ' || to_char(effective_end, 'DD Mon YYYY') || '.'
    end,
    notification_href => '/dashboard/players/' || target_lesson.player_id::text,
    notification_actor_user_id => actor_user_id,
    notification_profile_id => target_lesson.player_id,
    notification_junior_profile_id => target_lesson.junior_profile_id,
    notification_metadata => jsonb_build_object(
      'lessonId', target_lesson.id,
      'seriesId', target_lesson.recurring_group_id,
      'organisationId', target_lesson.venue_id,
      'effectiveEndDate', effective_end
    ),
    notification_dedupe_key => 'coach-series-ended:' || target_lesson.recurring_group_id::text || ':' || effective_end::text
  );
end;
$$;

create or replace function public.coachr_top_up_lesson_series(
  p_organisation_id uuid,
  p_through_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  series_row record;
  generation record;
  generated_total integer := 0;
  conflicts jsonb := '[]'::jsonb;
begin
  if actor_user_id is null
    or p_organisation_id is null
    or not public.coachr_user_can_use_organisation(p_organisation_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  for series_row in
    select series.id
    from public.coach_lesson_series series
    where series.venue_id = p_organisation_id
      and series.status = 'active'
      and public.coachr_can_manage_lesson_series(series.id, actor_user_id)
    order by series.start_date, series.id
  loop
    select * into generation
    from public.coachr_generate_series_occurrences(series_row.id, p_through_date, false);
    generated_total := generated_total + coalesce(generation.generated_count, 0);
    if coalesce(array_length(generation.conflict_dates, 1), 0) > 0 then
      conflicts := conflicts || jsonb_build_object(
        'series_id', series_row.id,
        'dates', to_jsonb(generation.conflict_dates)
      );
    end if;
  end loop;

  return jsonb_build_object('generated', generated_total, 'conflicts', conflicts);
end;
$$;

create or replace function public.coachr_court_booking_blocks_for_range(
  check_start_time timestamptz,
  check_end_time timestamptz
)
returns table (
  court_id uuid,
  player_profile_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  booking_type public.court_booking_type,
  player_name text
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
    booking.booking_type,
    case when public.can_manage_profile(booking.player_profile_id) then concat_ws(' ', profile.first_name, profile.last_name) else null end
  from public.court_bookings booking
  left join public.profiles profile on profile.id = booking.player_profile_id
  where (select auth.uid()) is not null
    and check_end_time > check_start_time
    and booking.status = 'confirmed'
    and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(check_start_time, check_end_time, '[)')
  order by booking.start_time;
$$;

create or replace function public.coachr_lesson_reservation_diagnostics(p_lesson_id uuid)
returns table (
  lesson_id uuid,
  series_id uuid,
  selected_court_id uuid,
  linked_booking_id uuid,
  booking_status public.court_booking_status,
  booking_start timestamptz,
  booking_end timestamptz,
  owner_organisation_id uuid,
  booking_organisation_id uuid,
  player_availability_blocked boolean,
  reservation_valid boolean,
  recurrence_end_mode text,
  next_generation_boundary date
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.coach_lessons%rowtype;
begin
  select * into target
  from public.coach_lessons
  where id = p_lesson_id;

  if actor_user_id is null
    or target.id is null
    or not (
      public.can_manage_coach_lesson(target.id)
      or public.can_manage_profile(target.player_id)
      or public.user_is_platform_admin(actor_user_id)
    ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    target.id,
    target.recurring_group_id,
    target.court_id,
    booking.id,
    booking.status,
    booking.start_time,
    booking.end_time,
    booking.owner_organisation_id,
    booking.booking_organisation_id,
    exists (
      select 1
      from public.court_bookings occupied
      where occupied.court_id = target.court_id
        and occupied.status = 'confirmed'
        and tstzrange(occupied.start_time, occupied.end_time, '[)') && tstzrange(target.start_time, target.end_time, '[)')
    ),
    booking.id is not null
      and booking.status = 'confirmed'
      and booking.court_id = target.court_id
      and booking.start_time = target.start_time
      and booking.end_time = target.end_time
      and booking.coach_lesson_id = target.id
      and booking.booking_purpose = 'coaching_lesson'
      and booking.source_product = 'coachr',
    series.end_mode,
    case
      when series.id is null then null
      when series.end_mode = 'until_date' then least(current_date + 83, series.end_date)
      else current_date + 83
    end
  from (select 1) anchor
  left join public.court_bookings booking on booking.id = target.court_booking_id
  left join public.coach_lesson_series series on series.id = target.recurring_group_id;
end;
$$;

revoke all on function public.coachr_can_manage_lesson_series(uuid, uuid) from public;
revoke all on function public.coachr_can_read_lesson_series(uuid, uuid) from public;
revoke all on function public.coachr_prevent_coach_overlap() from public;
revoke all on function public.coachr_validate_managed_lesson_reservation() from public;
revoke all on function public.coachr_generate_series_occurrences(uuid, date, boolean) from public;
revoke all on function public.coachr_create_lesson_plan_v2(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, text, date, integer, integer, time, time, text) from public;
revoke all on function public.coachr_update_lesson_plan_v2(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) from public;
revoke all on function public.coachr_cancel_lesson_plan_v2(uuid, public.coach_lesson_status, text, date, text) from public;
revoke all on function public.coachr_top_up_lesson_series(uuid, date) from public;
revoke all on function public.coachr_court_booking_blocks_for_range(timestamptz, timestamptz) from public;
revoke all on function public.coachr_lesson_reservation_diagnostics(uuid) from public;

grant execute on function public.coachr_create_lesson_plan_v2(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, text, date, integer, integer, time, time, text) to authenticated;
grant execute on function public.coachr_update_lesson_plan_v2(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) to authenticated;
grant execute on function public.coachr_cancel_lesson_plan_v2(uuid, public.coach_lesson_status, text, date, text) to authenticated;
grant execute on function public.coachr_top_up_lesson_series(uuid, date) to authenticated;
grant execute on function public.coachr_court_booking_blocks_for_range(timestamptz, timestamptz) to authenticated;
grant execute on function public.coachr_lesson_reservation_diagnostics(uuid) to authenticated;
grant execute on function public.coachr_can_manage_lesson_series(uuid, uuid) to authenticated;
grant execute on function public.coachr_can_read_lesson_series(uuid, uuid) to authenticated;
