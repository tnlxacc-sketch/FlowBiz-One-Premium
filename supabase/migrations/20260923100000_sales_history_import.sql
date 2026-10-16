-- Secure, atomic historical sales import for DEMO tenants.
-- Imported history powers reports but never posts stock movements or changes current stock.

create or replace function public.admin_import_sales_history(
  p_orders jsonb,
  p_lines jsonb,
  p_invoices jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  ctx record;
  company_row record;
  src_order jsonb;
  src_line jsonb;
  src_invoice jsonb;
  customer_row record;
  product_row record;
  warehouse_row record;
  vehicle_row record;
  driver_row record;
  order_row record;
  line_row record;
  invoice_row record;
  v_order_id uuid;
  v_trip_id uuid;
  v_invoice_id uuid;
  v_order_no text;
  v_invoice_no text;
  v_trip_no text;
  imported_orders integer := 0;
  imported_lines integer := 0;
  imported_invoices integer := 0;
  expected_revenue numeric;
  line_revenue numeric;
  received_total numeric;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into company_row from public.companies where id = ctx.company_id for update;
  if not found or company_row.is_demo is not true then raise exception 'DEMO_SALES_IMPORT_ONLY'; end if;
  if coalesce(btrim(p_request_id),'') = '' then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if exists(
    select 1 from public.audit_logs
    where company_id = ctx.company_id
      and action = 'ADMIN_IMPORT_SALES_HISTORY'
      and after_data->>'request_id' = p_request_id
  ) then
    return jsonb_build_object('idempotent',true,'request_id',p_request_id);
  end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_typeof(p_lines) <> 'array' or jsonb_typeof(p_invoices) <> 'array'
     or jsonb_array_length(p_orders) = 0 or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_invoices) = 0 then
    raise exception 'SALES_IMPORT_FILES_REQUIRED';
  end if;
  if jsonb_array_length(p_orders) > 1000 or jsonb_array_length(p_lines) > 5000 or jsonb_array_length(p_invoices) > 1000 then
    raise exception 'SALES_IMPORT_LIMIT';
  end if;

  create temporary table import_order_map(order_no text primary key, order_id uuid, trip_id uuid) on commit drop;
  create temporary table import_line_map(order_no text, line_no integer, order_line_id uuid, primary key(order_no,line_no)) on commit drop;

  for src_order in select value from jsonb_array_elements(p_orders) loop
    v_order_no := btrim(src_order->>'order_no');
    v_invoice_no := btrim(src_order->>'invoice_no');
    if v_order_no = '' or v_invoice_no = '' then raise exception 'INVALID_SALES_ORDER_NUMBER'; end if;
    if exists(select 1 from public.orders o where o.company_id=ctx.company_id and o.order_no=v_order_no)
       or exists(select 1 from public.invoices i where i.company_id=ctx.company_id and i.invoice_no=v_invoice_no) then
      raise exception 'SALES_IMPORT_DUPLICATE: % / %',v_order_no,v_invoice_no;
    end if;
    select * into customer_row from public.customers
      where company_id=ctx.company_id and code=btrim(src_order->>'customer_code') and active=true;
    if not found then raise exception 'INVALID_CUSTOMER_CODE: %',src_order->>'customer_code'; end if;
    select * into vehicle_row from public.vehicles
      where company_id=ctx.company_id and code=btrim(src_order->>'vehicle_code') and active=true;
    if not found then raise exception 'INVALID_VEHICLE_CODE: %',src_order->>'vehicle_code'; end if;
    select * into driver_row from public.drivers
      where company_id=ctx.company_id and code=btrim(src_order->>'driver_code') and active=true;
    if not found then raise exception 'INVALID_DRIVER_CODE: %',src_order->>'driver_code'; end if;

    insert into public.orders(company_id,order_no,customer_id,order_date,requested_delivery_at,status,sales_user_id,request_id,created_at)
    values(ctx.company_id,v_order_no,customer_row.id,(src_order->>'order_date')::date,
      nullif(src_order->>'requested_delivery_at','')::timestamptz,'DELIVERED',auth.uid(),
      'HISTORY-'||p_request_id||'-'||v_order_no,(src_order->>'order_date')::date)
    returning id into v_order_id;

    v_trip_no := 'TRIP-'||regexp_replace(v_order_no,'^SO-','');
    insert into public.delivery_trips(company_id,trip_no,order_id,vehicle_id,driver_id,planned_start,planned_end,
      standard_freight,actual_freight,received_qty,status,completed_at,pod_reference,request_id)
    values(ctx.company_id,v_trip_no,v_order_id,vehicle_row.id,driver_row.id,
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,(src_order->>'order_date')::date::timestamptz),
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,(src_order->>'order_date')::date::timestamptz)+interval '4 hours',
      coalesce((src_order->>'standard_freight')::numeric,0),coalesce((src_order->>'standard_freight')::numeric,0),0,
      'COMPLETED',coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,(src_order->>'order_date')::date::timestamptz)+interval '4 hours',
      'HISTORICAL IMPORT','HISTORY-'||p_request_id||'-'||v_trip_no)
    returning id into v_trip_id;
    insert into import_order_map values(v_order_no,v_order_id,v_trip_id);
    imported_orders := imported_orders + 1;
  end loop;

  for src_line in select value from jsonb_array_elements(p_lines) loop
    v_order_no := btrim(src_line->>'order_no');
    select * into order_row from import_order_map iom where iom.order_no=v_order_no;
    if not found then raise exception 'ORDER_LINE_WITHOUT_ORDER: %',v_order_no; end if;
    select * into product_row from public.products
      where company_id=ctx.company_id and code=btrim(src_line->>'product_code') and active=true;
    if not found then raise exception 'INVALID_PRODUCT_CODE: %',src_line->>'product_code'; end if;
    select * into warehouse_row from public.warehouses
      where company_id=ctx.company_id and code=btrim(src_line->>'warehouse_code') and active=true;
    if not found then raise exception 'INVALID_WAREHOUSE_CODE: %',src_line->>'warehouse_code'; end if;
    if coalesce((src_line->>'qty')::numeric,0)<=0 or coalesce((src_line->>'unit_price')::numeric,-1)<0
       or coalesce((src_line->>'customer_received_qty')::numeric,-1)<0
       or (src_line->>'customer_received_qty')::numeric>(src_line->>'qty')::numeric then
      raise exception 'INVALID_SALES_LINE: % / %',v_order_no,src_line->>'line_no';
    end if;
    insert into public.order_lines(company_id,order_id,product_id,warehouse_id,qty,unit_price,issued_qty)
    values(ctx.company_id,order_row.order_id,product_row.id,warehouse_row.id,(src_line->>'qty')::numeric,
      (src_line->>'unit_price')::numeric,(src_line->>'qty')::numeric)
    returning id into line_row;
    insert into public.delivery_trip_lines(company_id,trip_id,order_line_id,product_id,issued_qty,received_qty,variance_reason)
    values(ctx.company_id,order_row.trip_id,line_row.id,product_row.id,(src_line->>'qty')::numeric,
      (src_line->>'customer_received_qty')::numeric,
      case when (src_line->>'customer_received_qty')::numeric<>(src_line->>'qty')::numeric then 'Historical import variance' end);
    insert into import_line_map values(v_order_no,(src_line->>'line_no')::integer,line_row.id);
    imported_lines := imported_lines + 1;
  end loop;

  for src_invoice in select value from jsonb_array_elements(p_invoices) loop
    v_invoice_no := btrim(src_invoice->>'invoice_no');
    v_order_no := btrim(src_invoice->>'order_no');
    select * into order_row from import_order_map iom where iom.order_no=v_order_no;
    if not found then raise exception 'INVOICE_WITHOUT_ORDER: %',v_order_no; end if;
    select * into customer_row from public.customers
      where company_id=ctx.company_id and code=btrim(src_invoice->>'customer_code') and active=true;
    if not found then raise exception 'INVALID_CUSTOMER_CODE: %',src_invoice->>'customer_code'; end if;
    select coalesce(sum(dtl.received_qty*ol.unit_price),0) into line_revenue
      from public.delivery_trip_lines dtl
      join public.order_lines ol on ol.id=dtl.order_line_id
      where dtl.trip_id=order_row.trip_id;
    expected_revenue := (src_invoice->>'revenue')::numeric;
    if abs(line_revenue-expected_revenue)>0.02 then
      raise exception 'SALES_REVENUE_MISMATCH: % line=% invoice=%',v_invoice_no,line_revenue,expected_revenue;
    end if;
    insert into public.invoices(company_id,invoice_no,customer_id,invoice_date,revenue,product_cost,freight_cost,other_cost,gp_status)
    values(ctx.company_id,v_invoice_no,customer_row.id,(src_invoice->>'invoice_date')::date,expected_revenue,
      coalesce((src_invoice->>'product_cost')::numeric,0),coalesce((src_invoice->>'freight_cost')::numeric,0),
      coalesce((src_invoice->>'direct_expense')::numeric,0),
      case when upper(coalesce(src_invoice->>'gp_status','FINAL'))='ESTIMATED' then 'ESTIMATED' else 'FINAL' end)
    returning id into v_invoice_id;
    insert into public.invoice_orders(company_id,invoice_id,order_id) values(ctx.company_id,v_invoice_id,order_row.order_id);
    insert into public.invoice_trips(company_id,invoice_id,trip_id) values(ctx.company_id,v_invoice_id,order_row.trip_id);
    select coalesce(sum(dtl.received_qty),0) into received_total from public.delivery_trip_lines dtl where dtl.trip_id=order_row.trip_id;
    update public.delivery_trips set actual_freight=coalesce((src_invoice->>'freight_cost')::numeric,0),received_qty=received_total where id=order_row.trip_id;
    imported_invoices := imported_invoices + 1;
  end loop;

  if imported_orders <> imported_invoices then raise exception 'SALES_IMPORT_COUNT_MISMATCH'; end if;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ADMIN_IMPORT_SALES_HISTORY','COMPANY',ctx.company_id::text,
    jsonb_build_object('request_id',p_request_id,'orders',imported_orders,'lines',imported_lines,'invoices',imported_invoices,'stock_impact',false));
  return jsonb_build_object('idempotent',false,'orders',imported_orders,'lines',imported_lines,'invoices',imported_invoices,'stock_impact',false);
end
$$;

revoke all on function public.admin_import_sales_history(jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.admin_import_sales_history(jsonb,jsonb,jsonb,text) to authenticated;
