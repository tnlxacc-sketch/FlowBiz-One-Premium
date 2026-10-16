# FlowStock Commercial UAT Checklist

Record tester, date, company, role, expected result, actual result, and evidence for every case.

## Tenant isolation

- Company A cannot list, open, export, or download Company B data.
- Company A cannot upload a POD into Company B's Storage path.
- A suspended company cannot open operational data or post a transaction.

## Access and roles

- Public signup is absent; an unprovisioned Auth account cannot access company data.
- Platform Admin creates a Company's first Admin, who must change the temporary password.
- Company Admin creates employees and assigns their roles; other roles cannot create accounts.
- Sales, Warehouse, Logistics, Owner, and Admin each see only their permitted menus and actions.
- User-limit enforcement blocks creation beyond the plan limit.

## End-to-end transaction

- Create a multi-line order.
- Receive stock and verify movement/balance.
- Partially issue, then complete issue without negative stock.
- Transfer stock and receive with both equal and variance quantities.
- Schedule delivery and confirm vehicle overlap is blocked.
- Upload POD and complete actual received quantities.
- Confirm invoice revenue, product cost, freight, other cost, GP, and GP percentage.
- Close a period and verify affected transactions are blocked; reopen with a reason.
- Retry a request ID and confirm no duplicate transaction.

## Documents and reports

- Upload PDF, JPEG, and PNG POD files up to 10 MB.
- Reject unsupported and oversized files.
- Open a POD through a short-lived signed URL.
- Verify that recent-window CSV files are labeled partial and KPI totals include the full selected period.
- Verify invoice detail pagination and customer summaries across more than 300 invoices.
- Verify a registered backup is required before year-end rollover, Master/User/Audit are preserved, and stock carries forward. Test restore and rollover only in an isolated database copy.
- Print the Profit report to PDF.

## Usability and recovery

- Desktop, tablet, and mobile layouts remain usable.
- Sorting preserves the visible data and works for text, date, and numeric columns.
- Admin can reset a user's temporary password; the first login requires a new password.
- Refresh and sign-out do not leave stale company data visible.


## Minimum Stock UAT

1. Edit Product Master and set Minimum Stock > 0.
2. Confirm Product Master retains the value after refresh.
3. Confirm Executive Dashboard shows `Stock ต่ำกว่า Minimum`.
4. Click the alert and confirm it opens Stock with the low-stock filter enabled.
5. Confirm only products whose total On Hand is below Product Minimum Stock are shown.
6. Untick the filter and confirm all stock rows return.
7. Set Minimum Stock to 0 and confirm the product is excluded from low-stock alerting.
8. Confirm Sales, GP, Contribution, Stock posting, receipt, issue, transfer, and stock-count calculations remain unchanged.


## v1.14.6 Safe Executive / Minimum Stock UAT

1. Login and confirm Dashboard, Orders, Warehouse, Stock, Delivery, Sales & Profit, Reports, Master Data, Users, Settings and Audit all open without JavaScript error.
2. Confirm Sales, Product Cost, Gross Profit, GP Margin, Contribution Profit and Contribution % match the pre-change baseline for the same filters.
3. Confirm Executive Dashboard shows one combined Sales + Contribution Profit chart.
4. Confirm Top Customer shows Sales and Contribution %.
5. Confirm Top Product Group shows Sales and Contribution %.
6. Edit Product Master and set Minimum Stock to a value >= 0; refresh and confirm it persists.
7. Confirm Executive alert `Stock ต่ำกว่า Minimum` opens Stock with the low-stock filter enabled.
8. Confirm Stock checkbox `แสดงเฉพาะ Stock ต่ำกว่า Min` can be turned on/off.
9. Confirm Minimum Stock does not reserve stock or change stock posting.
10. Confirm products with Minimum Stock = 0 are excluded from low-stock alerting.


## v1.14.9 Stock UI / Control Wiring UAT

1. Open Stock as ADMIN and confirm current Stock Balance rows appear.
2. Confirm Product / Warehouse search filters Stock Balance.
3. Tick `แสดงเฉพาะ Stock ต่ำกว่า Min` and confirm only products below Product Minimum Stock remain.
4. Untick the checkbox and confirm all Stock Balance rows return.
5. Confirm Stock Movement filters work: Warehouse, Product, Type, From Date, To Date.
6. Confirm `ล้างตัวกรอง` resets Warehouse / Product / Type / Date / Search / Low-Min filters.
7. Confirm Stock Movement shows In, Out, and `คงเหลือ` after each movement.
8. Confirm movement Balance After matches current Stock Balance rolled backward by later movements.
9. Confirm Export Movement contains In, Out, Balance After.
10. Confirm Export Stock contains Minimum Stock and low-stock status.
11. Confirm Download Stock / Export Movement / Send Report buttons are wired.
12. Static wiring audit: every `data-action` has a handler; every report/movement/search filter id has an event binding; all page functions referenced by navigation exist.


## v1.15.1 Searchable Dropdown UAT

1. Product selections allow typing Product Code or Product Name and show matching results.
2. Customer selections allow typing Customer Code or Customer Name.
3. Vendor / Supplier selections allow typing Vendor Code or Vendor Name.
4. Warehouse, Vehicle, Driver, Expense Type and other master-backed dropdowns use the same search behavior.
5. Report filters for Customer / Product / Warehouse / Vehicle remain connected to the existing report state and calculations.
6. Selecting a search result updates the underlying native select and triggers the existing change event; no business logic is duplicated in the search control.
7. Order line Product / Warehouse search still updates Available Stock warning correctly.
8. Goods Receipt Product / Warehouse / Vendor search still posts through the existing RPC unchanged.
9. Transfer Product / From Warehouse / To Warehouse search still uses the existing transfer flow.
10. Delivery Vehicle / Driver / Vendor search still uses the existing delivery flow.
11. Keyboard UAT: focus, type, Arrow Up/Down, Enter, Escape.
12. Mobile UAT: tap search field, type Thai/English/code, select result without horizontal overflow.
13. Short dropdowns such as Status, Month, Plan and Role remain normal native dropdowns unless they contain a large master list.


## v1.15.2 Backup / Restore Release Gate

1. Admin > สำรอง / เริ่มปีใหม่ displays Backup Archive / Restore Rehearsal / Disaster Recovery status.
2. Without a registered archive, status must be `ยังไม่มี / ยังไม่ผ่าน / ต้องทดสอบ`.
3. `admin_backup_restore_status()` must be accessible to ADMIN and OWNER only through authenticated role checks.
4. Run `scripts/backup-project.mjs` against a test copy and verify archive SHA-256, manifest, PostgreSQL dump list and POD hashes.
5. Restore that archive to a separate test target with `scripts/restore-rehearsal.mjs`.
6. Verify critical table counts match the manifest.
7. Verify Revenue / Product Cost / Freight / Other Cost match the manifest.
8. Verify POD metadata/object counts and hashes.
9. Confirm the source backup registry receives `restore_verified_at` and verification `{passed:true}` only after all restore checks succeed.
10. Refresh Admin status and confirm `DR READY`.
11. Confirm restore rehearsal refuses a target Supabase URL equal to the source URL.
12. Confirm YEAR_END rollover still requires the verified year-end SHA and is blocked if data changed after backup.


## v1.15.3 Realistic Demo History UAT

1. Reset Demo business data and upload Master 01–11.
2. Post Opening Stock dated 2026-06-01 with reference OPEN-2026-06-01.
3. Confirm Opening Stock Movement date displays 2026-06-01.
4. Open Realistic Demo History Import and select Historical GR / Orders / Order Lines / Invoices.
5. Preview must validate all Master codes and simulate Stock chronologically.
6. Preview must block any date sequence that would make Stock negative.
7. Commit must create Goods Receipts and RECEIPT Stock Movements using historical receipt dates.
8. Commit must create ORDER_ISSUE Stock Movements using historical delivery dates.
9. Stock Balance after import must equal Opening + Historical GR − Historical Order Issue.
10. Sales / Delivery / Invoice records must remain linked and historical dates preserved.
11. Stock Movement must show Opening / IN / OUT / Balance in chronological order.
12. Company-level Minimum Stock alert must match Ending Stock after all historical movements.
13. UAT rollback test passed: Opening 1,000 + GR 500 − Sales Issue 600 = Ending 900 with 3 historical movement rows and correct dates/references.


## v1.16.0 Stock Conversion / Repack UAT

1. WAREHOUSE and ADMIN can create a Repack / Stock Conversion batch.
2. SALES / LOGISTICS / OWNER cannot post Conversion.
3. One batch supports multiple From Product → To Product lines in one warehouse.
4. Each line requires Qty Out > 0 and Qty In > 0 and From ≠ To.
5. Source Available Stock is checked in UI and again in the database transaction.
6. Posting creates exactly one CONVERSION_OUT and one CONVERSION_IN movement per line under the same CV reference.
7. Conversion movement uses the selected business date.
8. Source stock can never become negative.
9. Conversion does not change Order / Delivery / Invoice / Revenue / Product Cost / GP / Contribution calculations.
10. Reverse requires a reason and creates reversal movements; original movements remain in Audit history.
11. Reverse is blocked if target stock is no longer sufficient.
12. Product / Warehouse referenced by Conversion is protected from physical Master deletion.
13. Demo Transaction Reset / All Business Data Reset clears Conversion records before clearing Master data.
14. Year-end rollover clears Conversion transaction history only after verified backup, then carries ending Stock to the new year.
15. Stock Movement filter includes Conversion OUT / IN / Reverse OUT / Reverse IN.
16. Login startup uses sequential query batches for stability; verify login and navigation through Dashboard / Warehouse / Stock after deployment.

## v1.17.0 Stock Count Policy / Manual Adjustment / Release Gate UAT

1. ADMIN can set Stock Count Policy to AUTO_ADJUST, REVIEW_ONLY, or MANUAL_ADJUST.
2. A Stock Count snapshots its adjustment policy when the count starts; later setting changes do not alter an existing count.
3. AUTO_ADJUST: Admin Final creates COUNT_ADJUSTMENT movements for non-zero variance and updates On Hand atomically.
4. AUTO_ADJUST must never reduce On Hand below Allocated quantity.
5. REVIEW_ONLY: Admin Final records the completed count and variance without changing Stock.
6. MANUAL_ADJUST: Admin Final records the count without changing Stock and allows creating a Stock Adjustment from the finalized variance.
7. Stock Adjustment can contain multiple lines in one warehouse and requires a reason for every line.
8. A decrease checks Available Stock = On Hand − Allocated in both UI and database transaction.
9. Only ADMIN can Post a submitted Stock Adjustment.
10. Posting creates MANUAL_ADJUSTMENT Stock Movements and updates Stock atomically.
11. Repeating the same completed Post/Final request is idempotent and does not duplicate Stock Movement.
12. Reverse Stock Adjustment requires a reason, preserves the original movement/audit history, and creates MANUAL_ADJUSTMENT_REVERSAL movements.
13. Reverse is blocked when the resulting Stock would be below Allocated quantity.
14. Closed periods block Stock Adjustment Post/Reverse for the closed business month.
15. Repack requires Qty Out = Qty In, matching UOM, different From/To products, and sufficient Available Stock.
16. Repack Reverse is blocked when target Available Stock is insufficient.
17. Source control contains the production migrations for Repack, Stock Count Policy, Stock Adjustment lifecycle, allocation controls, and required FK indexes.
18. Supabase integrity check returns zero negative On Hand, zero Allocated > On Hand, zero duplicate Stock Balance keys, zero duplicate Order/Invoice numbers, and zero orphan transaction lines.
19. Supabase performance advisor has no unindexed foreign-key findings for Stock Adjustment or Repack.
20. GitHub Pages deployment must run `tests/ui-audit.mjs` and `tests/v117-regression.mjs`; deployment is blocked when either test fails.
21. A 500,000-row synthetic database aggregation benchmark is recorded separately as a capacity signal; it is not a substitute for customer-like end-to-end load testing.

