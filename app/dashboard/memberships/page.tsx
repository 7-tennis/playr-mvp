import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipApplicationCard, MembershipSubscriptionCard } from "@/components/membership-ui";
import { PageShell } from "@/components/page-shell";
import { ClubIcon, MembershipIcon } from "@/components/playr-icons";
import { loadMembershipApplications, loadMembershipSubscriptions } from "@/lib/club-memberships";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Profile, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

type ClubRelationship = { venue_id: string; venue: Pick<Venue, "id" | "name"> | null };

export default async function MyMembershipsPage() {
  if (!hasSupabaseConfig()) return <PageShell eyebrow="MyPlayR" title="Memberships"><div className="ui-empty-card">Supabase is not configured.</div></PageShell>;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: adultData } = await supabase.from("profiles").select("id,first_name,last_name,is_junior").eq("user_id", user.id).eq("is_junior", false).maybeSingle();
  const adult = adultData as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior"> | null;
  const { data: juniorData } = adult ? await supabase.from("profiles").select("id,first_name,last_name,is_junior").eq("parent_profile_id", adult.id) : { data: [] };
  const profileIds = [adult?.id, ...((juniorData ?? []) as Pick<Profile, "id">[]).map((profile) => profile.id)].filter((id): id is string => Boolean(id));
  const [applications, subscriptions, clubRows, linkRows] = await Promise.all([
    loadMembershipApplications(supabase),
    loadMembershipSubscriptions(supabase),
    profileIds.length > 0 ? supabase.from("club_memberships").select("venue_id,venue:venue_id(id,name)").in("profile_id", profileIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length > 0 ? supabase.from("organisation_player_links").select("venue_id,venue:venue_id(id,name)").in("player_profile_id", profileIds).in("status", ["pending", "active", "suspended"]) : Promise.resolve({ data: [], error: null })
  ]);
  const relationships = [...((clubRows.data ?? []) as unknown as ClubRelationship[]), ...((linkRows.data ?? []) as unknown as ClubRelationship[])];
  const clubs = Array.from(new Map(relationships.filter((item) => item.venue).map((item) => [item.venue_id, item.venue!] as const)).values());
  const currentApplications = applications.data.filter((item) => ["pending_application", "pending_approval", "correction_requested"].includes(item.status));
  const currentSubscriptions = subscriptions.data.filter((item) => ["pending_activation", "active", "paused", "expiring"].includes(item.status));

  return (
    <PageShell eyebrow="MyPlayR" subtitle="Your club applications, memberships and upcoming amounts." title="Memberships">
      <Link className="mb-4 inline-block font-bold text-court-blue" href="/dashboard">Back to MyPlayR</Link>
      {currentSubscriptions.length > 0 ? <section className="mb-6"><div className="mb-3 flex items-center justify-between"><div><p className="section-kicker">Club membership</p><h2 className="section-title mt-1">Current Memberships</h2></div><MembershipIcon className="text-court-teal" size={20} /></div><div className="grid gap-4 lg:grid-cols-2">{currentSubscriptions.map((subscription) => <MembershipSubscriptionCard href={`/dashboard/memberships/${subscription.id}`} key={subscription.id} subscription={subscription} />)}</div></section> : null}
      {currentApplications.length > 0 ? <section className="mb-6"><div className="mb-3"><p className="section-kicker">Applications</p><h2 className="section-title mt-1">In Progress</h2></div><div className="grid gap-4 lg:grid-cols-2">{currentApplications.map((application) => <MembershipApplicationCard application={application} href={`/dashboard/memberships/applications/${application.id}`} key={application.id} />)}</div></section> : null}
      <section><div className="mb-3"><p className="section-kicker">Clubs</p><h2 className="section-title mt-1">Membership Access</h2></div>{clubs.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">{clubs.map((club) => {
        const subscription = currentSubscriptions.find((item) => item.venue_id === club.id);
        const application = currentApplications.find((item) => item.venue_id === club.id);
        const href = subscription ? `/dashboard/memberships/${subscription.id}` : application ? `/dashboard/memberships/applications/${application.id}` : `/dashboard/memberships/join?venue=${club.id}`;
        const action = subscription ? "View Membership" : application ? "Application Pending" : "Choose Membership";
        return <Link className="action-card flex items-center justify-between gap-3" href={href} key={club.id}><span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-court-mist text-court-teal"><ClubIcon size={19} /></span><span><span className="block font-black text-court-navy">{club.name}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{action}</span></span></span><span className="btn-secondary px-3 py-2">Open</span></Link>;
      })}</div> : <div className="ui-empty-card">You do not currently have a club relationship. Connect with a club to choose a membership.</div>}</section>
    </PageShell>
  );
}
