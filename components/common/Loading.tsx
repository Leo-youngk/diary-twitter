'use client';

export function PostCardSkeleton() {
  return (
    <div className="border-b border-x-border p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-x-darker skeleton-pulse shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <div className="h-4 w-24 bg-x-darker rounded skeleton-pulse" />
            <div className="h-4 w-16 bg-x-darker rounded skeleton-pulse" />
          </div>
          <div className="h-4 w-full bg-x-darker rounded skeleton-pulse" />
          <div className="h-4 w-3/4 bg-x-darker rounded skeleton-pulse" />
          <div className="h-40 w-full bg-x-darker rounded-xl skeleton-pulse" />
          <div className="flex justify-between mt-3">
            <div className="h-4 w-16 bg-x-darker rounded skeleton-pulse" />
            <div className="h-4 w-16 bg-x-darker rounded skeleton-pulse" />
            <div className="h-4 w-16 bg-x-darker rounded skeleton-pulse" />
            <div className="h-4 w-16 bg-x-darker rounded skeleton-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}
