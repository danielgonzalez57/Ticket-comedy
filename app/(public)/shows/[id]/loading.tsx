export default function Loading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-4 w-24 rounded bg-secondary" />

      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="aspect-4/5 w-full bg-secondary sm:aspect-video" />
      </div>

      {/* Info */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-24 rounded-full bg-secondary" />
          <div className="h-6 w-32 rounded-full bg-secondary" />
        </div>
        <div className="h-4 w-full max-w-2xl rounded bg-secondary" />
        <div className="h-4 w-2/3 max-w-2xl rounded bg-secondary" />
      </div>

      {/* Seat selection */}
      <div className="space-y-5 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <div className="h-5 w-40 rounded bg-secondary" />
          <div className="h-4 w-24 rounded bg-secondary" />
        </div>
        <div className="mx-auto h-8 w-2/3 max-w-sm rounded bg-secondary" />
        <div className="mx-auto grid max-w-md grid-cols-8 gap-1.5">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-[5px] bg-secondary" />
          ))}
        </div>
      </div>
    </div>
  );
}
