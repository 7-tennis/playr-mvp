import Link from "next/link";
import { EntriesIcon, MembershipIcon, PrivateIcon } from "@/components/playr-icons";
import { StatusAlert } from "@/components/status-alert";
import { loadClubRMembers } from "@/lib/clubr-data";
import { formatLabel } from "@/lib/courtside-format";
import { organisationRoleLabel } from "@/lib/organisations";
import { clubRError } from "@/lib/clubr-ui";
import { ClubRDataErrorCard, ClubRPageFrame, getProtectedClubRPage } from "../clubr-shared";

export const dynamic = "force-dynamic";

type MembersPageProps = {
  searchParams?: { q?: string; status?: string; type?: string; role?: string; error?: string };
};

export default async function ClubRMembersPage({ searchParams }: MembersPageProps) {
  const { content, context, venue } = await getProtectedClubRPage("clubr:members");
  if (content) return content;
  if (!context) return null;

  const result = await loadClubRMembers(context);
  const search = searchParams?.q?.trim().toLowerCase() ?? "";
  const status = ["active", "inactive", "pending"].includes(searchParams?.status ?? "") ? searchParams?.status : "all";
  const type = ["adult", "junior"].includes(searchParams?.type ?? "") ? searchParams?.type : "all";
  const role = searchParams?.role ?? "all";
  const members = result.data.filter((member) => {
    const name = `${member.profile.first_name} ${member.profile.last_name} ${member.profile.email ?? ""}`.toLowerCase();
    return (!search || name.includes(search))
      && (status === "all" || member.status === status)
      && (type === "all" || (type === "junior" ? member.profile.is_junior : !member.profile.is_junior))
      && (role === "all" || member.roles.includes(role as never));
  });

  return (
    <ClubRPageFrame context={context} subtitle="Who belongs to this club?" title="Members" venue={venue}>
      <StatusAlert className="mb-4" message={clubRError(searchParams?.error)} tone="error" />
      {result.error ? <div className="mb-4"><ClubRDataErrorCard error={result.error} title="Members could not be confirmed" /></div> : null}

      <section className="surface-card mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_repeat(3,minmax(0,0.45fr))_auto] md:items-end">
          <label className="text-sm font-bold text-slate-700">Search<input className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={searchParams?.q ?? ""} name="q" placeholder="Name or email" /></label>
          <label className="text-sm font-bold text-slate-700">Status<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={status} name="status"><option value="all">All</option><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option></select></label>
          <label className="text-sm font-bold text-slate-700">Profile<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={type} name="type"><option value="all">All</option><option value="adult">Adult</option><option value="junior">Junior</option></select></label>
          <label className="text-sm font-bold text-slate-700">Role<select className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2.5 focus-ring" defaultValue={role} name="role"><option value="all">All</option><option value="committee">Committee</option><option value="reception">Reception</option><option value="viewer">Member</option><option value="coach">Coach</option></select></label>
          <button className="btn-primary" type="submit">Apply</button>
        </form>
      </section>

      {!result.error ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="ui-chip ui-chip-brand"><MembershipIcon size={14} /> {members.length} shown</span>
          <span className="ui-chip ui-chip-success">{result.data.filter((item) => item.status === "active").length} active</span>
          <span className="ui-chip ui-chip-warning">{result.data.filter((item) => item.status === "pending").length} pending</span>
        </div>
      ) : null}

      {members.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {members.map((member) => {
            const roleLabels = member.roles.filter((item) => item !== "viewer").map(organisationRoleLabel);
            return (
              <article className="surface-card p-4" key={member.membership_id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-court-mist font-black text-court-teal">{member.profile.first_name[0]}{member.profile.last_name[0]}</span>
                    <div className="min-w-0"><h2 className="truncate font-black text-court-navy">{member.profile.first_name} {member.profile.last_name}</h2><p className="mt-0.5 text-sm font-semibold text-slate-500">{member.profile.is_junior ? "Junior" : "Adult"}</p></div>
                  </div>
                  <span className={`ui-chip ${member.status === "active" ? "ui-chip-success" : member.status === "pending" ? "ui-chip-warning" : "ui-chip-muted"}`}>{formatLabel(member.status)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="ui-chip ui-chip-muted"><EntriesIcon size={13} /> Player</span>
                  {member.linked_junior_count > 0 ? <span className="ui-chip ui-chip-brand">{member.linked_junior_count} linked junior{member.linked_junior_count === 1 ? "" : "s"}</span> : null}
                  {member.profile.parent_profile_id ? <span className="ui-chip ui-chip-brand"><PrivateIcon size={13} /> Parent linked</span> : null}
                  {roleLabels.map((label) => <span className="ui-chip ui-chip-muted" key={label}>{label}</span>)}
                </div>
                <Link className="btn-secondary mt-4 w-full" href={`/dashboard/clubr/members/${member.membership_id}`}>View Member</Link>
              </article>
            );
          })}
        </section>
      ) : !result.error ? (
        <section className="empty-state"><h2 className="section-title">No members match these filters</h2><p className="mt-2 text-sm text-slate-600">Adjust the search or status filter to widen this view.</p></section>
      ) : null}
    </ClubRPageFrame>
  );
}
