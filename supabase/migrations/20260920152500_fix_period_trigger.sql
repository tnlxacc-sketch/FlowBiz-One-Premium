-- Safely resolve the business date across tables with different row shapes.
create or replace function private.block_closed_period()
returns trigger language plpgsql security definer set search_path=public
as $$
declare d date; c uuid; payload jsonb:=to_jsonb(new);
begin
  c:=(payload->>'company_id')::uuid;
  d:=case tg_table_name
    when 'orders' then (payload->>'order_date')::date
    when 'goods_receipts' then (payload->>'receipt_date')::date
    when 'invoices' then (payload->>'invoice_date')::date
    when 'monthly_product_costs' then (payload->>'cost_month')::date
    else current_date
  end;
  if exists(select 1 from public.period_closes where company_id=c and period_month=date_trunc('month',d)::date and status='CLOSED') then
    raise exception 'PERIOD_CLOSED';
  end if;
  return new;
end $$;

