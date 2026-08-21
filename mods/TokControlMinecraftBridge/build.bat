@echo off
cd /d "%~dp0"
echo Building TokControl Minecraft Bridge plugin...
where java >nul 2>&1
if errorlevel 1 (
    echo [ERROR] ต้องติดตั้ง Java JDK 17+ ก่อน
    echo ดาวน์โหลด: https://adoptium.net/
    pause
    exit /b 1
)
if exist gradlew.bat (
    call gradlew.bat build --no-daemon
) else (
    where gradle >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] ต้องมี Gradle หรือ gradlew — รัน: gradle wrapper
        pause
        exit /b 1
    )
    gradle build --no-daemon
)
if exist build\libs\TokControlMinecraftBridge.jar (
    mkdir dist 2>nul
    copy /Y build\libs\TokControlMinecraftBridge.jar dist\
    echo.
    echo [OK] Plugin: build\libs\TokControlMinecraftBridge.jar
) else (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
pause
