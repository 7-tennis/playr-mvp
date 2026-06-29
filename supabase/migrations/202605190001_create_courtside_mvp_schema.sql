create extension if not exists pgcrypto;

create type public.member_status as enum ('member', 'non_member', 'pending', 'inactive');
create type public.player_level as enum ('beginner', 'intermediate', 'advanced', 'unknown');
create type public.sport as enum ('tennis', 'pickleball', 'futsal', 'multi_sport');
create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'refunded', 'cancelled');
create type public.entry_status as enum ('active', 'cancelled', 'checked_in', 'no_show');
create type public.admin_role as enum ('admin', 'staff');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  date_of_birth date,
  is_junior boolean not null default false,
  parent_profile_id uuid references public.profiles(id) on delete cascade,
  member_status public.member_status not null default 'pending',
  player_level public.player_level not null default 'unknown',
  primary_sport public.sport not null default 'tennis',
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (length(btrim(first_name)) > 0 and length(btrim(last_name)) > 0),
  constraint profiles_parent_not_self check (parent_profile_id is null or parent_profile_id <> id),
  constraint profiles_junior_parent_required check (
    (is_junior = true and parent_profile_id is not null)
    or
    (is_junior = false and parent_profile_id is null)
  )
);

alter table public.profiles
  add constraint profiles_user_id_unique unique (user_id);

create index profiles_parent_profile_id_idx on public.profiles(parent_profile_id);
create index profiles_member_status_idx on public.profiles(member_status);
create index profiles_primary_sport_idx on public.profiles(primary_sport);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  sport public.sport not null,
  category text,
  age_group text,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  location text,
  member_price numeric(10, 2) not null default 0,
  non_member_price numeric(10, 2) not null default 0,
  max_entries integer,
  status public.event_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(btrim(title)) > 0),
  constraint events_slug_not_blank check (length(btrim(slug)) > 0),
  constraint events_datetime_order check (end_datetime > start_datetime),
  constraint events_prices_non_negative check (member_price >= 0 and non_member_price >= 0),
  constraint events_max_entries_positive check (max_entries is null or max_entries > 0)
);

create index events_status_start_datetime_idx on public.events(status, start_datetime);
create index events_sport_start_datetime_idx on public.events(sport, start_datetime);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create table public.event_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  entered_by_user_id uuid not null references auth.users(id) on delete cascade,
  price_charged numeric(10, 2) not null default 0,
  payment_status public.payment_status not null default 'unpaid',
  payment_received_at timestamptz,
  payment_reference text,
  payment_notes text,
  entry_status public.entry_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_entries_price_non_negative check (price_charged >= 0),
  constraint event_entries_payment_received_when_paid check (
    payment_status in ('paid', 'refunded') or payment_received_at is null
  ),
  constraint event_entries_profile_event_unique unique (event_id, profile_id)
);

create index event_entries_event_id_idx on public.event_entries(event_id);
create index event_entries_profile_id_idx on public.event_entries(profile_id);
create index event_entries_entered_by_user_id_idx on public.event_entries(entered_by_user_id);
create index event_entries_payment_status_idx on public.event_entries(payment_status);
create index event_entries_entry_status_idx on public.event_entries(entry_status);

create trigger event_entries_set_updated_at
before update on public.event_entries
for each row execute function public.set_updated_at();

create table public.event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_entry_id uuid references public.event_entries(id) on delete set null,
  placement integer,
  points numeric(8, 2),
  result_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_results_placement_positive check (placement is null or placement > 0),
  constraint event_results_points_non_negative check (points is null or points >= 0),
  constraint event_results_profile_event_unique unique (event_id, profile_id),
  constraint event_results_entry_unique unique (event_entry_id)
);

create index event_results_event_id_idx on public.event_results(event_id);
create index event_results_profile_id_idx on public.event_results(profile_id);
create index event_results_placement_idx on public.event_results(event_id, placement);

create trigger event_results_set_updated_at
before update on public.event_results
for each row execute function public.set_updated_at();

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role public.admin_role not null default 'admin',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index admin_users_user_id_idx on public.admin_users(user_id);
create index admin_users_role_idx on public.admin_users(role);

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = check_user_id
  );
$$;

create or replace function public.profile_belongs_to_user(check_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_profile_id
      and user_id = check_user_id
      and is_junior = false
  );
$$;

create or replace function public.profile_is_linked_junior(check_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles junior
    join public.profiles parent
      on parent.id = junior.parent_profile_id
    where junior.id = check_profile_id
      and junior.is_junior = true
      and parent.user_id = check_user_id
  );
$$;

create or replace function public.parent_profile_belongs_to_user(check_parent_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_parent_profile_id
      and user_id = check_user_id
      and is_junior = false
  );
$$;

create or replace function public.can_manage_profile(check_profile_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.profile_belongs_to_user(check_profile_id, check_user_id)
    or public.profile_is_linked_junior(check_profile_id, check_user_id);
$$;

create or replace function public.event_entry_count(check_event_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.event_entries
  where event_id = check_event_id
    and entry_status <> 'cancelled';
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_entries enable row level security;
alter table public.event_results enable row level security;
alter table public.admin_users enable row level security;

create policy "Admins can manage profiles"
on public.profiles
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can create their own adult profile"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and is_junior = false
  and parent_profile_id is null
);

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and is_junior = false
  and parent_profile_id is null
);

create policy "Parents can read linked junior profiles"
on public.profiles
for select
to authenticated
using (public.profile_is_linked_junior(id));

create policy "Parents can create linked junior profiles"
on public.profiles
for insert
to authenticated
with check (
  is_junior = true
  and user_id is null
  and public.parent_profile_belongs_to_user(parent_profile_id)
);

create policy "Parents can update linked junior profiles"
on public.profiles
for update
to authenticated
using (public.profile_is_linked_junior(id))
with check (
  is_junior = true
  and public.profile_is_linked_junior(id)
);

create policy "Parents can delete linked junior profiles"
on public.profiles
for delete
to authenticated
using (public.profile_is_linked_junior(id));

create policy "Public users can read published events"
on public.events
for select
using (status = 'published' or public.is_admin());

create policy "Admins can manage events"
on public.events
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their own event entries"
on public.event_entries
for select
to authenticated
using (
  public.can_manage_profile(profile_id)
  or public.is_admin()
);

create policy "Users can create entries for own or linked junior profiles"
on public.event_entries
for insert
to authenticated
with check (
  entered_by_user_id = auth.uid()
  and public.can_manage_profile(profile_id)
);

create policy "Admins can manage event entries"
on public.event_entries
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their own event results"
on public.event_results
for select
to authenticated
using (
  public.can_manage_profile(profile_id)
  or public.is_admin()
);

create policy "Admins can manage event results"
on public.event_results
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read their own admin status"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can manage admin users"
on public.admin_users
for all
using (public.is_admin())
with check (public.is_admin());
