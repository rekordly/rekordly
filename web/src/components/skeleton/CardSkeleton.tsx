'use client';

import { Skeleton } from '@heroui/react';

function QuotationCardSkeletonItem() {
  return (
    <div className="bg-white dark:bg-background rounded-2xl p-4 mb-3 shadow-sm border border-transparent">
      {/* Top Row */}
      <div className="flex items-start gap-3 mb-3">
        <Skeleton className="rounded-xl w-9 h-9" />

        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-2 w-20 rounded-md" />
          <Skeleton className="h-3 w-32 rounded-md" />
        </div>
      </div>

      {/* Amount & Status */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-20 rounded-md" />
        <Skeleton className="h-4 w-14 rounded-md" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-divider">
        <div className="flex items-center gap-4 flex-1">
          <div className="flex flex-col gap-1 min-w-0">
            <Skeleton className="h-2 w-12 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>

          <div className="flex flex-col gap-1 flex-shrink-0">
            <Skeleton className="h-2 w-10 rounded-md" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </div>

        <Skeleton className="rounded-md w-7 h-7 flex-shrink-0" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
      {[...Array(10)].map((_, i) => (
        <QuotationCardSkeletonItem key={i} />
      ))}
    </div>
  );
}
