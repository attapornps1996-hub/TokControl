# TokBio (Bio Link) — ฝังใน TokControl

แหล่งเดิม: Super Bio PRO (`bio-link-app`)

## URL ในแอป

| หน้า | Path |
|------|------|
| แดชบอร์ดตั้งค่า / โปรไฟล์ / ตกแต่ง | `/biolink/dashboard` |
| หน้าไบโอสาธารณะ | `/biolink/u/{username}` หรือ `/b/{username}` |
| Health | `/api/biolink/health` |

เปิดจาก TokDonate → **ตกแต่งโปรไฟล์ (Bio)**

## หมายเหตุโดเมน

`www.tokcontrol.com` ตอนนี้เป็น GitHub Pages (static) จึงไม่มี `/donate` หรือ `/biolink`
ลิงก์สาธารณะของระบบจะชี้ Cloud Run จนกว่าจะตั้ง reverse proxy / DNS ไป backend
