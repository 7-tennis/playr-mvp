import Link from "next/link";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { resolveCourtReadiness } from "@/lib/court-readiness";
import { loadOrganisationSetup, productSetupPath, setupProgress } from "@/lib/organisation-setup";
import { CoachRPageFrame, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

export default async function CoachRSettingsPage() {
  const { access, content } = await getProtectedCoachRPage("coachr:more");
  if (content) return content;
  if (access.context.kind !== "authenticated") return null;

  const context = access.context;
  const allowedRoles = ["organisation_admin", "club_manager", "head_coach"];
  if (!context.venueId || !allowedRoles.includes(context.activeOrganisationRole ?? "")) {
    return (
      <CoachRPageFrame context={context} title="Settings">
        <section className="empty-state"><PrivateIcon className="mx-auto" size={24} /><h2 className="section-title mt-3">Organisation settings are limited to academy leaders.</h2><p className="mt-2 text-sm text-slate-600">Coaches can continue managing their own lessons, students and availability.</p></section>
      </CoachRPageFrame>
    );
  }

  const venueName = context.activeOrganisationMembership?.venue?.name ?? "Academy";
  const [snapshot, external, accessRows, requests, coaches, students, settings] = await Promise.all([
    loadOrganisationSetup(context.supabase, context.venueId, "coachr"),
    context.supabase.from("organisation_external_venues").select("id", { count: "exact", head: true }).eq("organisation_id", context.venueId).eq("status", "active"),
    context.supabase.from("organisation_court_access").select("owner_venue_id").eq("approved_venue_id", context.venueId).eq("status", "active"),
    context.supabase.from("organisation_court_access_requests").select("id", { count: "exact", head: true }).eq("requester_venue_id", context.venueId).eq("status", "pending"),
    context.supabase.from("organisation_memberships").select("id", { count: "exact", head: true }).eq("venue_id", context.venueId).eq("status", "active").in("role", ["head_coach", "coach", "assistant_coach"]),
    context.supabase.from("organisation_player_links").select("id", { count: "exact", head: true }).eq("venue_id", context.venueId).eq("status", "active"),
    context.supabase.from("organisation_coaching_settings").select("*").eq("venue_id", context.venueId).maybeSingle()
  ]);
  const progress = setupProgress(snapshot);
  const ownerIds = Array.from(new Set(((accessRows.data ?? []) as { owner_venue_id: string }[]).map((row) => row.owner_venue_id)));
  const readiness = await Promise.all(ownerIds.map((ownerVenueId) => resolveCourtReadiness({ academyVenueId: context.venueId as string, ownerVenueId, supabase: context.supabase })));
  const readinessIssue = readiness.find((item) => item.status !== "active");

  return (
    <CoachRPageFrame context={context} subtitle="Academy setup stays editable here after onboarding." title="Settings">
      <section className="mb-4 rounded-lg border border-court-teal/20 bg-court-mist p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div><p className="section-kicker">Setup status</p><h2 className="mt-1 text-lg font-black text-court-navy">{snapshot.setup.status === "complete" ? "CoachR is ready" : `${progress.completeCount} of ${progress.totalCount} steps saved`}</h2></div>
        <Link className="btn-primary mt-3 sm:mt-0" href={productSetupPath("coachr", snapshot.setup.current_step)}>{snapshot.setup.status === "complete" ? "Review Setup" : "Resume Setup"}</Link>
      </section>

      <div className="grid gap-3">
        <CollapsibleCard summary={venueName} title="Organisation Details"><Link className="btn-secondary" href={productSetupPath("coachr", "details")}>Edit Academy Details</Link></CollapsibleCard>
        <CollapsibleCard summary={`${coaches.count ?? 0} active coaches`} title="Coaches and Roles"><Link className="btn-secondary" href={productSetupPath("coachr", "coaches")}>Manage Coaches</Link></CollapsibleCard>
        <CollapsibleCard badge={(requests.count ?? 0) > 0 || readinessIssue ? <span className="ui-chip ui-chip-warning"><StatusIcon size={14} /> {readinessIssue?.next_action ?? "Access pending"}</span> : null} summary={readinessIssue?.reason ?? `${ownerIds.length} connected PlayR venues · ${external.count ?? 0} external venues`} title="Courts and Venues"><Link className="btn-secondary" href={productSetupPath("coachr", "venues")}>Manage Coaching Venues</Link></CollapsibleCard>
        <CollapsibleCard summary={`${students.count ?? 0} active academy connections`} title="Students"><Link className="btn-secondary" href="/dashboard/coachr/students">Open Students</Link></CollapsibleCard>
        <CollapsibleCard summary={settings.data ? `${settings.data.default_lesson_duration_minutes} minutes · ${settings.data.default_lesson_type}` : "Choose defaults per lesson"} title="Lesson Defaults"><Link className="btn-secondary" href={productSetupPath("coachr", "defaults")}>Edit Lesson Defaults</Link></CollapsibleCard>
        <CollapsibleCard summary="Pending coach and player invitations" title="Invitations"><Link className="btn-secondary" href="/dashboard/organisations/invitations">View Invitations</Link></CollapsibleCard>
      </div>
    </CoachRPageFrame>
  );
}
