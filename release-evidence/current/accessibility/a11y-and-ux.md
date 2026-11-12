# Accessibility & UX Evidence

- **Keyboard & Screen Reader Support**: Native `<form onSubmit>`, `aria-live="polite"` status banners (`NetworkBanner`), field-associated error labels, and semantic `StatusPill` / `Alert` components.
- **Precise State Language**: Enforced via `PRECISE_STATE_LABELS` (`Pending sync`, `Accepted by email provider`, `Opened WhatsApp/share options`, `Link opened`, `Recoverable until`).
- **Responsive & Low-Bandwidth**: Mobile `RecordCard` layouts across all `DataView` surfaces and service-worker static asset caching with `/offline` fallback.
