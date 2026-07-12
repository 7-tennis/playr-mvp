-- Fix admin_users RLS recursion.
--
-- The previous "Head coaches can read venue coach assignments" policy queried
-- public.admin_users while Postgres was already evaluating RLS for
-- public.admin_users. That can raise 42P17 infinite recursion and hide a
-- valid platform_admin row from authenticated clients.

drop policy if exists "Users can read their own admin status" on public.admin_users;
drop policy if exists "Admins can manage admin users" on public.admin_users;
drop policy if exists "Head coaches can read venue coach assignments" on public.admin_users;
drop policy if exists "Users can read permitted admin assignments" on public.admin_users;
drop policy if exists "Permitted users can insert admin assignments" on public.admin_users;
drop policy if exists "Permitted users can update admin assignments" on public.admin_users;
drop policy if exists "Permitted users can delete admin assignments" on public.admin_users;

create or replace function public.can_read_admin_user_row(
  row_user_id uuid,
  row_role public.admin_role,
  row_venue_id uuid,
  row_deactivated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role text;
  actor_venue_id uuid;
begin
  if actor_user_id is null then
    return false;
  end if;

  if row_user_id = actor_user_id then
    return true;
  end if;

  select
    case
      when role::text in ('admin', 'staff') then 'club_admin'
      else role::text
    end,
    venue_id
    into actor_role, actor_venue_id
  from public.admin_users
  where user_id = actor_user_id
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

  if actor_role = 'platform_admin' then
    return true;
  end if;

  if row_deactivated_at is not null then
    return false;
  end if;

  if actor_role = 'club_admin' then
    return actor_venue_id is not null
      and row_venue_id is not null
      and actor_venue_id = row_venue_id;
  end if;

  if actor_role = 'head_coach' then
    return actor_venue_id is not null
      and row_venue_id is not null
      and actor_venue_id = row_venue_id
      and row_role::text in ('coach', 'head_coach');
  end if;

  return false;
end;
$$;

create or replace function public.can_manage_admin_user_row(
  row_role public.admin_role,
  row_venue_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role text;
  actor_venue_id uuid;
begin
  if actor_user_id is null then
    return false;
  end if;

  select
    case
      when role::text in ('admin', 'staff') then 'club_admin'
      else role::text
    end,
    venue_id
    into actor_role, actor_venue_id
  from public.admin_users
  where user_id = actor_user_id
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

  if actor_role = 'platform_admin' then
    return true;
  end if;

  if actor_role in ('club_admin', 'head_coach') then
    return actor_venue_id is not null
      and row_venue_id is not null
      and actor_venue_id = row_venue_id
      and row_role::text = 'coach';
  end if;

  return false;
end;
$$;

revoke all on function public.can_read_admin_user_row(uuid, public.admin_role, uuid, timestamptz) from public;
revoke all on function public.can_manage_admin_user_row(public.admin_role, uuid) from public;

grant execute on function public.can_read_admin_user_row(uuid, public.admin_role, uuid, timestamptz) to authenticated;
grant execute on function public.can_manage_admin_user_row(public.admin_role, uuid) to authenticated;

create policy "Users can read permitted admin assignments"
on public.admin_users
for select
to authenticated
using (
  public.can_read_admin_user_row(user_id, role, venue_id, deactivated_at)
);

create policy "Permitted users can insert admin assignments"
on public.admin_users
for insert
to authenticated
with check (
  public.can_manage_admin_user_row(role, venue_id)
);

create policy "Permitted users can update admin assignments"
on public.admin_users
for update
to authenticated
using (
  public.can_manage_admin_user_row(role, venue_id)
)
with check (
  public.can_manage_admin_user_row(role, venue_id)
);

create policy "Permitted users can delete admin assignments"
on public.admin_users
for delete
to authenticated
using (
  public.can_manage_admin_user_row(role, venue_id)
);
