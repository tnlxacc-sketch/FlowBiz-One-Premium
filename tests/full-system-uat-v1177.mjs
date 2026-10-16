import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const exists=(p)=>fs.existsSync(new URL(p,import.meta.url));

const index=read('../index.html');
const app=read('../app.js');
const support=read('../support-selfservice-enhancements.js');
const uat=read('../docs/UAT_CHECKLIST.md');

// Release identity / cache control
assert(index.includes('flowbiz-premium.js?v=20261016-3'),'Production must load app.js v1.17.7');
assert(index.includes('support-selfservice-enhancements.js?v=1.17.7'),'Production must load self-service v1.17.7');

// Security / account control
assert(!app.includes('db.auth.signUp('),'Self-service signup must remain disabled');
assert(index.includes('บัญชีผู้ใช้งานสร้างโดยผู้ดูแลระบบของบริษัท'),'Login page must tell users that Admin provisions accounts');

// Core operational modules
for(const token of [
  'Stock Adjustment','Repack / Conversion','Delivery Performance','Customer 360','Sales & Profit',
  'Minimum Stock','Stock Movement','Opening Stock','นำเข้าประวัติ Demo'
]) assert(app.includes(token),`Missing core module/text: ${token}`);

// Stock controls and guards
for(const token of [
  'AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST','available=onHand-allocated',
  'Math.abs(x.adjustment_qty)>available','MANUAL_ADJUSTMENT','MANUAL_ADJUSTMENT_REVERSAL',
  'CONVERSION_OUT','CONVERSION_IN','admin_set_minimum_stock_policy','BY_WAREHOUSE'
]) assert(app.includes(token),`Missing stock control: ${token}`);

// Critical production migrations must remain present
const migrationPaths=[
  '../supabase/migrations/20260925071014_stock_conversion_repack.sql',
  '../supabase/migrations/20260925071247_conversion_demo_reset_support.sql',
  '../supabase/migrations/20260925071311_conversion_year_end_support.sql',
  '../supabase/migrations/20260925071415_conversion_business_date_movement.sql',
  '../supabase/migrations/20260925071510_conversion_master_reference_protection.sql',
  '../supabase/migrations/20260925073342_manual_transfer_repack_numbers_and_equal_qty.sql',
  '../supabase/migrations/20260925075332_stock_count_policy_and_manual_adjustment.sql',
  '../supabase/migrations/20260925080235_stock_adjustment_lifecycle_support.sql',
  '../supabase/migrations/20260925080513_stock_adjustment_respects_allocations.sql',
  '../supabase/migrations/20260925084520_stock_adjustment_conversion_fk_indexes.sql',
  '../supabase/migrations/20260925084750_fix_private_helper_search_paths.sql',
  '../supabase/migrations/20260925183000_minimum_stock_total_or_by_warehouse.sql',
  '../supabase/migrations/20260925184500_minimum_stock_fk_indexes.sql'
];
for(const p of migrationPaths) assert(exists(p),`Missing migration: ${p}`);

// Premium backup/year-end tooling presence only; Standard-specific restore rehearsal is excluded.
for(const p of [
  '../scripts/backup-project.mjs','../scripts/build-premium.mjs','../scripts/rollover-year.mjs',
  '../docs/BACKUP_RESTORE_RUNBOOK.md','../docs/YEAR_END.md','../docs/COMMERCIAL_RUNBOOK.md'
]) assert(exists(p),`Missing recovery artifact: ${p}`);

// Self-service support: every commercial role must have onboarding
for(const role of ['SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN']){
  assert(support.includes(`${role}:{`),`First-login checklist missing for ${role}`);
}
for(const page of ['dashboard','orders','warehouse','stock','counts','stockadjust','transfers','repack','delivery','profit','customer360','deliveryperformance','masters','users','settings','datamanagement','audit']){
  assert(support.includes(`${page}:{checks:`),`Context help missing for ${page}`);
}

// Actionable error guidance must cover high-frequency blockers
for(const token of ['Stock ไม่เพียงพอ','PERIOD_CLOSED','INVALID_PRODUCT','INVALID_CUSTOMER','DUPLICATE','POD']){
  assert(support.includes(token),`Actionable error guidance missing: ${token}`);
}
assert(support.includes('ถ่ายภาพหน้าจอ + ระบุเลข Order/Invoice/Trip/GR'),'Support handoff checklist missing');

// UAT checklist must cover end-to-end and commercial controls
for(const heading of ['Tenant isolation','Access and roles','End-to-end transaction','Documents and reports','Usability and recovery','Minimum Stock UAT','Stock Conversion / Repack UAT','Stock Count Policy / Manual Adjustment / Release Gate UAT']){
  assert(uat.includes(heading),`UAT checklist section missing: ${heading}`);
}

console.log(JSON.stringify({
  release:'v1.17.7',
  result:'PASS',
  gates:[
    'release-identity','security-account-control','core-modules','stock-guards',
    'migrations','backup-tooling-presence','role-onboarding','context-help','actionable-errors','uat-coverage'
  ],
  commercialRoles:6,
  criticalMigrations:migrationPaths.length
},null,2));
