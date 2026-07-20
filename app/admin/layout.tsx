import type { ReactNode } from "react";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin-auth";
import { hasSupabaseConfig } from "@/utils/supabase/config";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="playr-page-surface mx-auto min-h-[70vh] w-full max-w-3xl px-4 py-10 sm:my-5 sm:w-[calc(100%-2rem)] sm:rounded-playr-xl">
        <p className="text-sm font-black uppercase tracking-wide text-court-teal">ClubR Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy md:text-5xl">Supabase is not configured.</h1>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to use ClubR Admin.
          </p>
        </div>
      </main>
    );
  }

  const { adminRole, isAdmin, roleSource, storedRole, user, venueId } = await getAdminContext();

  if (!isAdmin) {
    console.warn("[playr-permissions]", {
      event: "admin_access_restricted",
      userId: `${user.id.slice(0, 8)}...`,
      resolvedRole: adminRole,
      storedRole,
      roleSource,
      venueLinked: Boolean(venueId)
    });

    return (
      <main className="playr-page-surface mx-auto min-h-[70vh] w-full max-w-3xl px-4 py-10 sm:my-5 sm:w-[calc(100%-2rem)] sm:rounded-playr-xl">
        <p className="text-sm font-black uppercase tracking-wide text-court-teal">ClubR Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy md:text-5xl">Access restricted.</h1>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Your account is signed in, but it does not have ClubR admin permission.</p>
          <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return children;
}
