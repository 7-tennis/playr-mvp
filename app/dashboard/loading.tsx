import { CardSkeleton, MetricSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/playr-ui";

export default function MyPlayRLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading MyPlayR">
      <PageHeaderSkeleton />
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div>
      <div className="mt-7 flex items-end justify-between gap-4"><div><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-7 w-44" /></div><Skeleton className="h-11 w-32" /></div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => <CardSkeleton key={item} />)}
      </div>
    </main>
  );
}
