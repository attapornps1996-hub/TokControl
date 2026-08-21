/**
 * Watch Party — Control panel (main app tab)
 */
(function (global) {
    'use strict';

    const WP_STORAGE_KEY = 'tokcontrol_watch_party';
    const WP_BC = 'tokcontrol-watch-party-v1';

    const WP_LAYOUTS = [
        { id: 'fullyt', label: 'YouTube เต็มจอ' },
        { id: 'fullcam', label: 'Webcam เต็มจอ' },
        { id: 'side', label: 'คู่ขนาน 50/50' },
        { id: 'landscape', label: 'แนวนอน 68/32' },
        { id: 'portrait-stack', label: 'แนวตั้ง ซ้อน' },
        { id: 'portrait-pip', label: 'แนวตั้ง PiP' },
        { id: 'pip', label: 'PiP เล็ก' },
        { id: 'pip-lg', label: 'PiP ใหญ่' },
        { id: 'cam-main', label: 'Cam หลัก' },
        { id: 'stack', label: 'ซ้อนบน-ล่าง' }
    ];

    let wpBcListener = null;

    function getWpConfig() {
        try {
            const raw = localStorage.getItem(WP_STORAGE_KEY);
            if (raw) return { ...getWpDefaultConfig(), ...JSON.parse(raw) };
        } catch (e) {}
        return getWpDefaultConfig();
    }

    function getWpDefaultConfig() {
        return {
            layout: 'pip',
            camMode: 'webcam',
            avatarIdle: '',
            avatarTalk: '',
            usePngtuber: false
        };
    }

    function saveWpConfig(cfg) {
        localStorage.setItem(WP_STORAGE_KEY, JSON.stringify(cfg));
    }

    function wpBroadcast(msg) {
        try {
            const bc = new BroadcastChannel(WP_BC);
            bc.postMessage(msg);
            bc.close();
        } catch (e) {}
    }

    function getAdvConf() {
        if (typeof global.getAdvConf === 'function') return global.getAdvConf();
        if (global.advConf) return global.advConf;
        return null;
    }

    function resolvePngtuberImages(cfg) {
        const ac = getAdvConf();
        if (!cfg.usePngtuber || !ac?.pngtuber) return null;
        const pt = ac.pngtuber;
        const idle = pt.idleImage ? resolveAssetUrl(pt.idleImage) : '';
        const talk = pt.talkImage ? resolveAssetUrl(pt.talkImage) : '';
        if (!idle && !talk) return null;
        return { idle: idle || talk, talk: talk || idle };
    }

    function wpSyncAvatarToDisplay() {
        const cfg = getWpConfig();
        let idle = cfg.avatarIdle || '';
        let talk = cfg.avatarTalk || '';

        const fromPt = resolvePngtuberImages(cfg);
        if (fromPt) {
            idle = fromPt.idle;
            talk = fromPt.talk;
        }
        if (!idle && global.currentUser) {
            idle = global.currentUser.avatarUrl || global.currentUser.avatar || '';
        }
        if (!talk) talk = idle;

        wpBroadcast({
            type: 'set_avatar',
            camMode: cfg.camMode,
            avatarIdle: idle,
            avatarTalk: talk
        });
    }

    function resolveAssetUrl(url) {
        if (!url) return '';
        if (/^(https?:|data:|\/\/|\/)/i.test(url)) return url;
        return '/' + String(url).replace(/^\/+/, '');
    }

    function wpOpenDisplay(mode) {
        let qs = '?display=1';
        if (mode === 'landscape') qs += '&landscape=1';
        if (mode === 'portrait') qs += '&portrait=1';
        try {
            const { ipcRenderer } = (window.electron || {});
            ipcRenderer.send('open-watch-party-display', { landscape: mode === 'landscape', portrait: mode === 'portrait' });
            setTimeout(wpSyncAvatarToDisplay, 800);
            return;
        } catch (e) {}
        const sizes = {
            landscape: 'width=1920,height=1080',
            portrait: 'width=1080,height=1920',
            default: 'width=1280,height=720'
        };
        const w = sizes[mode] || sizes.default;
        window.open('/games/watch-party/index.html' + qs, 'wp-display', w);
        setTimeout(wpSyncAvatarToDisplay, 800);
    }

    function wpCopyOverlayLink(mode) {
        const routes = {
            landscape: 'watch-party/landscape',
            portrait: 'watch-party/portrait',
            default: 'watch-party'
        };
        const extras = {
            landscape: { layout: 'landscape', landscape: '1' },
            portrait: { layout: 'portrait-stack', portrait: '1' },
            default: {}
        };
        const key = mode || 'default';
        if (typeof copyOverlayRouteLink === 'function') {
            const labels = { landscape: 'Watch Party (แนวนอน)', portrait: 'Watch Party (แนวตั้ง)', default: 'Watch Party Overlay' };
            copyOverlayRouteLink(routes[key], extras[key], labels[key]);
        }
    }

    function wpSetLayout(layoutId) {
        const cfg = getWpConfig();
        cfg.layout = layoutId;
        saveWpConfig(cfg);
        wpBroadcast({ type: 'set_layout', layout: layoutId });
        renderWpPanel();
    }

    function wpSetCamMode(mode) {
        const cfg = getWpConfig();
        cfg.camMode = mode;
        saveWpConfig(cfg);
        wpSyncAvatarToDisplay();
        renderWpPanel();
    }

    function wpSetUsePngtuber(checked) {
        if (checked && typeof global.ensurePngTuberStore === 'function') {
            try { global.ensurePngTuberStore(); } catch (e) {}
        }
        const cfg = getWpConfig();
        cfg.usePngtuber = !!checked;
        saveWpConfig(cfg);
        wpSyncAvatarToDisplay();
        renderWpPanel();
    }

    function wpSaveAvatarUrls() {
        const cfg = getWpConfig();
        const usePt = document.getElementById('wpUsePngtuber')?.checked === true;
        cfg.usePngtuber = usePt;

        if (usePt) {
            const fromPt = resolvePngtuberImages(cfg);
            if (!fromPt) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'อวตาร', 'ยังไม่มีรูปในแท็บ Avatar — อัปโหลดรูป idle/talk ก่อน หรือยกเลิกติ๊ก PNGTuber');
                }
                return;
            }
        } else {
            cfg.avatarIdle = (document.getElementById('wpAvatarIdleUrl')?.value || '').trim();
            cfg.avatarTalk = (document.getElementById('wpAvatarTalkUrl')?.value || '').trim();
            if (!cfg.avatarIdle && !cfg.avatarTalk) {
                const fallback = global.currentUser?.avatarUrl || global.currentUser?.avatar || '';
                if (fallback) {
                    cfg.avatarIdle = fallback;
                    cfg.avatarTalk = fallback;
                } else {
                    if (typeof showCustomMsg === 'function') {
                        showCustomMsg('warning', 'อวตาร', 'กรุณาใส่ URL รูปอวตาร หรือเลือกใช้รูปจาก PNGTuber');
                    }
                    return;
                }
            }
        }

        if (cfg.camMode === 'webcam') cfg.camMode = 'avatar';
        saveWpConfig(cfg);
        wpSyncAvatarToDisplay();
        renderWpPanel();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'อวตาร', 'บันทึกและส่งไปยังจอแสดงผลแล้ว');
        }
    }

    function wpAddToQueue() {
        const input = document.getElementById('wpQueueInput');
        const url = (input?.value || '').trim();
        if (!url) return;
        wpBroadcast({ type: 'queue_add', url });
        if (input) input.value = '';
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'เพิ่มคิว', 'ส่งไปยังจอแสดงผลแล้ว');
    }

    function wpPlayPause() { wpBroadcast({ type: 'play_pause' }); }
    function wpPlayNext() { wpBroadcast({ type: 'play_next' }); }
    function wpPlayPrev() { wpBroadcast({ type: 'play_prev' }); }
    function wpToggleCam() { wpBroadcast({ type: 'toggle_cam' }); }
    function wpToggleMic() { wpBroadcast({ type: 'toggle_mic' }); }
    function wpRemoveFromQueue(idx) { wpBroadcast({ type: 'queue_remove', index: idx }); }
    function wpPlayQueueIndex(idx) { wpBroadcast({ type: 'play_index', index: idx }); }
    function wpRequestState() { wpBroadcast({ type: 'get_state' }); }

    function onWpState(msg) {
        if (!msg || msg.type !== 'state') return;
        const cfg = getWpConfig();
        if (msg.layout) cfg.layout = msg.layout;
        saveWpConfig(cfg);

        const statusEl = document.getElementById('wpStatusText');
        if (statusEl) {
            const lay = WP_LAYOUTS.find(l => l.id === msg.layout);
            const playing = msg.playing ? '▶ เล่นอยู่' : '⏸ หยุด';
            statusEl.textContent = `${playing} · ${lay ? lay.label : msg.layout} · คิว ${(msg.queue || []).length} รายการ`;
        }
        renderWpQueue(msg.queue || [], msg.current ?? -1, msg.playing);
        renderWpPanel();
    }

    function renderWpQueue(queue, current, playing) {
        const list = document.getElementById('wpQueueList');
        if (!list) return;
        if (!queue.length) {
            list.innerHTML = '<p class="wp-queue-empty">ยังไม่มีวิดีโอในคิว — เพิ่ม YouTube URL ด้านบน</p>';
            return;
        }
        list.innerHTML = queue.map((vid, i) => `
            <div class="wp-queue-item${i === current ? ' is-active' : ''}">
                <img src="https://img.youtube.com/vi/${vid.id}/mqdefault.jpg" alt="" loading="lazy">
                <div class="wp-queue-meta">
                    <div class="wp-queue-title">${esc(vid.title)}</div>
                    <div class="wp-queue-id">${vid.id}${i === current ? (playing ? ' · ▶' : ' · ⏸') : ''}</div>
                </div>
                <button type="button" class="wp-queue-play" onclick="wpPlayQueueIndex(${i})" title="เล่น">▶</button>
                <button type="button" class="wp-queue-del" onclick="wpRemoveFromQueue(${i})" title="ลบ">✕</button>
            </div>
        `).join('');
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderWpPanel() {
        const cfg = getWpConfig();
        document.querySelectorAll('.wp-layout-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === cfg.layout);
        });
        document.querySelectorAll('.wp-cammode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === cfg.camMode);
        });
        const idleEl = document.getElementById('wpAvatarIdleUrl');
        const talkEl = document.getElementById('wpAvatarTalkUrl');
        const ptCb = document.getElementById('wpUsePngtuber');
        if (idleEl && !idleEl.matches(':focus')) idleEl.value = cfg.avatarIdle || '';
        if (talkEl && !talkEl.matches(':focus')) talkEl.value = cfg.avatarTalk || '';
        if (ptCb) ptCb.checked = !!cfg.usePngtuber;
        const prev = document.getElementById('wpAvatarPreview');
        if (prev) {
            let src = cfg.avatarIdle;
            const fromPt = resolvePngtuberImages(cfg);
            if (fromPt) src = fromPt.idle;
            if (!src && global.currentUser?.avatarUrl) src = global.currentUser.avatarUrl;
            prev.src = src || `https://api.dicebear.com/7.x/avataaars/svg?seed=wp&backgroundColor=bc13fe`;
        }
    }

    function initWpPanel() {
        if (wpBcListener) return;
        try {
            wpBcListener = new BroadcastChannel(WP_BC);
            wpBcListener.onmessage = (e) => onWpState(e.data);
        } catch (e) {}
        const frame = document.getElementById('wpPreviewFrame');
        if (frame && (frame.src === 'about:blank' || !frame.src)) {
            frame.src = frame.getAttribute('data-src') || '/games/watch-party/index.html?display=1&embed=1&mute=1';
        }
        renderWpPanel();
        wpSyncAvatarToDisplay();
        wpRequestState();
        setInterval(wpRequestState, 2500);
    }

    global.getWpConfig = getWpConfig;
    global.saveWpConfig = saveWpConfig;
    global.wpOpenDisplay = wpOpenDisplay;
    global.wpCopyOverlayLink = wpCopyOverlayLink;
    global.wpSetLayout = wpSetLayout;
    global.wpSetCamMode = wpSetCamMode;
    global.wpSetUsePngtuber = wpSetUsePngtuber;
    global.wpSaveAvatarUrls = wpSaveAvatarUrls;
    global.wpSyncAvatarToDisplay = wpSyncAvatarToDisplay;
    global.wpAddToQueue = wpAddToQueue;
    global.wpPlayPause = wpPlayPause;
    global.wpPlayNext = wpPlayNext;
    global.wpPlayPrev = wpPlayPrev;
    global.wpToggleCam = wpToggleCam;
    global.wpToggleMic = wpToggleMic;
    global.wpRemoveFromQueue = wpRemoveFromQueue;
    global.wpPlayQueueIndex = wpPlayQueueIndex;
    global.renderWpPanel = renderWpPanel;
    global.initWpPanel = initWpPanel;

})(typeof window !== 'undefined' ? window : global);
