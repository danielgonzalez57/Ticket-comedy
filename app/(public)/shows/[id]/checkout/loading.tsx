export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-secondary" />
        <div className="h-4 w-32 rounded bg-secondary" />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="h-4 w-24 rounded bg-secondary" />
        <div className="h-4 w-full rounded bg-secondary" />
        <div className="h-4 w-full rounded bg-secondary" />
        <div className="h-5 w-1/2 rounded bg-secondary" />
      </div>

      <div className="h-24 rounded-xl border border-border bg-card p-4" />

      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="h-9 w-full rounded bg-secondary" />
        <div className="h-9 w-full rounded bg-secondary" />
        <div className="h-9 w-full rounded bg-secondary" />
        <div className="h-9 w-32 rounded bg-secondary" />
      </div>
    </div>
  );
}
