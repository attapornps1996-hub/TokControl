/**
 * Big-room dance club stage.
 *
 * Contents: reflective floor, LED dance tiles, riser stage, overhead truss,
 * moving-head spots with visible beams, laser fans, strobes, LED video wall,
 * side wash bars, haze, and a bloom pass.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createBackground } from './backgrounds.js';
import { createProfileWallpaper } from './profile-wallpaper.js';
import { createSayBanner } from './say-banner.js';
import { createTopScreen } from './top-screen.js';
import { createBoothBrand } from './booth-brand.js';
import { createStageEffects } from './stage-effects.js';
import { createVideoBackdrop } from './video-backdrop.js?v=form-flat-1';
import { createStageYoutube } from './stage-youtube.js';
import { getVenue, VENUE_IDS } from './venues.js';
import { createBeatCycle, tickBeatCycle, setBeatCycleEvery } from './beat-cycle.js';
import { ROOM, FLOOR_TILE, WASH_BAR_LAYOUT, STAGE_LED_WALL } from './room.js?v=form-flat-1';
import { createClubStatsScreen } from './club-stats-screen.js';
import { PALETTE_LABELS, PATTERN_LABELS, DYNAMIC_FX_IDS, DYNAMIC_FX_LABELS } from './light-catalog.js';
import { computeDynamicLightFx } from './dynamic-light-fx.js';
import { analyzeBeatContext, pickFxForContext, computeFlashTier } from './fx-intelligence.js';
import { createLedWorkerBridge } from './led-bridge.js';

export { ROOM, PALETTE_LABELS, PATTERN_LABELS, DYNAMIC_FX_LABELS };

const PALETTES = {
    neon: ['#ff2e97', '#00e5ff', '#b14dff', '#3affc0', '#ffd23f', '#ff5c33'],
    ice: ['#7fd7ff', '#c9f2ff', '#4d8fff', '#a9c8ff', '#e8f7ff', '#5fe2ff'],
    sunset: ['#ff6b35', '#ff2e63', '#ffd23f', '#ff8c42', '#c1121f', '#ffb703'],
    toxic: ['#aaff00', '#39ff14', '#00ffc8', '#ccff33', '#00e676', '#7bff4d'],
    mono: ['#ffffff', '#dcdcff', '#b8b8ff', '#ffffff', '#e6e6ff', '#cfcfff'],
    candy: ['#ff6bcb', '#ffb347', '#87cefa', '#ff85a2', '#c9a0ff', '#ffe066'],
    ocean: ['#0077b6', '#00b4d8', '#90e0ef', '#023e8a', '#48cae4', '#ade8f4'],
    fire: ['#ff4500', '#ff6b00', '#ffaa00', '#ff2200', '#ff8800', '#ffd000'],
    galaxy: ['#7b2cbf', '#5a189a', '#e0aaff', '#240046', '#9d4edd', '#c77dff'],
    sakura: ['#ffb7c5', '#ff8fab', '#ffc8dd', '#ffafcc', '#f72585', '#ffd6e0'],
    cyber: ['#00ff9f', '#00d4ff', '#ff00aa', '#39ff14', '#00ffff', '#bf00ff'],
    gold: ['#ffd700', '#ffb700', '#fff4b0', '#c9a227', '#ffe566', '#ffec8b'],
    blood: ['#8b0000', '#dc143c', '#ff1744', '#b71c1c', '#ff5252', '#ff6e6e'],
    mint: ['#98ff98', '#00fa9a', '#7fffd4', '#40e0d0', '#a8ffe0', '#00ced1'],
    violet: ['#9400d3', '#8a2be2', '#da70d6', '#4b0082', '#ba55d3', '#dda0dd']
};

export const PALETTE_IDS = Object.keys(PALETTES);

function pickRandomId(list, currentId) {
    if (!list?.length) return currentId;
    if (list.length === 1) return list[0];
    let next = currentId;
    for (let n = 0; n < 12 && next === currentId; n++) {
        next = list[Math.floor(Math.random() * list.length)];
    }
    return next;
}

export function createDanceScene(container, opts = {}) {
    const lightThrottle = opts.lightThrottle !== false;
    const useLedWorker = opts.useLedWorker !== false;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0418, 0.014);

    function readSize() {
        const rect = container.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width) || container.clientWidth || window.innerWidth || 800);
        const h = Math.max(1, Math.round(rect.height) || container.clientHeight || window.innerHeight || 600);
        return { w, h };
    }

    function syncCanvasCss() {
        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }

    const { w: initW, h: initH } = readSize();

    const camera = new THREE.PerspectiveCamera(
        58,
        initW / initH,
        0.1,
        400
    );
    camera.position.set(0, 10, 28);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(initW, initH, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    syncCanvasCss();

    /* ---------------------------------------------------------------- *
     * Ambient base
     * ---------------------------------------------------------------- */
    const ambientLight = new THREE.AmbientLight(0x3a2a5c, 0.5);
    scene.add(ambientLight);
    const hemi = new THREE.HemisphereLight(0x6f4dff, 0x120820, 0.6);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.35);
    keyLight.position.set(4, 16, 12);
    scene.add(keyLight);

    /* ---------------------------------------------------------------- *
     * Floor + LED dance tiles
     * ---------------------------------------------------------------- */
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(ROOM.radius, 48),
        new THREE.MeshStandardMaterial({
            color: 0x0b0716,
            roughness: 0.18,
            metalness: 0.82
        })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const TILE_GRID_X = FLOOR_TILE.gridX;
    const TILE_GRID_Z = FLOOR_TILE.gridZ;
    const TILE_SPAN_X = FLOOR_TILE.spanX;
    const TILE_SPAN_Z = FLOOR_TILE.spanZ;
    const WING_COLS = FLOOR_TILE.wingCols;
    const WING_RISER_Y = FLOOR_TILE.wingRiserY;
    const tileSizeX = TILE_SPAN_X / TILE_GRID_X;
    const tileSizeZ = TILE_SPAN_Z / TILE_GRID_Z;
    const tileCount = TILE_GRID_X * TILE_GRID_Z;
    const tileGeo = new THREE.PlaneGeometry(tileSizeX * 0.9, tileSizeZ * 0.9);
    const tileMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, tileCount);
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tileCount * 3), 3);
    const tileState = [];
    {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        const s = new THREE.Vector3(1, 1, 1);
        let i = 0;
        for (let gx = 0; gx < TILE_GRID_X; gx++) {
            for (let gz = 0; gz < TILE_GRID_Z; gz++) {
                const isWing = gx < WING_COLS || gx >= TILE_GRID_X - WING_COLS;
                // Flat dance floor — L/R wings same height as center (only DJ riser is elevated)
                const y = 0.03;
                const x = (gx - (TILE_GRID_X - 1) / 2) * tileSizeX;
                const z = (gz - (TILE_GRID_Z - 1) / 2) * tileSizeZ + FLOOR_TILE.zOffset;
                m.compose(new THREE.Vector3(x, y, z), q, s);
                tiles.setMatrixAt(i, m);
                tileState.push({ level: Math.random(), color: new THREE.Color(0x110022), gx, gz, isWing });
                i++;
            }
        }
        tiles.instanceMatrix.needsUpdate = true;
    }
    scene.add(tiles);

    /* L/R wing markers removed — floor is one flat plane (DJ riser stays elevated) */
    if (WING_RISER_Y > 0.05) {
        const wingDepth = TILE_SPAN_Z;
        const wingWidth = WING_COLS * tileSizeX;
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x120d22, roughness: 0.58, metalness: 0.35 });
        [-1, 1].forEach((side) => {
            const platform = new THREE.Mesh(
                new THREE.BoxGeometry(wingWidth, WING_RISER_Y, wingDepth),
                wingMat
            );
            platform.position.set(
                side * (TILE_SPAN_X / 2 - wingWidth / 2),
                WING_RISER_Y / 2,
                FLOOR_TILE.zOffset
            );
            scene.add(platform);
        });
    }

    /* ---------------------------------------------------------------- *
     * Stage riser + DJ booth
     * ---------------------------------------------------------------- */
    const stageGroup = new THREE.Group();
    stageGroup.position.z = ROOM.stageZ;
    scene.add(stageGroup);

    const riserW = FLOOR_TILE.spanX;
    const riser = new THREE.Mesh(
        new THREE.BoxGeometry(riserW, 2.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x140f24, roughness: 0.55, metalness: 0.35 })
    );
    riser.position.y = 1.1;
    stageGroup.add(riser);

    const riserEdge = new THREE.Mesh(
        new THREE.BoxGeometry(riserW + 0.3, 0.16, 5.3),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    riserEdge.position.y = 2.26;
    stageGroup.add(riserEdge);

    const booth = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, 1.9, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x1b1330, roughness: 0.4, metalness: 0.5 })
    );
    booth.position.set(0, 3.15, -1.05);
    stageGroup.add(booth);

    const boothGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(6.0, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xff2e97, transparent: true, opacity: 0.85 })
    );
    boothGlow.position.set(0, 3.25, 0.08);
    stageGroup.add(boothGlow);

    const boothBrand = createBoothBrand(stageGroup, { y: 3.25, z: 0.12 });
    if (opts.brandText || opts.brandLogo) {
        boothBrand.setBrand({ text: opts.brandText, logoUrl: opts.brandLogo, accent: opts.brandAccent });
    }

    const clubStatsScreen = createClubStatsScreen(scene);

    /* ---------------------------------------------------------------- *
     * LED video wall (behind the stage) — full DJ riser width
     * ---------------------------------------------------------------- */
    const WALL_COLS = STAGE_LED_WALL.cols;
    const WALL_ROWS = STAGE_LED_WALL.rows;
    const wallPanelW = STAGE_LED_WALL.panelW;
    const wallPanelH = STAGE_LED_WALL.panelH;
    const wallZ = STAGE_LED_WALL.z;
    const wallCount = WALL_COLS * WALL_ROWS;
    const wallGeo = new THREE.PlaneGeometry(wallPanelW * 0.92, wallPanelH * 0.92);
    const wallMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const ledWall = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    ledWall.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(wallCount * 3), 3);
    const wallState = [];
    {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3(1, 1, 1);
        let i = 0;
        for (let c = 0; c < WALL_COLS; c++) {
            for (let r = 0; r < WALL_ROWS; r++) {
                const x = (c - (WALL_COLS - 1) / 2) * wallPanelW;
                const y = STAGE_LED_WALL.yBase + r * wallPanelH;
                m.compose(new THREE.Vector3(x, y, wallZ), q, s);
                ledWall.setMatrixAt(i, m);
                wallState.push({ col: c, row: r, level: 0, color: new THREE.Color(0x110022) });
                i++;
            }
        }
        ledWall.instanceMatrix.needsUpdate = true;
    }
    scene.add(ledWall);

    /* ---------------------------------------------------------------- *
     * Overhead truss
     * ---------------------------------------------------------------- */
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x2b2b34, roughness: 0.7, metalness: 0.6 });
    const trussGroup = new THREE.Group();
    [-6, 0, 6].forEach((z) => {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 40, 8), trussMat);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, ROOM.ceilingHeight - 2.2, z);
        trussGroup.add(bar);
    });
    [-16, -8, 8, 16].forEach((x) => {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 20, 8), trussMat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(x, ROOM.ceilingHeight - 2.2, 0);
        trussGroup.add(bar);
    });
    scene.add(trussGroup);

    /* ---------------------------------------------------------------- *
     * Concert Arch Stage — Stage 2 (neon ring arches + tiered steps)
     * ---------------------------------------------------------------- */
    const concertStageGroup = new THREE.Group();
    concertStageGroup.visible = false;
    scene.add(concertStageGroup);

    {
        const sz = ROOM.stageZ;

        // --- Tiered circular steps ---
        const stepData = [
            { r: 9.5, h: 0.45, col: 0xf4e8f0 },
            { r: 7.8, h: 0.45, col: 0xf0dcea },
            { r: 6.2, h: 0.45, col: 0xecceE4 },
            { r: 4.7, h: 0.45, col: 0xe8c0de },
        ];
        const stepBase = sz + 2.4;
        const stepEdgeColors = [0xff88cc, 0xcc88ff, 0x88aaff, 0x44ddff];

        let cY = 0;
        stepData.forEach(({ r, h, col }, idx) => {
            const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.08 });
            const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.55, h, 40), mat);
            step.position.set(0, cY + h * 0.5, stepBase);
            concertStageGroup.add(step);

            const edgeMat = new THREE.MeshBasicMaterial({ color: stepEdgeColors[idx] });
            const edge = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.07, 6, 40), edgeMat);
            edge.position.set(0, cY + h, stepBase);
            edge.rotation.x = Math.PI * 0.5;
            concertStageGroup.add(edge);

            const edgeGlowMat = new THREE.MeshBasicMaterial({
                color: stepEdgeColors[idx], transparent: true, opacity: 0.2,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const edgeGlow = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.28, 6, 40), edgeGlowMat);
            edgeGlow.position.copy(edge.position);
            edgeGlow.rotation.x = Math.PI * 0.5;
            concertStageGroup.add(edgeGlow);

            cY += h;
        });

        // Top platform disc
        const platMat = new THREE.MeshStandardMaterial({ color: 0xfff0f8, roughness: 0.4, metalness: 0.15 });
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.7, 0.28, 40), platMat);
        plat.position.set(0, cY + 0.14, stepBase);
        concertStageGroup.add(plat);

        // Top platform glow rim
        const platEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const platEdge = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.09, 6, 40), platEdgeMat);
        platEdge.position.set(0, cY + 0.28, stepBase);
        platEdge.rotation.x = Math.PI * 0.5;
        concertStageGroup.add(platEdge);

        // Minimal DJ podium on top platform
        const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1a0f28, roughness: 0.4, metalness: 0.55 });
        const podium = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.4, 1.8), podiumMat);
        podium.position.set(0, cY + 0.28 + 0.7, stepBase - 0.6);
        concertStageGroup.add(podium);

        const podiumGlowMat = new THREE.MeshBasicMaterial({ color: 0xff44aa, transparent: true, opacity: 0.88 });
        const podiumGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.95), podiumGlowMat);
        podiumGlow.position.set(0, cY + 0.28 + 0.7, stepBase - 0.6 + 0.91);
        concertStageGroup.add(podiumGlow);

        // --- Neon Arch Rings ---
        // TorusGeometry lies in XY plane (Z-axis through hole). Camera looks along -Z, so we see rings face-on.
        const archZ = sz - 0.5;
        const archCY = 0.5; // center slightly above floor
        const archRings = [
            { r: 4.0, tube: 0.13, color: 0xff88ee, glow: 0xff44bb },
            { r: 6.0, tube: 0.13, color: 0xcc88ff, glow: 0x9933ff },
            { r: 8.0, tube: 0.12, color: 0x8899ff, glow: 0x4455ff },
            { r: 10.2, tube: 0.12, color: 0x44ccff, glow: 0x0099ee },
            { r: 12.5, tube: 0.11, color: 0x44ffee, glow: 0x00bbaa },
        ];

        archRings.forEach(({ r, tube, color, glow }) => {
            const ringMat = new THREE.MeshBasicMaterial({ color });
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 80), ringMat);
            ring.position.set(0, archCY, archZ);
            concertStageGroup.add(ring);

            const glowMat = new THREE.MeshBasicMaterial({
                color: glow, transparent: true, opacity: 0.22,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            const glowRing = new THREE.Mesh(new THREE.TorusGeometry(r, tube * 3.5, 8, 80), glowMat);
            glowRing.position.set(0, archCY, archZ);
            concertStageGroup.add(glowRing);
        });

        // --- Side curtain drapes ---
        const drapeColors = [0x0a0610, 0x120820];
        [-1, 1].forEach((side) => {
            [0, 1].forEach((layer) => {
                const drapeMat = new THREE.MeshStandardMaterial({
                    color: drapeColors[layer], roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
                });
                const drape = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 16), drapeMat);
                drape.position.set(side * (13.5 + layer * 1.8), 8, sz - 1.5 + layer * 1.2);
                drape.rotation.y = -side * (0.12 + layer * 0.06);
                concertStageGroup.add(drape);
            });

            // Neon trim on curtain edge
            const trimMat = new THREE.MeshBasicMaterial({
                color: side < 0 ? 0xff66cc : 0x66ccff, transparent: true, opacity: 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 14, 0.06), trimMat);
            trim.position.set(side * 12.6, 7, sz - 1.2);
            concertStageGroup.add(trim);
        });

        // --- Back wall panel (behind arches) ---
        const backMat = new THREE.MeshStandardMaterial({ color: 0x08051a, roughness: 0.88, metalness: 0.05 });
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), backMat);
        backWall.position.set(0, 9, sz - 5.5);
        concertStageGroup.add(backWall);

        // --- Floor spot circles under arch rings ---
        [4, 7, 10].forEach((r, i) => {
            const spotMat = new THREE.MeshBasicMaterial({
                color: stepEdgeColors[i] || 0xffffff, transparent: true, opacity: 0.12,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const spotCircle = new THREE.Mesh(new THREE.CircleGeometry(r, 48), spotMat);
            spotCircle.rotation.x = -Math.PI * 0.5;
            spotCircle.position.set(0, 0.02, sz + 0.5);
            concertStageGroup.add(spotCircle);
        });
    }

    /* ---------------------------------------------------------------- *
     * Stage shape state
     * ---------------------------------------------------------------- */
    let currentStageShape = opts.stageShape || 'classic';

    function setStageShape(shape) {
        const isConcert = shape === 'concert';
        stageGroup.visible = !isConcert;
        trussGroup.visible = !isConcert;
        concertStageGroup.visible = isConcert;
        currentStageShape = shape;

        if (isConcert) {
            // ── Concert Arch: hide LED wall, hide all classic lighting fixtures ──
            ledWall.visible = false;
            movingHeads.forEach((h) => {
                h.group.visible = false;
                h.spot.visible = false;
            });
            lasers.forEach((l) => { l.beam.visible = false; });
            washes.forEach((w) => {
                w.bar.visible = false;
                w.light.visible = false;
            });
            strobes.forEach((s) => {
                s.panel.visible = false;
                s.light.visible = false;
            });
        } else {
            // ── Classic: restore everything ──
            ledWall.visible = true;
            movingHeads.forEach((h) => {
                h.group.visible = true;
                h.spot.visible = true;
            });
            lasers.forEach((l) => { l.beam.visible = true; });
            washes.forEach((w) => {
                w.bar.visible = true;
                w.light.visible = true;
            });
            strobes.forEach((s) => {
                s.panel.visible = true;
                s.light.visible = true;
            });
        }
    }

    function getStageShape() { return currentStageShape; }

    /* ---------------------------------------------------------------- *
     * Moving-head spotlights with visible cone beams
     * ---------------------------------------------------------------- */
    let palette = PALETTES[opts.palette || 'neon'];
    let currentPaletteId = opts.palette || 'neon';

    const movingHeads = [];
    const HEAD_LAYOUT = [
        { x: -14, z: -8 }, { x: -7, z: -8 }, { x: 0, z: -8 }, { x: 7, z: -8 }, { x: 14, z: -8 },
        { x: -12, z: 2 }, { x: -4, z: 2 }, { x: 4, z: 2 }, { x: 12, z: 2 },
        { x: -8, z: 8 }, { x: 0, z: 8 }, { x: 8, z: 8 }
    ];

    HEAD_LAYOUT.forEach((pos, i) => {
        const color = new THREE.Color(palette[i % palette.length]);
        const group = new THREE.Group();
        group.position.set(pos.x, ROOM.ceilingHeight - 2.6, pos.z);
        scene.add(group);

        const yoke = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.4, 0.55),
            new THREE.MeshStandardMaterial({ color: 0x1d1d24, roughness: 0.6, metalness: 0.5 })
        );
        group.add(yoke);

        const head = new THREE.Group();
        head.position.y = -0.35;
        group.add(head);

        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12),
            new THREE.MeshStandardMaterial({ color: 0x24242e, roughness: 0.5, metalness: 0.6 })
        );
        barrel.position.y = -0.35;
        head.add(barrel);

        const lens = new THREE.Mesh(
            new THREE.CircleGeometry(0.29, 20),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.y = -0.71;
        head.add(lens);

        // Visible haze cone
        const beamLen = 22;
        const beamGeo = new THREE.ConeGeometry(0.85, beamLen, 12, 1, true);
        beamGeo.translate(0, -beamLen / 2, 0);
        const beamMat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = -0.7;
        head.add(beam);

        const spot = new THREE.SpotLight(color, 30, 40, Math.PI / 9, 0.45, 1.4);
        spot.position.set(0, -0.7, 0);
        head.add(spot);
        const target = new THREE.Object3D();
        target.position.set(pos.x * 0.4, 0, pos.z * 0.4);
        scene.add(target);
        spot.target = target;

        movingHeads.push({
            group, head, spot, beam, lens, target, color: color.clone(),
            baseColor: color.clone(),
            index: i,
            homeX: pos.x, homeZ: pos.z,
            panPhase: Math.random() * Math.PI * 2,
            tiltPhase: Math.random() * Math.PI * 2,
            panSmooth: 0,
            tiltSmooth: 0.4
        });
    });

    /* ---------------------------------------------------------------- *
     * Laser fans
     * ---------------------------------------------------------------- */
    const lasers = [];
    [-15, 15].forEach((x, side) => {
        const rig = new THREE.Group();
        rig.position.set(x, 8.5, ROOM.stageZ + 2);
        scene.add(rig);
        for (let i = 0; i < 9; i++) {
            const color = new THREE.Color(palette[(i + side * 3) % palette.length]);
            const len = 34;
            const geo = new THREE.CylinderGeometry(0.035, 0.05, len, 5, 1, true);
            geo.translate(0, -len / 2, 0);
            const beam = new THREE.Mesh(
                geo,
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.5,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            );
            beam.rotation.z = (side ? -1 : 1) * (0.35 + i * 0.11);
            rig.add(beam);
            lasers.push({ beam, rig, index: i, side, base: beam.rotation.z, color });
        }
    });

    /* ---------------------------------------------------------------- *
     * Side wash bars + strobes
     * ---------------------------------------------------------------- */
    const washes = [];
    WASH_BAR_LAYOUT.forEach((pos, i) => {
        const color = new THREE.Color(palette[(i * 2 + (pos.side > 0 ? 1 : 0)) % palette.length]);
        const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 3.8, 0.22),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
        );
        bar.position.set(pos.x, pos.y, pos.z);
        scene.add(bar);
        const pl = new THREE.PointLight(color, 5.5, 18, 2.0);
        pl.position.copy(bar.position);
        scene.add(pl);
        washes.push({ bar, light: pl, color: color.clone(), index: i, side: pos.side });
    });

    const strobes = [];
    [-9, -3, 3, 9].forEach((x, i) => {
        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(2.6, 0.7),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
        );
        panel.position.set(x, ROOM.ceilingHeight - 3.6, ROOM.stageZ + 3.5);
        scene.add(panel);
        const light = new THREE.PointLight(0xffffff, 0, 34, 1.5);
        light.position.copy(panel.position);
        scene.add(light);
        strobes.push({ panel, light, index: i });
    });

    /* ---------------------------------------------------------------- *
     * Room shell (subtle walls so fog has something to catch)
     * ---------------------------------------------------------------- */
    const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(ROOM.radius + 2, ROOM.radius + 2, ROOM.ceilingHeight + 8, 32, 1, true),
        new THREE.MeshStandardMaterial({
            color: 0x0a0616,
            roughness: 0.95,
            metalness: 0.1,
            side: THREE.BackSide
        })
    );
    shell.position.y = (ROOM.ceilingHeight + 8) / 2 - 2;
    scene.add(shell);

    /* ---------------------------------------------------------------- *
     * Haze particles
     * ---------------------------------------------------------------- */
    const HAZE = 180;
    const hazeGeo = new THREE.BufferGeometry();
    const hazePos = new Float32Array(HAZE * 3);
    for (let i = 0; i < HAZE; i++) {
        hazePos[i * 3] = (Math.random() - 0.5) * 46;
        hazePos[i * 3 + 1] = Math.random() * ROOM.ceilingHeight;
        hazePos[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    hazeGeo.setAttribute('position', new THREE.BufferAttribute(hazePos, 3));
    const haze = new THREE.Points(
        hazeGeo,
        new THREE.PointsMaterial({
            color: 0xb99cff,
            size: 0.16,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    scene.add(haze);

    /* ---------------------------------------------------------------- *
     * Background
     * ---------------------------------------------------------------- */
    const background = createBackground(scene, { width: (ROOM.radius + 4) * 2.2, height: 44 });
    background.mesh.visible = false;
    background.setReactivity?.(0);
    background.setTheme(opts.background || 'retrowave', { instant: true });

    const profileWallpaper = createProfileWallpaper(scene);
    const topScreen = createTopScreen(scene);
    const sayBanner = createSayBanner(scene);
    const stageEffects = createStageEffects(scene, {
        floorZ: 2,
        useStageFxWorker: opts.useStageFxWorker !== false
    });

    const videoBackdrop = createVideoBackdrop(scene, {
        wallCols: WALL_COLS,
        wallRows: WALL_ROWS,
        wallPanelW,
        wallPanelH,
        wallZ: ROOM.stageZ - 4.22,
        wallY0: 2.4,
        tileCols: TILE_GRID_X,
        tileRows: TILE_GRID_Z,
        tileSpanX: TILE_SPAN_X,
        tileSpanZ: TILE_SPAN_Z,
        tileZOffset: 2.0,
        wingCols: WING_COLS,
        wingRiserY: WING_RISER_Y
    });
    const stageYoutube = createStageYoutube({ container, camera, renderer });
    const paletteBeatCycle = createBeatCycle(8);
    const patternBeatCycle = createBeatCycle(12);
    const dynamicFxBeatCycle = createBeatCycle(8);
    const ledBridge = createLedWorkerBridge({ useWorker: useLedWorker });
    let ledWorkerInited = false;

    function ensureLedWorker() {
        if (ledWorkerInited || !ledBridge.isActive()) return;
        ledBridge.init({
            wallMeta: wallState.map((s) => ({ col: s.col, row: s.row })),
            tileMeta: tileState.map((s) => ({ gx: s.gx, gz: s.gz })),
            palette,
            wallCount: wallState.length,
            tileCount: tileState.length
        });
        ledWorkerInited = true;
    }

    /* ---------------------------------------------------------------- *
     * Post processing
     * ---------------------------------------------------------------- */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, initW * 0.5), Math.max(1, initH * 0.5)),
        0.72, 0.55, 0.78
    );
    composer.addPass(bloom);
    let bloomEnabled = true;
    let bloomWarmFrames = 0;

    /* ---------------------------------------------------------------- *
     * Light rig state / behaviour
     * ---------------------------------------------------------------- */
    const rig = {
        intensity: 1,
        beatReact: 1,
        strobeEnabled: true,
        lasersEnabled: true,
        beamsEnabled: true,
        pattern: 'sweep',
        lastBeatIndex: -1,
        colorShift: 0,
        strobeUntil: 0,
        beatHitTimes: [],
        beatDensity: 0,
        patternPhase: 0,
        autoPalette: false,
        autoPaletteBeat: 8,
        paletteBeatCount: 0,
        autoPattern: false,
        autoPatternBeat: 12,
        patternBeatCount: 0,
        soloSpotlight: false,
        soloCenterX: 0,
        soloFx: false,
        beatReactive: true,
        dynamicFx: 'fadePulse',
        autoDynamicFx: true,
        dynamicFxBeat: 8,
        fxBarsHeld: 0,
        fxMoodStreak: 0,
        lastFxMood: 'groove',
        flashTier: 0,
        targetFlashTier: 0,
        lastRapidFxAt: 0,
        lastBpm: 128,
        lightFrame: 0,
        crowdLevel: 0,
        lightMask: {
            movingHeads: true,
            washes: true,
            strobes: true,
            lasers: true,
            beams: true,
            ledWall: true,
            ledFloor: true
        }
    };

    let savedYoutubeLights = null;
    let stageYoutubeActive = false;

    /** @type {{ palette: string, pattern: string, background: string, dynamicFx: string }} */
    const reactiveModes = {
        palette: 'ai',
        pattern: 'ai',
        background: 'ai',
        dynamicFx: 'ai'
    };

    function setReactiveMode(category, mode) {
        const m = mode === 'beats' ? 'beats' : mode === 'off' ? 'off' : 'ai';
        if (category === 'palette') {
            reactiveModes.palette = m;
            rig.autoPalette = m === 'beats';
        } else if (category === 'pattern') {
            reactiveModes.pattern = m;
            rig.autoPattern = m === 'beats';
        } else if (category === 'background') {
            reactiveModes.background = m;
            background.setReactiveMode?.(m);
        } else if (category === 'dynamicFx') {
            reactiveModes.dynamicFx = m;
            rig.autoDynamicFx = m === 'beats';
        }
    }

    function getReactiveModes() {
        return { ...reactiveModes };
    }

    let beatReactiveSlot = 0;
    let lastReactiveAt = 0;
    let lastPatternReactiveAt = 0;

    function fireBeatReactive(energy = 0.5) {
        const now = performance.now();
        const minGap = lightThrottle ? 450 : 280;
        if (now - lastReactiveAt < minGap) return;
        lastReactiveAt = now;

        if (reactiveModes.palette === 'ai') nextPalette();
        if (reactiveModes.pattern === 'ai' && now - lastPatternReactiveAt >= 1500) {
            nextPattern();
            lastPatternReactiveAt = now;
        }
        if (reactiveModes.background === 'ai') background.nextTheme();
        if (energy > 0.82 && reactiveModes.pattern === 'ai' && now - lastPatternReactiveAt >= 900) {
            nextPattern();
            lastPatternReactiveAt = now;
        }

        beatReactiveSlot++;
        rig.strobeUntil = performance.now() + 90 + energy * 70;
    }

    function setBeatReactive(on) {
        rig.beatReactive = !!on;
        if (!on) {
            reactiveModes.palette = reactiveModes.palette === 'ai' ? 'off' : reactiveModes.palette;
            reactiveModes.pattern = reactiveModes.pattern === 'ai' ? 'off' : reactiveModes.pattern;
            reactiveModes.background = reactiveModes.background === 'ai' ? 'off' : reactiveModes.background;
            reactiveModes.dynamicFx = reactiveModes.dynamicFx === 'ai' ? 'off' : reactiveModes.dynamicFx;
        }
    }

    function setDynamicFx(id) {
        rig.dynamicFx = DYNAMIC_FX_IDS.includes(id) ? id : 'off';
        return rig.dynamicFx;
    }

    function nextDynamicFx() {
        return nextIntelligentFx({ beatDensity: rig.beatDensity, bpm: rig.lastBpm });
    }

    function nextIntelligentFx(audio = {}) {
        const ctx = analyzeBeatContext({
            ...audio,
            beatDensity: rig.beatDensity,
            bpm: audio.bpm || rig.lastBpm || 128
        });
        const sameMood = ctx.mood === rig.lastFxMood;
        rig.fxBarsHeld = sameMood ? rig.fxBarsHeld + 1 : 0;
        rig.lastFxMood = ctx.mood;
        rig.dynamicFx = pickFxForContext(ctx, rig.dynamicFx, { barsHeld: rig.fxBarsHeld });
        if (!sameMood) rig.fxBarsHeld = 1;
        return rig.dynamicFx;
    }

    function nextPaletteAndFx() {
        nextPalette();
        nextIntelligentFx();
        return { palette: currentPaletteId, dynamicFx: rig.dynamicFx };
    }

    function setDynamicFxAuto(on, beats) {
        rig.autoDynamicFx = !!on;
        reactiveModes.dynamicFx = on ? 'beats' : (reactiveModes.dynamicFx === 'beats' ? 'off' : reactiveModes.dynamicFx);
        setBeatCycleEvery(dynamicFxBeatCycle, beats || 8);
    }

    const PATTERNS = [
        'sweep', 'crossFan', 'chase', 'random', 'lockCenter',
        'wave', 'pendulum', 'spiral', 'ripple', 'pulse',
        'orbit', 'zigzag', 'breathe', 'stadium', 'laserScan'
    ];

    function setPalette(id) {
        currentPaletteId = PALETTE_IDS.includes(id) ? id : 'neon';
        palette = PALETTES[currentPaletteId] || PALETTES.neon;
        movingHeads.forEach((h, i) => {
            h.baseColor.set(palette[i % palette.length]);
        });
        lasers.forEach((l, i) => l.color.set(palette[i % palette.length]));
        washes.forEach((w, i) => w.color.set(palette[i % palette.length]));
        if (ledWorkerInited) ledBridge.setPalette(palette);

        // ── Concert arch ring colors ──
        if (currentStageShape === 'concert') {
            concertStageGroup.traverse((m) => {
                if (!m.material) return;
                const mat = m.material;
                if (mat.blending === THREE.AdditiveBlending && mat.transparent) {
                    // Glow elements: tint with palette
                    const idx = Math.abs(m.position?.x || 0) * 0.5 + Math.abs(m.position?.y || 0) * 0.8;
                    mat.color.set(palette[Math.floor(idx) % palette.length]);
                }
            });
        }
    }
    if (opts.palette) setPalette(opts.palette);

    function nextPalette() {
        setPalette(pickRandomId(PALETTE_IDS, currentPaletteId));
        return currentPaletteId;
    }

    function setPaletteAuto(on, beats) {
        rig.autoPalette = !!on;
        reactiveModes.palette = on ? 'beats' : (reactiveModes.palette === 'beats' ? 'off' : reactiveModes.palette);
        setBeatCycleEvery(paletteBeatCycle, beats || 8);
    }

    function setPatternAuto(on, beats) {
        rig.autoPattern = !!on;
        reactiveModes.pattern = on ? 'beats' : (reactiveModes.pattern === 'beats' ? 'off' : reactiveModes.pattern);
        setBeatCycleEvery(patternBeatCycle, beats || 12);
    }

    function setSoloSpotlight(on, centerX = 0) {
        rig.soloSpotlight = !!on;
        rig.soloCenterX = centerX;
    }

    function setSoloFx(on) {
        rig.soloFx = !!on;
        if (on) {
            rig.strobeEnabled = true;
            rig.lasersEnabled = true;
            rig.beamsEnabled = true;
            bloom.strength = Math.max(bloom.strength, 1.1);
        }
    }

    function setPattern(p) {
        rig.pattern = PATTERNS.includes(p) ? p : 'sweep';
    }
    function nextPattern() {
        rig.pattern = pickRandomId(PATTERNS, rig.pattern);
        return rig.pattern;
    }

    let currentVenueId = opts.venue || 'neon_club';
    let venueAuto = false;
    let venueAutoBeats = 32;
    const venueBeatCycle = createBeatCycle(32);

    function applyVenueColors(v) {
        if (scene.fog) scene.fog.color.set(v.fog);
        floor.material.color.set(v.floor);
        riser.material.color.set(v.stage);
        ambientLight.color.set(v.ambient);
        hemi.color.set(v.hemiSky);
        hemi.groundColor.set(v.hemiGround);
        const tileBase = new THREE.Color(v.tile);
        tileState.forEach((st) => st.color.copy(tileBase));
        const wallBase = new THREE.Color(v.wall);
        wallState.forEach((st) => st.color.copy(wallBase));
        haze.material.color.set(v.hemiSky);

        // ── Concert arch elements ──
        if (concertStageGroup.visible) {
            const stepCols = [
                0xfff0e6, 0xf8e0d8, 0xf0d0ca, 0xe8c0bc,
            ];
            const archCols = [
                0xffc0dd, 0xd8b0ff, 0xa0c0ff, 0x80e0ff, 0x60f0e0,
            ];
            concertStageGroup.children.forEach((child) => {
                if (!child.material) return;
                if (child.material.color && child.material.type === 'MeshBasicMaterial') {
                    // Neon edges / rings: use venue accent color family
                    const c = new THREE.Color(v.hemiSky);
                    const lum = 0.2126*c.r + 0.7152*c.g + 0.0722*c.b;
                    // Neon edges / rings: use venue accent color family
                    child.material.color.set(v.hemiSky);
                    child.material.color.offsetHSL(0, 0.05, 0.15);
                }
            });
            // Glow rings: use venue sky color
            concertStageGroup.traverse((m) => {
                if (m.material && m.material.blending === THREE.AdditiveBlending && m.material.transparent) {
                    m.material.color.set(v.hemiSky);
                    m.material.color.offsetHSL(0, 0.1, 0.1);
                }
            });
        }
    }

    function applyVenue(id, options = {}) {
        const v = getVenue(id || currentVenueId);
        if (!v) return v;
        currentVenueId = v.id;
        setPalette(v.palette);
        setStageShape(v.stageShape || 'classic');

        const applyTheme = () => {
            if (!videoBackdrop.active) {
                background.setTheme(v.background, { instant: !!options.instant });
                background.mesh.visible = false;
            }
            applyVenueColors(v);
        };

        if (options.instant) {
            applyTheme();
            return v;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(applyTheme);
        });
        return v;
    }

    function nextVenue() {
        const idx = VENUE_IDS.indexOf(currentVenueId);
        const next = VENUE_IDS[(idx + 1) % VENUE_IDS.length];
        return applyVenue(next);
    }

    function setVenueAuto(on, beats) {
        venueAuto = !!on;
        venueAutoBeats = beats || 32;
        setBeatCycleEvery(venueBeatCycle, venueAutoBeats);
    }

    function getVenueId() {
        return currentVenueId;
    }

    function getVenueAuto() {
        return venueAuto;
    }

    function initDefaultRoom() {
        applyVenue(currentVenueId, { instant: true });
        rig.lasersEnabled = true;
    }

    function setLedSpectrumVisible(on) {
        if (stageYoutubeActive) {
            // YouTube covers the back wall — keep wall hidden; floor follows mask
            ledWall.visible = false;
            tiles.visible = rig.lightMask.ledFloor === true;
            return;
        }
        ledWall.visible = !!on && rig.lightMask.ledWall !== false;
        tiles.visible = !!on && rig.lightMask.ledFloor !== false;
    }

    function setLightMask(mask = {}) {
        Object.assign(rig.lightMask, mask);
        if (stageYoutubeActive) {
            ledWall.visible = false;
            tiles.visible = rig.lightMask.ledFloor === true;
        } else {
            ledWall.visible = rig.lightMask.ledWall !== false;
            tiles.visible = rig.lightMask.ledFloor !== false;
        }
    }

    function setLightMaskAll(on) {
        const v = !!on;
        setLightMask({
            movingHeads: v,
            washes: v,
            strobes: v,
            lasers: v,
            beams: v,
            ledWall: v,
            ledFloor: v
        });
    }

    function syncLightFlagsFromMask(mask) {
        if (mask.strobes != null) rig.strobeEnabled = !!mask.strobes;
        if (mask.lasers != null) rig.lasersEnabled = !!mask.lasers;
        if (mask.beams != null) rig.beamsEnabled = !!mask.beams;
    }

    function applyStageYoutubeLightPreset(preset, customMask) {
        if (!savedYoutubeLights) {
            savedYoutubeLights = {
                lightMask: { ...rig.lightMask },
                intensity: rig.intensity,
                strobeEnabled: rig.strobeEnabled,
                lasersEnabled: rig.lasersEnabled,
                beamsEnabled: rig.beamsEnabled,
                pattern: rig.pattern
            };
        }

        if (preset === 'off') {
            setLightMaskAll(false);
            rig.intensity = 0.04;
            rig.strobeEnabled = false;
            rig.lasersEnabled = false;
            rig.beamsEnabled = false;
        } else if (preset === 'screen') {
            setLightMask({
                movingHeads: true,
                washes: false,
                strobes: false,
                lasers: false,
                beams: false,
                ledWall: false,
                ledFloor: false
            });
            rig.intensity = 0.7;
            rig.pattern = 'lockCenter';
            rig.strobeEnabled = false;
            rig.lasersEnabled = false;
            rig.beamsEnabled = false;
        } else if (preset === 'custom') {
            const mask = customMask || { ...rig.lightMask };
            setLightMask(mask);
            syncLightFlagsFromMask(mask);
            // Restore usable intensity after "off" / "screen" presets
            if (rig.intensity < 0.35) rig.intensity = 1;
            const anyOn = Object.values(mask).some(Boolean);
            if (anyOn && rig.intensity < 0.5) rig.intensity = 1;
        }
    }

    function restoreStageYoutubeLights() {
        if (!savedYoutubeLights) return;
        rig.lightMask = { ...savedYoutubeLights.lightMask };
        rig.intensity = savedYoutubeLights.intensity;
        rig.strobeEnabled = savedYoutubeLights.strobeEnabled;
        rig.lasersEnabled = savedYoutubeLights.lasersEnabled;
        rig.beamsEnabled = savedYoutubeLights.beamsEnabled;
        rig.pattern = savedYoutubeLights.pattern;
        savedYoutubeLights = null;
        ledWall.visible = rig.lightMask.ledWall !== false;
        tiles.visible = rig.lightMask.ledFloor !== false;
    }

    async function setStageYoutube(url, lightOpts = {}) {
        if (videoBackdrop.active) clearVideoBackdrop();
        applyStageYoutubeLightPreset(lightOpts.preset || 'screen', lightOpts.mask);
        stageYoutubeActive = true;
        setLedSpectrumVisible(false);
        try {
            // Visual muted — sound comes from audio engine (runtime wires loadYouTube)
            const ok = await stageYoutube.load(url, {
                visualMuted: lightOpts.visualMuted !== false,
                sound: lightOpts.sound === true
            });
            if (!ok) {
                stageYoutubeActive = false;
                restoreStageYoutubeLights();
                return false;
            }
            return true;
        } catch (err) {
            stageYoutubeActive = false;
            restoreStageYoutubeLights();
            throw err;
        }
    }

    async function setStageLocalVideo(src, lightOpts = {}) {
        if (videoBackdrop.active) clearVideoBackdrop();
        applyStageYoutubeLightPreset(lightOpts.preset || 'screen', lightOpts.mask);
        stageYoutubeActive = true;
        setLedSpectrumVisible(false);
        try {
            const ok = await stageYoutube.loadLocal(src, { startMuted: false });
            if (!ok) {
                stageYoutubeActive = false;
                restoreStageYoutubeLights();
                return false;
            }
            return true;
        } catch (err) {
            stageYoutubeActive = false;
            restoreStageYoutubeLights();
            throw err;
        }
    }

    function clearStageYoutube() {
        stageYoutube.clear();
        stageYoutubeActive = false;
        restoreStageYoutubeLights();
        setLedSpectrumVisible(true);
    }

    function getStageYoutubeState() {
        return {
            active: stageYoutube.active,
            videoId: stageYoutube.videoId,
            sourceKind: stageYoutube.sourceKind,
            soundArmed: stageYoutube.soundArmed,
            lightMask: { ...rig.lightMask }
        };
    }

    async function setVideoBackdrop(src) {
        const ok = await videoBackdrop.setSource(src);
        background.mesh.visible = false;
        setLedSpectrumVisible(!videoBackdrop.active);
        return ok;
    }

    function clearVideoBackdrop() {
        videoBackdrop.clear();
        background.mesh.visible = false;
        setLedSpectrumVisible(true);
        initDefaultRoom();
    }

    initDefaultRoom();
    setBeatCycleEvery(dynamicFxBeatCycle, rig.dynamicFxBeat);

    const tmpColor = new THREE.Color();
    let musicLive = 0;

    function applyAudioLights(audio = {}, dt = 0.016, time = 0) {
        const playing = !!audio.playing;
        const beatLive = audio.beatLive !== undefined ? !!audio.beatLive : playing;
        rig.lightFrame = (rig.lightFrame + 1) | 0;
        const crowd = rig.crowdLevel || 0;
        const pushInstancedColors = crowd > 300
            ? (rig.lightFrame % 4) === 0
            : (!lightThrottle || (rig.lightFrame & 1) === 0);
        const hazeEvery = crowd > 250 ? 20 : crowd > 120 ? 14 : lightThrottle ? 8 : 5;
        const targetLive = playing && beatLive ? 1 : (stageYoutubeActive ? 0.9 : 0);
        const liveIn = targetLive ? 10 : 22;
        musicLive += (targetLive - musicLive) * Math.min(1, dt * liveIn);
        if (!playing || !beatLive) {
            // Snap lights down when the track/beat ends — don't leave lasers running on residual energy
            if (musicLive < 0.35) musicLive *= 0.82;
            if (!targetLive && musicLive < 0.08) musicLive = 0;
        }
        if (stageYoutubeActive) musicLive = Math.max(musicLive, 0.85);

        const beatPhase = audio.beatPhase ?? 1;
        const rawBeat = beatLive ? (audio.beat || 0) : 0;
        const rawBass = beatLive ? (audio.bass || 0) : 0;
        const rawMid = beatLive ? (audio.mid || 0) : 0;
        const rawTreble = beatLive ? (audio.treble || 0) : 0;
        const beatEnv = playing && beatLive
            ? Math.max(rawBeat, Math.pow(Math.max(0, 1 - beatPhase), 2.2))
            : 0;
        const beat = playing && beatLive ? beatEnv : rawBeat * musicLive;
        const bass = playing && beatLive ? rawBass : rawBass * musicLive;
        const mid = playing && beatLive ? rawMid : rawMid * musicLive;
        const treble = playing && beatLive ? rawTreble : rawTreble * musicLive;
        const beatIndex = beatLive ? (audio.beatIndex || 0) : 0;
        const react = rig.beatReact * ((playing && beatLive) ? 1 : musicLive);
        const master = rig.intensity * (0.04 + 0.96 * musicLive);

        const hit = !!audio.hit && playing && beatLive;
        const onBeat = playing && (beatPhase < 0.14 || hit);
        const newBeat = playing && beatIndex !== rig.lastBeatIndex;
        if (audio.bpm) rig.lastBpm = audio.bpm;
        if (newBeat) {
            rig.lastBeatIndex = beatIndex;
            rig.colorShift = (rig.colorShift + 1) % palette.length;
        }
        if (hit && rig.strobeEnabled) {
            rig.strobeUntil = Math.max(rig.strobeUntil, performance.now() + 48);
        }

        const targetFlash = ((rig.lightFrame & 1) === 0 || hit || onBeat)
            ? computeFlashTier(
                { ...audio, beat, bass, playing, beatDensity: rig.beatDensity, beatPhase },
                rig.beatDensity
            )
            : rig.targetFlashTier;
        rig.targetFlashTier = targetFlash;
        rig.flashTier += (targetFlash - rig.flashTier) * Math.min(1, dt * (playing ? 20 : 20));

        const trackBpm = rig.lastBpm || audio.bpm || 128;
        const beatClock = beatIndex + beatPhase;
        const syncTime = beatClock * (60 / trackBpm);

        if (hit) {
            const now = performance.now();
            rig.beatHitTimes.push(now);
            while (rig.beatHitTimes.length > 8) rig.beatHitTimes.shift();
            if (rig.beatHitTimes.length >= 2) {
                const intervals = [];
                for (let j = 1; j < rig.beatHitTimes.length; j++) {
                    intervals.push(rig.beatHitTimes[j] - rig.beatHitTimes[j - 1]);
                }
                const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const target = Math.max(0, Math.min(1, (580 - avg) / 380));
                rig.beatDensity += (target - rig.beatDensity) * 0.55;
            }

            if (reactiveModes.dynamicFx === 'ai') {
                const ctx = analyzeBeatContext({ ...audio, beatDensity: rig.beatDensity, bpm: rig.lastBpm });
                if (ctx.mood !== rig.lastFxMood) {
                    rig.fxMoodStreak = (rig.fxMoodStreak || 0) + 1;
                    if (rig.fxMoodStreak >= 8) {
                        nextIntelligentFx({ ...audio, beatDensity: rig.beatDensity, bpm: rig.lastBpm });
                        rig.fxMoodStreak = 0;
                    }
                } else {
                    rig.fxMoodStreak = 0;
                }
            }

            if (venueAuto) {
                tickBeatCycle(venueBeatCycle, audio, nextVenue);
            }

            if (audio.strongHit && rig.beatReactive !== false) {
                fireBeatReactive(audio.energy ?? 0.6);
            }
            if (reactiveModes.palette === 'beats' && rig.autoPalette) {
                tickBeatCycle(paletteBeatCycle, audio, nextPalette);
            }
            if (reactiveModes.dynamicFx === 'beats' && rig.autoDynamicFx) {
                tickBeatCycle(dynamicFxBeatCycle, audio, () => nextIntelligentFx({ ...audio, beatDensity: rig.beatDensity, bpm: rig.lastBpm }));
            }
            if (reactiveModes.pattern === 'beats' && rig.autoPattern) {
                tickBeatCycle(patternBeatCycle, audio, nextPattern);
            }
        } else if (!playing) {
            rig.beatDensity += (0 - rig.beatDensity) * Math.min(1, dt * 1.2);
            rig.flashTier += (0 - rig.flashTier) * Math.min(1, dt * 8);
        }

        if (playing && beatLive && musicLive > 0.2) {
            const bpmTarget = Math.max(0, Math.min(1, ((rig.lastBpm || audio.bpm || 128) - 95) / 100));
            if (beat > 0.35) {
                const est = Math.max(rig.beatDensity, bpmTarget * 0.2 + beat * 0.4);
                rig.beatDensity += (est - rig.beatDensity) * Math.min(1, dt * 1.6);
            }
        }

        if ((!playing || !beatLive) && musicLive < 0.22 && !stageYoutubeActive) {
            rig.strobeUntil = 0;
            rig.beatDensity = 0;
            rig.flashTier = 0;
            rig.dynamicFx = rig.dynamicFx === 'rapidFlash' || rig.dynamicFx === 'strobeStorm'
                ? 'fadePulse'
                : rig.dynamicFx;
            movingHeads.forEach((h) => {
                h.spot.intensity = 0;
                h.beam.visible = false;
                h.lens.material.opacity = 0.15;
            });
            lasers.forEach((l) => { l.beam.visible = false; });
            washes.forEach((w) => {
                w.bar.material.opacity = 0.05;
                w.light.intensity = 0.2;
            });
            strobes.forEach((s) => {
                s.panel.material.opacity = 0;
                s.light.intensity = 0;
            });
            if (ledWall.visible) {
                const arr = ledWall.instanceColor.array;
                for (let i = 0; i < wallState.length; i++) {
                    arr[i * 3] *= 0.85;
                    arr[i * 3 + 1] *= 0.85;
                    arr[i * 3 + 2] *= 0.85;
                }
                ledWall.instanceColor.needsUpdate = true;
            }
            if (tiles.visible) {
                const arr = tiles.instanceColor.array;
                for (let i = 0; i < tileState.length; i++) {
                    arr[i * 3] *= 0.85;
                    arr[i * 3 + 1] *= 0.85;
                    arr[i * 3 + 2] *= 0.85;
                }
                tiles.instanceColor.needsUpdate = true;
            }
            hemi.intensity = 0.12;
            haze.material.opacity = 0.06;
            bloom.strength = 0.15;
            background.update(dt, { ...audio, beat: 0, bass: 0, mid: 0, treble: 0, playing: false });
            if (profileWallpaper) profileWallpaper.update(dt, audio);
            if (topScreen) topScreen.update(dt, audio);
            if (sayBanner) sayBanner.update(dt, audio);
            if (stageEffects) stageEffects.update(dt, audio);
            if (videoBackdrop) videoBackdrop.update(dt, audio);
            if (stageYoutube) stageYoutube.update();
            if (clubStatsScreen) clubStatsScreen.update(dt);
            return;
        }

        /* --- Moving heads --- */
        const headCount = movingHeads.length;
        const washCount = washes.length;
        const strobeCount = strobes.length;
        ensureLedWorker();
        const dfx = computeDynamicLightFx(
            rig.dynamicFx,
            {
                ...audio,
                beat,
                bass,
                mid,
                treble,
                playing,
                beatDensity: rig.beatDensity,
                flashTier: rig.flashTier,
                beatPhase,
                strobeCount
            },
            syncTime,
            headCount,
            washCount
        );
        const fxMaster = master * dfx.master * (1 - dfx.blackout * 0.92);
        const flashGate = dfx.flashGate !== false;
        const flashMod = dfx.flashMod || 0;
        // Spotlights use smooth scale — no rapid gate flicker unless flash-type FX
        const headFxScale = dfx.headStrobe
            ? fxMaster / Math.max(0.001, master)
            : Math.min(1.45, 0.82 + beat * 0.38 + bass * 0.12) * (dfx.master / Math.max(0.001, master));
        const panSmooth = 1 - Math.pow(0.0001, dt);
        const tiltSmooth = 1 - Math.pow(0.00015, dt);
        const pt = beatClock * 0.13;

        movingHeads.forEach((h, i) => {
            let pan = 0;
            let tilt = 0;
            const headPhase = i * 0.52;
            switch (rig.pattern) {
                case 'crossFan':
                    pan = Math.sin(pt * 0.55 + headPhase) * 0.65 * (i % 2 ? -1 : 1);
                    tilt = 0.45 + Math.cos(pt * 0.42 + headPhase * 0.5) * 0.18;
                    break;
                case 'chase': {
                    const wave = Math.sin(pt * 0.75 + i * 0.48);
                    pan = wave * 0.62;
                    tilt = 0.38 + (wave * 0.5 + 0.5) * 0.22;
                    break;
                }
                case 'random':
                    pan = Math.sin(headPhase * 2.3 + pt * 0.48) * 0.72;
                    tilt = 0.34 + Math.sin(headPhase * 1.7 + pt * 0.38) * 0.28;
                    break;
                case 'lockCenter':
                    pan = Math.atan2(-h.homeX, Math.abs(h.homeZ) + 6) * 0.6;
                    tilt = 0.55;
                    break;
                case 'wave':
                    pan = Math.sin(pt * 0.48 + i * 0.38) * 0.68;
                    tilt = 0.38 + Math.sin(pt * 0.72 + i * 0.25) * 0.22;
                    break;
                case 'pendulum':
                    pan = Math.sin(pt * 0.38 + i * 0.16) * 0.82;
                    tilt = 0.5 + Math.cos(pt * 0.38 + i * 0.16) * 0.12;
                    break;
                case 'spiral': {
                    const sp = pt * 0.28 + i * 0.48;
                    pan = Math.sin(sp) * 0.72;
                    tilt = 0.35 + Math.cos(sp * 1.15) * 0.28;
                    break;
                }
                case 'ripple': {
                    const rip = Math.sin(pt * 0.72 - i * 0.28);
                    pan = rip * 0.58;
                    tilt = 0.32 + Math.abs(rip) * 0.32;
                    break;
                }
                case 'pulse':
                    pan = Math.sin(i * 1.5) * 0.25 + Math.sin(pt * 1.1) * 0.42;
                    tilt = 0.42 + Math.sin(pt * 1.6 + i * 0.08) * 0.18;
                    break;
                case 'orbit': {
                    const ang = pt * 0.38 + i * (Math.PI * 2 / headCount);
                    pan = Math.sin(ang) * 0.78;
                    tilt = 0.4 + Math.cos(ang * 0.65) * 0.2;
                    break;
                }
                case 'zigzag':
                    pan = Math.sin(pt * 0.85 + i * 0.55) * 0.72;
                    tilt = 0.36 + Math.sin(pt * 0.55 + i * 0.35) * 0.22;
                    break;
                case 'breathe': {
                    const br = (Math.sin(pt * 0.32) + 1) * 0.5;
                    pan = Math.sin(i * 1.9 + pt * 0.22) * (0.28 + br * 0.48);
                    tilt = 0.28 + br * 0.38;
                    break;
                }
                case 'stadium': {
                    const side = i % 2 ? 1 : -1;
                    pan = side * (0.48 + Math.sin(pt * 0.45 + i * 0.12) * 0.28);
                    tilt = 0.45 + Math.sin(pt * 0.62 + i * 0.2) * 0.16;
                    break;
                }
                case 'laserScan': {
                    const scan = Math.sin(pt * 0.85) * 0.82;
                    pan = scan + Math.sin(i * 0.65) * 0.12;
                    tilt = 0.38 + Math.cos(pt * 1.2 + i * 0.15) * 0.18;
                    break;
                }
                default: // sweep
                    pan = Math.sin(pt * 0.42 + h.panPhase) * 0.78;
                    tilt = 0.4 + Math.sin(pt * 0.65 + h.tiltPhase) * 0.2 + bass * 0.12;
            }

            h.panSmooth += (pan - h.panSmooth) * panSmooth;
            h.tiltSmooth += (tilt - h.tiltSmooth) * tiltSmooth;

            h.head.rotation.z = h.panSmooth;
            h.head.rotation.x = h.tiltSmooth * 0.6;

            const reach = 12;
            h.target.position.set(
                h.homeX * 0.3 - Math.sin(h.panSmooth) * reach,
                0,
                h.homeZ * 0.3 + Math.sin(h.tiltSmooth) * reach * 0.5
            );

            const shifted = palette[(i + rig.colorShift) % palette.length];
            tmpColor.set(shifted);
            h.baseColor.lerp(tmpColor, 0.12);
            h.spot.color.copy(h.baseColor);
            h.lens.material.color.copy(h.baseColor);
            h.beam.material.color.copy(h.baseColor);

            const pulse = 1 + (beat * 1.5 + bass * 0.9) * react;
            let headMaster = master;
            if (rig.soloSpotlight) {
                const side = h.homeX < rig.soloCenterX - 0.5 ? -1 : h.homeX > rig.soloCenterX + 0.5 ? 1 : 0;
                if (side !== 0) headMaster *= 0.12;
                else headMaster *= 1.35 + (rig.soloFx ? beat * 0.5 : 0);
            }
            h.spot.intensity = 14 * headMaster * pulse * dfx.headGains[i] * headFxScale;
            if (!rig.lightMask.movingHeads) h.spot.intensity = 0;
            h.beam.visible = rig.beamsEnabled && rig.lightMask.beams !== false;
            h.beam.material.opacity = h.beam.visible
                ? (0.045 + beat * 0.13 * react + bass * 0.06) * (headFxScale * master)
                : 0;
            h.lens.material.opacity = rig.lightMask.movingHeads !== false ? 1 : 0;
        });

        /* --- Lasers --- */
        lasers.forEach((l, i) => {
            l.beam.visible = rig.lasersEnabled && rig.lightMask.lasers !== false;
            if (!l.beam.visible) return;
            const sweep = Math.sin(syncTime * 1.6 + i * 0.35 + l.side * 1.7) * 0.28;
            l.beam.rotation.z = l.base + sweep;
            l.beam.rotation.y = Math.sin(syncTime * 0.9 + i * 0.5) * 0.4;
            l.beam.material.color.copy(l.color);
            l.beam.material.opacity = (0.1 + treble * 0.9 + beat * 0.4 * react) * fxMaster * dfx.laserGain;
        });

        /* --- Side washes --- */
        washes.forEach((w, i) => {
            const phase = Math.sin(syncTime * 1.2 + i * 0.9);
            tmpColor.set(palette[(i + rig.colorShift) % palette.length]);
            w.color.lerp(tmpColor, 0.1);
            w.bar.material.color.copy(w.color);
            w.light.color.copy(w.color);
            let washMaster = master;
            if (rig.soloSpotlight && w.side !== 0) washMaster *= 0.08;
            const amt = (0.35 + mid * 0.8 + beat * 0.6 * react) * washMaster * dfx.washGains[i];
            if (rig.lightMask.washes === false) {
                w.bar.material.opacity = 0;
                w.light.intensity = 0;
            } else {
                w.bar.material.opacity = Math.min(1, 0.25 + amt * 0.7);
                w.light.intensity = 4 + amt * 14 + Math.abs(phase) * 2;
            }
        });

        /* --- Strobes --- */
        const strobeOn = rig.lightMask.strobes !== false
            && ((rig.strobeEnabled && performance.now() < rig.strobeUntil) || dfx.strobeForce);
        strobes.forEach((s, i) => {
            let on = strobeOn && (i % 2 === (beatIndex % 2));
            const sGain = dfx.strobeGains[i];
            on = on && sGain > 0.08;
            if (rig.lightMask.strobes === false) on = false;
            s.panel.material.opacity = on ? 0.98 * sGain : Math.max(0, s.panel.material.opacity - dt * 5);
            s.light.intensity = on ? (22 + rig.flashTier * 18) * fxMaster * sGain : Math.max(0, s.light.intensity - dt * 140);
        });

        /* --- LED wall + floor tiles (worker or fallback) --- */
        const rapidLerp = flashMod > 0.05 ? 0.55 : 0.28;
        const ledTicked = ledBridge.isActive() && ledWorkerInited && ledBridge.scheduleTick({
            bass, mid, treble, beat, beatIndex, master, react,
            colorShift: rig.colorShift, time: syncTime, flashMod, rapidLerp,
            wallRows: WALL_ROWS, tileCols: TILE_GRID_X, tileRows: TILE_GRID_Z,
            pushColors: pushInstancedColors
        });
        void ledTicked;
        const ledBuf = ledBridge.getBuffers();
        if (pushInstancedColors && ledBridge.takeColorFrame()) {
            if (ledWall.visible) {
                ledWall.instanceColor.array.set(ledBuf.wallColors);
                ledWall.instanceColor.needsUpdate = true;
            }
            if (tiles.visible) {
                tiles.instanceColor.array.set(ledBuf.tileColors);
                tiles.instanceColor.needsUpdate = true;
            }
        } else if (!ledBridge.isActive() || !ledWorkerInited) {
            if (ledWall.visible) {
                const arr = ledWall.instanceColor.array;
                for (let i = 0; i < wallState.length; i++) {
                    const st = wallState[i];
                    const colWave = Math.sin(st.col * 0.55 + syncTime * 2.2 + rig.colorShift);
                    const target = Math.max(
                        0,
                        bass * 1.1 * (1 - st.row / WALL_ROWS) +
                        mid * 0.8 * Math.abs(colWave) +
                        treble * 0.6 * ((st.col + st.row + beatIndex) % 3 === 0 ? 1 : 0.2) -
                        st.row * 0.06 +
                        flashMod * 0.85
                    );
                    st.level += (target - st.level) * rapidLerp;
                    if (pushInstancedColors) {
                        tmpColor.set(palette[(st.col + rig.colorShift) % palette.length]);
                        const v = Math.min(0.95, st.level * master * (0.45 + react * 0.4));
                        arr[i * 3] = tmpColor.r * v;
                        arr[i * 3 + 1] = tmpColor.g * v;
                        arr[i * 3 + 2] = tmpColor.b * v;
                    }
                }
                if (pushInstancedColors) ledWall.instanceColor.needsUpdate = true;
            }

            if (tiles.visible) {
                const arr = tiles.instanceColor.array;
                const cx = (TILE_GRID_X - 1) / 2;
                const cz = (TILE_GRID_Z - 1) / 2;
                const chaseDiv = flashMod > 0.05 ? 2 : 4;
                for (let i = 0; i < tileState.length; i++) {
                    const st = tileState[i];
                    const dx = st.gx - cx;
                    const dz = st.gz - cz;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    const ripple = Math.sin(dist * 0.9 - syncTime * 4.5) * 0.5 + 0.5;
                    const chase = ((st.gx + st.gz + beatIndex) % chaseDiv === 0) ? 1 : 0.25;
                    let target = (0.04 + bass * 0.55 * ripple + beat * 0.42 * chase * react) * master;
                    if (flashMod > 0.05) target += flashMod * 0.65 * master;
                    if (st.isWing) target *= 0.85;
                    st.level += (target - st.level) * (flashMod > 0.05 ? 0.55 : 0.3);
                    if (pushInstancedColors) {
                        tmpColor.set(palette[(st.gx + rig.colorShift) % palette.length]);
                        arr[i * 3] = tmpColor.r * st.level;
                        arr[i * 3 + 1] = tmpColor.g * st.level;
                        arr[i * 3 + 2] = tmpColor.b * st.level;
                    }
                }
                if (pushInstancedColors) tiles.instanceColor.needsUpdate = true;
            }
        }

        /* --- Trim --- */
        riserEdge.material.color.set(palette[rig.colorShift % palette.length]);
        boothGlow.material.color.set(palette[(rig.colorShift + 2) % palette.length]);
        boothGlow.material.opacity = 0.5 + beat * 0.5;
        let hemiBase = 0.35 + bass * 0.5 * react;
        let hazeBase = 0.22 + beat * 0.18 + mid * 0.12;
        if (flashMod > 0.08) {
            hemiBase *= flashGate ? (1.8 + rig.flashTier * 0.9) : (0.12 + beat * 0.08);
            hazeBase *= flashGate ? (1.5 + rig.flashTier * 0.5) : 0.25;
            ambientLight.intensity = flashGate ? 0.55 + beat * 0.35 : 0.08;
        } else {
            ambientLight.intensity = 0.5;
        }
        hemi.intensity = hemiBase;
        if (crowd >= 70) {
            haze.material.opacity = 0;
        } else {
            haze.material.opacity = hazeBase;
            rig.hazeTick = (rig.hazeTick || 0) + 1;
            if (rig.hazeTick % hazeEvery === 0) {
                const hp = haze.geometry.attributes.position.array;
                for (let i = 0; i < HAZE; i++) {
                    hp[i * 3 + 1] += dt * 3 * (0.15 + (i % 5) * 0.03);
                    if (hp[i * 3 + 1] > ROOM.ceilingHeight) hp[i * 3 + 1] = 0.2;
                }
                haze.geometry.attributes.position.needsUpdate = true;
            }
            haze.rotation.y += dt * 0.015;
        }

        bloom.strength = (rig.soloFx
            ? (0.9 + beat * 0.7 + bass * 0.4) * master
            : (0.4 + beat * 0.45 * react + bass * 0.22) * (0.5 + master * 0.7))
            * (1 + dfx.bloomBoost)
            * (flashMod > 0.08 && flashGate ? 1 + rig.flashTier * 0.75 : 1);

        background.update(dt, audio);

        if (profileWallpaper) profileWallpaper.update(dt, audio);
        if (topScreen) topScreen.update(dt, audio);
        if (sayBanner) sayBanner.update(dt, audio);
        if (boothBrand) boothBrand.update(dt, audio);
        if (stageEffects) stageEffects.update(dt, audio);
        if (videoBackdrop) videoBackdrop.update(dt, audio);
        if (stageYoutube) stageYoutube.update();
        if (clubStatsScreen) clubStatsScreen.update(dt);
    }

    /* ---------------------------------------------------------------- *
     * Resize
     * ---------------------------------------------------------------- */
    function resize() {
        const { w, h } = readSize();
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        bloom.setSize(Math.max(1, w * 0.5), Math.max(1, h * 0.5));
        syncCanvasCss();
    }
    const scheduleResize = () => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resize);
        else resize();
    };
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(container);
    if (container.parentElement) ro.observe(container.parentElement);
    window.addEventListener('resize', scheduleResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleResize);
    }
    requestAnimationFrame(resize);

    /** First frames render without bloom to avoid open-window hitch */
    function renderFrame() {
        if (!bloomEnabled || bloomWarmFrames < 8) {
            bloomWarmFrames += 1;
            if (bloomWarmFrames >= 8) bloomEnabled = true;
            else {
                renderer.render(scene, camera);
                return;
            }
        }
        composer.render();
    }

    function setCrowdLevel(n) {
        rig.crowdLevel = Math.max(0, n | 0);
        haze.visible = rig.crowdLevel < 70;
        if (rig.crowdLevel >= 70) haze.material.opacity = 0;
        stageEffects?.setCrowdLevel?.(rig.crowdLevel);
    }

    return {
        scene,
        camera,
        renderer,
        composer,
        bloom,
        renderFrame,
        background,
        profileWallpaper,
        topScreen,
        sayBanner,
        boothBrand,
        clubStatsScreen,
        setClubStats: (stats) => clubStatsScreen?.setStats?.(stats),
        stageEffects,
        videoBackdrop,
        stageYoutube,
        applyVenue,
        nextVenue,
        setVenueAuto,
        getVenueId,
        getVenueAuto,
        setStageShape,
        getStageShape,
        setVideoBackdrop,
        clearVideoBackdrop,
        setStageYoutube,
        setStageLocalVideo,
        clearStageYoutube,
        setLightMask,
        setLightMaskAll,
        applyStageYoutubeLightPreset,
        getStageYoutubeState,
        getLightMask: () => ({ ...rig.lightMask }),
        rig,
        movingHeads,
        lasers,
        strobes,
        applyAudioLights,
        setCrowdLevel,
        setPalette,
        nextPalette,
        nextPaletteAndFx,
        setPaletteAuto,
        setPatternAuto,
        setBeatReactive,
        setReactiveMode,
        getReactiveModes,
        setSoloSpotlight,
        setSoloFx,
        getPaletteId: () => currentPaletteId,
        setPattern,
        nextPattern,
        setDynamicFx,
        nextDynamicFx,
        nextIntelligentFx,
        setDynamicFxAuto,
        palettes: PALETTE_IDS,
        patterns: PATTERNS,
        dynamicFxIds: DYNAMIC_FX_IDS,
        resize,
        dispose() {
            ro.disconnect();
            background.dispose();
            profileWallpaper?.dispose();
            topScreen?.dispose();
            sayBanner?.dispose();
            boothBrand?.dispose();
            clubStatsScreen?.dispose();
            stageEffects?.dispose();
            ledBridge.dispose();
            videoBackdrop?.dispose();
            stageYoutube?.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            }
        }
    };
}
