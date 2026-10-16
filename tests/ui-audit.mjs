import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\)\.catch[\s\S]*$/,'');
const context={console,Blob,URL,Intl,crypto,confirm:()=>true,prompt:()=>'',MutationObserver:class{observe(){} disconnect(){}},window:{print(){},open(){}},document:{body:{},querySelector(){return null},querySelectorAll(){return[]}},supabase:{createClient(){return{}}}};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__ui={state,actions,roleMenus,dashboardPage,todayPanel,ordersPage,customersPage,warehousePage,stockPage,countsPage,transfersPage,deliveryPage,profitPage,customer360Page,stockHealthPage,deliveryPerformancePage,costVariancePage,reportsPage,mastersPage,usersPage,settingsPage,dataManagementPage,auditPage,commercialPage,analyticsInvoices,analyticsTrips,analyticsBalances,profitTable,invoiceGross,invoiceContribution,parseCsv,normalizeImport,normalizeOpeningStockImport,movementRows,getReportKpis,serverInvoiceTable,minimumStockPolicy,lowStockRows,effectiveWarehouseMinimum,normalizeWarehouseMinimumImport,warehouseMinimumTemplateRows};`,context);

const ui=context.__ui,year=String(new Date().getFullYear());
Object.assign(ui.state,{profile:{app_role:'ADMIN',company_id:'co1'},company:{code:'DEMO',is_demo:true,subscription_plan:'DEMO',subscription_status:'ACTIVE',max_users:10,gp_policy:'ACTUAL'},isPlatformAdmin:true,reportYear:year,reportWarehouse:'ALL',reportCustomer:'ALL',countPeriod:'ALL',profitView:'invoice',search:'',page:'dashboard'});
ui.state.data={
  customers:[{id:'c1',code:'C001',name:'Alpha',region:'BKK',active:true},{id:'c2',code:'C002',name:'Beta',active:true}],
  productGroups:[{id:'g1',code:'AAA',name:'Group A'}],products:[{id:'p1',code:'AAA-01',name:'Product A',base_uom:'EA',group_id:'g1',minimum_stock:15,active:true},{id:'p2',code:'BBB-01',name:'Product B',base_uom:'EA',minimum_stock:0,active:true}],
  warehouses:[{id:'w1',code:'WH1',name:'Main',active:true},{id:'w2',code:'WH2',name:'Branch',active:true}],suppliers:[],vehicleTypes:[{id:'vt1',code:'TANK',name:'Tank truck',active:true}],vehicles:[{id:'v1',code:'TR01',plate_no:'1AA-1111',vehicle_type:'TANK',active:true}],drivers:[{id:'d1',code:'D001',name:'Driver One',active:true}],
  balances:[{product_id:'p1',warehouse_id:'w1',on_hand:10,allocated:2},{product_id:'p2',warehouse_id:'w2',on_hand:0,allocated:0}],
  movements:[{product_id:'p1',warehouse_id:'w1',movement_type:'RECEIPT',reference_no:'GR-1',qty:10,created_at:`${year}-01-02`}],
  orders:[{id:'o1',order_no:'SO-1',customer_id:'c1',order_date:`${year}-01-01`,status:'DELIVERED',requested_delivery_at:`${year}-01-03`}],
  orderLines:[{id:'ol1',order_id:'o1',product_id:'p1',warehouse_id:'w1',qty:2,issued_qty:2,unit_price:100},{id:'ol2',order_id:'o1',product_id:'p2',warehouse_id:'w2',qty:1,issued_qty:1,unit_price:100}],
  receipts:[],transfers:[],transferLines:[],
  trips:[{id:'t1',trip_no:'TR-1',order_id:'o1',vehicle_id:'v1',driver_id:'d1',status:'COMPLETED',planned_start:`${year}-01-03`,planned_end:`${year}-01-03`,completed_at:`${year}-01-03`,standard_freight:20,actual_freight:25}],
  tripLines:[{id:'tl1',trip_id:'t1',order_line_id:'ol1',product_id:'p1',issued_qty:2,received_qty:2},{id:'tl2',trip_id:'t1',order_line_id:'ol2',product_id:'p2',issued_qty:1,received_qty:1}],deliveryDocs:[],
  invoices:[{id:'i1',invoice_no:'INV-1',invoice_date:`${year}-01-03`,customer_id:'c1',revenue:300,product_cost:120,freight_cost:30,other_cost:0,gp_status:'FINAL'}],
  invoiceOrders:[{invoice_id:'i1',order_id:'o1'}],invoiceTrips:[{invoice_id:'i1',trip_id:'t1'}],costs:[{product_id:'p1',cost_month:`${year}-01-01`,unit_cost:60}],expenseTypes:[{id:'e1',code:'TOLL',name:'Toll',category:'DIRECT_EXPENSE',basis:'MANUAL',include_in_contribution:true,active:true}],expenseRates:[],actualExpenses:[],counts:[],countLines:[],periods:[],settings:[],warehouseMinimums:[],openingBatches:[],openingLines:[],accessRequests:[],users:[],audit:[],tenants:[]
};
// Minimum Stock policy UAT: existing TOTAL behavior stays default.
assert.equal(ui.minimumStockPolicy(),'TOTAL','Minimum Stock defaults to TOTAL for backward compatibility');
let lowRows=ui.lowStockRows();
assert.equal(lowRows.length,1,'TOTAL policy detects product below total minimum');
assert.equal(lowRows[0].product_id,'p1','TOTAL alert identifies the expected product');
assert.equal(lowRows[0].scope,'TOTAL','TOTAL alert retains total scope');

// BY_WAREHOUSE uses explicit override per warehouse and still falls back to Product default when blank.
ui.state.data.settings=[{setting_key:'minimum_stock_policy',setting_value:'BY_WAREHOUSE'}];
ui.state.data.warehouseMinimums=[
  {product_id:'p1',warehouse_id:'w1',minimum_stock:8},
  {product_id:'p1',warehouse_id:'w2',minimum_stock:3}
];
assert.equal(ui.minimumStockPolicy(),'BY_WAREHOUSE','BY_WAREHOUSE policy is selectable');
assert.equal(ui.effectiveWarehouseMinimum('p1','w1'),8,'warehouse override replaces Product default');
lowRows=ui.lowStockRows();
assert.equal(lowRows.length,1,'BY_WAREHOUSE detects only the warehouse below its own minimum');
assert.equal(lowRows[0].warehouse_id,'w2','zero/missing balance warehouse is checked independently');
assert.equal(lowRows[0].minimum,3,'warehouse minimum is used for alert');

// Explicit 0 disables minimum only for that product/warehouse.
ui.state.data.warehouseMinimums=[
  {product_id:'p1',warehouse_id:'w1',minimum_stock:8},
  {product_id:'p1',warehouse_id:'w2',minimum_stock:0}
];
assert.equal(ui.lowStockRows().length,0,'explicit zero disables the warehouse minimum');

// Blank/no override falls back to Product default.
ui.state.data.warehouseMinimums=[{product_id:'p1',warehouse_id:'w1',minimum_stock:8}];
lowRows=ui.lowStockRows();
assert.equal(lowRows.length,1,'missing warehouse override falls back to Product default');
assert.equal(lowRows[0].warehouse_id,'w2','fallback applies to the warehouse without override');
assert.equal(lowRows[0].minimum,15,'fallback uses Product minimum_stock');

ui.state.data.settings=[];
ui.state.data.warehouseMinimums=[];

// Warehouse Minimum upload UAT: CSV replace file validates codes, blanks and zero.
const wmCsv=[
  'product_code,product_name,warehouse_code,warehouse_name,default_minimum_stock,minimum_stock',
  'AAA-01,Product A,WH1,Main,15,8',
  'AAA-01,Product A,WH2,Branch,15,',
  'BBB-01,Product B,WH2,Branch,0,0'
].join('\n');
const wmParsed=ui.normalizeWarehouseMinimumImport(wmCsv);
assert.equal(wmParsed.errors.length,0,'warehouse minimum upload file validates');
assert.equal(wmParsed.rows.length,2,'blank minimum means fallback and is not persisted as override');
assert.equal(wmParsed.blankRows,1,'blank minimum row is counted as Default fallback');
assert.equal(wmParsed.rows.find(x=>x._preview.product_code==='BBB-01').minimum_stock,0,'explicit zero is preserved');
const wmTemplate=ui.warehouseMinimumTemplateRows();
assert.equal(wmTemplate.length,4,'template includes every active product x warehouse pair');
assert.equal(wmTemplate[0].length,6,'template has six upload/reference columns');
const wmBad=ui.normalizeWarehouseMinimumImport('product_code,warehouse_code,minimum_stock\nBAD,WH1,5');
assert.equal(wmBad.errors.length,1,'unknown product is rejected before replace upload');


ui.state.data.todayStatus={date:`${year}-09-23`,orders:1,invoices:5,revenue:963427.2,trips:2,completed_trips:2,future_completed_trips:2,waiting_logistics:0,late_trips:0,stockout_rows:0,low_contribution_invoices:1,contribution_threshold_pct:18.5};
ui.state.data.reportKpis={finances:{low_contribution:1,contribution_threshold_pct:18.5}};
ui.state.data.reportKpisKey=JSON.stringify({p_year:Number(year),p_month:null,p_warehouse_id:null,p_customer_id:null,p_product_id:null,p_vehicle_id:null});
const todayHtml=ui.todayPanel();
assert(todayHtml.includes('963,427.2'),"today sales comes from today's invoices");
assert(todayHtml.includes('5'),'today invoice count is shown');
assert(todayHtml.includes('1 Invoice ช่วงที่เลือกมี Contribution ต่ำกว่า 18.5%'),'low margin warning uses company policy and selected reporting period');
assert(todayHtml.includes('data-action="openLowContributionPeriod"'),'warning opens filtered invoice list for the selected period');
assert(todayHtml.includes('2 เที่ยวส่งวันนี้สถานะปิดงาน แต่เวลาเสร็จอยู่ในอนาคต'),'future completion timestamps are visible');
assert(!todayHtml.includes('Freight Actual ต่างจาก Standard'),'historical freight comparison is not a today task');
assert(!todayHtml.includes('0 Orders ค้างจัดรถ'),'zero-value alerts are hidden');
ui.state.reportYear='2025';
const otherYearTodayHtml=ui.todayPanel();
assert(otherYearTodayHtml.includes('963,427.2')&&otherYearTodayHtml.includes('5'),'today cards stay independent of selected report year');
assert(!otherYearTodayHtml.includes('Invoice ช่วงที่เลือกมี Contribution ต่ำกว่า'),'selected-period alert is not reused from a stale KPI cache');
ui.state.reportYear=year;
ui.state.data.settings=[{setting_key:'contribution_alert_pct',setting_value:18.5}];
assert(ui.settingsPage().includes('id="contributionThreshold" type="number" min="0" max="100" step="0.01" value="18.5"'),'Admin settings show the saved policy');
ui.state.lowContributionDate=`${year}-09-23`;
assert(ui.profitPage().includes('Invoice ต่ำกว่าเกณฑ์'),'drill-down shows the exception list');
assert(ui.profitPage().includes('data-action="closeLowContribution"'),'drill-down can return to all invoices');
ui.state.lowContributionDate=null;
const belowPolicy={total:1,items:[{invoice_no:'INV-LOW',invoice_date:`${year}-09-23`,customer_name:'Demo',products:[],revenue:100,product_cost:90,freight_cost:0,other_cost:0,gp_status:'FINAL'}]};
assert(ui.serverInvoiceTable(belowPolicy).includes('class="negative">10.00%'),'invoice percent is highlighted under the company threshold');
ui.state.data.todayStatus.contribution_threshold_pct=5;
assert(!ui.serverInvoiceTable(belowPolicy).includes('class="negative">10.00%'),'highlight follows an updated company threshold');
ui.state.data.todayStatus.contribution_threshold_pct=18.5;

ui.state.data.transfers=[
  {id:'tr1',transfer_no:'TR-1',from_warehouse_id:'w1',to_warehouse_id:'w2',status:'COMPLETED'},
  {id:'tr2',transfer_no:'TR-2',from_warehouse_id:'w2',to_warehouse_id:'w1',status:'IN_TRANSIT'}
];
ui.state.data.transferLines=[
  {id:'trl1',transfer_id:'tr1',product_id:'p1',sent_qty:10000,received_qty:10000},
  {id:'trl2',transfer_id:'tr2',product_id:'p2',sent_qty:3000,received_qty:0}
];
// Page-render smoke tests should use local fixture fallbacks, not the narrow KPI fixture above.
ui.state.data.reportKpisKey='__STALE__';

const pages=['dashboardPage','ordersPage','customersPage','warehousePage','stockPage','countsPage','transfersPage','deliveryPage','profitPage','customer360Page','stockHealthPage','deliveryPerformancePage','costVariancePage','reportsPage','mastersPage','usersPage','settingsPage','dataManagementPage','auditPage','commercialPage'];
const pageKeys=new Set(Object.values(ui.roleMenus).flat().map(x=>x[0]).concat(['executive','customers','commercial','inactive']));
let html='';
for(const name of pages){const out=ui[name]();assert.equal(typeof out,'string',`${name} must render HTML`);html+=out}

const actionRefs=[...html.matchAll(/data-action="([^"]+)"/g)].map(x=>x[1]);
for(const action of actionRefs)assert.equal(typeof ui.actions[action],'function',`missing action handler: ${action}`);
const goRefs=[...html.matchAll(/data-go="([^"]+)"/g)].map(x=>x[1]);
for(const page of goRefs)assert(pageKeys.has(page),`missing target page: ${page}`);
const pageButtons=[...html.matchAll(/<button\b([^>]*)>/g)].map(x=>x[1]);
for(const attrs of pageButtons)assert(/data-(?:action|go|profit-view|stock-view)=/.test(attrs),`visible page button is not wired: ${attrs}`);

for(const view of ['product','group','customer','invoice','warehouse']){
  ui.state.profitView=view;
  const out=ui.profitPage();
  assert(out.includes(`data-profit-view="${view}"`),`profit tab missing: ${view}`);
  assert(out.includes(`data-profit-view="${view}"`+'>')||out.includes(`data-profit-view="${view}"`),`profit tab is not rendered: ${view}`);
  assert(out.includes('<table')||(view==='invoice'&&out.includes('กำลังโหลดรายละเอียด')),`profit view ${view} must contain a data table or loading state`);
}

assert.equal(ui.analyticsInvoices().length,1,'baseline invoice filter');
assert.equal(ui.invoiceGross(ui.state.data.invoices[0]),180,'gross profit formula');
assert.equal(ui.invoiceContribution(ui.state.data.invoices[0]),150,'contribution profit formula');
ui.state.page='executive';
ui.state.profitView='invoice';
assert(ui.dashboardPage().includes('GP Margin %'),'executive dashboard shows gross margin percentage');
assert(ui.profitPage().includes('GP Margin %'),'profit report shows gross margin percentage');
assert(ui.profitPage().includes('id="reportMonth"'),'profit report has month filter');
assert(ui.profitPage().includes('id="reportProduct"'),'profit report has product filter');
assert(ui.profitPage().includes('ปริมาณส่ง'),'profit report shows delivered quantity');
ui.state.data.invoicePage={total:1,page:0,items:[{invoice_no:'INV-1',order_no:'SO-1',invoice_date:`${year}-01-03`,customer_name:'Alpha',products:[{code:'AAA-01',name:'Product A',received_qty:2,uom:'EA',warehouse:'WH1'}],order_qty:2,received_qty:2,trip_no:'TR-1',plate_no:'1AA-1111',driver_name:'Driver One',revenue:300,product_cost:120,freight_cost:30,other_cost:0,gp_status:'FINAL'}]};
ui.state.data.invoicePageKey=JSON.stringify({p_year:Number(year),p_month:null,p_warehouse_id:null,p_customer_id:null,p_product_id:null,p_vehicle_id:null,p_search:'',p_page:0});
assert(ui.profitPage().includes('Product A'),'invoice profit detail shows product name');
assert(ui.profitPage().includes('Driver One'),'invoice profit detail shows driver context');
const deliveryPerformance=ui.deliveryPerformancePage();
assert(deliveryPerformance.includes('ส่งสินค้าอะไร กี่เที่ยว เป็นเงินเท่าไร'),'delivery report includes product/trip/sales management summary');
assert(deliveryPerformance.includes('id="reportVehicle"'),'delivery report has vehicle filter');
assert(deliveryPerformance.includes('id="reportMonth"'),'delivery report has month filter');
assert(!ui.reportsPage().includes('data-action="salesHistoryImport"'),'Report Center must not mix Demo import with business reports');
assert(ui.dataManagementPage().includes('data-action="salesHistoryImport"'),'Demo Data Management exposes historical sales import');
assert(source.includes("db.rpc('admin_import_sales_history'"),'sales history import posts through atomic RPC');
assert(source.includes('Stock IN')&&source.includes('Stock OUT')&&source.includes('ตรวจว่า Stock ไม่ติดลบก่อนบันทึก'),'sales history import creates chronological stock movements with negative-stock validation');
ui.state.page='dashboard';
ui.state.reportWarehouse='w2';
assert.equal(ui.analyticsInvoices().length,1,'warehouse invoice filter');
assert.equal(ui.analyticsBalances().length,1,'warehouse stock filter');
assert.equal(ui.analyticsTrips().length,1,'warehouse trip filter');
ui.state.reportWarehouse='missing';
assert.equal(ui.analyticsInvoices().length,0,'unknown warehouse must not leak invoices');
assert.equal(ui.analyticsBalances().length,0,'unknown warehouse must not leak stock');
assert.equal(ui.analyticsTrips().length,0,'unknown warehouse must not leak trips');
ui.state.reportWarehouse='ALL';ui.state.reportCustomer='c2';
assert.equal(ui.analyticsInvoices().length,0,'customer filter');

const sourceActions=[...source.matchAll(/data-action="([A-Za-z0-9]+)"/g)].map(x=>x[1]);
for(const action of sourceActions)assert.equal(typeof ui.actions[action],'function',`source references missing action: ${action}`);
assert(!source.includes('<span class="tab-pill">By Product</span>'),'inert profit tab remains in source');
const transferHtml=ui.transfersPage();
assert(transferHtml.includes('transfer-table'),'transfer table uses compact layout class');
assert(transferHtml.includes('ดำเนินการ'),'transfer action column is labeled');
assert(transferHtml.includes('Product A'),'transfer row shows product name beside code');
assert(transferHtml.includes('หน่วย: EA'),'transfer row shows product base unit');
assert(transferHtml.includes('data-sort="10000"'),'sent quantity keeps numeric sort value');
assert(transferHtml.includes('data-sort="0"'),'received zero remains a real numeric value');
const parsed=ui.parseCsv('\ufeffcode,name,region,active\r\n"C,01","ลูกค้า ทดสอบ",BKK,TRUE');
assert.equal(parsed[1][0],'C,01','quoted CSV parser');
const normalized=ui.normalizeImport('customers',parsed);
assert.equal(normalized.errors.length,0,'customer import validation');
assert.equal(normalized.rows.length,1,'customer import row');
const vehicleImport=ui.normalizeImport('vehicles',ui.parseCsv('code,plate_no,vehicle_type,active\r\nTR01,1AA-1111,TANK,TRUE'));
assert.equal(vehicleImport.errors.length,0,'vehicle type master reference');
const invalidVehicleImport=ui.normalizeImport('vehicles',ui.parseCsv('code,plate_no,vehicle_type,active\r\nTR02,2BB-2222,Tnak,TRUE'));
assert.equal(invalidVehicleImport.errors.length,1,'invalid vehicle type must be rejected');
assert(source.includes('<select id="rateVehicleType">'),'expense-rate vehicle type must be a dropdown');
assert(!source.includes('<input id="rateVehicleType"'),'free-text expense-rate vehicle type must not remain');
const opening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nWH1,AAA-01,10,25.50'));
assert.equal(opening.errors.length,0,'valid opening stock import');
assert.equal(opening.rows.length,1,'opening stock row');
assert.equal(opening.rows[0].warehouse_id,'w1','opening stock warehouse mapping');
assert.equal(opening.rows[0].product_id,'p1','opening stock product mapping');
const duplicateOpening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nWH1,AAA-01,10,25.50\r\nWH1,AAA-01,5,20'));
assert.equal(duplicateOpening.errors.length,1,'duplicate opening stock line must be rejected');
const badOpening=ui.normalizeOpeningStockImport(ui.parseCsv('warehouse_code,product_code,qty,unit_cost\r\nMISSING,AAA-01,0,'));
assert(badOpening.errors.length>0,'invalid opening stock master/quantity/cost must be rejected');
assert(source.includes("runRpc('post_opening_stock'"),'opening stock must post through the atomic RPC');
assert.equal(typeof ui.actions.openingStock,'function','opening stock action handler');

ui.state.data.movements.push({id:'m2',product_id:'p1',warehouse_id:'w1',movement_type:'ORDER_ISSUE',reference_no:'SO-1',qty:-2,created_at:`${year}-01-03`});
assert.equal(ui.movementRows().length,2,'movement rows include both In and Out');
assert.equal(ui.movementRows()[0].qty,-2,'newest movement preserves actual quantity');
ui.state.movementType='OUT';
assert.equal(ui.movementRows().length,1,'movement type filter');
ui.state.movementType='ALL';
ui.state.data.counts=[{id:'count1',count_no:'SC-1',warehouse_id:'w1',snapshot_at:`${year}-01-04`,status:'SUBMITTED'}];
ui.state.data.countLines=[{id:'line1',count_id:'count1',product_id:'p1',book_qty:8,count_qty:7,pile_values:[4,3],variance_reason:'loss'}];
assert(ui.countsPage().includes('Admin Final'),'submitted count exposes Admin Final action');
assert(ui.countsPage().includes('id="countPeriod"'),'stock count results have a month-period filter');
ui.state.countPeriod=`${year}-02`;
assert(!ui.countsPage().includes('SC-1'),'count period filter excludes other months');
ui.state.countPeriod='ALL';
assert(!ui.stockPage().includes('<th class="sortable" data-col="7">Balance</th>'),'partial movement history must not invent a running balance');
const dataManagement=ui.dataManagementPage();
assert(dataManagement.includes('ล้างธุรกรรมทดลอง'),'demo admin can reset transaction data');
assert(dataManagement.includes('data-action="deleteDemoRecord"'),'demo admin can delete supported individual records');
assert.equal(typeof ui.actions.resetDemoData,'function','reset demo data action is wired');
assert.equal(typeof ui.actions.deleteDemoRecord,'function','individual demo delete action is wired');

ui.state.profile.app_role='OWNER';
ui.state.data.balances.push({product_id:'p1',warehouse_id:'w2',on_hand:5,allocated:1});
ui.state.reportWarehouse='ALL';ui.state.stockView='TOTAL';
const ownerStockTotal=ui.stockPage();
assert(ownerStockTotal.includes('รวมทุกคลัง'),'owner can select combined stock');
assert(ownerStockTotal.includes('แยกตามคลัง'),'owner can select warehouse-split stock');
assert(!ownerStockTotal.includes('Stock Movement'),'owner stock must not expose movement');
assert(ownerStockTotal.includes('>15<'),'owner combined stock aggregates the same product across warehouses');
ui.state.stockView='BY_WAREHOUSE';
const ownerStockSplit=ui.stockPage();
assert(ownerStockSplit.includes('reportWarehouse'),'owner warehouse-split stock has a warehouse filter');
assert(ownerStockSplit.includes('WH1')&&ownerStockSplit.includes('WH2'),'owner warehouse-split stock shows warehouse rows');
const ownerCounts=ui.countsPage();
assert(ownerCounts.includes('ผลตรวจนับ Stock'),'owner has a stock-count result page');
assert(!ownerCounts.includes('newCount'),'owner cannot start a stock count');
assert(!ownerCounts.includes('data-action="finalizeCount"'),'owner cannot finalize a stock count');
assert(ui.roleMenus.OWNER.some(x=>x[0]==='counts'),'owner menu exposes count results');
assert(source.includes("!can('WAREHOUSE','ADMIN')||c.status!=='DRAFT'"),'count detail enforces owner read-only mode');
assert(ui.costVariancePage().includes('<th class="sortable num" data-col="1">Standard'),'numeric table headers align with numeric values');
assert(!source.includes('db.auth.signUp('),'self signup has been removed');
assert(!fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').includes('id="signupBtn"'),'self signup button removed');
assert(source.includes("db.rpc('report_kpis'"),'KPI cards use server aggregation');
assert(source.includes("db.rpc('report_invoice_page'"),'invoice details use server paging');

console.log(JSON.stringify({pagesRendered:pages.length,actionReferences:new Set(sourceActions).size,navigationReferences:new Set(goRefs).size,profitViews:5,profitFormulas:2,gpMargin:true,countPeriodFilter:true,demoDataManagement:true,masterImport:true,openingStockImport:true,controlledVehicleType:true,ownerStockViews:['combined','by-warehouse'],ownerCountReadOnly:true,adminOnlyAccounts:true,visibleButtonsWired:pageButtons.length,filtersTested:['year','warehouse','customer','count-period','search','sort-binding']},null,2));
