# Backup & Restore Rehearsal Evidence

- **Automated Rehearsal (`TestBP19_G0_DeletionGraceRestoreAndBackupRehearsal` & `TestBlueprint17_AdminOpsFlagsMaintenanceReconcileAndBackup`)**:
  - Verified `RecordBackupRehearsal` checksum logging, RPO/RTO tracking (`rpo_seconds=30`, `rto_seconds=90`), posted journal reconciliation (`unbalanced_journals_count = 0`), and `deletion_tombstones` replay count.
- **Migration Compatibility**: Forward-only migrations `000001` through `000057` applied cleanly via `rekordly-migrate` without deleting or resetting database volumes.
