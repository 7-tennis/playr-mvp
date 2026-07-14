import Link from "next/link";
import { delegateOrganisation } from "@/app/admin/organisations/actions";
import { AdminNav } from "@/components/admin-nav";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { getAdminContext } from "@/lib/admin-auth";
import { formatLabel } from "@/lib/courtside-format";
import { organisationRoleLabel } from "@/lib/organisations";
import { productSetupLabel } from "@/lib/organisation-setup";
import type { OrganisationMembership, OrganisationProductSetup, Profile, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

type OrganisationsPageProps = {
  searchParams?: { error?: string; message?: string; q?: string };
};

type AdultProfile = Pick<Profile, "id" | "first_name" | "last_name" | "email" | "is_junior" | "user_id">;
type LeaderMembership = Pick<OrganisationMembership, "id" | "venue_id" | "role" | "status"> & {
  profile: Pick<Profile, "id" | "first_name" | "last_name" | "email"> | null;
};

function name(profile: AdultProfile | LeaderMembership["profile"] | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Leader not assigned";
}

function messageText(message?: string) {
  return message === "onboarding_assigned"
    ? "Access assigned. The organisation leader can now complete setup without SupeR UseR involvement."
    : null;
}

function errorText(error?: string) {
  switch (error) {
    case "access": return "Only a SupeR UseR can assign the first organisation leader.";
    case "adult_profile_required": return "Choose an adult PlayR profile linked to a signed-in user.";
    case "invalid_role": return "Choose a leader role that matches this organisation type.";
    case "invalid_venue": return "Choose a valid organisation.";
    case "missing_fields": return "Choose a profile and either select or name an organisation.";
    case "assign_failed": return "The organisation handoff could not be completed.";
    default: return error ? "That change could not be saved." : null;
  }
}

function setupTone(status: OrganisationProductSetup["status"] | "not_assigned") {
  return status === "complete" ? "ui-chip-success" : status === "needs_review" ? "ui-chip-warning" : "ui-chip-brand";
}

export default async function OrganisationsPage({ searchParams }: OrganisationsPageProps) {
  const { adminRole, supabase } = await getAdminContext();

  if (adminRole !== "platform_admin") {
    return (
      <PageShell eyebrow="SupeR UseR" title="Access restricted">
        <AdminNav />
        <section className="empty-state"><PrivateIcon className="mx-auto" size={24} /><h2 className="section-title mt-3">Only SupeR UseR accounts can manage organisation access.</h2></section>
      </PageShell>
    );
  }

  const [venuesResult, profilesResult, membershipsResult, setupsResult, invitationsResult] = await Promise.all([
    supabase.from("venues").select("*").order("name"),
    supabase.from("profiles").select("id,first_name,last_name,email,is_junior,user_id").eq("is_junior", false).not("user_id", "is", null).order("first_name").limit(300),
    supabase.from("organisation_memberships").select("id,venue_id,role,status,profile:profile_id(id,first_name,last_name,email)").eq("status", "active").in("role", ["organisation_admin", "club_manager", "head_coach", "sports_coordinator"]).order("created_at"),
    supabase.from("organisation_product_setups").select("*").order("updated_at", { ascending: false }),
    supabase.from("organisation_invitations").select("id", { count: "exact", head: true }).eq("status", "pending")
  ]);
  const venues = (venuesResult.data ?? []) as Venue[];
  const allProfiles = (profilesResult.data ?? []) as AdultProfile[];
  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const profiles = (query
    ? allProfiles.filter((profile) => `${name(profile)} ${profile.email ?? ""}`.toLowerCase().includes(query))
    : allProfiles).slice(0, 80);
  const memberships = (membershipsResult.data ?? []) as unknown as LeaderMembership[];
  const setups = (setupsResult.data ?? []) as OrganisationProductSetup[];
  const completedCount = setups.filter((setup) => setup.status === "complete").length;

  return (
    <PageShell eyebrow="SupeR UseR" subtitle="Create or select an organisation, assign its first leader, then let that leader configure how it operates." title="Organisation Handoffs">
      <AdminNav />
      <StatusAlert className="mb-4" message={messageText(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={errorText(searchParams?.error)} tone="error" />

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="stat-card"><ClubIcon size={20} /><p className="section-kicker mt-3">Organisations</p><p className="mt-2 text-3xl font-black text-court-navy">{venues.length}</p></article>
        <article className="stat-card"><EntriesIcon size={20} /><p className="section-kicker mt-3">Leaders assigned</p><p className="mt-2 text-3xl font-black text-court-navy">{memberships.length}</p></article>
        <article className="stat-card"><StatusIcon size={20} /><p className="section-kicker mt-3">Setup complete</p><p className="mt-2 text-3xl font-black text-court-navy">{completedCount}</p></article>
      </section>

      <section className="surface-card mb-5 overflow-hidden">
        <div className="bg-court-navy p-4 text-white sm:p-5">
          <p className="text-xs font-black uppercase tracking-wide text-court-lime">One-step handoff</p>
          <h2 className="mt-1 text-2xl font-black">Assign the organisation leader</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/70">This person will configure the organisation after access is assigned. You do not need to set courts, booking rules, staff, members or academy venues.</p>
        </div>
        <form action={delegateOrganisation} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <label className="text-sm font-bold text-slate-700">Existing organisation, optional<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="venueId"><option value="">Create a new organisation</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
          <label className="text-sm font-bold text-slate-700">New organisation name<input className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="organisationName" placeholder="Club Anonymous" /></label>
          <label className="text-sm font-bold text-slate-700">Organisation type<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="organisationType"><option value="club">Club</option><option value="academy">Academy</option><option value="school">School</option><option value="club_academy">Club and academy</option><option value="school_district">School / district</option><option value="district">District</option></select></label>
          <label className="text-sm font-bold text-slate-700">Initial access<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="leaderRole"><option value="organisation_admin">Organisation Admin</option><option value="club_manager">ClubR Admin</option><option value="head_coach">Head Coach</option><option value="sports_coordinator">Sports Coordinator</option></select></label>
          <label className="text-sm font-bold text-slate-700 sm:col-span-2">PlayR profile<select className="mt-2 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="profileId" required><option value="">Choose an adult profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{name(profile)} · {profile.email ?? "No email"}</option>)}</select></label>
          <button className="btn-primary sm:col-span-2" type="submit">Assign Access and Handoff</button>
        </form>
      </section>

      <CollapsibleCard eyebrow="Find profile" summary="Filter the profile list by name or email before completing the handoff." title="Profile search">
        <form className="flex gap-2" method="get"><input className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Name or email" /><button className="btn-secondary px-4 py-2.5" type="submit">Search</button></form>
      </CollapsibleCard>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {venues.map((venue) => {
          const leaders = memberships.filter((membership) => membership.venue_id === venue.id);
          const setup = setups.find((item) => item.venue_id === venue.id);
          return (
            <article className="surface-card p-4" key={venue.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="section-kicker">{formatLabel(venue.organisation_type)}</p><h2 className="mt-1 text-lg font-black text-court-navy">{venue.name}</h2></div><span className={`ui-chip ${setupTone(setup?.status ?? "not_assigned")}`}>{setup ? setup.status.replaceAll("_", " ") : "Awaiting handoff"}</span></div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                {leaders.length > 0 ? leaders.map((leader) => <p key={leader.id}><span className="font-black text-court-navy">{name(leader.profile)}</span> · {organisationRoleLabel(leader.role)}</p>) : <p>No operational leader assigned yet.</p>}
              </div>
              {setup ? <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-slate-500">{productSetupLabel(setup.product_context)}</span><span className="text-xs font-semibold text-slate-500">Leader owns the next step: {formatLabel(setup.current_step)}</span></div> : null}
            </article>
          );
        })}
      </section>

      <div className="mt-5">
        <CollapsibleCard eyebrow="Support" summary="Keep technical checks available without making them part of ordinary onboarding." title="Advanced diagnostics">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link className="btn-secondary" href="/admin/debug-role">Role Diagnostics</Link>
            <Link className="btn-secondary" href="/admin/foundation">Foundation Access</Link>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">{invitationsResult.count ?? 0} pending organisation invitations. Diagnostics are for support only.</p>
        </CollapsibleCard>
      </div>
    </PageShell>
  );
}
