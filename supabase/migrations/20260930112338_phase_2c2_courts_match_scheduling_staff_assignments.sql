-- TeamR Phase 2C.2: event-scoped courts, match scheduling and operational
-- staff assignments. This layer references Phase 2C.1 structural matches but
-- remains independent from ClubR bookings, legacy event_entries and results.

begin;

create table public.event_competition_courts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  linked_court_id uuid references public.courts(id) on delete restrict,
  label text not null,
  court_order integer not null,
  notes text,
  active boolean not null default true,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_competition_courts_identity unique (id, event_id),
  constraint event_competition_courts_label_valid check (length(btrim(label)) between 1 and 80),
  constraint event_competition_courts_order_valid check (court_order > 0),
  constraint event_competition_courts_notes_valid check (notes is null or length(notes) <= 500)
);

create unique index event_competition_courts_active_label_unique
on public.event_competition_courts(event_id, lower(btrim(label)))
where active;

create unique index event_competition_courts_active_link_unique
on public.event_competition_courts(event_id, linked_court_id)
where active and linked_court_id is not null;

create index event_competition_courts_event_order_idx
on public.event_competition_courts(event_id, active desc, court_order);

create table public.competition_match_operations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  match_id uuid not null,
  event_court_id uuid not null,
  queue_position integer not null,
  scheduled_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_match_operations_match_event_fk
    foreign key (match_id, event_id)
    references public.competition_matches(id, event_id) on delete restrict,
  constraint competition_match_operations_court_event_fk
    foreign key (event_court_id, event_id)
    references public.event_competition_courts(id, event_id) on delete restrict,
  constraint competition_match_operations_match_unique unique (match_id),
  constraint competition_match_operations_court_queue_unique
    unique (event_court_id, queue_position) deferrable initially deferred,
  constraint competition_match_operations_court_time_unique
    unique (event_court_id, scheduled_at) deferrable initially deferred,
  constraint competition_match_operations_queue_valid check (queue_position > 0)
);

create index competition_match_operations_event_idx
on public.competition_match_operations(event_id, event_court_id, queue_position);

create index competition_match_operations_time_idx
on public.competition_match_operations(event_id, scheduled_at)
where scheduled_at is not null;

create unique index event_staff_assignments_phase2c2_identity
on public.event_staff_assignments(id, event_id);

create table public.competition_match_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  match_id uuid not null,
  event_staff_assignment_id uuid not null,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint competition_match_staff_match_event_fk
    foreign key (match_id, event_id)
    references public.competition_matches(id, event_id) on delete restrict,
  constraint competition_match_staff_event_staff_fk
    foreign key (event_staff_assignment_id, event_id)
    references public.event_staff_assignments(id, event_id) on delete restrict,
  constraint competition_match_staff_unique unique (match_id, event_staff_assignment_id)
);

create index competition_match_staff_event_idx
on public.competition_match_staff_assignments(event_id, match_id);

create index competition_match_staff_assignment_idx
on public.competition_match_staff_assignments(event_staff_assignment_id, match_id);

create trigger event_competition_courts_set_updated_at
before update on public.event_competition_courts
for each row execute function public.set_updated_at();

create trigger competition_match_operations_set_updated_at
before update on public.competition_match_operations
for each row execute function public.set_updated_at();

create function private.event_accepts_competition_operations(check_event_id uuid)
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
      and event.status = 'published'
      and event.archived_at is null
      and coalesce(event.ends_at, event.end_datetime) >= now()
  );
$$;

create function private.competition_court_queue_is_valid(check_court_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (
    select 1
    from public.competition_matches feeder
    join public.competition_match_operations feeder_operation
      on feeder_operation.match_id = feeder.id
     and feeder_operation.event_court_id = check_court_id
    join public.competition_match_operations downstream_operation
      on downstream_operation.match_id = feeder.winner_to_match_id
     and downstream_operation.event_court_id = check_court_id
    where feeder.winner_to_match_id is not null
      and feeder_operation.queue_position >= downstream_operation.queue_position
  );
$$;

create function private.protect_competition_match_operations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.competition_match_operations operation
    where operation.match_id = old.id
  ) or exists (
    select 1 from public.competition_match_staff_assignments assignment
    where assignment.match_id = old.id
  ) then
    raise exception 'competition_operations_exist' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger competition_matches_protect_operations
before delete on public.competition_matches
for each row execute function private.protect_competition_match_operations();

create function public.save_event_competition_court(
  p_event_id uuid,
  p_court_id uuid default null,
  p_label text default null,
  p_linked_court_id uuid default null,
  p_court_order integer default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.event_competition_courts;
  clean_label text := btrim(coalesce(p_label, ''));
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  resolved_order integer;
  saved_id uuid;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(p_event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.event_competitions competition
    where competition.event_id = p_event_id and competition.status in ('generated', 'locked')
  ) then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;
  if length(clean_label) not between 1 and 80
    or (clean_notes is not null and length(clean_notes) > 500)
    or (p_court_order is not null and p_court_order < 1) then
    raise exception 'competition_court_invalid' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  if p_court_id is not null then
    select * into target
    from public.event_competition_courts court
    where court.id = p_court_id and court.event_id = p_event_id
    for update;
    if target.id is null then
      raise exception 'competition_court_invalid' using errcode = 'P0001';
    end if;
  end if;

  if p_linked_court_id is not null and not exists (
    select 1
    from public.events event
    join public.courts court on court.id = p_linked_court_id and court.status = 'active'
    where event.id = p_event_id
      and (
        court.venue_id = event.venue_id
        or exists (
          select 1
          from public.organisation_court_access access
          where access.owner_venue_id = court.venue_id
            and access.approved_venue_id = event.venue_id
            and access.status = 'active'
            and (access.court_id is null or access.court_id = court.id)
            and (access.valid_from is null or access.valid_from <= current_date)
            and (access.valid_until is null or access.valid_until >= current_date)
        )
      )
  ) then
    raise exception 'competition_linked_court_invalid' using errcode = 'P0001';
  end if;

  resolved_order := coalesce(p_court_order, target.court_order, (
    select coalesce(max(court.court_order), 0) + 1
    from public.event_competition_courts court
    where court.event_id = p_event_id and court.active
  ));

  if exists (
    select 1 from public.event_competition_courts court
    where court.event_id = p_event_id and court.active
      and court.id is distinct from p_court_id
      and lower(btrim(court.label)) = lower(clean_label)
  ) or exists (
    select 1 from public.event_competition_courts court
    where court.event_id = p_event_id and court.active
      and court.id is distinct from p_court_id
      and court.court_order = resolved_order
  ) or (p_linked_court_id is not null and exists (
    select 1 from public.event_competition_courts court
    where court.event_id = p_event_id and court.active
      and court.id is distinct from p_court_id
      and court.linked_court_id = p_linked_court_id
  )) then
    raise exception 'competition_court_duplicate' using errcode = '23505';
  end if;

  if target.id is null then
    insert into public.event_competition_courts (
      event_id, linked_court_id, label, court_order, notes, created_by_user_id
    ) values (
      p_event_id, p_linked_court_id, clean_label, resolved_order, clean_notes, actor_user_id
    ) returning id into saved_id;
  else
    update public.event_competition_courts
    set linked_court_id = p_linked_court_id,
        label = clean_label,
        court_order = resolved_order,
        notes = clean_notes,
        active = true
    where id = target.id
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create function public.deactivate_event_competition_court(p_court_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.event_competition_courts;
begin
  select * into target from public.event_competition_courts where id = p_court_id for update;
  if target.id is null
    or not private.user_can_manage_event_competition(target.event_id, (select auth.uid())) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.competition_match_operations operation
    where operation.event_court_id = target.id
  ) then
    raise exception 'competition_court_in_use' using errcode = 'P0001';
  end if;
  update public.event_competition_courts set active = false where id = target.id;
  return target.id;
end;
$$;

create function public.schedule_competition_match(
  p_match_id uuid,
  p_event_court_id uuid,
  p_queue_position integer default null,
  p_scheduled_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_match public.competition_matches;
  target_court public.event_competition_courts;
  current_operation public.competition_match_operations;
  event_start timestamptz;
  event_end timestamptz;
  resolved_position integer;
  operation_id uuid;
begin
  if p_event_court_id is null then
    raise exception 'competition_court_invalid' using errcode = 'P0001';
  end if;
  select * into target_match from public.competition_matches where id = p_match_id;
  if target_match.id is null
    or not private.user_can_manage_event_competition(target_match.event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target_match.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.event_competitions competition
    where competition.id = target_match.competition_id and competition.status in ('generated', 'locked')
  ) then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_match.event_id::text, 0));
  set constraints public.competition_match_operations_court_queue_unique,
    public.competition_match_operations_court_time_unique deferred;

  select * into target_court
  from public.event_competition_courts court
  where court.id = p_event_court_id
    and court.event_id = target_match.event_id
    and court.active
  for update;
  if target_court.id is null then
    raise exception 'competition_court_invalid' using errcode = 'P0001';
  end if;

  select coalesce(event.starts_at, event.start_datetime), coalesce(event.ends_at, event.end_datetime)
  into event_start, event_end
  from public.events event where event.id = target_match.event_id;
  if p_scheduled_at is not null and (p_scheduled_at < event_start or p_scheduled_at >= event_end) then
    raise exception 'competition_time_outside_event' using errcode = 'P0001';
  end if;

  if p_scheduled_at is not null and exists (
    select 1
    from public.competition_match_operations other_operation
    where other_operation.event_court_id = target_court.id
      and other_operation.match_id <> target_match.id
      and other_operation.scheduled_at = p_scheduled_at
  ) then
    raise exception 'competition_court_time_conflict' using errcode = 'P0001';
  end if;

  if p_scheduled_at is not null and exists (
    select 1
    from public.competition_match_operations other_operation
    join public.competition_matches other_match on other_match.id = other_operation.match_id
    where other_operation.event_id = target_match.event_id
      and other_operation.match_id <> target_match.id
      and other_operation.scheduled_at = p_scheduled_at
      and (
        target_match.slot_a_profile_id in (other_match.slot_a_profile_id, other_match.slot_b_profile_id)
        or target_match.slot_b_profile_id in (other_match.slot_a_profile_id, other_match.slot_b_profile_id)
      )
  ) then
    raise exception 'competition_player_time_conflict' using errcode = 'P0001';
  end if;

  if p_scheduled_at is not null and exists (
    select 1
    from public.competition_match_staff_assignments own_staff
    join public.event_staff_assignments own_event_staff on own_event_staff.id = own_staff.event_staff_assignment_id
    join public.competition_match_staff_assignments other_staff
      on other_staff.event_id = own_staff.event_id
     and other_staff.match_id <> own_staff.match_id
    join public.event_staff_assignments other_event_staff
      on other_event_staff.id = other_staff.event_staff_assignment_id
     and other_event_staff.staff_user_id = own_event_staff.staff_user_id
    join public.competition_match_operations other_operation
      on other_operation.match_id = other_staff.match_id
     and other_operation.scheduled_at = p_scheduled_at
    where own_staff.match_id = target_match.id
  ) then
    raise exception 'competition_staff_time_conflict' using errcode = 'P0001';
  end if;

  if p_scheduled_at is not null and (
    exists (
      select 1
      from unnest(array[target_match.slot_a_source_match_id, target_match.slot_b_source_match_id]) source_match_id
      left join public.competition_match_operations source_operation on source_operation.match_id = source_match_id
      where source_match_id is not null
        and (source_operation.scheduled_at is null or source_operation.scheduled_at >= p_scheduled_at)
    )
    or exists (
      select 1 from public.competition_match_operations downstream_operation
      where downstream_operation.match_id = target_match.winner_to_match_id
        and downstream_operation.scheduled_at is not null
        and downstream_operation.scheduled_at <= p_scheduled_at
    )
  ) then
    raise exception 'competition_progression_time_conflict' using errcode = 'P0001';
  end if;

  select * into current_operation
  from public.competition_match_operations operation
  where operation.match_id = target_match.id
  for update;

  if current_operation.id is not null then
    delete from public.competition_match_operations where id = current_operation.id;
    update public.competition_match_operations
    set queue_position = queue_position - 1
    where event_court_id = current_operation.event_court_id
      and queue_position > current_operation.queue_position;
  end if;

  resolved_position := coalesce(p_queue_position, (
    select coalesce(max(operation.queue_position), 0) + 1
    from public.competition_match_operations operation
    where operation.event_court_id = target_court.id
  ));
  if resolved_position < 1 or resolved_position > (
    select count(*) + 1 from public.competition_match_operations operation
    where operation.event_court_id = target_court.id
  ) then
    raise exception 'competition_queue_position_invalid' using errcode = 'P0001';
  end if;

  update public.competition_match_operations
  set queue_position = queue_position + 1
  where event_court_id = target_court.id
    and queue_position >= resolved_position;

  insert into public.competition_match_operations (
    event_id, match_id, event_court_id, queue_position, scheduled_at,
    created_by_user_id, updated_by_user_id
  ) values (
    target_match.event_id, target_match.id, target_court.id, resolved_position,
    p_scheduled_at, actor_user_id, actor_user_id
  ) returning id into operation_id;

  if not private.competition_court_queue_is_valid(target_court.id)
    or (current_operation.id is not null
      and current_operation.event_court_id <> target_court.id
      and not private.competition_court_queue_is_valid(current_operation.event_court_id)) then
    raise exception 'competition_progression_queue_conflict' using errcode = 'P0001';
  end if;
  set constraints public.competition_match_operations_court_queue_unique,
    public.competition_match_operations_court_time_unique immediate;
  return operation_id;
exception
  when unique_violation then
    raise exception 'competition_court_time_conflict' using errcode = 'P0001';
end;
$$;

create function public.unschedule_competition_match(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.competition_matches;
  target_operation public.competition_match_operations;
begin
  select * into target_match from public.competition_matches where id = p_match_id;
  if target_match.id is null
    or not private.user_can_manage_event_competition(target_match.event_id, (select auth.uid())) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target_match.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_match.event_id::text, 0));
  set constraints public.competition_match_operations_court_queue_unique deferred;
  select * into target_operation
  from public.competition_match_operations operation
  where operation.match_id = target_match.id
  for update;
  if target_operation.id is null then
    raise exception 'competition_match_not_scheduled' using errcode = 'P0001';
  end if;
  delete from public.competition_match_operations where id = target_operation.id;
  update public.competition_match_operations
  set queue_position = queue_position - 1
  where event_court_id = target_operation.event_court_id
    and queue_position > target_operation.queue_position;
  return target_match.id;
end;
$$;

create function public.move_competition_match_queue(p_match_id uuid, p_direction text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.competition_matches;
  target_operation public.competition_match_operations;
  other_operation public.competition_match_operations;
  target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'competition_queue_direction_invalid' using errcode = 'P0001';
  end if;
  select * into target_match from public.competition_matches where id = p_match_id;
  if target_match.id is null
    or not private.user_can_manage_event_competition(target_match.event_id, (select auth.uid())) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target_match.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_match.event_id::text, 0));
  set constraints public.competition_match_operations_court_queue_unique deferred;
  select * into target_operation
  from public.competition_match_operations operation
  where operation.match_id = target_match.id
  for update;
  if target_operation.id is null then
    raise exception 'competition_match_not_scheduled' using errcode = 'P0001';
  end if;
  target_position := target_operation.queue_position + case when p_direction = 'up' then -1 else 1 end;
  select * into other_operation
  from public.competition_match_operations operation
  where operation.event_court_id = target_operation.event_court_id
    and operation.queue_position = target_position
  for update;
  if other_operation.id is null then
    return target_operation.id;
  end if;
  update public.competition_match_operations
  set queue_position = case
    when id = target_operation.id then other_operation.queue_position
    else target_operation.queue_position end,
    updated_by_user_id = (select auth.uid())
  where id in (target_operation.id, other_operation.id);
  if not private.competition_court_queue_is_valid(target_operation.event_court_id) then
    raise exception 'competition_progression_queue_conflict' using errcode = 'P0001';
  end if;
  return target_operation.id;
end;
$$;

create function public.auto_distribute_competition_matches(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  court_ids uuid[];
  court_count integer;
  scheduled_count integer := 0;
  target_match record;
  selected_court_id uuid;
  selected_position integer;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(p_event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.event_competitions competition
    where competition.event_id = p_event_id and competition.status in ('generated', 'locked')
  ) then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  select array_agg(court.id order by court.court_order, court.id)
  into court_ids
  from public.event_competition_courts court
  where court.event_id = p_event_id and court.active;
  court_count := coalesce(cardinality(court_ids), 0);
  if court_count = 0 then
    raise exception 'competition_courts_required' using errcode = 'P0001';
  end if;

  for target_match in
    select match.id, match.sequence
    from public.competition_matches match
    where match.event_id = p_event_id
      and not exists (
        select 1 from public.competition_match_operations operation
        where operation.match_id = match.id
      )
    order by match.sequence, match.id
  loop
    selected_court_id := court_ids[(scheduled_count % court_count) + 1];
    select coalesce(max(operation.queue_position), 0) + 1
    into selected_position
    from public.competition_match_operations operation
    where operation.event_court_id = selected_court_id;
    insert into public.competition_match_operations (
      event_id, match_id, event_court_id, queue_position,
      created_by_user_id, updated_by_user_id
    ) values (
      p_event_id, target_match.id, selected_court_id, selected_position,
      actor_user_id, actor_user_id
    );
    scheduled_count := scheduled_count + 1;
  end loop;
  return scheduled_count;
end;
$$;

create function public.assign_competition_match_staff(
  p_match_id uuid,
  p_event_staff_assignment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match public.competition_matches;
  target_staff public.event_staff_assignments;
  match_time timestamptz;
  saved_id uuid;
begin
  select * into target_match from public.competition_matches where id = p_match_id;
  if target_match.id is null
    or not private.user_can_manage_event_competition(target_match.event_id, (select auth.uid())) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target_match.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_match.event_id::text, 0));
  select * into target_staff
  from public.event_staff_assignments assignment
  where assignment.id = p_event_staff_assignment_id
    and assignment.event_id = target_match.event_id
    and assignment.status = 'active'
    and assignment.event_role in ('coach', 'official')
  for update;
  if target_staff.id is null then
    raise exception 'competition_match_staff_invalid' using errcode = 'P0001';
  end if;
  select operation.scheduled_at into match_time
  from public.competition_match_operations operation
  where operation.match_id = target_match.id;
  if match_time is not null and exists (
    select 1
    from public.competition_match_staff_assignments other_assignment
    join public.event_staff_assignments other_staff
      on other_staff.id = other_assignment.event_staff_assignment_id
    join public.competition_match_operations other_operation
      on other_operation.match_id = other_assignment.match_id
    where other_assignment.event_id = target_match.event_id
      and other_assignment.match_id <> target_match.id
      and other_staff.staff_user_id = target_staff.staff_user_id
      and other_operation.scheduled_at = match_time
  ) then
    raise exception 'competition_staff_time_conflict' using errcode = 'P0001';
  end if;
  insert into public.competition_match_staff_assignments (
    event_id, match_id, event_staff_assignment_id, assigned_by_user_id
  ) values (
    target_match.event_id, target_match.id, target_staff.id, (select auth.uid())
  )
  on conflict (match_id, event_staff_assignment_id) do nothing
  returning id into saved_id;
  if saved_id is null then
    raise exception 'competition_match_staff_duplicate' using errcode = '23505';
  end if;
  return saved_id;
end;
$$;

create function public.remove_competition_match_staff(p_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.competition_match_staff_assignments;
begin
  select * into target
  from public.competition_match_staff_assignments assignment
  where assignment.id = p_assignment_id
  for update;
  if target.id is null
    or not private.user_can_manage_event_competition(target.event_id, (select auth.uid())) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_operations(target.event_id) then
    raise exception 'competition_operations_event_not_mutable' using errcode = 'P0001';
  end if;
  delete from public.competition_match_staff_assignments where id = target.id;
  return target.id;
end;
$$;

create function public.get_event_competition_operations(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  can_manage boolean;
  competition public.event_competitions;
begin
  can_manage := private.user_can_manage_event_competition(p_event_id, actor_user_id);
  if not can_manage and not private.user_can_view_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_operations_access' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where event_id = p_event_id;
  if competition.id is null or competition.status not in ('generated', 'locked') then
    raise exception 'competition_structure_required' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'can_manage', can_manage,
    'competition_status', competition.status,
    'event', (
      select jsonb_build_object(
        'id', event.id,
        'starts_at', coalesce(event.starts_at, event.start_datetime),
        'ends_at', coalesce(event.ends_at, event.end_datetime),
        'timezone', coalesce(venue.timezone, 'Africa/Johannesburg')
      )
      from public.events event
      left join public.venues venue on venue.id = event.venue_id
      where event.id = p_event_id
    ),
    'summary', jsonb_build_object(
      'total_matches', (select count(*) from public.competition_matches match where match.event_id = p_event_id),
      'scheduled_matches', (select count(*) from public.competition_match_operations operation where operation.event_id = p_event_id),
      'timed_matches', (select count(*) from public.competition_match_operations operation where operation.event_id = p_event_id and operation.scheduled_at is not null),
      'active_courts', (select count(*) from public.event_competition_courts court where court.event_id = p_event_id and court.active)
    ),
    'courts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', court.id,
        'label', court.label,
        'court_order', court.court_order,
        'notes', court.notes,
        'linked_court_id', court.linked_court_id,
        'linked_court_name', linked.name
      ) order by court.court_order, court.id)
      from public.event_competition_courts court
      left join public.courts linked on linked.id = court.linked_court_id
      where court.event_id = p_event_id and court.active
    ), '[]'::jsonb),
    'available_linked_courts', coalesce((
      select jsonb_agg(jsonb_build_object('id', court.id, 'name', court.name) order by court.sort_order, court.name)
      from public.events event
      join public.courts court on court.status = 'active'
      where event.id = p_event_id
        and (
          court.venue_id = event.venue_id
          or exists (
            select 1 from public.organisation_court_access access
            where access.owner_venue_id = court.venue_id
              and access.approved_venue_id = event.venue_id
              and access.status = 'active'
              and (access.court_id is null or access.court_id = court.id)
              and (access.valid_from is null or access.valid_from <= current_date)
              and (access.valid_until is null or access.valid_until >= current_date)
          )
        )
    ), '[]'::jsonb),
    'staff_candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', assignment.id,
        'staff_user_id', assignment.staff_user_id,
        'staff_name', profile.first_name || ' ' || profile.last_name,
        'event_role', assignment.event_role
      ) order by profile.last_name, profile.first_name)
      from public.event_staff_assignments assignment
      join public.profiles profile on profile.id = assignment.staff_profile_id
      where assignment.event_id = p_event_id
        and assignment.status = 'active'
        and assignment.event_role in ('coach', 'official')
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', match.id,
        'stage_id', match.stage_id,
        'match_kind', match.match_kind,
        'round_label', match.round_label,
        'round_match_number', match.round_match_number,
        'sequence', match.sequence,
        'slot_a_label', case match.slot_a_source_type
          when 'participant' then profile_a.first_name || ' ' || profile_a.last_name
          when 'group_placement' then group_a.label || ' #' || match.slot_a_source_placement::text
          when 'match_winner' then 'Winner of ' || source_a.round_label || ' ' || source_a.round_match_number::text
          else 'Bye' end,
        'slot_b_label', case match.slot_b_source_type
          when 'participant' then profile_b.first_name || ' ' || profile_b.last_name
          when 'group_placement' then group_b.label || ' #' || match.slot_b_source_placement::text
          when 'match_winner' then 'Winner of ' || source_b.round_label || ' ' || source_b.round_match_number::text
          else 'Bye' end,
        'event_court_id', operation.event_court_id,
        'queue_position', operation.queue_position,
        'scheduled_at', operation.scheduled_at,
        'staff', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', match_staff.id,
            'event_staff_assignment_id', match_staff.event_staff_assignment_id,
            'staff_user_id', event_staff.staff_user_id,
            'staff_name', staff_profile.first_name || ' ' || staff_profile.last_name,
            'event_role', event_staff.event_role,
            'is_me', event_staff.staff_user_id = actor_user_id
          ) order by staff_profile.last_name, staff_profile.first_name)
          from public.competition_match_staff_assignments match_staff
          join public.event_staff_assignments event_staff on event_staff.id = match_staff.event_staff_assignment_id
          join public.profiles staff_profile on staff_profile.id = event_staff.staff_profile_id
          where match_staff.match_id = match.id
        ), '[]'::jsonb)
      ) order by court.court_order nulls last, operation.queue_position nulls last, match.sequence)
      from public.competition_matches match
      left join public.competition_match_operations operation on operation.match_id = match.id
      left join public.event_competition_courts court on court.id = operation.event_court_id
      left join public.profiles profile_a on profile_a.id = match.slot_a_profile_id
      left join public.profiles profile_b on profile_b.id = match.slot_b_profile_id
      left join public.competition_groups group_a on group_a.id = match.slot_a_source_group_id
      left join public.competition_groups group_b on group_b.id = match.slot_b_source_group_id
      left join public.competition_matches source_a on source_a.id = match.slot_a_source_match_id
      left join public.competition_matches source_b on source_b.id = match.slot_b_source_match_id
      where match.event_id = p_event_id
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.event_competition_courts enable row level security;
alter table public.competition_match_operations enable row level security;
alter table public.competition_match_staff_assignments enable row level security;

create policy "Event operations staff can read competition courts"
on public.event_competition_courts for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));

create policy "Event operations staff can read match operations"
on public.competition_match_operations for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));

create policy "Event operations staff can read match staff"
on public.competition_match_staff_assignments for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));

revoke all privileges on table public.event_competition_courts from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_match_operations from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_match_staff_assignments from public, anon, authenticated, service_role;
grant select on table public.event_competition_courts, public.competition_match_operations,
  public.competition_match_staff_assignments to authenticated;
grant all privileges on table public.event_competition_courts, public.competition_match_operations,
  public.competition_match_staff_assignments to service_role;

revoke all on function private.event_accepts_competition_operations(uuid) from public, anon, authenticated, service_role;
revoke all on function private.competition_court_queue_is_valid(uuid) from public, anon, authenticated, service_role;
revoke all on function private.protect_competition_match_operations() from public, anon, authenticated, service_role;
grant execute on function private.event_accepts_competition_operations(uuid) to authenticated, service_role;
grant execute on function private.competition_court_queue_is_valid(uuid) to authenticated, service_role;

revoke all on function public.save_event_competition_court(uuid, uuid, text, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.deactivate_event_competition_court(uuid) from public, anon, authenticated, service_role;
revoke all on function public.schedule_competition_match(uuid, uuid, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.unschedule_competition_match(uuid) from public, anon, authenticated, service_role;
revoke all on function public.move_competition_match_queue(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.auto_distribute_competition_matches(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assign_competition_match_staff(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.remove_competition_match_staff(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_event_competition_operations(uuid) from public, anon, authenticated, service_role;

grant execute on function public.save_event_competition_court(uuid, uuid, text, uuid, integer, text) to authenticated, service_role;
grant execute on function public.deactivate_event_competition_court(uuid) to authenticated, service_role;
grant execute on function public.schedule_competition_match(uuid, uuid, integer, timestamptz) to authenticated, service_role;
grant execute on function public.unschedule_competition_match(uuid) to authenticated, service_role;
grant execute on function public.move_competition_match_queue(uuid, text) to authenticated, service_role;
grant execute on function public.auto_distribute_competition_matches(uuid) to authenticated, service_role;
grant execute on function public.assign_competition_match_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_competition_match_staff(uuid) to authenticated, service_role;
grant execute on function public.get_event_competition_operations(uuid) to authenticated, service_role;

comment on table public.event_competition_courts is
'Event-scoped operational courts. An optional ClubR court link supplies identity only; no ClubR booking is created.';
comment on table public.competition_match_operations is
'Queue placement and optional exact start time for one Phase 2C.1 structural match.';
comment on table public.competition_match_staff_assignments is
'Match-level operational assignment of an active event Coach or Official. It grants no additional authority.';

commit;
