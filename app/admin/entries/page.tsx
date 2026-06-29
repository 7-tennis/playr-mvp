import Link from "next/link";
import { updateEntryStatuses } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel, formatPrice } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { CourtSideEvent, EntryStatus, PaymentStatus } from "@/types/courtside";

type EntryRow = {
  id: string;
  event_id: string;
  price_charged: number;
  payment_status: PaymentStatus;
  payment_received_at: string | null;
  payment_reference: string | null;
  payment_notes: string | null;
  entry_status: EntryStatus;
  created_at: string;
  events: { title: string; slug: string } | null;
  profiles: {
    first_name: string;
    last_name: string;
    is_junior: boolean;
    member_status: string;
  } | null;
};

const paymentStatuses: PaymentStatus[] = ["unpaid", "pending", "paid", "refunded", "cancelled"];
const entryStatuses: EntryStatus[] = ["active", "cancelled", "checked_in", "no_show"];

type AdminEntriesPageProps = {
  searchParams?: {
    event_id?: string;
    payment_status?: string;
    entry_status?: string;
    quick_filter?: string;
    admin_message?: string;
  };
};

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

function summarizeEntries(entries: EntryRow[]) {
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

export default async function AdminEntriesPage({ searchParams }: AdminEntriesPageProps) {
  const { supabase } = await getAdminContext();
  const eventId = searchParams?.event_id ?? "all";
  const paymentStatus = searchParams?.payment_status ?? "all";
  const entryStatus = searchParams?.entry_status ?? "all";
  const quickFilter = searchParams?.quick_filter ?? "all";

  const { data: eventData } = await supabase.from("events").select("id,title").order("start_datetime", { ascending: false });

  let query = supabase
    .from("event_entries")
    .select("id,event_id,price_charged,payment_status,payment_received_at,payment_reference,payment_notes,entry_status,created_at,events:event_id(title,slug),profiles:profile_id(first_name,last_name,is_junior,member_status)")
    .order("created_at", { ascending: false })
    .limit(150);

  if (eventId !== "all") {
    query = query.eq("event_id", eventId);
  }

  if (paymentStatuses.includes(paymentStatus as PaymentStatus)) {
    query = query.eq("payment_status", paymentStatus);
  }

  if (entryStatuses.includes(entryStatus as EntryStatus)) {
    query = query.eq("entry_status", entryStatus);
  }

  if (quickFilter === "unpaid_pending") {
    query = query.in("payment_status", ["unpaid", "pending"]);
  }

  if (quickFilter === "paid") {
    query = query.eq("payment_status", "paid");
  }

  if (quickFilter === "active") {
    query = query.eq("entry_status", "active");
  }

  if (quickFilter === "cancelled") {
    query = query.eq("entry_status", "cancelled");
  }

  const { data, error } = await query;
  const events = (eventData ?? []) as Pick<CourtSideEvent, "id" | "title">[];
  const entries = (data ?? []) as unknown as EntryRow[];
  const summary = summarizeEntries(entries);

  return (
    <PageShell eyebrow="ClubR" title="Entries">
      <AdminNav />
      <StatusAlert className="mb-5" message={adminEntryMessage(searchParams?.admin_message)} tone={searchParams?.admin_message === "invalid_entry" ? "error" : "success"} />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-5 grid gap-3 md:grid-cols-5">
          <article className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-xl font-black text-court-navy">{summary.total}</p>
          </article>
          <article className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Paid</p>
            <p className="mt-1 text-xl font-black text-court-navy">{summary.paid}</p>
          </article>
          <article className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Unpaid/pending</p>
            <p className="mt-1 text-xl font-black text-court-navy">{summary.unpaidPending}</p>
          </article>
          <article className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Expected</p>
            <p className="mt-1 text-xl font-black text-court-navy">{formatPrice(summary.expected)}</p>
          </article>
          <article className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Outstanding</p>
            <p className="mt-1 text-xl font-black text-court-navy">{formatPrice(summary.outstanding)}</p>
          </article>
        </div>

        <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={eventId} name="event_id">
            <option value="all">All events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={paymentStatus} name="payment_status">
            <option value="all">All payment statuses</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={entryStatus} name="entry_status">
            <option value="all">All entry statuses</option>
            {entryStatuses.map((status) => (
              <option key={status} value={status}>
                {formatLabel(status)}
              </option>
            ))}
          </select>
          <select className="rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={quickFilter} name="quick_filter">
            <option value="all">All groups</option>
            <option value="unpaid_pending">Unpaid / pending</option>
            <option value="paid">Paid</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="rounded bg-court-blue px-4 py-2 font-bold text-white" type="submit">
            Filter
          </button>
        </form>
        <Link className="mt-3 inline-flex text-sm font-bold text-court-blue" href="/admin/entries">
          Clear filters
        </Link>
        {eventId !== "all" ? (
          <Link className="ml-4 mt-3 inline-flex text-sm font-bold text-court-teal" href={`/admin/results?event_id=${eventId}`}>
            Capture results for this event
          </Link>
        ) : null}

        {error ? <p className="mt-6 rounded bg-amber-50 p-4 text-sm text-amber-900">Entries could not be loaded right now.</p> : null}

        {entries.length > 0 ? (
          <div className="mt-6 divide-y divide-slate-200 overflow-hidden rounded border border-slate-200">
            {entries.map((entry) => (
              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_0.8fr_1.4fr]" key={entry.id}>
                <div>
                  <Link className="font-black text-court-navy hover:text-court-blue" href={`/admin/events/${entry.event_id}/entries`}>
                    {entry.events?.title ?? "Event unavailable"}
                  </Link>
                  <p>
                    <Link className="text-sm font-bold text-court-teal" href={`/admin/results?event_id=${entry.event_id}`}>
                      Capture results
                    </Link>
                  </p>
                  <p className="text-sm text-slate-600">{formatDateTime(entry.created_at)}</p>
                </div>
                <div>
                  <p className="font-bold text-court-ink">
                    {entry.profiles ? `${entry.profiles.first_name} ${entry.profiles.last_name}` : "Profile unavailable"}
                  </p>
                  <p className="text-sm text-slate-600">
                    {entry.profiles?.is_junior ? "Junior" : "Adult"} / {formatLabel(entry.profiles?.member_status ?? "")}
                  </p>
                </div>
                <div className="font-bold text-court-ink">{formatPrice(entry.price_charged)}</div>
                <form action={updateEntryStatuses} className="grid gap-2">
                  <input name="entryId" type="hidden" value={entry.id} />
                  <input name="eventId" type="hidden" value={entry.event_id} />
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
          <p className="mt-6 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No entries match these filters. Clear the filters or choose a different event/status combination.</p>
        )}
      </div>
    </PageShell>
  );
}
