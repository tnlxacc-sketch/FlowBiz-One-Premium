-- Complete Master/Cost setup and preserve accounting meaning:
-- Gross Profit = Revenue - Product Cost
-- Contribution Profit = Gross Profit - Freight - included direct expenses

alter table public.expense_types
  add column if not exists category text not null default 'DIRECT_EXPENSE',
  add column if not exists include_in_contribution boolean not null default true;

do $$ begin
  alter table public.expense_types add constraint expense_types_category_check
    check (category in ('DIRECT_EXPENSE','OPERATING_EXPENSE'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.expense_types add constraint expense_types_basis_check
    check (basis in ('MANUAL','FIXED_PER_TRIP','PER_KG','PERCENT_REVENUE'));
exception when duplicate_object then null; end $$;

create index if not exists expense_rates_lookup_idx
  on public.expense_rates(company_id,expense_type_id,effective_from,effective_to);
create index if not exists actual_expenses_trip_idx
  on public.actual_expenses(company_id,trip_id);

create or replace function public.complete_delivery(
  p_trip_id uuid,
  p_lines jsonb,
  p_actual_freight numeric,
  p_pod_reference text,
  p_request_id text,
  p_expenses jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private
as $$
declare
  ctx record; tr record; line jsonb; exp jsonb; dl record; ino text; iid uuid;
  rev numeric:=0; pcost numeric:=0; ocost numeric:=0;
  missing_cost boolean:=false; ucost numeric; inv_status text; expense_type record;
begin
  select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
  select * into tr from public.delivery_trips
    where id=p_trip_id and company_id=ctx.company_id for update;
  if not found then raise exception 'TRIP_NOT_FOUND'; end if;
  if tr.status='COMPLETED' then
    select invoice_id into iid from public.invoice_trips where trip_id=tr.id limit 1;
    return jsonb_build_object('trip_id',tr.id,'invoice_id',iid,'idempotent',true);
  end if;
  if p_actual_freight is null or p_actual_freight < 0 then raise exception 'INVALID_FREIGHT'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'DELIVERY_LINES_REQUIRED'; end if;

  for line in select * from jsonb_array_elements(p_lines) loop
    select * into dl from public.delivery_trip_lines
      where id=(line->>'trip_line_id')::uuid and trip_id=tr.id for update;
    if not found or (line->>'received_qty')::numeric<0 or (line->>'received_qty')::numeric>dl.issued_qty then
      raise exception 'INVALID_DELIVERY_QTY';
    end if;
    if (line->>'received_qty')::numeric<>dl.issued_qty
       and coalesce(btrim(line->>'variance_reason'),'')='' then
      raise exception 'DELIVERY_VARIANCE_REASON_REQUIRED';
    end if;
    update public.delivery_trip_lines
      set received_qty=(line->>'received_qty')::numeric,
          variance_reason=nullif(btrim(line->>'variance_reason'),'')
      where id=dl.id;
  end loop;

  delete from public.actual_expenses
    where company_id=ctx.company_id and trip_id=tr.id;
  if p_expenses is not null and jsonb_typeof(p_expenses)<>'array' then
    raise exception 'INVALID_EXPENSES';
  end if;
  for exp in select * from jsonb_array_elements(coalesce(p_expenses,'[]'::jsonb)) loop
    select * into expense_type from public.expense_types
      where id=(exp->>'expense_type_id')::uuid
        and company_id=ctx.company_id and active=true;
    if not found then raise exception 'INVALID_EXPENSE_TYPE'; end if;
    if coalesce((exp->>'amount')::numeric,-1)<0 then raise exception 'INVALID_EXPENSE_AMOUNT'; end if;
    if (exp->>'amount')::numeric>0 then
      insert into public.actual_expenses(company_id,trip_id,order_id,expense_type_id,amount,note)
      values(ctx.company_id,tr.id,tr.order_id,expense_type.id,(exp->>'amount')::numeric,nullif(btrim(exp->>'note'),''));
    end if;
  end loop;

  select coalesce(sum(dtl.received_qty*ol.unit_price),0) into rev
    from public.delivery_trip_lines dtl
    join public.order_lines ol on ol.id=dtl.order_line_id
    where dtl.trip_id=tr.id;

  for dl in
    select dtl.*,ol.unit_price from public.delivery_trip_lines dtl
    join public.order_lines ol on ol.id=dtl.order_line_id
    where dtl.trip_id=tr.id
  loop
    select m.unit_cost into ucost from public.monthly_product_costs m
      where m.company_id=ctx.company_id and m.product_id=dl.product_id
        and m.cost_month<=date_trunc('month',current_date)::date
      order by m.cost_month desc limit 1;
    if ucost is null then missing_cost:=true; ucost:=0; end if;
    pcost:=pcost+coalesce(dl.received_qty,0)*ucost;
  end loop;

  select coalesce(sum(a.amount),0) into ocost
    from public.actual_expenses a
    join public.expense_types e on e.id=a.expense_type_id
    where a.company_id=ctx.company_id and a.trip_id=tr.id
      and e.include_in_contribution=true;

  inv_status:=case when missing_cost then 'ESTIMATED' else 'FINAL' end;
  ino:=replace((select order_no from public.orders where id=tr.order_id),'SO-','INV-');
  insert into public.invoices(company_id,invoice_no,customer_id,invoice_date,revenue,product_cost,freight_cost,other_cost,gp_status)
  select ctx.company_id,ino,o.customer_id,current_date,rev,pcost,p_actual_freight,ocost,inv_status
    from public.orders o where o.id=tr.order_id returning id into iid;
  insert into public.invoice_orders(company_id,invoice_id,order_id)
    values(ctx.company_id,iid,tr.order_id);
  insert into public.invoice_trips(company_id,invoice_id,trip_id)
    values(ctx.company_id,iid,tr.id);
  update public.delivery_trips
    set status='COMPLETED',actual_freight=p_actual_freight,pod_reference=p_pod_reference,
        completed_at=now(),received_qty=(select sum(received_qty) from public.delivery_trip_lines where trip_id=tr.id)
    where id=tr.id;
  update public.orders set status='DELIVERED' where id=tr.order_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
    values(ctx.company_id,auth.uid(),'COMPLETE_DELIVERY','DELIVERY_TRIP',tr.id::text,
      jsonb_build_object('invoice_id',iid,'gp_status',inv_status,'request_id',p_request_id,
        'freight_cost',p_actual_freight,'direct_expense',ocost));
  return jsonb_build_object('trip_id',tr.id,'invoice_id',iid,'invoice_no',ino,
    'gp_status',inv_status,'gross_profit',rev-pcost,
    'contribution_profit',rev-pcost-p_actual_freight-ocost,'idempotent',false);
end $$;

revoke all on function public.complete_delivery(uuid,jsonb,numeric,text,text,jsonb) from public,anon;
grant execute on function public.complete_delivery(uuid,jsonb,numeric,text,text,jsonb) to authenticated;
