export default function SkillDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-5 w-72 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-10 w-28 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="mt-6 flex gap-6">
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="mt-8 space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
