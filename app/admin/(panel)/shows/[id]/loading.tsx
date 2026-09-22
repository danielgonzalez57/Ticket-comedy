export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-48 rounded bg-secondary" />
            <div className="h-5 w-20 rounded-full bg-secondary" />
          </div>
          <div className="h-4 w-56 rounded bg-secondary" />
        </div>
      </div>

      <div className="h-10 w-full rounded-lg bg-secondary/60" />

      <div className="flex gap-2">
        <div className="h-8 w-20 rounded-md bg-secondary" />
        <div className="h-8 w-20 rounded-md bg-secondary" />
      </div>

      <div className="space-y-3 rounded-xl border border-border p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-full rounded bg-secondary/60" />
        ))}
      </div>
    </div>
  );
}
