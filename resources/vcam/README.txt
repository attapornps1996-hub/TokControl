TokControl Virtual Camera Driver
================================

ชื่ออุปกรณ์ใน OBS / TikTok Live Studio / PRISM:
  TokControl Virtual Camera

ไฟล์ไดรเวอร์ที่ระบบตรวจหา:
  TokControlCamera.dll

ตำแหน่งที่รองรับ
----------------
- resources/vcam/TokControlCamera.dll  (แนะนำ)
- resources/vcam/bin/64bit/TokControlCamera.dll
- %ProgramFiles%\TokControl\TokControlCamera.dll
- %LOCALAPPDATA%\TokControl\vcam\TokControlCamera.dll

ติดตั้ง
-------
1. วาง TokControlCamera.dll ในโฟลเดอร์นี้
2. ใน Camera Studio กด "ติดตั้งไดรเวอร์กล้อง (Install Driver)"
   หรือรัน install-vcam.bat แบบ Run as Administrator
3. เปิด Virtual Camera ใน TokControl
4. ในโปรแกรมสตรีม เลือก Video Capture Device = TokControl Virtual Camera

ซ่อมแซม (OBS หาอุปกรณ์ไม่เจอ)
-----------------------------
กด "ซ่อมแซม / ลงทะเบียนไดรเวอร์ TokControl" ในแอป
หรือรัน fix-vcam.bat แบบ Administrator แล้วรีสตาร์ท OBS / TikTok Studio

โหมด Mirror (ไม่มี DLL)
-----------------------
Camera Studio ยังส่งภาพผ่านหน้าต่าง "TokControl Virtual Camera"
หรือ Browser Source: http://127.0.0.1:3000/camera-mirror.html

Antivirus / Windows Defender
----------------------------
การลงทะเบียน DirectShow (regsvr32) อาจทำให้ Antivirus แจ้งเตือน
เพราะมีการขอสิทธิ์ Admin และลงทะเบียน DLL ระดับระบบ —
อนุญาตรายการยกเว้นให้ TokControl / TokControlCamera.dll แล้วลองใหม่
