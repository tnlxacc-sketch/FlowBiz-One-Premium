# FlowBiz One Release v1.14.6

Status: SAFE EXECUTIVE / MINIMUM STOCK RELEASE

## Scope
- Combined Sales + Contribution Profit chart on Executive Dashboard.
- Executive attention panel beside the chart.
- Top Customer: Sales + Contribution %.
- Top Product Group: Sales + Contribution %.
- Product Master: Minimum Stock.
- Stock below Minimum executive drill-down.
- Stock below Min checkbox filter.

## Calculation protection
No changes were made to the existing formulas for Sales, Product Cost, Gross Profit, GP Margin, Contribution Profit, Contribution %, Actual Received, Freight, or stock posting.

## Pre-release checks
- app.js syntax: passed.
- master-admin-enhancements.js syntax: passed.
- Core page functions: present.
- loadData unchanged from recovery baseline.
- invoiceGross unchanged from recovery baseline.
- invoiceContribution unchanged from recovery baseline.
- profitBreakdown unchanged from recovery baseline.
- Database integrity: no negative stock, duplicate stock keys, or orphan order/invoice/trip line relationships found.

Backup before release: backup/pre-approved-exec-minstock-20260924