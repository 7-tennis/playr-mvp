import Link from "next/link";
import type { ReactNode } from "react";
import { ClubRBottomNav, ClubRDesktopNav } from "@/components/clubr-navigation";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, PrivateIcon } from "@/components/playr-icons";
import { clubRScopeLabel, getClubRAccess, loadClubRVenue, type AuthenticatedClubRContext, type ClubRAccess } from "@/lib/clubr";
import { formatLabel } from "@/lib/courtside-format";
import { roleLabel } from "@/lib/permissions";

export function ClubRRestricted({ access }: { access: ClubRAccess }) {
  const roleText = access.context.kind === "authenticated" ? roleLabel(access.context.role) : "Signed-in user";

  return (
    <PageShell eyebrow="ClubR" title="Access restricted">
      <section className="empty-state">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded bg-court-mist text-court-teal">
          <PrivateIcon size={22} />
        </div>
        <h2 className="section-title mt-4">ClubR access restricted.</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Ask the PlayR SupeR UseR to assign you as Club Admin for this venue. Current role: {roleText}.
        </p>
        <Link className="btn-secondary mt-5" href="/dashboard">
          Back to MyPlayR
        </Link>
      </section>
    </PageShell>
  );
}

export function ClubRNoConfig() {
  return (
    <PageShell eyebrow="ClubR" title="Supabase is not configured.">
      <div className="ui-empty-card">Add Supabase environment variables to use ClubR permissions.</div>
    </PageShell>
  );
}

export function ClubRPageFrame({
  children,
  context,
  subtitle,
  title,
  venue
}: {
  children: ReactNode;
  context: AuthenticatedClubRContext;
  subtitle?: ReactNode;
  title: string;
  venue: Awaited<ReturnType<typeof loadClubRVenue>>;
}) {
  return (
    <PageShell eyebrow="ClubR" subtitle={subtitle} title={title}>
      <ClubRDesktopNav />
      <section className="surface-card mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Access</p>
            <h2 className="section-title mt-1">{roleLabel(context.role)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {clubRScopeLabel(context, venue)} · {venue?.organisation_type ? formatLabel(venue.organisation_type) : "Venue setup to be confirmed"}
            </p>
          </div>
          <span className="ui-chip ui-chip-brand">
            <ClubIcon size={14} /> {context.role === "platform_admin" ? "Global ClubR view" : "Venue-scoped ClubR"}
          </span>
        </div>
      </section>
      <div className="pb-24 md:pb-0">{children}</div>
      <ClubRBottomNav />
    </PageShell>
  );
}

export function ClubRStatCard({
  helper,
  icon,
  label,
  value
}: {
  helper?: ReactNode;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-court-navy">{value}</p>
          {helper ? <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{helper}</p> : null}
        </div>
        {icon ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">{icon}</span> : null}
      </div>
    </article>
  );
}

export function ClubRActionCard({
  href,
  icon,
  text,
  title
}: {
  href: string;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href={href}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">{icon}</span>
        <div className="min-w-0">
          <h3 className="font-black text-court-navy">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
        </div>
      </div>
    </Link>
  );
}

export async function getProtectedClubRPage() {
  const access = await getClubRAccess();

  if (access.context.kind === "no-config") {
    return { access, content: <ClubRNoConfig />, context: null, venue: null };
  }

  if (!access.allowed) {
    return { access, content: <ClubRRestricted access={access} />, context: null, venue: null };
  }

  const venue = await loadClubRVenue(access.context);
  return { access, content: null, context: access.context, venue };
}
