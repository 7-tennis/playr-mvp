import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { BookingIcon, ClubIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDate } from "@/lib/courtside-format";
import { canManageOrganisationCourtAccess } from "@/lib/organisations";
import { getPermissionContext } from "@/lib/permissions";
import type { Court, OrganisationCourtAccess, Venue } from "@/types/courtside";
import { grantOrganisationCourtAccess, revokeOrganisationCourtAccess } from "./actions";

export const dynamic = "force-dynamic";

type CourtAccessPageProps = {
  searchParams?: { error?: string; message?: string; venue?: string };
};

type AccessWithRelations = OrganisationCourtAccess & {
  approved_venue: Pick<Venue, "id" | "name" | "organisation_type"> | null;
  court: Pick<Court, "id" | "name"> | null;
  owner_venue: Pick<Venue, "id" | "name" | "organisation_type"> | null;
};

function message(value?: string) {
  return value === "granted" ? "Court access granted." : value === "revoked" ? "Court access revoked." : null;
}

function error(value?: string) {
  switch (value) {
    case "access": return "Your role cannot manage court access for that organisation.";
    case "confirm": return "Confirm before revoking court access.";
    case "date_order": return "The valid-until date must be after the valid-from date.";
    case "grant_failed": return "Court access could not be granted.";
    case "revoke_failed": return "Court access could not be revoked.";
    default: return null;
  }
}

export default async function CoachRCourtsPage({ searchParams }: CourtAccessPageProps) {
  const context = await getPermissionContext();

  if (context.kind !== "authenticated") {
    return null;
  }

  const venuesResult = await context.supabase
    .from("venues")
    .select("id,name,organisation_type,status")
    .eq("status", "active")
    .order("name", { ascending: true });
  const venues = ((venuesResult.data ?? []) as Pick<Venue, "id" | "name" | "organisation_type" | "status">[]) ?? [];
  const selectedVenueId = context.role === "platform_admin"
    ? venues.some((venue) => venue.id === searchParams?.venue) ? searchParams?.venue ?? null : venues[0]?.id ?? null
    : context.venueId;
  const canManage = context.role === "platform_admin" || (selectedVenueId === context.venueId && canManageOrganisationCourtAccess(context.activeOrganisationRole));

  if (!canManage || !selectedVenueId) {
    return (
      <PageShell eyebrow="CoachR" title="Access restricted">
        <section className="empty-state">
          <BookingIcon size={24} />
          <h2 className="section-title mt-3">Court agreements need an authorised manager</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Ask an organisation administrator, club manager or sports coordinator to configure shared courts.</p>
          <Link className="btn-secondary mt-4" href="/dashboard/coachr/more">Back to More</Link>
        </section>
      </PageShell>
    );
  }

  const [courtsResult, outgoingResult, incomingResult] = await Promise.all([
    context.supabase.from("courts").select("id,name,venue_id,status,sort_order").eq("venue_id", selectedVenueId).order("sort_order", { ascending: true }),
    context.supabase
      .from("organisation_court_access")
      .select("*,owner_venue:owner_venue_id(id,name,organisation_type),approved_venue:approved_venue_id(id,name,organisation_type),court:court_id(id,name)")
      .eq("owner_venue_id", selectedVenueId)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("organisation_court_access")
      .select("*,owner_venue:owner_venue_id(id,name,organisation_type),approved_venue:approved_venue_id(id,name,organisation_type),court:court_id(id,name)")
      .eq("approved_venue_id", selectedVenueId)
      .order("created_at", { ascending: false })
  ]);
  const courts = (courtsResult.data ?? []) as Pick<Court, "id" | "name" | "venue_id" | "status" | "sort_order">[];
  const outgoing = (outgoingResult.data ?? []) as unknown as AccessWithRelations[];
  const incoming = (incomingResult.data ?? []) as unknown as AccessWithRelations[];
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? null;

  return (
    <PageShell eyebrow="CoachR" subtitle="Share organisation-owned courts without creating duplicate court records." title="Courts & Access">
      <StatusAlert className="mb-4" message={message(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={error(searchParams?.error)} tone="error" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-court-teal/20 bg-court-mist p-3">
        <div><p className="text-xs font-black uppercase tracking-wide text-court-teal">Active organisation</p><p className="font-black text-court-navy">{selectedVenue?.name ?? "Organisation"}</p></div>
        {context.role === "platform_admin" ? (
          <form method="get"><select className="rounded border border-slate-300 px-3 py-2 text-sm font-bold focus-ring" defaultValue={selectedVenueId} name="venue">{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><button className="btn-secondary ml-2 px-3 py-2" type="submit">Switch</button></form>
        ) : <Link className="btn-secondary px-3 py-2" href="/dashboard/coachr/more">Back to More</Link>}
      </div>

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <article className="surface-card p-4 sm:p-5">
          <p className="section-kicker">Owned Courts</p>
          <h2 className="section-title mt-1">{courts.length} configured</h2>
          <div className="mt-4 flex flex-wrap gap-2">{courts.length > 0 ? courts.map((court) => <span className={`ui-chip ${court.status === "active" ? "ui-chip-success" : "ui-chip-muted"}`} key={court.id}>{court.name}</span>) : <div className="ui-empty-card w-full">No courts are owned by this organisation yet.</div>}</div>
        </article>

        <article className="surface-card p-4 sm:p-5">
          <p className="section-kicker">Grant Access</p>
          <h2 className="section-title mt-1">Approve another organisation</h2>
          <form action={grantOrganisationCourtAccess} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="ownerVenueId" type="hidden" value={selectedVenueId} />
            <label className="text-sm font-semibold text-slate-700">Organisation<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="approvedVenueId" required><option value="">Choose organisation</option>{venues.filter((venue) => venue.id !== selectedVenueId).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Court scope<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="courtId"><option value="">All active courts</option>{courts.filter((court) => court.status === "active").map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Valid from<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="validFrom" type="date" /></label>
            <label className="text-sm font-semibold text-slate-700">Valid until<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="validUntil" type="date" /></label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Notes<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Optional access notes" /></label>
            <button className="btn-primary sm:col-span-2" type="submit">Grant Court Access</button>
          </form>
        </article>
      </section>

      <section className="mb-5 surface-card p-4 sm:p-5">
        <p className="section-kicker">Granted by {selectedVenue?.name ?? "this organisation"}</p>
        <h2 className="section-title mt-1">Approved organisations</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {outgoing.length > 0 ? outgoing.map((access) => (
            <article className="rounded-lg border border-slate-200 p-3" key={access.id}>
              <div className="flex items-start justify-between gap-2"><div><p className="font-black text-court-navy">{access.approved_venue?.name ?? "Organisation"}</p><p className="mt-1 text-xs font-semibold text-slate-600">{access.court?.name ?? "All active courts"} · {access.valid_until ? `until ${formatDate(access.valid_until)}` : "no end date"}</p></div><span className={`ui-chip ${access.status === "active" ? "ui-chip-success" : "ui-chip-muted"}`}>{access.status}</span></div>
              {access.status === "active" ? <form action={revokeOrganisationCourtAccess} className="mt-3 flex flex-wrap items-center gap-2"><input name="accessId" type="hidden" value={access.id} /><input name="ownerVenueId" type="hidden" value={selectedVenueId} /><label className="text-xs font-semibold text-amber-800"><input className="mr-1" name="confirm" type="checkbox" /> Confirm revoke</label><button className="rounded border border-amber-300 px-3 py-2 text-xs font-black text-amber-800" type="submit">Revoke</button></form> : null}
            </article>
          )) : <div className="ui-empty-card md:col-span-2">No organisations have been granted access yet.</div>}
        </div>
      </section>

      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded bg-court-mist text-court-teal"><ClubIcon size={18} /></span><div><p className="section-kicker">External Courts</p><h2 className="section-title mt-1">Courts this organisation can use</h2></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{incoming.filter((access) => access.status === "active").length > 0 ? incoming.filter((access) => access.status === "active").map((access) => <article className="rounded-lg border border-slate-200 p-3" key={access.id}><p className="font-black text-court-navy">{access.owner_venue?.name ?? "Court owner"}</p><p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-600"><StatusIcon size={14} /> {access.court?.name ?? "All active courts"}</p></article>) : <div className="ui-empty-card md:col-span-2">No external courts are shared with this organisation.</div>}</div>
      </section>
    </PageShell>
  );
}
