import { moneyApi } from "@/lib/money";
import type { EvidenceAsset } from "@/types/finance";

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED_EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface EvidenceUploadFile {
  file: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Mirrors the API policy so unsupported files are never retained offline. */
export function validateEvidenceFile(file: EvidenceUploadFile): string | null {
  if (!file.fileName || file.fileName !== file.fileName.split(/[\\/]/).pop()) {
    return "Choose a file with a valid name.";
  }
  if (!ACCEPTED_EVIDENCE_TYPES.has(file.mimeType)) {
    return "Use a PDF, JPEG, PNG or WebP receipt.";
  }
  if (file.sizeBytes <= 0 || file.sizeBytes > EVIDENCE_MAX_BYTES) {
    return "Each receipt must be no larger than 10 MB.";
  }
  return null;
}

async function sha256(file: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload through a short-lived server authorization, then register only the
 * verified private asset. No Cloudinary delivery URL is stored by the client.
 */
export async function uploadPrivateEvidence(input: {
  workspaceId: number;
  draftId: string;
  evidence: EvidenceUploadFile;
}): Promise<EvidenceAsset> {
  const invalid = validateEvidenceFile(input.evidence);
  if (invalid) throw new Error(invalid);

  const authorization = await moneyApi.authorizeEvidenceUpload(input.workspaceId, input.draftId, {
    file_name: input.evidence.fileName,
    mime_type: input.evidence.mimeType,
    size_bytes: String(input.evidence.sizeBytes),
  });
  const fields = new FormData();
  fields.set("file", input.evidence.file, input.evidence.fileName);
  fields.set("api_key", authorization.upload.api_key);
  fields.set("timestamp", authorization.upload.timestamp);
  fields.set("signature", authorization.upload.signature);
  fields.set("folder", authorization.upload.folder);
  fields.set("public_id", authorization.upload.public_id);
  fields.set("type", authorization.upload.type);
  const response = await fetch(authorization.upload.upload_url, { method: "POST", body: fields });
  if (!response.ok) throw new Error("Private evidence upload failed. Please try again.");
  const uploaded = (await response.json()) as { public_id?: string };
  if (!uploaded.public_id) throw new Error("The evidence provider did not return an asset ID.");

  const registered = await moneyApi.registerEvidenceAsset(input.workspaceId, input.draftId, {
    asset_id: uploaded.public_id,
    file_name: input.evidence.fileName,
    mime_type: input.evidence.mimeType,
    size_bytes: String(input.evidence.sizeBytes),
    sha256_hash: await sha256(input.evidence.file),
  });
  return registered.evidence;
}

/** Opens a server-authorized, short-lived private receipt URL in a new tab. */
export async function openPrivateEvidence(workspaceId: number, evidenceId: string): Promise<void> {
  const popup = window.open("", "_blank");
  if (popup) popup.opener = null;
  try {
    const { access } = await moneyApi.getEvidenceAccess(workspaceId, evidenceId);
    if (popup) {
      popup.location.replace(access.url);
      return;
    }
    window.location.assign(access.url);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
