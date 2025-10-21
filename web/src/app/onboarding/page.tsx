// src/app/onboarding/page.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { CheckIcon } from 'lucide-react';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { OnboardingLoadingSkeleton } from '@/components/onboarding/OnboardingLoadingSkeleton';
import { Suspense } from 'react';

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  
  // Redirect if not authenticated
  if (!session?.user) {
    redirect('/account');
  }

  // Redirect if already onboarded
  if (session.user.onboarded) {
    redirect('/dashboard');
  }

  return (
    <Suspense fallback={<OnboardingLoadingSkeleton />}>
      <div className="min-h-screen flex">
        {/* Left Side - Gradient/Image (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 items-center justify-center p-12 relative">
          <div className="text-white text-center max-w-lg">
            <h1 className="text-5xl font-bold mb-6">Welcome to rekordly</h1>
            <p className="text-xl mb-8 opacity-90">
              "Take control of your finances. Track every naira, maximize every opportunity."
            </p>
            <div className="flex items-center justify-center gap-2">
              <CheckIcon className="w-6 h-6" />
              <span className="text-lg">Smart income tracking</span>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              <CheckIcon className="w-6 h-6" />
              <span className="text-lg">Tax calculations made easy</span>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4">
              <CheckIcon className="w-6 h-6" />
              <span className="text-lg">Financial insights at your fingertips</span>
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full lg:w-1/2">
          <OnboardingFlow user={session.user} />
        </div>
      </div>
    </Suspense>
  );
}