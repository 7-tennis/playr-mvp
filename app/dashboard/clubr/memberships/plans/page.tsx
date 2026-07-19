import Link from "next/link";
import { CostIcon, MembershipIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { hasClubRMembershipCapability } from "@/lib/clubr";
import { formatMembershipMoney, loadMembershipCategories, loadMembershipPlans, membershipStatusChip, membershipStatusLabel } from "@/lib/club-memberships";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";
import { saveMembershipCategory } from "../actions";

export const dynamic = "force-dynamic";

export default async function MembershipPlansPage({ searchParams }: { searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:memberships");
  if (content) return content;
  if (!context) return null;
  if (!venue) return <ClubRPageFrame context={context} subtitle="Choose a club to see its catalogue." title="Plans & Pricing" venue={venue}><div className="ui-empty-card">Select a ClubR organisation to continue.</div></ClubRPageFrame>;
  const [plans, categoriesResult, canManage] = await Promise.all([loadMembershipPlans(context.supabase, venue.id, true), loadMembershipCategories(context.supabase, venue.id), hasClubRMembershipCapability(context, "catalog_manage", venue.id)]);
  const categories = categoriesResult.data.filter((category) => category.name !== "Legacy Membership");

  return (
    <ClubRPageFrame context={context} subtitle="Which memberships can people choose?" title="Plans & Pricing" venue={venue}>
      <StatusAlert className="mb-4" message={searchParams?.message ? "Membership catalogue updated." : null} tone="success" />
      <StatusAlert className="mb-4" message={searchParams?.error ? "The catalogue change could not be saved." : null} tone="error" />
      {plans.error ? <div className="mb-4"><ClubRDataErrorCard error={plans.error} title="Plans could not be loaded" /></div> : null}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">Catalogue</p><h2 className="section-title mt-1">Membership plans</h2></div>{canManage ? <Link className="btn-primary" href="/dashboard/clubr/memberships/plans/new">Create Plan</Link> : null}</div>
      {plans.data.filter((plan) => !plan.is_legacy).length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data.filter((plan) => !plan.is_legacy).map((plan) => (
            <Link className="group block rounded-lg focus-ring" href={`/dashboard/clubr/memberships/plans/${plan.id}`} key={plan.id}>
              <article className="surface-card overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-court"><div className="h-1.5 bg-court-teal" /><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="section-kicker">{plan.category?.name ?? "Membership"} · Version {plan.version}</p><h3 className="mt-1 text-lg font-black text-court-navy">{plan.name}</h3></div><span className={`ui-chip ${membershipStatusChip(plan.status)}`}>{membershipStatusLabel(plan.status)}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{plan.description ?? "No plan description yet."}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Base price</p><p className="mt-1 font-black text-court-navy">{formatMembershipMoney(plan.base_price_cents, plan.currency)}</p></div><div className="rounded bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Payment options</p><p className="mt-1 font-black text-court-navy">{plan.pricingOptions.filter((item) => item.is_active).length}</p></div></div></div></article>
            </Link>
          ))}
        </div>
      ) : <div className="ui-empty-card">No membership plans yet. Create the club’s first membership plan.</div>}

      {canManage ? <details className="ui-collapsible surface-card mt-5 p-4"><summary className="flex cursor-pointer items-center justify-between gap-3 font-black text-court-navy"><span className="flex items-center gap-2"><MembershipIcon size={18} /> Membership Categories</span><span className="ui-chip ui-chip-muted">{categories.length}</span></summary><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]"><div className="grid gap-2">{categories.map((category) => <div className="rounded-lg border border-slate-200 p-3" key={category.id}><div className="flex items-start justify-between gap-2"><div><p className="font-black text-court-navy">{category.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{membershipStatusLabel(category.eligibility_class)}{category.minimum_age !== null || category.maximum_age !== null ? ` · Ages ${category.minimum_age ?? 0}-${category.maximum_age ?? "+"}` : ""}</p></div><span className={`ui-chip ${membershipStatusChip(category.status)}`}>{membershipStatusLabel(category.status)}</span></div></div>)}</div><form action={saveMembershipCategory} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><input name="venueId" type="hidden" value={venue.id} /><p className="flex items-center gap-2 font-black text-court-navy"><CostIcon size={17} /> New category</p><div className="mt-3 grid gap-3"><input className="rounded-lg border border-slate-300 px-3 py-2" name="name" placeholder="Adult Membership" required /><textarea className="rounded-lg border border-slate-300 px-3 py-2" name="description" placeholder="Short description" rows={2} /><select className="rounded-lg border border-slate-300 px-3 py-2" name="eligibilityClass"><option value="any">Adults and juniors</option><option value="adult">Adults only</option><option value="junior">Juniors only</option></select><div className="grid grid-cols-2 gap-2"><input className="rounded-lg border border-slate-300 px-3 py-2" min="0" name="minimumAge" placeholder="Min age" type="number" /><input className="rounded-lg border border-slate-300 px-3 py-2" max="120" name="maximumAge" placeholder="Max age" type="number" /></div><button className="btn-primary" type="submit">Add Category</button></div></form></div></details> : null}
    </ClubRPageFrame>
  );
}
