'use client';

import { Card, CardBody, CardHeader, Divider, Skeleton } from '@heroui/react';

export function FormSkeleton() {
  return (
    <div className="space-y-6 pb-24 w-full overflow-auto">
      {/* Header / Customer Card */}
      <Card className="w-full rounded-3xl p-4 px-2" shadow="none">
        <CardHeader className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-lg" />
          </div>
        </CardHeader>

        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-4 w-16 rounded-lg" />
            </div>
            <Divider />

            <div className="grid md:grid-cols-3 gap-4">
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Invoice heading & notes */}
      <Card className="w-full rounded-3xl p-4" shadow="none">
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-48 rounded-lg" />
            </div>
            <Divider />

            <div className="grid md:grid-cols-2 gap-4">
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Add Item Section */}
      <Card className="w-full rounded-3xl p-4" shadow="none">
        <CardBody>
          <div className="space-y-4">
            <Skeleton className="h-5 w-40 rounded-lg" />
            <Divider />

            <div className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <Skeleton className="h-14 rounded-2xl" />
                </div>

                <div className="md:col-span-2 grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <Skeleton className="h-14 rounded-2xl" />
                  </div>

                  <div className="col-span-2">
                    <Skeleton className="h-14 rounded-2xl" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <Skeleton className="h-6 w-24 rounded-lg" />
                </div>

                <Skeleton className="h-10 w-24 rounded-lg" />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Items list + totals */}
      <Card className="w-full rounded-3xl p-4" shadow="none">
        <CardBody>
          <div className="space-y-4">
            <Skeleton className="h-5 w-32 rounded-lg" />
            <Divider />

            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-default-50 rounded-xl"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-8 rounded-lg" />
                      <Skeleton className="h-4 w-32 rounded-lg" />
                    </div>
                    <div className="mt-1">
                      <Skeleton className="h-3 w-24 rounded-lg" />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-16 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Skeleton className="h-5 w-32 rounded-lg" />
            </div>

            <div className="flex justify-end pt-2">
              <div className="w-full md:w-1/3 space-y-3">
                <div className="flex justify-between text-sm">
                  <Skeleton className="h-4 w-16 rounded-lg" />
                  <Skeleton className="h-4 w-20 rounded-lg" />
                </div>

                <div className="flex justify-between text-sm">
                  <Skeleton className="h-4 w-16 rounded-lg" />
                  <Skeleton className="h-4 w-20 rounded-lg" />
                </div>

                <Divider />

                <div className="flex justify-between text-lg font-bold">
                  <Skeleton className="h-6 w-12 rounded-lg" />
                  <Skeleton className="h-6 w-20 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-3 justify-end pt-4">
            <Skeleton className="h-12 w-32 rounded-2xl" />
            <Skeleton className="h-12 w-32 rounded-2xl" />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
