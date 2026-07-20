import { MetricSkeleton, PageHeaderSkeleton, PlayRCard, Skeleton } from "@/components/playr-ui";

export default function MyPlayRLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading MyPlayR">
      <PageHeaderSkeleton />
      <div className="mt-6 grid gap-4 rounded-playr-lg bg-court-navy p-5 sm:grid-cols-3"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div>
      <div className="mt-7 flex items-end justify-between gap-4"><div><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-7 w-44" /></div><Skeleton className="h-11 w-32" /></div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => <PlayRCard className="overflow-hidden" key={item} loading><div className="playr-gradient-player-neutral p-5"><div className="flex gap-3"><Skeleton className="h-14 w-14 bg-white/25" /><div className="flex-1"><Skeleton className="h-7 w-48 max-w-full bg-white/25" /><Skeleton className="mt-2 h-5 w-28 bg-white/25" /></div></div></div><div className="p-5"><div className="grid gap-2 sm:grid-cols-2"><MetricSkeleton /><MetricSkeleton /></div><Skeleton className="mt-4 h-8 w-64 max-w-full" /><Skeleton className="mt-4 h-11 w-full" /></div></PlayRCard>)}
      </div>
    </main>
  );
}
