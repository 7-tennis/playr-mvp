import { CollapsibleCard } from "@/components/collapsible-card";
import { EntriesIcon, PrivateIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime } from "@/lib/courtside-format";
import { loadCoachLessons, profileDisplayName } from "@/lib/coach-lessons";
import { invitationLink, organisationRoleLabel } from "@/lib/organisations";
import { normalizeStoredRole, roleLabel } from "@/lib/permissions";
import type { AdminUser, OrganisationInvitation, OrganisationMembership, OrganisationRole, Profile } from "@/types/courtside";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";
import { assignVenueCoach, cancelVenueCoachInvitation, deactivateVenueCoach, inviteVenueCoach } from "./actions";

export const dynamic = "force-dynamic";

type CoachesPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    q?: string;
    token?: string;
  };
};

type Assignment = Pick<AdminUser, "id" | "user_id" | "role" | "venue_id" | "assigned_at" | "deactivated_at">;
type AdultProfile = Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "is_junior">;
type FoundationCoachMembership = Pick<OrganisationMembership, "id" | "user_id" | "venue_id" | "role" | "status" | "accepted_at" | "created_at"> & {
  profile: AdultProfile | null;
};
type CoachInvitation = Pick<OrganisationInvitation, "id" | "invited_email" | "invited_name" | "intended_role" | "status" | "token" | "expires_at" | "created_at">;
type CoachCard = {
  active: boolean;
  assignedAt: string | null;
  key: string;
  membershipId: string | null;
  profile: AdultProfile | null;
  roleLabel: string;
  stats: { lessons: number; nextLesson: string | null; students: Set<string> } | null | undefined;
  userId: string | null;
  venueLinked: boolean;
};

function profileName(profile: AdultProfile | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile missing";
}

function statusMessage(message?: string) {
  switch (message) {
    case "coach_assigned":
      return "Coach access assigned. The coach can access CoachR after refreshing their session.";
    case "coach_deactivated":
      return "Coach access deactivated.";
    case "coach_invited":
      return "Coach invitation created. Copy and share this secure link with the invited coach.";
    case "invitation_cancelled":
      return "Invitation cancelled.";
    default:
      return null;
  }
}

function errorMessage(error?: string) {
  switch (error) {
    case "access":
      return "Only Head Coaches and authorised venue managers can manage coaches here.";
    case "adult_profile_required":
      return "Select a user with a valid adult PlayR profile.";
    case "confirm_required":
      return "Confirm the access change before saving.";
    case "protected_role":
      return "That user has a protected role and cannot be changed here.";
    case "assign_failed":
      return "Coach access could not be assigned.";
    case "duplicate_invitation":
      return "A pending invitation already exists for that coach email and role.";
    case "invite_failed":
      return "Coach invitation could not be created.";
    case "invitation_cancel_failed":
      return "Coach invitation could not be cancelled.";
    case "invitation_closed":
      return "That invitation is no longer pending.";
    case "invalid_role":
      return "That coaching role cannot be assigned from this page.";
    case "deactivate_failed":
      return "Coach access could not be deactivated.";
    default:
      return null;
  }
}

function setupChips({
  active,
  lessonCount,
  profile,
  studentCount,
  venueLinked
}: {
  active: boolean;
  lessonCount: number;
  profile: AdultProfile | null | undefined;
  studentCount: number;
  venueLinked: boolean;
}) {
  return [
    { label: profile?.user_id ? "Account exists" : "Missing account", tone: profile?.user_id ? "ui-chip-success" : "ui-chip-warning" },
    { label: profile ? "Adult profile" : "Missing profile", tone: profile ? "ui-chip-success" : "ui-chip-warning" },
    { label: venueLinked ? "Venue linked" : "Missing venue", tone: venueLinked ? "ui-chip-success" : "ui-chip-warning" },
    { label: active ? "Access active" : "Access inactive", tone: active ? "ui-chip-success" : "ui-chip-warning" },
    { label: studentCount > 0 ? `${studentCount} students` : "No students", tone: studentCount > 0 ? "ui-chip-brand" : "ui-chip-muted" },
    { label: lessonCount > 0 ? "Schedule ready" : "No lessons", tone: lessonCount > 0 ? "ui-chip-brand" : "ui-chip-muted" }
  ];
}

function legacyAssignmentRoleLabel(assignment: Assignment) {
  return roleLabel(normalizeStoredRole(assignment.role));
}

export default async function CoachRCoachesPage({ searchParams }: CoachesPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:coaches");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const context = access.context;
  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const [lessons, assignmentsResult, foundationMembershipsResult, coachInvitationsResult, adultProfilesResult] = await Promise.all([
    loadCoachLessons(context, 240),
    context.role === "platform_admin"
      ? context.supabase.from("admin_users").select("id,user_id,role,venue_id,assigned_at,deactivated_at").in("role", ["coach", "head_coach"]).order("created_at", { ascending: false })
      : context.supabase
          .from("admin_users")
          .select("id,user_id,role,venue_id,assigned_at,deactivated_at")
          .eq("venue_id", context.venueId)
          .in("role", ["coach", "head_coach"])
          .order("created_at", { ascending: false }),
    context.role === "platform_admin"
      ? context.supabase
          .from("organisation_memberships")
          .select("id,user_id,venue_id,role,status,accepted_at,created_at,profile:profile_id(id,user_id,first_name,last_name,email,is_junior)")
          .in("role", ["head_coach", "coach", "assistant_coach"])
          .in("status", ["active", "suspended"])
          .order("created_at", { ascending: false })
      : context.venueId
        ? context.supabase
            .from("organisation_memberships")
            .select("id,user_id,venue_id,role,status,accepted_at,created_at,profile:profile_id(id,user_id,first_name,last_name,email,is_junior)")
            .eq("venue_id", context.venueId)
            .in("role", ["head_coach", "coach", "assistant_coach"])
            .in("status", ["active", "suspended"])
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    context.role === "platform_admin"
      ? context.supabase
          .from("organisation_invitations")
          .select("id,invited_email,invited_name,intended_role,status,token,expires_at,created_at")
          .eq("invitation_kind", "coach")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(120)
      : context.venueId
        ? context.supabase
            .from("organisation_invitations")
            .select("id,invited_email,invited_name,intended_role,status,token,expires_at,created_at")
            .eq("venue_id", context.venueId)
            .eq("invitation_kind", "coach")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(80)
        : Promise.resolve({ data: [], error: null }),
    context.supabase
      .from("profiles")
      .select("id,user_id,first_name,last_name,email,is_junior")
      .eq("is_junior", false)
      .not("user_id", "is", null)
      .order("first_name", { ascending: true })
      .limit(240)
  ]);
  const assignments = ((assignmentsResult.data ?? []) as Assignment[]) ?? [];
  const foundationMemberships = ((foundationMembershipsResult.data ?? []) as unknown as FoundationCoachMembership[]) ?? [];
  const coachInvitations = ((coachInvitationsResult.data ?? []) as CoachInvitation[]) ?? [];
  const adultProfiles = ((adultProfilesResult.data ?? []) as AdultProfile[]) ?? [];
  const profilesByUser = new Map(adultProfiles.map((profile) => [profile.user_id, profile]));
  const lessonStats = new Map<string, { lessons: number; nextLesson: string | null; students: Set<string> }>();

  lessons.forEach((lesson) => {
    const stats = lessonStats.get(lesson.coach_id) ?? { lessons: 0, nextLesson: null, students: new Set<string>() };
    stats.lessons += 1;
    stats.students.add(lesson.player_id);
    if (lesson.status === "scheduled" && (!stats.nextLesson || new Date(lesson.start_time).getTime() < new Date(stats.nextLesson).getTime())) {
      stats.nextLesson = lesson.start_time;
    }
    lessonStats.set(lesson.coach_id, stats);
  });

  const seenCoachKeys = new Set<string>();
  const foundationCoachCards: CoachCard[] = foundationMemberships.map((membership) => {
    const profile = membership.profile ?? (membership.user_id ? profilesByUser.get(membership.user_id) : null) ?? null;
    const stats = profile ? lessonStats.get(profile.id) : null;
    const key = `${membership.venue_id}:${membership.user_id ?? profile?.id}:${membership.role}`;
    seenCoachKeys.add(key);
    return {
      active: membership.status === "active",
      assignedAt: membership.accepted_at ?? membership.created_at,
      key: `foundation-${membership.id}`,
      membershipId: membership.id,
      profile,
      roleLabel: organisationRoleLabel(membership.role),
      stats,
      userId: membership.user_id ?? profile?.user_id ?? null,
      venueLinked: Boolean(membership.venue_id)
    };
  });
  const legacyCoachCards: CoachCard[] = assignments
    .filter((assignment) => !seenCoachKeys.has(`${assignment.venue_id}:${assignment.user_id}:${assignment.role}`))
    .map((assignment) => {
      const profile = profilesByUser.get(assignment.user_id) ?? null;
      const stats = profile ? lessonStats.get(profile.id) : null;
      return {
        active: !assignment.deactivated_at,
        assignedAt: assignment.assigned_at,
        key: `legacy-${assignment.id}`,
        membershipId: null,
        profile,
        roleLabel: legacyAssignmentRoleLabel(assignment),
        stats,
        userId: assignment.user_id,
        venueLinked: Boolean(assignment.venue_id)
      };
    });
  const coachCards = [...foundationCoachCards, ...legacyCoachCards]
    .filter((card) => (query ? `${profileName(card.profile)} ${card.profile?.email ?? ""}`.toLowerCase().includes(query) : true));
  const searchableProfiles = query
    ? adultProfiles.filter((profile) => `${profile.first_name} ${profile.last_name} ${profile.email ?? ""}`.toLowerCase().includes(query))
    : adultProfiles.slice(0, 40);
  const canAssignHere = context.role === "head_coach" || context.role === "club_admin" || context.role === "platform_admin";

  return (
    <CoachRPageFrame context={context} subtitle="Manage coaches linked to your permitted venue." title="Manage Coaches">
      <CoachRRoleSummary context={context} />

      {statusMessage(searchParams?.message) ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{statusMessage(searchParams?.message)}</div>
      ) : null}
      {errorMessage(searchParams?.error) ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{errorMessage(searchParams?.error)}</div>
      ) : null}
      {searchParams?.token ? (
        <div className="mb-5 rounded-lg border border-court-teal/30 bg-court-mist p-3 text-sm font-bold text-court-navy">
          Coach invite link: <code className="break-all rounded bg-white px-2 py-1 text-court-teal">{invitationLink(searchParams.token)}</code>
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="stat-card">
          <EntriesIcon size={20} />
          <p className="section-kicker mt-3">Coaches</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{coachCards.length}</p>
        </article>
        <article className="stat-card">
          <StatusIcon size={20} />
          <p className="section-kicker mt-3">Active</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{coachCards.filter((card) => card.active).length}</p>
        </article>
        <article className="stat-card">
          <PrivateIcon size={20} />
          <p className="section-kicker mt-3">Role</p>
          <p className="mt-2 text-2xl font-black text-court-navy">{roleLabel(context.role)}</p>
        </article>
      </section>

      <CollapsibleCard defaultOpen={Boolean(query)} eyebrow="Find" summary="Search existing PlayR users, then assign coach access for this venue." title="Search and add coach">
        <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" method="get">
          <input className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Name or email" />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
        {canAssignHere ? (
          <form action={assignVenueCoach} className="grid gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Existing adult PlayR profile
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profileId" required>
                <option value="">Choose profile</option>
                {searchableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileName(profile)} · {profile.email ?? "No email"}
                  </option>
                ))}
              </select>
            </label>
            <label className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <input className="mr-2" name="confirmAssignment" type="checkbox" />
              Confirm coach access for this venue
            </label>
            <button className="btn-primary" type="submit">
              Add Coach
            </button>
          </form>
        ) : (
          <div className="ui-empty-card">Use SupeR UseR organisation access to assign coaches without a venue-scoped role.</div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        eyebrow="Invite"
        summary="Invite a coach by email. They accept after signing in, and CoachR access is created for this organisation."
        title="Invite Coach"
      >
        {canAssignHere ? (
          <form action={inviteVenueCoach} className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Email
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="email" placeholder="coach@example.com" required type="email" />
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
              Role
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="intendedRole">
                {context.activeOrganisationRole === "organisation_admin" || context.activeOrganisationRole === "club_manager" || context.role === "platform_admin" ? (
                  <option value="head_coach">{organisationRoleLabel("head_coach")}</option>
                ) : null}
                <option value="coach">{organisationRoleLabel("coach")}</option>
                <option value="assistant_coach">{organisationRoleLabel("assistant_coach")}</option>
              </select>
            </label>
            <button className="btn-primary md:col-span-2" type="submit">
              Create Coach Invite
            </button>
          </form>
        ) : (
          <div className="ui-empty-card">Only Head Coaches and organisation administrators can invite coaches here.</div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        eyebrow="Pending"
        summary={`${coachInvitations.length} coach invitations awaiting acceptance. Links must be shared manually.`}
        title="Pending Coach Invitations"
      >
        {coachInvitations.length > 0 ? (
          <div className="grid gap-3">
            {coachInvitations.map((invitation) => (
              <article className="rounded-lg border border-slate-200 bg-court-mist p-3" key={invitation.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-court-navy">{invitation.invited_name || invitation.invited_email}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{invitation.invited_email}</p>
                  </div>
                  <span className="ui-chip ui-chip-muted">{organisationRoleLabel(invitation.intended_role)}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">Expires: {formatDateTime(invitation.expires_at)}</p>
                <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs font-bold text-court-teal">{invitationLink(invitation.token)}</code>
                <form action={cancelVenueCoachInvitation} className="mt-3 flex flex-wrap items-center gap-2">
                  <input name="invitationId" type="hidden" value={invitation.id} />
                  <label className="text-xs font-semibold text-amber-800">
                    <input className="mr-1" name="confirmCancel" type="checkbox" /> Confirm cancel
                  </label>
                  <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                    Cancel Invite
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="ui-empty-card">No pending coach invitations.</div>
        )}
      </CollapsibleCard>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {coachCards.length > 0 ? (
          coachCards.map(({ active, assignedAt, key, membershipId, profile, roleLabel: coachRoleLabel, stats, userId, venueLinked }) => {
            const chips = setupChips({
              active,
              lessonCount: stats?.lessons ?? 0,
              profile,
              studentCount: stats?.students.size ?? 0,
              venueLinked
            });

            return (
              <details className="ui-collapsible surface-card p-4 sm:p-5" key={key}>
                <summary className="flex cursor-pointer flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="section-title">{profileName(profile)}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{coachRoleLabel} · {stats?.nextLesson ? `Next ${formatDateTime(stats.nextLesson)}` : "No upcoming lesson"}</p>
                  </div>
                  <span className={`ui-chip ${active ? "ui-chip-success" : "ui-chip-warning"}`}>{active ? "Ready" : "Access inactive"}</span>
                </summary>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold text-slate-600">{profile?.email ?? "Email unavailable"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  {chips.map((chip) => (
                    <span className={`ui-chip ${chip.tone}`} key={chip.label}>
                      {chip.label}
                    </span>
                  ))}
                  </div>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
                  <p>Assigned: {assignedAt ? formatDateTime(assignedAt) : "To be confirmed"}</p>
                  <p>Next lesson: {stats?.nextLesson ? formatDateTime(stats.nextLesson) : "No upcoming lesson"}</p>
                </div>
                {profile ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a className="btn-secondary px-3 py-2" href={`/dashboard/coachr/schedule?coach=${profile.id}`}>
                      <TimeIcon size={14} /> Schedule
                    </a>
                    <a className="btn-secondary px-3 py-2" href={`/dashboard/coachr/students?coach=${profile.id}`}>
                      <EntriesIcon size={14} /> Students
                    </a>
                  </div>
                ) : null}
                {active && canAssignHere && userId ? (
                  <form action={deactivateVenueCoach} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    {membershipId ? <input name="membershipId" type="hidden" value={membershipId} /> : <input name="targetUserId" type="hidden" value={userId} />}
                    <label className="text-xs font-semibold text-amber-800">
                      <input className="mr-1" name="confirmDeactivate" type="checkbox" /> Confirm deactivate
                    </label>
                    <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                      Deactivate Access
                    </button>
                  </form>
                ) : null}
                </div>
              </details>
            );
          })
        ) : (
          <div className="ui-empty-card md:col-span-2">No coaches linked to this venue yet.</div>
        )}
      </section>
    </CoachRPageFrame>
  );
}
