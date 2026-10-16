create table if not exists private.backup_registry (
  id bigserial primary key,
  company_id uuid not null references public.companies(id),
  backup_kind text not null check (backup_kind in ('MANUAL','MONTHLY','PRE_GO_LIVE','YEAR_END')),
  period_label text,
  archive_sha256 text not null unique check (archive_sha256 ~ '^[a-f0-9]{64}$'),
  archive_path text not null,
  source_project_ref text,
  audit_max_id bigint not null default 0,
  pod_objects integer not null default 0,
  manifest jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now(),
  restore_verified_at timestamptz,
  restore_target_fingerprint text,
  restore_verification jsonb,
  note text
);

revoke all on private.backup_registry from public, anon, authenticated;

create index if not exists idx_backup_registry_company_date
  on private.backup_registry(company_id, backed_up_at desc);

create or replace function public.admin_backup_restore_status()
returns jsonb
language plpgsql
security definer
set search_path=public,private
as $$
declare
  ctx record;
  latest private.backup_registry%rowtype;
  year_backup private.year_end_backups%rowtype;
begin
  select * into ctx from private.require_role(array['ADMIN','OWNER']);

  select * into latest
  from private.backup_registry
  where company_id=ctx.company_id
  order by backed_up_at desc
  limit 1;

  select * into year_backup
  from private.year_end_backups
  where company_id=ctx.company_id
  order by backed_up_at desc
  limit 1;

  return jsonb_build_object(
    'has_backup', latest.id is not null,
    'backup', case when latest.id is null then null else jsonb_build_object(
      'kind',latest.backup_kind,
      'period_label',latest.period_label,
      'archive_sha256',latest.archive_sha256,
      'backed_up_at',latest.backed_up_at,
      'pod_objects',latest.pod_objects,
      'source_project_ref',latest.source_project_ref
    ) end,
    'restore_verified', latest.id is not null and latest.restore_verified_at is not null,
    'restore_verified_at', latest.restore_verified_at,
    'restore_target_fingerprint', latest.restore_target_fingerprint,
    'restore_verification', latest.restore_verification,
    'dr_ready', latest.id is not null
      and latest.restore_verified_at is not null
      and coalesce((latest.restore_verification->>'passed')::boolean,false),
    'year_end_backup', case when year_backup.company_id is null then null else jsonb_build_object(
      'closed_year',year_backup.closed_year,
      'archive_sha256',year_backup.archive_sha256,
      'backed_up_at',year_backup.backed_up_at,
      'consumed_at',year_backup.consumed_at
    ) end
  );
end $$;

revoke all on function public.admin_backup_restore_status() from public,anon;
grant execute on function public.admin_backup_restore_status() to authenticated;
