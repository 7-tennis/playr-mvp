import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { formatDate, formatLabel, formatPrice } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { EntryStatus, PaymentStatus } from "@/types/courtside";

type RecentEntry = {
  id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  entry_status: EntryStatus;
  created_at: string;
  events: { title: string; start_datetime: string } | null;
  profiles: { first_name: string; last_name: string } | null;
};

async function getCount(builder: PromiseLike<{ count: number | null }>) {
  const { count } = await builder;
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const { supabase } = await getAdminContext();
  const now = new Date().toISOString();

  const [
    totalProfiles,
    totalMembers,
    totalNonMembers,
    totalPublishedEvents,
    upcomingEvents,
    unpaidEntries,
    recentEntriesResponse
  ] = await Promise.all([
    getCount(supabase.from("profiles").select("id", { count: "exact", head: true })),
    getCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("member_status", "member")),
    getCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("member_status", "non_member")),
    getCount(supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "published")),
    supabase.from("events").select("id,title,start_datetime,status").gte("start_datetime", now).order("start_datetime").limit(5),
    getCount(supabase.from("event_entries").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid")),
    supabase
      .from("event_entries")
      .select("id,price_charged,payment_status,entry_status,created_at,events:event_id(title,start_datetime),profiles:profile_id(first_name,last_name)")
      .order("created_at", { ascending: false })
      .limit(6)
  ]);

  const stats = [
    { label: "Players", value: totalProfiles },
    { label: "Members", value: totalMembers },
    { label: "Visitors", value: totalNonMembers },
    { label: "Published events", value: totalPublishedEvents },
    { label: "Upcoming events", value: upcomingEvents.data?.length ?? 0 },
    { label: "Unpaid entries", value: unpaidEntries }
  ];

  return (
    <PageShell eyebrow="ClubR Admin" title="ClubR Dashboard">
      <AdminNav />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <p className="section-kicker">{stat.label}</p>
            <p className="mt-3 text-3xl font-black text-court-navy">{stat.value}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="section-title">Upcoming events</h2>
          <div className="mt-4 space-y-3">
            {(upcomingEvents.data ?? []).length > 0 ? (
              upcomingEvents.data?.map((event) => (
                <div className="rounded border border-slate-100 p-3" key={event.id}>
                  <p className="font-bold text-court-ink">{event.title}</p>
                  <p className="text-sm text-slate-600">{formatDate(event.start_datetime)} / {formatLabel(event.status)}</p>
                </div>
              ))
            ) : (
              <div className="soft-card p-4 text-sm text-slate-600">Create and publish an event when your club is ready to accept entries.</div>
            )}
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="section-title">Recent entries</h2>
          <div className="mt-4 space-y-3">
            {((recentEntriesResponse.data ?? []) as unknown as RecentEntry[]).length > 0 ? (
              ((recentEntriesResponse.data ?? []) as unknown as RecentEntry[]).map((entry) => (
                <div className="rounded border border-slate-100 p-3" key={entry.id}>
                  <p className="font-bold text-court-ink">{entry.profiles ? `${entry.profiles.first_name} ${entry.profiles.last_name}` : "Profile unavailable"}</p>
                  <p className="text-sm text-slate-600">
                    {entry.events?.title ?? "Event unavailable"} / {formatPrice(entry.price_charged)} / {formatLabel(entry.payment_status)}
                  </p>
                </div>
              ))
            ) : (
              <div className="soft-card p-4 text-sm text-slate-600">Player entries will appear here after published events receive signups.</div>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
