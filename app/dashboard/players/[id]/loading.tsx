import { CardSkeleton, MetricSkeleton, PageHeaderSkeleton, PlayRCard, Skeleton } from "@/components/playr-ui";

export default function PlayerDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading player profile">
      <PageHeaderSkeleton />
      <Skeleton className="mt-5 h-11 w-36" />
      <PlayRCard className="mt-5 overflow-hidden" loading>
        <div className="playr-gradient-player-neutral p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><Skeleton className="h-24 w-24 bg-white/25" /><div className="flex-1"><Skeleton className="h-6 w-28 bg-white/25" /><Skeleton className="mt-3 h-9 w-64 max-w-full bg-white/25" /><Skeleton className="mt-3 h-5 w-36 bg-white/25" /></div></div></div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.8fr_1.2fr]"><Skeleton className="h-10 w-64 max-w-full" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div></div>
      </PlayRCard>
      <PlayRCard className="mt-5 p-5" loading><Skeleton className="h-7 w-56" /><Skeleton className="mt-2 h-5 w-96 max-w-full" /><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div></PlayRCard>
      <PlayRCard className="mt-5 p-5" loading><Skeleton className="h-7 w-40" /><Skeleton className="mt-2 h-5 w-80 max-w-full" /><div className="mt-5 grid gap-4 md:grid-cols-2"><CardSkeleton /><CardSkeleton /></div></PlayRCard>
      <PlayRCard className="mt-5 p-5" loading><Skeleton className="h-7 w-44" /><Skeleton className="mt-2 h-5 w-80 max-w-full" /><div className="mt-5 grid gap-3 md:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div></PlayRCard>
    </main>
  );
}
