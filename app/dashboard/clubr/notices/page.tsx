import { saveClubNotice, toggleClubNotice } from "@/app/dashboard/clubr/actions";
import { CollapsibleCard } from "@/components/collapsible-card";
import { NotificationIcon, StatusIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRNotices, noticeIsActive } from "@/lib/clubr-data";
import { clubRError, clubRMessage } from "@/lib/clubr-ui";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { canAccessClubRPermission } from "@/lib/permissions";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

function dateTimeInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  return parts.replace(" ", "T");
}

export default async function ClubRNoticesPage({ searchParams }: { searchParams?: { error?: string; message?: string } }) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:notices");
  if (content) return content;
  if (!context) return null;
  const result = await loadClubRNotices(context);
  const canManage = canAccessClubRPermission(context.role, "clubr:notices:manage");

  return (
    <ClubRPageFrame context={context} subtitle="What information must the club communicate?" title="Notices" venue={venue}>
      <StatusAlert className="mb-4" message={clubRMessage(searchParams?.message)} tone="success" />
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {result.error ? <div className="mb-4"><ClubRDataErrorCard error={result.error} title="Notices could not be loaded" /></div> : null}

      {canManage && venue ? <div className="mb-4"><CollapsibleCard summary="Publish one concise update for club staff" title="Create Notice"><form action={saveClubNotice} className="grid gap-3 sm:grid-cols-2"><input name="venueId" type="hidden" value={venue.id} /><label className="text-sm font-bold text-slate-700 sm:col-span-2">Title<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="title" required /></label><label className="text-sm font-bold text-slate-700">Category<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue="general" name="category"><option value="pinned">Pinned</option><option value="general">General</option><option value="maintenance">Maintenance</option><option value="important">Important</option></select></label><label className="flex items-center gap-2 self-end rounded border border-slate-200 p-3 text-sm font-bold text-slate-700"><input defaultChecked name="isActive" type="checkbox" /> Active</label><label className="text-sm font-bold text-slate-700">Starts<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="startsAt" type="datetime-local" /></label><label className="text-sm font-bold text-slate-700">Ends<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="endsAt" type="datetime-local" /></label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Short message<textarea className="mt-1.5 min-h-24 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" name="noticeMessage" required /></label><button className="btn-primary sm:col-span-2" type="submit">Publish Notice</button></form></CollapsibleCard></div> : null}

      {!result.error && result.data.length > 0 ? <section className="grid gap-3 md:grid-cols-2">{result.data.map((notice) => { const active = noticeIsActive(notice); return <CollapsibleCard badge={<span className={`ui-chip ${active ? "ui-chip-success" : "ui-chip-muted"}`}><StatusIcon size={13} /> {active ? "Active" : "Inactive"}</span>} key={notice.id} summary={notice.message} title={notice.title}><div className="flex flex-wrap gap-2"><span className="ui-chip ui-chip-brand"><NotificationIcon size={13} /> {formatLabel(notice.category)}</span><span className="ui-chip ui-chip-muted">{notice.author_name ?? "Club staff"} · {formatDate(notice.created_at)}</span></div>{canManage ? <form action={saveClubNotice} className="mt-4 grid gap-3 sm:grid-cols-2"><input name="venueId" type="hidden" value={notice.venue_id} /><input name="noticeId" type="hidden" value={notice.id} /><label className="text-sm font-bold text-slate-700 sm:col-span-2">Title<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={notice.title} name="title" required /></label><label className="text-sm font-bold text-slate-700">Category<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={notice.category} name="category"><option value="pinned">Pinned</option><option value="general">General</option><option value="maintenance">Maintenance</option><option value="important">Important</option></select></label><label className="flex items-center gap-2 self-end rounded border border-slate-200 p-3 text-sm font-bold text-slate-700"><input defaultChecked={notice.is_active} name="isActive" type="checkbox" /> Active</label><label className="text-sm font-bold text-slate-700">Starts<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={dateTimeInput(notice.starts_at)} name="startsAt" type="datetime-local" /></label><label className="text-sm font-bold text-slate-700">Ends<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={dateTimeInput(notice.ends_at)} name="endsAt" type="datetime-local" /></label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Message<textarea className="mt-1.5 min-h-24 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={notice.message} name="noticeMessage" required /></label><button className="btn-primary sm:col-span-2" type="submit">Save Notice</button></form> : null}{canManage ? <form action={toggleClubNotice} className="mt-3 rounded bg-slate-50 p-3"><input name="venueId" type="hidden" value={notice.venue_id} /><input name="noticeId" type="hidden" value={notice.id} /><input name="active" type="hidden" value={notice.is_active ? "false" : "true"} /><p className="text-sm font-bold text-slate-700">{notice.is_active ? "Unpublish this notice?" : "Publish this notice again?"}</p><button className="btn-secondary mt-2" type="submit">Confirm</button></form> : null}</CollapsibleCard>; })}</section> : !result.error ? <section className="empty-state"><h2 className="section-title">No active notices</h2><p className="mt-2 text-sm text-slate-600">Create a notice when members or club staff need an update.</p></section> : null}
    </ClubRPageFrame>
  );
}
