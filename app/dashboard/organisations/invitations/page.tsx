import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { ClubIcon, EntriesIcon, LocationIcon, PrivateIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { invitationKindLabel, organisationRoleLabel } from "@/lib/organisations";
import { getPermissionContext } from "@/lib/permissions";
import type { OrganisationInvitation, Profile, Venue } from "@/types/courtside";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import { acceptOrganisationInvitation, declineOrganisationInvitation } from "./actions";

export const dynamic = "force-dynamic";

type InvitationsPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    token?: string;
    warning?: string;
  };
};

type InvitationWithVenue = OrganisationInvitation & {
  venue: Pick<Venue, "id" | "name" | "slug" | "organisation_type" | "status"> | null;
};

type ProfileOption = Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "parent_profile_id">;

function statusMessage(value?: string) {
  switch (value) {
    case "accepted":
      return "Invitation accepted. Your organisation access is ready.";
    case "connection_accepted":
      return "Connection accepted. The academy can now add this player to lessons.";
    case "connection_already_accepted":
      return "This academy connection is already active.";
    case "declined":
      return "Invitation declined.";
    default:
      return null;
  }
}

function warningMessage(value?: string) {
  if (!value) {
    return null;
  }

  if (value.includes("intended_coach_unavailable") || value.includes("coach_assignment_failed")) {
    return "The academy connection is active, but the proposed coach could not be assigned. An academy leader can assign a coach from Students.";
  }

  if (value.includes("active_organisation_not_updated")) {
    return "The connection is active, but your last-used organisation preference could not be updated.";
  }

  return "The connection is active, with a non-blocking follow-up item for the academy.";
}

function errorMessage(value?: string) {
  switch (value) {
    case "access":
      return "This invitation is for a different signed-in email address.";
    case "adult_profile_required":
      return "Create your adult PlayR profile before accepting this invitation.";
    case "invalid_invitation":
      return "That invitation link could not be found.";
    case "invalid_player":
      return "Choose one of your linked juniors or use the junior details from the invitation.";
    case "invitation_closed":
      return "This invitation is no longer pending.";
    case "invitation_expired":
      return "This invitation has expired.";
    case "accept_failed":
      return "The invitation could not be accepted.";
    case "accepted_connection_missing":
      return "The invitation is marked accepted, but its academy connection needs administrator review.";
    case "decline_failed":
      return "The invitation could not be declined.";
    default:
      return null;
  }
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataObject(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function proposalValue(proposal: Record<string, unknown>, key: string) {
  const value = proposal[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function profileName(profile: Pick<Profile, "first_name" | "last_name">) {
  return `${profile.first_name} ${profile.last_name}`;
}

export default async function OrganisationInvitationsPage({ searchParams }: InvitationsPageProps) {
  const token = searchParams?.token?.trim();

  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="PlayR" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use organisation invitations.</div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/dashboard/organisations/invitations${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const context = await getPermissionContext();

  if (context.kind !== "authenticated") {
    return null;
  }

  const adultProfileResult = context.adultProfileId
    ? await context.supabase
        .from("profiles")
        .select("id,first_name,last_name,is_junior,parent_profile_id")
        .eq("id", context.adultProfileId)
        .maybeSingle()
    : { data: null };
  const juniorProfilesResult = context.adultProfileId
    ? await context.supabase
        .from("profiles")
        .select("id,first_name,last_name,is_junior,parent_profile_id")
        .eq("parent_profile_id", context.adultProfileId)
        .eq("is_junior", true)
        .order("first_name", { ascending: true })
    : { data: [] };

  const invitationQuery = token
    ? context.supabase
        .from("organisation_invitations")
        .select("*,venue:venue_id(id,name,slug,organisation_type,status)")
        .eq("token", token)
        .limit(1)
    : context.supabase
        .from("organisation_invitations")
        .select("*,venue:venue_id(id,name,slug,organisation_type,status)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(40);

  const { data: invitationData, error } = await invitationQuery;
  const invitations = ((invitationData ?? []) as unknown as InvitationWithVenue[]) ?? [];
  const adultProfile = (adultProfileResult.data as ProfileOption | null) ?? null;
  const juniors = ((juniorProfilesResult.data ?? []) as ProfileOption[]) ?? [];

  if (error) {
    console.error("Organisation invitations could not be loaded", { error, userId: context.user.id.slice(0, 8) });
  }

  const coachIds = Array.from(new Set(invitations.map((invitation) => metadataText(invitation.metadata, "coachProfileId")).filter(Boolean)));
  const coachResult = coachIds.length > 0
    ? await context.supabase.from("profiles").select("id,first_name,last_name").in("id", coachIds)
    : { data: [] };
  const coachNames = new Map(((coachResult.data ?? []) as Pick<Profile, "id" | "first_name" | "last_name">[]).map((profile) => [profile.id, profileName(profile)]));

  return (
    <PageShell eyebrow="PlayR" subtitle="Accept organisation access and player-link requests after signing in." title="Organisation Invitations">
      <StatusAlert message={statusMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mt-3" message={warningMessage(searchParams?.warning)} tone="warning" />
      <StatusAlert className="mt-3" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mt-5 grid gap-3">
        {invitations.length > 0 ? (
          invitations.map((invitation) => {
            const playerFirstName = metadataText(invitation.metadata, "playerFirstName");
            const playerLastName = metadataText(invitation.metadata, "playerLastName");
            const proposal = metadataObject(invitation.metadata, "proposal");
            const coachId = metadataText(invitation.metadata, "coachProfileId");
            const isPlayerConnection = invitation.invitation_kind === "player" || invitation.invitation_kind === "player_junior";

            return (
              <article className="surface-card p-4 sm:p-5" key={invitation.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="section-kicker">{invitationKindLabel(invitation.invitation_kind)}</p>
                    <h2 className="section-title mt-1">{invitation.venue?.name ?? "Organisation"}</h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {invitation.invited_name ? `${invitation.invited_name} · ` : ""}
                      {invitation.invited_email}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="ui-chip ui-chip-brand">{organisationRoleLabel(invitation.intended_role)}</span>
                    <span className={`ui-chip ${invitation.status === "accepted" ? "ui-chip-success" : invitation.status === "pending" ? "ui-chip-warning" : "ui-chip-muted"}`}>
                      {invitation.status === "accepted" ? "Connected" : formatLabel(invitation.status)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                  <span className="ui-chip ui-chip-muted">
                    <ClubIcon size={14} /> {formatLabel(invitation.venue?.organisation_type ?? "organisation")}
                  </span>
                  <span className="ui-chip ui-chip-muted">
                    <StatusIcon size={14} /> Expires {formatDateTime(invitation.expires_at)}
                  </span>
                  {invitation.invitation_kind === "player_junior" ? (
                    <span className="ui-chip ui-chip-muted">
                      <EntriesIcon size={14} /> {playerFirstName && playerLastName ? `${playerFirstName} ${playerLastName}` : "Junior details included"}
                    </span>
                  ) : null}
                </div>

                {invitation.invitation_kind === "player_junior" ? (
                  <div className="mt-4 rounded-lg border border-court-teal/20 bg-court-mist p-3 text-sm font-semibold text-court-navy">
                    The organisation is requesting access to coach a junior player. Coaches cannot see unrelated junior data until a parent or guardian accepts.
                  </div>
                ) : null}

                {isPlayerConnection ? (
                  <details className="ui-collapsible mt-4 rounded-lg border border-court-teal/20 bg-court-mist p-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-3">
                      <span><span className="section-kicker block">Academy connection</span><span className="mt-1 block text-sm font-black text-court-navy">{invitation.venue?.name ?? "Academy"} would like to connect with this player.</span></span>
                      <span className="text-xs font-black text-court-teal">Review details</span>
                    </summary>
                    {proposal ? (
                      <div className="mt-4 border-t border-court-teal/15 pt-4">
                        <p className="text-sm font-black text-court-navy">Lesson proposal</p>
                        <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-2">
                          <p className="flex items-center gap-2"><EntriesIcon size={15} /> Coach: {coachNames.get(coachId) ?? "To be confirmed"}</p>
                          <p className="flex items-center gap-2"><StatusIcon size={15} /> {proposalValue(proposal, "lessonType") ? formatLabel(proposalValue(proposal, "lessonType")) : "Lesson type to be confirmed"}</p>
                          <p className="flex items-center gap-2"><TimeIcon size={15} /> {[proposalValue(proposal, "day"), proposalValue(proposal, "startTime"), proposalValue(proposal, "durationMinutes") ? `${proposalValue(proposal, "durationMinutes")} min` : ""].filter(Boolean).join(" · ") || "Schedule to be confirmed"}</p>
                          <p className="flex items-center gap-2"><LocationIcon size={15} /> {proposalValue(proposal, "venue") || "Venue to be confirmed"}</p>
                        </div>
                        {proposalValue(proposal, "startDate") ? <p className="mt-2 text-xs font-semibold text-slate-600">Proposed start: {proposalValue(proposal, "startDate")}</p> : null}
                        {proposalValue(proposal, "notes") ? <p className="mt-2 text-xs leading-5 text-slate-600">{proposalValue(proposal, "notes")}</p> : null}
                        <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">Accepting the academy connection does not confirm payment or a recurring lesson. The proposal remains informational until agreed separately.</p>
                      </div>
                    ) : <p className="mt-2 text-xs font-semibold text-slate-600">No lesson has been proposed yet.</p>}
                  </details>
                ) : null}

                {invitation.status === "pending" && adultProfile ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                    <form action={acceptOrganisationInvitation} className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <input name="token" type="hidden" value={invitation.token} />
                      {invitation.invitation_kind === "player_junior" ? (
                        <label className="text-sm font-semibold text-slate-700">
                          Junior player
                          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="juniorProfileId">
                            <option value="">Use invitation junior details</option>
                            {juniors.map((junior) => (
                              <option key={junior.id} value={junior.id}>
                                {profileName(junior)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <input name="profileId" type="hidden" value={adultProfile.id} />
                      )}
                      <button className="btn-primary" type="submit">
                        {isPlayerConnection ? "Accept Academy Connection" : "Accept"}
                      </button>
                    </form>
                    <form action={declineOrganisationInvitation}>
                      <input name="token" type="hidden" value={invitation.token} />
                      <button className="btn-secondary w-full" type="submit">
                        Decline
                      </button>
                    </form>
                  </div>
                ) : invitation.status === "pending" ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                    Create your private PlayR profile before accepting this invitation.
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="btn-secondary inline-flex" href="/dashboard/profile">
                        Create Profile
                      </a>
                      <form action={declineOrganisationInvitation}>
                        <input name="token" type="hidden" value={invitation.token} />
                        <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                          Decline
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    {invitation.status === "accepted"
                      ? "This academy connection has been accepted. Refreshing or returning through a notification will not create a duplicate connection."
                      : `This invitation is ${formatLabel(invitation.status).toLowerCase()} and no longer needs a response.`}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <section className="empty-state">
            <PrivateIcon size={24} />
            <h2 className="section-title mt-3">No pending invitations</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Organisation access and player-link requests will appear here when they are addressed to your signed-in email.</p>
          </section>
        )}
      </section>
    </PageShell>
  );
}
