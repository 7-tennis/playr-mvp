-- Kept separate because PostgreSQL requires a newly added enum value to be
-- committed before functions and policies can safely reference it.
alter type public.organisation_invitation_kind
  add value if not exists 'player';
