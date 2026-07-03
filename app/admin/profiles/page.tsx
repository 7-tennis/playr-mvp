import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { awardJuniorAchievement, transitionJuniorStage, updateJuniorRatingControls, updateProfileMemberStatus } from "@/app/admin/actions";
import { formatDate, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { JuniorAchievement, JuniorRatingHistory, JuniorStage, MemberStatus, Profile, Rating } from "@/types/courtside";

type AdminProfile = Profile & {
  parent: Pick<Profile, "first_name" | "last_name"> | null;
  ratings: Pick<Rating, "rating_value" | "confidence" | "verified_match_count" | "provisional">[] | Pick<Rating, "rating_value" | "confidence" | "verified_match_count" | "provisional"> | null;
  junior_rating_history:
    | Pick<JuniorRatingHistory, "id" | "previous_stage" | "previous_rating" | "new_stage" | "new_rating" | "change_amount" | "reason" | "notes" | "created_at">[]
    | null;
  junior_achievements:
    | Pick<JuniorAchievement, "id" | "badge_key" | "badge_name" | "category" | "earned_at">[]
    | null;
};

const memberStatuses: MemberStatus[] = ["member", "non_member", "pending", "inactive"];
const juniorStages: { value: JuniorStage; label: string }[] = [
  { value: "red_ball", label: "Red Ball" },
  { value: "orange_ball", label: "Orange Ball" },
  { value: "green_ball", label: "Green Ball" },
  { value: "yellow_ball", label: "Yellow Ball" },
  { value: "not_sure", label: "Not sure yet" }
];

function profileRating(profile: AdminProfile) {
  return Array.isArray(profile.ratings) ? profile.ratings[0] : profile.ratings;
}

type AdminProfilesPageProps = {
  searchParams?: {
    q?: string;
    member_status?: string;
    profile_type?: string;
    admin_message?: string;
  };
};

export default async function AdminProfilesPage({ searchParams }: AdminProfilesPageProps) {
  const { supabase } = await getAdminContext();
  const search = searchParams?.q?.trim() ?? "";
  const memberStatus = searchParams?.member_status ?? "all";
  const profileType = searchParams?.profile_type ?? "all";

  let query = supabase
    .from("profiles")
    .select("*,parent:parent_profile_id(first_name,last_name),ratings(rating_value,confidence,verified_match_count,provisional),junior_rating_history(id,previous_stage,previous_rating,new_stage,new_rating,change_amount,reason,notes,created_at),junior_achievements(id,badge_key,badge_name,category,earned_at)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  if (memberStatuses.includes(memberStatus as MemberStatus)) {
    query = query.eq("member_status", memberStatus);
  }

  if (profileType === "adult") {
    query = query.eq("is_junior", false);
  }

  if (profileType === "junior") {
    query = query.eq("is_junior", true);
  }

  const { data, error } = await query;
  const profiles = (data ?? []) as unknown as AdminProfile[];

  return (
    <PageShell eyebrow="ClubR" title="Players">
      <AdminNav />
      <StatusAlert
        className="mb-5"
        message={
          searchParams?.admin_message === "junior_rating_updated"
            ? "Junior rating controls saved."
            : searchParams?.admin_message === "junior_stage_updated"
              ? "Junior stage transition saved."
              : searchParams?.admin_message === "junior_badge_awarded"
                ? "Junior achievement awarded."
                : null
        }
        tone="success"
      />
      <StatusAlert
        className="mb-5"
        message={
          searchParams?.admin_message === "junior_rating_failed"
            ? "Junior rating controls could not be saved."
            : searchParams?.admin_message === "junior_transition_failed"
              ? "Junior stage transition could not be saved."
              : searchParams?.admin_message === "junior_badge_failed"
                ? "Junior achievement could not be awarded."
                : null
        }
        tone="error"
      />
      <div className="surface-card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-black text-court-navy">Player directory</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            ClubR view of adult and junior players, contact details, member status, and POPIA-friendly marketing consent.
          </p>
        </div>
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Search name, email, or phone
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={search} name="q" placeholder="e.g. Sam, sam@example.com, or 082..." />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Member status
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={memberStatus} name="member_status">
            <option value="all">All member statuses</option>
            {memberStatuses.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Player type
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profileType} name="profile_type">
            <option value="all">Adults and juniors</option>
            <option value="adult">Adults</option>
            <option value="junior">Juniors</option>
          </select>
          </label>
          <button className="self-end rounded bg-court-blue px-4 py-2 font-bold text-white" type="submit">
            Filter
          </button>
        </form>
        <div className="mt-3">
          <Link className="text-sm font-bold text-court-blue" href="/admin/profiles">
            Clear filters
          </Link>
        </div>

        {error ? <p className="mt-6 rounded bg-amber-50 p-4 text-sm text-amber-900">Profiles could not be loaded right now.</p> : null}

        {profiles.length > 0 ? (
          <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {profiles.map((profile) => (
              <div className="grid gap-4 p-4 md:grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr_1fr] md:items-start" key={profile.id}>
                <div>
                  <p className="font-black text-court-navy">
                    {profile.first_name} {profile.last_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{profile.email ?? "No email"}</p>
                  <p className="text-sm text-slate-600">{profile.phone ?? "No cellphone"}</p>
                  {profile.is_junior ? (
                    <div className="mt-2 rounded bg-court-mist p-2 text-xs font-bold uppercase tracking-wide text-court-teal">
                      <p>Junior profile</p>
                      <p className="mt-1 text-court-navy">
                        Parent: {profile.parent ? `${profile.parent.first_name} ${profile.parent.last_name}` : "Parent profile unavailable"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">Adult profile</p>
                  )}
                </div>
                <div className="text-sm text-slate-700">
                  <p>{formatLabel(profile.primary_sport)}</p>
                  <p>{formatLabel(profile.player_level)}</p>
                  {profile.is_junior ? (
                    <div className="mt-2 rounded bg-court-mist p-3">
                      <p className="text-lg font-black text-court-navy">{formatJuniorRating(profile.junior_stage, profile.junior_rating)}</p>
                      <p className="text-xs font-bold uppercase tracking-wide text-court-teal">
                        {formatLabel(profile.junior_rating_confidence)} confidence
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {profile.participation_score} participation pts / {profile.stage_readiness_score}% stage readiness
                      </p>
                      {profile.rating_locked ? <p className="mt-1 text-xs font-bold text-amber-700">Rating locked</p> : null}
                    </div>
                  ) : null}
                  {profileRating(profile) ? (
                    <p className="mt-2 font-bold text-court-blue">
                      Rating {profileRating(profile)?.rating_value.toFixed(1)} / {formatLabel(profileRating(profile)?.confidence ?? null)}
                    </p>
                  ) : (
                    <p className="mt-2 text-slate-500">No rating yet</p>
                  )}
                </div>
                <div className="text-sm text-slate-700">
                  <p className="font-bold text-court-ink">{formatLabel(profile.member_status)}</p>
                  <p className="text-slate-500">Joined {formatDate(profile.created_at)}</p>
                </div>
                <div className="text-sm">
                  <p className={profile.marketing_consent ? "font-bold text-emerald-700" : "font-bold text-slate-500"}>
                    {profile.marketing_consent ? "Marketing yes" : "Marketing no"}
                  </p>
                  <p className="text-xs text-slate-500">Service messages still allowed</p>
                </div>
                <form action={updateProfileMemberStatus} className="flex gap-2">
                  <input name="profileId" type="hidden" value={profile.id} />
                  <select className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.member_status} name="memberStatus">
                    {memberStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatLabel(status)}
                      </option>
                    ))}
                  </select>
                  <button className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" type="submit">
                    Save
                  </button>
                </form>
                {profile.is_junior ? (
                  <div className="md:col-span-5">
                    <div className="grid gap-4 rounded-lg border border-court-teal/20 bg-court-mist/60 p-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
                      <form action={updateJuniorRatingControls} className="grid gap-3 sm:grid-cols-2">
                        <input name="profileId" type="hidden" value={profile.id} />
                        <div className="sm:col-span-2">
                          <p className="font-black text-court-navy">Junior rating controls</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">Manual ClubR controls for pilot fairness. Every rating or stage change writes history.</p>
                        </div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Stage
                          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.junior_stage ?? "red_ball"} name="juniorStage">
                            {juniorStages.map((stage) => (
                              <option key={stage.value} value={stage.value}>
                                {stage.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Rating
                          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.junior_rating.toFixed(1)} max={profile.junior_stage === "yellow_ball" ? 10 : 5} min="1" name="juniorRating" step="0.1" type="number" />
                        </label>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Stage readiness
                          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.stage_readiness_score} max="100" min="0" name="stageReadinessScore" type="number" />
                        </label>
                        <label className="flex items-center gap-2 self-end rounded border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                          <input defaultChecked={profile.rating_locked} name="ratingLocked" type="checkbox" />
                          Lock rating
                        </label>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-600 sm:col-span-2">
                          Rating notes
                          <textarea className="mt-2 min-h-16 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.rating_notes ?? ""} name="ratingNotes" />
                        </label>
                        <SubmitButton className="rounded bg-court-blue px-4 py-2 text-sm font-bold text-white sm:col-span-2" pendingText="Saving...">
                          Save junior rating
                        </SubmitButton>
                      </form>

                      <div className="space-y-4">
                        <form action={transitionJuniorStage} className="grid gap-3">
                          <input name="profileId" type="hidden" value={profile.id} />
                          <p className="font-black text-court-navy">Stage transition</p>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            Move to
                            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={profile.junior_stage ?? "orange_ball"} name="targetStage">
                              {juniorStages.filter((stage) => stage.value !== "not_sure").map((stage) => (
                                <option key={stage.value} value={stage.value}>
                                  {stage.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <textarea className="min-h-16 rounded border border-slate-300 px-3 py-2 text-sm focus-ring" name="transitionNotes" placeholder="Optional stage transition notes" />
                          <SubmitButton className="rounded bg-court-teal px-4 py-2 text-sm font-bold text-white" pendingText="Moving...">
                            Approve transition
                          </SubmitButton>
                        </form>
                        <form action={awardJuniorAchievement} className="grid gap-3">
                          <input name="profileId" type="hidden" value={profile.id} />
                          <p className="font-black text-court-navy">Add achievement</p>
                          <input className="rounded border border-slate-300 px-3 py-2 text-sm focus-ring" name="badgeName" placeholder="Coach Achievement" />
                          <input className="rounded border border-slate-300 px-3 py-2 text-sm focus-ring" name="badgeKey" placeholder="coach_achievement" />
                          <textarea className="min-h-16 rounded border border-slate-300 px-3 py-2 text-sm focus-ring" name="achievementNotes" placeholder="Optional achievement notes" />
                          <SubmitButton className="rounded bg-court-navy px-4 py-2 text-sm font-bold text-white" pendingText="Awarding...">
                            Award badge
                          </SubmitButton>
                        </form>
                      </div>

                      <div>
                        <p className="font-black text-court-navy">Progress record</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded bg-white p-3">
                            <p className="font-black text-court-navy">{profile.matches_played}</p>
                            <p className="text-xs text-slate-600">Matches</p>
                          </div>
                          <div className="rounded bg-white p-3">
                            <p className="font-black text-court-navy">{profile.wins}-{profile.losses}</p>
                            <p className="text-xs text-slate-600">Wins-losses</p>
                          </div>
                          <div className="rounded bg-white p-3">
                            <p className="font-black text-court-navy">{profile.events_played}</p>
                            <p className="text-xs text-slate-600">Events</p>
                          </div>
                          <div className="rounded bg-white p-3">
                            <p className="font-black text-court-navy">{profile.close_matches}</p>
                            <p className="text-xs text-slate-600">Close matches</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Recent history</p>
                          {profile.junior_rating_history?.length ? (
                            <div className="mt-2 space-y-2">
                              {profile.junior_rating_history.slice(0, 3).map((history) => (
                                <div className="rounded bg-white p-3 text-xs" key={history.id}>
                                  <p className="font-bold text-court-navy">
                                    {formatLabel(history.reason)}: {history.previous_rating?.toFixed(1) ?? "-"} to {history.new_rating?.toFixed(1) ?? "-"} ({history.change_amount > 0 ? "+" : ""}{history.change_amount.toFixed(2)})
                                  </p>
                                  <p className="mt-1 text-slate-500">{formatDate(history.created_at)}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 rounded bg-white p-3 text-xs text-slate-600">No junior rating history yet.</p>
                          )}
                        </div>
                        <div className="mt-4">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Badges</p>
                          {profile.junior_achievements?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {profile.junior_achievements.slice(0, 6).map((badge) => (
                                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-court-navy" key={badge.id}>
                                  {badge.badge_name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 rounded bg-white p-3 text-xs text-slate-600">No badges earned yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state mt-6">
            <h2 className="text-lg font-black text-court-navy">{search || memberStatus !== "all" || profileType !== "all" ? "No players match these filters." : "No players yet."}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {search || memberStatus !== "all" || profileType !== "all"
                ? "Try clearing the filters or searching for a different name or email address."
                : "Players will appear here after users sign up and complete their Player Profile."}
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
