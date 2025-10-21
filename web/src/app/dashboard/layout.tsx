// app/dashboard/layout.tsx
import Navbar from "@/components/dashboard/Navbar";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getServerSession } from 'next-auth';
import { Sidebar } from "@/components/dashboard/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Fixed Navbar at top */}
      {session?.user && (
        <div className="flex-none">
          <Navbar user={session.user} />
        </div>
      )}
      
      {/* Main content area with sidebar and scrollable content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Fixed Sidebar - hidden on mobile */}
        <div className="hidden sm:block flex-none">
          <Sidebar />
        </div>
        
        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto bg-default-50">
          <div className="container mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}