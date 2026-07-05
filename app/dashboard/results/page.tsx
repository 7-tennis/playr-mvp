import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { CourtSideEvent, EventResult, Profile } from "@/types/courtside";

export const dynamic = "force-dynamic";

type ResultRow = EventResult & {
  events: Pick<CourtSideEvent, "title" | "slug" | "start_datetime" | "status"> | null;
  profiles: Pick<Profile, "first_name" | "last_name" | "is_junior"> | null;
};

export default async function DashboardResultsPage() {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Results" title="Supabase is not configured.">
        <div className="empty-state">
          <p className="text-slate-700">Add Supabase environment variables to view result history.</p>
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

  const { data: parentProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  const profileIds = parentProfile?.id ? [parentProfile.id as string] : [];

  if (parentProfile?.id) {
    const { data: juniors } = await supabase.from("profiles").select("id").eq("parent_profile_id", parentProfile.id).eq("is_junior", true);
    profileIds.push(...((juniors ?? []) as Pick<Profile, "id">[]).map((profile) => profile.id));
  }

  const { data, error } =
    profileIds.length > 0
      ? await supabase
          .from("event_results")
          .select("*,events:event_id(title,slug,start_datetime,status),profiles:profile_id(first_name,last_name,is_junior)")
          .in("profile_id", profileIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  const results = (data ?? []) as unknown as ResultRow[];

  return (
    <PageShell eyebrow="Results" subtitle="Review posted event and match results." title="Results">
      {error ? <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Results could not be loaded right now.</p> : null}

      {results.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-4 p-4 text-sm font-bold uppercase tracking-wide text-slate-500 md:grid-cols-[1.3fr_0.8fr_0.9fr_0.6fr_0.6fr_1fr]">
            <span>Event</span>
            <span>Date</span>
            <span>Player</span>
            <span>Place</span>
            <span>Points</span>
            <span>Notes</span>
          </div>
          <div className="divide-y divide-slate-200">
            {results.map((result) => (
              <div
                className="grid gap-3 p-4 text-sm text-slate-700 md:grid-cols-[1.3fr_0.8fr_0.9fr_0.6fr_0.6fr_1fr] md:items-center"
                key={result.id}
              >
                <div>
                  {result.events?.slug ? (
                    <Link className="font-black text-court-navy hover:text-court-blue" href={`/events/${result.events.slug}`}>
                      {result.events.title}
                    </Link>
                  ) : (
                    <span className="font-black text-court-navy">Event unavailable</span>
                  )}
                  <p className="text-xs text-slate-500">{formatLabel(result.events?.status ?? "completed")}</p>
                </div>
                <div>{result.events?.start_datetime ? formatDate(result.events.start_datetime) : "Date unavailable"}</div>
                <div>
                  {result.profiles
                    ? `${result.profiles.first_name} ${result.profiles.last_name}${result.profiles.is_junior ? " (junior)" : ""}`
                    : "Profile unavailable"}
                </div>
                <div className="font-bold text-court-ink">{result.placement ?? "-"}</div>
                <div className="font-bold text-court-ink">{result.points ?? "-"}</div>
                <div>{result.result_notes ?? "No notes"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">No results have been posted yet.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Event and match results will appear here once they are captured or confirmed.</p>
          <Link className="btn-primary mt-5" href="/dashboard/events">
            Browse events
          </Link>
        </div>
      )}
    </PageShell>
  );
}
