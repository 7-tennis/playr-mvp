alter type public.admin_role add value if not exists 'player';
alter type public.admin_role add value if not exists 'parent';
alter type public.admin_role add value if not exists 'coach';
alter type public.admin_role add value if not exists 'head_coach';
alter type public.admin_role add value if not exists 'club_admin';
alter type public.admin_role add value if not exists 'platform_admin';

alter table public.admin_users
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

create index if not exists admin_users_venue_id_idx on public.admin_users(venue_id);

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

create or replace function public.can_access_coachr(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_app_role(check_user_id) in ('coach', 'head_coach', 'club_admin', 'platform_admin');
$$;

create or replace function public.can_access_head_coach_tools(check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.user_app_role(check_user_id) in ('head_coach', 'club_admin', 'platform_admin');
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
      and (
        role::text = 'platform_admin'
        or (
          role::text in ('admin', 'staff', 'club_admin', 'head_coach')
          and venue_id = check_venue_id
        )
      )
  );
$$;
