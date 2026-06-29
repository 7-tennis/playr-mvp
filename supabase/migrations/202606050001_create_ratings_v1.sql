do $$
begin
  alter type public.player_level add value if not exists 'social';
  alter type public.player_level add value if not exists 'club_competitive';
exception
  when undefined_object then null;
end $$;

do $$
begin
  create type public.rating_confidence as enum ('low', 'medium', 'high');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.ratings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  rating_value numeric(4,2) not null default 3.50,
  starting_rating numeric(4,2) not null default 3.50,
  confidence public.rating_confidence not null default 'low',
  verified_match_count integer not null default 0,
  provisional boolean not null default true,
  last_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ratings_value_range check (rating_value >= 1.00 and rating_value <= 10.00),
  constraint ratings_starting_value_range check (starting_rating >= 1.00 and starting_rating <= 10.00),
  constraint ratings_verified_match_count_non_negative check (verified_match_count >= 0)
);

create table if not exists public.rating_changes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rating_before numeric(4,2) not null,
  rating_after numeric(4,2) not null,
  rating_delta numeric(4,2) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint rating_changes_rating_before_range check (rating_before >= 1.00 and rating_before <= 10.00),
  constraint rating_changes_rating_after_range check (rating_after >= 1.00 and rating_after <= 10.00),
  constraint rating_changes_one_per_match_profile unique (match_id, profile_id)
);

create index if not exists ratings_value_idx on public.ratings(rating_value desc);
create index if not exists ratings_confidence_idx on public.ratings(confidence);
create index if not exists rating_changes_profile_created_idx on public.rating_changes(profile_id, created_at desc);
create index if not exists rating_changes_match_idx on public.rating_changes(match_id);

drop trigger if exists ratings_set_updated_at on public.ratings;
create trigger ratings_set_updated_at
before update on public.ratings
for each row execute function public.set_updated_at();

create or replace function public.rating_starting_value(level public.player_level)
returns numeric
language sql
immutable
as $$
  select case level::text
    when 'beginner' then 2.00
    when 'social' then 3.50
    when 'intermediate' then 5.00
    when 'club_competitive' then 6.50
    when 'advanced' then 8.00
    else 3.50
  end;
$$;

create or replace function public.rating_confidence_for_count(match_count integer)
returns public.rating_confidence
language sql
immutable
as $$
  select case
    when match_count >= 8 then 'high'::public.rating_confidence
    when match_count >= 3 then 'medium'::public.rating_confidence
    else 'low'::public.rating_confidence
  end;
$$;

create or replace function public.rating_score_multiplier(score_text text)
returns numeric
language plpgsql
immutable
as $$
declare
  item text;
  total_a integer := 0;
  total_b integer := 0;
  index integer := 1;
  margin integer;
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
    return 1.00;
  end if;

  margin := abs(total_a - total_b);

  if margin <= 2 then
    return 0.75;
  elsif margin >= 8 then
    return 1.15;
  elsif margin >= 5 then
    return 1.05;
  end if;

  return 1.00;
end;
$$;

create or replace function public.ensure_profile_rating(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  start_value numeric(4,2);
begin
  select public.rating_starting_value(profile.player_level)
  into start_value
  from public.profiles profile
  where profile.id = target_profile_id;

  if start_value is null then
    raise exception 'Profile % not found', target_profile_id;
  end if;

  insert into public.ratings (
    profile_id,
    rating_value,
    starting_rating,
    confidence,
    verified_match_count,
    provisional,
    last_calculated_at
  )
  select
    target_profile_id,
    start_value,
    start_value,
    'low'::public.rating_confidence,
    0,
    true,
    null
  where not exists (
    select 1
    from public.ratings rating
    where rating.profile_id = target_profile_id
  )
  on conflict (profile_id) do nothing;
end;
$$;

create or replace function public.apply_verified_match_rating(target_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  match_record record;
  winner_profile_id uuid;
  loser_profile_id uuid;
  winner_before numeric(4,2);
  loser_before numeric(4,2);
  winner_after numeric(4,2);
  loser_after numeric(4,2);
  winner_count integer;
  loser_count integer;
  expected_winner numeric;
  movement numeric(4,2);
  multiplier numeric;
  reason_text text;
begin
  select
    match.id,
    match.match_invite_id,
    match.winner_profile_id,
    match.score_text,
    match.verification_status,
    invite.inviter_profile_id,
    invite.opponent_profile_id,
    invite.match_type
  into match_record
  from public.matches match
  join public.match_invites invite
    on invite.id = match.match_invite_id
  where match.id = target_match_id;

  if match_record.id is null then
    raise exception 'Match % not found', target_match_id;
  end if;

  if not public.is_admin((select auth.uid()))
    and not public.match_invite_involves_user(match_record.match_invite_id, (select auth.uid())) then
    raise exception 'Not allowed to calculate this match rating';
  end if;

  if match_record.verification_status not in ('verified', 'admin_verified') then
    return false;
  end if;

  if match_record.match_type <> 'verified' and match_record.verification_status <> 'admin_verified' then
    return false;
  end if;

  if exists (
    select 1
    from public.rating_changes change
    where change.match_id = target_match_id
  ) then
    return false;
  end if;

  winner_profile_id := match_record.winner_profile_id;
  loser_profile_id := case
    when match_record.winner_profile_id = match_record.inviter_profile_id then match_record.opponent_profile_id
    else match_record.inviter_profile_id
  end;

  if winner_profile_id not in (match_record.inviter_profile_id, match_record.opponent_profile_id) then
    raise exception 'Winner profile is not part of this match';
  end if;

  perform public.ensure_profile_rating(winner_profile_id);
  perform public.ensure_profile_rating(loser_profile_id);

  select rating.rating_value, rating.verified_match_count
  into winner_before, winner_count
  from public.ratings rating
  where rating.profile_id = winner_profile_id
  for update;

  select rating.rating_value, rating.verified_match_count
  into loser_before, loser_count
  from public.ratings rating
  where rating.profile_id = loser_profile_id
  for update;

  expected_winner := 1.0 / (1.0 + power(10.0, ((loser_before - winner_before) / 4.0)));
  multiplier := public.rating_score_multiplier(match_record.score_text);
  movement := round(least(0.35, greatest(0.08, (0.08 + ((1.0 - expected_winner) * 0.24)) * multiplier)), 2);

  winner_after := round(least(10.00, greatest(1.00, winner_before + movement)), 2);
  loser_after := round(least(10.00, greatest(1.00, loser_before - movement)), 2);
  reason_text := 'Verified ' || match_record.match_type::text || ' match: expected winner probability ' || round(expected_winner, 2)::text || ', score multiplier ' || round(multiplier, 2)::text;

  update public.ratings
  set
    rating_value = winner_after,
    verified_match_count = winner_count + 1,
    confidence = public.rating_confidence_for_count(winner_count + 1),
    provisional = (winner_count + 1) < 8,
    last_calculated_at = now()
  where profile_id = winner_profile_id;

  update public.ratings
  set
    rating_value = loser_after,
    verified_match_count = loser_count + 1,
    confidence = public.rating_confidence_for_count(loser_count + 1),
    provisional = (loser_count + 1) < 8,
    last_calculated_at = now()
  where profile_id = loser_profile_id;

  insert into public.rating_changes (
    match_id,
    profile_id,
    rating_before,
    rating_after,
    rating_delta,
    reason
  )
  values
    (target_match_id, winner_profile_id, winner_before, winner_after, winner_after - winner_before, reason_text),
    (target_match_id, loser_profile_id, loser_before, loser_after, loser_after - loser_before, reason_text)
  on conflict (match_id, profile_id) do nothing;

  return true;
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
    perform public.apply_verified_match_rating(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists matches_apply_rating_after_verification on public.matches;
create trigger matches_apply_rating_after_verification
after insert or update of verification_status on public.matches
for each row execute function public.apply_rating_after_match_verification();

alter table public.ratings enable row level security;
alter table public.rating_changes enable row level security;

grant select on public.ratings to authenticated;
grant select on public.rating_changes to authenticated;
grant execute on function public.apply_verified_match_rating(uuid) to authenticated;

revoke all on function public.ensure_profile_rating(uuid) from public;
revoke all on function public.rating_starting_value(public.player_level) from public;
revoke all on function public.rating_confidence_for_count(integer) from public;
revoke all on function public.rating_score_multiplier(text) from public;
revoke all on function public.apply_rating_after_match_verification() from public;

drop policy if exists "Users can read owned and linked junior ratings" on public.ratings;
create policy "Users can read owned and linked junior ratings"
on public.ratings
for select
to authenticated
using (
  public.is_admin()
  or public.can_manage_profile(profile_id, (select auth.uid()))
);

drop policy if exists "Admins can manage ratings" on public.ratings;
create policy "Admins can manage ratings"
on public.ratings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can read owned and linked junior rating changes" on public.rating_changes;
create policy "Users can read owned and linked junior rating changes"
on public.rating_changes
for select
to authenticated
using (
  public.is_admin()
  or public.can_manage_profile(profile_id, (select auth.uid()))
);

drop policy if exists "Admins can manage rating changes" on public.rating_changes;
create policy "Admins can manage rating changes"
on public.rating_changes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
