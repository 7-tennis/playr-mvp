import type { ReactNode } from "react";
import { ChevronDownIcon } from "@/components/playr-icons";

export function CollapsibleCard({
  badge,
  children,
  className = "",
  defaultOpen = false,
  eyebrow,
  id,
  summary,
  title
}: {
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  eyebrow?: string;
  id?: string;
  summary?: ReactNode;
  title: string;
}) {
  return (
    <details className={`surface-card ui-collapsible overflow-hidden ${className}`} id={id} open={defaultOpen}>
      <summary className="flex cursor-pointer items-start justify-between gap-4 p-4 sm:p-5">
        <span className="min-w-0">
          {eyebrow ? <span className="section-kicker">{eyebrow}</span> : null}
          <span className="mt-1 block text-lg font-black text-court-navy">{title}</span>
          {summary ? <span className="mt-1 block text-sm leading-6 text-slate-600">{summary}</span> : null}
          {badge ? <span className="mt-3 flex flex-wrap gap-2">{badge}</span> : null}
        </span>
        <span className="ui-collapsible-chevron grid h-9 w-9 shrink-0 place-items-center rounded bg-court-mist text-court-teal">
          <ChevronDownIcon size={18} />
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </details>
  );
}
