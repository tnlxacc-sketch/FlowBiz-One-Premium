-- FlowStock production transaction layer
-- Atomic stock/order/delivery operations, role-aware RLS, and audit trail.

create schema if not exists private;

alter table public.order_lines
  add column if not exists issued_qty numeric not null default 0;

do $$ begin
  alter table public.order_lines add constraint order_lines_issued_qty_check
    check (issued_qty >= 0 and issued_qty <= qty);
exception when duplicate_object then null; end $$;

alter table public.delivery_trips
  add column if not exists driver_id uuid references public.drivers(id),
  add column if not exists transport_supplier_id uuid references public.suppliers(id),
  add column if not exists standard_freight numeric,
  add column if not exists completed_at timestamptz,
  add column if not exists pod_reference text,
  add column if not exists request_id text;

create unique index if not exists delivery_trips_company_request_uq
  on public.delivery_trips(company_id, request_id) where request_id is not null;

create table if not exists public.delivery_trip_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  trip_id uuid not null references public.delivery_trips(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id),
  product_id uuid not null references public.products(id),
  issued_qty numeric not null check (issued_qty > 0),
  received_qty numeric check (received_qty >= 0),
  variance_reason text,
  unique(trip_id, order_line_id)
);

create index if not exists idx_delivery_trip_lines_company on public.delivery_trip_lines(company_id);
create index if not exists idx_delivery_trip_lines_trip on public.delivery_trip_lines(trip_id);
alter table public.delivery_trip_lines enable row level security;

-- Resolve the signed-in user's tenant without recursive RLS.
drop policy if exists tenant_select_user_profiles on public.user_profiles;
drop policy if exists tenant_insert_user_profiles on public.user_profiles;
drop policy if exists tenant_update_user_profiles on public.user_profiles;
drop policy if exists own_profile_select on public.user_profiles;
create policy own_profile_select on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.current_company_id()
returns uuid language sql stable security invoker set search_path = public
as $$
  select company_id from public.user_profiles
  where user_id = (select auth.uid()) and active = true limit 1
$$;

create or replace function public.current_app_role()
returns text language sql stable security invoker set search_path = public
as $$
  select app_role from public.user_profiles
  where user_id = (select auth.uid()) and active = true limit 1
$$;

revoke all on function public.current_company_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;

create or replace function private.require_role(allowed text[])
returns table(company_id uuid, app_role text)
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select p.company_id, p.app_role from public.user_profiles p
    where p.user_id = auth.uid() and p.active and p.app_role = any(allowed)
    limit 1;
  if not found then raise exception 'ROLE_NOT_ALLOWED'; end if;
end $$;
revoke all on function private.require_role(text[]) from public, anon, authenticated;

-- Tighten direct writes. Reads remain tenant-scoped; business writes use RPCs below.
do $block$
declare t text; p record;
begin
  foreach t in array array[
    'orders','order_lines','goods_receipts','goods_receipt_lines','stock_balances',
    'stock_movements','transfers','transfer_lines','delivery_trips','invoices',
    'invoice_orders','invoice_trips','actual_expenses','audit_logs'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE') loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $block$;

drop policy if exists tenant_select_delivery_trip_lines on public.delivery_trip_lines;
create policy tenant_select_delivery_trip_lines on public.delivery_trip_lines for select to authenticated
  using (company_id = (select public.current_company_id()));

-- Master/configuration writes are Admin-only.
do $block$
declare t text; p record;
begin
  foreach t in array array[
    'products','product_groups','customers','suppliers','warehouses','vehicles','drivers',
    'monthly_product_costs','expense_types','expense_rates','app_settings','period_closes'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE') loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy admin_insert_%I on public.%I for insert to authenticated with check (company_id=(select public.current_company_id()) and (select public.current_app_role())=''ADMIN'')',t,t);
    execute format('create policy admin_update_%I on public.%I for update to authenticated using (company_id=(select public.current_company_id()) and (select public.current_app_role())=''ADMIN'') with check (company_id=(select public.current_company_id()) and (select public.current_app_role())=''ADMIN'')',t,t);
    execute format('create policy admin_delete_%I on public.%I for delete to authenticated using (company_id=(select public.current_company_id()) and (select public.current_app_role())=''ADMIN'')',t,t);
  end loop;
end $block$;

create or replace function private.next_doc_no(prefix text, source_table regclass, number_column text, company uuid)
returns text language plpgsql volatile security definer set search_path=public,private
as $$
declare n int; result text;
begin
  perform pg_advisory_xact_lock(hashtext(company::text || prefix || current_date::text));
  execute format('select count(*)+1 from %s where company_id=$1 and %I like $2',source_table,number_column)
    into n using company, prefix||to_char(current_date,'YYMMDD')||'-%';
  result := prefix||to_char(current_date,'YYMMDD')||'-'||lpad(n::text,4,'0');
  return result;
end $$;
revoke all on function private.next_doc_no(text,regclass,text,uuid) from public,anon,authenticated;

create or replace function public.create_order(
  p_customer_id uuid, p_order_date date, p_requested_delivery_at timestamptz,
  p_lines jsonb, p_request_id text)
returns jsonb language plpgsql security definer
set search_path=public,private
as $$
declare ctx record; oid uuid; ono text; line jsonb; existing record;
begin
  select * into ctx from private.require_role(array['SALES','ADMIN']);
  if p_request_id is null or btrim(p_request_id)='' then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select id,order_no into existing from public.orders where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'order_no',existing.order_no,'idempotent',true); end if;
  if not exists(select 1 from public.customers where id=p_customer_id and company_id=ctx.company_id and active) then raise exception 'INVALID_CUSTOMER'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'ORDER_LINES_REQUIRED'; end if;
  ono:=private.next_doc_no('SO-', 'public.orders'::regclass, 'order_no', ctx.company_id);
  insert into public.orders(company_id,order_no,customer_id,order_date,requested_delivery_at,status,sales_user_id,request_id)
  values(ctx.company_id,ono,p_customer_id,p_order_date,p_requested_delivery_at,'CONFIRMED',auth.uid(),p_request_id) returning id into oid;
  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((line->>'qty')::numeric,0)<=0 or coalesce((line->>'unit_price')::numeric,-1)<0 then raise exception 'INVALID_ORDER_LINE'; end if;
    if not exists(select 1 from public.products where id=(line->>'product_id')::uuid and company_id=ctx.company_id and active) then raise exception 'INVALID_PRODUCT'; end if;
    if not exists(select 1 from public.warehouses where id=(line->>'warehouse_id')::uuid and company_id=ctx.company_id and active) then raise exception 'INVALID_WAREHOUSE'; end if;
    insert into public.order_lines(company_id,order_id,product_id,warehouse_id,qty,unit_price)
    values(ctx.company_id,oid,(line->>'product_id')::uuid,(line->>'warehouse_id')::uuid,(line->>'qty')::numeric,(line->>'unit_price')::numeric);
  end loop;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'CREATE_ORDER','ORDER',oid::text,jsonb_build_object('order_no',ono));
  return jsonb_build_object('id',oid,'order_no',ono,'idempotent',false);
end $$;

create or replace function public.post_goods_receipt(
  p_warehouse_id uuid, p_supplier_id uuid, p_source_doc_no text,
  p_receipt_date date, p_lines jsonb, p_request_id text)
returns jsonb language plpgsql security definer
set search_path=public,private
as $$
declare ctx record; gid uuid; gno text; line jsonb; existing record; rid text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  select id,gr_no into existing from public.goods_receipts where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'gr_no',existing.gr_no,'idempotent',true); end if;
  if not exists(select 1 from public.warehouses where id=p_warehouse_id and company_id=ctx.company_id and active) then raise exception 'INVALID_WAREHOUSE'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and company_id=ctx.company_id and active) then raise exception 'INVALID_SUPPLIER'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'RECEIPT_LINES_REQUIRED'; end if;
  gno:=private.next_doc_no('GR-', 'public.goods_receipts'::regclass, 'gr_no', ctx.company_id);
  insert into public.goods_receipts(company_id,gr_no,warehouse_id,supplier_id,source_doc_no,receipt_date,status,request_id)
  values(ctx.company_id,gno,p_warehouse_id,p_supplier_id,p_source_doc_no,p_receipt_date,'POSTED',p_request_id) returning id into gid;
  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((line->>'qty')::numeric,0)<=0 then raise exception 'INVALID_RECEIPT_QTY'; end if;
    insert into public.goods_receipt_lines(company_id,gr_id,product_id,qty,unit_cost)
    values(ctx.company_id,gid,(line->>'product_id')::uuid,(line->>'qty')::numeric,nullif(line->>'unit_cost','')::numeric);
    insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
    values(ctx.company_id,p_warehouse_id,(line->>'product_id')::uuid,(line->>'qty')::numeric,0)
    on conflict(company_id,warehouse_id,product_id) do update set on_hand=public.stock_balances.on_hand+excluded.on_hand,version=public.stock_balances.version+1;
    rid:=p_request_id||'-'||(line->>'product_id');
    insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
    values(ctx.company_id,p_warehouse_id,(line->>'product_id')::uuid,'RECEIPT',(line->>'qty')::numeric,'GOODS_RECEIPT',gno,rid,auth.uid());
  end loop;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'POST_GOODS_RECEIPT','GOODS_RECEIPT',gid::text,jsonb_build_object('gr_no',gno));
  return jsonb_build_object('id',gid,'gr_no',gno,'idempotent',false);
end $$;

create or replace function public.issue_order(p_order_id uuid, p_lines jsonb, p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; line jsonb; ol record; bal record; total_remaining numeric; rid text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  if exists(select 1 from public.audit_logs where company_id=ctx.company_id and action='ISSUE_ORDER' and after_data->>'request_id'=p_request_id) then
    return jsonb_build_object('order_id',p_order_id,'idempotent',true);
  end if;
  if not exists(select 1 from public.orders where id=p_order_id and company_id=ctx.company_id and status in ('CONFIRMED','PARTIAL_ISSUE')) then raise exception 'ORDER_NOT_ISSUABLE'; end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    select * into ol from public.order_lines where id=(line->>'order_line_id')::uuid and order_id=p_order_id and company_id=ctx.company_id for update;
    if not found or coalesce((line->>'qty')::numeric,0)<=0 or ol.issued_qty+(line->>'qty')::numeric>ol.qty then raise exception 'INVALID_ISSUE_QTY'; end if;
    select * into bal from public.stock_balances where company_id=ctx.company_id and warehouse_id=ol.warehouse_id and product_id=ol.product_id for update;
    if not found or bal.on_hand-bal.allocated < (line->>'qty')::numeric then raise exception 'INSUFFICIENT_STOCK'; end if;
    update public.stock_balances set on_hand=on_hand-(line->>'qty')::numeric,version=version+1 where id=bal.id;
    update public.order_lines set issued_qty=issued_qty+(line->>'qty')::numeric where id=ol.id;
    rid:=p_request_id||'-'||ol.id::text;
    insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
    select ctx.company_id,ol.warehouse_id,ol.product_id,'ORDER_ISSUE',-(line->>'qty')::numeric,'ORDER',o.order_no,rid,auth.uid() from public.orders o where o.id=p_order_id;
  end loop;
  select sum(qty-issued_qty) into total_remaining from public.order_lines where order_id=p_order_id;
  update public.orders set status=case when total_remaining=0 then 'WAITING_LOGISTICS' else 'PARTIAL_ISSUE' end where id=p_order_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ISSUE_ORDER','ORDER',p_order_id::text,jsonb_build_object('request_id',p_request_id,'lines',p_lines));
  return jsonb_build_object('order_id',p_order_id,'status',case when total_remaining=0 then 'WAITING_LOGISTICS' else 'PARTIAL_ISSUE' end,'idempotent',false);
end $$;

create or replace function public.create_transfer(
  p_from_warehouse_id uuid,p_to_warehouse_id uuid,p_product_id uuid,p_qty numeric,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; tid uuid; tno text; bal record; existing record;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  select id,transfer_no into existing from public.transfers where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'transfer_no',existing.transfer_no,'idempotent',true); end if;
  if p_from_warehouse_id=p_to_warehouse_id or p_qty<=0 then raise exception 'INVALID_TRANSFER'; end if;
  select * into bal from public.stock_balances where company_id=ctx.company_id and warehouse_id=p_from_warehouse_id and product_id=p_product_id for update;
  if not found or bal.on_hand-bal.allocated<p_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
  tno:=private.next_doc_no('TR-', 'public.transfers'::regclass, 'transfer_no', ctx.company_id);
  insert into public.transfers(company_id,transfer_no,from_warehouse_id,to_warehouse_id,status,request_id)
  values(ctx.company_id,tno,p_from_warehouse_id,p_to_warehouse_id,'IN_TRANSIT',p_request_id) returning id into tid;
  insert into public.transfer_lines(company_id,transfer_id,product_id,sent_qty) values(ctx.company_id,tid,p_product_id,p_qty);
  update public.stock_balances set on_hand=on_hand-p_qty,version=version+1 where id=bal.id;
  insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
  values(ctx.company_id,p_from_warehouse_id,p_product_id,'TRANSFER_OUT',-p_qty,'TRANSFER',tno,p_request_id||'-OUT',auth.uid());
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'CREATE_TRANSFER','TRANSFER',tid::text,jsonb_build_object('transfer_no',tno,'qty',p_qty));
  return jsonb_build_object('id',tid,'transfer_no',tno,'idempotent',false);
end $$;

create or replace function public.receive_transfer(p_transfer_id uuid,p_received_qty numeric,p_variance_reason text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; tr record; tl record;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  select * into tr from public.transfers where id=p_transfer_id and company_id=ctx.company_id for update;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if tr.status='COMPLETED' then return jsonb_build_object('id',tr.id,'transfer_no',tr.transfer_no,'idempotent',true); end if;
  select * into tl from public.transfer_lines where transfer_id=tr.id for update;
  if p_received_qty<0 or p_received_qty>tl.sent_qty then raise exception 'INVALID_RECEIVED_QTY'; end if;
  if p_received_qty<>tl.sent_qty and coalesce(btrim(p_variance_reason),'')='' then raise exception 'VARIANCE_REASON_REQUIRED'; end if;
  update public.transfer_lines set received_qty=p_received_qty,variance_reason=p_variance_reason where id=tl.id;
  update public.transfers set status='COMPLETED' where id=tr.id;
  insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
  values(ctx.company_id,tr.to_warehouse_id,tl.product_id,p_received_qty,0)
  on conflict(company_id,warehouse_id,product_id) do update set on_hand=public.stock_balances.on_hand+excluded.on_hand,version=public.stock_balances.version+1;
  insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
  values(ctx.company_id,tr.to_warehouse_id,tl.product_id,'TRANSFER_IN',p_received_qty,'TRANSFER',tr.transfer_no,p_request_id||'-IN',auth.uid());
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'RECEIVE_TRANSFER','TRANSFER',tr.id::text,jsonb_build_object('received_qty',p_received_qty,'variance_reason',p_variance_reason));
  return jsonb_build_object('id',tr.id,'transfer_no',tr.transfer_no,'variance',tl.sent_qty-p_received_qty,'idempotent',false);
end $$;

create or replace function public.create_delivery_trip(
  p_order_id uuid,p_vehicle_id uuid,p_driver_id uuid,p_transport_supplier_id uuid,
  p_planned_start timestamptz,p_planned_end timestamptz,p_standard_freight numeric,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; tid uuid; tno text; existing record;
begin
  select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
  select id,trip_no into existing from public.delivery_trips where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'trip_no',existing.trip_no,'idempotent',true); end if;
  if not exists(select 1 from public.orders where id=p_order_id and company_id=ctx.company_id and status='WAITING_LOGISTICS') then raise exception 'ORDER_NOT_READY_FOR_DELIVERY'; end if;
  if p_planned_end<=p_planned_start then raise exception 'INVALID_TRIP_TIME'; end if;
  if p_vehicle_id is not null and exists(select 1 from public.delivery_trips where company_id=ctx.company_id and vehicle_id=p_vehicle_id and status not in ('COMPLETED','CANCELLED') and tstzrange(planned_start,planned_end,'[)') && tstzrange(p_planned_start,p_planned_end,'[)')) then raise exception 'VEHICLE_TIME_CONFLICT'; end if;
  tno:=private.next_doc_no('TRIP-', 'public.delivery_trips'::regclass, 'trip_no', ctx.company_id);
  insert into public.delivery_trips(company_id,trip_no,order_id,vehicle_id,driver_id,transport_supplier_id,planned_start,planned_end,standard_freight,status,request_id)
  values(ctx.company_id,tno,p_order_id,p_vehicle_id,p_driver_id,p_transport_supplier_id,p_planned_start,p_planned_end,p_standard_freight,'PLANNED',p_request_id) returning id into tid;
  insert into public.delivery_trip_lines(company_id,trip_id,order_line_id,product_id,issued_qty)
  select ctx.company_id,tid,id,product_id,issued_qty from public.order_lines where order_id=p_order_id and issued_qty>0;
  update public.orders set status='IN_DELIVERY' where id=p_order_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'CREATE_DELIVERY_TRIP','DELIVERY_TRIP',tid::text,jsonb_build_object('trip_no',tno));
  return jsonb_build_object('id',tid,'trip_no',tno,'idempotent',false);
end $$;

create or replace function public.complete_delivery(
  p_trip_id uuid,p_lines jsonb,p_actual_freight numeric,p_pod_reference text,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; tr record; line jsonb; dl record; ino text; iid uuid; rev numeric:=0; pcost numeric:=0; ocost numeric:=0; missing_cost boolean:=false; ucost numeric; inv_status text;
begin
  select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
  select * into tr from public.delivery_trips where id=p_trip_id and company_id=ctx.company_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;
  if tr.status='COMPLETED' then select invoice_id into iid from public.invoice_trips where trip_id=tr.id limit 1; return jsonb_build_object('trip_id',tr.id,'invoice_id',iid,'idempotent',true); end if;
  for line in select * from jsonb_array_elements(p_lines) loop
    select * into dl from public.delivery_trip_lines where id=(line->>'trip_line_id')::uuid and trip_id=tr.id for update;
    if not found or (line->>'received_qty')::numeric<0 or (line->>'received_qty')::numeric>dl.issued_qty then raise exception 'INVALID_DELIVERY_QTY'; end if;
    if (line->>'received_qty')::numeric<>dl.issued_qty and coalesce(btrim(line->>'variance_reason'),'')='' then raise exception 'DELIVERY_VARIANCE_REASON_REQUIRED'; end if;
    update public.delivery_trip_lines set received_qty=(line->>'received_qty')::numeric,variance_reason=line->>'variance_reason' where id=dl.id;
  end loop;
  select coalesce(sum(dtl.received_qty*ol.unit_price),0) into rev from public.delivery_trip_lines dtl join public.order_lines ol on ol.id=dtl.order_line_id where dtl.trip_id=tr.id;
  for dl in select dtl.*,ol.unit_price from public.delivery_trip_lines dtl join public.order_lines ol on ol.id=dtl.order_line_id where dtl.trip_id=tr.id loop
    select m.unit_cost into ucost from public.monthly_product_costs m where m.company_id=ctx.company_id and m.product_id=dl.product_id and m.cost_month<=date_trunc('month',current_date)::date order by m.cost_month desc limit 1;
    if ucost is null then missing_cost:=true; ucost:=0; end if;
    pcost:=pcost+coalesce(dl.received_qty,0)*ucost;
  end loop;
  select coalesce(sum(amount),0) into ocost from public.actual_expenses where company_id=ctx.company_id and trip_id=tr.id;
  inv_status:=case when missing_cost then 'ESTIMATED' else 'FINAL' end;
  ino:=replace((select order_no from public.orders where id=tr.order_id),'SO-','INV-');
  insert into public.invoices(company_id,invoice_no,customer_id,invoice_date,revenue,product_cost,freight_cost,other_cost,gp_status)
  select ctx.company_id,ino,o.customer_id,current_date,rev,pcost,coalesce(p_actual_freight,tr.standard_freight,0),ocost,inv_status from public.orders o where o.id=tr.order_id returning id into iid;
  insert into public.invoice_orders(company_id,invoice_id,order_id) values(ctx.company_id,iid,tr.order_id);
  insert into public.invoice_trips(company_id,invoice_id,trip_id) values(ctx.company_id,iid,tr.id);
  update public.delivery_trips set status='COMPLETED',actual_freight=p_actual_freight,pod_reference=p_pod_reference,completed_at=now(),received_qty=(select sum(received_qty) from public.delivery_trip_lines where trip_id=tr.id) where id=tr.id;
  update public.orders set status='DELIVERED' where id=tr.order_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data) values(ctx.company_id,auth.uid(),'COMPLETE_DELIVERY','DELIVERY_TRIP',tr.id::text,jsonb_build_object('invoice_id',iid,'gp_status',inv_status,'request_id',p_request_id));
  return jsonb_build_object('trip_id',tr.id,'invoice_id',iid,'invoice_no',ino,'gp_status',inv_status,'idempotent',false);
end $$;

-- Explicit RPC grants only; service-role/postgres retain ownership privileges.
revoke all on function public.claim_first_admin() from authenticated, anon;
revoke all on function public.create_order(uuid,date,timestamptz,jsonb,text) from public,anon;
revoke all on function public.post_goods_receipt(uuid,uuid,text,date,jsonb,text) from public,anon;
revoke all on function public.issue_order(uuid,jsonb,text) from public,anon;
revoke all on function public.create_transfer(uuid,uuid,uuid,numeric,text) from public,anon;
revoke all on function public.receive_transfer(uuid,numeric,text,text) from public,anon;
revoke all on function public.create_delivery_trip(uuid,uuid,uuid,uuid,timestamptz,timestamptz,numeric,text) from public,anon;
revoke all on function public.complete_delivery(uuid,jsonb,numeric,text,text) from public,anon;
grant execute on function public.create_order(uuid,date,timestamptz,jsonb,text) to authenticated;
grant execute on function public.post_goods_receipt(uuid,uuid,text,date,jsonb,text) to authenticated;
grant execute on function public.issue_order(uuid,jsonb,text) to authenticated;
grant execute on function public.create_transfer(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.receive_transfer(uuid,numeric,text,text) to authenticated;
grant execute on function public.create_delivery_trip(uuid,uuid,uuid,uuid,timestamptz,timestamptz,numeric,text) to authenticated;
grant execute on function public.complete_delivery(uuid,jsonb,numeric,text,text) to authenticated;

grant select on public.delivery_trip_lines to authenticated;

