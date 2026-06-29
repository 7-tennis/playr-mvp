-- CourtSide Events V1 hardening and compatibility layer.
-- Existing app columns are preserved; V1 names are synced for future clients.

alter table public.events
  add column if not exists event_type text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists capacity integer,
  add column if not exists entry_fee numeric(10, 2);

update public.events
set
  event_type = coalesce(event_type, category, sport::text),
  starts_at = coalesce(starts_at, start_datetime),
  ends_at = coalesce(ends_at, end_datetime),
  capacity = coalesce(capacity, max_entries),
  entry_fee = coalesce(entry_fee, non_member_price, member_price, 0)
where event_type is null
  or starts_at is null
  or ends_at is null
  or capacity is distinct from max_entries
  or entry_fee is null;

alter table public.events
  alter column event_type set default 'club_event',
  alter column entry_fee set default 0,
  add constraint events_v1_datetime_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  add constraint events_v1_capacity_positive check (capacity is null or capacity > 0),
  add constraint events_v1_entry_fee_non_negative check (entry_fee is null or entry_fee >= 0);

create or replace function public.sync_event_v1_fields()
returns trigger
language plpgsql
as $$
begin
  new.start_datetime = coalesce(new.start_datetime, new.starts_at);
  new.end_datetime = coalesce(new.end_datetime, new.ends_at);
  new.starts_at = coalesce(new.starts_at, new.start_datetime);
  new.ends_at = coalesce(new.ends_at, new.end_datetime);
  new.category = coalesce(nullif(btrim(new.category), ''), nullif(btrim(new.event_type), ''));
  new.event_type = coalesce(nullif(btrim(new.event_type), ''), new.category, new.sport::text, 'club_event');
  new.max_entries = coalesce(new.max_entries, new.capacity);
  new.capacity = coalesce(new.capacity, new.max_entries);
  new.entry_fee = coalesce(new.entry_fee, new.non_member_price, new.member_price, 0);
  return new;
end;
$$;

drop trigger if exists events_sync_v1_fields on public.events;
create trigger events_sync_v1_fields
before insert or update on public.events
for each row execute function public.sync_event_v1_fields();

create index if not exists events_starts_at_status_idx on public.events(starts_at, status);

alter table public.event_entries
  add column if not exists status public.entry_status;

update public.event_entries
set status = coalesce(status, entry_status)
where status is null;

alter table public.event_entries
  alter column status set default 'active';

create or replace function public.sync_event_entry_v1_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.entry_status is distinct from old.entry_status then
    new.status = new.entry_status;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.entry_status = new.status;
  else
    new.entry_status = coalesce(new.entry_status, new.status, 'active');
    new.status = coalesce(new.status, new.entry_status, 'active');
  end if;

  return new;
end;
$$;

drop trigger if exists event_entries_sync_v1_fields on public.event_entries;
create trigger event_entries_sync_v1_fields
before insert or update on public.event_entries
for each row execute function public.sync_event_entry_v1_fields();

alter table public.event_entries
  drop constraint if exists event_entries_profile_event_unique;

create unique index if not exists event_entries_active_profile_event_unique
on public.event_entries(event_id, profile_id)
where entry_status <> 'cancelled';

create index if not exists event_entries_status_idx on public.event_entries(status);

grant select on public.events to anon;
grant select on public.events to authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, insert, update on public.event_entries to authenticated;

drop policy if exists "Authenticated users can read published upcoming events" on public.events;
create policy "Authenticated users can read published upcoming events"
on public.events
for select
to authenticated
using (
  public.is_admin()
  or (
    status = 'published'
    and coalesce(starts_at, start_datetime) >= now()
  )
);

drop policy if exists "Users can withdraw own future event entries" on public.event_entries;
create policy "Users can withdraw own future event entries"
on public.event_entries
for update
to authenticated
using (
  public.can_manage_profile(profile_id)
  and entry_status <> 'cancelled'
  and exists (
    select 1
    from public.events
    where events.id = event_entries.event_id
      and coalesce(events.starts_at, events.start_datetime) > now()
      and events.status = 'published'
  )
)
with check (
  public.can_manage_profile(profile_id)
  and entry_status = 'cancelled'
  and status = 'cancelled'
);
