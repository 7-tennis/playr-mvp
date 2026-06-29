alter table public.profiles
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz;

update public.profiles
set marketing_consent_at = null
where marketing_consent = false
  and marketing_consent_at is not null;
