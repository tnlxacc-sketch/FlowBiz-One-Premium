import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\ninit\(\)\.catch[\s\S]*$/,'');
const premium=fs.readFileSync(new URL('../premium.js',import.meta.url),'utf8');
const context={console,Intl,URL,crypto,Blob,setTimeout,MutationObserver:class{observe(){}},document:{body:{},querySelector(){return null},querySelectorAll(){return[]}},window:{},supabase:{createClient(){return{}}}};
vm.createContext(context);
vm.runInContext(app+'\n'+premium+'\nglobalThis.ui={state,roleMenus,premiumBookingPage,premiumCompleteModal,bookingStatus,bangkokTime,pbFree,pbAdd,pbOccupancy};',context);
const {ui}=context;
ui.state.company={id:'c',name:'Premium'};
ui.state.bookingDate='2026-10-17';
ui.state.data={bookings:[{id:'b1',booking_no:'BK-1',vehicle_id:'v',status:'PENDING',requested_start:'2026-10-17T01:00:00Z',requested_end:'2026-10-17T03:00:00Z'}],bookingOrders:[{booking_id:'b1',order_id:'o1'},{booking_id:'b1',order_id:'o2'}],orders:[{id:'o1',order_no:'SO-1',customer_id:'c1'},{id:'o2',order_no:'SO-2',customer_id:'c2'}],customers:[{id:'c1',name:'ลูกค้า 1'},{id:'c2',name:'ลูกค้า 2'}],vehicles:[{id:'v',code:'V1',plate_no:'ทดสอบ'}]};
for(const role of ['SALES','WAREHOUSE','LOGISTICS','WAREHOUSE_LOGISTICS','OWNER','ADMIN']){
 ui.state.profile={app_role:role};
 assert.equal(ui.roleMenus[role].some(x=>x[0]==='bookings'),['SALES','LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN'].includes(role));
 const html=ui.premiumBookingPage();
 if(['SALES','LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN'].includes(role))assert(html.includes('ลูกค้า 1')&&html.includes('ลูกค้า 2'));
 assert.equal(html.includes('data-pb="CONFIRMED"'),['LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN'].includes(role));
 assert.equal(html.includes('id="pbNew"'),['SALES','LOGISTICS','WAREHOUSE_LOGISTICS','ADMIN'].includes(role));
}
assert(ui.bangkokTime('2026-10-17T01:00:00Z').includes('08:00'));
assert(!app.includes('https://ifanefgaiuzkbjtttiqn.supabase.co'));
assert(app.includes('https://spkoqjfpiurtjbfrtcvh.supabase.co'));
assert(!/sb_secret_|eyJ[^\s']+service_role/.test(app));
console.log('Premium UI: 6 role renders, approval/request visibility, multi-customer labels, Bangkok time, project isolation PASS. This is not browser-click UAT.');

ui.state.profile={app_role:'ADMIN'};
for(const view of ['day','week','month']){ui.state.bookingView=view;const html=ui.premiumBookingPage();assert(html.includes('ปฏิทินรถ / จองรถ'));assert(html.includes('กรองรถ'));assert(html.includes('วันที่ปฏิทิน'));assert(html.includes('ค้นหารถว่าง'));assert(html.includes(view==='month'?'pbCalendar':'pbTimeline'));}
assert.equal(ui.pbAdd('2026-12-31',1),'2027-01-01');
assert.equal(ui.pbFree('v','2026-10-17T02:00:00Z','2026-10-17T04:00:00Z'),false);
assert.equal(ui.pbFree('v','2026-10-17T03:00:00Z','2026-10-17T04:00:00Z'),true);
ui.state.bookingView='day';ui.state.data.bookings[0].status='REVISION_REQUESTED';ui.state.data.bookings[0].requested_by='test-user';ui.state.session={user:{id:'test-user'}};ui.state.profile={app_role:'SALES'};assert(ui.premiumBookingPage().includes('แก้ไขและส่งใหม่'));
console.log('Calendar day/week/month, free-slot overlap/adjacency, year boundary, revision button PASS.');
