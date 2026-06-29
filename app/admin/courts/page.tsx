import { AdminNav } from "@/components/admin-nav";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { createCourt, updateCourt } from "@/app/admin/actions";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { getAdminContext } from "@/lib/admin-auth";
import type { Court, CourtStatus } from "@/types/courtside";

export const dynamic = "force-dynamic";

const courtStatuses: CourtStatus[] = ["active", "inactive"];

function message(value?: string) {
  switch (value) {
    case "court_created":
      return "Court created.";
    case "court_updated":
      return "Court updated.";
    case "missing_court_name":
      return "Court name is required.";
    case "court_save_failed":
      return "Court could not be saved.";
    case "invalid_court":
      return "Court could not be found.";
    default:
      return null;
  }
}

export default async function AdminCourtsPage({ searchParams }: { searchParams?: { admin_message?: string } }) {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("courts").select("*").order("sort_order", { ascending: true });
  const courts = (data ?? []) as Court[];

  return (
    <PageShell eyebrow="ClubR" title="Courts">
      <AdminNav />
      <StatusAlert className="mb-5" message={message(searchParams?.admin_message)} tone={searchParams?.admin_message?.includes("failed") ? "error" : "success"} />

      <section className="surface-card mb-6 p-5">
        <h2 className="section-title">Create court</h2>
        <form action={createCourt} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">
            Name
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="name" placeholder="Court 5" required />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Sort
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="sort_order" type="number" defaultValue={courts.length + 1} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Status
            <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="status" defaultValue="active">
              {courtStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Notes
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" placeholder="Optional" />
          </label>
          <button className="rounded bg-court-blue px-4 py-2 font-bold text-white" type="submit">
            Create
          </button>
        </form>
      </section>

      {error ? <StatusAlert className="mb-5" message="Courts could not be loaded right now." tone="error" /> : null}

      {courts.length === 0 ? (
        <section className="empty-state">
          <h2 className="section-title">No courts yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Create courts here so players can book them from PlayR.</p>
        </section>
      ) : (
        <div className="grid gap-4">
          {courts.map((court) => (
            <form action={updateCourt} className="rounded-lg border border-slate-200 bg-white p-5" key={court.id}>
              <input name="courtId" type="hidden" value={court.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_1fr_auto] md:items-end">
                <label className="text-sm font-semibold text-slate-700">
                  Name
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="name" defaultValue={court.name} required />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Sort
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="sort_order" type="number" defaultValue={court.sort_order} />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Status
                  <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="status" defaultValue={court.status}>
                    {courtStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Notes
                  <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" name="notes" defaultValue={court.notes ?? ""} />
                </label>
                <button className="rounded bg-court-teal px-4 py-2 font-bold text-white" type="submit">
                  Save
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">Created {formatDate(court.created_at)}. Set status to inactive to hide this court from player bookings.</p>
            </form>
          ))}
        </div>
      )}
    </PageShell>
  );
}
