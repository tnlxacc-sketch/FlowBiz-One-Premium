-- Follow-up hardening after production transaction QA.

create index if not exists idx_delivery_trip_lines_order_line on public.delivery_trip_lines(order_line_id);
create index if not exists idx_delivery_trip_lines_product on public.delivery_trip_lines(product_id);
create index if not exists idx_delivery_trips_driver on public.delivery_trips(driver_id);
create index if not exists idx_delivery_trips_transport_supplier on public.delivery_trips(transport_supplier_id);

-- Stock count postings are reserved for the Warehouse and Admin roles.
drop policy if exists tenant_insert_stock_counts on public.stock_counts;
drop policy if exists tenant_update_stock_counts on public.stock_counts;
drop policy if exists tenant_insert_stock_count_lines on public.stock_count_lines;
drop policy if exists tenant_update_stock_count_lines on public.stock_count_lines;
create policy role_insert_stock_counts on public.stock_counts for insert to authenticated
  with check (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'));
create policy role_update_stock_counts on public.stock_counts for update to authenticated
  using (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'))
  with check (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'));
create policy role_insert_stock_count_lines on public.stock_count_lines for insert to authenticated
  with check (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'));
create policy role_update_stock_count_lines on public.stock_count_lines for update to authenticated
  using (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'))
  with check (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('WAREHOUSE','ADMIN'));

-- Audit is readable only by management; writes happen inside approved RPCs.
drop policy if exists tenant_select_audit_logs on public.audit_logs;
create policy management_select_audit_logs on public.audit_logs for select to authenticated
  using (company_id=(select public.current_company_id()) and (select public.current_app_role()) in ('OWNER','ADMIN'));

