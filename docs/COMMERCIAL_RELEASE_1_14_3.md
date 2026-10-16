# FlowBiz One Commercial Closeout - v1.14.3

Date: 2026-09-24

## Release decision

**Status: COMMERCIAL PILOT READY - Executive Analytics + Minimum Stock**

## Changes in v1.14.3

- Executive Dashboard:
  - Combined Sales and Contribution Profit into one chart.
  - Moved the executive attention panel beside the main chart.
  - Added Stock below Minimum as a drill-down alert.
  - Top Customer now shows Sales and Contribution %.
  - Top Product Group now shows Sales and Contribution %.
- Product Master:
  - Added Minimum Stock.
  - Non-negative values only.
  - Value 0 means no alert threshold.
- Stock:
  - Added Minimum Stock column and low-stock status.
  - Added one-click filter for Stock below Minimum.
  - Executive Stock Summary includes low-stock products.

## Calculation protection

No business calculation was intentionally changed in this release.

The existing logic remains the source of truth for:
- Sales
- Product Cost
- Gross Profit
- GP Margin
- Contribution Profit
- Contribution %
- Stock receipt / issue / transfer / count adjustment
- Delivery Actual Received
- Freight and direct expense

Minimum Stock is an alerting and filtering threshold only. It does not reserve stock and does not change transaction posting.

## Commercial positioning

This release improves executive usability and the visual quality expected from a premium B2B product while retaining the existing operational rules.

Commercial baseline: **v1.14.3 - COMMERCIAL PILOT READY**