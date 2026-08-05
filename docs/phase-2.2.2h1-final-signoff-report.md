# Phase 2.2.2H.1 — Pilot Evidence, Permission Validation and Final Sign-off

Date: 5 August 2026
Production: https://playr-mvp.vercel.app
Supabase: `kpdxwtdzcmxqtklodlyd`
Auth deployment commit: `5d4b994 Phase 2.2.2H.1 Push`

## 1. Executive summary

**Do not proceed to Phase 2.3.**

The database and ranking blockers are closed: all five original lint errors were investigated and fixed or safely removed, hosted lint now exits successfully with warnings only, 40 local/remote migrations align, controlled test rankings cover all four categories, and the full moderation/audit/public-visibility lifecycle passed.

Sign-off remains blocked by:

- fresh-link verification of the deployed player email-confirmation callback with the existing player-only account;
- separate coach-only and club-admin browser sessions were unavailable;
- current automated screenshots failed again and the manual set has not yet been supplied.

## 2. GitHub synchronisation

- Branch: `main`.
- Initial H.1 state: clean and `0 / 0`; remote `main` contained `0a48aea`.
- `git fetch origin main --prune` confirmed the remote state.
- No secret, token, `.env`, `.vercel`, Supabase temp, key or certificate file is tracked.
- New migration commit: `4a92540`.
- Initial direct push attempts failed because Terminal had no GitHub HTTPS credential. The commit was subsequently pushed through GitHub Desktop.
- Final verification: `git fetch origin main --prune` succeeded; local and remote are `0 / 0` and both resolve to `4a92540`.
- At H.1 continuation, local `main` and `origin/main` already both resolved to `5d4b994`, which contains the auth confirmation implementation and regression tests.
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
| Player/parent | Partial | Three hosted PlayR users exist; anonymous/direct DB denial proven, but no separate signed-in browser session |
| Coach | Partial | Current multi-role account loads CoachR; no coach-only session |
| Club administrator | Partial | Platform-admin ClubR route loads; no distinct club-admin session |
| Platform administrator | Pass | Admin list, actions, audit and public lifecycle passed |
| Multi-role | Pass | PlayR, CoachR and SupeR areas/independent navigation verified; ClubR direct access verified |

Database enforcement is not UI-only: anonymous admin RPCs return `401 / 42501`, admin routes redirect to login, and moderation functions perform platform-admin checks.

## 9. Direct access testing

- Anonymous `/admin/rankings` → `/login`.
- Anonymous administration list/audit/update RPCs → `401 / 42501`.
- Authenticated platform admin `/admin/rankings` → allowed.
- Authenticated PlayR, CoachR, ClubR and SupeR direct routes → allowed for the current multi-role/admin account.
- Distinct player, coach-only and club-admin direct-route sessions: not available.

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

Sign-out was not repeated because no reusable interactive credential was provided for restoring the session.

## 12. Responsive QA

Phase G previously passed 320–1440 px. In Phase H/H.1 the in-app browser viewport remained constrained to its visible window, preventing exact reproduction of every requested CSS width. Effective narrow/desktop DOM checks found no horizontal overflow and retained header, switcher, Settings, navigation, ranking filters and audit controls.

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

A fresh confirmation-email retry for the existing player-only account remains pending as the final account-specific auth check.

## 13. Screenshots

One reduced current-production capture was attempted. `Page.captureScreenshot` again closed/timed out, so no new H.1 image was saved.

Manual checklist:

1. PlayR at 320 px.
2. PlayR at 1440 px.
3. Open app switcher.
4. CoachR landing.
5. ClubR landing.
6. SupeR landing.
7. Admin Pending.
8. Admin Approved.
9. Review and Audit for `QA-Green F.`.
10. Public Green.
11. Public Open.
12. Public filtered/search result.
13. MyPlayR mobile.
14. Compete mobile.
15. Messages mobile.

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
```

The repository now includes an automated confirmation-flow test script.

## 17. Remaining blockers

### Blocking

- Complete player/parent, coach-only and club-admin browser-session isolation tests.
- Retry confirmation for the existing player-only account with the newest email and open it within one hour.
- Capture the current manual screenshot checklist.

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
| Player role | Partial |
| Coach role | Partial |
| Club-admin role | Partial |
| Platform-admin role | Pass |
| Direct-route protection | Partial |
| Mobile | Partial |
| Desktop | Partial |
| Screenshots | Fail |
| Production build | Pass |
| Pilot readiness | Partial |

## 19. Final recommendation

**Do not proceed to Phase 2.3 until listed blockers are resolved.**

The functional database and ranking blockers are resolved. The remaining work is evidence and release-governance work: run the three distinct-role sessions and capture the current manual screenshots. No additional product feature phase is justified.
