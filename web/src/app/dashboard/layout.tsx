// app/dashboard/layout.tsx
import { getServerSession } from 'next-auth';

import Navbar from '@/components/dashboard/Navbar';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Sidebar } from '@/components/dashboard/layout/Sidebar';
import { QuickAction } from '@/components/quick-action';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <div className="h-screen max-w-8xl mx-auto flex flex-col overflow-hidden">
      {session?.user && (
        <div className="flex-none">
          <Navbar user={session.user} />
        </div>
      )}

      {/* Main content area with sidebar and scrollable content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="hidden sm:block flex-none">
          <Sidebar />
        </div>

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="container overflow-y-auto mx-auto p-6 pb-28">
            {children}
          </div>
        </main>
      </div>
      <QuickAction />
    </div>
  );
}
