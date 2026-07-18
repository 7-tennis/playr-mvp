-- Phase 1.13: confirmed cancellation, approval-based moves and privacy-safe
-- make-up requests. Court occupancy remains owned by court_bookings.

alter table public.coach_session_occurrences
  add column if not exists replacement_for_occurrence_id uuid
    references public.coach_session_occurrences(id) on delete restrict;

alter table public.coach_session_occurrences
  drop constraint if exists coach_session_occurrences_unique;

create unique index if not exists coach_session_occurrences_series_date_unique
on public.coach_session_occurrences(session_id, occurrence_date)
where replacement_for_occurrence_id is null;

create index if not exists coach_session_occurrences_replacement_idx
on public.coach_session_occurrences(replacement_for_occurrence_id)
where replacement_for_occurrence_id is not null;

create table public.coach_session_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  occurrence_id uuid not null references public.coach_session_occurrences(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  request_origin text not null,
  player_profile_id uuid not null references public.profiles(id) on delete restrict,
  responder_user_id uuid not null references auth.users(id) on delete restrict,
  coach_profile_id uuid not null references public.profiles(id) on delete restrict,
  current_start_time timestamptz not null,
  current_end_time timestamptz not null,
  current_venue_id uuid not null references public.venues(id) on delete restrict,
  current_court_ids uuid[] not null default array[]::uuid[],
  current_court_names text[] not null default array[]::text[],
  current_booking_ids uuid[] not null default array[]::uuid[],
  proposed_start_time timestamptz not null,
  proposed_end_time timestamptz not null,
  proposed_venue_id uuid not null references public.venues(id) on delete restrict,
  proposed_court_id uuid not null references public.courts(id) on delete restrict,
  status text not null,
  message text,
  response_message text,
  responded_by_user_id uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  approval_error text,
  replacement_occurrence_id uuid references public.coach_session_occurrences(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_session_reschedule_requests_origin_valid check (
    request_origin in ('coach_initiated', 'player_initiated', 'parent_initiated')
  ),
  constraint coach_session_reschedule_requests_status_valid check (
    status in (
      'draft', 'pending_parent', 'pending_player', 'pending_coach',
      'approved', 'declined', 'expired', 'superseded', 'failed'
    )
  ),
  constraint coach_session_reschedule_requests_current_time_valid check (current_end_time > current_start_time),
  constraint coach_session_reschedule_requests_proposed_time_valid check (proposed_end_time > proposed_start_time),
  constraint coach_session_reschedule_requests_message_valid check (
    message is null or length(message) <= 1000
  ),
  constraint coach_session_reschedule_requests_response_valid check (
    response_message is null or length(response_message) <= 1000
  )
);

create index coach_session_reschedule_requests_venue_status_idx
on public.coach_session_reschedule_requests(venue_id, status, created_at desc);

create index coach_session_reschedule_requests_player_status_idx
on public.coach_session_reschedule_requests(player_profile_id, status, created_at desc);

create index coach_session_reschedule_requests_coach_status_idx
on public.coach_session_reschedule_requests(coach_profile_id, status, created_at desc);

create unique index coach_session_reschedule_requests_one_pending_idx
on public.coach_session_reschedule_requests(occurrence_id)
where status in ('pending_parent', 'pending_player', 'pending_coach');

alter table public.coach_session_occurrences
  add column if not exists reschedule_request_id uuid
    references public.coach_session_reschedule_requests(id) on delete set null;

create unique index if not exists coach_session_occurrences_request_unique
on public.coach_session_occurrences(reschedule_request_id)
where reschedule_request_id is not null;

create trigger coach_session_reschedule_requests_set_updated_at
before update on public.coach_session_reschedule_requests
for each row execute function public.set_updated_at();

alter table public.coach_session_reschedule_requests enable row level security;

grant select on public.coach_session_reschedule_requests to authenticated;

create or replace function public.coachr_can_read_reschedule_request(
  p_request_id uuid,
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
      from public.coach_session_reschedule_requests request
      join public.coach_session_occurrences occurrence on occurrence.id = request.occurrence_id
      where request.id = p_request_id
        and (
          request.requested_by_user_id = p_user_id
          or request.responder_user_id = p_user_id
          or public.coachr_can_manage_session(occurrence.session_id, p_user_id)
        )
    );
$$;

revoke all on function public.coachr_can_read_reschedule_request(uuid, uuid) from public, anon;
grant execute on function public.coachr_can_read_reschedule_request(uuid, uuid) to authenticated;

create policy "Authorised users can read session reschedule requests"
on public.coach_session_reschedule_requests
for select
to authenticated
using (public.coachr_can_read_reschedule_request(id));

create or replace function public.coachr_session_available_options(
  p_occurrence_id uuid,
  p_date date,
  p_start_time timestamptz default null,
  p_duration_minutes integer default null
)
returns table (
  court_id uuid,
  court_name text,
  venue_id uuid,
  venue_name text,
  start_time timestamptz,
  end_time timestamptz,
  availability_state text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
  resolved_duration integer;
  coach_access boolean;
  player_access boolean;
begin
  if actor_user_id is null or p_date is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select * into target_occurrence
  from public.coach_session_occurrences
  where id = p_occurrence_id;

  if target_occurrence.id is null then
    raise exception 'invalid_session' using errcode = 'P0001';
  end if;

  select * into target_session
  from public.coach_sessions
  where id = target_occurrence.session_id;

  coach_access := public.coachr_can_manage_session(target_session.id, actor_user_id);
  select target_session.session_type = 'private' and exists (
    select 1
    from public.coach_session_occurrence_participants participant
    where participant.occurrence_id = target_occurrence.id
      and participant.status = 'active'
      and public.can_manage_profile(participant.player_profile_id, actor_user_id)
  ) into player_access;

  if not coach_access and not player_access then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if target_session.location_type <> 'managed_court' then
    raise exception 'managed_court_required' using errcode = 'P0001';
  end if;
  if target_occurrence.status not in ('scheduled', 'cancelled', 'rain', 'sick') then
    raise exception 'session_history_protected' using errcode = 'P0001';
  end if;

  resolved_duration := coalesce(p_duration_minutes, target_session.duration_minutes);
  if resolved_duration < 5 or resolved_duration > 480 then
    raise exception 'duration' using errcode = 'P0001';
  end if;

  return query
  with authorised_courts as (
    select
      court.id,
      court.name,
      owner.id as owner_id,
      owner.name as owner_name,
      coalesce(settings.slot_minutes, 30) as slot_minutes,
      coalesce(settings.opening_time, '06:00'::time) as opening_time,
      coalesce(settings.closing_time, '21:00'::time) as closing_time,
      greatest(1, least(90, coalesce(settings.advance_booking_days, 14))) as advance_days
    from public.courts court
    join public.venues owner on owner.id = court.venue_id and owner.status = 'active'
    left join public.organisation_booking_settings settings on settings.venue_id = owner.id
    where court.status = 'active'
      and (
        court.venue_id = target_session.venue_id
        or exists (
          select 1
          from public.organisation_court_access access
          where access.owner_venue_id = court.venue_id
            and access.approved_venue_id = target_session.venue_id
            and (access.court_id is null or access.court_id = court.id)
            and access.status = 'active'
            and (access.valid_from is null or access.valid_from <= p_date)
            and (access.valid_until is null or access.valid_until >= p_date)
        )
      )
  ), candidates as (
    select
      court.*,
      slot.slot_start,
      slot.slot_start + make_interval(mins => resolved_duration) as slot_end
    from authorised_courts court
    cross join lateral (
      select p_start_time as slot_start
      where p_start_time is not null
      union all
      select generated.slot_start
      from generate_series(
        public.coachr_local_datetime(p_date, court.opening_time),
        public.coachr_local_datetime(p_date, court.closing_time) - make_interval(mins => resolved_duration),
        make_interval(mins => court.slot_minutes)
      ) generated(slot_start)
      where p_start_time is null
    ) slot
    where slot.slot_start is not null
      and (slot.slot_start at time zone 'Africa/Johannesburg')::date = p_date
      and slot.slot_start >= public.coachr_local_datetime(p_date, court.opening_time)
      and slot.slot_start + make_interval(mins => resolved_duration) <= public.coachr_local_datetime(p_date, court.closing_time)
      and slot.slot_start >= now()
      and slot.slot_start < now() + make_interval(days => court.advance_days)
  )
  select distinct
    candidate.id,
    candidate.name,
    candidate.owner_id,
    candidate.owner_name,
    candidate.slot_start,
    candidate.slot_end,
    'available'::text
  from candidates candidate
  where not exists (
      select 1
      from public.court_bookings booking
      where booking.court_id = candidate.id
        and booking.status = 'confirmed'
        and booking.coach_session_occurrence_id is distinct from target_occurrence.id
        and tstzrange(booking.start_time, booking.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.coach_session_occurrence_participants target_player
      join public.coach_session_occurrence_participants other_player
        on other_player.player_profile_id = target_player.player_profile_id
       and other_player.status = 'active'
      join public.coach_session_occurrences other_occurrence
        on other_occurrence.id = other_player.occurrence_id
      where target_player.occurrence_id = target_occurrence.id
        and target_player.status = 'active'
        and other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.coach_session_occurrence_participants target_player
      join public.coach_lessons legacy on legacy.player_id = target_player.player_profile_id
      where target_player.occurrence_id = target_occurrence.id
        and target_player.status = 'active'
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.coach_session_occurrence_participants target_player
      join public.court_bookings player_booking
        on player_booking.player_profile_id = target_player.player_profile_id
      where target_player.occurrence_id = target_occurrence.id
        and target_player.status = 'active'
        and player_booking.status = 'confirmed'
        and player_booking.coach_session_occurrence_id is distinct from target_occurrence.id
        and tstzrange(player_booking.start_time, player_booking.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.coach_session_occurrence_coaches target_coach
      join public.coach_session_occurrence_coaches other_coach
        on other_coach.coach_profile_id = target_coach.coach_profile_id
       and other_coach.status = 'active'
      join public.coach_session_occurrences other_occurrence
        on other_occurrence.id = other_coach.occurrence_id
      where target_coach.occurrence_id = target_occurrence.id
        and target_coach.status = 'active'
        and other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
    and not exists (
      select 1
      from public.coach_session_occurrence_coaches target_coach
      join public.coach_lessons legacy on legacy.coach_id = target_coach.coach_profile_id
      where target_coach.occurrence_id = target_occurrence.id
        and target_coach.status = 'active'
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
  order by candidate.slot_start, candidate.name;
end;
$$;

revoke all on function public.coachr_session_available_options(uuid, date, timestamptz, integer) from public, anon;
grant execute on function public.coachr_session_available_options(uuid, date, timestamptz, integer) to authenticated;

create or replace function public.coachr_create_move_request(
  p_occurrence_id uuid,
  p_proposed_start_time timestamptz,
  p_proposed_end_time timestamptz,
  p_proposed_court_id uuid,
  p_message text default null,
  p_supersedes_request_id uuid default null
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
  target_player record;
  target_coach record;
  proposed_court record;
  request_status text;
  new_request_id uuid;
  current_court_ids uuid[];
  current_court_names text[];
  current_booking_ids uuid[];
begin
  select * into target_occurrence
  from public.coach_session_occurrences
  where id = p_occurrence_id
  for update;
  if actor_user_id is null or target_occurrence.id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  if not public.coachr_can_manage_session(target_session.id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if target_occurrence.status <> 'scheduled'
    and not (
      p_supersedes_request_id is not null
      and target_occurrence.status in ('cancelled', 'rain', 'sick')
    ) then
    raise exception 'session_history_protected' using errcode = 'P0001';
  end if;
  if target_session.location_type <> 'managed_court' then
    raise exception 'managed_court_required' using errcode = 'P0001';
  end if;
  if p_proposed_end_time <= p_proposed_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;
  if (select count(*) from public.coach_session_occurrence_participants participant
      where participant.occurrence_id = target_occurrence.id and participant.status = 'active') <> 1 then
    raise exception 'single_player_request_required' using errcode = 'P0001';
  end if;

  select
    participant.player_profile_id,
    player.is_junior,
    case when player.is_junior then parent.user_id else player.user_id end as owner_user_id
  into target_player
  from public.coach_session_occurrence_participants participant
  join public.profiles player on player.id = participant.player_profile_id
  left join public.profiles parent on parent.id = player.parent_profile_id
  where participant.occurrence_id = target_occurrence.id and participant.status = 'active'
  limit 1;

  select
    coach.coach_profile_id,
    coalesce(membership.user_id, profile.user_id) as coach_user_id
  into target_coach
  from public.coach_session_occurrence_coaches coach
  join public.profiles profile on profile.id = coach.coach_profile_id
  left join public.organisation_memberships membership
    on membership.profile_id = coach.coach_profile_id
   and membership.venue_id = target_session.venue_id
   and membership.status = 'active'
  where coach.occurrence_id = target_occurrence.id and coach.status = 'active'
  order by (coach.role = 'primary') desc
  limit 1;

  if target_player.owner_user_id is null or target_coach.coach_profile_id is null then
    raise exception 'request_recipient_missing' using errcode = 'P0001';
  end if;

  select court.id, court.name, court.venue_id, venue.name as venue_name
  into proposed_court
  from public.courts court
  join public.venues venue on venue.id = court.venue_id
  where court.id = p_proposed_court_id;
  if proposed_court.id is null then
    raise exception 'missing_court' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.coachr_session_available_options(
      target_occurrence.id,
      (p_proposed_start_time at time zone 'Africa/Johannesburg')::date,
      p_proposed_start_time,
      extract(epoch from (p_proposed_end_time - p_proposed_start_time))::integer / 60
    ) option
    where option.court_id = p_proposed_court_id
      and option.start_time = p_proposed_start_time
      and option.end_time = p_proposed_end_time
  ) then
    raise exception 'time_unavailable' using errcode = 'P0001';
  end if;

  if p_supersedes_request_id is not null then
    update public.coach_session_reschedule_requests request
    set status = 'superseded', responded_by_user_id = actor_user_id, responded_at = now(),
        response_message = 'A new time was proposed.'
    where request.id = p_supersedes_request_id
      and request.occurrence_id = target_occurrence.id
      and request.status = 'pending_coach'
      and public.coachr_can_read_reschedule_request(request.id, actor_user_id);
    if not found then
      raise exception 'invalid_request' using errcode = 'P0001';
    end if;
  end if;

  update public.coach_session_reschedule_requests
  set status = 'superseded', responded_by_user_id = actor_user_id, responded_at = now(),
      response_message = 'Replaced by a newer proposal.'
  where occurrence_id = target_occurrence.id
    and status in ('pending_parent', 'pending_player', 'pending_coach');

  select
    coalesce(array_agg(link.court_id order by court.name) filter (where link.court_id is not null), array[]::uuid[]),
    coalesce(array_agg(court.name order by court.name) filter (where court.name is not null), array[]::text[]),
    coalesce(array_agg(link.court_booking_id order by court.name) filter (where link.court_booking_id is not null), array[]::uuid[])
  into current_court_ids, current_court_names, current_booking_ids
  from public.coach_session_occurrence_courts link
  left join public.courts court on court.id = link.court_id
  where link.occurrence_id = target_occurrence.id;

  request_status := case when target_player.is_junior then 'pending_parent' else 'pending_player' end;
  insert into public.coach_session_reschedule_requests (
    venue_id, occurrence_id, requested_by_user_id, request_origin,
    player_profile_id, responder_user_id, coach_profile_id,
    current_start_time, current_end_time, current_venue_id,
    current_court_ids, current_court_names, current_booking_ids,
    proposed_start_time, proposed_end_time, proposed_venue_id,
    proposed_court_id, status, message
  ) values (
    target_session.venue_id, target_occurrence.id, actor_user_id, 'coach_initiated',
    target_player.player_profile_id, target_player.owner_user_id, target_coach.coach_profile_id,
    target_occurrence.start_time, target_occurrence.end_time, target_session.venue_id,
    current_court_ids, current_court_names, current_booking_ids,
    p_proposed_start_time, p_proposed_end_time, proposed_court.venue_id,
    proposed_court.id, request_status, nullif(btrim(coalesce(p_message, '')), '')
  ) returning id into new_request_id;

  perform public.create_system_notification(
    target_user_id => target_player.owner_user_id,
    notification_type => 'lesson_move_requested',
    notification_title => 'Move requested',
    notification_message => case
      when target_occurrence.status = 'scheduled' then 'A coach has proposed a new lesson time. The current session remains booked.'
      else 'A coach has proposed another lesson time. A court will be booked after approval.'
    end,
    notification_href => '/dashboard/players/' || target_player.player_profile_id::text || '#lesson-requests',
    notification_actor_user_id => actor_user_id,
    notification_profile_id => case when target_player.is_junior then null else target_player.player_profile_id end,
    notification_junior_profile_id => case when target_player.is_junior then target_player.player_profile_id else null end,
    notification_metadata => jsonb_build_object('requestId', new_request_id, 'occurrenceId', target_occurrence.id),
    notification_dedupe_key => 'session-move-request:' || new_request_id::text
  );

  return new_request_id;
end;
$$;

revoke all on function public.coachr_create_move_request(uuid, timestamptz, timestamptz, uuid, text, uuid) from public, anon;
grant execute on function public.coachr_create_move_request(uuid, timestamptz, timestamptz, uuid, text, uuid) to authenticated;

create or replace function public.coachr_create_makeup_request(
  p_occurrence_id uuid,
  p_proposed_start_time timestamptz,
  p_proposed_end_time timestamptz,
  p_proposed_court_id uuid,
  p_message text default null
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
  target_player record;
  target_coach record;
  proposed_court record;
  new_request_id uuid;
  current_court_ids uuid[];
  current_court_names text[];
  current_booking_ids uuid[];
begin
  select * into target_occurrence
  from public.coach_session_occurrences
  where id = p_occurrence_id
  for update;
  if actor_user_id is null or target_occurrence.id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  if target_session.session_type <> 'private'
    or target_session.location_type <> 'managed_court'
    or target_occurrence.status not in ('cancelled', 'rain', 'sick') then
    raise exception 'makeup_not_available' using errcode = 'P0001';
  end if;

  select
    participant.player_profile_id,
    player.is_junior,
    case when player.is_junior then parent.user_id else player.user_id end as owner_user_id
  into target_player
  from public.coach_session_occurrence_participants participant
  join public.profiles player on player.id = participant.player_profile_id
  left join public.profiles parent on parent.id = player.parent_profile_id
  where participant.occurrence_id = target_occurrence.id and participant.status = 'active'
  limit 1;
  if target_player.player_profile_id is null
    or target_player.owner_user_id <> actor_user_id
    or not public.can_manage_profile(target_player.player_profile_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select
    coach.coach_profile_id,
    coalesce(membership.user_id, profile.user_id) as coach_user_id
  into target_coach
  from public.coach_session_occurrence_coaches coach
  join public.profiles profile on profile.id = coach.coach_profile_id
  left join public.organisation_memberships membership
    on membership.profile_id = coach.coach_profile_id
   and membership.venue_id = target_session.venue_id
   and membership.status = 'active'
  where coach.occurrence_id = target_occurrence.id and coach.status = 'active'
  order by (coach.role = 'primary') desc
  limit 1;
  if target_coach.coach_user_id is null then
    raise exception 'request_recipient_missing' using errcode = 'P0001';
  end if;

  select court.id, court.name, court.venue_id
  into proposed_court
  from public.courts court
  where court.id = p_proposed_court_id;
  if proposed_court.id is null then
    raise exception 'missing_court' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.coachr_session_available_options(
      target_occurrence.id,
      (p_proposed_start_time at time zone 'Africa/Johannesburg')::date,
      p_proposed_start_time,
      extract(epoch from (p_proposed_end_time - p_proposed_start_time))::integer / 60
    ) option
    where option.court_id = p_proposed_court_id
      and option.start_time = p_proposed_start_time
      and option.end_time = p_proposed_end_time
  ) then
    raise exception 'time_unavailable' using errcode = 'P0001';
  end if;

  update public.coach_session_reschedule_requests
  set status = 'superseded', responded_by_user_id = actor_user_id, responded_at = now(),
      response_message = 'Replaced by a newer requested time.'
  where occurrence_id = target_occurrence.id
    and status in ('pending_parent', 'pending_player', 'pending_coach');

  select
    coalesce(array_agg(link.court_id order by court.name) filter (where link.court_id is not null), array[]::uuid[]),
    coalesce(array_agg(court.name order by court.name) filter (where court.name is not null), array[]::text[]),
    coalesce(array_agg(link.court_booking_id order by court.name) filter (where link.court_booking_id is not null), array[]::uuid[])
  into current_court_ids, current_court_names, current_booking_ids
  from public.coach_session_occurrence_courts link
  left join public.courts court on court.id = link.court_id
  where link.occurrence_id = target_occurrence.id;

  insert into public.coach_session_reschedule_requests (
    venue_id, occurrence_id, requested_by_user_id, request_origin,
    player_profile_id, responder_user_id, coach_profile_id,
    current_start_time, current_end_time, current_venue_id,
    current_court_ids, current_court_names, current_booking_ids,
    proposed_start_time, proposed_end_time, proposed_venue_id,
    proposed_court_id, status, message
  ) values (
    target_session.venue_id, target_occurrence.id, actor_user_id,
    case when target_player.is_junior then 'parent_initiated' else 'player_initiated' end,
    target_player.player_profile_id, target_coach.coach_user_id, target_coach.coach_profile_id,
    target_occurrence.start_time, target_occurrence.end_time, target_session.venue_id,
    current_court_ids, current_court_names, current_booking_ids,
    p_proposed_start_time, p_proposed_end_time, proposed_court.venue_id,
    proposed_court.id, 'pending_coach', nullif(btrim(coalesce(p_message, '')), '')
  ) returning id into new_request_id;

  perform public.create_system_notification(
    target_user_id => target_coach.coach_user_id,
    notification_type => 'lesson_time_requested',
    notification_title => 'Lesson time requested',
    notification_message => 'A player has requested a new lesson time. Approve it from CoachR.',
    notification_href => '/dashboard/coachr/schedule?request=' || new_request_id::text || '#session-requests',
    notification_actor_user_id => actor_user_id,
    notification_profile_id => case when target_player.is_junior then null else target_player.player_profile_id end,
    notification_junior_profile_id => case when target_player.is_junior then target_player.player_profile_id else null end,
    notification_metadata => jsonb_build_object('requestId', new_request_id, 'occurrenceId', target_occurrence.id),
    notification_dedupe_key => 'session-time-request:' || new_request_id::text
  );

  return new_request_id;
end;
$$;

revoke all on function public.coachr_create_makeup_request(uuid, timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.coachr_create_makeup_request(uuid, timestamptz, timestamptz, uuid, text) to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.coachr_apply_approved_session_time(
  p_occurrence_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_court_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_create_replacement boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
  selected_court record;
  selected_player record;
  selected_coach record;
  applied_occurrence_id uuid;
  retained_booking_id uuid;
  new_booking_id uuid;
begin
  select * into target_occurrence
  from public.coach_session_occurrences
  where id = p_occurrence_id
  for update;
  if target_occurrence.id is null then
    raise exception 'invalid_session' using errcode = 'P0001';
  end if;
  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  if p_end_time <= p_start_time then
    raise exception 'time_order' using errcode = 'P0001';
  end if;
  if (p_create_replacement and target_occurrence.status not in ('cancelled', 'rain', 'sick'))
    or (not p_create_replacement and target_occurrence.status <> 'scheduled') then
    raise exception 'session_history_protected' using errcode = 'P0001';
  end if;

  select court.id, court.name, court.venue_id
  into selected_court
  from public.courts court
  where court.id = p_court_id
    and court.status = 'active'
    and (
      court.venue_id = target_session.venue_id
      or exists (
        select 1 from public.organisation_court_access access
        where access.owner_venue_id = court.venue_id
          and access.approved_venue_id = target_session.venue_id
          and (access.court_id is null or access.court_id = court.id)
          and access.status = 'active'
          and (access.valid_from is null or access.valid_from <= (p_start_time at time zone 'Africa/Johannesburg')::date)
          and (access.valid_until is null or access.valid_until >= (p_start_time at time zone 'Africa/Johannesburg')::date)
      )
    );
  if selected_court.id is null then
    raise exception 'court_access' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('session-request:' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('court:' || p_court_id::text, 0));

  for selected_player in
    select participant.player_profile_id, profile.first_name, profile.last_name
    from public.coach_session_occurrence_participants participant
    join public.profiles profile on profile.id = participant.player_profile_id
    where participant.occurrence_id = target_occurrence.id and participant.status = 'active'
  loop
    perform pg_advisory_xact_lock(hashtextextended('player:' || selected_player.player_profile_id::text, 0));
    if exists (
      select 1
      from public.coach_session_occurrences other_occurrence
      join public.coach_session_occurrence_participants other_player
        on other_player.occurrence_id = other_occurrence.id
       and other_player.player_profile_id = selected_player.player_profile_id
       and other_player.status = 'active'
      where other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
          && tstzrange(p_start_time, p_end_time, '[)')
    ) or exists (
      select 1 from public.coach_lessons legacy
      where legacy.player_id = selected_player.player_profile_id
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)')
          && tstzrange(p_start_time, p_end_time, '[)')
    ) or exists (
      select 1 from public.court_bookings player_booking
      where player_booking.player_profile_id = selected_player.player_profile_id
        and player_booking.status = 'confirmed'
        and player_booking.coach_session_occurrence_id is distinct from target_occurrence.id
        and tstzrange(player_booking.start_time, player_booking.end_time, '[)')
          && tstzrange(p_start_time, p_end_time, '[)')
    ) then
      raise exception 'player_conflict:%', concat_ws(' ', selected_player.first_name, selected_player.last_name) using errcode = 'P0001';
    end if;
  end loop;

  for selected_coach in
    select occurrence_coach.coach_profile_id, profile.first_name, profile.last_name
    from public.coach_session_occurrence_coaches occurrence_coach
    join public.profiles profile on profile.id = occurrence_coach.coach_profile_id
    where occurrence_coach.occurrence_id = target_occurrence.id and occurrence_coach.status = 'active'
  loop
    perform pg_advisory_xact_lock(hashtextextended('coach:' || selected_coach.coach_profile_id::text, 0));
    if exists (
      select 1
      from public.coach_session_occurrences other_occurrence
      join public.coach_session_occurrence_coaches other_coach
        on other_coach.occurrence_id = other_occurrence.id
       and other_coach.coach_profile_id = selected_coach.coach_profile_id
       and other_coach.status = 'active'
      where other_occurrence.id <> target_occurrence.id
        and other_occurrence.status = 'scheduled'
        and tstzrange(other_occurrence.start_time, other_occurrence.end_time, '[)')
          && tstzrange(p_start_time, p_end_time, '[)')
    ) or exists (
      select 1 from public.coach_lessons legacy
      where legacy.coach_id = selected_coach.coach_profile_id
        and legacy.status not in ('cancelled', 'rain', 'sick')
        and tstzrange(legacy.start_time, legacy.end_time, '[)')
          && tstzrange(p_start_time, p_end_time, '[)')
    ) then
      raise exception 'coach_conflict:%', concat_ws(' ', selected_coach.first_name, selected_coach.last_name) using errcode = 'P0001';
    end if;
  end loop;

  if exists (
    select 1 from public.court_bookings booking
    where booking.court_id = p_court_id
      and booking.status = 'confirmed'
      and booking.coach_session_occurrence_id is distinct from target_occurrence.id
      and tstzrange(booking.start_time, booking.end_time, '[)')
        && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'court_conflict:%', selected_court.name using errcode = 'P0001';
  end if;

  if p_create_replacement then
    insert into public.coach_session_occurrences (
      session_id, occurrence_date, start_time, end_time, status,
      replacement_for_occurrence_id, reschedule_request_id
    ) values (
      target_session.id,
      (p_start_time at time zone 'Africa/Johannesburg')::date,
      p_start_time, p_end_time, 'scheduled', target_occurrence.id, p_request_id
    ) returning id into applied_occurrence_id;

    insert into public.court_bookings (
      court_id, booked_by_user_id, player_profile_id, coach_profile_id,
      start_time, end_time, status, booking_type, is_public, notes,
      booking_organisation_id, owner_organisation_id, booking_purpose,
      source_product, coach_session_occurrence_id
    ) values (
      p_court_id, coalesce(target_session.created_by_user_id, p_actor_user_id), null,
      target_session.primary_coach_id, p_start_time, p_end_time, 'confirmed',
      'lesson', false, 'Coach Session: ' || target_session.name,
      target_session.venue_id, selected_court.venue_id, 'coaching_session',
      'coachr', applied_occurrence_id
    ) returning id into new_booking_id;

    insert into public.coach_session_occurrence_courts (occurrence_id, court_id, court_booking_id)
    values (applied_occurrence_id, p_court_id, new_booking_id);
  else
    applied_occurrence_id := target_occurrence.id;
    select link.court_booking_id into retained_booking_id
    from public.coach_session_occurrence_courts link
    join public.court_bookings booking on booking.id = link.court_booking_id
    where link.occurrence_id = target_occurrence.id
      and link.court_id = p_court_id
      and booking.status = 'confirmed'
    limit 1;

    if retained_booking_id is null then
      insert into public.court_bookings (
        court_id, booked_by_user_id, player_profile_id, coach_profile_id,
        start_time, end_time, status, booking_type, is_public, notes,
        booking_organisation_id, owner_organisation_id, booking_purpose,
        source_product, coach_session_occurrence_id
      ) values (
        p_court_id, coalesce(target_session.created_by_user_id, p_actor_user_id), null,
        target_session.primary_coach_id, p_start_time, p_end_time, 'confirmed',
        'lesson', false, 'Coach Session: ' || target_session.name,
        target_session.venue_id, selected_court.venue_id, 'coaching_session',
        'coachr', target_occurrence.id
      ) returning id into retained_booking_id;

      insert into public.coach_session_occurrence_courts (occurrence_id, court_id, court_booking_id)
      values (target_occurrence.id, p_court_id, retained_booking_id);
    else
      update public.court_bookings
      set start_time = p_start_time, end_time = p_end_time,
          status = 'confirmed', cancelled_at = null, cancelled_by_user_id = null
      where id = retained_booking_id;
    end if;

    update public.coach_session_occurrences
    set occurrence_date = (p_start_time at time zone 'Africa/Johannesburg')::date,
        start_time = p_start_time,
        end_time = p_end_time,
        reschedule_request_id = p_request_id
    where id = target_occurrence.id;

    update public.court_bookings booking
    set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = p_actor_user_id
    where booking.coach_session_occurrence_id = target_occurrence.id
      and booking.id <> retained_booking_id
      and booking.status = 'confirmed';

    delete from public.coach_session_occurrence_courts link
    where link.occurrence_id = target_occurrence.id
      and link.court_booking_id <> retained_booking_id;
  end if;

  return applied_occurrence_id;
exception
  when exclusion_violation then
    raise exception 'court_conflict:Selected court' using errcode = 'P0001';
  when unique_violation then
    raise exception 'occurrence_conflict' using errcode = 'P0001';
end;
$$;

revoke all on function private.coachr_apply_approved_session_time(uuid, timestamptz, timestamptz, uuid, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.coachr_respond_to_session_request(
  p_request_id uuid,
  p_response text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_request public.coach_session_reschedule_requests%rowtype;
  target_occurrence public.coach_session_occurrences%rowtype;
  target_session public.coach_sessions%rowtype;
  coach_user_id uuid;
  counterpart_user_id uuid;
  applied_occurrence_id uuid;
  approval_failure text;
  is_authorised boolean := false;
begin
  if actor_user_id is null or p_response not in ('approve', 'decline') then
    raise exception 'access' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('session-request:' || p_request_id::text, 0));
  select * into target_request
  from public.coach_session_reschedule_requests
  where id = p_request_id
  for update;
  if target_request.id is null
    or target_request.status not in ('pending_parent', 'pending_player', 'pending_coach') then
    raise exception 'request_not_pending' using errcode = 'P0001';
  end if;

  select * into target_occurrence from public.coach_session_occurrences where id = target_request.occurrence_id;
  select * into target_session from public.coach_sessions where id = target_occurrence.session_id;
  is_authorised := target_request.responder_user_id = actor_user_id;
  if target_request.status = 'pending_coach' then
    is_authorised := is_authorised or public.coachr_can_manage_session(target_session.id, actor_user_id);
  end if;
  if not is_authorised then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select coalesce(membership.user_id, coach.user_id) into coach_user_id
  from public.profiles coach
  left join public.organisation_memberships membership
    on membership.profile_id = coach.id
   and membership.venue_id = target_request.venue_id
   and membership.status = 'active'
  where coach.id = target_request.coach_profile_id
  limit 1;

  if p_response = 'decline' then
    update public.coach_session_reschedule_requests
    set status = 'declined', response_message = nullif(btrim(coalesce(p_message, '')), ''),
        responded_by_user_id = actor_user_id, responded_at = now()
    where id = target_request.id;

    counterpart_user_id := case
      when target_request.status = 'pending_coach' then target_request.requested_by_user_id
      else coach_user_id
    end;
    perform public.create_system_notification(
      target_user_id => counterpart_user_id,
      notification_type => 'lesson_move_declined',
      notification_title => 'Lesson request declined',
      notification_message => case
        when target_request.status = 'pending_coach' then 'The coach could not confirm the requested lesson time.'
        else 'The proposed lesson move was declined. The original session remains booked.'
      end,
      notification_href => case
        when target_request.status = 'pending_coach' then '/dashboard/players/' || target_request.player_profile_id::text || '#lesson-requests'
        else '/dashboard/coachr/schedule?request=' || target_request.id::text || '#session-requests'
      end,
      notification_actor_user_id => actor_user_id,
      notification_metadata => jsonb_build_object('requestId', target_request.id, 'occurrenceId', target_request.occurrence_id),
      notification_dedupe_key => 'session-request-declined:' || target_request.id::text
    );
    return jsonb_build_object('status', 'declined', 'occurrenceId', target_request.occurrence_id);
  end if;

  if not exists (
    select 1 from public.coachr_session_available_options(
      target_request.occurrence_id,
      (target_request.proposed_start_time at time zone 'Africa/Johannesburg')::date,
      target_request.proposed_start_time,
      extract(epoch from (target_request.proposed_end_time - target_request.proposed_start_time))::integer / 60
    ) option
    where option.court_id = target_request.proposed_court_id
      and option.start_time = target_request.proposed_start_time
      and option.end_time = target_request.proposed_end_time
  ) then
    update public.coach_session_reschedule_requests
    set status = 'failed', approval_error = 'time_unavailable',
        responded_by_user_id = actor_user_id, responded_at = now()
    where id = target_request.id;
    return jsonb_build_object('status', 'failed', 'error', 'time_unavailable');
  end if;

  begin
    applied_occurrence_id := private.coachr_apply_approved_session_time(
      target_request.occurrence_id,
      target_request.proposed_start_time,
      target_request.proposed_end_time,
      target_request.proposed_court_id,
      actor_user_id,
      target_request.id,
      target_occurrence.status in ('cancelled', 'rain', 'sick')
    );
  exception when others then
    approval_failure := case
      when sqlerrm like 'court_conflict:%' then 'time_unavailable'
      when sqlerrm like 'coach_conflict:%' then 'coach_conflict'
      when sqlerrm like 'player_conflict:%' then 'player_conflict'
      else 'approval_failed'
    end;
    update public.coach_session_reschedule_requests
    set status = 'failed', approval_error = approval_failure,
        responded_by_user_id = actor_user_id, responded_at = now()
    where id = target_request.id;
    return jsonb_build_object('status', 'failed', 'error', approval_failure);
  end;

  update public.coach_session_reschedule_requests
  set status = 'approved', response_message = nullif(btrim(coalesce(p_message, '')), ''),
      responded_by_user_id = actor_user_id, responded_at = now(),
      replacement_occurrence_id = applied_occurrence_id, approval_error = null
  where id = target_request.id;

  for counterpart_user_id in
    select distinct recipient
    from unnest(array[target_request.requested_by_user_id, target_request.responder_user_id, coach_user_id]) recipient
    where recipient is not null
  loop
    perform public.create_system_notification(
      target_user_id => counterpart_user_id,
      notification_type => 'lesson_time_confirmed',
      notification_title => 'Lesson confirmed',
      notification_message => to_char(target_request.proposed_start_time at time zone 'Africa/Johannesburg', 'Dy DD Mon HH24:MI')
        || '-' || to_char(target_request.proposed_end_time at time zone 'Africa/Johannesburg', 'HH24:MI')
        || ' at ' || coalesce((select court.name from public.courts court where court.id = target_request.proposed_court_id), 'the selected court')
        || ', ' || coalesce((select venue.name from public.venues venue where venue.id = target_request.proposed_venue_id), 'the venue') || '.',
      notification_href => case
        when counterpart_user_id = coach_user_id then '/dashboard/coachr/schedule?request=' || target_request.id::text || '#session-requests'
        else '/dashboard/players/' || target_request.player_profile_id::text || '#lesson-requests'
      end,
      notification_actor_user_id => actor_user_id,
      notification_profile_id => target_request.player_profile_id,
      notification_metadata => jsonb_build_object(
        'requestId', target_request.id,
        'occurrenceId', applied_occurrence_id,
        'startTime', target_request.proposed_start_time,
        'courtId', target_request.proposed_court_id
      ),
      notification_dedupe_key => 'session-time-confirmed:' || target_request.id::text || ':' || counterpart_user_id::text
    );
  end loop;

  return jsonb_build_object('status', 'approved', 'occurrenceId', applied_occurrence_id);
end;
$$;

revoke all on function public.coachr_respond_to_session_request(uuid, text, text) from public, anon;
grant execute on function public.coachr_respond_to_session_request(uuid, text, text) to authenticated;

-- The former direct mutation is intentionally closed. All new times must pass
-- through an authorised pending request and the atomic approval function.
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
begin
  raise exception 'move_request_required' using errcode = 'P0001';
end;
$$;

create or replace function public.coachr_private_player_session_activity(p_player_profile_id uuid)
returns table (
  occurrence_id uuid,
  session_id uuid,
  session_name text,
  session_type text,
  coach_name text,
  venue_name text,
  start_time timestamptz,
  end_time timestamptz,
  occurrence_status text,
  cancellation_reason text,
  court_names text[]
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.can_manage_profile(p_player_profile_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    occurrence.id,
    session.id,
    session.name,
    session.session_type,
    nullif(concat_ws(' ', coach.first_name, coach.last_name), ''),
    venue.name,
    occurrence.start_time,
    occurrence.end_time,
    occurrence.status,
    occurrence.cancellation_reason,
    coalesce(array_agg(court.name order by court.name) filter (where court.name is not null), array[]::text[])
  from public.coach_session_occurrence_participants participant
  join public.coach_session_occurrences occurrence on occurrence.id = participant.occurrence_id
  join public.coach_sessions session on session.id = occurrence.session_id
  join public.venues venue on venue.id = session.venue_id
  left join public.profiles coach on coach.id = session.primary_coach_id
  left join public.coach_session_occurrence_courts occurrence_court on occurrence_court.occurrence_id = occurrence.id
  left join public.courts court on court.id = occurrence_court.court_id
  where participant.player_profile_id = p_player_profile_id
    and participant.status = 'active'
    and session.session_type = 'private'
    and (
      occurrence.status = 'scheduled'
      or (
        occurrence.status in ('cancelled', 'rain', 'sick')
        and occurrence.cancelled_at >= now() - interval '120 days'
      )
    )
  group by occurrence.id, session.id, coach.id, venue.id
  order by occurrence.start_time desc
  limit 40;
end;
$$;

revoke all on function public.coachr_private_player_session_activity(uuid) from public, anon;
grant execute on function public.coachr_private_player_session_activity(uuid) to authenticated;

alter table public.notifications drop constraint if exists notifications_type_valid;
alter table public.notifications add constraint notifications_type_valid check (
  type in (
    'match_invite_received', 'match_invite_accepted', 'match_invite_declined',
    'match_invite_reminder', 'court_booking_confirmed', 'upcoming_booking_reminder',
    'event_entry_confirmed', 'event_reminder', 'rating_updated', 'badge_unlocked',
    'leaderboard_changed', 'membership_renewal', 'shop_reservation_update',
    'coach_invitation', 'player_link_invitation', 'parent_approval_required',
    'invitation_accepted', 'invitation_declined', 'lesson_created', 'lesson_updated',
    'lesson_cancelled', 'new_message', 'lesson_move_requested',
    'lesson_time_requested', 'lesson_move_declined', 'lesson_time_confirmed'
  )
);

create or replace function public.notify_coaches_of_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  target_session public.coach_sessions%rowtype;
  notification_kind text;
  notification_title text;
  notification_message text;
  notification_key text;
begin
  if new.status is distinct from old.status and new.status in ('cancelled', 'rain', 'sick') then
    notification_kind := 'lesson_cancelled';
    notification_title := 'Lesson cancelled';
    notification_key := 'coach-session-cancelled:' || new.id::text || ':' || new.status;
  elsif new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time then
    notification_kind := 'lesson_updated';
    notification_title := 'Lesson time updated';
    notification_key := 'coach-session-moved:' || new.id::text || ':' || extract(epoch from new.start_time)::bigint::text;
  else
    return new;
  end if;

  select * into target_session from public.coach_sessions where id = new.session_id;
  notification_message := target_session.name || case
    when notification_kind = 'lesson_cancelled' then ' has been cancelled. The linked court has been released.'
    else ' has a confirmed new date or time.'
  end;

  for recipient in
    select distinct
      coalesce(membership.user_id, coach.user_id) as user_id,
      occurrence_coach.coach_profile_id as profile_id,
      null::uuid as junior_profile_id,
      '/dashboard/coachr/schedule?session=' || target_session.id::text as href
    from public.coach_session_occurrence_coaches occurrence_coach
    join public.profiles coach on coach.id = occurrence_coach.coach_profile_id
    left join public.organisation_memberships membership
      on membership.profile_id = coach.id
     and membership.venue_id = target_session.venue_id
     and membership.status = 'active'
    where occurrence_coach.occurrence_id = new.id and occurrence_coach.status = 'active'
    union
    select distinct
      case when player.is_junior then parent.user_id else player.user_id end,
      case when player.is_junior then null::uuid else player.id end,
      case when player.is_junior then player.id else null::uuid end,
      '/dashboard/players/' || player.id::text || '#lesson-requests'
    from public.coach_session_occurrence_participants participant
    join public.profiles player on player.id = participant.player_profile_id
    left join public.profiles parent on parent.id = player.parent_profile_id
    where participant.occurrence_id = new.id and participant.status = 'active'
  loop
    if recipient.user_id is null or recipient.user_id = (select auth.uid()) then
      continue;
    end if;
    begin
      perform public.create_system_notification(
        target_user_id => recipient.user_id,
        notification_type => notification_kind,
        notification_title => notification_title,
        notification_message => notification_message,
        notification_href => recipient.href,
        notification_actor_user_id => (select auth.uid()),
        notification_profile_id => recipient.profile_id,
        notification_junior_profile_id => recipient.junior_profile_id,
        notification_metadata => jsonb_build_object(
          'sessionId', target_session.id,
          'occurrenceId', new.id,
          'organisationId', target_session.venue_id,
          'startTime', new.start_time,
          'status', new.status
        ),
        notification_dedupe_key => notification_key || ':' || recipient.user_id::text
      );
    exception when others then
      raise warning 'session occurrence notification failed for occurrence %: % %', new.id, sqlstate, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

create or replace function public.coachr_reschedule_request_diagnostics(p_request_id uuid)
returns table (
  request_id uuid,
  request_origin text,
  request_status text,
  occurrence_id uuid,
  player_profile_id uuid,
  responder_user_id uuid,
  coach_profile_id uuid,
  current_booking_ids uuid[],
  proposed_court_id uuid,
  availability_result text,
  approval_result text,
  replacement_occurrence_id uuid,
  notification_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_request public.coach_session_reschedule_requests%rowtype;
  target_session_id uuid;
begin
  select * into target_request
  from public.coach_session_reschedule_requests
  where id = p_request_id;
  select occurrence.session_id into target_session_id
  from public.coach_session_occurrences occurrence
  where occurrence.id = target_request.occurrence_id;
  if actor_user_id is null or target_request.id is null
    or not public.coachr_can_manage_session(target_session_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    target_request.id,
    target_request.request_origin,
    target_request.status,
    target_request.occurrence_id,
    target_request.player_profile_id,
    target_request.responder_user_id,
    target_request.coach_profile_id,
    target_request.current_booking_ids,
    target_request.proposed_court_id,
    case when exists (
      select 1 from public.coachr_session_available_options(
        target_request.occurrence_id,
        (target_request.proposed_start_time at time zone 'Africa/Johannesburg')::date,
        target_request.proposed_start_time,
        extract(epoch from (target_request.proposed_end_time - target_request.proposed_start_time))::integer / 60
      ) option
      where option.court_id = target_request.proposed_court_id
    ) then 'available' else 'unavailable' end,
    coalesce(target_request.approval_error, target_request.status),
    target_request.replacement_occurrence_id,
    (
      select count(*)
      from public.notifications notification
      where notification.metadata ->> 'requestId' = target_request.id::text
    );
end;
$$;

revoke all on function public.coachr_reschedule_request_diagnostics(uuid) from public, anon;
grant execute on function public.coachr_reschedule_request_diagnostics(uuid) to authenticated;
