alter table public.venues
  add column if not exists organisation_type text not null default 'club_academy';

alter table public.venues
  drop constraint if exists venues_organisation_type_valid;

alter table public.venues
  add constraint venues_organisation_type_valid
  check (organisation_type in ('academy', 'club', 'club_academy', 'school_district'));

alter table public.admin_users
  add column if not exists assigned_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deactivated_at timestamptz;

update public.admin_users
set assigned_at = coalesce(assigned_at, created_at),
    assigned_by_user_id = coalesce(assigned_by_user_id, created_by)
where assigned_at is null;

create index if not exists admin_users_active_role_venue_idx
on public.admin_users(role, venue_id)
where deactivated_at is null;

drop policy if exists "Head coaches can read venue coach assignments" on public.admin_users;
create policy "Head coaches can read venue coach assignments"
on public.admin_users
for select
to authenticated
using (
  role::text in ('coach', 'head_coach')
  and exists (
    select 1
    from public.admin_users actor_role
    where actor_role.user_id = (select auth.uid())
      and actor_role.deactivated_at is null
      and actor_role.role::text in ('head_coach', 'club_admin', 'platform_admin')
      and (
        actor_role.role::text = 'platform_admin'
        or actor_role.venue_id = admin_users.venue_id
      )
  )
);

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create or replace function public.is_platform_admin(check_user_id uuid default auth.uid())
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
      and role::text = 'platform_admin'
      and deactivated_at is null
  );
$$;

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
      and check_user_id = (select auth.uid())
      and role::text in ('admin', 'staff', 'club_admin', 'platform_admin')
      and deactivated_at is null
  );
$$;

create or replace function public.user_app_role(check_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  with stored_role as (
    select
      case
        when role::text in ('admin', 'staff') then 'club_admin'
        else role::text
      end as role_name
    from public.admin_users
    where user_id = check_user_id
      and check_user_id = (select auth.uid())
      and deactivated_at is null
    limit 1
  ),
  adult_profile as (
    select id
    from public.profiles
    where user_id = check_user_id
      and check_user_id = (select auth.uid())
      and is_junior = false
    limit 1
  )
  select coalesce(
    (select role_name from stored_role),
    case
      when exists (
        select 1
        from public.profiles junior
        join adult_profile parent
          on parent.id = junior.parent_profile_id
        where junior.is_junior = true
      ) then 'parent'
      else 'player'
    end
  );
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
  );
$$;

create or replace function public.coach_profile_can_teach_at_venue(check_coach_id uuid, check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.coach_profile_belongs_to_user(check_coach_id, check_user_id)
      or public.can_manage_venue(check_venue_id, check_user_id)
    )
    and exists (
      select 1
      from public.profiles coach
      join public.admin_users role_row
        on role_row.user_id = coach.user_id
      where coach.id = check_coach_id
        and coach.is_junior = false
        and role_row.venue_id = check_venue_id
        and role_row.role::text in ('coach', 'head_coach')
        and role_row.deactivated_at is null
    );
$$;

create or replace function public.coach_can_manage_own_lesson(check_coach_id uuid, check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.coach_profile_belongs_to_user(check_coach_id, check_user_id)
    and public.coach_profile_can_teach_at_venue(check_coach_id, check_venue_id, check_user_id)
    and exists (
      select 1
      from public.admin_users role_row
      where role_row.user_id = check_user_id
        and role_row.user_id = (select auth.uid())
        and role_row.role::text = 'coach'
        and role_row.venue_id = check_venue_id
        and role_row.deactivated_at is null
    );
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

  if not exists (
    select 1
    from public.profiles profile
    where profile.user_id = p_target_user_id
      and profile.is_junior = false
  ) then
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
    and deactivated_at is null;

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
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select venue_id
    into actor_venue_id
  from public.admin_users
  where user_id = actor_user_id
    and role::text in ('head_coach', 'club_admin')
    and deactivated_at is null
  limit 1;

  if actor_venue_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  if p_target_user_id is null then
    raise exception 'missing_fields' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.user_id = p_target_user_id
      and profile.is_junior = false
  ) then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  select role::text
    into existing_role
  from public.admin_users
  where user_id = p_target_user_id;

  if existing_role in ('platform_admin', 'club_admin', 'head_coach') then
    raise exception 'protected_role' using errcode = 'P0001';
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
    'coach',
    actor_venue_id,
    actor_user_id,
    actor_user_id,
    now(),
    null
  )
  on conflict (user_id)
  do update
  set role = 'coach',
      venue_id = actor_venue_id,
      assigned_by_user_id = actor_user_id,
      assigned_at = now(),
      deactivated_at = null
  where public.admin_users.role::text not in ('platform_admin', 'club_admin', 'head_coach');
end;
$$;

create or replace function public.head_coach_deactivate_coach(
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
  affected_rows integer;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select venue_id
    into actor_venue_id
  from public.admin_users
  where user_id = actor_user_id
    and role::text in ('head_coach', 'club_admin')
    and deactivated_at is null
  limit 1;

  if actor_venue_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if not p_confirm then
    raise exception 'confirm_required' using errcode = 'P0001';
  end if;

  update public.admin_users
  set deactivated_at = now(),
      assigned_by_user_id = actor_user_id
  where user_id = p_target_user_id
    and venue_id = actor_venue_id
    and role::text = 'coach'
    and deactivated_at is null;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'invalid_assignment' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.platform_assign_organisation_role(uuid, uuid, public.admin_role, boolean) from public;
revoke all on function public.platform_deactivate_organisation_role(uuid, boolean) from public;
revoke all on function public.head_coach_assign_coach(uuid, boolean) from public;
revoke all on function public.head_coach_deactivate_coach(uuid, boolean) from public;

grant execute on function public.platform_assign_organisation_role(uuid, uuid, public.admin_role, boolean) to authenticated;
grant execute on function public.platform_deactivate_organisation_role(uuid, boolean) to authenticated;
grant execute on function public.head_coach_assign_coach(uuid, boolean) to authenticated;
grant execute on function public.head_coach_deactivate_coach(uuid, boolean) to authenticated;
