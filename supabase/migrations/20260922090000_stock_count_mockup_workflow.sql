-- Stock Count workflow aligned with the FlowStock mockup:
-- Snapshot/Draft -> Save lines -> Submit -> Admin Final Adjustment.
-- Counts never change stock until the Admin final step.

alter table public.stock_counts
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id),
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id);

create unique index if not exists stock_counts_company_request_uq
  on public.stock_counts(company_id, request_id) where request_id is not null;

create or replace function public.start_stock_count(p_warehouse_id uuid, p_request_id text)
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
declare
  ctx record;
  c record;
  lines jsonb;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=ctx.company_id and active) then
    raise exception 'INVALID_WAREHOUSE';
  end if;

  select * into c from public.stock_counts where company_id=ctx.company_id and request_id=p_request_id limit 1;
  if not found then
    insert into public.stock_counts(company_id,count_no,warehouse_id,status,snapshot_at,request_id)
    values(ctx.company_id,private.next_doc_no('SC-','public.stock_counts'::regclass,'count_no',ctx.company_id),p_warehouse_id,'DRAFT',now(),p_request_id)
    returning * into c;
    insert into public.stock_count_lines(company_id,count_id,product_id,book_qty,count_qty,pile_values)
    select ctx.company_id,c.id,p.id,coalesce(b.on_hand,0),null,'[]'::jsonb
    from public.products p
    left join public.stock_balances b on b.company_id=ctx.company_id and b.warehouse_id=p_warehouse_id and b.product_id=p.id
    where p.company_id=ctx.company_id and p.active;
    insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
    values(ctx.company_id,auth.uid(),'START_STOCK_COUNT','STOCK_COUNT',c.id::text,
      jsonb_build_object('count_no',c.count_no,'warehouse_id',p_warehouse_id,'snapshot_at',c.snapshot_at));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'product_id',l.product_id,'book_qty',l.book_qty,'count_qty',l.count_qty,
    'pile_values',l.pile_values,'variance_reason',l.variance_reason
  ) order by p.code),'[]'::jsonb) into lines
  from public.stock_count_lines l join public.products p on p.id=l.product_id
  where l.count_id=c.id and l.company_id=ctx.company_id;
  return jsonb_build_object('id',c.id,'count_no',c.count_no,'warehouse_id',c.warehouse_id,
    'status',c.status,'snapshot_at',c.snapshot_at,'lines',lines);
end $$;

create or replace function public.save_stock_count(p_count_id uuid, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
declare
  ctx record;
  c record;
  item jsonb;
  pid uuid;
  counted numeric;
  piles jsonb;
  reason text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  select * into c from public.stock_counts where id=p_count_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;
  if c.status<>'DRAFT' then raise exception 'STOCK_COUNT_NOT_EDITABLE'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' then raise exception 'STOCK_COUNT_LINES_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    pid:=(item->>'product_id')::uuid;
    counted:=case when item ? 'count_qty' and nullif(item->>'count_qty','') is not null then (item->>'count_qty')::numeric else null end;
    piles:=case when jsonb_typeof(item->'pile_values')='array' then item->'pile_values' else '[]'::jsonb end;
    reason:=nullif(btrim(item->>'variance_reason'),'');
    if counted is not null and counted<0 then raise exception 'INVALID_COUNT_QTY'; end if;
    if not exists(select 1 from public.stock_count_lines where id=(item->>'id')::uuid and count_id=c.id and product_id=pid and company_id=ctx.company_id) then
      raise exception 'STOCK_COUNT_LINE_NOT_FOUND';
    end if;
    update public.stock_count_lines
      set count_qty=counted,pile_values=piles,variance_reason=reason
      where id=(item->>'id')::uuid and count_id=c.id and company_id=ctx.company_id;
  end loop;
  return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',c.status);
end $$;

create or replace function public.submit_stock_count(p_count_id uuid, p_lines jsonb, p_request_id text)
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
declare
  ctx record;
  c record;
  l record;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select * into c from public.stock_counts where id=p_count_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;
  if c.status='SUBMITTED' or c.status='ADJUSTED' then return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',c.status); end if;
  if c.status<>'DRAFT' then raise exception 'STOCK_COUNT_NOT_EDITABLE'; end if;
  perform public.save_stock_count(p_count_id,p_lines);
  for l in select * from public.stock_count_lines where count_id=c.id and company_id=ctx.company_id loop
    if l.count_qty is null then raise exception 'ALL_COUNT_LINES_REQUIRED'; end if;
    if l.count_qty<>l.book_qty and nullif(btrim(l.variance_reason),'') is null then raise exception 'VARIANCE_REASON_REQUIRED'; end if;
  end loop;
  update public.stock_counts set status='SUBMITTED',submitted_at=now(),submitted_by=auth.uid() where id=c.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'SUBMIT_STOCK_COUNT','STOCK_COUNT',c.id::text,jsonb_build_object('count_no',c.count_no));
  return jsonb_build_object('id',c.id,'count_no',c.count_no,'status','SUBMITTED');
end $$;

create or replace function public.finalize_stock_count(p_count_id uuid, p_request_id text)
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
declare
  ctx record;
  c record;
  l record;
  b record;
  delta numeric;
  changed integer:=0;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select * into c from public.stock_counts where id=p_count_id and company_id=ctx.company_id for update;
  if not found then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;
  if c.status='ADJUSTED' or c.status='FINAL' then return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',c.status); end if;
  if c.status<>'SUBMITTED' then raise exception 'STOCK_COUNT_NOT_SUBMITTED'; end if;
  for l in select * from public.stock_count_lines where count_id=c.id and company_id=ctx.company_id order by product_id loop
    if l.count_qty is null then raise exception 'ALL_COUNT_LINES_REQUIRED'; end if;
    delta:=l.count_qty-l.book_qty;
    if delta=0 then continue; end if;
    select * into b from public.stock_balances where company_id=ctx.company_id and warehouse_id=c.warehouse_id and product_id=l.product_id for update;
    if not found then
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
      values(ctx.company_id,c.warehouse_id,l.product_id,delta,0,1);
    else
      if b.on_hand+delta<0 then raise exception 'INVALID_COUNT_QTY'; end if;
      update public.stock_balances set on_hand=on_hand+delta,version=version+1 where id=b.id;
    end if;
    insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
    values(ctx.company_id,c.warehouse_id,l.product_id,'COUNT_ADJUSTMENT',delta,'STOCK_COUNT',c.count_no,
      p_request_id||'-'||l.product_id::text,auth.uid());
    changed:=changed+1;
  end loop;
  update public.stock_counts set status='ADJUSTED',finalized_at=now(),finalized_by=auth.uid() where id=c.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'FINALIZE_STOCK_COUNT','STOCK_COUNT',c.id::text,jsonb_build_object('count_no',c.count_no,'adjusted_lines',changed));
  return jsonb_build_object('id',c.id,'count_no',c.count_no,'status','ADJUSTED','adjusted_lines',changed);
end $$;

-- The old endpoint changed stock immediately. Keep the signature for old clients,
-- but make the unsafe path explicit so every client must use the controlled workflow.
create or replace function public.post_stock_count(p_warehouse_id uuid,p_lines jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
begin
  raise exception 'COUNT_WORKFLOW_REQUIRED';
end $$;

revoke all on function public.start_stock_count(uuid,text) from public,anon;
revoke all on function public.save_stock_count(uuid,jsonb) from public,anon;
revoke all on function public.submit_stock_count(uuid,jsonb,text) from public,anon;
revoke all on function public.finalize_stock_count(uuid,text) from public,anon;
revoke all on function public.post_stock_count(uuid,jsonb,text) from public,anon;
grant execute on function public.start_stock_count(uuid,text) to authenticated;
grant execute on function public.save_stock_count(uuid,jsonb) to authenticated;
grant execute on function public.submit_stock_count(uuid,jsonb,text) to authenticated;
grant execute on function public.finalize_stock_count(uuid,text) to authenticated;
grant execute on function public.post_stock_count(uuid,jsonb,text) to authenticated;
