import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addExternalVenue,
  addOrganisationCourt,
  completeOrganisationSetup,
  grantSetupCourtAccess,
  inviteSetupStaff,
  requestPlayRVenueAccess,
  respondToCourtAccessRequest,
  saveBookingBasics,
  saveCoachingDefaults,
  saveCoachingVenuesStep,
  saveCourtsStep,
  saveOrganisationDetails,
  saveSimpleSetupStep,
  updateOrganisationCourt
} from "@/app/dashboard/setup/actions";
import { OrganisationSetupWizard } from "@/components/organisation-setup-wizard";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, EntriesIcon, InviteIcon, LocationIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { resolveCourtReadiness, type CourtReadinessResult } from "@/lib/court-readiness";
import { productForOrganisationMembership } from "@/lib/organisations";
import { loadOrganisationSetup, productDashboardPath, setupStep } from "@/lib/organisation-setup";
import { getPermissionContext } from "@/lib/permissions";
import type {
  Court,
  OrganisationBookingSettings,
  OrganisationCoachingSettings,
  OrganisationCourtAccess,
  OrganisationCourtAccessRequest,
  OrganisationExternalVenue,
  OrganisationInvitation,
  OrganisationSetupProduct,
  Venue
} from "@/types/courtside";

export const dynamic = "force-dynamic";

type SetupPageProps = {
  params: { product: string };
  searchParams?: { error?: string; message?: string; step?: string };
};

type AccessRow = OrganisationCourtAccess & { owner: Pick<Venue, "id" | "name"> | null; approved: Pick<Venue, "id" | "name"> | null };
type RequestRow = OrganisationCourtAccessRequest & { owner: Pick<Venue, "id" | "name"> | null; requester: Pick<Venue, "id" | "name"> | null };

const fieldClass = "mt-2 w-full rounded border border-slate-300 px-3 py-2.5 text-sm focus-ring";
const labelClass = "text-sm font-bold text-slate-700";

function messageText(message?: string) {
  switch (message) {
    case "court_added": return "Court added. Add another or continue when the list is ready.";
    case "court_updated": return "Court details updated.";
    case "staff_invited": return "Invitation created. The person can accept from their PlayR invitations.";
    case "external_venue_added": return "External venue added. PlayR will not claim live availability for it.";
    case "access_requested": return "Court-access request sent to the venue owner.";
    case "access_active": return "Court access is active. No further platform approval is needed.";
    case "request_declined": return "The access request was declined.";
    default: return null;
  }
}

function errorText(error?: string) {
  switch (error) {
    case "access": return "This setup is available only to an authorised organisation leader.";
    case "details_required": return "Add the organisation name before continuing.";
    case "court_required": return "Add a court name.";
    case "court_or_none": return "Add at least one active court or choose the no-courts option.";
    case "time_order": return "Closing time must be after opening time.";
    case "venue_required": return "Choose or add a venue first.";
    case "venue_or_none": return "Connect a PlayR venue, add an external venue, or confirm that there is no default venue.";
    case "duplicate_invitation": return "That person already has a pending invitation.";
    case "essential_setup": return "Complete the essential details and venue or court choice before opening the dashboard.";
    default: return error ? "That change could not be saved. Please check the details and try again." : null;
  }
}

function HiddenSetupFields({ product, step }: { product: OrganisationSetupProduct; step: string }) {
  return (
    <>
      <input name="product" type="hidden" value={product} />
      <input name="step" type="hidden" value={step} />
    </>
  );
}

function OptionalStepActions({ product, step }: { product: OrganisationSetupProduct; step: string }) {
  return (
    <form action={saveSimpleSetupStep} className="mt-5 flex flex-wrap justify-end gap-2">
      <HiddenSetupFields product={product} step={step} />
      <button className="btn-secondary" name="intent" type="submit" value="skip">Skip for now</button>
      <button className="btn-primary" name="intent" type="submit" value="continue">Continue</button>
    </form>
  );
}

function DetailsStep({ product, venue }: { product: OrganisationSetupProduct; venue: Venue }) {
  return (
    <form action={saveOrganisationDetails} className="grid gap-4 sm:grid-cols-2">
      <HiddenSetupFields product={product} step="details" />
      <label className={labelClass}>Name<input className={fieldClass} defaultValue={venue.name} name="name" required /></label>
      <label className={labelClass}>Contact email<input className={fieldClass} defaultValue={venue.contact_email ?? ""} name="contactEmail" type="email" /></label>
      <label className={labelClass}>Contact number<input className={fieldClass} defaultValue={venue.contact_phone ?? ""} name="contactPhone" /></label>
      <label className={labelClass}>Address<input className={fieldClass} defaultValue={venue.address ?? ""} name="address" /></label>
      <label className={labelClass}>Main contact person<input className={fieldClass} defaultValue={venue.main_contact_name ?? ""} name="mainContactName" /></label>
      <label className={labelClass}>Logo URL, optional<input className={fieldClass} defaultValue={venue.logo_url ?? ""} name="logoUrl" type="url" /></label>
      <label className={`${labelClass} sm:col-span-2`}>Short description<textarea className={`${fieldClass} min-h-24`} defaultValue={venue.description ?? ""} name="description" /></label>
      <button className="btn-primary sm:col-span-2" type="submit">Save and Continue</button>
    </form>
  );
}

function CourtsStep({ courts, product }: { courts: Court[]; product: OrganisationSetupProduct }) {
  return (
    <div>
      <div className="grid gap-3">
        {courts.length > 0 ? courts.map((court) => (
          <details className="rounded-lg border border-slate-200" key={court.id}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 font-black text-court-navy">
              <span>{court.name} <span className={`ui-chip ml-2 ${court.status === "active" ? "ui-chip-success" : "ui-chip-muted"}`}>{court.status}</span></span>
              <span className="text-xs text-court-teal">Edit</span>
            </summary>
            <form action={updateOrganisationCourt} className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
              <HiddenSetupFields product={product} step="courts" />
              <input name="courtId" type="hidden" value={court.id} />
              <label className={labelClass}>Court name<input className={fieldClass} defaultValue={court.name} name="name" required /></label>
              <label className={labelClass}>Court number<input className={fieldClass} defaultValue={court.court_number ?? ""} name="courtNumber" /></label>
              <label className={labelClass}>Surface<input className={fieldClass} defaultValue={court.surface ?? ""} name="surface" placeholder="Hard, clay, grass" /></label>
              <label className={labelClass}>Status<select className={fieldClass} defaultValue={court.status} name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <label className={labelClass}>Opens<input className={fieldClass} defaultValue={court.opening_time?.slice(0, 5) ?? ""} name="openingTime" type="time" /></label>
              <label className={labelClass}>Closes<input className={fieldClass} defaultValue={court.closing_time?.slice(0, 5) ?? ""} name="closingTime" type="time" /></label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input defaultChecked={court.lighting_available} name="lightingAvailable" type="checkbox" /> Lighting available</label>
              <button className="btn-secondary sm:col-span-2" type="submit">Update Court</button>
            </form>
          </details>
        )) : <div className="ui-empty-card">No courts added yet.</div>}
      </div>

      <form action={addOrganisationCourt} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <HiddenSetupFields product={product} step="courts" />
        <h3 className="font-black text-court-navy sm:col-span-2">Add court</h3>
        <label className={labelClass}>Court name<input className={fieldClass} name="name" placeholder="Court 1" required /></label>
        <label className={labelClass}>Court number<input className={fieldClass} name="courtNumber" placeholder="1" /></label>
        <label className={labelClass}>Surface<input className={fieldClass} name="surface" placeholder="Hard" /></label>
        <label className="flex items-end gap-2 pb-3 text-sm font-bold text-slate-700"><input name="lightingAvailable" type="checkbox" /> Lighting available</label>
        <label className={labelClass}>Opens<input className={fieldClass} name="openingTime" type="time" /></label>
        <label className={labelClass}>Closes<input className={fieldClass} name="closingTime" type="time" /></label>
        <button className="btn-secondary sm:col-span-2" type="submit">Add Court</button>
      </form>

      <form action={saveCourtsStep} className="mt-5 border-t border-slate-200 pt-5">
        <HiddenSetupFields product={product} step="courts" />
        <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">
          <input className="mt-1" name="noCourts" type="checkbox" />
          <span>This club does not manage courts in PlayR. I will add them later if that changes.</span>
        </label>
        <button className="btn-primary mt-4 w-full" type="submit">Save Courts and Continue</button>
      </form>
    </div>
  );
}

function BookingStep({ product, settings }: { product: OrganisationSetupProduct; settings: OrganisationBookingSettings | null }) {
  return (
    <form action={saveBookingBasics} className="grid gap-4 sm:grid-cols-2">
      <HiddenSetupFields product={product} step="booking" />
      <label className={labelClass}>Slot interval<select className={fieldClass} defaultValue={settings?.slot_minutes ?? 60} name="slotMinutes"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label>
      <label className={labelClass}>Advance booking window<input className={fieldClass} defaultValue={settings?.advance_booking_days ?? 7} max="365" min="0" name="advanceBookingDays" type="number" /></label>
      <label className={labelClass}>Opening time<input className={fieldClass} defaultValue={settings?.opening_time?.slice(0, 5) ?? "06:00"} name="openingTime" type="time" /></label>
      <label className={labelClass}>Closing time<input className={fieldClass} defaultValue={settings?.closing_time?.slice(0, 5) ?? "21:00"} name="closingTime" type="time" /></label>
      <label className={labelClass}>Maximum active bookings<input className={fieldClass} defaultValue={settings?.max_active_bookings ?? 3} min="1" name="maxActiveBookings" type="number" /></label>
      <label className={labelClass}>Non-member price (R)<input className={fieldClass} defaultValue={(settings?.non_member_price_cents ?? 0) / 100} min="0" name="nonMemberPrice" step="0.01" type="number" /></label>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input defaultChecked={settings?.member_booking_enabled ?? true} name="memberBookingEnabled" type="checkbox" /> Members may book</label>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input defaultChecked={settings?.non_member_booking_enabled ?? false} name="nonMemberBookingEnabled" type="checkbox" /> Non-members may book</label>
      <button className="btn-primary sm:col-span-2" type="submit">Save and Continue</button>
    </form>
  );
}

function StaffStep({ invitations, product }: { invitations: OrganisationInvitation[]; product: OrganisationSetupProduct }) {
  const step = product === "clubr" ? "staff" : "coaches";
  const roles = product === "clubr"
    ? [{ value: "club_manager", label: "Club manager" }, { value: "committee", label: "Committee" }, { value: "reception", label: "Reception" }, { value: "head_coach", label: "Head Coach" }, { value: "coach", label: "Coach" }, { value: "sports_coordinator", label: "Sports coordinator" }, { value: "viewer", label: "Member / viewer" }]
    : [{ value: "head_coach", label: "Head Coach" }, { value: "coach", label: "Coach" }, { value: "assistant_coach", label: "Assistant coach" }];

  return (
    <div>
      {invitations.length > 0 ? <div className="mb-4 flex flex-wrap gap-2">{invitations.slice(0, 6).map((invite) => <span className="ui-chip ui-chip-warning" key={invite.id}>{invite.invited_email} · Pending</span>)}</div> : null}
      <form action={inviteSetupStaff} className="grid gap-3 sm:grid-cols-2">
        <HiddenSetupFields product={product} step={step} />
        <label className={labelClass}>Name<input className={fieldClass} name="invitedName" /></label>
        <label className={labelClass}>Email<input className={fieldClass} name="email" required type="email" /></label>
        <label className={labelClass}>Phone<input className={fieldClass} name="invitedPhone" /></label>
        <label className={labelClass}>Access<select className={fieldClass} name="role">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <button className="btn-secondary sm:col-span-2" type="submit"><InviteIcon className="mr-2" size={16} /> Send Invitation</button>
      </form>
      <OptionalStepActions product={product} step={step} />
    </div>
  );
}

function SharingStep({ accesses, courts, organisations, product, requests }: { accesses: AccessRow[]; courts: Court[]; organisations: Venue[]; product: OrganisationSetupProduct; requests: RequestRow[] }) {
  return (
    <div>
      {requests.length > 0 ? (
        <div className="mb-5 grid gap-3">
          <h3 className="font-black text-court-navy">Requests waiting for your decision</h3>
          {requests.map((request) => (
            <form action={respondToCourtAccessRequest} className="rounded-lg border border-amber-200 bg-amber-50 p-3" key={request.id}>
              <HiddenSetupFields product={product} step="sharing" />
              <input name="requestId" type="hidden" value={request.id} />
              <p className="font-black text-court-navy">{request.requester?.name ?? "Academy"}</p>
              <p className="mt-1 text-sm text-slate-600">Choose courts below, then approve in one action.</p>
              <div className="mt-3 flex flex-wrap gap-3">{courts.filter((court) => court.status === "active").map((court) => <label className="text-sm font-bold" key={court.id}><input className="mr-1" name="courtIds" type="checkbox" value={court.id} /> {court.name}</label>)}</div>
              <div className="mt-3 flex gap-2"><button className="btn-primary px-3 py-2" name="decision" type="submit" value="active">Approve Access</button><button className="btn-secondary px-3 py-2" name="decision" type="submit" value="declined">Decline</button></div>
            </form>
          ))}
        </div>
      ) : null}

      {accesses.length > 0 ? <div className="mb-5 flex flex-wrap gap-2">{accesses.map((access) => <span className="ui-chip ui-chip-success" key={access.id}>{access.approved?.name ?? "Organisation"} · Access active</span>)}</div> : null}
      <form action={grantSetupCourtAccess} className="grid gap-3">
        <HiddenSetupFields product={product} step="sharing" />
        <label className={labelClass}>Share with<select className={fieldClass} name="approvedVenueId" required><option value="">Choose academy or school</option>{organisations.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
        <fieldset><legend className={labelClass}>Courts</legend><p className="mt-1 text-xs text-slate-500">Leave all unchecked to share every active court.</p><div className="mt-3 flex flex-wrap gap-3">{courts.filter((court) => court.status === "active").map((court) => <label className="text-sm font-bold" key={court.id}><input className="mr-1" name="courtIds" type="checkbox" value={court.id} /> {court.name}</label>)}</div></fieldset>
        <label className={labelClass}>Note<textarea className={`${fieldClass} min-h-20`} name="notes" placeholder="Optional access note" /></label>
        <button className="btn-primary" type="submit">Save Active Access</button>
      </form>
      <OptionalStepActions product={product} step="sharing" />
    </div>
  );
}

function VenuesStep({ accesses, externalVenues, organisations, product, readinessByOwner, requests }: { accesses: AccessRow[]; externalVenues: OrganisationExternalVenue[]; organisations: Venue[]; product: OrganisationSetupProduct; readinessByOwner: Map<string, CourtReadinessResult>; requests: RequestRow[] }) {
  const connectedVenues = Array.from(new Map(accesses.map((access) => [access.owner_venue_id, access])).values());
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-court-teal/25 bg-court-mist p-4">
          <ClubIcon className="text-court-teal" size={22} /><h3 className="mt-2 font-black text-court-navy">Connect a PlayR venue</h3><p className="mt-1 text-sm leading-6 text-slate-600">Request access from a club or school. Its admin approves the courts.</p>
        </section>
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <LocationIcon className="text-court-teal" size={22} /><h3 className="mt-2 font-black text-court-navy">Add an external venue</h3><p className="mt-1 text-sm leading-6 text-slate-600">For estates, homes or venues outside PlayR. Availability stays external.</p>
        </section>
      </div>

      <div className="mt-5 grid gap-2">
        {connectedVenues.map((access) => {
          const readiness = readinessByOwner.get(access.owner_venue_id);
          return <div className={`rounded-lg border p-3 ${readiness?.status === "active" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} key={access.owner_venue_id}><div className="flex items-center justify-between gap-3"><span className="font-black text-court-navy">{access.owner?.name ?? "PlayR venue"}</span><span className={`ui-chip ${readiness?.status === "active" ? "ui-chip-success" : "ui-chip-warning"}`}>{readiness?.status === "active" ? "Access active" : readiness?.status?.replaceAll("_", " ") ?? "Checking access"}</span></div>{readiness ? <p className="mt-1 text-xs font-semibold text-slate-600">{readiness.reason}</p> : null}</div>;
        })}
        {requests.map((request) => <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3" key={request.id}><span className="font-black text-court-navy">{request.owner?.name ?? "PlayR venue"}</span><span className="ui-chip ui-chip-warning">Access pending</span></div>)}
        {externalVenues.map((venue) => <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3" key={venue.id}><span><span className="block font-black text-court-navy">{venue.name}</span><span className="text-xs font-semibold text-slate-500">External venue · Availability managed outside PlayR</span></span><span className="ui-chip ui-chip-muted">External</span></div>)}
      </div>

      <details className="mt-5 rounded-lg border border-slate-200">
        <summary className="cursor-pointer p-3 font-black text-court-navy">Connect a PlayR venue</summary>
        <form action={requestPlayRVenueAccess} className="grid gap-3 border-t border-slate-100 p-3">
          <HiddenSetupFields product={product} step="venues" />
          <label className={labelClass}>Club or school<select className={fieldClass} name="ownerVenueId" required><option value="">Choose venue</option>{organisations.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
          <label className={labelClass}>Message<textarea className={`${fieldClass} min-h-20`} name="notes" placeholder="We would like to coach at your courts." /></label>
          <button className="btn-secondary" type="submit">Send Access Request</button>
        </form>
      </details>

      <details className="mt-3 rounded-lg border border-slate-200">
        <summary className="cursor-pointer p-3 font-black text-court-navy">Add an external venue</summary>
        <form action={addExternalVenue} className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
          <HiddenSetupFields product={product} step="venues" />
          <label className={labelClass}>Venue name<input className={fieldClass} name="name" required /></label>
          <label className={labelClass}>Address or location<input className={fieldClass} name="address" /></label>
          <label className={labelClass}>Contact person<input className={fieldClass} name="contactName" /></label>
          <label className={labelClass}>Contact number<input className={fieldClass} name="contactPhone" /></label>
          <label className={labelClass}>Number of courts<input className={fieldClass} min="0" name="courtCount" type="number" /></label>
          <label className={labelClass}>Court names<input className={fieldClass} name="courtNames" placeholder="Court A, Court B" /></label>
          <label className={`${labelClass} sm:col-span-2`}>Notes<textarea className={`${fieldClass} min-h-20`} name="notes" /></label>
          <button className="btn-secondary sm:col-span-2" type="submit">Add External Venue</button>
        </form>
      </details>

      <form action={saveCoachingVenuesStep} className="mt-5 border-t border-slate-200 pt-5">
        <HiddenSetupFields product={product} step="venues" />
        <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700"><input className="mt-1" name="noDefaultVenue" type="checkbox" /><span>Our academy has no default venue yet. We will choose a location per lesson.</span></label>
        <button className="btn-primary mt-4 w-full" type="submit">Save Venues and Continue</button>
      </form>
    </div>
  );
}

function DefaultsStep({ externalVenues, product, settings }: { externalVenues: OrganisationExternalVenue[]; product: OrganisationSetupProduct; settings: OrganisationCoachingSettings | null }) {
  return (
    <form action={saveCoachingDefaults} className="grid gap-4 sm:grid-cols-2">
      <HiddenSetupFields product={product} step="defaults" />
      <label className={labelClass}>Default duration<select className={fieldClass} defaultValue={settings?.default_lesson_duration_minutes ?? 60} name="defaultLessonDuration"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></label>
      <label className={labelClass}>Default lesson type<select className={fieldClass} defaultValue={settings?.default_lesson_type ?? "private"} name="defaultLessonType"><option value="private">Private</option><option value="group">Group</option><option value="squad">Squad</option><option value="matchplay">Match play</option><option value="assessment">Assessment</option><option value="other">Other</option></select></label>
      <label className={`${labelClass} sm:col-span-2`}>Default external venue<select className={fieldClass} defaultValue={settings?.default_external_venue_id ?? ""} name="defaultExternalVenueId"><option value="">Choose per lesson</option>{externalVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input defaultChecked={settings?.private_lessons_enabled ?? true} name="privateLessonsEnabled" type="checkbox" /> Private lessons enabled</label>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input defaultChecked={settings?.group_lessons_enabled ?? true} name="groupLessonsEnabled" type="checkbox" /> Group lessons enabled</label>
      <button className="btn-primary sm:col-span-2" type="submit">Save and Continue</button>
    </form>
  );
}

function LinkStep({ href, product, step, text, title }: { href: string; product: OrganisationSetupProduct; step: string; text: string; title: string }) {
  return (
    <div>
      <div className="rounded-lg border border-court-teal/20 bg-court-mist p-4">
        <EntriesIcon className="text-court-teal" size={22} />
        <h3 className="mt-2 font-black text-court-navy">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
        <Link className="btn-secondary mt-3" href={href}>Open {title}</Link>
      </div>
      <OptionalStepActions product={product} step={step} />
    </div>
  );
}

function ReviewStep({ product, snapshot }: { product: OrganisationSetupProduct; snapshot: Awaited<ReturnType<typeof loadOrganisationSetup>> }) {
  const complete = new Set([...snapshot.setup.completed_steps, ...snapshot.setup.skipped_steps]);
  return (
    <div>
      <div className="grid gap-2">
        {snapshot.steps.filter((step) => step.id !== "review").map((step) => (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3" key={step.id}>
            <span><span className="block font-black text-court-navy">{step.title}</span><span className="text-xs font-semibold text-slate-500">{step.essential ? "Essential" : "Optional"}</span></span>
            <span className={`ui-chip ${complete.has(step.id) ? "ui-chip-success" : step.essential ? "ui-chip-warning" : "ui-chip-muted"}`}>{complete.has(step.id) ? "Saved" : step.essential ? "Needs attention" : "Can add later"}</span>
          </div>
        ))}
      </div>
      <form action={completeOrganisationSetup} className="mt-5">
        <HiddenSetupFields product={product} step="review" />
        <button className="btn-primary w-full" type="submit">Complete Setup</button>
      </form>
      <p className="mt-3 text-center text-xs font-semibold text-slate-500">You can update all setup details later under Settings.</p>
    </div>
  );
}

export default async function OrganisationSetupPage({ params, searchParams }: SetupPageProps) {
  if (params.product !== "clubr" && params.product !== "coachr") {
    notFound();
  }

  const product = params.product as OrganisationSetupProduct;
  const context = await getPermissionContext();

  const setupRoles = product === "clubr"
    ? ["organisation_admin", "club_manager", "sports_coordinator"]
    : ["organisation_admin", "club_manager", "head_coach"];

  if (
    context.kind !== "authenticated" ||
    !context.activeOrganisationMembership ||
    productForOrganisationMembership(context.activeOrganisationMembership) !== product ||
    !setupRoles.includes(context.activeOrganisationMembership.role)
  ) {
    return <PageShell eyebrow="Organisation Setup" title="Access restricted"><StatusAlert message="Switch to an organisation where you are an authorised setup leader." tone="error" /></PageShell>;
  }

  const membership = context.activeOrganisationMembership;
  const venueId = membership.venue_id;
  const [venueResult, snapshot, courtsResult, bookingResult, coachingResult, externalResult, organisationsResult, accessResult, requestsResult, invitationsResult] = await Promise.all([
    context.supabase.from("venues").select("*").eq("id", venueId).single(),
    loadOrganisationSetup(context.supabase, venueId, product),
    context.supabase.from("courts").select("*").eq("venue_id", venueId).order("sort_order"),
    context.supabase.from("organisation_booking_settings").select("*").eq("venue_id", venueId).maybeSingle(),
    context.supabase.from("organisation_coaching_settings").select("*").eq("venue_id", venueId).maybeSingle(),
    context.supabase.from("organisation_external_venues").select("*").eq("organisation_id", venueId).eq("status", "active").order("name"),
    context.supabase.from("venues").select("*").neq("id", venueId).eq("status", "active").order("name"),
    product === "clubr"
      ? context.supabase.from("organisation_court_access").select("*,owner:owner_venue_id(id,name),approved:approved_venue_id(id,name)").eq("owner_venue_id", venueId).eq("status", "active")
      : context.supabase.from("organisation_court_access").select("*,owner:owner_venue_id(id,name),approved:approved_venue_id(id,name)").eq("approved_venue_id", venueId).eq("status", "active"),
    product === "clubr"
      ? context.supabase.from("organisation_court_access_requests").select("*,owner:owner_venue_id(id,name),requester:requester_venue_id(id,name)").eq("owner_venue_id", venueId).eq("status", "pending")
      : context.supabase.from("organisation_court_access_requests").select("*,owner:owner_venue_id(id,name),requester:requester_venue_id(id,name)").eq("requester_venue_id", venueId).eq("status", "pending"),
    context.supabase.from("organisation_invitations").select("*").eq("venue_id", venueId).eq("status", "pending").order("created_at", { ascending: false })
  ]);

  if (!venueResult.data) {
    notFound();
  }

  const venue = venueResult.data as Venue;
  const step = setupStep(product, searchParams?.step, snapshot.setup.current_step);
  const courts = (courtsResult.data ?? []) as Court[];
  const bookingSettings = (bookingResult.data as OrganisationBookingSettings | null) ?? null;
  const coachingSettings = (coachingResult.data as OrganisationCoachingSettings | null) ?? null;
  const externalVenues = (externalResult.data ?? []) as OrganisationExternalVenue[];
  const organisations = ((organisationsResult.data ?? []) as Venue[]).filter((item) => product === "clubr" ? ["academy", "school", "school_district"].includes(item.organisation_type) : ["club", "school", "club_academy", "school_district"].includes(item.organisation_type));
  const accesses = (accessResult.data ?? []) as unknown as AccessRow[];
  const requests = (requestsResult.data ?? []) as unknown as RequestRow[];
  const invitations = (invitationsResult.data ?? []) as OrganisationInvitation[];
  const readinessByOwner = new Map<string, CourtReadinessResult>();
  if (product === "coachr") {
    const ownerIds = Array.from(new Set(accesses.map((access) => access.owner_venue_id)));
    const readinessRows = await Promise.all(ownerIds.map(async (ownerId) => [ownerId, await resolveCourtReadiness({ academyVenueId: venueId, ownerVenueId: ownerId, supabase: context.supabase })] as const));
    readinessRows.forEach(([ownerId, readiness]) => readinessByOwner.set(ownerId, readiness));
  }

  let content;
  switch (step.id) {
    case "details": content = <DetailsStep product={product} venue={venue} />; break;
    case "courts": content = <CourtsStep courts={courts} product={product} />; break;
    case "booking": content = <BookingStep product={product} settings={bookingSettings} />; break;
    case "staff":
    case "coaches": content = <StaffStep invitations={invitations.filter((invite) => invite.invitation_kind === "coach" || invite.invitation_kind === "organisation_member")} product={product} />; break;
    case "sharing": content = <SharingStep accesses={accesses} courts={courts} organisations={organisations} product={product} requests={requests} />; break;
    case "members": content = <LinkStep href="/dashboard/clubr/members" product={product} step="members" text="Invite members now or return after setup. Existing memberships and player links stay in one place." title="Members" />; break;
    case "venues": content = <VenuesStep accesses={accesses} externalVenues={externalVenues} organisations={organisations} product={product} readinessByOwner={readinessByOwner} requests={requests} />; break;
    case "students": content = <LinkStep href="/dashboard/coachr/students" product={product} step="students" text="Invite adult players or request a junior link using the existing secure invitation flow." title="Students" />; break;
    case "defaults": content = <DefaultsStep externalVenues={externalVenues} product={product} settings={coachingSettings} />; break;
    default: content = <ReviewStep product={product} snapshot={snapshot} />;
  }

  return (
    <PageShell eyebrow={product === "clubr" ? "ClubR Setup" : "CoachR Setup"} subtitle="One step at a time. You can leave and return without losing saved work." title={venue.name}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="btn-secondary px-3 py-2" href={productDashboardPath(product)}>Open Dashboard</Link>
        <span className="ui-chip ui-chip-brand"><StatusIcon size={14} /> {snapshot.setup.status.replaceAll("_", " ")}</span>
      </div>
      {!snapshot.migrationReady ? <StatusAlert className="mb-4" message="The guided setup migration still needs to be applied before setup can be saved." tone="error" /> : null}
      <StatusAlert className="mb-4" message={messageText(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={errorText(searchParams?.error)} tone="error" />
      <OrganisationSetupWizard organisationName={venue.name} product={product} snapshot={snapshot} step={step}>
        {content}
      </OrganisationSetupWizard>
    </PageShell>
  );
}
