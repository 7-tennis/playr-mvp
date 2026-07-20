import Link from "next/link";
import {
  countLabel,
  errorMessage,
  inviteMessage,
  loadPlayData,
  profileRatingLabel,
  resultMessage,
  SuggestionCard
} from "@/app/dashboard/play/play-shared";
import { PageShell } from "@/components/page-shell";
import { ChallengeIcon, CloseMatchIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";

export const dynamic = "force-dynamic";

type ChallengesPageProps = {
  searchParams?: {
    player?: string;
    invite?: string;
    result?: string;
    error?: string;
  };
};

export default async function ChallengesPage({ searchParams }: ChallengesPageProps) {
  const playData = await loadPlayData(searchParams);

  if (playData.kind === "no-config") {
    return (
      <PageShell eyebrow="Compete" title="Supabase is not configured.">
        <div className="ui-empty-card">Add Supabase environment variables to use challenges.</div>
      </PageShell>
    );
  }

  if (playData.kind === "no-profile") {
    return (
      <PageShell eyebrow="Compete" title="Create your Player Profile first.">
        <div className="empty-state">
          <p className="text-slate-700">You need an adult player profile before sending challenges.</p>
          <Link className="btn-primary mt-5" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const { candidateDetailsByProfileId, candidateRatingsByProfileId, closeSuggestions, ownProfiles, ownRatingsByProfileId, selectedProfile, strongerSuggestions } = playData.data;

  return (
    <PageShell eyebrow="Compete" subtitle="Find a balanced match or test yourself against a stronger player." title="Challenge Players">
      <div className="mb-5">
        <Link className="font-bold text-court-blue" href="/dashboard/compete">
          Back to Compete
        </Link>
      </div>
      <StatusAlert className="mb-5" message={inviteMessage(searchParams?.invite)} tone="success" />
      <StatusAlert className="mb-5" message={resultMessage(searchParams?.result)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />

      <section className="surface-card mb-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">Challenge as</p>
            <h2 className="section-title mt-2">
              {selectedProfile.first_name} {selectedProfile.last_name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Suggestions use existing rating and stage data. Rating movement is estimated.</p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-96">
            <label className="text-sm font-semibold text-slate-700">
              Player
              <select className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-3 focus-ring" defaultValue={selectedProfile.id} name="player">
                {ownProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.first_name} {profile.last_name} · {profileRatingLabel(profile, ownRatingsByProfileId)}
                  </option>
                ))}
              </select>
            </label>
            <button className="self-end rounded bg-court-blue px-4 py-3 font-bold text-white transition hover:bg-blue-700" type="submit">
              Update
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-court-navy">Close Match</h2>
              <p className="mt-1 text-sm text-slate-600">A balanced challenge near your level.</p>
            </div>
            <span className="ui-chip ui-chip-success">
              <CloseMatchIcon size={14} /> {countLabel(closeSuggestions.length, "match", "matches")}
            </span>
          </div>
          {closeSuggestions.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {closeSuggestions.map((candidate) => (
                <SuggestionCard
                  candidate={candidate}
                  detailsByProfileId={candidateDetailsByProfileId}
                  key={candidate.id}
                  ratingsByProfileId={candidateRatingsByProfileId}
                  selectedProfile={selectedProfile}
                  type="close"
                />
              ))}
            </div>
          ) : (
            <div className="ui-empty-card mt-3">No close matches found yet. Try another linked player.</div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-court-navy">Stronger Challenge</h2>
              <p className="mt-1 text-sm text-slate-600">Test yourself against a stronger player.</p>
            </div>
            <span className="ui-chip ui-chip-navy">
              <ChallengeIcon size={14} /> {countLabel(strongerSuggestions.length, "match", "matches")}
            </span>
          </div>
          {strongerSuggestions.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {strongerSuggestions.map((candidate) => (
                <SuggestionCard
                  candidate={candidate}
                  detailsByProfileId={candidateDetailsByProfileId}
                  key={candidate.id}
                  ratingsByProfileId={candidateRatingsByProfileId}
                  selectedProfile={selectedProfile}
                  type="stronger"
                />
              ))}
            </div>
          ) : (
            <div className="ui-empty-card mt-3">No stronger challenges available right now. Check back later or choose another linked player.</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
