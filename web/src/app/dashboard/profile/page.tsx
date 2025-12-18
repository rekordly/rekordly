import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ProfileSkeleton } from '@/components/skeleton/ProfileSkeleton';
import ProfileClient from '@/components/dashboard/user/profile/ProfileClient';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/account');
  }

  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileClient initialSession={session} />
    </Suspense>
  );
}
