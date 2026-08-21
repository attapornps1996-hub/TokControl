/**
 * Persistent live name / logo on the purple DJ booth panel (not trigger banners).
 */
import * as THREE from 'three';

const PANEL_W = 6.4;
const PANEL_H = 1.45;

async function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function drawBrand(canvas, { text, logoImg, accent }) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(12, 4, 28, 0.72)';
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(80, 20, 140, 0.35)');
    grad.addColorStop(0.5, 'rgba(140, 40, 220, 0.55)');
    grad.addColorStop(1, 'rgba(80, 20, 140, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const col = accent || '#c77dff';
    let textX = w / 2;
    const hasLogo = logoImg && logoImg.width > 0;

    if (hasLogo) {
        const maxH = h * 0.78;
        const scale = maxH / logoImg.height;
        const lw = logoImg.width * scale;
        const lh = logoImg.height * scale;
        const gap = 28;
        const totalW = lw + (text ? gap + 280 : 0);
        let x0 = (w - totalW) / 2;
        ctx.drawImage(logoImg, x0, (h - lh) / 2, lw, lh);
        if (text) textX = x0 + lw + gap + 140;
    }

    const label = String(text || '').trim().slice(0, 32);
    if (label) {
        let size = label.length > 22 ? 72 : label.length > 14 ? 88 : 104;
        ctx.font = `900 ${size}px Kanit, sans-serif`;
        ctx.textAlign = hasLogo ? 'left' : 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = col;
        ctx.shadowBlur = 22;
        ctx.fillText(label, hasLogo ? textX - 140 : w / 2, h / 2 + 4);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3;
        ctx.strokeText(label, hasLogo ? textX - 140 : w / 2, h / 2 + 4);
    }

    ctx.strokeStyle = col;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.65;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.globalAlpha = 1;
}

export function createBoothBrand(parentGroup, opts = {}) {
    const group = new THREE.Group();
    group.position.set(
        opts.x ?? 0,
        opts.y ?? 2.15,
        opts.z ?? 2.38
    );
    group.renderOrder = 280;
    parentGroup.add(group);

    let mesh = null;
    let state = { text: '', logoUrl: '', accent: '#c77dff' };

    function disposeMesh() {
        if (!mesh) return;
        group.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
        mesh = null;
    }

    async function rebuild() {
        disposeMesh();
        if (!state.text && !state.logoUrl) return false;

        const canvas = document.createElement('canvas');
        canvas.width = 1536;
        canvas.height = 280;

        let logoImg = null;
        if (state.logoUrl) {
            try {
                logoImg = await loadImage(state.logoUrl);
            } catch { /* text only */ }
        }

        drawBrand(canvas, { text: state.text, logoImg, accent: state.accent });

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(PANEL_W, PANEL_H),
            new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 1,
                depthWrite: true,
                depthTest: true,
                side: THREE.DoubleSide
            })
        );
        mesh.renderOrder = 280;
        group.add(mesh);
        return true;
    }

    async function setBrand({ text, logoUrl, accent } = {}) {
        if (text !== undefined) state.text = String(text || '');
        if (logoUrl !== undefined) state.logoUrl = logoUrl || '';
        if (accent !== undefined) state.accent = accent || '#c77dff';
        return rebuild();
    }

    function update(dt, audio = {}) {
        if (!mesh) return;
        const beat = audio.beat || 0;
        const pulse = 1 + beat * 0.012;
        mesh.scale.set(pulse, pulse, 1);
    }

    return {
        group,
        setBrand,
        update,
        get text() { return state.text; },
        get logoUrl() { return state.logoUrl; },
        dispose() {
            disposeMesh();
            parentGroup.remove(group);
        }
    };
}
