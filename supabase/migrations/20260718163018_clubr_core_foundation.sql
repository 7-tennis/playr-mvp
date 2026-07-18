-- ClubR staff roles are committed separately before later migrations reference
-- the new enum values.

alter type public.organisation_role add value if not exists 'committee';
alter type public.organisation_role add value if not exists 'reception';
