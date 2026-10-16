-- Cover composite foreign keys used to validate controlled Vehicle Type values.
create index if not exists vehicles_company_vehicle_type_idx
  on public.vehicles(company_id, vehicle_type);

create index if not exists expense_rates_company_vehicle_type_idx
  on public.expense_rates(company_id, vehicle_type);
