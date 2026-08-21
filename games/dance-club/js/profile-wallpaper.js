/**
 * Profile wallpaper on the back LED wall — split layout: name + image.
 */
import * as THREE from 'three';
import { STAGE_SCREEN } from './room.js';
import { WALL_UI, drawWallpaperName, drawWallpaperImage } from './stage-wall-ui.js';

const WALL_Z = STAGE_SCREEN.z;
const PANEL_W = WALL_UI.splitW;
const PANEL_H = WALL_UI.splitH;
const HALF_W = PANEL_W / 2;

function loadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

export function createProfileWallpaper(scene) {
    const group = new THREE.Group();
    group.position.set(0, STAGE_SCREEN.y, WALL_Z);
    scene.add(group);

    let hero = null;

    function disposeHero() {
        if (!hero) return;
        group.remove(hero);
        hero.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
        });
        hero = null;
    }

    async function addProfile({ avatar, nickname, duration = 14 }) {
        const url = avatar || `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(nickname || 'viewer')}&size=512&backgroundColor=transparent`;
        const img = await loadImage(url);

        disposeHero();

        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 800;
        nameCanvas.height = 420;
        drawWallpaperName(nameCanvas.getContext('2d'), 800, 420, nickname);
        const nameTex = new THREE.CanvasTexture(nameCanvas);
        nameTex.colorSpace = THREE.SRGBColorSpace;

        const imgCanvas = document.createElement('canvas');
        imgCanvas.width = 800;
        imgCanvas.height = 420;
        drawWallpaperImage(imgCanvas.getContext('2d'), 800, 420, img);
        const imgTex = new THREE.CanvasTexture(imgCanvas);
        imgTex.colorSpace = THREE.SRGBColorSpace;

        const nameMat = new THREE.MeshBasicMaterial({
            map: nameTex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const imageMat = new THREE.MeshBasicMaterial({
            map: imgTex,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const namePlane = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W - 0.15, PANEL_H), nameMat);
        namePlane.position.set(-HALF_W / 2, 0, 0.12);
        namePlane.renderOrder = 280;

        const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W - 0.15, PANEL_H), imageMat);
        imagePlane.position.set(HALF_W / 2, 0, 0.12);
        imagePlane.renderOrder = 280;

        hero = new THREE.Group();
        hero.add(namePlane);
        hero.add(imagePlane);
        hero.scale.setScalar(0.2);
        hero.userData = {
            nickname: nickname || 'Viewer',
            born: performance.now(),
            duration: duration * 1000,
            phase: 'in',
            planes: [namePlane, imagePlane]
        };
        group.add(hero);
        return hero;
    }

    function update(dt, audio = {}) {
        if (!hero) return;

        const now = performance.now();
        const ud = hero.userData;
        const age = now - ud.born;
        const beat = audio.beat || 0;
        const planes = ud.planes || [];

        if (ud.phase === 'in') {
            const t = Math.min(1, age / 900);
            const e = 1 - Math.pow(1 - t, 3);
            hero.scale.setScalar(0.2 + 0.8 * e);
            planes.forEach((p) => { p.material.opacity = e; });
            if (t >= 1) ud.phase = 'hold';
        } else if (age > ud.duration) {
            ud.phase = 'out';
        }

        if (ud.phase === 'hold') {
            hero.scale.setScalar(1 + beat * 0.015);
        }

        if (ud.phase === 'out') {
            const t = Math.min(1, (age - ud.duration) / 900);
            const e = 1 - t;
            planes.forEach((p) => { p.material.opacity = e; });
            hero.scale.setScalar(e);
            if (t >= 1) disposeHero();
        }
    }

    function getFocusPoint() {
        const v = new THREE.Vector3();
        if (hero) {
            hero.getWorldPosition(v);
            v.y += 0.4;
        } else {
            group.getWorldPosition(v);
        }
        return v;
    }

    return {
        group,
        addProfile,
        clear: disposeHero,
        getFocusPoint,
        update,
        get count() { return hero ? 1 : 0; },
        dispose() {
            disposeHero();
            scene.remove(group);
        }
    };
}
