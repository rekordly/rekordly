'use client';
import React from 'react';
import { Skeleton } from '@heroui/react';

export const OnboardingLoadingSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen flex">
      {/* Left Side Skeleton */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 items-center justify-center p-12">
        <div className="text-white text-center max-w-lg space-y-6">
          <Skeleton className="h-12 w-3/4 mx-auto rounded-lg bg-white/20" />
          <Skeleton className="h-6 w-full rounded-lg bg-white/20" />
          <Skeleton className="h-6 w-5/6 mx-auto rounded-lg bg-white/20" />
          <div className="space-y-4 mt-8">
            <Skeleton className="h-8 w-2/3 mx-auto rounded-lg bg-white/20" />
            <Skeleton className="h-8 w-2/3 mx-auto rounded-lg bg-white/20" />
            <Skeleton className="h-8 w-2/3 mx-auto rounded-lg bg-white/20" />
          </div>
        </div>
      </div>

      {/* Right Side Skeleton */}
      <div className="w-full lg:w-1/2">
        {/* Mobile Progress Bar */}
        <div className="lg:hidden w-full bg-default-100 py-4 px-6">
          <div className="flex items-center justify-between">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="flex-1 h-1 mx-2 rounded" />
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="flex-1 h-1 mx-2 rounded" />
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>

        <div className="flex items-center justify-center p-6 lg:p-12 h-full">
          <div className="w-full max-w-md">
            {/* Desktop Progress Bar */}
            <div className="hidden lg:block mb-8">
              <div className="flex items-center justify-between">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="flex-1 h-1 mx-4 rounded" />
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="flex-1 h-1 mx-4 rounded" />
                <Skeleton className="w-10 h-10 rounded-full" />
              </div>
            </div>

            {/* Form Skeleton */}
            <div className="space-y-6">
              <Skeleton className="h-8 w-1/2 rounded-lg" />

              <div className="space-y-4">
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-14 w-full rounded-2xl" />
              </div>

              <div className="flex gap-4 mt-8">
                <Skeleton className="h-12 flex-1 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
