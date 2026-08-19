-- TeamR Phase 2A.2A: decouple ranking-context discovery from player
-- publication. Context rows expose public organisation identity only; the
-- canonical rankings RPC continues to decide which players may appear.

create or replace function private.get_public_playr_ranking_organisations(p_category text)
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
  with public_organisation_contexts as (
    -- Public, active organisations remain selectable even when their current
    -- leaderboard has zero approved player publications.
    select
      venue.id as organisation_id,
      venue.name as organisation_name,
      venue.organisation_type::text as organisation_type,
      scope.ranking_scope
    from public.venues venue
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
    where venue.status = 'active'
      and venue.discovery_visibility = 'public'
      and (
        scope.ranking_scope <> 'club'
        or venue.organisation_type = 'club'
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
  ), inherited_district_contexts as (
    -- A hidden District name may already be public School context: TeamR School
    -- discovery exposes it through an active discoverable School relationship.
    -- No District player link or published player is required here.
    select
      district.id as organisation_id,
      district.name as organisation_name,
      district.organisation_type::text as organisation_type,
      'district'::text as ranking_scope
    from public.venues school
    join public.organisation_relationships relationship
      on relationship.child_venue_id = school.id
     and relationship.relationship_type = 'belongs_to'
     and relationship.status = 'active'
    join public.venues district
      on district.id = relationship.parent_venue_id
     and district.status = 'active'
     and district.organisation_type in ('district', 'school_district')
    where school.status = 'active'
      and school.discovery_visibility = 'public'
      and school.organisation_type in ('school', 'school_district')
  ), published_legacy_contexts as (
    -- Club and Academy selectors historically included active contexts attached
    -- to an approved public ranking even when venue discovery was hidden. Keep
    -- those existing choices while also allowing explicitly public contexts
    -- above to exist with an empty leaderboard.
    select
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
      and context.ranking_scope in ('club', 'academy')
  )
  select distinct
    context.organisation_id,
    context.organisation_name,
    context.organisation_type,
    context.ranking_scope
  from (
    select * from public_organisation_contexts
    union all
    select * from inherited_district_contexts
    union all
    select * from published_legacy_contexts
  ) context
  order by context.ranking_scope, context.organisation_name, context.organisation_id;
end;
$$;

revoke all on function private.get_public_playr_ranking_organisations(text) from public, anon, authenticated;
grant execute on function private.get_public_playr_ranking_organisations(text) to authenticated;
revoke all on function public.get_public_playr_ranking_organisations(text) from public, anon;
grant execute on function public.get_public_playr_ranking_organisations(text) to authenticated;

comment on function public.get_public_playr_ranking_organisations(text) is
'Returns safe active ranking contexts independently of player publication. Ranking rows remain publication and safeguarding filtered by get_public_playr_rankings.';
