import Link from "next/link";
import { redirect } from "next/navigation";
import { createJuniorProfile, updateJuniorProfile } from "@/app/dashboard/juniors/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { JuniorStage, PlayerLevel, Profile, Sport } from "@/types/courtside";

export const dynamic = "force-dynamic";

const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const playerLevels: PlayerLevel[] = ["beginner", "social", "intermediate", "club_competitive", "advanced", "unknown"];
const juniorStages: { value: JuniorStage; label: string }[] = [
  { value: "red_ball", label: "Red Ball" },
  { value: "orange_ball", label: "Orange Ball" },
  { value: "green_ball", label: "Green Ball" },
  { value: "yellow_ball", label: "Yellow Ball" },
  { value: "not_sure", label: "Not sure yet" }
];

function JuniorFields({ junior }: { junior?: Profile }) {
  return (
    <>
      <label className="text-sm font-semibold text-slate-700">
        First name <span className="font-normal text-slate-500">(required)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.first_name ?? ""} name="first_name" required type="text" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Last name <span className="font-normal text-slate-500">(required)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.last_name ?? ""} name="last_name" required type="text" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Date of birth <span className="font-normal text-slate-500">(optional)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.date_of_birth ?? ""} name="date_of_birth" type="date" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Cellphone number <span className="font-normal text-slate-500">(optional)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.phone ?? ""} name="phone" type="tel" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Primary sport
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.primary_sport ?? "tennis"} name="primary_sport">
          {sports.map((sport) => (
            <option key={sport} value={sport}>
              {formatLabel(sport)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Junior stage
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.junior_stage ?? "not_sure"} name="junior_stage">
          {juniorStages.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Player level
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={junior?.player_level ?? "unknown"} name="player_level">
          {playerLevels.map((level) => (
            <option key={level} value={level}>
              {formatLabel(level)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700 md:col-span-2">
        Notes <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          className="mt-2 min-h-20 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
          defaultValue={junior?.notes ?? ""}
          name="notes"
          placeholder="Optional parent/guardian notes, school context, or medical notes."
        />
      </label>
    </>
  );
}

export default async function JuniorsPage({ searchParams }: { searchParams?: { error?: string; saved?: string } }) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Junior Players" title="Supabase is not configured.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Add Supabase environment variables to create or edit linked junior profiles.</p>
        </div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: parentProfileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const parentProfile = parentProfileData as Profile | null;

  if (!parentProfile) {
    return (
      <PageShell eyebrow="Junior Players" title="Create your Player Profile first.">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Your own player profile is needed before junior profiles can be linked to your account.</p>
          <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard/profile">
            Create my profile
          </Link>
        </div>
      </PageShell>
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("parent_profile_id", parentProfile.id)
    .eq("is_junior", true)
    .order("first_name", { ascending: true });

  const juniors = (data ?? []) as Profile[];

  return (
    <PageShell eyebrow="Junior Players" title="Junior Players">
      <StatusAlert className="mb-5" message={searchParams?.saved ? "Junior profile saved." : null} tone="success" />
      <StatusAlert
        className="mb-5"
        message={
          searchParams?.error === "missing_name"
            ? "First name and last name are required."
            : searchParams?.error === "save_failed"
              ? "Junior profile could not be saved. Please try again."
              : null
        }
        tone="error"
      />
      <section className="mb-6 rounded-lg border border-court-teal/30 bg-court-mist p-5 text-sm leading-6 text-court-navy">
        <h2 className="text-xl font-black">Family & Junior Players</h2>
        <p className="mt-2">
          Junior players are managed by your parent/guardian account. PlayR uses them for court bookings, event entries, match invites, junior progress, and important club communication. Junior players do not get separate login accounts yet.
        </p>
      </section>
      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <form action={createJuniorProfile} className="surface-card grid gap-4 p-5 sm:p-6 md:grid-cols-2">
          <h2 className="section-title">Add junior player</h2>
          <p className="text-sm leading-6 text-slate-600 md:col-span-2">
            Junior players are linked to {parentProfile.first_name} {parentProfile.last_name} and can be selected when booking courts, entering events, or sending match invites.
          </p>
          <JuniorFields />
          <SubmitButton className="rounded bg-court-teal px-4 py-3 font-bold text-white md:col-span-2" pendingText="Adding junior...">
            Add junior
          </SubmitButton>
        </form>
        <div className="surface-card p-5 sm:p-6">
          <h2 className="section-title">Linked juniors</h2>
          {error ? <p className="mt-3 rounded bg-amber-50 p-4 text-sm text-amber-900">Junior profiles could not be loaded right now.</p> : null}
          {juniors.length > 0 ? (
            <div className="mt-5 space-y-5">
              {juniors.map((junior) => (
                <form action={updateJuniorProfile} className="grid gap-4 rounded border border-slate-200 p-4 md:grid-cols-2" key={junior.id}>
                  <input name="junior_profile_id" type="hidden" value={junior.id} />
                  <div className="md:col-span-2">
                    <p className="font-black text-court-navy">
                      {junior.first_name} {junior.last_name}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatLabel(junior.member_status)} / {formatLabel(junior.primary_sport)} / {junior.junior_stage ? formatLabel(junior.junior_stage) : "Stage not set"}
                    </p>
                    <div className="mt-3 grid gap-2 rounded bg-court-mist p-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xl font-black text-court-navy">{formatJuniorRating(junior.junior_stage, junior.junior_rating)}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-court-teal">
                          {formatLabel(junior.junior_rating_confidence)} confidence{junior.rating_locked ? " / Locked" : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-black text-court-navy">{junior.participation_score}</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Participation score</p>
                      </div>
                      <div>
                        <p className="text-xl font-black text-court-navy">{junior.stage_readiness_score}%</p>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Stage readiness</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                      <p className="rounded bg-slate-50 p-2"><span className="font-black text-court-navy">{junior.matches_played}</span> matches</p>
                      <p className="rounded bg-slate-50 p-2"><span className="font-black text-court-navy">{junior.wins}</span> wins</p>
                      <p className="rounded bg-slate-50 p-2"><span className="font-black text-court-navy">{junior.losses}</span> losses</p>
                      <p className="rounded bg-slate-50 p-2"><span className="font-black text-court-navy">{junior.events_played}</span> events</p>
                    </div>
                  </div>
                  <JuniorFields junior={junior} />
                  <SubmitButton className="rounded bg-court-blue px-4 py-3 font-bold text-white md:col-span-2" pendingText="Saving junior...">
                    Save junior
                  </SubmitButton>
                </form>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              No junior players linked yet. Add a junior player to book courts, enter events, and track progress for your child.
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
