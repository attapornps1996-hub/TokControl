/**
 * Fish Control — TokControl Game Center panel (TikTok gifts → RCON fishing pond)
 */
(function (global) {
    'use strict';

    const FC_STORAGE_KEY = 'tokcontrol_fish_control';
    const FC_DEFAULT_HOST = '127.0.0.1';
    const FC_DEFAULT_PORT = 25575;
    const FC_DEFAULT_PASS = 'tokcontrol'; // first-run local default — change before a public Minecraft server
    let fcCatalog = null;

    function getFcDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', action: 'fc_increase_fish', amount: 1 },
            { id: 2, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', action: 'fc_decrease_fish', amount: 1 },
            { id: 3, enabled: true, type: 'gift', giftName: 'GG', giftId: '', action: 'fc_auto_fish' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Ice Cream Cone', giftId: '', action: 'fc_villager_help', amount: 1 },
            { id: 5, enabled: true, type: 'gift', giftName: 'Mini Heart', giftId: '', action: 'fc_spawn_zombie', amount: 1 },
            { id: 6, enabled: true, type: 'gift', giftName: 'Donut', giftId: '', action: 'fc_spawn_golem', amount: 1 },
            { id: 7, enabled: true, type: 'gift', giftName: 'Cap', giftId: '', action: 'fc_wall' }
        ];
    }

    function getFcDefaultConfig() {
        return {
            enabled: false,
            connection: {
                type: 'rcon',
                host: FC_DEFAULT_HOST,
                port: FC_DEFAULT_PORT,
                password: FC_DEFAULT_PASS
            },
            triggers: getFcDefaultTriggers()
        };
    }

    function getFcConfig() {
        try {
            const raw = localStorage.getItem(FC_STORAGE_KEY);
            if (raw) {
                const cfg = { ...getFcDefaultConfig(), ...JSON.parse(raw) };
                cfg.triggers = (cfg.triggers || []).map((tr) => {
                    if (!tr) return tr;
                    if (tr.action === 'fc_spawn_zombie' || tr.action === 'fc_spawn_golem'
                        || tr.action === 'fc_increase_fish' || tr.action === 'fc_decrease_fish'
                        || tr.action === 'fc_plus_win' || tr.action === 'fc_minus_win'
                        || tr.action === 'fc_villager_help') {
                        const amt = Math.max(1, Math.min(99, parseInt(tr.amount ?? tr.count, 10) || 1));
                        return { ...tr, amount: amt, count: amt };
                    }
                    return tr;
                });
                return cfg;
            }
        } catch (e) {}
        return getFcDefaultConfig();
    }

    function saveFcConfig(cfg) {
        localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(cfg));
    }

    async function loadFcCatalog() {
        if (fcCatalog) return fcCatalog;
        try {
            const res = await fetch('/data/fish_control_catalog.json');
            fcCatalog = await res.json();
        } catch (e) {
            fcCatalog = { actions: [], default_triggers: [] };
        }
        return fcCatalog;
    }

    function fcIsLive() {
        if (typeof isGameLiveActive === 'function') return isGameLiveActive('fish-control');
        return !!getFcConfig().enabled;
    }

    function fcToggleEnabled(checked) {
        const cfg = getFcConfig();
        cfg.enabled = !!checked;
        saveFcConfig(cfg);
        if (typeof setGameLiveActive === 'function') {
            setGameLiveActive('fish-control', !!checked);
        } else if (checked && typeof setActiveGameModId === 'function') {
            setActiveGameModId('fish-control');
        }
        if (checked) fcStartQuotaPoll();
        else fcStopQuotaPoll();
    }

    function fcSaveConnection() {
        const cfg = getFcConfig();
        const host = document.getElementById('fcConnHost')?.value?.trim() || FC_DEFAULT_HOST;
        const port = parseInt(document.getElementById('fcConnPort')?.value, 10) || FC_DEFAULT_PORT;
        const password = document.getElementById('fcConnPass')?.value || '';
        cfg.connection = { type: 'rcon', host, port, password };
        saveFcConfig(cfg);
    }

    function makeFcRconBridge() {
        const cfg = getFcConfig();
        const conn = cfg.connection || {};
        return {
            async send(command) {
                if (typeof executeGameModCommandDetailed !== 'function') {
                    throw new Error('executeGameModCommandDetailed ไม่พร้อม');
                }
                const res = await executeGameModCommandDetailed('fish-control', command, conn, {
                    awaitResponse: true,
                    fireAndForget: false
                });
                if (!res || res.ok === false) throw new Error(res?.error || res?.message || 'RCON failed');
                return res;
            }
        };
    }

    /** ส่ง action เป็น JSON ครั้งเดียว → server รัน FishingMapManager ผ่าน RCON จริง */
    async function fcRunAction(action, opts = {}) {
        if (typeof executeGameModCommandDetailed !== 'function') {
            throw new Error('executeGameModCommandDetailed ไม่พร้อม');
        }
        const cfg = getFcConfig();
        const payload = JSON.stringify({ action, ...(opts || {}) });
        const res = await executeGameModCommandDetailed('fish-control', payload, cfg.connection || {}, {
            awaitResponse: true,
            fireAndForget: false
        });
        if (!res || res.ok === false) {
            throw new Error(res?.error || res?.message || 'Fish Control action failed');
        }
        return res.detail || { ok: true, ...res };
    }

    async function fcBuildMap() {
        try {
            fcSaveConnection();
            const res = await fcRunAction('fc_build');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok ? 'success' : 'warning', 'สร้างท่าเรือ',
                    res.ok ? 'ท่าเรือพร้อม — HUD มุมซ้าย · ไม่มี bossbar ทับ' : `บางคำสั่งล้มเหลว (${res.errors?.length || 0})`);
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard('🎣 Fish Control: สร้างท่าเรือตกปลา', '#00bcd4');
            }
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สร้างแมพไม่ได้', e.message || 'ตรวจ RCON host/port/รหัส');
            }
            return { ok: false, error: e.message };
        }
    }

    async function fcTestAction(actionId, amount) {
        try {
            fcSaveConnection();
            const opts = fcBuildActionOpts(actionId, { amount: amount }, 1);
            const res = await fcRunAction(actionId, opts);
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok ? 'success' : 'warning', 'Fish Control',
                    fcActionAnnounceLabel(actionId, opts));
            }
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || '');
            }
            return { ok: false, error: e.message };
        }
    }

    async function fcTestTrigger(id) {
        const tr = (getFcConfig().triggers || []).find((t) => String(t.id) === String(id));
        if (!tr) return fcTestAction('fc_increase_fish');
        return fcTestAction(tr.action, tr.amount);
    }

    async function fcTestConnection(opts = {}) {
        fcSaveConnection();
        try {
            const rcon = makeFcRconBridge();
            const res = await rcon.send('list');
            const el = document.getElementById('fcConnStatus');
            if (el) {
                el.textContent = '● RCON พร้อม';
                el.style.color = '#2ecc71';
            }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'RCON เชื่อมต่อได้', res.message || res.body || 'ok');
            }
            return true;
        } catch (e) {
            const el = document.getElementById('fcConnStatus');
            if (el) {
                el.textContent = '○ เชื่อมต่อไม่ได้';
                el.style.color = '#ff6b81';
            }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'RCON ไม่พร้อม', e.message || 'เปิดเซิร์ฟเวอร์ก่อน แล้วรอโหลดเสร็จ');
            }
            return false;
        }
    }

    function fcResolveBuiltinGift(gift) {
        const name = String(gift.giftName || '').toLowerCase().trim();
        if (name === 'rose' || name.includes('กุหลาบ')) return 'fc_increase_fish';
        if (name === 'finger heart' || name.includes('fingerheart')) return 'fc_decrease_fish';
        if (name === 'gg' || name === 'good game' || name.includes('ช่วยตก')) return 'fc_auto_fish';
        if (name.includes('ice cream') || name.includes('ชาวบ้าน') || name.includes('villager')) return 'fc_villager_help';
        if (name === 'mini heart' || name.includes('miniheart') || name.includes('มินิ')) return 'fc_spawn_zombie';
        if (name === 'donut' || name.includes('โดนัท')) return 'fc_spawn_golem';
        if (name === 'cap' || name.includes('หมวก')) return 'fc_wall';
        return null;
    }

    const fcTriggerCounters = {};

    function handleFcGift(gift) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('fish-control').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (!fcIsLive()) return false;
        // กันคอมโบกลางทาง — รอจบคอมโบแล้วยิงครั้งเดียวตาม repeatCount
        if (Number(gift?.giftType) === 1 && gift?.repeatEnd === false) return false;
        const cfg = getFcConfig();
        if (!cfg.enabled) return false;
        const user = gift.uniqueId || gift.nickname || 'viewer';
        let fired = false;
        let matchedTrigger = false;

        const fire = (tr, _user, qty) => {
            const action = tr.action || 'fc_add_trash';
            const n = Math.max(1, qty || 1);
            const opts = fcBuildActionOpts(action, tr, n);
            const label = fcActionAnnounceLabel(action, opts);
            fcRunAction(action, opts).then(() => {
                // ±WIN มี title จากอนิเมชันแล้ว — ไม่ซ้ำ announce กลางจอ
                if (action !== 'fc_plus_win' && action !== 'fc_minus_win') {
                    if (global.McServerUI) global.McServerUI.announceViewer(user, label);
                }
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🎣 Fish Control: @${user} → ${label}`, '#00bcd4');
                }
            }).catch((e) => {
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🎣 Fish Control error: ${e.message}`, '#ff6b81');
                }
            });
            fired = true;
            matchedTrigger = true;
        };

        const UI = global.MapTriggerUI;
        if (UI && typeof UI.matchGiftTriggers === 'function') {
            const result = UI.matchGiftTriggers(cfg.triggers || [], gift, fire, fcTriggerCounters, FC_ACTIONS);
            fired = !!result.fired;
            matchedTrigger = !!result.matched;
        } else {
            for (const tr of (cfg.triggers || [])) {
                if (tr.enabled === false) continue;
                if ((tr.type || 'gift') !== 'gift') continue;
                const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
                const matchName = tr.giftName && String(gift.giftName || '').toLowerCase().trim() === String(tr.giftName).toLowerCase().trim();
                if (!matchId && !matchName) continue;
                fire(tr, user, Math.max(1, parseInt(gift.repeatCount || gift.giftCount || 1, 10) || 1));
            }
        }

        if (!matchedTrigger) {
            const builtin = fcResolveBuiltinGift(gift);
            if (builtin) {
                const qty = Math.max(1, parseInt(gift.repeatCount || gift.giftCount || gift.repeat_count || 1, 10) || 1);
                const opts = fcBuildActionOpts(builtin, null, qty);
                const label = fcActionAnnounceLabel(builtin, opts);
                fcRunAction(builtin, opts).then(() => {
                    if (builtin !== 'fc_plus_win' && builtin !== 'fc_minus_win') {
                        if (global.McServerUI) global.McServerUI.announceViewer(user, label);
                    }
                    if (typeof logToDashboard === 'function') {
                        logToDashboard(`🎣 Fish Control: @${user} → ${label}`, '#00bcd4');
                    }
                }).catch(() => {});
                fired = true;
            }
        }
        return fired;
    }

    function handleFcLiveEvent(eventType, data) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('fish-control').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (!fcIsLive()) return false;
        const cfg = getFcConfig();
        if (!cfg.enabled) return false;
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.matchLiveEvent !== 'function') return false;
        return UI.matchLiveEvent(cfg.triggers || [], eventType, data, (tr) => {
            const action = tr.action || 'fc_add_trash';
            const opts = fcBuildActionOpts(action, tr, 1);
            const label = fcActionAnnounceLabel(action, opts);
            const who = data?.nickname || data?.uniqueId || 'viewer';
            fcRunAction(action, opts).then(() => {
                if (global.McServerUI) global.McServerUI.announceViewer(who, label);
            }).catch(() => {});
        }, fcTriggerCounters, FC_ACTIONS);
    }

    /** Seconds / amount opts — จำนวนจากทริกเกอร์ × จำนวนของขวัญ */
    function fcBuildActionOpts(action, tr, qty) {
        const n = Math.max(1, qty || 1);
        // อ่าน amount หรือ count จากทริกเกอร์ (ช่อง «ตัว» ใน UI)
        const per = Math.max(1, Math.min(99,
            parseInt(tr?.amount ?? tr?.count ?? tr?.qty, 10) || 1));
        if (action === 'fc_increase_fish' || action === 'fc_decrease_fish') {
            return { amount: per * n };
        }
        if (action === 'fc_plus_win' || action === 'fc_minus_win') {
            return { amount: per * n };
        }
        if (action === 'fc_spawn_zombie' || action === 'fc_spawn_golem') {
            const total = Math.max(1, Math.min(30, per * n));
            return { amount: total, count: total };
        }
        if (action === 'fc_villager_help') {
            const total = Math.max(1, Math.min(20, per * n));
            return { amount: total, count: total };
        }
        if (action === 'fc_auto_fish') {
            return { seconds: Math.max(1, parseInt(tr?.seconds, 10) || 10) * n };
        }
        if (action === 'fc_multi_fish' || action === 'fc_demulti_fish') {
            return { amount: n };
        }
        if (action === 'fc_wall') {
            return { seconds: Math.max(3, parseInt(tr?.seconds, 10) || 15) * n };
        }
        return {};
    }

    function fcActionAnnounceLabel(action, opts) {
        const amt = Math.max(1, parseInt(opts?.amount ?? opts?.count, 10) || 1);
        if (action === 'fc_plus_win') return `+${amt} WIN`;
        if (action === 'fc_minus_win') return `-${amt} WIN`;
        const base = (FC_ACTIONS.find((a) => a.value === action) || {}).label || action;
        if ((action === 'fc_increase_fish' || action === 'fc_decrease_fish'
            || action === 'fc_spawn_zombie' || action === 'fc_spawn_golem'
            || action === 'fc_villager_help') && amt > 1) {
            return `${base} ×${amt}`;
        }
        return base;
    }

    function handleFcLike(data) {
        let fired = false;
        if (handleFcLiveEvent('like', data)) fired = true;
        if (handleFcLiveEvent('globallikes', data)) fired = true;
        return fired;
    }

    function fcAddTrigger() {
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.open !== 'function') return;
        UI.open({
            title: 'ทริกเกอร์ Fish Control',
            actions: FC_ACTIONS,
            defaultAction: 'fc_increase_fish',
            showSecondsFor: ['fc_auto_fish', 'fc_wall'],
            showWinAmountFor: ['fc_increase_fish', 'fc_decrease_fish', 'fc_plus_win', 'fc_minus_win', 'fc_spawn_zombie', 'fc_spawn_golem', 'fc_villager_help'],
            amountLabel: 'จำนวน',
            defaultAmount: 1,
            onSave: (payload) => {
                const cfg = getFcConfig();
                cfg.triggers = cfg.triggers || [];
                if (payload.action === 'fc_increase_fish' || payload.action === 'fc_decrease_fish'
                    || payload.action === 'fc_plus_win' || payload.action === 'fc_minus_win'
                    || payload.action === 'fc_spawn_zombie' || payload.action === 'fc_spawn_golem'
                    || payload.action === 'fc_villager_help') {
                    payload.amount = Math.max(1, Math.min(99, parseInt(payload.amount, 10) || 1));
                }
                cfg.triggers.push(payload);
                saveFcConfig(cfg);
                renderFcTriggers();
            }
        });
    }

    function fcRemoveTrigger(id) {
        const cfg = getFcConfig();
        cfg.triggers = (cfg.triggers || []).filter((t) => String(t.id) !== String(id));
        saveFcConfig(cfg);
        renderFcTriggers();
    }

    function fcUpdateTrigger(id, key, val) {
        const cfg = getFcConfig();
        const tr = (cfg.triggers || []).find((t) => String(t.id) === String(id));
        if (tr) {
            if (key === 'amount' || key === 'count') {
                tr.amount = Math.max(1, Math.min(99, parseInt(val, 10) || 1));
                tr.count = tr.amount;
            } else if (key === 'action' && tr.type === 'random' && global.MapTriggerUI && MapTriggerUI.applyActionPick) {
                MapTriggerUI.applyActionPick(tr, val, FC_ACTIONS);
            } else {
                tr[key] = val;
            }
            // สลับมาเสกซอมบี้/โกเลม — ถ้ายังไม่มีจำนวน ให้เป็น 1
            if (key === 'action' && (val === 'fc_spawn_zombie' || val === 'fc_spawn_golem')) {
                if (!tr.amount || tr.amount < 1) tr.amount = 1;
            }
            saveFcConfig(cfg);
        }
    }

    const FC_ACTIONS = [
        { value: 'fc_increase_fish', label: '📈 +เป้าหมายปลา' },
        { value: 'fc_decrease_fish', label: '📉 -เป้าหมายปลา' },
        { value: 'fc_plus_win', label: '🏆 บวกวิน' },
        { value: 'fc_minus_win', label: '💀 ลบวิน' },
        { value: 'fc_auto_fish', label: '⚡ ช่วยตก 10วิ' },
        { value: 'fc_multi_fish', label: '🐟 อัพเกรดตก +1/ครั้ง' },
        { value: 'fc_demulti_fish', label: '🪝 อัพเกรดตก -1/ครั้ง' },
        { value: 'fc_villager_help', label: '👨‍🌾 ชาวบ้านช่วยตก -1' },
        { value: 'fc_spawn_zombie', label: '🧟 เสกซอมบี้' },
        { value: 'fc_spawn_golem', label: '🤖 เสกโกเลม' },
        { value: 'fc_clear_golem', label: '🧹 เคลียร์โกเลม' },
        { value: 'fc_wall', label: '🧱 กำแพงท่าเรือ 15วิ' },
        { value: 'fc_build', label: '⚓ สร้างท่าเรือใหม่' },
        { value: 'fc_refresh_quota', label: '🔄 รีเฟรชโควต้า' }
    ];

    let fcQuotaPollTimer = null;
    let fcStatusPollTimer = null;
    let fcWinPollTimer = null;

    function fcApplyWinDelta(delta, label) {
        if (!delta) return;
        try {
            const raw = localStorage.getItem('win_settings');
            const s = raw ? JSON.parse(raw) : {};
            if (s.autoLinkFishControl === false) {
                s.autoLinkFishControl = true;
                localStorage.setItem('win_settings', JSON.stringify(s));
                if (typeof window !== 'undefined' && window.winSettings) {
                    window.winSettings.autoLinkFishControl = true;
                }
                const el = document.getElementById('winSetting-autoLinkFishControl');
                if (el) el.checked = true;
            }
        } catch (e) {}

        const apply = (typeof window !== 'undefined' && typeof window.changeCount === 'function')
            ? window.changeCount
            : (typeof global.changeCount === 'function' ? global.changeCount : null);

        // เรียก changeCount โดยตรง — ไม่พึ่ง mcApplyWinCounter (กันชนกับ Box)
        if (apply) {
            apply(delta);
        } else {
            const cur = parseInt(localStorage.getItem('win_cur') || '0', 10) || 0;
            const next = cur + delta;
            localStorage.setItem('win_cur', String(next));
            const curEl = document.getElementById('cur');
            if (curEl) curEl.innerText = String(next);
            try {
                if (typeof socket !== 'undefined' && socket?.connected && typeof currentUser !== 'undefined' && currentUser?.streamToken) {
                    const tar = parseInt(localStorage.getItem('win_tar') || '10', 10) || 10;
                    let settings = {};
                    try { settings = JSON.parse(localStorage.getItem('win_settings') || '{}'); } catch (e2) {}
                    socket.emit('send_win_status', {
                        token: currentUser.streamToken,
                        cur: next,
                        tar,
                        settings
                    });
                }
            } catch (e3) {}
        }
        if (typeof logToDashboard === 'function') {
            logToDashboard(`🎣 Fish Control → WIN ${delta > 0 ? '+' : ''}${delta}${label ? ` (${label})` : ''}`, delta > 0 ? '#2ecc71' : '#ff6b81');
        }
    }

    async function fcPollWinDelta() {
        try {
            let delta = 0;
            try {
                const r = await fetch('/api/minecraft/win-delta', { method: 'GET', cache: 'no-store' });
                if (r.ok) {
                    const data = await r.json();
                    delta = Number(data?.pendingWinDelta || 0);
                }
            } catch (e0) {}
            // Do not fall back to /health peek — that would re-apply the same delta every poll.
            if (delta) fcApplyWinDelta(delta, 'Fish Control');
        } catch (e) {}
    }

    let fcLastQuota = null;

    function fcStartQuotaPoll() {
        fcStopQuotaPoll();
        fcQuotaPollTimer = setInterval(() => {
            if (!fcIsLive()) return;
            fcRunAction('fc_refresh_quota').catch(() => {});
        }, 8000);
        fcStartWinPoll();
        fcStartStatusPoll();
    }

    function fcRenderQuotaHud(fish) {
        const remEl = document.getElementById('fcQuotaRemaining');
        const zEl = document.getElementById('fcQuotaZombies');
        const hint = document.getElementById('fcQuotaGoalHint');
        if (!fish || fish.ok === false) {
            // Keep last-known numbers while briefly offline (don't flash —)
            if (fcLastQuota) {
                if (remEl) remEl.textContent = String(Math.max(0, Number(fcLastQuota.remaining) || 0));
                if (zEl) zEl.textContent = String(Math.max(0, Number(fcLastQuota.zombies) || 0));
                if (hint) hint.textContent = `/ ${Math.max(1, Number(fcLastQuota.goal) || 35)}`;
            } else {
                if (remEl) remEl.textContent = '—';
                if (zEl) zEl.textContent = '—';
            }
            return;
        }
        fcLastQuota = {
            remaining: Math.max(0, Number(fish.remaining) || 0),
            zombies: Math.max(0, Number(fish.zombies) || 0),
            goal: Math.max(1, Number(fish.goal) || 35),
            caught: Math.max(0, Number(fish.caught) || 0)
        };
        if (remEl) remEl.textContent = String(fcLastQuota.remaining);
        if (zEl) zEl.textContent = String(fcLastQuota.zombies);
        if (hint) hint.textContent = `/ ${fcLastQuota.goal}`;
        try {
            if (typeof FishingMapManager !== 'undefined' && FishingMapManager.syncQuotaFromServer) {
                FishingMapManager.syncQuotaFromServer(fish);
            }
        } catch (e) {}
    }

    async function fcPollFishStatus() {
        try {
            const res = await fetch('/api/minecraft/fish-status', { cache: 'no-store' });
            const data = await res.json();
            fcRenderQuotaHud(data?.fish);
            return data;
        } catch (e) {
            fcRenderQuotaHud(null);
            return null;
        }
    }

    function fcStartStatusPoll() {
        if (fcStatusPollTimer) return;
        fcPollFishStatus();
        fcStatusPollTimer = setInterval(() => { fcPollFishStatus(); }, 1500);
    }

    function fcStopStatusPoll() {
        if (fcStatusPollTimer) {
            clearInterval(fcStatusPollTimer);
            fcStatusPollTimer = null;
        }
    }

    function fcStartWinPoll() {
        if (fcWinPollTimer) return;
        fcWinPollTimer = setInterval(() => { fcPollWinDelta(); }, 1200);
        fcPollWinDelta();
    }

    function fcStopQuotaPoll() {
        if (fcQuotaPollTimer) {
            clearInterval(fcQuotaPollTimer);
            fcQuotaPollTimer = null;
        }
        // ไม่หยุด win/status poll เมื่อปิดทริกเกอร์ — ยัง sync ชนะ/ตายได้ถ้าเซิร์ฟเปิด
    }

    function fcStopWinPoll() {
        if (fcWinPollTimer) {
            clearInterval(fcWinPollTimer);
            fcWinPollTimer = null;
        }
    }

    async function renderFcTriggers() {
        const list = document.getElementById('fcTriggerList');
        if (!list) return;
        const triggers = getFcConfig().triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์» เพื่อตั้งแบบ Box Control</p>';
            return;
        }
        const UI = global.MapTriggerUI;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, FC_ACTIONS, {
                    prefix: 'fc',
                    giftOnclick: `fcPickGift(${tr.id})`,
                    actionOnclick: `fcUpdateTrigger(${tr.id}, 'action', '{value}'); renderFcTriggers();`,
                    testOnclick: `fcTestTrigger(${tr.id})`,
                    removeOnclick: `fcRemoveTrigger(${tr.id})`,
                    showAmountFor: ['fc_increase_fish', 'fc_decrease_fish', 'fc_plus_win', 'fc_minus_win', 'fc_spawn_zombie', 'fc_spawn_golem', 'fc_villager_help'],
                    amountLabel: (tr.action === 'fc_plus_win' || tr.action === 'fc_minus_win')
                        ? 'วิน'
                        : (tr.action === 'fc_spawn_zombie' || tr.action === 'fc_spawn_golem' || tr.action === 'fc_villager_help')
                            ? 'ตัว'
                            : 'ปลา',
                    amountOnchange: `fcUpdateTrigger(${tr.id}, 'amount', Math.max(1, Math.min(99, parseInt(this.value, 10) || 1)))`
                });
            }
            return '';
        }).join('');
        fcApplyAdminOnlyUi();
    }

    function fcIsAppAdmin() {
        try {
            if (typeof isAppAdmin === 'function') return !!isAppAdmin();
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
        } catch (e) {}
        return false;
    }

    function fcApplyAdminOnlyUi() {
        const admin = fcIsAppAdmin();
        document.querySelectorAll('#gcFishControlView .fc-admin-only, #gcFishControlView .mc-admin-only').forEach((el) => {
            el.style.display = admin ? '' : 'none';
        });
        const nav = document.querySelector('#gcFishControlView .mc-section-nav');
        if (nav) nav.classList.toggle('mc-section-nav--no-test', !admin);
        if (!admin) {
            const actions = document.getElementById('fcSectionActions');
            if (actions && (actions.classList.contains('active') || actions.style.display !== 'none')) {
                switchFcSection('server');
            }
        }
    }

    function fcPickGift(id) {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญ Fish Control',
            onSelect: (gift) => {
                fcUpdateTrigger(id, 'giftName', gift.giftName);
                fcUpdateTrigger(id, 'giftId', String(gift.giftId || ''));
                fcUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderFcTriggers();
            }
        });
    }

    async function renderFcQuickActions() {
        const grid = document.getElementById('fcQuickActions');
        if (!grid) return;
        const cat = await loadFcCatalog();
        grid.innerHTML = (cat.actions || []).map((a) => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${a.type || 'help'}"
                onclick="fcTestAction('${a.cmd}')" title="${a.label}">
                <span>${a.emoji}</span><small>${a.label}</small>
            </button>
        `).join('');
    }

    function switchFcTopTab(tab) {
        document.getElementById('fcTabSettings')?.classList.toggle('active', tab === 'settings');
        document.getElementById('fcTabTrigger')?.classList.toggle('active', tab === 'trigger');
        const settings = document.getElementById('fcSettingsPanel');
        const trigger = document.getElementById('fcTriggerPanel');
        if (settings) settings.style.display = tab === 'settings' ? 'flex' : 'none';
        if (trigger) {
            trigger.style.display = tab === 'trigger' ? 'flex' : 'none';
            if (tab === 'trigger') trigger.style.flexDirection = 'column';
        }
        if (tab === 'trigger') renderFcTriggers();
    }

    function switchFcSection(section) {
        const ids = ['server', 'actions'];
        const navMap = { server: 'fcNavServer', actions: 'fcNavActions' };
        const secMap = { server: 'fcSectionServer', actions: 'fcSectionActions' };
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
        if (section === 'server') refreshFcServerStatus();
        if (section === 'actions') renderFcQuickActions();
    }

    function fcUpdateServerButtons(data) {
        const UI = global.McServerUI;
        if (UI) {
            UI.applyActionButtons({
                setup: 'fcSetupBtn',
                start: 'fcStartBtn',
                stop: 'fcStopBtn',
                reset: 'fcResetBtn',
                java: 'fcJavaBtn',
                settings: 'fcSettingsBtn'
            }, data);
        }
        const recheck = document.getElementById('fcJavaRecheckBtn');
        if (recheck) recheck.style.display = data?.javaOk === false ? '' : 'none';
    }

    async function fcInstallJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.installJava();
        await refreshFcServerStatus();
    }

    async function fcRecheckJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.recheckJava();
        await refreshFcServerStatus();
    }

    async function refreshFcServerStatus() {
        const el = document.getElementById('fcServerStatus');
        const joinEl = document.getElementById('fcJoinAddress');
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('fish');
            if (joinEl && data.join) joinEl.textContent = data.join;
            if (data.rcon) {
                const host = document.getElementById('fcConnHost');
                const port = document.getElementById('fcConnPort');
                const pass = document.getElementById('fcConnPass');
                const cfg = getFcConfig();
                if (host && (!host.value || host.value === FC_DEFAULT_HOST)) host.value = FC_DEFAULT_HOST;
                if (port && data.rcon.port) port.value = data.rcon.port;
                if (pass && data.rcon.password && (!cfg.connection?.password || cfg.connection.password === FC_DEFAULT_PASS || !pass.value)) {
                    pass.value = data.rcon.password;
                }
                fcSaveConnection();
            }
            if (!el) {
                fcUpdateServerButtons(data);
                return data;
            }
            if (global.McServerUI) {
                global.McServerUI.fillRequirementBanner(document.getElementById('fcReqBanner'), data);
            }
            el.textContent = global.McServerUI
                ? global.McServerUI.formatStatusLine(data, 'fish')
                : [
                    data.installed ? '✅ ติดตั้งเซิร์ฟ Fish แล้ว' : '⬜ ยังไม่ติดตั้งเซิร์ฟ Fish',
                    data.running ? '🟢 กำลังรัน' : '⚫ ปิด'
                ].join(' · ');
            el.classList.toggle('mc-server-status--on', !!data.running);
            fcUpdateServerButtons(data);
            return data;
        } catch (e) {
            if (el) el.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
            return null;
        }
    }

    async function fcSetupServer() {
        const btn = document.getElementById('fcSetupBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังดาวน์โหลด / ติดตั้ง...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.setupServer('fish', {
                onProgress: (_p, line) => {
                    const el = document.getElementById('fcServerStatus');
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
            refreshFcServerStatus();
        }
    }

    async function fcStartServer() {
        const btn = document.getElementById('fcStartBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังเริ่ม...'; }
        try {
            const status = await refreshFcServerStatus();
            if (!status?.javaOk) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อน');
                }
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.startServer('fish');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'เริ่มเซิร์ฟเวอร์ Fish Control', `ท่าเรือสร้างอัตโนมัติ · เข้าเกมที่ ${data.join || 'localhost:25565'}`);
                }
                fcPollReadyAndInitQuota();
                fcStartWinPoll();
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เริ่มไม่ได้', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เริ่มไม่ได้', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '▶ เริ่มเซิร์ฟเวอร์'; }
            refreshFcServerStatus();
        }
    }

    /** รอ RCON พร้อม แล้วตั้ง UI เป้าหมายปลา */
    async function fcPollReadyAndInitQuota() {
        for (let i = 0; i < 24; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            const ok = await fcTestConnection({ silent: true });
            if (ok) {
                try {
                    await fcRunAction('fc_init_quota', { goal: 35 });
                    if (typeof logToDashboard === 'function') {
                        logToDashboard('🎣 Fish Control: ท่าเรือพร้อม + HUD มุมซ้าย', '#00bcd4');
                    }
                } catch (e) { /* pier already from plugin */ }
                refreshFcServerStatus();
                return;
            }
        }
    }

    async function fcStopServer() {
        const btn = document.getElementById('fcStopBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังปิด...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.stopServer();
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(data.success ? 'info' : 'error', 'ปิดเซิร์ฟเวอร์', data.stopped ? 'ปิดแล้ว' : 'ปิด process ค้างแล้ว');
            }
            await new Promise((r) => setTimeout(r, 2000));
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ปิดไม่ได้', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⏹ ปิดเซิร์ฟเวอร์'; }
            refreshFcServerStatus();
        }
    }

    async function fcResetServer() {
        if (!confirm('ลบแมพและติดตั้งเซิร์ฟเวอร์ใหม่?\n(ปิดเซิร์ฟเวอร์ + ลบ world)')) return;
        const btn = document.getElementById('fcResetBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังลบ...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.resetServer('fish');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'โหลดใหม่แล้ว', 'กดเปิดเซิร์ฟ — ท่าเรือสร้างอัตโนมัติ');
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ลบไม่สำเร็จ', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ลบไม่สำเร็จ', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ ลบ & โหลดใหม่'; }
            refreshFcServerStatus();
        }
    }

    function fcCopyJoinAddress() {
        const addr = document.getElementById('fcJoinAddress')?.textContent || 'localhost:25565';
        if (global.McServerUI?.copyJoinAddress) {
            global.McServerUI.copyJoinAddress(addr);
        } else if (typeof copyToClipboard === 'function') {
            copyToClipboard(addr);
        } else if (typeof copyTextToClipboard === 'function') {
            copyTextToClipboard(addr);
        } else if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(addr);
        }
        if (typeof showCustomMsg === 'function') showCustomMsg('info', 'คัดลอกแล้ว', addr);
    }

    function fcOpenOverlayGallery() {
        if (typeof switchMainTab === 'function') switchMainTab('overlays');
        setTimeout(() => {
            const btn = document.querySelector('.ov-subnav-item[data-ov-section="fishcontrol"]');
            if (typeof filterOverlayGallery === 'function') {
                filterOverlayGallery('fishcontrol', btn || undefined);
            } else if (btn) {
                btn.click();
            }
        }, 60);
    }

    async function fcOpenServerFolder() {
        if (global.McServerUI?.openServerFolder) {
            await global.McServerUI.openServerFolder('fish');
            return;
        }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('fish');
            if (data.path) {
                try {
                    const { shell } = window.electron || {};
                    if (shell?.openPath) await shell.openPath(data.path);
                    else if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                } catch (e) {
                    if (typeof showCustomMsg === 'function') {
                        showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                    }
                }
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เปิดโฟลเดอร์ไม่ได้', e.message);
        }
    }

    async function renderFcProfile() {
        const cfg = getFcConfig();
        const enabled = document.getElementById('fcGameEnabled');
        if (enabled) enabled.checked = !!cfg.enabled;
        const host = document.getElementById('fcConnHost');
        const port = document.getElementById('fcConnPort');
        const pass = document.getElementById('fcConnPass');
        if (host) host.value = cfg.connection?.host || FC_DEFAULT_HOST;
        if (port) port.value = cfg.connection?.port || FC_DEFAULT_PORT;
        if (pass) pass.value = cfg.connection?.password || '';
        await renderFcQuickActions();
        renderFcTriggers();
        fcApplyAdminOnlyUi();
        switchFcTopTab('settings');
        switchFcSection('server');
        refreshFcServerStatus();
        fcStartWinPoll(); // sync WIN ตลอดเมื่อเปิดหน้า Fish (ชนะ/ตาย)
        fcStartStatusPoll(); // อัปเดตจำนวนปลา/ซอมบี้จาก plugin
        if (cfg.enabled) fcStartQuotaPoll();
        else fcStopQuotaPoll();
    }

    async function fcToggleAdminDecor() {
        try {
            // list → op → admin (คำสั่ง tokcontrol ต้อง OP ถึงจะรันผ่าน execute as ได้)
            const listRaw = await fcSendRcon('list');
            const text = String(listRaw || '');
            const m = text.match(/online:\s*(.+)$/im);
            const players = m
                ? m[1].split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_]{1,16}$/.test(s))
                : [];
            if (!players.length) throw new Error('ไม่มีผู้เล่นออนไลน์ — เข้าเซิร์ฟก่อน');
            const target = players.find((p) => p.toLowerCase() === 'puncheroo') || (players.length === 1 ? players[0] : null);
            if (!target) throw new Error(`มีหลายคนในเซิร์ฟ (${players.join(', ')}) — ให้อยู่คนเดียวหรือชื่อ Puncheroo`);
            try { await fcSendRcon(`op ${target}`); } catch (_) {}
            let body = '';
            try { body = String(await fcSendRcon('tokcontrol admin') || ''); } catch (_) {}
            if (/ใช้ในเกม|ต้องเข้าเกม|ไม่มีผู้เล่น|ไม่มีสิทธิ์/i.test(body) || !body.trim()) {
                body = String(await fcSendRcon(`execute as ${target} run tokcontrol admin`) || '');
            }
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'โหมดแอดมิน Fish', `สลับให้ ${target} — แต่งแล้วกดบันทึกแมพ`);
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'สลับโหมดไม่ได้', e.message);
        }
    }

    async function fcSaveDecorMap() {
        try {
            await fcSendRcon('tokcontrol save');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'บันทึกแมพแล้ว', 'Fish decor → fish_decorations.yml (ไม่หายหลังรีสร้างท่าเรือ)');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'บันทึกไม่ได้', e.message);
        }
    }

    async function fcLoadDecorMap() {
        try {
            await fcSendRcon('tokcontrol load');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'โหลดแมพแล้ว', 'คืนบล็อกตกแต่ง Fish จากไฟล์บันทึก');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'โหลดไม่ได้', e.message);
        }
    }

    async function fcSendRcon(command) {
        const bridge = makeFcRconBridge();
        return bridge.send(command);
    }

    global.getFcConfig = getFcConfig;
    global.saveFcConfig = saveFcConfig;
    global.fcToggleEnabled = fcToggleEnabled;
    global.fcSaveConnection = fcSaveConnection;
    global.fcTestConnection = fcTestConnection;
    global.fcBuildMap = fcBuildMap;
    global.fcTestAction = fcTestAction;
    global.fcTestTrigger = fcTestTrigger;
    global.fcAddTrigger = fcAddTrigger;
    global.renderFcTriggers = renderFcTriggers;
    global.fcApplyAdminOnlyUi = fcApplyAdminOnlyUi;
    global.fcRemoveTrigger = fcRemoveTrigger;
    global.fcUpdateTrigger = fcUpdateTrigger;
    global.fcPickGift = fcPickGift;
    global.handleFcGift = handleFcGift;
    global.handleFcLike = handleFcLike;
    global.handleFcLiveEvent = handleFcLiveEvent;
    global.renderFcProfile = renderFcProfile;
    global.switchFcTopTab = switchFcTopTab;
    global.switchFcSection = switchFcSection;
    global.fcSetupServer = fcSetupServer;
    global.fcStartServer = fcStartServer;
    global.fcStopServer = fcStopServer;
    global.fcResetServer = fcResetServer;
    global.fcCopyJoinAddress = fcCopyJoinAddress;
    global.fcOpenOverlayGallery = fcOpenOverlayGallery;
    global.fcOpenServerFolder = fcOpenServerFolder;
    global.refreshFcServerStatus = refreshFcServerStatus;
    global.fcInstallJavaThenRefresh = fcInstallJavaThenRefresh;
    global.fcRecheckJavaThenRefresh = fcRecheckJavaThenRefresh;
    global.fcToggleAdminDecor = fcToggleAdminDecor;
    global.fcSaveDecorMap = fcSaveDecorMap;
    global.fcLoadDecorMap = fcLoadDecorMap;

    global.addEventListener('mc-server-changed', (ev) => {
        if (ev?.detail?.world === 'fish') refreshFcServerStatus();
    });

    // เริ่ม poll WIN + สถานะปลาทันทีเมื่อโหลดสคริปต์
    try { fcStartWinPoll(); } catch (e) {}
    try { fcStartStatusPoll(); } catch (e) {}
})(typeof window !== 'undefined' ? window : global);
