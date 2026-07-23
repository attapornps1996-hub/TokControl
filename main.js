const { app, BrowserWindow, ipcMain, Menu, session, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// สตาร์ทเซิร์ฟเวอร์หลังบ้าน Express + SQLite ในตัวทันที
require('./server.js');

autoUpdater.autoDownload = true;

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] กำลังดาวน์โหลดเวอร์ชันใหม่:', info?.version || 'unknown');
});

autoUpdater.on('update-downloaded', async () => {
  try {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['รีสตาร์ทตอนนี้', 'ภายหลัง'],
      defaultId: 0,
      cancelId: 1,
      title: 'อัพเดทพร้อมติดตั้ง',
      message: 'ดาวน์โหลดอัพเดทสำเร็จแล้ว ต้องการรีสตาร์ทโปรแกรมเพื่อติดตั้งทันทีหรือไม่?'
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  } catch (err) {
    console.error('[AutoUpdater] update-downloaded handler error:', err?.message || err);
  }
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err?.message || err);
});

function checkForAppUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[AutoUpdater] checkForUpdates failed:', err?.message || err);
  });
}

app.setName('TokControl');

function createWindow () {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#090614',
      symbolColor: '#ffffff',
      height: 35
    },
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  // โหลดหน้าควบคุมผ่าน Express เพื่อให้ระบบ API และ Socket ทำงานได้ 100%
  win.loadURL('http://127.0.0.1:3000');

  win.on('closed', () => {
    // ปิดหน้าต่างย่อยทั้งหมด (เช่น บราวเซอร์ป๊อปอัพของ TikTok) เมื่อปิดหน้าต่างหลัก
    BrowserWindow.getAllWindows().forEach(w => {
      try { w.close(); } catch(e){}
    });
  });
}

app.whenReady().then(() => {
  // อนุญาตไมโครโฟนและการจับเสียงใน Electron (จำเป็นสำหรับ Web Speech API)
  const allowMedia = (permission) => ['media', 'audioCapture', 'microphone', 'camera', 'display-capture'].includes(permission);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowMedia(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));
  createWindow();
  checkForAppUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('open-tiktok-browser', (event, username) => {
    let url = 'https://www.tiktok.com/';
    if (username) {
        url = `https://www.tiktok.com/@${username}/live`;
    }
    
    const tkWin = new BrowserWindow({
        width: 1100,
        height: 750,
        title: 'TikTok Browser - TokControl',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
            backgroundThrottling: false
        }
    });
    
    const injectScript = () => {
        try {
            const scriptPath = path.join(__dirname, 'bookmarklet.js');
            if (fs.existsSync(scriptPath)) {
                let script = fs.readFileSync(scriptPath, 'utf8');
                script = `const injectedUsername = "${username.toLowerCase()}";\n` + script;
                tkWin.webContents.executeJavaScript(`
                    window.injectedUsername = "${username.toLowerCase()}";
                    ${script}
                `).catch(e => {
                    console.error("executeJavaScript error:", e);
                });
            }
        } catch (e) {
            console.error("Failed to inject TikTok bookmarklet:", e);
        }
    };

    tkWin.webContents.on('dom-ready', injectScript);
    tkWin.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
        if (isMainFrame) {
            injectScript();
        }
    });

    tkWin.webContents.on('console-message', (event, level, message, line, sourceId) => {
        try {
            require('fs').appendFileSync(
                path.join(__dirname, 'browser_console.log'),
                `[Console] Level ${level} | Source ${sourceId}:${line} | Message: ${message}\n`
            );
        } catch(e) {}
    });

    tkWin.loadURL(url);
});

