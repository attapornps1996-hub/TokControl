/**
 * Minecraft Bedrock Border Map — ของขวัญ TikTok → ย่อ/ขยายแมพผ่าน Paper plugin
 * ต้องมี Paper plugin หรือ test bridge ที่ http://127.0.0.1:8081
 */
(function (global) {
    'use strict';

    const MC_STORAGE_KEY = 'tokcontrol_minecraft';
    const MC_DEFAULT_HOST = 'http://127.0.0.1:8081';
    let mcCatalog = null;
    const mcTriggerCounters = {};

    const MC_TRIGGER_TYPES = [
        { value: 'gift', icon: '🎁', label: 'ของขวัญ' },
        { value: 'coins', icon: '🪙', label: 'เหรียญ' },
        { value: 'random', icon: '🎲', label: 'สุ่ม' },
        { value: 'like', icon: '❤️', label: 'ไลค์' },
        { value: 'globallikes', icon: '💖', label: 'ไลค์รวม' },
        { value: 'follow', icon: '👤', label: 'ติดตาม' },
        { value: 'share', icon: '🔗', label: 'แชร์ไลฟ์' },
        { value: 'join', icon: '🚪', label: 'เข้าห้อง' },
        { value: 'subscribe', icon: '⭐', label: 'สมาชิก' }
    ];

    function getMcBedrockTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '', action: 'mc_summon_tnt', placement: 'above_player' },
            { id: 2, enabled: true, type: 'gift', giftName: 'Mini Heart', giftId: '', action: 'mc_shrink_map', placement: 'random_near' },
            { id: 3, enabled: true, type: 'gift', giftName: 'Donut', giftId: '', action: 'mc_expand_map', placement: 'random_near' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', action: 'mc_plus_win', placement: 'near_player' }
        ];
    }

    function normalizeMcTrigger(tr) {
        if (!tr) return null;
        const type = MC_TRIGGER_TYPES.some(t => t.value === tr.type) ? tr.type : 'gift';
        let action = tr.action || 'mc_summon_tnt';
        // ทริกเกอร์เก่าที่เคยผูก Farm / place_block → แปลงเป็นแอคชั่น Box
        if (action === 'place_block' || action === 'fm_fire' || action === 'fm_expand'
            || action === 'fm_cow' || action === 'fm_villager' || String(action).startsWith('fm_')) {
            action = action === 'place_block' ? 'mc_give_blocks' : 'mc_summon_tnt';
        }
        if (action === 'zone_expand') action = 'mc_expand_map';
        if (action === 'zone_shrink') action = 'mc_shrink_map';
        return {
            ...tr,
            action,
            type,
            threshold: Math.max(1, parseInt(tr.threshold, 10) || 1),
            giftThreshold: Math.max(1, parseInt(tr.giftThreshold, 10) || 1),
            minCoins: Math.max(1, parseInt(tr.minCoins, 10) || 1),
            maxCoins: Math.max(1, parseInt(tr.maxCoins, 10) || 999999),
            chance: Math.max(1, Math.min(100, parseInt(tr.chance, 10) || 50)),
            randomActions: Array.isArray(tr.randomActions) ? tr.randomActions.slice() : [],
            amount: Math.max(1, parseInt(tr.amount, 10) || 1),
            block: tr.block || (action === 'mc_give_blocks' ? 'minecraft:amethyst_block' : tr.block)
        };
    }

    async function loadMcCatalog() {
        if (mcCatalog) return mcCatalog;
        try {
            const res = await fetch('/data/minecraft_troll_catalog.json');
            mcCatalog = await res.json();
        } catch (e) {
            mcCatalog = { blocks: [], traps: [], zone_actions: [], time_actions: [], placements: [] };
        }
        return mcCatalog;
    }

    function getMcDefaultConfig() {
        return {
            enabled: false,
            mode: 'bedrock_border',
            connection: { type: 'websocket', host: MC_DEFAULT_HOST },
            placement: 'random_near',
            triggers: getMcBedrockTriggers()
        };
    }

    function getMcConfig() {
        try {
            const raw = localStorage.getItem(MC_STORAGE_KEY);
            if (raw) {
                const cfg = { ...getMcDefaultConfig(), ...JSON.parse(raw) };
                if (cfg.mode !== 'bedrock_border') {
                    cfg.mode = 'bedrock_border';
                    cfg.triggers = getMcBedrockTriggers();
                    saveMcConfig(cfg);
                } else if (Array.isArray(cfg.triggers)) {
                    let changed = false;
                    cfg.triggers = cfg.triggers.map((t) => {
                        const n = normalizeMcTrigger(t);
                        if (!n) return t;
                        if (t && t.action === 'mc_give_blocks' && (!t.block || /cobblestone/i.test(t.block))) {
                            changed = true;
                            return { ...n, block: 'minecraft:amethyst_block', count: t.count || 16 };
                        }
                        if (n.action !== t.action) changed = true;
                        return n;
                    }).filter(Boolean);
                    if (changed) saveMcConfig(cfg);
                }
                return cfg;
            }
        } catch (e) {}
        return getMcDefaultConfig();
    }

    function saveMcConfig(cfg) {
        localStorage.setItem(MC_STORAGE_KEY, JSON.stringify(cfg));
    }

    function mcBuildCommand(action, opts) {
        const user = opts.user || 'viewer';
        const placement = opts.placement || getMcConfig().placement || 'random_near';
        const count = Math.max(1, parseInt(opts.count, 10) || 1);
        const base = { cmd: action, user, placement };
        if (action === 'place_block') {
            return JSON.stringify({ ...base, block: opts.block || 'minecraft:obsidian', count });
        }
        if (action === 'place_trap') {
            return JSON.stringify({ ...base, trap: opts.trap || 'obsidian_pillar', count });
        }
        if (action === 'fill_line') {
            return JSON.stringify({ ...base, block: opts.block || 'minecraft:obsidian', length: opts.length || 5 });
        }
        if (action === 'block_rain') {
            return JSON.stringify({
                cmd: 'block_rain',
                block: opts.block || 'minecraft:anvil',
                count: opts.count || 3,
                user,
                placement: 'above_player'
            });
        }
        if (action === 'zone_expand' || action === 'zone_shrink') {
            return JSON.stringify({ cmd: action, amount: opts.amount || 2, user });
        }
        if (action === 'path_bridge') {
            return JSON.stringify({ cmd: action, length: opts.length || 5, user });
        }
        if (action === 'path_build_layer') {
            return JSON.stringify({ cmd: action, user });
        }
        if (action === 'path_melt_all' || action === 'path_fill_all') {
            return JSON.stringify({ cmd: action, user });
        }
        if (action === 'zone_tnt') {
            return JSON.stringify({ cmd: action, level: opts.level || 1, user });
        }
        if (action === 'win_start_countdown') {
            return JSON.stringify({ cmd: action, seconds: opts.seconds || 10, user });
        }
        if (action === 'stun_player' || action === 'stun_add' || action === 'stun_reduce') {
            return JSON.stringify({ cmd: action, seconds: opts.seconds || 10, user });
        }
        if (action === 'mc_lava_melt' || action === 'mc_villager_help'
            || action === 'mc_help_one_layer' || action === 'mc_help_ten_rows') {
            return JSON.stringify({ cmd: action, user });
        }
        if (action === 'mc_minus_win' || action === 'mc_plus_win') {
            return JSON.stringify({
                cmd: action,
                user,
                amount: Math.max(1, parseInt(opts.amount, 10) || 1)
            });
        }
        if (action === 'mc_admin_mode') {
            return JSON.stringify({ cmd: action, toggle: true, user });
        }
        if (action === 'arena_rebuild') {
            return JSON.stringify({ cmd: action, user });
        }
        if ([
            'mc_build_bedrock_map',
            'mc_expand_map',
            'mc_shrink_map',
            'mc_reset_map',
            'mc_summon_tnt',
            'mc_summon_tnt_strong',
            'mc_like_glass',
            'mc_lava_melt',
            'mc_villager_help',
            'mc_help_one_layer',
            'mc_help_ten_rows',
            'mc_minus_win',
            'mc_plus_win',
            'mc_admin_mode'
        ].includes(action)) {
            return JSON.stringify({
                cmd: action,
                user,
                level: opts.level,
                height: opts.height,
                seconds: opts.seconds || 10,
                amount: Math.max(1, parseInt(opts.amount, 10) || 1)
            });
        }
        if (action === 'mc_give_blocks') {
            return JSON.stringify({
                cmd: action,
                user,
                block: opts.block || 'minecraft:cobblestone',
                count: opts.count || 16
            });
        }
        if (action === 'say') {
            return JSON.stringify({ cmd: 'say', message: opts.message || `@${user} triggered!` });
        }
        return String(action);
    }

    async function mcSendCommand(command, opts = {}) {
        const cfg = getMcConfig();
        const conn = cfg.connection || { type: 'websocket', host: MC_DEFAULT_HOST };
        const cmd = typeof command === 'string' ? command : mcBuildCommand(command.action, { ...command, user: command.user || 'test' });
        // บวก/ลบวิน → อัปเดตตัวนับ WIN ทันที (changeCount ถูก expose บน window แล้ว)
        try {
            const parsed = typeof cmd === 'string' && cmd.startsWith('{') ? JSON.parse(cmd) : null;
            const action = parsed?.cmd || (typeof command === 'object' ? command.action : '');
            const amount = Math.max(1, parseInt(parsed?.amount ?? (typeof command === 'object' ? command.amount : 1), 10) || 1);
            if (action === 'mc_plus_win') mcApplyWinCounter(amount, `บวกวิน ×${amount}`);
            else if (action === 'mc_minus_win') mcApplyWinCounter(-amount, `ลบวิน ×${amount}`);
        } catch (e) {}
        if (typeof executeGameModCommandDetailed === 'function') {
            return executeGameModCommandDetailed('minecraft', cmd, conn, opts);
        }
        if (typeof executeGameModCommand === 'function') {
            const ok = await executeGameModCommand('minecraft', cmd, conn, opts);
            return { ok };
        }
        return { ok: false, error: 'no_executor' };
    }

    function mcIsWinCounterLinked() {
        try {
            const raw = localStorage.getItem('win_settings');
            if (!raw) return true;
            const s = JSON.parse(raw);
            // ค่าเริ่มต้น = เปิดเชื่อมต่อ (undefined/null ถือว่าเปิด)
            return s.autoLinkBoxControl !== false;
        } catch (e) {
            return true;
        }
    }

    function mcEnsureWinLinkEnabled() {
        try {
            const raw = localStorage.getItem('win_settings');
            const s = raw ? JSON.parse(raw) : {};
            if (s.autoLinkBoxControl === false) {
                s.autoLinkBoxControl = true;
                localStorage.setItem('win_settings', JSON.stringify(s));
            }
            const toggle = document.getElementById('winSetting-autoLinkBoxControl');
            if (toggle) toggle.checked = true;
            if (typeof window.winSettings === 'object' && window.winSettings) {
                window.winSettings.autoLinkBoxControl = true;
            }
        } catch (e) {}
    }

    function mcApplyWinCounter(delta, label) {
        if (!delta) return;
        mcEnsureWinLinkEnabled();

        const apply = (typeof window.changeCount === 'function')
            ? window.changeCount
            : (typeof global.changeCount === 'function' ? global.changeCount : null);

        if (apply) {
            apply(delta);
        } else {
            // fallback ถ้า changeCount ยังไม่พร้อม — อัปเดต localStorage + UI โดยตรง
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
            } catch (e) {}
            console.warn('[Box Control] ใช้ fallback อัปเดต WIN (changeCount ยังไม่พร้อม)');
        }

        if (typeof logToDashboard === 'function') {
            logToDashboard(`📦 Box Control → ตัวนับ WIN ${delta > 0 ? '+' : ''}${delta}${label ? ` (${label})` : ''}`, delta > 0 ? '#2ecc71' : '#ff6b81');
        }
    }

    let mcWinPollTimer = null;
    function mcShouldPollWin() {
        const cfg = getMcConfig();
        if (!mcIsWinCounterLinked()) return false;
        if (cfg.enabled) return true;
        if (typeof isGameLiveActive === 'function' && isGameLiveActive('minecraft')) return true;
        return false;
    }

    function mcStartWinCounterPoll() {
        if (mcWinPollTimer) return;
        mcWinPollTimer = setInterval(async () => {
            try {
                if (!mcShouldPollWin()) return;
                let delta = 0;
                try {
                    const r = await fetch('/api/minecraft/win-delta', { method: 'GET', cache: 'no-store' });
                    if (r.ok) {
                        const data = await r.json();
                        delta = Number(data?.pendingWinDelta || 0);
                    }
                } catch (e0) {}
                if (!delta && typeof mcSendCommand === 'function') {
                    // Legacy: POST health via bridge no longer consumes — skip apply from peek
                }
                if (delta) mcApplyWinCounter(delta, 'ชนะแมพ');
            } catch (e) {}
        }, 1500);
    }

    function mcStopWinCounterPoll() {
        if (mcWinPollTimer) {
            clearInterval(mcWinPollTimer);
            mcWinPollTimer = null;
        }
    }

    function mcToggleEnabled(checked) {
        const cfg = getMcConfig();
        cfg.enabled = !!checked;
        saveMcConfig(cfg);
        if (checked && typeof setActiveGameModId === 'function') setActiveGameModId('minecraft');
        if (typeof setGameLiveActive === 'function' && checked) setGameLiveActive('minecraft', true);
        if (checked) mcStartWinCounterPoll();
        else mcStopWinCounterPoll();
    }

    function mcSaveConnection() {
        const cfg = getMcConfig();
        const hostEl = document.getElementById('mcConnHost');
        if (hostEl) cfg.connection = { type: 'websocket', host: mcNormalizeConnHost(hostEl.value.trim() || MC_DEFAULT_HOST) };
        saveMcConfig(cfg);
    }

    function mcSavePlacement(val) {
        const cfg = getMcConfig();
        cfg.placement = val;
        saveMcConfig(cfg);
    }

    function mcNormalizeConnHost(host) {
        let h = String(host || MC_DEFAULT_HOST).trim();
        if (h.startsWith('ws://')) h = 'http://' + h.slice(5);
        if (h.startsWith('wss://')) h = 'https://' + h.slice(6);
        if (!h.startsWith('http')) h = 'http://' + h;
        return h;
    }

    function mcBtnIds() {
        return {
            setup: 'mcSetupBtn',
            start: 'mcStartBtn',
            stop: 'mcStopBtn',
            reset: 'mcResetBtn',
            java: 'mcJavaBtn',
            settings: 'mcSettingsBtn',
            test: 'mcTestArenaBtn'
        };
    }

    function mcUpdateServerButtons(data) {
        const UI = global.McServerUI;
        if (UI) UI.applyActionButtons(mcBtnIds(), data);
        const recheck = document.getElementById('mcJavaRecheckBtn');
        if (recheck) recheck.style.display = data?.javaOk === false ? '' : 'none';
    }

    async function mcInstallJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.installJava();
        await refreshMcServerStatus();
    }

    async function mcRecheckJavaThenRefresh() {
        if (global.McServerUI) await global.McServerUI.recheckJava();
        await refreshMcServerStatus();
    }

    async function mcFreeBridgePort() {
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            await global.McServerUI.apiFetch('/api/games/minecraft/free-bridge', { method: 'POST' });
        } catch (e) { /* ignore */ }
    }

    async function mcPollBridgeReady(maxAttempts = 12, intervalMs = 8000) {
        await new Promise(r => setTimeout(r, 20000));
        for (let i = 0; i < maxAttempts; i++) {
            const res = await mcTestConnection({ silent: true });
            if (res.isTestBridge) await mcFreeBridgePort();
            if (res.ok && res.isRealPlugin) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'Plugin พร้อม', 'เชื่อมต่อ Paper plugin แล้ว — กดทดสอบสร้างแมพ');
                }
                return true;
            }
            if (res.error === 'plugin_not_ready' || (res.error && String(res.error).includes('ECONNREFUSED'))) {
                const dot = document.getElementById('mcConnStatus');
                if (dot) {
                    dot.textContent = `○ รอ Plugin โหลด... (${i + 1}/${maxAttempts})`;
                    dot.style.color = '#f39c12';
                }
            }
            await new Promise(r => setTimeout(r, intervalMs));
        }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('warning', 'Plugin ยังไม่ตอบ', 'ปิดเซิร์ฟ → ลบ & โหลดใหม่ → เปิดเซิร์ฟอีกครั้ง แล้วรอจนเห็น Done ในเทอร์มินัล');
        }
        return false;
    }

    async function mcTestConnection(opts = {}) {
        mcSaveConnection();
        const res = await mcSendCommand('health', { awaitResponse: true, fireAndForget: false });
        const mod = String(res.mod || res.detail?.mod || '');
        const isRealPlugin = mod.includes('TokControl_Minecraft') && !mod.includes('TestBridge');
        const isTestBridge = mod.includes('TestBridge');
        const dot = document.getElementById('mcConnStatus');
        if (!opts.silent && typeof showCustomMsg === 'function') {
            if (res.ok && isRealPlugin) showCustomMsg('success', 'เชื่อมต่อ Plugin จริง', 'คำสั่งจะทำงานในเกมได้');
            else if (res.ok && isTestBridge) showCustomMsg('warning', 'Test Bridge เท่านั้น', 'เปิดเซิร์ฟ Paper แล้วรอ plugin โหลด — คำสั่งยังไม่เข้าเกม');
            else showCustomMsg('error', 'เชื่อมต่อไม่ได้', res.error || 'เปิดเซิร์ฟเวอร์และรอ plugin โหลด');
        }
        if (dot) {
            if (res.ok && isRealPlugin) {
                dot.textContent = '● Plugin พร้อม (ในเกมใช้ได้)';
                dot.style.color = '#2ecc71';
            } else if (res.ok && isTestBridge) {
                dot.textContent = '● รอ Plugin (ปิด Test Bridge แล้ว)';
                dot.style.color = '#f1c40f';
                await mcFreeBridgePort();
            } else if (res.error && String(res.error).includes('plugin_loading')) {
                dot.textContent = '○ รอ Plugin โหลด...';
                dot.style.color = '#f39c12';
            } else {
                dot.textContent = '○ ไม่พบ bridge';
                dot.style.color = '#ff6b81';
            }
        }
        return { ...res, mod, isRealPlugin, isTestBridge };
    }

    function mcNormalizeGiftName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function mcResolveBedrockGiftAction(gift) {
        const name = mcNormalizeGiftName(gift.giftName);
        const id = String(gift.giftId || '');
        if (name === 'rose' || name.includes('กุหลาบ') || id === '5655') {
            return { action: 'mc_summon_tnt', label: 'TNT บนหัว' };
        }
        if (name === 'mini heart' || name.includes('miniheart') || name.includes('มินิฮาร์ท')) {
            return { action: 'mc_shrink_map', label: 'บีบแมพ' };
        }
        if (name === 'donut' || name === 'doughnut' || name.includes('โดนัท')) {
            return { action: 'mc_expand_map', label: 'ขยายแมพ' };
        }
        if (name === 'finger heart' || name.includes('fingerheart') || name.includes('หัวใจนิ้ว')) {
            return { action: 'mc_give_blocks', block: 'minecraft:cobblestone', count: 16, label: 'แจก Cobblestone' };
        }
        return null;
    }

    function mcIsLive() {
        if (typeof isGameLiveActive === 'function') return isGameLiveActive('minecraft');
        return !!getMcConfig().enabled;
    }

    let mcLastStatus = null;
    let mcLastStatusAt = 0;

    async function mcFetchBoxStatus(force = false) {
        const now = Date.now();
        if (!force && mcLastStatus && (now - mcLastStatusAt) < 4000) return mcLastStatus;
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            mcLastStatus = await global.McServerUI.fetchStatus('box');
            mcLastStatusAt = now;
        } catch (e) {
            mcLastStatus = { running: false, error: e.message };
            mcLastStatusAt = now;
        }
        return mcLastStatus;
    }

    function mcBoxGateError(status) {
        if (!status) return 'ตรวจสถานะเซิร์ฟ Box ไม่ได้';
        if (status.otherModeRunning) {
            return `${status.otherModeLabel || status.runningMode || 'โหมดอื่น'} กำลังเปิดอยู่ — ปิดก่อน แล้วเปิดเซิร์ฟ Box`;
        }
        if (!status.running) return 'เซิร์ฟ Box ยังไม่เปิด — กดเปิดเซิร์ฟเวอร์ Box ก่อน';
        return '';
    }

    function mcFireTrigger(tr, user, giftQty) {
        const qty = Math.max(1, parseInt(giftQty, 10) || 1);
        mcFetchBoxStatus(false).then((st) => {
            const gate = mcBoxGateError(st);
            if (gate) {
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`⛏️ Box Control ข้ามทริกเกอร์: ${gate}`, '#e67e22');
                }
                return;
            }
            const cfg = getMcConfig();
            const resolved = (global.MapTriggerUI && typeof MapTriggerUI.resolveTriggerAction === 'function')
                ? MapTriggerUI.resolveTriggerAction(tr, MC_ACTION_GROUPS)
                : tr;
            const baseCount = Math.max(1, parseInt(resolved.count, 10) || 1);
            const baseAmount = Math.max(1, parseInt(resolved.amount, 10) || 1);
            const cmd = mcBuildCommand(resolved.action || 'mc_summon_tnt', {
                block: resolved.block,
                trap: resolved.trap,
                length: resolved.length,
                count: baseCount * qty,
                level: resolved.level,
                seconds: resolved.seconds,
                amount: baseAmount * qty,
                placement: resolved.placement || cfg.placement,
                user
            });
            mcSendCommand(cmd, { fireAndForget: true });
            if (typeof logToGameCenter === 'function') {
                const typeMeta = MC_TRIGGER_TYPES.find(t => t.value === (tr.type || 'gift'));
                const label = (MC_ACTION_GROUPS.find(a => a.value === resolved.action) || {}).label || resolved.action;
                const qtyNote = qty > 1 ? ` ×${qty}` : '';
                logToGameCenter(`⛏️ Box Control: @${user} [${typeMeta?.label || tr.type}] → ${label}${qtyNote}`, '#bc13fe');
            } else if (typeof logToDashboard === 'function') {
                const typeMeta = MC_TRIGGER_TYPES.find(t => t.value === (tr.type || 'gift'));
                const label = (MC_ACTION_GROUPS.find(a => a.value === resolved.action) || {}).label || resolved.action;
                const qtyNote = qty > 1 ? ` ×${qty}` : '';
                logToDashboard(`⛏️ Box Control: @${user} [${typeMeta?.label || tr.type}] → ${label}${qtyNote}`, '#bc13fe');
            }
        });
    }

    function handleMcGift(gift) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('minecraft').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (!mcIsLive()) return false;
        // กันคอมโบกลางทาง
        if (Number(gift?.giftType) === 1 && gift?.repeatEnd === false) return false;
        const cfg = getMcConfig();
        if (!cfg.enabled) return false;
        const user = gift.uniqueId || gift.nickname || 'viewer';
        let fired = false;
        let giftTriggerMatched = false;

        const coins = Math.max(0, parseInt(gift.diamondCount || gift.diamond_count || gift.coins || 0, 10) || 0);
        const giftQty = Math.max(1, parseInt(gift.repeatCount || gift.giftCount || 1, 10) || 1);

        for (const raw of (cfg.triggers || [])) {
            const tr = normalizeMcTrigger(raw);
            if (!tr || tr.enabled === false) continue;

            if (tr.type === 'coins') {
                if (coins < tr.minCoins || coins > tr.maxCoins) continue;
                mcFireTrigger(tr, user, 1);
                fired = true;
                continue;
            }

            if (tr.type === 'random') {
                if (coins < tr.minCoins || coins > tr.maxCoins) continue;
                const chance = Math.max(1, Math.min(100, parseInt(tr.chance, 10) || 50));
                if ((Math.random() * 100) >= chance) continue;
                mcFireTrigger(tr, user, 1);
                fired = true;
                giftTriggerMatched = true;
                continue;
            }

            if (tr.type !== 'gift') continue;
            const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
            const matchName = tr.giftName && (gift.giftName || '').toLowerCase().trim() === tr.giftName.toLowerCase().trim();
            if (!matchId && !matchName) continue;

            giftTriggerMatched = true;
            if (tr.giftThreshold > 1) {
                const key = `gift:${tr.id}:${user}`;
                mcTriggerCounters[key] = (mcTriggerCounters[key] || 0) + giftQty;
                const times = Math.floor(mcTriggerCounters[key] / tr.giftThreshold);
                if (times <= 0) continue;
                mcTriggerCounters[key] %= tr.giftThreshold;
                for (let i = 0; i < times; i++) mcFireTrigger(tr, user, 1);
            } else {
                // คอมโบ X5/X10/… = ยิงครั้งเดียว คูณจำนวนตาม repeatCount
                mcFireTrigger(tr, user, giftQty);
            }
            fired = true;
        }

        // built-in ใช้เฉพาะเมื่อไม่มีทริกเกอร์ของขวัญที่จับคู่ — กันยิงซ้ำ 2 รอบ
        if (!giftTriggerMatched) {
            const builtIn = mcResolveBedrockGiftAction(gift);
            if (builtIn) {
                const cmd = mcBuildCommand(builtIn.action, {
                    ...builtIn,
                    user,
                    count: (builtIn.count || 1) * giftQty,
                    amount: (builtIn.amount || 1) * giftQty
                });
                mcSendCommand(cmd, { fireAndForget: true });
                if (typeof logToDashboard === 'function') {
                    logToDashboard(`⛏️ Box Control: @${user} → ${builtIn.label}${giftQty > 1 ? ` ×${giftQty}` : ''}`, '#bc13fe');
                }
                fired = true;
            }
        }
        return fired;
    }

    function handleMcLike(data) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('minecraft').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (!mcIsLive()) return false;
        const cfg = getMcConfig();
        if (!cfg.enabled) return false;
        // แท่นกระจกถูกลบแล้ว — คงไว้แค่ทริกเกอร์ like ที่ผู้ใช้ตั้งเอง
        let triggered = false;
        if (handleMcLiveEvent('like', data)) triggered = true;
        if (handleMcLiveEvent('globallikes', data)) triggered = true;
        return triggered;
    }

    function handleMcLiveEvent(eventType, data) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('minecraft').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (!mcIsLive()) return false;
        const cfg = getMcConfig();
        if (!cfg.enabled) return false;
        const user = data?.uniqueId || data?.nickname || 'viewer';
        let fired = false;

        for (const raw of (cfg.triggers || [])) {
            const tr = normalizeMcTrigger(raw);
            if (!tr || tr.enabled === false) continue;
            if (tr.type === 'random' && eventType !== 'like' && eventType !== 'globallikes') {
                const chance = Math.max(1, Math.min(100, parseInt(tr.chance, 10) || 50));
                if ((Math.random() * 100) >= chance) continue;
                mcFireTrigger(tr, user);
                fired = true;
                continue;
            }
            if (tr.type !== eventType) continue;

            if (eventType === 'like' || eventType === 'globallikes') {
                const inc = Math.max(1, parseInt(data?.likeCount || data?.count || 1, 10) || 1);
                const counterKey = `${tr.id}:${eventType === 'like' ? user : 'global'}`;
                mcTriggerCounters[counterKey] = (mcTriggerCounters[counterKey] || 0) + inc;
                const times = Math.floor(mcTriggerCounters[counterKey] / tr.threshold);
                if (times <= 0) continue;
                mcTriggerCounters[counterKey] %= tr.threshold;
                for (let i = 0; i < times; i++) {
                    mcFireTrigger(tr, user);
                    fired = true;
                }
                continue;
            }

            mcFireTrigger(tr, user);
            fired = true;
        }
        return fired;
    }

    let mcTrigDraft = {
        type: 'gift',
        giftName: '',
        giftId: '',
        giftIcon: '',
        action: 'mc_summon_tnt',
        randomActions: [],
        threshold: 100,
        giftThreshold: 1,
        minCoins: 1,
        maxCoins: 999999,
        seconds: 10
    };

    function formatMcTriggerLabel(tr) {
        const t = normalizeMcTrigger(tr);
        if (!t) return '?';
        const meta = MC_TRIGGER_TYPES.find(x => x.value === t.type) || { icon: '⚡', label: t.type };
        const actionLabel = t.action === '__random__'
            ? '🎲 สุ่มแอคชัน'
            : ((MC_ACTION_GROUPS.find(a => a.value === t.action) || {}).label || t.action);
        const winAmt = (t.action === 'mc_plus_win' || t.action === 'mc_minus_win') && t.amount > 1
            ? ` ×${t.amount}`
            : '';
        let src = meta.label;
        if (t.type === 'gift') {
            src = `${meta.icon} ${t.giftName || 'ของขวัญ'}${t.giftThreshold > 1 ? ` ×${t.giftThreshold}` : ''}`;
        } else if (t.type === 'coins') {
            src = `${meta.icon} ${t.minCoins}–${t.maxCoins} 🪙`;
        } else if (t.type === 'random') {
            const n = (global.MapTriggerUI && MapTriggerUI.randomPoolFor)
                ? MapTriggerUI.randomPoolFor(t, MC_ACTION_GROUPS).length
                : (Array.isArray(t.randomActions) && t.randomActions.length ? t.randomActions.length : MC_ACTION_GROUPS.length);
            src = `${meta.icon} สุ่ม ${t.chance || 50}% · ${t.minCoins || 1}+ 🪙 · ${n} แอคชัน`;
        } else if (t.type === 'like' || t.type === 'globallikes') {
            src = `${meta.icon} ทุก ${t.threshold} ไลค์`;
        } else {
            src = `${meta.icon} ${meta.label}`;
        }
        return `${src} → ${actionLabel}${winAmt}`;
    }

    function openMcTriggerModal() {
        mcTrigDraft = {
            type: 'gift',
            giftName: '',
            giftId: '',
            giftIcon: '',
            action: 'mc_summon_tnt',
            threshold: 100,
            giftThreshold: 1,
            minCoins: 1,
            maxCoins: 999999,
            seconds: 10,
            amount: 1,
            randomActions: []
        };
        const modal = document.getElementById('gcMcTriggerModal');
        if (modal) {
            modal.style.display = 'flex';
            selectMcTriggerType('gift');
            renderMcTrigActionGrid();
            updateMcTrigGiftChip();
            const amtEl = document.getElementById('mcTrigWinAmount');
            if (amtEl) amtEl.value = '1';
            const chanceEl = document.getElementById('mcTrigChance');
            if (chanceEl) chanceEl.value = '50';
        }
    }

    function closeMcTriggerModal() {
        const modal = document.getElementById('gcMcTriggerModal');
        if (modal) modal.style.display = 'none';
    }

    function selectMcTriggerType(type) {
        mcTrigDraft.type = type || 'gift';
        document.querySelectorAll('#mcTrigTypeGrid .trigger-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mc-type') === mcTrigDraft.type);
        });
        const isGift = mcTrigDraft.type === 'gift';
        const isCoins = mcTrigDraft.type === 'coins';
        const isRandom = mcTrigDraft.type === 'random';
        const isLike = mcTrigDraft.type === 'like' || mcTrigDraft.type === 'globallikes';
        const giftSec = document.getElementById('mcTrigGiftSection');
        const giftRow = document.getElementById('mcTrigGiftThresholdRow');
        const likeRow = document.getElementById('mcTrigLikeRow');
        const coinsRow = document.getElementById('mcTrigCoinsRow');
        const randomRow = document.getElementById('mcTrigRandomRow');
        const title = document.getElementById('mcTrigConfigTitle');
        if (giftSec) giftSec.style.display = isGift ? '' : 'none';
        if (giftRow) giftRow.style.display = isGift ? 'flex' : 'none';
        if (likeRow) likeRow.style.display = isLike ? 'flex' : 'none';
        if (coinsRow) coinsRow.style.display = (isCoins || isRandom) ? '' : 'none';
        if (randomRow) randomRow.style.display = isRandom ? 'flex' : 'none';
        if (isRandom) {
            mcTrigDraft.action = '__random__';
            if (!Array.isArray(mcTrigDraft.randomActions) || !mcTrigDraft.randomActions.length) {
                mcTrigDraft.randomActions = mcVisibleActionValues();
            }
        } else if (mcTrigDraft.action === '__random__') {
            mcTrigDraft.action = 'mc_summon_tnt';
        }
        syncMcPoolUi();
        renderMcTrigActionGrid();
        if (title) {
            const meta = MC_TRIGGER_TYPES.find(t => t.value === mcTrigDraft.type);
            title.textContent = `กำหนดเงื่อนไข: ${meta?.label || mcTrigDraft.type}`;
        }
        const likeLabel = document.getElementById('mcTrigLikeLabel');
        if (likeLabel) {
            likeLabel.textContent = mcTrigDraft.type === 'globallikes'
                ? 'ไลค์รวมทั้งห้องถึงค่านี้'
                : 'ไลค์จากผู้ชมคนเดียวสะสม';
        }
        updateMcTrigSecondsRow();
    }

    function updateMcTrigSecondsRow() {
        const group = mcActionGroup(mcTrigDraft.action);
        const show = group === 'time';
        const row = document.getElementById('mcTrigSecondsRow');
        if (row) row.style.display = show ? 'flex' : 'none';
        updateMcTrigWinAmountRow();
    }

    function updateMcTrigWinAmountRow() {
        const isWin = mcTrigDraft.action === 'mc_plus_win' || mcTrigDraft.action === 'mc_minus_win';
        const row = document.getElementById('mcTrigWinAmountRow');
        if (row) row.style.display = isWin ? 'flex' : 'none';
    }

    function mcVisibleActionValues() {
        const base = (global.MapTriggerUI && MapTriggerUI.visibleActions)
            ? MapTriggerUI.visibleActions(MC_ACTION_GROUPS)
            : MC_ACTION_GROUPS.filter((a) => !a.adminOnly || mcIsAppAdmin());
        return base.map((a) => a.value).filter((v) => v && v !== '__random__');
    }

    function syncMcPoolUi() {
        const isRandom = mcTrigDraft.type === 'random';
        const hint = document.getElementById('mcTrigPoolHint');
        const bar = document.getElementById('mcTrigPoolBar');
        const label = document.getElementById('mcTrigActionLabel');
        if (hint) hint.style.display = isRandom ? '' : 'none';
        if (bar) bar.style.display = isRandom ? 'flex' : 'none';
        if (label) label.textContent = isRandom ? 'สุ่มจากแอคชันที่เลือก' : 'แอ็กชันในเกม';
    }

    function mcSelectAllPool() {
        if (mcTrigDraft.type !== 'random') return;
        mcTrigDraft.randomActions = mcVisibleActionValues();
        mcTrigDraft.action = '__random__';
        renderMcTrigActionGrid();
    }

    function mcClearPoolKeepOne() {
        if (mcTrigDraft.type !== 'random') return;
        const all = mcVisibleActionValues();
        mcTrigDraft.randomActions = all.length ? [all[0]] : [];
        mcTrigDraft.action = '__random__';
        renderMcTrigActionGrid();
    }

    function renderMcTrigActionGrid() {
        const grid = document.getElementById('mcTrigActionGrid');
        if (!grid) return;
        const base = (global.MapTriggerUI && MapTriggerUI.visibleActions)
            ? MapTriggerUI.visibleActions(MC_ACTION_GROUPS)
            : MC_ACTION_GROUPS.filter((a) => !a.adminOnly || mcIsAppAdmin());
        const isRandom = mcTrigDraft.type === 'random';
        const list = isRandom
            ? base.filter((a) => a.value !== '__random__')
            : [{ value: '__random__', label: '🎲 สุ่มแอคชัน' }, ...base.filter((a) => a.value !== '__random__')];
        const pool = new Set(isRandom
            ? ((global.MapTriggerUI && MapTriggerUI.randomPoolFor)
                ? MapTriggerUI.randomPoolFor(mcTrigDraft, MC_ACTION_GROUPS)
                : (mcTrigDraft.randomActions || []))
            : []);
        grid.innerHTML = list.map((a) => {
            const on = isRandom ? pool.has(a.value) : mcTrigDraft.action === a.value;
            return `<button type="button" class="mc-pill${on ? ' is-active' : ''}"
                data-mc-action="${a.value}">${a.label}</button>`;
        }).join('');
        syncMcPoolUi();
        if (!grid._mcActionBound) {
            grid._mcActionBound = true;
            grid.addEventListener('click', (ev) => {
                const btn = ev.target.closest('[data-mc-action]');
                if (!btn) return;
                const value = btn.getAttribute('data-mc-action');
                if (mcTrigDraft.type === 'random' && global.MapTriggerUI && MapTriggerUI.toggleRandomPool) {
                    MapTriggerUI.toggleRandomPool(mcTrigDraft, value, MC_ACTION_GROUPS);
                } else {
                    mcTrigDraft.action = value;
                }
                renderMcTrigActionGrid();
                updateMcTrigSecondsRow();
                updateMcTrigWinAmountRow();
            });
        }
    }

    async function renderMcTriggers() {
        const list = document.getElementById('mcTriggerList');
        if (!list) return;
        mcBindTriggerListClicks(list);
        const cfg = getMcConfig();
        const triggers = (cfg.triggers || []).map(normalizeMcTrigger).filter(Boolean);
        if (!triggers.length) {
            list.innerHTML = '<p class="mc-hint">ยังไม่มีทริกเกอร์ — กด «+ เพิ่มทริกเกอร์» เพื่อตั้งแบบ R.E.P.O.</p>';
            return;
        }

        const UI = global.MapTriggerUI;
        const actions = UI && UI.visibleActions ? UI.visibleActions(MC_ACTION_GROUPS) : MC_ACTION_GROUPS;
        list.innerHTML = triggers.map((tr) => {
            if (UI && UI.renderTriggerRowHtml) {
                return UI.renderTriggerRowHtml(tr, actions, {
                    prefix: 'mc',
                    giftCmd: 'gift',
                    actionCmd: 'action',
                    testCmd: 'test',
                    removeCmd: 'remove'
                });
            }
            return `<div class="rp-trigger-chip mc-trigger-chip" data-id="${tr.id}">
                <span class="rp-trigger-chip-label">${formatMcTriggerLabel(tr).replace(/</g, '&lt;')}</span>
                <div class="mc-trigger-chip-actions">
                    <button type="button" class="gp-btn-primary mc-test-btn mc-admin-only" data-mc-cmd="test" data-id="${tr.id}" title="ทดสอบ">▶</button>
                    <button type="button" class="mc-remove-btn" data-mc-cmd="remove" data-id="${tr.id}" title="ลบ">✕</button>
                </div>
            </div>`;
        }).join('');
        mcApplyAdminOnlyUi();
    }

    function updateMcTrigGiftChip() {
        const chip = document.getElementById('mcTrigSelectedGiftChip');
        if (!chip) return;
        if (!mcTrigDraft.giftName) {
            chip.style.display = 'none';
            chip.innerHTML = '';
            return;
        }
        chip.style.display = 'flex';
        const icon = mcTrigDraft.giftIcon
            ? `<img src="${String(mcTrigDraft.giftIcon).replace(/"/g, '')}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`
            : '🎁';
        chip.innerHTML = `${icon}<span>${String(mcTrigDraft.giftName).replace(/</g, '&lt;')}</span>`;
    }

    function openMcTriggerGiftPicker() {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญสำหรับทริกเกอร์',
            onSelect: (gift) => {
                mcTrigDraft.giftName = gift.giftName || '';
                mcTrigDraft.giftId = String(gift.giftId || '');
                mcTrigDraft.giftIcon = gift.giftPictureUrl || gift.giftIcon || '';
                updateMcTrigGiftChip();
            }
        });
    }

    function saveMcTriggerFromModal() {
        const type = mcTrigDraft.type || 'gift';
        if (type === 'gift' && !mcTrigDraft.giftName && !mcTrigDraft.giftId) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เลือกของขวัญ', 'กรุณาเลือกของขวัญก่อนบันทึก');
            }
            return;
        }
        const threshold = parseInt(document.getElementById('mcTrigThreshold')?.value, 10) || 100;
        const giftThreshold = parseInt(document.getElementById('mcTrigGiftThreshold')?.value, 10) || 1;
        const minCoins = parseInt(document.getElementById('mcTrigMinCoins')?.value, 10) || 1;
        const maxCoins = parseInt(document.getElementById('mcTrigMaxCoins')?.value, 10) || 999999;
        const seconds = parseInt(document.getElementById('mcTrigSeconds')?.value, 10) || 10;
        const amount = Math.max(1, parseInt(document.getElementById('mcTrigWinAmount')?.value, 10) || 1);
        const chance = Math.max(1, Math.min(100, parseInt(document.getElementById('mcTrigChance')?.value, 10) || 50));
        let action = type === 'random' ? (mcTrigDraft.action || '__random__') : (mcTrigDraft.action || 'mc_summon_tnt');
        let randomActions;
        if (type === 'random') {
            const pool = (global.MapTriggerUI && MapTriggerUI.randomPoolFor)
                ? MapTriggerUI.randomPoolFor(mcTrigDraft, MC_ACTION_GROUPS)
                : (mcTrigDraft.randomActions || []);
            if (!pool.length) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'สุ่มแอคชัน', 'เลือกอย่างน้อย 1 แอคชันที่จะสุ่มออก');
                }
                return;
            }
            action = '__random__';
            randomActions = pool;
        }

        const cfg = getMcConfig();
        if (!cfg.triggers) cfg.triggers = [];
        cfg.triggers.push({
            id: Date.now(),
            enabled: true,
            type,
            giftName: mcTrigDraft.giftName || '',
            giftId: mcTrigDraft.giftId || '',
            giftIcon: mcTrigDraft.giftIcon || '',
            action,
            randomActions,
            threshold,
            giftThreshold,
            minCoins,
            maxCoins,
            chance,
            seconds,
            amount,
            placement: cfg.placement || 'random_near'
        });
        saveMcConfig(cfg);
        renderMcTriggers();
        closeMcTriggerModal();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'เพิ่มทริกเกอร์แล้ว', formatMcTriggerLabel(cfg.triggers[cfg.triggers.length - 1]));
        }
    }

    async function mcToggleAdminDecor() {
        const res = await mcSendCommand(mcBuildCommand('mc_admin_mode', { toggle: true, user: 'admin' }), {
            fireAndForget: false,
            awaitResponse: true
        });
        if (typeof showCustomMsg === 'function') {
            if (res.ok) showCustomMsg('success', 'โหมดแอดมิน', 'สลับโหมดตกแต่งแล้ว — แต่งรอบนอกกำแพง แล้วกดบันทึกแมพ');
            else showCustomMsg('error', 'แอดมินไม่ได้', res.error || 'ต้องเป็น OP ในเกม');
        }
    }

    async function mcSaveDecorMap() {
        const res = await mcSendCommand(JSON.stringify({ cmd: 'mc_save_decor', user: 'admin' }), {
            fireAndForget: false,
            awaitResponse: true
        });
        if (typeof showCustomMsg === 'function') {
            if (res.ok) showCustomMsg('success', 'บันทึกแมพแล้ว', 'ตกแต่งรอบนอกจะไม่หายหลังชนะ/ขยาย/รีเซ็ต');
            else showCustomMsg('error', 'บันทึกไม่ได้', res.error || 'เปิดเซิร์ฟเวอร์ก่อน');
        }
    }

    async function mcLoadDecorMap() {
        const res = await mcSendCommand(JSON.stringify({ cmd: 'mc_load_decor', user: 'admin' }), {
            fireAndForget: false,
            awaitResponse: true
        });
        if (typeof showCustomMsg === 'function') {
            if (res.ok) showCustomMsg('success', 'โหลดแมพแล้ว', 'คืนบล็อกตกแต่งจากไฟล์บันทึก');
            else showCustomMsg('error', 'โหลดไม่ได้', res.error || 'ยังไม่มีไฟล์ decorations.yml');
        }
    }

    function mcAddTrigger() {
        openMcTriggerModal();
    }

    function mcRemoveTrigger(id) {
        const cfg = getMcConfig();
        cfg.triggers = (cfg.triggers || []).filter(t => String(t.id) !== String(id));
        saveMcConfig(cfg);
        renderMcTriggers();
    }

    function mcUpdateTrigger(id, key, val) {
        const cfg = getMcConfig();
        const tr = (cfg.triggers || []).find(t => String(t.id) === String(id));
        if (tr) { tr[key] = val; saveMcConfig(cfg); }
    }

    function mcBindTriggerListClicks(list) {
        if (!list || list._mcBound) return;
        list._mcBound = true;
        list.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-mc-cmd]');
            if (!btn || !list.contains(btn)) return;
            ev.preventDefault();
            ev.stopPropagation();
            const id = btn.getAttribute('data-id');
            const cmd = btn.getAttribute('data-mc-cmd');
            if (cmd === 'type') {
                mcUpdateTrigger(id, 'type', btn.getAttribute('data-value') || 'gift');
                renderMcTriggers();
            } else if (cmd === 'action') {
                const cfg = getMcConfig();
                const tr = (cfg.triggers || []).find((t) => String(t.id) === String(id));
                const value = btn.getAttribute('data-value');
                if (tr && global.MapTriggerUI && typeof MapTriggerUI.applyActionPick === 'function') {
                    MapTriggerUI.applyActionPick(tr, value, MC_ACTION_GROUPS);
                    saveMcConfig(cfg);
                } else {
                    mcUpdateTrigger(id, 'action', value);
                }
                renderMcTriggers();
            } else if (cmd === 'seconds') {
                mcUpdateTrigger(id, 'seconds', parseInt(btn.getAttribute('data-value'), 10) || 10);
                renderMcTriggers();
            } else if (cmd === 'test') {
                mcTestTrigger(id);
            } else if (cmd === 'remove') {
                mcRemoveTrigger(id);
            } else if (cmd === 'gift') {
                mcOpenGiftPickerForTrigger(id);
            }
        });
        list.addEventListener('change', (ev) => {
            const el = ev.target.closest('[data-mc-field]');
            if (!el || !list.contains(el)) return;
            const id = el.getAttribute('data-id');
            const field = el.getAttribute('data-mc-field');
            let val = el.value;
            if (['threshold', 'giftThreshold', 'minCoins', 'maxCoins', 'seconds'].includes(field)) {
                val = parseInt(val, 10) || 1;
            }
            mcUpdateTrigger(id, field, val);
        });
    }

    function mcOpenGiftPickerForTrigger(id) {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญสำหรับทริกเกอร์',
            onSelect: (gift) => {
                mcUpdateTrigger(id, 'giftName', gift.giftName);
                mcUpdateTrigger(id, 'giftId', String(gift.giftId));
                mcUpdateTrigger(id, 'giftIcon', gift.giftPictureUrl || gift.giftIcon || '');
                renderMcTriggers();
            }
        });
    }

    async function mcTestCatalogAction(item) {
        const st = await mcFetchBoxStatus(true);
        const gate = mcBoxGateError(st);
        if (gate) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', item.label || 'ทดสอบ', gate);
            return;
        }
        let cmdName = item.cmd;
        // บล็อกทริกเกอร์เก่า → แอคชั่น Box
        if (cmdName === 'place_block') cmdName = 'mc_give_blocks';
        if (cmdName === 'zone_expand') cmdName = 'mc_expand_map';
        if (cmdName === 'zone_shrink') cmdName = 'mc_shrink_map';
        const cmd = mcBuildCommand(cmdName, {
            block: item.block,
            trap: item.trap,
            length: item.length,
            count: item.count,
            level: item.level != null ? item.level : (cmdName === 'mc_build_bedrock_map' ? 4 : undefined),
            seconds: item.seconds,
            amount: item.amount,
            user: 'ทดสอบ',
            placement: getMcConfig().placement
        });
        const res = await mcSendCommand(cmd, { fireAndForget: false, awaitResponse: true });
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(res.ok ? 'success' : 'error', item.label, res.ok ? 'ส่งคำสั่งแล้ว' : (res.error || 'bridge ไม่ตอบ'));
        }
    }

    async function mcTestBlock(blockId) {
        const cat = await loadMcCatalog();
        const block = (cat.blocks || []).find(b => b.id === blockId);
        if (!block) return;
        const st = await mcFetchBoxStatus(true);
        const gate = mcBoxGateError(st);
        if (gate) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', block.label, gate);
            return;
        }
        // Box Control: แจกบล็อกให้ต่อในแมพ — ไม่วางบล็อกมั่วนอกโซน
        const res = await mcSendCommand(mcBuildCommand('mc_give_blocks', {
            block: block.block,
            user: 'ทดสอบ',
            count: 16
        }), { fireAndForget: false, awaitResponse: true });
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(res.ok ? 'success' : 'error', block.label, res.ok ? 'แจกบล็อกแล้ว' : (res.error || 'bridge ไม่ตอบ'));
        }
    }

    async function mcTestTrap(trapId) {
        const cat = await loadMcCatalog();
        const trap = (cat.traps || []).find(t => t.id === trapId);
        if (!trap) return;
        let cmd;
        if (trap.cmd === 'fill_line') {
            cmd = mcBuildCommand('fill_line', { block: trap.block, length: trap.length, user: 'ทดสอบ' });
        } else if (trap.cmd === 'block_rain') {
            cmd = mcBuildCommand('block_rain', { block: trap.block, count: trap.count, user: 'ทดสอบ' });
        } else {
            cmd = mcBuildCommand('place_trap', { trap: trap.trap, user: 'ทดสอบ' });
        }
        const res = await mcSendCommand(cmd, { fireAndForget: false });
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(res.ok ? 'success' : 'error', trap.label, res.ok ? 'ส่งคำสั่งแล้ว' : (res.error || 'bridge ไม่ตอบ'));
        }
    }

    async function renderMcQuickBlocks() {
        const grid = document.getElementById('mcQuickBlocks');
        if (!grid) return;
        const cat = await loadMcCatalog();
        grid.innerHTML = (cat.blocks || []).map(b => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${b.type || 'neutral'}" onclick="mcTestBlock('${b.id}')" title="${b.label}">
                <span>${b.emoji}</span><small>${b.label}</small>
            </button>
        `).join('');
    }

    async function renderMcQuickTraps() {
        const grid = document.getElementById('mcQuickTraps');
        if (!grid) return;
        const cat = await loadMcCatalog();
        grid.innerHTML = (cat.traps || []).map(t => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${t.type || 'troll'}" onclick="mcTestTrap('${t.id}')" title="${t.label}">
                <span>${t.emoji}</span><small>${t.label}</small>
            </button>
        `).join('');
    }

    async function mcTestZoneAction(actionId) {
        const cat = await loadMcCatalog();
        const item = (cat.zone_actions || []).find(a => a.id === actionId);
        if (item) await mcTestCatalogAction(item);
    }

    async function mcTestTimeAction(actionId) {
        const cat = await loadMcCatalog();
        const item = (cat.time_actions || []).find(a => a.id === actionId);
        if (item) await mcTestCatalogAction(item);
    }

    async function renderMcQuickZone() {
        const grid = document.getElementById('mcQuickZone');
        if (!grid) return;
        const cat = await loadMcCatalog();
        grid.innerHTML = (cat.zone_actions || []).map(a => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${a.type || 'zone'}" onclick="mcTestZoneAction('${a.id}')" title="${a.label}">
                <span>${a.emoji}</span><small>${a.label}</small>
            </button>
        `).join('');
    }

    async function renderMcQuickTime() {
        const grid = document.getElementById('mcQuickTime');
        if (!grid) return;
        const cat = await loadMcCatalog();
        grid.innerHTML = (cat.time_actions || []).map(a => `
            <button type="button" class="mc-quick-btn mc-quick-btn--${a.type || 'time'}" onclick="mcTestTimeAction('${a.id}')" title="${a.label}">
                <span>${a.emoji}</span><small>${a.label}</small>
            </button>
        `).join('');
    }

    const MC_ACTION_GROUPS = [
        { value: 'mc_summon_tnt', label: '💣 Rose: TNT บนหัว', group: 'zone' },
        { value: 'mc_summon_tnt_strong', label: '💥 TNT แรงพิเศษ', group: 'zone' },
        { value: 'mc_give_blocks', label: '📦 แจกบล็อกให้ต่อ', group: 'zone' },
        { value: 'mc_shrink_map', label: '🔻 Mini Heart: บีบแมพ', group: 'zone' },
        { value: 'mc_expand_map', label: '🔺 Donut: ขยายแมพ', group: 'zone' },
        { value: 'mc_lava_melt', label: '🌋 ลาวาหลอมแมพ', group: 'zone' },
        { value: 'mc_villager_help', label: '🧑‍🌾 ช่วยต่อเต็มทันที', group: 'zone' },
        { value: 'mc_help_one_layer', label: '🧱 ช่วยต่อ 1 ชั้น', group: 'zone' },
        { value: 'mc_help_ten_rows', label: '📏 ช่วยต่อ 1 แถว', group: 'zone' },
        { value: 'mc_minus_win', label: '🐉 ลบวิน', group: 'zone' },
        { value: 'mc_plus_win', label: '🦾 บวกวิน', group: 'zone' },
        { value: 'mc_admin_mode', label: '🛠️ โหมดแอดมินตกแต่ง', group: 'zone', adminOnly: true },
        { value: 'stun_add', label: '🧊 ห้องขัง', group: 'time' },
        { value: 'stun_reduce', label: '➖ ลดเวลาห้องขัง', group: 'time' }
    ];

    function mcActionGroup(action) {
        const found = MC_ACTION_GROUPS.find(a => a.value === action);
        return found ? found.group : 'block';
    }

    function mcRenderTriggerTargetSelect(tr, cat) {
        const group = mcActionGroup(tr.action);
        if (group === 'block') {
            return (cat.blocks || []).map(b =>
                `<option value="${b.block}"${b.block === (tr.block || 'minecraft:obsidian') ? ' selected' : ''}>${b.emoji} ${b.label}</option>`
            ).join('');
        }
        if (group === 'trap') {
            return (cat.traps || []).map(t => {
                const val = t.trap || t.id;
                const sel = (tr.trap || 'obsidian_pillar') === val || (tr.action === 'fill_line' && t.id === 'line');
                return `<option value="${val}" data-cmd="${t.cmd}"${sel ? ' selected' : ''}>${t.emoji} ${t.label}</option>`;
            }).join('');
        }
        if (group === 'zone' && tr.action === 'zone_tnt') {
            return [1, 2, 3].map(l =>
                `<option value="${l}"${(tr.level || 1) === l ? ' selected' : ''}>ระดับ ${l}</option>`
            ).join('');
        }
        if (group === 'time') {
            const sec = tr.seconds || (tr.action === 'stun_player' || tr.action === 'stun_add' || tr.action === 'stun_reduce' ? 10 : 5);
            return [5, 10, 15, 20, 30].map(s =>
                `<option value="${s}"${sec === s ? ' selected' : ''}>${s} วินาที</option>`
            ).join('');
        }
        return '<option value="">—</option>';
    }

    function switchMcTopTab(tab) {
        const settingsPanel = document.getElementById('mcSettingsPanel');
        const triggerPanel = document.getElementById('mcTriggerPanel');
        document.getElementById('mcTabSettings')?.classList.toggle('active', tab === 'settings');
        document.getElementById('mcTabTrigger')?.classList.toggle('active', tab === 'trigger');
        if (settingsPanel) settingsPanel.style.display = tab === 'settings' ? 'flex' : 'none';
        if (triggerPanel) triggerPanel.style.display = tab === 'trigger' ? 'flex' : 'none';
        if (tab === 'trigger') {
            const active = document.querySelector('#mcTriggerPanel .mc-trig-section.active');
            if (!active) {
                document.getElementById('mcSectionRules')?.classList.add('active');
                document.getElementById('mcNavRules')?.classList.add('active');
            }
            if (document.getElementById('mcSectionRules')?.classList.contains('active')) {
                renderMcTriggers();
            }
        }
    }

    function switchMcSection(section) {
        if (section === 'console') section = 'server';
        switchMcTopTab('settings');
        const map = { server: 'Server', conn: 'Conn', decor: 'Decor', actions: 'Actions' };
        Object.keys(map).forEach((key) => {
            const suffix = map[key];
            document.getElementById(`mcSection${suffix}`)?.classList.toggle('active', key === section);
            document.getElementById(`mcNav${suffix}`)?.classList.toggle('active', key === section);
        });
        if (section === 'actions') {
            renderMcQuickZone();
            renderMcQuickTime();
        }
        if (section === 'server') {
            mcStartLiveConsole();
        }
        mcApplyAdminOnlyUi();
    }

    let mcConsoleLiveTimer = null;
    let mcConsoleLastHealth = '';
    function mcStartLiveConsole() {
        if (!document.getElementById('mcConsoleOutput')) return;
        if (!mcConsoleLiveTimer) {
            mcConsoleClear();
            mcConsoleAppend('● คอนโซลพร้อม — เช็ค bridge อัตโนมัติ');
            mcConsoleRunHealthSilent(true);
            mcConsoleLiveTimer = setInterval(() => {
                const serverSec = document.getElementById('mcSectionServer');
                if (!serverSec || !serverSec.classList.contains('active')) return;
                if (document.getElementById('gcMinecraftView')?.classList.contains('active')) {
                    mcConsoleRunHealthSilent(false);
                }
            }, 8000);
        } else {
            mcConsoleRunHealthSilent(false);
        }
    }

    async function mcConsoleRunHealthSilent(forceLog) {
        try {
            const res = await mcSendCommand('health', { awaitResponse: true, fireAndForget: false, silent: true });
            const ok = !!res?.ok;
            const win = Number(res?.pendingWinDelta || res?.detail?.pendingWinDelta || 0);
            const mod = res?.mod || res?.detail?.mod || '';
            const line = `${ok ? '✓' : '✗'} health ${ok ? 'ok' : (res?.error || 'fail')}${mod ? ` · ${mod}` : ''}`;
            if (forceLog || line !== mcConsoleLastHealth || win) {
                mcConsoleLastHealth = line;
                mcConsoleAppend(win ? `${line} · pendingWin ${win}` : line);
            }
            if (win) mcApplyWinCounter(win, 'ชนะแมพ');
        } catch (e) {
            mcConsoleAppend('✗ health ' + (e.message || e));
        }
    }

    function mcIsAppAdmin() {
        try {
            if (typeof isAppAdmin === 'function') return !!isAppAdmin();
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
        } catch (e) {}
        return false;
    }

    function mcApplyAdminOnlyUi() {
        const admin = mcIsAppAdmin();
        document.querySelectorAll('#gcMinecraftView .mc-admin-only').forEach((el) => {
            el.style.display = admin ? '' : 'none';
        });
        document.querySelectorAll('#gcMinecraftView .mc-test-btn, #mcTriggerList .mc-test-btn').forEach((el) => {
            el.style.display = admin ? '' : 'none';
        });
        // ปรับกริด nav เมื่อซ่อนทดสอบ + แต่งแมพ
        const nav = document.querySelector('#mcSettingsPanel .mc-section-nav');
        if (nav) {
            const hidden = nav.querySelectorAll('.mc-admin-only');
            const hiddenCount = admin ? 0 : hidden.length;
            nav.classList.toggle('mc-section-nav--no-test', !admin);
            nav.style.gridTemplateColumns = admin
                ? ''
                : `repeat(${Math.max(2, 4 - hiddenCount)}, minmax(0, 1fr))`;
        }
    }

    const MC_CONSOLE_PRESETS = {
        health: 'health',
        expand: '{"cmd":"mc_expand_map","user":"console"}',
        shrink: '{"cmd":"mc_shrink_map","user":"console"}',
        plus: '{"cmd":"mc_plus_win","user":"console"}',
        minus: '{"cmd":"mc_minus_win","user":"console"}',
        admin: '{"cmd":"mc_admin_mode","toggle":true,"user":"console"}',
        save: '{"cmd":"mc_save_decor","user":"console"}',
        rebuild: '{"cmd":"arena_rebuild","user":"console"}'
    };

    function mcConsoleFill(key) {
        const input = document.getElementById('mcConsoleInput');
        if (!input) return;
        input.value = MC_CONSOLE_PRESETS[key] || key;
    }

    function mcConsoleClear() {
        const out = document.getElementById('mcConsoleOutput');
        if (out) out.textContent = 'พร้อมรันคำสั่ง…';
    }

    function mcConsoleAppend(line) {
        const out = document.getElementById('mcConsoleOutput');
        if (!out) return;
        const ts = new Date().toLocaleTimeString();
        const prev = out.textContent === 'พร้อมรันคำสั่ง…' ? '' : out.textContent + '\n';
        out.textContent = prev + `[${ts}] ${line}`;
        out.scrollTop = out.scrollHeight;
    }

    async function mcConsoleRun() {
        const input = document.getElementById('mcConsoleInput');
        const raw = (input?.value || '').trim();
        if (!raw) {
            mcConsoleAppend('⚠ ว่างเปล่า — ใส่ JSON หรือ health');
            return;
        }
        mcConsoleAppend('→ ' + raw);
        try {
            const res = await mcSendCommand(raw, { awaitResponse: true, fireAndForget: false });
            mcConsoleAppend('← ' + JSON.stringify(res, null, 2));
        } catch (e) {
            mcConsoleAppend('✗ ' + (e.message || e));
        }
    }

    function switchMcTriggerSection(section) {
        const settingsPanel = document.getElementById('mcSettingsPanel');
        const triggerPanel = document.getElementById('mcTriggerPanel');
        document.getElementById('mcTabSettings')?.classList.toggle('active', false);
        document.getElementById('mcTabTrigger')?.classList.toggle('active', true);
        if (settingsPanel) settingsPanel.style.display = 'none';
        if (triggerPanel) triggerPanel.style.display = 'flex';
        ['rules', 'about'].forEach((key) => {
            const suffix = key.charAt(0).toUpperCase() + key.slice(1);
            document.getElementById(`mcSection${suffix}`)?.classList.toggle('active', key === section);
            document.getElementById(key === 'rules' ? 'mcNavRules' : 'mcNavAbout')
                ?.classList.toggle('active', key === section);
        });
        if (section === 'rules') renderMcTriggers();
    }

    async function mcTestTrigger(id) {
        const cfg = getMcConfig();
        const tr = (cfg.triggers || []).find(t => String(t.id) === String(id));
        if (!tr) return;
        const st = await mcFetchBoxStatus(true);
        const gate = mcBoxGateError(st);
        const labelOf = (action) => (MC_ACTION_GROUPS.find(a => a.value === action) || {}).label || action;
        if (gate) {
            mcConsoleAppend('✗ test blocked: ' + gate);
            if (typeof logToGameCenter === 'function') {
                logToGameCenter(`⛏️ Box ทดสอบไม่ได้: ${gate}`, '#e67e22');
            }
            if (typeof showCenterModal === 'function') {
                showCenterModal('warning', 'ทดสอบไม่ได้', gate);
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่ได้', gate);
            }
            return;
        }
        const norm = normalizeMcTrigger(tr);
        const label = labelOf(norm.action);
        const cmd = mcBuildCommand(norm.action || 'mc_summon_tnt', {
            ...norm,
            user: 'ทดสอบ',
            placement: norm.placement || cfg.placement || 'random_near',
            block: norm.block || 'minecraft:amethyst_block',
            count: norm.count || 1,
            seconds: norm.seconds || 10
        });
        mcConsoleAppend('→ test ' + label);
        const res = await mcSendCommand(cmd, { fireAndForget: false, awaitResponse: true });
        if (res.ok) {
            mcConsoleAppend('✓ test ok: ' + label);
            if (typeof logToGameCenter === 'function') {
                logToGameCenter(`⛏️ Box ทดสอบแล้ว: ${label}`, '#2ecc71');
            }
            if (typeof showCenterModal === 'function') {
                showCenterModal('success', 'ทดสอบแล้ว', label);
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'ทดสอบแล้ว', label);
            }
        } else {
            const err = res.error || 'เปิดเซิร์ฟเวอร์ Box / plugin ก่อน';
            mcConsoleAppend('✗ test fail: ' + err);
            if (typeof logToGameCenter === 'function') {
                logToGameCenter(`⛏️ Box ทดสอบไม่สำเร็จ: ${label} — ${err}`, '#ff4757');
            }
            if (typeof showCenterModal === 'function') {
                showCenterModal('error', 'ทดสอบไม่สำเร็จ', err);
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ทดสอบไม่สำเร็จ', err);
            }
        }
    }

    async function refreshMcServerStatus() {
        const el = document.getElementById('mcServerStatus');
        const joinEl = document.getElementById('mcJoinAddress');
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('box');
            if (joinEl && data.join) joinEl.textContent = data.join;
            if (global.McServerUI) {
                global.McServerUI.fillRequirementBanner(document.getElementById('mcReqBanner'), data);
            }
            if (!el) {
                mcUpdateServerButtons(data);
                return data;
            }
            let line = global.McServerUI
                ? global.McServerUI.formatStatusLine(data, 'box')
                : '';
            if (!line) {
                const parts = [];
                parts.push(data.installed ? '✅ ติดตั้งเซิร์ฟ Box แล้ว' : '⬜ ยังไม่ติดตั้งเซิร์ฟ Box');
                parts.push(`📁 ${data.levelName || 'tokcontrol_troll'}`);
                parts.push(data.javaOk === false ? '⚠️ ต้อง Java 21+' : (data.javaOk ? '☕ Java 21+' : ''));
                parts.push(data.running ? '🟢 กำลังรัน' : '⚫ ปิด');
                line = parts.filter(Boolean).join(' · ');
            }
            if (data.pluginInstalled === false) line += ' · ⚠️ Plugin';
            if (data.bridgePortOpen && data.running) line += ' · 🔌 Bridge 8081';
            else if (data.running) line += ' · ⏳ รอ Plugin 8081';
            el.textContent = line;
            el.classList.toggle('mc-server-status--on', !!data.running);
            mcUpdateServerButtons(data);
            return data;
        } catch (e) {
            if (el) el.textContent = 'ไม่สามารถตรวจสอบสถานะได้';
            return null;
        }
    }

    async function mcSetupServer() {
        const btn = document.getElementById('mcSetupBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังดาวน์โหลด / ติดตั้ง...'; }
        try {
            const data = await refreshMcServerStatus();
            if (data?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${data.otherModeLabel} กำลังรัน — Box Control ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                mcConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน แล้วค่อยติดตั้ง Box');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            mcConsoleAppend('▶ เริ่มดาวน์โหลด / ติดตั้งแพ็กเกจ Box…');
            const setupData = await global.McServerUI.setupServer('box', {
                onProgress: (_p, line) => mcConsoleAppend(line)
            });
            if (setupData.success) {
                mcConsoleAppend('✓ ติดตั้งแพ็กเกจ Box เสร็จ — กด «เริ่มเซิร์ฟเวอร์» ได้');
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'ติดตั้งแพ็กเกจแล้ว', 'กด «เริ่มเซิร์ฟเวอร์» เมื่อพร้อม');
                }
            } else {
                mcConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (setupData.error || 'unknown'));
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', setupData.error || 'unknown');
                }
            }
        } catch (e) {
            mcConsoleAppend('✗ ติดตั้งไม่สำเร็จ: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', e.message);
        } finally {
            await refreshMcServerStatus();
        }
    }

    async function mcStartServer() {
        const btn = document.getElementById('mcStartBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังเริ่ม...'; }
        try {
            const data = await refreshMcServerStatus();
            if (data?.otherModeRunning) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ปิดเซิร์ฟอื่นก่อน',
                        `${data.otherModeLabel} กำลังรัน — Box Control ใช้เซิร์ฟแยกโฟลเดอร์`);
                }
                mcConsoleAppend('⚠ ปิดเซิร์ฟโหมดอื่นก่อน');
                return;
            }
            if (!data?.javaOk) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อนเริ่มเซิร์ฟ');
                }
                mcConsoleAppend('⚠ ยังไม่พบ Java 21+');
                return;
            }
            if (!data?.installed) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('info', 'ยังไม่ติดตั้ง', 'กดดาวน์โหลด / ติดตั้งแพ็กเกจก่อน');
                }
                mcConsoleAppend('⚠ ยังไม่ติดตั้งแพ็กเกจ');
                return;
            }
            if (!global.McServerUI) throw new Error('McServerUI missing');
            mcConsoleAppend('▶ เริ่มเซิร์ฟเวอร์ Box…');
            const startData = await global.McServerUI.startServer('box', {
                onProgress: (_p, line) => mcConsoleAppend(line)
            });
            if (startData.success) {
                mcConsoleAppend('✓ เปิดเซิร์ฟแล้ว · ' + (startData.join || 'localhost:25565') + ' — รอ Paper บูต');
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'เริ่มเซิร์ฟเวอร์ Box', `เซิร์ฟแยก · ${startData.levelName || 'tokcontrol_troll'} · ${startData.join || 'localhost:25565'}`);
                }
                mcPollBridgeReady();
            } else {
                mcConsoleAppend('✗ เริ่มไม่ได้: ' + (startData.error || 'unknown'));
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'เริ่มไม่ได้', startData.error || 'unknown');
                }
            }
        } catch (e) {
            mcConsoleAppend('✗ เริ่มไม่ได้: ' + (e.message || e));
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เริ่มไม่ได้', e.message);
        } finally {
            await refreshMcServerStatus();
        }
    }

    async function mcLaunchServer() {
        const data = await refreshMcServerStatus();
        if (!data?.installed) return mcSetupServer();
        return mcStartServer();
    }

    async function mcResetServer() {
        if (!confirm('ลบแมพและติดตั้งเซิร์ฟเวอร์ใหม่?\n(ปิดเซิร์ฟเวอร์ + ลบ world + copy plugin ใหม่)')) return;
        const btn = document.getElementById('mcResetBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังลบ...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.resetServer('box');
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    const purged = (data.foreignWorldsPurged || []).length
                        ? ` · ลบโลกค้าง ${data.foreignWorldsPurged.join(', ')}`
                        : '';
                    showCustomMsg('success', 'โหลดใหม่แล้ว',
                        'กดเปิดเซิร์ฟเวอร์ Box แล้วสร้างแมพ' + purged);
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ลบไม่สำเร็จ', data.error || 'unknown');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ลบไม่สำเร็จ', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ ลบ & โหลดใหม่'; }
            refreshMcServerStatus();
        }
    }

    async function mcStopServer() {
        const btn = document.getElementById('mcStopBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังปิด...'; }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.stopServer();
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(data.success ? 'info' : 'error', 'ปิดเซิร์ฟเวอร์', data.stopped ? 'ปิดแล้ว — รอ 3 วิก่อนติดตั้งใหม่' : 'ปิด process ค้างแล้ว');
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ปิดไม่ได้', e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⏹ ปิดเซิร์ฟเวอร์'; }
            refreshMcServerStatus();
        }
    }

    async function mcTestArena() {
        const st = await mcFetchBoxStatus(true);
        const gate = mcBoxGateError(st);
        if (gate) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'สร้างแมพไม่ได้', gate);
            return;
        }
        const res = await mcSendCommand(mcBuildCommand('arena_rebuild', { user: 'ทดสอบ' }), { fireAndForget: false, awaitResponse: true });
        if (typeof showCustomMsg === 'function') {
            if (res.ok) {
                showCustomMsg('success', 'สร้างแมพแล้ว', 'เข้าเกมแล้วพิมพ์ /tokcontrol goto หรือวิ่งไปจุด Emerald');
            } else {
                showCustomMsg('error', 'สร้างแมพไม่ได้', res.error || 'เปิดเซิร์ฟเวอร์ Box และรอ plugin โหลดก่อน');
            }
        }
        mcTestConnection({ silent: true });
    }

    function mcCopyJoinAddress() {
        const addr = document.getElementById('mcJoinAddress')?.textContent || 'localhost:25565';
        if (global.McServerUI?.copyJoinAddress) {
            global.McServerUI.copyJoinAddress(addr);
        } else if (typeof copyTextToClipboard === 'function') {
            copyTextToClipboard(addr);
        } else {
            navigator.clipboard?.writeText(addr);
        }
        if (typeof showCustomMsg === 'function') showCustomMsg('info', 'คัดลอกแล้ว', addr);
    }

    async function mcOpenServerFolder() {
        if (global.McServerUI?.openServerFolder) {
            await global.McServerUI.openServerFolder('box');
            return;
        }
        try {
            if (!global.McServerUI) throw new Error('McServerUI missing');
            const data = await global.McServerUI.fetchStatus('box');
            if (data.path) {
                try {
                    const { shell } = window.electron || {};
                    if (shell?.openPath) await shell.openPath(data.path);
                    else if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์', data.path);
                } catch (e) {
                    if (typeof showCustomMsg === 'function') showCustomMsg('info', 'โฟลเดอร์', data.path);
                }
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เปิดโฟลเดอร์ไม่ได้', e.message || String(e));
        }
    }

    async function renderMcProfile() {
        const cfg = getMcConfig();
        const enabledCb = document.getElementById('mcGameEnabled');
        if (enabledCb) enabledCb.checked = !!cfg.enabled;
        const hostEl = document.getElementById('mcConnHost');
        if (hostEl) hostEl.value = mcNormalizeConnHost(cfg.connection?.host || MC_DEFAULT_HOST);
        const placeEl = document.getElementById('mcDefaultPlacement');
        if (placeEl) {
            const cat = await loadMcCatalog();
            placeEl.innerHTML = (cat.placements || []).map(p =>
                `<option value="${p.id}"${cfg.placement === p.id ? ' selected' : ''}>${p.label}</option>`
            ).join('');
        }
        await refreshMcServerStatus();
        await renderMcQuickZone();
        await renderMcQuickTime();
        renderMcTriggers();
        switchMcTopTab('settings');
        switchMcSection('server');
        mcApplyAdminOnlyUi();
        mcStartLiveConsole();
        if (cfg.enabled || (typeof isGameLiveActive === 'function' && isGameLiveActive('minecraft'))) {
            mcStartWinCounterPoll();
        }
    }

    global.getMcConfig = getMcConfig;
    global.saveMcConfig = saveMcConfig;
    global.mcToggleEnabled = mcToggleEnabled;
    global.mcSaveConnection = mcSaveConnection;
    global.mcSavePlacement = mcSavePlacement;
    global.mcTestConnection = mcTestConnection;
    global.handleMcGift = handleMcGift;
    global.handleMcLike = handleMcLike;
    global.handleMcLiveEvent = handleMcLiveEvent;
    global.switchMcTopTab = switchMcTopTab;
    global.switchMcSection = switchMcSection;
    global.switchMcTriggerSection = switchMcTriggerSection;
    global.mcAddTrigger = mcAddTrigger;
    global.openMcTriggerModal = openMcTriggerModal;
    global.closeMcTriggerModal = closeMcTriggerModal;
    global.selectMcTriggerType = selectMcTriggerType;
    global.mcSelectAllPool = mcSelectAllPool;
    global.mcClearPoolKeepOne = mcClearPoolKeepOne;
    global.openMcTriggerGiftPicker = openMcTriggerGiftPicker;
    global.saveMcTriggerFromModal = saveMcTriggerFromModal;
    global.mcToggleAdminDecor = mcToggleAdminDecor;
    global.mcSaveDecorMap = mcSaveDecorMap;
    global.mcLoadDecorMap = mcLoadDecorMap;
    global.mcConsoleFill = mcConsoleFill;
    global.mcConsoleRun = mcConsoleRun;
    global.mcConsoleClear = mcConsoleClear;
    global.mcApplyAdminOnlyUi = mcApplyAdminOnlyUi;
    global.mcRemoveTrigger = mcRemoveTrigger;
    global.mcUpdateTrigger = mcUpdateTrigger;
    global.mcOpenGiftPickerForTrigger = mcOpenGiftPickerForTrigger;
    global.mcTestTrigger = mcTestTrigger;
    global.mcTestBlock = mcTestBlock;
    global.mcTestTrap = mcTestTrap;
    global.mcTestCatalogAction = mcTestCatalogAction;
    global.mcTestZoneAction = mcTestZoneAction;
    global.mcTestTimeAction = mcTestTimeAction;
    global.renderMcProfile = renderMcProfile;
    global.mcSendCommand = mcSendCommand;
    global.mcApplyWinCounter = mcApplyWinCounter;
    global.mcBuildCommand = mcBuildCommand;
    global.mcSetupServer = mcSetupServer;
    global.mcStartServer = mcStartServer;
    global.mcLaunchServer = mcLaunchServer;
    global.mcStopServer = mcStopServer;
    global.mcResetServer = mcResetServer;
    global.mcTestArena = mcTestArena;
    global.mcCopyJoinAddress = mcCopyJoinAddress;
    global.mcOpenServerFolder = mcOpenServerFolder;
    global.refreshMcServerStatus = refreshMcServerStatus;
    global.mcInstallJavaThenRefresh = mcInstallJavaThenRefresh;
    global.mcRecheckJavaThenRefresh = mcRecheckJavaThenRefresh;
    global.mcStartWinCounterPoll = mcStartWinCounterPoll;
    global.mcStopWinCounterPoll = mcStopWinCounterPoll;

    global.addEventListener('mc-server-changed', (ev) => {
        if (ev?.detail?.world === 'box') refreshMcServerStatus();
    });

})(typeof window !== 'undefined' ? window : global);
