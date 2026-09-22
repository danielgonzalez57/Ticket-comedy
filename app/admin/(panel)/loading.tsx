export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-secondary" />
        <div className="h-9 w-28 rounded-md bg-secondary" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-56 rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-secondary/60" />
        ))}
      </div>
    </div>
  );
}
