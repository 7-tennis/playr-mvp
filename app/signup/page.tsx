import Link from "next/link";
import { signUpWithPassword } from "@/app/auth/actions";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export default function SignupPage({ searchParams }: { searchParams?: { error?: string; message?: string; next?: string } }) {
  const next = safeNextPath(searchParams?.next);

  return (
    <PageShell eyebrow="Join" title="Create your PlayR account.">
      <StatusAlert className="mb-4 max-w-md" message={searchParams?.message} tone="success" />
      <StatusAlert className="mb-4 max-w-md" message={searchParams?.error} tone="error" />
      <form action={signUpWithPassword} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <input name="next" type="hidden" value={next} />
        <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
          Email address <span className="font-normal text-slate-500">(required)</span>
        </label>
        <input autoComplete="email" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" id="email" name="email" required type="email" />
        <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="password">
          Password <span className="font-normal text-slate-500">(required)</span>
        </label>
        <input autoComplete="new-password" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" id="password" minLength={6} name="password" required type="password" />
        <p className="mt-2 text-xs leading-5 text-slate-600">Use at least 6 characters. You may need to verify your email before logging in.</p>
        <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="phone">
          Cellphone number <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input autoComplete="tel" className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" id="phone" name="phone" type="tel" />
        <p className="mt-2 text-xs leading-5 text-slate-600">
          We use your cellphone number for important account, booking, lesson, and club-related communication.
        </p>
        <label className="mt-5 flex gap-3 text-sm leading-6 text-slate-700" htmlFor="marketing_consent">
          <input className="mt-1 h-4 w-4 rounded border-slate-300" id="marketing_consent" name="marketing_consent" type="checkbox" />
          <span>I agree to receive optional PlayR marketing updates. This is separate from important account and club communication.</span>
        </label>
        <SubmitButton className="mt-6 w-full rounded bg-court-teal px-4 py-3 font-bold text-white" pendingText="Creating account...">
          Create account
        </SubmitButton>
        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p>Already have an account?</p>
          <Link className="mt-2 inline-flex rounded border border-slate-300 bg-white px-3 py-2 font-bold text-court-blue" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
            Log in
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
