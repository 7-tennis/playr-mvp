-- Phase 2.2.2H.1 follow-up: remove the remaining record/SQL-alias collision.

create or replace function public.coachr_update_lesson_series_with_bookings(
  p_lesson_id uuid,
  p_player_id uuid,
  p_court_id uuid,
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
  existing_lesson record;
  selected_court_name text;
  selected_player record;
  affected_ids uuid[] := array[]::uuid[];
  affected_booking_ids uuid[] := array[]::uuid[];
  affected_lesson record;
  resolved_booking_id uuid;
  conflict_summary text;
  local_start_time time := (p_start_time at time zone 'Africa/Johannesburg')::time;
  local_end_time time := (p_end_time at time zone 'Africa/Johannesburg')::time;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_scope not in ('single', 'future', 'series') then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if p_lesson_id is null
    or p_player_id is null
    or p_court_id is null
    or p_start_time is null
    or p_end_time is null
    or p_status is null
  then
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

  if existing_lesson.recurring_group_id is null or p_scope = 'single' then
    perform public.coachr_update_lesson_with_booking(
      p_lesson_id,
      p_player_id,
      p_court_id,
      p_lesson_type,
      p_title,
      p_start_time,
      p_end_time,
      p_status,
      p_notes
    );
    return;
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

  perform 1
  from public.coach_lessons lesson
  where lesson.recurring_group_id = existing_lesson.recurring_group_id
    and lesson.status = 'scheduled'
    and (
      p_scope = 'series'
      or lesson.start_time >= existing_lesson.start_time
    )
  for update;

  select
    coalesce(array_agg(lesson.id), array[]::uuid[]),
    coalesce(array_agg(lesson.court_booking_id) filter (where lesson.court_booking_id is not null), array[]::uuid[])
    into affected_ids, affected_booking_ids
  from public.coach_lessons lesson
  where lesson.recurring_group_id = existing_lesson.recurring_group_id
    and lesson.status = 'scheduled'
    and (
      p_scope = 'series'
      or lesson.start_time >= existing_lesson.start_time
    );

  if array_length(affected_ids, 1) is null then
    return;
  end if;

  if p_status in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status) then
    update public.court_bookings booking
    set status = 'cancelled',
        cancelled_at = coalesce(booking.cancelled_at, now()),
        cancelled_by_user_id = actor_user_id
    from public.coach_lessons lesson
    where lesson.id = any(affected_ids)
      and lesson.court_booking_id = booking.id
      and booking.status = 'confirmed';

    update public.coach_lessons lesson
    set status = p_status,
        notes = coalesce(p_notes, lesson.notes),
        cancelled_at = coalesce(lesson.cancelled_at, now()),
        cancelled_by_user_id = actor_user_id,
        updated_by_user_id = actor_user_id
    where lesson.id = any(affected_ids);

    return;
  end if;

  with affected_lessons as (
    select
      lesson.id,
      lesson.court_booking_id,
      (lesson.start_time at time zone 'Africa/Johannesburg')::date as local_day,
      public.coachr_local_datetime((lesson.start_time at time zone 'Africa/Johannesburg')::date, local_start_time) as new_start,
      public.coachr_local_datetime((lesson.start_time at time zone 'Africa/Johannesburg')::date, local_end_time) as new_end
    from public.coach_lessons lesson
    where lesson.id = any(affected_ids)
  ),
  conflicts as (
    select
      to_char(affected_occurrence.local_day, 'Dy DD Mon') || ': ' || selected_court_name || ' is already booked.' as message
    from affected_lessons affected_occurrence
    where exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = p_court_id
        and booking.status = 'confirmed'
        and not (booking.id = any(affected_booking_ids))
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(affected_occurrence.new_start, affected_occurrence.new_end, '[)')
    )
    union all
    select
      to_char(affected_occurrence.local_day, 'Dy DD Mon') || ': Coach already has another lesson.' as message
    from affected_lessons affected_occurrence
    where exists (
      select 1
      from public.coach_lessons lesson
      where lesson.coach_id = existing_lesson.coach_id
        and not (lesson.id = any(affected_ids))
        and lesson.status = 'scheduled'
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(affected_occurrence.new_start, affected_occurrence.new_end, '[)')
    )
  )
  select string_agg(message, '; ' order by message) into conflict_summary
  from conflicts;

  if conflict_summary is not null then
    raise exception 'recurrence_conflicts:%', conflict_summary using errcode = 'P0001';
  end if;

  for affected_lesson in
    select
      lesson.*,
      public.coachr_local_datetime((lesson.start_time at time zone 'Africa/Johannesburg')::date, local_start_time) as new_start,
      public.coachr_local_datetime((lesson.start_time at time zone 'Africa/Johannesburg')::date, local_end_time) as new_end
    from public.coach_lessons lesson
    where lesson.id = any(affected_ids)
    order by lesson.start_time
  loop
    if affected_lesson.court_booking_id is null then
      insert into public.court_bookings (
        court_id, booked_by_user_id, player_profile_id, start_time, end_time,
        status, booking_type, is_public, notes
      )
      values (
        p_court_id, actor_user_id, p_player_id,
        affected_lesson.new_start, affected_lesson.new_end,
        'confirmed', 'lesson', false,
        concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end)
      )
      returning id into resolved_booking_id;
    else
      resolved_booking_id := affected_lesson.court_booking_id;

      update public.court_bookings
      set court_id = p_court_id,
          booked_by_user_id = actor_user_id,
          player_profile_id = p_player_id,
          start_time = affected_lesson.new_start,
          end_time = affected_lesson.new_end,
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
        lesson_type = coalesce(p_lesson_type, affected_lesson.lesson_type),
        title = coalesce(nullif(btrim(p_title), ''), affected_lesson.title),
        start_time = affected_lesson.new_start,
        end_time = affected_lesson.new_end,
        repeat_rule = case
          when affected_lesson.repeat_rule like 'weekly;%'
            then regexp_replace(
              regexp_replace(affected_lesson.repeat_rule, ';start_time=[^;]*', ';start_time=' || local_start_time::text),
              ';end_time=[^;]*',
              ';end_time=' || local_end_time::text
            )
          else affected_lesson.repeat_rule
        end,
        status = p_status,
        notes = p_notes,
        cancelled_at = null,
        cancelled_by_user_id = null,
        updated_by_user_id = actor_user_id
    where id = affected_lesson.id;
  end loop;
exception
  when exclusion_violation then
    raise exception 'recurrence_conflicts:%', coalesce(conflict_summary, selected_court_name || ' is already booked for one of these lessons.') using errcode = 'P0001';
end;
$$;

revoke all on function public.coachr_update_lesson_series_with_bookings(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text, text
) from public, anon;
grant execute on function public.coachr_update_lesson_series_with_bookings(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text, text
) to authenticated;
