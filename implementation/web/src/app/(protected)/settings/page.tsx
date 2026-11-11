"use client";

import {
  Buildings,
  Check,
  Copy,
  Desktop,
  Envelope,
  Plus,
  ShieldCheck,
  Trash,
  UserPlus,
  Users,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { apiClient } from "@/lib/api";
import { financeApi } from "@/lib/money";

const SETTINGS_TABS = [
  { key: "profile", label: "Workspace Profile" },
  { key: "team", label: "Team & Permissions" },
  { key: "sessions", label: "Active Sessions" },
] as const;

const PERMISSION_CATALOG = [
  { code: "money.view", label: "View accounts & transactions" },
  { code: "money.create", label: "Record income & expenses" },
  { code: "money.void", label: "Void posted transactions" },
  { code: "sales.view", label: "View sales & payments" },
  { code: "sales.create", label: "Record sales & payments" },
  { code: "purchases.view", label: "View purchases & bills" },
  { code: "purchases.create", label: "Create purchases & bills" },
  { code: "invoices.view", label: "View invoices, estimates & proformas" },
  { code: "invoices.create", label: "Create invoices, estimates & debit notes" },
  { code: "reconcile.manage", label: "Run bank & cash reconciliation" },
  { code: "contacts.view", label: "View customers & suppliers" },
  { code: "contacts.manage", label: "Edit & merge customers/suppliers" },
  { code: "inventory.view_quantity", label: "View stock quantities" },
  { code: "reports.view_basic", label: "View financial reports & budgets" },
  { code: "reports.tax", label: "Manage tax readiness & VAT settings" },
  { code: "settings.manage", label: "Manage workspace profile & team" },
];

interface SessionRow {
  id: number;
  kind: string;
  device_label?: string;
  issued_at: string;
  expires_at: string;
  current?: boolean;
}

function SettingsContent({ workspaceId }: WorkspaceInfo) {
  const [tab, setTab] = useState<"profile" | "team" | "sessions">("profile");

  const profileQuery = useQuery({
    queryKey: ["settings-profile", workspaceId],
    queryFn: () => financeApi.getWorkspaceSettings(workspaceId),
  });

  const teamQuery = useQuery({
    queryKey: ["settings-team", workspaceId],
    queryFn: () => financeApi.getWorkspaceTeam(workspaceId),
  });

  const outletsQuery = useQuery({
    queryKey: ["settings-outlets", workspaceId],
    queryFn: () => financeApi.listOutlets(workspaceId),
  });

  const handleOutletScopeChange = async (memberId: number, value: string) => {
    try {
      const outletIds = value ? [Number(value)] : [];
      await financeApi.updateMemberOutletScope(workspaceId, memberId, outletIds);
      toast.success("Member outlet scope updated");
      teamQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to update outlet scope");
    }
  };

  const sessionsQuery = useQuery({
    queryKey: ["me-sessions"],
    queryFn: () => apiClient.get<{ sessions: SessionRow[] }>("/api/v1/me/sessions").then((r) => r.sessions ?? []),
  });

  // Profile form state (draft overrides until saved or profile reloads)
  const [nameDraft, setName] = useState<string | null>(null);
  const [timezoneDraft, setTimezone] = useState<string | null>(null);
  const [businessTypeDraft, setBusinessType] = useState<string | null>(null);
  const [countryDraft, setCountry] = useState<string | null>(null);
  const [phoneDraft, setPhone] = useState<string | null>(null);
  const [emailDraft, setEmail] = useState<string | null>(null);
  const [addressDraft, setAddress] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const w = profileQuery.data;
  const name = nameDraft ?? w?.name ?? "";
  const timezone = timezoneDraft ?? w?.timezone ?? "Africa/Lagos";
  const businessType = businessTypeDraft ?? w?.business_type ?? "";
  const country = countryDraft ?? w?.country ?? "NG";
  const phone = phoneDraft ?? w?.contact_phone ?? "";
  const email = emailDraft ?? w?.contact_email ?? "";
  const address = addressDraft ?? w?.address ?? "";

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      await financeApi.updateWorkspaceSettings(workspaceId, {
        name: name.trim(),
        timezone: timezone.trim() || "Africa/Lagos",
        business_type: businessType.trim(),
        country: country.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        address: address.trim(),
      });
      toast.success("Workspace profile saved");
      profileQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to save workspace settings");
    } finally {
      setSavingProfile(false);
    }
  };

  // Invite drawer state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviting, setInviting] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<{ invite_url: string; role_name: string } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await financeApi.createWorkspaceInvitation(workspaceId, {
        email: inviteEmail.trim(),
        role_code: inviteRole,
      });
      setCreatedInvite({ invite_url: res.invite_url, role_name: res.role_name });
      toast.success("Workspace invitation created");
      teamQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async (invId: number) => {
    try {
      await financeApi.revokeWorkspaceInvitation(workspaceId, invId);
      toast.success("Invitation revoked");
      teamQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to revoke invitation");
    }
  };

  const handleTogglePermission = async (roleId: number, currentPerms: string[], code: string) => {
    const next = currentPerms.includes(code)
      ? currentPerms.filter((p) => p !== code)
      : [...currentPerms, code];
    try {
      await financeApi.updateRolePermissions(workspaceId, roleId, next);
      toast.success("Role permissions updated");
      teamQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to update permissions");
    }
  };

  const handleRevokeSession = async (sessionId: number) => {
    try {
      await apiClient.delete(`/api/v1/me/sessions/${sessionId}`);
      toast.success("Session revoked");
      sessionsQuery.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to revoke session");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Workspace Settings"
        description="Manage your business profile, team invitations, role permissions, and active devices."
        actions={
          tab === "team" ? (
            <AppButton
              startContent={<UserPlus weight="bold" />}
              label="Invite member"
              onPress={() => {
                setCreatedInvite(null);
                setInviteEmail("");
                setIsInviteOpen(true);
              }}
            />
          ) : undefined
        }
      />

      <Segmented aria-label="Settings sections" options={SETTINGS_TABS} value={tab} onChange={setTab} />

      {tab === "profile" && (
        <form onSubmit={handleSaveProfile} className="max-w-2xl rounded-3xl border border-border/60 bg-surface p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <Buildings size={18} className="text-primary" />
            <h2 className="font-heading text-sm font-bold text-foreground">Business & Space Details</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Workspace Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Business Type</label>
              <input
                type="text"
                placeholder="e.g. Retail, Agency, Services"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Contact Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Contact Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Business Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            />
          </div>

          <div className="flex justify-end">
            <AppButton type="submit" startContent={<Check size={16} />} label="Save Profile" isLoading={savingProfile} />
          </div>
        </form>
      )}

      {tab === "team" && (
        <div className="space-y-6">
          {/* Active Members */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                <Users size={18} className="text-primary" /> Active Members ({teamQuery.data?.members?.length ?? 0})
              </h2>
            </div>
            <div className="divide-y divide-border/30">
              {(teamQuery.data?.members ?? []).map((m) => {
                const scopedId = m.outlet_scope?.outlet_ids?.[0] ?? m.outlet_scope?.outlet_id ?? "";
                return (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <div>
                      <div className="font-semibold text-foreground">{m.display_name || `User #${m.user_id}`}</div>
                      <div className="text-muted">Joined {new Date(m.joined_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!m.is_owner && (outletsQuery.data?.length ?? 0) > 0 && (
                        <select
                          aria-label={`Outlet scope for ${m.display_name || m.user_id}`}
                          value={String(scopedId)}
                          onChange={(e) => handleOutletScopeChange(m.id, e.target.value)}
                          className="h-8 rounded-xl border border-border bg-background px-2 text-xs text-foreground"
                        >
                          <option value="">All outlets</option>
                          {(outletsQuery.data ?? []).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <StatusPill tone={m.is_owner ? "success" : "neutral"}>{m.role_name}</StatusPill>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Invitations */}
          {(teamQuery.data?.invitations?.length ?? 0) > 0 && (
            <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
              <h2 className="font-heading text-sm font-bold text-foreground">Pending Invitations</h2>
              <div className="divide-y divide-border/30">
                {(teamQuery.data?.invitations ?? []).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-3 text-xs">
                    <div>
                      <div className="font-semibold text-foreground">{inv.destination_normalized}</div>
                      <div className="text-muted">
                        Role: {inv.role_name} • Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <AppButton
                      size="sm"
                      variant="ghost"
                      startContent={<Trash size={14} />}
                      label="Revoke"
                      onPress={() => handleRevokeInvite(inv.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Role Permissions Matrix */}
          <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
            <h2 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" /> Role Permissions Matrix
            </h2>
            <p className="text-xs text-muted">
              Owners retain full wildcard access (`*`). Customize capabilities for non-owner roles below.
            </p>
            <div className="space-y-4">
              {(teamQuery.data?.roles ?? []).map((role) => (
                <div key={role.id} className="rounded-2xl border border-border/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{role.name} ({role.code})</span>
                    {role.code === "owner" ? <StatusPill tone="success">Full Access (*)</StatusPill> : null}
                  </div>
                  {role.code !== "owner" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PERMISSION_CATALOG.map((perm) => {
                        const checked = role.permissions.includes(perm.code);
                        return (
                          <label key={perm.code} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePermission(role.id, role.permissions, perm.code)}
                              className="rounded border-border text-primary"
                            />
                            <span>{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "sessions" && (
        <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4 max-w-2xl">
          <h2 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
            <Desktop size={18} className="text-primary" /> Signed-in Devices
          </h2>
          {sessionsQuery.isPending ? (
            <p className="text-xs text-muted">Loading sessions...</p>
          ) : (sessionsQuery.data?.length ?? 0) === 0 ? (
            <Alert status="info" description="No active device sessions reported." />
          ) : (
            <div className="divide-y divide-border/30">
              {(sessionsQuery.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <div className="font-semibold text-foreground">{s.device_label || "Browser Session"}</div>
                    <div className="text-muted">
                      Issued {new Date(s.issued_at).toLocaleString()} • Expires {new Date(s.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.current ? (
                      <StatusPill tone="success">Current device</StatusPill>
                    ) : (
                      <AppButton size="sm" variant="ghost" label="Revoke" onPress={() => handleRevokeSession(s.id)} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INVITE TEAM MEMBER DRAWER */}
      <FormDrawer
        isOpen={isInviteOpen}
        onOpenChange={(open) => !open && setIsInviteOpen(false)}
        title="Invite Team Member"
        description="Send an expiring workspace invite link by WhatsApp or email."
        submitLabel={createdInvite ? undefined : "Generate Invite Link"}
        isSubmitting={inviting}
        onSubmit={createdInvite ? undefined : handleSendInvite}
      >
        {!createdInvite ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Team Member Email</label>
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
              >
                {(teamQuery.data?.roles ?? []).filter((r) => r.code !== "owner").length > 0 ? (
                  (teamQuery.data?.roles ?? [])
                    .filter((r) => r.code !== "owner")
                    .map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))
                ) : (
                  <>
                    <option value="admin">Admin</option>
                    <option value="accountant">Accountant / Bookkeeper</option>
                    <option value="sales">Sales</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory_manager">Inventory Manager</option>
                    <option value="procurement">Procurement</option>
                    <option value="viewer">Viewer / Auditor</option>
                  </>
                )}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <Alert status="success" description={`Invitation created for ${inviteEmail} (${createdInvite.role_name}).`} />
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}${createdInvite.invite_url}` : createdInvite.invite_url}
                className="flex-1 h-10 rounded-xl bg-surface-secondary border border-border px-3 text-xs font-mono text-foreground"
              />
              <AppButton
                size="sm"
                startContent={<Copy size={15} />}
                label={copiedInvite ? "Copied!" : "Copy"}
                onPress={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${createdInvite.invite_url}`);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2000);
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `You have been invited to join our Rekordly workspace as ${createdInvite.role_name}: ${typeof window !== "undefined" ? window.location.origin : ""}${createdInvite.invite_url}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/10 text-[#25D366] font-bold text-xs border border-[#25D366]/20"
              >
                <WhatsappLogo size={18} weight="fill" /> Send via WhatsApp
              </a>
              <a
                href={`mailto:${inviteEmail}?subject=${encodeURIComponent("Invitation to join Rekordly workspace")}&body=${encodeURIComponent(
                  `You have been invited as ${createdInvite.role_name}.\n\nAccept the invitation here:\n${typeof window !== "undefined" ? window.location.origin : ""}${createdInvite.invite_url}`,
                )}`}
                className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-surface-secondary text-foreground font-semibold text-xs border border-border"
              >
                <Envelope size={18} weight="bold" /> Send via Email
              </a>
            </div>
            <AppButton
              variant="ghost"
              startContent={<Plus size={14} />}
              label="Invite another person"
              onPress={() => {
                setCreatedInvite(null);
                setInviteEmail("");
              }}
            />
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export default function SettingsPage() {
  return (
    <WorkspaceGate>{(workspace) => <SettingsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
