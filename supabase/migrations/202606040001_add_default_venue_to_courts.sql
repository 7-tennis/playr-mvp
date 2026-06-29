create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_name_not_blank check (length(btrim(name)) > 0),
  constraint venues_slug_not_blank check (length(btrim(slug)) > 0),
  constraint venues_status_valid check (status in ('active', 'inactive'))
);

drop trigger if exists venues_set_updated_at on public.venues;
create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

insert into public.venues (name, slug)
values ('Kenmare Tennis Club', 'kenmare-tennis-club')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();

alter table public.courts
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

update public.courts
set venue_id = (select id from public.venues where slug = 'kenmare-tennis-club')
where venue_id is null;

create index if not exists courts_venue_id_idx on public.courts(venue_id);

alter table public.venues enable row level security;

grant select on public.venues to authenticated;
grant insert, update, delete on public.venues to authenticated;

drop policy if exists "Authenticated users can read active venues" on public.venues;
create policy "Authenticated users can read active venues"
on public.venues
for select
to authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "Admins can manage venues" on public.venues;
create policy "Admins can manage venues"
on public.venues
for all
using (public.is_admin())
with check (public.is_admin());
