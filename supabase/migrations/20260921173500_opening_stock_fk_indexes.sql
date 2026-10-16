-- Cover opening-stock foreign keys used by joins and referential checks.
create index if not exists opening_stock_batches_created_by_idx
  on public.opening_stock_batches(created_by);
create index if not exists opening_stock_lines_warehouse_idx
  on public.opening_stock_lines(warehouse_id);
create index if not exists opening_stock_lines_product_idx
  on public.opening_stock_lines(product_id);
