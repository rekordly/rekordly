"use client";

import { DownloadSimple, FilePdf, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { docsSharingApi } from "@/lib/docs-sharing";

export function GuestSharePortal({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["bp14", "guest-portal", token],
    queryFn: () => docsSharingApi.getGuestPortal(token),
    retry: false,
  });

  if (q.isPending) {
    return (
      <Page>
        <PageHeader title="Shared Document" description="Loading shared document..." />
      </Page>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Page>
        <PageHeader title="Document Unavailable" description="This share link is invalid, expired, or revoked." />
        <Alert status="warning" title="Unavailable" description="Contact the sender if you need a fresh link." />
      </Page>
    );
  }

  const doc = q.data;

  return (
    <Page>
      <PageHeader
        title={`${doc.document_type.toUpperCase()} ${doc.document_number}`}
        description={`Shared by ${doc.sender_name} · Version v${doc.version}`}
        actions={
          doc.can_download ? (
            <form action={`/api/v1/s/${encodeURIComponent(token)}/commands/create-download`} method="post" target="_blank">
              <AppButton type="submit" startContent={<DownloadSimple size={16} />} label="Download PDF" />
            </form>
          ) : null
        }
      />

      <div className="rounded-xl border bg-content1 p-5 space-y-3 text-sm max-w-2xl">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-medium">
            <FilePdf size={18} />
            {doc.sender_name} → {doc.recipient_name}
          </span>
          <StatusPill tone={doc.payment_state === "paid" ? "success" : "neutral"}>{doc.payment_state}</StatusPill>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-default-500">
          <div>Date: {doc.document_date}</div>
          <div>Status: {doc.status}</div>
          <div>
            Total: <span className="font-semibold text-foreground">{doc.currency} {doc.total_display}</span>
          </div>
          <div>Expires: {new Date(doc.expires_at).toLocaleDateString()}</div>
        </div>
        {!doc.artifact_ready ? (
          <Alert status="info" description="PDF artifact is being prepared; downloading will render on demand." />
        ) : null}
        <p className="inline-flex items-center gap-1.5 text-xs text-default-500">
          <WarningCircle size={14} />
          Guest access is restricted to this exact document version.
        </p>
      </div>
    </Page>
  );
}
