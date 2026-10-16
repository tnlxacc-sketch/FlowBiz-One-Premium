-- Controlled Vehicle Type master.
-- Keep the existing text code on vehicles/expense_rates for backward compatibility,
-- but enforce that every non-null value belongs to the same tenant's master.

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint vehicle_types_code_not_blank check (btrim(code) <> ''),
  constraint vehicle_types_name_not_blank check (btrim(name) <> ''),
  constraint vehicle_types_company_code_uq unique (company_id, code)
);

insert into public.vehicle_types(company_id, code, name)
select company_id, vehicle_type, vehicle_type
from (
  select company_id, btrim(vehicle_type) as vehicle_type
  from public.vehicles
  where nullif(btrim(vehicle_type), '') is not null
  union
  select company_id, btrim(vehicle_type) as vehicle_type
  from public.expense_rates
  where nullif(btrim(vehicle_type), '') is not null
) existing_types
on conflict (company_id, code) do nothing;

update public.vehicles set vehicle_type = btrim(vehicle_type)
where vehicle_type is distinct from btrim(vehicle_type);
update public.expense_rates set vehicle_type = btrim(vehicle_type)
where vehicle_type is distinct from btrim(vehicle_type);

do $$ begin
  alter table public.vehicles add constraint vehicles_company_vehicle_type_fkey
    foreign key (company_id, vehicle_type) references public.vehicle_types(company_id, code);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.expense_rates add constraint expense_rates_company_vehicle_type_fkey
    foreign key (company_id, vehicle_type) references public.vehicle_types(company_id, code);
exception when duplicate_object then null; end $$;

create index if not exists vehicle_types_company_active_idx
  on public.vehicle_types(company_id, active, code);
alter table public.vehicle_types enable row level security;

drop policy if exists tenant_select_vehicle_types on public.vehicle_types;
create policy tenant_select_vehicle_types on public.vehicle_types for select to authenticated
  using (company_id = (select public.current_company_id()));

drop policy if exists admin_insert_vehicle_types on public.vehicle_types;
create policy admin_insert_vehicle_types on public.vehicle_types for insert to authenticated
  with check (company_id = (select public.current_company_id()) and (select public.current_app_role()) = 'ADMIN');

drop policy if exists admin_update_vehicle_types on public.vehicle_types;
create policy admin_update_vehicle_types on public.vehicle_types for update to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_app_role()) = 'ADMIN')
  with check (company_id = (select public.current_company_id()) and (select public.current_app_role()) = 'ADMIN');

drop policy if exists admin_delete_vehicle_types on public.vehicle_types;
create policy admin_delete_vehicle_types on public.vehicle_types for delete to authenticated
  using (company_id = (select public.current_company_id()) and (select public.current_app_role()) = 'ADMIN');

revoke all on table public.vehicle_types from public, anon;
grant select, insert, update, delete on table public.vehicle_types to authenticated;
