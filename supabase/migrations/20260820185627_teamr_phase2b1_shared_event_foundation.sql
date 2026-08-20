-- TeamR Phase 2B.1: extend the canonical PlayR event lifecycle with shared
-- organisation ownership. Legacy platform events remain valid with venue_id
-- null; organisation-managed events must always have a supported active host.

alter table public.events
  add column if not exists venue_id uuid references public.venues(id) on delete restrict,
  add column if not exists visibility text not null default 'open',
  add column if not exists junior_stage text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references auth.users(id) on delete set null;

alter table public.events
  drop constraint if exists events_visibility_valid,
  add constraint events_visibility_valid check (visibility in ('closed', 'open')),
  drop constraint if exists events_junior_stage_valid,
  add constraint events_junior_stage_valid check (
    junior_stage is null or junior_stage in ('red_ball', 'orange_ball', 'green_ball', 'yellow_ball')
  ),
  drop constraint if exists events_archive_metadata_complete,
  add constraint events_archive_metadata_complete check (
    (archived_at is null and archived_by_user_id is null)
    or (archived_at is not null and archived_by_user_id is not null)
  );

create index if not exists events_venue_status_starts_at_idx
on public.events(venue_id, status, starts_at)
where venue_id is not null and archived_at is null;

create index if not exists events_venue_archived_at_idx
on public.events(venue_id, archived_at)
where venue_id is not null and archived_at is not null;

create index if not exists events_archived_by_user_id_idx
on public.events(archived_by_user_id)
where archived_by_user_id is not null;

create or replace function public.organisation_can_host_events(check_venue_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.venues venue
    where venue.id = check_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district', 'club', 'club_academy')
  );
$$;

create or replace function public.user_can_view_organisation_events(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or exists (
        select 1
        from public.organisation_memberships membership
        join public.venues venue on venue.id = membership.venue_id
        where membership.user_id = check_user_id
          and membership.venue_id = check_venue_id
          and membership.status = 'active'
          and venue.status = 'active'
          and (
            (
              venue.organisation_type in ('school', 'district', 'school_district')
              and membership.role in ('organisation_admin', 'sports_coordinator', 'team_manager')
            )
            or (
              venue.organisation_type in ('club', 'club_academy')
              and membership.role in ('organisation_admin', 'club_manager', 'committee', 'reception')
            )
          )
      )
    );
$$;

create or replace function public.user_can_manage_organisation_events(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select check_user_id = (select auth.uid())
    and public.organisation_can_host_events(check_venue_id)
    and (
      public.user_is_platform_admin(check_user_id)
      or exists (
        select 1
        from public.organisation_memberships membership
        join public.venues venue on venue.id = membership.venue_id
        where membership.user_id = check_user_id
          and membership.venue_id = check_venue_id
          and membership.status = 'active'
          and venue.status = 'active'
          and (
            (
              venue.organisation_type in ('school', 'district', 'school_district')
              and membership.role in ('organisation_admin', 'sports_coordinator')
            )
            or (
              venue.organisation_type in ('club', 'club_academy')
              and membership.role in ('organisation_admin', 'club_manager')
            )
          )
      )
    );
$$;

create or replace function public.validate_organisation_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.venue_id is distinct from old.venue_id then
    raise exception 'event_host_immutable' using errcode = '23514';
  end if;

  if new.venue_id is not null and not public.organisation_can_host_events(new.venue_id) then
    raise exception 'unsupported_event_host' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.archived_at is not null and new is distinct from old then
    raise exception 'archived_event_immutable' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('published', 'cancelled'))
      or (old.status = 'published' and new.status in ('draft', 'cancelled', 'completed'))
    ) then
      raise exception 'invalid_event_status_transition' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.organisation_can_host_events(uuid) from public, anon;
revoke all on function public.user_can_view_organisation_events(uuid, uuid) from public, anon;
revoke all on function public.user_can_manage_organisation_events(uuid, uuid) from public, anon;
revoke all on function public.validate_organisation_event() from public, anon, authenticated;
grant execute on function public.organisation_can_host_events(uuid) to authenticated, service_role;
grant execute on function public.user_can_view_organisation_events(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_manage_organisation_events(uuid, uuid) to authenticated, service_role;

drop trigger if exists events_validate_organisation_event on public.events;
create trigger events_validate_organisation_event
before insert or update on public.events
for each row execute function public.validate_organisation_event();

drop policy if exists "Public users can read public events" on public.events;
drop policy if exists "Authenticated users can read published upcoming events" on public.events;
drop policy if exists "Organisation staff can read events" on public.events;
drop policy if exists "Organisation managers can create events" on public.events;
drop policy if exists "Organisation managers can update events" on public.events;

create policy "Public users can read public events"
on public.events for select
using (
  (
    status in ('published', 'completed')
    and archived_at is null
    and venue_id is null
  )
  or public.is_admin()
);

-- Organisation events deliberately do not participate in the legacy paid
-- entry workflow. Phase 2B.2 will add organisation-aware eligibility instead
-- of letting a guessed event ID bypass the new foundation.
drop policy if exists "Users can create entries for own or linked junior profiles" on public.event_entries;
create policy "Users can create entries for own or linked junior profiles"
on public.event_entries for insert to authenticated
with check (
  entered_by_user_id = (select auth.uid())
  and public.can_manage_profile(profile_id)
  and exists (
    select 1
    from public.events event
    where event.id = event_entries.event_id
      and event.venue_id is null
      and event.status = 'published'
      and event.archived_at is null
  )
);

create policy "Organisation staff can read events"
on public.events for select to authenticated
using (
  venue_id is not null
  and public.user_can_view_organisation_events(venue_id)
);

create policy "Organisation managers can create events"
on public.events for insert to authenticated
with check (
  venue_id is not null
  and created_by = (select auth.uid())
  and archived_at is null
  and archived_by_user_id is null
  and public.user_can_manage_organisation_events(venue_id)
);

create policy "Organisation managers can update events"
on public.events for update to authenticated
using (
  venue_id is not null
  and public.user_can_manage_organisation_events(venue_id)
)
with check (
  venue_id is not null
  and public.user_can_manage_organisation_events(venue_id)
  and (
    archived_at is null
    or archived_by_user_id = (select auth.uid())
  )
);

-- Rebuild the Data API ACL from an explicit baseline. Column-level UPDATE
-- intentionally omits identity, host, creator and audit timestamps.
revoke all privileges on table public.events
from public, anon, authenticated, service_role;

revoke all privileges (
  id,
  venue_id,
  title,
  slug,
  description,
  event_type,
  sport,
  category,
  age_group,
  starts_at,
  ends_at,
  start_datetime,
  end_datetime,
  location,
  capacity,
  entry_fee,
  member_price,
  non_member_price,
  max_entries,
  visibility,
  junior_stage,
  status,
  archived_at,
  archived_by_user_id,
  created_by,
  created_at,
  updated_at
) on table public.events
from public, anon, authenticated, service_role;

grant select on table public.events to anon, authenticated;
grant insert on table public.events to authenticated;
grant update (
  title,
  slug,
  description,
  event_type,
  sport,
  category,
  age_group,
  starts_at,
  ends_at,
  start_datetime,
  end_datetime,
  location,
  capacity,
  entry_fee,
  member_price,
  non_member_price,
  max_entries,
  visibility,
  junior_stage,
  status,
  archived_at,
  archived_by_user_id
) on table public.events to authenticated;
grant all privileges on table public.events to service_role;
