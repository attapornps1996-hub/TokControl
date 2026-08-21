@echo off
setlocal EnableExtensions
title TokControl Battle Golf Installer
set ROOT=%~dp0
set PACK=%ROOT%runtime\TokControl_BattleGolf_InteractiveModData
set DESTNAME=TokControl_BattleGolf_InteractiveModData

echo =======================================================
echo   TokControl Super Battle Golf — Install Mod Pack
echo =======================================================
echo.

if not exist "%PACK%\ModLoader.dll" (
    echo [ERROR] Missing pack: %PACK%
    pause
    exit /b 1
)

set "GAME="
if exist "D:\SteamLibrary\steamapps\common\Super Battle Golf\Super Battle Golf.exe" (
    set "GAME=D:\SteamLibrary\steamapps\common\Super Battle Golf"
)
if "%GAME%"=="" if exist "C:\Program Files (x86)\Steam\steamapps\common\Super Battle Golf\Super Battle Golf.exe" (
    set "GAME=C:\Program Files (x86)\Steam\steamapps\common\Super Battle Golf"
)

if "%GAME%"=="" (
    echo Drag-drop the Super Battle Golf folder here, or paste its path:
    set /p GAME=Game folder: 
)

if not exist "%GAME%\Super Battle Golf.exe" (
    echo [ERROR] Super Battle Golf.exe not found in: %GAME%
    pause
    exit /b 1
)

echo Installing into:
echo   %GAME%
echo.

set DEST=%GAME%\%DESTNAME%

if exist "%DEST%" (
    echo Backing up existing %DESTNAME% → %DESTNAME%.bak
    if exist "%GAME%\%DESTNAME%.bak" rmdir /s /q "%GAME%\%DESTNAME%.bak"
    move /Y "%DEST%" "%GAME%\%DESTNAME%.bak" >nul
)

REM Remove old non-TokControl InteractiveMod folder from earlier installs
if exist "%GAME%\ChaosTricks_InteractiveModData" (
    echo Moving old InteractiveMod folder aside...
    if exist "%GAME%\ChaosTricks_InteractiveModData.bak" rmdir /s /q "%GAME%\ChaosTricks_InteractiveModData.bak"
    move /Y "%GAME%\ChaosTricks_InteractiveModData" "%GAME%\ChaosTricks_InteractiveModData.bak" >nul
)

xcopy /E /I /Y "%PACK%" "%DEST%\" >nul
if exist "%DEST%\ModHelper.dll.bak" del /Q "%DEST%\ModHelper.dll.bak"

REM Ensure Unity Doorstop proxy exists (required to load the mod)
set DOORSTOP=%ROOT%doorstop
if exist "%DOORSTOP%\winhttp.dll" (
    if not exist "%GAME%\winhttp.dll" (
        echo Restoring Doorstop winhttp.dll...
        copy /Y "%DOORSTOP%\winhttp.dll" "%GAME%\winhttp.dll" >nul
    )
    if exist "%DOORSTOP%\.doorstop_version" if not exist "%GAME%\.doorstop_version" copy /Y "%DOORSTOP%\.doorstop_version" "%GAME%\.doorstop_version" >nul
    if exist "%DOORSTOP%\doorstop_LICENSE.txt" if not exist "%GAME%\doorstop_LICENSE.txt" copy /Y "%DOORSTOP%\doorstop_LICENSE.txt" "%GAME%\doorstop_LICENSE.txt" >nul
)

set DOOR=%GAME%\doorstop_config.ini
if not exist "%DOOR%" (
    echo Creating doorstop_config.ini...
    if exist "%DOORSTOP%\doorstop_config.ini" (
        copy /Y "%DOORSTOP%\doorstop_config.ini" "%DOOR%" >nul
    ) else (
        (
            echo [General]
            echo enabled=true
            echo target_assembly=%DESTNAME%\\ModLoader.dll
            echo redirect_output_log=false
            echo boot_config_override=
            echo ignore_disable_switch=false
            echo.
            echo [UnityMono]
            echo dll_search_path_override=
            echo debug_enabled=false
            echo debug_address=127.0.0.1:10000
            echo debug_suspend=false
            echo.
            echo [Il2Cpp]
            echo coreclr_path=
            echo corlib_dir=
        ) > "%DOOR%"
    )
)
powershell -NoProfile -Command "(Get-Content -LiteralPath '%DOOR%') -replace 'target_assembly=.*','target_assembly=%DESTNAME%\\ModLoader.dll' | Set-Content -LiteralPath '%DOOR%' -Encoding UTF8"

echo.
echo Done.
echo   Pack folder: %DESTNAME%
echo   Doorstop target: %DESTNAME%\\ModLoader.dll
echo.
echo Next:
echo   1. Close any other app using port 13715
echo   2. Open TokControl → Game Center → Super Battle Golf → Start bridge
echo   3. Launch Super Battle Golf
echo   4. Status should change from "waiting for game" to connected
echo.
pause
