create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  junior_profile_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_valid check (
    type in (
      'match_invite_received',
      'match_invite_accepted',
      'match_invite_declined',
      'match_invite_reminder',
      'court_booking_confirmed',
      'upcoming_booking_reminder',
      'event_entry_confirmed',
      'event_reminder',
      'rating_updated',
      'badge_unlocked',
      'leaderboard_changed',
      'membership_renewal',
      'shop_reservation_update'
    )
  ),
  constraint notifications_title_message_not_blank check (
    length(btrim(title)) > 0
    and length(btrim(message)) > 0
  ),
  constraint notifications_href_internal check (
    href is null
    or (href like '/%' and href not like '//%')
  ),
  constraint notifications_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists notifications_user_created_idx
on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_created_idx
on public.notifications(user_id, created_at desc)
where read_at is null;

create index if not exists notifications_type_created_idx
on public.notifications(type, created_at desc);

create unique index if not exists notifications_user_dedupe_key_unique
on public.notifications(user_id, dedupe_key)
where dedupe_key is not null;

alter table public.notifications enable row level security;

grant select, insert, update on public.notifications to authenticated;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can create their own notifications" on public.notifications;
create policy "Users can create their own notifications"
on public.notifications
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own notification read state" on public.notifications;
create policy "Users can update their own notification read state"
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.protect_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.actor_user_id is distinct from old.actor_user_id
    or new.profile_id is distinct from old.profile_id
    or new.junior_profile_id is distinct from old.junior_profile_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.href is distinct from old.href
    or new.metadata is distinct from old.metadata
    or new.dedupe_key is distinct from old.dedupe_key
    or new.created_at is distinct from old.created_at then
    raise exception 'Only notification read state can be updated';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_protect_update on public.notifications;
create trigger notifications_protect_update
before update on public.notifications
for each row execute function public.protect_notification_update();

create or replace function public.notification_profile_owner(check_profile_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select case
    when profile.is_junior then parent.user_id
    else profile.user_id
  end
  from public.profiles profile
  left join public.profiles parent
    on parent.id = profile.parent_profile_id
  where profile.id = check_profile_id
  limit 1;
$$;

create or replace function public.notification_profile_name(check_profile_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(profile.first_name || ' ' || profile.last_name, 'A player')
  from public.profiles profile
  where profile.id = check_profile_id
  limit 1;
$$;

create or replace function public.notification_profile_is_junior(check_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(profile.is_junior, false)
  from public.profiles profile
  where profile.id = check_profile_id
  limit 1;
$$;

create or replace function public.create_system_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_href text default null,
  notification_actor_user_id uuid default null,
  notification_profile_id uuid default null,
  notification_junior_profile_id uuid default null,
  notification_metadata jsonb default '{}'::jsonb,
  notification_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if target_user_id is null then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    profile_id,
    junior_profile_id,
    type,
    title,
    message,
    href,
    metadata,
    dedupe_key
  )
  values (
    target_user_id,
    notification_actor_user_id,
    notification_profile_id,
    notification_junior_profile_id,
    notification_type,
    notification_title,
    notification_message,
    notification_href,
    coalesce(notification_metadata, '{}'::jsonb),
    notification_dedupe_key
  )
  on conflict do nothing
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.notify_match_invite_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  opponent_is_junior boolean;
  inviter_name text;
  opponent_name text;
begin
  target_user_id := public.notification_profile_owner(new.opponent_profile_id);
  opponent_is_junior := public.notification_profile_is_junior(new.opponent_profile_id);
  inviter_name := public.notification_profile_name(new.inviter_profile_id);
  opponent_name := public.notification_profile_name(new.opponent_profile_id);

  if target_user_id is null or target_user_id = new.invited_by_user_id then
    return new;
  end if;

  perform public.create_system_notification(
    target_user_id,
    'match_invite_received',
    'New match invite',
    inviter_name || ' invited ' || opponent_name || ' to play.',
    '/dashboard/play',
    new.invited_by_user_id,
    new.opponent_profile_id,
    case when opponent_is_junior then new.opponent_profile_id else null end,
    jsonb_build_object(
      'match_invite_id', new.id,
      'booking_id', new.booking_id,
      'inviter_profile_id', new.inviter_profile_id,
      'opponent_profile_id', new.opponent_profile_id
    ),
    'match_invite_received:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists match_invites_notify_created on public.match_invites;
create trigger match_invites_notify_created
after insert on public.match_invites
for each row execute function public.notify_match_invite_created();

create or replace function public.notify_match_invite_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  responder_user_id uuid;
  opponent_name text;
  inviter_name text;
  response_label text;
begin
  if old.status = new.status or new.status not in ('accepted', 'declined') then
    return new;
  end if;

  responder_user_id := public.notification_profile_owner(new.opponent_profile_id);
  opponent_name := public.notification_profile_name(new.opponent_profile_id);
  inviter_name := public.notification_profile_name(new.inviter_profile_id);
  response_label := case when new.status = 'accepted' then 'accepted' else 'declined' end;

  if new.invited_by_user_id is null then
    return new;
  end if;

  perform public.create_system_notification(
    new.invited_by_user_id,
    case when new.status = 'accepted' then 'match_invite_accepted' else 'match_invite_declined' end,
    case when new.status = 'accepted' then 'Match invite accepted' else 'Match invite declined' end,
    opponent_name || ' ' || response_label || ' your match invite for ' || inviter_name || '.',
    '/dashboard/play',
    responder_user_id,
    new.inviter_profile_id,
    case when public.notification_profile_is_junior(new.inviter_profile_id) then new.inviter_profile_id else null end,
    jsonb_build_object(
      'match_invite_id', new.id,
      'booking_id', new.booking_id,
      'inviter_profile_id', new.inviter_profile_id,
      'opponent_profile_id', new.opponent_profile_id,
      'status', new.status
    ),
    'match_invite_' || new.status::text || ':' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists match_invites_notify_response on public.match_invites;
create trigger match_invites_notify_response
after update of status on public.match_invites
for each row execute function public.notify_match_invite_response();

create or replace function public.notify_junior_rating_history_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  player_name text;
begin
  target_user_id := public.notification_profile_owner(new.player_id);
  player_name := public.notification_profile_name(new.player_id);

  if target_user_id is null then
    return new;
  end if;

  perform public.create_system_notification(
    target_user_id,
    'rating_updated',
    'Rating updated',
    player_name || '''s rating moved to ' || public.junior_rating_display(new.new_stage, new.new_rating) || '.',
    '/dashboard/players/' || new.player_id::text,
    new.created_by,
    new.player_id,
    new.player_id,
    jsonb_build_object(
      'rating_history_id', new.id,
      'player_id', new.player_id,
      'new_stage', new.new_stage,
      'new_rating', new.new_rating,
      'change_amount', new.change_amount,
      'reason', new.reason,
      'event_id', new.event_id,
      'match_id', new.match_id
    ),
    'rating_updated:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists junior_rating_history_notify_created on public.junior_rating_history;
create trigger junior_rating_history_notify_created
after insert on public.junior_rating_history
for each row execute function public.notify_junior_rating_history_created();

create or replace function public.notify_junior_achievement_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  player_name text;
begin
  target_user_id := public.notification_profile_owner(new.player_id);
  player_name := public.notification_profile_name(new.player_id);

  if target_user_id is null then
    return new;
  end if;

  perform public.create_system_notification(
    target_user_id,
    'badge_unlocked',
    'Badge unlocked',
    player_name || ' unlocked ' || new.badge_name || '.',
    '/dashboard/players/' || new.player_id::text,
    new.approved_by,
    new.player_id,
    new.player_id,
    jsonb_build_object(
      'achievement_id', new.id,
      'player_id', new.player_id,
      'badge_key', new.badge_key,
      'badge_name', new.badge_name,
      'category', new.category,
      'stage', new.stage,
      'related_event_id', new.related_event_id,
      'related_match_id', new.related_match_id
    ),
    'badge_unlocked:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists junior_achievements_notify_created on public.junior_achievements;
create trigger junior_achievements_notify_created
after insert on public.junior_achievements
for each row execute function public.notify_junior_achievement_created();

revoke all on function public.protect_notification_update() from public;
revoke all on function public.notification_profile_owner(uuid) from public;
revoke all on function public.notification_profile_name(uuid) from public;
revoke all on function public.notification_profile_is_junior(uuid) from public;
revoke all on function public.create_system_notification(uuid, text, text, text, text, uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.notify_match_invite_created() from public;
revoke all on function public.notify_match_invite_response() from public;
revoke all on function public.notify_junior_rating_history_created() from public;
revoke all on function public.notify_junior_achievement_created() from public;
