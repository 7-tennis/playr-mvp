import clsx from "clsx";
import type { ReactNode } from "react";

export function IconContainer({ children, className, label, size = "md", tone = "brand" }: { children: ReactNode; className?: string; label?: string; size?: "sm" | "md" | "lg"; tone?: "brand" | "neutral" | "dark" | "success" | "warning" }) {
  const sizes = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-14 w-14" };
  const tones = { brand: "bg-court-mist text-court-teal", neutral: "bg-playr-surface-muted text-court-navy", dark: "bg-court-navy text-white", success: "bg-emerald-50 text-emerald-700", warning: "bg-amber-50 text-amber-800" };
  return <span aria-label={label} className={clsx("inline-flex shrink-0 items-center justify-center rounded-playr-md", sizes[size], tones[tone], className)} role={label ? "img" : undefined}>{children}</span>;
}
