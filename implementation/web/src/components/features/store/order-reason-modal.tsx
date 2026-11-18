"use client";

import { useState } from "react";
import { AppModal } from "@/components/ui/app-modal";
import { AppTextarea } from "@/components/ui/app-textarea";
import { AppButton } from "@/components/ui/app-button";

export function OrderReasonModal({ title, confirmLabel, onClose, onSubmit, danger = false, required = false }: {
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  danger?: boolean;
  required?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <AppModal isOpen onOpenChange={(open) => { if (!open && !pending) onClose(); }} title={title} onSubmit={async (event) => {
    event.preventDefault();
    if (pending || (required && !reason.trim())) return;
    setPending(true);
    setError("");
    try { await onSubmit(reason.trim()); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The order could not be updated."); }
    finally { setPending(false); }
  }} footer={<><AppButton variant="ghost" label="Back" isDisabled={pending} onPress={onClose} /><AppButton type="submit" variant={danger ? "danger" : "primary"} label={confirmLabel} isLoading={pending} isDisabled={required && !reason.trim()} /></>}>
    <AppTextarea label={required ? "Reason" : "Reason (optional)"} isRequired={required} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={500} autoFocus />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </AppModal>;
}
