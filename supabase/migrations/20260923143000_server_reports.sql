-- Invoice detail stays on the database; the browser receives only one page.
create or replace function public.report_invoice_page(
  p_year integer, p_month integer default null, p_customer_id uuid default null,
  p_product_id uuid default null, p_warehouse_id uuid default null,
  p_vehicle_id uuid default null, p_search text default '', p_page integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; date_from date; date_to date; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  if p_year not between 2000 and 2100 or (p_month is not null and p_month not between 1 and 12)
    or p_page not between 0 and 9999 then raise exception 'INVALID_REPORT_PAGE'; end if;
  date_from:=make_date(p_year,coalesce(p_month,1),1);
  date_to:=case when p_month is null then (date_from+interval '1 year')::date else (date_from+interval '1 month')::date end;
  with filtered as (
    select i.id,i.invoice_no,i.invoice_date,i.customer_id,i.revenue,i.product_cost,
      i.freight_cost,i.other_cost,i.gp_status
    from public.invoices i
    where i.company_id=ctx.company_id and i.invoice_date>=date_from and i.invoice_date<date_to
      and (p_customer_id is null or i.customer_id=p_customer_id)
      and (p_warehouse_id is null and p_product_id is null or exists(
        select 1 from public.invoice_orders io join public.order_lines ol on ol.order_id=io.order_id
        where io.invoice_id=i.id and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
          and (p_product_id is null or ol.product_id=p_product_id)))
      and (p_vehicle_id is null or exists(
        select 1 from public.invoice_trips it join public.delivery_trips t on t.id=it.trip_id
        where it.invoice_id=i.id and t.vehicle_id=p_vehicle_id))
      and (btrim(p_search)='' or i.invoice_no ilike '%'||btrim(p_search)||'%'
        or exists(select 1 from public.customers c where c.id=i.customer_id
          and (c.name ilike '%'||btrim(p_search)||'%' or c.code ilike '%'||btrim(p_search)||'%'))
        or exists(select 1 from public.invoice_orders io join public.order_lines ol on ol.order_id=io.order_id
          join public.products p on p.id=ol.product_id
          where io.invoice_id=i.id and (p.name ilike '%'||btrim(p_search)||'%' or p.code ilike '%'||btrim(p_search)||'%')))
  ), page as (
    select * from filtered order by invoice_date desc,id desc limit 50 offset p_page*50
  ), detail as (
    select p.*,c.name customer_name,o.order_no,t.trip_no,v.plate_no,d.name driver_name,
      coalesce(lines.products,'[]'::jsonb) products,coalesce(lines.order_qty,0) order_qty,
      coalesce(lines.received_qty,0) received_qty
    from page p
    left join public.customers c on c.id=p.customer_id
    left join lateral (
      select o.id,o.order_no from public.invoice_orders io join public.orders o on o.id=io.order_id
      where io.invoice_id=p.id order by o.id limit 1
    ) o on true
    left join lateral (
      select t.id,t.trip_no,t.vehicle_id,t.driver_id from public.invoice_trips it
      join public.delivery_trips t on t.id=it.trip_id where it.invoice_id=p.id order by t.id limit 1
    ) t on true
    left join public.vehicles v on v.id=t.vehicle_id
    left join public.drivers d on d.id=t.driver_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'code',pr.code,'name',pr.name,'uom',pr.base_uom,'order_qty',ol.qty,
        'received_qty',coalesce(dl.received_qty,0),'warehouse',w.code
      ) order by ol.id) products,sum(ol.qty) order_qty,sum(coalesce(dl.received_qty,0)) received_qty
      from public.order_lines ol
      join public.products pr on pr.id=ol.product_id
      join public.warehouses w on w.id=ol.warehouse_id
      left join lateral (
        select sum(dtl.received_qty) received_qty
        from public.delivery_trip_lines dtl join public.invoice_trips it on it.trip_id=dtl.trip_id
        where it.invoice_id=p.id and dtl.order_line_id=ol.id
      ) dl on true
      where ol.order_id=o.id
    ) lines on true
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'page',p_page,
    'items',coalesce((select jsonb_agg(to_jsonb(d) order by d.invoice_date desc,d.id desc) from detail d),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.report_invoice_page(integer,integer,uuid,uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.report_invoice_page(integer,integer,uuid,uuid,uuid,uuid,text,integer) to authenticated;
