"use client";

import { toast } from "@heroui/react";
import { ArrowsClockwise, Copy, DownloadSimple, EnvelopeSimple, FilePdf, FolderLock, Link as LinkIcon, PaperPlaneTilt, Trash, WhatsappLogo } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { docsSharingApi, docsSharingKeys } from "@/lib/docs-sharing";
import { formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { DeliveryRecord, ShareGrant, WhatsAppHandoffResult, WorkspaceFile } from "@/types/docs-sharing";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const TABS = [
  { key: "sharing", label: "Document Sharing & Delivery" },
  { key: "files", label: "Private Files & Evidence" },
] as const;

function DocumentsSharingContent({ workspaceId }: WorkspaceInfo) {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canRender = hasWorkspacePermission(scope, PERMISSIONS.DOCUMENTS_RENDER);
  const canShare = hasWorkspacePermission(scope, PERMISSIONS.SHARES_CREATE);
  const canSend = hasWorkspacePermission(scope, PERMISSIONS.DOCUMENTS_SEND);
  const canFiles = hasWorkspacePermission(scope, PERMISSIONS.FILES_MANAGE);

  const [tab, setTab] = useState<"sharing" | "files">("sharing");
  const [docType, setDocType] = useState("invoice");
  const [docIdInput, setDocIdInput] = useState("1");
  const docId = Number(docIdInput) || 1;

  const [emailInput, setEmailInput] = useState("");
  const [waResult, setWaResult] = useState<WhatsAppHandoffResult | null>(null);
  const [latestShareURL, setLatestShareURL] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);

  const sharesQ = useQuery({
    queryKey: docsSharingKeys.shares(workspaceId, docType, docId),
    queryFn: () => docsSharingApi.listShareGrants(workspaceId, docType, docId),
    enabled: canShare && tab === "sharing",
  });

  const deliveriesQ = useQuery({
    queryKey: docsSharingKeys.deliveries(workspaceId, docType, docId),
    queryFn: () => docsSharingApi.listDeliveries(workspaceId, docType, docId),
    enabled: (canSend || hasWorkspacePermission(scope, PERMISSIONS.DELIVERIES_VIEW)) && tab === "sharing",
  });

  const filesQ = useQuery({
    queryKey: docsSharingKeys.files(workspaceId),
    queryFn: () => docsSharingApi.listFiles(workspaceId),
    enabled: canFiles && tab === "files",
  });

  const renderMut = useMutation({
    mutationFn: () => docsSharingApi.renderDocument(workspaceId, docType, docId, `rnd-${workspaceId}-${docType}-${docId}-${Date.now()}`),
    onSuccess: (res) => {
      setRenderStatus(`PDF v${res.artifact.version} ready (${res.artifact.page_count} page(s))`);
      toast.success("Immutable PDF snapshot rendered");
    },
    onError: (err) => {
      setRenderStatus("Invoice issued. PDF is still being prepared.");
      toast.danger(err instanceof Error ? err.message : "Render failed");
    },
  });

  const shareMut = useMutation({
    mutationFn: () => docsSharingApi.createShareGrant(workspaceId, docType, docId, 168),
    onSuccess: (res) => {
      setLatestShareURL(res.share_url);
      toast.success("Guest share link created");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.shares(workspaceId, docType, docId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to create share link"),
  });

  const revokeMut = useMutation({
    mutationFn: (grantId: number) => docsSharingApi.revokeShareGrant(workspaceId, grantId),
    onSuccess: () => {
      toast.success("Share link revoked");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.shares(workspaceId, docType, docId) });
    },
  });

  const waMut = useMutation({
    mutationFn: () => docsSharingApi.whatsappHandoff(workspaceId, docType, docId),
    onSuccess: (res) => setWaResult(res),
    onError: (err) => toast.danger(err instanceof Error ? err.message : "WhatsApp handoff failed"),
  });

  const emailMut = useMutation({
    mutationFn: () => docsSharingApi.sendDocumentEmail(workspaceId, docType, docId, emailInput, `email-${workspaceId}-${docType}-${docId}-${Date.now()}`),
    onSuccess: () => {
      toast.success("Delivery queued/accepted by email provider");
      setEmailInput("");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.deliveries(workspaceId, docType, docId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Email send failed"),
  });

  const retryDeliv = useMutation({
    mutationFn: (id: number) => docsSharingApi.retryDelivery(workspaceId, id),
    onSuccess: () => {
      toast.success("Delivery reconciled/retried");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.deliveries(workspaceId, docType, docId) });
    },
  });

  const uploadFileMut = useMutation({
    mutationFn: async (file: File) => {
      const intent = await docsSharingApi.createUploadIntent(workspaceId, {
        filename: file.name,
        mime_type: file.type || "application/pdf",
        byte_size: file.size,
        file_class: "private_evidence",
      });
      return docsSharingApi.finalizeUpload(workspaceId, intent.file.id);
    },
    onSuccess: () => {
      toast.success("Private file registered with authenticated delivery");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.files(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Upload failed"),
  });

  const deleteFileMut = useMutation({
    mutationFn: (id: number) => docsSharingApi.requestFileDeletion(workspaceId, id),
    onSuccess: () => {
      toast.success("File deletion scheduled and share grants revoked");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.files(workspaceId) });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "File deletion blocked (check active links)"),
  });

  return (
    <Page>
      <PageHeader
        title="Documents, Sharing & Files"
        description="Immutable PDF artifacts, hashed guest share links, WhatsApp handoff, HTTPS email deliveries, and private authenticated files."
      />

      <Segmented aria-label="Documents and files tabs" options={TABS} value={tab} onChange={setTab} />

      {tab === "sharing" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-default-200 bg-content1 p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs space-y-1">
                <span>Document type</span>
                <select className="rounded-lg border px-2 py-1.5 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="invoice">Invoice</option>
                  <option value="estimate">Estimate</option>
                  <option value="purchase_order">Purchase Order</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span>Document ID</span>
                <input className="w-28 rounded-lg border px-2 py-1.5 text-sm" value={docIdInput} onChange={(e) => setDocIdInput(e.target.value)} />
              </label>
              {canRender ? (
                <AppButton variant="secondary" startContent={<FilePdf size={16} />} label="Render PDF" isLoading={renderMut.isPending} onPress={() => renderMut.mutate()} />
              ) : null}
              {canShare ? (
                <>
                  <AppButton variant="secondary" startContent={<LinkIcon size={16} />} label="Create share link" isLoading={shareMut.isPending} onPress={() => shareMut.mutate()} />
                  <AppButton variant="tertiary" startContent={<WhatsappLogo size={16} />} label="Share to WhatsApp" isLoading={waMut.isPending} onPress={() => waMut.mutate()} />
                </>
              ) : null}
            </div>

            {renderStatus ? <Alert status="info" description={renderStatus} /> : null}
            {latestShareURL ? (
              <Alert
                status="success"
                title="Guest share URL (shown once)"
                description={latestShareURL}
              />
            ) : null}

            {canSend ? (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <input
                  type="email"
                  className="flex-1 min-w-[220px] rounded-lg border px-3 py-1.5 text-sm"
                  placeholder="Recipient email (e.g. customer@example.com)"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
                <AppButton
                  size="sm"
                  startContent={<PaperPlaneTilt size={14} />}
                  label="Send email"
                  isDisabled={!emailInput.trim()}
                  isLoading={emailMut.isPending}
                  onPress={() => emailMut.mutate()}
                />
              </div>
            ) : null}
          </div>

          <DataView<ShareGrant>
            title="Guest share grants"
            rows={sharesQ.data ?? []}
            rowKey={(g) => g.id}
            isLoading={sharesQ.isPending}
            isError={sharesQ.isError}
            columns={[
              { key: "purpose", label: "Purpose", render: (g) => g.purpose.replaceAll("_", " ") },
              { key: "ver", label: "Version", render: (g) => `v${g.version}` },
              { key: "views", label: "Views / Downloads", render: (g) => `${g.access_count} / ${g.download_count}` },
              { key: "exp", label: "Expires", render: (g) => formatDate(g.expires_at) },
              {
                key: "status",
                label: "State",
                render: (g) => <StatusPill tone={g.revoked_at ? "danger" : "success"}>{g.revoked_at ? "Revoked" : "Active"}</StatusPill>,
              },
              {
                key: "act",
                label: "",
                align: "right",
                render: (g) => (!g.revoked_at ? <AppButton size="sm" variant="ghost" label="Revoke" onPress={() => revokeMut.mutate(g.id)} /> : null),
              },
            ]}
            renderCard={(g) => (
              <RecordCard
                icon={<LinkIcon size={18} weight="duotone" />}
                reference={`Expires ${formatDate(g.expires_at)}`}
                title={`${g.resource_type} #${g.resource_id} (${g.purpose})`}
                amount={`${g.access_count} views`}
                status={<StatusPill tone={g.revoked_at ? "danger" : "success"}>{g.revoked_at ? "Revoked" : "Active"}</StatusPill>}
              />
            )}
            empty={<EmptyState icon={LinkIcon} title="No share grants" description="Create a guest share link or WhatsApp handoff above." />}
          />

          <DataView<DeliveryRecord>
            title="Email & handoff deliveries"
            rows={deliveriesQ.data ?? []}
            rowKey={(d) => d.id}
            isLoading={deliveriesQ.isPending}
            isError={deliveriesQ.isError}
            columns={[
              { key: "ch", label: "Channel", render: (d) => d.channel.replaceAll("_", " ") },
              { key: "rcp", label: "Recipient", render: (d) => d.recipient_masked || "Guest link" },
              {
                key: "st",
                label: "Delivery state",
                render: (d) => (
                  <StatusPill tone={d.status === "delivered" || d.status === "accepted" ? "success" : d.status === "bounced" || d.status === "failed" ? "danger" : "warning"}>
                    {d.status.replaceAll("_", " ")}
                  </StatusPill>
                ),
              },
              { key: "att", label: "Attempts", render: (d) => String(d.attempts) },
              {
                key: "act",
                label: "",
                align: "right",
                render: (d) =>
                  d.status === "retry_scheduled" ? (
                    <AppButton size="sm" variant="ghost" startContent={<ArrowsClockwise size={14} />} label="Retry" onPress={() => retryDeliv.mutate(d.id)} />
                  ) : null,
              },
            ]}
            renderCard={(d) => (
              <RecordCard
                icon={<EnvelopeSimple size={18} weight="duotone" />}
                reference={formatDate(d.created_at)}
                title={d.recipient_masked || d.channel}
                amount={`${d.attempts} attempt(s)`}
                status={<StatusPill tone="neutral">{d.status}</StatusPill>}
              />
            )}
            empty={<EmptyState icon={EnvelopeSimple} title="No deliveries yet" description="Send an email or WhatsApp handoff to track delivery states." />}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {canFiles ? (
            <div className="rounded-xl border border-default-200 bg-content1 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Private Authenticated Evidence Upload</p>
                <p className="text-xs text-default-500">Sensitive financial files use authenticated private delivery and signed short-lived URLs.</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary">
                <FolderLock size={16} />
                <span>{uploadFileMut.isPending ? "Registering..." : "Upload private file"}</span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFileMut.mutate(f);
                  }}
                />
              </label>
            </div>
          ) : null}

          <DataView<WorkspaceFile>
            title="Workspace files"
            rows={filesQ.data ?? []}
            rowKey={(f) => f.id}
            isLoading={filesQ.isPending}
            isError={filesQ.isError}
            columns={[
              { key: "name", label: "Filename", render: (f) => f.original_filename },
              { key: "cls", label: "Class", render: (f) => <StatusPill tone="neutral">{f.file_class}</StatusPill> },
              { key: "scan", label: "Scan", render: (f) => <StatusPill tone={f.scan_status === "quarantined" ? "danger" : "success"}>{f.scan_status}</StatusPill> },
              { key: "del", label: "Lifecycle", render: (f) => f.deletion_status },
              {
                key: "act",
                label: "",
                align: "right",
                render: (f) => (
                  <div className="flex justify-end gap-1.5">
                    {f.scan_status !== "quarantined" ? (
                      <AppButton
                        size="sm"
                        variant="ghost"
                        startContent={<DownloadSimple size={14} />}
                        label="Signed URL"
                        onPress={async () => {
                          try {
                            const dl = await docsSharingApi.createFileDownload(workspaceId, f.id);
                            window.open(dl.url, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            toast.danger(err instanceof Error ? err.message : "Download blocked");
                          }
                        }}
                      />
                    ) : null}
                    <AppButton size="sm" variant="ghost" startContent={<Trash size={14} />} label="Delete" onPress={() => deleteFileMut.mutate(f.id)} />
                  </div>
                ),
              },
            ]}
            renderCard={(f) => (
              <RecordCard
                icon={<FolderLock size={18} weight="duotone" />}
                reference={`${f.file_class} · ${f.scan_status}`}
                title={f.original_filename}
                amount={`${f.byte_size} B`}
                status={<StatusPill tone={f.scan_status === "quarantined" ? "danger" : "neutral"}>{f.deletion_status}</StatusPill>}
              />
            )}
            empty={<EmptyState icon={FolderLock} title="No files uploaded" description="Upload private financial evidence above." />}
          />
        </div>
      )}

      <FormDrawer
        isOpen={waResult !== null}
        onOpenChange={(open) => !open && setWaResult(null)}
        title="WhatsApp Handoff"
        submitLabel="Close"
        onSubmit={(e) => {
          e.preventDefault();
          setWaResult(null);
        }}
      >
        {waResult ? (
          <div className="space-y-3 text-sm">
            <Alert status="warning" description={waResult.disclosure} />
            <textarea readOnly className="w-full rounded-lg border p-2 text-xs min-h-[80px]" value={waResult.message_text} />
            <div className="flex flex-wrap gap-2">
              <a href={waResult.whatsapp_link} target="_blank" rel="noopener noreferrer">
                <AppButton startContent={<WhatsappLogo size={16} />} label="Open WhatsApp" />
              </a>
              <AppButton
                variant="secondary"
                startContent={<Copy size={16} />}
                label="Copy link"
                onPress={() => {
                  void navigator.clipboard.writeText(waResult.share_url);
                  toast.success("Guest share link copied");
                }}
              />
            </div>
          </div>
        ) : null}
      </FormDrawer>
    </Page>
  );
}

export function DocumentsSharingWorkspace() {
  return <WorkspaceGate>{(ws) => <DocumentsSharingContent key={ws.workspaceId} {...ws} />}</WorkspaceGate>;
}
