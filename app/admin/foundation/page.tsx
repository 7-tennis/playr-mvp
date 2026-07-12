import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import { invitationKindLabel, organisationRoleLabel, organisationStatusLabel, profileName } from "@/lib/organisations";
import type { OrganisationInvitation, OrganisationMembership, OrganisationPlayerLink, CoachPlayerAssignment, Profile, UserActiveOrganisation, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

type FoundationVenue = Pick<
  Venue,
  "id" | "name" | "slug" | "status" | "organisation_type" | "primary_admin_profile_id" | "head_coach_profile_id" | "contact_email" | "contact_phone"
>;
type FoundationMembership = Pick<OrganisationMembership, "id" | "venue_id" | "profile_id" | "user_id" | "role" | "status" | "created_at"> & {
  profile: Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "is_junior"> | null;
};
type FoundationInvitation = Pick<OrganisationInvitation, "id" | "venue_id" | "invitation_kind" | "invited_email" | "invited_name" | "intended_role" | "status" | "expires_at" | "created_at">;
type FoundationPlayerLink = Pick<OrganisationPlayerLink, "id" | "venue_id" | "player_profile_id" | "parent_profile_id" | "status" | "approved_at" | "created_at"> & {
  player: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  parent: Pick<Profile, "id" | "first_name" | "last_name" | "email"> | null;
};
type FoundationCoachAssignment = Pick<CoachPlayerAssignment, "id" | "venue_id" | "coach_profile_id" | "player_profile_id" | "status" | "assigned_at"> & {
  coach: Pick<Profile, "id" | "first_name" | "last_name" | "email"> | null;
  player: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
};
type ActiveOrganisationRow = Pick<UserActiveOrganisation, "user_id" | "venue_id" | "product_context" | "updated_at">;

function compactEmail(value: string | null | undefined) {
  if (!value) {
    return "No email";
  }

  const [name, domain] = value.split("@");
  return domain ? `${name.slice(0, 2)}...@${domain}` : value;
}

function queryError(error: { code?: string; message?: string } | null | undefined) {
  return error ? `${error.code ?? "error"}: ${error.message}` : null;
}

export default async function FoundationDiagnosticsPage() {
  const { adminRole, roleSource, storedRole, supabase, user, venueId } = await getAdminContext();

  if (adminRole !== "platform_admin") {
    console.warn("[playr-foundation]", {
      event: "foundation_diagnostics_restricted",
      resolvedRole: adminRole,
      roleSource,
      storedRole,
      userId: `${user.id.slice(0, 8)}...`,
      venueLinked: Boolean(venueId)
    });

    return (
      <PageShell eyebrow="SupeR UseR" title="Access restricted">
        <AdminNav />
        <section className="empty-state">
          <PrivateIcon size={24} />
          <h2 className="section-title mt-3">Only SupeR UseR accounts can view foundation diagnostics.</h2>
        </section>
      </PageShell>
    );
  }

  const [venuesResult, membershipsResult, invitationsResult, linksResult, assignmentsResult, activeOrgsResult] = await Promise.all([
    supabase
      .from("venues")
      .select("id,name,slug,status,organisation_type,primary_admin_profile_id,head_coach_profile_id,contact_email,contact_phone")
      .order("name", { ascending: true }),
    supabase
      .from("organisation_memberships")
      .select("id,venue_id,profile_id,user_id,role,status,created_at,profile:profile_id(id,user_id,first_name,last_name,email,is_junior)")
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("organisation_invitations")
      .select("id,venue_id,invitation_kind,invited_email,invited_name,intended_role,status,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("organisation_player_links")
      .select("id,venue_id,player_profile_id,parent_profile_id,status,approved_at,created_at,player:player_profile_id(id,first_name,last_name,is_junior),parent:parent_profile_id(id,first_name,last_name,email)")
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("coach_player_assignments")
      .select("id,venue_id,coach_profile_id,player_profile_id,status,assigned_at,coach:coach_profile_id(id,first_name,last_name,email),player:player_profile_id(id,first_name,last_name,is_junior)")
      .order("assigned_at", { ascending: false })
      .limit(600),
    supabase.from("user_active_organisations").select("user_id,venue_id,product_context,updated_at").order("updated_at", { ascending: false }).limit(300)
  ]);

  const errors = [
    queryError(venuesResult.error),
    queryError(membershipsResult.error),
    queryError(invitationsResult.error),
    queryError(linksResult.error),
    queryError(assignmentsResult.error),
    queryError(activeOrgsResult.error)
  ].filter(Boolean);
  const venues = ((venuesResult.data ?? []) as FoundationVenue[]) ?? [];
  const memberships = ((membershipsResult.data ?? []) as unknown as FoundationMembership[]) ?? [];
  const invitations = ((invitationsResult.data ?? []) as FoundationInvitation[]) ?? [];
  const playerLinks = ((linksResult.data ?? []) as unknown as FoundationPlayerLink[]) ?? [];
  const assignments = ((assignmentsResult.data ?? []) as unknown as FoundationCoachAssignment[]) ?? [];
  const activeOrgs = ((activeOrgsResult.data ?? []) as ActiveOrganisationRow[]) ?? [];
  const membershipsByUser = new Map<string, FoundationMembership[]>();

  memberships.forEach((membership) => {
    if (!membership.user_id) {
      return;
    }
    membershipsByUser.set(membership.user_id, [...(membershipsByUser.get(membership.user_id) ?? []), membership]);
  });

  return (
    <PageShell eyebrow="SupeR UseR" subtitle="Read-only foundation health view. Invitation tokens are intentionally hidden." title="Foundation Diagnostics">
      <AdminNav />

      {errors.length > 0 ? (
        <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          <p className="font-black">Some foundation tables could not be read.</p>
          <div className="mt-2 grid gap-1">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <article className="stat-card">
          <ClubIcon size={20} />
          <p className="section-kicker mt-3">Organisations</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{venues.length}</p>
        </article>
        <article className="stat-card">
          <EntriesIcon size={20} />
          <p className="section-kicker mt-3">Active memberships</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{memberships.filter((row) => row.status === "active").length}</p>
        </article>
        <article className="stat-card">
          <StatusIcon size={20} />
          <p className="section-kicker mt-3">Pending invitations</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{invitations.filter((row) => row.status === "pending").length}</p>
        </article>
        <article className="stat-card">
          <PrivateIcon size={20} />
          <p className="section-kicker mt-3">Active player links</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{playerLinks.filter((row) => row.status === "active").length}</p>
        </article>
      </section>

      <section className="grid gap-4">
        {venues.map((venue) => {
          const venueMemberships = memberships.filter((membership) => membership.venue_id === venue.id);
          const venueInvitations = invitations.filter((invitation) => invitation.venue_id === venue.id);
          const venueLinks = playerLinks.filter((link) => link.venue_id === venue.id);
          const venueAssignments = assignments.filter((assignment) => assignment.venue_id === venue.id);
          const primaryAdmin = memberships.find((membership) => membership.profile_id === venue.primary_admin_profile_id)?.profile ?? null;
          const headCoach = memberships.find((membership) => membership.profile_id === venue.head_coach_profile_id)?.profile ?? null;

          return (
            <article className="surface-card p-4 sm:p-5" key={venue.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="section-title">{venue.name}</h2>
                    <span className="ui-chip ui-chip-muted">{formatLabel(venue.organisation_type)}</span>
                    <span className={`ui-chip ${venue.status === "active" ? "ui-chip-success" : "ui-chip-warning"}`}>{formatLabel(venue.status)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{venue.slug}</p>
                  <div className="mt-3 grid gap-1 text-sm font-semibold text-slate-600">
                    <p>Primary admin: {primaryAdmin ? profileName(primaryAdmin) : "Not assigned"}</p>
                    <p>Head coach: {headCoach ? profileName(headCoach) : "Not assigned"}</p>
                    <p>Contact: {compactEmail(venue.contact_email)} · {venue.contact_phone ?? "No phone"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="ui-chip ui-chip-brand">{venueMemberships.filter((row) => row.status === "active").length} Active</span>
                  <span className="ui-chip ui-chip-warning">{venueMemberships.filter((row) => row.status === "pending").length} Pending members</span>
                  <span className="ui-chip ui-chip-muted">{venueInvitations.filter((row) => row.status === "pending").length} Pending invites</span>
                  <span className="ui-chip ui-chip-muted">{venueLinks.filter((row) => row.status === "active").length} Player links</span>
                  <span className="ui-chip ui-chip-muted">{venueAssignments.filter((row) => row.status === "active").length} Assignments</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-black text-court-navy">Membership roles</p>
                  <div className="mt-3 grid gap-2">
                    {venueMemberships.slice(0, 8).map((membership) => (
                      <div className="rounded bg-slate-50 p-3" key={membership.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-court-navy">{profileName(membership.profile)}</p>
                          <span className="ui-chip ui-chip-brand">{organisationRoleLabel(membership.role)}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{organisationStatusLabel(membership.status)} · {compactEmail(membership.profile?.email)}</p>
                      </div>
                    ))}
                    {venueMemberships.length === 0 ? <div className="ui-empty-card">No memberships yet.</div> : null}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-black text-court-navy">Pending invitations</p>
                  <div className="mt-3 grid gap-2">
                    {venueInvitations.filter((invitation) => invitation.status === "pending").slice(0, 8).map((invitation) => (
                      <div className="rounded bg-court-mist p-3" key={invitation.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-court-navy">{invitation.invited_name || compactEmail(invitation.invited_email)}</p>
                          <span className="ui-chip ui-chip-muted">{organisationRoleLabel(invitation.intended_role)}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {invitationKindLabel(invitation.invitation_kind)} · Expires {formatDateTime(invitation.expires_at)}
                        </p>
                      </div>
                    ))}
                    {venueInvitations.filter((invitation) => invitation.status === "pending").length === 0 ? <div className="ui-empty-card">No pending invitations.</div> : null}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-black text-court-navy">Player links</p>
                  <div className="mt-3 grid gap-2">
                    {venueLinks.slice(0, 8).map((link) => (
                      <div className="rounded bg-slate-50 p-3" key={link.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-court-navy">{profileName(link.player)}</p>
                          <span className={`ui-chip ${link.status === "active" ? "ui-chip-success" : "ui-chip-warning"}`}>{formatLabel(link.status)}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">Parent: {profileName(link.parent)} · {link.approved_at ? `Approved ${formatDateTime(link.approved_at)}` : "Awaiting approval"}</p>
                      </div>
                    ))}
                    {venueLinks.length === 0 ? <div className="ui-empty-card">No player links.</div> : null}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-black text-court-navy">Coach-player assignments</p>
                  <div className="mt-3 grid gap-2">
                    {venueAssignments.slice(0, 8).map((assignment) => (
                      <div className="rounded bg-slate-50 p-3" key={assignment.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-court-navy">{profileName(assignment.coach)}</p>
                          <span className={`ui-chip ${assignment.status === "active" ? "ui-chip-success" : "ui-chip-warning"}`}>{formatLabel(assignment.status)}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">Player: {profileName(assignment.player)} · Assigned {formatDateTime(assignment.assigned_at)}</p>
                      </div>
                    ))}
                    {venueAssignments.length === 0 ? <div className="ui-empty-card">No coach-player assignments.</div> : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="surface-card mt-5 p-4 sm:p-5">
        <p className="section-kicker">Active organisation preferences</p>
        <h2 className="section-title mt-1">Selected Organisation Per User</h2>
        <div className="mt-4 grid gap-2">
          {activeOrgs.length > 0 ? (
            activeOrgs.map((row) => {
              const membership = membershipsByUser.get(row.user_id)?.find((item) => item.venue_id === row.venue_id) ?? null;
              const venue = venues.find((item) => item.id === row.venue_id);

              return (
                <div className="rounded-lg border border-slate-200 bg-white p-3" key={`${row.user_id}-${row.venue_id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-court-navy">{profileName(membership?.profile)}</p>
                    <span className="ui-chip ui-chip-muted">{formatLabel(row.product_context)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {venue?.name ?? "Unknown organisation"} · {membership ? organisationRoleLabel(membership.role) : "No matching active membership found"} · Updated {formatDateTime(row.updated_at)}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="ui-empty-card">No user has selected an active organisation yet.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
