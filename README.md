# FlowBiz One Premium

ระบบ Premium แยกจาก FlowStock Standard สำเนาฐานโค้ด FlowStock และคงงาน Premium เดิม

- เว็บไซต์: https://flowbiz-one-premium.tnlx-acc.chatgpt.site/
- Supabase Premium: spkoqjfpiurtjbfrtcvh
- Admin: tnlx.acc@gmail.com — ใช้บัญชี Premium ที่มีอยู่ ไม่คัดลอกรหัสผ่าน Standard
- ต้นฉบับ Standard ที่ตรวจอ้างอิง: commit 38ffa76665cdbefedfec75ddb26432d886673a55
- งาน Premium เดิม: Site source commit b181ad3338c885dd9dd260429a11c1df4b79adee

## การตรวจและสร้างเว็บ

ใช้ Node.js 22 และรัน:

```sh
node tests/premium-ui.test.mjs
node tests/v117-regression.mjs
node tests/full-system-uat-v1177.mjs
node scripts/build-premium.mjs
node --check dist/flowbiz-premium.js
```

ไฟล์เว็บที่นำขึ้นโฮสต์อยู่ใน dist/ ไม่ต้องใช้บริการ build ที่มีค่าใช้จ่าย
ห้ามใช้ Service Role Key ในหน้าเว็บ และห้ามนำฐานข้อมูล/รหัสผ่าน/ไฟล์ .env ขึ้น GitHub
สคริปต์ Restore เฉพาะ Standard/TEST และ workflow เดิมไม่รวมใน Premium เพื่อไม่ให้เรียกผิดโครงการ

## การทดสอบ

อ่าน docs/PREMIUM_UAT_TH_2026-10-16.md ก่อนใช้งาน
ผลตรวจโค้ดและ SQL ไม่เท่ากับการ Login แล้วกดทุกปุ่มในเบราว์เซอร์
ยังไม่รับรอง UAT 100% หรือพร้อมขายจนกว่าจะปิดรายการค้างครบ
