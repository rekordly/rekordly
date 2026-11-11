"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { ArrowLeft, Envelope, PencilSimple, Phone, Receipt } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Page, PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { Contact } from "@/types/finance";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";

interface SupplierDetailData {
  supplier: Contact;
  purchases: Array<{
    id: number;
    supplier_name: string;
    total_amount_minor: number;
    paid_amount_minor: number;
    currency: string;
    currency_exponent: number;
    status: string;
    purchase_date: string;
    reference?: string | null;
  }>;
}

function SupplierDetailContent({ workspaceId, currency: wsCurrency, supplierId }: WorkspaceInfo & { supplierId: number }) {
  const router = useRouter();
  const [data, setData] = useState<SupplierDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchDetail = () => {
    setLoading(true);
    financeApi
      .getSupplierDetail(workspaceId, supplierId)
      .then((res) => {
        setData(res);
        setEditName(res.supplier.name);
        setEditPhone(res.supplier.phone || "");
        setEditEmail(res.supplier.email || "");
        setEditNotes(res.supplier.notes || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load supplier details");
        setLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    financeApi
      .getSupplierDetail(workspaceId, supplierId)
      .then((res) => {
        if (!active) return;
        setData(res);
        setEditName(res.supplier.name);
        setEditPhone(res.supplier.phone || "");
        setEditEmail(res.supplier.email || "");
        setEditNotes(res.supplier.notes || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load supplier details");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, supplierId]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      await financeApi.updateContact(workspaceId, "suppliers", supplierId, {
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        notes: editNotes.trim(),
        party_type: data?.supplier.party_type || "supplier",
      });
      toast.success("Supplier updated");
      setIsEditOpen(false);
      fetchDetail();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to update supplier");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <div className="flex h-64 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <PageHeader
          title="Supplier Not Found"
          actions={<AppButton variant="ghost" startContent={<ArrowLeft />} label="Back to Contacts" onPress={() => router.push("/customers")} />}
        />
        <Alert status="error" description={error || "Supplier record could not be loaded."} />
      </Page>
    );
  }

  const { supplier, purchases } = data;
  const totalPurchased = (purchases || []).reduce((acc, p) => acc + Number(p.total_amount_minor || 0), 0);
  const totalPaid = (purchases || []).reduce((acc, p) => acc + Number(p.paid_amount_minor || 0), 0);

  return (
    <Page>
      <PageHeader
        title={supplier.name}
        description={`Supplier record${supplier.created_at ? ` • Added ${new Date(supplier.created_at).toLocaleDateString()}` : ""}`}
        actions={
          <div className="flex gap-2">
            <AppButton variant="ghost" startContent={<ArrowLeft />} label="All Contacts" onPress={() => router.push("/customers")} />
            <AppButton variant="secondary" startContent={<PencilSimple size={16} />} label="Edit" onPress={() => setIsEditOpen(true)} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Receipt size={16} className="text-primary" />
            Total Purchases
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">{formatMinorAmount(totalPurchased, wsCurrency, 2)}</div>
          <p className="text-[11px] text-muted">{purchases?.length ?? 0} purchases recorded</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Receipt size={16} className="text-rose-500" />
            Unpaid Balance
          </div>
          <div className="text-2xl font-bold font-mono text-rose-500">
            {formatMinorAmount(totalPurchased - totalPaid, wsCurrency, 2)}
          </div>
          <p className="text-[11px] text-muted">Amount owed to supplier</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4 h-fit">
          <h3 className="font-heading text-sm font-bold text-foreground">Contact Information</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3 text-muted">
              <Phone size={16} className="text-foreground shrink-0" />
              <span className="text-foreground">{supplier.phone || "No phone recorded"}</span>
            </div>
            <div className="flex items-center gap-3 text-muted">
              <Envelope size={16} className="text-foreground shrink-0" />
              <span className="text-foreground">{supplier.email || "No email recorded"}</span>
            </div>
            {supplier.notes && (
              <div className="pt-3 border-t border-border/40 text-muted">
                <span className="font-semibold text-foreground block mb-1">Notes</span>
                {supplier.notes}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4 lg:col-span-2">
          <h3 className="font-heading text-sm font-bold text-foreground">Purchase History</h3>
          {!purchases || purchases.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No purchases recorded for this supplier yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider border-b border-border/40">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 text-muted">{p.purchase_date}</td>
                      <td className="px-4 py-2.5 font-sans text-foreground">{p.reference || `Purchase #${p.id}`}</td>
                      <td className="px-4 py-2.5 font-sans uppercase text-[10px] text-muted">{p.status}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground">
                        {formatMinorAmount(p.total_amount_minor, p.currency || wsCurrency, p.currency_exponent || 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-500">
                        {formatMinorAmount(p.paid_amount_minor, p.currency || wsCurrency, p.currency_exponent || 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <FormDrawer
        isOpen={isEditOpen}
        onOpenChange={(open) => !open && setIsEditOpen(false)}
        title="Edit Supplier Details"
        submitLabel="Save changes"
        isSubmitting={isSaving}
        onSubmit={handleSaveEdit}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Name</label>
            <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Phone</label>
            <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Email</label>
            <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Notes</label>
            <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full p-3 rounded-2xl border border-border bg-background text-sm text-foreground" />
          </div>
        </div>
      </FormDrawer>
    </Page>
  );
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const supplierId = Number(resolvedParams.id);

  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <SupplierDetailContent key={workspace.workspaceId} {...workspace} supplierId={supplierId} />}
    </WorkspaceGate>
  );
}
