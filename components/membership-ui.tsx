import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, CostIcon, EntriesIcon, MembershipIcon, StatusIcon } from "@/components/playr-icons";
import {
  formatMembershipMoney,
  membershipStatusChip,
  membershipStatusLabel,
  priceSnapshotLines,
  type MembershipApplicationView,
  type MembershipSubscriptionView
} from "@/lib/club-memberships";
import { formatDate } from "@/lib/courtside-format";
import type { ClubMembershipPriceSnapshot } from "@/types/courtside";

export function MembershipStatusChip({ status }: { status: string }) {
  return <span className={`ui-chip ${membershipStatusChip(status)}`}>{membershipStatusLabel(status)}</span>;
}

export function MembershipMetric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">{icon}{label}</p>
      <div className="mt-2 font-black text-court-navy">{value}</div>
    </div>
  );
}

export function MembershipPriceBreakdown({ snapshot, compact = false }: { snapshot: ClubMembershipPriceSnapshot; compact?: boolean }) {
  const lines = priceSnapshotLines(snapshot);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="section-kicker">Accepted calculation</p><h3 className="mt-1 font-black text-court-navy">Price breakdown</h3></div>
        <CostIcon className="text-court-teal" size={19} />
      </div>
      <div className="mt-4 divide-y divide-slate-200">
        {lines.map((line, index) => (
          <div className="flex items-start justify-between gap-4 py-3 first:pt-0" key={`${line.label}-${index}`}>
            <div className="min-w-0"><p className="font-bold text-court-ink">{line.label}</p>{!compact && line.note ? <p className="mt-1 text-xs text-slate-500">{line.note}</p> : null}</div>
            <p className={`shrink-0 font-black ${line.amountCents < 0 ? "text-emerald-700" : "text-court-navy"}`}>{formatMembershipMoney(line.amountCents, snapshot.currency)}</p>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between gap-4 border-t-2 border-court-navy pt-3">
        <p className="font-black text-court-navy">Total</p>
        <p className="text-xl font-black text-court-navy">{formatMembershipMoney(snapshot.total_cents, snapshot.currency)}</p>
      </div>
      {!compact ? <p className="mt-3 text-xs font-semibold text-slate-500">Calculated {formatDate(snapshot.calculated_at)} · Plan version {snapshot.plan_version}</p> : null}
    </div>
  );
}

export function MembershipApplicationCard({ application, href }: { application: MembershipApplicationView; href: string }) {
  return (
    <Link className="group block rounded-lg focus-ring" href={href}>
      <article className="surface-card p-4 transition group-hover:-translate-y-0.5 group-hover:shadow-court">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="section-kicker">{application.plan?.name ?? application.price_snapshot.plan_name}</p><h3 className="mt-1 truncate text-lg font-black text-court-navy">{application.applicant ? `${application.applicant.first_name} ${application.applicant.last_name}` : "Membership application"}</h3></div>
          <MembershipStatusChip status={application.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <p className="flex items-center gap-2 font-bold text-slate-600"><EntriesIcon size={15} /> {application.price_snapshot.members.length} covered</p>
          <p className="flex items-center justify-end gap-2 font-black text-court-navy"><CostIcon size={15} /> {formatMembershipMoney(application.calculated_total_cents, application.currency)}</p>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">Start {formatDate(application.requested_start_date)} · Submitted {application.submitted_at ? formatDate(application.submitted_at) : "not submitted"}</p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy"><span>Review Application</span><ArrowRightIcon size={16} /></div>
      </article>
    </Link>
  );
}

export function MembershipSubscriptionCard({ href, subscription }: { href: string; subscription: MembershipSubscriptionView }) {
  const nextPayment = subscription.billingSchedule.find((item) => item.status === "scheduled");
  return (
    <Link className="group block rounded-lg focus-ring" href={href}>
      <article className="surface-card overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-court">
        <div className="h-1.5 bg-court-teal" />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="section-kicker">{subscription.venue?.name ?? "Club membership"}</p><h3 className="mt-1 truncate text-lg font-black text-court-navy">{subscription.plan?.name ?? subscription.price_snapshot.plan_name}</h3></div>
            <MembershipStatusChip status={subscription.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MembershipMetric icon={<MembershipIcon size={14} />} label="Covered" value={subscription.coveredMembers.length} />
            <MembershipMetric icon={<CostIcon size={14} />} label="Amount due" value={formatMembershipMoney(subscription.amount_due_cents, subscription.currency)} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><StatusIcon size={14} /> {nextPayment ? `Next payment ${formatDate(nextPayment.due_date)}` : "No payment currently due"}</p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy"><span>View Membership Details</span><ArrowRightIcon size={16} /></div>
        </div>
      </article>
    </Link>
  );
}
