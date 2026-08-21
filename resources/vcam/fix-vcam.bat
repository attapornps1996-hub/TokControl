@echo off
REM TokControl Virtual Cam — Fix / Re-register DirectShow Filter
REM Unregister then register TokControlCamera.dll (Run as Administrator)

setlocal EnableExtensions
title TokControl Virtual Cam — Fix / Re-register
echo.
echo ============================================
echo   TokControl — ซ่อมแซม / ลงทะเบียนไดรเวอร์
echo ============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [!] ต้องรันด้วยสิทธิ์ Administrator
  pause
  exit /b 1
)

set "DLL=%~dp0TokControlCamera.dll"
if not exist "%DLL%" set "DLL=%~dp0bin\64bit\TokControlCamera.dll"
if not exist "%DLL%" set "DLL=%~dp0bin\TokControlCamera.dll"

if not exist "%DLL%" (
  echo [X] ไม่พบ TokControlCamera.dll ที่ %~dp0
  echo     ติดตั้งไดรเวอร์ก่อน แล้วค่อยซ่อมแซม
  pause
  exit /b 2
)

echo ยกเลิกการลงทะเบียนเดิม...
regsvr32 /u /s "%DLL%" >nul 2>&1

echo ลงทะเบียนใหม่...
regsvr32 /s "%DLL%"
if errorlevel 1 (
  echo [X] ลงทะเบียนใหม่ไม่สำเร็จ
  pause
  exit /b 3
)

echo.
echo [OK] ซ่อมแซม DirectShow Filter ของ TokControl เรียบร้อย
echo     ปิดแล้วเปิด OBS / TikTok Live Studio / PRISM ใหม่
echo     แล้วเลือกกล้อง: TokControl Virtual Camera
echo.
pause
endlocal
exit /b 0
