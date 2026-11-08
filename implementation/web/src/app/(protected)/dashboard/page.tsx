import { SurfaceCard } from "@/components/ui";

export default function DashboardPage() {
  return (
    <main className="p-5 sm:p-7">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your Rekordly workspace is ready.</p>
        <SurfaceCard className="mt-6 shadow-none">
          <p className="text-sm text-muted-foreground">Dashboard modules will be added here.</p>
        </SurfaceCard>
      </div>
    </main>
  );
}
