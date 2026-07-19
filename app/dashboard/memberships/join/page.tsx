import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembershipJoinWizard } from "@/components/membership-join-wizard";
import { PageShell } from "@/components/page-shell";
import { StatusAlert } from "@/components/status-alert";
import { loadMembershipPlans } from "@/lib/club-memberships";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Profile, Venue } from "@/types/courtside";

export const dynamic = "force-dynamic";

export default async function JoinMembershipPage({ searchParams }: { searchParams?: { error?: string; venue?: string } }) {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const venueId = searchParams?.venue;
  if (!venueId) notFound();
  const [{ data: venueData }, { data: adultData }, plans] = await Promise.all([
    supabase.from("venues").select("id,name").eq("id", venueId).maybeSingle(),
    supabase.from("profiles").select("id,first_name,last_name,is_junior,date_of_birth").eq("user_id", user.id).eq("is_junior", false).maybeSingle(),
    loadMembershipPlans(supabase, venueId)
  ]);
  const venue = venueData as Pick<Venue, "id" | "name"> | null;
  const adult = adultData as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "date_of_birth"> | null;
  if (!venue || !adult) notFound();
  const { data: juniors } = await supabase.from("profiles").select("id,first_name,last_name,is_junior,date_of_birth").eq("parent_profile_id", adult.id).eq("is_junior", true);
  const profiles = [adult, ...((juniors ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "is_junior" | "date_of_birth">[])];
  const activePlans = plans.data.filter((plan) => plan.status === "active" && !plan.is_legacy && plan.pricingOptions.some((option) => option.is_active));
  return (
    <PageShell eyebrow="MyPlayR" subtitle="Choose who is joining and see the verified price before applying." title={`Join ${venue.name}`}>
      <StatusAlert className="mb-4" message={searchParams?.error === "duplicate" ? "A current membership or application already exists for one of the selected members." : searchParams?.error ? "The application could not be submitted. No membership was created." : null} tone="error" />
      <Link className="mb-4 inline-block font-bold text-court-blue" href="/dashboard/memberships">Back to Memberships</Link>
      {plans.error ? <div className="ui-empty-card">Membership plans could not be loaded. Try again before submitting an application.</div> : activePlans.length > 0 ? <MembershipJoinWizard plans={activePlans} profiles={profiles} venue={venue} /> : <div className="ui-empty-card">No eligible membership plans are available right now. Contact {venue.name} for help.</div>}
    </PageShell>
  );
}
