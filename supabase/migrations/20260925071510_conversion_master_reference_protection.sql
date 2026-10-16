-- Synced from production Supabase migration 20260925071510: conversion_master_reference_protection
-- Do not edit independently from production schema history.

create or replace function public.admin_delete_master(p_kind text,p_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  table_name text;
  old_row jsonb;
  code_value text;
  refs integer:=0;
  action_text text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_id is null then raise exception 'MASTER_ID_REQUIRED'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or length(trim(p_reason))<5 then raise exception 'DELETE_REASON_REQUIRED'; end if;
  table_name:=private.master_table_name(p_kind);
  if table_name is null then raise exception 'INVALID_MASTER_KIND'; end if;
  execute format('select to_jsonb(t) from public.%I t where t.company_id=$1 and t.id=$2',table_name) into old_row using ctx.company_id,p_id;
  if old_row is null then raise exception 'MASTER_NOT_FOUND'; end if;
  code_value:=old_row->>'code';

  if p_kind='customers' then
    refs:=private.master_ref_count('orders','customer_id',ctx.company_id,p_id)+private.master_ref_count('invoices','customer_id',ctx.company_id,p_id);
  elsif p_kind='productGroups' then
    refs:=private.master_ref_count('products','group_id',ctx.company_id,p_id);
  elsif p_kind='products' then
    refs:=private.master_ref_count('order_lines','product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_balances','product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_movements','product_id',ctx.company_id,p_id)
      +private.master_ref_count('monthly_product_costs','product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_count_lines','product_id',ctx.company_id,p_id)
      +private.master_ref_count('transfer_lines','product_id',ctx.company_id,p_id)
      +private.master_ref_count('delivery_trip_lines','product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_conversion_lines','from_product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_conversion_lines','to_product_id',ctx.company_id,p_id);
  elsif p_kind='warehouses' then
    refs:=private.master_ref_count('order_lines','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_balances','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_movements','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_counts','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('transfers','from_warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('transfers','to_warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('expense_rates','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_conversions','warehouse_id',ctx.company_id,p_id);
  elsif p_kind='suppliers' then
    refs:=private.master_ref_count('delivery_trips','transport_supplier_id',ctx.company_id,p_id);
  elsif p_kind='vehicles' then
    refs:=private.master_ref_count('delivery_trips','vehicle_id',ctx.company_id,p_id);
  elsif p_kind='drivers' then
    refs:=private.master_ref_count('delivery_trips','driver_id',ctx.company_id,p_id);
  elsif p_kind='vehicleTypes' then
    refs:=private.master_ref_count_text('vehicles','vehicle_type',ctx.company_id,code_value)+private.master_ref_count_text('expense_rates','vehicle_type',ctx.company_id,code_value);
  elsif p_kind='expenseTypes' then
    refs:=private.master_ref_count('expense_rates','expense_type_id',ctx.company_id,p_id)+private.master_ref_count('trip_expenses','expense_type_id',ctx.company_id,p_id);
  end if;

  if refs>0 then
    execute format('update public.%I set active=false where company_id=$1 and id=$2',table_name) using ctx.company_id,p_id;
    action_text:='DEACTIVATED';
  else
    execute format('delete from public.%I where company_id=$1 and id=$2',table_name) using ctx.company_id,p_id;
    action_text:='DELETED';
  end if;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(ctx.company_id,auth.uid(),'MASTER_'||action_text,p_kind,p_id::text,old_row,jsonb_build_object('reason',p_reason,'references',refs));

  return jsonb_build_object('ok',true,'action',action_text,'references',refs);
end $$;
