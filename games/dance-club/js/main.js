/**
 * Dance Club — entry point. Wires scene, camera director, dancers, audio and HUD.
 */
import { createDanceScene } from './scene.js';
import { createCameraController, CAMERA_SHOTS } from './camera.js';
import { spawnDancers } from './character.js';
import { DANCE_MOVES, MOVE_IDS } from './dance-moves.js';
import { createAudioEngine } from './audio.js';
import { createGiftFocusSystem, attachGiftApi } from './gift-focus.js';
import { DEMO_DANCERS, avatarUrl } from './demo-data.js';
import { BACKGROUND_THEMES } from './backgrounds.js';

const params = new URLSearchParams(location.search);
const isOverlay = params.get('overlay') === '1';

const $ = (id) => document.getElementById(id);
const viewport = $('dcViewport');

if (isOverlay) document.body.classList.add('dc-overlay-mode');

/* ------------------------------------------------------------------ *
 * Core systems
 * ------------------------------------------------------------------ */
const sceneApi = createDanceScene(viewport, {
    palette: params.get('palette') || 'neon',
    background: params.get('bg') || 'retrowave'
});

const cameraCtrl = createCameraController(sceneApi.camera, sceneApi.renderer.domElement);

const profiles = DEMO_DANCERS.map((d) => ({ ...d, avatar: d.avatar || avatarUrl(d.seed) }));
const dancers = spawnDancers(sceneApi.scene, profiles, {
    radius: 6.6,
    perRow: 6,
    camera: sceneApi.camera
});
cameraCtrl.setDancers(dancers);

const audio = createAudioEngine({ bpm: Number(params.get('bpm')) || 128 });

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */
let toastTimer = null;
function showToast(text) {
    const el = $('dcToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

const giftSystem = createGiftFocusSystem({
    cameraCtrl,
    dancers,
    sceneApi,
    onToast: showToast
});
attachGiftApi(giftSystem);

/* ------------------------------------------------------------------ *
 * HUD: camera buttons (top strip + panel grid)
 * ------------------------------------------------------------------ */
function buildCameraButtons() {
    const strip = $('dcCamStrip');
    const grid = $('dcCamGrid');
    const make = (shot, compact) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = compact ? 'dc-cam-chip' : 'dc-cam-btn';
        btn.dataset.shot = shot.id;
        btn.title = shot.label;
        btn.innerHTML = compact
            ? `<span>${shot.icon || '🎥'}</span>`
            : `<span class="ico">${shot.icon || '🎥'}</span><span class="lbl">${shot.label}</span>`;
        btn.addEventListener('click', () => cameraCtrl.setShot(shot.id));
        return btn;
    };
    CAMERA_SHOTS.forEach((shot) => {
        if (strip) strip.appendChild(make(shot, true));
        if (grid) grid.appendChild(make(shot, false));
    });

    cameraCtrl.onShotChange((id) => {
        document.querySelectorAll('[data-shot]').forEach((b) => {
            b.classList.toggle('active', b.dataset.shot === id);
        });
    });
}
buildCameraButtons();
cameraCtrl.setShot('wide', { instant: true });

/* ------------------------------------------------------------------ *
 * HUD: background swatches
 * ------------------------------------------------------------------ */
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
            sceneApi.background.setTheme(theme.id);
            markBackgroundActive(theme.id);
        });
        grid.appendChild(btn);
    });
    markBackgroundActive(sceneApi.background.currentTheme().id);
}
function markBackgroundActive(id) {
    document.querySelectorAll('[data-bg]').forEach((b) => {
        b.classList.toggle('active', b.dataset.bg === id);
    });
}
buildBackgroundButtons();

/* ------------------------------------------------------------------ *
 * HUD: dance move buttons
 * ------------------------------------------------------------------ */
let forcedMove = null;
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
        dancers.forEach((d) => { d.moveLockedBy = null; d.setForcedMove(null); });
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
            dancers.forEach((d) => {
                d.moveLockedBy = null;
                d.setForcedMove(id);
            });
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
buildMoveButtons();

/* ------------------------------------------------------------------ *
 * HUD: roster (full list in drawer + compact dock chips)
 * ------------------------------------------------------------------ */
function selectDancer(id) {
    giftSystem.setSelected(id);
    markRosterActive(id);
}

function buildRoster() {
    const el = $('dcRoster');
    const dock = $('dcDockRoster');
    if (el) el.innerHTML = '';
    if (dock) dock.innerHTML = '';

    profiles.forEach((p) => {
        if (el) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'dc-dancer';
            card.dataset.dancer = p.id;
            card.style.setProperty('--dc-accent', p.color);
            card.innerHTML = `
                <img src="${p.avatar}" alt="${p.name}" loading="lazy">
                <span class="nm">${p.name}</span>
            `;
            card.addEventListener('click', () => selectDancer(p.id));
            el.appendChild(card);
        }
        if (dock) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'dc-dock-chip';
            chip.dataset.dancer = p.id;
            chip.title = p.name;
            chip.innerHTML = `<img src="${p.avatar}" alt="${p.name}" loading="lazy">`;
            chip.addEventListener('click', () => selectDancer(p.id));
            dock.appendChild(chip);
        }
    });
    markRosterActive(giftSystem.getSelected());
}

function markRosterActive(id) {
    document.querySelectorAll('[data-dancer]').forEach((b) => {
        b.classList.toggle('active', b.dataset.dancer === id);
    });
}
buildRoster();

/* ------------------------------------------------------------------ *
 * HUD: drawer (slide-up, one tab at a time)
 * ------------------------------------------------------------------ */
function setDrawerOpen(open) {
    document.body.classList.toggle('dc-drawer-open', !!open);
    const btn = $('dcDrawerToggle');
    if (btn) btn.textContent = open ? '✕ ปิด' : '🎛️';
}

function setDrawerPanel(id) {
    document.querySelectorAll('.dc-panel-section').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === id);
    });
    document.querySelectorAll('#dcDrawerTabs [data-panel]').forEach((b) => {
        b.classList.toggle('active', b.dataset.panel === id);
    });
}

function toggleDrawer(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('dc-drawer-open');
    setDrawerOpen(open);
}

$('dcDrawerToggle')?.addEventListener('click', () => toggleDrawer());
$('dcDrawerClose')?.addEventListener('click', () => toggleDrawer(false));
$('dcDrawerTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-panel]');
    if (!btn) return;
    setDrawerPanel(btn.dataset.panel);
    if (!document.body.classList.contains('dc-drawer-open')) toggleDrawer(true);
});

// Quick dock shortcuts
function toggleMusic() {
    const st = audio.getStatus();
    if (st.playing && (st.mode === 'procedural' || st.mode === 'file' || st.mode === 'mic')) {
        if (st.mode === 'procedural') audio.stop();
        else audio.togglePlay();
    } else if (st.mode === 'youtube') {
        audio.togglePlay();
    } else {
        audio.startProcedural();
    }
}

function updateDockPlayBtn() {
    const btn = $('dcDockPlay');
    if (!btn) return;
    const playing = audio.getStatus().playing;
    btn.textContent = playing ? '⏸' : '▶';
    btn.title = playing ? 'หยุดเพลง' : 'เล่นเพลง';
}

$('dcDockPlay')?.addEventListener('click', toggleMusic);
$('dcDockGift')?.addEventListener('click', () => giftSystem.mockRandomGift());
$('dcDockFocus')?.addEventListener('click', () => {
    const id = giftSystem.getSelected();
    const d = dancers.find((x) => x.profile.id === id);
    if (d) cameraCtrl.focusOn(() => d.getWorldFocusPoint(), { duration: 4 });
});

/* ------------------------------------------------------------------ *
 * HUD: music source tabs
 * ------------------------------------------------------------------ */
function bindSourceTabs() {
    const tabs = $('dcSourceTabs');
    if (!tabs) return;
    tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-src]');
        if (!btn) return;
        tabs.querySelectorAll('.dc-tab').forEach((t) => t.classList.toggle('active', t === btn));
        document.querySelectorAll('[data-body]').forEach((b) => {
            b.hidden = b.dataset.body !== btn.dataset.src;
        });
    });
}
bindSourceTabs();

/* ------------------------------------------------------------------ *
 * HUD: bindings
 * ------------------------------------------------------------------ */
const bindRange = (id, fn, format) => {
    const el = $(id);
    if (!el) return;
    const out = $(id + 'Val');
    const apply = () => {
        const v = Number(el.value);
        fn(v);
        if (out && format) out.textContent = format(v);
    };
    el.addEventListener('input', apply);
    apply();
};

const pct = (v) => Math.round(v * 100) + '%';

// Music (drawer panel — dock uses toggleMusic)
$('dcBtnMusic')?.addEventListener('click', toggleMusic);

$('dcAudioFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        await audio.loadFile(file);
        showToast('🎵 กำลังเล่น: ' + file.name);
    } catch (err) {
        showToast('❌ เล่นไฟล์นี้ไม่ได้');
        console.error(err);
    }
});

$('dcBtnMic')?.addEventListener('click', async () => {
    try {
        await audio.startMic();
        showToast('🎙️ กำลังฟังไมค์');
    } catch (err) {
        showToast('❌ เข้าถึงไมค์ไม่ได้');
        console.error(err);
    }
});

async function loadYouTubeFromInput() {
    const url = $('dcYtUrl')?.value?.trim();
    if (!url) return showToast('วางลิงก์ YouTube ก่อนนะ');
    const box = $('dcYtBox');
    if (box) box.hidden = false;
    try {
        await audio.loadYouTube(url, $('ytMount'));
        showToast('▶ YouTube เริ่มเล่น · ซิงก์ภาพด้วย BPM (กด Tap ให้ตรงจังหวะ)');
    } catch (err) {
        showToast('❌ ' + (err.message || 'โหลด YouTube ไม่ได้'));
        console.error(err);
    }
}
$('dcYtLoad')?.addEventListener('click', loadYouTubeFromInput);
$('dcYtUrl')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadYouTubeFromInput();
});
$('dcYtClose')?.addEventListener('click', () => {
    const box = $('dcYtBox');
    if (box) box.hidden = true;
});
$('dcYtToggleSize')?.addEventListener('click', () => {
    $('dcYtBox')?.classList.toggle('mini');
});

bindRange('dcVolume', (v) => audio.setVolume(v));
bindRange('dcSens', (v) => audio.setSensitivity(v), (v) => v.toFixed(1));

const bpmSlider = $('dcBpm');
bpmSlider?.addEventListener('input', () => {
    const v = Number(bpmSlider.value);
    audio.setBpm(v);
    const out = $('dcBpmVal');
    if (out) out.textContent = v;
});
$('dcBtnTap')?.addEventListener('click', () => {
    const bpm = audio.tapTempo();
    if (bpm) {
        if (bpmSlider) bpmSlider.value = bpm;
        const out = $('dcBpmVal');
        if (out) out.textContent = bpm;
        const lock = $('dcBpmLock');
        if (lock) lock.checked = true;
        showToast(`🥁 ${bpm} BPM`);
    } else {
        showToast('🥁 แตะตามจังหวะต่อไป...');
    }
});
$('dcBtnResync')?.addEventListener('click', () => {
    audio.resyncClock();
    showToast('⟳ รีซิงก์จังหวะแล้ว');
});
$('dcBpmLock')?.addEventListener('change', (e) => audio.setBpmLocked(e.target.checked));

$('dcBeatDiv')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-div]');
    if (!btn) return;
    audio.setBeatDivision(Number(btn.dataset.div));
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});

// Lights
$('dcPalette')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pal]');
    if (!btn) return;
    sceneApi.setPalette(btn.dataset.pal);
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});
$('dcPattern')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pat]');
    if (!btn) return;
    sceneApi.setPattern(btn.dataset.pat);
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});
bindRange('dcLightIntensity', (v) => { sceneApi.rig.intensity = v; }, pct);
bindRange('dcBeatReact', (v) => { sceneApi.rig.beatReact = v; }, pct);
$('dcStrobe')?.addEventListener('change', (e) => { sceneApi.rig.strobeEnabled = e.target.checked; });
$('dcLasers')?.addEventListener('change', (e) => { sceneApi.rig.lasersEnabled = e.target.checked; });
$('dcBeams')?.addEventListener('change', (e) => { sceneApi.rig.beamsEnabled = e.target.checked; });

// Background
bindRange('dcBgReact', (v) => sceneApi.background.setReactivity(v), pct);
$('dcBgAuto')?.addEventListener('change', (e) => {
    sceneApi.background.setAutoCycle(e.target.checked, Number($('dcBgBars')?.value) || 8);
    showToast(e.target.checked ? '🌌 พื้นหลังจะเปลี่ยนอัตโนมัติ' : '🌌 ปิดการเปลี่ยนอัตโนมัติ');
});
$('dcBgBars')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    const out = $('dcBgBarsVal');
    if (out) out.textContent = v;
    if ($('dcBgAuto')?.checked) sceneApi.background.setAutoCycle(true, v);
});
$('dcBgNext')?.addEventListener('click', () => {
    const theme = sceneApi.background.nextTheme();
    markBackgroundActive(theme.id);
});

// Camera
$('dcAutoCut')?.addEventListener('change', (e) => {
    cameraCtrl.setAutoCut(e.target.checked, Number($('dcCutBars')?.value) || 4);
    showToast(e.target.checked ? '🎬 ตัดมุมอัตโนมัติเปิด' : '🎬 ตัดมุมอัตโนมัติปิด');
});
$('dcCutBars')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    const out = $('dcCutBarsVal');
    if (out) out.textContent = v;
    if ($('dcAutoCut')?.checked) cameraCtrl.setAutoCut(true, v);
});
bindRange('dcShake', (v) => cameraCtrl.setBeatShake(v), pct);

// Dancers
$('dcBtnGift')?.addEventListener('click', () => giftSystem.mockRandomGift());
$('dcBtnFocus')?.addEventListener('click', () => {
    const id = giftSystem.getSelected();
    const d = dancers.find((x) => x.profile.id === id);
    if (d) cameraCtrl.focusOn(() => d.getWorldFocusPoint(), { duration: 4 });
});
$('dcNameTags')?.addEventListener('change', (e) => {
    dancers.forEach((d) => d.setNameTagVisible(e.target.checked));
});
$('dcFaceMode')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-face]');
    if (!btn) return;
    dancers.forEach((d) => d.setFaceMode(btn.dataset.face));
    btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
});

// Drawer closed by default — stage stays visible
setDrawerOpen(false);

/* ------------------------------------------------------------------ *
 * Keyboard shortcuts
 * ------------------------------------------------------------------ */
window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const numeric = Number(e.key);
    if (numeric >= 1 && numeric <= 9) {
        const shot = CAMERA_SHOTS[numeric - 1];
        if (shot) cameraCtrl.setShot(shot.id);
        return;
    }
    switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); audio.togglePlay(); break;
        case 'c': cameraCtrl.nextShot(); break;
        case 'g': giftSystem.mockRandomGift(); break;
        case 'b': markBackgroundActive(sceneApi.background.nextTheme().id); break;
        case 'l': showToast('💡 ' + sceneApi.nextPattern()); break;
        case 't': $('dcBtnTap')?.click(); break;
        case 'm': toggleDrawer(); break;
        case 'h': $('dcHud')?.classList.toggle('hidden'); break;
        case 'escape': toggleDrawer(false); break;
        default: break;
    }
});

/* ------------------------------------------------------------------ *
 * Status pills
 * ------------------------------------------------------------------ */
function updatePills(frame) {
    const music = $('dcMusicPill');
    if (music) {
        music.classList.toggle('on', !!frame.playing);
        music.querySelector('.label').textContent = frame.playing
            ? audio.getStatus().label
            : 'Music OFF';
    }
    const beat = $('dcBeatPill');
    if (beat) {
        beat.classList.toggle('on', frame.beat > 0.35);
        beat.querySelector('.label').textContent = frame.analysed ? 'analysing' : 'bpm clock';
    }
    const bpm = $('dcBpmPill');
    if (bpm) {
        bpm.classList.toggle('on', frame.beat > 0.5);
        bpm.querySelector('.label').textContent = `${frame.bpm} BPM`;
    }
    updateDockPlayBtn();
}

/* ------------------------------------------------------------------ *
 * Main loop
 * ------------------------------------------------------------------ */
let last = performance.now();
let pillClock = 0;

function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now * 0.001;

    const frame = audio.update();

    sceneApi.applyAudioLights(frame, dt, time);
    dancers.forEach((d) => d.update(time, frame));
    cameraCtrl.update(dt, frame);

    pillClock += dt;
    if (pillClock > 0.15) {
        pillClock = 0;
        updatePills(frame);
    }

    sceneApi.composer.render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ------------------------------------------------------------------ *
 * Public API for the Game Center bridge
 * ------------------------------------------------------------------ */
window.DanceClub = {
    audio,
    dancers,
    scene: sceneApi,
    camera: cameraCtrl,
    gift: window.DanceClubGift,
    isOverlay,

    focusDancer(id) {
        giftSystem.setSelected(id);
        markRosterActive(id);
        return giftSystem.triggerGift({ dancerId: id, giftName: 'Spotlight', coins: 0, from: 'Host' });
    },
    setShot: (id) => cameraCtrl.setShot(id),
    setBackground: (id) => markBackgroundActive(sceneApi.background.setTheme(id).id),
    setPalette: (id) => sceneApi.setPalette(id),
    setBpm: (bpm) => audio.setBpm(bpm),
    playYouTube: (url) => audio.loadYouTube(url, $('ytMount')),
    forceMove(id) {
        forcedMove = id || null;
        dancers.forEach((d) => d.setForcedMove(forcedMove));
        markMoveActive(forcedMove || '__auto');
    },
    get forcedMove() { return forcedMove; },
    toast: showToast
};

if (isOverlay) {
    // Overlay windows have no room for the drawer by default
    document.body.classList.remove('dc-drawer-open');
    sceneApi.background.setAutoCycle(true, 8);
    cameraCtrl.setAutoCut(true, 4);
    audio.startProcedural();
}
