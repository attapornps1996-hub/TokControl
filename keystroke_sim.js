/**
 * Windows keystroke simulation for Actions & Events.
 * Basic mode: SendInput via PowerShell (works for most apps).
 * Game mode: AutoIt Send if AutoIt3.exe is on PATH / Program Files.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VK = {
    ENTER: 0x0d,
    SPACE: 0x20,
    ESC: 0x1b,
    ESCAPE: 0x1b,
    TAB: 0x09,
    BACKSPACE: 0x08,
    BREAK: 0x03,
    CAPSLOCK: 0x14,
    DELETE: 0x2e,
    DEL: 0x2e,
    UP: 0x26,
    DOWN: 0x28,
    LEFT: 0x25,
    RIGHT: 0x27,
    END: 0x23,
    HOME: 0x24,
    INSERT: 0x2d,
    CTRL: 0x11,
    CONTROL: 0x11,
    ALT: 0x12,
    SHIFT: 0x10,
    F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73,
    F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77,
    F9: 0x78, F10: 0x79, F11: 0x7a, F12: 0x7b
};

function findAutoIt() {
    const candidates = [
        process.env.AUTOIT3_PATH,
        'C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe',
        'C:\\Program Files\\AutoIt3\\AutoIt3.exe'
    ].filter(Boolean);
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch (e) { /* ignore */ }
    }
    return null;
}

function parseSequence(sequence) {
    const tokens = [];
    const s = String(sequence || '');
    let i = 0;
    while (i < s.length) {
        if (s[i] === '{') {
            const end = s.indexOf('}', i + 1);
            if (end === -1) {
                tokens.push({ type: 'char', value: s[i] });
                i += 1;
                continue;
            }
            const raw = s.slice(i + 1, end).trim().toUpperCase().replace(/\s+/g, '');
            if (raw === 'LCLICK' || raw === 'LEFTCLICK' || raw === 'LEFTMOUSECLICK') {
                tokens.push({ type: 'mouse', button: 'left' });
            } else if (raw === 'RCLICK' || raw === 'RIGHTCLICK' || raw === 'RIGHTMOUSECLICK') {
                tokens.push({ type: 'mouse', button: 'right' });
            } else if (VK[raw] != null) {
                tokens.push({ type: 'vk', code: VK[raw], name: raw });
            } else if (/^F([1-9]|1[0-2])$/.test(raw) && VK[raw] != null) {
                tokens.push({ type: 'vk', code: VK[raw], name: raw });
            } else {
                tokens.push({ type: 'char', value: s.slice(i, end + 1) });
            }
            i = end + 1;
            continue;
        }
        tokens.push({ type: 'char', value: s[i] });
        i += 1;
    }
    return tokens;
}

function escapePsSingle(str) {
    return String(str || '').replace(/'/g, "''");
}

function charToVkAction(ch) {
    const c = String(ch || '');
    if (!c) return null;
    const code = c.charCodeAt(0);
    if (code >= 97 && code <= 122) return { kind: 'vk', code: 0x41 + (code - 97), shift: false };
    if (code >= 65 && code <= 90) return { kind: 'vk', code: 0x41 + (code - 65), shift: true };
    if (code >= 48 && code <= 57) return { kind: 'vk', code, shift: false };
    const extras = {
        ' ': { kind: 'vk', code: 0x20 },
        '\n': { kind: 'vk', code: 0x0d },
        '\r': { kind: 'vk', code: 0x0d },
        '\t': { kind: 'vk', code: 0x09 },
        '.': { kind: 'vk', code: 0xbe },
        ',': { kind: 'vk', code: 0xbc },
        '-': { kind: 'vk', code: 0xbd },
        '=': { kind: 'vk', code: 0xbb },
        ';': { kind: 'vk', code: 0xba },
        '/': { kind: 'vk', code: 0xbf },
        '`': { kind: 'vk', code: 0xc0 },
        '[': { kind: 'vk', code: 0xdb },
        '\\': { kind: 'vk', code: 0xdc },
        ']': { kind: 'vk', code: 0xdd },
        "'": { kind: 'vk', code: 0xde }
    };
    return extras[c] || { kind: 'unicode', text: c };
}

function tokensToActions(tokens) {
    const actions = [];
    for (const t of tokens) {
        if (t.type === 'mouse') {
            actions.push({ kind: 'mouse', button: t.button });
        } else if (t.type === 'vk') {
            actions.push({ kind: 'vk', code: t.code });
        } else if (t.type === 'char') {
            const mapped = charToVkAction(t.value);
            if (mapped) actions.push(mapped);
        }
    }
    return actions;
}

function buildSendInputScript(tokens, opts) {
    const holdMs = Math.max(10, Math.min(5000, parseInt(opts.holdMs, 10) || 100));
    const mods = [];
    if (opts.ctrl) mods.push(0x11);
    if (opts.alt) mods.push(0x12);
    if (opts.shift) mods.push(0x10);
    const actions = tokensToActions(tokens);
    const payload = JSON.stringify({ holdMs, mods, actions }).replace(/'/g, "''");

    return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TokKeySim {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern short VkKeyScan(char ch);
  public const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  static bool IsExtended(byte vk) {
    return vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 || vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 || vk == 0x2D || vk == 0x2E;
  }
  public static void KeyDown(byte vk) {
    byte scan = (byte)MapVirtualKey(vk, 0);
    uint flags = IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
    keybd_event(vk, scan, flags, UIntPtr.Zero);
  }
  public static void KeyUp(byte vk) {
    byte scan = (byte)MapVirtualKey(vk, 0);
    uint flags = KEYEVENTF_KEYUP | (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
    keybd_event(vk, scan, flags, UIntPtr.Zero);
  }
  public static void Unicode(char c) {
    short mapped = VkKeyScan(c);
    if (mapped != -1) {
      byte vk = (byte)(mapped & 0xFF);
      bool needShift = ((mapped >> 8) & 1) != 0;
      if (needShift) KeyDown(0x10);
      KeyDown(vk); KeyUp(vk);
      if (needShift) KeyUp(0x10);
      return;
    }
    keybd_event(0, (byte)c, 4, UIntPtr.Zero);
    keybd_event(0, (byte)c, 6, UIntPtr.Zero);
  }
  public static void MouseClick(bool right) {
    uint down = right ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    uint up = right ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    mouse_event(down, 0, 0, 0, UIntPtr.Zero);
    mouse_event(up, 0, 0, 0, UIntPtr.Zero);
  }
}
"@
$cfg = '${payload}' | ConvertFrom-Json
$hold = [int]$cfg.holdMs
foreach ($m in @($cfg.mods)) { if ($null -ne $m) { [TokKeySim]::KeyDown([byte]$m) } }
foreach ($a in @($cfg.actions)) {
  if ($a.kind -eq 'mouse') {
    [TokKeySim]::MouseClick(($a.button -eq 'right'))
  } elseif ($a.kind -eq 'vk') {
    if ([bool]$a.shift) { [TokKeySim]::KeyDown(0x10) }
    $vk = [byte]$a.code
    [TokKeySim]::KeyDown($vk)
    Start-Sleep -Milliseconds $hold
    [TokKeySim]::KeyUp($vk)
    if ([bool]$a.shift) { [TokKeySim]::KeyUp(0x10) }
  } elseif ($a.kind -eq 'unicode') {
    foreach ($ch in $a.text.ToCharArray()) {
      [TokKeySim]::Unicode($ch)
      Start-Sleep -Milliseconds ([Math]::Max(12, [int]($hold / 4)))
    }
  }
}
foreach ($m in @($cfg.mods | Sort-Object -Descending)) { if ($null -ne $m) { [TokKeySim]::KeyUp([byte]$m) } }
`;
}

function buildAutoItScript(tokens, opts) {
    const holdMs = Math.max(10, Math.min(5000, parseInt(opts.holdMs, 10) || 100));
    const lines = [`Opt("SendKeyDelay", ${holdMs})`];
    const prefix = [];
    const suffix = [];
    if (opts.ctrl) { prefix.push('{CTRLDOWN}'); suffix.unshift('{CTRLUP}'); }
    if (opts.alt) { prefix.push('{ALTDOWN}'); suffix.unshift('{ALTUP}'); }
    if (opts.shift) { prefix.push('{SHIFTDOWN}'); suffix.unshift('{SHIFTUP}'); }
    if (prefix.length) lines.push(`Send("${prefix.join('')}")`);

    let buf = '';
    const flushBuf = () => {
        if (!buf) return;
        const escaped = buf.replace(/"/g, '""');
        lines.push(`Send("${escaped}")`);
        buf = '';
    };
    for (const t of tokens) {
        if (t.type === 'mouse') {
            flushBuf();
            lines.push(`MouseClick("${t.button === 'right' ? 'right' : 'left'}")`);
        } else if (t.type === 'vk') {
            flushBuf();
            const map = {
                ENTER: '{ENTER}', SPACE: '{SPACE}', ESC: '{ESC}', ESCAPE: '{ESC}',
                TAB: '{TAB}', BACKSPACE: '{BACKSPACE}', DELETE: '{DELETE}', DEL: '{DELETE}',
                UP: '{UP}', DOWN: '{DOWN}', LEFT: '{LEFT}', RIGHT: '{RIGHT}',
                HOME: '{HOME}', END: '{END}', INSERT: '{INSERT}',
                F1: '{F1}', F2: '{F2}', F3: '{F3}', F4: '{F4}', F5: '{F5}', F6: '{F6}',
                F7: '{F7}', F8: '{F8}', F9: '{F9}', F10: '{F10}', F11: '{F11}', F12: '{F12}'
            };
            const key = map[t.name];
            if (key) lines.push(`Send("${key}")`);
        } else if (t.type === 'char') {
            const ch = t.value;
            if (ch === '!') buf += '{!}';
            else if (ch === '+') buf += '{+}';
            else if (ch === '^') buf += '{^}';
            else if (ch === '#') buf += '{#}';
            else if (ch === '{') buf += '{{}';
            else if (ch === '}') buf += '{}}';
            else buf += ch;
        }
    }
    flushBuf();
    if (suffix.length) lines.push(`Send("${suffix.join('')}")`);
    return lines.join('\n') + '\n';
}

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const tmp = path.join(os.tmpdir(), 'tokcontrol-keys-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.ps1');
        fs.writeFile(tmp, '\uFEFF' + script, 'utf8', (err) => {
            if (err) return reject(err);
            const child = spawn('powershell.exe', [
                '-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp
            ], { windowsHide: true });
            let stderr = '';
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('close', (code) => {
                fs.unlink(tmp, () => {});
                if (code === 0) resolve({ ok: true });
                else reject(new Error(stderr.trim() || ('PowerShell exit ' + code)));
            });
            child.on('error', (e) => {
                fs.unlink(tmp, () => {});
                reject(e);
            });
        });
    });
}

function runAutoIt(script) {
    const exe = findAutoIt();
    if (!exe) return Promise.reject(new Error('ไม่พบ AutoIt3.exe — ติดตั้ง AutoIt หรือปิดโหมดเกม'));
    return new Promise((resolve, reject) => {
        const tmp = path.join(os.tmpdir(), 'tokcontrol-keys-' + Date.now() + '.au3');
        fs.writeFile(tmp, script, 'utf8', (err) => {
            if (err) return reject(err);
            const child = spawn(exe, [tmp], { windowsHide: true });
            let stderr = '';
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('close', (code) => {
                fs.unlink(tmp, () => {});
                if (code === 0) resolve({ ok: true, mode: 'autoit' });
                else reject(new Error(stderr.trim() || ('AutoIt exit ' + code)));
            });
            child.on('error', (e) => {
                fs.unlink(tmp, () => {});
                reject(e);
            });
        });
    });
}

async function simulateKeystrokes(opts) {
    opts = opts || {};
    if (process.platform !== 'win32') {
        throw new Error('จำลองคีย์บอร์ดรองรับเฉพาะ Windows');
    }
    const sequence = String(opts.sequence || '');
    if (!sequence.trim()) throw new Error('ยังไม่ได้ตั้งค่าคีย์ที่จะกด');
    const tokens = parseSequence(sequence);
    if (!tokens.length) throw new Error('ลำดับคีย์ว่าง');

    const flags = {
        ctrl: !!opts.ctrl,
        alt: !!opts.alt,
        shift: !!opts.shift,
        holdMs: opts.holdMs
    };

    if (opts.gameMode) {
        try {
            return await runAutoIt(buildAutoItScript(tokens, flags));
        } catch (e) {
            // Fall back to SendInput if AutoIt missing
            if (!findAutoIt()) {
                const result = await runPowerShell(buildSendInputScript(tokens, flags));
                return { ...result, mode: 'sendinput-fallback', warning: e.message };
            }
            throw e;
        }
    }
    const result = await runPowerShell(buildSendInputScript(tokens, flags));
    return { ...result, mode: 'sendinput' };
}

module.exports = {
    simulateKeystrokes,
    parseSequence,
    findAutoIt
};
