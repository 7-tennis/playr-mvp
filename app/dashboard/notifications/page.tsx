import Link from "next/link";
import { redirect } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/app/dashboard/notifications/actions";
import { PageShell } from "@/components/page-shell";
import { BadgeIcon, BookingIcon, EventIcon, InviteIcon, LeaderboardIcon, MembershipIcon, NotificationIcon, RatingIcon, ShopIcon, TimeIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { formatDateTime, formatLabel } from "@/lib/courtside-format";
import { hasSupabaseConfig } from "@/utils/supabase/config";
import { createServerSupabaseClient } from "@/utils/supabase/server";
import type { Notification, NotificationType } from "@/types/courtside";

export const dynamic = "force-dynamic";

type MessagesPageProps = {
  searchParams?: {
    error?: string;
    marked?: string;
  };
};

type MessageContext = {
  playerName: string;
  sourceName: string;
  sourceType: string;
};

const notificationVisuals: Record<NotificationType, { className: string }> = {
  match_invite_received: { className: "bg-court-mist text-court-teal" },
  match_invite_accepted: { className: "bg-emerald-50 text-emerald-700" },
  match_invite_declined: { className: "bg-slate-100 text-slate-700" },
  match_invite_reminder: { className: "bg-amber-50 text-amber-800" },
  court_booking_confirmed: { className: "bg-court-navy text-white" },
  upcoming_booking_reminder: { className: "bg-amber-50 text-amber-800" },
  event_entry_confirmed: { className: "bg-court-mist text-court-teal" },
  event_reminder: { className: "bg-amber-50 text-amber-800" },
  rating_updated: { className: "bg-court-blue text-white" },
  badge_unlocked: { className: "bg-emerald-50 text-emerald-700" },
  leaderboard_changed: { className: "bg-court-navy text-white" },
  membership_renewal: { className: "bg-court-mist text-court-teal" },
  shop_reservation_update: { className: "bg-slate-100 text-slate-700" },
  coach_invitation: { className: "bg-court-navy text-white" },
  player_link_invitation: { className: "bg-court-mist text-court-teal" },
  parent_approval_required: { className: "bg-amber-50 text-amber-800" },
  invitation_accepted: { className: "bg-emerald-50 text-emerald-700" },
  invitation_declined: { className: "bg-slate-100 text-slate-700" },
  lesson_created: { className: "bg-court-mist text-court-teal" },
  lesson_updated: { className: "bg-sky-50 text-sky-700" },
  lesson_cancelled: { className: "bg-amber-50 text-amber-800" },
  lesson_move_requested: { className: "bg-amber-50 text-amber-800" },
  lesson_time_requested: { className: "bg-court-mist text-court-teal" },
  lesson_move_declined: { className: "bg-slate-100 text-slate-700" },
  lesson_time_confirmed: { className: "bg-emerald-50 text-emerald-700" },
  membership_application_submitted: { className: "bg-court-mist text-court-teal" },
  membership_application_approved: { className: "bg-emerald-50 text-emerald-700" },
  membership_application_declined: { className: "bg-slate-100 text-slate-700" },
  membership_application_correction: { className: "bg-amber-50 text-amber-800" },
  membership_activated: { className: "bg-emerald-50 text-emerald-700" },
  membership_expiring: { className: "bg-amber-50 text-amber-800" },
  membership_expired: { className: "bg-slate-100 text-slate-700" },
  membership_manual_payment_recorded: { className: "bg-court-mist text-court-teal" },
  new_message: { className: "bg-court-navy text-white" }
};

function notificationIcon(type: NotificationType) {
  switch (type) {
    case "match_invite_received":
    case "match_invite_accepted":
    case "match_invite_declined":
    case "coach_invitation":
    case "player_link_invitation":
    case "parent_approval_required":
    case "invitation_accepted":
    case "invitation_declined":
      return <InviteIcon size={20} />;
    case "court_booking_confirmed":
      return <BookingIcon size={20} />;
    case "upcoming_booking_reminder":
    case "match_invite_reminder":
      return <TimeIcon size={20} />;
    case "event_entry_confirmed":
    case "event_reminder":
      return <EventIcon size={20} />;
    case "rating_updated":
      return <RatingIcon size={20} />;
    case "badge_unlocked":
      return <BadgeIcon size={20} />;
    case "leaderboard_changed":
      return <LeaderboardIcon size={20} />;
    case "membership_renewal":
    case "membership_application_submitted":
    case "membership_application_approved":
    case "membership_application_declined":
    case "membership_application_correction":
    case "membership_activated":
    case "membership_expiring":
    case "membership_expired":
    case "membership_manual_payment_recorded":
      return <MembershipIcon size={20} />;
    case "shop_reservation_update":
      return <ShopIcon size={20} />;
    case "lesson_created":
    case "lesson_updated":
    case "lesson_cancelled":
    case "lesson_move_requested":
    case "lesson_time_requested":
    case "lesson_move_declined":
    case "lesson_time_confirmed":
      return <BookingIcon size={20} />;
    default:
      return <NotificationIcon size={20} />;
  }
}

function statusMessage(marked?: string) {
  switch (marked) {
    case "read":
      return "Message marked as read.";
    case "all":
      return "All messages marked as read.";
    default:
      return null;
  }
}

function errorMessage(error?: string) {
  switch (error) {
    case "invalid_notification":
      return "That message could not be found.";
    case "mark_read_failed":
      return "We could not mark that message as read.";
    case "mark_all_failed":
      return "We could not mark messages as read.";
    default:
      return null;
  }
}

function sortNotifications(notifications: Notification[]) {
  return [...notifications].sort((left, right) => {
    if (left.status === "action_required" && right.status !== "action_required") return -1;
    if (left.status !== "action_required" && right.status === "action_required") return 1;
    if (!left.read_at && right.read_at) {
      return -1;
    }
    if (left.read_at && !right.read_at) {
      return 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function metadataId(notification: Notification, keys: string[]) {
  for (const key of keys) {
    const value = notification.metadata[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function messageSource(type: NotificationType) {
  if (type.startsWith("match_") || type.includes("invitation") || type === "parent_approval_required") return "Match & invitation";
  if (type.startsWith("event_")) return "Competition";
  if (type.startsWith("court_") || type.startsWith("upcoming_booking")) return "Booking";
  if (type.startsWith("lesson_") || type === "coach_invitation") return "Academy";
  if (type.startsWith("membership_")) return "Club & membership";
  if (type === "new_message") return "Message";
  return "PlayR update";
}

function NotificationCard({ context, notification }: { context: MessageContext; notification: Notification }) {
  const unread = !notification.read_at;
  const actionRequired = notification.action_required || notification.status === "action_required";
  const resolved = notification.status === "resolved" || notification.status === "expired";
  const visual = notificationVisuals[notification.type] ?? notificationVisuals.match_invite_received;

  return (
    <article className={`rounded-lg border bg-white p-4 shadow-sm sm:p-5 ${actionRequired ? "border-amber-300 ring-2 ring-amber-50" : unread ? "border-court-teal/40 ring-2 ring-court-mist" : "border-slate-200"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded ${visual.className}`}>{notificationIcon(notification.type)}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-court-navy">{notification.title}</h3>
              <span className={`ui-chip ${unread ? "ui-chip-brand" : "ui-chip-muted"}`}>{unread ? "Unread" : "Read"}</span>
              {actionRequired ? <span className="ui-chip ui-chip-warning">Action required</span> : null}
              {resolved ? <span className="ui-chip ui-chip-success">{notification.status === "expired" ? "Expired" : "Resolved"}</span> : null}
              <span className="ui-chip ui-chip-muted">{formatLabel(notification.type)}</span>
            </div>
            <p className="mt-1 text-sm font-black text-court-teal">{context.sourceName}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-600">{context.playerName} · {context.sourceType}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{notification.message}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{formatDateTime(notification.created_at)}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {notification.href ? (
            <Link className="btn-secondary px-3 py-2" href={notification.href}>
              {actionRequired ? "Review" : "Open"}
            </Link>
          ) : null}
          {unread ? (
            <form action={markNotificationRead}>
              <input name="notificationId" type="hidden" value={notification.id} />
              <button className="btn-primary px-3 py-2" type="submit">
                Mark Read
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  if (!hasSupabaseConfig()) {
    return (
      <PageShell eyebrow="Communication" subtitle="Updates from PlayR and your linked organisations." title="Messages">
        <div className="ui-empty-card">Add Supabase environment variables to use messages.</div>
      </PageShell>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const syncResult = await supabase.rpc("sync_my_pending_invitation_notifications");
  if (syncResult.error && syncResult.error.code !== "PGRST202") {
    console.warn("Pending invitation notifications could not be synced", { code: syncResult.error.code, userId: user.id.slice(0, 8) });
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const notifications = sortNotifications((data ?? []) as Notification[]);
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const actionRequiredCount = notifications.filter((notification) => notification.action_required || notification.status === "action_required").length;
  const profileIds = [...new Set(notifications.flatMap((notification) => [notification.profile_id, notification.junior_profile_id]).filter((value): value is string => Boolean(value)))];
  const venueIds = [...new Set(notifications.map((notification) => metadataId(notification, ["organisationId", "organisation_id", "venueId", "venue_id"])).filter((value): value is string => Boolean(value)))];
  const [{ data: profileData }, { data: venueData }] = await Promise.all([
    profileIds.length > 0 ? supabase.from("profiles").select("id,first_name,last_name,is_junior").in("id", profileIds) : { data: [] },
    venueIds.length > 0 ? supabase.from("venues").select("id,name").in("id", venueIds) : { data: [] }
  ]);
  const profileNames = new Map((profileData ?? []).map((profile) => [profile.id as string, `${profile.first_name} ${profile.last_name}${profile.is_junior ? " · Junior" : " · Adult Profile"}`]));
  const venueNames = new Map((venueData ?? []).map((venue) => [venue.id as string, venue.name as string]));
  const contextFor = (notification: Notification): MessageContext => {
    const playerId = notification.junior_profile_id ?? notification.profile_id;
    const venueId = metadataId(notification, ["organisationId", "organisation_id", "venueId", "venue_id"]);
    return {
      playerName: playerId ? profileNames.get(playerId) ?? "Linked player" : "PlayR account",
      sourceName: venueId ? venueNames.get(venueId) ?? "Linked organisation" : "PlayR",
      sourceType: messageSource(notification.type)
    };
  };
  const actionItems = notifications.filter((notification) => notification.action_required || notification.status === "action_required");
  const recentItems = notifications.filter((notification) => !actionItems.some((item) => item.id === notification.id));

  return (
    <PageShell
      eyebrow="Communication"
      subtitle="Updates from PlayR and your linked organisations."
      title="Messages"
    >
      <StatusAlert className="mb-5" message={statusMessage(searchParams?.marked)} tone="success" />
      <StatusAlert className="mb-5" message={errorMessage(searchParams?.error)} tone="error" />
      {error ? <StatusAlert className="mb-5" message="Messages could not be loaded right now." tone="error" /> : null}

      <div className="grid gap-5">
        <section className="surface-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">Inbox</p>
              <h2 className="section-title mt-1">{unreadCount} unread</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{actionRequiredCount > 0 ? `${actionRequiredCount} need your action.` : "Latest private PlayR updates appear here first."}</p>
            </div>
            {unreadCount > 0 ? (
              <form action={markAllNotificationsRead}>
                <button className="btn-secondary w-full sm:w-auto" type="submit">
                  Mark All Read
                </button>
              </form>
            ) : null}
          </div>
        </section>

        {notifications.length > 0 ? (
          <>
            {actionItems.length > 0 ? (
              <section aria-labelledby="action-required" className="grid gap-3">
                <div><p className="section-kicker">Priority</p><h2 className="section-title mt-1" id="action-required">Action Required</h2></div>
                {actionItems.map((notification) => <NotificationCard context={contextFor(notification)} key={notification.id} notification={notification} />)}
              </section>
            ) : null}
            {recentItems.length > 0 ? (
              <section aria-labelledby="recent-updates" className="grid gap-3">
                <div><p className="section-kicker">Inbox</p><h2 className="section-title mt-1" id="recent-updates">Recent Messages & Updates</h2></div>
                {recentItems.map((notification) => <NotificationCard context={contextFor(notification)} key={notification.id} notification={notification} />)}
              </section>
            ) : null}
          </>
        ) : (
          <section className="empty-state">
            <h2 className="section-title">No new messages</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              Updates from your clubs, academies and competitions will appear here.
            </p>
            <Link className="btn-primary mt-5" href="/dashboard">
              View your players
            </Link>
          </section>
        )}
      </div>
    </PageShell>
  );
}
