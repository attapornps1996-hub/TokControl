/**
 * Stage LED screen media — YouTube or local video on back wall only (no floor).
 * DOM overlay tracked to the 3D wall plane with perspective matrix3d + LED grid.
 */
import * as THREE from 'three';
import { ROOM, STAGE_LED_WALL } from './room.js';
import { parseYouTubeId, loadYouTubeApi } from './audio.js';

const WALL_COLS = STAGE_LED_WALL.cols;
const WALL_ROWS = STAGE_LED_WALL.rows;
const WALL_W = STAGE_LED_WALL.spanX;
const WALL_H = WALL_ROWS * STAGE_LED_WALL.panelH;
const WALL_Z = STAGE_LED_WALL.z;
const WALL_Y_CENTER = STAGE_LED_WALL.yBase + ((WALL_ROWS - 1) * STAGE_LED_WALL.panelH) / 2;

/** Logical overlay size used as the matrix3d source rectangle */
const SRC_W = 1280;
const SRC_H = Math.round(SRC_W * (WALL_H / WALL_W));

export const STAGE_YT_LOOK = [0, WALL_Y_CENTER, WALL_Z];

/**
 * Projective transform: map axis-aligned rect (0,0)-(w,0)-(w,h)-(0,h)
 * onto destination corners TL, TR, BR, BL. Returns CSS matrix3d string.
 */
function cssMatrix3dFromQuad(w, h, tl, tr, br, bl) {
    const src = [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h]
    ];
    const dst = [
        [tl.x, tl.y],
        [tr.x, tr.y],
        [br.x, br.y],
        [bl.x, bl.y]
    ];

    const A = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
    }

    const M = A.map((row) => row.slice());
    const n = 8;
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        }
        [M[col], M[pivot]] = [M[pivot], M[col]];
        const div = M[col][col] || 1e-12;
        for (let c = col; c <= n; c++) M[col][c] /= div;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col];
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }

    const hh = new Array(9);
    for (let i = 0; i < 8; i++) hh[i] = M[i][8];
    hh[8] = 1;

    const m = [
        hh[0], hh[3], 0, hh[6],
        hh[1], hh[4], 0, hh[7],
        0, 0, 1, 0,
        hh[2], hh[5], 0, hh[8]
    ];
    return `matrix3d(${m.map((v) => Number(v.toFixed(6))).join(',')})`;
}

export function createStageYoutube({ container, camera, renderer }) {
    let active = false;
    let videoId = null;
    let sourceKind = null;
    let player = null;
    let localVideo = null;
    let localObjectUrl = null;
    let playerElId = `dc-yt-${Date.now()}`;
    let soundArmed = false;

    container.style.position = container.style.position || 'relative';

    const layer = document.createElement('div');
    layer.className = 'dc-stage-yt-layer';
    container.appendChild(layer);

    const host = document.createElement('div');
    host.className = 'dc-stage-yt-host';
    host.style.width = `${SRC_W}px`;
    host.style.height = `${SRC_H}px`;
    layer.appendChild(host);

    const playerWrap = document.createElement('div');
    playerWrap.className = 'dc-stage-yt-player';
    playerWrap.id = playerElId;
    host.appendChild(playerWrap);

    const grid = document.createElement('div');
    grid.className = 'dc-stage-yt-grid';
    grid.style.setProperty('--yt-cols', String(WALL_COLS));
    grid.style.setProperty('--yt-rows', String(WALL_ROWS));
    host.appendChild(grid);

    const chromeMask = document.createElement('div');
    chromeMask.className = 'dc-stage-yt-chrome-mask';
    host.appendChild(chromeMask);

    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.className = 'dc-stage-yt-unmute';
    unmuteBtn.textContent = '🔊 คลิกเพื่อเปิดเสียง';
    unmuteBtn.hidden = true;
    host.appendChild(unmuteBtn);

    // World corners: BL, BR, TL, TR
    const v0 = new THREE.Vector3(-WALL_W / 2, WALL_Y_CENTER - WALL_H / 2, WALL_Z);
    const v1 = new THREE.Vector3(WALL_W / 2, WALL_Y_CENTER - WALL_H / 2, WALL_Z);
    const v2 = new THREE.Vector3(-WALL_W / 2, WALL_Y_CENTER + WALL_H / 2, WALL_Z);
    const v3 = new THREE.Vector3(WALL_W / 2, WALL_Y_CENTER + WALL_H / 2, WALL_Z);
    const corners = [v0, v1, v2, v3];
    const proj = new THREE.Vector3();

    function setUnmutePrompt(show) {
        unmuteBtn.hidden = !show;
        host.classList.toggle('needs-unmute', !!show);
    }

    function tryUnmuteLocal() {
        if (!localVideo) return true;
        localVideo.muted = false;
        localVideo.volume = 1;
        const p = localVideo.play();
        if (p && typeof p.then === 'function') {
            p.then(() => {
                soundArmed = !localVideo.muted;
                setUnmutePrompt(localVideo.muted);
            }).catch(() => setUnmutePrompt(true));
        } else {
            soundArmed = !localVideo.muted;
            setUnmutePrompt(localVideo.muted);
        }
        return !localVideo.muted;
    }

    function tryUnmuteYoutube() {
        if (!player) return false;
        try {
            player.unMute();
            player.setVolume(100);
            player.playVideo();
            const muted = typeof player.isMuted === 'function' ? player.isMuted() : false;
            soundArmed = !muted;
            setUnmutePrompt(muted);
            return !muted;
        } catch {
            setUnmutePrompt(true);
            return false;
        }
    }

    unmuteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sourceKind === 'local') tryUnmuteLocal();
        else if (sourceKind === 'youtube') tryUnmuteYoutube();
    });

    function updateProjection() {
        if (!active) {
            host.classList.remove('visible');
            return;
        }

        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;
        if (!w || !h) return;

        const pts = corners.map((corner) => {
            proj.copy(corner).project(camera);
            return {
                x: (proj.x * 0.5 + 0.5) * w,
                y: (-proj.y * 0.5 + 0.5) * h,
                z: proj.z
            };
        });

        if (pts.some((p) => p.z > 1 || p.z < -1)) {
            host.classList.remove('visible');
            return;
        }

        // pts: BL, BR, TL, TR → matrix wants TL, TR, BR, BL
        const bl = pts[0];
        const br = pts[1];
        const tl = pts[2];
        const tr = pts[3];

        const minX = Math.min(tl.x, tr.x, br.x, bl.x);
        const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
        const minY = Math.min(tl.y, tr.y, br.y, bl.y);
        const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
        if (maxX - minX < 24 || maxY - minY < 24) {
            host.classList.remove('visible');
            return;
        }

        host.style.left = '0px';
        host.style.top = '0px';
        host.style.width = `${SRC_W}px`;
        host.style.height = `${SRC_H}px`;
        host.style.transformOrigin = '0 0';
        host.style.transform = cssMatrix3dFromQuad(SRC_W, SRC_H, tl, tr, br, bl);
        host.classList.add('visible');
    }

    function destroyYoutube() {
        if (player) {
            try { player.destroy(); } catch { /* ignore */ }
            player = null;
        }
        playerWrap.innerHTML = '';
        playerElId = `dc-yt-${Date.now()}`;
        playerWrap.id = playerElId;
    }

    function destroyLocal() {
        if (localVideo) {
            try { localVideo.pause(); } catch { /* ignore */ }
            localVideo.removeAttribute('src');
            localVideo.load();
            localVideo.remove();
            localVideo = null;
        }
        if (localObjectUrl) {
            try { URL.revokeObjectURL(localObjectUrl); } catch { /* ignore */ }
            localObjectUrl = null;
        }
    }

    async function load(urlOrId, opts = {}) {
        const id = parseYouTubeId(urlOrId);
        if (!id) throw new Error('invalid_youtube_url');

        destroyLocal();
        destroyYoutube();

        videoId = id;
        sourceKind = 'youtube';
        soundArmed = false;
        const wantSound = opts.sound !== false;
        const visualMuted = opts.visualMuted !== false;

        const YT = await loadYouTubeApi();

        await new Promise((resolve, reject) => {
            let settled = false;
            const done = (ok, err) => {
                if (settled) return;
                settled = true;
                if (ok) resolve(true);
                else reject(err || new Error('youtube_playback_error'));
            };

            player = new YT.Player(playerElId, {
                videoId: id,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    disablekb: 1,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1,
                    fs: 0,
                    iv_load_policy: 3,
                    cc_load_policy: 0,
                    showinfo: 0,
                    loop: 1,
                    playlist: id
                },
                events: {
                    onReady: (ev) => {
                        active = true;
                        try {
                            if (visualMuted) {
                                ev.target.mute();
                                setUnmutePrompt(false);
                            } else {
                                ev.target.unMute();
                                ev.target.setVolume(100);
                            }
                            ev.target.playVideo();
                        } catch { /* autoplay */ }
                        if (!visualMuted && wantSound) {
                            setTimeout(() => tryUnmuteYoutube(), 200);
                        }
                        updateProjection();
                        done(true);
                    },
                    onStateChange: (ev) => {
                        if (!visualMuted && wantSound && ev.data === YT.PlayerState.PLAYING) {
                            tryUnmuteYoutube();
                        }
                    },
                    onError: () => done(false)
                }
            });

            setTimeout(() => {
                if (!settled && active) done(true);
                else if (!settled) done(false, new Error('youtube_timeout'));
            }, 10000);
        });

        return true;
    }

    async function loadLocal(src, opts = {}) {
        if (!src) throw new Error('empty_video_src');

        destroyYoutube();
        destroyLocal();

        videoId = null;
        sourceKind = 'local';
        soundArmed = false;
        setUnmutePrompt(false);

        localVideo = document.createElement('video');
        localVideo.className = 'dc-stage-local-video';
        localVideo.loop = true;
        localVideo.playsInline = true;
        localVideo.preload = 'auto';
        localVideo.setAttribute('playsinline', '');
        localVideo.muted = opts.startMuted === true;
        localVideo.volume = 1;
        localVideo.src = src;
        playerWrap.appendChild(localVideo);

        await new Promise((resolve, reject) => {
            const onReady = () => {
                localVideo.removeEventListener('loadeddata', onReady);
                localVideo.removeEventListener('error', onErr);
                resolve();
            };
            const onErr = () => {
                localVideo.removeEventListener('loadeddata', onReady);
                localVideo.removeEventListener('error', onErr);
                reject(new Error('โหลดวิดีโอไม่สำเร็จ'));
            };
            localVideo.addEventListener('loadeddata', onReady);
            localVideo.addEventListener('error', onErr);
            localVideo.load();
        });

        active = true;
        try {
            await localVideo.play();
        } catch {
            localVideo.muted = true;
            try { await localVideo.play(); } catch { /* ignore */ }
            setUnmutePrompt(true);
        }

        if (localVideo.muted) setUnmutePrompt(true);
        else soundArmed = true;

        updateProjection();
        return true;
    }

    function clear() {
        active = false;
        videoId = null;
        sourceKind = null;
        soundArmed = false;
        setUnmutePrompt(false);
        host.classList.remove('visible');
        host.style.transform = '';
        destroyYoutube();
        destroyLocal();
    }

    function dispose() {
        clear();
        layer.remove();
    }

    return {
        load,
        loadLocal,
        clear,
        update: updateProjection,
        tryUnmute: () => (sourceKind === 'local' ? tryUnmuteLocal() : tryUnmuteYoutube()),
        get active() { return active; },
        get videoId() { return videoId; },
        get sourceKind() { return sourceKind; },
        get soundArmed() { return soundArmed; },
        dispose
    };
}
