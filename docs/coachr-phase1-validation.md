# CoachR Integration Phase 1 Validation

This guide validates the CoachR pilot workflows added after the PlayR Foundation migration.

## Migration order

Apply these migrations after all existing migrations, in filename order:

1. `202607130001_add_adult_player_invitation_kind.sql`
2. `202607130002_complete_coachr_phase1.sql`

The enum migration is intentionally separate because PostgreSQL requires a newly added enum value to be committed before it is referenced by later functions.

## Shared court setup

1. Sign in as a platform admin or an organisation administrator for the court owner.
2. Open `/dashboard/coachr/courts`.
3. Confirm the owner organisation's active courts appear under **Owned courts**.
4. Grant an academy either all-court access or access to one court.
5. Switch to the academy in CoachR and open the weekly schedule.
6. Start a lesson and confirm the picker labels the owner's court as shared.
7. Revoke the grant and confirm the court no longer appears for new academy lessons.

The owner remains `courts.venue_id`. `courts.operator_venue_id` records an optional operator, while `organisation_court_access` grants use without copying the court.

## Lesson and booking checks

### Create

1. Create a one-off lesson on an available managed court.
2. Confirm one `court_bookings` row exists with the lesson's `court_booking_id`.
3. Confirm `booking_purpose = 'coaching_lesson'`, `booking_organisation_id` is the academy, and `owner_organisation_id` is the court owner.
4. Confirm the same court is unavailable for an overlapping player booking or lesson.

### Conflict

1. Create a confirmed booking from 15:00 to 16:00.
2. Attempt a lesson on the same court from 15:30 to 16:30.
3. Confirm the save reports a court conflict and creates neither a lesson nor a second booking.

### Reschedule

1. Edit an existing lesson's court or time.
2. Confirm its linked booking is updated instead of duplicated.
3. Attempt to move it into an occupied slot and confirm the original lesson and booking remain unchanged.

### Cancel

1. Cancel one occurrence of a recurring lesson.
2. Confirm only that occurrence is cancelled, its booking is released, and its history remains.
3. Confirm the linked player or guardian receives one cancellation notification.
4. Confirm attendance-recorded occurrences remain protected from recurring bulk changes.

### Off-site and no-court lessons

1. Create a lesson with **Off-site** and a custom location.
2. Create a lesson with **No court**.
3. Confirm neither creates a managed court booking and both remain clearly labelled in the schedule.

## Invitation checks

### Junior

1. Request a junior link from CoachR Students.
2. Confirm the guardian receives an action-required notification and the junior receives only an informational notification when the junior has a user account.
3. Accept as the guardian and confirm the organisation-player link and intended coach assignment become active.
4. Repeat with decline and confirm no link or assignment is created.
5. Confirm the original notification resolves only after the invitation changes state.

### Adult

1. Send an adult player invitation from CoachR Students.
2. Confirm the adult receives the action-required notification.
3. Accept as that adult and confirm the adult profile is linked without guardian approval.

### Coach

1. Create a coach invitation through the existing invitation flow.
2. Confirm the coach receives an action-required notification.
3. Confirm the inviter receives an accepted or declined outcome notification.

## Multi-organisation checks

1. Give a coach active memberships in two organisations with different students and courts.
2. Select organisation A and verify CoachR lessons, assigned students, court options, invitations, and coach filters are limited to A.
3. Switch to organisation B and repeat.
4. Remove or suspend the active membership and confirm CoachR shows an organisation selection/access state rather than merging data or returning the user to login.

## Security checks

1. Confirm an ordinary coach cannot open court-access management or grant access by calling the RPC directly.
2. Confirm an approved academy can read authorised court options but cannot edit the owner's court record.
3. Confirm a coach cannot create or edit a lesson for another organisation or an unassigned player.
4. Confirm a junior cannot accept an invitation requiring guardian approval.
5. Confirm users can read only their own notifications and cannot mark an invitation resolved directly.

## Local limitations

The repository currently has no automated test script, Supabase CLI, or PostgreSQL client installed. Run this guide against a migrated Supabase environment before pilot sign-off, and inspect the linked lesson and booking rows after each transactional scenario.
