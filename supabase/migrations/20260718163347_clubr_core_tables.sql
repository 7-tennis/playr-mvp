-- ClubR Phase 2.1: venue-scoped operations over the shared PlayR schedule.
-- court_bookings remains the single court-occupancy source of truth.

alter table public.venues
  add column if not exists timezone text not null default 'Africa/Johannesburg',
  add column if not exists primary_colour text;

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  joined_at timestamptz,
  deactivated_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_memberships_status_valid check (status in ('active', 'inactive', 'pending')),
  constraint club_memberships_status_dates check (
    (status = 'active' and deactivated_at is null)
    or (status = 'inactive' and deactivated_at is not null)
    or status = 'pending'
  ),
  constraint club_memberships_venue_profile_unique unique (venue_id, profile_id)
);

create index if not exists club_memberships_venue_status_idx
on public.club_memberships(venue_id, status, created_at desc);

create index if not exists club_memberships_profile_idx
on public.club_memberships(profile_id, venue_id);

drop trigger if exists club_memberships_set_updated_at on public.club_memberships;
create trigger club_memberships_set_updated_at
before update on public.club_memberships
for each row execute function public.set_updated_at();

create table if not exists public.club_notices (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null default 'general',
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_notices_title_not_blank check (length(btrim(title)) > 0),
  constraint club_notices_message_not_blank check (length(btrim(message)) > 0),
  constraint club_notices_category_valid check (category in ('pinned', 'general', 'maintenance', 'important')),
  constraint club_notices_time_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists club_notices_venue_active_idx
on public.club_notices(venue_id, is_active, created_at desc);

drop trigger if exists club_notices_set_updated_at on public.club_notices;
create trigger club_notices_set_updated_at
before update on public.club_notices
for each row execute function public.set_updated_at();

create table if not exists public.club_operational_blocks (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  court_booking_id uuid not null unique references public.court_bookings(id) on delete restrict,
  reason text not null,
  note text,
  status text not null default 'active',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  released_by_user_id uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_operational_blocks_reason_valid check (
    reason in ('maintenance', 'weather', 'private_club_use', 'safety', 'committee_use', 'club_operations', 'court_preparation', 'other')
  ),
  constraint club_operational_blocks_status_valid check (status in ('active', 'released')),
  constraint club_operational_blocks_release_fields check (
    (status = 'active' and released_at is null)
    or (status = 'released' and released_at is not null)
  )
);

create index if not exists club_operational_blocks_venue_status_idx
on public.club_operational_blocks(venue_id, status, created_at desc);

create index if not exists club_operational_blocks_court_status_idx
on public.club_operational_blocks(court_id, status, created_at desc);

drop trigger if exists club_operational_blocks_set_updated_at on public.club_operational_blocks;
create trigger club_operational_blocks_set_updated_at
before update on public.club_operational_blocks
for each row execute function public.set_updated_at();

-- Backfill durable venue membership from existing organisation and activity links.
insert into public.club_memberships (venue_id, profile_id, status, joined_at, deactivated_at)
select
  membership.venue_id,
  membership.profile_id,
  case
    when membership.status = 'active' then 'active'
    when membership.status = 'pending' then 'pending'
    else 'inactive'
  end,
  coalesce(membership.accepted_at, membership.created_at),
  case when membership.status not in ('active', 'pending') then coalesce(membership.removed_at, membership.suspended_at, now()) else null end
from public.organisation_memberships membership
on conflict (venue_id, profile_id) do update
set status = case
      when public.club_memberships.status = 'active' or excluded.status = 'active' then 'active'
      when public.club_memberships.status = 'pending' or excluded.status = 'pending' then 'pending'
      else 'inactive'
    end,
    joined_at = coalesce(public.club_memberships.joined_at, excluded.joined_at),
    deactivated_at = case
      when public.club_memberships.status = 'active' or excluded.status = 'active' then null
      else public.club_memberships.deactivated_at
    end;

insert into public.club_memberships (venue_id, profile_id, status, joined_at, deactivated_at)
select
  link.venue_id,
  link.player_profile_id,
  case
    when link.status = 'active' then 'active'
    when link.status = 'pending' then 'pending'
    else 'inactive'
  end,
  coalesce(link.approved_at, link.created_at),
  case when link.status not in ('active', 'pending') then coalesce(link.removed_at, link.declined_at, now()) else null end
from public.organisation_player_links link
on conflict (venue_id, profile_id) do update
set status = case
      when public.club_memberships.status = 'active' or excluded.status = 'active' then 'active'
      when public.club_memberships.status = 'pending' or excluded.status = 'pending' then 'pending'
      else 'inactive'
    end,
    joined_at = coalesce(public.club_memberships.joined_at, excluded.joined_at),
    deactivated_at = case
      when public.club_memberships.status = 'active' or excluded.status = 'active' then null
      else public.club_memberships.deactivated_at
    end;

insert into public.club_memberships (venue_id, profile_id, status, joined_at, deactivated_at)
select distinct on (court.venue_id, booking.player_profile_id)
  court.venue_id,
  booking.player_profile_id,
  case
    when profile.member_status = 'member' then 'active'
    when profile.member_status = 'pending' then 'pending'
    else 'inactive'
  end,
  booking.created_at,
  case when profile.member_status not in ('member', 'pending') then now() else null end
from public.court_bookings booking
join public.courts court on court.id = booking.court_id
join public.profiles profile on profile.id = booking.player_profile_id
where court.venue_id is not null
  and booking.player_profile_id is not null
order by court.venue_id, booking.player_profile_id, booking.created_at
on conflict (venue_id, profile_id) do nothing;

create or replace function public.organisation_role_priority(check_role public.organisation_role)
returns integer
language sql
immutable
as $$
  select case check_role
    when 'organisation_admin' then 70
    when 'club_manager' then 60
    when 'head_coach' then 50
    when 'committee' then 48
    when 'sports_coordinator' then 45
    when 'team_manager' then 40
    when 'coach' then 35
    when 'assistant_coach' then 30
    when 'reception' then 20
    else 10
  end;
$$;

create or replace function public.clubr_user_has_access(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or public.user_has_active_organisation_role(
        check_venue_id,
        array['organisation_admin', 'club_manager', 'committee', 'reception']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.clubr_user_can_manage_members(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or public.user_has_active_organisation_role(
        check_venue_id,
        array['organisation_admin', 'club_manager', 'committee']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.clubr_user_can_manage_courts(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.clubr_user_can_manage_members(check_venue_id, check_user_id);
$$;

create or replace function public.clubr_user_can_manage_notices(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.clubr_user_can_manage_members(check_venue_id, check_user_id);
$$;

create or replace function public.clubr_user_can_manage_settings(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or public.user_has_active_organisation_role(
        check_venue_id,
        array['organisation_admin', 'club_manager']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.clubr_user_can_view_diagnostics(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.clubr_user_can_manage_settings(check_venue_id, check_user_id);
$$;

create or replace function public.clubr_user_can_view_booking_identity(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or public.user_has_active_organisation_role(
        check_venue_id,
        array['organisation_admin', 'club_manager', 'committee']::public.organisation_role[],
        check_user_id
      )
    );
$$;

create or replace function public.clubr_user_can_read_member_profile(
  check_profile_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.club_memberships membership
      where membership.profile_id = check_profile_id
        and public.clubr_user_has_access(membership.venue_id, check_user_id)
    );
$$;

create or replace function public.playr_profile_can_book_court(
  p_profile_id uuid,
  p_court_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and public.can_manage_profile(p_profile_id, p_user_id)
    and court.status = 'active'
    and case
      when membership.status = 'active' then coalesce(settings.member_booking_enabled, true)
      when membership.status in ('pending', 'inactive') then false
      when profile.member_status = 'member' then coalesce(settings.member_booking_enabled, true)
      else coalesce(settings.non_member_booking_enabled, false)
    end
  from public.courts court
  join public.profiles profile on profile.id = p_profile_id
  left join public.club_memberships membership
    on membership.venue_id = court.venue_id
   and membership.profile_id = p_profile_id
  left join public.organisation_booking_settings settings on settings.venue_id = court.venue_id
  where court.id = p_court_id;
$$;

drop policy if exists "Users can create court bookings for own profiles" on public.court_bookings;
drop function if exists public.playr_booking_within_venue_window(uuid, timestamptz, uuid);

create or replace function public.playr_booking_within_venue_window(
  p_court_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_timezone text;
  target_opening time;
  target_closing time;
  target_slot integer;
  target_advance integer;
  target_max integer;
  local_start timestamp;
  local_end timestamp;
  active_count integer;
begin
  if p_user_id is distinct from (select auth.uid())
    or p_end_time <= p_start_time then
    return false;
  end if;

  select
    coalesce(venue.timezone, 'Africa/Johannesburg'),
    coalesce(settings.opening_time, court.opening_time, '06:00'::time),
    coalesce(settings.closing_time, court.closing_time, '21:00'::time),
    greatest(15, coalesce(settings.slot_minutes, 60)),
    greatest(1, least(90, coalesce(settings.advance_booking_days, 7))),
    greatest(1, coalesce(settings.max_active_bookings, 3))
  into target_timezone, target_opening, target_closing, target_slot, target_advance, target_max
  from public.courts court
  left join public.venues venue on venue.id = court.venue_id
  left join public.organisation_booking_settings settings on settings.venue_id = court.venue_id
  where court.id = p_court_id
    and court.status = 'active';

  if not found then
    return false;
  end if;

  local_start := timezone(target_timezone, p_start_time);
  local_end := timezone(target_timezone, p_end_time);

  if p_start_time < now()
    or p_start_time >= now() + make_interval(days => target_advance)
    or p_end_time <> p_start_time + make_interval(mins => target_slot)
    or local_start::date <> local_end::date
    or local_start::time < target_opening
    or local_end::time > target_closing
    or mod((extract(epoch from (local_start::time - target_opening)) / 60)::integer, target_slot) <> 0 then
    return false;
  end if;

  select count(*)::integer into active_count
  from public.court_bookings booking
  where booking.booked_by_user_id = p_user_id
    and booking.status = 'confirmed'
    and booking.start_time >= now()
    and booking.booking_type = 'player_booking';

  return active_count < target_max;
end;
$$;

create policy "Users can create court bookings for own profiles"
on public.court_bookings
for insert
to authenticated
with check (
  booked_by_user_id = (select auth.uid())
  and booking_type = 'player_booking'
  and status = 'confirmed'
  and public.playr_profile_can_book_court(player_profile_id, court_id)
  and public.playr_booking_within_venue_window(court_id, start_time, end_time)
  and booking_organisation_id is null
  and owner_organisation_id is not distinct from (select court.venue_id from public.courts court where court.id = court_id)
  and coach_lesson_id is null
  and coach_session_occurrence_id is null
  and coach_profile_id is null
  and booking_purpose = 'member_booking'
  and source_product = 'playr'
);

create or replace function public.clubr_set_member_status(
  p_membership_id uuid,
  p_status text
)
returns public.club_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.club_memberships;
begin
  select * into target
  from public.club_memberships
  where id = p_membership_id
  for update;

  if target.id is null
    or not public.clubr_user_can_manage_members(target.venue_id)
    or p_status not in ('active', 'inactive', 'pending') then
    raise exception 'access_or_status' using errcode = 'P0001';
  end if;

  update public.club_memberships
  set status = p_status,
      joined_at = case when p_status = 'active' then coalesce(joined_at, now()) else joined_at end,
      deactivated_at = case when p_status = 'inactive' then now() else null end,
      updated_by_user_id = (select auth.uid())
  where id = p_membership_id
  returning * into target;

  return target;
end;
$$;

create or replace function public.clubr_set_member_role(
  p_venue_id uuid,
  p_profile_id uuid,
  p_role public.organisation_role,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_user_id uuid;
  role_row_id uuid;
begin
  if actor_user_id is null
    or not public.clubr_user_can_manage_settings(p_venue_id, actor_user_id)
    or p_role not in ('committee'::public.organisation_role, 'reception'::public.organisation_role, 'viewer'::public.organisation_role) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select user_id into target_user_id from public.profiles where id = p_profile_id;

  select id into role_row_id
  from public.organisation_memberships
  where venue_id = p_venue_id
    and profile_id = p_profile_id
    and role = p_role
    and status in ('pending', 'active', 'suspended')
  order by created_at desc
  limit 1
  for update;

  if p_active then
    if role_row_id is null then
      insert into public.organisation_memberships (
        venue_id, profile_id, user_id, role, status, invited_by_user_id, accepted_at
      ) values (
        p_venue_id, p_profile_id, target_user_id, p_role, 'active', actor_user_id, now()
      ) returning id into role_row_id;
    else
      update public.organisation_memberships
      set status = 'active', user_id = target_user_id, accepted_at = coalesce(accepted_at, now()), suspended_at = null, removed_at = null
      where id = role_row_id;
    end if;
  elsif role_row_id is not null then
    update public.organisation_memberships
    set status = 'removed', removed_at = now()
    where id = role_row_id;
  end if;

  return role_row_id;
end;
$$;

create or replace function public.clubr_update_court(
  p_court_id uuid,
  p_name text,
  p_surface text,
  p_status public.court_status,
  p_opening_time time,
  p_closing_time time
)
returns public.courts
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.courts;
begin
  select * into target from public.courts where id = p_court_id for update;

  if target.id is null
    or target.venue_id is null
    or not public.clubr_user_can_manage_courts(target.venue_id)
    or length(btrim(coalesce(p_name, ''))) = 0
    or (p_opening_time is not null and p_closing_time is not null and p_closing_time <= p_opening_time) then
    raise exception 'access_or_invalid' using errcode = 'P0001';
  end if;

  update public.courts
  set name = btrim(p_name),
      surface = nullif(btrim(coalesce(p_surface, '')), ''),
      status = p_status,
      opening_time = p_opening_time,
      closing_time = p_closing_time
  where id = p_court_id
  returning * into target;

  return target;
end;
$$;

create or replace function public.clubr_operational_block_conflicts(
  p_venue_id uuid,
  p_court_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  booking_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  occupancy_type text,
  description text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_end_time <= p_start_time
    or not public.clubr_user_can_manage_courts(p_venue_id)
    or not exists (select 1 from public.courts where id = p_court_id and venue_id = p_venue_id) then
    raise exception 'access_or_invalid' using errcode = 'P0001';
  end if;

  return query
  select
    booking.id,
    booking.start_time,
    booking.end_time,
    case
      when booking.booking_purpose = 'coaching_session' then 'coaching_session'
      when booking.booking_purpose = 'coaching_lesson' then 'coaching_lesson'
      when booking.booking_type = 'player_booking' then 'member_booking'
      when booking.booking_type = 'maintenance' then 'maintenance'
      else coalesce(booking.booking_purpose, booking.booking_type::text, 'occupied')
    end,
    case
      when booking.booking_purpose in ('coaching_session', 'coaching_lesson') then 'CoachR booking'
      when booking.booking_type = 'player_booking' then 'Member booking'
      when booking.booking_type = 'maintenance' then 'Maintenance'
      else 'Club booking'
    end
  from public.court_bookings booking
  where booking.court_id = p_court_id
    and booking.status = 'confirmed'
    and tstzrange(booking.start_time, booking.end_time, '[)')
      && tstzrange(p_start_time, p_end_time, '[)')
  order by booking.start_time;
end;
$$;

create or replace function public.clubr_create_operational_block(
  p_venue_id uuid,
  p_court_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_reason text,
  p_note text default null
)
returns table (block_id uuid, booking_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  new_booking_id uuid;
  new_block_id uuid;
  target_booking_type public.court_booking_type;
begin
  if actor_user_id is null
    or not public.clubr_user_can_manage_courts(p_venue_id, actor_user_id)
    or p_end_time <= p_start_time
    or p_reason not in ('maintenance', 'weather', 'private_club_use', 'safety', 'committee_use', 'club_operations', 'court_preparation', 'other') then
    raise exception 'access_or_invalid' using errcode = 'P0001';
  end if;

  perform 1
  from public.courts court
  where court.id = p_court_id
    and court.venue_id = p_venue_id
  for update;

  if not found then
    raise exception 'court_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.court_bookings booking
    where booking.court_id = p_court_id
      and booking.status = 'confirmed'
      and tstzrange(booking.start_time, booking.end_time, '[)')
        && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'booking_conflict' using errcode = '23P01';
  end if;

  target_booking_type := case when p_reason in ('maintenance', 'weather', 'safety', 'court_preparation') then 'maintenance' else 'club_programme' end;

  begin
    insert into public.court_bookings (
      court_id, booked_by_user_id, start_time, end_time, status, booking_type,
      is_public, notes, booking_organisation_id, owner_organisation_id,
      booking_purpose, source_product
    ) values (
      p_court_id, actor_user_id, p_start_time, p_end_time, 'confirmed', target_booking_type,
      false, nullif(btrim(coalesce(p_note, '')), ''), p_venue_id, p_venue_id,
      case when target_booking_type = 'maintenance' then 'maintenance' else 'club_operational_block' end,
      'clubr'
    ) returning id into new_booking_id;
  exception
    when exclusion_violation then
      raise exception 'booking_conflict' using errcode = '23P01';
  end;

  insert into public.club_operational_blocks (
    venue_id, court_id, court_booking_id, reason, note, created_by_user_id
  ) values (
    p_venue_id, p_court_id, new_booking_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''), actor_user_id
  ) returning id into new_block_id;

  return query select new_block_id, new_booking_id;
end;
$$;

create or replace function public.clubr_release_operational_block(p_block_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.club_operational_blocks;
begin
  select * into target
  from public.club_operational_blocks
  where id = p_block_id
  for update;

  if target.id is null
    or not public.clubr_user_can_manage_courts(target.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if target.status = 'active' then
    update public.court_bookings
    set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = actor_user_id
    where id = target.court_booking_id
      and status = 'confirmed';

    update public.club_operational_blocks
    set status = 'released', released_at = now(), released_by_user_id = actor_user_id
    where id = target.id;
  end if;

  return target.court_booking_id;
end;
$$;

create or replace function public.clubr_court_occupancy_for_range(
  p_owner_venue_id uuid,
  check_start_time timestamptz,
  check_end_time timestamptz
)
returns table (
  booking_id uuid,
  court_id uuid,
  court_name text,
  start_time timestamptz,
  end_time timestamptz,
  booking_status public.court_booking_status,
  booking_type public.court_booking_type,
  occupancy_type text,
  source_product text,
  booking_organisation_id uuid,
  academy_name text,
  session_name text,
  session_type text,
  coach_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  can_view_identity boolean;
begin
  if (select auth.uid()) is null
    or (
      p_owner_venue_id is null
      and not public.user_is_platform_admin((select auth.uid()))
    )
    or (
      p_owner_venue_id is not null
      and not public.clubr_user_has_access(p_owner_venue_id)
    ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  can_view_identity := p_owner_venue_id is null
    or public.clubr_user_can_view_booking_identity(p_owner_venue_id);

  return query
  select
    booking.id,
    booking.court_id,
    court.name,
    booking.start_time,
    booking.end_time,
    booking.status,
    booking.booking_type,
    case
      when booking.booking_purpose = 'coaching_session' then 'coaching_session'
      when booking.booking_purpose = 'coaching_lesson' then 'coaching_lesson'
      when booking.booking_type = 'player_booking' then 'member_booking'
      when booking.booking_type = 'maintenance' then 'maintenance'
      when booking.booking_type in ('competition', 'americano') then 'event'
      when booking.booking_type = 'club_programme' then 'club_programme'
      else coalesce(booking.booking_purpose, booking.booking_type::text, 'occupied')
    end,
    booking.source_product,
    booking.booking_organisation_id,
    case when can_view_identity then academy.name else null end,
    case when can_view_identity then session.name else null end,
    case when can_view_identity then session.session_type else null end,
    case when can_view_identity then nullif(concat_ws(' ', coach.first_name, coach.last_name), '') else null end
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  left join public.venues academy on academy.id = booking.booking_organisation_id
  left join public.coach_session_occurrences occurrence on occurrence.id = booking.coach_session_occurrence_id
  left join public.coach_sessions session on session.id = occurrence.session_id
  left join public.profiles coach on coach.id = booking.coach_profile_id
  where (p_owner_venue_id is null or court.venue_id = p_owner_venue_id)
    and check_end_time > check_start_time
    and tstzrange(booking.start_time, booking.end_time, '[)')
      && tstzrange(check_start_time, check_end_time, '[)')
  order by booking.start_time, court.sort_order, court.name;
end;
$$;

create or replace function public.clubr_booking_detail(p_booking_id uuid)
returns table (
  booking_id uuid,
  court_id uuid,
  court_name text,
  venue_id uuid,
  venue_name text,
  start_time timestamptz,
  end_time timestamptz,
  booking_status public.court_booking_status,
  booking_type public.court_booking_type,
  occupancy_type text,
  source_product text,
  created_at timestamptz,
  owner_name text,
  coach_name text,
  coach_lesson_id uuid,
  coach_session_occurrence_id uuid,
  operational_block_id uuid,
  operational_block_reason text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_venue_id uuid;
  can_view_identity boolean;
begin
  select court.venue_id into target_venue_id
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  where booking.id = p_booking_id;

  if target_venue_id is null
    or not public.clubr_user_has_access(target_venue_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  can_view_identity := public.clubr_user_can_view_booking_identity(target_venue_id);

  return query
  select
    booking.id,
    court.id,
    court.name,
    venue.id,
    venue.name,
    booking.start_time,
    booking.end_time,
    booking.status,
    booking.booking_type,
    case
      when booking.booking_purpose = 'coaching_session' then 'coaching_session'
      when booking.booking_purpose = 'coaching_lesson' then 'coaching_lesson'
      when booking.booking_type = 'player_booking' then 'member_booking'
      when booking.booking_type = 'maintenance' then 'maintenance'
      when booking.booking_type in ('competition', 'americano') then 'event'
      when booking.booking_type = 'club_programme' then 'club_programme'
      else coalesce(booking.booking_purpose, booking.booking_type::text, 'occupied')
    end,
    booking.source_product,
    booking.created_at,
    case when can_view_identity then nullif(concat_ws(' ', owner_profile.first_name, owner_profile.last_name), '') else null end,
    case when can_view_identity then nullif(concat_ws(' ', coach.first_name, coach.last_name), '') else null end,
    booking.coach_lesson_id,
    booking.coach_session_occurrence_id,
    operational.id,
    operational.reason
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  join public.venues venue on venue.id = court.venue_id
  left join public.profiles owner_profile on owner_profile.id = booking.player_profile_id
  left join public.profiles coach on coach.id = booking.coach_profile_id
  left join public.club_operational_blocks operational on operational.court_booking_id = booking.id
  where booking.id = p_booking_id;
end;
$$;

create or replace function public.clubr_member_bookings(
  p_venue_id uuid,
  p_profile_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  booking_id uuid,
  court_id uuid,
  court_name text,
  start_time timestamptz,
  end_time timestamptz,
  booking_status public.court_booking_status,
  booking_type public.court_booking_type,
  source_product text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_end_time <= p_start_time
    or not public.clubr_user_has_access(p_venue_id)
    or not exists (
      select 1 from public.club_memberships membership
      where membership.venue_id = p_venue_id and membership.profile_id = p_profile_id
    ) then
    raise exception 'access_or_invalid' using errcode = 'P0001';
  end if;

  return query
  select
    booking.id,
    court.id,
    court.name,
    booking.start_time,
    booking.end_time,
    booking.status,
    booking.booking_type,
    booking.source_product
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  where court.venue_id = p_venue_id
    and booking.player_profile_id = p_profile_id
    and booking.start_time >= p_start_time
    and booking.start_time < p_end_time
  order by booking.start_time desc;
end;
$$;

alter table public.club_memberships enable row level security;
alter table public.club_notices enable row level security;
alter table public.club_operational_blocks enable row level security;

drop policy if exists "ClubR staff can read club memberships" on public.club_memberships;
create policy "ClubR staff can read club memberships"
on public.club_memberships for select to authenticated
using (
  public.clubr_user_has_access(venue_id)
  or public.can_manage_profile(profile_id)
);

drop policy if exists "ClubR staff can read member profiles" on public.profiles;
create policy "ClubR staff can read member profiles"
on public.profiles for select to authenticated
using (public.clubr_user_can_read_member_profile(id));

drop policy if exists "ClubR staff can read venue role records" on public.organisation_memberships;
create policy "ClubR staff can read venue role records"
on public.organisation_memberships for select to authenticated
using (public.clubr_user_has_access(venue_id));

drop policy if exists "ClubR staff can read venue courts" on public.courts;
create policy "ClubR staff can read venue courts"
on public.courts for select to authenticated
using (venue_id is not null and public.clubr_user_has_access(venue_id));

drop policy if exists "ClubR staff can read booking settings" on public.organisation_booking_settings;
create policy "ClubR staff can read booking settings"
on public.organisation_booking_settings for select to authenticated
using (public.clubr_user_has_access(venue_id));

drop policy if exists "ClubR staff can read notices" on public.club_notices;
create policy "ClubR staff can read notices"
on public.club_notices for select to authenticated
using (public.clubr_user_has_access(venue_id));

drop policy if exists "ClubR notice managers can create notices" on public.club_notices;
create policy "ClubR notice managers can create notices"
on public.club_notices for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and public.clubr_user_can_manage_notices(venue_id)
);

drop policy if exists "ClubR notice managers can update notices" on public.club_notices;
create policy "ClubR notice managers can update notices"
on public.club_notices for update to authenticated
using (public.clubr_user_can_manage_notices(venue_id))
with check (public.clubr_user_can_manage_notices(venue_id));

drop policy if exists "ClubR staff can read operational blocks" on public.club_operational_blocks;
create policy "ClubR staff can read operational blocks"
on public.club_operational_blocks for select to authenticated
using (public.clubr_user_has_access(venue_id));

grant select on public.club_memberships to authenticated;
grant select, insert, update on public.club_notices to authenticated;
grant select on public.club_operational_blocks to authenticated;

revoke all on function public.clubr_user_has_access(uuid, uuid) from public;
revoke all on function public.clubr_user_can_manage_members(uuid, uuid) from public;
revoke all on function public.clubr_user_can_manage_courts(uuid, uuid) from public;
revoke all on function public.clubr_user_can_manage_notices(uuid, uuid) from public;
revoke all on function public.clubr_user_can_manage_settings(uuid, uuid) from public;
revoke all on function public.clubr_user_can_view_diagnostics(uuid, uuid) from public;
revoke all on function public.clubr_user_can_view_booking_identity(uuid, uuid) from public;
revoke all on function public.clubr_user_can_read_member_profile(uuid, uuid) from public;
revoke all on function public.playr_profile_can_book_court(uuid, uuid, uuid) from public;
revoke all on function public.playr_booking_within_venue_window(uuid, timestamptz, timestamptz, uuid) from public;
revoke all on function public.clubr_set_member_status(uuid, text) from public;
revoke all on function public.clubr_set_member_role(uuid, uuid, public.organisation_role, boolean) from public;
revoke all on function public.clubr_update_court(uuid, text, text, public.court_status, time, time) from public;
revoke all on function public.clubr_operational_block_conflicts(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.clubr_create_operational_block(uuid, uuid, timestamptz, timestamptz, text, text) from public;
revoke all on function public.clubr_release_operational_block(uuid) from public;
revoke all on function public.clubr_court_occupancy_for_range(uuid, timestamptz, timestamptz) from public;
revoke all on function public.clubr_booking_detail(uuid) from public;
revoke all on function public.clubr_member_bookings(uuid, uuid, timestamptz, timestamptz) from public;

grant execute on function public.clubr_user_has_access(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_manage_members(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_manage_courts(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_manage_notices(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_manage_settings(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_view_diagnostics(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_view_booking_identity(uuid, uuid) to authenticated;
grant execute on function public.clubr_user_can_read_member_profile(uuid, uuid) to authenticated;
grant execute on function public.playr_profile_can_book_court(uuid, uuid, uuid) to authenticated;
grant execute on function public.playr_booking_within_venue_window(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.clubr_set_member_status(uuid, text) to authenticated;
grant execute on function public.clubr_set_member_role(uuid, uuid, public.organisation_role, boolean) to authenticated;
grant execute on function public.clubr_update_court(uuid, text, text, public.court_status, time, time) to authenticated;
grant execute on function public.clubr_operational_block_conflicts(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.clubr_create_operational_block(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.clubr_release_operational_block(uuid) to authenticated;
grant execute on function public.clubr_court_occupancy_for_range(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.clubr_booking_detail(uuid) to authenticated;
grant execute on function public.clubr_member_bookings(uuid, uuid, timestamptz, timestamptz) to authenticated;
