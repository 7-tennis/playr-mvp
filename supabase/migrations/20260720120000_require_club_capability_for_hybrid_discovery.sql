-- A hybrid organisation belongs in ClubR discovery only when it has a real
-- club capability. Standalone clubs remain eligible by type; club/academy
-- hybrids must operate an active court or publish an active membership plan.
-- This deliberately uses domain data and never venue-name exclusions.
create or replace function public.playr_discover_venues(
  p_profile_id uuid,
  p_search text default null
)
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
set search_path = public
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
    (
      select count(*)::integer
      from public.courts court
      where coalesce(court.operator_venue_id, court.venue_id) = venue.id
        and court.status = 'active'
    ),
    coalesce(settings.non_member_booking_enabled, false),
    exists (
      select 1
      from public.club_membership_plans plan
      where plan.venue_id = venue.id
        and plan.status = 'active'
        and plan.is_public
        and not plan.is_legacy
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
    and venue.discovery_visibility = 'public'
    and (
      venue.organisation_type = 'club'
      or (
        venue.organisation_type = 'club_academy'
        and (
          exists (
            select 1
            from public.courts court
            where coalesce(court.operator_venue_id, court.venue_id) = venue.id
              and court.status = 'active'
          )
          or exists (
            select 1
            from public.club_membership_plans plan
            where plan.venue_id = venue.id
              and plan.status = 'active'
              and plan.is_public
              and not plan.is_legacy
          )
        )
      )
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or lower(concat_ws(' ', venue.name, venue.address, venue.suburb, venue.town, venue.city))
        like '%' || lower(btrim(p_search)) || '%'
    )
  order by venue.name;
end;
$$;
