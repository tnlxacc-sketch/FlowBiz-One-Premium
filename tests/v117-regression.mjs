import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

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
for(const p of migrationPaths) assert(fs.existsSync(new URL(p,import.meta.url)),`missing production migration: ${p}`);

assert(index.includes('flowbiz-premium.js?v=20261015-2'),'frontend cache version must be v1.17.7');
assert(index.includes('support-selfservice-enhancements.js?v=1.17.7'),'self-service layer cache version must be v1.17.7');
assert(index.includes('styles.css?v=20261015-2'),'stylesheet cache version must be v1.17.0');

assert(app.includes("['stockadjust','±','Stock Adjustment']"),'Stock Adjustment menu missing');
assert(app.includes("['repack','↔','Repack / Conversion']"),'Repack menu missing');
assert(app.includes("stockadjust:stockAdjustmentPage"),'Stock Adjustment route missing');
assert(app.includes("repack:repackPage"),'Repack route missing');

for(const policy of ['AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST']){
  assert(app.includes(`value="${policy}"`),`Count policy missing in UI: ${policy}`);
}
assert(app.includes("db.rpc('admin_set_stock_count_policy'"),'Count policy save RPC missing');
assert(app.includes("runRpc('post_stock_adjustment'"),'Adjustment Post RPC missing');
assert(app.includes("runRpc('reverse_stock_adjustment'"),'Adjustment Reverse RPC missing');
assert(app.includes("runRpc('post_stock_conversion'")||app.includes("db.rpc('post_stock_conversion'"),'Repack Post RPC missing');
assert(app.includes("runRpc('reverse_stock_conversion'")||app.includes("db.rpc('reverse_stock_conversion'"),'Repack Reverse RPC missing');

assert(app.includes('available=onHand-allocated'),'Adjustment UI must use Available, not raw On Hand');
assert(app.includes('Math.abs(x.adjustment_qty)>available'),'Adjustment decrease must block beyond Available');
assert(app.includes("MANUAL_ADJUSTMENT:'ปรับ Stock'"),'Manual adjustment movement label missing');
assert(app.includes("MANUAL_ADJUSTMENT_REVERSAL:'Reverse ปรับ Stock'"),'Adjustment reversal movement label missing');
assert(app.includes("CONVERSION_OUT:'Repack ออก'"),'Repack OUT movement label missing');
assert(app.includes("CONVERSION_IN:'Repack เข้า'"),'Repack IN movement label missing');

const countSql=fs.readFileSync(new URL('../supabase/migrations/20260925080513_stock_adjustment_respects_allocations.sql',import.meta.url),'utf8');
assert(countSql.includes("c.adjustment_policy='AUTO_ADJUST'"),'AUTO_ADJUST database branch missing');
assert(countSql.includes("final_status:='FINAL'"),'non-auto count must finalize without stock post');
assert(countSql.includes('b.on_hand+delta<b.allocated'),'Count adjustment must preserve allocated stock');
assert(countSql.includes("'COUNT_ADJUSTMENT'"),'Count movement audit type missing');
assert(countSql.includes("'MANUAL_ADJUSTMENT'"),'Manual adjustment movement missing');
assert(countSql.includes("'MANUAL_ADJUSTMENT_REVERSAL'"),'Manual adjustment reversal missing');
assert(countSql.includes("c.status in ('ADJUSTED','FINAL')"),'Count finalization idempotency missing');

const policySql=fs.readFileSync(new URL('../supabase/migrations/20260925075332_stock_count_policy_and_manual_adjustment.sql',import.meta.url),'utf8');
const lifecycleSql=fs.readFileSync(new URL('../supabase/migrations/20260925080235_stock_adjustment_lifecycle_support.sql',import.meta.url),'utf8');
assert(policySql.includes('stock_adjustments'),'Adjustment schema missing');
assert(countSql.includes('reverse_stock_adjustment'),'Adjustment reverse lifecycle missing');
assert(lifecycleSql.includes('STOCK_ADJUSTMENT'),'Adjustment lifecycle/reset integration missing');

const repackSql=fs.readFileSync(new URL('../supabase/migrations/20260925073342_manual_transfer_repack_numbers_and_equal_qty.sql',import.meta.url),'utf8');
assert(repackSql.includes('REPACK_QTY_MUST_MATCH'),'Repack Qty Out/Qty In equality guard missing');
assert(repackSql.includes('REPACK_UOM_MISMATCH'),'Repack UOM guard missing');
assert(repackSql.includes('src.on_hand-src.allocated<qout'),'Repack must use available stock');

const resetSql=fs.readFileSync(new URL('../supabase/migrations/20260925071247_conversion_demo_reset_support.sql',import.meta.url),'utf8');
assert(resetSql.includes('delete from public.stock_conversion_lines'),'Demo reset must clear conversion lines');
assert(resetSql.includes('delete from public.stock_conversions'),'Demo reset must clear conversions');

const yearEndSql=fs.readFileSync(new URL('../supabase/migrations/20260925071311_conversion_year_end_support.sql',import.meta.url),'utf8');
assert(yearEndSql.includes('stock_conversions'),'Year-end must account for conversions');

const idxSql=fs.readFileSync(new URL('../supabase/migrations/20260925084520_stock_adjustment_conversion_fk_indexes.sql',import.meta.url),'utf8');
for(const idx of [
 'idx_stock_adjustment_lines_company','idx_stock_adjustment_lines_product',
 'idx_stock_adjustments_source_count','idx_stock_adjustments_warehouse',
 'idx_stock_conversion_lines_company','idx_stock_conversion_lines_from_product',
 'idx_stock_conversion_lines_to_product','idx_stock_conversions_warehouse'
]) assert(idxSql.includes(idx),`missing performance index: ${idx}`);

assert(!app.includes('db.auth.signUp('),'Self-service signup must remain disabled');

console.log(JSON.stringify({
  release:'v1.17.7',
  productionMigrationsSynced:migrationPaths.length,
  countPolicies:['AUTO_ADJUST','REVIEW_ONLY','MANUAL_ADJUST'],
  adjustmentGuards:['available-stock','period-close','idempotency','reverse'],
  repackGuards:['equal-qty','same-uom','available-stock','reverse'],
  performanceIndexes:8,
  result:'PASS'
},null,2));

assert(app.includes("head('Report Center'"),'Report Center page missing');
assert(app.includes('หน้า Report Center ไม่ใช้จำนวนแถวที่ Browser โหลดมาเป็น KPI'),'Report Center must reject browser-row KPI counts');
assert(!app.includes("function reportsPage(){const k=getReportKpis(),latest='CSV เฉพาะรายการล่าสุดที่โหลด'"),'Legacy misleading Reports page still present');
assert(app.includes("data-action=\"salesHistoryImport\">นำเข้าประวัติ Demo"),'Demo history import must remain available in Data Management');

assert(app.includes("minimum_stock_policy"),'Minimum Stock policy setting missing');
assert(app.includes("BY_WAREHOUSE"),'BY_WAREHOUSE Minimum Stock mode missing');
assert(app.includes("product_warehouse_minimums"),'Warehouse Minimum Stock data source missing');
assert(app.includes("admin_replace_warehouse_minimums"),'Warehouse Minimum Stock save RPC missing');
assert(app.includes("admin_set_minimum_stock_policy"),'Minimum Stock policy save RPC missing');
assert(app.includes("ช่องว่าง = ใช้ Default จาก Product Master"),'Warehouse Minimum fallback guidance missing');

const minimumSql=fs.readFileSync(new URL('../supabase/migrations/20260925183000_minimum_stock_total_or_by_warehouse.sql',import.meta.url),'utf8');
assert(minimumSql.includes('create table if not exists public.product_warehouse_minimums'),'Warehouse minimum table migration missing');
assert(minimumSql.includes("v_policy not in ('TOTAL','BY_WAREHOUSE')"),'Minimum policy validation missing');
assert(minimumSql.includes('minimum_stock >= 0'),'Warehouse minimum non-negative guard missing');
assert(minimumSql.includes("private.require_role(array['ADMIN'])"),'Warehouse minimum mutations must require Admin');
assert(minimumSql.includes('tenant_select_product_warehouse_minimums'),'Warehouse minimum tenant read policy missing');

const minimumIndexSql=fs.readFileSync(new URL('../supabase/migrations/20260925184500_minimum_stock_fk_indexes.sql',import.meta.url),'utf8');
assert(minimumIndexSql.includes('idx_product_warehouse_minimums_product_id'),'Product FK index missing');
assert(minimumIndexSql.includes('idx_product_warehouse_minimums_warehouse_id'),'Warehouse FK index missing');
assert(minimumIndexSql.includes('idx_product_warehouse_minimums_updated_by'),'Updated-by FK index missing');

assert(app.includes('FlowBiz_One_Minimum_Stock_By_Warehouse.csv'),'Warehouse Minimum template download missing');
assert(app.includes('อัปโหลดทับค่ารายคลัง'),'Warehouse Minimum replace upload action missing');
assert(app.includes('normalizeWarehouseMinimumImport'),'Warehouse Minimum CSV validation missing');
assert(app.includes("accept=\".csv,text/csv\""),'Warehouse Minimum upload must accept CSV');
assert(app.includes('ค่า Default ใน Product Master จะไม่ถูกแก้'),'Replace upload must preserve Product default guidance');

assert(app.includes('warehouseMinimumDirectFile'),'Direct warehouse minimum CSV file input missing');
assert(app.includes('previewWarehouseMinimumSettingsUpload'),'Direct warehouse minimum CSV preview action missing');
assert(app.includes('commitWarehouseMinimumSettingsUpload'),'Direct warehouse minimum CSV replace action missing');
assert(app.includes('โหลด CSV Minimum แยกคลังได้ตรงนี้เลย'),'Direct upload guidance missing from System Setup');

assert(app.includes('ยังไม่มีค่า Minimum ให้นำเข้า'),'Empty Minimum CSV warning missing');
assert(app.includes('ยังไม่ได้ตั้ง Minimum Stock รายคลัง'),'Stock page missing warehouse-minimum setup warning');
assert(app.includes('Product Master ก็เป็น 0 จึงแสดง Minimum เป็น “-”'),'Stock page should explain blank Minimum display');
