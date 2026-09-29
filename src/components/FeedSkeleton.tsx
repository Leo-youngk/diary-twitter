/** Placeholder rows shaped like posts, shown while a new device fetches its first copy. */
export default function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在同步">
      {[0.9, 0.6, 0.8, 0.5].map((width, i) => (
        <div key={i} className="flex gap-3 border-b border-x-border px-4 py-3">
          <div className="skeleton-pulse h-9 w-9 shrink-0 rounded-full bg-x-search" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="skeleton-pulse h-3.5 w-2/5 rounded-full bg-x-search" />
            <div className="skeleton-pulse h-3.5 rounded-full bg-x-search" style={{ width: `${width * 100}%` }} />
            <div className="skeleton-pulse h-3.5 w-1/3 rounded-full bg-x-search" />
          </div>
        </div>
      ))}
    </div>
  );
}
