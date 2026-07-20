import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { PageShell } from "@/components/page-shell";
import { EntriesIcon, MessagesIcon, PrivateIcon, SettingsIcon } from "@/components/playr-icons";
import { PlayRCard } from "@/components/playr-ui";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

function SettingsLink({ description, href, icon, title }: { description: string; href: string; icon: React.ReactNode; title: string }) {
  return (
    <Link className="group rounded-playr-lg focus-ring" href={href}>
      <PlayRCard as="article" className="h-full p-5 group-hover:-translate-y-0.5" variant="interactive">
        <span className="grid h-11 w-11 place-items-center rounded-playr-md bg-court-mist text-court-teal">{icon}</span>
        <h2 className="mt-4 text-lg font-black text-court-navy">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <span className="mt-4 inline-flex text-sm font-black text-court-blue">Open settings</span>
      </PlayRCard>
    </Link>
  );
}

export default async function SettingsPage() {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Account" subtitle="Manage privacy, account and communication preferences." title="Settings">
        <div className="empty-state">Add Supabase environment variables to use account settings.</div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,marketing_consent")
    .eq("user_id", user.id)
    .eq("is_junior", false)
    .maybeSingle();

  return (
    <PageShell eyebrow="Account" subtitle="Manage privacy, account and communication preferences." title="Settings">
      <section aria-labelledby="settings-groups" className="grid gap-4 md:grid-cols-2">
        <h2 className="sr-only" id="settings-groups">Settings groups</h2>
        <SettingsLink
          description="Edit your name, contact details, sport, player level and the optional marketing preference."
          href="/dashboard/profile#account-details"
          icon={<SettingsIcon size={20} />}
          title="Account details"
        />
        <SettingsLink
          description="Review private member details and the account information visible only in your signed-in dashboard."
          href="/dashboard/profile#account-settings"
          icon={<PrivateIcon size={20} />}
          title="Privacy & communication"
        />
        <SettingsLink
          description="Add or update junior profiles linked to this parent account."
          href="/dashboard/juniors"
          icon={<EntriesIcon size={20} />}
          title="Linked players"
        />
        <SettingsLink
          description="Review private updates and use the existing read-state controls."
          href="/dashboard/messages"
          icon={<MessagesIcon size={20} />}
          title="Message preferences"
        />
      </section>

      <PlayRCard as="section" className="mt-6 p-5" variant="muted">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Session</p>
            <h2 className="section-title mt-1">Signed in as {user.email ?? "your PlayR account"}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {profile ? `Optional marketing updates are ${profile.marketing_consent ? "on" : "off"}.` : "Create your player profile to manage account preferences."}
            </p>
          </div>
          <form action={signOut}>
            <button className="btn-secondary w-full sm:w-auto" type="submit">Sign out</button>
          </form>
        </div>
      </PlayRCard>
    </PageShell>
  );
}
