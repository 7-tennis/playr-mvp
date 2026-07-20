import { MetricSkeleton, PageHeaderSkeleton, PlayRCard, Skeleton } from "@/components/playr-ui";

export default function MyPlayRLoading() {
  return (
    <main className="playr-page-surface mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-6 sm:my-5 sm:w-[calc(100%-2rem)] sm:rounded-playr-xl sm:px-6" aria-busy="true" aria-label="Loading MyPlayR">
      <PageHeaderSkeleton />
      <div className="mt-7 flex items-end justify-between gap-4"><div><Skeleton className="h-7 w-44" /><Skeleton className="mt-2 h-5 w-72 max-w-full" /></div><Skeleton className="h-11 w-32" /></div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => <PlayRCard className="overflow-hidden" key={item} loading><div className="playr-gradient-player-neutral p-5"><div className="flex gap-3"><Skeleton className="h-14 w-14 bg-white/25" /><div className="flex-1"><Skeleton className="h-7 w-48 max-w-full bg-white/25" /><Skeleton className="mt-2 h-5 w-28 bg-white/25" /></div></div></div><div className="p-5"><div className="grid gap-2 sm:grid-cols-2"><MetricSkeleton /><MetricSkeleton /></div>{item === 0 ? <Skeleton className="mt-3 h-14 w-full" /> : null}<Skeleton className="mt-4 h-8 w-64 max-w-full" /><Skeleton className="mt-4 h-11 w-full" /></div></PlayRCard>)}
      </div>
    </main>
  );
}
