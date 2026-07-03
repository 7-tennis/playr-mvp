do $$
begin
  create type public.junior_rating_confidence as enum ('new', 'building', 'active', 'established', 'needs_update');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists junior_rating numeric(4,2) not null default 2.50,
  add column if not exists junior_rating_confidence public.junior_rating_confidence not null default 'new',
  add column if not exists participation_score integer not null default 0,
  add column if not exists matches_played integer not null default 0,
  add column if not exists wins integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists events_played integer not null default 0,
  add column if not exists close_matches integer not null default 0,
  add column if not exists stage_readiness_score integer not null default 0,
  add column if not exists last_rating_update timestamptz,
  add column if not exists rating_locked boolean not null default false,
  add column if not exists rating_notes text;

alter table public.profiles
  drop constraint if exists profiles_junior_rating_range,
  drop constraint if exists profiles_junior_stats_non_negative,
  drop constraint if exists profiles_stage_readiness_range;

alter table public.profiles
  add constraint profiles_junior_rating_range check (
    is_junior = false
    or (
      (coalesce(junior_stage, 'not_sure') in ('red_ball', 'orange_ball', 'green_ball', 'not_sure') and junior_rating >= 1.00 and junior_rating <= 5.00)
      or
      (junior_stage = 'yellow_ball' and junior_rating >= 1.00 and junior_rating <= 10.00)
    )
  ),
  add constraint profiles_junior_stats_non_negative check (
    participation_score >= 0
    and matches_played >= 0
    and wins >= 0
    and losses >= 0
    and events_played >= 0
    and close_matches >= 0
  ),
  add constraint profiles_stage_readiness_range check (stage_readiness_score >= 0 and stage_readiness_score <= 100);

create table if not exists public.junior_rating_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  previous_stage text,
  previous_rating numeric(4,2),
  new_stage text,
  new_rating numeric(4,2),
  change_amount numeric(4,2) not null default 0,
  reason text not null,
  event_id uuid references public.events(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint junior_rating_history_reason_valid check (
    reason in ('event_result', 'manual_adjustment', 'stage_transition', 'admin_correction')
  )
);

create table if not exists public.junior_achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  badge_name text not null,
  category text not null,
  stage text not null default 'all',
  badge_type text not null default 'automatic',
  earned_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  related_event_id uuid references public.events(id) on delete set null,
  related_match_id uuid references public.matches(id) on delete set null,
  notes text,
  constraint junior_achievements_badge_type_valid check (badge_type in ('automatic', 'coach_approved', 'admin_approved')),
  constraint junior_achievements_category_valid check (category in ('participation', 'match', 'rating', 'coach', 'stage'))
);

create unique index if not exists junior_rating_history_match_player_unique
on public.junior_rating_history(match_id, player_id)
where match_id is not null and reason = 'event_result';

create unique index if not exists junior_achievements_player_badge_unique
on public.junior_achievements(player_id, badge_key);

create index if not exists profiles_junior_progress_idx
on public.profiles(is_junior, junior_stage, junior_rating_confidence, participation_score desc);

create index if not exists junior_rating_history_player_created_idx
on public.junior_rating_history(player_id, created_at desc);

create index if not exists junior_achievements_player_earned_idx
on public.junior_achievements(player_id, earned_at desc);

create or replace function public.junior_stage_slug(stage_value text)
returns text
language sql
immutable
as $$
  select case stage_value
    when 'red_ball' then 'red'
    when 'orange_ball' then 'orange'
    when 'green_ball' then 'green'
    when 'yellow_ball' then 'yellow'
    when 'red' then 'red'
    when 'orange' then 'orange'
    when 'green' then 'green'
    when 'yellow' then 'yellow'
    else 'red'
  end;
$$;

create or replace function public.junior_stage_display(stage_value text)
returns text
language sql
immutable
as $$
  select case public.junior_stage_slug(stage_value)
    when 'red' then 'Red'
    when 'orange' then 'Orange'
    when 'green' then 'Green'
    when 'yellow' then 'Yellow'
    else 'Red'
  end;
$$;

create or replace function public.junior_rating_max(stage_value text)
returns numeric
language sql
immutable
as $$
  select case public.junior_stage_slug(stage_value)
    when 'yellow' then 10.00
    else 5.00
  end;
$$;

create or replace function public.junior_confidence_for_count(match_count integer, last_activity timestamptz default now())
returns public.junior_rating_confidence
language sql
stable
as $$
  select case
    when last_activity is not null and last_activity < now() - interval '90 days' then 'needs_update'::public.junior_rating_confidence
    when match_count >= 13 then 'established'::public.junior_rating_confidence
    when match_count >= 6 then 'active'::public.junior_rating_confidence
    when match_count >= 3 then 'building'::public.junior_rating_confidence
    else 'new'::public.junior_rating_confidence
  end;
$$;

create or replace function public.junior_rating_display(stage_value text, rating_value numeric)
returns text
language sql
immutable
as $$
  select public.junior_stage_display(stage_value) || ' ' || to_char(round(coalesce(rating_value, 2.50), 1), 'FM999990.0');
$$;

create or replace function public.junior_score_is_close(score_text text)
returns boolean
language plpgsql
immutable
as $$
declare
  item text;
  total_a integer := 0;
  total_b integer := 0;
  index integer := 1;
begin
  for item in
    select match_value[1]
    from regexp_matches(coalesce(score_text, ''), '\d+', 'g') as match_value
  loop
    if index % 2 = 1 then
      total_a := total_a + item::integer;
    else
      total_b := total_b + item::integer;
    end if;
    index := index + 1;
  end loop;

  if index = 1 then
    return false;
  end if;

  return abs(total_a - total_b) <= 2;
end;
$$;

create or replace function public.award_junior_badge(
  target_player_id uuid,
  target_badge_key text,
  target_badge_name text,
  target_category text,
  target_stage text default 'all',
  target_badge_type text default 'automatic',
  target_approved_by uuid default null,
  target_event_id uuid default null,
  target_match_id uuid default null,
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.junior_achievements (
    player_id,
    badge_key,
    badge_name,
    category,
    stage,
    badge_type,
    approved_by,
    related_event_id,
    related_match_id,
    notes
  )
  select
    target_player_id,
    target_badge_key,
    target_badge_name,
    target_category,
    target_stage,
    target_badge_type,
    target_approved_by,
    target_event_id,
    target_match_id,
    target_notes
  where exists (
    select 1
    from public.profiles profile
    where profile.id = target_player_id
      and profile.is_junior = true
  )
  on conflict (player_id, badge_key) do nothing;
end;
$$;

create or replace function public.award_junior_milestone_badges(target_player_id uuid, target_match_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stats record;
begin
  select *
  into stats
  from public.profiles
  where id = target_player_id
    and is_junior = true;

  if stats.id is null then
    return;
  end if;

  if stats.matches_played >= 1 then
    perform public.award_junior_badge(target_player_id, 'first_match', 'First Match', 'match', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.wins >= 1 then
    perform public.award_junior_badge(target_player_id, 'first_win', 'First Win', 'match', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.matches_played >= 5 then
    perform public.award_junior_badge(target_player_id, 'five_matches', '5 Matches', 'match', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.matches_played >= 10 then
    perform public.award_junior_badge(target_player_id, 'ten_matches', '10 Matches', 'match', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.matches_played >= 1 then
    perform public.award_junior_badge(target_player_id, 'first_verified_result', 'First Verified Result', 'rating', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.junior_rating_confidence = 'active' then
    perform public.award_junior_badge(target_player_id, 'rating_active', 'Rating Active', 'rating', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.close_matches >= 1 then
    perform public.award_junior_badge(target_player_id, 'close_match_player', 'Close Match Player', 'match', public.junior_stage_slug(stats.junior_stage), 'automatic', null, null, target_match_id);
  end if;

  if stats.events_played >= 3 then
    perform public.award_junior_badge(target_player_id, 'event_player', 'Event Player', 'participation', public.junior_stage_slug(stats.junior_stage));
  end if;
end;
$$;

create or replace function public.apply_junior_event_entry_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    participation_score = participation_score + 15,
    events_played = events_played + 1,
    last_rating_update = coalesce(last_rating_update, now()),
    junior_rating_confidence = public.junior_confidence_for_count(matches_played, coalesce(last_rating_update, now()))
  where id = new.profile_id
    and is_junior = true;

  perform public.award_junior_badge(new.profile_id, 'first_event', 'First Event', 'participation', 'all', 'automatic', null, new.event_id, null);

  perform public.award_junior_milestone_badges(new.profile_id);

  return new;
end;
$$;

drop trigger if exists event_entries_junior_participation on public.event_entries;
create trigger event_entries_junior_participation
after insert on public.event_entries
for each row
when (new.entry_status <> 'cancelled')
execute function public.apply_junior_event_entry_participation();

create or replace function public.junior_rating_delta(
  player_rating numeric,
  opponent_rating numeric,
  did_win boolean,
  was_close boolean
)
returns numeric
language sql
immutable
as $$
  select case
    when did_win and opponent_rating - player_rating >= 0.50 then 0.25
    when did_win and abs(opponent_rating - player_rating) < 0.50 then 0.15
    when did_win then 0.05
    when not did_win and opponent_rating - player_rating >= 0.50 and was_close then 0.03
    when not did_win and opponent_rating - player_rating >= 0.50 then -0.05
    when not did_win and abs(opponent_rating - player_rating) < 0.50 and was_close then -0.05
    when not did_win and abs(opponent_rating - player_rating) < 0.50 then -0.10
    else -0.20
  end;
$$;

create or replace function public.apply_junior_match_progress(target_match_id uuid, target_created_by uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  match_record record;
  player_record record;
  opponent_record record;
  loser_profile_id uuid;
  was_close boolean;
  did_win boolean;
  rating_delta numeric(4,2);
  previous_rating numeric(4,2);
  new_rating numeric(4,2);
  max_rating numeric(4,2);
  update_count integer := 0;
begin
  select
    match.id,
    match.match_invite_id,
    match.winner_profile_id,
    match.score_text,
    match.verification_status,
    invite.inviter_profile_id,
    invite.opponent_profile_id
  into match_record
  from public.matches match
  join public.match_invites invite
    on invite.id = match.match_invite_id
  where match.id = target_match_id;

  if match_record.id is null then
    raise exception 'Match % not found', target_match_id;
  end if;

  if match_record.verification_status not in ('verified', 'admin_verified') then
    return false;
  end if;

  if exists (
    select 1
    from public.junior_rating_history history
    where history.match_id = target_match_id
      and history.reason = 'event_result'
  ) then
    return false;
  end if;

  loser_profile_id := case
    when match_record.winner_profile_id = match_record.inviter_profile_id then match_record.opponent_profile_id
    else match_record.inviter_profile_id
  end;

  if match_record.winner_profile_id not in (match_record.inviter_profile_id, match_record.opponent_profile_id) then
    raise exception 'Winner profile is not part of this match';
  end if;

  was_close := public.junior_score_is_close(match_record.score_text);

  for player_record in
    select *
    from public.profiles profile
    where profile.id in (match_record.inviter_profile_id, match_record.opponent_profile_id)
      and profile.is_junior = true
    for update
  loop
    select *
    into opponent_record
    from public.profiles profile
    where profile.id = case
      when player_record.id = match_record.inviter_profile_id then match_record.opponent_profile_id
      else match_record.inviter_profile_id
    end;

    did_win := player_record.id = match_record.winner_profile_id;
    previous_rating := player_record.junior_rating;
    rating_delta := 0;

    if player_record.rating_locked = false
      and opponent_record.is_junior = true
      and public.junior_stage_slug(player_record.junior_stage) = public.junior_stage_slug(opponent_record.junior_stage) then
      rating_delta := public.junior_rating_delta(player_record.junior_rating, opponent_record.junior_rating, did_win, was_close);
    end if;

    max_rating := public.junior_rating_max(player_record.junior_stage);
    new_rating := round(least(max_rating, greatest(1.00, previous_rating + rating_delta)), 2);

    update public.profiles
    set
      junior_rating = new_rating,
      participation_score = participation_score + 15 + case when did_win then 3 else 0 end + case when was_close then 3 else 0 end,
      matches_played = matches_played + 1,
      wins = wins + case when did_win then 1 else 0 end,
      losses = losses + case when did_win then 0 else 1 end,
      close_matches = close_matches + case when was_close then 1 else 0 end,
      junior_rating_confidence = public.junior_confidence_for_count(matches_played + 1, now()),
      stage_readiness_score = least(100, greatest(0, round(((new_rating - 1.00) / (max_rating - 1.00)) * 70 + least(30, (matches_played + 1) * 2))::integer)),
      last_rating_update = now()
    where id = player_record.id;

    if rating_delta <> 0 then
      insert into public.junior_rating_history (
        player_id,
        previous_stage,
        previous_rating,
        new_stage,
        new_rating,
        change_amount,
        reason,
        match_id,
        notes,
        created_by
      )
      values (
        player_record.id,
        public.junior_stage_slug(player_record.junior_stage),
        previous_rating,
        public.junior_stage_slug(player_record.junior_stage),
        new_rating,
        new_rating - previous_rating,
        'event_result',
        target_match_id,
        case
          when player_record.rating_locked then 'Rating locked; stats updated only.'
          when opponent_record.is_junior is not true then 'Opponent is not a junior; stats updated only.'
          when public.junior_stage_slug(player_record.junior_stage) <> public.junior_stage_slug(opponent_record.junior_stage) then 'Different junior stages; stats updated only.'
          else 'Verified match result.'
        end,
        target_created_by
      )
      on conflict do nothing;
    end if;

    perform public.award_junior_milestone_badges(player_record.id, target_match_id);
    update_count := update_count + 1;
  end loop;

  return update_count > 0;
end;
$$;

create or replace function public.apply_verified_match_progress(target_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  junior_applied boolean;
  open_applied boolean := false;
  has_junior boolean := false;
  match_record record;
begin
  if not public.is_admin((select auth.uid()))
    and not exists (
      select 1
      from public.matches match
      where match.id = target_match_id
        and public.match_invite_involves_user(match.match_invite_id, (select auth.uid()))
    ) then
    raise exception 'Not allowed to calculate this match progress';
  end if;

  select
    invite.inviter_profile_id,
    inviter.is_junior as inviter_is_junior,
    invite.opponent_profile_id,
    opponent.is_junior as opponent_is_junior
  into match_record
  from public.matches match
  join public.match_invites invite on invite.id = match.match_invite_id
  join public.profiles inviter on inviter.id = invite.inviter_profile_id
  join public.profiles opponent on opponent.id = invite.opponent_profile_id
  where match.id = target_match_id;

  has_junior := coalesce(match_record.inviter_is_junior, false) or coalesce(match_record.opponent_is_junior, false);

  if has_junior then
    junior_applied := public.apply_junior_match_progress(target_match_id, (select auth.uid()));
    return junior_applied;
  end if;

  open_applied := public.apply_verified_match_rating(target_match_id);
  return open_applied;
end;
$$;

create or replace function public.apply_rating_after_match_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status in ('verified', 'admin_verified')
    and (
      tg_op = 'INSERT'
      or old.verification_status is distinct from new.verification_status
    ) then
    perform public.apply_verified_match_progress(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists matches_apply_rating_after_verification on public.matches;
create trigger matches_apply_rating_after_verification
after insert or update of verification_status on public.matches
for each row execute function public.apply_rating_after_match_verification();

create or replace function public.junior_stage_transition_rating(previous_stage text, previous_rating numeric, target_stage text)
returns numeric
language sql
immutable
as $$
  select case
    when public.junior_stage_slug(target_stage) in ('orange', 'green') and previous_rating >= 5.00 then 2.40
    when public.junior_stage_slug(target_stage) in ('orange', 'green') and previous_rating >= 4.50 then 2.10
    when public.junior_stage_slug(target_stage) in ('orange', 'green') and previous_rating >= 4.00 then 1.80
    when public.junior_stage_slug(target_stage) in ('orange', 'green') and previous_rating >= 3.50 then 1.50
    when public.junior_stage_slug(target_stage) in ('orange', 'green') then 1.30
    when public.junior_stage_slug(target_stage) = 'yellow' and previous_rating >= 5.00 then 6.00
    when public.junior_stage_slug(target_stage) = 'yellow' and previous_rating >= 4.50 then 5.00
    when public.junior_stage_slug(target_stage) = 'yellow' and previous_rating >= 4.00 then 4.00
    when public.junior_stage_slug(target_stage) = 'yellow' and previous_rating >= 3.50 then 3.00
    when public.junior_stage_slug(target_stage) = 'yellow' then 2.50
    else least(public.junior_rating_max(target_stage), greatest(1.00, previous_rating))
  end;
$$;

create or replace function public.admin_adjust_junior_rating(
  target_player_id uuid,
  target_stage text,
  target_rating numeric,
  target_locked boolean default false,
  target_stage_readiness integer default 0,
  target_notes text default null,
  target_reason text default 'manual_adjustment'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  old_record record;
  normalized_stage text;
  storage_stage text;
  max_rating numeric;
  safe_rating numeric;
begin
  if not public.is_admin(current_user_id) then
    raise exception 'Admin access required';
  end if;

  select *
  into old_record
  from public.profiles
  where id = target_player_id
    and is_junior = true
  for update;

  if old_record.id is null then
    raise exception 'Junior profile % not found', target_player_id;
  end if;

  normalized_stage := public.junior_stage_slug(target_stage);
  storage_stage := normalized_stage || '_ball';
  max_rating := public.junior_rating_max(storage_stage);
  safe_rating := round(least(max_rating, greatest(1.00, target_rating)), 2);

  update public.profiles
  set
    junior_stage = storage_stage,
    junior_rating = safe_rating,
    junior_rating_confidence = public.junior_confidence_for_count(matches_played, coalesce(last_rating_update, now())),
    rating_locked = target_locked,
    stage_readiness_score = least(100, greatest(0, target_stage_readiness)),
    rating_notes = target_notes,
    last_rating_update = now()
  where id = target_player_id;

  if old_record.junior_rating is distinct from safe_rating
    or public.junior_stage_slug(old_record.junior_stage) is distinct from normalized_stage
    or coalesce(old_record.rating_notes, '') is distinct from coalesce(target_notes, '') then
    insert into public.junior_rating_history (
      player_id,
      previous_stage,
      previous_rating,
      new_stage,
      new_rating,
      change_amount,
      reason,
      notes,
      created_by
    )
    values (
      target_player_id,
      public.junior_stage_slug(old_record.junior_stage),
      old_record.junior_rating,
      normalized_stage,
      safe_rating,
      safe_rating - old_record.junior_rating,
      case when target_reason in ('manual_adjustment', 'admin_correction') then target_reason else 'manual_adjustment' end,
      target_notes,
      current_user_id
    );
  end if;
end;
$$;

create or replace function public.admin_transition_junior_stage(
  target_player_id uuid,
  target_stage text,
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  old_record record;
  normalized_stage text;
  storage_stage text;
  converted_rating numeric(4,2);
begin
  if not public.is_admin(current_user_id) then
    raise exception 'Admin access required';
  end if;

  select *
  into old_record
  from public.profiles
  where id = target_player_id
    and is_junior = true
  for update;

  if old_record.id is null then
    raise exception 'Junior profile % not found', target_player_id;
  end if;

  normalized_stage := public.junior_stage_slug(target_stage);
  storage_stage := normalized_stage || '_ball';
  converted_rating := public.junior_stage_transition_rating(old_record.junior_stage, old_record.junior_rating, storage_stage);

  update public.profiles
  set
    junior_stage = storage_stage,
    junior_rating = converted_rating,
    junior_rating_confidence = 'new',
    stage_readiness_score = 0,
    last_rating_update = now(),
    rating_notes = target_notes
  where id = target_player_id;

  insert into public.junior_rating_history (
    player_id,
    previous_stage,
    previous_rating,
    new_stage,
    new_rating,
    change_amount,
    reason,
    notes,
    created_by
  )
  values (
    target_player_id,
    public.junior_stage_slug(old_record.junior_stage),
    old_record.junior_rating,
    normalized_stage,
    converted_rating,
    converted_rating - old_record.junior_rating,
    'stage_transition',
    target_notes,
    current_user_id
  );

  perform public.award_junior_badge(target_player_id, 'stage_climber', 'Stage Climber', 'stage', normalized_stage, 'admin_approved', current_user_id, null, null, target_notes);
end;
$$;

create or replace function public.admin_award_junior_badge(
  target_player_id uuid,
  target_badge_key text,
  target_badge_name text,
  target_category text default 'coach',
  target_stage text default 'all',
  target_badge_type text default 'admin_approved',
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if not public.is_admin(current_user_id) then
    raise exception 'Admin access required';
  end if;

  perform public.award_junior_badge(
    target_player_id,
    target_badge_key,
    target_badge_name,
    target_category,
    target_stage,
    target_badge_type,
    current_user_id,
    null,
    null,
    target_notes
  );
end;
$$;

alter table public.junior_rating_history enable row level security;
alter table public.junior_achievements enable row level security;

grant select on public.junior_rating_history to authenticated;
grant select on public.junior_achievements to authenticated;
grant execute on function public.apply_verified_match_progress(uuid) to authenticated;
grant execute on function public.admin_adjust_junior_rating(uuid, text, numeric, boolean, integer, text, text) to authenticated;
grant execute on function public.admin_transition_junior_stage(uuid, text, text) to authenticated;
grant execute on function public.admin_award_junior_badge(uuid, text, text, text, text, text, text) to authenticated;

revoke all on function public.award_junior_badge(uuid, text, text, text, text, text, uuid, uuid, uuid, text) from public;
revoke all on function public.award_junior_milestone_badges(uuid, uuid) from public;
revoke all on function public.apply_junior_event_entry_participation() from public;
revoke all on function public.apply_junior_match_progress(uuid, uuid) from public;
revoke all on function public.apply_rating_after_match_verification() from public;

drop policy if exists "Users can read owned and linked junior rating history" on public.junior_rating_history;
create policy "Users can read owned and linked junior rating history"
on public.junior_rating_history
for select
to authenticated
using (
  public.is_admin()
  or public.can_manage_profile(player_id, (select auth.uid()))
);

drop policy if exists "Admins can manage junior rating history" on public.junior_rating_history;
create policy "Admins can manage junior rating history"
on public.junior_rating_history
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can read owned and linked junior achievements" on public.junior_achievements;
create policy "Users can read owned and linked junior achievements"
on public.junior_achievements
for select
to authenticated
using (
  public.is_admin()
  or public.can_manage_profile(player_id, (select auth.uid()))
);

drop policy if exists "Admins can manage junior achievements" on public.junior_achievements;
create policy "Admins can manage junior achievements"
on public.junior_achievements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
