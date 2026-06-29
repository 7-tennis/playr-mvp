type StatusAlertProps = {
  message: string | null | undefined;
  tone?: "success" | "error" | "info";
  className?: string;
};

export function StatusAlert({ message, tone = "info", className = "" }: StatusAlertProps) {
  if (!message) {
    return null;
  }

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    error: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-slate-200 bg-white text-slate-700"
  };

  return <p className={`rounded-lg border p-4 text-sm leading-6 ${styles[tone]} ${className}`}>{message}</p>;
}
