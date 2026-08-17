-- TeamR Phase 2A.1: explicit organisation capabilities and School -> District context.
-- The relationship is organisation-to-organisation; players remain linked only
-- to their canonical school record and keep one canonical PlayR profile.

create table public.organisation_relationships (
  id uuid primary key default gen_random_uuid(),
  child_venue_id uuid not null references public.venues(id) on delete cascade,
  parent_venue_id uuid not null references public.venues(id) on delete cascade,
  relationship_type text not null default 'belongs_to' check (relationship_type = 'belongs_to'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_relationships_not_self check (child_venue_id <> parent_venue_id),
  constraint organisation_relationships_child_type_unique unique (child_venue_id, relationship_type)
);

create index organisation_relationships_parent_status_idx
on public.organisation_relationships(parent_venue_id, status);

create function public.validate_organisation_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  child_type text;
  parent_type text;
begin
  select venue.organisation_type::text into child_type from public.venues venue where venue.id = new.child_venue_id;
  select venue.organisation_type::text into parent_type from public.venues venue where venue.id = new.parent_venue_id;
  if child_type not in ('school', 'school_district') or parent_type not in ('district', 'school_district') then
    raise exception 'invalid_organisation_relationship' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_organisation_relationship() from public, anon, authenticated;

create trigger organisation_relationships_validate
before insert or update of child_venue_id, parent_venue_id, relationship_type on public.organisation_relationships
for each row execute function public.validate_organisation_relationship();

create trigger organisation_relationships_set_updated_at
before update on public.organisation_relationships
for each row execute function public.set_updated_at();

alter table public.organisation_relationships enable row level security;

create policy "Platform admins can read organisation relationships"
on public.organisation_relationships for select to authenticated
using ((select public.user_is_platform_admin((select auth.uid()))));

create policy "Platform admins can create organisation relationships"
on public.organisation_relationships for insert to authenticated
with check ((select public.user_is_platform_admin((select auth.uid()))));

create policy "Platform admins can update organisation relationships"
on public.organisation_relationships for update to authenticated
using ((select public.user_is_platform_admin((select auth.uid()))))
with check ((select public.user_is_platform_admin((select auth.uid()))));

create policy "Platform admins can delete organisation relationships"
on public.organisation_relationships for delete to authenticated
using ((select public.user_is_platform_admin((select auth.uid()))));

revoke all on table public.organisation_relationships from public, anon;
grant select, insert, update, delete on table public.organisation_relationships to authenticated;
grant all on table public.organisation_relationships to service_role;

drop function if exists public.teamr_discover_schools(uuid, text);
create function public.teamr_discover_schools(
  p_player_profile_id uuid,
  p_search text default null
)
returns table (
  id uuid,
  name text,
  organisation_type text,
  address text,
  suburb text,
  town text,
  city text,
  district_id uuid,
  district_name text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.profile_is_linked_junior(p_player_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  return query
  select
    school.id,
    school.name,
    school.organisation_type::text,
    school.address,
    school.suburb,
    school.town,
    school.city,
    district.id,
    district.name
  from public.venues school
  left join public.organisation_relationships relationship
    on relationship.child_venue_id = school.id
   and relationship.relationship_type = 'belongs_to'
   and relationship.status = 'active'
  left join public.venues district
    on district.id = relationship.parent_venue_id
   and district.status = 'active'
   and district.organisation_type in ('district', 'school_district')
  where school.status = 'active'
    and school.organisation_type in ('school', 'school_district')
    and school.discovery_visibility = 'public'
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or lower(concat_ws(' ', school.name, school.suburb, school.town, school.city))
        like '%' || lower(replace(replace(btrim(p_search), '%', ''), '_', '')) || '%'
    )
  order by school.name
  limit 30;
end;
$$;

revoke all on function public.teamr_discover_schools(uuid, text) from public, anon;
grant execute on function public.teamr_discover_schools(uuid, text) to authenticated;

create function public.teamr_school_context(p_player_profile_id uuid)
returns table (
  school_link_id uuid,
  school_link_status text,
  school_id uuid,
  school_name text,
  school_organisation_type text,
  district_id uuid,
  district_name text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.can_manage_profile(p_player_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  return query
  select
    link.id,
    link.status::text,
    school.id,
    school.name,
    school.organisation_type::text,
    district.id,
    district.name
  from public.organisation_player_links link
  join public.venues school
    on school.id = link.venue_id
   and school.organisation_type in ('school', 'school_district')
  left join public.organisation_relationships relationship
    on relationship.child_venue_id = school.id
   and relationship.relationship_type = 'belongs_to'
   and relationship.status = 'active'
  left join public.venues district
    on district.id = relationship.parent_venue_id
   and district.status = 'active'
   and district.organisation_type in ('district', 'school_district')
  where link.player_profile_id = p_player_profile_id
    and link.status in ('pending', 'active', 'suspended')
  order by case link.status when 'active' then 1 when 'pending' then 2 else 3 end, school.name;
end;
$$;

revoke all on function public.teamr_school_context(uuid) from public, anon;
grant execute on function public.teamr_school_context(uuid) to authenticated;

-- The Venues surface is ClubR-specific. This RPC excludes school/district
-- connections instead of asking a club card to pretend they have courts or plans.
create function public.playr_profile_club_venues(p_profile_id uuid)
returns table (
  venue_id uuid,
  venue_name text,
  venue_slug text,
  relationship_type text,
  membership_status text,
  subscription_id uuid,
  application_id uuid,
  booking_entitlement jsonb,
  is_linked_junior boolean,
  is_authorised_manager boolean,
  location_summary text,
  court_count integer,
  guest_booking_available boolean,
  published_memberships_available boolean,
  discovery_visibility text,
  public_description text,
  logo_url text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.can_manage_profile(p_profile_id, actor_user_id) then
    raise exception 'profile_access_denied' using errcode = 'P0001';
  end if;

  return query
  select
    venue.id,
    venue.name,
    venue.slug,
    resolved.relationship->>'relationshipType',
    resolved.relationship->>'membershipStatus',
    nullif(resolved.relationship->>'subscriptionId', '')::uuid,
    nullif(resolved.relationship->>'applicationId', '')::uuid,
    coalesce(resolved.relationship->'bookingEntitlement', '{}'::jsonb),
    coalesce((resolved.relationship->>'isLinkedJunior')::boolean, false),
    coalesce((resolved.relationship->>'isAuthorisedManager')::boolean, false),
    nullif(concat_ws(', ', nullif(venue.suburb, ''), nullif(venue.town, ''), nullif(venue.city, '')), ''),
    (select count(*)::integer from public.courts court where coalesce(court.operator_venue_id, court.venue_id) = venue.id and court.status = 'active'),
    coalesce(settings.non_member_booking_enabled, false),
    exists (
      select 1 from public.club_membership_plans plan
      where plan.venue_id = venue.id and plan.status = 'active' and plan.is_public and not plan.is_legacy
    ),
    venue.discovery_visibility,
    coalesce(venue.public_description, venue.description),
    venue.logo_url
  from public.venues venue
  left join public.organisation_booking_settings settings on settings.venue_id = venue.id
  cross join lateral (
    select public.playr_resolve_venue_relationship(p_profile_id, venue.id, actor_user_id) as relationship
  ) resolved
  where venue.status = 'active'
    and (
      venue.organisation_type = 'club'
      or (
        venue.organisation_type = 'club_academy'
        and (
          exists (select 1 from public.courts court where coalesce(court.operator_venue_id, court.venue_id) = venue.id and court.status = 'active')
          or exists (select 1 from public.club_membership_plans plan where plan.venue_id = venue.id and plan.status = 'active' and plan.is_public and not plan.is_legacy)
        )
      )
    )
    and (
      resolved.relationship->>'relationshipType' <> 'guest'
      or coalesce((resolved.relationship->>'isAuthorisedManager')::boolean, false)
      or coalesce((resolved.relationship->>'hasOrganisationAccess')::boolean, false)
      or coalesce((resolved.relationship->>'hasBookingAccess')::boolean, false)
    )
  order by
    case resolved.relationship->>'relationshipType' when 'member' then 1 when 'pending' then 2 when 'former_member' then 3 else 4 end,
    venue.name;
end;
$$;

revoke all on function public.playr_profile_club_venues(uuid) from public, anon;
grant execute on function public.playr_profile_club_venues(uuid) to authenticated;
