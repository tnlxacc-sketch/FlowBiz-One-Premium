# รายงานตรวจสอบ Backup / Restore — 13 ตุลาคม 2569

## สรุปผล
**PRE-FLIGHT ตรวจแล้ว แต่ยังไม่ผ่าน Disaster Recovery Test จริง (BLOCKED)**

### ข้อเท็จจริงจากฐาน Supabase ต้นทาง (Read-only)
- Project: FlowStock (`ifanefgaiuzkbjtttiqn`), สถานะ `ACTIVE_HEALTHY`
- มี `private.backup_registry` แต่มีรายการ 0
- Restore ที่บันทึกว่า `passed=true` จำนวน 0
- Storage bucket `pod-documents` แบบ Private จำนวน 1
- จำนวน Metadata เอกสาร POD = 1
- บริษัทในฐานข้อมูล = 2
- ยังไม่แก้หรือลบข้อมูลบริษัท บัญชีผู้ใช้ หรือเอกสาร

### ตรวจสคริปต์จาก Source
- `scripts/backup-project.mjs` ออกแบบให้ใช้ `pg_dump` แบบ custom-format, ตรวจ `pg_restore --list`, คัดลอกไฟล์ POD, สร้าง Manifest/Checksum และบันทึก Backup Registry
- `scripts/restore-rehearsal.mjs` ตรวจ Hash ของ Archive/Database, ปฏิเสธ Supabase URL ปลายทางที่ตรงกับต้นทาง, Restore ฐานผ่าน `pg_restore`, คืน POD และเทียบจำนวนรายการกับยอดการเงิน
- **ข้อควรระวังเพิ่มเติม:** Restore script ใช้ `pg_restore --clean` ซึ่งลบและสร้างวัตถุใหม่ในฐานปลายทางได้ จึงต้องใช้กับฐาน TEST ที่อนุญาตให้ล้างได้เท่านั้น
- **การยืนยันแหล่งปลายทาง:** สคริปต์เทียบ Supabase URL ใน Manifest แต่ยังไม่ยืนยันว่าปลายทาง `TARGET_DATABASE_URL` อ้างถึง Project เดียวกับ `TARGET_SUPABASE_URL`; ต้องเสริมการยืนยัน Project Identity ก่อนใช้จริง
- **ความครบถ้วน:** ต้องทดสอบข้อมูล Auth Users, Storage, extensions, migration/RLS, การ Login หลังคืนค่า และสมดุลธุรกรรม ไม่ควรยืนยันด้วย Table Counts อย่างเดียว

### สาเหตุที่ยังทำ Restore แบบจริงไม่ได้ในรอบนี้
- ไม่มีไฟล์ Backup Archive ที่สร้างสำเร็จและลงทะเบียนไว้
- ยังไม่มี Supabase TEST Project สำหรับกู้คืนที่ได้รับอนุญาต
- สภาพแวดล้อมตรวจสอบไม่มี `pg_dump`, `pg_restore`, `psql` และข้อมูลเชื่อมฐาน PostgreSQL ด้วยสิทธิ์สำหรับสำรอง/กู้คืน
- **ห้ามใช้ฐาน FlowStock ต้นทางเป็นเป้าหมาย Restore**

### เกณฑ์ปลด Block
1. เตรียม TEST Project ใหม่ที่เป็นฐานทดสอบว่าง พร้อมอนุญาตให้ล้าง
2. ติดตั้ง PostgreSQL Client Tools พร้อมกำหนดสิทธิ์/Secrets อย่างปลอดภัย
3. ตรวจและแก้การยืนยัน Target Database Project Identity
4. สร้าง Backup `PRE_GO_LIVE` ของต้นทางและตรวจสอบไฟล์ SHA-256
5. กู้คืนเข้า TEST แยกจริง พร้อมตรวจยอดธุรกรรม/เอกสาร/ผู้ใช้งาน และ Login
6. จัดเก็บหลักฐานผลทดสอบทุกขั้นตอน ก่อนอนุมัติ Go-live

**ยังไม่ใช่ UAT PASS 100% และไม่มีการกล่าวอ้างว่ากู้คืนสำเร็จ**
