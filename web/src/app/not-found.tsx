'use client';

import { Button } from '@heroui/button';
import { Card, CardBody } from '@heroui/react';
import { Home, LayoutDashboard, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-background via-background to-default-100 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl">
        <Card
          className="w-full bg-background/80 backdrop-blur-sm border border-default-200"
          shadow="lg"
        >
          <CardBody className="p-6 sm:p-8 lg:p-12">
            {/* SVG Illustration */}
            <div className="flex justify-center mb-6 sm:mb-8">
              <div className="w-full max-w-md aspect-square flex items-center justify-center">
                <img
                  src="/404.svg"
                  alt="404 - Page not found"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Error Message */}
            <div className="text-center space-y-3 sm:space-y-4 mb-8 sm:mb-10">
              <div className="space-y-1">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-primary">
                  404
                </h1>
                <p className="text-sm sm:text-base text-default-400 uppercase tracking-widest">
                  Page not found
                </p>
              </div>

              <div className="max-w-lg mx-auto space-y-2">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
                  Oops! Page Not Found
                </h2>
                <p className="text-sm sm:text-base text-default-600 leading-relaxed">
                  {`The page you're looking for doesn't exist or has been moved.
                  Don't worry, it happens to the best of us!`}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Button
                size="lg"
                color="primary"
                variant="solid"
                startContent={<Home className="w-5 h-5" />}
                onPress={() => router.push('/')}
                className="w-full sm:w-auto min-w-45 font-medium"
              >
                Back to Home
              </Button>

              <Button
                size="lg"
                color="default"
                variant="bordered"
                startContent={<LayoutDashboard className="w-5 h-5" />}
                onPress={() => router.push('/dashboard')}
                className="w-full sm:w-auto min-w-45 font-medium"
              >
                Go to Dashboard
              </Button>
            </div>

            {/* Go Back Option */}
            <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-default-200">
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center gap-2 mx-auto text-sm sm:text-base text-default-600 hover:text-primary transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-x-1 transition-transform" />
                <span>Or go back to previous page</span>
              </button>
            </div>

            {/* Additional Help Text */}
            <div className="mt-6 sm:mt-8 text-center">
              <p className="text-xs sm:text-sm text-default-500">
                If you believe this is an error, please{' '}
                <a
                  href="mailto:support@example.com"
                  className="text-primary hover:underline font-medium"
                >
                  contact support
                </a>
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Decorative Elements */}
        <div className="mt-6 sm:mt-8 flex justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-primary/40 animate-pulse delay-150"></div>
          <div className="w-2 h-2 rounded-full bg-primary/20 animate-pulse delay-300"></div>
        </div>
      </div>
    </div>
  );
}
