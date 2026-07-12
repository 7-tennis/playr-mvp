import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { ClubIcon, EntriesIcon, PrivateIcon, StatusIcon } from "@/components/playr-icons";
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
    case "declined":
      return "Invitation declined.";
    default:
      return null;
  }
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

  return (
    <PageShell eyebrow="PlayR" subtitle="Accept organisation access and player-link requests after signing in." title="Organisation Invitations">
      <StatusAlert message={statusMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mt-3" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mt-5 grid gap-3">
        {invitations.length > 0 ? (
          invitations.map((invitation) => {
            const playerFirstName = metadataText(invitation.metadata, "playerFirstName");
            const playerLastName = metadataText(invitation.metadata, "playerLastName");

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
                  <span className="ui-chip ui-chip-brand">{organisationRoleLabel(invitation.intended_role)}</span>
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

                {adultProfile ? (
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
                        Accept
                      </button>
                    </form>
                    <form action={declineOrganisationInvitation}>
                      <input name="token" type="hidden" value={invitation.token} />
                      <button className="btn-secondary w-full" type="submit">
                        Decline
                      </button>
                    </form>
                  </div>
                ) : (
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
