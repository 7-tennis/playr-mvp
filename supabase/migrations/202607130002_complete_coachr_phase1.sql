-- CoachR Integration Phase 1.
-- Extends the existing Foundation, court, booking, lesson and notification
-- models. No parallel resource or invitation systems are introduced.

create table if not exists public.organisation_court_access (
  id uuid primary key default gen_random_uuid(),
  owner_venue_id uuid not null references public.venues(id) on delete cascade,
  approved_venue_id uuid not null references public.venues(id) on delete cascade,
  court_id uuid references public.courts(id) on delete cascade,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  notes text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_court_access_different_organisations check (owner_venue_id <> approved_venue_id),
  constraint organisation_court_access_status_valid check (status in ('active', 'inactive', 'revoked')),
  constraint organisation_court_access_date_order check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint organisation_court_access_revoked_state check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

create index if not exists organisation_court_access_owner_idx
on public.organisation_court_access(owner_venue_id, status, valid_from, valid_until);

create index if not exists organisation_court_access_approved_idx
on public.organisation_court_access(approved_venue_id, status, valid_from, valid_until);

create index if not exists organisation_court_access_court_idx
on public.organisation_court_access(court_id)
where court_id is not null;

create unique index if not exists organisation_court_access_active_scope_unique
on public.organisation_court_access(owner_venue_id, approved_venue_id, coalesce(court_id, '00000000-0000-0000-0000-000000000000'::uuid))
where status = 'active';

alter table public.courts drop constraint if exists courts_name_key;
alter table public.courts add column if not exists operator_venue_id uuid references public.venues(id) on delete set null;
update public.courts set operator_venue_id = venue_id where operator_venue_id is null;
create index if not exists courts_operator_venue_idx on public.courts(operator_venue_id) where operator_venue_id is not null;
create unique index if not exists courts_venue_name_unique
on public.courts(venue_id, lower(name))
where venue_id is not null;

drop trigger if exists organisation_court_access_set_updated_at on public.organisation_court_access;
create trigger organisation_court_access_set_updated_at
before update on public.organisation_court_access
for each row execute function public.set_updated_at();

alter table public.court_bookings
  add column if not exists booking_organisation_id uuid references public.venues(id) on delete set null,
  add column if not exists owner_organisation_id uuid references public.venues(id) on delete set null,
  add column if not exists coach_lesson_id uuid references public.coach_lessons(id) on delete set null,
  add column if not exists booking_purpose text;

alter table public.coach_lessons
  add column if not exists location_type text not null default 'managed_court',
  add column if not exists custom_location text;

update public.coach_lessons
set location_type = case when court_id is null then 'none' else 'managed_court' end
where location_type is null
   or (location_type = 'managed_court' and court_id is null);

alter table public.coach_lessons
  drop constraint if exists coach_lessons_location_valid;

alter table public.coach_lessons
  add constraint coach_lessons_location_valid check (
    (location_type = 'managed_court' and court_id is not null and custom_location is null)
    or (location_type = 'custom' and court_id is null and length(btrim(coalesce(custom_location, ''))) > 0)
    or (location_type = 'none' and court_id is null and custom_location is null)
  );

update public.court_bookings booking
set booking_organisation_id = lesson.venue_id,
    owner_organisation_id = court.venue_id,
    coach_lesson_id = lesson.id,
    booking_purpose = 'coaching_lesson'
from public.coach_lessons lesson
join public.courts court on court.id = lesson.court_id
where lesson.court_booking_id = booking.id
  and (booking.booking_organisation_id is null or booking.owner_organisation_id is null or booking.coach_lesson_id is null);

create index if not exists court_bookings_booking_organisation_idx
on public.court_bookings(booking_organisation_id, status, start_time)
where booking_organisation_id is not null;

create index if not exists court_bookings_owner_organisation_idx
on public.court_bookings(owner_organisation_id, status, start_time)
where owner_organisation_id is not null;

create unique index if not exists court_bookings_confirmed_lesson_unique
on public.court_bookings(coach_lesson_id)
where coach_lesson_id is not null and status = 'confirmed';

create or replace function public.user_can_manage_court_access(
  check_owner_venue_id uuid,
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
      or public.user_has_active_organisation_role(
        check_owner_venue_id,
        array['organisation_admin', 'club_manager', 'sports_coordinator']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.coachr_user_can_use_organisation(
  check_organisation_id uuid,
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
      or public.user_has_active_organisation_role(
        check_organisation_id,
        array['organisation_admin', 'club_manager', 'head_coach', 'coach', 'assistant_coach', 'sports_coordinator']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.coachr_court_is_authorised(
  check_organisation_id uuid,
  check_court_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.coachr_user_can_use_organisation(check_organisation_id, check_user_id)
    and exists (
      select 1
      from public.courts court
      where court.id = check_court_id
        and court.status = 'active'
        and (
          court.venue_id = check_organisation_id
          or exists (
            select 1
            from public.organisation_court_access access
            where access.owner_venue_id = court.venue_id
              and access.approved_venue_id = check_organisation_id
              and (access.court_id is null or access.court_id = court.id)
              and access.status = 'active'
              and (access.valid_from is null or access.valid_from <= current_date)
              and (access.valid_until is null or access.valid_until >= current_date)
          )
        )
    );
$$;

create or replace function public.coachr_authorised_courts(p_organisation_id uuid)
returns table (
  court_id uuid,
  court_name text,
  owner_venue_id uuid,
  owner_venue_name text,
  access_kind text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.coachr_user_can_use_organisation(p_organisation_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    court.id,
    court.name,
    owner.id,
    owner.name,
    case when owner.id = p_organisation_id then 'owned' else 'shared' end
  from public.courts court
  join public.venues owner on owner.id = court.venue_id
  where court.status = 'active'
    and owner.status = 'active'
    and (
      owner.id = p_organisation_id
      or exists (
        select 1
        from public.organisation_court_access access
        where access.owner_venue_id = owner.id
          and access.approved_venue_id = p_organisation_id
          and (access.court_id is null or access.court_id = court.id)
          and access.status = 'active'
          and (access.valid_from is null or access.valid_from <= current_date)
          and (access.valid_until is null or access.valid_until >= current_date)
      )
    )
  order by owner.name, court.sort_order, court.name;
end;
$$;

create or replace function public.coachr_update_lesson_plan(
  p_lesson_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
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
  selected_player record;
  selected_court record;
  affected record;
  affected_ids uuid[];
  affected_booking_ids uuid[];
  resolved_booking_id uuid;
  new_start timestamptz;
  new_end timestamptz;
  local_start_time time := (p_start_time at time zone 'Africa/Johannesburg')::time;
  local_end_time time := (p_end_time at time zone 'Africa/Johannesburg')::time;
  recipient_user_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_lesson_id is null or p_player_id is null or p_start_time is null or p_end_time is null or p_status is null or p_scope not in ('single', 'future', 'series') then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;
  if p_location_type not in ('managed_court', 'custom', 'none')
    or (p_location_type = 'managed_court' and p_court_id is null)
    or (p_location_type = 'custom' and length(btrim(coalesce(p_custom_location, ''))) = 0) then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  select * into target_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if target_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;
  if not (
    public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select profile.id, profile.is_junior, profile.parent_profile_id
  into selected_player
  from public.profiles profile
  where profile.id = p_player_id;

  if selected_player.id is null
    or not public.user_can_read_organisation_player_link(target_lesson.venue_id, p_player_id, selected_player.parent_profile_id, actor_user_id) then
    raise exception 'invalid_student' using errcode = 'P0001';
  end if;

  if p_location_type = 'managed_court' then
    if not public.coachr_court_is_authorised(target_lesson.venue_id, p_court_id, actor_user_id) then
      raise exception 'court_access' using errcode = 'P0001';
    end if;
    select court.name, court.venue_id as owner_venue_id into selected_court
    from public.courts court where court.id = p_court_id and court.status = 'active';
    perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));
  end if;

  if p_scope = 'single' or target_lesson.recurring_group_id is null then
    affected_ids := array[target_lesson.id];
    affected_booking_ids := case when target_lesson.court_booking_id is null then array[]::uuid[] else array[target_lesson.court_booking_id] end;
  else
    perform 1
    from public.coach_lessons lesson
    where lesson.recurring_group_id = target_lesson.recurring_group_id
      and lesson.status = 'scheduled'
      and not exists (select 1 from public.coach_lesson_attendance attendance where attendance.lesson_id = lesson.id)
      and (p_scope = 'series' or lesson.start_time >= target_lesson.start_time)
    for update;

    select
      coalesce(array_agg(lesson.id), array[]::uuid[]),
      coalesce(array_agg(lesson.court_booking_id) filter (where lesson.court_booking_id is not null), array[]::uuid[])
    into affected_ids, affected_booking_ids
    from public.coach_lessons lesson
    where lesson.recurring_group_id = target_lesson.recurring_group_id
      and lesson.status = 'scheduled'
      and not exists (select 1 from public.coach_lesson_attendance attendance where attendance.lesson_id = lesson.id)
      and (p_scope = 'series' or lesson.start_time >= target_lesson.start_time);
  end if;

  if array_length(affected_ids, 1) is null then
    return;
  end if;

  for affected in
    select lesson.*
    from public.coach_lessons lesson
    where lesson.id = any(affected_ids)
    order by lesson.start_time
  loop
    if array_length(affected_ids, 1) = 1 then
      new_start := p_start_time;
      new_end := p_end_time;
    else
      new_start := public.coachr_local_datetime((affected.start_time at time zone 'Africa/Johannesburg')::date, local_start_time);
      new_end := public.coachr_local_datetime((affected.start_time at time zone 'Africa/Johannesburg')::date, local_end_time);
    end if;

    if p_location_type = 'managed_court' and p_status not in ('cancelled', 'rain', 'sick') and exists (
      select 1 from public.court_bookings booking
      where booking.court_id = p_court_id
        and booking.status = 'confirmed'
        and not (booking.id = any(affected_booking_ids))
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(new_start, new_end, '[)')
    ) then
      raise exception 'court_conflict:%', selected_court.name using errcode = 'P0001';
    end if;

    if p_status not in ('cancelled', 'rain', 'sick') and exists (
      select 1 from public.coach_lessons lesson
      where lesson.coach_id = target_lesson.coach_id
        and not (lesson.id = any(affected_ids))
        and lesson.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(new_start, new_end, '[)')
    ) then
      raise exception 'coach_conflict' using errcode = 'P0001';
    end if;
  end loop;

  for affected in
    select lesson.*
    from public.coach_lessons lesson
    where lesson.id = any(affected_ids)
    order by lesson.start_time
  loop
    if array_length(affected_ids, 1) = 1 then
      new_start := p_start_time;
      new_end := p_end_time;
    else
      new_start := public.coachr_local_datetime((affected.start_time at time zone 'Africa/Johannesburg')::date, local_start_time);
      new_end := public.coachr_local_datetime((affected.start_time at time zone 'Africa/Johannesburg')::date, local_end_time);
    end if;

    if p_status in ('cancelled', 'rain', 'sick') then
      if affected.court_booking_id is not null then
        update public.court_bookings
        set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), cancelled_by_user_id = actor_user_id
        where id = affected.court_booking_id and status = 'confirmed';
      end if;
      resolved_booking_id := null;
    elsif p_location_type = 'managed_court' then
      resolved_booking_id := affected.court_booking_id;
      if resolved_booking_id is null then
        insert into public.court_bookings (
          court_id, booked_by_user_id, player_profile_id, start_time, end_time, status, booking_type, is_public, notes,
          booking_organisation_id, owner_organisation_id, coach_lesson_id, booking_purpose
        ) values (
          p_court_id, actor_user_id, p_player_id, new_start, new_end, 'confirmed', 'lesson', false,
          concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end),
          target_lesson.venue_id, selected_court.owner_venue_id, affected.id, 'coaching_lesson'
        ) returning id into resolved_booking_id;
      else
        update public.court_bookings
        set court_id = p_court_id,
            booked_by_user_id = actor_user_id,
            player_profile_id = p_player_id,
            start_time = new_start,
            end_time = new_end,
            status = 'confirmed',
            booking_type = 'lesson',
            is_public = false,
            notes = concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end),
            booking_organisation_id = target_lesson.venue_id,
            owner_organisation_id = selected_court.owner_venue_id,
            coach_lesson_id = affected.id,
            booking_purpose = 'coaching_lesson',
            cancelled_at = null,
            cancelled_by_user_id = null
        where id = resolved_booking_id;
      end if;
    else
      if affected.court_booking_id is not null then
        update public.court_bookings
        set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), cancelled_by_user_id = actor_user_id
        where id = affected.court_booking_id and status = 'confirmed';
      end if;
      resolved_booking_id := null;
    end if;

    update public.coach_lessons
    set player_id = p_player_id,
        junior_profile_id = case when selected_player.is_junior then p_player_id else null end,
        parent_id = selected_player.parent_profile_id,
        court_id = case
          when p_status in ('cancelled', 'rain', 'sick') then affected.court_id
          when p_location_type = 'managed_court' then p_court_id
          else null
        end,
        court_booking_id = case when p_status in ('cancelled', 'rain', 'sick') then affected.court_booking_id else resolved_booking_id end,
        location_type = case when p_status in ('cancelled', 'rain', 'sick') then affected.location_type else p_location_type end,
        custom_location = case when p_status not in ('cancelled', 'rain', 'sick') and p_location_type = 'custom' then btrim(p_custom_location) else affected.custom_location end,
        lesson_type = coalesce(p_lesson_type, affected.lesson_type),
        title = coalesce(nullif(btrim(p_title), ''), affected.title),
        start_time = new_start,
        end_time = new_end,
        status = p_status,
        notes = p_notes,
        cancelled_at = case when p_status in ('cancelled', 'rain', 'sick') then coalesce(affected.cancelled_at, now()) else null end,
        cancelled_by_user_id = case when p_status in ('cancelled', 'rain', 'sick') then actor_user_id else null end,
        updated_by_user_id = actor_user_id
    where id = affected.id;
  end loop;

  recipient_user_id := public.notification_profile_owner(p_player_id);
  perform public.create_system_notification(
    target_user_id => recipient_user_id,
    notification_type => case when p_status in ('cancelled', 'rain', 'sick') then 'lesson_cancelled' else 'lesson_updated' end,
    notification_title => case when p_status in ('cancelled', 'rain', 'sick') then 'Lesson changed' else 'Lesson updated' end,
    notification_message => case
      when p_status = 'rain' then 'A coaching lesson was marked as rain affected.'
      when p_status = 'sick' then 'A coaching lesson was marked as sick.'
      when p_status = 'cancelled' then 'A coaching lesson was cancelled.'
      else concat(coalesce(nullif(btrim(p_title), ''), target_lesson.title), ' was updated.')
    end,
    notification_href => '/dashboard/players/' || p_player_id::text,
    notification_actor_user_id => actor_user_id,
    notification_profile_id => p_player_id,
    notification_junior_profile_id => case when selected_player.is_junior then p_player_id else null end,
    notification_metadata => jsonb_build_object('lessonId', p_lesson_id, 'organisationId', target_lesson.venue_id),
    notification_dedupe_key => null
  );
exception
  when exclusion_violation then
    raise exception 'court_conflict:%', coalesce(selected_court.name, 'Selected court') using errcode = 'P0001';
end;
$$;

revoke all on function public.coachr_update_lesson_plan(uuid, uuid, uuid, text, text, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) from public;
grant execute on function public.coachr_update_lesson_plan(uuid, uuid, uuid, text, text, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) to authenticated;

create or replace function public.coachr_available_courts(
  p_organisation_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_exclude_lesson_id uuid default null
)
returns table (
  court_id uuid,
  court_name text,
  owner_venue_id uuid,
  owner_venue_name text,
  access_kind text,
  available boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  excluded_booking_id uuid;
begin
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  if p_exclude_lesson_id is not null then
    select lesson.court_booking_id into excluded_booking_id
    from public.coach_lessons lesson
    where lesson.id = p_exclude_lesson_id
      and (public.can_manage_coach_lesson(lesson.id) or public.user_is_platform_admin());
  end if;

  return query
  select
    authorised.court_id,
    authorised.court_name,
    authorised.owner_venue_id,
    authorised.owner_venue_name,
    authorised.access_kind,
    not exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = authorised.court_id
        and booking.status = 'confirmed'
        and booking.id is distinct from excluded_booking_id
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    ) as available
  from public.coachr_authorised_courts(p_organisation_id) authorised;
end;
$$;


create or replace function public.grant_organisation_court_access(
  p_owner_venue_id uuid,
  p_approved_venue_id uuid,
  p_court_id uuid default null,
  p_valid_from date default null,
  p_valid_until date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  access_id uuid;
begin
  if actor_user_id is null or not public.user_can_manage_court_access(p_owner_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_owner_venue_id is null or p_approved_venue_id is null or p_owner_venue_id = p_approved_venue_id then
    raise exception 'invalid_organisation' using errcode = 'P0001';
  end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until < p_valid_from then
    raise exception 'date_order' using errcode = 'P0001';
  end if;
  if p_court_id is not null and not exists (
    select 1 from public.courts where id = p_court_id and venue_id = p_owner_venue_id
  ) then
    raise exception 'court_venue' using errcode = 'P0001';
  end if;

  insert into public.organisation_court_access (
    owner_venue_id, approved_venue_id, court_id, status, valid_from, valid_until, notes, created_by_user_id
  ) values (
    p_owner_venue_id, p_approved_venue_id, p_court_id, 'active', p_valid_from, p_valid_until, nullif(btrim(coalesce(p_notes, '')), ''), actor_user_id
  )
  on conflict (owner_venue_id, approved_venue_id, (coalesce(court_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where status = 'active'
  do update set
    valid_from = excluded.valid_from,
    valid_until = excluded.valid_until,
    notes = excluded.notes,
    updated_at = now()
  returning id into access_id;

  return access_id;
end;
$$;

create or replace function public.revoke_organisation_court_access(p_access_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  owner_id uuid;
begin
  select owner_venue_id into owner_id
  from public.organisation_court_access
  where id = p_access_id
  for update;

  if actor_user_id is null or owner_id is null or not public.user_can_manage_court_access(owner_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  update public.organisation_court_access
  set status = 'revoked', revoked_by_user_id = actor_user_id, revoked_at = now()
  where id = p_access_id and status = 'active';
end;
$$;

alter table public.organisation_court_access enable row level security;
grant select, insert, update on public.organisation_court_access to authenticated;

drop policy if exists "Users can read permitted court access" on public.organisation_court_access;
create policy "Users can read permitted court access"
on public.organisation_court_access for select to authenticated
using (
  public.user_can_manage_court_access(owner_venue_id)
  or public.user_has_active_organisation_role(
    approved_venue_id,
    array['organisation_admin', 'club_manager', 'head_coach', 'coach', 'assistant_coach', 'sports_coordinator']::public.organisation_role[]
  )
);

drop policy if exists "Managers can create court access" on public.organisation_court_access;
create policy "Managers can create court access"
on public.organisation_court_access for insert to authenticated
with check (public.user_can_manage_court_access(owner_venue_id));

drop policy if exists "Managers can update court access" on public.organisation_court_access;
create policy "Managers can update court access"
on public.organisation_court_access for update to authenticated
using (public.user_can_manage_court_access(owner_venue_id))
with check (public.user_can_manage_court_access(owner_venue_id));

drop policy if exists "Admins can manage courts" on public.courts;
drop policy if exists "Organisation owners can manage courts" on public.courts;
create policy "Organisation owners can manage courts"
on public.courts for all to authenticated
using (public.user_can_manage_court_access(venue_id))
with check (public.user_can_manage_court_access(venue_id));

drop policy if exists "Admins can manage court bookings" on public.court_bookings;
drop policy if exists "Facility managers can manage court bookings" on public.court_bookings;
create policy "Facility managers can manage court bookings"
on public.court_bookings for all to authenticated
using (public.user_can_manage_court_access(coalesce(owner_organisation_id, (select court.venue_id from public.courts court where court.id = court_bookings.court_id))))
with check (public.user_can_manage_court_access(coalesce(owner_organisation_id, (select court.venue_id from public.courts court where court.id = court_bookings.court_id))));

drop policy if exists "Organisation coaches can read organisation bookings" on public.court_bookings;
create policy "Organisation coaches can read organisation bookings"
on public.court_bookings for select to authenticated
using (
  booking_organisation_id is not null
  and public.coachr_user_can_use_organisation(booking_organisation_id)
);

revoke all on function public.user_can_manage_court_access(uuid, uuid) from public;
revoke all on function public.coachr_user_can_use_organisation(uuid, uuid) from public;
revoke all on function public.coachr_court_is_authorised(uuid, uuid, uuid) from public;
revoke all on function public.coachr_authorised_courts(uuid) from public;
revoke all on function public.coachr_available_courts(uuid, timestamptz, timestamptz, uuid) from public;
revoke all on function public.grant_organisation_court_access(uuid, uuid, uuid, date, date, text) from public;
revoke all on function public.revoke_organisation_court_access(uuid) from public;

grant execute on function public.coachr_authorised_courts(uuid) to authenticated;
grant execute on function public.coachr_available_courts(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.grant_organisation_court_access(uuid, uuid, uuid, date, date, text) to authenticated;
grant execute on function public.revoke_organisation_court_access(uuid) to authenticated;
grant execute on function public.user_can_manage_court_access(uuid, uuid) to authenticated;
grant execute on function public.coachr_user_can_use_organisation(uuid, uuid) to authenticated;

create or replace function public.coachr_create_lesson_plan(
  p_venue_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_repeat_mode text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_recurrence_start_date date,
  p_recurrence_end_date date,
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
  selected_court record;
  occurrence_starts timestamptz[];
  occurrence_ends timestamptz[];
  occurrence_count integer;
  occurrence_index integer;
  series_id uuid;
  first_lesson_id uuid;
  new_lesson_id uuid;
  new_booking_id uuid;
  repeat_metadata text;
  recipient_user_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_venue_id is null or p_coach_id is null or p_player_id is null or p_repeat_mode not in ('none', 'weekly') then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if p_location_type not in ('managed_court', 'custom', 'none') then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;
  if p_location_type = 'managed_court' and p_court_id is null then
    raise exception 'missing_court' using errcode = 'P0001';
  end if;
  if p_location_type = 'custom' and length(btrim(coalesce(p_custom_location, ''))) = 0 then
    raise exception 'custom_location' using errcode = 'P0001';
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
    if not public.coachr_court_is_authorised(p_venue_id, p_court_id, actor_user_id) then
      raise exception 'court_access' using errcode = 'P0001';
    end if;

    select court.name, court.venue_id as owner_venue_id
    into selected_court
    from public.courts court
    where court.id = p_court_id and court.status = 'active';

    perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));
  end if;

  if p_repeat_mode = 'none' then
    if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
      raise exception 'time_order' using errcode = 'P0001';
    end if;
    occurrence_starts := array[p_start_time];
    occurrence_ends := array[p_end_time];
    repeat_metadata := null;
  else
    if p_recurrence_start_date is null
      or p_recurrence_end_date is null
      or p_day_of_week is null
      or p_recurrence_start_time is null
      or p_recurrence_end_time is null then
      raise exception 'missing_fields' using errcode = 'P0001';
    end if;
    if p_day_of_week < 1
      or p_day_of_week > 7
      or p_recurrence_end_date < p_recurrence_start_date
      or p_recurrence_end_date > (p_recurrence_start_date + interval '12 months')::date then
      raise exception 'recurrence_range' using errcode = 'P0001';
    end if;
    if p_recurrence_end_time <= p_recurrence_start_time then
      raise exception 'time_order' using errcode = 'P0001';
    end if;

    select
      array_agg(public.coachr_local_datetime(day_value::date, p_recurrence_start_time) order by day_value),
      array_agg(public.coachr_local_datetime(day_value::date, p_recurrence_end_time) order by day_value)
    into occurrence_starts, occurrence_ends
    from generate_series(p_recurrence_start_date, p_recurrence_end_date, interval '1 day') day_value
    where extract(isodow from day_value)::integer = p_day_of_week;

    if array_length(occurrence_starts, 1) is null then
      raise exception 'recurrence_range' using errcode = 'P0001';
    end if;

    series_id := gen_random_uuid();
    repeat_metadata := concat(
      'weekly;start=', p_recurrence_start_date::text,
      ';end=', p_recurrence_end_date::text,
      ';dow=', p_day_of_week::text,
      ';start_time=', p_recurrence_start_time::text,
      ';end_time=', p_recurrence_end_time::text
    );
  end if;

  occurrence_count := array_length(occurrence_starts, 1);
  for occurrence_index in 1..occurrence_count loop
    if p_location_type = 'managed_court' and exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = p_court_id
        and booking.status = 'confirmed'
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(occurrence_starts[occurrence_index], occurrence_ends[occurrence_index], '[)')
    ) then
      if p_repeat_mode = 'weekly' then
        raise exception 'recurrence_conflicts:%: % is already booked.', to_char(occurrence_starts[occurrence_index] at time zone 'Africa/Johannesburg', 'Dy DD Mon'), selected_court.name using errcode = 'P0001';
      end if;
      raise exception 'court_conflict:%', selected_court.name using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.coach_lessons lesson
      where lesson.coach_id = p_coach_id
        and lesson.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(occurrence_starts[occurrence_index], occurrence_ends[occurrence_index], '[)')
    ) then
      if p_repeat_mode = 'weekly' then
        raise exception 'recurrence_conflicts:%: Coach already has another lesson.', to_char(occurrence_starts[occurrence_index] at time zone 'Africa/Johannesburg', 'Dy DD Mon') using errcode = 'P0001';
      end if;
      raise exception 'coach_conflict' using errcode = 'P0001';
    end if;
  end loop;

  for occurrence_index in 1..occurrence_count loop
    new_booking_id := null;

    if p_location_type = 'managed_court' then
      insert into public.court_bookings (
        court_id,
        booked_by_user_id,
        player_profile_id,
        start_time,
        end_time,
        status,
        booking_type,
        is_public,
        notes,
        booking_organisation_id,
        owner_organisation_id,
        booking_purpose
      ) values (
        p_court_id,
        actor_user_id,
        p_player_id,
        occurrence_starts[occurrence_index],
        occurrence_ends[occurrence_index],
        'confirmed',
        'lesson',
        false,
        concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end),
        p_venue_id,
        selected_court.owner_venue_id,
        'coaching_lesson'
      ) returning id into new_booking_id;
    end if;

    insert into public.coach_lessons (
      venue_id,
      coach_id,
      player_id,
      junior_profile_id,
      parent_id,
      court_id,
      court_booking_id,
      location_type,
      custom_location,
      lesson_type,
      title,
      start_time,
      end_time,
      repeat_rule,
      recurring_group_id,
      status,
      attendance_status,
      feedback_status,
      notes,
      created_by_user_id,
      updated_by_user_id
    ) values (
      p_venue_id,
      p_coach_id,
      p_player_id,
      case when selected_player.is_junior then p_player_id else null end,
      selected_player.parent_profile_id,
      case when p_location_type = 'managed_court' then p_court_id else null end,
      new_booking_id,
      p_location_type,
      case when p_location_type = 'custom' then btrim(p_custom_location) else null end,
      coalesce(p_lesson_type, 'private'::public.coach_lesson_type),
      coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'),
      occurrence_starts[occurrence_index],
      occurrence_ends[occurrence_index],
      repeat_metadata,
      series_id,
      'scheduled',
      'not_marked',
      'not_started',
      p_notes,
      actor_user_id,
      actor_user_id
    ) returning id into new_lesson_id;

    first_lesson_id := coalesce(first_lesson_id, new_lesson_id);
    if new_booking_id is not null then
      update public.court_bookings set coach_lesson_id = new_lesson_id where id = new_booking_id;
    end if;
  end loop;

  recipient_user_id := public.notification_profile_owner(p_player_id);
  perform public.create_system_notification(
    target_user_id => recipient_user_id,
    notification_type => 'lesson_created',
    notification_title => case when p_repeat_mode = 'weekly' then 'Weekly lessons scheduled' else 'Lesson scheduled' end,
    notification_message => concat(coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'), ' has been added to the coaching schedule.'),
    notification_href => '/dashboard/players/' || p_player_id::text,
    notification_actor_user_id => actor_user_id,
    notification_profile_id => p_player_id,
    notification_junior_profile_id => case when selected_player.is_junior then p_player_id else null end,
    notification_metadata => jsonb_build_object('lessonId', first_lesson_id, 'organisationId', p_venue_id),
    notification_dedupe_key => 'coach-lesson-created:' || first_lesson_id::text
  );

  return coalesce(series_id, first_lesson_id);
exception
  when exclusion_violation then
    raise exception 'court_conflict:%', coalesce(selected_court.name, 'Selected court') using errcode = 'P0001';
end;
$$;

revoke all on function public.coachr_create_lesson_plan(uuid, uuid, uuid, uuid, text, text, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, date, integer, time, time, text) from public;
grant execute on function public.coachr_create_lesson_plan(uuid, uuid, uuid, uuid, text, text, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, date, integer, time, time, text) to authenticated;

alter table public.notifications
  add column if not exists status text not null default 'unread',
  add column if not exists action_required boolean not null default false,
  add column if not exists invitation_id uuid references public.organisation_invitations(id) on delete set null,
  add column if not exists resolved_at timestamptz;

update public.notifications
set status = case when read_at is null then 'unread' else 'read' end
where status not in ('action_required', 'resolved', 'expired');

alter table public.notifications drop constraint if exists notifications_type_valid;
alter table public.notifications add constraint notifications_type_valid check (
  type in (
    'match_invite_received', 'match_invite_accepted', 'match_invite_declined', 'match_invite_reminder',
    'court_booking_confirmed', 'upcoming_booking_reminder', 'event_entry_confirmed', 'event_reminder',
    'rating_updated', 'badge_unlocked', 'leaderboard_changed', 'membership_renewal', 'shop_reservation_update',
    'coach_invitation', 'player_link_invitation', 'parent_approval_required', 'invitation_accepted',
    'invitation_declined', 'lesson_created', 'lesson_updated', 'lesson_cancelled', 'new_message'
  )
);

alter table public.notifications drop constraint if exists notifications_status_valid;
alter table public.notifications add constraint notifications_status_valid check (
  status in ('unread', 'read', 'action_required', 'resolved', 'expired')
);

alter table public.notifications drop constraint if exists notifications_action_state_valid;
alter table public.notifications add constraint notifications_action_state_valid check (
  (action_required = true and status = 'action_required' and invitation_id is not null and resolved_at is null)
  or action_required = false
);

create index if not exists notifications_user_status_created_idx
on public.notifications(user_id, status, created_at desc);

create index if not exists notifications_invitation_idx
on public.notifications(invitation_id, user_id)
where invitation_id is not null;

create unique index if not exists notifications_invitation_recipient_type_unique
on public.notifications(invitation_id, user_id, type)
where invitation_id is not null;

create or replace function public.protect_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.profile_id is distinct from old.profile_id
    or new.junior_profile_id is distinct from old.junior_profile_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.href is distinct from old.href
    or new.metadata is distinct from old.metadata
    or new.dedupe_key is distinct from old.dedupe_key
    or new.status is distinct from old.status
    or new.action_required is distinct from old.action_required
    or new.invitation_id is distinct from old.invitation_id
    or new.resolved_at is distinct from old.resolved_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Only notification read state can be updated';
  end if;

  if new.read_at is distinct from old.read_at and old.status = 'unread' then
    new.status := case when new.read_at is null then 'unread' else 'read' end;
  end if;

  return new;
end;
$$;

create or replace function public.notify_organisation_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_user_id uuid;
  junior_user_id uuid;
  target_parent_profile_id uuid;
  organisation_name text;
  coach_name text;
  player_name text;
  notification_type text;
  notification_title text;
  notification_message text;
begin
  select venue.name into organisation_name from public.venues venue where venue.id = new.venue_id;
  select concat_ws(' ', profile.first_name, profile.last_name) into coach_name
  from public.profiles profile where profile.user_id = new.invited_by_user_id and profile.is_junior = false limit 1;
  player_name := coalesce(
    nullif(concat_ws(' ', new.metadata ->> 'playerFirstName', new.metadata ->> 'playerLastName'), ''),
    new.invited_name,
    'a player'
  );

  if tg_op = 'INSERT' then
    if new.invitation_kind = 'player_junior' then
      target_parent_profile_id := coalesce(
        new.parent_profile_id,
        (select junior.parent_profile_id from public.profiles junior where junior.id = new.target_junior_profile_id)
      );
      recipient_user_id := coalesce(
        (select parent.user_id from public.profiles parent where parent.id = target_parent_profile_id),
        (select profile.user_id from public.profiles profile where lower(profile.email) = lower(new.invited_email) and profile.is_junior = false limit 1)
      );
      notification_type := 'parent_approval_required';
      notification_title := 'Player connection needs approval';
      notification_message := concat(organisation_name, ' would like to connect with ', player_name, '.', case when coach_name is not null then ' Coach: ' || coach_name || '.' else '' end);
    elsif new.invitation_kind = 'player' then
      recipient_user_id := (select profile.user_id from public.profiles profile where lower(profile.email) = lower(new.invited_email) and profile.is_junior = false limit 1);
      notification_type := 'player_link_invitation';
      notification_title := 'Player connection request';
      notification_message := concat(organisation_name, ' would like to connect with your PlayR profile.');
    elsif new.invitation_kind = 'coach' then
      recipient_user_id := (select profile.user_id from public.profiles profile where lower(profile.email) = lower(new.invited_email) and profile.is_junior = false limit 1);
      notification_type := 'coach_invitation';
      notification_title := 'CoachR invitation';
      notification_message := concat(organisation_name, ' invited you to join CoachR.');
    else
      recipient_user_id := (select profile.user_id from public.profiles profile where lower(profile.email) = lower(new.invited_email) and profile.is_junior = false limit 1);
      notification_type := 'new_message';
      notification_title := 'Organisation invitation';
      notification_message := concat(organisation_name, ' invited you to join PlayR.');
    end if;

    if recipient_user_id is not null then
      insert into public.notifications (
        user_id, actor_user_id, profile_id, junior_profile_id, type, title, message, href, metadata,
        dedupe_key, status, action_required, invitation_id
      ) values (
        recipient_user_id,
        new.invited_by_user_id,
        new.target_profile_id,
        new.target_junior_profile_id,
        notification_type,
        notification_title,
        notification_message,
        '/dashboard/organisations/invitations',
        jsonb_build_object('organisationId', new.venue_id, 'invitationKind', new.invitation_kind::text),
        'organisation-invitation:' || new.id::text || ':' || recipient_user_id::text,
        'action_required',
        true,
        new.id
      ) on conflict do nothing;
    end if;

    if new.invitation_kind = 'player_junior' and new.target_junior_profile_id is not null then
      select junior.user_id into junior_user_id from public.profiles junior where junior.id = new.target_junior_profile_id;
      if junior_user_id is not null and junior_user_id is distinct from recipient_user_id then
        insert into public.notifications (
          user_id, actor_user_id, junior_profile_id, type, title, message, metadata, dedupe_key, status, action_required, invitation_id
        ) values (
          junior_user_id,
          new.invited_by_user_id,
          new.target_junior_profile_id,
          'player_link_invitation',
          'Player connection requested',
          concat(organisation_name, ' requested to connect with your PlayR profile. Your parent or guardian must approve this request.'),
          jsonb_build_object('organisationId', new.venue_id, 'guardianApprovalRequired', true),
          'organisation-invitation-info:' || new.id::text || ':' || junior_user_id::text,
          'unread',
          false,
          new.id
        ) on conflict do nothing;
      end if;
    end if;

    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('accepted', 'declined', 'cancelled', 'expired') then
    update public.notifications
    set status = case when new.status = 'expired' then 'expired' else 'resolved' end,
        action_required = false,
        resolved_at = coalesce(resolved_at, now()),
        read_at = coalesce(read_at, now())
    where invitation_id = new.id and status not in ('resolved', 'expired');

    if new.status in ('accepted', 'declined') then
      insert into public.notifications (
        user_id, actor_user_id, profile_id, junior_profile_id, type, title, message, href, metadata, dedupe_key, status
      ) values (
        new.invited_by_user_id,
        new.accepted_by_user_id,
        new.accepted_profile_id,
        new.target_junior_profile_id,
        case when new.status = 'accepted' then 'invitation_accepted' else 'invitation_declined' end,
        case when new.status = 'accepted' then 'Invitation accepted' else 'Invitation declined' end,
        concat(coalesce(new.invited_name, new.invited_email), ' ', case when new.status = 'accepted' then 'accepted' else 'declined' end, ' the ', lower(organisation_name), ' invitation.'),
        case when new.invitation_kind in ('player', 'player_junior') then '/dashboard/coachr/students' else '/dashboard/coachr/coaches' end,
        jsonb_build_object('organisationId', new.venue_id, 'invitationId', new.id),
        'organisation-invitation-outcome:' || new.id::text || ':' || new.status::text,
        'unread'
      ) on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists organisation_invitations_notify on public.organisation_invitations;
create trigger organisation_invitations_notify
after insert or update of status on public.organisation_invitations
for each row execute function public.notify_organisation_invitation_event();

revoke all on function public.protect_notification_update() from public;
revoke all on function public.notify_organisation_invitation_event() from public;

create or replace function public.create_adult_player_invitation(
  p_venue_id uuid,
  p_invited_email text,
  p_invited_name text default null,
  p_invited_phone text default null,
  p_coach_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_invited_email));
  invite_token uuid;
begin
  if actor_user_id is null or not public.user_can_invite_players(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if normalized_email = '' then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  update public.organisation_invitations
  set status = 'expired'
  where status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.organisation_invitations invitation
    where invitation.venue_id = p_venue_id
      and lower(invitation.invited_email) = normalized_email
      and invitation.invitation_kind = 'player'
      and invitation.status = 'pending'
  ) then
    raise exception 'duplicate_invitation' using errcode = 'P0001';
  end if;

  insert into public.organisation_invitations (
    venue_id, invitation_kind, invited_email, invited_phone, invited_name, intended_role,
    invited_by_user_id, metadata
  ) values (
    p_venue_id,
    'player',
    normalized_email,
    nullif(btrim(coalesce(p_invited_phone, '')), ''),
    nullif(btrim(coalesce(p_invited_name, '')), ''),
    'viewer',
    actor_user_id,
    jsonb_build_object('coachProfileId', p_coach_profile_id, 'approvalMode', 'adult')
  ) returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.accept_adult_player_invitation(
  p_token uuid,
  p_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite_record public.organisation_invitations%rowtype;
  adult_profile_id uuid;
  chosen_profile_id uuid;
  created_link_id uuid;
  coach_profile_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select * into invite_record
  from public.organisation_invitations
  where token = p_token
  for update;

  if invite_record.id is null or invite_record.invitation_kind <> 'player' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if invite_record.status <> 'pending' then
    raise exception 'invitation_closed' using errcode = 'P0001';
  end if;
  if invite_record.expires_at <= now() then
    update public.organisation_invitations set status = 'expired' where id = invite_record.id;
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if actor_email = '' or lower(invite_record.invited_email) <> actor_email then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select id into adult_profile_id
  from public.profiles
  where user_id = actor_user_id and is_junior = false
  limit 1;
  chosen_profile_id := coalesce(p_profile_id, adult_profile_id);

  if chosen_profile_id is null or not exists (
    select 1 from public.profiles
    where id = chosen_profile_id and user_id = actor_user_id and is_junior = false
  ) then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  insert into public.organisation_player_links (
    venue_id, player_profile_id, invitation_id, status, requested_by_user_id, approved_by_user_id, approved_at
  ) values (
    invite_record.venue_id, chosen_profile_id, invite_record.id, 'active', invite_record.invited_by_user_id, actor_user_id, now()
  )
  on conflict (venue_id, player_profile_id)
  where status in ('pending', 'active', 'suspended')
  do update set
    status = 'active',
    invitation_id = excluded.invitation_id,
    approved_by_user_id = actor_user_id,
    approved_at = coalesce(public.organisation_player_links.approved_at, now()),
    removed_at = null
  returning id into created_link_id;

  coach_profile_id := case
    when coalesce(invite_record.metadata ->> 'coachProfileId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (invite_record.metadata ->> 'coachProfileId')::uuid
    else null
  end;

  if coach_profile_id is not null then
    insert into public.coach_player_assignments (
      venue_id, coach_profile_id, player_profile_id, organisation_player_link_id, status, assigned_by_user_id
    )
    select invite_record.venue_id, coach_profile_id, chosen_profile_id, created_link_id, 'active', actor_user_id
    where exists (
      select 1 from public.organisation_memberships membership
      where membership.venue_id = invite_record.venue_id
        and membership.profile_id = coach_profile_id
        and membership.role in ('head_coach', 'coach', 'assistant_coach')
        and membership.status = 'active'
    )
    on conflict (venue_id, coach_profile_id, player_profile_id)
    where status = 'active'
    do nothing;
  end if;

  update public.organisation_invitations
  set status = 'accepted', accepted_profile_id = chosen_profile_id, accepted_by_user_id = actor_user_id, accepted_at = now()
  where id = invite_record.id;

  insert into public.user_active_organisations(user_id, venue_id, product_context)
  values (actor_user_id, invite_record.venue_id, 'playr')
  on conflict (user_id) do update
  set venue_id = excluded.venue_id, product_context = excluded.product_context, updated_at = now();

  return invite_record.id;
end;
$$;

revoke all on function public.create_adult_player_invitation(uuid, text, text, text, uuid) from public;
revoke all on function public.accept_adult_player_invitation(uuid, uuid) from public;
grant execute on function public.create_adult_player_invitation(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.accept_adult_player_invitation(uuid, uuid) to authenticated;

create or replace function public.sync_my_pending_invitation_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation record;
  inserted_count integer := 0;
  inserted_id uuid;
begin
  if actor_user_id is null or actor_email = '' then
    raise exception 'access' using errcode = 'P0001';
  end if;

  update public.organisation_invitations
  set status = 'expired'
  where lower(invited_email) = actor_email and status = 'pending' and expires_at <= now();

  for invitation in
    select invite.*, venue.name as organisation_name
    from public.organisation_invitations invite
    join public.venues venue on venue.id = invite.venue_id
    where lower(invite.invited_email) = actor_email
      and invite.status = 'pending'
      and invite.expires_at > now()
  loop
    inserted_id := null;
    insert into public.notifications (
      user_id, actor_user_id, profile_id, junior_profile_id, type, title, message, href, metadata,
      dedupe_key, status, action_required, invitation_id
    ) values (
      actor_user_id,
      invitation.invited_by_user_id,
      invitation.target_profile_id,
      invitation.target_junior_profile_id,
      case
        when invitation.invitation_kind = 'player_junior' then 'parent_approval_required'
        when invitation.invitation_kind = 'player' then 'player_link_invitation'
        when invitation.invitation_kind = 'coach' then 'coach_invitation'
        else 'new_message'
      end,
      case
        when invitation.invitation_kind = 'player_junior' then 'Player connection needs approval'
        when invitation.invitation_kind = 'player' then 'Player connection request'
        when invitation.invitation_kind = 'coach' then 'CoachR invitation'
        else 'Organisation invitation'
      end,
      concat(invitation.organisation_name, ' sent you a PlayR invitation.'),
      '/dashboard/organisations/invitations',
      jsonb_build_object('organisationId', invitation.venue_id, 'invitationKind', invitation.invitation_kind::text),
      'organisation-invitation:' || invitation.id::text || ':' || actor_user_id::text,
      'action_required',
      true,
      invitation.id
    ) on conflict do nothing
    returning id into inserted_id;

    if inserted_id is not null then inserted_count := inserted_count + 1; end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.sync_my_pending_invitation_notifications() from public;
grant execute on function public.sync_my_pending_invitation_notifications() to authenticated;

create or replace function public.coach_profile_can_teach_at_venue(
  check_coach_id uuid,
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
    and exists (
      select 1
      from public.profiles coach
      join public.organisation_memberships membership
        on membership.profile_id = coach.id
       and membership.venue_id = check_venue_id
       and membership.status = 'active'
       and membership.role in ('head_coach', 'coach', 'assistant_coach')
      join public.venues venue on venue.id = membership.venue_id and venue.status = 'active'
      where coach.id = check_coach_id
        and coach.is_junior = false
        and (
          coach.user_id = check_user_id
          or public.user_can_manage_organisation_coaches(check_venue_id, check_user_id)
        )
    );
$$;

create or replace function public.coach_can_manage_own_lesson(
  check_coach_id uuid,
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
    and exists (
      select 1
      from public.profiles coach
      join public.organisation_memberships membership
        on membership.profile_id = coach.id
       and membership.venue_id = check_venue_id
       and membership.status = 'active'
       and membership.role in ('head_coach', 'coach', 'assistant_coach')
      join public.venues venue on venue.id = membership.venue_id and venue.status = 'active'
      where coach.id = check_coach_id
        and coach.user_id = check_user_id
        and coach.is_junior = false
    );
$$;

revoke all on function public.coach_profile_can_teach_at_venue(uuid, uuid, uuid) from public;
revoke all on function public.coach_can_manage_own_lesson(uuid, uuid, uuid) from public;
grant execute on function public.coach_profile_can_teach_at_venue(uuid, uuid, uuid) to authenticated;
grant execute on function public.coach_can_manage_own_lesson(uuid, uuid, uuid) to authenticated;

create or replace function public.coachr_notify_lesson_cancellation(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_lesson record;
  recipient_user_id uuid;
begin
  if actor_user_id is null or p_lesson_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select lesson.id,
         lesson.coach_id,
         lesson.player_id,
         lesson.venue_id,
         lesson.title,
         lesson.status,
         lesson.start_time,
         profile.is_junior
    into target_lesson
  from public.coach_lessons lesson
  join public.profiles profile on profile.id = lesson.player_id
  where lesson.id = p_lesson_id
  limit 1;

  if target_lesson.id is null
    or target_lesson.status not in ('cancelled', 'rain', 'sick')
    or not (
      public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
      or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
    ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  recipient_user_id := public.notification_profile_owner(target_lesson.player_id);
  perform public.create_system_notification(
    target_user_id => recipient_user_id,
    notification_type => 'lesson_cancelled',
    notification_title => case target_lesson.status
      when 'rain' then 'Lesson affected by rain'
      when 'sick' then 'Lesson cancelled due to illness'
      else 'Lesson cancelled'
    end,
    notification_message => concat(
      coalesce(nullif(btrim(target_lesson.title), ''), 'Coaching lesson'),
      ' on ',
      to_char(target_lesson.start_time at time zone 'Africa/Johannesburg', 'DD Mon YYYY at HH24:MI'),
      ' was ',
      case target_lesson.status
        when 'rain' then 'cancelled because of rain.'
        when 'sick' then 'cancelled due to illness.'
        else 'cancelled.'
      end
    ),
    notification_href => '/dashboard/players/' || target_lesson.player_id::text,
    notification_actor_user_id => actor_user_id,
    notification_profile_id => target_lesson.player_id,
    notification_junior_profile_id => case when target_lesson.is_junior then target_lesson.player_id else null end,
    notification_metadata => jsonb_build_object(
      'lessonId', target_lesson.id,
      'organisationId', target_lesson.venue_id,
      'status', target_lesson.status
    ),
    notification_dedupe_key => 'coach-lesson-cancelled:' || target_lesson.id::text || ':' || target_lesson.status::text
  );
end;
$$;

revoke all on function public.coachr_notify_lesson_cancellation(uuid) from public;
grant execute on function public.coachr_notify_lesson_cancellation(uuid) to authenticated;
