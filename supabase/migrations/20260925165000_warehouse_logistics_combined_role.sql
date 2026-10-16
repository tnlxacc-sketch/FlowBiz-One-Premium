-- Minimal-impact combined operational role:
-- one account may perform Warehouse + Logistics without changing the single-role model.

alter table public.user_profiles
  drop constraint if exists user_profiles_app_role_check;

alter table public.user_profiles
  add constraint user_profiles_app_role_check
  check (app_role in ('SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN'));

create or replace function private.require_role(allowed text[])
returns table(company_id uuid,app_role text)
language plpgsql
stable
security definer
set search_path=public,private
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if exists(
    select 1
    from public.user_profiles
    where user_id=auth.uid() and active and must_change_password
  ) then
    raise exception 'PASSWORD_CHANGE_REQUIRED';
  end if;

  return query
    select p.company_id,p.app_role
    from public.user_profiles p
    join public.companies c on c.id=p.company_id
    where p.user_id=auth.uid()
      and p.active
      and not p.must_change_password
      and c.active
      and (
        c.subscription_status in ('DEMO','ACTIVE')
        or (
          c.subscription_status='TRIAL'
          and (c.trial_ends_at is null or c.trial_ends_at>now())
        )
      )
      and (
        p.app_role=any(allowed)
        or (
          p.app_role='WAREHOUSE_LOGISTICS'
          and (
            'WAREHOUSE'=any(allowed)
            or 'LOGISTICS'=any(allowed)
            or 'WAREHOUSE_LOGISTICS'=any(allowed)
          )
        )
      )
    limit 1;

  if not found then
    if exists(
      select 1
      from public.user_profiles p
      join public.companies c on c.id=p.company_id
      where p.user_id=auth.uid()
        and p.active
        and (
          not c.active
          or c.subscription_status in ('SUSPENDED','EXPIRED')
          or (c.subscription_status='TRIAL' and c.trial_ends_at<=now())
        )
    ) then
      raise exception 'COMPANY_INACTIVE';
    end if;
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
end
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_app_role text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  target record;
  company_limit integer;
  active_count bigint;
begin
  select * into ctx from private.require_role(array['ADMIN']);

  if p_app_role not in ('SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN') then
    raise exception 'INVALID_ROLE';
  end if;

  select p.user_id,p.app_role,p.active
    into target
  from public.user_profiles p
  where p.user_id=p_user_id
    and p.company_id=ctx.company_id
  for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if p_user_id=auth.uid() and (not p_active or p_app_role<>'ADMIN') then
    raise exception 'CANNOT_REMOVE_OWN_ADMIN';
  end if;

  if p_active and not target.active then
    select c.max_users
      into company_limit
    from public.companies c
    where c.id=ctx.company_id
    for update;

    if company_limit is null then
      raise exception 'COMPANY_NOT_FOUND';
    end if;

    select count(*)
      into active_count
    from public.user_profiles p
    where p.company_id=ctx.company_id
      and p.active;

    if active_count >= company_limit then
      raise exception 'USER_LIMIT_REACHED';
    end if;
  end if;

  update public.user_profiles
  set app_role=p_app_role,
      active=p_active
  where user_id=p_user_id
    and company_id=ctx.company_id;

  insert into public.audit_logs(
    company_id,user_id,action,entity_type,entity_id,before_data,after_data
  )
  values(
    ctx.company_id,
    auth.uid(),
    'UPDATE_USER_ROLE',
    'USER',
    p_user_id::text,
    jsonb_build_object('role',target.app_role,'active',target.active),
    jsonb_build_object('role',p_app_role,'active',p_active)
  );

  return jsonb_build_object(
    'user_id',p_user_id,
    'role',p_app_role,
    'active',p_active
  );
end
$$;

drop policy if exists tenant_select_delivery_documents on public.delivery_documents;
create policy tenant_select_delivery_documents
on public.delivery_documents
for select
to authenticated
using (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN')
);

drop policy if exists role_insert_stock_count_lines on public.stock_count_lines;
create policy role_insert_stock_count_lines
on public.stock_count_lines
for insert
to authenticated
with check (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
);

drop policy if exists role_update_stock_count_lines on public.stock_count_lines;
create policy role_update_stock_count_lines
on public.stock_count_lines
for update
to authenticated
using (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
)
with check (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
);

drop policy if exists role_insert_stock_counts on public.stock_counts;
create policy role_insert_stock_counts
on public.stock_counts
for insert
to authenticated
with check (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
);

drop policy if exists role_update_stock_counts on public.stock_counts;
create policy role_update_stock_counts
on public.stock_counts
for update
to authenticated
using (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
)
with check (
  company_id=(select public.current_company_id())
  and (select public.current_app_role()) in ('WAREHOUSE','WAREHOUSE_LOGISTICS','ADMIN')
);

drop policy if exists flowstock_pod_insert on storage.objects;
create policy flowstock_pod_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='pod-documents'
  and (storage.foldername(name))[1]=(select public.current_company_id())::text
  and (select public.current_app_role()) in ('LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN')
  and owner_id=(select auth.uid())::text
);

drop policy if exists flowstock_pod_select on storage.objects;
create policy flowstock_pod_select
on storage.objects
for select
to authenticated
using (
  bucket_id='pod-documents'
  and (storage.foldername(name))[1]=(select public.current_company_id())::text
  and (select public.current_app_role()) in ('LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN')
);

revoke all on function public.admin_update_user(uuid,text,boolean) from public,anon;
grant execute on function public.admin_update_user(uuid,text,boolean) to authenticated;
