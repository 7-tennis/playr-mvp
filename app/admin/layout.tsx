import type { ReactNode } from "react";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin-auth";
import { hasSupabaseConfig } from "@/utils/supabase/config";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!hasSupabaseConfig()) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10">
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

  const { isAdmin } = await getAdminContext();

  if (!isAdmin) {
    return (
      <main className="mx-auto min-h-[70vh] max-w-3xl px-4 py-10">
        <p className="text-sm font-black uppercase tracking-wide text-court-teal">ClubR Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-court-navy md:text-5xl">Access denied.</h1>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-slate-700">Your account is signed in, but it is not listed in ClubR admin users.</p>
          <Link className="mt-5 inline-flex rounded bg-court-blue px-4 py-3 font-bold text-white" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return children;
}
