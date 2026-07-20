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
    <main className={`playr-page-surface mx-auto min-h-[70vh] w-full py-6 sm:my-5 sm:w-[calc(100%-2rem)] sm:rounded-playr-xl sm:py-10 ${playrLayout.standard} ${playrLayout.gutters}`}>
      <PageHeader description={subtitle} eyebrow={eyebrow} title={title} />
      <div className="mt-6 sm:mt-8">{children}</div>
    </main>
  );
}
