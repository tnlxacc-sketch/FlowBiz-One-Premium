-- FlowBiz One v1.14.2 hotfix
-- Fix managed Master Data create/update/delete audit actor and Product Group soft-delete status.

alter table public.product_groups
  add column if not exists active boolean not null default true;

do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='admin_delete_master'
  limit 1;

  -- private.require_role() returns company_id and app_role only.
  -- Use the authenticated user directly for audit actor.
  def := replace(def, 'ctx.user_id', 'auth.uid()');
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='admin_upsert_master'
  limit 1;

  def := replace(def, 'ctx.user_id', 'auth.uid()');

  -- Make Product Group consistent with other managed masters.
  def := replace(def,
    'insert into public.product_groups(company_id,code,name) values(ctx.company_id,code_value,trim(p_payload->>''name'')) returning to_jsonb(product_groups.*) into new_row;',
    'insert into public.product_groups(company_id,code,name,active) values(ctx.company_id,code_value,trim(p_payload->>''name''),active_value) returning to_jsonb(product_groups.*) into new_row;'
  );

  def := replace(def,
    'update public.product_groups set code=coalesce(code_value,code),name=coalesce(nullif(trim(p_payload->>''name''),''''),name)',
    'update public.product_groups set code=coalesce(code_value,code),name=coalesce(nullif(trim(p_payload->>''name''),''''),name),active=active_value'
  );

  execute def;
end $$;

comment on column public.product_groups.active is
  'Soft-delete flag used by FlowBiz One managed master data controls.';
