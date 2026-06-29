import { createEvent } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin-nav";
import { AdminEventForm } from "@/components/admin-event-form";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";

export const dynamic = "force-dynamic";

export default function NewEventPage({ searchParams }: { searchParams?: { error?: string } }) {
  return (
    <PageShell eyebrow="ClubR Events" title="Create Event">
      <AdminNav />
      <StatusAlert className="mb-4" message={searchParams?.error ? "Event could not be saved. Check the fields and try again." : null} tone="error" />
      <AdminEventForm action={createEvent} submitLabel="Create event" />
    </PageShell>
  );
}
