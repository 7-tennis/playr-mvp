import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type CancelledEventDetail = {
  event_id: string;
  title: string;
  host_name: string;
  host_type: string;
  player_name: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string;
};

export default async function NotificationEventPage({ params, searchParams }: { params: { eventId: string }; searchParams?: { player?: string } }) {
  const playerId = searchParams?.player?.trim();
  if (!playerId) notFound();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_notification_event_detail", {
    p_event_id: params.eventId,
    p_player_profile_id: playerId
  });
  const event = ((data ?? []) as CancelledEventDetail[])[0];
  if (error || !event) notFound();
  return <PageShell eyebrow="Event update" subtitle={`${event.player_name}'s event context`} title={event.title}>
    <Link className="btn-secondary mb-5" href="/dashboard/messages">Back to Updates</Link>
    <section className="surface-card border-amber-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">{formatLabel(event.host_type)} · {event.host_name}</p><h2 className="section-title mt-1">Event cancelled</h2></div><span className="ui-chip ui-chip-warning">Cancelled</span></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-black text-court-navy">Player</dt><dd className="mt-1 text-slate-600">{event.player_name}</dd></div><div><dt className="font-black text-court-navy">Location</dt><dd className="mt-1 text-slate-600">{event.location ?? "To be confirmed"}</dd></div><div className="sm:col-span-2"><dt className="font-black text-court-navy">Original schedule</dt><dd className="mt-1 text-slate-600">{formatDateTime(event.starts_at)} – {formatDateTime(event.ends_at)}</dd></div></dl></section>
  </PageShell>;
}
