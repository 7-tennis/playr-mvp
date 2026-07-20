type StatusAlertProps = {
  message: string | null | undefined;
  tone?: "success" | "warning" | "error" | "info";
  className?: string;
};

export function StatusAlert({ message, tone = "info", className = "" }: StatusAlertProps) {
  if (!message) {
    return null;
  }

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-blue-200 bg-blue-50 text-blue-950"
  };

  if (tone === "error") return <SectionError className={className} description={message} title="Something went wrong" />;
  return <p className={`rounded-playr-lg border p-4 text-sm leading-6 ${styles[tone]} ${className}`} role="status">{message}</p>;
}
import { SectionError } from "@/components/playr-ui";
