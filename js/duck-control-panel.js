/**
 * Duck Control — Placid Plastic Duck Simulator (MelonLoader HTTP bridge :25565)
 */
(function (global) {
    'use strict';

    const DK_STORAGE_KEY = 'tokcontrol_duck_control';
    const DK_DEFAULT_HOST = 'http://127.0.0.1:25565';

    const DK_ACTIONS = [
        { value: 'spawn', label: '🦆 เสกเป็ดสุ่ม + ชื่อผู้ส่ง + กล้อง' },
        { value: 'spectate', label: '📷 สลับกล้องไปเป็ดผู้ส่ง' },
        { value: 'reskin', label: '🎨 สุ่มสกินเป็ด (เก็บชื่อ)' }
    ];

    function getDkDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', action: 'spawn' },
            { id: 2, enabled: true, type: 'follow', action: 'spawn' },
            { id: 3, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', action: 'spectate' },
            { id: 4, enabled: true, type: 'gift', giftName: 'GG', giftId: '', action: 'reskin' },
            { id: 5, enabled: true, type: 'share', action: 'spawn' }
        ];
    }

    function getDkDefaultConfig() {
        return {
            enabled: false,
            connection: {
                type: 'http',
                host: DK_DEFAULT_HOST
            },
            triggers: getDkDefaultTriggers()
        };
    }

    function getDkConfig() {
        try {
            const raw = localStorage.getItem(DK_STORAGE_KEY);
            if (raw) return { ...getDkDefaultConfig(), ...JSON.parse(raw) };
        } catch (e) {}
        return getDkDefaultConfig();
    }

    function saveDkConfig(cfg) {
        localStorage.setItem(DK_STORAGE_KEY, JSON.stringify(cfg));
    }

    function dkBridgeBase() {
        const host = getDkConfig().connection?.host || DK_DEFAULT_HOST;
        return String(host).replace(/\/$/, '');
    }

    function dkViewerName(data) {
        return String(
            data?.nickname
            || data?.uniqueId
            || data?.user
            || data?.name
            || data?.sender
            || 'Viewer'
        ).trim().slice(0, 32) || 'Viewer';
    }

    async function dkFetch(path, opts = {}) {
        const url = dkBridgeBase() + path;
        const res = await fetch(url, {
            method: opts.method || 'GET',
            headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
        if (!res.ok || json?.success === false) {
            const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return json;
    }

    async function dkRunAction(action, data = {}) {
        const name = dkViewerName(data);
        if (action === 'spawn') {
            return dkFetch('/spawn', { method: 'POST', body: { name } });
        }
        if (action === 'spectate') {
            return dkFetch('/spectate', { method: 'POST', body: { name } });
        }
        if (action === 'reskin') {
            return dkFetch('/reskin', { method: 'POST', body: { name } });
        }
        throw new Error('unknown action: ' + action);
    }

    function dkToggleEnabled(checked) {
        const cfg = getDkConfig();
        cfg.enabled = !!checked;
        saveDkConfig(cfg);
        if (typeof setGameLiveActive === 'function') setGameLiveActive('duck-control', !!checked);
        else if (checked && typeof setActiveGameModId === 'function') setActiveGameModId('duck-control');
    }

    function dkSaveConnection() {
        const cfg = getDkConfig();
        cfg.connection = {
            type: 'http',
            host: document.getElementById('dkConnHost')?.value?.trim() || DK_DEFAULT_HOST
        };
        saveDkConfig(cfg);
    }

    async function dkTestConnection(opts = {}) {
        dkSaveConnection();
        try {
            const j = await dkFetch('/health');
            const el = document.getElementById('dkConnStatus');
            if (el) { el.textContent = '● Bridge พร้อม'; el.style.color = '#2ecc71'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'Duck Bridge', 'เชื่อมต่อ MelonLoader ได้');
            }
            return !!j;
        } catch (e) {
            const el = document.getElementById('dkConnStatus');
            if (el) { el.textContent = '○ เชื่อมไม่ได้'; el.style.color = '#e74c3c'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'Duck Bridge ไม่ได้', e.message + ' — เปิดเกมผ่าน Steam + MelonLoader ก่อน');
            }
            return false;
        }
    }

    async function dkTestAction(actionId) {
        try {
            dkSaveConnection();
            const res = await dkRunAction(actionId, { nickname: 'Streamer', uniqueId: 'streamer' });
            const duckId = res?.data?.duckId || '';
            const hint = duckId ? `ok · ${duckId}` : 'ok';
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'Duck · ทดสอบ', hint);
            if (typeof logToDashboard === 'function') logToDashboard(`🦆 ${actionId}: ${hint}`, '#27ae60');
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || 'เปิดเกม + MelonLoader ก่อน');
        }
    }

    const dkTriggerCounters = {};

    function handleDkGift(giftData) {
        if (!getDkConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('duck-control')) return false;
        const UI = global.MapTriggerUI;
        const fire = (tr) => {
            dkRunAction(tr.action, giftData).then((res) => {
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🦆 @${dkViewerName(giftData)} → ${tr.action}`, '#c4a1ff');
                }
                return res;
            }).catch(() => {});
        };
        if (UI && typeof UI.matchGiftTriggers === 'function') {
            const result = UI.matchGiftTriggers(getDkConfig().triggers || [], giftData, fire, dkTriggerCounters, DK_ACTIONS);
            return !!result.fired;
        }
        return false;
    }

    function handleDkLiveEvent(eventType, data) {
        if (!getDkConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('duck-control')) return false;
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.matchLiveEvent !== 'function') return false;
        return UI.matchLiveEvent(getDkConfig().triggers || [], eventType, data, (tr) => {
            dkRunAction(tr.action, data).catch(() => {});
        }, dkTriggerCounters, DK_ACTIONS);
    }

    function handleDkLike(data) {
        let fired = false;
        if (handleDkLiveEvent('like', data)) fired = true;
        if (handleDkLiveEvent('globallikes', data)) fired = true;
        return fired;
    }

    function switchDkTopTab(tab) {
        const settings = document.getElementById('dkSettingsPanel');
        const trigger = document.getElementById('dkTriggerPanel');
        const tSettings = document.getElementById('dkTabSettings');
        const tTrigger = document.getElementById('dkTabTrigger');
        const isTrig = tab === 'trigger';
        if (settings) settings.style.display = isTrig ? 'none' : 'flex';
        if (trigger) {
            trigger.style.display = isTrig ? 'flex' : 'none';
            trigger.classList.toggle('active-flex', isTrig);
        }
        tSettings?.classList.toggle('active', !isTrig);
        tTrigger?.classList.toggle('active', isTrig);
        if (isTrig) renderDkTriggers();
    }

    function renderDkTriggers() {
        const list = document.getElementById('dkTriggerList');
        if (!list) return;
        const triggers = getDkConfig().triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์»</p>';
            return;
        }
        const UI = global.MapTriggerUI;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, DK_ACTIONS, {
                    prefix: 'dk',
                    giftOnclick: `dkPickGift(${tr.id})`,
                    actionOnclick: `dkUpdateTrigger(${tr.id}, 'action', '{value}'); renderDkTriggers();`,
                    testOnclick: `dkTestAction('${tr.action}')`,
                    removeOnclick: `dkRemoveTrigger(${tr.id})`
                });
            }
            const label = UI && UI.formatLabel
                ? UI.formatLabel(tr, DK_ACTIONS)
                : `${tr.giftName || tr.type || 'ทริกเกอร์'} → ${tr.action}`;
            return `<div class="rp-trigger-chip mc-trigger-chip" data-id="${tr.id}">
                <span class="rp-trigger-chip-label">${String(label).replace(/</g, '&lt;')}</span>
                <div class="mc-trigger-chip-actions">
                    <button type="button" class="gp-btn-primary mc-test-btn" onclick="dkTestAction('${tr.action}')" title="ทดสอบ">▶</button>
                    <button type="button" class="mc-remove-btn" onclick="dkRemoveTrigger(${tr.id})" title="ลบ">✕</button>
                </div>
            </div>`;
        }).join('');
    }

    function dkAddTrigger() {
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.open !== 'function') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ทริกเกอร์', 'ระบบโมดอลยังไม่พร้อม');
            return;
        }
        UI.open({
            title: 'ทริกเกอร์ Duck Control',
            actions: DK_ACTIONS,
            defaultAction: 'spawn',
            onSave: (payload) => {
                const cfg = getDkConfig();
                cfg.triggers = cfg.triggers || [];
                cfg.triggers.push(payload);
                saveDkConfig(cfg);
                renderDkTriggers();
            }
        });
    }

    function dkRemoveTrigger(idOrIndex) {
        const cfg = getDkConfig();
        const id = String(idOrIndex);
        const byId = (cfg.triggers || []).some((t) => String(t.id) === id);
        if (byId) cfg.triggers = cfg.triggers.filter((t) => String(t.id) !== id);
        else cfg.triggers.splice(Number(idOrIndex), 1);
        saveDkConfig(cfg);
        renderDkTriggers();
    }

    function dkUpdateTrigger(idOrIndex, key, value) {
        const cfg = getDkConfig();
        let tr = (cfg.triggers || []).find((t) => String(t.id) === String(idOrIndex));
        if (!tr && cfg.triggers[idOrIndex]) tr = cfg.triggers[idOrIndex];
        if (!tr) return;
        if (key === 'action' && tr.type === 'random' && global.MapTriggerUI && MapTriggerUI.applyActionPick) {
            MapTriggerUI.applyActionPick(tr, value, DK_ACTIONS);
        } else {
            tr[key] = key === 'enabled' ? !!value : value;
        }
        saveDkConfig(cfg);
    }

    function dkPickGift(id) {
        if (!global.GiftPicker) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Gift Picker', 'ระบบเลือกของขวัญยังไม่พร้อม');
            return;
        }
        GiftPicker.open({
            title: '🎁 เลือกของขวัญ Duck Control',
            onSelect: (gift) => {
                dkUpdateTrigger(id, 'giftName', gift.giftName || '');
                dkUpdateTrigger(id, 'giftId', String(gift.giftId || ''));
                dkUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderDkTriggers();
            }
        });
    }

    function renderDkProfile() {
        const cfg = getDkConfig();
        const enabled = document.getElementById('dkGameEnabled');
        if (enabled) enabled.checked = !!cfg.enabled;
        const host = document.getElementById('dkConnHost');
        if (host) host.value = cfg.connection?.host || DK_DEFAULT_HOST;
        renderDkTriggers();
        switchDkTopTab('settings');
        dkTestConnection({ silent: true });
    }

    global.getDkConfig = getDkConfig;
    global.saveDkConfig = saveDkConfig;
    global.dkToggleEnabled = dkToggleEnabled;
    global.dkSaveConnection = dkSaveConnection;
    global.dkTestConnection = dkTestConnection;
    global.dkTestAction = dkTestAction;
    global.dkAddTrigger = dkAddTrigger;
    global.dkRemoveTrigger = dkRemoveTrigger;
    global.dkUpdateTrigger = dkUpdateTrigger;
    global.dkPickGift = dkPickGift;
    global.renderDkTriggers = renderDkTriggers;
    global.handleDkGift = handleDkGift;
    global.handleDkLike = handleDkLike;
    global.handleDkLiveEvent = handleDkLiveEvent;
    global.renderDkProfile = renderDkProfile;
    global.switchDkTopTab = switchDkTopTab;
    global.dkRunAction = dkRunAction;
})(typeof window !== 'undefined' ? window : global);
