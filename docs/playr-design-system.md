# PlayR design system

This is the shared visual foundation for PlayR, ClubR, CoachR and TeamR. It is intentionally small: use these primitives for new work and migrate legacy screens only when those screens are being changed.

## Direction

PlayR is clean, calm, premium and sport-focused. Player identity and the next useful action should dominate. Gradients are accents—not general-purpose backgrounds—and shadows remain soft.

## Tokens

Semantic CSS variables live in `app/globals.css`; Tailwind aliases live in `tailwind.config.ts`. Use semantic names where possible.

### Colour

- Surfaces: `playr-surface-page`, `playr-surface-card`, `playr-surface-muted`, `playr-surface-elevated`, `playr-surface-shell`, `playr-surface-chrome`
- Text: `playr-text-primary`, `playr-text-secondary`, `playr-text-muted`
- Borders and focus: `playr-border-subtle`, `playr-border-strong`, `playr-focus`
- Brand compatibility: `court-navy`, `court-blue`, `court-green`, `court-teal`, `court-lime`, `court-mist`, `court-ink`
- Semantic: success, warning, error and information variables plus soft component treatments
- Organisation treatments: centralised in `lib/design-tokens.ts` for club, academy, school, district and hybrid types

### Gradients

The controlled set includes the brand and organisation gradients plus `playr-gradient-navigation`, `playr-gradient-navigation-active`, and the stage-specific player gradients. Use them for primary buttons, small accent strips, identity surfaces, or navigation chrome. Do not put long text directly over them.

### Spacing

Use Tailwind's shared rhythm: `1` (4px), `2` (8px), `3` (12px), `4` (16px), `5` (20px), `6` (24px), `8` (32px), `10` (40px), `12` (48px), and `16` (64px). Standard page gutters are 16px mobile, 24px tablet and 32px desktop through `playrLayout.gutters`.

### Radius and shadow

- Radius: `rounded-playr-sm`, `rounded-playr-md`, `rounded-playr-lg`, `rounded-playr-xl`, or `rounded-full`
- Shadow: `shadow-playr-subtle`, `shadow-playr-card`, `shadow-playr-elevated`, `shadow-playr-floating`, `shadow-playr-navigation`

Standard cards use `lg`; controls use `md`; major identity cards may use `xl`; badges and avatars use `full`.

### Typography roles

- Hero: 36–48px, black weight; rare landing or identity use
- Page title: 30–36px, black weight
- Section title: 20–24px, black weight
- Card title: 18px, black weight
- Metric value: 24px, black weight
- Body: 14–16px with 24px line height
- Supporting text: 12–14px; never below 11px
- Eyebrow: 12px, black weight, uppercase and wide tracking; short labels only
- Button: 12–16px, bold, based on size

## Components

Shared components are exported from `components/playr-ui/index.ts`.

### `PlayRCard`

Variants: `default`, `interactive`, `muted`, `brand`, `dark`, `metric`, `danger`. It supports selected, disabled and loading states. An interactive card supplies visual feedback only; place a semantic link or button inside it rather than treating a non-interactive card as a button.

### `PlayRButton` and `PlayRLinkButton`

Variants: `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes: `sm`, `md`, `lg`, `icon`. Buttons have a 44px default touch target, visible focus, pressed feedback and disabled handling. `PlayRButton` supports a width-preserving loading state with an accessible label. Icon-only buttons require an `aria-label`.

```tsx
<PlayRButton variant="primary">Book a court</PlayRButton>
<PlayRLinkButton href="/dashboard/venues" variant="outline">View venues</PlayRLinkButton>
```

### `PlayRBadge`

Variants cover neutral, brand, semantic states, organisation types, rating, participation and privacy. It supports `sm`/`md`, an icon and a dot. Always include readable text; colour is supplementary.

### Headers and metrics

`PageHeader` supports standard, compact, profile, admin and hero density plus actions, leading content and back actions. `SectionHeader` supports description, count, status, icon and action. `MetricCard` displays only supplied values; never invent trends.

### States and loading

Use `EmptyState`, `SectionError` and `InlineError`. Actions are optional and must be functional. Use `Skeleton`, `CardSkeleton`, `PageHeaderSkeleton`, and `MetricSkeleton`; their geometry should approximate final content.

### Icons

Continue using `components/playr-icons.tsx`. Icons are decorative by default and accept a title when meaning must be announced. `IconContainer` is optional and should only be used when an icon needs visual hierarchy.

### Forms

Use `FormField`, `Input`, `Textarea`, and `Select`, or the compatibility class `form-control`. Labels must be visible and linked by `htmlFor`/`id`. Connect help/error IDs with `aria-describedby` at the usage site; set `invalid` for invalid controls. Disabled controls retain readable contrast and a clear cursor.

## Responsive rules

- Mobile: one column, 16px gutters, 44px controls, full-width primary actions when useful
- Tablet: two-column card grids where content remains readable
- Desktop: controlled widths (`standard`, `wide`, `reading`) and horizontal actions without adding density
- Long titles and badges must wrap; no shared component requires horizontal scrolling

## Application shell and navigation

The default shell is hybrid rather than full dark mode: deep navy outer chrome frames a light `playr-page-surface`, while reading surfaces and forms remain light. Player navigation visuals are centralised in `lib/navigation-visuals.ts`.

The mobile player bar uses five labelled destinations—Venues, Compete, MyPlayR, Messages and Rankings—with MyPlayR in the centre. It floats above the device safe area, keeps 44px-plus targets, and uses `aria-current="page"` for the selected route. Desktop navigation uses the same icons, gradient and active-state language. Active-route matching is centralised in `lib/player-navigation.ts`; the real unread count belongs to Messages, while account and privacy actions open from the header Settings control. Role-specific ClubR and CoachR navigation remains separate.

Player profile cards use `shadow-playr-card`, a subtle outer ring and `shadow-playr-elevated` on pointer hover. This is the shared floating treatment: it improves separation without changing stage gradients, card height or content hierarchy.

## Accessibility and motion

All controls use semantic elements and the shared teal focus ring. Status components include text. Error states use `role="alert"`; informational status alerts use `role="status"`. Decorative SVGs are hidden by the existing icon system. Global reduced-motion rules collapse animation and transition durations when `prefers-reduced-motion` is enabled.

## Migration guidance

The first validated consumers are MyPlayR player cards, player detail metrics and organisation cards, loading routes, page headers, status errors and Venue cards. Legacy `.btn-*`, `.ui-chip`, `.surface-card` and `.form-control` aliases remain for compatibility; migrate them when touching their owning feature rather than rewriting unrelated routes.
