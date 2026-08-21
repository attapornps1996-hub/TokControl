# ติดตั้ง Minecraft Paper Server + TokControl Plugin
# รัน: powershell -ExecutionPolicy Bypass -File tools/setup-minecraft-server.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$serverDir = Join-Path $env:APPDATA "pandy-app\minecraft-server"
if (-not (Test-Path (Join-Path $env:APPDATA "pandy-app"))) {
    $serverDir = Join-Path $root "games\minecraft-server"
}

Write-Host "TokControl Minecraft Server Setup"
Write-Host "Folder: $serverDir"

# Build plugin if possible
$buildBat = Join-Path $root "mods\TokControlMinecraftBridge\build.bat"
if (Test-Path $buildBat) {
    Write-Host "Building plugin..."
    & cmd /c $buildBat
}

node (Join-Path $root "tools\minecraft-server-setup.js")
Write-Host ""
Write-Host "เสร็จแล้ว! เปิดเซิร์ฟเวอร์จาก TokControl Game Center -> Minecraft"
Write-Host "หรือรัน: $serverDir\start-server.bat"
Write-Host "เข้าเกม: Multiplayer -> localhost:25565"
