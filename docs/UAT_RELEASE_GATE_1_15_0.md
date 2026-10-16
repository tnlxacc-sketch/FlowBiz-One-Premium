# FlowBiz One — UAT Release Gate v1.15.0

Date: 2026-09-24

## Decision

**Status: COMMERCIAL PILOT READY WITH CONDITIONS**

Not yet approved as unrestricted production/enterprise release.

## Production deployment

- GitHub Pages deployment v1.15.0: PASS
- app.js syntax: PASS
- Required page functions: PASS
- data-action handler wiring: PASS (43 actions, 0 missing)
- report/movement/search filter wiring: PASS (15 controls, 0 unwired)
- invalid single-selector `.forEach` pattern: PASS (0 remaining)
- Startup query concurrency reduced to 3 requests per chunk to reduce PostgREST timeout pressure.

## Database integrity

- Orders: 52
- Invoices: 52
- Delivery trips: 52
- Stock balance rows: 40
- Negative stock rows: 0
- Duplicate stock keys: 0
- Orphan order lines: 0
- Orphan invoice-order relationships: 0
- Orphan delivery trip lines: 0
- Negative invoice amount rows: 0
- Delivered orders without invoice: 0
- Invalid negative Minimum Stock: 0

## Calculation reconciliation

For 2026, direct Invoice totals and report_kpis match:

- Revenue: 6,839,924.67
- Product Cost: 5,136,099.68
- Freight Cost: 265,540.00
- Other Cost: 115,400.28
- Invoice count: 52
- Monthly summary sales total: matches direct Invoice revenue
- Customer summary sales total: matches direct Invoice revenue
- Contribution alert threshold: 15%
- Low Contribution invoices: 8
- KPI low-contribution count and drill-down total: both 8

## Transaction UAT — executed with rollback

PASS:
- Sales → Warehouse Issue → Delivery → Invoice
- Stock Transfer create → receive
- Goods Receipt
- Opening Stock
- Stock Count start → submit → Admin Final
- Contribution threshold change
- Period Close → Reopen
- Role restriction: OWNER blocked from ADMIN-only action
- Product Master + Minimum Stock create/edit/delete
- Referenced Product delete → deactivated instead of physical delete
- Referenced Warehouse delete → deactivated instead of physical delete

## Master Data matrix — executed with rollback

PASS:
- Customer
- Product Group
- Product
- Warehouse
- Supplier
- Vehicle Type
- Vehicle
- Driver
- Expense Type

## Stock UI / movement controls

- Stock page refreshes Stock Balance and Movement from database on entry.
- Stock Movement contains In / Out / Balance After.
- Movement filters are wired: Warehouse, Product, Type, From Date, To Date, Search.
- Reset Filter action is wired.
- Stock Below Minimum checkbox is wired.
- Export Movement contains Balance After.
- Export Stock contains Minimum Stock and low-stock status.

## Security review

Supabase Security Advisor still reports items requiring production hardening:

- Leaked password protection disabled.
- 3 private helper functions with mutable search_path.
- SECURITY DEFINER warning on exposed RPCs. Most business RPCs were checked and contain role/auth/platform guards, but the exposed RPC surface should receive a final least-privilege review before unrestricted production sales.
- Private platform_admins / tenant_invites have RLS enabled without policies; this appears aligned to the current private/RPC-only design but must remain documented.

## Performance / scale

Recent production logs showed PostgREST timeout-manager events before v1.15.0. Startup concurrency has now been reduced, but a controlled browser/load test after deployment is still required.

No controlled 500,000-record/year benchmark has been completed. Do not market that scale as proven.

## Remaining release gates before unrestricted production sale

1. Browser E2E regression pass using real ADMIN / OWNER / WAREHOUSE / SALES / LOGISTICS accounts.
2. Confirm no new PostgREST timeout events during that browser pass.
3. Backup + actual restore rehearsal.
4. Enable leaked-password protection where the selected Supabase plan supports it.
5. Final SECURITY DEFINER / EXECUTE privilege review.
6. Controlled high-volume benchmark before making scale claims.

## Commercial recommendation

v1.15.0 is suitable for a controlled 30-day paid Business Pilot / UAT with a dedicated customer Supabase project. Do not yet label it unrestricted enterprise production-ready.