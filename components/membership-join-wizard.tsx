"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, CostIcon, EntriesIcon, MembershipIcon, StatusIcon } from "@/components/playr-icons";
import { MembershipPriceBreakdown } from "@/components/membership-ui";
import { previewMembershipPrice, submitMembershipApplication } from "@/app/dashboard/clubr/memberships/actions";
import { formatMembershipMoney, membershipTermLabel, type MembershipPlanView } from "@/lib/club-memberships";
import type { ClubMembershipPriceSnapshot, Profile, Venue } from "@/types/courtside";

type JoinProfile = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "date_of_birth">;

const steps = ["Who is joining?", "Choose membership", "Household members", "Choose payment", "Review price", "Accept terms"];

function todayInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export function MembershipJoinWizard({ initialPlanId, initialProfileId, plans, profiles, venue }: { initialPlanId?: string; initialProfileId?: string; plans: MembershipPlanView[]; profiles: JoinProfile[]; venue: Pick<Venue, "id" | "name"> }) {
  const [step, setStep] = useState(0);
  const initialProfile = profiles.find((profile) => profile.id === initialProfileId) ?? profiles[0];
  const initialPlan = plans.find((plan) => plan.id === initialPlanId) ?? plans[0];
  const [selectedIds, setSelectedIds] = useState<string[]>(initialProfile ? [initialProfile.id] : []);
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [pricingOptionId, setPricingOptionId] = useState(initialPlan?.pricingOptions.find((item) => item.is_active)?.id ?? "");
  const [startDate, setStartDate] = useState(todayInput());
  const [snapshot, setSnapshot] = useState<ClubMembershipPriceSnapshot | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;
  const selectedOption = selectedPlan?.pricingOptions.find((option) => option.id === pricingOptionId) ?? null;

  const members = useMemo(() => {
    if (!selectedPlan) return [];
    const selectedProfiles = selectedIds.flatMap((profileId) => {
      const profile = profiles.find((item) => item.id === profileId);
      return profile ? [profile] : [];
    });
    const primaryIndex = selectedPlan.adult_primary_required
      ? Math.max(0, selectedProfiles.findIndex((profile) => !profile.is_junior))
      : 0;
    const orderedProfiles = primaryIndex > 0
      ? [selectedProfiles[primaryIndex], ...selectedProfiles.filter((_, index) => index !== primaryIndex)]
      : selectedProfiles;

    return orderedProfiles.map((profile, index) => {
      if (index === 0) return { member_role: "primary", profile_id: profile.id, selected_plan_id: selectedPlan.id };
      const matchingRule = selectedPlan.addonRules.find((rule) => rule.is_active && (rule.member_class === "any" || rule.member_class === (profile.is_junior ? "junior" : "adult")));
      return {
        member_role: profile.is_junior ? "junior_addon" : "adult_addon",
        profile_id: profile.id,
        selected_plan_id: matchingRule?.addon_plan_id ?? selectedPlan.id
      };
    });
  }, [profiles, selectedIds, selectedPlan]);

  useEffect(() => {
    if (step !== 4 || !selectedPlan || !selectedOption || members.length === 0) return;
    let current = true;
    setPreviewing(true);
    setPreviewError(null);
    previewMembershipPrice({ members, planId: selectedPlan.id, pricingOptionId: selectedOption.id, startDate }).then((result) => {
      if (!current) return;
      setSnapshot(result.snapshot);
      setPreviewError(result.error);
      setPreviewing(false);
    });
    return () => { current = false; };
  }, [members, selectedOption, selectedPlan, startDate, step]);

  const toggleProfile = (profileId: string) => {
    setSelectedIds((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]);
    setSnapshot(null);
  };
  const canContinue = step === 0 ? selectedIds.length > 0 : step === 1 ? Boolean(selectedPlan) : step === 3 ? Boolean(selectedOption) : step === 4 ? Boolean(snapshot) : true;
  const applicantProfileId = members[0]?.profile_id ?? selectedIds[0] ?? "";

  return (
    <form action={submitMembershipApplication} className="surface-card overflow-hidden">
      <input name="venueId" type="hidden" value={venue.id} />
      <input name="planId" type="hidden" value={planId} />
      <input name="pricingOptionId" type="hidden" value={pricingOptionId} />
      <input name="applicantProfileId" type="hidden" value={applicantProfileId} />
      <input name="payerProfileId" type="hidden" value={profiles.find((profile) => !profile.is_junior)?.id ?? applicantProfileId} />
      <input name="members" type="hidden" value={JSON.stringify(members)} />
      <input name="startDate" type="hidden" value={startDate} />

      <div className="border-b border-slate-200 bg-court-navy p-4 text-white sm:p-5">
        <p className="text-xs font-black uppercase text-court-lime">{venue.name} · Step {step + 1} of {steps.length}</p>
        <h2 className="mt-1 text-xl font-black">{steps[step]}</h2>
        <div className="mt-4 grid grid-cols-6 gap-1">{steps.map((item, index) => <span aria-label={item} className={`h-1.5 rounded ${index <= step ? "bg-court-lime" : "bg-white/20"}`} key={item} />)}</div>
      </div>

      <div className="p-4 sm:p-6">
        <section className={step === 0 ? "grid gap-3" : "hidden"}>
          <p className="text-sm text-slate-600">Select only profiles linked to your PlayR account.</p>
          {profiles.map((profile) => (
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${selectedIds.includes(profile.id) ? "border-court-teal bg-court-mist" : "border-slate-200 bg-white"}`} key={profile.id}>
              <input checked={selectedIds.includes(profile.id)} onChange={() => toggleProfile(profile.id)} type="checkbox" />
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-court-navy font-black text-white">{profile.first_name[0]}{profile.last_name[0]}</span>
              <span className="min-w-0"><span className="block truncate font-black text-court-navy">{profile.first_name} {profile.last_name}</span><span className="text-xs font-semibold text-slate-500">{profile.is_junior ? "Junior" : "Adult"}</span></span>
            </label>
          ))}
        </section>

        <section className={step === 1 ? "grid gap-3" : "hidden"}>
          {plans.map((plan) => (
            <button className={`rounded-lg border p-4 text-left ${planId === plan.id ? "border-court-teal bg-court-mist ring-2 ring-court-teal/15" : "border-slate-200 bg-white"}`} key={plan.id} onClick={() => { setPlanId(plan.id); setPricingOptionId(plan.pricingOptions.find((item) => item.is_active)?.id ?? ""); setSnapshot(null); }} type="button">
              <span className="flex items-start justify-between gap-3"><span><span className="section-kicker">{plan.category?.name ?? "Membership"}</span><span className="mt-1 block text-lg font-black text-court-navy">{plan.name}</span></span><MembershipIcon className="text-court-teal" size={20} /></span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">{plan.description ?? "Membership details provided by the club."}</span>
              <span className="mt-3 block font-black text-court-navy">From {formatMembershipMoney(plan.base_price_cents, plan.currency)}</span>
            </button>
          ))}
        </section>

        <section className={step === 2 ? "grid gap-3" : "hidden"}>
          <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4">
            <p className="font-black text-court-navy">{members.length} covered member{members.length === 1 ? "" : "s"}</p>
            <p className="mt-1 text-sm text-slate-600">The primary adult owns subscriptions containing juniors.</p>
          </div>
          {members.map((member, index) => {
            const profile = profiles.find((item) => item.id === member.profile_id);
            const memberPlan = plans.find((item) => item.id === member.selected_plan_id);
            return <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3" key={member.profile_id}><div><p className="font-black text-court-navy">{profile?.first_name} {profile?.last_name}</p><p className="text-xs font-semibold text-slate-500">{index === 0 ? "Primary member" : profile?.is_junior ? "Junior add-on" : "Adult add-on"}</p></div><span className="ui-chip ui-chip-brand">{memberPlan?.name ?? selectedPlan?.name}</span></div>;
          })}
          {members.length > 1 && selectedPlan?.addonRules.length === 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">This plan has no household add-on rules. Choose one member or ask the club to configure family options.</p> : null}
        </section>

        <section className={step === 3 ? "grid gap-3" : "hidden"}>
          {selectedPlan?.pricingOptions.filter((option) => option.is_active).map((option) => (
            <button className={`rounded-lg border p-4 text-left ${pricingOptionId === option.id ? "border-court-teal bg-court-mist" : "border-slate-200 bg-white"}`} key={option.id} onClick={() => { setPricingOptionId(option.id); setSnapshot(null); }} type="button">
              <span className="flex items-start justify-between gap-3"><span className="font-black text-court-navy">{option.label}</span><CostIcon className="text-court-teal" size={18} /></span>
              <span className="mt-2 block text-sm font-semibold text-slate-600">{membershipTermLabel(option)}</span>
              {option.displayed_price_cents !== null ? <span className="mt-2 block font-black text-court-navy">{formatMembershipMoney(option.displayed_price_cents, selectedPlan.currency)}</span> : null}
            </button>
          ))}
          <label className="mt-2 block text-sm font-black text-court-navy">Requested start date<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" min={todayInput()} onChange={(event) => { setStartDate(event.target.value); setSnapshot(null); }} type="date" value={startDate} /></label>
        </section>

        <section className={step === 4 ? "grid gap-4" : "hidden"}>
          {previewing ? <div className="ui-empty-card">Verifying your membership price...</div> : null}
          {previewError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{previewError}</div> : null}
          {snapshot ? <MembershipPriceBreakdown snapshot={snapshot} /> : null}
          {selectedOption ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-black text-court-navy">{selectedOption.label}</p><p className="mt-1 text-slate-600">{membershipTermLabel(selectedOption)}</p></div> : null}
        </section>

        <section className={step === 5 ? "grid gap-4" : "hidden"}>
          <div className="rounded-lg border border-court-teal/25 bg-court-mist p-4"><p className="flex items-center gap-2 font-black text-court-navy"><StatusIcon size={17} /> Application only</p><p className="mt-2 text-sm leading-6 text-slate-600">Submitting does not activate membership or process a payment. The club must review the application.</p></div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm font-bold text-court-navy"><input className="mt-1" name="termsAccepted" required type="checkbox" /><span>I accept the club membership terms and confirm the selected profiles.</span></label>
          <label className="block text-sm font-black text-court-navy">Note to the club<textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" name="notes" placeholder="Optional" rows={3} /></label>
        </section>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <button className="btn-secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} type="button">Back</button>
          {step < steps.length - 1 ? <button className="btn-primary" disabled={!canContinue || (step === 2 && members.length > 1 && selectedPlan?.addonRules.length === 0)} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} type="button">Continue <ArrowRightIcon size={16} /></button> : <button className="btn-primary" disabled={!snapshot} type="submit">Submit Application</button>}
        </div>
      </div>
    </form>
  );
}
