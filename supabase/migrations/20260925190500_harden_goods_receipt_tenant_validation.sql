create or replace function public.post_goods_receipt(
  p_warehouse_id uuid,
  p_supplier_id uuid,
  p_source_doc_no text,
  p_receipt_date date,
  p_lines jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $$
declare
  ctx record;
  gid uuid;
  gno text;
  line jsonb;
  existing record;
  rid text;
  pid uuid;
  qty_value numeric;
  unit_cost_value numeric;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);

  if nullif(btrim(coalesce(p_request_id,'')),'') is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select id,gr_no into existing
  from public.goods_receipts
  where company_id=ctx.company_id and request_id=p_request_id;
  if found then
    return jsonb_build_object('id',existing.id,'gr_no',existing.gr_no,'idempotent',true);
  end if;

  if p_receipt_date is null then raise exception 'RECEIPT_DATE_REQUIRED'; end if;

  if not exists(
    select 1 from public.warehouses
    where id=p_warehouse_id and company_id=ctx.company_id and active
  ) then raise exception 'INVALID_WAREHOUSE'; end if;

  if p_supplier_id is not null and not exists(
    select 1 from public.suppliers
    where id=p_supplier_id and company_id=ctx.company_id and active
  ) then raise exception 'INVALID_SUPPLIER'; end if;

  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'RECEIPT_LINES_REQUIRED';
  end if;

  if jsonb_array_length(p_lines)>5000 then
    raise exception 'RECEIPT_LINES_LIMIT';
  end if;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    begin
      pid:=(line->>'product_id')::uuid;
      qty_value:=(line->>'qty')::numeric;
      unit_cost_value:=case
        when nullif(btrim(coalesce(line->>'unit_cost','')),'') is null then null
        else (line->>'unit_cost')::numeric
      end;
    exception when others then
      raise exception 'INVALID_RECEIPT_LINE';
    end;

    if qty_value is null or qty_value<=0 then raise exception 'INVALID_RECEIPT_QTY'; end if;
    if unit_cost_value is not null and unit_cost_value<0 then raise exception 'INVALID_RECEIPT_UNIT_COST'; end if;

    if not exists(
      select 1 from public.products
      where id=pid and company_id=ctx.company_id and active
    ) then raise exception 'INVALID_PRODUCT'; end if;
  end loop;

  gno:=private.next_doc_no('GR-', 'public.goods_receipts'::regclass, 'gr_no', ctx.company_id);

  insert into public.goods_receipts(
    company_id,gr_no,warehouse_id,supplier_id,source_doc_no,receipt_date,status,request_id
  )
  values(
    ctx.company_id,gno,p_warehouse_id,p_supplier_id,nullif(btrim(p_source_doc_no),''),
    p_receipt_date,'POSTED',p_request_id
  )
  returning id into gid;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    pid:=(line->>'product_id')::uuid;
    qty_value:=(line->>'qty')::numeric;
    unit_cost_value:=case
      when nullif(btrim(coalesce(line->>'unit_cost','')),'') is null then null
      else (line->>'unit_cost')::numeric
    end;

    insert into public.goods_receipt_lines(company_id,gr_id,product_id,qty,unit_cost)
    values(ctx.company_id,gid,pid,qty_value,unit_cost_value);

    insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated)
    values(ctx.company_id,p_warehouse_id,pid,qty_value,0)
    on conflict(company_id,warehouse_id,product_id)
    do update set
      on_hand=public.stock_balances.on_hand+excluded.on_hand,
      version=public.stock_balances.version+1;

    rid:=p_request_id||'-'||pid::text;
    insert into public.stock_movements(
      company_id,warehouse_id,product_id,movement_type,qty,
      reference_type,reference_no,request_id,created_by
    )
    values(
      ctx.company_id,p_warehouse_id,pid,'RECEIPT',qty_value,
      'GOODS_RECEIPT',gno,rid,auth.uid()
    );
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(
    ctx.company_id,auth.uid(),'POST_GOODS_RECEIPT','GOODS_RECEIPT',gid::text,
    jsonb_build_object('gr_no',gno,'request_id',p_request_id)
  );

  return jsonb_build_object('id',gid,'gr_no',gno,'idempotent',false);
end
$$;

revoke all on function public.post_goods_receipt(uuid,uuid,text,date,jsonb,text) from public,anon;
grant execute on function public.post_goods_receipt(uuid,uuid,text,date,jsonb,text) to authenticated;
