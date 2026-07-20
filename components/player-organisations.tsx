import type { ReactNode } from "react";
import { ArrowRightIcon, ClubIcon, DistrictIcon, SchoolIcon, StageIcon } from "@/components/playr-icons";
import { EmptyState, IconContainer, PlayRBadge, PlayRCard, PlayRLinkButton, type PlayRBadgeVariant } from "@/components/playr-ui";
import { formatDate, formatLabel } from "@/lib/courtside-format";
import { organisationVisuals } from "@/lib/design-tokens";
import {
  organisationSummaryLabel,
  organisationTypeLabel,
  type PlayerClubMembership,
  type PlayerOrganisation
} from "@/lib/player-organisations";
import type { OrganisationLinkStatus, OrganisationType } from "@/types/courtside";

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

function statusVariant(status: OrganisationLinkStatus, inactive: boolean): PlayRBadgeVariant {
  if (inactive) return "inactive";
  if (status === "suspended") return "warning";
  if (status === "active") return "active";
  return "pending";
}

export function PlayerOrganisationSummary({ organisations }: { organisations: PlayerOrganisation[] }) {
  const visibleTypes = Array.from(new Set(organisations.map((organisation) => organisation.venue?.organisation_type).filter(Boolean))) as OrganisationType[];
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700">
      {visibleTypes.length ? (
        <span className="flex shrink-0 -space-x-1" aria-hidden>
          {visibleTypes.slice(0, 4).map((type) => (
            <span className={`grid h-7 w-7 place-items-center rounded-full border-2 border-white ${organisationVisuals[type].icon}`} key={type}>
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
  const styles = organisationVisuals[type];
  const location = [venue.suburb, venue.town, venue.city].filter(Boolean).join(", ") || venue.address;
  const membership = meta?.membership;
  const canOpenClub = type === "club" || type === "club_academy";

  return (
    <PlayRCard aria-label={`${organisationTypeLabel(type)}: ${venue.name}`} as="article" className="flex min-w-0 flex-col overflow-hidden" variant="default">
      <div className={`h-1.5 ${styles.gradient}`} />
      <div className={`flex flex-1 flex-col p-4 sm:p-5 ${styles.surface}`}>
        <div className="flex min-w-0 items-start gap-3">
          <IconContainer className={styles.icon}>
            <OrganisationIcon size={21} type={type} />
          </IconContainer>
          <div className="min-w-0 flex-1">
            <PlayRBadge size="sm" variant={styles.badge}>{organisationTypeLabel(type)}</PlayRBadge>
            <h3 className="mt-1 break-words text-lg font-black leading-tight text-court-navy">{venue.name}</h3>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PlayRBadge dot variant={statusVariant(organisation.status, venue.status === "inactive")}>
            {statusLabel(organisation.status, venue.status === "inactive")}
          </PlayRBadge>
          {membership ? <PlayRBadge variant="brand">{formatLabel(membership.status)}</PlayRBadge> : null}
        </div>

        <div className="mt-4 space-y-1.5 text-sm text-slate-600">
          {membership?.planName ? <p><span className="font-bold text-slate-800">Membership:</span> {membership.planName}</p> : null}
          {membership?.subscription?.expiryDate ? <p><span className="font-bold text-slate-800">Expires:</span> {formatDate(membership.subscription.expiryDate)}</p> : null}
          {location ? <p><span className="font-bold text-slate-800">Location:</span> {location}</p> : null}
          {meta?.supportingDetails}
        </div>

        {canOpenClub ? (
          <PlayRLinkButton
            ariaLabel={`View ${venue.name} for this player`}
            className="mt-auto w-full justify-between"
            href={`/dashboard/venues/${venue.id}?profile=${playerProfileId}`}
            variant="outline"
          >
            View Club <ArrowRightIcon size={16} />
          </PlayRLinkButton>
        ) : null}
      </div>
    </PlayRCard>
  );
}

export function OrganisationEmptyState() {
  return (
    <EmptyState
      description="Club, academy, school and district connections will appear here once they are linked to this player."
      icon={<IconContainer><ClubIcon size={20} /></IconContainer>}
      title="No organisations linked yet"
    />
  );
}
