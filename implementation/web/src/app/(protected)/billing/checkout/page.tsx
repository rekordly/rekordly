"use client";

import { CreditCard } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { billingApi } from "@/lib/billing";
import { formatMinorAmount } from "@/lib/money";

function CheckoutVerifyInner() {
  const searchParams = useSearchParams();
  const intentId = Number(searchParams.get("intentId") ?? "0");

  const intentQ = useQuery({
    queryKey: ["bp13", "checkout-intent", intentId],
    queryFn: () => billingApi.verifyCheckoutIntent(intentId),
    enabled: intentId > 0,
  });

  const modeQ = useQuery({
    queryKey: ["bp13", "commercial-mode"],
    queryFn: () => billingApi.getCommercialMode(),
  });

  return (
    <Page>
      <PageHeader
        title="Checkout Verification"
        description="Subscription access activates only after server-side Paystack verification or webhook evidence."
        actions={
          <Link href="/billing">
            <AppButton variant="tertiary" label="Back to billing" />
          </Link>
        }
      />

      {modeQ.data && !modeQ.data.checkout_enabled ? (
        <Alert
          status="info"
          title="Controlled Beta Mode"
          description="Paid checkout is disabled in controlled_beta mode. No charge has been made."
        />
      ) : null}

      {intentId <= 0 ? (
        <Alert status="info" title="No checkout intent selected" description="Select a plan from /plans when paid mode is enabled." />
      ) : intentQ.isPending ? (
        <Alert status="info" title="Verifying payment..." description="Checking authoritative transaction status with server." />
      ) : intentQ.isError ? (
        <Alert status="warning" title="Payment confirmation pending" description="We could not verify the payment yet. Do not retry payment blindly; check /billing/transactions." />
      ) : intentQ.data ? (
        <div className="rounded-xl border p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-medium">
              <CreditCard size={18} />
              Reference: <span className="font-mono">{intentQ.data.reference}</span>
            </span>
            <StatusPill tone={intentQ.data.status === "verified" ? "success" : "warning"}>{intentQ.data.status}</StatusPill>
          </div>
          <p>Amount: {formatMinorAmount(intentQ.data.amount_minor, intentQ.data.currency, 2)}</p>
        </div>
      ) : null}
    </Page>
  );
}

export default function BillingCheckoutPage() {
  return (
    <Suspense fallback={<Page><PageHeader title="Checkout Verification" description="Loading..." /></Page>}>
      <CheckoutVerifyInner />
    </Suspense>
  );
}
