-- TeamR Phase 2C.2B: deterministic automated operational scheduling.
-- The TypeScript server planner proposes a bounded plan; this migration owns
-- authority, invariant validation and the atomic replacement of Phase 2C.2 rows.

begin;

alter table public.competition_match_operations
  add column schedule_wave integer check (schedule_wave is null or schedule_wave > 0);

create index competition_match_operations_event_wave_idx
on public.competition_match_operations(event_id, schedule_wave)
where schedule_wave is not null;

create table public.competition_schedule_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  competition_id uuid not null,
  mode text not null check (mode in ('timed', 'queue')),
  schedule_start timestamptz,
  match_duration_minutes integer check (match_duration_minutes between 5 and 180),
  minimum_rest_minutes integer not null default 0 check (minimum_rest_minutes between 0 and 240),
  active_court_ids uuid[] not null,
  generation_status text not null check (generation_status in ('generated', 'adjusted', 'stale')),
  structure_version integer not null check (structure_version >= 0),
  estimated_finish timestamptz,
  generated_at timestamptz not null,
  generated_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint competition_schedule_settings_competition_event_fk
    foreign key (competition_id, event_id)
    references public.event_competitions(id, event_id) on delete cascade,
  constraint competition_schedule_settings_mode_values check (
    (mode = 'timed' and schedule_start is not null and match_duration_minutes is not null and estimated_finish is not null)
    or (mode = 'queue' and schedule_start is null and match_duration_minutes is null and estimated_finish is null)
  ),
  constraint competition_schedule_settings_courts_required check (cardinality(active_court_ids) between 1 and 32)
);

create trigger competition_schedule_settings_set_updated_at
before update on public.competition_schedule_settings
for each row execute function public.set_updated_at();

create function private.mark_event_competition_schedule_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_event_id uuid;
begin
  affected_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  update public.competition_schedule_settings
  set generation_status = 'stale'
  where event_id = affected_event_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger event_competition_courts_mark_schedule_stale
after insert or update or delete on public.event_competition_courts
for each row execute function private.mark_event_competition_schedule_stale();

create trigger event_competitions_mark_schedule_stale
after update of structure_version on public.event_competitions
for each row
when (old.structure_version is distinct from new.structure_version)
execute function private.mark_event_competition_schedule_stale();

create function private.mark_event_competition_schedule_adjusted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_event_id uuid;
begin
  affected_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  update public.competition_schedule_settings
  set generation_status = 'adjusted'
  where event_id = affected_event_id
    and generation_status <> 'stale';
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger competition_match_operations_mark_schedule_adjusted
after insert or update or delete on public.competition_match_operations
for each row execute function private.mark_event_competition_schedule_adjusted();

create function public.get_event_competition_schedule_input(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  competition public.event_competitions;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where event_id = p_event_id;
  if competition.id is null or competition.status not in ('generated', 'locked') then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'competition_id', competition.id,
    'structure_version', competition.structure_version,
    'event', (
      select jsonb_build_object(
        'starts_at', coalesce(event.starts_at, event.start_datetime),
        'ends_at', coalesce(event.ends_at, event.end_datetime)
      ) from public.events event where event.id = p_event_id
    ),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', court.id, 'label', court.label, 'order', court.court_order)
        order by court.court_order, court.id)
      from public.event_competition_courts court
      where court.event_id = p_event_id and court.active
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id,
        'stageOrder', stage.stage_order,
        'groupOrder', competition_group.group_order,
        'roundNumber', match.round_number,
        'sequence', match.sequence,
        'playerIds', to_jsonb(array_remove(array[match.slot_a_profile_id, match.slot_b_profile_id], null)),
        'sourceMatchIds', to_jsonb(array_remove(array[match.slot_a_source_match_id, match.slot_b_source_match_id], null)),
        'hasGroupPlacementSource', match.slot_a_source_type = 'group_placement' or match.slot_b_source_type = 'group_placement',
        'staffUserIds', coalesce((
          select to_jsonb(array_agg(distinct event_staff.staff_user_id order by event_staff.staff_user_id))
          from public.competition_match_staff_assignments match_staff
          join public.event_staff_assignments event_staff on event_staff.id = match_staff.event_staff_assignment_id
          where match_staff.match_id = match.id and event_staff.status = 'active'
        ), '[]'::jsonb)
      ) order by stage.stage_order, match.round_number, competition_group.group_order nulls last, match.sequence, match.id)
      from public.competition_matches match
      join public.competition_stages stage on stage.id = match.stage_id
      left join public.competition_groups competition_group on competition_group.id = match.group_id
      where match.event_id = p_event_id
    ), '[]'::jsonb),
    'has_existing_operations', exists (
      select 1 from public.competition_match_operations operation where operation.event_id = p_event_id
    )
  );
end;
$$;

create function public.validate_event_competition_schedule(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  settings public.competition_schedule_settings;
  total_matches integer;
  scheduled_matches integer;
  player_conflicts integer;
  player_rest_conflicts integer := 0;
  court_conflicts integer;
  staff_conflicts integer;
  dependency_conflicts integer;
  window_conflicts integer;
begin
  if not private.user_can_view_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  select * into settings from public.competition_schedule_settings where event_id = p_event_id;
  select count(*) into total_matches from public.competition_matches where event_id = p_event_id;
  select count(*) into scheduled_matches from public.competition_match_operations where event_id = p_event_id;

  select count(*) into court_conflicts from (
    select operation.event_court_id, operation.schedule_wave
    from public.competition_match_operations operation
    where operation.event_id = p_event_id and operation.schedule_wave is not null
    group by operation.event_court_id, operation.schedule_wave having count(*) > 1
  ) conflicts;
  select count(*) into player_conflicts from (
    select player_id, operation.schedule_wave
    from public.competition_match_operations operation
    join public.competition_matches match on match.id = operation.match_id
    cross join lateral unnest(array_remove(array[match.slot_a_profile_id, match.slot_b_profile_id], null)) player_id
    where operation.event_id = p_event_id and operation.schedule_wave is not null
    group by player_id, operation.schedule_wave having count(*) > 1
  ) conflicts;
  select count(*) into staff_conflicts from (
    select event_staff.staff_user_id, operation.schedule_wave
    from public.competition_match_operations operation
    join public.competition_match_staff_assignments match_staff on match_staff.match_id = operation.match_id
    join public.event_staff_assignments event_staff on event_staff.id = match_staff.event_staff_assignment_id
    where operation.event_id = p_event_id and operation.schedule_wave is not null and event_staff.status = 'active'
    group by event_staff.staff_user_id, operation.schedule_wave having count(*) > 1
  ) conflicts;
  if settings.mode = 'timed' then
    select count(*) into player_rest_conflicts from (
      select least(first_operation.match_id, second_operation.match_id), greatest(first_operation.match_id, second_operation.match_id)
      from public.competition_match_operations first_operation
      join public.competition_matches first_match on first_match.id = first_operation.match_id
      join public.competition_match_operations second_operation
        on second_operation.event_id = first_operation.event_id
       and second_operation.scheduled_at > first_operation.scheduled_at
      join public.competition_matches second_match on second_match.id = second_operation.match_id
      where first_operation.event_id = p_event_id
        and array_remove(array[first_match.slot_a_profile_id, first_match.slot_b_profile_id], null)
          && array_remove(array[second_match.slot_a_profile_id, second_match.slot_b_profile_id], null)
        and second_operation.scheduled_at < first_operation.scheduled_at
          + make_interval(mins => settings.match_duration_minutes + settings.minimum_rest_minutes)
      group by least(first_operation.match_id, second_operation.match_id), greatest(first_operation.match_id, second_operation.match_id)
    ) conflicts;
  end if;
  select count(*) into dependency_conflicts
  from public.competition_matches match
  join public.competition_match_operations downstream on downstream.match_id = match.id
  join public.competition_match_operations feeder on feeder.match_id in (match.slot_a_source_match_id, match.slot_b_source_match_id)
  where match.event_id = p_event_id
    and (feeder.schedule_wave is null or downstream.schedule_wave is null or feeder.schedule_wave >= downstream.schedule_wave
      or (settings.mode = 'timed' and downstream.scheduled_at < feeder.scheduled_at
        + make_interval(mins => settings.match_duration_minutes + settings.minimum_rest_minutes)));
  dependency_conflicts := dependency_conflicts + (
    select count(*) from public.competition_matches match
    join public.competition_stages stage on stage.id = match.stage_id
    join public.competition_match_operations downstream on downstream.match_id = match.id
    where match.event_id = p_event_id
      and (match.slot_a_source_type = 'group_placement' or match.slot_b_source_type = 'group_placement')
      and exists (
        select 1 from public.competition_matches earlier_match
        join public.competition_stages earlier_stage on earlier_stage.id = earlier_match.stage_id
        join public.competition_match_operations earlier on earlier.match_id = earlier_match.id
        where earlier_match.event_id = p_event_id and earlier_stage.stage_order < stage.stage_order
          and (earlier.schedule_wave is null or downstream.schedule_wave is null or earlier.schedule_wave >= downstream.schedule_wave
            or (settings.mode = 'timed' and downstream.scheduled_at < earlier.scheduled_at
              + make_interval(mins => settings.match_duration_minutes + settings.minimum_rest_minutes)))
      )
  );
  select count(*) into window_conflicts
  from public.competition_match_operations operation
  join public.events event on event.id = operation.event_id
  where operation.event_id = p_event_id and operation.scheduled_at is not null
    and settings.match_duration_minutes is not null
    and (operation.scheduled_at < coalesce(event.starts_at, event.start_datetime)
      or operation.scheduled_at + make_interval(mins => settings.match_duration_minutes) > coalesce(event.ends_at, event.end_datetime));

  return jsonb_build_object(
    'valid', settings.id is not null and settings.generation_status <> 'stale'
      and scheduled_matches = total_matches and player_conflicts = 0 and player_rest_conflicts = 0 and court_conflicts = 0
      and staff_conflicts = 0 and dependency_conflicts = 0 and window_conflicts = 0,
    'generation_status', coalesce(settings.generation_status, 'not_generated'),
    'unscheduled_matches', greatest(total_matches - scheduled_matches, 0),
    'player_conflicts', player_conflicts,
    'player_rest_conflicts', player_rest_conflicts,
    'court_conflicts', court_conflicts,
    'staff_conflicts', staff_conflicts,
    'dependency_conflicts', dependency_conflicts,
    'event_window_conflicts', window_conflicts,
    'estimated_finish', settings.estimated_finish,
    'court_utilisation', coalesce((
      select jsonb_agg(jsonb_build_object('court_id', court.id, 'label', court.label, 'matches', coalesce(load.match_count, 0)) order by court.court_order)
      from public.event_competition_courts court
      left join (
        select operation.event_court_id, count(*) match_count
        from public.competition_match_operations operation where operation.event_id = p_event_id
        group by operation.event_court_id
      ) load on load.event_court_id = court.id
      where court.event_id = p_event_id and court.id = any(coalesce(settings.active_court_ids, '{}'::uuid[]))
    ), '[]'::jsonb)
  );
end;
$$;

create function public.get_event_competition_schedule(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  settings public.competition_schedule_settings;
begin
  if not private.user_can_view_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  select * into settings from public.competition_schedule_settings where event_id = p_event_id;
  return jsonb_build_object(
    'settings', case when settings.id is null then null else jsonb_build_object(
      'mode', settings.mode,
      'schedule_start', settings.schedule_start,
      'match_duration_minutes', settings.match_duration_minutes,
      'minimum_rest_minutes', settings.minimum_rest_minutes,
      'generation_status', settings.generation_status,
      'generated_at', settings.generated_at,
      'estimated_finish', settings.estimated_finish
    ) end,
    'validation', public.validate_event_competition_schedule(p_event_id)
  );
end;
$$;

create function public.generate_event_competition_schedule(
  p_event_id uuid,
  p_settings jsonb,
  p_operations jsonb,
  p_confirm_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  competition public.event_competitions;
  event_start timestamptz;
  event_end timestamptz;
  schedule_mode text := p_settings->>'mode';
  schedule_start timestamptz;
  duration_minutes integer;
  rest_minutes integer := coalesce((p_settings->>'minimum_rest_minutes')::integer, 0);
  estimated_finish timestamptz;
  selected_court_ids uuid[];
  structural_count integer;
  plan_count integer;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(p_event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where event_id = p_event_id;
  if competition.id is null or competition.status not in ('generated', 'locked') then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;
  if schedule_mode not in ('timed', 'queue') or rest_minutes not between 0 and 240 then
    raise exception 'competition_schedule_settings_invalid' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_operations) <> 'array' or jsonb_typeof(p_settings->'courts') <> 'array' then
    raise exception 'competition_schedule_plan_invalid' using errcode = 'P0001';
  end if;
  if schedule_mode = 'timed' then
    schedule_start := (p_settings->>'schedule_start')::timestamptz;
    duration_minutes := (p_settings->>'match_duration_minutes')::integer;
    estimated_finish := (p_settings->>'estimated_finish')::timestamptz;
    if schedule_start is null or duration_minutes not between 5 and 180 or estimated_finish is null then
      raise exception 'competition_schedule_settings_invalid' using errcode = 'P0001';
    end if;
  elsif p_settings ? 'schedule_start' and nullif(p_settings->>'schedule_start', '') is not null then
    raise exception 'competition_schedule_settings_invalid' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  if exists (select 1 from public.competition_match_operations where event_id = p_event_id)
    and not p_confirm_replace then
    raise exception 'competition_schedule_confirmation_required' using errcode = 'P0001';
  end if;

  select coalesce(event.starts_at, event.start_datetime), coalesce(event.ends_at, event.end_datetime)
  into event_start, event_end from public.events event where event.id = p_event_id for update;
  if schedule_mode = 'timed' and (schedule_start < event_start or estimated_finish > event_end) then
    raise exception 'competition_schedule_event_window_conflict' using errcode = 'P0001';
  end if;

  create temporary table if not exists pg_temp.phase2c2b_courts (
    id uuid primary key, label text not null, court_order integer not null, is_new boolean not null
  ) on commit drop;
  truncate pg_temp.phase2c2b_courts;
  insert into pg_temp.phase2c2b_courts
  select court.id, btrim(court.label), court.court_order, coalesce(court.is_new, false)
  from jsonb_to_recordset(p_settings->'courts') as court(id uuid, label text, court_order integer, is_new boolean);
  if (select count(*) from pg_temp.phase2c2b_courts) not between 1 and 32
    or exists (select 1 from pg_temp.phase2c2b_courts where length(label) not between 1 and 80 or court_order < 1)
    or exists (select 1 from pg_temp.phase2c2b_courts group by lower(label) having count(*) > 1)
    or exists (select 1 from pg_temp.phase2c2b_courts group by court_order having count(*) > 1) then
    raise exception 'competition_schedule_courts_invalid' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from pg_temp.phase2c2b_courts proposed
    left join public.event_competition_courts court on court.id = proposed.id
    where (proposed.is_new and court.id is not null)
      or (not proposed.is_new and (court.id is null or court.event_id <> p_event_id or not court.active))
  ) then
    raise exception 'competition_schedule_courts_invalid' using errcode = 'P0001';
  end if;
  insert into public.event_competition_courts (
    id, event_id, label, court_order, active, created_by_user_id
  )
  select id, p_event_id, label, court_order, true, actor_user_id
  from pg_temp.phase2c2b_courts where is_new;
  select array_agg(id order by court_order, id) into selected_court_ids from pg_temp.phase2c2b_courts;

  create temporary table if not exists pg_temp.phase2c2b_plan (
    match_id uuid primary key, event_court_id uuid not null, queue_position integer not null,
    wave integer not null, scheduled_at timestamptz
  ) on commit drop;
  truncate pg_temp.phase2c2b_plan;
  insert into pg_temp.phase2c2b_plan
  select operation.match_id, operation.event_court_id, operation.queue_position, operation.wave, operation.scheduled_at
  from jsonb_to_recordset(p_operations) as operation(
    match_id uuid, event_court_id uuid, queue_position integer, wave integer, scheduled_at timestamptz
  );

  select count(*) into structural_count from public.competition_matches where event_id = p_event_id;
  select count(*) into plan_count from pg_temp.phase2c2b_plan;
  if structural_count = 0 or plan_count <> structural_count
    or exists (select 1 from pg_temp.phase2c2b_plan where queue_position < 1 or wave < 1)
    or exists (select 1 from pg_temp.phase2c2b_plan group by event_court_id, queue_position having count(*) > 1)
    or exists (select 1 from pg_temp.phase2c2b_plan group by event_court_id, wave having count(*) > 1)
    or exists (select 1 from pg_temp.phase2c2b_plan plan left join public.competition_matches match on match.id = plan.match_id where match.id is null or match.event_id <> p_event_id)
    or exists (select 1 from pg_temp.phase2c2b_plan plan left join pg_temp.phase2c2b_courts court on court.id = plan.event_court_id where court.id is null) then
    raise exception 'competition_schedule_plan_invalid' using errcode = 'P0001';
  end if;
  if (schedule_mode = 'timed' and exists (select 1 from pg_temp.phase2c2b_plan where scheduled_at is null))
    or (schedule_mode = 'queue' and exists (select 1 from pg_temp.phase2c2b_plan where scheduled_at is not null)) then
    raise exception 'competition_schedule_plan_invalid' using errcode = 'P0001';
  end if;
  if schedule_mode = 'timed' and exists (
    select 1 from pg_temp.phase2c2b_plan
    where scheduled_at < schedule_start
      or scheduled_at + make_interval(mins => duration_minutes) > event_end
      or extract(epoch from (scheduled_at - schedule_start))::bigint % (duration_minutes * 60) <> 0
      or scheduled_at <> schedule_start + make_interval(mins => (wave - 1) * duration_minutes)
  ) then
    raise exception 'competition_schedule_event_window_conflict' using errcode = 'P0001';
  end if;
  if schedule_mode = 'timed' and estimated_finish is distinct from (
    select max(scheduled_at) + make_interval(mins => duration_minutes) from pg_temp.phase2c2b_plan
  ) then
    raise exception 'competition_schedule_plan_invalid' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from pg_temp.phase2c2b_plan plan
    join public.competition_matches match on match.id = plan.match_id
    cross join lateral unnest(array_remove(array[match.slot_a_profile_id, match.slot_b_profile_id], null)) player_id
    group by plan.wave, player_id having count(*) > 1
  ) then
    raise exception 'competition_player_time_conflict' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from pg_temp.phase2c2b_plan plan
    join public.competition_match_staff_assignments match_staff on match_staff.match_id = plan.match_id
    join public.event_staff_assignments event_staff on event_staff.id = match_staff.event_staff_assignment_id and event_staff.status = 'active'
    group by plan.wave, event_staff.staff_user_id having count(*) > 1
  ) then
    raise exception 'competition_staff_time_conflict' using errcode = 'P0001';
  end if;
  if schedule_mode = 'timed' and exists (
    select 1
    from pg_temp.phase2c2b_plan earlier
    join public.competition_matches earlier_match on earlier_match.id = earlier.match_id
    join pg_temp.phase2c2b_plan later on later.scheduled_at > earlier.scheduled_at
    join public.competition_matches later_match on later_match.id = later.match_id
    where array_remove(array[earlier_match.slot_a_profile_id, earlier_match.slot_b_profile_id], null)
      && array_remove(array[later_match.slot_a_profile_id, later_match.slot_b_profile_id], null)
      and later.scheduled_at < earlier.scheduled_at + make_interval(mins => duration_minutes + rest_minutes)
  ) then
    raise exception 'competition_player_rest_conflict' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.competition_matches match
    join pg_temp.phase2c2b_plan downstream on downstream.match_id = match.id
    join pg_temp.phase2c2b_plan feeder on feeder.match_id in (match.slot_a_source_match_id, match.slot_b_source_match_id)
    where match.event_id = p_event_id
      and (feeder.wave >= downstream.wave
        or (schedule_mode = 'timed' and downstream.scheduled_at < feeder.scheduled_at
          + make_interval(mins => duration_minutes + rest_minutes)))
  ) then
    raise exception 'competition_progression_time_conflict' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.competition_matches match
    join public.competition_stages stage on stage.id = match.stage_id
    join pg_temp.phase2c2b_plan downstream on downstream.match_id = match.id
    where match.event_id = p_event_id
      and (match.slot_a_source_type = 'group_placement' or match.slot_b_source_type = 'group_placement')
      and exists (
        select 1 from public.competition_matches earlier_match
        join public.competition_stages earlier_stage on earlier_stage.id = earlier_match.stage_id
        join pg_temp.phase2c2b_plan earlier on earlier.match_id = earlier_match.id
        where earlier_match.event_id = p_event_id and earlier_stage.stage_order < stage.stage_order
          and (earlier.wave >= downstream.wave
            or (schedule_mode = 'timed' and downstream.scheduled_at < earlier.scheduled_at
              + make_interval(mins => duration_minutes + rest_minutes)))
      )
  ) then
    raise exception 'competition_progression_time_conflict' using errcode = 'P0001';
  end if;

  set constraints public.competition_match_operations_court_queue_unique deferred;
  set constraints public.competition_match_operations_court_time_unique deferred;
  delete from public.competition_match_operations where event_id = p_event_id;
  insert into public.competition_match_operations (
    event_id, match_id, event_court_id, queue_position, schedule_wave, scheduled_at,
    created_by_user_id, updated_by_user_id
  )
  select p_event_id, match_id, event_court_id, queue_position, wave, scheduled_at,
    actor_user_id, actor_user_id
  from pg_temp.phase2c2b_plan;

  insert into public.competition_schedule_settings (
    event_id, competition_id, mode, schedule_start, match_duration_minutes,
    minimum_rest_minutes, active_court_ids, generation_status, structure_version,
    estimated_finish, generated_at, generated_by_user_id
  ) values (
    p_event_id, competition.id, schedule_mode, schedule_start, duration_minutes,
    rest_minutes, selected_court_ids, 'generated', competition.structure_version,
    estimated_finish, now(), actor_user_id
  ) on conflict (event_id) do update set
    competition_id = excluded.competition_id,
    mode = excluded.mode,
    schedule_start = excluded.schedule_start,
    match_duration_minutes = excluded.match_duration_minutes,
    minimum_rest_minutes = excluded.minimum_rest_minutes,
    active_court_ids = excluded.active_court_ids,
    generation_status = 'generated',
    structure_version = excluded.structure_version,
    estimated_finish = excluded.estimated_finish,
    generated_at = excluded.generated_at,
    generated_by_user_id = excluded.generated_by_user_id;

  return public.validate_event_competition_schedule(p_event_id);
exception
  when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'competition_schedule_plan_invalid' using errcode = 'P0001';
end;
$$;

alter table public.competition_schedule_settings enable row level security;

create policy "Event operations staff can read schedule settings"
on public.competition_schedule_settings for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));

revoke all privileges on table public.competition_schedule_settings from public, anon, authenticated, service_role;
grant select on table public.competition_schedule_settings to authenticated;
grant all privileges on table public.competition_schedule_settings to service_role;

revoke all on function private.mark_event_competition_schedule_stale() from public, anon, authenticated, service_role;
revoke all on function private.mark_event_competition_schedule_adjusted() from public, anon, authenticated, service_role;
revoke all on function public.get_event_competition_schedule_input(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_event_competition_schedule(uuid) from public, anon, authenticated, service_role;
revoke all on function public.validate_event_competition_schedule(uuid) from public, anon, authenticated, service_role;
revoke all on function public.generate_event_competition_schedule(uuid, jsonb, jsonb, boolean) from public, anon, authenticated, service_role;

grant execute on function public.get_event_competition_schedule_input(uuid) to authenticated, service_role;
grant execute on function public.get_event_competition_schedule(uuid) to authenticated, service_role;
grant execute on function public.validate_event_competition_schedule(uuid) to authenticated, service_role;
grant execute on function public.generate_event_competition_schedule(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

comment on table public.competition_schedule_settings is
'Persisted Phase 2C.2B generation inputs and lifecycle. Operational rows remain in competition_match_operations.';
comment on function public.generate_event_competition_schedule(uuid, jsonb, jsonb, boolean) is
'Authorises, revalidates and atomically persists one complete deterministic schedule proposed by the trusted server planner.';

commit;
