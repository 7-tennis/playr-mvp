-- Phase 2.2.2G: minimum ranking publication administration.
--
-- This migration is intentionally forward-only because the Phase 2.2.2F
-- publication schema is already deployed. Canonical ratings, participation
-- totals, player stages and organisation links are not modified here.

alter table public.player_ranking_profiles
  drop constraint if exists player_ranking_profiles_publication_valid;

alter table public.player_ranking_profiles
  add constraint player_ranking_profiles_publication_valid
  check (publication_status in ('pending', 'approved', 'rejected', 'suspended'));

alter table public.player_ranking_profiles
  add column if not exists publication_internal_reason text;

alter table public.player_ranking_profiles
  drop constraint if exists player_ranking_profiles_internal_reason_length;

alter table public.player_ranking_profiles
  add constraint player_ranking_profiles_internal_reason_length
  check (publication_internal_reason is null or length(publication_internal_reason) <= 500);

create or replace function public.admin_update_player_ranking_publication(
  p_ranking_profile_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  safe_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  target public.player_ranking_profiles%rowtype;
begin
  if actor_user_id is null or not public.user_is_platform_admin(actor_user_id) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'hide', 'restore', 'suspend') then
    raise exception 'invalid_publication_action' using errcode = '22023';
  end if;

  select * into target
  from public.player_ranking_profiles
  where id = p_ranking_profile_id
  for update;

  if not found then
    raise exception 'ranking_profile_not_found' using errcode = 'P0002';
  end if;

  if p_action in ('reject', 'hide', 'suspend') and safe_reason is null then
    raise exception 'publication_reason_required' using errcode = '22023';
  end if;

  if p_action = 'approve' then
    update public.player_ranking_profiles
    set publication_status = 'approved',
        publication_approved_by = actor_user_id,
        publication_approved_at = now(),
        published_at = coalesce(published_at, now()),
        publication_internal_reason = null,
        safeguarding_reason = case when safeguarding_hidden then safeguarding_reason else null end
    where id = p_ranking_profile_id;
  elsif p_action = 'reject' then
    update public.player_ranking_profiles
    set publication_status = 'rejected',
        publication_approved_by = null,
        publication_approved_at = null,
        published_at = null,
        publication_internal_reason = safe_reason
    where id = p_ranking_profile_id;
  elsif p_action = 'suspend' then
    update public.player_ranking_profiles
    set publication_status = 'suspended',
        publication_internal_reason = safe_reason
    where id = p_ranking_profile_id;
  elsif p_action = 'hide' then
    update public.player_ranking_profiles
    set safeguarding_hidden = true,
        safeguarding_reason = safe_reason,
        safeguarding_updated_by = actor_user_id,
        safeguarding_updated_at = now()
    where id = p_ranking_profile_id;
  else
    update public.player_ranking_profiles
    set safeguarding_hidden = false,
        safeguarding_reason = null,
        safeguarding_updated_by = actor_user_id,
        safeguarding_updated_at = now(),
        publication_status = case
          when publication_status = 'suspended' then 'pending'
          else publication_status
        end,
        publication_internal_reason = case
          when publication_status = 'suspended' then null
          else publication_internal_reason
        end
    where id = p_ranking_profile_id;
  end if;
end;
$$;

create or replace function public.get_admin_player_ranking_audit(
  p_ranking_profile_id uuid,
  p_limit integer default 30
)
returns table (
  action text,
  previous_status text,
  new_status text,
  previous_hidden boolean,
  new_hidden boolean,
  actor_display_name text,
  internal_reason text,
  changed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.user_is_platform_admin((select auth.uid())) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  return query
  select
    case
      when (audit.previous_values ->> 'safeguarding_hidden')::boolean is distinct from true
        and (audit.new_values ->> 'safeguarding_hidden')::boolean = true then 'hide'
      when (audit.previous_values ->> 'safeguarding_hidden')::boolean = true
        and (audit.new_values ->> 'safeguarding_hidden')::boolean is distinct from true then 'restore'
      when audit.previous_values ->> 'publication_status' is distinct from audit.new_values ->> 'publication_status'
        then case audit.new_values ->> 'publication_status'
          when 'approved' then 'approve'
          when 'rejected' then 'reject'
          when 'suspended' then 'suspend'
          else 'update'
        end
      else audit.action
    end,
    audit.previous_values ->> 'publication_status',
    audit.new_values ->> 'publication_status',
    (audit.previous_values ->> 'safeguarding_hidden')::boolean,
    (audit.new_values ->> 'safeguarding_hidden')::boolean,
    coalesce(nullif(concat_ws(' ', actor.first_name, actor.last_name), ''), 'Platform administrator'),
    coalesce(
      audit.new_values ->> 'publication_internal_reason',
      audit.new_values ->> 'safeguarding_reason',
      audit.previous_values ->> 'publication_internal_reason',
      audit.previous_values ->> 'safeguarding_reason'
    ),
    audit.changed_at
  from private.player_ranking_publication_audit audit
  left join public.profiles actor on actor.user_id = audit.actor_user_id and not actor.is_junior
  where audit.ranking_profile_id = p_ranking_profile_id
  order by audit.changed_at desc, audit.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.admin_update_player_ranking_publication(uuid, text, text) from public, anon;
revoke all on function public.get_admin_player_ranking_audit(uuid, integer) from public, anon;
grant execute on function public.admin_update_player_ranking_publication(uuid, text, text) to authenticated;
grant execute on function public.get_admin_player_ranking_audit(uuid, integer) to authenticated;

comment on function public.admin_update_player_ranking_publication(uuid, text, text) is
'Atomically applies an authorised platform-admin publication action. The existing trigger writes the immutable private audit record.';

comment on function public.get_admin_player_ranking_audit(uuid, integer) is
'Returns a bounded publication audit history only to the current platform administrator.';

-- Bound search before evaluating ILIKE. The public RPC remains authenticated,
-- category/metric constrained, paginated and free of private profile IDs.
create or replace function private.get_public_playr_rankings(
  p_category text,
  p_metric text default 'rating',
  p_organisation_id uuid default null,
  p_region text default null,
  p_classification text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  ranking_profile_id uuid,
  public_display_name text,
  ranking_category text,
  development_stage text,
  player_classification text,
  organisation_summary text,
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

  return query
  with public_rows as (
    select
      publication.id as ranking_profile_id,
      publication.public_display_name,
      publication.ranking_category,
      publication.development_stage,
      publication.player_classification,
      organisation.organisation_summary,
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
      select string_agg(venue.name, ', ' order by venue.name) as organisation_summary,
             array_agg(venue.id) as organisation_ids
      from public.organisation_player_links link
      join public.venues venue on venue.id = link.venue_id
      where link.player_profile_id = publication.player_id
        and link.status = 'active'
        and venue.status = 'active'
    ) organisation on true
    where publication.publication_status = 'approved'
      and not publication.safeguarding_hidden
      and profile.member_status <> 'inactive'
      and publication.ranking_category = p_category
      and (p_classification is null or publication.player_classification = p_classification)
      and (p_region is null or publication.public_region = p_region)
      and (p_organisation_id is null or p_organisation_id = any(organisation.organisation_ids))
      and (safe_search is null or publication.public_display_name ilike '%' || safe_search || '%' or organisation.organisation_summary ilike '%' || safe_search || '%')
      and ((p_metric = 'participation' and profile.participation_score > 0)
        or (p_metric = 'rating' and publication.player_classification = 'adult' and rating.rating_value is not null)
        or (p_metric = 'rating' and publication.player_classification = 'junior' and profile.junior_rating is not null))
  ), ranked as (
    select public_rows.*, dense_rank() over (order by public_rows.metric_value desc) as ranking_position, count(*) over () as total_count
    from public_rows
  )
  select ranked.ranking_profile_id, ranked.public_display_name, ranked.ranking_category,
    ranked.development_stage, ranked.player_classification, ranked.organisation_summary,
    ranked.public_region, ranked.metric_value, ranked.events_played, ranked.matches_played,
    ranked.ranking_position, ranked.total_count, ranked.ranking_updated_at, ranked.is_managed
  from ranked
  order by ranked.ranking_position, ranked.public_display_name, ranked.ranking_profile_id
  limit safe_limit offset safe_offset;
end;
$$;
