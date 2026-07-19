import { MembershipSubscriptionCard } from "@/components/membership-ui";
import { loadMembershipSubscriptions } from "@/lib/club-memberships";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../../clubr-shared";

export const dynamic = "force-dynamic";

export default async function MembershipSubscriptionsPage() {
  const { content, context, venue } = await getProtectedClubRPage("clubr:memberships:subscriptions");
  if (content) return content;
  if (!context || !venue) return null;
  const subscriptions = await loadMembershipSubscriptions(context.supabase, venue.id);
  const current = subscriptions.data.filter((item) => ["active", "pending_activation", "paused", "expiring"].includes(item.status));
  const history = subscriptions.data.filter((item) => ["expired", "cancelled"].includes(item.status));
  return <ClubRPageFrame context={context} subtitle="What is the status and structure of each membership?" title="Subscriptions" venue={venue}>{subscriptions.error ? <ClubRDataErrorCard error={subscriptions.error} title="Subscriptions could not be loaded" /> : <><section><div className="mb-3 flex items-center justify-between"><h2 className="section-title">Current Memberships</h2><span className="ui-chip ui-chip-muted">{current.length}</span></div>{current.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{current.map((subscription) => <MembershipSubscriptionCard href={`/dashboard/clubr/memberships/subscriptions/${subscription.id}`} key={subscription.id} subscription={subscription} />)}</div> : <div className="ui-empty-card">No current membership subscriptions.</div>}</section>{history.length > 0 ? <section className="mt-6"><div className="mb-3 flex items-center justify-between"><h2 className="section-title">History</h2><span className="ui-chip ui-chip-muted">{history.length}</span></div><div className="grid gap-4 lg:grid-cols-2">{history.map((subscription) => <MembershipSubscriptionCard href={`/dashboard/clubr/memberships/subscriptions/${subscription.id}`} key={subscription.id} subscription={subscription} />)}</div></section> : null}</>}</ClubRPageFrame>;
}
