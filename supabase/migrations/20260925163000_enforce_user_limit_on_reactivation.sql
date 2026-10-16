-- Prevent Company Admin from reactivating an inactive user when the tenant
-- has already reached its package user limit. Active seats only are counted.

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

  if p_app_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN') then
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

revoke all on function public.admin_update_user(uuid,text,boolean) from public,anon;
grant execute on function public.admin_update_user(uuid,text,boolean) to authenticated;
