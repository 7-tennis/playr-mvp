-- ClubR Phase 2.2: configurable memberships, applications and payment-ready billing.
-- Organisation roles remain the source of staff access. club_memberships remains
-- the venue booking-access record. These tables model the commercial membership.

create table public.club_membership_categories (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  description text,
  eligibility_class text not null default 'any',
  minimum_age integer,
  maximum_age integer,
  status text not null default 'active',
  display_order integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint club_membership_categories_eligibility_valid check (eligibility_class in ('any', 'adult', 'junior')),
  constraint club_membership_categories_age_valid check (
    (minimum_age is null or minimum_age between 0 and 120)
    and (maximum_age is null or maximum_age between 0 and 120)
    and (minimum_age is null or maximum_age is null or maximum_age >= minimum_age)
  ),
  constraint club_membership_categories_status_valid check (status in ('active', 'archived')),
  constraint club_membership_categories_archive_valid check (
    (status = 'archived' and archived_at is not null) or (status = 'active' and archived_at is null)
  ),
  constraint club_membership_categories_venue_name_unique unique (venue_id, name)
);

create table public.club_membership_plans (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  category_id uuid not null references public.club_membership_categories(id) on delete restrict,
  previous_version_id uuid references public.club_membership_plans(id) on delete set null,
  version integer not null default 1,
  name text not null,
  description text,
  base_price_cents integer not null default 0,
  currency text not null default 'ZAR',
  joining_fee_cents integer not null default 0,
  joining_fee_scope text not null default 'none',
  duration_months integer,
  no_fixed_term boolean not null default false,
  start_rule text not null default 'immediate',
  maximum_covered_members integer not null default 1,
  primary_member_required boolean not null default true,
  adult_primary_required boolean not null default false,
  most_expensive_primary boolean not null default false,
  parent_may_purchase_for_juniors boolean not null default true,
  payer_may_differ boolean not null default false,
  approval_required boolean not null default true,
  activation_policy text not null default 'after_manual_payment',
  booking_entitlement jsonb not null default '{}'::jsonb,
  benefits_text text,
  terms_text text,
  status text not null default 'draft',
  is_legacy boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_plans_name_not_blank check (length(btrim(name)) > 0),
  constraint club_membership_plans_amounts_valid check (base_price_cents >= 0 and joining_fee_cents >= 0),
  constraint club_membership_plans_currency_valid check (currency ~ '^[A-Z]{3}$'),
  constraint club_membership_plans_joining_scope_valid check (joining_fee_scope in ('none', 'subscription', 'covered_member')),
  constraint club_membership_plans_duration_valid check (
    (no_fixed_term and duration_months is null)
    or (not no_fixed_term and duration_months between 1 and 120)
  ),
  constraint club_membership_plans_start_rule_valid check (start_rule in ('immediate', 'selected_date', 'next_month')),
  constraint club_membership_plans_covered_valid check (maximum_covered_members between 1 and 30),
  constraint club_membership_plans_activation_valid check (activation_policy in ('on_approval', 'after_manual_payment')),
  constraint club_membership_plans_status_valid check (status in ('draft', 'active', 'archived')),
  constraint club_membership_plans_booking_entitlement_object check (jsonb_typeof(booking_entitlement) = 'object'),
  constraint club_membership_plans_venue_version_unique unique (venue_id, name, version)
);

create table public.club_membership_pricing_options (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  plan_id uuid not null references public.club_membership_plans(id) on delete cascade,
  label text not null,
  commitment_months integer,
  no_fixed_term boolean not null default false,
  payment_frequency text not null,
  discount_type text not null default 'none',
  discount_value numeric(12,2) not null default 0,
  displayed_price_cents integer,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_pricing_options_label_not_blank check (length(btrim(label)) > 0),
  constraint club_membership_pricing_options_commitment_valid check (
    (no_fixed_term and commitment_months is null)
    or (not no_fixed_term and commitment_months between 1 and 120)
  ),
  constraint club_membership_pricing_options_frequency_valid check (payment_frequency in ('once_off', 'monthly', 'every_3_months', 'every_6_months', 'annually')),
  constraint club_membership_pricing_options_discount_valid check (
    discount_type in ('none', 'percentage', 'fixed')
    and discount_value >= 0
    and (discount_type <> 'percentage' or discount_value <= 100)
    and (discount_type <> 'none' or discount_value = 0)
  ),
  constraint club_membership_pricing_options_price_valid check (displayed_price_cents is null or displayed_price_cents >= 0),
  constraint club_membership_pricing_options_plan_label_unique unique (plan_id, label)
);

create table public.club_membership_addon_rules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  primary_plan_id uuid not null references public.club_membership_plans(id) on delete cascade,
  addon_plan_id uuid not null references public.club_membership_plans(id) on delete restrict,
  member_class text not null default 'any',
  maximum_addons integer not null default 1,
  adjustment_type text not null default 'none',
  adjustment_value numeric(12,2) not null default 0,
  use_addon_plan_price boolean not null default true,
  joining_fee_policy text not null default 'plan_default',
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_addon_rules_class_valid check (member_class in ('any', 'adult', 'junior')),
  constraint club_membership_addon_rules_max_valid check (maximum_addons between 1 and 29),
  constraint club_membership_addon_rules_adjustment_valid check (
    adjustment_type in ('none', 'percentage', 'fixed')
    and adjustment_value >= 0
    and (adjustment_type <> 'percentage' or adjustment_value <= 100)
    and (adjustment_type <> 'none' or adjustment_value = 0)
  ),
  constraint club_membership_addon_rules_joining_valid check (joining_fee_policy in ('plan_default', 'waive')),
  constraint club_membership_addon_rules_plan_unique unique (primary_plan_id, addon_plan_id, member_class)
);

create table public.club_membership_staff_permissions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_review_applications boolean not null default false,
  can_manage_subscriptions boolean not null default false,
  can_view_billing boolean not null default false,
  can_record_manual_payments boolean not null default false,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_staff_permissions_unique unique (venue_id, user_id)
);

create table public.club_membership_applications (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  applicant_profile_id uuid not null references public.profiles(id) on delete restrict,
  payer_profile_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.club_membership_plans(id) on delete restrict,
  pricing_option_id uuid not null references public.club_membership_pricing_options(id) on delete restrict,
  requested_start_date date not null,
  status text not null default 'pending_application',
  currency text not null,
  calculated_total_cents integer not null,
  price_snapshot jsonb not null,
  terms_accepted boolean not null default false,
  terms_accepted_at timestamptz,
  applicant_notes text,
  staff_notes text,
  correction_message text,
  decline_reason text,
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_applications_status_valid check (status in ('draft', 'pending_application', 'pending_approval', 'approved', 'declined', 'correction_requested', 'cancelled')),
  constraint club_membership_applications_total_valid check (calculated_total_cents >= 0),
  constraint club_membership_applications_snapshot_object check (jsonb_typeof(price_snapshot) = 'object'),
  constraint club_membership_applications_terms_valid check (
    (status = 'draft') or (terms_accepted and terms_accepted_at is not null)
  )
);

create table public.club_membership_application_members (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.club_membership_applications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  selected_plan_id uuid not null references public.club_membership_plans(id) on delete restrict,
  member_role text not null,
  sequence_number integer not null,
  base_amount_cents integer not null,
  adjustment_cents integer not null default 0,
  joining_fee_cents integer not null default 0,
  final_amount_cents integer not null,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint club_membership_application_members_role_valid check (member_role in ('primary', 'adult_addon', 'junior_addon')),
  constraint club_membership_application_members_sequence_valid check (sequence_number >= 1),
  constraint club_membership_application_members_amounts_valid check (base_amount_cents >= 0 and adjustment_cents <= 0 and joining_fee_cents >= 0 and final_amount_cents >= 0),
  constraint club_membership_application_members_eligibility_object check (jsonb_typeof(eligibility_snapshot) = 'object'),
  constraint club_membership_application_members_profile_unique unique (application_id, profile_id),
  constraint club_membership_application_members_sequence_unique unique (application_id, sequence_number)
);

create table public.club_membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  application_id uuid unique references public.club_membership_applications(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete restrict,
  applicant_profile_id uuid not null references public.profiles(id) on delete restrict,
  payer_profile_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.club_membership_plans(id) on delete restrict,
  pricing_option_id uuid references public.club_membership_pricing_options(id) on delete restrict,
  status text not null,
  start_date date not null,
  expiry_date date,
  currency text not null,
  accepted_total_cents integer not null,
  amount_due_cents integer not null,
  price_snapshot jsonb not null,
  is_legacy boolean not null default false,
  activated_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_subscriptions_status_valid check (status in ('pending_activation', 'active', 'paused', 'expiring', 'expired', 'cancelled')),
  constraint club_membership_subscriptions_dates_valid check (expiry_date is null or expiry_date >= start_date),
  constraint club_membership_subscriptions_amounts_valid check (accepted_total_cents >= 0 and amount_due_cents >= 0),
  constraint club_membership_subscriptions_snapshot_object check (jsonb_typeof(price_snapshot) = 'object')
);

create table public.club_membership_subscription_members (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.club_membership_subscriptions(id) on delete restrict,
  venue_id uuid not null references public.venues(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  selected_plan_id uuid not null references public.club_membership_plans(id) on delete restrict,
  club_membership_id uuid references public.club_memberships(id) on delete set null,
  member_role text not null,
  status text not null default 'pending',
  base_amount_cents integer not null,
  adjustment_cents integer not null default 0,
  joining_fee_cents integer not null default 0,
  final_amount_cents integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_subscription_members_role_valid check (member_role in ('primary', 'adult_addon', 'junior_addon')),
  constraint club_membership_subscription_members_status_valid check (status in ('pending', 'active', 'paused', 'expired', 'cancelled')),
  constraint club_membership_subscription_members_amounts_valid check (base_amount_cents >= 0 and adjustment_cents <= 0 and joining_fee_cents >= 0 and final_amount_cents >= 0),
  constraint club_membership_subscription_members_profile_unique unique (subscription_id, profile_id)
);

create table public.club_membership_invoices (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  subscription_id uuid not null references public.club_membership_subscriptions(id) on delete restrict,
  payer_profile_id uuid not null references public.profiles(id) on delete restrict,
  reference_number text not null unique,
  sequence_number integer not null,
  billing_period_start date,
  billing_period_end date,
  line_items jsonb not null,
  currency text not null,
  total_cents integer not null,
  amount_due_cents integer not null,
  due_date date not null,
  status text not null default 'issued',
  provider_reference text,
  transaction_reference text,
  settlement_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_invoices_sequence_valid check (sequence_number >= 1),
  constraint club_membership_invoices_line_items_array check (jsonb_typeof(line_items) = 'array'),
  constraint club_membership_invoices_amounts_valid check (total_cents >= 0 and amount_due_cents >= 0),
  constraint club_membership_invoices_status_valid check (status in ('draft', 'issued', 'due', 'manually_paid', 'cancelled')),
  constraint club_membership_invoices_subscription_sequence_unique unique (subscription_id, sequence_number)
);

create table public.club_membership_billing_schedules (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  subscription_id uuid not null references public.club_membership_subscriptions(id) on delete restrict,
  pricing_option_id uuid references public.club_membership_pricing_options(id) on delete restrict,
  invoice_id uuid references public.club_membership_invoices(id) on delete set null,
  sequence_number integer not null,
  due_date date not null,
  amount_cents integer not null,
  paid_amount_cents integer not null default 0,
  currency text not null,
  status text not null default 'scheduled',
  provider_reference text,
  transaction_reference text,
  settlement_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_membership_billing_schedule_sequence_valid check (sequence_number >= 1),
  constraint club_membership_billing_schedule_amounts_valid check (amount_cents >= 0 and paid_amount_cents between 0 and amount_cents),
  constraint club_membership_billing_schedule_status_valid check (status in ('scheduled', 'manually_paid', 'waived', 'cancelled')),
  constraint club_membership_billing_schedule_unique unique (subscription_id, sequence_number)
);

create table public.club_membership_manual_payments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  subscription_id uuid not null references public.club_membership_subscriptions(id) on delete restrict,
  invoice_id uuid references public.club_membership_invoices(id) on delete set null,
  billing_schedule_id uuid references public.club_membership_billing_schedules(id) on delete set null,
  payer_profile_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null,
  currency text not null,
  received_on date not null,
  payment_method text not null,
  payment_reference text not null,
  note text,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  provider_reference text,
  transaction_reference text,
  settlement_reference text,
  created_at timestamptz not null default now(),
  constraint club_membership_manual_payments_amount_valid check (amount_cents > 0),
  constraint club_membership_manual_payments_method_valid check (payment_method in ('eft', 'cash', 'card_at_club', 'other')),
  constraint club_membership_manual_payments_reference_not_blank check (length(btrim(payment_reference)) > 0)
);

create table public.club_membership_status_history (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  application_id uuid references public.club_membership_applications(id) on delete set null,
  subscription_id uuid references public.club_membership_subscriptions(id) on delete set null,
  previous_status text,
  new_status text not null,
  reason text,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint club_membership_status_history_target check (application_id is not null or subscription_id is not null)
);

create index club_membership_categories_venue_status_idx on public.club_membership_categories(venue_id, status, display_order);
create index club_membership_plans_venue_status_idx on public.club_membership_plans(venue_id, status, category_id, name);
create index club_membership_pricing_options_plan_idx on public.club_membership_pricing_options(plan_id, is_active, display_order);
create index club_membership_addon_rules_plan_idx on public.club_membership_addon_rules(primary_plan_id, is_active, display_order);
create index club_membership_applications_venue_status_idx on public.club_membership_applications(venue_id, status, submitted_at desc);
create index club_membership_applications_owner_idx on public.club_membership_applications(owner_user_id, created_at desc);
create index club_membership_application_members_profile_idx on public.club_membership_application_members(profile_id, application_id);
create index club_membership_subscriptions_venue_status_idx on public.club_membership_subscriptions(venue_id, status, expiry_date);
create index club_membership_subscriptions_owner_idx on public.club_membership_subscriptions(owner_user_id, created_at desc);
create index club_membership_subscription_members_profile_idx on public.club_membership_subscription_members(profile_id, status, subscription_id);
create index club_membership_billing_schedule_due_idx on public.club_membership_billing_schedules(venue_id, status, due_date);
create index club_membership_invoices_subscription_idx on public.club_membership_invoices(subscription_id, sequence_number);
create index club_membership_manual_payments_subscription_idx on public.club_membership_manual_payments(subscription_id, created_at desc);
create index club_membership_status_history_subscription_idx on public.club_membership_status_history(subscription_id, changed_at desc);

create trigger club_membership_categories_set_updated_at before update on public.club_membership_categories for each row execute function public.set_updated_at();
create trigger club_membership_plans_set_updated_at before update on public.club_membership_plans for each row execute function public.set_updated_at();
create trigger club_membership_pricing_options_set_updated_at before update on public.club_membership_pricing_options for each row execute function public.set_updated_at();
create trigger club_membership_addon_rules_set_updated_at before update on public.club_membership_addon_rules for each row execute function public.set_updated_at();
create trigger club_membership_staff_permissions_set_updated_at before update on public.club_membership_staff_permissions for each row execute function public.set_updated_at();
create trigger club_membership_applications_set_updated_at before update on public.club_membership_applications for each row execute function public.set_updated_at();
create trigger club_membership_subscriptions_set_updated_at before update on public.club_membership_subscriptions for each row execute function public.set_updated_at();
create trigger club_membership_subscription_members_set_updated_at before update on public.club_membership_subscription_members for each row execute function public.set_updated_at();
create trigger club_membership_invoices_set_updated_at before update on public.club_membership_invoices for each row execute function public.set_updated_at();
create trigger club_membership_billing_schedules_set_updated_at before update on public.club_membership_billing_schedules for each row execute function public.set_updated_at();

create or replace function public.clubr_membership_permission(
  check_venue_id uuid,
  check_permission text,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.user_is_platform_admin(check_user_id)
      or public.user_has_active_organisation_role(
        check_venue_id,
        array['organisation_admin', 'club_manager']::public.organisation_role[],
        check_user_id
      )
      or exists (
        select 1
        from public.club_membership_staff_permissions permission
        where permission.venue_id = check_venue_id
          and permission.user_id = check_user_id
          and case check_permission
            when 'applications_review' then permission.can_review_applications
            when 'subscriptions_manage' then permission.can_manage_subscriptions
            when 'billing_view' then permission.can_view_billing
            when 'payments_record' then permission.can_record_manual_payments
            else false
          end
      )
    );
$$;

create or replace function public.playr_user_can_browse_club_memberships(
  check_venue_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and (
      public.clubr_user_has_access(check_venue_id, check_user_id)
      or exists (
        select 1
        from public.profiles profile
        join public.club_memberships membership on membership.profile_id = profile.id
        where membership.venue_id = check_venue_id
          and public.can_manage_profile(profile.id, check_user_id)
      )
      or exists (
        select 1
        from public.organisation_player_links link
        where link.venue_id = check_venue_id
          and link.status in ('pending', 'active', 'suspended')
          and public.can_manage_profile(link.player_profile_id, check_user_id)
      )
    );
$$;

create or replace function public.clubr_can_view_membership_application(
  check_application_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.club_membership_applications application
      where application.id = check_application_id
        and (
          application.owner_user_id = check_user_id
          or public.clubr_membership_permission(application.venue_id, 'applications_review', check_user_id)
        )
    );
$$;

create or replace function public.clubr_can_view_membership_subscription(
  check_subscription_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select check_user_id = (select auth.uid())
    and exists (
      select 1
      from public.club_membership_subscriptions subscription
      where subscription.id = check_subscription_id
        and (
          subscription.owner_user_id = check_user_id
          or public.can_manage_profile(subscription.applicant_profile_id, check_user_id)
          or public.can_manage_profile(subscription.payer_profile_id, check_user_id)
          or exists (
            select 1
            from public.club_membership_subscription_members covered
            where covered.subscription_id = subscription.id
              and public.can_manage_profile(covered.profile_id, check_user_id)
          )
          or public.clubr_membership_permission(subscription.venue_id, 'billing_view', check_user_id)
          or public.clubr_membership_permission(subscription.venue_id, 'subscriptions_manage', check_user_id)
        )
    );
$$;

create or replace function public.clubr_membership_profile_eligibility(
  p_profile_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_profile public.profiles;
  target_plan public.club_membership_plans;
  target_category public.club_membership_categories;
  profile_age integer;
  eligible boolean := true;
  reason text := 'eligible';
begin
  select * into target_profile from public.profiles where id = p_profile_id;
  select * into target_plan from public.club_membership_plans where id = p_plan_id;
  select * into target_category from public.club_membership_categories where id = target_plan.category_id;

  if target_profile.id is null or target_plan.id is null or target_category.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'profile_or_plan_missing');
  end if;

  if (select auth.uid()) is null
    or not (
      public.can_manage_profile(target_profile.id)
      or public.clubr_membership_permission(target_plan.venue_id, 'applications_review')
    ) then
    return jsonb_build_object('eligible', false, 'reason', 'profile_access_denied');
  end if;

  if target_plan.status = 'archived' or target_category.status = 'archived' then
    eligible := false;
    reason := 'plan_unavailable';
  elsif target_category.eligibility_class = 'adult' and target_profile.is_junior then
    eligible := false;
    reason := 'adult_only';
  elsif target_category.eligibility_class = 'junior' and not target_profile.is_junior then
    eligible := false;
    reason := 'junior_only';
  end if;

  if target_profile.date_of_birth is not null then
    profile_age := date_part('year', age(current_date, target_profile.date_of_birth))::integer;
    if target_category.minimum_age is not null and profile_age < target_category.minimum_age then
      eligible := false;
      reason := 'below_minimum_age';
    elsif target_category.maximum_age is not null and profile_age > target_category.maximum_age then
      eligible := false;
      reason := 'above_maximum_age';
    end if;
  elsif target_category.minimum_age is not null or target_category.maximum_age is not null then
    eligible := false;
    reason := 'date_of_birth_required';
  end if;

  return jsonb_build_object(
    'eligible', eligible,
    'reason', reason,
    'profile_id', target_profile.id,
    'plan_id', target_plan.id,
    'is_junior', target_profile.is_junior,
    'age', profile_age,
    'category', target_category.name,
    'eligibility_class', target_category.eligibility_class
  );
end;
$$;

create or replace function public.clubr_calculate_membership_price(
  p_plan_id uuid,
  p_pricing_option_id uuid,
  p_members jsonb,
  p_start_date date,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  primary_plan public.club_membership_plans;
  pricing_option public.club_membership_pricing_options;
  member_item jsonb;
  member_profile public.profiles;
  member_plan public.club_membership_plans;
  addon_rule public.club_membership_addon_rules;
  eligibility jsonb;
  member_role text;
  member_profile_id uuid;
  member_plan_id uuid;
  member_number integer := 0;
  primary_count integer := 0;
  addon_count integer := 0;
  base_amount integer;
  adjustment_amount integer;
  member_joining_fee integer;
  member_total integer;
  subtotal_cents integer := 0;
  joining_fee_cents integer := 0;
  term_discount_cents integer := 0;
  total_cents integer := 0;
  member_lines jsonb := '[]'::jsonb;
  actor_can_admin boolean;
begin
  if p_user_id is distinct from (select auth.uid()) or p_start_date is null then
    raise exception 'membership_access_or_date' using errcode = 'P0001';
  end if;

  select * into primary_plan from public.club_membership_plans where id = p_plan_id;
  select * into pricing_option
  from public.club_membership_pricing_options
  where id = p_pricing_option_id and plan_id = p_plan_id and is_active;

  actor_can_admin := primary_plan.id is not null
    and public.clubr_membership_permission(primary_plan.venue_id, 'applications_review', p_user_id);

  if primary_plan.id is null
    or pricing_option.id is null
    or (primary_plan.status <> 'active' and not actor_can_admin)
    or jsonb_typeof(p_members) <> 'array'
    or jsonb_array_length(p_members) = 0
    or jsonb_array_length(p_members) > primary_plan.maximum_covered_members then
    raise exception 'membership_plan_or_members_invalid' using errcode = 'P0001';
  end if;

  if not actor_can_admin
    and not public.playr_user_can_browse_club_memberships(primary_plan.venue_id, p_user_id) then
    raise exception 'membership_club_relationship_required' using errcode = 'P0001';
  end if;

  for member_item in select value from jsonb_array_elements(p_members)
  loop
    member_number := member_number + 1;
    member_profile_id := nullif(member_item->>'profile_id', '')::uuid;
    member_plan_id := coalesce(nullif(member_item->>'selected_plan_id', '')::uuid, p_plan_id);
    member_role := coalesce(nullif(member_item->>'member_role', ''), case when member_number = 1 then 'primary' else 'adult_addon' end);

    select * into member_profile from public.profiles where id = member_profile_id;
    select * into member_plan from public.club_membership_plans where id = member_plan_id and venue_id = primary_plan.venue_id;

    if member_profile.id is null
      or member_plan.id is null
      or not (public.can_manage_profile(member_profile_id, p_user_id) or actor_can_admin)
      or member_role not in ('primary', 'adult_addon', 'junior_addon') then
      raise exception 'membership_member_access_or_plan' using errcode = 'P0001';
    end if;

    if member_profile.is_junior and member_role = 'adult_addon' then
      member_role := 'junior_addon';
    elsif not member_profile.is_junior and member_role = 'junior_addon' then
      member_role := 'adult_addon';
    end if;

    eligibility := public.clubr_membership_profile_eligibility(member_profile_id, member_plan_id);
    if not coalesce((eligibility->>'eligible')::boolean, false) then
      raise exception 'membership_member_ineligible:%', eligibility->>'reason' using errcode = 'P0001';
    end if;

    if member_role = 'primary' then
      primary_count := primary_count + 1;
      if member_plan_id <> p_plan_id
        or (primary_plan.adult_primary_required and member_profile.is_junior) then
        raise exception 'membership_primary_invalid' using errcode = 'P0001';
      end if;
      addon_rule.id := null;
    else
      addon_count := addon_count + 1;
      select * into addon_rule
      from public.club_membership_addon_rules rule
      where rule.primary_plan_id = p_plan_id
        and rule.addon_plan_id = member_plan_id
        and rule.is_active
        and (rule.member_class = 'any' or rule.member_class = case when member_profile.is_junior then 'junior' else 'adult' end)
      order by case when rule.member_class = 'any' then 1 else 0 end, rule.display_order
      limit 1;

      if addon_rule.id is null then
        raise exception 'membership_addon_not_allowed' using errcode = 'P0001';
      end if;

      if (
        select count(*)
        from jsonb_array_elements(p_members) candidate
        where coalesce(nullif(candidate->>'selected_plan_id', '')::uuid, p_plan_id) = member_plan_id
          and coalesce(candidate->>'member_role', '') <> 'primary'
      ) > addon_rule.maximum_addons then
        raise exception 'membership_addon_limit' using errcode = 'P0001';
      end if;
    end if;

    base_amount := member_plan.base_price_cents;
    adjustment_amount := 0;
    if member_role <> 'primary' and addon_rule.id is not null then
      if addon_rule.adjustment_type = 'percentage' then
        adjustment_amount := -least(base_amount, round(base_amount * addon_rule.adjustment_value / 100.0)::integer);
      elsif addon_rule.adjustment_type = 'fixed' then
        adjustment_amount := -least(base_amount, round(addon_rule.adjustment_value * 100)::integer);
      end if;
    end if;

    member_joining_fee := 0;
    if member_role = 'primary' and primary_plan.joining_fee_scope = 'subscription' then
      member_joining_fee := primary_plan.joining_fee_cents;
    elsif member_plan.joining_fee_scope = 'covered_member'
      and (member_role = 'primary' or addon_rule.id is null or addon_rule.joining_fee_policy <> 'waive') then
      member_joining_fee := member_plan.joining_fee_cents;
    end if;

    member_total := greatest(0, base_amount + adjustment_amount) + member_joining_fee;
    subtotal_cents := subtotal_cents + greatest(0, base_amount + adjustment_amount);
    joining_fee_cents := joining_fee_cents + member_joining_fee;

    member_lines := member_lines || jsonb_build_array(jsonb_build_object(
      'sequence_number', member_number,
      'profile_id', member_profile.id,
      'profile_name', concat_ws(' ', member_profile.first_name, member_profile.last_name),
      'member_role', member_role,
      'selected_plan_id', member_plan.id,
      'plan_name', member_plan.name,
      'category_id', member_plan.category_id,
      'base_amount_cents', base_amount,
      'adjustment_cents', adjustment_amount,
      'joining_fee_cents', member_joining_fee,
      'final_amount_cents', member_total,
      'eligibility', eligibility
    ));
  end loop;

  if primary_plan.primary_member_required and primary_count <> 1 then
    raise exception 'membership_primary_required' using errcode = 'P0001';
  elsif not primary_plan.primary_member_required and primary_count > 1 then
    raise exception 'membership_primary_invalid' using errcode = 'P0001';
  end if;

  if pricing_option.discount_type = 'percentage' then
    term_discount_cents := least(subtotal_cents, round(subtotal_cents * pricing_option.discount_value / 100.0)::integer);
  elsif pricing_option.discount_type = 'fixed' then
    term_discount_cents := least(subtotal_cents, round(pricing_option.discount_value * 100)::integer);
  end if;

  total_cents := greatest(0, subtotal_cents - term_discount_cents) + joining_fee_cents;

  return jsonb_build_object(
    'calculation_version', 1,
    'calculated_at', now(),
    'venue_id', primary_plan.venue_id,
    'plan_id', primary_plan.id,
    'plan_name', primary_plan.name,
    'plan_version', primary_plan.version,
    'category_id', primary_plan.category_id,
    'pricing_option_id', pricing_option.id,
    'pricing_option_label', pricing_option.label,
    'commitment_months', pricing_option.commitment_months,
    'no_fixed_term', pricing_option.no_fixed_term,
    'payment_frequency', pricing_option.payment_frequency,
    'discount_type', pricing_option.discount_type,
    'discount_value', pricing_option.discount_value,
    'requested_start_date', p_start_date,
    'currency', primary_plan.currency,
    'members', member_lines,
    'covered_member_count', member_number,
    'addon_count', addon_count,
    'subtotal_cents', subtotal_cents,
    'term_discount_cents', term_discount_cents,
    'joining_fee_cents', joining_fee_cents,
    'total_cents', total_cents,
    'calculation_order', jsonb_build_array('base_plan_amount', 'covered_member_pricing', 'addon_adjustments', 'term_discount', 'joining_fee', 'final_amount')
  );
end;
$$;

create or replace function public.clubr_protect_active_plan_terms()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'active' and exists (
    select 1 from public.club_membership_subscriptions subscription where subscription.plan_id = old.id
  ) and (
    new.name is distinct from old.name
    or new.category_id is distinct from old.category_id
    or new.base_price_cents is distinct from old.base_price_cents
    or new.currency is distinct from old.currency
    or new.joining_fee_cents is distinct from old.joining_fee_cents
    or new.joining_fee_scope is distinct from old.joining_fee_scope
    or new.duration_months is distinct from old.duration_months
    or new.maximum_covered_members is distinct from old.maximum_covered_members
    or new.activation_policy is distinct from old.activation_policy
  ) then
    raise exception 'Create a new plan version for changed commercial terms';
  end if;
  return new;
end;
$$;

create trigger club_membership_plans_protect_active_terms
before update on public.club_membership_plans
for each row execute function public.clubr_protect_active_plan_terms();

create or replace function public.clubr_submit_membership_application(
  p_plan_id uuid,
  p_pricing_option_id uuid,
  p_applicant_profile_id uuid,
  p_payer_profile_id uuid,
  p_members jsonb,
  p_requested_start_date date,
  p_terms_accepted boolean,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  calculation jsonb;
  new_application_id uuid := gen_random_uuid();
  member_line jsonb;
  target_venue_id uuid;
  staff_user_id uuid;
begin
  if actor_user_id is null
    or not p_terms_accepted
    or not public.can_manage_profile(p_applicant_profile_id, actor_user_id)
    or not public.can_manage_profile(p_payer_profile_id, actor_user_id) then
    raise exception 'membership_application_access' using errcode = 'P0001';
  end if;

  calculation := public.clubr_calculate_membership_price(
    p_plan_id,
    p_pricing_option_id,
    p_members,
    p_requested_start_date,
    actor_user_id
  );
  target_venue_id := (calculation->>'venue_id')::uuid;

  if exists (
    select 1
    from public.club_membership_applications application
    join public.club_membership_application_members member on member.application_id = application.id
    where application.venue_id = target_venue_id
      and application.status in ('pending_application', 'pending_approval', 'approved', 'correction_requested')
      and member.profile_id in (
        select (item->>'profile_id')::uuid from jsonb_array_elements(p_members) item
      )
  ) or exists (
    select 1
    from public.club_membership_subscriptions subscription
    join public.club_membership_subscription_members member on member.subscription_id = subscription.id
    where subscription.venue_id = target_venue_id
      and subscription.status in ('pending_activation', 'active', 'paused', 'expiring')
      and member.profile_id in (
        select (item->>'profile_id')::uuid from jsonb_array_elements(p_members) item
      )
  ) then
    raise exception 'membership_duplicate_active_or_pending' using errcode = '23505';
  end if;

  insert into public.club_membership_applications (
    id, venue_id, owner_user_id, applicant_profile_id, payer_profile_id,
    plan_id, pricing_option_id, requested_start_date, status, currency,
    calculated_total_cents, price_snapshot, terms_accepted, terms_accepted_at,
    applicant_notes, submitted_at
  ) values (
    new_application_id, target_venue_id, actor_user_id, p_applicant_profile_id, p_payer_profile_id,
    p_plan_id, p_pricing_option_id, p_requested_start_date, 'pending_approval', calculation->>'currency',
    (calculation->>'total_cents')::integer, calculation, true, now(),
    nullif(btrim(coalesce(p_notes, '')), ''), now()
  );

  for member_line in select value from jsonb_array_elements(calculation->'members')
  loop
    insert into public.club_membership_application_members (
      application_id, profile_id, selected_plan_id, member_role, sequence_number,
      base_amount_cents, adjustment_cents, joining_fee_cents, final_amount_cents,
      eligibility_snapshot
    ) values (
      new_application_id,
      (member_line->>'profile_id')::uuid,
      (member_line->>'selected_plan_id')::uuid,
      member_line->>'member_role',
      (member_line->>'sequence_number')::integer,
      (member_line->>'base_amount_cents')::integer,
      (member_line->>'adjustment_cents')::integer,
      (member_line->>'joining_fee_cents')::integer,
      (member_line->>'final_amount_cents')::integer,
      member_line->'eligibility'
    );
  end loop;

  insert into public.club_membership_status_history (
    venue_id, application_id, previous_status, new_status, reason, changed_by_user_id
  ) values (
    target_venue_id, new_application_id, null, 'pending_approval', 'Application submitted', actor_user_id
  );

  for staff_user_id in
    select distinct membership.user_id
    from public.organisation_memberships membership
    where membership.venue_id = target_venue_id
      and membership.status = 'active'
      and membership.role in ('organisation_admin', 'club_manager')
      and membership.user_id is not null
    union
    select permission.user_id
    from public.club_membership_staff_permissions permission
    where permission.venue_id = target_venue_id and permission.can_review_applications
  loop
    perform public.create_system_notification(
      staff_user_id,
      'membership_application_submitted',
      'Membership application submitted',
      'A membership application is ready for review.',
      '/dashboard/clubr/memberships/applications/' || new_application_id,
      actor_user_id,
      p_applicant_profile_id,
      null,
      jsonb_build_object('application_id', new_application_id, 'venue_id', target_venue_id),
      'membership-application-submitted-' || new_application_id || '-' || staff_user_id
    );
  end loop;

  return new_application_id;
end;
$$;

create or replace function public.clubr_generate_membership_billing(
  p_subscription_id uuid,
  p_actor_user_id uuid default auth.uid()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_subscription public.club_membership_subscriptions;
  target_option public.club_membership_pricing_options;
  instalment_count integer;
  interval_months integer;
  sequence_value integer;
  base_instalment integer;
  remainder integer;
  instalment_amount integer;
  due_on date;
  new_invoice_id uuid;
begin
  select * into target_subscription
  from public.club_membership_subscriptions
  where id = p_subscription_id
  for update;

  if target_subscription.id is null
    or not (
      public.clubr_membership_permission(target_subscription.venue_id, 'subscriptions_manage', p_actor_user_id)
      or public.clubr_membership_permission(target_subscription.venue_id, 'applications_review', p_actor_user_id)
    ) then
    raise exception 'membership_billing_access' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.club_membership_billing_schedules schedule where schedule.subscription_id = p_subscription_id) then
    return 0;
  end if;

  select * into target_option from public.club_membership_pricing_options where id = target_subscription.pricing_option_id;

  if target_subscription.accepted_total_cents = 0 then
    return 0;
  end if;

  interval_months := case target_option.payment_frequency
    when 'monthly' then 1
    when 'every_3_months' then 3
    when 'every_6_months' then 6
    when 'annually' then 12
    else 0
  end;

  instalment_count := case
    when target_option.id is null or target_option.payment_frequency = 'once_off' then 1
    when target_option.no_fixed_term then 1
    else greatest(1, ceil(target_option.commitment_months::numeric / interval_months)::integer)
  end;
  base_instalment := target_subscription.accepted_total_cents / instalment_count;
  remainder := target_subscription.accepted_total_cents - (base_instalment * instalment_count);

  for sequence_value in 1..instalment_count
  loop
    instalment_amount := base_instalment + case when sequence_value = 1 then remainder else 0 end;
    due_on := target_subscription.start_date + make_interval(months => greatest(0, sequence_value - 1) * interval_months);

    insert into public.club_membership_invoices (
      venue_id, subscription_id, payer_profile_id, reference_number, sequence_number,
      billing_period_start, billing_period_end, line_items, currency, total_cents,
      amount_due_cents, due_date, status
    ) values (
      target_subscription.venue_id,
      target_subscription.id,
      target_subscription.payer_profile_id,
      'MEM-' || upper(substr(replace(target_subscription.id::text, '-', ''), 1, 10)) || '-' || lpad(sequence_value::text, 2, '0'),
      sequence_value,
      due_on,
      case when interval_months > 0 then (due_on + make_interval(months => interval_months) - interval '1 day')::date else target_subscription.expiry_date end,
      jsonb_build_array(jsonb_build_object(
        'description', case when instalment_count = 1 then 'Membership total' else 'Membership payment ' || sequence_value || ' of ' || instalment_count end,
        'amount_cents', instalment_amount,
        'pricing_snapshot', case when sequence_value = 1 then target_subscription.price_snapshot else null end
      )),
      target_subscription.currency,
      instalment_amount,
      instalment_amount,
      due_on,
      'issued'
    ) returning id into new_invoice_id;

    insert into public.club_membership_billing_schedules (
      venue_id, subscription_id, pricing_option_id, invoice_id, sequence_number,
      due_date, amount_cents, currency, status
    ) values (
      target_subscription.venue_id,
      target_subscription.id,
      target_subscription.pricing_option_id,
      new_invoice_id,
      sequence_value,
      due_on,
      instalment_amount,
      target_subscription.currency,
      'scheduled'
    );
  end loop;

  return instalment_count;
end;
$$;

create or replace function public.clubr_approve_membership_application(
  p_application_id uuid,
  p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_application public.club_membership_applications;
  target_plan public.club_membership_plans;
  calculation jsonb;
  members_input jsonb;
  new_subscription_id uuid;
  new_club_membership_id uuid;
  application_member public.club_membership_application_members;
  target_status text;
  covered_status text;
  expiry_on date;
begin
  select * into target_application
  from public.club_membership_applications
  where id = p_application_id
  for update;

  if not p_confirmed
    or target_application.id is null
    or target_application.status <> 'pending_approval'
    or not public.clubr_membership_permission(target_application.venue_id, 'applications_review', actor_user_id) then
    raise exception 'membership_approval_access_or_state' using errcode = 'P0001';
  end if;

  select * into target_plan from public.club_membership_plans where id = target_application.plan_id;

  select jsonb_agg(jsonb_build_object(
    'profile_id', member.profile_id,
    'selected_plan_id', member.selected_plan_id,
    'member_role', member.member_role
  ) order by member.sequence_number)
  into members_input
  from public.club_membership_application_members member
  where member.application_id = target_application.id;

  calculation := public.clubr_calculate_membership_price(
    target_application.plan_id,
    target_application.pricing_option_id,
    members_input,
    target_application.requested_start_date,
    actor_user_id
  );

  if (calculation->>'total_cents')::integer <> target_application.calculated_total_cents
    or calculation->>'currency' <> target_application.currency then
    raise exception 'membership_price_changed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.club_membership_application_members candidate
    join public.club_membership_subscription_members covered on covered.profile_id = candidate.profile_id
    join public.club_membership_subscriptions subscription on subscription.id = covered.subscription_id
    where candidate.application_id = target_application.id
      and subscription.venue_id = target_application.venue_id
      and subscription.status in ('pending_activation', 'active', 'paused', 'expiring')
  ) then
    raise exception 'membership_duplicate_active_or_pending' using errcode = '23505';
  end if;

  target_status := case
    when target_plan.activation_policy = 'on_approval' or target_application.calculated_total_cents = 0 then 'active'
    else 'pending_activation'
  end;
  covered_status := case when target_status = 'active' then 'active' else 'pending' end;
  expiry_on := case
    when coalesce((calculation->>'no_fixed_term')::boolean, false) then null
    else (target_application.requested_start_date + make_interval(months => (calculation->>'commitment_months')::integer) - interval '1 day')::date
  end;

  insert into public.club_membership_subscriptions (
    venue_id, application_id, owner_user_id, applicant_profile_id, payer_profile_id,
    plan_id, pricing_option_id, status, start_date, expiry_date, currency,
    accepted_total_cents, amount_due_cents, price_snapshot, activated_at,
    created_by_user_id, updated_by_user_id
  ) values (
    target_application.venue_id, target_application.id, target_application.owner_user_id,
    target_application.applicant_profile_id, target_application.payer_profile_id,
    target_application.plan_id, target_application.pricing_option_id, target_status,
    target_application.requested_start_date, expiry_on, target_application.currency,
    target_application.calculated_total_cents, target_application.calculated_total_cents,
    target_application.price_snapshot,
    case when target_status = 'active' then now() else null end,
    actor_user_id, actor_user_id
  ) returning id into new_subscription_id;

  for application_member in
    select * from public.club_membership_application_members
    where application_id = target_application.id
    order by sequence_number
  loop
    insert into public.club_memberships (
      venue_id, profile_id, status, joined_at, created_by_user_id, updated_by_user_id
    ) values (
      target_application.venue_id,
      application_member.profile_id,
      covered_status,
      case when covered_status = 'active' then now() else null end,
      actor_user_id,
      actor_user_id
    )
    on conflict (venue_id, profile_id) do update
    set status = case when public.club_memberships.status = 'active' then 'active' else excluded.status end,
        joined_at = case when public.club_memberships.status = 'active' then public.club_memberships.joined_at else excluded.joined_at end,
        deactivated_at = null,
        updated_by_user_id = actor_user_id
    returning id into new_club_membership_id;

    insert into public.club_membership_subscription_members (
      subscription_id, venue_id, profile_id, selected_plan_id, club_membership_id,
      member_role, status, base_amount_cents, adjustment_cents,
      joining_fee_cents, final_amount_cents
    ) values (
      new_subscription_id, target_application.venue_id, application_member.profile_id,
      application_member.selected_plan_id, new_club_membership_id,
      application_member.member_role, covered_status,
      application_member.base_amount_cents, application_member.adjustment_cents,
      application_member.joining_fee_cents, application_member.final_amount_cents
    );
  end loop;

  if target_application.calculated_total_cents > 0 then
    perform public.clubr_generate_membership_billing(new_subscription_id, actor_user_id);
  else
    update public.club_membership_subscriptions set amount_due_cents = 0 where id = new_subscription_id;
  end if;

  update public.club_membership_applications
  set status = 'approved', reviewed_by_user_id = actor_user_id, decided_at = now()
  where id = target_application.id;

  insert into public.club_membership_status_history (
    venue_id, application_id, previous_status, new_status, reason, changed_by_user_id
  ) values (
    target_application.venue_id, target_application.id, target_application.status, 'approved', 'Application approved', actor_user_id
  );
  insert into public.club_membership_status_history (
    venue_id, subscription_id, previous_status, new_status, reason, changed_by_user_id
  ) values (
    target_application.venue_id, new_subscription_id, null, target_status, 'Subscription created from approved application', actor_user_id
  );

  perform public.create_system_notification(
    target_application.owner_user_id,
    'membership_application_approved',
    'Membership application approved',
    case when target_status = 'active' then 'Your club membership is active.' else 'Your membership is approved and awaiting payment confirmation.' end,
    '/dashboard/memberships/' || new_subscription_id,
    actor_user_id,
    target_application.applicant_profile_id,
    null,
    jsonb_build_object('application_id', target_application.id, 'subscription_id', new_subscription_id),
    'membership-application-approved-' || target_application.id
  );

  return new_subscription_id;
end;
$$;

create or replace function public.clubr_decide_membership_application(
  p_application_id uuid,
  p_decision text,
  p_reason text,
  p_confirmed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.club_membership_applications;
  next_status text;
begin
  select * into target from public.club_membership_applications where id = p_application_id for update;
  next_status := case p_decision when 'decline' then 'declined' when 'request_correction' then 'correction_requested' else null end;

  if not p_confirmed
    or target.id is null
    or target.status <> 'pending_approval'
    or next_status is null
    or length(btrim(coalesce(p_reason, ''))) = 0
    or not public.clubr_membership_permission(target.venue_id, 'applications_review', actor_user_id) then
    raise exception 'membership_decision_access_or_state' using errcode = 'P0001';
  end if;

  update public.club_membership_applications
  set status = next_status,
      decline_reason = case when next_status = 'declined' then btrim(p_reason) else null end,
      correction_message = case when next_status = 'correction_requested' then btrim(p_reason) else null end,
      reviewed_by_user_id = actor_user_id,
      decided_at = now()
  where id = target.id;

  insert into public.club_membership_status_history (
    venue_id, application_id, previous_status, new_status, reason, changed_by_user_id
  ) values (target.venue_id, target.id, target.status, next_status, btrim(p_reason), actor_user_id);

  perform public.create_system_notification(
    target.owner_user_id,
    case when next_status = 'declined' then 'membership_application_declined' else 'membership_application_correction' end,
    case when next_status = 'declined' then 'Membership application declined' else 'Membership application needs an update' end,
    btrim(p_reason),
    '/dashboard/memberships/applications/' || target.id,
    actor_user_id,
    target.applicant_profile_id,
    null,
    jsonb_build_object('application_id', target.id),
    'membership-application-' || next_status || '-' || target.id
  );

  return next_status;
end;
$$;

create or replace function public.clubr_record_manual_membership_payment(
  p_subscription_id uuid,
  p_billing_schedule_id uuid,
  p_amount_cents integer,
  p_received_on date,
  p_payment_method text,
  p_reference text,
  p_note text,
  p_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_subscription public.club_membership_subscriptions;
  target_schedule public.club_membership_billing_schedules;
  new_payment_id uuid;
  new_paid integer;
  remaining_due integer;
begin
  select * into target_subscription from public.club_membership_subscriptions where id = p_subscription_id for update;
  select * into target_schedule
  from public.club_membership_billing_schedules
  where id = p_billing_schedule_id and subscription_id = p_subscription_id
  for update;

  if not p_confirmed
    or target_subscription.id is null
    or target_schedule.id is null
    or target_schedule.status not in ('scheduled')
    or p_amount_cents <= 0
    or p_amount_cents > target_schedule.amount_cents - target_schedule.paid_amount_cents
    or p_received_on is null
    or p_payment_method not in ('eft', 'cash', 'card_at_club', 'other')
    or length(btrim(coalesce(p_reference, ''))) = 0
    or not public.clubr_membership_permission(target_subscription.venue_id, 'payments_record', actor_user_id) then
    raise exception 'membership_manual_payment_invalid' using errcode = 'P0001';
  end if;

  insert into public.club_membership_manual_payments (
    venue_id, subscription_id, invoice_id, billing_schedule_id, payer_profile_id,
    amount_cents, currency, received_on, payment_method, payment_reference,
    note, recorded_by_user_id
  ) values (
    target_subscription.venue_id, target_subscription.id, target_schedule.invoice_id,
    target_schedule.id, target_subscription.payer_profile_id, p_amount_cents,
    target_subscription.currency, p_received_on, p_payment_method, btrim(p_reference),
    nullif(btrim(coalesce(p_note, '')), ''), actor_user_id
  ) returning id into new_payment_id;

  new_paid := target_schedule.paid_amount_cents + p_amount_cents;
  update public.club_membership_billing_schedules
  set paid_amount_cents = new_paid,
      status = case when new_paid = amount_cents then 'manually_paid' else status end
  where id = target_schedule.id;

  if target_schedule.invoice_id is not null then
    update public.club_membership_invoices
    set amount_due_cents = greatest(0, amount_due_cents - p_amount_cents),
        status = case when amount_due_cents - p_amount_cents <= 0 then 'manually_paid' else 'due' end
    where id = target_schedule.invoice_id;
  end if;

  update public.club_membership_subscriptions
  set amount_due_cents = greatest(0, amount_due_cents - p_amount_cents), updated_by_user_id = actor_user_id
  where id = target_subscription.id
  returning amount_due_cents into remaining_due;

  if remaining_due = 0 and target_subscription.status = 'pending_activation' then
    update public.club_membership_subscriptions
    set status = 'active', activated_at = now(), updated_by_user_id = actor_user_id
    where id = target_subscription.id;

    update public.club_membership_subscription_members
    set status = 'active'
    where subscription_id = target_subscription.id and status = 'pending';

    update public.club_memberships membership
    set status = 'active', joined_at = coalesce(joined_at, now()), deactivated_at = null, updated_by_user_id = actor_user_id
    from public.club_membership_subscription_members covered
    where covered.subscription_id = target_subscription.id
      and covered.club_membership_id = membership.id;

    insert into public.club_membership_status_history (
      venue_id, subscription_id, previous_status, new_status, reason, changed_by_user_id
    ) values (
      target_subscription.venue_id, target_subscription.id, 'pending_activation', 'active', 'Manual payment confirmation completed activation', actor_user_id
    );
  end if;

  perform public.create_system_notification(
    target_subscription.owner_user_id,
    'membership_manual_payment_recorded',
    'Manual payment recorded',
    'Your club recorded an offline payment. PlayR did not process this payment.',
    '/dashboard/memberships/' || target_subscription.id,
    actor_user_id,
    target_subscription.applicant_profile_id,
    null,
    jsonb_build_object('subscription_id', target_subscription.id, 'payment_id', new_payment_id, 'amount_cents', p_amount_cents),
    'membership-manual-payment-' || new_payment_id
  );

  return new_payment_id;
end;
$$;

create or replace function public.clubr_set_membership_subscription_status(
  p_subscription_id uuid,
  p_status text,
  p_reason text,
  p_confirmed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target public.club_membership_subscriptions;
  valid_transition boolean;
begin
  select * into target from public.club_membership_subscriptions where id = p_subscription_id for update;
  valid_transition := case target.status
    when 'active' then p_status in ('paused', 'expiring', 'expired', 'cancelled')
    when 'paused' then p_status in ('active', 'cancelled', 'expired')
    when 'expiring' then p_status in ('active', 'expired', 'cancelled')
    when 'pending_activation' then p_status = 'cancelled'
    else false
  end;

  if not p_confirmed
    or target.id is null
    or not valid_transition
    or (p_status in ('cancelled', 'paused') and length(btrim(coalesce(p_reason, ''))) = 0)
    or not public.clubr_membership_permission(target.venue_id, 'subscriptions_manage', actor_user_id) then
    raise exception 'membership_transition_invalid' using errcode = 'P0001';
  end if;

  update public.club_membership_subscriptions
  set status = p_status,
      activated_at = case when p_status = 'active' then coalesce(activated_at, now()) else activated_at end,
      paused_at = case when p_status = 'paused' then now() else paused_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancelled_by_user_id = case when p_status = 'cancelled' then actor_user_id else cancelled_by_user_id end,
      cancellation_reason = case when p_status = 'cancelled' then btrim(p_reason) else cancellation_reason end,
      updated_by_user_id = actor_user_id
  where id = target.id;

  update public.club_membership_subscription_members
  set status = case p_status
    when 'active' then 'active'
    when 'paused' then 'paused'
    when 'expired' then 'expired'
    when 'cancelled' then 'cancelled'
    else status
  end
  where subscription_id = target.id;

  if p_status in ('active', 'paused', 'expired', 'cancelled') then
    update public.club_memberships membership
    set status = case when p_status = 'active' then 'active' else 'inactive' end,
        joined_at = case when p_status = 'active' then coalesce(joined_at, now()) else joined_at end,
        deactivated_at = case when p_status = 'active' then null else now() end,
        updated_by_user_id = actor_user_id
    from public.club_membership_subscription_members covered
    where covered.subscription_id = target.id
      and covered.club_membership_id = membership.id;
  end if;

  if p_status in ('cancelled', 'expired') then
    update public.club_membership_billing_schedules
    set status = 'cancelled'
    where subscription_id = target.id and status = 'scheduled';
    update public.club_membership_invoices
    set status = 'cancelled', amount_due_cents = 0
    where subscription_id = target.id and status in ('draft', 'issued', 'due');
  end if;

  insert into public.club_membership_status_history (
    venue_id, subscription_id, previous_status, new_status, reason, changed_by_user_id
  ) values (target.venue_id, target.id, target.status, p_status, nullif(btrim(coalesce(p_reason, '')), ''), actor_user_id);

  return p_status;
end;
$$;

create or replace function public.clubr_set_membership_plan_status(
  p_plan_id uuid,
  p_status text,
  p_confirmed boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.club_membership_plans;
begin
  select * into target from public.club_membership_plans where id = p_plan_id for update;

  if not p_confirmed
    or target.id is null
    or p_status not in ('active', 'archived')
    or not public.clubr_membership_permission(target.venue_id, 'catalog_manage')
    or (p_status = 'active' and target.status <> 'draft')
    or (p_status = 'archived' and target.status <> 'active')
    or (p_status = 'active' and not exists (
      select 1 from public.club_membership_pricing_options pricing where pricing.plan_id = target.id and pricing.is_active
    )) then
    raise exception 'membership_plan_transition_invalid' using errcode = 'P0001';
  end if;

  update public.club_membership_plans
  set status = p_status,
      published_at = case when p_status = 'active' then now() else published_at end,
      archived_at = case when p_status = 'archived' then now() else null end,
      updated_by_user_id = (select auth.uid())
  where id = target.id;

  return p_status;
end;
$$;

create or replace function public.clubr_create_membership_plan_version(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.club_membership_plans;
  new_plan_id uuid;
  new_version integer;
begin
  select * into target from public.club_membership_plans where id = p_plan_id for update;
  if target.id is null
    or target.status not in ('active', 'archived')
    or not public.clubr_membership_permission(target.venue_id, 'catalog_manage') then
    raise exception 'membership_plan_version_access' using errcode = 'P0001';
  end if;

  select coalesce(max(plan.version), 0) + 1 into new_version
  from public.club_membership_plans plan
  where plan.venue_id = target.venue_id and plan.name = target.name;

  insert into public.club_membership_plans (
    venue_id, category_id, previous_version_id, version, name, description,
    base_price_cents, currency, joining_fee_cents, joining_fee_scope,
    duration_months, no_fixed_term, start_rule, maximum_covered_members,
    primary_member_required, adult_primary_required, most_expensive_primary,
    parent_may_purchase_for_juniors, payer_may_differ, approval_required,
    activation_policy, booking_entitlement, benefits_text, terms_text,
    status, is_legacy, created_by_user_id
  ) values (
    target.venue_id, target.category_id, target.id, new_version, target.name, target.description,
    target.base_price_cents, target.currency, target.joining_fee_cents, target.joining_fee_scope,
    target.duration_months, target.no_fixed_term, target.start_rule, target.maximum_covered_members,
    target.primary_member_required, target.adult_primary_required, target.most_expensive_primary,
    target.parent_may_purchase_for_juniors, target.payer_may_differ, target.approval_required,
    target.activation_policy, target.booking_entitlement, target.benefits_text, target.terms_text,
    'draft', false, (select auth.uid())
  ) returning id into new_plan_id;

  insert into public.club_membership_pricing_options (
    venue_id, plan_id, label, commitment_months, no_fixed_term, payment_frequency,
    discount_type, discount_value, displayed_price_cents, is_active, display_order, created_by_user_id
  )
  select venue_id, new_plan_id, label, commitment_months, no_fixed_term, payment_frequency,
    discount_type, discount_value, displayed_price_cents, is_active, display_order, (select auth.uid())
  from public.club_membership_pricing_options
  where plan_id = target.id;

  insert into public.club_membership_addon_rules (
    venue_id, primary_plan_id, addon_plan_id, member_class, maximum_addons,
    adjustment_type, adjustment_value, use_addon_plan_price, joining_fee_policy,
    is_active, display_order, created_by_user_id
  )
  select venue_id, new_plan_id, addon_plan_id, member_class, maximum_addons,
    adjustment_type, adjustment_value, use_addon_plan_price, joining_fee_policy,
    is_active, display_order, (select auth.uid())
  from public.club_membership_addon_rules
  where primary_plan_id = target.id;

  return new_plan_id;
end;
$$;

create or replace function public.clubr_member_activity(
  p_venue_id uuid,
  p_profile_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns table (
  activity_id uuid,
  activity_type text,
  activity_status text,
  start_time timestamptz,
  end_time timestamptz,
  title text,
  court_name text,
  source_label text,
  owner_label text,
  management_authority text,
  counts_toward_member_limit boolean,
  booking_id uuid,
  coach_session_occurrence_id uuid,
  coach_lesson_id uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_end_time <= p_start_time
    or not public.clubr_user_has_access(p_venue_id)
    or not exists (
      select 1 from public.club_memberships membership
      where membership.venue_id = p_venue_id and membership.profile_id = p_profile_id
    ) then
    raise exception 'membership_activity_access' using errcode = 'P0001';
  end if;

  return query
  select
    booking.id,
    'member_booking'::text,
    booking.status::text,
    booking.start_time,
    booking.end_time,
    'Member court booking'::text,
    court.name,
    'PlayR'::text,
    coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), 'Member'),
    'member'::text,
    true,
    booking.id,
    null::uuid,
    null::uuid
  from public.court_bookings booking
  join public.courts court on court.id = booking.court_id and court.venue_id = p_venue_id
  left join public.profiles profile on profile.id = booking.player_profile_id
  where booking.player_profile_id = p_profile_id
    and booking.booking_type = 'player_booking'
    and booking.start_time >= p_start_time
    and booking.start_time < p_end_time

  union all

  select
    occurrence.id,
    'coaching_session'::text,
    occurrence.status,
    occurrence.start_time,
    occurrence.end_time,
    session.name,
    court.name,
    'CoachR'::text,
    coalesce(academy.name, 'Academy'),
    'academy'::text,
    false,
    booking.id,
    occurrence.id,
    null::uuid
  from public.coach_session_occurrence_participants participant
  join public.coach_session_occurrences occurrence on occurrence.id = participant.occurrence_id
  join public.coach_sessions session on session.id = occurrence.session_id
  left join public.coach_session_occurrence_courts occurrence_court on occurrence_court.occurrence_id = occurrence.id
  left join public.court_bookings booking on booking.id = occurrence_court.court_booking_id
  left join public.courts court on court.id = occurrence_court.court_id
  left join public.venues academy on academy.id = session.venue_id
  where participant.player_profile_id = p_profile_id
    and participant.status = 'active'
    and court.venue_id = p_venue_id
    and occurrence.start_time >= p_start_time
    and occurrence.start_time < p_end_time

  union all

  select
    lesson.id,
    'coaching_lesson'::text,
    lesson.status::text,
    lesson.start_time,
    lesson.end_time,
    lesson.title,
    court.name,
    'CoachR'::text,
    coalesce(academy.name, 'Academy'),
    'academy'::text,
    false,
    lesson.court_booking_id,
    null::uuid,
    lesson.id
  from public.coach_lessons lesson
  join public.courts court on court.id = lesson.court_id and court.venue_id = p_venue_id
  left join public.venues academy on academy.id = lesson.venue_id
  where lesson.player_id = p_profile_id
    and lesson.start_time >= p_start_time
    and lesson.start_time < p_end_time
  order by 4;
end;
$$;

-- Preserve current pilot access with one clearly labelled commercial record per
-- existing club member. These records have no amount due and no forced wizard.
insert into public.club_membership_categories (
  venue_id, name, description, eligibility_class, status, display_order
)
select distinct membership.venue_id, 'Legacy Membership', 'Existing members migrated from the ClubR foundation.', 'any', 'active', 999
from public.club_memberships membership
on conflict (venue_id, name) do nothing;

insert into public.club_membership_plans (
  venue_id, category_id, version, name, description, base_price_cents, currency,
  joining_fee_cents, joining_fee_scope, duration_months, no_fixed_term,
  maximum_covered_members, primary_member_required, approval_required,
  activation_policy, status, is_legacy, published_at
)
select category.venue_id, category.id, 1, 'Legacy Club Membership',
  'Migrated membership. Commercial terms remain to be confirmed by the club.',
  0, 'ZAR', 0, 'none', null, true, 1, true, false, 'on_approval', 'active', true, now()
from public.club_membership_categories category
where category.name = 'Legacy Membership'
on conflict (venue_id, name, version) do nothing;

insert into public.club_membership_pricing_options (
  venue_id, plan_id, label, commitment_months, no_fixed_term, payment_frequency,
  discount_type, discount_value, displayed_price_cents, is_active, display_order
)
select plan.venue_id, plan.id, 'Legacy terms', null, true, 'once_off', 'none', 0, 0, true, 1
from public.club_membership_plans plan
where plan.is_legacy
on conflict (plan_id, label) do nothing;

insert into public.club_membership_subscriptions (
  venue_id, owner_user_id, applicant_profile_id, payer_profile_id, plan_id,
  pricing_option_id, status, start_date, expiry_date, currency,
  accepted_total_cents, amount_due_cents, price_snapshot, is_legacy, activated_at
)
select
  membership.venue_id,
  coalesce(profile.user_id, parent.user_id),
  profile.id,
  coalesce(parent.id, profile.id),
  plan.id,
  pricing.id,
  case membership.status when 'active' then 'active' when 'pending' then 'pending_activation' else 'expired' end,
  coalesce(membership.joined_at::date, membership.created_at::date),
  case when membership.status = 'inactive' then coalesce(membership.deactivated_at::date, current_date) else null end,
  plan.currency,
  0,
  0,
  jsonb_build_object(
    'calculation_version', 1,
    'calculated_at', now(),
    'venue_id', membership.venue_id,
    'plan_id', plan.id,
    'plan_name', plan.name,
    'plan_version', plan.version,
    'pricing_option_id', pricing.id,
    'pricing_option_label', pricing.label,
    'currency', plan.currency,
    'members', jsonb_build_array(jsonb_build_object(
      'profile_id', profile.id,
      'profile_name', concat_ws(' ', profile.first_name, profile.last_name),
      'member_role', 'primary',
      'selected_plan_id', plan.id,
      'plan_name', plan.name,
      'base_amount_cents', 0,
      'adjustment_cents', 0,
      'joining_fee_cents', 0,
      'final_amount_cents', 0
    )),
    'subtotal_cents', 0,
    'term_discount_cents', 0,
    'joining_fee_cents', 0,
    'total_cents', 0,
    'legacy', true
  ),
  true,
  case when membership.status = 'active' then coalesce(membership.joined_at, membership.created_at) else null end
from public.club_memberships membership
join public.profiles profile on profile.id = membership.profile_id
left join public.profiles parent on parent.id = profile.parent_profile_id
join public.club_membership_plans plan on plan.venue_id = membership.venue_id and plan.is_legacy
join public.club_membership_pricing_options pricing on pricing.plan_id = plan.id
where not exists (
  select 1
  from public.club_membership_subscription_members existing
  where existing.club_membership_id = membership.id
);

insert into public.club_membership_subscription_members (
  subscription_id, venue_id, profile_id, selected_plan_id, club_membership_id,
  member_role, status, base_amount_cents, adjustment_cents,
  joining_fee_cents, final_amount_cents
)
select
  subscription.id,
  membership.venue_id,
  membership.profile_id,
  subscription.plan_id,
  membership.id,
  'primary',
  case membership.status when 'active' then 'active' when 'pending' then 'pending' else 'expired' end,
  0, 0, 0, 0
from public.club_memberships membership
join public.club_membership_subscriptions subscription
  on subscription.venue_id = membership.venue_id
 and subscription.applicant_profile_id = membership.profile_id
 and subscription.is_legacy
where not exists (
  select 1
  from public.club_membership_subscription_members existing
  where existing.club_membership_id = membership.id
);

create or replace function public.playr_profile_can_book_court(
  p_profile_id uuid,
  p_court_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = (select auth.uid())
    and public.can_manage_profile(p_profile_id, p_user_id)
    and court.status = 'active'
    and case
      when membership.status = 'active' then
        coalesce(settings.member_booking_enabled, true)
        and (
          not exists (
            select 1
            from public.club_membership_subscription_members covered_any
            join public.club_membership_subscriptions subscription_any on subscription_any.id = covered_any.subscription_id
            where covered_any.club_membership_id = membership.id
          )
          or exists (
            select 1
            from public.club_membership_subscription_members covered
            join public.club_membership_subscriptions subscription on subscription.id = covered.subscription_id
            where covered.club_membership_id = membership.id
              and covered.status = 'active'
              and subscription.status in ('active', 'expiring')
              and subscription.start_date <= current_date
              and (subscription.expiry_date is null or subscription.expiry_date >= current_date)
          )
        )
      when membership.status in ('pending', 'inactive') then false
      when profile.member_status = 'member' then coalesce(settings.member_booking_enabled, true)
      else coalesce(settings.non_member_booking_enabled, false)
    end
  from public.courts court
  join public.profiles profile on profile.id = p_profile_id
  left join public.club_memberships membership
    on membership.venue_id = court.venue_id
   and membership.profile_id = p_profile_id
  left join public.organisation_booking_settings settings on settings.venue_id = court.venue_id
  where court.id = p_court_id;
$$;

alter table public.notifications drop constraint if exists notifications_type_valid;
alter table public.notifications add constraint notifications_type_valid check (
  type in (
    'match_invite_received', 'match_invite_accepted', 'match_invite_declined', 'match_invite_reminder',
    'court_booking_confirmed', 'upcoming_booking_reminder', 'event_entry_confirmed', 'event_reminder',
    'rating_updated', 'badge_unlocked', 'leaderboard_changed', 'membership_renewal',
    'shop_reservation_update', 'coach_invitation', 'player_link_invitation',
    'parent_approval_required', 'invitation_accepted', 'invitation_declined',
    'lesson_created', 'lesson_updated', 'lesson_cancelled', 'lesson_move_requested',
    'lesson_time_requested', 'lesson_move_declined', 'lesson_time_confirmed', 'new_message',
    'membership_application_submitted', 'membership_application_approved',
    'membership_application_declined', 'membership_application_correction',
    'membership_activated', 'membership_expiring', 'membership_expired',
    'membership_manual_payment_recorded'
  )
);

alter table public.club_membership_categories enable row level security;
alter table public.club_membership_plans enable row level security;
alter table public.club_membership_pricing_options enable row level security;
alter table public.club_membership_addon_rules enable row level security;
alter table public.club_membership_staff_permissions enable row level security;
alter table public.club_membership_applications enable row level security;
alter table public.club_membership_application_members enable row level security;
alter table public.club_membership_subscriptions enable row level security;
alter table public.club_membership_subscription_members enable row level security;
alter table public.club_membership_invoices enable row level security;
alter table public.club_membership_billing_schedules enable row level security;
alter table public.club_membership_manual_payments enable row level security;
alter table public.club_membership_status_history enable row level security;

create policy "Permitted users can read membership categories"
on public.club_membership_categories for select to authenticated
using (public.playr_user_can_browse_club_memberships(venue_id));
create policy "Catalog managers can create membership categories"
on public.club_membership_categories for insert to authenticated
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can update membership categories"
on public.club_membership_categories for update to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'))
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));

create policy "Permitted users can read membership plans"
on public.club_membership_plans for select to authenticated
using (public.playr_user_can_browse_club_memberships(venue_id));
create policy "Catalog managers can create membership plans"
on public.club_membership_plans for insert to authenticated
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can update membership plans"
on public.club_membership_plans for update to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'))
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));

create policy "Permitted users can read membership pricing options"
on public.club_membership_pricing_options for select to authenticated
using (public.playr_user_can_browse_club_memberships(venue_id));
create policy "Catalog managers can create membership pricing options"
on public.club_membership_pricing_options for insert to authenticated
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can update membership pricing options"
on public.club_membership_pricing_options for update to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'))
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can delete membership pricing options"
on public.club_membership_pricing_options for delete to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'));

create policy "Permitted users can read membership add-on rules"
on public.club_membership_addon_rules for select to authenticated
using (public.playr_user_can_browse_club_memberships(venue_id));
create policy "Catalog managers can create membership add-on rules"
on public.club_membership_addon_rules for insert to authenticated
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can update membership add-on rules"
on public.club_membership_addon_rules for update to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'))
with check (public.clubr_membership_permission(venue_id, 'catalog_manage'));
create policy "Catalog managers can delete membership add-on rules"
on public.club_membership_addon_rules for delete to authenticated
using (public.clubr_membership_permission(venue_id, 'catalog_manage'));

create policy "Membership settings managers can read staff grants"
on public.club_membership_staff_permissions for select to authenticated
using (public.clubr_user_can_manage_settings(venue_id) or user_id = (select auth.uid()));
create policy "Membership settings managers can create staff grants"
on public.club_membership_staff_permissions for insert to authenticated
with check (public.clubr_user_can_manage_settings(venue_id) and assigned_by_user_id = (select auth.uid()));
create policy "Membership settings managers can update staff grants"
on public.club_membership_staff_permissions for update to authenticated
using (public.clubr_user_can_manage_settings(venue_id))
with check (public.clubr_user_can_manage_settings(venue_id));
create policy "Membership settings managers can delete staff grants"
on public.club_membership_staff_permissions for delete to authenticated
using (public.clubr_user_can_manage_settings(venue_id));

create policy "Owners and authorised staff can read membership applications"
on public.club_membership_applications for select to authenticated
using (public.clubr_can_view_membership_application(id));
create policy "Owners and authorised staff can read application members"
on public.club_membership_application_members for select to authenticated
using (public.clubr_can_view_membership_application(application_id));

create policy "Owners and authorised staff can read membership subscriptions"
on public.club_membership_subscriptions for select to authenticated
using (public.clubr_can_view_membership_subscription(id));
create policy "Owners and authorised staff can read covered members"
on public.club_membership_subscription_members for select to authenticated
using (public.clubr_can_view_membership_subscription(subscription_id));
create policy "Owners and authorised staff can read membership invoices"
on public.club_membership_invoices for select to authenticated
using (public.clubr_can_view_membership_subscription(subscription_id));
create policy "Owners and authorised staff can read billing schedules"
on public.club_membership_billing_schedules for select to authenticated
using (public.clubr_can_view_membership_subscription(subscription_id));
create policy "Owners and authorised staff can read manual payment records"
on public.club_membership_manual_payments for select to authenticated
using (public.clubr_can_view_membership_subscription(subscription_id));
create policy "Authorised users can read membership status history"
on public.club_membership_status_history for select to authenticated
using (
  (application_id is not null and public.clubr_can_view_membership_application(application_id))
  or (subscription_id is not null and public.clubr_can_view_membership_subscription(subscription_id))
);

grant select, insert, update on public.club_membership_categories to authenticated;
grant select, insert, update on public.club_membership_plans to authenticated;
grant select, insert, update, delete on public.club_membership_pricing_options to authenticated;
grant select, insert, update, delete on public.club_membership_addon_rules to authenticated;
grant select, insert, update, delete on public.club_membership_staff_permissions to authenticated;
grant select on public.club_membership_applications to authenticated;
grant select on public.club_membership_application_members to authenticated;
grant select on public.club_membership_subscriptions to authenticated;
grant select on public.club_membership_subscription_members to authenticated;
grant select on public.club_membership_invoices to authenticated;
grant select on public.club_membership_billing_schedules to authenticated;
grant select on public.club_membership_manual_payments to authenticated;
grant select on public.club_membership_status_history to authenticated;

revoke all on function public.clubr_membership_permission(uuid, text, uuid) from public;
revoke all on function public.clubr_can_view_membership_application(uuid, uuid) from public;
revoke all on function public.clubr_can_view_membership_subscription(uuid, uuid) from public;
revoke all on function public.clubr_membership_profile_eligibility(uuid, uuid) from public;
revoke all on function public.clubr_calculate_membership_price(uuid, uuid, jsonb, date, uuid) from public;
revoke all on function public.clubr_submit_membership_application(uuid, uuid, uuid, uuid, jsonb, date, boolean, text) from public;
revoke all on function public.clubr_generate_membership_billing(uuid, uuid) from public;
revoke all on function public.clubr_approve_membership_application(uuid, boolean) from public;
revoke all on function public.clubr_decide_membership_application(uuid, text, text, boolean) from public;
revoke all on function public.clubr_record_manual_membership_payment(uuid, uuid, integer, date, text, text, text, boolean) from public;
revoke all on function public.clubr_set_membership_subscription_status(uuid, text, text, boolean) from public;
revoke all on function public.clubr_set_membership_plan_status(uuid, text, boolean) from public;
revoke all on function public.clubr_create_membership_plan_version(uuid) from public;
revoke all on function public.clubr_member_activity(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.playr_user_can_browse_club_memberships(uuid, uuid) from public;
revoke all on function public.playr_profile_can_book_court(uuid, uuid, uuid) from public;

grant execute on function public.clubr_membership_permission(uuid, text, uuid) to authenticated;
grant execute on function public.clubr_can_view_membership_application(uuid, uuid) to authenticated;
grant execute on function public.clubr_can_view_membership_subscription(uuid, uuid) to authenticated;
grant execute on function public.clubr_membership_profile_eligibility(uuid, uuid) to authenticated;
grant execute on function public.clubr_calculate_membership_price(uuid, uuid, jsonb, date, uuid) to authenticated;
grant execute on function public.clubr_submit_membership_application(uuid, uuid, uuid, uuid, jsonb, date, boolean, text) to authenticated;
grant execute on function public.clubr_generate_membership_billing(uuid, uuid) to authenticated;
grant execute on function public.clubr_approve_membership_application(uuid, boolean) to authenticated;
grant execute on function public.clubr_decide_membership_application(uuid, text, text, boolean) to authenticated;
grant execute on function public.clubr_record_manual_membership_payment(uuid, uuid, integer, date, text, text, text, boolean) to authenticated;
grant execute on function public.clubr_set_membership_subscription_status(uuid, text, text, boolean) to authenticated;
grant execute on function public.clubr_set_membership_plan_status(uuid, text, boolean) to authenticated;
grant execute on function public.clubr_create_membership_plan_version(uuid) to authenticated;
grant execute on function public.clubr_member_activity(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.playr_user_can_browse_club_memberships(uuid, uuid) to authenticated;
grant execute on function public.playr_profile_can_book_court(uuid, uuid, uuid) to authenticated;
