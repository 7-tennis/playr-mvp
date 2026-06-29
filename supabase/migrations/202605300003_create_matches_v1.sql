do $$
begin
  create type public.match_verification_status as enum ('pending_confirmation', 'verified', 'disputed', 'admin_verified', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_invite_id uuid not null unique references public.match_invites(id) on delete cascade,
  booking_id uuid references public.court_bookings(id) on delete set null,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  winner_profile_id uuid not null references public.profiles(id) on delete cascade,
  score_text text not null,
  verification_status public.match_verification_status not null default 'pending_confirmation',
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint matches_score_not_blank check (length(btrim(score_text)) > 0),
  constraint matches_confirmation_consistent check (
    (verification_status = 'pending_confirmation' and confirmed_by_user_id is null and confirmed_at is null)
    or
    (verification_status in ('verified', 'disputed', 'admin_verified', 'cancelled'))
  )
);

create index if not exists matches_submitted_by_user_idx on public.matches(submitted_by_user_id);
create index if not exists matches_winner_profile_idx on public.matches(winner_profile_id);
create index if not exists matches_status_idx on public.matches(verification_status);
create index if not exists matches_submitted_at_idx on public.matches(submitted_at desc);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create or replace function public.match_invite_involves_user(check_match_invite_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.match_invites invite
    where invite.id = check_match_invite_id
      and (
        invite.invited_by_user_id = check_user_id
        or public.can_manage_profile(invite.inviter_profile_id, check_user_id)
        or public.can_manage_profile(invite.opponent_profile_id, check_user_id)
      )
  );
$$;

create or replace function public.protect_match_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if public.is_admin(current_user_id) then
    if new.verification_status in ('verified', 'admin_verified') then
      new.confirmed_at = coalesce(new.confirmed_at, now());
      new.confirmed_by_user_id = coalesce(new.confirmed_by_user_id, current_user_id);
    end if;
    return new;
  end if;

  if old.verification_status <> 'pending_confirmation' then
    raise exception 'Only pending match results can be updated by players';
  end if;

  if new.id is distinct from old.id
    or new.match_invite_id is distinct from old.match_invite_id
    or new.booking_id is distinct from old.booking_id
    or new.submitted_by_user_id is distinct from old.submitted_by_user_id
    or new.winner_profile_id is distinct from old.winner_profile_id
    or new.score_text is distinct from old.score_text
    or new.submitted_at is distinct from old.submitted_at then
    raise exception 'Match result details cannot be changed after submission';
  end if;

  if new.verification_status in ('verified', 'disputed')
    and public.match_invite_involves_user(old.match_invite_id, current_user_id)
    and old.submitted_by_user_id <> current_user_id then
    new.confirmed_by_user_id = current_user_id;
    new.confirmed_at = coalesce(new.confirmed_at, now());
    return new;
  end if;

  raise exception 'Not allowed to update this match result';
end;
$$;

drop trigger if exists matches_protect_update on public.matches;
create trigger matches_protect_update
before update on public.matches
for each row execute function public.protect_match_update();

alter table public.matches enable row level security;

grant select, insert, update on public.matches to authenticated;

drop policy if exists "Users can read involved matches" on public.matches;
create policy "Users can read involved matches"
on public.matches
for select
to authenticated
using (
  public.is_admin()
  or public.match_invite_involves_user(match_invite_id, (select auth.uid()))
);

drop policy if exists "Users can submit accepted match results" on public.matches;
create policy "Users can submit accepted match results"
on public.matches
for insert
to authenticated
with check (
  submitted_by_user_id = (select auth.uid())
  and verification_status = 'pending_confirmation'
  and confirmed_by_user_id is null
  and confirmed_at is null
  and exists (
    select 1
    from public.match_invites invite
    where invite.id = match_invite_id
      and invite.status = 'accepted'
      and (
        public.can_manage_profile(invite.inviter_profile_id, (select auth.uid()))
        or public.can_manage_profile(invite.opponent_profile_id, (select auth.uid()))
      )
      and winner_profile_id in (invite.inviter_profile_id, invite.opponent_profile_id)
      and (booking_id is null or booking_id = invite.booking_id)
  )
);

drop policy if exists "Users can confirm or dispute involved match results" on public.matches;
create policy "Users can confirm or dispute involved match results"
on public.matches
for update
to authenticated
using (
  verification_status = 'pending_confirmation'
  and public.match_invite_involves_user(match_invite_id, (select auth.uid()))
)
with check (
  verification_status in ('verified', 'disputed')
  and public.match_invite_involves_user(match_invite_id, (select auth.uid()))
);

drop policy if exists "Admins can manage matches" on public.matches;
create policy "Admins can manage matches"
on public.matches
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.matches_for_user()
returns table (
  id uuid,
  match_invite_id uuid,
  booking_id uuid,
  submitted_by_user_id uuid,
  winner_profile_id uuid,
  score_text text,
  verification_status public.match_verification_status,
  confirmed_by_user_id uuid,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  inviter_profile_id uuid,
  inviter_first_name text,
  inviter_last_name text,
  inviter_is_junior boolean,
  opponent_profile_id uuid,
  opponent_first_name text,
  opponent_last_name text,
  opponent_is_junior boolean,
  booking_start_time timestamptz,
  booking_court_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    match.id,
    match.match_invite_id,
    match.booking_id,
    match.submitted_by_user_id,
    match.winner_profile_id,
    match.score_text,
    match.verification_status,
    match.confirmed_by_user_id,
    match.submitted_at,
    match.confirmed_at,
    invite.inviter_profile_id,
    inviter.first_name as inviter_first_name,
    inviter.last_name as inviter_last_name,
    inviter.is_junior as inviter_is_junior,
    invite.opponent_profile_id,
    opponent.first_name as opponent_first_name,
    opponent.last_name as opponent_last_name,
    opponent.is_junior as opponent_is_junior,
    booking.start_time as booking_start_time,
    court.name as booking_court_name
  from public.matches match
  join public.match_invites invite
    on invite.id = match.match_invite_id
  join public.profiles inviter
    on inviter.id = invite.inviter_profile_id
  join public.profiles opponent
    on opponent.id = invite.opponent_profile_id
  left join public.court_bookings booking
    on booking.id = match.booking_id
  left join public.courts court
    on court.id = booking.court_id
  where (select auth.uid()) is not null
    and (
      public.match_invite_involves_user(match.match_invite_id, (select auth.uid()))
      or public.is_admin((select auth.uid()))
    )
  order by match.submitted_at desc;
$$;

revoke all on function public.matches_for_user() from public;
grant execute on function public.matches_for_user() to authenticated;
