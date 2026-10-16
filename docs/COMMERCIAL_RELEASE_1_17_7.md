# FlowBiz One v1.17.7 — Self-Service Ready / Sales Demo Baseline

Date: 2026-09-27
Status: PROD BASELINE
Purpose: Main commercial demonstration baseline and future development reference.

## Release scope

This release keeps the existing v1.17 transaction logic and adds a self-service support layer designed to reduce direct support dependency.

Included:

1. Actionable `? วิธีใช้` on operational and management pages.
2. Error guidance with cause, recommended action, and what not to do.
3. First-login checklist by role: SALES, WAREHOUSE, LOGISTICS, WAREHOUSE_LOGISTICS, OWNER, ADMIN.
4. Cache/version alignment to v1.17.7 for `app.js` and the self-service enhancement layer.
5. Existing core transaction logic remains unchanged.

## Automated deployment gate

GitHub Pages workflow run 230 passed all deployment steps:

- UI audit: PASS
- v1.17 regression: PASS
- Configure Pages: PASS
- Upload Pages artifact: PASS
- Deploy GitHub Pages: PASS

The UI audit verified:

- 20 pages rendered
- 55 action references
- 17 navigation references
- 5 profit views
- 2 profit formulas
- GP Margin present
- Count period filter present
- Demo Data Management present
- Master Import present
- Opening Stock Import present
- Controlled Vehicle Type present
- Owner stock combined/by-warehouse views present
- Owner stock-count view read-only
- Admin-only account creation
- 91 visible buttons wired
- Filters tested: year, warehouse, customer, count-period, search, sort-binding

## Regression gate coverage

The v1.17 regression gate verifies at minimum:

- Stock Adjustment menu/route and lifecycle
- Repack / Conversion menu/route and lifecycle
- Count policies: AUTO_ADJUST / REVIEW_ONLY / MANUAL_ADJUST
- Available-stock protection for Adjustment and Repack
- Reverse lifecycle and movement labels
- Period close guard
- Idempotency checks
- Adjustment / Repack performance indexes
- Self-service signup remains disabled
- Report Center remains available
- Historical Demo Import remains available
- Minimum Stock TOTAL / BY_WAREHOUSE policy
- Warehouse Minimum upload/replace flow
- Warehouse Minimum fallback to Product Master

## Database UAT snapshot

Read-only production checks on 2026-09-27:

- Database size: 26 MB
- Database read-only: OFF
- Orders: 1,000
- Order Lines: 3,000
- Invoices: 1,000
- Delivery Trips: 1,000
- Stock Movements: 3,771
- Negative On Hand rows: 0
- Negative Allocated rows: 0
- Allocated > On Hand rows: 0
- Duplicate Order No.: 0
- Duplicate Invoice No.: 0

## Commercial demo positioning

Use v1.17.7 as the main sales demonstration baseline.

Primary demo flow:

1. Executive Dashboard
2. Sales & Profit 360°
3. Customer 360°
4. Delivery Performance
5. Stock Summary / Minimum Stock
6. Drill down to Invoice / Product / Customer / Warehouse
7. Show role-based operations only if the prospect asks for process detail

## Support-readiness model

The expected support path is:

Quick Guide by Role → In-app `? วิธีใช้` → Full User Manual → Company Admin → External Support

Users should prepare screenshot + document number + time + latest action before escalating.

## Baseline rule

From this point onward, all new development must start from:

**PROD BASELINE: FlowBiz One v1.17.7 — Self-Service Ready**

A future version becomes the new baseline only after:

1. code change completed;
2. version incremented;
3. automated UI audit passes;
4. regression gate passes;
5. GitHub Pages deploy succeeds;
6. relevant UAT evidence is recorded.

Do not refer to an untested development commit as the production baseline.
