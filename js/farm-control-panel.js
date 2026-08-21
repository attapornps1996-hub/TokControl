/**
 * Farm Control — TokControl Game Center panel (TikTok gifts → RCON + .mcfunction)
 */
(function (global) {
    'use strict';

    const FM_STORAGE_KEY = 'tokcontrol_farm_control';
    const FM_DEFAULT_HOST = '127.0.0.1';
    const FM_DEFAULT_PORT = 25575;
    const FM_DEFAULT_PASS = 'tokcontrol'; // first-run local default — change before a public Minecraft server
    let fmCatalog = null;

    function getFmDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', action: 'fm_fire' },
            { id: 2, enabled: true, type: 'gift', giftName: 'Mini Heart', giftId: '', action: 'fm_cow' },
            { id: 3, enabled: true, type: 'gift', giftName: 'Ice Cream Cone', giftId: '', action: 'fm_villager' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', action: 'fm_flood' },
            { id: 5, enabled: true, type: 'gift', giftName: 'Donut', giftId: '', action: 'fm_expand' },
            { id: 6, enabled: true, type: 'gift', giftName: 'Perfume', giftId: '', action: 'fm_blaze' },
            { id: 7, enabled: true, type: 'gift', giftName: 'GG', giftId: '', action: 'fm_dragon' },
            { id: 8, enabled: true, type: 'gift', giftName: 'Cap', giftId: '', action: 'fm_wipe' },
            { id: 9, enabled: true, type: 'gift', giftName: 'Love Potion', giftId: '', action: 'fm_shrink' }
        ];
    }

    function getFmDefaultConfig() {
        return {
            enabled: false,
            connection: {
                type: 'rcon',
                host: FM_DEFAULT_HOST,
                port: FM_DEFAULT_PORT,
                password: FM_DEFAULT_PASS
            },
            triggers: getFmDefaultTriggers()
        };
    }

    function getFmConfig() {
        try {
            const raw = localStorage.getItem(FM_STORAGE_KEY);
            if (raw) {
                const cfg = { ...getFmDefaultConfig(), ...JSON.parse(raw) };
                const remap = {
                    fm_water: 'fm_flood',
                    fm_snow: 'fm_snowman'
                };
                if (Array.isArray(cfg.triggers)) {
                    cfg.triggers = cfg.triggers.map((t) => {
                        const next = remap[t.action];
                        return next ? { ...t, action: next } : t;
                    });
                }
                return cfg;
            }
        } catch (e) {}
        return getFmDefaultConfig();
    }

    function saveFmConfig(cfg) {
        localStorage.setItem(FM_STORAGE_KEY, JSON.stringify(cfg));
    }

    async function loadFmCatalog() {
        if (fmCatalog) return fmCatalog;
        try {
            const res = await fetch('/data/farm_control_catalog.json');
            fmCatalog = await res.json();
        } catch (e) {
            fmCatalog = { actions: [], default_triggers: [] };
        }
        return fmCatalog;
    }

    function fmToggleEnabled(checked) {
        const cfg = getFmConfig();
        cfg.enabled = !!checked;
        saveFmConfig(cfg);
        if (typeof setGameLiveActive === 'function') setGameLiveActive('farm-control', !!checked);
        else if (checked && typeof setActiveGameModId === 'function') setActiveGameModId('farm-control');
    }

    function fmSaveConnection() {
        const cfg = getFmConfig();
        cfg.connection = {
            type: 'rcon',
            host: document.getElementById('fmConnHost')?.value?.trim() || FM_DEFAULT_HOST,
            port: parseInt(document.getElementById('fmConnPort')?.value, 10) || FM_DEFAULT_PORT,
            password: document.getElementById('fmConnPass')?.value || ''
        };
        saveFmConfig(cfg);
    }

    async function fmRunAction(action, opts = {}) {
        if (typeof executeGameModCommandDetailed !== 'function') {
            throw new Error('executeGameModCommandDetailed ไม่พร้อม');
        }
        const cfg = getFmConfig();
        const payload = JSON.stringify({ action, ...(opts || {}) });
        const res = await executeGameModCommandDetailed('farm-control', payload, cfg.connection || {}, {
            awaitResponse: true,
            fireAndForget: false
        });
        const detail = res?.detail;
        if (!res || res.ok === false) {
            throw new Error(
                detail?.message
                || detail?.errors?.[0]?.error
                || res?.error
                || res?.message
                || 'Farm action failed'
            );
        }
        if (detail && detail.ok === false) {
            throw new Error(detail.message || detail.errors?.[0]?.error || 'Farm action failed');
        }
        return detail || { ok: true, ...res };
    }

    async function fmBuildMap() {
        try {
            fmSaveConnection();
            const res = await fmRunAction('fm_build');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', 'แมพฟาร์ม',
                    res.ok !== false ? 'สร้างนา + หอคอย + datapack พร้อม' : 'บางคำสั่งล้มเหลว');
            }
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'สร้างแมพไม่ได้', e.message);
            return { ok: false, error: e.message };
        }
    }

    async function fmToggleAdminDecor() {
        try {
            fmSaveConnection();
            const res = await fmRunAction('fm_admin');
            const ok = res && res.ok !== false;
            const hint = res?.message
                || (res?.results || []).map((r) => r?.body || '').filter(Boolean).join('\n')
                || (ok ? 'สลับโหมดแต่งแมพแล้ว' : 'ล้มเหลว');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(ok ? 'success' : 'warning', ok ? 'โหมดแต่งแมพ Farm' : 'แต่งแมพไม่ได้', String(hint).slice(0, 220));
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(`🌾 fm_admin: ${String(hint).slice(0, 80)}`, ok ? '#27ae60' : '#e67e22');
            }
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'แต่งแมพไม่ได้', e.message || 'เข้าเซิร์ฟ Farm ก่อน แล้วเปิด RCON');
            }
            return { ok: false, error: e.message };
        }
    }

    async function fmTestAction(actionId) {
        if (actionId === 'fm_admin') return fmToggleAdminDecor();
        if (actionId === '__random__') {
            const UI = global.MapTriggerUI;
            const dummy = { type: 'random', action: '__random__', randomActions: [] };
            actionId = (UI && UI.resolveTriggerAction)
                ? (UI.resolveTriggerAction(dummy, FM_ACTIONS).action || '')
                : '';
            if (!actionId || actionId === '__random__') {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'สุ่มแอคชัน', 'ยังไม่มีแอคชันในพูลให้สุ่ม');
                }
                return;
            }
        }
        try {
            fmSaveConnection();
            const res = await fmRunAction(actionId);
            const bodies = (res.results || []).map((r) => r?.body || r?.message || '').filter(Boolean).join('\n');
            const raw = bodies || '';
            const failHint = /ใช้ในเกม|ไม่มีผู้เล่น|ไม่พบผู้เล่น|ล้มเหลว|ไม่มีสิทธิ์/i.test(raw);
            const hint = raw || (res.ok !== false ? 'ส่งเข้าเกมแล้ว — ดู Title/เอฟเฟกต์ใน Minecraft' : (res.errors?.[0]?.error || 'ล้มเหลว'));
            const ok = res.ok !== false && !failHint;
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(ok ? 'success' : 'warning', ok ? 'Farm · ทดสอบ' : 'Farm · ไม่สำเร็จ', hint.slice(0, 220));
            }
            if (typeof logToDashboard === 'function') logToDashboard(`🌾 ${actionId}: ${hint.slice(0, 80)}`, ok ? '#27ae60' : '#e67e22');
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || 'เปิดเซิร์ฟ Farm + RCON ก่อน');
        }
    }

    function fmPickTriggerAction(tr) {
        if (!tr) return '';
        const UI = global.MapTriggerUI;
        if ((tr.type === 'random' || tr.action === '__random__') && UI && typeof UI.resolveTriggerAction === 'function') {
            const picked = UI.resolveTriggerAction(tr, FM_ACTIONS).action;
            if (picked && picked !== '__random__') return picked;
        }
        if (tr.action && tr.action !== '__random__') return tr.action;
        return '';
    }

    async function fmTestTrigger(id) {
        const tr = (getFmConfig().triggers || []).find((t) => String(t.id) === String(id));
        if (!tr) return fmTestAction('fm_fire');
        const action = fmPickTriggerAction(tr);
        if (!action) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สุ่มแอคชัน', 'เลือกอย่างน้อย 1 แอคชันในทริกเกอร์สุ่มก่อนทดสอบ');
            }
            return;
        }
        const label = (FM_ACTIONS.find((a) => a.value === action) || {}).label || action;
        if (tr.type === 'random' || tr.action === '__random__') {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'สุ่มได้', label);
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(`🌾 สุ่มได้: ${label}`, '#f39c12');
            }
        }
        const plan = fmBuildActionPlan(action, tr, 1);
        try {
            fmSaveConnection();
            let last = null;
            for (let i = 0; i < plan.times; i++) {
                last = await fmRunAction(action, plan.opts);
            }
            const bodies = (last?.results || []).map((r) => r?.body || r?.message || '').filter(Boolean).join('\n');
            const failHint = /ใช้ในเกม|ไม่มีผู้เล่น|ไม่พบผู้เล่น|ล้มเหลว|ไม่มีสิทธิ์/i.test(bodies || '');
            const ok = last && last.ok !== false && !failHint;
            if (tr.type !== 'random' && tr.action !== '__random__' && typeof showCustomMsg === 'function') {
                showCustomMsg(ok ? 'success' : 'warning', ok ? 'Farm · ทดสอบ' : 'Farm · ไม่สำเร็จ',
                    (bodies || 'ส่งเข้าเกมแล้ว').slice(0, 220));
            }
            return last;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || 'เปิดเซิร์ฟ Farm + RCON ก่อน');
            }
        }
    }

    async function fmTestConnection(opts = {}) {
        fmSaveConnection();
        try {
            const cfg = getFmConfig();
            const res = await executeGameModCommandDetailed('farm-control', 'list', cfg.connection || {}, {
                awaitResponse: true
            });
            if (!res || res.ok === false) throw new Error(res?.error || 'RCON failed');
            const el = document.getElementById('fmConnStatus');
            if (el) { el.textContent = '● RCON พร้อม'; el.style.color = '#2ecc71'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'RCON เชื่อมต่อได้', 'ok');
            }
            return true;
        } catch (e) {
            const el = document.getElementById('fmConnStatus');
            if (el) { el.textContent = '○ เชื่อมไม่ได้'; el.style.color = '#e74c3c'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'RCON ไม่ได้', e.message);
            }
            return false;
        }
    }

    /** คูณตามคอมโบ — expand/jail ใช้ steps/seconds; สปอนยิงซ้ำ (cap); ภัยพิบัติครั้งเดียว */
    function fmBuildActionPlan(action, tr, qty) {
        const n = Math.max(1, Math.min(20, qty || 1));
        if (action === 'fm_expand' || action === 'fm_shrink') {
            return { times: 1, opts: { steps: n } };
        }
        if (action === 'fm_jail' || action === 'fm_jail_add' || action === 'fm_jail_sub') {
            const base = Math.max(1, parseInt(tr?.seconds, 10) || 10);
            return { times: 1, opts: { seconds: base * n } };
        }
        if (action === 'fm_cow' || action === 'fm_villager' || action === 'fm_snowman' || action === 'fm_blaze') {
            return { times: n, opts: {} };
        }
        return { times: 1, opts: {} };
    }

    function handleFmGift(giftData) {
        if (!getFmConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('farm-control')) return false;
        if (Number(giftData?.giftType) === 1 && giftData?.repeatEnd === false) return false;
        const user = giftData?.uniqueId || giftData?.nickname || giftData?.user || 'viewer';
        const UI = global.MapTriggerUI;
        const fire = (tr, _user, qty) => {
            let action = tr.action || 'fm_expand';
            if ((tr.type === 'random' || action === '__random__') && UI && typeof UI.resolveTriggerAction === 'function') {
                action = UI.resolveTriggerAction(tr, FM_ACTIONS).action || action;
            }
            if (!action || action === '__random__') return;
            const plan = fmBuildActionPlan(action, tr, qty);
            const label = (FM_ACTIONS.find((a) => a.value === action) || {}).label || action;
            const qtyNote = (qty || 1) > 1 ? ` ×${qty}` : '';
            (async () => {
                for (let i = 0; i < plan.times; i++) {
                    await fmRunAction(action, plan.opts);
                }
                if (global.McServerUI) global.McServerUI.announceViewer(user, label + qtyNote);
            })().catch(() => {});
        };
        if (UI && typeof UI.matchGiftTriggers === 'function') {
            const result = UI.matchGiftTriggers(getFmConfig().triggers || [], giftData, fire, fmTriggerCounters, FM_ACTIONS);
            return !!result.fired;
        }
        const name = String(giftData?.giftName || giftData?.name || '').trim();
        const giftId = String(giftData?.giftId || giftData?.id || '');
        const triggers = getFmConfig().triggers || [];
        const hit = triggers.find((t) => t.enabled !== false && (t.type || 'gift') === 'gift' && (
            (t.giftId && String(t.giftId) === giftId)
            || (t.giftName && t.giftName.toLowerCase() === name.toLowerCase())
        ));
        if (!hit) return false;
        const qty = Math.max(1, parseInt(giftData?.repeatCount || giftData?.giftCount || 1, 10) || 1);
        fire(hit, user, qty);
        return true;
    }

    const fmTriggerCounters = {};

    function handleFmLiveEvent(eventType, data) {
        if (!getFmConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('farm-control')) return false;
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.matchLiveEvent !== 'function') return false;
        return UI.matchLiveEvent(getFmConfig().triggers || [], eventType, data, (tr) => {
            let action = tr.action || 'fm_expand';
            if ((tr.type === 'random' || action === '__random__') && typeof UI.resolveTriggerAction === 'function') {
                action = UI.resolveTriggerAction(tr, FM_ACTIONS).action || action;
            }
            if (!action || action === '__random__') return;
            const label = (FM_ACTIONS.find((a) => a.value === action) || {}).label || action;
            const who = data?.nickname || data?.uniqueId || 'viewer';
            fmRunAction(action).then(() => {
                if (global.McServerUI) global.McServerUI.announceViewer(who, label);
            }).catch(() => {});
        }, fmTriggerCounters, FM_ACTIONS);
    }

    function handleFmLike(data) {
        let fired = false;
        if (handleFmLiveEvent('like', data)) fired = true;
        if (handleFmLiveEvent('globallikes', data)) fired = true;
        return fired;
    }

    async function refreshFmServerStatus() {
        const el = document.getElementById('fmServerStatus');
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const j = await global.McServerUI.fetchStatus('farm');
            global.McServerUI.fillRequirementBanner(document.getElementById('fmReqBanner'), j);
            global.McServerUI.applyActionButtons({
                setup: 'fmSetupBtn',
                start: 'fmStartBtn',
                stop: 'fmStopBtn',
                reset: 'fmResetBtn',
                java: 'fmJavaBtn',
                settings: 'fmSettingsBtn'
            }, j);
            const recheck = document.getElementById('fmJavaRecheckBtn');
            if (recheck) recheck.style.display = j?.javaOk === false ? '' : 'none';
            if (el) {
                el.textContent = global.McServerUI
                    ? global.McServerUI.formatStatusLine(j, 'farm')
                    : (j.running ? '🟢 เซิร์ฟ Farm เปิดอยู่' : '⚫ เซิร์ฟ Farm ปิด');
                el.classList.toggle('mc-server-status--on', !!j.running);
            }
            const joinEl = document.getElementById('fmJoinAddress');
            if (joinEl && j.join) joinEl.textContent = j.join;
            return j;
        } catch (e) {
            if (el) el.textContent = '○ ตรวจสถานะไม่ได้';
            return null;
        }
    }

    async function fmSetupServer() {
        const btn = document.getElementById('fmSetupBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังดาวน์โหลด / ติดตั้ง...'; }
        try {
            const status = await refreshFmServerStatus();
            if (status?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${status.otherModeLabel} กำลังรัน — Farm ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                fmConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน แล้วค่อยติดตั้ง Farm');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            fmConsoleAppend('▶ เริ่มดาวน์โหลด / ติดตั้งแพ็กเกจ Farm…');
            const setupData = await global.McServerUI.setupServer('farm', {
                onProgress: (_p, line) => fmConsoleAppend(line)
            });
            if (setupData.success !== false) {
                fmConsoleAppend('✓ ติดตั้งแพ็กเกจ Farm เสร็จ — กด «เริ่มเซิร์ฟเวอร์» ได้');
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'ติดตั้งแพ็กเกจแล้ว', 'กด «เริ่มเซิร์ฟเวอร์» เมื่อพร้อม');
                }
            } else {
                fmConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (setupData.error || 'unknown'));
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', setupData.error || 'unknown');
                }
            }
        } catch (e) {
            fmConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', e.message);
        } finally {
            await refreshFmServerStatus();
        }
    }

    async function fmStartServer() {
        const btn = document.getElementById('fmStartBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังเริ่ม...'; }
        try {
            const status = await refreshFmServerStatus();
            if (status?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${status.otherModeLabel} กำลังรัน — Farm ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                fmConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน');
                return;
            }
            if (!status?.javaOk) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อน');
                }
                fmConsoleAppend('⚠ ยังไม่พบ Java 21+');
                return;
            }
            if (!status?.installed) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('info', 'ยังไม่ติดตั้ง', 'กดดาวน์โหลด / ติดตั้งแพ็กเกจก่อน');
                }
                fmConsoleAppend('⚠ ยังไม่ติดตั้งแพ็กเกจ');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            fmConsoleAppend('▶ เริ่มเซิร์ฟเวอร์ Farm…');
            const j = await global.McServerUI.startServer('farm', {
                onProgress: (_p, line) => fmConsoleAppend(line)
            });
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(j.success !== false ? 'success' : 'error', 'เริ่มเซิร์ฟ Farm',
                    j.success !== false
                        ? `เซิร์ฟแยก · โลก ${j.levelName || 'tokcontrol_farm'} · ${j.join || 'localhost:25565'}`
                        : (j.error || 'ล้มเหลว'));
            }
            if (j.success !== false) {
                fmConsoleAppend('✓ เปิดเซิร์ฟแล้ว · ' + (j.join || 'localhost:25565') + ' — รอ Paper บูต');
                setTimeout(() => fmTestConnection({ silent: true }), 8000);
                setTimeout(() => fmBuildMap(), 14000);
            } else {
                fmConsoleAppend('✗ เริ่มเซิร์ฟไม่ได้: ' + (j.error || 'unknown'));
            }
        } catch (e) {
            fmConsoleAppend('✗ เริ่มเซิร์ฟไม่ได้: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เริ่มเซิร์ฟไม่ได้', e.message);
        } finally {
            await refreshFmServerStatus();
        }
    }

    async function fmLaunchServer() {
        const status = await refreshFmServerStatus();
        if (!status?.installed) return fmSetupServer();
        return fmStartServer();
    }

    async function fmInstallJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.installJava();
        await refreshFmServerStatus();
    }

    async function fmRecheckJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.recheckJava();
        await refreshFmServerStatus();
    }

    async function fmStopServer() {
        try {
            if (global.McServerUI) await global.McServerUI.stopServer();
            refreshFmServerStatus();
        } catch (e) {}
    }

    async function fmResetServer() {
        const ok = typeof tcConfirm === 'function'
            ? await tcConfirm('ลบแมพ Farm และติดตั้งเซิร์ฟใหม่?\n(ปิดเซิร์ฟ + ลบ world)', {
                title: 'ลบ & โหลดใหม่',
                icon: '🗑️',
                okLabel: 'ลบ & โหลดใหม่'
            })
            : confirm('ลบแมพ Farm และติดตั้งเซิร์ฟใหม่?\n(ปิดเซิร์ฟ + ลบ world)');
        if (!ok) return;

        const btn = document.getElementById('fmResetBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังลบ...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.resetServer('farm');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'โหลดใหม่แล้ว', 'กดเปิดเซิร์ฟ Farm แล้วเข้าเกมได้');
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ลบไม่สำเร็จ', data.error || 'unknown');
            }
        } catch (e) {
            const msg = e && e.name === 'AbortError'
                ? 'หมดเวลารอเซิร์ฟ — ลองปิดเซิร์ฟก่อน แล้วกดอีกครั้ง'
                : (e.message || String(e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ลบไม่สำเร็จ', msg);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ ลบ & โหลดใหม่'; }
            refreshFmServerStatus();
        }
    }

    function fmCopyJoinAddress() {
        const addr = document.getElementById('fmJoinAddress')?.textContent || 'localhost:25565';
        if (global.McServerUI?.copyJoinAddress) {
            global.McServerUI.copyJoinAddress(addr);
        } else if (typeof copyToClipboard === 'function') {
            copyToClipboard(addr);
        } else if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(addr);
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', addr);
        }
    }

    async function fmOpenServerFolder() {
        if (global.McServerUI?.openServerFolder) {
            await global.McServerUI.openServerFolder('farm');
            return;
        }
        try {
            if (!global.McServerUI) return;
            const data = await global.McServerUI.fetchStatus('farm');
            if (data?.path) {
                try {
                    const { shell } = window.electron || {};
                    if (shell?.openPath) await shell.openPath(data.path);
                    else if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                } catch (e) {
                    if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', data.path);
                }
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เปิดโฟลเดอร์ไม่ได้', e.message || String(e));
        }
    }

    function switchFmTopTab(tab) {
        const settings = document.getElementById('fmSettingsPanel');
        const trigger = document.getElementById('fmTriggerPanel');
        const tSettings = document.getElementById('fmTabSettings');
        const tTrigger = document.getElementById('fmTabTrigger');
        const isTrig = tab === 'trigger';
        if (settings) settings.style.display = isTrig ? 'none' : 'flex';
        if (trigger) {
            trigger.style.display = isTrig ? 'flex' : 'none';
            trigger.classList.toggle('active-flex', isTrig);
        }
        tSettings?.classList.toggle('active', !isTrig);
        tTrigger?.classList.toggle('active', isTrig);
        if (isTrig) renderFmTriggers();
    }

    function switchFmSection(sec) {
        const server = document.getElementById('fmSectionServer');
        const actions = document.getElementById('fmSectionActions');
        const decor = document.getElementById('fmSectionDecor');
        if (server) {
            server.classList.toggle('active', sec === 'server');
            server.style.display = sec === 'server' ? '' : 'none';
        }
        if (actions) {
            actions.classList.toggle('active', sec === 'actions');
            actions.style.display = sec === 'actions' ? '' : 'none';
        }
        if (decor) {
            decor.classList.toggle('active', sec === 'decor');
            decor.style.display = sec === 'decor' ? '' : 'none';
        }
        document.getElementById('fmNavServer')?.classList.toggle('active', sec === 'server');
        document.getElementById('fmNavActions')?.classList.toggle('active', sec === 'actions');
        document.getElementById('fmNavDecor')?.classList.toggle('active', sec === 'decor');
    }

    async function renderFmQuickActions() {
        const box = document.getElementById('fmQuickActions');
        if (!box) return;
        const cat = await loadFmCatalog();
        box.innerHTML = (cat.actions || []).map((a) =>
            `<button type="button" class="gp-btn-secondary" onclick="fmTestAction('${a.cmd}')">${a.emoji || ''} ${a.label}</button>`
        ).join('');
    }

    const FM_ACTIONS = [
        { value: 'fm_fire', label: '🔥 ไฟไหม้' },
        { value: 'fm_cow', label: '🐄 วัว' },
        { value: 'fm_villager', label: '👨‍🌾 ชาวบ้าน' },
        { value: 'fm_plant_full', label: '🌾 ปลูกข้าวเต็มทันที' },
        { value: 'fm_wipe', label: '🚨 ล้างนา' },
        { value: 'fm_flood', label: '🌊 น้ำท่วม' },
        { value: 'fm_dragon', label: '🐉 มังกร' },
        { value: 'fm_expand', label: '⬆ ขยายฟาร์ม' },
        { value: 'fm_shrink', label: '⬇ ลดขนาดฟาร์ม' },
        { value: 'fm_snowman', label: '☃ สโนแมนยักษ์' },
        { value: 'fm_blaze', label: '🔥 พ่นไฟ (3 ช่อง)' },
        { value: 'fm_win', label: '🎬 คัทซีนวิน' },
        { value: 'fm_lose', label: '🎬 คัทซีนแพ้' },
        { value: 'fm_jail', label: '🧊 ห้องขังกระจก (10วิ)' },
        { value: 'fm_jail_add', label: '➕ เพิ่มเวลาขัง' },
        { value: 'fm_jail_sub', label: '➖ ลดเวลาขัง' }
    ];

    const FM_CONSOLE_PRESETS = {
        expand: '{"action":"fm_expand"}',
        shrink: '{"action":"fm_shrink"}',
        fire: '{"action":"fm_fire"}',
        cow: '{"action":"fm_cow"}',
        villager: '{"action":"fm_villager"}',
        flood: '{"action":"fm_flood"}',
        dragon: '{"action":"fm_dragon"}',
        wipe: '{"action":"fm_wipe"}',
        plant: '{"action":"fm_plant_full"}',
        snowman: '{"action":"fm_snowman"}',
        blaze: '{"action":"fm_blaze"}',
        admin: '{"action":"fm_admin"}',
        save: '{"action":"fm_save"}',
        load: '{"action":"fm_load"}',
        jail: '{"action":"fm_jail","seconds":10}',
        jail_add: '{"action":"fm_jail_add","seconds":10}',
        jail_sub: '{"action":"fm_jail_sub","seconds":10}'
    };

    function fmIsAppAdmin() {
        try {
            if (typeof isAppAdmin === 'function') return !!isAppAdmin();
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
        } catch (e) {}
        return false;
    }

    function fmApplyAdminOnlyUi() {
        const admin = fmIsAppAdmin();
        document.querySelectorAll('#gcFarmControlView .fm-admin-only, #gcFarmControlView .mc-admin-only').forEach((el) => {
            el.style.display = admin ? '' : 'none';
        });
        const nav = document.querySelector('#gcFarmControlView .mc-section-nav');
        if (nav) nav.classList.toggle('mc-section-nav--no-test', !admin);
        if (!admin) {
            const decor = document.getElementById('fmSectionDecor');
            if (decor && decor.classList.contains('active')) switchFmSection('server');
        }
    }

    function fmConsoleFill(key) {
        const input = document.getElementById('fmConsoleInput');
        if (!input) return;
        input.value = FM_CONSOLE_PRESETS[key] || key;
    }

    function fmConsoleClear() {
        const out = document.getElementById('fmConsoleOutput');
        if (out) out.textContent = 'พร้อมรันคำสั่ง Farm…';
    }

    function fmConsoleAppend(line) {
        const out = document.getElementById('fmConsoleOutput');
        if (!out) return;
        const ts = new Date().toLocaleTimeString();
        const prev = out.textContent === 'พร้อมรันคำสั่ง Farm…' ? '' : out.textContent + '\n';
        out.textContent = prev + `[${ts}] ${line}`;
        out.scrollTop = out.scrollHeight;
    }

    async function fmConsoleRun() {
        const input = document.getElementById('fmConsoleInput');
        const raw = (input?.value || '').trim();
        if (!raw) {
            fmConsoleAppend('⚠ ว่างเปล่า — ใส่ JSON เช่น {"action":"fm_expand"}');
            return;
        }
        fmConsoleAppend('→ ' + raw);
        try {
            let action = raw;
            let opts = {};
            if (raw.startsWith('{')) {
                const j = JSON.parse(raw);
                action = j.action || j.cmd || '';
                opts = j;
            }
            if (!action) throw new Error('ไม่มี action');
            const res = await fmRunAction(action, opts);
            fmConsoleAppend('← ' + JSON.stringify(res, null, 2));
        } catch (e) {
            fmConsoleAppend('✗ ' + (e.message || e));
        }
    }

    function renderFmTriggers() {
        const list = document.getElementById('fmTriggerList');
        if (!list) return;
        const triggers = getFmConfig().triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์» เพื่อตั้งแบบ Box Control</p>';
            return;
        }
        const UI = global.MapTriggerUI;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, FM_ACTIONS, {
                    prefix: 'fm',
                    giftOnclick: `fmPickGift(${tr.id})`,
                    actionOnclick: `fmUpdateTrigger(${tr.id}, 'action', '{value}'); renderFmTriggers();`,
                    testOnclick: `fmTestTrigger(${tr.id})`,
                    removeOnclick: `fmRemoveTrigger(${tr.id})`
                });
            }
            const label = UI && UI.formatLabel
                ? UI.formatLabel(tr, FM_ACTIONS)
                : `${tr.giftName || tr.type || 'ทริกเกอร์'} → ${tr.action}`;
            return `<div class="rp-trigger-chip mc-trigger-chip" data-id="${tr.id}">
                <span class="rp-trigger-chip-label">${String(label).replace(/</g, '&lt;')}</span>
                <div class="mc-trigger-chip-actions">
                    <button type="button" class="gp-btn-primary mc-test-btn mc-admin-only" onclick="fmTestTrigger(${tr.id})" title="ทดสอบ">▶</button>
                    <button type="button" class="mc-remove-btn" onclick="fmRemoveTrigger(${tr.id})" title="ลบ">✕</button>
                </div>
            </div>`;
        }).join('');
        fmApplyAdminOnlyUi();
    }

    function fmAddTrigger() {
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.open !== 'function') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ทริกเกอร์', 'ระบบโมดอลยังไม่พร้อม');
            return;
        }
        UI.open({
            title: 'ทริกเกอร์ Farm Control',
            actions: FM_ACTIONS,
            defaultAction: 'fm_fire',
            onSave: (payload) => {
                const cfg = getFmConfig();
                cfg.triggers = cfg.triggers || [];
                cfg.triggers.push(payload);
                saveFmConfig(cfg);
                renderFmTriggers();
            }
        });
    }

    function fmRemoveTrigger(idOrIndex) {
        const cfg = getFmConfig();
        const id = String(idOrIndex);
        const byId = (cfg.triggers || []).some((t) => String(t.id) === id);
        if (byId) {
            cfg.triggers = cfg.triggers.filter((t) => String(t.id) !== id);
        } else {
            cfg.triggers.splice(Number(idOrIndex), 1);
        }
        saveFmConfig(cfg);
        renderFmTriggers();
    }

    function fmUpdateTrigger(idOrIndex, key, value) {
        const cfg = getFmConfig();
        let tr = (cfg.triggers || []).find((t) => String(t.id) === String(idOrIndex));
        if (!tr && cfg.triggers[idOrIndex]) tr = cfg.triggers[idOrIndex];
        if (!tr) return;
        if (key === 'action' && tr.type === 'random' && global.MapTriggerUI && MapTriggerUI.applyActionPick) {
            MapTriggerUI.applyActionPick(tr, value, FM_ACTIONS);
        } else {
            tr[key] = key === 'enabled' ? !!value : value;
        }
        saveFmConfig(cfg);
    }

    function fmPickGift(id) {
        if (!global.GiftPicker) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'Gift Picker', 'ระบบเลือกของขวัญยังไม่พร้อม');
            }
            return;
        }
        GiftPicker.open({
            title: '🎁 เลือกของขวัญ Farm Control',
            onSelect: (gift) => {
                fmUpdateTrigger(id, 'giftName', gift.giftName || '');
                fmUpdateTrigger(id, 'giftId', String(gift.giftId || ''));
                fmUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderFmTriggers();
            }
        });
    }

    async function renderFmProfile() {
        const cfg = getFmConfig();
        const enabled = document.getElementById('fmGameEnabled');
        if (enabled) enabled.checked = !!cfg.enabled;
        const host = document.getElementById('fmConnHost');
        const port = document.getElementById('fmConnPort');
        const pass = document.getElementById('fmConnPass');
        if (host) host.value = cfg.connection?.host || FM_DEFAULT_HOST;
        if (port) port.value = cfg.connection?.port || FM_DEFAULT_PORT;
        if (pass) pass.value = cfg.connection?.password || '';
        await renderFmQuickActions();
        renderFmTriggers();
        fmApplyAdminOnlyUi();
        switchFmTopTab('settings');
        switchFmSection('server');
        refreshFmServerStatus();
    }

    global.getFmConfig = getFmConfig;
    global.saveFmConfig = saveFmConfig;
    global.fmToggleEnabled = fmToggleEnabled;
    global.fmSaveConnection = fmSaveConnection;
    global.fmTestConnection = fmTestConnection;
    global.fmBuildMap = fmBuildMap;
    global.fmTestAction = fmTestAction;
    global.fmTestTrigger = fmTestTrigger;
    global.fmToggleAdminDecor = fmToggleAdminDecor;
    global.fmAddTrigger = fmAddTrigger;
    global.fmRemoveTrigger = fmRemoveTrigger;
    global.fmUpdateTrigger = fmUpdateTrigger;
    global.renderFmTriggers = renderFmTriggers;
    global.handleFmGift = handleFmGift;
    global.handleFmLike = handleFmLike;
    global.handleFmLiveEvent = handleFmLiveEvent;
    global.renderFmProfile = renderFmProfile;
    global.switchFmTopTab = switchFmTopTab;
    global.switchFmSection = switchFmSection;
    global.fmConsoleFill = fmConsoleFill;
    global.fmConsoleClear = fmConsoleClear;
    global.fmConsoleRun = fmConsoleRun;
    global.fmApplyAdminOnlyUi = fmApplyAdminOnlyUi;
    global.fmSetupServer = fmSetupServer;
    global.fmStartServer = fmStartServer;
    global.fmLaunchServer = fmLaunchServer;
    global.fmStopServer = fmStopServer;
    global.fmResetServer = fmResetServer;
    global.fmCopyJoinAddress = fmCopyJoinAddress;
    global.fmOpenServerFolder = fmOpenServerFolder;
    global.fmPickGift = fmPickGift;
    global.refreshFmServerStatus = refreshFmServerStatus;
    global.fmInstallJavaThenRefresh = fmInstallJavaThenRefresh;
    global.fmRecheckJavaThenRefresh = fmRecheckJavaThenRefresh;

    global.addEventListener('mc-server-changed', (ev) => {
        if (ev?.detail?.world === 'farm') refreshFmServerStatus();
    });
})(typeof window !== 'undefined' ? window : global);
