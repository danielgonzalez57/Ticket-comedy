export default function Loading() {
  return (
    <div className="animate-pulse space-y-12">
      {/* Hero */}
      <div className="space-y-4 pt-4 sm:pt-8">
        <div className="h-3 w-48 rounded bg-secondary" />
        <div className="h-14 w-3/4 rounded-lg bg-secondary" />
        <div className="h-14 w-1/2 rounded-lg bg-secondary" />
        <div className="h-4 w-80 max-w-full rounded bg-secondary" />
      </div>

      <div className="h-10 w-full rounded bg-secondary/60" />

      {/* Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
