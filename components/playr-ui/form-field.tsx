import clsx from "clsx";
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { InlineError } from "./states";

export function FormField({ children, error, help, id, label, optional = false }: { children: ReactNode; error?: ReactNode; help?: ReactNode; id: string; label: ReactNode; optional?: boolean }) {
  return <div><FieldLabel htmlFor={id}>{label}{optional ? <span className="ml-1 font-medium text-playr-text-muted">Optional</span> : null}</FieldLabel><div className="mt-1.5">{children}</div>{error ? <FieldError id={`${id}-error`}>{error}</FieldError> : help ? <FieldHelp id={`${id}-help`}>{help}</FieldHelp> : null}</div>;
}

export function FieldLabel({ children, className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("block text-sm font-bold text-playr-text-primary", className)} {...props}>{children}</label>;
}

export function FieldHelp({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <p className={clsx("mt-1.5 text-xs leading-5 text-playr-text-muted", className)} id={id}>{children}</p>;
}

export function FieldError({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <InlineError className={clsx("mt-1.5", className)} id={id}>{children}</InlineError>;
}

export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={clsx("form-control", invalid && "form-control-error", className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={clsx("form-control min-h-24 resize-y", invalid && "form-control-error", className)} {...props} />;
}

export function Select({ children, className, invalid, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; invalid?: boolean }) {
  return <select aria-invalid={invalid || undefined} className={clsx("form-control", invalid && "form-control-error", className)} {...props}>{children}</select>;
}

export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input className={clsx("h-5 w-5 rounded-playr-sm border-playr-border-strong text-court-teal accent-teal-600 focus-ring disabled:cursor-not-allowed disabled:opacity-50", className)} type="checkbox" {...props} />;
}

export function Radio({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input className={clsx("h-5 w-5 border-playr-border-strong text-court-teal accent-teal-600 focus-ring disabled:cursor-not-allowed disabled:opacity-50", className)} type="radio" {...props} />;
}

export function Switch({ className, label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & { label: ReactNode }) {
  return <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-playr-text-primary"><input className={clsx("peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-slate-300 p-0.5 transition duration-fast before:block before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow-playr-subtle before:transition before:duration-fast checked:bg-court-teal checked:before:translate-x-5 focus-ring disabled:cursor-not-allowed disabled:opacity-50", className)} role="switch" type="checkbox" {...props} /><span>{label}</span></label>;
}
