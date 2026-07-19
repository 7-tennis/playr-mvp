-- PlayR / ClubR Phase 2.2.1: venue discovery, relationship-aware club pages,
-- published membership catalogues, and member/guest booking context.

alter table public.venues
  add column if not exists discovery_visibility text not null default 'hidden',
  add column if not exists public_description text,
  add column if not exists suburb text,
  add column if not exists town text,
  add column if not exists city text,
  add column if not exists website_url text,
  add column if not exists opening_hours_text text,
  add column if not exists surface_types text[] not null default '{}'::text[],
  add column if not exists facilities text[] not null default '{}'::text[],
  add column if not exists visitor_information text,
  add column if not exists parking_information text,
  add column if not exists booking_notes text,
  add column if not exists membership_contact text,
  add column if not exists public_image_url text,
  add column if not exists competition_leaderboard_visibility text not null default 'hidden',
  add column if not exists participation_leaderboard_visibility text not null default 'hidden',
  add column if not exists development_leaderboard_visibility text not null default 'hidden';

alter table public.venues drop constraint if exists venues_discovery_visibility_valid;
alter table public.venues add constraint venues_discovery_visibility_valid
check (discovery_visibility in ('public', 'members_only', 'hidden'));
alter table public.venues drop constraint if exists venues_competition_leaderboard_visibility_valid;
alter table public.venues add constraint venues_competition_leaderboard_visibility_valid
check (competition_leaderboard_visibility in ('public', 'members_only', 'hidden'));
alter table public.venues drop constraint if exists venues_participation_leaderboard_visibility_valid;
alter table public.venues add constraint venues_participation_leaderboard_visibility_valid
check (participation_leaderboard_visibility in ('public', 'members_only', 'hidden'));
alter table public.venues drop constraint if exists venues_development_leaderboard_visibility_valid;
alter table public.venues add constraint venues_development_leaderboard_visibility_valid
check (development_leaderboard_visibility in ('public', 'members_only', 'hidden'));

create index if not exists venues_discovery_search_idx
on public.venues(discovery_visibility, status, name);

alter table public.organisation_booking_settings
  add column if not exists guest_advance_booking_days integer not null default 3,
  add column if not exists guest_max_duration_minutes integer not null default 60,
  add column if not exists guest_accessible_court_ids uuid[] not null default '{}'::uuid[],
  add column if not exists guest_opening_time time not null default '08:00',
  add column if not exists guest_closing_time time not null default '18:00',
  add column if not exists max_guest_bookings_per_period integer not null default 1,
  add column if not exists guest_booking_period_days integer not null default 7,
  add column if not exists guest_approval_required boolean not null default false,
  add column if not exists guest_name_required boolean not null default true,
  add column if not exists guest_email_required boolean not null default true,
  add column if not exists guest_phone_required boolean not null default false,
  add column if not exists guest_future_payment_required boolean not null default false,
  add column if not exists public_availability_visibility text not null default 'sign_in_required';

alter table public.organisation_booking_settings drop constraint if exists organisation_booking_settings_guest_advance_valid;
alter table public.organisation_booking_settings add constraint organisation_booking_settings_guest_advance_valid
check (guest_advance_booking_days between 0 and 90);
alter table public.organisation_booking_settings drop constraint if exists organisation_booking_settings_guest_duration_valid;
alter table public.organisation_booking_settings add constraint organisation_booking_settings_guest_duration_valid
check (guest_max_duration_minutes between 15 and 240);
alter table public.organisation_booking_settings drop constraint if exists organisation_booking_settings_guest_hours_valid;
alter table public.organisation_booking_settings add constraint organisation_booking_settings_guest_hours_valid
check (guest_closing_time > guest_opening_time);
alter table public.organisation_booking_settings drop constraint if exists organisation_booking_settings_guest_period_valid;
alter table public.organisation_booking_settings add constraint organisation_booking_settings_guest_period_valid
check (max_guest_bookings_per_period between 1 and 100 and guest_booking_period_days between 1 and 90);
alter table public.organisation_booking_settings drop constraint if exists organisation_booking_settings_public_availability_valid;
alter table public.organisation_booking_settings add constraint organisation_booking_settings_public_availability_valid
check (public_availability_visibility in ('full', 'guest_eligible', 'sign_in_required', 'after_approval'));

alter table public.club_membership_plans
  add column if not exists is_public boolean not null default false,
  add column if not exists public_benefits text[] not null default '{}'::text[];

create index if not exists club_membership_plans_public_idx
on public.club_membership_plans(venue_id, status, is_public, name, version desc);

create or replace function public.playr_user_can_browse_club_memberships(
  check_venue_id uuid,
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
      public.clubr_user_has_access(check_venue_id, check_user_id)
      or exists (
        select 1
        from public.profiles profile
        join public.club_memberships membership on membership.profile_id = profile.id
        where membership.venue_id = check_venue_id
          and public.can_manage_profile(profile.id, check_user_id)
      )
      or exists (
        select 1
        from public.organisation_player_links link
        where link.venue_id = check_venue_id
          and link.status in ('pending', 'active', 'suspended')
          and public.can_manage_profile(link.player_profile_id, check_user_id)
      )
      or exists (
        select 1
        from public.venues venue
        join public.club_membership_plans plan on plan.venue_id = venue.id
        where venue.id = check_venue_id
          and venue.status = 'active'
          and venue.discovery_visibility = 'public'
          and plan.status = 'active'
          and plan.is_public
          and not plan.is_legacy
      )
    );
$$;

create or replace function public.playr_user_can_read_private_membership_catalog(
  check_venue_id uuid,
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
      public.clubr_user_has_access(check_venue_id, check_user_id)
      or exists (
        select 1
        from public.club_memberships membership
        where membership.venue_id = check_venue_id
          and public.can_manage_profile(membership.profile_id, check_user_id)
      )
      or exists (
        select 1
        from public.club_membership_applications application
        left join public.club_membership_application_members member
          on member.application_id = application.id
        where application.venue_id = check_venue_id
          and (
            application.owner_user_id = check_user_id
            or public.can_manage_profile(application.applicant_profile_id, check_user_id)
            or public.can_manage_profile(member.profile_id, check_user_id)
          )
      )
      or exists (
        select 1
        from public.club_membership_subscriptions subscription
        left join public.club_membership_subscription_members member
          on member.subscription_id = subscription.id
        where subscription.venue_id = check_venue_id
          and (
            subscription.owner_user_id = check_user_id
            or public.can_manage_profile(subscription.applicant_profile_id, check_user_id)
            or public.can_manage_profile(member.profile_id, check_user_id)
          )
      )
    );
$$;

alter table public.club_notices
  add column if not exists is_public boolean not null default false;

create index if not exists club_notices_public_idx
on public.club_notices(venue_id, is_public, is_active, created_at desc);

alter table public.court_bookings
  add column if not exists booking_price_cents integer,
  add column if not exists booking_currency text,
  add column if not exists guest_contact jsonb;

alter table public.court_bookings drop constraint if exists court_bookings_price_valid;
alter table public.court_bookings add constraint court_bookings_price_valid
check (booking_price_cents is null or booking_price_cents >= 0);
alter table public.court_bookings drop constraint if exists court_bookings_currency_valid;
alter table public.court_bookings add constraint court_bookings_currency_valid
check (booking_currency is null or booking_currency ~ '^[A-Z]{3}$');
alter table public.court_bookings drop constraint if exists court_bookings_guest_contact_object;
alter table public.court_bookings add constraint court_bookings_guest_contact_object
check (guest_contact is null or jsonb_typeof(guest_contact) = 'object');

create or replace function public.playr_user_has_venue_relationship(
  check_venue_id uuid,
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
      or exists (
        select 1
        from public.organisation_memberships membership
        where membership.venue_id = check_venue_id
          and membership.user_id = check_user_id
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.club_memberships membership
        where membership.venue_id = check_venue_id
          and public.can_manage_profile(membership.profile_id, check_user_id)
      )
      or exists (
        select 1
        from public.organisation_player_links link
        where link.venue_id = check_venue_id
          and link.status in ('pending', 'active', 'suspended')
          and public.can_manage_profile(link.player_profile_id, check_user_id)
      )
      or exists (
        select 1
        from public.court_bookings booking
        join public.courts court on court.id = booking.court_id
        where court.venue_id = check_venue_id
          and booking.status = 'confirmed'
          and booking.end_time > now()
          and (
            booking.booked_by_user_id = check_user_id
            or public.can_manage_profile(booking.player_profile_id, check_user_id)
          )
      )
      or exists (
        select 1
        from public.club_membership_applications application
        left join public.club_membership_application_members member
          on member.application_id = application.id
        where application.venue_id = check_venue_id
          and (
            application.owner_user_id = check_user_id
            or public.can_manage_profile(application.applicant_profile_id, check_user_id)
            or public.can_manage_profile(member.profile_id, check_user_id)
          )
      )
      or exists (
        select 1
        from public.club_membership_subscriptions subscription
        left join public.club_membership_subscription_members member
          on member.subscription_id = subscription.id
        where subscription.venue_id = check_venue_id
          and (
            subscription.owner_user_id = check_user_id
            or public.can_manage_profile(subscription.applicant_profile_id, check_user_id)
            or public.can_manage_profile(member.profile_id, check_user_id)
          )
      )
    );
$$;

create or replace function public.playr_resolve_venue_relationship(
  p_profile_id uuid,
  p_venue_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  profile_row public.profiles;
  subscription_row record;
  application_row record;
  legacy_row public.club_memberships;
  former_row record;
  relationship_type text := 'guest';
  membership_status text := null;
  subscription_id uuid := null;
  application_id uuid := null;
  booking_entitlement jsonb := '{}'::jsonb;
  authorised_manager boolean := false;
  organisation_access boolean := false;
  booking_access boolean := false;
begin
  if actor_user_id is null or p_user_id is distinct from actor_user_id then
    raise exception 'profile_access_denied' using errcode = 'P0001';
  end if;

  select * into profile_row from public.profiles where id = p_profile_id;
  if profile_row.id is null
    or not (
      public.can_manage_profile(p_profile_id, actor_user_id)
      or public.user_is_platform_admin(actor_user_id)
      or public.clubr_user_can_view_diagnostics(p_venue_id, actor_user_id)
    ) then
    raise exception 'profile_access_denied' using errcode = 'P0001';
  end if;

  authorised_manager := public.clubr_user_can_manage_settings(p_venue_id, actor_user_id);
  organisation_access := authorised_manager or exists (
    select 1 from public.organisation_player_links link
    where link.venue_id = p_venue_id
      and link.player_profile_id = p_profile_id
      and link.status in ('pending', 'active', 'suspended')
  );
  booking_access := exists (
    select 1
    from public.court_bookings booking
    join public.courts court on court.id = booking.court_id
    where court.venue_id = p_venue_id
      and booking.player_profile_id = p_profile_id
      and booking.status = 'confirmed'
      and booking.end_time > now()
  );

  select
    subscription.id,
    subscription.application_id,
    subscription.status,
    plan.booking_entitlement
  into subscription_row
  from public.club_membership_subscriptions subscription
  join public.club_membership_subscription_members member
    on member.subscription_id = subscription.id
   and member.profile_id = p_profile_id
  join public.club_membership_plans plan on plan.id = member.selected_plan_id
  where subscription.venue_id = p_venue_id
    and subscription.status in ('active', 'expiring')
    and member.status = 'active'
    and subscription.start_date <= current_date
    and (subscription.expiry_date is null or subscription.expiry_date >= current_date)
  order by subscription.activated_at desc nulls last, subscription.created_at desc
  limit 1;

  if subscription_row.id is not null then
    relationship_type := 'member';
    membership_status := subscription_row.status;
    subscription_id := subscription_row.id;
    application_id := subscription_row.application_id;
    booking_entitlement := coalesce(subscription_row.booking_entitlement, '{}'::jsonb);
  else
    select * into legacy_row
    from public.club_memberships membership
    where membership.venue_id = p_venue_id
      and membership.profile_id = p_profile_id
      and membership.status = 'active'
    order by membership.updated_at desc
    limit 1;

    if legacy_row.id is not null then
      relationship_type := 'member';
      membership_status := 'active';
      booking_entitlement := jsonb_build_object('reference', 'legacy_club_access');
    else
      select application.id, application.status
      into application_row
      from public.club_membership_applications application
      left join public.club_membership_application_members member
        on member.application_id = application.id
      where application.venue_id = p_venue_id
        and (application.applicant_profile_id = p_profile_id or member.profile_id = p_profile_id)
        and application.status in ('pending_application', 'pending_approval', 'correction_requested', 'approved')
      order by application.submitted_at desc nulls last, application.created_at desc
      limit 1;

      if application_row.id is not null then
        relationship_type := 'pending';
        membership_status := application_row.status;
        application_id := application_row.id;
      else
        select subscription.id, subscription.status
        into former_row
        from public.club_membership_subscriptions subscription
        join public.club_membership_subscription_members member
          on member.subscription_id = subscription.id
         and member.profile_id = p_profile_id
        where subscription.venue_id = p_venue_id
          and (subscription.status in ('paused', 'expired', 'cancelled') or member.status in ('paused', 'expired', 'cancelled'))
        order by subscription.updated_at desc
        limit 1;

        if former_row.id is not null or exists (
          select 1 from public.club_memberships membership
          where membership.venue_id = p_venue_id
            and membership.profile_id = p_profile_id
            and membership.status = 'inactive'
        ) then
          relationship_type := 'former_member';
          membership_status := coalesce(former_row.status, 'inactive');
          subscription_id := former_row.id;
        elsif exists (
          select 1 from public.club_memberships membership
          where membership.venue_id = p_venue_id
            and membership.profile_id = p_profile_id
            and membership.status = 'pending'
        ) then
          relationship_type := 'pending';
          membership_status := 'pending';
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'relationshipType', relationship_type,
    'membershipStatus', membership_status,
    'subscriptionId', subscription_id,
    'applicationId', application_id,
    'bookingEntitlement', booking_entitlement,
    'isLinkedJunior', profile_row.is_junior,
    'isAuthorisedManager', authorised_manager,
    'hasOrganisationAccess', organisation_access,
    'hasBookingAccess', booking_access
  );
end;
$$;

create or replace function public.playr_can_open_venue(
  p_venue_id uuid,
  p_profile_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  venue_visibility text;
  relationship jsonb;
begin
  if p_user_id is distinct from (select auth.uid()) then return false; end if;
  select discovery_visibility into venue_visibility
  from public.venues
  where id = p_venue_id and status = 'active';
  if venue_visibility is null then return false; end if;
  relationship := public.playr_resolve_venue_relationship(p_profile_id, p_venue_id, p_user_id);
  return venue_visibility = 'public'
    or relationship->>'relationshipType' <> 'guest'
    or coalesce((relationship->>'isAuthorisedManager')::boolean, false)
    or coalesce((relationship->>'hasOrganisationAccess')::boolean, false)
    or coalesce((relationship->>'hasBookingAccess')::boolean, false);
exception when others then
  return false;
end;
$$;

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
    (select count(*)::integer from public.courts court where court.venue_id = venue.id and court.status = 'active'),
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
    and venue.discovery_visibility = 'public'
    and venue.organisation_type in ('club', 'club_academy', 'school', 'school_district')
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or lower(concat_ws(' ', venue.name, venue.address, venue.suburb, venue.town, venue.city))
        like '%' || lower(btrim(p_search)) || '%'
    )
  order by venue.name;
end;
$$;

create or replace function public.playr_profile_venues(p_profile_id uuid)
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
    (select count(*)::integer from public.courts court where court.venue_id = venue.id and court.status = 'active'),
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
      resolved.relationship->>'relationshipType' <> 'guest'
      or coalesce((resolved.relationship->>'isAuthorisedManager')::boolean, false)
      or coalesce((resolved.relationship->>'hasOrganisationAccess')::boolean, false)
      or coalesce((resolved.relationship->>'hasBookingAccess')::boolean, false)
    )
  order by
    case resolved.relationship->>'relationshipType'
      when 'member' then 1 when 'pending' then 2 when 'former_member' then 3 else 4
    end,
    venue.name;
end;
$$;

create or replace function public.playr_venue_page(
  p_venue_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  venue_row public.venues;
  settings_row public.organisation_booking_settings;
  relationship jsonb;
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null or not public.playr_can_open_venue(p_venue_id, p_profile_id, actor_user_id) then
    raise exception 'venue_access_denied' using errcode = 'P0001';
  end if;
  select * into venue_row from public.venues where id = p_venue_id and status = 'active';
  if venue_row.id is null then raise exception 'venue_not_found' using errcode = 'P0001'; end if;
  select * into settings_row from public.organisation_booking_settings where venue_id = p_venue_id;
  relationship := public.playr_resolve_venue_relationship(p_profile_id, p_venue_id, actor_user_id);

  return jsonb_build_object(
    'id', venue_row.id,
    'name', venue_row.name,
    'slug', venue_row.slug,
    'logoUrl', venue_row.logo_url,
    'imageUrl', venue_row.public_image_url,
    'description', coalesce(venue_row.public_description, venue_row.description),
    'address', venue_row.address,
    'suburb', venue_row.suburb,
    'town', venue_row.town,
    'city', venue_row.city,
    'phone', venue_row.contact_phone,
    'email', venue_row.contact_email,
    'websiteUrl', venue_row.website_url,
    'openingHours', venue_row.opening_hours_text,
    'surfaceTypes', venue_row.surface_types,
    'facilities', venue_row.facilities,
    'visitorInformation', venue_row.visitor_information,
    'parkingInformation', venue_row.parking_information,
    'bookingNotes', venue_row.booking_notes,
    'membershipContact', venue_row.membership_contact,
    'courtCount', (select count(*)::integer from public.courts court where court.venue_id = venue_row.id and court.status = 'active'),
    'visibility', venue_row.discovery_visibility,
    'relationship', relationship,
    'guestBookingAvailable', coalesce(settings_row.non_member_booking_enabled, false),
    'publicAvailabilityVisibility', coalesce(settings_row.public_availability_visibility, 'sign_in_required'),
    'membershipsAvailable', exists (
      select 1 from public.club_membership_plans plan
      where plan.venue_id = venue_row.id and plan.status = 'active' and plan.is_public and not plan.is_legacy
    ),
    'leaderboardVisibility', jsonb_build_object(
      'competition', venue_row.competition_leaderboard_visibility,
      'participation', venue_row.participation_leaderboard_visibility,
      'development', venue_row.development_leaderboard_visibility
    )
  );
end;
$$;

create or replace function public.playr_public_membership_catalog(
  p_venue_id uuid,
  p_profile_id uuid
)
returns table (
  plan_id uuid,
  category_id uuid,
  plan_version integer,
  plan_name text,
  category_name text,
  category_eligibility text,
  minimum_age integer,
  maximum_age integer,
  description text,
  base_price_cents integer,
  currency text,
  joining_fee_cents integer,
  joining_fee_scope text,
  duration_months integer,
  no_fixed_term boolean,
  maximum_covered_members integer,
  adult_primary_required boolean,
  booking_entitlement jsonb,
  benefits_text text,
  public_benefits text[],
  terms_text text,
  pricing_options jsonb,
  addon_rules jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.playr_can_open_venue(p_venue_id, p_profile_id) then
    raise exception 'venue_access_denied' using errcode = 'P0001';
  end if;

  return query
  select
    plan.id,
    plan.category_id,
    plan.version,
    plan.name,
    category.name,
    category.eligibility_class,
    category.minimum_age,
    category.maximum_age,
    plan.description,
    plan.base_price_cents,
    plan.currency,
    plan.joining_fee_cents,
    plan.joining_fee_scope,
    plan.duration_months,
    plan.no_fixed_term,
    plan.maximum_covered_members,
    plan.adult_primary_required,
    plan.booking_entitlement,
    plan.benefits_text,
    plan.public_benefits,
    plan.terms_text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id,
        'label', option.label,
        'commitmentMonths', option.commitment_months,
        'noFixedTerm', option.no_fixed_term,
        'paymentFrequency', option.payment_frequency,
        'discountType', option.discount_type,
        'discountValue', option.discount_value,
        'displayedPriceCents', option.displayed_price_cents
      ) order by option.display_order, option.label)
      from public.club_membership_pricing_options option
      where option.plan_id = plan.id and option.is_active
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'memberClass', rule.member_class,
        'ruleId', rule.id,
        'maximumAddons', rule.maximum_addons,
        'adjustmentType', rule.adjustment_type,
        'adjustmentValue', rule.adjustment_value,
        'addonPlanId', addon.id,
        'addonPlanName', addon.name,
        'addonPlanBasePriceCents', addon.base_price_cents,
        'addonPlanCategoryId', addon.category_id
      ) order by rule.display_order)
      from public.club_membership_addon_rules rule
      join public.club_membership_plans addon on addon.id = rule.addon_plan_id
      where rule.primary_plan_id = plan.id
        and rule.is_active
        and addon.status = 'active'
        and addon.is_public
        and not addon.is_legacy
    ), '[]'::jsonb)
  from public.club_membership_plans plan
  join public.club_membership_categories category on category.id = plan.category_id
  where plan.venue_id = p_venue_id
    and plan.status = 'active'
    and plan.is_public
    and not plan.is_legacy
    and category.status = 'active'
    and not exists (
      select 1 from public.club_membership_plans newer
      where newer.venue_id = plan.venue_id
        and newer.name = plan.name
        and newer.status = 'active'
        and newer.version > plan.version
    )
  order by category.display_order, plan.name;
end;
$$;

create or replace function public.playr_public_notices(
  p_venue_id uuid,
  p_profile_id uuid
)
returns table (
  notice_id uuid,
  title text,
  message text,
  category text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.playr_can_open_venue(p_venue_id, p_profile_id) then
    raise exception 'venue_access_denied' using errcode = 'P0001';
  end if;
  return query
  select notice.id, notice.title, notice.message, notice.category, notice.starts_at, notice.ends_at
  from public.club_notices notice
  where notice.venue_id = p_venue_id
    and notice.is_public
    and notice.is_active
    and (notice.starts_at is null or notice.starts_at <= now())
    and (notice.ends_at is null or notice.ends_at > now())
  order by case when notice.category = 'pinned' then 0 else 1 end, notice.created_at desc;
end;
$$;

create or replace function public.playr_calculate_public_membership_price(
  p_plan_id uuid,
  p_pricing_option_id uuid,
  p_members jsonb,
  p_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_venue_id uuid;
  member_line jsonb;
begin
  select plan.venue_id into target_venue_id
  from public.club_membership_plans plan
  join public.venues venue on venue.id = plan.venue_id
  where plan.id = p_plan_id
    and plan.status = 'active'
    and plan.is_public
    and not plan.is_legacy
    and venue.status = 'active'
    and (
      venue.discovery_visibility = 'public'
      or public.playr_user_has_venue_relationship(venue.id, actor_user_id)
    )
    and exists (
      select 1 from public.club_membership_pricing_options option
      where option.id = p_pricing_option_id and option.plan_id = plan.id and option.is_active
    );
  if actor_user_id is null or target_venue_id is null then
    raise exception 'membership_plan_unavailable' using errcode = 'P0001';
  end if;
  for member_line in select value from jsonb_array_elements(p_members)
  loop
    if not public.can_manage_profile((member_line->>'profile_id')::uuid, actor_user_id)
      or not exists (
        select 1
        from public.club_membership_plans member_plan
        where member_plan.id = coalesce(nullif(member_line->>'selected_plan_id', '')::uuid, p_plan_id)
          and member_plan.venue_id = target_venue_id
          and member_plan.status = 'active'
          and member_plan.is_public
          and not member_plan.is_legacy
      ) then
      raise exception 'profile_access_denied' using errcode = 'P0001';
    end if;
  end loop;
  return public.clubr_calculate_membership_price(
    p_plan_id,
    p_pricing_option_id,
    p_members,
    p_start_date,
    actor_user_id
  );
end;
$$;

create or replace function public.clubr_validate_player_application_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.club_membership_plans plan
    join public.venues venue on venue.id = plan.venue_id
    where plan.id = new.plan_id
      and plan.venue_id = new.venue_id
      and plan.status = 'active'
      and plan.is_public
      and not plan.is_legacy
      and venue.status = 'active'
      and (
        venue.discovery_visibility = 'public'
        or public.playr_user_has_venue_relationship(venue.id)
      )
  ) and not public.clubr_membership_permission(new.venue_id, 'applications_review') then
    raise exception 'membership_plan_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.clubr_validate_player_application_member_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_application public.club_membership_applications;
begin
  select * into target_application
  from public.club_membership_applications
  where id = new.application_id;
  if target_application.id is null then
    raise exception 'membership_application_not_found' using errcode = 'P0001';
  end if;
  if not public.clubr_membership_permission(target_application.venue_id, 'applications_review')
    and not exists (
      select 1
      from public.club_membership_plans plan
      where plan.id = new.selected_plan_id
        and plan.venue_id = target_application.venue_id
        and plan.status = 'active'
        and plan.is_public
        and not plan.is_legacy
    ) then
    raise exception 'membership_plan_unavailable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists club_membership_applications_validate_public_plan on public.club_membership_applications;
create trigger club_membership_applications_validate_public_plan
before insert on public.club_membership_applications
for each row execute function public.clubr_validate_player_application_plan();

drop trigger if exists club_membership_application_members_validate_public_plan on public.club_membership_application_members;
create trigger club_membership_application_members_validate_public_plan
before insert on public.club_membership_application_members
for each row execute function public.clubr_validate_player_application_member_plan();

create or replace function public.playr_venue_booking_eligibility(
  p_profile_id uuid,
  p_venue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  relationship jsonb;
  settings_row public.organisation_booking_settings;
  entitlement jsonb;
  relationship_type text;
  advance_days integer;
  max_active integer;
  max_duration integer;
  member_price integer;
begin
  if not public.playr_can_open_venue(p_venue_id, p_profile_id) then
    return jsonb_build_object('allowed', false, 'reason', 'venue_access_denied');
  end if;
  relationship := public.playr_resolve_venue_relationship(p_profile_id, p_venue_id);
  relationship_type := relationship->>'relationshipType';
  entitlement := coalesce(relationship->'bookingEntitlement', '{}'::jsonb);
  select * into settings_row from public.organisation_booking_settings where venue_id = p_venue_id;
  if settings_row.venue_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'booking_rules_unavailable', 'relationshipType', relationship_type);
  end if;

  if relationship_type = 'member' then
    advance_days := coalesce((entitlement->>'advance_booking_days')::integer, settings_row.advance_booking_days);
    max_active := coalesce((entitlement->>'max_active_bookings')::integer, settings_row.max_active_bookings);
    max_duration := coalesce((entitlement->>'max_duration_minutes')::integer, settings_row.slot_minutes);
    member_price := coalesce((entitlement->>'member_price_cents')::integer, 0);
    return jsonb_build_object(
      'allowed', settings_row.member_booking_enabled,
      'reason', case when settings_row.member_booking_enabled then 'eligible' else 'member_booking_disabled' end,
      'relationshipType', relationship_type,
      'bookingType', 'member_booking',
      'advanceDays', greatest(0, least(365, advance_days)),
      'maxActiveBookings', greatest(1, least(100, max_active)),
      'maxDurationMinutes', greatest(settings_row.slot_minutes, least(240, max_duration)),
      'slotMinutes', settings_row.slot_minutes,
      'openingTime', settings_row.opening_time,
      'closingTime', settings_row.closing_time,
      'priceCents', greatest(0, member_price),
      'currency', 'ZAR',
      'eligibleCourtIds', coalesce(entitlement->'eligible_court_ids', '[]'::jsonb),
      'requiresApproval', false,
      'futurePaymentRequired', false
    );
  end if;

  return jsonb_build_object(
    'allowed', settings_row.non_member_booking_enabled
      and not settings_row.guest_approval_required
      and settings_row.public_availability_visibility <> 'after_approval',
    'reason', case
      when not settings_row.non_member_booking_enabled then 'guest_booking_disabled'
      when settings_row.guest_approval_required then 'guest_approval_required'
      when settings_row.public_availability_visibility = 'after_approval' then 'availability_after_approval'
      else 'eligible'
    end,
    'relationshipType', relationship_type,
    'bookingType', 'guest_booking',
    'advanceDays', settings_row.guest_advance_booking_days,
    'maxActiveBookings', settings_row.max_guest_bookings_per_period,
    'bookingPeriodDays', settings_row.guest_booking_period_days,
    'maxDurationMinutes', settings_row.guest_max_duration_minutes,
    'slotMinutes', settings_row.slot_minutes,
    'openingTime', settings_row.guest_opening_time,
    'closingTime', settings_row.guest_closing_time,
    'priceCents', coalesce(settings_row.non_member_price_cents, 0),
    'currency', 'ZAR',
    'eligibleCourtIds', to_jsonb(settings_row.guest_accessible_court_ids),
    'requiresApproval', settings_row.guest_approval_required,
    'requiresName', settings_row.guest_name_required,
    'requiresEmail', settings_row.guest_email_required,
    'requiresPhone', settings_row.guest_phone_required,
    'futurePaymentRequired', settings_row.guest_future_payment_required,
    'availabilityVisibility', settings_row.public_availability_visibility
  );
exception when invalid_text_representation then
  return jsonb_build_object('allowed', false, 'reason', 'booking_rules_invalid');
end;
$$;

create or replace function public.playr_venue_court_occupancy_for_range(
  p_venue_id uuid,
  p_profile_id uuid,
  check_start_time timestamptz,
  check_end_time timestamptz
)
returns table (
  court_id uuid,
  player_profile_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  booking_type public.court_booking_type,
  player_name text,
  occupancy_type text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  eligibility jsonb;
  eligible_courts jsonb;
begin
  if check_end_time <= check_start_time
    or not public.playr_can_open_venue(p_venue_id, p_profile_id) then
    raise exception 'venue_access_denied' using errcode = 'P0001';
  end if;
  eligibility := public.playr_venue_booking_eligibility(p_profile_id, p_venue_id);
  if not coalesce((eligibility->>'allowed')::boolean, false) then
    raise exception 'availability_unavailable' using errcode = 'P0001';
  end if;
  eligible_courts := coalesce(eligibility->'eligibleCourtIds', '[]'::jsonb);

  return query
  select
    occupancy.court_id,
    occupancy.player_profile_id,
    occupancy.start_time,
    occupancy.end_time,
    occupancy.booking_type,
    occupancy.player_name,
    occupancy.occupancy_type
  from public.playr_court_occupancy_for_range(check_start_time, check_end_time) occupancy
  join public.courts court on court.id = occupancy.court_id
  where court.venue_id = p_venue_id
    and court.status = 'active'
    and (
      (
        eligibility->>'bookingType' = 'guest_booking'
        and eligibility->>'availabilityVisibility' in ('full', 'sign_in_required')
      )
      or jsonb_array_length(eligible_courts) = 0
      or exists (
        select 1
        from jsonb_array_elements_text(eligible_courts) item
        where item::uuid = occupancy.court_id
      )
    );
end;
$$;

create or replace function public.playr_direct_member_booking_allowed(
  p_court_id uuid,
  p_profile_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_court public.courts;
  eligibility jsonb;
  venue_timezone text;
  local_start time;
  local_end time;
  duration_minutes integer;
  eligible_courts jsonb;
begin
  select * into target_court from public.courts where id = p_court_id and status = 'active';
  if target_court.id is null or target_court.venue_id is null or p_booking_purpose <> 'member_booking' then return false; end if;
  eligibility := public.playr_venue_booking_eligibility(p_profile_id, target_court.venue_id);
  if not coalesce((eligibility->>'allowed')::boolean, false) or eligibility->>'bookingType' <> 'member_booking' then return false; end if;
  select timezone into venue_timezone from public.venues where id = target_court.venue_id;
  local_start := (p_start_time at time zone coalesce(venue_timezone, 'Africa/Johannesburg'))::time;
  local_end := (p_end_time at time zone coalesce(venue_timezone, 'Africa/Johannesburg'))::time;
  duration_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60;
  eligible_courts := coalesce(eligibility->'eligibleCourtIds', '[]'::jsonb);
  return public.can_manage_profile(p_profile_id)
    and p_start_time >= now()
    and p_start_time < now() + make_interval(days => greatest(1, (eligibility->>'advanceDays')::integer))
    and p_end_time > p_start_time
    and duration_minutes > 0
    and duration_minutes <= (eligibility->>'maxDurationMinutes')::integer
    and duration_minutes % (eligibility->>'slotMinutes')::integer = 0
    and local_start >= (eligibility->>'openingTime')::time
    and local_end <= (eligibility->>'closingTime')::time
    and (
      jsonb_array_length(eligible_courts) = 0
      or exists (select 1 from jsonb_array_elements_text(eligible_courts) item where item::uuid = p_court_id)
    )
    and (
      select count(*) < (eligibility->>'maxActiveBookings')::integer
      from public.court_bookings booking
      where booking.player_profile_id = p_profile_id
        and booking.owner_organisation_id = target_court.venue_id
        and booking.status = 'confirmed'
        and booking.booking_purpose = 'member_booking'
        and booking.start_time >= now()
    );
exception when others then
  return false;
end;
$$;

create or replace function public.playr_create_venue_booking(
  p_venue_id uuid,
  p_court_id uuid,
  p_profile_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_court public.courts;
  eligibility jsonb;
  booking_id uuid;
  booking_type text;
  price_cents integer;
  duration_minutes integer;
  venue_timezone text;
  local_start time;
  local_end time;
  eligible_courts jsonb;
  period_days integer;
begin
  if actor_user_id is null or not public.can_manage_profile(p_profile_id, actor_user_id) then
    raise exception 'profile_access_denied' using errcode = 'P0001';
  end if;
  select * into target_court
  from public.courts
  where id = p_court_id and venue_id = p_venue_id and status = 'active';
  if target_court.id is null then raise exception 'court_unavailable' using errcode = 'P0001'; end if;

  eligibility := public.playr_venue_booking_eligibility(p_profile_id, p_venue_id);
  if not coalesce((eligibility->>'allowed')::boolean, false) then
    raise exception '%', coalesce(eligibility->>'reason', 'booking_not_allowed') using errcode = 'P0001';
  end if;
  booking_type := eligibility->>'bookingType';
  price_cents := coalesce((eligibility->>'priceCents')::integer, 0);
  duration_minutes := extract(epoch from (p_end_time - p_start_time))::integer / 60;
  eligible_courts := coalesce(eligibility->'eligibleCourtIds', '[]'::jsonb);

  if p_end_time <= p_start_time
    or p_start_time < now()
    or p_start_time >= now() + make_interval(days => greatest(1, (eligibility->>'advanceDays')::integer))
    or duration_minutes <= 0
    or duration_minutes > (eligibility->>'maxDurationMinutes')::integer
    or duration_minutes % (eligibility->>'slotMinutes')::integer <> 0 then
    raise exception 'booking_time_outside_rules' using errcode = 'P0001';
  end if;

  select timezone into venue_timezone from public.venues where id = p_venue_id;
  local_start := (p_start_time at time zone coalesce(venue_timezone, 'Africa/Johannesburg'))::time;
  local_end := (p_end_time at time zone coalesce(venue_timezone, 'Africa/Johannesburg'))::time;
  if local_start < (eligibility->>'openingTime')::time or local_end > (eligibility->>'closingTime')::time then
    raise exception 'booking_time_outside_rules' using errcode = 'P0001';
  end if;

  if jsonb_array_length(eligible_courts) > 0
    and not exists (select 1 from jsonb_array_elements_text(eligible_courts) item where item::uuid = p_court_id) then
    raise exception 'court_not_eligible' using errcode = 'P0001';
  end if;

  if booking_type = 'guest_booking' then
    if coalesce((eligibility->>'requiresName')::boolean, false) and nullif(btrim(coalesce(p_guest_name, '')), '') is null then
      raise exception 'guest_name_required' using errcode = 'P0001';
    end if;
    if coalesce((eligibility->>'requiresEmail')::boolean, false) and nullif(btrim(coalesce(p_guest_email, '')), '') is null then
      raise exception 'guest_email_required' using errcode = 'P0001';
    end if;
    if coalesce((eligibility->>'requiresPhone')::boolean, false) and nullif(btrim(coalesce(p_guest_phone, '')), '') is null then
      raise exception 'guest_phone_required' using errcode = 'P0001';
    end if;
    period_days := coalesce((eligibility->>'bookingPeriodDays')::integer, 7);
    if (
      select count(*) >= (eligibility->>'maxActiveBookings')::integer
      from public.court_bookings booking
      where booking.player_profile_id = p_profile_id
        and booking.owner_organisation_id = p_venue_id
        and booking.booking_purpose = 'guest_booking'
        and booking.status = 'confirmed'
        and booking.start_time >= now() - make_interval(days => period_days)
    ) then
      raise exception 'guest_booking_limit_reached' using errcode = 'P0001';
    end if;
  elsif (
    select count(*) >= (eligibility->>'maxActiveBookings')::integer
    from public.court_bookings booking
    where booking.player_profile_id = p_profile_id
      and booking.owner_organisation_id = p_venue_id
      and booking.booking_purpose = 'member_booking'
      and booking.status = 'confirmed'
      and booking.start_time >= now()
  ) then
    raise exception 'member_booking_limit_reached' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.court_bookings booking
    where booking.court_id = p_court_id
      and booking.status = 'confirmed'
      and tstzrange(booking.start_time, booking.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  ) then
    raise exception 'court_unavailable' using errcode = '23P01';
  end if;

  insert into public.court_bookings (
    court_id, booked_by_user_id, player_profile_id, start_time, end_time,
    status, booking_type, is_public, notes, owner_organisation_id,
    booking_organisation_id, booking_purpose, source_product,
    booking_price_cents, booking_currency, guest_contact
  ) values (
    p_court_id, actor_user_id, p_profile_id, p_start_time, p_end_time,
    'confirmed', 'player_booking', false, nullif(btrim(coalesce(p_notes, '')), ''), p_venue_id,
    null, booking_type, 'playr', price_cents, eligibility->>'currency',
    case when booking_type = 'guest_booking' then jsonb_build_object(
      'name', nullif(btrim(coalesce(p_guest_name, '')), ''),
      'email', nullif(btrim(coalesce(p_guest_email, '')), ''),
      'phone', nullif(btrim(coalesce(p_guest_phone, '')), '')
    ) else null end
  ) returning id into booking_id;

  return jsonb_build_object(
    'bookingId', booking_id,
    'bookingType', booking_type,
    'status', 'confirmed',
    'priceCents', price_cents,
    'currency', eligibility->>'currency'
  );
end;
$$;

create or replace function public.playr_my_booking_cards()
returns table (
  booking_id uuid,
  court_id uuid,
  court_name text,
  venue_id uuid,
  venue_name text,
  booking_organisation_name text,
  player_profile_id uuid,
  player_first_name text,
  player_last_name text,
  player_is_junior boolean,
  start_time timestamptz,
  end_time timestamptz,
  booking_status public.court_booking_status,
  booking_type public.court_booking_type,
  booking_purpose text,
  source_product text,
  coach_lesson_id uuid,
  coach_session_occurrence_id uuid,
  notes text,
  booked_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;
  return query
  select
    booking.id,
    booking.court_id,
    court.name,
    court.venue_id,
    venue.name,
    academy.name,
    booking.player_profile_id,
    profile.first_name,
    profile.last_name,
    profile.is_junior,
    booking.start_time,
    booking.end_time,
    booking.status,
    booking.booking_type,
    booking.booking_purpose,
    booking.source_product,
    booking.coach_lesson_id,
    booking.coach_session_occurrence_id,
    case
      when booking.booked_by_user_id = actor_user_id and booking.source_product = 'playr' then booking.notes
      else null
    end,
    booking.booked_by_user_id
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id
  left join public.venues venue on venue.id = court.venue_id
  left join public.venues academy on academy.id = booking.booking_organisation_id
  left join public.profiles profile on profile.id = booking.player_profile_id
  where booking.booked_by_user_id = actor_user_id
    or public.can_manage_profile(booking.player_profile_id, actor_user_id)
  order by booking.start_time desc
  limit 100;
end;
$$;

create or replace function public.playr_user_can_read_court(
  p_court_id uuid,
  p_venue_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and (
      public.playr_user_has_venue_relationship(p_venue_id, p_user_id)
      or public.clubr_user_has_access(p_venue_id, p_user_id)
      or exists (
        select 1
        from public.organisation_court_access access
        join public.organisation_memberships membership
          on membership.venue_id = access.approved_venue_id
         and membership.user_id = p_user_id
         and membership.status = 'active'
        where access.owner_venue_id = p_venue_id
          and access.status = 'active'
          and (access.court_id is null or access.court_id = p_court_id)
          and (access.valid_from is null or access.valid_from <= now())
          and (access.valid_until is null or access.valid_until > now())
      )
      or exists (
        select 1
        from public.venues venue
        join public.organisation_booking_settings settings on settings.venue_id = venue.id
        where venue.id = p_venue_id
          and venue.status = 'active'
          and venue.discovery_visibility = 'public'
          and settings.non_member_booking_enabled
          and settings.public_availability_visibility <> 'after_approval'
          and (
            settings.public_availability_visibility in ('full', 'sign_in_required')
            or
            cardinality(settings.guest_accessible_court_ids) = 0
            or p_court_id = any(settings.guest_accessible_court_ids)
          )
      )
    );
$$;

drop policy if exists "Authenticated users can read active venues" on public.venues;
drop policy if exists "Admins can manage venues" on public.venues;
create policy "Users can read visible or connected venues"
on public.venues for select to authenticated
using (
  status = 'active'
  and (
    public.playr_user_has_venue_relationship(id)
    or public.clubr_user_has_access(id)
  )
);

drop policy if exists "Platform admins can create venues" on public.venues;
create policy "Platform admins can create venues"
on public.venues for insert to authenticated
with check (public.user_is_platform_admin((select auth.uid())));

drop policy if exists "ClubR managers can update venue discovery" on public.venues;
create policy "ClubR managers can update venue discovery"
on public.venues for update to authenticated
using (public.clubr_user_can_manage_settings(id))
with check (public.clubr_user_can_manage_settings(id));

drop policy if exists "Permitted users can read membership categories" on public.club_membership_categories;
create policy "Permitted users can read membership categories"
on public.club_membership_categories for select to authenticated
using (public.playr_user_can_read_private_membership_catalog(venue_id));

drop policy if exists "Permitted users can read membership plans" on public.club_membership_plans;
create policy "Permitted users can read membership plans"
on public.club_membership_plans for select to authenticated
using (public.playr_user_can_read_private_membership_catalog(venue_id));

drop policy if exists "Permitted users can read membership pricing options" on public.club_membership_pricing_options;
create policy "Permitted users can read membership pricing options"
on public.club_membership_pricing_options for select to authenticated
using (public.playr_user_can_read_private_membership_catalog(venue_id));

drop policy if exists "Permitted users can read membership add-on rules" on public.club_membership_addon_rules;
create policy "Permitted users can read membership add-on rules"
on public.club_membership_addon_rules for select to authenticated
using (public.playr_user_can_read_private_membership_catalog(venue_id));

drop policy if exists "Authenticated users can read active courts" on public.courts;
drop policy if exists "PlayR users can read eligible venue courts" on public.courts;
create policy "PlayR users can read eligible venue courts"
on public.courts for select to authenticated
using (status = 'active' and venue_id is not null and public.playr_user_can_read_court(id, venue_id));

drop policy if exists "Users can create court bookings for own profiles" on public.court_bookings;
create policy "Users can create eligible member court bookings"
on public.court_bookings for insert to authenticated
with check (
  booked_by_user_id = (select auth.uid())
  and booking_type = 'player_booking'
  and status = 'confirmed'
  and public.playr_direct_member_booking_allowed(court_id, player_profile_id, start_time, end_time, booking_purpose)
  and booking_organisation_id is null
  and owner_organisation_id is not distinct from (select court.venue_id from public.courts court where court.id = court_id)
  and coach_lesson_id is null
  and coach_session_occurrence_id is null
  and coach_profile_id is null
  and source_product = 'playr'
);

drop policy if exists "Users can cancel their own future court bookings" on public.court_bookings;
create policy "Users can cancel their own future PlayR bookings"
on public.court_bookings for update to authenticated
using (
  booked_by_user_id = (select auth.uid())
  and status = 'confirmed'
  and start_time > now()
  and booking_type = 'player_booking'
  and source_product = 'playr'
  and coach_lesson_id is null
  and coach_session_occurrence_id is null
)
with check (
  booked_by_user_id = (select auth.uid())
  and status = 'cancelled'
  and cancelled_by_user_id = (select auth.uid())
  and cancelled_at is not null
  and booking_type = 'player_booking'
  and source_product = 'playr'
  and coach_lesson_id is null
  and coach_session_occurrence_id is null
);

revoke all on function public.playr_user_has_venue_relationship(uuid, uuid) from public;
revoke all on function public.playr_user_can_browse_club_memberships(uuid, uuid) from public;
revoke all on function public.playr_user_can_read_private_membership_catalog(uuid, uuid) from public;
revoke all on function public.playr_resolve_venue_relationship(uuid, uuid, uuid) from public;
revoke all on function public.playr_can_open_venue(uuid, uuid, uuid) from public;
revoke all on function public.playr_discover_venues(uuid, text) from public;
revoke all on function public.playr_profile_venues(uuid) from public;
revoke all on function public.playr_venue_page(uuid, uuid) from public;
revoke all on function public.playr_public_membership_catalog(uuid, uuid) from public;
revoke all on function public.playr_public_notices(uuid, uuid) from public;
revoke all on function public.playr_calculate_public_membership_price(uuid, uuid, jsonb, date) from public;
revoke all on function public.clubr_validate_player_application_plan() from public;
revoke all on function public.clubr_validate_player_application_member_plan() from public;
revoke all on function public.playr_venue_booking_eligibility(uuid, uuid) from public;
revoke all on function public.playr_venue_court_occupancy_for_range(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.playr_direct_member_booking_allowed(uuid, uuid, timestamptz, timestamptz, text) from public;
revoke all on function public.playr_create_venue_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text) from public;
revoke all on function public.playr_my_booking_cards() from public;
revoke all on function public.playr_user_can_read_court(uuid, uuid, uuid) from public;

grant execute on function public.playr_user_has_venue_relationship(uuid, uuid) to authenticated;
grant execute on function public.playr_user_can_browse_club_memberships(uuid, uuid) to authenticated;
grant execute on function public.playr_user_can_read_private_membership_catalog(uuid, uuid) to authenticated;
grant execute on function public.playr_resolve_venue_relationship(uuid, uuid, uuid) to authenticated;
grant execute on function public.playr_can_open_venue(uuid, uuid, uuid) to authenticated;
grant execute on function public.playr_discover_venues(uuid, text) to authenticated;
grant execute on function public.playr_profile_venues(uuid) to authenticated;
grant execute on function public.playr_venue_page(uuid, uuid) to authenticated;
grant execute on function public.playr_public_membership_catalog(uuid, uuid) to authenticated;
grant execute on function public.playr_public_notices(uuid, uuid) to authenticated;
grant execute on function public.playr_calculate_public_membership_price(uuid, uuid, jsonb, date) to authenticated;
grant execute on function public.playr_venue_booking_eligibility(uuid, uuid) to authenticated;
grant execute on function public.playr_venue_court_occupancy_for_range(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.playr_direct_member_booking_allowed(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.playr_create_venue_booking(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.playr_my_booking_cards() to authenticated;
grant execute on function public.playr_user_can_read_court(uuid, uuid, uuid) to authenticated;

revoke execute on function public.clubr_calculate_membership_price(uuid, uuid, jsonb, date, uuid) from authenticated;
revoke execute on function public.playr_court_occupancy_for_range(timestamptz, timestamptz) from authenticated;

grant select, update on public.venues to authenticated;
grant select, update on public.organisation_booking_settings to authenticated;
grant select, update on public.club_membership_plans to authenticated;
grant select, update on public.club_notices to authenticated;
grant select, insert, update on public.court_bookings to authenticated;
