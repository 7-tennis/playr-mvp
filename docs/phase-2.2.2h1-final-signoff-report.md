# Phase 2.2.2H.1 — Pilot Evidence, Permission Validation and Final Sign-off

Date: 11 August 2026
Production: https://playr-mvp.vercel.app
Supabase: `kpdxwtdzcmxqtklodlyd`
Auth deployment commit: `4e5f7f7`
Current production commit: `5ee533f`

## 1. Executive summary

**Do not proceed to Phase 2.3.**

The database and ranking blockers are closed: all five original lint errors were investigated and fixed or safely removed, hosted lint now exits successfully with warnings only, 40 local/remote migrations align, controlled test rankings cover all four categories, and the full moderation/audit/public-visibility lifecycle passed.

The deployed confirmation callback and the existing player-only account now pass the account and browser authorization checks: the fresh confirmation link was accepted, Auth records a confirmation timestamp, one complete adult player profile exists, no elevated role or organisation access was provisioned, normal PlayR routes load, and direct CoachR, ClubR and administration routes deny access as designed.

Sign-off remains blocked by:

- a genuine coach-only identity was created through the normal invitation workflow and resolves to PlayR plus CoachR only, but its app-switcher transition exposed a final navigation blocker that now requires deployment and production verification;
- the Club Admin-to-CoachR scope defect is deployed in `5ee533f`, but the club-admin-only denial still requires current-production retest evidence;
- no alternative automated screenshot surface is available, so current-production images must be captured manually.
- the More-page session and Coach invitation repairs are deployed in `5ee533f`; the successful coach-only invitation proves the existing-player invitation path, while the remaining session-preservation routes still require recorded production retest evidence.

The authorization repair removes `club_admin` from the single CoachR policy truth, makes product-specific route resolution select only an explicit matching membership, and makes the switcher use that same product classification. Coach/head-coach access, ClubR administration, explicit coach-plus-club-admin multi-role access and platform-admin behavior are preserved.

## 2. GitHub synchronisation

- Branch: `main`.
- Initial H.1 state: clean and `0 / 0`; remote `main` contained `0a48aea`.
- `git fetch origin main --prune` confirmed the remote state.
- No secret, token, `.env`, `.vercel`, Supabase temp, key or certificate file is tracked.
- New migration commit: `4a92540`.
- Initial direct push attempts failed because Terminal had no GitHub HTTPS credential. The commit was subsequently pushed through GitHub Desktop.
- Final verification: `git fetch origin main --prune` succeeded; local and remote are `0 / 0` and both resolve to `4a92540`.
- At H.1 continuation, local `main` and `origin/main` already both resolved to `5d4b994`, which contains the auth confirmation implementation and regression tests.
- The final auth confirmation/report commit `4e5f7f7` was pushed to `origin/main`; local/remote synchronization and the associated Vercel deployment were verified before the fresh-link test.
- The pre-existing `5d4b994` commit also contains a `.DS_Store` modification contrary to the intended exclusion. No later stage or commit in this continuation includes `.DS_Store`; correcting published history would require an explicitly authorised history rewrite.

## 3. Database lint findings

| Function | Finding | Classification | Usage and risk | Action | Final |
|---|---|---|---|---|---|
| `public.coachr_create_weekly_lesson_series` | record `occurrence` unassigned due record/SQL alias collision | Functional defect | Recurring lesson creation; potentially blocking | Renamed PL/pgSQL record and SQL alias | Fixed |
| `public.coachr_update_lesson_series_with_bookings` | missing `coachr_update_lesson_with_booking(...)` | Migration-history inconsistency / functional defect | Active recurring lesson updates | Restored missing helper; follow-up renamed masked `affected` collision | Fixed |
| `public.coachr_cancel_lesson_series_with_booking` | missing `coachr_cancel_lesson_with_booking(...)` | Migration-history inconsistency / functional defect | Called by active cancel-plan RPC | Restored missing helper | Fixed |
| `public.accept_adult_player_invitation_v1` | ambiguous `coach_profile_id` | Obsolete unused function | Revoked legacy implementation; no code caller or DB dependants | Dropped exact legacy signature | Safely removed |
| `public.coachr_request_existing_player_connection` | ambiguous `invitation_kind` | Active functional defect | Called by CoachR student connection action | Renamed variable and qualified comparison | Fixed |

Additional finding: four active security-definer functions retained explicit anonymous execute ACLs. Anonymous/public execution was revoked and authenticated execution retained. Internal role checks remain in each function.

Final hosted lint: **exit 0 under `--fail-on error`**. Remaining findings are warnings only, including unused variables/parameters, shadow warnings and an existing ClubR enum-cast warning.

## 4. Migrations

- `20260724193000_phase_h1_lint_repairs.sql`
  - restores two missing lesson helpers;
  - fixes the weekly occurrence collision;
  - fixes the active invitation-kind ambiguity;
  - removes the proven dependency-free legacy invitation function;
  - revokes unnecessary anonymous function execution.
- `20260724200000_phase_h1_series_lint_followup.sql`
  - fixes the newly exposed `affected` record/SQL alias collision.

Both were dry-run, deployed with `supabase db push`, and are present in hosted history. Final state: **40 local / 40 remote**.

## 5. Pilot ranking records

Created four non-user-linked, clearly labelled fixtures:

- `QA-Red F.` — junior Red, participation;
- `QA-Orange F.` — junior Orange, participation;
- `QA-Green F.` — junior Green, rating and participation;
- `QA-Open Fixture` — adult Open, rating and participation.

They contain no user login, email or phone. Private notes identify them as Phase H.1 fixtures. Regions `QA North` and `QA South` support safe filter testing. The required parent fixture was marked inactive so it is excluded from administration/public queries.

## 6. Moderation lifecycle

`QA-Green F.`:

| Step | State/result | Public result |
|---|---|---|
| Pending → Approve | UI action passed | Included |
| Approved → Hide | UI action with private reason passed | Immediately excluded |
| Hidden → Restore | Guarded RPC passed | Included |
| Approved → Suspend | Guarded RPC with private reason passed | Excluded |
| Duplicate Suspend | Completed safely and remained suspended | Excluded |
| Suspended → Restore | Returned to pending | Excluded |
| Pending → Approve | Passed | Included |
| Approved → Reject | Passed with private reason | Excluded |
| Invalid action | Rejected with SQLSTATE `22023` | No state corruption |
| Rejected → Approve | Passed; safe final state | Included |

## 7. Audit validation

- Audit entries recorded approve, hide, restore, suspend, duplicate update, reject and final approval.
- Previous/new status and hidden state were correct.
- Acting administrator displayed safely.
- Private reasons appeared only in admin audit output.
- Timestamps were stored in UTC and matched the test window.
- Results were ordered newest first and bounded to 30.
- The audit table remains private with no ordinary/anonymous table grants.
- No edit/delete application path exists; the append-only trigger recorded every change.

## 8. Permission matrix

| Role | Result | Evidence |
|---|---|---|
| Player | Pass | Fresh confirmation, one complete adult profile, derived `player` role, no elevated rows, normal PlayR routes, and direct elevated-route denials all passed in production. |
| Coach | Partial | A genuine coach-only identity now exists through the normal invitation workflow and resolves to PlayR plus CoachR only. Direct CoachR access succeeds; the app-switcher navigation repair still requires deployment, production isolation retesting and current screenshots. |
| Club administrator | Fix pending production evidence | The defect was reproduced in production. The corrected explicit-role policy denies CoachR locally while preserving ClubR; deployment and a production denial screenshot remain required. |
| Platform administrator | Pass | Admin list, actions, audit and public lifecycle passed |
| Multi-role | Pass | PlayR, CoachR and SupeR areas/independent navigation verified; ClubR direct access verified |

Database enforcement is not UI-only: anonymous admin RPCs return `401 / 42501`, admin routes redirect to login, and moderation functions perform platform-admin checks.

## 9. Direct access testing

- Anonymous `/admin/rankings` → `/login`.
- Anonymous administration list/audit/update RPCs → `401 / 42501`.
- Authenticated platform admin `/admin/rankings` → allowed.
- Authenticated PlayR, CoachR, ClubR and SupeR direct routes → allowed for the current multi-role/admin account.
- Distinct club-admin session: available and tested after an explicit sign-out from the Head Coach session.
- Distinct coach-only session: available through the normal invitation workflow; its resolved destinations are PlayR and CoachR only, and final isolation evidence is pending deployment of the app-switcher repair.

For the confirmed player-only account, database authorization evidence shows no `admin_users` role, no organisation membership or active organisation preference, no organisation player link, no linked junior, and no primary-admin or head-coach venue assignment. The application permission resolver therefore derives `player`.

Signed-in production route evidence for that account:

- `/dashboard` → allowed; rendered the complete adult player card and no linked organisations or juniors;
- `/dashboard/compete` → allowed; rendered the selected adult player and player-scoped competitive workflow;
- `/dashboard/messages` → allowed; rendered the player inbox;
- app switcher trigger → absent, as expected when PlayR is the account's only destination;
- `/dashboard/coachr` → denied with current role `Player` and the coaching-role allowlist;
- `/dashboard/clubr` → denied with current role `Player`;
- `/admin/rankings` → denied while remaining signed in;
- `/admin/organisations` → denied while remaining signed in.

Signed-in production route evidence for the supplied Head Coach context:

- `/dashboard/coachr` → allowed; rendered `MyCoachR`, `Head Coach`, `Timeless Tennis`;
- `/dashboard/coachr/schedule` → allowed; rendered `Weekly Schedule` with the Head Coach scope;
- app switcher → PlayR, ClubR Admin and CoachR;
- organisation selector → `Timeless Tennis - Head Coach - CoachR` plus `Monument Club - Club Manager - ClubR`;
- `/dashboard/clubr` → denied in the active Head Coach context with `Current role: Head Coach`;
- `/admin/rankings` → denied with signed-in access restriction;
- `/admin/organisations` → denied with signed-in access restriction.

This proves active Head Coach scoping but not coach-only account isolation because the same identity has an unrelated ClubR Manager membership.

Signed-in production route evidence for the distinct Club Admin context:

- prior Head Coach session → explicitly signed out before login;
- `/dashboard/clubr` → allowed; rendered `MyClubR`, `Kenmare Tennis Club`, `Club Admin`;
- `/dashboard/clubr/members` → allowed; rendered the venue-scoped member list;
- app switcher → PlayR and ClubR Admin only; no CoachR or SupeR destination;
- `/dashboard/coachr` → unexpectedly allowed; rendered `MyCoachR`, `Club Admin`, `Internal full access`;
- `/admin` → allowed; rendered the legacy `ClubR Dashboard`;
- `/admin/rankings` → restricted with `Only platform administrators can operate public rankings.`;
- `/admin/organisations` → restricted with `Only SupeR UseR accounts can manage organisation access.`

The visible organisation, role and destination set changed from Head Coach/Timeless Tennis to Club Admin/Kenmare Tennis Club after sign-out and login, so no prior-session identity leak was observed. The unexpected CoachR access is an authorization-scope finding in the current Club Admin role, not evidence of leaked Head Coach identity.

Authorization repair prepared after this finding:

- `canAccessCoachR` now allows only coach, head-coach and platform-admin roles;
- the CoachR permission allowlists, venue-resource helpers, diagnostics and coach-management UI no longer grant access to `club_admin`;
- CoachR routes/actions and the court-availability API resolve a CoachR-specific membership before authorizing;
- ClubR routes/actions resolve a ClubR-specific membership;
- academy or organisation administration no longer becomes an implicit coaching role; coaching access requires `head_coach`, `coach` or `assistant_coach` explicitly;
- the app switcher and direct-route resolver use the same product-membership classification;
- an identity with explicit coaching and club-admin memberships receives both destinations, while a single-role identity receives only its intended destination.

Local validation passed: 9/9 tests, lint, TypeScript, production build and `git diff --check`. Production evidence has not yet been claimed.

No denied path exposed SQL, stack traces, audit details or safeguarding reasons.

## 10. Public ranking QA

Passed with controlled production records:

- Red participation: one expected fixture.
- Orange participation: one expected fixture.
- Green rating and participation: one expected fixture in each metric.
- Open adult rating and participation: one expected fixture.
- Search, classification and `QA South` region filters.
- Pending/hidden/suspended/rejected exclusion during lifecycle.
- Restore/approval inclusion.
- Inactive parent exclusion.
- No private reason, email, internal UUID or notes in rendered results.
- No Yellow or Adult primary category.

Not fully exercised: 25+ row pagination, ties/shared position and current-player highlighting.

## 11. Production smoke test

Production remained operational through:

- authenticated session and refresh;
- MyPlayR;
- Venues;
- Compete;
- Events;
- Messages;
- Rankings;
- Settings;
- PlayR/CoachR/ClubR/SupeR direct application areas;
- ranking administration and audit.

The confirmed player-only production session additionally passed MyPlayR, Compete and Messages. The account remained authenticated throughout direct CoachR, ClubR, ranking-administration and SupeR organisation-administration denials.

Sign-out was not repeated because no reusable interactive credential was provided for restoring the session.

### 11A. More-page session loss and Coach invitation blocker

Two additional production blockers were reported while preparing the dedicated coach-only account. The ClubR variant was reproduced before code changes with the existing Club Admin session:

1. `https://playr-mvp.vercel.app/dashboard/clubr/more` rendered as authenticated `Club Admin` for `Kenmare Tennis Club`.
2. Selecting the normal Settings card navigated to `https://playr-mvp.vercel.app/login`.
3. The first login render still displayed a signed-in header, while the page body requested login; a subsequent protected request rendered fully signed out.

Root cause: both CoachR and ClubR More pages linked to `/logout` with ordinary Next.js links. The deployed `/logout` GET route called `supabase.auth.signOut()`. Production link prefetch could therefore execute a state-changing GET merely by rendering More, revoke the refresh session, and leave subsequent Settings, Manage Coaches or Invite Coach requests unauthenticated. This was not an organisation-role denial, a route-group boundary, or a browser/server client format mismatch.

The failed Coach invitation shared this session-loss cause. The application action and database path otherwise support an existing PlayR-only user by normalized email. The hosted invitation table remained atomic and showed no new or partial Coach invitation from the failed attempt; its only Coach invitation was the previously accepted Timeless Tennis record from 13 July 2026.

Minimal local repair:

- removed all More-page `/logout` links and replaced them with POST server-action forms;
- made legacy `GET /logout` non-mutating, so prefetch or direct GET cannot revoke a session;
- middleware now overwrites a private request-path header for protected route guards;
- genuine unauthenticated redirects preserve a safe local `next` destination;
- failed login attempts retain that destination, and successful login already redirects to it;
- permission failures still render `Access restricted`; no role gate was weakened;
- Coach invitation submission now has a 15-second bound, an actionable timeout, and recovery of an existing pending invitation after a timeout or duplicate retry;
- the invitation RPC remains transactional, role-checked and RLS-backed; no schema or hosted database change was required.

Local validation: 18/18 tests, lint, TypeScript and production build passed. `git diff --check` passed after the report update. A local HTTP redirect smoke test could not bind a loopback port in the workspace sandbox (`EPERM`); the production build and pure redirect regressions cover the same code path pending deployment.

### 11B. Coach-only app-switcher navigation blocker

The normal Coach invitation workflow successfully created a genuine coach-only identity. In production, its app switcher correctly exposed only PlayR and CoachR and direct `/dashboard/coachr` authorization succeeded for `Coach` at `Timeless Tennis`. Selecting CoachR from PlayR nevertheless appeared not to navigate.

The issue was reproduced before code changes from the signed-in coach-only account. The switcher showed exactly `PlayR` and `CoachR`. Selecting CoachR immediately closed the dropdown while the browser still reported `/dashboard`; the header changed to CoachR and the main area showed an intermediate loading state before the server action eventually completed the redirect to `/dashboard/coachr` several seconds later.

Root cause: membership-backed destinations were rendered as server-action forms, but their submit buttons synchronously called `setOpen(false)` during `onClick`. That unmounted the form while submission/navigation was still in progress and provided no pending feedback. This created a fragile submit/unmount race and made a slow successful action indistinguishable from a failed click. Desktop and mobile use the same component and therefore shared the defect.

Minimal local repair:

- keeps membership-backed forms mounted until their server action redirects;
- removes the submit-button dropdown-close handler;
- displays and disables an `Opening <destination>…` pending state;
- closes the switcher from the pathname effect after successful navigation;
- centralises switcher destination construction in a pure helper using the same product-membership and role predicates as direct authorization;
- makes the server action obtain PlayR, CoachR, ClubR and SupeR landing paths from the shared app-area definitions.

Direct-route authorization is unchanged. Local regression coverage now verifies player-only, coach-only, club-admin-only and explicit coach-plus-club-admin destination sets, exact landing paths, and that membership-backed submit forms remain mounted while pending. Deployment and current-production retesting remain required.

Local validation: 23/23 tests, lint, TypeScript, production build and `git diff --check` passed.

## 12. Responsive QA

Phase G previously passed 320–1440 px. In Phase H/H.1 the in-app browser viewport remained constrained to 487 CSS pixels even after explicit 320 px and 1440 px overrides, preventing exact reproduction of those requested widths. MyPlayR, CoachR denial, ClubR denial, administration denial, Compete and Messages all reported `scrollWidth = clientWidth = 487`, with no horizontal overflow.

Current exact-width evidence remains incomplete.

## 12A. Player signup and email-confirmation investigation

The ordinary player signup created the Supabase Auth user and sent confirmation mail, but created no `profiles`, `admin_users`, organisation-membership or organisation-preference rows. No elevated metadata was supplied. The account therefore remains a clean baseline player candidate.

Hosted configuration and failure evidence:

- Site URL: `https://playr-mvp.vercel.app`.
- Existing redirect list included the production origin and two local entries, but not the application confirmation callback.
- Confirm-sign-up template used `{{ .ConfirmationURL }}` correctly.
- Email OTP/link expiry was configured to 3,600 seconds.
- The attempted link was opened roughly 23 hours after it was issued.
- Auth logs recorded `GET /verify`, `email link has expired`, and HTTP `303`; the referer was the production PlayR origin.
- `email_confirmed_at` remained null, so the expired link was not consumed successfully.
- `@supabase/ssr` configures the server client for PKCE and disables fragment-based session detection.
- The application previously had no confirmation/callback route and signup supplied no `emailRedirectTo`.
- Middleware only refreshes Auth state and does not redirect away from callbacks.

Minimal repository repair:

- added `/auth/confirm`, accepting PKCE `code` with `exchangeCodeForSession` and email `token_hash`/`type` with `verifyOtp`;
- added a safe same-origin `next` allowlist and an actionable expired-link redirect;
- made signup request the exact production callback and stopped treating a successful no-session signup as failure;
- removed email/raw Auth errors from signup logs;
- documented `NEXT_PUBLIC_SITE_URL=https://playr-mvp.vercel.app`;
- added four callback/parser regression tests.

The required Supabase redirect entry, `https://playr-mvp.vercel.app/auth/confirm`, has been added.

Validation passed: unit tests (4/4), lint, TypeScript, production build, `git diff --check`, and a local callback redirect smoke test.

Production verification passed for commit `5d4b994`:

- GitHub's Vercel status is `success` with the description `Deployment has completed`.
- `GET https://playr-mvp.vercel.app/auth/confirm` reaches Vercel, matches `/auth/confirm`, and returns the expected `307` redirect for a request without a confirmation token.
- The redirected login page renders the actionable invalid/expired-link message and exposes no raw Auth error or token.

A fresh confirmation-email retry for the existing player-only account passed on 9 August 2026:

- `email_confirmed_at`: populated at `2026-08-09T19:11:31.895962+00:00`;
- baseline profile: exactly one complete adult profile, created at `2026-08-09T19:14:12.108822+00:00`;
- profile classification: adult (`is_junior = false`), primary sport tennis, club-competitive player level;
- stored application roles: none;
- organisation memberships and active organisation preferences: none;
- organisation player links: none;
- linked juniors: none;
- primary-admin and head-coach venue assignments: none.

This establishes a clean baseline player account at the data, permission-resolution and signed-in production-route layers.

## 13. Screenshots

The confirmed player account was signed into the in-app QA browser and all requested player authorization routes were inspected. Three current-production image attempts were made: desktop dashboard, mobile dashboard, and a fresh authenticated tab. Each timed out in `Page.captureScreenshot`; no partial or empty image was saved. The same failing method was not retried during the coach/club-admin continuation. No separate screen-capture or Computer Use surface is installed, so manual screenshots are required. DOM snapshots, final URLs, rendered role text and overflow measurements were captured instead. No password was requested, displayed, stored or logged.

Authorization checklist result:

- MyPlayR desktop/narrow DOM: pass; current image unavailable.
- App switcher: pass; the trigger is intentionally absent because PlayR is the only destination.
- CoachR direct route: restricted as Player.
- ClubR direct route: restricted as Player.
- SupeR and ranking-administration direct routes: restricted while authenticated.
- Compete and Messages: allowed and rendered normally.

Manual authorization checklist:

1. Player desktop `/dashboard`: PlayR header, adult player card, no app-switcher trigger.
2. Player constrained `/dashboard`: bottom navigation visible and no horizontal clipping.
3. Player `/dashboard/coachr`: `Access restricted` and `Current role is Player`.
4. Player `/dashboard/clubr`: `Access restricted` and `Current role: Player`.
5. Player `/admin/rankings` and `/admin/organisations`: signed-in access restriction.
6. Actual coach-only `/dashboard/coachr`: coaching role, organisation and normal CoachR content.
7. Actual coach-only app switcher: PlayR and CoachR only.
8. Actual coach-only `/dashboard/clubr`, `/admin/rankings`, `/admin/organisations`: visible denials.
9. Club Admin `/dashboard/clubr` and `/dashboard/clubr/members`: venue and Club Admin scope visible.
10. Club Admin app switcher: PlayR and ClubR Admin only.
11. Club Admin `/dashboard/coachr`: after deployment, capture `Access restricted` with the current Club Admin role visible; do not use the obsolete defect screen as sign-off evidence.
12. Club Admin `/admin/rankings` and `/admin/organisations`: platform-only denial text.
13. Club Admin `/admin`: legacy ClubR Dashboard access, recorded separately from SupeR-only routes.
14. Repeat the Player, actual coach-only and Club Admin landing pages at 1440 x 900 and 320 x 800; if only the in-app browser is available, label its 487 px capture as constrained rather than 320 px.

Phase G screenshots remain historical only.

## 14. Security and privacy

- RLS and function-level admin checks remain active.
- Admin RPC execution is revoked from anonymous/public roles.
- Private audit-table access remains revoked.
- The legacy security-definer function was removed only after dependency and caller checks.
- Fixtures contain no credentials or personal contact data.
- Private moderation reasons did not appear publicly.
- No secret was logged or committed.
- Production pages showed no raw SQL, stack trace or `PGRST202`.

## 15. Files changed

- `supabase/migrations/20260724193000_phase_h1_lint_repairs.sql`
- `supabase/migrations/20260724200000_phase_h1_series_lint_followup.sql`
- `.env.example`
- `app/auth/actions.ts`
- `app/auth/confirm/route.ts`
- `lib/auth-confirmation.ts`
- `package.json`
- `tests/auth-confirmation.test.ts`
- `tsconfig.json`
- `docs/phase-2.2.2h1-final-signoff-report.md`

Current uncommitted authorization repair additionally changes:

- `lib/authorization-policy.ts`
- `lib/permissions.ts`
- `lib/organisations.ts`
- `lib/clubr.ts`
- `components/site-header.tsx`
- CoachR court route/action/page guards and CoachR role displays
- ClubR product-specific server contexts
- `tests/authorization-policy.test.ts`

Current uncommitted session/invitation repair additionally changes:

- `app/auth/actions.ts`
- `app/login/page.tsx`
- `app/logout/route.ts`
- `app/dashboard/coachr/more/page.tsx`
- `app/dashboard/clubr/more/page.tsx`
- `app/dashboard/coachr/coaches/actions.ts`
- `app/dashboard/coachr/coaches/page.tsx`
- `lib/auth-navigation.ts`
- `lib/coach-invitations.ts`
- `utils/supabase/middleware.ts`
- `tests/auth-session-flow.test.ts`
- `tests/coach-invitations.test.ts`

Current uncommitted app-switcher repair additionally changes:

- `components/app-switcher.tsx`
- `components/site-header.tsx`
- `app/dashboard/organisations/actions.ts`
- `lib/app-areas.ts`
- `lib/app-destinations.ts`
- `tests/app-switcher.test.ts`

The intended H.1 auth file set excludes `.DS_Store` and unrelated files.

## 16. Commands run

Successful:

```text
git fetch origin main --prune
supabase login
supabase migration list
supabase db push --dry-run
supabase db push
supabase db lint --linked --schema public,private --level warning --fail-on error
npm run lint
npx tsc --noEmit
npm run build
git diff --check
git commit
GitHub Desktop push
git fetch origin main --prune
```

Failed/limited:

```text
initial direct CLI push  # no Terminal GitHub credential; resolved through GitHub Desktop
automated screenshot    # browser capture closed/timed out
supabase migration new  # installed CLI attempted a sandbox-blocked telemetry write; no migration was required or retained
local production server # loopback bind denied by workspace sandbox with EPERM
```

The repository now includes automated confirmation-flow and authorization-policy test scripts. The current authorization run passed 9/9 tests, lint, typecheck, production build and `git diff --check`.

## 17. Remaining blockers

### Blocking

- Deploy the authorization repair and verify that the Club Admin account receives an authenticated CoachR denial while retaining ClubR.
- Retest More → Settings/Manage Coaches without reauthentication and safe destination restoration after a genuine login. Normal existing-user Coach invitation creation and acceptance passed; duplicate/pending-invitation recovery still needs production evidence.
- Deploy the app-switcher repair and verify that the coach-only PlayR → CoachR selection reaches `/dashboard/coachr` with visible pending feedback and without a dead click or partial state.
- Capture the current manual authorization screenshot checklist.

### Non-blocking

- Hosted lint warnings listed in section 3.
- Public tie, pagination and current-player highlighting lack sufficient fixture volume.
- Exact Phase H.1 viewport capture was constrained by browser tooling.

### Deferred

- TeamR and all Phase 2.3 product functionality.

## 18. Final readiness checklist

| Area | Result |
|---|---|
| GitHub synchronisation | Pass |
| Database lint | Pass |
| Migrations | Pass |
| RLS | Pass |
| Ranking RPCs | Pass |
| Moderation lifecycle | Pass |
| Audit history | Pass |
| Public rankings | Pass |
| Player role | Pass |
| Coach role | Partial — genuine coach-only identity exists; switcher repair and final isolation evidence pending |
| Club-admin role | Fix locally validated; production denial pending |
| Platform-admin role | Pass |
| Direct-route protection | Partial — local repair passes; deployed Club Admin denial is pending |
| Authenticated More/settings flow | Fix locally validated; production retest pending |
| Existing-user Coach invitation | Partial — normal production creation/acceptance passed; duplicate/pending recovery evidence remains |
| App-switcher navigation | Fix locally validated; production deployment/retest pending |
| Mobile | Partial |
| Desktop | Partial |
| Screenshots | Fail |
| Production build | Pass |
| Pilot readiness | Partial |

## 19. Final recommendation

**Do not proceed to Phase 2.3 until listed blockers are resolved.**

The functional database and ranking blockers are resolved. The Club Admin-to-CoachR boundary and More/invitation session defects are deployed, and the genuine coach-only identity was created successfully. H.1 still requires deployment and production verification of the app-switcher repair, final signed-in isolation testing and current screenshots. No additional product feature phase is justified.
