/**
 * TokControl — Minecraft Paper server launcher (setup / start / status)
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const { spawn, spawnSync } = require('child_process');

const PAPER_VERSION_PREF = ['1.21.1', '1.20.6', '1.20.4'];
const REQUIRED_CLIENT = '1.21.1';
const JAVA_REQUIRED = 21;
const DEFAULT_XMS_MB = 2048;
const DEFAULT_XMX_MB = 4096;
const FILL_API = 'https://fill.papermc.io/v3/projects/paper';
const ADOPTIUM_JDK21_WIN =
    'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk';
const ADOPTIUM_PAGE = 'https://adoptium.net/temurin/releases/?version=21';
const USER_AGENT = 'TokControl/1.0 (minecraft-server-launcher)';
const MC_GAME_PORT = 25565;
const MC_BRIDGE_PORT = 8081;
/** Local HTTP (TokControl app) — clients on same PC download Kanit resource pack */
const MC_RESOURCE_PACK_URL = 'http://127.0.0.1:3000/resourcepacks/dist/TokControlPrompt.zip';
/** โหมดที่แยกโฟลเดอร์เซิร์ฟชัดเจน (กันแมพซ้อน) */
const MC_MODE_DIRS = ['box', 'fish', 'farm', 'tower', 'restaurant'];

let mcServerProcess = null;
/** โหมดที่ process ปัจจุบันรันอยู่ */
let mcActiveMode = null;

/** ความคืบหน้า setup/start — UI โพลล์ได้โดยไม่ต้องรอ POST จบ */
let mcProgress = {
    active: false,
    done: false,
    job: null,
    world: null,
    phase: '',
    message: '',
    percent: 0,
    bytesReceived: 0,
    bytesTotal: 0,
    error: null,
    updatedAt: 0
};

/** แคช resource pack — กัน rebuild ทุกครั้งที่เช็ค status (spawnSync ค้าง event loop) */
let cachedResourcePack = null;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMcProgress(patch) {
    mcProgress = {
        ...mcProgress,
        ...patch,
        updatedAt: Date.now()
    };
}

function beginMcJob(job, world, message) {
    setMcProgress({
        active: true,
        done: false,
        error: null,
        job: job || null,
        world: world || null,
        phase: 'start',
        message: message || 'เริ่มต้น…',
        percent: 0,
        bytesReceived: 0,
        bytesTotal: 0
    });
}

function endMcJob(ok, message, error) {
    setMcProgress({
        active: false,
        done: true,
        error: ok ? null : (error || message || 'ล้มเหลว'),
        phase: ok ? 'done' : 'error',
        message: message || (ok ? 'เสร็จแล้ว' : 'ล้มเหลว'),
        percent: ok ? 100 : Math.min(99, Number(mcProgress.percent) || 0)
    });
}

function getMcProgress() {
    return { ...mcProgress };
}

/** Paper 1.21+ ต้องใช้ Java 21 — หา JDK 21+ บน Windows/macOS/Linux */
function getJavaMajorVersion(exe) {
    try {
        const { spawnSync } = require('child_process');
        const r = spawnSync(exe, ['-version'], { encoding: 'utf8' });
        const combined = [r.stdout, r.stderr].filter(Boolean).join('\n');
        const m = combined.match(/version "(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    } catch (e) {
        return 0;
    }
}

let _javaResolveLogged = false;

function safeMcLog(...args) {
    try {
        console.log(...args);
    } catch (e) {
        if (!(e && (e.code === 'EPIPE' || e.errno === 'EPIPE'))) throw e;
    }
}

function safeMcWarn(...args) {
    try {
        console.warn(...args);
    } catch (e) {
        if (!(e && (e.code === 'EPIPE' || e.errno === 'EPIPE'))) throw e;
    }
}

function resolveJavaExecutable(minMajor = 21) {
    const candidates = [];
    const pushIf = (p) => {
        if (!p) return;
        const exe = process.platform === 'win32'
            ? path.join(p, 'bin', 'java.exe')
            : path.join(p, 'bin', 'java');
        if (fs.existsSync(exe)) candidates.push(exe);
    };

    if (process.env.JAVA_HOME) pushIf(process.env.JAVA_HOME);

    if (process.platform === 'win32') {
        const roots = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\BellSoft',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Microsoft',
            'C:\\Program Files\\Amazon Corretto',
            'C:\\Program Files\\Zulu'
        ];
        for (const root of roots) {
            if (!fs.existsSync(root)) continue;
            try {
                for (const name of fs.readdirSync(root)) {
                    if (/jdk-?21|21\./i.test(name) || /jdk-2[2-9]/i.test(name)) {
                        pushIf(path.join(root, name));
                    }
                }
            } catch (e) { /* ignore */ }
        }
        pushIf('C:\\Program Files\\Java\\jdk-21.0.11');
    }

    candidates.push('java');

    for (const exe of candidates) {
        const major = getJavaMajorVersion(exe);
        if (major >= minMajor) {
            if (!_javaResolveLogged) {
                safeMcLog('[MC Server] Using Java', major, '→', exe);
                _javaResolveLogged = true;
            }
            return exe;
        }
    }

    if (!_javaResolveLogged) {
        safeMcWarn('[MC Server] Java 21+ not found — falling back to PATH java (Paper 1.21 อาจเปิดไม่ได้)');
        _javaResolveLogged = true;
    }
    return 'java';
}

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (val) => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch (e) {}
            resolve(val);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
        try {
            socket.connect(port, host);
        } catch (e) {
            done(false);
        }
    });
}

/** ฆ่า java ที่รัน paper.jar — เรียกครั้งเดียว (เดิมวนทุกโหมดทำให้ UI ค้าง) */
let _lastOrphanKillAt = 0;
function killOrphanPaperProcesses(_serverDirIgnored) {
    const now = Date.now();
    if (now - _lastOrphanKillAt < 2500) return;
    _lastOrphanKillAt = now;

    if (process.platform === 'win32') {
        try {
            const ps = spawnSync('powershell', [
                '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command',
                "$ErrorActionPreference='SilentlyContinue'; " +
                "Get-CimInstance Win32_Process -Filter \"Name = 'java.exe'\" -ErrorAction SilentlyContinue | " +
                "Where-Object { $_.CommandLine -and ($_.CommandLine -like '*paper.jar*') } | " +
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
            ], { encoding: 'utf8', timeout: 6000, windowsHide: true });
            if (ps.error) console.warn('[MC Server] kill orphan:', ps.error.message);
            else if (ps.stderr && String(ps.stderr).trim()) {
                console.warn('[MC Server] kill orphan:', String(ps.stderr).trim().slice(0, 200));
            }
        } catch (e) {
            console.warn('[MC Server] kill orphan failed:', e.message);
        }
        return;
    }
    try {
        spawnSync('pkill', ['-f', 'paper.jar'], { stdio: 'ignore', timeout: 3000 });
    } catch (e) { /* ignore */ }
}

async function stopMcServerAndWait(timeoutMs = 12000) {
    try {
        const bridge = require('./minecraft-bridge-server');
        bridge.stopMinecraftTestBridge();
    } catch (e) { /* optional */ }

    const hadProc = !!(mcServerProcess && !mcServerProcess.killed);
    if (hadProc) {
        try { mcServerProcess.kill('SIGTERM'); } catch (e) {}
        await new Promise((resolve) => {
            const proc = mcServerProcess;
            if (!proc) return resolve();
            const t = setTimeout(resolve, Math.min(timeoutMs, 8000));
            proc.once('exit', () => { clearTimeout(t); resolve(); });
        });
        try { if (mcServerProcess && !mcServerProcess.killed) mcServerProcess.kill('SIGKILL'); } catch (e) {}
    }
    mcServerProcess = null;
    mcActiveMode = null;

    // ครั้งเดียวพอ — เดิมเรียก 5 รอบทำให้ PowerShell บล็อก UI นานมาก
    killOrphanPaperProcesses();

    // รอเฉพาะพอร์ตเกม (ไม่รอ bridge ที่อาจถูกใช้โดยอย่างอื่น)
    const deadline = Date.now() + Math.min(Math.max(2000, timeoutMs), 8000);
    while (Date.now() < deadline) {
        if (!(await isPortOpen(MC_GAME_PORT))) break;
        await sleep(300);
    }
    await sleep(300);
    return { success: true, stopped: true };
}

async function copyPluginJarSafe(pluginSrc, pluginDest) {
    const tmp = pluginDest + '.new';
    fs.mkdirSync(path.dirname(pluginDest), { recursive: true });
    fs.copyFileSync(pluginSrc, tmp);
    for (let i = 0; i < 12; i++) {
        try {
            if (fs.existsSync(pluginDest)) fs.unlinkSync(pluginDest);
            fs.renameSync(tmp, pluginDest);
            return true;
        } catch (e) {
            console.warn('[MC Server] plugin copy retry', i + 1, ':', e.message);
            await sleep(1000);
        }
    }
    try {
        fs.copyFileSync(pluginSrc, pluginDest);
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        return true;
    } catch (e) {
        console.warn('[MC Server] plugin copy failed:', e.message);
        return false;
    }
}

async function deleteWorldDir(worldDir, attempts = 5) {
    if (!fs.existsSync(worldDir)) return true;
    for (let i = 0; i < attempts; i++) {
        try {
            fs.rmSync(worldDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
            return true;
        } catch (e) {
            console.warn('[MC Server] world delete attempt', i + 1, ':', e.message);
            await sleep(1500);
        }
    }
    return !fs.existsSync(worldDir);
}

/**
 * ลบโลกแปลกปลอมในโฟลเดอร์โหมด (เช่น tokcontrol_farm ค้างใน box หลัง migrate)
 * คงไว้เฉพาะ level-name ของโหมดนั้น
 */
async function purgeForeignWorlds(serverDir, mode) {
    const keep = levelNameForMode(mode);
    if (!fs.existsSync(serverDir)) return [];
    const removed = [];
    for (const name of fs.readdirSync(serverDir)) {
        if (name === keep) continue;
        const full = path.join(serverDir, name);
        let isDir = false;
        try { isDir = fs.statSync(full).isDirectory(); } catch (_) { continue; }
        if (!isDir) continue;
        const foreign = /^tokcontrol_/i.test(name)
            || name === 'world'
            || name === 'world_nether'
            || name === 'world_the_end';
        if (!foreign) continue;
        const ok = await deleteWorldDir(full);
        if (ok) removed.push(name);
        else console.warn('[MC Server] could not remove foreign world:', name);
    }
    if (removed.length) {
        console.log('[MC Server] purged foreign worlds in', mode, '→', removed.join(', '));
    }
    return removed;
}

/** ล้างไฟล์ตกแต่งปลั๊กอินที่ปนข้ามโหมด (กันฟาร์มเก่าแปะทับ Box) */
function wipeCrossModePluginData(serverDir, mode) {
    const dir = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge');
    if (!fs.existsSync(dir)) return [];
    const m = normalizeWorldMode(mode);
    let wipe = [];
    if (m === 'box') {
        // Box ไม่ควรมี farm/fish decor — และ decorations เก่าอาจเป็นเศษฟาร์ม
        wipe = ['farm_decorations.yml', 'fish_decorations.yml'];
        // ถ้ามี decorations.yml จาก migrate ให้ลบตอน reset เต็ม (เรียกจาก resetMcServer)
    } else if (m === 'farm') {
        wipe = ['decorations.yml', 'fish_decorations.yml'];
    } else if (m === 'fish') {
        wipe = ['decorations.yml', 'farm_decorations.yml'];
    } else if (m === 'tower' || m === 'restaurant') {
        wipe = ['decorations.yml', 'farm_decorations.yml', 'fish_decorations.yml'];
    }
    const removed = [];
    for (const f of wipe) {
        const p = path.join(dir, f);
        try {
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                removed.push(f);
            }
        } catch (e) {
            console.warn('[MC Server] wipe plugin data', f, e.message);
        }
    }
    return removed;
}

/** รีเซ็ตเต็ม: ลบ decorations ของโหมดนั้นด้วย */
function wipeModeDecorFile(serverDir, mode) {
    const dir = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge');
    if (!fs.existsSync(dir)) return false;
    const m = normalizeWorldMode(mode);
    const file = m === 'farm' ? 'farm_decorations.yml'
        : (m === 'fish' ? 'fish_decorations.yml' : 'decorations.yml');
    const p = path.join(dir, file);
    try {
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            return true;
        }
    } catch (e) {
        console.warn('[MC Server] wipe decor', file, e.message);
    }
    return false;
}

/** root: userData/minecraft-servers/{box|fish|farm|tower|restaurant} */
function resolveMcServersRoot() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'minecraft-servers');
        }
    } catch (e) { /* not electron */ }
    return path.join(process.cwd(), 'games', 'minecraft-servers');
}

/** โฟลเดอร์เก่า (ก่อนแยกโหมด) — ใช้ย้ายข้อมูลครั้งเดียว */
function resolveLegacyMcServerDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'minecraft-server');
        }
    } catch (e) { /* not electron */ }
    return path.join(process.cwd(), 'games', 'minecraft-server');
}

function levelNameForMode(mode) {
    const m = normalizeWorldMode(mode);
    if (m === 'fish') return 'tokcontrol_fish';
    if (m === 'tower') return 'tokcontrol_tower';
    if (m === 'farm') return 'tokcontrol_farm';
    if (m === 'restaurant') return 'tokcontrol_restaurant';
    return 'tokcontrol_troll';
}

/**
 * โฟลเดอร์เซิร์ฟแยกตามโหมดเกม — Box / Fish / Farm / Tower / Restaurant คนละชุด
 * กันแมพซ้อน / บัคจาก world + plugin config ปนกัน
 */
function resolveMcServerDir(mode = 'box') {
    const m = normalizeWorldMode(mode);
    const root = resolveMcServersRoot();
    const dir = path.join(root, m);
    migrateLegacyServerOnce(m, dir);
    return dir;
}

/** ย้ายเซิร์ฟเก่า → box (ครั้งเดียว) ถ้ายังไม่มีโฟลเดอร์ใหม่ */
function migrateLegacyServerOnce(mode, targetDir) {
    if (mode !== 'box') return;
    if (fs.existsSync(path.join(targetDir, 'paper.jar'))) return;
    const legacy = resolveLegacyMcServerDir();
    if (!fs.existsSync(path.join(legacy, 'paper.jar'))) return;
    try {
        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
        if (!fs.existsSync(targetDir)) {
            fs.renameSync(legacy, targetDir);
            console.log('[MC Server] migrated legacy minecraft-server → minecraft-servers/box');
        }
    } catch (e) {
        try {
            // rename ไม่ได้ → copy paper + plugin
            fs.mkdirSync(targetDir, { recursive: true });
            const paperSrc = path.join(legacy, 'paper.jar');
            const paperDst = path.join(targetDir, 'paper.jar');
            if (fs.existsSync(paperSrc) && !fs.existsSync(paperDst)) {
                fs.copyFileSync(paperSrc, paperDst);
            }
            const plugSrc = path.join(legacy, 'plugins', 'TokControlMinecraftBridge.jar');
            const plugDst = path.join(targetDir, 'plugins', 'TokControlMinecraftBridge.jar');
            if (fs.existsSync(plugSrc)) {
                fs.mkdirSync(path.dirname(plugDst), { recursive: true });
                fs.copyFileSync(plugSrc, plugDst);
            }
            console.log('[MC Server] copied legacy paper/plugin → minecraft-servers/box');
        } catch (e2) {
            console.warn('[MC Server] legacy migrate:', e2.message);
        }
    }
}

/** แคช Paper jar ร่วม — ติดตั้งโหมดอื่นไม่ต้องดาวน์โหลดซ้ำ */
function resolvePaperCacheJar() {
    return path.join(resolveMcServersRoot(), '_cache', 'paper.jar');
}

async function ensurePaperJar(paperJar) {
    if (fs.existsSync(paperJar) && fs.statSync(paperJar).size >= 1000000) {
        setMcProgress({
            phase: 'paper_ready',
            message: 'พบ Paper jar แล้ว',
            percent: Math.max(Number(mcProgress.percent) || 0, 70)
        });
        return true;
    }
    const cache = resolvePaperCacheJar();
    if (fs.existsSync(cache) && fs.statSync(cache).size >= 1000000) {
        setMcProgress({
            phase: 'paper_cache',
            message: 'คัดลอก Paper จากแคช…',
            percent: Math.max(Number(mcProgress.percent) || 0, 55)
        });
        fs.mkdirSync(path.dirname(paperJar), { recursive: true });
        fs.copyFileSync(cache, paperJar);
        try {
            const metaSrc = cache + '.version.json';
            if (fs.existsSync(metaSrc)) fs.copyFileSync(metaSrc, paperJar + '.version.json');
        } catch (e) { /* ignore */ }
        return true;
    }
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    console.log('[MC Server] Downloading Paper (Fill API v3) ...');
    await downloadPaperJar(cache);
    fs.mkdirSync(path.dirname(paperJar), { recursive: true });
    fs.copyFileSync(cache, paperJar);
    try {
        const metaSrc = cache + '.version.json';
        if (fs.existsSync(metaSrc)) fs.copyFileSync(metaSrc, paperJar + '.version.json');
    } catch (e) { /* ignore */ }
    console.log('[MC Server] Download complete.');
    return true;
}

function clampInt(n, min, max, fallback) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

function runtimeConfigPath(serverDir) {
    return path.join(serverDir, 'mc-runtime.json');
}

function readRuntimeConfig(serverDir) {
    const defaults = {
        xmsMb: DEFAULT_XMS_MB,
        xmxMb: DEFAULT_XMX_MB,
        customJar: false,
        jarLabel: ''
    };
    try {
        const p = runtimeConfigPath(serverDir);
        if (!fs.existsSync(p)) return { ...defaults };
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        let xmsMb = clampInt(j.xmsMb, 512, 32768, defaults.xmsMb);
        let xmxMb = clampInt(j.xmxMb, 1024, 65536, defaults.xmxMb);
        if (xmsMb > xmxMb) xmsMb = xmxMb;
        return {
            xmsMb,
            xmxMb,
            customJar: !!j.customJar,
            jarLabel: String(j.jarLabel || '')
        };
    } catch (e) {
        return { ...defaults };
    }
}

function writeStartBat(serverDir, worldMode) {
    const javaExe = resolveJavaExecutable(JAVA_REQUIRED);
    const javaQuoted = javaExe.includes(' ') ? `"${javaExe}"` : javaExe;
    const rt = readRuntimeConfig(serverDir);
    const startBat = `@echo off
cd /d "%~dp0"
echo Starting TokControl ${worldModeLabel(worldMode)} Server...
echo Join: localhost:${MC_GAME_PORT}
${javaQuoted} -Xms${rt.xmsMb}M -Xmx${rt.xmxMb}M -jar paper.jar nogui
pause
`;
    fs.writeFileSync(path.join(serverDir, 'start-server.bat'), startBat);
}

function writeRuntimeConfig(serverDir, partial = {}, worldMode = 'box') {
    fs.mkdirSync(serverDir, { recursive: true });
    const cur = readRuntimeConfig(serverDir);
    const next = { ...cur, ...partial };
    next.xmsMb = clampInt(next.xmsMb, 512, 32768, DEFAULT_XMS_MB);
    next.xmxMb = clampInt(next.xmxMb, 1024, 65536, DEFAULT_XMX_MB);
    if (next.xmsMb > next.xmxMb) next.xmsMb = next.xmxMb;
    next.customJar = !!next.customJar;
    next.jarLabel = String(next.jarLabel || '');
    fs.writeFileSync(runtimeConfigPath(serverDir), JSON.stringify(next, null, 2));
    const mode = normalizeWorldMode(worldMode || getActiveWorldMode(serverDir).mode || 'box');
    writeStartBat(serverDir, mode);
    return next;
}

function readPaperVersionMeta(serverDir) {
    const candidates = [
        path.join(serverDir || '', 'paper.jar.version.json'),
        resolvePaperCacheJar() + '.version.json'
    ];
    for (const p of candidates) {
        try {
            if (!p || !fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (j && j.version) return j;
        } catch (e) { /* ignore */ }
    }
    return { version: REQUIRED_CLIENT };
}

function getJavaStatus() {
    const javaExe = resolveJavaExecutable(JAVA_REQUIRED);
    const javaMajor = getJavaMajorVersion(javaExe);
    return {
        javaOk: javaMajor >= JAVA_REQUIRED,
        javaMajor,
        javaPath: javaExe,
        javaRequired: JAVA_REQUIRED
    };
}

/**
 * Download Adoptium Temurin JDK 21 MSI (Windows) and open the installer.
 * Non-Windows: return browser fallback URL.
 */
async function downloadAndOpenJavaInstaller() {
    const steps = [
        'ดาวน์โหลด Adoptium Temurin JDK 21',
        'เปิดตัวติดตั้ง → กด Next จนจบ (แนะนำติ๊กเพิ่ม PATH ถ้ามี)',
        'กลับมาแอพแล้วกด «ตรวจสอบ Java อีกครั้ง»'
    ];
    if (process.platform !== 'win32') {
        return {
            success: false,
            openBrowser: true,
            url: ADOPTIUM_PAGE,
            steps,
            message: 'ระบบนี้ยังไม่รองรับติดตั้งอัตโนมัติ — เปิดหน้า Adoptium แล้วติดตั้ง JDK 21 เอง'
        };
    }
    const destDir = path.join(resolveMcServersRoot(), '_cache', 'java');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, 'temurin-jdk-21.msi');
    const stale = !fs.existsSync(dest) || (Date.now() - fs.statSync(dest).mtimeMs > 7 * 24 * 3600 * 1000)
        || fs.statSync(dest).size < 1000000;
    try {
        if (stale) {
            console.log('[MC Server] Downloading Adoptium JDK 21 MSI ...');
            await downloadFile(ADOPTIUM_JDK21_WIN, dest);
        }
        let opened = false;
        try {
            const { shell } = require('electron');
            const err = await shell.openPath(dest);
            opened = !err;
            if (err) console.warn('[MC Server] openPath:', err);
        } catch (e) {
            console.warn('[MC Server] shell.openPath failed:', e.message);
        }
        if (!opened) {
            try {
                spawn('cmd', ['/c', 'start', '', dest], { detached: true, stdio: 'ignore' }).unref();
                opened = true;
            } catch (e2) {
                return {
                    success: false,
                    openBrowser: true,
                    url: ADOPTIUM_PAGE,
                    path: dest,
                    steps,
                    error: e2.message
                };
            }
        }
        return { success: true, path: dest, opened, steps };
    } catch (err) {
        console.warn('[MC Server] Java download failed:', err.message);
        return {
            success: false,
            openBrowser: true,
            url: ADOPTIUM_PAGE,
            steps,
            error: err.message
        };
    }
}

function setCustomPaperJar(mode, srcPath) {
    const worldMode = normalizeWorldMode(mode);
    const serverDir = resolveMcServerDir(worldMode);
    if (!srcPath || !fs.existsSync(srcPath)) {
        throw new Error('ไม่พบไฟล์ JAR');
    }
    fs.mkdirSync(serverDir, { recursive: true });
    const dest = path.join(serverDir, 'paper.jar');
    fs.copyFileSync(srcPath, dest);
    writeRuntimeConfig(serverDir, {
        customJar: true,
        jarLabel: path.basename(srcPath)
    }, worldMode);
    return {
        success: true,
        path: dest,
        jarLabel: path.basename(srcPath),
        ...getMcServerStatus({ world: worldMode })
    };
}

function getServerPropertiesText(mode) {
    const worldMode = normalizeWorldMode(mode);
    const serverDir = resolveMcServerDir(worldMode);
    const propsPath = path.join(serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
        writeServerFiles(serverDir, worldMode);
    }
    return {
        success: true,
        world: worldMode,
        path: propsPath,
        text: fs.readFileSync(propsPath, 'utf8')
    };
}

function setServerPropertiesText(mode, text) {
    const worldMode = normalizeWorldMode(mode);
    const serverDir = resolveMcServerDir(worldMode);
    fs.mkdirSync(serverDir, { recursive: true });
    const propsPath = path.join(serverDir, 'server.properties');
    const body = String(text || '');
    if (!body.trim()) throw new Error('server.properties ว่าง');
    fs.writeFileSync(propsPath, body.endsWith('\n') ? body : body + '\n');
    ensureRconEnabled(serverDir);
    return { success: true, world: worldMode, path: propsPath };
}

function saveMcRuntime(opts = {}) {
    const worldMode = normalizeWorldMode(opts.world || opts.mode || 'box');
    const serverDir = resolveMcServerDir(worldMode);
    fs.mkdirSync(serverDir, { recursive: true });
    const partial = {};
    if (opts.xmsMb != null) partial.xmsMb = opts.xmsMb;
    if (opts.xmxMb != null) partial.xmxMb = opts.xmxMb;
    const rt = writeRuntimeConfig(serverDir, partial, worldMode);
    if (opts.levelName) {
        const propsPath = path.join(serverDir, 'server.properties');
        if (!fs.existsSync(propsPath)) writeServerFiles(serverDir, worldMode);
        let text = fs.readFileSync(propsPath, 'utf8');
        text = setServerPropText(text, 'level-name', String(opts.levelName).trim() || levelNameForMode(worldMode));
        fs.writeFileSync(propsPath, text.endsWith('\n') ? text : text + '\n');
    }
    return {
        success: true,
        world: worldMode,
        ...rt,
        levelName: getActiveWorldMode(serverDir).levelName,
        ...getMcServerStatus({ world: worldMode })
    };
}

function resolvePluginJar() {
    const built = path.join(__dirname, '..', 'mods', 'TokControlMinecraftBridge', 'build', 'libs', 'TokControlMinecraftBridge.jar');
    if (fs.existsSync(built)) return built;
    const alt = path.join(__dirname, '..', 'mods', 'TokControlMinecraftBridge', 'dist', 'TokControlMinecraftBridge.jar');
    if (fs.existsSync(alt)) return alt;
    return null;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 20000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('fetch failed ' + res.statusCode));
            }
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('fetch timeout')); });
        req.on('error', reject);
    });
}

async function resolvePaperVersion() {
    try {
        const data = await fetchJson(FILL_API);
        const groups = data.versions || {};
        for (const pref of PAPER_VERSION_PREF) {
            for (const [group, list] of Object.entries(groups)) {
                if (Array.isArray(list) && list.includes(pref)) return pref;
            }
        }
        // fallback: first 1.21.x patch
        const v121 = groups['1.21'];
        if (Array.isArray(v121) && v121.length) {
            const stable = v121.find(v => /^\d+\.\d+\.\d+$/.test(v)) || v121[0];
            return stable;
        }
    } catch (e) {
        console.warn('[MC Server] version resolve failed:', e.message);
    }
    return '1.21.1';
}

async function getPaperDownloadUrl(version) {
    const data = await fetchJson(`${FILL_API}/versions/${version}/builds/latest`);
    const dl = data.downloads && data.downloads['server:default'];
    if (!dl || !dl.url) throw new Error('no download url for Paper ' + version);
    return { url: dl.url, version, build: data.id || data.build, channel: data.channel, name: dl.name };
}

async function downloadPaperJar(destPath) {
    const version = await resolvePaperVersion();
    console.log('[MC Server] Resolved Paper version:', version);
    setMcProgress({
        phase: 'paper_meta',
        message: `หาบิลด์ Paper ${version}…`,
        percent: 8
    });
    const meta = await getPaperDownloadUrl(version);
    console.log('[MC Server] Downloading build', meta.build, '(' + (meta.name || meta.version) + ') ...');
    setMcProgress({
        phase: 'paper_download',
        message: `ดาวน์โหลด Paper build ${meta.build || meta.version}…`,
        percent: 10,
        bytesReceived: 0,
        bytesTotal: 0
    });
    await downloadFile(meta.url, destPath, (received, total) => {
        const pct = total > 0
            ? Math.min(70, 10 + Math.floor((received / total) * 60))
            : Math.min(70, 10 + Math.floor(received / (1024 * 1024)));
        const mb = (received / (1024 * 1024)).toFixed(1);
        const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) : '?';
        setMcProgress({
            phase: 'paper_download',
            message: `ดาวน์โหลด Paper… ${mb} / ${totalMb} MB`,
            percent: pct,
            bytesReceived: received,
            bytesTotal: total || 0
        });
    });
    fs.writeFileSync(destPath + '.version.json', JSON.stringify(meta, null, 2));
    setMcProgress({
        phase: 'paper_done',
        message: 'ดาวน์โหลด Paper เสร็จ',
        percent: 72
    });
    return meta;
}

function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 120000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error('download failed ' + res.statusCode));
            }
            const total = parseInt(res.headers['content-length'], 10) || 0;
            let received = 0;
            let lastDataAt = Date.now();
            const stallTimer = setInterval(() => {
                if (Date.now() - lastDataAt > 90000) {
                    clearInterval(stallTimer);
                    try { req.destroy(); } catch (e) { /* ignore */ }
                    reject(new Error('download stalled (ไม่มีข้อมูลนานเกิน 90 วินาที)'));
                }
            }, 5000);
            const file = fs.createWriteStream(destPath);
            res.on('data', (chunk) => {
                received += chunk.length;
                lastDataAt = Date.now();
                if (typeof onProgress === 'function') {
                    try { onProgress(received, total); } catch (e) { /* ignore */ }
                }
            });
            res.pipe(file);
            file.on('finish', () => {
                clearInterval(stallTimer);
                file.close(() => resolve());
            });
            file.on('error', (err) => {
                clearInterval(stallTimer);
                reject(err);
            });
            res.on('error', (err) => {
                clearInterval(stallTimer);
                reject(err);
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')); });
        req.on('error', reject);
    });
}

function resolveResourcePackSourceDir() {
    return path.join(__dirname, '..', 'resourcepacks', 'tokcontrol-prompt');
}

function resolveResourcePackZip() {
    return path.join(__dirname, '..', 'resourcepacks', 'dist', 'TokControlPrompt.zip');
}

/**
 * Build TokControlPrompt.zip (Prompt as default Minecraft font) if missing/stale.
 * Uses `jar` when available so zip entries use forward slashes.
 * @param {{force?: boolean}} [opts]
 */
function ensureKanitResourcePackZip(opts = {}) {
    const srcDir = resolveResourcePackSourceDir();
    const zipPath = resolveResourcePackZip();
    const fontFile = path.join(srcDir, 'assets', 'minecraft', 'font', 'prompt.ttf');
    if (!fs.existsSync(fontFile)) {
        console.warn('[MC Server] Prompt font missing — skip resource pack');
        cachedResourcePack = null;
        return null;
    }
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    let needsBuild = !!opts.force || !fs.existsSync(zipPath) || fs.statSync(zipPath).size < 10000;
    if (!needsBuild) {
        try {
            const zipMtime = fs.statSync(zipPath).mtimeMs;
            const fontMtime = fs.statSync(fontFile).mtimeMs;
            const metaMtime = fs.statSync(path.join(srcDir, 'pack.mcmeta')).mtimeMs;
            if (fontMtime > zipMtime || metaMtime > zipMtime) needsBuild = true;
        } catch (e) {
            needsBuild = true;
        }
    }
    if (needsBuild) {
        setMcProgress({
            phase: 'resource_pack',
            message: 'สร้าง Resource Pack ฟอนต์ Prompt…',
            percent: Math.max(Number(mcProgress.percent) || 0, 78)
        });
        const jar = spawnSync('jar', ['-cfM', zipPath, '.'], {
            cwd: srcDir,
            encoding: 'utf8',
            windowsHide: true,
            timeout: 90000
        });
        if (jar.status !== 0 || !fs.existsSync(zipPath)) {
            console.warn('[MC Server] jar zip failed:', jar.stderr || jar.error?.message);
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                spawnSync('powershell', [
                    '-NoProfile', '-Command',
                    `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force`
                ], { windowsHide: true, timeout: 90000 });
            } catch (e) {
                console.warn('[MC Server] Compress-Archive failed:', e.message);
            }
        }
    }
    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 10000) {
        cachedResourcePack = null;
        return null;
    }
    const mtime = fs.statSync(zipPath).mtimeMs;
    if (cachedResourcePack && cachedResourcePack.path === zipPath && cachedResourcePack.mtime === mtime) {
        return cachedResourcePack;
    }
    const sha1 = require('crypto').createHash('sha1').update(fs.readFileSync(zipPath)).digest('hex');
    cachedResourcePack = { path: zipPath, sha1, url: MC_RESOURCE_PACK_URL, mtime };
    return cachedResourcePack;
}

/** อ่านแพ็กที่มีอยู่แล้ว — ไม่ rebuild (ใช้ใน status) */
function getResourcePackInfoCached() {
    const zipPath = resolveResourcePackZip();
    try {
        if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 10000) return null;
        const mtime = fs.statSync(zipPath).mtimeMs;
        if (cachedResourcePack && cachedResourcePack.path === zipPath && cachedResourcePack.mtime === mtime) {
            return cachedResourcePack;
        }
        const sha1 = require('crypto').createHash('sha1').update(fs.readFileSync(zipPath)).digest('hex');
        cachedResourcePack = { path: zipPath, sha1, url: MC_RESOURCE_PACK_URL, mtime };
        return cachedResourcePack;
    } catch (e) {
        return null;
    }
}

/** Disable custom font resource pack — use vanilla Minecraft font. */
function clearResourcePack(serverDir) {
    fs.mkdirSync(serverDir, { recursive: true });
    const propsPath = path.join(serverDir, 'server.properties');
    if (fs.existsSync(propsPath)) {
        let text = fs.readFileSync(propsPath, 'utf8');
        text = setServerPropText(text, 'resource-pack', '');
        text = setServerPropText(text, 'resource-pack-sha1', '');
        text = setServerPropText(text, 'require-resource-pack', 'false');
        text = setServerPropText(text, 'resource-pack-prompt', '');
        fs.writeFileSync(propsPath, text.endsWith('\n') ? text : text + '\n');
    }
    try {
        const localDir = path.join(serverDir, 'resourcepacks');
        if (fs.existsSync(localDir)) {
            for (const name of ['TokControlPrompt.zip', 'TokControlKanit.zip']) {
                const p = path.join(localDir, name);
                if (fs.existsSync(p)) {
                    try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
                }
            }
        }
    } catch (e) {
        console.warn('[MC Server] resource pack cleanup:', e.message);
    }
    return null;
}

/** @deprecated Prompt/Kanit disabled — clears pack instead */
function applyKanitResourcePack(serverDir) {
    return clearResourcePack(serverDir);
}

function writeServerFiles(serverDir, mode = 'box') {
    const worldMode = normalizeWorldMode(mode);
    fs.mkdirSync(path.join(serverDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
    const levelName = levelNameForMode(worldMode);
    const motd = worldMode === 'fish' ? 'TokControl Fish Control Pier'
        : (worldMode === 'tower' ? 'TokControl Tower Wars Castle'
            : (worldMode === 'farm' ? 'TokControl Farm Control'
                : (worldMode === 'restaurant' ? 'TokControl Restaurant Control'
                    : 'TokControl Troll Live Map')));
    const props = [
        `motd=${motd}`,
        `server-port=${MC_GAME_PORT}`,
        'online-mode=false',
        'max-players=20',
        'gamemode=survival',
        'difficulty=easy',
        'spawn-protection=0',
        'pvp=true',
        `level-name=${levelName}`,
        'level-type=minecraft\\:flat',
        'generator-settings={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":3},{"block":"minecraft:grass_block","height":1}],"structure":false}',
        'spawn-monsters=false',
        'spawn-animals=true',
        'view-distance=10',
        'simulation-distance=8',
        'enable-rcon=true',
        'rcon.port=25575',
        'rcon.password=' + resolveRconPassword(),
        'broadcast-rcon-to-ops=false',
        'resource-pack=',
        'resource-pack-sha1=',
        'require-resource-pack=false',
        'resource-pack-prompt='
    ].join('\n');
    fs.writeFileSync(path.join(serverDir, 'server.properties'), props + '\n');
    writeStartBat(serverDir, worldMode);
    // marker ไฟล์โหมด — ยืนยันว่าโฟลเดอร์นี้เป็นเซิร์ฟของเกมไหน
    fs.writeFileSync(path.join(serverDir, 'tokcontrol-mode.txt'), worldMode + '\n');
    if (!fs.existsSync(runtimeConfigPath(serverDir))) {
        writeRuntimeConfig(serverDir, {}, worldMode);
    }
    clearResourcePack(serverDir);
}

function copyFarmersDelightJar(serverDir) {
    const os = require('os');
    const destDir = path.join(serverDir, 'mods');
    const dest = path.join(destDir, 'FarmersDelight-1.21-1.2.4.jar');
    const srcs = [
        path.join(os.homedir(), 'Downloads', 'FarmersDelight-1.21-1.2.4.jar'),
        path.join(__dirname, '..', 'mods', 'FarmersDelight-1.21-1.2.4.jar')
    ];
    const src = srcs.find((p) => fs.existsSync(p));
    if (!src) return false;
    try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
        console.log('[MC Server] copied Farmers Delight →', dest);
        return true;
    } catch (e) {
        console.warn('[MC Server] Farmers Delight copy:', e.message);
        return false;
    }
}

/** อ่าน/เขียน key ใน server.properties */
function setServerPropText(text, key, value) {
    const re = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
    if (re.test(text)) return text.replace(re, `${key}=${value}`);
    return text.trimEnd() + `\n${key}=${value}\n`;
}

function readServerProp(text, key, fallback = '') {
    const re = new RegExp(`^${key.replace('.', '\\.')}=(.*)$`, 'm');
    const m = text.match(re);
    return m ? String(m[1]).trim() : fallback;
}

function normalizeWorldMode(mode) {
    const m = String(mode || 'box').toLowerCase();
    if (m === 'fish' || m === 'fish-control') return 'fish';
    if (m === 'tower' || m === 'tower-wars' || m === 'castle' || m === 'castle-wars') return 'tower';
    if (m === 'farm' || m === 'farm-control' || m === 'wheat') return 'farm';
    if (m === 'restaurant' || m === 'restaurant-control' || m === 'kitchen') return 'restaurant';
    return 'box';
}

function worldModeLabel(mode) {
    if (mode === 'fish') return 'Fish Control';
    if (mode === 'tower') return 'Tower Wars';
    if (mode === 'farm') return 'Farm Control';
    if (mode === 'restaurant') return 'Restaurant Control';
    return 'Box Control';
}

/**
 * แยกแมพ: box / fish / tower (Castle Wars — สร้างผ่าน RCON)
 * ต้องเรียกก่อน start และเซิร์ฟต้องปิดอยู่
 */
function applyWorldMode(serverDir, mode = 'box') {
    const propsPath = path.join(serverDir, 'server.properties');
    const worldMode = normalizeWorldMode(mode);
    if (!fs.existsSync(propsPath)) writeServerFiles(serverDir, worldMode);
    let text = fs.readFileSync(propsPath, 'utf8');

    if (worldMode === 'fish') {
        const oceanFlat = '{"biome":"minecraft:warm_ocean","layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":28},{"block":"minecraft:gravel","height":2},{"block":"minecraft:sand","height":3},{"block":"minecraft:water","height":30}],"structure":false}';
        text = setServerPropText(text, 'motd', 'TokControl Fish Control Pier');
        text = setServerPropText(text, 'level-name', 'tokcontrol_fish');
        text = setServerPropText(text, 'level-type', 'minecraft\\:flat');
        text = setServerPropText(text, 'generator-settings', oceanFlat);
        text = setServerPropText(text, 'spawn-monsters', 'true');
        text = setServerPropText(text, 'spawn-animals', 'true');
        text = setServerPropText(text, 'gamemode', 'survival');
    } else if (worldMode === 'tower') {
        const towerFlat = '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains","structure":false}';
        text = setServerPropText(text, 'motd', 'TokControl Tower Wars Castle');
        text = setServerPropText(text, 'level-name', 'tokcontrol_tower');
        text = setServerPropText(text, 'level-type', 'minecraft\\:flat');
        text = setServerPropText(text, 'generator-settings', towerFlat);
        text = setServerPropText(text, 'spawn-monsters', 'false');
        text = setServerPropText(text, 'spawn-animals', 'false');
        text = setServerPropText(text, 'gamemode', 'survival');
        text = setServerPropText(text, 'difficulty', 'easy');
    } else if (worldMode === 'farm') {
        const farmFlat = '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains","structure":false}';
        text = setServerPropText(text, 'motd', 'TokControl Farm Control');
        text = setServerPropText(text, 'level-name', 'tokcontrol_farm');
        text = setServerPropText(text, 'level-type', 'minecraft\\:flat');
        text = setServerPropText(text, 'generator-settings', farmFlat);
        text = setServerPropText(text, 'spawn-monsters', 'false');
        text = setServerPropText(text, 'spawn-animals', 'true');
        text = setServerPropText(text, 'gamemode', 'survival');
        text = setServerPropText(text, 'difficulty', 'peaceful');
    } else if (worldMode === 'restaurant') {
        const restaurantFlat = '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":3},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains","structure":false}';
        text = setServerPropText(text, 'motd', 'TokControl Restaurant Control');
        text = setServerPropText(text, 'level-name', 'tokcontrol_restaurant');
        text = setServerPropText(text, 'level-type', 'minecraft\\:flat');
        text = setServerPropText(text, 'generator-settings', restaurantFlat);
        text = setServerPropText(text, 'spawn-monsters', 'false');
        text = setServerPropText(text, 'spawn-animals', 'true');
        text = setServerPropText(text, 'gamemode', 'survival');
        text = setServerPropText(text, 'difficulty', 'peaceful');
    } else {
        const boxFlat = '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":3},{"block":"minecraft:grass_block","height":1}],"structure":false}';
        text = setServerPropText(text, 'motd', 'TokControl Troll Live Map');
        text = setServerPropText(text, 'level-name', 'tokcontrol_troll');
        text = setServerPropText(text, 'level-type', 'minecraft\\:flat');
        text = setServerPropText(text, 'generator-settings', boxFlat);
        text = setServerPropText(text, 'spawn-monsters', 'false');
        text = setServerPropText(text, 'spawn-animals', 'true');
    }

    fs.writeFileSync(propsPath, text.endsWith('\n') ? text : text + '\n');
    try {
        fs.writeFileSync(path.join(serverDir, 'tokcontrol-mode.txt'), worldMode + '\n');
    } catch (e) { /* ignore */ }
    writePluginGameMode(serverDir, worldMode);
    return { mode: worldMode, levelName: levelNameForMode(worldMode) };
}

function resolveBridgeToken() {
    try {
        const { getMcBridgeToken } = require('../auth_secrets');
        return String(getMcBridgeToken() || '').trim();
    } catch (e) {
        return '';
    }
}

function resolveRconPassword() {
    try {
        const { getMcRconPassword } = require('../auth_secrets');
        return String(getMcRconPassword() || '').trim() || 'tokcontrol';
    } catch (e) {
        return 'tokcontrol';
    }
}

/** บอก plugin ว่าโหมดไหน — tower ไม่สร้าง Box/Fish อัตโนมัติ (แมพมาจาก TowerWarsService) */
function writePluginGameMode(serverDir, mode) {
    const dir = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge');
    const worldMode = normalizeWorldMode(mode);
    try {
        fs.mkdirSync(dir, { recursive: true });
        const cfgPath = path.join(dir, 'config.yml');
        let text = '';
        if (fs.existsSync(cfgPath)) text = fs.readFileSync(cfgPath, 'utf8');
        // fish | box | tower | farm | restaurant (RCON-built; never auto-build Box)
        const pluginMode = worldMode === 'fish' ? 'fish'
            : (worldMode === 'tower' ? 'tower'
                : (worldMode === 'farm' ? 'farm'
                    : (worldMode === 'restaurant' ? 'restaurant' : 'box')));
        const buildOnStart = worldMode === 'box' ? 'true' : 'false';
        const bridgeToken = resolveBridgeToken();
        if (!text.trim()) {
            text = [
                'http-port: 8081',
                'bridge-token: "' + bridgeToken.replace(/"/g, '') + '"',
                'streamer-name: Puncheroo',
                'allow-flight: true',
                'game-mode: ' + pluginMode,
                'arena:',
                '  build-on-start: ' + buildOnStart,
                '  expand-level: 4',
                '  height: 9'
            ].join('\n') + '\n';
        } else {
            if (/^streamer-name:\s*(''|\"\"|\s*)$/m.test(text)) {
                text = text.replace(/^streamer-name:.*$/m, 'streamer-name: Puncheroo');
            } else if (!/^streamer-name:/m.test(text)) {
                text = text.trimEnd() + '\nstreamer-name: Puncheroo\n';
            }
            if (/^game-mode:/m.test(text)) text = text.replace(/^game-mode:.*$/m, 'game-mode: ' + pluginMode);
            else text = text.trimEnd() + '\ngame-mode: ' + pluginMode + '\n';
            if (/^ {2}build-on-start:/m.test(text)) {
                text = text.replace(/^ {2}build-on-start:.*$/m, '  build-on-start: ' + buildOnStart);
            } else {
                text = text.trimEnd() + '\n  build-on-start: ' + buildOnStart + '\n';
            }
            const tokenLine = 'bridge-token: "' + bridgeToken.replace(/"/g, '') + '"';
            if (/^bridge-token:/m.test(text)) text = text.replace(/^bridge-token:.*$/m, tokenLine);
            else text = text.trimEnd() + '\n' + tokenLine + '\n';
        }
        fs.writeFileSync(cfgPath, text.endsWith('\n') ? text : text + '\n');
    } catch (e) {
        console.warn('[MC Server] writePluginGameMode:', e.message);
    }
}

function getActiveWorldMode(serverDir) {
    // โฟลเดอร์แยกโหมด → อ่านจากชื่อโฟลเดอร์ / marker ก่อน
    try {
        const base = path.basename(serverDir).toLowerCase();
        if (MC_MODE_DIRS.includes(base)) {
            return { mode: base, levelName: levelNameForMode(base) };
        }
        const marker = path.join(serverDir, 'tokcontrol-mode.txt');
        if (fs.existsSync(marker)) {
            const m = normalizeWorldMode(fs.readFileSync(marker, 'utf8').trim());
            return { mode: m, levelName: levelNameForMode(m) };
        }
    } catch (e) { /* fall through */ }
    const propsPath = path.join(serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) return { mode: 'box', levelName: 'tokcontrol_troll' };
    const text = fs.readFileSync(propsPath, 'utf8');
    const levelName = readServerProp(text, 'level-name', 'tokcontrol_troll');
    let mode = 'box';
    if (levelName.includes('fish')) mode = 'fish';
    else if (levelName.includes('tower') || levelName.includes('castle')) mode = 'tower';
    else if (levelName.includes('farm') || levelName.includes('wheat')) mode = 'farm';
    else if (levelName.includes('restaurant') || levelName.includes('kitchen')) mode = 'restaurant';
    return { mode, levelName };
}

/** เปิด RCON ใน server.properties ที่มีอยู่แล้ว (ไม่ทับค่าอื่น) */
function ensureRconEnabled(serverDir, { password = resolveRconPassword(), port = 25575 } = {}) {
    const propsPath = path.join(serverDir, 'server.properties');
    if (!fs.existsSync(propsPath)) {
        writeServerFiles(serverDir, getActiveWorldMode(serverDir).mode);
        return { enabled: true, port, password, created: true };
    }
    let text = fs.readFileSync(propsPath, 'utf8');
    const setProp = (key, value) => {
        const re = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
        if (re.test(text)) text = text.replace(re, `${key}=${value}`);
        else text = text.trimEnd() + `\n${key}=${value}\n`;
    };
    setProp('enable-rcon', 'true');
    setProp('rcon.port', String(port));
    const existing = text.match(/^rcon\.password=(.*)$/m);
    let finalPass = password;
    if (existing && String(existing[1] || '').trim()) {
        finalPass = String(existing[1]).trim();
    } else {
        setProp('rcon.password', password);
    }
    setProp('broadcast-rcon-to-ops', 'false');
    fs.writeFileSync(propsPath, text.endsWith('\n') ? text : text + '\n');
    return { enabled: true, port, password: finalPass, created: false };
}

async function setupMcServer(opts = {}) {
    const mode = normalizeWorldMode(opts.world || opts.mode || 'box');
    beginMcJob('setup', mode, `ติดตั้งแพ็กเกจ ${worldModeLabel(mode)}…`);
    try {
        setMcProgress({ phase: 'prepare', message: 'เตรียมโฟลเดอร์เซิร์ฟ…', percent: 3 });
        if (!opts.skipStop) {
            setMcProgress({ phase: 'stop', message: 'ปิดเซิร์ฟเดิม (ถ้ามี)…', percent: 5 });
            await stopMcServerAndWait(10000);
        }
        const serverDir = resolveMcServerDir(mode);
        fs.mkdirSync(serverDir, { recursive: true });
        // กันโลกฟาร์ม/โหมดอื่นค้างในโฟลเดอร์ box (หลัง migrate หรือเปิดผิดโหมด)
        setMcProgress({ phase: 'purge', message: 'ทำความสะอาดโลกค้าง…', percent: 8 });
        await purgeForeignWorlds(serverDir, mode);
        wipeCrossModePluginData(serverDir, mode);
        const paperJar = path.join(serverDir, 'paper.jar');
        await ensurePaperJar(paperJar);
        setMcProgress({ phase: 'files', message: 'เขียนไฟล์เซิร์ฟเวอร์…', percent: 80 });
        writeServerFiles(serverDir, mode);
        applyWorldMode(serverDir, mode);
        writePluginGameMode(serverDir, mode);
        if (mode === 'restaurant') {
            setMcProgress({ phase: 'mods', message: 'คัดลอก Farmers Delight…', percent: 86 });
            copyFarmersDelightJar(serverDir);
        }
        setMcProgress({ phase: 'resource_pack', message: 'ใช้ฟอนต์ Minecraft เดิม…', percent: 88 });
        clearResourcePack(serverDir);
        const pluginSrc = resolvePluginJar();
        const pluginDest = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge.jar');
        let pluginCopied = false;
        if (pluginSrc) {
            setMcProgress({ phase: 'plugin', message: 'คัดลอกปลั๊กอิน TokControl…', percent: 94 });
            pluginCopied = await copyPluginJarSafe(pluginSrc, pluginDest);
        }
        const result = {
            success: true,
            path: serverDir,
            paper: fs.existsSync(paperJar),
            plugin: fs.existsSync(pluginDest),
            pluginCopied,
            pluginBuilt: !!pluginSrc,
            worldMode: mode,
            levelName: levelNameForMode(mode),
            join: `localhost:${MC_GAME_PORT}`,
            bridge: `ws://127.0.0.1:${MC_BRIDGE_PORT}`
        };
        endMcJob(true, `ติดตั้ง ${worldModeLabel(mode)} เสร็จแล้ว`);
        return result;
    } catch (err) {
        endMcJob(false, err.message || 'ติดตั้งล้มเหลว', err.message);
        throw err;
    }
}

function isMcServerRunning() {
    if (mcServerProcess && !mcServerProcess.killed) return true;
    return false;
}

async function probeMcPorts() {
    const gamePortOpen = await isPortOpen(MC_GAME_PORT);
    const bridgePortOpen = await isPortOpen(MC_BRIDGE_PORT);
    const rconPortOpen = await isPortOpen(25575);
    return { gamePortOpen, bridgePortOpen, rconPortOpen };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.world] โหมดที่ต้องการเช็ค (box|fish|farm|tower|restaurant)
 */
function getMcServerStatus(opts = {}) {
    const requestMode = opts.world || opts.mode
        ? normalizeWorldMode(opts.world || opts.mode)
        : null;
    const runningMode = mcActiveMode || (isMcServerRunning() ? null : null);
    // ถ้าขอโหมดเฉพาะ → ดูโฟลเดอร์นั้น; ถ้ารันอยู่โหมดอื่น แจ้งชัด
    const statusMode = requestMode || runningMode || 'box';
    const serverDir = resolveMcServerDir(statusMode);
    const paperJar = path.join(serverDir, 'paper.jar');
    const pluginJar = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge.jar');
    const java = getJavaStatus();
    const rt = readRuntimeConfig(serverDir);
    const paperMeta = readPaperVersionMeta(serverDir);
    const defaultRconPass = resolveRconPassword();
    let rcon = { enabled: false, port: 25575, password: defaultRconPass };
    try {
        const propsPath = path.join(serverDir, 'server.properties');
        if (fs.existsSync(propsPath)) {
            const text = fs.readFileSync(propsPath, 'utf8');
            const en = text.match(/^enable-rcon=(.*)$/m);
            const rp = text.match(/^rcon\.port=(.*)$/m);
            const rw = text.match(/^rcon\.password=(.*)$/m);
            rcon = {
                enabled: !en || String(en[1]).trim().toLowerCase() === 'true',
                port: rp ? (parseInt(rp[1], 10) || 25575) : 25575,
                password: rw ? String(rw[1]).trim() : defaultRconPass
            };
        }
    } catch (e) { /* ignore */ }
    const world = getActiveWorldMode(serverDir);
    const running = isMcServerRunning();
    const thisModeRunning = running && mcActiveMode === statusMode;
    const otherModeRunning = running && mcActiveMode && mcActiveMode !== statusMode;
    return {
        installed: fs.existsSync(paperJar),
        pluginInstalled: fs.existsSync(pluginJar),
        pluginBuilt: !!resolvePluginJar(),
        running: thisModeRunning,
        anyRunning: running,
        runningMode: mcActiveMode,
        otherModeRunning: !!otherModeRunning,
        otherModeLabel: otherModeRunning ? worldModeLabel(mcActiveMode) : null,
        javaOk: java.javaOk,
        javaMajor: java.javaMajor,
        javaPath: java.javaPath,
        javaRequired: JAVA_REQUIRED,
        requiredClient: REQUIRED_CLIENT,
        paperVersion: paperMeta.version || REQUIRED_CLIENT,
        paperBuild: paperMeta.build || null,
        resourcePack: null,
        xmsMb: rt.xmsMb,
        xmxMb: rt.xmxMb,
        customJar: rt.customJar,
        jarLabel: rt.jarLabel || (fs.existsSync(paperJar) ? 'paper.jar' : ''),
        path: serverDir,
        serversRoot: resolveMcServersRoot(),
        join: `localhost:${MC_GAME_PORT}`,
        bridge: `http://127.0.0.1:${MC_BRIDGE_PORT}`,
        rcon,
        worldMode: world.mode,
        levelName: world.levelName,
        modeLabel: worldModeLabel(world.mode)
    };
}

async function startMcServer(opts = {}) {
    const mode = normalizeWorldMode(opts.world || opts.mode || 'box');
    beginMcJob('start', mode, `เริ่มเซิร์ฟ ${worldModeLabel(mode)}…`);
    if (isMcServerRunning()) {
        if (mcActiveMode && mcActiveMode !== mode) {
            const err = `เซิร์ฟ ${worldModeLabel(mcActiveMode)} กำลังรันอยู่ (โฟลเดอร์แยก) — ปิดเซิร์ฟนั้นก่อน แล้วเปิด ${worldModeLabel(mode)}`;
            endMcJob(false, err, err);
            return {
                success: false,
                error: err,
                ...getMcServerStatus({ world: mode })
            };
        }
        endMcJob(true, `เซิร์ฟ ${worldModeLabel(mode)} รันอยู่แล้ว`);
        return { success: true, already: true, ...getMcServerStatus({ world: mode }) };
    }
    try {
        setMcProgress({ phase: 'bridge', message: 'ปิด test bridge…', percent: 5 });
        try {
            const bridge = require('./minecraft-bridge-server');
            bridge.stopMinecraftTestBridge();
        } catch (e) { /* optional */ }
        const serverDir = resolveMcServerDir(mode);
        const paperJar = path.join(serverDir, 'paper.jar');
        if (!fs.existsSync(paperJar)) {
            const err = `ยังไม่ได้ติดตั้งเซิร์ฟ ${worldModeLabel(mode)} — กดติดตั้ง/เปิดจากหน้าเกมนี้`;
            endMcJob(false, err, err);
            return {
                success: false,
                error: err,
                ...getMcServerStatus({ world: mode })
            };
        }
        setMcProgress({ phase: 'world', message: 'ตั้งค่าโลก / RCON…', percent: 20 });
        const world = applyWorldMode(serverDir, mode);
        writePluginGameMode(serverDir, mode);
        if (mode === 'restaurant') copyFarmersDelightJar(serverDir);
        ensureRconEnabled(serverDir);
        setMcProgress({ phase: 'resource_pack', message: 'ใช้ฟอนต์ Minecraft เดิม…', percent: 35 });
        clearResourcePack(serverDir);
        // กันโลก/ไฟล์ฟาร์มค้างในโฟลเดอร์ box ก่อนบูต (หลังแยกเซิร์ฟ)
        try {
            setMcProgress({ phase: 'purge', message: 'ทำความสะอาดโลกค้าง…', percent: 45 });
            await purgeForeignWorlds(serverDir, mode);
            wipeCrossModePluginData(serverDir, mode);
        } catch (e) {
            console.warn('[MC Server] pre-start purge:', e.message);
        }
        // sync plugin jar ล่าสุดเข้าโฟลเดอร์โหมดนี้
        const pluginSrc = resolvePluginJar();
        if (pluginSrc) {
            setMcProgress({ phase: 'plugin', message: 'ซิงก์ปลั๊กอิน…', percent: 55 });
            const pluginDest = path.join(serverDir, 'plugins', 'TokControlMinecraftBridge.jar');
            try {
                fs.mkdirSync(path.dirname(pluginDest), { recursive: true });
                fs.copyFileSync(pluginSrc, pluginDest);
            } catch (e) {
                console.warn('[MC Server] plugin sync:', e.message);
            }
        }
        const javaExe = resolveJavaExecutable(JAVA_REQUIRED);
        if (getJavaMajorVersion(javaExe) < JAVA_REQUIRED) {
            const err = `ต้องใช้ Java ${JAVA_REQUIRED}+ (Adoptium Temurin) ก่อนเริ่มเซิร์ฟเวอร์`;
            endMcJob(false, err, err);
            return {
                success: false,
                needJava: true,
                error: err,
                ...getMcServerStatus({ world: mode })
            };
        }
        const rt = readRuntimeConfig(serverDir);
        writeStartBat(serverDir, mode);
        setMcProgress({ phase: 'spawn', message: 'เปิดโปรเซส Paper…', percent: 75 });
        mcActiveMode = mode;
        mcServerProcess = spawn(javaExe, [
            `-Xms${rt.xmsMb}M`,
            `-Xmx${rt.xmxMb}M`,
            '-jar', 'paper.jar', 'nogui'
        ], {
            cwd: serverDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            windowsHide: true
        });
        mcServerProcess.stdout.on('data', (d) => {
            const line = String(d).trim();
            if (line) {
                console.log(`[MC ${mode}]`, line);
                if (/Done \(|For help, type/i.test(line)) {
                    setMcProgress({
                        phase: 'running',
                        message: `เซิร์ฟ ${worldModeLabel(mode)} พร้อมแล้ว`,
                        percent: 100
                    });
                } else if (/Preparing|Loading|Starting|Generating/i.test(line)) {
                    setMcProgress({
                        phase: 'booting',
                        message: line.slice(0, 120),
                        percent: Math.min(95, Math.max(78, Number(mcProgress.percent) || 78))
                    });
                }
            }
        });
        mcServerProcess.stderr.on('data', (d) => console.warn(`[MC ${mode}]`, String(d).trim()));
        mcServerProcess.on('exit', (code) => {
            console.log(`[MC ${mode}] exited`, code);
            mcServerProcess = null;
            mcActiveMode = null;
            if (mcProgress.active && mcProgress.job === 'start') {
                endMcJob(false, `เซิร์ฟปิดตัว (code ${code})`, `exited ${code}`);
            }
        });
        endMcJob(true, `เปิดเซิร์ฟ ${worldModeLabel(mode)} แล้ว — รอ Paper บูต`);
        return {
            success: true,
            path: serverDir,
            join: `localhost:${MC_GAME_PORT}`,
            bridge: `ws://127.0.0.1:${MC_BRIDGE_PORT}`,
            worldMode: mode,
            levelName: world.levelName,
            ...getMcServerStatus({ world: mode })
        };
    } catch (err) {
        endMcJob(false, err.message || 'เริ่มเซิร์ฟล้มเหลว', err.message);
        throw err;
    }
}

function stopMcServer() {
    if (!isMcServerRunning()) {
        killOrphanPaperProcesses();
        mcActiveMode = null;
        return { success: true, stopped: false };
    }
    try { mcServerProcess.kill('SIGTERM'); } catch (e) {}
    mcServerProcess = null;
    killOrphanPaperProcesses();
    mcActiveMode = null;
    return { success: true, stopped: true };
}

async function stopMcServerAsync() {
    return stopMcServerAndWait(12000);
}

async function resetMcServer(opts = {}) {
    await stopMcServerAndWait(12000);
    const mode = normalizeWorldMode(opts.world || opts.mode || 'box');
    const serverDir = resolveMcServerDir(mode);
    const worldName = levelNameForMode(mode);
    const worldDir = path.join(serverDir, worldName);
    const deleted = await deleteWorldDir(worldDir);
    if (!deleted) {
        console.warn('[MC Server] world folder still locked — plugin copy will continue');
    }
    // ลบโลกโหมดอื่นที่ค้างในโฟลเดอร์เดียวกัน (เช่น farm ใน box)
    const purged = await purgeForeignWorlds(serverDir, mode);
    wipeCrossModePluginData(serverDir, mode);
    wipeModeDecorFile(serverDir, mode);
    try {
        const bridge = require('./minecraft-bridge-server');
        bridge.stopMinecraftTestBridge();
    } catch (e) { /* optional */ }
    const result = await setupMcServer({ world: mode, skipStop: true });
    applyWorldMode(serverDir, mode);
    writePluginGameMode(serverDir, mode);
    return {
        ...result,
        worldMode: mode,
        levelName: worldName,
        worldDeleted: deleted,
        foreignWorldsPurged: purged
    };
}

module.exports = {
    resolveMcServerDir,
    resolveMcServersRoot,
    setupMcServer,
    startMcServer,
    stopMcServer,
    stopMcServerAsync,
    resetMcServer,
    getMcServerStatus,
    getMcProgress,
    getJavaStatus,
    downloadAndOpenJavaInstaller,
    saveMcRuntime,
    setCustomPaperJar,
    getServerPropertiesText,
    setServerPropertiesText,
    readRuntimeConfig,
    writeRuntimeConfig,
    probeMcPorts,
    isMcServerRunning,
    isPortOpen,
    ensureRconEnabled,
    applyWorldMode,
    getActiveWorldMode,
    normalizeWorldMode,
    worldModeLabel,
    levelNameForMode,
    REQUIRED_CLIENT,
    JAVA_REQUIRED,
    ADOPTIUM_PAGE,
    MC_GAME_PORT,
    MC_BRIDGE_PORT,
    MC_MODE_DIRS,
    MC_RESOURCE_PACK_URL,
    ensureKanitResourcePackZip,
    applyKanitResourcePack,
    clearResourcePack
};
