import Link from "next/link";
import { submitMatchResult } from "@/app/dashboard/play/actions";
import {
  errorMessage,
  InviteCard,
  inviteMessage,
  loadPlayData,
  playerName,
  resultMessage,
  ResultCard,
  UpcomingMatchCard
} from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/courtside-format";

export const dynamic = "force-dynamic";

type MatchesPageProps = {
  searchParams?: {
    invite?: string;
    result?: string;
    error?: string;
  };
};

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return (
      <PageShell eyebrow="Compete" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use match queues.</div>
      </PageShell>
    );
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Compete" title="Create your Player Profile first.">
        <div className="empty-state">
          <p className="text-slate-700">You need an adult player profile before managing match invites.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const {
    acceptedInvitesWithoutResult,
    awaitingOpponentConfirmations,
    inviteError,
    matchError,
    ownProfileIds,
    pendingConfirmations,
    receivedInvites,
    sentInvites,
    upcomingMatchInvites,
    userId
  } = playData.data;

  return (
    <PageShell eyebrow="Compete" subtitle="Pending, accepted, sent and result-ready matches in one focused queue." title="Upcoming Matches">
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard/compete">
          Back to Compete
        </Link>
      </div>
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="surface-card mb-6 p-5" id="upcoming-matches">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">Upcoming</p>
            <h2 className="section-title mt-2">Match queue</h2>
            <p className="mt-2 text-sm text-slate-600">Pending and accepted matches in one scan.</p>
          </div>
          <Link className="btn-secondary" href="/dashboard/play/invite">
            Send Invite
          </Link>
        </div>
        {upcomingMatchInvites.length > 0 ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {upcomingMatchInvites.map((invite) => (
              <UpcomingMatchCard invite={invite} key={invite.id} ownProfileIds={ownProfileIds} />
            ))}
          </div>
        ) : (
          <div className="ui-empty-card mt-5">No upcoming matches yet. Send a challenge or accept an invite to get started.</div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="grid gap-6">
          <div className="surface-card p-5">
            <h2 className="section-title">Pending result confirmations</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Confirm only when the winner and score are correct. Dispute sends the result to admin review.</p>
            {matchError ? <StatusAlert className="mt-4" message="Match results could not be loaded right now." tone="error" /> : null}
            {pendingConfirmations.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {pendingConfirmations.map((match) => (
                  <ResultCard currentUserId={userId} key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">No match results need your confirmation right now.</div>
            )}
          </div>

          <div className="surface-card p-5" id="submit-result">
            <h2 className="section-title">Submit a result</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Results can be submitted only after an invite is accepted.</p>
            {acceptedInvitesWithoutResult.length > 0 ? (
              <div className="mt-4 grid gap-4">
                {acceptedInvitesWithoutResult.map((invite) => (
                  <form action={submitMatchResult} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-4" key={invite.id}>
                    <input name="return_to" type="hidden" value="/dashboard/play/matches" />
                    <input name="match_invite_id" type="hidden" value={invite.id} />
                    <div>
                      <p className="font-black text-court-navy">
                        {playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)} vs{" "}
                        {playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {invite.booking_start_time ? `${invite.booking_court_name ?? "Court"} / ${formatDateTime(invite.booking_start_time)}` : "No booking linked"}
                      </p>
                    </div>
                    <label className="text-sm font-semibold text-slate-700">
                      Winner
                      <select className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="winner_profile_id" required>
                        <option value={invite.inviter_profile_id}>{playerName(invite.inviter_first_name, invite.inviter_last_name, invite.inviter_is_junior)}</option>
                        <option value={invite.opponent_profile_id}>{playerName(invite.opponent_first_name, invite.opponent_last_name, invite.opponent_is_junior)}</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">
                      Score
                      <input className="mt-2 w-full rounded border border-slate-300 px-3 py-3 focus-ring" name="score_text" placeholder="6-4 6-3" required />
                    </label>
                    <SubmitButton className="rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Submitting result...">
                      Submit result
                    </SubmitButton>
                  </form>
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">Accepted match invites without results will appear here.</div>
            )}
          </div>
        </section>

        <section className="grid gap-6">
          <div className="surface-card p-5" id="received-invites">
            <h2 className="section-title">Received invites</h2>
            {inviteError ? <StatusAlert className="mt-4" message="Match invites could not be loaded right now." tone="error" /> : null}
            {receivedInvites.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {receivedInvites.map((invite) => (
                  <InviteCard currentProfileIds={ownProfileIds} invite={invite} key={invite.id} mode="received" />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">No match invites received yet.</div>
            )}
          </div>

          <div className="surface-card p-5" id="sent-invites">
            <h2 className="section-title">Sent invites</h2>
            {sentInvites.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {sentInvites.map((invite) => (
                  <InviteCard currentProfileIds={ownProfileIds} invite={invite} key={invite.id} mode="sent" />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">No match invites sent yet.</div>
            )}
          </div>

          <div className="surface-card p-5">
            <h2 className="section-title">Submitted results waiting</h2>
            {awaitingOpponentConfirmations.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {awaitingOpponentConfirmations.map((match) => (
                  <ResultCard currentUserId={userId} key={match.id} match={match} />
                ))}
              </div>
            ) : (
              <div className="ui-empty-card mt-4">Results you submit will sit here until the other side confirms or disputes them.</div>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
