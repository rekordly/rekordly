"use client";

import {
  DownloadSimple,
  Envelope,
  Key,
  Lifebuoy,
  LockKey,
  ShieldCheck,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, SectionHeader, StatusPill } from "@/components/ui/page";
import { bp16Api, bp16Keys } from "@/lib/settings-privacy-support";
import { useActiveWorkspace } from "@/stores/workspace-store";

export function AccountSecurityPrivacyPanel() {
  const queryClient = useQueryClient();
  const scope = useActiveWorkspace();
  const activeWs = scope.active;

  const profileQuery = useQuery({ queryKey: bp16Keys.profile(), queryFn: bp16Api.getProfile });
  const contactsQuery = useQuery({ queryKey: bp16Keys.contacts(), queryFn: bp16Api.listContacts });
  const eventsQuery = useQuery({ queryKey: bp16Keys.securityEvents(), queryFn: bp16Api.listSecurityEvents });
  const privacyQuery = useQuery({ queryKey: bp16Keys.privacy(), queryFn: bp16Api.getPrivacyDashboard });
  const exportsQuery = useQuery({ queryKey: bp16Keys.exports(), queryFn: bp16Api.listExports });

  const [displayName, setDisplayName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [pendingContactId, setPendingContactId] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const stepUpMutation = useMutation({
    mutationFn: (purpose: string) => bp16Api.grantRecentAuth(purpose),
    onSuccess: () => toast.success("Recent authentication verified for 15 minutes"),
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Reauthentication failed"),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      bp16Api.updateProfile({
        expected_version: profileQuery.data?.version ?? 1,
        display_name: displayName || profileQuery.data?.display_name || "",
      }),
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: bp16Keys.profile() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Settings version conflict — reload and retry"),
  });

  const addContact = useMutation({
    mutationFn: () =>
      bp16Api.addContact({
        method_type: "email",
        value: contactValue,
        is_login: true,
        is_recovery: true,
      }),
    onSuccess: (res) => {
      setPendingContactId(res.contact_method.id);
      toast.success("Verification code sent to new destination");
      void queryClient.invalidateQueries({ queryKey: bp16Keys.contacts() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to add contact"),
  });

  const verifyContact = useMutation({
    mutationFn: () => bp16Api.verifyContact(pendingContactId!, verifyCode),
    onSuccess: () => {
      setPendingContactId(null);
      setVerifyCode("");
      toast.success("Contact verified");
      void queryClient.invalidateQueries({ queryKey: bp16Keys.contacts() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Invalid or expired verification code"),
  });

  const createExport = useMutation({
    mutationFn: () => bp16Api.createExport("account"),
    onSuccess: () => {
      toast.success("Ownership export created and reconciled");
      void queryClient.invalidateQueries({ queryKey: bp16Keys.exports() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Recent auth required for complete export"),
  });

  const previewDel = useMutation({
    mutationFn: () => bp16Api.previewDeletion("account"),
  });

  const requestDel = useMutation({
    mutationFn: () =>
      bp16Api.requestDeletion({
        scope: activeWs?.kind === "personal" ? "personal_workspace" : "account",
        workspace_id: activeWs?.kind === "personal" ? activeWs.id : undefined,
        reason: deleteReason,
        confirm_text: deleteConfirmText,
      }),
    onSuccess: (dc) => toast.success(`Deletion requested. 60-day grace deadline: ${new Date(dc.grace_deadline_at).toLocaleString()}`),
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Deletion request blocked"),
  });

  return (
    <div className="space-y-6">
      <DashboardCard>
        <SectionHeader
          title="Account Profile & Preferences"
          description={`Scope: Account · Version ${profileQuery.data?.version ?? 1}. Display-name updates never rewrite immutable historical snapshots.`}
        />
        {profileQuery.isPending ? <div className="mt-4 h-20 animate-pulse rounded-xl bg-default" /> : null}
        {profileQuery.data ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Display name
              <input
                type="text"
                defaultValue={profileQuery.data.display_name}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-xl border border-default bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <AppButton label="Save profile" isLoading={saveProfile.isPending} onPress={() => saveProfile.mutate()} />
          </div>
        ) : null}
      </DashboardCard>

      <DashboardCard>
        <SectionHeader
          title="Verified Login & Recovery Contacts"
          description="New destinations remain inactive until independently verified. Last login/recovery method cannot be removed."
          actions={
            <AppButton
              size="sm"
              variant="secondary"
              label="Verify recent auth"
              startContent={<Key />}
              isLoading={stepUpMutation.isPending}
              onPress={() => stepUpMutation.mutate("manage_contacts")}
            />
          }
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="new-email@example.com"
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            className="rounded-xl border border-default bg-background px-3 py-2 text-sm text-foreground"
          />
          <AppButton label="Add contact" startContent={<Envelope />} isLoading={addContact.isPending} onPress={() => addContact.mutate()} />
        </div>
        {pendingContactId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="6-digit OTP"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              className="rounded-xl border border-default bg-background px-3 py-2 text-sm text-foreground"
            />
            <AppButton label="Verify code" isLoading={verifyContact.isPending} onPress={() => verifyContact.mutate()} />
          </div>
        ) : null}
        {contactsQuery.data && contactsQuery.data.length > 0 ? (
          <ul className="mt-4 divide-y divide-default">
            {contactsQuery.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  {c.masked_value} ({c.method_type})
                </span>
                <div className="flex items-center gap-2">
                  <StatusPill tone={c.verified_at ? "success" : "warning"}>{c.verified_at ? "Verified" : "Pending"}</StatusPill>
                  {c.is_primary ? <StatusPill tone="accent">Primary</StatusPill> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </DashboardCard>

      <DashboardCard>
        <SectionHeader title="Security History" description="Recent authentication, contact, session, export, and deletion events." />
        {eventsQuery.data && eventsQuery.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No security events yet" description="Security actions will appear here." />
        ) : (
          <ul className="mt-3 divide-y divide-default">
            {(eventsQuery.data ?? []).slice(0, 10).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between py-2 text-xs">
                <span className="font-mono text-foreground">{ev.event_type}</span>
                <span className="text-muted">{new Date(ev.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard>
        <SectionHeader
          title="Privacy, Consents & Ownership Export"
          description="Downgrade or subscription expiry never removes read or export access. Complete exports require recent auth."
          actions={
            <div className="flex gap-2">
              <AppButton size="sm" variant="secondary" label="Reauthenticate export" onPress={() => stepUpMutation.mutate("complete_export")} />
              <AppButton
                size="sm"
                label="Request ownership export"
                startContent={<DownloadSimple />}
                isLoading={createExport.isPending}
                onPress={() => createExport.mutate()}
              />
            </div>
          }
        />
        {privacyQuery.data ? (
          <div className="mt-3 space-y-2 text-xs text-muted">
            <p>Privacy contact: {privacyQuery.data.privacy_contact} · Support hours: {privacyQuery.data.support_hours}</p>
            <p>Processors: {privacyQuery.data.processors.map((p) => p.name).join(", ")}</p>
          </div>
        ) : null}
        {(exportsQuery.data ?? []).length > 0 ? (
          <ul className="mt-4 divide-y divide-default">
            {exportsQuery.data!.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between py-2 text-xs">
                <span>
                  Export #{ex.id} ({ex.scope}) · {ex.reconciliation_status}
                </span>
                <StatusPill tone={ex.status === "ready" ? "success" : "warning"}>{ex.status}</StatusPill>
              </li>
            ))}
          </ul>
        ) : null}
      </DashboardCard>

      <DashboardCard>
        <SectionHeader
          title="Delete Account or Personal Workspace (60-Day Grace)"
          description="Subscription cancellation never starts deletion. Explicit deletion requires recent authentication and enters a 60-day recoverable grace period."
          actions={
            <div className="flex gap-2">
              <AppButton size="sm" variant="secondary" label="Reauthenticate deletion" startContent={<LockKey />} onPress={() => stepUpMutation.mutate("deletion_request")} />
              <AppButton size="sm" variant="ghost" label="Preview impact" isLoading={previewDel.isPending} onPress={() => previewDel.mutate()} />
            </div>
          }
        />
        {previewDel.data ? (
          <Alert
            status={previewDel.data.eligible ? "warning" : "error"}
            title={previewDel.data.eligible ? `Eligible (${previewDel.data.grace_days}-day grace)` : "Blockers must be resolved first"}
            description={previewDel.data.blockers?.join(" ") || `Proposed deadline: ${previewDel.data.proposed_deadline_utc}`}
          />
        ) : null}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input
            type="text"
            placeholder="Reason (optional)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className="rounded-xl border border-default bg-background px-3 py-2 text-sm text-foreground"
          />
          <input
            type="text"
            placeholder='Type "DELETE" to confirm'
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            className="rounded-xl border border-default bg-background px-3 py-2 text-sm text-foreground"
          />
          <AppButton
            variant="danger"
            label="Request deletion"
            startContent={<Trash />}
            isLoading={requestDel.isPending}
            onPress={() => requestDel.mutate()}
          />
        </div>
      </DashboardCard>
    </div>
  );
}

export function SupportWorkspacePanel() {
  const scope = useActiveWorkspace();
  const activeWs = scope.active;
  const queryClient = useQueryClient();
  const casesQuery = useQuery({ queryKey: bp16Keys.supportCases(), queryFn: bp16Api.listSupportCases });

  const [category, setCategory] = useState("general_question");
  const [severity, setSeverity] = useState("SEV-3");
  const [summary, setSummary] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [diagnosticConsent, setDiagnosticConsent] = useState(true);

  const submitCase = useMutation({
    mutationFn: () =>
      bp16Api.createSupportCase({
        workspace_id: activeWs?.id,
        category,
        severity,
        summary,
        affected_module: "general",
        reference_id: referenceId,
        diagnostic_consent: diagnosticConsent,
        preferred_channel: "in_app",
      }),
    onSuccess: () => {
      setSummary("");
      setReferenceId("");
      toast.success("Support case created");
      void queryClient.invalidateQueries({ queryKey: bp16Keys.supportCases() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Failed to submit support case"),
  });

  return (
    <div className="space-y-6">
      <Alert
        status="info"
        title="Security Notice — Support Hours: Mon–Fri 09:00–17:00 Africa/Lagos (WAT)"
        description="Rekordly support NEVER asks for OTPs, passwords, private keys, or full card numbers. No silent impersonation exists."
      />
      <DashboardCard>
        <SectionHeader
          title="Open Support Request"
          description={activeWs ? `Authorized workspace: ${activeWs.name} (${activeWs.kind})` : "Account-level support"}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-default bg-background px-3 py-2 text-sm">
            <option value="general_question">General question</option>
            <option value="posting_issue">Accounting / posting issue</option>
            <option value="export_deletion">Export or deletion</option>
            <option value="security_incident">Security incident</option>
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-xl border border-default bg-background px-3 py-2 text-sm">
            <option value="SEV-3">SEV-3 (Minor / question)</option>
            <option value="SEV-2">SEV-2 (Workflow blocked)</option>
            <option value="SEV-1">SEV-1 (Major failure)</option>
            <option value="SEV-0">SEV-0 (Security / data integrity)</option>
          </select>
          <input
            type="text"
            placeholder="Safe reference / error ID (optional)"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            className="rounded-xl border border-default bg-background px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={diagnosticConsent} onChange={(e) => setDiagnosticConsent(e.target.checked)} />
            Attach metadata-only diagnostic bundle (no amounts or secrets)
          </label>
        </div>
        <textarea
          rows={3}
          placeholder="Describe the issue without passwords, OTPs, or card numbers..."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="mt-3 w-full rounded-xl border border-default bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3">
          <AppButton label="Submit support request" startContent={<Lifebuoy />} isLoading={submitCase.isPending} onPress={() => submitCase.mutate()} />
        </div>
      </DashboardCard>

      <DashboardCard>
        <SectionHeader title="Your Support Cases" description="Support cases are separate from product review queues." />
        {casesQuery.isPending ? <div className="mt-4 h-20 animate-pulse rounded-xl bg-default" /> : null}
        {!casesQuery.isPending && (casesQuery.data ?? []).length === 0 ? (
          <EmptyState icon={WarningCircle} title="No support cases" description="Submitted support cases and status updates appear here." />
        ) : null}
        <ul className="mt-3 divide-y divide-default">
          {(casesQuery.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  #{c.id} · {c.category} ({c.severity})
                </p>
                <p className="text-xs text-muted">{c.summary}</p>
              </div>
              <StatusPill tone="neutral">{c.status}</StatusPill>
            </li>
          ))}
        </ul>
      </DashboardCard>
    </div>
  );
}
