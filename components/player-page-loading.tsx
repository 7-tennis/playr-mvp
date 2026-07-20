import { CardSkeleton, PageHeaderSkeleton, PlayRCard, Skeleton } from "@/components/playr-ui";

export function PlayerPageLoading({ label, showFilters = false }: { label: string; showFilters?: boolean }) {
  return (
    <main aria-busy="true" aria-label={`Loading ${label}`} className="playr-page-surface mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-6 sm:my-5 sm:w-[calc(100%-2rem)] sm:rounded-playr-xl sm:px-6 sm:py-10 lg:px-8">
      <PageHeaderSkeleton />
      {showFilters ? <PlayRCard className="mt-7 grid gap-3 p-4 sm:grid-cols-2" loading><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></PlayRCard> : null}
      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => <CardSkeleton key={item} />)}
      </div>
    </main>
  );
}
