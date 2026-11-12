# Security, Abuse & Privacy Evidence

- **Tenant & Space Isolation**: Verified Business staff cannot read owner Personal settings, exports, or security history (`TestBP19_G0_TenantAndPersonalBusinessIsolation`).
- **Log & Analytics Redaction**: Verified `RedactSensitiveValue` strips Bearer tokens, OTPs, and webhook signatures; `ValidateAnalyticsProperties` rejects financial amounts, narrations, emails, OTPs, and tokens.
- **CSV Formula Injection**: Verified `SanitizeCSVCell` neutralizes leading `=`, `+`, `-`, `@` characters.
- **HTTP Security Headers**: Verified `X-Frame-Options: DENY`, `Content-Security-Policy`, `Referrer-Policy: same-origin`, `Strict-Transport-Security`, and `X-Content-Type-Options: nosniff` in `next.config.ts`.
- **Recent Auth & Support Boundaries**: Verified `RECENT_AUTH_REQUIRED` on contacts, exports, ownership transfers, and deletions; verified scoped, revocable support access grants with zero silent impersonation.
