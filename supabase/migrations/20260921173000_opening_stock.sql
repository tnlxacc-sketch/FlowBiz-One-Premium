-- Opening stock is a dedicated, immutable posting document.
-- It increases on-hand stock without being reported as a goods receipt and
-- keeps its valuation separate from Monthly Product Cost used by GP reports.

create table if not exists public.opening_stock_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  reference_no text not null check (btrim(reference_no) <> ''),
  opening_date date not null,
  status text not null default 'POSTED' check (status in ('POSTED')),
  request_id text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id, request_id)
);

create unique index if not exists opening_stock_batches_company_reference_uq
  on public.opening_stock_batches(company_id, lower(reference_no));
create index if not exists opening_stock_batches_company_date_idx
  on public.opening_stock_batches(company_id, opening_date desc);

create table if not exists public.opening_stock_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  batch_id uuid not null references public.opening_stock_batches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  unique(batch_id, warehouse_id, product_id)
);

create index if not exists opening_stock_lines_company_batch_idx
  on public.opening_stock_lines(company_id, batch_id);
create index if not exists opening_stock_lines_company_lookup_idx
  on public.opening_stock_lines(company_id, warehouse_id, product_id);

alter table public.opening_stock_batches enable row level security;
alter table public.opening_stock_lines enable row level security;

drop policy if exists opening_stock_batches_read on public.opening_stock_batches;
create policy opening_stock_batches_read on public.opening_stock_batches
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_app_role()) in ('ADMIN','OWNER')
  );

drop policy if exists opening_stock_lines_read on public.opening_stock_lines;
create policy opening_stock_lines_read on public.opening_stock_lines
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_app_role()) in ('ADMIN','OWNER')
  );

create or replace function public.post_opening_stock(
  p_reference_no text,
  p_opening_date date,
  p_lines jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  ctx record;
  batch_id uuid;
  line jsonb;
  existing record;
  line_count integer;
  total_qty numeric := 0;
  total_value numeric := 0;
  movement_request_id text;
begin
  select * into ctx from private.require_role(array['ADMIN']);

  if coalesce(btrim(p_request_id),'') = '' then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select id, reference_no into existing
  from public.opening_stock_batches
  where company_id = ctx.company_id and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'id', existing.id,
      'reference_no', existing.reference_no,
      'idempotent', true
    );
  end if;

  if coalesce(btrim(p_reference_no),'') = '' then
    raise exception 'OPENING_REFERENCE_REQUIRED';
  end if;
  if p_opening_date is null then
    raise exception 'OPENING_DATE_REQUIRED';
  end if;
  if exists (
    select 1 from public.period_closes
    where company_id = ctx.company_id
      and period_month = date_trunc('month', p_opening_date)::date
      and status = 'CLOSED'
  ) then
    raise exception 'PERIOD_CLOSED';
  end if;
  if exists (
    select 1 from public.opening_stock_batches
    where company_id = ctx.company_id
      and lower(reference_no) = lower(btrim(p_reference_no))
  ) then
    raise exception 'OPENING_REFERENCE_EXISTS';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'OPENING_LINES_REQUIRED';
  end if;

  select count(*) into line_count from jsonb_array_elements(p_lines);
  if line_count > 5000 then
    raise exception 'OPENING_LINES_LIMIT';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) l
    group by l->>'warehouse_id', l->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_OPENING_LINE';
  end if;

  -- Validate every line before writing anything. The whole RPC is one transaction.
  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(line->>'warehouse_id','') = ''
       or coalesce(line->>'product_id','') = '' then
      raise exception 'INVALID_OPENING_LINE';
    end if;
    if coalesce((line->>'qty')::numeric, 0) <= 0
       or coalesce((line->>'unit_cost')::numeric, -1) < 0 then
      raise exception 'INVALID_OPENING_LINE';
    end if;
    if not exists (
      select 1 from public.warehouses
      where id = (line->>'warehouse_id')::uuid
        and company_id = ctx.company_id and active
    ) then
      raise exception 'INVALID_WAREHOUSE';
    end if;
    if not exists (
      select 1 from public.products
      where id = (line->>'product_id')::uuid
        and company_id = ctx.company_id and active
    ) then
      raise exception 'INVALID_PRODUCT';
    end if;
  end loop;

  insert into public.opening_stock_batches(
    company_id, reference_no, opening_date, status, request_id, created_by
  ) values (
    ctx.company_id, btrim(p_reference_no), p_opening_date, 'POSTED', p_request_id, auth.uid()
  ) returning id into batch_id;

  for line in select * from jsonb_array_elements(p_lines) loop
    insert into public.opening_stock_lines(
      company_id, batch_id, warehouse_id, product_id, qty, unit_cost
    ) values (
      ctx.company_id,
      batch_id,
      (line->>'warehouse_id')::uuid,
      (line->>'product_id')::uuid,
      (line->>'qty')::numeric,
      (line->>'unit_cost')::numeric
    );

    insert into public.stock_balances(company_id, warehouse_id, product_id, on_hand, allocated)
    values (
      ctx.company_id,
      (line->>'warehouse_id')::uuid,
      (line->>'product_id')::uuid,
      (line->>'qty')::numeric,
      0
    )
    on conflict(company_id, warehouse_id, product_id)
    do update set
      on_hand = public.stock_balances.on_hand + excluded.on_hand,
      version = public.stock_balances.version + 1;

    movement_request_id := p_request_id || '-' || (line->>'warehouse_id') || '-' || (line->>'product_id');
    insert into public.stock_movements(
      company_id, warehouse_id, product_id, movement_type, qty,
      reference_type, reference_no, request_id, created_by
    ) values (
      ctx.company_id,
      (line->>'warehouse_id')::uuid,
      (line->>'product_id')::uuid,
      'OPENING_BALANCE',
      (line->>'qty')::numeric,
      'OPENING_STOCK',
      btrim(p_reference_no),
      movement_request_id,
      auth.uid()
    );

    total_qty := total_qty + (line->>'qty')::numeric;
    total_value := total_value + ((line->>'qty')::numeric * (line->>'unit_cost')::numeric);
  end loop;

  insert into public.audit_logs(company_id, user_id, action, entity_type, entity_id, after_data)
  values (
    ctx.company_id,
    auth.uid(),
    'POST_OPENING_STOCK',
    'OPENING_STOCK',
    batch_id::text,
    jsonb_build_object(
      'reference_no', btrim(p_reference_no),
      'opening_date', p_opening_date,
      'line_count', line_count,
      'total_qty', total_qty,
      'total_value', total_value,
      'request_id', p_request_id
    )
  );

  return jsonb_build_object(
    'id', batch_id,
    'reference_no', btrim(p_reference_no),
    'line_count', line_count,
    'total_qty', total_qty,
    'total_value', total_value,
    'idempotent', false
  );
end
$$;

revoke all on table public.opening_stock_batches from public, anon;
revoke all on table public.opening_stock_lines from public, anon;
grant select on table public.opening_stock_batches to authenticated;
grant select on table public.opening_stock_lines to authenticated;

revoke all on function public.post_opening_stock(text,date,jsonb,text) from public, anon;
grant execute on function public.post_opening_stock(text,date,jsonb,text) to authenticated;
