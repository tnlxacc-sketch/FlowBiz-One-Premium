-- FlowBiz One realistic Demo history import.
-- Applied to production project 2026-09-25.

CREATE OR REPLACE FUNCTION public.admin_import_sales_history(p_receipts jsonb, p_orders jsonb, p_lines jsonb, p_invoices jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  ctx record;
  company_row record;
  src_receipt jsonb;
  src_order jsonb;
  src_line jsonb;
  src_invoice jsonb;
  customer_row record;
  product_row record;
  warehouse_row record;
  supplier_row record;
  vehicle_row record;
  driver_row record;
  order_row record;
  invoice_row record;
  bal record;
  v_order_id uuid;
  v_trip_id uuid;
  v_invoice_id uuid;
  v_gr_id uuid;
  v_order_no text;
  v_invoice_no text;
  v_trip_no text;
  v_gr_no text;
  imported_receipts integer := 0;
  imported_orders integer := 0;
  imported_lines integer := 0;
  imported_invoices integer := 0;
  expected_revenue numeric;
  line_revenue numeric;
  received_total numeric;
  first_history_date date;
  opening_date_found date;
  ev record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into company_row from public.companies where id = ctx.company_id for update;
  if not found or company_row.is_demo is not true then
    raise exception 'DEMO_SALES_IMPORT_ONLY';
  end if;
  if coalesce(btrim(p_request_id),'') = '' then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  if exists(
    select 1 from public.audit_logs
    where company_id = ctx.company_id
      and action = 'ADMIN_IMPORT_SALES_HISTORY_REALISTIC'
      and after_data->>'request_id' = p_request_id
  ) then
    return jsonb_build_object('idempotent',true,'request_id',p_request_id);
  end if;

  if jsonb_typeof(p_orders) <> 'array'
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_typeof(p_invoices) <> 'array'
     or jsonb_array_length(p_orders)=0
     or jsonb_array_length(p_lines)=0
     or jsonb_array_length(p_invoices)=0 then
    raise exception 'SALES_IMPORT_FILES_REQUIRED';
  end if;
  if p_receipts is null or jsonb_typeof(p_receipts) <> 'array' then
    raise exception 'RECEIPT_IMPORT_FILE_REQUIRED';
  end if;
  if jsonb_array_length(p_orders)>1000
     or jsonb_array_length(p_lines)>5000
     or jsonb_array_length(p_invoices)>1000
     or jsonb_array_length(p_receipts)>5000 then
    raise exception 'SALES_IMPORT_LIMIT';
  end if;

  select min(d) into first_history_date
  from (
    select (x->>'order_date')::date d from jsonb_array_elements(p_orders) x
    union all
    select (x->>'receipt_date')::date d from jsonb_array_elements(p_receipts) x
  ) q;

  select max(opening_date) into opening_date_found
  from public.opening_stock_batches
  where company_id=ctx.company_id and status='POSTED' and opening_date <= first_history_date;

  if opening_date_found is null then
    raise exception 'OPENING_STOCK_REQUIRED_BEFORE_HISTORY';
  end if;

  -- This import is intentionally for a freshly reset Demo company.
  if exists(
    select 1 from public.stock_movements
    where company_id=ctx.company_id and movement_type <> 'OPENING_BALANCE'
  ) then
    raise exception 'DEMO_HISTORY_REQUIRES_CLEAN_STOCK';
  end if;

  create temporary table hist_order_map(
    order_no text primary key,
    order_id uuid not null,
    trip_id uuid not null,
    issue_at timestamptz not null
  ) on commit drop;

  create temporary table hist_events(
    seq bigserial primary key,
    event_at timestamptz not null,
    warehouse_id uuid not null,
    product_id uuid not null,
    movement_type text not null,
    qty numeric not null,
    reference_type text,
    reference_no text,
    request_id text not null
  ) on commit drop;

  -- Historical goods receipts. One row = one receipt line/reference.
  for src_receipt in select value from jsonb_array_elements(p_receipts) loop
    v_gr_no := btrim(src_receipt->>'gr_no');
    if v_gr_no='' then raise exception 'INVALID_GR_NUMBER'; end if;
    if exists(select 1 from public.goods_receipts where company_id=ctx.company_id and gr_no=v_gr_no) then
      raise exception 'SALES_IMPORT_DUPLICATE_GR: %',v_gr_no;
    end if;

    select * into warehouse_row from public.warehouses
    where company_id=ctx.company_id and code=btrim(src_receipt->>'warehouse_code') and active=true;
    if not found then raise exception 'INVALID_WAREHOUSE_CODE: %',src_receipt->>'warehouse_code'; end if;

    select * into supplier_row from public.suppliers
    where company_id=ctx.company_id and code=btrim(src_receipt->>'supplier_code') and active=true;
    if not found then raise exception 'INVALID_SUPPLIER_CODE: %',src_receipt->>'supplier_code'; end if;

    select * into product_row from public.products
    where company_id=ctx.company_id and code=btrim(src_receipt->>'product_code') and active=true;
    if not found then raise exception 'INVALID_PRODUCT_CODE: %',src_receipt->>'product_code'; end if;

    if coalesce((src_receipt->>'qty')::numeric,0)<=0
       or coalesce((src_receipt->>'unit_cost')::numeric,-1)<0 then
      raise exception 'INVALID_RECEIPT_LINE: %',v_gr_no;
    end if;
    if (src_receipt->>'receipt_date')::date < opening_date_found then
      raise exception 'RECEIPT_BEFORE_OPENING_DATE: %',v_gr_no;
    end if;

    insert into public.goods_receipts(
      company_id,gr_no,warehouse_id,supplier_id,source_doc_no,doc_date,receipt_date,status,request_id
    ) values(
      ctx.company_id,v_gr_no,warehouse_row.id,supplier_row.id,
      nullif(btrim(src_receipt->>'source_doc_no'),''),
      (src_receipt->>'receipt_date')::date,
      (src_receipt->>'receipt_date')::date,
      'POSTED',
      'HISTORY-'||p_request_id||'-'||v_gr_no
    ) returning id into v_gr_id;

    insert into public.goods_receipt_lines(company_id,gr_id,product_id,qty,unit_cost)
    values(
      ctx.company_id,v_gr_id,product_row.id,
      (src_receipt->>'qty')::numeric,
      (src_receipt->>'unit_cost')::numeric
    );

    insert into hist_events(
      event_at,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id
    ) values(
      ((src_receipt->>'receipt_date')::date::timestamp + time '09:00') at time zone 'Asia/Bangkok',
      warehouse_row.id,product_row.id,'RECEIPT',(src_receipt->>'qty')::numeric,
      'GOODS_RECEIPT',v_gr_no,
      'HISTORY-'||p_request_id||'-GR-'||v_gr_no
    );

    imported_receipts := imported_receipts + 1;
  end loop;

  -- Orders + delivery headers.
  for src_order in select value from jsonb_array_elements(p_orders) loop
    v_order_no := btrim(src_order->>'order_no');
    v_invoice_no := btrim(src_order->>'invoice_no');
    if v_order_no='' or v_invoice_no='' then raise exception 'INVALID_SALES_ORDER_NUMBER'; end if;
    if (src_order->>'order_date')::date < opening_date_found then
      raise exception 'ORDER_BEFORE_OPENING_DATE: %',v_order_no;
    end if;
    if exists(select 1 from public.orders where company_id=ctx.company_id and order_no=v_order_no)
       or exists(select 1 from public.invoices where company_id=ctx.company_id and invoice_no=v_invoice_no) then
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

    insert into public.orders(
      company_id,order_no,customer_id,order_date,requested_delivery_at,status,
      sales_user_id,request_id,created_at
    ) values(
      ctx.company_id,v_order_no,customer_row.id,(src_order->>'order_date')::date,
      nullif(src_order->>'requested_delivery_at','')::timestamptz,
      'DELIVERED',auth.uid(),
      'HISTORY-'||p_request_id||'-'||v_order_no,
      (((src_order->>'order_date')::date)::timestamp + time '08:30') at time zone 'Asia/Bangkok'
    ) returning id into v_order_id;

    v_trip_no := 'TRIP-'||regexp_replace(v_order_no,'^SO-','');
    insert into public.delivery_trips(
      company_id,trip_no,order_id,vehicle_id,driver_id,planned_start,planned_end,
      standard_freight,actual_freight,received_qty,status,completed_at,pod_reference,request_id
    ) values(
      ctx.company_id,v_trip_no,v_order_id,vehicle_row.id,driver_row.id,
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,
               ((src_order->>'order_date')::date::timestamp + time '09:00') at time zone 'Asia/Bangkok'),
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,
               ((src_order->>'order_date')::date::timestamp + time '09:00') at time zone 'Asia/Bangkok') + interval '4 hours',
      coalesce((src_order->>'standard_freight')::numeric,0),
      coalesce((src_order->>'standard_freight')::numeric,0),
      0,'COMPLETED',
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,
               ((src_order->>'order_date')::date::timestamp + time '09:00') at time zone 'Asia/Bangkok') + interval '4 hours',
      'HISTORICAL DEMO IMPORT',
      'HISTORY-'||p_request_id||'-'||v_trip_no
    ) returning id into v_trip_id;

    insert into hist_order_map(order_no,order_id,trip_id,issue_at)
    values(
      v_order_no,v_order_id,v_trip_id,
      coalesce(nullif(src_order->>'requested_delivery_at','')::timestamptz,
               ((src_order->>'order_date')::date::timestamp + time '09:00') at time zone 'Asia/Bangkok') - interval '1 hour'
    );
    imported_orders := imported_orders + 1;
  end loop;

  -- Lines + issue stock events.
  for src_line in select value from jsonb_array_elements(p_lines) loop
    v_order_no := btrim(src_line->>'order_no');
    select * into order_row from hist_order_map where order_no=v_order_no;
    if not found then raise exception 'ORDER_LINE_WITHOUT_ORDER: %',v_order_no; end if;

    select * into product_row from public.products
    where company_id=ctx.company_id and code=btrim(src_line->>'product_code') and active=true;
    if not found then raise exception 'INVALID_PRODUCT_CODE: %',src_line->>'product_code'; end if;

    select * into warehouse_row from public.warehouses
    where company_id=ctx.company_id and code=btrim(src_line->>'warehouse_code') and active=true;
    if not found then raise exception 'INVALID_WAREHOUSE_CODE: %',src_line->>'warehouse_code'; end if;

    if coalesce((src_line->>'qty')::numeric,0)<=0
       or coalesce((src_line->>'unit_price')::numeric,-1)<0
       or coalesce((src_line->>'customer_received_qty')::numeric,-1)<0
       or (src_line->>'customer_received_qty')::numeric>(src_line->>'qty')::numeric then
      raise exception 'INVALID_SALES_LINE: % / %',v_order_no,src_line->>'line_no';
    end if;

    insert into public.order_lines(
      company_id,order_id,product_id,warehouse_id,qty,unit_price,issued_qty
    ) values(
      ctx.company_id,order_row.order_id,product_row.id,warehouse_row.id,
      (src_line->>'qty')::numeric,(src_line->>'unit_price')::numeric,(src_line->>'qty')::numeric
    ) returning * into invoice_row;

    insert into public.delivery_trip_lines(
      company_id,trip_id,order_line_id,product_id,issued_qty,received_qty,variance_reason
    ) values(
      ctx.company_id,order_row.trip_id,invoice_row.id,product_row.id,
      (src_line->>'qty')::numeric,(src_line->>'customer_received_qty')::numeric,
      case when (src_line->>'customer_received_qty')::numeric<>(src_line->>'qty')::numeric
           then 'Historical import variance' end
    );

    insert into hist_events(
      event_at,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id
    ) values(
      order_row.issue_at,warehouse_row.id,product_row.id,'ORDER_ISSUE',
      -(src_line->>'qty')::numeric,'ORDER',v_order_no,
      'HISTORY-'||p_request_id||'-ISSUE-'||v_order_no||'-'||btrim(src_line->>'line_no')
    );
    imported_lines := imported_lines + 1;
  end loop;

  -- Invoices.
  for src_invoice in select value from jsonb_array_elements(p_invoices) loop
    v_invoice_no := btrim(src_invoice->>'invoice_no');
    v_order_no := btrim(src_invoice->>'order_no');
    select * into order_row from hist_order_map where order_no=v_order_no;
    if not found then raise exception 'INVOICE_WITHOUT_ORDER: %',v_order_no; end if;

    select * into customer_row from public.customers
    where company_id=ctx.company_id and code=btrim(src_invoice->>'customer_code') and active=true;
    if not found then raise exception 'INVALID_CUSTOMER_CODE: %',src_invoice->>'customer_code'; end if;

    select coalesce(sum(dtl.received_qty*ol.unit_price),0)
      into line_revenue
    from public.delivery_trip_lines dtl
    join public.order_lines ol on ol.id=dtl.order_line_id
    where dtl.trip_id=order_row.trip_id;

    expected_revenue := (src_invoice->>'revenue')::numeric;
    if abs(line_revenue-expected_revenue)>0.02 then
      raise exception 'SALES_REVENUE_MISMATCH: % line=% invoice=%',v_invoice_no,line_revenue,expected_revenue;
    end if;

    insert into public.invoices(
      company_id,invoice_no,customer_id,invoice_date,revenue,product_cost,
      freight_cost,other_cost,gp_status
    ) values(
      ctx.company_id,v_invoice_no,customer_row.id,(src_invoice->>'invoice_date')::date,
      expected_revenue,
      coalesce((src_invoice->>'product_cost')::numeric,0),
      coalesce((src_invoice->>'freight_cost')::numeric,0),
      coalesce((src_invoice->>'direct_expense')::numeric,0),
      case when upper(coalesce(src_invoice->>'gp_status','FINAL'))='ESTIMATED' then 'ESTIMATED' else 'FINAL' end
    ) returning id into v_invoice_id;

    insert into public.invoice_orders(company_id,invoice_id,order_id)
      values(ctx.company_id,v_invoice_id,order_row.order_id);
    insert into public.invoice_trips(company_id,invoice_id,trip_id)
      values(ctx.company_id,v_invoice_id,order_row.trip_id);

    select coalesce(sum(received_qty),0) into received_total
    from public.delivery_trip_lines where trip_id=order_row.trip_id;
    update public.delivery_trips
      set actual_freight=coalesce((src_invoice->>'freight_cost')::numeric,0),
          received_qty=received_total
      where id=order_row.trip_id;

    imported_invoices := imported_invoices + 1;
  end loop;

  if imported_orders <> imported_invoices then
    raise exception 'SALES_IMPORT_COUNT_MISMATCH';
  end if;

  -- Apply stock chronologically so historical balances never go negative.
  for ev in
    select * from hist_events order by event_at,seq
  loop
    select * into bal
    from public.stock_balances
    where company_id=ctx.company_id
      and warehouse_id=ev.warehouse_id
      and product_id=ev.product_id
    for update;

    if not found then
      if ev.qty < 0 then
        raise exception 'INSUFFICIENT_STOCK_HISTORY: % / %',ev.reference_no,ev.product_id;
      end if;
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
      values(ctx.company_id,ev.warehouse_id,ev.product_id,0,0)
      returning * into bal;
    end if;

    if bal.on_hand + ev.qty < 0 then
      raise exception 'INSUFFICIENT_STOCK_HISTORY: % available=% issue=%',
        ev.reference_no,bal.on_hand,abs(ev.qty);
    end if;

    update public.stock_balances
      set on_hand=on_hand+ev.qty,version=version+1
      where id=bal.id;

    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by,created_at
    ) values(
      ctx.company_id,ev.warehouse_id,ev.product_id,ev.movement_type,ev.qty,
      ev.reference_type,ev.reference_no,ev.request_id,auth.uid(),ev.event_at
    );
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(
    ctx.company_id,auth.uid(),'ADMIN_IMPORT_SALES_HISTORY_REALISTIC','COMPANY',ctx.company_id::text,
    jsonb_build_object(
      'request_id',p_request_id,
      'opening_date',opening_date_found,
      'receipts',imported_receipts,
      'orders',imported_orders,
      'lines',imported_lines,
      'invoices',imported_invoices,
      'stock_impact',true
    )
  );

  return jsonb_build_object(
    'idempotent',false,
    'opening_date',opening_date_found,
    'receipts',imported_receipts,
    'orders',imported_orders,
    'lines',imported_lines,
    'invoices',imported_invoices,
    'stock_impact',true
  );
end
$function$


CREATE OR REPLACE FUNCTION public.post_opening_stock(p_reference_no text, p_opening_date date, p_lines jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  ctx record;
  batch_id uuid;
  line jsonb;
  existing record;
  line_count integer;
  total_qty numeric := 0;
  total_value numeric := 0;
  movement_request_id text;
  movement_at timestamptz;
begin
  select * into ctx from private.require_role(array['ADMIN']);

  if coalesce(btrim(p_request_id),'') = '' then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select id,reference_no into existing from public.opening_stock_batches
    where company_id=ctx.company_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('id',existing.id,'reference_no',existing.reference_no,'idempotent',true);
  end if;

  if coalesce(btrim(p_reference_no),'')='' then raise exception 'OPENING_REFERENCE_REQUIRED'; end if;
  if p_opening_date is null then raise exception 'OPENING_DATE_REQUIRED'; end if;
  if exists(select 1 from public.period_closes where company_id=ctx.company_id
            and period_month=date_trunc('month',p_opening_date)::date and status='CLOSED')
    then raise exception 'PERIOD_CLOSED'; end if;
  if exists(select 1 from public.opening_stock_batches where company_id=ctx.company_id
            and lower(reference_no)=lower(btrim(p_reference_no)))
    then raise exception 'OPENING_REFERENCE_EXISTS'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'OPENING_LINES_REQUIRED'; end if;

  select count(*) into line_count from jsonb_array_elements(p_lines);
  if line_count>5000 then raise exception 'OPENING_LINES_LIMIT'; end if;

  if exists(
    select 1 from jsonb_array_elements(p_lines) l
    group by l->>'warehouse_id',l->>'product_id'
    having count(*)>1
  ) then raise exception 'DUPLICATE_OPENING_LINE'; end if;

  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(line->>'warehouse_id','')='' or coalesce(line->>'product_id','')=''
      then raise exception 'INVALID_OPENING_LINE'; end if;
    if coalesce((line->>'qty')::numeric,0)<=0 or coalesce((line->>'unit_cost')::numeric,-1)<0
      then raise exception 'INVALID_OPENING_LINE'; end if;
    if not exists(select 1 from public.warehouses where id=(line->>'warehouse_id')::uuid
                  and company_id=ctx.company_id and active)
      then raise exception 'INVALID_WAREHOUSE'; end if;
    if not exists(select 1 from public.products where id=(line->>'product_id')::uuid
                  and company_id=ctx.company_id and active)
      then raise exception 'INVALID_PRODUCT'; end if;
  end loop;

  insert into public.opening_stock_batches(
    company_id,reference_no,opening_date,status,request_id,created_by,created_at
  ) values(
    ctx.company_id,btrim(p_reference_no),p_opening_date,'POSTED',p_request_id,auth.uid(),
    (p_opening_date::timestamp + time '08:00') at time zone 'Asia/Bangkok'
  ) returning id into batch_id;

  movement_at := (p_opening_date::timestamp + time '08:00') at time zone 'Asia/Bangkok';

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into public.opening_stock_lines(company_id,batch_id,warehouse_id,product_id,qty,unit_cost)
    values(
      ctx.company_id,batch_id,(line->>'warehouse_id')::uuid,(line->>'product_id')::uuid,
      (line->>'qty')::numeric,(line->>'unit_cost')::numeric
    );

    insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
    values(ctx.company_id,(line->>'warehouse_id')::uuid,(line->>'product_id')::uuid,(line->>'qty')::numeric,0)
    on conflict(company_id,warehouse_id,product_id)
    do update set on_hand=public.stock_balances.on_hand+excluded.on_hand,
                  version=public.stock_balances.version+1;

    movement_request_id := p_request_id||'-'||(line->>'warehouse_id')||'-'||(line->>'product_id');
    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by,created_at
    ) values(
      ctx.company_id,(line->>'warehouse_id')::uuid,(line->>'product_id')::uuid,
      'OPENING_BALANCE',(line->>'qty')::numeric,'OPENING_STOCK',btrim(p_reference_no),
      movement_request_id,auth.uid(),movement_at
    );

    total_qty := total_qty + (line->>'qty')::numeric;
    total_value := total_value + (line->>'qty')::numeric*(line->>'unit_cost')::numeric;
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data,created_at)
  values(
    ctx.company_id,auth.uid(),'POST_OPENING_STOCK','OPENING_STOCK',batch_id::text,
    jsonb_build_object(
      'reference_no',btrim(p_reference_no),'opening_date',p_opening_date,
      'line_count',line_count,'total_qty',total_qty,'total_value',total_value,'request_id',p_request_id
    ),
    movement_at
  );

  return jsonb_build_object(
    'id',batch_id,'reference_no',btrim(p_reference_no),'line_count',line_count,
    'total_qty',total_qty,'total_value',total_value,'idempotent',false
  );
end
$function$


revoke all on function public.admin_import_sales_history(jsonb,jsonb,jsonb,jsonb,text) from public,anon;
grant execute on function public.admin_import_sales_history(jsonb,jsonb,jsonb,jsonb,text) to authenticated;
revoke all on function public.post_opening_stock(text,date,jsonb,text) from public,anon;
grant execute on function public.post_opening_stock(text,date,jsonb,text) to authenticated;
