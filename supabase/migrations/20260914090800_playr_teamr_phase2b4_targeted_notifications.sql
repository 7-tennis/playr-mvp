-- PlayR / TeamR Phase 2B.4: targeted event notifications and one-way
-- event announcements. Reuses the shared notifications table and canonical
-- profile ownership established by the PlayR notification foundation.

begin;

alter table public.notifications
  add column organisation_id uuid references public.venues(id) on delete set null,
  add column event_id uuid references public.events(id) on delete set null,
  add column category text not null default 'system';

update public.notifications
set category = case
  when action_required then 'action_required'
  when type like 'event_%' or type like 'match_%' then 'events'
  when invitation_id is not null or type like 'membership_%' then 'organisations'
  else 'system'
end;

alter table public.notifications
  add constraint notifications_category_valid
  check (category in ('action_required', 'events', 'organisations', 'system'));

alter table public.notifications drop constraint if exists notifications_type_valid;
alter table public.notifications add constraint notifications_type_valid check (
  type in (
    'match_invite_received', 'match_invite_accepted', 'match_invite_declined', 'match_invite_reminder',
    'court_booking_confirmed', 'upcoming_booking_reminder', 'event_entry_confirmed', 'event_reminder',
    'rating_updated', 'badge_unlocked', 'leaderboard_changed', 'membership_renewal',
    'shop_reservation_update', 'coach_invitation', 'player_link_invitation',
    'parent_approval_required', 'invitation_accepted', 'invitation_declined',
    'lesson_created', 'lesson_updated', 'lesson_cancelled', 'lesson_move_requested',
    'lesson_time_requested', 'lesson_move_declined', 'lesson_time_confirmed', 'new_message',
    'membership_application_submitted', 'membership_application_approved',
    'membership_application_declined', 'membership_application_correction',
    'membership_activated', 'membership_expiring', 'membership_expired',
    'membership_manual_payment_recorded',
    'event_invitation', 'event_invitation_accepted', 'event_invitation_declined',
    'event_entry_requested', 'event_entry_approved', 'event_entry_rejected',
    'event_participant_removed', 'event_changed', 'event_cancelled',
    'event_staff_assigned', 'event_staff_role_changed', 'event_staff_removed',
    'event_announcement'
  )
);

alter table public.notifications drop constraint if exists notifications_action_state_valid;
alter table public.notifications add constraint notifications_action_state_valid check (
  (
    action_required = true
    and status = 'action_required'
    and (invitation_id is not null or event_id is not null)
    and resolved_at is null
  )
  or action_required = false
);

create index notifications_user_category_created_idx
on public.notifications(user_id, category, created_at desc);

create index notifications_organisation_created_idx
on public.notifications(organisation_id, created_at desc)
where organisation_id is not null;

create index notifications_event_created_idx
on public.notifications(event_id, created_at desc)
where event_id is not null;

-- Existing server actions only create these two self-confirmation types. Move
-- that narrow behavior behind a validated RPC and remove all direct client
-- INSERT access to the shared notification table.
create function public.create_my_notification(
  p_type text,
  p_title text,
  p_message text,
  p_href text default null,
  p_profile_id uuid default null,
  p_junior_profile_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  inserted_id uuid;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;
  if p_type not in ('court_booking_confirmed', 'event_entry_confirmed') then
    raise exception 'notification_type_not_allowed' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0
    or length(btrim(coalesce(p_message, ''))) = 0
    or (p_href is not null and (p_href not like '/dashboard/%' or p_href like '//%'))
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_notification' using errcode = 'P0001';
  end if;
  if p_profile_id is not null
    and not public.can_manage_profile(p_profile_id, actor_user_id) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;
  if p_junior_profile_id is not null
    and (p_profile_id is distinct from p_junior_profile_id
      or not public.can_manage_profile(p_junior_profile_id, actor_user_id)) then
    raise exception 'profile_access' using errcode = 'P0001';
  end if;

  insert into public.notifications (
    user_id, actor_user_id, profile_id, junior_profile_id, type, title,
    message, href, metadata, dedupe_key, category
  ) values (
    actor_user_id, actor_user_id, p_profile_id, p_junior_profile_id, p_type,
    btrim(p_title), btrim(p_message), p_href, coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key, case when p_type = 'event_entry_confirmed' then 'events' else 'system' end
  )
  on conflict do nothing
  returning id into inserted_id;

  if inserted_id is null and p_dedupe_key is not null then
    select notification.id into inserted_id
    from public.notifications notification
    where notification.user_id = actor_user_id
      and notification.dedupe_key = p_dedupe_key;
  end if;
  return inserted_id;
end;
$$;

drop policy if exists "Users can create their own notifications" on public.notifications;
revoke insert on table public.notifications from public, anon, authenticated;

create or replace function public.protect_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.id is distinct from old.id
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
    or new.status is distinct from old.status
    or new.action_required is distinct from old.action_required
    or new.invitation_id is distinct from old.invitation_id
    or new.resolved_at is distinct from old.resolved_at
    or new.organisation_id is distinct from old.organisation_id
    or new.event_id is distinct from old.event_id
    or new.category is distinct from old.category
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Only notification read state can be updated';
  end if;
  if new.read_at is distinct from old.read_at and old.status = 'unread' then
    new.status := case when new.read_at is null then 'unread' else 'read' end;
  end if;
  return new;
end;
$$;

create or replace function public.notification_profile_owner(check_profile_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when profile.is_junior then coalesce(parent.user_id, profile.user_id)
    else profile.user_id
  end
  from public.profiles profile
  left join public.profiles parent on parent.id = profile.parent_profile_id
  where profile.id = check_profile_id
  limit 1;
$$;

create table public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  organisation_id uuid not null references public.venues(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  message text not null,
  created_at timestamptz not null default now(),
  constraint event_announcements_message_length check (
    length(btrim(message)) between 1 and 1000
  )
);

create index event_announcements_event_created_idx
on public.event_announcements(event_id, created_at desc);

create index event_announcements_organisation_created_idx
on public.event_announcements(organisation_id, created_at desc);

alter table public.event_announcements enable row level security;
revoke all privileges on table public.event_announcements from public, anon, authenticated, service_role;
grant all privileges on table public.event_announcements to service_role;

create function private.insert_event_notification(
  p_user_id uuid,
  p_event_id uuid,
  p_profile_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_target text,
  p_dedupe_key text,
  p_action_required boolean default false,
  p_actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event record;
  target_profile public.profiles%rowtype;
  inserted_id uuid;
  target_href text;
begin
  if p_user_id is null or p_target not in ('participant', 'operations', 'cancelled') then
    return null;
  end if;

  select event.id, event.venue_id, event.title, venue.name as organisation_name,
    venue.organisation_type::text as organisation_type
  into target_event
  from public.events event
  join public.venues venue on venue.id = event.venue_id
  where event.id = p_event_id;
  if target_event.id is null then return null; end if;

  if p_profile_id is not null then
    select * into target_profile from public.profiles where id = p_profile_id;
  end if;
  target_href := case
    when p_target = 'cancelled' and p_profile_id is not null
      then '/dashboard/messages/events/' || p_event_id::text || '?player=' || p_profile_id::text
    when p_target = 'participant' and p_profile_id is not null
      then '/dashboard/compete/events/' || p_event_id::text || '?player=' || p_profile_id::text
    else '/dashboard/teamr/competitions/' || p_event_id::text
  end;

  insert into public.notifications (
    user_id, actor_user_id, profile_id, junior_profile_id, type, title,
    message, href, metadata, dedupe_key, status, action_required,
    organisation_id, event_id, category
  ) values (
    p_user_id,
    p_actor_user_id,
    p_profile_id,
    case when target_profile.is_junior then p_profile_id else null end,
    p_type,
    p_title,
    p_message,
    target_href,
    jsonb_build_object(
      'organisationId', target_event.venue_id,
      'organisationType', target_event.organisation_type,
      'eventId', target_event.id,
      'playerProfileId', p_profile_id
    ),
    p_dedupe_key,
    case when p_action_required then 'action_required' else 'unread' end,
    p_action_required,
    target_event.venue_id,
    target_event.id,
    case when p_action_required then 'action_required' else 'events' end
  )
  on conflict do nothing
  returning id into inserted_id;
  return inserted_id;
end;
$$;

create function private.notify_event_managers(
  p_event_id uuid,
  p_profile_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_dedupe_key text,
  p_action_required boolean default false,
  p_actor_user_id uuid default auth.uid()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient record;
  recipient_count integer := 0;
  host_id uuid;
  host_type text;
begin
  for recipient in
    select distinct assignment.staff_user_id as user_id
    from public.event_staff_assignments assignment
    where assignment.event_id = p_event_id
      and assignment.status = 'active'
      and assignment.event_role in ('event_manager', 'coordinator')
  loop
    perform private.insert_event_notification(
      recipient.user_id, p_event_id, p_profile_id, p_type, p_title, p_message,
      'operations', p_dedupe_key, p_action_required, p_actor_user_id
    );
    recipient_count := recipient_count + 1;
  end loop;

  if recipient_count = 0 then
    select event.venue_id, venue.organisation_type::text into host_id, host_type
    from public.events event join public.venues venue on venue.id = event.venue_id
    where event.id = p_event_id;
    for recipient in
      select distinct membership.user_id
      from public.organisation_memberships membership
      where membership.venue_id = host_id
        and membership.status = 'active'
        and membership.user_id is not null
        and (
          (host_type in ('school', 'district', 'school_district')
            and membership.role in ('organisation_admin', 'sports_coordinator'))
          or (host_type in ('club', 'club_academy')
            and membership.role in ('organisation_admin', 'club_manager'))
        )
    loop
      perform private.insert_event_notification(
        recipient.user_id, p_event_id, p_profile_id, p_type, p_title, p_message,
        'operations', p_dedupe_key, p_action_required, p_actor_user_id
      );
      recipient_count := recipient_count + 1;
    end loop;
  end if;
  return recipient_count;
end;
$$;

create function private.notify_event_participation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
  target_profile public.profiles%rowtype;
  recipient_user_id uuid;
  transition_key text;
begin
  select * into target_event from public.events where id = new.event_id;
  select * into target_profile from public.profiles where id = new.player_profile_id;
  recipient_user_id := public.notification_profile_owner(new.player_profile_id);
  transition_key := new.id::text || ':' || to_char(coalesce(new.responded_at, new.removed_at, new.assigned_at, new.updated_at) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  if tg_op = 'INSERT' then
    if new.status = 'invited' then
      perform private.insert_event_notification(
        recipient_user_id, new.event_id, new.player_profile_id, 'event_invitation',
        'Event invitation', target_profile.first_name || ' has been invited to ' || target_event.title || '.',
        'participant', 'event-invitation:' || transition_key, true, new.assigned_by_user_id
      );
    elsif new.status = 'entry_requested' then
      perform private.notify_event_managers(
        new.event_id, new.player_profile_id, 'event_entry_requested', 'Entry request',
        target_profile.first_name || ' requested entry to ' || target_event.title || '.',
        'event-entry-request:' || transition_key, true, new.assigned_by_user_id
      );
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if new.status = 'invited' then
    perform private.insert_event_notification(
      recipient_user_id, new.event_id, new.player_profile_id, 'event_invitation',
      'Event invitation', target_profile.first_name || ' has been invited to ' || target_event.title || '.',
      'participant', 'event-invitation:' || transition_key, true, new.assigned_by_user_id
    );
  elsif new.status = 'entry_requested' then
    perform private.notify_event_managers(
      new.event_id, new.player_profile_id, 'event_entry_requested', 'Entry request',
      target_profile.first_name || ' requested entry to ' || target_event.title || '.',
      'event-entry-request:' || transition_key, true, new.assigned_by_user_id
    );
  end if;

  if old.status = 'invited' and new.participation_source = 'organiser_invite'
    and new.status in ('confirmed', 'declined') then
    update public.notifications
    set status = 'resolved', action_required = false, resolved_at = coalesce(resolved_at, now()),
      read_at = coalesce(read_at, now())
    where user_id = recipient_user_id and event_id = new.event_id
      and profile_id = new.player_profile_id and type = 'event_invitation'
      and action_required;
    perform private.notify_event_managers(
      new.event_id,
      new.player_profile_id,
      case when new.status = 'confirmed' then 'event_invitation_accepted' else 'event_invitation_declined' end,
      case when new.status = 'confirmed' then 'Invitation accepted' else 'Invitation declined' end,
      target_profile.first_name || case when new.status = 'confirmed' then ' accepted the invitation to ' else ' declined the invitation to ' end || target_event.title || '.',
      'event-invitation-response:' || transition_key,
      false,
      new.responded_by_user_id
    );
  elsif old.status = 'entry_requested' and new.participation_source = 'player_request'
    and new.status in ('confirmed', 'declined') then
    update public.notifications
    set status = 'resolved', action_required = false, resolved_at = coalesce(resolved_at, now()),
      read_at = coalesce(read_at, now())
    where event_id = new.event_id and profile_id = new.player_profile_id
      and type = 'event_entry_requested' and action_required;
    perform private.insert_event_notification(
      recipient_user_id,
      new.event_id,
      new.player_profile_id,
      case when new.status = 'confirmed' then 'event_entry_approved' else 'event_entry_rejected' end,
      case when new.status = 'confirmed' then 'Entry approved' else 'Entry update' end,
      target_profile.first_name || case when new.status = 'confirmed'
        then '''s entry to ' || target_event.title || ' has been approved.'
        else '''s entry to ' || target_event.title || ' was not approved.' end,
      'participant',
      'event-entry-decision:' || transition_key,
      false,
      new.responded_by_user_id
    );
  elsif new.status = 'removed' and old.status in ('invited', 'entry_requested', 'confirmed') then
    update public.notifications
    set status = 'resolved', action_required = false, resolved_at = coalesce(resolved_at, now()),
      read_at = coalesce(read_at, now())
    where event_id = new.event_id and profile_id = new.player_profile_id and action_required;
    perform private.insert_event_notification(
      recipient_user_id, new.event_id, new.player_profile_id, 'event_participant_removed',
      'Participation updated', target_profile.first_name || ' is no longer listed for ' || target_event.title || '.',
      'participant', 'event-participant-removed:' || transition_key, false, new.removed_by_user_id
    );
  end if;
  return new;
end;
$$;

create trigger event_player_assignments_notify_lifecycle
after insert or update of status on public.event_player_assignments
for each row execute function private.notify_event_participation_change();

create function private.notify_event_staff_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events%rowtype;
  role_label text;
  transition_key text;
begin
  select * into target_event from public.events where id = new.event_id;
  role_label := initcap(replace(new.event_role, '_', ' '));
  transition_key := new.id::text || ':' || to_char(coalesce(new.removed_at, new.updated_at, new.assigned_at) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  if tg_op = 'INSERT' then
    perform private.insert_event_notification(
      new.staff_user_id, new.event_id, new.staff_profile_id, 'event_staff_assigned',
      'Event role assigned', 'You have been assigned as ' || role_label || ' for ' || target_event.title || '.',
      'operations', 'event-staff-assigned:' || transition_key, false, new.assigned_by_user_id
    );
    return new;
  end if;
  if new.status = 'removed' and old.status = 'active' then
    perform private.insert_event_notification(
      new.staff_user_id, new.event_id, new.staff_profile_id, 'event_staff_removed',
      'Event role removed', 'You are no longer assigned to ' || target_event.title || '.',
      'operations', 'event-staff-removed:' || transition_key, false, new.removed_by_user_id
    );
  elsif new.status = 'active' and new.event_role is distinct from old.event_role then
    perform private.insert_event_notification(
      new.staff_user_id, new.event_id, new.staff_profile_id, 'event_staff_role_changed',
      'Event role changed', 'Your role for ' || target_event.title || ' changed to ' || role_label || '.',
      'operations', 'event-staff-role:' || transition_key || ':' || new.event_role, false, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger event_staff_assignments_notify_lifecycle
after insert or update of status, event_role on public.event_staff_assignments
for each row execute function private.notify_event_staff_change();

create function private.notify_meaningful_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant record;
  staff record;
  recipient_user_id uuid;
  notification_message text;
  change_key text := new.id::text || ':' || to_char(new.updated_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  is_cancelled boolean := new.status = 'cancelled' and old.status is distinct from new.status;
  time_changed boolean := coalesce(new.starts_at, new.start_datetime) is distinct from coalesce(old.starts_at, old.start_datetime)
    or coalesce(new.ends_at, new.end_datetime) is distinct from coalesce(old.ends_at, old.end_datetime);
  location_changed boolean := new.location is distinct from old.location;
begin
  if not is_cancelled and not time_changed and not location_changed then return new; end if;

  if is_cancelled then
    update public.notifications
    set status = 'resolved', action_required = false, resolved_at = coalesce(resolved_at, now()),
      read_at = coalesce(read_at, now())
    where event_id = new.id and action_required;
  end if;

  for participant in
    select assignment.player_profile_id, profile.first_name
    from public.event_player_assignments assignment
    join public.profiles profile on profile.id = assignment.player_profile_id
    where assignment.event_id = new.id
      and (
        (is_cancelled and assignment.status in ('invited', 'entry_requested', 'confirmed'))
        or (not is_cancelled and assignment.status = 'confirmed')
      )
  loop
    recipient_user_id := public.notification_profile_owner(participant.player_profile_id);
    notification_message := case
      when is_cancelled then new.title || ' has been cancelled.'
      when time_changed and location_changed then new.title || '''s date, time and location have changed.'
      when time_changed then new.title || ' now starts at ' || to_char(coalesce(new.starts_at, new.start_datetime) at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI') || '.'
      else new.title || ' is now at ' || coalesce(nullif(btrim(new.location), ''), 'a location to be confirmed') || '.'
    end;
    perform private.insert_event_notification(
      recipient_user_id, new.id, participant.player_profile_id,
      case when is_cancelled then 'event_cancelled' else 'event_changed' end,
      case when is_cancelled then 'Event cancelled' else 'Event details changed' end,
      notification_message,
      case when is_cancelled then 'cancelled' else 'participant' end,
      case when is_cancelled then 'event-cancelled:' else 'event-changed:' end || change_key || ':' || participant.player_profile_id::text,
      false,
      (select auth.uid())
    );
  end loop;

  for staff in
    select distinct assignment.staff_user_id, assignment.staff_profile_id
    from public.event_staff_assignments assignment
    where assignment.event_id = new.id and assignment.status = 'active'
      and not exists (
        select 1
        from public.event_player_assignments player_assignment
        where player_assignment.event_id = new.id
          and (
            (is_cancelled and player_assignment.status in ('invited', 'entry_requested', 'confirmed'))
            or (not is_cancelled and player_assignment.status = 'confirmed')
          )
          and public.notification_profile_owner(player_assignment.player_profile_id) = assignment.staff_user_id
      )
  loop
    notification_message := case
      when is_cancelled then new.title || ' has been cancelled.'
      when time_changed and location_changed then new.title || '''s date, time and location have changed.'
      when time_changed then new.title || ' now starts at ' || to_char(coalesce(new.starts_at, new.start_datetime) at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI') || '.'
      else new.title || ' is now at ' || coalesce(nullif(btrim(new.location), ''), 'a location to be confirmed') || '.'
    end;
    perform private.insert_event_notification(
      staff.staff_user_id, new.id, staff.staff_profile_id,
      case when is_cancelled then 'event_cancelled' else 'event_changed' end,
      case when is_cancelled then 'Event cancelled' else 'Event details changed' end,
      notification_message, 'operations',
      case when is_cancelled then 'event-cancelled-staff:' else 'event-changed-staff:' end || change_key || ':' || staff.staff_user_id::text,
      false, (select auth.uid())
    );
  end loop;
  return new;
end;
$$;

create trigger events_notify_meaningful_change
after update of status, starts_at, ends_at, start_datetime, end_datetime, location on public.events
for each row execute function private.notify_meaningful_event_change();

create function public.get_notification_event_detail(p_event_id uuid, p_player_profile_id uuid)
returns table (
  event_id uuid,
  title text,
  host_name text,
  host_type text,
  player_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  status text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.can_manage_profile(p_player_profile_id, actor_user_id) then
    raise exception 'event_access' using errcode = 'P0001';
  end if;
  return query
  select event.id, event.title, venue.name, venue.organisation_type::text,
    profile.first_name || ' ' || profile.last_name,
    coalesce(event.starts_at, event.start_datetime),
    coalesce(event.ends_at, event.end_datetime), event.location, event.status::text
  from public.events event
  join public.venues venue on venue.id = event.venue_id
  join public.event_player_assignments assignment
    on assignment.event_id = event.id
   and assignment.player_profile_id = p_player_profile_id
  join public.profiles profile on profile.id = assignment.player_profile_id
  where event.id = p_event_id and event.status = 'cancelled'
  order by assignment.updated_at desc
  limit 1;
end;
$$;

create function public.send_event_announcement(p_event_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_event public.events%rowtype;
  announcement_id uuid;
  participant record;
  staff record;
  recipient_user_id uuid;
begin
  select * into target_event from public.events where id = p_event_id for share;
  if actor_user_id is null or target_event.id is null
    or target_event.archived_at is not null
    or target_event.status <> 'published'
    or not (
      private.user_has_event_role(p_event_id, array['event_manager', 'coordinator'], actor_user_id)
      or public.user_can_manage_organisation_events(target_event.venue_id, actor_user_id)
    ) then
    raise exception 'announcement_access' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 1000 then
    raise exception 'announcement_length' using errcode = 'P0001';
  end if;

  insert into public.event_announcements(event_id, organisation_id, author_user_id, message)
  values (p_event_id, target_event.venue_id, actor_user_id, btrim(p_message))
  returning id into announcement_id;

  for participant in
    select assignment.player_profile_id
    from public.event_player_assignments assignment
    where assignment.event_id = p_event_id and assignment.status = 'confirmed'
  loop
    recipient_user_id := public.notification_profile_owner(participant.player_profile_id);
    if recipient_user_id is distinct from actor_user_id then
      perform private.insert_event_notification(
        recipient_user_id, p_event_id, participant.player_profile_id, 'event_announcement',
        'Event announcement', btrim(p_message), 'participant',
        'event-announcement:' || announcement_id::text || ':' || participant.player_profile_id::text,
        false, actor_user_id
      );
    end if;
  end loop;

  for staff in
    select distinct assignment.staff_user_id, assignment.staff_profile_id
    from public.event_staff_assignments assignment
    where assignment.event_id = p_event_id and assignment.status = 'active'
      and assignment.staff_user_id is distinct from actor_user_id
      and not exists (
        select 1
        from public.event_player_assignments player_assignment
        where player_assignment.event_id = p_event_id
          and player_assignment.status = 'confirmed'
          and public.notification_profile_owner(player_assignment.player_profile_id) = assignment.staff_user_id
      )
  loop
    perform private.insert_event_notification(
      staff.staff_user_id, p_event_id, staff.staff_profile_id, 'event_announcement',
      'Event announcement', btrim(p_message), 'operations',
      'event-announcement:' || announcement_id::text || ':' || staff.staff_user_id::text,
      false, actor_user_id
    );
  end loop;
  return announcement_id;
end;
$$;

revoke all on function public.create_my_notification(text, text, text, text, uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.send_event_announcement(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.get_notification_event_detail(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.protect_notification_update() from public, anon, authenticated, service_role;
revoke all on function public.notification_profile_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function private.insert_event_notification(uuid, uuid, uuid, text, text, text, text, text, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function private.notify_event_managers(uuid, uuid, text, text, text, text, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function private.notify_event_participation_change() from public, anon, authenticated, service_role;
revoke all on function private.notify_event_staff_change() from public, anon, authenticated, service_role;
revoke all on function private.notify_meaningful_event_change() from public, anon, authenticated, service_role;

grant execute on function public.create_my_notification(text, text, text, text, uuid, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.send_event_announcement(uuid, text) to authenticated, service_role;
grant execute on function public.get_notification_event_detail(uuid, uuid) to authenticated, service_role;

comment on table public.event_announcements is
'Short one-way event updates sent by authorised Event Managers and Coordinators to confirmed participants and active event staff.';
comment on function public.send_event_announcement(uuid, text) is
'Atomically records a short event announcement and creates private notifications for confirmed participants/managing parents and active event staff.';

commit;
