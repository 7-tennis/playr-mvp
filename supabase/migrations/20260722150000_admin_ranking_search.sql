-- Phase 2.2.2G follow-up: bounded platform-admin ranking search.
-- The UI can continue to use the RLS-protected table while this forward
-- migration is deployed; this RPC provides one auditable, privacy-minimised
-- query surface for hosted validation and future loader consolidation.

create or replace function public.get_admin_player_ranking_profiles(
  p_status text default 'pending',
  p_category text default null,
  p_classification text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  ranking_profile_id uuid,
  public_display_name text,
  ranking_category text,
  development_stage text,
  player_classification text,
  publication_status text,
  safeguarding_hidden boolean,
  organisation_summary text,
  public_region text,
  rating_value numeric,
  participation_score integer,
  events_played integer,
  matches_played integer,
  member_status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  safe_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  safe_search text := nullif(left(btrim(coalesce(p_search, '')), 100), '');
begin
  if (select auth.uid()) is null or not public.user_is_platform_admin((select auth.uid())) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'hidden', 'rejected', 'suspended', 'all') then
    raise exception 'invalid_publication_status' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('red', 'orange', 'green', 'open') then
    raise exception 'invalid_ranking_category' using errcode = '22023';
  end if;
  if p_classification is not null and p_classification not in ('junior', 'adult') then
    raise exception 'invalid_player_classification' using errcode = '22023';
  end if;

  return query
  select
    publication.id,
    publication.public_display_name,
    publication.ranking_category,
    publication.development_stage,
    publication.player_classification,
    publication.publication_status,
    publication.safeguarding_hidden,
    organisation.organisation_summary,
    publication.public_region,
    case when publication.player_classification = 'adult' then rating.rating_value else profile.junior_rating end,
    profile.participation_score,
    profile.events_played,
    case when publication.player_classification = 'adult' then coalesce(rating.verified_match_count, 0) else profile.matches_played end,
    profile.member_status::text,
    publication.created_at,
    publication.updated_at,
    count(*) over ()
  from public.player_ranking_profiles publication
  join public.profiles profile on profile.id = publication.player_id
  left join public.ratings rating on rating.profile_id = publication.player_id
  left join lateral (
    select string_agg(venue.name || ' (' || initcap(replace(venue.organisation_type::text, '_', ' ')) || ')', ', ' order by venue.name) as organisation_summary
    from public.organisation_player_links link
    join public.venues venue on venue.id = link.venue_id
    where link.player_profile_id = publication.player_id
      and link.status = 'active'
      and venue.status = 'active'
  ) organisation on true
  where (
      p_status = 'all'
      or (p_status = 'hidden' and publication.safeguarding_hidden)
      or (p_status <> 'hidden' and publication.publication_status = p_status and not publication.safeguarding_hidden)
    )
    and (p_category is null or publication.ranking_category = p_category)
    and (p_classification is null or publication.player_classification = p_classification)
    and (safe_search is null or publication.public_display_name ilike '%' || safe_search || '%')
  order by publication.updated_at desc, publication.id
  limit safe_limit
  offset safe_offset;
end;
$$;

revoke all on function public.get_admin_player_ranking_profiles(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_admin_player_ranking_profiles(text, text, text, text, integer, integer) to authenticated;

comment on function public.get_admin_player_ranking_profiles(text, text, text, text, integer, integer) is
'Returns a bounded, privacy-minimised ranking publication queue only to the current platform administrator.';
