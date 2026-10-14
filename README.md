# UP Minimart POS

ต้นแบบ Web App ระบบบริหารร้านค้า ซึ่งถอด flow หลักจาก iSoft SaleStore และออกแบบ UI ใหม่สำหรับเว็บ

## ฟีเจอร์ใน MVP

- Dashboard ยอดขาย จำนวนบิล กำไร สินค้าใกล้หมด และรายการขายล่าสุด
- POS เลือก/ค้นหา/กรองสินค้า เพิ่มลงตะกร้า ปรับจำนวน และคำนวณ VAT
- รับชำระด้วยเงินสด, QR/โอน หรือบัตร พร้อมคำนวณเงินทอน
- ตารางสินค้าและสถานะสต็อก
- ใบสั่งซื้อและสถานะรับสินค้า
- ลูกหนี้และสถานะครบกำหนด
- ศูนย์รวมรายงาน
- Layout รองรับ Desktop, Tablet และ Mobile

ระบบรองรับข้อมูล PostgreSQL ผ่าน `/api/products`, `/api/dashboard` และ `/api/health` ถ้าฐานข้อมูลยังไม่พร้อม หน้าขายจะกลับไปใช้ข้อมูลตัวอย่างอัตโนมัติ

## ฐานข้อมูลเดิม

ข้อมูลจาก `C:\Users\pos\Documents\database.mdb` ถูกส่งออกแบบ read-only ไว้ใน `legacy-export/` พร้อม manifest และ SHA-256 ของทุกตาราง โดยไม่ส่งออกรหัสผ่านเดิม

- 39 ตาราง
- 395,019 แถว
- สินค้า 8,669 รายการ
- รายการขาย 162,286 บรรทัด
- Stock movement 89,211 รายการ

โฟลเดอร์ `legacy-export/` มีข้อมูลจริงและถูกใส่ใน `.gitignore` ห้าม commit หรือส่งขึ้นระบบภายนอก

## เริ่มใช้งาน

ต้องใช้ Node.js 20.9 ขึ้นไป

```bash
pnpm install
pnpm dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### เครื่องพิมพ์ใบเสร็จ BIXOLON

หน้า “ประวัติการขาย” ส่งใบเสร็จขนาด 80 มม. ผ่าน API ของโปรแกรมไปยัง Windows printer queue กลาง `BIXOLON SRP-E302` ดังนั้นคอมพิวเตอร์เครื่องอื่นที่เข้าเว็บเดียวกันสามารถสั่งพิมพ์ได้ ก่อนเปิดโปรแกรมให้เริ่มตัวเชื่อมบนเครื่องเซิร์ฟเวอร์ด้วย:

```powershell
pwsh -NoProfile -File scripts/start-receipt-printer-agent.ps1
```

ตัวเชื่อมรับคำสั่งเฉพาะที่ `http://127.0.0.1:18181` และตรวจ `RECEIPT_PRINTER_TOKEN` จากไฟล์ `.env` ส่วน Docker ติดต่อผ่าน `host.docker.internal` ทำให้ไม่ต้องเปิดพอร์ตเครื่องพิมพ์ให้เครื่องอื่นในเครือข่าย หากชื่อเครื่องพิมพ์หรือพอร์ตต่างออกไป ให้ส่ง `-PrinterName` หรือ `-Port` เพิ่มเติม

## ตรวจสอบ Production Build

```bash
pnpm lint
pnpm build
pnpm start
```

## PostgreSQL ด้วย Docker

ติดตั้ง Docker Desktop ก่อน แล้วสร้างไฟล์ `.env` จาก `.env.example` และเปลี่ยนรหัสผ่าน:

```bash
docker compose up -d postgres
pnpm prisma migrate deploy
pnpm db:import
docker compose up -d --build web
```

ตรวจสถานะฐานข้อมูลที่ `http://localhost:3000/api/health`

การ import เป็นแบบ clean import: ตารางธุรกรรมใหม่จะถูกล้างก่อนนำเข้าทุกครั้ง เพื่อให้รันซ้ำได้โดยไม่เกิดข้อมูลซ้ำ ห้ามรันกับฐาน production ที่เริ่มมีรายการขายใหม่แล้ว

คำเตือนด้านบนใช้เฉพาะ `pnpm db:import` สำหรับการตั้งฐานข้อมูลครั้งแรกเท่านั้น หลังเปิดใช้งานเว็บแล้วให้ใช้ตัวซิงก์ incremental ด้านล่าง ห้ามรัน clean import ซ้ำ

### ส่งออกฐาน Access ใหม่

ใช้ Windows PowerShell แบบ 32-bit เพื่อรองรับ Microsoft Jet OLEDB:

```powershell
C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -File scripts\export-legacy-data.ps1
powershell -ExecutionPolicy Bypass -File scripts\finalize-export-manifest.ps1
```

### ซิงก์ข้อมูล iSoft ต่อเนื่อง

ตัวซิงก์อ่านตำแหน่งฐานข้อมูลจริงจาก `C:\iSoft SaleStore\Setting.txt` แบบ read-only ทุก 5 นาที และทำงานเฉพาะเมื่อขนาดหรือเวลาแก้ไขไฟล์เปลี่ยน ระบบเก็บ fingerprint ของสินค้า ลูกค้า ผู้จำหน่าย บิลขาย และบิลรับเข้าเพื่อไม่สร้างรายการซ้ำ ส่วนสต็อกใช้เฉพาะผลต่างจากยอดเดิม จึงไม่ทับการขายหรือการปรับสต็อกที่เกิดบนเว็บ หากไม่มีไฟล์ Setting ระบบจึงจะ fallback ไปที่ `C:\Users\pos\Documents\database.mdb`

ทดสอบหนึ่งรอบด้วย:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-legacy-sync-agent.ps1 -Once -Force
```

ติดตั้งให้เริ่มอัตโนมัติเมื่อเข้า Windows และตรวจทุก 5 นาทีด้วย:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-legacy-sync-task.ps1
```

ดูสถานะล่าสุดที่ `legacy-sync\agent-state.json` และ log ที่ `legacy-sync\legacy-sync-agent.log` หากฐานข้อมูลจริงอยู่ที่อื่น ให้ระบุ `-DatabasePath` ทั้งตอนทดสอบและติดตั้ง Scheduled Task

## ขั้นต่อไป

1. ติดตั้ง Docker Desktop และรัน import จริงเข้าสู่ PostgreSQL
2. เพิ่ม Login, RBAC และ Audit Log
3. เชื่อมเครื่องพิมพ์ ESC/POS และลิ้นชักเก็บเงินผ่าน local agent
4. ทำ reconciliation ยอดสินค้า ยอดขาย และลูกหนี้กับระบบเดิม
