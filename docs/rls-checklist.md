# CourtSide MVP RLS Checklist

This checklist records the intended production RLS shape for the MVP. The app also performs server-side route/action checks, but the database should remain the final boundary.

## Profiles

- Admins listed in `admin_users` can manage all profiles.
- Authenticated users can create, read, and update one adult profile where `profiles.user_id = auth.uid()` and `is_junior = false`.
- Junior profiles are separate rows with `is_junior = true`.
- Parents/guardians can read, create, update, and delete junior profiles only when `parent_profile_id` points to their own adult profile.
- Normal users should not be able to read profiles owned by other users or linked to other parents.

## Events

- Public visitors can read events with `status in ('published', 'completed')`.
- Public event listings should still filter to published, upcoming events in application code.
- Admins can create, update, publish, complete, and cancel events.
- Draft and cancelled events should stay admin-only.

## Event Entries

- Authenticated users can read entries only for their own adult profile or linked juniors.
- Authenticated users can create entries only when `entered_by_user_id = auth.uid()` and the selected profile is their own adult profile or linked junior.
- Admins can manage all entries.
- Duplicate entries are prevented by the database unique constraint on `(event_id, profile_id)`.
- The MVP uses `entry_status` values: `active`, `cancelled`, `checked_in`, `no_show`.

## Event Results

- Authenticated users can read results only for their own adult profile or linked juniors.
- Public visitors can read results only for events that are public for results, currently `published` or `completed`.
- Public pages must show only player display names, placement, and points. Result notes remain private to dashboards/admin.
- Admins can manage all results.
- Duplicate results are prevented by the database unique constraint on `(event_id, profile_id)`.

## Admin Users

- Authenticated users can read only their own `admin_users` row to determine whether admin navigation should appear.
- Existing admins can manage admin user rows.
- All admin pages and admin server actions must call the server-side admin check before reading or mutating protected data.

## Status Values

- Event statuses: `draft`, `published`, `cancelled`, `completed`.
- UI "closed" maps to `completed`; no separate `closed` status exists in the MVP schema.
- Payment statuses: `unpaid`, `pending`, `paid`, `refunded`, `cancelled`.
- Payment status `waived` is not part of the current MVP schema.
- Entry statuses: `active`, `cancelled`, `checked_in`, `no_show`.
- Entry statuses `withdrawn` and `waitlisted` are not part of the current MVP schema.

## Pre-Production Checks

- Apply all migrations in `supabase/migrations`.
- Confirm RLS is enabled on `profiles`, `events`, `event_entries`, `event_results`, and `admin_users`.
- Confirm public anon users can read published upcoming events and public results only.
- Confirm authenticated non-admin users cannot read another user's profile, junior profiles, entries, or private results.
- Confirm admin actions fail for non-admin users even when posted directly.
