'use strict';

// FlowBiz One self-service support layer
// Goal: help users solve common questions in-app before contacting Company Admin / Support.
const SELF_SERVICE_HELP_VERSION='2026-09-27-v1';

const ROLE_FIRST_LOGIN={
  SALES:{title:'ฝ่ายขาย',startPage:'orders',steps:[
    'เปิด Orders และทดลองสร้าง Order 1 รายการ',
    'เลือกลูกค้า สินค้า และคลัง แล้วตรวจ Available Stock ก่อนยืนยัน',
    'ติดตามสถานะ Order จนถึงรอจัดรถ/ส่งสินค้า',
    'ถ้าหาลูกค้าหรือสินค้าไม่เจอ ให้แจ้ง Company Admin ตรวจ Master ก่อน'
  ]},
  WAREHOUSE:{title:'คลังสินค้า',startPage:'warehouse',steps:[
    'เปิดงานคลัง ดูงานรอจ่ายและรายการรับสินค้าล่าสุด',
    'ทดลองรับสินค้า หรือจ่ายสินค้าให้ Order ตามงานที่ได้รับ',
    'เปิด Stock Movement ตรวจว่า IN/OUT และเลขอ้างอิงถูกต้อง',
    'ทบทวนเมนูตรวจนับ, Adjustment, Transfer และ Repack — ห้ามปรับ Stock ตรงแทน Flow จริง'
  ]},
  LOGISTICS:{title:'ขนส่ง',startPage:'delivery',steps:[
    'เปิดงานขนส่งและเลือก Order ที่คลังจ่ายพร้อมแล้ว',
    'สร้างเที่ยวโดยเลือกรถ คนขับ และเวลาที่ไม่ชนเที่ยวอื่น',
    'บันทึก Actual Received ตามยอดที่ลูกค้ารับจริง',
    'ถ้ารับไม่ครบ ให้ใส่เหตุผล และแนบ POD ให้ถูกเที่ยว'
  ]},
  WAREHOUSE_LOGISTICS:{title:'คลัง + ขนส่ง',startPage:'warehouse',steps:[
    'เริ่มจากงานคลังและจ่ายสินค้าให้ Order ให้ถูกต้อง',
    'ตรวจ Stock Movement ก่อนส่งต่องานไปขนส่ง',
    'สร้างเที่ยว บันทึก Actual Received และ POD',
    'ปลายวันตรวจ Order/Trip/Stock Movement ว่าจบสัมพันธ์กัน'
  ]},
  OWNER:{title:'ผู้บริหาร',startPage:'dashboard',steps:[
    'เริ่มจาก Executive Dashboard และตรวจ Filter ปี/เดือนให้ถูก',
    'ดู Sales, GP, Contribution และ Contribution % ควบคู่กัน',
    'กดรายการต้องติดตามเพื่อเจาะถึง Invoice/Stock ต้นเหตุ',
    'เปิด Sales & Profit 360°, Customer 360°, Stock Summary และ Delivery Performance อย่างน้อยครั้งละ 1 หน้า'
  ]},
  ADMIN:{title:'ผู้ดูแลระบบ',startPage:'dashboard',steps:[
    'ตรวจ Users / Roles และจำนวนผู้ใช้ตามแพ็กเกจ',
    'ตรวจ Master Data: Customer, Product, Warehouse, Vendor, Vehicle, Driver',
    'ตรวจ System Setup: Minimum Stock, Order Policy และ Stock Count Policy',
    'ก่อน Opening/Import ให้ Preview จน Error = 0 และก่อนงานเสี่ยงให้ตรวจ Backup/Audit'
  ]}
};

const PAGE_SELF_HELP={
  dashboard:{checks:['ตรวจ Filter ปี/เดือน/คลัง/ลูกค้าก่อนเทียบตัวเลข','กดการ์ดแจ้งเตือนเพื่อดูรายการต้นเหตุ ไม่สรุปจาก KPI อย่างเดียว']},
  executive:{checks:['ตรวจ Filter ก่อน','Contribution ต่ำให้เจาะระดับ Invoice ดู Product Cost / Freight / Direct Expense']},
  orders:{checks:['ตรวจ Customer, Product, Warehouse และ Available Stock','ถ้าเลข Order ซ้ำ ให้ค้นหา Order เดิมก่อนสร้างใหม่','หลังยืนยันแล้ว อย่าแก้ข้อมูลโดยสร้างรายการซ้ำ']},
  warehouse:{checks:['ตรวจคลังและเลขเอกสารอ้างอิงก่อน Post','Stock ไม่พอให้เปิด Stock/Movement ตรวจต้นเหตุ','ใช้ Reverse เมื่อบันทึกผิด แทนการแก้ฐานข้อมูลตรง']},
  stock:{checks:['ตรวจว่าดูรวมทุกคลังหรือแยกตามคลัง','ตรวจ Movement ตามสินค้า/คลัง/วันที่ก่อนสรุปว่ายอดผิด','Minimum Stock เป็นเกณฑ์เตือน ไม่ใช่ยอดคงเหลือ']},
  counts:{checks:['กรอก Actual Qty ให้ครบ','ส่วนต่างต้องมีเหตุผล','ตรวจ Stock Count Policy ของรอบก่อนคาดหวังผล Adjustment']},
  stockadjust:{checks:['Submit ยังไม่กระทบ On Hand จนกว่าจะ Post','ระบุเหตุผล + / - ให้ชัด','ถ้าผิดให้ Reverse เพื่อคง Audit Trail']},
  transfers:{checks:['ต้นทางต้องมี Stock พอ','ตรวจคลังต้นทาง/ปลายทางก่อนยืนยัน','ตรวจ TRANSFER_OUT และ TRANSFER_IN หลังจบ']},
  repack:{checks:['From/To ต้องเป็นคนละสินค้าและ UoM ตามกติกา','Out = In ตามจำนวน Repack','ถ้าผิดใช้ Reverse ไม่แก้ Stock ตรง']},
  delivery:{checks:['Order ต้องพร้อมส่งก่อนสร้างเที่ยว','รถ/เวลาไม่ควรชนเที่ยวอื่น','Actual Received ไม่เกินยอดส่ง และรับไม่ครบต้องมีเหตุผล','POD ต้องเป็นไฟล์ที่รองรับและตรงเที่ยว']},
  profit:{checks:['ตรวจ Filter ก่อน','กำไรต่ำให้สลับดู By Invoice/Customer/Product/Warehouse','Contribution = Gross Profit - Freight - Direct Expense']},
  customer360:{checks:['ตรวจปี/เดือนก่อน','อย่าดูยอดขายอย่างเดียว ให้ดู Contribution % และจำนวน Invoice']},
  stockhealth:{checks:['ตรวจนโยบาย Minimum Stock ว่า TOTAL หรือ BY WAREHOUSE','กดดูรายละเอียดเพื่อเห็นสินค้า/คลังต้นเหตุ']},
  deliveryperformance:{checks:['ตรวจช่วงเวลา','ดู Trips, ปริมาณส่งจริง, Freight และ On-time ร่วมกัน']},
  costvariance:{checks:['ตรวจเดือนต้นทุนสินค้า','เจาะรายการที่ผลต่างสูงก่อนสรุปสาเหตุ']},
  reports:{checks:['ตั้ง Filter ในรายงานต้นทางก่อน Export','CSV ใช้ตรวจรายการ ไม่ใช่ Backup ฐานข้อมูลทั้งระบบ']},
  masters:{checks:['Master ที่เคยใช้แล้วให้ Deactivate มากกว่า Delete','Import ให้ Preview ก่อนทุกครั้ง','Product/Minimum/Cost ต้องใช้รหัสที่ตรง Master']},
  users:{checks:['ตรวจอีเมล, Role, Active และจำนวน User ตามแพ็กเกจ','ผู้ใช้ใหม่ใช้รหัสชั่วคราวและต้องเปลี่ยนรหัสตามขั้นตอน']},
  settings:{checks:['เปลี่ยน Policy ต้องเข้าใจผลต่อ Flow ก่อน','Period Close/Reopen ควรมีเหตุผลและตรวจ Audit']},
  datamanagement:{checks:['ก่อนล้าง/เริ่มปีใหม่ต้องมี Backup ที่ตรวจสอบแล้ว','ห้ามใช้ Demo reset แทน Production backup','Restore rehearsal ต้องทำใน Test Environment']},
  audit:{checks:['ค้นจากเวลา + ผู้ใช้ + เลขอ้างอิง','ใช้ Audit หาต้นเหตุก่อนแก้ข้อมูล']}
};

if(typeof PAGE_HELP!=='undefined'){
  Object.entries(PAGE_SELF_HELP).forEach(([page,extra])=>{
    if(PAGE_HELP[page])Object.assign(PAGE_HELP[page],extra);
  });
}

function selfServiceSupportText(){
  return 'ถ้ายังทำไม่ได้: ถ่ายภาพหน้าจอ + ระบุเลข Order/Invoice/Trip/GR (ถ้ามี) + เวลาเกิดปัญหา + ขั้นตอนล่าสุด แล้วส่ง Company Admin ก่อนแจ้ง Support';
}

// Job 1: make ? วิธีใช้ actionable on every page.
showPageHelp=function(){
  const h=currentHelp();
  const checks=h.checks||['ตรวจข้อมูลที่กรอกและสถานะรายการ','ลองรีเฟรชข้อมูล 1 ครั้ง แล้วทำขั้นตอนเดิมใหม่'];
  modal(`<div class="help-modal">
    <div class="help-modal-head"><div><small>FLOWBIZ ONE QUICK GUIDE</small><h2>${esc(h.title)}</h2></div></div>
    <div class="help-steps">${(h.steps||[]).map((x,i)=>`<div class="help-step"><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>
    <h3>ก่อนแจ้งปัญหา ให้ตรวจ 2–3 จุดนี้ก่อน</h3>
    <div class="help-steps compact-help">${checks.map((x,i)=>`<div class="help-step"><b>✓</b><span>${esc(x)}</span></div>`).join('')}</div>
    <div class="alert info"><b>ถ้ายังทำไม่ได้</b><br>${esc(selfServiceSupportText())}</div>
    <div class="actions"><button class="btn" id="openTrialGuideFromHelp" type="button">Trial Guide 10 นาที</button><button class="btn primary" id="closeHelpGuide" type="button">เข้าใจแล้ว</button></div>
  </div>`);
  const t=$('#openTrialGuideFromHelp');if(t)t.onclick=showTrialGuide;
  const c=$('#closeHelpGuide');if(c)c.onclick=closeModal;
};

function enhancedErrorDetail(message){
  const m=String(message||'');
  const out={cause:'ระบบพบเงื่อนไขที่ยังไม่พร้อมสำหรับขั้นตอนนี้',action:'ตรวจข้อมูลบนหน้าจอและสถานะรายการ แล้วลองใหม่อีกครั้ง',check:'ถ้ายังไม่สำเร็จ ให้ส่งภาพหน้าจอและเลขเอกสารให้ Company Admin'};
  if(/Stock ไม่เพียงพอ|ORDER_STOCK_BLOCKED/i.test(m))return{cause:'Available Stock ของสินค้า/คลังไม่พอกับจำนวนที่ต้องการ',action:'เปิด Stock ตรวจ Available และ Movement; ลดจำนวนหรือเลือกคลังที่มี Stock ตามนโยบายบริษัท',check:'ห้ามแก้ On Hand ตรงเพื่อให้รายการผ่าน'};
  if(/งวด|PERIOD_CLOSED/i.test(m))return{cause:'วันที่รายการอยู่ในงวดที่ปิดแล้ว',action:'ให้ Admin ตรวจ Period Close; ถ้าจำเป็นต้องแก้ ให้ Reopen ตามสิทธิ์พร้อมเหตุผล',check:'ไม่ควรเปลี่ยนวันที่เอกสารเพื่อหลบงวดปิด'};
  if(/ไม่พบสินค้า|INVALID_PRODUCT/i.test(m))return{cause:'รหัสสินค้าไม่มีใน Product Master หรือไม่ได้ Active',action:'ค้น Product Master ด้วยรหัส/ชื่อ; ถ้าไม่มีให้ Admin สร้างหรือเปิด Active ก่อน',check:'ตรวจว่าพิมพ์รหัสถูกบริษัทและถูกสินค้า'};
  if(/ไม่พบลูกค้า|INVALID_CUSTOMER/i.test(m))return{cause:'รหัสลูกค้าไม่มีใน Customer Master หรือไม่ได้ Active',action:'ค้น Customer Master; ถ้าไม่มีให้ Admin สร้างหรือเปิด Active ก่อน',check:'อย่าสร้างลูกค้าซ้ำเพียงเพราะค้นไม่เจอ'};
  if(/ไม่พบคลัง|INVALID_WAREHOUSE/i.test(m))return{cause:'รหัสคลังไม่มีใน Warehouse Master หรือไม่ได้ Active',action:'ให้ Admin ตรวจ Warehouse Master และสิทธิ์/สถานะของคลัง',check:'ตรวจว่ารายการเดิมไม่ได้อ้างถึงคลังที่ถูก Deactivate'};
  if(/ไม่พบรถ|INVALID_VEHICLE/i.test(m))return{cause:'รถไม่มีใน Vehicle Master หรือไม่ได้ Active',action:'ตรวจรหัส/ทะเบียนรถ และให้ Admin เปิด Active หรือเพิ่ม Master ถ้าจำเป็น',check:'อย่าสร้างรถซ้ำด้วยทะเบียนเดียวกัน'};
  if(/ไม่พบคนขับ|INVALID_DRIVER/i.test(m))return{cause:'คนขับไม่มีใน Driver Master หรือไม่ได้ Active',action:'ตรวจ Driver Master และสถานะ Active',check:'ใช้รหัสคนขับตาม Master เดิม'};
  if(/เลข Order นี้มีอยู่แล้ว|Order หรือ Invoice ซ้ำ|SALES_IMPORT_DUPLICATE/i.test(m))return{cause:'เลขเอกสารถูกใช้แล้วในระบบ',action:'ค้น Order/Invoice เดิมก่อน; ถ้าเป็นรายการเดิมให้เปิดรายการนั้น ไม่สร้างซ้ำ',check:'ถ้าเป็น Import ให้แก้เลขซ้ำในไฟล์แล้ว Preview ใหม่'};
  if(/จ่ายสินค้าได้|ORDER_NOT_ISSUABLE/i.test(m))return{cause:'Order ยังไม่อยู่ในสถานะที่คลังสามารถ Issue ได้',action:'เปิด Order ตรวจสถานะ; ต้องผ่านขั้นตอนก่อนหน้าตาม Flow แล้วจึงกลับมาจ่ายสินค้า',check:'อย่าสร้าง Order ใหม่แทนรายการเดิม'};
  if(/จ่ายสินค้าไม่ครบ|ORDER_NOT_READY_FOR_DELIVERY/i.test(m))return{cause:'คลังยังจ่ายสินค้าสำหรับ Order ไม่ครบตามเงื่อนไข',action:'กลับไปงานคลัง ตรวจ Remaining Qty และจ่ายให้ครบ/ตาม Flow ก่อนสร้างเที่ยว',check:'ตรวจ Partial Issue ว่ายังค้างสินค้าอะไร'};
  if(/รถคันนี้มีงานซ้อน|VEHICLE_TIME_CONFLICT/i.test(m))return{cause:'รถถูกวางแผนใช้งานในช่วงเวลาเดียวกัน',action:'เปลี่ยนเวลา หรือเลือกรถคันอื่น',check:'ไม่สร้าง Trip ซ้ำเพื่อเลี่ยง Conflict'};
  if(/เหตุผล.*รับไม่ครบ|VARIANCE_REASON_REQUIRED|DELIVERY_VARIANCE_REASON_REQUIRED/i.test(m))return{cause:'ยอดรับจริงต่างจากยอดส่ง แต่ยังไม่ได้ระบุเหตุผล',action:'กรอก Actual Received ตามจริงและเลือก/ระบุเหตุผลส่วนต่าง',check:'เหตุผลควรตรงกับเหตุการณ์จริงเพื่อใช้วิเคราะห์ภายหลัง'};
  if(/POD|INVALID_POD_FILE/i.test(m))return{cause:'ไฟล์ POD ไม่ตรงรูปแบบหรือขนาดที่ระบบรองรับ',action:'ใช้ PDF/JPG/PNG ขนาดไม่เกิน 10 MB แล้วอัปโหลดใหม่',check:'ตรวจว่าไฟล์ตรงกับ Trip ที่กำลังเปิด'};
  if(/Opening|สต็อกตั้งต้น|OPENING_/i.test(m))return{cause:'ข้อมูล Opening Stock ไม่ผ่านเงื่อนไข เช่น Header, รหัส Master, จำนวน, ต้นทุน หรือเลขอ้างอิง',action:'ดาวน์โหลด Template จากระบบ ตรวจ Preview ให้ Error = 0 ก่อนยืนยัน',check:'Opening ที่ Post แล้วไม่ควรลบ/แก้ตรง ให้ใช้ Adjustment ตาม Flow'};
  if(/ไฟล์มีจำนวนรายการเกิน|SALES_IMPORT_LIMIT/i.test(m))return{cause:'จำนวนแถวในไฟล์เกินขีดจำกัดของ Importer ปัจจุบัน',action:'ใช้ไฟล์ตามขนาดที่ระบบรองรับ หรือให้ Admin ใช้ชุด Import ที่เตรียมไว้สำหรับรอบนั้น',check:'อย่าแบ่งไฟล์เองถ้า Flow Import ต้องตรวจ Stock ต่อเนื่อง'};
  if(/จำนวนผู้ใช้ถึงขีดจำกัด|USER_LIMIT_REACHED/i.test(m))return{cause:'จำนวน User ถึง Limit ของแพ็กเกจ',action:'Admin ตรวจ Users ที่ Active; ปิดผู้ใช้ที่ไม่ใช้งาน หรือพิจารณาแพ็กเกจเพิ่มเติม',check:'อย่าแชร์บัญชีผู้ใช้ร่วมกัน'};
  if(/ไม่มีสิทธิ์|ROLE_NOT_ALLOWED/i.test(m))return{cause:'Role ปัจจุบันไม่มีสิทธิ์ทำรายการนี้',action:'ตรวจ Role ที่ Users / Roles และให้ผู้มีสิทธิ์ทำขั้นตอนนั้น',check:'ไม่ควรเปลี่ยน Role ชั่วคราวโดยไม่มีเหตุผล'};
  if(/Backup|สำรอง|VERIFIED_BACKUP_REQUIRED|DATA_CHANGED_SINCE_BACKUP/i.test(m))return{cause:'Backup/สถานะข้อมูลไม่ผ่านเงื่อนไขสำหรับงานเสี่ยงหรือ Year-End',action:'ให้ Admin/ผู้ดูแลฐานข้อมูลทำ Backup และตรวจสอบตาม Runbook ใหม่ก่อนดำเนินการ',check:'ห้ามข้าม Backup Gate'};
  return out;
}

// Job 2: error = cause + next action + check before escalation.
errorGuidance=function(message){
  const d=enhancedErrorDetail(message);
  return `${d.cause} → ${d.action}`;
};
showErrorHelp=function(message){
  const d=enhancedErrorDetail(message);
  modal(`<div class="help-modal">
    <div class="alert danger"><b>${esc(message)}</b></div>
    <h3>สาเหตุที่เป็นไปได้</h3><p>${esc(d.cause)}</p>
    <h3>ทำอย่างไรต่อ</h3><p>${esc(d.action)}</p>
    <div class="alert warn"><b>ตรวจเพิ่ม:</b> ${esc(d.check)}</div>
    <div class="alert info">${esc(selfServiceSupportText())}</div>
    <div class="actions"><button class="btn" id="openHelpFromError" type="button">เปิดวิธีใช้หน้านี้</button><button class="btn primary" id="closeErrorHelp" type="button">รับทราบ</button></div>
  </div>`);
  const h=$('#openHelpFromError');if(h)h.onclick=showPageHelp;
  const c=$('#closeErrorHelp');if(c)c.onclick=closeModal;
};

function selfServiceOnboardingKey(){
  const company=state.company?.id||state.company?.code||'company';
  const user=state.profile?.user_id||state.profile?.employee_code||'user';
  return `flowbiz:first-login:${SELF_SERVICE_HELP_VERSION}:${company}:${user}`;
}

// Job 3: first-login checklist by role. Uses a versioned key so existing users see this improved onboarding once.
showWelcomeGuideIfNeeded=function(){
  const key=selfServiceOnboardingKey();
  try{if(localStorage.getItem(key)==='done')return}catch(e){}
  const role=state.profile?.app_role||'SALES';
  const g=ROLE_FIRST_LOGIN[role]||ROLE_FIRST_LOGIN.SALES;
  modal(`<div class="help-modal welcome-guide">
    <div class="help-modal-head"><div><small>FIRST LOGIN CHECKLIST • ${esc(SELF_SERVICE_HELP_VERSION)}</small><h2>เริ่มงานสำหรับ ${esc(g.title)}</h2><p>ทำ 4 ข้อนี้ให้ครบครั้งแรก แล้วงานประจำจะง่ายขึ้น</p></div></div>
    <div class="help-steps">${g.steps.map((x,i)=>`<div class="help-step"><b>${i+1}</b><span>${esc(x)}</span></div>`).join('')}</div>
    <div class="alert info"><b>กติกาก่อนแจ้ง Support</b><br>${esc(selfServiceSupportText())}</div>
    <div class="actions"><button class="btn" id="welcomePageHelp" type="button">? วิธีใช้หน้าปัจจุบัน</button><button class="btn" id="welcomeDontShow" type="button">ไม่แสดงอีก</button><button class="btn primary" id="welcomeStart" type="button">ไปหน้าทำงานหลัก</button></div>
  </div>`);
  const done=()=>{try{localStorage.setItem(key,'done')}catch(e){}};
  const no=$('#welcomeDontShow');if(no)no.onclick=()=>{done();closeModal()};
  const help=$('#welcomePageHelp');if(help)help.onclick=showPageHelp;
  const start=$('#welcomeStart');if(start)start.onclick=()=>{done();closeModal();if(g.startPage)go(g.startPage)};
};
