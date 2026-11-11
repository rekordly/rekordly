"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, FileCsv, UploadSimple } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { Alert } from "@/components/ui/alert";
import { Page, PageHeader } from "@/components/ui/page";
import { financeApi } from "@/lib/money";
import { WorkspaceGate, type WorkspaceInfo, useAccountOptions } from "@/components/features/finance/shared";

interface CSVRow {
  date: string;
  description: string;
  amount: string;
  direction: "money_in" | "money_out";
  reference?: string;
}

function ImportContent({ workspaceId }: WorkspaceInfo) {
  const router = useRouter();
  const accounts = useAccountOptions(workspaceId);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setError("Please select a valid .csv file.");
      return;
    }

    setCsvFile(file);
    setError(null);
    setImportedCount(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setError("CSV file must have a header row and at least one data row.");
          return;
        }

        const rows: CSVRow[] = [];
        // Header line 0, data starts from 1
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
          if (parts.length < 3) continue;

          // Expected: Date, Description, Amount, [Direction], [Reference]
          const date = parts[0] || new Date().toISOString().split("T")[0];
          const description = parts[1] || `Imported row ${i}`;
          let amount = parts[2] || "0";
          let direction: "money_in" | "money_out" = "money_out";

          // If amount is negative or explicitly marked
          if (amount.startsWith("-")) {
            amount = amount.replace("-", "");
            direction = "money_out";
          } else if (parts[3]?.toLowerCase() === "credit" || parts[3]?.toLowerCase() === "money_in") {
            direction = "money_in";
          }

          rows.push({
            date,
            description,
            amount: parseFloat(amount).toFixed(2),
            direction,
            reference: parts[4] || "",
          });
        }

        if (rows.length === 0) {
          setError("No valid transaction rows found in CSV.");
          return;
        }

        setParsedRows(rows.slice(0, 100)); // Limit preview to 100 rows
      } catch {
        setError("Failed to parse CSV file. Please check format.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await financeApi.importCSVTransactions(workspaceId, {
        default_account_id: selectedAccountId ? Number(selectedAccountId) : undefined,
        rows: parsedRows,
      });

      setImportedCount(res.imported_count);
      setTimeout(() => {
        router.push("/review");
      }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import CSV transactions");
      setIsSubmitting(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Import Bank Transactions (CSV)"
        description="Upload a CSV bank statement to stage transactions into review drafts before ledger confirmation."
        actions={
          <AppButton
            variant="ghost"
            startContent={<ArrowLeft />}
            label="Back to Transactions"
            onPress={() => router.push("/transactions")}
          />
        }
      />

      <div className="max-w-3xl space-y-6">
        {error && <Alert status="error" description={error} />}

        {importedCount !== null ? (
          <div className="rounded-3xl border border-border/60 bg-surface p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle size={28} weight="duotone" />
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              {importedCount} Transactions Imported Successfully!
            </h2>
            <p className="text-xs text-muted">
              Transactions have been staged into your Drafts Review queue. Redirecting...
            </p>
          </div>
        ) : (
          <>
            {/* Step 1: Account selection and file dropzone */}
            <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
              <h3 className="font-heading text-sm font-bold text-foreground">1. Select Target Account</h3>
              <div className="space-y-1 max-w-sm">
                <label className="text-xs font-semibold text-foreground">Bank or Money Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select an account...</option>
                  {(accounts.options || []).map((acc) => (
                    <option key={acc.key} value={acc.key}>
                      {acc.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted">
                  The account associated with these imported statements.
                </p>
              </div>

              <h3 className="font-heading text-sm font-bold text-foreground pt-4 border-t border-border/40">
                2. Upload CSV File
              </h3>
              <div className="relative border-2 border-dashed border-border rounded-3xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileCsv size={28} weight="duotone" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {csvFile ? csvFile.name : "Click or drag & drop bank statement CSV"}
                  </div>
                  <p className="text-xs text-muted">
                    Format: Date (YYYY-MM-DD), Description, Amount, [Credit/Debit], [Reference]
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2: Staged Preview Table */}
            {parsedRows.length > 0 && (
              <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      Preview Staged Rows ({parsedRows.length})
                    </h3>
                    <p className="text-xs text-muted">Review parsed rows before importing into drafts.</p>
                  </div>
                  <AppButton
                    label={`Confirm & Import ${parsedRows.length} Rows`}
                    isLoading={isSubmitting}
                    onPress={handleImport}
                    startContent={<UploadSimple weight="bold" />}
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider border-b border-border/40">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Direction</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-surface-secondary/40">
                          <td className="px-4 py-2.5 font-mono text-[11px]">{row.date}</td>
                          <td className="px-4 py-2.5 font-medium text-foreground">{row.description}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                                row.direction === "money_in"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-rose-500/10 text-rose-500"
                              }`}
                            >
                              {row.direction === "money_in" ? "MONEY IN" : "MONEY OUT"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">
                            {row.amount}
                          </td>
                          <td className="px-4 py-2.5 text-muted font-mono text-[10px]">{row.reference || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

export default function ImportPage() {
  return (
    <WorkspaceGate>
      {(workspace) => <ImportContent key={workspace.workspaceId} {...workspace} />}
    </WorkspaceGate>
  );
}
