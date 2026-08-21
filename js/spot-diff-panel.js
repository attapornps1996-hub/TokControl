/**
 * จับผิดภาพ — Panel (REPO layout) + admin level editor
 */
(function (global) {
    'use strict';

    const SD_STORAGE_KEY = 'tokcontrol_spot_diff';
    const SD_ACTIONS = {
        hint:        { icon: '💡', label: 'ใบ้ (ไฮไลท์จุด)', type: 'help' },
        reveal:      { icon: '🎯', label: 'เฉลยทั้งหมด', type: 'help' },
        add_time:    { icon: '⏱️', label: 'เพิ่มเวลา (+15วิ)', type: 'help' },
        reduce_time: { icon: '😈', label: 'ลดเวลา (-10วิ)', type: 'troll' },
        new_round:   { icon: '🔄', label: 'ภาพใหม่', type: 'help' },
        add_diff:    { icon: '😈', label: 'เพิ่มจุดผิด +1', type: 'troll' }
    };

    let pendingUpload = null;
    let markDraft = { levelId: '', marks: [], radius: 0.05, selectedIdx: -1 };
    let renderSeq = 0;
    let didMigrate = false;

    async function migrateLegacyImages() {
        if (didMigrate || !store()) return;
        didMigrate = true;
        const cfg = getSdConfig();
        let changed = false;
        for (const lv of (cfg.levels || [])) {
            for (const side of ['left', 'right']) {
                const field = side === 'right' ? 'rightUrl' : 'leftUrl';
                const ref = lv[field];
                if (!ref || store().isIdbRef(ref)) continue;
                try {
                    const res = await fetch(ref);
                    if (!res.ok) throw new Error('bad');
                    const blob = await res.blob();
                    if (!blob.type || !blob.type.startsWith('image')) throw new Error('not image');
                    const saved = await store().putLevelImage(lv.id, side, blob);
                    lv[field] = saved.key;
                    changed = true;
                } catch (e) {
                    lv[field] = '';
                    changed = true;
                }
            }
        }
        if (changed) {
            saveSdConfig(cfg);
            persistLevelsForGame(cfg);
            renderSdLevels();
        }
    }

    function store() {
        return global.SpotDiffStore || null;
    }

    function isSdAdmin() {
        try {
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
        } catch (e) {}
        const u = global.currentUser;
        if (u && u.isLoggedIn && (u.role === 'admin' || u.isAdmin === true || u.isAdmin === 1)) return true;
        const view = document.getElementById('gcSpotDiffView');
        if (view && view.classList.contains('is-admin')) return true;
        return false;
    }

    function getSdConfig() {
        try {
            const raw = localStorage.getItem(SD_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed.levels)) parsed.levels = [];
                parsed.levels = parsed.levels.map(sanitizeLevelForStorage);
                return parsed;
            }
        } catch (e) {}
        return getSdDefaultConfig();
    }

    function sanitizeLevelForStorage(lv) {
        const copy = { ...(lv || {}) };
        // never persist huge data URLs in localStorage
        if (typeof copy.leftUrl === 'string' && copy.leftUrl.startsWith('data:')) copy.leftUrl = '';
        if (typeof copy.rightUrl === 'string' && copy.rightUrl.startsWith('data:')) copy.rightUrl = '';
        return copy;
    }

    function getSdDefaultConfig() {
        return {
            installed: true,
            enabled: false,
            mode: 'normal',
            levels: [],
            triggers: [
                { id: 1, enabled: true, giftName: 'Rose', giftId: '', action: 'hint', amount: 1 },
                { id: 2, enabled: true, giftName: 'TikTok', giftId: '', action: 'reveal', amount: 1 },
                { id: 3, enabled: true, giftName: '', giftId: '', action: 'add_time', amount: 15 }
            ]
        };
    }

    function saveSdConfig(cfg) {
        const safe = { ...cfg, levels: (cfg.levels || []).map(sanitizeLevelForStorage) };
        try {
            localStorage.setItem(SD_STORAGE_KEY, JSON.stringify(safe));
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'บันทึกด่านไม่ได้', e.message || 'localStorage เต็ม');
            }
            throw e;
        }
    }

    function playableLevels(cfg) {
        return (cfg.levels || []).filter((lv) => lv && lv.leftUrl && lv.rightUrl && Array.isArray(lv.marks) && lv.marks.length);
    }

    function persistLevelsForGame(cfg) {
        try {
            localStorage.setItem('sd_game_levels', JSON.stringify((cfg.levels || []).map(sanitizeLevelForStorage)));
        } catch (e) {}
    }

    function sdOpenGame() {
        const cfg = getSdConfig();
        const ready = playableLevels(cfg);
        let mode = cfg.mode || 'normal';
        if (ready.length) mode = 'custom';
        if (mode === 'custom' && !ready.length) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('warning', 'ยังไม่มีด่าน', 'อัปโหลดภาพซ้าย-ขวา แล้วกำหนดเฉลยอย่างน้อย 1 ด่าน');
            }
            mode = 'normal';
        }
        localStorage.setItem('sd_game_mode', mode);
        persistLevelsForGame(cfg);
        syncSdToGame({ mode, reset: true, levels: cfg.levels || [] });
        try {
            const { ipcRenderer } = (window.electron || {});
            ipcRenderer.send('open-spot-diff-game');
            return;
        } catch (e) {}
        window.open('/games/spot-diff/index.html', '_blank', 'width=1100,height=760');
    }

    function sdCopyOverlayLink() {
        if (typeof copyOverlayRouteLink === 'function') {
            copyOverlayRouteLink('spot-diff', {}, 'จับผิดภาพ Overlay');
        }
    }

    function sdSetMode(mode) {
        const cfg = getSdConfig();
        cfg.mode = mode;
        saveSdConfig(cfg);
        localStorage.setItem('sd_game_mode', mode);
        persistLevelsForGame(cfg);
        syncSdToGame({ mode, levels: cfg.levels || [] });
        renderSdProfile();
        if (mode === 'custom') switchSdSection('levels');
    }

    function sdToggleEnabled(checked) {
        const cfg = getSdConfig();
        cfg.enabled = !!checked;
        saveSdConfig(cfg);
        if (checked && typeof setActiveGameModId === 'function') {
            setActiveGameModId('spot-diff');
        }
        if (typeof setGameLiveActive === 'function' && checked) {
            setGameLiveActive('spot-diff', true);
        }
    }

    function syncSdToGame(payload) {
        const token = (global.currentUser && global.currentUser.streamToken) || '';
        if (typeof socket !== 'undefined' && socket && socket.connected && token) {
            socket.emit('spot_diff_sync', { token, ...payload });
        }
    }

    function handleSdGift(gift) {
        if (typeof isAppPro === 'function' && !isAppPro()) return false;
        const cfg = getSdConfig();
        if (!cfg.enabled) return false;
        if (!cfg.triggers || !cfg.triggers.length) return false;

        for (const tr of cfg.triggers) {
            if (tr.enabled === false) continue;
            const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
            const matchName = tr.giftName && (gift.giftName || '').toLowerCase().trim() === tr.giftName.toLowerCase().trim();
            if (!matchId && !matchName) continue;

            const action = tr.action || 'hint';
            const amount = tr.amount || (action === 'add_time' ? 15 : action === 'reduce_time' ? 10 : 1);
            const user = gift.uniqueId || gift.nickname || 'viewer';
            fireSdAction(action, user, amount);
            if (typeof logToDashboard === 'function') {
                const meta = SD_ACTIONS[action] || { label: action };
                logToDashboard(`🔍 จับผิดภาพ: @${user} → ${meta.label}`, meta.type === 'troll' ? '#ff6b81' : '#2ecc71');
            }
            return true;
        }
        return false;
    }

    function fireSdAction(action, user, amount) {
        const token = (global.currentUser && global.currentUser.streamToken) || '';
        if (typeof socket !== 'undefined' && socket && socket.connected && token) {
            socket.emit('spot_diff_action', { token, action, user, amount });
        }
    }

    function sdAddTrigger() {
        const cfg = getSdConfig();
        if (!cfg.triggers) cfg.triggers = [];
        cfg.triggers.push({ id: Date.now(), enabled: true, giftName: '', giftId: '', action: 'hint', amount: 1 });
        saveSdConfig(cfg);
        renderSdTriggers();
    }

    function sdRemoveTrigger(id) {
        const cfg = getSdConfig();
        cfg.triggers = (cfg.triggers || []).filter(t => t.id !== id);
        saveSdConfig(cfg);
        renderSdTriggers();
    }

    function sdUpdateTrigger(id, key, val) {
        const cfg = getSdConfig();
        const tr = (cfg.triggers || []).find(t => t.id === id);
        if (tr) { tr[key] = val; saveSdConfig(cfg); }
    }

    function sdOpenGiftPickerForTrigger(id) {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญสำหรับทริกเกอร์',
            onSelect: (gift) => {
                sdUpdateTrigger(id, 'giftName', gift.giftName);
                sdUpdateTrigger(id, 'giftId', String(gift.giftId));
                renderSdTriggers();
            }
        });
    }

    function renderSdTriggers() {
        const list = document.getElementById('sdTriggerList');
        if (!list) return;
        const cfg = getSdConfig();
        const triggers = cfg.triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p style="font-size:0.78rem;color:#666;font-family:Kanit;">ยังไม่มีทริกเกอร์ — เพิ่มเพื่อให้ผู้ชมส่งของขวัญช่วยใบ้/เฉลย/เพิ่มเวลา</p>';
            return;
        }
        const actionOpts = (selected) => Object.entries(SD_ACTIONS).map(([k, v]) =>
            `<option value="${k}"${k === selected ? ' selected' : ''}>${v.icon} ${v.label}</option>`
        ).join('');
        list.innerHTML = triggers.map(tr => `
            <div class="mm-trigger-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
                <button type="button" class="gp-btn-secondary" style="font-size:0.72rem;padding:6px 10px;" onclick="sdOpenGiftPickerForTrigger(${tr.id})">🎁 ${(tr.giftName || 'เลือกของขวัญ').replace(/</g,'&lt;')}</button>
                <select onchange="sdUpdateTrigger(${tr.id},'action',this.value)"
                    style="padding:6px 8px;border-radius:8px;background:#07070a;border:1px solid #202025;color:#fff;font-family:Kanit;font-size:0.78rem;">
                    ${actionOpts(tr.action || 'hint')}
                </select>
                <input type="number" min="1" max="120" value="${tr.amount || 15}" title="จำนวน (วินาทีสำหรับเวลา)"
                    onchange="sdUpdateTrigger(${tr.id},'amount',parseInt(this.value)||1)"
                    style="width:56px;padding:6px;border-radius:8px;background:#07070a;border:1px solid #202025;color:#fff;font-family:Kanit;font-size:0.78rem;">
                <button type="button" onclick="sdRemoveTrigger(${tr.id})"
                    style="padding:4px 10px;border-radius:8px;background:rgba(255,71,87,0.15);border:1px solid #ff4757;color:#ff6b81;cursor:pointer;font-size:0.78rem;">✕</button>
            </div>
        `).join('');
    }

    function escapeAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function switchSdTopTab(tab) {
        const settings = document.getElementById('sdSettingsPanel');
        const trigger = document.getElementById('sdTriggerPanel');
        document.getElementById('sdTabSettings')?.classList.toggle('active', tab === 'settings');
        document.getElementById('sdTabTrigger')?.classList.toggle('active', tab === 'trigger');
        if (settings) settings.style.display = tab === 'settings' ? 'flex' : 'none';
        if (trigger) trigger.style.display = tab === 'trigger' ? 'flex' : 'none';
        if (tab === 'trigger') renderSdTriggers();
    }

    function switchSdSection(section) {
        switchSdTopTab('settings');
        ['play', 'levels'].forEach((key) => {
            const cap = key === 'play' ? 'Play' : 'Levels';
            document.getElementById(`sdSection${cap}`)?.classList.toggle('active', key === section);
            document.getElementById(`sdNav${cap}`)?.classList.toggle('active', key === section);
        });
        if (section === 'levels') renderSdLevels();
    }

    async function fillDropPreview(btn, ref) {
        if (!btn) return;
        const img = btn.querySelector('img');
        btn.classList.remove('has-img');
        if (img) img.removeAttribute('src');
        if (!ref || !store()) return;
        const url = await store().resolveImageUrl(ref);
        if (!url || !img) return;
        img.onload = () => btn.classList.add('has-img');
        img.onerror = () => btn.classList.remove('has-img');
        img.src = url;
    }

    function renderSdLevels() {
        const list = document.getElementById('sdLevelList');
        if (!list) return;
        const cfg = getSdConfig();
        const levels = cfg.levels || [];
        const seq = ++renderSeq;
        if (!levels.length) {
            list.innerHTML = `
                <button type="button" class="sd-level-empty" id="sdEmptyAddBtn">
                    <strong>ยังไม่มีด่าน</strong>
                    <span>คลิกที่นี่เพื่อสร้างด่านแรก แล้วอัปโหลดภาพซ้าย–ขวา</span>
                </button>`;
            document.getElementById('sdEmptyAddBtn')?.addEventListener('click', (ev) => {
                ev.preventDefault();
                sdAddLevel();
            });
            return;
        }
        list.innerHTML = levels.map((lv, i) => {
            const marks = Array.isArray(lv.marks) ? lv.marks.length : 0;
            const ready = !!(lv.leftUrl && lv.rightUrl && marks > 0);
            return `
            <article class="sd-level-card" data-id="${escapeAttr(lv.id)}">
                <div class="sd-level-card-head">
                    <input type="text" class="field-ui" value="${escapeAttr(lv.name || ('ด่าน ' + (i + 1)))}"
                        onchange="sdUpdateLevel('${lv.id}','name',this.value)" placeholder="ชื่อด่าน">
                    <label class="sd-level-time">เวลา
                        <input type="number" min="15" max="300" value="${Number(lv.time) || 60}"
                            onchange="sdUpdateLevel('${lv.id}','time',parseInt(this.value)||60)"> วิ
                    </label>
                    <span class="sd-level-badge${ready ? ' is-ready' : ''}">${ready ? 'พร้อม · ' + marks + ' จุด' : 'ยังไม่ครบ · ' + marks + ' จุด'}</span>
                    <button type="button" class="rp-quick-box" style="margin-left:auto;color:#ff6b81;" onclick="sdRemoveLevel('${lv.id}')">ลบ</button>
                </div>
                <div class="sd-level-drops">
                    <button type="button" class="sd-drop" data-side="left" onclick="sdPickLevelImage('${lv.id}','left')">
                        <img alt="">
                        <span class="sd-drop-ph"><b>ภาพซ้าย</b><small>ต้นฉบับ · คลิกเพื่ออัปโหลด</small></span>
                    </button>
                    <button type="button" class="sd-drop" data-side="right" onclick="sdPickLevelImage('${lv.id}','right')">
                        <img alt="">
                        <span class="sd-drop-ph"><b>ภาพขวา</b><small>มีจุดต่าง · คลิกเพื่ออัปโหลด</small></span>
                    </button>
                </div>
                <div class="sd-level-card-actions">
                    <button type="button" class="gp-btn-primary" onclick="sdOpenMarkEditor('${lv.id}')">กำหนดเฉลย</button>
                </div>
            </article>`;
        }).join('');

        levels.forEach((lv) => {
            const card = list.querySelector(`[data-id="${lv.id}"]`);
            if (!card) return;
            fillDropPreview(card.querySelector('[data-side="left"]'), lv.leftUrl);
            fillDropPreview(card.querySelector('[data-side="right"]'), lv.rightUrl);
            card.querySelectorAll('.sd-drop').forEach((drop) => {
                drop.addEventListener('dragover', (ev) => { ev.preventDefault(); });
                drop.addEventListener('drop', (ev) => {
                    ev.preventDefault();
                    if (seq !== renderSeq) return;
                    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
                    if (file) sdUploadLevelImage(lv.id, drop.dataset.side, file);
                });
            });
        });
    }

    function sdAddLevel() {
        const cfg = getSdConfig();
        if (!cfg.levels) cfg.levels = [];
        const id = 'lv_' + Date.now().toString(36);
        cfg.levels.push({
            id,
            name: 'ด่าน ' + (cfg.levels.length + 1),
            time: 60,
            leftUrl: '',
            rightUrl: '',
            marks: [],
            radius: 0.05
        });
        try {
            saveSdConfig(cfg);
            persistLevelsForGame(cfg);
        } catch (e) {
            return;
        }
        switchSdSection('levels');
        renderSdLevels();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'เพิ่มด่านแล้ว', 'คลิกช่องซ้าย/ขวาเพื่ออัปโหลดภาพ');
        }
    }

    async function sdRemoveLevel(id) {
        const cfg = getSdConfig();
        const lv = (cfg.levels || []).find((x) => x.id === id);
        if (lv && store()) {
            try { await store().deleteLevelImages(lv); } catch (e) {}
        }
        cfg.levels = (cfg.levels || []).filter((x) => x.id !== id);
        saveSdConfig(cfg);
        persistLevelsForGame(cfg);
        renderSdLevels();
    }

    function sdUpdateLevel(id, key, val) {
        const cfg = getSdConfig();
        const lv = (cfg.levels || []).find((x) => x.id === id);
        if (!lv) return;
        lv[key] = val;
        saveSdConfig(cfg);
        persistLevelsForGame(cfg);
    }

    function sdPickLevelImage(id, side) {
        const input = document.getElementById('sdLevelFileInput');
        if (!input) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'อัปโหลดไม่ได้', 'ไม่พบช่องเลือกไฟล์');
            return;
        }
        pendingUpload = { id, side };
        input.value = '';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (file) sdUploadLevelImage(id, side, file);
            input.onchange = null;
            pendingUpload = null;
        };
        input.click();
    }

    async function sdUploadLevelImage(id, side, file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            if (typeof showCustomMsg === 'function') showCustomMsg('warning', 'ไฟล์ไม่รองรับ', 'เลือกไฟล์รูปภาพ');
            return;
        }
        const st = store();
        if (!st) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'อัปโหลดไม่ได้', 'SpotDiffStore ยังไม่โหลด — รีสตาร์ทแอป');
            return;
        }
        let key;
        try {
            const saved = await st.putLevelImage(id, side, file);
            key = saved.key;
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'บันทึกภาพไม่ได้', e.message || 'IndexedDB error');
            return;
        }
        const field = side === 'right' ? 'rightUrl' : 'leftUrl';
        sdUpdateLevel(id, field, key);
        renderSdLevels();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'อัปโหลดแล้ว', side === 'right' ? 'ภาพขวา' : 'ภาพซ้าย');
        }
    }

    function findLevel(id) {
        return (getSdConfig().levels || []).find((x) => x.id === id) || null;
    }

    function pinSizePx(radius, box) {
        const w = Number(box && box.width) || 1;
        const h = Number(box && box.height) || 1;
        const r = Math.max(0.015, Number(radius) || 0.05);
        return Math.max(16, Math.round(r * Math.min(w, h) * 2));
    }

    function geom() {
        return global.SpotDiffGeom || null;
    }

    function overlayContentBox(stage) {
        const img = stage && stage.querySelector('img');
        const g = geom();
        if (g && img) return g.imageContentBox(img, stage);
        if (!stage) return null;
        const r = stage.getBoundingClientRect();
        return { left: 0, top: 0, width: r.width, height: r.height };
    }

    function setStageImage(stage, img, emptyEl, url) {
        if (!stage || !img) return;
        stage.classList.toggle('has-img', !!url);
        if (!url) {
            img.removeAttribute('src');
            return;
        }
        img.onload = () => {
            stage.classList.add('has-img');
            renderMarkPins();
        };
        img.onerror = () => stage.classList.remove('has-img');
        img.src = url;
    }

    function applyOverlayBox(overlay, box) {
        if (!overlay || !box) return;
        overlay.style.left = box.left + 'px';
        overlay.style.top = box.top + 'px';
        overlay.style.width = box.width + 'px';
        overlay.style.height = box.height + 'px';
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
    }

    function syncRadiusUi() {
        const selected = markDraft.selectedIdx >= 0 ? markDraft.marks[markDraft.selectedIdx] : null;
        const r = selected ? (selected.r || markDraft.radius) : markDraft.radius;
        const pct = Math.max(2, Math.min(16, r * 100));
        const radius = document.getElementById('sdMarkRadius');
        const radiusVal = document.getElementById('sdMarkRadiusVal');
        if (radius && document.activeElement !== radius) radius.value = String(Math.round(pct * 10) / 10);
        if (radiusVal) radiusVal.textContent = selected
            ? `${Math.round(pct)}% · จุด ${markDraft.selectedIdx + 1}`
            : `${Math.round(pct)}% · จุดใหม่`;
    }

    function paintPinsOn(overlay, stage) {
        if (!overlay || !stage) return;
        const box = overlayContentBox(stage) || { left: 0, top: 0, width: 1, height: 1 };
        applyOverlayBox(overlay, box);
        overlay.innerHTML = (markDraft.marks || []).map((m, i) => {
            const size = pinSizePx(m.r || markDraft.radius, box);
            const sel = i === markDraft.selectedIdx ? ' is-selected' : '';
            return `<button type="button" class="sd-mark-pin${sel}" data-idx="${i}"
                style="left:${(m.x * 100).toFixed(2)}%;top:${(m.y * 100).toFixed(2)}%;width:${size}px;height:${size}px;"
                title="เลือกจุด ${i + 1}">${i + 1}</button>`;
        }).join('');
        overlay.querySelectorAll('.sd-mark-pin').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                markDraft.selectedIdx = Number(btn.dataset.idx);
                syncRadiusUi();
                renderMarkPins();
            });
        });
    }

    function renderMarkPins() {
        paintPinsOn(document.getElementById('sdMarkLeftOverlay'), document.getElementById('sdMarkLeftStage'));
        paintPinsOn(document.getElementById('sdMarkOverlay'), document.getElementById('sdMarkRightStage'));
        const countEl = document.getElementById('sdMarkCount');
        if (countEl) countEl.textContent = `${(markDraft.marks || []).length} จุด`;
        syncRadiusUi();
    }

    function stageClickNorm(ev, stage) {
        const img = stage.querySelector('img');
        const g = geom();
        if (g && typeof g.eventToImageNorm === 'function' && img) {
            return g.eventToImageNorm(ev, img, stage);
        }
        const box = (img && stage.classList.contains('has-img') ? img : stage).getBoundingClientRect();
        if (!box.width || !box.height) return null;
        const x = (ev.clientX - box.left) / box.width;
        const y = (ev.clientY - box.top) / box.height;
        if (x < 0 || y < 0 || x > 1 || y > 1) return null;
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), w: box.width, h: box.height };
    }

    function onMarkStageClick(ev) {
        const stage = ev.currentTarget;
        if (!stage || !stage.classList.contains('has-img')) return;
        const pt = stageClickNorm(ev, stage);
        if (!pt) return;
        const hitIdx = markDraft.marks.findIndex((m) => {
            const rad = (m.r || markDraft.radius || 0.05) * Math.min(pt.w, pt.h);
            return Math.hypot((pt.x - m.x) * pt.w, (pt.y - m.y) * pt.h) <= rad;
        });
        if (hitIdx >= 0) {
            markDraft.selectedIdx = hitIdx;
            renderMarkPins();
            return;
        }
        markDraft.marks.push({ x: pt.x, y: pt.y, r: markDraft.radius });
        markDraft.selectedIdx = markDraft.marks.length - 1;
        renderMarkPins();
    }

    function loadHtmlImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('โหลดภาพไม่สำเร็จ'));
            img.src = url;
        });
    }

    function drawImageCover(ctx, img, W, H, ox, oy) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (W - dw) / 2 + (ox || 0), (H - dh) / 2 + (oy || 0), dw, dh);
    }

    function boxBlur(src, W, H, radius) {
        const r = Math.max(1, radius | 0);
        const k = r * 2 + 1;
        const tmp = new Float32Array(W * H);
        const out = new Float32Array(W * H);
        for (let y = 0; y < H; y++) {
            let acc = 0;
            for (let x = -r; x <= r; x++) {
                const xx = x < 0 ? 0 : (x >= W ? W - 1 : x);
                acc += src[y * W + xx];
            }
            for (let x = 0; x < W; x++) {
                tmp[y * W + x] = acc / k;
                const add = x + r + 1 < W ? x + r + 1 : W - 1;
                const sub = x - r < 0 ? 0 : x - r;
                acc += src[y * W + add] - src[y * W + sub];
            }
        }
        for (let x = 0; x < W; x++) {
            let acc = 0;
            for (let y = -r; y <= r; y++) {
                const yy = y < 0 ? 0 : (y >= H ? H - 1 : y);
                acc += tmp[yy * W + x];
            }
            for (let y = 0; y < H; y++) {
                out[y * W + x] = acc / k;
                const add = y + r + 1 < H ? y + r + 1 : H - 1;
                const sub = y - r < 0 ? 0 : y - r;
                acc += tmp[add * W + x] - tmp[sub * W + x];
            }
        }
        return out;
    }

    function findBestAlign(leftData, rightData, W, H) {
        const sW = Math.max(48, Math.round(W / 6));
        const sH = Math.max(36, Math.round(H / 6));
        const c1 = document.createElement('canvas');
        const c2 = document.createElement('canvas');
        c1.width = c2.width = sW;
        c1.height = c2.height = sH;
        const g1 = c1.getContext('2d', { willReadFrequently: true });
        const g2 = c2.getContext('2d', { willReadFrequently: true });
        const src1 = document.createElement('canvas');
        const src2 = document.createElement('canvas');
        src1.width = src2.width = W;
        src1.height = src2.height = H;
        src1.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(leftData), W, H), 0, 0);
        src2.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rightData), W, H), 0, 0);
        g1.drawImage(src1, 0, 0, sW, sH);
        g2.drawImage(src2, 0, 0, sW, sH);
        const a = g1.getImageData(0, 0, sW, sH).data;
        const b = g2.getImageData(0, 0, sW, sH).data;
        let best = { dx: 0, dy: 0, sad: Infinity };
        const range = 3;
        for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
                let sad = 0;
                let count = 0;
                for (let y = range; y < sH - range; y++) {
                    for (let x = range; x < sW - range; x++) {
                        const o1 = (y * sW + x) * 4;
                        const o2 = ((y + dy) * sW + (x + dx)) * 4;
                        sad += Math.abs(a[o1] - b[o2]) + Math.abs(a[o1 + 1] - b[o2 + 1]) + Math.abs(a[o1 + 2] - b[o2 + 2]);
                        count++;
                    }
                }
                const avg = sad / Math.max(1, count);
                if (avg < best.sad) best = { dx, dy, sad: avg };
            }
        }
        const scale = W / sW;
        return { dx: Math.round(best.dx * scale), dy: Math.round(best.dy * scale), sad: best.sad };
    }

    function robustThresh(values, n, minVal, kMad, pMul) {
        const step = Math.max(1, Math.floor(n / 4000));
        const samples = [];
        for (let i = 0; i < n; i += step) samples.push(values[i]);
        samples.sort((a, b) => a - b);
        const mid = samples[samples.length >> 1] || 0;
        const abs = samples.map((v) => Math.abs(v - mid)).sort((a, b) => a - b);
        const mad = abs[abs.length >> 1] || 0;
        const p97 = samples[Math.min(samples.length - 1, (samples.length * 0.97) | 0)] || 0;
        return Math.max(minVal || 16, mid + (kMad || 6.5) * 1.4826 * mad, p97 * (pMul || 1.2));
    }

    function scanDiffMarksFromImages(leftImg, rightImg) {
        const maxW = 520;
        const nw = leftImg.naturalWidth || 1;
        const nh = leftImg.naturalHeight || 1;
        const W = Math.max(96, Math.min(maxW, nw));
        const H = Math.max(72, Math.round(W * (nh / nw)));
        const c1 = document.createElement('canvas');
        const c2 = document.createElement('canvas');
        c1.width = c2.width = W;
        c1.height = c2.height = H;
        const g1 = c1.getContext('2d', { willReadFrequently: true });
        const g2 = c2.getContext('2d', { willReadFrequently: true });
        drawImageCover(g1, leftImg, W, H, 0, 0);
        drawImageCover(g2, rightImg, W, H, 0, 0);
        let leftData = g1.getImageData(0, 0, W, H);
        let rightData = g2.getImageData(0, 0, W, H);
        const align = findBestAlign(leftData.data, rightData.data, W, H);
        if (align.dx || align.dy) {
            g2.clearRect(0, 0, W, H);
            drawImageCover(g2, rightImg, W, H, align.dx, align.dy);
            rightData = g2.getImageData(0, 0, W, H);
        }
        const a = leftData.data;
        const b = rightData.data;
        const n = W * H;
        const struct = new Float32Array(n);
        const color = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            const r1 = a[o], g1 = a[o + 1], b1 = a[o + 2];
            const r2 = b[o], g2 = b[o + 1], b2 = b[o + 2];
            const dR = r1 - r2, dG = g1 - g2, dB = b1 - b2;
            const l1 = r1 * 0.299 + g1 * 0.587 + b1 * 0.114;
            const l2 = r2 * 0.299 + g2 * 0.587 + b2 * 0.114;
            const max1 = Math.max(r1, g1, b1), min1 = Math.min(r1, g1, b1);
            const max2 = Math.max(r2, g2, b2), min2 = Math.min(r2, g2, b2);
            const s1 = max1 < 8 ? 0 : (max1 - min1) / max1;
            const s2 = max2 < 8 ? 0 : (max2 - min2) / max2;
            let h1 = 0, h2 = 0;
            const d1 = max1 - min1, d2 = max2 - min2;
            if (d1 > 6) {
                if (max1 === r1) h1 = 60 * (((g1 - b1) / d1) % 6);
                else if (max1 === g1) h1 = 60 * ((b1 - r1) / d1 + 2);
                else h1 = 60 * ((r1 - g1) / d1 + 4);
                if (h1 < 0) h1 += 360;
            }
            if (d2 > 6) {
                if (max2 === r2) h2 = 60 * (((g2 - b2) / d2) % 6);
                else if (max2 === g2) h2 = 60 * ((b2 - r2) / d2 + 2);
                else h2 = 60 * ((r2 - g2) / d2 + 4);
                if (h2 < 0) h2 += 360;
            }
            const hueGap = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
            const satGate = Math.max(s1, s2);
            const hueScore = satGate < 0.1 ? 0 : hueGap * satGate * 0.85;
            const chroma = (Math.abs(dR - dG) + Math.abs(dG - dB) + Math.abs(dB - dR)) / 3;
            struct[i] = Math.abs(l1 - l2) * 0.95 + (Math.abs(dR) + Math.abs(dG) + Math.abs(dB)) / 12;
            color[i] = hueScore + Math.abs(s1 - s2) * 48 + chroma * 0.9;
        }
        const structSoft = boxBlur(struct, W, H, 1);
        const colorSoft = boxBlur(color, W, H, 1);
        const structMean = boxBlur(structSoft, W, H, 8);
        const colorMean = boxBlur(colorSoft, W, H, 3);
        const structLocal = new Float32Array(n);
        const colorLocal = new Float32Array(n);
        const detect = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            structLocal[i] = Math.max(0, structSoft[i] * 0.55 + (structSoft[i] - structMean[i]) * 0.75);
            colorLocal[i] = Math.max(0, colorSoft[i] * 0.82 + (colorSoft[i] - colorMean[i]) * 0.35);
            detect[i] = Math.max(structLocal[i], colorLocal[i] * 1.05);
        }
        const structThresh = Math.min(48, robustThresh(structLocal, n, 16, 6.2, 1.18));
        const colorThresh = Math.min(36, robustThresh(colorLocal, n, 9, 4.6, 1.12));
        const margin = Math.max(6, Math.round(Math.min(W, H) * 0.018), Math.abs(align.dx) + 3, Math.abs(align.dy) + 3);
        const mask = new Uint8Array(n);
        for (let y = margin; y < H - margin; y++) {
            for (let x = margin; x < W - margin; x++) {
                const i = y * W + x;
                const structHit = structLocal[i] >= structThresh && structSoft[i] >= 11;
                const colorHit = colorLocal[i] >= colorThresh && colorSoft[i] >= 8;
                if (structHit || colorHit) mask[i] = 1;
            }
        }
        for (let pass = 0; pass < 2; pass++) {
            const next = new Uint8Array(n);
            const need = pass === 0 ? 4 : 5;
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    const i = y * W + x;
                    if (!mask[i]) continue;
                    let c = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (mask[(y + dy) * W + (x + dx)]) c++;
                        }
                    }
                    next[i] = c >= need ? 1 : 0;
                }
            }
            mask.set(next);
        }
        const seen = new Uint8Array(n);
        const blobs = [];
        const stack = [];
        const minArea = Math.max(14, Math.round(n * 0.00028));
        const maxArea = Math.round(n * 0.085);
        for (let i = 0; i < n; i++) {
            if (!mask[i] || seen[i]) continue;
            stack.length = 0;
            stack.push(i);
            seen[i] = 1;
            let minX = W, minY = H, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0, scoreSum = 0;
            while (stack.length) {
                const p = stack.pop();
                const x = p % W;
                const y = (p / W) | 0;
                area++;
                sx += x;
                sy += y;
                scoreSum += detect[p];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                const neigh = [p - 1, p + 1, p - W, p + W];
                for (let k = 0; k < 4; k++) {
                    const q = neigh[k];
                    if (q < 0 || q >= n || seen[q] || !mask[q]) continue;
                    seen[q] = 1;
                    stack.push(q);
                }
            }
            const bw = maxX - minX + 1;
            const bh = maxY - minY + 1;
            const meanScore = scoreSum / Math.max(1, area);
            const fill = area / Math.max(1, bw * bh);
            if (area < minArea || area > maxArea) continue;
            if (meanScore < Math.min(structThresh, colorThresh) * 0.92) continue;
            if (Math.min(bw, bh) < 3) continue;
            if (fill < 0.14) continue;
            blobs.push({
                x: (sx / area + 0.5) / W,
                y: (sy / area + 0.5) / H,
                r: Math.max(0.018, Math.min(0.1, (Math.max(bw, bh) / 2 + 3) / Math.min(W, H))),
                area,
                score: meanScore * Math.sqrt(area)
            });
        }
        blobs.sort((a, b) => b.score - a.score);
        const merged = [];
        blobs.forEach((b) => {
            const hit = merged.find((m) => Math.hypot((m.x - b.x) * W, (m.y - b.y) * H) < Math.max(m.r, b.r) * Math.min(W, H) * 1.12);
            if (hit) {
                const t = hit.area + b.area;
                hit.x = (hit.x * hit.area + b.x * b.area) / t;
                hit.y = (hit.y * hit.area + b.y * b.area) / t;
                hit.r = Math.max(hit.r, b.r);
                hit.area = t;
                hit.score = Math.max(hit.score, b.score);
                return;
            }
            merged.push({ ...b });
        });
        const best = merged[0] ? merged[0].score : 0;
        return merged
            .filter((m) => best <= 0 || m.score >= best * 0.28)
            .slice(0, 14)
            .map((m) => ({
                x: Math.max(0.02, Math.min(0.98, m.x)),
                y: Math.max(0.02, Math.min(0.98, m.y)),
                r: m.r
            }));
    }

    async function sdScanDiffMarks() {
        const leftImg = document.getElementById('sdMarkLeftImg');
        const rightImg = document.getElementById('sdMarkRightImg');
        const btn = document.getElementById('sdScanBtn');
        const status = document.getElementById('sdScanStatus');
        if (!leftImg || !rightImg || !leftImg.src || !rightImg.src) {
            if (typeof showCustomMsg === 'function') showCustomMsg('warning', 'ยังไม่มีภาพ', 'อัปโหลดภาพซ้าย-ขวาก่อนสแกน');
            return;
        }
        if (btn) btn.disabled = true;
        if (status) status.textContent = 'กำลังสแกน...';
        try {
            const [a, b] = await Promise.all([loadHtmlImage(leftImg.src), loadHtmlImage(rightImg.src)]);
            const marks = scanDiffMarksFromImages(a, b);
            markDraft.marks = marks;
            markDraft.selectedIdx = marks.length ? 0 : -1;
            if (marks[0]) markDraft.radius = marks[0].r;
            renderMarkPins();
            if (status) status.textContent = marks.length ? `พบ ${marks.length} จุด — คลิกแก้ได้` : 'ไม่พบจุดต่างชัดเจน';
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(marks.length ? 'success' : 'warning', 'สแกนภาพ', marks.length
                    ? `พบ ${marks.length} จุดที่ต่างกัน — เลือกจุดแล้วปรับขนาดหรือลบได้`
                    : 'ไม่พบจุดต่างชัดเจน ลองปักเอง');
            }
        } catch (e) {
            if (status) status.textContent = 'สแกนไม่สำเร็จ';
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'สแกนไม่ได้', e.message || 'เปรียบเทียบภาพไม่สำเร็จ');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function sdOpenMarkEditor(id) {
        const lv = findLevel(id);
        if (!lv) return;
        if (!lv.leftUrl || !lv.rightUrl) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('warning', 'ยังไม่มีภาพ', 'อัปโหลดภาพซ้ายและขวาก่อนกำหนดเฉลย');
            }
            return;
        }
        const st = store();
        const leftUrl = st ? await st.resolveImageUrl(lv.leftUrl) : lv.leftUrl;
        const rightUrl = st ? await st.resolveImageUrl(lv.rightUrl) : lv.rightUrl;
        if (!leftUrl || !rightUrl) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('warning', 'โหลดภาพไม่ได้', 'อัปโหลดภาพซ้าย–ขวาใหม่ในด่านนี้');
            }
            return;
        }
        markDraft = {
            levelId: id,
            marks: (lv.marks || []).map((m) => ({ x: Number(m.x), y: Number(m.y), r: Number(m.r || lv.radius || 0.05) })),
            radius: Number(lv.radius || 0.05),
            selectedIdx: -1
        };
        const modal = document.getElementById('sdMarkModal');
        const title = document.getElementById('sdMarkModalTitle');
        const leftImg = document.getElementById('sdMarkLeftImg');
        const rightImg = document.getElementById('sdMarkRightImg');
        const scanStatus = document.getElementById('sdScanStatus');
        if (title) title.textContent = 'กำหนดเฉลย · ' + (lv.name || 'ด่าน');
        if (scanStatus) scanStatus.textContent = '';
        setStageImage(document.getElementById('sdMarkLeftStage'), leftImg, document.getElementById('sdMarkLeftEmpty'), leftUrl);
        setStageImage(document.getElementById('sdMarkRightStage'), rightImg, document.getElementById('sdMarkRightEmpty'), rightUrl);
        if (modal) modal.hidden = false;
        ['sdMarkLeftStage', 'sdMarkRightStage'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.removeEventListener('click', onMarkStageClick);
            el.addEventListener('click', onMarkStageClick);
        });
        const paint = () => renderMarkPins();
        window.addEventListener('resize', paint);
        markDraft._onResize = paint;
        paint();
    }

    function sdCloseMarkEditor() {
        const modal = document.getElementById('sdMarkModal');
        ['sdMarkLeftStage', 'sdMarkRightStage'].forEach((id) => {
            document.getElementById(id)?.removeEventListener('click', onMarkStageClick);
        });
        if (markDraft._onResize) window.removeEventListener('resize', markDraft._onResize);
        if (modal) modal.hidden = true;
        markDraft = { levelId: '', marks: [], radius: 0.05, selectedIdx: -1 };
    }

    function sdSetMarkRadius(val) {
        const pct = Math.max(2, Math.min(16, Number(val) || 5));
        markDraft.radius = pct / 100;
        const idx = markDraft.selectedIdx;
        if (idx >= 0 && markDraft.marks[idx]) {
            markDraft.marks[idx] = { ...markDraft.marks[idx], r: markDraft.radius };
        }
        renderMarkPins();
    }

    function sdDeleteSelectedMark() {
        const idx = markDraft.selectedIdx;
        if (idx < 0 || !markDraft.marks[idx]) return;
        markDraft.marks.splice(idx, 1);
        markDraft.selectedIdx = markDraft.marks.length ? Math.min(idx, markDraft.marks.length - 1) : -1;
        renderMarkPins();
    }

    function sdClearMarks() {
        markDraft.marks = [];
        markDraft.selectedIdx = -1;
        renderMarkPins();
        const status = document.getElementById('sdScanStatus');
        if (status) status.textContent = '';
    }

    function sdSaveMarks() {
        if (!markDraft.levelId) return;
        const cfg = getSdConfig();
        const lv = (cfg.levels || []).find((x) => x.id === markDraft.levelId);
        if (!lv) return;
        lv.marks = markDraft.marks.map((m) => ({
            x: m.x,
            y: m.y,
            r: Math.max(0.015, Number(m.r) || markDraft.radius || 0.05)
        }));
        lv.radius = markDraft.radius;
        saveSdConfig(cfg);
        persistLevelsForGame(cfg);
        syncSdToGame({ levels: cfg.levels || [] });
        renderSdLevels();
        sdCloseMarkEditor();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'บันทึกเฉลย', `${lv.marks.length} จุดในด่าน ${lv.name || ''}`);
        }
    }

    function renderSdProfile() {
        const cfg = getSdConfig();
        const view = document.getElementById('gcSpotDiffView');
        if (view) view.classList.toggle('is-admin', isSdAdmin());
        const enabledCb = document.getElementById('sdGameEnabled');
        if (enabledCb) enabledCb.checked = !!cfg.enabled;
        document.querySelectorAll('.sd-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === cfg.mode);
        });
        persistLevelsForGame(cfg);
        renderSdTriggers();
        renderSdLevels();
        migrateLegacyImages();
    }

    function sdTestAction(action) {
        fireSdAction(action, 'ทดสอบ', action === 'add_time' ? 15 : action === 'reduce_time' ? 10 : 1);
        if (typeof showCustomMsg === 'function') {
            const meta = SD_ACTIONS[action] || { label: action };
            showCustomMsg('info', 'ทดสอบ', meta.label);
        }
    }

    global.getSdConfig = getSdConfig;
    global.saveSdConfig = saveSdConfig;
    global.sdOpenGame = sdOpenGame;
    global.sdCopyOverlayLink = sdCopyOverlayLink;
    global.sdSetMode = sdSetMode;
    global.sdToggleEnabled = sdToggleEnabled;
    global.handleSdGift = handleSdGift;
    global.fireSdAction = fireSdAction;
    global.sdAddTrigger = sdAddTrigger;
    global.sdRemoveTrigger = sdRemoveTrigger;
    global.sdUpdateTrigger = sdUpdateTrigger;
    global.sdOpenGiftPickerForTrigger = sdOpenGiftPickerForTrigger;
    global.renderSdProfile = renderSdProfile;
    global.sdTestAction = sdTestAction;
    global.syncSdToGame = syncSdToGame;
    global.sdAddLevel = sdAddLevel;
    global.sdRemoveLevel = sdRemoveLevel;
    global.sdUpdateLevel = sdUpdateLevel;
    global.sdPickLevelImage = sdPickLevelImage;
    global.sdOpenMarkEditor = sdOpenMarkEditor;
    global.sdCloseMarkEditor = sdCloseMarkEditor;
    global.sdSetMarkRadius = sdSetMarkRadius;
    global.sdDeleteSelectedMark = sdDeleteSelectedMark;
    global.sdScanDiffMarks = sdScanDiffMarks;
    global.sdClearMarks = sdClearMarks;
    global.sdSaveMarks = sdSaveMarks;
    global.switchSdTopTab = switchSdTopTab;
    global.switchSdSection = switchSdSection;

})(typeof window !== 'undefined' ? window : global);
