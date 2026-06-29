alter table public.profiles
  add column if not exists junior_stage text;

alter table public.profiles
  drop constraint if exists profiles_junior_stage_valid;

alter table public.profiles
  add constraint profiles_junior_stage_valid check (
    junior_stage is null
    or junior_stage in ('red_ball', 'orange_ball', 'green_ball', 'yellow_ball', 'not_sure')
  );

create index if not exists profiles_junior_stage_idx
on public.profiles(junior_stage)
where is_junior = true;
