-- TeamR Phase 2B.3A: derived District players, canonical ranking precision,
-- zero-point participation eligibility and organisation People & Access.
--
-- This migration creates no District player links and no TeamR-specific staff
-- identity. Players remain canonical profiles reached through active School
-- links; staff remain canonical organisation memberships and invitations.

create function public.get_teamr_players(
  p_venue_id uuid,
  p_include_inherited boolean default true
)
returns table (
  source_organisation_player_link_id uuid,
  player_profile_id uuid,
  player_name text,
  is_junior boolean,
  junior_stage text,
  rating_value numeric,
  rating_confidence text,
  participation_score integer,
  approved_at timestamptz,
  school_affiliation text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.teamr_user_can_manage_teams(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  return query
  with target as (
    select venue.id, venue.organisation_type
    from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ), candidate_links as (
    -- School contexts continue to use their own canonical active links.
    select
      link.id as link_id,
      link.player_profile_id,
      link.approved_at,
      school.name as school_name
    from target
    join public.venues school
      on school.id = target.id
     and school.organisation_type in ('school', 'school_district')
    join public.organisation_player_links link
      on link.venue_id = school.id
     and link.status = 'active'
    where not p_include_inherited
       or target.organisation_type in ('school', 'school_district')

    union all

    -- District contexts derive players from active affiliated Schools.
    select
      link.id,
      link.player_profile_id,
      link.approved_at,
      school.name
    from target
    join public.organisation_relationships relationship
      on relationship.parent_venue_id = target.id
     and relationship.relationship_type = 'belongs_to'
     and relationship.status = 'active'
    join public.venues school
      on school.id = relationship.child_venue_id
     and school.status = 'active'
     and school.organisation_type in ('school', 'school_district')
    join public.organisation_player_links link
      on link.venue_id = school.id
     and link.status = 'active'
    where p_include_inherited
      and target.organisation_type in ('district', 'school_district')

    union all

    -- Preserve the pre-existing exact-host path for roster internals only.
    select
      link.id,
      link.player_profile_id,
      link.approved_at,
      null::text
    from target
    join public.organisation_player_links link
      on link.venue_id = target.id
     and link.status = 'active'
    where not p_include_inherited
      and target.organisation_type = 'district'
  ), deduplicated as (
    select
      candidate.player_profile_id,
      (array_agg(candidate.link_id order by candidate.link_id))[1] as link_id,
      max(candidate.approved_at) as approved_at,
      string_agg(distinct candidate.school_name, ', ' order by candidate.school_name)
        filter (where candidate.school_name is not null) as school_affiliation
    from candidate_links candidate
    group by candidate.player_profile_id
  )
  select
    deduplicated.link_id,
    profile.id,
    profile.first_name || ' ' || profile.last_name,
    profile.is_junior,
    profile.junior_stage::text,
    case when profile.is_junior then profile.junior_rating else rating.rating_value end,
    case when profile.is_junior then null::text else rating.confidence::text end,
    profile.participation_score,
    deduplicated.approved_at,
    deduplicated.school_affiliation
  from deduplicated
  join public.profiles profile
    on profile.id = deduplicated.player_profile_id
   and profile.member_status <> 'inactive'
  left join public.ratings rating on rating.profile_id = profile.id
  order by profile.first_name, profile.last_name, profile.id;
end;
$$;

revoke all on function public.get_teamr_players(uuid, boolean) from public, anon;
grant execute on function public.get_teamr_players(uuid, boolean) to authenticated;

comment on function public.get_teamr_players(uuid, boolean) is
'Returns canonical active TeamR players. District rows are derived and deduplicated through active School belongs_to relationships; no District player link is created.';

-- Keep the existing public ranking contract and exact dense-rank semantics.
-- Participation now treats zero as a valid canonical score for an otherwise
-- published, safeguarded and context-eligible player.
create or replace function private.get_public_playr_rankings_core(
  p_category text,
  p_metric text default 'rating',
  p_organisation_id uuid default null,
  p_region text default null,
  p_classification text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_scope text default 'overall',
  p_target_player_ids uuid[] default null
)
returns table (
  player_id uuid,
  ranking_profile_id uuid,
  public_display_name text,
  ranking_category text,
  development_stage text,
  player_classification text,
  organisation_summary text,
  school_affiliation text,
  public_region text,
  metric_value numeric,
  events_played integer,
  matches_played integer,
  ranking_position bigint,
  total_count bigint,
  updated_at timestamptz,
  is_managed boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  safe_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  safe_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_category not in ('red', 'orange', 'green', 'open') then
    raise exception 'invalid_ranking_category' using errcode = '22023';
  end if;
  if p_metric not in ('rating', 'participation')
    or (p_category in ('red', 'orange') and p_metric <> 'participation') then
    raise exception 'invalid_ranking_metric' using errcode = '22023';
  end if;
  if p_classification is not null and p_classification not in ('junior', 'adult') then
    raise exception 'invalid_player_classification' using errcode = '22023';
  end if;
  if p_scope not in ('overall', 'school', 'club', 'academy', 'district')
    or (p_scope = 'overall' and p_organisation_id is not null)
    or (p_scope <> 'overall' and p_organisation_id is null) then
    raise exception 'invalid_ranking_context' using errcode = '22023';
  end if;

  return query
  with public_rows as (
    select
      publication.player_id,
      publication.id as ranking_profile_id,
      publication.public_display_name,
      publication.ranking_category,
      publication.development_stage,
      publication.player_classification,
      organisation.organisation_summary,
      ranking_context.school_affiliation,
      publication.public_region,
      case
        when p_metric = 'participation' then profile.participation_score::numeric
        when publication.player_classification = 'adult' then rating.rating_value
        else profile.junior_rating
      end as metric_value,
      profile.events_played,
      case when publication.player_classification = 'adult' then coalesce(rating.verified_match_count, 0) else profile.matches_played end as matches_played,
      greatest(publication.updated_at, profile.updated_at, coalesce(rating.updated_at, publication.updated_at), coalesce(profile.last_rating_update, publication.updated_at)) as ranking_updated_at,
      public.can_manage_profile(publication.player_id, (select auth.uid())) as is_managed
    from public.player_ranking_profiles publication
    join public.profiles profile on profile.id = publication.player_id
    left join public.ratings rating on rating.profile_id = profile.id
    left join lateral (
      select string_agg(venue.name, ', ' order by venue.name) as organisation_summary
      from public.organisation_player_links link
      join public.venues venue on venue.id = link.venue_id
      where link.player_profile_id = publication.player_id
        and link.status = 'active'
        and venue.status = 'active'
    ) organisation on true
    left join lateral (
      select
        count(*) > 0 as is_eligible,
        string_agg(distinct context.school_affiliation, ', ' order by context.school_affiliation)
          filter (where context.school_affiliation is not null) as school_affiliation
      from private.get_playr_ranking_contexts(publication.player_id) context
      where p_scope <> 'overall'
        and context.ranking_scope = p_scope
        and context.organisation_id = p_organisation_id
    ) ranking_context on true
    where publication.publication_status = 'approved'
      and not publication.safeguarding_hidden
      and profile.member_status <> 'inactive'
      and publication.ranking_category = p_category
      and (p_classification is null or publication.player_classification = p_classification)
      and (p_region is null or publication.public_region = p_region)
      and (p_scope = 'overall' or ranking_context.is_eligible)
      and (safe_search is null or publication.public_display_name ilike '%' || safe_search || '%' or organisation.organisation_summary ilike '%' || safe_search || '%')
      and ((p_metric = 'participation' and profile.participation_score >= 0)
        or (p_metric = 'rating' and publication.player_classification = 'adult' and rating.rating_value is not null)
        or (p_metric = 'rating' and publication.player_classification = 'junior' and profile.junior_rating is not null))
  ), ranked as (
    select public_rows.*, dense_rank() over (order by public_rows.metric_value desc) as ranking_position, count(*) over () as total_count
    from public_rows
  )
  select ranked.player_id, ranked.ranking_profile_id, ranked.public_display_name,
    ranked.ranking_category, ranked.development_stage, ranked.player_classification,
    ranked.organisation_summary, ranked.school_affiliation, ranked.public_region,
    ranked.metric_value, ranked.events_played, ranked.matches_played,
    ranked.ranking_position, ranked.total_count, ranked.ranking_updated_at,
    ranked.is_managed
  from ranked
  where p_target_player_ids is null or ranked.player_id = any(p_target_player_ids)
  order by ranked.ranking_position, ranked.public_display_name, ranked.ranking_profile_id
  limit safe_limit offset safe_offset;
end;
$$;

revoke all on function private.get_public_playr_rankings_core(text, text, uuid, text, text, text, integer, integer, text, uuid[]) from public, anon, authenticated;

create function public.get_teamr_people(p_venue_id uuid)
returns table (
  record_id uuid,
  record_kind text,
  person_name text,
  email text,
  organisation_role text,
  access_status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.teamr_user_can_manage_teams(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  return query
  select
    membership.id,
    'membership'::text,
    profile.first_name || ' ' || profile.last_name,
    profile.email,
    membership.role::text,
    membership.status::text,
    membership.created_at
  from public.organisation_memberships membership
  join public.profiles profile
    on profile.id = membership.profile_id
   and not profile.is_junior
  join public.venues venue
    on venue.id = membership.venue_id
   and venue.status = 'active'
   and venue.organisation_type in ('school', 'district', 'school_district')
  where membership.venue_id = p_venue_id
    and membership.role in (
      'organisation_admin', 'sports_coordinator', 'team_manager',
      'head_coach', 'coach', 'assistant_coach'
    )
    and membership.status in ('active', 'pending', 'suspended')

  union all

  select
    invitation.id,
    'invitation'::text,
    coalesce(nullif(invitation.invited_name, ''), invitation.invited_email),
    invitation.invited_email,
    invitation.intended_role::text,
    invitation.status::text,
    invitation.created_at
  from public.organisation_invitations invitation
  where invitation.venue_id = p_venue_id
    and invitation.invitation_kind in ('organisation_member', 'coach')
    and invitation.intended_role in (
      'sports_coordinator', 'team_manager', 'head_coach', 'coach', 'assistant_coach'
    )
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by 7 desc, 3;
end;
$$;

create function public.create_teamr_staff_invitation(
  p_venue_id uuid,
  p_invited_email text,
  p_invited_name text,
  p_intended_role public.organisation_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organisation_role;
  normalized_email text := lower(btrim(coalesce(p_invited_email, '')));
  existing_token uuid;
  invite_token uuid;
  invite_kind public.organisation_invitation_kind;
begin
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  select membership.role into actor_role
  from public.organisation_memberships membership
  join public.venues venue
    on venue.id = membership.venue_id
   and venue.status = 'active'
   and venue.organisation_type in ('school', 'district', 'school_district')
  where membership.venue_id = p_venue_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
    and membership.role in ('organisation_admin', 'sports_coordinator')
  order by case membership.role when 'organisation_admin' then 1 else 2 end
  limit 1;

  if actor_user_id is null
    or (actor_role is null and not public.user_is_platform_admin(actor_user_id)) then
    raise exception 'access' using errcode = '42501';
  end if;
  if normalized_email = '' or p_intended_role is null then
    raise exception 'missing_fields' using errcode = '22023';
  end if;
  if p_intended_role not in ('sports_coordinator', 'team_manager', 'head_coach', 'coach', 'assistant_coach')
    or (actor_role = 'sports_coordinator' and p_intended_role = 'sports_coordinator') then
    raise exception 'invalid_role' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.organisation_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.venue_id = p_venue_id
      and membership.status in ('pending', 'active', 'suspended')
      and membership.role = p_intended_role
      and lower(coalesce(profile.email, '')) = normalized_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  update public.organisation_invitations invitation
  set status = 'expired'
  where invitation.venue_id = p_venue_id
    and invitation.status = 'pending'
    and invitation.expires_at <= now();

  select invitation.token into existing_token
  from public.organisation_invitations invitation
  where invitation.venue_id = p_venue_id
    and lower(invitation.invited_email) = normalized_email
    and invitation.intended_role = p_intended_role
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by invitation.created_at desc
  limit 1;

  if existing_token is not null then
    return existing_token;
  end if;

  invite_kind := case
    when p_intended_role in ('head_coach', 'coach', 'assistant_coach') then 'coach'::public.organisation_invitation_kind
    else 'organisation_member'::public.organisation_invitation_kind
  end;

  insert into public.organisation_invitations (
    venue_id, invitation_kind, invited_email, invited_name, intended_role,
    invited_by_user_id, metadata
  ) values (
    p_venue_id, invite_kind, normalized_email,
    nullif(btrim(coalesce(p_invited_name, '')), ''), p_intended_role,
    actor_user_id, jsonb_build_object('source', 'teamr_people_access')
  ) returning token into invite_token;

  return invite_token;
end;
$$;

create function public.update_teamr_staff_role(
  p_venue_id uuid,
  p_membership_id uuid,
  p_role public.organisation_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organisation_role;
  target public.organisation_memberships;
begin
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  select membership.role into actor_role
  from public.organisation_memberships membership
  join public.venues venue on venue.id = membership.venue_id
  where membership.venue_id = p_venue_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
    and membership.role in ('organisation_admin', 'sports_coordinator')
    and venue.status = 'active'
    and venue.organisation_type in ('school', 'district', 'school_district')
  order by case membership.role when 'organisation_admin' then 1 else 2 end
  limit 1;

  if actor_user_id is null
    or (actor_role is null and not public.user_is_platform_admin(actor_user_id)) then
    raise exception 'access' using errcode = '42501';
  end if;

  select * into target
  from public.organisation_memberships membership
  where membership.id = p_membership_id
    and membership.venue_id = p_venue_id
    and membership.status in ('active', 'suspended')
  for update;

  if target.id is null
    or target.user_id = actor_user_id
    or target.role = 'organisation_admin'
    or p_role not in ('sports_coordinator', 'team_manager', 'head_coach', 'coach', 'assistant_coach')
    or (actor_role = 'sports_coordinator' and (target.role = 'sports_coordinator' or p_role = 'sports_coordinator')) then
    raise exception 'invalid_role_change' using errcode = '42501';
  end if;

  update public.organisation_memberships
  set role = p_role
  where id = target.id;
  return target.id;
end;
$$;

create function public.remove_teamr_staff_membership(
  p_venue_id uuid,
  p_membership_id uuid,
  p_confirm boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organisation_role;
  target public.organisation_memberships;
begin
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  select membership.role into actor_role
  from public.organisation_memberships membership
  join public.venues venue on venue.id = membership.venue_id
  where membership.venue_id = p_venue_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
    and membership.role in ('organisation_admin', 'sports_coordinator')
    and venue.status = 'active'
    and venue.organisation_type in ('school', 'district', 'school_district')
  order by case membership.role when 'organisation_admin' then 1 else 2 end
  limit 1;

  if not p_confirm or actor_user_id is null
    or (actor_role is null and not public.user_is_platform_admin(actor_user_id)) then
    raise exception 'access' using errcode = '42501';
  end if;

  select * into target
  from public.organisation_memberships membership
  where membership.id = p_membership_id
    and membership.venue_id = p_venue_id
    and membership.status in ('active', 'suspended')
  for update;

  if target.id is null
    or target.user_id = actor_user_id
    or target.role = 'organisation_admin'
    or (actor_role = 'sports_coordinator' and target.role = 'sports_coordinator') then
    raise exception 'invalid_membership' using errcode = '42501';
  end if;

  update public.organisation_memberships
  set status = 'removed', removed_at = now()
  where id = target.id;
  return target.id;
end;
$$;

create function public.cancel_teamr_staff_invitation(
  p_venue_id uuid,
  p_invitation_id uuid,
  p_confirm boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_role public.organisation_role;
  target public.organisation_invitations;
begin
  if not exists (
    select 1 from public.venues venue
    where venue.id = p_venue_id
      and venue.status = 'active'
      and venue.organisation_type in ('school', 'district', 'school_district')
  ) then
    raise exception 'invalid_venue' using errcode = '22023';
  end if;

  select membership.role into actor_role
  from public.organisation_memberships membership
  join public.venues venue on venue.id = membership.venue_id
  where membership.venue_id = p_venue_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
    and membership.role in ('organisation_admin', 'sports_coordinator')
    and venue.status = 'active'
    and venue.organisation_type in ('school', 'district', 'school_district')
  order by case membership.role when 'organisation_admin' then 1 else 2 end
  limit 1;

  if not p_confirm or actor_user_id is null
    or (actor_role is null and not public.user_is_platform_admin(actor_user_id)) then
    raise exception 'access' using errcode = '42501';
  end if;

  select * into target
  from public.organisation_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.venue_id = p_venue_id
    and invitation.status = 'pending'
    and invitation.invitation_kind in ('organisation_member', 'coach')
  for update;

  if target.id is null
    or target.intended_role not in ('sports_coordinator', 'team_manager', 'head_coach', 'coach', 'assistant_coach')
    or (actor_role = 'sports_coordinator' and target.intended_role = 'sports_coordinator') then
    raise exception 'invalid_invitation' using errcode = '42501';
  end if;

  update public.organisation_invitations
  set status = 'cancelled', cancelled_at = now()
  where id = target.id;
  return target.id;
end;
$$;

revoke all on function public.get_teamr_people(uuid) from public, anon;
revoke all on function public.create_teamr_staff_invitation(uuid, text, text, public.organisation_role) from public, anon;
revoke all on function public.update_teamr_staff_role(uuid, uuid, public.organisation_role) from public, anon;
revoke all on function public.remove_teamr_staff_membership(uuid, uuid, boolean) from public, anon;
revoke all on function public.cancel_teamr_staff_invitation(uuid, uuid, boolean) from public, anon;

grant execute on function public.get_teamr_people(uuid) to authenticated;
grant execute on function public.create_teamr_staff_invitation(uuid, text, text, public.organisation_role) to authenticated;
grant execute on function public.update_teamr_staff_role(uuid, uuid, public.organisation_role) to authenticated;
grant execute on function public.remove_teamr_staff_membership(uuid, uuid, boolean) to authenticated;
grant execute on function public.cancel_teamr_staff_invitation(uuid, uuid, boolean) to authenticated;

comment on function public.get_teamr_people(uuid) is
'Returns minimal canonical membership and pending invitation fields for an authorised School or District TeamR context.';
comment on function public.create_teamr_staff_invitation(uuid, text, text, public.organisation_role) is
'Invites an allowed School or District operational role without creating a TeamR-specific staff identity.';
