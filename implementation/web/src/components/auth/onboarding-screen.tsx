"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Storefront, UserCircle } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { onboardingApi, type OnboardingRole, type SpaceChoice } from "@/lib/auth";
import { sessionQueryKey } from "@/components/providers/session-provider";
import { useAuthStore } from "@/stores/auth-store";
import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { DashboardCard } from "@/components/ui/dashboard-card";

const roleOptions: { value: OnboardingRole; label: string; description: string }[] = [
  { value: "personal", label: "Personal finance", description: "Track income, spending, and everyday money." },
  { value: "freelancer", label: "Freelancer", description: "Keep client income and expenses clear." },
  { value: "small_business", label: "Small business", description: "Manage sales, purchases, and business records." },
  { value: "general_business", label: "Growing business", description: "Set up a fuller workspace for your team." },
];

function StepHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{step}</p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function OnboardingScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [roles, setRoles] = useState<OnboardingRole[]>(
    (user?.onboarding?.selected_roles ?? []) as OnboardingRole[],
  );
  const [spaceChoice, setSpaceChoice] = useState<SpaceChoice>(
    (user?.onboarding?.space_choice as SpaceChoice | undefined) ?? "all",
  );
  const [error, setError] = useState<string | null>(null);
  const [personalName, setPersonalName] = useState("Personal finance");
  const [businessName, setBusinessName] = useState("");

  const isUseCase = pathname.endsWith("/use-case");
  const wantsPersonal = spaceChoice === "personal" || spaceChoice === "all";
  const wantsBusiness = spaceChoice === "business" || spaceChoice === "all";

  const preferenceMutation = useMutation({
    mutationFn: () => onboardingApi.savePreferences({ flow_version: 1, selected_roles: roles, space_choice: spaceChoice, preferences: {} }),
    onSuccess: () => router.push("/onboarding/spaces"),
    onError: (mutationError: Error) => setError(mutationError.message),
  });
  const workspaceMutation = useMutation({
    mutationFn: () => onboardingApi.createInitialWorkspaces({
      space_choice: spaceChoice,
      personal: wantsPersonal ? { name: personalName.trim(), base_currency: "NGN", timezone: "Africa/Lagos" } : undefined,
      business: wantsBusiness ? { name: businessName.trim(), base_currency: "NGN", timezone: "Africa/Lagos", business_type: "small_business", country: "NG" } : undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      router.replace("/dashboard");
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const canContinue = useMemo(() => roles.length > 0 && Boolean(spaceChoice), [roles.length, spaceChoice]);
  if (isUseCase) {
    return (
      <div className="mx-auto max-w-3xl py-10 sm:py-16">
        <StepHeader step="01 / 02" title="What are you keeping track of?" description="Choose every option that fits. You can add or change workspaces later." />
        {error ? <Alert status="error" description={error} className="mb-5" /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {roleOptions.map((option) => {
            const selected = roles.includes(option.value);
            return (
              <button key={option.value} type="button" onClick={() => setRoles((current) => selected ? current.filter((item) => item !== option.value) : [...current, option.value])} className={`rounded-2xl border p-5 text-left transition-colors ${selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary/50"}`}>
                <div className="flex items-start justify-between gap-4"><span className="font-semibold">{option.label}</span><span className={`flex size-6 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected ? <Check size={15} weight="bold" /> : null}</span></div>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-8"><p className="mb-3 text-sm font-semibold">Which spaces should we create?</p><div className="grid gap-3 sm:grid-cols-3">{(["personal", "business", "all"] as SpaceChoice[]).map((choice) => <button key={choice} type="button" onClick={() => setSpaceChoice(choice)} className={`rounded-2xl border px-4 py-4 text-left text-sm font-medium capitalize ${spaceChoice === choice ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface"}`}>{choice === "all" ? "Personal + business" : choice}</button>)}</div></div>
        <div className="mt-8 flex justify-end"><AppButton size="lg" endContent={<ArrowRight />} isDisabled={!canContinue || preferenceMutation.isPending} onPress={() => preferenceMutation.mutate()}>Continue</AppButton></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-16">
      <StepHeader step="02 / 02" title="Name your spaces" description="These names appear in your workspace switcher. You can edit them later." />
      {error ? <Alert status="error" description={error} className="mb-5" /> : null}
      <DashboardCard className="gap-5">
        {wantsPersonal ? <AppInput label="Personal space" value={personalName} onChange={(event) => setPersonalName(event.target.value)} placeholder="Personal finance" startContent={<UserCircle />} /> : null}
        {wantsBusiness ? <AppInput label="Business name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business name" startContent={<Storefront />} isRequired /> : null}
      </DashboardCard>
      <div className="mt-8 flex items-center justify-between"><AppButton variant="ghost" onPress={() => router.back()}>Back</AppButton><AppButton size="lg" endContent={<ArrowRight />} isDisabled={(wantsPersonal && personalName.trim().length < 2) || (wantsBusiness && businessName.trim().length < 2) || workspaceMutation.isPending} onPress={() => workspaceMutation.mutate()}>Create spaces</AppButton></div>
    </div>
  );
}
