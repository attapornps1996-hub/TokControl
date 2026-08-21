/**
 * Settings panel bindings — works locally or as remote control via sync.
 */
import { DANCE_MOVES, MOVE_IDS } from './dance-moves.js';
import { BACKGROUND_THEMES } from './background-themes.js';
import { CAMERA_SHOTS } from './camera-shots.js';
import { DEMO_DANCERS, avatarUrl } from './demo-data.js';
import { PALETTE_IDS, PALETTE_LABELS, PALETTE_SWATCH, PATTERN_IDS, PATTERN_LABELS, DYNAMIC_FX_IDS, DYNAMIC_FX_LABELS } from './light-catalog.js';
import { VENUES } from './venues.js';

const $ = (id) => document.getElementById(id);
const pct = (v) => Math.round(v * 100) + '%';

export function bindControlPanel(ctx) {
    const { sync, runtime, onToast, isConnected } = ctx;
    const remote = !!sync && !runtime;

    const toast = (t) => {
        if (onToast) onToast(t);
        else if (runtime) runtime.showToast(t);
    };

    const cmd = (command, ...args) => {
        if (remote) {
            sync.cmd(command, args);
            if (!isConnected?.()) {
                toast('⚠️ เปิดหน้าแสดงผลก่อน (ปุ่มด้านบน)');
            }
        } else if (runtime) {
            void runtime.applyCommand(command, args);
        }
    };

    let forcedMove = null;

    function bindRange(id, command, format) {
        const el = $(id);
        if (!el) return;
        const out = $(id + 'Val');
        el.addEventListener('input', () => {
            const v = Number(el.value);
            cmd(command, v);
            if (out && format) out.textContent = format(v);
        });
        if (out && format) out.textContent = format(Number(el.value));
    }

    /* ---- camera buttons ---- */
    function buildCameraButtons() {
        const grid = $('dcCamGrid');
        if (!grid) return;
        const make = (shot) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-cam-btn';
            btn.dataset.shot = shot.id;
            btn.title = shot.label;
            btn.innerHTML = `<span class="ico">${shot.icon || '🎥'}</span><span class="lbl">${shot.label}</span>`;
            btn.addEventListener('click', () => cmd('setShot', shot.id));
            return btn;
        };
        CAMERA_SHOTS
            .filter((shot) => !shot.free && !['topScreen', 'topScreenPush', 'stageYt'].includes(shot.id))
            .forEach((shot) => grid.appendChild(make(shot)));
    }

    function markPaletteActive(id) {
        document.querySelectorAll('#dcPalette [data-pal]').forEach((b) => {
            b.classList.toggle('active', b.dataset.pal === id);
        });
    }

    const PALETTE_SWATCH_LOCAL = PALETTE_SWATCH;

    function markPatternActive(id) {
        document.querySelectorAll('#dcPattern [data-pat]').forEach((b) => {
            b.classList.toggle('active', b.dataset.pat === id);
        });
    }

    function markDynamicFxActive(id) {
        document.querySelectorAll('#dcDynamicFx [data-dfx]').forEach((b) => {
            b.classList.toggle('active', b.dataset.dfx === id);
        });
    }

    function buildDynamicFxButtons() {
        const grid = $('dcDynamicFx');
        if (!grid) return;
        DYNAMIC_FX_IDS.forEach((id, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip' + (id === 'fadePulse' ? ' active' : '');
            btn.dataset.dfx = id;
            btn.style.setProperty('--chip', id === 'off' ? '#444' : '#ff2e97');
            btn.innerHTML = `<span class="sw"></span><span>${DYNAMIC_FX_LABELS[id] || id}</span>`;
            btn.addEventListener('click', () => {
                cmd('setDynamicFx', id);
                markDynamicFxActive(id);
            });
            grid.appendChild(btn);
        });
    }

    function buildPaletteButtons() {
        const grid = $('dcPalette');
        if (!grid) return;
        PALETTE_IDS.forEach((id, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip' + (i === 0 ? ' active' : '');
            btn.dataset.pal = id;
            btn.style.setProperty('--chip', PALETTE_SWATCH_LOCAL[id] || '#ff2e97');
            btn.innerHTML = `<span class="sw"></span><span>${PALETTE_LABELS[id] || id}</span>`;
            btn.addEventListener('click', () => {
                cmd('setPalette', id);
                markPaletteActive(id);
            });
            grid.appendChild(btn);
        });
    }

    function buildPatternButtons() {
        const grid = $('dcPattern');
        if (!grid) return;
        PATTERN_IDS.forEach((id, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip' + (i === 0 ? ' active' : '');
            btn.dataset.pat = id;
            btn.style.setProperty('--chip', '#6f4dff');
            btn.innerHTML = `<span class="sw"></span><span>${PATTERN_LABELS[id] || id}</span>`;
            btn.addEventListener('click', () => {
                cmd('setPattern', id);
                markPatternActive(id);
            });
            grid.appendChild(btn);
        });
    }

    async function sendVideoFile(file) {
        if (!file) return;
        if (file.size > 80 * 1024 * 1024) {
            toast('⚠️ ไฟล์ใหญ่เกินไป — แนะนำวิดีโอสั้นกว่า 80MB');
            return;
        }
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        cmd('setVideoBackdrop', dataUrl);
        toast('🎬 กำลังโหลดวิดีโอฉาก…');
    }

    function markVenueActive(id) {
        document.querySelectorAll('#dcVenueGrid [data-venue]').forEach((b) => {
            b.classList.toggle('active', b.dataset.venue === id);
        });
    }

    function markStageShapeActive(shape) {
        document.querySelectorAll('#dcStageShapeGrid [data-shape]').forEach((b) => {
            b.classList.toggle('active', b.dataset.shape === shape);
        });
    }

    function buildStageShapeButtons() {
        const grid = $('dcStageShapeGrid');
        if (!grid) return;
        const shapes = [
            { id: 'classic', label: 'Classic DJ', icon: '🎛️', swatch: '#2b2b40' },
            { id: 'concert', label: 'Concert Arch', icon: '🌈', swatch: '#ff66cc' },
        ];
        shapes.forEach((s, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip' + (i === 0 ? ' active' : '');
            btn.dataset.shape = s.id;
            btn.style.setProperty('--chip', s.swatch);
            btn.innerHTML = `<span class="sw"></span><span>${s.icon} ${s.label}</span>`;
            btn.addEventListener('click', () => {
                cmd('setStageShape', s.id);
                markStageShapeActive(s.id);
            });
            grid.appendChild(btn);
        });
    }

    function buildVenueButtons() {
        const grid = $('dcVenueGrid');
        if (!grid) return;
        VENUES.forEach((v, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip' + (i === 0 ? ' active' : '');
            btn.dataset.venue = v.id;
            btn.style.setProperty('--chip', v.fog || '#6f4dff');
            btn.innerHTML = `<span class="sw"></span><span>${v.label}</span>`;
            btn.addEventListener('click', () => {
                cmd('setVenue', v.id);
                markVenueActive(v.id);
            });
            grid.appendChild(btn);
        });
    }

    function buildBackgroundButtons() {
        const grid = $('dcBgGrid');
        if (!grid) return;
        BACKGROUND_THEMES.forEach((theme) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-bg-chip';
            btn.dataset.bg = theme.id;
            btn.style.setProperty('--chip', theme.tint);
            btn.innerHTML = `<span class="sw"></span><span>${theme.label}</span>`;
            btn.addEventListener('click', () => {
                cmd('setBackground', theme.id);
                markBackgroundActive(theme.id);
            });
            grid.appendChild(btn);
        });
    }

    function markBackgroundActive(id) {
        document.querySelectorAll('[data-bg]').forEach((b) => {
            b.classList.toggle('active', b.dataset.bg === id);
        });
    }

    function buildMoveButtons() {
        const grid = $('dcMoveGrid');
        if (!grid) return;
        const auto = document.createElement('button');
        auto.type = 'button';
        auto.className = 'dc-move-chip active';
        auto.dataset.move = '__auto';
        auto.textContent = 'สุ่มตามบีท';
        auto.addEventListener('click', () => {
            forcedMove = null;
            cmd('forceMove', null);
            markMoveActive('__auto');
        });
        grid.appendChild(auto);
        MOVE_IDS.filter((id) => id !== 'hype').forEach((id) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dc-move-chip';
            btn.dataset.move = id;
            btn.textContent = DANCE_MOVES[id].label;
            btn.addEventListener('click', () => {
                forcedMove = id;
                cmd('forceMove', id);
                markMoveActive(id);
            });
            grid.appendChild(btn);
        });
    }

    function markMoveActive(id) {
        document.querySelectorAll('[data-move]').forEach((b) => {
            b.classList.toggle('active', b.dataset.move === id);
        });
    }

    function selectDancer(id) {
        cmd('selectDancer', id);
        markRosterActive(id);
    }

    function buildRoster() {
        const el = $('dcRoster');
        if (!el) return;
        el.innerHTML = '';
        DEMO_DANCERS.forEach((p) => {
            const av = p.avatar || avatarUrl(p.seed);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'dc-dancer';
            card.dataset.dancer = p.id;
            card.style.setProperty('--dc-accent', p.color);
            card.innerHTML = `<img src="${av}" alt="${p.name}" loading="lazy"><span class="nm">${p.name}</span>`;
            card.addEventListener('click', () => selectDancer(p.id));
            el.appendChild(card);
        });
    }

    function markRosterActive(id) {
        document.querySelectorAll('[data-dancer]').forEach((b) => {
            b.classList.toggle('active', b.dataset.dancer === id);
        });
    }

    function setDrawerPanel(id) {
        document.querySelectorAll('.dc-panel-section').forEach((p) => {
            p.classList.toggle('active', p.dataset.panel === id);
        });
        document.querySelectorAll('#dcDrawerTabs [data-panel]').forEach((b) => {
            b.classList.toggle('active', b.dataset.panel === id);
        });
    }

    /* ---- wire static controls ---- */
    $('dcDrawerTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-panel]');
        if (!btn) return;
        setDrawerPanel(btn.dataset.panel);
    });

    $('dcSourceTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-src]');
        if (!btn) return;
        $('dcSourceTabs').querySelectorAll('.dc-tab').forEach((t) => t.classList.toggle('active', t === btn));
        document.querySelectorAll('[data-body]').forEach((b) => {
            b.hidden = b.dataset.body !== btn.dataset.src;
        });
    });

    $('dcBtnMusic')?.addEventListener('click', () => cmd('toggleMusic'));
    $('dcBtnMic')?.addEventListener('click', () => cmd('startMic').then?.(() => toast('🎙️ เริ่มฟังไมค์ที่หน้าแสดงผล')));

    $('dcAudioFile')?.addEventListener('change', async (e) => {
        if (remote) return;
        const file = e.target.files?.[0];
        if (!file || !runtime) return;
        try {
            await runtime.audio.loadFile(file);
            toast('🎵 กำลังเล่น: ' + file.name);
        } catch { toast('❌ เล่นไฟล์นี้ไม่ได้'); }
    });

    $('dcBtnPickFile')?.addEventListener('click', () => {
        if (remote) cmd('pickFile');
        else $('dcAudioFile')?.click();
    });

    function renderQueueList(queue) {
        const el = $('dcQueueList');
        if (!el) return;
        const items = queue?.items || [];
        if (!items.length) {
            el.innerHTML = '<div class="dc-hint">ยังไม่มีเพลงในคิว</div>';
            return;
        }
        el.innerHTML = items.map((it, i) => `
            <div class="dc-queue-item${it.active ? ' active' : ''}" data-qi="${i}" data-qid="${it.id}">
                <button type="button" class="dc-queue-play" data-qi="${i}">${it.active ? '▶' : '○'} ${i + 1}. ${it.name}</button>
                <button type="button" class="dc-queue-rm" data-qid="${it.id}" title="ลบ">✕</button>
            </div>
        `).join('');
    }

    $('dcBtnQueueAdd')?.addEventListener('click', () => {
        if (remote) {
            cmd('pickQueueAdd');
            toast('➕ เลือกไฟล์ที่หน้าแสดงผลเพื่อเพิ่มเข้าคิว');
        } else $('dcAudioQueue')?.click();
    });
    $('dcAudioQueue')?.addEventListener('change', async (e) => {
        if (remote) return;
        const files = e.target.files;
        e.target.value = '';
        if (!files?.length || !runtime) return;
        await runtime.audio.enqueueFiles(files);
        renderQueueList(runtime.audio.getQueue());
        toast(`➕ เพิ่ม ${files.length} เพลงเข้าคิว`);
    });
    $('dcQueueNext')?.addEventListener('click', () => cmd('queueNext'));
    $('dcQueuePrev')?.addEventListener('click', () => cmd('queuePrev'));
    $('dcQueueClear')?.addEventListener('click', () => {
        cmd('queueClear');
        renderQueueList({ items: [] });
    });
    $('dcQueueList')?.addEventListener('click', (e) => {
        const rm = e.target.closest('.dc-queue-rm');
        if (rm) {
            cmd('queueRemove', rm.dataset.qid);
            return;
        }
        const play = e.target.closest('.dc-queue-play');
        if (play) cmd('queuePlay', Number(play.dataset.qi));
    });

    async function loadYouTubeFromInput() {
        const url = $('dcYtUrl')?.value?.trim();
        if (!url) return toast('วางลิงก์ YouTube ก่อนนะ');
        try {
            if (remote) {
                cmd('loadYoutube', url);
                toast('▶ ส่งคำสั่งโหลด YouTube ไปหน้าแสดงผลแล้ว');
            } else if (runtime) {
                const box = $('dcYtBox');
                if (box) box.hidden = false;
                await runtime.audio.loadYouTube(url, $('ytMount'));
                toast('▶ YouTube เริ่มเล่น');
            }
        } catch (err) {
            toast('❌ ' + (err.message || 'โหลด YouTube ไม่ได้'));
        }
    }
    $('dcYtLoad')?.addEventListener('click', loadYouTubeFromInput);
    $('dcYtUrl')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadYouTubeFromInput(); });

    const bpmSlider = $('dcBpm');
    bpmSlider?.addEventListener('input', () => {
        const v = Number(bpmSlider.value);
        cmd('setBpm', v);
        const out = $('dcBpmVal');
        if (out) out.textContent = v;
    });
    $('dcBtnTap')?.addEventListener('click', () => {
        if (remote) { cmd('tapTempo'); toast('🥁 ส่ง Tap ไปหน้าแสดงผล'); }
        else if (runtime) {
            const bpm = runtime.audio.tapTempo();
            if (bpm) {
                if (bpmSlider) bpmSlider.value = bpm;
                $('dcBpmVal').textContent = bpm;
                $('dcBpmLock').checked = true;
                toast(`🥁 ${bpm} BPM`);
            } else toast('🥁 แตะตามจังหวะต่อไป...');
        }
    });
    $('dcBtnResync')?.addEventListener('click', () => { cmd('resyncClock'); toast('⟳ รีซิงก์จังหวะ'); });
    $('dcBpmLock')?.addEventListener('change', (e) => cmd('setBpmLocked', e.target.checked));

    $('dcBeatDiv')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-div]');
        if (!btn) return;
        cmd('setBeatDivision', Number(btn.dataset.div));
        btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    });

    bindRange('dcVolume', 'setVolume');
    bindRange('dcSens', 'setSensitivity', (v) => v.toFixed(1));
    bindRange('dcStrongBeat', 'setStrongBeatThreshold', (v) => Math.round(v * 100) + '%');
    bindRange('dcLightIntensity', 'setLightIntensity', pct);
    bindRange('dcBeatReact', 'setBeatReact', pct);
    bindRange('dcBgReact', 'setBgReactivity', pct);
    bindRange('dcShake', 'setBeatShake', pct);

    function markReactiveMode(cat, mode) {
        document.querySelectorAll(`[data-reactive="${cat}"] [data-mode]`).forEach((b) => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
    }

    function wireReactiveModeSegs() {
        document.querySelectorAll('.dc-mode-seg[data-reactive]').forEach((seg) => {
            seg.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-mode]');
                if (!btn || !seg.contains(btn)) return;
                const cat = seg.dataset.reactive;
                const mode = btn.dataset.mode;
                if (cat === 'camera') {
                    cmd('setBeatCutMode', mode);
                    if (mode === 'beats') {
                        $('dcAutoCut') && ($('dcAutoCut').checked = true);
                        cmd('setAutoCut', true, Number($('dcCutBars')?.value) || 16);
                    }
                } else {
                    cmd('setReactiveMode', cat, mode);
                    if (cat === 'palette' && mode === 'beats') {
                        $('dcAutoPalette') && ($('dcAutoPalette').checked = true);
                        cmd('setPaletteAuto', true, Number($('dcPalBars')?.value) || 8);
                    }
                    if (cat === 'pattern' && mode === 'beats') {
                        $('dcAutoPattern') && ($('dcAutoPattern').checked = true);
                        cmd('setPatternAuto', true, Number($('dcPatBars')?.value) || 12);
                    }
                    if (cat === 'background' && mode === 'beats') {
                        $('dcBgAuto') && ($('dcBgAuto').checked = true);
                        cmd('setBgAutoCycle', true, Number($('dcBgBars')?.value) || 16);
                    }
                    if (cat === 'dynamicFx' && mode === 'beats') {
                        $('dcAutoDynamicFx') && ($('dcAutoDynamicFx').checked = true);
                        cmd('setDynamicFxAuto', true, Number($('dcDfxBars')?.value) || 8);
                    }
                }
                markReactiveMode(cat, mode);
            });
        });
    }

    let pendingBrandLogo = '';
    const BRAND_STORE = 'dc_booth_brand_v1';

    function saveBrandState(text, logo) {
        try { localStorage.setItem(BRAND_STORE, JSON.stringify({ text, logo })); } catch { /* ignore */ }
    }

    function loadBrandState() {
        try { return JSON.parse(localStorage.getItem(BRAND_STORE) || '{}'); } catch { return {}; }
    }

    async function applyBrand() {
        const text = $('dcBrandText')?.value?.trim() || '';
        cmd('setBoothBrand', text, pendingBrandLogo);
        saveBrandState(text, pendingBrandLogo);
        toast('🏷️ อัปเดตชื่อ/โลโก้บนแท่น DJ');
    }

    $('dcBrandText')?.addEventListener('input', () => {
        saveBrandState($('dcBrandText')?.value || '', pendingBrandLogo);
    });
    $('dcBrandText')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyBrand();
        }
    });

    $('dcBrandApply')?.addEventListener('click', applyBrand);
    $('dcBrandClear')?.addEventListener('click', () => {
        if ($('dcBrandText')) $('dcBrandText').value = '';
        pendingBrandLogo = '';
        cmd('setBoothBrand', '', '');
        saveBrandState('', '');
        toast('ล้างชื่อ/โลโก้แล้ว');
    });
    $('dcBrandPickLogo')?.addEventListener('click', () => $('dcBrandLogoFile')?.click());
    $('dcBrandLogoFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        pendingBrandLogo = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        applyBrand();
    });

    const savedBrand = loadBrandState();
    if (savedBrand.text && $('dcBrandText')) $('dcBrandText').value = savedBrand.text;
    if (savedBrand.logo) pendingBrandLogo = savedBrand.logo;
    if (savedBrand.text || savedBrand.logo) applyBrand();

    $('dcStrobe')?.addEventListener('change', (e) => cmd('setStrobe', e.target.checked));
    $('dcLasers')?.addEventListener('change', (e) => cmd('setLasers', e.target.checked));
    $('dcBeams')?.addEventListener('change', (e) => cmd('setBeams', e.target.checked));
    $('dcSmokeEnable')?.addEventListener('change', (e) => cmd('setSmokeEnabled', e.target.checked));
    $('dcSmokeOnSong')?.addEventListener('change', (e) => cmd('setSmokeOnSongChange', e.target.checked));
    $('dcVenueNext')?.addEventListener('click', () => cmd('nextVenue'));
    $('dcVenueAuto')?.addEventListener('change', (e) => {
        cmd('setVenueAuto', e.target.checked, Number($('dcVenueBars')?.value) || 32);
    });
    $('dcVenueBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        if ($('dcVenueBarsVal')) $('dcVenueBarsVal').textContent = v;
        if ($('dcVenueAuto')?.checked) cmd('setVenueAuto', true, v);
    });

    $('dcAutoPalette')?.addEventListener('change', (e) => {
        cmd('setPaletteAuto', e.target.checked, Number($('dcPalBars')?.value) || 8);
    });
    $('dcPalBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        $('dcPalBarsVal').textContent = v;
        if ($('dcAutoPalette')?.checked) cmd('setPaletteAuto', true, v);
    });
    $('dcPalNext')?.addEventListener('click', () => cmd('nextPalette'));

    $('dcAutoPattern')?.addEventListener('change', (e) => {
        cmd('setPatternAuto', e.target.checked, Number($('dcPatBars')?.value) || 4);
    });
    $('dcPatBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        $('dcPatBarsVal').textContent = v;
        if ($('dcAutoPattern')?.checked) cmd('setPatternAuto', true, v);
    });
    $('dcPatNext')?.addEventListener('click', () => cmd('nextPattern'));

    $('dcAutoDynamicFx')?.addEventListener('change', (e) => {
        cmd('setDynamicFxAuto', e.target.checked, Number($('dcDfxBars')?.value) || 8);
    });
    $('dcDfxBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        if ($('dcDfxBarsVal')) $('dcDfxBarsVal').textContent = v;
        if ($('dcAutoDynamicFx')?.checked) cmd('setDynamicFxAuto', true, v);
    });
    $('dcDfxNext')?.addEventListener('click', () => cmd('nextDynamicFx'));

    $('dcBgAuto')?.addEventListener('change', (e) => {
        cmd('setBgAutoCycle', e.target.checked, Number($('dcBgBars')?.value) || 16);
    });
    $('dcBgBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        $('dcBgBarsVal').textContent = v;
        if ($('dcBgAuto')?.checked) cmd('setBgAutoCycle', true, v);
    });
    $('dcBgNext')?.addEventListener('click', () => cmd('nextBackground'));

    $('dcBtnPickVideo')?.addEventListener('click', () => {
        if (remote) $('dcVideoFile')?.click();
        else cmd('pickVideoBackdrop');
    });
    $('dcVideoFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (remote) await sendVideoFile(file);
        else {
            const url = URL.createObjectURL(file);
            cmd('setVideoBackdrop', url);
        }
    });
    $('dcBtnClearVideo')?.addEventListener('click', () => cmd('clearVideoBackdrop'));

    $('dcAutoCut')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            markReactiveMode('camera', 'beats');
            cmd('setBeatCutMode', 'beats');
        }
        cmd('setAutoCut', e.target.checked, Number($('dcCutBars')?.value) || 16);
    });
    $('dcBeatShakeEnable')?.addEventListener('change', (e) => cmd('setBeatShakeEnabled', e.target.checked));
    $('dcCameraStabilize')?.addEventListener('change', (e) => {
        const on = e.target.checked;
        cmd('setCameraStabilized', on);
        if (on && $('dcBeatShakeEnable')) {
            $('dcBeatShakeEnable').checked = false;
            cmd('setBeatShakeEnabled', false);
        }
    });

    function readStageYtLightMask() {
        return {
            movingHeads: !!$('dcYtMaskHeads')?.checked,
            washes: !!$('dcYtMaskWashes')?.checked,
            strobes: !!$('dcYtMaskStrobes')?.checked,
            lasers: !!$('dcYtMaskLasers')?.checked,
            beams: !!$('dcYtMaskBeams')?.checked,
            ledWall: false,
            ledFloor: !!$('dcYtMaskFloor')?.checked
        };
    }

    function getStageYtLightPreset() {
        return document.querySelector('#dcYtLightPreset [data-yt-preset].active')?.dataset.ytPreset || 'screen';
    }

    function buildStageYtLightOpts() {
        const preset = getStageYtLightPreset();
        if (preset === 'custom') return { preset: 'custom', mask: readStageYtLightMask() };
        return { preset };
    }

    $('dcYtLightPreset')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-yt-preset]');
        if (!btn) return;
        btn.parentElement.querySelectorAll('[data-yt-preset]').forEach((b) => b.classList.toggle('active', b === btn));
        const grid = $('dcYtLightGrid');
        if (grid) grid.style.display = btn.dataset.ytPreset === 'custom' ? 'grid' : 'none';
        const preset = btn.dataset.ytPreset;
        if (preset === 'custom') {
            cmd('setStageYoutubeLightPreset', 'custom', readStageYtLightMask());
        } else {
            cmd('setStageYoutubeLightPreset', preset);
        }
    });

    async function sendStageLocalVideo(file) {
        if (!file) return;
        if (file.size > 120 * 1024 * 1024) {
            toast('⚠️ ไฟล์ใหญ่เกินไป — แนะนำน้อยกว่า 120MB');
            return;
        }
        toast('🎬 กำลังโหลดวิดีโอขึ้นจอเวที…');
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        cmd('setStageLocalVideo', dataUrl, buildStageYtLightOpts());
    }

    $('dcStageYtLoad')?.addEventListener('click', () => {
        const url = $('dcStageYtUrl')?.value?.trim();
        if (!url) {
            toast('ใส่ลิงก์ YouTube ก่อน');
            return;
        }
        cmd('setStageYoutube', url, buildStageYtLightOpts());
    });
    $('dcStageLocalPick')?.addEventListener('click', () => $('dcStageLocalFile')?.click());
    $('dcStageLocalFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (remote) await sendStageLocalVideo(file);
        else {
            const url = URL.createObjectURL(file);
            cmd('setStageLocalVideo', url, buildStageYtLightOpts());
        }
    });
    $('dcStageYtClear')?.addEventListener('click', () => cmd('clearStageYoutube'));

    document.querySelectorAll('#dcYtLightGrid input').forEach((el) => {
        el.addEventListener('change', () => {
            if (getStageYtLightPreset() === 'custom') {
                cmd('setStageYoutubeLightMask', readStageYtLightMask());
            }
        });
    });

    if ($('dcYtLightGrid')) $('dcYtLightGrid').style.display = 'none';
    $('dcCutBars')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        $('dcCutBarsVal').textContent = v;
        const camMode = document.querySelector('[data-reactive="camera"] [data-mode].active')?.dataset.mode;
        if (camMode === 'beats' || $('dcAutoCut')?.checked) {
            cmd('setAutoCut', true, v);
        }
    });

    $('dcBtnGift')?.addEventListener('click', () => cmd('mockGift'));
    $('dcBtnFocus')?.addEventListener('click', () => cmd('focusSelected'));
    $('dcNameTags')?.addEventListener('change', (e) => cmd('setNameTags', e.target.checked));
    $('dcFaceMode')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-face]');
        if (!btn) return;
        cmd('setFaceMode', btn.dataset.face);
        btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    });

    buildCameraButtons();
    buildBackgroundButtons();
    buildPaletteButtons();
    buildPatternButtons();
    buildDynamicFxButtons();
    buildVenueButtons();
    buildStageShapeButtons();
    wireReactiveModeSegs();
    buildMoveButtons();
    buildRoster();
    setDrawerPanel('music');

    function applyRemoteState(state) {
        if (!state) return;
        if (state.bpm && bpmSlider) {
            bpmSlider.value = state.bpm;
            $('dcBpmVal').textContent = state.bpm;
        }
        if (state.selectedDancer) markRosterActive(state.selectedDancer);
        if (state.background) markBackgroundActive(state.background);
        if (state.palette) markPaletteActive(state.palette);
        if (state.pattern) markPatternActive(state.pattern);
        if (state.dynamicFx) markDynamicFxActive(state.dynamicFx);
        if (state.autoDynamicFx != null && $('dcAutoDynamicFx')) {
            $('dcAutoDynamicFx').checked = !!state.autoDynamicFx;
        }
        if (state.reactiveModes) {
            Object.entries(state.reactiveModes).forEach(([k, v]) => markReactiveMode(k, v));
        }
        if (state.beatCutMode) markReactiveMode('camera', state.beatCutMode);
        if (state.brandText != null && $('dcBrandText') && document.activeElement !== $('dcBrandText')) {
            $('dcBrandText').value = state.brandText;
        }
        if (state.beatShakeEnabled != null && $('dcBeatShakeEnable')) $('dcBeatShakeEnable').checked = !!state.beatShakeEnabled;
        if (state.cameraStabilized != null && $('dcCameraStabilize')) $('dcCameraStabilize').checked = !!state.cameraStabilized;
        if (state.lightMask) {
            const m = state.lightMask;
            if ($('dcYtMaskHeads')) $('dcYtMaskHeads').checked = m.movingHeads !== false;
            if ($('dcYtMaskWashes')) $('dcYtMaskWashes').checked = !!m.washes;
            if ($('dcYtMaskStrobes')) $('dcYtMaskStrobes').checked = !!m.strobes;
            if ($('dcYtMaskLasers')) $('dcYtMaskLasers').checked = !!m.lasers;
            if ($('dcYtMaskBeams')) $('dcYtMaskBeams').checked = !!m.beams;
            if ($('dcYtMaskFloor')) $('dcYtMaskFloor').checked = !!m.ledFloor;
        }
        if (state.stageYoutube?.videoId && $('dcStageYtUrl') && !document.activeElement?.matches('#dcStageYtUrl')) {
            $('dcStageYtUrl').value = `https://www.youtube.com/watch?v=${state.stageYoutube.videoId}`;
        }
        if (state.smokeEnabled != null && $('dcSmokeEnable')) $('dcSmokeEnable').checked = !!state.smokeEnabled;
        if (state.smokeOnSongChange != null && $('dcSmokeOnSong')) $('dcSmokeOnSong').checked = !!state.smokeOnSongChange;
        if (state.venue) markVenueActive(state.venue);
        if (state.stageShape) markStageShapeActive(state.stageShape);
        if (state.venueAuto != null && $('dcVenueAuto')) $('dcVenueAuto').checked = !!state.venueAuto;
        if (state.queue) renderQueueList(state.queue);
        if (state.shot) {
            document.querySelectorAll('[data-shot]').forEach((b) => {
                b.classList.toggle('active', b.dataset.shot === state.shot);
            });
        }
        const conn = $('dcConnStatus');
        if (conn) {
            conn.textContent = 'เชื่อมต่อหน้าแสดงผลแล้ว';
            conn.classList.add('on');
        }
        const pill = $('dcRemotePill');
        if (pill) {
            pill.classList.toggle('on', !!state.playing);
            pill.querySelector('.label').textContent = state.playing ? state.audioLabel : 'หยุดอยู่';
        }
    }

    return { applyRemoteState, markBackgroundActive, markRosterActive };
}
