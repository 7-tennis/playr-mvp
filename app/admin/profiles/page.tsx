import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { updateProfileMemberStatus } from "@/app/admin/actions";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { MemberStatus, Profile, Rating } from "@/types/courtside";

type AdminProfile = Profile & {
  parent: Pick<Profile, "first_name" | "last_name"> | null;
  ratings: Pick<Rating, "rating_value" | "confidence" | "verified_match_count" | "provisional">[] | Pick<Rating, "rating_value" | "confidence" | "verified_match_count" | "provisional"> | null;
};

const memberStatuses: MemberStatus[] = ["member", "non_member", "pending", "inactive"];

function profileRating(profile: AdminProfile) {
  return Array.isArray(profile.ratings) ? profile.ratings[0] : profile.ratings;
}

type AdminProfilesPageProps = {
  searchParams?: {
    q?: string;
    member_status?: string;
    profile_type?: string;
  };
};

export default async function AdminProfilesPage({ searchParams }: AdminProfilesPageProps) {
  const { supabase } = await getAdminContext();
  const search = searchParams?.q?.trim() ?? "";
  const memberStatus = searchParams?.member_status ?? "all";
  const profileType = searchParams?.profile_type ?? "all";

  let query = supabase
    .from("profiles")
    .select("*,parent:parent_profile_id(first_name,last_name),ratings(rating_value,confidence,verified_match_count,provisional)")
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
              <div className="grid gap-4 p-4 md:grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr_1fr] md:items-center" key={profile.id}>
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
                  {profile.is_junior ? <p>{profile.junior_stage ? formatLabel(profile.junior_stage) : "Stage not set"}</p> : null}
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
