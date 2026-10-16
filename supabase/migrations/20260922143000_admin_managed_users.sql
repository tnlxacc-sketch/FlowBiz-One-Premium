-- Company Admin creates users with a temporary password. The user must change
-- that password before tenant data or business RPCs become available.

alter table public.user_profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_change_required_at timestamptz;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path=public
as $$
  select p.company_id
  from public.user_profiles p join public.companies c on c.id=p.company_id
  where p.user_id=(select auth.uid()) and p.active and not p.must_change_password and c.active
    and (c.subscription_status in ('DEMO','ACTIVE') or (c.subscription_status='TRIAL' and (c.trial_ends_at is null or c.trial_ends_at>now())))
  limit 1
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path=public
as $$
  select p.app_role
  from public.user_profiles p join public.companies c on c.id=p.company_id
  where p.user_id=(select auth.uid()) and p.active and not p.must_change_password and c.active
    and (c.subscription_status in ('DEMO','ACTIVE') or (c.subscription_status='TRIAL' and (c.trial_ends_at is null or c.trial_ends_at>now())))
  limit 1
$$;

create or replace function private.require_role(allowed text[])
returns table(company_id uuid,app_role text)
language plpgsql stable security definer set search_path=public,private
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.user_profiles where user_id=auth.uid() and active and must_change_password) then
    raise exception 'PASSWORD_CHANGE_REQUIRED';
  end if;
  return query
    select p.company_id,p.app_role
    from public.user_profiles p join public.companies c on c.id=p.company_id
    where p.user_id=auth.uid() and p.active and not p.must_change_password and c.active
      and (c.subscription_status in ('DEMO','ACTIVE') or (c.subscription_status='TRIAL' and (c.trial_ends_at is null or c.trial_ends_at>now())))
      and p.app_role=any(allowed)
    limit 1;
  if not found then
    if exists(select 1 from public.user_profiles p join public.companies c on c.id=p.company_id
      where p.user_id=auth.uid() and p.active and (not c.active or c.subscription_status in ('SUSPENDED','EXPIRED') or (c.subscription_status='TRIAL' and c.trial_ends_at<=now()))) then
      raise exception 'COMPANY_INACTIVE';
    end if;
    raise exception 'ROLE_NOT_ALLOWED';
  end if;
end $$;

create or replace function public.get_my_context()
returns jsonb language plpgsql stable security definer set search_path=public,private
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select jsonb_build_object(
    'user_id',p.user_id,'company_id',p.company_id,'employee_code',p.employee_code,
    'full_name',p.full_name,'app_role',p.app_role,'active',p.active,
    'must_change_password',p.must_change_password,
    'is_platform_admin',private.is_platform_admin(p.user_id),
    'company',jsonb_build_object(
      'id',c.id,'code',c.code,'name',c.name,'legal_name',c.legal_name,
      'currency',c.currency,'timezone',c.timezone,'gp_policy',c.gp_policy,
      'is_demo',c.is_demo,'active',c.active,'subscription_plan',c.subscription_plan,
      'subscription_status',c.subscription_status,'trial_ends_at',c.trial_ends_at,
      'max_users',c.max_users,'branding',c.branding
    )
  ) into result
  from public.user_profiles p join public.companies c on c.id=p.company_id
  where p.user_id=auth.uid();
  return result;
end $$;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table(user_id uuid,email text,employee_code text,full_name text,app_role text,active boolean,must_change_password boolean)
language plpgsql security definer set search_path=public,auth,private
as $$
declare ctx record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  return query select p.user_id,u.email::text,p.employee_code,p.full_name,p.app_role,p.active,p.must_change_password
  from public.user_profiles p left join auth.users u on u.id=p.user_id where p.company_id=ctx.company_id order by p.full_name;
end $$;

create or replace function public.complete_initial_password_change()
returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); required_at timestamptz; auth_updated_at timestamptz; cid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select company_id,password_change_required_at into cid,required_at
  from public.user_profiles where user_id=uid and active and must_change_password for update;
  if not found then return jsonb_build_object('completed',true,'already_completed',true); end if;
  select updated_at into auth_updated_at from auth.users where id=uid;
  if required_at is not null and (auth_updated_at is null or auth_updated_at<=required_at) then
    raise exception 'PASSWORD_NOT_CHANGED';
  end if;
  update public.user_profiles set must_change_password=false,password_change_required_at=null where user_id=uid;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(cid,uid,'COMPLETE_INITIAL_PASSWORD_CHANGE','USER',uid::text,jsonb_build_object('completed_at',now()));
  return jsonb_build_object('completed',true,'already_completed',false);
end $$;

revoke all on function public.admin_list_users() from public,anon;
revoke all on function public.complete_initial_password_change() from public,anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.complete_initial_password_change() to authenticated;
