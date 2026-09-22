export default function Loading() {
  return (
    <div className="max-w-3xl animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-secondary" />
        <div className="h-6 w-48 rounded bg-secondary" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-card" />
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-border p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-secondary/60" />
        ))}
      </div>
    </div>
  );
}
