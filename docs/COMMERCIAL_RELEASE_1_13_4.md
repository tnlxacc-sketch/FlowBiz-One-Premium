# FlowStock / FlowBiz Commercial Closeout — v1.13.4

Date: 2026-09-24

## Release decision

**Status: COMMERCIAL PILOT READY — FIRST CUSTOMER**

This release may be sold to the first customer under a paid Implementation + Subscription agreement, using a dedicated customer Supabase project/database and a controlled UAT/Go-live process.

It is **not** marketed as an unlimited-scale enterprise platform. A 500,000-sales-record/year benchmark has not yet been executed and must not be claimed in sales material.

## Commercial offer baseline

- Implementation & Go-live: THB 199,000
- Software subscription / maintenance / support: THB 14,900 per month
- Minimum term: 12 months
- Customer cloud/database: customer-owned and customer-paid directly
- Custom development / ERP integration: quoted separately
- Source code / product IP: excluded from Implementation fee
- Customer business data: customer-owned

## Release checks completed

- GitHub Pages deployment for v1.13.4: successful
- Configurable Contribution alert policy: active
- Contribution alert now follows selected year/month and drills down to matching invoices
- Current DEMO data: 52 orders, 52 invoices, 52 trips
- Negative stock rows: 0
- Negative invoice financial values: 0
- Completed trips without completion timestamp: 0
- Delivered orders without invoice link: 0
- Orphan invoice/order/trip/order-line relationships checked: 0
- Duplicate stock balance keys checked: 0
- Public operational tables: RLS enabled

## Security note

Supabase Security Advisor currently reports:
- Leaked-password protection is disabled. This must be enabled for each paying-customer production project where the selected Supabase plan supports it.
- SECURITY DEFINER RPC warnings are expected for the application RPC design, but every production RPC must continue to enforce application role/company checks internally.
- Private platform tables have RLS enabled without public policies by design; they are not intended for direct client-table access.

Before every customer Go-live:
1. Run Security Advisor.
2. Run Performance Advisor.
3. Verify role/company isolation with two-company UAT.
4. Enable MFA for Supabase/GitHub owners.
5. Review Auth/password policy and SMTP/recovery configuration.
6. Test backup and restore in an isolated copy.

## First-customer deployment rule

Use:
- One core codebase
- One deployment/configuration per customer
- One dedicated Supabase project/database per customer
- Customer owns and pays the production Supabase account
- Company Admin manages end users
- No public/self-service signup

## Required paid-pilot UAT

The first customer must pass:
- Login / temporary password / role access
- Sales Order create/edit
- Stock receive/issue and no-negative-stock control
- Warehouse transfer
- Delivery scheduling and vehicle conflict control
- POD / actual received quantity
- Cost, freight, other expense, GP and Contribution
- Contribution threshold and drill-down
- Report filters / CSV / print
- Period close/reopen
- Duplicate-submit/idempotency control
- Backup registration + restore rehearsal
- Desktop/tablet/mobile usability

## Capacity statement

Current build is suitable for first-customer commercial pilot and normal operational volumes represented by the implemented paginated/server-side reporting design.

Do **not** promise “500,000 sales records/year proven” until a controlled benchmark is completed. For large-volume prospects, include a sizing/performance test in the implementation scope before final production acceptance.

## Closeout

Commercial baseline: **v1.13.4 — COMMERCIAL PILOT READY**

Next product work is driven by:
1. First-customer UAT findings
2. Production security hardening per customer
3. 500k-record benchmark before making that scale claim
4. Multi-customer control center when customer count justifies it
