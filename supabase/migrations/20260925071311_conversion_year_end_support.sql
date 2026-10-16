-- Synced from production Supabase migration 20260925071311: conversion_year_end_support
-- Do not edit independently from production schema history.

create or replace function public.admin_rollover_year(p_year integer,p_archive_sha256 text,p_company_code text,p_reason text)
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
      and archive_sha256=lower(btrim(p_archive_sha256)) and consumed_at is null for update;
  if not found then raise exception 'VERIFIED_BACKUP_REQUIRED'; end if;
  if (select coalesce(max(id),0) from public.audit_logs where company_id=ctx.company_id)<>backup.audit_max_id
    then raise exception 'DATA_CHANGED_SINCE_BACKUP'; end if;

  if exists(select 1 from public.orders where company_id=ctx.company_id and order_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.invoices where company_id=ctx.company_id and invoice_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.goods_receipts where company_id=ctx.company_id and receipt_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.delivery_trips where company_id=ctx.company_id and planned_start>=make_date(p_year+1,1,1))
    or exists(select 1 from public.opening_stock_batches where company_id=ctx.company_id and opening_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.stock_conversions where company_id=ctx.company_id and conversion_date>=make_date(p_year+1,1,1))
    or exists(select 1 from public.stock_movements where company_id=ctx.company_id and created_at>=make_date(p_year+1,1,1))
    then raise exception 'NEW_YEAR_TRANSACTIONS_EXIST'; end if;

  if exists(select 1 from public.orders where company_id=ctx.company_id and status not in ('DELIVERED','CANCELLED'))
    or exists(select 1 from public.delivery_trips where company_id=ctx.company_id and status<>'COMPLETED')
    or exists(select 1 from public.transfers where company_id=ctx.company_id and status='IN_TRANSIT')
    or exists(select 1 from public.stock_counts where company_id=ctx.company_id and status in ('DRAFT','SUBMITTED'))
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
      from public.stock_balances b where b.company_id=ctx.company_id and b.on_hand>0;
    insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
      select b.company_id,b.warehouse_id,b.product_id,'OPENING_BALANCE',b.on_hand,'OPENING_STOCK',carry_ref,
        'ROLLOVER-'||(p_year+1)::text||'-'||b.id::text,auth.uid()
      from public.stock_balances b where b.company_id=ctx.company_id and b.on_hand>0;
  end if;

  update private.year_end_backups set consumed_at=now()
    where company_id=ctx.company_id and closed_year=p_year;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
    values(ctx.company_id,auth.uid(),'ADMIN_YEAR_END_ROLLOVER','COMPANY',ctx.company_id::text,
      jsonb_build_object('closed_year',p_year,'archive_sha256',backup.archive_sha256,
        'archive_path',backup.archive_path,'orders',archived_orders,'invoices',archived_invoices,
        'opening_stock_lines',carried,'reason',btrim(p_reason)));
  return jsonb_build_object('closed_year',p_year,'orders',archived_orders,
    'invoices',archived_invoices,'opening_stock_lines',carried,'archive_sha256',backup.archive_sha256);
end $$;
