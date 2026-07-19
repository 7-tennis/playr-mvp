import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembershipPriceBreakdown, MembershipStatusChip } from "@/components/membership-ui";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { loadMembershipApplication } from "@/lib/club-memberships";
import { formatDate } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyMembershipApplicationPage({ params, searchParams }: { params: { applicationId: string }; searchParams?: { message?: string } }) {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const result = await loadMembershipApplication(supabase, params.applicationId);
  const application = result.data;
  if (!application || application.owner_user_id !== user.id) notFound();
  return <PageShell eyebrow="MyPlayR" subtitle="Your submitted membership choice and club decision." title="Membership Application"><StatusAlert className="mb-4" message={searchParams?.message ? "Application submitted. The club will review it next." : null} tone="success" /><Link className="mb-4 inline-block font-bold text-court-blue" href="/dashboard/memberships">Back to Memberships</Link><section className="surface-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="section-kicker">{application.venue?.name}</p><h2 className="mt-1 text-2xl font-black text-court-navy">{application.plan?.name ?? application.price_snapshot.plan_name}</h2><p className="mt-2 text-sm text-slate-600">Requested start {formatDate(application.requested_start_date)}</p></div><MembershipStatusChip status={application.status} /></div>{application.correction_message || application.decline_reason ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">{application.correction_message ?? application.decline_reason}</div> : null}</section><div className="mt-5"><MembershipPriceBreakdown snapshot={application.price_snapshot} /></div><div className="mt-5 rounded-lg border border-court-teal/25 bg-court-mist p-4 text-sm leading-6 text-slate-600">Submitting an application does not activate membership or process a payment. The club’s decision remains visible here.</div></PageShell>;
}
