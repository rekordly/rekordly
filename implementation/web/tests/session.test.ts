import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import axios, { type AxiosAdapter } from "axios";

import {
  createApiAxiosInstance,
  RekordlyApiClient,
  setCsrfToken,
  setSessionLostHandler,
  workspaceHeaders,
} from "../src/lib/api.ts";
import { AUTH_ENDPOINTS, AUTH_ROUTES, createSessionApi, SESSION_MARKER_COOKIE } from "../src/lib/auth.ts";
import { ApiClientError } from "../src/lib/errors.ts";
import { formatMinorAmount, moneyInputPattern } from "../src/lib/money.ts";
import {
  canViewAllSpaces,
  hasWorkspacePermission,
  resolveWorkspaceScope,
} from "../src/stores/workspace-store.ts";
import type { AuthorizedWorkspace } from "../src/types/auth.ts";

function clientReturning(
  status: number,
  data: unknown,
  onRequest: (url: string | undefined) => void = () => {},
) {
  const adapter: AxiosAdapter = async (config) => {
    onRequest(config.url);
    await Promise.resolve();
    const response = { data, status, statusText: "", headers: {}, config };
    if (status >= 400) {
      throw new axios.AxiosError("failed", "ERR_BAD_REQUEST", config, {}, response);
    }
    return response;
  };
  const instance = createApiAxiosInstance("http://localhost:8080");
  instance.defaults.adapter = adapter;
  return new RekordlyApiClient(instance);
}

function withStatus204() {
  const instance = createApiAxiosInstance("http://localhost:8080");
  instance.defaults.adapter = async (config) => ({ data: "", status: 204, statusText: "", headers: {}, config });
  return instance;
}

function workspace(overrides: Partial<AuthorizedWorkspace>): AuthorizedWorkspace {
  return {
    id: 1,
    kind: "business",
    name: "Acme",
    slug: "acme",
    base_currency: "NGN",
    timezone: "Africa/Lagos",
    is_owner: false,
    role_code: "staff",
    role_name: "Staff",
    outlet_scope: {},
    permissions: [],
    ...overrides,
  };
}

describe("route proxy", () => {
  it("keeps its public routes and session marker in step with the app", () => {
    const proxySource = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    for (const route of Object.values(AUTH_ROUTES)) {
      assert.ok(proxySource.includes(`"${route}"`), `${route} must be public in proxy.ts`);
    }
    assert.ok(proxySource.includes(`"${SESSION_MARKER_COOKIE}"`));
  });
});

describe("session handling", () => {
  it("reports a lost session when a data endpoint answers 401", async () => {
    let lost = 0;
    setSessionLostHandler(() => {
      lost += 1;
    });
    const client = clientReturning(401, { error: { code: "UNAUTHORIZED", message: "expired" } });
    await assert.rejects(() => client.get("/api/v1/transactions"), ApiClientError);
    assert.equal(lost, 1);
    setSessionLostHandler(null);
  });

  it("does not treat a wrong password or the /me probe as a lost session", async () => {
    let lost = 0;
    setSessionLostHandler(() => {
      lost += 1;
    });
    const client = clientReturning(401, { error: { code: "INVALID_CREDENTIALS" } });
    await assert.rejects(() => client.post(AUTH_ENDPOINTS.PASSWORD_SIGN_IN, {}));
    await assert.rejects(() => client.get(AUTH_ENDPOINTS.CURRENT_USER));
    assert.equal(lost, 0);
    setSessionLostHandler(null);
  });

  it("collapses concurrent refreshes into one rotation", async () => {
    let calls = 0;
    const api = createSessionApi(
      clientReturning(
        200,
        { data: { user_id: 1, onboarding_status: "activated", expires_at: "2030-01-01T00:00:00Z" } },
        (url) => {
          if (url === AUTH_ENDPOINTS.REFRESH) calls += 1;
        },
      ),
    );
    const results = await Promise.all([api.refresh(), api.refresh(), api.refresh()]);
    assert.equal(calls, 1);
    assert.deepEqual(results, ["refreshed", "refreshed", "refreshed"]);
  });

  it("treats a rotation that lost the race as success, not a logout", async () => {
    const api = createSessionApi(
      clientReturning(409, { error: { code: "SESSION_ALREADY_ROTATED", message: "retry" } }),
    );
    assert.equal(await api.refresh(), "rotated-elsewhere");
  });

  it("sends the in-memory CSRF token, and refreshes it once when it is stale", async () => {
    const seen: unknown[] = [];
    const adapter: AxiosAdapter = async (config) => {
      if (config.url === AUTH_ENDPOINTS.CURRENT_USER) {
        return { data: { data: { csrf_token: "fresh" } }, status: 200, statusText: "", headers: {}, config };
      }
      seen.push(config.headers["X-CSRF-Token"]);
      if (config.headers["X-CSRF-Token"] !== "fresh") {
        throw new axios.AxiosError("failed", "ERR_BAD_REQUEST", config, {}, {
          data: { error: { code: "CSRF_INVALID" } },
          status: 403,
          statusText: "",
          headers: {},
          config,
        });
      }
      return { data: { data: { ok: true } }, status: 201, statusText: "", headers: {}, config };
    };
    const instance = createApiAxiosInstance("http://localhost:8080");
    instance.defaults.adapter = adapter;

    setCsrfToken("stale");
    await new RekordlyApiClient(instance).post("/api/v1/transactions", {});
    assert.deepEqual(seen, ["stale", "fresh"]);
    setCsrfToken(null);
  });

  it("treats an empty 204 response as success", async () => {
    await new RekordlyApiClient(withStatus204()).delete("/api/v1/budgets/1");
  });

  it("refuses to scope a request to an invalid workspace", () => {
    assert.throws(() => workspaceHeaders(0), ApiClientError);
    assert.deepEqual(workspaceHeaders(7), { "X-Workspace-ID": "7" });
  });
});

describe("workspace scope", () => {
  const personal = workspace({ id: 1, kind: "personal", is_owner: true });
  const staffBusiness = workspace({ id: 2, kind: "business", permissions: ["sales.view"] });
  const ownedBusiness = workspace({ id: 3, kind: "business", is_owner: true });

  it("ignores a stored id the API did not authorise", () => {
    const scope = resolveWorkspaceScope([personal, staffBusiness], 999);
    assert.equal(scope.active?.id, 2);
    assert.equal(scope.mode, "business");
  });

  it("defaults to the business space", () => {
    assert.equal(resolveWorkspaceScope([personal, ownedBusiness], null).active?.id, 3);
  });

  it("does not let ownership of one workspace grant access in another", () => {
    const scope = resolveWorkspaceScope([personal, staffBusiness], 2);
    assert.equal(hasWorkspacePermission(scope, "sales.view"), true);
    assert.equal(hasWorkspacePermission(scope, "reports.view_basic"), false);
  });

  it("only offers the all-spaces view to an owner of both kinds", () => {
    assert.equal(canViewAllSpaces([personal, staffBusiness]), false);
    assert.equal(canViewAllSpaces([personal, ownedBusiness]), true);
    const denied = resolveWorkspaceScope([personal, staffBusiness], "all");
    assert.notEqual(denied.mode, "all");
    const allowed = resolveWorkspaceScope([personal, ownedBusiness], "all");
    assert.equal(allowed.mode, "all");
    assert.equal(allowed.active, null);
  });
});

describe("money strings", () => {
  it("formats minor units exactly, beyond the safe integer range", () => {
    assert.equal(formatMinorAmount("90071992547409931", "NGN", 2), "NGN 900,719,925,474,099.31");
    assert.equal(formatMinorAmount("5", "NGN", 2), "NGN 0.05");
    assert.equal(formatMinorAmount("1500", "JPY", 0), "JPY 1,500");
    assert.equal(formatMinorAmount("-250050", "NGN", 2), "-NGN 2,500.50");
  });

  it("limits typed decimals to the currency's exponent", () => {
    assert.equal(moneyInputPattern(2).test("12.34"), true);
    assert.equal(moneyInputPattern(2).test("12.345"), false);
    assert.equal(moneyInputPattern(0).test("12.3"), false);
    assert.equal(moneyInputPattern(2).test("1e5"), false);
  });
});
