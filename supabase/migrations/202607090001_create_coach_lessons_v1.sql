create type public.coach_lesson_type as enum ('private', 'group', 'squad', 'matchplay', 'assessment', 'other');
create type public.coach_lesson_status as enum ('scheduled', 'completed', 'missed', 'cancelled', 'rain', 'sick');
create type public.coach_lesson_attendance_status as enum ('not_marked', 'attended', 'partial', 'missed', 'excused');
create type public.coach_lesson_feedback_status as enum ('not_started', 'draft', 'shared', 'completed');

create table public.coach_lessons (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  coach_id uuid not null references public.profiles(id) on delete restrict,
  player_id uuid not null references public.profiles(id) on delete restrict,
  junior_profile_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.profiles(id) on delete set null,
  court_id uuid references public.courts(id) on delete set null,
  court_booking_id uuid references public.court_bookings(id) on delete set null,
  lesson_type public.coach_lesson_type not null default 'private',
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  repeat_rule text,
  recurring_group_id uuid,
  status public.coach_lesson_status not null default 'scheduled',
  attendance_status public.coach_lesson_attendance_status not null default 'not_marked',
  feedback_status public.coach_lesson_feedback_status not null default 'not_started',
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_lessons_title_not_blank check (length(btrim(title)) > 0),
  constraint coach_lessons_time_order check (end_time > start_time),
  constraint coach_lessons_cancelled_at_status check (status in ('cancelled', 'rain', 'sick') or cancelled_at is null),
  constraint coach_lessons_junior_matches_player check (junior_profile_id is null or junior_profile_id = player_id)
);

create index coach_lessons_venue_start_idx on public.coach_lessons(venue_id, start_time);
create index coach_lessons_coach_start_idx on public.coach_lessons(coach_id, start_time);
create index coach_lessons_player_start_idx on public.coach_lessons(player_id, start_time);
create index coach_lessons_parent_id_idx on public.coach_lessons(parent_id);
create index coach_lessons_court_booking_id_idx on public.coach_lessons(court_booking_id);
create index coach_lessons_recurring_group_id_idx on public.coach_lessons(recurring_group_id);
create index coach_lessons_status_idx on public.coach_lessons(status);

create trigger coach_lessons_set_updated_at
before update on public.coach_lessons
for each row execute function public.set_updated_at();

create or replace function public.coach_profile_belongs_to_user(check_coach_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles coach
    where coach.id = check_coach_id
      and coach.user_id = check_user_id
      and coach.is_junior = false
  );
$$;

create or replace function public.coach_profile_can_teach_at_venue(check_coach_id uuid, check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.coach_profile_belongs_to_user(check_coach_id, check_user_id)
      or public.can_manage_venue(check_venue_id, check_user_id)
    )
    and exists (
      select 1
      from public.profiles coach
      join public.admin_users role_row
        on role_row.user_id = coach.user_id
      where coach.id = check_coach_id
        and coach.is_junior = false
        and role_row.venue_id = check_venue_id
        and role_row.role::text in ('coach', 'head_coach')
    );
$$;

create or replace function public.coach_can_manage_own_lesson(check_coach_id uuid, check_venue_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.coach_profile_belongs_to_user(check_coach_id, check_user_id)
    and public.coach_profile_can_teach_at_venue(check_coach_id, check_venue_id, check_user_id)
    and exists (
      select 1
      from public.admin_users role_row
      where role_row.user_id = check_user_id
        and role_row.user_id = (select auth.uid())
        and role_row.role::text = 'coach'
        and role_row.venue_id = check_venue_id
    );
$$;

create or replace function public.can_manage_coach_lesson(check_lesson_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.coach_lessons lesson
    where lesson.id = check_lesson_id
      and (
        public.coach_can_manage_own_lesson(lesson.coach_id, lesson.venue_id, check_user_id)
        or public.can_manage_venue(lesson.venue_id, check_user_id)
      )
  );
$$;

alter table public.coach_lessons enable row level security;

grant select, insert, update, delete on public.coach_lessons to authenticated;

create policy "CoachR users can read permitted lessons"
on public.coach_lessons
for select
to authenticated
using (
  public.coach_can_manage_own_lesson(coach_id, venue_id)
  or public.can_manage_venue(venue_id)
);

create policy "CoachR users can create permitted lessons"
on public.coach_lessons
for insert
to authenticated
with check (
  public.can_access_coachr()
  and (
    public.coach_can_manage_own_lesson(coach_id, venue_id)
    or (
      public.can_manage_venue(venue_id)
      and public.coach_profile_can_teach_at_venue(coach_id, venue_id)
    )
  )
);

create policy "CoachR users can update permitted lessons"
on public.coach_lessons
for update
to authenticated
using (
  public.coach_can_manage_own_lesson(coach_id, venue_id)
  or public.can_manage_venue(venue_id)
)
with check (
  public.can_access_coachr()
  and (
    public.coach_can_manage_own_lesson(coach_id, venue_id)
    or (
      public.can_manage_venue(venue_id)
      and public.coach_profile_can_teach_at_venue(coach_id, venue_id)
    )
  )
);

create policy "CoachR users can delete permitted lessons"
on public.coach_lessons
for delete
to authenticated
using (
  public.coach_can_manage_own_lesson(coach_id, venue_id)
  or public.can_manage_venue(venue_id)
);

create policy "CoachR venue managers can read venue coach profiles"
on public.profiles
for select
to authenticated
using (
  is_junior = false
  and exists (
    select 1
    from public.admin_users role_row
    where role_row.user_id = profiles.user_id
      and role_row.role::text in ('coach', 'head_coach')
      and public.can_manage_venue(role_row.venue_id)
  )
);

create policy "CoachR users can read lesson-linked profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_lessons lesson
    where (
        lesson.coach_id = profiles.id
        or lesson.player_id = profiles.id
        or lesson.junior_profile_id = profiles.id
        or lesson.parent_id = profiles.id
      )
      and (
        public.coach_can_manage_own_lesson(lesson.coach_id, lesson.venue_id)
        or public.can_manage_venue(lesson.venue_id)
      )
  )
);
