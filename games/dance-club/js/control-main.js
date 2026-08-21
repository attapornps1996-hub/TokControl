/**
 * Dance Club — control / settings page (remote panel).
 */
import { createSync } from './sync.js';
import { bindControlPanel } from './hud-bindings.js';
import { bindSpotifyPanel } from './spotify-control.js';

const sync = createSync('client');
const $ = (id) => document.getElementById(id);

let connected = false;
let pingTimer = null;
let openingView = false;
let hud = null;

function showBootError(err) {
    console.error('Dance Club control init failed:', err);
    const el = $('dcConnStatus');
    if (el) {
        el.textContent = 'โหลดแผงตั้งค่าไม่สำเร็จ — รีเฟรช (F5)';
        el.style.color = '#ff6b81';
    }
}

function openView() {
    if (openingView) return;
    openingView = true;
    setTimeout(() => { openingView = false; }, 1500);

    try {
        if (window.parent && window.parent !== window && typeof window.parent.dcOpenGame === 'function') {
            window.parent.dcOpenGame();
            setTimeout(() => sync.ping(), 800);
            return;
        }
    } catch (e) { /* cross-origin ignore */ }

    if (window.PandyBridge?.openDanceClubGame) {
        window.PandyBridge.openDanceClubGame();
        setTimeout(() => sync.ping(), 800);
        return;
    }

    const url = new URL('index.html', location.href).href;
    const w = window.open(url, 'dc-view', 'width=1100,height=720');
    if (w) {
        try { w.focus(); } catch { /* ignore */ }
    }
    setTimeout(() => sync.ping(), 800);
}

function setControlPanel(panel) {
    if (!panel) return;
    document.querySelectorAll('.dc-panel-section').forEach((sec) => {
        sec.classList.toggle('active', sec.dataset.panel === panel);
    });
    document.querySelectorAll('#dcDrawerTabs button[data-panel]').forEach((b) => {
        b.classList.toggle('active', b.dataset.panel === panel);
    });
}

function wireFallbackUi() {
    $('dcOpenView')?.addEventListener('click', openView);

    document.getElementById('dcDrawerTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-panel]');
        if (!btn) return;
        setControlPanel(btn.dataset.panel);
    });

    document.getElementById('dcSourceTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-src]');
        if (!btn) return;
        const src = btn.dataset.src;
        document.querySelectorAll('#dcSourceTabs .dc-tab').forEach((t) => {
            t.classList.toggle('active', t === btn);
        });
        document.querySelectorAll('[data-body]').forEach((body) => {
            body.hidden = body.dataset.body !== src;
        });
    });

    window.addEventListener('message', (ev) => {
        const data = ev?.data;
        if (!data || data.type !== 'dc-set-panel') return;
        setControlPanel(data.panel);
    });

    try {
        const panel = new URLSearchParams(location.search).get('panel');
        if (panel) setControlPanel(panel);
    } catch (e) {}
}

try {
    hud = bindControlPanel({
        sync,
        isConnected: () => connected,
        onToast: (t) => {
            const el = $('dcConnStatus');
            if (el && t) {
                el.textContent = t;
                setTimeout(() => {
                    if (el.classList.contains('on')) el.textContent = 'เชื่อมต่อหน้าแสดงผลแล้ว';
                }, 2000);
            }
        }
    });
} catch (err) {
    showBootError(err);
}

try {
    bindSpotifyPanel({
        onToast: (t) => {
            const el = $('dcConnStatus');
            if (el && t) {
                el.textContent = t;
                setTimeout(() => {
                    if (el.classList.contains('on')) el.textContent = 'เชื่อมต่อหน้าแสดงผลแล้ว';
                }, 2200);
            }
        }
    });
} catch (err) {
    console.error('Spotify panel init failed:', err);
    const badge = $('dcSpBadge');
    if (badge) {
        badge.className = 'dc-spotify-badge off';
        badge.textContent = '● โหลด Spotify ไม่สำเร็จ';
    }
}

wireFallbackUi();

sync.on((msg) => {
    if (msg.type === 'state' && msg.role === 'host') {
        connected = true;
        hud?.applyRemoteState?.(msg.state);
    } else if (msg.type === 'pong' && msg.role === 'host') {
        connected = true;
        const el = $('dcConnStatus');
        if (el) {
            el.textContent = 'เชื่อมต่อหน้าแสดงผลแล้ว';
            el.classList.add('on');
        }
    }
});

pingTimer = setInterval(() => {
    sync.ping();
    if (!connected) {
        const el = $('dcConnStatus');
        if (el && !el.classList.contains('on')) {
            el.textContent = 'รอเชื่อมต่อ… กด "เปิดหน้าแสดงผล"';
        }
    }
}, 2000);

window.DanceClubControl = { sync, openView };
