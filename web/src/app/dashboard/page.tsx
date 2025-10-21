"use client"
import { Suspense } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { TrendingUp, FileText, CheckCircle, Users, Icon } from 'lucide-react';

export default async function DashboardPage() {

  const dashboardData = [
    {
      icon: TrendingUp,
      value: 40,
      description: 'Engagement Score'
    },
    {
      icon: TrendingUp,
      value: 40,
      description: 'Engagement Score'
    },
    {
      icon: TrendingUp,
      value: 40,
      description: 'Engagement Score'
    },
    {
      icon: TrendingUp,
      value: 40,
      description: 'Engagement Score'
    },
  ]
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <div className="space-y-6">
        {/* Header Section */}
        {/* <div>
          <p className='font-heading text-2xl font-bold text-foreground'>
            Quickly Arrange Every Meeting
          </p>
          <p className="text-default-500 flex items-center gap-2 mt-1">
            <span className="w-2 h-2 bg-warning rounded-full"></span>
            You have <span className="font-semibold text-warning">2 pending</span> schedule today
          </p>
        </div> */}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 px-0">
          {/* Performance Metrics Card */}
          <Card className="bg-transparent" shadow='none'>

            <CardHeader className="pb-0">
              {/* <h3 className="text-sm md:text-base font-mono">Performance Metrics</h3> */}
            </CardHeader>

            <CardBody className='px-0'>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2">
                {dashboardData.map((item, idx) => (
                  <div key={idx} className="relative p-5 rounded-2xl border border-primary-50 dark:border-divider bg-white dark:bg-background">
                    <div className="absolute end-6 w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className='pt-4 lg:pt-16'>
                      <p className="text-3xl font-bold text-foreground pb-1">{item.value}</p>
                      <p className="text-sm text-default-900">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Activity Card */}
          <Card className="bg-background">
            <CardHeader className="pb-2 flex-col items-start">
              <h3 className="text-lg font-semibold">Activity</h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-4xl font-bold text-foreground">85%</p>
                <div className="flex items-center gap-1 text-success text-sm">
                  <TrendingUp className="w-4 h-4" />
                  <span>3.5% vs last week</span>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div className="h-48 flex items-end justify-between gap-2">
                {/* Bar Chart */}
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-primary-200 to-primary-100 rounded-t-lg h-[87%]"></div>
                  <p className="text-xs text-default-500">MON</p>
                  <p className="text-xs font-semibold">87%</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-primary-200 to-primary-100 rounded-t-lg h-[81%]"></div>
                  <p className="text-xs text-default-500">TUE</p>
                  <p className="text-xs font-semibold">81%</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-lg h-[92%] shadow-lg shadow-primary-500/50"></div>
                  <p className="text-xs text-default-500">WED</p>
                  <p className="text-xs font-semibold text-primary-600">92%</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-primary-200 to-primary-100 rounded-t-lg h-[85%]"></div>
                  <p className="text-xs text-default-500">THU</p>
                  <p className="text-xs font-semibold">85%</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gradient-to-t from-primary-200 to-primary-100 rounded-t-lg h-[76%]"></div>
                  <p className="text-xs text-default-500">FRI</p>
                  <p className="text-xs font-semibold">76%</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 bg-default-200 rounded w-64 mb-2"></div>
        <div className="h-4 bg-default-200 rounded w-48"></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-default-200 rounded-lg"></div>
        <div className="h-64 bg-default-200 rounded-lg"></div>
      </div>
    </div>
  );
}