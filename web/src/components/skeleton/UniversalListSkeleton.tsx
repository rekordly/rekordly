'use client';

import React from 'react';
import { Card, CardBody, Skeleton } from '@heroui/react';

interface UniversalListSkeletonProps {
  itemCount?: number;
  gridConfig?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  showStats?: boolean;
  showFilters?: boolean;
}

export default function UniversalListSkeleton({
  itemCount = 6,
  gridConfig = { default: 1, md: 2, lg: 3 },
  showStats = true,
  showFilters = true,
}: UniversalListSkeletonProps) {
  const getGridClasses = () => {
    const classes = ['grid', 'gap-3', 'sm:gap-4'];

    if (gridConfig.default) classes.push(`grid-cols-${gridConfig.default}`);
    if (gridConfig.sm) classes.push(`sm:grid-cols-${gridConfig.sm}`);
    if (gridConfig.md) classes.push(`md:grid-cols-${gridConfig.md}`);
    if (gridConfig.lg) classes.push(`lg:grid-cols-${gridConfig.lg}`);
    if (gridConfig.xl) classes.push(`xl:grid-cols-${gridConfig.xl}`);

    return classes.join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Stats Section Skeleton */}
      {showStats && (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="rounded-3xl" shadow="none">
              <CardBody className="p-6">
                <div className="space-y-3">
                  <Skeleton className="w-20 h-5 rounded-lg" />
                  <Skeleton className="w-32 h-8 rounded-lg" />
                  <Skeleton className="w-full h-4 rounded-lg" />
                  <Skeleton className="w-3/4 h-4 rounded-lg" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Main Content Card Skeleton */}
      <Card className="rounded-3xl bg-transparent" shadow="none">
        <CardBody className="py-6">
          {/* Search and Actions Skeleton */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="hidden md:flex justify-between gap-3 items-end">
              <Skeleton className="w-full sm:max-w-[44%] h-10 rounded-xl" />
              <div className="flex gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="w-24 h-10 rounded-lg" />
              </div>
            </div>

            <div className="flex gap-2 md:hidden">
              <Skeleton className="w-10 h-9 rounded-lg" />
              <Skeleton className="w-10 h-9 rounded-lg" />
              <Skeleton className="w-10 h-9 rounded-lg ml-auto" />
            </div>
          </div>

          {/* Filters Skeleton */}
          {showFilters && (
            <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="w-20 h-7 rounded-full shrink-0" />
              ))}
            </div>
          )}

          {/* Items Grid Skeleton */}
          <div className="max-h-150 overflow-y-auto pr-2 py-2">
            <div className={getGridClasses()}>
              {Array.from({ length: itemCount }).map((_, i) => (
                <Card key={i} className="rounded-2xl" shadow="none">
                  <CardBody className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <Skeleton className="w-3/4 h-6 rounded-lg" />
                        <Skeleton className="w-16 h-6 rounded-full" />
                      </div>
                      <Skeleton className="w-full h-4 rounded-lg" />
                      <Skeleton className="w-2/3 h-4 rounded-lg" />
                      <div className="flex justify-between items-center pt-2">
                        <Skeleton className="w-24 h-7 rounded-lg" />
                        <div className="flex gap-2">
                          <Skeleton className="w-8 h-8 rounded-lg" />
                          <Skeleton className="w-8 h-8 rounded-lg" />
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
