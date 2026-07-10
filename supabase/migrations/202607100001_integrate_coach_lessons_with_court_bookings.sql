create policy "CoachR users can read linked lesson court bookings"
on public.court_bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_lessons lesson
    where lesson.court_booking_id = court_bookings.id
      and (
        public.coach_can_manage_own_lesson(lesson.coach_id, lesson.venue_id)
        or public.can_manage_venue(lesson.venue_id)
      )
  )
);

create or replace function public.coachr_court_booking_blocks_for_range(check_start_time timestamptz, check_end_time timestamptz)
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
    case
      when public.can_manage_profile(booking.player_profile_id) then booking.player_profile_id
      else null
    end as player_profile_id,
    booking.start_time,
    booking.end_time,
    booking.booking_type,
    case
      when public.can_manage_profile(booking.player_profile_id) then concat_ws(' ', profile.first_name, profile.last_name)
      else null
    end as player_name
  from public.court_bookings booking
  left join public.profiles profile
    on profile.id = booking.player_profile_id
  where (select auth.uid()) is not null
    and booking.status = 'confirmed'
    and booking.start_time >= check_start_time
    and booking.start_time < check_end_time
  order by booking.start_time;
$$;

create or replace function public.coachr_create_lesson_with_booking(
  p_venue_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_court_name text;
  selected_player record;
  new_booking_id uuid;
  new_lesson_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_venue_id is null or p_coach_id is null or p_player_id is null or p_court_id is null or p_start_time is null or p_end_time is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  if not public.can_access_coachr(actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
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

  select court.name
    into selected_court_name
  from public.courts court
  where court.id = p_court_id
    and court.venue_id = p_venue_id
    and court.status = 'active';

  if selected_court_name is null then
    raise exception 'court_venue' using errcode = 'P0001';
  end if;

  select profile.id, profile.is_junior, profile.parent_profile_id
    into selected_player
  from public.profiles profile
  where profile.id = p_player_id;

  if selected_player.id is null then
    raise exception 'player_profile' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.court_bookings booking
    where booking.court_id = p_court_id
      and booking.status = 'confirmed'
      and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'court_conflict:%', selected_court_name using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.coach_lessons lesson
    where lesson.coach_id = p_coach_id
      and lesson.status not in ('cancelled', 'rain', 'sick')
      and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'coach_conflict' using errcode = 'P0001';
  end if;

  insert into public.court_bookings (
    court_id,
    booked_by_user_id,
    player_profile_id,
    start_time,
    end_time,
    status,
    booking_type,
    is_public,
    notes
  )
  values (
    p_court_id,
    actor_user_id,
    p_player_id,
    p_start_time,
    p_end_time,
    'confirmed',
    'lesson',
    false,
    concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end)
  )
  returning id into new_booking_id;

  insert into public.coach_lessons (
    venue_id,
    coach_id,
    player_id,
    junior_profile_id,
    parent_id,
    court_id,
    court_booking_id,
    lesson_type,
    title,
    start_time,
    end_time,
    status,
    attendance_status,
    feedback_status,
    notes,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    p_venue_id,
    p_coach_id,
    p_player_id,
    case when selected_player.is_junior then p_player_id else null end,
    selected_player.parent_profile_id,
    p_court_id,
    new_booking_id,
    coalesce(p_lesson_type, 'private'::public.coach_lesson_type),
    coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'),
    p_start_time,
    p_end_time,
    'scheduled',
    'not_marked',
    'not_started',
    p_notes,
    actor_user_id,
    actor_user_id
  )
  returning id into new_lesson_id;

  return new_lesson_id;
exception
  when exclusion_violation then
    raise exception 'court_conflict:%', coalesce(selected_court_name, 'Selected court') using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_update_lesson_with_booking(
  p_lesson_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status public.coach_lesson_status,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  existing_lesson record;
  selected_court_name text;
  selected_player record;
  resolved_booking_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_lesson_id is null or p_player_id is null or p_court_id is null or p_start_time is null or p_end_time is null or p_status is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;

  select *
    into existing_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if existing_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(existing_lesson.coach_id, existing_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(existing_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select court.name
    into selected_court_name
  from public.courts court
  where court.id = p_court_id
    and court.venue_id = existing_lesson.venue_id
    and court.status = 'active';

  if selected_court_name is null then
    raise exception 'court_venue' using errcode = 'P0001';
  end if;

  select profile.id, profile.is_junior, profile.parent_profile_id
    into selected_player
  from public.profiles profile
  where profile.id = p_player_id;

  if selected_player.id is null then
    raise exception 'player_profile' using errcode = 'P0001';
  end if;

  if p_status in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status) then
    if existing_lesson.court_booking_id is not null then
      update public.court_bookings
      set status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          cancelled_by_user_id = actor_user_id
      where id = existing_lesson.court_booking_id
        and status = 'confirmed';
    end if;

    update public.coach_lessons
    set player_id = p_player_id,
        junior_profile_id = case when selected_player.is_junior then p_player_id else null end,
        parent_id = selected_player.parent_profile_id,
        court_id = p_court_id,
        lesson_type = coalesce(p_lesson_type, existing_lesson.lesson_type),
        title = coalesce(nullif(btrim(p_title), ''), existing_lesson.title),
        start_time = p_start_time,
        end_time = p_end_time,
        status = p_status,
        notes = p_notes,
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by_user_id = actor_user_id,
        updated_by_user_id = actor_user_id
    where id = p_lesson_id;

    return;
  end if;

  if exists (
    select 1
    from public.court_bookings booking
    where booking.court_id = p_court_id
      and booking.status = 'confirmed'
      and booking.id is distinct from existing_lesson.court_booking_id
      and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'court_conflict:%', selected_court_name using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.coach_lessons lesson
    where lesson.id <> p_lesson_id
      and lesson.coach_id = existing_lesson.coach_id
      and lesson.status not in ('cancelled', 'rain', 'sick')
      and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'coach_conflict' using errcode = 'P0001';
  end if;

  if existing_lesson.court_booking_id is null then
    insert into public.court_bookings (
      court_id,
      booked_by_user_id,
      player_profile_id,
      start_time,
      end_time,
      status,
      booking_type,
      is_public,
      notes
    )
    values (
      p_court_id,
      actor_user_id,
      p_player_id,
      p_start_time,
      p_end_time,
      'confirmed',
      'lesson',
      false,
      concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end)
    )
    returning id into resolved_booking_id;
  else
    resolved_booking_id := existing_lesson.court_booking_id;

    update public.court_bookings
    set court_id = p_court_id,
        booked_by_user_id = actor_user_id,
        player_profile_id = p_player_id,
        start_time = p_start_time,
        end_time = p_end_time,
        status = 'confirmed',
        booking_type = 'lesson',
        is_public = false,
        notes = concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end),
        cancelled_at = null,
        cancelled_by_user_id = null
    where id = resolved_booking_id;
  end if;

  update public.coach_lessons
  set player_id = p_player_id,
      junior_profile_id = case when selected_player.is_junior then p_player_id else null end,
      parent_id = selected_player.parent_profile_id,
      court_id = p_court_id,
      court_booking_id = resolved_booking_id,
      lesson_type = coalesce(p_lesson_type, existing_lesson.lesson_type),
      title = coalesce(nullif(btrim(p_title), ''), existing_lesson.title),
      start_time = p_start_time,
      end_time = p_end_time,
      status = p_status,
      notes = p_notes,
      cancelled_at = null,
      cancelled_by_user_id = null,
      updated_by_user_id = actor_user_id
  where id = p_lesson_id;
exception
  when exclusion_violation then
    raise exception 'court_conflict:%', coalesce(selected_court_name, 'Selected court') using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_cancel_lesson_with_booking(
  p_lesson_id uuid,
  p_cancel_status public.coach_lesson_status default 'cancelled'::public.coach_lesson_status,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  existing_lesson record;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_lesson_id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if p_cancel_status not in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status) then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  select *
    into existing_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if existing_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(existing_lesson.coach_id, existing_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(existing_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if existing_lesson.court_booking_id is not null then
    update public.court_bookings
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by_user_id = actor_user_id
    where id = existing_lesson.court_booking_id
      and status = 'confirmed';
  end if;

  update public.coach_lessons
  set status = p_cancel_status,
      notes = coalesce(p_notes, notes),
      cancelled_at = coalesce(cancelled_at, now()),
      cancelled_by_user_id = actor_user_id,
      updated_by_user_id = actor_user_id
  where id = p_lesson_id;
end;
$$;

revoke all on function public.coachr_court_booking_blocks_for_range(timestamptz, timestamptz) from public;
revoke all on function public.coachr_create_lesson_with_booking(uuid, uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, text) from public;
revoke all on function public.coachr_update_lesson_with_booking(uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text) from public;
revoke all on function public.coachr_cancel_lesson_with_booking(uuid, public.coach_lesson_status, text) from public;

grant execute on function public.coachr_court_booking_blocks_for_range(timestamptz, timestamptz) to authenticated;
grant execute on function public.coachr_create_lesson_with_booking(uuid, uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.coachr_update_lesson_with_booking(uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text) to authenticated;
grant execute on function public.coachr_cancel_lesson_with_booking(uuid, public.coach_lesson_status, text) to authenticated;
