-- PlayR Foundation Phase.
--
-- Adds durable multi-organisation membership, invitation, player-link and
-- assignment structures while keeping admin_users as the legacy compatibility
-- access surface for existing CoachR/ClubR pages.

do $$
begin
  create type public.organisation_role as enum (
    'organisation_admin',
    'head_coach',
    'coach',
    'assistant_coach',
    'club_manager',
    'sports_coordinator',
    'team_manager',
    'viewer'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_membership_status as enum (
    'pending',
    'active',
    'declined',
    'suspended',
    'removed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_invitation_status as enum (
    'pending',
    'accepted',
    'declined',
    'expired',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_invitation_kind as enum (
    'organisation_member',
    'coach',
    'player_junior'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_link_status as enum (
    'pending',
    'active',
    'declined',
    'suspended',
    'removed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_assignment_status as enum (
    'active',
    'suspended',
    'removed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.organisation_program_role as enum (
    'coach',
    'assistant_coach',
    'player',
    'manager',
    'viewer'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.venues
  add column if not exists logo_url text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address text,
  add column if not exists description text,
  add column if not exists primary_admin_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists head_coach_profile_id uuid references public.profiles(id) on delete set null;

alter table public.venues
  drop constraint if exists venues_organisation_type_valid;

alter table public.venues
  add constraint venues_organisation_type_valid
  check (organisation_type in ('academy', 'club', 'school', 'district', 'club_academy', 'school_district'));

create index if not exists venues_organisation_type_idx on public.venues(organisation_type);
create index if not exists venues_primary_admin_profile_id_idx on public.venues(primary_admin_profile_id);
create index if not exists venues_head_coach_profile_id_idx on public.venues(head_coach_profile_id);

create table if not exists public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role public.organisation_role not null,
  status public.organisation_membership_status not null default 'pending',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_memberships_status_dates check (
    (status = 'active' and removed_at is null)
    or status <> 'active'
  )
);

create index if not exists organisation_memberships_venue_idx on public.organisation_memberships(venue_id, status, role);
create index if not exists organisation_memberships_profile_idx on public.organisation_memberships(profile_id, status);
create index if not exists organisation_memberships_user_idx on public.organisation_memberships(user_id, status);
create unique index if not exists organisation_memberships_active_role_unique
on public.organisation_memberships(venue_id, profile_id, role)
where status in ('pending', 'active', 'suspended');

drop trigger if exists organisation_memberships_set_updated_at on public.organisation_memberships;
create trigger organisation_memberships_set_updated_at
before update on public.organisation_memberships
for each row execute function public.set_updated_at();

create table if not exists public.organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  invitation_kind public.organisation_invitation_kind not null default 'organisation_member',
  invited_email text not null,
  invited_phone text,
  invited_name text,
  intended_role public.organisation_role not null,
  status public.organisation_invitation_status not null default 'pending',
  token uuid not null default gen_random_uuid(),
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_profile_id uuid references public.profiles(id) on delete set null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_junior_profile_id uuid references public.profiles(id) on delete set null,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_invitations_email_not_blank check (length(btrim(invited_email)) > 0)
);

create unique index if not exists organisation_invitations_token_unique on public.organisation_invitations(token);
create index if not exists organisation_invitations_venue_idx on public.organisation_invitations(venue_id, status, invitation_kind);
create index if not exists organisation_invitations_invited_email_idx on public.organisation_invitations(lower(invited_email), status);
create unique index if not exists organisation_invitations_pending_unique
on public.organisation_invitations(venue_id, lower(invited_email), intended_role, invitation_kind)
where status = 'pending';

drop trigger if exists organisation_invitations_set_updated_at on public.organisation_invitations;
create trigger organisation_invitations_set_updated_at
before update on public.organisation_invitations
for each row execute function public.set_updated_at();

create table if not exists public.organisation_player_links (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete cascade,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid references public.organisation_invitations(id) on delete set null,
  status public.organisation_link_status not null default 'pending',
  requested_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  declined_at timestamptz,
  removed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organisation_player_links_venue_idx on public.organisation_player_links(venue_id, status);
create index if not exists organisation_player_links_player_idx on public.organisation_player_links(player_profile_id, status);
create index if not exists organisation_player_links_parent_idx on public.organisation_player_links(parent_profile_id, status);
create unique index if not exists organisation_player_links_active_unique
on public.organisation_player_links(venue_id, player_profile_id)
where status in ('pending', 'active', 'suspended');

drop trigger if exists organisation_player_links_set_updated_at on public.organisation_player_links;
create trigger organisation_player_links_set_updated_at
before update on public.organisation_player_links
for each row execute function public.set_updated_at();

create table if not exists public.coach_player_assignments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  coach_profile_id uuid not null references public.profiles(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete cascade,
  organisation_player_link_id uuid references public.organisation_player_links(id) on delete set null,
  status public.organisation_assignment_status not null default 'active',
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_player_assignments_not_self check (coach_profile_id <> player_profile_id)
);

create index if not exists coach_player_assignments_venue_idx on public.coach_player_assignments(venue_id, status);
create index if not exists coach_player_assignments_coach_idx on public.coach_player_assignments(coach_profile_id, status);
create index if not exists coach_player_assignments_player_idx on public.coach_player_assignments(player_profile_id, status);
create unique index if not exists coach_player_assignments_active_unique
on public.coach_player_assignments(venue_id, coach_profile_id, player_profile_id)
where status = 'active';

drop trigger if exists coach_player_assignments_set_updated_at on public.coach_player_assignments;
create trigger coach_player_assignments_set_updated_at
before update on public.coach_player_assignments
for each row execute function public.set_updated_at();

create table if not exists public.organisation_programs (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_programs_name_not_blank check (length(btrim(name)) > 0),
  constraint organisation_programs_status_valid check (status in ('active', 'inactive'))
);

create index if not exists organisation_programs_venue_idx on public.organisation_programs(venue_id, status);
create unique index if not exists organisation_programs_name_unique on public.organisation_programs(venue_id, lower(name));

drop trigger if exists organisation_programs_set_updated_at on public.organisation_programs;
create trigger organisation_programs_set_updated_at
before update on public.organisation_programs
for each row execute function public.set_updated_at();

create table if not exists public.organisation_program_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.organisation_programs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.organisation_program_role not null,
  status public.organisation_assignment_status not null default 'active',
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organisation_program_assignments_program_idx on public.organisation_program_assignments(program_id, status);
create index if not exists organisation_program_assignments_profile_idx on public.organisation_program_assignments(profile_id, status);
create unique index if not exists organisation_program_assignments_active_unique
on public.organisation_program_assignments(program_id, profile_id, role)
where status = 'active';

drop trigger if exists organisation_program_assignments_set_updated_at on public.organisation_program_assignments;
create trigger organisation_program_assignments_set_updated_at
before update on public.organisation_program_assignments
for each row execute function public.set_updated_at();

create table if not exists public.user_active_organisations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  product_context text not null default 'playr',
  updated_at timestamptz not null default now(),
  constraint user_active_organisations_product_valid check (product_context in ('playr', 'coachr', 'clubr', 'teamr'))
);

create index if not exists user_active_organisations_venue_idx on public.user_active_organisations(venue_id);

drop trigger if exists user_active_organisations_set_updated_at on public.user_active_organisations;
create trigger user_active_organisations_set_updated_at
before update on public.user_active_organisations
for each row execute function public.set_updated_at();

create or replace function public.organisation_role_priority(check_role public.organisation_role)
returns integer
language sql
immutable
as $$
  select case check_role
    when 'organisation_admin' then 70
    when 'club_manager' then 60
    when 'head_coach' then 50
    when 'sports_coordinator' then 45
    when 'team_manager' then 40
    when 'coach' then 35
    when 'assistant_coach' then 30
    else 10
  end;
$$;

create or replace function public.user_is_platform_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.admin_users admin_role
      where admin_role.user_id = check_user_id
        and admin_role.role::text = 'platform_admin'
        and admin_role.deactivated_at is null
    );
$$;

create or replace function public.user_has_active_organisation_role(
  check_venue_id uuid,
  allowed_roles public.organisation_role[],
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
      from public.organisation_memberships membership
      join public.venues venue
        on venue.id = membership.venue_id
      where membership.user_id = check_user_id
        and membership.venue_id = check_venue_id
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
        and venue.status = 'active'
    );
$$;

create or replace function public.user_can_manage_organisation_roles(check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_is_platform_admin(check_user_id)
    or public.user_has_active_organisation_role(
      check_venue_id,
      array['organisation_admin', 'club_manager']::public.organisation_role[],
      check_user_id
    );
$$;

create or replace function public.user_can_manage_organisation_coaches(check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_is_platform_admin(check_user_id)
    or public.user_has_active_organisation_role(
      check_venue_id,
      array['organisation_admin', 'club_manager', 'head_coach']::public.organisation_role[],
      check_user_id
    );
$$;

create or replace function public.user_can_invite_players(check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_is_platform_admin(check_user_id)
    or public.user_has_active_organisation_role(
      check_venue_id,
      array['organisation_admin', 'club_manager', 'head_coach', 'coach', 'assistant_coach']::public.organisation_role[],
      check_user_id
    );
$$;

create or replace function public.user_can_read_organisation_player_link(
  check_venue_id uuid,
  check_player_profile_id uuid,
  check_parent_profile_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_is_platform_admin(check_user_id)
    or public.user_can_manage_organisation_coaches(check_venue_id, check_user_id)
    or public.can_manage_profile(check_player_profile_id, check_user_id)
    or (
      check_parent_profile_id is not null
      and public.profile_belongs_to_user(check_parent_profile_id, check_user_id)
    )
    or exists (
      select 1
      from public.coach_player_assignments assignment
      join public.profiles coach
        on coach.id = assignment.coach_profile_id
      where assignment.venue_id = check_venue_id
        and assignment.player_profile_id = check_player_profile_id
        and assignment.status = 'active'
        and coach.user_id = check_user_id
    );
$$;

create or replace function public.compatibility_admin_role_for_organisation_role(check_role public.organisation_role)
returns public.admin_role
language plpgsql
stable
as $$
begin
  if check_role = 'organisation_admin' or check_role = 'club_manager' then
    return 'club_admin'::public.admin_role;
  elsif check_role = 'head_coach' then
    return 'head_coach'::public.admin_role;
  elsif check_role = 'coach' or check_role = 'assistant_coach' then
    return 'coach'::public.admin_role;
  else
    return 'player'::public.admin_role;
  end if;
end;
$$;

create or replace function public.sync_legacy_admin_user_from_membership(
  p_user_id uuid,
  p_venue_id uuid,
  p_role public.organisation_role,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_admin_role public.admin_role := public.compatibility_admin_role_for_organisation_role(p_role);
  existing_role text;
begin
  if target_admin_role::text = 'player' then
    return;
  end if;

  select role::text
    into existing_role
  from public.admin_users
  where user_id = p_user_id
    and deactivated_at is null
  order by
    case
      when role::text = 'platform_admin' then 60
      when role::text in ('admin', 'staff', 'club_admin') then 50
      when role::text = 'head_coach' then 40
      when role::text = 'coach' then 30
      else 0
    end desc,
    created_at desc
  limit 1;

  if existing_role = 'platform_admin' then
    return;
  end if;

  if existing_role is null then
    insert into public.admin_users (
      user_id,
      role,
      venue_id,
      created_by,
      assigned_by_user_id,
      assigned_at,
      deactivated_at
    )
    values (
      p_user_id,
      target_admin_role,
      p_venue_id,
      p_actor_user_id,
      p_actor_user_id,
      now(),
      null
    )
    on conflict (user_id) do nothing;
  end if;
end;
$$;

create or replace function public.platform_assign_organisation_role(
  p_target_user_id uuid,
  p_venue_id uuid,
  p_role public.admin_role,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_profile_id uuid;
  mapped_role public.organisation_role;
begin
  if actor_user_id is null or not public.is_platform_admin(actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  if p_target_user_id is null or p_role is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if p_role::text not in ('platform_admin', 'club_admin', 'head_coach', 'coach') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  select id
    into target_profile_id
  from public.profiles profile
  where profile.user_id = p_target_user_id
    and profile.is_junior = false
  limit 1;

  if target_profile_id is null then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  if p_role::text <> 'platform_admin' then
    if p_venue_id is null or not exists (select 1 from public.venues where id = p_venue_id) then
      raise exception 'invalid_venue' using errcode = 'P0001';
    end if;
  end if;

  insert into public.admin_users (
    user_id,
    role,
    venue_id,
    created_by,
    assigned_by_user_id,
    assigned_at,
    deactivated_at
  )
  values (
    p_target_user_id,
    p_role,
    case when p_role::text = 'platform_admin' then null else p_venue_id end,
    actor_user_id,
    actor_user_id,
    now(),
    null
  )
  on conflict (user_id)
  do update
  set role = excluded.role,
      venue_id = excluded.venue_id,
      assigned_by_user_id = actor_user_id,
      assigned_at = now(),
      deactivated_at = null;

  if p_role::text <> 'platform_admin' then
    mapped_role := case p_role::text
      when 'club_admin' then 'organisation_admin'::public.organisation_role
      when 'head_coach' then 'head_coach'::public.organisation_role
      when 'coach' then 'coach'::public.organisation_role
      else 'viewer'::public.organisation_role
    end;

    insert into public.organisation_memberships (
      venue_id,
      profile_id,
      user_id,
      role,
      status,
      invited_by_user_id,
      accepted_at
    )
    values (
      p_venue_id,
      target_profile_id,
      p_target_user_id,
      mapped_role,
      'active',
      actor_user_id,
      now()
    )
    on conflict (venue_id, profile_id, role)
    where status in ('pending', 'active', 'suspended')
    do update
    set user_id = excluded.user_id,
        status = 'active',
        invited_by_user_id = actor_user_id,
        accepted_at = coalesce(public.organisation_memberships.accepted_at, now()),
        removed_at = null,
        suspended_at = null;

    update public.venues
    set primary_admin_profile_id = case when mapped_role = 'organisation_admin' then target_profile_id else primary_admin_profile_id end,
        head_coach_profile_id = case when mapped_role = 'head_coach' then target_profile_id else head_coach_profile_id end
    where id = p_venue_id;
  end if;
end;
$$;

create or replace function public.head_coach_assign_coach(
  p_target_user_id uuid,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_venue_id uuid;
  existing_role text;
  target_profile_id uuid;
  actor_profile_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select active_org.venue_id
    into actor_venue_id
  from public.user_active_organisations active_org
  where active_org.user_id = actor_user_id
    and public.user_can_manage_organisation_coaches(active_org.venue_id, actor_user_id)
  limit 1;

  if actor_venue_id is null then
    select venue_id
      into actor_venue_id
    from public.admin_users
    where user_id = actor_user_id
      and role::text in ('head_coach', 'club_admin')
      and deactivated_at is null
    limit 1;
  end if;

  if actor_venue_id is null then
    select venue_id
      into actor_venue_id
    from public.organisation_memberships
    where user_id = actor_user_id
      and status = 'active'
      and role in ('organisation_admin', 'club_manager', 'head_coach')
    order by public.organisation_role_priority(role) desc, created_at desc
    limit 1;
  end if;

  if actor_venue_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  if p_target_user_id is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  select id
    into target_profile_id
  from public.profiles profile
  where profile.user_id = p_target_user_id
    and profile.is_junior = false
  limit 1;

  if target_profile_id is null then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  select id
    into actor_profile_id
  from public.profiles profile
  where profile.user_id = actor_user_id
    and profile.is_junior = false
  limit 1;

  if not public.user_can_manage_organisation_coaches(actor_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select role::text
    into existing_role
  from public.admin_users
  where user_id = p_target_user_id
    and deactivated_at is null;

  if existing_role in ('platform_admin', 'club_admin', 'head_coach') then
    raise exception 'protected_role' using errcode = 'P0001';
  end if;

  insert into public.organisation_memberships (
    venue_id,
    profile_id,
    user_id,
    role,
    status,
    invited_by_user_id,
    accepted_at
  )
  values (
    actor_venue_id,
    target_profile_id,
    p_target_user_id,
    'coach',
    'active',
    actor_user_id,
    now()
  )
  on conflict (venue_id, profile_id, role)
  where status in ('pending', 'active', 'suspended')
  do update
  set user_id = excluded.user_id,
      status = 'active',
      invited_by_user_id = actor_user_id,
      accepted_at = coalesce(public.organisation_memberships.accepted_at, now()),
      removed_at = null,
      suspended_at = null;

  perform public.sync_legacy_admin_user_from_membership(p_target_user_id, actor_venue_id, 'coach', actor_user_id);
end;
$$;

create or replace function public.platform_deactivate_organisation_role(
  p_target_user_id uuid,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_role text;
  target_venue uuid;
  remaining_platform_admins integer;
begin
  if actor_user_id is null or not public.is_platform_admin(actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  select role::text, venue_id
    into target_role, target_venue
  from public.admin_users
  where user_id = p_target_user_id
    and deactivated_at is null
  order by created_at desc
  limit 1;

  if target_role is null then
    raise exception 'invalid_assignment' using errcode = 'P0001';
  end if;

  if target_role = 'platform_admin' then
    select count(*)::integer
      into remaining_platform_admins
    from public.admin_users
    where deactivated_at is null
      and role::text = 'platform_admin'
      and user_id <> p_target_user_id;

    if remaining_platform_admins = 0 then
      raise exception 'last_platform_admin' using errcode = 'P0001';
    end if;
  end if;

  update public.admin_users
  set deactivated_at = now(),
      assigned_by_user_id = actor_user_id
  where user_id = p_target_user_id;

  if target_venue is not null then
    update public.organisation_memberships
    set status = 'removed',
        removed_at = now()
    where user_id = p_target_user_id
      and venue_id = target_venue
      and status in ('pending', 'active', 'suspended')
      and role = case target_role
        when 'club_admin' then 'organisation_admin'::public.organisation_role
        when 'head_coach' then 'head_coach'::public.organisation_role
        when 'coach' then 'coach'::public.organisation_role
        else role
      end;
  end if;
end;
$$;

create or replace function public.create_organisation_invitation(
  p_venue_id uuid,
  p_invited_email text,
  p_intended_role public.organisation_role,
  p_invitation_kind public.organisation_invitation_kind,
  p_invited_name text default null,
  p_invited_phone text default null,
  p_target_profile_id uuid default null,
  p_target_junior_profile_id uuid default null,
  p_parent_profile_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  invite_token uuid;
  normalized_email text := lower(btrim(p_invited_email));
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_venue_id is null or not exists (select 1 from public.venues where id = p_venue_id and status = 'active') then
    raise exception 'invalid_venue' using errcode = 'P0001';
  end if;

  if normalized_email = '' then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  update public.organisation_invitations invitation
  set status = 'expired'
  where invitation.status = 'pending'
    and invitation.expires_at <= now();

  if p_invitation_kind = 'coach' then
    if p_intended_role not in ('head_coach', 'coach', 'assistant_coach') then
      raise exception 'invalid_role' using errcode = 'P0001';
    end if;

    if p_intended_role = 'head_coach'
      and not public.user_can_manage_organisation_roles(p_venue_id, actor_user_id) then
      raise exception 'access' using errcode = 'P0001';
    end if;

    if not public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id) then
      raise exception 'access' using errcode = 'P0001';
    end if;
  elsif p_invitation_kind = 'player_junior' then
    if not public.user_can_invite_players(p_venue_id, actor_user_id) then
      raise exception 'access' using errcode = 'P0001';
    end if;
  else
    if not public.user_can_manage_organisation_roles(p_venue_id, actor_user_id) then
      raise exception 'access' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1
    from public.organisation_invitations invitation
    where invitation.venue_id = p_venue_id
      and lower(invitation.invited_email) = normalized_email
      and invitation.intended_role = p_intended_role
      and invitation.invitation_kind = p_invitation_kind
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'duplicate_invitation' using errcode = 'P0001';
  end if;

  insert into public.organisation_invitations (
    venue_id,
    invitation_kind,
    invited_email,
    invited_phone,
    invited_name,
    intended_role,
    invited_by_user_id,
    target_profile_id,
    target_junior_profile_id,
    parent_profile_id,
    metadata
  )
  values (
    p_venue_id,
    p_invitation_kind,
    normalized_email,
    nullif(btrim(coalesce(p_invited_phone, '')), ''),
    nullif(btrim(coalesce(p_invited_name, '')), ''),
    p_intended_role,
    actor_user_id,
    p_target_profile_id,
    p_target_junior_profile_id,
    p_parent_profile_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.accept_organisation_invitation(
  p_token uuid,
  p_profile_id uuid default null,
  p_junior_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  invite_record public.organisation_invitations%rowtype;
  adult_profile_id uuid;
  chosen_profile_id uuid;
  chosen_junior_id uuid;
  created_link_id uuid;
  intended_coach_profile_id uuid;
  junior_first_name text;
  junior_last_name text;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select *
    into invite_record
  from public.organisation_invitations
  where token = p_token
  limit 1;

  if invite_record.id is null then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if invite_record.status <> 'pending' then
    raise exception 'invitation_closed' using errcode = 'P0001';
  end if;

  if invite_record.expires_at <= now() then
    update public.organisation_invitations
    set status = 'expired'
    where id = invite_record.id;

    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  if lower(invite_record.invited_email) <> actor_email
    and not public.user_can_manage_organisation_roles(invite_record.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select id
    into adult_profile_id
  from public.profiles
  where user_id = actor_user_id
    and is_junior = false
  limit 1;

  if adult_profile_id is null then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  if invite_record.invitation_kind in ('organisation_member', 'coach') then
    chosen_profile_id := coalesce(p_profile_id, invite_record.target_profile_id, adult_profile_id);

    if not exists (
      select 1
      from public.profiles
      where id = chosen_profile_id
        and user_id = actor_user_id
        and is_junior = false
    ) then
      raise exception 'adult_profile_required' using errcode = 'P0001';
    end if;

    insert into public.organisation_memberships (
      venue_id,
      profile_id,
      user_id,
      role,
      status,
      invited_by_user_id,
      accepted_at
    )
    values (
      invite_record.venue_id,
      chosen_profile_id,
      actor_user_id,
      invite_record.intended_role,
      'active',
      invite_record.invited_by_user_id,
      now()
    )
    on conflict (venue_id, profile_id, role)
    where status in ('pending', 'active', 'suspended')
    do update
    set user_id = excluded.user_id,
        status = 'active',
        accepted_at = coalesce(public.organisation_memberships.accepted_at, now()),
        removed_at = null,
        suspended_at = null;

    perform public.sync_legacy_admin_user_from_membership(actor_user_id, invite_record.venue_id, invite_record.intended_role, invite_record.invited_by_user_id);

    update public.venues
    set primary_admin_profile_id = case when invite_record.intended_role = 'organisation_admin' then chosen_profile_id else primary_admin_profile_id end,
        head_coach_profile_id = case when invite_record.intended_role = 'head_coach' then chosen_profile_id else head_coach_profile_id end
    where id = invite_record.venue_id;
  else
    chosen_junior_id := coalesce(p_junior_profile_id, invite_record.target_junior_profile_id);

    if chosen_junior_id is not null and not public.profile_is_linked_junior(chosen_junior_id, actor_user_id) then
      raise exception 'invalid_player' using errcode = 'P0001';
    end if;

    if chosen_junior_id is null then
      junior_first_name := nullif(btrim(coalesce(invite_record.metadata ->> 'playerFirstName', '')), '');
      junior_last_name := nullif(btrim(coalesce(invite_record.metadata ->> 'playerLastName', '')), '');

      if junior_first_name is null or junior_last_name is null then
        raise exception 'invalid_player' using errcode = 'P0001';
      end if;

      insert into public.profiles (
        first_name,
        last_name,
        email,
        phone,
        is_junior,
        parent_profile_id,
        member_status,
        player_level,
        primary_sport
      )
      values (
        junior_first_name,
        junior_last_name,
        null,
        nullif(btrim(coalesce(invite_record.invited_phone, '')), ''),
        true,
        adult_profile_id,
        'pending',
        'unknown',
        'tennis'
      )
      returning id into chosen_junior_id;
    end if;

    insert into public.organisation_player_links (
      venue_id,
      player_profile_id,
      parent_profile_id,
      invitation_id,
      status,
      requested_by_user_id,
      approved_by_user_id,
      approved_at
    )
    values (
      invite_record.venue_id,
      chosen_junior_id,
      adult_profile_id,
      invite_record.id,
      'active',
      invite_record.invited_by_user_id,
      actor_user_id,
      now()
    )
    on conflict (venue_id, player_profile_id)
    where status in ('pending', 'active', 'suspended')
    do update
    set parent_profile_id = excluded.parent_profile_id,
        status = 'active',
        approved_by_user_id = actor_user_id,
        approved_at = coalesce(public.organisation_player_links.approved_at, now()),
        removed_at = null
    returning id into created_link_id;

    intended_coach_profile_id := case
      when coalesce(invite_record.metadata ->> 'coachProfileId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (invite_record.metadata ->> 'coachProfileId')::uuid
      else null
    end;

    if intended_coach_profile_id is not null then
      insert into public.coach_player_assignments (
        venue_id,
        coach_profile_id,
        player_profile_id,
        organisation_player_link_id,
        status,
        assigned_by_user_id
      )
      select
        invite_record.venue_id,
        intended_coach_profile_id,
        chosen_junior_id,
        created_link_id,
        'active',
        actor_user_id
      where exists (
        select 1
        from public.organisation_memberships membership
        where membership.venue_id = invite_record.venue_id
          and membership.profile_id = intended_coach_profile_id
          and membership.role in ('head_coach', 'coach', 'assistant_coach')
          and membership.status = 'active'
      )
      on conflict (venue_id, coach_profile_id, player_profile_id)
      where status = 'active'
      do nothing;
    end if;
  end if;

  update public.organisation_invitations
  set status = 'accepted',
      accepted_profile_id = coalesce(chosen_profile_id, chosen_junior_id),
      accepted_by_user_id = actor_user_id,
      accepted_at = now()
  where id = invite_record.id;

  insert into public.user_active_organisations (user_id, venue_id, product_context)
  values (actor_user_id, invite_record.venue_id, case when invite_record.invitation_kind = 'coach' then 'coachr' else 'playr' end)
  on conflict (user_id)
  do update
  set venue_id = excluded.venue_id,
      product_context = excluded.product_context,
      updated_at = now();

  return invite_record.id;
end;
$$;

create or replace function public.decline_organisation_invitation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text := lower(coalesce((auth.jwt() ->> 'email'), ''));
  invite_record public.organisation_invitations%rowtype;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select *
    into invite_record
  from public.organisation_invitations
  where token = p_token
  limit 1;

  if invite_record.id is null then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if lower(invite_record.invited_email) <> actor_email
    and not public.user_can_manage_organisation_roles(invite_record.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if invite_record.status <> 'pending' then
    raise exception 'invitation_closed' using errcode = 'P0001';
  end if;

  update public.organisation_invitations
  set status = 'declined',
      accepted_by_user_id = actor_user_id,
      declined_at = now()
  where id = invite_record.id;
end;
$$;

create or replace function public.cancel_organisation_invitation(
  p_invitation_id uuid,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  invite_record public.organisation_invitations%rowtype;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  select *
    into invite_record
  from public.organisation_invitations
  where id = p_invitation_id
  limit 1;

  if invite_record.id is null then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if invite_record.status <> 'pending' then
    raise exception 'invitation_closed' using errcode = 'P0001';
  end if;

  if invite_record.invited_by_user_id <> actor_user_id
    and not public.user_can_manage_organisation_roles(invite_record.venue_id, actor_user_id)
    and not public.user_can_manage_organisation_coaches(invite_record.venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  update public.organisation_invitations
  set status = 'cancelled',
      cancelled_at = now()
  where id = invite_record.id;
end;
$$;

create or replace function public.can_manage_venue(check_venue_id uuid, check_user_id uuid default auth.uid())
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
      and check_user_id = (select auth.uid())
      and deactivated_at is null
      and (
        role::text = 'platform_admin'
        or (
          role::text in ('admin', 'staff', 'club_admin', 'head_coach')
          and venue_id = check_venue_id
        )
      )
  )
  or public.user_can_manage_organisation_coaches(check_venue_id, check_user_id);
$$;

create or replace function public.can_access_coachr(check_user_id uuid default auth.uid())
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
      and check_user_id = (select auth.uid())
      and deactivated_at is null
      and role::text in ('coach', 'head_coach', 'platform_admin')
  )
  or exists (
    select 1
    from public.organisation_memberships membership
    join public.venues venue
      on venue.id = membership.venue_id
    where membership.user_id = check_user_id
      and check_user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('head_coach', 'coach', 'assistant_coach')
      and venue.status = 'active'
  );
$$;

create or replace function public.can_access_head_coach_tools(check_user_id uuid default auth.uid())
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
      and check_user_id = (select auth.uid())
      and deactivated_at is null
      and role::text in ('head_coach', 'platform_admin')
  )
  or exists (
    select 1
    from public.organisation_memberships membership
    join public.venues venue
      on venue.id = membership.venue_id
    where membership.user_id = check_user_id
      and check_user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('organisation_admin', 'club_manager', 'head_coach')
      and venue.status = 'active'
  );
$$;

alter table public.organisation_memberships enable row level security;
alter table public.organisation_invitations enable row level security;
alter table public.organisation_player_links enable row level security;
alter table public.coach_player_assignments enable row level security;
alter table public.organisation_programs enable row level security;
alter table public.organisation_program_assignments enable row level security;
alter table public.user_active_organisations enable row level security;

grant select, insert, update on public.organisation_memberships to authenticated;
grant select, insert, update on public.organisation_invitations to authenticated;
grant select, insert, update on public.organisation_player_links to authenticated;
grant select, insert, update on public.coach_player_assignments to authenticated;
grant select, insert, update on public.organisation_programs to authenticated;
grant select, insert, update on public.organisation_program_assignments to authenticated;
grant select, insert, update on public.user_active_organisations to authenticated;

drop policy if exists "Users can read permitted organisation memberships" on public.organisation_memberships;
create policy "Users can read permitted organisation memberships"
on public.organisation_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.user_can_manage_organisation_roles(venue_id)
  or public.user_can_manage_organisation_coaches(venue_id)
);

drop policy if exists "Managers can insert organisation memberships" on public.organisation_memberships;
create policy "Managers can insert organisation memberships"
on public.organisation_memberships
for insert
to authenticated
with check (public.user_can_manage_organisation_roles(venue_id));

drop policy if exists "Managers can update organisation memberships" on public.organisation_memberships;
create policy "Managers can update organisation memberships"
on public.organisation_memberships
for update
to authenticated
using (
  public.user_can_manage_organisation_roles(venue_id)
  or (
    public.user_can_manage_organisation_coaches(venue_id)
    and role in ('coach', 'assistant_coach')
  )
)
with check (
  public.user_can_manage_organisation_roles(venue_id)
  or (
    public.user_can_manage_organisation_coaches(venue_id)
    and role in ('coach', 'assistant_coach')
  )
);

drop policy if exists "Users can read permitted organisation invitations" on public.organisation_invitations;
create policy "Users can read permitted organisation invitations"
on public.organisation_invitations
for select
to authenticated
using (
  lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or invited_by_user_id = (select auth.uid())
  or accepted_by_user_id = (select auth.uid())
  or public.user_can_manage_organisation_roles(venue_id)
  or public.user_can_manage_organisation_coaches(venue_id)
);

drop policy if exists "Authorised users can create organisation invitations" on public.organisation_invitations;
create policy "Authorised users can create organisation invitations"
on public.organisation_invitations
for insert
to authenticated
with check (
  invited_by_user_id = (select auth.uid())
  and (
    public.user_can_manage_organisation_roles(venue_id)
    or public.user_can_manage_organisation_coaches(venue_id)
    or public.user_can_invite_players(venue_id)
  )
);

drop policy if exists "Authorised users can update organisation invitations" on public.organisation_invitations;
create policy "Authorised users can update organisation invitations"
on public.organisation_invitations
for update
to authenticated
using (
  lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or invited_by_user_id = (select auth.uid())
  or public.user_can_manage_organisation_roles(venue_id)
  or public.user_can_manage_organisation_coaches(venue_id)
)
with check (
  lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or invited_by_user_id = (select auth.uid())
  or public.user_can_manage_organisation_roles(venue_id)
  or public.user_can_manage_organisation_coaches(venue_id)
);

drop policy if exists "Users can read permitted player organisation links" on public.organisation_player_links;
create policy "Users can read permitted player organisation links"
on public.organisation_player_links
for select
to authenticated
using (public.user_can_read_organisation_player_link(venue_id, player_profile_id, parent_profile_id));

drop policy if exists "Authorised users can create player organisation links" on public.organisation_player_links;
create policy "Authorised users can create player organisation links"
on public.organisation_player_links
for insert
to authenticated
with check (
  public.user_can_invite_players(venue_id)
  or public.can_manage_profile(player_profile_id)
);

drop policy if exists "Authorised users can update player organisation links" on public.organisation_player_links;
create policy "Authorised users can update player organisation links"
on public.organisation_player_links
for update
to authenticated
using (
  public.user_can_manage_organisation_coaches(venue_id)
  or public.can_manage_profile(player_profile_id)
)
with check (
  public.user_can_manage_organisation_coaches(venue_id)
  or public.can_manage_profile(player_profile_id)
);

drop policy if exists "Users can read permitted coach player assignments" on public.coach_player_assignments;
create policy "Users can read permitted coach player assignments"
on public.coach_player_assignments
for select
to authenticated
using (
  public.user_can_manage_organisation_coaches(venue_id)
  or exists (
    select 1
    from public.profiles coach
    where coach.id = coach_profile_id
      and coach.user_id = (select auth.uid())
  )
  or public.can_manage_profile(player_profile_id)
);

drop policy if exists "Managers can create coach player assignments" on public.coach_player_assignments;
create policy "Managers can create coach player assignments"
on public.coach_player_assignments
for insert
to authenticated
with check (public.user_can_manage_organisation_coaches(venue_id));

drop policy if exists "Managers can update coach player assignments" on public.coach_player_assignments;
create policy "Managers can update coach player assignments"
on public.coach_player_assignments
for update
to authenticated
using (public.user_can_manage_organisation_coaches(venue_id))
with check (public.user_can_manage_organisation_coaches(venue_id));

drop policy if exists "Users can read permitted organisation programs" on public.organisation_programs;
create policy "Users can read permitted organisation programs"
on public.organisation_programs
for select
to authenticated
using (
  status = 'active'
  and (
    public.user_has_active_organisation_role(venue_id, array['organisation_admin', 'club_manager', 'head_coach', 'coach', 'assistant_coach', 'sports_coordinator', 'team_manager', 'viewer']::public.organisation_role[])
    or public.user_is_platform_admin()
  )
);

drop policy if exists "Managers can manage organisation programs" on public.organisation_programs;
create policy "Managers can manage organisation programs"
on public.organisation_programs
for all
to authenticated
using (public.user_can_manage_organisation_roles(venue_id))
with check (public.user_can_manage_organisation_roles(venue_id));

drop policy if exists "Users can read permitted organisation program assignments" on public.organisation_program_assignments;
create policy "Users can read permitted organisation program assignments"
on public.organisation_program_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_programs program
    where program.id = program_id
      and (
        public.user_can_manage_organisation_coaches(program.venue_id)
        or profile_id in (select id from public.profiles where user_id = (select auth.uid()))
        or public.can_manage_profile(profile_id)
      )
  )
);

drop policy if exists "Managers can manage organisation program assignments" on public.organisation_program_assignments;
create policy "Managers can manage organisation program assignments"
on public.organisation_program_assignments
for all
to authenticated
using (
  exists (
    select 1
    from public.organisation_programs program
    where program.id = program_id
      and public.user_can_manage_organisation_roles(program.venue_id)
  )
)
with check (
  exists (
    select 1
    from public.organisation_programs program
    where program.id = program_id
      and public.user_can_manage_organisation_roles(program.venue_id)
  )
);

drop policy if exists "Users can manage their active organisation preference" on public.user_active_organisations;
create policy "Users can manage their active organisation preference"
on public.user_active_organisations
for all
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (
    public.user_is_platform_admin()
    or exists (
      select 1
      from public.organisation_memberships membership
      join public.venues venue
        on venue.id = membership.venue_id
      where membership.user_id = (select auth.uid())
        and membership.venue_id = user_active_organisations.venue_id
        and membership.status = 'active'
        and venue.status = 'active'
    )
  )
);

revoke all on function public.organisation_role_priority(public.organisation_role) from public;
revoke all on function public.user_is_platform_admin(uuid) from public;
revoke all on function public.user_has_active_organisation_role(uuid, public.organisation_role[], uuid) from public;
revoke all on function public.user_can_manage_organisation_roles(uuid, uuid) from public;
revoke all on function public.user_can_manage_organisation_coaches(uuid, uuid) from public;
revoke all on function public.user_can_invite_players(uuid, uuid) from public;
revoke all on function public.user_can_read_organisation_player_link(uuid, uuid, uuid, uuid) from public;
revoke all on function public.compatibility_admin_role_for_organisation_role(public.organisation_role) from public;
revoke all on function public.sync_legacy_admin_user_from_membership(uuid, uuid, public.organisation_role, uuid) from public;
revoke all on function public.create_organisation_invitation(uuid, text, public.organisation_role, public.organisation_invitation_kind, text, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.accept_organisation_invitation(uuid, uuid, uuid) from public;
revoke all on function public.decline_organisation_invitation(uuid) from public;
revoke all on function public.cancel_organisation_invitation(uuid, boolean) from public;

grant execute on function public.organisation_role_priority(public.organisation_role) to authenticated;
grant execute on function public.user_is_platform_admin(uuid) to authenticated;
grant execute on function public.user_has_active_organisation_role(uuid, public.organisation_role[], uuid) to authenticated;
grant execute on function public.user_can_manage_organisation_roles(uuid, uuid) to authenticated;
grant execute on function public.user_can_manage_organisation_coaches(uuid, uuid) to authenticated;
grant execute on function public.user_can_invite_players(uuid, uuid) to authenticated;
grant execute on function public.user_can_read_organisation_player_link(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.create_organisation_invitation(uuid, text, public.organisation_role, public.organisation_invitation_kind, text, text, uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.accept_organisation_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.decline_organisation_invitation(uuid) to authenticated;
grant execute on function public.cancel_organisation_invitation(uuid, boolean) to authenticated;
