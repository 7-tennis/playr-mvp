import Link from "next/link";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type PlayRButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type PlayRButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<PlayRButtonVariant, string> = {
  primary: "playr-gradient-brand border-transparent text-white shadow-playr-card hover:brightness-110",
  secondary: "border-court-teal/30 bg-court-mist text-court-navy hover:border-court-teal hover:bg-teal-50",
  outline: "border-playr-border-strong bg-playr-surface-card text-court-navy hover:border-court-teal hover:bg-court-mist",
  ghost: "border-transparent bg-transparent text-court-navy hover:bg-playr-surface-muted",
  destructive: "border-red-700 bg-red-700 text-white hover:bg-red-800",
  link: "min-h-0 border-transparent bg-transparent p-0 text-court-blue underline-offset-4 hover:underline"
};

const sizes: Record<PlayRButtonSize, string> = {
  sm: "min-h-9 px-3 py-2 text-xs",
  md: "min-h-11 px-4 py-2.5 text-sm",
  lg: "min-h-12 px-5 py-3 text-base",
  icon: "h-11 w-11 p-0"
};

export function playrButtonClasses({ variant = "primary", size = "md", className }: { variant?: PlayRButtonVariant; size?: PlayRButtonSize; className?: string } = {}) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-playr-md border font-bold transition duration-standard focus-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );
}

export function LoadingSpinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />;
}

export function PlayRButton({ children, className, loading = false, loadingLabel = "Loading", size, variant, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: PlayRButtonSize;
  variant?: PlayRButtonVariant;
}) {
  return <button aria-busy={loading || undefined} className={playrButtonClasses({ variant, size, className })} disabled={disabled || loading} {...props}>{loading ? <><LoadingSpinner /><span>{loadingLabel}</span></> : children}</button>;
}

export function PlayRLinkButton({ children, className, href, size, variant, ariaLabel }: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  href: string;
  size?: PlayRButtonSize;
  variant?: PlayRButtonVariant;
}) {
  return <Link aria-label={ariaLabel} className={playrButtonClasses({ variant, size, className })} href={href}>{children}</Link>;
}
