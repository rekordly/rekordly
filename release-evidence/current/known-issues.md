# Known Issues & Approved G2 Limitations

1. **Offline Queued Financial Confirmations (`offline.queued_writes.enabled=false`)**:
   - **Gate**: G1 (disabled server-side via `REKORDLY_OFFLINE_MAX_MODE=draft_only` and `feature_flags`).
   - **Mitigation / Workaround**: Users can read cached data and capture local drafts offline, then confirm online.
2. **Paid Live Paystack Checkout (`COMMERCIAL_MODE=controlled_beta`)**:
   - **Gate**: G1 (disabled until live Paystack keys, Nigerian legal/tax sign-off, and production Render/Neon tiers are active).
   - **Mitigation / Workaround**: Controlled beta cohort runs free under bounded entitlements.
3. **Cloud Provisioning & Legal Sign-Off**:
   - **Gate**: G2 / Pre-public-beta launch gate (Render paid web/worker, Neon production tier, independent off-site backup bucket, MFA on provider accounts, and Nigerian NDPA/tax legal review).
