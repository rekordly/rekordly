import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

import {
  AUTH_ENDPOINTS,
  createAuthApi,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
} from "../api/auth.ts";
import {
  ApiClientError,
  buildAuthRequestConfig,
  createApiAxiosInstance,
  RekordlyApiClient,
} from "../api/client.ts";
import {
  createSubmissionGuard,
  handleCreateFirstPasswordSubmit,
  handleEmailContinuationSubmit,
  handleForgotPasswordSubmit,
  handlePasswordSignInSubmit,
  handleResetPasswordCompleteSubmit,
} from "./controllers.ts";
import { getFormFieldAccessibilityIds } from "./accessibility.ts";
import {
  AUTH_ROUTES,
  ONBOARDING_ROUTES,
  PROTECTED_APP_ENTRY_ROUTE,
  resolvePostAuthDestination,
  sanitizeReturnToPath,
} from "./onboarding-routes.ts";
import { useAuthFlowStore } from "./state.ts";
import { currentUserSchema } from "./session-schema.ts";
import {
  createPasswordSchema,
  getUtf8ByteLength,
  resetPasswordSchema,
  validatePasswordUtf8Bytes,
} from "./validation.ts";

interface CapturedRequest {
  url: string | undefined;
  method: string | undefined;
  withCredentials: boolean | undefined;
  credentialsOption: string | undefined;
  headers: Record<string, string>;
  data: unknown;
}

function createMockClient(
  handler: (req: CapturedRequest, rawConfig: InternalAxiosRequestConfig) => {
    status: number;
    data: unknown;
    headers?: Record<string, string>;
  },
): {
  client: RekordlyApiClient;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];

  const adapter: AxiosAdapter = async (config) => {
    const rawHeaders = (config.headers ?? {}) as Record<string, unknown>;
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawHeaders)) {
      if (typeof val === "string") {
        normalizedHeaders[key] = val;
      }
    }

    const parsedBody =
      typeof config.data === "string" ? JSON.parse(config.data) : config.data;

    const captured: CapturedRequest = {
      url: config.url,
      method: config.method,
      withCredentials: config.withCredentials,
      credentialsOption: (
        config.fetchOptions as { credentials?: string } | undefined
      )?.credentials,
      headers: normalizedHeaders,
      data: parsedBody,
    };
    requests.push(captured);

    const result = handler(captured, config);
    if (result.status >= 400) {
      throw new axios.AxiosError(
        `Request failed with status code ${result.status}`,
        "ERR_BAD_REQUEST",
        config,
        {},
        {
          data: result.data,
          status: result.status,
          statusText: "Error",
          headers: result.headers ?? {},
          config,
        },
      );
    }

    return {
      data: result.data,
      status: result.status,
      statusText: "OK",
      headers: result.headers ?? {},
      config,
    };
  };

  const instance = createApiAxiosInstance("http://localhost:8080");
  instance.defaults.adapter = adapter;
  return {
    client: new RekordlyApiClient(instance),
    requests,
  };
}

describe("Rekordly V2 Password Authentication Frontend Suite", () => {
  beforeEach(() => {
    useAuthFlowStore.getState().resetAuthFlow();
  });

  it("1. Email-first page renders with Rekordly branding and HeroUI v3 wrapper structure", () => {
    const authCardSource = readFileSync(
      join(process.cwd(), "src/components/ui/auth-card.tsx"),
      "utf8",
    );
    const emailEntrySource = readFileSync(
      join(process.cwd(), "src/components/auth/email-entry-screen.tsx"),
      "utf8",
    );

    assert.match(authCardSource, /\/rekordly-logo\.svg/);
    assert.match(authCardSource, /alt="Rekordly"/);
    assert.match(emailEntrySource, /title="Welcome"/);
    assert.match(emailEntrySource, /Continue with email/);
    // Confirm feature component imports Rekordly UI wrappers rather than @heroui/react directly
    assert.doesNotMatch(emailEntrySource, /from "@heroui\/react"/);
  });

  it("2. Email continuation routes to password when continuation is 'password'", async () => {
    const { client, requests } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          continuation: "password",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleEmailContinuationSubmit(
      { email: "  Founder@Rekordly.com " },
      api,
    );

    assert.equal(outcome.continuation, "password");
    assert.equal(outcome.email, "founder@rekordly.com");
    assert.equal(outcome.nextRoute, AUTH_ROUTES.LOGIN_PASSWORD);
    assert.equal(useAuthFlowStore.getState().email, "founder@rekordly.com");
    assert.equal(useAuthFlowStore.getState().continuation, "password");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.EMAIL_CONTINUE);
  });

  it("3. Email continuation shows registration/verification state when continuation is 'registration'", async () => {
    const { client } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          continuation: "registration",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleEmailContinuationSubmit(
      { email: "newmerchant@rekordly.com" },
      api,
    );

    assert.equal(outcome.continuation, "registration");
    assert.equal(outcome.email, "newmerchant@rekordly.com");
    assert.equal(outcome.nextRoute, null);
    assert.equal(useAuthFlowStore.getState().continuation, "registration");

    const emailEntrySource = readFileSync(
      join(process.cwd(), "src/components/auth/email-entry-screen.tsx"),
      "utf8",
    );
    assert.match(emailEntrySource, /title="Verify your email"/);
    assert.match(emailEntrySource, /Change email/);
  });

  it("4. Successful password sign-in routes according to onboarding_status", async () => {
    const statuses = [
      {
        status: "identity_verified" as const,
        expected: ONBOARDING_ROUTES.IDENTITY_VERIFIED,
      },
      {
        status: "preferences_saved" as const,
        expected: ONBOARDING_ROUTES.PREFERENCES_SAVED,
      },
      {
        status: "core_creating" as const,
        expected: ONBOARDING_ROUTES.CORE_CREATING,
      },
      {
        status: "core_complete" as const,
        expected: PROTECTED_APP_ENTRY_ROUTE,
      },
      {
        status: "activated" as const,
        expected: PROTECTED_APP_ENTRY_ROUTE,
      },
    ];

    for (const item of statuses) {
      const { client } = createMockClient(() => ({
        status: 200,
        data: {
          data: {
            user_id: 42,
            onboarding_status: item.status,
            expires_at: "2026-11-08T00:00:00Z",
          },
        },
      }));
      const api = createAuthApi(client);

      const outcome = await handlePasswordSignInSubmit(
        {
          email: "owner@rekordly.com",
          password: "correct-horse-battery-staple",
        },
        { api },
      );

      assert.equal(outcome.session.user_id, 42);
      assert.equal(outcome.destination, item.expected);
    }

    // Also verify external return_to is rejected while allowlisted internal return_to is honored after onboarding completion
    assert.equal(sanitizeReturnToPath("https://evil.example/phish"), null);
    assert.equal(sanitizeReturnToPath("//evil.example/phish"), null);
    assert.equal(
      resolvePostAuthDestination("activated", "https://evil.example"),
      PROTECTED_APP_ENTRY_ROUTE,
    );
    assert.equal(
      resolvePostAuthDestination("activated", "/invoices/123"),
      "/invoices/123",
    );
  });

  it("5. Neutral invalid-credential error never leaks account existence", async () => {
    const { client } = createMockClient(() => ({
      status: 401,
      data: {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "No account found with this email address.",
        },
      },
    }));
    const api = createAuthApi(client);

    await assert.rejects(
      () =>
        handlePasswordSignInSubmit(
          {
            email: "unknown@rekordly.com",
            password: "wrong-password-123",
          },
          { api },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "INVALID_CREDENTIALS");
        assert.equal(err.message, "Email or password is incorrect.");
        assert.ok(!err.message.toLowerCase().includes("no account"));
        return true;
      },
    );
  });

  it("6. Rate-limited sign-in surfaces RATE_LIMITED with Retry-After metadata", async () => {
    const { client } = createMockClient(() => ({
      status: 429,
      headers: {
        "retry-after": "900",
      },
      data: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many attempts. Please try again later.",
        },
      },
    }));
    const api = createAuthApi(client);

    await assert.rejects(
      () =>
        handlePasswordSignInSubmit(
          {
            email: "owner@rekordly.com",
            password: "wrong-password-123",
          },
          { api },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "RATE_LIMITED");
        assert.equal(err.status, 429);
        assert.equal(err.retryAfterSeconds, 900);
        assert.match(err.message, /Too many attempts/i);
        return true;
      },
    );
  });

  it("7. Neutral reset-request result always shows exact required message on 202", async () => {
    const { client, requests } = createMockClient(() => ({
      status: 202,
      data: {
        data: {
          message: "Custom backend text that should still normalize to standard neutral copy",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleForgotPasswordSubmit(
      { email: "anyone@example.com" },
      api,
    );

    assert.equal(
      outcome.message,
      "If the account is eligible, password reset instructions will be sent.",
    );
    assert.equal(outcome.message, NEUTRAL_PASSWORD_RESET_MESSAGE);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.PASSWORD_RESET_REQUEST);
  });

  it("8. Reset completion handles invalid/expired proof and scrubs token on success", async () => {
    const { client: failingClient } = createMockClient(() => ({
      status: 401,
      data: {
        error: {
          code: "INVALID_PROOF",
          message: "The verification proof is invalid or expired.",
        },
      },
    }));
    const failingApi = createAuthApi(failingClient);

    await assert.rejects(
      () =>
        handleResetPasswordCompleteSubmit(
          "expired-reset-token-abc",
          {
            password: "new-valid-password-123",
            confirmPassword: "new-valid-password-123",
          },
          { api: failingApi },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "INVALID_PROOF");
        assert.match(err.message, /invalid, expired, or has already been used/i);
        assert.ok(!err.message.includes("expired-reset-token-abc"));
        return true;
      },
    );

    let tokenScrubbed = false;
    const { client: okClient } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          user_id: 99,
          onboarding_status: "activated",
          expires_at: "2026-11-08T00:00:00Z",
        },
      },
    }));
    const okApi = createAuthApi(okClient);

    const outcome = await handleResetPasswordCompleteSubmit(
      "valid-single-use-reset-token",
      {
        password: "new-valid-password-123",
        confirmPassword: "new-valid-password-123",
      },
      {
        api: okApi,
        onTokenConsumed: () => {
          tokenScrubbed = true;
        },
      },
    );

    assert.equal(tokenScrubbed, true);
    assert.equal(outcome.destination, PROTECTED_APP_ENTRY_ROUTE);
  });

  it("9. First-password creation sends X-Preauth-Token header and clears in-memory proof", async () => {
    useAuthFlowStore.getState().setPreAuthToken("preauth-secret-token-xyz");

    const { client, requests } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          user_id: 77,
          onboarding_status: "identity_verified",
          expires_at: "2026-11-08T00:00:00Z",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleCreateFirstPasswordSubmit(
      useAuthFlowStore.getState().preAuthToken,
      {
        password: "my-strong-first-password",
        confirmPassword: "my-strong-first-password",
      },
      { api },
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.PASSWORD_CREATE);
    assert.equal(
      requests[0]?.headers["X-Preauth-Token"],
      "preauth-secret-token-xyz",
    );
    assert.equal(useAuthFlowStore.getState().preAuthToken, null);
    assert.equal(outcome.destination, ONBOARDING_ROUTES.IDENTITY_VERIFIED);
  });

  it("10. Lost pre-auth proof rejects safely and triggers restart-verification state", async () => {
    await assert.rejects(
      () =>
        handleCreateFirstPasswordSubmit(null, {
          password: "my-strong-first-password",
          confirmPassword: "my-strong-first-password",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "INVALID_PROOF");
        assert.match(err.message, /restart verification/i);
        return true;
      },
    );

    const createPasswordSource = readFileSync(
      join(process.cwd(), "src/components/auth/create-password-screen.tsx"),
      "utf8",
    );
    assert.match(createPasswordSource, /title="Restart verification"/);
    assert.match(createPasswordSource, /create-password-restart-state/);
  });

  it("11. Duplicate submission prevention blocks concurrent execution", async () => {
    const guard = createSubmissionGuard();
    let callCount = 0;

    let resolveFirst!: () => void;
    const firstPromise = guard.run(
      () =>
        new Promise<string>((resolve) => {
          callCount += 1;
          resolveFirst = () => resolve("completed");
        }),
    );

    assert.equal(guard.isSubmitting(), true);

    const duplicateAttempt = await guard.run(async () => {
      callCount += 1;
      return "duplicate";
    });

    assert.equal(duplicateAttempt, undefined);
    assert.equal(callCount, 1);

    resolveFirst();
    const firstResult = await firstPromise;
    assert.equal(firstResult, "completed");
    assert.equal(guard.isSubmitting(), false);
  });

  it("12. UTF-8 byte-length password validation uses TextEncoder().encode(password).length (10..1024 bytes)", () => {
    // 9 ASCII bytes -> invalid (< 10 bytes)
    const nineAscii = "123456789";
    assert.equal(getUtf8ByteLength(nineAscii), 9);
    assert.equal(validatePasswordUtf8Bytes(nineAscii).valid, false);

    // 10 ASCII bytes -> valid (== 10 bytes)
    const tenAscii = "1234567890";
    assert.equal(getUtf8ByteLength(tenAscii), 10);
    assert.equal(validatePasswordUtf8Bytes(tenAscii).valid, true);

    // Multi-byte UTF-8 test: 3 emojis = 6 UTF-16 code units (.length === 6) but 12 UTF-8 bytes!
    // proves TextEncoder().encode(password).length is used rather than string .length
    const threeEmojis = "🔒🔑🛡️";
    assert.ok(threeEmojis.length < 10);
    assert.ok(getUtf8ByteLength(threeEmojis) >= 10);
    assert.equal(validatePasswordUtf8Bytes(threeEmojis).valid, true);
    assert.equal(
      createPasswordSchema.safeParse({
        password: threeEmojis,
        confirmPassword: threeEmojis,
      }).success,
      true,
    );

    // 1024 bytes -> valid
    const maxValid = "a".repeat(1024);
    assert.equal(getUtf8ByteLength(maxValid), 1024);
    assert.equal(validatePasswordUtf8Bytes(maxValid).valid, true);

    // 1025 bytes -> invalid (> 1024 bytes)
    const tooLong = "a".repeat(1025);
    assert.equal(getUtf8ByteLength(tooLong), 1025);
    assert.equal(validatePasswordUtf8Bytes(tooLong).valid, false);
    assert.equal(
      resetPasswordSchema.safeParse({
        password: tooLong,
        confirmPassword: tooLong,
      }).success,
      false,
    );

    // No arbitrary uppercase/symbol/number requirement: lowercase-only 12-byte passphrase is valid
    const lowercasePassphrase = "gentle green river";
    assert.equal(
      createPasswordSchema.safeParse({
        password: lowercasePassphrase,
        confirmPassword: lowercasePassphrase,
      }).success,
      true,
    );
  });

  it("13. API requests always include credentials (withCredentials: true and credentials: 'include')", async () => {
    const config = buildAuthRequestConfig();
    assert.equal(config.withCredentials, true);
    assert.equal(
      (config.fetchOptions as { credentials?: string } | undefined)?.credentials,
      "include",
    );

    const { client, requests } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          user_id: 1,
          onboarding_status: "activated",
          expires_at: "2026-11-08T00:00:00Z",
        },
      },
    }));
    const api = createAuthApi(client);

    await api.signInWithPassword({
      email: "user@rekordly.com",
      password: "valid-password-10",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.withCredentials, true);
    assert.equal(requests[0]?.credentialsOption, "include");
  });

  it("14. Passwords and proof tokens never appear in visible errors", async () => {
    const secretPassword = "MySuperSecretPassword!2026";
    const secretResetToken = "reset-token-secret-998877";
    const secretPreAuthToken = "preauth-token-secret-112233";

    const { client } = createMockClient(() => ({
      status: 422,
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message: `Rejected input ${secretPassword} and token ${secretResetToken} and ${secretPreAuthToken}`,
        },
      },
    }));
    const api = createAuthApi(client);

    await assert.rejects(
      () =>
        handleResetPasswordCompleteSubmit(
          secretResetToken,
          {
            password: secretPassword,
            confirmPassword: secretPassword,
          },
          { api },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.ok(!err.message.includes(secretPassword));
        assert.ok(!err.message.includes(secretResetToken));
        return true;
      },
    );

    await assert.rejects(
      () =>
        handleCreateFirstPasswordSubmit(
          secretPreAuthToken,
          {
            password: secretPassword,
            confirmPassword: secretPassword,
          },
          { api },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.ok(!err.message.includes(secretPassword));
        assert.ok(!err.message.includes(secretPreAuthToken));
        return true;
      },
    );
  });

  it("15. Mobile authentication layout uses single-column responsive flow without overflow", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "src/app/(auth)/layout.tsx"),
      "utf8",
    );
    const authCardSource = readFileSync(
      join(process.cwd(), "src/components/ui/auth-card.tsx"),
      "utf8",
    );

    // Desktop illustration is hidden on mobile (`hidden ... md:flex`)
    assert.match(layoutSource, /hidden[\s\S]*md:flex/);
    // Form container is full-width on mobile and receives a desktop-only width;
    // the exact desktop ratio is a visual decision, not a mobile behavior contract.
    assert.match(layoutSource, /overflow-x-hidden/);
    assert.match(layoutSource, /w-full[\s\S]*md:w-(?:\d+\/\d+|\[[^\]]+\])/);
    // Logo remains visible in AuthCard header across all viewports
    assert.match(authCardSource, /\/rekordly-logo\.svg/);
  });

  it("16. Keyboard submission is wired via native <form onSubmit> and type='submit' buttons", () => {
    const screens = [
      "src/components/auth/email-entry-screen.tsx",
      "src/components/auth/password-sign-in-screen.tsx",
      "src/components/auth/forgot-password-screen.tsx",
      "src/components/auth/reset-password-screen.tsx",
      "src/components/auth/create-password-screen.tsx",
    ];

    for (const screenPath of screens) {
      const source = readFileSync(join(process.cwd(), screenPath), "utf8");
      assert.match(source, /<form[\s\S]*form\.handleSubmit\(onSubmit\)/);
      assert.match(source, /type="submit"/);
    }
  });

  it("17. Wrapper components preserve accessible labels, descriptions, and field-associated errors", () => {
    const ids = getFormFieldAccessibilityIds("signin-password", {
      hasDescription: true,
      hasError: true,
    });
    assert.equal(ids.labelId, "signin-password-label");
    assert.equal(ids.descriptionId, "signin-password-description");
    assert.equal(ids.errorId, "signin-password-error");
    assert.equal(
      ids.ariaDescribedBy,
      "signin-password-description signin-password-error",
    );

    const textFieldSource = readFileSync(
      join(process.cwd(), "src/components/ui/text-field.tsx"),
      "utf8",
    );
    const passwordFieldSource = readFileSync(
      join(process.cwd(), "src/components/ui/password-field.tsx"),
      "utf8",
    );
    const formFieldSource = readFileSync(
      join(process.cwd(), "src/components/ui/form-field.tsx"),
      "utf8",
    );

    assert.match(textFieldSource, /aria-labelledby=\{labelId\}/);
    assert.match(textFieldSource, /aria-describedby=\{ariaDescribedBy\}/);
    assert.match(textFieldSource, /aria-invalid=\{hasError \|\| undefined\}/);
    assert.match(formFieldSource, /htmlFor=\{id\}/);
    assert.match(formFieldSource, /role="alert"/);
    assert.match(
      passwordFieldSource,
      /aria-label=\{isVisible \? "Hide password" : "Show password"\}/,
    );
  });

  it("18. Session responses are validated at the API boundary", () => {
    const valid = currentUserSchema.safeParse({
      id: 1,
      display_name: "Founder",
      locale: "en-NG",
      timezone: "Africa/Lagos",
      onboarding_status: "activated",
      session: {
        id: 2,
        kind: "full",
        issued_at: "2026-11-08T08:00:00Z",
        expires_at: "2026-11-15T08:00:00Z",
      },
      workspaces: [],
    });
    assert.equal(valid.success, true);
    assert.equal(currentUserSchema.safeParse({ id: "1" }).success, false);
  });

  it("19. Protected routes preserve a safe return destination", () => {
    const guardSource = readFileSync(
      join(process.cwd(), "src/components/auth/route-guards.tsx"),
      "utf8",
    );
    assert.match(guardSource, /return_to=\$\{encodeURIComponent\(returnTo\)\}/);
    assert.match(guardSource, /router\.replace/);
    assert.equal(sanitizeReturnToPath("/dashboard?view=business"), "/dashboard?view=business");
    assert.equal(sanitizeReturnToPath("https://evil.example/dashboard"), null);
  });

  it("20. Guest routes and permission failures have explicit destinations", () => {
    const guardSource = readFileSync(
      join(process.cwd(), "src/components/auth/route-guards.tsx"),
      "utf8",
    );
    const permissionSource = readFileSync(
      join(process.cwd(), "src/components/auth/permission.tsx"),
      "utf8",
    );
    assert.match(guardSource, /resolvePostAuthDestination/);
    assert.match(permissionSource, /Permission required/);
    assert.match(permissionSource, /403/);
  });

  it("21. Unknown routes have a dedicated 404 page", () => {
    const notFoundSource = readFileSync(
      join(process.cwd(), "src/app/not-found.tsx"),
      "utf8",
    );
    assert.match(notFoundSource, /Page not found/);
    assert.match(notFoundSource, /404/);
  });
});
