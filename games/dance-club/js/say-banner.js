/**
 * Dance Say — text on the LED wall from chat (!ds …).
 */
import * as THREE from 'three';
import { STAGE_SCREEN } from './room.js';
import { WALL_UI } from './stage-wall-ui.js';

const WALL_Z = STAGE_SCREEN.z;

function drawBanner(canvas, { text, nickname, accent }) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const accentColor = accent || WALL_UI.accent;
    const altColor = WALL_UI.accentAlt;
    const name = String(nickname || 'Viewer').replace(/^@/, '').slice(0, 28);
    const msg = String(text || '').trim().slice(0, 72);

    const band = ctx.createLinearGradient(0, 0, w, 0);
    band.addColorStop(0, 'rgba(255,45,149,0.14)');
    band.addColorStop(0.5, 'rgba(0,210,255,0.10)');
    band.addColorStop(1, 'rgba(255,45,149,0.14)');
    ctx.fillStyle = band;
    ctx.fillRect(32, h * 0.12, w - 64, h * 0.76);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '800 52px Kanit, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 22;
    ctx.fillText(`@${name}`, w / 2, h * 0.28, w - 72);
    ctx.shadowBlur = 0;

    let size = msg.length > 36 ? 68 : msg.length > 22 ? 84 : msg.length > 14 ? 96 : 112;
    ctx.font = `900 ${size}px Kanit, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = altColor;
    ctx.shadowBlur = 30;

    const maxW = w - 96;
    const textY = h * 0.62;
    if (ctx.measureText(msg).width > maxW && msg.length > 10) {
        const mid = Math.ceil(msg.length / 2);
        let split = msg.lastIndexOf(' ', mid);
        if (split < 4) split = mid;
        const line1 = msg.slice(0, split).trim();
        const line2 = msg.slice(split).trim();
        size = Math.min(size, 78);
        ctx.font = `900 ${size}px Kanit, sans-serif`;
        ctx.fillText(line1, w / 2, textY - 34);
        ctx.fillText(line2, w / 2, textY + 42);
    } else {
        ctx.fillText(msg, w / 2, textY, maxW);
    }
    ctx.shadowBlur = 0;
}

export function createSayBanner(scene) {
    const group = new THREE.Group();
    group.position.set(0, STAGE_SCREEN.y, WALL_Z);
    scene.add(group);

    let mesh = null;
    let born = 0;
    let durationMs = 10000;
    let phase = 'idle';

    function disposeBanner() {
        if (!mesh) return;
        group.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
        mesh = null;
        phase = 'idle';
    }

    function show({ text, nickname, duration = 10, accent = WALL_UI.accent } = {}) {
        if (!text) return false;
        disposeBanner();

        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 360;
        drawBanner(canvas, { text, nickname, accent });

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL_UI.textW, WALL_UI.textH), mat);
        mesh.position.z = 0.12;
        mesh.renderOrder = 280;

        group.add(mesh);
        born = performance.now();
        durationMs = Math.max(3, Number(duration) || 10) * 1000;
        phase = 'in';
        return true;
    }

    function update(dt, audio = {}) {
        if (!mesh || phase === 'idle') return;
        const age = performance.now() - born;
        const beat = audio.beat || 0;

        if (phase === 'in') {
            const t = Math.min(1, age / 700);
            const e = 1 - Math.pow(1 - t, 3);
            mesh.material.opacity = e;
            mesh.scale.setScalar(0.88 + 0.12 * e);
            if (t >= 1) phase = 'hold';
        } else if (age > durationMs) {
            phase = 'out';
        }

        if (phase === 'hold') {
            mesh.scale.setScalar(1 + beat * 0.015);
        }

        if (phase === 'out') {
            const t = Math.min(1, (age - durationMs) / 700);
            mesh.material.opacity = 1 - t;
            mesh.scale.setScalar(1 - t * 0.1);
            if (t >= 1) disposeBanner();
        }
    }

    return {
        group,
        show,
        clear: disposeBanner,
        update,
        get active() { return phase !== 'idle'; },
        dispose() {
            disposeBanner();
            scene.remove(group);
        }
    };
}
