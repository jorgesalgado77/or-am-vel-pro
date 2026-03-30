import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <Skeleton className="h-3 w-32" />
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonColumn() {
  const cardCount = Math.floor(Math.random() * 3) + 1;
  return (
    <div className="flex flex-col min-w-[170px] w-[170px] sm:min-w-[200px] sm:w-[200px] md:min-w-[220px] md:w-[220px] lg:min-w-[240px] lg:w-[240px] shrink-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="ml-auto h-5 w-6 rounded-full" />
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-1.5 flex-1 min-h-[200px] space-y-2">
        {Array.from({ length: cardCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="flex-1 min-h-0 min-w-0">
      <div className="w-full overflow-hidden">
        <div className="inline-flex min-w-max gap-3 px-1 pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonColumn key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
