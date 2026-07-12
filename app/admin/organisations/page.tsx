import { AdminNav } from "@/components/admin-nav";
import { CollapsibleCard } from "@/components/collapsible-card";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import { invitationKindLabel, invitationLink, organisationRoleLabel, organisationStatusLabel } from "@/lib/organisations";
import { normalizeStoredRole, roleLabel } from "@/lib/permissions";
import type { AdminUser, OrganisationInvitation, OrganisationMembership, Profile, Venue } from "@/types/courtside";
import {
  assignOrganisationRole,
  cancelOrganisationInvitation,
  createOrganisation,
  createOrganisationInvitation,
  deactivateOrganisationRole,
  updateOrganisationDetails,
  updateOrganisationType
} from "./actions";

export const dynamic = "force-dynamic";

type OrganisationsPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    person?: string;
    q?: string;
    token?: string;
    venue?: string;
  };
};

type AdminAssignment = Pick<AdminUser, "id" | "user_id" | "role" | "venue_id" | "assigned_at" | "deactivated_at">;
type AdultProfile = Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "is_junior">;
type OrganisationMemberRow = Pick<OrganisationMembership, "id" | "venue_id" | "profile_id" | "user_id" | "role" | "status" | "accepted_at" | "created_at"> & {
  profile: Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "phone" | "is_junior"> | null;
};
type OrganisationInvitationRow = Pick<
  OrganisationInvitation,
  "id" | "venue_id" | "invitation_kind" | "invited_email" | "invited_name" | "intended_role" | "status" | "token" | "expires_at" | "created_at"
>;

function profileName(profile: AdultProfile | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile missing";
}

function statusMessage(message?: string, person?: string, venue?: string) {
  const name = person ?? "Selected user";
  const club = venue ?? "selected organisation";

  switch (message) {
    case "head_coach_assigned":
      return `Head Coach access assigned to ${name} for ${club}.`;
    case "club_admin_assigned":
      return `ClubR access assigned to ${name} for ${club}.`;
    case "coach_assigned":
      return `Coach access assigned to ${name} for ${club}.`;
    case "platform_admin_assigned":
      return `SupeR UseR access assigned to ${name}.`;
    case "organisation_updated":
      return "Organisation updated.";
    case "organisation_created":
      return "Organisation created.";
    case "invitation_created":
      return "Invitation created. Copy and share this secure link with the invited user.";
    case "invitation_cancelled":
      return "Invitation cancelled.";
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
    case "duplicate_invitation":
      return "A pending invitation already exists for this organisation, email and role.";
    case "invitation_failed":
      return "Invitation could not be created.";
    case "invitation_cancel_failed":
      return "Invitation could not be cancelled.";
    case "invitation_closed":
      return "That invitation is no longer pending.";
    case "missing_fields":
      return "Complete the required fields before saving.";
    case "organisation_create_failed":
      return "Organisation could not be created.";
    case "organisation_update_failed":
      return "Organisation could not be updated.";
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
  const { adminRole, roleSource, storedRole, supabase, user, venueId } = await getAdminContext();

  if (adminRole !== "platform_admin") {
    console.warn("[playr-permissions]", {
      event: "super_user_access_restricted",
      userId: `${user.id.slice(0, 8)}...`,
      resolvedRole: adminRole,
      storedRole,
      roleSource,
      venueLinked: Boolean(venueId)
    });

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

  const [{ data: venues }, { data: adminRows }, { data: profileRows }, { data: membershipRows }, { data: invitationRows }] = await Promise.all([
    supabase
      .from("venues")
      .select(
        "id,name,slug,status,organisation_type,logo_url,contact_email,contact_phone,address,description,primary_admin_profile_id,head_coach_profile_id,created_at,updated_at"
      )
      .order("name", { ascending: true }),
    supabase.from("admin_users").select("id,user_id,role,venue_id,assigned_at,deactivated_at").order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id,user_id,first_name,last_name,email,is_junior")
      .eq("is_junior", false)
      .not("user_id", "is", null)
      .order("first_name", { ascending: true })
      .limit(240),
    supabase
      .from("organisation_memberships")
      .select("id,venue_id,profile_id,user_id,role,status,accepted_at,created_at,profile:profile_id(id,user_id,first_name,last_name,email,phone,is_junior)")
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("organisation_invitations")
      .select("id,venue_id,invitation_kind,invited_email,invited_name,intended_role,status,token,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(300)
  ]);

  const allProfiles = ((profileRows ?? []) as AdultProfile[]) ?? [];
  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const profiles = query
    ? allProfiles.filter((profile) => `${profile.first_name} ${profile.last_name} ${profile.email ?? ""}`.toLowerCase().includes(query))
    : allProfiles.slice(0, 40);
  const assignments = ((adminRows ?? []) as AdminAssignment[]) ?? [];
  const memberships = ((membershipRows ?? []) as unknown as OrganisationMemberRow[]) ?? [];
  const invitations = ((invitationRows ?? []) as OrganisationInvitationRow[]) ?? [];
  const profileByUser = new Map(allProfiles.map((profile) => [profile.user_id, profile]));
  const activeAssignments = assignments.filter((assignment) => !assignment.deactivated_at);
  const incompleteAssignments = activeAssignments.filter(
    (assignment) => !profileByUser.get(assignment.user_id) || (assignment.role !== "platform_admin" && !assignment.venue_id)
  );

  return (
    <PageShell eyebrow="SupeR UseR" subtitle="Assign first organisation administrators and keep venue access tidy." title="Organisations">
      <AdminNav />

      {statusMessage(searchParams?.message, searchParams?.person, searchParams?.venue) ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{statusMessage(searchParams?.message, searchParams?.person, searchParams?.venue)}</div>
      ) : null}
      {errorMessage(searchParams?.error) ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{errorMessage(searchParams?.error)}</div>
      ) : null}
      {searchParams?.token ? (
        <div className="mb-5 rounded-lg border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">
          Invitation link: <code className="break-all rounded bg-white px-2 py-1 text-court-teal">{invitationLink(searchParams.token)}</code>
        </div>
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

      <CollapsibleCard eyebrow="Create" summary="Add an academy, club, school or district without assigning platform-level access." title="Create organisation">
        <form action={createOrganisation} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Name
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="name" placeholder="Timeless Tennis Academy" required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Slug
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="slug" placeholder="timeless-tennis-academy" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Type
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="organisationType">
              <option value="academy">Academy</option>
              <option value="club">Club</option>
              <option value="school">School</option>
              <option value="district">District</option>
              <option value="club_academy">Club and academy</option>
              <option value="school_district">School/district</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Contact email
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="contactEmail" placeholder="admin@example.com" type="email" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Contact phone
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="contactPhone" placeholder="+27..." />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Address
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="address" placeholder="Club or school location" />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Description
            <textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="description" placeholder="Short organisation note" />
          </label>
          <button className="btn-primary md:col-span-2" type="submit">
            Create Organisation
          </button>
        </form>
      </CollapsibleCard>

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
          const venueMemberships = memberships.filter((membership) => membership.venue_id === venue.id);
          const activeMemberships = venueMemberships.filter((membership) => membership.status === "active");
          const pendingMemberships = venueMemberships.filter((membership) => membership.status === "pending");
          const venueInvitations = invitations.filter((invitation) => invitation.venue_id === venue.id);
          const pendingInvitations = venueInvitations.filter((invitation) => invitation.status === "pending");
          const currentClubAdmins = venueAdmins.filter((assignment) => assignment.role === "club_admin");
          const currentHeadCoaches = venueAdmins.filter((assignment) => assignment.role === "head_coach");
          const foundationAdmins = activeMemberships.filter((membership) => membership.role === "organisation_admin" || membership.role === "club_manager");
          const foundationHeadCoaches = activeMemberships.filter((membership) => membership.role === "head_coach");
          const setupWarnings = [
            currentClubAdmins.length === 0 && foundationAdmins.length === 0 ? "No Organisation Admin assigned" : null,
            currentHeadCoaches.length === 0 && foundationHeadCoaches.length === 0 ? "No Head Coach assigned" : null,
            !venue.organisation_type ? "Organisation type not set" : null
          ].filter(Boolean);

          return (
            <article className="surface-card p-4 sm:p-5" key={venue.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="section-title">{venue.name}</h2>
                    <span className={`ui-chip ${status.tone}`}>{status.label}</span>
                    <span className="ui-chip ui-chip-muted">{formatLabel(venue.organisation_type)}</span>
                    <span className={`ui-chip ${venue.status === "active" ? "ui-chip-success" : "ui-chip-warning"}`}>{formatLabel(venue.status)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="ui-chip ui-chip-brand">{foundationHeadCoaches.length || status.headCoachCount} Head Coach</span>
                    <span className="ui-chip ui-chip-brand">{foundationAdmins.length || status.clubAdminCount} Admin</span>
                    <span className="ui-chip ui-chip-muted">{activeMemberships.filter((membership) => ["coach", "assistant_coach"].includes(membership.role)).length || status.coachCount} Coaches</span>
                    <span className="ui-chip ui-chip-muted">{pendingInvitations.length} Pending invites</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
                    <p>
                      Current Admin:{" "}
                      {foundationAdmins.map((membership) => profileName(membership.profile)).join(", ") ||
                        currentClubAdmins.map((assignment) => profileName(profileByUser.get(assignment.user_id))).join(", ") ||
                        "Not assigned"}
                    </p>
                    <p>Access status: {foundationAdmins.length > 0 || status.clubAdminCount > 0 ? "Organisation access active" : "Organisation access not configured"}</p>
                  </div>
                  {setupWarnings.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {setupWarnings.map((warning) => (
                        <span className="ui-chip ui-chip-warning" key={warning}>
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <form action={updateOrganisationType} className="flex gap-2">
                  <input name="venueId" type="hidden" value={venue.id} />
                  <select className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={venue.organisation_type} name="organisationType">
                    <option value="academy">Academy</option>
                    <option value="club">Club</option>
                    <option value="school">School</option>
                    <option value="district">District</option>
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

                <CollapsibleCard
                  eyebrow="Overview"
                  summary={`${activeMemberships.length} active members · ${pendingMemberships.length} pending memberships · ${pendingInvitations.length} invitations`}
                  title="Members and invitations"
                >
                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm font-black text-court-navy">Active organisation members</p>
                      <div className="mt-3 grid gap-2">
                        {activeMemberships.length > 0 ? (
                          activeMemberships.slice(0, 8).map((membership) => (
                            <div className="rounded bg-slate-50 p-3" key={membership.id}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-black text-court-navy">{profileName(membership.profile)}</p>
                                <span className="ui-chip ui-chip-brand">{organisationRoleLabel(membership.role)}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{membership.profile?.email ?? "Email unavailable"} · {organisationStatusLabel(membership.status)}</p>
                            </div>
                          ))
                        ) : (
                          <div className="ui-empty-card">No active foundation memberships yet.</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-black text-court-navy">Pending invitations</p>
                      <div className="mt-3 grid gap-2">
                        {pendingInvitations.length > 0 ? (
                          pendingInvitations.slice(0, 8).map((invitation) => (
                            <div className="rounded bg-court-mist p-3" key={invitation.id}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-black text-court-navy">{invitation.invited_name || invitation.invited_email}</p>
                                <span className="ui-chip ui-chip-muted">{organisationRoleLabel(invitation.intended_role)}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-600">{invitationKindLabel(invitation.invitation_kind)} · {invitation.invited_email}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-600">Expires: {new Date(invitation.expires_at).toLocaleString()}</p>
                              <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs font-bold text-court-teal">{invitationLink(invitation.token)}</code>
                              <form action={cancelOrganisationInvitation} className="mt-3 flex flex-wrap items-center gap-2">
                                <input name="invitationId" type="hidden" value={invitation.id} />
                                <label className="text-xs font-semibold text-amber-800">
                                  <input className="mr-1" name="confirmCancel" type="checkbox" /> Confirm cancel
                                </label>
                                <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                                  Cancel Invite
                                </button>
                              </form>
                            </div>
                          ))
                        ) : (
                          <div className="ui-empty-card">No pending invitations.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleCard>

                <CollapsibleCard eyebrow="Settings" summary="Edit organisation information without changing memberships." title="Organisation settings">
                  <form action={updateOrganisationDetails} className="grid gap-3">
                    <input name="venueId" type="hidden" value={venue.id} />
                    <label className="text-sm font-semibold text-slate-700">
                      Name
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.name} name="name" required />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Slug
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.slug} name="slug" required />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Type
                        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.organisation_type} name="organisationType">
                          <option value="academy">Academy</option>
                          <option value="club">Club</option>
                          <option value="school">School</option>
                          <option value="district">District</option>
                          <option value="club_academy">Club and academy</option>
                          <option value="school_district">School/district</option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">
                        Status
                        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.status} name="status">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                    </div>
                    <label className="text-sm font-semibold text-slate-700">
                      Contact email
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.contact_email ?? ""} name="contactEmail" type="email" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Contact phone
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.contact_phone ?? ""} name="contactPhone" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Address
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.address ?? ""} name="address" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Description
                      <textarea className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={venue.description ?? ""} name="description" />
                    </label>
                    <button className="btn-primary" type="submit">
                      Save Organisation
                    </button>
                  </form>
                </CollapsibleCard>

                <CollapsibleCard
                  eyebrow="Assign"
                  summary={`Selected club: ${venue.name} · ${formatLabel(venue.organisation_type)} · Current Club Admin: ${
                    currentClubAdmins.map((assignment) => profileName(profileByUser.get(assignment.user_id))).join(", ") || "not assigned"
                  }`}
                  title="Assign access"
                >
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

                <CollapsibleCard
                  eyebrow="Invite"
                  summary="Create a pending invitation link. Email delivery is not configured here, so copy and share the generated link."
                  title="Invite organisation member"
                >
                  <form action={createOrganisationInvitation} className="grid gap-3">
                    <input name="venueId" type="hidden" value={venue.id} />
                    <label className="text-sm font-semibold text-slate-700">
                      Email
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="email" placeholder="person@example.com" required type="email" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Name
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="invitedName" placeholder="Optional display name" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Phone
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="invitedPhone" placeholder="Optional cellphone" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Intended role
                      <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="intendedRole">
                        <option value="organisation_admin">Organisation Admin</option>
                        <option value="head_coach">Head Coach</option>
                        <option value="coach">Coach</option>
                        <option value="assistant_coach">Assistant Coach</option>
                        <option value="club_manager">Club Manager</option>
                        <option value="sports_coordinator">Sports Coordinator</option>
                        <option value="team_manager">Team Manager</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </label>
                    <button className="btn-primary" type="submit">
                      Create Invite Link
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
