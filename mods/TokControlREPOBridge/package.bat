@echo off
REM Package TokControl_REPO_Tiktoklive for Thunderstore upload
set ROOT=%~dp0
set OUT=%ROOT%dist
set TS=%ROOT%thunderstore
set DLL=%ROOT%bin\Release\netstandard2.1\TokControl_REPO_Tiktoklive.dll

if not exist "%DLL%" (
    echo Build the project first: dotnet build -c Release
    exit /b 1
)

if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
mkdir "%OUT%\BepInEx\plugins"

copy /Y "%DLL%" "%OUT%\BepInEx\plugins\TokControl_REPO_Tiktoklive.dll"
if exist "%ROOT%Data" (
    mkdir "%OUT%\BepInEx\plugins\Data"
    copy /Y "%ROOT%Data\*.data" "%OUT%\BepInEx\plugins\Data\"
)
copy /Y "%TS%\manifest.json" "%OUT%\manifest.json"
copy /Y "%TS%\README.md" "%OUT%\README.md"
if exist "%TS%\icon.png" copy /Y "%TS%\icon.png" "%OUT%\icon.png"

for /f "tokens=3 delims=<>" %%V in ('findstr /C:"<Version>" "%ROOT%TokControlREPOBridge.csproj"') do set VER=%%V
set ZIP=%ROOT%TokControl_REPO_Tiktoklive-%VER%.zip
if exist "%ZIP%" del /Q "%ZIP%"
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%\*' -DestinationPath '%ZIP%' -Force"

echo.
echo Package ready in: %OUT%
echo Zip: %ZIP%
echo   icon.png, manifest.json, README.md, BepInEx\plugins\TokControl_REPO_Tiktoklive.dll, BepInEx\plugins\Data\*.data
