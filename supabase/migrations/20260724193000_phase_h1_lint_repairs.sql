-- Phase 2.2.2H.1: repair hosted migration drift and the five database-lint errors.
-- This migration is forward-only and does not rewrite application data.

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
      court_id, booked_by_user_id, player_profile_id, start_time, end_time,
      status, booking_type, is_public, notes
    )
    values (
      p_court_id, actor_user_id, p_player_id, p_start_time, p_end_time,
      'confirmed', 'lesson', false,
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

create or replace function public.coachr_create_weekly_lesson_series(
  p_venue_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_day_of_week integer,
  p_start_time time,
  p_end_time time,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  series_id uuid := gen_random_uuid();
  selected_court_name text;
  selected_player record;
  generated_occurrence record;
  occurrence_count integer;
  conflict_summary text;
  new_booking_id uuid;
  metadata text;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_venue_id is null
    or p_coach_id is null
    or p_player_id is null
    or p_court_id is null
    or p_start_date is null
    or p_end_date is null
    or p_day_of_week is null
    or p_start_time is null
    or p_end_time is null
  then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if p_day_of_week < 1 or p_day_of_week > 7 or p_end_date < p_start_date or p_end_date > (p_start_date + interval '12 months')::date then
    raise exception 'recurrence_range' using errcode = 'P0001';
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

  with occurrences as (
    select
      occurrence_date::date as occurrence_date,
      public.coachr_local_datetime(occurrence_date::date, p_start_time) as start_at,
      public.coachr_local_datetime(occurrence_date::date, p_end_time) as end_at
    from generate_series(p_start_date, p_end_date, interval '1 day') occurrence_date
    where extract(isodow from occurrence_date)::int = p_day_of_week
  )
  select count(*) into occurrence_count
  from occurrences;

  if occurrence_count = 0 then
    raise exception 'recurrence_range' using errcode = 'P0001';
  end if;

  with occurrences as (
    select
      occurrence_date::date as occurrence_date,
      public.coachr_local_datetime(occurrence_date::date, p_start_time) as start_at,
      public.coachr_local_datetime(occurrence_date::date, p_end_time) as end_at
    from generate_series(p_start_date, p_end_date, interval '1 day') occurrence_date
    where extract(isodow from occurrence_date)::int = p_day_of_week
  ),
  conflicts as (
    select
      to_char(series_occurrence.occurrence_date, 'Dy DD Mon') || ': ' || selected_court_name || ' is already booked.' as message
    from occurrences series_occurrence
    where exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = p_court_id
        and booking.status = 'confirmed'
        and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(series_occurrence.start_at, series_occurrence.end_at, '[)')
    )
    union all
    select
      to_char(series_occurrence.occurrence_date, 'Dy DD Mon') || ': Coach already has another lesson.' as message
    from occurrences series_occurrence
    where exists (
      select 1
      from public.coach_lessons lesson
      where lesson.coach_id = p_coach_id
        and lesson.status = 'scheduled'
        and tstzrange(lesson.start_time, lesson.end_time, '[)') && tstzrange(series_occurrence.start_at, series_occurrence.end_at, '[)')
    )
  )
  select string_agg(message, '; ' order by message) into conflict_summary
  from conflicts;

  if conflict_summary is not null then
    raise exception 'recurrence_conflicts:%', conflict_summary using errcode = 'P0001';
  end if;

  metadata := concat(
    'weekly;start=', p_start_date::text,
    ';end=', p_end_date::text,
    ';dow=', p_day_of_week::text,
    ';start_time=', p_start_time::text,
    ';end_time=', p_end_time::text
  );

  for generated_occurrence in
    select
      occurrence_date::date as occurrence_date,
      public.coachr_local_datetime(occurrence_date::date, p_start_time) as start_at,
      public.coachr_local_datetime(occurrence_date::date, p_end_time) as end_at
    from generate_series(p_start_date, p_end_date, interval '1 day') occurrence_date
    where extract(isodow from occurrence_date)::int = p_day_of_week
    order by occurrence_date
  loop
    insert into public.court_bookings (
      court_id, booked_by_user_id, player_profile_id, start_time, end_time,
      status, booking_type, is_public, notes
    )
    values (
      p_court_id, actor_user_id, p_player_id,
      generated_occurrence.start_at, generated_occurrence.end_at,
      'confirmed', 'lesson', false,
      concat('Coach Lesson', case when length(btrim(coalesce(p_title, ''))) > 0 then ': ' || btrim(p_title) else '' end)
    )
    returning id into new_booking_id;

    insert into public.coach_lessons (
      venue_id, coach_id, player_id, junior_profile_id, parent_id, court_id,
      court_booking_id, lesson_type, title, start_time, end_time, repeat_rule,
      recurring_group_id, status, attendance_status, feedback_status, notes,
      created_by_user_id, updated_by_user_id
    )
    values (
      p_venue_id, p_coach_id, p_player_id,
      case when selected_player.is_junior then p_player_id else null end,
      selected_player.parent_profile_id, p_court_id, new_booking_id,
      coalesce(p_lesson_type, 'private'::public.coach_lesson_type),
      coalesce(nullif(btrim(p_title), ''), 'Coaching lesson'),
      generated_occurrence.start_at, generated_occurrence.end_at, metadata,
      series_id, 'scheduled', 'not_marked', 'not_started', p_notes,
      actor_user_id, actor_user_id
    );
  end loop;

  return series_id;
exception
  when exclusion_violation then
    raise exception 'recurrence_conflicts:%', coalesce(conflict_summary, selected_court_name || ' is already booked for one of these lessons.') using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_request_existing_player_connection(
  p_venue_id uuid,
  p_player_profile_id uuid,
  p_coach_profile_id uuid default null,
  p_proposal jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  player_record public.profiles%rowtype;
  parent_record public.profiles%rowtype;
  existing_token uuid;
  invite_token uuid;
  requested_invitation_kind public.organisation_invitation_kind;
  invited_email text;
  invited_name text;
begin
  if actor_user_id is null
    or not public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_proposal, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into player_record
  from public.profiles profile
  where profile.id = p_player_profile_id;

  if player_record.id is null then
    raise exception 'invalid_player' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.organisation_player_links link
    where link.venue_id = p_venue_id
      and link.player_profile_id = p_player_profile_id
      and link.status = 'active'
  ) then
    raise exception 'already_connected' using errcode = 'P0001';
  end if;

  if p_coach_profile_id is not null and not exists (
    select 1 from public.organisation_memberships membership
    where membership.venue_id = p_venue_id
      and membership.profile_id = p_coach_profile_id
      and membership.role in ('head_coach', 'coach', 'assistant_coach')
      and membership.status = 'active'
  ) then
    raise exception 'invalid_coach' using errcode = 'P0001';
  end if;

  if player_record.is_junior then
    select * into parent_record
    from public.profiles profile
    where profile.id = player_record.parent_profile_id
      and profile.is_junior = false;

    if parent_record.id is null or nullif(btrim(coalesce(parent_record.email, '')), '') is null then
      raise exception 'parent_contact_missing' using errcode = 'P0001';
    end if;

    requested_invitation_kind := 'player_junior';
    invited_email := lower(parent_record.email);
    invited_name := concat_ws(' ', parent_record.first_name, parent_record.last_name);
  else
    if nullif(btrim(coalesce(player_record.email, '')), '') is null then
      raise exception 'player_contact_missing' using errcode = 'P0001';
    end if;

    requested_invitation_kind := 'player';
    invited_email := lower(player_record.email);
    invited_name := concat_ws(' ', player_record.first_name, player_record.last_name);
  end if;

  select invitation.token into existing_token
  from public.organisation_invitations invitation
  where invitation.venue_id = p_venue_id
    and invitation.invitation_kind = requested_invitation_kind
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and (
      invitation.target_profile_id = p_player_profile_id
      or invitation.target_junior_profile_id = p_player_profile_id
    )
  order by invitation.created_at desc
  limit 1;

  if existing_token is not null then
    return existing_token;
  end if;

  insert into public.organisation_invitations (
    venue_id, invitation_kind, invited_email, invited_name, intended_role,
    invited_by_user_id, target_profile_id, target_junior_profile_id,
    parent_profile_id, metadata
  ) values (
    p_venue_id,
    requested_invitation_kind,
    invited_email,
    invited_name,
    'viewer',
    actor_user_id,
    case when player_record.is_junior then null else player_record.id end,
    case when player_record.is_junior then player_record.id else null end,
    case when player_record.is_junior then parent_record.id else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'coachProfileId', p_coach_profile_id,
      'playerFirstName', player_record.first_name,
      'playerLastName', player_record.last_name,
      'proposal', case when coalesce(p_proposal, '{}'::jsonb) = '{}'::jsonb then null else p_proposal end,
      'connectionSource', 'controlled_search'
    ))
  ) returning token into invite_token;

  return invite_token;
end;
$$;

-- The legacy implementation is revoked, has no callers and has no database dependants.
drop function public.accept_adult_player_invitation_v1(uuid, uuid);

revoke all on function public.coachr_update_lesson_with_booking(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text
) from public, anon;
revoke all on function public.coachr_cancel_lesson_with_booking(
  uuid, public.coach_lesson_status, text
) from public, anon;
revoke all on function public.coachr_create_weekly_lesson_series(
  uuid, uuid, uuid, uuid, public.coach_lesson_type, text, date, date, integer,
  time, time, text
) from public, anon;
revoke all on function public.coachr_update_lesson_series_with_bookings(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text, text
) from public, anon;
revoke all on function public.coachr_cancel_lesson_series_with_booking(
  uuid, public.coach_lesson_status, text, text
) from public, anon;
revoke all on function public.coachr_request_existing_player_connection(
  uuid, uuid, uuid, jsonb
) from public, anon;

grant execute on function public.coachr_update_lesson_with_booking(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text
) to authenticated;
grant execute on function public.coachr_cancel_lesson_with_booking(
  uuid, public.coach_lesson_status, text
) to authenticated;
grant execute on function public.coachr_create_weekly_lesson_series(
  uuid, uuid, uuid, uuid, public.coach_lesson_type, text, date, date, integer,
  time, time, text
) to authenticated;
grant execute on function public.coachr_update_lesson_series_with_bookings(
  uuid, uuid, uuid, public.coach_lesson_type, text, timestamptz, timestamptz,
  public.coach_lesson_status, text, text
) to authenticated;
grant execute on function public.coachr_cancel_lesson_series_with_booking(
  uuid, public.coach_lesson_status, text, text
) to authenticated;
grant execute on function public.coachr_request_existing_player_connection(
  uuid, uuid, uuid, jsonb
) to authenticated;
