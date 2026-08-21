/**
 * Memory Match — Panel-side integration (Game Center, gifts, sync)
 */
(function (global) {
    'use strict';

    const MM_STORAGE_KEY = 'tokcontrol_memory_match';
    const MM_ACTIONS = {
        help_reveal:   { icon: '💚', label: 'ช่วยเปิดคู่', type: 'help' },
        help_reduce:   { icon: '💚', label: 'ช่วยลดเวลา (-2วิ)', type: 'help' },
        help_hint:     { icon: '💡', label: 'ให้คำใบ้', type: 'help' },
        troll_shuffle: { icon: '😈', label: 'สับไพ่', type: 'troll' },
        troll_flipback:{ icon: '😈', label: 'ปิดไพ่กลับ', type: 'troll' },
        troll_addpairs:{ icon: '😈', label: 'เพิ่มคู่ (+1)', type: 'troll' },
        troll_addtime: { icon: '😈', label: 'เพิ่มเวลา (+3วิ)', type: 'troll' }
    };

    function getMmConfig() {
        try {
            const raw = localStorage.getItem(MM_STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return getMmDefaultConfig();
    }

    function getMmDefaultConfig() {
        return {
            installed: false,
            enabled: false,
            mode: 'normal',
            autoWin: true,
            triggers: [
                { id: 1, enabled: true, giftName: 'Rose', giftId: '', action: 'help_reveal', amount: 1 },
                { id: 2, enabled: true, giftName: 'TikTok', giftId: '', action: 'troll_shuffle', amount: 1 }
            ]
        };
    }

    function saveMmConfig(cfg) {
        localStorage.setItem(MM_STORAGE_KEY, JSON.stringify(cfg));
    }

    function isMmInstalled() {
        return !!getMmConfig().installed;
    }

    async function mmInstallGame() {
        const btn = document.getElementById('mmInstallBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังติดตั้ง...'; }
        try {
            const token = localStorage.getItem('pandy_token') || '';
            const res = await fetch('/api/games/memory-match/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'ติดตั้งไม่สำเร็จ');
            const cfg = getMmConfig();
            cfg.installed = true;
            saveMmConfig(cfg);
            renderMmProfileUI();
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'ติดตั้งสำเร็จ', 'เกมจับคู่พร้อมเล่นแล้ว!');
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', e.message);
        } finally {
            if (btn) { btn.disabled = false; }
        }
    }

    function mmOpenGame() {
        const mode = getMmConfig().mode || 'normal';
        localStorage.setItem('mm_game_mode', mode);
        syncMmToGame({ mode, reset: true });
        try {
            const { ipcRenderer } = (window.electron || {});
            ipcRenderer.send('open-memory-match-game');
            return;
        } catch (e) {}
        window.open('/games/memory-match/index.html', '_blank', 'width=900,height=700');
    }

    function mmCopyOverlayLink() {
        if (typeof copyOverlayRouteLink === 'function') {
            copyOverlayRouteLink('memory-match', {}, 'Memory Match Overlay');
        }
    }

    function mmSetMode(mode) {
        const cfg = getMmConfig();
        cfg.mode = mode;
        saveMmConfig(cfg);
        localStorage.setItem('mm_game_mode', mode);
        syncMmToGame({ mode });
        renderMmProfile();
    }

    function mmToggleEnabled(checked) {
        const cfg = getMmConfig();
        cfg.enabled = !!checked;
        saveMmConfig(cfg);
        if (checked) {
            const store = typeof getGameModStore === 'function' ? getGameModStore() : {};
            if (store.repo && store.repo.enabled) {
                store.repo.enabled = false;
                if (typeof saveGameModStore === 'function') saveGameModStore(store);
            }
            if (typeof setActiveGameModId === 'function') setActiveGameModId('memory-match');
        }
    }

    function syncMmToGame(payload) {
        const token = (global.currentUser && global.currentUser.streamToken) || '';
        if (typeof socket !== 'undefined' && socket && socket.connected && token) {
            socket.emit('memory_match_sync', { token, ...payload });
        }
    }

    function handleMmGift(gift) {
        if (typeof isAppPro === 'function' && !isAppPro()) return false;
        const cfg = getMmConfig();
        if (!cfg.enabled || !cfg.installed) return false;
        if (!cfg.triggers || !cfg.triggers.length) return false;

        for (const tr of cfg.triggers) {
            if (tr.enabled === false) continue;
            const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
            const matchName = tr.giftName && (gift.giftName || '').toLowerCase().trim() === tr.giftName.toLowerCase().trim();
            if (!matchId && !matchName) continue;

            const action = tr.action || 'help_reveal';
            const amount = tr.amount || (action === 'troll_addpairs' ? 1 : action === 'troll_addtime' ? 3 : 2);
            const user = gift.uniqueId || gift.nickname || 'viewer';
            fireMmAction(action, user, amount);
            if (typeof logToDashboard === 'function') {
                const meta = MM_ACTIONS[action] || { label: action };
                logToDashboard(`🃏 Memory Match: @${user} → ${meta.label}`, meta.type === 'troll' ? '#ff6b81' : '#2ecc71');
            }
            return true;
        }
        return false;
    }

    function fireMmAction(action, user, amount) {
        const token = (global.currentUser && global.currentUser.streamToken) || '';
        if (typeof socket !== 'undefined' && socket && socket.connected && token) {
            socket.emit('memory_match_action', { token, action, user, amount });
        }
    }

    function mmAddTrigger() {
        const cfg = getMmConfig();
        if (!cfg.triggers) cfg.triggers = [];
        cfg.triggers.push({ id: Date.now(), enabled: true, giftName: '', giftId: '', action: 'help_reveal', amount: 1 });
        saveMmConfig(cfg);
        renderMmTriggers();
    }

    function mmRemoveTrigger(id) {
        const cfg = getMmConfig();
        cfg.triggers = (cfg.triggers || []).filter(t => t.id !== id);
        saveMmConfig(cfg);
        renderMmTriggers();
    }

    function mmUpdateTrigger(id, key, val) {
        const cfg = getMmConfig();
        const tr = (cfg.triggers || []).find(t => t.id === id);
        if (tr) { tr[key] = val; saveMmConfig(cfg); }
    }

    function renderMmTriggers() {
        const list = document.getElementById('mmTriggerList');
        if (!list) return;
        const cfg = getMmConfig();
        const triggers = cfg.triggers || [];
        if (!triggers.length) {
            list.innerHTML = '<p style="font-size:0.78rem;color:#666;font-family:Kanit;">ยังไม่มีทริกเกอร์ — เพิ่มเพื่อให้ผู้ชมช่วยหรือแกล้งในเกม</p>';
            return;
        }
        const actionOpts = (selected) => Object.entries(MM_ACTIONS).map(([k, v]) =>
            `<option value="${k}"${k === selected ? ' selected' : ''}>${v.icon} ${v.label}</option>`
        ).join('');
        list.innerHTML = triggers.map(tr => `
            <div class="mm-trigger-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
                <input type="text" placeholder="ชื่อของขวัญ" value="${(tr.giftName || '').replace(/"/g, '&quot;')}"
                    onchange="mmUpdateTrigger(${tr.id},'giftName',this.value)"
                    style="flex:1;min-width:100px;padding:6px 8px;border-radius:8px;background:#07070a;border:1px solid #202025;color:#fff;font-family:Kanit;font-size:0.78rem;">
                <select onchange="mmUpdateTrigger(${tr.id},'action',this.value)"
                    style="padding:6px 8px;border-radius:8px;background:#07070a;border:1px solid #202025;color:#fff;font-family:Kanit;font-size:0.78rem;">
                    ${actionOpts(tr.action || 'help_reveal')}
                </select>
                <button type="button" onclick="mmRemoveTrigger(${tr.id})"
                    style="padding:4px 10px;border-radius:8px;background:rgba(255,71,87,0.15);border:1px solid #ff4757;color:#ff6b81;cursor:pointer;font-size:0.78rem;">✕</button>
            </div>
        `).join('');
    }

    async function checkMmInstallStatus() {
        try {
            const res = await fetch('/api/games/memory-match/status');
            const data = await res.json();
            if (data.success && data.installed) {
                const cfg = getMmConfig();
                if (!cfg.installed) {
                    cfg.installed = true;
                    saveMmConfig(cfg);
                }
            }
        } catch (e) {}
    }

    function renderMmProfile() {
        checkMmInstallStatus().finally(() => {
            renderMmProfileUI();
        });
    }

    function renderMmProfileUI() {
        const cfg = getMmConfig();
        const installBtn = document.getElementById('mmInstallBtn');
        const openBtn = document.getElementById('mmOpenBtn');
        const overlayBtn = document.getElementById('mmOverlayBtn');
        const statusEl = document.getElementById('mmInstallStatus');
        const enabledCb = document.getElementById('mmGameEnabled');

        if (statusEl) {
            statusEl.textContent = cfg.installed ? '✅ ติดตั้งแล้ว' : '⬇️ ยังไม่ได้ติดตั้ง';
            statusEl.style.color = cfg.installed ? '#2ecc71' : '#888';
        }
        if (installBtn) installBtn.style.display = cfg.installed ? 'none' : '';
        if (openBtn) openBtn.style.display = cfg.installed ? '' : 'none';
        if (overlayBtn) overlayBtn.style.display = cfg.installed ? '' : 'none';
        if (enabledCb) enabledCb.checked = !!cfg.enabled;

        document.querySelectorAll('.mm-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === cfg.mode);
        });

        const autoWinCb = document.getElementById('mmAutoWin');
        if (autoWinCb) autoWinCb.checked = cfg.autoWin !== false;

        renderMmTriggers();
    }

    function mmTestAction(action) {
        fireMmAction(action, 'ทดสอบ', 1);
        if (typeof showCustomMsg === 'function') {
            const meta = MM_ACTIONS[action] || { label: action };
            showCustomMsg('info', 'ทดสอบ', meta.label);
        }
    }

    function mmSetAutoWin(checked) {
        const cfg = getMmConfig();
        cfg.autoWin = !!checked;
        saveMmConfig(cfg);
    }

    // Expose globals for inline onclick handlers
    global.getMmConfig = getMmConfig;
    global.saveMmConfig = saveMmConfig;
    global.isMmInstalled = isMmInstalled;
    global.mmInstallGame = mmInstallGame;
    global.mmOpenGame = mmOpenGame;
    global.mmCopyOverlayLink = mmCopyOverlayLink;
    global.mmSetMode = mmSetMode;
    global.mmToggleEnabled = mmToggleEnabled;
    global.handleMmGift = handleMmGift;
    global.fireMmAction = fireMmAction;
    global.mmAddTrigger = mmAddTrigger;
    global.mmRemoveTrigger = mmRemoveTrigger;
    global.mmUpdateTrigger = mmUpdateTrigger;
    global.renderMmProfile = renderMmProfile;
    global.mmTestAction = mmTestAction;
    global.mmSetAutoWin = mmSetAutoWin;
    global.syncMmToGame = syncMmToGame;

})(typeof window !== 'undefined' ? window : global);
