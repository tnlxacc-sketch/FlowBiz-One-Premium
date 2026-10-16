# FlowBiz One v1.15.2 — Commercial DR Readiness

Date: 2026-09-25

## Scope

- Added a commercial backup registry independent from year-end rollover.
- Added Admin Backup & Restore Readiness status.
- Added `scripts/backup-project.mjs` for PRE_GO_LIVE / MONTHLY / YEAR_END / MANUAL archives.
- Added `scripts/restore-rehearsal.mjs` for test-environment restore and reconciliation.
- Year-end backup now uses the same commercial backup engine.
- Added DR release-gate documentation.

## Business logic protection

No Sales, Stock, Delivery, GP, Contribution, allocation, issue, receipt, transfer, stock-count, or invoice calculation was changed.

## Current demo environment

The current demo project has no registered commercial archive yet, therefore its Admin screen correctly reports:

- Backup Archive: not yet verified
- Restore Rehearsal: not yet passed
- Disaster Recovery: not yet DR READY

This is deliberate. DR READY must only appear after a real archive is created and restored to a separate test environment.

## Production sale rule

The software package is commercially prepared for backup/restore operations. A customer production go-live remains conditional on one successful restore rehearsal for that customer's environment.
