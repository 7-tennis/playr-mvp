-- TeamR Phase 2A.2: ranking scope persistence and School -> District inheritance.
-- Rankings continue to use the canonical player publication, rating and
-- participation values. This migration changes eligibility only; it creates no
-- District player link and stores no District-specific ranking record.

create function private.get_playr_ranking_contexts(p_player_profile_id uuid)
returns table (
  ranking_scope text,
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  school_affiliation text
)
language sql
security invoker
stable
set search_path = ''
as $$
  -- Direct active player links supply School, Club, Academy and direct District
  -- contexts. Hybrid types intentionally expose each capability they support.
  select distinct
    scope.ranking_scope,
    venue.id,
    venue.name,
    venue.organisation_type::text,
    null::text as school_affiliation
  from public.organisation_player_links link
  join public.venues venue
    on venue.id = link.venue_id
   and venue.status = 'active'
  cross join lateral unnest(
    case venue.organisation_type::text
      when 'school' then array['school']::text[]
      when 'club' then array['club']::text[]
      when 'academy' then array['academy']::text[]
      when 'club_academy' then array['club', 'academy']::text[]
      when 'district' then array['district']::text[]
      when 'school_district' then array['school', 'district']::text[]
      else array[]::text[]
    end
  ) scope(ranking_scope)
  where link.player_profile_id = p_player_profile_id
    and link.status = 'active'

  union

  -- District context is inherited from the player's active School link and the
  -- School's current active belongs_to relationship. No direct District player
  -- relationship is required.
  select distinct
    'district'::text,
    district.id,
    district.name,
    district.organisation_type::text,
    school.name
  from public.organisation_player_links link
  join public.venues school
    on school.id = link.venue_id
   and school.status = 'active'
   and school.organisation_type in ('school', 'school_district')
  join public.organisation_relationships relationship
    on relationship.child_venue_id = school.id
   and relationship.relationship_type = 'belongs_to'
   and relationship.status = 'active'
  join public.venues district
    on district.id = relationship.parent_venue_id
   and district.status = 'active'
   and district.organisation_type in ('district', 'school_district')
  where link.player_profile_id = p_player_profile_id
    and link.status = 'active';
$$;

revoke all on function private.get_playr_ranking_contexts(uuid) from public, anon, authenticated;

-- The return shape and signature are extended, so the public wrapper must be
-- removed before its private dependency. The trailing default keeps existing
-- callers compatible while allowing the Rankings page to send an explicit scope.
drop function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer);
drop function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer);

create function private.get_public_playr_rankings(
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
  select ranked.ranking_profile_id, ranked.public_display_name, ranked.ranking_category,
    ranked.development_stage, ranked.player_classification, ranked.organisation_summary,
    ranked.school_affiliation, ranked.public_region, ranked.metric_value,
    ranked.events_played, ranked.matches_played, ranked.ranking_position,
    ranked.total_count, ranked.ranking_updated_at, ranked.is_managed
  from ranked
  order by ranked.ranking_position, ranked.public_display_name, ranked.ranking_profile_id
  limit safe_limit offset safe_offset;
end;
$$;

create function public.get_public_playr_rankings(
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
security invoker
stable
set search_path = ''
as $$
  select * from private.get_public_playr_rankings(
    p_category,
    p_metric,
    p_organisation_id,
    p_region,
    p_classification,
    p_search,
    p_limit,
    p_offset,
    p_scope
  );
$$;

revoke all on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) to authenticated;
revoke all on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) to authenticated;

comment on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer, text) is
'Returns approved public ranking fields for a validated scope. District eligibility may be inherited through an active player-School link and active School belongs_to District relationship.';

-- Ranking context choices must include inherited Districts and must distinguish
-- hybrid capabilities, so the existing filter function gains ranking_scope.
drop function public.get_public_playr_ranking_organisations(text);
drop function private.get_public_playr_ranking_organisations(text);

create function private.get_public_playr_ranking_organisations(p_category text)
returns table (organisation_id uuid, organisation_name text, organisation_type text, ranking_scope text)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_category not in ('red', 'orange', 'green', 'open') then
    raise exception 'invalid_ranking_category' using errcode = '22023';
  end if;

  return query
  select distinct
    context.organisation_id,
    context.organisation_name,
    context.organisation_type,
    context.ranking_scope
  from public.player_ranking_profiles publication
  join public.profiles profile
    on profile.id = publication.player_id
   and profile.member_status <> 'inactive'
  cross join lateral private.get_playr_ranking_contexts(publication.player_id) context
  where publication.publication_status = 'approved'
    and not publication.safeguarding_hidden
    and publication.ranking_category = p_category
  order by context.ranking_scope, context.organisation_name, context.organisation_id;
end;
$$;

create function public.get_public_playr_ranking_organisations(p_category text)
returns table (organisation_id uuid, organisation_name text, organisation_type text, ranking_scope text)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_public_playr_ranking_organisations(p_category);
$$;

revoke all on function private.get_public_playr_ranking_organisations(text) from public, anon, authenticated;
grant execute on function private.get_public_playr_ranking_organisations(text) to authenticated;
revoke all on function public.get_public_playr_ranking_organisations(text) from public, anon;
grant execute on function public.get_public_playr_ranking_organisations(text) to authenticated;

comment on function public.get_public_playr_ranking_organisations(text) is
'Returns only ranking contexts represented by approved public players, including District contexts inherited from active School relationships.';
