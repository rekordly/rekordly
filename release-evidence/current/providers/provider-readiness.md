# Provider Readiness & Failure Evidence

- **Resend / Email**: HMAC webhook signature verification, duplicate webhook deduplication, bounce suppression (`TestBlueprint14_NotificationsOutboxArtifactsSharingAndEmail`), and financial posting independence from delivery verified.
- **Cloudinary / Private Storage**: Quarantine scanning, private delivery separation for sensitive filenames, and signed upload/download intents verified (`TestBlueprint14_FilesQuarantineLinkingAndDeletion`).
- **Gemini / DeepSeek AI**: Timeout/fallback orchestration and draft-only enforcement verified (`internal/ai`, `TestBlueprint12`).
- **Paystack**: Webhook HMAC-SHA512 signature verification, replay protection, and client price-tampering rejection verified (`TestBlueprint13`).
