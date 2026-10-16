-- FlowStock Commercial Release
-- Tenant lifecycle, secure onboarding, plan controls, and private POD documents.

alter table public.companies add column if not exists legal_name text;
alter table public.companies add column if not exists is_demo boolean not null default false;
alter table public.companies add column if not exists active boolean not null default true;
alter table public.companies add column if not exists subscription_plan text not null default 'STARTER';
alter table public.companies add column if not exists subscription_status text not null default 'TRIAL';
alter table public.companies add column if not exists trial_ends_at timestamptz;
alter table public.companies add column if not exists max_users integer not null default 10;
alter table public.companies add column if not exists branding jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='companies_subscription_plan_check') then
    alter table public.companies add constraint companies_subscription_plan_check
      check (subscription_plan in ('DEMO','STARTER','BUSINESS','ENTERPRISE'));
  end if;
  if not exists (select 1 from pg_constraint where conname='companies_subscription_status_check') then
    alter table public.companies add constraint companies_subscription_status_check
      check (subscription_status in ('DEMO','TRIAL','ACTIVE','SUSPENDED','EXPIRED'));
  end if;
  if not exists (select 1 from pg_constraint where conname='companies_max_users_check') then
    alter table public.companies add constraint companies_max_users_check check (max_users between 1 and 10000);
  end if;
end $$;

create unique index if not exists companies_code_lower_uq on public.companies(lower(code));
update public.companies
set is_demo=true, subscription_plan='DEMO', subscription_status='DEMO', legal_name=coalesce(legal_name,name)
where code='DEMO';

create table if not exists private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public, anon, authenticated;

insert into private.platform_admins(user_id,created_by)
select p.user_id,p.user_id
from public.user_profiles p
join public.companies c on c.id=p.company_id
where c.code='DEMO' and p.app_role='ADMIN' and p.active
on conflict(user_id) do nothing;

create table if not exists private.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code_hash text not null unique,
  invite_role text not null default 'ADMIN' check(invite_role in ('ADMIN','SALES','WAREHOUSE','LOGISTICS','OWNER')),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check(max_uses > 0),
  used_count integer not null default 0 check(used_count >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.tenant_invites enable row level security;
revoke all on private.tenant_invites from public, anon, authenticated;
create index if not exists tenant_invites_company_idx on private.tenant_invites(company_id);
create index if not exists tenant_invites_expiry_idx on private.tenant_invites(expires_at) where active;
create unique index if not exists access_requests_one_pending_per_user_uq on public.access_requests(user_id) where status='PENDING';

create table if not exists public.delivery_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  trip_id uuid not null references public.delivery_trips(id) on delete cascade,
  bucket_id text not null default 'pod-documents',
  object_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check(file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.delivery_documents enable row level security;
create index if not exists delivery_documents_company_idx on public.delivery_documents(company_id);
create index if not exists delivery_documents_trip_idx on public.delivery_documents(trip_id);
drop policy if exists tenant_select_delivery_documents on public.delivery_documents;
create policy tenant_select_delivery_documents on public.delivery_documents for select to authenticated
  using (
    company_id=(select public.current_company_id())
    and (select public.current_app_role()) in ('LOGISTICS','OWNER','ADMIN')
  );
revoke all on public.delivery_documents from anon;
grant select on public.delivery_documents to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pod-documents','pod-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists flowstock_pod_select on storage.objects;
drop policy if exists flowstock_pod_insert on storage.objects;
drop policy if exists flowstock_pod_delete on storage.objects;
create policy flowstock_pod_select on storage.objects for select to authenticated
  using (
    bucket_id='pod-documents'
    and (storage.foldername(name))[1]=(select public.current_company_id())::text
    and (select public.current_app_role()) in ('LOGISTICS','OWNER','ADMIN')
  );
create policy flowstock_pod_insert on storage.objects for insert to authenticated
  with check (
    bucket_id='pod-documents'
    and (storage.foldername(name))[1]=(select public.current_company_id())::text
    and (select public.current_app_role()) in ('LOGISTICS','ADMIN')
    and owner_id=(select auth.uid())::text
  );
create policy flowstock_pod_delete on storage.objects for delete to authenticated
  using (
    bucket_id='pod-documents'
    and (storage.foldername(name))[1]=(select public.current_company_id())::text
    and (select public.current_app_role())='ADMIN'
  );

create or replace function private.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=private
as $$ select exists(select 1 from private.platform_admins where user_id=p_user_id) $$;
revoke all on function private.is_platform_admin(uuid) from public,anon,authenticated;

create or replace function public.is_platform_admin()
returns boolean language plpgsql stable security definer set search_path=private,public
as $$ begin
  if auth.uid() is null then return false; end if;
  return private.is_platform_admin(auth.uid());
end $$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path=public
as $$
  select p.company_id
  from public.user_profiles p join public.companies c on c.id=p.company_id
  where p.user_id=(select auth.uid()) and p.active and c.active
    and (c.subscription_status in ('DEMO','ACTIVE') or (c.subscription_status='TRIAL' and (c.trial_ends_at is null or c.trial_ends_at>now())))
  limit 1
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path=public
as $$
  select p.app_role
  from public.user_profiles p join public.companies c on c.id=p.company_id
  where p.user_id=(select auth.uid()) and p.active and c.active
    and (c.subscription_status in ('DEMO','ACTIVE') or (c.subscription_status='TRIAL' and (c.trial_ends_at is null or c.trial_ends_at>now())))
  limit 1
$$;

create or replace function private.require_role(allowed text[])
returns table(company_id uuid,app_role text)
language plpgsql stable security definer set search_path=public,private
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select p.company_id,p.app_role
    from public.user_profiles p join public.companies c on c.id=p.company_id
    where p.user_id=auth.uid() and p.active and c.active
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

create or replace function public.platform_list_companies()
returns table(
  id uuid,code text,name text,subscription_plan text,subscription_status text,
  trial_ends_at timestamptz,max_users integer,active_users bigint,is_demo boolean,created_at timestamptz
)
language plpgsql stable security definer set search_path=public,private
as $$ begin
  if not private.is_platform_admin(auth.uid()) then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  return query
  select c.id,c.code,c.name,c.subscription_plan,c.subscription_status,c.trial_ends_at,c.max_users,
    (select count(*) from public.user_profiles p where p.company_id=c.id and p.active),c.is_demo,c.created_at
  from public.companies c order by c.is_demo desc,c.created_at desc;
end $$;

create or replace function public.platform_create_tenant(
  p_code text,p_name text,p_plan text default 'STARTER',p_trial_days integer default 30,p_max_users integer default 10
)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare uid uuid:=auth.uid(); cid uuid; raw_code text; clean_code text:=upper(btrim(p_code));
begin
  if not private.is_platform_admin(uid) then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if clean_code !~ '^[A-Z0-9][A-Z0-9_-]{2,19}$' then raise exception 'INVALID_COMPANY_CODE'; end if;
  if coalesce(btrim(p_name),'')='' then raise exception 'COMPANY_NAME_REQUIRED'; end if;
  if p_plan not in ('STARTER','BUSINESS','ENTERPRISE') then raise exception 'INVALID_PLAN'; end if;
  if p_trial_days not between 1 and 365 or p_max_users not between 1 and 10000 then raise exception 'INVALID_PLAN_LIMIT'; end if;
  insert into public.companies(code,name,legal_name,subscription_plan,subscription_status,trial_ends_at,max_users,active,is_demo)
  values(clean_code,btrim(p_name),btrim(p_name),p_plan,'TRIAL',now()+make_interval(days=>p_trial_days),p_max_users,true,false)
  returning id into cid;
  raw_code:=upper(substr(encode(extensions.gen_random_bytes(16),'hex'),1,20));
  insert into private.tenant_invites(company_id,code_hash,invite_role,expires_at,max_uses,created_by)
  values(cid,encode(extensions.digest(raw_code,'sha256'),'hex'),'ADMIN',now()+interval '7 days',1,uid);
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(cid,uid,'CREATE_TENANT','COMPANY',cid::text,jsonb_build_object('code',clean_code,'plan',p_plan,'max_users',p_max_users));
  return jsonb_build_object('company_id',cid,'company_code',clean_code,'onboarding_code',raw_code,'expires_at',now()+interval '7 days');
exception when unique_violation then raise exception 'COMPANY_CODE_EXISTS';
end $$;

create or replace function public.platform_set_company_status(p_company_id uuid,p_status text,p_plan text,p_max_users integer)
returns jsonb language plpgsql security definer set search_path=public,private
as $$
declare uid uuid:=auth.uid(); c record;
begin
  if not private.is_platform_admin(uid) then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if p_status not in ('TRIAL','ACTIVE','SUSPENDED','EXPIRED') then raise exception 'INVALID_SUBSCRIPTION_STATUS'; end if;
  if p_plan not in ('STARTER','BUSINESS','ENTERPRISE') or p_max_users not between 1 and 10000 then raise exception 'INVALID_PLAN_LIMIT'; end if;
  select * into c from public.companies where id=p_company_id and not is_demo for update;
  if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
  update public.companies set subscription_status=p_status,subscription_plan=p_plan,max_users=p_max_users,active=(p_status not in ('SUSPENDED','EXPIRED')) where id=p_company_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_company_id,uid,'UPDATE_TENANT_STATUS','COMPANY',p_company_id::text,
    jsonb_build_object('status',c.subscription_status,'plan',c.subscription_plan,'max_users',c.max_users),
    jsonb_build_object('status',p_status,'plan',p_plan,'max_users',p_max_users));
  return jsonb_build_object('company_id',p_company_id,'status',p_status,'plan',p_plan,'max_users',p_max_users);
end $$;

create or replace function public.claim_tenant_admin(p_onboarding_code text,p_full_name text,p_employee_code text default null)
returns jsonb language plpgsql security definer set search_path=public,private,auth
as $$
declare uid uuid:=auth.uid(); inv record; company record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.user_profiles where user_id=uid) then raise exception 'PROFILE_ALREADY_EXISTS'; end if;
  select i.* into inv from private.tenant_invites i
  where i.code_hash=encode(extensions.digest(upper(btrim(p_onboarding_code)),'sha256'),'hex')
    and i.active and i.expires_at>now() and i.used_count<i.max_uses
  for update;
  if not found then raise exception 'INVALID_OR_EXPIRED_ONBOARDING_CODE'; end if;
  select * into company from public.companies where id=inv.company_id and active for update;
  if not found then raise exception 'COMPANY_INACTIVE'; end if;
  if (select count(*) from public.user_profiles where company_id=company.id and active)>=company.max_users then raise exception 'USER_LIMIT_REACHED'; end if;
  insert into public.user_profiles(user_id,company_id,employee_code,full_name,app_role,active)
  values(uid,company.id,nullif(btrim(p_employee_code),''),btrim(p_full_name),inv.invite_role,true);
  update private.tenant_invites set used_count=used_count+1,active=(used_count+1<max_uses) where id=inv.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(company.id,uid,'CLAIM_TENANT_ADMIN','USER',uid::text,jsonb_build_object('role',inv.invite_role));
  return jsonb_build_object('company_id',company.id,'company_code',company.code,'role',inv.invite_role,'status','ACTIVE');
end $$;

create or replace function public.request_access(
  p_full_name text,p_employee_code text,p_requested_role text,p_company_code text
)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); cid uuid; mail text; rid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.user_profiles where user_id=uid) then raise exception 'PROFILE_ALREADY_EXISTS'; end if;
  if p_requested_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER') then raise exception 'INVALID_REQUESTED_ROLE'; end if;
  select id into cid from public.companies
  where upper(code)=upper(btrim(p_company_code)) and active
    and (subscription_status in ('DEMO','ACTIVE') or (subscription_status='TRIAL' and (trial_ends_at is null or trial_ends_at>now())));
  if cid is null then raise exception 'COMPANY_NOT_FOUND'; end if;
  if exists(select 1 from public.access_requests where user_id=uid and status='PENDING' and company_id<>cid) then raise exception 'ACCESS_REQUEST_ALREADY_PENDING'; end if;
  select email into mail from auth.users where id=uid;
  insert into public.access_requests(user_id,company_id,email,full_name,employee_code,requested_role,status)
  values(uid,cid,mail,btrim(p_full_name),nullif(btrim(p_employee_code),''),p_requested_role,'PENDING')
  on conflict(user_id,company_id) do update set full_name=excluded.full_name,employee_code=excluded.employee_code,
    requested_role=excluded.requested_role,status='PENDING',requested_at=now(),reviewed_at=null,reviewed_by=null
  returning id into rid;
  return jsonb_build_object('id',rid,'status','PENDING','company_id',cid);
end $$;

create or replace function public.approve_access(p_request_id uuid,p_app_role text)
returns jsonb language plpgsql security definer set search_path=public,auth,private
as $$
declare ctx record; req record; company record;
begin
  select * into ctx from private.require_role(array['ADMIN']);
  if p_app_role not in ('SALES','WAREHOUSE','LOGISTICS','OWNER','ADMIN') then raise exception 'INVALID_ROLE'; end if;
  select * into req from public.access_requests where id=p_request_id and company_id=ctx.company_id and status='PENDING' for update;
  if not found then raise exception 'ACCESS_REQUEST_NOT_FOUND'; end if;
  select * into company from public.companies where id=ctx.company_id for update;
  if (select count(*) from public.user_profiles where company_id=ctx.company_id and active)>=company.max_users then raise exception 'USER_LIMIT_REACHED'; end if;
  insert into public.user_profiles(user_id,company_id,employee_code,full_name,app_role,active)
  values(req.user_id,req.company_id,req.employee_code,req.full_name,p_app_role,true)
  on conflict(user_id) do update set company_id=excluded.company_id,employee_code=excluded.employee_code,
    full_name=excluded.full_name,app_role=excluded.app_role,active=true;
  update public.access_requests set status='APPROVED',reviewed_at=now(),reviewed_by=auth.uid() where id=req.id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'APPROVE_ACCESS','USER',req.user_id::text,jsonb_build_object('role',p_app_role,'email',req.email));
  return jsonb_build_object('user_id',req.user_id,'role',p_app_role,'status','APPROVED');
end $$;

create or replace function public.attach_delivery_document(
  p_trip_id uuid,p_object_path text,p_original_name text,p_mime_type text,p_file_size bigint
)
returns jsonb language plpgsql security definer set search_path=public,private,storage
as $$
declare ctx record; doc_id uuid;
begin
  select * into ctx from private.require_role(array['LOGISTICS','ADMIN']);
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_file_size<=0 or p_file_size>10485760 then raise exception 'INVALID_POD_FILE'; end if;
  if p_object_path not like ctx.company_id::text||'/'||p_trip_id::text||'/%' then raise exception 'INVALID_POD_PATH'; end if;
  if not exists(select 1 from public.delivery_trips where id=p_trip_id and company_id=ctx.company_id) then raise exception 'TRIP_NOT_FOUND'; end if;
  if not exists(select 1 from storage.objects where bucket_id='pod-documents' and name=p_object_path) then raise exception 'POD_OBJECT_NOT_FOUND'; end if;
  insert into public.delivery_documents(company_id,trip_id,object_path,original_name,mime_type,file_size,uploaded_by)
  values(ctx.company_id,p_trip_id,p_object_path,p_original_name,p_mime_type,p_file_size,auth.uid())
  returning id into doc_id;
  insert into public.audit_logs(company_id,user_id,action,entity_type,entity_id,after_data)
  values(ctx.company_id,auth.uid(),'ATTACH_POD','DELIVERY_TRIP',p_trip_id::text,jsonb_build_object('document_id',doc_id,'name',p_original_name));
  return jsonb_build_object('id',doc_id,'trip_id',p_trip_id,'object_path',p_object_path);
end $$;

revoke all on function public.request_access(text,text,text) from authenticated;
revoke all on function public.current_company_id() from public,anon;
revoke all on function public.current_app_role() from public,anon;
revoke all on function private.require_role(text[]) from public,anon,authenticated;
revoke all on function public.is_platform_admin() from public,anon;
revoke all on function public.get_my_context() from public,anon;
revoke all on function public.platform_list_companies() from public,anon;
revoke all on function public.platform_create_tenant(text,text,text,integer,integer) from public,anon;
revoke all on function public.platform_set_company_status(uuid,text,text,integer) from public,anon;
revoke all on function public.claim_tenant_admin(text,text,text) from public,anon;
revoke all on function public.request_access(text,text,text,text) from public,anon;
revoke all on function public.attach_delivery_document(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.get_my_context() to authenticated;
grant execute on function public.platform_list_companies() to authenticated;
grant execute on function public.platform_create_tenant(text,text,text,integer,integer) to authenticated;
grant execute on function public.platform_set_company_status(uuid,text,text,integer) to authenticated;
grant execute on function public.claim_tenant_admin(text,text,text) to authenticated;
grant execute on function public.request_access(text,text,text,text) to authenticated;
grant execute on function public.attach_delivery_document(uuid,text,text,text,bigint) to authenticated;
