-- TeamR Phase 2A.2B: expose managed Junior School and District rank summaries
-- from the canonical public leaderboard calculation. No rank is persisted and
-- no organisation relationship is created by this migration.

create function private.get_public_playr_rankings_core(
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
      and ((p_metric = 'participation' and profile.participation_score > 0)
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

-- Keep the public leaderboard contract unchanged while making its exact ranked
-- dataset reusable by the connected-summary RPC below.
create or replace function private.get_public_playr_rankings(
  p_category text,
  p_metric text default 'rating',
  p_organisation_id uuid default null,
  p_region text default null,
  p_classification text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_scope text default 'overall'
)
returns table (
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
language sql
security definer
stable
set search_path = ''
as $$
  select
    ranking.ranking_profile_id,
    ranking.public_display_name,
    ranking.ranking_category,
    ranking.development_stage,
    ranking.player_classification,
    ranking.organisation_summary,
    ranking.school_affiliation,
    ranking.public_region,
    ranking.metric_value,
    ranking.events_played,
    ranking.matches_played,
    ranking.ranking_position,
    ranking.total_count,
    ranking.updated_at,
    ranking.is_managed
  from private.get_public_playr_rankings_core(
    p_category,
    p_metric,
    p_organisation_id,
    p_region,
    p_classification,
    p_search,
    p_limit,
    p_offset,
    p_scope,
    null
  ) ranking;
$$;

revoke all on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) to authenticated;

create function private.get_managed_playr_connected_rankings(p_player_profile_ids uuid[])
returns table (
  player_profile_id uuid,
  ranking_scope text,
  organisation_id uuid,
  organisation_name text,
  ranking_category text,
  ranking_metric text,
  ranking_position bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  requested_player_ids uuid[];
  requested_count integer;
  managed_count integer;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct requested_id), array[]::uuid[])
  into requested_player_ids
  from unnest(coalesce(p_player_profile_ids, array[]::uuid[])) as requested(requested_id)
  where requested_id is not null;

  requested_count := cardinality(requested_player_ids);
  if requested_count > 50 then
    raise exception 'too_many_player_profiles' using errcode = '22023';
  end if;
  if requested_count = 0 then
    return;
  end if;

  select count(*)
  into managed_count
  from public.profiles profile
  where profile.id = any(requested_player_ids)
    and profile.is_junior
    and public.can_manage_profile(profile.id, actor_user_id);

  if managed_count <> requested_count then
    raise exception 'profile_access' using errcode = '42501';
  end if;

  return query
  with requested_players as (
    select
      profile.id as player_profile_id,
      private.playr_ranking_category(profile.is_junior, profile.junior_stage::text) as ranking_category
    from public.profiles profile
    where profile.id = any(requested_player_ids)
  ), canonical_school_contexts as (
    -- Match the existing Junior profile rule: the first active School context,
    -- ordered by School name. The data model can hold links to different School
    -- venues, but Phase 2A currently presents one current School context.
    select
      player.player_profile_id,
      player.ranking_category,
      school_context.school_id,
      school_context.school_name,
      school_context.district_id,
      school_context.district_name
    from requested_players player
    cross join lateral (
      select
        context.school_id,
        context.school_name,
        context.district_id,
        context.district_name
      from public.teamr_school_context(player.player_profile_id) context
      where context.school_link_status = 'active'
      order by context.school_name, context.school_id
      limit 1
    ) school_context
  ), ranking_contexts as (
    select
      player.player_profile_id,
      player.ranking_category,
      context.ranking_scope,
      context.organisation_id,
      context.organisation_name
    from canonical_school_contexts player
    cross join lateral (
      values
        ('school'::text, player.school_id, player.school_name),
        ('district'::text, player.district_id, player.district_name)
    ) context(ranking_scope, organisation_id, organisation_name)
    where context.organisation_id is not null
  )
  select
    context.player_profile_id,
    context.ranking_scope,
    context.organisation_id,
    context.organisation_name,
    context.ranking_category,
    case when context.ranking_category in ('red', 'orange') then 'participation' else 'rating' end as ranking_metric,
    ranking.ranking_position
  from ranking_contexts context
  cross join lateral private.get_public_playr_rankings_core(
    context.ranking_category,
    case when context.ranking_category in ('red', 'orange') then 'participation' else 'rating' end,
    context.organisation_id,
    null,
    case when context.ranking_category = 'open' then 'junior' else null end,
    null,
    1,
    0,
    context.ranking_scope,
    array[context.player_profile_id]
  ) ranking
  order by context.player_profile_id, context.ranking_scope, context.organisation_name, context.organisation_id;
end;
$$;

create function public.get_managed_playr_connected_rankings(p_player_profile_ids uuid[])
returns table (
  player_profile_id uuid,
  ranking_scope text,
  organisation_id uuid,
  organisation_name text,
  ranking_category text,
  ranking_metric text,
  ranking_position bigint
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_managed_playr_connected_rankings(p_player_profile_ids);
$$;

revoke all on function private.get_managed_playr_connected_rankings(uuid[]) from public, anon, authenticated;
grant execute on function private.get_managed_playr_connected_rankings(uuid[]) to authenticated;
revoke all on function public.get_managed_playr_connected_rankings(uuid[]) from public, anon;
grant execute on function public.get_managed_playr_connected_rankings(uuid[]) to authenticated;

comment on function public.get_managed_playr_connected_rankings(uuid[]) is
'Returns canonical published School and inherited District rank positions for authenticated users managed Junior profiles. The current School follows the existing TeamR School-context ordering. Pending and safeguarding-hidden publications produce no row.';
