"use client";

import { ArrowRight, CheckCircle, EnvelopeSimple, Receipt, ShoppingBag, SignOut } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { StatusPill } from "@/components/ui/page";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import { orderLabel } from "@/lib/store-order-display";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed" || status === "paid" || status === "fulfilled") return "success";
  if (status === "cancelled" || status === "declined" || status === "paid_needs_attention") return "danger";
  if (status === "confirmed" || status === "request_received" || status === "needs_review") return "warning";
  return "neutral";
}

export function ShopperOrdersClient({ storeSlug, storeName }: { storeSlug?: string; storeName?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const rawLinkToken = searchParams.get("token")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSentMsg, setCodeSentMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const verifiedTokenRef = useRef("");

  const meQuery = useQuery({
    queryKey: ["shopper-me", storeSlug ?? "all"],
    queryFn: () => financeApi.getShopperMe(storeSlug),
    retry: false,
  });

  const isSignedIn = Boolean(meQuery.data);
  const ordersQuery = useQuery({
    queryKey: ["shopper-orders", storeSlug ?? "all"],
    queryFn: () => financeApi.listShopperOrders(storeSlug),
    enabled: isSignedIn,
  });

  const requestCodeMutation = useMutation({
    mutationFn: () => financeApi.requestShopperCode(email.trim(), storeSlug),
    onSuccess: (res) => {
      setErrorMsg("");
      setCodeSentMsg(res.message || "If you have orders, we've sent a code");
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (payload: { email?: string; code?: string; token?: string }) => financeApi.verifyShopperLogin(payload, storeSlug),
    onSuccess: async () => {
      setErrorMsg("");
      setCode("");
      await qc.invalidateQueries({ queryKey: ["shopper-me"] });
      await qc.invalidateQueries({ queryKey: ["shopper-orders"] });
      if (rawLinkToken) {
        router.replace(storeSlug ? `/s/${encodeURIComponent(storeSlug)}/orders` : "/orders");
      }
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "That code is invalid or has expired.");
      if (rawLinkToken) {
        router.replace(storeSlug ? `/s/${encodeURIComponent(storeSlug)}/orders` : "/orders");
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => financeApi.logoutShopper(storeSlug),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shopper-me"] });
      await qc.invalidateQueries({ queryKey: ["shopper-orders"] });
    },
  });

  useEffect(() => {
    if (!rawLinkToken || verifiedTokenRef.current === rawLinkToken) return;
    verifiedTokenRef.current = rawLinkToken;
    verifyMutation.mutate({ token: rawLinkToken });
  }, [rawLinkToken, verifyMutation]);

  const shopper = meQuery.data;
  const orders = ordersQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {storeName ? storeName : "Rekordly"}
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            {storeName ? "Track your order" : "My orders"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {shopper
              ? `Signed in as ${shopper.email}`
              : "Enter your checkout email to view your orders cleanly without a password."}
          </p>
        </div>
        {shopper ? (
          <AppButton
            size="sm"
            variant="secondary"
            startContent={<SignOut size={16} />}
            label={logoutMutation.isPending ? "Signing out..." : "Sign out"}
            isLoading={logoutMutation.isPending}
            onPress={() => logoutMutation.mutate()}
          />
        ) : null}
      </div>

      {meQuery.isPending ? (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-sm text-muted">
          Checking your session…
        </div>
      ) : !shopper ? (
        <section className="space-y-5 rounded-2xl border border-black/10 bg-white p-5 sm:p-7">
          {errorMsg ? (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">
              {errorMsg}
            </p>
          ) : null}

          {!codeSentMsg ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                requestCodeMutation.mutate();
              }}
            >
              <AppInput
                label="Email used at checkout"
                type="email"
                isRequired
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                startContent={<EnvelopeSimple size={16} />}
              />
              <AppButton
                type="submit"
                className="w-full sm:w-auto"
                label="Send sign-in code"
                isLoading={requestCodeMutation.isPending}
                isDisabled={!email.trim()}
              />
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                verifyMutation.mutate({ email: email.trim(), code: code.trim() });
              }}
            >
              <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800">
                <CheckCircle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{codeSentMsg}</p>
                  <p className="mt-0.5 text-xs opacity-80">Enter the 6-digit code sent to {email.trim()}, or click the sign-in link in the email.</p>
                </div>
              </div>
              <AppInput
                label="6-digit verification code"
                isRequired
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
              />
              <div className="flex flex-wrap items-center gap-2">
                <AppButton
                  type="submit"
                  label="Verify and view orders"
                  isLoading={verifyMutation.isPending}
                  isDisabled={code.length < 6}
                />
                <AppButton
                  variant="ghost"
                  label="Use a different email"
                  onPress={() => {
                    setCodeSentMsg("");
                    setCode("");
                    setErrorMsg("");
                  }}
                />
              </div>
            </form>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {storeSlug ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-xs text-muted">
              <span>Showing orders for {storeName || storeSlug}.</span>
              <Link href="/orders" className="font-medium text-primary hover:underline">
                View orders across all Rekordly stores
              </Link>
            </div>
          ) : null}

          {ordersQuery.isPending ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-sm text-muted">
              Loading your orders…
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center">
              <ShoppingBag size={36} weight="duotone" className="mx-auto text-muted" />
              <p className="mt-3 font-semibold">No orders found</p>
              <p className="mt-1 text-sm text-muted">Orders placed with {shopper.email} will show up here automatically.</p>
              {storeSlug ? (
                <Link href={`/s/${encodeURIComponent(storeSlug)}/shop`} className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">
                  Browse products
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="space-y-3">
              {orders.map((ord) => (
                <li key={`${ord.storefront_slug}-${ord.order_reference}`} className="rounded-2xl border border-black/10 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Receipt size={16} className="shrink-0 text-primary" />
                        <span className="font-semibold">{ord.order_reference}</span>
                        <span className="text-xs text-muted">· {ord.storefront_name}</span>
                      </div>
                      <p className="text-xs text-muted">Placed {formatDate(ord.created_at)}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <StatusPill tone={statusTone(ord.commercial_status)}>{orderLabel(ord.commercial_status)}</StatusPill>
                        <StatusPill tone={statusTone(ord.payment_status)}>{orderLabel(ord.payment_status)}</StatusPill>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <p className="text-base font-bold tabular-nums">
                        {formatMinorAmount(ord.total_minor, ord.currency, ord.currency_exponent)}
                      </p>
                      {ord.order_url ? (
                        <Link
                          href={ord.order_url}
                          className="inline-flex items-center gap-1.5 rounded-full border border-black/15 px-3.5 py-1.5 text-xs font-medium hover:bg-black/5"
                        >
                          <span>View order</span>
                          <ArrowRight size={14} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
