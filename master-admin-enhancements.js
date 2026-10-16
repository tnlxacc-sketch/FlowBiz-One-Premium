(function(){
  'use strict';
  const MASTER_META={
    customers:{title:'Customer',fields:[['code','รหัส','text'],['name','ชื่อ','text'],['region','ภูมิภาค','text']]},
    productGroups:{title:'Product Group',fields:[['code','รหัสกลุ่ม','text'],['name','ชื่อกลุ่ม','text']]},
    products:{title:'Product',fields:[['code','รหัสสินค้า','text'],['name','ชื่อสินค้า','text'],['base_uom','หน่วย','text'],['minimum_stock','Minimum Stock','number']]},
    warehouses:{title:'Warehouse',fields:[['code','รหัส','text'],['name','ชื่อ','text']]},
    suppliers:{title:'Vendor / Supplier',fields:[['code','รหัส','text'],['name','ชื่อ','text'],['supplier_type','ประเภท','text']]},
    vehicleTypes:{title:'Vehicle Type',fields:[['code','รหัสประเภทรถ','text'],['name','ชื่อประเภทรถ','text']]},
    vehicles:{title:'Vehicle',fields:[['code','รหัสรถ','text'],['plate_no','ทะเบียนรถ','text'],['vehicle_type','ประเภทรถ','selectVehicleType']]},
    drivers:{title:'Driver',fields:[['code','รหัสพนักงานขับรถ','text'],['name','ชื่อ','text'],['phone','โทรศัพท์','text']]},
    expenseTypes:{title:'Cost & Expense Type',fields:[['code','รหัส','text'],['name','ชื่อ','text'],['basis','ฐานคำนวณ','selectBasis'],['category','หมวดค่าใช้จ่าย','selectExpenseCategory']]}
  };
  const basisOptions=[['MANUAL','กรอกจริง'],['FIXED_PER_TRIP','คงที่ต่อเที่ยว'],['PER_KG','อัตราต่อ KG'],['PERCENT_REVENUE','% ของยอดขาย']];
  const categoryOptions=[['DIRECT_EXPENSE','ค่าใช้จ่ายตรงของงานส่ง'],['OPERATING_EXPENSE','ค่าใช้จ่ายดำเนินงาน']];
  const by=id=>document.querySelector(id), all=s=>[...document.querySelectorAll(s)];
  function escapeAttr(v){return String(v??'').replace(/"/g,'&quot;')}
  function masterList(kind){return Array.isArray(state.data[kind])?state.data[kind]:[]}
  function normalizeCode(v){return String(v||'').trim().toUpperCase()}
  function dataCount(arr,field,val){return Array.isArray(arr)?arr.filter(x=>String(x?.[field])===String(val)).length:0}
  function masterUsageCount(kind,row){
    const id=row?.id,code=row?.code,d=state.data||{}; if(!id)return 0;
    if(kind==='customers')return dataCount(d.orders,'customer_id',id)+dataCount(d.invoices,'customer_id',id);
    if(kind==='productGroups')return dataCount(d.products,'group_id',id);
    if(kind==='products')return dataCount(d.orderLines,'product_id',id)+dataCount(d.balances,'product_id',id)+dataCount(d.movements,'product_id',id)+dataCount(d.costs,'product_id',id)+dataCount(d.countLines,'product_id',id)+dataCount(d.tripLines,'product_id',id)+dataCount(d.transferLines,'product_id',id);
    if(kind==='warehouses')return dataCount(d.orderLines,'warehouse_id',id)+dataCount(d.balances,'warehouse_id',id)+dataCount(d.movements,'warehouse_id',id)+dataCount(d.receipts,'warehouse_id',id)+dataCount(d.counts,'warehouse_id',id)+dataCount(d.transfers,'from_warehouse_id',id)+dataCount(d.transfers,'to_warehouse_id',id);
    if(kind==='suppliers')return dataCount(d.trips,'transport_supplier_id',id);
    if(kind==='vehicles')return dataCount(d.trips,'vehicle_id',id);
    if(kind==='drivers')return dataCount(d.trips,'driver_id',id);
    if(kind==='vehicleTypes')return Array.isArray(d.vehicles)?d.vehicles.filter(x=>String(x.vehicle_type)===String(code)).length:0;
    if(kind==='expenseTypes')return dataCount(d.expenseRates,'expense_type_id',id)+dataCount(d.tripExpenses,'expense_type_id',id);
    return 0;
  }
  function fieldControl(kind,field,label,type,row={}){
    const value=row[field]??'';
    if(type==='selectVehicleType'){
      const opts=(state.data.vehicleTypes||[]).map(v=>`<option value="${escapeAttr(v.code)}" ${String(value)===String(v.code)?'selected':''}>${esc(v.code)} • ${esc(v.name)}</option>`).join('');
      return `<label>${label}<select data-master-field="${field}" required><option value="">— เลือกประเภทรถ —</option>${opts}</select></label>`;
    }
    if(type==='selectBasis')return `<label>${label}<select data-master-field="${field}" required>${basisOptions.map(([v,t])=>`<option value="${v}" ${String(value||'MANUAL')===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    if(type==='selectExpenseCategory')return `<label>${label}<select data-master-field="${field}" required>${categoryOptions.map(([v,t])=>`<option value="${v}" ${String(value||'DIRECT_EXPENSE')===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
    return `<label>${label}<input data-master-field="${field}" type="${type==='number'?'number':'text'}" ${type==='number'?'min="0" step="any"':''} value="${escapeAttr(value)}" ${field==='code'?'style="text-transform:uppercase"':''} required></label>`;
  }
  function masterFormHtml(kind,row=null){
    const meta=MASTER_META[kind], disabled=kind==='vehicles'&&!(state.data.vehicleTypes||[]).length, title=row?`แก้ไข ${meta.title}`:`เพิ่ม ${meta.title}`;
    return `<div class="master-form-card"><div class="section-title"><div><h3>${title}</h3><span class="muted">เพิ่มหรือแก้ไขข้อมูลกลางจากหน้าจอ โดยไม่ต้อง Upload ทุกครั้ง</span></div>${row?`<button type="button" class="btn small-btn" data-master-action="clearForm" data-kind="${kind}">+ เพิ่มใหม่</button>`:''}</div>${disabled?'<div class="alert danger">กรุณาสร้าง Vehicle Type ก่อนเพิ่มรถ</div>':''}<form id="masterForm" data-kind="${kind}" data-id="${row?.id||''}"><div class="form">${meta.fields.map(([f,l,t])=>fieldControl(kind,f,l,t,row||{})).join('')}<label>สถานะ<select data-master-field="active"><option value="true" ${(row?.active!==false)?'selected':''}>ใช้งาน</option><option value="false" ${row?.active===false?'selected':''}>ปิดใช้งาน</option></select></label></div><button class="btn primary" style="margin-top:16px" ${disabled?'disabled':''}>${row?'บันทึกการแก้ไข':'เพิ่ม '+meta.title}</button></form></div>`;
  }
  function displayFields(kind){return MASTER_META[kind].fields.filter(x=>x[0]!=='code')}
  function masterRows(kind){
    const meta=MASTER_META[kind],fields=displayFields(kind).map(x=>x[0]),searchFields=meta.fields.map(x=>x[0]).concat(['code','name']);
    return masterList(kind).filter(x=>!state.search||searchFields.some(f=>String(x[f]||'').toLowerCase().includes(state.search))).map(x=>{
      const refs=masterUsageCount(kind,x),canDelete=refs===0,cells=fields.map(f=>`<td>${esc(x[f]||'-')}</td>`).join('');
      return `<tr><td><b>${esc(x.code||'-')}</b></td>${cells}<td>${x.active===false?badge('INACTIVE'):badge('ACTIVE')}</td><td class="num">${nf.format(refs)}</td><td class="master-actions"><button class="btn small-btn" data-master-action="edit" data-kind="${kind}" data-id="${x.id}">แก้ไข</button><button class="btn small-btn ${x.active===false?'':'danger'}" data-master-action="toggle" data-kind="${kind}" data-id="${x.id}">${x.active===false?'เปิดใช้งาน':'ปิดใช้งาน'}</button><button class="btn small-btn ${canDelete?'danger':''}" data-master-action="delete" data-kind="${kind}" data-id="${x.id}">${canDelete?'ลบ':'ลบ/ปิดใช้'}</button></td></tr>`;
    });
  }
  function masterModal(kind){
    if(kind==='costs')return costModal();
    if(!MASTER_META[kind])return toast('Master นี้ยังไม่รองรับ',true);
    const meta=MASTER_META[kind],headers=['Code',...displayFields(kind).map(x=>x[1]),'สถานะ','ใช้งานในระบบ','การดำเนินการ'];
    modal(`<div class="master-modal"><div class="section-title"><div><h2>${esc(meta.title)}</h2><p class="muted">Admin เพิ่ม แก้ไข ปิดใช้งาน และลบแบบควบคุมได้ • ถ้าเคยใช้ใน Transaction ระบบจะปิดใช้งานแทนการลบ</p></div><div class="actions"><button class="btn small-btn" data-master-action="template" data-kind="${kind}">Download Template</button><button class="btn small-btn" data-master-action="export" data-kind="${kind}">Export</button><button class="btn small-btn" data-master-action="bulk" data-kind="${kind}">Import</button></div></div><div id="masterFormSlot">${masterFormHtml(kind)}</div><div class="toolbar"><input id="masterSearch" placeholder="ค้นหา ${esc(meta.title)}"></div><div class="master-table-wrap">${table(headers,masterRows(kind),'master-management-table')}</div><div class="alert ok">หลักควบคุม: ลบได้เฉพาะ Master ที่ยังไม่เคยถูกอ้างอิง หากเคยใช้แล้วจะปิดใช้งานเพื่อรักษาประวัติรายงานย้อนหลัง</div></div>`);
    const search=by('#masterSearch');if(search)search.oninput=()=>{state.search=search.value.toLowerCase();masterModal(kind)};
    wireMasterForm();
  }
  function wireMasterForm(){
    const form=by('#masterForm'); if(!form)return;
    form.onsubmit=async e=>{
      e.preventDefault(); const kind=form.dataset.kind,id=form.dataset.id||null,meta=MASTER_META[kind],payload={};
      all('#masterForm [data-master-field]').forEach(x=>payload[x.dataset.masterField]=x.value.trim());
      if(kind==='products'){const min=Number(payload.minimum_stock||0);if(!Number.isFinite(min)||min<0)return toast('Minimum Stock ต้องเป็น 0 หรือมากกว่า',true);payload.minimum_stock=min;}
      payload.active=String(payload.active)!=='false'; payload.code=normalizeCode(payload.code);
      if(!payload.code||(!payload.name&&kind!=='vehicles'))return toast('กรอกข้อมูลให้ครบ',true);
      const dup=masterList(kind).find(x=>String(x.code||'').toUpperCase()===payload.code&&String(x.id)!==String(id||''));
      if(dup)return toast('รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น',true);
      setLoading(true);
      try{const {error}=await db.rpc('admin_upsert_master',{p_kind:kind,p_id:id,p_payload:payload});if(error)throw error;toast(`${id?'แก้ไข':'เพิ่ม'} ${meta.title} แล้ว`);closeModal();await loadData();render();masterModal(kind)}catch(err){fail(err)}finally{setLoading(false)}
    };
  }
  function editMaster(kind,id){const row=masterList(kind).find(x=>String(x.id)===String(id));if(!row)return toast('ไม่พบรายการ',true);const slot=by('#masterFormSlot');if(slot){slot.innerHTML=masterFormHtml(kind,row);wireMasterForm();slot.scrollIntoView({behavior:'smooth',block:'start'});}}
  async function toggleMaster(kind,id){const row=masterList(kind).find(x=>String(x.id)===String(id));if(!row)return toast('ไม่พบรายการ',true);setLoading(true);try{const payload={...row,active:row.active===false};delete payload.id;delete payload.company_id;const {error}=await db.rpc('admin_upsert_master',{p_kind:kind,p_id:id,p_payload:payload});if(error)throw error;toast(row.active===false?'เปิดใช้งานแล้ว':'ปิดใช้งานแล้ว');closeModal();await loadData();render();masterModal(kind)}catch(err){fail(err)}finally{setLoading(false)}}
  function deleteMasterConfirm(kind,id){const row=masterList(kind).find(x=>String(x.id)===String(id));if(!row)return toast('ไม่พบรายการ',true);const refs=masterUsageCount(kind,row);modal(`<h2>${refs?'ปิดใช้งาน Master':'ลบ Master'}</h2><div class="alert ${refs?'warn':'danger'}">${refs?`รายการนี้ถูกอ้างอิงในระบบประมาณ ${nf.format(refs)} รายการ ระบบจะปิดใช้งานแทนการลบถาวร`:'รายการนี้ยังไม่เคยถูกใช้ ระบบจะลบถาวรได้'}</div><form id="deleteMasterForm"><p><b>${esc(row.code||'')}</b> ${esc(row.name||row.plate_no||'')}</p><label>เหตุผล<input id="deleteMasterReason" required minlength="5" placeholder="เช่น ซ้ำ / เลิกใช้ / กรอกผิด"></label><button class="btn danger wide" type="submit">ยืนยัน</button></form>`);by('#deleteMasterForm').onsubmit=async e=>{e.preventDefault();setLoading(true);try{const {data,error}=await db.rpc('admin_delete_master',{p_kind:kind,p_id:id,p_reason:by('#deleteMasterReason').value.trim()});if(error)throw error;toast(data?.action==='DELETED'?'ลบ Master แล้ว':'มีการใช้งานใน Transaction จึงปิดใช้งานแทน');closeModal();await loadData();render();masterModal(kind)}catch(err){fail(err)}finally{setLoading(false)}}}
  function csvLine(values){return values.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')}
  function downloadText(name,text){const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
  function exportMaster(kind){const fields=MASTER_META[kind].fields.map(x=>x[0]).concat(['active']);downloadText(`${kind}_export.csv`,[csvLine(fields),...masterList(kind).map(x=>csvLine(fields.map(f=>x[f])))].join('\n'))}
  function templateMaster(kind){const fields=MASTER_META[kind].fields.map(x=>x[0]).concat(['active']);downloadText(`${kind}_template.csv`,csvLine(fields)+'\n')}
  function costModal(){
    const rows=state.data.costs.map(x=>`<tr><td>${esc(product(x.product_id).code)}</td><td>${dmy(x.cost_month)}</td><td class="num">${money(x.unit_cost)}</td><td>${x.locked?'ล็อก':'เปิด'}</td></tr>`);
    modal(`<h2>Monthly Product Cost</h2><div class="alert ok">Monthly Cost สามารถเพิ่ม/แก้ไขได้จากหน้าจอ และยังคงรองรับ Import สำหรับข้อมูลจำนวนมาก</div><form id="costForm"><div class="form"><label>สินค้า<select id="costProduct">${option('products',x=>`${x.code} • ${x.name}`)}</select></label><label>เดือน<input id="costMonth" type="month" value="${new Date().toISOString().slice(0,7)}" required></label><label>Unit Cost<input id="unitCost" type="number" min="0" step="any" required></label></div><button class="btn primary" style="margin:16px 0">บันทึก Cost</button><button type="button" class="btn" data-master-action="bulk" data-kind="costs">Import / Template</button></form>${table(['สินค้า','เดือน','Unit Cost','สถานะ'],rows)}`);
    by('#costForm').onsubmit=async e=>{e.preventDefault();const data={company_id:state.profile.company_id,product_id:by('#costProduct').value,cost_month:by('#costMonth').value+'-01',unit_cost:Number(by('#unitCost').value)};const {error}=await db.from('monthly_product_costs').upsert(data,{onConflict:'company_id,product_id,cost_month'});if(error)return fail(error);toast('บันทึก Monthly Cost แล้ว');closeModal();await loadData();render()};
  }
  document.addEventListener('click',e=>{
    const manage=e.target.closest('[data-action="manageMaster"]');
    if(manage){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();state.search='';masterModal(manage.dataset.id);return;}
    const b=e.target.closest('[data-master-action]');if(!b)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const kind=b.dataset.kind,id=b.dataset.id,act=b.dataset.masterAction;
    if(act==='edit')return editMaster(kind,id);
    if(act==='toggle')return toggleMaster(kind,id);
    if(act==='delete')return deleteMasterConfirm(kind,id);
    if(act==='clearForm'){const slot=by('#masterFormSlot');if(slot){slot.innerHTML=masterFormHtml(kind);wireMasterForm();}return;}
    if(act==='export')return exportMaster(kind);
    if(act==='template')return templateMaster(kind);
    if(act==='bulk')return masterImportModal();
  },true);
  window.masterModal=masterModal;
  window.costModal=costModal;
})();
