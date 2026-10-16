-- FlowStock admin controls: access requests, stock count, and period close.

alter table public.stock_count_lines add column if not exists variance_reason text;
alter table public.stock_counts add column if not exists request_id text;
create unique index if not exists stock_counts_company_request_uq on public.stock_counts(company_id,request_id) where request_id is not null;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  email text not null,
  full_name text not null,
  employee_code text,
  requested_role text not null default 'SALES' check(requested_role in ('SALES','WAREHOUSE','LOGISTICS','OWNER')),
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  unique(user_id,company_id)
);
alter table public.access_requests enable row level security;
create policy access_request_self_select on public.access_requests for select to authenticated using(user_id=(select auth.uid()));
create policy access_request_admin_select on public.access_requests for select to authenticated
  using(company_id=(select public.current_company_id()) and (select public.current_app_role())='ADMIN');
revoke all on public.access_requests from anon;
grant select on public.access_requests to authenticated;

create or replace function public.request_access(p_full_name text,p_employee_code text,p_requested_role text default 'SALES')
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); cid uuid; mail text; rid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.user_profiles where user_id=uid) then raise exception 'PROFILE_ALREADY_EXISTS'; end if;
  if p_requested_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER') then raise exception 'INVALID_REQUESTED_ROLE'; end if;
  select id into cid from public.companies where code='DEMO' order by created_at limit 1;
  select email into mail from auth.users where id=uid;
  insert into public.access_requests(user_id,company_id,email,full_name,employee_code,requested_role,status)
  values(uid,cid,mail,btrim(p_full_name),nullif(btrim(p_employee_code),''),p_requested_role,'PENDING')
  on conflict(user_id,company_id) do update set full_name=excluded.full_name,employee_code=excluded.employee_code,requested_role=excluded.requested_role,status='PENDING',requested_at=now(),reviewed_at=null,reviewed_by=null
  returning id into rid;
  return jsonb_build_object('id',rid,'status','PENDING');
end $$;

create or replace function public.approve_access(p_request_id uuid,p_app_role text)
returns jsonb language plpgsql security definer set search_path=public,auth,private
as $$
declare ctx record; req record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_app_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN') then raise exception 'INVALID_ROLE'; end if;
  select * into req from public.access_requests where id=p_request_id and company_id=ctx.company_id and status='PENDING' for update;
  if not found then raise exception 'ACCESS_REQUEST_NOT_FOUND'; end if;
  insert into public.user_profiles(user_id,company_id,employee_code,full_name,app_role,active)
  values(req.user_id,req.company_id,req.employee_code,req.full_name,p_app_role,true)
  on conflict(user_id) do update set company_id=excluded.company_id,employee_code=excluded.employee_code,full_name=excluded.full_name,app_role=excluded.app_role,active=true;
  update public.access_requests set status='APPROVED',reviewed_at=now(),reviewed_by=auth.uid() where id=req.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'APPROVE_ACCESS','USER',req.user_id::text,jsonb_build_object('role',p_app_role,'email',req.email));
  return jsonb_build_object('user_id',req.user_id,'role',p_app_role,'status','APPROVED');
end $$;

create or replace function public.reject_access(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; req record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  select * into req from public.access_requests where id=p_request_id and company_id=ctx.company_id and status='PENDING' for update;
  if not found then raise exception 'ACCESS_REQUEST_NOT_FOUND'; end if;
  update public.access_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid() where id=req.id;
  return jsonb_build_object('id',req.id,'status','REJECTED');
end $$;

create or replace function public.admin_list_users()
returns table(user_id uuid,email text,employee_code text,full_name text,app_role text,active boolean)
language plpgsql security definer set search_path=public,auth,private
as $$
declare ctx record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  return query select p.user_id,u.email::text,p.employee_code,p.full_name,p.app_role,p.active
  from public.user_profiles p left join auth.users u on u.id=p.user_id where p.company_id=ctx.company_id order by p.full_name;
end $$;

create or replace function public.admin_update_user(p_user_id uuid,p_app_role text,p_active boolean)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_app_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN') then raise exception 'INVALID_ROLE'; end if;
  if p_user_id=auth.uid() and (not p_active or p_app_role<>'ADMIN') then raise exception 'CANNOT_REMOVE_OWN_ADMIN'; end if;
  update public.user_profiles set app_role=p_app_role,active=p_active where user_id=p_user_id and company_id=ctx.company_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'UPDATE_USER_ROLE','USER',p_user_id::text,jsonb_build_object('role',p_app_role,'active',p_active));
  return jsonb_build_object('user_id',p_user_id,'role',p_app_role,'active',p_active);
end $$;

create or replace function public.post_stock_count(p_warehouse_id uuid,p_lines jsonb,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; cid uuid; cno text; line jsonb; bal record; delta numeric; existing record; rid text;
begin
  select * into ctx from private.require_role(array['WAREHOUSE','ADMIN']);
  select id,count_no into existing from public.stock_counts where company_id=ctx.company_id and request_id=p_request_id;
  if found then return jsonb_build_object('id',existing.id,'count_no',existing.count_no,'idempotent',true); end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'COUNT_LINES_REQUIRED'; end if;
  cno:=private.next_doc_no('SC-', 'public.stock_counts'::regclass, 'count_no', ctx.company_id);
  insert into public.stock_counts(company_id,count_no,warehouse_id,status,snapshot_at,request_id)
  values(ctx.company_id,cno,p_warehouse_id,'POSTED',now(),p_request_id) returning id into cid;
  for line in select * from jsonb_array_elements(p_lines) loop
    if (line->>'count_qty')::numeric<0 then raise exception 'INVALID_COUNT_QTY'; end if;
    select * into bal from public.stock_balances where company_id=ctx.company_id and warehouse_id=p_warehouse_id and product_id=(line->>'product_id')::uuid for update;
    if not found then
      insert into public.stock_balances(company_id,warehouse_id,product_id,on_hand,allocated) values(ctx.company_id,p_warehouse_id,(line->>'product_id')::uuid,0,0) returning * into bal;
    end if;
    delta:=(line->>'count_qty')::numeric-bal.on_hand;
    if delta<>0 and coalesce(btrim(line->>'variance_reason'),'')='' then raise exception 'COUNT_VARIANCE_REASON_REQUIRED'; end if;
    insert into public.stock_count_lines(company_id,count_id,product_id,book_qty,count_qty,variance_reason)
    values(ctx.company_id,cid,bal.product_id,bal.on_hand,(line->>'count_qty')::numeric,line->>'variance_reason');
    if delta<>0 then
      update public.stock_balances set on_hand=(line->>'count_qty')::numeric,version=version+1 where id=bal.id;
      rid:=p_request_id||'-'||bal.product_id::text;
      insert into public.stock_movements(company_id,warehouse_id,product_id,movement_type,qty,reference_type,reference_no,request_id,created_by)
      values(ctx.company_id,p_warehouse_id,bal.product_id,'COUNT_ADJUSTMENT',delta,'STOCK_COUNT',cno,rid,auth.uid());
    end if;
  end loop;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'POST_STOCK_COUNT','STOCK_COUNT',cid::text,jsonb_build_object('count_no',cno));
  return jsonb_build_object('id',cid,'count_no',cno,'idempotent',false);
end $$;

create or replace function public.set_period_status(p_period_month date,p_status text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare ctx record; pm date:=date_trunc('month',p_period_month)::date;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_status not in ('OPEN','CLOSED') then raise exception 'INVALID_PERIOD_STATUS'; end if;
  if p_status='OPEN' and coalesce(btrim(p_reason),'')='' then raise exception 'REOPEN_REASON_REQUIRED'; end if;
  insert into public.period_closes(company_id,period_month,status,closed_at,reopen_reason)
  values(ctx.company_id,pm,p_status,case when p_status='CLOSED' then now() end,case when p_status='OPEN' then p_reason end)
  on conflict(company_id,period_month) do update set status=excluded.status,closed_at=excluded.closed_at,reopen_reason=excluded.reopen_reason;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),case when p_status='CLOSED' then 'CLOSE_PERIOD' else 'REOPEN_PERIOD' end,'PERIOD',pm::text,jsonb_build_object('status',p_status,'reason',p_reason));
  return jsonb_build_object('period_month',pm,'status',p_status);
end $$;

create or replace function private.block_closed_period()
returns trigger language plpgsql security definer set search_path=public
as $$
declare d date; c uuid;
begin
  c:=new.company_id;
  d:=case tg_table_name when 'orders' then new.order_date when 'goods_receipts' then new.receipt_date when 'invoices' then new.invoice_date when 'monthly_product_costs' then new.cost_month else current_date end;
  if exists(select 1 from public.period_closes where company_id=c and period_month=date_trunc('month',d)::date and status='CLOSED') then raise exception 'PERIOD_CLOSED'; end if;
  return new;
end $$;
drop trigger if exists block_closed_period_orders on public.orders;
drop trigger if exists block_closed_period_receipts on public.goods_receipts;
drop trigger if exists block_closed_period_invoices on public.invoices;
drop trigger if exists block_closed_period_costs on public.monthly_product_costs;
create trigger block_closed_period_orders before insert or update on public.orders for each row execute function private.block_closed_period();
create trigger block_closed_period_receipts before insert or update on public.goods_receipts for each row execute function private.block_closed_period();
create trigger block_closed_period_invoices before insert or update on public.invoices for each row execute function private.block_closed_period();
create trigger block_closed_period_costs before insert or update on public.monthly_product_costs for each row execute function private.block_closed_period();

revoke all on function public.request_access(text,text,text) from public,anon;
revoke all on function public.approve_access(uuid,text) from public,anon;
revoke all on function public.reject_access(uuid) from public,anon;
revoke all on function public.admin_list_users() from public,anon;
revoke all on function public.admin_update_user(uuid,text,boolean) from public,anon;
revoke all on function public.post_stock_count(uuid,jsonb,text) from public,anon;
revoke all on function public.set_period_status(date,text,text) from public,anon;
grant execute on function public.request_access(text,text,text) to authenticated;
grant execute on function public.approve_access(uuid,text) to authenticated;
grant execute on function public.reject_access(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid,text,boolean) to authenticated;
grant execute on function public.post_stock_count(uuid,jsonb,text) to authenticated;
grant execute on function public.set_period_status(date,text,text) to authenticated;

