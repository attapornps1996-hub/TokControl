/**
 * Tower Wars (Castle Wars) — TokControl Game Center panel (TikTok gifts → RCON)
 */
(function (global) {
    'use strict';

    const TW_STORAGE_KEY = 'tokcontrol_tower_wars';
    const TW_DEFAULT_HOST = '127.0.0.1';
    const TW_DEFAULT_PORT = 25575;
    const TW_DEFAULT_PASS = 'tokcontrol';
    let twCatalog = null;

    function getTwDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', action: 'tw_wave_normal' },
            { id: 2, enabled: true, type: 'gift', giftName: 'Mini Heart', giftId: '', action: 'tw_wave_tnt' },
            { id: 3, enabled: true, type: 'gift', giftName: 'Paper Crane', giftId: '', action: 'tw_debuff' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', action: 'tw_supply' },
            { id: 5, enabled: true, type: 'gift', giftName: 'Donut', giftId: '', action: 'tw_defender' },
            { id: 6, enabled: true, type: 'gift', giftName: 'Perfume', giftId: '', action: 'tw_buff' }
        ];
    }

    function getTwDefaultConfig() {
        return {
            enabled: false,
            connection: {
                type: 'rcon',
                host: TW_DEFAULT_HOST,
                port: TW_DEFAULT_PORT,
                password: TW_DEFAULT_PASS
            },
            triggers: getTwDefaultTriggers()
        };
    }

    function getTwConfig() {
        try {
            const raw = localStorage.getItem(TW_STORAGE_KEY);
            if (raw) return { ...getTwDefaultConfig(), ...JSON.parse(raw) };
        } catch (e) {}
        return getTwDefaultConfig();
    }

    function saveTwConfig(cfg) {
        localStorage.setItem(TW_STORAGE_KEY, JSON.stringify(cfg));
    }

    async function loadTwCatalog() {
        if (twCatalog) return twCatalog;
        try {
            const res = await fetch('/data/tower_wars_catalog.json');
            twCatalog = await res.json();
        } catch (e) {
            twCatalog = { actions: [], default_triggers: [] };
        }
        return twCatalog;
    }

    function twIsLive() {
        if (typeof isGameLiveActive === 'function') return isGameLiveActive('tower-wars');
        return !!getTwConfig().enabled;
    }

    function twToggleEnabled(checked) {
        const cfg = getTwConfig();
        cfg.enabled = !!checked;
        saveTwConfig(cfg);
        if (typeof setGameLiveActive === 'function') {
            setGameLiveActive('tower-wars', !!checked);
        } else if (checked && typeof setActiveGameModId === 'function') {
            setActiveGameModId('tower-wars');
        }
    }

    function twSaveConnection() {
        const cfg = getTwConfig();
        const host = document.getElementById('twConnHost')?.value?.trim() || TW_DEFAULT_HOST;
        const port = parseInt(document.getElementById('twConnPort')?.value, 10) || TW_DEFAULT_PORT;
        const password = document.getElementById('twConnPass')?.value || '';
        cfg.connection = { type: 'rcon', host, port, password };
        saveTwConfig(cfg);
    }

    async function twRunAction(action, opts = {}) {
        if (typeof executeGameModCommandDetailed !== 'function') {
            throw new Error('executeGameModCommandDetailed ไม่พร้อม');
        }
        const cfg = getTwConfig();
        const payload = JSON.stringify({ action, ...(opts || {}) });
        const res = await executeGameModCommandDetailed('tower-wars', payload, cfg.connection || {}, {
            awaitResponse: true,
            fireAndForget: false
        });
        if (!res || res.ok === false) {
            throw new Error(res?.error || res?.message || 'Tower Wars action failed');
        }
        return res.detail || { ok: true, ...res };
    }

    async function twBuildMap() {
        try {
            twSaveConnection();
            const res = await twRunAction('tw_build', { seconds: 60 });
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok ? 'success' : 'warning', 'สร้างปราสาท',
                    res.ok ? 'แมพพร้อม · เตรียมตัว 60 วิ — ส่งมอนรอได้ทั้ง 2 ฝั่ง' : `บางคำสั่งล้มเหลว (${res.errors?.length || 0})`);
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard('🏰 Tower Wars: รีสร้างแมพ + เตรียม 60วิ', '#e67e22');
            }
            twStartHudPoll();
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สร้างแมพไม่ได้', e.message || 'ตรวจ RCON host/port/รหัส');
            }
            return { ok: false, error: e.message };
        }
    }

    async function twStartPrep(seconds) {
        try {
            twSaveConnection();
            const sec = Math.max(15, parseInt(seconds, 10) || 60);
            const res = await twRunAction('tw_prep', { seconds: sec });
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', 'เตรียมตัว',
                    `มอนรอในค่าย ${sec} วิ · ยังไม่ตีกัน`);
            }
            twRefreshHud();
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เริ่มเตรียมตัวไม่ได้', e.message);
            }
            return { ok: false, error: e.message };
        }
    }

    async function twBeginBattle() {
        try {
            twSaveConnection();
            const res = await twRunAction('tw_begin');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', 'เริ่มศึก',
                    'นับถอยหลังแล้วมอนทั้ง 2 ฝั่งบุกใส่กัน');
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard('🏰 Tower Wars: เริ่มศึก!', '#e74c3c');
            }
            twRefreshHud();
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เริ่มศึกไม่ได้', e.message);
            }
            return { ok: false, error: e.message };
        }
    }

    async function twTestAction(actionId) {
        try {
            twSaveConnection();
            const testMap = {
                tw_wave_normal: 'tw_test_wave',
                tw_wave_tnt: 'tw_test_tnt',
                tw_wave_boss: 'tw_test_boss',
                tw_defender: 'tw_test_defender'
            };
            const action = testMap[actionId] || actionId;
            const res = await twRunAction(action);
            const bodies = (res.results || []).map((r) => r?.body || r?.message || '').filter(Boolean).join('\n');
            const hint = bodies || (res.ok !== false ? 'ส่งเข้าเกมแล้ว' : (res.errors?.[0]?.error || 'ล้มเหลว'));
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', 'Tower Wars · ทดสอบ', hint.slice(0, 180));
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(`🏰 ทดสอบ ${action}: ${hint.slice(0, 80)}`, '#e67e22');
            }
            twRefreshHud();
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || 'เปิดเซิร์ฟ Tower + เข้าเกมก่อน');
            }
        }
    }

    async function twTestTeam(team, kind) {
        const t = String(team || 'blue').toLowerCase() === 'red' ? 'red' : 'blue';
        const k = String(kind || 'mix').toLowerCase();
        const action = `tw_${t}_${k === 'mix' ? 'mix' : k}`;
        // map mix to tw_blue_mix / tw_red_mix
        const cmd = (k === 'mix')
            ? (t === 'red' ? 'tw_red_mix' : 'tw_blue_mix')
            : `tw_${t}_${k}`;
        try {
            twSaveConnection();
            const res = await twRunAction(cmd);
            const label = t === 'red' ? 'แดง' : 'ฟ้า';
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', `ทดสอบทีม${label}`, `${k} · ดูในเกม`);
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(`🏰 ทดสอบ${label} → ${k}`, t === 'red' ? '#e74c3c' : '#3498db');
            }
            setTimeout(() => twRefreshHud(), 800);
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message);
            }
        }
    }

    function twApplyHud(status) {
        const redT = document.getElementById('twRedTroops');
        const redH = document.getElementById('twRedHp');
        const blueT = document.getElementById('twBlueTroops');
        const blueH = document.getElementById('twBlueHp');
        const phaseEl = document.getElementById('twPhaseLabel');
        if (!status) {
            if (redT) redT.textContent = '—';
            if (redH) redH.textContent = '—';
            if (blueT) blueT.textContent = '—';
            if (blueH) blueH.textContent = '—';
            if (phaseEl) phaseEl.textContent = 'เฟส: —';
            return;
        }
        const red = status.red || {};
        const blue = status.blue || {};
        if (redT) redT.textContent = String(red.troops ?? '0');
        if (blueT) blueT.textContent = String(blue.troops ?? '0');
        if (redH) redH.textContent = `${red.castlePct ?? 0}% (${red.castleHp ?? 0}/${red.maxHp ?? 200})`;
        if (blueH) blueH.textContent = `${blue.castlePct ?? 0}% (${blue.castleHp ?? 0}/${blue.maxHp ?? 200})`;
        if (phaseEl) {
            const ph = String(status.phase || '').toUpperCase();
            if (ph === 'PREP') phaseEl.textContent = `เฟส: เตรียมตัว · เหลือ ${status.prepLeft ?? 0} วิ`;
            else if (ph === 'COUNTDOWN') phaseEl.textContent = `เฟส: นับถอยหลัง · ${status.countdown ?? 0}`;
            else if (ph === 'LIVE') phaseEl.textContent = 'เฟส: ● กำลังสู้ — มอนบุกทั้ง 2 ฝั่ง';
            else phaseEl.textContent = `เฟส: ${status.phase || '—'}`;
        }
    }

    async function twRefreshHud() {
        try {
            // ลอง HTTP bridge ก่อน (เร็ว) แล้วค่อย RCON
            let status = null;
            try {
                const r = await fetch('http://127.0.0.1:8081/health', { cache: 'no-store' });
                const j = await r.json();
                if (j?.tower) status = j.tower;
            } catch (_) {}
            if (!status) {
                const res = await twRunAction('tw_status');
                status = res.status || null;
                if (!status && res.results) {
                    // parse from RCON bodies via manager if attached
                    const bodies = (res.results || []).map((x) => x?.body || '').join('\n');
                    const m = bodies.match(/\{[\s\S]*"blue"[\s\S]*"red"[\s\S]*\}/);
                    if (m) {
                        try { status = JSON.parse(m[0]); } catch (_) {}
                    }
                }
            }
            twApplyHud(status);
            return status;
        } catch (e) {
            twApplyHud(null);
            return null;
        }
    }

    let twHudTimer = null;
    function twStartHudPoll() {
        twStopHudPoll();
        twRefreshHud();
        twHudTimer = setInterval(() => twRefreshHud(), 2500);
    }
    function twStopHudPoll() {
        if (twHudTimer) {
            clearInterval(twHudTimer);
            twHudTimer = null;
        }
    }

    async function twPollReadyAndBuild() {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 4000));
            const ok = await twTestConnection({ silent: true });
            if (ok) {
                if (typeof logToDashboard === 'function') {
                    logToDashboard('🏰 Tower Wars พร้อม — ลอยดู · พิมพ์ 1/A หรือ 2/B', '#e67e22');
                }
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'Tower Wars พร้อม', 'สตรีมเมอร์ลอยดู · พิมพ์ 1/A หรือ 2/B เพื่อเข้าทีม');
                }
                twStartHudPoll();
                return;
            }
        }
    }

    async function twTestConnection(opts = {}) {
        twSaveConnection();
        try {
            if (typeof executeGameModCommandDetailed !== 'function') throw new Error('API ไม่พร้อม');
            const cfg = getTwConfig();
            const res = await executeGameModCommandDetailed('tower-wars', 'list', cfg.connection || {}, {
                awaitResponse: true
            });
            if (!res || res.ok === false) throw new Error(res?.error || res?.message || 'RCON failed');
            const el = document.getElementById('twConnStatus');
            if (el) {
                el.textContent = '● RCON พร้อม';
                el.style.color = '#2ecc71';
            }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'RCON เชื่อมต่อได้', res.message || 'ok');
            }
            return true;
        } catch (e) {
            const el = document.getElementById('twConnStatus');
            if (el) {
                el.textContent = '○ เชื่อมต่อไม่ได้';
                el.style.color = '#ff6b81';
            }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'RCON ไม่พร้อม', e.message || 'เปิดเซิร์ฟเวอร์ก่อน');
            }
            return false;
        }
    }

    function twResolveBuiltinGift(gift) {
        const name = String(gift.giftName || '').toLowerCase().trim();
        const coins = parseInt(gift.diamondCount || gift.diamond_count || 0, 10) || 0;
        if (coins >= 499) return 'tw_big';
        if (name === 'rose' || name.includes('กุหลาบ')) return 'tw_wave_normal';
        if (name === 'mini heart' || name.includes('miniheart') || name.includes('มินิ')) return 'tw_wave_tnt';
        if (name.includes('paper crane') || name.includes('crane') || name.includes('กระดาษ')) return 'tw_debuff';
        if (name === 'finger heart' || name.includes('fingerheart')) return 'tw_supply';
        if (name === 'donut' || name.includes('โดนัท')) return 'tw_defender';
        if (name === 'perfume' || name.includes('น้ำหอม') || name === 'tiktok') return 'tw_buff';
        if (name.includes('universe') || name.includes('lion') || name.includes('castle')) return 'tw_big';
        return null;
    }

    const twTriggerCounters = {};

    function handleTwGift(gift) {
        if (typeof isAppPro === 'function' && !isAppPro() && typeof canPlayGame === 'function') {
            const play = canPlayGame('tower-wars');
            if (!play?.ok) return false;
        }
        if (!twIsLive()) return false;
        if (Number(gift?.giftType) === 1 && gift?.repeatEnd === false) return false;
        const cfg = getTwConfig();
        if (!cfg.enabled) return false;
        const user = gift.uniqueId || gift.nickname || 'viewer';
        let fired = false;
        let matchedTrigger = false;

        const fire = (tr, _user, qty) => {
            const action = tr.action || 'tw_wave_normal';
            const n = Math.max(1, Math.min(10, qty || 1));
            const label = (TW_ACTIONS.find((a) => a.value === action) || {}).label || action;
            const qtyNote = n > 1 ? ` ×${n}` : '';
            (async () => {
                // คอมโบ X5/X10 = ยิงคลื่น/TNT ตามจำนวน (cap 10) — ไม่ยิงซ้ำจาก mid-combo
                for (let i = 0; i < n; i++) await twRunAction(action);
                if (global.McServerUI) global.McServerUI.announceViewer(user, label + qtyNote);
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🏰 Tower Wars: @${user} → ${action}${qtyNote}`, '#e67e22');
                }
            })().catch((e) => {
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🏰 Tower Wars error: ${e.message}`, '#ff6b81');
                }
            });
            fired = true;
            matchedTrigger = true;
        };

        const UI = global.MapTriggerUI;
        if (UI && typeof UI.matchGiftTriggers === 'function') {
            const result = UI.matchGiftTriggers(cfg.triggers || [], gift, fire, twTriggerCounters, TW_ACTIONS);
            fired = !!result.fired;
            matchedTrigger = !!result.matched;
        } else {
            const giftQty = Math.max(1, parseInt(gift.repeatCount || gift.giftCount || 1, 10) || 1);
            for (const tr of (cfg.triggers || [])) {
                if (tr.enabled === false) continue;
                if ((tr.type || 'gift') !== 'gift') continue;
                const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
                const matchName = tr.giftName && String(gift.giftName || '').toLowerCase().trim() === String(tr.giftName).toLowerCase().trim();
                if (!matchId && !matchName) continue;
                fire(tr, user, giftQty);
            }
        }

        if (!matchedTrigger) {
            const builtin = twResolveBuiltinGift(gift);
            if (builtin) {
                const n = Math.max(1, Math.min(10, parseInt(gift.repeatCount || gift.giftCount || 1, 10) || 1));
                const label = (TW_ACTIONS.find((a) => a.value === builtin) || {}).label || builtin;
                const qtyNote = n > 1 ? ` ×${n}` : '';
                (async () => {
                    for (let i = 0; i < n; i++) await twRunAction(builtin);
                    if (global.McServerUI) global.McServerUI.announceViewer(user, label + qtyNote);
                    if (typeof logToDashboard === 'function') {
                        logToDashboard(`🏰 Tower Wars: @${user} → ${builtin}${qtyNote}`, '#e67e22');
                    }
                })().catch(() => {});
                fired = true;
            }
        }
        return fired;
    }

    function handleTwLiveEvent(eventType, data) {
        if (!twIsLive()) return false;
        const cfg = getTwConfig();
        if (!cfg.enabled) return false;
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.matchLiveEvent !== 'function') return false;
        return UI.matchLiveEvent(cfg.triggers || [], eventType, data, (tr) => {
            const action = tr.action || 'tw_wave_normal';
            const label = (TW_ACTIONS.find((a) => a.value === action) || {}).label || action;
            const who = data?.nickname || data?.uniqueId || 'viewer';
            twRunAction(action).then(() => {
                if (global.McServerUI) global.McServerUI.announceViewer(who, label);
            }).catch(() => {});
        }, twTriggerCounters, TW_ACTIONS);
    }

    function handleTwLike(data) {
        let fired = false;
        if (handleTwLiveEvent('like', data)) fired = true;
        if (handleTwLiveEvent('globallikes', data)) fired = true;
        return fired;
    }

    function twAddTrigger() {
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.open !== 'function') return;
        UI.open({
            title: 'ทริกเกอร์ Tower Wars',
            actions: TW_ACTIONS,
            defaultAction: 'tw_wave_normal',
            onSave: (payload) => {
                const cfg = getTwConfig();
                cfg.triggers = cfg.triggers || [];
                cfg.triggers.push(payload);
                saveTwConfig(cfg);
                renderTwTriggers();
            }
        });
    }

    function twRemoveTrigger(id) {
        const cfg = getTwConfig();
        cfg.triggers = (cfg.triggers || []).filter((t) => String(t.id) !== String(id));
        saveTwConfig(cfg);
        renderTwTriggers();
    }

    function twUpdateTrigger(id, key, val) {
        const cfg = getTwConfig();
        const tr = (cfg.triggers || []).find((t) => String(t.id) === String(id));
        if (tr) {
            if (key === 'action' && tr.type === 'random' && global.MapTriggerUI && MapTriggerUI.applyActionPick) {
                MapTriggerUI.applyActionPick(tr, val, TW_ACTIONS);
            } else {
                tr[key] = val;
            }
            saveTwConfig(cfg);
        }
    }

    const TW_ACTIONS = [
        { value: 'tw_wave_normal', label: '🧟 คลื่นมอนสเตอร์' },
        { value: 'tw_wave_tnt', label: '💥 TNT ตกใส่ป้อม' },
        { value: 'tw_wave_boss', label: '☠️ Boss Wave' },
        { value: 'tw_debuff', label: '😵 Debuff' },
        { value: 'tw_supply', label: '🧱 เสบียงซ่อม' },
        { value: 'tw_defender', label: '🤖 Iron Golem' },
        { value: 'tw_buff', label: '💪 Buff' },
        { value: 'tw_big', label: '🎁 ของใหญ่' },
        { value: 'tw_build', label: '🏰 สร้างแมพ' },
        { value: 'tw_clear', label: '🧹 เคลียร์มอน' },
        { value: 'tw_clear_wall', label: '🧱 ลบกำแพง' }
    ];

    async function renderTwTriggers() {
        const list = document.getElementById('twTriggerList');
        if (!list) return;
        const triggers = getTwConfig().triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์» เพื่อตั้งแบบ Box Control</p>';
            return;
        }
        const UI = global.MapTriggerUI;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, TW_ACTIONS, {
                    prefix: 'tw',
                    giftOnclick: `twPickGift(${tr.id})`,
                    actionOnclick: `twUpdateTrigger(${tr.id}, 'action', '{value}'); renderTwTriggers();`,
                    testOnclick: `twTestAction('${tr.action}')`,
                    removeOnclick: `twRemoveTrigger(${tr.id})`
                });
            }
            return '';
        }).join('');
        twApplyAdminOnlyUi();
    }

    function twIsAppAdmin() {
        try {
            if (typeof isAppAdmin === 'function') return !!isAppAdmin();
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
        } catch (e) {}
        return false;
    }

    function twApplyAdminOnlyUi() {
        const admin = twIsAppAdmin();
        document.querySelectorAll('#gcTowerWarsView .tw-admin-only, #gcTowerWarsView .mc-admin-only').forEach((el) => {
            el.style.display = admin ? '' : 'none';
        });
        const nav = document.querySelector('#gcTowerWarsView .mc-section-nav');
        if (nav) nav.classList.toggle('mc-section-nav--no-test', !admin);
        if (!admin) {
            const actions = document.getElementById('twSectionActions');
            if (actions && (actions.classList.contains('active') || actions.style.display !== 'none')) {
                switchTwSection('server');
            }
        }
    }

    function twPickGift(id) {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญ Tower Wars',
            onSelect: (gift) => {
                twUpdateTrigger(id, 'giftName', gift.giftName);
                twUpdateTrigger(id, 'giftId', String(gift.giftId || ''));
                twUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderTwTriggers();
            }
        });
    }

    async function renderTwQuickActions() {
        const grid = document.getElementById('twQuickActions');
        if (!grid) return;
        const cat = await loadTwCatalog();
        grid.innerHTML = (cat.actions || []).map((a) => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${a.type || 'help'}"
                onclick="twTestAction('${a.cmd}')" title="${a.label}">
                <span>${a.emoji}</span><small>${a.label}</small>
            </button>
        `).join('');
    }

    function switchTwTopTab(tab) {
        document.getElementById('twTabSettings')?.classList.toggle('active', tab === 'settings');
        document.getElementById('twTabTrigger')?.classList.toggle('active', tab === 'trigger');
        const settings = document.getElementById('twSettingsPanel');
        const trigger = document.getElementById('twTriggerPanel');
        if (settings) settings.style.display = tab === 'settings' ? 'flex' : 'none';
        if (trigger) {
            trigger.style.display = tab === 'trigger' ? 'flex' : 'none';
            if (tab === 'trigger') trigger.style.flexDirection = 'column';
        }
        if (tab === 'trigger') renderTwTriggers();
    }

    function switchTwSection(section) {
        const ids = ['server', 'actions'];
        const navMap = { server: 'twNavServer', actions: 'twNavActions' };
        const secMap = { server: 'twSectionServer', actions: 'twSectionActions' };
        ids.forEach((id) => {
            const el = document.getElementById(secMap[id]);
            const nav = document.getElementById(navMap[id]);
            const on = id === section;
            if (el) {
                el.style.display = on ? '' : 'none';
                el.classList.toggle('active', on);
            }
            if (nav) nav.classList.toggle('active', on);
        });
        if (section === 'server') refreshTwServerStatus();
        if (section === 'actions') {
            renderTwQuickActions();
            twStartHudPoll();
        }
    }

    function twUpdateServerButtons(data) {
        const UI = global.McServerUI;
        if (UI) {
            UI.applyActionButtons({
                setup: 'twSetupBtn',
                start: 'twStartBtn',
                stop: 'twStopBtn',
                reset: 'twResetBtn',
                java: 'twJavaBtn',
                settings: 'twSettingsBtn'
            }, data);
        }
        const recheck = document.getElementById('twJavaRecheckBtn');
        if (recheck) recheck.style.display = data?.javaOk === false ? '' : 'none';
    }

    async function twInstallJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.installJava();
        await refreshTwServerStatus();
    }

    async function twRecheckJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.recheckJava();
        await refreshTwServerStatus();
    }

    async function refreshTwServerStatus() {
        const el = document.getElementById('twServerStatus');
        const joinEl = document.getElementById('twJoinAddress');
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('tower');
            if (joinEl && data.join) joinEl.textContent = data.join;
            if (data.rcon) {
                const host = document.getElementById('twConnHost');
                const port = document.getElementById('twConnPort');
                const pass = document.getElementById('twConnPass');
                const cfg = getTwConfig();
                if (host && (!host.value || host.value === TW_DEFAULT_HOST)) host.value = TW_DEFAULT_HOST;
                if (port && data.rcon.port) port.value = data.rcon.port;
                if (pass && data.rcon.password && (!cfg.connection?.password || cfg.connection.password === TW_DEFAULT_PASS || !pass.value)) {
                    pass.value = data.rcon.password;
                }
                twSaveConnection();
            }
            if (!el) {
                twUpdateServerButtons(data);
                return data;
            }
            if (global.McServerUI) {
                global.McServerUI.fillRequirementBanner(document.getElementById('twReqBanner'), data);
            }
            el.textContent = global.McServerUI
                ? global.McServerUI.formatStatusLine(data, 'tower')
                : [
                    data.installed ? '✅ ติดตั้งเซิร์ฟ Tower แล้ว' : '⬜ ยังไม่ติดตั้ง',
                    data.running ? '🟢 กำลังรัน' : '⚫ ปิด'
                ].join(' · ');
            el.classList.toggle('mc-server-status--on', !!data.running);
            twUpdateServerButtons(data);
            return data;
        } catch (e) {
            if (el) el.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
            return null;
        }
    }

    async function twSetupServer() {
        const btn = document.getElementById('twSetupBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังดาวน์โหลด / ติดตั้ง...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.setupServer('tower', {
                onProgress: (_p, line) => {
                    const el = document.getElementById('twServerStatus');
                    if (el) el.textContent = line;
                }
            });
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'ติดตั้งแพ็กเกจแล้ว', 'กด «เริ่มเซิร์ฟเวอร์» เมื่อพร้อม · RCON ค่าเริ่มต้น tokcontrol — เปลี่ยนรหัสก่อนเปิดเซิร์ฟสาธารณะ');
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '📦 ดาวน์โหลด / ติดตั้งแพ็กเกจ'; }
            refreshTwServerStatus();
        }
    }

    async function twStartServer() {
        const btn = document.getElementById('twStartBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังเริ่ม...'; }
        try {
            const status = await refreshTwServerStatus();
            if (!status?.javaOk) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อน');
                }
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.startServer('tower');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'เริ่มเซิร์ฟเวอร์ Tower Wars', `เข้าเกมที่ ${data.join || 'localhost:25565'} — แมพสร้างอัตโนมัติ`);
                }
                twPollReadyAndBuild();
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เริ่มไม่ได้', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เริ่มไม่ได้', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '▶ เริ่มเซิร์ฟเวอร์'; }
            refreshTwServerStatus();
        }
    }

    async function twStopServer() {
        const btn = document.getElementById('twStopBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังปิด...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.stopServer();
            if (data.success && typeof showCustomMsg === 'function') {
                showCustomMsg('info', 'ปิดเซิร์ฟเวอร์แล้ว', '');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ปิดไม่ได้', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⏹ ปิดเซิร์ฟเวอร์'; }
            refreshTwServerStatus();
        }
    }

    async function twResetServer() {
        if (!confirm('ลบแมพ Tower Wars และติดตั้งเซิร์ฟใหม่?\n(ปิดเซิร์ฟ + ลบ world)')) return;
        const btn = document.getElementById('twResetBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังลบ...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.resetServer('tower');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'โหลดใหม่แล้ว', 'กดเปิดเซิร์ฟ — แล้วสร้างแมพปราสาท');
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ลบไม่สำเร็จ', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ลบไม่สำเร็จ', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ ลบ & โหลดใหม่'; }
            refreshTwServerStatus();
        }
    }

    function twCopyJoinAddress() {
        const addr = document.getElementById('twJoinAddress')?.textContent || 'localhost:25565';
        if (global.McServerUI?.copyJoinAddress) {
            global.McServerUI.copyJoinAddress(addr);
        } else if (typeof copyTextToClipboard === 'function') {
            copyTextToClipboard(addr);
        } else {
            navigator.clipboard?.writeText(addr);
        }
        if (typeof showCustomMsg === 'function') showCustomMsg('info', 'คัดลอกแล้ว', addr);
    }

    async function twOpenServerFolder() {
        if (global.McServerUI?.openServerFolder) {
            await global.McServerUI.openServerFolder('tower');
            return;
        }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('tower');
            if (data.path) {
                try {
                    const { shell } = window.electron || {};
                    if (shell?.openPath) await shell.openPath(data.path);
                    else if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                } catch (e) {
                    if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                }
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เปิดโฟลเดอร์ไม่ได้', e.message);
        }
    }

    async function renderTwProfile() {
        const cfg = getTwConfig();
        const enabled = document.getElementById('twGameEnabled');
        if (enabled) enabled.checked = !!cfg.enabled;
        const host = document.getElementById('twConnHost');
        const port = document.getElementById('twConnPort');
        const pass = document.getElementById('twConnPass');
        if (host) host.value = cfg.connection?.host || TW_DEFAULT_HOST;
        if (port) port.value = cfg.connection?.port || TW_DEFAULT_PORT;
        if (pass) pass.value = cfg.connection?.password || '';
        await renderTwQuickActions();
        renderTwTriggers();
        twApplyAdminOnlyUi();
        switchTwTopTab('settings');
        switchTwSection('server');
        refreshTwServerStatus();
        twStartHudPoll();
    }

    global.getTwConfig = getTwConfig;
    global.saveTwConfig = saveTwConfig;
    global.twToggleEnabled = twToggleEnabled;
    global.twSaveConnection = twSaveConnection;
    global.twTestConnection = twTestConnection;
    global.twBuildMap = twBuildMap;
    global.twStartPrep = twStartPrep;
    global.twBeginBattle = twBeginBattle;
    global.twTestAction = twTestAction;
    global.twTestTeam = twTestTeam;
    global.twRefreshHud = twRefreshHud;
    global.twAddTrigger = twAddTrigger;
    global.renderTwTriggers = renderTwTriggers;
    global.twApplyAdminOnlyUi = twApplyAdminOnlyUi;
    global.twRemoveTrigger = twRemoveTrigger;
    global.twUpdateTrigger = twUpdateTrigger;
    global.twPickGift = twPickGift;
    global.handleTwGift = handleTwGift;
    global.handleTwLike = handleTwLike;
    global.handleTwLiveEvent = handleTwLiveEvent;
    global.renderTwProfile = renderTwProfile;
    global.switchTwTopTab = switchTwTopTab;
    global.switchTwSection = switchTwSection;
    global.twSetupServer = twSetupServer;
    global.twStartServer = twStartServer;
    global.twStopServer = twStopServer;
    global.twResetServer = twResetServer;
    global.twCopyJoinAddress = twCopyJoinAddress;
    global.twOpenServerFolder = twOpenServerFolder;
    global.refreshTwServerStatus = refreshTwServerStatus;
    global.twInstallJavaThenRefresh = twInstallJavaThenRefresh;
    global.twRecheckJavaThenRefresh = twRecheckJavaThenRefresh;

    global.addEventListener('mc-server-changed', (ev) => {
        if (ev?.detail?.world === 'tower') refreshTwServerStatus();
    });
})(typeof window !== 'undefined' ? window : global);
