create type public.coach_lesson_attendance_result as enum ('attended', 'missed', 'cancelled', 'rain', 'sick');

grant usage on type public.coach_lesson_attendance_result to authenticated;

create table public.coach_lesson_attendance (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.coach_lessons(id) on delete cascade,
  player_profile_id uuid not null references public.profiles(id) on delete restrict,
  junior_profile_id uuid references public.profiles(id) on delete set null,
  attendance_status public.coach_lesson_attendance_result not null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_lesson_attendance_unique_player unique (lesson_id, player_profile_id),
  constraint coach_lesson_attendance_junior_matches_player check (junior_profile_id is null or junior_profile_id = player_profile_id)
);

create index coach_lesson_attendance_lesson_idx on public.coach_lesson_attendance(lesson_id);
create index coach_lesson_attendance_player_idx on public.coach_lesson_attendance(player_profile_id);
create index coach_lesson_attendance_status_idx on public.coach_lesson_attendance(attendance_status);
create index coach_lesson_attendance_recorded_at_idx on public.coach_lesson_attendance(recorded_at);

create trigger coach_lesson_attendance_set_updated_at
before update on public.coach_lesson_attendance
for each row execute function public.set_updated_at();

alter table public.coach_lesson_attendance enable row level security;

grant select on public.coach_lesson_attendance to authenticated;

create policy "CoachR users can read permitted lesson attendance"
on public.coach_lesson_attendance
for select
to authenticated
using (
  public.can_manage_coach_lesson(lesson_id)
);

create policy "Players and parents can read own lesson attendance"
on public.coach_lesson_attendance
for select
to authenticated
using (
  public.can_manage_profile(player_profile_id)
);

create policy "CoachR users can read attendance-linked profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_lesson_attendance attendance
    join public.coach_lessons lesson
      on lesson.id = attendance.lesson_id
    where attendance.player_profile_id = profiles.id
      and (
        public.coach_can_manage_own_lesson(lesson.coach_id, lesson.venue_id)
        or public.can_manage_venue(lesson.venue_id)
      )
  )
);

create or replace function public.coachr_mark_lesson_attendance(
  p_lesson_id uuid,
  p_player_id uuid default null,
  p_attendance_status public.coach_lesson_attendance_result default 'attended'::public.coach_lesson_attendance_result,
  p_notes text default null,
  p_mark_all boolean default false,
  p_confirm_correction boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_lesson record;
  target_player_ids uuid[] := array[]::uuid[];
  target_player_id uuid;
  selected_player record;
  existing_attendance record;
  marked_count integer;
  attended_count integer;
  missed_count integer;
  cancelled_count integer;
  rain_count integer;
  sick_count integer;
  summary_status public.coach_lesson_status;
  summary_attendance public.coach_lesson_attendance_status;
begin
  if actor_user_id is null then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_lesson_id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  select *
    into target_lesson
  from public.coach_lessons
  where id = p_lesson_id
  for update;

  if target_lesson.id is null then
    raise exception 'invalid_lesson' using errcode = 'P0001';
  end if;

  if not (
    public.coach_can_manage_own_lesson(target_lesson.coach_id, target_lesson.venue_id, actor_user_id)
    or public.can_manage_venue(target_lesson.venue_id, actor_user_id)
  ) then
    raise exception 'access' using errcode = 'P0001';
  end if;

  if p_mark_all then
    select coalesce(array_agg(distinct player_id order by player_id), array[]::uuid[])
      into target_player_ids
    from (
      select target_lesson.player_id as player_id
      union all
      select attendance.player_profile_id
      from public.coach_lesson_attendance attendance
      where attendance.lesson_id = p_lesson_id
    ) roster;
  else
    target_player_id := coalesce(p_player_id, target_lesson.player_id);

    if target_player_id is null then
      raise exception 'attendance_player' using errcode = 'P0001';
    end if;

    if target_player_id <> target_lesson.player_id
      and not exists (
        select 1
        from public.coach_lesson_attendance attendance
        where attendance.lesson_id = p_lesson_id
          and attendance.player_profile_id = target_player_id
      )
      and target_lesson.lesson_type not in ('group'::public.coach_lesson_type, 'squad'::public.coach_lesson_type)
    then
      raise exception 'attendance_player' using errcode = 'P0001';
    end if;

    target_player_ids := array[target_player_id];
  end if;

  foreach target_player_id in array target_player_ids
  loop
    select profile.id, profile.is_junior
      into selected_player
    from public.profiles profile
    where profile.id = target_player_id;

    if selected_player.id is null then
      raise exception 'attendance_player' using errcode = 'P0001';
    end if;

    select *
      into existing_attendance
    from public.coach_lesson_attendance attendance
    where attendance.lesson_id = p_lesson_id
      and attendance.player_profile_id = target_player_id
    for update;

    if existing_attendance.id is not null
      and existing_attendance.attendance_status <> p_attendance_status
      and not p_confirm_correction
    then
      raise exception 'attendance_confirm' using errcode = 'P0001';
    end if;

    insert into public.coach_lesson_attendance (
      lesson_id,
      player_profile_id,
      junior_profile_id,
      attendance_status,
      recorded_by_user_id,
      recorded_at,
      notes
    )
    values (
      p_lesson_id,
      target_player_id,
      case when selected_player.is_junior then target_player_id else null end,
      p_attendance_status,
      actor_user_id,
      now(),
      p_notes
    )
    on conflict (lesson_id, player_profile_id)
    do update
    set junior_profile_id = excluded.junior_profile_id,
        attendance_status = excluded.attendance_status,
        recorded_by_user_id = excluded.recorded_by_user_id,
        recorded_at = excluded.recorded_at,
        notes = excluded.notes;
  end loop;

  select
    count(*)::integer,
    count(*) filter (where attendance_status = 'attended')::integer,
    count(*) filter (where attendance_status = 'missed')::integer,
    count(*) filter (where attendance_status = 'cancelled')::integer,
    count(*) filter (where attendance_status = 'rain')::integer,
    count(*) filter (where attendance_status = 'sick')::integer
    into marked_count, attended_count, missed_count, cancelled_count, rain_count, sick_count
  from public.coach_lesson_attendance
  where lesson_id = p_lesson_id;

  if marked_count = 0 then
    return;
  end if;

  if target_lesson.lesson_type in ('group'::public.coach_lesson_type, 'squad'::public.coach_lesson_type) and marked_count > 1 then
    if attended_count = marked_count then
      summary_status := 'completed';
      summary_attendance := 'attended';
    elsif missed_count = marked_count then
      summary_status := 'missed';
      summary_attendance := 'missed';
    elsif rain_count = marked_count then
      summary_status := 'rain';
      summary_attendance := 'excused';
    elsif cancelled_count = marked_count then
      summary_status := 'cancelled';
      summary_attendance := 'excused';
    elsif sick_count = marked_count then
      summary_status := 'sick';
      summary_attendance := 'excused';
    else
      summary_status := 'completed';
      summary_attendance := 'partial';
    end if;
  else
    case p_attendance_status
      when 'attended' then
        summary_status := 'completed';
        summary_attendance := 'attended';
      when 'missed' then
        summary_status := 'missed';
        summary_attendance := 'missed';
      when 'cancelled' then
        summary_status := 'cancelled';
        summary_attendance := 'excused';
      when 'rain' then
        summary_status := 'rain';
        summary_attendance := 'excused';
      when 'sick' then
        summary_status := 'sick';
        summary_attendance := 'excused';
    end case;
  end if;

  update public.coach_lessons
  set status = summary_status,
      attendance_status = summary_attendance,
      updated_by_user_id = actor_user_id,
      cancelled_at = case
        when summary_status in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status)
          then coalesce(cancelled_at, now())
        else null
      end,
      cancelled_by_user_id = case
        when summary_status in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status)
          then coalesce(cancelled_by_user_id, actor_user_id)
        else null
      end
  where id = p_lesson_id;

  if target_lesson.court_booking_id is not null
    and summary_status in ('cancelled'::public.coach_lesson_status, 'rain'::public.coach_lesson_status, 'sick'::public.coach_lesson_status)
  then
    update public.court_bookings
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by_user_id = actor_user_id
    where id = target_lesson.court_booking_id
      and status = 'confirmed';
  end if;
end;
$$;

revoke all on function public.coachr_mark_lesson_attendance(uuid, uuid, public.coach_lesson_attendance_result, text, boolean, boolean) from public;
grant execute on function public.coachr_mark_lesson_attendance(uuid, uuid, public.coach_lesson_attendance_result, text, boolean, boolean) to authenticated;
