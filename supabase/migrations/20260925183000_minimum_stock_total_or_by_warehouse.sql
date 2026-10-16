-- Minimum Stock policy: preserve existing Product.minimum_stock as TOTAL/default
-- and add optional per-warehouse overrides with minimal impact.

create table if not exists public.product_warehouse_minimums (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  minimum_stock numeric not null check (minimum_stock >= 0),
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(company_id,product_id,warehouse_id)
);

create index if not exists idx_product_warehouse_minimums_company
  on public.product_warehouse_minimums(company_id,warehouse_id,product_id);

alter table public.product_warehouse_minimums enable row level security;

drop policy if exists tenant_select_product_warehouse_minimums on public.product_warehouse_minimums;
create policy tenant_select_product_warehouse_minimums
on public.product_warehouse_minimums
for select
to authenticated
using (company_id=(select public.current_company_id()));

revoke all on table public.product_warehouse_minimums from public,anon;
grant select on table public.product_warehouse_minimums to authenticated;

create or replace function private.minimum_stock_policy(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path=public,private
as $$
  select case
    when upper(coalesce(
      (select trim(both '"' from setting_value::text)
       from public.app_settings
       where company_id=p_company_id and setting_key='minimum_stock_policy'),
      'TOTAL'
    ))='BY_WAREHOUSE'
    then 'BY_WAREHOUSE'
    else 'TOTAL'
  end
$$;

create or replace function public.admin_set_minimum_stock_policy(p_policy text)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  v_policy text:=upper(btrim(coalesce(p_policy,'')));
  old_policy text;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if v_policy not in ('TOTAL','BY_WAREHOUSE') then
    raise exception 'INVALID_MINIMUM_STOCK_POLICY';
  end if;
  old_policy:=private.minimum_stock_policy(ctx.company_id);

  insert into public.app_settings(company_id,setting_key,setting_value)
  values(ctx.company_id,'minimum_stock_policy',to_jsonb(v_policy))
  on conflict(company_id,setting_key)
  do update set setting_value=excluded.setting_value;

  if old_policy<>v_policy then
    insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
    values(
      ctx.company_id,auth.uid(),'UPDATE_MINIMUM_STOCK_POLICY','app_settings','minimum_stock_policy',
      jsonb_build_object('policy',old_policy),
      jsonb_build_object('policy',v_policy)
    );
  end if;

  return jsonb_build_object('policy',v_policy);
end
$$;

create or replace function public.admin_replace_warehouse_minimums(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  item jsonb;
  pid uuid;
  wid uuid;
  min_qty numeric;
  old_count integer;
  new_count integer:=0;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'WAREHOUSE_MINIMUM_ROWS_REQUIRED';
  end if;
  if jsonb_array_length(p_rows)>5000 then
    raise exception 'WAREHOUSE_MINIMUM_ROWS_LIMIT';
  end if;

  select count(*) into old_count
  from public.product_warehouse_minimums
  where company_id=ctx.company_id;

  delete from public.product_warehouse_minimums
  where company_id=ctx.company_id;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      pid:=(item->>'product_id')::uuid;
      wid:=(item->>'warehouse_id')::uuid;
      min_qty:=(item->>'minimum_stock')::numeric;
    exception when others then
      raise exception 'INVALID_WAREHOUSE_MINIMUM_ROW';
    end;

    if min_qty is null or min_qty<0 then raise exception 'INVALID_MINIMUM_STOCK'; end if;

    if not exists(
      select 1 from public.products p
      where p.id=pid and p.company_id=ctx.company_id and p.active
    ) then raise exception 'INVALID_PRODUCT'; end if;

    if not exists(
      select 1 from public.warehouses w
      where w.id=wid and w.company_id=ctx.company_id and w.active
    ) then raise exception 'INVALID_WAREHOUSE'; end if;

    insert into public.product_warehouse_minimums(
      company_id,product_id,warehouse_id,minimum_stock,updated_by,updated_at
    )
    values(ctx.company_id,pid,wid,min_qty,auth.uid(),now());

    new_count:=new_count+1;
  end loop;

  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(
    ctx.company_id,auth.uid(),'REPLACE_WAREHOUSE_MINIMUM_STOCK','product_warehouse_minimums',ctx.company_id::text,
    jsonb_build_object('rows',old_count),
    jsonb_build_object('rows',new_count)
  );

  return jsonb_build_object('rows',new_count);
end
$$;

revoke all on function public.admin_set_minimum_stock_policy(text) from public,anon;
revoke all on function public.admin_replace_warehouse_minimums(jsonb) from public,anon;
grant execute on function public.admin_set_minimum_stock_policy(text) to authenticated;
grant execute on function public.admin_replace_warehouse_minimums(jsonb) to authenticated;
