/**
 * Custom video mapped onto LED wall + LED floor panels (full flat floor).
 */
import * as THREE from 'three';
import { ROOM } from './room.js?v=form-flat-1';

export function createVideoBackdrop(scene, opts = {}) {
    const group = new THREE.Group();
    scene.add(group);

    let video = null;
    let wallPlane = null;
    let floorCenter = null;
    let floorWingL = null;
    let floorWingR = null;
    let wallBorders = null;
    let floorBorders = null;
    let active = false;
    let tex = null;

    const WALL_COLS = opts.wallCols || 16;
    const WALL_ROWS = opts.wallRows || 8;
    const WALL_PANEL_W = opts.wallPanelW || 1.55;
    const WALL_PANEL_H = opts.wallPanelH || 1.35;
    const WALL_Z = opts.wallZ ?? (ROOM.stageZ - 4.22);
    const WALL_Y0 = opts.wallY0 || 2.4;

    const TILE_X = opts.tileCols || 20;
    const TILE_Z = opts.tileRows || 8;
    const TILE_SPAN_X = opts.tileSpanX || ROOM.floorSpanX;
    const TILE_SPAN_Z = opts.tileSpanZ || ROOM.floorSpanZ;
    const TILE_Z_OFF = opts.tileZOffset ?? 2.0;
    const WING_COLS = opts.wingCols || 5;
    const WING_RISER_Y = opts.wingRiserY ?? 0;

    const tileSizeX = TILE_SPAN_X / TILE_X;
    const wingSpanX = WING_COLS * tileSizeX;
    const centerSpanX = Math.max(4, TILE_SPAN_X - wingSpanX * 2);
    const wingCenterX = centerSpanX / 2 + wingSpanX / 2;

    const wallW = WALL_COLS * WALL_PANEL_W;
    const wallH = WALL_ROWS * WALL_PANEL_H;
    const wallY = WALL_Y0 + (WALL_ROWS - 1) * WALL_PANEL_H * 0.5;

    function disposeMesh(mesh) {
        if (!mesh) return;
        mesh.geometry?.dispose();
        if (mesh.material) {
            if (mesh.material.map) mesh.material.map = null;
            mesh.material.dispose();
        }
        group.remove(mesh);
    }

    function clear() {
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video = null;
        }
        if (tex) {
            tex.dispose();
            tex = null;
        }
        if (wallPlane) wallPlane.visible = false;
        [floorCenter, floorWingL, floorWingR].forEach((p) => { if (p) p.visible = false; });
        if (wallBorders) wallBorders.visible = false;
        if (floorBorders) floorBorders.visible = false;
        active = false;
    }

    function makeFloorPlane(w, h, y, x) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.98, toneMapped: false, depthWrite: false })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, TILE_Z_OFF);
        mesh.renderOrder = 1;
        group.add(mesh);
        return mesh;
    }

    /** Thin LED bezel lines (cross grid) over the video. */
    function buildBezelLines({ cols, rows, totalW, totalH, z, y, isFloor, offsetX = 0 }) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
            color: 0x0a0a10,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            toneMapped: false
        });
        const lineT = 0.07;

        for (let c = 0; c <= cols; c++) {
            const x = offsetX - totalW / 2 + c * (totalW / cols);
            if (isFloor) {
                const bar = new THREE.Mesh(new THREE.PlaneGeometry(lineT, totalH), mat);
                bar.rotation.x = -Math.PI / 2;
                bar.position.set(x, y, z);
                g.add(bar);
            } else {
                const bar = new THREE.Mesh(new THREE.PlaneGeometry(lineT, totalH), mat);
                bar.position.set(x, y, z);
                g.add(bar);
            }
        }
        for (let r = 0; r <= rows; r++) {
            const offset = -totalH / 2 + r * (totalH / rows);
            if (isFloor) {
                const bar = new THREE.Mesh(new THREE.PlaneGeometry(totalW, lineT), mat);
                bar.rotation.x = -Math.PI / 2;
                bar.position.set(offsetX, y, z + offset);
                g.add(bar);
            } else {
                const bar = new THREE.Mesh(new THREE.PlaneGeometry(totalW, lineT), mat);
                bar.position.set(offsetX, y + offset, z);
                g.add(bar);
            }
        }
        g.visible = false;
        g.renderOrder = 3;
        group.add(g);
        return g;
    }

    function ensureMeshes(videoTex) {
        if (!wallPlane) {
            wallPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(wallW, wallH),
                new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false })
            );
            wallPlane.position.set(0, wallY, WALL_Z);
            wallPlane.renderOrder = 1;
            group.add(wallPlane);
        }

        if (!floorCenter) {
            const floorY = WING_RISER_Y + 0.035;
            floorCenter = makeFloorPlane(centerSpanX, TILE_SPAN_Z, floorY, 0);
            floorWingL = makeFloorPlane(wingSpanX, TILE_SPAN_Z, floorY, -wingCenterX);
            floorWingR = makeFloorPlane(wingSpanX, TILE_SPAN_Z, floorY, wingCenterX);
        }

        if (!wallBorders) {
            wallBorders = buildBezelLines({
                cols: WALL_COLS,
                rows: WALL_ROWS,
                totalW: wallW,
                totalH: wallH,
                z: WALL_Z + 0.03,
                y: wallY,
                isFloor: false
            });
        }
        if (!floorBorders) {
            floorBorders = new THREE.Group();
            const centerCols = Math.max(4, TILE_X - WING_COLS * 2);
            floorBorders.add(buildBezelLines({
                cols: centerCols,
                rows: TILE_Z,
                totalW: centerSpanX,
                totalH: TILE_SPAN_Z,
                z: TILE_Z_OFF,
                y: 0.045,
                isFloor: true,
                offsetX: 0
            }));
            floorBorders.add(buildBezelLines({
                cols: WING_COLS,
                rows: TILE_Z,
                totalW: wingSpanX,
                totalH: TILE_SPAN_Z,
                z: TILE_Z_OFF,
                y: WING_RISER_Y + 0.045,
                isFloor: true,
                offsetX: -wingCenterX
            }));
            floorBorders.add(buildBezelLines({
                cols: WING_COLS,
                rows: TILE_Z,
                totalW: wingSpanX,
                totalH: TILE_SPAN_Z,
                z: TILE_Z_OFF,
                y: WING_RISER_Y + 0.045,
                isFloor: true,
                offsetX: wingCenterX
            }));
            group.add(floorBorders);
        }

        wallPlane.material.map = videoTex;
        wallPlane.material.needsUpdate = true;
        floorCenter.material.map = videoTex;
        floorCenter.material.needsUpdate = true;
        floorWingL.material.map = videoTex;
        floorWingL.material.needsUpdate = true;
        floorWingR.material.map = videoTex;
        floorWingR.material.needsUpdate = true;

        wallPlane.visible = true;
        floorCenter.visible = true;
        floorWingL.visible = true;
        floorWingR.visible = true;
        wallBorders.visible = true;
        floorBorders.visible = true;
    }

    async function setSource(src) {
        clear();
        if (!src) return false;

        video = document.createElement('video');
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.src = src;

        await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = () => reject(new Error('โหลดวิดีโอไม่สำเร็จ'));
            video.load();
        });

        try {
            await video.play();
        } catch {
            /* autoplay may need gesture */
        }

        tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        ensureMeshes(tex);
        active = true;
        return true;
    }

    function update(dt, audio = {}) {
        if (!active || !video) return;
        if (tex) tex.needsUpdate = true;
        const beat = audio.beat || 0;
        const op = 0.88 + beat * 0.12;
        if (floorCenter) floorCenter.material.opacity = op;
        if (floorWingL) floorWingL.material.opacity = op;
        if (floorWingR) floorWingR.material.opacity = op;
    }

    function dispose() {
        clear();
        disposeMesh(wallPlane);
        disposeMesh(floorCenter);
        disposeMesh(floorWingL);
        disposeMesh(floorWingR);
        wallPlane = floorCenter = floorWingL = floorWingR = null;
        if (wallBorders) {
            wallBorders.traverse((c) => {
                c.geometry?.dispose();
                c.material?.dispose();
            });
            group.remove(wallBorders);
        }
        if (floorBorders) {
            floorBorders.traverse((c) => {
                c.geometry?.dispose();
                c.material?.dispose();
            });
            group.remove(floorBorders);
        }
        scene.remove(group);
    }

    return {
        group,
        setSource,
        clear,
        update,
        get active() { return active; },
        dispose
    };
}
