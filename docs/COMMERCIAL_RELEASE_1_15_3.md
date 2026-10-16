# FlowBiz One v1.15.3 — Realistic Demo History

Date: 2026-09-25

## Scope
- Historical Demo Import now accepts 4 files: Goods Receipts, Sales Orders, Sales Order Lines and Sales Invoices.
- Opening Stock Movement uses the business opening date.
- Historical Goods Receipts create Stock IN movements at their historical dates.
- Historical Sales Order Lines create Stock OUT movements at their historical delivery dates.
- Stock is simulated and validated chronologically before commit; negative historical stock is blocked.
- Stock Balance after import is consistent with Opening + GR − Sales Issue.
- Existing Sales / GP / Contribution formulas were not changed.

## UAT proof
A rollback UAT passed with Opening 1,000 + GR 500 − Sales Issue 600 = Ending Stock 900. The test confirmed 3 movement rows with correct historical dates and references.
