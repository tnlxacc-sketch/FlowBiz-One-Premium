# คู่มือทดสอบ Backup/Restore แบบไม่แก้ต้นทาง

รอบทดสอบ FlowStock → FlowBiz-One-Restore-TEST เท่านั้น

## สิ่งที่แก้

- Backup ไม่ INSERT/UPDATE ทะเบียนต้นทาง และบังคับ PostgreSQL ต้นทางเป็น read-only
- Restore ไม่ UPDATE ผลกลับต้นทาง
- ต้องกำหนด EXPECTED_TARGET_PROJECT_REF=avofysgyuthbixthugcp และต้นทางใน manifest ต้องเป็น ifanefgaiuzkbjtttiqn
- ปฏิเสธ URL ที่ใช้ host/hostaddr/service/options/user/dbname/port override และตัวแปร PG ที่สืบทอดมา
- รองรับ direct connection และ session pooler port 5432 โดย username ของ pooler ต้องตรง Project; ไม่รองรับ transaction pooler 6543
- บังคับ TLS และตรวจว่าฐาน TEST ไม่มีตารางแอป ผู้ใช้ Auth และ Storage ก่อนกู้คืน
- คัดลอก archive ไป private temporary directory ตรวจ SHA-256 ซ้ำ และตรวจสมาชิก archive ก่อนแตกไฟล์; ปฏิเสธ path traversal/link/สมาชิกซ้ำ/ไฟล์นอกชุด
- Restore ฐานข้อมูลใช้ single transaction; Storage ที่อัปโหลดภายหลังไม่ได้อยู่ใน transaction เดียวกัน

## เครื่องมือ

Node.js 20+, Python 3, PostgreSQL client รุ่น 17 และ tar

ใช้ secret environment เพื่อระบุ Database URL และ service role key ห้ามส่งรหัสผ่านในแชต ห้ามใส่ใน GitHub source code
คู่มือนี้สำหรับผู้ดำเนินการติดตั้ง ไม่ใช่ให้ผู้ใช้บัญชีพิมพ์คำสั่งเอง

## ทดสอบสคริปต์

```bash
node --test tests/restore-target-guard.test.mjs tests/backup-restore-safety.test.mjs
python3 tests/backup-archive.test.py
```

ผลรอบนี้: Node 28 tests ผ่านทั้งหมด; Python 3 tests ผ่านทั้งหมด (รวมกรณีสมาชิก archive อันตราย 5 แบบ)
backup-restore-safety.test.mjs ใช้ fixture แทน PostgreSQL และ Storage เพื่อทดสอบการเดินสคริปต์ ความเป็น read-only การปฏิเสธ TEST ที่มีข้อมูล และ hash ผิด ไม่ใช่การกู้ Supabase จริง

## การใช้งาน

ตัวแปร Backup ใช้เหมือนเดิม: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID, BACKUP_DIRECTORY, BACKUP_KIND และ PERIOD_LABEL

ตัวแปร Restore: ARCHIVE_FILE, ARCHIVE_SHA256, TARGET_DATABASE_URL, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY, SOURCE_DATABASE_URL, RESTORE_CONFIRM=RESTORE_TO_TEST_ENVIRONMENT และ EXPECTED_TARGET_PROJECT_REF=avofysgyuthbixthugcp

SOURCE_DATABASE_URL ใช้ตรวจตัวตน connection เท่านั้น ไม่ได้ใช้เขียนข้อมูล
การรัน backup-project.mjs และ restore-rehearsal.mjs ยังต้องเตรียมเครือข่ายและ credential จริง

## ขอบเขตที่ยังต้องตรวจจริง

สคริปต์ยังใช้ manifest เดิมซึ่งตรวจ critical tables 11 ตารางต่อ COMPANY_ID, ยอดการเงิน และ POD metadata; ไม่ครอบคลุมการรับรอง UAT ทุกตาราง ทุกบริษัท Auth Login สิทธิ์ Edge Function และไฟล์ Storage ทุก bucket
ผล Restore ระบุ full_system_uat_passed=false อย่างชัดเจน แม้ผลตรวจ subset ผ่าน
ต้องออกแบบและทดสอบวิธีกู้ managed schemas/roles/grants ให้เข้ากับ Supabase ก่อนรันจริง ไม่รับรองว่า pg_restore ทั้งฐานด้วย --clean ใช้ได้กับ Supabase ทุก Project

การไม่ลงทะเบียนกลับต้นทางทำให้หน้า Admin เดิมยังไม่เปลี่ยนเป็น DR READY หรืออนุญาต Year-end จากการรันทดสอบนี้ ซึ่งเป็นผลที่ตั้งใจเพื่อรักษาเงื่อนไขห้ามแก้ต้นทาง
อย่าใช้โหมดนี้เป็นการอนุมัติ Year-end rollover หรือประกาศพร้อมขาย

## สถานะปัจจุบัน

เตรียม PostgreSQL 17.4 ได้แล้ว แต่เครื่องรันงานหาโฮสต์ PostgreSQL ของทั้งสอง Project ไม่ได้ และยังไม่ได้รับข้อมูลเชื่อมต่อแบบลับ
จึงยังไม่มี Backup Archive ของฐานจริง ไม่มี Restore จริง และไม่มี UAT ผ่านทั้งระบบ
