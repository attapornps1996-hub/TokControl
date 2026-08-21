@echo off
REM TokControl Virtual Cam — Install / Register DirectShow driver
REM Requires: TokControlCamera.dll next to this script (or bin\64bit\)
REM Run as Administrator (UAC)

setlocal EnableExtensions
title TokControl Virtual Cam — Install Driver
echo.
echo ============================================
echo   TokControl Virtual Camera Driver Installer
echo ============================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [!] ต้องรันด้วยสิทธิ์ Administrator
  echo     คลิกขวาไฟล์นี้ ^> Run as administrator
  echo.
  pause
  exit /b 1
)

set "DLL=%~dp0TokControlCamera.dll"
if not exist "%DLL%" set "DLL=%~dp0bin\64bit\TokControlCamera.dll"
if not exist "%DLL%" set "DLL=%~dp0bin\TokControlCamera.dll"

if not exist "%DLL%" (
  echo [X] ไม่พบไฟล์ TokControlCamera.dll
  echo.
  echo วางไฟล์ไดรเวอร์ TokControlCamera.dll ไว้ในโฟลเดอร์:
  echo   %~dp0
  echo แล้วรันสคริปต์นี้อีกครั้ง
  echo.
  echo ระหว่างรอ สามารถใช้โหมด Mirror Window ใน Camera Studio ได้
  echo.
  pause
  exit /b 2
)

echo พบไดรเวอร์:
echo   %DLL%
echo.
echo กำลังลงทะเบียน DirectShow Filter (regsvr32)...
regsvr32 /s "%DLL%"
if errorlevel 1 (
  echo.
  echo [X] ลงทะเบียนไม่สำเร็จ
  echo     ลองรัน fix-vcam.bat หรือปิด Antivirus ชั่วคราวแล้วลองใหม่
  echo.
  pause
  exit /b 3
)

echo.
echo [OK] ลงทะเบียน TokControl Virtual Camera สำเร็จ
echo.
echo ขั้นตอนถัดไป:
echo  1^) เปิด Camera Studio ใน TokControl แล้วเปิดระบบกล้องเสมือน
echo  2^) เปิด OBS / TikTok Live Studio / PRISM
echo  3^) เลือก Video Capture Device ชื่อ: TokControl Virtual Camera
echo.
pause
endlocal
exit /b 0
