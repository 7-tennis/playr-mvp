-- Phase 2.2.2F: privacy-safe, authenticated PlayR-wide rankings.
--
-- Canonical rating and participation values remain on ratings/profiles. This
-- table contains only publication controls and public-safe identity fields.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.player_ranking_profiles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.profiles(id) on delete cascade,
  public_display_name text not null,
  ranking_category text not null,
  development_stage text,
  player_classification text not null,
  category_assignment text not null default 'automatic',
  publication_status text not null default 'pending',
  display_mode text not null default 'first_name_initial',
  public_region text,
  safeguarding_hidden boolean not null default false,
  safeguarding_reason text,
  safeguarding_updated_by uuid references auth.users(id) on delete set null,
  safeguarding_updated_at timestamptz,
  publication_approved_by uuid references auth.users(id) on delete set null,
  publication_approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_ranking_profiles_display_name_not_blank check (length(btrim(public_display_name)) > 0),
  constraint player_ranking_profiles_category_valid check (ranking_category in ('red', 'orange', 'green', 'open')),
  constraint player_ranking_profiles_stage_valid check (development_stage is null or development_stage in ('red', 'orange', 'green', 'yellow')),
  constraint player_ranking_profiles_classification_valid check (player_classification in ('junior', 'adult')),
  constraint player_ranking_profiles_assignment_valid check (category_assignment in ('automatic', 'manual')),
  constraint player_ranking_profiles_publication_valid check (publication_status in ('pending', 'approved', 'suspended')),
  constraint player_ranking_profiles_display_mode_valid check (display_mode in ('first_name_initial', 'full_name')),
  constraint player_ranking_profiles_junior_approval_audited check (
    publication_status <> 'approved' or player_classification = 'adult' or publication_approved_by is not null
  ),
  constraint player_ranking_profiles_safeguarding_reason check (not safeguarding_hidden or length(btrim(coalesce(safeguarding_reason, ''))) > 0)
);

create table if not exists private.player_ranking_publication_audit (
  id bigint generated always as identity primary key,
  ranking_profile_id uuid,
  player_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_user_id uuid,
  changed_at timestamptz not null default now(),
  previous_values jsonb,
  new_values jsonb
);

revoke all on private.player_ranking_publication_audit from public, anon, authenticated;

create or replace function private.audit_player_ranking_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.player_ranking_publication_audit (
    ranking_profile_id,
    player_id,
    action,
    actor_user_id,
    previous_values,
    new_values
  ) values (
    coalesce(new.id, old.id),
    coalesce(new.player_id, old.player_id),
    lower(tg_op),
    (select auth.uid()),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists player_ranking_profiles_audit on public.player_ranking_profiles;
create trigger player_ranking_profiles_audit
after insert or update or delete on public.player_ranking_profiles
for each row execute function private.audit_player_ranking_publication();

create index if not exists player_ranking_profiles_public_category_idx
on public.player_ranking_profiles(ranking_category, publication_status, safeguarding_hidden, updated_at desc);

create index if not exists player_ranking_profiles_region_idx
on public.player_ranking_profiles(public_region, ranking_category)
where publication_status = 'approved' and not safeguarding_hidden;

create index if not exists player_ranking_profiles_display_name_idx
on public.player_ranking_profiles(lower(public_display_name));

create index if not exists player_ranking_profiles_safeguarding_actor_idx
on public.player_ranking_profiles(safeguarding_updated_by)
where safeguarding_updated_by is not null;

create index if not exists player_ranking_profiles_publication_actor_idx
on public.player_ranking_profiles(publication_approved_by)
where publication_approved_by is not null;

drop trigger if exists player_ranking_profiles_set_updated_at on public.player_ranking_profiles;
create trigger player_ranking_profiles_set_updated_at
before update on public.player_ranking_profiles
for each row execute function public.set_updated_at();

create or replace function private.playr_ranking_category(
  profile_is_junior boolean,
  profile_junior_stage text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when not profile_is_junior then 'open'
    when profile_junior_stage = 'red_ball' then 'red'
    when profile_junior_stage = 'orange_ball' then 'orange'
    when profile_junior_stage = 'green_ball' then 'green'
    when profile_junior_stage = 'yellow_ball' then 'open'
    else 'red'
  end;
$$;

create or replace function private.playr_development_stage(
  profile_is_junior boolean,
  profile_junior_stage text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when not profile_is_junior then null
    when profile_junior_stage = 'red_ball' then 'red'
    when profile_junior_stage = 'orange_ball' then 'orange'
    when profile_junior_stage = 'green_ball' then 'green'
    when profile_junior_stage = 'yellow_ball' then 'yellow'
    else null
  end;
$$;

create or replace function private.playr_public_display_name(
  first_name text,
  last_name text,
  profile_is_junior boolean,
  requested_mode text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when profile_is_junior and coalesce(requested_mode, 'first_name_initial') <> 'full_name'
      then btrim(first_name) || case when length(btrim(coalesce(last_name, ''))) > 0 then ' ' || upper(left(btrim(last_name), 1)) || '.' else '' end
    else concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), ''))
  end;
$$;

create or replace function private.sync_player_ranking_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_mode text;
  existing_assignment text;
begin
  select ranking.display_mode, ranking.category_assignment
  into existing_mode, existing_assignment
  from public.player_ranking_profiles ranking
  where ranking.player_id = new.id;

  insert into public.player_ranking_profiles (
    player_id,
    public_display_name,
    ranking_category,
    development_stage,
    player_classification,
    display_mode
  ) values (
    new.id,
    private.playr_public_display_name(new.first_name, new.last_name, new.is_junior, case when new.is_junior then 'first_name_initial' else 'full_name' end),
    private.playr_ranking_category(new.is_junior, new.junior_stage),
    private.playr_development_stage(new.is_junior, new.junior_stage),
    case when new.is_junior then 'junior' else 'adult' end,
    case when new.is_junior then 'first_name_initial' else 'full_name' end
  )
  on conflict (player_id) do update set
    public_display_name = private.playr_public_display_name(
      new.first_name,
      new.last_name,
      new.is_junior,
      public.player_ranking_profiles.display_mode
    ),
    ranking_category = case
      when public.player_ranking_profiles.category_assignment = 'automatic'
        then private.playr_ranking_category(new.is_junior, new.junior_stage)
      else public.player_ranking_profiles.ranking_category
    end,
    development_stage = private.playr_development_stage(new.is_junior, new.junior_stage),
    player_classification = case when new.is_junior then 'junior' else 'adult' end,
    publication_status = case
      when not new.is_junior
        and public.player_ranking_profiles.publication_status = 'pending'
        and coalesce(new.participation_score, 0) > 0
        then 'approved'
      else public.player_ranking_profiles.publication_status
    end,
    publication_approved_at = case
      when not new.is_junior
        and public.player_ranking_profiles.publication_status = 'pending'
        and coalesce(new.participation_score, 0) > 0
        then coalesce(public.player_ranking_profiles.publication_approved_at, now())
      else public.player_ranking_profiles.publication_approved_at
    end,
    published_at = case
      when not new.is_junior
        and public.player_ranking_profiles.publication_status = 'pending'
        and coalesce(new.participation_score, 0) > 0
        then coalesce(public.player_ranking_profiles.published_at, now())
      else public.player_ranking_profiles.published_at
    end;

  return new;
end;
$$;

drop trigger if exists profiles_sync_player_ranking_profile on public.profiles;
create trigger profiles_sync_player_ranking_profile
after insert or update of first_name, last_name, is_junior, junior_stage, participation_score
on public.profiles
for each row execute function private.sync_player_ranking_profile();

create or replace function private.approve_active_adult_ranking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.verified_match_count, 0) > 0 then
    update public.player_ranking_profiles ranking
    set
      publication_status = 'approved',
      publication_approved_at = coalesce(ranking.publication_approved_at, now()),
      published_at = coalesce(ranking.published_at, now())
    from public.profiles profile
    where ranking.player_id = new.profile_id
      and profile.id = new.profile_id
      and not profile.is_junior
      and ranking.publication_status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists ratings_approve_active_adult_ranking on public.ratings;
create trigger ratings_approve_active_adult_ranking
after insert or update of verified_match_count on public.ratings
for each row execute function private.approve_active_adult_ranking();

insert into public.player_ranking_profiles (
  player_id,
  public_display_name,
  ranking_category,
  development_stage,
  player_classification,
  publication_status,
  display_mode,
  publication_approved_at,
  published_at
)
select
  profile.id,
  private.playr_public_display_name(
    profile.first_name,
    profile.last_name,
    profile.is_junior,
    case when profile.is_junior then 'first_name_initial' else 'full_name' end
  ),
  private.playr_ranking_category(profile.is_junior, profile.junior_stage),
  private.playr_development_stage(profile.is_junior, profile.junior_stage),
  case when profile.is_junior then 'junior' else 'adult' end,
  case
    when not profile.is_junior
      and (coalesce(profile.participation_score, 0) > 0 or coalesce(rating.verified_match_count, 0) > 0)
      then 'approved'
    else 'pending'
  end,
  case when profile.is_junior then 'first_name_initial' else 'full_name' end,
  case
    when not profile.is_junior
      and (coalesce(profile.participation_score, 0) > 0 or coalesce(rating.verified_match_count, 0) > 0)
      then now()
    else null
  end,
  case
    when not profile.is_junior
      and (coalesce(profile.participation_score, 0) > 0 or coalesce(rating.verified_match_count, 0) > 0)
      then now()
    else null
  end
from public.profiles profile
left join public.ratings rating on rating.profile_id = profile.id
on conflict (player_id) do nothing;

alter table public.player_ranking_profiles enable row level security;
revoke all on public.player_ranking_profiles from anon, authenticated;
grant select, insert, update, delete on public.player_ranking_profiles to authenticated;

drop policy if exists "Platform admins manage ranking publication" on public.player_ranking_profiles;
create policy "Platform admins manage ranking publication"
on public.player_ranking_profiles
for all
to authenticated
using (public.user_is_platform_admin((select auth.uid())))
with check (public.user_is_platform_admin((select auth.uid())));

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
      greatest(
        publication.updated_at,
        profile.updated_at,
        coalesce(rating.updated_at, publication.updated_at),
        coalesce(profile.last_rating_update, publication.updated_at)
      ) as ranking_updated_at,
      public.can_manage_profile(publication.player_id, (select auth.uid())) as is_managed
    from public.player_ranking_profiles publication
    join public.profiles profile on profile.id = publication.player_id
    left join public.ratings rating on rating.profile_id = profile.id
    left join lateral (
      select
        string_agg(venue.name, ', ' order by venue.name) as organisation_summary,
        array_agg(venue.id) as organisation_ids
      from public.organisation_player_links link
      join public.venues venue on venue.id = link.venue_id
      where link.player_profile_id = publication.player_id
        and link.status = 'active'
        and venue.status = 'active'
    ) organisation on true
    where publication.publication_status = 'approved'
      and not publication.safeguarding_hidden
      and publication.ranking_category = p_category
      and (p_classification is null or publication.player_classification = p_classification)
      and (p_region is null or publication.public_region = p_region)
      and (p_organisation_id is null or p_organisation_id = any(organisation.organisation_ids))
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or publication.public_display_name ilike '%' || btrim(p_search) || '%'
        or organisation.organisation_summary ilike '%' || btrim(p_search) || '%'
      )
      and (
        (p_metric = 'participation' and profile.participation_score > 0)
        or (p_metric = 'rating' and publication.player_classification = 'adult' and rating.rating_value is not null)
        or (p_metric = 'rating' and publication.player_classification = 'junior' and profile.junior_rating is not null)
      )
  ),
  ranked as (
    select
      public_rows.*,
      dense_rank() over (order by public_rows.metric_value desc) as ranking_position,
      count(*) over () as total_count
    from public_rows
  )
  select
    ranked.ranking_profile_id,
    ranked.public_display_name,
    ranked.ranking_category,
    ranked.development_stage,
    ranked.player_classification,
    ranked.organisation_summary,
    ranked.public_region,
    ranked.metric_value,
    ranked.events_played,
    ranked.matches_played,
    ranked.ranking_position,
    ranked.total_count,
    ranked.ranking_updated_at,
    ranked.is_managed
  from ranked
  order by ranked.ranking_position, ranked.public_display_name, ranked.ranking_profile_id
  limit safe_limit
  offset safe_offset;
end;
$$;

create or replace function private.get_public_playr_ranking_organisations(p_category text)
returns table (organisation_id uuid, organisation_name text, organisation_type text)
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
  select distinct venue.id, venue.name, venue.organisation_type
  from public.player_ranking_profiles publication
  join public.organisation_player_links link on link.player_profile_id = publication.player_id and link.status = 'active'
  join public.venues venue on venue.id = link.venue_id and venue.status = 'active'
  where publication.publication_status = 'approved'
    and not publication.safeguarding_hidden
    and publication.ranking_category = p_category
  order by venue.organisation_type, venue.name, venue.id;
end;
$$;

create or replace function private.get_public_playr_ranking_regions(p_category text)
returns table (region text)
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
  select distinct publication.public_region
  from public.player_ranking_profiles publication
  where publication.publication_status = 'approved'
    and not publication.safeguarding_hidden
    and publication.ranking_category = p_category
    and nullif(btrim(publication.public_region), '') is not null
  order by publication.public_region;
end;
$$;

create or replace function private.get_public_event_entry_counts(p_event_ids uuid[])
returns table (event_id uuid, entry_count integer)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_event_ids), 0) > 200 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;

  return query
  select requested.event_id, count(entry.id)::integer
  from unnest(coalesce(p_event_ids, array[]::uuid[])) requested(event_id)
  join public.events event on event.id = requested.event_id and event.status = 'published'
  left join public.event_entries entry on entry.event_id = event.id and entry.entry_status <> 'cancelled'
  group by requested.event_id;
end;
$$;

create or replace function public.get_public_playr_rankings(
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
    p_offset
  );
$$;

create or replace function public.get_public_playr_ranking_organisations(p_category text)
returns table (organisation_id uuid, organisation_name text, organisation_type text)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_public_playr_ranking_organisations(p_category);
$$;

create or replace function public.get_public_playr_ranking_regions(p_category text)
returns table (region text)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_public_playr_ranking_regions(p_category);
$$;

create or replace function public.get_public_event_entry_counts(p_event_ids uuid[])
returns table (event_id uuid, entry_count integer)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from private.get_public_event_entry_counts(p_event_ids);
$$;

revoke all on function private.playr_ranking_category(boolean, text) from public, anon, authenticated;
revoke all on function private.playr_development_stage(boolean, text) from public, anon, authenticated;
revoke all on function private.playr_public_display_name(text, text, boolean, text) from public, anon, authenticated;
revoke all on function private.sync_player_ranking_profile() from public, anon, authenticated;
revoke all on function private.approve_active_adult_ranking() from public, anon, authenticated;
revoke all on function private.audit_player_ranking_publication() from public, anon, authenticated;

revoke all on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.get_public_playr_ranking_organisations(text) from public, anon, authenticated;
revoke all on function private.get_public_playr_ranking_regions(text) from public, anon, authenticated;
revoke all on function private.get_public_event_entry_counts(uuid[]) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer) to authenticated;
grant execute on function private.get_public_playr_ranking_organisations(text) to authenticated;
grant execute on function private.get_public_playr_ranking_regions(text) to authenticated;
grant execute on function private.get_public_event_entry_counts(uuid[]) to authenticated;

revoke all on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer) from public, anon;
revoke all on function public.get_public_playr_ranking_organisations(text) from public, anon;
revoke all on function public.get_public_playr_ranking_regions(text) from public, anon;
revoke all on function public.get_public_event_entry_counts(uuid[]) from public, anon;
grant execute on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.get_public_playr_ranking_organisations(text) to authenticated;
grant execute on function public.get_public_playr_ranking_regions(text) to authenticated;
grant execute on function public.get_public_event_entry_counts(uuid[]) to authenticated;

comment on table public.player_ranking_profiles is
'Publication controls and public-safe identity for authenticated PlayR-wide rankings. Canonical scores remain on profiles and ratings.';

comment on column public.player_ranking_profiles.safeguarding_reason is
'Private staff-only rationale. Never returned by public ranking RPCs.';

comment on function public.get_public_playr_rankings(text, text, uuid, text, text, text, integer, integer) is
'Returns only approved public ranking fields. Excludes suspended and safeguarding-hidden records and never returns profile or user IDs.';
