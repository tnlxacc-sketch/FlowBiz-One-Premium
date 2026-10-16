-- Dashboard chart uses all invoice rows, not a browser's recent window.
create or replace function public.report_monthly_summary(
  p_year integer,p_customer_id uuid default null,p_warehouse_id uuid default null,
  p_product_id uuid default null,p_vehicle_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  if p_year not between 2000 and 2100 then raise exception 'INVALID_REPORT_PERIOD'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('month',m,'sales',revenue,'gp',contribution,'count',invoices) order by m),'[]'::jsonb)
    into result from (
    select extract(month from i.invoice_date)::integer m,count(*) invoices,
      sum(i.revenue) revenue,
      sum(i.revenue-i.product_cost-i.freight_cost-i.other_cost) contribution
    from public.invoices i
    where i.company_id=ctx.company_id and i.invoice_date>=make_date(p_year,1,1)
      and i.invoice_date<make_date(p_year+1,1,1)
      and (p_customer_id is null or i.customer_id=p_customer_id)
      and (p_warehouse_id is null and p_product_id is null or exists(
        select 1 from public.invoice_orders io join public.order_lines ol on ol.order_id=io.order_id
        where io.invoice_id=i.id and (p_warehouse_id is null or ol.warehouse_id=p_warehouse_id)
          and (p_product_id is null or ol.product_id=p_product_id)))
      and (p_vehicle_id is null or exists(
        select 1 from public.invoice_trips it join public.delivery_trips t on t.id=it.trip_id
        where it.invoice_id=i.id and t.vehicle_id=p_vehicle_id))
    group by extract(month from i.invoice_date)::integer
  ) s;
  return result;
end $$;
revoke all on function public.report_monthly_summary(integer,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.report_monthly_summary(integer,uuid,uuid,uuid,uuid) to authenticated;
