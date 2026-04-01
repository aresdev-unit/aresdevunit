export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="h-8 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="space-y-3 p-6">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
