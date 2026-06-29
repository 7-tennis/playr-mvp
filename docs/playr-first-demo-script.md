# PlayR MVP First Demo Script

Use this guide for a first live walkthrough with a tennis club, coach, academy, or early pilot partner.

The goal is not to present PlayR as finished. The goal is to show the connected participation loop, gather feedback, and identify the highest-value pilot flow.

## 1. Demo Purpose

This demo shows PlayR as a connected tennis platform for:

- Player ratings
- Court bookings
- Club events
- Match results
- ClubR admin operations
- Future CoachR direction

PlayR is the player-facing experience. ClubR is the club/admin experience. CoachR is future-facing only at this stage.

## 2. Demo Preparation Checklist

Before the demo, confirm:

- Dev server is running with `npm run dev`.
- Browser opens the app.
- Use `http://127.0.0.1:3000` if `localhost` is blocked.
- Test player account is ready.
- ClubR admin account is ready.
- Optional second player account is ready for match invite/result confirmation testing.
- At least two courts exist and are active.
- At least one event is published and starts in the future.
- Player profile is completed.
- Optional junior profile is linked to the player account.
- ClubR admin user exists in `admin_users`.
- You know which flows are fully ready and which are future-facing.

Suggested tabs:

- Public site: `/`
- Player dashboard: `/dashboard`
- ClubR admin: `/admin`

## 3. Opening Talk Track

“PlayR is a connected tennis platform that helps players, clubs, and coaches organise ratings, bookings, events, and match activity in one place.

The idea is to reduce scattered admin across WhatsApp, spreadsheets, paper notes, and separate booking systems. Players get a simple home for their profile, court bookings, events, match activity, and progress. Clubs get ClubR, an operational layer for managing courts, events, entries, bookings, players, payments status, and results. CoachR is the future coaching module, aimed at schedules, lesson notes, feedback, and development tracking.

Today I’ll show the MVP loop: a player can create a profile, book a court, enter an event, use the Play flow for match activity, and the club can review everything in ClubR.”

## 4. Public Site Walkthrough

### Homepage

Open `/`.

What to say:

- “This is the public entry point for PlayR.”
- “The positioning is simple: ratings, club events, court bookings, and coach feedback in one connected platform.”
- “A player can browse public information, then log in or sign up when they are ready to participate.”

What to click:

- Click `Browse events`.
- Return to the homepage.
- Click `Sign up` or `Log in` if showing the account entry point.

### About Page

Open `/about`.

What to say:

- “This page explains the ecosystem: PlayR for players, ClubR for club operations, and CoachR as a future module.”
- “The MVP is currently one app with role-based experiences, not separate products.”

What to check:

- CoachR is described as future direction, not as a complete working feature.

### Public Events

Open `/events`.

What to say:

- “Published upcoming events can be browsed publicly.”
- “Logged-out users can see what is available, but they need an account before entering.”

What to click:

- If an event is visible, open the event detail page.
- If no events are visible, use the empty state as a prompt to explain that ClubR controls event publishing.

### Signup/Login

Open `/signup` and `/login`.

What to say:

- “The MVP uses email/password auth through Supabase.”
- “Players may need to verify their email before logging in.”
- “Cellphone number is collected separately for important account, booking, lesson, and club-related communication.”
- “Marketing consent is optional and separate from service communication.”

## 5. Player Walkthrough

### My PlayR

Open `/dashboard`.

What it proves:

- The player has a clear action hub.
- The four pillars are visible:
  - Book a Court
  - Find Match
  - Join Event
  - My Progress
- The player can see next booking, action-needed items, profile completion, and PlayR Rating.

What to say:

- “My PlayR is the player’s home base. It answers: what can I do next, what needs my attention, and how am I progressing?”

### Player Profile

Open `/dashboard/profile`.

What it proves:

- Players have a structured profile.
- Profile data links the account to bookings, events, juniors, results, and ratings.
- PlayR Rating is shown as provisional until enough verified matches exist.

What to say:

- “The profile is the foundation for participation. It makes bookings, events, junior management, and progress tracking possible.”

### Junior Players

Open `/dashboard/juniors`.

What it proves:

- Parents/guardians can manage linked junior players.
- Junior players do not need their own login yet.
- Juniors can later be selected for bookings, events, match activity, and progress.

What to say:

- “This is important for clubs and academies because parents often manage participation for children.”

### Book a Court

Open `/dashboard/book-court`.

What it proves:

- Players can see active courts.
- Available, booked, blocked, and own-booking states are visually distinct.
- A player can book for themself or a linked junior.

What to click:

- Select a court.
- Select a date.
- Click an available slot.
- Confirm the booking if test data allows.

### My Bookings

Open `/dashboard/my-bookings`.

What it proves:

- Players can see upcoming and past/cancelled bookings.
- Booking records are tied to the correct player profile.

### Events

Open `/dashboard/events`.

What it proves:

- Logged-in players can browse available club events.
- Players can enter themselves or linked juniors.
- Entry availability and payment status are visible.

### My Entries

Open `/dashboard/my-entries`.

What it proves:

- Players can track event entries.
- Manual payment status and entry status are visible.
- Results can be linked later.

### Play

Open `/dashboard/play`.

What it proves:

- Players can send match invites.
- Invites can link to an existing booking or optionally create a new booking.
- Accepted invites can support result submission.

What to say:

- “This is the start of the Play layer. It is intentionally simple: invite, play, submit, confirm.”

### Results

Open `/dashboard/results`.

What it proves:

- Player-facing results have a home.
- Event and match result history can be shown without exposing admin/payment information.

### PlayR Rating

Show the rating card on `/dashboard` or `/dashboard/profile#progress`.

What to say:

- “The PlayR Rating is a simple MVP rating foundation. It is based on verified match results, not casual unconfirmed activity.”
- “We are not presenting it as a full national ranking engine yet. This is the starting point for trustworthy club-level progression.”

## 6. Event Flow Walkthrough

### Browse Event

Open `/dashboard/events` or `/events`.

What to say:

- “Events can be public for discovery and player-facing for entry.”

### Enter Event

On `/dashboard/events`:

- Select the player profile.
- Enter the event.
- Confirm the success message.

What it proves:

- Entries are linked to the correct event and profile.
- Duplicate entries are prevented.
- Manual payment status starts clearly.

### View Entry

Open `/dashboard/my-entries`.

What to say:

- “Players can see what they entered, who was entered, and the current payment/status state.”

### ClubR Admin Review

Open `/admin/entries` or `/admin/events/[id]/entries`.

What to say:

- “ClubR gives staff a practical view of entries, payment status, and attendance/result workflow.”

## 7. Booking Flow Walkthrough

### View Available Courts/Slots

Open `/dashboard/book-court`.

What to say:

- “The player sees a simple court and time grid for the next booking window.”

### Create Booking

- Select an available time.
- Choose `Booking for`.
- Confirm the booking.

What it proves:

- The booking is tied to the account and selected player profile.
- Parents can book for linked juniors.
- Overlap prevention is handled by the database.

### View Booking

Open `/dashboard/my-bookings`.

What to say:

- “Players can see upcoming bookings without needing to ask the club.”

### ClubR Admin Review

Open `/admin/bookings`.

What to say:

- “ClubR gives the club a view by date and court, plus the ability to block courts for maintenance, lessons, programmes, or competitions.”

## 8. Match, Results, And Rating Walkthrough

### Match Invite Flow

Open `/dashboard/play`.

If test data allows:

- Choose who is playing.
- Search/select opponent.
- Choose casual or verified match.
- Link an existing booking or book a new court/time.
- Send invite.

What to say:

- “This is a low-friction way to connect court time with match activity.”

### Submit And Confirm Result

If the optional second player account is ready:

- Log in as the second player.
- Accept the invite.
- Submit a result from one side.
- Confirm or dispute from the other side.

What to say:

- “Ratings should only move after verified or admin-verified results. That keeps the rating foundation more trustworthy.”

### View Results

Open `/dashboard/results` and `/dashboard/profile#progress`.

What to say:

- “Results and progress become a history players can understand.”

### Rating Foundation

What to say:

- “The current rating system is intentionally simple. It is an MVP formula based on verified match outcomes.”
- “We are avoiding overclaiming advanced ranking logic until there is enough real match data and club feedback.”

## 9. ClubR Admin Walkthrough

ClubR is the operational layer for clubs.

### ClubR Dashboard

Open `/admin`.

What it proves:

- Club staff can see operational totals and recent activity.

### Players

Open `/admin/profiles`.

What it proves:

- Club staff can review adult and junior players.
- Member status and marketing consent are visible.
- Parent/junior relationships are visible.

### Events

Open `/admin/events`.

What it proves:

- Clubs can create, publish, edit, close, and review events.

### Entries

Open `/admin/entries`.

What it proves:

- Clubs can track entries and manual payment states.

### Results

Open `/admin/results`.

What it proves:

- Clubs can capture event results and review match results.

### Courts

Open `/admin/courts`.

What it proves:

- Clubs can manage court availability at a basic operational level.

### Bookings

Open `/admin/bookings`.

What it proves:

- Clubs can review player bookings and create court blocks.

## 10. CoachR Future Direction

Keep this brief.

What to say:

- “CoachR is not a full module in this MVP yet.”
- “The future direction is to support coach schedules, player feedback, lesson notes, and development tracking.”
- “The important thing is that the player profile, junior profile, booking, match, result, and rating foundations are already being laid in one connected system.”

Do not claim CoachR currently has:

- A dedicated coach dashboard
- Coach scheduling
- Structured lesson notes
- Player feedback workflows
- Development plans

## 11. Closing Talk Track

“That is the current PlayR MVP loop: players can manage their profile, book courts, enter events, start match activity, and see progress. Clubs can manage the operational side through ClubR. CoachR is the next natural layer once we validate the player and club workflows.

For a pilot, I would love your feedback on where this would create the most immediate value.”

Questions to ask:

- “Would this help your club reduce WhatsApp or spreadsheet admin?”
- “Which flow matters most to you first: bookings, events, ratings, or coaching feedback?”
- “Where does your current process break down?”
- “What would need to be true before testing this with real members?”
- “Who at the club would need to be involved in a pilot?”
- “Would you prefer starting with a small group, juniors, social players, or competitive players?”

## 12. Common Demo Risks And Backup Lines

### If No Events Appear

Say:

- “That means no future events are currently published in ClubR.”
- “The admin can create and publish an event from ClubR, and then it appears here.”

Backup:

- Open ClubR Events if admin access is ready.
- Show the empty state as intentional.

### If No Booking Slots Appear

Say:

- “This usually means there are no active courts, the selected date is outside the booking window, or the court is blocked/booked.”

Backup:

- Open ClubR Courts and Bookings.
- Confirm courts are active.

### If Login Fails

Say:

- “This MVP uses Supabase email/password auth. The account may need email verification first.”

Backup:

- Use a known test account.
- Check Supabase Auth users.
- Confirm the app is pointing at the correct Supabase project.

### If Local Browser Refuses Connection

Say:

- “The dev server may need to be restarted or the browser may be blocking `localhost`.”

Backup:

- Run `npm run dev`.
- Try `http://127.0.0.1:3000`.
- Confirm the terminal says the app is ready.

### If Admin Access Fails

Say:

- “ClubR access is controlled by the `admin_users` table.”

Backup:

- Confirm the admin auth user exists.
- Confirm their auth user ID is present in `admin_users`.
- Confirm you are logged in as the admin account.

### If A Feature Is Not Ready Yet

Say:

- “That part is intentionally not fully built in this MVP.”
- “The goal today is to validate the core participation loop before adding heavier features.”

### If Someone Asks About Payments

Say:

- “Online payments are not integrated yet.”
- “The current MVP supports manual payment status tracking so clubs can test the workflow first.”
- “Payment integration can come later once the operational flow is validated.”

### If Someone Asks About Mobile Apps

Say:

- “This MVP is web-first and mobile-responsive.”
- “A native mobile app is possible later, but the fastest pilot path is a web app that players can open immediately.”

### If Someone Asks About Multi-Club Support

Say:

- “The product direction supports club and venue concepts, but full multi-club permissions are not the focus of this MVP.”
- “For a pilot, we would keep the setup controlled around one club or academy first.”

## 13. Post-Demo Notes Template

```text
Date:
Presenter:

Attendee name:
Club/academy:
Role:
Contact:

Interest level:
Biggest pain point:
Most valuable feature:
Least relevant feature:

Bookings feedback:
Events feedback:
Ratings feedback:
Junior/parent feedback:
ClubR admin feedback:
CoachR future feedback:

Concerns:
Requested features:
Data/privacy questions:
Payment questions:
Pilot readiness:

Suggested pilot group:
Required setup before pilot:
Follow-up action:
Follow-up owner:
Follow-up date:
```

