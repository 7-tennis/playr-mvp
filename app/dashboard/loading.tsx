function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export default function MyPlayRLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading MyPlayR">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-48" />
      <Skeleton className="mt-2 h-5 w-72 max-w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      <div className="mt-7 flex items-end justify-between gap-4"><div><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-7 w-44" /></div><Skeleton className="h-11 w-32" /></div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {[0, 1].map((item) => <div className="rounded-xl border border-slate-200 bg-white p-5" key={item}><div className="flex gap-3"><Skeleton className="h-12 w-12" /><div className="flex-1"><Skeleton className="h-6 w-40" /><Skeleton className="mt-2 h-5 w-24" /></div></div><Skeleton className="mt-5 h-24" /><Skeleton className="mt-4 h-12" /></div>)}
      </div>
    </main>
  );
}
