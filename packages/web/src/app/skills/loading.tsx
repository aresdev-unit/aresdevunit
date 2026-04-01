export default function SkillsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-5 w-72 animate-pulse rounded bg-gray-100" />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <div className="grid gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-full animate-pulse rounded bg-gray-100" />
                  <div className="mt-3 flex gap-4">
                    <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
                    <div className="h-5 w-16 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
