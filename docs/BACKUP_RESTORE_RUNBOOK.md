# FlowBiz One — Backup, Restore & Disaster Recovery Runbook

Version: 1.15.2  
Purpose: Production release gate for customer deployments.

## Commercial policy

Each customer uses a dedicated Supabase project owned and paid by the customer.

Production go-live requires all of the following:

1. Customer/provider database backup is enabled according to the customer's selected Supabase plan.
2. A FlowBiz One application archive has been created with `scripts/backup-project.mjs`.
3. The archive SHA-256 has been verified and registered in `private.backup_registry`.
4. The latest archive has been restored to a **separate test environment** with `scripts/restore-rehearsal.mjs`.
5. Restore verification shows matching critical table counts, financial totals and POD metadata/files.
6. Admin Data Management page shows **DR READY**.

Do not restore a rehearsal archive into the production project.

## Backup types

- `PRE_GO_LIVE` — mandatory before first customer production go-live.
- `MONTHLY` — recommended operational archive.
- `YEAR_END` — mandatory before year-end rollover.
- `MANUAL` — operator-initiated archive before high-risk maintenance.

## Required operator tools

- Node.js 20+
- PostgreSQL client tools: `pg_dump`, `pg_restore`, `psql`
- `tar`
- Sufficient encrypted disk space

Secrets must be provided as environment variables and must never be committed to Git.

## Create a commercial backup

Required environment variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMPANY_ID`
- `BACKUP_DIRECTORY`
- `BACKUP_KIND` = `PRE_GO_LIVE`, `MONTHLY`, `YEAR_END`, or `MANUAL`
- `PERIOD_LABEL` — optional human-readable period
- `CLOSED_YEAR` — required when `BACKUP_KIND=YEAR_END`

Run:

`node scripts/backup-project.mjs`

The script:

- creates a custom-format PostgreSQL dump;
- verifies the dump can be listed by `pg_restore`;
- downloads private POD files for the company;
- hashes database and POD files;
- records critical table counts and financial totals in the manifest;
- checks that Audit/POD metadata did not change during the backup;
- creates and validates a `.tar.gz` archive;
- registers the archive in `private.backup_registry`;
- for `YEAR_END`, also registers it in `private.year_end_backups`.

A failed backup is never registered as verified.

## Restore rehearsal

Use a separate disposable test database/project.

Required environment variables:

- `ARCHIVE_FILE`
- `ARCHIVE_SHA256`
- `TARGET_DATABASE_URL`
- `TARGET_SUPABASE_URL`
- `TARGET_SERVICE_ROLE_KEY`
- `SOURCE_DATABASE_URL`
- `RESTORE_CONFIRM=RESTORE_TO_TEST_ENVIRONMENT`

Run:

`node scripts/restore-rehearsal.mjs`

Safety behavior:

- refuses an archive whose SHA-256 does not match;
- refuses a target with the same Supabase URL as the source recorded in the manifest;
- performs `pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl`;
- recreates/restores POD objects in the target private bucket;
- verifies critical table counts;
- verifies Revenue, Product Cost, Freight and Other Cost totals;
- verifies POD metadata/object count;
- records proof back into the source `private.backup_registry` only when all checks pass.

## Admin screen interpretation

Admin > สำรอง / เริ่มปีใหม่ displays:

- **Backup Archive = VERIFIED** — at least one registered archive exists.
- **Restore Rehearsal = PASSED** — the latest archive has a successful restore proof.
- **Disaster Recovery = DR READY** — latest backup and restore proof both exist and verification passed.

If the screen says **ต้องทดสอบ**, production go-live is not approved.

## Year-end rollover

Use:

`node scripts/backup-year.mjs`

This is a wrapper around the commercial backup engine with `BACKUP_KIND=YEAR_END`.

Only after the year-end archive is registered may Admin run the existing year-end rollover. The database function still checks:

- year is finished;
- no new-year transactions exist;
- no open orders/trips/transfers/counts;
- no allocated/negative stock;
- backup hash exists and has not been consumed;
- Audit data has not changed after backup.

## Recovery objective

The product does not promise a fixed RPO/RTO without a customer-specific infrastructure agreement. The proposal must state the backup frequency and recovery objective selected for that customer.

## Release gate

Before a customer production go-live, save evidence of:

- backup archive SHA-256;
- backup timestamp;
- restore target fingerprint;
- restore verification timestamp;
- table-count reconciliation;
- financial-total reconciliation;
- POD reconciliation;
- successful login and smoke transaction in the restored test environment.

This evidence belongs in the customer UAT / Go-live pack.
