import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

import {
  AUTH_ENDPOINTS,
  createAuthApi,
  NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE,
  NEUTRAL_OTP_REQUEST_MESSAGE,
  NEUTRAL_PASSWORD_RESET_MESSAGE,
} from "../api/auth.ts";
import {
  ApiClientError,
  buildAuthRequestConfig,
  createApiAxiosInstance,
  RekordlyApiClient,
} from "../api/client.ts";
import { getFormFieldAccessibilityIds } from "./accessibility.ts";
import {
  createSubmissionGuard,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
  handleCreateFirstPasswordSubmit,
  handleEmailContinuationSubmit,
  handleForgotPasswordSubmit,
  handleMagicLinkConfirmSubmit,
  handleMagicLinkInspect,
  handleMagicLinkRequestSubmit,
  handleOtpRequestSubmit,
  handleOtpVerifySubmit,
  handlePasswordSignInSubmit,
  handleResetPasswordCompleteSubmit,
} from "./controllers.ts";
import {
  AUTH_ROUTES,
  ONBOARDING_ROUTES,
  PROTECTED_APP_ENTRY_ROUTE,
  resolvePostAuthDestination,
  sanitizeReturnToPath,
} from "./onboarding-routes.ts";
import { maskEmailAddress, useAuthFlowStore } from "./state.ts";
import {
  applyOtpSlotInput,
  createPasswordSchema,
  getUtf8ByteLength,
  normalizeOtpInput,
  otpVerifySchema,
  resetPasswordSchema,
  splitOtpIntoSlots,
  validatePasswordUtf8Bytes,
} from "./validation.ts";

interface CapturedRequest {
  url: string | undefined;
  method: string | undefined;
  withCredentials: boolean | undefined;
  credentialsOption: string | undefined;
  headers: Record<string, string>;
  params: Record<string, string | undefined>;
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

    const rawParams = (config.params ?? {}) as Record<string, unknown>;
    const normalizedParams: Record<string, string | undefined> = {};
    for (const [key, val] of Object.entries(rawParams)) {
      if (typeof val === "string" || val === undefined) {
        normalizedParams[key] = val;
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
      params: normalizedParams,
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

describe("Rekordly V2 Authentication Frontend Functional Suite", () => {
  beforeEach(() => {
    useAuthFlowStore.getState().resetAuthFlow();
  });

  it("1. Email continuation routes to password when continuation is 'password'", async () => {
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

  it("2. Email continuation sets registration OTP context when continuation is 'registration'", async () => {
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
    assert.equal(useAuthFlowStore.getState().otpPurpose, "registration");
  });

  it("3. OTP six-digit keyboard entry and paste normalization populate slots cleanly", () => {
    assert.equal(normalizeOtpInput(" 483-921 "), "483921");
    assert.equal(normalizeOtpInput("12ab34cd56ef78"), "123456");

    const empty = splitOtpIntoSlots("");
    assert.deepEqual(empty, ["", "", "", "", "", ""]);

    // Single-digit entry advances focus to next slot
    const step1 = applyOtpSlotInput(empty, 0, "4");
    assert.deepEqual(step1.slots, ["4", "", "", "", "", ""]);
    assert.equal(step1.code, "4");
    assert.equal(step1.nextFocusIndex, 1);

    // Full 6-digit paste fills all slots from index 0 and focuses final slot
    const pasted = applyOtpSlotInput(step1.slots, 2, "483-921");
    assert.deepEqual(pasted.slots, ["4", "8", "3", "9", "2", "1"]);
    assert.equal(pasted.code, "483921");
    assert.equal(pasted.nextFocusIndex, 5);

    // Partial paste from slot 2 fills remaining slots
    const partial = applyOtpSlotInput(["1", "2", "", "", "", ""], 2, "345");
    assert.deepEqual(partial.slots, ["1", "2", "3", "4", "5", ""]);
    assert.equal(partial.code, "12345");
    assert.equal(partial.nextFocusIndex, 5);

    // Schema validation accepts 6 digits and rejects incomplete or non-numeric codes
    assert.equal(
      otpVerifySchema.safeParse({
        email: "user@rekordly.com",
        purpose: "registration",
        code: "483921",
      }).success,
      true,
    );
    assert.equal(
      otpVerifySchema.safeParse({
        email: "user@rekordly.com",
        purpose: "registration",
        code: "48392",
      }).success,
      false,
    );
  });

  it("4. OTP request and resend advance generation and return neutral message with cooldown", async () => {
    const { client, requests } = createMockClient(() => ({
      status: 202,
      data: {
        data: {
          message: "If the request is eligible, a verification code will be sent.",
        },
      },
    }));
    const api = createAuthApi(client);

    const first = await handleOtpRequestSubmit(
      { email: "Merchant@Rekordly.com", purpose: "registration" },
      api,
    );
    assert.equal(first.email, "merchant@rekordly.com");
    assert.equal(first.purpose, "registration");
    assert.equal(first.generation, 1);
    assert.equal(first.cooldownSeconds, DEFAULT_RESEND_COOLDOWN_SECONDS);
    assert.equal(first.message, NEUTRAL_OTP_REQUEST_MESSAGE);

    const second = await handleOtpRequestSubmit(
      { email: "merchant@rekordly.com", purpose: "registration" },
      api,
    );
    assert.equal(second.generation, 2);
    assert.equal(useAuthFlowStore.getState().otpGeneration, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.OTP_REQUEST);
    assert.deepEqual(requests[0]?.data, {
      email: "merchant@rekordly.com",
      purpose: "registration",
    });
  });

  it("5. Registration OTP verification stores pre-auth token in memory and routes to /create-password", async () => {
    const { client, requests } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          user_id: 101,
          onboarding_status: "identity_verified",
          expires_at: "2026-11-08T12:00:00Z",
          requires_password: true,
          pre_auth_token: "otp-preauth-token-secret-777",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleOtpVerifySubmit(
      {
        email: "newuser@rekordly.com",
        purpose: "registration",
        code: "483921",
      },
      { api },
    );

    assert.equal(outcome.requiresPassword, true);
    assert.equal(outcome.destination, AUTH_ROUTES.CREATE_PASSWORD);
    assert.equal(
      useAuthFlowStore.getState().preAuthToken,
      "otp-preauth-token-secret-777",
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.OTP_VERIFY);
    assert.deepEqual(requests[0]?.data, {
      email: "newuser@rekordly.com",
      purpose: "registration",
      code: "483921",
    });
  });

  it("6. Sign-in OTP verification for existing account with password routes to onboarding/app destination", async () => {
    const { client } = createMockClient(() => ({
      status: 200,
      data: {
        data: {
          user_id: 42,
          onboarding_status: "activated",
          expires_at: "2026-11-08T12:00:00Z",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleOtpVerifySubmit(
      {
        email: "owner@rekordly.com",
        purpose: "sign_in",
        code: "222222",
      },
      { api, returnTo: "/invoices/45" },
    );

    assert.equal(outcome.requiresPassword, false);
    assert.equal(outcome.destination, "/invoices/45");
    assert.equal(useAuthFlowStore.getState().preAuthToken, null);
  });

  it("7. OTP expired, invalid, consumed, and rate-limited responses surface safe errors and redact code/email", async () => {
    const secretCode = "918273";
    const secretEmail = "private-owner@rekordly.com";

    const { client: invalidClient } = createMockClient(() => ({
      status: 401,
      data: {
        error: {
          code: "INVALID_PROOF",
          message: `The verification proof ${secretCode} for ${secretEmail} is invalid or expired.`,
        },
      },
    }));
    const invalidApi = createAuthApi(invalidClient);

    await assert.rejects(
      () =>
        handleOtpVerifySubmit(
          {
            email: secretEmail,
            purpose: "sign_in",
            code: secretCode,
          },
          { api: invalidApi },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "INVALID_PROOF");
        assert.ok(!err.message.includes(secretCode));
        assert.ok(!err.message.includes(secretEmail));
        return true;
      },
    );

    const { client: rateLimitClient } = createMockClient(() => ({
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
    const rateLimitApi = createAuthApi(rateLimitClient);

    await assert.rejects(
      () =>
        handleOtpVerifySubmit(
          {
            email: secretEmail,
            purpose: "sign_in",
            code: secretCode,
          },
          { api: rateLimitApi },
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "RATE_LIMITED");
        assert.equal(err.retryAfterSeconds, 900);
        return true;
      },
    );
  });

  it("8. Magic-link request normalizes allowlisted return_to and advances generation", async () => {
    const { client, requests } = createMockClient(() => ({
      status: 202,
      data: {
        data: {
          message: "If the account is eligible, a sign-in link will be sent.",
        },
      },
    }));
    const api = createAuthApi(client);

    const outcome = await handleMagicLinkRequestSubmit(
      { email: "Owner@Rekordly.com" },
      { api, returnTo: "/transactions" },
    );

    assert.equal(outcome.email, "owner@rekordly.com");
    assert.equal(outcome.generation, 1);
    assert.equal(outcome.message, NEUTRAL_MAGIC_LINK_REQUEST_MESSAGE);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.MAGIC_LINK_REQUEST);
    assert.deepEqual(requests[0]?.data, {
      email: "owner@rekordly.com",
      return_to: "/transactions",
    });

    // Unsafe external return_to is stripped before sending to backend
    await handleMagicLinkRequestSubmit(
      { email: "owner@rekordly.com" },
      { api, returnTo: "https://attacker.example/steal" },
    );
    assert.deepEqual(requests[1]?.data, {
      email: "owner@rekordly.com",
    });
  });

  it("9. Magic-link non-consuming inspection scrubs token and requires explicit confirmation before session creation", async () => {
    let scrubbed = false;
    const magicToken = "magic-token-32-chars-minimum-1234567890";

    const { client, requests } = createMockClient((req) => {
      if (req.url === AUTH_ENDPOINTS.MAGIC_LINK_INSPECT) {
        return {
          status: 200,
          data: {
            data: {
              valid: true,
              confirmation_required: true,
            },
          },
        };
      }
      return {
        status: 200,
        data: {
          data: {
            user_id: 55,
            onboarding_status: "identity_verified",
            expires_at: "2026-11-08T12:00:00Z",
            requires_password: true,
            pre_auth_token: "magic-preauth-secret-token",
          },
        },
      };
    });
    const api = createAuthApi(client);

    const inspected = await handleMagicLinkInspect(magicToken, {
      api,
      onTokenScrubbed: () => {
        scrubbed = true;
      },
    });

    assert.equal(scrubbed, true);
    assert.equal(inspected.valid, true);
    assert.equal(inspected.confirmation_required, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method?.toLowerCase(), "get");
    assert.equal(requests[0]?.url, AUTH_ENDPOINTS.MAGIC_LINK_INSPECT);
    assert.equal(requests[0]?.params.token, magicToken);
    // Inspection alone must not create a session or pre-auth token
    assert.equal(useAuthFlowStore.getState().preAuthToken, null);

    // Explicit confirmation consumes the token and routes passwordless account to /create-password
    let consumed = false;
    const confirmed = await handleMagicLinkConfirmSubmit(magicToken, {
      api,
      onTokenConsumed: () => {
        consumed = true;
      },
    });

    assert.equal(consumed, true);
    assert.equal(confirmed.requiresPassword, true);
    assert.equal(confirmed.destination, AUTH_ROUTES.CREATE_PASSWORD);
    assert.equal(
      useAuthFlowStore.getState().preAuthToken,
      "magic-preauth-secret-token",
    );
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.url, AUTH_ENDPOINTS.MAGIC_LINK_CONFIRM);
    assert.deepEqual(requests[1]?.data, { token: magicToken });
  });

  it("10. Successful password sign-in routes according to onboarding_status", async () => {
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

  it("11. Neutral invalid-credential error never leaks account existence", async () => {
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

  it("12. Neutral reset-request result always shows exact required message on 202", async () => {
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

  it("13. Reset completion and first-password creation handle proof tokens in memory only", async () => {
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

    await assert.rejects(
      () =>
        handleCreateFirstPasswordSubmit(null, {
          password: "my-strong-first-password",
          confirmPassword: "my-strong-first-password",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "INVALID_PROOF");
        return true;
      },
    );
  });

  it("14. Duplicate submission prevention blocks concurrent execution", async () => {
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

  it("15. UTF-8 byte-length password validation uses TextEncoder().encode(password).length (10..1024 bytes)", () => {
    const nineAscii = "123456789";
    assert.equal(getUtf8ByteLength(nineAscii), 9);
    assert.equal(validatePasswordUtf8Bytes(nineAscii).valid, false);

    const tenAscii = "1234567890";
    assert.equal(getUtf8ByteLength(tenAscii), 10);
    assert.equal(validatePasswordUtf8Bytes(tenAscii).valid, true);

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

    const maxValid = "a".repeat(1024);
    assert.equal(validatePasswordUtf8Bytes(maxValid).valid, true);

    const tooLong = "a".repeat(1025);
    assert.equal(validatePasswordUtf8Bytes(tooLong).valid, false);
    assert.equal(
      resetPasswordSchema.safeParse({
        password: tooLong,
        confirmPassword: tooLong,
      }).success,
      false,
    );
  });

  it("16. API requests always include credentials and mask/redact sensitive values", async () => {
    const config = buildAuthRequestConfig();
    assert.equal(config.withCredentials, true);
    assert.equal(
      (config.fetchOptions as { credentials?: string } | undefined)?.credentials,
      "include",
    );

    assert.equal(maskEmailAddress("founder@rekordly.com"), "f***@rekordly.com");

    const secretPassword = "MySuperSecretPassword!2026";
    const secretResetToken = "reset-token-secret-998877";
    const secretMagicToken = "magic-token-secret-44556677889900112233";

    const { client } = createMockClient(() => ({
      status: 422,
      data: {
        error: {
          code: "VALIDATION_ERROR",
          message: `Rejected ${secretPassword} ${secretResetToken} ${secretMagicToken}`,
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
      () => handleMagicLinkConfirmSubmit(secretMagicToken, { api }),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.ok(!err.message.includes(secretMagicToken));
        return true;
      },
    );
  });

  it("17. Accessibility ID helper associates labels, descriptions, and field errors", () => {
    const ids = getFormFieldAccessibilityIds("otp-code", {
      hasDescription: true,
      hasError: true,
    });
    assert.equal(ids.labelId, "otp-code-label");
    assert.equal(ids.descriptionId, "otp-code-description");
    assert.equal(ids.errorId, "otp-code-error");
    assert.equal(ids.ariaDescribedBy, "otp-code-description otp-code-error");
  });
});
