do $$
begin
  create type public.match_invite_type as enum ('casual', 'verified');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.match_invite_status as enum ('pending', 'accepted', 'declined', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_invites (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.court_bookings(id) on delete set null,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles(id) on delete cascade,
  opponent_profile_id uuid not null references public.profiles(id) on delete cascade,
  match_type public.match_invite_type not null default 'casual',
  status public.match_invite_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint match_invites_profiles_distinct check (inviter_profile_id <> opponent_profile_id),
  constraint match_invites_response_timestamp check (
    (status = 'pending' and responded_at is null)
    or
    (status <> 'pending' and responded_at is not null)
  )
);

create index if not exists match_invites_invited_by_user_idx on public.match_invites(invited_by_user_id);
create index if not exists match_invites_inviter_profile_idx on public.match_invites(inviter_profile_id);
create index if not exists match_invites_opponent_profile_idx on public.match_invites(opponent_profile_id);
create index if not exists match_invites_booking_idx on public.match_invites(booking_id);
create index if not exists match_invites_status_created_idx on public.match_invites(status, created_at desc);

drop trigger if exists match_invites_set_updated_at on public.match_invites;
create trigger match_invites_set_updated_at
before update on public.match_invites
for each row execute function public.set_updated_at();

create or replace function public.protect_match_invite_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin((select auth.uid())) then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Only pending match invites can be updated';
  end if;

  if new.id is distinct from old.id
    or new.booking_id is distinct from old.booking_id
    or new.invited_by_user_id is distinct from old.invited_by_user_id
    or new.inviter_profile_id is distinct from old.inviter_profile_id
    or new.opponent_profile_id is distinct from old.opponent_profile_id
    or new.match_type is distinct from old.match_type
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at then
    raise exception 'Match invite details cannot be changed after creation';
  end if;

  if new.status in ('accepted', 'declined')
    and public.can_manage_profile(old.opponent_profile_id, (select auth.uid())) then
    new.responded_at = coalesce(new.responded_at, now());
    return new;
  end if;

  if new.status = 'cancelled'
    and (
      old.invited_by_user_id = (select auth.uid())
      or public.can_manage_profile(old.inviter_profile_id, (select auth.uid()))
    ) then
    new.responded_at = coalesce(new.responded_at, now());
    return new;
  end if;

  raise exception 'Not allowed to update this match invite';
end;
$$;

drop trigger if exists match_invites_protect_update on public.match_invites;
create trigger match_invites_protect_update
before update on public.match_invites
for each row execute function public.protect_match_invite_update();

alter table public.match_invites enable row level security;

grant select, insert, update on public.match_invites to authenticated;

drop policy if exists "Users can read their match invites" on public.match_invites;
create policy "Users can read their match invites"
on public.match_invites
for select
to authenticated
using (
  public.is_admin()
  or invited_by_user_id = (select auth.uid())
  or public.can_manage_profile(inviter_profile_id, (select auth.uid()))
  or public.can_manage_profile(opponent_profile_id, (select auth.uid()))
);

drop policy if exists "Users can create match invites for own profiles" on public.match_invites;
create policy "Users can create match invites for own profiles"
on public.match_invites
for insert
to authenticated
with check (
  invited_by_user_id = (select auth.uid())
  and status = 'pending'
  and responded_at is null
  and public.can_manage_profile(inviter_profile_id, (select auth.uid()))
  and inviter_profile_id <> opponent_profile_id
);

drop policy if exists "Users can update actionable match invites" on public.match_invites;
create policy "Users can update actionable match invites"
on public.match_invites
for update
to authenticated
using (
  status = 'pending'
  and (
    public.can_manage_profile(opponent_profile_id, (select auth.uid()))
    or invited_by_user_id = (select auth.uid())
    or public.can_manage_profile(inviter_profile_id, (select auth.uid()))
  )
)
with check (
  status in ('accepted', 'declined', 'cancelled')
  and (
    public.can_manage_profile(opponent_profile_id, (select auth.uid()))
    or invited_by_user_id = (select auth.uid())
    or public.can_manage_profile(inviter_profile_id, (select auth.uid()))
  )
);

drop policy if exists "Admins can manage match invites" on public.match_invites;
create policy "Admins can manage match invites"
on public.match_invites
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.match_profile_options(search_text text default null)
returns table (
  id uuid,
  first_name text,
  last_name text,
  is_junior boolean,
  primary_sport public.sport,
  player_level public.player_level,
  junior_stage text,
  parent_first_name text,
  parent_last_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.is_junior,
    profile.primary_sport,
    profile.player_level,
    profile.junior_stage,
    parent.first_name as parent_first_name,
    parent.last_name as parent_last_name
  from public.profiles profile
  left join public.profiles parent
    on parent.id = profile.parent_profile_id
  where (select auth.uid()) is not null
    and (
      search_text is null
      or length(btrim(search_text)) = 0
      or profile.first_name ilike '%' || btrim(search_text) || '%'
      or profile.last_name ilike '%' || btrim(search_text) || '%'
      or concat(profile.first_name, ' ', profile.last_name) ilike '%' || btrim(search_text) || '%'
    )
  order by profile.first_name, profile.last_name
  limit 100;
$$;

create or replace function public.match_invites_for_user()
returns table (
  id uuid,
  booking_id uuid,
  invited_by_user_id uuid,
  inviter_profile_id uuid,
  inviter_first_name text,
  inviter_last_name text,
  inviter_is_junior boolean,
  opponent_profile_id uuid,
  opponent_first_name text,
  opponent_last_name text,
  opponent_is_junior boolean,
  match_type public.match_invite_type,
  status public.match_invite_status,
  message text,
  created_at timestamptz,
  responded_at timestamptz,
  booking_start_time timestamptz,
  booking_end_time timestamptz,
  booking_court_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    invite.id,
    invite.booking_id,
    invite.invited_by_user_id,
    invite.inviter_profile_id,
    inviter.first_name as inviter_first_name,
    inviter.last_name as inviter_last_name,
    inviter.is_junior as inviter_is_junior,
    invite.opponent_profile_id,
    opponent.first_name as opponent_first_name,
    opponent.last_name as opponent_last_name,
    opponent.is_junior as opponent_is_junior,
    invite.match_type,
    invite.status,
    invite.message,
    invite.created_at,
    invite.responded_at,
    booking.start_time as booking_start_time,
    booking.end_time as booking_end_time,
    court.name as booking_court_name
  from public.match_invites invite
  join public.profiles inviter
    on inviter.id = invite.inviter_profile_id
  join public.profiles opponent
    on opponent.id = invite.opponent_profile_id
  left join public.court_bookings booking
    on booking.id = invite.booking_id
  left join public.courts court
    on court.id = booking.court_id
  where (select auth.uid()) is not null
    and (
      invite.invited_by_user_id = (select auth.uid())
      or public.can_manage_profile(invite.inviter_profile_id, (select auth.uid()))
      or public.can_manage_profile(invite.opponent_profile_id, (select auth.uid()))
      or public.is_admin((select auth.uid()))
    )
  order by invite.created_at desc;
$$;

revoke all on function public.match_profile_options(text) from public;
revoke all on function public.match_invites_for_user() from public;
grant execute on function public.match_profile_options(text) to authenticated;
grant execute on function public.match_invites_for_user() to authenticated;
