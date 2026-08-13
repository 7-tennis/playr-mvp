import Link from "next/link";
import type { ReactNode } from "react";
import { OrganisationSwitcher } from "@/components/organisation-switcher";
import { PageShell } from "@/components/page-shell";
import { PrivateIcon, SchoolIcon } from "@/components/playr-icons";
import { TeamRBottomNav, TeamRDesktopNav } from "@/components/teamr-navigation";
import { getTeamRAccess, isTeamRMembership, loadTeamRVenue, teamROrganisationTypeLabel, teamRRoleLabel, type AuthenticatedTeamRContext } from "@/lib/teamr";

export function TeamRNoConfig() {
  return <PageShell eyebrow="TeamR" title="Supabase is not configured."><div className="ui-empty-card">Add Supabase environment variables to use TeamR permissions.</div></PageShell>;
}

export function TeamRRestricted({ reason }: { reason: string | null }) {
  return (
    <PageShell eyebrow="TeamR" title="Access restricted">
      <section className="empty-state">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded bg-court-mist text-court-teal"><PrivateIcon size={22} /></div>
        <h2 className="section-title mt-4">TeamR access restricted.</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{reason}</p>
        <Link className="btn-secondary mt-5" href="/dashboard">Back to MyPlayR</Link>
      </section>
    </PageShell>
  );
}

export function TeamRPageFrame({ children, context, subtitle, title, venue }: {
  children: ReactNode;
  context: AuthenticatedTeamRContext;
  subtitle?: ReactNode;
  title: string;
  venue: Awaited<ReturnType<typeof loadTeamRVenue>>;
}) {
  const teamRMemberships = context.organisationMemberships.filter(isTeamRMembership);
  const platform = context.role === "platform_admin";

  return (
    <PageShell eyebrow="TeamR" subtitle={subtitle} title={title}>
      <TeamRDesktopNav />
      <section className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <p className="min-w-0 text-sm font-bold text-court-navy">
          {platform ? "All eligible organisations" : venue?.name ?? "Organisation context unavailable"}
          <span className="ml-2 font-semibold text-slate-500">{platform ? "SupeR UseR" : `${teamRRoleLabel(context.activeOrganisationRole)} · ${teamROrganisationTypeLabel(venue?.organisation_type)}`}</span>
        </p>
        <span className="ui-chip ui-chip-brand"><SchoolIcon size={14} /> {platform ? "Global" : "TeamR"}</span>
      </section>
      {!platform ? <div className="mb-5"><OrganisationSwitcher activeMembershipId={context.activeOrganisationMembership?.id ?? null} memberships={teamRMemberships} /></div> : null}
      <div className="pb-24 md:pb-0">{children}</div>
      <TeamRBottomNav />
    </PageShell>
  );
}

export function TeamRStatCard({ helper, icon, label, value }: { helper: ReactNode; icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-court-navy">{value}</p><p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{helper}</p></div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">{icon}</span>
      </div>
    </article>
  );
}

export async function getProtectedTeamRPage() {
  const access = await getTeamRAccess();
  if (access.context.kind === "no-config") return { access, content: <TeamRNoConfig />, context: null, venue: null };
  if (!access.allowed) return { access, content: <TeamRRestricted reason={access.reason} />, context: null, venue: null };
  const venue = await loadTeamRVenue(access.context);
  return { access, content: null, context: access.context, venue };
}
