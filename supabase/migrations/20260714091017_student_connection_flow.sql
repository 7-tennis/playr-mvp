-- Phase 1.9: make player connection acceptance authoritative and expose one
-- permission-scoped source of truth for CoachR student selection.

alter table public.organisation_invitations
  add column if not exists accepted_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists organisation_invitations_accepted_by_profile_idx
on public.organisation_invitations(accepted_by_profile_id, status)
where accepted_by_profile_id is not null;

-- Notification work is deliberately isolated from invitation state changes.
-- A notification failure must never roll back an accepted player connection.
create or replace function public.sync_organisation_invitation_notifications(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_record public.organisation_invitations%rowtype;
  recipient_user_id uuid;
  junior_user_id uuid;
  target_parent_profile_id uuid;
  organisation_name text;
  coach_name text;
  player_name text;
  notification_type text;
  notification_title text;
  notification_message text;
begin
  select * into invitation_record
  from public.organisation_invitations invitation
  where invitation.id = p_invitation_id;

  if invitation_record.id is null then
    return;
  end if;

  select venue.name into organisation_name
  from public.venues venue
  where venue.id = invitation_record.venue_id;

  select concat_ws(' ', profile.first_name, profile.last_name) into coach_name
  from public.profiles profile
  where profile.user_id = invitation_record.invited_by_user_id
    and profile.is_junior = false
  limit 1;

  player_name := coalesce(
    nullif(concat_ws(' ', invitation_record.metadata ->> 'playerFirstName', invitation_record.metadata ->> 'playerLastName'), ''),
    invitation_record.invited_name,
    'a player'
  );

  if invitation_record.status = 'pending' then
    if invitation_record.invitation_kind = 'player_junior' then
      target_parent_profile_id := coalesce(
        invitation_record.parent_profile_id,
        (select junior.parent_profile_id from public.profiles junior where junior.id = invitation_record.target_junior_profile_id)
      );
      recipient_user_id := coalesce(
        (select parent.user_id from public.profiles parent where parent.id = target_parent_profile_id),
        (select profile.user_id from public.profiles profile where lower(profile.email) = lower(invitation_record.invited_email) and profile.is_junior = false limit 1)
      );
      notification_type := 'parent_approval_required';
      notification_title := 'Player connection needs approval';
      notification_message := concat(
        organisation_name,
        ' would like to connect with ',
        player_name,
        '.',
        case when coach_name is not null then ' Coach: ' || coach_name || '.' else '' end
      );
    elsif invitation_record.invitation_kind = 'player' then
      recipient_user_id := (
        select profile.user_id
        from public.profiles profile
        where lower(profile.email) = lower(invitation_record.invited_email)
          and profile.is_junior = false
        limit 1
      );
      notification_type := 'player_link_invitation';
      notification_title := 'Player connection request';
      notification_message := concat(organisation_name, ' would like to connect with your PlayR profile.');
    elsif invitation_record.invitation_kind = 'coach' then
      recipient_user_id := (
        select profile.user_id
        from public.profiles profile
        where lower(profile.email) = lower(invitation_record.invited_email)
          and profile.is_junior = false
        limit 1
      );
      notification_type := 'coach_invitation';
      notification_title := 'CoachR invitation';
      notification_message := concat(organisation_name, ' invited you to join CoachR.');
    else
      recipient_user_id := (
        select profile.user_id
        from public.profiles profile
        where lower(profile.email) = lower(invitation_record.invited_email)
          and profile.is_junior = false
        limit 1
      );
      notification_type := 'new_message';
      notification_title := 'Organisation invitation';
      notification_message := concat(organisation_name, ' invited you to join PlayR.');
    end if;

    if recipient_user_id is not null then
      insert into public.notifications (
        user_id, actor_user_id, profile_id, junior_profile_id, type, title, message, href, metadata,
        dedupe_key, status, action_required, invitation_id
      ) values (
        recipient_user_id,
        invitation_record.invited_by_user_id,
        invitation_record.target_profile_id,
        invitation_record.target_junior_profile_id,
        notification_type,
        notification_title,
        notification_message,
        '/dashboard/organisations/invitations',
        jsonb_build_object('organisationId', invitation_record.venue_id, 'invitationKind', invitation_record.invitation_kind::text),
        'organisation-invitation:' || invitation_record.id::text || ':' || recipient_user_id::text,
        'action_required',
        true,
        invitation_record.id
      ) on conflict do nothing;
    end if;

    if invitation_record.invitation_kind = 'player_junior' and invitation_record.target_junior_profile_id is not null then
      select junior.user_id into junior_user_id
      from public.profiles junior
      where junior.id = invitation_record.target_junior_profile_id;

      if junior_user_id is not null and junior_user_id is distinct from recipient_user_id then
        insert into public.notifications (
          user_id, actor_user_id, junior_profile_id, type, title, message, metadata,
          dedupe_key, status, action_required, invitation_id
        ) values (
          junior_user_id,
          invitation_record.invited_by_user_id,
          invitation_record.target_junior_profile_id,
          'player_link_invitation',
          'Player connection requested',
          concat(organisation_name, ' requested to connect with your PlayR profile. Your parent or guardian must approve this request.'),
          jsonb_build_object('organisationId', invitation_record.venue_id, 'guardianApprovalRequired', true),
          'organisation-invitation-info:' || invitation_record.id::text || ':' || junior_user_id::text,
          'unread',
          false,
          invitation_record.id
        ) on conflict do nothing;
      end if;
    end if;

    return;
  end if;

  if invitation_record.status in ('accepted', 'declined', 'cancelled', 'expired') then
    update public.notifications
    set status = case when invitation_record.status = 'expired' then 'expired' else 'resolved' end,
        action_required = false,
        resolved_at = coalesce(resolved_at, now()),
        read_at = coalesce(read_at, now())
    where invitation_id = invitation_record.id
      and status not in ('resolved', 'expired');

    if invitation_record.status in ('accepted', 'declined') then
      insert into public.notifications (
        user_id, actor_user_id, profile_id, junior_profile_id, type, title, message, href,
        metadata, dedupe_key, status
      ) values (
        invitation_record.invited_by_user_id,
        invitation_record.accepted_by_user_id,
        invitation_record.accepted_profile_id,
        invitation_record.target_junior_profile_id,
        case when invitation_record.status = 'accepted' then 'invitation_accepted' else 'invitation_declined' end,
        case when invitation_record.status = 'accepted' then 'Invitation accepted' else 'Invitation declined' end,
        concat(
          coalesce(invitation_record.invited_name, invitation_record.invited_email),
          ' ',
          case when invitation_record.status = 'accepted' then 'accepted' else 'declined' end,
          ' the ',
          lower(organisation_name),
          ' invitation.'
        ),
        case when invitation_record.invitation_kind in ('player', 'player_junior') then '/dashboard/coachr/students' else '/dashboard/coachr/coaches' end,
        jsonb_build_object('organisationId', invitation_record.venue_id, 'invitationId', invitation_record.id),
        'organisation-invitation-outcome:' || invitation_record.id::text || ':' || invitation_record.status::text,
        'unread'
      ) on conflict do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.notify_organisation_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.sync_organisation_invitation_notifications(new.id);
  exception
    when others then
      raise warning 'organisation invitation notification sync failed for %: % %', new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists organisation_invitations_notify on public.organisation_invitations;
create trigger organisation_invitations_notify
after insert or update of status on public.organisation_invitations
for each row execute function public.notify_organisation_invitation_event();

-- Proposal context is written with the player link inside the authoritative
-- acceptance transaction below, so the older post-acceptance copy trigger is
-- no longer needed and cannot turn optional proposal work into a core failure.
drop trigger if exists organisation_invitation_copy_proposal on public.organisation_invitations;

create or replace function public.protect_player_connection_activation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  activation_transition boolean;
begin
  if tg_op = 'INSERT' then
    activation_transition := true;
  else
    activation_transition := old.status is distinct from new.status;
  end if;

  if current_user in ('authenticated', 'anon')
    and new.status = 'active'
    and activation_transition then
    raise exception 'guardian_approval_required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists organisation_player_links_protect_activation on public.organisation_player_links;
create trigger organisation_player_links_protect_activation
before insert or update of status on public.organisation_player_links
for each row execute function public.protect_player_connection_activation();

-- Player and junior acceptance is a single idempotent transaction. Membership
-- and coach invitations continue using the existing membership acceptance RPC.
create or replace function public.accept_player_connection_invitation(
  p_token uuid,
  p_profile_id uuid default null,
  p_junior_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation_record public.organisation_invitations%rowtype;
  adult_profile_id uuid;
  chosen_profile_id uuid;
  created_link_id uuid;
  intended_coach_profile_id uuid;
  assignment_id uuid;
  assignment_status text := 'unassigned';
  result_warning text;
  junior_first_name text;
  junior_last_name text;
  proposal_state text := 'not_specified';
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select * into invitation_record
  from public.organisation_invitations invitation
  where invitation.token = p_token
  for update;

  if invitation_record.id is null
    or invitation_record.invitation_kind not in ('player', 'player_junior') then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if actor_email = '' or lower(invitation_record.invited_email) <> actor_email then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select profile.id into adult_profile_id
  from public.profiles profile
  where profile.user_id = actor_user_id
    and profile.is_junior = false
  limit 1;

  if adult_profile_id is null then
    raise exception 'adult_profile_required' using errcode = 'P0001';
  end if;

  if invitation_record.status = 'accepted' then
    select link.id into created_link_id
    from public.organisation_player_links link
    where link.venue_id = invitation_record.venue_id
      and link.status = 'active'
      and (
        link.invitation_id = invitation_record.id
        or link.player_profile_id = invitation_record.accepted_profile_id
      )
    order by (link.invitation_id = invitation_record.id) desc, link.updated_at desc
    limit 1;

    if created_link_id is null then
      raise exception 'accepted_connection_missing' using errcode = 'P0001';
    end if;

    select case when exists (
      select 1 from public.coach_player_assignments assignment
      where assignment.organisation_player_link_id = created_link_id
        and assignment.status = 'active'
    ) then 'active' else 'unassigned' end
    into assignment_status;

    return jsonb_build_object(
      'status', 'accepted',
      'alreadyAccepted', true,
      'invitationId', invitation_record.id,
      'organisationPlayerLinkId', created_link_id,
      'coachAssignmentStatus', assignment_status,
      'proposalStatus', case when invitation_record.metadata ? 'proposal' then 'proposed' else 'not_specified' end
    );
  end if;

  if invitation_record.status in ('declined', 'expired', 'cancelled') then
    return jsonb_build_object(
      'status', invitation_record.status,
      'alreadyAccepted', false,
      'invitationId', invitation_record.id
    );
  end if;

  if invitation_record.expires_at <= now() then
    update public.organisation_invitations
    set status = 'expired'
    where id = invitation_record.id;

    return jsonb_build_object(
      'status', 'expired',
      'alreadyAccepted', false,
      'invitationId', invitation_record.id
    );
  end if;

  proposal_state := case when invitation_record.metadata ? 'proposal' then 'proposed' else 'not_specified' end;

  if invitation_record.invitation_kind = 'player' then
    chosen_profile_id := coalesce(p_profile_id, invitation_record.target_profile_id, adult_profile_id);

    if not exists (
      select 1 from public.profiles profile
      where profile.id = chosen_profile_id
        and profile.user_id = actor_user_id
        and profile.is_junior = false
    ) then
      raise exception 'adult_profile_required' using errcode = 'P0001';
    end if;
  else
    chosen_profile_id := coalesce(p_junior_profile_id, invitation_record.target_junior_profile_id);

    if chosen_profile_id is not null
      and not public.profile_is_linked_junior(chosen_profile_id, actor_user_id) then
      raise exception 'invalid_player' using errcode = 'P0001';
    end if;

    if chosen_profile_id is null then
      junior_first_name := nullif(btrim(coalesce(invitation_record.metadata ->> 'playerFirstName', '')), '');
      junior_last_name := nullif(btrim(coalesce(invitation_record.metadata ->> 'playerLastName', '')), '');

      if junior_first_name is null or junior_last_name is null then
        raise exception 'invalid_player' using errcode = 'P0001';
      end if;

      insert into public.profiles (
        first_name, last_name, email, phone, is_junior, parent_profile_id,
        member_status, player_level, primary_sport
      ) values (
        junior_first_name,
        junior_last_name,
        null,
        nullif(btrim(coalesce(invitation_record.invited_phone, '')), ''),
        true,
        adult_profile_id,
        'pending',
        'unknown',
        'tennis'
      ) returning id into chosen_profile_id;
    end if;
  end if;

  insert into public.organisation_player_links (
    venue_id, player_profile_id, parent_profile_id, invitation_id, status,
    requested_by_user_id, approved_by_user_id, approved_at,
    connection_context, proposal_status
  ) values (
    invitation_record.venue_id,
    chosen_profile_id,
    case when invitation_record.invitation_kind = 'player_junior' then adult_profile_id else null end,
    invitation_record.id,
    'active',
    invitation_record.invited_by_user_id,
    actor_user_id,
    now(),
    coalesce(invitation_record.metadata, '{}'::jsonb),
    proposal_state
  )
  on conflict (venue_id, player_profile_id)
  where status in ('pending', 'active', 'suspended')
  do update set
    parent_profile_id = excluded.parent_profile_id,
    invitation_id = excluded.invitation_id,
    status = 'active',
    approved_by_user_id = actor_user_id,
    approved_at = coalesce(public.organisation_player_links.approved_at, now()),
    removed_at = null,
    connection_context = excluded.connection_context,
    proposal_status = excluded.proposal_status
  returning id into created_link_id;

  intended_coach_profile_id := case
    when coalesce(invitation_record.metadata ->> 'coachProfileId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (invitation_record.metadata ->> 'coachProfileId')::uuid
    else null
  end;

  if intended_coach_profile_id is not null then
    if exists (
      select 1
      from public.organisation_memberships membership
      where membership.venue_id = invitation_record.venue_id
        and membership.profile_id = intended_coach_profile_id
        and membership.role in ('head_coach', 'coach', 'assistant_coach')
        and membership.status = 'active'
    ) then
      begin
        insert into public.coach_player_assignments (
          venue_id, coach_profile_id, player_profile_id, organisation_player_link_id,
          status, assigned_by_user_id
        ) values (
          invitation_record.venue_id,
          intended_coach_profile_id,
          chosen_profile_id,
          created_link_id,
          'active',
          actor_user_id
        )
        on conflict (venue_id, coach_profile_id, player_profile_id)
        where status = 'active'
        do update set
          organisation_player_link_id = excluded.organisation_player_link_id,
          assigned_by_user_id = excluded.assigned_by_user_id,
          removed_at = null
        returning id into assignment_id;

        assignment_status := 'active';
      exception
        when others then
          assignment_status := 'unassigned';
          result_warning := 'coach_assignment_failed';
          raise warning 'coach assignment failed for invitation %: % %', invitation_record.id, sqlstate, sqlerrm;
      end;
    else
      assignment_status := 'unassigned';
      result_warning := 'intended_coach_unavailable';
    end if;
  end if;

  update public.organisation_invitations
  set status = 'accepted',
      accepted_profile_id = chosen_profile_id,
      accepted_by_profile_id = adult_profile_id,
      accepted_by_user_id = actor_user_id,
      accepted_at = coalesce(accepted_at, now())
  where id = invitation_record.id;

  begin
    insert into public.user_active_organisations(user_id, venue_id, product_context)
    values (actor_user_id, invitation_record.venue_id, 'playr')
    on conflict (user_id) do update
    set venue_id = excluded.venue_id,
        product_context = excluded.product_context,
        updated_at = now();
  exception
    when others then
      result_warning := concat_ws(';', result_warning, 'active_organisation_not_updated');
      raise warning 'active organisation preference was not updated for invitation %: % %', invitation_record.id, sqlstate, sqlerrm;
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'status', 'accepted',
    'alreadyAccepted', false,
    'invitationId', invitation_record.id,
    'acceptedProfileId', chosen_profile_id,
    'acceptedByProfileId', adult_profile_id,
    'organisationPlayerLinkId', created_link_id,
    'coachAssignmentId', assignment_id,
    'coachAssignmentStatus', assignment_status,
    'proposalStatus', proposal_state,
    'warning', result_warning
  ));
end;
$$;

-- Keep legacy RPC names compatible while routing every player acceptance through
-- the guarded idempotent implementation. Non-player membership invitations use
-- the original function under an internal compatibility name.
alter function public.accept_organisation_invitation(uuid, uuid, uuid)
  rename to accept_organisation_membership_invitation_v1;

create or replace function public.accept_organisation_invitation(
  p_token uuid,
  p_profile_id uuid default null,
  p_junior_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_kind public.organisation_invitation_kind;
  result jsonb;
begin
  select invitation.invitation_kind into invitation_kind
  from public.organisation_invitations invitation
  where invitation.token = p_token;

  if invitation_kind in ('player', 'player_junior') then
    result := public.accept_player_connection_invitation(p_token, p_profile_id, p_junior_profile_id);
    if result ->> 'status' <> 'accepted' then
      raise exception '%', 'invitation_' || coalesce(result ->> 'status', 'closed') using errcode = 'P0001';
    end if;
    return (result ->> 'invitationId')::uuid;
  end if;

  return public.accept_organisation_membership_invitation_v1(p_token, p_profile_id, p_junior_profile_id);
end;
$$;

alter function public.accept_adult_player_invitation(uuid, uuid)
  rename to accept_adult_player_invitation_v1;

create or replace function public.accept_adult_player_invitation(
  p_token uuid,
  p_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  result := public.accept_player_connection_invitation(p_token, p_profile_id, null);
  if result ->> 'status' <> 'accepted' then
    raise exception '%', 'invitation_' || coalesce(result ->> 'status', 'closed') using errcode = 'P0001';
  end if;
  return (result ->> 'invitationId')::uuid;
end;
$$;

create or replace function public.coachr_active_academy_students(
  p_venue_id uuid
)
returns table (
  organisation_player_link_id uuid,
  venue_id uuid,
  player_profile_id uuid,
  first_name text,
  last_name text,
  is_junior boolean,
  parent_profile_id uuid,
  parent_name text,
  junior_stage text,
  player_level text,
  link_status text,
  proposal_status text,
  connection_context jsonb,
  approved_at timestamptz,
  assigned_coaches jsonb,
  assigned_to_current_user boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_profile_id uuid;
  manager_access boolean;
  coach_access boolean;
begin
  if actor_user_id is null or p_venue_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  manager_access := public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id);
  coach_access := public.user_has_active_organisation_role(
    p_venue_id,
    array['coach', 'assistant_coach']::public.organisation_role[],
    actor_user_id
  );

  if not manager_access and not coach_access then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select profile.id into actor_profile_id
  from public.profiles profile
  where profile.user_id = actor_user_id
    and profile.is_junior = false
  limit 1;

  return query
  select
    link.id,
    link.venue_id,
    player.id,
    player.first_name,
    player.last_name,
    player.is_junior,
    player.parent_profile_id,
    nullif(concat_ws(' ', parent.first_name, parent.last_name), ''),
    player.junior_stage::text,
    player.player_level::text,
    link.status::text,
    link.proposal_status,
    coalesce(link.connection_context, '{}'::jsonb),
    link.approved_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'assignmentId', assignment.id,
          'coachProfileId', coach.id,
          'coachName', concat_ws(' ', coach.first_name, coach.last_name),
          'assignedAt', assignment.assigned_at
        ) order by assignment.assigned_at desc
      )
      from public.coach_player_assignments assignment
      join public.profiles coach on coach.id = assignment.coach_profile_id
      where assignment.venue_id = link.venue_id
        and assignment.player_profile_id = link.player_profile_id
        and assignment.status = 'active'
    ), '[]'::jsonb),
    exists (
      select 1
      from public.coach_player_assignments own_assignment
      where own_assignment.venue_id = link.venue_id
        and own_assignment.player_profile_id = link.player_profile_id
        and own_assignment.coach_profile_id = actor_profile_id
        and own_assignment.status = 'active'
    )
  from public.organisation_player_links link
  join public.profiles player on player.id = link.player_profile_id
  join public.venues venue on venue.id = link.venue_id
  left join public.profiles parent on parent.id = player.parent_profile_id
  where link.venue_id = p_venue_id
    and link.status = 'active'
    and venue.status <> 'inactive'
    and (
      manager_access
      or exists (
        select 1
        from public.coach_player_assignments permitted_assignment
        where permitted_assignment.venue_id = link.venue_id
          and permitted_assignment.player_profile_id = link.player_profile_id
          and permitted_assignment.coach_profile_id = actor_profile_id
          and permitted_assignment.status = 'active'
      )
    )
  order by player.first_name, player.last_name;
end;
$$;

create or replace function public.coachr_player_is_active_student(
  p_venue_id uuid,
  p_player_profile_id uuid,
  p_coach_profile_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  actor_profile_id uuid;
  manager_access boolean;
begin
  if actor_user_id is null or p_venue_id is null or p_player_profile_id is null then
    return false;
  end if;

  manager_access := public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id);

  select profile.id into actor_profile_id
  from public.profiles profile
  where profile.user_id = actor_user_id
    and profile.is_junior = false
  limit 1;

  return exists (
    select 1
    from public.organisation_player_links link
    join public.venues venue on venue.id = link.venue_id
    where link.venue_id = p_venue_id
      and link.player_profile_id = p_player_profile_id
      and link.status = 'active'
      and venue.status <> 'inactive'
      and (
        manager_access
        or (
          actor_profile_id is not null
          and p_coach_profile_id = actor_profile_id
          and exists (
            select 1
            from public.coach_player_assignments assignment
            where assignment.venue_id = link.venue_id
              and assignment.player_profile_id = link.player_profile_id
              and assignment.coach_profile_id = actor_profile_id
              and assignment.status = 'active'
          )
        )
      )
  );
end;
$$;

create or replace function public.coachr_assign_student_coach(
  p_venue_id uuid,
  p_player_profile_id uuid,
  p_coach_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  link_id uuid;
  assignment_id uuid;
begin
  if actor_user_id is null
    or not public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  select link.id into link_id
  from public.organisation_player_links link
  where link.venue_id = p_venue_id
    and link.player_profile_id = p_player_profile_id
    and link.status = 'active'
  limit 1;

  if link_id is null then
    raise exception 'invalid_student' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.organisation_memberships membership
    where membership.venue_id = p_venue_id
      and membership.profile_id = p_coach_profile_id
      and membership.role in ('head_coach', 'coach', 'assistant_coach')
      and membership.status = 'active'
  ) then
    raise exception 'invalid_coach' using errcode = 'P0001';
  end if;

  insert into public.coach_player_assignments (
    venue_id, coach_profile_id, player_profile_id, organisation_player_link_id,
    status, assigned_by_user_id
  ) values (
    p_venue_id,
    p_coach_profile_id,
    p_player_profile_id,
    link_id,
    'active',
    actor_user_id
  )
  on conflict (venue_id, coach_profile_id, player_profile_id)
  where status = 'active'
  do update set
    organisation_player_link_id = excluded.organisation_player_link_id,
    assigned_by_user_id = excluded.assigned_by_user_id,
    removed_at = null
  returning id into assignment_id;

  return assignment_id;
end;
$$;

create or replace function public.coachr_search_connection_candidates(
  p_venue_id uuid,
  p_query text
)
returns table (
  player_profile_id uuid,
  player_name text,
  is_junior boolean,
  parent_profile_id uuid,
  parent_name text,
  masked_email text,
  relationship_status text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
  normalized_query text := lower(btrim(coalesce(p_query, '')));
  email_search boolean := position('@' in normalized_query) > 0;
begin
  if actor_user_id is null
    or not public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if normalized_query = ''
    or (not email_search and length(normalized_query) < 3)
    or length(normalized_query) > 120 then
    raise exception 'search_too_broad' using errcode = 'P0001';
  end if;

  return query
  select
    player.id,
    concat_ws(' ', player.first_name, player.last_name),
    player.is_junior,
    parent.id,
    nullif(concat_ws(' ', parent.first_name, parent.last_name), ''),
    case
      when coalesce(parent.email, player.email) is null then null
      when position('@' in coalesce(parent.email, player.email)) > 1 then
        left(coalesce(parent.email, player.email), 1) || '***@' || split_part(coalesce(parent.email, player.email), '@', 2)
      else 'Hidden'
    end,
    coalesce(
      (
        select link.status::text
        from public.organisation_player_links link
        where link.venue_id = p_venue_id
          and link.player_profile_id = player.id
        order by
          case link.status::text
            when 'active' then 1
            when 'pending' then 2
            when 'suspended' then 3
            when 'declined' then 4
            else 5
          end,
          link.updated_at desc
        limit 1
      ),
      case when exists (
        select 1
        from public.organisation_invitations pending_invitation
        where pending_invitation.venue_id = p_venue_id
          and pending_invitation.status = 'pending'
          and pending_invitation.expires_at > now()
          and (
            pending_invitation.target_profile_id = player.id
            or pending_invitation.target_junior_profile_id = player.id
          )
      ) then 'pending' else null end,
      'not_connected'
    )
  from public.profiles player
  left join public.profiles parent on parent.id = player.parent_profile_id
  where (
    email_search
    and lower(coalesce(parent.email, player.email, '')) = normalized_query
  ) or (
    not email_search
    and (
      lower(concat_ws(' ', player.first_name, player.last_name)) = normalized_query
      or (length(normalized_query) >= 5 and lower(concat_ws(' ', player.first_name, player.last_name)) like normalized_query || '%')
      or lower(concat_ws(' ', parent.first_name, parent.last_name)) = normalized_query
      or (length(normalized_query) >= 5 and lower(concat_ws(' ', parent.first_name, parent.last_name)) like normalized_query || '%')
    )
  )
  order by
    case when lower(concat_ws(' ', player.first_name, player.last_name)) = normalized_query then 0 else 1 end,
    player.first_name,
    player.last_name
  limit 8;
end;
$$;

create or replace function public.coachr_request_existing_player_connection(
  p_venue_id uuid,
  p_player_profile_id uuid,
  p_coach_profile_id uuid default null,
  p_proposal jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  player_record public.profiles%rowtype;
  parent_record public.profiles%rowtype;
  existing_token uuid;
  invite_token uuid;
  invitation_kind public.organisation_invitation_kind;
  invited_email text;
  invited_name text;
begin
  if actor_user_id is null
    or not public.user_can_manage_organisation_coaches(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_proposal, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  select * into player_record
  from public.profiles profile
  where profile.id = p_player_profile_id;

  if player_record.id is null then
    raise exception 'invalid_player' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.organisation_player_links link
    where link.venue_id = p_venue_id
      and link.player_profile_id = p_player_profile_id
      and link.status = 'active'
  ) then
    raise exception 'already_connected' using errcode = 'P0001';
  end if;

  if p_coach_profile_id is not null and not exists (
    select 1 from public.organisation_memberships membership
    where membership.venue_id = p_venue_id
      and membership.profile_id = p_coach_profile_id
      and membership.role in ('head_coach', 'coach', 'assistant_coach')
      and membership.status = 'active'
  ) then
    raise exception 'invalid_coach' using errcode = 'P0001';
  end if;

  if player_record.is_junior then
    select * into parent_record
    from public.profiles profile
    where profile.id = player_record.parent_profile_id
      and profile.is_junior = false;

    if parent_record.id is null or nullif(btrim(coalesce(parent_record.email, '')), '') is null then
      raise exception 'parent_contact_missing' using errcode = 'P0001';
    end if;

    invitation_kind := 'player_junior';
    invited_email := lower(parent_record.email);
    invited_name := concat_ws(' ', parent_record.first_name, parent_record.last_name);
  else
    if nullif(btrim(coalesce(player_record.email, '')), '') is null then
      raise exception 'player_contact_missing' using errcode = 'P0001';
    end if;

    invitation_kind := 'player';
    invited_email := lower(player_record.email);
    invited_name := concat_ws(' ', player_record.first_name, player_record.last_name);
  end if;

  select invitation.token into existing_token
  from public.organisation_invitations invitation
  where invitation.venue_id = p_venue_id
    and invitation.invitation_kind = invitation_kind
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and (
      invitation.target_profile_id = p_player_profile_id
      or invitation.target_junior_profile_id = p_player_profile_id
    )
  order by invitation.created_at desc
  limit 1;

  if existing_token is not null then
    return existing_token;
  end if;

  insert into public.organisation_invitations (
    venue_id, invitation_kind, invited_email, invited_name, intended_role,
    invited_by_user_id, target_profile_id, target_junior_profile_id,
    parent_profile_id, metadata
  ) values (
    p_venue_id,
    invitation_kind,
    invited_email,
    invited_name,
    'viewer',
    actor_user_id,
    case when player_record.is_junior then null else player_record.id end,
    case when player_record.is_junior then player_record.id else null end,
    case when player_record.is_junior then parent_record.id else null end,
    jsonb_strip_nulls(jsonb_build_object(
      'coachProfileId', p_coach_profile_id,
      'playerFirstName', player_record.first_name,
      'playerLastName', player_record.last_name,
      'proposal', case when coalesce(p_proposal, '{}'::jsonb) = '{}'::jsonb then null else p_proposal end,
      'connectionSource', 'controlled_search'
    ))
  ) returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.coachr_connection_diagnostics(
  p_venue_id uuid,
  p_invitation_id uuid default null
)
returns table (
  invitation_id uuid,
  invitation_status text,
  accepted_profile_id uuid,
  accepted_by_profile_id uuid,
  player_profile_id uuid,
  player_name text,
  organisation_player_link_id uuid,
  organisation_player_link_status text,
  intended_coach_profile_id uuid,
  intended_coach_name text,
  coach_assignment_status text,
  myplayr_card_eligible boolean,
  lesson_selector_eligible boolean,
  proposal_status text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null
    or not public.user_can_manage_organisation_roles(p_venue_id, actor_user_id) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  return query
  select
    invitation.id,
    invitation.status::text,
    invitation.accepted_profile_id,
    invitation.accepted_by_profile_id,
    coalesce(link.player_profile_id, invitation.accepted_profile_id, invitation.target_junior_profile_id, invitation.target_profile_id),
    nullif(concat_ws(' ', player.first_name, player.last_name), ''),
    link.id,
    link.status::text,
    intended_coach.id,
    nullif(concat_ws(' ', intended_coach.first_name, intended_coach.last_name), ''),
    case
      when assignment.id is not null and assignment.status = 'active' then 'active'
      when intended_coach.id is null then 'unassigned'
      else 'assignment_missing'
    end,
    link.status in ('pending', 'active', 'suspended'),
    link.status = 'active',
    coalesce(link.proposal_status, case when invitation.metadata ? 'proposal' then 'proposed' else 'not_specified' end)
  from public.organisation_invitations invitation
  left join public.organisation_player_links link
    on link.invitation_id = invitation.id
    or (
      link.venue_id = invitation.venue_id
      and link.player_profile_id = invitation.accepted_profile_id
      and invitation.accepted_profile_id is not null
    )
  left join public.profiles player
    on player.id = coalesce(link.player_profile_id, invitation.accepted_profile_id, invitation.target_junior_profile_id, invitation.target_profile_id)
  left join public.profiles intended_coach
    on intended_coach.id = case
      when coalesce(invitation.metadata ->> 'coachProfileId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (invitation.metadata ->> 'coachProfileId')::uuid
      else null
    end
  left join public.coach_player_assignments assignment
    on assignment.venue_id = invitation.venue_id
    and assignment.player_profile_id = coalesce(link.player_profile_id, invitation.accepted_profile_id)
    and assignment.coach_profile_id = intended_coach.id
    and assignment.status = 'active'
  where invitation.venue_id = p_venue_id
    and invitation.invitation_kind in ('player', 'player_junior')
    and (p_invitation_id is null or invitation.id = p_invitation_id)
  order by invitation.created_at desc
  limit 40;
end;
$$;

create or replace function public.notify_assigned_coach_of_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coach_user_id uuid;
  player_name text;
begin
  select coach.user_id into coach_user_id
  from public.profiles coach
  where coach.id = new.coach_id;

  if coach_user_id is null or coach_user_id = new.created_by_user_id then
    return new;
  end if;

  select concat_ws(' ', player.first_name, player.last_name) into player_name
  from public.profiles player
  where player.id = new.player_id;

  begin
    perform public.create_system_notification(
      target_user_id => coach_user_id,
      notification_type => 'lesson_created',
      notification_title => 'Lesson added to your schedule',
      notification_message => concat(coalesce(player_name, 'A student'), ' has been placed on your CoachR schedule.'),
      notification_href => '/dashboard/coachr/schedule?lesson=' || new.id::text,
      notification_actor_user_id => new.created_by_user_id,
      notification_profile_id => new.player_id,
      notification_junior_profile_id => new.junior_profile_id,
      notification_metadata => jsonb_build_object('lessonId', new.id, 'organisationId', new.venue_id),
      notification_dedupe_key => 'coach-lesson-assigned:' || coalesce(new.recurring_group_id, new.id)::text
    );
  exception
    when others then
      raise warning 'assigned coach notification failed for lesson %: % %', new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists coach_lessons_notify_assigned_coach on public.coach_lessons;
create trigger coach_lessons_notify_assigned_coach
after insert on public.coach_lessons
for each row execute function public.notify_assigned_coach_of_lesson();

revoke all on function public.sync_organisation_invitation_notifications(uuid) from public;
revoke all on function public.notify_organisation_invitation_event() from public;
revoke all on function public.protect_player_connection_activation() from public;
revoke all on function public.accept_player_connection_invitation(uuid, uuid, uuid) from public;
revoke all on function public.accept_organisation_invitation(uuid, uuid, uuid) from public;
revoke all on function public.accept_adult_player_invitation(uuid, uuid) from public;
revoke all on function public.accept_organisation_membership_invitation_v1(uuid, uuid, uuid) from public;
revoke all on function public.accept_adult_player_invitation_v1(uuid, uuid) from public;
revoke execute on function public.accept_organisation_membership_invitation_v1(uuid, uuid, uuid) from authenticated, anon;
revoke execute on function public.accept_adult_player_invitation_v1(uuid, uuid) from authenticated, anon;
revoke all on function public.coachr_active_academy_students(uuid) from public;
revoke all on function public.coachr_player_is_active_student(uuid, uuid, uuid) from public;
revoke all on function public.coachr_assign_student_coach(uuid, uuid, uuid) from public;
revoke all on function public.coachr_search_connection_candidates(uuid, text) from public;
revoke all on function public.coachr_request_existing_player_connection(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.coachr_connection_diagnostics(uuid, uuid) from public;
revoke all on function public.notify_assigned_coach_of_lesson() from public;

grant execute on function public.accept_player_connection_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.accept_organisation_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.accept_adult_player_invitation(uuid, uuid) to authenticated;
grant execute on function public.coachr_active_academy_students(uuid) to authenticated;
grant execute on function public.coachr_player_is_active_student(uuid, uuid, uuid) to authenticated;
grant execute on function public.coachr_assign_student_coach(uuid, uuid, uuid) to authenticated;
grant execute on function public.coachr_search_connection_candidates(uuid, text) to authenticated;
grant execute on function public.coachr_request_existing_player_connection(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.coachr_connection_diagnostics(uuid, uuid) to authenticated;

grant select (accepted_by_profile_id) on public.organisation_invitations to authenticated;
