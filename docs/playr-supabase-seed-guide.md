# PlayR Supabase QA Seed Guide

This guide helps create safe, controlled QA/demo data for testing the PlayR player experience and ClubR admin experience.

It is documentation only. It does not replace migrations, change RLS, or add an automatic seed process.

## Purpose

Use this guide when you need a predictable QA setup for:

- Player signup, login, profile, junior profile, bookings, events, match invites, results, and ratings.
- ClubR admin review of players, courts, bookings, events, entries, and results.
- Controlled demos using clearly labeled non-production data.

## Safety Notes

- Prefer a local Supabase project or dedicated test Supabase project.
- Do not run seed SQL blindly against production.
- Review the current migrations before running any SQL.
- Confirm table names, enum values, constraints, and required columns in your actual database.
- Create Supabase Auth users through the Supabase Auth UI when possible before inserting linked profile or admin rows.
- RLS may affect inserts depending on whether SQL is run from the SQL editor, a service role connection, or an authenticated client.
- SQL run in the Supabase SQL editor often has elevated privileges. That can hide RLS issues that a real user would hit in the app.
- Use obvious QA names, emails, slugs, and notes so test records are easy to identify and remove later.

## Required Test Accounts

Create these users in Supabase Auth first:

- Player QA account: `player.qa@example.com`
- ClubR admin QA account: `admin.qa@example.com`
- Optional second player QA account: `player2.qa@example.com`

The second player is useful for match invite acceptance, result confirmation, disputes, and rating workflow checks.

## Required Setup Data

Minimum useful QA data:

- One venue, if your database includes `public.venues`.
- Two active courts.
- One published future event.
- One adult player profile linked to the Player QA auth user.
- One optional junior profile linked to the adult player profile.
- One `admin_users` row linked to the ClubR admin auth user.
- Optional sample rating for the player profile.
- Optional sample court booking.
- Optional sample event entry.

## SQL Templates

Review before running. Replace placeholders and check current migrations first.

### 1. Look Up Auth User IDs

Run this after creating users in Supabase Auth.

```sql
-- Review before running.
select
  id,
  email,
  created_at
from auth.users
where email in (
  'player.qa@example.com',
  'admin.qa@example.com',
  'player2.qa@example.com'
)
order by email;
```

For later examples, copy these values:

```sql
-- Replace these placeholders manually in later SQL.
-- PLAYER_USER_ID = auth.users.id for player.qa@example.com
-- ADMIN_USER_ID = auth.users.id for admin.qa@example.com
-- PLAYER2_USER_ID = auth.users.id for player2.qa@example.com
```

### 2. Create Or Check A Venue

Use this only if your schema has `public.venues`.

```sql
-- Review before running.
-- Creates a generic PlayR pilot venue if it does not already exist.
insert into public.venues (
  name,
  slug,
  status
)
values (
  'PlayR Pilot Club',
  'playr-pilot-club',
  'active'
)
on conflict (slug) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = now()
returning id, name, slug, status;
```

Save the returned `id` as:

```sql
-- VENUE_ID = returned public.venues.id
```

### 3. Create Two Active Courts

If `public.courts.venue_id` exists, include it. If not, remove the `venue_id` column and value.

```sql
-- Review before running.
-- Replace <VENUE_ID> with a real UUID, or remove venue_id if not present.
insert into public.courts (
  name,
  status,
  sort_order,
  notes,
  venue_id
)
values
  ('QA Court 1', 'active', 101, 'QA/demo court', '<VENUE_ID>'),
  ('QA Court 2', 'active', 102, 'QA/demo court', '<VENUE_ID>')
on conflict (name) do update
set
  status = excluded.status,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  venue_id = excluded.venue_id,
  updated_at = now()
returning id, name, status, sort_order, venue_id;
```

If your `courts` table does not have `venue_id`, use:

```sql
-- Review before running.
insert into public.courts (
  name,
  status,
  sort_order,
  notes
)
values
  ('QA Court 1', 'active', 101, 'QA/demo court'),
  ('QA Court 2', 'active', 102, 'QA/demo court')
on conflict (name) do update
set
  status = excluded.status,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  updated_at = now()
returning id, name, status, sort_order;
```

Save one returned court ID as:

```sql
-- COURT_ID = returned public.courts.id for QA Court 1
```

### 4. Create Or Update Player Profiles

Use this after looking up `PLAYER_USER_ID`.

```sql
-- Review before running.
-- Replace <PLAYER_USER_ID> with auth.users.id for player.qa@example.com.
insert into public.profiles (
  user_id,
  first_name,
  last_name,
  email,
  phone,
  is_junior,
  member_status,
  player_level,
  primary_sport,
  marketing_consent,
  notes
)
values (
  '<PLAYER_USER_ID>',
  'Player',
  'QA',
  'player.qa@example.com',
  '+27000000001',
  false,
  'member',
  'social',
  'tennis',
  false,
  'QA adult player profile'
)
on conflict (user_id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  member_status = excluded.member_status,
  player_level = excluded.player_level,
  primary_sport = excluded.primary_sport,
  marketing_consent = excluded.marketing_consent,
  notes = excluded.notes,
  updated_at = now()
returning id, user_id, first_name, last_name, email;
```

Save the returned `id` as:

```sql
-- PLAYER_PROFILE_ID = returned public.profiles.id
```

Optional second player:

```sql
-- Review before running.
-- Replace <PLAYER2_USER_ID> with auth.users.id for player2.qa@example.com.
insert into public.profiles (
  user_id,
  first_name,
  last_name,
  email,
  phone,
  is_junior,
  member_status,
  player_level,
  primary_sport,
  marketing_consent,
  notes
)
values (
  '<PLAYER2_USER_ID>',
  'Second',
  'Player',
  'player2.qa@example.com',
  '+27000000002',
  false,
  'non_member',
  'social',
  'tennis',
  false,
  'QA second player profile'
)
on conflict (user_id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  member_status = excluded.member_status,
  player_level = excluded.player_level,
  primary_sport = excluded.primary_sport,
  marketing_consent = excluded.marketing_consent,
  notes = excluded.notes,
  updated_at = now()
returning id, user_id, first_name, last_name, email;
```

### 5. Create An Optional Junior Profile

Use this after saving `PLAYER_PROFILE_ID`.

```sql
-- Review before running.
-- Replace <PLAYER_PROFILE_ID> with the adult parent profile ID.
insert into public.profiles (
  first_name,
  last_name,
  email,
  phone,
  date_of_birth,
  is_junior,
  parent_profile_id,
  member_status,
  player_level,
  primary_sport,
  junior_stage,
  marketing_consent,
  notes
)
values (
  'Junior',
  'QA',
  null,
  null,
  '2014-01-15',
  true,
  '<PLAYER_PROFILE_ID>',
  'pending',
  'beginner',
  'tennis',
  'green_ball',
  false,
  'QA linked junior profile'
)
returning id, first_name, last_name, parent_profile_id;
```

Save the returned `id` as:

```sql
-- JUNIOR_PROFILE_ID = returned public.profiles.id
```

If your database does not have `profiles.junior_stage`, remove that column and value.

### 6. Add ClubR Admin Access

Use this after looking up `ADMIN_USER_ID`.

```sql
-- Review before running.
-- Replace <ADMIN_USER_ID> with auth.users.id for admin.qa@example.com.
insert into public.admin_users (
  user_id,
  role,
  created_by
)
values (
  '<ADMIN_USER_ID>',
  'admin',
  '<ADMIN_USER_ID>'
)
on conflict (user_id) do update
set role = excluded.role
returning id, user_id, role;
```

### 7. Create A Published Future Event

Use this after creating or choosing an admin user.

```sql
-- Review before running.
-- Replace <ADMIN_USER_ID> with an admin auth user ID.
insert into public.events (
  title,
  slug,
  description,
  sport,
  category,
  age_group,
  start_datetime,
  end_datetime,
  location,
  member_price,
  non_member_price,
  max_entries,
  status,
  created_by
)
values (
  'QA Sunday Singles',
  'qa-sunday-singles',
  'Controlled QA event for PlayR testing.',
  'tennis',
  'Singles',
  'Open',
  now() + interval '7 days',
  now() + interval '7 days' + interval '3 hours',
  'PlayR Pilot Club',
  50.00,
  80.00,
  16,
  'published',
  '<ADMIN_USER_ID>'
)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  sport = excluded.sport,
  category = excluded.category,
  age_group = excluded.age_group,
  start_datetime = excluded.start_datetime,
  end_datetime = excluded.end_datetime,
  location = excluded.location,
  member_price = excluded.member_price,
  non_member_price = excluded.non_member_price,
  max_entries = excluded.max_entries,
  status = excluded.status,
  created_by = excluded.created_by,
  updated_at = now()
returning id, title, slug, status, start_datetime;
```

Save the returned `id` as:

```sql
-- EVENT_ID = returned public.events.id
```

If your app is using the later compatibility fields (`starts_at`, `ends_at`, `capacity`, `entry_fee`, `event_type`), the migration trigger should sync them from these fields. Confirm that in your current database before relying on it.

### 8. Create An Optional Sample Rating

Use this only if `public.ratings` exists.

```sql
-- Review before running.
-- Replace <PLAYER_PROFILE_ID> with public.profiles.id.
insert into public.ratings (
  profile_id,
  rating_value,
  starting_rating,
  confidence,
  verified_match_count,
  provisional,
  last_calculated_at
)
values (
  '<PLAYER_PROFILE_ID>',
  3.50,
  3.50,
  'low',
  0,
  true,
  now()
)
on conflict (profile_id) do update
set
  rating_value = excluded.rating_value,
  starting_rating = excluded.starting_rating,
  confidence = excluded.confidence,
  verified_match_count = excluded.verified_match_count,
  provisional = excluded.provisional,
  last_calculated_at = excluded.last_calculated_at,
  updated_at = now()
returning profile_id, rating_value, confidence, verified_match_count, provisional;
```

### 9. Create An Optional Sample Booking

Use this only when you want a booking to exist before testing.

The booking overlap constraint will reject a booking if another confirmed booking already overlaps the same court/time.

```sql
-- Review before running.
-- Replace placeholders with real IDs.
insert into public.court_bookings (
  court_id,
  booked_by_user_id,
  player_profile_id,
  start_time,
  end_time,
  status,
  booking_type,
  is_public,
  notes
)
values (
  '<COURT_ID>',
  '<PLAYER_USER_ID>',
  '<PLAYER_PROFILE_ID>',
  date_trunc('hour', now() + interval '2 days' + interval '10 hours'),
  date_trunc('hour', now() + interval '2 days' + interval '11 hours'),
  'confirmed',
  'player_booking',
  false,
  'QA sample booking'
)
returning id, court_id, player_profile_id, start_time, end_time, status;
```

### 10. Create An Optional Sample Event Entry

Use this only when you want an entry to exist before testing.

```sql
-- Review before running.
-- Replace placeholders with real IDs.
insert into public.event_entries (
  event_id,
  profile_id,
  entered_by_user_id,
  price_charged,
  payment_status,
  entry_status,
  notes
)
values (
  '<EVENT_ID>',
  '<PLAYER_PROFILE_ID>',
  '<PLAYER_USER_ID>',
  50.00,
  'unpaid',
  'active',
  'QA sample event entry'
)
on conflict (event_id, profile_id) do update
set
  price_charged = excluded.price_charged,
  payment_status = excluded.payment_status,
  entry_status = excluded.entry_status,
  notes = excluded.notes,
  updated_at = now()
returning id, event_id, profile_id, payment_status, entry_status;
```

If your database has the later partial unique index for active entries instead of the original full unique constraint, this `on conflict (event_id, profile_id)` may not work. In that case, either create the entry through the app UI or use a guarded insert:

```sql
-- Review before running.
insert into public.event_entries (
  event_id,
  profile_id,
  entered_by_user_id,
  price_charged,
  payment_status,
  entry_status,
  notes
)
select
  '<EVENT_ID>',
  '<PLAYER_PROFILE_ID>',
  '<PLAYER_USER_ID>',
  50.00,
  'unpaid',
  'active',
  'QA sample event entry'
where not exists (
  select 1
  from public.event_entries
  where event_id = '<EVENT_ID>'
    and profile_id = '<PLAYER_PROFILE_ID>'
    and coalesce(status, entry_status) <> 'withdrawn'
    and entry_status <> 'cancelled'
)
returning id, event_id, profile_id, payment_status, entry_status;
```

## Manual Setup Alternative

You can create much of the QA data through the app instead of SQL:

- Signup: use `/signup`.
- Login: use `/login`.
- Player profile creation: use `/dashboard/profile`.
- Junior player creation: use `/dashboard/juniors`.
- Court creation: use ClubR `/admin/courts`.
- Court blocks/bookings review: use ClubR `/admin/bookings`.
- Event creation and publishing: use ClubR `/admin/events` and `/admin/events/new`.
- Court booking: use PlayR `/dashboard/book-court`.
- Event entry: use PlayR `/dashboard/events`.
- Entry payment/status review: use ClubR `/admin/entries` or `/admin/events/[id]/entries`.
- Result capture/review: use ClubR `/admin/results`.

Recommended approach:

- Use Supabase Auth UI to create test users.
- Use SQL only for admin access and any baseline data that is hard to create before admin access exists.
- Use the app UI for the actual player and ClubR workflows whenever possible.

## Recommended QA Run Order

1. Create auth users:
   - `player.qa@example.com`
   - `admin.qa@example.com`
   - optional `player2.qa@example.com`
2. Look up auth user IDs from `auth.users`.
3. Insert the ClubR admin row in `admin_users`.
4. Create or confirm venue and courts.
5. Create or publish one future event.
6. Log in as the player.
7. Complete the Player Profile.
8. Add a junior player if testing junior flows.
9. Book a court.
10. Enter an event.
11. Log in as the admin.
12. Review records in ClubR:
    - Players
    - Events
    - Entries
    - Courts
    - Bookings
    - Results
13. Test second-player match invite and result confirmation if available.

## Troubleshooting

### Admin Cannot Access ClubR

- Confirm the admin auth user exists in Supabase Auth.
- Confirm `public.admin_users.user_id` matches the admin auth user ID exactly.
- Confirm the user is logged in as the admin account, not the player account.
- Confirm the app is using the same Supabase project where the admin row was inserted.

### Player Cannot See Booking Slots

- Confirm there is at least one `active` court.
- Confirm the player is logged in.
- Confirm the player has an adult profile linked by `profiles.user_id`.
- Confirm the selected date is inside the normal booking window.
- Confirm the court is not fully blocked by existing confirmed bookings.

### Event Does Not Appear Publicly

- Confirm `events.status = 'published'`.
- Confirm the event start time is in the future.
- Confirm the app is reading from the expected Supabase project.
- Confirm public read policies for published events are applied.
- Confirm the event slug is unique and not blank.

### RLS Prevents Insert

- Check whether SQL is being run from the SQL editor, service role, or authenticated app client.
- Confirm the authenticated user owns or can manage the profile being inserted or updated.
- For admin operations, confirm `public.is_admin()` returns true for the current user.
- Do not weaken RLS just for seed data. Use the app UI or a controlled service role context in a test project.

### Profile Not Linked To Auth User

- Confirm `profiles.user_id` equals the correct `auth.users.id`.
- Confirm the profile is not marked as junior when it is meant to be the adult profile.
- Confirm adult profiles have `parent_profile_id is null`.
- Confirm junior profiles have `is_junior = true` and `parent_profile_id` set to the adult profile ID.

### Browser Shows Localhost Or 127.0.0.1 Connection Refused

- Confirm the dev server is running.
- Start it with:

```bash
npm run dev
```

- Wait until the terminal says the app is ready.
- Try `http://localhost:3000`.
- If `localhost` is blocked, try `http://127.0.0.1:3000`.
- If both fail, stop and restart the dev server.

## Cleanup Notes

When the QA pass is done, remove or archive obvious QA records if the project is shared:

- Profiles using `player.qa@example.com`, `admin.qa@example.com`, or `player2.qa@example.com`.
- Events with slugs like `qa-sunday-singles`.
- Courts named `QA Court 1` or `QA Court 2`.
- Bookings, entries, results, match invites, matches, ratings, and rating changes linked to QA profiles.

Do cleanup only in a controlled test project unless you have a confirmed production-safe data retention process.

