import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, ClubIcon, DistrictIcon, SchoolIcon, StageIcon } from "@/components/playr-icons";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import {
  organisationSummaryLabel,
  organisationTypeLabel,
  type PlayerClubMembership,
  type PlayerOrganisation
} from "@/lib/player-organisations";
import type { OrganisationLinkStatus, OrganisationType } from "@/types/courtside";

const typeStyles: Record<OrganisationType, { icon: string; strip: string; wash: string }> = {
  club: { icon: "bg-court-mist text-court-teal", strip: "from-court-navy via-court-teal to-emerald-500", wash: "bg-emerald-50/50" },
  academy: { icon: "bg-sky-50 text-court-blue", strip: "from-court-navy via-court-blue to-court-teal", wash: "bg-sky-50/50" },
  school: { icon: "bg-blue-50 text-court-navy", strip: "from-court-navy via-blue-700 to-court-blue", wash: "bg-blue-50/50" },
  district: { icon: "bg-slate-100 text-slate-800", strip: "from-slate-950 via-court-navy to-court-teal", wash: "bg-slate-50" },
  club_academy: { icon: "bg-court-mist text-court-teal", strip: "from-court-navy via-court-blue to-court-teal", wash: "bg-court-mist/60" },
  school_district: { icon: "bg-blue-50 text-court-navy", strip: "from-slate-950 via-court-navy to-court-blue", wash: "bg-blue-50/50" }
};

function OrganisationIcon({ type, size = 18 }: { type: OrganisationType; size?: number }) {
  if (type === "academy") return <StageIcon size={size} />;
  if (type === "school") return <SchoolIcon size={size} />;
  if (type === "district" || type === "school_district") return <DistrictIcon size={size} />;
  return <ClubIcon size={size} />;
}

function statusLabel(status: OrganisationLinkStatus, inactive: boolean) {
  if (inactive) return "Organisation inactive";
  if (status === "active") return "Connected";
  if (status === "suspended") return "Connection paused";
  return "Invitation pending";
}

function statusClass(status: OrganisationLinkStatus, inactive: boolean) {
  if (inactive || status === "suspended") return "ui-chip-warning";
  if (status === "active") return "ui-chip-success";
  return "ui-chip-muted";
}

export function PlayerOrganisationSummary({ organisations }: { organisations: PlayerOrganisation[] }) {
  const visibleTypes = Array.from(new Set(organisations.map((organisation) => organisation.venue?.organisation_type).filter(Boolean))) as OrganisationType[];
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700">
      {visibleTypes.length ? (
        <span className="flex shrink-0 -space-x-1" aria-hidden>
          {visibleTypes.slice(0, 4).map((type) => (
            <span className={`grid h-7 w-7 place-items-center rounded-full border-2 border-white ${typeStyles[type].icon}`} key={type}>
              <OrganisationIcon size={14} type={type} />
            </span>
          ))}
        </span>
      ) : null}
      <span className="min-w-0 break-words">{organisationSummaryLabel(organisations)}</span>
    </div>
  );
}

export type OrganisationCardMeta = {
  membership?: PlayerClubMembership | null;
  supportingDetails?: ReactNode;
};

export function OrganisationCard({
  organisation,
  playerProfileId,
  meta
}: {
  organisation: PlayerOrganisation;
  playerProfileId: string;
  meta?: OrganisationCardMeta;
}) {
  if (!organisation.venue) return null;
  const { venue } = organisation;
  const type = venue.organisation_type;
  const styles = typeStyles[type];
  const location = [venue.suburb, venue.town, venue.city].filter(Boolean).join(", ") || venue.address;
  const membership = meta?.membership;
  const canOpenClub = type === "club" || type === "club_academy";

  return (
    <article aria-label={`${organisationTypeLabel(type)}: ${venue.name}`} className="surface-card flex min-w-0 flex-col overflow-hidden">
      <div className={`h-1.5 bg-gradient-to-r ${styles.strip}`} />
      <div className={`flex flex-1 flex-col p-4 sm:p-5 ${styles.wash}`}>
        <div className="flex min-w-0 items-start gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${styles.icon}`}>
            <OrganisationIcon size={21} type={type} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">{organisationTypeLabel(type)}</p>
            <h3 className="mt-1 break-words text-lg font-black leading-tight text-court-navy">{venue.name}</h3>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`ui-chip ${statusClass(organisation.status, venue.status === "inactive")}`}>
            {statusLabel(organisation.status, venue.status === "inactive")}
          </span>
          {membership ? <span className="ui-chip ui-chip-brand">{formatLabel(membership.status)}</span> : null}
        </div>

        <div className="mt-4 space-y-1.5 text-sm text-slate-600">
          {membership?.planName ? <p><span className="font-bold text-slate-800">Membership:</span> {membership.planName}</p> : null}
          {membership?.subscription?.expiryDate ? <p><span className="font-bold text-slate-800">Expires:</span> {formatDate(membership.subscription.expiryDate)}</p> : null}
          {location ? <p><span className="font-bold text-slate-800">Location:</span> {location}</p> : null}
          {meta?.supportingDetails}
        </div>

        {canOpenClub ? (
          <Link
            aria-label={`View ${venue.name} for this player`}
            className="btn-secondary mt-auto w-full justify-between"
            href={`/dashboard/venues/${venue.id}?profile=${playerProfileId}`}
          >
            View Club <ArrowRightIcon size={16} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function OrganisationEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-court-teal shadow-sm"><ClubIcon size={20} /></div>
      <h3 className="mt-3 font-black text-court-navy">No organisations linked yet</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Club, academy, school and district connections will appear here once they are linked to this player.</p>
    </div>
  );
}
