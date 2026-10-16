'use strict';
const SUPABASE_URL='https://spkoqjfpiurtjbfrtcvh.supabase.co';
const SUPABASE_KEY='sb_publishable_pi0RpNfuNf_F6WgfvHO_yw_Fg2-8EZc';
const FLOWSTOCK_APP_URL='https://flowbiz-one-premium.tnlx-acc.chatgpt.site/';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const state={session:null,profile:null,company:null,page:'dashboard',data:{},search:'',isPlatformAdmin:false,reportYear:String(new Date().getFullYear()),reportMonth:'ALL',reportWarehouse:'ALL',reportCustomer:'ALL',reportProduct:'ALL',reportVehicle:'ALL',reportTripStatus:'ALL',reportPage:0,countPeriod:'ALL',profitView:'invoice',lowContributionDate:null,lowContributionPeriod:false,stockView:'TOTAL',stockBelowMin:false,movementWarehouse:'ALL',movementProduct:'ALL',movementType:'ALL',movementFrom:'',movementTo:'',activeCount:null,activeCountLines:[]};

const roleMenus={
  SALES:[['dashboard','⌂','หน้าหลัก'],['orders','▤','Orders'],['customers','♙','ลูกค้า'],['delivery','⌖','ติดตามการส่ง']],
  WAREHOUSE:[['dashboard','⌂','หน้าหลัก'],['warehouse','▣','งานคลัง'],['stock','▦','Stock'],['counts','✓','ตรวจนับ Stock'],['stockadjust','±','Stock Adjustment'],['transfers','⇄','โอนคลัง'],['repack','↔','Repack / Conversion']],
  LOGISTICS:[['dashboard','⌂','หน้าหลัก'],['delivery','⌖','ขนส่ง / POD'],['orders','▤','Orders'],['stock','▦','Stock']],
  WAREHOUSE_LOGISTICS:[['dashboard','⌂','หน้าหลัก'],['orders','▤','Orders'],['warehouse','▣','งานคลัง'],['stock','▦','Stock'],['counts','✓','ตรวจนับ Stock'],['stockadjust','±','Stock Adjustment'],['delivery','⌖','ขนส่ง / POD'],['transfers','⇄','โอนคลัง'],['repack','↔','Repack / Conversion']],
  OWNER:[['dashboard','⌂','Executive Dashboard'],['profit','◫','Sales & Profit 360°'],['customer360','♙','Customer 360°'],['stockhealth','▦','Stock Summary'],['counts','✓','ผลตรวจนับ Stock'],['deliveryperformance','⌖','Delivery Performance'],['costvariance','◫','Cost & Variance'],['reports','≡','Reports']],
  ADMIN:[['dashboard','⌂','Admin Control Center'],['executive','◫','Executive Dashboard'],['orders','▤','Orders'],['warehouse','▣','รับสินค้า / งานคลัง'],['stock','▦','Stock'],['counts','✓','ตรวจนับ Stock'],['stockadjust','±','Stock Adjustment'],['delivery','⌖','ปฏิทินรถ / เที่ยวส่ง'],['transfers','⇄','โอนคลัง'],['repack','↔','Repack / Conversion'],['masters','⚙','Master Data / Monthly Cost'],['profit','◫','Sales & Profit'],['reports','≡','Reports'],['users','♟','Users / Roles'],['settings','⚒','System Setup / Business Rules'],['datamanagement','⌫','สำรอง / เริ่มปีใหม่'],['audit','≡','Audit / Import Log']]
};
for(const r of ['SALES','LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN'])roleMenus[r].splice(1,0,['bookings','▦','ปฏิทินรถ / จองรถ']);
const roleThai={SALES:'ฝ่ายขาย',WAREHOUSE:'คลังสินค้า',LOGISTICS:'ขนส่ง',WAREHOUSE_LOGISTICS:'คลัง + ขนส่ง',OWNER:'ผู้บริหาร',ADMIN:'ผู้ดูแลระบบ'};
const statusThai={DRAFT:'ร่าง',SUBMITTED:'รอ Admin Final',ADJUSTED:'ปรับยอดแล้ว',CONFIRMED:'รอจัดสินค้า',PARTIAL_ISSUE:'จ่ายบางส่วน',WAITING_LOGISTICS:'รอจัดรถ',IN_DELIVERY:'กำลังส่ง',DELIVERED:'ส่งสำเร็จ',CANCELLED:'ยกเลิก',PLANNED:'วางแผน',COMPLETED:'สำเร็จ',IN_TRANSIT:'อยู่ระหว่างโอน',POSTED:'บันทึกแล้ว',FINAL:'Final',ESTIMATED:'Estimated',ACTIVE:'ใช้งาน',TRIAL:'ทดลองใช้',DEMO:'Demo',SUSPENDED:'ระงับ',EXPIRED:'หมดอายุ',INACTIVE:'ปิดใช้งาน'};
const nf=new Intl.NumberFormat('th-TH',{maximumFractionDigits:2});
const money=n=>'฿'+nf.format(Number(n||0));
const qty=n=>nf.format(Number(n||0));
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dmy=v=>{if(!v)return'-';const d=new Date(v);return Number.isNaN(d.valueOf())?esc(v):new Intl.DateTimeFormat('th-TH-u-ca-gregory',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)};
const localInput=(offset=0)=>{const d=new Date(Date.now()+offset);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
const requestId=p=>`${p}-${crypto.randomUUID()}`;
const can=(...roles)=>{const role=state.profile?.app_role;if(roles.includes(role))return true;return role==='WAREHOUSE_LOGISTICS'&&(roles.includes('WAREHOUSE')||roles.includes('LOGISTICS')||roles.includes('WAREHOUSE_LOGISTICS'))};
const settingValue=(key,fallback=null)=>{const row=(state.data.settings||[]).find(x=>x.setting_key===key);return row==null?fallback:(typeof row.setting_value==='string'?row.setting_value:(row.setting_value??fallback))};
const orderStockPolicy=()=>String(settingValue('order_stock_policy','WARN')).replace(/^"|"$/g,'').toUpperCase();
const orderNumberPolicy=()=>String(settingValue('order_number_policy','FLEXIBLE')).replace(/^"|"$/g,'').toUpperCase();
const stockCountPolicy=()=>String(settingValue('stock_count_policy','AUTO_ADJUST')).replace(/^"|"$/g,'').toUpperCase();
const minimumStockPolicy=()=>String(settingValue('minimum_stock_policy','TOTAL')).replace(/^"|"$/g,'').toUpperCase()==='BY_WAREHOUSE'?'BY_WAREHOUSE':'TOTAL';
const warehouseMinimumOverride=(pid,wid)=>(state.data.warehouseMinimums||[]).find(x=>x.product_id===pid&&x.warehouse_id===wid);
const effectiveWarehouseMinimum=(pid,wid)=>{const row=warehouseMinimumOverride(pid,wid);return row?Number(row.minimum_stock||0):Number(product(pid).minimum_stock||0)};
const productTotalOnHand=pid=>(state.data.balances||[]).filter(x=>x.product_id===pid).reduce((sum,x)=>sum+Number(x.on_hand||0),0);
const productTotalIsLow=pid=>{const p=product(pid),min=Number(p.minimum_stock||0);return min>0&&productTotalOnHand(pid)<min};
const stockRowIsLow=(pid,wid)=>minimumStockPolicy()==='BY_WAREHOUSE'?effectiveWarehouseMinimum(pid,wid)>0&&Number((state.data.balances||[]).find(x=>x.product_id===pid&&x.warehouse_id===wid)?.on_hand||0)<effectiveWarehouseMinimum(pid,wid):productTotalIsLow(pid);
const reportParams=()=>({p_year:Number(state.reportYear),p_month:state.reportMonth==='ALL'?null:Number(state.reportMonth),p_warehouse_id:state.reportWarehouse==='ALL'?null:state.reportWarehouse,p_customer_id:state.reportCustomer==='ALL'?null:state.reportCustomer,p_product_id:state.reportProduct==='ALL'?null:state.reportProduct,p_vehicle_id:state.reportVehicle==='ALL'?null:state.reportVehicle});
const reportKey=()=>JSON.stringify(reportParams());
function getReportKpis(){return state.data.reportKpisKey===reportKey()?state.data.reportKpis:null}
async function refreshReportKpis(){const key=reportKey(),{data,error}=await db.rpc('report_kpis',reportParams());if(error)throw error;if(key===reportKey()){state.data.reportKpis=data;state.data.reportKpisKey=key;render()}}
async function refreshTodayStatus(){const {data,error}=await db.rpc('report_today_status');if(error)throw error;state.data.todayStatus=data;if(state.page==='dashboard'||state.page==='executive')render()}
async function refreshCustomerSummary(){const key=reportKey(),p=reportParams(),{data,error}=await db.rpc('report_customer_summary',{p_year:p.p_year,p_month:p.p_month,p_warehouse_id:p.p_warehouse_id,p_product_id:p.p_product_id,p_vehicle_id:p.p_vehicle_id});if(error)throw error;if(key===reportKey()){state.data.customerSummary=data;state.data.customerSummaryKey=key;render()}}
async function refreshMonthlySummary(){const key=reportKey(),p=reportParams(),{data,error}=await db.rpc('report_monthly_summary',{p_year:p.p_year,p_customer_id:p.p_customer_id,p_warehouse_id:p.p_warehouse_id,p_product_id:p.p_product_id,p_vehicle_id:p.p_vehicle_id});if(error)throw error;if(key===reportKey()){state.data.monthlySummary=data;state.data.monthlySummaryKey=key;render()}}
const invoicePageParams=()=>({...reportParams(),p_search:state.search,p_page:state.reportPage});
const invoicePageKey=()=>JSON.stringify(state.lowContributionDate?{date:state.lowContributionDate,page:state.reportPage}:state.lowContributionPeriod?{lowContributionPeriod:true,...reportParams(),page:state.reportPage}:invoicePageParams());
function getInvoicePage(){return state.data.invoicePageKey===invoicePageKey()?state.data.invoicePage:null}
async function refreshInvoicePage(){const key=invoicePageKey(),p=reportParams(),{data,error}=state.lowContributionDate?await db.rpc('report_low_contribution_page',{p_date:state.lowContributionDate,p_page:state.reportPage}):state.lowContributionPeriod?await db.rpc('report_low_contribution_period_page',{...p,p_page:state.reportPage}):await db.rpc('report_invoice_page',invoicePageParams());if(error)throw error;if(key===invoicePageKey()){state.data.invoicePage=data;state.data.invoicePageKey=key;render()}}
async function refreshReportData(){await Promise.all([refreshReportKpis(),refreshInvoicePage(),refreshCustomerSummary(),refreshMonthlySummary()])}

function searchableNormalize(v){
  return String(v??'').normalize('NFKC').toLocaleLowerCase('th-TH').replace(/\s+/g,' ').trim();
}
function shouldEnhanceSelect(sel){
  if(!sel||sel.tagName!=='SELECT'||sel.dataset.searchEnhanced==='1'||sel.dataset.searchable==='off'||sel.multiple||Number(sel.size||0)>1)return false;
  const opts=[...sel.options],hint=((sel.id||'')+' '+(sel.className||'')+' '+(sel.getAttribute('aria-label')||'')).toLowerCase();
  const masterHint=/(customer|product|supplier|vendor|warehouse|driver|vehicle|expense|group|ลูกค้า|สินค้า|คลัง|รถ|คนขับ)/i.test(hint);
  const codedOptions=opts.some(o=>(o.textContent||'').includes('•'));
  return masterHint||codedOptions||opts.length>=20;
}
function enhanceSearchableSelect(sel){
  if(!shouldEnhanceSelect(sel))return;
  sel.dataset.searchEnhanced='1';
  const wrap=document.createElement('div');
  wrap.className='searchable-select';
  sel.parentNode.insertBefore(wrap,sel);
  wrap.appendChild(sel);
  sel.classList.add('searchable-native-select');
  const input=document.createElement('input');
  input.type='text';input.autocomplete='off';input.spellcheck=false;
  input.className='searchable-select-input';
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  input.placeholder='พิมพ์รหัสหรือชื่อเพื่อค้นหา…';
  const list=document.createElement('div');
  list.className='searchable-select-list hidden';list.setAttribute('role','listbox');
  wrap.insertBefore(input,sel);wrap.appendChild(list);
  const wasRequired=sel.required;
  if(wasRequired){sel.required=false;input.required=true;}
  let activeIndex=-1,lastValidValue=sel.value;
  const optionText=opt=>String(opt?.textContent||'').trim();
  const selectedOption=()=>[...sel.options].find(o=>String(o.value)===String(sel.value));
  const syncFromSelect=()=>{const opt=selectedOption();input.value=opt&&opt.value!==''?optionText(opt):'';lastValidValue=sel.value;input.setCustomValidity(wasRequired&&!sel.value?'กรุณาเลือกรายการจากผลค้นหา':'');};
  const close=()=>{list.classList.add('hidden');input.setAttribute('aria-expanded','false');activeIndex=-1;};
  const choose=opt=>{if(!opt)return;sel.value=opt.value;lastValidValue=sel.value;input.value=opt.value===''?'':optionText(opt);input.setCustomValidity(wasRequired&&!sel.value?'กรุณาเลือกรายการจากผลค้นหา':'');close();sel.dispatchEvent(new Event('change',{bubbles:true}));};
  const renderOptions=(query='')=>{
    const tokens=searchableNormalize(query).split(' ').filter(Boolean);
    const all=[...sel.options];
    const matches=all.filter(opt=>{const text=searchableNormalize(optionText(opt));return tokens.every(t=>text.includes(t));});
    list.innerHTML='';
    const visible=matches.slice(0,80);
    visible.forEach((opt,idx)=>{const row=document.createElement('button');row.type='button';row.className='searchable-select-option';row.setAttribute('role','option');row.dataset.index=String(idx);row.textContent=optionText(opt);if(String(opt.value)===String(sel.value))row.classList.add('selected');row.onmousedown=e=>{e.preventDefault();choose(opt)};list.appendChild(row);});
    if(!visible.length){const empty=document.createElement('div');empty.className='searchable-select-empty';empty.textContent='ไม่พบรายการ';list.appendChild(empty);}
    else if(matches.length>visible.length){const more=document.createElement('div');more.className='searchable-select-more';more.textContent='พบ '+matches.length+' รายการ • พิมพ์เพิ่มเพื่อค้นหาให้แคบลง';list.appendChild(more);}
    list.classList.remove('hidden');input.setAttribute('aria-expanded','true');activeIndex=-1;
  };
  const markActive=idx=>{const rows=[...list.querySelectorAll('.searchable-select-option')];if(!rows.length)return;activeIndex=Math.max(0,Math.min(idx,rows.length-1));rows.forEach((r,i)=>r.classList.toggle('active',i===activeIndex));rows[activeIndex]?.scrollIntoView({block:'nearest'});};
  syncFromSelect();
  input.addEventListener('focus',()=>{input.select();renderOptions('')});
  input.addEventListener('input',()=>{renderOptions(input.value)});
  input.addEventListener('keydown',e=>{
    const rows=[...list.querySelectorAll('.searchable-select-option')];
    if(e.key==='ArrowDown'){e.preventDefault();if(list.classList.contains('hidden'))renderOptions(input.value);markActive(activeIndex+1)}
    else if(e.key==='ArrowUp'){e.preventDefault();markActive(activeIndex<=0?0:activeIndex-1)}
    else if(e.key==='Enter'&&!list.classList.contains('hidden')&&rows.length){e.preventDefault();const idx=activeIndex>=0?activeIndex:0;rows[idx]?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))}
    else if(e.key==='Escape'){e.preventDefault();const opt=[...sel.options].find(o=>String(o.value)===String(lastValidValue));sel.value=lastValidValue;input.value=opt&&opt.value!==''?optionText(opt):'';close()}
  });
  input.addEventListener('blur',()=>setTimeout(()=>{if(!list.matches(':hover')){const opt=[...sel.options].find(o=>String(o.value)===String(lastValidValue));sel.value=lastValidValue;input.value=opt&&opt.value!==''?optionText(opt):'';close()}},120));
  sel.addEventListener('change',syncFromSelect);
}
function enhanceSearchableSelects(root=document){
  const nodes=root?.matches?.('select')?[root]:[...(root?.querySelectorAll?.('select')||[])];
  nodes.forEach(enhanceSearchableSelect);
}
let searchableSelectObserver=null;
function startSearchableSelectObserver(){
  if(searchableSelectObserver)return;
  searchableSelectObserver=new MutationObserver(mutations=>{mutations.forEach(m=>m.addedNodes.forEach(node=>{if(node?.nodeType===1)enhanceSearchableSelects(node)}));});
  searchableSelectObserver.observe(document.body,{childList:true,subtree:true});
  enhanceSearchableSelects(document);
}
function setLoading(on){$('#loading').classList.toggle('hidden',!on)}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error-toast',error);el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800)}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');setTimeout(()=>$('#modalBody input, #modalBody select')?.focus(),30)}
function closeModal(){if($('#modalBody').dataset.busy==='1')return;$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}
function fail(e){console.error(e);const msg=errorText(e);toast(msg,true);if(errorGuidance(msg))setTimeout(()=>showErrorHelp(msg),80)}
function errorText(e){const m=e?.message||String(e||'เกิดข้อผิดพลาด');const map={BOOKING_NOT_EDITABLE:'คำขอนี้ไม่ได้อยู่ในสถานะส่งกลับแก้ไข',DECISION_REASON_REQUIRED:'กรุณาระบุเหตุผลในการปฏิเสธหรือส่งกลับแก้ไข',BOOKING_NOT_PENDING:'คำขอนี้ถูกดำเนินการแล้ว กรุณารีเฟรช',BOOKING_NOT_CONFIRMED:'คำขอยังไม่ได้รับอนุมัติ',INVALID_BOOKING_WINDOW:'ช่วงเวลาจองไม่ถูกต้อง',ORDER_ALREADY_BOOKED:'Order นี้ถูกจองในคำขออื่นแล้ว',FREIGHT_ALLOCATION_MISMATCH:'ยอดจัดสรรค่าขนส่งไม่ตรงกับยอดรวม',ALL_DELIVERY_LINES_REQUIRED:'กรุณากรอกยอดรับจริงให้ครบทุกสินค้า',AUTH_REQUIRED:'กรุณาเข้าสู่ระบบ',ROLE_NOT_ALLOWED:'บัญชีนี้ไม่มีสิทธิ์ทำรายการ',PASSWORD_CHANGE_REQUIRED:'ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งาน',PASSWORD_NOT_CHANGED:'กรุณาตั้งรหัสผ่านใหม่ก่อนยืนยัน',INVALID_TEMPORARY_PASSWORD:'รหัสผ่านชั่วคราวไม่ผ่านเกณฑ์ความปลอดภัย',INVALID_USER_DATA:'กรอกชื่อ รหัสพนักงาน อีเมล และสิทธิ์ให้ครบ',USER_ALREADY_EXISTS:'อีเมลนี้เป็นผู้ใช้ของบริษัทอยู่แล้ว',EMAIL_IN_ANOTHER_COMPANY:'อีเมลนี้ผูกกับบริษัทอื่นอยู่ ไม่สามารถนำมาใช้ซ้ำได้',CANNOT_RESET_OWN_PASSWORD:'Admin ไม่สามารถ Reset รหัสของตัวเองจากหน้านี้ได้',ADMIN_USER_OPERATION_FAILED:'สร้างหรือ Reset ผู้ใช้ไม่สำเร็จ กรุณาลองใหม่',PLATFORM_ADMIN_REQUIRED:'บัญชีนี้ไม่มีสิทธิ์จัดการลูกค้า',DEMO_DELETE_ONLY:'ลบถาวรได้เฉพาะบริษัท Demo เท่านั้น ข้อมูลจริงต้องยกเลิกหรือกลับรายการ',DEMO_SALES_IMPORT_ONLY:'นำเข้ายอดขายตัวอย่างได้เฉพาะบริษัท Demo',SALES_IMPORT_FILES_REQUIRED:'กรุณาเลือกไฟล์ Orders, Order Lines และ Invoices ให้ครบ',SALES_IMPORT_LIMIT:'ไฟล์มีจำนวนรายการเกินขีดจำกัด',SALES_IMPORT_COUNT_MISMATCH:'จำนวน Order และ Invoice ไม่ตรงกัน',COMPANY_CODE_MISMATCH:'รหัสบริษัทยืนยันไม่ถูกต้อง',DELETE_REASON_REQUIRED:'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร',DELETE_ENTITY_NOT_ALLOWED:'รายการประเภทนี้ไม่อนุญาตให้ลบเดี่ยว',RECORD_NOT_FOUND:'ไม่พบรายการที่ต้องการลบ',INVALID_RESET_SCOPE:'ขอบเขตการล้างข้อมูลไม่ถูกต้อง',COMPANY_INACTIVE:'บริษัทถูกระงับหรือหมดอายุ กรุณาติดต่อผู้ดูแล FlowStock',COMPANY_NOT_FOUND:'ไม่พบรหัสบริษัท หรือบริษัทยังไม่เปิดใช้งาน',COMPANY_CODE_EXISTS:'รหัสบริษัทนี้ถูกใช้แล้ว',COMPANY_CODE_REQUIRED:'กรุณาระบุรหัสบริษัท',ACCESS_REQUEST_ALREADY_PENDING:'บัญชีนี้มีคำขอของบริษัทอื่นที่กำลังรออนุมัติ',INVALID_OR_EXPIRED_ONBOARDING_CODE:'รหัสเปิดบริษัทไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว',USER_LIMIT_REACHED:'จำนวนผู้ใช้ถึงขีดจำกัดแพ็กเกจแล้ว',INVALID_POD_FILE:'รองรับ POD แบบ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB',POD_OBJECT_NOT_FOUND:'ไม่พบไฟล์ POD ที่อัปโหลด',INVALID_CUSTOMER:'ไม่พบลูกค้า',INVALID_PRODUCT:'ไม่พบสินค้า',INVALID_WAREHOUSE:'ไม่พบคลัง',INSUFFICIENT_STOCK:'Stock ไม่เพียงพอ',CONVERSION_LINES_REQUIRED:'ต้องมีรายการ Conversion อย่างน้อย 1 รายการ',INVALID_CONVERSION_QTY:'Qty Out / Qty In ต้องมากกว่า 0',SAME_CONVERSION_PRODUCT:'From Product และ To Product ต้องเป็นคนละรหัส',CONVERSION_NOT_FOUND:'ไม่พบรายการ Conversion',REVERSAL_REASON_REQUIRED:'กรุณาระบุเหตุผล Reverse อย่างน้อย 5 ตัวอักษร',REVERSAL_INSUFFICIENT_TARGET_STOCK:'Reverse ไม่ได้ เพราะ Stock ปลายทางไม่เพียงพอ',ORDER_NO_EXISTS:'เลข Order นี้มีอยู่แล้วในบริษัท',MANUAL_ORDER_NO_REQUIRED:'กรุณาระบุเลข Order จาก ERP / ลูกค้า',MANUAL_ORDER_NO_NOT_ALLOWED:'บริษัทกำหนดให้ใช้เลข Order จากระบบเท่านั้น',ORDER_NO_TOO_LONG:'เลข Order ยาวเกิน 100 ตัวอักษร',TRANSFER_NO_EXISTS:'เลขเอกสารใบโอนนี้มีอยู่แล้ว',TRANSFER_NO_TOO_LONG:'เลขเอกสารใบโอนยาวเกิน 100 ตัวอักษร',CONVERSION_NO_EXISTS:'เลขเอกสาร Repack นี้มีอยู่แล้ว',CONVERSION_NO_TOO_LONG:'เลขเอกสาร Repack ยาวเกิน 100 ตัวอักษร',REPACK_QTY_MUST_MATCH:'Repack ต้องมีจำนวน Out และ In เท่ากัน',REPACK_UOM_MISMATCH:'Repack ต้องใช้ UoM เดียวกัน เช่น KG → KG',INVALID_STOCK_COUNT_POLICY:'Stock Count Policy ไม่ถูกต้อง',ADJUSTMENT_DATE_REQUIRED:'กรุณาระบุวันที่ Adjustment',ADJUSTMENT_REASON_REQUIRED:'กรุณาระบุเหตุผลการปรับ Stock',ADJUSTMENT_LINES_REQUIRED:'ต้องมีรายการ Adjustment อย่างน้อย 1 รายการ',INVALID_ADJUSTMENT_QTY:'จำนวน Adjustment ต้องไม่เป็น 0',ADJUSTMENT_NO_EXISTS:'เลขเอกสาร Adjustment นี้มีอยู่แล้ว',ADJUSTMENT_NO_TOO_LONG:'เลขเอกสาร Adjustment ยาวเกิน 100 ตัวอักษร',INVALID_SOURCE_COUNT:'รอบตรวจนับที่อ้างอิงไม่ถูกต้อง',STOCK_ADJUSTMENT_NOT_FOUND:'ไม่พบ Stock Adjustment',STOCK_ADJUSTMENT_NOT_POSTABLE:'รายการนี้ไม่อยู่ในสถานะที่ Post ได้',STOCK_ADJUSTMENT_NOT_REVERSIBLE:'รายการนี้ไม่อยู่ในสถานะที่ Reverse ได้',INVALID_ORDER_STOCK_POLICY:'Order Stock Policy ไม่ถูกต้อง',INVALID_ORDER_NUMBER_POLICY:'Order Number Policy ไม่ถูกต้อง',ORDER_NOT_ISSUABLE:'Order นี้ไม่อยู่ในสถานะที่จ่ายสินค้าได้',ORDER_NOT_READY_FOR_DELIVERY:'Order ยังจ่ายสินค้าไม่ครบ',VEHICLE_TIME_CONFLICT:'รถคันนี้มีงานซ้อนในช่วงเวลาที่เลือก',VARIANCE_REASON_REQUIRED:'กรุณาระบุเหตุผลส่วนต่าง',ALL_COUNT_LINES_REQUIRED:'กรุณากรอกยอดตรวจจริงให้ครบทุกสินค้า',STOCK_COUNT_NOT_FOUND:'ไม่พบรอบตรวจนับ',STOCK_COUNT_NOT_EDITABLE:'รอบนี้ส่งตรวจแล้ว ไม่สามารถแก้ไขได้',STOCK_COUNT_NOT_SUBMITTED:'รอบตรวจยังไม่อยู่ในสถานะรอ Admin Final',COUNT_WORKFLOW_REQUIRED:'รอบตรวจต้องผ่าน Submit และ Admin Final ก่อนปรับ Stock',STOCK_COUNT_LINE_NOT_FOUND:'ไม่พบรายการสินค้าในรอบตรวจนับ',INVALID_COUNT_QTY:'ยอดตรวจจริงต้องไม่ติดลบ',REQUEST_ID_REQUIRED:'ไม่พบเลขคำขอ กรุณาลองใหม่',DELIVERY_VARIANCE_REASON_REQUIRED:'กรุณาระบุเหตุผลที่ลูกค้ารับไม่ครบ',PERIOD_CLOSED:'งวดของวันที่นี้ถูกปิดแล้ว กรุณาเปิดงวดก่อน',OPENING_REFERENCE_REQUIRED:'กรุณาระบุเลขที่อ้างอิงสต็อกตั้งต้น',OPENING_DATE_REQUIRED:'กรุณาระบุวันที่ยอดยกมา',OPENING_REFERENCE_EXISTS:'เลขที่อ้างอิงนี้เคยบันทึกแล้ว',OPENING_LINES_REQUIRED:'ไฟล์ไม่มีรายการสต็อกตั้งต้น',OPENING_LINES_LIMIT:'ไฟล์หนึ่งชุดรองรับไม่เกิน 5,000 รายการ',DUPLICATE_OPENING_LINE:'พบสินค้าและคลังซ้ำในไฟล์',INVALID_OPENING_LINE:'จำนวนหรือต้นทุนสต็อกตั้งต้นไม่ถูกต้อง',VERIFIED_BACKUP_REQUIRED:'ยังไม่มีไฟล์สำรองที่ผู้ดูแลฐานข้อมูลตรวจสอบและลงทะเบียนสำหรับปีนี้',DATA_CHANGED_SINCE_BACKUP:'ข้อมูลเปลี่ยนหลังสำรอง กรุณาสำรองใหม่',YEAR_NOT_FINISHED:'ยังไม่สิ้นสุดปีที่เลือก',NEW_YEAR_TRANSACTIONS_EXIST:'มีธุรกรรมปีใหม่แล้ว ไม่สามารถล้างปีเก่าได้',OPEN_WORK_OR_STOCK_ALLOCATION:'ยังมีงานค้างหรือ Stock ที่จัดสรรไว้ กรุณาปิดงานก่อน'};const exact=map[m];if(exact)return exact;if(m.startsWith('ORDER_STOCK_BLOCKED'))return 'Order เกิน Available Stock และบริษัทกำหนดนโยบาย BLOCK';if(m.startsWith('SALES_IMPORT_DUPLICATE'))return 'พบเลขที่ Order หรือ Invoice ซ้ำกับข้อมูลในระบบ';if(m.startsWith('INVALID_CUSTOMER_CODE'))return `ไม่พบรหัสลูกค้าใน Master: ${m.split(':').slice(1).join(':').trim()}`;if(m.startsWith('INVALID_PRODUCT_CODE'))return `ไม่พบรหัสสินค้าใน Master: ${m.split(':').slice(1).join(':').trim()}`;if(m.startsWith('INVALID_WAREHOUSE_CODE'))return `ไม่พบรหัสคลังใน Master: ${m.split(':').slice(1).join(':').trim()}`;if(m.startsWith('INVALID_VEHICLE_CODE'))return `ไม่พบรหัสรถใน Master: ${m.split(':').slice(1).join(':').trim()}`;if(m.startsWith('INVALID_DRIVER_CODE'))return `ไม่พบรหัสคนขับใน Master: ${m.split(':').slice(1).join(':').trim()}`;if(m.startsWith('SALES_REVENUE_MISMATCH'))return `ยอดรวม Order ไม่ตรงกับ Invoice: ${m.split(':').slice(1).join(':').trim()}`;return m}
function badge(s){const c=['DELIVERED','COMPLETED','POSTED','FINAL','ACTIVE'].includes(s)?'ok':['CONFIRMED','PARTIAL_ISSUE','ESTIMATED','IN_TRANSIT','TRIAL','DEMO'].includes(s)?'warn':['WAITING_LOGISTICS','IN_DELIVERY','PLANNED'].includes(s)?'blue':['CANCELLED','SUSPENDED','EXPIRED','INACTIVE'].includes(s)?'danger':'';return `<span class="badge ${c}">${esc(statusThai[s]||s||'-')}</span>`}
function empty(text='ไม่พบข้อมูล'){return `<div class="empty">${esc(text)}</div>`}

const PAGE_HELP={
  dashboard:{title:'ภาพรวมธุรกิจ',steps:['ดู KPI ยอดขาย กำไร และรายการที่ต้องติดตาม','กดการ์ดแจ้งเตือนเพื่อเปิดรายการต้นเหตุ','ใช้ตัวกรองปี/เดือน/ลูกค้า/สินค้า/คลังตามต้องการ']},
  executive:{title:'Executive Dashboard',steps:['เริ่มจากยอดขายและ Contribution','ดู Stock ต่ำกว่า Minimum และรายการผิดปกติ','กดดูรายละเอียดเพื่อลงไปถึง Invoice หรือ Stock']},
  orders:{title:'Orders',steps:['กดสร้าง Order แล้วเลือกลูกค้า','เลือกสินค้า/คลังและตรวจ Available Stock','เลือกเลข Order จากระบบหรือ ERP ตาม Policy','กดยืนยันแล้วติดตามสถานะจนคลังจ่ายครบ']},
  warehouse:{title:'รับสินค้า / งานคลัง',steps:['รับสินค้าเข้าคลังจาก Vendor','เปิด Order ที่รอจ่าย และจ่ายได้บางส่วนหรือครบ','ใช้ Repack / Conversion เมื่อต้องเปลี่ยนรหัสสินค้า เช่น Tank → Drum','ระบบห้าม Stock ติดลบ และตรวจ Movement/Audit ได้ทันที']},
  stock:{title:'Stock',steps:['ดู On Hand / Allocated / Available','ติ๊ก Stock ต่ำกว่า Min เพื่อดูเฉพาะรายการเสี่ยง','ใช้ตัวกรอง Movement ตามคลัง/สินค้า/ประเภท/วันที่','Movement แสดง In / Out / คงเหลือหลังรายการ']},
  counts:{title:'ตรวจนับ Stock',steps:['เริ่มรอบตรวจนับที่คลัง ระบบ Snapshot Book Qty และ Policy ของรอบนั้น','กรอกยอดตรวจจริงให้ครบ และใส่เหตุผลเมื่อมีส่วนต่าง','Submit ให้ Admin Final','AUTO ปรับทันที • REVIEW เก็บผลอย่างเดียว • MANUAL ส่งต่อ Stock Adjustment']},
  stockadjust:{title:'Stock Adjustment',steps:['WAREHOUSE หรือ ADMIN สร้างรายการ +เพิ่ม / -ลด พร้อมเหตุผล','การ Submit ยังไม่เปลี่ยน Stock','ADMIN ตรวจและกด Post จึงกระทบ On Hand','ถ้าผิดให้ Reverse เพื่อเก็บ Audit Trail']},
  transfers:{title:'โอนคลัง',steps:['กรอกเลขใบโอนของบริษัทได้ หรือเว้นว่างให้ระบบรัน','เลือกคลังต้นทางและปลายทาง','เลือกสินค้าและจำนวน โดยต้นทางต้องมี Stock เพียงพอ','ปลายทางรับโอนเพื่อจบรายการ']},
  repack:{title:'Repack / Conversion',steps:['กรอกเลขเอกสารเองได้ หรือเว้นว่างให้ระบบรัน','เลือกคลัง สินค้าต้นทาง และสินค้าปลายทาง','กรอกจำนวน Repack เพียงช่องเดียว ระบบ Out = In อัตโนมัติ','ถ้าบันทึกผิดให้ Reverse ไม่แก้ Stock ตรง']},
  delivery:{title:'ปฏิทินรถ / เที่ยวส่ง',steps:['เลือก Order ที่คลังจ่ายพร้อมแล้ว','เลือกรถ คนขับ และผู้ให้บริการ','บันทึก Actual Received เมื่อลูกค้ารับสินค้า','ถ้ารับไม่ครบให้ระบุเหตุผลส่วนต่าง']},
  profit:{title:'Sales & Profit',steps:['เลือกช่วงเวลาที่ต้องการ','ดู Sales / Product Cost / GP / Contribution','กด Invoice เพื่อดูรายละเอียดต้นเหตุ','ใช้เกณฑ์ Contribution ที่ Admin กำหนด']},
  reports:{title:'Reports',steps:['เปิดรายงานตามช่วงเวลาที่ต้องการ','ใช้ CSV สำหรับตรวจสอบรายการ','บริษัท Demo สามารถนำเข้าประวัติสมจริงได้','พิมพ์หรือ Save as PDF จากรายงานที่เปิด']},
  masters:{title:'Master Data / Monthly Cost',steps:['สร้าง Master พื้นฐานก่อนเริ่มธุรกรรม','พิมพ์รหัสหรือชื่อในช่องค้นหาได้','Product กำหนด Minimum Stock รวม/Default ได้','Monthly Cost ต้องใส่ตามเดือนเพื่อคำนวณกำไร']},
  users:{title:'Users / Roles',steps:['Admin เป็นผู้สร้าง User เท่านั้น','กำหนด Role ตามหน้าที่จริง','ใช้ Temporary Password แล้วให้ผู้ใช้เปลี่ยนรหัสครั้งแรก','ปิด Active เมื่อต้องการระงับบัญชี']},
  settings:{title:'System Setup / Business Rules',steps:['กำหนด Order Stock Policy = WARN หรือ BLOCK','เลือก Minimum Stock = TOTAL หรือ BY WAREHOUSE และตั้ง Min รายคลัง','ตั้ง Contribution Threshold','Close/Reopen เดือนเมื่อควบคุมงวด']},
  datamanagement:{title:'สำรอง / เริ่มปีใหม่',steps:['ตรวจ Backup Archive และ Restore Rehearsal','Production ต้องขึ้น DR READY ก่อน Go-live','Demo สามารถล้างข้อมูลธุรกิจเพื่อเริ่มใหม่','Year-end ต้องใช้ Backup SHA ที่ลงทะเบียนแล้ว']},
  audit:{title:'Audit / Import Log',steps:['ใช้ตรวจว่าใครทำอะไร เมื่อไร','ค้นหาเหตุการณ์ผิดปกติหรือการ Import','Audit ไม่ใช่ข้อมูลธุรกิจที่ควรลบเพื่อเริ่มปีใหม่']},
  commercial:{title:'Commercial Control',steps:['ใช้เปิดบริษัทลูกค้าใหม่','กำหนด Trial/Active/Expired','หนึ่งลูกค้า = หนึ่งฐาน/Project ตามนโยบายขายจริง']},
  inactive:{title:'บัญชีหรือบริษัทไม่พร้อมใช้งาน',steps:['ตรวจสถานะบริษัทและ Subscription','ติดต่อ Admin หรือผู้ดูแลระบบเพื่อเปิดสิทธิ์']}
};
function helpKey(){return 'flowbiz-help-v1:'+String(state.company?.id||state.company?.code||'company')+':'+String(state.profile?.user_id||state.profile?.employee_code||'user')}
function currentHelp(){return PAGE_HELP[state.page]||{title:'วิธีใช้ FlowBiz One',steps:['เลือกเมนูจากด้านซ้าย','กรอกข้อมูลตามลำดับงาน','หากติดเงื่อนไข ระบบจะแจ้งสิ่งที่ต้องทำต่อ']}}
function showPageHelp(){
  const h=currentHelp();
  modal('<div class="help-modal"><div class="help-modal-head"><div><small>FLOWBIZ ONE QUICK GUIDE</small><h2>'+esc(h.title)+'</h2></div></div><div class="help-steps">'+h.steps.map((x,i)=>'<div class="help-step"><b>'+(i+1)+'</b><span>'+esc(x)+'</span></div>').join('')+'</div><div class="actions"><button class="btn" id="openTrialGuideFromHelp" type="button">Trial Guide 10 นาที</button><button class="btn primary" type="button" id="closeHelpGuide">เข้าใจแล้ว</button></div></div>');
  const t=$('#openTrialGuideFromHelp');if(t)t.onclick=showTrialGuide;
  const c=$('#closeHelpGuide');if(c)c.onclick=closeModal;
}
function showTrialGuide(){
  modal('<div class="help-modal"><div class="help-modal-head"><div><small>7-DAY BUSINESS TRIAL</small><h2>ทดลอง FlowBiz One ให้ครบ Flow ภายใน 10 นาที</h2></div></div><div class="help-steps"><div class="help-step"><b>1</b><span>เปิด Executive Dashboard ดูยอดขาย กำไร และ Stock ที่ต้องติดตาม</span></div><div class="help-step"><b>2</b><span>สร้าง Order 1 รายการ เลือกลูกค้า สินค้า คลัง และเลข Order</span></div><div class="help-step"><b>3</b><span>เข้า รับสินค้า / งานคลัง แล้วจ่ายสินค้าให้ Order</span></div><div class="help-step"><b>4</b><span>เข้า ปฏิทินรถ / เที่ยวส่ง สร้างเที่ยวและบันทึก Actual Received</span></div><div class="help-step"><b>5</b><span>กลับไป Sales & Profit และ Stock เพื่อดูผลลัพธ์ที่เกิดขึ้น</span></div></div><div class="alert ok">ถ้าทำครบ 5 ขั้นตอนนี้ จะเห็น Flow หลักตั้งแต่ Sales → Warehouse → Delivery → Profit</div><div class="actions"><button class="btn primary" id="closeTrialGuide" type="button">เริ่มทดลอง</button></div></div>');
  const c=$('#closeTrialGuide');if(c)c.onclick=closeModal;
}
function showWelcomeGuideIfNeeded(){
  try{if(localStorage.getItem(helpKey())==='done')return}catch(e){}
  const role=state.profile?.app_role||'USER';
  const roleText=role==='SALES'?'Sales':role==='WAREHOUSE'?'Warehouse':role==='LOGISTICS'?'Logistics':role==='WAREHOUSE_LOGISTICS'?'Warehouse + Logistics':role==='OWNER'?'Owner / Management':role==='ADMIN'?'Admin':'User';
  modal('<div class="help-modal welcome-guide"><div class="help-modal-head"><div><small>WELCOME TO FLOWBIZ ONE</small><h2>เริ่มใช้งานใน 5 นาที</h2><p>คู่มือสั้นสำหรับ '+esc(roleText)+'</p></div></div><div class="help-steps">'+(PAGE_HELP[state.page]||PAGE_HELP.dashboard).steps.slice(0,4).map((x,i)=>'<div class="help-step"><b>'+(i+1)+'</b><span>'+esc(x)+'</span></div>').join('')+'</div><div class="actions"><button class="btn" id="welcomeDontShow" type="button">ไม่แสดงอีก</button><button class="btn" id="openTrialGuideFromWelcome" type="button">Trial Guide 10 นาที</button><button class="btn primary" id="welcomeStart" type="button">เริ่มใช้งาน</button></div></div>');
  const done=()=>{try{localStorage.setItem(helpKey(),'done')}catch(e){}closeModal()};
  if($('#welcomeDontShow'))$('#welcomeDontShow').onclick=done;
  if($('#openTrialGuideFromWelcome'))$('#openTrialGuideFromWelcome').onclick=showTrialGuide;
  if($('#welcomeStart'))$('#welcomeStart').onclick=done;
}
function errorGuidance(message){
  const m=String(message||'');
  if(m.includes('Stock ไม่เพียงพอ')||m.includes('ORDER_STOCK_BLOCKED'))return 'ตรวจ Available Stock ที่เมนู Stock หรือปรับจำนวน Order/Issue หากบริษัทใช้ BLOCK จะต้องมี Stock เพียงพอก่อนยืนยัน';
  if(m.includes('PERIOD_CLOSED')||m.includes('งวด'))return 'ไปที่ System Setup / Business Rules แล้วตรวจเดือนที่ปิดอยู่ หากจำเป็นให้ Admin Reopen พร้อมระบุเหตุผล';
  if(m.includes('ไม่พบสินค้า')||m.includes('INVALID_PRODUCT'))return 'ตรวจ Product Master ว่ามีรหัสสินค้าและ Active อยู่';
  if(m.includes('ไม่พบลูกค้า')||m.includes('INVALID_CUSTOMER'))return 'ตรวจ Customer Master ว่ามีรหัสลูกค้าและ Active อยู่';
  if(m.includes('ไม่พบคลัง')||m.includes('INVALID_WAREHOUSE'))return 'ตรวจ Warehouse Master และสถานะ Active';
  if(m.includes('ROLE_NOT_ALLOWED')||m.includes('ไม่มีสิทธิ์'))return 'ตรวจ Role ของผู้ใช้ที่เมนู Users / Roles หรือให้ Admin เป็นผู้ทำรายการ';
  return '';
}
function showErrorHelp(message){
  const guide=errorGuidance(message);if(!guide)return;
  modal('<div class="help-modal"><div class="alert danger"><b>'+esc(message)+'</b></div><h3>ควรทำอย่างไรต่อ</h3><p>'+esc(guide)+'</p><div class="actions"><button class="btn primary" id="closeErrorHelp" type="button">รับทราบ</button></div></div>');
  if($('#closeErrorHelp'))$('#closeErrorHelp').onclick=closeModal;
}

function head(title,sub='',actions=''){const help='<button class="btn help-btn" type="button" data-action="pageHelp">? วิธีใช้</button>';return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="actions">${help}${actions}</div></div>`}
function cards(items){return `<div class="cards">${items.map(x=>`<div class="card"><div class="label">${esc(x[0])}</div><div class="value">${x[1]}</div><div class="hint">${esc(x[2]||'')}</div></div>`).join('')}</div>`}
function table(headers,rows,className='',numericCols=[]){if(!rows.length)return empty();const numeric=new Set(numericCols),sample=rows.find(Boolean)||'';[...sample.matchAll(/<td\b([^>]*)>/g)].forEach((m,i)=>{if(/\bnum\b/.test(m[1]))numeric.add(i)});const wide=headers.length>=6?' wide-table':'';return `<div class="table-wrap ${esc(className)}${wide}"><table><thead><tr>${headers.map((h,i)=>`<th class="sortable${numeric.has(i)?' num':''}" data-col="${i}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
function sortableValue(v){
  const s=String(v??'').trim();
  const dm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(dm){
    const [,d,m,y,hh='0',mm='0',ss='0']=dm;
    return {type:'date',value:Date.UTC(Number(y),Number(m)-1,Number(d),Number(hh),Number(mm),Number(ss))};
  }
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if(iso){
    const [,y,m,d,hh='0',mm='0',ss='0']=iso;
    return {type:'date',value:Date.UTC(Number(y),Number(m)-1,Number(d),Number(hh),Number(mm),Number(ss))};
  }
  const numeric=s.replace(/,/g,'').replace(/^฿/,'');
  if(numeric!==''&&Number.isFinite(Number(numeric)))return {type:'number',value:Number(numeric)};
  return {type:'text',value:s};
}
function wireSort(){
  document.querySelectorAll('#page th.sortable').forEach(th=>{
    th.onclick=()=>{
      const table=th.closest('table');
      const body=table?.tBodies?.[0];
      if(!body)return;
      const i=Number(th.dataset.col),asc=th.dataset.asc!=='1';
      [...body.rows]
        .sort((a,b)=>{
          const xv=sortableValue(a.cells[i]?.dataset.sort??a.cells[i]?.innerText??'');
          const yv=sortableValue(b.cells[i]?.dataset.sort??b.cells[i]?.innerText??'');
          let cmp;
          if(xv.type===yv.type&&(xv.type==='date'||xv.type==='number'))cmp=xv.value-yv.value;
          else cmp=String(xv.value).localeCompare(String(yv.value),'th',{numeric:true,sensitivity:'base'});
          return cmp*(asc?1:-1);
        })
        .forEach(r=>body.appendChild(r));
      table.querySelectorAll('th.sortable').forEach(h=>{if(h!==th)delete h.dataset.asc});
      th.dataset.asc=asc?'1':'0';
    };
  });
}
async function init(){
  bindShell();
  const {data:{session}}=await db.auth.getSession();
  if(session)await startApp(session);else showLogin();
  db.auth.onAuthStateChange(async(event,session)=>{if(event==='SIGNED_OUT')showLogin();if(event==='SIGNED_IN'&&session&&!state.session)await startApp(session);if(event==='PASSWORD_RECOVERY')passwordRecoveryModal()});
}
function bindShell(){
  $('#loginForm').addEventListener('submit',login);$('#logoutBtn').onclick=()=>db.auth.signOut();
  $('#forgotBtn').onclick=forgotPassword;
  $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#modalClose').onclick=closeModal;
  $('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
  $('#refreshBtn').onclick=async()=>{await loadData();render();toast('อัปเดตข้อมูลแล้ว')};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
}
async function login(e){e.preventDefault();$('#loginError').textContent='';setLoading(true);const {error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});setLoading(false);if(error)$('#loginError').textContent='อีเมลหรือรหัสผ่านไม่ถูกต้อง'}
function showLogin(){state.session=null;state.profile=null;state.company=null;state.isPlatformAdmin=false;state.page='dashboard';setLoading(false);$('#shell').classList.add('hidden');$('#authView').classList.remove('hidden');$('#loginForm').classList.remove('hidden')}
async function startApp(session){
  setLoading(true);state.session=session;
  try{
    const {data,error}=await db.rpc('get_my_context');
    if(error)throw error;
    if(!data||!data.active){
      await db.auth.signOut();
      showLogin();
      $('#loginError').textContent='บัญชีนี้ยังไม่ได้สร้างหรือถูกปิดใช้งาน กรุณาติดต่อ Admin บริษัท';
      return;
    }
    state.profile=data;state.company=data.company;state.isPlatformAdmin=Boolean(data.is_platform_admin);
    $('#companyName').textContent=data.company?.name||'FlowBiz One';
    $('#roleName').textContent=roleThai[data.app_role]||data.app_role;
    $('#sideUser').textContent=`${data.full_name} • ${data.employee_code||''}`;

    if(data.must_change_password){
      $('#authView').classList.add('hidden');$('#shell').classList.remove('hidden');$('#nav').innerHTML='';
      $('#page').innerHTML=head('ตั้งรหัสผ่านใหม่','บัญชีนี้ใช้รหัสผ่านชั่วคราวและยังไม่เปิดให้เข้าถึงข้อมูลบริษัท')+'<div class="panel"><div class="alert warn">กรุณาตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน FlowBiz One</div></div>';
      setLoading(false);forcePasswordChangeModal();return;
    }
    if(!data.active||!data.company?.active||['SUSPENDED','EXPIRED'].includes(data.company?.subscription_status)||(data.company?.subscription_status==='TRIAL'&&data.company.trial_ends_at&&new Date(data.company.trial_ends_at)<=new Date())){
      state.page='inactive';renderNav();$('#authView').classList.add('hidden');$('#shell').classList.remove('hidden');setLoading(false);render();return;
    }

    renderNav();
    $('#authView').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    $('#page').innerHTML='<div class="panel"><h3>กำลังเตรียมข้อมูลบริษัท…</h3><p class="muted">เข้าสู่ระบบสำเร็จแล้ว กำลังโหลดข้อมูลล่าสุด</p></div>';
    setLoading(false);

    try{
      await loadData();
      render();
      setTimeout(showWelcomeGuideIfNeeded,250);
    }catch(loadError){
      console.error('Initial data load failed',loadError);
      setLoading(false);
      $('#page').innerHTML=head('โหลดข้อมูลไม่สำเร็จ','เข้าสู่ระบบสำเร็จแล้ว แต่ข้อมูลบางส่วนตอบสนองช้าหรือเกิดข้อผิดพลาด')+'<div class="panel"><div class="alert danger">ระบบไม่พาคุณกลับไปหน้า Login เพื่อป้องกันความสับสน กรุณาลองโหลดข้อมูลอีกครั้ง</div><button class="btn primary" id="retryInitialLoad">ลองโหลดข้อมูลอีกครั้ง</button></div>';
      const retry=$('#retryInitialLoad');
      if(retry)retry.onclick=async()=>{setLoading(true);try{await loadData();render()}catch(e){fail(e)}finally{setLoading(false)}};
    }
  }catch(err){
    console.error('startApp failed',err);
    setLoading(false);
    state.session=null;
    showLogin();
    $('#loginError').textContent='ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้ กรุณาลองใหม่';
  }
}
function renderNav(){const menus=state.page==='inactive'?[]:[...(roleMenus[state.profile.app_role]||roleMenus.SALES)];if(state.isPlatformAdmin)menus.push(['commercial','◆','Commercial Control']);$('#nav').innerHTML=menus.map(m=>`<button class="nav-btn ${state.page===m[0]?'active':''}" data-page="${m[0]}"><span class="nav-icon">${m[1]}</span>${m[2]}</button>`).join('');$$('.nav-btn').forEach(b=>b.onclick=()=>go(b.dataset.page))}
function go(page){state.lowContributionDate=null;state.lowContributionPeriod=false;state.page=page;state.search='';state.reportPage=0;if(page!=='profit')state.reportCustomer='ALL';renderNav();$('#sidebar').classList.remove('open');render();if(page==='profit')refreshInvoicePage().catch(fail);if(page==='dashboard'||page==='executive')refreshTodayStatus().catch(fail);if(page==='stock')refreshStockData().then(()=>render()).catch(fail)}

async function refreshStockData(){
  const [balancesRes,movementsRes]=await Promise.all([
    db.from('stock_balances').select('*'),
    can('WAREHOUSE','LOGISTICS','ADMIN')
      ? db.from('stock_movements').select('*').order('created_at',{ascending:false}).limit(500)
      : Promise.resolve({data:[],error:null})
  ]);
  if(balancesRes.error)throw balancesRes.error;
  if(movementsRes.error)throw movementsRes.error;
  state.data.balances=balancesRes.data||[];
  state.data.movements=movementsRes.data||[];
  return {balances:state.data.balances.length,movements:state.data.movements.length};
}

async function loadData(){
  setLoading(true);
  const store=(name,result)=>{
    if(result?.error){
      if(name==='audit'&&!can('ADMIN','OWNER'))state.data.audit=[];
      else throw result.error;
    }else state.data[name]=result?.data??[];
  };
  const runBatch=async entries=>{
    const concurrency=4;
    for(let i=0;i<entries.length;i+=concurrency){
      const chunk=entries.slice(i,i+concurrency);
      const results=await Promise.all(chunk.map(([,query])=>query));
      results.forEach((result,j)=>store(chunk[j][0],result));
    }
  };

  try{
    const batch1=[
      ['customers',db.from('customers').select('*').order('code')],
      ['productGroups',db.from('product_groups').select('*').order('code')],
      ['products',db.from('products').select('*').order('code')],
      ['warehouses',db.from('warehouses').select('*').order('code')],
      ['suppliers',db.from('suppliers').select('*').order('code')],
      ['vehicleTypes',db.from('vehicle_types').select('*').order('code')],
      ['vehicles',db.from('vehicles').select('*').order('code')],
      ['drivers',db.from('drivers').select('*').order('code')]
    ];
    await runBatch(batch1);

    const batch2=[
      ['balances',db.from('stock_balances').select('*')],
      ['movements',can('WAREHOUSE','LOGISTICS','ADMIN')?db.from('stock_movements').select('*').order('created_at',{ascending:false}).limit(300):Promise.resolve({data:[],error:null})],
      ['orders',db.from('orders').select('*').order('created_at',{ascending:false}).limit(300)],
      ['receipts',db.from('goods_receipts').select('*').order('receipt_date',{ascending:false}).limit(300)],
      ['transfers',db.from('transfers').select('*').order('transfer_no',{ascending:false}).limit(300)],
      ['transferLines',db.from('transfer_lines').select('*').limit(1000)],
      ['trips',db.from('delivery_trips').select('*').order('planned_start',{ascending:false}).limit(300)],
      ['deliveryDocs',db.from('delivery_documents').select('*').order('created_at',{ascending:false}).limit(300)],
      ['conversions',can('WAREHOUSE','ADMIN')?db.from('stock_conversions').select('*').order('conversion_date',{ascending:false}).order('created_at',{ascending:false}).limit(300):Promise.resolve({data:[],error:null})],
      ['conversionLines',can('WAREHOUSE','ADMIN')?db.from('stock_conversion_lines').select('*').order('conversion_id').order('line_no').limit(2000):Promise.resolve({data:[],error:null})],
      ['adjustments',can('WAREHOUSE','ADMIN')?db.from('stock_adjustments').select('*').order('adjustment_date',{ascending:false}).order('created_at',{ascending:false}).limit(300):Promise.resolve({data:[],error:null})],
      ['adjustmentLines',can('WAREHOUSE','ADMIN')?db.from('stock_adjustment_lines').select('*').order('adjustment_id').order('line_no').limit(2000):Promise.resolve({data:[],error:null})]
    ];
    await runBatch(batch2);

    const batch3=[
      ['invoices',db.from('invoices').select('*').order('invoice_date',{ascending:false}).limit(300)],
      ['costs',db.from('monthly_product_costs').select('*').order('cost_month',{ascending:false})],
      ['expenseTypes',db.from('expense_types').select('*').order('code')],
      ['expenseRates',db.from('expense_rates').select('*').order('effective_from',{ascending:false})],
      ['actualExpenses',db.from('actual_expenses').select('*').limit(300)],
      ['counts',db.from('stock_counts').select('*').order('snapshot_at',{ascending:false}).limit(300)],
      ['countLines',db.from('stock_count_lines').select('*').limit(1000)],
      ['periods',db.from('period_closes').select('*').order('period_month',{ascending:false})]
    ];
    await runBatch(batch3);

    const batch4=[
      ['bookings',db.from('vehicle_booking_requests').select('*').order('requested_start',{ascending:false}).limit(500)],
      ['bookingOrders',db.from('vehicle_booking_orders').select('*').limit(2000)],
      ['settings',db.from('app_settings').select('*')],
      ['warehouseMinimums',db.from('product_warehouse_minimums').select('*').order('warehouse_id').order('product_id')],
      ['openingBatches',can('ADMIN','OWNER')?db.from('opening_stock_batches').select('*').order('opening_date',{ascending:false}).limit(100):Promise.resolve({data:[],error:null})],
      ['openingLines',can('ADMIN','OWNER')?db.from('opening_stock_lines').select('*').limit(1000):Promise.resolve({data:[],error:null})],
      ['users',can('ADMIN')?db.rpc('admin_list_users'):Promise.resolve({data:[],error:null})],
      ['audit',db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(200)],
      ['tenants',state.isPlatformAdmin?db.rpc('platform_list_companies'):Promise.resolve({data:[],error:null})],
      ['backupStatus',can('ADMIN','OWNER')?db.rpc('admin_backup_restore_status'):Promise.resolve({data:null,error:null})]
    ];
    await runBatch(batch4);

    const reportP=reportParams();
    const batch5=[
      ['reportKpis',db.rpc('report_kpis',reportP)],
      ['todayStatus',db.rpc('report_today_status')],
      ['invoicePage',db.rpc('report_invoice_page',invoicePageParams())],
      ['customerSummary',db.rpc('report_customer_summary',{p_year:reportP.p_year,p_month:reportP.p_month,p_warehouse_id:reportP.p_warehouse_id,p_product_id:reportP.p_product_id,p_vehicle_id:reportP.p_vehicle_id})],
      ['monthlySummary',db.rpc('report_monthly_summary',{p_year:reportP.p_year,p_customer_id:reportP.p_customer_id,p_warehouse_id:reportP.p_warehouse_id,p_product_id:reportP.p_product_id,p_vehicle_id:reportP.p_vehicle_id})]
    ];
    await runBatch(batch5);

    const related={
      orderLines:['order_lines','order_id',(state.data.orders||[]).map(x=>x.id)],
      tripLines:['delivery_trip_lines','trip_id',(state.data.trips||[]).map(x=>x.id)],
      invoiceOrders:['invoice_orders','invoice_id',(state.data.invoices||[]).map(x=>x.id)],
      invoiceTrips:['invoice_trips','invoice_id',(state.data.invoices||[]).map(x=>x.id)]
    };
    for(const [name,args] of Object.entries(related)){
      const [tableName,key,idsRaw]=args,ids=idsRaw.filter(Boolean),rows=[],chunkSize=40;
      for(let c=0;c<ids.length;c+=chunkSize){
        const chunk=ids.slice(c,c+chunkSize);
        for(let offset=0;;offset+=1000){
          let q=db.from(tableName).select('*').in(key,chunk).order(key).order(tableName==='invoice_orders'?'order_id':tableName==='invoice_trips'?'trip_id':'id');
          const {data,error}=await q.range(offset,offset+999);
          if(error)throw error;
          rows.push(...(data||[]));
          if((data||[]).length<1000)break;
        }
      }
      state.data[name]=rows;
    }

    state.data.reportKpisKey=reportKey();
    state.data.invoicePageKey=invoicePageKey();
    state.data.customerSummaryKey=reportKey();
    state.data.monthlySummaryKey=reportKey();
  }finally{
    setLoading(false);
  }
}
function render(){
  const pages={bookings:premiumBookingPage,dashboard:dashboardPage,executive:dashboardPage,orders:ordersPage,warehouse:warehousePage,stock:stockPage,counts:countsPage,stockadjust:stockAdjustmentPage,transfers:transfersPage,repack:repackPage,delivery:deliveryPage,profit:profitPage,customer360:customer360Page,stockhealth:stockHealthPage,deliveryperformance:deliveryPerformancePage,costvariance:costVariancePage,reports:reportsPage,customers:customersPage,masters:mastersPage,users:usersPage,settings:settingsPage,datamanagement:dataManagementPage,audit:auditPage,commercial:commercialPage,inactive:inactivePage};
  $('#page').innerHTML=(pages[state.page]||dashboardPage)();wireSort();wirePage();
}
function wirePage(){
  $$('[data-action]').forEach(b=>b.onclick=()=>{const action=actions[b.dataset.action];if(!action)return toast(`ปุ่ม ${b.dataset.action} ยังไม่พร้อมใช้งาน`,true);action(b.dataset.id)});
  $$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  $$('[data-profit-view]').forEach(b=>b.onclick=()=>{state.profitView=b.dataset.profitView;render()});
  $$('[data-stock-view]').forEach(b=>b.onclick=()=>{state.stockView=b.dataset.stockView;if(state.stockView==='TOTAL')state.reportWarehouse='ALL';render()});
  const minFilter=$('#stockBelowMin');if(minFilter){minFilter.checked=Boolean(state.stockBelowMin);minFilter.onchange=()=>{state.stockBelowMin=minFilter.checked;render()}}
  const search=$('#pageSearch');if(search){search.value=state.search;search.oninput=()=>{state.search=search.value.toLowerCase();state.reportPage=0;clearTimeout(state.searchTimer);const pageAtInput=state.page;state.searchTimer=setTimeout(()=>{if(state.page!==pageAtInput)return;if(state.page==='profit')refreshInvoicePage().catch(fail);else{render();const q=$('#pageSearch');if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}}},320)}}
  const updateReport=()=>{state.reportPage=0;render();refreshReportData().catch(fail)};
  const year=$('#reportYear');if(year){year.value=state.reportYear;year.onchange=()=>{state.reportYear=year.value;updateReport()}}
  const month=$('#reportMonth');if(month){month.value=state.reportMonth;month.onchange=()=>{state.reportMonth=month.value;updateReport()}}
  const wh=$('#reportWarehouse');if(wh){wh.value=state.reportWarehouse;wh.onchange=()=>{state.reportWarehouse=wh.value;updateReport()}}
  const customer=$('#reportCustomer');if(customer){customer.value=state.reportCustomer;customer.onchange=()=>{state.reportCustomer=customer.value;updateReport()}}
  const productFilter=$('#reportProduct');if(productFilter){productFilter.value=state.reportProduct;productFilter.onchange=()=>{state.reportProduct=productFilter.value;updateReport()}}
  const vehicleFilter=$('#reportVehicle');if(vehicleFilter){vehicleFilter.value=state.reportVehicle;vehicleFilter.onchange=()=>{state.reportVehicle=vehicleFilter.value;updateReport()}}
  const tripStatus=$('#reportTripStatus');if(tripStatus){tripStatus.value=state.reportTripStatus;tripStatus.onchange=()=>{state.reportTripStatus=tripStatus.value;render()}}
  const countPeriod=$('#countPeriod');if(countPeriod){countPeriod.value=state.countPeriod;countPeriod.onchange=()=>{state.countPeriod=countPeriod.value;render()}}
  const movementWarehouse=$('#movementWarehouse');if(movementWarehouse){movementWarehouse.value=state.movementWarehouse;movementWarehouse.onchange=()=>{state.movementWarehouse=movementWarehouse.value;render()}}
  const movementProduct=$('#movementProduct');if(movementProduct){movementProduct.value=state.movementProduct;movementProduct.onchange=()=>{state.movementProduct=movementProduct.value;render()}}
  const movementType=$('#movementType');if(movementType){movementType.value=state.movementType;movementType.onchange=()=>{state.movementType=movementType.value;render()}}
  const movementFrom=$('#movementFrom');if(movementFrom){movementFrom.value=state.movementFrom;movementFrom.onchange=()=>{state.movementFrom=movementFrom.value;render()}}
  const movementTo=$('#movementTo');if(movementTo){movementTo.value=state.movementTo;movementTo.onchange=()=>{state.movementTo=movementTo.value;render()}}
  if(state.page==='repack')wireRepackPage();
  if(state.page==='stockadjust')wireStockAdjustmentPage();
}
const byId=(list,id)=>state.data[list]?.find(x=>x.id===id);
const customerName=id=>byId('customers',id)?.name||'-';const product=id=>byId('products',id)||{};const warehouse=id=>byId('warehouses',id)||{};
const orderLines=id=>state.data.orderLines.filter(x=>x.order_id===id);const tripLines=id=>state.data.tripLines.filter(x=>x.trip_id===id);const transferLine=id=>state.data.transferLines.find(x=>x.transfer_id===id);
const stockAvailable=(pid,wid)=>{const b=state.data.balances.find(x=>x.product_id===pid&&x.warehouse_id===wid);return Number(b?.on_hand||0)-Number(b?.allocated||0)};

const invoiceGross=i=>Number(i.revenue||0)-Number(i.product_cost||0);
const invoiceContribution=i=>invoiceGross(i)-Number(i.freight_cost||0)-Number(i.other_cost||0);
const contributionAlertThreshold=()=>Number(state.data.todayStatus?.contribution_threshold_pct??state.data.settings?.find(x=>x.setting_key==='contribution_alert_pct')?.setting_value??12);
const invoiceGp=invoiceContribution;
const compactMoney=n=>{const v=Number(n||0);return Math.abs(v)>=1000000?`฿${(v/1000000).toFixed(2)}m`:Math.abs(v)>=1000?`฿${(v/1000).toFixed(1)}k`:money(v)};
const invoiceOrderId=id=>state.data.invoiceOrders?.find(x=>x.invoice_id===id)?.order_id;
const invoiceTripId=id=>state.data.invoiceTrips?.find(x=>x.invoice_id===id)?.trip_id;
const tripInvoice=tripId=>{const link=state.data.invoiceTrips?.find(x=>x.trip_id===tripId);return link?byId('invoices',link.invoice_id):null};
function analyticsYears(){const current=new Date().getFullYear(),years=new Set([String(state.reportYear),...Array.from({length:11},(_,i)=>String(current-i)),...(state.data.invoices||[]).map(x=>String(new Date(x.invoice_date).getFullYear())).filter(x=>x!=='NaN')]);return [...years].sort((a,b)=>b-a)}
function countPeriods(){return [...new Set((state.data.counts||[]).map(x=>String(x.snapshot_at||'').slice(0,7)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))}
function countPeriodFilter(){return `<select id="countPeriod" aria-label="รอบเดือนตรวจนับ"><option value="ALL">ทุกรอบเดือน</option>${countPeriods().map(p=>`<option value="${p}">${new Intl.DateTimeFormat('th-TH-u-ca-gregory',{month:'long',year:'numeric'}).format(new Date(`${p}-01T00:00:00`))}</option>`).join('')}</select>`}
function monthMatches(value){const d=new Date(value);return state.reportMonth==='ALL'||String(d.getMonth()+1).padStart(2,'0')===state.reportMonth}
function analyticsInvoices(){return (state.data.invoices||[]).filter(i=>{const d=new Date(i.invoice_date),oid=invoiceOrderId(i.id),lines=oid?orderLines(oid):[],trip=byId('trips',invoiceTripId(i.id)),searchText=`${i.invoice_no} ${customerName(i.customer_id)} ${lines.map(l=>`${product(l.product_id).code||''} ${product(l.product_id).name||''}`).join(' ')} ${trip?.trip_no||''}`.toLowerCase();if(String(d.getFullYear())!==state.reportYear||!monthMatches(i.invoice_date))return false;if(state.reportCustomer!=='ALL'&&i.customer_id!==state.reportCustomer)return false;if(state.reportWarehouse!=='ALL'&&!lines.some(l=>l.warehouse_id===state.reportWarehouse))return false;if(state.reportProduct!=='ALL'&&!lines.some(l=>l.product_id===state.reportProduct))return false;return !state.search||searchText.includes(state.search)})}
function analyticsTrips(){return (state.data.trips||[]).filter(t=>{const o=byId('orders',t.order_id),lines=orderLines(t.order_id),inv=tripInvoice(t.id),searchText=`${t.trip_no} ${o?.order_no||''} ${customerName(o?.customer_id)} ${byId('vehicles',t.vehicle_id)?.plate_no||''} ${byId('drivers',t.driver_id)?.name||''} ${lines.map(l=>`${product(l.product_id).code||''} ${product(l.product_id).name||''}`).join(' ')}`.toLowerCase();if(String(new Date(t.planned_start).getFullYear())!==state.reportYear||!monthMatches(t.planned_start))return false;if(state.reportWarehouse!=='ALL'&&!lines.some(l=>l.warehouse_id===state.reportWarehouse))return false;if(state.reportProduct!=='ALL'&&!lines.some(l=>l.product_id===state.reportProduct))return false;if(state.reportVehicle!=='ALL'&&t.vehicle_id!==state.reportVehicle)return false;if(state.reportTripStatus!=='ALL'&&t.status!==state.reportTripStatus)return false;return !state.search||searchText.includes(state.search)})}
function analyticsBalances(){return (state.data.balances||[]).filter(b=>state.reportWarehouse==='ALL'||b.warehouse_id===state.reportWarehouse)}
function analyticsFilters({year=true,month=false,warehouse=true,customer=false,product=false,vehicle=false,status=false}={}){const months=Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,'0'),label:new Intl.DateTimeFormat('th-TH',{month:'long'}).format(new Date(2026,i,1))}));return `${year?`<select id="reportYear" aria-label="ปี">${analyticsYears().map(y=>`<option value="${y}">ปี ${y}</option>`).join('')}</select>`:''}${month?`<select id="reportMonth" aria-label="เดือน"><option value="ALL">ทุกเดือน</option>${months.map(m=>`<option value="${m.value}">${esc(m.label)}</option>`).join('')}</select>`:''}${warehouse?`<select id="reportWarehouse" aria-label="คลัง"><option value="ALL">ทุกคลัง</option>${state.data.warehouses.map(w=>`<option value="${w.id}">${esc(w.code)} • ${esc(w.name)}</option>`).join('')}</select>`:''}${customer?`<select id="reportCustomer" aria-label="ลูกค้า"><option value="ALL">ลูกค้าทั้งหมด</option>${state.data.customers.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.code)} • ${esc(x.name)}</option>`).join('')}</select>`:''}${product?`<select id="reportProduct" aria-label="สินค้า"><option value="ALL">สินค้าทั้งหมด</option>${state.data.products.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.code)} • ${esc(x.name)}</option>`).join('')}</select>`:''}${vehicle?`<select id="reportVehicle" aria-label="รถ"><option value="ALL">รถทั้งหมด</option>${state.data.vehicles.filter(x=>x.active!==false).map(x=>`<option value="${x.id}">${esc(x.code)} • ${esc(x.plate_no||'')}</option>`).join('')}</select>`:''}${status?`<select id="reportTripStatus" aria-label="สถานะเที่ยว"><option value="ALL">ทุกสถานะ</option><option value="COMPLETED">ส่งสำเร็จ</option><option value="PLANNED">วางแผน</option><option value="CANCELLED">ยกเลิก</option></select>`:''}`}
function monthlySeries(invoices=analyticsInvoices()){const months=Array.from({length:12},(_,i)=>({label:new Intl.DateTimeFormat('th-TH',{month:'short'}).format(new Date(2026,i,1)),sales:0,gp:0,count:0}));invoices.forEach(x=>{const m=new Date(x.invoice_date).getMonth();if(months[m]){months[m].sales+=Number(x.revenue||0);months[m].gp+=invoiceGp(x);months[m].count++}});return months}
function ownerChart(invoices=analyticsInvoices()){
  const saved=state.data.monthlySummaryKey===reportKey()?state.data.monthlySummary:null,
    series=saved?Array.from({length:12},(_,i)=>{const row=saved.find(x=>Number(x.month)===i+1)||{};return{label:new Intl.DateTimeFormat('th-TH',{month:'short'}).format(new Date(2026,i,1)),sales:Number(row.sales||0),gp:Number(row.gp||0),count:Number(row.count||0)}}):monthlySeries(invoices),
    maxSales=Math.max(1,...series.map(x=>Math.max(0,x.sales))),maxGp=Math.max(1,...series.map(x=>Math.max(0,x.gp))),
    left=50,right=700,top=30,bottom=220,h=190,step=(right-left)/12,barW=32;
  const grid=[0,.25,.5,.75,1].map(r=>{const y=bottom-r*h;return '<line x1="'+left+'" y1="'+y+'" x2="'+right+'" y2="'+y+'" class="combo-grid"/><text x="44" y="'+(y+4)+'" text-anchor="end" class="combo-axis">'+esc(compactMoney(maxSales*r))+'</text>'}).join('');
  const bars=series.map((x,i)=>{const cx=left+step*i+step/2,bh=Math.max(2,Math.max(0,x.sales)/maxSales*h),y=bottom-bh;return '<g><rect x="'+(cx-barW/2)+'" y="'+y+'" width="'+barW+'" height="'+bh+'" rx="6" class="combo-sales-bar"><title>'+esc(x.label)+' • Sales '+money(x.sales)+'</title></rect><text x="'+cx+'" y="244" text-anchor="middle" class="combo-month">'+esc(x.label)+'</text></g>'}).join('');
  const points=series.map((x,i)=>{const cx=left+step*i+step/2,py=bottom-(Math.max(0,x.gp)/maxGp*h);return cx+','+py}).join(' ');
  const dots=series.map((x,i)=>{const cx=left+step*i+step/2,py=bottom-(Math.max(0,x.gp)/maxGp*h);return '<circle cx="'+cx+'" cy="'+py+'" r="4.5" class="combo-profit-dot"><title>'+esc(x.label)+' • Contribution '+money(x.gp)+'</title></circle>'}).join('');
  const totalSales=series.reduce((a,x)=>a+x.sales,0),totalGp=series.reduce((a,x)=>a+x.gp,0),pct=totalSales?totalGp/totalSales*100:0;
  return '<div class="panel executive-combined-chart"><div class="section-title combo-head"><div><h3>แนวโน้มยอดขายและกำไร</h3><span class="muted">Sales + Contribution Profit • ข้อมูล Invoice จริง • '+esc(state.reportYear)+'</span></div><div class="combo-summary"><span><small>ยอดขายสะสม</small><b>'+compactMoney(totalSales)+'</b></span><span><small>กำไรสะสม</small><b>'+compactMoney(totalGp)+'</b></span><span><small>% กำไร</small><b>'+pct.toFixed(1)+'%</b></span></div></div><div class="chart-legend"><b>● ยอดขาย (Sales)</b><span>● กำไร (Contribution Profit)</span></div><div class="combo-svg-wrap"><svg viewBox="0 0 740 260" role="img" aria-label="แนวโน้มยอดขายและกำไร">'+grid+bars+'<polyline points="'+points+'" class="combo-profit-line"/>'+dots+'</svg></div></div>';
}
function customerProfitRows(invoices=analyticsInvoices()){const map=new Map();invoices.forEach(i=>{const k=i.customer_id,r=map.get(k)||{sales:0,gp:0,count:0};r.sales+=Number(i.revenue||0);r.gp+=invoiceGp(i);r.count++;map.set(k,r)});return [...map].map(([id,v])=>({id,name:customerName(id),...v,pct:v.sales?v.gp/v.sales*100:0})).sort((a,b)=>b.gp-a.gp)}
function lowStockRows(){
  const policy=minimumStockPolicy();
  const activeProducts=(state.data.products||[]).filter(p=>p.active!==false);
  if(policy==='BY_WAREHOUSE'){
    const balanceMap=new Map((state.data.balances||[]).map(b=>[`${b.product_id}|${b.warehouse_id}`,Number(b.on_hand||0)]));
    return activeProducts.flatMap(p=>(state.data.warehouses||[]).filter(w=>w.active!==false).map(w=>{
      const minimum=effectiveWarehouseMinimum(p.id,w.id),onHand=Number(balanceMap.get(`${p.id}|${w.id}`)||0);
      return {key:`${p.id}|${w.id}`,id:p.id,product_id:p.id,warehouse_id:w.id,warehouse_code:w.code,warehouse_name:w.name,code:p.code,name:p.name,uom:p.base_uom||'',minimum,onHand,scope:'BY_WAREHOUSE'};
    })).filter(x=>x.minimum>0&&x.onHand<x.minimum).sort((a,b)=>(a.onHand-a.minimum)-(b.onHand-b.minimum));
  }
  const totals=new Map();
  (state.data.balances||[]).forEach(b=>totals.set(b.product_id,(totals.get(b.product_id)||0)+Number(b.on_hand||0)));
  return activeProducts.filter(p=>Number(p.minimum_stock||0)>0).map(p=>({key:p.id,id:p.id,product_id:p.id,warehouse_id:null,warehouse_code:'',warehouse_name:'',code:p.code,name:p.name,uom:p.base_uom||'',minimum:Number(p.minimum_stock||0),onHand:Number(totals.get(p.id)||0),scope:'TOTAL'})).filter(x=>x.onHand<x.minimum).sort((a,b)=>(a.onHand-a.minimum)-(b.onHand-b.minimum));
}
function executiveRankTable(rows,labelTitle){
  const list=(rows||[]).slice(0,5),max=Math.max(1,...list.map(x=>Number(x.sales||0)));
  if(!list.length)return empty();
  return '<div class="executive-rank-table"><div class="rank-head"><span>อันดับ</span><span>'+esc(labelTitle)+'</span><span>ยอดขาย</span><span>% กำไร</span></div>'+list.map((x,i)=>'<div class="rank-row"><span class="rank-no">'+(i+1)+'</span><span class="rank-name">'+esc(x.name||'-')+'<i><em style="width:'+Math.max(4,Math.round(Number(x.sales||0)/max*100))+'%"></em></i></span><span class="rank-sales">'+money(x.sales||0)+'</span><span class="rank-profit '+(Number(x.pct||0)<contributionAlertThreshold()?'low':'')+'">'+Number(x.pct||0).toFixed(1)+'%</span></div>').join('')+'</div>';
}
function productSalesRows(invoices=analyticsInvoices()){const allowed=new Set(invoices.map(i=>invoiceOrderId(i.id)).filter(Boolean)),map=new Map();state.data.orderLines.filter(l=>allowed.has(l.order_id)).forEach(l=>{const p=product(l.product_id),group=byId('productGroups',p.group_id),key=group?.name||String(p.code||'อื่น').slice(0,3)||'อื่น',v=map.get(key)||0;map.set(key,v+Number(l.qty||0)*Number(l.unit_price||0))});return [...map].map(([name,sales])=>({name,sales})).sort((a,b)=>b.sales-a.sales)}
function metricBars(rows,valueKey,labelKey){const max=Math.max(1,...rows.map(x=>Math.abs(x[valueKey])));return `<div class="metric-list">${rows.slice(0,5).map(x=>`<div class="metric-line"><span>${esc(x[labelKey])}</span><b>${compactMoney(x[valueKey])}</b><div class="progress"><span style="width:${Math.max(3,Math.round(Math.abs(x[valueKey])/max*100))}%"></span></div></div>`).join('')||empty()}</div>`}

function todayPanel(){
  const t=state.data.todayStatus;
  if(!t)return '<div class="panel"><h3>งานและยอดขายวันนี้</h3><p class="muted">กำลังโหลดข้อมูลวันนี้จากฐานข้อมูล</p></div>';
  const k=getReportKpis(),periodLow=Number(k?.finances?.low_contribution||0),threshold=Number(k?.finances?.contribution_threshold_pct??t.contribution_threshold_pct??12);
  const followUp=[
    [Number(t.waiting_logistics),'Orders ค้างจัดรถ (ทุกวันที่ยังเปิดอยู่)','delivery'],
    [Number(t.late_trips),'เที่ยวส่งเกินกำหนดและยังไม่ปิดงาน','delivery'],
    [Number(t.stockout_rows),'รายการ Stock หมดหรือติดศูนย์ (ทุกคลัง)','stockhealth'],
    [periodLow,`Invoice ช่วงที่เลือกมี Contribution ต่ำกว่า ${nf.format(threshold)}%`,'lowContributionPeriod'],
    [Number(t.future_completed_trips),'เที่ยวส่งวันนี้สถานะปิดงาน แต่เวลาเสร็จอยู่ในอนาคต',null]
  ].filter(([count])=>count>0);
  return `<div class="panel"><h3>งานและยอดขายวันนี้ • ${dmy(t.date)}</h3><p class="muted">ข้อมูลทั้งบริษัทตามเวลาไทย • ไม่เปลี่ยนตามตัวกรองปี/เดือนของรายงานด้านบน</p>${cards([['Orders วันนี้',nf.format(t.orders),'วันที่ของ Order'],['Invoice วันนี้',nf.format(t.invoices),'วันที่ของ Invoice'],['ยอดขายวันนี้',money(t.revenue),'จาก Invoice วันนี้'],['เที่ยวส่งวันนี้',`${nf.format(t.completed_trips)} / ${nf.format(t.trips)}`,'สถานะปิดงาน / กำหนดส่ง']])}<h3>งานค้างและรายการที่ต้องตรวจ</h3>${followUp.length?followUp.map(([count,label,page])=>`<div class="analytics-alert"><strong>${nf.format(count)} ${esc(label)}</strong>${page?`<button class="btn small-btn" ${page==='lowContributionPeriod'?'data-action="openLowContributionPeriod"':page==='lowContribution'?'data-action="openLowContribution"':`data-go="${page}"`}>${page==='lowContributionPeriod'||page==='lowContribution'?'เปิด Invoice':'เปิดรายการ'}</button>`:''}</div>`).join(''):'<p class="muted">ไม่มีงานค้างหรือรายการเตือนตามเงื่อนไขที่กำหนด</p>'}</div>`;
}

function dashboardPage(){
  const k=getReportKpis(),invoices=analyticsInvoices(),fin=k?.finances||{},pipe=k?.pipeline||{},log=k?.logistics||{};
  const sales=k?Number(fin.revenue):invoices.reduce((s,i)=>s+Number(i.revenue||0),0);
  const productCost=k?Number(fin.product_cost):invoices.reduce((s,i)=>s+Number(i.product_cost||0),0);
  const contribution=k?sales-productCost-Number(fin.freight_cost)-Number(fin.other_cost):invoices.reduce((s,i)=>s+invoiceContribution(i),0);
  const gross=sales-productCost,open=k?Number(pipe.open_orders):state.data.orders.filter(x=>!['DELIVERED','CANCELLED'].includes(x.status)).length;
  const stock=state.data.balances.reduce((s,x)=>s+Number(x.on_hand||0),0);
  const recent=state.data.orders.slice(0,8).map(o=>`<tr><td><b>${esc(o.order_no)}</b></td><td>${esc(customerName(o.customer_id))}</td><td>${dmy(o.order_date)}</td><td>${badge(o.status)}</td><td class="num">${qty(orderLines(o.id).reduce((s,l)=>s+Number(l.qty),0))}</td></tr>`);
  if(can('ADMIN')&&state.page==='dashboard')return head('Admin Control Center','ควบคุมข้อมูล ผู้ใช้ และการตั้งค่าระบบ',analyticsFilters({month:true,warehouse:false}))+cards([['Orders วันนี้',state.data.todayStatus?nf.format(state.data.todayStatus.orders):'…','รายการ'],['คลังสินค้า',nf.format(state.data.warehouses.length),'คลัง'],['Users',nf.format(state.data.users.length),'บัญชี'],['Invoices',nf.format(k?Number(fin.invoices):invoices.length),'ในช่วงที่เลือก']])+todayPanel()+`<div class="panel"><h3>ทางลัด Admin</h3><div class="tabs"><button class="tab-pill" data-go="masters">Master Data</button><button class="tab-pill" data-go="settings">Business Rules</button><button class="tab-pill" data-go="reports">Reports</button><button class="tab-pill" data-go="executive">Executive Dashboard</button>${state.isPlatformAdmin?'<button class="tab-pill" data-go="commercial">Commercial Control</button>':''}</div></div><div class="panel"><h3>Orders ล่าสุด</h3>${table(['Order','ลูกค้า','วันที่','สถานะ','จำนวน'],recent)}</div>`;
  if(!can('OWNER')&&state.page!=='executive')return head('ภาพรวมธุรกิจ','ยอดขายตามช่วงที่เลือก',analyticsFilters({month:true,warehouse:false}))+cards([['Sales',money(sales),'จาก Invoice'],['Contribution Profit',money(contribution),sales?`Contribution ${(contribution/sales*100).toFixed(2)}%`:''],['Open Orders',nf.format(open),'รายการที่ยังไม่ปิด'],['Stock On Hand',qty(stock),'ทุกคลัง']])+`<div class="panel"><h3>Orders ล่าสุด</h3>${table(['Order','ลูกค้า','วันที่','สถานะ','จำนวน'],recent)}</div>`;
  const balances=analyticsBalances(),stockValue=balances.reduce((s,b)=>{const costs=state.data.costs.filter(c=>c.product_id===b.product_id).sort((a,z)=>String(z.cost_month).localeCompare(String(a.cost_month)));return s+Number(b.on_hand||0)*Number(costs[0]?.unit_cost||0)},0),lowStock=lowStockRows();
  const customerRows=(state.data.customerSummaryKey===reportKey()?state.data.customerSummary||[]:[]).map(x=>{const cp=Number(x.revenue||0)-Number(x.product_cost||0)-Number(x.freight_cost||0)-Number(x.other_cost||0);return{name:x.name,sales:Number(x.revenue||0),pct:Number(x.revenue||0)?cp/Number(x.revenue||0)*100:0}}).sort((a,b)=>b.sales-a.sales);
  const groupRows=profitBreakdown('group',invoices).map(x=>({name:x.label,sales:x.sales,pct:x.pct})).sort((a,b)=>b.sales-a.sales);
  const attentionCount=Number(fin.low_contribution||0);
  return head('ภาพรวมธุรกิจ','ข้อมูล Invoice ตามช่วงที่เลือก',analyticsFilters({month:true,customer:true}))+cards([['ยอดขาย',compactMoney(sales),`ปี ${state.reportYear}`],['Gross Profit',compactMoney(gross),'Sales − Product Cost'],['GP Margin %',sales?(gross/sales*100).toFixed(2)+'%':'0.00%','Gross Profit ÷ Sales'],['Contribution Profit',compactMoney(contribution),Number(fin.estimated||0)?'มีรายการ Estimated':'Final'],['Contribution %',sales?(contribution/sales*100).toFixed(2)+'%':'0.00%','จาก Invoice'],['Stock Value',compactMoney(stockValue),state.reportWarehouse==='ALL'?`${state.data.warehouses.length} คลัง`:'คลังที่เลือก']])+
    '<div class="executive-primary-grid">'+ownerChart(invoices)+'<div class="panel executive-attention"><div class="section-title"><div><h3>รายการที่ต้องดูแลเป็นพิเศษ</h3><span class="muted">กดเพื่อเปิดรายการต้นเหตุ</span></div></div>'+
    '<div class="analytics-alert critical"><div><strong>Invoice ต่ำกว่าเกณฑ์ Contribution</strong><small>'+nf.format(attentionCount)+' รายการ</small></div><button class="btn small-btn" data-action="openLowContributionPeriod">ดูรายละเอียด</button></div>'+
    '<div class="analytics-alert"><div><strong>Open Orders ต้องติดตาม</strong><small>'+nf.format(open)+' รายการ</small></div><button class="btn small-btn" data-go="orders">ดูรายละเอียด</button></div>'+
    '<div class="analytics-alert"><div><strong>เที่ยวล่าช้า</strong><small>'+nf.format(Number(log.late||0))+' เที่ยว</small></div><button class="btn small-btn" data-go="deliveryperformance">ดูรายละเอียด</button></div>'+
    '<div class="analytics-alert stock-alert"><div><strong>Stock ต่ำกว่า Minimum</strong><small>'+nf.format(lowStock.length)+' '+(minimumStockPolicy()==='BY_WAREHOUSE'?'สินค้า/คลัง':'สินค้า')+'</small></div><button class="btn small-btn" data-action="openLowStock">ดูรายละเอียด</button></div></div></div>'+
    '<div class="executive-ranking-grid"><div class="panel"><div class="section-title"><div><h3>Top ลูกค้าตามยอดขายและ % กำไร</h3><span class="muted">% กำไร = Contribution %</span></div></div>'+executiveRankTable(customerRows,'ลูกค้า')+'</div><div class="panel"><div class="section-title"><div><h3>Top กลุ่มสินค้าตามยอดขายและ % กำไร</h3><span class="muted">ใช้สูตร Allocation เดิมของระบบ</span></div></div>'+executiveRankTable(groupRows,'กลุ่มสินค้า')+'</div></div>';
}
function ordersPage(){
  const q=state.search,rows=state.data.orders.filter(o=>`${o.order_no} ${customerName(o.customer_id)} ${o.status}`.toLowerCase().includes(q)).map(o=>{const ls=orderLines(o.id),amount=ls.reduce((s,l)=>s+Number(l.qty)*Number(l.unit_price),0);return `<tr><td><b>${esc(o.order_no)}</b></td><td>${esc(customerName(o.customer_id))}</td><td>${dmy(o.order_date)}</td><td>${badge(o.status)}</td><td class="num" data-sort="${amount}">${money(amount)}</td><td><button class="btn small-btn" data-action="viewOrder" data-id="${o.id}">เปิด</button></td></tr>`});
  return head('Orders','สร้างและติดตามคำสั่งขาย',`${can('SALES','ADMIN')?'<button class="btn primary" data-action="newOrder">+ สร้าง Order</button>':''}<button class="btn" data-action="exportOrders">ดาวน์โหลด CSV</button>`)+`<div class="toolbar"><input id="pageSearch" placeholder="ค้นหา Order / ลูกค้า / สถานะ"></div><div class="panel">${table(['Order','ลูกค้า','วันที่','สถานะ','มูลค่า',''],rows)}</div>`;
}
function customersPage(){const rows=state.data.customers.filter(x=>`${x.code} ${x.name} ${x.region}`.toLowerCase().includes(state.search)).map(x=>`<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${esc(x.region||'-')}</td><td>${x.active?badge('ACTIVE'):badge('INACTIVE')}</td></tr>`);return head('ลูกค้า','ข้อมูลลูกค้าในบริษัท')+`<div class="toolbar"><input id="pageSearch" placeholder="ค้นหาลูกค้า"></div><div class="panel">${table(['รหัส','ชื่อลูกค้า','ภูมิภาค','สถานะ'],rows)}</div>`}
function warehousePage(){
  const k=getReportKpis(),pipe=k?.pipeline||{};
  const jobs=state.data.orders.filter(o=>['CONFIRMED','PARTIAL_ISSUE'].includes(o.status)).map(o=>{const ls=orderLines(o.id),rem=ls.reduce((s,l)=>s+Number(l.qty)-Number(l.issued_qty||0),0);return `<tr><td><b>${esc(o.order_no)}</b></td><td>${esc(customerName(o.customer_id))}</td><td class="num">${qty(rem)}</td><td>${badge(o.status)}</td><td><button class="btn primary small-btn" data-action="issueOrder" data-id="${o.id}">จ่ายสินค้า</button></td></tr>`});
  const rec=state.data.receipts.slice(0,8).map(r=>`<tr><td><b>${esc(r.gr_no)}</b></td><td>${esc(warehouse(r.warehouse_id).code)}</td><td>${esc(r.source_doc_no||'-')}</td><td>${dmy(r.receipt_date)}</td><td>${badge(r.status)}</td></tr>`);
  const conv=(state.data.conversions||[]).slice(0,8).map(c=>{const lines=(state.data.conversionLines||[]).filter(l=>l.conversion_id===c.id),summary=lines.slice(0,2).map(l=>`${product(l.from_product_id).code||'-'} → ${product(l.to_product_id).code||'-'}`).join(', ')+(lines.length>2?` +${lines.length-2}`:'');return `<tr><td><b>${esc(c.conversion_no)}</b></td><td>${dmy(c.conversion_date)}</td><td>${esc(warehouse(c.warehouse_id).code||'-')}</td><td>${esc(summary||'-')}</td><td>${badge(c.status)}</td><td><button class="btn small-btn" data-action="viewConversion" data-id="${c.id}">เปิด</button></td></tr>`});
  return head('งานคลัง','รับเข้า จ่ายออก และตรวจสอบงานค้าง','<button class="btn primary" data-action="newReceipt">+ รับสินค้า</button>')+
    cards([['รอจ่าย',nf.format(k?pipe.pending_issue:jobs.length),'Orders'],['รับเข้าวันนี้',nf.format(k?pipe.receipts_today:state.data.receipts.filter(x=>x.receipt_date===new Date().toISOString().slice(0,10)).length),'เอกสาร'],['Stock รวม',qty(state.data.balances.reduce((s,x)=>s+Number(x.on_hand),0)),'ทุกคลัง'],['Conversion ล่าสุด',nf.format((state.data.conversions||[]).filter(x=>x.status==='POSTED').length),'รายการที่ยังไม่ Reverse']])+
    `<div class="split"><div class="panel"><h3>งานรอจ่าย (รายการล่าสุด)</h3>${table(['Order','ลูกค้า','คงเหลือต้องจ่าย','สถานะ',''],jobs)}</div><div class="panel"><h3>รับสินค้าล่าสุด</h3>${table(['GR','คลัง','เอกสารอ้างอิง','วันที่','สถานะ'],rec)}</div></div>
    <div class="panel"><div class="section-title"><div><h3>Repack / Stock Conversion ล่าสุด</h3><span class="muted">เปลี่ยนรหัสสินค้าในคลังเดียวกัน เช่น Tank → Drum โดยสร้าง OUT/IN คู่กันและเก็บ Audit</span></div><button class="btn primary small-btn" data-go="repack">เปิด Repack</button></div>${table(['เลขที่','วันที่','คลัง','รายการ','สถานะ',''],conv,'conversion-table')}</div>`;
}
const movementTypeThai={RECEIPT:'รับเข้า',OPENING_BALANCE:'ยอดยกมา',TRANSFER_OUT:'โอนออก',TRANSFER_IN:'โอนเข้า',ORDER_ISSUE:'จ่ายตาม Order',ISSUE:'จ่ายออก',COUNT_ADJUSTMENT:'ปรับจากตรวจนับ',MANUAL_ADJUSTMENT:'ปรับ Stock',MANUAL_ADJUSTMENT_REVERSAL:'Reverse ปรับ Stock',CONVERSION_OUT:'Repack ออก',CONVERSION_IN:'Repack เข้า',CONVERSION_REVERSE_OUT:'Reverse Repack ออก',CONVERSION_REVERSE_IN:'Reverse Repack เข้า'};
const movementDirection=m=>Number(m.qty)>=0?'IN':'OUT';
function movementRows(){
  const latestBalance=new Map((state.data.balances||[]).map(b=>[`${b.product_id}|${b.warehouse_id}`,Number(b.on_hand||0)]));
  const desc=[...(state.data.movements||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
  const running=new Map(latestBalance);
  const withBalance=desc.map(m=>{
    const key=`${m.product_id}|${m.warehouse_id}`,after=Number(running.get(key)||0),qtyValue=Number(m.qty||0);
    running.set(key,after-qtyValue);
    return {...m,balance_after:after};
  });
  return withBalance.filter(m=>{
    const p=product(m.product_id),w=warehouse(m.warehouse_id),q=`${p.code||''} ${p.name||''} ${w.code||''} ${w.name||''} ${m.reference_no||''} ${movementTypeThai[m.movement_type]||m.movement_type}`.toLowerCase();
    const day=String(m.created_at||'').slice(0,10),dir=movementDirection(m);
    return (!state.search||q.includes(state.search))&&(state.movementWarehouse==='ALL'||m.warehouse_id===state.movementWarehouse)&&(state.movementProduct==='ALL'||m.product_id===state.movementProduct)&&(state.movementType==='ALL'||(state.movementType==='IN'?dir==='IN':state.movementType==='OUT'?dir==='OUT':m.movement_type===state.movementType))&&(!state.movementFrom||day>=state.movementFrom)&&(!state.movementTo||day<=state.movementTo);
  });
}
function aggregateStockBalances(balances){const map=new Map();balances.forEach(b=>{const row=map.get(b.product_id)||{product_id:b.product_id,on_hand:0,allocated:0};row.on_hand+=Number(b.on_hand||0);row.allocated+=Number(b.allocated||0);map.set(b.product_id,row)});return [...map.values()]}
function stockPage(){
  const policy=minimumStockPolicy(),byWarehouse=policy==='BY_WAREHOUSE',lowRows=lowStockRows(),
    lowKeys=new Set(lowRows.map(x=>x.key)),lowProducts=new Set(lowRows.map(x=>x.product_id)),onlyLow=Boolean(state.stockBelowMin);
  const pairKey=(pid,wid)=>`${pid}|${wid}`;
  const missingLowBalances=byWarehouse&&onlyLow?lowRows.filter(x=>!(state.data.balances||[]).some(b=>b.product_id===x.product_id&&b.warehouse_id===x.warehouse_id)).map(x=>({product_id:x.product_id,warehouse_id:x.warehouse_id,on_hand:0,allocated:0,_virtual:true})):[];
  const allBalanceRows=[...(state.data.balances||[]),...missingLowBalances];

  if(can('OWNER')){
    const summary=state.stockView==='TOTAL',
      raw=allBalanceRows.filter(b=>(summary||state.reportWarehouse==='ALL'||b.warehouse_id===state.reportWarehouse)&&`${product(b.product_id).code} ${product(b.product_id).name} ${warehouse(b.warehouse_id).code} ${warehouse(b.warehouse_id).name}`.toLowerCase().includes(state.search)),
      source=onlyLow?raw.filter(b=>summary?lowProducts.has(b.product_id):(byWarehouse?lowKeys.has(pairKey(b.product_id,b.warehouse_id)):lowProducts.has(b.product_id))):raw,
      balances=summary?aggregateStockBalances(source):source,
      totalOnHand=balances.reduce((a,b)=>a+Number(b.on_hand||0),0),
      totalAllocated=balances.reduce((a,b)=>a+Number(b.allocated||0),0);

    const rows=balances.map(b=>{
      const p=product(b.product_id),w=summary?null:warehouse(b.warehouse_id),available=Number(b.on_hand||0)-Number(b.allocated||0);
      const min=summary?(byWarehouse?null:Number(p.minimum_stock||0)):(byWarehouse?effectiveWarehouseMinimum(b.product_id,b.warehouse_id):Number(p.minimum_stock||0));
      const low=summary?lowProducts.has(b.product_id):(byWarehouse?lowKeys.has(pairKey(b.product_id,b.warehouse_id)):lowProducts.has(b.product_id));
      const minText=summary&&byWarehouse?'<span class="muted">แยกตามคลัง</span>':!summary&&!byWarehouse&&min>0?'<span title="Policy รวมทุกคลัง">รวม '+qty(min)+'</span>':min>0?qty(min):'-';
      const status=low?'<span class="badge danger">ต่ำกว่า Min</span>':min==null?'<span class="muted">ดูรายคลัง</span>':min>0?'<span class="badge ok">ปกติ</span>':'<span class="muted">ไม่กำหนด</span>';
      return `<tr class="${low?'stock-low-row':''}"><td class="product-cell"><b>${esc(p.code||'-')}</b><span>${esc(p.name||'')}</span></td>${summary?'':`<td><b>${esc(w.code||'-')}</b><span class="cell-sub">${esc(w.name||'')}</span></td>`}<td class="num">${qty(b.on_hand)}</td><td class="num">${minText}</td><td class="num">${qty(b.allocated)}</td><td class="num"><b>${qty(available)}</b></td><td>${status}</td><td>${esc(p.base_uom||'-')}</td></tr>`;
    });

    const warehouseFilter=summary?'':`<select id="reportWarehouse" aria-label="เลือกคลัง"><option value="ALL">ทุกคลัง (แสดงแยกรายคลัง)</option>${state.data.warehouses.map(w=>`<option value="${w.id}">${esc(w.code)} • ${esc(w.name)}</option>`).join('')}</select>`;
    const toolbar=`<div class="toolbar stock-toolbar"><div class="tabs stock-view-tabs"><button type="button" class="tab-pill ${summary?'active':''}" data-stock-view="TOTAL">รวมทุกคลัง</button><button type="button" class="tab-pill ${summary?'':'active'}" data-stock-view="BY_WAREHOUSE">แยกตามคลัง</button></div>${warehouseFilter}<label class="stock-min-filter"><input id="stockBelowMin" type="checkbox" ${onlyLow?'checked':''}> แสดงเฉพาะ Stock ต่ำกว่า Min</label><input id="pageSearch" placeholder="ค้นหาสินค้า / คลัง"></div>`;
    const minHint=byWarehouse?'Policy BY WAREHOUSE • Minimum ใช้ค่ารายคลัง และช่องที่ไม่ได้ตั้งใช้ Default จาก Product Master':'Policy TOTAL • รวม Stock ทุกคลังแล้วเทียบ Minimum จาก Product Master';
    const sub=onlyLow?(byWarehouse?'แสดงสินค้า/คลังที่ต่ำกว่า Minimum Stock':'แสดงสินค้าที่ Stock รวมต่ำกว่า Minimum Stock'):summary?'ยอดรวมสินค้าเดียวกันจากทุกคลัง':'ยอดสินค้าแยกตามคลังที่เลือก';
    return head('Stock คงเหลือ',sub,`<button class="btn" data-go="stockhealth">← Stock Summary</button><button class="btn" data-action="exportStock">ดาวน์โหลด Stock</button>`)+toolbar+cards([['On Hand',qty(totalOnHand),summary?'รวมทุกคลัง':'ตามรายการที่เลือก'],['Allocated',qty(totalAllocated),'ยอดจัดสรร'],['Available',qty(totalOnHand-totalAllocated),'พร้อมใช้'],['Stock ต่ำกว่า Min',nf.format(lowRows.length),byWarehouse?'สินค้า/คลัง':'สินค้า']])+`<div class="panel"><div class="section-title"><h3>${summary?'ยอดรวมทุกคลัง':'ยอดแยกตามคลัง'}</h3><span class="muted">${esc(minHint)}</span></div>${table(summary?['สินค้า','On Hand','Minimum','Allocated','Available','สถานะ','UoM']:['สินค้า','คลัง','On Hand','Minimum','Allocated','Available','สถานะ','UoM'],rows,'stock-balance-table')}</div>`;
  }

  const minimumSetupWarning=byWarehouse&&!(state.data.warehouseMinimums||[]).length?'<div class="alert warn"><b>ยังไม่ได้ตั้ง Minimum Stock รายคลัง</b> • ตอนนี้ Product Master ก็เป็น 0 จึงแสดง Minimum เป็น “-” • ให้ Admin เข้า System Setup → Minimum Stock Policy → โหลด CSV ที่กรอกคอลัมน์ minimum_stock แล้ว</div>':'';
  const filtered=allBalanceRows.filter(b=>`${product(b.product_id).code} ${product(b.product_id).name} ${warehouse(b.warehouse_id).code} ${warehouse(b.warehouse_id).name}`.toLowerCase().includes(state.search)).filter(b=>!onlyLow||(byWarehouse?lowKeys.has(pairKey(b.product_id,b.warehouse_id)):lowProducts.has(b.product_id)));
  const rows=filtered.map(b=>{
    const p=product(b.product_id),w=warehouse(b.warehouse_id),avail=Number(b.on_hand||0)-Number(b.allocated||0),
      min=byWarehouse?effectiveWarehouseMinimum(b.product_id,b.warehouse_id):Number(p.minimum_stock||0),
      low=byWarehouse?lowKeys.has(pairKey(b.product_id,b.warehouse_id)):lowProducts.has(b.product_id),
      minText=!byWarehouse&&min>0?'รวม '+qty(min):min>0?qty(min):'-';
    return `<tr class="${low?'stock-low-row':''}"><td><b>${esc(p.code)}</b> ${esc(p.name)}</td><td>${esc(w.code)} ${esc(w.name)}</td><td class="num">${qty(b.on_hand)}</td><td class="num">${minText}</td><td class="num">${qty(b.allocated)}</td><td class="num"><b>${qty(avail)}</b></td><td>${low?'<span class="badge danger">ต่ำกว่า Min</span>':min>0?'<span class="badge ok">ปกติ</span>':'<span class="muted">ไม่กำหนด</span>'}</td><td>${esc(p.base_uom||'')}</td></tr>`;
  });
  const moves=movementRows().slice(0,500).map(m=>{const p=product(m.product_id),w=warehouse(m.warehouse_id),inQty=Number(m.qty)>0?Number(m.qty):0,outQty=Number(m.qty)<0?Math.abs(Number(m.qty)):0;return `<tr><td>${dmy(m.created_at)}</td><td><b>${esc(p.code)}</b> ${esc(p.name||'')}</td><td>${esc(w.code)}</td><td>${esc(movementTypeThai[m.movement_type]||m.movement_type)}</td><td>${esc(m.reference_no||'-')}</td><td class="num positive">${inQty?qty(inQty):'-'}</td><td class="num negative">${outQty?qty(outQty):'-'}</td><td class="num"><b>${qty(m.balance_after)}</b></td></tr>`});
  const typeOpts=['ALL','IN','OUT',...Object.keys(movementTypeThai)].map(x=>`<option value="${x}">${x==='ALL'?'ทุกประเภท':x==='IN'?'เข้า':x==='OUT'?'ออก':movementTypeThai[x]}</option>`).join('');
  const minHint=byWarehouse?'BY WAREHOUSE — เทียบ Min ของคลังนั้นโดยตรง':'TOTAL — สถานะ Min ใช้ Stock รวมทุกคลัง';
  return head('Stock','ยอดคงเหลือและ Stock Movement',`<button class="btn" data-action="exportStock">ดาวน์โหลด Stock</button><button class="btn" data-action="exportMovements">Export Movement</button><button class="btn" data-action="emailStockReport">ส่งรายงาน</button>`)+`<div class="alert"><b>Minimum Stock: ${esc(policy)}</b> • ${esc(minHint)}</div>`+minimumSetupWarning+`<div class="toolbar"><label class="stock-min-filter"><input id="stockBelowMin" type="checkbox" ${onlyLow?'checked':''}> แสดงเฉพาะ Stock ต่ำกว่า Min</label><input id="pageSearch" placeholder="ค้นหาสินค้า / คลัง / เอกสาร"></div><div class="panel"><h3>ยอดคงเหลือ</h3>${table(['สินค้า','คลัง','On Hand','Minimum','Allocated','Available','สถานะ','UoM'],rows,'stock-balance-table')}</div><div class="panel"><div class="page-head"><div><h3>Stock Movement</h3><p>ยอดเข้า / ออก / คงเหลือหลังรายการ</p></div></div><div class="toolbar"><select id="movementWarehouse"><option value="ALL">ทุกคลัง</option>${option('warehouses',x=>`${x.code} • ${x.name}`)}</select><select id="movementProduct"><option value="ALL">ทุกสินค้า</option>${option('products',x=>`${x.code} • ${x.name}`)}</select><select id="movementType">${typeOpts}</select><label class="date-filter">ตั้งแต่ <input id="movementFrom" type="date"></label><label class="date-filter">ถึง <input id="movementTo" type="date"></label><button class="btn small-btn" type="button" data-action="resetStockFilters">ล้างตัวกรอง</button></div>${table(['วันที่','สินค้า','คลัง','ประเภท','อ้างอิง','In','Out','คงเหลือ'],moves,'movement-table')}</div>`;
}
function countVariance(c){return state.data.countLines.filter(x=>x.count_id===c.id).reduce((s,x)=>s+(x.count_qty==null?0:Number(x.count_qty)-Number(x.book_qty||0)),0)}
function countsPage(){
  const owner=can('OWNER');
  const counts=(state.data.counts||[]).filter(c=>{
    const whOk=state.reportWarehouse==='ALL'||c.warehouse_id===state.reportWarehouse;
    const periodOk=state.countPeriod==='ALL'||String(c.snapshot_at||'').slice(0,7)===state.countPeriod;
    return whOk&&periodOk;
  });
  const allLines=counts.flatMap(c=>state.data.countLines.filter(x=>x.count_id===c.id));
  const countedLines=allLines.filter(x=>x.count_qty!=null);
  const shortage=countedLines.filter(x=>Number(x.count_qty)<Number(x.book_qty||0)).length;
  const excess=countedLines.filter(x=>Number(x.count_qty)>Number(x.book_qty||0)).length;
  const netVariance=countedLines.reduce((sum,x)=>sum+Number(x.count_qty)-Number(x.book_qty||0),0);
  const rows=counts.map(c=>{
    const ls=state.data.countLines.filter(x=>x.count_id===c.id);
    const complete=ls.length>0&&ls.every(x=>x.count_qty!=null);
    const book=ls.reduce((sum,x)=>sum+Number(x.book_qty||0),0);
    const actual=complete?ls.reduce((sum,x)=>sum+Number(x.count_qty||0),0):null;
    const variance=complete?actual-book:null;
    const policy=c.adjustment_policy||'AUTO_ADJUST';
    let action='<button class="btn small-btn" data-action="openCount" data-id="'+c.id+'">ดูผล</button>';
    if(!owner&&c.status==='DRAFT')action='<button class="btn small-btn" data-action="openCount" data-id="'+c.id+'">ทำต่อ</button>';
    if(c.status==='SUBMITTED'&&can('ADMIN'))action='<button class="btn primary small-btn" data-action="finalizeCount" data-id="'+c.id+'">Admin Final</button> '+action;
    if(c.status==='FINAL'&&policy==='MANUAL_ADJUST'&&variance!==0&&can('WAREHOUSE','ADMIN')){
      action='<button class="btn primary small-btn" data-action="adjustFromCount" data-id="'+c.id+'">สร้าง Adjustment</button> '+action;
    }
    const varianceText=variance==null?'-':(variance>0?'+':'')+qty(variance);
    return '<tr><td><b>'+esc(c.count_no)+'</b></td><td><b>'+esc(warehouse(c.warehouse_id).code||'-')+'</b></td><td>'+dmy(c.snapshot_at)+'</td><td><span class="badge blue">'+esc(policy)+'</span></td><td class="num" data-sort="'+book+'">'+qty(book)+'</td><td class="num" data-sort="'+(actual==null?'':actual)+'">'+(actual==null?'<span class="muted">ยังไม่ครบ</span>':qty(actual))+'</td><td class="num '+(variance<0?'negative':variance>0?'positive':'')+'" data-sort="'+(variance==null?'':variance)+'">'+varianceText+'</td><td>'+badge(c.status)+'</td><td class="action-cell">'+action+'</td></tr>';
  });
  const filter=analyticsFilters({year:false,warehouse:true})+countPeriodFilter();
  const actionsHtml=owner?filter:filter+'<button class="btn primary" data-action="newCount">+ เริ่มรอบตรวจนับ</button>';
  const title=owner?'ผลตรวจนับ Stock':'ตรวจนับ Stock';
  const currentPolicy=stockCountPolicy();
  const policyText=currentPolicy==='AUTO_ADJUST'
    ?'Admin Final แล้วระบบปรับ Stock ตามยอดนับจริงอัตโนมัติ'
    :currentPolicy==='REVIEW_ONLY'
      ?'Admin Final แล้วเก็บผลตรวจเท่านั้น Stock ไม่เปลี่ยน'
      :'Admin Final ผลตรวจ แล้วใช้เมนู Stock Adjustment เพื่อปรับยอดภายหลัง';
  let summary='';
  if(owner){
    summary=cards([
      ['รอบตรวจ',nf.format(counts.length),'รายการ'],
      ['นับแล้ว',nf.format(countedLines.length),'จาก '+nf.format(allLines.length)+' SKU'],
      ['ขาด',nf.format(shortage),'SKU'],
      ['เกิน',nf.format(excess),'SKU'],
      ['ส่วนต่างสุทธิ',(netVariance>0?'+':'')+qty(netVariance),'จำนวน']
    ]);
  }else{
    summary='<div class="alert"><b>Policy ปัจจุบัน: '+esc(currentPolicy)+'</b> • '+esc(policyText)+' • แต่ละรอบจะล็อก Policy ตั้งแต่ตอนเริ่มตรวจนับ</div>';
  }
  return head(title,owner?'อ่านผล Book เทียบยอดตรวจจริงและส่วนต่างได้ทุกคลัง/ทุกรอบเดือน':'Snapshot → Count → Submit → Admin Final',actionsHtml)
    +summary
    +'<div class="panel"><div class="section-title"><h3>'+(owner?'ผลตรวจนับล่าสุด':'รายการรอบตรวจนับ')+'</h3><span class="muted">กดหัวคอลัมน์เพื่อเรียงข้อมูล</span></div>'
    +table(['Count No.','คลัง','Snapshot','Policy','Book Qty','ยอดตรวจจริง','ส่วนต่าง','สถานะ','ดำเนินการ'],rows,'count-result-table')
    +'</div>';
}
function adjustmentProductOptions(selected=''){
  return state.data.products.filter(x=>x.active!==false).map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+esc(p.code)+' • '+esc(p.name)+' • '+esc(p.base_uom||'')+'</option>').join('');
}
function adjustmentLineHtml(prefill={}){
  const direction=Number(prefill.adjustment_qty||0)<0?'OUT':'IN';
  const amount=Math.abs(Number(prefill.adjustment_qty||0))||'';
  return '<div class="adjustment-line">'
    +'<div class="adjustment-field"><label>สินค้า *</label><select class="adj-product" required>'+adjustmentProductOptions(prefill.product_id||'')+'</select><small class="adj-current muted"></small></div>'
    +'<div class="adjustment-field"><label>ปรับ *</label><select class="adj-direction" data-searchable="off"><option value="IN" '+(direction==='IN'?'selected':'')+'>+ เพิ่ม</option><option value="OUT" '+(direction==='OUT'?'selected':'')+'>− ลด</option></select></div>'
    +'<div class="adjustment-field"><label>จำนวน *</label><input class="adj-qty" type="number" min="0.0001" step="any" value="'+amount+'" required placeholder="0"></div>'
    +'<div class="adjustment-field adjustment-note-field"><label>เหตุผลรายการ *</label><input class="adj-line-reason" value="'+esc(prefill.reason||'')+'" required placeholder="เช่น ของชำรุด / พบของเกิน"></div>'
    +'<button class="btn danger small-btn remove-adjustment-line" type="button">ลบ</button>'
    +'</div>';
}
function stockAdjustmentPage(){
  const prefillId=state.prefillAdjustmentCountId||null;
  const count=prefillId?(state.data.counts||[]).find(x=>x.id===prefillId):null;
  const countLines=count?(state.data.countLines||[]).filter(x=>x.count_id===count.id):[];
  const prefillLines=countLines.map(l=>({
    product_id:l.product_id,
    adjustment_qty:Number(l.count_qty||0)-Number(l.book_qty||0),
    reason:l.variance_reason||('ปรับตาม '+count.count_no)
  })).filter(x=>x.adjustment_qty!==0);
  const defaultWh=count?.warehouse_id||state.data.warehouses?.[0]?.id||'';
  const history=(state.data.adjustments||[]).filter(a=>{
    const searchText=((a.adjustment_no||'')+' '+(a.reason||'')+' '+(warehouse(a.warehouse_id).code||'')).toLowerCase();
    return !state.search||searchText.includes(state.search);
  }).map(a=>{
    const ls=(state.data.adjustmentLines||[]).filter(l=>l.adjustment_id===a.id);
    const net=ls.reduce((sum,l)=>sum+Number(l.adjustment_qty||0),0);
    let action='<button class="btn small-btn" data-action="viewAdjustment" data-id="'+a.id+'">เปิด</button>';
    if(a.status==='SUBMITTED'&&can('ADMIN'))action='<button class="btn primary small-btn" data-action="postAdjustment" data-id="'+a.id+'">Post</button> '+action;
    const statusLabel=a.status==='SUBMITTED'?'<span class="badge warn">รอ Admin Post</span>':a.status==='POSTED'?'<span class="badge ok">Post แล้ว</span>':a.status==='REVERSED'?'<span class="badge danger">Reverse แล้ว</span>':badge(a.status);return '<tr><td><b>'+esc(a.adjustment_no)+'</b></td><td>'+dmy(a.adjustment_date)+'</td><td>'+esc(warehouse(a.warehouse_id).code||'-')+'</td><td>'+esc(a.reason||'-')+'</td><td class="num '+(net<0?'negative':net>0?'positive':'')+'">'+(net>0?'+':'')+qty(net)+'</td><td>'+statusLabel+'</td><td class="action-cell">'+action+'</td></tr>';
  });
  const initialLines=(prefillLines.length?prefillLines:[{}]).map(adjustmentLineHtml).join('');
  const whOptions=(state.data.warehouses||[]).map(w=>'<option value="'+w.id+'" '+(w.id===defaultWh?'selected':'')+'>'+esc(w.code)+' • '+esc(w.name)+'</option>').join('');
  const sourceText=count?'สร้างจากผลตรวจนับ '+esc(count.count_no)+' • ระบบเตรียมส่วนต่างให้แล้ว':'ใช้สำหรับของชำรุด พบของเกิน แก้ยอด หรือกรณีที่ต้องปรับ Stock โดยมี Audit';
  const reasonValue=count?esc('ปรับตามผลตรวจนับ '+count.count_no):'';
  return head('Stock Adjustment','ปรับยอดบวก/ลดแบบมีเหตุผล • WAREHOUSE ส่งรายการ • ADMIN Post จึงกระทบ Stock')
    +'<div class="panel adjustment-entry-panel"><div class="section-title"><div><h3>สร้าง Stock Adjustment</h3><span class="muted">'+sourceText+'</span></div></div>'
    +'<form id="adjustmentForm"><input type="hidden" id="adjustmentSourceCount" value="'+esc(count?.id||'')+'"><div class="adjustment-header-grid">'
    +'<label>วันที่ทำรายการ *<input id="adjustmentDate" type="date" value="'+new Date().toISOString().slice(0,10)+'" required></label>'
    +'<label>เลขเอกสาร (ไม่บังคับ)<input id="adjustmentDocNo" maxlength="100" placeholder="เช่น ADJ-2609-001 • เว้นว่าง = Auto"></label>'
    +'<label>คลังสินค้า *<select id="adjustmentWarehouse" required>'+whOptions+'</select></label>'
    +'<label>เหตุผลหลัก *<input id="adjustmentReason" required value="'+reasonValue+'" placeholder="เช่น ตรวจนับต่าง / ของชำรุด"></label>'
    +'<label class="full">หมายเหตุเพิ่มเติม<input id="adjustmentNote" placeholder="ถ้ามี"></label>'
    +'</div><div class="adjustment-rule"><b>ควบคุม:</b> การกด “ส่งให้ Admin” ยังไม่เปลี่ยน Stock • ADMIN ต้องตรวจและกด Post • การลด Stock ห้ามทำให้ On Hand ติดลบ</div>'
    +'<div id="adjustmentLines">'+initialLines+'</div>'
    +'<div class="actions adjustment-actions"><button class="btn" id="addAdjustmentLine" type="button">+ เพิ่มรายการ</button><button class="btn primary" type="submit">ส่งให้ Admin ตรวจและ Post</button></div></form></div>'
    +'<div class="panel"><div class="section-title"><div><h3>ประวัติ Stock Adjustment</h3><span class="muted">SUBMITTED = ยังไม่กระทบ Stock • POSTED = กระทบแล้ว • REVERSED = กลับรายการแล้ว</span></div><input id="pageSearch" placeholder="ค้นหาเลขเอกสาร / เหตุผล / คลัง"></div>'
    +table(['เลขเอกสาร','วันที่','คลัง','เหตุผล','สุทธิ','สถานะ','ดำเนินการ'],history,'adjustment-history-table',[4])
    +'</div>';
}
function wireStockAdjustmentPage(){
  const form=$('#adjustmentForm');if(!form)return;
  const area=$('#adjustmentLines');
  const wid=()=>$('#adjustmentWarehouse')?.value;
  const refreshRow=row=>{
    const pid=row.querySelector('.adj-product')?.value;
    const p=product(pid);
    const b=(state.data.balances||[]).find(x=>x.product_id===pid&&x.warehouse_id===wid());
    const onHand=Number(b?.on_hand||0),allocated=Number(b?.allocated||0);
    const el=row.querySelector('.adj-current');
    if(el)el.textContent='On Hand '+qty(onHand)+' • Available '+qty(onHand-allocated)+' '+(p.base_uom||'');
  };
  const wireRows=()=>{
    $$('.adjustment-line').forEach(row=>{
      const productSel=row.querySelector('.adj-product');
      if(productSel)productSel.onchange=()=>refreshRow(row);
      const rm=row.querySelector('.remove-adjustment-line');
      if(rm)rm.onclick=()=>{if($$('.adjustment-line').length>1)row.remove()};
      refreshRow(row);
    });
  };
  $('#adjustmentWarehouse').onchange=wireRows;
  $('#addAdjustmentLine').onclick=()=>{
    area.insertAdjacentHTML('beforeend',adjustmentLineHtml());
    wireRows();enhanceSearchableSelects(area.lastElementChild);
  };
  wireRows();
  form.onsubmit=async e=>{
    e.preventDefault();
    const lines=$$('.adjustment-line').map(row=>{
      const n=Number(row.querySelector('.adj-qty').value);
      const direction=row.querySelector('.adj-direction').value;
      return {product_id:row.querySelector('.adj-product').value,adjustment_qty:direction==='OUT'?-n:n,reason:row.querySelector('.adj-line-reason').value.trim()};
    });
    if(lines.some(x=>!Number.isFinite(x.adjustment_qty)||x.adjustment_qty===0))return toast('กรอกจำนวน Adjustment ให้ครบและมากกว่า 0',true);
    if(lines.some(x=>!x.reason))return toast('กรอกเหตุผลของทุกรายการ',true);
    for(const x of lines.filter(x=>x.adjustment_qty<0)){
      const b=(state.data.balances||[]).find(v=>v.product_id===x.product_id&&v.warehouse_id===wid());
      const onHand=Number(b?.on_hand||0),allocated=Number(b?.allocated||0),available=onHand-allocated;
      if(Math.abs(x.adjustment_qty)>available)return toast('ลด Stock '+(product(x.product_id).code||'')+' เกิน Available ปัจจุบัน '+qty(available),true);
    }
    setLoading(true);
    try{
      const {data,error}=await db.rpc('submit_stock_adjustment',{
        p_adjustment_date:$('#adjustmentDate').value,
        p_warehouse_id:wid(),
        p_lines:lines,
        p_reason:$('#adjustmentReason').value.trim(),
        p_note:$('#adjustmentNote').value.trim()||null,
        p_request_id:requestId('ADJ'),
        p_adjustment_no:$('#adjustmentDocNo').value.trim()||null,
        p_source_count_id:$('#adjustmentSourceCount').value||null
      });
      if(error)throw error;
      state.prefillAdjustmentCountId=null;
      toast('ส่ง '+data.adjustment_no+' ให้ Admin แล้ว • Stock ยังไม่เปลี่ยน');
      await loadData();render();
    }catch(err){fail(err)}finally{setLoading(false)}
  };
}
async function postStockAdjustment(id){
  if(!can('ADMIN'))return toast('เฉพาะ Admin ที่ Post Stock Adjustment ได้',true);
  const a=(state.data.adjustments||[]).find(x=>x.id===id);
  if(!a)return toast('ไม่พบ Stock Adjustment',true);
  if(!confirm('ยืนยัน Post '+a.adjustment_no+'?\nเมื่อ Post แล้ว Stock จะเปลี่ยนตามรายการ'))return;
  await runRpc('post_stock_adjustment',{p_adjustment_id:id,p_request_id:requestId('ADJ_POST')},r=>'Post '+r.adjustment_no+' สำเร็จ • Stock อัปเดตแล้ว');
}
function viewStockAdjustment(id){
  const a=(state.data.adjustments||[]).find(x=>x.id===id);
  if(!a)return toast('ไม่พบ Stock Adjustment',true);
  const rows=(state.data.adjustmentLines||[]).filter(x=>x.adjustment_id===id).map(l=>{
    const p=product(l.product_id),n=Number(l.adjustment_qty||0);
    return '<tr><td><b>'+esc(p.code||'-')+'</b> '+esc(p.name||'')+'</td><td class="num '+(n<0?'negative':'positive')+'">'+(n>0?'+':'')+qty(n)+'</td><td>'+esc(p.base_uom||'-')+'</td><td>'+esc(l.reason||'-')+'</td></tr>';
  });
  const postBtn=a.status==='SUBMITTED'&&can('ADMIN')?'<button class="btn primary" id="postAdjustmentModal">Post Adjustment</button>':'';
  const reverseBtn=a.status==='POSTED'&&can('ADMIN')?'<button class="btn danger" id="reverseAdjustmentModal">Reverse</button>':'';
  modal('<h2>'+esc(a.adjustment_no)+'</h2><p class="muted">'+dmy(a.adjustment_date)+' • '+esc(warehouse(a.warehouse_id).code||'-')+' • '+esc(a.reason||'')+'</p>'+table(['สินค้า','Adjustment','UoM','เหตุผล'],rows,'adjustment-detail',[1])+'<div class="actions">'+postBtn+reverseBtn+'<button class="btn" id="closeAdjustmentModal">ปิด</button></div>');
  $('#closeAdjustmentModal').onclick=closeModal;
  if($('#postAdjustmentModal'))$('#postAdjustmentModal').onclick=()=>{closeModal();postStockAdjustment(id)};
  if($('#reverseAdjustmentModal'))$('#reverseAdjustmentModal').onclick=()=>reverseStockAdjustmentModal(id);
}
function reverseStockAdjustmentModal(id){
  const a=(state.data.adjustments||[]).find(x=>x.id===id);if(!a)return;
  modal('<h2>Reverse '+esc(a.adjustment_no)+'</h2><div class="alert danger">ระบบจะสร้าง Movement กลับรายการเดิม ไม่ลบประวัติ</div><form id="reverseAdjustmentForm"><label>เหตุผล Reverse<textarea id="reverseAdjustmentReason" minlength="5" required placeholder="อย่างน้อย 5 ตัวอักษร"></textarea></label><div class="actions"><button class="btn danger" type="submit">ยืนยัน Reverse</button><button class="btn" id="cancelReverseAdjustment" type="button">ยกเลิก</button></div></form>');
  $('#cancelReverseAdjustment').onclick=closeModal;
  $('#reverseAdjustmentForm').onsubmit=async e=>{
    e.preventDefault();
    await runRpc('reverse_stock_adjustment',{p_adjustment_id:id,p_reason:$('#reverseAdjustmentReason').value.trim(),p_request_id:requestId('ADJ_REV')},r=>'Reverse '+r.adjustment_no+' สำเร็จ');
  };
}
function transfersPage(){const rows=state.data.transfers.map(t=>{const l=transferLine(t.id)||{},p=product(l.product_id),sent=Number(l.sent_qty||0),received=l.received_qty==null?null:Number(l.received_qty),action=t.status==='IN_TRANSIT'?`<button class="btn primary small-btn" data-action="receiveTransfer" data-id="${t.id}">รับปลายทาง</button>`:'<span class="muted">—</span>';return `<tr><td><b>${esc(t.transfer_no)}</b></td><td>${esc(warehouse(t.from_warehouse_id).code||'-')}</td><td>${esc(warehouse(t.to_warehouse_id).code||'-')}</td><td class="product-cell"><b>${esc(p.code||'-')}</b><span>${esc(p.name||'ไม่ระบุสินค้า')}</span><small>หน่วย: ${esc(p.base_uom||'-')}</small></td><td class="num" data-sort="${sent}">${qty(sent)}</td><td class="num" data-sort="${received==null?'':received}">${received==null?'-':qty(received)}</td><td>${badge(t.status)}</td><td class="action-cell">${action}</td></tr>`});return head('โอนระหว่างคลัง','ตัดต้นทางเมื่อส่ง และเพิ่มปลายทางเมื่อรับจริง','<button class="btn primary" data-action="newTransfer">+ สร้างใบโอน</button>')+`<div class="panel">${table(['Transfer','จาก','ไป','สินค้า','ส่ง','รับจริง','สถานะ','ดำเนินการ'],rows,'transfer-table',[4,5])}</div>`}
function repackLineHtml(){
  const prodOpts=state.data.products.filter(x=>x.active!==false).map(p=>`<option value="${p.id}">${esc(p.code)} • ${esc(p.name)} • ${esc(p.base_uom||'')}</option>`).join('');
  return `<div class="repack-line">
    <div class="repack-field"><label>จากสินค้า</label><select class="repack-from-product" required>${prodOpts}</select><small class="repack-available muted"></small></div>
    <div class="repack-arrow" aria-hidden="true">→</div>
    <div class="repack-field"><label>เป็นสินค้า</label><select class="repack-to-product" required>${prodOpts}</select><small class="repack-uom muted"></small></div>
    <div class="repack-field repack-qty-field"><label>จำนวน Repack</label><input class="repack-qty" type="number" min="0.0001" step="any" required placeholder="0"></div>
    <div class="repack-field repack-note-field"><label>หมายเหตุ (ถ้ามี)</label><input class="repack-reason" placeholder="เช่น Tank → Drum"></div>
    <button class="btn danger small-btn remove-repack-line" type="button">ลบ</button>
  </div>`;
}
function repackPage(){
  const rows=(state.data.conversions||[]).map(c=>{
    const lines=(state.data.conversionLines||[]).filter(l=>l.conversion_id===c.id),summary=lines.slice(0,3).map(l=>`${product(l.from_product_id).code||'-'} → ${product(l.to_product_id).code||'-'} ${qty(l.qty_out)}`).join('<br>')+(lines.length>3?`<small>+${lines.length-3} รายการ</small>`:'');
    return `<tr><td><b>${esc(c.conversion_no)}</b></td><td>${dmy(c.conversion_date)}</td><td>${esc(warehouse(c.warehouse_id).code||'-')}</td><td>${summary||'-'}</td><td>${badge(c.status)}</td><td><button class="btn small-btn" data-action="viewConversion" data-id="${c.id}">เปิด</button></td></tr>`;
  });
  return head('Repack / Conversion','เปลี่ยนรหัสสินค้าในคลังเดียวกัน • จำนวนออก = จำนวนเข้าอัตโนมัติ')+
    `<div class="panel repack-entry-panel">
      <div class="section-title"><div><h3>สร้างรายการ Repack</h3><span class="muted">กรอกให้น้อยที่สุด • เลขเอกสารกรอกเองได้ หรือเว้นว่างให้ระบบรัน</span></div></div>
      <form id="repackForm">
        <div class="repack-header-grid">
          <label>วันที่ทำรายการ *<input id="repackDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
          <label>เลขเอกสาร (ไม่บังคับ)<input id="repackDocNo" maxlength="100" placeholder="เช่น RP-2609-001 • เว้นว่าง = Auto"></label>
          <label>คลังสินค้า *<select id="repackWarehouse" required>${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label>
          <label>หมายเหตุรวม<input id="repackNote" placeholder="เช่น Repack รอบเช้า"></label>
        </div>
        <div class="repack-rule"><b>หลักการ:</b> Repack เปลี่ยนรหัส/บรรจุภัณฑ์เท่านั้น จึงใช้ Qty เดียว ระบบจะตัดต้นทางและรับเข้าปลายทางจำนวนเท่ากันเสมอ</div>
        <div id="repackLines">${repackLineHtml()}</div>
        <div class="actions repack-actions"><button class="btn" id="addRepackLine" type="button">+ เพิ่มรายการ</button><button class="btn primary" type="submit">บันทึก Repack</button></div>
      </form>
    </div>
    <div class="panel"><div class="section-title"><div><h3>ประวัติ Repack / Conversion</h3><span class="muted">ตรวจย้อนหลังและ Reverse ได้ โดยไม่แก้ Stock ตรง</span></div></div>${table(['เลขเอกสาร','วันที่','คลัง','รายการ','สถานะ',''],rows,'conversion-table')}</div>`;
}
function wireRepackPage(){
  const form=$('#repackForm');if(!form)return;
  const area=$('#repackLines'),wid=()=>$('#repackWarehouse')?.value;
  const refreshRow=row=>{
    const from=row.querySelector('.repack-from-product'),to=row.querySelector('.repack-to-product'),fp=product(from?.value),tp=product(to?.value);
    const avail=from?.value&&wid()?stockAvailable(from.value,wid()):0;
    const av=row.querySelector('.repack-available');if(av)av.textContent=`Available ${qty(avail)} ${fp.base_uom||''}`;
    const u=row.querySelector('.repack-uom');if(u)u.textContent=tp.base_uom?`UoM ${tp.base_uom}`:'';
  };
  const wireRows=()=>{
    $$('.repack-line').forEach(row=>{
      const rm=row.querySelector('.remove-repack-line');if(rm)rm.onclick=()=>{if($$('.repack-line').length>1)row.remove()};
      const from=row.querySelector('.repack-from-product'),to=row.querySelector('.repack-to-product');
      if(from)from.onchange=()=>refreshRow(row);if(to)to.onchange=()=>refreshRow(row);refreshRow(row);
    });
  };
  $('#addRepackLine').onclick=()=>{area.insertAdjacentHTML('beforeend',repackLineHtml());wireRows();enhanceSearchableSelects(area.lastElementChild)};
  $('#repackWarehouse').onchange=wireRows;
  wireRows();
  form.onsubmit=async e=>{
    e.preventDefault();
    const lines=$$('.repack-line').map(r=>{const amount=Number(r.querySelector('.repack-qty').value);return {from_product_id:r.querySelector('.repack-from-product').value,to_product_id:r.querySelector('.repack-to-product').value,qty_out:amount,qty_in:amount,reason:r.querySelector('.repack-reason').value.trim()||null}});
    if(lines.some(x=>!x.qty_out||x.qty_out<=0))return toast('กรอกจำนวน Repack ให้ครบและมากกว่า 0',true);
    if(lines.some(x=>x.from_product_id===x.to_product_id))return toast('สินค้าต้นทางและปลายทางต้องเป็นคนละรหัส',true);
    if(lines.some(x=>(product(x.from_product_id).base_uom||'')!==(product(x.to_product_id).base_uom||'')))return toast('Repack ต้องใช้หน่วย UoM เดียวกัน เช่น KG → KG',true);
    const grouped=new Map();lines.forEach(x=>grouped.set(x.from_product_id,(grouped.get(x.from_product_id)||0)+x.qty_out));
    for(const [pid,total] of grouped){const avail=stockAvailable(pid,wid());if(total>avail)return toast(`Stock ไม่พอ: ${product(pid).code} ต้องการ ${qty(total)} แต่ Available ${qty(avail)}`,true)}
    setLoading(true);try{
      const {data,error}=await db.rpc('post_stock_conversion',{p_warehouse_id:wid(),p_conversion_date:$('#repackDate').value,p_lines:lines,p_note:$('#repackNote').value.trim()||null,p_request_id:requestId('REPACK'),p_conversion_no:$('#repackDocNo').value.trim()||null});
      if(error)throw error;
      toast(`บันทึก ${data.conversion_no} สำเร็จ • ${data.line_count} รายการ`);
      await loadData();render();
    }catch(err){fail(err)}finally{setLoading(false)}
  };
}
function deliveryPage(){
  const ready=state.data.orders.filter(o=>o.status==='WAITING_LOGISTICS').map(o=>`<tr><td><b>${esc(o.order_no)}</b></td><td>${esc(customerName(o.customer_id))}</td><td>${dmy(o.requested_delivery_at)}</td><td class="num">${qty(orderLines(o.id).reduce((s,l)=>s+Number(l.issued_qty||0),0))}</td><td>${can('LOGISTICS','ADMIN')?`<button class="btn primary small-btn" data-action="newTrip" data-id="${o.id}">จัดรถ</button>`:''}</td></tr>`);
  const trips=state.data.trips.map(t=>{const o=byId('orders',t.order_id),doc=state.data.deliveryDocs?.find(d=>d.trip_id===t.id);return `<tr><td><b>${esc(t.trip_no)}</b></td><td>${esc(o?.order_no||'-')}</td><td>${esc(customerName(o?.customer_id))}</td><td>${dmy(t.planned_start)}</td><td>${esc(byId('vehicles',t.vehicle_id)?.plate_no||'-')}</td><td>${badge(t.status)}</td><td>${t.status!=='COMPLETED'&&can('LOGISTICS','ADMIN')?`<button class="btn primary small-btn" data-action="completeTrip" data-id="${t.id}">POD / ปิดงาน</button>`:doc?`<button class="btn small-btn" data-action="openPod" data-id="${doc.id}">เปิด POD</button>`:esc(t.pod_reference||'-')}</td></tr>`});
  return head('ขนส่ง / POD','จัดรถ ตรวจเวลาซ้อน และบันทึกลูกค้ารับจริง')+`<div class="split"><div class="panel"><h3>รอจัดรถ</h3>${table(['Order','ลูกค้า','กำหนดส่ง','จำนวน',''],ready)}</div><div class="panel"><h3>เที่ยวส่ง</h3>${table(['Trip','Order','ลูกค้า','เวลา','รถ','สถานะ',''],trips)}</div></div>`;
}
function profitBreakdown(dimension,invoices){
  const map=new Map(),add=(key,label,i,share=1)=>{const row=map.get(key)||{label,sales:0,productCost:0,freight:0,other:0,invoices:new Set()};row.sales+=Number(i.revenue||0)*share;row.productCost+=Number(i.product_cost||0)*share;row.freight+=Number(i.freight_cost||0)*share;row.other+=Number(i.other_cost||0)*share;row.invoices.add(i.id);map.set(key,row)};
  invoices.forEach(i=>{
    const oid=invoiceOrderId(i.id),tid=invoiceTripId(i.id),delivered=tid?tripLines(tid):[],all=oid?orderLines(oid):[],lineRevenue=l=>Number(delivered.find(x=>x.order_line_id===l.id)?.received_qty??l.qty??0)*Number(l.unit_price||0),total=all.reduce((s,l)=>s+lineRevenue(l),0),selected=all.filter(l=>(state.reportWarehouse==='ALL'||l.warehouse_id===state.reportWarehouse)&&(state.reportProduct==='ALL'||l.product_id===state.reportProduct));
    if(!selected.length)return add('unassigned','ไม่ระบุ',i);
    selected.forEach(l=>{const p=product(l.product_id),lineValue=lineRevenue(l),share=total?lineValue/total:1/selected.length;if(dimension==='customer')add(i.customer_id,customerName(i.customer_id),i,share);if(dimension==='product')add(l.product_id,`${p.code||'-'} • ${p.name||'-'}`,i,share);if(dimension==='group'){const pg=byId('productGroups',p.group_id),group=pg?.name||String(p.code||'อื่น').slice(0,3)||'อื่น';add(pg?.id||group,group,i,share)}if(dimension==='warehouse'){const w=warehouse(l.warehouse_id);add(l.warehouse_id,`${w.code||'-'} • ${w.name||'-'}`,i,share)}});
  });
  return [...map.values()].map(r=>({...r,gross:r.sales-r.productCost,grossPct:r.sales?(r.sales-r.productCost)/r.sales*100:0,contribution:r.sales-r.productCost-r.freight-r.other,pct:r.sales?(r.sales-r.productCost-r.freight-r.other)/r.sales*100:0})).sort((a,b)=>b.sales-a.sales)
}
function profitTable(view,invoices){
  if(view==='invoice'){const rows=invoices.map(i=>{const oid=invoiceOrderId(i.id),order=byId('orders',oid),lines=orderLines(oid),trip=byId('trips',invoiceTripId(i.id)),gross=invoiceGross(i),grossPct=Number(i.revenue)?gross/Number(i.revenue)*100:0,contribution=invoiceContribution(i),pct=Number(i.revenue)?contribution/Number(i.revenue)*100:0,totalQty=lines.reduce((s,l)=>s+Number(l.qty||0),0),received=trip?tripLines(trip.id).reduce((s,l)=>s+Number(l.received_qty??l.issued_qty??0),0):totalQty,productText=lines.map(l=>{const p=product(l.product_id);return `<div><b>${esc(p.code||'-')}</b> ${esc(p.name||'-')} <small>${qty(l.qty)} ${esc(p.base_uom||'')}</small></div>`}).join(''),warehouseText=[...new Set(lines.map(l=>warehouse(l.warehouse_id).code||'-'))].join(', '),vehicle=byId('vehicles',trip?.vehicle_id),driver=byId('drivers',trip?.driver_id);return `<tr><td><b>${esc(i.invoice_no)}</b><small>${esc(order?.order_no||'-')}</small></td><td>${dmy(i.invoice_date)}</td><td><b>${esc(customerName(i.customer_id))}</b></td><td class="report-product-list">${productText||'-'}</td><td class="num" data-sort="${totalQty}">${qty(totalQty)}</td><td class="num" data-sort="${received}">${qty(received)}</td><td>${esc(warehouseText)}</td><td><b>${esc(trip?.trip_no||'-')}</b><small>${esc(vehicle?.plate_no||'รถ Vendor/ไม่ระบุ')} • ${esc(driver?.name||'ไม่ระบุคนขับ')}</small></td><td class="num">${money(i.revenue)}</td><td class="num">${money(i.product_cost)}</td><td class="num"><b>${money(gross)}</b><small>${grossPct.toFixed(2)}%</small></td><td class="num">${money(i.freight_cost)}</td><td class="num">${money(i.other_cost)}</td><td class="num"><b>${money(contribution)}</b><small class="${pct<contributionAlertThreshold()?'negative':''}">${pct.toFixed(2)}%</small></td><td>${badge(i.gp_status)}</td></tr>`});return table(['Invoice / Order','วันที่','ลูกค้า','สินค้า / จำนวน','สั่ง','รับจริง','คลัง','เที่ยว / รถ / คนขับ','Revenue','Product Cost','Gross Profit','Freight','Direct Expense','Contribution','สถานะ'],rows,'profit-invoice-table',[4,5,8,9,10,11,12,13])}
  const labels={product:'สินค้า',group:'กลุ่มสินค้า',customer:'ลูกค้า',warehouse:'คลัง'},rows=profitBreakdown(view,invoices).map(r=>`<tr><td><b>${esc(r.label)}</b></td><td class="num">${money(r.sales)}</td><td class="num">${money(r.productCost)}</td><td class="num"><b>${money(r.gross)}</b></td><td class="num"><b>${r.grossPct.toFixed(2)}%</b></td><td class="num">${money(r.freight)}</td><td class="num">${money(r.other)}</td><td class="num"><b>${money(r.contribution)}</b></td><td class="num ${r.pct<contributionAlertThreshold()?'negative':''}">${r.pct.toFixed(2)}%</td><td class="num">${nf.format(r.invoices.size)}</td></tr>`);return table([labels[view],'Revenue','Product Cost','Gross Profit','GP Margin %','Freight','Direct Expense','Contribution','Contribution %','Invoice'],rows)
}
function serverInvoiceTable(page){if(!page)return empty('กำลังโหลดรายละเอียดจากฐานข้อมูล');const rows=(page.items||[]).map(i=>{const gross=Number(i.revenue)-Number(i.product_cost),contribution=gross-Number(i.freight_cost)-Number(i.other_cost),pct=Number(i.revenue)?contribution/Number(i.revenue)*100:0,products=(i.products||[]).map(p=>`<div><b>${esc(p.code)}</b> ${esc(p.name)} <small>${qty(p.received_qty)} ${esc(p.uom)} • ${esc(p.warehouse)}</small></div>`).join('');return `<tr><td><b>${esc(i.invoice_no)}</b><small>${esc(i.order_no||'-')}</small></td><td>${dmy(i.invoice_date)}</td><td>${esc(i.customer_name)}</td><td class="report-product-list">${products||'-'}</td><td class="num">${qty(i.order_qty)}</td><td class="num">${qty(i.received_qty)}</td><td>${esc(i.trip_no||'-')}<small>${esc(i.plate_no||'-')} • ${esc(i.driver_name||'-')}</small></td><td class="num">${money(i.revenue)}</td><td class="num">${money(i.product_cost)}</td><td class="num">${money(gross)}</td><td class="num">${money(i.freight_cost)}</td><td class="num">${money(i.other_cost)}</td><td class="num">${money(contribution)}<small class="${pct<contributionAlertThreshold()?'negative':''}">${pct.toFixed(2)}%</small></td><td>${badge(i.gp_status)}</td></tr>`});return table(['Invoice / Order','วันที่','ลูกค้า','สินค้า / จำนวน','สั่ง','รับจริง','เที่ยว / รถ / คนขับ','Revenue','Product Cost','Gross Profit','Freight','Direct Expense','Contribution','สถานะ'],rows,'profit-invoice-table',[4,5,7,8,9,10,11,12])+`<div class="actions report-pagination"><span>แสดง ${rows.length?state.reportPage*50+1:0}–${Math.min((state.reportPage+1)*50,Number(page.total))} จาก ${nf.format(page.total)} Invoice</span><button class="btn small-btn" data-action="reportPrev" ${state.reportPage===0?'disabled':''}>ก่อนหน้า</button><button class="btn small-btn" data-action="reportNext" ${(state.reportPage+1)*50>=Number(page.total)?'disabled':''}>ถัดไป</button></div>`}
function profitPage(){if(state.lowContributionPeriod){const periodLabel=state.reportMonth==='ALL'?`ปี ${state.reportYear}`:`${new Intl.DateTimeFormat('th-TH',{month:'long'}).format(new Date(2026,Number(state.reportMonth)-1,1))} ${state.reportYear}`;return head('Invoice ต่ำกว่าเกณฑ์',`เฉพาะ Invoice ${periodLabel} ที่ Contribution % ต่ำกว่าเกณฑ์บริษัท`,`<button class="btn" data-action="closeLowContribution">← ดู Invoice ทั้งหมด</button>`)+`<div class="panel"><p class="muted">เกณฑ์ปัจจุบัน ${nf.format(contributionAlertThreshold())}% • คำนวณจาก (ยอดขาย − ต้นทุนสินค้า − ค่าขนส่ง − ค่าใช้จ่ายอื่น) ÷ ยอดขาย</p>${serverInvoiceTable(getInvoicePage())}</div>`;}if(state.lowContributionDate)return head('Invoice ต่ำกว่าเกณฑ์',`เฉพาะ Invoice วันที่ ${esc(state.lowContributionDate)} ที่ Contribution % ต่ำกว่าเกณฑ์บริษัท`,`<button class="btn" data-action="closeLowContribution">← ดู Invoice ทั้งหมด</button>`)+`<div class="panel"><p class="muted">เกณฑ์ปัจจุบัน ${nf.format(state.data.todayStatus?.contribution_threshold_pct??12)}% • คำนวณจาก (ยอดขาย − ต้นทุนสินค้า − ค่าขนส่ง − ค่าใช้จ่ายอื่น) ÷ ยอดขาย</p>${serverInvoiceTable(getInvoicePage())}</div>`;const inv=analyticsInvoices(),k=getReportKpis(),fin=k?.finances||{},log=k?.logistics||{},rev=k?Number(fin.revenue):inv.reduce((s,x)=>s+Number(x.revenue),0),gross=k?rev-Number(fin.product_cost):inv.reduce((s,x)=>s+invoiceGross(x),0),contribution=k?gross-Number(fin.freight_cost)-Number(fin.other_cost):inv.reduce((s,x)=>s+invoiceContribution(x),0),transportQty=k?Number(log.received_qty):inv.reduce((s,i)=>{const tid=invoiceTripId(i.id);return s+(tid?tripLines(tid).reduce((a,l)=>a+Number(l.received_qty??0),0):0)},0),tabs=[['product','By Product'],['group','By Product Group'],['customer','By Customer'],['invoice','By Invoice'],['warehouse','By Warehouse']],complete=!k||Number(fin.invoices)<=inv.length;return head('Sales & Profit 360°','Gross Profit จาก Invoice และ Contribution หลังค่าขนส่ง/ค่าใช้จ่ายตรง',analyticsFilters({month:true,customer:true,product:true}))+ `<div class="toolbar report-search"><input id="pageSearch" placeholder="ค้นหา Invoice / ลูกค้า / สินค้า"></div>`+cards([['Sales',compactMoney(rev),`ปี ${state.reportYear}`],['ปริมาณส่ง',qty(transportQty),'ตามเที่ยวในช่วงที่เลือก'],['Gross Profit',compactMoney(gross),'Sales − Product Cost'],['GP Margin %',rev?(gross/rev*100).toFixed(2)+'%':'0.00%','Gross Profit ÷ Sales'],['Contribution Profit',compactMoney(contribution),'Gross − Freight − Direct Expense'],['Invoices',nf.format(k?Number(fin.invoices):inv.length),'รายการ']])+ownerChart(inv)+`<div class="panel"><div class="section-title"><div class="tabs">${tabs.map(([key,label])=>`<button type="button" class="tab-pill ${state.profitView===key?'active':''}" data-profit-view="${key}">${label}</button>`).join('')}</div><button class="btn small-btn" data-action="exportProfit">CSV เฉพาะรายการล่าสุดที่โหลด</button></div>${state.profitView==='invoice'?serverInvoiceTable(getInvoicePage()):complete?profitTable(state.profitView,inv):'<div class="alert warn">ข้อมูลจำนวนมาก: เลือกเดือนเพื่อดูตารางสรุป ส่วนยอด KPI คำนวณจากข้อมูลทั้งปี</div>'}</div>`}

function customer360Page(){const k=getReportKpis(),fin=k?.finances||{},summary=state.data.customerSummaryKey===reportKey()?state.data.customerSummary:null,inv=analyticsInvoices(),rows=(summary||[]).filter(x=>(state.reportCustomer==='ALL'||x.customer_id===state.reportCustomer)&&(!state.search||`${x.name} ${x.code}`.toLowerCase().includes(state.search))).map(x=>{const contribution=Number(x.revenue)-Number(x.product_cost)-Number(x.freight_cost)-Number(x.other_cost),pct=Number(x.revenue)?contribution/Number(x.revenue)*100:0;return `<tr><td><b>${esc(x.name)}</b><small>${esc(x.code)}</small></td><td class="num">${money(x.revenue)}</td><td class="num">${money(contribution)}</td><td class="num ${pct<contributionAlertThreshold()?'negative':''}">${pct.toFixed(2)}%</td><td class="num">${nf.format(x.invoices)}</td><td><button class="btn small-btn" data-action="openCustomerProfit" data-id="${x.customer_id}">ดู Invoice</button></td></tr>`}),sales=k?Number(fin.revenue):inv.reduce((s,x)=>s+Number(x.revenue||0),0),gross=k?sales-Number(fin.product_cost):inv.reduce((s,x)=>s+invoiceGross(x),0),contribution=k?gross-Number(fin.freight_cost)-Number(fin.other_cost):inv.reduce((s,x)=>s+invoiceContribution(x),0);return head('Customer 360°','ยอดขายและกำไรจาก Invoice',analyticsFilters({month:true,warehouse:false,customer:true}))+cards([['ยอดขาย',compactMoney(sales),''],['Gross Profit',compactMoney(gross),'Sales − Product Cost'],['Contribution Profit',compactMoney(contribution),'หลัง Freight/Direct Expense'],['Invoice',nf.format(k?Number(fin.invoices):inv.length),'รายการ']])+`<div class="toolbar"><input id="pageSearch" placeholder="ค้นหาลูกค้า"></div><div class="panel">${summary?table(['ลูกค้า','ยอดขาย','Contribution','Contribution %','Invoice',''],rows):empty('กำลังโหลดสรุปลูกค้า')}</div>`}

function stockHealthPage(){
  const policy=minimumStockPolicy(),byWarehouse=policy==='BY_WAREHOUSE',balances=analyticsBalances(),
    totalQty=balances.reduce((sum,x)=>sum+Number(x.on_hand||0),0),totalAllocated=balances.reduce((sum,x)=>sum+Number(x.allocated||0),0),
    zero=balances.filter(x=>Number(x.on_hand||0)<=0),
    allLow=lowStockRows(),
    lowMin=byWarehouse&&state.reportWarehouse!=='ALL'?allLow.filter(x=>x.warehouse_id===state.reportWarehouse):allLow,
    allowedWarehouses=state.reportWarehouse==='ALL'?state.data.warehouses:state.data.warehouses.filter(w=>w.id===state.reportWarehouse),
    counts=(state.data.counts||[]).filter(c=>state.reportWarehouse==='ALL'||c.warehouse_id===state.reportWarehouse),
    allowedCounts=new Set(counts.map(c=>c.id)),
    countedLines=state.data.countLines.filter(x=>allowedCounts.has(x.count_id)&&x.count_qty!=null),
    variance=countedLines.reduce((sum,x)=>sum+Number(x.count_qty)-Number(x.book_qty||0),0),
    whRows=allowedWarehouses.map(w=>({name:`${w.code} • ${w.name}`,qty:balances.filter(b=>b.warehouse_id===w.id).reduce((sum,b)=>sum+Number(b.on_hand||0),0)})).sort((a,b)=>b.qty-a.qty);
  const recentCounts=counts.slice(0,5).map(c=>{const ls=state.data.countLines.filter(x=>x.count_id===c.id),complete=ls.length>0&&ls.every(x=>x.count_qty!=null),book=ls.reduce((sum,x)=>sum+Number(x.book_qty||0),0),actual=complete?ls.reduce((sum,x)=>sum+Number(x.count_qty||0),0):null,diff=actual==null?null:actual-book;return `<tr><td><b>${esc(c.count_no)}</b></td><td>${esc(warehouse(c.warehouse_id).code||'-')}</td><td>${dmy(c.snapshot_at)}</td><td class="num">${qty(book)}</td><td class="num">${actual==null?'-':qty(actual)}</td><td class="num ${diff<0?'negative':diff>0?'positive':''}">${diff==null?'-':`${diff>0?'+':''}${qty(diff)}`}</td><td>${badge(c.status)}</td><td><button class="btn small-btn" data-action="openCount" data-id="${c.id}">ดูผล</button></td></tr>`});
  const lowHeaders=byWarehouse?['สินค้า','คลัง','On Hand','Minimum','ขาดจาก Min','UoM']:['สินค้า','On Hand รวม','Minimum รวม','ขาดจาก Min','UoM'];
  const lowTableRows=lowMin.slice(0,10).map(x=>`<tr><td><b>${esc(x.code)}</b> ${esc(x.name)}</td>${byWarehouse?`<td><b>${esc(x.warehouse_code||'-')}</b> ${esc(x.warehouse_name||'')}</td>`:''}<td class="num">${qty(x.onHand)}</td><td class="num">${qty(x.minimum)}</td><td class="num negative">${qty(x.minimum-x.onHand)}</td><td>${esc(x.uom)}</td></tr>`);
  const minNote=byWarehouse?'BY WAREHOUSE • Minimum รายคลัง ถ้าไม่ได้ตั้งจะใช้ Default จาก Product Master':'TOTAL • รวม Stock ทุกคลังแล้วเทียบ Minimum จาก Product Master';
  return head('Stock Summary','ภาพรวมคงเหลือและผลตรวจนับสำหรับผู้บริหาร',analyticsFilters({year:false}))+cards([['Stock On Hand',qty(totalQty),state.reportWarehouse==='ALL'?'ทุกคลัง':'คลังที่เลือก'],['Allocated',qty(totalAllocated),'ยอดจัดสรร'],['Available',qty(totalQty-totalAllocated),'พร้อมใช้'],['Stock ต่ำกว่า Min',nf.format(lowMin.length),byWarehouse?'สินค้า/คลัง':'สินค้า'],['Count Variance',`${variance>0?'+':''}${qty(variance)}`,'ส่วนต่างสุทธิ']])+`<div class="split"><div class="panel"><div class="section-title"><h3>Stock ตามคลัง</h3><button class="btn small-btn" data-go="stock">ดูรายละเอียด</button></div>${metricBars(whRows,'qty','name')}</div><div class="panel"><div class="section-title"><h3>ผลตรวจนับล่าสุด</h3><button class="btn small-btn" data-go="counts">ดูทั้งหมด</button></div>${table(['Count','คลัง','วันที่','Book','ตรวจจริง','ต่าง','สถานะ',''],recentCounts,'count-summary-table')}</div></div><div class="panel"><div class="section-title"><div><h3>รายการต่ำกว่า Minimum Stock</h3><span class="muted">${esc(minNote)}</span></div><button class="btn small-btn" data-action="openLowStock">เปิดในเมนู Stock</button></div>${table(lowHeaders,lowTableRows,'stock-min-summary')}</div><div class="alert ok">ผู้บริหารเห็นเฉพาะยอดคงเหลือและผลตรวจนับแบบอ่านอย่างเดียว โดยไม่แสดง Stock Movement</div>`;
}

function deliveryPerformancePage(){const k=getReportKpis(),trips=analyticsTrips(),tripIds=new Set(trips.map(x=>x.id)),completed=trips.filter(x=>x.status==='COMPLETED'),late=trips.filter(x=>x.status!=='COMPLETED'&&x.planned_end&&new Date(x.planned_end)<new Date()),tripLineList=state.data.tripLines.filter(x=>tripIds.has(x.trip_id)),issued=tripLineList.reduce((s,x)=>s+Number(x.issued_qty||0),0),received=tripLineList.reduce((s,x)=>s+Number(x.received_qty??x.issued_qty??0),0),freight=trips.reduce((s,t)=>s+Number(t.actual_freight??t.standard_freight??0),0),sales=k?Number(k.logistics.sales):trips.reduce((s,t)=>s+Number(tripInvoice(t.id)?.revenue||0),0),onTime=completed.filter(t=>t.completed_at&&t.planned_end&&new Date(t.completed_at)<=new Date(t.planned_end)).length,waiting=k?Number(k.pipeline.waiting_logistics):state.data.orders.filter(x=>x.status==='WAITING_LOGISTICS').length,productMap=new Map(),vendorMap=new Map();
  trips.forEach(t=>{const inv=tripInvoice(t.id),lines=tripLines(t.id),tripRevenue=Number(inv?.revenue||0),totalReceived=lines.reduce((s,l)=>s+Number(l.received_qty??l.issued_qty??0),0),vendor=t.transport_supplier_id?(byId('suppliers',t.transport_supplier_id)?.name||'Vendor'):'รถบริษัท',v=vendorMap.get(vendor)||{name:vendor,trips:0,qty:0,sales:0,freight:0};v.trips++;v.qty+=totalReceived;v.sales+=tripRevenue;v.freight+=Number(t.actual_freight??t.standard_freight??0);vendorMap.set(vendor,v);lines.forEach(l=>{if(state.reportProduct!=='ALL'&&l.product_id!==state.reportProduct)return;const p=product(l.product_id),key=l.product_id,r=productMap.get(key)||{name:`${p.code||'-'} • ${p.name||'-'}`,uom:p.base_uom||'',trips:new Set(),customers:new Set(),qty:0,sales:0,freight:0};const q=Number(l.received_qty??l.issued_qty??0),share=totalReceived?q/totalReceived:0;r.trips.add(t.id);r.customers.add(byId('orders',t.order_id)?.customer_id);r.qty+=q;r.sales+=tripRevenue*share;r.freight+=Number(t.actual_freight??t.standard_freight??0)*share;productMap.set(key,r)})});
  const productRows=[...productMap.values()].sort((a,b)=>b.sales-a.sales).map(r=>`<tr><td><b>${esc(r.name)}</b></td><td class="num">${nf.format(r.trips.size)}</td><td class="num">${qty(r.qty)} ${esc(r.uom)}</td><td class="num">${nf.format(r.customers.size)}</td><td class="num">${money(r.sales)}</td><td class="num">${money(r.freight)}</td><td class="num">${r.qty?money(r.freight/r.qty):money(0)}</td></tr>`),vendorRows=[...vendorMap.values()].sort((a,b)=>b.sales-a.sales).map(x=>`<tr><td><b>${esc(x.name)}</b></td><td class="num">${nf.format(x.trips)}</td><td class="num">${qty(x.qty)}</td><td class="num">${money(x.sales)}</td><td class="num">${money(x.freight)}</td></tr>`),detailRows=trips.map(t=>{const o=byId('orders',t.order_id),inv=tripInvoice(t.id),lines=tripLines(t.id),vehicle=byId('vehicles',t.vehicle_id),driver=byId('drivers',t.driver_id),sent=lines.reduce((s,l)=>s+Number(l.issued_qty||0),0),got=lines.reduce((s,l)=>s+Number(l.received_qty??l.issued_qty??0),0),products=lines.map(l=>{const p=product(l.product_id);return `<div><b>${esc(p.code||'-')}</b> ${esc(p.name||'-')} <small>${qty(l.received_qty??l.issued_qty??0)} ${esc(p.base_uom||'')}</small></div>`}).join(''),vendor=t.transport_supplier_id?(byId('suppliers',t.transport_supplier_id)?.name||'-'):'รถบริษัท';return `<tr><td><b>${esc(t.trip_no)}</b><small>${esc(o?.order_no||'-')} • ${esc(inv?.invoice_no||'-')}</small></td><td>${dmy(t.planned_start)}</td><td><b>${esc(customerName(o?.customer_id))}</b></td><td class="report-product-list">${products||'-'}</td><td class="num">${qty(sent)}</td><td class="num">${qty(got)}</td><td class="num ${sent-got>0?'negative':''}">${qty(sent-got)}</td><td><b>${esc(vehicle?.plate_no||'รถ Vendor')}</b><small>${esc(vehicle?.vehicle_type||'-')} • ${esc(driver?.name||'-')}</small></td><td>${esc(vendor)}</td><td class="num">${money(inv?.revenue||0)}</td><td class="num">${money(t.actual_freight??t.standard_freight??0)}</td><td>${badge(t.status)}</td></tr>`});
  return head('Delivery Performance','ภาพรวมรถ เที่ยวส่ง ปริมาณ สินค้า ยอดขาย และต้นทุนขนส่ง • การ์ดรวมทุกสถานะ',analyticsFilters({month:true,product:true,vehicle:true,status:true}))+`<div class="toolbar report-search"><input id="pageSearch" placeholder="ค้นหา Trip / Order / ลูกค้า / สินค้า / ทะเบียน / คนขับ"></div>`+cards([['Trips',nf.format(k?Number(k.logistics.trips):trips.length),'เที่ยว'],['ส่งสำเร็จ',nf.format(k?Number(k.logistics.completed):completed.length),'เที่ยว'],['ปริมาณส่งจริง',qty(k?Number(k.logistics.received_qty):received),'ทุกสินค้า'],['ยอดขายที่ส่ง',compactMoney(sales),'Invoice ที่เชื่อมเที่ยว'],['ค่าขนส่ง',compactMoney(k?Number(k.logistics.freight):freight),(k?Number(k.logistics.received_qty):received)?`${money((k?Number(k.logistics.freight):freight)/(k?Number(k.logistics.received_qty):received))} / หน่วย`:''],['On-time',(k?Number(k.logistics.completed):completed.length)?((k?Number(k.logistics.on_time):onTime)/(k?Number(k.logistics.completed):completed.length)*100).toFixed(1)+'%':'0.0%',`${k?Number(k.logistics.on_time):onTime}/${k?Number(k.logistics.completed):completed.length} เที่ยว`]])+`<div class="panel"><p class="muted">ตารางด้านล่างแสดงเที่ยวล่าสุดที่โหลด หากมีข้อมูลจำนวนมากให้ใช้ตัวกรองรายเดือน</p><h3>ส่งสินค้าอะไร กี่เที่ยว เป็นเงินเท่าไร</h3>${table(['สินค้า','เที่ยว','ปริมาณส่ง','ลูกค้า','ยอดขาย','ค่าขนส่ง','Freight / Unit'],productRows,'delivery-product-table',[1,2,3,4,5,6])}</div><div class="split"><div class="panel"><h3>รถบริษัท / Vendor ขนส่ง</h3>${table(['ผู้ขนส่ง','เที่ยว','ปริมาณ','ยอดขาย','ค่าขนส่ง'],vendorRows,'delivery-vendor-table',[1,2,3,4])}</div><div class="panel"><h3>รายการต้องติดตาม</h3><div class="analytics-alert"><strong>${k?Number(k.logistics.late):late.length} เที่ยวล่าช้า</strong><button class="btn small-btn" data-go="delivery">เปิดงาน</button></div><div class="analytics-alert"><strong>${waiting} Order ยังไม่มีรถ</strong><button class="btn small-btn" data-go="delivery">จัดรถ</button></div><div class="analytics-alert"><strong>${qty(k?Number(k.logistics.issued_qty)-Number(k.logistics.received_qty):issued-received)} หน่วยส่งไม่ครบ</strong></div></div></div><div class="panel"><h3>รายละเอียดเที่ยวส่ง</h3>${table(['Trip / เอกสาร','วันที่','ลูกค้า','สินค้า / ปริมาณ','จ่าย','รับจริง','ส่วนต่าง','รถ / คนขับ','ผู้ขนส่ง','ยอดขาย','Freight','สถานะ'],detailRows,'delivery-detail-table',[4,5,6,9,10])}</div>`}

function costVariancePage(){const k=getReportKpis(),fin=k?.finances||{},log=k?.logistics||{},inv=analyticsInvoices(),productCost=k?Number(fin.product_cost):inv.reduce((s,x)=>s+Number(x.product_cost||0),0),actualFreight=k?Number(fin.freight_cost):inv.reduce((s,x)=>s+Number(x.freight_cost||0),0),other=k?Number(fin.other_cost):inv.reduce((s,x)=>s+Number(x.other_cost||0),0),standard=k?Number(log.standard_freight):analyticsTrips().reduce((s,t)=>s+Number(t.standard_freight||0),0),variance=actualFreight-standard,rows=[['Freight',standard,actualFreight,variance],['Product Cost',productCost,productCost,0],['Other Cost',other,other,0]].map(x=>`<tr><td><b>${x[0]}</b></td><td class="num">${money(x[1])}</td><td class="num">${money(x[2])}</td><td class="num ${x[3]>0?'negative':x[3]<0?'positive':''}">${x[3]>0?'+':''}${money(x[3])}</td></tr>`);return head('Cost & Variance','ค่าขนส่ง Standard เทียบ Actual ตามช่วงที่เลือก',analyticsFilters({month:true}))+cards([['Product Cost',compactMoney(productCost),'จาก Invoice'],['Freight',compactMoney(actualFreight),`เทียบ Standard ${compactMoney(standard)}`],['Other Cost',compactMoney(other),'จาก Invoice'],['Freight Variance',compactMoney(variance),variance>0?'สูงกว่า Standard':'ไม่เกิน Standard']])+`<div class="panel"><h3>Variance ที่ควรรู้</h3>${table(['ประเภท','Standard','Actual','Variance'],rows)}</div>`}

function reportsPage(){
  const role=state.profile?.app_role||'';
  const common=[
    ['Sales / Invoice / Profit','ยอดขาย Invoice, Gross Profit, Freight, Direct Expense และ Contribution','profit','เลือกปี/เดือน ลูกค้า สินค้า คลัง รถ • ตารางแบ่งหน้า'],
    ['Customer 360°','ยอดขายและกำไรแยกตามลูกค้า พร้อม Drill-down','customer360','ใช้ข้อมูล Invoice และ Order ของบริษัท'],
    ['Stock Summary','ยอดคงเหลือ Available Stock และรายการต่ำกว่า Minimum','stockhealth','ดูภาพรวม Stock เพื่อการบริหาร'],
    ['Stock Count & Variance','Book Qty เทียบยอดตรวจจริง ส่วนต่าง และผลการ Final','counts','ตรวจผลการนับย้อนหลังตามรอบ'],
    ['Delivery Performance','เที่ยวส่ง สถานะการส่ง Freight และผลการส่งมอบ','deliveryperformance','วิเคราะห์งานขนส่งจากเที่ยวจริง'],
    ['Cost & Variance','ต้นทุนสินค้า Freight และค่าใช้จ่ายเทียบผลจริง','costvariance','ใช้สำหรับตรวจต้นทุนและความผิดปกติ']
  ];
  const adminOnly=[
    ['Stock Balance / Movement','ยอดคงเหลือรายคลังและประวัติ Stock IN / OUT','stock','ค้นหาสินค้า คลัง ประเภท Movement และช่วงวันที่'],
    ['Goods Receipt','ประวัติรับสินค้า GR แยกคลัง Vendor และสินค้า','warehouse','ตรวจเอกสารรับสินค้าและรายการล่าสุด'],
    ['Stock Transfer','รายการโอนระหว่างคลัง จำนวนส่ง รับ และส่วนต่าง','transfers','ติดตามสถานะการโอนคลัง'],
    ['Stock Adjustment','รายการปรับเพิ่ม/ลด Stock เหตุผล ผู้บันทึก และสถานะ','stockadjust','ตรวจ Adjustment และรายการ Reverse'],
    ['Repack / Conversion','ประวัติแปลงสินค้า From → To และจำนวนที่เปลี่ยน','repack','ตรวจ Repack และ Reverse']
  ];
  const reports=role==='ADMIN'?[...common,...adminOnly]:common;
  const rows=reports.map(([title,desc,page,hint],idx)=>`
    <div class="card">
      <div class="label">REPORT ${String(idx+1).padStart(2,'0')}</div>
      <div style="font-size:20px;font-weight:800;margin:8px 0 6px">${esc(title)}</div>
      <div class="hint" style="min-height:44px">${esc(desc)}</div>
      <div class="muted" style="margin:10px 0 14px;font-size:12px">${esc(hint)}</div>
      <button class="btn primary small-btn" data-go="${page}">เปิดรายงาน</button>
    </div>`).join('');
  return head('Report Center','เลือกข้อมูลที่ต้องการตรวจ แล้วเปิดรายงานจาก Module ต้นทางโดยตรง')+
    `<div class="alert ok"><b>รายงานใช้ข้อมูลจริงของบริษัท</b> • หน้า Report Center ไม่ใช้จำนวนแถวที่ Browser โหลดมาเป็น KPI และไม่เอา Audit Log มาปนกับรายงานธุรกิจ</div>
    <div class="panel">
      <div class="section-title"><div><h3>รายงานธุรกิจ</h3><span class="muted">เลือก Report → กำหนดตัวกรองในหน้ารายงาน → ดูรายละเอียด / ดาวน์โหลดเมื่อรายงานนั้นรองรับ</span></div></div>
      <div class="cards">${rows}</div>
    </div>
    <div class="alert info"><b>หมายเหตุ:</b> Audit Log อยู่ในเมนู Audit สำหรับ Admin โดยเฉพาะ • การนำเข้าข้อมูล Demo ย้ายไปเมนู สำรอง / เริ่มปีใหม่ เพื่อไม่ปะปนกับรายงาน</div>`;
}
function mastersPage(){const tabs=[['customers','Customer'],['productGroups','Product Group'],['products','Product'],['warehouses','Warehouse'],['suppliers','Vendor'],['vehicleTypes','Vehicle Type'],['vehicles','Vehicle'],['drivers','Driver'],['costs','Monthly Product Cost'],['expenseTypes','Cost & Expense Setup']];const cardsHtml=tabs.map(x=>`<div class="card"><div class="label">${x[1]}</div><div class="value">${nf.format(state.data[x[0]]?.length||0)}</div><button class="btn small-btn" style="margin-top:12px" data-action="manageMaster" data-id="${x[0]}">เปิดข้อมูล</button></div>`).join('');const openingCount=state.data.openingBatches?.length||0;return head('Master Data','ข้อมูลกลาง ต้นทุน และค่าใช้จ่ายสำหรับทุก Module','<button class="btn primary" data-action="openingStock">+ ยกสต็อกตั้งต้น</button> <button class="btn" data-action="masterImport">⇩ Download / ⇧ Upload Master</button>')+`<div class="cards"><div class="card"><div class="label">Opening Stock</div><div class="value">${nf.format(openingCount)}</div><div class="hint">ชุดที่บันทึกแล้ว</div><button class="btn primary small-btn" style="margin-top:12px" data-action="openingStock">เปิด / นำเข้า</button></div>${cardsHtml}</div><div class="alert warn">สต็อกตั้งต้นจะเพิ่ม On Hand และสร้าง Audit Log แต่ไม่เขียนทับ Monthly Product Cost • Master Upload จะ Preview ก่อนบันทึก</div>`}
function usersPage(){const users=(state.data.users||[]).map(u=>{const self=u.user_id===state.session?.user?.id;return `<tr><td><b>${esc(u.full_name)}</b><br><span class="muted">${esc(u.email||'-')}</span></td><td>${esc(u.employee_code||'-')}</td><td><select id="userRole-${u.user_id}">${['SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN'].map(r=>`<option value="${r}" ${r===u.app_role?'selected':''}>${roleThai[r]}</option>`).join('')}</select></td><td>${u.active?badge('ACTIVE'):badge('INACTIVE')} ${u.must_change_password?'<span class="badge warn">รอเปลี่ยนรหัส</span>':''}</td><td><button class="btn small-btn" data-action="saveUser" data-id="${u.user_id}" data-active="${u.active?'1':'0'}">บันทึกสิทธิ์</button> ${self?'':`<button class="btn small-btn" data-action="resetUserPassword" data-id="${u.user_id}">ตั้งรหัสชั่วคราวใหม่</button> <button class="btn ${u.active?'danger':''} small-btn" data-action="toggleUser" data-id="${u.user_id}" data-active="${u.active?'1':'0'}">${u.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button>`}</td></tr>`});return head('Users / Roles','Admin สร้างบัญชีและกำหนดสิทธิ์ให้ผู้ใช้','<button class="btn primary" data-action="newAdminUser">+ สร้างผู้ใช้</button>')+cards([['ผู้ใช้งาน',nf.format(users.length),'บัญชี'],['รอเปลี่ยนรหัส',nf.format((state.data.users||[]).filter(x=>x.must_change_password).length),'บัญชี']])+`<div class="panel"><div class="alert ok">Admin สร้างผู้ใช้ → ส่งรหัสชั่วคราว → ผู้ใช้ตั้งรหัสใหม่เมื่อเข้าใช้งานครั้งแรก</div><h3>ผู้ใช้ในระบบ</h3>${table(['ผู้ใช้','รหัส','บทบาท','สถานะ',''],users)}</div>`}
let pendingWarehouseMinimumImport=null;
function warehouseMinimumTemplateRows(){
  const overrideMap=new Map((state.data.warehouseMinimums||[]).map(x=>[`${x.product_id}|${x.warehouse_id}`,x]));
  return (state.data.products||[]).filter(x=>x.active!==false).flatMap(p=>
    (state.data.warehouses||[]).filter(x=>x.active!==false).map(w=>{
      const override=overrideMap.get(`${p.id}|${w.id}`);
      return [p.code,p.name||'',w.code,w.name||'',Number(p.minimum_stock||0),override?Number(override.minimum_stock):''];
    })
  );
}
function downloadWarehouseMinimumTemplate(){
  downloadCsv('FlowBiz_One_Minimum_Stock_By_Warehouse.csv',
    ['product_code','product_name','warehouse_code','warehouse_name','default_minimum_stock','minimum_stock'],
    warehouseMinimumTemplateRows()
  );
}
function normalizeWarehouseMinimumImport(text){
  const raw=parseCsv(text),headers=raw[0]?.map(x=>x.replace(/^\ufeff/,'').trim())||[],
    required=['product_code','warehouse_code','minimum_stock'],errors=[];
  if(required.some(h=>!headers.includes(h)))return {rows:[],errors:[`Header ต้องมี: ${required.join(', ')}`],blankRows:0,totalRows:0};
  if(raw.length-1>5000)return {rows:[],errors:['ไฟล์หนึ่งชุดรองรับไม่เกิน 5,000 รายการ'],blankRows:0,totalRows:raw.length-1};
  const pMap=new Map((state.data.products||[]).filter(x=>x.active!==false).map(x=>[String(x.code).trim().toUpperCase(),x])),
    wMap=new Map((state.data.warehouses||[]).filter(x=>x.active!==false).map(x=>[String(x.code).trim().toUpperCase(),x])),
    seen=new Set(),rows=[];let blankRows=0;
  raw.slice(1).forEach((values,index)=>{
    const src=Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()??''])),line=index+2,
      pCode=String(src.product_code||'').toUpperCase(),wCode=String(src.warehouse_code||'').toUpperCase(),minRaw=String(src.minimum_stock??'').trim();
    if(!pCode&&!wCode&&!minRaw)return;
    if(!pCode||!wCode){errors.push(`แถว ${line}: ต้องระบุ product_code และ warehouse_code`);return}
    const p=pMap.get(pCode),w=wMap.get(wCode),key=`${pCode}|${wCode}`;
    if(!p){errors.push(`แถว ${line}: ไม่พบสินค้า ${src.product_code}`);return}
    if(!w){errors.push(`แถว ${line}: ไม่พบคลัง ${src.warehouse_code}`);return}
    if(seen.has(key)){errors.push(`แถว ${line}: ${src.product_code} / ${src.warehouse_code} ซ้ำในไฟล์`);return}
    seen.add(key);
    if(minRaw===''){blankRows++;return}
    const minimum=Number(minRaw);
    if(!Number.isFinite(minimum)||minimum<0){errors.push(`แถว ${line}: minimum_stock ต้องเป็น 0 หรือมากกว่า`);return}
    rows.push({product_id:p.id,warehouse_id:w.id,minimum_stock:minimum,_preview:{product_code:p.code,product_name:p.name||'',warehouse_code:w.code,warehouse_name:w.name||'',minimum_stock:minimum}});
  });
  return {rows,errors,blankRows,totalRows:Math.max(0,raw.length-1)};
}
async function previewWarehouseMinimumSettingsUpload(){
  if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
  const file=$('#warehouseMinimumDirectFile')?.files?.[0];
  const preview=$('#warehouseMinimumDirectPreview'),commit=$('#warehouseMinimumDirectCommit');
  if(!file)return toast('กรุณาเลือกไฟล์ CSV',true);
  if(file.size>5*1024*1024)return toast('ไฟล์ต้องไม่เกิน 5 MB',true);
  const parsed=normalizeWarehouseMinimumImport(await file.text());
  const noValues=!parsed.errors.length&&parsed.rows.length===0;
  pendingWarehouseMinimumImport=(parsed.errors.length||noValues)?null:parsed;
  if(commit)commit.disabled=parsed.errors.length>0||noValues;
  if(!preview)return;
  if(parsed.errors.length){
    preview.innerHTML=`<div class="alert danger"><b>พบ ${nf.format(parsed.errors.length)} จุดที่ต้องแก้</b><br>${parsed.errors.slice(0,12).map(esc).join('<br>')}${parsed.errors.length>12?'<br>...':''}</div>`;
    return;
  }
  if(noValues){
    preview.innerHTML='<div class="alert warn"><b>ยังไม่มีค่า Minimum ให้นำเข้า</b><br>กรอกตัวเลขในคอลัมน์ <code>minimum_stock</code> อย่างน้อย 1 รายการก่อนอัปโหลด • ช่องว่างหมายถึงใช้ Default จาก Product Master</div>';
    return;
  }
  const previewRows=parsed.rows.slice(0,8).map(x=>`<tr><td><b>${esc(x._preview.product_code)}</b> ${esc(x._preview.product_name)}</td><td>${esc(x._preview.warehouse_code)} ${esc(x._preview.warehouse_name)}</td><td class="num">${qty(x.minimum_stock)}</td></tr>`);
  preview.innerHTML=`<div class="alert ok"><b>ไฟล์ผ่านการตรวจสอบ</b> • จะตั้งค่า ${nf.format(parsed.rows.length)} รายการ • เว้นว่าง/ใช้ Default ${nf.format(parsed.blankRows)} รายการ</div>${table(['สินค้า','คลัง','Minimum'],previewRows,'warehouse-minimum-direct-preview')}`;
}
async function commitWarehouseMinimumSettingsUpload(){
  if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
  if(!pendingWarehouseMinimumImport)return toast('กรุณาเลือกไฟล์และกดตรวจไฟล์ก่อน',true);
  if(!window.confirm('ยืนยันอัปโหลดทับ Minimum Stock รายคลังเดิมทั้งหมดของบริษัท?\n\nค่า Default ใน Product Master จะไม่ถูกแก้'))return;
  const rows=pendingWarehouseMinimumImport.rows.map(({_preview,...x})=>x);
  setLoading(true);
  try{
    const {error}=await db.rpc('admin_replace_warehouse_minimums',{p_rows:rows});
    if(error)throw error;
    const {data,error:readError}=await db.from('product_warehouse_minimums').select('*').order('warehouse_id').order('product_id');
    if(readError)throw readError;
    state.data.warehouseMinimums=data||[];
    pendingWarehouseMinimumImport=null;
    toast(`อัปโหลด Minimum Stock รายคลังแล้ว ${rows.length} รายการ`);
    render();
  }catch(err){fail(err)}finally{setLoading(false)}
}
function warehouseMinimumModal(){
  if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
  pendingWarehouseMinimumImport=null;
  const products=(state.data.products||[]).filter(x=>x.active!==false),warehouses=(state.data.warehouses||[]).filter(x=>x.active!==false);
  if(!products.length||!warehouses.length)return toast('ต้องมี Product และ Warehouse ก่อนตั้งค่า Minimum Stock',true);
  const overrideMap=new Map((state.data.warehouseMinimums||[]).map(x=>[`${x.product_id}|${x.warehouse_id}`,x]));
  const headers=['สินค้า','Default',...warehouses.map(w=>esc(w.code))];
  const rows=products.map(p=>`<tr><td><b>${esc(p.code)}</b><small>${esc(p.name||'')}</small></td><td class="num">${qty(p.minimum_stock||0)}</td>${warehouses.map(w=>{const row=overrideMap.get(`${p.id}|${w.id}`);return `<td><input class="warehouse-min-input" data-product="${p.id}" data-warehouse="${w.id}" type="number" min="0" step="any" value="${row?esc(row.minimum_stock):''}" placeholder="${esc(p.minimum_stock||0)}" style="min-width:110px"></td>`}).join('')}</tr>`);
  modal(`<h2>Minimum Stock แยกตามคลัง</h2>
    <div class="alert ok"><b>ตั้งค่าง่าย:</b> ช่องว่าง = ใช้ Default จาก Product Master • ใส่ 0 = ไม่กำหนด Minimum สำหรับสินค้านั้นในคลังนั้น • ค่านี้มีผลเมื่อ Policy = BY WAREHOUSE</div>
    <div class="panel">
      <h3>โหลด / อัปโหลดไฟล์ Minimum รายคลัง</h3>
      <p class="muted"><b>อัปโหลดแบบ Replace:</b> เมื่อยืนยัน ระบบจะทับค่ารายคลังเดิมทั้งหมดของบริษัทด้วยไฟล์นี้ • แถวที่ minimum_stock ว่าง = กลับไปใช้ Default จาก Product Master • ค่า Default ใน Product Master ไม่ถูกแก้</p>
      <div class="actions"><button id="wmDownloadTemplate" class="btn" type="button">ดาวน์โหลด Template CSV</button></div>
      <div class="form" style="margin-top:10px"><label class="full">ไฟล์ CSV<input id="warehouseMinimumFile" type="file" accept=".csv,text/csv"></label></div>
      <div class="actions"><button id="wmPreviewUpload" class="btn" type="button">ตรวจไฟล์ก่อนอัปโหลด</button><button id="wmCommitUpload" class="btn primary" type="button" disabled>อัปโหลดทับค่ารายคลัง</button></div>
      <div id="warehouseMinimumPreview" style="margin-top:10px">${empty('ยังไม่ได้เลือกไฟล์')}</div>
    </div>
    <form id="warehouseMinimumForm"><div style="overflow:auto;max-height:60vh">${table(headers,rows,'warehouse-minimum-table')}</div><div class="actions" style="margin-top:16px"><button class="btn primary" type="submit">บันทึก Minimum รายคลังจากตาราง</button></div></form>`);

  $('#wmDownloadTemplate').onclick=downloadWarehouseMinimumTemplate;
  $('#wmPreviewUpload').onclick=async()=>{
    const file=$('#warehouseMinimumFile').files[0];
    if(!file)return toast('กรุณาเลือกไฟล์ CSV',true);
    if(file.size>5*1024*1024)return toast('ไฟล์ต้องไม่เกิน 5 MB',true);
    const parsed=normalizeWarehouseMinimumImport(await file.text());
    const noValues=!parsed.errors.length&&parsed.rows.length===0;
    pendingWarehouseMinimumImport=(parsed.errors.length||noValues)?null:parsed;
    $('#wmCommitUpload').disabled=parsed.errors.length>0||noValues;
    if(parsed.errors.length){
      $('#warehouseMinimumPreview').innerHTML=`<div class="alert danger"><b>พบ ${nf.format(parsed.errors.length)} จุดที่ต้องแก้</b><br>${parsed.errors.slice(0,12).map(esc).join('<br>')}${parsed.errors.length>12?'<br>...':''}</div>`;
      return;
    }
    if(noValues){
      $('#warehouseMinimumPreview').innerHTML='<div class="alert warn"><b>ยังไม่มีค่า Minimum ให้นำเข้า</b><br>กรอกตัวเลขในคอลัมน์ <code>minimum_stock</code> อย่างน้อย 1 รายการก่อนอัปโหลด</div>';
      return;
    }
    const previewRows=parsed.rows.slice(0,10).map(x=>`<tr><td><b>${esc(x._preview.product_code)}</b> ${esc(x._preview.product_name)}</td><td>${esc(x._preview.warehouse_code)} ${esc(x._preview.warehouse_name)}</td><td class="num">${qty(x.minimum_stock)}</td></tr>`);
    $('#warehouseMinimumPreview').innerHTML=`<div class="alert ok"><b>ไฟล์ผ่านการตรวจสอบ</b> • ตั้งค่าเฉพาะคลัง ${nf.format(parsed.rows.length)} รายการ • เว้นว่าง/ใช้ Default ${nf.format(parsed.blankRows)} รายการ</div>${table(['สินค้า','คลัง','Minimum'],previewRows,'warehouse-minimum-upload-preview')}`;
  };
  $('#wmCommitUpload').onclick=async()=>{
    if(!pendingWarehouseMinimumImport)return toast('กรุณาตรวจไฟล์ก่อนอัปโหลด',true);
    if(!window.confirm('ยืนยันอัปโหลดทับ Minimum Stock รายคลังเดิมทั้งหมดของบริษัท?\n\nค่า Default ใน Product Master จะไม่ถูกแก้'))return;
    setLoading(true);
    try{
      const rows=pendingWarehouseMinimumImport.rows.map(({_preview,...x})=>x);
      const {error}=await db.rpc('admin_replace_warehouse_minimums',{p_rows:rows});
      if(error)throw error;
      const {data,error:readError}=await db.from('product_warehouse_minimums').select('*').order('warehouse_id').order('product_id');
      if(readError)throw readError;
      state.data.warehouseMinimums=data||[];
      pendingWarehouseMinimumImport=null;
      closeModal();toast(`อัปโหลด Minimum Stock รายคลังแล้ว ${rows.length} รายการ`);render();
    }catch(err){fail(err)}finally{setLoading(false)}
  };

  $('#warehouseMinimumForm').onsubmit=async e=>{
    e.preventDefault();
    const rows=[];
    for(const input of $$('.warehouse-min-input')){
      const raw=input.value.trim();
      if(raw==='')continue;
      const value=Number(raw);
      if(!Number.isFinite(value)||value<0)return toast('Minimum Stock ต้องเป็น 0 หรือมากกว่า',true);
      rows.push({product_id:input.dataset.product,warehouse_id:input.dataset.warehouse,minimum_stock:value});
    }
    setLoading(true);
    try{
      const {error}=await db.rpc('admin_replace_warehouse_minimums',{p_rows:rows});
      if(error)throw error;
      const {data,error:readError}=await db.from('product_warehouse_minimums').select('*').order('warehouse_id').order('product_id');
      if(readError)throw readError;
      state.data.warehouseMinimums=data||[];
      closeModal();toast('บันทึก Minimum Stock รายคลังแล้ว');render();
    }catch(err){fail(err)}finally{setLoading(false)}
  };
}
function settingsPage(){
  const policy=state.data.settings?.find(x=>x.setting_key==='contribution_alert_pct'),threshold=policy==null?12:Number(policy.setting_value),
    stockPolicy=orderStockPolicy(),numberPolicy=orderNumberPolicy(),countPolicy=stockCountPolicy(),minPolicy=minimumStockPolicy(),current=new Date().toISOString().slice(0,7),
    periodRows=state.data.periods.map(p=>`<tr><td><b>${dmy(p.period_month)}</b></td><td>${badge(p.status)}</td><td>${dmy(p.closed_at)}</td><td>${esc(p.reopen_reason||'-')}</td><td><button class="btn small-btn ${p.status==='OPEN'?'danger':''}" data-action="togglePeriod" data-id="${p.period_month}" data-status="${p.status}">${p.status==='OPEN'?'Close Month':'Reopen'}</button></td></tr>`);
  return head('ตั้งค่าระบบ','Business Rules และการควบคุมงวด')+
    cards([['แพ็กเกจ',esc(state.company.subscription_plan||'DEMO'),''],['สถานะ',esc(state.company.subscription_status||'DEMO'),state.company.trial_ends_at?`สิ้นสุด ${dmy(state.company.trial_ends_at)}`:''],['ผู้ใช้สูงสุด',nf.format(state.company.max_users||0),'บัญชี'],['รหัสบริษัท',esc(state.company.code||'-'),'ใช้ระบุบริษัทในระบบ']])+
    `<div class="panel"><h3>Order Policy</h3><p class="muted">Admin กำหนดวิธีควบคุม Stock ตั้งแต่รับ Order และรูปแบบเลข Order ของบริษัท</p><div class="form">
      <label>Order Stock Policy<select id="orderStockPolicy" data-searchable="off"><option value="WARN" ${stockPolicy==='WARN'?'selected':''}>WARN — เตือน แต่ยังรับ Order เกิน Stock ได้</option><option value="BLOCK" ${stockPolicy==='BLOCK'?'selected':''}>BLOCK — ห้ามรับ Order เกิน Available Stock</option></select></label>
      <label>Order Number Policy<select id="orderNumberPolicy" data-searchable="off"><option value="FLEXIBLE" ${numberPolicy==='FLEXIBLE'?'selected':''}>FLEXIBLE — ผู้ใช้เลือกเลขระบบหรือเลข ERP ได้</option><option value="SYSTEM" ${numberPolicy==='SYSTEM'?'selected':''}>SYSTEM — FlowBiz One รันเลขเท่านั้น</option><option value="MANUAL" ${numberPolicy==='MANUAL'?'selected':''}>MANUAL — ใช้เลข ERP / ลูกค้าเท่านั้น</option></select></label>
    </div><button class="btn primary" data-action="saveOrderPolicies">บันทึก Order Policy</button>
    <p class="muted">Warehouse Issue ยังคง Strict — ห้าม Stock ติดลบเสมอ • BLOCK ตรวจ Available Stock ณ เวลาสร้าง Order และไม่ทำ Reservation</p></div>
    <div class="panel"><h3>Stock Count Adjustment Policy</h3><p class="muted">กำหนดว่าหลังคลังตรวจนับและ Admin Final แล้ว ระบบจะทำอย่างไรกับส่วนต่าง</p><div class="form"><label>นโยบายหลัง Final<select id="stockCountPolicy" data-searchable="off"><option value="AUTO_ADJUST" ${countPolicy==='AUTO_ADJUST'?'selected':''}>AUTO ADJUST — Final แล้วปรับ Stock ตามยอดนับจริงอัตโนมัติ</option><option value="REVIEW_ONLY" ${countPolicy==='REVIEW_ONLY'?'selected':''}>REVIEW ONLY — เก็บผลตรวจและส่วนต่าง แต่ไม่เปลี่ยน Stock</option><option value="MANUAL_ADJUST" ${countPolicy==='MANUAL_ADJUST'?'selected':''}>MANUAL ADJUST — Final ผลตรวจ แล้วสร้าง Stock Adjustment เพื่อให้ Admin Post</option></select></label></div><button class="btn primary" data-action="saveStockCountPolicy">บันทึก Stock Count Policy</button><p class="muted">Policy ถูก Snapshot ตั้งแต่เริ่มรอบตรวจนับ การเปลี่ยนค่าภายหลังจะไม่ย้อนกลับไปเปลี่ยนรอบเดิม</p></div>
    <div class="panel"><h3>Minimum Stock Policy</h3><p class="muted">เลือกวิธีแจ้งเตือน Stock ต่ำกว่า Minimum โดยไม่เปลี่ยนสูตร Stock หรือธุรกรรมเดิม</p><div class="form"><label>วิธีคุม Minimum Stock<select id="minimumStockPolicy" data-searchable="off"><option value="TOTAL" ${minPolicy==='TOTAL'?'selected':''}>TOTAL — รวม Stock ทุกคลังแล้วเทียบ Minimum ของ Product</option><option value="BY_WAREHOUSE" ${minPolicy==='BY_WAREHOUSE'?'selected':''}>BY WAREHOUSE — เทียบ Stock และ Minimum แยกแต่ละคลัง</option></select></label></div>
    <div class="actions"><button class="btn primary" data-action="saveMinimumStockPolicy">บันทึก Minimum Stock Policy</button></div>
    <div class="alert ok" style="margin-top:14px"><b>โหลด CSV Minimum แยกคลังได้ตรงนี้เลย</b> • ไม่ต้องเข้าเมนูอื่น • อัปโหลดแบบ Replace เฉพาะค่า Minimum รายคลัง และไม่แก้ Default ใน Product Master</div>
    <div class="form"><label class="full">ไฟล์ Minimum Stock รายคลัง (CSV)<input id="warehouseMinimumDirectFile" type="file" accept=".csv,text/csv"></label></div>
    <div class="actions"><button class="btn" data-action="downloadWarehouseMinimumTemplate">ดาวน์โหลด Template CSV</button><button class="btn" data-action="previewWarehouseMinimumSettingsUpload">ตรวจไฟล์ CSV</button><button id="warehouseMinimumDirectCommit" class="btn primary" data-action="commitWarehouseMinimumSettingsUpload" disabled>อัปโหลดทับค่ารายคลัง</button><button class="btn" data-action="editWarehouseMinimums">แก้ค่ารายคลังในตาราง</button></div>
    <div id="warehouseMinimumDirectPreview" style="margin-top:10px">${empty('เลือกไฟล์ CSV แล้วกด “ตรวจไฟล์ CSV”')}</div>
    <p class="muted">BY WAREHOUSE: minimum_stock ว่าง = ใช้ Default จาก Product Master • ใส่ 0 = ปิด Minimum เฉพาะสินค้านั้น/คลังนั้น</p></div>
    <div class="panel"><h3>เกณฑ์แจ้งเตือน Contribution</h3><p class="muted">เฉพาะ Admin กำหนดเกณฑ์ของบริษัท • รายการที่ต่ำกว่าเกณฑ์จะแสดงบนแผงวันนี้และกดดู Invoice ได้</p><div class="form"><label>Contribution ต่ำกว่า (%)<input id="contributionThreshold" type="number" min="0" max="100" step="0.01" value="${esc(threshold)}"></label></div><button class="btn primary" data-action="saveContributionThreshold">บันทึกเกณฑ์</button><p class="muted">ค่าเริ่มต้น 12% จนกว่า Admin จะเปลี่ยน • Contribution % = (ยอดขาย − ต้นทุนสินค้า − ค่าขนส่ง − ค่าใช้จ่ายอื่น) ÷ ยอดขาย × 100</p></div>
    <div class="split"><div class="panel"><h3>Business Rules ที่ใช้งาน</h3><table><tbody><tr><td>Order Stock Policy</td><td><b>${esc(stockPolicy)}</b></td></tr><tr><td>Order Number</td><td><b>${esc(numberPolicy)}</b></td></tr><tr><td>Stock Count Policy</td><td><b>${esc(countPolicy)}</b></td></tr><tr><td>Minimum Stock</td><td><b>${esc(minPolicy)}</b></td></tr><tr><td>Stock Issue</td><td><b>Strict — ห้ามติดลบ</b></td></tr><tr><td>Partial Issue</td><td>อนุญาต พร้อมแสดงยอดค้าง</td></tr><tr><td>Revenue Qty</td><td>Customer Received Qty</td></tr><tr><td>GP Policy</td><td>${esc(state.company.gp_policy)}</td></tr><tr><td>Duplicate Submit</td><td>ป้องกันด้วย Request ID</td></tr><tr><td>POD Storage</td><td>Private • PDF/JPG/PNG • สูงสุด 10 MB</td></tr></tbody></table></div><div class="panel"><h3>ล็อกงวด</h3><div class="form"><label>เดือน<input id="newPeriodMonth" type="month" value="${current}"></label></div><button class="btn danger" data-action="closeNewPeriod">Close Month</button><p class="muted">เมื่อปิดงวด ระบบห้ามสร้าง/แก้ Order, GR, Invoice และ Monthly Cost ในเดือนนั้น</p></div></div>
    <div class="panel"><h3>ประวัติงวด</h3>${table(['เดือน','สถานะ','วันที่ปิด','เหตุผล Reopen',''],periodRows)}</div>`;
}
function backupRestoreStatusPanel(){
  const st=state.data.backupStatus||{},b=st.backup||{},verified=Boolean(st.restore_verified),ready=Boolean(st.dr_ready);
  const backupValue=st.has_backup?'VERIFIED':'ยังไม่มี';
  const restoreValue=verified?'PASSED':'ยังไม่ผ่าน';
  const statusValue=ready?'DR READY':'ต้องทดสอบ';
  const lastBackup=b.backed_up_at?dmy(b.backed_up_at):'-',lastRestore=st.restore_verified_at?dmy(st.restore_verified_at):'-';
  return '<div class="panel dr-status-panel"><div class="section-title"><div><h3>Backup & Restore Readiness</h3><span class="muted">ใช้เป็น Release Gate ก่อน Production Go-live</span></div><button class="btn small-btn" data-action="refreshBackupStatus">รีเฟรชสถานะ</button></div>'+
    '<div class="dr-status-cards">'+
      '<div class="dr-status-card"><small>Backup Archive</small><b class="'+(st.has_backup?'positive':'negative')+'">'+backupValue+'</b><span>ล่าสุด '+esc(lastBackup)+(b.kind?' • '+esc(b.kind):'')+'</span></div>'+
      '<div class="dr-status-card"><small>Restore Rehearsal</small><b class="'+(verified?'positive':'negative')+'">'+restoreValue+'</b><span>ล่าสุด '+esc(lastRestore)+'</span></div>'+
      '<div class="dr-status-card"><small>Disaster Recovery</small><b class="'+(ready?'positive':'negative')+'">'+statusValue+'</b><span>'+(ready?'พร้อมตามหลักฐาน Backup ล่าสุด':'ยังไม่อนุมัติ Production DR')+'</span></div>'+
    '</div>'+
    '<div class="alert '+(ready?'ok':'warn')+'">'+
      (ready
        ?'<b>DR Gate ผ่าน</b> Backup ล่าสุดมี Restore rehearsal ที่ตรวจ Counts / Financial totals / POD แล้ว'
        :'<b>DR Gate ยังไม่ผ่าน</b> ให้ผู้ดูแลระบบรัน <code>scripts/backup-project.mjs</code> และ Restore ไป Test Environment ด้วย <code>scripts/restore-rehearsal.mjs</code> ก่อน Production Go-live')+
    '</div></div>';
}
function dataManagementPage(){
  const isDemo=state.company?.is_demo===true||state.company?.subscription_status==='DEMO';
  const rollover=backupRestoreStatusPanel()+`<div class="panel"><h3>สำรองและเริ่มปีใหม่</h3><p>Production ให้สำรองด้วย <b>scripts/backup-project.mjs</b> และต้องมี Restore rehearsal ที่ผ่านก่อน Go-live; การปิดปีใช้ BACKUP_KIND=YEAR_END แล้วจึงนำ SHA-256 ที่ลงทะเบียนมาเริ่มปีใหม่</p><p class="muted">ล้างเฉพาะธุรกรรมและประวัติ Stock หลังปิดงานทั้งหมด เก็บ Master ผู้ใช้ การตั้งค่า Audit และยกสต็อกคงเหลือเป็นยอดต้นปี • ใช้ได้เมื่อปีสิ้นสุดแล้วและยังไม่มีธุรกรรมปีใหม่</p><button class="btn danger" data-action="yearEnd">เริ่มปีใหม่หลังสำรองข้อมูล</button></div>`;
  if(!isDemo)return head('จัดการข้อมูล','สำรองธุรกรรมและเริ่มปีใหม่โดยเก็บ Master')+rollover;
  const items=[
    ...(state.data.counts||[]).map(x=>({id:x.id,type:'STOCK_COUNT',label:x.count_no,date:x.snapshot_at,module:'ผลตรวจนับ'})),
    ...(state.data.openingBatches||[]).map(x=>({id:x.id,type:'OPENING_STOCK',label:x.reference_no,date:x.opening_date,module:'สต็อกตั้งต้น'})),
    ...(state.data.receipts||[]).map(x=>({id:x.id,type:'GOODS_RECEIPT',label:x.gr_no,date:x.receipt_date,module:'รับสินค้า'})),
    ...(state.data.transfers||[]).map(x=>({id:x.id,type:'TRANSFER',label:x.transfer_no,date:x.created_at,module:'โอนคลัง'})),
    ...(state.data.conversions||[]).map(x=>({id:x.id,type:'STOCK_CONVERSION',label:x.conversion_no,date:x.conversion_date,module:'Repack'})),
    ...(state.data.adjustments||[]).map(x=>({id:x.id,type:'STOCK_ADJUSTMENT',label:x.adjustment_no,date:x.adjustment_date,module:'Stock Adjustment'}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const rows=items.map(x=>`<tr><td><b>${esc(x.label)}</b></td><td>${esc(x.module)}</td><td>${dmy(x.date)}</td><td><button class="btn danger small-btn" data-action="deleteDemoRecord" data-id="${x.id}" data-entity="${x.type}">ลบรายการ</button></td></tr>`);
  return head('จัดการข้อมูลทดลอง','สำหรับ Admin ของบริษัท Demo เท่านั้น • ทุกการลบเก็บเหตุผลใน Audit Log','<button class="btn primary" data-action="salesHistoryImport">นำเข้าประวัติ Demo</button>')+rollover+`<div class="alert danger"><b>การลบย้อนกลับไม่ได้</b> ระบบจะให้กรอกรหัสบริษัท <b>${esc(state.company.code)}</b> และเหตุผลก่อนทำรายการ</div><div class="cards"><div class="card"><div class="label">เริ่มทดลองใหม่</div><div class="value">ธุรกรรม</div><div class="hint">ลบ Order, Stock, Count, Invoice, POD metadata แต่เก็บ Master/User/Audit</div><button class="btn danger small-btn" data-action="resetDemoData" data-id="TRANSACTIONS">ล้างธุรกรรมทดลอง</button></div><div class="card"><div class="label">เริ่มใหม่ทั้งหมด</div><div class="value">ธุรกิจ</div><div class="hint">ลบธุรกรรมและ Master แต่เก็บบริษัท ผู้ใช้ และ Audit</div><button class="btn danger small-btn" data-action="resetDemoData" data-id="ALL_BUSINESS_DATA">ล้างข้อมูลธุรกิจทั้งหมด</button></div></div><div class="panel"><h3>ลบบางรายการ</h3><p class="muted">รองรับรายการที่ระบบคำนวณ Stock กลับได้แน่นอน รายการ Order/Invoice ที่เชื่อมหลายเอกสารให้ใช้ล้างธุรกรรมทดลองทั้งชุด</p>${table(['เลขที่','ประเภท','วันที่',''],rows,'data-management-table')}</div>`;
}
function auditPage(){const rows=(state.data.audit||[]).map(x=>`<tr><td>${dmy(x.created_at)}</td><td><b>${esc(x.action)}</b></td><td>${esc(x.entity_type||'-')}</td><td>${esc(x.entity_id||'-')}</td><td>${esc(x.user_id||'-')}</td></tr>`);return head('Audit Log','ประวัติธุรกรรมสำคัญ แก้ย้อนหลังไม่ได้','<button class="btn" data-action="exportAudit">ดาวน์โหลด CSV</button>')+`<div class="panel">${table(['วันเวลา','Action','ประเภท','รายการ','User'],rows)}</div>`}
function inactivePage(){return head('ระงับการใช้งาน','บริษัทนี้หมดอายุหรือถูกระงับชั่วคราว')+'<div class="panel"><div class="alert danger">กรุณาติดต่อผู้ดูแล FlowStock เพื่อเปิดใช้งานแพ็กเกจ ระบบยังเก็บข้อมูลเดิมไว้และไม่อนุญาตให้ทำธุรกรรมใหม่</div></div>'}
function commercialPage(){if(!state.isPlatformAdmin)return empty('ไม่มีสิทธิ์ใช้งาน');const rows=(state.data.tenants||[]).map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${esc(c.subscription_plan)}</td><td>${badge(c.subscription_status)}</td><td class="num">${nf.format(c.active_users)} / ${nf.format(c.max_users)}</td><td>${c.trial_ends_at?dmy(c.trial_ends_at):'-'}</td><td>${c.is_demo?'Demo':`<button class="btn small-btn" data-action="manageTenant" data-id="${c.id}">จัดการ</button>`}</td></tr>`);return head('Commercial Control','สร้างและควบคุมบริษัทลูกค้า','<button class="btn primary" data-action="newTenant">+ เปิดบริษัทลูกค้า</button>')+cards([['บริษัททั้งหมด',nf.format(state.data.tenants?.length||0),'Tenant'],['ใช้งานจริง',nf.format((state.data.tenants||[]).filter(x=>x.subscription_status==='ACTIVE').length),'บริษัท'],['ทดลองใช้',nf.format((state.data.tenants||[]).filter(x=>x.subscription_status==='TRIAL').length),'บริษัท'],['ระงับ/หมดอายุ',nf.format((state.data.tenants||[]).filter(x=>['SUSPENDED','EXPIRED'].includes(x.subscription_status)).length),'บริษัท']])+`<div class="panel">${table(['รหัส','บริษัท','แพ็กเกจ','สถานะ','ผู้ใช้','Trial End',''],rows)}</div>`}

const actions={
  pageHelp(){showPageHelp()},
  trialGuide(){showTrialGuide()},
  async refreshBackupStatus(){setLoading(true);try{const {data,error}=await db.rpc('admin_backup_restore_status');if(error)throw error;state.data.backupStatus=data;render();toast('อัปเดตสถานะ Backup / Restore แล้ว')}catch(e){fail(e)}finally{setLoading(false)}},
  resetStockFilters(){state.search='';state.movementWarehouse='ALL';state.movementProduct='ALL';state.movementType='ALL';state.movementFrom='';state.movementTo='';state.stockBelowMin=false;render()},
  openLowStock(){state.stockBelowMin=true;state.stockView=minimumStockPolicy()==='BY_WAREHOUSE'?'BY_WAREHOUSE':'TOTAL';state.reportWarehouse='ALL';state.page='stock';state.search='';renderNav();render()},
  openLowContribution(){const date=state.data.todayStatus?.date;if(!date)return toast('ยังไม่พบข้อมูลวันนี้',true);state.lowContributionPeriod=false;state.lowContributionDate=date;state.page='profit';state.search='';state.reportPage=0;state.profitView='invoice';renderNav();render();refreshInvoicePage().catch(fail)},
  openLowContributionPeriod(){state.lowContributionDate=null;state.lowContributionPeriod=true;state.page='profit';state.search='';state.reportPage=0;state.profitView='invoice';renderNav();render();refreshInvoicePage().catch(fail)},
  closeLowContribution(){state.lowContributionDate=null;state.lowContributionPeriod=false;state.reportPage=0;render();refreshInvoicePage().catch(fail)},
  async saveOrderPolicies(){
    if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
    const stock=$('#orderStockPolicy')?.value,number=$('#orderNumberPolicy')?.value;
    const {error}=await db.rpc('admin_set_order_policies',{p_stock_policy:stock,p_number_policy:number});
    if(error)return fail(error);
    const {data,error:readError}=await db.from('app_settings').select('*');
    if(readError)return fail(readError);
    state.data.settings=data;toast('บันทึก Order Policy แล้ว');render();
  },
  async saveStockCountPolicy(){
    if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
    const policy=$('#stockCountPolicy')?.value;
    const {error}=await db.rpc('admin_set_stock_count_policy',{p_policy:policy});
    if(error)return fail(error);
    const {data,error:readError}=await db.from('app_settings').select('*');
    if(readError)return fail(readError);
    state.data.settings=data;toast('บันทึก Stock Count Policy แล้ว');render();
  },
  async saveMinimumStockPolicy(){
    if(!can('ADMIN'))return toast('เฉพาะ Admin',true);
    const policy=$('#minimumStockPolicy')?.value;
    const {error}=await db.rpc('admin_set_minimum_stock_policy',{p_policy:policy});
    if(error)return fail(error);
    const {data,error:readError}=await db.from('app_settings').select('*');
    if(readError)return fail(readError);
    state.data.settings=data;state.stockBelowMin=false;toast('บันทึก Minimum Stock Policy แล้ว');render();
  },
  editWarehouseMinimums(){warehouseMinimumModal()},
  downloadWarehouseMinimumTemplate(){downloadWarehouseMinimumTemplate()},
  previewWarehouseMinimumSettingsUpload(){previewWarehouseMinimumSettingsUpload().catch(fail)},
  commitWarehouseMinimumSettingsUpload(){commitWarehouseMinimumSettingsUpload().catch(fail)},
  async saveContributionThreshold(){if(!can('ADMIN'))return toast('เฉพาะ Admin',true);const value=$('#contributionThreshold')?.value,percent=Number(value);if(value===''||!Number.isFinite(percent)||percent<0||percent>100||Math.round(percent*100)!==percent*100)return toast('ระบุเปอร์เซ็นต์ 0–100 ทศนิยมไม่เกิน 2 ตำแหน่ง',true);const {error}=await db.rpc('admin_set_contribution_alert_pct',{p_pct:percent});if(error)return fail(error);const {data,error:readError}=await db.from('app_settings').select('*');if(readError)return fail(readError);state.data.settings=data;await Promise.all([refreshTodayStatus(),refreshReportKpis()]);toast('บันทึกเกณฑ์ Contribution แล้ว');render()},
  reportPrev(){state.reportPage=Math.max(0,state.reportPage-1);refreshInvoicePage().catch(fail)},
  reportNext(){state.reportPage++;refreshInvoicePage().catch(fail)},
  newOrder(){orderModal()},viewOrder(id){viewOrder(id)},newReceipt(){receiptModal()},newConversion(){conversionModal()},viewConversion(id){viewConversion(id)},issueOrder(id){issueModal(id)},newCount(){countModal()},openCount(id){openCount(id)},finalizeCount(id){finalizeCount(id)},adjustFromCount(id){state.prefillAdjustmentCountId=id;state.page='stockadjust';renderNav();render()},postAdjustment(id){postStockAdjustment(id)},viewAdjustment(id){viewStockAdjustment(id)},newTransfer(){transferModal()},receiveTransfer(id){receiveTransferModal(id)},newTrip(id){tripModal(id)},completeTrip(id){completeTripModal(id)},openPod(id){openPod(id)},manageMaster(id){masterModal(id)},masterImport(){masterImportModal()},salesHistoryImport(){salesHistoryImportModal()},openingStock(){openingStockModal()},newAdminUser(){adminUserModal()},resetUserPassword(id){resetUserPasswordModal(id)},saveUser(id){const b=document.querySelector(`[data-action="saveUser"][data-id="${id}"]`);saveUser(id,b?.dataset.active==='1')},toggleUser(id){const b=document.querySelector(`[data-action="toggleUser"][data-id="${id}"]`);saveUser(id,b?.dataset.active!=='1')},openCustomerProfit(id){state.reportCustomer=id;state.profitView='invoice';state.page='profit';state.search='';state.reportPage=0;renderNav();render();refreshReportData().catch(fail)},closeNewPeriod(){setPeriod($('#newPeriodMonth').value+'-01','CLOSED')},togglePeriod(id){const b=document.querySelector(`[data-action="togglePeriod"][data-id="${id}"]`);if(b?.dataset.status==='OPEN')setPeriod(id,'CLOSED');else reopenPeriod(id)},deleteDemoRecord(id){const b=document.querySelector(`[data-action="deleteDemoRecord"][data-id="${id}"]`);deleteDemoRecordModal(id,b?.dataset.entity)},resetDemoData(scope){resetDemoDataModal(scope)},yearEnd(){yearEndModal()},exportOrders(){exportOrders()},exportStock(){exportStock()},exportMovements(){exportMovements()},emailStockReport(){emailStockReport()},exportProfit(){exportProfit()},exportAudit(){exportAudit()},printReport(){window.print()},newTenant(){tenantModal()},manageTenant(id){manageTenantModal(id)}
};
function demoDeleteConfirmation(title,description,onSubmit){modal(`<h2>${esc(title)}</h2><div class="alert danger">${esc(description)} การทำรายการนี้ย้อนกลับไม่ได้</div><form id="demoDeleteForm"><div class="form"><label>พิมพ์รหัสบริษัทเพื่อยืนยัน<input id="deleteCompanyCode" autocomplete="off" placeholder="${esc(state.company.code)}" required></label><label class="full">เหตุผลที่ลบ (อย่างน้อย 5 ตัวอักษร)<textarea id="deleteReason" minlength="5" required placeholder="เช่น ลบข้อมูลที่ทดลองกรอกผิด"></textarea></label></div><button class="btn danger wide" type="submit">ยืนยันลบข้อมูล</button></form>`);$('#demoDeleteForm').onsubmit=async e=>{e.preventDefault();if($('#deleteCompanyCode').value.trim().toUpperCase()!==String(state.company.code).toUpperCase())return toast('รหัสบริษัทยืนยันไม่ถูกต้อง',true);await onSubmit($('#deleteCompanyCode').value.trim(),$('#deleteReason').value.trim())}}
function deleteDemoRecordModal(id,entity){if(!entity)return toast('ไม่พบประเภทรายการ',true);demoDeleteConfirmation('ลบรายการทดลอง',`ลบ ${entity} และคำนวณ Stock คงเหลือใหม่`,async(code,reason)=>{await runRpc('admin_delete_demo_record',{p_entity_type:entity,p_entity_id:id,p_company_code:code,p_reason:reason},r=>`ลบ ${r.reference_no} และคำนวณ Stock ใหม่แล้ว`)})}
function yearEndModal(){const year=new Date().getFullYear()-1;modal(`<h2>เริ่มปีใหม่หลังสำรองข้อมูล</h2><div class="alert danger">รายการธุรกรรมเดิมจะถูกลบ และ Stock คงเหลือจะเป็นยอดยกมาต้นปี กรุณาตรวจสอบไฟล์สำรองและ SHA-256 ก่อนยืนยัน</div><form id="yearEndForm"><div class="form"><label>ปีที่ปิด<input id="closeYear" type="number" min="2000" max="${year}" value="${year}" required></label><label>รหัสบริษัท<input id="yearCompanyCode" autocomplete="off" required></label><label class="full">SHA-256 ของไฟล์สำรองที่ผู้ดูแลฐานข้อมูลลงทะเบียนแล้ว<input id="yearArchiveHash" pattern="[a-fA-F0-9]{64}" required></label><label class="full">เหตุผลและเลขอ้างอิงการปิดปี<textarea id="yearReason" minlength="10" required></textarea></label></div><button class="btn danger wide" type="submit">ยืนยันเริ่มปีใหม่</button></form>`);$('#yearEndForm').onsubmit=async e=>{e.preventDefault();setLoading(true);$('#modalBody').dataset.busy='1';try{const {data,error}=await db.rpc('admin_rollover_year',{p_year:Number($('#closeYear').value),p_archive_sha256:$('#yearArchiveHash').value.trim().toLowerCase(),p_company_code:$('#yearCompanyCode').value.trim(),p_reason:$('#yearReason').value.trim()});if(error)throw error;$('#modalBody').dataset.busy='0';closeModal();toast(`เริ่มปีใหม่แล้ว • ยกยอด Stock ${data.opening_stock_lines} รายการ`);await loadData();render()}catch(err){fail(err)}finally{$('#modalBody').dataset.busy='0';setLoading(false)}}}
function resetDemoDataModal(scope){const all=scope==='ALL_BUSINESS_DATA';demoDeleteConfirmation(all?'ล้างข้อมูลธุรกิจทั้งหมด':'ล้างธุรกรรมทดลอง',all?'ลบธุรกรรมและ Master ทั้งหมด แต่คงบริษัท ผู้ใช้ และ Audit Log':'ลบธุรกรรม Stock และเอกสารทดลองทั้งหมด แต่คง Master ผู้ใช้ และ Audit Log',async(code,reason)=>{setLoading(true);try{const paths=(state.data.deliveryDocs||[]).map(x=>x.object_path).filter(Boolean);if(paths.length){for(let i=0;i<paths.length;i+=100){const {error}=await db.storage.from('pod-documents').remove(paths.slice(i,i+100));if(error)throw error}}const {data,error}=await db.rpc('admin_reset_demo_data',{p_scope:scope,p_company_code:code,p_reason:reason});if(error)throw error;toast(data.scope==='ALL_BUSINESS_DATA'?'ล้างข้อมูลธุรกิจทดลองทั้งหมดแล้ว':'ล้างธุรกรรมทดลองทั้งหมดแล้ว');closeModal();await loadData();render()}catch(e){fail(e)}finally{setLoading(false)}})}
function option(list,label,val='id'){return state.data[list].filter(x=>x.active!==false).map(x=>`<option value="${x[val]}">${esc(label(x))}</option>`).join('')}
function orderLineHtml(){return `<div class="line-editor order-line"><label>สินค้า<select class="ol-product">${option('products',x=>`${x.code} • ${x.name}`)}</select></label><label>คลัง<select class="ol-wh">${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label>จำนวน<input class="ol-qty" type="number" min="0.0001" step="any" required></label><label>ราคา/หน่วย<input class="ol-price" type="number" min="0" step="any" required></label><button type="button" class="btn danger remove-line">ลบ</button></div>`}
function wireLines(kind){const area=$(`#${kind}Lines`);area.querySelectorAll('.remove-line').forEach(b=>b.onclick=()=>{if(area.children.length>1)b.parentElement.remove()});if(kind==='order')area.querySelectorAll('select,input').forEach(el=>el.onchange=updateOrderStock)}
function orderModal(){
  const stockPolicy=orderStockPolicy(),numberPolicy=orderNumberPolicy();
  const numberFields=numberPolicy==='SYSTEM'
    ?'<label>เลข Order<input value="ระบบรันเลขให้อัตโนมัติ" disabled></label>'
    :numberPolicy==='MANUAL'
      ?'<label>เลข Order จาก ERP / ลูกค้า<input id="oOrderNo" maxlength="100" placeholder="เช่น PO-CUST-2026-00125" required></label>'
      :'<label>วิธีเลข Order<select id="oNoMode" data-searchable="off"><option value="SYSTEM">ให้ FlowBiz One รันเลข</option><option value="MANUAL">ใช้เลขจาก ERP / ลูกค้า</option></select></label><label id="oOrderNoWrap" class="hidden">เลข Order จาก ERP / ลูกค้า<input id="oOrderNo" maxlength="100" placeholder="เช่น PO-CUST-2026-00125"></label>';
  const policyText=stockPolicy==='BLOCK'?'BLOCK — ห้ามรับ Order เกิน Available Stock':'WARN — เตือนเมื่อเกิน Stock แต่ยังรับ Order ได้';
  modal(`<h2>สร้าง Order</h2><p class="muted">Order Stock Policy: <b>${esc(policyText)}</b></p><form id="orderForm"><div class="form"><label>ลูกค้า<select id="oCustomer" required>${option('customers',x=>`${x.code} • ${x.name}`)}</select></label><label>วันที่ Order<input id="oDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>กำหนดส่ง<input id="oDelivery" type="datetime-local" value="${localInput(86400000)}"></label>${numberFields}</div><h3>รายการสินค้า</h3><div id="orderLines">${orderLineHtml()}</div><button type="button" id="addOrderLine" class="btn">+ เพิ่มสินค้า</button><div id="orderStockNote" class="alert ${stockPolicy==='BLOCK'?'danger':'warn'}"></div><div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">ยืนยัน Order</button><button id="cancelOrder" class="btn" type="button">ยกเลิก</button></div></form>`);
  $('#addOrderLine').onclick=()=>{$('#orderLines').insertAdjacentHTML('beforeend',orderLineHtml());wireLines('order');updateOrderStock()};
  $('#cancelOrder').onclick=closeModal;
  if($('#oNoMode'))$('#oNoMode').onchange=()=>{const manual=$('#oNoMode').value==='MANUAL';$('#oOrderNoWrap').classList.toggle('hidden',!manual);if($('#oOrderNo')){$('#oOrderNo').required=manual;if(!manual)$('#oOrderNo').value=''}};
  wireLines('order');updateOrderStock();$('#orderForm').onsubmit=saveOrder;
}
function orderStockShortages(){
  const grouped=new Map();
  $$('.order-line').forEach(r=>{
    const p=r.querySelector('.ol-product').value,w=r.querySelector('.ol-wh').value,q=Number(r.querySelector('.ol-qty').value||0),key=p+'|'+w;
    const item=grouped.get(key)||{product_id:p,warehouse_id:w,qty:0};item.qty+=q;grouped.set(key,item);
  });
  return [...grouped.values()].map(x=>({...x,available:stockAvailable(x.product_id,x.warehouse_id)})).filter(x=>x.qty>x.available);
}
function updateOrderStock(){
  const shortages=orderStockShortages(),policy=orderStockPolicy();
  const notes=$$('.order-line').map(r=>{const p=r.querySelector('.ol-product').value,w=r.querySelector('.ol-wh').value,q=Number(r.querySelector('.ol-qty').value||0),a=stockAvailable(p,w);return `${product(p).code||''} / ${warehouse(w).code||''}: Available ${qty(a)}${q>a?` • ขาด ${qty(q-a)}`:''}`});
  const box=$('#orderStockNote');if(!box)return;
  box.className='alert '+(shortages.length?(policy==='BLOCK'?'danger':'warn'):'ok');
  box.innerHTML=(shortages.length?(policy==='BLOCK'?'<b>BLOCK:</b> Order เกิน Available Stock ระบบจะไม่อนุญาตให้ยืนยัน<br>':'<b>WARN:</b> Order เกิน Available Stock แต่ยังยืนยันได้<br>'):'<b>Stock เพียงพอ</b><br>')+notes.join('<br>');
}
async function saveOrder(e){
  e.preventDefault();
  const lines=$$('.order-line').map(r=>({product_id:r.querySelector('.ol-product').value,warehouse_id:r.querySelector('.ol-wh').value,qty:Number(r.querySelector('.ol-qty').value),unit_price:Number(r.querySelector('.ol-price').value)})),
    delivery=$('#oDelivery').value,numberPolicy=orderNumberPolicy(),mode=numberPolicy==='FLEXIBLE'?($('#oNoMode')?.value||'SYSTEM'):numberPolicy,
    manualNo=mode==='MANUAL'?($('#oOrderNo')?.value||'').trim():'';
  if(lines.some(x=>!x.qty||x.unit_price<0))return toast('กรอกจำนวนและราคาให้ครบ',true);
  if(mode==='MANUAL'&&!manualNo)return toast('กรุณาระบุเลข Order จาก ERP / ลูกค้า',true);
  const shortages=orderStockShortages();
  if(orderStockPolicy()==='BLOCK'&&shortages.length){
    const x=shortages[0];return toast(`Order เกิน Stock: ${product(x.product_id).code} / ${warehouse(x.warehouse_id).code} ต้องการ ${qty(x.qty)} แต่ Available ${qty(x.available)}`,true);
  }
  await runRpc('create_order',{
    p_customer_id:$('#oCustomer').value,p_order_date:$('#oDate').value,
    p_requested_delivery_at:delivery?new Date(delivery).toISOString():null,
    p_lines:lines,p_request_id:requestId('ORDER'),p_order_no:manualNo||null
  },r=>`สร้าง ${r.order_no} สำเร็จ`);
}
function viewOrder(id){const o=byId('orders',id),rows=orderLines(id).map(l=>`<tr><td>${esc(product(l.product_id).code)} ${esc(product(l.product_id).name)}</td><td>${esc(warehouse(l.warehouse_id).code)}</td><td class="num">${qty(l.qty)}</td><td class="num">${qty(l.issued_qty)}</td><td class="num">${money(l.unit_price)}</td><td class="num">${money(Number(l.qty)*Number(l.unit_price))}</td></tr>`);modal(`<h2>${esc(o.order_no)}</h2><p>${esc(customerName(o.customer_id))} • ${badge(o.status)}</p>${table(['สินค้า','คลัง','Order Qty','Issued','ราคา','มูลค่า'],rows)}`)}
function receiptLineHtml(){return `<div class="line-editor receipt-line"><label>สินค้า<select class="gr-product">${option('products',x=>`${x.code} • ${x.name}`)}</select></label><label>จำนวน<input class="gr-qty" type="number" min="0.0001" step="any" required></label><label>Unit Cost<input class="gr-cost" type="number" min="0" step="any"></label><span></span><button type="button" class="btn danger remove-line">ลบ</button></div>`}
function receiptModal(){modal(`<h2>รับสินค้าเข้าคลัง</h2><form id="receiptForm"><div class="form"><label>คลัง<select id="grWh">${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label>Vendor<select id="grSupplier"><option value="">— ไม่ระบุ —</option>${option('suppliers',x=>`${x.code} • ${x.name}`)}</select></label><label>เอกสารอ้างอิง<input id="grRef" required></label><label>วันที่รับ<input id="grDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label></div><h3>รายการสินค้า</h3><div id="receiptLines">${receiptLineHtml()}</div><button type="button" id="addReceiptLine" class="btn">+ เพิ่มสินค้า</button><div class="actions" style="margin-top:18px"><button class="btn primary">ยืนยันรับสินค้า</button></div></form>`);$('#addReceiptLine').onclick=()=>{$('#receiptLines').insertAdjacentHTML('beforeend',receiptLineHtml());wireLines('receipt')};wireLines('receipt');$('#receiptForm').onsubmit=async e=>{e.preventDefault();const lines=$$('.receipt-line').map(r=>({product_id:r.querySelector('.gr-product').value,qty:Number(r.querySelector('.gr-qty').value),unit_cost:r.querySelector('.gr-cost').value||null}));if(lines.some(x=>!x.qty||x.qty<=0))return toast('กรอกจำนวนรับให้ครบและมากกว่า 0',true);await runRpc('post_goods_receipt',{p_warehouse_id:$('#grWh').value,p_supplier_id:$('#grSupplier').value||null,p_source_doc_no:$('#grRef').value.trim(),p_receipt_date:$('#grDate').value,p_lines:lines,p_request_id:requestId('GR')},r=>`รับสินค้า ${r.gr_no} สำเร็จ`)}}
function issueModal(id){const o=byId('orders',id),rows=orderLines(id).filter(l=>Number(l.qty)>Number(l.issued_qty)).map(l=>`<div class="line-editor issue-line" data-id="${l.id}"><label>สินค้า<input value="${esc(product(l.product_id).code)} • ${esc(product(l.product_id).name)}" disabled></label><label>Available<input value="${qty(stockAvailable(l.product_id,l.warehouse_id))}" disabled></label><label>คงเหลือต้องจ่าย<input value="${qty(Number(l.qty)-Number(l.issued_qty))}" disabled></label><label>จ่ายครั้งนี้<input class="issue-qty" type="number" min="0.0001" max="${Number(l.qty)-Number(l.issued_qty)}" step="any" value="${Math.min(Number(l.qty)-Number(l.issued_qty),stockAvailable(l.product_id,l.warehouse_id))}" required></label></div>`).join('');modal(`<h2>จ่ายสินค้า ${esc(o.order_no)}</h2><div class="alert warn">ระบบห้าม Stock ติดลบ หากของไม่พอสามารถจ่ายบางส่วนได้</div><form id="issueForm">${rows}<div class="actions"><button class="btn primary">ยืนยันตัด Stock</button></div></form>`);$('#issueForm').onsubmit=async e=>{e.preventDefault();const lines=$$('.issue-line').map(r=>({order_line_id:r.dataset.id,qty:Number(r.querySelector('.issue-qty').value)})).filter(x=>x.qty>0);await runRpc('issue_order',{p_order_id:id,p_lines:lines,p_request_id:requestId('ISSUE')},r=>`จ่ายสินค้าแล้ว • ${statusThai[r.status]||r.status}`)}}
function conversionLineHtml(){
  const prodOpts=state.data.products.filter(x=>x.active!==false).map(p=>`<option value="${p.id}">${esc(p.code)} • ${esc(p.name)} • ${esc(p.base_uom||'')}</option>`).join('');
  return `<div class="line-editor conversion-line"><label>จากสินค้า<select class="cv-from">${prodOpts}</select></label><label>เป็นสินค้า<select class="cv-to">${prodOpts}</select></label><label>Qty Out<input class="cv-out" type="number" min="0.0001" step="any" required></label><label>Qty In<input class="cv-in" type="number" min="0.0001" step="any" required></label><label class="full">เหตุผล / หมายเหตุบรรทัด<input class="cv-reason" placeholder="เช่น Tank → Drum / Loss จากการถ่าย"></label><div class="conversion-available muted"></div><button class="btn danger small-btn remove-conversion-line" type="button">ลบบรรทัด</button></div>`;
}
function wireConversionLines(){
  const area=$('#conversionLines');if(!area)return;
  const refresh=row=>{const wid=$('#cvWarehouse')?.value,pid=row.querySelector('.cv-from')?.value,a=wid&&pid?stockAvailable(pid,wid):0,p=product(pid);row.querySelector('.conversion-available').textContent=`Available ต้นทาง: ${qty(a)} ${p.base_uom||''}`;};
  area.querySelectorAll('.conversion-line').forEach(row=>{
    row.querySelector('.remove-conversion-line').onclick=()=>{if(area.querySelectorAll('.conversion-line').length>1)row.remove()};
    row.querySelector('.cv-from').onchange=()=>refresh(row);
    row.querySelector('.cv-out').oninput=()=>refresh(row);
    refresh(row);
  });
}
function conversionModal(){
  modal(`<h2>Repack / Stock Conversion</h2><div class="alert warn">คลังเป็นผู้ทำรายการได้ทันที • ระบบห้าม Stock ต้นทางติดลบ • ทุกบรรทัดสร้าง Movement OUT/IN คู่กัน • ถ้าผิดให้ Reverse ไม่แก้ Stock ตรง</div>
  <form id="conversionForm"><div class="form"><label>วันที่<input id="cvDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>คลัง<select id="cvWarehouse" required>${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label class="full">หมายเหตุ Batch<input id="cvNote" placeholder="เช่น Repack รอบเช้า / Batch 25-09-A"></label></div>
  <h3>รายการ Conversion</h3><div id="conversionLines">${conversionLineHtml()}</div><button id="addConversionLine" class="btn" type="button">+ เพิ่มรายการ</button>
  <div class="actions" style="margin-top:18px"><button class="btn primary" type="submit">Post Conversion</button><button class="btn" id="cancelConversion" type="button">ยกเลิก</button></div></form>`);
  $('#addConversionLine').onclick=()=>{$('#conversionLines').insertAdjacentHTML('beforeend',conversionLineHtml());wireConversionLines()};
  $('#cancelConversion').onclick=closeModal;
  $('#cvWarehouse').onchange=wireConversionLines;
  wireConversionLines();
  $('#conversionForm').onsubmit=async e=>{
    e.preventDefault();
    const lines=$$('.conversion-line').map(r=>({from_product_id:r.querySelector('.cv-from').value,to_product_id:r.querySelector('.cv-to').value,qty_out:Number(r.querySelector('.cv-out').value),qty_in:Number(r.querySelector('.cv-in').value),reason:r.querySelector('.cv-reason').value.trim()||null}));
    if(lines.some(x=>!x.qty_out||!x.qty_in||x.qty_out<=0||x.qty_in<=0))return toast('กรอก Qty Out / Qty In ให้ครบและมากกว่า 0',true);
    if(lines.some(x=>x.from_product_id===x.to_product_id))return toast('สินค้า From และ To ต้องเป็นคนละรหัส',true);
    const grouped=new Map();
    lines.forEach(x=>{const key=x.from_product_id,old=grouped.get(key)||0;grouped.set(key,old+x.qty_out)});
    for(const [pid,total] of grouped){const avail=stockAvailable(pid,$('#cvWarehouse').value);if(total>avail)return toast(`Stock ไม่พอ: ${product(pid).code} ต้องการ ${qty(total)} แต่ Available ${qty(avail)}`,true)}
    await runRpc('post_stock_conversion',{p_warehouse_id:$('#cvWarehouse').value,p_conversion_date:$('#cvDate').value,p_lines:lines,p_note:$('#cvNote').value.trim()||null,p_request_id:requestId('CONV')},r=>`Post ${r.conversion_no} สำเร็จ • ${r.line_count} รายการ`);
  };
}
function viewConversion(id){
  const c=(state.data.conversions||[]).find(x=>x.id===id);if(!c)return toast('ไม่พบ Conversion',true);
  const lines=(state.data.conversionLines||[]).filter(x=>x.conversion_id===id).map(l=>{const fp=product(l.from_product_id),tp=product(l.to_product_id),same=fp.base_uom&&fp.base_uom===tp.base_uom,loss=same?Number(l.qty_out)-Number(l.qty_in):null;return `<tr><td>${l.line_no}</td><td><b>${esc(fp.code||'-')}</b> ${esc(fp.name||'')}</td><td class="num">${qty(l.qty_out)} ${esc(fp.base_uom||'')}</td><td><b>${esc(tp.code||'-')}</b> ${esc(tp.name||'')}</td><td class="num">${qty(l.qty_in)} ${esc(tp.base_uom||'')}</td><td class="num">${loss==null?'-':qty(loss)}</td><td>${esc(l.reason||'-')}</td></tr>`});
  modal(`<h2>${esc(c.conversion_no)}</h2><div class="form"><label>วันที่<input value="${esc(dmy(c.conversion_date))}" disabled></label><label>คลัง<input value="${esc(warehouse(c.warehouse_id).code||'-')} • ${esc(warehouse(c.warehouse_id).name||'')}" disabled></label><label>สถานะ<input value="${esc(c.status)}" disabled></label><label>หมายเหตุ<input value="${esc(c.note||'-')}" disabled></label></div>${table(['#','From','Qty Out','To','Qty In','Loss*','เหตุผล'],lines,'conversion-detail',[0,2,4,5])}<p class="muted">* Loss แสดงเมื่อ From/To ใช้ UoM เดียวกันเท่านั้น</p><div class="actions">${c.status==='POSTED'?'<button class="btn danger" id="reverseConversionBtn" type="button">Reverse Conversion</button>':''}<button class="btn" id="closeConversionView" type="button">ปิด</button></div>`);
  if($('#closeConversionView'))$('#closeConversionView').onclick=closeModal;
  if($('#reverseConversionBtn'))$('#reverseConversionBtn').onclick=()=>reverseConversionModal(id);
}
function reverseConversionModal(id){
  const c=(state.data.conversions||[]).find(x=>x.id===id);if(!c)return;
  modal(`<h2>Reverse ${esc(c.conversion_no)}</h2><div class="alert danger">ระบบจะตัด Stock ที่รับเข้าออก และคืน Stock ต้นทางตามรายการเดิม หาก Stock ปลายทางไม่พอ ระบบจะ Block</div><form id="reverseConversionForm"><label>เหตุผล Reverse<textarea id="cvReverseReason" minlength="5" required placeholder="อย่างน้อย 5 ตัวอักษร"></textarea></label><div class="actions"><button class="btn danger" type="submit">ยืนยัน Reverse</button><button class="btn" id="cancelReverseConversion" type="button">ยกเลิก</button></div></form>`);
  $('#cancelReverseConversion').onclick=closeModal;
  $('#reverseConversionForm').onsubmit=async e=>{e.preventDefault();await runRpc('reverse_stock_conversion',{p_conversion_id:id,p_reason:$('#cvReverseReason').value.trim(),p_request_id:requestId('CONV-REV')},r=>`Reverse ${r.conversion_no} สำเร็จ`)};
}
function transferModal(){modal(`<h2>สร้างใบโอนคลัง</h2><div class="alert">กรอกเลขใบโอนของ ERP/บริษัทได้ หรือเว้นว่างให้ FlowBiz One รันเลขให้อัตโนมัติ</div><form id="transferForm"><div class="form"><label>เลขเอกสารใบโอน (ไม่บังคับ)<input id="trDocNo" maxlength="100" placeholder="เช่น TF-2609-001 • เว้นว่าง = Auto"></label><label>คลังต้นทาง<select id="trFrom">${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label>คลังปลายทาง<select id="trTo">${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label>สินค้า<select id="trProduct">${option('products',x=>`${x.code} • ${x.name}`)}</select></label><label>จำนวนส่ง<input id="trQty" type="number" min="0.0001" step="any" required></label></div><div id="trAvailable" class="alert warn"></div><div class="actions"><button class="btn primary">ยืนยันส่งโอน</button><button class="btn" type="button" id="cancelTransfer">ยกเลิก</button></div></form>`);const update=()=>$('#trAvailable').textContent=`Available ต้นทาง ${qty(stockAvailable($('#trProduct').value,$('#trFrom').value))} ${product($('#trProduct').value).base_uom||''}`;$('#trFrom').onchange=update;$('#trProduct').onchange=update;$('#cancelTransfer').onclick=closeModal;update();$('#transferForm').onsubmit=async e=>{e.preventDefault();const from=$('#trFrom').value,to=$('#trTo').value,amount=Number($('#trQty').value),docNo=$('#trDocNo').value.trim();if(from===to)return toast('คลังต้นทางและปลายทางต้องไม่ซ้ำกัน',true);if(amount>stockAvailable($('#trProduct').value,from))return toast('จำนวนโอนมากกว่า Available Stock',true);await runRpc('create_transfer',{p_from_warehouse_id:from,p_to_warehouse_id:to,p_product_id:$('#trProduct').value,p_qty:amount,p_request_id:requestId('TRANSFER'),p_transfer_no:docNo||null},r=>`สร้าง ${r.transfer_no} สำเร็จ`)}}
function countModal(){
  state.activeCount=null;state.activeCountLines=[];
  modal(`<h2>เริ่มรอบตรวจนับ Stock</h2><p class="muted">เลือกคลังแล้วระบบจะ Snapshot Book Qty และ Policy ของรอบนี้</p><form id="startCountForm"><div class="form"><label>คลังสินค้า<select id="countWh" required>${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label></div><div class="alert">Policy ปัจจุบัน: <b>${esc(stockCountPolicy())}</b> • รอบที่เริ่มแล้วจะใช้ Policy นี้จนจบรอบ</div><div class="actions"><button class="btn primary" type="submit">เริ่มตรวจนับ</button><button class="btn" id="cancelStartCount" type="button">ยกเลิก</button></div></form>`);
  $('#cancelStartCount').onclick=closeModal;
  $('#startCountForm').onsubmit=async e=>{
    e.preventDefault();setLoading(true);
    try{
      const {data,error}=await db.rpc('start_stock_count',{p_warehouse_id:$('#countWh').value,p_request_id:requestId('COUNT_START')});
      if(error)throw error;
      state.activeCount={id:data.id,count_no:data.count_no,warehouse_id:data.warehouse_id,status:data.status,snapshot_at:data.snapshot_at,adjustment_policy:data.adjustment_policy};
      state.activeCountLines=(data.lines||[]).map(x=>({...x,pile_values:Array.isArray(x.pile_values)?x.pile_values:[]}));
      closeModal();renderCountEditor(false);
    }catch(err){fail(err)}finally{setLoading(false)}
  };
}
function countPayload(){return state.activeCountLines.map(l=>{const row=document.querySelector(`.count-line[data-id="${l.id}"]`),value=row?.querySelector('.count-qty')?.value,reason=row?.querySelector('.count-reason')?.value.trim()||null;return {...l,count_qty:value===''||value==null?null:Number(value),pile_values:l.pile_values||[],variance_reason:reason}})}
function refreshCountLine(id){const row=document.querySelector(`.count-line[data-id="${id}"]`);if(!row)return;const line=state.activeCountLines.find(x=>x.id===id),actual=Number(row.querySelector('.count-qty')?.value||0),diff=actual-Number(line?.book_qty||0),el=row.querySelector('.count-diff');if(el){el.textContent=qty(diff);el.className=`count-diff ${diff<0?'negative':diff>0?'positive':''}`}}
function renderCountResult(c,payload,wh){
  const complete=payload.length>0&&payload.every(x=>x.count_qty!=null),book=payload.reduce((s,x)=>s+Number(x.book_qty||0),0),actual=complete?payload.reduce((s,x)=>s+Number(x.count_qty||0),0):null,diff=actual==null?null:actual-book,lines=payload.map(l=>{const p=product(l.product_id),piles=Array.isArray(l.pile_values)?l.pile_values:[],lineDiff=l.count_qty==null?null:Number(l.count_qty)-Number(l.book_qty||0);return `<div class="count-line readonly" data-id="${l.id}"><div class="count-product"><b>${esc(p.code||'-')}</b> ${esc(p.name||'')}<small>${esc(p.base_uom||'')}</small></div><div class="count-book num">${qty(l.book_qty)}</div><div class="count-actual num">${l.count_qty==null?'-':qty(l.count_qty)}</div><div class="count-piles readonly-piles">${piles.length?piles.map((x,i)=>`<span class="badge">กอง ${i+1}: ${qty(x)}</span>`).join(' '):'<span class="muted">—</span>'}</div><div class="count-reason-text">${esc(l.variance_reason||'-')}</div><div class="count-diff ${lineDiff<0?'negative':lineDiff>0?'positive':''}">${lineDiff==null?'-':`${lineDiff>0?'+':''}${qty(lineDiff)}`}</div></div>`}).join('');
  modal(`<h2>ผลตรวจนับ • ${esc(c.count_no)}</h2><p class="muted">${esc(wh.code||'-')} • Snapshot ${dmy(c.snapshot_at)} • สถานะ ${statusThai[c.status]||c.status}</p>${cards([['Book Qty',qty(book),'ยอดตามระบบ'],['ยอดตรวจจริง',actual==null?'-':qty(actual),complete?'นับครบแล้ว':'อยู่ระหว่างนับ'],['ส่วนต่าง',diff==null?'-':`${diff>0?'+':''}${qty(diff)}`,'สุทธิ'],['สินค้า',nf.format(payload.length),'SKU']])}<div class="count-grid-head readonly"><span>สินค้า</span><span>Book</span><span>ตรวจจริง</span><span>นับหลายกอง</span><span>เหตุผล</span><span>ส่วนต่าง</span></div><div id="countLines">${lines||empty()}</div><div class="actions" style="margin-top:16px">${c.status==='SUBMITTED'&&can('ADMIN')?'<button id="finalCountBtn" class="btn primary">Admin Final Adjustment</button>':''}<button type="button" id="closeCountBtn" class="btn">ปิด</button></div>`);
  $('#closeCountBtn').onclick=closeModal;if($('#finalCountBtn'))$('#finalCountBtn').onclick=()=>finalizeCount(c.id);
}
function renderCountEditor(readOnly=false){
  const c=state.activeCount,payload=state.activeCountLines,wh=warehouse(c.warehouse_id);
  if(readOnly)return renderCountResult(c,payload,wh);
  const lines=payload.map(l=>{const p=product(l.product_id),piles=Array.isArray(l.pile_values)?l.pile_values:[];return `<div class="count-line" data-id="${l.id}"><div class="count-product"><b>${esc(p.code||'-')}</b> ${esc(p.name||'')}<small>${esc(p.base_uom||'')} • Book ${qty(l.book_qty)}</small></div><div class="count-qty-control"><button type="button" class="btn small-btn count-minus" ${readOnly?'disabled':''}>−</button><input class="count-qty" type="number" min="0" step="any" value="${l.count_qty==null?'':esc(l.count_qty)}" ${readOnly?'disabled':''}><button type="button" class="btn small-btn count-plus" ${readOnly?'disabled':''}>+</button></div><div class="count-piles"><input class="pile-input" type="number" min="0" step="any" placeholder="จำนวนกอง"><button type="button" class="btn small-btn add-pile" ${readOnly?'disabled':''}>+ เพิ่มกอง</button><button type="button" class="btn small-btn sum-piles" ${readOnly?'disabled':''}>รวมเลข</button><button type="button" class="btn small-btn clear-piles" ${readOnly?'disabled':''}>ล้าง</button><div class="pile-list">${piles.map((x,i)=>`<span class="badge">กอง ${i+1}: ${qty(x)}</span>`).join('')}</div></div><label class="count-reason-wrap">เหตุผลส่วนต่าง<input class="count-reason" placeholder="บังคับเมื่อยอดต่าง" value="${esc(l.variance_reason||'')}" ${readOnly?'disabled':''}></label><div class="count-diff">${l.count_qty==null?'-':qty(Number(l.count_qty)-Number(l.book_qty))}</div>${readOnly?'':`<button type="button" class="btn small-btn save-count-line">บันทึกและรายการถัดไป</button>`}</div>`}).join('');
  modal(`<h2>${readOnly?'ผลตรวจนับ':'ตรวจนับ Stock'} • ${esc(c.count_no)}</h2><p class="muted">${esc(wh.code||'-')} • Snapshot ${dmy(c.snapshot_at)} • สถานะ ${statusThai[c.status]||c.status}</p><div class="alert ${c.status==='DRAFT'?'warn':'ok'}">${c.status==='DRAFT'?'ยอด Book เป็น Snapshot • Policy รอบนี้ '+esc(c.adjustment_policy||'AUTO_ADJUST')+' • ยังไม่เปลี่ยน Stock':'รอบนี้ส่งแล้ว • Policy '+esc(c.adjustment_policy||'AUTO_ADJUST')+' • Admin Final ตามนโยบายที่ล็อกไว้'}</div><div class="count-grid-head"><span>สินค้า / Book</span><span>ยอดตรวจจริง</span><span>นับหลายกอง</span><span>เหตุผล</span><span>ส่วนต่าง</span><span></span></div><div id="countLines">${lines||empty()}</div><div class="actions" style="margin-top:16px">${readOnly&&c.status==='SUBMITTED'&&can('ADMIN')?'<button id="finalCountBtn" class="btn primary">Admin Final</button>':''}${!readOnly?'<button id="submitCountBtn" class="btn primary">Submit ผลตรวจนับ</button>':''}<button type="button" id="closeCountBtn" class="btn">ปิด</button></div>`);
  $('#closeCountBtn').onclick=closeModal;
  $$('.count-line').forEach(row=>{const id=row.dataset.id;if(readOnly)return;row.querySelector('.count-plus').onclick=()=>{const x=row.querySelector('.count-qty');x.value=Number(x.value||0)+1;refreshCountLine(id)};row.querySelector('.count-minus').onclick=()=>{const x=row.querySelector('.count-qty');x.value=Math.max(0,Number(x.value||0)-1);refreshCountLine(id)};row.querySelector('.count-qty').oninput=()=>refreshCountLine(id);row.querySelector('.add-pile').onclick=()=>{const x=row.querySelector('.pile-input'),n=Number(x.value);if(!Number.isFinite(n)||n<0)return toast('กรอกจำนวนกองให้ถูกต้อง',true);state.activeCountLines=countPayload();const l=state.activeCountLines.find(v=>v.id===id);l.pile_values=[...(l.pile_values||[]),n];x.value='';renderCountEditor(false)};row.querySelector('.sum-piles').onclick=()=>{const l=state.activeCountLines.find(v=>v.id===id),sum=(l.pile_values||[]).reduce((s,x)=>s+Number(x||0),0);row.querySelector('.count-qty').value=sum;refreshCountLine(id)};row.querySelector('.clear-piles').onclick=()=>{state.activeCountLines=countPayload();const l=state.activeCountLines.find(v=>v.id===id);l.pile_values=[];renderCountEditor(false)};row.querySelector('.save-count-line').onclick=async()=>{await saveCountDraft();row.nextElementSibling?.querySelector('.count-qty')?.focus()}});
  if($('#submitCountBtn'))$('#submitCountBtn').onclick=submitCount;
  if($('#finalCountBtn'))$('#finalCountBtn').onclick=()=>finalizeCount(c.id);
}
async function saveCountDraft(){if(!state.activeCount)return;setLoading(true);try{const {error}=await db.rpc('save_stock_count',{p_count_id:state.activeCount.id,p_lines:countPayload()});if(error)throw error;toast('บันทึกร่างผลตรวจนับแล้ว')}catch(e){fail(e)}finally{setLoading(false)}}
async function submitCount(){if(!state.activeCount)return;const lines=countPayload();if(lines.some(x=>x.count_qty==null||Number.isNaN(x.count_qty)))return toast('กรอกยอดตรวจจริงให้ครบทุกสินค้า',true);setLoading(true);try{const {data,error}=await db.rpc('submit_stock_count',{p_count_id:state.activeCount.id,p_lines:lines,p_request_id:requestId('COUNT_SUBMIT')});if(error)throw error;toast(`ส่ง ${data.count_no} ให้ Admin Final แล้ว`);closeModal();await loadData();render()}catch(e){fail(e)}finally{setLoading(false)}}
function openCount(id){const c=state.data.counts.find(x=>x.id===id);if(!c)return fail(new Error('STOCK_COUNT_NOT_FOUND'));state.activeCount=c;state.activeCountLines=state.data.countLines.filter(x=>x.count_id===id).map(x=>({...x,pile_values:Array.isArray(x.pile_values)?x.pile_values:[]}));renderCountEditor(!can('WAREHOUSE','ADMIN')||c.status!=='DRAFT')}
async function finalizeCount(id){
  const c=(state.data.counts||[]).find(x=>x.id===id),policy=c?.adjustment_policy||'AUTO_ADJUST';
  const msg=policy==='AUTO_ADJUST'?'ยืนยัน Admin Final? ระบบจะปรับ Stock ตามส่วนต่างทันที':policy==='REVIEW_ONLY'?'ยืนยัน Admin Final? ระบบจะเก็บผลตรวจเท่านั้นและไม่เปลี่ยน Stock':'ยืนยัน Admin Final? ระบบจะเก็บผลตรวจและให้สร้าง Stock Adjustment ภายหลัง';
  if(!confirm(msg))return;
  await runRpc('finalize_stock_count',{p_count_id:id,p_request_id:requestId('COUNT_FINAL')},r=>r.policy==='AUTO_ADJUST'?`Final ${r.count_no} แล้ว • ปรับ Stock ${r.adjusted_lines||0} รายการ`:`Final ${r.count_no} แล้ว • Stock ยังไม่เปลี่ยน (${r.policy})`);
}

function receiveTransferModal(id){const t=byId('transfers',id),l=transferLine(id);modal(`<h2>รับโอน ${esc(t.transfer_no)}</h2><form id="receiveTransferForm"><div class="form"><label>จำนวนส่ง<input value="${qty(l.sent_qty)}" disabled></label><label>จำนวนรับจริง<input id="trReceived" type="number" min="0" max="${l.sent_qty}" step="any" value="${l.sent_qty}" required></label><label class="full">เหตุผลส่วนต่าง<input id="trReason" placeholder="บังคับเมื่อรับไม่เท่าจำนวนส่ง"></label></div><button class="btn primary">ยืนยันรับปลายทาง</button></form>`);$('#receiveTransferForm').onsubmit=async e=>{e.preventDefault();await runRpc('receive_transfer',{p_transfer_id:id,p_received_qty:Number($('#trReceived').value),p_variance_reason:$('#trReason').value.trim()||null,p_request_id:requestId('TRRECV')},r=>`รับ ${r.transfer_no} สำเร็จ • ส่วนต่าง ${qty(r.variance)}`)}}
function tripModal(orderId){const o=byId('orders',orderId);modal(`<h2>จัดรถ ${esc(o.order_no)}</h2><form id="tripForm"><div class="form"><label>รถ<select id="tripVehicle"><option value="">— รถ Vendor / ไม่ระบุ —</option>${option('vehicles',x=>`${x.code} • ${x.plate_no||''} ${x.vehicle_type||''}`)}</select></label><label>คนขับ<select id="tripDriver"><option value="">— ไม่ระบุ —</option>${option('drivers',x=>`${x.code} • ${x.name}`)}</select></label><label>Vendor ขนส่ง<select id="tripVendor"><option value="">— รถบริษัท —</option>${option('suppliers',x=>`${x.code} • ${x.name}`)}</select></label><label>Standard Freight<input id="tripStd" type="number" min="0" step="any" value="0"></label><label>เวลาเริ่ม<input id="tripStart" type="datetime-local" value="${localInput(3600000)}" required></label><label>เวลาสิ้นสุด<input id="tripEnd" type="datetime-local" value="${localInput(14400000)}" required></label></div><button class="btn primary">ยืนยันจัดรถ</button></form>`);$('#tripForm').onsubmit=async e=>{e.preventDefault();const start=new Date($('#tripStart').value),end=new Date($('#tripEnd').value);if(end<=start)return toast('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม',true);await runRpc('create_delivery_trip',{p_order_id:orderId,p_vehicle_id:$('#tripVehicle').value||null,p_driver_id:$('#tripDriver').value||null,p_transport_supplier_id:$('#tripVendor').value||null,p_planned_start:start.toISOString(),p_planned_end:end.toISOString(),p_standard_freight:Number($('#tripStd').value||0),p_request_id:requestId('TRIP')},r=>`จัดรถ ${r.trip_no} สำเร็จ`)}}
function applicableExpenseRate(type,trip){const date=new Date().toISOString().slice(0,10),vehicle=byId('vehicles',trip.vehicle_id),warehouses=new Set(orderLines(trip.order_id).map(x=>x.warehouse_id));return state.data.expenseRates.filter(r=>r.expense_type_id===type.id&&r.effective_from<=date&&(!r.effective_to||r.effective_to>=date)&&(!r.warehouse_id||warehouses.has(r.warehouse_id))&&(!r.vehicle_type||r.vehicle_type===vehicle?.vehicle_type)).sort((a,b)=>String(b.effective_from).localeCompare(String(a.effective_from)))[0]}
function expenseSuggestedAmount(type,trip){const rate=Number(applicableExpenseRate(type,trip)?.rate||0),lines=tripLines(trip.id);if(type.basis==='FIXED_PER_TRIP')return rate;if(type.basis==='PER_KG')return rate*lines.reduce((s,x)=>s+Number(x.issued_qty||0),0);if(type.basis==='PERCENT_REVENUE'){const revenue=lines.reduce((s,x)=>{const ol=state.data.orderLines.find(o=>o.id===x.order_line_id);return s+Number(x.issued_qty||0)*Number(ol?.unit_price||0)},0);return revenue*rate/100}return 0}
function completeTripModal(id){const groupTrip=byId('trips',id);if(groupTrip?.booking_id)return premiumCompleteModal(groupTrip.booking_id);const t=byId('trips',id),lines=tripLines(id).map(l=>`<div class="line-editor pod-line" data-id="${l.id}"><label>สินค้า<input value="${esc(product(l.product_id).code)} • ${esc(product(l.product_id).name)}" disabled></label><label>Warehouse Issue<input value="${qty(l.issued_qty)}" disabled></label><label>ลูกค้ารับจริง<input class="pod-qty" type="number" min="0" max="${l.issued_qty}" step="any" value="${l.issued_qty}" required></label><label>เหตุผลส่วนต่าง<input class="pod-reason" placeholder="Loss / Return / Pending"></label></div>`).join(''),expenses=state.data.expenseTypes.filter(x=>x.active!==false).map(x=>`<div class="line-editor expense-line" data-id="${x.id}"><label>${esc(x.code)} • ${esc(x.name)}<small>${esc(expenseCategoryThai[x.category]||'')}</small></label><label>ฐานคำนวณ<input value="${esc(expenseBasisThai[x.basis]||x.basis)}" disabled></label><label>จำนวนเงินจริง<input class="expense-amount" type="number" min="0" step="any" value="${expenseSuggestedAmount(x,t)}"></label><label>หมายเหตุ<input class="expense-note"></label></div>`).join('');modal(`<h2>POD / ปิดงาน ${esc(t.trip_no)}</h2><form id="podForm">${lines}<h3>ค่าขนส่งและค่าใช้จ่ายจริง</h3><div class="form"><label>Actual Freight<input id="actualFreight" type="number" min="0" step="any" value="${t.standard_freight||0}" required></label><label>เลขที่ POD<input id="podRef" placeholder="เลขที่เอกสาร (ถ้ามี)"></label></div>${expenses||'<div class="alert warn">ยังไม่ได้ตั้งประเภทค่าใช้จ่ายเพิ่มเติม</div>'}<div class="form"><label class="full">ไฟล์ POD (PDF/JPG/PNG ไม่เกิน 10 MB)<input id="podFile" type="file" accept="application/pdf,image/jpeg,image/png" required></label></div><div class="alert warn">Product Cost ใช้ Monthly Cost • Gross Profit ไม่หัก Freight • Contribution Profit หัก Freight และ Direct Expenses</div><button class="btn primary">อัปโหลด POD และยืนยันส่งสำเร็จ</button></form>`);$('#podForm').onsubmit=e=>completeTrip(e,id)}
const masterMeta={customers:['Customer','code,name,region','รหัส,ชื่อ,ภูมิภาค'],productGroups:['Product Group','code,name','รหัสกลุ่ม,ชื่อกลุ่ม'],products:['Product','code,name,base_uom,minimum_stock','รหัส,ชื่อ,หน่วย,Minimum Stock (รวม/Default)'],warehouses:['Warehouse','code,name','รหัส,ชื่อ'],suppliers:['Vendor','code,name,supplier_type','รหัส,ชื่อ,ประเภท'],vehicleTypes:['Vehicle Type','code,name','รหัส,ชื่อประเภทรถ'],vehicles:['Vehicle','code,plate_no,vehicle_type','รหัส,ทะเบียน,ประเภทรถ'],drivers:['Driver','code,name,phone','รหัส,ชื่อ,โทรศัพท์']};
const masterTable={productGroups:'product_groups',vehicleTypes:'vehicle_types'};
function masterField(kind,field,label){if(kind==='vehicles'&&field==='vehicle_type')return `<label>${label}<select data-field="${field}" required><option value="">— เลือกประเภทรถ —</option>${option('vehicleTypes',x=>`${x.code} • ${x.name}`,'code')}</select></label>`;if(kind==='products'&&field==='minimum_stock')return `<label>${label}<input data-field="${field}" type="number" min="0" step="any" value="0" required></label>`;return `<label>${label}<input data-field="${field}" required></label>`}
function masterModal(kind){if(kind==='costs')return costModal();if(kind==='expenseTypes')return expenseSetupModal();const [title,fields,labels]=masterMeta[kind],fs=fields.split(','),ls=labels.split(','),rows=state.data[kind].map(x=>`<tr>${fs.map(f=>`<td>${esc(x[f]||'-')}</td>`).join('')}<td>${x.active===false?'ปิด':'ใช้งาน'}</td></tr>`);modal(`<h2>${title}</h2>${kind==='vehicles'&&!state.data.vehicleTypes.length?'<div class="alert danger">กรุณาสร้าง Vehicle Type ก่อนเพิ่มรถ</div>':''}<form id="masterForm"><div class="form">${fs.map((f,i)=>masterField(kind,f,ls[i])).join('')}</div><button class="btn primary" style="margin:16px 0" ${kind==='vehicles'&&!state.data.vehicleTypes.length?'disabled':''}>+ เพิ่ม ${title}</button></form>${table([...ls,'สถานะ'],rows)}`);$('#masterForm').onsubmit=async e=>{e.preventDefault();const obj={company_id:state.profile.company_id,active:true};$$('#masterForm [data-field]').forEach(x=>obj[x.dataset.field]=x.value.trim());const {error}=await db.from(masterTable[kind]||kind).insert(obj);if(error)return fail(error);toast(`เพิ่ม ${title} แล้ว`);closeModal();await loadData();render()}}
function costModal(){const rows=state.data.costs.map(x=>`<tr><td>${esc(product(x.product_id).code)}</td><td>${dmy(x.cost_month)}</td><td class="num">${money(x.unit_cost)}</td><td>${x.locked?'ล็อก':'เปิด'}</td></tr>`);modal(`<h2>Monthly Product Cost</h2><form id="costForm"><div class="form"><label>สินค้า<select id="costProduct">${option('products',x=>`${x.code} • ${x.name}`)}</select></label><label>เดือน<input id="costMonth" type="month" value="${new Date().toISOString().slice(0,7)}" required></label><label>Unit Cost<input id="unitCost" type="number" min="0" step="any" required></label></div><button class="btn primary" style="margin:16px 0">บันทึก Cost</button></form>${table(['สินค้า','เดือน','Unit Cost','สถานะ'],rows)}`);$('#costForm').onsubmit=async e=>{e.preventDefault();const data={company_id:state.profile.company_id,product_id:$('#costProduct').value,cost_month:$('#costMonth').value+'-01',unit_cost:Number($('#unitCost').value)};const {error}=await db.from('monthly_product_costs').upsert(data,{onConflict:'company_id,product_id,cost_month'});if(error)return fail(error);toast('บันทึก Monthly Cost แล้ว');closeModal();await loadData();render()}}

const expenseCategoryThai={DIRECT_EXPENSE:'ค่าใช้จ่ายตรงของงานส่ง',OPERATING_EXPENSE:'ค่าใช้จ่ายดำเนินงาน (ไม่หัก Contribution)'};
const expenseBasisThai={MANUAL:'กรอกจริง',FIXED_PER_TRIP:'คงที่ต่อเที่ยว',PER_KG:'อัตราต่อ KG',PERCENT_REVENUE:'% ของยอดขาย'};
function expenseSetupModal(){
  const typeRows=state.data.expenseTypes.map(x=>`<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.name)}</td><td>${esc(expenseCategoryThai[x.category]||x.category)}</td><td>${esc(expenseBasisThai[x.basis]||x.basis)}</td><td>${x.include_in_contribution?'หัก Contribution':'ไม่หัก'}</td><td>${x.active===false?badge('INACTIVE'):badge('ACTIVE')}</td></tr>`);
  const rateRows=state.data.expenseRates.map(x=>{const t=byId('expenseTypes',x.expense_type_id)||{},w=warehouse(x.warehouse_id);return `<tr><td><b>${esc(t.code||'-')}</b></td><td>${dmy(x.effective_from)}</td><td>${dmy(x.effective_to)}</td><td class="num">${nf.format(x.rate)}</td><td>${esc(w.code||'ทุกคลัง')}</td><td>${esc(x.vehicle_type||'ทุกรถ')}</td></tr>`});
  modal(`<h2>Cost & Expense Setup</h2><div class="alert ok"><b>Gross Profit</b> = Sales − Product Cost<br><b>Contribution Profit</b> = Gross Profit − Freight − Direct Expenses</div><form id="expenseTypeForm"><h3>1. ประเภทค่าใช้จ่าย</h3><div class="form"><label>รหัส<input id="expenseCode" required></label><label>ชื่อ<input id="expenseName" required></label><label>ประเภท<select id="expenseCategory"><option value="DIRECT_EXPENSE">ค่าใช้จ่ายตรงของงานส่ง</option><option value="OPERATING_EXPENSE">ค่าใช้จ่ายดำเนินงาน</option></select></label><label>ฐานคำนวณ<select id="expenseBasis">${Object.entries(expenseBasisThai).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label><input id="expenseContribution" type="checkbox" checked> หักในการคำนวณ Contribution Profit</label></div><button class="btn primary" style="margin:12px 0">บันทึกประเภทค่าใช้จ่าย</button></form>${table(['รหัส','ชื่อ','ประเภท','ฐานคำนวณ','ผลต่อกำไร','สถานะ'],typeRows)}<form id="expenseRateForm"><h3>2. อัตราค่าใช้จ่าย</h3><div class="form"><label>ประเภทค่าใช้จ่าย<select id="rateExpense">${option('expenseTypes',x=>`${x.code} • ${x.name}`)}</select></label><label>อัตรา<input id="expenseRate" type="number" min="0" step="any" required></label><label>เริ่มใช้<input id="rateFrom" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>สิ้นสุด<input id="rateTo" type="date"></label><label>คลัง<select id="rateWarehouse"><option value="">ทุกคลัง</option>${option('warehouses',x=>`${x.code} • ${x.name}`)}</select></label><label>ประเภทรถ<select id="rateVehicleType"><option value="">ทุกประเภทรถ</option>${option('vehicleTypes',x=>`${x.code} • ${x.name}`,'code')}</select></label></div><button class="btn primary" style="margin:12px 0">บันทึกอัตรา</button></form>${table(['ประเภท','เริ่มใช้','สิ้นสุด','อัตรา','คลัง','ประเภทรถ'],rateRows)}`);
  $('#expenseCategory').onchange=()=>{if($('#expenseCategory').value==='OPERATING_EXPENSE')$('#expenseContribution').checked=false};
  $('#expenseTypeForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.profile.company_id,code:$('#expenseCode').value.trim().toUpperCase(),name:$('#expenseName').value.trim(),category:$('#expenseCategory').value,basis:$('#expenseBasis').value,include_in_contribution:$('#expenseContribution').checked,active:true};const {error}=await db.from('expense_types').upsert(row,{onConflict:'company_id,code'});if(error)return fail(error);toast('บันทึกประเภทค่าใช้จ่ายแล้ว');closeModal();await loadData();render()};
  $('#expenseRateForm').onsubmit=async e=>{e.preventDefault();const row={company_id:state.profile.company_id,expense_type_id:$('#rateExpense').value,effective_from:$('#rateFrom').value,effective_to:$('#rateTo').value||null,rate:Number($('#expenseRate').value),warehouse_id:$('#rateWarehouse').value||null,vehicle_type:$('#rateVehicleType').value||null,sales_type:null};const {error}=await db.from('expense_rates').insert(row);if(error)return fail(error);toast('บันทึกอัตราค่าใช้จ่ายแล้ว');closeModal();await loadData();render()};
}

let pendingOpeningStock=null;
const openingStockHeaders=['warehouse_code','product_code','qty','unit_cost'];
function normalizeOpeningStockImport(raw){
  const errors=[],headers=raw[0]?.map(x=>x.replace(/^\ufeff/,'').trim())||[];
  if(openingStockHeaders.some(h=>!headers.includes(h)))return {rows:[],errors:[`Header ต้องมี: ${openingStockHeaders.join(', ')}`]};
  if(raw.length-1>5000)return {rows:[],errors:['ไฟล์หนึ่งชุดรองรับไม่เกิน 5,000 รายการ']};
  const seen=new Set(),rows=raw.slice(1).map((values,index)=>{
    const src=Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()||''])),line=index+2;
    const w=state.data.warehouses.find(x=>String(x.code).toUpperCase()===src.warehouse_code.toUpperCase()&&x.active!==false);
    const p=state.data.products.find(x=>String(x.code).toUpperCase()===src.product_code.toUpperCase()&&x.active!==false);
    const amount=Number(src.qty),unitCost=Number(src.unit_cost),key=`${w?.id||src.warehouse_code}|${p?.id||src.product_code}`;
    if(!src.warehouse_code||!src.product_code)errors.push(`แถว ${line}: ต้องระบุรหัสคลังและรหัสสินค้า`);
    else if(!w)errors.push(`แถว ${line}: ไม่พบคลัง ${src.warehouse_code}`);
    else if(!p)errors.push(`แถว ${line}: ไม่พบสินค้า ${src.product_code}`);
    else if(src.qty===''||!Number.isFinite(amount)||amount<=0)errors.push(`แถว ${line}: จำนวนต้องมากกว่า 0`);
    else if(src.unit_cost===''||!Number.isFinite(unitCost)||unitCost<0)errors.push(`แถว ${line}: ต้นทุนต่อหน่วยต้องเป็น 0 หรือมากกว่า`);
    else if(seen.has(key))errors.push(`แถว ${line}: ${src.warehouse_code} / ${src.product_code} ซ้ำในไฟล์`);
    else{seen.add(key);return {warehouse_id:w.id,product_id:p.id,qty:amount,unit_cost:unitCost,_preview:src}}
    return null;
  }).filter(Boolean);
  return {rows,errors};
}
function openingStockModal(){
  pendingOpeningStock=null;
  const history=(state.data.openingBatches||[]).map(b=>{const ls=(state.data.openingLines||[]).filter(x=>x.batch_id===b.id),totalQty=ls.reduce((s,x)=>s+Number(x.qty||0),0),totalValue=ls.reduce((s,x)=>s+Number(x.qty||0)*Number(x.unit_cost||0),0);return `<tr><td><b>${esc(b.reference_no)}</b></td><td>${dmy(b.opening_date)}</td><td class="num">${nf.format(ls.length)}</td><td class="num">${qty(totalQty)}</td><td class="num">${money(totalValue)}</td><td>${badge(b.status)}</td></tr>`});
  modal(`<h2>ยกสต็อกตั้งต้น (Opening Stock)</h2><div class="alert warn"><b>ขั้นตอน:</b> ดาวน์โหลด Template → กรอกรหัสคลัง/สินค้า จำนวน และต้นทุน → อัปโหลดตรวจสอบ → ยืนยันบันทึก<br>เมื่อยืนยันแล้วแก้หรือลบไม่ได้ หากยอดผิดให้ปรับด้วยเมนูตรวจนับ Stock</div><form id="openingStockForm"><div class="form"><label>เลขที่อ้างอิง<input id="openingRef" maxlength="100" required placeholder="เช่น OPEN-2026-001"></label><label>วันที่ยอดยกมา<input id="openingDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label class="full">ไฟล์ CSV UTF-8<input id="openingFile" type="file" accept=".csv,text/csv" required></label></div><div class="actions" style="margin:14px 0"><button type="button" id="downloadOpeningTemplate" class="btn">⇩ Download Template</button><button type="button" id="previewOpening" class="btn">ตรวจสอบไฟล์</button><button type="submit" id="commitOpening" class="btn primary" disabled>ยืนยันยกสต็อก</button></div><div class="alert ok">ต้นทุนในไฟล์ใช้เก็บมูลค่ายอดยกมาและ Audit เท่านั้น ไม่เขียนทับ Monthly Product Cost ที่ใช้คำนวณ GP</div><div id="openingPreview">${empty('ยังไม่ได้ตรวจสอบไฟล์')}</div></form><div class="panel"><h3>ประวัติยอดยกมา</h3>${table(['เลขที่อ้างอิง','วันที่ยอดยกมา','รายการ','จำนวนรวม','มูลค่ารวม','สถานะ'],history)}</div>`);
  $('#downloadOpeningTemplate').onclick=()=>{const w=state.data.warehouses.find(x=>x.active!==false),p=state.data.products.find(x=>x.active!==false);downloadCsv('FlowStock_Opening_Stock_Template.csv',openingStockHeaders,[[w?.code||'WH01',p?.code||'ITEM001','100','25.50']])};
  $('#openingFile').onchange=()=>{pendingOpeningStock=null;$('#commitOpening').disabled=true;$('#openingPreview').innerHTML=empty('ไฟล์เปลี่ยนแล้ว กรุณากดตรวจสอบไฟล์')};
  $('#previewOpening').onclick=previewOpeningStock;
  $('#openingStockForm').onsubmit=commitOpeningStock;
}
async function previewOpeningStock(){
  const file=$('#openingFile').files[0];if(!file)return toast('กรุณาเลือกไฟล์ CSV',true);if(file.size>5*1024*1024)return toast('ไฟล์ต้องมีขนาดไม่เกิน 5 MB',true);
  const result=normalizeOpeningStockImport(parseCsv(await file.text())),sample=result.rows.slice(0,100),totalQty=result.rows.reduce((s,x)=>s+x.qty,0),totalValue=result.rows.reduce((s,x)=>s+x.qty*x.unit_cost,0);
  pendingOpeningStock={...result,requestId:requestId('OPENING')};
  $('#openingPreview').innerHTML=`<div class="alert ${result.errors.length?'danger':'ok'}">ผ่าน ${result.rows.length} แถว • Error ${result.errors.length} แถว • จำนวนรวม ${qty(totalQty)} • มูลค่ารวม ${money(totalValue)}</div>${result.errors.length?`<div class="alert danger">${result.errors.slice(0,100).map(esc).join('<br>')}${result.errors.length>100?'<br>…แสดง 100 ข้อแรก':''}</div>`:''}${sample.length?table(['คลัง','สินค้า','จำนวน','ต้นทุน/หน่วย','มูลค่า'],sample.map(r=>`<tr><td>${esc(r._preview.warehouse_code)}</td><td>${esc(r._preview.product_code)}</td><td class="num">${qty(r.qty)}</td><td class="num">${money(r.unit_cost)}</td><td class="num">${money(r.qty*r.unit_cost)}</td></tr>`)):empty()}`;
  $('#commitOpening').disabled=result.errors.length>0||result.rows.length===0;
}
async function commitOpeningStock(e){
  e.preventDefault();if(!pendingOpeningStock?.rows.length)return toast('กรุณาตรวจสอบไฟล์ก่อน',true);
  const ref=$('#openingRef').value.trim(),date=$('#openingDate').value;if(!ref||!date)return toast('กรอกเลขที่อ้างอิงและวันที่ยอดยกมา',true);
  if(!confirm(`ยืนยันยกสต็อก ${pendingOpeningStock.rows.length} รายการ เลขที่ ${ref}? หลังบันทึกจะแก้หรือลบไม่ได้`))return;
  const lines=pendingOpeningStock.rows.map(({_preview,...x})=>x);
  await runRpc('post_opening_stock',{p_reference_no:ref,p_opening_date:date,p_lines:lines,p_request_id:pendingOpeningStock.requestId},r=>`ยกสต็อก ${r.reference_no} สำเร็จ • ${qty(r.total_qty)} หน่วย • ${money(r.total_value)}`);
}

const masterImportDefs={
  customers:{label:'Customer',headers:['code','name','region','active'],sample:[['C001','บริษัทตัวอย่าง','Bangkok','TRUE']],table:'customers',conflict:'company_id,code'},
  productGroups:{label:'Product Group',headers:['code','name'],sample:[['CHEM','Chemical']],table:'product_groups',conflict:'company_id,code'},
  products:{label:'Product',headers:['code','name','group_code','base_uom','minimum_stock','active'],sample:[['CHEM001','สินค้าตัวอย่าง','CHEM','KG','1000','TRUE']],table:'products',conflict:'company_id,code'},
  warehouses:{label:'Warehouse',headers:['code','name','active'],sample:[['WH01','คลังหลัก','TRUE']],table:'warehouses',conflict:'company_id,code'},
  suppliers:{label:'Vendor',headers:['code','name','supplier_type','active'],sample:[['V001','ผู้ขายตัวอย่าง','TRANSPORT','TRUE']],table:'suppliers',conflict:'company_id,code'},
  vehicleTypes:{label:'Vehicle Type',headers:['code','name','active'],sample:[['TANK','รถแท็งก์','TRUE']],table:'vehicle_types',conflict:'company_id,code'},
  vehicles:{label:'Vehicle',headers:['code','plate_no','vehicle_type','active'],sample:[['TR01','1กก-1111','TANK','TRUE']],table:'vehicles',conflict:'company_id,code'},
  drivers:{label:'Driver',headers:['code','name','phone','active'],sample:[['D001','คนขับตัวอย่าง','0812345678','TRUE']],table:'drivers',conflict:'company_id,code'},
  costs:{label:'Monthly Product Cost',headers:['product_code','cost_month','unit_cost'],sample:[['CHEM001','2026-09','12.50']],table:'monthly_product_costs',conflict:'company_id,product_id,cost_month'},
  expenseTypes:{label:'Expense Type',headers:['code','name','category','basis','include_in_contribution','active'],sample:[['TOLL','ค่าทางด่วน','DIRECT_EXPENSE','MANUAL','TRUE','TRUE']],table:'expense_types',conflict:'company_id,code'},
  expenseRates:{label:'Expense Rate',headers:['expense_code','effective_from','effective_to','rate','warehouse_code','vehicle_type'],sample:[['TOLL','2026-09-01','','500','','']],table:'expense_rates'}
};
let pendingMasterImport=null;
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&quoted&&n==='"'){cell+='"';i++}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell.trim());cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows}
const csvBool=v=>!['FALSE','0','NO','N','ปิด'].includes(String(v||'TRUE').trim().toUpperCase());
const salesImportDefs={
  receipts:['gr_no','receipt_date','supplier_code','warehouse_code','source_doc_no','product_code','qty','unit_cost'],
  orders:['order_no','order_date','customer_code','requested_delivery_at','status','warehouse_code','vehicle_code','driver_code','standard_freight','invoice_no'],
  lines:['order_no','line_no','product_code','warehouse_code','qty','unit_price','line_amount','customer_received_qty'],
  invoices:['invoice_no','month','invoice_date','order_no','customer_code','revenue','product_cost','gross_profit','gp_margin','freight_cost','direct_expense','contribution_profit','contribution_margin','gp_status']
};
let pendingSalesHistory=null;
function salesHistoryImportModal(){
  pendingSalesHistory=null;
  modal(`<h2>นำเข้าประวัติ Demo สมจริง</h2>
  <div class="alert warn"><b>ใช้สำหรับบริษัท Demo ที่ล้างข้อมูลแล้วเท่านั้น</b><br>
  ขั้นตอน: 1) ลง Master 2) ยก Opening Stock ตามวันที่เริ่มต้น 3) เลือก CSV 4 ไฟล์ด้านล่าง<br>
  ระบบจะสร้าง <b>รับสินค้า (GR) → Stock IN → Order → Stock OUT → Delivery → Invoice</b> ตามวันที่ย้อนหลังจริง และตรวจว่า Stock ไม่ติดลบก่อนบันทึก</div>
  <div class="form">
    <label class="full">1. Historical Goods Receipts / Stock IN<input id="salesReceiptsFile" type="file" accept=".csv,text/csv" required></label>
    <label class="full">2. Sales Orders<input id="salesOrdersFile" type="file" accept=".csv,text/csv" required></label>
    <label class="full">3. Sales Order Lines / Stock OUT<input id="salesLinesFile" type="file" accept=".csv,text/csv" required></label>
    <label class="full">4. Sales Invoices<input id="salesInvoicesFile" type="file" accept=".csv,text/csv" required></label>
  </div>
  <div class="actions" style="margin:14px 0">
    <button id="previewSalesHistory" class="btn" type="button">ตรวจสอบไฟล์ + จำลอง Stock</button>
    <button id="commitSalesHistory" class="btn primary" type="button" disabled>ยืนยันนำเข้าประวัติ</button>
  </div><div id="salesHistoryPreview">${empty('ยังไม่ได้ตรวจสอบไฟล์')}</div>`);
  $('#previewSalesHistory').onclick=previewSalesHistory;
  $('#commitSalesHistory').onclick=commitSalesHistory;
}
function salesCsvObjects(text,kind,errors){
  const raw=parseCsv(text),headers=raw[0]?.map(x=>x.replace(/^\ufeff/,'').trim())||[],required=salesImportDefs[kind];
  if(required.some(h=>!headers.includes(h))){errors.push(`${kind}: Header ต้องมี ${required.join(', ')}`);return[]}
  return raw.slice(1).map((values,index)=>Object.assign({__row:index+2},Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()||'']))))
}
async function previewSalesHistory(){
  const files=[$('#salesReceiptsFile').files[0],$('#salesOrdersFile').files[0],$('#salesLinesFile').files[0],$('#salesInvoicesFile').files[0]];
  if(files.some(x=>!x))return toast('กรุณาเลือกไฟล์ Goods Receipts, Orders, Order Lines และ Invoices ให้ครบ',true);
  if(files.some(x=>x.size>8*1024*1024))return toast('แต่ละไฟล์ต้องไม่เกิน 8 MB',true);

  const errors=[],texts=await Promise.all(files.map(x=>x.text())),
    receipts=salesCsvObjects(texts[0],'receipts',errors),
    orders=salesCsvObjects(texts[1],'orders',errors),
    lines=salesCsvObjects(texts[2],'lines',errors),
    invoices=salesCsvObjects(texts[3],'invoices',errors),
    orderMap=new Map(),invoiceMap=new Map(),lineKeys=new Set(),grKeys=new Set(),
    customerCodes=new Set(state.data.customers.map(x=>x.code)),
    productCodes=new Set(state.data.products.map(x=>x.code)),
    warehouseCodes=new Set(state.data.warehouses.map(x=>x.code)),
    supplierCodes=new Set(state.data.suppliers.map(x=>x.code)),
    vehicleCodes=new Set(state.data.vehicles.map(x=>x.code)),
    driverCodes=new Set(state.data.drivers.map(x=>x.code));

  if((state.data.movements||[]).some(x=>x.movement_type!=='OPENING_BALANCE'))
    errors.push('Stock ปัจจุบันมี Movement อื่นนอกจาก Opening Stock กรุณาล้างธุรกรรม Demo ก่อนนำเข้าชุดประวัติสมจริง');

  receipts.forEach(x=>{
    const q=Number(x.qty),cost=Number(x.unit_cost);
    if(!x.gr_no||grKeys.has(x.gr_no))errors.push(`Receipts แถว ${x.__row}: GR ซ้ำหรือว่าง`);else grKeys.add(x.gr_no);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x.receipt_date))errors.push(`Receipts แถว ${x.__row}: วันที่ไม่ถูกต้อง`);
    if(!supplierCodes.has(x.supplier_code))errors.push(`Receipts แถว ${x.__row}: ไม่พบ Vendor ${x.supplier_code}`);
    if(!warehouseCodes.has(x.warehouse_code))errors.push(`Receipts แถว ${x.__row}: ไม่พบคลัง ${x.warehouse_code}`);
    if(!productCodes.has(x.product_code))errors.push(`Receipts แถว ${x.__row}: ไม่พบสินค้า ${x.product_code}`);
    if(!(q>0)||cost<0||!Number.isFinite(q)||!Number.isFinite(cost))errors.push(`Receipts แถว ${x.__row}: จำนวนหรือต้นทุนไม่ถูกต้อง`);
  });

  orders.forEach(x=>{
    if(!x.order_no||orderMap.has(x.order_no))errors.push(`Orders แถว ${x.__row}: Order ซ้ำหรือว่าง`);else orderMap.set(x.order_no,x);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x.order_date))errors.push(`Orders แถว ${x.__row}: วันที่ไม่ถูกต้อง`);
    if(!customerCodes.has(x.customer_code))errors.push(`Orders แถว ${x.__row}: ไม่พบลูกค้า ${x.customer_code}`);
    if(!vehicleCodes.has(x.vehicle_code))errors.push(`Orders แถว ${x.__row}: ไม่พบรถ ${x.vehicle_code}`);
    if(!driverCodes.has(x.driver_code))errors.push(`Orders แถว ${x.__row}: ไม่พบคนขับ ${x.driver_code}`);
    if(Number(x.standard_freight)<0||!Number.isFinite(Number(x.standard_freight)))errors.push(`Orders แถว ${x.__row}: Freight ไม่ถูกต้อง`);
  });

  lines.forEach(x=>{
    const key=`${x.order_no}|${x.line_no}`,q=Number(x.qty),price=Number(x.unit_price),amount=Number(x.line_amount),received=Number(x.customer_received_qty);
    if(!orderMap.has(x.order_no))errors.push(`Lines แถว ${x.__row}: ไม่พบ Order ${x.order_no}`);
    if(lineKeys.has(key))errors.push(`Lines แถว ${x.__row}: เลขบรรทัดซ้ำ`);lineKeys.add(key);
    if(!productCodes.has(x.product_code))errors.push(`Lines แถว ${x.__row}: ไม่พบสินค้า ${x.product_code}`);
    if(!warehouseCodes.has(x.warehouse_code))errors.push(`Lines แถว ${x.__row}: ไม่พบคลัง ${x.warehouse_code}`);
    if(!(q>0)||price<0||received<0||received>q)errors.push(`Lines แถว ${x.__row}: จำนวนหรือราคาไม่ถูกต้อง`);
    if(Math.abs(q*price-amount)>0.02)errors.push(`Lines แถว ${x.__row}: line_amount ไม่เท่ากับ qty × unit_price`);
  });

  invoices.forEach(x=>{
    if(!x.invoice_no||invoiceMap.has(x.invoice_no))errors.push(`Invoices แถว ${x.__row}: Invoice ซ้ำหรือว่าง`);else invoiceMap.set(x.invoice_no,x);
    const o=orderMap.get(x.order_no),sum=lines.filter(l=>l.order_no===x.order_no).reduce((a,l)=>a+Number(l.customer_received_qty||0)*Number(l.unit_price||0),0);
    if(!o)errors.push(`Invoices แถว ${x.__row}: ไม่พบ Order ${x.order_no}`);
    else if(o.customer_code!==x.customer_code)errors.push(`Invoices แถว ${x.__row}: ลูกค้าไม่ตรงกับ Order`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(x.invoice_date))errors.push(`Invoices แถว ${x.__row}: วันที่ไม่ถูกต้อง`);
    if([x.revenue,x.product_cost,x.freight_cost,x.direct_expense].some(v=>Number(v)<0||!Number.isFinite(Number(v))))errors.push(`Invoices แถว ${x.__row}: ยอดเงินไม่ถูกต้อง`);
    if(Math.abs(sum-Number(x.revenue))>0.02)errors.push(`Invoices แถว ${x.__row}: Revenue ไม่ตรงกับ Customer Received × Unit Price`);
  });

  orders.forEach(x=>{if(!lines.some(l=>l.order_no===x.order_no))errors.push(`Order ${x.order_no}: ไม่มีรายการสินค้า`);if(!invoices.some(i=>i.order_no===x.order_no))errors.push(`Order ${x.order_no}: ไม่มี Invoice`)});
  if(orders.length!==invoices.length)errors.push('จำนวน Orders และ Invoices ต้องเท่ากัน');

  // Simulate historical stock by date using current Opening Stock balance as the starting point.
  const sim=new Map((state.data.balances||[]).map(b=>[`${b.warehouse_id}|${b.product_id}`,Number(b.on_hand||0)]));
  const wByCode=new Map(state.data.warehouses.map(x=>[x.code,x])),pByCode=new Map(state.data.products.map(x=>[x.code,x]));
  const events=[];
  receipts.forEach(x=>{const w=wByCode.get(x.warehouse_code),p=pByCode.get(x.product_code);if(w&&p)events.push({at:x.receipt_date+'T09:00:00+07:00',key:`${w.id}|${p.id}`,qty:Number(x.qty||0),ref:x.gr_no,type:'IN'})});
  lines.forEach(x=>{const o=orderMap.get(x.order_no),w=wByCode.get(x.warehouse_code),p=pByCode.get(x.product_code);if(o&&w&&p)events.push({at:o.requested_delivery_at||o.order_date+'T09:00:00+07:00',key:`${w.id}|${p.id}`,qty:-Number(x.qty||0),ref:x.order_no,type:'OUT',product:p,warehouse:w})});
  events.sort((a,b)=>String(a.at).localeCompare(String(b.at))||(a.type==='IN'?-1:1));
  events.forEach(ev=>{const before=Number(sim.get(ev.key)||0),after=before+ev.qty;sim.set(ev.key,after);if(after<0)errors.push(`Stock ติดลบที่ ${ev.ref}: ${ev.product?.code||''} / ${ev.warehouse?.code||''} เหลือ ${qty(after)}`)});

  const belowMin=[...sim.entries()].map(([key,on])=>{const [wid,pid]=key.split('|'),p=state.data.products.find(x=>x.id===pid),w=state.data.warehouses.find(x=>x.id===wid),min=Number(p?.minimum_stock||0);return{p,w,on,min}}).filter(x=>x.p&&x.min>0&&x.on<x.min);

  const strip=rows=>rows.map(({__row,...x})=>x);
  pendingSalesHistory={receipts:strip(receipts),orders:strip(orders),lines:strip(lines),invoices:strip(invoices),errors,requestId:requestId('SALES-HISTORY-REAL')};
  const total=invoices.reduce((a,x)=>a+Number(x.revenue||0),0);
  $('#salesHistoryPreview').innerHTML=`<div class="alert ${errors.length?'danger':'ok'}">GR ${receipts.length} • Orders ${orders.length} • Lines ${lines.length} • Invoices ${invoices.length} • ยอดขาย ${money(total)} • Stock ต่ำกว่า Min หลังจบงวด ${belowMin.length} สินค้า/คลัง • Error ${errors.length}</div>`+
    (errors.length?`<div class="alert danger import-errors">${errors.slice(0,40).map(esc).join('<br>')}${errors.length>40?`<br>และอีก ${errors.length-40} รายการ`:''}</div>`:
      table(['Invoice','เดือน','ลูกค้า','Revenue','Product Cost','Freight','Contribution'],invoices.slice(0,20).map(x=>`<tr><td><b>${esc(x.invoice_no)}</b></td><td>${esc(x.month)}</td><td>${esc(x.customer_code)}</td><td class="num">${money(x.revenue)}</td><td class="num">${money(x.product_cost)}</td><td class="num">${money(x.freight_cost)}</td><td class="num">${money(x.contribution_profit)}</td></tr>`),'sales-import-preview',[3,4,5,6]));
  $('#commitSalesHistory').disabled=errors.length>0||orders.length===0;
}
async function commitSalesHistory(){
  if(!pendingSalesHistory||pendingSalesHistory.errors.length)return;
  setLoading(true);
  try{
    const {data,error}=await db.rpc('admin_import_sales_history',{
      p_receipts:pendingSalesHistory.receipts,
      p_orders:pendingSalesHistory.orders,
      p_lines:pendingSalesHistory.lines,
      p_invoices:pendingSalesHistory.invoices,
      p_request_id:pendingSalesHistory.requestId
    });
    if(error)throw error;
    toast(`นำเข้า GR ${data.receipts} / Orders ${data.orders} / Invoices ${data.invoices} พร้อม Stock Movement แล้ว`);
    closeModal();state.reportYear='2026';state.reportMonth='ALL';await loadData();state.page='stock';renderNav();render();
  }catch(e){fail(e)}finally{setLoading(false)}
}
function normalizeImport(kind,raw){const def=masterImportDefs[kind],errors=[],headers=raw[0]?.map(x=>x.replace(/^\ufeff/,'').trim())||[],requiredHeaders=kind==='products'?def.headers.filter(h=>h!=='minimum_stock'):def.headers;if(requiredHeaders.some(h=>!headers.includes(h)))return {rows:[],errors:[`Header ต้องมี: ${requiredHeaders.join(', ')}`]};const rows=raw.slice(1).map((values,index)=>{const src=Object.fromEntries(headers.map((h,i)=>[h,values[i]?.trim()||''])),line=index+2,out={company_id:state.profile.company_id,_preview:src};try{if(kind==='costs'){const p=state.data.products.find(x=>x.code===src.product_code);if(!p)throw new Error(`ไม่พบสินค้า ${src.product_code}`);if(!/^\d{4}-\d{2}$/.test(src.cost_month)||Number(src.unit_cost)<0)throw new Error('เดือนหรือต้นทุนไม่ถูกต้อง');Object.assign(out,{product_id:p.id,cost_month:src.cost_month+'-01',unit_cost:Number(src.unit_cost)})}else if(kind==='products'){const g=src.group_code?state.data.productGroups.find(x=>x.code===src.group_code):null;if(src.group_code&&!g)throw new Error(`ไม่พบกลุ่มสินค้า ${src.group_code}`);if(!src.code||!src.name||!src.base_uom)throw new Error('รหัส ชื่อ และหน่วยเป็นข้อมูลบังคับ');const minStock=src.minimum_stock===''||src.minimum_stock==null?0:Number(src.minimum_stock);if(!Number.isFinite(minStock)||minStock<0)throw new Error('Minimum Stock ต้องเป็น 0 หรือมากกว่า');Object.assign(out,{code:src.code,name:src.name,group_id:g?.id||null,base_uom:src.base_uom,minimum_stock:minStock,active:csvBool(src.active)})}else if(kind==='vehicles'){const vt=state.data.vehicleTypes.find(x=>x.code===src.vehicle_type&&x.active!==false);if(!vt)throw new Error(`ไม่พบประเภทรถ ${src.vehicle_type} ใน Vehicle Type Master`);if(!src.code||!src.plate_no)throw new Error('รหัสและทะเบียนรถเป็นข้อมูลบังคับ');Object.assign(out,{code:src.code,plate_no:src.plate_no,vehicle_type:vt.code,active:csvBool(src.active)})}else if(kind==='expenseTypes'){if(!src.code||!src.name||!expenseCategoryThai[src.category]||!expenseBasisThai[src.basis])throw new Error('รหัส ชื่อ ประเภท หรือฐานคำนวณไม่ถูกต้อง');Object.assign(out,{code:src.code,name:src.name,category:src.category,basis:src.basis,include_in_contribution:csvBool(src.include_in_contribution),active:csvBool(src.active)})}else if(kind==='expenseRates'){const t=state.data.expenseTypes.find(x=>x.code===src.expense_code),w=src.warehouse_code?state.data.warehouses.find(x=>x.code===src.warehouse_code):null,vt=src.vehicle_type?state.data.vehicleTypes.find(x=>x.code===src.vehicle_type&&x.active!==false):null;if(!t)throw new Error(`ไม่พบประเภทค่าใช้จ่าย ${src.expense_code}`);if(src.warehouse_code&&!w)throw new Error(`ไม่พบคลัง ${src.warehouse_code}`);if(src.vehicle_type&&!vt)throw new Error(`ไม่พบประเภทรถ ${src.vehicle_type} ใน Vehicle Type Master`);if(!src.effective_from||Number(src.rate)<0)throw new Error('วันที่เริ่มใช้หรืออัตราไม่ถูกต้อง');Object.assign(out,{expense_type_id:t.id,effective_from:src.effective_from,effective_to:src.effective_to||null,rate:Number(src.rate),warehouse_id:w?.id||null,vehicle_type:vt?.code||null,sales_type:null})}else{if(!src.code||!src.name)throw new Error('รหัสและชื่อเป็นข้อมูลบังคับ');def.headers.forEach(h=>{if(h==='active')out.active=csvBool(src[h]);else if(src[h]!==''||['code','name'].includes(h))out[h]=src[h]})}}catch(e){errors.push(`แถว ${line}: ${e.message}`);return null}return out}).filter(Boolean);return {rows,errors}}
function masterImportModal(){const options=Object.entries(masterImportDefs).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');modal(`<h2>Master Import Center</h2><div class="alert warn">1) เลือก Master 2) ดาวน์โหลด CSV Template 3) กรอกข้อมูล 4) เลือกไฟล์เพื่อ Preview 5) ยืนยันนำเข้า</div><div class="form"><label>ประเภท Master<select id="importKind">${options}</select></label><label>ไฟล์ CSV UTF-8<input id="importFile" type="file" accept=".csv,text/csv"></label></div><div class="actions" style="margin:14px 0"><button type="button" id="downloadTemplate" class="btn">⇩ Download Template</button><button type="button" id="previewImport" class="btn">ตรวจสอบไฟล์</button><button type="button" id="commitImport" class="btn primary" disabled>นำเข้าข้อมูล</button></div><div id="importPreview">${empty('ยังไม่ได้เลือกไฟล์')}</div>`);$('#downloadTemplate').onclick=()=>{const d=masterImportDefs[$('#importKind').value];downloadCsv(`FlowStock_${d.label.replaceAll(' ','_')}_Template.csv`,d.headers,d.sample)};$('#previewImport').onclick=previewMasterImport;$('#commitImport').onclick=commitMasterImport}
async function previewMasterImport(){const file=$('#importFile').files[0];if(!file)return toast('กรุณาเลือกไฟล์ CSV',true);const kind=$('#importKind').value,result=normalizeImport(kind,parseCsv(await file.text()));pendingMasterImport={kind,...result};const sample=result.rows.slice(0,20),headers=masterImportDefs[kind].headers;$('#importPreview').innerHTML=`<div class="alert ${result.errors.length?'danger':'ok'}">ผ่าน ${result.rows.length} แถว • Error ${result.errors.length} แถว</div>${result.errors.length?`<div class="alert danger">${result.errors.map(esc).join('<br>')}</div>`:''}${sample.length?table(headers,sample.map(r=>`<tr>${headers.map(h=>`<td>${esc(r._preview?.[h]??r[h]??'-')}</td>`).join('')}</tr>`)):empty()}`;$('#commitImport').disabled=result.errors.length>0||result.rows.length===0}
async function commitMasterImport(){if(!pendingMasterImport?.rows.length)return;const {kind}=pendingMasterImport,rows=pendingMasterImport.rows.map(({_preview,...r})=>r),def=masterImportDefs[kind];setLoading(true);let error;if(kind==='expenseRates'){const res=await db.from(def.table).insert(rows);error=res.error}else{const res=await db.from(def.table).upsert(rows,{onConflict:def.conflict});error=res.error}setLoading(false);if(error)return fail(error);toast(`นำเข้า ${def.label} ${rows.length} รายการแล้ว`);closeModal();await loadData();render()}
function generateTemporaryPassword(){const pick=s=>s[crypto.getRandomValues(new Uint32Array(1))[0]%s.length],all='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';let value=`F${pick('ABCDEFGHJKLMNPQRSTUVWXYZ')}${pick('abcdefghijkmnopqrstuvwxyz')}${pick('23456789')}${pick('!@#$%')}`;while(value.length<14)value+=pick(all);return [...value].sort(()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296-.5).join('')}
async function invokeAdminUserManagement(body){const {data,error}=await db.functions.invoke('admin-user-management',{body});if(!error)return data;let payload=null;try{payload=await error.context?.json()}catch(_){/* response may already be consumed */}throw new Error(payload?.error||error.message||'ADMIN_USER_OPERATION_FAILED')}
function credentialResultModal(title,email,password,note=''){modal(`<h2>${esc(title)}</h2><div class="alert ok">${esc(note||'สร้างบัญชีสำเร็จ')}</div><p class="muted">ส่งข้อมูลนี้ให้ผู้ใช้ผ่านช่องทางภายในที่ปลอดภัย รหัสนี้จะแสดงในหน้านี้ครั้งเดียว</p><div class="form"><label>อีเมล<input id="credentialEmail" value="${esc(email)}" readonly></label><label>รหัสผ่านชั่วคราว<input id="credentialPassword" value="${esc(password)}" readonly></label></div><button id="copyCredential" class="btn primary wide" type="button">คัดลอกข้อมูลเข้าระบบ</button>`);$('#copyCredential').onclick=async()=>{await navigator.clipboard.writeText(`FlowStock\nURL: ${FLOWSTOCK_APP_URL}\nEmail: ${email}\nTemporary password: ${password}\nกรุณาเปลี่ยนรหัสผ่านทันทีหลัง Login`);toast('คัดลอกข้อมูลผู้ใช้แล้ว')}}
function adminUserModal(){const password=generateTemporaryPassword(),roleOptions=['SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN'].map(r=>`<option value="${r}">${roleThai[r]}</option>`).join('');modal(`<h2>สร้างผู้ใช้ใหม่</h2><div class="alert ok">ไม่ต้องรออีเมลยืนยัน ผู้ใช้เข้าได้ทันทีด้วยรหัสชั่วคราวและระบบจะบังคับตั้งรหัสใหม่</div><form id="adminUserForm"><div class="form"><label>ชื่อ-นามสกุล<input id="adminUserName" required></label><label>รหัสพนักงาน<input id="adminUserEmployee" required></label><label>อีเมล<input id="adminUserEmail" type="email" required></label><label>หน้าที่<select id="adminUserRole">${roleOptions}</select></label><label class="full">รหัสผ่านชั่วคราว<input id="adminUserPassword" value="${esc(password)}" minlength="10" required></label></div><button class="btn primary wide" type="submit">สร้างผู้ใช้</button></form>`);$('#adminUserForm').onsubmit=async e=>{e.preventDefault();const temporaryPassword=$('#adminUserPassword').value;setLoading(true);try{const result=await invokeAdminUserManagement({action:'CREATE_USER',email:$('#adminUserEmail').value.trim(),full_name:$('#adminUserName').value.trim(),employee_code:$('#adminUserEmployee').value.trim(),app_role:$('#adminUserRole').value,temporary_password:temporaryPassword});await loadData();credentialResultModal(result.attached_existing_auth?'เปิดสิทธิ์บัญชีเดิมสำเร็จ':'สร้างผู้ใช้สำเร็จ',result.email,temporaryPassword,result.attached_existing_auth?'พบอีเมลที่เคยสมัครค้างไว้ ระบบผูกเข้าบริษัทและเปิดใช้งานแล้ว':'บัญชีพร้อมใช้งานแล้ว')}catch(err){fail(err)}finally{setLoading(false)}}}
function resetUserPasswordModal(id){const user=(state.data.users||[]).find(x=>x.user_id===id);if(!user)return toast('ไม่พบผู้ใช้',true);const password=generateTemporaryPassword();modal(`<h2>ตั้งรหัสชั่วคราวใหม่</h2><div class="alert warn">${esc(user.full_name)} จะต้องเปลี่ยนรหัสผ่านทันทีในการ Login ครั้งถัดไป</div><form id="resetUserPasswordForm"><label>รหัสผ่านชั่วคราว<input id="resetTemporaryPassword" value="${esc(password)}" minlength="10" required></label><button class="btn primary wide" type="submit">ยืนยันตั้งรหัสใหม่</button></form>`);$('#resetUserPasswordForm').onsubmit=async e=>{e.preventDefault();const temporaryPassword=$('#resetTemporaryPassword').value;setLoading(true);try{await invokeAdminUserManagement({action:'RESET_PASSWORD',user_id:id,temporary_password:temporaryPassword});await loadData();credentialResultModal('ตั้งรหัสชั่วคราวใหม่แล้ว',user.email,temporaryPassword,`ส่งรหัสใหม่ให้ ${user.full_name}`)}catch(err){fail(err)}finally{setLoading(false)}}}
function forcePasswordChangeModal(){const close=$('#modalClose');close.classList.add('hidden');$('#modalBody').dataset.busy='1';modal(`<h2>ตั้งรหัสผ่านส่วนตัว</h2><div class="alert warn">เพื่อความปลอดภัย ต้องเปลี่ยนรหัสผ่านชั่วคราวก่อนเข้าดูข้อมูลบริษัท</div><form id="forcePasswordForm"><div class="form"><label class="full">รหัสผ่านใหม่ (อย่างน้อย 10 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข)<input id="forcePassword" type="password" minlength="10" autocomplete="new-password" required></label><label class="full">ยืนยันรหัสผ่านใหม่<input id="forcePasswordConfirm" type="password" minlength="10" autocomplete="new-password" required></label></div><button class="btn primary wide" type="submit">บันทึกและเข้าใช้งาน</button><button id="forcePasswordLogout" class="btn wide" type="button">ออกจากระบบ</button></form>`);$('#forcePasswordLogout').onclick=async()=>{$('#modalBody').dataset.busy='0';close.classList.remove('hidden');await db.auth.signOut()};$('#forcePasswordForm').onsubmit=async e=>{e.preventDefault();const password=$('#forcePassword').value;if(password!==$('#forcePasswordConfirm').value)return toast('ยืนยันรหัสผ่านไม่ตรงกัน',true);if(password.length<10||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))return toast('รหัสผ่านยังไม่ผ่านเกณฑ์ความปลอดภัย',true);setLoading(true);try{const {error}=await db.auth.updateUser({password});if(error)throw error;const {error:completeError}=await db.rpc('complete_initial_password_change');if(completeError)throw completeError;$('#modalBody').dataset.busy='0';close.classList.remove('hidden');toast('ตั้งรหัสผ่านใหม่แล้ว');location.reload()}catch(err){fail(err)}finally{setLoading(false)}}}
async function forgotPassword(){modal('<h2>ขอรหัสผ่านใหม่</h2><div class="alert warn">กรุณาติดต่อ Admin บริษัทของคุณ เพื่อให้ตั้งรหัสผ่านชั่วคราวใหม่จากเมนู Users / Roles</div><ol><li>Admin กด “ตั้งรหัสชั่วคราวใหม่” ที่ชื่อผู้ใช้</li><li>Admin ส่งอีเมลและรหัสชั่วคราวให้ผู้ใช้ผ่านช่องทางภายใน</li><li>ผู้ใช้ Login แล้วระบบบังคับตั้งรหัสผ่านส่วนตัวทันที</li></ol><p class="muted">วิธีนี้ไม่ต้องรออีเมลยืนยันและไม่ต้องเข้า Supabase</p>')}
function passwordRecoveryModal(){modal('<h2>ตั้งรหัสผ่านใหม่</h2><form id="recoveryForm"><div class="form"><label class="full">รหัสผ่านใหม่อย่างน้อย 10 ตัวอักษร<input id="recoveryPassword" type="password" minlength="10" required></label></div><button class="btn primary">บันทึกรหัสผ่านใหม่</button></form>');$('#recoveryForm').onsubmit=async e=>{e.preventDefault();setLoading(true);try{const {error}=await db.auth.updateUser({password:$('#recoveryPassword').value});if(error)throw error;const {error:completeError}=await db.rpc('complete_initial_password_change');if(completeError)throw completeError;toast('เปลี่ยนรหัสผ่านแล้ว');closeModal();location.reload()}catch(err){fail(err)}finally{setLoading(false)}}}
function csvCell(v){const s=String(v??'');return `"${s.replaceAll('"','""')}"`}
function downloadCsv(name,headers,rows){const csv='\ufeff'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportOrders(){downloadCsv('FlowStock_Orders.csv',['Order','Customer','Order Date','Status','Amount THB'],state.data.orders.map(o=>[o.order_no,customerName(o.customer_id),o.order_date,o.status,orderLines(o.id).reduce((s,l)=>s+Number(l.qty)*Number(l.unit_price),0)]))}
function exportStock(){
  const policy=minimumStockPolicy(),byWarehouse=policy==='BY_WAREHOUSE',totals=new Map();
  (state.data.balances||[]).forEach(b=>totals.set(b.product_id,(totals.get(b.product_id)||0)+Number(b.on_hand||0)));
  downloadCsv('FlowBiz_One_Stock.csv',['Product Code','Product Name','Warehouse','On Hand','Minimum Scope','Minimum Stock','Allocated','Available','Status','UoM'],state.data.balances.map(b=>{
    const p=product(b.product_id),w=warehouse(b.warehouse_id),min=byWarehouse?effectiveWarehouseMinimum(b.product_id,b.warehouse_id):Number(p.minimum_stock||0),
      on=Number(b.on_hand||0),allocated=Number(b.allocated||0),available=on-allocated,
      low=min>0&&(byWarehouse?on<min:Number(totals.get(b.product_id)||0)<min),
      status=min<=0?'NO MIN':low?'BELOW MIN':'OK';
    return[p.code,p.name,w.code,on,byWarehouse?'BY_WAREHOUSE':'TOTAL',min,allocated,available,status,p.base_uom]
  }))
}
function exportMovements(){downloadCsv('FlowStock_Stock_Movement.csv',['Date','Product','Warehouse','Type','Reference','In','Out','Balance After'],movementRows().map(m=>{const p=product(m.product_id),w=warehouse(m.warehouse_id),inQty=Number(m.qty)>0?Number(m.qty):0,outQty=Number(m.qty)<0?Math.abs(Number(m.qty)):0;return[m.created_at,p.code,w.code,movementTypeThai[m.movement_type]||m.movement_type,m.reference_no||'',inQty,outQty,Number(m.balance_after||0)]}))}
function emailStockReport(){const rows=movementRows().slice(0,50),body=['FlowBiz One Stock Movement Report','',...rows.map(m=>{const p=product(m.product_id),w=warehouse(m.warehouse_id),inQty=Number(m.qty)>0?Number(m.qty):0,outQty=Number(m.qty)<0?Math.abs(Number(m.qty)):0;return `${String(m.created_at).slice(0,10)} | ${p.code} | ${w.code} | ${movementTypeThai[m.movement_type]||m.movement_type} | In ${inQty||'-'} | Out ${outQty||'-'} | Balance ${m.balance_after}`})].join('\n');window.location.href=`mailto:?subject=${encodeURIComponent('FlowBiz One Stock Movement Report')}&body=${encodeURIComponent(body)}`}
function exportProfit(){const rows=[];analyticsInvoices().forEach(i=>{const oid=invoiceOrderId(i.id),o=byId('orders',oid),trip=byId('trips',invoiceTripId(i.id)),vehicle=byId('vehicles',trip?.vehicle_id),driver=byId('drivers',trip?.driver_id),lines=orderLines(oid),delivered=trip?tripLines(trip.id):[],lineRevenueFor=l=>Number(delivered.find(x=>x.order_line_id===l.id)?.received_qty??l.qty??0)*Number(l.unit_price||0),lineTotal=lines.reduce((s,l)=>s+lineRevenueFor(l),0);lines.filter(l=>state.reportProduct==='ALL'||l.product_id===state.reportProduct).forEach(l=>{const p=product(l.product_id),tripLine=delivered.find(x=>x.order_line_id===l.id),lineRevenue=lineRevenueFor(l),share=lineTotal?lineRevenue/lineTotal:1/Math.max(1,lines.length),lineCost=Number(i.product_cost||0)*share,lineGross=lineRevenue-lineCost,lineFreight=Number(i.freight_cost||0)*share,lineOther=Number(i.other_cost||0)*share,lineContribution=lineGross-lineFreight-lineOther,w=warehouse(l.warehouse_id);rows.push([i.invoice_no,i.invoice_date,o?.order_no||'',customerName(i.customer_id),p.code||'',p.name||'',p.base_uom||'',l.qty,tripLine?.received_qty??l.issued_qty??l.qty,l.unit_price,lineRevenue,w.code||'',trip?.trip_no||'',vehicle?.code||'',vehicle?.plate_no||'',driver?.name||'',lineCost,lineGross,lineRevenue?lineGross/lineRevenue*100:0,lineFreight,lineOther,lineContribution,lineRevenue?lineContribution/lineRevenue*100:0,i.gp_status,share])})});downloadCsv(`FlowStock_Profit_Detail_${state.reportYear}_${state.reportMonth}.csv`,['Invoice','Invoice Date','Order','Customer','Product Code','Product Name','UoM','Order Qty','Received Qty','Unit Price','Line Revenue','Warehouse','Trip','Vehicle Code','Plate No','Driver','Allocated Product Cost','Line Gross Profit','GP Margin %','Allocated Freight','Allocated Direct Expense','Line Contribution Profit','Contribution %','Status','Line Share'],rows)}
function exportAudit(){downloadCsv('FlowStock_Audit_Log.csv',['Timestamp','Action','Entity Type','Entity ID','User ID'],(state.data.audit||[]).map(x=>[x.created_at,x.action,x.entity_type,x.entity_id,x.user_id]))}
async function completeTrip(e,id){e.preventDefault();const file=$('#podFile').files[0];if(!file||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10485760)return toast('เลือกไฟล์ PDF/JPG/PNG ขนาดไม่เกิน 10 MB',true);const ext=({"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"})[file.type],path=`${state.profile.company_id}/${id}/${crypto.randomUUID()}.${ext}`,lines=$$('.pod-line').map(r=>({trip_line_id:r.dataset.id,received_qty:Number(r.querySelector('.pod-qty').value),variance_reason:r.querySelector('.pod-reason').value.trim()||null})),expenses=$$('.expense-line').map(r=>({expense_type_id:r.dataset.id,amount:Number(r.querySelector('.expense-amount').value||0),note:r.querySelector('.expense-note').value.trim()||null})).filter(x=>x.amount>0);$('#modalBody').dataset.busy='1';setLoading(true);let completed=false;try{const {error:uploadError}=await db.storage.from('pod-documents').upload(path,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;const ref=$('#podRef').value.trim();const {data,error}=await db.rpc('complete_delivery',{p_trip_id:id,p_lines:lines,p_actual_freight:Number($('#actualFreight').value),p_pod_reference:ref?`${ref} | ${path}`:path,p_request_id:requestId('POD'),p_expenses:expenses});if(error)throw error;completed=true;const {error:attachError}=await db.rpc('attach_delivery_document',{p_trip_id:id,p_object_path:path,p_original_name:file.name,p_mime_type:file.type,p_file_size:file.size});if(attachError)throw attachError;toast(`ปิดงานและสร้าง ${data.invoice_no} • ${data.gp_status}`);$('#modalBody').dataset.busy='0';closeModal();await loadData();render()}catch(err){if(!completed)await db.storage.from('pod-documents').remove([path]);fail(err)}finally{$('#modalBody').dataset.busy='0';setLoading(false)}}
async function openPod(id){const doc=state.data.deliveryDocs.find(x=>x.id===id);if(!doc)return toast('ไม่พบเอกสาร POD',true);setLoading(true);const {data,error}=await db.storage.from(doc.bucket_id).createSignedUrl(doc.object_path,300);setLoading(false);if(error)return fail(error);window.open(data.signedUrl,'_blank','noopener')}
function tenantModal(){modal(`<h2>เปิดบริษัทลูกค้า</h2><form id="tenantForm"><div class="form"><label>รหัสบริษัท<input id="tenantCode" minlength="3" maxlength="20" pattern="[A-Za-z0-9_-]+" required></label><label>ชื่อบริษัท<input id="tenantName" required></label><label>แพ็กเกจ<select id="tenantPlan"><option>STARTER</option><option>BUSINESS</option><option>ENTERPRISE</option></select></label><label>จำนวนผู้ใช้สูงสุด<input id="tenantMax" type="number" min="1" max="10000" value="10" required></label><label>ทดลองใช้ (วัน)<input id="tenantTrial" type="number" min="1" max="365" value="30" required></label></div><button class="btn primary">สร้างบริษัท</button></form>`);$('#tenantForm').onsubmit=async e=>{e.preventDefault();setLoading(true);try{const {data,error}=await db.rpc('platform_create_tenant',{p_code:$('#tenantCode').value,p_name:$('#tenantName').value,p_plan:$('#tenantPlan').value,p_trial_days:Number($('#tenantTrial').value),p_max_users:Number($('#tenantMax').value)});if(error)throw error;await loadData();tenantAdminModal(data)}catch(err){fail(err)}finally{setLoading(false)}}}
function tenantAdminModal(tenant){const temporaryPassword=generateTemporaryPassword();modal(`<h2>สร้าง Admin บริษัท ${esc(tenant.company_code)}</h2><div class="alert warn">กรอกผู้ดูแลบริษัทเพื่อให้เข้าระบบได้ทันที หากปิดหน้านี้ ให้กดจัดการที่บริษัทแล้วเลือกสร้าง Admin</div><form id="tenantAdminForm"><div class="form"><label>ชื่อผู้ดูแล<input id="tenantAdminName" required></label><label>รหัสพนักงาน<input id="tenantAdminEmployee" required></label><label>อีเมล<input id="tenantAdminEmail" type="email" required></label><label>รหัสชั่วคราว<input id="tenantAdminPassword" minlength="10" value="${esc(temporaryPassword)}" required></label></div><button class="btn primary">สร้าง Admin</button></form>`);$('#tenantAdminForm').onsubmit=async e=>{e.preventDefault();setLoading(true);try{const pass=$('#tenantAdminPassword').value,result=await invokeAdminUserManagement({action:'CREATE_TENANT_ADMIN',company_id:tenant.company_id,email:$('#tenantAdminEmail').value.trim(),full_name:$('#tenantAdminName').value.trim(),employee_code:$('#tenantAdminEmployee').value.trim(),app_role:'ADMIN',temporary_password:pass});await loadData();credentialResultModal('สร้าง Admin บริษัทสำเร็จ',result.email,pass,'ผู้ดูแลเข้าใช้งานแล้วตั้งรหัสใหม่ครั้งแรก')}catch(err){fail(err)}finally{setLoading(false)}}}
function manageTenantModal(id){const c=state.data.tenants.find(x=>x.id===id);modal(`<h2>จัดการ ${esc(c.code)} • ${esc(c.name)}</h2><form id="tenantManageForm"><div class="form"><label>สถานะ<select id="manageStatus">${['TRIAL','ACTIVE','SUSPENDED','EXPIRED'].map(x=>`<option ${x===c.subscription_status?'selected':''}>${x}</option>`).join('')}</select></label><label>แพ็กเกจ<select id="managePlan">${['STARTER','BUSINESS','ENTERPRISE'].map(x=>`<option ${x===c.subscription_plan?'selected':''}>${x}</option>`).join('')}</select></label><label>จำนวนผู้ใช้สูงสุด<input id="manageMax" type="number" min="1" max="10000" value="${c.max_users}" required></label></div><div class="alert warn">SUSPENDED และ EXPIRED จะหยุดการเข้าถึงข้อมูลและการทำธุรกรรมทันที แต่ไม่ลบข้อมูล</div><button class="btn primary">บันทึก</button></form><button id="createTenantAdmin" type="button" class="btn">+ สร้าง Admin บริษัท</button>`);$('#createTenantAdmin').onclick=()=>tenantAdminModal({company_id:c.id,company_code:c.code});$('#tenantManageForm').onsubmit=async e=>{e.preventDefault();await runRpc('platform_set_company_status',{p_company_id:id,p_status:$('#manageStatus').value,p_plan:$('#managePlan').value,p_max_users:Number($('#manageMax').value)},()=>`อัปเดต ${c.code} แล้ว`)}}
async function saveUser(id,active){const role=$(`#userRole-${id}`).value;setLoading(true);const {error}=await db.rpc('admin_update_user',{p_user_id:id,p_app_role:role,p_active:active});setLoading(false);if(error)return fail(error);toast('บันทึกสิทธิ์ผู้ใช้แล้ว');await loadData();render()}
async function setPeriod(date,status,reason=null){if(status==='CLOSED'&&!confirm(`ยืนยันปิดงวด ${date.slice(0,7)}? รายการในงวดนี้จะแก้ไขไม่ได้`))return;setLoading(true);const {error}=await db.rpc('set_period_status',{p_period_month:date,p_status:status,p_reason:reason});setLoading(false);if(error)return fail(error);toast(status==='CLOSED'?'ปิดงวดแล้ว':'เปิดงวดแล้ว');await loadData();render()}
function reopenPeriod(date){modal(`<h2>Reopen Period ${esc(date.slice(0,7))}</h2><form id="reopenForm"><div class="form"><label class="full">เหตุผลที่เปิดงวดใหม่<textarea id="reopenReason" required></textarea></label></div><button class="btn primary">ยืนยัน Reopen</button></form>`);$('#reopenForm').onsubmit=async e=>{e.preventDefault();await setPeriod(date,'OPEN',$('#reopenReason').value.trim());closeModal()}}
async function runRpc(name,args,message){if($('#modalBody').dataset.busy==='1')return;$('#modalBody').dataset.busy='1';const submitButtons=[...document.querySelectorAll('#modalBody button[type=submit], #modalBody button:not([type])')];submitButtons.forEach(b=>{b.disabled=true;b.dataset.before=b.textContent;b.textContent='กำลังบันทึก…'});setLoading(true);try{const {data,error}=await db.rpc(name,args);if(error)throw error;toast(message(data));$('#modalBody').dataset.busy='0';closeModal();await loadData();render()}catch(e){fail(e)}finally{$('#modalBody').dataset.busy='0';submitButtons.forEach(b=>{b.disabled=false;b.textContent=b.dataset.before});setLoading(false)}}

startSearchableSelectObserver();
init().catch(e=>{setLoading(false);showLogin();$('#loginError').textContent=errorText(e);console.error(e)});
