import { CollapsibleCard } from "@/components/collapsible-card";
import { EntriesIcon, PrivateIcon, StatusIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime } from "@/lib/courtside-format";
import { loadCoachLessons, profileDisplayName } from "@/lib/coach-lessons";
import { normalizeStoredRole, roleLabel } from "@/lib/permissions";
import type { AdminUser, Profile } from "@/types/courtside";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";
import { assignVenueCoach, deactivateVenueCoach } from "./actions";

export const dynamic = "force-dynamic";

type CoachesPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    q?: string;
  };
};

type Assignment = Pick<AdminUser, "id" | "user_id" | "role" | "venue_id" | "assigned_at" | "deactivated_at">;
type AdultProfile = Pick<Profile, "id" | "user_id" | "first_name" | "last_name" | "email" | "is_junior">;

function profileName(profile: AdultProfile | null | undefined) {
  return profile ? `${profile.first_name} ${profile.last_name}` : "Profile missing";
}

function statusMessage(message?: string) {
  switch (message) {
    case "coach_assigned":
      return "Coach access assigned. The coach can access CoachR after refreshing their session.";
    case "coach_deactivated":
      return "Coach access deactivated.";
    default:
      return null;
  }
}

function errorMessage(error?: string) {
  switch (error) {
    case "access":
      return "Only Head Coaches and authorised venue managers can manage coaches here.";
    case "adult_profile_required":
      return "Select a user with a valid adult PlayR profile.";
    case "confirm_required":
      return "Confirm the access change before saving.";
    case "protected_role":
      return "That user has a protected role and cannot be changed here.";
    case "assign_failed":
      return "Coach access could not be assigned.";
    case "deactivate_failed":
      return "Coach access could not be deactivated.";
    default:
      return null;
  }
}

function setupChips({
  active,
  lessonCount,
  profile,
  studentCount,
  venueLinked
}: {
  active: boolean;
  lessonCount: number;
  profile: AdultProfile | null | undefined;
  studentCount: number;
  venueLinked: boolean;
}) {
  return [
    { label: profile?.user_id ? "Account exists" : "Missing account", tone: profile?.user_id ? "ui-chip-success" : "ui-chip-warning" },
    { label: profile ? "Adult profile" : "Missing profile", tone: profile ? "ui-chip-success" : "ui-chip-warning" },
    { label: venueLinked ? "Venue linked" : "Missing venue", tone: venueLinked ? "ui-chip-success" : "ui-chip-warning" },
    { label: active ? "Access active" : "Access inactive", tone: active ? "ui-chip-success" : "ui-chip-warning" },
    { label: studentCount > 0 ? `${studentCount} students` : "No students", tone: studentCount > 0 ? "ui-chip-brand" : "ui-chip-muted" },
    { label: lessonCount > 0 ? "Schedule ready" : "No lessons", tone: lessonCount > 0 ? "ui-chip-brand" : "ui-chip-muted" }
  ];
}

export default async function CoachRCoachesPage({ searchParams }: CoachesPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:coaches");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const context = access.context;
  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const [lessons, assignmentsResult, adultProfilesResult] = await Promise.all([
    loadCoachLessons(context, 240),
    context.role === "platform_admin"
      ? context.supabase.from("admin_users").select("id,user_id,role,venue_id,assigned_at,deactivated_at").in("role", ["coach", "head_coach"]).order("created_at", { ascending: false })
      : context.supabase
          .from("admin_users")
          .select("id,user_id,role,venue_id,assigned_at,deactivated_at")
          .eq("venue_id", context.venueId)
          .in("role", ["coach", "head_coach"])
          .order("created_at", { ascending: false }),
    context.supabase
      .from("profiles")
      .select("id,user_id,first_name,last_name,email,is_junior")
      .eq("is_junior", false)
      .not("user_id", "is", null)
      .order("first_name", { ascending: true })
      .limit(240)
  ]);
  const assignments = ((assignmentsResult.data ?? []) as Assignment[]) ?? [];
  const adultProfiles = ((adultProfilesResult.data ?? []) as AdultProfile[]) ?? [];
  const profilesByUser = new Map(adultProfiles.map((profile) => [profile.user_id, profile]));
  const lessonStats = new Map<string, { lessons: number; nextLesson: string | null; students: Set<string> }>();

  lessons.forEach((lesson) => {
    const stats = lessonStats.get(lesson.coach_id) ?? { lessons: 0, nextLesson: null, students: new Set<string>() };
    stats.lessons += 1;
    stats.students.add(lesson.player_id);
    if (lesson.status === "scheduled" && (!stats.nextLesson || new Date(lesson.start_time).getTime() < new Date(stats.nextLesson).getTime())) {
      stats.nextLesson = lesson.start_time;
    }
    lessonStats.set(lesson.coach_id, stats);
  });

  const coachCards = assignments
    .map((assignment) => {
      const profile = profilesByUser.get(assignment.user_id) ?? null;
      const stats = profile ? lessonStats.get(profile.id) : null;
      return { assignment, profile, stats };
    })
    .filter((card) => (query ? `${profileName(card.profile)} ${card.profile?.email ?? ""}`.toLowerCase().includes(query) : true));
  const searchableProfiles = query
    ? adultProfiles.filter((profile) => `${profile.first_name} ${profile.last_name} ${profile.email ?? ""}`.toLowerCase().includes(query))
    : adultProfiles.slice(0, 40);
  const canAssignHere = context.role === "head_coach" || context.role === "club_admin";

  return (
    <CoachRPageFrame context={context} subtitle="Manage coaches linked to your permitted venue." title="Manage Coaches">
      <CoachRRoleSummary context={context} />

      {statusMessage(searchParams?.message) ? (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{statusMessage(searchParams?.message)}</div>
      ) : null}
      {errorMessage(searchParams?.error) ? (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{errorMessage(searchParams?.error)}</div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="stat-card">
          <EntriesIcon size={20} />
          <p className="section-kicker mt-3">Coaches</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{coachCards.length}</p>
        </article>
        <article className="stat-card">
          <StatusIcon size={20} />
          <p className="section-kicker mt-3">Active</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{coachCards.filter((card) => !card.assignment.deactivated_at).length}</p>
        </article>
        <article className="stat-card">
          <PrivateIcon size={20} />
          <p className="section-kicker mt-3">Role</p>
          <p className="mt-2 text-2xl font-black text-court-navy">{roleLabel(context.role)}</p>
        </article>
      </section>

      <CollapsibleCard defaultOpen={Boolean(query)} eyebrow="Find" summary="Search existing PlayR users, then assign coach access for this venue." title="Search and add coach">
        <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" method="get">
          <input className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Name or email" />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
        {canAssignHere ? (
          <form action={assignVenueCoach} className="grid gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Existing adult PlayR profile
              <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="profileId" required>
                <option value="">Choose profile</option>
                {searchableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileName(profile)} · {profile.email ?? "No email"}
                  </option>
                ))}
              </select>
            </label>
            <label className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <input className="mr-2" name="confirmAssignment" type="checkbox" />
              Confirm coach access for this venue
            </label>
            <button className="btn-primary" type="submit">
              Add Coach
            </button>
          </form>
        ) : (
          <div className="ui-empty-card">Use SupeR UseR organisation access to assign coaches without a venue-scoped role.</div>
        )}
      </CollapsibleCard>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {coachCards.length > 0 ? (
          coachCards.map(({ assignment, profile, stats }) => {
            const active = !assignment.deactivated_at;
            const chips = setupChips({
              active,
              lessonCount: stats?.lessons ?? 0,
              profile,
              studentCount: stats?.students.size ?? 0,
              venueLinked: Boolean(assignment.venue_id)
            });

            return (
              <article className="surface-card p-4 sm:p-5" key={assignment.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="section-title">{profileName(profile)}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{profile?.email ?? "Email unavailable"}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{roleLabel(normalizeStoredRole(assignment.role))}</p>
                  </div>
                  <span className={`ui-chip ${active ? "ui-chip-success" : "ui-chip-warning"}`}>{active ? "Ready" : "Access inactive"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  {chips.map((chip) => (
                    <span className={`ui-chip ${chip.tone}`} key={chip.label}>
                      {chip.label}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
                  <p>Assigned: {assignment.assigned_at ? formatDateTime(assignment.assigned_at) : "To be confirmed"}</p>
                  <p>Next lesson: {stats?.nextLesson ? formatDateTime(stats.nextLesson) : "No upcoming lesson"}</p>
                </div>
                {profile ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a className="btn-secondary px-3 py-2" href={`/dashboard/coachr/schedule?coach=${profile.id}`}>
                      <TimeIcon size={14} /> Schedule
                    </a>
                    <a className="btn-secondary px-3 py-2" href={`/dashboard/coachr/students?coach=${profile.id}`}>
                      <EntriesIcon size={14} /> Students
                    </a>
                  </div>
                ) : null}
                {active && assignment.role === "coach" && canAssignHere ? (
                  <form action={deactivateVenueCoach} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <input name="targetUserId" type="hidden" value={assignment.user_id} />
                    <label className="text-xs font-semibold text-amber-800">
                      <input className="mr-1" name="confirmDeactivate" type="checkbox" /> Confirm deactivate
                    </label>
                    <button className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800" type="submit">
                      Deactivate Access
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="ui-empty-card md:col-span-2">No coaches linked to this venue yet.</div>
        )}
      </section>
    </CoachRPageFrame>
  );
}
