const { app, BrowserWindow, ipcMain, Menu, session, dialog, globalShortcut, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const keystrokeSim = require('./keystroke_sim');

// Electron may lose stdout/stderr when the parent console closes (or when
// started without an attached TTY). Writing then throws EPIPE and kills the
// main process unless we swallow broken-pipe errors.
function isBrokenPipeError(err) {
  return !!(err && (err.code === 'EPIPE' || err.errno === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED'));
}
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.on === 'function') {
    stream.on('error', (err) => {
      if (isBrokenPipeError(err)) return;
      throw err;
    });
  }
}
process.on('uncaughtException', (err) => {
  if (isBrokenPipeError(err)) return;
  console.error('[main] uncaughtException:', err);
});

// Only one desktop instance may own the embedded server. Starting a second
// instance used to leave it attached to the first instance's old backend on
// port 3000, so overlay previews loaded stale HTML/security headers.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  return;
}

// Render mode (GPU / CPU) — must be applied before app ready.
function getRuntimePrefsPath() {
  return path.join(app.getPath('userData'), 'app-runtime-prefs.json');
}
function readRuntimePrefs() {
  try {
    return JSON.parse(fs.readFileSync(getRuntimePrefsPath(), 'utf8')) || {};
  } catch (_) {
    return {};
  }
}
function writeRuntimePrefs(next) {
  const prefs = { ...readRuntimePrefs(), ...next, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(getRuntimePrefsPath()), { recursive: true });
  fs.writeFileSync(getRuntimePrefsPath(), JSON.stringify(prefs, null, 2), 'utf8');
  return prefs;
}
const runtimePrefs = readRuntimePrefs();
const renderMode = runtimePrefs.renderMode === 'cpu' ? 'cpu' : 'gpu';
if (renderMode === 'cpu') {
  try {
    app.disableHardwareAcceleration();
    console.log('[main] Hardware acceleration disabled (CPU mode)');
  } catch (e) {
    console.warn('[main] disableHardwareAcceleration failed:', e.message);
  }
}

// สตาร์ทเซิร์ฟเวอร์หลังบ้าน Express + SQLite ในตัวทันที
require('./server.js');

const cameraVcam = require('./js/camera/vcam-main');
cameraVcam.registerCameraIpc();

const LOCAL_APP_URL = 'http://127.0.0.1:3000';

function waitForLocalServer(timeoutMs = 20000) {
  if (global.__tokControlServerReady) return Promise.resolve();
  if (global.__tokControlServerReadyPromise) {
    return Promise.race([
      global.__tokControlServerReadyPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('server_ready_timeout')), timeoutMs))
    ]).catch(async () => {
      // Fallback: poll HTTP in case promise was already settled before we subscribed.
      await pollLocalServer(timeoutMs);
    });
  }
  return pollLocalServer(timeoutMs);
}

function pollLocalServer(timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      const req = http.get(LOCAL_APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Local server not ready'));
        else setTimeout(tryOnce, 120);
      });
      req.setTimeout(800, () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error('Local server not ready'));
        else setTimeout(tryOnce, 120);
      });
    };
    tryOnce();
  });
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let pendingUpdateInfo = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notifyUpdateReady(info) {
  pendingUpdateInfo = info;
  const payload = {
    version: info?.version || 'unknown',
    currentVersion: app.getVersion()
  };
  sendToRenderer('app-update-ready', payload);
}

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] กำลังดาวน์โหลดเวอร์ชันใหม่:', info?.version || 'unknown');
  pendingUpdateInfo = null;
  sendToRenderer('app-update-available', {
    version: info?.version || 'unknown',
    currentVersion: app.getVersion()
  });
});

autoUpdater.on('download-progress', (progress) => {
  sendToRenderer('app-update-progress', {
    percent: progress?.percent || 0,
    transferred: progress?.transferred || 0,
    total: progress?.total || 0
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdater] ดาวน์โหลดเสร็จแล้ว:', info?.version || 'unknown');
  notifyUpdateReady(info);
});

autoUpdater.on('update-not-available', () => {
  pendingUpdateInfo = null;
  sendToRenderer('app-update-not-available', { currentVersion: app.getVersion() });
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err?.message || err);
  sendToRenderer('app-update-error', {
    message: err?.message || String(err),
    currentVersion: app.getVersion()
  });
});

function checkForAppUpdates() {
  if (!app.isPackaged) return;
  // Public GitHub releases — token ผิด/หมดอายุทำให้ GitHub ตอบ 404 แทน 401
  try {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  } catch (e) { /* ignore */ }
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[AutoUpdater] checkForUpdates failed:', err?.message || err);
  });
}

app.setName('TokControl');

let mainWindow = null;
let isInstallingUpdate = false;

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

async function prepareForUpdateInstall() {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch (e) {}
  });

  if (typeof global.__shutdownTokControlBackend === 'function') {
    await global.__shutdownTokControlBackend();
  }
}

const WIN_HOTKEY_ACCELERATORS = {
  '=': 'Alt+=',
  '-': 'Alt+-',
  a: 'Alt+A',
  w: 'Alt+W',
  z: 'Alt+Z',
  s: 'Alt+S',
  ArrowUp: 'Alt+Up',
  ArrowDown: 'Alt+Down'
};

function toWinAccelerator(key) {
  if (!key) return null;
  return WIN_HOTKEY_ACCELERATORS[key] || `Alt+${String(key).toUpperCase()}`;
}

function buildGlobalHotkeyBindings(config = {}) {
  if (Array.isArray(config.bindings)) {
    return config.bindings.filter(b => b && b.accelerator && b.action);
  }

  const bindings = [
    { accelerator: '1', action: 'gacha-1' },
    { accelerator: '3', action: 'gacha-3' },
    { accelerator: '5', action: 'gacha-5' },
    { accelerator: '0', action: 'gacha-10' },
    { accelerator: 'Space', action: 'space-skip' },
    { accelerator: 'M', action: 'toggle-bgm' },
    { accelerator: 'C', action: 'toggle-collection' }
  ];

  const plusAcc = toWinAccelerator(config.hotkeyPlus);
  const minusAcc = toWinAccelerator(config.hotkeyMinus);
  if (plusAcc) bindings.push({ accelerator: plusAcc, action: 'win-plus' });
  if (minusAcc) bindings.push({ accelerator: minusAcc, action: 'win-minus' });

  return bindings;
}

function isGlobalSafeAccelerator(accelerator) {
  if (!accelerator) return false;
  const acc = String(accelerator);
  if (/^(Alt|Ctrl|Control|Command|CommandOrControl|Meta|Shift)\+/i.test(acc)) return true;
  if (/^F\d+$/i.test(acc)) return true;
  return false;
}

function registerGlobalHotkeys(config = {}) {
  globalShortcut.unregisterAll();
  if (!config.enabled) return [];

  const failed = [];
  for (const binding of buildGlobalHotkeyBindings(config)) {
    const { accelerator, action } = binding;
    // Sound Alert (sa:) / Soundboard pads (sb:) อนุญาตปุ่มเดี่ยว — ใช้ได้ตอนพับจอ / อยู่ในเกม
    const allowBare = !!binding.allowBare
      || String(action || '').startsWith('sa:')
      || (String(action || '').startsWith('sb:') && String(action) !== 'sb-toggle' && String(action) !== 'sb-stop');
    if (!isGlobalSafeAccelerator(accelerator) && !allowBare) continue;
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          // กัน throttling ตอนพับจอ ให้เสียง/IPC ทำงานทันที
          try { mainWindow.webContents.setBackgroundThrottling(false); } catch (_) {}
          mainWindow.webContents.send('global-hotkey', action);
        }
      });
      if (!ok) failed.push(accelerator);
    } catch (err) {
      failed.push(accelerator);
      console.warn('[GlobalHotkey] register error:', accelerator, err?.message || err);
    }
  }

  if (failed.length) {
    console.warn('[GlobalHotkey] Failed to register:', failed.join(', '));
  }
  return failed;
}

async function createWindow () {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#120a24',
      symbolColor: '#e9d5ff',
      height: 36
    },
    icon: path.join(__dirname, 'assets', 'tokcontrol-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  // รอ Express listen ก่อน — กัน ERR_CONNECTION_REFUSED ตอน npm start
  try {
    await waitForLocalServer(20000);
  } catch (err) {
    console.error('[TokControl] Server not ready:', err.message);
  }

  win.loadURL(LOCAL_APP_URL);
  mainWindow = win;

  win.webContents.on('did-finish-load', () => {
    if (pendingUpdateInfo) notifyUpdateReady(pendingUpdateInfo);
  });

  win.on('closed', () => {
    mainWindow = null;
    try { cameraVcam.shutdownCameraOutputs(); } catch (_) { /* ignore */ }
    // ปิดหน้าต่างย่อยทั้งหมด (เช่น บราวเซอร์ป๊อปอัพของ TikTok) เมื่อปิดหน้าต่างหลัก
    BrowserWindow.getAllWindows().forEach(w => {
      try { w.close(); } catch(e){}
    });
  });
}

app.whenReady().then(async () => {
  // อนุญาตไมโครโฟน / กล้อง / จับเสียง ใน Electron (Avatar Studio, Camera, TTS)
  const MEDIA_PERMS = new Set([
    'media',
    'audio',
    'video',
    'audioCapture',
    'videoCapture',
    'microphone',
    'camera',
    'display-capture',
    'systemAudioCapture',
    'mediaKeySystem'
  ]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    try {
      if (MEDIA_PERMS.has(permission)) return callback(true);
      const types = details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      if (types.includes('audio') || types.includes('video')) return callback(true);
    } catch (_) { /* fall through */ }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    try {
      if (MEDIA_PERMS.has(permission)) return true;
      const mediaType = details && details.mediaType;
      if (mediaType === 'audio' || mediaType === 'video' || mediaType === 'microphone' || mediaType === 'camera') {
        return true;
      }
    } catch (_) { /* fall through */ }
    return false;
  });
  // Electron deviceType คือ audio/video/hid/usb/serial — ไม่ใช่ audioinput ของ enumerateDevices
  if (typeof session.defaultSession.setDevicePermissionHandler === 'function') {
    session.defaultSession.setDevicePermissionHandler((details) => {
      const t = details && details.deviceType;
      return t === 'audio'
        || t === 'video'
        || t === 'media'
        || t === 'hid'
        || t === 'serial'
        || t === 'usb'
        || t === 'audioinput'
        || t === 'videoinput'
        || t === 'audiooutput'
        || t === 'microphone'
        || t === 'camera';
    });
  }
  await createWindow();
  checkForAppUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('app-install-update', async () => {
  if (isInstallingUpdate) return;
  isInstallingUpdate = true;
  try {
    await prepareForUpdateInstall();
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 400);
  } catch (err) {
    isInstallingUpdate = false;
    console.error('[AutoUpdater] quitAndInstall error:', err?.message || err);
  }
});

ipcMain.handle('app-get-version', () => app.getVersion());

ipcMain.handle('app-capture-window', async (event) => {
  try {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' };
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    if (!png || !png.length) return { ok: false, error: 'empty' };
    return {
      ok: true,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      mime: 'image/png',
      size: png.length
    };
  } catch (err) {
    return { ok: false, error: err?.message || 'capture-failed' };
  }
});

ipcMain.handle('app-get-render-mode', () => {
  const prefs = readRuntimePrefs();
  return {
    mode: prefs.renderMode === 'cpu' ? 'cpu' : 'gpu',
    active: renderMode,
    needsRestart: (prefs.renderMode === 'cpu' ? 'cpu' : 'gpu') !== renderMode
  };
});

ipcMain.handle('app-set-render-mode', (_event, mode) => {
  const next = mode === 'cpu' ? 'cpu' : 'gpu';
  writeRuntimePrefs({ renderMode: next });
  return {
    ok: true,
    mode: next,
    active: renderMode,
    needsRestart: next !== renderMode
  };
});

ipcMain.handle('app-relaunch', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('media-ask-microphone', async () => {
  try {
    const { systemPreferences } = require('electron');
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      if (status === 'granted') return { ok: true, status };
      const granted = await systemPreferences.askForMediaAccess('microphone');
      return { ok: !!granted, status: granted ? 'granted' : systemPreferences.getMediaAccessStatus('microphone') };
    }
    if (process.platform === 'win32' && typeof systemPreferences.getMediaAccessStatus === 'function') {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      // Chromium ยังต้อง getUserMedia เอง — ไม่บล็อกที่นี่
      return { ok: status !== 'denied', status: status || 'granted' };
    }
    return { ok: true, status: 'granted' };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('pick-jar-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'เลือก Server JAR',
      properties: ['openFile'],
      filters: [
        { name: 'Java Archive', extensions: ['jar'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('open-external-url', async (_event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false };
    const target = url.trim();
    if (!/^https?:\/\//i.test(target) && !/^mailto:/i.test(target)) return { ok: false };
    await shell.openExternal(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('shell-open-path', async (_event, folder) => {
  try {
    const target = path.resolve(String(folder || ''));
    if (!target || !fs.existsSync(target)) return 'path not found';
    return await shell.openPath(target);
  } catch (err) {
    return err && err.message ? err.message : String(err);
  }
});

ipcMain.handle('simulate-keystrokes', async (_event, opts) => {
  try {
    const result = await keystrokeSim.simulateKeystrokes(opts || {});
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('keystroke-autoit-available', () => !!keystrokeSim.findAutoIt());

ipcMain.handle('app-get-pending-update', () => {
  if (!pendingUpdateInfo) return { ready: false };
  return {
    ready: true,
    version: pendingUpdateInfo.version || 'unknown',
    currentVersion: app.getVersion()
  };
});

ipcMain.on('renderer-error-log', (_event, log) => {
  try {
    const file = path.join(app.getPath('userData'), 'renderer_errors.txt');
    fs.appendFileSync(file, String(log || ''), 'utf8');
  } catch (_) { /* ignore */ }
});

ipcMain.on('sync-global-hotkeys', (_event, config) => {
  const failed = registerGlobalHotkeys(config || {});
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('global-hotkey-status', { failed });
  }
});

ipcMain.on('open-oauth-window', (_event, url) => {
  if (!url) return;

  const authWin = new BrowserWindow({
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    title: 'TokControl — Google Login',
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  try {
    authWin.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
  } catch (e) { /* ignore */ }

  let oauthDone = false;
  const finishOAuth = (token, error) => {
    if (oauthDone) return;
    oauthDone = true;
    if (error && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oauth-token', { error: String(error) });
    } else if (token && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oauth-token', { token });
    }
    if (!authWin.isDestroyed()) authWin.close();
  };

  const inspectOAuthUrl = (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      const hashParams = new URLSearchParams(String(parsed.hash || '').replace(/^#/, ''));
      const token = parsed.searchParams.get('token') || hashParams.get('token');
      const error = parsed.searchParams.get('error') || hashParams.get('error');
      const isSuccess = /auth-success\.html/i.test(parsed.pathname);
      if (!isSuccess && !token && !error) return;
      if (error) finishOAuth(null, decodeURIComponent(error));
      else if (token) finishOAuth(token);
    } catch (e) {}
  };

  authWin.webContents.setWindowOpenHandler(({ url: childUrl }) => {
    inspectOAuthUrl(childUrl);
    try {
      const host = new URL(childUrl).hostname;
      if (/(^|\.)google\.com$|(^|\.)accounts\.google\.com$|(^|\.)googleusercontent\.com$|(^|\.)gstatic\.com$/.test(host)) {
        return { action: 'allow' };
      }
    } catch (e) {}
    return { action: 'deny' };
  });

  authWin.webContents.on('will-redirect', (_e, redirectUrl) => inspectOAuthUrl(redirectUrl));
  authWin.webContents.on('will-navigate', (_e, navUrl) => inspectOAuthUrl(navUrl));
  authWin.webContents.on('did-navigate', (_e, navUrl) => inspectOAuthUrl(navUrl));
  authWin.webContents.on('did-navigate-in-page', (_e, navUrl) => inspectOAuthUrl(navUrl));
  authWin.webContents.on('did-finish-load', async () => {
    try {
      inspectOAuthUrl(authWin.webContents.getURL());
      const extracted = await authWin.webContents.executeJavaScript(`(() => {
        try {
          if (window.__oauthToken) return { token: window.__oauthToken };
          const p = new URLSearchParams(location.search);
          const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
          return {
            token: h.get('token') || p.get('token'),
            error: p.get('error') || h.get('error')
          };
        } catch (e) { return {}; }
      })()`, true);
      if (extracted?.error) finishOAuth(null, extracted.error);
      else if (extracted?.token) finishOAuth(extracted.token);
    } catch (e) {}
  });
  authWin.loadURL(url).catch((err) => {
    console.error('[OAuth] loadURL failed:', err);
  });
});

ipcMain.handle('get-pandy-token', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    return await mainWindow.webContents.executeJavaScript(`localStorage.getItem('pandy_token')`, true);
  } catch (e) {
    return null;
  }
});

let memoryMatchWindow = null;
ipcMain.on('open-memory-match-game', () => {
    if (memoryMatchWindow && !memoryMatchWindow.isDestroyed()) {
        memoryMatchWindow.focus();
        return;
    }
    memoryMatchWindow = new BrowserWindow({
        width: 960,
        height: 720,
        title: 'เกมจับคู่ — TokControl',
        autoHideMenuBar: true,
        backgroundColor: '#050507',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    memoryMatchWindow.on('closed', () => { memoryMatchWindow = null; });
    memoryMatchWindow.loadURL(`${LOCAL_APP_URL}/games/memory-match/index.html`);
});

let spotDiffWindow = null;
ipcMain.on('open-spot-diff-game', () => {
    if (spotDiffWindow && !spotDiffWindow.isDestroyed()) {
        spotDiffWindow.focus();
        return;
    }
    spotDiffWindow = new BrowserWindow({
        width: 1000,
        height: 720,
        title: 'จับผิดภาพ — TokControl',
        autoHideMenuBar: true,
        backgroundColor: '#050507',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    spotDiffWindow.on('closed', () => { spotDiffWindow = null; });
    spotDiffWindow.loadURL(`${LOCAL_APP_URL}/games/spot-diff/index.html`);
});

const dcPreloadPath = path.join(__dirname, 'preload.js');
const dcWebPrefs = {
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: false,
    preload: dcPreloadPath
};

let danceClubWindow = null;
function openDanceClubGameWindow() {
    if (danceClubWindow && !danceClubWindow.isDestroyed()) {
        danceClubWindow.focus();
        return danceClubWindow;
    }
    danceClubWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        title: 'Dance Club — TokControl',
        autoHideMenuBar: true,
        backgroundColor: '#07060f',
        webPreferences: dcWebPrefs
    });
    danceClubWindow.on('closed', () => { danceClubWindow = null; });
    danceClubWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('/games/dance-club/control.html')) {
            openDanceClubControlWindow();
            return { action: 'deny' };
        }
        if (url.includes('/games/dance-club/index.html')) {
            openDanceClubGameWindow();
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    danceClubWindow.loadURL(`${LOCAL_APP_URL}/games/dance-club/index.html`);
    return danceClubWindow;
}

ipcMain.on('open-dance-club-game', () => {
    openDanceClubGameWindow();
});

let watchPartyWindow = null;
ipcMain.on('open-watch-party-display', (_evt, opts = {}) => {
    if (watchPartyWindow && !watchPartyWindow.isDestroyed()) {
        watchPartyWindow.focus();
        return;
    }
    const landscape = !!opts.landscape;
    const portrait = !!opts.portrait;
    let width = 1280, height = 720, title = 'Watch Party Display — TokControl';
    let qs = '?display=1';
    if (landscape) { width = 1920; height = 1080; title = 'Watch Party (แนวนอน) — TokControl'; qs += '&landscape=1'; }
    if (portrait) { width = 1080; height = 1920; title = 'Watch Party (แนวตั้ง) — TokControl'; qs += '&portrait=1'; }
    watchPartyWindow = new BrowserWindow({
        width, height, title,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: false }
    });
    watchPartyWindow.on('closed', () => { watchPartyWindow = null; });
    watchPartyWindow.loadURL(`${LOCAL_APP_URL}/games/watch-party/index.html${qs}`);
});

let danceClubControlWindow = null;
function openDanceClubControlWindow() {
    openDanceClubGameWindow();
    if (danceClubControlWindow && !danceClubControlWindow.isDestroyed()) {
        danceClubControlWindow.focus();
        return danceClubControlWindow;
    }
    danceClubControlWindow = new BrowserWindow({
        width: 520,
        height: 780,
        title: 'Dance Club — Settings',
        autoHideMenuBar: true,
        backgroundColor: '#07060f',
        webPreferences: dcWebPrefs
    });
    danceClubControlWindow.on('closed', () => { danceClubControlWindow = null; });
    danceClubControlWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes('/games/dance-club/index.html')) {
            openDanceClubGameWindow();
            return { action: 'deny' };
        }
        if (url.includes('/games/dance-club/control.html')) {
            openDanceClubControlWindow();
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    danceClubControlWindow.loadURL(`${LOCAL_APP_URL}/games/dance-club/control.html`);
    return danceClubControlWindow;
}

ipcMain.on('open-dance-club-control', () => {
    openDanceClubControlWindow();
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
            backgroundThrottling: true
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

