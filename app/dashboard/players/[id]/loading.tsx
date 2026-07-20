import { CardSkeleton, MetricSkeleton, PageHeaderSkeleton, PlayRCard, Skeleton } from "@/components/playr-ui";

export default function PlayerDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading player profile">
      <PageHeaderSkeleton />
      <PlayRCard className="mt-5 p-5 sm:p-6" loading><div className="flex gap-4"><Skeleton className="h-20 w-20" /><div className="flex-1"><Skeleton className="h-8 w-56 max-w-full" /><Skeleton className="mt-3 h-5 w-28" /><Skeleton className="mt-4 h-5 w-44" /></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div></PlayRCard>
      <PlayRCard className="mt-5 p-5" loading><Skeleton className="h-7 w-40" /><Skeleton className="mt-2 h-5 w-80 max-w-full" /><div className="mt-5 grid gap-4 md:grid-cols-2"><CardSkeleton /><CardSkeleton /></div></PlayRCard>
    </main>
  );
}
