-- Phase 1 refinement: guided product setup, delegated organisation ownership,
-- external coaching venues, court-access requests and invitation proposals.

create table if not exists public.organisation_product_setups (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  product_context text not null,
  status text not null default 'not_started',
  current_step text not null default 'details',
  completed_steps text[] not null default '{}'::text[],
  skipped_steps text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_product_setups_product_valid check (product_context in ('clubr', 'coachr', 'teamr')),
  constraint organisation_product_setups_status_valid check (status in ('not_started', 'in_progress', 'complete', 'skipped', 'needs_review')),
  constraint organisation_product_setups_completion_valid check (
    (status = 'complete' and completed_at is not null)
    or (status <> 'complete')
  ),
  constraint organisation_product_setups_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (venue_id, product_context)
);

create index if not exists organisation_product_setups_status_idx
on public.organisation_product_setups(product_context, status, updated_at desc);

create table if not exists public.organisation_booking_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  slot_minutes integer not null default 60,
  opening_time time not null default '06:00',
  closing_time time not null default '21:00',
  member_booking_enabled boolean not null default true,
  non_member_booking_enabled boolean not null default false,
  non_member_price_cents integer,
  advance_booking_days integer not null default 7,
  max_active_bookings integer not null default 3,
  no_courts boolean not null default false,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_booking_settings_slot_valid check (slot_minutes in (15, 30, 45, 60, 90, 120)),
  constraint organisation_booking_settings_time_valid check (closing_time > opening_time),
  constraint organisation_booking_settings_price_valid check (non_member_price_cents is null or non_member_price_cents >= 0),
  constraint organisation_booking_settings_advance_valid check (advance_booking_days between 0 and 365),
  constraint organisation_booking_settings_active_valid check (max_active_bookings between 1 and 100)
);

create table if not exists public.organisation_coaching_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  default_lesson_duration_minutes integer not null default 60,
  default_lesson_type public.coach_lesson_type not null default 'private',
  default_external_venue_id uuid,
  private_lessons_enabled boolean not null default true,
  group_lessons_enabled boolean not null default true,
  no_default_venue boolean not null default false,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_coaching_settings_duration_valid check (default_lesson_duration_minutes in (30, 45, 60, 75, 90, 120))
);

create table if not exists public.organisation_external_venues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  address text,
  contact_name text,
  contact_email text,
  contact_phone text,
  court_count integer,
  court_names text[] not null default '{}'::text[],
  notes text,
  status text not null default 'active',
  linked_venue_id uuid references public.venues(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_external_venues_name_not_blank check (length(btrim(name)) > 0),
  constraint organisation_external_venues_status_valid check (status in ('active', 'inactive')),
  constraint organisation_external_venues_count_valid check (court_count is null or court_count between 0 and 100)
);

alter table public.organisation_coaching_settings
  drop constraint if exists organisation_coaching_settings_default_external_venue_id_fkey;
alter table public.organisation_coaching_settings
  add constraint organisation_coaching_settings_default_external_venue_id_fkey
  foreign key (default_external_venue_id) references public.organisation_external_venues(id) on delete set null;

create index if not exists organisation_external_venues_org_idx
on public.organisation_external_venues(organisation_id, status, name);

create table if not exists public.organisation_court_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_venue_id uuid not null references public.venues(id) on delete cascade,
  owner_venue_id uuid not null references public.venues(id) on delete cascade,
  requested_court_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending',
  request_notes text,
  response_notes text,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  responded_by_user_id uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_court_access_requests_different_orgs check (requester_venue_id <> owner_venue_id),
  constraint organisation_court_access_requests_status_valid check (status in ('pending', 'active', 'declined', 'cancelled', 'expired'))
);

create index if not exists organisation_court_access_requests_requester_idx
on public.organisation_court_access_requests(requester_venue_id, status, created_at desc);
create index if not exists organisation_court_access_requests_owner_idx
on public.organisation_court_access_requests(owner_venue_id, status, created_at desc);
create unique index if not exists organisation_court_access_requests_pending_unique
on public.organisation_court_access_requests(requester_venue_id, owner_venue_id)
where status = 'pending';

alter table public.courts
  add column if not exists court_number text,
  add column if not exists surface text,
  add column if not exists lighting_available boolean not null default false,
  add column if not exists opening_time time,
  add column if not exists closing_time time;

alter table public.venues
  add column if not exists main_contact_name text;

alter table public.courts drop constraint if exists courts_operating_time_valid;
alter table public.courts add constraint courts_operating_time_valid check (
  closing_time is null or opening_time is null or closing_time > opening_time
);

alter table public.coach_lessons
  add column if not exists external_venue_id uuid references public.organisation_external_venues(id) on delete set null;

create index if not exists coach_lessons_external_venue_idx
on public.coach_lessons(external_venue_id, start_time)
where external_venue_id is not null;

alter table public.organisation_player_links
  add column if not exists connection_context jsonb not null default '{}'::jsonb,
  add column if not exists proposal_status text not null default 'not_specified';

alter table public.organisation_player_links drop constraint if exists organisation_player_links_proposal_status_valid;
alter table public.organisation_player_links add constraint organisation_player_links_proposal_status_valid check (
  proposal_status in ('not_specified', 'proposed', 'confirmed', 'declined')
);

create index if not exists organisation_player_links_player_active_org_idx
on public.organisation_player_links(player_profile_id, venue_id, status)
where status in ('pending', 'active', 'suspended');

drop trigger if exists organisation_product_setups_set_updated_at on public.organisation_product_setups;
create trigger organisation_product_setups_set_updated_at before update on public.organisation_product_setups
for each row execute function public.set_updated_at();
drop trigger if exists organisation_booking_settings_set_updated_at on public.organisation_booking_settings;
create trigger organisation_booking_settings_set_updated_at before update on public.organisation_booking_settings
for each row execute function public.set_updated_at();
drop trigger if exists organisation_coaching_settings_set_updated_at on public.organisation_coaching_settings;
create trigger organisation_coaching_settings_set_updated_at before update on public.organisation_coaching_settings
for each row execute function public.set_updated_at();
drop trigger if exists organisation_external_venues_set_updated_at on public.organisation_external_venues;
create trigger organisation_external_venues_set_updated_at before update on public.organisation_external_venues
for each row execute function public.set_updated_at();
drop trigger if exists organisation_court_access_requests_set_updated_at on public.organisation_court_access_requests;
create trigger organisation_court_access_requests_set_updated_at before update on public.organisation_court_access_requests
for each row execute function public.set_updated_at();

create or replace function public.user_can_manage_product_setup(
  check_venue_id uuid,
  check_product_context text,
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
      or (
        check_product_context = 'clubr'
        and public.user_has_active_organisation_role(
          check_venue_id,
          array['organisation_admin', 'club_manager', 'sports_coordinator']::public.organisation_role[],
          check_user_id
        )
      )
      or (
        check_product_context = 'coachr'
        and public.user_has_active_organisation_role(
          check_venue_id,
          array['organisation_admin', 'club_manager', 'head_coach']::public.organisation_role[],
          check_user_id
        )
      )
      or (
        check_product_context = 'teamr'
        and public.user_has_active_organisation_role(
          check_venue_id,
          array['organisation_admin', 'sports_coordinator', 'team_manager']::public.organisation_role[],
          check_user_id
        )
      )
    );
$$;

create or replace function public.user_can_read_product_setup(
  check_venue_id uuid,
  check_product_context text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_can_manage_product_setup(check_venue_id, check_product_context, check_user_id)
    or public.user_has_active_organisation_role(
      check_venue_id,
      array['head_coach', 'coach', 'assistant_coach', 'viewer']::public.organisation_role[],
      check_user_id
    );
$$;

alter table public.organisation_product_setups enable row level security;
alter table public.organisation_booking_settings enable row level security;
alter table public.organisation_coaching_settings enable row level security;
alter table public.organisation_external_venues enable row level security;
alter table public.organisation_court_access_requests enable row level security;

grant select, insert, update on public.organisation_product_setups to authenticated;
grant select, insert, update on public.organisation_booking_settings to authenticated;
grant select, insert, update on public.organisation_coaching_settings to authenticated;
grant select, insert, update on public.organisation_external_venues to authenticated;
grant select, insert, update on public.organisation_court_access_requests to authenticated;

create policy "Users can read relevant product setup"
on public.organisation_product_setups for select to authenticated
using (public.user_can_read_product_setup(venue_id, product_context));
create policy "Leaders can create product setup"
on public.organisation_product_setups for insert to authenticated
with check (public.user_can_manage_product_setup(venue_id, product_context));
create policy "Leaders can update product setup"
on public.organisation_product_setups for update to authenticated
using (public.user_can_manage_product_setup(venue_id, product_context))
with check (public.user_can_manage_product_setup(venue_id, product_context));

create policy "Club leaders can read booking settings"
on public.organisation_booking_settings for select to authenticated
using (public.user_can_read_product_setup(venue_id, 'clubr'));
create policy "Club leaders can create booking settings"
on public.organisation_booking_settings for insert to authenticated
with check (public.user_can_manage_product_setup(venue_id, 'clubr'));
create policy "Club leaders can update booking settings"
on public.organisation_booking_settings for update to authenticated
using (public.user_can_manage_product_setup(venue_id, 'clubr'))
with check (public.user_can_manage_product_setup(venue_id, 'clubr'));

create policy "CoachR users can read coaching settings"
on public.organisation_coaching_settings for select to authenticated
using (public.user_can_read_product_setup(venue_id, 'coachr'));
create policy "Academy leaders can create coaching settings"
on public.organisation_coaching_settings for insert to authenticated
with check (public.user_can_manage_product_setup(venue_id, 'coachr'));
create policy "Academy leaders can update coaching settings"
on public.organisation_coaching_settings for update to authenticated
using (public.user_can_manage_product_setup(venue_id, 'coachr'))
with check (public.user_can_manage_product_setup(venue_id, 'coachr'));

create policy "CoachR users can read external venues"
on public.organisation_external_venues for select to authenticated
using (public.user_can_read_product_setup(organisation_id, 'coachr'));
create policy "Academy leaders can create external venues"
on public.organisation_external_venues for insert to authenticated
with check (
  created_by_user_id = (select auth.uid())
  and public.user_can_manage_product_setup(organisation_id, 'coachr')
);
create policy "Academy leaders can update external venues"
on public.organisation_external_venues for update to authenticated
using (public.user_can_manage_product_setup(organisation_id, 'coachr'))
with check (public.user_can_manage_product_setup(organisation_id, 'coachr'));

create policy "Organisation leaders can read court requests"
on public.organisation_court_access_requests for select to authenticated
using (
  public.user_can_manage_product_setup(requester_venue_id, 'coachr')
  or public.user_can_manage_product_setup(owner_venue_id, 'clubr')
);
create policy "Academy leaders can create court requests"
on public.organisation_court_access_requests for insert to authenticated
with check (
  requested_by_user_id = (select auth.uid())
  and public.user_can_manage_product_setup(requester_venue_id, 'coachr')
);
create policy "Relevant leaders can update court requests"
on public.organisation_court_access_requests for update to authenticated
using (
  public.user_can_manage_product_setup(requester_venue_id, 'coachr')
  or public.user_can_manage_product_setup(owner_venue_id, 'clubr')
)
with check (
  public.user_can_manage_product_setup(requester_venue_id, 'coachr')
  or public.user_can_manage_product_setup(owner_venue_id, 'clubr')
);

create or replace function public.platform_delegate_organisation(
  p_venue_id uuid,
  p_organisation_name text,
  p_organisation_type text,
  p_profile_id uuid,
  p_leader_role public.organisation_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  selected_venue_id uuid := p_venue_id;
  target_user_id uuid;
  setup_product text;
  generated_slug text;
begin
  if actor_user_id is null or not public.user_is_platform_admin(actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_profile_id is null or p_organisation_type not in ('academy', 'club', 'school', 'district', 'club_academy', 'school_district') then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  select profile.user_id into target_user_id
  from public.profiles profile
  where profile.id = p_profile_id and profile.is_junior = false
  limit 1;
  if target_user_id is null then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  if p_organisation_type in ('club', 'club_academy') and p_leader_role not in ('organisation_admin', 'club_manager', 'head_coach') then
    raise exception 'invalid_role' using errcode = 'P0001';
  elsif p_organisation_type = 'academy' and p_leader_role not in ('organisation_admin', 'head_coach') then
    raise exception 'invalid_role' using errcode = 'P0001';
  elsif p_organisation_type in ('school', 'school_district') and p_leader_role not in ('organisation_admin', 'sports_coordinator') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  if selected_venue_id is null then
    if length(btrim(coalesce(p_organisation_name, ''))) = 0 then
      raise exception 'missing_fields' using errcode = 'P0001';
    end if;
    generated_slug := regexp_replace(lower(btrim(p_organisation_name)), '[^a-z0-9]+', '-', 'g');
    generated_slug := trim(both '-' from generated_slug);
    if generated_slug = '' then generated_slug := 'organisation'; end if;
    if exists (select 1 from public.venues where slug = generated_slug) then
      generated_slug := generated_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    end if;

    insert into public.venues(name, slug, status, organisation_type)
    values (btrim(p_organisation_name), generated_slug, 'active', p_organisation_type)
    returning id into selected_venue_id;
  else
    update public.venues
    set organisation_type = p_organisation_type,
        status = 'active'
    where id = selected_venue_id;
    if not found then raise exception 'invalid_venue' using errcode = 'P0001'; end if;
  end if;

  insert into public.organisation_memberships(
    venue_id, profile_id, user_id, role, status, invited_by_user_id, accepted_at
  ) values (
    selected_venue_id, p_profile_id, target_user_id, p_leader_role, 'active', actor_user_id, now()
  )
  on conflict (venue_id, profile_id, role)
  where status in ('pending', 'active', 'suspended')
  do update set
    user_id = excluded.user_id,
    status = 'active',
    accepted_at = coalesce(public.organisation_memberships.accepted_at, now()),
    removed_at = null,
    suspended_at = null;

  perform public.sync_legacy_admin_user_from_membership(
    target_user_id, selected_venue_id, p_leader_role, actor_user_id
  );

  update public.venues
  set primary_admin_profile_id = case when p_leader_role in ('organisation_admin', 'club_manager', 'sports_coordinator') then p_profile_id else primary_admin_profile_id end,
      head_coach_profile_id = case when p_leader_role = 'head_coach' then p_profile_id else head_coach_profile_id end
  where id = selected_venue_id;

  setup_product := case
    when p_leader_role = 'head_coach' then 'coachr'
    when p_leader_role = 'sports_coordinator' then 'teamr'
    else 'clubr'
  end;
  if p_organisation_type = 'academy' then setup_product := 'coachr'; end if;

  insert into public.organisation_product_setups(
    venue_id, product_context, status, current_step, metadata
  ) values (
    selected_venue_id,
    setup_product,
    'not_started',
    'details',
    jsonb_build_object('assignedLeaderProfileId', p_profile_id, 'assignedByUserId', actor_user_id)
  )
  on conflict (venue_id, product_context) do update
  set metadata = public.organisation_product_setups.metadata || excluded.metadata,
      updated_at = now();

  insert into public.user_active_organisations(user_id, venue_id, product_context)
  values (target_user_id, selected_venue_id, setup_product)
  on conflict (user_id) do update
  set venue_id = excluded.venue_id,
      product_context = excluded.product_context,
      updated_at = now();

  return selected_venue_id;
end;
$$;

create or replace function public.save_organisation_setup_progress(
  p_venue_id uuid,
  p_product_context text,
  p_current_step text,
  p_completed_step text default null,
  p_skipped_step text default null,
  p_status text default 'in_progress'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.user_can_manage_product_setup(p_venue_id, p_product_context, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_product_context not in ('clubr', 'coachr', 'teamr')
    or p_status not in ('not_started', 'in_progress', 'complete', 'skipped', 'needs_review')
    or length(btrim(coalesce(p_current_step, ''))) = 0 then
    raise exception 'invalid_setup' using errcode = 'P0001';
  end if;

  insert into public.organisation_product_setups(
    venue_id, product_context, status, current_step, completed_steps, skipped_steps,
    completed_by_user_id, completed_at
  ) values (
    p_venue_id,
    p_product_context,
    p_status,
    p_current_step,
    case when p_completed_step is null then '{}'::text[] else array[p_completed_step] end,
    case when p_skipped_step is null then '{}'::text[] else array[p_skipped_step] end,
    case when p_status = 'complete' then actor_user_id else null end,
    case when p_status = 'complete' then now() else null end
  )
  on conflict (venue_id, product_context) do update
  set status = case
        when public.organisation_product_setups.status = 'complete' and excluded.status = 'in_progress' then 'complete'
        else excluded.status
      end,
      current_step = excluded.current_step,
      completed_steps = case
        when p_completed_step is null then public.organisation_product_setups.completed_steps
        else array(select distinct unnest(public.organisation_product_setups.completed_steps || p_completed_step))
      end,
      skipped_steps = case
        when p_skipped_step is null then public.organisation_product_setups.skipped_steps
        else array(select distinct unnest(public.organisation_product_setups.skipped_steps || p_skipped_step))
      end,
      completed_by_user_id = case
        when public.organisation_product_setups.status = 'complete' and excluded.status = 'in_progress' then public.organisation_product_setups.completed_by_user_id
        else excluded.completed_by_user_id
      end,
      completed_at = case
        when public.organisation_product_setups.status = 'complete' and excluded.status = 'in_progress' then public.organisation_product_setups.completed_at
        else excluded.completed_at
      end,
      updated_at = now();
end;
$$;

create or replace function public.request_organisation_court_access(
  p_requester_venue_id uuid,
  p_owner_venue_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  request_id uuid;
begin
  if actor_user_id is null
    or not public.user_can_manage_product_setup(p_requester_venue_id, 'coachr', actor_user_id)
    or p_requester_venue_id = p_owner_venue_id then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organisation_court_access access
    where access.owner_venue_id = p_owner_venue_id
      and access.approved_venue_id = p_requester_venue_id
      and access.status = 'active'
      and (access.valid_from is null or access.valid_from <= current_date)
      and (access.valid_until is null or access.valid_until >= current_date)
  ) then
    raise exception 'access_active' using errcode = 'P0001';
  end if;

  insert into public.organisation_court_access_requests(
    requester_venue_id, owner_venue_id, request_notes, requested_by_user_id
  ) values (
    p_requester_venue_id, p_owner_venue_id, nullif(btrim(coalesce(p_notes, '')), ''), actor_user_id
  )
  on conflict (requester_venue_id, owner_venue_id) where status = 'pending'
  do update set request_notes = excluded.request_notes, updated_at = now()
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.respond_to_court_access_request(
  p_request_id uuid,
  p_decision text,
  p_court_ids uuid[] default '{}'::uuid[],
  p_response_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  request_row public.organisation_court_access_requests%rowtype;
  selected_court_id uuid;
begin
  select * into request_row
  from public.organisation_court_access_requests
  where id = p_request_id
  for update;
  if actor_user_id is null or request_row.id is null
    or not public.user_can_manage_court_access(request_row.owner_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if request_row.status <> 'pending' then raise exception 'request_closed' using errcode = 'P0001'; end if;
  if p_decision not in ('active', 'declined') then raise exception 'invalid_decision' using errcode = 'P0001'; end if;

  if p_decision = 'active' then
    if coalesce(array_length(p_court_ids, 1), 0) = 0 then
      perform public.grant_organisation_court_access(
        request_row.owner_venue_id, request_row.requester_venue_id, null, null, null, p_response_notes
      );
    else
      foreach selected_court_id in array p_court_ids loop
        if not exists (
          select 1 from public.courts
          where id = selected_court_id and venue_id = request_row.owner_venue_id and status = 'active'
        ) then raise exception 'court_venue' using errcode = 'P0001'; end if;
        perform public.grant_organisation_court_access(
          request_row.owner_venue_id, request_row.requester_venue_id, selected_court_id, null, null, p_response_notes
        );
      end loop;
    end if;
  end if;

  update public.organisation_court_access_requests
  set status = p_decision,
      requested_court_ids = coalesce(p_court_ids, '{}'::uuid[]),
      response_notes = nullif(btrim(coalesce(p_response_notes, '')), ''),
      responded_by_user_id = actor_user_id,
      responded_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.coachr_resolve_court_readiness(
  p_academy_venue_id uuid,
  p_owner_venue_id uuid,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_exclude_lesson_id uuid default null
)
returns table(status text, reason text, next_action text, available_courts jsonb)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  excluded_booking_id uuid;
  court_rows jsonb;
  active_access_count integer;
begin
  if actor_user_id is null or not public.coachr_user_can_use_organisation(p_academy_venue_id, actor_user_id) then
    return query select 'invalid_context', 'This academy is not available in your current account.', 'Switch organisation', '[]'::jsonb;
    return;
  end if;
  if p_owner_venue_id is null then
    return query select 'invalid_context', 'Choose a club or school.', 'Choose venue', '[]'::jsonb;
    return;
  end if;

  if p_exclude_lesson_id is not null then
    select lesson.court_booking_id into excluded_booking_id
    from public.coach_lessons lesson
    where lesson.id = p_exclude_lesson_id and public.can_manage_coach_lesson(lesson.id);
  end if;

  if p_owner_venue_id = p_academy_venue_id then
    select coalesce(jsonb_agg(jsonb_build_object(
      'court_id', court.id,
      'court_name', court.name,
      'owner_venue_id', owner.id,
      'owner_venue_name', owner.name,
      'available', case
        when p_start_time is null or p_end_time is null then true
        else not exists (
          select 1 from public.court_bookings booking
          where booking.court_id = court.id
            and booking.status = 'confirmed'
            and booking.id is distinct from excluded_booking_id
            and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
        )
      end
    ) order by court.sort_order, court.name), '[]'::jsonb)
    into court_rows
    from public.courts court
    join public.venues owner on owner.id = court.venue_id
    where court.venue_id = p_owner_venue_id and court.status = 'active';

    if jsonb_array_length(court_rows) = 0 then
      return query select 'no_courts_shared', 'This organisation has no active courts yet.', 'Add a court or choose another venue', court_rows;
    elsif p_start_time is not null and p_end_time is not null
      and not exists (select 1 from jsonb_array_elements(court_rows) item where (item ->> 'available')::boolean) then
      return query select 'unavailable', 'The courts are unavailable for this lesson time.', 'Choose another time or location', court_rows;
    end if;
    return query select 'active', 'Organisation courts are ready.', 'Choose an available court', court_rows;
    return;
  end if;

  select count(*)::integer into active_access_count
  from public.organisation_court_access access
  where access.owner_venue_id = p_owner_venue_id
    and access.approved_venue_id = p_academy_venue_id
    and access.status = 'active'
    and (access.valid_from is null or access.valid_from <= current_date)
    and (access.valid_until is null or access.valid_until >= current_date);

  if active_access_count = 0 then
    if exists (
      select 1 from public.organisation_court_access_requests request
      where request.requester_venue_id = p_academy_venue_id
        and request.owner_venue_id = p_owner_venue_id and request.status = 'pending'
    ) then
      return query select 'pending', 'The club or school has not approved this request yet.', 'Wait for approval', '[]'::jsonb;
    elsif exists (
      select 1 from public.organisation_court_access access
      where access.owner_venue_id = p_owner_venue_id
        and access.approved_venue_id = p_academy_venue_id
        and access.status = 'revoked'
    ) then
      return query select 'revoked', 'Court access was revoked by the court owner.', 'Request access again', '[]'::jsonb;
    elsif exists (
      select 1 from public.organisation_court_access access
      where access.owner_venue_id = p_owner_venue_id
        and access.approved_venue_id = p_academy_venue_id
        and access.status = 'active' and access.valid_until < current_date
    ) then
      return query select 'expired', 'Court access has expired.', 'Request renewed access', '[]'::jsonb;
    end if;
    return query select 'pending', 'Court access has not been granted.', 'Send access request', '[]'::jsonb;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'court_id', court.id,
    'court_name', court.name,
    'owner_venue_id', owner.id,
    'owner_venue_name', owner.name,
    'available', case
      when p_start_time is null or p_end_time is null then true
      else not exists (
        select 1 from public.court_bookings booking
        where booking.court_id = court.id
          and booking.status = 'confirmed'
          and booking.id is distinct from excluded_booking_id
          and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
      )
    end
  ) order by court.sort_order, court.name), '[]'::jsonb)
  into court_rows
  from public.courts court
  join public.venues owner on owner.id = court.venue_id
  where court.venue_id = p_owner_venue_id
    and court.status = 'active'
    and exists (
      select 1 from public.organisation_court_access access
      where access.owner_venue_id = p_owner_venue_id
        and access.approved_venue_id = p_academy_venue_id
        and access.status = 'active'
        and (access.court_id is null or access.court_id = court.id)
        and (access.valid_from is null or access.valid_from <= current_date)
        and (access.valid_until is null or access.valid_until >= current_date)
    );

  if jsonb_array_length(court_rows) = 0 then
    return query select 'no_courts_shared', 'Access is active, but no active courts have been shared.', 'Ask the court owner to select courts', court_rows;
  elsif p_start_time is not null and p_end_time is not null
    and not exists (select 1 from jsonb_array_elements(court_rows) item where (item ->> 'available')::boolean) then
    return query select 'unavailable', 'The shared courts are unavailable for this lesson time.', 'Choose another time or location', court_rows;
  end if;
  return query select 'active', 'Court access is active.', 'Choose an available court', court_rows;
end;
$$;

create or replace function public.attach_external_venue_to_lesson_plan(
  p_plan_id uuid,
  p_external_venue_id uuid default null,
  p_scope text default 'single'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_lesson public.coach_lessons%rowtype;
begin
  select * into target_lesson from public.coach_lessons
  where id = p_plan_id or recurring_group_id = p_plan_id
  order by start_time limit 1;
  if actor_user_id is null or target_lesson.id is null
    or not (
      public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
      or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
    ) then raise exception 'access' using errcode = 'P0001'; end if;
  if p_scope not in ('single', 'future', 'series') then raise exception 'invalid_lesson' using errcode = 'P0001'; end if;
  if p_external_venue_id is not null and not exists (
    select 1 from public.organisation_external_venues external
    where external.id = p_external_venue_id
      and external.organisation_id = target_lesson.venue_id
      and external.status = 'active'
  ) then raise exception 'external_venue' using errcode = 'P0001'; end if;

  update public.coach_lessons lesson
  set external_venue_id = p_external_venue_id
  where (
      lesson.id = p_plan_id
      or lesson.recurring_group_id = p_plan_id
      or (
        target_lesson.recurring_group_id is not null
        and lesson.recurring_group_id = target_lesson.recurring_group_id
        and p_scope in ('future', 'series')
        and (p_scope = 'series' or lesson.start_time >= target_lesson.start_time)
      )
    )
    and lesson.status = 'scheduled'
    and not exists (select 1 from public.coach_lesson_attendance attendance where attendance.lesson_id = lesson.id);
end;
$$;

create or replace function public.coachr_create_lesson_plan_with_location(
  p_venue_id uuid,
  p_coach_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
  p_external_venue_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_repeat_mode text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_recurrence_start_date date,
  p_recurrence_end_date date,
  p_day_of_week integer,
  p_recurrence_start_time time,
  p_recurrence_end_time time,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_id uuid;
begin
  if p_external_venue_id is not null and p_location_type <> 'custom' then
    raise exception 'external_venue' using errcode = 'P0001';
  end if;

  plan_id := public.coachr_create_lesson_plan(
    p_venue_id => p_venue_id,
    p_coach_id => p_coach_id,
    p_player_id => p_player_id,
    p_court_id => p_court_id,
    p_location_type => p_location_type,
    p_custom_location => p_custom_location,
    p_lesson_type => p_lesson_type,
    p_title => p_title,
    p_repeat_mode => p_repeat_mode,
    p_start_time => p_start_time,
    p_end_time => p_end_time,
    p_recurrence_start_date => p_recurrence_start_date,
    p_recurrence_end_date => p_recurrence_end_date,
    p_day_of_week => p_day_of_week,
    p_recurrence_start_time => p_recurrence_start_time,
    p_recurrence_end_time => p_recurrence_end_time,
    p_notes => p_notes
  );
  perform public.attach_external_venue_to_lesson_plan(plan_id, p_external_venue_id, case when p_repeat_mode = 'weekly' then 'series' else 'single' end);
  return plan_id;
end;
$$;

create or replace function public.coachr_update_lesson_plan_with_location(
  p_lesson_id uuid,
  p_player_id uuid,
  p_court_id uuid,
  p_location_type text,
  p_custom_location text,
  p_external_venue_id uuid,
  p_lesson_type public.coach_lesson_type,
  p_title text,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_status public.coach_lesson_status,
  p_scope text default 'single',
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_external_venue_id is not null and p_location_type <> 'custom' then
    raise exception 'external_venue' using errcode = 'P0001';
  end if;

  perform public.coachr_update_lesson_plan(
    p_lesson_id => p_lesson_id,
    p_player_id => p_player_id,
    p_court_id => p_court_id,
    p_location_type => p_location_type,
    p_custom_location => p_custom_location,
    p_lesson_type => p_lesson_type,
    p_title => p_title,
    p_start_time => p_start_time,
    p_end_time => p_end_time,
    p_status => p_status,
    p_scope => p_scope,
    p_notes => p_notes
  );
  perform public.attach_external_venue_to_lesson_plan(p_lesson_id, p_external_venue_id, p_scope);
end;
$$;

create or replace function public.copy_invitation_proposal_to_player_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status
    and new.invitation_kind in ('player', 'player_junior') then
    update public.organisation_player_links
    set connection_context = coalesce(new.metadata, '{}'::jsonb),
        proposal_status = case when coalesce(new.metadata, '{}'::jsonb) ? 'proposal' then 'proposed' else 'not_specified' end
    where invitation_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.create_adult_player_invitation_with_context(
  p_venue_id uuid,
  p_invited_email text,
  p_invited_name text default null,
  p_invited_phone text default null,
  p_coach_profile_id uuid default null,
  p_proposal jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_token uuid;
begin
  if jsonb_typeof(coalesce(p_proposal, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  invite_token := public.create_adult_player_invitation(
    p_venue_id,
    p_invited_email,
    p_invited_name,
    p_invited_phone,
    p_coach_profile_id
  );

  if coalesce(p_proposal, '{}'::jsonb) <> '{}'::jsonb then
    update public.organisation_invitations
    set metadata = metadata || jsonb_build_object('proposal', p_proposal)
    where token = invite_token;
  end if;
  return invite_token;
end;
$$;

drop trigger if exists organisation_invitation_copy_proposal on public.organisation_invitations;
create trigger organisation_invitation_copy_proposal
after update of status on public.organisation_invitations
for each row execute function public.copy_invitation_proposal_to_player_link();

update public.organisation_player_links link
set connection_context = invitation.metadata,
    proposal_status = case when invitation.metadata ? 'proposal' then 'proposed' else 'not_specified' end
from public.organisation_invitations invitation
where link.invitation_id = invitation.id
  and link.status = 'active'
  and link.connection_context = '{}'::jsonb;

revoke all on function public.user_can_manage_product_setup(uuid, text, uuid) from public;
revoke all on function public.user_can_read_product_setup(uuid, text, uuid) from public;
revoke all on function public.platform_delegate_organisation(uuid, text, text, uuid, public.organisation_role) from public;
revoke all on function public.save_organisation_setup_progress(uuid, text, text, text, text, text) from public;
revoke all on function public.request_organisation_court_access(uuid, uuid, text) from public;
revoke all on function public.respond_to_court_access_request(uuid, text, uuid[], text) from public;
revoke all on function public.coachr_resolve_court_readiness(uuid, uuid, timestamptz, timestamptz, uuid) from public;
revoke all on function public.attach_external_venue_to_lesson_plan(uuid, uuid, text) from public;
revoke all on function public.coachr_create_lesson_plan_with_location(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, date, integer, time, time, text) from public;
revoke all on function public.coachr_update_lesson_plan_with_location(uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) from public;
revoke all on function public.copy_invitation_proposal_to_player_link() from public;
revoke all on function public.create_adult_player_invitation_with_context(uuid, text, text, text, uuid, jsonb) from public;

grant execute on function public.user_can_manage_product_setup(uuid, text, uuid) to authenticated;
grant execute on function public.user_can_read_product_setup(uuid, text, uuid) to authenticated;
grant execute on function public.platform_delegate_organisation(uuid, text, text, uuid, public.organisation_role) to authenticated;
grant execute on function public.save_organisation_setup_progress(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.request_organisation_court_access(uuid, uuid, text) to authenticated;
grant execute on function public.respond_to_court_access_request(uuid, text, uuid[], text) to authenticated;
grant execute on function public.coachr_resolve_court_readiness(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.attach_external_venue_to_lesson_plan(uuid, uuid, text) to authenticated;
grant execute on function public.coachr_create_lesson_plan_with_location(uuid, uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, text, timestamptz, timestamptz, date, date, integer, time, time, text) to authenticated;
grant execute on function public.coachr_update_lesson_plan_with_location(uuid, uuid, uuid, text, text, uuid, public.coach_lesson_type, text, timestamptz, timestamptz, public.coach_lesson_status, text, text) to authenticated;
grant execute on function public.create_adult_player_invitation_with_context(uuid, text, text, text, uuid, jsonb) to authenticated;
