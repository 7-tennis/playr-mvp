# PlayR Foundation Validation Guide

This guide is for validating the Foundation Phase before starting the Integration Phased Plan.

## Migration Apply Order

Apply the migrations in timestamp order. For the Foundation hardening work, make sure these two are applied in order:

1. `supabase/migrations/202607120001_fix_admin_users_rls_recursion.sql`
2. `supabase/migrations/202607120002_playr_foundation_phase.sql`

The Supabase CLI is preferred when available. If the CLI is not installed, use the Supabase SQL Editor and paste each migration file as one script, in the order above.

Do not use the service role key from the app. Run these as a database owner/admin inside Supabase SQL Editor.

## Preflight SQL Checks

Run these before applying `202607120002_playr_foundation_phase.sql`:

```sql
select
  to_regclass('public.profiles') as profiles,
  to_regclass('public.admin_users') as admin_users,
  to_regclass('public.venues') as venues,
  to_regclass('public.coach_lessons') as coach_lessons,
  to_regclass('public.courts') as courts,
  to_regclass('public.court_bookings') as court_bookings;
```

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'venues'
  and column_name in ('id', 'name', 'slug', 'status', 'organisation_type')
order by column_name;
```

```sql
select column_name, udt_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'admin_users'
  and column_name in ('user_id', 'role', 'venue_id', 'deactivated_at');
```

Expected:

- All `to_regclass` values should not be null.
- `venues.organisation_type` should already exist from the organisation onboarding migration.
- `admin_users.venue_id` and `admin_users.deactivated_at` should exist.

## Post-Migration SQL Checks

```sql
select
  to_regclass('public.organisation_memberships') as organisation_memberships,
  to_regclass('public.organisation_invitations') as organisation_invitations,
  to_regclass('public.organisation_player_links') as organisation_player_links,
  to_regclass('public.coach_player_assignments') as coach_player_assignments,
  to_regclass('public.organisation_programs') as organisation_programs,
  to_regclass('public.organisation_program_assignments') as organisation_program_assignments,
  to_regclass('public.user_active_organisations') as user_active_organisations;
```

```sql
select typname
from pg_type
where typnamespace = 'public'::regnamespace
  and typname in (
    'organisation_role',
    'organisation_membership_status',
    'organisation_invitation_status',
    'organisation_invitation_kind',
    'organisation_link_status',
    'organisation_assignment_status',
    'organisation_program_role'
  )
order by typname;
```

```sql
select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organisation_memberships',
    'organisation_invitations',
    'organisation_player_links',
    'coach_player_assignments',
    'organisation_programs',
    'organisation_program_assignments',
    'user_active_organisations'
  )
order by tablename, policyname;
```

## Diagnostic Page

After deployment, sign in as a `platform_admin` and open:

```text
/admin/foundation
```

Use it to check:

- organisations and organisation types
- primary admin and head coach
- active and pending memberships
- pending invitations
- active and pending player links
- coach-player assignments
- selected active organisation per user

Invitation tokens are intentionally hidden on the diagnostic page.

## Pilot Setup Without Auto-Seed

Use `/admin/organisations` for pilot setup:

1. Create `Timeless Tennis` as `academy`.
2. Confirm `Kenmare Tennis Club` remains `club` or the correct current type.
3. Create one school organisation with non-real demo contact details if needed.
4. Assign or invite one organisation admin for each active pilot organisation.
5. Assign or invite a head coach for Timeless Tennis.
6. From CoachR Manage Coaches, invite at least two coaches.
7. From CoachR Students, create one parent-approved junior link request.
8. Accept one coach invitation and one junior-link invitation with test accounts.
9. Verify `/admin/foundation` shows active and pending records as expected.

Do not add real personal contact details to demo records.

## Manual Acceptance Checklist

- Platform admin can create `Timeless Tennis` separately from Kenmare.
- Organisation type `academy` saves correctly.
- Existing Kenmare courts/bookings remain unchanged.
- Organisation admin/head coach assignment creates active membership rows.
- CoachR Manage Coaches opens for an active head coach without login redirect.
- Ordinary coach receives access restricted for coach-management tools.
- Pending coach invitations show separately from active coaches.
- Coach invitation acceptance creates one active membership and does not duplicate rows.
- Decline, cancel, expired and duplicate invitation states are handled clearly.
- Parent-approved player-link request creates a pending invitation.
- Pending junior request does not expose the junior as an authorised student.
- Parent acceptance activates `organisation_player_links`.
- Intended coach assignment creates `coach_player_assignments`.
- Multi-organisation switcher shows active memberships only.
- Switching organisation updates `user_active_organisations`.
- Removed/suspended memberships no longer provide management access.

## RLS Smoke Tests

Use signed-in anon/authenticated clients, not service-role queries, when validating RLS.

- A member can select their own `organisation_memberships` rows.
- An unrelated user cannot select another organisation's memberships.
- A manager can view invitations for their organisation.
- An unrelated user cannot view invitation rows not addressed to their email.
- A coach cannot update organisation role memberships.
- A parent can view only relevant junior player-link requests.
- `user_active_organisations` can only be read/updated by the owning user.

## Known Limits Before Integration Plan

- Email/SMS delivery is not implemented. Invitation links are manually copied.
- Program/team UI remains schema-ready only.
- TeamR dashboards are intentionally not implemented.
- Live Supabase validation must be completed before marking the Foundation Phase ready.
