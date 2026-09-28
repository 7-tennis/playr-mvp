-- Phase 2C.1: shared event competition structure.
-- Confirmed event_player_assignments remain the canonical entrant population.
-- Legacy public.matches, event_entries and event_results remain isolated.

begin;

create table public.event_competitions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  format text not null check (format in ('round_robin', 'knockout', 'round_robin_knockout')),
  status text not null default 'draft' check (status in ('draft', 'generated', 'locked')),
  group_count integer check (group_count between 1 and 26),
  advancing_per_group integer check (advancing_per_group between 1 and 2),
  selected_assignment_ids uuid[] not null default '{}'::uuid[],
  generated_assignment_ids uuid[] not null default '{}'::uuid[],
  participant_snapshot_ids uuid[] not null default '{}'::uuid[],
  structure_version integer not null default 0 check (structure_version >= 0),
  configured_by_user_id uuid not null references auth.users(id) on delete restrict,
  generated_by_user_id uuid references auth.users(id) on delete set null,
  locked_by_user_id uuid references auth.users(id) on delete set null,
  generated_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_competitions_event_identity unique (id, event_id),
  constraint event_competitions_configuration_check check (
    (format = 'round_robin' and group_count is not null and advancing_per_group is null)
    or (format = 'knockout' and group_count is null and advancing_per_group is null)
    or (format = 'round_robin_knockout' and group_count is not null and advancing_per_group is not null)
  ),
  constraint event_competitions_status_timestamps check (
    (status = 'draft' and generated_at is null and locked_at is null)
    or (status = 'generated' and generated_at is not null and locked_at is null)
    or (status = 'locked' and generated_at is not null and locked_at is not null)
  )
);

create table public.competition_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  event_id uuid not null,
  stage_type text not null check (stage_type in ('group', 'knockout')),
  stage_order integer not null check (stage_order > 0),
  label text not null check (length(btrim(label)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint competition_stages_competition_event_fk
    foreign key (competition_id, event_id)
    references public.event_competitions(id, event_id) on delete cascade,
  constraint competition_stages_identity unique (id, event_id),
  constraint competition_stages_competition_identity unique (id, competition_id, event_id),
  constraint competition_stages_order_unique unique (competition_id, stage_order),
  constraint competition_stages_type_unique unique (competition_id, stage_type)
);

create table public.competition_groups (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  stage_id uuid not null,
  event_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  group_order integer not null check (group_order > 0),
  created_at timestamptz not null default now(),
  constraint competition_groups_stage_event_fk
    foreign key (stage_id, competition_id, event_id)
    references public.competition_stages(id, competition_id, event_id) on delete cascade,
  constraint competition_groups_identity unique (id, event_id),
  constraint competition_groups_stage_identity unique (id, stage_id, event_id),
  constraint competition_groups_order_unique unique (stage_id, group_order),
  constraint competition_groups_label_unique unique (stage_id, label)
);

create unique index event_player_assignments_competition_identity
on public.event_player_assignments(id, event_id, player_profile_id);

create table public.competition_group_members (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  stage_id uuid not null,
  group_id uuid not null,
  event_id uuid not null,
  event_player_assignment_id uuid not null,
  player_profile_id uuid not null,
  position integer not null check (position > 0),
  seed integer check (seed is null or seed > 0),
  created_at timestamptz not null default now(),
  constraint competition_group_members_group_event_fk
    foreign key (group_id, stage_id, event_id)
    references public.competition_groups(id, stage_id, event_id) on delete cascade,
  constraint competition_group_members_stage_event_fk
    foreign key (stage_id, competition_id, event_id)
    references public.competition_stages(id, competition_id, event_id) on delete cascade,
  constraint competition_group_members_assignment_event_fk
    foreign key (event_player_assignment_id, event_id, player_profile_id)
    references public.event_player_assignments(id, event_id, player_profile_id) on delete restrict,
  constraint competition_group_members_stage_player_unique unique (stage_id, player_profile_id),
  constraint competition_group_members_stage_assignment_unique unique (stage_id, event_player_assignment_id),
  constraint competition_group_members_position_unique unique (group_id, position)
);

create table public.competition_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  stage_id uuid not null,
  event_id uuid not null,
  group_id uuid,
  match_kind text not null check (match_kind in ('round_robin', 'knockout')),
  round_number integer not null default 1 check (round_number > 0),
  round_label text not null check (length(btrim(round_label)) between 1 and 80),
  round_match_number integer not null check (round_match_number > 0),
  sequence integer not null check (sequence > 0),
  status text not null default 'pending' check (status = 'pending'),
  slot_a_source_type text not null check (slot_a_source_type in ('participant', 'group_placement', 'match_winner', 'bye')),
  slot_a_assignment_id uuid,
  slot_a_profile_id uuid,
  slot_a_source_group_id uuid,
  slot_a_source_placement integer,
  slot_a_source_match_id uuid,
  slot_b_source_type text not null check (slot_b_source_type in ('participant', 'group_placement', 'match_winner', 'bye')),
  slot_b_assignment_id uuid,
  slot_b_profile_id uuid,
  slot_b_source_group_id uuid,
  slot_b_source_placement integer,
  slot_b_source_match_id uuid,
  winner_to_match_id uuid,
  winner_to_slot text check (winner_to_slot in ('a', 'b')),
  created_at timestamptz not null default now(),
  constraint competition_matches_stage_event_fk
    foreign key (stage_id, competition_id, event_id)
    references public.competition_stages(id, competition_id, event_id) on delete cascade,
  constraint competition_matches_group_event_fk
    foreign key (group_id, event_id)
    references public.competition_groups(id, event_id) on delete cascade,
  constraint competition_matches_slot_a_assignment_fk
    foreign key (slot_a_assignment_id, event_id, slot_a_profile_id)
    references public.event_player_assignments(id, event_id, player_profile_id) on delete restrict,
  constraint competition_matches_slot_b_assignment_fk
    foreign key (slot_b_assignment_id, event_id, slot_b_profile_id)
    references public.event_player_assignments(id, event_id, player_profile_id) on delete restrict,
  constraint competition_matches_slot_a_group_fk
    foreign key (slot_a_source_group_id, event_id)
    references public.competition_groups(id, event_id) on delete cascade,
  constraint competition_matches_slot_b_group_fk
    foreign key (slot_b_source_group_id, event_id)
    references public.competition_groups(id, event_id) on delete cascade,
  constraint competition_matches_identity unique (id, event_id),
  constraint competition_matches_slot_a_source_match_fk
    foreign key (slot_a_source_match_id, event_id)
    references public.competition_matches(id, event_id) on delete cascade deferrable initially deferred,
  constraint competition_matches_slot_b_source_match_fk
    foreign key (slot_b_source_match_id, event_id)
    references public.competition_matches(id, event_id) on delete cascade deferrable initially deferred,
  constraint competition_matches_winner_destination_fk
    foreign key (winner_to_match_id, event_id)
    references public.competition_matches(id, event_id) on delete cascade deferrable initially deferred,
  constraint competition_matches_sequence_unique unique (stage_id, sequence),
  constraint competition_matches_group_context check (
    (match_kind = 'round_robin' and group_id is not null and round_number = 1)
    or (match_kind = 'knockout' and group_id is null)
  ),
  constraint competition_matches_slot_a_check check (
    (slot_a_source_type = 'participant' and slot_a_assignment_id is not null and slot_a_profile_id is not null and slot_a_source_group_id is null and slot_a_source_placement is null and slot_a_source_match_id is null)
    or (slot_a_source_type = 'group_placement' and slot_a_assignment_id is null and slot_a_profile_id is null and slot_a_source_group_id is not null and slot_a_source_placement > 0 and slot_a_source_match_id is null)
    or (slot_a_source_type = 'match_winner' and slot_a_assignment_id is null and slot_a_profile_id is null and slot_a_source_group_id is null and slot_a_source_placement is null and slot_a_source_match_id is not null)
    or (slot_a_source_type = 'bye' and slot_a_assignment_id is null and slot_a_profile_id is null and slot_a_source_group_id is null and slot_a_source_placement is null and slot_a_source_match_id is null)
  ),
  constraint competition_matches_slot_b_check check (
    (slot_b_source_type = 'participant' and slot_b_assignment_id is not null and slot_b_profile_id is not null and slot_b_source_group_id is null and slot_b_source_placement is null and slot_b_source_match_id is null)
    or (slot_b_source_type = 'group_placement' and slot_b_assignment_id is null and slot_b_profile_id is null and slot_b_source_group_id is not null and slot_b_source_placement > 0 and slot_b_source_match_id is null)
    or (slot_b_source_type = 'match_winner' and slot_b_assignment_id is null and slot_b_profile_id is null and slot_b_source_group_id is null and slot_b_source_placement is null and slot_b_source_match_id is not null)
    or (slot_b_source_type = 'bye' and slot_b_assignment_id is null and slot_b_profile_id is null and slot_b_source_group_id is null and slot_b_source_placement is null and slot_b_source_match_id is null)
  ),
  constraint competition_matches_winner_destination_complete check (
    (winner_to_match_id is null and winner_to_slot is null)
    or (winner_to_match_id is not null and winner_to_slot is not null)
  ),
  constraint competition_matches_distinct_participants check (
    slot_a_profile_id is null or slot_b_profile_id is null or slot_a_profile_id <> slot_b_profile_id
  )
);

create index event_competitions_status_idx on public.event_competitions(status, event_id);
create index competition_stages_event_idx on public.competition_stages(event_id, stage_order);
create index competition_groups_event_idx on public.competition_groups(event_id, group_order);
create index competition_group_members_event_idx on public.competition_group_members(event_id, player_profile_id);
create index competition_group_members_group_idx on public.competition_group_members(group_id, position);
create index competition_matches_event_idx on public.competition_matches(event_id, sequence);
create index competition_matches_destination_idx on public.competition_matches(winner_to_match_id) where winner_to_match_id is not null;
create unique index competition_matches_group_position_unique
on public.competition_matches(group_id, round_match_number)
where match_kind = 'round_robin';
create unique index competition_matches_bracket_position_unique
on public.competition_matches(stage_id, round_number, round_match_number)
where match_kind = 'knockout';
create unique index competition_matches_group_pair_unique
on public.competition_matches(
  group_id,
  least(slot_a_assignment_id, slot_b_assignment_id),
  greatest(slot_a_assignment_id, slot_b_assignment_id)
)
where match_kind = 'round_robin';

create trigger event_competitions_set_updated_at
before update on public.event_competitions
for each row execute function public.set_updated_at();

create function private.user_can_manage_event_competition(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and private.user_can_manage_event_players(check_event_id, check_user_id);
$$;

create function private.user_can_view_event_competition(
  check_event_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and private.user_can_view_event_operations(check_event_id, check_user_id);
$$;

create function private.event_accepts_competition_mutations(check_event_id uuid)
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
      and coalesce(event.starts_at, event.start_datetime) >= now()
  );
$$;

create function private.next_power_of_two(value integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  result integer := 2;
begin
  while result < value loop
    result := result * 2;
  end loop;
  return result;
end;
$$;

create function private.competition_round_label(bracket_size integer, round_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case (bracket_size / power(2, round_number - 1)::integer)
    when 2 then 'Final'
    when 4 then 'Semifinal'
    when 8 then 'Quarterfinal'
    else 'Round of ' || (bracket_size / power(2, round_number - 1)::integer)::text
  end;
$$;

create function public.configure_event_competition(
  p_event_id uuid,
  p_format text,
  p_group_count integer default null,
  p_advancing_per_group integer default null,
  p_participant_assignment_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  competition public.event_competitions;
  selected_ids uuid[];
  selected_count integer;
  qualifier_count integer;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_mutations(p_event_id) then
    raise exception 'competition_event_not_mutable' using errcode = 'P0001';
  end if;
  if p_format not in ('round_robin', 'knockout', 'round_robin_knockout') then
    raise exception 'competition_format_invalid' using errcode = 'P0001';
  end if;

  select array_agg(assignment.id order by assignment.id), count(*)
  into selected_ids, selected_count
  from public.event_player_assignments assignment
  where assignment.event_id = p_event_id
    and assignment.status = 'confirmed'
    and assignment.id = any(coalesce(p_participant_assignment_ids, '{}'::uuid[]));

  if selected_count < 2
    or selected_count <> cardinality(coalesce(p_participant_assignment_ids, '{}'::uuid[]))
    or selected_count <> (select count(distinct value) from unnest(coalesce(p_participant_assignment_ids, '{}'::uuid[])) value) then
    raise exception 'competition_participants_invalid' using errcode = 'P0001';
  end if;

  if p_format = 'round_robin' and (p_group_count is null or p_group_count < 1 or p_group_count > least(26, selected_count)) then
    raise exception 'competition_groups_invalid' using errcode = 'P0001';
  elsif p_format = 'knockout' and (p_group_count is not null or p_advancing_per_group is not null or selected_count > 64) then
    raise exception 'competition_knockout_invalid' using errcode = 'P0001';
  elsif p_format = 'round_robin_knockout' then
    qualifier_count := coalesce(p_group_count, 0) * coalesce(p_advancing_per_group, 0);
    if p_group_count is null or p_group_count < 2 or p_group_count > least(26, selected_count)
      or p_advancing_per_group not in (1, 2)
      or p_advancing_per_group > floor(selected_count::numeric / p_group_count)::integer
      or qualifier_count < 2 or qualifier_count > 64
      or (qualifier_count & (qualifier_count - 1)) <> 0
      or (p_group_count % 2) <> 0 then
      raise exception 'competition_progression_invalid' using errcode = 'P0001';
    end if;
  end if;

  select * into competition
  from public.event_competitions
  where event_id = p_event_id
  for update;

  if competition.status = 'locked' then
    raise exception 'competition_locked' using errcode = 'P0001';
  end if;

  insert into public.event_competitions (
    event_id, format, status, group_count, advancing_per_group,
    selected_assignment_ids, configured_by_user_id
  ) values (
    p_event_id, p_format, 'draft',
    case when p_format = 'knockout' then null else p_group_count end,
    case when p_format = 'round_robin_knockout' then p_advancing_per_group else null end,
    selected_ids, actor_user_id
  )
  on conflict (event_id) do update set
    format = excluded.format,
    group_count = excluded.group_count,
    advancing_per_group = excluded.advancing_per_group,
    selected_assignment_ids = excluded.selected_assignment_ids,
    configured_by_user_id = excluded.configured_by_user_id,
    status = case when public.event_competitions.status = 'draft' then 'draft' else 'generated' end,
    updated_at = now()
  returning id into competition.id;

  return competition.id;
end;
$$;

create function public.generate_event_competition(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  competition public.event_competitions;
  participant record;
  member_a record;
  member_b record;
  group_row record;
  group_a uuid;
  group_b uuid;
  group_stage_id uuid;
  knockout_stage_id uuid;
  selected_assignment_ids uuid[];
  selected_profile_ids uuid[];
  selected_snapshot_ids uuid[];
  confirmed_snapshot uuid[];
  prior_match_ids uuid[];
  next_match_ids uuid[];
  match_id uuid;
  selected_count integer;
  group_index integer;
  participant_index integer := 0;
  group_position integer;
  sequence_number integer := 0;
  bracket_size integer;
  bye_count integer;
  first_round_matches integer;
  round_number integer;
  matches_in_round integer;
  match_number integer;
  participant_cursor integer;
  qualifier_count integer;
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_mutations(p_event_id) then
    raise exception 'competition_event_not_mutable' using errcode = 'P0001';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  select * into competition from public.event_competitions where event_id = p_event_id for update;
  if competition.id is null then
    raise exception 'competition_not_configured' using errcode = 'P0001';
  end if;
  if competition.status = 'locked' then
    raise exception 'competition_locked' using errcode = 'P0001';
  end if;

  select
    array_agg(assignment.id order by profile.last_name, profile.first_name, assignment.id),
    array_agg(profile.id order by profile.last_name, profile.first_name, assignment.id),
    count(*)
  into selected_assignment_ids, selected_profile_ids, selected_count
  from public.event_player_assignments assignment
  join public.profiles profile on profile.id = assignment.player_profile_id
  where assignment.event_id = p_event_id
    and assignment.status = 'confirmed'
    and assignment.id = any(competition.selected_assignment_ids);

  if selected_count <> cardinality(competition.selected_assignment_ids) or selected_count < 2 then
    raise exception 'competition_participants_changed' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into selected_snapshot_ids
  from public.event_player_assignments
  where event_id = p_event_id
    and status = 'confirmed'
    and id = any(competition.selected_assignment_ids);

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into confirmed_snapshot
  from public.event_player_assignments
  where event_id = p_event_id and status = 'confirmed';

  if competition.format in ('round_robin', 'round_robin_knockout')
    and (competition.group_count is null or competition.group_count > selected_count) then
    raise exception 'competition_groups_invalid' using errcode = 'P0001';
  end if;

  delete from public.competition_stages where competition_id = competition.id;

  if competition.format in ('round_robin', 'round_robin_knockout') then
    insert into public.competition_stages (competition_id, event_id, stage_type, stage_order, label)
    values (competition.id, p_event_id, 'group', 1, 'Group Stage')
    returning id into group_stage_id;

    for group_index in 1..competition.group_count loop
      insert into public.competition_groups (competition_id, stage_id, event_id, label, group_order)
      values (competition.id, group_stage_id, p_event_id, 'Group ' || chr(64 + group_index), group_index);
    end loop;

    for participant in
      select assignment.id as assignment_id, assignment.player_profile_id
      from public.event_player_assignments assignment
      join public.profiles profile on profile.id = assignment.player_profile_id
      where assignment.id = any(competition.selected_assignment_ids)
      order by profile.last_name, profile.first_name, assignment.id
    loop
      participant_index := participant_index + 1;
      group_index := case
        when ((participant_index - 1) % (competition.group_count * 2)) < competition.group_count
          then ((participant_index - 1) % (competition.group_count * 2)) + 1
        else (competition.group_count * 2) - ((participant_index - 1) % (competition.group_count * 2))
      end;
      select id into group_a from public.competition_groups
      where stage_id = group_stage_id and group_order = group_index;
      select coalesce(max(position), 0) + 1 into group_position
      from public.competition_group_members where group_id = group_a;
      insert into public.competition_group_members (
        competition_id, stage_id, group_id, event_id,
        event_player_assignment_id, player_profile_id, position
      ) values (
        competition.id, group_stage_id, group_a, p_event_id,
        participant.assignment_id, participant.player_profile_id, group_position
      );
    end loop;

    for group_row in select * from public.competition_groups where stage_id = group_stage_id order by group_order loop
      match_number := 0;
      for member_a in select * from public.competition_group_members where group_id = group_row.id order by position loop
        for member_b in select * from public.competition_group_members where group_id = group_row.id and position > member_a.position order by position loop
          match_number := match_number + 1;
          sequence_number := sequence_number + 1;
          insert into public.competition_matches (
            competition_id, stage_id, event_id, group_id, match_kind,
            round_number, round_label, round_match_number, sequence,
            slot_a_source_type, slot_a_assignment_id, slot_a_profile_id,
            slot_b_source_type, slot_b_assignment_id, slot_b_profile_id
          ) values (
            competition.id, group_stage_id, p_event_id, group_row.id, 'round_robin',
            1, group_row.label, match_number, sequence_number,
            'participant', member_a.event_player_assignment_id, member_a.player_profile_id,
            'participant', member_b.event_player_assignment_id, member_b.player_profile_id
          );
        end loop;
      end loop;
    end loop;
  end if;

  if competition.format = 'knockout' then
    bracket_size := private.next_power_of_two(selected_count);
    insert into public.competition_stages (competition_id, event_id, stage_type, stage_order, label)
    values (competition.id, p_event_id, 'knockout', 1, 'Knockout Stage')
    returning id into knockout_stage_id;
    bye_count := bracket_size - selected_count;
    first_round_matches := bracket_size / 2;
    participant_cursor := 1;
    prior_match_ids := '{}'::uuid[];
    for match_number in 1..first_round_matches loop
      sequence_number := sequence_number + 1;
      if match_number <= bye_count then
        insert into public.competition_matches (
          competition_id, stage_id, event_id, match_kind, round_number, round_label,
          round_match_number, sequence, slot_a_source_type, slot_a_assignment_id,
          slot_a_profile_id, slot_b_source_type
        ) values (
          competition.id, knockout_stage_id, p_event_id, 'knockout', 1,
          private.competition_round_label(bracket_size, 1), match_number, sequence_number,
          'participant', selected_assignment_ids[participant_cursor], selected_profile_ids[participant_cursor], 'bye'
        ) returning id into match_id;
        participant_cursor := participant_cursor + 1;
      else
        insert into public.competition_matches (
          competition_id, stage_id, event_id, match_kind, round_number, round_label,
          round_match_number, sequence, slot_a_source_type, slot_a_assignment_id,
          slot_a_profile_id, slot_b_source_type, slot_b_assignment_id, slot_b_profile_id
        ) values (
          competition.id, knockout_stage_id, p_event_id, 'knockout', 1,
          private.competition_round_label(bracket_size, 1), match_number, sequence_number,
          'participant', selected_assignment_ids[participant_cursor], selected_profile_ids[participant_cursor],
          'participant', selected_assignment_ids[participant_cursor + 1], selected_profile_ids[participant_cursor + 1]
        ) returning id into match_id;
        participant_cursor := participant_cursor + 2;
      end if;
      prior_match_ids := array_append(prior_match_ids, match_id);
    end loop;
  elsif competition.format = 'round_robin_knockout' then
    qualifier_count := competition.group_count * competition.advancing_per_group;
    bracket_size := qualifier_count;
    insert into public.competition_stages (competition_id, event_id, stage_type, stage_order, label)
    values (competition.id, p_event_id, 'knockout', 2, 'Knockout Stage')
    returning id into knockout_stage_id;
    prior_match_ids := '{}'::uuid[];
    match_number := 0;
    for group_index in 1..competition.group_count by 2 loop
      select id into group_a from public.competition_groups where stage_id = group_stage_id and group_order = group_index;
      select id into group_b from public.competition_groups where stage_id = group_stage_id and group_order = group_index + 1;
      match_number := match_number + 1;
      sequence_number := sequence_number + 1;
      insert into public.competition_matches (
        competition_id, stage_id, event_id, match_kind, round_number, round_label,
        round_match_number, sequence, slot_a_source_type, slot_a_source_group_id,
        slot_a_source_placement, slot_b_source_type, slot_b_source_group_id, slot_b_source_placement
      ) values (
        competition.id, knockout_stage_id, p_event_id, 'knockout', 1,
        private.competition_round_label(bracket_size, 1), match_number, sequence_number,
        'group_placement', group_a, 1, 'group_placement', group_b, competition.advancing_per_group
      ) returning id into match_id;
      prior_match_ids := array_append(prior_match_ids, match_id);
      if competition.advancing_per_group = 2 then
        match_number := match_number + 1;
        sequence_number := sequence_number + 1;
        insert into public.competition_matches (
          competition_id, stage_id, event_id, match_kind, round_number, round_label,
          round_match_number, sequence, slot_a_source_type, slot_a_source_group_id,
          slot_a_source_placement, slot_b_source_type, slot_b_source_group_id, slot_b_source_placement
        ) values (
          competition.id, knockout_stage_id, p_event_id, 'knockout', 1,
          private.competition_round_label(bracket_size, 1), match_number, sequence_number,
          'group_placement', group_b, 1, 'group_placement', group_a, 2
        ) returning id into match_id;
        prior_match_ids := array_append(prior_match_ids, match_id);
      end if;
    end loop;
  end if;

  if competition.format in ('knockout', 'round_robin_knockout') then
    round_number := 2;
    matches_in_round := cardinality(prior_match_ids) / 2;
    while matches_in_round >= 1 loop
      next_match_ids := '{}'::uuid[];
      for match_number in 1..matches_in_round loop
        sequence_number := sequence_number + 1;
        insert into public.competition_matches (
          competition_id, stage_id, event_id, match_kind, round_number, round_label,
          round_match_number, sequence, slot_a_source_type, slot_a_source_match_id,
          slot_b_source_type, slot_b_source_match_id
        ) values (
          competition.id, knockout_stage_id, p_event_id, 'knockout', round_number,
          private.competition_round_label(bracket_size, round_number), match_number, sequence_number,
          'match_winner', prior_match_ids[(match_number * 2) - 1],
          'match_winner', prior_match_ids[match_number * 2]
        ) returning id into match_id;
        update public.competition_matches
        set winner_to_match_id = match_id,
            winner_to_slot = case when id = prior_match_ids[(match_number * 2) - 1] then 'a' else 'b' end
        where id in (prior_match_ids[(match_number * 2) - 1], prior_match_ids[match_number * 2]);
        next_match_ids := array_append(next_match_ids, match_id);
      end loop;
      prior_match_ids := next_match_ids;
      round_number := round_number + 1;
      matches_in_round := matches_in_round / 2;
    end loop;
  end if;

  update public.event_competitions set
    status = 'generated',
    generated_assignment_ids = selected_snapshot_ids,
    participant_snapshot_ids = confirmed_snapshot,
    structure_version = structure_version + 1,
    generated_by_user_id = actor_user_id,
    generated_at = now(),
    locked_by_user_id = null,
    locked_at = null,
    updated_at = now()
  where id = competition.id;

  return competition.id;
end;
$$;

create function public.move_competition_group_member(p_member_id uuid, p_target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  member public.competition_group_members;
  target_group public.competition_groups;
  competition public.event_competitions;
  group_row record;
  member_a record;
  member_b record;
  next_position integer;
  sequence_number integer := 0;
  match_number integer;
begin
  select * into member from public.competition_group_members where id = p_member_id;
  select * into target_group from public.competition_groups where id = p_target_group_id;
  if member.id is null or target_group.id is null
    or member.event_id <> target_group.event_id
    or member.stage_id <> target_group.stage_id then
    raise exception 'competition_group_mismatch' using errcode = 'P0001';
  end if;
  if not private.user_can_manage_event_competition(member.event_id, actor_user_id) then
    raise exception 'competition_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_mutations(member.event_id) then
    raise exception 'competition_event_not_mutable' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where id = member.competition_id for update;
  if competition.status <> 'generated' then
    raise exception 'competition_not_adjustable' using errcode = 'P0001';
  end if;
  if member.group_id = target_group.id then
    return;
  end if;
  if (select count(*) from public.competition_group_members where group_id = member.group_id) <= 1 then
    raise exception 'competition_group_would_be_empty' using errcode = 'P0001';
  end if;

  select coalesce(max(position), 0) + 1 into next_position
  from public.competition_group_members where group_id = target_group.id;
  update public.competition_group_members
  set group_id = target_group.id, position = next_position
  where id = member.id;

  delete from public.competition_matches where stage_id = member.stage_id;
  for group_row in select * from public.competition_groups where stage_id = member.stage_id order by group_order loop
    match_number := 0;
    for member_a in select * from public.competition_group_members where group_id = group_row.id order by position loop
      for member_b in select * from public.competition_group_members where group_id = group_row.id and position > member_a.position order by position loop
        match_number := match_number + 1;
        sequence_number := sequence_number + 1;
        insert into public.competition_matches (
          competition_id, stage_id, event_id, group_id, match_kind,
          round_number, round_label, round_match_number, sequence,
          slot_a_source_type, slot_a_assignment_id, slot_a_profile_id,
          slot_b_source_type, slot_b_assignment_id, slot_b_profile_id
        ) values (
          member.competition_id, member.stage_id, member.event_id, group_row.id, 'round_robin',
          1, group_row.label, match_number, sequence_number,
          'participant', member_a.event_player_assignment_id, member_a.player_profile_id,
          'participant', member_b.event_player_assignment_id, member_b.player_profile_id
        );
      end loop;
    end loop;
  end loop;
  update public.event_competitions set structure_version = structure_version + 1, generated_at = now() where id = competition.id;
end;
$$;

create function public.lock_event_competition(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  competition public.event_competitions;
  current_confirmed_ids uuid[];
begin
  if not private.user_can_manage_event_competition(p_event_id, actor_user_id) then
    raise exception 'competition_access' using errcode = 'P0001';
  end if;
  if not private.event_accepts_competition_mutations(p_event_id) then
    raise exception 'competition_event_not_mutable' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where event_id = p_event_id for update;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into current_confirmed_ids
  from public.event_player_assignments where event_id = p_event_id and status = 'confirmed';
  if competition.status <> 'generated'
    or competition.generated_assignment_ids <> competition.selected_assignment_ids
    or competition.participant_snapshot_ids <> current_confirmed_ids
    or competition.updated_at > competition.generated_at then
    raise exception 'competition_stale' using errcode = 'P0001';
  end if;
  update public.event_competitions set
    status = 'locked', locked_by_user_id = actor_user_id, locked_at = now(), updated_at = now()
  where id = competition.id;
end;
$$;

create function private.protect_locked_competition_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_event_id uuid;
  affects_confirmed boolean;
begin
  if tg_op = 'INSERT' then
    affected_event_id := new.event_id;
    affects_confirmed := new.status = 'confirmed';
  elsif tg_op = 'DELETE' then
    affected_event_id := old.event_id;
    affects_confirmed := old.status = 'confirmed';
  else
    affected_event_id := new.event_id;
    affects_confirmed := new.status = 'confirmed' or old.status = 'confirmed';
  end if;
  if affects_confirmed and exists (
    select 1 from public.event_competitions competition
    where competition.event_id = affected_event_id and competition.status = 'locked'
  ) then
    raise exception 'competition_locked' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger event_player_assignments_protect_locked_competition
before insert or update or delete on public.event_player_assignments
for each row execute function private.protect_locked_competition_participants();

create function public.get_event_competition_structure(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  competition public.event_competitions;
  current_confirmed_ids uuid[];
  can_manage boolean;
begin
  can_manage := private.user_can_manage_event_competition(p_event_id, (select auth.uid()));
  if not can_manage and not private.user_can_view_event_competition(p_event_id, (select auth.uid())) then
    raise exception 'competition_access' using errcode = 'P0001';
  end if;
  select * into competition from public.event_competitions where event_id = p_event_id;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into current_confirmed_ids
  from public.event_player_assignments where event_id = p_event_id and status = 'confirmed';

  return jsonb_build_object(
    'can_manage', can_manage,
    'competition', case when competition.id is null then null else jsonb_build_object(
      'id', competition.id,
      'event_id', competition.event_id,
      'format', competition.format,
      'status', competition.status,
      'group_count', competition.group_count,
      'advancing_per_group', competition.advancing_per_group,
      'selected_assignment_ids', competition.selected_assignment_ids,
      'participant_count', cardinality(competition.generated_assignment_ids),
      'structure_version', competition.structure_version,
      'generated_at', competition.generated_at,
      'locked_at', competition.locked_at,
      'is_stale', competition.status <> 'draft' and (
        competition.generated_assignment_ids <> competition.selected_assignment_ids
        or competition.participant_snapshot_ids <> current_confirmed_ids
        or competition.updated_at > competition.generated_at
      )
    ) end,
    'confirmed_participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', assignment.id,
        'profile_id', profile.id,
        'player_name', profile.first_name || ' ' || profile.last_name,
        'is_junior', profile.is_junior,
        'junior_stage', profile.junior_stage::text,
        'selected', competition.id is null or assignment.id = any(competition.selected_assignment_ids)
      ) order by profile.last_name, profile.first_name, assignment.id)
      from public.event_player_assignments assignment
      join public.profiles profile on profile.id = assignment.player_profile_id
      where assignment.event_id = p_event_id and assignment.status = 'confirmed'
    ), '[]'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', stage.id,
        'stage_type', stage.stage_type,
        'stage_order', stage.stage_order,
        'label', stage.label,
        'groups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', group_row.id,
            'label', group_row.label,
            'group_order', group_row.group_order,
            'members', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', member.id,
                'assignment_id', member.event_player_assignment_id,
                'profile_id', member.player_profile_id,
                'player_name', profile.first_name || ' ' || profile.last_name,
                'position', member.position
              ) order by member.position)
              from public.competition_group_members member
              join public.profiles profile on profile.id = member.player_profile_id
              where member.group_id = group_row.id
            ), '[]'::jsonb)
          ) order by group_row.group_order)
          from public.competition_groups group_row where group_row.stage_id = stage.id
        ), '[]'::jsonb),
        'matches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', match.id,
            'group_id', match.group_id,
            'match_kind', match.match_kind,
            'round_number', match.round_number,
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
            'slot_a_source_type', match.slot_a_source_type,
            'slot_b_source_type', match.slot_b_source_type,
            'winner_to_match_id', match.winner_to_match_id,
            'winner_to_slot', match.winner_to_slot
          ) order by match.sequence)
          from public.competition_matches match
          left join public.profiles profile_a on profile_a.id = match.slot_a_profile_id
          left join public.profiles profile_b on profile_b.id = match.slot_b_profile_id
          left join public.competition_groups group_a on group_a.id = match.slot_a_source_group_id
          left join public.competition_groups group_b on group_b.id = match.slot_b_source_group_id
          left join public.competition_matches source_a on source_a.id = match.slot_a_source_match_id
          left join public.competition_matches source_b on source_b.id = match.slot_b_source_match_id
          where match.stage_id = stage.id
        ), '[]'::jsonb)
      ) order by stage.stage_order)
      from public.competition_stages stage where stage.competition_id = competition.id
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.event_competitions enable row level security;
alter table public.competition_stages enable row level security;
alter table public.competition_groups enable row level security;
alter table public.competition_group_members enable row level security;
alter table public.competition_matches enable row level security;

create policy "Event operations staff can read event competitions"
on public.event_competitions for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));
create policy "Event operations staff can read competition stages"
on public.competition_stages for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));
create policy "Event operations staff can read competition groups"
on public.competition_groups for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));
create policy "Event operations staff can read competition group members"
on public.competition_group_members for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));
create policy "Event operations staff can read competition matches"
on public.competition_matches for select to authenticated
using (private.user_can_view_event_competition(event_id, (select auth.uid())));

revoke all privileges on table public.event_competitions from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_stages from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_groups from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_group_members from public, anon, authenticated, service_role;
revoke all privileges on table public.competition_matches from public, anon, authenticated, service_role;
grant select on table public.event_competitions, public.competition_stages, public.competition_groups,
  public.competition_group_members, public.competition_matches to authenticated;
grant all privileges on table public.event_competitions, public.competition_stages, public.competition_groups,
  public.competition_group_members, public.competition_matches to service_role;

revoke all on function private.user_can_manage_event_competition(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_can_view_event_competition(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.event_accepts_competition_mutations(uuid) from public, anon, authenticated, service_role;
revoke all on function private.next_power_of_two(integer) from public, anon, authenticated, service_role;
revoke all on function private.competition_round_label(integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.protect_locked_competition_participants() from public, anon, authenticated, service_role;
grant execute on function private.user_can_manage_event_competition(uuid, uuid) to authenticated, service_role;
grant execute on function private.user_can_view_event_competition(uuid, uuid) to authenticated, service_role;

revoke all on function public.configure_event_competition(uuid, text, integer, integer, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.generate_event_competition(uuid) from public, anon, authenticated, service_role;
revoke all on function public.move_competition_group_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.lock_event_competition(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_event_competition_structure(uuid) from public, anon, authenticated, service_role;
grant execute on function public.configure_event_competition(uuid, text, integer, integer, uuid[]) to authenticated, service_role;
grant execute on function public.generate_event_competition(uuid) to authenticated, service_role;
grant execute on function public.move_competition_group_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.lock_event_competition(uuid) to authenticated, service_role;
grant execute on function public.get_event_competition_structure(uuid) to authenticated, service_role;

comment on table public.event_competitions is
'Shared event competition configuration and lifecycle. It is independent from the event lifecycle and from legacy paid entries/results.';
comment on table public.competition_matches is
'Persistent structural tournament matches only. Scores, courts, scheduling, officials and results are deliberately deferred.';

commit;
