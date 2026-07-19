"use client";

import { useState } from "react";
import { ArrowRightIcon, BookingIcon, CostIcon, EntriesIcon, MembershipIcon, StatusIcon } from "@/components/playr-icons";
import { createMembershipPlan } from "@/app/dashboard/clubr/memberships/actions";
import type { ClubMembershipCategory } from "@/types/courtside";

const steps = [
  { label: "Identity", icon: MembershipIcon },
  { label: "Eligibility", icon: EntriesIcon },
  { label: "Pricing", icon: CostIcon },
  { label: "Family", icon: EntriesIcon },
  { label: "Payment", icon: CostIcon },
  { label: "Access", icon: BookingIcon },
  { label: "Review", icon: StatusIcon }
];

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-court-ink focus:border-court-teal focus:outline-none focus:ring-2 focus:ring-court-teal/20";
const labelClass = "block text-sm font-black text-court-navy";

export function MembershipPlanBuilder({ categories, venueId }: { categories: ClubMembershipCategory[]; venueId: string }) {
  const [step, setStep] = useState(0);
  const ActiveIcon = steps[step].icon;

  return (
    <form action={createMembershipPlan} className="surface-card overflow-hidden">
      <input name="venueId" type="hidden" value={venueId} />
      <div className="border-b border-slate-200 bg-court-mist p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="section-kicker">Step {step + 1} of {steps.length}</p><h2 className="mt-1 flex items-center gap-2 text-xl font-black text-court-navy"><ActiveIcon size={19} /> {steps[step].label}</h2></div>
          <span className="ui-chip ui-chip-brand">Draft</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1" aria-hidden="true">{steps.map((item, index) => <span className={`h-1.5 rounded ${index <= step ? "bg-court-teal" : "bg-slate-200"}`} key={item.label} />)}</div>
      </div>

      <div className="p-4 sm:p-6">
        <section className={step === 0 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">What is this membership called?</h3><p className="mt-1 text-sm text-slate-600">Members will see this name when choosing a plan.</p></div>
          <label className={labelClass}>Plan name<input className={fieldClass} name="name" placeholder="Standard Membership" required /></label>
          <label className={labelClass}>Description<textarea className={fieldClass} name="description" placeholder="A short summary of who this plan is for." rows={3} /></label>
          <label className={labelClass}>Category<select className={fieldClass} name="categoryId" required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <input name="currency" type="hidden" value="ZAR" />
        </section>

        <section className={step === 1 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">Who can be the primary member?</h3><p className="mt-1 text-sm text-slate-600">The category controls adult, junior and age eligibility.</p></div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm font-bold text-court-navy"><input className="mt-1" name="adultPrimaryRequired" type="checkbox" /><span>Require a responsible adult as the primary member</span></label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm font-bold text-court-navy"><input className="mt-1" defaultChecked name="payerMayDiffer" type="checkbox" /><span>Allow the payer to differ from covered members</span></label>
          <label className={labelClass}>Start rule<select className={fieldClass} name="startRule"><option value="immediate">Start immediately or selected date</option><option value="selected_date">Require a selected start date</option></select></label>
        </section>

        <section className={step === 2 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">What is the normal plan price?</h3><p className="mt-1 text-sm text-slate-600">Enter the full normal price before household or term discounts.</p></div>
          <label className={labelClass}>Base price (R)<input className={fieldClass} min="0" name="basePrice" required step="0.01" type="number" /></label>
          <label className={labelClass}>Joining fee (R)<input className={fieldClass} defaultValue="0" min="0" name="joiningFee" step="0.01" type="number" /></label>
          <label className={labelClass}>Joining fee applies<select className={fieldClass} name="joiningFeeScope"><option value="none">No joining fee</option><option value="subscription">Once per subscription</option><option value="covered_member">Per covered member</option></select></label>
        </section>

        <section className={step === 3 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">How many people can this plan cover?</h3><p className="mt-1 text-sm text-slate-600">Add-on plan rules can be configured after the draft is created.</p></div>
          <label className={labelClass}>Maximum covered members<input className={fieldClass} defaultValue="1" max="30" min="1" name="maximumCoveredMembers" type="number" /></label>
          <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4 text-sm font-semibold leading-6 text-court-navy">The primary plan price stays separate from each adult or junior add-on’s normal price. Discounts are applied to the add-on plan, not assumed from the primary adult price.</div>
        </section>

        <section className={step === 4 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">What payment option is offered first?</h3><p className="mt-1 text-sm text-slate-600">More options can be added to the draft later.</p></div>
          <label className={labelClass}>Option label<input className={fieldClass} defaultValue="Standard" name="pricingLabel" required /></label>
          <label className={labelClass}>Commitment<select className={fieldClass} name="durationMode"><option value="fixed">Fixed term</option><option value="open">No fixed term</option></select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Plan duration (months)<input className={fieldClass} defaultValue="12" max="120" min="1" name="durationMonths" type="number" /></label><label className={labelClass}>Commitment (months)<input className={fieldClass} defaultValue="12" max="120" min="1" name="commitmentMonths" type="number" /></label></div>
          <label className={labelClass}>Payment frequency<select className={fieldClass} name="paymentFrequency"><option value="once_off">Once upfront</option><option value="monthly">Monthly</option><option value="every_3_months">Every 3 months</option><option value="every_6_months">Every 6 months</option><option value="annually">Annually</option></select></label>
          <label className={labelClass}>Displayed option price (R)<input className={fieldClass} min="0" name="displayedPrice" step="0.01" type="number" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Discount<select className={fieldClass} name="discountType"><option value="none">No discount</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label className={labelClass}>Discount value<input className={fieldClass} defaultValue="0" min="0" name="discountValue" step="0.01" type="number" /></label></div>
        </section>

        <section className={step === 5 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">When does access become active?</h3><p className="mt-1 text-sm text-slate-600">This controls booking access after the application is approved.</p></div>
          <label className={labelClass}>Activation policy<select className={fieldClass} name="activationPolicy"><option value="after_manual_payment">After payment confirmation</option><option value="on_approval">Immediately on approval</option></select></label>
          <label className={labelClass}>Booking entitlement reference<input className={fieldClass} defaultValue="club_default" name="bookingEntitlement" /></label>
          <label className={labelClass}>Benefits<textarea className={fieldClass} name="benefits" placeholder="Benefits depend on your club setup." rows={3} /></label>
          <label className={labelClass}>Terms<textarea className={fieldClass} name="terms" placeholder="Membership terms shown before application submission." rows={3} /></label>
        </section>

        <section className={step === 6 ? "grid gap-4" : "hidden"}>
          <div><h3 className="text-lg font-black text-court-navy">Ready to create the draft?</h3><p className="mt-1 text-sm text-slate-600">Review and publish from the plan detail screen after adding any household rules or extra payment options.</p></div>
          <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4"><p className="font-black text-court-navy">Draft only</p><p className="mt-1 text-sm leading-6 text-slate-600">Members cannot select this plan until you publish it. Existing membership terms are never overwritten.</p></div>
        </section>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button">Back</button>
          {step < steps.length - 1 ? <button className="btn-primary" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} type="button">Continue <ArrowRightIcon size={16} /></button> : <button className="btn-primary" type="submit">Create Draft</button>}
        </div>
      </div>
    </form>
  );
}
