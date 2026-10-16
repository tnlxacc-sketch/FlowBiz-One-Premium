-- Synced from production Supabase migration 20260925080513: stock_adjustment_respects_allocations
-- Do not edit independently from production schema history.

create or replace function public.finalize_stock_count(p_count_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; c record; l record; b record;
  delta numeric; changed integer:=0; final_status text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into c from public.stock_counts
  where id=p_count_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;

  if c.status in ('ADJUSTED','FINAL') then
    return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',c.status,
      'policy',c.adjustment_policy,'adjusted_lines',0);
  end if;
  if c.status<>'SUBMITTED' then raise exception 'STOCK_COUNT_NOT_SUBMITTED'; end if;

  if c.adjustment_policy='AUTO_ADJUST' then
    for l in
      select * from public.stock_count_lines
      where count_id=c.id and company_id=ctx.company_id order by product_id
    loop
      if l.count_qty is null then raise exception 'ALL_COUNT_LINES_REQUIRED'; end if;
      delta:=l.count_qty-l.book_qty;
      if delta=0 then continue; end if;

      select * into b from public.stock_balances
      where company_id=ctx.company_id and warehouse_id=c.warehouse_id and product_id=l.product_id
      for update;

      if not found then
        if delta<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
        insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
        values(ctx.company_id,c.warehouse_id,l.product_id,delta,0,1);
      else
        if b.on_hand+delta<b.allocated then raise exception 'INSUFFICIENT_STOCK'; end if;
        update public.stock_balances set on_hand=on_hand+delta,version=version+1 where id=b.id;
      end if;

      insert into public.stock_movements(
        company_id,warehouse_id,product_id,movement_type,qty,
        reference_type,reference_no,request_id,created_by
      )
      values(ctx.company_id,c.warehouse_id,l.product_id,'COUNT_ADJUSTMENT',delta,
        'STOCK_COUNT',c.count_no,p_request_id||'-'||l.product_id::text,auth.uid());
      changed:=changed+1;
    end loop;
    final_status:='ADJUSTED';
  else
    for l in select * from public.stock_count_lines where count_id=c.id and company_id=ctx.company_id loop
      if l.count_qty is null then raise exception 'ALL_COUNT_LINES_REQUIRED'; end if;
    end loop;
    final_status:='FINAL';
  end if;

  update public.stock_counts
  set status=final_status,finalized_at=now(),finalized_by=auth.uid()
  where id=c.id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'FINALIZE_STOCK_COUNT','STOCK_COUNT',c.id::text,
    jsonb_build_object('count_no',c.count_no,'policy',c.adjustment_policy,
      'status',final_status,'adjusted_lines',changed));

  return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',final_status,
    'policy',c.adjustment_policy,'adjusted_lines',changed);
end $$;

create or replace function public.post_stock_adjustment(p_adjustment_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; a record; l record; b record;
  movement_at timestamptz; posted integer:=0;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into a from public.stock_adjustments
  where id=p_adjustment_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_ADJUSTMENT_NOT_FOUND'; end if;
  if a.status='POSTED' then
    return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,'status',a.status,'idempotent',true);
  end if;
  if a.status<>'SUBMITTED' then raise exception 'STOCK_ADJUSTMENT_NOT_POSTABLE'; end if;

  if exists(select 1 from public.period_closes
    where company_id=ctx.company_id
      and period_month=date_trunc('month',a.adjustment_date)::date
      and status='CLOSED') then raise exception 'PERIOD_CLOSED'; end if;

  movement_at:=(a.adjustment_date::timestamp+timezone('Asia/Bangkok',now())::time)
    at time zone 'Asia/Bangkok';

  for l in select * from public.stock_adjustment_lines
    where adjustment_id=a.id and company_id=ctx.company_id order by line_no
  loop
    select * into b from public.stock_balances
    where company_id=ctx.company_id and warehouse_id=a.warehouse_id and product_id=l.product_id
    for update;

    if not found then
      if l.adjustment_qty<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
      values(ctx.company_id,a.warehouse_id,l.product_id,l.adjustment_qty,0,1);
    else
      if b.on_hand+l.adjustment_qty<b.allocated then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.stock_balances set on_hand=on_hand+l.adjustment_qty,version=version+1 where id=b.id;
    end if;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by,created_at
    )
    values(ctx.company_id,a.warehouse_id,l.product_id,'MANUAL_ADJUSTMENT',l.adjustment_qty,
      'STOCK_ADJUSTMENT',a.adjustment_no,p_request_id||'-'||l.line_no::text,auth.uid(),movement_at);
    posted:=posted+1;
  end loop;

  update public.stock_adjustments set status='POSTED',posted_by=auth.uid(),posted_at=now() where id=a.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'POST_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',a.id::text,
    jsonb_build_object('adjustment_no',a.adjustment_no,'posted_lines',posted));

  return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,
    'status','POSTED','posted_lines',posted,'idempotent',false);
end $$;

create or replace function public.reverse_stock_adjustment(
  p_adjustment_id uuid,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record; a record; l record; b record; reverse_delta numeric;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'REVERSAL_REASON_REQUIRED'; end if;

  select * into a from public.stock_adjustments
  where id=p_adjustment_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_ADJUSTMENT_NOT_FOUND'; end if;
  if a.status='REVERSED' then
    return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,'status','REVERSED','idempotent',true);
  end if;
  if a.status<>'POSTED' then raise exception 'STOCK_ADJUSTMENT_NOT_REVERSIBLE'; end if;

  if exists(select 1 from public.period_closes
    where company_id=ctx.company_id
      and period_month=date_trunc('month',a.adjustment_date)::date
      and status='CLOSED') then raise exception 'PERIOD_CLOSED'; end if;

  for l in select * from public.stock_adjustment_lines
    where adjustment_id=a.id and company_id=ctx.company_id order by line_no
  loop
    reverse_delta:=-l.adjustment_qty;
    select * into b from public.stock_balances
    where company_id=ctx.company_id and warehouse_id=a.warehouse_id and product_id=l.product_id
    for update;

    if not found then
      if reverse_delta<0 then raise exception 'REVERSAL_INSUFFICIENT_TARGET_STOCK'; end if;
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
      values(ctx.company_id,a.warehouse_id,l.product_id,reverse_delta,0,1);
    else
      if b.on_hand+reverse_delta<b.allocated then raise exception 'REVERSAL_INSUFFICIENT_TARGET_STOCK'; end if;
      update public.stock_balances set on_hand=on_hand+reverse_delta,version=version+1 where id=b.id;
    end if;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by
    )
    values(ctx.company_id,a.warehouse_id,l.product_id,'MANUAL_ADJUSTMENT_REVERSAL',reverse_delta,
      'STOCK_ADJUSTMENT_REVERSAL',a.adjustment_no,
      p_request_id||'-'||l.line_no::text,auth.uid());
  end loop;

  update public.stock_adjustments
  set status='REVERSED',reversed_by=auth.uid(),reversed_at=now(),
      reversal_reason=btrim(p_reason),reversal_request_id=p_request_id
  where id=a.id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(ctx.company_id,auth.uid(),'REVERSE_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',a.id::text,
    jsonb_build_object('status','POSTED'),
    jsonb_build_object('status','REVERSED','reason',btrim(p_reason)));

  return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,'status','REVERSED','idempotent',false);
end $$;
