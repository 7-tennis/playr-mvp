import { PageShell } from "@/components/page-shell";
import { canAccessHeadCoach } from "@/lib/permissions";
import { CoachRNav, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

export default async function CoachRAvailabilityPage() {
  const { access, content } = await getProtectedCoachRPage("coachr:availability");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const coachOnly = access.context.role === "coach";

  return (
    <PageShell eyebrow="CoachR" subtitle="Maintain coaching availability within the permitted scope." title="CoachR Availability">
      <CoachRNav canUseHeadCoach={canAccessHeadCoach(access.context.role)} />
      <CoachRRoleSummary context={access.context} />
      <section className="surface-card p-4 sm:p-5">
        <p className="section-kicker">Availability</p>
        <h2 className="section-title mt-1">{coachOnly ? "My availability" : "Coach availability"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {coachOnly
            ? "Coach access should only update availability for your own coach account."
            : "Head coach and admin access can manage availability for coaches linked to the permitted venue."}
        </p>
        <div className="ui-empty-card mt-5">Coach availability data is not configured yet.</div>
      </section>
    </PageShell>
  );
}
