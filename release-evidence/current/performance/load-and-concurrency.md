# Performance & Concurrency Evidence

- **Concurrent Idempotency**: `TestBP19_G1_ModuleEnablementAndExtremeValues` executed 6 concurrent goroutines submitting identical `idempotency_key` + `payload_hash` sync commands, producing exactly `1` draft row.
- **DB Pool & Timeouts**: `pgxpool` bounded (`DATABASE_MAX_CONNS` 1–50, `DATABASE_CONNECT_TIMEOUT=5s`, `DATABASE_HEALTH_TIMEOUT=2s`), HTTP server timeouts (`ReadHeaderTimeout=5s`, `ReadTimeout=15s`, `IdleTimeout=60s`).
- **Live Health Endpoints**: `GET /health/live` and `GET /health/ready` verified against running `rekordly-api` container.
