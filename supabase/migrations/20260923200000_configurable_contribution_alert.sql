-- Per-company Contribution alert policy and server-side invoice drill-down.
-- Existing 12% behavior remains the default until an Admin saves a different value.
alter table public.app_settings add constraint app_settings_contribution_pct_valid
  check (setting_key <> 'contribution_alert_pct' or
    (jsonb_typeof(setting_value)='number' and (setting_value #>> '{}')::numeric between 0 and 100));

create or replace function private.contribution_alert_pct(p_company_id uuid)
returns numeric language sql stable security definer set search_path=public,private
as $$ select coalesce((select (setting_value #>> '{}')::numeric from public.app_settings
  where company_id=p_company_id and setting_key='contribution_alert_pct'),12)::numeric $$;
revoke all on function private.contribution_alert_pct(uuid) from public,anon,authenticated;

create or replace function public.admin_set_contribution_alert_pct(p_pct numeric)
returns numeric language plpgsql security definer set search_path=public,private
as $$
declare ctx record; old_pct numeric;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_pct is null or p_pct < 0 or p_pct > 100 or scale(p_pct)>2 then
    raise exception 'INVALID_CONTRIBUTION_THRESHOLD';
  end if;
  old_pct:=private.contribution_alert_pct(ctx.company_id);
  insert into public.app_settings(company_id,setting_key,setting_value)
    values(ctx.company_id,'contribution_alert_pct',to_jsonb(p_pct))
    on conflict(company_id,setting_key) do update set setting_value=excluded.setting_value;
  if old_pct<>p_pct then
    insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
    values(ctx.company_id,auth.uid(),'UPDATE_CONTRIBUTION_ALERT_PCT','app_settings',
      'contribution_alert_pct',jsonb_build_object('pct',old_pct),jsonb_build_object('pct',p_pct));
  end if;
  return p_pct;
end $$;
revoke all on function public.admin_set_contribution_alert_pct(numeric) from public,anon;
grant execute on function public.admin_set_contribution_alert_pct(numeric) to authenticated;

-- Show conflicts between a completed status and a completion time in the future.
create or replace function public.report_today_status()
returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; threshold numeric; day_th date; start_at timestamptz; end_at timestamptz; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  threshold:=private.contribution_alert_pct(ctx.company_id);
  day_th:=(now() at time zone 'Asia/Bangkok')::date;
  start_at:=day_th::timestamp at time zone 'Asia/Bangkok';
  end_at:=(day_th+1)::timestamp at time zone 'Asia/Bangkok';
  select jsonb_build_object(
    'date',day_th,
    'contribution_threshold_pct',threshold,
    'orders', (select count(*) from public.orders o where o.company_id=ctx.company_id and o.order_date=day_th),
    'invoices', (select count(*) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th),
    'revenue', (select coalesce(sum(i.revenue),0) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th),
    'trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at),
    'completed_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at and t.status='COMPLETED'),
    'future_completed_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at and t.status='COMPLETED' and t.completed_at>now()),
    'waiting_logistics', (select count(*) from public.orders o where o.company_id=ctx.company_id and o.status='WAITING_LOGISTICS'),
    'late_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.status<>'COMPLETED' and t.planned_end<now()),
    'stockout_rows', (select count(*) from public.stock_balances b where b.company_id=ctx.company_id and b.on_hand<=0),
    'low_contribution_invoices', (select count(*) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th and i.revenue>0 and (i.revenue-i.product_cost-i.freight_cost-i.other_cost)/i.revenue<threshold/100)
  ) into result;
  return result;
end $$;
revoke all on function public.report_today_status() from public,anon;
grant execute on function public.report_today_status() to authenticated;

-- Operational KPI counts are calculated in Postgres, independently of recent rows.
create or replace function public.report_kpis(
  p_year integer, p_month integer default null, p_warehouse_id uuid default null,
  p_customer_id uuid default null, p_product_id uuid default null, p_vehicle_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare
  ctx record;
  threshold numeric;
  start_date date;
  end_date date;
  finances jsonb;
  logistics jsonb;
  pipeline jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  threshold:=private.contribution_alert_pct(ctx.company_id);
  if p_year not between 2000 and 2100 or (p_month is not null and p_month not between 1 and 12)
    then raise exception 'INVALID_REPORT_PERIOD'; end if;
  start_date:=make_date(p_year,coalesce(p_month,1),1);
  end_date:=case when p_month is null then start_date+interval '1 year' else start_date+interval '1 month' end;

  select jsonb_build_object(
    'invoices',count(*),'revenue',coalesce(sum(i.revenue),0),
    'product_cost',coalesce(sum(i.product_cost),0),
    'freight_cost',coalesce(sum(i.freight_cost),0),
    'other_cost',coalesce(sum(i.other_cost),0),
    'contribution_threshold_pct',threshold,
    'estimated',count(*) filter (where i.gp_status='ESTIMATED'),
    'low_contribution',count(*) filter (where i.revenue>0 and
      (i.revenue-i.product_cost-i.freight_cost-i.other_cost)/i.revenue < threshold/100)
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

create or replace function public.report_low_contribution_page(p_date date,p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; threshold numeric; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  if p_date is null or p_page not between 0 and 9999 then raise exception 'INVALID_REPORT_PAGE'; end if;
  threshold:=private.contribution_alert_pct(ctx.company_id);
  with filtered as (
    select i.id,i.invoice_no,i.invoice_date,i.customer_id,i.revenue,i.product_cost,
      i.freight_cost,i.other_cost,i.gp_status
    from public.invoices i
    where i.company_id=ctx.company_id and i.invoice_date=p_date and i.revenue>0
      and (i.revenue-i.product_cost-i.freight_cost-i.other_cost)/i.revenue<threshold/100
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
revoke all on function public.report_low_contribution_page(date,integer) from public,anon;
grant execute on function public.report_low_contribution_page(date,integer) to authenticated;
