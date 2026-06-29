create extension if not exists btree_gist;

create type public.court_status as enum ('active', 'inactive');
create type public.court_booking_status as enum ('confirmed', 'cancelled');
create type public.court_booking_type as enum ('player_booking', 'lesson', 'maintenance', 'club_programme', 'competition', 'americano');

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.court_status not null default 'active',
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_name_not_blank check (length(btrim(name)) > 0)
);

create trigger courts_set_updated_at
before update on public.courts
for each row execute function public.set_updated_at();

create table public.court_bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  booked_by_user_id uuid not null references auth.users(id) on delete cascade,
  player_profile_id uuid references public.profiles(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.court_booking_status not null default 'confirmed',
  booking_type public.court_booking_type not null default 'player_booking',
  is_public boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  constraint court_bookings_time_order check (end_time > start_time),
  constraint court_bookings_cancelled_fields check (
    (status = 'cancelled' and cancelled_at is not null)
    or
    (status = 'confirmed' and cancelled_at is null)
  ),
  constraint court_bookings_no_overlap exclude using gist (
    court_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status = 'confirmed')
);

create index courts_status_sort_order_idx on public.courts(status, sort_order);
create index court_bookings_court_start_idx on public.court_bookings(court_id, start_time);
create index court_bookings_booked_by_user_idx on public.court_bookings(booked_by_user_id);
create index court_bookings_player_profile_idx on public.court_bookings(player_profile_id);
create index court_bookings_status_idx on public.court_bookings(status);

create trigger court_bookings_set_updated_at
before update on public.court_bookings
for each row execute function public.set_updated_at();

insert into public.courts (name, sort_order)
values
  ('Court 1', 1),
  ('Court 2', 2),
  ('Court 3', 3),
  ('Court 4', 4)
on conflict (name) do update
set sort_order = excluded.sort_order,
    updated_at = now();

alter table public.courts enable row level security;
alter table public.court_bookings enable row level security;

create policy "Authenticated users can read active courts"
on public.courts
for select
to authenticated
using (status = 'active' or public.is_admin());

create policy "Admins can manage courts"
on public.courts
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their own court bookings"
on public.court_bookings
for select
to authenticated
using (
  booked_by_user_id = auth.uid()
  or public.can_manage_profile(player_profile_id)
  or public.is_admin()
);

create policy "Users can create court bookings for own profiles"
on public.court_bookings
for insert
to authenticated
with check (
  booked_by_user_id = auth.uid()
  and booking_type = 'player_booking'
  and status = 'confirmed'
  and start_time >= now()
  and start_time < now() + interval '7 days'
  and public.can_manage_profile(player_profile_id)
);

create policy "Users can cancel their own future court bookings"
on public.court_bookings
for update
to authenticated
using (
  booked_by_user_id = auth.uid()
  and status = 'confirmed'
  and start_time > now()
)
with check (
  booked_by_user_id = auth.uid()
  and status = 'cancelled'
  and cancelled_by_user_id = auth.uid()
  and cancelled_at is not null
);

create policy "Admins can manage court bookings"
on public.court_bookings
for all
using (public.is_admin())
with check (public.is_admin());
