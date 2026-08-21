/**
 * Restaurant Control — Tok Cafe (Farmer's Delight orders → RCON)
 */
(function (global) {
    'use strict';

    const RS_STORAGE_KEY = 'tokcontrol_restaurant_control';
    const RS_DEFAULT_HOST = '127.0.0.1';
    const RS_DEFAULT_PORT = 25575;
    const RS_DEFAULT_PASS = 'tokcontrol';
    let rsZoneTimer = null;

    const RS_ACTIONS = [
        { value: 'rs_customer', label: '🧑 ลูกค้าสั่งออเดอร์' },
        { value: 'rs_order', label: '🧾 สุ่มเมนู Farmer\'s Delight' },
        { value: 'rs_disaster', label: '🔥 ไฟไหม้ครัว' },
        { value: 'rs_bonus', label: '🧺 วัตถุดิบเข้าตู้' },
        { value: 'rs_tick', label: '📍 ชง/เสิร์ฟ / เวลาอดทน' },
        { value: 'rs_clear', label: '🧹 เคลียร์คิว' },
        { value: 'rs_build', label: '☕ สร้างร้าน Tok Cafe' }
    ];

    const RS_CONSOLE_PRESETS = {
        build: '{"action":"rs_build"}',
        customer: '{"action":"rs_customer"}',
        order: '{"action":"rs_order"}',
        disaster: '{"action":"rs_disaster"}',
        bonus: '{"action":"rs_bonus"}',
        tick: '{"action":"rs_tick"}',
        craft: '{"action":"rs_craft"}',
        clear: '{"action":"rs_clear"}',
        status: '{"action":"rs_status"}'
    };

    function getRsDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', action: 'rs_customer' },
            { id: 2, enabled: true, type: 'gift', giftName: 'Mini Heart', giftId: '', action: 'rs_order' },
            { id: 3, enabled: true, type: 'gift', giftName: 'Ice Cream Cone', giftId: '', action: 'rs_bonus' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Perfume', giftId: '', action: 'rs_disaster' }
        ];
    }

    function getRsDefaultConfig() {
        return {
            enabled: false,
            playerName: '@p',
            connection: {
                type: 'rcon',
                host: RS_DEFAULT_HOST,
                port: RS_DEFAULT_PORT,
                password: RS_DEFAULT_PASS
            },
            triggers: getRsDefaultTriggers()
        };
    }

    function getRsConfig() {
        try {
            const raw = localStorage.getItem(RS_STORAGE_KEY);
            if (raw) return { ...getRsDefaultConfig(), ...JSON.parse(raw) };
        } catch (e) {}
        return getRsDefaultConfig();
    }

    function saveRsConfig(cfg) {
        localStorage.setItem(RS_STORAGE_KEY, JSON.stringify(cfg));
    }

    function rsPlayerName() {
        const typed = document.getElementById('rsPlayerName')?.value?.trim();
        return typed || getRsConfig().playerName || '@p';
    }

    function rsToggleEnabled(checked) {
        const cfg = getRsConfig();
        cfg.enabled = !!checked;
        saveRsConfig(cfg);
        if (typeof setGameLiveActive === 'function') setGameLiveActive('restaurant-control', !!checked);
        else if (checked && typeof setActiveGameModId === 'function') setActiveGameModId('restaurant-control');
        if (checked) rsStartZoneWatch();
        else rsStopZoneWatch();
    }

    function rsSaveConnection() {
        const cfg = getRsConfig();
        cfg.connection = {
            type: 'rcon',
            host: document.getElementById('rsConnHost')?.value?.trim() || RS_DEFAULT_HOST,
            port: parseInt(document.getElementById('rsConnPort')?.value, 10) || RS_DEFAULT_PORT,
            password: document.getElementById('rsConnPass')?.value || ''
        };
        cfg.playerName = rsPlayerName();
        saveRsConfig(cfg);
    }

    async function rsRunAction(action, opts = {}) {
        if (typeof executeGameModCommandDetailed !== 'function') {
            throw new Error('executeGameModCommandDetailed ไม่พร้อม');
        }
        const cfg = getRsConfig();
        const payload = JSON.stringify({
            action,
            playerName: opts.playerName || rsPlayerName(),
            user: opts.user || opts.username || 'viewer',
            ...(opts || {})
        });
        const res = await executeGameModCommandDetailed('restaurant-control', payload, cfg.connection || {}, {
            awaitResponse: true,
            fireAndForget: false
        });
        const detail = res?.detail;
        if (!res || res.ok === false) {
            throw new Error(detail?.message || detail?.errors?.[0]?.error || res?.error || res?.message || 'Restaurant action failed');
        }
        if (detail && detail.ok === false) {
            throw new Error(detail.message || detail.errors?.[0]?.error || 'Restaurant action failed');
        }
        return detail || { ok: true, ...res };
    }

    async function rsTestAction(actionId) {
        if (actionId === '__random__') {
            const UI = global.MapTriggerUI;
            const dummy = { type: 'random', action: '__random__', randomActions: [] };
            actionId = (UI && UI.resolveTriggerAction)
                ? (UI.resolveTriggerAction(dummy, RS_ACTIONS).action || '')
                : '';
            if (!actionId || actionId === '__random__') {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'สุ่มแอคชัน', 'ยังไม่มีแอคชันในพูลให้สุ่ม');
                }
                return;
            }
        }
        try {
            rsSaveConnection();
            const res = await rsRunAction(actionId);
            const hint = res.message
                || (res.results || []).map((r) => r?.body || '').filter(Boolean).join('\n')
                || (res.ok !== false ? 'ส่งเข้าเกมแล้ว' : 'ล้มเหลว');
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(res.ok !== false ? 'success' : 'warning', 'Restaurant · ทดสอบ', String(hint).slice(0, 220));
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(`🍽️ ${actionId}: ${String(hint).slice(0, 80)}`, '#e67e22');
            }
            rsUpdateStatusLine(res);
            return res;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', e.message || 'เปิดเซิร์ฟ Minecraft + RCON ก่อน');
            }
        }
    }

    function rsPickTriggerAction(tr) {
        if (!tr) return '';
        const UI = global.MapTriggerUI;
        if ((tr.type === 'random' || tr.action === '__random__') && UI && typeof UI.resolveTriggerAction === 'function') {
            const picked = UI.resolveTriggerAction(tr, RS_ACTIONS).action;
            if (picked && picked !== '__random__') return picked;
        }
        if (tr.action && tr.action !== '__random__') return tr.action;
        return '';
    }

    async function rsTestTrigger(id) {
        const tr = (getRsConfig().triggers || []).find((t) => String(t.id) === String(id));
        if (!tr) return rsTestAction('rs_customer');
        const action = rsPickTriggerAction(tr);
        if (!action) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สุ่มแอคชัน', 'เลือกอย่างน้อย 1 แอคชันในทริกเกอร์สุ่มก่อนทดสอบ');
            }
            return;
        }
        const label = (RS_ACTIONS.find((a) => a.value === action) || {}).label || action;
        if (tr.type === 'random' || tr.action === '__random__') {
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'สุ่มได้', label);
        }
        return rsTestAction(action);
    }

    async function rsTestConnection(opts = {}) {
        rsSaveConnection();
        try {
            const cfg = getRsConfig();
            const res = await executeGameModCommandDetailed('restaurant-control', 'list', cfg.connection || {}, {
                awaitResponse: true
            });
            if (!res || res.ok === false) throw new Error(res?.error || 'RCON failed');
            const el = document.getElementById('rsConnStatus');
            if (el) { el.textContent = '● RCON พร้อม'; el.style.color = '#2ecc71'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'RCON เชื่อมต่อได้', res.message || res.body || 'ok');
            }
            return true;
        } catch (e) {
            rsLastRconError = e.message || String(e);
            const el = document.getElementById('rsConnStatus');
            if (el) { el.textContent = '○ เชื่อมไม่ได้'; el.style.color = '#e74c3c'; }
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'RCON ไม่ได้', e.message);
            }
            return false;
        }
    }

    async function rsBuildMap(opts = {}) {
        try {
            rsSaveConnection();
            if (!opts.silent) rsConsoleAppend('▶ สร้างร้านอาหาร…');
            const res = await rsRunAction('rs_build');
            const ok = res && res.ok !== false;
            rsConsoleAppend(ok
                ? `✓ สร้างร้านแล้วที่ ${res.origin?.x ?? '?'} ${res.origin?.y ?? '?'} ${res.origin?.z ?? '?'}`
                : '⚠ สร้างร้านไม่ครบ');
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg(ok ? 'success' : 'warning', 'Tok Cafe',
                    ok ? 'คาเฟ่พร้อม · คุณคือบาริสต้า' : 'บางคำสั่งล้มเหลว');
            }
            rsUpdateStatusLine(res);
            return res;
        } catch (e) {
            rsConsoleAppend('✗ สร้างร้านไม่ได้: ' + (e.message || e));
            if (!opts.silent && typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สร้างแมพไม่ได้', e.message);
            }
            return { ok: false, error: e.message };
        }
    }

    let rsLastRconError = '';
    let rsBootBuildTimer = null;
    let rsBootBuildBusy = false;

    function rsApplyRconFromStatus(data) {
        if (!data?.rcon) return;
        const host = document.getElementById('rsConnHost');
        const port = document.getElementById('rsConnPort');
        const pass = document.getElementById('rsConnPass');
        if (host && (!host.value || host.value === RS_DEFAULT_HOST)) host.value = RS_DEFAULT_HOST;
        if (port && data.rcon.port) port.value = data.rcon.port;
        if (pass && data.rcon.password) pass.value = data.rcon.password;
        rsSaveConnection();
    }

    async function rsWaitAndBuildMap() {
        if (rsBootBuildBusy) return;
        rsBootBuildBusy = true;
        rsConsoleAppend('รอ Paper บูต แล้วจะสร้างร้าน Tok Cafe…');
        try {
            for (let i = 1; i <= 40; i++) {
                const status = await refreshRsServerStatus();
                if (status?.otherModeRunning) {
                    rsConsoleAppend(`⚠ ${status.otherModeLabel} กำลังรัน — ปิดเซิร์ฟนั้นก่อน`);
                    if (typeof showCustomMsg === 'function') {
                        showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน', status.otherModeLabel);
                    }
                    return;
                }
                if (!status?.running && !status?.gamePortOpen && !status?.rconPortOpen) {
                    rsConsoleAppend(`รอเซิร์ฟบูต… (${i}/40)`);
                    await new Promise((r) => setTimeout(r, 3000));
                    continue;
                }
                const ready = await rsTestConnection({ silent: true });
                if (ready) {
                    const res = await rsBuildMap({ silent: true });
                    if (res && res.ok !== false) {
                        if (typeof showCustomMsg === 'function') {
                            showCustomMsg('success', 'Tok Cafe', 'คาเฟ่พร้อม · คุณคือบาริสต้า · เข้า localhost:25565');
                        }
                        return res;
                    }
                    rsConsoleAppend(`⚠ สร้างร้านยังไม่ติด ลองใหม่… (${i}/40) ${res?.error || ''}`);
                } else {
                    rsConsoleAppend(`รอ RCON… (${i}/40)${rsLastRconError ? ' — ' + rsLastRconError : ''}`);
                }
                await new Promise((r) => setTimeout(r, 3000));
            }
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'สร้างแมพไม่ได้', rsLastRconError || 'กด «สร้างร้านฟาสต์ฟู้ด» หลังเซิร์ฟขึ้น Done');
            }
        } finally {
            rsBootBuildBusy = false;
        }
    }

    async function refreshRsServerStatus() {
        const el = document.getElementById('rsServerStatus');
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const j = await global.McServerUI.fetchStatus('restaurant');
            global.McServerUI.fillRequirementBanner(document.getElementById('rsReqBanner'), j);
            global.McServerUI.applyActionButtons({
                setup: 'rsSetupBtn',
                start: 'rsStartBtn',
                stop: 'rsStopBtn',
                reset: 'rsResetBtn',
                java: 'rsJavaBtn',
                settings: 'rsSettingsBtn'
            }, j);
            const recheck = document.getElementById('rsJavaRecheckBtn');
            if (recheck) recheck.style.display = j?.javaOk === false ? '' : 'none';
            if (el) {
                el.textContent = global.McServerUI.formatStatusLine(j, 'restaurant');
                el.classList.toggle('mc-server-status--on', !!j.running);
            }
            const joinEl = document.getElementById('rsJoinAddress');
            if (joinEl && j.join) joinEl.textContent = j.join;
            rsApplyRconFromStatus(j);
            return j;
        } catch (e) {
            if (el) el.textContent = '○ ตรวจสถานะไม่ได้';
            return null;
        }
    }

    async function rsSetupServer() {
        const btn = document.getElementById('rsSetupBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังดาวน์โหลด / ติดตั้ง...'; }
        try {
            const status = await refreshRsServerStatus();
            if (status?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${status.otherModeLabel} กำลังรัน — Restaurant ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                rsConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน แล้วค่อยติดตั้ง Restaurant');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            rsConsoleAppend('▶ เริ่มดาวน์โหลด / ติดตั้งแพ็กเกจ Restaurant…');
            const setupData = await global.McServerUI.setupServer('restaurant', {
                onProgress: (_p, line) => rsConsoleAppend(line)
            });
            if (setupData.success !== false) {
                rsConsoleAppend('✓ ติดตั้งแพ็กเกจ Restaurant เสร็จ — กด «เริ่มเซิร์ฟเวอร์» ได้');
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'ติดตั้งแพ็กเกจแล้ว', 'กด «เริ่มเซิร์ฟเวอร์» เมื่อพร้อม');
                }
            } else {
                rsConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (setupData.error || 'unknown'));
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', setupData.error || 'unknown');
                }
            }
        } catch (e) {
            rsConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', e.message);
        } finally {
            await refreshRsServerStatus();
        }
    }

    async function rsStartServer() {
        const btn = document.getElementById('rsStartBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังเริ่ม...'; }
        try {
            const status = await refreshRsServerStatus();
            if (status?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${status.otherModeLabel} กำลังรัน — Restaurant ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                rsConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน');
                return;
            }
            if (!status?.javaOk) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อน');
                }
                rsConsoleAppend('⚠ ยังไม่พบ Java 21+');
                return;
            }
            if (!status?.installed) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('info', 'ยังไม่ติดตั้ง', 'กดดาวน์โหลด / ติดตั้งแพ็กเกจก่อน');
                }
                rsConsoleAppend('⚠ ยังไม่ติดตั้งแพ็กเกจ');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            rsConsoleAppend('▶ เริ่มเซิร์ฟเวอร์ Restaurant…');
            const j = await global.McServerUI.startServer('restaurant', {
                onProgress: (_p, line) => rsConsoleAppend(line)
            });
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(j.success !== false ? 'success' : 'error', 'เริ่มเซิร์ฟ Restaurant',
                    j.success !== false
                        ? `เซิร์ฟแยก · โลก ${j.levelName || 'tokcontrol_restaurant'} · ${j.join || 'localhost:25565'}`
                        : (j.error || 'ล้มเหลว'));
            }
            if (j.success !== false) {
                rsConsoleAppend('✓ เปิดเซิร์ฟแล้ว · ' + (j.join || 'localhost:25565') + ' — รอ Paper บูต แล้วสร้างแมพอัตโนมัติ');
                if (rsBootBuildTimer) clearTimeout(rsBootBuildTimer);
                rsBootBuildTimer = setTimeout(() => rsWaitAndBuildMap(), 6000);
            } else {
                rsConsoleAppend('✗ เริ่มเซิร์ฟไม่ได้: ' + (j.error || 'unknown'));
            }
        } catch (e) {
            rsConsoleAppend('✗ เริ่มเซิร์ฟไม่ได้: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เริ่มเซิร์ฟไม่ได้', e.message);
        } finally {
            await refreshRsServerStatus();
        }
    }

    async function rsLaunchServer() {
        const status = await refreshRsServerStatus();
        if (!status?.installed) return rsSetupServer();
        return rsStartServer();
    }

    async function rsInstallJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.installJava();
        await refreshRsServerStatus();
    }

    async function rsRecheckJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.recheckJava();
        await refreshRsServerStatus();
    }

    async function rsStopServer() {
        try {
            if (global.McServerUI) await global.McServerUI.stopServer();
            refreshRsServerStatus();
        } catch (e) {}
    }

    async function rsResetServer() {
        const ok = typeof tcConfirm === 'function'
            ? await tcConfirm('ลบแมพ Restaurant และติดตั้งเซิร์ฟใหม่?\n(ปิดเซิร์ฟ + ลบ world)', {
                title: 'ลบ & โหลดใหม่',
                icon: '🗑️',
                okLabel: 'ลบ & โหลดใหม่'
            })
            : confirm('ลบแมพ Restaurant และติดตั้งเซิร์ฟใหม่?\n(ปิดเซิร์ฟ + ลบ world)');
        if (!ok) return;

        const btn = document.getElementById('rsResetBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังลบ...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.resetServer('restaurant');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'โหลดใหม่แล้ว', 'กดเปิดเซิร์ฟ Restaurant แล้วเข้าเกมได้');
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
            refreshRsServerStatus();
        }
    }

    function rsCopyJoinAddress() {
        const addr = document.getElementById('rsJoinAddress')?.textContent || 'localhost:25565';
        if (global.McServerUI?.copyJoinAddress) {
            global.McServerUI.copyJoinAddress(addr);
        } else if (typeof copyToClipboard === 'function') {
            copyToClipboard(addr);
        } else if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(addr);
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', addr);
        }
    }

    async function rsOpenServerFolder() {
        if (global.McServerUI?.openServerFolder) {
            await global.McServerUI.openServerFolder('restaurant');
            return;
        }
        try {
            if (!global.McServerUI) return;
            const data = await global.McServerUI.fetchStatus('restaurant');
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

    function rsUpdateStatusLine(detail) {
        const el = document.getElementById('rsLiveStatus');
        if (!el) return;
        const money = detail?.money != null ? detail.money : (typeof RestaurantMapManager !== 'undefined' ? null : null);
        const customers = detail?.customers;
        const zone = detail?.zone;
        const bits = [];
        if (zone) bits.push('โซน ' + zone.replace(/_ZONE$/, ''));
        if (typeof customers === 'number') bits.push('ลูกค้า ' + customers);
        if (typeof money === 'number') bits.push('$' + money);
        if (detail?.origin) bits.push(`origin ${detail.origin.x} ${detail.origin.y} ${detail.origin.z}`);
        if (bits.length) el.textContent = bits.join(' · ');
    }

    function rsStartZoneWatch() {
        rsStopZoneWatch();
        rsZoneTimer = setInterval(() => {
            if (typeof isGameLiveActive === 'function' && !isGameLiveActive('restaurant-control')) return;
            rsRunAction('rs_tick', { playerName: rsPlayerName() }).then(rsUpdateStatusLine).catch(() => {});
        }, 2500);
    }

    function rsStopZoneWatch() {
        if (rsZoneTimer) {
            clearInterval(rsZoneTimer);
            rsZoneTimer = null;
        }
    }

    const rsTriggerCounters = {};

    function handleRsGift(giftData) {
        if (!getRsConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('restaurant-control')) return false;
        if (Number(giftData?.giftType) === 1 && giftData?.repeatEnd === false) return false;
        const user = giftData?.uniqueId || giftData?.nickname || giftData?.user || 'viewer';
        const UI = global.MapTriggerUI;
        const fire = (tr, _user, qty) => {
            let action = tr.action || 'rs_customer';
            if ((tr.type === 'random' || action === '__random__') && UI && typeof UI.resolveTriggerAction === 'function') {
                action = UI.resolveTriggerAction(tr, RS_ACTIONS).action || action;
            }
            if (!action || action === '__random__') return;
            const n = Math.max(1, Math.min(8, qty || 1));
            const label = (RS_ACTIONS.find((a) => a.value === action) || {}).label || action;
            (async () => {
                for (let i = 0; i < n; i++) {
                    await rsRunAction(action, { user, playerName: rsPlayerName() });
                }
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`🍽️ @${user} → ${label}${n > 1 ? ' ×' + n : ''}`, '#e67e22');
                }
            })().catch(() => {});
        };
        if (UI && typeof UI.matchGiftTriggers === 'function') {
            const result = UI.matchGiftTriggers(getRsConfig().triggers || [], giftData, fire, rsTriggerCounters, RS_ACTIONS);
            return !!result.fired;
        }
        return false;
    }

    function handleRsLiveEvent(eventType, data) {
        if (!getRsConfig().enabled) return false;
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('restaurant-control')) return false;
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.matchLiveEvent !== 'function') return false;
        return UI.matchLiveEvent(getRsConfig().triggers || [], eventType, data, (tr) => {
            let action = tr.action || 'rs_customer';
            if ((tr.type === 'random' || action === '__random__') && typeof UI.resolveTriggerAction === 'function') {
                action = UI.resolveTriggerAction(tr, RS_ACTIONS).action || action;
            }
            if (!action || action === '__random__') return;
            const who = data?.nickname || data?.uniqueId || 'viewer';
            rsRunAction(action, { user: who, playerName: rsPlayerName() }).catch(() => {});
        }, rsTriggerCounters, RS_ACTIONS);
    }

    function handleRsLike(data) {
        let fired = false;
        if (handleRsLiveEvent('like', data)) fired = true;
        if (handleRsLiveEvent('globallikes', data)) fired = true;
        return fired;
    }

    function switchRsTopTab(tab) {
        const settings = document.getElementById('rsSettingsPanel');
        const trigger = document.getElementById('rsTriggerPanel');
        const tSettings = document.getElementById('rsTabSettings');
        const tTrigger = document.getElementById('rsTabTrigger');
        const isTrig = tab === 'trigger';
        if (settings) settings.style.display = isTrig ? 'none' : 'flex';
        if (trigger) {
            trigger.style.display = isTrig ? 'flex' : 'none';
            trigger.classList.toggle('active-flex', isTrig);
        }
        tSettings?.classList.toggle('active', !isTrig);
        tTrigger?.classList.toggle('active', isTrig);
        if (isTrig) renderRsTriggers();
    }

    function switchRsSection(sec) {
        const conn = document.getElementById('rsSectionConn');
        const actions = document.getElementById('rsSectionActions');
        if (conn) {
            conn.classList.toggle('active', sec === 'conn');
            conn.style.display = sec === 'conn' ? '' : 'none';
        }
        if (actions) {
            actions.classList.toggle('active', sec === 'actions');
            actions.style.display = sec === 'actions' ? '' : 'none';
        }
        document.getElementById('rsNavConn')?.classList.toggle('active', sec === 'conn');
        document.getElementById('rsNavActions')?.classList.toggle('active', sec === 'actions');
    }

    function rsConsoleAppend(line) {
        const el = document.getElementById('rsConsoleOutput');
        if (!el) return;
        const prev = el.textContent === 'พร้อมรันคำสั่งร้านอาหาร…' ? '' : el.textContent;
        el.textContent = (prev ? prev + '\n' : '') + String(line || '');
        el.scrollTop = el.scrollHeight;
    }

    function rsConsoleFill(key) {
        const ta = document.getElementById('rsConsoleInput');
        if (ta) ta.value = RS_CONSOLE_PRESETS[key] || '';
    }

    function rsConsoleClear() {
        const el = document.getElementById('rsConsoleOutput');
        if (el) el.textContent = 'พร้อมรันคำสั่งร้านอาหาร…';
    }

    async function rsConsoleRun() {
        const ta = document.getElementById('rsConsoleInput');
        const raw = (ta?.value || '').trim();
        if (!raw) return;
        rsConsoleAppend('→ ' + raw);
        try {
            rsSaveConnection();
            let action = '';
            let opts = {};
            if (raw.startsWith('{')) {
                const j = JSON.parse(raw);
                action = j.action || j.cmd || '';
                opts = j;
            } else {
                action = raw;
            }
            if (!action) throw new Error('ไม่มี action');
            const res = await rsRunAction(action, opts);
            rsConsoleAppend('← ' + JSON.stringify(res, null, 2));
            rsUpdateStatusLine(res);
        } catch (e) {
            rsConsoleAppend('✗ ' + (e.message || e));
        }
    }

    function renderRsTriggers() {
        const list = document.getElementById('rsTriggerList');
        if (!list) return;
        const triggers = getRsConfig().triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์»</p>';
            return;
        }
        const UI = global.MapTriggerUI;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, RS_ACTIONS, {
                    prefix: 'rs',
                    giftOnclick: `rsPickGift(${tr.id})`,
                    actionOnclick: `rsUpdateTrigger(${tr.id}, 'action', '{value}'); renderRsTriggers();`,
                    testOnclick: `rsTestTrigger(${tr.id})`,
                    removeOnclick: `rsRemoveTrigger(${tr.id})`
                });
            }
            const label = (tr.giftName || tr.type || 'ทริกเกอร์') + ' → ' + (tr.action || '');
            return `<div class="rp-trigger-chip mc-trigger-chip" data-id="${tr.id}">
                <span class="rp-trigger-chip-label">${String(label).replace(/</g, '&lt;')}</span>
                <div class="mc-trigger-chip-actions">
                    <button type="button" class="gp-btn-primary mc-test-btn" onclick="rsTestTrigger(${tr.id})" title="ทดสอบ">▶</button>
                    <button type="button" class="mc-remove-btn" onclick="rsRemoveTrigger(${tr.id})" title="ลบ">✕</button>
                </div>
            </div>`;
        }).join('');
    }

    function rsAddTrigger() {
        const UI = global.MapTriggerUI;
        if (!UI || typeof UI.open !== 'function') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ทริกเกอร์', 'ระบบโมดอลยังไม่พร้อม');
            return;
        }
        UI.open({
            title: 'ทริกเกอร์ Restaurant Control',
            actions: RS_ACTIONS,
            defaultAction: 'rs_customer',
            onSave: (payload) => {
                const cfg = getRsConfig();
                cfg.triggers = cfg.triggers || [];
                cfg.triggers.push(payload);
                saveRsConfig(cfg);
                renderRsTriggers();
            }
        });
    }

    function rsRemoveTrigger(idOrIndex) {
        const cfg = getRsConfig();
        const id = String(idOrIndex);
        const byId = (cfg.triggers || []).some((t) => String(t.id) === id);
        if (byId) cfg.triggers = cfg.triggers.filter((t) => String(t.id) !== id);
        else cfg.triggers.splice(Number(idOrIndex), 1);
        saveRsConfig(cfg);
        renderRsTriggers();
    }

    function rsUpdateTrigger(idOrIndex, key, value) {
        const cfg = getRsConfig();
        let tr = (cfg.triggers || []).find((t) => String(t.id) === String(idOrIndex));
        if (!tr && cfg.triggers[idOrIndex]) tr = cfg.triggers[idOrIndex];
        if (!tr) return;
        if (key === 'action' && tr.type === 'random' && global.MapTriggerUI && MapTriggerUI.applyActionPick) {
            MapTriggerUI.applyActionPick(tr, value, RS_ACTIONS);
        } else {
            tr[key] = key === 'enabled' ? !!value : value;
        }
        saveRsConfig(cfg);
    }

    function rsPickGift(id) {
        if (!global.GiftPicker) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Gift Picker', 'ระบบเลือกของขวัญยังไม่พร้อม');
            return;
        }
        GiftPicker.open({
            title: '🎁 เลือกของขวัญ Restaurant Control',
            onSelect: (gift) => {
                rsUpdateTrigger(id, 'giftName', gift.giftName || '');
                rsUpdateTrigger(id, 'giftId', String(gift.giftId || ''));
                rsUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderRsTriggers();
            }
        });
    }

    async function renderRsProfile() {
        const cfg = getRsConfig();
        const enabled = document.getElementById('rsGameEnabled');
        if (enabled) enabled.checked = !!cfg.enabled;
        const host = document.getElementById('rsConnHost');
        const port = document.getElementById('rsConnPort');
        const pass = document.getElementById('rsConnPass');
        const player = document.getElementById('rsPlayerName');
        if (host) host.value = cfg.connection?.host || RS_DEFAULT_HOST;
        if (port) port.value = cfg.connection?.port || RS_DEFAULT_PORT;
        if (pass) pass.value = cfg.connection?.password || '';
        if (player) player.value = cfg.playerName || '@p';
        renderRsTriggers();
        switchRsTopTab('settings');
        switchRsSection('conn');
        refreshRsServerStatus();
        if (cfg.enabled) rsStartZoneWatch();
        else rsStopZoneWatch();
    }

    global.getRsConfig = getRsConfig;
    global.saveRsConfig = saveRsConfig;
    global.rsToggleEnabled = rsToggleEnabled;
    global.rsSaveConnection = rsSaveConnection;
    global.rsTestConnection = rsTestConnection;
    global.rsTestAction = rsTestAction;
    global.rsTestTrigger = rsTestTrigger;
    global.rsAddTrigger = rsAddTrigger;
    global.rsRemoveTrigger = rsRemoveTrigger;
    global.rsUpdateTrigger = rsUpdateTrigger;
    global.rsPickGift = rsPickGift;
    global.renderRsTriggers = renderRsTriggers;
    global.handleRsGift = handleRsGift;
    global.handleRsLike = handleRsLike;
    global.handleRsLiveEvent = handleRsLiveEvent;
    global.renderRsProfile = renderRsProfile;
    global.switchRsTopTab = switchRsTopTab;
    global.switchRsSection = switchRsSection;
    global.rsConsoleFill = rsConsoleFill;
    global.rsConsoleClear = rsConsoleClear;
    global.rsConsoleRun = rsConsoleRun;
    global.rsBuildMap = rsBuildMap;
    global.rsWaitAndBuildMap = rsWaitAndBuildMap;
    global.rsSetupServer = rsSetupServer;
    global.rsStartServer = rsStartServer;
    global.rsLaunchServer = rsLaunchServer;
    global.rsStopServer = rsStopServer;
    global.rsResetServer = rsResetServer;
    global.rsCopyJoinAddress = rsCopyJoinAddress;
    global.rsOpenServerFolder = rsOpenServerFolder;
    global.refreshRsServerStatus = refreshRsServerStatus;
    global.rsInstallJavaThenRefresh = rsInstallJavaThenRefresh;
    global.rsRecheckJavaThenRefresh = rsRecheckJavaThenRefresh;

    global.addEventListener('mc-server-changed', (ev) => {
        if (ev?.detail?.world === 'restaurant') refreshRsServerStatus();
    });
})(typeof window !== 'undefined' ? window : global);
