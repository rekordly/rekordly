'use client';

import { useSession } from 'next-auth/react';

export default function OnboardingPage() {
  const { data: session, status } = useSession();

  // Handle loading state
  if (status === 'loading') {
    return <div>Loading session...</div>;
  }

  // Handle case when session is not available
  if (!session) {
    return <div>No session found. Please sign in.</div>;
  }
  // console.log(session)

  // Now we can safely access session properties
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Session Information</h1>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">Raw Session Data</h2>
        <pre className="bg-white p-3 rounded overflow-auto">
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">User Information</h2>
          <p>
            <strong>ID:</strong> {session.user.id}
          </p>
          <p>
            <strong>Email:</strong> {session.user.email || 'Not provided'}
          </p>
          <p>
            <strong>Name:</strong> {session.user.name || 'Not provided'}
          </p>
          <p>
            <strong>Image:</strong> {session.user.image ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Account Status</h2>
          <p>
            <strong>Onboarded:</strong> {session.user.onboarded ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Has Password:</strong>{' '}
            {session.user.hasPassword ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Email Verified:</strong>{' '}
            {session.user.emailVerified ? 'Yes' : 'No'}
          </p>
        </div>
      </div>

      {session.user.image && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Profile Image</h2>
          <img
            alt="Profile"
            className="w-24 h-24 rounded-full"
            src={session.user.image}
          />
        </div>
      )}
    </div>
  );
}
