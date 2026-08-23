/* Vote Overlay studio — dashboard settings/preview. Uses TokControlVoteOverlay. */
(function (global) {
    'use strict';

    const PRESET_TEMPLATES = [
        { id: 'gaming', name: 'Gaming Overlay', appearance: { layout: 'neon', theme: 'neon-purple', animationPreset: 'esports', glowIntensity: 'medium' } },
        { id: 'tiktok', name: 'TikTok Live', appearance: { layout: 'compact', compactPosition: 'top-center', theme: 'hot-pink', scale: 90 } },
        { id: 'minimal', name: 'Minimal Stream', appearance: { layout: 'glass', theme: 'minimal-dark', glowIntensity: 'low', animationPreset: 'minimal' } },
        { id: 'tournament', name: 'Tournament', appearance: { layout: 'esports', theme: 'tokcontrol', animationPreset: 'esports' } },
        { id: 'event', name: 'Event Final', appearance: { layout: 'panorama', theme: 'neon-purple', glowIntensity: 'high', winnerAnim: true } }
    ];

    let booted = false;
    let engine = null;
    let simState = null;
    let useSim = true;
    let aspect = '16-9';
    let zoom = 100;
    let showSafe = false;
    let spotlightBound = false;

    function api() { return global.TokControlVoteOverlay; }

    function store() {
        if (typeof global.ensureVoteStore === 'function') return global.ensureVoteStore();
        return null;
    }

    function kit() {
        const vs = store();
        if (!vs) return api().mergeAppearance({});
        if (!vs.overlayKit || typeof vs.overlayKit !== 'object') vs.overlayKit = api().mergeAppearance({});
        vs.overlayKit = api().mergeAppearance(vs.overlayKit);
        if (!Array.isArray(vs.overlayKit.presets)) vs.overlayKit.presets = PRESET_TEMPLATES.map((p) => ({ ...p }));
        return vs.overlayKit;
    }

    function save() {
        if (typeof global.autoSave === 'function') global.autoSave();
        if (typeof global.syncVoteToOverlay === 'function') global.syncVoteToOverlay();
        refreshPreview();
    }

    function liveState() {
        const vs = store();
        if (!vs || !api()) return api().MOCK_STATE;
        const timerLeft = typeof global.voteGetTimerLeft === 'function' ? global.voteGetTimerLeft() : 60;
        const participants = (global.voteUserVotes && global.voteUserVotes.size) || (global.voteRecentLog || []).length || 0;
        const built = api().buildOverlayState({
            vote: vs,
            timerLeft,
            totalParticipants: participants
        });
        built.overlayVisible = true;
        return built;
    }

    function cloneMock() {
        const mock = JSON.parse(JSON.stringify(api().MOCK_STATE));
        const vs = store();
        if (vs && Array.isArray(vs.options) && vs.options.length) {
            mock.question = vs.title || mock.question;
            mock.options = vs.options.slice(0, 8).map((real, i) => {
                const fallback = mock.options[i] || mock.options[0];
                return {
                    id: real.id,
                    label: real.name || fallback.label,
                    votes: Number(real.votes) || Number(fallback && fallback.votes) || 0,
                    percentage: 0,
                    rank: i + 1,
                    color: real.color || (fallback && fallback.color),
                    imageUrl: real.image || real.imageUrl || ''
                };
            });
            const total = mock.options.reduce((s, o) => s + (o.votes || 0), 0);
            mock.totalVotes = total;
            mock.options.forEach((o, i) => {
                o.percentage = total > 0 ? Math.round((o.votes / total) * 100) : (api().MOCK_STATE.options[i] ? api().MOCK_STATE.options[i].percentage : 0);
                if (!o.votes && api().MOCK_STATE.options[i]) {
                    o.votes = api().MOCK_STATE.options[i].votes;
                    o.percentage = api().MOCK_STATE.options[i].percentage;
                }
            });
        }
        return mock;
    }

    function currentState() {
        const appearance = kit();
        const base = useSim ? (simState || cloneMock()) : liveState();
        base.appearance = appearance;
        base.overlayVisible = true;
        return base;
    }

    function refreshPreview() {
        if (!engine) return;
        const mount = document.getElementById('voteOvPreviewMount');
        if (!mount) return;
        engine.setAspect(aspect);
        engine.applyState(currentState());
        mount.style.setProperty('--preview-zoom', String(zoom / 100));
        mount.classList.toggle('show-safe', showSafe);
        syncForm();
    }

    function qs(id) { return document.getElementById(id); }

    function bindSpotlight() {
        if (spotlightBound) return;
        const grid = qs('voteOvLayoutGrid');
        if (!grid) return;
        spotlightBound = true;
        grid.addEventListener('pointermove', (e) => {
            const card = e.target.closest('.vov-layout');
            if (!card) return;
            const r = card.getBoundingClientRect();
            card.style.setProperty('--spot-x', ((e.clientX - r.left) / r.width) * 100 + '%');
            card.style.setProperty('--spot-y', ((e.clientY - r.top) / r.height) * 100 + '%');
        });
    }

    function renderLayouts() {
        const grid = qs('voteOvLayoutGrid');
        if (!grid || !api()) return;
        const cur = kit().layout;
        grid.innerHTML = api().LAYOUTS.map((l) =>
            `<button type="button" class="vov-layout${l.id === cur ? ' is-on' : ''}" data-layout="${l.id}">
                <b>${l.label}</b><small>${l.desc}</small>
            </button>`
        ).join('');
        grid.querySelectorAll('.vov-layout').forEach((btn) => {
            btn.addEventListener('click', () => {
                kit().layout = btn.dataset.layout;
                save();
                renderLayouts();
            });
        });
        bindSpotlight();
    }

    function renderThemes() {
        const row = qs('voteOvThemeRow');
        if (!row || !api()) return;
        const names = {
            tokcontrol: 'TokControl Purple',
            'neon-purple': 'Neon Purple',
            'cyber-blue': 'Cyber Blue',
            'hot-pink': 'Hot Pink',
            'orange-fire': 'Orange Fire',
            'minimal-dark': 'Minimal Dark',
            'minimal-light': 'Minimal Light',
            custom: 'Custom'
        };
        const cur = kit().theme;
        row.innerHTML = Object.keys(names).map((id) =>
            `<button type="button" class="vov-chip${id === cur ? ' is-on' : ''}" data-theme="${id}">${names[id]}</button>`
        ).join('');
        row.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.addEventListener('click', () => { kit().theme = btn.dataset.theme; save(); renderThemes(); });
        });
    }

    function renderOptionColors() {
        const row = qs('voteOvOptionColors');
        if (!row) return;
        const colors = kit().optionColors;
        row.innerHTML = colors.map((c, i) =>
            `<label class="vov-color">สี ${i + 1}<input type="color" value="${c}" data-opt-color="${i}"></label>`
        ).join('');
        row.querySelectorAll('input').forEach((inp) => {
            inp.addEventListener('input', () => {
                kit().optionColors[Number(inp.dataset.optColor)] = inp.value;
                save();
            });
        });
    }

    function renderPresets() {
        const el = qs('voteOvPresetList');
        if (!el) return;
        const list = kit().presets || [];
        el.innerHTML = list.map((p) =>
            `<div class="vov-preset">
                <button type="button" class="vov-chip" data-apply="${p.id}">${p.name}</button>
                <button type="button" class="vov-mini" data-dup="${p.id}">คัดลอก</button>
                <button type="button" class="vov-mini" data-ren="${p.id}">ชื่อ</button>
                <button type="button" class="vov-mini danger" data-del="${p.id}">ลบ</button>
            </div>`
        ).join('') || '<div class="vov-empty">ยังไม่มี preset</div>';
        el.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.apply)));
        el.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => dupPreset(b.dataset.dup)));
        el.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', () => renamePreset(b.dataset.ren)));
        el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delPreset(b.dataset.del)));
    }

    function applyPreset(id) {
        const p = (kit().presets || []).find((x) => x.id === id);
        if (!p) return;
        Object.assign(kit(), api().mergeAppearance({ ...kit(), ...p.appearance }));
        kit().activePresetId = id;
        save();
        renderAll();
    }
    function dupPreset(id) {
        const p = (kit().presets || []).find((x) => x.id === id);
        if (!p) return;
        kit().presets.push({ id: 'p_' + Date.now(), name: p.name + ' สำเนา', appearance: { ...p.appearance } });
        save(); renderPresets();
    }
    function renamePreset(id) {
        const p = (kit().presets || []).find((x) => x.id === id);
        if (!p) return;
        const name = prompt('ชื่อ Preset', p.name);
        if (name) { p.name = name; save(); renderPresets(); }
    }
    function delPreset(id) {
        kit().presets = (kit().presets || []).filter((x) => x.id !== id);
        save(); renderPresets();
    }

    function syncForm() {
        const a = kit();
        const set = (id, val, prop) => {
            const el = qs(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!val;
            else el.value = val;
        };
        set('voteOvAccent', a.accentColor);
        set('voteOvBgOp', a.backgroundOpacity);
        set('voteOvCardOp', a.cardOpacity);
        set('voteOvBlur', a.blur);
        set('voteOvBorderOp', a.borderOpacity);
        set('voteOvGlow', a.glowIntensity);
        set('voteOvRadius', a.cornerRadius);
        set('voteOvFont', a.fontSize);
        set('voteOvScale', a.scale);
        set('voteOvPosH', a.positionH);
        set('voteOvPosV', a.positionV);
        set('voteOvOffX', a.offsetX);
        set('voteOvOffY', a.offsetY);
        set('voteOvLocale', a.locale);
        set('voteOvShowQ', a.showQuestion, true);
        set('voteOvQSize', a.questionSize);
        set('voteOvQLines', a.questionMaxLines);
        set('voteOvQAlign', a.questionAlign);
        set('voteOvShowNum', a.showNumber);
        set('voteOvShowImg', a.showImage);
        set('voteOvShowName', a.showName);
        set('voteOvShowPct', a.showPercentage);
        set('voteOvShowVotes', a.showVoteCount);
        set('voteOvShowBar', a.showProgress);
        set('voteOvShowRank', a.showRanking);
        set('voteOvShowCrown', a.showCrown);
        set('voteOvShowWinner', a.showWinnerEffect);
        set('voteOvShowTimer', a.showTimer);
        set('voteOvTimerStyle', a.timerStyle);
        set('voteOvWarn', a.countdownWarning);
        set('voteOvWarnSec', a.warningSeconds);
        set('voteOvShowPeople', a.showParticipants);
        set('voteOvShowTotal', a.showTotalVotes);
        set('voteOvShowTimeStat', a.showTimeStat);
        set('voteOvAnim', a.animationPreset);
        set('voteOvAnimDur', a.animDuration);
        set('voteOvHideReconnect', a.hideReconnect);
        set('voteOvCompactPos', a.compactPosition);
        const urlEl = qs('voteOvUrlPreview');
        if (urlEl && typeof global.buildOverlayUrl === 'function') {
            const extra = a.accessKey ? { key: a.accessKey } : {};
            urlEl.textContent = global.buildOverlayUrl('vote', extra);
        }
    }

    function bindControls() {
        const num = (id, key, min, max) => {
            const el = qs(id);
            if (!el) return;
            el.addEventListener('input', () => {
                let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value);
                if (typeof min === 'number') v = Math.max(min, Math.min(max, v));
                kit()[key] = v;
                save();
            });
        };
        num('voteOvAccent', 'accentColor');
        num('voteOvBgOp', 'backgroundOpacity', 0, 1);
        num('voteOvCardOp', 'cardOpacity', 0.2, 1);
        num('voteOvBlur', 'blur', 0, 24);
        num('voteOvBorderOp', 'borderOpacity', 0, 1);
        num('voteOvGlow', 'glowIntensity');
        num('voteOvRadius', 'cornerRadius', 0, 32);
        num('voteOvFont', 'fontSize', 70, 140);
        num('voteOvScale', 'scale', 50, 160);
        num('voteOvPosH', 'positionH');
        num('voteOvPosV', 'positionV');
        num('voteOvOffX', 'offsetX', -400, 400);
        num('voteOvOffY', 'offsetY', -400, 400);
        num('voteOvLocale', 'locale');
        num('voteOvShowQ', 'showQuestion');
        num('voteOvQSize', 'questionSize', 70, 140);
        num('voteOvQLines', 'questionMaxLines', 1, 4);
        num('voteOvQAlign', 'questionAlign');
        num('voteOvShowNum', 'showNumber');
        num('voteOvShowImg', 'showImage');
        num('voteOvShowName', 'showName');
        num('voteOvShowPct', 'showPercentage');
        num('voteOvShowVotes', 'showVoteCount');
        num('voteOvShowBar', 'showProgress');
        num('voteOvShowRank', 'showRanking');
        num('voteOvShowCrown', 'showCrown');
        num('voteOvShowWinner', 'showWinnerEffect');
        num('voteOvShowTimer', 'showTimer');
        num('voteOvTimerStyle', 'timerStyle');
        num('voteOvWarn', 'countdownWarning');
        num('voteOvWarnSec', 'warningSeconds', 3, 30);
        num('voteOvShowPeople', 'showParticipants');
        num('voteOvShowTotal', 'showTotalVotes');
        num('voteOvShowTimeStat', 'showTimeStat');
        num('voteOvAnim', 'animationPreset');
        num('voteOvAnimDur', 'animDuration', 80, 900);
        num('voteOvHideReconnect', 'hideReconnect');
        num('voteOvCompactPos', 'compactPosition');
    }

    function setAspect(next) {
        aspect = next;
        const frame = qs('voteOvPreviewFrame');
        if (frame) {
            frame.dataset.aspect = next;
            frame.style.aspectRatio = next === '9-16' ? '9 / 16' : next === '1-1' ? '1 / 1' : next === '4-3' ? '4 / 3' : '16 / 9';
        }
        document.querySelectorAll('[data-ov-aspect]').forEach((b) => b.classList.toggle('is-on', b.dataset.ovAspect === next));
        refreshPreview();
    }

    function simEnsure() {
        if (!simState) simState = cloneMock();
        simState.appearance = kit();
        simState.overlayVisible = true;
        return simState;
    }

    function rerankSim() {
        const s = simEnsure();
        const ranked = api().buildOverlayState({
            vote: {
                title: s.question,
                overlayVisible: true,
                timerRunning: s.status === 'live' || s.status === 'ending',
                showResultScreen: s.status === 'ended',
                overlayKit: kit(),
                overlayDisplay: { hideScoresNearEnd: false },
                options: s.options.map((o) => ({ id: o.id, name: o.label, color: o.color, votes: o.votes, image: o.imageUrl }))
            },
            timerLeft: s.remainingSeconds,
            totalParticipants: s.totalParticipants
        });
        s.options = ranked.options;
        s.totalVotes = ranked.totalVotes;
        s.winners = ranked.winners;
        if (s.status === 'ending' || (s.remainingSeconds <= 10 && s.status === 'live')) s.status = s.remainingSeconds <= 0 ? 'ended' : 'ending';
        refreshPreview();
    }

    function testVote(index, amount) {
        if (useSim) {
            const s = simEnsure();
            const opt = s.options[index];
            if (!opt) return;
            opt.votes += amount;
            s.totalVotes += amount;
            s.totalParticipants += 1;
            rerankSim();
            return;
        }
        const vs = store();
        if (!vs || !vs.options[index]) return;
        if (typeof global.voteTestVote === 'function') global.voteTestVote(vs.options[index].id, amount);
        refreshPreview();
    }

    function testWinner() {
        if (useSim) {
            const s = simEnsure();
            s.status = 'ended';
            rerankSim();
            return;
        }
        const vs = store();
        if (!vs) return;
        vs.showResultScreen = true;
        vs.timerRunning = false;
        save();
        if (typeof global.renderVoteUI === 'function') global.renderVoteUI();
    }

    function resetSim() {
        simState = cloneMock();
        useSim = true;
        const tog = qs('voteOvUseSim');
        if (tog) tog.checked = true;
        refreshPreview();
    }

    function renderAll() {
        renderLayouts();
        renderThemes();
        renderOptionColors();
        renderPresets();
        syncForm();
        refreshPreview();
    }

    function mount() {
        const mountEl = qs('voteOvPreviewMount');
        if (!mountEl || !api()) return;
        if (engine) engine.destroy();
        engine = api().create(mountEl, { preview: true, appearance: kit() });
        setAspect(aspect);
        renderAll();
    }

    function boot() {
        if (booted || !qs('voteSec-overlay')) return;
        booted = true;
        bindControls();
        mount();
        qs('voteOvCopyUrl')?.addEventListener('click', () => {
            const extra = kit().accessKey ? { key: kit().accessKey } : {};
            if (typeof global.copyOverlayRouteLink === 'function') global.copyOverlayRouteLink('vote', extra, 'Vote Overlay');
        });
        qs('voteOvOpen')?.addEventListener('click', () => {
            const extra = kit().accessKey ? { key: kit().accessKey } : {};
            const url = typeof global.buildOverlayUrl === 'function' ? global.buildOverlayUrl('vote', extra) : '';
            if (url) window.open(url, '_blank');
        });
        qs('voteOvRefresh')?.addEventListener('click', () => {
            save();
            if (typeof global.showCustomMsg === 'function') global.showCustomMsg('success', 'รีเฟรช Overlay', 'ส่งสถานะล่าสุดไปยัง OBS แล้ว');
        });
        qs('voteOvRegenKey')?.addEventListener('click', () => {
            if (!confirm('สร้างคีย์ Overlay ใหม่? ลิงก์ OBS เดิมที่ผูกคีย์นี้จะใช้ไม่ได้')) return;
            kit().accessKey = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
            save();
            syncForm();
            if (typeof global.showCustomMsg === 'function') global.showCustomMsg('success', 'สร้างคีย์ใหม่แล้ว', 'คัดลอกลิงก์ OBS อีกครั้ง');
        });
        qs('voteOvSavePreset')?.addEventListener('click', () => {
            const name = prompt('ชื่อ Preset', 'Preset ใหม่');
            if (!name) return;
            kit().presets = kit().presets || [];
            kit().presets.push({ id: 'p_' + Date.now(), name, appearance: { ...kit() } });
            save(); renderPresets();
        });
        document.querySelectorAll('[data-ov-aspect]').forEach((b) => {
            b.addEventListener('click', () => setAspect(b.dataset.ovAspect));
        });
        qs('voteOvZoom')?.addEventListener('input', (e) => { zoom = Number(e.target.value) || 100; refreshPreview(); });
        qs('voteOvZoomReset')?.addEventListener('click', () => { zoom = 100; const z = qs('voteOvZoom'); if (z) z.value = 100; refreshPreview(); });
        qs('voteOvSafe')?.addEventListener('change', (e) => { showSafe = !!e.target.checked; refreshPreview(); });
        qs('voteOvUseSim')?.addEventListener('change', (e) => { useSim = !!e.target.checked; if (useSim) simEnsure(); refreshPreview(); });
        qs('voteOvSimRandom')?.addEventListener('click', () => {
            useSim = true; const tog = qs('voteOvUseSim'); if (tog) tog.checked = true;
            const s = simEnsure();
            s.options.forEach((o) => { o.votes += Math.floor(Math.random() * 80); });
            rerankSim();
        });
        qs('voteOvSim100')?.addEventListener('click', () => testVote(0, 100));
        qs('voteOvSimReset')?.addEventListener('click', resetSim);
        qs('voteOvSimEnd')?.addEventListener('click', testWinner);
        qs('voteOvTestWinner')?.addEventListener('click', testWinner);
        document.querySelectorAll('[data-sim-opt]').forEach((b) => {
            b.addEventListener('click', () => testVote(Number(b.dataset.simOpt), Number(b.dataset.amt) || 1));
        });
        qs('voteOvVisible')?.addEventListener('click', () => {
            if (typeof global.voteToggleOverlayVisible === 'function') global.voteToggleOverlayVisible();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else setTimeout(boot, 0);

    global.VoteOverlayStudio = {
        boot,
        mount,
        refresh: refreshPreview,
        renderAll,
        kit
    };
})(typeof window !== 'undefined' ? window : globalThis);
