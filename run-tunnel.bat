@echo off
title Pandy App HTTPS Tunnel (localhost.run)
echo =======================================================
echo     Pandy App Secure HTTPS Tunnel for TikTok Studio
echo =======================================================
echo.
echo Connecting to secure tunnel...
echo Please wait 2-3 seconds...
echo.
echo -------------------------------------------------------
echo Copy the HTTPS address starting with "https://..." below:
echo (Example: https://xxxxxx.lhr.life)
echo -------------------------------------------------------
echo.
ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 nokey@localhost.run
echo.
echo Tunnel connection closed.
pause
