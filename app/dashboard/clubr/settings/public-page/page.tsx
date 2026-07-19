import Link from "next/link";
import { saveClubPublicSettings } from "@/app/dashboard/clubr/actions";
import { StatusAlert } from "@/components/status-alert";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

const fieldClass = "mt-1.5 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring";
const labelClass = "text-sm font-black text-court-navy";

export default async function ClubRPublicPageSettings({ searchParams }: { searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:settings");
  if (content) return content;
  if (!context || !venue) return null;
  const canManage = canAccessClubRPermission(context.role, "clubr:settings:manage");

  return (
    <ClubRPageFrame context={context} subtitle="What may players and guests see about this club?" title="Public Club Page" venue={venue}>
      <StatusAlert className="mb-4" message={searchParams?.message ? "Public club details saved." : null} tone="success" />
      <StatusAlert className="mb-4" message={searchParams?.error ? "Public club details could not be saved." : null} tone="error" />
      <Link className="mb-4 inline-flex font-bold text-court-blue" href="/dashboard/clubr/settings">Back to Settings</Link>
      {!canManage ? <section className="ui-empty-card">Public club settings are read-only for your ClubR role.</section> : (
        <form action={saveClubPublicSettings} className="grid gap-5">
          <input name="venueId" type="hidden" value={venue.id} />
          <section className="surface-card p-5"><p className="section-kicker">Discovery</p><h2 className="section-title mt-1">Who can find this club?</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{ value: "public", title: "Publicly Discoverable", detail: "Appears in venue search." }, { value: "members_only", title: "Members Only", detail: "Connected members can open it." }, { value: "hidden", title: "Hidden", detail: "Only authorised relationships can open it." }].map((option) => <label className="rounded border border-slate-200 p-4 text-sm" key={option.value}><input defaultChecked={venue.discovery_visibility === option.value} name="discoveryVisibility" required type="radio" value={option.value} /><span className="ml-2 font-black text-court-navy">{option.title}</span><span className="mt-2 block text-slate-600">{option.detail}</span></label>)}</div></section>
          <section className="surface-card p-5"><p className="section-kicker">Public information</p><h2 className="section-title mt-1">What should visitors know?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={`${labelClass} sm:col-span-2`}>Club name<input className={fieldClass} defaultValue={venue.name} name="clubName" required /></label><label className={`${labelClass} sm:col-span-2`}>Public description<textarea className={fieldClass} defaultValue={venue.public_description ?? venue.description ?? ""} name="publicDescription" rows={4} /></label><label className={`${labelClass} sm:col-span-2`}>Address<input className={fieldClass} defaultValue={venue.address ?? ""} name="address" /></label><label className={labelClass}>Suburb<input className={fieldClass} defaultValue={venue.suburb ?? ""} name="suburb" /></label><label className={labelClass}>Town<input className={fieldClass} defaultValue={venue.town ?? ""} name="town" /></label><label className={labelClass}>City<input className={fieldClass} defaultValue={venue.city ?? ""} name="city" /></label><label className={labelClass}>Phone<input className={fieldClass} defaultValue={venue.contact_phone ?? ""} name="contactPhone" type="tel" /></label><label className={labelClass}>Email<input className={fieldClass} defaultValue={venue.contact_email ?? ""} name="contactEmail" type="email" /></label><label className={labelClass}>Website<input className={fieldClass} defaultValue={venue.website_url ?? ""} name="websiteUrl" placeholder="https://" type="url" /></label><label className={labelClass}>Public image URL<input className={fieldClass} defaultValue={venue.public_image_url ?? venue.logo_url ?? ""} name="publicImageUrl" placeholder="https://" type="url" /></label><label className={`${labelClass} sm:col-span-2`}>Opening hours<textarea className={fieldClass} defaultValue={venue.opening_hours_text ?? ""} name="openingHours" placeholder="Monday-Friday 06:00-21:00" rows={3} /></label><label className={labelClass}>Surface types<textarea className={fieldClass} defaultValue={venue.surface_types.join("\n")} name="surfaceTypes" placeholder="Hard court&#10;Clay" rows={4} /></label><label className={labelClass}>Facilities<textarea className={fieldClass} defaultValue={venue.facilities.join("\n")} name="facilities" placeholder="Clubhouse&#10;Lights" rows={4} /></label><label className={`${labelClass} sm:col-span-2`}>Visitor information<textarea className={fieldClass} defaultValue={venue.visitor_information ?? ""} name="visitorInformation" rows={3} /></label><label className={labelClass}>Parking information<textarea className={fieldClass} defaultValue={venue.parking_information ?? ""} name="parkingInformation" rows={3} /></label><label className={labelClass}>Booking notes<textarea className={fieldClass} defaultValue={venue.booking_notes ?? ""} name="bookingNotes" rows={3} /></label><label className={`${labelClass} sm:col-span-2`}>Membership contact<input className={fieldClass} defaultValue={venue.membership_contact ?? ""} name="membershipContact" /></label></div></section>
          <section className="surface-card p-5"><p className="section-kicker">Leaderboards</p><h2 className="section-title mt-1">Who may see club standings?</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{ key: "competitionLeaderboardVisibility", label: "Competition", value: venue.competition_leaderboard_visibility }, { key: "participationLeaderboardVisibility", label: "Participation", value: venue.participation_leaderboard_visibility }, { key: "developmentLeaderboardVisibility", label: "Development", value: venue.development_leaderboard_visibility }].map((item) => <label className={labelClass} key={item.key}>{item.label}<select className={fieldClass} defaultValue={item.value} name={item.key}><option value="hidden">Hidden</option><option value="members_only">Members only</option><option value="public">Public</option></select></label>)}</div></section>
          <button className="btn-primary" type="submit">Save Public Club Page</button>
        </form>
      )}
    </ClubRPageFrame>
  );
}
