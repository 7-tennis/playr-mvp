import Link from "next/link";
import { redirect } from "next/navigation";
import { saveOwnProfile } from "@/app/dashboard/profile/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatJuniorRating, formatLabel } from "@/lib/courtside-format";
import { playrAccentForJuniorStage, playrAccents, playrJuniorStageLabel } from "@/lib/playr-ui";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { MemberStatus, PlayerLevel, Profile, Sport } from "@/types/courtside";

export const dynamic = "force-dynamic";

const sports: Sport[] = ["tennis", "pickleball", "futsal", "multi_sport"];
const playerLevels: PlayerLevel[] = ["beginner", "social", "intermediate", "club_competitive", "advanced", "unknown"];

type ProfilePageProps = {
  searchParams?: {
    error?: string;
    member?: string;
  };
};

function profileName(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Create your profile";
}

function profileInitials(profile: Pick<Profile, "first_name" | "last_name"> | null) {
  if (!profile) {
    return "PR";
  }

  return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
}

function memberStatusLabel(status: MemberStatus | null | undefined) {
  switch (status) {
    case "member":
      return "Active member";
    case "pending":
      return "Membership pending";
    case "inactive":
      return "Inactive membership";
    case "non_member":
      return "Non-member";
    default:
      return "Membership details to be confirmed";
  }
}

function memberRole(member: Profile, parentProfile: Profile | null, juniorCount: number) {
  if (member.is_junior) {
    return "Linked Junior";
  }

  if (parentProfile?.id === member.id && juniorCount > 0) {
    return "Main Member / Parent";
  }

  return "Main Member / Account Holder";
}

function memberHref(member: Profile) {
  return `/dashboard/profile?member=${member.id}#member-details`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words font-black text-court-navy">{value}</p>
    </div>
  );
}

function MemberAvatar({ member }: { member: Profile | null }) {
  const accent = member?.is_junior ? playrAccentForJuniorStage(member.junior_stage) : playrAccents.member;

  return <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-lg text-sm font-black ${accent.avatar}`}>{profileInitials(member)}</div>;
}

function MemberSummaryCard({ profile, juniorCount }: { profile: Profile | null; juniorCount: number }) {
  const name = profileName(profile);

  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-court ${playrAccents.member.border}`}>
      <div className={`h-1.5 ${playrAccents.member.strip}`} />
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <MemberAvatar member={profile} />
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-court-navy sm:text-3xl">{name}</h2>
            <span className={`ui-chip mt-2 ${playrAccents.member.badge}`}>{profile ? memberRole(profile, profile, juniorCount) : "Account Holder"}</span>
            <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
              <span className="ui-chip ui-chip-muted">🎾 No club linked yet</span>
              <span className="ui-chip ui-chip-muted">💳 {profile ? memberStatusLabel(profile.member_status) : "Membership details to be confirmed"}</span>
              <span className="ui-chip ui-chip-muted">🔁 Renewal date to be confirmed</span>
              <span className={profile?.member_status === "member" ? "ui-chip ui-chip-success" : "ui-chip ui-chip-brand"}>
                {profile ? formatLabel(profile.member_status) : "Profile setup needed"}
              </span>
            </div>
          </div>
        </div>
        <Link className="btn-secondary" href={profile ? memberHref(profile) : "#account-details"}>
          View Details
        </Link>
      </div>
    </section>
  );
}

function MembershipCard({ profile, juniorCount }: { profile: Profile | null; juniorCount: number }) {
  return (
    <article className="surface-card overflow-hidden">
      <div className="h-1.5 bg-court-teal" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">Membership</p>
            <h3 className="mt-1 text-xl font-black text-court-navy">Membership setup</h3>
            <p className="mt-1 text-sm text-slate-600">{profile ? profileName(profile) : "Main member"}</p>
          </div>
          <span className="ui-chip ui-chip-brand">Private</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <span className="ui-chip ui-chip-muted">💳 {profile ? memberStatusLabel(profile.member_status) : "Membership details to be confirmed"}</span>
          <span className="ui-chip ui-chip-muted">🎾 No club linked yet</span>
          <span className="ui-chip ui-chip-muted">🔁 Renewal date to be confirmed</span>
          <span className="ui-chip ui-chip-muted">👥 {juniorCount + (profile ? 1 : 0)} linked</span>
        </div>
        <div className="ui-empty-card mt-4">Pricing, renewal rules and membership type will be confirmed by your club.</div>
      </div>
    </article>
  );
}

function BenefitChip({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="font-black text-court-navy">
        <span aria-hidden="true" className="mr-2">
          {icon}
        </span>
        {label}
      </p>
    </div>
  );
}

function LinkedMemberCard({ member, parentProfile, juniorCount }: { member: Profile; parentProfile: Profile | null; juniorCount: number }) {
  const accent = member.is_junior ? playrAccentForJuniorStage(member.junior_stage) : playrAccents.member;

  return (
    <Link className="group block rounded-lg focus-ring" href={memberHref(member)}>
      <article className={`overflow-hidden rounded-lg border bg-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-court group-hover:ring-4 ${accent.border} ${accent.ring}`}>
        <div className={`h-1.5 ${accent.strip}`} />
        <div className="p-4">
          <div className="flex gap-3">
            <MemberAvatar member={member} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-black text-court-navy">{profileName(member)}</h3>
              <p className="mt-1 text-sm font-bold text-slate-600">{memberRole(member, parentProfile, juniorCount)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`ui-chip ${accent.badge}`}>{member.is_junior ? `🏷 ${playrJuniorStageLabel(member.junior_stage)}` : "💳 Main Member"}</span>
            <span className="ui-chip ui-chip-muted">🎾 No club linked yet</span>
            {member.is_junior ? <span className="ui-chip ui-chip-muted">🏫 School to be confirmed</span> : null}
          </div>
        </div>
      </article>
    </Link>
  );
}

function PrivateMemberDetails({ member, parentProfile, juniorCount, loginEmail }: { member: Profile | null; parentProfile: Profile | null; juniorCount: number; loginEmail: string | null }) {
  if (!member) {
    return (
      <section className="surface-card p-5" id="member-details">
        <h2 className="section-title">Private Member Details</h2>
        <div className="ui-empty-card mt-4">Create your profile to view private member details.</div>
      </section>
    );
  }

  return (
    <section className="surface-card p-5 sm:p-6" id="member-details">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <MemberAvatar member={member} />
          <div>
            <p className="section-kicker">Private Details</p>
            <h2 className="section-title mt-1">{profileName(member)}</h2>
            <p className="mt-1 text-sm font-bold text-slate-600">{memberRole(member, parentProfile, juniorCount)}</p>
          </div>
        </div>
        <Link className="btn-secondary" href={`/dashboard/players/${member.id}`}>
          Open Player Card
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="Email" value={member.is_junior ? member.email ?? "No junior email linked" : member.email ?? loginEmail ?? "No email linked"} />
        <DetailRow label="Phone" value={member.phone ?? "Phone number not set"} />
        <DetailRow label="Date of Birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : "Date of birth not set"} />
        <DetailRow label="Role" value={memberRole(member, parentProfile, juniorCount)} />
        <DetailRow label="Membership Status" value={memberStatusLabel(member.member_status)} />
        <DetailRow label="Membership Type" value="Membership details to be confirmed" />
        <DetailRow label="Renewal Date" value="Renewal date to be confirmed" />
        <DetailRow label="Club" value="No club linked yet" />
        <DetailRow label="Primary Sport" value={formatLabel(member.primary_sport)} />
        <DetailRow label="Player Level" value={formatLabel(member.player_level)} />
        {member.is_junior ? <DetailRow label="Junior Stage" value={playrJuniorStageLabel(member.junior_stage)} /> : null}
        {member.is_junior ? <DetailRow label="Junior Rating" value={formatJuniorRating(member.junior_stage, member.junior_rating)} /> : null}
        {member.is_junior ? <DetailRow label="School" value="School to be confirmed" /> : null}
      </div>

      <div className="mt-5 rounded-lg border border-court-teal/25 bg-court-mist p-4 text-sm leading-6 text-court-navy">
        Private profile information is only shown inside this signed-in dashboard. Public profile photos and junior consent settings are not enabled in this MVP.
      </div>
    </section>
  );
}

function AccountDetailsForm({
  profile,
  userEmail,
  defaultPhone,
  defaultMarketingConsent
}: {
  profile: Profile | null;
  userEmail: string | null;
  defaultPhone: string;
  defaultMarketingConsent: boolean;
}) {
  return (
    <form action={saveOwnProfile} className="surface-card grid gap-4 p-5 sm:p-6 md:grid-cols-2" id="account-details">
      <div className="md:col-span-2">
        <p className="section-kicker">Account Details</p>
        <h2 className="section-title mt-2">Private member details</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Keep your account holder details current for club communication, bookings and event entries.</p>
      </div>
      <label className="text-sm font-semibold text-slate-700">
        First name <span className="font-normal text-slate-500">(required)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.first_name ?? ""} name="first_name" required type="text" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Last name <span className="font-normal text-slate-500">(required)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.last_name ?? ""} name="last_name" required type="text" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Login email
        <input className="mt-2 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-600" defaultValue={userEmail ?? profile?.email ?? ""} name="email" readOnly type="email" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Phone number <span className="font-normal text-slate-500">(optional)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={defaultPhone} name="phone" type="tel" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Date of birth <span className="font-normal text-slate-500">(optional)</span>
        <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.date_of_birth ?? ""} name="date_of_birth" type="date" />
      </label>
      <label className="text-sm font-semibold text-slate-700">
        Primary sport
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.primary_sport ?? "tennis"} name="primary_sport">
          {sports.map((sport) => (
            <option key={sport} value={sport}>
              {formatLabel(sport)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700 md:col-span-2">
        Player level
        <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={profile?.player_level ?? "unknown"} name="player_level">
          {playerLevels.map((level) => (
            <option key={level} value={level}>
              {formatLabel(level)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700 md:col-span-2">
        <span className="flex gap-3 text-sm leading-6 text-slate-700">
          <input className="mt-1 h-4 w-4 rounded border-slate-300" defaultChecked={defaultMarketingConsent} name="marketing_consent" type="checkbox" />
          <span>I agree to receive optional PlayR marketing updates. This is separate from important account and club communication.</span>
        </span>
      </label>
      <label className="text-sm font-semibold text-slate-700 md:col-span-2">
        Notes <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          className="mt-2 min-h-24 w-full rounded border border-slate-300 px-3 py-2 focus-ring"
          defaultValue={profile?.notes ?? ""}
          name="notes"
          placeholder="Optional profile notes, medical/payment context, or parent/guardian notes if relevant."
        />
      </label>
      <SubmitButton className="rounded bg-court-blue px-4 py-3 font-bold text-white md:col-span-2" pendingText="Saving profile...">
        Save Profile
      </SubmitButton>
    </form>
  );
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Profile" title="Supabase is not configured.">
        <div className="empty-state">
          <p className="text-slate-700">Add Supabase environment variables to create or edit a player profile.</p>
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

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const profile = data as Profile | null;
  const { data: juniorData } = profile
    ? await supabase
        .from("profiles")
        .select("*")
        .eq("parent_profile_id", profile.id)
        .eq("is_junior", true)
        .order("first_name", { ascending: true })
    : { data: [] };

  const juniors = (juniorData ?? []) as Profile[];
  const members = [...(profile ? [profile] : []), ...juniors];
  const selectedMember = members.find((member) => member.id === searchParams?.member) ?? profile;
  const userMetadata = user.user_metadata as { phone?: string | null; marketing_consent?: boolean | null };
  const defaultPhone = profile?.phone ?? userMetadata.phone ?? "";
  const defaultMarketingConsent = profile?.marketing_consent ?? Boolean(userMetadata.marketing_consent);

  return (
    <PageShell eyebrow="Profile" subtitle="Manage memberships, linked members and account details." title="Profile">
      <StatusAlert
        className="mb-5"
        message={
          searchParams?.error === "missing_name"
            ? "First name and last name are required."
            : searchParams?.error === "parent_profile_required"
              ? "Create your adult profile before adding junior profiles."
              : searchParams?.error === "save_failed"
                ? "Profile could not be saved. Please check your details and try again."
                : null
        }
        tone="error"
      />

      {!profile ? (
        <div className="mb-5 rounded-lg border border-court-teal/30 bg-court-mist p-4 text-sm leading-6 text-court-navy shadow-sm">
          Complete your main member profile first. Membership, linked members and private account details will appear here.
        </div>
      ) : null}

      <div className="grid gap-6">
        <MemberSummaryCard juniorCount={juniors.length} profile={profile} />

        <section>
          <div className="mb-4">
            <p className="section-kicker">Memberships</p>
            <h2 className="section-title mt-2">Membership setup</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <MembershipCard juniorCount={juniors.length} profile={profile} />
            <section className="surface-card p-5">
              <p className="section-kicker">Benefits</p>
              <h3 className="mt-1 text-xl font-black text-court-navy">Membership benefits</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Benefits may depend on your club membership setup. Your club can confirm exact inclusions, discounts and renewal rules.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <BenefitChip icon="🏟" label="Court booking access" />
                <BenefitChip icon="🎟" label="Club event access" />
                <BenefitChip icon="⭐" label="PlayR rating access" />
                <BenefitChip icon="⚡" label="Participation tracking" />
                <BenefitChip icon="🏅" label="Badges and achievements" />
                <BenefitChip icon="👥" label="Linked junior profiles" />
              </div>
            </section>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-kicker">Linked Members</p>
              <h2 className="section-title mt-2">Family and member links</h2>
            </div>
            <Link className="btn-secondary" href="/dashboard/juniors">
              Manage Juniors
            </Link>
          </div>

          {members.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {members.map((member) => (
                <LinkedMemberCard juniorCount={juniors.length} key={member.id} member={member} parentProfile={profile} />
              ))}
            </div>
          ) : (
            <div className="ui-empty-card">No linked members yet. Create your profile first, then add junior profiles from the Juniors page.</div>
          )}
        </section>

        <PrivateMemberDetails juniorCount={juniors.length} loginEmail={user.email ?? null} member={selectedMember} parentProfile={profile} />

        <section className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-kicker">Account & Privacy</p>
              <h2 className="section-title mt-2">Account settings</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Contact details and account preferences are private to your signed-in dashboard.</p>
            </div>
            <span className="ui-chip ui-chip-brand">Private</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailRow label="Login Email" value={user.email ?? "Login email unavailable"} />
            <DetailRow label="Phone" value={defaultPhone || "Phone number not set"} />
            <DetailRow label="Notifications" value={defaultMarketingConsent ? "Marketing updates on" : "Marketing updates off"} />
            <DetailRow label="Junior Consent" value="Consent settings coming soon" />
          </div>
          <div className="ui-empty-card mt-4">More account, privacy, notification and photo-consent settings coming soon.</div>
        </section>

        <AccountDetailsForm defaultMarketingConsent={defaultMarketingConsent} defaultPhone={defaultPhone} profile={profile} userEmail={user.email ?? null} />
      </div>
    </PageShell>
  );
}
