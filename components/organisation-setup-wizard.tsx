import Link from "next/link";
import type { ReactNode } from "react";
import { saveSetupPosition } from "@/app/dashboard/setup/actions";
import { ArrowRightIcon, StatusIcon } from "@/components/playr-icons";
import {
  previousSetupStep,
  productDashboardPath,
  productSetupLabel,
  productSetupPath,
  setupProgress,
  type OrganisationSetupSnapshot,
  type OrganisationSetupStep
} from "@/lib/organisation-setup";
import type { OrganisationSetupProduct } from "@/types/courtside";

export function OrganisationSetupWizard({
  children,
  organisationName,
  product,
  snapshot,
  step
}: {
  children: ReactNode;
  organisationName: string;
  product: OrganisationSetupProduct;
  snapshot: OrganisationSetupSnapshot;
  step: OrganisationSetupStep;
}) {
  const progress = setupProgress(snapshot);
  const stepIndex = snapshot.steps.findIndex((item) => item.id === step.id);
  const previous = previousSetupStep(product, step.id);

  return (
    <div className="mx-auto max-w-3xl">
      <section className="mb-5 overflow-hidden rounded-lg bg-court-navy p-4 text-white shadow-court sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-court-lime">Set up {organisationName}</p>
            <h2 className="mt-1 text-2xl font-black">{step.title}</h2>
            <p className="mt-1 text-sm font-semibold text-white/70">
              Step {stepIndex + 1} of {snapshot.steps.length} · {productSetupLabel(product)}
            </p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-white/10 text-court-lime">
            <StatusIcon size={20} />
          </span>
        </div>
        <div aria-label={`${progress.percent}% complete`} className="mt-4 h-2 overflow-hidden rounded bg-white/15">
          <div className="h-full rounded bg-court-lime transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="mt-2 text-xs font-bold text-white/70">{progress.completeCount} of {progress.totalCount} steps saved</p>
      </section>

      <section className="surface-card p-4 sm:p-6">
        <p className="text-sm leading-6 text-slate-600">{step.summary}</p>
        <div className="mt-5">{children}</div>
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {previous ? (
          <Link className="btn-secondary" href={productSetupPath(product, previous.id)}>
            Back
          </Link>
        ) : <span />}
        <form action={saveSetupPosition}>
          <input name="product" type="hidden" value={product} />
          <input name="step" type="hidden" value={step.id} />
          <button className="inline-flex items-center gap-2 text-sm font-black text-court-teal" type="submit">
            Save place and continue later <ArrowRightIcon size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

export function SetupReminderCard({ organisationName, snapshot }: { organisationName: string; snapshot: OrganisationSetupSnapshot }) {
  if (snapshot.setup.status === "complete") {
    return null;
  }

  const progress = setupProgress(snapshot);
  const product = snapshot.setup.product_context;

  return (
    <section className="mb-5 rounded-lg border border-court-teal/25 bg-court-mist p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p className="section-kicker">Setup</p>
        <h2 className="mt-1 text-lg font-black text-court-navy">Finish setting up {productSetupLabel(product)}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">{organisationName} · {progress.completeCount} of {progress.totalCount} steps saved</p>
      </div>
      <Link className="btn-primary mt-3 sm:mt-0" href={productSetupPath(product, snapshot.setup.current_step)}>
        Resume Setup
      </Link>
    </section>
  );
}
