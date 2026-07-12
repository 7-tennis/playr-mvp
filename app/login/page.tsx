import Link from "next/link";
import { signInWithPassword } from "@/app/auth/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export default function LoginPage({ searchParams }: { searchParams?: { error?: string; message?: string; next?: string } }) {
  const next = safeNextPath(searchParams?.next);

  return (
    <PageShell eyebrow="Account" title="Log in to manage profiles and entries.">
      <StatusAlert className="mb-4 max-w-md" message={searchParams?.message} tone="success" />
      <StatusAlert className="mb-4 max-w-md" message={searchParams?.error} tone="error" />
      <form action={signInWithPassword} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <input name="next" type="hidden" value={next} />
        <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
          Email address <span className="font-normal text-slate-500">(required)</span>
        </label>
        <input autoComplete="email" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" id="email" name="email" required type="email" />
        <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="password">
          Password <span className="font-normal text-slate-500">(required)</span>
        </label>
        <input autoComplete="current-password" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" id="password" name="password" required type="password" />
        <SubmitButton className="mt-6 w-full rounded bg-court-blue px-4 py-3 font-bold text-white" pendingText="Logging in...">
          Log in
        </SubmitButton>
        <p className="mt-3 text-xs leading-5 text-slate-500">New account? Verify your email first if Supabase sent you a confirmation link.</p>
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p>Need an account?</p>
          <Link className="mt-2 inline-flex rounded border border-slate-300 bg-white px-3 py-2 font-bold text-court-blue" href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
            Sign up
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
