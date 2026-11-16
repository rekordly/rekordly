"use client";

import { FileText, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { formatDate } from "@/lib/format";
import { openPrivateEvidence, uploadPrivateEvidence } from "@/lib/evidence";
import { financeApi } from "@/lib/money";
import type { DocumentFileView } from "@/types/finance";
import { ItemsTable } from "./document-page";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentFilesTab({
  workspaceId,
  docType,
  docId,
  files,
  onChanged,
}: {
  workspaceId: number;
  docType: string;
  docId: number;
  files: DocumentFileView[];
  onChanged: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setUploading(true);
    try {
      const draftId = `doc-${docType}-${docId}-${Date.now()}`;
      const asset = await uploadPrivateEvidence({
        workspaceId,
        draftId,
        evidence: {
          file: selected,
          fileName: selected.name,
          mimeType: selected.type || "application/octet-stream",
          sizeBytes: selected.size,
        },
      });
      await financeApi.attachDocumentFile(workspaceId, docType, docId, Number(asset.id));
      toast.success("File attached");
      onChanged();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpen = async (evidenceId: number) => {
    try {
      await openPrivateEvidence(workspaceId, String(evidenceId));
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const handleDelete = async (fileId: number) => {
    setDeletingId(fileId);
    try {
      await financeApi.removeDocumentFile(workspaceId, docType, docId, fileId);
      toast.success("File removed");
      onChanged();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to remove file");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          Attach receipts, supplier invoices, or waybills to this document.
        </p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
          />
          <AppButton
            size="sm"
            startContent={<Plus size={15} />}
            label="Add file"
            isLoading={uploading}
            onPress={() => fileInputRef.current?.click()}
          />
        </div>
      </div>

      <ItemsTable
        rows={files}
        rowKey={(f) => f.id}
        empty="No files attached yet. Add private evidence such as invoices or waybills."
        columns={[
          {
            key: "file",
            label: "File",
            render: (f) => (
              <button
                type="button"
                onClick={() => void handleOpen(f.evidence_id)}
                className="flex items-center gap-2 text-left font-medium text-primary hover:underline cursor-pointer"
              >
                <FileText size={18} className="shrink-0 text-muted" />
                <span className="truncate max-w-[260px]">{f.file_name}</span>
              </button>
            ),
          },
          {
            key: "size",
            label: "Size",
            align: "right",
            render: (f) => formatBytes(f.size_bytes),
          },
          {
            key: "uploaded_by",
            label: "Uploaded by",
            render: (f) => f.uploaded_by_name || "Team",
          },
          {
            key: "date",
            label: "Date",
            render: (f) => formatDate(f.created_at),
          },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (f) => (
              <button
                type="button"
                aria-label={`Remove ${f.file_name}`}
                disabled={deletingId === f.id}
                onClick={() => void handleDelete(f.id)}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-danger cursor-pointer disabled:opacity-50"
              >
                <Trash size={15} />
              </button>
            ),
          },
        ]}
        card={(f) => ({
          title: f.file_name,
          sub: `${formatBytes(f.size_bytes)} · ${formatDate(f.created_at)}`,
          amount: (
            <button
              type="button"
              aria-label={`Remove ${f.file_name}`}
              onClick={() => void handleDelete(f.id)}
              className="text-muted hover:text-danger"
            >
              <Trash size={16} />
            </button>
          ),
        })}
      />
    </div>
  );
}
