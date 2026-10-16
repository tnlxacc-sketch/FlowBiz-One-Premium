create index if not exists idx_product_warehouse_minimums_product_id
  on public.product_warehouse_minimums(product_id);

create index if not exists idx_product_warehouse_minimums_warehouse_id
  on public.product_warehouse_minimums(warehouse_id);

create index if not exists idx_product_warehouse_minimums_updated_by
  on public.product_warehouse_minimums(updated_by);
