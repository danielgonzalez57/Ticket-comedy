export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 rounded bg-secondary" />
        <div className="h-9 w-28 rounded-md bg-secondary" />
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-4">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-secondary" />
              <div className="h-3 w-28 rounded bg-secondary" />
            </div>
            <div className="h-5 w-16 rounded-full bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}
