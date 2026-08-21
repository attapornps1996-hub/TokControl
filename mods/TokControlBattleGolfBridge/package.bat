@echo off
setlocal
set ROOT=%~dp0
set VER=1.0.0
set OUT=%ROOT%dist
set ZIP=%ROOT%TokControl_BattleGolf_Tiktoklive-%VER%.zip
set STAGE=%OUT%\TokControl_BattleGolf_Tiktoklive-%VER%

if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%STAGE%"
xcopy /E /I /Y "%ROOT%runtime\TokControl_BattleGolf_InteractiveModData" "%STAGE%\TokControl_BattleGolf_InteractiveModData\" >nul
del /Q "%STAGE%\TokControl_BattleGolf_InteractiveModData\*.bak" 2>nul
xcopy /E /I /Y /H "%ROOT%doorstop" "%STAGE%\doorstop\" >nul
copy /Y "%ROOT%README.md" "%STAGE%\README.md" >nul
copy /Y "%ROOT%install.bat" "%STAGE%\install.bat" >nul

if exist "%ZIP%" del /Q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%ZIP%' -Force"
copy /Y "%ZIP%" "%ROOT%..\..\TokControl_BattleGolf_Tiktoklive-%VER%.zip" >nul 2>nul

echo.
echo Package ready:
echo   %ZIP%
echo.
dir "%ZIP%"
