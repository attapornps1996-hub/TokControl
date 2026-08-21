/**
 * Super Battle Golf — TokControl Game Center panel (REPO-identical layout)
 * TokControl hosts WS :13715; game InteractiveMod connects as client.
 */
(function (global) {
    'use strict';

    const BG_STORAGE_KEY = 'tokcontrol_battle_golf';
    const BG_DEFAULT_HOST = 'ws://127.0.0.1:13715';
    const BG_CAT_META = {
        items: { title: 'Items', kicker: 'Items', icon: '🎁' },
        buffs: { title: 'Buffs', kicker: 'Buff', icon: '⚡' },
        debuffs: { title: 'Debuffs', kicker: 'Debuff', icon: '💥' },
        effects: { title: 'Effects', kicker: 'FX', icon: '✨' }
    };

    let bgCatalog = null;
    let bgActiveSection = 'events';
    let bgCatalogFilter = 'all';
    let bgTestDelegated = false;
    let bgCatalogExpanded = { items: true, buffs: false, debuffs: false, effects: false };

    function getBgDefaultTriggers() {
        return [
            { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', eventId: 'give_item_coffee' },
            { id: 2, enabled: true, type: 'gift', giftName: 'Finger Heart', giftId: '', eventId: 'debuff_kick_forward' },
            { id: 3, enabled: true, type: 'gift', giftName: 'GG', giftId: '', eventId: 'buff_mega_speed' },
            { id: 4, enabled: true, type: 'gift', giftName: 'Ice Cream Cone', giftId: '', eventId: 'debuff_laser_strike' },
            { id: 5, enabled: true, type: 'follow', eventId: 'cut_effect_emote_wave_emote' },
            { id: 6, enabled: true, type: 'share', eventId: 'buff_activate_shield' }
        ];
    }

    function getBgDefaultConfig() {
        return {
            enabled: false,
            connection: { type: 'websocket', host: BG_DEFAULT_HOST },
            lang: 'th',
            triggers: getBgDefaultTriggers()
        };
    }

    function getBgConfig() {
        try {
            const raw = localStorage.getItem(BG_STORAGE_KEY);
            if (raw) {
                const cfg = { ...getBgDefaultConfig(), ...JSON.parse(raw) };
                if (!Array.isArray(cfg.triggers) || !cfg.triggers.length) cfg.triggers = getBgDefaultTriggers();
                return cfg;
            }
        } catch (_) {}
        return getBgDefaultConfig();
    }

    function saveBgConfig(cfg) {
        localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(cfg));
        if (typeof persistActiveStreamProfile === 'function') persistActiveStreamProfile();
    }

    function authHeaders() {
        const token = localStorage.getItem('pandy_token') || global.currentUser?.token;
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
        };
    }

    function escapeHtmlBg(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function loadBgCatalog() {
        if (bgCatalog) return bgCatalog;
        try {
            const res = await fetch('/api/games/battle-golf/catalog', { headers: authHeaders() });
            const data = await res.json();
            if (data.success && data.catalog) {
                bgCatalog = data.catalog;
                return bgCatalog;
            }
        } catch (_) {}
        try {
            const res = await fetch('/data/battle_golf_catalog.json');
            bgCatalog = await res.json();
            return bgCatalog;
        } catch (_) {
            bgCatalog = { events: [] };
            return bgCatalog;
        }
    }

    function eventLabel(eventId) {
        const ev = (bgCatalog?.events || []).find((e) => e.id === eventId);
        return ev ? (ev.name || ev.nameEn || eventId) : eventId;
    }

    function eventsByCategory() {
        const groups = { items: [], buffs: [], debuffs: [], effects: [] };
        (bgCatalog?.events || []).forEach((ev) => {
            (groups[ev.category] || groups.effects).push(ev);
        });
        return groups;
    }

    function countTriggersForEvent(eventId) {
        const cfg = getBgConfig();
        return (cfg.triggers || []).filter((t) => t.eventId === eventId).length;
    }

    function setBgTestResult(text, ok) {
        const el = document.getElementById('bgTestResult');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'rp-test-result' + (text ? ' show' : '') + (ok === true ? ' ok' : ok === false ? ' err' : '');
        el.style.display = text ? 'block' : 'none';
    }

    function syncBgStartUi(enabled) {
        const on = !!enabled;
        const status = document.getElementById('bgStartStatus');
        if (status) {
            status.textContent = on
                ? 'ทริกเกอร์ Battle Golf เปิดอยู่'
                : 'ทริกเกอร์ยังไม่ทำงาน — กด START เพื่อเปิดใช้งาน';
            status.className = 'rp-start-status ' + (on ? 'running' : 'stopped');
        }
        const btn = document.getElementById('bgStartBtn');
        if (btn) {
            btn.textContent = on ? '⏹ STOP' : '▶ START';
            btn.className = 'rp-start-btn ' + (on ? 'stop' : 'start');
        }
    }

    function updateBgConnChip(st) {
        const dot = document.getElementById('bgConnStatusDot');
        const text = document.getElementById('bgConnStatusText');
        const bar = document.getElementById('bgConnStatusBar');
        if (!dot || !text || !bar) return;
        let label = 'Bridge ยังไม่เปิด';
        let chip = 'is-offline';
        let dcls = 'offline';
        if (st?.listening && st?.connected) {
            label = 'เกมเชื่อมต่อแล้ว';
            chip = 'is-online';
            dcls = 'online';
        } else if (st?.listening) {
            label = 'Bridge พร้อม · รอเกม';
            chip = 'is-checking';
            dcls = 'checking';
        } else if (st?.lastError || st?.error) {
            label = 'ไม่พบ Bridge';
            chip = 'is-offline';
            dcls = 'offline';
        }
        text.textContent = label;
        dot.className = 'rp-conn-dot ' + dcls;
        bar.className = 'rp-conn-chip ' + chip;
        bar.title = st?.lastError || st?.error || label;
    }

    async function bgStartBridge() {
        const res = await fetch('/api/games/battle-golf/start', {
            method: 'POST', headers: authHeaders(), body: '{}'
        });
        const data = await res.json().catch(() => ({}));
        if (typeof showCustomMsg === 'function') {
            if (data.success) {
                showCustomMsg('success', 'Battle Golf Bridge', data.connected
                    ? 'เกมเชื่อมต่อแล้ว'
                    : 'เปิดพอร์ต 13715 แล้ว — รอเกมเชื่อมต่อ');
            } else {
                showCustomMsg('error', 'เปิด Bridge ไม่สำเร็จ', data.hint || data.error || 'พอร์ตอาจถูกใช้');
            }
        }
        await renderBgProfile();
        return data;
    }

    async function bgStopBridge() {
        await fetch('/api/games/battle-golf/stop', { method: 'POST', headers: authHeaders(), body: '{}' });
        await renderBgProfile();
    }

    async function bgRefreshStatus() {
        try {
            const res = await fetch('/api/games/battle-golf/status', { headers: authHeaders() });
            return await res.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function bgPingBridge() {
        let st = await bgRefreshStatus();
        if (!st.listening) {
            await fetch('/api/games/battle-golf/start', {
                method: 'POST', headers: authHeaders(), body: '{}'
            }).catch(() => ({}));
            st = await bgRefreshStatus();
        }
        updateBgConnChip(st);
        const detail = document.getElementById('bgConnDetail');
        if (detail) {
            if (!st.listening) {
                detail.textContent = 'Bridge ยังไม่เปิด';
                detail.style.color = '#ff6b7a';
            } else {
                detail.textContent = st.connected
                    ? `OK · เกมเชื่อมต่อแล้ว (${st.clients} client)`
                    : 'OK · Bridge พร้อม แต่เกมยังไม่เชื่อมต่อ';
                detail.style.color = st.connected ? '#2ecc71' : '#f1c40f';
            }
        }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(
                st.connected ? 'success' : (st.listening ? 'info' : 'warning'),
                'ทดสอบ Bridge',
                st.connected ? 'เกมเชื่อมต่อแล้ว' : (st.listening ? 'Bridge พร้อม — รอเกม' : 'เปิด Bridge ไม่ได้')
            );
        }
        updateBgDashboard(st);
        return st;
    }

    async function bgFireEvent(eventId, username, opts = {}) {
        const id = String(eventId || '').trim();
        if (!id) return { ok: false, error: 'missing_eventId' };
        const cfg = getBgConfig();
        const userEl = document.getElementById('bgTestUsername');
        const payload = {
            eventId: id,
            username: username || userEl?.value?.trim() || 'viewer',
            lang: cfg.lang || 'th'
        };
        const quiet = opts.quiet === true;
        if (!quiet) setBgTestResult('กำลังส่ง ' + (eventLabel(id) || id) + '…');

        try {
            const st0 = await bgRefreshStatus();
            if (!st0.listening) {
                await fetch('/api/games/battle-golf/start', {
                    method: 'POST', headers: authHeaders(), body: '{}'
                }).catch(() => ({}));
            }
            const res = await fetch('/api/game-mod/execute', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    gameId: 'battle-golf',
                    command: JSON.stringify(payload),
                    connection: cfg.connection || { type: 'websocket', host: BG_DEFAULT_HOST }
                })
            });
            const data = await res.json().catch(() => ({}));
            const ok = data.success === true || data.ok === true;
            const sent = Number(data.sent || 0);
            const label = eventLabel(id) || id;

            if (!quiet) {
                if (!ok) setBgTestResult('❌ ส่งไม่สำเร็จ: ' + (data.error || data.message || 'unknown'), false);
                else if (sent === 0) setBgTestResult('⏳ คิวแล้ว แต่เกมยังไม่เชื่อมต่อ', false);
                else setBgTestResult('✅ ส่งแล้ว: ' + label, true);
            }
            if (typeof logToDashboard === 'function') {
                logToDashboard(
                    ok
                        ? (sent > 0 ? `⛳ Battle Golf: ${label} → เกม` : `⛳ Battle Golf: ${label} (รอเกม)`)
                        : `⛳ Battle Golf ERROR: ${data.error || data.message || 'fail'}`,
                    ok ? (sent > 0 ? '#2ecc71' : '#f1c40f') : '#ff6b7a'
                );
            }
            return { ok, ...data };
        } catch (e) {
            if (!quiet) setBgTestResult('❌ เครือข่าย: ' + (e.message || e), false);
            return { ok: false, error: e.message || 'network_error' };
        }
    }

    function switchBgTopTab(tab) {
        const settings = document.getElementById('bgSettingsPanel');
        const dash = document.getElementById('bgDashboardPanel');
        const tabSettings = document.getElementById('bgTabSettings');
        const tabDash = document.getElementById('bgTabDashboard');
        const isDash = tab === 'dashboard';
        if (settings) settings.style.display = isDash ? 'none' : 'block';
        if (dash) dash.style.display = isDash ? 'block' : 'none';
        tabSettings?.classList.toggle('active', !isDash);
        tabDash?.classList.toggle('active', isDash);
        if (isDash) updateBgDashboard();
        else switchBgSection(bgActiveSection || 'events');
    }

    function switchBgSection(section) {
        const key = section === 'triggers' ? 'events' : (section || 'events');
        bgActiveSection = key;
        const map = {
            events: { sec: 'bgSectionEvents', nav: 'bgNavEvents' },
            test: { sec: 'bgSectionTest', nav: 'bgNavTest' },
            connection: { sec: 'bgSectionConnection', nav: 'bgNavConnection' }
        };
        Object.keys(map).forEach((k) => {
            document.getElementById(map[k].sec)?.classList.toggle('active', k === key);
            document.getElementById(map[k].nav)?.classList.toggle('active', k === key);
        });
        if (key === 'events') {
            renderBgCatalog();
            renderBgTriggers();
        }
        if (key === 'test') renderBgTestList();
        if (key === 'connection') bgRefreshStatus().then(updateBgConnChip);
    }

    function toggleBgPanel(panelId) {
        document.getElementById(panelId)?.classList.toggle('open');
    }

    function toggleBgEnabled(on) {
        const cfg = getBgConfig();
        cfg.enabled = !!on;
        saveBgConfig(cfg);
        syncBgStartUi(cfg.enabled);
        if (cfg.enabled) bgStartBridge().catch(() => {});
        updateBgDashboard();
    }

    function toggleBgTriggersStart() {
        toggleBgEnabled(!getBgConfig().enabled);
    }

    function setBgCatalogFilter(preset) {
        bgCatalogFilter = preset || 'all';
        document.querySelectorAll('#bgPresetPills .rp-preset-pill').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-preset') === bgCatalogFilter);
        });
        renderBgCatalog();
    }

    function renderBgCatalog() {
        const host = document.getElementById('bgCatalogList');
        if (!host) return;
        const groups = eventsByCategory();
        const cats = Object.keys(BG_CAT_META).filter((c) => bgCatalogFilter === 'all' || bgCatalogFilter === c);
        host.innerHTML = cats.map((cat) => {
            const meta = BG_CAT_META[cat];
            const rows = groups[cat] || [];
            if (!rows.length) return '';
            const expanded = !!bgCatalogExpanded[cat];
            return `<div class="rp-random-cat-block${expanded ? ' expanded' : ''}" data-bg-cat="${cat}">
                <div class="rp-event-row">
                    <span class="rp-custom-cat">${escapeHtmlBg(meta.icon)} ${escapeHtmlBg(meta.title)} · ${rows.length}</span>
                    <button type="button" class="rp-btn-triggers" data-bg-cat-triggers="${cat}">TRIGGERS</button>
                    <button type="button" class="rp-random-expand-btn" data-bg-cat-expand="${cat}">
                        <span class="rp-random-expand-label">${expanded ? 'ซ่อน' : 'แสดง'}</span>
                        <span class="rp-random-expand-chevron">${expanded ? '▲' : '▼'}</span>
                    </button>
                </div>
                <div class="rp-random-items${rows.length ? '' : ' empty'}">
                    ${rows.map((ev) => {
                        const n = countTriggersForEvent(ev.id);
                        return `<div class="rp-random-item-row">
                            <div class="rp-random-item-main">
                                <span class="rp-random-item-label">${escapeHtmlBg(ev.name)}</span>
                            </div>
                            <button type="button" class="rp-btn-triggers" data-bg-bind-event="${escapeHtmlBg(ev.id)}">TRIGGERS${n ? ` (${n})` : ''}</button>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('') || '<p class="rp-custom-empty">ไม่พบอีเวนต์</p>';

        if (!host._bgCatalogBound) {
            host._bgCatalogBound = true;
            host.addEventListener('click', (ev) => {
                const expand = ev.target.closest('[data-bg-cat-expand]');
                if (expand) {
                    const cat = expand.getAttribute('data-bg-cat-expand');
                    bgCatalogExpanded[cat] = !bgCatalogExpanded[cat];
                    renderBgCatalog();
                    return;
                }
                const bind = ev.target.closest('[data-bg-bind-event]');
                if (bind) {
                    openBgTriggerModal({ eventId: bind.getAttribute('data-bg-bind-event') });
                    return;
                }
                const catTrig = ev.target.closest('[data-bg-cat-triggers]');
                if (catTrig) {
                    const cat = catTrig.getAttribute('data-bg-cat-triggers');
                    const first = (eventsByCategory()[cat] || [])[0];
                    openBgTriggerModal(first ? { eventId: first.id } : {});
                }
            });
        }
    }

    function renderBgTriggers() {
        const list = document.getElementById('bgTriggerList');
        if (!list) return;
        const cfg = getBgConfig();
        const q = String(document.getElementById('bgCustomSearch')?.value || '').trim().toLowerCase();
        const rows = (cfg.triggers || []).filter((tr) => {
            if (!q) return true;
            const hay = [tr.type, tr.giftName, tr.giftId, tr.eventId, eventLabel(tr.eventId)].join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!rows.length) {
            list.innerHTML = '<p class="rp-custom-empty">ยังไม่มีทริกเกอร์ — กด Add Custom Trigger</p>';
            return;
        }
        list.innerHTML = rows.map((tr) => {
            const idx = cfg.triggers.indexOf(tr);
            const typeLabel = (tr.type || 'gift').toUpperCase();
            const giftBit = tr.type === 'gift' ? (tr.giftName || tr.giftId || 'ของขวัญ') : (tr.type || 'event');
            return `<div class="rp-custom-card" data-bg-trig-idx="${idx}">
                <div class="rp-custom-card-top">
                    <input type="checkbox" ${tr.enabled !== false ? 'checked' : ''} onchange="bgToggleTrigger(${idx}, this.checked)">
                    <div class="rp-custom-event-info">
                        <span class="rp-custom-cat">${escapeHtmlBg(typeLabel)} · ${escapeHtmlBg(giftBit)}</span>
                        <span class="rp-custom-name">${escapeHtmlBg(eventLabel(tr.eventId))}</span>
                    </div>
                    <div class="rp-custom-actions">
                        <button type="button" class="rp-btn-triggers" onclick="openBgTriggerModal({editIndex:${idx}})">TRIGGERS</button>
                        <button type="button" class="rp-icon-btn" onclick="bgRemoveTrigger(${idx})" title="ลบ">✕</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function bgToggleTrigger(idx, on) {
        const cfg = getBgConfig();
        if (cfg.triggers[idx]) cfg.triggers[idx].enabled = !!on;
        saveBgConfig(cfg);
        renderBgCatalog();
    }

    function bgRemoveTrigger(idx) {
        const cfg = getBgConfig();
        cfg.triggers.splice(idx, 1);
        saveBgConfig(cfg);
        renderBgTriggers();
        renderBgCatalog();
    }

    function openBgTriggerModal(opts = {}) {
        loadBgCatalog().then(() => {
            const events = bgCatalog?.events || [];
            const cfg = getBgConfig();
            const edit = Number.isInteger(opts.editIndex) ? cfg.triggers[opts.editIndex] : null;
            const preEvent = opts.eventId || edit?.eventId || events[0]?.id || '';
            const optsHtml = events.map((e) =>
                `<option value="${escapeHtmlBg(e.id)}" ${e.id === preEvent ? 'selected' : ''}>${escapeHtmlBg(e.name)}</option>`
            ).join('');
            const html = `<div style="text-align:left;">
                <label style="display:block;margin:8px 0 4px;color:#aaa;font-size:0.75rem;">ประเภททริกเกอร์</label>
                <select id="bgNewTrigType" class="field-ui" style="width:100%;">
                    <option value="gift" ${(edit?.type || 'gift') === 'gift' ? 'selected' : ''}>ของขวัญ</option>
                    <option value="follow" ${edit?.type === 'follow' ? 'selected' : ''}>ติดตาม</option>
                    <option value="share" ${edit?.type === 'share' ? 'selected' : ''}>แชร์</option>
                    <option value="like" ${edit?.type === 'like' ? 'selected' : ''}>ไลค์</option>
                    <option value="join" ${edit?.type === 'join' ? 'selected' : ''}>เข้าห้อง</option>
                </select>
                <label style="display:block;margin:12px 0 4px;color:#aaa;font-size:0.75rem;">ชื่อของขวัญ (ถ้าเป็น gift)</label>
                <input id="bgNewTrigGift" class="field-ui" style="width:100%;" placeholder="Rose" value="${escapeHtmlBg(edit?.giftName || '')}">
                <label style="display:block;margin:12px 0 4px;color:#aaa;font-size:0.75rem;">อีเวนต์ในเกม</label>
                <select id="bgNewTrigEvent" class="field-ui" style="width:100%;">${optsHtml}</select>
            </div>`;
            const title = edit ? 'แก้ไขทริกเกอร์ Battle Golf' : 'เพิ่มทริกเกอร์ Battle Golf';
            if (typeof showCustomConfirm === 'function') {
                showCustomConfirm(title, html, () => {
                    const type = document.getElementById('bgNewTrigType')?.value || 'gift';
                    const giftName = document.getElementById('bgNewTrigGift')?.value || '';
                    const eventId = document.getElementById('bgNewTrigEvent')?.value;
                    if (!eventId) return;
                    const next = getBgConfig();
                    const row = {
                        id: edit?.id || Date.now(),
                        enabled: edit?.enabled !== false,
                        type,
                        giftName: type === 'gift' ? giftName : '',
                        giftId: edit?.giftId || '',
                        eventId
                    };
                    if (edit && Number.isInteger(opts.editIndex)) next.triggers[opts.editIndex] = row;
                    else next.triggers.push(row);
                    saveBgConfig(next);
                    renderBgTriggers();
                    renderBgCatalog();
                });
            }
        });
    }

    function bindBgTestDelegation() {
        if (bgTestDelegated) return;
        bgTestDelegated = true;
        const root = document.getElementById('gcBattleGolfView');
        if (!root) return;
        root.addEventListener('click', (ev) => {
            const fire = ev.target.closest('.rp-btn-fire[data-bg-event]');
            if (!fire) return;
            ev.preventDefault();
            const id = fire.getAttribute('data-bg-event');
            if (!id) return;
            fire.disabled = true;
            bgFireEvent(id).finally(() => setTimeout(() => { fire.disabled = false; }, 250));
        });
    }

    function filterBgTestLists(q) {
        const query = String(q || '').trim().toLowerCase();
        ['bgTestItemsList', 'bgTestBuffsList', 'bgTestDebuffsList', 'bgTestEffectsList'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.querySelectorAll('.rp-spawn-row').forEach((row) => {
                const name = (row.querySelector('.rp-spawn-name')?.textContent || '').toLowerCase();
                const eid = (row.querySelector('[data-bg-event]')?.getAttribute('data-bg-event') || '').toLowerCase();
                row.style.display = (!query || name.includes(query) || eid.includes(query)) ? '' : 'none';
            });
            const panel = el.closest('.rp-panel--test');
            if (panel) {
                const any = Array.from(el.querySelectorAll('.rp-spawn-row')).some((r) => r.style.display !== 'none');
                panel.style.display = any || !query ? '' : 'none';
            }
        });
    }

    async function renderBgTestList() {
        await loadBgCatalog();
        bindBgTestDelegation();
        const groups = eventsByCategory();
        const buckets = [
            { id: 'bgTestItemsList', rows: groups.items },
            { id: 'bgTestBuffsList', rows: groups.buffs },
            { id: 'bgTestDebuffsList', rows: groups.debuffs },
            { id: 'bgTestEffectsList', rows: groups.effects }
        ];
        buckets.forEach(({ id, rows }) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!rows.length) {
                el.innerHTML = '<p class="rp-custom-empty">No events found</p>';
                return;
            }
            el.innerHTML = `<div class="rp-spawn-grid">${rows.map((ev) => `
                <div class="rp-spawn-row">
                    <span class="rp-spawn-name">${escapeHtmlBg(ev.name)}</span>
                    <button type="button" class="rp-btn-fire" data-bg-event="${escapeHtmlBg(ev.id)}" title="ทดสอบ ${escapeHtmlBg(ev.name)}" aria-label="ทดสอบ">▶</button>
                </div>`).join('')}</div>`;
        });
        const search = document.getElementById('bgTestSearch');
        if (search?.value) filterBgTestLists(search.value);
    }

    function saveBgConnection() {
        const cfg = getBgConfig();
        const host = document.getElementById('bgConnHost')?.value?.trim() || BG_DEFAULT_HOST;
        cfg.connection = { type: 'websocket', host };
        saveBgConfig(cfg);
    }

    async function updateBgDashboard(stIn) {
        await loadBgCatalog();
        const cfg = getBgConfig();
        const st = stIn || await bgRefreshStatus();
        const warn = document.getElementById('bgDashWarn');
        if (warn) warn.style.display = cfg.enabled ? 'none' : 'block';
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('bgDashEnabled', cfg.enabled ? 'เปิด' : 'ปิด');
        set('bgDashBridge', st.connected ? 'เชื่อมต่อแล้ว' : (st.listening ? 'รอเกม' : 'ปิด'));
        set('bgDashWs', cfg.connection?.host || BG_DEFAULT_HOST);
        set('bgDashCatalogCount', String((bgCatalog?.events || []).length));
        set('bgDashTriggerCount', String((cfg.triggers || []).length));
        set('bgDashTriggerOn', String((cfg.triggers || []).filter((t) => t.enabled !== false).length));
        updateBgConnChip(st);
    }

    async function renderBgProfile() {
        await loadBgCatalog();
        const cfg = getBgConfig();
        const hostInp = document.getElementById('bgConnHost');
        if (hostInp) hostInp.value = cfg.connection?.host || BG_DEFAULT_HOST;
        syncBgStartUi(!!cfg.enabled);
        const st = await bgRefreshStatus();
        updateBgConnChip(st);
        const detail = document.getElementById('bgConnDetail');
        if (detail) {
            if (st.listening) {
                detail.textContent = st.connected
                    ? `Bridge พร้อม · เกมเชื่อมต่อแล้ว (${st.clients} client)`
                    : 'Bridge พร้อม · รอเกมเชื่อมต่อที่พอร์ต 13715';
                detail.style.color = st.connected ? '#2ecc71' : '#f1c40f';
            } else {
                detail.textContent = st.lastError || st.error || 'Bridge ยังไม่เปิด — กด Start Bridge';
                detail.style.color = '#ff6b7a';
            }
        }
        const dash = document.getElementById('bgDashboardPanel');
        if (dash && dash.style.display === 'block') updateBgDashboard(st);
        else switchBgSection(bgActiveSection || 'events');
    }

    function matchBgTrigger(tr, eventType, data) {
        if (!tr || tr.enabled === false) return false;
        const type = tr.type || 'gift';
        if (type !== eventType && !(type === 'gift' && eventType === 'gift')) return false;
        if (type === 'gift') {
            const name = String(data?.giftName || '').toLowerCase();
            const id = String(data?.giftId || data?.diamondCount || '');
            if (tr.giftId && String(tr.giftId) === id) return true;
            if (tr.giftName && name === String(tr.giftName).toLowerCase()) return true;
            return false;
        }
        return true;
    }

    function handleBgGift(gift) {
        const cfg = getBgConfig();
        if (!cfg.enabled) return;
        const user = gift?.uniqueId || gift?.nickname || 'viewer';
        (cfg.triggers || []).forEach((tr) => {
            if (!matchBgTrigger(tr, 'gift', gift)) return;
            bgFireEvent(tr.eventId, user, { quiet: true });
        });
    }

    function handleBgLiveEvent(eventType, data) {
        const cfg = getBgConfig();
        if (!cfg.enabled) return;
        if (eventType === 'gift') return handleBgGift(data);
        const user = data?.uniqueId || data?.nickname || 'viewer';
        (cfg.triggers || []).forEach((tr) => {
            if (!matchBgTrigger(tr, eventType, data)) return;
            bgFireEvent(tr.eventId, user, { quiet: true });
        });
    }

    function showBgInstallGuide() {
        if (typeof showCustomMsg !== 'function') return;
        showCustomMsg('info', 'ติดตั้ง TokControl Battle Golf',
            `<div style="text-align:left;line-height:1.5;font-size:0.85rem;">
            <b>1.</b> รัน <code>mods/TokControlBattleGolfBridge/install.bat</code><br>
            <b>2.</b> ตรวจ Doorstop ชี้ <code>TokControl_BattleGolf_InteractiveModData\\ModLoader.dll</code><br>
            <b>3.</b> ปิดโปรแกรมอื่นที่ใช้พอร์ต 13715<br>
            <b>4.</b> กด Start Bridge แล้วเปิดเกม<br>
            <b>5.</b> กด START ทริกเกอร์ แล้วใช้แท็บทดสอบ
            </div>`);
    }

    global.getBgConfig = getBgConfig;
    global.saveBgConfig = saveBgConfig;
    global.renderBgProfile = renderBgProfile;
    global.switchBgTopTab = switchBgTopTab;
    global.switchBgSection = switchBgSection;
    global.toggleBgPanel = toggleBgPanel;
    global.toggleBgTriggersStart = toggleBgTriggersStart;
    global.toggleBgEnabled = toggleBgEnabled;
    global.setBgCatalogFilter = setBgCatalogFilter;
    global.bgStartBridge = bgStartBridge;
    global.bgStopBridge = bgStopBridge;
    global.bgFireEvent = bgFireEvent;
    global.bgToggleTrigger = bgToggleTrigger;
    global.bgRemoveTrigger = bgRemoveTrigger;
    global.openBgTriggerModal = openBgTriggerModal;
    global.saveBgConnection = saveBgConnection;
    global.handleBgGift = handleBgGift;
    global.handleBgLiveEvent = handleBgLiveEvent;
    global.showBgInstallGuide = showBgInstallGuide;
    global.bgRefreshStatus = bgRefreshStatus;
    global.bgPingBridge = bgPingBridge;
    global.filterBgTestLists = filterBgTestLists;
    global.renderBgTriggers = renderBgTriggers;
    global.renderBgTestList = renderBgTestList;
})(typeof window !== 'undefined' ? window : globalThis);
