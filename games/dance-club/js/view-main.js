/**
 * Dance Club — display / view page (3D engine host).
 */
import { CAMERA_SHOTS } from './camera-shots.js';
import { startSpotifyQueueWatcher } from './spotify-queue-watcher.js';

const params = new URLSearchParams(location.search);
const isOverlay = params.get('overlay') === '1';
const $ = (id) => document.getElementById(id);

if (isOverlay) document.body.classList.add('dc-overlay-mode');

let toastTimer = null;
let runtime = null;
let sync = null;
let avatarUrl = (seed) => `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed || 'dancer')}`;

function showToast(text) {
    const el = $('dcToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

function markRosterActive(id) {
    document.querySelectorAll('[data-dancer]').forEach((b) => {
        b.classList.toggle('active', b.dataset.dancer === id);
    });
}

function buildDockRoster(rt) {
    const dock = $('dcDockRoster');
    if (!dock || !rt) return;
    dock.innerHTML = '';
    const list = rt.dancers.length ? rt.dancers : [];
    if (!list.length) {
        dock.innerHTML = '<span class="dc-dock-empty" style="font-size:0.72rem;color:#888;padding:4px 8px;">รอผู้ชม…</span>';
        return;
    }
    list.forEach((d) => {
        const p = d.profile;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'dc-dock-chip';
        chip.dataset.dancer = p.id;
        chip.title = p.name;
        chip.innerHTML = `<img src="${p.avatar || avatarUrl(p.seed)}" alt="${p.name}" loading="lazy">`;
        chip.addEventListener('click', () => {
            rt.giftSystem.setSelected(p.id);
            markRosterActive(p.id);
        });
        dock.appendChild(chip);
    });
    markRosterActive(rt.giftSystem.getSelected());
}

function updateDockPlayBtn(rt) {
    const btn = $('dcDockPlay');
    if (!btn || !rt) return;
    const playing = rt.audio.getStatus().playing;
    btn.textContent = playing ? '⏸' : '▶';
}

function updatePills(rt, frame) {
    const music = $('dcMusicPill');
    if (music) {
        music.classList.toggle('on', !!frame.playing);
        music.querySelector('.label').textContent = frame.playing
            ? rt.audio.getStatus().label
            : 'Music OFF';
    }
    const bpm = $('dcBpmPill');
    if (bpm) {
        bpm.classList.toggle('on', frame.beat > 0.5);
        bpm.querySelector('.label').textContent = `${frame.bpm} BPM`;
    }
    updateDockPlayBtn(rt);
}

function showBootError(viewport, err) {
    console.error('Dance Club failed to start:', err);
    viewport.innerHTML = `<div style="padding:24px;color:#ff6b81;font-family:Kanit,sans-serif;pointer-events:auto;">
        <h2>⚠️ โหลดเกมไม่สำเร็จ</h2>
        <p style="color:#ccc;font-size:0.9rem;">${err?.message || err}</p>
        <p style="color:#888;font-size:0.8rem;">ลองรีเฟรชหน้านี้ (F5)</p>
    </div>`;
}

function wireViewUi() {
    $('dcOpenControl')?.addEventListener('click', () => {
        if (window.PandyBridge?.openDanceClubControl) {
            window.PandyBridge.openDanceClubControl();
            return;
        }
        window.open('control.html', 'dc-control', 'width=520,height=780');
    });
    $('dcHideHud')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        $('dcHud')?.classList.toggle('hidden');
    });
}

async function onRuntimeReady(rt, mods) {
    const { createSync, createGiftBridge } = mods;
    runtime = rt;
    if (typeof mods.avatarUrl === 'function') avatarUrl = mods.avatarUrl;

    // Paint one frame before wiring bridges / UI
    rt.startLoop();
    await new Promise((r) => requestAnimationFrame(r));

    sync = createSync('host');

    rt.cameraCtrl.setBeatShake(0);

    let queueWatcher = null;
    const giftBridge = createGiftBridge({
        onGift: (gift, rule) => {
            rt.giftSystem.handleTikTokGift(gift, rule);
        },
        onSay: (say) => {
            if (!say?.text) return;
            rt.sceneApi?.profileWallpaper?.clear?.();
            rt.sceneApi?.sayBanner?.show({
                text: say.text,
                nickname: say.nickname || say.uniqueId || 'Viewer',
                duration: say.duration || 10,
                accent: say.accent || '#ff2d95'
            });
            showToast(`💬 @${say.nickname || say.uniqueId || 'viewer'}: ${say.text}`);
        },
        onSpotify: (track) => {
            if (!track?.id || !runtime) return;
            setTimeout(() => {
                if (runtime) void runtime.applyCommand('spotifyNowPlaying', [track]);
            }, 0);
        },
        onSpotifyBeatMap: (msg) => {
            if (!msg?.id || !runtime) return;
            setTimeout(() => {
                if (runtime) void runtime.applyCommand('spotifyBeatMap', [msg]);
            }, 0);
        },
        onSpotifyProgress: (msg) => {
            if (!runtime) return;
            if (runtime.handleSpotifyProgress) {
                runtime.handleSpotifyProgress(msg.progressMs, msg.playing);
            } else {
                runtime.audio.syncSpotifyProgress?.(msg.progressMs, msg.playing);
            }
            if (msg.playing === false) {
                queueWatcher.onTrackEnded?.();
                void queueWatcher.poll?.();
            }
        }
    });
    void giftBridge;

    queueWatcher = startSpotifyQueueWatcher({ onToast: showToast });
    rt.setOnTrackEnded?.(() => {
        queueWatcher.onTrackEnded?.();
    });

    sync.on((msg) => {
        if (!runtime) return;
        if (msg.type === 'cmd' && msg.role === 'client') {
            setTimeout(() => {
                if (!runtime) return;
                Promise.resolve(runtime.applyCommand(msg.command, msg.args || []))
                    .then(() => sync?.state(runtime.getState()))
                    .catch((err) => console.error('cmd failed', msg.command, err));
            }, 0);
        } else if (msg.type === 'ping') {
            sync.pong();
            sync.state(runtime.getState());
        }
    });

    setInterval(() => {
        if (runtime && sync) sync.state(runtime.getState());
    }, 2800);

    buildDockRoster(rt);

    $('dcDockPlay')?.addEventListener('click', () => rt.toggleMusic());
    $('dcDockGift')?.addEventListener('click', () => rt.giftSystem.mockRandomGift());
    $('dcYtClose')?.addEventListener('click', () => { $('dcYtBox').hidden = true; });
    $('dcYtToggleSize')?.addEventListener('click', () => $('dcYtBox')?.classList.toggle('mini'));

    $('dcAudioFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !runtime) return;
        try {
            await rt.audio.loadFile(file);
            showToast('🎵 กำลังเล่น: ' + file.name);
            sync?.state(rt.getState());
        } catch {
            showToast('❌ เล่นไฟล์นี้ไม่ได้');
        }
    });

    $('dcAudioQueue')?.addEventListener('change', async (e) => {
        const files = e.target.files;
        e.target.value = '';
        if (!files?.length || !runtime) return;
        try {
            await rt.audio.enqueueFiles(files);
            showToast(`➕ เพิ่ม ${files.length} เพลงเข้าคิว`);
            sync?.state(rt.getState());
        } catch {
            showToast('❌ เพิ่มคิวไม่สำเร็จ');
        }
    });

    $('dcVideoFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !runtime) return;
        try {
            const url = URL.createObjectURL(file);
            await rt.applyCommand('setVideoBackdrop', [url]);
            showToast('🎬 วิดีโอฉาก: ' + file.name);
        } catch {
            showToast('❌ โหลดวิดีโอไม่สำเร็จ');
        }
    });

    rt.sceneApi?.resize?.();
    window.addEventListener('resize', () => runtime?.sceneApi?.resize?.());

    window.addEventListener('keydown', (e) => {
        if (!runtime || e.target.matches('input, textarea')) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 9) {
            const shot = CAMERA_SHOTS[n - 1];
            if (shot) rt.cameraCtrl.setShot(shot.id);
            return;
        }
        switch (e.key.toLowerCase()) {
            case ' ': e.preventDefault(); rt.toggleMusic(); break;
            case 'g': rt.giftSystem.mockRandomGift(); break;
            case 'h': $('dcHud')?.classList.toggle('hidden'); break;
            default: break;
        }
    });

    window.DanceClub = {
        audio: rt.audio,
        dancers: rt.dancers,
        scene: rt.sceneApi,
        camera: rt.cameraCtrl,
        gift: window.DanceClubGift,
        isOverlay,
        focusDancer: (id) => rt.applyCommand('focusDancer', [id]),
        setShot: (id) => rt.applyCommand('setShot', [id]),
        setBackground: (id) => rt.applyCommand('setBackground', [id]),
        setPalette: (id) => rt.applyCommand('setPalette', [id]),
        setBpm: (bpm) => rt.applyCommand('setBpm', [bpm]),
        toast: showToast
    };

    if (isOverlay) {
        setTimeout(() => rt.audio.startProcedural(), 250);
    }
}

async function bootRuntime() {
    const viewport = $('dcViewport');
    if (!viewport) {
        console.error('Dance Club: #dcViewport not found');
        return;
    }

    viewport.innerHTML = '<div class="dc-boot-msg">🕺 กำลังโหลดเวที…</div>';
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));

    try {
        const [{ createDanceClubRuntime, avatarUrl: av }, { createSync }, { createGiftBridge }] = await Promise.all([
            import('./runtime.js?v=viewport-full-1'),
            import('./sync.js'),
            import('./gift-bridge.js')
        ]);
        avatarUrl = av;

        await new Promise((r) => requestAnimationFrame(r));

        let rt = null;
        rt = createDanceClubRuntime(viewport, {
            palette: params.get('palette') || 'neon',
            background: params.get('bg') || 'retrowave',
            bpm: Number(params.get('bpm')) || 128,
            shot: params.get('shot') || 'wide',
            autoCut: isOverlay,
            autoCutBeats: 16,
            bgAuto: isOverlay,
            bgAutoBeats: 16,
            beatShake: 0,
            useBeatWorker: true,
            lightThrottle: true,
            useLedWorker: true,
            useStageFxWorker: true,
            onToast: showToast,
            onFrame: (frame) => { if (rt) updatePills(rt, frame); },
            onDancerAdded: () => { if (rt) buildDockRoster(rt); }
        });
        viewport.querySelector('.dc-boot-msg')?.remove();
        await onRuntimeReady(rt, { createSync, createGiftBridge, avatarUrl: av });
    } catch (err) {
        showBootError(viewport, err);
        showToast('⚠️ โหลด 3D ไม่สำเร็จ');
    }
}

wireViewUi();
void bootRuntime();
