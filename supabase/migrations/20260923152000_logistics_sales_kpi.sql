-- Include linked invoice revenue in complete delivery KPIs.
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
    'orders_in_period',count(*) filter (where o.order_date>=start_date and o.order_date<end_date),
    'pending_issue',count(*) filter (where o.status in ('CONFIRMED','PARTIAL_ISSUE')),
    'receipts_today',(select count(*) from public.goods_receipts g where g.company_id=ctx.company_id and g.receipt_date=(now() at time zone 'Asia/Bangkok')::date),
    'transfers_in_transit',(select count(*) from public.transfers tr where tr.company_id=ctx.company_id and tr.status='IN_TRANSIT')
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
