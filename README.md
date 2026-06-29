# PlayR MVP

PlayR is a connected tennis platform for player ratings, club events, court bookings, and coach feedback.

PlayR Technologies is the parent company. PlayR is the player-facing experience, ClubR is the club/admin module, and CoachR is a future coach workflow. This MVP currently keeps those role-based experiences in one Next.js and Supabase app.

This repository contains the initial MVP foundation:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase client placeholders
- Public event pages
- Auth page placeholders
- Player dashboard placeholders
- Admin dashboard placeholders
- Core legacy CourtSide domain types used by the current codebase

## MVP Scope

Phase 1 focuses on:

- Player and parent profiles
- Junior profiles linked to parents
- Member and non-member status
- Event listings and event detail pages
- Event entries
- Manual payment status tracking
- Admin management for profiles, events, entries, and simple results

Online payments, ratings, leagues, full bookings, native mobile apps, and multi-club support are intentionally out of scope for the first build.

## Getting Started

Install dependencies:

```bash
npm install
```

Copy the environment example:

```bash
cp .env.example .env.local
```

Add Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase Setup

Create a Supabase project, then copy the project URL and publishable key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

The MVP database schema lives in `supabase/migrations` and creates:

- `profiles` for adult and junior player profiles
- `events` for tennis, pickleball, futsal, and multi-sport events
- `event_entries` for event signups, manual payment tracking, and entry status
- `event_results` for simple placements, points, and result notes
- `admin_users` for admin and staff access control

The migration enables Row Level Security on every table. Public users can read published events, signed-in users can manage their own profile and linked junior profiles, and admin users can manage the operational tables.

### Apply Migrations

Install and link the Supabase CLI if you have not already:

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
```

Apply the schema to your linked Supabase project:

```bash
supabase db push
```

For local Supabase development, run:

```bash
supabase start
supabase db reset
```

### Create the First Admin

After signing up the first admin user in the app, add that user to `admin_users` from the Supabase SQL editor or another service-role connection:

```sql
insert into public.admin_users (user_id, role)
values ('00000000-0000-0000-0000-000000000000', 'admin');
```

Replace the UUID with the user's `auth.users.id`. Once the first admin exists, admins can manage other admins through the app or SQL.

### Seed Example Events

The seed file at `supabase/seed.sql` creates:

- Sunday Showdown Tennis Open
- Sunday Showdown Pickleball Open Mixed
- Green Ball Primary School Event

Seed a linked remote project from the Supabase SQL editor, or with `psql` using your database connection string:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

For local Supabase, `supabase db reset` applies migrations and runs `supabase/seed.sql` automatically.

## Route Structure

```txt
/
/about
/events
/events/[slug]
/dashboard
/dashboard/profile
/dashboard/my-entries
/dashboard/juniors
/admin
/admin/profiles
/admin/events
/admin/events/new
/admin/events/[id]
/admin/events/[id]/entries
/admin/entries
/admin/results
/login
/signup
```

## Important Files

- `types/courtside.ts` contains legacy MVP domain types that have not been renamed yet for technical safety.
- `utils/supabase/client.ts` contains the browser Supabase client helper.
- `utils/supabase/server.ts` contains the server Supabase client helper.
- `utils/supabase/middleware.ts` keeps Supabase auth sessions refreshed.
- `lib/mock-data.ts` contains temporary event data for early UI work.
- `supabase/migrations/202605190001_create_courtside_mvp_schema.sql` contains the MVP database schema and RLS policies.
- `supabase/seed.sql` contains example event data.
- `tailwind.config.ts` contains the initial `court.*` color namespace, which is intentionally unchanged for now.

## Next Tasks

1. Replace mock events with Supabase queries.
2. Connect Supabase Auth for signup, login, logout, and password reset.
3. Implement event entry creation with member/non-member pricing and duplicate-entry prevention.
4. Protect admin routes using the `admin_users` table.

Keep implementation decisions focused on the MVP. When a feature starts to look like ratings, leagues, bookings, online payments, or multi-club infrastructure, leave a TODO and keep the launch path simple.
