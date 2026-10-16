-- Synced from production Supabase migration 20260925084520: stock_adjustment_conversion_fk_indexes

create index if not exists idx_stock_adjustment_lines_company
  on public.stock_adjustment_lines(company_id);
create index if not exists idx_stock_adjustment_lines_product
  on public.stock_adjustment_lines(product_id);
create index if not exists idx_stock_adjustments_source_count
  on public.stock_adjustments(source_count_id);
create index if not exists idx_stock_adjustments_warehouse
  on public.stock_adjustments(warehouse_id);

create index if not exists idx_stock_conversion_lines_company
  on public.stock_conversion_lines(company_id);
create index if not exists idx_stock_conversion_lines_from_product
  on public.stock_conversion_lines(from_product_id);
create index if not exists idx_stock_conversion_lines_to_product
  on public.stock_conversion_lines(to_product_id);
create index if not exists idx_stock_conversions_warehouse
  on public.stock_conversions(warehouse_id);
