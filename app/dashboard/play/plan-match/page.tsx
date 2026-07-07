import Link from "next/link";
import { createMatchInvite } from "@/app/dashboard/play/actions";
import { PlayerSearchPicker } from "@/app/dashboard/play/player-search-picker";
import { bookingDates, candidateSearchOptions, errorMessage, formatCourtDateLabel, inviteMessage, loadPlayData } from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { BookingIcon, EventIcon, InviteIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

type PlanMatchPageProps = {
  searchParams?: {
    date?: string;
    court?: string;
    invite?: string;
    error?: string;
  };
};

export default async function PlanMatchPage({ searchParams }: PlanMatchPageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return (
      <PageShell eyebrow="Play" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use match planning.</div>
      </PageShell>
    );
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Play" title="Create your Player Profile first.">
        <div className="empty-state">
          <p className="text-slate-700">You need an adult player profile before starting match requests.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const { availableSlots, candidateDetailsByProfileId, candidateRatingsByProfileId, candidates, courts, courtsError, dayStart, ownProfiles, selectedCourtId, selectedDate, selectedProfile, slotBookingError } =
    playData.data;
  const selectedCourt = courts.find((court) => court.id === selectedCourtId) ?? null;
  const playerOptions = candidateSearchOptions(candidates, candidateDetailsByProfileId, candidateRatingsByProfileId);
  const preferredSummary = `${selectedCourt?.name ?? "Court to be confirmed"} · ${formatCourtDateLabel(dayStart)}${availableSlots[0] ? ` · options from ${availableSlots[0].timeLabel}` : ""}`;

  return (
    <PageShell eyebrow="Play" subtitle="Challenge first. Confirm court and time once both players agree." title="Match Invite + Court Booking">
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard/play">
          Back to Play
        </Link>
      </div>
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="mb-5 rounded-lg border border-court-teal/25 bg-court-mist p-4 text-sm leading-6 text-court-navy">
        Send the match request first. Court booking can be confirmed once both players agree. Availability below is a planning aid and does not reserve a court.
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="surface-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
              <BookingIcon size={20} />
            </span>
            <div>
              <p className="section-kicker">Step 1</p>
              <h2 className="section-title mt-1">Preferred court window</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Choose a date and court to preview open 60-minute slots.</p>
            </div>
          </div>

          <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-semibold text-slate-700">
              Date
              <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedDate} name="date">
                {bookingDates().map((date) => (
                  <option key={date.value} value={date.value}>
                    {date.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Court
              <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedCourtId} disabled={courts.length === 0} name="court">
                {courts.length > 0 ? (
                  courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))
                ) : (
                  <option value="">No active courts</option>
                )}
              </select>
            </label>
            <button className="rounded bg-court-blue px-4 py-3 font-bold text-white" type="submit">
              Show slots
            </button>
          </form>

          {courtsError || slotBookingError ? <StatusAlert className="mt-4" message="Court availability could not be loaded right now." tone="error" /> : null}

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2">
              <EventIcon className="mt-0.5 text-court-teal" size={16} />
              <div>
                <p className="font-black text-court-navy">{preferredSummary}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">Mention a preferred option in your message. This page will not reserve the court automatically.</p>
              </div>
            </div>
            {availableSlots.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {availableSlots.slice(0, 8).map((slot) => (
                  <div className="rounded border border-emerald-200 bg-white p-3 text-sm font-bold text-court-navy" key={slot.startTime}>
                    {slot.timeLabel}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">No courts available for this time. Try a nearby time or different court.</div>
            )}
          </div>
        </section>

        <section className="surface-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
              <InviteIcon size={20} />
            </span>
            <div>
              <p className="section-kicker">Step 2</p>
              <h2 className="section-title mt-1">Send match request</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Choose a player and send the request without confirming a booking yet.</p>
            </div>
          </div>

          <form action={createMatchInvite} className="mt-5 grid gap-4">
            <input name="return_to" type="hidden" value="/dashboard/play/plan-match" />
            <input name="booking_mode" type="hidden" value="existing" />
            <input name="preferred_summary" type="hidden" value={preferredSummary} />
            <label className="text-sm font-semibold text-slate-700">
              Challenge from
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" defaultValue={selectedProfile.id} name="inviter_profile_id" required>
                {ownProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.first_name} {profile.last_name}
                    {profile.is_junior ? " (linked junior)" : " (myself)"}
                  </option>
                ))}
              </select>
            </label>
            <PlayerSearchPicker emptyText="No players found yet. Try again once more profiles have joined PlayR." options={playerOptions} />
            <label className="text-sm font-semibold text-slate-700">
              Match type
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="match_type">
                <option value="casual">Casual</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Message <span className="font-normal text-slate-500">(optional)</span>
              <textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="message" placeholder="Want to play? I can do one of the open slots shown here." />
            </label>
            <SubmitButton className="rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Sending request...">
              Send Match Request
            </SubmitButton>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
