import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/playr-icons";
import { PlayRCard } from "@/components/playr-ui";
import { PlayerOrganisationSummary } from "@/components/player-organisations";
import type { PlayerStageVisual } from "@/lib/player-stage-visuals";
import type { PlayerOrganisation } from "@/lib/player-organisations";

type PlayerMetric = {
  icon: ReactNode;
  label: string;
  value: string;
};

export function PlayerProfileCard({
  href,
  initials,
  name,
  organisations,
  primaryMetric,
  secondaryMetric,
  stage
}: {
  href: string;
  initials: string;
  name: string;
  organisations: PlayerOrganisation[];
  primaryMetric: PlayerMetric;
  secondaryMetric?: PlayerMetric | null;
  stage: PlayerStageVisual;
}) {
  return (
    <Link aria-label={`View ${name} profile`} className="group block rounded-playr-lg focus-ring" href={href}>
      <PlayRCard as="article" className={`h-full overflow-hidden group-hover:ring-4 ${stage.border} ${stage.ring}`} variant="interactive">
        <div className={`${stage.gradient} p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-playr-md border text-base font-black shadow-sm ${stage.avatar}`}>{initials}</div>
            <div className="min-w-0 flex-1">
              <h3 className={`truncate text-xl font-black ${stage.foreground}`}>{name}</h3>
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

          <div className="mt-4"><PlayerOrganisationSummary organisations={organisations} /></div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-black text-court-navy">
            <span>View Profile</span><ArrowRightIcon size={16} />
          </div>
        </div>
      </PlayRCard>
    </Link>
  );
}
