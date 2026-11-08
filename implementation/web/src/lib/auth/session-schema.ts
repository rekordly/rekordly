import { z } from "zod";

export const onboardingStatusSchema = z.enum([
  "identity_verified",
  "preferences_saved",
  "core_creating",
  "core_complete",
  "activated",
]);

const currentSessionSchema = z.object({
  id: z.number().int().positive(),
  kind: z.string().min(1),
  device_label: z.string().optional(),
  issued_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
});

export const authorizedWorkspaceSchema = z.object({
  id: z.number().int().positive(),
  kind: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  base_currency: z.string().min(3).max(3),
  timezone: z.string().min(1),
  is_owner: z.boolean(),
  role_code: z.string().min(1),
  role_name: z.string().min(1),
  outlet_scope: z.record(z.string(), z.unknown()),
  permissions: z.array(z.string()).optional(),
});

const onboardingStateSchema = z.object({
  flow_version: z.number().int().positive(),
  current_step: z.string().min(1),
  selected_roles: z.array(z.string()),
  space_choice: z.string().optional(),
  preferences: z.record(z.string(), z.unknown()),
  completed: z.boolean(),
});

export const currentUserSchema = z.object({
  id: z.number().int().positive(),
  display_name: z.string().optional(),
  locale: z.string().min(1),
  timezone: z.string().min(1),
  onboarding_status: onboardingStatusSchema,
  onboarding: onboardingStateSchema.optional(),
  session: currentSessionSchema,
  workspaces: z.array(authorizedWorkspaceSchema),
  permissions: z.array(z.string()).optional(),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;
export type AuthorizedWorkspace = z.infer<typeof authorizedWorkspaceSchema>;
