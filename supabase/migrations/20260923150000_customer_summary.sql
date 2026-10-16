-- Aggregate customer cards at the source so report pages are independent of browser row caps.
create or replace function public.report_customer_summary(
  p_year integer, p_month integer default null, p_warehouse_id uuid default null,
  p_product_id uuid default null, p_vehicle_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; date_from date; date_to date; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  if p_year not between 2000 and 2100 or (p_month is not null and p_month not between 1 and 12)
    then raise exception 'INVALID_REPORT_PERIOD'; end if;
  date_from:=make_date(p_year,coalesce(p_month,1),1);
  date_to:=case when p_month is null then (date_from+interval '1 year')::date else (date_from+interval '1 month')::date end;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.revenue desc,s.customer_id),'[]'::jsonb)
    into result from (
    select i.customer_id,c.name,c.code,count(*) invoices,sum(i.revenue) revenue,
      sum(i.product_cost) product_cost,sum(i.freight_cost) freight_cost,sum(i.other_cost) other_cost
    from public.invoices i join public.customers c on c.id=i.customer_id
    where i.company_id=ctx.company_id and i.invoice_date>=date_from and i.invoice_date<date_to
      and (p_warehouse_id is null and p_product_id is null or exists(
        select 1 from public.invoice_orders io join public.order_lines ol on ol.order_id=io.order_id
        where io.invoice_id=i.id and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
          and (p_product_id is null or ol.product_id=p_product_id)))
      and (p_vehicle_id is null or exists(
        select 1 from public.invoice_trips it join public.delivery_trips t on t.id=it.trip_id
        where it.invoice_id=i.id and t.vehicle_id=p_vehicle_id))
    group by i.customer_id,c.name,c.code
  ) s;
  return result;
end $$;
revoke all on function public.report_customer_summary(integer,integer,uuid,uuid,uuid) from public,anon;
grant execute on function public.report_customer_summary(integer,integer,uuid,uuid,uuid) to authenticated;
