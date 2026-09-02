# จ่ายยัง

เว็บจัดการบิลและสินเชื่อ พร้อม Supabase Auth และฐานข้อมูล PostgreSQL บน Supabase

## รันในเครื่อง

สามารถใช้ static web server ใดก็ได้ เช่น:

```bash
php -S 127.0.0.1:4173 -t public
```

จากนั้นเปิด <http://127.0.0.1:4173>

เมื่อ push ไปยัง branch `main` ระบบ GitHub Actions จะ deploy โฟลเดอร์ `public/` ไปยัง GitHub Pages อัตโนมัติ

ก่อนใช้งานครั้งแรก ให้นำ `database/supabase-schema.sql` ไปรันใน SQL Editor ของ Supabase project แล้วจึงเปิดหน้าเว็บ ข้อมูลของผู้ใช้ถูกป้องกันด้วย Row Level Security

## โครงสร้าง

- `public/index.html` — โครงหน้าเว็บ
- `public/assets/css/styles.css` — สไตล์ทั้งหมด
- `public/assets/js/app.js` — การทำงานของหน้าเว็บและ Supabase client
- `public/supabase-config.js` — URL และ publishable key ของ Supabase
- `database/supabase-schema.sql` — migration สำหรับตารางและ RLS policies

## ตรวจสอบการคำนวณ

```bash
node tests/loan-interest.test.cjs
```

ชุดทดสอบครอบคลุมดอกเบี้ยลดต้นลดดอก ค่างวดขั้นบันได เดือนเริ่มชำระ และเครื่องจำลองเงินโปะ
