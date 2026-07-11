import { AdminNav } from "@/components/admin-nav";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import { normalizeStoredRole, roleLabel } from "@/lib/permissions";
import type { AdminUser, Profile, Venue } from "@/types/courtside";
import { assignOrganisationRole, deactivateOrganisationRole, updateOrganisationType } from "./actions";

export const dynamic = "force-dynamic";

type OrganisationsPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    q?: string;
  };
};

type AdminAssignment = Pick<AdminUser, "id" | "user_id" | "role" | "venue_id" | "assigned_at" | "deactivated_at">;
type AdultProfile = Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "is_junior">;

function profileName(profile: AdultProfile | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile missing";
}

function statusMessage(message?: string) {
  switch (message) {
    case "head_coach_assigned":
      return "Head Coach access assigned.";
    case "club_admin_assigned":
      return "Club Admin access assigned.";
    case "coach_assigned":
      return "Coach access assigned.";
    case "platform_admin_assigned":
      return "SupeR UseR access assigned.";
    case "organisation_updated":
      return "Organisation type updated.";
    case "role_deactivated":
      return "Role assignment deactivated.";
    default:
      return null;
  }
}

function errorMessage(error?: string) {
  switch (error) {
    case "access":
      return "Only a SupeR UseR can manage organisation administrators.";
    case "adult_profile_required":
      return "Select a user with a valid adult PlayR profile.";
    case "confirm_required":
      return "Confirm the role change before saving.";
    case "invalid_venue":
      return "Choose a valid organisation.";
    case "last_platform_admin":
      return "Keep at least one SupeR UseR active before removing this access.";
    case "assign_failed":
      return "Role assignment could not be saved.";
    case "deactivate_failed":
      return "Role assignment could not be deactivated.";
    case "organisation_update_failed":
      return "Organisation type could not be updated.";
    default:
      return null;
  }
}

function setupStatus(venue: Venue, assignments: AdminAssignment[]) {
  const active = assignments.filter((assignment) => !assignment.deactivated_at && assignment.venue_id === venue.id);
  const headCoachCount = active.filter((assignment) => assignment.role === "head_coach").length;
  const clubAdminCount = active.filter((assignment) => assignment.role === "club_admin").length;
  const coachCount = active.filter((assignment) => assignment.role === "coach").length;

  if (headCoachCount > 0 && clubAdminCount > 0) {
    return { label: "Ready", tone: "ui-chip-success", coachCount, headCoachCount, clubAdminCount };
  }

  return { label: "Setup needed", tone: "ui-chip-warning", coachCount, headCoachCount, clubAdminCount };
}

export default async function OrganisationsPage({ searchParams }: OrganisationsPageProps) {
  const { adminRole, supabase } = await getAdminContext();

  if (adminRole !== "platform_admin") {
    return (
      <PageShell eyebrow="SupeR UseR" title="Access restricted">
        <AdminNav />
        <section className="empty-state">
          <PrivateIcon size={24} />
          <h2 className="section-title mt-3">Only SupeR UseR accounts can manage organisation access.</h2>
        </section>
      </PageShell>
    );
  }

  const [{ data: venues }, { data: adminRows }, { data: profileRows }] = await Promise.all([
    supabase.from("venues").select("id,name,slug,status,organisation_type,created_at,updated_at").order("name", { ascending: true }),
    supabase.from("admin_users").select("id,user_id,role,venue_id,assigned_at,deactivated_at").order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id,user_id,first_name,last_name,email,is_junior")
      .eq("is_junior", false)
      .not("user_id", "is", null)
      .order("first_name", { ascending: true })
      .limit(240)
  ]);

  const allProfiles = ((profileRows ?? []) as AdultProfile[]) ?? [];
  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const profiles = query
    ? allProfiles.filter((profile) => `${profile.first_name} ${profile.last_name} ${profile.email ?? ""}`.toLowerCase().includes(query))
    : allProfiles.slice(0, 40);
  const assignments = ((adminRows ?? []) as AdminAssignment[]) ?? [];
  const profileByUser = new Map(allProfiles.map((profile) => [profile.user_id, profile]));
  const activeAssignments = assignments.filter((assignment) => !assignment.deactivated_at);
  const incompleteAssignments = activeAssignments.filter(
    (assignment) => !profileByUser.get(assignment.user_id) || (assignment.role !== "platform_admin" && !assignment.venue_id)
  );

  return (
    <PageShell eyebrow="SupeR UseR" subtitle="Assign first organisation administrators and keep venue access tidy." title="Organisations">
      <AdminNav />

      {statusMessage(searchParams?.message) ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{statusMessage(searchParams?.message)}</div>
      ) : null}
      {errorMessage(searchParams?.error) ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{errorMessage(searchParams?.error)}</div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="stat-card">
          <ClubIcon size={20} />
          <p className="section-kicker mt-3">Organisations</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{venues?.length ?? 0}</p>
        </article>
        <article className="stat-card">
          <EntriesIcon size={20} />
          <p className="section-kicker mt-3">Active administrators</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{activeAssignments.length}</p>
        </article>
        <article className="stat-card">
          <StatusIcon size={20} />
          <p className="section-kicker mt-3">Setup issues</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{incompleteAssignments.length}</p>
        </article>
      </section>

      <CollapsibleCard defaultOpen eyebrow="Search" summary="Find existing PlayR adult profiles by name or email." title="User search">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto]" method="get">
          <input className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Name or email" />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
      </CollapsibleCard>

      <CollapsibleCard
        eyebrow="SupeR UseR"
        summary="Assign internal platform-wide access. Use sparingly and only for trusted platform owners."
        title="Assign SupeR UseR"
      >
        <form action={assignOrganisationRole} className="grid gap-3">
          <input name="role" type="hidden" value="platform_admin" />
          <label className="text-sm font-semibold text-slate-700">
            User
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profileId" required>
              <option value="">Choose adult profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileName(profile)} · {profile.email ?? "No email"}
                </option>
              ))}
            </select>
          </label>
          <label className="rounded border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            <input className="mr-2" name="confirmAssignment" type="checkbox" />
            Confirm platform-wide SupeR UseR access
          </label>
          <button className="btn-primary" type="submit">
            Assign SupeR UseR
          </button>
        </form>
      </CollapsibleCard>

      <section className="mt-5 grid gap-4">
        {((venues ?? []) as Venue[]).map((venue) => {
          const status = setupStatus(venue, assignments);
          const venueAdmins = activeAssignments.filter((assignment) => assignment.venue_id === venue.id);

          return (
            <article className="surface-card p-4 sm:p-5" key={venue.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="section-title">{venue.name}</h2>
                    <span className={`ui-chip ${status.tone}`}>{status.label}</span>
                    <span className="ui-chip ui-chip-muted">{formatLabel(venue.organisation_type)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="ui-chip ui-chip-brand">{status.headCoachCount} Head Coach</span>
                    <span className="ui-chip ui-chip-brand">{status.clubAdminCount} Club Admin</span>
                    <span className="ui-chip ui-chip-muted">{status.coachCount} Coaches</span>
                  </div>
                </div>
                <form action={updateOrganisationType} className="flex gap-2">
                  <input name="venueId" type="hidden" value={venue.id} />
                  <select className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={venue.organisation_type} name="organisationType">
                    <option value="academy">Academy</option>
                    <option value="club">Club</option>
                    <option value="club_academy">Club and academy</option>
                    <option value="school_district">School/district</option>
                  </select>
                  <button className="btn-secondary px-3 py-2" type="submit">
                    Save
                  </button>
                </form>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-black text-court-navy">Current administrators</p>
                  <div className="mt-3 grid gap-2">
                    {venueAdmins.length > 0 ? (
                      venueAdmins.map((assignment) => {
                        const profile = profileByUser.get(assignment.user_id);
                        return (
                          <div className="rounded bg-slate-50 p-3" key={assignment.id}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-black text-court-navy">{profileName(profile)}</p>
                              <span className="ui-chip ui-chip-muted">{roleLabel(normalizeStoredRole(assignment.role))}</span>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{profile?.email ?? "Email unavailable"}</p>
                            <form action={deactivateOrganisationRole} className="mt-3 flex flex-wrap items-center gap-2">
                              <input name="targetUserId" type="hidden" value={assignment.user_id} />
                              <label className="text-xs font-semibold text-amber-800">
                                <input className="mr-1" name="confirmDeactivate" type="checkbox" /> Confirm remove
                              </label>
                              <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                                Remove Access
                              </button>
                            </form>
                          </div>
                        );
                      })
                    ) : (
                      <div className="ui-empty-card">No active administrators yet.</div>
                    )}
                  </div>
                </div>

                <CollapsibleCard eyebrow="Assign" summary="Select an existing adult PlayR profile and confirm the role assignment." title="Assign access">
                  <form action={assignOrganisationRole} className="grid gap-3">
                    <input name="venueId" type="hidden" value={venue.id} />
                    <label className="text-sm font-semibold text-slate-700">
                      User
                      <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profileId" required>
                        <option value="">Choose adult profile</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profileName(profile)} · {profile.email ?? "No email"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Role
                      <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="role" required>
                        <option value="head_coach">Head Coach</option>
                        <option value="club_admin">Club Admin</option>
                        <option value="coach">Coach</option>
                      </select>
                    </label>
                    <label className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                      <input className="mr-2" name="confirmAssignment" type="checkbox" />
                      Confirm this high-impact access change
                    </label>
                    <button className="btn-primary" type="submit">
                      Assign Access
                    </button>
                  </form>
                </CollapsibleCard>
              </div>
            </article>
          );
        })}
      </section>

      {incompleteAssignments.length > 0 ? (
        <section className="mt-5 surface-card p-4 sm:p-5">
          <p className="section-kicker">Incomplete setup</p>
          <div className="mt-3 grid gap-2">
            {incompleteAssignments.map((assignment) => (
              <p className="rounded bg-amber-50 p-3 text-sm font-semibold text-amber-900" key={assignment.id}>
                {roleLabel(normalizeStoredRole(assignment.role))} for user {assignment.user_id}: {!profileByUser.get(assignment.user_id) ? "adult profile missing" : "venue missing"}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
