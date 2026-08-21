/**
 * TokControl Virtual Camera Driver — main-process helpers
 * Brands status, install, and DirectShow re-registration around TokControlCamera.dll
 */
const { BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mirrorWindow = null;
let vcamActive = false;
let lastFramePayload = null;

function getVcamDir() {
    if (process.resourcesPath) {
        const packaged = path.join(process.resourcesPath, 'vcam');
        if (fs.existsSync(packaged)) return packaged;
    }
    return path.join(__dirname, '..', '..', 'resources', 'vcam');
}

function getInstallScriptPath() {
    return path.join(getVcamDir(), 'install-vcam.bat');
}

function getFixScriptPath() {
    const fix = path.join(getVcamDir(), 'fix-vcam.bat');
    if (fs.existsSync(fix)) return fix;
    return getInstallScriptPath();
}

function getReadmePath() {
    return path.join(getVcamDir(), 'README.txt');
}

function dllCandidates() {
    const local = getVcamDir();
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localApp = process.env['LOCALAPPDATA'] || '';
    const list = [
        path.join(local, 'TokControlCamera.dll'),
        path.join(local, 'bin', '64bit', 'TokControlCamera.dll'),
        path.join(pf, 'TokControl', 'TokControlCamera.dll'),
        path.join(pf, 'TokControl', 'vcam', 'TokControlCamera.dll'),
        path.join(pf86, 'TokControl', 'TokControlCamera.dll'),
        path.join(localApp, 'TokControl', 'TokControlCamera.dll'),
        path.join(localApp, 'TokControl', 'vcam', 'TokControlCamera.dll')
    ];
    if (process.resourcesPath) {
        list.unshift(path.join(process.resourcesPath, 'TokControlCamera.dll'));
    }
    try {
        if (process.execPath) {
            list.push(path.join(path.dirname(process.execPath), 'TokControlCamera.dll'));
            list.push(path.join(path.dirname(process.execPath), 'vcam', 'TokControlCamera.dll'));
        }
    } catch { /* ignore */ }
    return list;
}

function findTokControlCameraDll() {
    for (const p of dllCandidates()) {
        try {
            if (p && fs.existsSync(p)) return p;
        } catch { /* ignore */ }
    }
    return null;
}

function detectTokControlDriverInstalled() {
    return !!findTokControlCameraDll();
}

function buildStatus() {
    const dllPath = findTokControlCameraDll();
    const installed = !!dllPath;
    return {
        ok: true,
        installed,
        driverName: 'TokControl Virtual Camera',
        dllName: 'TokControlCamera.dll',
        dllPath: dllPath || null,
        mirrorOpen: !!(mirrorWindow && !mirrorWindow.isDestroyed()),
        vcamActive,
        message: installed
            ? `สถานะไดรเวอร์: พบ TokControlCamera.dll — พร้อมใช้งานเป็น “TokControl Virtual Camera”`
            : 'ยังไม่ได้ติดตั้งระบบกล้องเสมือน TokControl Virtual Cam (ไม่พบไฟล์ TokControlCamera.dll)'
    };
}

function runElevatedBat(batPath) {
    if (!batPath || !fs.existsSync(batPath)) {
        return { ok: false, message: 'ไม่พบสคริปต์ติดตั้งไดรเวอร์ใน resources/vcam' };
    }
    const safe = batPath.replace(/'/g, "''");
    spawn('cmd.exe', ['/c', 'start', '', 'powershell', '-Command',
        `Start-Process -FilePath '${safe}' -Verb RunAs`
    ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    }).unref();
    return { ok: true };
}

function ensureMirrorWindow() {
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
        mirrorWindow.show();
        mirrorWindow.focus();
        return mirrorWindow;
    }

    mirrorWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 640,
        minHeight: 360,
        title: 'TokControl Virtual Camera',
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        frame: true,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', '..', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });

    mirrorWindow.setMenuBarVisibility(false);
    mirrorWindow.loadURL('http://127.0.0.1:3000/camera-mirror.html');

    mirrorWindow.on('closed', () => {
        mirrorWindow = null;
    });

    return mirrorWindow;
}

function sendFrameToMirror(payload) {
    lastFramePayload = payload;
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
        mirrorWindow.webContents.send('camera:mirror-frame', payload);
    }
}

function antivirusDetail() {
    return [
        'TokControl Virtual Cam ใช้การลงทะเบียน DirectShow Filter (regsvr32) เพื่อให้ OBS / TikTok Live Studio / PRISM มองเห็นอุปกรณ์กล้องชื่อ “TokControl Virtual Camera”',
        '',
        'Windows Defender หรือ Antivirus บางตัวอาจแจ้งเตือนเมื่อ:',
        '• มีการขอสิทธิ์ Administrator (UAC)',
        '• มีการเขียน/ลงทะเบียน DLL ระดับระบบ',
        '• ยังไม่มี Digital Signature Certificate ของไดรเวอร์ในเครื่องนั้น',
        '',
        'นี่เป็นพฤติกรรมปกติของการติดตั้งกล้องเสมือน — ไม่ใช่มัลแวร์',
        'แนะนำ: อนุญาต TokControl / TokControlCamera.dll ในรายการยกเว้นของ Antivirus แล้วกด “ซ่อมแซม / ลงทะเบียนไดรเวอร์” อีกครั้ง'
    ].join('\n');
}

function registerCameraIpc() {
    ipcMain.handle('camera:vcam-status', async () => buildStatus());

    ipcMain.handle('camera:vcam-start', async (_event, opts) => {
        vcamActive = true;
        ensureMirrorWindow();
        const status = buildStatus();
        status.started = true;
        status.mode = status.installed ? 'tokcontrol-vcam' : 'mirror-fallback';
        status.message = status.installed
            ? 'เปิดระบบกล้องเสมือนแล้ว — ใน OBS / TikTok Live Studio เลือก “TokControl Virtual Camera”'
            : 'เปิดหน้าต่างส่งภาพ TokControl Virtual Camera แล้ว (โหมด Mirror) — ติดตั้งไดรเวอร์เพื่อให้โปรแกรมสตรีมเห็นเป็นอุปกรณ์กล้อง';
        status.width = opts?.width || 1280;
        status.height = opts?.height || 720;
        return status;
    });

    ipcMain.handle('camera:vcam-stop', async () => {
        vcamActive = false;
        if (mirrorWindow && !mirrorWindow.isDestroyed()) {
            try { mirrorWindow.close(); } catch (_) { /* ignore */ }
        }
        mirrorWindow = null;
        lastFramePayload = null;
        return { ok: true, vcamActive: false, message: 'หยุดส่งภาพ Virtual Camera แล้ว' };
    });

    ipcMain.on('camera:vcam-frame', (_event, payload) => {
        if (!vcamActive || !payload) return;
        sendFrameToMirror(payload);
    });

    ipcMain.on('camera:open-mirror', () => {
        ensureMirrorWindow();
    });

    ipcMain.on('camera:mirror-ready', (event) => {
        if (lastFramePayload) {
            try { event.sender.send('camera:mirror-frame', lastFramePayload); } catch (_) { /* ignore */ }
        }
    });

    ipcMain.handle('camera:vcam-install', async () => {
        const bat = getInstallScriptPath();
        const launched = runElevatedBat(bat);
        if (!launched.ok) {
            const readme = getReadmePath();
            if (fs.existsSync(readme)) {
                try { shell.openPath(readme); } catch (_) { /* ignore */ }
            }
            return {
                ...buildStatus(),
                ok: false,
                message: launched.message
            };
        }
        return {
            ...buildStatus(),
            ok: true,
            message: 'เปิดตัวติดตั้งไดรเวอร์แบบ Administrator แล้ว — วาง TokControlCamera.dll ในโฟลเดอร์ vcam แล้วรันอีกครั้งหากยังไม่พบ'
        };
    });

    ipcMain.handle('camera:vcam-fix', async () => {
        const bat = getFixScriptPath();
        const launched = runElevatedBat(bat);
        if (!launched.ok) {
            return { ...buildStatus(), ok: false, message: launched.message };
        }
        return {
            ...buildStatus(),
            ok: true,
            message: 'กำลังซ่อมแซม / ลงทะเบียน DirectShow Filter ของ TokControl (ขอสิทธิ์ Admin) — เสร็จแล้วรีสตาร์ท OBS / TikTok Studio'
        };
    });

    ipcMain.handle('camera:vcam-antivirus-info', async () => {
        await dialog.showMessageBox({
            type: 'info',
            title: 'TokControl Virtual Cam — Antivirus / Defender',
            message: 'ทำไม Antivirus หรือ Windows Defender ถึงแจ้งเตือน?',
            detail: antivirusDetail(),
            buttons: ['เข้าใจแล้ว'],
            defaultId: 0
        });
        return { ok: true };
    });
}

function shutdownCameraOutputs() {
    vcamActive = false;
    if (mirrorWindow && !mirrorWindow.isDestroyed()) {
        try { mirrorWindow.close(); } catch (_) { /* ignore */ }
    }
    mirrorWindow = null;
}

module.exports = {
    registerCameraIpc,
    shutdownCameraOutputs,
    ensureMirrorWindow,
    buildStatus,
    findTokControlCameraDll
};
