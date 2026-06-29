create or replace function public.event_results_are_public(check_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.events
    where id = check_event_id
      and status in ('published', 'completed')
  );
$$;

drop policy if exists "Public users can read published events" on public.events;
drop policy if exists "Public users can read public events" on public.events;

create policy "Public users can read public events"
on public.events
for select
using (status in ('published', 'completed') or public.is_admin());

drop policy if exists "Public users can read public event results" on public.event_results;

create policy "Public users can read public event results"
on public.event_results
for select
using (public.event_results_are_public(event_id));
