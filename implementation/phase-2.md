# Phase 2: Auth, Workspace, & Empty Dashboard

## Goal

Let users authenticate, enter the app, and land on a V1-inspired empty dashboard. By the end of Phase 2, a user can sign up, verify via email OTP, log in, and reach the empty dashboard. Auth works across the split frontend/API architecture.

**Ref:** Doc 12 §Phase 2, Doc 06 §Auth / Session, Doc 09 §Authentication And Session Security, Doc 11 §Dashboard Shell

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P2-01 | Auth data migration: OTP columns on `auth_identities` | Data | `auth_identities` has OTP hash, expiry, attempts, lockout, resend throttle columns; all constraints valid. |
| P2-02 | `POST /api/v1/auth/request-otp` | Backend | OTP generated, hashed, and emailed; same response for existing/new emails; resend throttle enforced. |
| P2-03 | `POST /api/v1/auth/verify-otp` | Backend | OTP verified against bcrypt hash; JWT + refresh token issued; failed attempts tracked with lockout; session created. |
| P2-04 | `POST /api/v1/auth/refresh` | Backend | Old session revoked; new JWT + refresh token issued; expired/revoked sessions rejected. |
| P2-05 | `POST /api/v1/auth/logout` | Backend | Session revoked; cookie cleared; audit log written. |
| P2-06 | `GET /api/v1/session` | Backend | Returns user, workspace, and plan data for authenticated session; invalid tokens return 401. |
| P2-07 | CORS configuration for cross-domain auth | Backend | CORS allows only approved origins per environment; no wildcards on protected endpoints; credentials allowed. |
| P2-08 | Auth middleware for protected routes | Backend | Extracts JWT, validates signature, checks revocation, resolves user_id + workspace_id on Gin context. |
| P2-09 | `GET /api/v1/workspace` | Backend | Returns workspace details for authenticated user's current workspace. |
| P2-10 | `PATCH /api/v1/workspace` | Backend | Updates workspace name only; protected fields cannot be mass-assigned. |
| P2-11 | sqlc queries for auth flows | Data | All auth, session, and workspace CRUD queries exist; workspace-scoped where applicable. |
| P2-12 | Login/signup UI page | Frontend | Email input form; calls request-otp; navigates to verify; no ads on auth screens. |
| P2-13 | OTP verification UI page | Frontend | 6-digit OTP input; verify + resend with countdown; stores tokens securely; navigates to dashboard. |
| P2-14 | Axios / React-Query client setup | Frontend | Axios instance with auth interceptors; React Query provider; auto-refresh on 401. |
| P2-15 | Auth store (Zustand) | Frontend | In-memory access token; httpOnly cookie refresh; user/workspace state; logout action. |
| P2-16 | Dashboard shell layout | Frontend | Top navbar, sidebar, mobile drawer, FAB; V1-inspired layout with brand tokens. |
| P2-17 | Finance Scope Toggle component | Frontend | Segmented control `All | Business | Personal`; default Business; sets smart defaults for creation. |
| P2-18 | Empty dashboard page | Frontend | Scope toggle, empty StatCards, actionable empty state message, FAB present. |
| P2-19 | Empty state components | Frontend | Reusable component with title, description, optional CTA; never just says "No data." |
| P2-20 | Skeleton loader components | Frontend | StatCard, DataTable, DashboardSummary, DetailPage skeletons; preserve dimensions; prevent layout shift. |
| P2-21 | Protected route guard | Frontend | Checks auth state; redirects to login; hydrates session from API on mount. |
| P2-22 | Audit logging for auth events | Backend | Structured slog for login, OTP, refresh, logout; PII masked; no raw OTPs/tokens in logs. |
| P2-23 | CSRF protection | Backend | CSRF token validation on unsafe methods if cookie-based auth; or bearer-token strategy with no localStorage. |
| P2-24 | Rate limiting middleware | Backend | Rate limits on OTP endpoints, write endpoints; 429 with rate limit headers; events logged. |

---

## Section 2: Detailed Descriptions

### P2-01: Auth Data Migration: OTP Columns on `auth_identities`

**Description:**
Verify or add the OTP-related columns on the `auth_identities` table. These columns support the email OTP authentication flow: storing hashed OTPs (never plaintext), tracking expiry for quick OTP expiration, counting failed attempts for brute-force lockout, and enforcing resend throttling. If these columns already exist from P1-06, this is a verification-only task with tests confirming the columns and constraints.

**Table Schema (OTP-specific columns):**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `otp_hash` | `VARCHAR(255)` | nullable | Bcrypt-hashed OTP value — never plaintext (Ref: Doc 09 §OTP Rules) |
| `otp_expires_at` | `TIMESTAMPTZ` | nullable | OTPs must expire quickly (Ref: Doc 09 §OTP Rules) |
| `otp_attempts` | `INT` | `NOT NULL DEFAULT 0` | Tracks failed attempts for lockout |
| `otp_last_requested_at` | `TIMESTAMPTZ` | nullable | For resend throttling (60-second cooldown) |
| `otp_locked_until` | `TIMESTAMPTZ` | nullable | Excessive failed attempts temporarily block verification |

**Acceptance Criteria:**
- [ ] `otp_hash` column exists (VARCHAR 255, nullable) for bcrypt-hashed OTPs
- [ ] `otp_expires_at` column exists for OTP expiration
- [ ] `otp_attempts` column exists with `DEFAULT 0` for failed attempt tracking
- [ ] `otp_last_requested_at` column exists for resend throttle enforcement
- [ ] `otp_locked_until` column exists for lockout after excessive failures
- [ ] Tests confirm columns and constraints are valid

---

### P2-02: `POST /api/v1/auth/request-otp`

**Description:**
Implement the OTP request endpoint for email-based authentication. This is the entry point for both signup and login — the same endpoint handles both cases. If the user does not exist, a new user and workspace are created. The response must not confirm whether an email exists to prevent enumeration attacks (Ref: Doc 09 §OTP Rules). Resend throttling prevents OTP spam. Failed OTP attempts counter is reset on each new OTP generation.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/request-otp` | None | Request email OTP for signup/login |

**Request Payload:**

```json
{
  "email": "user@example.com"
}
```

**Response Envelope (200 OK):**

```json
{
  "data": {
    "message": "If an account with that email exists, a verification code has been sent."
  },
  "meta": {}
}
```

**Behavior/Processing Steps:**
1. Validate `email` as required email format using `validator/v10`
2. If user does not exist: create `users` row with `email` and a default `workspaces` row with `name = "My Workspace"`, `owner_id = users.id`, and a `workspace_members` row with `role = 'owner'`
3. Upsert `auth_identities` row with `provider = 'email_otp'`, `provider_identifier = email`
4. Generate 6-digit OTP. Hash with bcrypt. Store `otp_hash`, set `otp_expires_at = now() + 5 minutes`
5. Enforce resend throttle: if `otp_last_requested_at` is within last 60 seconds, return `429` with error code `RATE_LIMITED`
6. Reset `otp_attempts = 0` on new OTP generation
7. Set `otp_last_requested_at = now()`
8. Send OTP email via `go-mail` SMTP to the user's email
9. Return same `200` structure for both existing and new emails (anti-enumeration)

**Security Considerations:**
- Response must NOT confirm whether email exists (Ref: Doc 09 §OTP Rules)
- OTP logs must NOT include the OTP value (Ref: Doc 09 §OTP Rules)
- Rate limit: max 5 requests per email per hour
- OTP hash uses bcrypt, never plaintext

**Acceptance Criteria:**
- [ ] Endpoint `POST /api/v1/auth/request-otp` registered and functional
- [ ] New user + workspace + workspace_member created on first request for an email
- [ ] OTP generated, bcrypt-hashed, and stored in `otp_hash`
- [ ] `otp_expires_at` set to `now() + 5 minutes`
- [ ] Resend throttle returns `429 RATE_LIMITED` if requested within 60 seconds
- [ ] `otp_attempts` reset to `0` on new OTP generation
- [ ] OTP email sent via `go-mail` SMTP
- [ ] Response is identical for existing and non-existing emails
- [ ] Rate limit: max 5 requests per email per hour

---

### P2-03: `POST /api/v1/auth/verify-otp`

**Description:**
Implement the OTP verification endpoint. This completes the auth flow by validating the submitted OTP against the bcrypt hash, enforcing lockout after excessive failures, and creating an authenticated session with JWT access token and refresh token. The endpoint handles both signup verification and login.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/verify-otp` | None | Verify email OTP and create session |

**Request Payload:**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response Envelope (200 OK):**

```json
{
  "data": {
    "access_token": "<JWT>",
    "refresh_token": "<opaque string>",
    "expires_at": "2025-01-15T10:45:00Z",
    "user": {
      "id": "<uuid>",
      "email": "user@example.com",
      "display_name": "..."
    },
    "workspace": {
      "id": "<uuid>",
      "name": "My Workspace",
      "default_currency_code": "NGN"
    }
  },
  "meta": {}
}
```

**Behavior/Processing Steps:**
1. Look up `auth_identities` by `provider = 'email_otp'` AND `provider_identifier = email`
2. If `otp_locked_until > now()`, return `429` with error code `RATE_LIMITED` and message "Too many failed attempts. Please try again later."
3. If `otp_expires_at < now()`, return `401` with error code `UNAUTHORIZED` and message "Code has expired. Please request a new one."
4. Compare submitted OTP against `otp_hash` using bcrypt
5. If mismatch: increment `otp_attempts`. If `otp_attempts >= 5`, set `otp_locked_until = now() + 15 minutes` (Ref: Doc 09 §OTP Rules). Return `401` with error code `UNAUTHORIZED`
6. If match: set `verified = true`, clear `otp_hash`, reset `otp_attempts = 0`
7. Create a `sessions` row: generate access JWT (short-lived, TTL from `JWT_ACCESS_TTL`, default `15m`) and refresh token (long-lived, TTL from `JWT_REFRESH_TTL`, default `7d`). Store `refresh_token_hash` in `sessions`
8. Return `200` with tokens, user, and workspace data
9. Set HTTP-only, Secure, SameSite=Strict cookie named `rekordly_refresh` with the refresh token (if cookie strategy used) — OR return in JSON body
10. Audit: Log OTP verification success with masked email `u***@example.com` (Ref: Doc 09 §Data Masking)

**Security Considerations:**
- OTP values must not be stored in plaintext (Ref: Doc 09 §OTP Rules)
- Failed OTP attempts are rate-limited and lead to lockout (Ref: Doc 09 §OTP Rules)
- JWT signing uses `JWT_SIGNING_SECRET` from Viper config
- Refresh token is stored as hash, never plaintext
- Access token is short-lived (default 15m); refresh token has finite expiry (Ref: Doc 09 §Session Rules)
- Audit log uses masked email, never raw PII

**Acceptance Criteria:**
- [ ] Endpoint verifies OTP against bcrypt hash
- [ ] Lockout after 5 failed attempts for 15 minutes
- [ ] Expired OTP returns `401 UNAUTHORIZED`
- [ ] Successful verification creates session with JWT access token + refresh token
- [ ] `verified` set to `true`, `otp_hash` cleared, `otp_attempts` reset
- [ ] Refresh token stored as hash in `sessions` table
- [ ] HTTP-only Secure cookie set for refresh token (if cookie strategy)
- [ ] Audit log written with masked email

---

### P2-04: `POST /api/v1/auth/refresh`

**Description:**
Implement the token refresh endpoint. This rotates the refresh token: the old session is revoked and a new session is created with fresh tokens. Refresh expiry is finite. Revoked sessions fail on the next protected request (Ref: Doc 09 §Session Rules).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/refresh` | None (uses refresh token) | Refresh access token |

**Request Payload:**

```json
{
  "refresh_token": "<opaque>"
}
```

**Response Envelope (200 OK):**

```json
{
  "data": {
    "access_token": "<new JWT>",
    "refresh_token": "<new opaque>",
    "expires_at": "2025-01-15T11:00:00Z"
  },
  "meta": {}
}
```

**Behavior/Processing Steps:**
1. Hash the provided refresh token. Look up `sessions` by `refresh_token_hash`
2. If session not found OR `revoked_at IS NOT NULL` OR `expires_at < now()`, return `401` with error code `UNAUTHORIZED`
3. If valid, revoke the old session: set `revoked_at = now()`
4. Create new `sessions` row with new access JWT and new refresh token
5. Return `200` with new tokens

**Security Considerations:**
- Refresh expiry is finite (Ref: Doc 09 §Session Rules)
- Logout must revoke the active session or refresh token (Ref: Doc 09 §Session Rules)
- Revoked sessions fail on next protected request
- Token rotation prevents token reuse attacks

**Acceptance Criteria:**
- [ ] Endpoint validates refresh token against hashed value in `sessions`
- [ ] Expired or revoked sessions return `401 UNAUTHORIZED`
- [ ] Old session is revoked on successful refresh
- [ ] New access JWT + refresh token are created and returned
- [ ] Refresh token rotation prevents reuse

---

### P2-05: `POST /api/v1/auth/logout`

**Description:**
Implement the logout endpoint. Revokes the active session so the refresh token can no longer be used. Clears the `rekordly_refresh` cookie if using cookies. Audit log is written for the logout event.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/logout` | Bearer token | Logout and revoke session |

**Request Payload:** None (authenticated via Bearer token)

**Response Envelope (200 OK):**

```json
{
  "data": {
    "message": "Logged out successfully"
  },
  "meta": {}
}
```

**Behavior/Processing Steps:**
1. Extract session from JWT claims
2. Set `revoked_at = now()` on the session row
3. Return `200` with success message
4. Clear `rekordly_refresh` cookie if using cookies
5. Audit: Log logout event with user_id and masked email

**Acceptance Criteria:**
- [ ] Endpoint revokes the active session by setting `revoked_at`
- [ ] Returns `200` with success message
- [ ] Clears `rekordly_refresh` cookie if applicable
- [ ] Audit log written for logout event

---

### P2-06: `GET /api/v1/session`

**Description:**
Implement the session endpoint that returns the current authenticated user's session data including user profile, workspace details, and plan information. This is used by the frontend auth guard to validate tokens and hydrate state on page load.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/session` | Bearer token | Get current session data |

**Response Envelope (200 OK):**

```json
{
  "data": {
    "user": {
      "id": "<uuid>",
      "email": "user@example.com",
      "display_name": "...",
      "default_currency_code": "NGN"
    },
    "workspace": {
      "id": "<uuid>",
      "name": "My Workspace",
      "default_currency_code": "NGN",
      "owner_id": "<uuid>"
    },
    "plan": {
      "name": "free",
      "limits": {
        "transactions_per_month": 100,
        "ai_credits_per_month": 10
      }
    }
  },
  "meta": {}
}
```

**Behavior/Processing Steps:**
1. Validate JWT signature and expiry
2. Check session not revoked
3. Resolve `user_id` and `workspace_id` from JWT claims or session row
4. Return `200` with user, workspace, and plan data

**Acceptance Criteria:**
- [ ] Returns user, workspace, and plan data for authenticated session
- [ ] Invalid/expired/revoked tokens return `401 UNAUTHORIZED`
- [ ] Plan limits included in response
- [ ] Workspace-scoped data returned

---

### P2-07: CORS Configuration for Cross-Domain Auth

**Description:**
Configure CORS middleware for the cross-domain architecture where the frontend on `rekordly.com` talks to the API on `api.rekordly.com`. No wildcard CORS on protected endpoints (Ref: Doc 09 §CORS Rules). CORS config is environment-specific — production, staging, and local each have their own allowed origins. Unknown origins are rejected.

**Configuration Details:**

| Environment | AllowOrigins |
|-------------|-------------|
| Production | `["https://rekordly.com"]` |
| Staging | `["https://staging.rekordly.com"]` |
| Local | `["http://localhost:3000"]` |

**CORS Settings:**
- `AllowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`
- `AllowHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token"]`
- `AllowCredentials: true`
- `MaxAge: 12 hours`
- Loaded from `CORS_ALLOWED_ORIGINS` Viper config

**Security Considerations:**
- No wildcard CORS on protected endpoints (Ref: Doc 09 §CORS Rules)
- Credentialed requests must use strict allowed origins
- CORS config is environment-specific (Ref: Doc 09 §CORS Rules)
- Unknown origins are rejected (Ref: Doc 09 §CORS Rules)

**Acceptance Criteria:**
- [ ] CORS middleware configured via `gin-contrib/cors`
- [ ] Production allows only `https://rekordly.com`
- [ ] Staging allows only staging frontend origin
- [ ] Local allows `http://localhost:3000`
- [ ] `AllowCredentials: true` for cookie/bearer token flow
- [ ] No wildcard on protected endpoints
- [ ] Unknown origins are rejected with appropriate CORS error

---

### P2-08: Auth Middleware for Protected Routes

**Description:**
Implement the authentication middleware that validates every protected request. This is the security boundary — it resolves `user_id` and `workspace_id` from the JWT and session, and sets them on the Gin context for downstream handlers. Every protected request must resolve an authenticated `user_id` (Ref: Doc 09 §Security Principles). Every protected tenant-owned request must resolve a `workspace_id` (Ref: Doc 09 §Authorization And Tenant Isolation).

**Behavior/Processing Steps:**
1. Extract `Authorization: Bearer <token>` header
2. Parse and validate JWT using `golang-jwt/jwt/v5` with `JWT_SIGNING_SECRET`
3. Check token not expired
4. Extract `user_id` and `session_id` from JWT claims
5. Query `sessions` table to confirm session not revoked (`revoked_at IS NULL`) and not expired (`expires_at > now()`)
6. Resolve `workspace_id` from session row
7. Set `c.Set("user_id", ...)`, `c.Set("workspace_id", ...)`, `c.Set("session_id", ...)` on Gin context
8. If any step fails, return `401` with error code `UNAUTHORIZED`

**Security Considerations:**
- Every protected request resolves `user_id` and `workspace_id` (Ref: Doc 09)
- Clients must not be trusted to choose arbitrary workspace IDs (Ref: Doc 09 §Workspace Scoping)
- JWT signature validation prevents token forgery
- Session revocation check ensures revoked tokens are rejected

**Acceptance Criteria:**
- [ ] Middleware extracts and validates JWT from `Authorization` header
- [ ] Expired tokens return `401 UNAUTHORIZED`
- [ ] Revoked sessions return `401 UNAUTHORIZED`
- [ ] `user_id`, `workspace_id`, `session_id` set on Gin context for downstream handlers
- [ ] Missing `Authorization` header returns `401 UNAUTHORIZED`

---

### P2-09: `GET /api/v1/workspace`

**Description:**
Implement the workspace retrieval endpoint. Returns the authenticated user's current workspace details. The workspace_id is resolved server-side from the session — clients cannot choose arbitrary workspace IDs (Ref: Doc 09 §Workspace Scoping).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/workspace` | Bearer token | Get current workspace |

**Response Envelope (200 OK):**

```json
{
  "data": {
    "id": "<uuid>",
    "name": "My Workspace",
    "owner_id": "<uuid>",
    "default_currency_code": "NGN",
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  },
  "meta": {}
}
```

**Acceptance Criteria:**
- [ ] Returns workspace details for authenticated user's current workspace
- [ ] `workspace_id` resolved from auth context, not from request params
- [ ] Unauthenticated requests return `401`

---

### P2-10: `PATCH /api/v1/workspace`

**Description:**
Implement the workspace update endpoint. Only the `name` field is user-mutable — protected fields like `workspace_id`, `owner_id`, `default_currency_code` cannot be mass-assigned (Ref: Doc 09 §Property-Level Authorization). The API maps request DTOs to allowed fields explicitly instead of binding directly into database models.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/api/v1/workspace` | Bearer token | Update workspace name |

**Request Payload:**

```json
{
  "name": "Updated Name"
}
```

**Response Envelope (200 OK):**

```json
{
  "data": {
    "id": "<uuid>",
    "name": "Updated Name",
    "owner_id": "<uuid>",
    "default_currency_code": "NGN",
    "updated_at": "2025-01-15T11:00:00Z"
  },
  "meta": {}
}
```

**Security Considerations:**
- Protected fields (`workspace_id`, `owner_id`, `default_currency_code`, `created_at`) cannot be set by clients
- Request DTO maps explicitly to allowed fields only (Ref: Doc 09 §Property-Level Authorization)
- `name` validation: non-empty, max 255 chars

**Acceptance Criteria:**
- [ ] Updates workspace name only
- [ ] Protected fields cannot be mass-assigned
- [ ] `name` validated as non-empty, max 255 chars
- [ ] `updated_at` set to `now()`
- [ ] Unauthenticated requests return `401`

---

### P2-11: sqlc Queries for Auth Flows

**Description:**
Create all sqlc query files needed for authentication, session, and workspace CRUD operations. These queries power the auth endpoints (P2-02 through P2-06) and workspace endpoints (P2-09, P2-10). All queries are workspace-scoped where applicable and use parameterized statements only (Ref: Doc 09 §Injection Prevention).

**Query Definitions:**

File: `api/sqlc/queries/auth.sql`

| Query Name | Operation | Description |
|-----------|-----------|-------------|
| `CreateUser` | INSERT | Create new user returning `*` |
| `GetUserByEmail` | SELECT | Find user by email |
| `GetUserByID` | SELECT | Find user by ID |
| `UpsertAuthIdentity` | INSERT ON CONFLICT UPDATE | Create or update auth identity with OTP fields |
| `GetAuthIdentityByProviderIdentifier` | SELECT | Find auth identity by provider + identifier |
| `CreateSession` | INSERT | Create new session returning `*` |
| `GetSessionByRefreshTokenHash` | SELECT | Find session by refresh token hash |
| `RevokeSession` | UPDATE | Set `revoked_at = now()` |
| `CreateWorkspace` | INSERT | Create new workspace returning `*` |
| `CreateWorkspaceMember` | INSERT | Create workspace member returning `*` |
| `GetWorkspaceByID` | SELECT | Find workspace by ID (workspace-scoped) |
| `UpdateWorkspaceName` | UPDATE | Update workspace name + `updated_at` |

**Acceptance Criteria:**
- [ ] All 12 queries exist in `api/sqlc/queries/auth.sql`
- [ ] `UpsertAuthIdentity` handles ON CONFLICT correctly
- [ ] All workspace-scoped queries include `workspace_id` filter
- [ ] `sqlc generate` produces valid Go code
- [ ] No raw SQL string concatenation

---

### P2-12: Login/Signup UI Page

**Description:**
Create the login/signup page that serves as the entry point for authentication. The page renders a single email input form — the same flow handles both signup and login. When the user submits their email, the frontend calls `POST /api/v1/auth/request-otp`, then navigates to the verification page. No ads are shown on auth screens (Ref: Doc 10 §Display / Image Ads). The page uses HeroUI components and brand tokens from Doc 11.

**Component Hierarchy:**

```
(auth)/layout.tsx          ← Centered layout, no sidebar
  └── (auth)/login/page.tsx
        └── LoginForm
              ├── HeroUI Card
              │     ├── Email Input (type=email, required, zod validated)
              │     └── "Continue" Button (primary green #009e10)
              └── Link to signup/info text
```

**Props/State:**

| State | Behavior |
|-------|----------|
| `idle` | Form visible, button enabled |
| `loading` | Button shows spinner, disabled |
| `success` | Navigate to `/verify?email=<encoded>` |
| `error` | Show inline error from `error.message` |

**Design Tokens (Ref: Doc 11):**
- CTA button: primary green `#009e10`
- Light/dark mode: `next-themes`
- Font: Figtree for body text, Sora for heading
- No ads on auth screens (Ref: Doc 10)

**Cross-Domain Configuration:**
- axios instance: `baseURL = NEXT_PUBLIC_API_URL`, `withCredentials: true`

**Acceptance Criteria:**
- [ ] Page at `web/src/app/(auth)/login/page.tsx`
- [ ] Layout at `web/src/app/(auth)/layout.tsx` (centered, no sidebar)
- [ ] Email input validated with zod
- [ ] "Continue" button calls `POST /api/v1/auth/request-otp`
- [ ] Success navigates to `/verify?email=<encoded>`
- [ ] Error state shows inline error
- [ ] No ads on auth screens
- [ ] Light/dark mode works

---

### P2-13: OTP Verification UI Page

**Description:**
Create the OTP verification page where users enter the 6-digit code sent to their email. The page includes a "Resend Code" button with a 60-second countdown timer. On successful verification, tokens are stored securely — access token in memory (NOT localStorage — Ref: Doc 09 §Session Rules), refresh token in httpOnly cookie. The user is then navigated to the dashboard.

**Component Hierarchy:**

```
(auth)/verify/page.tsx
  └── OTPVerifyForm
        ├── OTP Input (6 digits)
        ├── Hidden email from URL query param
        ├── "Verify" Button (primary green)
        └── "Resend Code" Button (secondary gray, 60s countdown)
```

**Props/State:**

| State | Behavior |
|-------|----------|
| `idle` | OTP input focused, verify button enabled |
| `loading` | Verify button shows spinner, disabled |
| `success` | Store tokens securely, navigate to `/dashboard` |
| `error` | Show inline error message |
| `locked` | Show "Too many attempts. Try again in X minutes." |

**Form Fields:**

| Field | Type | Validation |
|-------|------|-----------|
| `otp` | 6-digit input | Required, exactly 6 digits |
| `email` | Hidden (from URL param) | Required |

**Security Considerations:**
- Access token stored in memory only (NOT localStorage, NOT IndexedDB — Ref: Doc 09 §PWA And Offline Security)
- Refresh token stored in httpOnly cookie set by API
- Resend button disabled for 60 seconds after send with countdown timer

**Design Tokens (Ref: Doc 11):**
- Verify button: primary green `#009e10`
- Resend button: secondary gray
- Clean, centered layout

**Acceptance Criteria:**
- [ ] Page at `web/src/app/(auth)/verify/page.tsx`
- [ ] 6-digit OTP input with auto-focus
- [ ] Hidden email field from URL query param
- [ ] "Verify" button calls `POST /api/v1/auth/verify-otp`
- [ ] "Resend Code" button with 60-second countdown timer
- [ ] Access token stored in memory (NOT localStorage)
- [ ] Success navigates to `/dashboard`
- [ ] Locked state shows lockout message
- [ ] Error state shows inline error

---

### P2-14: Axios / React-Query Client Setup

**Description:**
Set up the Axios instance and React Query client for all backend API communication. The Axios instance includes interceptors for automatic token attachment and refresh-on-401 behavior. React Query is configured with sensible defaults for data fetching and caching. The providers wrap the app at the root level.

**Configuration Details:**

**`web/src/lib/api-client.ts` (Axios):**
- `baseURL = process.env.NEXT_PUBLIC_API_URL`
- `withCredentials: true`
- Request interceptor: attach `Authorization: Bearer <access_token>` from in-memory store (Zustand `useAuthStore`)
- Response interceptor: on `401`, attempt `POST /api/v1/auth/refresh` with stored refresh token. If refresh succeeds, update tokens and retry original request. If refresh fails, clear tokens and redirect to `/login`

**`web/src/lib/query-client.ts` (React Query):**
- `staleTime: 5 minutes`
- `retry: 1`

**`web/src/app/providers.tsx`:**
- `QueryClientProvider`
- `HeroUIProvider`
- `NextThemesProvider`

**Acceptance Criteria:**
- [ ] Axios instance created with correct `baseURL` and `withCredentials: true`
- [ ] Request interceptor attaches Bearer token from auth store
- [ ] Response interceptor handles 401 with automatic refresh
- [ ] Failed refresh redirects to `/login`
- [ ] React Query client configured with `staleTime: 5m`, `retry: 1`
- [ ] Provider hierarchy: QueryClientProvider > HeroUIProvider > NextThemesProvider

---

### P2-15: Auth Store (Zustand)

**Description:**
Create the Zustand auth store for managing client-side authentication state. The access token is stored in memory only — never in localStorage or IndexedDB (Ref: Doc 09 §PWA And Offline Security, Ref: Doc 09 §Session Rules). The refresh token is stored in an httpOnly cookie set by the API (not accessible to JavaScript). The store provides actions for setting tokens, hydrating session data, and logging out.

**State Definition:**

| Field | Type | Purpose |
|-------|------|---------|
| `accessToken` | `string \| null` | In-memory JWT access token |
| `user` | `User \| null` | Current user profile |
| `workspace` | `Workspace \| null` | Current workspace |
| `isAuthenticated` | `boolean` | Derived from accessToken presence |

**Actions:**

| Action | Behavior |
|--------|----------|
| `setTokens(access, refresh)` | Store access token in memory; refresh token handled by httpOnly cookie |
| `setSession(user, workspace)` | Hydrate user and workspace data |
| `logout()` | Clear tokens, redirect to `/login` |
| `refreshAccessToken()` | Call `/api/v1/auth/refresh`, update tokens |

**Security Considerations:**
- Access token stored in memory only (Ref: Doc 09)
- Refresh token stored in httpOnly cookie (not accessible to JS)
- Long-lived auth secrets must never be stored in localStorage (Ref: Doc 09 §Session Rules)
- Long-lived auth secrets must never be stored in IndexedDB (Ref: Doc 09 §PWA And Offline Security)

**Acceptance Criteria:**
- [ ] Store at `web/src/stores/auth-store.ts`
- [ ] Access token stored in memory only (not localStorage, not IndexedDB)
- [ ] Refresh token managed via httpOnly cookie
- [ ] `logout()` clears tokens and redirects to `/login`
- [ ] `refreshAccessToken()` calls API and updates state
- [ ] `isAuthenticated` derived from token presence

---

### P2-16: Dashboard Shell Layout

**Description:**
Create the dashboard shell layout that preserves V1's visual identity while establishing the V2 component architecture. The layout includes a top navbar, left sidebar (desktop), mobile drawer navigation, and a floating quick action button (FAB). The FAB opens the GlobalAddDrawer (implemented in Phase 3). Brand tokens from Doc 11 are applied throughout.

**Component Hierarchy:**

```
(dashboard)/layout.tsx
  ├── DashboardNavbar
  │     ├── Logo
  │     ├── Workspace name
  │     ├── Finance Scope Toggle (P2-17)
  │     └── User avatar/menu
  ├── DashboardSidebar (desktop only)
  │     ├── Nav items: Dashboard, Transactions, Sales, Purchases, Invoices, Customers, Loans, Budgets, Reports, Settings
  │     └── Active state: primary green
  ├── MobileDrawer (mobile only)
  │     └── Same nav items as sidebar
  ├── QuickActionButton (FAB)
  │     └── Opens GlobalAddDrawer
  └── {children}  ← Scrollable main content area
```

**Design Tokens (Ref: Doc 11):**
- Active nav item: primary green `#009e10`
- Dark mode sidebar: dark card `#121212`
- Light mode background: light bg `#FAFFFB`
- Dark mode background: dark bg `#010501`
- Fonts: Sora for headings, Figtree for body

**Layout Rules (Ref: Doc 11 §Dashboard Shell):**
- Desktop: top navbar + left sidebar + scrollable main content + FAB
- Mobile: top navbar + drawer navigation + FAB
- Lists should be card-like or horizontally scrollable with labels

**Acceptance Criteria:**
- [ ] Layout at `web/src/app/(dashboard)/layout.tsx`
- [ ] Desktop: top navbar, left sidebar, main content, FAB
- [ ] Mobile: top navbar, drawer navigation, FAB
- [ ] Nav items: Dashboard, Transactions, Sales, Purchases, Invoices, Customers, Loans, Budgets, Reports, Settings
- [ ] Active nav item uses primary green `#009e10`
- [ ] Light/dark mode works via `next-themes`
- [ ] FAB positioned bottom-right, opens GlobalAddDrawer

---

### P2-17: Finance Scope Toggle Component

**Description:**
Create the Finance Scope Toggle as a first-class UI control for filtering dashboards, transaction lists, budgets, and report summaries by personal vs. business scope (Ref: Doc 11 §Personal vs. Business Scope UI). The toggle defaults to `Business`. The current scope sets smart defaults for new records in the Add Transaction drawer, but users can always override scope inside the drawer without switching the dashboard toggle (Ref: Doc 11 §Smart Defaults For Creation).

**Component Hierarchy:**

```
FinanceScopeToggle
  └── HeroUI ButtonGroup
        ├── "All" button
        ├── "Business" button (default active)
        └── "Personal" button
```

**State:**

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `scope` | `'all' \| 'business' \| 'personal'` | `'business'` | Current scope filter |

**Behavior:**
1. Toggle changes scope filter for dashboards, transaction lists, budgets, and report summaries
2. `Business` view shows business records + relevant mixed/transfer context
3. `Personal` view shows personal records + relevant mixed/transfer context
4. `All` view shows combined activity with scope labels
5. Current scope sets smart default for new records in Add Transaction drawer

**Design Tokens (Ref: Doc 11 §Scope Indicators In Lists):**
- Active segment: primary green `#009e10`
- Accessible and keyboard-navigable
- Visible on desktop navbar and mobile top area

**Acceptance Criteria:**
- [ ] Component at `web/src/components/finance-scope-toggle.tsx`
- [ ] Renders as segmented control: `All | Business | Personal`
- [ ] Default view is `Business` (Ref: Doc 11)
- [ ] Zustand store `useScopeStore` manages scope state
- [ ] Toggle filters dashboard, transaction lists, budgets, reports
- [ ] Current scope sets smart defaults for Add Transaction
- [ ] Keyboard accessible

---

### P2-18: Empty Dashboard Page

**Description:**
Create the empty dashboard page that a newly authenticated user lands on. The page displays the Finance Scope Toggle, empty StatCards with skeleton-ready dimensions, and an actionable empty state that guides users toward their first transaction. No marketing-style hero sections or nested cards (Ref: Doc 11 §Dashboard Composition).

**Component Hierarchy:**

```
(dashboard)/dashboard/page.tsx
  ├── FinanceScopeToggle
  ├── StatCards Row (empty, showing "—")
  │     ├── Revenue StatCard (green accent)
  │     ├── Expenses StatCard (orange accent)
  │     ├── Profit StatCard (neutral)
  │     └── Debt StatCard (red accent)
  ├── DataTable Area (empty)
  │     └── EmptyState: "No business transactions yet. Type what happened to add one."
  └── Quick Action FAB
```

**Design Tokens (Ref: Doc 11):**
- Sora font for stat headings
- Figtree for body text
- Primary green `#009e10` for revenue stat
- Secondary orange `#fa8901` for expense stat
- Rounded cards, compact financial summaries
- No marketing-style hero sections
- No nested cards inside cards

**Acceptance Criteria:**
- [ ] Page at `web/src/app/(dashboard)/dashboard/page.tsx`
- [ ] Finance Scope Toggle at top
- [ ] Empty StatCards showing `"—"` with skeleton-ready dimensions
- [ ] Empty DataTable area with actionable empty state message
- [ ] FAB present
- [ ] No marketing-style hero sections

---

### P2-19: Empty State Components

**Description:**
Create a reusable EmptyState component that provides actionable guidance when no data exists. Empty states must never just say "No data." (Ref: Doc 11 §EmptyState). They must explain the next useful action and use the AI-first entry flow as the primary CTA where relevant. Empty states should respect plan gates.

**Component Hierarchy:**

```
EmptyState
  ├── Icon/illustration (optional)
  ├── Title (string)
  ├── Description (string)
  └── Action button (optional)
        ├── actionLabel: string
        └── onAction: () => void
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | Headline text |
| `description` | `string` | Yes | Explains the next useful action |
| `actionLabel` | `string` | No | CTA button text |
| `onAction` | `() => void` | No | CTA click handler |
| `icon` | `ReactNode` | No | Custom icon/illustration |

**Example Messages (Ref: Doc 11 §EmptyState):**
- "No business expenses yet. Type what happened to add one."
- "No invoices yet. Create your first invoice when you are ready to bill a customer."
- "No tax report yet. Add VAT and deductible tags, then generate a Tax Readiness Report."

**Design Tokens:**
- Figtree for text
- Primary green `#009e10` for action button
- Centered layout

**Acceptance Criteria:**
- [ ] Component at `web/src/components/empty-state.tsx`
- [ ] Accepts title, description, optional actionLabel, onAction, icon
- [ ] Action button opens GlobalAddDrawer or navigates to creation flow
- [ ] Never just says "No data."
- [ ] Empty states respect plan gates

---

### P2-20: Skeleton Loader Components

**Description:**
Create skeleton loader components that match the expected layout of their real counterparts. Skeleton loaders prevent layout shift by preserving final component dimensions while data loads (Ref: Doc 11 §SkeletonLoader). Avoid spinner-only loading for major dashboard content. Do not replace the whole dashboard with a tiny centered spinner unless the entire page has no renderable shell.

**Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| `StatCardSkeleton` | `web/src/components/skeletons/stat-card-skeleton.tsx` | Loading state for StatCard |
| `DataTableSkeleton` | `web/src/components/skeletons/data-table-skeleton.tsx` | Loading state for DataTable |
| `DashboardSummarySkeleton` | `web/src/components/skeletons/dashboard-summary-skeleton.tsx` | Loading state for dashboard summary |
| `DetailPageSkeleton` | `web/src/components/skeletons/detail-page-skeleton.tsx` | Loading state for detail pages |

**Design Rules (Ref: Doc 11 §SkeletonLoader):**
1. Preserve final component dimensions while loading
2. Prevent layout shift
3. Avoid spinner-only loading for major dashboard content
4. Use skeletons that match the expected layout
5. Do not replace the whole dashboard with a tiny centered spinner

**Acceptance Criteria:**
- [ ] All four skeleton components exist
- [ ] StatCardSkeleton preserves StatCard dimensions
- [ ] DataTableSkeleton preserves table dimensions with row placeholders
- [ ] DashboardSummarySkeleton preserves summary layout
- [ ] DetailPageSkeleton preserves detail page layout
- [ ] No layout shift when transitioning from skeleton to real content

---

### P2-21: Protected Route Guard

**Description:**
Implement the route guard that protects all dashboard routes. The guard checks authentication state, validates the session with the backend, and redirects unauthenticated users to the login page. On mount, the guard calls `GET /api/v1/session` to validate the token and hydrate user/workspace state. If the session call returns `401`, it attempts a refresh; if refresh fails, it redirects to `/login`.

**Behavior:**
1. Check `useAuthStore.isAuthenticated`
2. If not authenticated, redirect to `/login`
3. If authenticated, render children
4. On mount, call `GET /api/v1/session` to validate token and hydrate state
5. If session call returns `401`, attempt refresh; if refresh fails, redirect to `/login`
6. Applied to all routes under `(dashboard)` layout group

**Implementation Options:**
- Component at `web/src/components/auth-guard.tsx` wrapping dashboard layout children
- Or Next.js middleware at `web/src/middleware.ts` for server-side route protection

**Acceptance Criteria:**
- [ ] Protected route guard checks auth state
- [ ] Unauthenticated users redirected to `/login`
- [ ] Session validation calls `GET /api/v1/session` on mount
- [ ] Failed session triggers refresh attempt
- [ ] Failed refresh redirects to `/login`
- [ ] Applied to all `(dashboard)` routes

---

### P2-22: Audit Logging for Auth Events

**Description:**
Implement structured audit logging for all auth-related events per Doc 09 §Events To Log. Uses `log/slog` for structured, JSON-friendly output. All PII must be masked in logs — emails as `j***@gmail.com`, phone numbers as `080****5678` (Ref: Doc 09 §Data Masking). Logs must NOT contain full OTP values, raw tokens, full PII, or secrets (Ref: Doc 09 §Log Safety).

**Events to Log:**

| Event | Fields |
|-------|--------|
| Login attempt | `email` (masked), `user_id` |
| OTP requested | `email` (masked), `user_id` |
| Failed OTP attempt | `email` (masked), `user_id`, `attempt_count` |
| OTP verified | `email` (masked), `user_id` |
| Session refreshed | `user_id`, `session_id` |
| Logout | `user_id`, `session_id` |
| Session revoked | `user_id`, `session_id` |

**Log Format:**
```
slog.Info("otp_requested", "email", maskEmail(email), "user_id", userID)
```

**Data Masking Rules:**
- `john@gmail.com` → `j***@gmail.com`
- `08012345678` → `080****5678`
- Never log: full OTP values, raw tokens, full PII, secrets

**Acceptance Criteria:**
- [ ] All auth events logged via `log/slog`
- [ ] Emails masked as `j***@gmail.com`
- [ ] Logs do not contain full OTP values
- [ ] Logs do not contain raw tokens
- [ ] Logs do not contain full PII
- [ ] Logs do not contain secrets

---

### P2-23: CSRF Protection

**Description:**
Implement CSRF protection for the cross-domain architecture. If cookie-based auth is used for the refresh token, CSRF token validation is required on all unsafe methods (POST, PATCH, DELETE). SameSite cookie settings are defense-in-depth, not the only CSRF control (Ref: Doc 09 §CSRF Rules). If bearer-token-only strategy is chosen (no cookies for auth), CSRF middleware is not required, but tokens must not be stored in localStorage.

**Implementation Options:**

**Option A: Cookie-based refresh token + CSRF:**
1. CSRF token generated on login, stored in server session, sent to frontend
2. Frontend includes `X-CSRF-Token` header on all unsafe methods
3. Gin middleware validates CSRF token
4. SameSite cookie settings as defense-in-depth

**Option B: Bearer-token-only (no cookies):**
1. No CSRF middleware needed
2. Tokens must not be stored in localStorage (Ref: Doc 09 §CSRF Rules)
3. Refresh token managed via secure mechanism

**Security Considerations:**
- SameSite cookie settings are defense-in-depth, not the only CSRF control (Ref: Doc 09 §CSRF Rules)
- Unsafe methods (POST, PATCH, DELETE) must require CSRF validation if cookies are used
- If bearer tokens are used, tokens must not be stored in localStorage (Ref: Doc 09)

**Acceptance Criteria:**
- [ ] CSRF strategy is explicitly chosen and documented
- [ ] If cookie-based: CSRF token generated, validated on unsafe methods
- [ ] If bearer-only: no localStorage for tokens
- [ ] SameSite cookie settings configured as defense-in-depth
- [ ] All unsafe methods protected

---

### P2-24: Rate Limiting Middleware

**Description:**
Implement rate limiting middleware for auth endpoints and all write endpoints. Auth endpoints are high-risk attack surfaces that need strict rate limiting (Ref: Doc 09 §API Abuse Protection). All responses include rate limit headers. Rate limit events are logged for monitoring and alerting.

**Rate Limit Configuration:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/v1/auth/request-otp` | 5 per email | 1 hour |
| `POST /api/v1/auth/verify-otp` | 10 per email | 1 hour |
| All write endpoints | 100 per user | 1 minute |

**Response Headers (all responses):**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

**Behavior:**
- Returns `429` with error code `RATE_LIMITED` when limit exceeded
- Rate limit events are logged (Ref: Doc 09 §Events To Log)

**Acceptance Criteria:**
- [ ] Rate limiting middleware applied to auth endpoints
- [ ] `POST /auth/request-otp`: max 5 requests per email per hour
- [ ] `POST /auth/verify-otp`: max 10 attempts per email per hour
- [ ] All write endpoints: baseline rate limit per user
- [ ] Returns `429 RATE_LIMITED` when limit exceeded
- [ ] All responses include `X-RateLimit-*` headers
- [ ] Rate limit events logged

---

## Dependency / Sequencing Notes

1. **P2-01** (OTP columns) must be complete before P2-02/P2-03 (request/verify OTP endpoints).
2. **P2-02 and P2-03** are the core auth loop — they must work before any frontend auth pages (P2-12, P2-13).
3. **P2-07** (CORS) and **P2-08** (auth middleware) must be in place before frontend can make cross-domain requests. These can be built in parallel with the OTP endpoints.
4. **P2-09 and P2-10** (workspace endpoints) depend on P2-08 (auth middleware) for protected route resolution.
5. **P2-14 and P2-15** (axios/react-query/zustand setup) must be complete before P2-12/P2-13 (auth UI pages) can make API calls.
6. **P2-16** (dashboard shell layout) depends on P2-17 (scope toggle) and P2-21 (auth guard).
7. **P2-12 and P2-13** (login/verify UI) should be built and tested end-to-end with the Go API before P2-16 (dashboard shell) to confirm cross-domain auth works.
8. **P2-22** (audit logging) and **P2-23** (CSRF) are cross-cutting and should be integrated as the auth endpoints are built, not added as afterthoughts.
9. **P2-24** (rate limiting) should be applied to auth endpoints immediately — OTP endpoints are a high-risk attack surface (Ref: Doc 09 §API Abuse Protection).
10. The session flow creates both a `users` row and a `workspaces` row on first OTP request (P2-02). This means the `workspaces` migration from Phase 1 must already be applied.
11. **P2-06** (`GET /api/v1/session`) is critical for the frontend auth guard (P2-21) to validate tokens and hydrate state on page load.
