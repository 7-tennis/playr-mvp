# Organisation Setup Framework

Phase 1 uses one setup state per organisation and product in
`organisation_product_setups`. Product pages share the progress model and
wizard shell while keeping their own step content.

## Completion rules

ClubR essentials:

- organisation details
- an active organisation leader
- at least one active court, or an explicit no-courts choice
- booking basics when courts are managed in PlayR

CoachR essentials:

- organisation details
- an active organisation administrator or Head Coach
- a connected PlayR venue, an external venue, or an explicit no-default-venue
  choice

Staff, students, members, defaults, and court sharing can be completed later
from Settings.

## Future TeamR extension

The shared model already accepts `teamr` and defines these planned steps:

1. School details
2. Sports coordinator
3. Coaches
4. School courts or an explicit no-courts choice
5. Academy access
6. Teams
7. Review

TeamR should reuse `OrganisationSetupWizard`,
`save_organisation_setup_progress`, organisation memberships, invitations,
courts, and court access. It must not create a separate onboarding state or a
second school/court identity model.

## Product rule

Setup is guided. Management lives in Settings. Platform Admin grants access.
Organisation leaders configure their own organisation.
