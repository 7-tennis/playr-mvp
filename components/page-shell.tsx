import type { ReactNode } from "react";
import { PageHeader } from "@/components/playr-ui";
import { playrLayout } from "@/lib/design-tokens";

export function PageShell({
  eyebrow,
  subtitle,
  title,
  children
}: {
  eyebrow?: string;
  subtitle?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={`mx-auto min-h-[70vh] py-6 sm:py-10 ${playrLayout.standard} ${playrLayout.gutters}`}>
      <PageHeader description={subtitle} eyebrow={eyebrow} title={title} />
      <div className="mt-6 sm:mt-8">{children}</div>
    </main>
  );
}
