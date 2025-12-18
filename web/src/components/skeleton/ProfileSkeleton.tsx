import { Card, CardBody, CardHeader } from '@heroui/card';
import { Skeleton } from '@heroui/skeleton';

export function ProfileSkeleton() {
  return (
    <div className="px-0">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-lg" />
        </div>

        {/* Main Layout */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Profile Overview Card Skeleton */}
            <Card className="rounded-3xl">
              <CardBody className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <Skeleton className="w-24 h-24 rounded-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-20 rounded-lg" />
                      <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-48 rounded-lg" />
                      <Skeleton className="h-4 w-64 rounded-lg" />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Skeleton className="h-5 w-full rounded-lg" />
                      <Skeleton className="h-5 w-full rounded-lg" />
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Basic Details Skeleton */}
            <Card className="rounded-3xl">
              <CardHeader className="py-4 px-6">
                <Skeleton className="h-5 w-32 rounded-lg" />
              </CardHeader>
              <CardBody className="px-6 pb-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-20 rounded-lg" />
                      <Skeleton className="h-5 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Work Details Skeleton */}
            <Card className="rounded-3xl">
              <CardHeader className="py-4 px-6">
                <Skeleton className="h-5 w-28 rounded-lg" />
              </CardHeader>
              <CardBody className="px-6 pb-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-24 rounded-lg" />
                      <Skeleton className="h-5 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Bank Accounts Skeleton */}
            <Card className="rounded-3xl">
              <CardHeader className="py-4 px-6 flex items-center justify-between">
                <Skeleton className="h-5 w-32 rounded-lg" />
                <Skeleton className="h-8 w-32 rounded-lg" />
              </CardHeader>
              <CardBody className="px-6 pb-6">
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 bg-default-50 rounded-2xl"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-32 rounded-lg" />
                          <Skeleton className="h-3 w-48 rounded-lg" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="w-8 h-8 rounded-lg" />
                        <Skeleton className="w-8 h-8 rounded-lg" />
                        <Skeleton className="w-8 h-8 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="rounded-3xl">
              <CardHeader className="py-4 px-6">
                <Skeleton className="h-5 w-32 rounded-lg" />
              </CardHeader>
              <CardBody className="px-6 pb-6">
                <div className="grid md:grid-cols-1 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-3 w-20 rounded-lg" />
                      <Skeleton className="h-5 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
