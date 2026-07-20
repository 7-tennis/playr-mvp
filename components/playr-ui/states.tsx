import clsx from "clsx";
import type { ReactNode } from "react";
import { PlayRCard } from "./card";

export function EmptyState({ actions, className, compact = false, description, icon, title }: { actions?: ReactNode; className?: string; compact?: boolean; description: ReactNode; icon?: ReactNode; title: ReactNode }) {
  return <div className={clsx("rounded-playr-lg border border-dashed border-playr-border-strong bg-playr-surface-muted text-center", compact ? "p-4" : "px-5 py-8", className)}>{icon ? <div className="mx-auto mb-3 flex justify-center">{icon}</div> : null}<h3 className="font-black text-court-navy">{title}</h3><div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-playr-text-secondary">{description}</div>{actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}</div>;
}

export function SectionError({ action, className, description, title = "This section could not be loaded" }: { action?: ReactNode; className?: string; description: ReactNode; title?: ReactNode }) {
  return <PlayRCard className={clsx("p-4", className)} role="alert" variant="danger"><h3 className="font-black text-red-900">{title}</h3><div className="mt-1 text-sm leading-6 text-red-800">{description}</div>{action ? <div className="mt-3">{action}</div> : null}</PlayRCard>;
}

export function InlineError({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <p className={clsx("text-sm font-semibold text-red-700", className)} id={id} role="alert">{children}</p>;
}

export function Skeleton({ className, shape = "block" }: { className?: string; shape?: "block" | "circle" | "text" }) {
  return <span aria-hidden className={clsx("block animate-pulse bg-slate-200 motion-reduce:animate-none", shape === "circle" ? "rounded-full" : shape === "text" ? "rounded-playr-sm" : "rounded-playr-md", className)} />;
}

export function CardSkeleton({ className }: { className?: string }) {
  return <PlayRCard className={clsx("p-5", className)} loading><div className="flex gap-3"><Skeleton className="h-12 w-12" /><div className="flex-1"><Skeleton className="h-6 w-40 max-w-full" shape="text" /><Skeleton className="mt-2 h-4 w-24" shape="text" /></div></div><Skeleton className="mt-5 h-20" /><Skeleton className="mt-4 h-11" /></PlayRCard>;
}

export function PageHeaderSkeleton() {
  return <div aria-label="Loading page header" role="status"><Skeleton className="h-4 w-24" shape="text" /><Skeleton className="mt-3 h-9 w-56 max-w-full" shape="text" /><Skeleton className="mt-2 h-5 w-80 max-w-full" shape="text" /></div>;
}

export function MetricSkeleton() {
  return <PlayRCard className="p-4" loading variant="metric"><Skeleton className="h-7 w-20" shape="text" /><Skeleton className="mt-2 h-4 w-28" shape="text" /></PlayRCard>;
}
