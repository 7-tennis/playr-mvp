import clsx from "clsx";
import type { ReactNode } from "react";
import { PlayRCard } from "./card";

export function PageHeader({ actions, backAction, className, description, eyebrow, leading, title, variant = "standard" }: {
  actions?: ReactNode;
  backAction?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  leading?: ReactNode;
  title: ReactNode;
  variant?: "standard" | "compact" | "profile" | "admin" | "hero";
}) {
  return (
    <header className={clsx("border-b border-playr-border-subtle", variant === "compact" ? "pb-4" : "pb-5", className)}>
      {backAction ? <div className="mb-3">{backAction}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {leading}
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-black uppercase tracking-wider text-court-teal">{eyebrow}</p> : null}
            <h1 className={clsx("mt-1 break-words font-black tracking-tight text-court-navy", variant === "hero" ? "text-4xl sm:text-5xl" : variant === "compact" ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>{title}</h1>
            {description ? <div className="mt-2 max-w-2xl text-sm font-medium leading-6 text-playr-text-secondary">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeader({ action, className, count, description, icon, status, title }: {
  action?: ReactNode;
  className?: string;
  count?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={clsx("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">{icon}<h2 className="break-words text-xl font-black tracking-tight text-court-navy sm:text-2xl">{title}</h2>{count ? <span className="text-sm font-bold text-playr-text-muted">{count}</span> : null}{status}</div>
        {description ? <div className="mt-1 text-sm leading-6 text-playr-text-secondary">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricCard({ icon, label, supportingText, value, className }: { className?: string; icon?: ReactNode; label: ReactNode; supportingText?: ReactNode; value: ReactNode }) {
  return <PlayRCard className={clsx("p-3 sm:p-4", className)} variant="metric"><div className="flex items-center gap-2 text-2xl font-black text-court-navy">{icon}<span className="break-words">{value}</span></div><p className="mt-1 text-xs font-bold uppercase tracking-wide text-playr-text-muted">{label}</p>{supportingText ? <p className="mt-1 text-xs leading-5 text-playr-text-secondary">{supportingText}</p> : null}</PlayRCard>;
}
