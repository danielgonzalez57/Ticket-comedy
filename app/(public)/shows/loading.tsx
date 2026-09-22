export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-24 rounded bg-secondary" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="h-7 w-40 rounded bg-secondary" />
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-32 rounded-lg bg-secondary" />
          <div className="h-9 w-32 rounded-lg bg-secondary" />
          <div className="h-9 w-28 rounded-lg bg-secondary" />
          <div className="h-9 w-28 rounded-lg bg-secondary" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="aspect-4/5 w-full bg-secondary" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 rounded bg-secondary" />
              <div className="h-3 w-1/2 rounded bg-secondary" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
