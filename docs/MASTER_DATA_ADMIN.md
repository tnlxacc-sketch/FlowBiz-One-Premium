# FlowBiz One - Master Data Administration

Date: 2026-09-24
Release: v1.14.2

## Purpose

FlowBiz One must not depend on file upload only for daily master maintenance. Company Admin can now manage operational master data directly from the screen while retaining bulk import/export for setup and large changes.

## Supported master screens

- Customer
- Product Group
- Product
- Warehouse
- Vendor / Supplier
- Vehicle Type
- Vehicle
- Driver
- Monthly Product Cost
- Cost & Expense Type

## Standard controls

Every supported master should follow the same control pattern:

| Control | Rule |
|---|---|
| Add | Admin can create a new master from the screen. |
| Edit | Admin can update code/name/detail fields from the screen. |
| Activate / Deactivate | If no longer used, deactivate instead of deleting where appropriate. |
| Controlled Delete | Delete only when the master has never been used in transactions. |
| Auto Deactivate | If delete is requested but historical usage exists, the system deactivates instead of deleting. |
| Import | Bulk import remains available for initial setup and mass maintenance. |
| Template | Admin can download a CSV template per master type. |
| Export | Admin can export the current master list for review. |
| Audit | Create, update, deactivate, and delete actions are written to audit logs. |

## Controlled delete principle

Do not physically delete a master once it has been referenced by transactions. This protects historical reports, Stock Movement, Invoice profitability, POD records, delivery history, and audit trails.

Examples:

| Master | If never used | If already used |
|---|---|---|
| Warehouse | Delete allowed | Deactivate only |
| Product | Delete allowed | Deactivate only |
| Customer | Delete allowed | Deactivate only |
| Vehicle | Delete allowed | Deactivate only |
| Driver | Delete allowed | Deactivate only |

## Reference checks

The backend RPC checks transaction references before deleting:

- Customer: Orders, Invoices
- Product: Order Lines, Stock Balances, Stock Movements, Monthly Cost, Stock Count Lines, Transfer Lines, Delivery Trip Lines
- Warehouse: Order Lines, Stock Balances, Stock Movements, Receipts, Stock Counts, Transfers, Expense Rates
- Vendor/Supplier: Delivery Trips
- Vehicle: Delivery Trips
- Driver: Delivery Trips
- Vehicle Type: Vehicles, Expense Rates
- Expense Type: Expense Rates, Trip Expenses

## User guidance

Use **Deactivate** when the master should no longer appear for new transactions but must remain available for history.

Use **Delete** only for masters created by mistake and not yet used.

Use **Import** for initial setup or large bulk changes.

## UAT checklist

1. Add a new Warehouse from screen.
2. Edit the Warehouse name.
3. Deactivate the Warehouse.
4. Reactivate the Warehouse.
5. Delete a newly-created unused Warehouse.
6. Attempt delete on a used Warehouse and confirm the system deactivates instead.
7. Repeat representative tests for Customer, Product, Vehicle, Driver, Vendor, and Expense Type.
8. Confirm duplicate code validation.
9. Confirm Audit Log records the action.
10. Confirm old transactions still show historical master names.

## Commercial note

This feature is required for commercial readiness. A paid customer should be able to maintain master data without depending on technical support or file uploads for every change.


## Hotfix 2026-09-24 19:50

Production UAT found an error when deleting a managed master:

`record "ctx" has no field "user_id"`

Root cause: `private.require_role()` returns `company_id` and `app_role`, but the new master audit RPC attempted to read `ctx.user_id`.

Fix applied:
- Master create/update/delete/deactivate audit actor now uses authenticated `auth.uid()`.
- Product Group now has an `active` flag so it follows the same activate/deactivate/controlled-delete rule as other masters.
- Database validation confirmed both master RPCs use `auth.uid()`.
- Database validation confirmed Product Group status control is available.

Regression test required:
1. Create an unused Warehouse.
2. Delete it and confirm physical delete succeeds.
3. Attempt to delete a Warehouse already referenced by transactions and confirm it becomes inactive instead.
4. Check Audit Log for the acting user.


## Product Minimum Stock

Product Master includes **Minimum Stock** as a non-negative numeric threshold.

Rules:
- Minimum Stock is maintained by Company Admin in Product Master.
- Value 0 means no minimum threshold is configured.
- Low-stock status compares total current On Hand for the product across company warehouses against Product Minimum Stock.
- Executive Dashboard shows the number of products below Minimum and can drill directly to Stock.
- Stock menu includes a checkbox **แสดงเฉพาะ Stock ต่ำกว่า Min**.
- This addition does not change stock posting, allocation, issue, receipt, transfer, or stock-count calculation rules.


## Minimum Stock (v1.14.6)

- Product Master has `Minimum Stock` as a non-negative company-wide threshold.
- `0` means no minimum threshold is configured.
- Low-stock status compares total On Hand across all company warehouses with Product Minimum Stock.
- This field is used only for Executive alerting and Stock filtering.
- It does not change inventory posting, reservation, allocation, receipt, issue, transfer, or stock-count calculations.
