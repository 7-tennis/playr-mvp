import Link from "next/link";
import { BellIcon, TimeIcon } from "@/components/playr-icons";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import type { Notification } from "@/types/courtside";
import { CoachRPageFrame, CoachRRoleSummary, getProtectedCoachRPage } from "../coachr-shared";

export const dynamic = "force-dynamic";

type CoachRMessagesPageProps = {
  searchParams?: {
    filter?: string;
    q?: string;
  };
};

function matchesFilter(notification: Notification, filter: string) {
  if (filter === "unread") {
    return !notification.read_at;
  }
  if (filter === "lesson") {
    return notification.href?.startsWith("/dashboard/coachr") || /lesson|schedule|attendance|feedback/i.test(`${notification.title} ${notification.message}`);
  }
  if (filter === "attendance") {
    return /attendance|missed|rain|sick|cancelled/i.test(`${notification.title} ${notification.message}`);
  }

  return true;
}

export default async function CoachRMessagesPage({ searchParams }: CoachRMessagesPageProps) {
  const { access, content } = await getProtectedCoachRPage("coachr:messages");

  if (content) {
    return content;
  }

  if (access.context.kind !== "authenticated") {
    return null;
  }

  const query = (searchParams?.q ?? "").trim().toLowerCase();
  const filter = searchParams?.filter ?? "";
  await access.context.supabase.rpc("sync_my_pending_invitation_notifications");
  const { data, error } = await access.context.supabase
    .from("notifications")
    .select("*")
    .eq("user_id", access.context.user.id)
    .order("created_at", { ascending: false })
    .limit(80);
  const messages = ((data ?? []) as Notification[])
    .filter((notification) => matchesFilter(notification, filter))
    .filter((notification) => (query ? `${notification.title} ${notification.message}`.toLowerCase().includes(query) : true));
  const unreadCount = messages.filter((message) => !message.read_at).length;

  return (
    <CoachRPageFrame context={access.context} subtitle="Lesson updates and coaching messages prepared for Phase 8 feedback." title="Messages">
      <CoachRRoleSummary context={access.context} />

      <section className="surface-card mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Message Centre</p>
            <h2 className="section-title mt-1">{unreadCount} unread</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">This uses existing in-app notifications. Feedback threads can plug in here later.</p>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" method="get">
            <input className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={query} name="q" placeholder="Search player or parent" />
            <select className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold focus-ring" defaultValue={filter} name="filter">
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="lesson">Lesson updates</option>
              <option value="attendance">Attendance</option>
              <option value="feedback">Feedback ready</option>
            </select>
            <button className="btn-primary px-3 py-2" type="submit">
              Filter
            </button>
          </form>
        </div>
      </section>

      {error ? <div className="ui-empty-card mb-5">Messages could not be loaded right now.</div> : null}

      {messages.length > 0 ? (
        <section className="grid gap-3">
          {messages.map((message) => (
            <details className={`ui-collapsible rounded-lg border bg-white p-4 shadow-sm ${message.read_at ? "border-slate-200" : "border-court-teal/40 ring-2 ring-court-mist"}`} key={message.id}>
              <summary className="flex cursor-pointer items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
                  <BellIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black text-court-navy">{message.title}</h2>
                    <span className={`ui-chip ${message.read_at ? "ui-chip-muted" : "ui-chip-brand"}`}>{message.read_at ? "Read" : "Unread"}</span>
                    <span className="ui-chip ui-chip-muted">{formatLabel(message.type)}</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <TimeIcon size={13} /> {formatDateTime(message.created_at)}
                  </p>
                </div>
              </summary>
              <div className="mt-3 border-t border-slate-100 pt-3 sm:pl-14">
                <p className="text-sm leading-6 text-slate-700">{message.message}</p>
                {message.href ? (
                  <Link className="btn-secondary mt-3 inline-flex px-3 py-2" href={message.href}>
                    Open
                  </Link>
                ) : null}
              </div>
            </details>
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <h2 className="section-title">No lesson updates yet.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Lesson created, moved, attendance and feedback updates can appear here as the notification layer grows.
          </p>
        </section>
      )}
    </CoachRPageFrame>
  );
}
