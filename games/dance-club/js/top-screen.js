/**

 * Ceiling-mounted now-playing screen — faces straight down over center stage.

 * Center back wall is shared by chat (!ds) and profile wallpaper gifts.

 */

import * as THREE from 'three';
import { ROOM, CEILING_SCREEN } from './room.js';

export { CEILING_SCREEN };



const SCREEN_W = 5.8;

const SCREEN_H = 5.8;



function drawScreen(canvas, { title, artist, requester, accent, artImg }) {

    const ctx = canvas.getContext('2d');

    const w = canvas.width;

    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);



    const grad = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, w * 0.55);

    grad.addColorStop(0, 'rgba(28, 8, 52, 0.98)');

    grad.addColorStop(1, 'rgba(8, 2, 20, 0.96)');

    ctx.fillStyle = grad;

    ctx.fillRect(0, 0, w, h);



    const col = accent || '#1DB954';

    ctx.strokeStyle = col;

    ctx.lineWidth = 5;

    ctx.strokeRect(12, 12, w - 24, h - 24);



    const artSize = Math.min(220, w - 48);

    const artX = (w - artSize) / 2;

    const artY = 28;

    if (artImg && artImg.width > 0) {

        ctx.fillStyle = 'rgba(0,0,0,0.4)';

        ctx.fillRect(artX - 3, artY - 3, artSize + 6, artSize + 6);

        ctx.drawImage(artImg, artX, artY, artSize, artSize);

        ctx.strokeStyle = col;

        ctx.lineWidth = 3;

        ctx.strokeRect(artX, artY, artSize, artSize);

    }



    const textY = artImg ? artY + artSize + 22 : 120;

    const textW = w - 40;



    ctx.fillStyle = 'rgba(255,255,255,0.5)';

    ctx.font = '600 22px Kanit, sans-serif';

    ctx.textAlign = 'center';

    ctx.textBaseline = 'top';

    ctx.fillText(String(requester || 'Spotify').slice(0, 22), w / 2, textY - 18, textW);



    ctx.fillStyle = '#ffffff';

    let titleSize = 38;

    const t = String(title || 'Unknown').trim().slice(0, 36);

    ctx.font = `900 ${titleSize}px Kanit, sans-serif`;

    while (titleSize > 24 && ctx.measureText(t).width > textW) {

        titleSize -= 2;

        ctx.font = `900 ${titleSize}px Kanit, sans-serif`;

    }

    ctx.shadowColor = col;

    ctx.shadowBlur = 14;

    ctx.fillText(t, w / 2, textY, textW);



    const a = String(artist || '').trim().slice(0, 32);

    if (a) {

        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.78)';

        ctx.font = '600 26px Kanit, sans-serif';

        ctx.fillText(a, w / 2, textY + titleSize + 8, textW);

    }

    ctx.shadowBlur = 0;

}



export function createTopScreen(scene) {

    const group = new THREE.Group();

    group.position.set(CEILING_SCREEN.x, CEILING_SCREEN.y, CEILING_SCREEN.z);

    group.rotation.x = Math.PI / 2;

    group.visible = false;

    scene.add(group);



    const mount = new THREE.Mesh(

        new THREE.BoxGeometry(SCREEN_W + 0.8, 0.28, 0.45),

        new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.7, roughness: 0.35 })

    );

    mount.position.set(0, SCREEN_H * 0.5 + 0.12, 0);

    group.add(mount);



    const bezel = new THREE.Mesh(

        new THREE.PlaneGeometry(SCREEN_W + 0.35, SCREEN_H + 0.35),

        new THREE.MeshBasicMaterial({ color: 0x0a0614, transparent: true, opacity: 0.95, depthWrite: false })

    );

    bezel.renderOrder = 25;

    group.add(bezel);



    const glow = new THREE.Mesh(

        new THREE.PlaneGeometry(SCREEN_W + 0.9, SCREEN_H + 0.9),

        new THREE.MeshBasicMaterial({

            color: 0x1db954,

            transparent: true,

            opacity: 0,

            blending: THREE.AdditiveBlending,

            depthWrite: false

        })

    );

    glow.position.z = -0.04;

    glow.renderOrder = 24;

    group.add(glow);



    let mesh = null;

    let born = 0;

    let durationMs = 60000;

    let phase = 'idle';

    let persistent = false;

    let lastTrack = null;

    let showGen = 0;



    function disposeDisplay() {

        if (!mesh) return;

        group.remove(mesh);

        mesh.geometry.dispose();

        if (mesh.material.map) mesh.material.map.dispose();

        mesh.material.dispose();

        mesh = null;

    }



    function loadImage(url, timeoutMs = 4000) {

        return new Promise((resolve, reject) => {

            const img = new Image();

            let done = false;

            const finish = (fn, val) => {

                if (done) return;

                done = true;

                clearTimeout(timer);

                fn(val);

            };

            const timer = setTimeout(() => finish(reject, new Error('image_timeout')), timeoutMs);

            img.crossOrigin = 'anonymous';

            img.onload = () => finish(resolve, img);

            img.onerror = () => finish(reject, new Error('image_load_failed'));

            img.src = url;

        });

    }



    function mountCanvas(canvas, accent) {

        disposeDisplay();

        const tex = new THREE.CanvasTexture(canvas);

        tex.colorSpace = THREE.SRGBColorSpace;

        mesh = new THREE.Mesh(

            new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),

            new THREE.MeshBasicMaterial({

                map: tex,

                transparent: true,

                opacity: 0,

                depthWrite: false,

                side: THREE.DoubleSide

            })

        );

        mesh.position.z = 0.05;

        mesh.rotation.z = Math.PI;

        mesh.renderOrder = 26;

        group.add(mesh);

        glow.material.color.set(accent || '#1DB954');

    }



    function applyCanvasToMesh(canvas, accent) {

        if (!mesh?.material) return false;

        const tex = new THREE.CanvasTexture(canvas);

        tex.colorSpace = THREE.SRGBColorSpace;

        const old = mesh.material.map;

        mesh.material.map = tex;

        mesh.material.needsUpdate = true;

        if (old) old.dispose();

        glow.material.color.set(accent || '#1DB954');

        return true;

    }



    async function show({
        title,
        artist,
        albumArt,
        requester,
        duration = 60,
        accent = '#1DB954',
        keepOn = false,
        refresh = false
    } = {}) {
        if (!title && !artist) return false;

        const gen = ++showGen;
        lastTrack = { title, artist, albumArt, requester, duration, accent, keepOn: !!keepOn };
        persistent = !!keepOn;
        durationMs = persistent ? 86400000 : Math.max(4, Number(duration) || 16) * 1000;

        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 384;
        drawScreen(canvas, { title, artist, requester, accent, artImg: null });
        if (gen !== showGen) return false;

        const hadMesh = !!mesh;
        const wasVisible = hadMesh && mesh.material.opacity > 0.35 && phase === 'hold';

        if (hadMesh && applyCanvasToMesh(canvas, accent)) {
            born = performance.now();
            if (refresh) {
                phase = 'hold';
                mesh.material.opacity = 1;
                mesh.scale.setScalar(1);
            } else if (!wasVisible) {
                phase = 'in';
                mesh.material.opacity = 0;
                mesh.scale.setScalar(0.88);
            } else {
                phase = 'hold';
                mesh.scale.setScalar(0.96);
            }
        } else {
            mountCanvas(canvas, accent);
            if (gen !== showGen) {
                disposeDisplay();
                return false;
            }
            born = performance.now();
            phase = 'in';
        }

        if (albumArt) {
            try {
                const artImg = await loadImage(albumArt);
                if (gen !== showGen) return true;
                drawScreen(canvas, { title, artist, requester, accent, artImg });
                applyCanvasToMesh(canvas, accent);
                if (refresh && mesh?.material) {
                    phase = 'hold';
                    mesh.material.opacity = 1;
                    mesh.scale.setScalar(1);
                }
            } catch { /* text-only */ }
        }

        return true;
    }



    async function reveal() {
        if (!lastTrack) return false;

        if (mesh && phase !== 'idle') {
            born = performance.now();
            if (mesh.material.opacity > 0.4 && phase === 'hold') {
                mesh.scale.setScalar(0.98);
            } else {
                phase = 'in';
                mesh.material.opacity = 0;
                mesh.scale.setScalar(0.88);
            }
            return true;
        }

        return show({ ...lastTrack, keepOn: true });
    }



    function update(dt, audio = {}) {

        if (!mesh || phase === 'idle') return;

        const age = performance.now() - born;

        const beat = audio.beat || 0;



        if (phase === 'in') {

            const t = Math.min(1, age / 850);

            const e = 1 - Math.pow(1 - t, 3);

            mesh.material.opacity = e;

            mesh.scale.setScalar(0.88 + 0.12 * e);

            glow.material.opacity = e * 0.38;

            if (t >= 1) phase = 'hold';

        } else if (!persistent && age > durationMs) {

            phase = 'out';

        }



        if (phase === 'hold') {

            const pulse = 1 + beat * 0.018;

            mesh.scale.setScalar(pulse);

            glow.material.opacity = 0.2 + beat * 0.32;

        }



        if (phase === 'out') {

            const t = Math.min(1, (age - durationMs) / 800);

            mesh.material.opacity = 1 - t;

            glow.material.opacity = (1 - t) * 0.15;

            if (t >= 1) {

                persistent = false;

                disposeDisplay();

                phase = 'idle';

            }

        }

    }



    function getFocusPoint() {

        return new THREE.Vector3(CEILING_SCREEN.x, CEILING_SCREEN.y, CEILING_SCREEN.z);

    }



    return {

        group,

        show,

        reveal,

        clear: () => {

            showGen += 1;

            persistent = false;

            lastTrack = null;

            disposeDisplay();

            phase = 'idle';

        },

        update,

        getFocusPoint,

        setVisible(v) {
            group.visible = !!v;
        },

        get active() { return phase !== 'idle'; },

        get lastTrack() { return lastTrack; },

        dispose() {

            showGen += 1;

            persistent = false;

            lastTrack = null;

            disposeDisplay();

            scene.remove(group);

        }

    };

}


