import Link from "next/link";
import { createMatchInvite } from "@/app/dashboard/play/actions";
import { PlayerSearchPicker } from "@/app/dashboard/play/player-search-picker";
import { candidateSearchOptions, errorMessage, formatBookingLabel, inviteMessage, loadPlayData } from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { BookingIcon, InviteIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

type PlayInvitePageProps = {
  searchParams?: {
    invite?: string;
    error?: string;
  };
};

export default async function PlayInvitePage({ searchParams }: PlayInvitePageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return (
      <PageShell eyebrow="Play" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use match invites.</div>
      </PageShell>
    );
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Play" title="Create your Player Profile first.">
        <div className="empty-state">
          <p className="text-slate-700">You need an adult player profile before sending match invites.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const { bookings, candidateDetailsByProfileId, candidateRatingsByProfileId, candidates, ownProfiles, selectedProfile } = playData.data;
  const playerOptions = candidateSearchOptions(candidates, candidateDetailsByProfileId, candidateRatingsByProfileId);

  return (
    <PageShell eyebrow="Play" subtitle="Use an existing court booking and invite someone to join it." title="New Invite">
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard/play">
          Back to Play
        </Link>
      </div>
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      {bookings.length === 0 ? (
        <section className="empty-state">
          <BookingIcon className="mx-auto text-court-teal" size={28} />
          <h2 className="section-title mt-3">No upcoming bookings found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Book a court first, or start a match request and agree on the court once your opponent accepts.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="btn-primary" href="/dashboard/book-court">
              Book Court
            </Link>
            <Link className="btn-secondary" href="/dashboard/play/plan-match">
              Start Match Request
            </Link>
          </div>
        </section>
      ) : (
        <form action={createMatchInvite} className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <input name="return_to" type="hidden" value="/dashboard/play/invite" />
          <input name="booking_mode" type="hidden" value="existing" />

          <section className="surface-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
                <BookingIcon size={20} />
              </span>
              <div>
                <p className="section-kicker">Step 1</p>
                <h2 className="section-title mt-1">Choose booking</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Pick the confirmed court booking this invite should use.</p>
              </div>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Existing booking
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="booking_id" required>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {formatBookingLabel(booking)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Invite from
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={selectedProfile.id} name="inviter_profile_id" required>
                {ownProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.first_name} {profile.last_name}
                    {profile.is_junior ? " (linked junior)" : " (myself)"}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="surface-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
                <InviteIcon size={20} />
              </span>
              <div>
                <p className="section-kicker">Step 2</p>
                <h2 className="section-title mt-1">Choose opponent</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Search locally from available player profiles, then add a short message.</p>
              </div>
            </div>
            <div className="mt-5">
              <PlayerSearchPicker emptyText="No players found yet. Try again once more profiles have joined PlayR." options={playerOptions} />
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Match type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="match_type">
                <option value="casual">Casual</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Message <span className="font-normal text-slate-500">(optional)</span>
              <textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="message" placeholder="Want to play on this booking?" />
            </label>
            <SubmitButton className="mt-5 w-full rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Sending invite...">
              Send Invite
            </SubmitButton>
          </section>
        </form>
      )}
    </PageShell>
  );
}
