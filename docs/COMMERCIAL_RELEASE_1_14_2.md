# FlowBiz One Commercial Closeout - v1.14.2

Date: 2026-09-24

## Release decision

**Status: COMMERCIAL PILOT READY - Managed Master Data**

This release may be used for a first-customer paid pilot under the Implementation + Subscription model. The release keeps the commercial positioning as FlowBiz One and adds screen-based Master Data administration.

## What changed from v1.13.4

- Rebranded customer-facing shell to FlowBiz One.
- Added premium UI layer for Login, shell, cards, tables, filters, executive dashboard, Sales & Profit, and Delivery Performance.
- Added managed Master Data screen behavior:
  - Add from screen
  - Edit from screen
  - Activate / deactivate
  - Controlled delete
  - Export
  - Download template
  - Bulk import still available
- Added backend RPC controls:
  - `admin_upsert_master`
  - `admin_delete_master`
- Added audit logging for master create/update/delete/deactivate actions.
- Added Product Group active flag to support consistent activation control.

## Why this matters commercially

A customer paying for a high-value system will expect the Company Admin to maintain master data without asking the vendor to upload files for every change.

The commercial baseline now supports both:

1. **Daily maintenance from screen** - add/edit/activate/deactivate/delete with control.
2. **Bulk maintenance by file** - template, import, and export for initial setup and large updates.

## Controlled delete rule

If a master has been used in transactions, the system must not physically delete it. Instead, it deactivates the master to preserve historical reports and transaction traceability.

## Commercial offer baseline

- Implementation & Go-live: THB 199,000
- Software subscription / maintenance / support: THB 14,900 per month
- Minimum term: 12 months
- Customer cloud/database: customer-owned and customer-paid directly
- Custom development / ERP integration: quoted separately
- Source code / product IP: excluded from Implementation fee
- Customer business data: customer-owned

## Still not claimed

Do not market as “500,000 sales records/year proven” until a controlled benchmark is completed.

## UAT additions for first customer

The first customer UAT must include:

- Add/Edit/Deactivate/Delete unused Warehouse
- Delete used Warehouse should deactivate, not delete
- Add/Edit/Deactivate Product
- Add/Edit Customer
- Add/Edit Vehicle, Driver, Vendor
- Export master data
- Download master template
- Confirm duplicate code is blocked
- Confirm Audit Log records actions

## Release baseline

Commercial baseline: **v1.14.2 - COMMERCIAL PILOT READY + Managed Master Data**


### Production hotfix

A managed-master UAT defect was fixed on 2026-09-24:
- Fixed audit actor lookup in `admin_upsert_master` and `admin_delete_master`.
- Added/confirmed Product Group soft-delete status support.
- No Sales, Stock, Delivery, Profit, or workflow calculation logic was changed.
