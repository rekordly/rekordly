# Antigravity Delegation — Authentication Frontend Functionality

## Boundary

Implement only the remaining `AUTH-FE-01` authentication functionality in an isolated worktree. The primary agent owns `AUTH-BE-06`, onboarding, the app shell and final integration.

Do not redesign the application. The corrected frontend on `master` is authoritative.

Forbidden changes:

- `src/app/globals.css`;
- shared UI components under `src/components/ui/**`;
- authentication layout composition;
- colors, shadows, radii, typography, spacing system or responsive split;
- logo or illustration assets;
- any Go, SQL, Docker, worker or backend file.

## Git setup

- Start from current `master` after commit `091f16c` and the following document-replacement commit.
- Branch: `antigravity/auth-fe-01-functional`.
- Use a separate worktree.
- Do not merge into `master`.
- Commit each task separately and return commit hashes for review.

## Required reading

- `AGENT_RULES.md`
- `planning/11-design-guide.md`
- `planning/v2-authentication-implementation-tasks.md`, section 11
- `planning/v2-system-blueprint/01-registration-authentication-and-onboarding.md`
- existing `implementation/web/src/lib/api/**`
- existing `implementation/web/src/lib/auth/**`
- existing corrected authentication screens and UI wrappers

## Task 1 — OTP and magic-link screens

Implement functional screens/routes for:

- registration and sign-in OTP entry;
- six-digit paste and keyboard entry;
- resend cooldown with generation-safe behavior;
- expired, invalid, consumed and rate-limited states;
- magic-link requested state;
- non-consuming magic-link inspection;
- explicit confirmation action;
- successful pre-auth/full-session routing;
- required password creation after a new/passwordless account.

Use the existing API endpoints and client conventions. Proof tokens stay in memory, never local/session storage. Tokens must be removed from the visible URL when safely captured. Do not put email, OTP, link token or password into logs/analytics.

## Task 2 — Google authentication and account-link states

Implement functional screens/controller behavior for:

- requesting the Google authorization URL;
- redirect/loading/callback states;
- denied, unavailable and invalid-callback states;
- existing linked-account sign-in;
- new Google account routing to required password creation;
- matching-email account-link proof using the existing password-confirmation endpoint;
- safe allowlisted return routing.

Do not add another UI library or authentication SDK. Use the backend contract already present under `/api/v1/auth/google/**`.

## Quality gates

- TypeScript type-check.
- ESLint.
- Behavior-focused unit tests; do not assert arbitrary class strings, exact widths or implementation formatting.
- Next.js production build.
- Browser verification on 390px mobile and desktop, light and dark.
- Keyboard submission and visible focus.
- No horizontal overflow.
- No edits outside `implementation/web/**` except the final handoff file.

## Handoff

Return the worktree, branch, two commit hashes, changed files, routes, API mappings, test/build results, screenshots and unresolved assumptions. Explicitly confirm that shared UI/design files and all backend files were untouched.
