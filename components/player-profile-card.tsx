import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, BookingIcon, EventIcon, InviteIcon, MatchIcon, TimeIcon } from "@/components/playr-icons";
import { PlayRBadge, PlayRCard } from "@/components/playr-ui";
import { PlayerOrganisationSummary } from "@/components/player-organisations";
import type { PlayerStageVisual } from "@/lib/player-stage-visuals";
import type { PlayerActivitySummary } from "@/lib/player-activity-summary";
import type { PlayerOrganisation } from "@/lib/player-organisations";

type PlayerMetric = {
  icon: ReactNode;
  label: string;
  value: string;
};

export function PlayerProfileCard({
  activity,
  href,
  initials,
  name,
  organisations,
  primaryMetric,
  secondaryMetric,
  stage
}: {
  activity?: PlayerActivitySummary | null;
  href: string;
  initials: string;
  name: string;
  organisations: PlayerOrganisation[];
  primaryMetric: PlayerMetric;
  secondaryMetric?: PlayerMetric | null;
  stage: PlayerStageVisual;
}) {
  const ActivityIcon = activity?.primaryKind === "invite" ? InviteIcon : activity?.primaryKind === "lesson" ? TimeIcon : activity?.primaryKind === "match" ? MatchIcon : activity?.primaryKind === "event" ? EventIcon : BookingIcon;

  return (
    <Link aria-label={`View ${name} profile`} className="group block rounded-playr-lg focus-ring" href={href}>
      <PlayRCard as="article" className={`h-full overflow-hidden ring-1 ring-slate-950/5 shadow-playr-card group-hover:-translate-y-0.5 group-hover:ring-4 group-hover:shadow-playr-elevated ${stage.border} ${stage.ring}`} variant="interactive">
        <div className={`${stage.gradient} p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-playr-md border text-base font-black shadow-sm ${stage.avatar}`}>{initials}</div>
            <div className="min-w-0 flex-1">
              <h3 className={`break-words text-xl font-black leading-tight ${stage.foreground}`}>{name}</h3>
              <span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${stage.badge}`}>{stage.label}</span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className={`grid gap-2 rounded-playr-md border p-3 ${stage.metricSurface} ${secondaryMetric ? "sm:grid-cols-2" : ""}`}>
            {[primaryMetric, secondaryMetric].filter(Boolean).map((metric) => {
              const item = metric as PlayerMetric;
              return (
                <div className="min-w-0" key={item.label}>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{item.icon}<span>{item.label}</span></p>
                  <p className="mt-1 truncate text-lg font-black text-court-navy">{item.value}</p>
                </div>
              );
            })}
          </div>

          {activity ? (
            <div className="mt-3 flex min-h-11 items-center gap-2 rounded-playr-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <ActivityIcon className="shrink-0 text-court-teal" size={16} />
              <div className="min-w-0 flex-1">
                <p className="break-words font-black text-court-navy">{activity.primaryLabel}</p>
                {activity.primaryDate ? <p className="text-xs font-semibold text-slate-500">{activity.primaryDate}</p> : null}
              </div>
              {activity.totalCount > 1 ? <PlayRBadge size="sm" variant={activity.actionRequiredCount > 0 ? "warning" : "neutral"}><span className="sr-only">{activity.totalCount} player activities; </span><span aria-hidden>+{activity.totalCount - 1}</span></PlayRBadge> : null}
            </div>
          ) : null}

          <div className="mt-4"><PlayerOrganisationSummary organisations={organisations} /></div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy">
            <span>View Profile</span><ArrowRightIcon size={16} />
          </div>
        </div>
      </PlayRCard>
    </Link>
  );
}
