import Link from "next/link";
import { createResult, updateMatchVerificationStatus } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { CourtSideEvent, EventResult, MatchVerificationStatus, Profile } from "@/types/courtside";

type EntryPlayer = {
  profile_id: string;
  profiles: Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "member_status"> | null;
};

type ResultRow = EventResult & {
  events: Pick<CourtSideEvent, "title" | "start_datetime"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

type MatchReviewRow = {
  id: string;
  winner_profile_id: string;
  score_text: string;
  verification_status: MatchVerificationStatus;
  submitted_at: string;
  inviter_profile_id: string;
  inviter_first_name: string;
  inviter_last_name: string;
  inviter_is_junior: boolean;
  opponent_profile_id: string;
  opponent_first_name: string;
  opponent_last_name: string;
  opponent_is_junior: boolean;
  booking_start_time: string | null;
  booking_court_name: string | null;
};

type AdminResultsPageProps = {
  searchParams?: {
    event_id?: string;
    error?: string;
    admin_message?: string;
  };
};

export default async function AdminResultsPage({ searchParams }: AdminResultsPageProps) {
  const { supabase } = await getAdminContext();
  const { data: eventData, error: eventsError } = await supabase
    .from("events")
    .select("*")
    .order("start_datetime", { ascending: false });

  const events = (eventData ?? []) as CourtSideEvent[];
  const selectedEventId = searchParams?.event_id || events[0]?.id || "";

  const { data: entryData } = selectedEventId
    ? await supabase
        .from("event_entries")
        .select("profile_id,profiles:profile_id(id,first_name,last_name,is_junior,member_status)")
        .eq("event_id", selectedEventId)
        .neq("entry_status", "cancelled")
        .order("created_at", { ascending: true })
    : { data: [] };

  const entryPlayers = ((entryData ?? []) as unknown as EntryPlayer[])
    .map((entry) => entry.profiles)
    .filter((profile): profile is EntryPlayer["profiles"] & { id: string } => Boolean(profile?.id));

  const { data: profileData } =
    entryPlayers.length === 0
      ? await supabase
          .from("profiles")
          .select("id,first_name,last_name,is_junior,member_status")
          .order("first_name", { ascending: true })
          .limit(200)
      : { data: [] };

  const playerOptions = entryPlayers.length > 0 ? entryPlayers : ((profileData ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "member_status">[]);

  const { data: resultData, error: resultsError } = selectedEventId
    ? await supabase
        .from("event_results")
        .select("*,events:event_id(title,start_datetime),profiles:profile_id(first_name,last_name,is_junior)")
        .eq("event_id", selectedEventId)
        .order("placement", { ascending: true, nullsFirst: false })
    : { data: [], error: null };

  const results = (resultData ?? []) as unknown as ResultRow[];
  const { data: matchReviewData } = await supabase.rpc("matches_for_user");
  const matchReviews = ((matchReviewData ?? []) as MatchReviewRow[]).filter((match) =>
    ["pending_confirmation", "disputed"].includes(match.verification_status)
  );

  return (
    <PageShell eyebrow="ClubR" title="Results">
      <AdminNav />
      <StatusAlert
        className="mb-4"
        message={
          searchParams?.admin_message === "result_saved"
            ? "Result saved."
            : searchParams?.admin_message === "match_updated"
              ? "Match verification updated."
              : null
        }
        tone="success"
      />
      {eventsError || resultsError ? (
        <p className="mb-4 rounded bg-amber-50 p-4 text-sm text-amber-900">Results data could not be loaded right now.</p>
      ) : null}
      {searchParams?.error ? <p className="mb-4 rounded bg-amber-50 p-4 text-sm text-amber-900">Choose an event and player before saving a result.</p> : null}
      <section className="mb-6 rounded-lg border border-court-teal/30 bg-court-mist p-5 text-sm leading-6 text-court-navy">
        <h2 className="text-xl font-black">ClubR result workflow</h2>
        <p className="mt-2">
          Event results are captured separately from Play match results. Match results marked Verified or Admin verified can update PlayR Ratings when they are eligible; Disputed results stay out of ratings until reviewed.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-4">
          <form className="rounded-lg border border-slate-200 bg-white p-5">
            <label className="text-sm font-semibold text-slate-700" htmlFor="event-filter">
              Event
            </label>
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={selectedEventId} id="event-filter" name="event_id">
              {events.length > 0 ? (
                events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))
              ) : (
                <option value="">No events available</option>
              )}
            </select>
            <button className="mt-4 w-full rounded bg-court-blue px-4 py-3 font-bold text-white" type="submit">
              Load event results
            </button>
          </form>

          <form action={createResult} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 md:grid-cols-2">
            <input name="eventId" type="hidden" value={selectedEventId} />
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Player
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" disabled={!selectedEventId || playerOptions.length === 0} name="profileId" required>
                {playerOptions.length > 0 ? (
                  playerOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.first_name} {profile.last_name}
                      {profile.is_junior ? " (junior)" : ""} - {formatLabel(profile.member_status)}
                    </option>
                  ))
                ) : (
                  <option value="">No players available</option>
                )}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Placement
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" min="1" name="placement" type="number" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Points
              <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" min="0" name="points" step="0.01" type="number" />
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Notes
              <textarea className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="result_notes" />
            </label>
            <button className="rounded bg-court-teal px-4 py-3 font-bold text-white disabled:bg-slate-300 md:col-span-2" disabled={!selectedEventId || playerOptions.length === 0} type="submit">
              Save result
            </button>
            <p className="text-xs leading-5 text-slate-500 md:col-span-2">
              {entryPlayers.length > 0
                ? "Player list is based on active entries for the selected event."
                : "No active entries found for this event, so all available player profiles are shown."}
            </p>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-black text-court-navy">Existing results</h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedEventId
                  ? events.find((event) => event.id === selectedEventId)?.title ?? "Selected event"
                  : "Select an event to view results"}
              </p>
            </div>
            {selectedEventId ? (
              <Link className="text-sm font-bold text-court-blue" href={`/admin/events/${selectedEventId}/entries`}>
                View entries
              </Link>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
              {results.map((result) => (
                <div className="grid gap-3 p-4 md:grid-cols-[0.4fr_1fr_0.5fr]" key={result.id}>
                  <div className="text-2xl font-black text-court-navy">{result.placement ?? "-"}</div>
                  <div>
                    <p className="font-bold text-court-ink">
                      {result.profiles ? `${result.profiles.first_name} ${result.profiles.last_name}` : "Profile unavailable"}
                      {result.profiles?.is_junior ? " (junior)" : ""}
                    </p>
                    <p className="text-sm text-slate-600">{result.result_notes ?? "No notes"}</p>
                    {result.events?.start_datetime ? <p className="text-xs text-slate-500">{formatDate(result.events.start_datetime)}</p> : null}
                  </div>
                  <div className="font-bold text-court-ink">{result.points ?? "-"} pts</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No results saved for this event yet.</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-black text-court-navy">Match results needing review</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use Admin verified when the club has checked the score. Use Disputed when the result needs follow-up, or Cancelled when it should not count.
        </p>
        {matchReviews.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {matchReviews.map((match) => {
              const winnerName =
                match.winner_profile_id === match.inviter_profile_id
                  ? `${match.inviter_first_name} ${match.inviter_last_name}${match.inviter_is_junior ? " (junior)" : ""}`
                  : `${match.opponent_first_name} ${match.opponent_last_name}${match.opponent_is_junior ? " (junior)" : ""}`;

              return (
                <article className="rounded border border-slate-200 bg-slate-50 p-4" key={match.id}>
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded bg-court-mist px-2.5 py-1 text-xs font-black uppercase tracking-wide text-court-teal">
                          {formatLabel(match.verification_status)}
                        </span>
                        {match.booking_start_time ? (
                          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-600">
                            {formatDate(match.booking_start_time)}
                          </span>
                        ) : null}
                      </div>
                      <p className="font-black text-court-navy">
                        {match.inviter_first_name} {match.inviter_last_name}
                        {match.inviter_is_junior ? " (junior)" : ""} vs {match.opponent_first_name} {match.opponent_last_name}
                        {match.opponent_is_junior ? " (junior)" : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Winner: {winnerName} / Score: {match.score_text}
                      </p>
                      {match.booking_court_name ? <p className="mt-1 text-sm text-slate-600">{match.booking_court_name}</p> : null}
                    </div>
                    <form action={updateMatchVerificationStatus} className="flex flex-col gap-2 sm:flex-row">
                      <input name="matchId" type="hidden" value={match.id} />
                      <select className="rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue="admin_verified" name="verificationStatus">
                        <option value="admin_verified">Admin verified</option>
                        <option value="verified">Verified</option>
                        <option value="disputed">Disputed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <button className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" type="submit">
                        Save
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No pending or disputed match results need admin review.
          </p>
        )}
      </section>
    </PageShell>
  );
}
