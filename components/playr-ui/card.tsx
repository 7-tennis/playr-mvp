import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export type PlayRCardVariant = "default" | "interactive" | "muted" | "brand" | "dark" | "metric" | "danger";

const variants: Record<PlayRCardVariant, string> = {
  default: "border-playr-border-subtle bg-playr-surface-card shadow-playr-subtle",
  interactive: "border-playr-border-subtle bg-playr-surface-card shadow-playr-subtle transition duration-standard hover:border-court-teal hover:shadow-playr-card active:translate-y-px",
  muted: "border-playr-border-subtle bg-playr-surface-muted",
  brand: "border-court-teal/30 bg-court-mist shadow-playr-card",
  dark: "border-court-navy bg-court-navy text-white shadow-playr-card",
  metric: "border-playr-border-subtle bg-playr-surface-card shadow-playr-subtle",
  danger: "border-red-200 bg-red-50"
};

export function PlayRCard({
  as: Component = "div",
  children,
  className,
  disabled = false,
  loading = false,
  selected = false,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  variant?: PlayRCardVariant;
}) {
  return (
    <Component
      aria-busy={loading || undefined}
      className={clsx(
        "min-w-0 rounded-playr-lg border",
        variants[variant],
        selected && "border-court-teal ring-2 ring-court-teal/20",
        disabled && "pointer-events-none opacity-55",
        variant === "interactive" && "focus-within:ring-2 focus-within:ring-court-teal/30",
        className
      )}
      data-disabled={disabled || undefined}
      {...props}
    >
      {children}
    </Component>
  );
}
