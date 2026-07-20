import clsx from "clsx";
import type { ReactNode } from "react";

export type PlayRBadgeVariant = "neutral" | "brand" | "success" | "warning" | "error" | "info" | "club" | "academy" | "school" | "district" | "rating" | "participation" | "private" | "pending" | "active" | "inactive";

const variants: Record<PlayRBadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  brand: "border-teal-200 bg-court-mist text-court-teal",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  club: "border-emerald-200 bg-emerald-50 text-emerald-800",
  academy: "border-sky-200 bg-sky-50 text-sky-800",
  school: "border-blue-200 bg-blue-50 text-blue-900",
  district: "border-slate-300 bg-slate-100 text-slate-900",
  rating: "border-blue-200 bg-blue-50 text-court-blue",
  participation: "border-emerald-200 bg-emerald-50 text-emerald-800",
  private: "border-violet-200 bg-violet-50 text-violet-800",
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  inactive: "border-slate-200 bg-slate-100 text-slate-600"
};

export function PlayRBadge({ children, className, dot = false, icon, size = "md", variant = "neutral" }: {
  children: ReactNode;
  className?: string;
  dot?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
  variant?: PlayRBadgeVariant;
}) {
  return <span className={clsx("inline-flex max-w-full items-center gap-1.5 rounded-full border font-bold leading-tight", variants[variant], size === "sm" ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-1 text-xs", className)}>{dot ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : null}{icon}<span className="break-words">{children}</span></span>;
}
