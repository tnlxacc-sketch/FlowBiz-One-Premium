-- Show conflicts between a completed status and a completion time in the future.
create or replace function public.report_today_status()
returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare ctx record; day_th date; start_at timestamptz; end_at timestamptz; result jsonb;
begin
  select * into ctx from private.require_role(array['SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN']);
  day_th:=(now() at time zone 'Asia/Bangkok')::date;
  start_at:=day_th::timestamp at time zone 'Asia/Bangkok';
  end_at:=(day_th+1)::timestamp at time zone 'Asia/Bangkok';
  select jsonb_build_object(
    'date',day_th,
    'orders', (select count(*) from public.orders o where o.company_id=ctx.company_id and o.order_date=day_th),
    'invoices', (select count(*) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th),
    'revenue', (select coalesce(sum(i.revenue),0) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th),
    'trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at),
    'completed_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at and t.status='COMPLETED'),
    'future_completed_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.planned_start>=start_at and t.planned_start<end_at and t.status='COMPLETED' and t.completed_at>now()),
    'waiting_logistics', (select count(*) from public.orders o where o.company_id=ctx.company_id and o.status='WAITING_LOGISTICS'),
    'late_trips', (select count(*) from public.delivery_trips t where t.company_id=ctx.company_id and t.status<>'COMPLETED' and t.planned_end<now()),
    'stockout_rows', (select count(*) from public.stock_balances b where b.company_id=ctx.company_id and b.on_hand<=0),
    'low_contribution_invoices', (select count(*) from public.invoices i where i.company_id=ctx.company_id and i.invoice_date=day_th and i.revenue>0 and (i.revenue-i.product_cost-i.freight_cost-i.other_cost)/i.revenue<0.12)
  ) into result;
  return result;
end $$;
revoke all on function public.report_today_status() from public,anon;
grant execute on function public.report_today_status() to authenticated;
