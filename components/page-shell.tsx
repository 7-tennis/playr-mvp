import type { ReactNode } from "react";

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
    <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-6 sm:py-10">
      <header className="border-b border-slate-200 pb-5">
        {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
        <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight text-court-navy md:text-5xl">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </header>
      <div className="mt-6 sm:mt-8">{children}</div>
    </main>
  );
}
