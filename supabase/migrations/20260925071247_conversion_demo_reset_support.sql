-- Synced from production Supabase migration 20260925071247: conversion_demo_reset_support
-- Do not edit independently from production schema history.

create or replace function public.admin_reset_demo_data(p_scope text,p_company_code text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  company_row record;
  reset_scope text:=upper(btrim(coalesce(p_scope,'')));
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into company_row from public.companies where id=ctx.company_id for update;
  if not found or company_row.is_demo is not true then raise exception 'DEMO_DELETE_ONLY'; end if;
  if upper(btrim(coalesce(p_company_code,'')))<>upper(company_row.code) then raise exception 'COMPANY_CODE_MISMATCH'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'DELETE_REASON_REQUIRED'; end if;
  if reset_scope not in ('TRANSACTIONS','ALL_BUSINESS_DATA') then raise exception 'INVALID_RESET_SCOPE'; end if;

  delete from public.delivery_documents where company_id=ctx.company_id;
  delete from public.actual_expenses where company_id=ctx.company_id;
  delete from public.invoice_orders where company_id=ctx.company_id;
  delete from public.invoice_trips where company_id=ctx.company_id;
  delete from public.invoices where company_id=ctx.company_id;
  delete from public.delivery_trip_lines where company_id=ctx.company_id;
  delete from public.delivery_trips where company_id=ctx.company_id;
  delete from public.stock_count_lines where company_id=ctx.company_id;
  delete from public.stock_counts where company_id=ctx.company_id;
  delete from public.transfer_lines where company_id=ctx.company_id;
  delete from public.transfers where company_id=ctx.company_id;
  delete from public.stock_conversion_lines where company_id=ctx.company_id;
  delete from public.stock_conversions where company_id=ctx.company_id;
  delete from public.goods_receipt_lines where company_id=ctx.company_id;
  delete from public.goods_receipts where company_id=ctx.company_id;
  delete from public.opening_stock_lines where company_id=ctx.company_id;
  delete from public.opening_stock_batches where company_id=ctx.company_id;
  delete from public.order_lines where company_id=ctx.company_id;
  delete from public.orders where company_id=ctx.company_id;
  delete from public.stock_movements where company_id=ctx.company_id;
  delete from public.stock_balances where company_id=ctx.company_id;

  if reset_scope='ALL_BUSINESS_DATA' then
    delete from public.expense_rates where company_id=ctx.company_id;
    delete from public.monthly_product_costs where company_id=ctx.company_id;
    delete from public.period_closes where company_id=ctx.company_id;
    delete from public.app_settings where company_id=ctx.company_id;
    delete from public.expense_types where company_id=ctx.company_id;
    delete from public.vehicles where company_id=ctx.company_id;
    delete from public.vehicle_types where company_id=ctx.company_id;
    delete from public.drivers where company_id=ctx.company_id;
    delete from public.suppliers where company_id=ctx.company_id;
    delete from public.products where company_id=ctx.company_id;
    delete from public.product_groups where company_id=ctx.company_id;
    delete from public.customers where company_id=ctx.company_id;
    delete from public.warehouses where company_id=ctx.company_id;
  end if;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ADMIN_RESET_DEMO_DATA','COMPANY',ctx.company_id::text,
    jsonb_build_object('scope',reset_scope,'reason',btrim(p_reason)));
  return jsonb_build_object('reset',true,'scope',reset_scope);
end $$;

create or replace function public.admin_delete_demo_record(p_entity_type text,p_entity_id uuid,p_company_code text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  company_row record;
  entity_type text:=upper(btrim(coalesce(p_entity_type,'')));
  v_reference_no text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into company_row from public.companies where id=ctx.company_id for update;
  if not found or company_row.is_demo is not true then raise exception 'DEMO_DELETE_ONLY'; end if;
  if upper(btrim(coalesce(p_company_code,'')))<>upper(company_row.code) then raise exception 'COMPANY_CODE_MISMATCH'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'DELETE_REASON_REQUIRED'; end if;

  if entity_type='STOCK_COUNT' then
    select count_no into v_reference_no from public.stock_counts where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements where company_id=ctx.company_id and reference_type='STOCK_COUNT' and reference_no=v_reference_no;
    delete from public.stock_count_lines where company_id=ctx.company_id and count_id=p_entity_id;
    delete from public.stock_counts where company_id=ctx.company_id and id=p_entity_id;
  elsif entity_type='OPENING_STOCK' then
    select reference_no into v_reference_no from public.opening_stock_batches where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements where company_id=ctx.company_id and reference_type='OPENING_STOCK' and reference_no=v_reference_no;
    delete from public.opening_stock_lines where company_id=ctx.company_id and batch_id=p_entity_id;
    delete from public.opening_stock_batches where company_id=ctx.company_id and id=p_entity_id;
  elsif entity_type='GOODS_RECEIPT' then
    select gr_no into v_reference_no from public.goods_receipts where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements where company_id=ctx.company_id and reference_type='GOODS_RECEIPT' and reference_no=v_reference_no;
    delete from public.goods_receipt_lines where company_id=ctx.company_id and gr_id=p_entity_id;
    delete from public.goods_receipts where company_id=ctx.company_id and id=p_entity_id;
  elsif entity_type='TRANSFER' then
    select transfer_no into v_reference_no from public.transfers where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements where company_id=ctx.company_id and reference_type='TRANSFER' and reference_no=v_reference_no;
    delete from public.transfer_lines where company_id=ctx.company_id and transfer_id=p_entity_id;
    delete from public.transfers where company_id=ctx.company_id and id=p_entity_id;
  elsif entity_type='STOCK_CONVERSION' then
    select conversion_no into v_reference_no from public.stock_conversions where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements where company_id=ctx.company_id and reference_type in ('STOCK_CONVERSION','STOCK_CONVERSION_REVERSAL') and reference_no=v_reference_no;
    delete from public.stock_conversion_lines where company_id=ctx.company_id and conversion_id=p_entity_id;
    delete from public.stock_conversions where company_id=ctx.company_id and id=p_entity_id;
  else
    raise exception 'DELETE_ENTITY_NOT_ALLOWED';
  end if;

  perform private.rebuild_stock_balances(ctx.company_id);
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ADMIN_DELETE_DEMO_RECORD',entity_type,p_entity_id::text,
    jsonb_build_object('reference_no',v_reference_no,'reason',btrim(p_reason)));
  return jsonb_build_object('deleted',true,'entity_type',entity_type,'reference_no',v_reference_no);
end $$;
