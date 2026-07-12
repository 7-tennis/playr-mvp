import Link from "next/link";
import { BookingIcon, EntriesIcon, MembershipIcon } from "@/components/playr-icons";
import { clubRScopeLabel, loadClubRVenue } from "@/lib/clubr";
import { loadClubRBookings, loadClubRMembers } from "@/lib/clubr-data";
import { formatDate, formatDateTime, formatLabel } from "@/lib/courtside-format";
import { ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  searchParams?: {
    q?: string;
  };
};

export default async function ClubRMembersPage({ searchParams }: MembersPageProps) {
  const { content, context, venue } = await getProtectedClubRPage();

  if (content) {
    return content;
  }

  if (!context) {
    return null;
  }

  const search = searchParams?.q?.trim() ?? "";
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAhead = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const [members, recentBookings] = await Promise.all([
    loadClubRMembers(context, search),
    loadClubRBookings(context, ninetyDaysAgo, ninetyDaysAhead, 240)
  ]);
  const juniorsByParent = new Map<string, typeof members>();
  const bookingsByProfile = new Map<string, typeof recentBookings>();

  members.forEach((member) => {
    if (member.is_junior && member.parent_profile_id) {
      juniorsByParent.set(member.parent_profile_id, [...(juniorsByParent.get(member.parent_profile_id) ?? []), member]);
    }
  });
  recentBookings.forEach((booking) => {
    if (booking.player_profile_id) {
      bookingsByProfile.set(booking.player_profile_id, [...(bookingsByProfile.get(booking.player_profile_id) ?? []), booking]);
    }
  });

  return (
    <ClubRPageFrame context={context} subtitle={`Members visible for ${clubRScopeLabel(context, venue)}.`} title="Members" venue={venue}>
      <section className="surface-card mb-5 p-4 sm:p-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-sm font-semibold text-slate-700">
            Search members
            <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2 focus-ring" defaultValue={search} name="q" placeholder="Name or email" />
          </label>
          <button className="btn-primary self-end" type="submit">
            Search
          </button>
        </form>
        {context.role === "club_admin" ? (
          <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
            Venue-specific member links are inferred from court bookings and lessons until the membership setup has a permanent venue link.
          </p>
        ) : null}
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <article className="stat-card">
          <MembershipIcon size={20} />
          <p className="section-kicker mt-3">Visible profiles</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{members.length}</p>
        </article>
        <article className="stat-card">
          <EntriesIcon size={20} />
          <p className="section-kicker mt-3">Active members</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{members.filter((member) => member.member_status === "member").length}</p>
        </article>
        <article className="stat-card">
          <BookingIcon size={20} />
          <p className="section-kicker mt-3">Recent bookings</p>
          <p className="mt-2 text-3xl font-black text-court-navy">{recentBookings.length}</p>
        </article>
      </section>

      {members.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {members.map((member) => {
            const linkedJuniors = juniorsByParent.get(member.id) ?? [];
            const bookings = bookingsByProfile.get(member.id) ?? [];
            const latestBooking = bookings[0];

            return (
              <article className="surface-card p-4 sm:p-5" key={member.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="section-title">
                      {member.first_name} {member.last_name}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{member.email ?? "No email linked"}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{member.is_junior ? "Junior profile" : "Adult profile"}</p>
                  </div>
                  <span className={`ui-chip ${member.member_status === "member" ? "ui-chip-success" : "ui-chip-muted"}`}>{formatLabel(member.member_status)}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600">
                  <p>Joined {formatDate(member.created_at)}</p>
                  <p>{member.phone ?? "No cellphone linked"}</p>
                  <p>{linkedJuniors.length} linked juniors</p>
                  <p>{latestBooking ? `Latest booking: ${formatDateTime(latestBooking.start_time)} · ${latestBooking.courts?.name ?? "Court"}` : "No recent venue booking"}</p>
                </div>
                {linkedJuniors.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {linkedJuniors.map((junior) => (
                      <span className="ui-chip ui-chip-brand" key={junior.id}>
                        {junior.first_name} {junior.last_name}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="btn-secondary px-3 py-2" href={`/dashboard/players/${member.id}`}>
                    Open Profile
                  </Link>
                  <Link className="btn-secondary px-3 py-2" href="/admin/profiles">
                    Member Admin
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="empty-state">
          <h2 className="section-title">No members found for this view</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            Search again, or create venue-linked activity through bookings and lessons. Permanent venue membership setup can be added later.
          </p>
        </section>
      )}
    </ClubRPageFrame>
  );
}
