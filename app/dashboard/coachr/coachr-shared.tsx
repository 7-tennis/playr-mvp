import Link from "next/link";
import type { ReactNode } from "react";
import { CoachRBottomNav, CoachRDesktopNav } from "@/components/coachr-navigation";
import { PageShell } from "@/components/page-shell";
import { BookingIcon, ClubIcon, EntriesIcon, MatchIcon, PrivateIcon, TimeIcon } from "@/components/playr-icons";
import { getCoachRAccess, roleLabel, type CoachRPermission, type PermissionContext, type UserRole } from "@/lib/permissions";

type CoachRAccess = Awaited<ReturnType<typeof getCoachRAccess>>;

function roleList(roles: UserRole[]) {
  return roles.map(roleLabel).join(", ");
}

export function CoachRRestricted({ access, title = "Access restricted" }: { access: CoachRAccess; title?: string }) {
  const roleText = access.context.kind === "authenticated" ? roleLabel(access.context.role) : "Signed-in user";

  return (
    <PageShell eyebrow="CoachR" title={title}>
      <section className="empty-state">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded bg-court-mist text-court-teal">
          <PrivateIcon size={22} />
        </div>
        <h2 className="section-title mt-4">CoachR is limited to coaching roles</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Your current role is {roleText}. This area is available to {roleList(access.requiredRoles)}.
        </p>
        <Link className="btn-secondary mt-5" href="/dashboard">
          Back to MyPlayR
        </Link>
      </section>
    </PageShell>
  );
}

export function CoachRNoConfig() {
  return (
    <PageShell eyebrow="CoachR" title="Supabase is not configured.">
      <div className="ui-empty-card">Add Supabase environment variables to use CoachR permissions.</div>
    </PageShell>
  );
}

export function CoachRNav({ canUseHeadCoach: _canUseHeadCoach }: { canUseHeadCoach: boolean }) {
  return (
    <>
      <CoachRDesktopNav />
      <CoachRBottomNav />
    </>
  );
}

export function CoachRPageFrame({
  children,
  context,
  subtitle,
  title
}: {
  children: ReactNode;
  context: Extract<PermissionContext, { kind: "authenticated" }>;
  subtitle?: ReactNode;
  title: string;
}) {
  return (
    <PageShell eyebrow="CoachR" subtitle={subtitle} title={title}>
      <CoachRNav canUseHeadCoach={context.role === "head_coach" || context.role === "platform_admin"} />
      <div className="pb-24 md:pb-0">{children}</div>
    </PageShell>
  );
}

export function CoachRSummaryCard({
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

export function CoachRActionCard({
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

export function CoachRRoleSummary({ context }: { context: Extract<PermissionContext, { kind: "authenticated" }> }) {
  const scope =
    context.role === "coach"
      ? "Own lessons, students, availability and feedback"
      : context.role === "head_coach"
        ? "All coaches linked to your venue"
        : "Internal full access";

  return (
    <section className="surface-card mb-5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">Role</p>
          <h2 className="section-title mt-1">{roleLabel(context.role)}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{scope}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          <span className="ui-chip ui-chip-brand">
            <ClubIcon size={14} /> {context.venueId ? "Venue linked" : "Venue to be linked"}
          </span>
          <span className="ui-chip ui-chip-muted">
            <PrivateIcon size={14} /> Private dashboard
          </span>
        </div>
      </div>
    </section>
  );
}

export function CoachRScopeCards({ context }: { context: Extract<PermissionContext, { kind: "authenticated" }> }) {
  const cards = [
    { title: "Schedule", text: context.role === "coach" ? "Manage only your own lesson schedule." : "Review coach schedules for your permitted venue.", icon: <TimeIcon size={18} />, href: "/dashboard/coachr/schedule" },
    { title: "Students", text: context.role === "coach" ? "Work with your own students and notes." : "View students linked to coaches at your venue.", icon: <EntriesIcon size={18} />, href: "/dashboard/coachr/students" },
    { title: "Availability", text: context.role === "coach" ? "Maintain your own availability windows." : "Monitor coach availability for venue planning.", icon: <BookingIcon size={18} />, href: "/dashboard/coachr/availability" },
    { title: "Feedback", text: "Keep lesson feedback private to the permitted coaching scope.", icon: <MatchIcon size={18} />, href: "/dashboard/coachr" }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Link className="surface-card block p-4 transition hover:-translate-y-0.5 hover:shadow-court" href={card.href} key={card.title}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">{card.icon}</span>
            <div>
              <h3 className="font-black text-court-navy">{card.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{card.text}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export async function getProtectedCoachRPage(permission: CoachRPermission) {
  const access = await getCoachRAccess(permission);

  if (access.context.kind === "no-config") {
    return { access, content: <CoachRNoConfig /> };
  }

  if (!access.allowed) {
    return { access, content: <CoachRRestricted access={access} /> };
  }

  return { access, content: null };
}
