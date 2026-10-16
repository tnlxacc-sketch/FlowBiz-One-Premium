-- Synced from production Supabase migration 20260925080235: stock_adjustment_lifecycle_support
-- Do not edit independently from production schema history.

create or replace function public.admin_delete_master(p_kind text,p_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; table_name text; old_row jsonb; code_value text; refs integer:=0; action_text text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_id is null then raise exception 'MASTER_ID_REQUIRED'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or length(trim(p_reason))<5 then raise exception 'DELETE_REASON_REQUIRED'; end if;
  table_name:=private.master_table_name(p_kind);
  if table_name is null then raise exception 'INVALID_MASTER_KIND'; end if;
  execute format('select to_jsonb(t) from public.%I t where t.company_id=$1 and t.id=$2',table_name)
    into old_row using ctx.company_id,p_id;
  if old_row is null then raise exception 'MASTER_NOT_FOUND'; end if;
  code_value:=old_row->>'code';

  if p_kind='customers' then
    refs:=private.master_ref_count('orders','customer_id',ctx.company_id,p_id)
      +private.master_ref_count('invoices','customer_id',ctx.company_id,p_id);
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
      +private.master_ref_count('stock_conversion_lines','to_product_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_adjustment_lines','product_id',ctx.company_id,p_id);
  elsif p_kind='warehouses' then
    refs:=private.master_ref_count('order_lines','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_balances','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_movements','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_counts','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('transfers','from_warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('transfers','to_warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('expense_rates','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_conversions','warehouse_id',ctx.company_id,p_id)
      +private.master_ref_count('stock_adjustments','warehouse_id',ctx.company_id,p_id);
  elsif p_kind='suppliers' then
    refs:=private.master_ref_count('delivery_trips','transport_supplier_id',ctx.company_id,p_id);
  elsif p_kind='vehicles' then
    refs:=private.master_ref_count('delivery_trips','vehicle_id',ctx.company_id,p_id);
  elsif p_kind='drivers' then
    refs:=private.master_ref_count('delivery_trips','driver_id',ctx.company_id,p_id);
  elsif p_kind='vehicleTypes' then
    refs:=private.master_ref_count_text('vehicles','vehicle_type',ctx.company_id,code_value)
      +private.master_ref_count_text('expense_rates','vehicle_type',ctx.company_id,code_value);
  elsif p_kind='expenseTypes' then
    refs:=private.master_ref_count('expense_rates','expense_type_id',ctx.company_id,p_id)
      +private.master_ref_count('trip_expenses','expense_type_id',ctx.company_id,p_id);
  end if;

  if refs>0 then
    execute format('update public.%I set active=false where company_id=$1 and id=$2',table_name)
      using ctx.company_id,p_id;
    action_text:='DEACTIVATED';
  else
    execute format('delete from public.%I where company_id=$1 and id=$2',table_name)
      using ctx.company_id,p_id;
    action_text:='DELETED';
  end if;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(ctx.company_id,auth.uid(),'MASTER_'||action_text,p_kind,p_id::text,old_row,
    jsonb_build_object('reason',p_reason,'references',refs));

  return jsonb_build_object('ok',true,'action',action_text,'references',refs);
end $$;

create or replace function public.admin_reset_demo_data(p_scope text,p_company_code text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; company_row record; reset_scope text:=upper(btrim(coalesce(p_scope,'')));
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
  delete from public.stock_adjustment_lines where company_id=ctx.company_id;
  delete from public.stock_adjustments where company_id=ctx.company_id;
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

create or replace function public.admin_delete_demo_record(
  p_entity_type text,p_entity_id uuid,p_company_code text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; company_row record;
  entity_type text:=upper(btrim(coalesce(p_entity_type,'')));
  v_reference_no text; adj record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into company_row from public.companies where id=ctx.company_id for update;
  if not found or company_row.is_demo is not true then raise exception 'DEMO_DELETE_ONLY'; end if;
  if upper(btrim(coalesce(p_company_code,'')))<>upper(company_row.code) then raise exception 'COMPANY_CODE_MISMATCH'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'DELETE_REASON_REQUIRED'; end if;

  if entity_type='STOCK_COUNT' then
    select count_no into v_reference_no
    from public.stock_counts where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;

    for adj in select id,adjustment_no from public.stock_adjustments
      where company_id=ctx.company_id and source_count_id=p_entity_id
    loop
      delete from public.stock_movements
      where company_id=ctx.company_id
        and reference_no=adj.adjustment_no
        and reference_type in ('STOCK_ADJUSTMENT','STOCK_ADJUSTMENT_REVERSAL');
      delete from public.stock_adjustment_lines where company_id=ctx.company_id and adjustment_id=adj.id;
      delete from public.stock_adjustments where company_id=ctx.company_id and id=adj.id;
    end loop;

    delete from public.stock_movements
    where company_id=ctx.company_id and reference_type='STOCK_COUNT' and reference_no=v_reference_no;
    delete from public.stock_count_lines where company_id=ctx.company_id and count_id=p_entity_id;
    delete from public.stock_counts where company_id=ctx.company_id and id=p_entity_id;

  elsif entity_type='STOCK_ADJUSTMENT' then
    select adjustment_no into v_reference_no
    from public.stock_adjustments where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements
    where company_id=ctx.company_id and reference_no=v_reference_no
      and reference_type in ('STOCK_ADJUSTMENT','STOCK_ADJUSTMENT_REVERSAL');
    delete from public.stock_adjustment_lines where company_id=ctx.company_id and adjustment_id=p_entity_id;
    delete from public.stock_adjustments where company_id=ctx.company_id and id=p_entity_id;

  elsif entity_type='OPENING_STOCK' then
    select reference_no into v_reference_no from public.opening_stock_batches
    where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements
    where company_id=ctx.company_id and reference_type='OPENING_STOCK' and reference_no=v_reference_no;
    delete from public.opening_stock_lines where company_id=ctx.company_id and batch_id=p_entity_id;
    delete from public.opening_stock_batches where company_id=ctx.company_id and id=p_entity_id;

  elsif entity_type='GOODS_RECEIPT' then
    select gr_no into v_reference_no from public.goods_receipts
    where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements
    where company_id=ctx.company_id and reference_type='GOODS_RECEIPT' and reference_no=v_reference_no;
    delete from public.goods_receipt_lines where company_id=ctx.company_id and gr_id=p_entity_id;
    delete from public.goods_receipts where company_id=ctx.company_id and id=p_entity_id;

  elsif entity_type='TRANSFER' then
    select transfer_no into v_reference_no from public.transfers
    where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements
    where company_id=ctx.company_id and reference_type='TRANSFER' and reference_no=v_reference_no;
    delete from public.transfer_lines where company_id=ctx.company_id and transfer_id=p_entity_id;
    delete from public.transfers where company_id=ctx.company_id and id=p_entity_id;

  elsif entity_type='STOCK_CONVERSION' then
    select conversion_no into v_reference_no from public.stock_conversions
    where id=p_entity_id and company_id=ctx.company_id for update;
    if not found then raise exception 'RECORD_NOT_FOUND'; end if;
    delete from public.stock_movements
    where company_id=ctx.company_id and reference_type in ('STOCK_CONVERSION','STOCK_CONVERSION_REVERSAL')
      and reference_no=v_reference_no;
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

create or replace function public.admin_rollover_year(
  p_year integer,p_archive_sha256 text,p_company_code text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; backup record; company_code text; carry_id uuid; carry_ref text;
  carried integer; archived_orders bigint; archived_invoices bigint;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_year not between 2000 and extract(year from now())::integer-1 then raise exception 'YEAR_NOT_FINISHED'; end if;
  select code into company_code from public.companies where id=ctx.company_id for update;
  if upper(btrim(coalesce(p_company_code,'')))<>upper(company_code) then raise exception 'COMPANY_CODE_MISMATCH'; end if;
  if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'DELETE_REASON_REQUIRED'; end if;

  select * into backup from private.year_end_backups
  where company_id=ctx.company_id and closed_year=p_year
    and archive_sha256=lower(btrim(p_archive_sha256)) and consumed_at is null
  for update;
  if not found then raise exception 'VERIFIED_BACKUP_REQUIRED'; end if;
  if (select coalesce(max(id),0) from public.audit_logs where company_id=ctx.company_id)<>backup.audit_max_id
    then raise exception 'DATA_CHANGED_SINCE_BACKUP'; end if;

  if exists(select 1 from public.orders where company_id=ctx.company_id and order_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.invoices where company_id=ctx.company_id and invoice_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.goods_receipts where company_id=ctx.company_id and receipt_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.delivery_trips where company_id=ctx.company_id and planned_start>=make_date(p_year+1,1,1))
    or exists(select 1 from public.opening_stock_batches where company_id=ctx.company_id and opening_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.stock_conversions where company_id=ctx.company_id and conversion_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.stock_adjustments where company_id=ctx.company_id and adjustment_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.stock_movements where company_id=ctx.company_id and created_at>=make_date(p_year+1,1,1))
    then raise exception 'NEW_YEAR_TRANSACTIONS_EXIST'; end if;

  if exists(select 1 from public.orders where company_id=ctx.company_id and status not in ('DELIVERED','CANCELLED'))
    or exists(select 1 from public.delivery_trips where company_id=ctx.company_id and status<>'COMPLETED')
    or exists(select 1 from public.transfers where company_id=ctx.company_id and status='IN_TRANSIT')
    or exists(select 1 from public.stock_counts where company_id=ctx.company_id and status in ('DRAFT','SUBMITTED'))
    or exists(select 1 from public.stock_adjustments where company_id=ctx.company_id and status='SUBMITTED')
    or exists(select 1 from public.stock_balances where company_id=ctx.company_id and (allocated<>0 or on_hand<0))
    then raise exception 'OPEN_WORK_OR_STOCK_ALLOCATION'; end if;

  select count(*) into archived_orders from public.orders where company_id=ctx.company_id;
  select count(*) into archived_invoices from public.invoices where company_id=ctx.company_id;
  select count(*) into carried from public.stock_balances where company_id=ctx.company_id and on_hand>0;
  carry_ref:='YEAR-OPEN-'||(p_year+1)::text;

  delete from public.delivery_documents where company_id=ctx.company_id;
  delete from public.actual_expenses where company_id=ctx.company_id;
  delete from public.invoice_orders where company_id=ctx.company_id;
  delete from public.invoice_trips where company_id=ctx.company_id;
  delete from public.invoices where company_id=ctx.company_id;
  delete from public.delivery_trip_lines where company_id=ctx.company_id;
  delete from public.delivery_trips where company_id=ctx.company_id;
  delete from public.stock_adjustment_lines where company_id=ctx.company_id;
  delete from public.stock_adjustments where company_id=ctx.company_id;
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

  if carried>0 then
    insert into public.opening_stock_batches(company_id,reference_no,opening_date,request_id,created_by)
    values(ctx.company_id,carry_ref,make_date(p_year+1,1,1),'ROLLOVER-'||(p_year+1)::text,auth.uid())
    returning id into carry_id;

    insert into public.opening_stock_lines(company_id,batch_id,warehouse_id,product_id,qty,unit_cost)
    select b.company_id,carry_id,b.warehouse_id,b.product_id,b.on_hand,0
    from public.stock_balances b
    where b.company_id=ctx.company_id and b.on_hand>0;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by
    )
    select b.company_id,b.warehouse_id,b.product_id,'OPENING_BALANCE',b.on_hand,
      'OPENING_STOCK',carry_ref,'ROLLOVER-'||(p_year+1)::text||'-'||b.id::text,auth.uid()
    from public.stock_balances b
    where b.company_id=ctx.company_id and b.on_hand>0;
  end if;

  update private.year_end_backups
  set consumed_at=now()
  where company_id=ctx.company_id and closed_year=p_year;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ADMIN_YEAR_END_ROLLOVER','COMPANY',ctx.company_id::text,
    jsonb_build_object('closed_year',p_year,'archive_sha256',backup.archive_sha256,
      'archive_path',backup.archive_path,'orders',archived_orders,'invoices',archived_invoices,
      'opening_stock_lines',carried,'reason',btrim(p_reason)));

  return jsonb_build_object('closed_year',p_year,'orders',archived_orders,
    'invoices',archived_invoices,'opening_stock_lines',carried,'archive_sha256',backup.archive_sha256);
end $$;
