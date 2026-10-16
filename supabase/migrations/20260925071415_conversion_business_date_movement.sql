-- Synced from production Supabase migration 20260925071415: conversion_business_date_movement
-- Do not edit independently from production schema history.

create or replace function public.post_stock_conversion(
  p_warehouse_id uuid,
  p_conversion_date date,
  p_lines jsonb,
  p_note text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  existing record;
  cid uuid;
  cno text;
  line jsonb;
  line_no integer:=0;
  src record;
  from_p record;
  to_p record;
  qout numeric;
  qin numeric;
  rid text;
  movement_at timestamptz;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select id,conversion_no,status into existing
  from public.stock_conversions
  where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'conversion_no',existing.conversion_no,'status',existing.status,'idempotent',true); end if;

  if p_conversion_date is null then raise exception 'CONVERSION_DATE_REQUIRED'; end if;
  if exists(select 1 from public.period_closes where company_id=ctx.company_id and period_month=date_trunc('month',p_conversion_date)::date and status='CLOSED')
    then raise exception 'PERIOD_CLOSED'; end if;
  if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=ctx.company_id and active)
    then raise exception 'INVALID_WAREHOUSE'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'CONVERSION_LINES_REQUIRED'; end if;
  if jsonb_array_length(p_lines)>200 then raise exception 'CONVERSION_LINES_LIMIT'; end if;

  movement_at := (p_conversion_date::timestamp + timezone('Asia/Bangkok',now())::time) at time zone 'Asia/Bangkok';

  cno:=private.next_doc_no('CV-','public.stock_conversions'::regclass,'conversion_no',ctx.company_id);
  insert into public.stock_conversions(company_id,conversion_no,warehouse_id,conversion_date,status,note,request_id,created_by)
  values(ctx.company_id,cno,p_warehouse_id,p_conversion_date,'POSTED',nullif(btrim(p_note),''),p_request_id,auth.uid())
  returning id into cid;

  for line in select value from jsonb_array_elements(p_lines) loop
    line_no:=line_no+1;
    qout:=coalesce((line->>'qty_out')::numeric,0);
    qin:=coalesce((line->>'qty_in')::numeric,0);

    if qout<=0 or qin<=0 then raise exception 'INVALID_CONVERSION_QTY'; end if;
    if coalesce(line->>'from_product_id','')='' or coalesce(line->>'to_product_id','')='' then raise exception 'INVALID_CONVERSION_PRODUCT'; end if;
    if (line->>'from_product_id')::uuid=(line->>'to_product_id')::uuid then raise exception 'SAME_CONVERSION_PRODUCT'; end if;

    select * into from_p from public.products
    where id=(line->>'from_product_id')::uuid and company_id=ctx.company_id and active;
    if not found then raise exception 'INVALID_PRODUCT'; end if;
    select * into to_p from public.products
    where id=(line->>'to_product_id')::uuid and company_id=ctx.company_id and active;
    if not found then raise exception 'INVALID_PRODUCT'; end if;

    select * into src from public.stock_balances
    where company_id=ctx.company_id and warehouse_id=p_warehouse_id and product_id=from_p.id
    for update;
    if not found or src.on_hand-src.allocated<qout then raise exception 'INSUFFICIENT_STOCK'; end if;

    update public.stock_balances set on_hand=on_hand-qout,version=version+1 where id=src.id;
    insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
    values(ctx.company_id,p_warehouse_id,to_p.id,qin,0)
    on conflict(company_id,warehouse_id,product_id)
    do update set on_hand=public.stock_balances.on_hand+excluded.on_hand,version=public.stock_balances.version+1;

    insert into public.stock_conversion_lines(company_id,conversion_id,line_no,from_product_id,to_product_id,qty_out,qty_in,reason)
    values(ctx.company_id,cid,line_no,from_p.id,to_p.id,qout,qin,nullif(btrim(line->>'reason'),''));

    rid:=p_request_id||'-'||line_no::text;
    insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by,created_at)
    values
      (ctx.company_id,p_warehouse_id,from_p.id,'CONVERSION_OUT',-qout,'STOCK_CONVERSION',cno,rid||'-OUT',auth.uid(),movement_at),
      (ctx.company_id,p_warehouse_id,to_p.id,'CONVERSION_IN',qin,'STOCK_CONVERSION',cno,rid||'-IN',auth.uid(),movement_at);
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'POST_STOCK_CONVERSION','STOCK_CONVERSION',cid::text,
    jsonb_build_object('conversion_no',cno,'warehouse_id',p_warehouse_id,'conversion_date',p_conversion_date,'line_count',line_no,'note',nullif(btrim(p_note),'')));

  return jsonb_build_object('id',cid,'conversion_no',cno,'status','POSTED','line_count',line_no,'idempotent',false);
end $$;
