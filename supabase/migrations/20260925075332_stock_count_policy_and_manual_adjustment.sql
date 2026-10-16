-- Synced from production Supabase migration 20260925075332: stock_count_policy_and_manual_adjustment
-- Do not edit independently from production schema history.

alter table public.stock_counts
  add column if not exists adjustment_policy text;

update public.stock_counts
set adjustment_policy='AUTO_ADJUST'
where adjustment_policy is null;

alter table public.stock_counts
  alter column adjustment_policy set default 'AUTO_ADJUST',
  alter column adjustment_policy set not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='stock_counts_adjustment_policy_check'
      and conrelid='public.stock_counts'::regclass
  ) then
    alter table public.stock_counts
      add constraint stock_counts_adjustment_policy_check
      check(adjustment_policy in ('AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST'));
  end if;
end $$;

create or replace function private.stock_count_policy(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path=public,private
as $$
  select case
    when upper(trim(both '"' from coalesce(
      (select setting_value::text from public.app_settings
       where company_id=p_company_id and setting_key='stock_count_policy'),
      '"AUTO_ADJUST"'
    ))) in ('AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST')
    then upper(trim(both '"' from coalesce(
      (select setting_value::text from public.app_settings
       where company_id=p_company_id and setting_key='stock_count_policy'),
      '"AUTO_ADJUST"'
    )))
    else 'AUTO_ADJUST'
  end
$$;

create or replace function public.admin_set_stock_count_policy(p_policy text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  v_policy text:=upper(btrim(coalesce(p_policy,'')));
  old_policy text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if v_policy not in ('AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST') then
    raise exception 'INVALID_STOCK_COUNT_POLICY';
  end if;
  old_policy:=private.stock_count_policy(ctx.company_id);

  insert into public.app_settings(company_id,setting_key,setting_value)
  values(ctx.company_id,'stock_count_policy',to_jsonb(v_policy))
  on conflict(company_id,setting_key)
  do update set setting_value=excluded.setting_value;

  if old_policy<>v_policy then
    insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
    values(ctx.company_id,auth.uid(),'UPDATE_STOCK_COUNT_POLICY','app_settings','stock_count_policy',
      jsonb_build_object('policy',old_policy),
      jsonb_build_object('policy',v_policy));
  end if;

  return jsonb_build_object('policy',v_policy);
end $$;

revoke all on function public.admin_set_stock_count_policy(text) from public,anon;
grant execute on function public.admin_set_stock_count_policy(text) to authenticated;

create or replace function public.start_stock_count(p_warehouse_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  c record;
  lines jsonb;
  policy text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=ctx.company_id and active) then
    raise exception 'INVALID_WAREHOUSE';
  end if;

  select * into c from public.stock_counts
  where company_id=ctx.company_id and request_id=p_request_id limit 1;

  if not found then
    policy:=private.stock_count_policy(ctx.company_id);
    insert into public.stock_counts(company_id,count_no,warehouse_id,status,snapshot_at,request_id,adjustment_policy)
    values(ctx.company_id,private.next_doc_no('SC-','public.stock_counts'::regclass,'count_no',ctx.company_id),
      p_warehouse_id,'DRAFT',now(),p_request_id,policy)
    returning * into c;

    insert into public.stock_count_lines(company_id,count_id,product_id,book_qty,count_qty,pile_values)
    select ctx.company_id,c.id,p.id,coalesce(b.on_hand,0),null,'[]'::jsonb
    from public.products p
    left join public.stock_balances b
      on b.company_id=ctx.company_id and b.warehouse_id=p_warehouse_id and b.product_id=p.id
    where p.company_id=ctx.company_id and p.active;

    insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
    values(ctx.company_id,auth.uid(),'START_STOCK_COUNT','STOCK_COUNT',c.id::text,
      jsonb_build_object('count_no',c.count_no,'warehouse_id',p_warehouse_id,
        'snapshot_at',c.snapshot_at,'adjustment_policy',c.adjustment_policy));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'product_id',l.product_id,'book_qty',l.book_qty,'count_qty',l.count_qty,
    'pile_values',l.pile_values,'variance_reason',l.variance_reason
  ) order by p.code),'[]'::jsonb)
  into lines
  from public.stock_count_lines l
  join public.products p on p.id=l.product_id
  where l.count_id=c.id and l.company_id=ctx.company_id;

  return jsonb_build_object(
    'id',c.id,'count_no',c.count_no,'warehouse_id',c.warehouse_id,
    'status',c.status,'snapshot_at',c.snapshot_at,'adjustment_policy',c.adjustment_policy,'lines',lines
  );
end $$;

create or replace function public.finalize_stock_count(p_count_id uuid,p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  c record;
  l record;
  b record;
  delta numeric;
  changed integer:=0;
  final_status text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into c from public.stock_counts
  where id=p_count_id and company_id=ctx.company_id
  for update;
  if not found then raise exception 'STOCK_COUNT_NOT_FOUND'; end if;

  if c.status in ('ADJUSTED','FINAL') then
    return jsonb_build_object('id',c.id,'count_no',c.count_no,'status',c.status,
      'policy',c.adjustment_policy,'adjusted_lines',0);
  end if;
  if c.status<>'SUBMITTED' then raise exception 'STOCK_COUNT_NOT_SUBMITTED'; end if;

  if c.adjustment_policy='AUTO_ADJUST' then
    for l in
      select * from public.stock_count_lines
      where count_id=c.id and company_id=ctx.company_id
      order by product_id
    loop
      if l.count_qty is null then raise exception 'ALL_COUNT_LINES_REQUIRED'; end if;
      delta:=l.count_qty-l.book_qty;
      if delta=0 then continue; end if;

      select * into b from public.stock_balances
      where company_id=ctx.company_id
        and warehouse_id=c.warehouse_id
        and product_id=l.product_id
      for update;

      if not found then
        if delta<0 then raise exception 'INVALID_COUNT_QTY'; end if;
        insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
        values(ctx.company_id,c.warehouse_id,l.product_id,delta,0,1);
      else
        if b.on_hand+delta<0 then raise exception 'INVALID_COUNT_QTY'; end if;
        update public.stock_balances
        set on_hand=on_hand+delta,version=version+1
        where id=b.id;
      end if;

      insert into public.stock_movements(
        company_id,warehouse_id,product_id,movement_type,qty,
        reference_type,reference_no,request_id,created_by
      )
      values(
        ctx.company_id,c.warehouse_id,l.product_id,'COUNT_ADJUSTMENT',delta,
        'STOCK_COUNT',c.count_no,p_request_id||'-'||l.product_id::text,auth.uid()
      );
      changed:=changed+1;
    end loop;
    final_status:='ADJUSTED';
  else
    for l in
      select * from public.stock_count_lines
      where count_id=c.id and company_id=ctx.company_id
    loop
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

create table if not exists public.stock_adjustments(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  adjustment_no text not null,
  adjustment_date date not null,
  warehouse_id uuid not null references public.warehouses(id),
  source_count_id uuid references public.stock_counts(id),
  status text not null default 'SUBMITTED'
    check(status in ('SUBMITTED','POSTED','REVERSED')),
  reason text not null,
  note text,
  request_id text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  posted_by uuid,
  posted_at timestamptz,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  reversal_request_id text,
  unique(company_id,adjustment_no),
  unique(company_id,request_id)
);

create table if not exists public.stock_adjustment_lines(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  adjustment_id uuid not null references public.stock_adjustments(id) on delete cascade,
  line_no integer not null,
  product_id uuid not null references public.products(id),
  adjustment_qty numeric not null check(adjustment_qty<>0),
  reason text not null,
  unique(adjustment_id,line_no)
);

alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_lines enable row level security;

drop policy if exists tenant_select_stock_adjustments on public.stock_adjustments;
create policy tenant_select_stock_adjustments on public.stock_adjustments
for select to authenticated
using(company_id=(select public.current_company_id()));

drop policy if exists tenant_select_stock_adjustment_lines on public.stock_adjustment_lines;
create policy tenant_select_stock_adjustment_lines on public.stock_adjustment_lines
for select to authenticated
using(company_id=(select public.current_company_id()));

revoke insert,update,delete on public.stock_adjustments from authenticated;
revoke insert,update,delete on public.stock_adjustment_lines from authenticated;
grant select on public.stock_adjustments to authenticated;
grant select on public.stock_adjustment_lines to authenticated;

create index if not exists idx_stock_adjustments_company_date
on public.stock_adjustments(company_id,adjustment_date desc,created_at desc);
create index if not exists idx_stock_adjustment_lines_adjustment
on public.stock_adjustment_lines(adjustment_id,line_no);

create or replace function public.submit_stock_adjustment(
  p_adjustment_date date,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_reason text,
  p_note text,
  p_request_id text,
  p_adjustment_no text default null,
  p_source_count_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  existing record;
  aid uuid;
  ano text;
  manual_no text;
  item jsonb;
  n integer:=0;
  pid uuid;
  delta numeric;
  line_reason text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if p_adjustment_date is null then raise exception 'ADJUSTMENT_DATE_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'ADJUSTMENT_REASON_REQUIRED'; end if;

  select id,adjustment_no,status into existing
  from public.stock_adjustments
  where company_id=ctx.company_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('id',existing.id,'adjustment_no',existing.adjustment_no,
      'status',existing.status,'idempotent',true);
  end if;

  if exists(
    select 1 from public.period_closes
    where company_id=ctx.company_id
      and period_month=date_trunc('month',p_adjustment_date)::date
      and status='CLOSED'
  ) then raise exception 'PERIOD_CLOSED'; end if;

  if not exists(
    select 1 from public.warehouses
    where id=p_warehouse_id and company_id=ctx.company_id and active
  ) then raise exception 'INVALID_WAREHOUSE'; end if;

  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'ADJUSTMENT_LINES_REQUIRED';
  end if;
  if jsonb_array_length(p_lines)>200 then raise exception 'ADJUSTMENT_LINES_LIMIT'; end if;

  if p_source_count_id is not null and not exists(
    select 1 from public.stock_counts
    where id=p_source_count_id and company_id=ctx.company_id
      and warehouse_id=p_warehouse_id and status in ('FINAL','ADJUSTED')
  ) then raise exception 'INVALID_SOURCE_COUNT'; end if;

  manual_no:=nullif(btrim(coalesce(p_adjustment_no,'')),'');
  if manual_no is not null and length(manual_no)>100 then raise exception 'ADJUSTMENT_NO_TOO_LONG'; end if;
  if manual_no is not null and exists(
    select 1 from public.stock_adjustments
    where company_id=ctx.company_id and lower(adjustment_no)=lower(manual_no)
  ) then raise exception 'ADJUSTMENT_NO_EXISTS'; end if;

  ano:=coalesce(manual_no,
    private.next_doc_no('ADJ-','public.stock_adjustments'::regclass,'adjustment_no',ctx.company_id));

  insert into public.stock_adjustments(
    company_id,adjustment_no,adjustment_date,warehouse_id,source_count_id,
    status,reason,note,request_id,created_by
  )
  values(
    ctx.company_id,ano,p_adjustment_date,p_warehouse_id,p_source_count_id,
    'SUBMITTED',btrim(p_reason),nullif(btrim(p_note),''),p_request_id,auth.uid()
  )
  returning id into aid;

  for item in select value from jsonb_array_elements(p_lines) loop
    n:=n+1;
    pid:=(item->>'product_id')::uuid;
    delta:=coalesce((item->>'adjustment_qty')::numeric,0);
    line_reason:=coalesce(nullif(btrim(item->>'reason'),''),btrim(p_reason));

    if delta=0 then raise exception 'INVALID_ADJUSTMENT_QTY'; end if;
    if not exists(
      select 1 from public.products
      where id=pid and company_id=ctx.company_id and active
    ) then raise exception 'INVALID_PRODUCT'; end if;

    insert into public.stock_adjustment_lines(
      company_id,adjustment_id,line_no,product_id,adjustment_qty,reason
    )
    values(ctx.company_id,aid,n,pid,delta,line_reason);
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'SUBMIT_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',aid::text,
    jsonb_build_object('adjustment_no',ano,'warehouse_id',p_warehouse_id,
      'adjustment_date',p_adjustment_date,'line_count',n,'source_count_id',p_source_count_id));

  return jsonb_build_object('id',aid,'adjustment_no',ano,'status','SUBMITTED',
    'line_count',n,'idempotent',false);
end $$;

revoke all on function public.submit_stock_adjustment(date,uuid,jsonb,text,text,text,text,uuid)
from public,anon;
grant execute on function public.submit_stock_adjustment(date,uuid,jsonb,text,text,text,text,uuid)
to authenticated;

create or replace function public.post_stock_adjustment(
  p_adjustment_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  a record;
  l record;
  b record;
  movement_at timestamptz;
  posted integer:=0;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into a from public.stock_adjustments
  where id=p_adjustment_id and company_id=ctx.company_id
  for update;
  if not found then raise exception 'STOCK_ADJUSTMENT_NOT_FOUND'; end if;
  if a.status='POSTED' then
    return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,'status',a.status,'idempotent',true);
  end if;
  if a.status<>'SUBMITTED' then raise exception 'STOCK_ADJUSTMENT_NOT_POSTABLE'; end if;

  if exists(
    select 1 from public.period_closes
    where company_id=ctx.company_id
      and period_month=date_trunc('month',a.adjustment_date)::date
      and status='CLOSED'
  ) then raise exception 'PERIOD_CLOSED'; end if;

  movement_at:=(a.adjustment_date::timestamp + timezone('Asia/Bangkok',now())::time)
    at time zone 'Asia/Bangkok';

  for l in
    select * from public.stock_adjustment_lines
    where adjustment_id=a.id and company_id=ctx.company_id
    order by line_no
  loop
    select * into b from public.stock_balances
    where company_id=ctx.company_id
      and warehouse_id=a.warehouse_id
      and product_id=l.product_id
    for update;

    if not found then
      if l.adjustment_qty<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
      values(ctx.company_id,a.warehouse_id,l.product_id,l.adjustment_qty,0,1);
    else
      if b.on_hand+l.adjustment_qty<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.stock_balances
      set on_hand=on_hand+l.adjustment_qty,version=version+1
      where id=b.id;
    end if;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by,created_at
    )
    values(
      ctx.company_id,a.warehouse_id,l.product_id,'MANUAL_ADJUSTMENT',l.adjustment_qty,
      'STOCK_ADJUSTMENT',a.adjustment_no,
      p_request_id||'-'||l.line_no::text,auth.uid(),movement_at
    );
    posted:=posted+1;
  end loop;

  update public.stock_adjustments
  set status='POSTED',posted_by=auth.uid(),posted_at=now()
  where id=a.id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'POST_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',a.id::text,
    jsonb_build_object('adjustment_no',a.adjustment_no,'posted_lines',posted));

  return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,
    'status','POSTED','posted_lines',posted,'idempotent',false);
end $$;

revoke all on function public.post_stock_adjustment(uuid,text) from public,anon;
grant execute on function public.post_stock_adjustment(uuid,text) to authenticated;

create or replace function public.reverse_stock_adjustment(
  p_adjustment_id uuid,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  a record;
  l record;
  b record;
  reverse_delta numeric;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if nullif(btrim(p_request_id),'') is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'REVERSAL_REASON_REQUIRED'; end if;

  select * into a from public.stock_adjustments
  where id=p_adjustment_id and company_id=ctx.company_id
  for update;
  if not found then raise exception 'STOCK_ADJUSTMENT_NOT_FOUND'; end if;
  if a.status='REVERSED' then
    return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,'status','REVERSED','idempotent',true);
  end if;
  if a.status<>'POSTED' then raise exception 'STOCK_ADJUSTMENT_NOT_REVERSIBLE'; end if;

  if exists(
    select 1 from public.period_closes
    where company_id=ctx.company_id
      and period_month=date_trunc('month',a.adjustment_date)::date
      and status='CLOSED'
  ) then raise exception 'PERIOD_CLOSED'; end if;

  for l in
    select * from public.stock_adjustment_lines
    where adjustment_id=a.id and company_id=ctx.company_id
    order by line_no
  loop
    reverse_delta:=-l.adjustment_qty;
    select * into b from public.stock_balances
    where company_id=ctx.company_id
      and warehouse_id=a.warehouse_id
      and product_id=l.product_id
    for update;

    if not found then
      if reverse_delta<0 then raise exception 'REVERSAL_INSUFFICIENT_TARGET_STOCK'; end if;
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated,version)
      values(ctx.company_id,a.warehouse_id,l.product_id,reverse_delta,0,1);
    else
      if b.on_hand+reverse_delta<0 then raise exception 'REVERSAL_INSUFFICIENT_TARGET_STOCK'; end if;
      update public.stock_balances
      set on_hand=on_hand+reverse_delta,version=version+1
      where id=b.id;
    end if;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by
    )
    values(
      ctx.company_id,a.warehouse_id,l.product_id,'MANUAL_ADJUSTMENT_REVERSAL',reverse_delta,
      'STOCK_ADJUSTMENT_REVERSAL',a.adjustment_no,
      p_request_id||'-'||l.line_no::text,auth.uid()
    );
  end loop;

  update public.stock_adjustments
  set status='REVERSED',reversed_by=auth.uid(),reversed_at=now(),
      reversal_reason=btrim(p_reason),reversal_request_id=p_request_id
  where id=a.id;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(ctx.company_id,auth.uid(),'REVERSE_STOCK_ADJUSTMENT','STOCK_ADJUSTMENT',a.id::text,
    jsonb_build_object('status','POSTED'),
    jsonb_build_object('status','REVERSED','reason',btrim(p_reason)));

  return jsonb_build_object('id',a.id,'adjustment_no',a.adjustment_no,
    'status','REVERSED','idempotent',false);
end $$;

revoke all on function public.reverse_stock_adjustment(uuid,text,text) from public,anon;
grant execute on function public.reverse_stock_adjustment(uuid,text,text) to authenticated;
