"use client";

import { useState } from "react";

import { MixedExpenseForm } from "@/components/features/mixed-expense-form";
import { MoneyRecordWorkflow } from "@/components/features/money-record-workflow";
import { Segmented } from "@/components/ui/page";

const CAPTURE_MODES = [
  { key: "standard", label: "Guided record" },
  { key: "mixed", label: "Shared expense" },
] as const;

export function CaptureWorkspace({ initialDraftId }: { initialDraftId?: string }) {
  const [mode, setMode] = useState<"standard" | "mixed">("standard");
  return (
    <div className="space-y-6">
      <Segmented aria-label="Record type" options={CAPTURE_MODES} value={mode} onChange={setMode} />
      {mode === "standard" ? <MoneyRecordWorkflow initialDraftId={initialDraftId} /> : <MixedExpenseForm />}
    </div>
  );
}
