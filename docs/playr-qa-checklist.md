# PlayR MVP Controlled QA Checklist

Use this checklist for a controlled manual QA pass across the PlayR player experience and the ClubR admin experience.

Do not use real player data for this pass. Use dedicated test users, test courts, test events, and clearly labeled test records.

## Local Browser Setup

- Start the app with `npm run dev`.
- Confirm the terminal says the app is running and shows a local URL.
- Open `http://localhost:3000`.
- If `localhost` is blocked in the browser preview, try `http://127.0.0.1:3000`.
- If `127.0.0.1:3000` shows connection refused, restart the dev server with `npm run dev`.
- Keep the dev server terminal open while testing.

## Required Test Accounts

- Player test account:
  - Email: use a controlled test email.
  - Password: use a known QA-only password.
  - Purpose: normal player/parent journey.

- ClubR admin test account:
  - Email: use a controlled admin test email.
  - Password: use a known QA-only password.
  - Requirement: the user must be listed in `admin_users`.
  - Purpose: ClubR dashboard and admin management.

- Optional second player account:
  - Email: use a second controlled test email.
  - Password: use a known QA-only password.
  - Purpose: match invite acceptance, result confirmation, and rating checks.

## Required Test Data

- At least one active court:
  - Example: `Court 1`.
  - Status should be active.

- At least one published event:
  - Starts in the future.
  - Has capacity available.
  - Has an entry fee or clear zero-price setup.

- At least one available booking slot:
  - Within the normal player booking window.
  - Not already blocked or booked.

- At least one adult player profile:
  - Linked to the player test account.
  - Includes first name, last name, primary sport, and player level.

- At least one junior profile if junior flow is active:
  - Linked to the adult player profile.
  - Includes first name, last name, primary sport, player level, and junior stage if available.

- Admin access:
  - The ClubR admin test account must have a matching row in `admin_users`.

## Public QA Flow

- Visit `/`.
  - Confirm PlayR branding is visible.
  - Confirm primary CTAs are clear.
  - Confirm no horizontal scrolling on mobile.

- Visit `/about`.
  - Confirm PlayR, ClubR, and future CoachR wording is accurate.
  - Confirm CoachR is not presented as a complete working module.

- Visit `/events`.
  - Confirm only public/published events are shown.
  - Confirm empty state is friendly if no events are open.

- Visit `/login`.
  - Confirm form fields are readable and usable.
  - Confirm the signup link is easy to tap on mobile.

- Visit `/signup`.
  - Confirm email verification guidance is clear.
  - Confirm cellphone helper text is present.
  - Confirm marketing consent is optional and separate from account/service communication.

## Player QA Flow

### Signup And Login

- Create a new player test account at `/signup`.
- Confirm signup success message explains email verification if required.
- Verify email if Supabase sends a confirmation link.
- Log in at `/login`.
- Confirm successful login redirects to `/dashboard`.

### Player Profile

- Open `/dashboard/profile`.
- Create or complete the adult Player Profile.
- Confirm required and optional fields are labeled clearly.
- Confirm cellphone helper text is visible.
- Confirm optional marketing consent can be checked or left unchecked.
- Save the profile.
- Confirm a success message appears.
- Reload the page and confirm saved profile data remains visible.

### Junior Players

- Open `/dashboard/juniors`.
- Add a junior player.
- Confirm junior fields are clear on mobile.
- Save the junior profile.
- Confirm the junior appears in the linked junior list.
- Edit the junior profile if the edit form is available.
- Confirm the junior appears in booking/event selectors where expected.

### My PlayR Dashboard

- Open `/dashboard`.
- Confirm the page title is `My PlayR`.
- Confirm the main cards are visible:
  - Book a Court
  - Find Match
  - Join Event
  - My Progress
- Confirm profile completion status is understandable.
- Confirm PlayR Rating display is visible and labeled as provisional if appropriate.
- Confirm next booking and action-needed cards have friendly empty states.

### Book A Court

- Open `/dashboard/book-court`.
- Confirm courts display as tabs.
- Confirm date selector works.
- Confirm available, booked, blocked, and own-booking states are visually distinct.
- Select an available slot.
- Confirm the booking modal fits on mobile.
- Confirm `Booking for` includes the adult profile and linked junior profiles.
- Create a booking.
- Confirm success message appears.

### My Bookings

- Open `/dashboard/my-bookings`.
- Confirm the new booking appears under upcoming bookings.
- Confirm court name, date/time, player profile, and status are visible.
- Cancel a future booking if cancellation is allowed.
- Confirm cancelled/past bookings appear in the correct section.

### Events And Entries

- Open `/dashboard/events`.
- Confirm published upcoming events are visible.
- Confirm event cards show date, location, price, and availability.
- Enter an event for the adult profile.
- If junior profiles are active, enter an event for a linked junior.
- Confirm duplicate entry prevention is friendly and clear.
- Confirm success message appears after entry.

### My Entries

- Open `/dashboard/my-entries`.
- Confirm the event entry appears.
- Confirm player name, event name/date, payment status, entry status, and result link/placeholder are visible.
- Confirm manual payment status is understandable.

### Play And Match Invites

- Open `/dashboard/play`.
- Send a match invite from the player account.
- If using the optional second player:
  - Log in as the second player.
  - Accept or decline the received invite.
- Confirm sent and received invite sections update correctly.
- Confirm existing booking linking still works if a future booking exists.
- Confirm creating a new booking as part of the invite works if available.

### Match Results

- Submit a match result for an accepted invite.
- Log in as the opponent account if using the optional second player.
- Confirm or dispute the submitted result.
- Confirm pending confirmations and submitted results are shown in the correct sections.
- Confirm verified match history appears in the Player Profile progress area when applicable.

### Results

- Open `/dashboard/results`.
- Confirm event results and relevant player results appear when available.
- Confirm empty state is friendly when no results exist.
- Confirm no private admin/payment information appears.

## ClubR Admin QA Flow

### Admin Login And Access

- Log out of the player account.
- Log in with the ClubR admin test account.
- Confirm successful admin login redirects to `/admin` if implemented, or manually visit `/admin`.
- Confirm page title is `ClubR Dashboard`.
- Confirm ClubR navigation is visible:
  - Dashboard
  - Players
  - Events
  - Entries
  - Results
  - Courts
  - Bookings

### ClubR Dashboard

- Open `/admin`.
- Confirm summary cards show player, member, event, upcoming event, and unpaid entry counts.
- Confirm recent entries and upcoming events sections render cleanly.
- Confirm empty states explain the next operational step.

### Players

- Open `/admin/profiles`.
- Confirm adult and junior players are visible.
- Search by name or email.
- Filter by member status.
- Filter by adult/junior player type.
- Update member status.
- Confirm junior parent relationship is visible where available.
- Confirm marketing consent status is visible.

### Events

- Open `/admin/events`.
- Confirm events are grouped or visually separated by status/time where available.
- Create a new event at `/admin/events/new`.
- Confirm default status is safe, such as draft if applicable.
- Edit the event at `/admin/events/[id]/edit`.
- Publish the event.
- Close or complete the event if supported.
- Confirm public/player event pages reflect the status correctly.

### Entries

- Open `/admin/entries`.
- Filter entries by event, payment status, and entry status.
- Update payment status.
- Add payment reference or note if fields exist.
- Update entry status.
- Confirm success message appears.

### Event Entries

- Open `/admin/events/[id]/entries` for the test event.
- Confirm player name, junior/adult status, member status, price, payment status, and entry status are visible.
- Update payment and entry status.
- Confirm changes appear in `/dashboard/my-entries` for the player.

### Results

- Open `/admin/results`.
- Select an event.
- Select a player.
- Save placement, points, and notes.
- Confirm existing results display for the selected event.
- Confirm event results appear for the player where expected.
- Review pending/disputed match results if present.
- Admin verify or correct a result if supported.

### Courts

- Open `/admin/courts`.
- Confirm active courts are visible.
- Create or edit a test court if needed.
- Deactivate and reactivate a court if appropriate.
- Confirm inactive courts do not appear in the player booking flow.

### Bookings

- Open `/admin/bookings`.
- Filter by date and court.
- Confirm player bookings are visible.
- Create a court block for maintenance, lesson, club programme, or competition if supported.
- Confirm blocked slots are visible in `/dashboard/book-court`.
- Cancel a booking if needed.

## Cross-Role QA

- Confirm a logged-out user visiting `/dashboard` redirects to `/login`.
- Confirm a logged-out user visiting `/admin` redirects to `/login`.
- Confirm a normal player cannot access `/admin`.
- Confirm the ClubR admin account can access `/admin`.
- Confirm player navigation labels:
  - My PlayR
  - Book a Court
  - Play
  - Events
  - Player Profile
- Confirm ClubR navigation labels:
  - Dashboard
  - Players
  - Events
  - Entries
  - Results
  - Courts
  - Bookings

## Mobile QA

Repeat the key flows at around 390px width:

- Signup and login.
- Player Profile form.
- Junior Players form.
- My PlayR dashboard cards.
- Book a Court grid and booking modal.
- My Bookings cards.
- Events list and entry form.
- My Entries list.
- Play invite form and result sections.
- Results page.
- ClubR Dashboard.
- ClubR Players filters and player cards.
- ClubR Events list and event form.
- ClubR Entries payment/status controls.
- ClubR Results capture form.
- ClubR Courts and Bookings forms.

Check:

- No horizontal scrolling.
- Buttons are easy to tap.
- Forms are not cramped.
- Tables or dense lists remain readable.
- Modals fit without hiding important actions.
- Empty states explain the next step.

## Data Integrity Checks

- New booking appears in My Bookings.
- Cancelled booking no longer appears as active availability.
- Court block appears as blocked in Book a Court.
- Event entry appears in My Entries.
- Duplicate event entry is prevented for the same event and profile.
- Admin payment/status updates appear in player-facing entry views.
- Match invite appears for sender and receiver.
- Match result is linked to the correct players/profiles.
- Verified result appears in progress/history where applicable.
- PlayR Rating display remains stable and only updates after eligible verified results.
- Admin views show the same records created in player flows.

## Regression Checks

- No visible `CourtSide` wording in user-facing pages.
- No visible `Kenmare Tennis Club` wording in user-facing pages.
- PlayR is used for the player experience.
- ClubR is used for club/admin management.
- CoachR is referenced only as a future module.
- No visible console errors during manual testing.
- No horizontal overflow at mobile, tablet, or desktop widths.
- No broken public navigation links.
- Protected routes redirect correctly when logged out.

## QA Notes Template

Use this format to capture issues:

```text
Date:
Tester:
Browser/device:
Viewport:
Account used:
Route:
Issue:
Expected:
Actual:
Screenshot/video:
Severity:
Suggested fix:
```

