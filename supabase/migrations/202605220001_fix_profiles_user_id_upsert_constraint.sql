do $$
begin
  if exists (
    select 1
    from pg_class index_class
    join pg_namespace index_namespace
      on index_namespace.oid = index_class.relnamespace
    where index_namespace.nspname = 'public'
      and index_class.relname = 'profiles_user_id_unique'
      and index_class.relkind = 'i'
  )
  and not exists (
    select 1
    from pg_constraint
    where conindid = 'public.profiles_user_id_unique'::regclass
  ) then
    drop index public.profiles_user_id_unique;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_user_id_unique'
  ) then
    alter table public.profiles
      add constraint profiles_user_id_unique unique (user_id);
  end if;
end;
$$;
