import React from 'react';
import { Card, CardBody } from '@heroui/card';
import { Skeleton } from '@heroui/skeleton';

export function CustomerPageSkeleton() {
  return (
    <div className="px-0 space-y-6">
      <Card className="rounded-3xl" shadow="none">
        <CardBody className="p-6">
          {/* Top section with search and buttons */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex justify-between gap-3 items-end">
              <Skeleton className="h-10 w-full sm:max-w-[44%] rounded-xl" />
              <div className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-10 w-24 rounded-lg hidden sm:block" />
                <Skeleton className="h-10 w-24 rounded-lg hidden sm:block" />
                <Skeleton className="h-10 w-28 rounded-lg" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-5 w-40 rounded-lg" />
            </div>
          </div>

          {/* Table header */}
          <div className="border-b border-divider pb-3 mb-3">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-1">
                <Skeleton className="h-4 w-10 rounded" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-4 w-20 rounded" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-4 w-12 rounded" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-4 w-24 rounded" />
              </div>
              <div className="col-span-3 flex justify-end">
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          </div>

          {/* Table rows */}
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <div key={i} className="grid grid-cols-12 gap-4 py-2">
                <div className="col-span-1">
                  <Skeleton className="h-4 w-6 rounded" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
                <div className="col-span-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <div className="col-span-3 flex justify-end gap-1">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center mt-6 py-2">
            <Skeleton className="h-10 w-64 rounded-lg" />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
