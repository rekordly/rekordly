import Link from "next/link";

export default function OfflineFallbackPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">You are offline</h1>
      <p className="mt-3 text-sm text-muted">
        Rekordly could not reach the server. Any local drafts or queued commands stored on this device remain safe and
        unposted until you reconnect.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/sync"
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Open Sync &amp; Drafts
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-default px-4 py-2 text-sm font-medium text-foreground"
        >
          Retry Dashboard
        </Link>
      </div>
    </main>
  );
}
