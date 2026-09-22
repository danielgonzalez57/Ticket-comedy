export default function Loading() {
  return (
    <div className="max-w-2xl animate-pulse space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-secondary" />
          <div className="h-4 w-28 rounded bg-secondary" />
        </div>
        <div className="h-6 w-24 rounded-full bg-secondary" />
      </div>

      <div className="space-y-2 rounded-xl border border-border p-5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-6 w-full rounded bg-secondary/60" />
        ))}
      </div>

      <div className="flex gap-3">
        <div className="h-9 w-32 rounded-md bg-secondary" />
        <div className="h-9 w-32 rounded-md bg-secondary" />
      </div>
    </div>
  );
}
