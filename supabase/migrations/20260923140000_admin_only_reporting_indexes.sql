-- Self-service enrollment is closed. Existing pending accounts may be attached by an Admin.
revoke execute on function public.request_access(text,text,text,text) from public, anon, authenticated;
revoke execute on function public.claim_tenant_admin(text,text,text) from public, anon, authenticated;
revoke execute on function public.approve_access(uuid,text) from public, anon, authenticated;
revoke execute on function public.reject_access(uuid) from public, anon, authenticated;

create index if not exists flowstock_invoices_company_date_idx on public.invoices(company_id, invoice_date desc, id);
create index if not exists flowstock_orders_company_date_idx on public.orders(company_id, order_date desc, id);
create index if not exists flowstock_orders_company_customer_date_idx on public.orders(company_id, customer_id, order_date desc);
create index if not exists flowstock_trips_company_date_idx on public.delivery_trips(company_id, planned_start desc, id);
create index if not exists flowstock_trips_company_vehicle_date_idx on public.delivery_trips(company_id, vehicle_id, planned_start desc);
create index if not exists flowstock_movements_company_date_idx on public.stock_movements(company_id, created_at desc, id);
create index if not exists flowstock_invoice_orders_order_idx on public.invoice_orders(order_id, invoice_id);
create index if not exists flowstock_invoice_trips_trip_idx on public.invoice_trips(trip_id, invoice_id);
create index if not exists flowstock_order_lines_order_product_idx on public.order_lines(order_id, product_id);
create index if not exists flowstock_order_lines_order_warehouse_idx on public.order_lines(order_id, warehouse_id);

create or replace function public.report_kpis(
  p_year integer, p_month integer default null, p_warehouse_id uuid default null,
  p_customer_id uuid default null, p_product_id uuid default null, p_vehicle_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare
  ctx record;
  start_date date;
  end_date date;
  finances jsonb;
  logistics jsonb;
  pipeline jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  if p_year not between 2000 and 2100 or (p_month is not null and p_month not between 1 and 12)
    then raise exception 'INVALID_REPORT_PERIOD'; end if;
  start_date:=make_date(p_year,coalesce(p_month,1),1);
  end_date:=case when p_month is null then start_date+interval '1 year' else start_date+interval '1 month' end;

  select jsonb_build_object(
    'invoices',count(*),'revenue',coalesce(sum(i.revenue),0),
    'product_cost',coalesce(sum(i.product_cost),0),
    'freight_cost',coalesce(sum(i.freight_cost),0),
    'other_cost',coalesce(sum(i.other_cost),0),
    'estimated',count(*) filter (where i.gp_status='ESTIMATED'),
    'low_contribution',count(*) filter (where i.revenue>0 and
      (i.revenue-i.product_cost-i.freight_cost-i.other_cost)/i.revenue < 0.12)
  ) into finances
  from public.invoices i
  where i.company_id=ctx.company_id and i.invoice_date>=start_date and i.invoice_date<end_date
    and (p_customer_id is null or i.customer_id=p_customer_id)
    and (p_warehouse_id is null and p_product_id is null and p_vehicle_id is null or exists (
      select 1 from public.invoice_orders io join public.order_lines ol on ol.order_id=io.order_id
      where io.invoice_id=i.id
        and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
        and (p_product_id is null or ol.product_id=p_product_id)
        and (p_vehicle_id is null or exists (
          select 1 from public.invoice_trips it join public.delivery_trips t on t.id=it.trip_id
          where it.invoice_id=i.id and t.vehicle_id=p_vehicle_id))
    ));

  select jsonb_build_object(
    'trips',count(*),'completed',count(*) filter (where t.status='COMPLETED'),
    'late',count(*) filter (where t.status<>'COMPLETED' and t.planned_end<now()),
    'on_time',count(*) filter (where t.status='COMPLETED' and t.completed_at<=t.planned_end),
    'freight',coalesce(sum(coalesce(t.actual_freight,t.standard_freight,0)),0),
    'standard_freight',coalesce(sum(t.standard_freight),0),
    'sales',coalesce(sum((select sum(i.revenue) from public.invoice_trips it
      join public.invoices i on i.id=it.invoice_id where it.trip_id=t.id)),0),
    'issued_qty',coalesce(sum((select sum(l.issued_qty) from public.delivery_trip_lines l where l.trip_id=t.id)),0),
    'received_qty',coalesce(sum((select sum(coalesce(l.received_qty,0)) from public.delivery_trip_lines l where l.trip_id=t.id)),0)
  ) into logistics
  from public.delivery_trips t join public.orders o on o.id=t.order_id
  where t.company_id=ctx.company_id and t.planned_start>=start_date and t.planned_start<end_date
    and (p_vehicle_id is null or t.vehicle_id=p_vehicle_id)
    and (p_customer_id is null or o.customer_id=p_customer_id)
    and (p_warehouse_id is null and p_product_id is null or exists (
      select 1 from public.order_lines ol where ol.order_id=o.id
      and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
      and (p_product_id is null or ol.product_id=p_product_id)));

  select jsonb_build_object(
    'orders_today',count(*) filter (where o.order_date=(now() at time zone 'Asia/Bangkok')::date),
    'open_orders',count(*) filter (where o.status not in ('DELIVERED','CANCELLED')),
    'waiting_logistics',count(*) filter (where o.status='WAITING_LOGISTICS'),
    'orders_in_period',count(*) filter (where o.order_date>=start_date and o.order_date<end_date)
  ) into pipeline
  from public.orders o
  where o.company_id=ctx.company_id
    and (p_customer_id is null or o.customer_id=p_customer_id)
    and (p_warehouse_id is null and p_product_id is null or exists(
      select 1 from public.order_lines ol where ol.order_id=o.id
      and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
      and (p_product_id is null or ol.product_id=p_product_id)));

  return jsonb_build_object('year',p_year,'month',p_month,'finances',finances,
    'logistics',logistics,'pipeline',pipeline);
end $$;
revoke all on function public.report_kpis(integer,integer,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.report_kpis(integer,integer,uuid,uuid,uuid,uuid) to authenticated;
