import Link from "next/link";
import { notFound } from "next/navigation";
import { updateEntryStatuses } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { EntryStatus, PaymentStatus } from "@/types/courtside";

type EventEntryRow = {
  id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  payment_received_at: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  entry_status: EntryStatus;
  created_at: string;
  profiles: {
    first_name: string;
    last_name: string;
    is_junior: boolean;
    member_status: string;
  } | null;
};

const paymentStatuses: PaymentStatus[] = ["unpaid", "pending", "paid", "refunded", "cancelled"];
const entryStatuses: EntryStatus[] = ["active", "cancelled", "checked_in", "no_show"];

function adminEntryMessage(message?: string) {
  switch (message) {
    case "payment_updated":
    case "entry_updated":
      return "Entry payment/status updated.";
    case "invalid_entry":
      return "That entry could not be found.";
    default:
      return null;
  }
}

function summarizeEntries(entries: EventEntryRow[]) {
  const activeEntries = entries.filter((entry) => entry.entry_status !== "cancelled");
  const totalExpected = activeEntries.reduce((sum, entry) => sum + Number(entry.price_charged ?? 0), 0);
  const totalReceived = entries
    .filter((entry) => entry.payment_status === "paid")
    .reduce((sum, entry) => sum + Number(entry.price_charged ?? 0), 0);

  return {
    total: entries.length,
    paid: entries.filter((entry) => entry.payment_status === "paid").length,
    unpaidPending: entries.filter((entry) => entry.payment_status === "unpaid" || entry.payment_status === "pending").length,
    expected: totalExpected,
    received: totalReceived,
    outstanding: Math.max(totalExpected - totalReceived, 0)
  };
}

export default async function AdminEventEntriesPage({ params, searchParams }: { params: { id: string }; searchParams?: { admin_message?: string } }) {
  const { supabase } = await getAdminContext();
  const { data: event } = await supabase.from("events").select("id,title").eq("id", params.id).single();

  if (!event) {
    notFound();
  }

  const { data, error } = await supabase
    .from("event_entries")
    .select("id,price_charged,payment_status,payment_received_at,payment_reference,payment_notes,entry_status,created_at,profiles:profile_id(first_name,last_name,is_junior,member_status)")
    .eq("event_id", params.id)
    .order("created_at", { ascending: false });

  const entries = (data ?? []) as unknown as EventEntryRow[];
  const summary = summarizeEntries(entries);

  return (
    <PageShell eyebrow="ClubR Entries" title={`${event.title} Entries`}>
      <AdminNav />
      <StatusAlert className="mb-5" message={adminEntryMessage(searchParams?.admin_message)} tone={searchParams?.admin_message === "invalid_entry" ? "error" : "success"} />
      <div className="mb-5 flex flex-wrap gap-3">
        <Link className="rounded bg-court-blue px-4 py-3 font-bold text-white" href={`/admin/results?event_id=${params.id}`}>
          Capture results
        </Link>
        <Link className="rounded border border-slate-300 bg-white px-4 py-3 font-bold text-court-navy" href="/admin/entries">
          All entries
        </Link>
      </div>
      {error ? <p className="rounded bg-amber-50 p-4 text-sm text-amber-900">Entries could not be loaded right now.</p> : null}

      <div className="mb-5 grid gap-3 md:grid-cols-5">
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</p>
          <p className="mt-1 text-xl font-black text-court-navy">{summary.total}</p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Paid</p>
          <p className="mt-1 text-xl font-black text-court-navy">{summary.paid}</p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Unpaid/pending</p>
          <p className="mt-1 text-xl font-black text-court-navy">{summary.unpaidPending}</p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Expected</p>
          <p className="mt-1 text-xl font-black text-court-navy">{formatPrice(summary.expected)}</p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="mt-1 text-xl font-black text-court-navy">{formatPrice(summary.outstanding)}</p>
        </article>
      </div>

      {entries.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {entries.map((entry) => (
            <div className="grid gap-4 border-b border-slate-200 p-4 last:border-b-0 lg:grid-cols-[1.1fr_0.8fr_0.7fr_1.4fr]" key={entry.id}>
              <div>
                <p className="font-black text-court-navy">
                  {entry.profiles ? `${entry.profiles.first_name} ${entry.profiles.last_name}` : "Profile unavailable"}
                </p>
                <p className="text-sm text-slate-600">
                  {entry.profiles?.is_junior ? "Junior" : "Adult"} / {formatLabel(entry.profiles?.member_status ?? "")}
                </p>
              </div>
              <div className="text-sm text-slate-700">
                <p className="font-bold text-court-ink">{formatPrice(entry.price_charged)}</p>
                <p>{formatDateTime(entry.created_at)}</p>
              </div>
              <div className="text-sm text-slate-700">
                <p>{formatLabel(entry.payment_status)}</p>
                <p>{formatLabel(entry.entry_status)}</p>
              </div>
              <form action={updateEntryStatuses} className="grid gap-2">
                <input name="entryId" type="hidden" value={entry.id} />
                <input name="eventId" type="hidden" value={params.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Payment
                    <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={entry.payment_status} name="paymentStatus">
                      {paymentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Entry
                    <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={entry.entry_status} name="entryStatus">
                      {entryStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Reference
                  <input className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={entry.payment_reference ?? ""} name="paymentReference" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Payment note
                  <textarea className="mt-1 min-h-16 w-full rounded border border-slate-300 px-3 py-2 text-sm focus-ring" defaultValue={entry.payment_notes ?? ""} name="paymentNotes" />
                </label>
                {entry.payment_received_at ? <p className="text-xs text-slate-500">Received: {formatDateTime(entry.payment_received_at)}</p> : null}
                <button className="rounded bg-court-teal px-3 py-2 text-sm font-bold text-white" type="submit">
                  Save payment
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2 className="section-title">No entries yet</h2>
          <p className="mt-2 text-sm text-slate-600">Entries for this event will appear here as players sign up.</p>
        </div>
      )}
    </PageShell>
  );
}
