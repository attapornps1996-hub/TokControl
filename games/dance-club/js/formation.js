/**
 * Dancer formations & animated moves — auto multi-row / multi-ring within floor bounds.
 */
import { ROOM, DJ_DECK, SIDE_DECK, FLOOR_TILE, FLOOR_BOUNDS } from './room.js?v=form-flat-1';

export const STAGE_Z = ROOM.stageZ + 2.2;

export const FLOOR = {
    minX: FLOOR_BOUNDS.minX,
    maxX: FLOOR_BOUNDS.maxX,
    minZ: FLOOR_BOUNDS.minZ,
    maxZ: FLOOR_BOUNDS.maxZ,
    centerZ: (FLOOR_BOUNDS.minZ + FLOOR_BOUNDS.maxZ) / 2
};

export { DJ_DECK, SIDE_DECK };

export const FRONT_Z = FLOOR.maxZ - 1.0;

function hashStr(s) {
    let h = 2166136261;
    const str = String(s || 'seed');
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function slotClash(slot, occupied, minDist = 1.35) {
    const min2 = minDist * minDist;
    return occupied.some((p) => {
        const dx = (p.x ?? 0) - slot.x;
        const dz = (p.z ?? 0) - slot.z;
        return dx * dx + dz * dz < min2;
    });
}

/** Y offset for floor — flat across full width (wings = center). Only DJ riser is raised. */
export function floorElevationAt(_x) {
    return 0;
}

/**
 * Random spread spawn — irregular positions (not a uniform grid).
 */
export function pickSpreadSpawnSlot(occupied = [], seed = '') {
    let h = hashStr(seed || `rnd_${Date.now()}`);
    const minX = formMinX();
    const maxX = formMaxX();
    const minZ = formMinZ();
    const maxZ = formMaxZ();
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;

    const makeSlot = (x, z) => {
        const clamped = clampFormationSlot({ x, z });
        return {
            x: clamped.x,
            z: clamped.z,
            y: floorElevationAt(clamped.x),
            rot: Math.atan2(-clamped.x, -(clamped.z - 5)) * 0.85
        };
    };

    // Pass 1 — random scatter with variable spacing (biased toward audience)
    for (let attempt = 0; attempt < 90; attempt++) {
        h = (h * 1664525 + 1013904223) >>> 0;
        const rx = (h % 10000) / 10000;
        const rz = ((h >> 10) % 10000) / 10000;
        const jitterX = (((h >> 20) % 200) - 100) / 100 * (0.6 + (h % 9) * 0.11);
        const jitterZ = (((h >> 24) % 200) - 100) / 100 * (0.5 + (h % 7) * 0.09);
        const frontBias = Math.pow(rx, 0.72 + (h % 5) * 0.06);
        let x = minX + (0.06 + frontBias * 0.88) * spanX + jitterX;
        let z = minZ + (0.04 + rz * 0.92) * spanZ + jitterZ;
        const slot = makeSlot(x, z);
        if (!slotClash(slot, occupied, 1.55)) return slot;
    }

    // Pass 2 — spiral outward from a random anchor
    h = (h * 1664525 + 1013904223) >>> 0;
    const anchorX = minX + ((h % 1000) / 1000) * spanX;
    const anchorZ = minZ + (((h >> 10) % 1000) / 1000) * spanZ;
    for (let ring = 1; ring <= 14; ring++) {
        const steps = 6 + ring * 2;
        for (let s = 0; s < steps; s++) {
            h = (h * 1664525 + 1013904223) >>> 0;
            const angle = (s / steps) * Math.PI * 2 + ring * 0.35 + (h % 100) * 0.01;
            const radius = 1.4 + ring * (1.15 + (h % 7) * 0.08);
            const slot = makeSlot(
                anchorX + Math.sin(angle) * radius,
                anchorZ + Math.cos(angle) * radius * 0.72
            );
            if (!slotClash(slot, occupied, 1.35)) return slot;
        }
    }

    // Pass 3 — looser clash threshold
    for (let t = 0; t < 48; t++) {
        h = (h * 1664525 + 1013904223) >>> 0;
        const slot = makeSlot(
            minX + ((h % 1000) / 1000) * spanX,
            minZ + (((h >> 10) % 1000) / 1000) * spanZ
        );
        if (!slotClash(slot, occupied, 1.1)) return slot;
    }

    return makeSlot(0, FLOOR.centerZ);
}

const ROW_SPACING = 2.7;
const ROW_DEPTH = 2.45;
const MIN_DIST = 1.88;
const SOFT_DIST = 1.35;
const RUNTIME_SOFT = 1.18;

export const FORMATION_PATTERN_IDS = [
    'v_shape', 'arc_wide', 'line_front', 'diamond', 'wings',
    'circle', 'stairs', 'scatter', 'double_row', 'chevron',
    'heart', 'pyramid', 'semicircle', 'grid', 'fan', 'cross', 'tunnel', 'ripple', 'runway'
];

/** Runway: clear center aisle + side rails (audience stays off the catwalk) */
export const RUNWAY = {
    startZ: -2.0,
    endZ: FLOOR.maxZ - 0.55,
    aisleHalf: 3.0
};

let formationCommanderId = null;
let formationPatternId = null;

export function getFormationState() {
    return { commanderId: formationCommanderId, patternId: formationPatternId };
}

export function clearFormationState() {
    formationCommanderId = null;
    formationPatternId = null;
}

export function saveHomePositions(dancers) {
    dancers.forEach((d) => {
        d.homePos = {
            x: d.root.position.x,
            z: d.root.position.z,
            rot: d.root.rotation.y,
            y: d.baseY || 0
        };
    });
}

/** Only DJ riser holds during formation — L/R wings join the reshape */
export function shouldHoldFormationPosition(dancer) {
    if (dancer?.onDjBooth) return true;
    const y = dancer?.baseY ?? 0;
    if (y >= DJ_DECK.y - 0.35) return true;
    return false;
}

/** True when dancer is on DJ booth (elevated wings no longer exist) */
export function isOnElevatedDeck(dancer) {
    if (!dancer) return false;
    if (dancer.onDjBooth) return true;
    const y = dancer.baseY || 0;
    if (y >= DJ_DECK.y - 0.35) return true;
    return false;
}

/** Move solo star to center main floor before spotlight */
export async function bringToCenterStage(dancer, duration = 1.35) {
    if (!dancer) return;
    dancer.onDjBooth = false;
    dancer.elevated = false;
    const z = FLOOR.centerZ + 0.85;
    animateDancerTo(dancer, 0, z, Math.PI, duration, 0);
    await waitTween(dancer, duration);
}

/** Solo show — star toward audience, supporters in wide semicircle behind (front arc empty) */
function layoutSoloCircle(n) {
    const slots = [];
    if (n <= 0) return slots;
    const starZ = FLOOR.centerZ + 1.35;
    slots.push(clampFormationSlot({ x: 0, z: starZ, rot: Math.PI }));
    if (n === 1) return slots;

    const supporters = n - 1;
    const arcCenter = Math.PI;
    const arcSpread = Math.PI * 0.94;
    const arcStart = arcCenter - arcSpread * 0.5;
    const baseRadius = supporters <= 6 ? 5.8 : supporters <= 12 ? 7.0 : supporters <= 20 ? 8.0 : 9.0;

    let placed = 0;
    for (let ring = 0; placed < supporters && ring < 4; ring++) {
        const r = baseRadius + ring * 2.9;
        const remaining = supporters - placed;
        const maxOnArc = Math.max(4, Math.floor((r * arcSpread) / 2.05));
        const count = Math.min(remaining, maxOnArc);

        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const a = arcStart + arcSpread * t;
            const x = Math.sin(a) * r;
            const z = starZ + Math.cos(a) * r * 0.78;
            slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
            placed++;
        }
    }
    return ensureSlotCount(slots, n);
}

/** Save home only for dancers that will move during runway/solo */
export function saveMovableHomePositions(dancers, starId) {
    const star = dancers.find((d) => d.profile.id === starId);
    dancers.forEach((d) => {
        if (d === star || !shouldHoldFormationPosition(d)) {
            d.homePos = {
                x: d.root.position.x,
                z: d.root.position.z,
                rot: d.root.rotation.y,
                y: d.baseY || 0
            };
        }
    });
}

let pickCursor = 0;
export function pickNextDancer(dancers, excludeIds = new Set()) {
    if (!dancers.length) return null;
    const pool = dancers.filter((d) => !excludeIds.has(d.profile.id));
    const list = pool.length ? pool : dancers;
    const d = list[pickCursor % list.length];
    pickCursor = (pickCursor + 1) % 10000;
    return d;
}

export function pickDancerForViewer(viewerId, dancers) {
    if (!dancers.length) return null;
    const s = String(viewerId || 'viewer');
    const testMatch = s.match(/^test_viewer_(\d+)$/);
    if (testMatch) {
        const num = parseInt(testMatch[1], 10);
        if (!isNaN(num)) return dancers[num % dancers.length];
    }
    if (s.startsWith('test_') || s.includes('test_viewer') || s === 'ทดสอบ') {
        return pickNextDancer(dancers);
    }
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return dancers[h % dancers.length];
}

export function animateDancerTo(dancer, x, z, rotY, duration = 1.4, y = null) {
    const fromY = dancer.baseY || 0;
    // Default to main floor (y=0) unless an elevated target is explicit
    const toY = y != null ? y : 0;
    dancer.tween = {
        from: {
            x: dancer.root.position.x,
            z: dancer.root.position.z,
            rot: dancer.root.rotation.y,
            y: fromY
        },
        to: { x, z, rot: rotY, y: toY },
        t: 0,
        dur: Math.max(0.35, duration),
        onDone: null
    };
}

export function updateDancerTween(dancer, dt) {
    const tw = dancer.tween;
    if (!tw) return false;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = 1 - Math.pow(1 - tw.t, 3);
    dancer.root.position.x = tw.from.x + (tw.to.x - tw.from.x) * e;
    dancer.root.position.z = tw.from.z + (tw.to.z - tw.from.z) * e;
    dancer.baseY = tw.from.y + (tw.to.y - tw.from.y) * e;
    let dr = tw.to.rot - tw.from.rot;
    while (dr > Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    dancer.root.rotation.y = tw.from.rot + dr * e;
    if (tw.t >= 1) {
        dancer.baseY = tw.to.y;
        dancer.elevated = (tw.to.y || 0) > 0.4;
        dancer.tween = null;
        if (tw.onDone) tw.onDone();
        return true;
    }
    return false;
}

function waitTween(dancer, maxSec) {
    return new Promise((resolve) => {
        const deadline = performance.now() + maxSec * 1000 + 300;
        const tick = () => {
            if (!dancer.tween || performance.now() > deadline) {
                resolve();
                return;
            }
            requestAnimationFrame(tick);
        };
        tick();
    });
}

function faceAudience(x, z) {
    return Math.atan2(-x, -(z - 4)) * 0.85;
}

/** Keep well clear of DJ riser; use full flat floor width (L + C + R) */
const FORM_BACK_CLEAR = 4.8;
const FORM_FRONT_CLEAR = 0.65;
const FORM_SIDE_CLEAR = 0.65;
/** Use only this fraction of depth from the audience — keeps back row off stage corners */
const FORM_DEPTH_USE = 0.82;

function formMinZ() {
    return FLOOR.minZ + FORM_BACK_CLEAR;
}
function formMaxZ() {
    return FLOOR.maxZ - FORM_FRONT_CLEAR;
}
/** Full long floor width — left + center + right (DJ excluded via Z clear) */
function formMinX() {
    return FLOOR.minX + FORM_SIDE_CLEAR;
}
function formMaxX() {
    return FLOOR.maxX - FORM_SIDE_CLEAR;
}

function clampSlot(s) {
    return {
        x: Math.max(FLOOR.minX, Math.min(FLOOR.maxX, s.x)),
        z: Math.max(FLOOR.minZ, Math.min(FLOOR.maxZ, s.z)),
        rot: s.rot,
        y: s.y
    };
}

/**
 * Formation clamp — full long floor at y=0, never DJ stage.
 */
function clampFormationSlot(s) {
    const x = Math.max(formMinX(), Math.min(formMaxX(), s.x));
    const z = Math.max(formMinZ(), Math.min(formMaxZ(), s.z));
    return { x, z, rot: s.rot ?? faceAudience(x, z), y: 0 };
}

function formationTargetY(_s, _patternId) {
    return 0;
}

/**
 * Even grid across FULL long floor (left + center + right).
 * Front-biased depth — keep clear of DJ stage.
 */
function buildEvenFloorGrid(n) {
    if (n <= 0) return [];
    const minX = formMinX();
    const maxX = formMaxX();
    const maxZ = formMaxZ();
    const usableW = Math.max(2, maxX - minX);
    const usableD = Math.max(2, (maxZ - formMinZ()) * FORM_DEPTH_USE);

    // Prefer 2–3 rows so center floor fills (not only a front line)
    const wantRows = n >= 28 ? 3 : n >= 10 ? 2 : 1;
    let spacing = 2.25;
    let cols = Math.max(3, Math.min(n, Math.ceil(n / wantRows)));
    const maxCols = Math.max(3, Math.floor(usableW / 1.85) + 1);
    cols = Math.min(cols, maxCols, n);
    let rows = Math.max(1, Math.ceil(n / cols));

    while (rows > 1 && (rows - 1) * spacing > usableD && spacing > 1.7) {
        spacing -= 0.1;
        cols = Math.min(n, Math.max(cols, Math.floor(usableW / spacing) + 1));
        rows = Math.ceil(n / cols);
    }
    while (rows > wantRows + 1 && cols < maxCols && cols < n) {
        cols += 1;
        rows = Math.ceil(n / cols);
    }

    const slots = [];
    let placed = 0;
    for (let r = 0; r < rows && placed < n; r++) {
        const remaining = n - placed;
        const rowsLeft = rows - r;
        const rowCount = Math.min(cols, Math.ceil(remaining / rowsLeft));
        const zT = rows === 1 ? 0.32 : r / (rows - 1);
        const z = maxZ - zT * usableD;
        for (let c = 0; c < rowCount; c++) {
            const xT = rowCount === 1 ? 0.5 : c / (rowCount - 1);
            const x = minX + xT * usableW;
            const stagger = (r % 2) * (usableW / Math.max(2, rowCount)) * 0.045;
            const sx = Math.max(minX, Math.min(maxX, x + (c > 0 && c < rowCount - 1 ? stagger : 0)));
            slots.push(clampFormationSlot({
                x: sx,
                z,
                rot: faceAudience(sx, z)
            }));
            placed++;
        }
    }
    return slots;
}

function finalizeFormationSlots(slots) {
    const n = slots.length;
    if (n <= 0) return [];
    const out = ensureSlotCount(slots.map((s) => clampFormationSlot(s)), n);
    return spreadSlots(out, MIN_DIST);
}

/**
 * Keep commander near center without destroying the even grid.
 * (Old spreadSlots push collapsed everyone into stage corners.)
 */
function pinCommanderCenter(slots, patternId = null) {
    if (!slots.length) return slots;
    const out = slots.map((s) => ({ ...s }));
    if (patternId === 'runway') {
        out[0] = clampFormationSlot({ x: 0, z: RUNWAY.startZ, rot: Math.PI });
        return out;
    }
    // Find grid slot closest to floor center and swap to index 0
    const cx = 0;
    const cz = (formMinZ() + formMaxZ()) * 0.5 + 0.4;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < out.length; i++) {
        const d = Math.hypot(out[i].x - cx, out[i].z - cz);
        if (d < bestD) {
            bestD = d;
            best = i;
        }
    }
    if (best !== 0) {
        const tmp = out[0];
        out[0] = out[best];
        out[best] = tmp;
    }
    return out;
}

/** Gentle runtime nudge — allows close clusters, blocks full overlap. */
export function applyRuntimeSeparation(dancers, dt = 0.016) {
    if (!dancers || dancers.length < 2) return;
    const n = dancers.length;
    // Cap pairwise work when crowded — only check nearby index windows + skip elevated
    const window = n > 28 ? 10 : n > 18 ? 14 : n;
    for (let i = 0; i < n; i++) {
        const di = dancers[i];
        if (di.onDjBooth || (di.baseY || 0) >= DJ_DECK.y - 0.3) continue;
        if (di.elevated || di.tween || (di.baseY || 0) > 0.4) continue;
        const a = di.root.position;
        const jMax = Math.min(n, i + 1 + window);
        for (let j = i + 1; j < jMax; j++) {
            const dj = dancers[j];
            if (dj.elevated || dj.tween || (dj.baseY || 0) > 0.4) continue;
            const b = dj.root.position;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= RUNTIME_SOFT || d < 0.001) continue;
            const push = ((RUNTIME_SOFT - d) / RUNTIME_SOFT) * 1.6 * dt;
            const nx = dx / d;
            const nz = dz / d;
            a.x -= nx * push * 0.5;
            a.z -= nz * push * 0.5;
            b.x += nx * push * 0.5;
            b.z += nz * push * 0.5;
            // Stay on full flat dance floor (clear of DJ via Z)
            a.x = Math.max(formMinX(), Math.min(formMaxX(), a.x));
            a.z = Math.max(formMinZ(), Math.min(formMaxZ(), a.z));
            b.x = Math.max(formMinX(), Math.min(formMaxX(), b.x));
            b.z = Math.max(formMinZ(), Math.min(formMaxZ(), b.z));
        }
    }
}

function ensureSlotCount(slots, n) {
    const out = [...slots];
    while (out.length < n) {
        const i = out.length;
        const ring = Math.floor(i / 8) + 1;
        const a = (i * 1.17) % (Math.PI * 2);
        const radius = 2.8 + ring * 1.65;
        const x = Math.sin(a) * radius;
        const z = FLOOR.centerZ + Math.cos(a) * (2.2 + ring * 1.35);
        out.push(clampFormationSlot({
            x,
            z,
            rot: faceAudience(x, z)
        }));
    }
    return out.slice(0, n);
}

function spreadSlots(slots, minDist = MIN_DIST) {
    const out = slots.map((s) => ({ ...s }));
    const passes = out.length > 200 ? 4 : out.length > 100 ? 6 : out.length > 60 ? 10 : 14;
    for (let pass = 0; pass < passes; pass++) {
        let moved = false;
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                const dx = out[j].x - out[i].x;
                const dz = out[j].z - out[i].z;
                const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
                if (d < minDist) {
                    const push = (minDist - d) * 0.42;
                    const nx = dx / d;
                    const nz = dz / d;
                    out[i].x -= nx * push;
                    out[i].z -= nz * push;
                    out[j].x += nx * push;
                    out[j].z += nz * push;
                    out[i] = clampFormationSlot(out[i]);
                    out[j] = clampFormationSlot(out[j]);
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
    return out;
}

function preferredRows(n) {
    if (n <= 7) return 1;
    if (n <= 16) return 2;
    if (n <= 30) return 3;
    return Math.min(maxRows(), Math.ceil(n / maxCols(2.4)));
}

function inFloor(x, z) {
    return x >= FLOOR.minX && x <= FLOOR.maxX && z >= FLOOR.minZ && z <= FLOOR.maxZ;
}

function maxCols(spacing = ROW_SPACING) {
    return Math.max(3, Math.floor((formMaxX() - formMinX()) / spacing));
}

function maxRows(depth = ROW_DEPTH) {
    return Math.max(2, Math.floor((formMaxZ() - formMinZ()) / depth));
}

/** How many dancers fit on a ring at radius without leaving the floor */
function ringCapacity(radius, spacing = ROW_SPACING) {
    const samples = Math.max(16, Math.ceil((2 * Math.PI * radius) / spacing) * 2);
    let inCount = 0;
    for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const x = Math.sin(a) * radius;
        const z = FLOOR.centerZ + Math.cos(a) * radius * 0.72;
        if (x >= formMinX() && x <= formMaxX() && z >= formMinZ() && z <= formMaxZ()) inCount++;
    }
    const usable = inCount / samples;
    return Math.max(4, Math.floor((2 * Math.PI * radius * usable) / spacing));
}

function layoutCenterCluster(count) {
    const slots = [];
    if (count <= 0) return slots;
    slots.push({ x: 0, z: FLOOR.centerZ });
    if (count === 1) return slots;

    const inner = count - 1;
    const radius = inner <= 2 ? 2.4 : inner <= 5 ? 3.4 : 4.6;
    for (let i = 0; i < inner; i++) {
        const a = (i / inner) * Math.PI * 2 + 0.35;
        slots.push({
            x: Math.sin(a) * radius,
            z: FLOOR.centerZ + Math.cos(a) * radius * 0.7
        });
    }
    return slots;
}

/** Auto-split into rows — fills full L/C/R floor width; keep clear of DJ stage */
function layoutRows(n, { spacing = ROW_SPACING, depth = ROW_DEPTH, baseZ = null, starCenter = false, forceRows = 0 } = {}) {
    let sp = spacing;
    let dep = depth;
    const wantRows = forceRows || preferredRows(n);
    let rows = Math.max(1, Math.min(wantRows, maxRows(dep)));
    let cols = Math.ceil(n / rows);

    const maxC = maxCols(Math.max(1.9, sp * 0.85));
    while (cols > maxC && rows < maxRows(dep)) {
        rows++;
        cols = Math.ceil(n / rows);
    }
    while (cols > maxC && sp > 1.7) {
        sp -= 0.08;
        cols = Math.min(maxCols(sp), Math.ceil(n / rows));
    }

    const usableDepth = Math.max(2.5, formMaxZ() - formMinZ() - 0.4);
    if (rows > 1) dep = Math.max(dep * 0.9, usableDepth / (rows - 1 + 0.2));
    dep = Math.min(dep, rows > 1 ? usableDepth / (rows - 1) : dep);

    const blockDepth = (rows - 1) * dep;
    // Front (audience) first, then fill toward stage — but never into DJ clear zone
    const frontZ = baseZ != null
        ? Math.min(Math.max(baseZ, formMinZ()), formMaxZ())
        : formMaxZ() - 0.15;
    const startZ = Math.max(formMinZ(), frontZ - blockDepth);

    const slots = [];
    let placed = 0;
    const fullW = formMaxX() - formMinX();

    for (let r = 0; r < rows && placed < n; r++) {
        const remaining = n - placed;
        const rowsLeft = rows - r;
        const count = Math.min(cols, Math.ceil(remaining / rowsLeft));
        const rowSpan = count <= 1
            ? 0
            : Math.min(fullW, Math.max((count - 1) * sp, fullW * (count >= 4 ? 0.94 : 0.78)));
        const step = count <= 1 ? 0 : rowSpan / (count - 1);
        const z = startZ + (rows - 1 - r) * dep;
        const stagger = (r % 2) * (step * 0.28);
        for (let c = 0; c < count; c++) {
            const x = count === 1 ? 0 : -rowSpan / 2 + c * step + stagger;
            slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
            placed++;
        }
    }

    if (starCenter && slots.length > 0) {
        slots[0] = clampFormationSlot({ x: 0, z: frontZ - blockDepth * 0.15, rot: Math.PI });
    }
    return slots.slice(0, n);
}

/** Concentric rings — center cluster + expanding rings sized to floor */
function layoutConcentric(n) {
    const slots = [];
    if (n <= 0) return slots;

    let centerCount = 1;
    if (n > 18) centerCount = 4;
    else if (n > 10) centerCount = 3;
    else if (n > 5) centerCount = 2;
    centerCount = Math.min(centerCount, n);

    layoutCenterCluster(centerCount).forEach((p, i) => {
            slots.push(clampFormationSlot({ x: p.x, z: p.z, rot: i === 0 ? Math.PI : faceAudience(p.x, p.z) }));
        });

    let rest = n - centerCount;
    let ring = 0;
    const maxRadius = Math.min(12.5, (formMaxX() - formMinX()) * 0.46);

    while (rest > 0 && ring < 8) {
        const radius = 2.6 + ring * 2.05;
        if (radius > maxRadius) {
            slots.push(...layoutRows(rest, { baseZ: FLOOR.centerZ + ring * 1.2, starCenter: false }));
            rest = 0;
            break;
        }

        const cap = Math.min(rest, ringCapacity(radius));
        const count = rest <= 3 && ring > 0 ? rest : cap;

        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = Math.sin(a) * radius;
            const z = FLOOR.centerZ + Math.cos(a) * radius * 0.72;
            slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
        }
        rest -= count;
        ring++;
    }

    if (rest > 0) {
        slots.push(...layoutRows(rest, { baseZ: formMaxZ() - 0.6, starCenter: false }));
    }

    return slots.slice(0, n);
}

function layoutArc(n) {
    const centerN = n > 14 ? 2 : 1;
    const centerSlots = layoutCenterCluster(centerN).map((p, i) => clampFormationSlot({
        x: p.x, z: p.z, rot: i === 0 ? Math.PI : faceAudience(p.x, p.z)
    }));
    const slots = [...centerSlots];
    const rest = n - centerN;
    if (rest <= 0) return slots;

    const maxPerArc = Math.min(maxCols(2.3), 9);
    const arcs = Math.ceil(rest / maxPerArc);

    for (let a = 0; a < arcs; a++) {
        const start = a * maxPerArc;
        const count = Math.min(maxPerArc, rest - start);
        const spread = Math.min(Math.PI * 0.78, 0.22 * count + 0.38);
        const radius = Math.min(14, 6.5 + a * 2.2);
        // Front arcs first (toward audience), then deeper — stay off DJ clear zone
        const zBase = formMaxZ() - 0.4 - a * 2.0;

        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const angle = -spread / 2 + spread * t;
            const x = Math.sin(angle) * radius;
            const z = zBase - Math.abs(Math.cos(angle) * radius * 0.2);
            slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
        }
    }
    return slots.slice(0, n);
}

/** Solo show: star center; others fill main floor L / C / R — never DJ / never wing decks */
function layoutWings(n) {
    return layoutRows(n, { forceRows: preferredRows(n), starCenter: true });
}

function layoutDiamond(n) {
    if (n <= 6) {
        const ring = [
            { x: 0, z: FLOOR.centerZ },
            { x: -2.8, z: FLOOR.centerZ + 1.8 }, { x: 2.8, z: FLOOR.centerZ + 1.8 },
            { x: 0, z: FLOOR.centerZ + 3.5 },
            { x: -4.5, z: FLOOR.centerZ + 2.8 }, { x: 4.5, z: FLOOR.centerZ + 2.8 }
        ];
        return ring.slice(0, n).map((p, i) => clampSlot({
            x: p.x, z: p.z, rot: i === 0 ? Math.PI : faceAudience(p.x, p.z)
        }));
    }
    return layoutConcentric(n);
}

function layoutStairs(n) {
    return layoutRows(n, { forceRows: preferredRows(n), starCenter: true });
}

function layoutScatter(n) {
    const slots = [];
    let h = hashStr(`scatter_${n}`);
    for (let i = 0; i < n; i++) {
        h = (h * 1664525 + 1013904223) >>> 0;
        const rx = (h % 10000) / 10000;
        const rz = ((h >> 10) % 10000) / 10000;
        const jx = (((h >> 20) % 200) - 100) / 100 * 1.4;
        const jz = (((h >> 24) % 200) - 100) / 100 * 1.1;
        const x = formMinX() + rx * (formMaxX() - formMinX()) + jx;
        const z = formMinZ() + rz * (formMaxZ() - formMinZ()) + jz;
        slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
    }
    if (slots.length) {
        slots[0] = clampFormationSlot({ x: 0, z: formMaxZ() - 1.2, rot: Math.PI });
    }
    return slots.slice(0, n);
}

function layoutVShape(n) {
    if (n > 10) return layoutRows(n, { forceRows: preferredRows(n), starCenter: true });
    const slots = [clampFormationSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI })];
    let rest = n - 1;
    let row = 1;
    const maxW = formMaxX() - 1.2;
    const depthSpan = Math.max(3, formMaxZ() - formMinZ() - 1.5);

    while (rest > 0) {
        const rowCols = Math.min(rest, Math.min(row + 1, maxCols(2.2)));
        const mid = (rowCols - 1) / 2;
        const z = formMinZ() + 0.8 + row * (depthSpan / Math.max(3, preferredRows(n) + 1));
        const wing = Math.min(maxW, 3.0 + row * 2.2);

        for (let c = 0; c < rowCols; c++) {
            const x = (c - mid) * (wing / Math.max(1, mid || 1));
            slots.push(clampFormationSlot({ x, z, rot: faceAudience(x, z) }));
            rest--;
        }
        row++;
    }
    return slots.slice(0, n);
}

function layoutChevron(n) {
    return layoutVShape(n);
}

function layoutDoubleRow(n) {
    return layoutRows(n, { forceRows: Math.max(2, preferredRows(n)), starCenter: true });
}

function layoutGrid(n) {
    return layoutRows(n, { forceRows: preferredRows(n), starCenter: false });
}

function layoutSemicircle(n) {
    const slots = layoutCenterCluster(n > 10 ? 2 : 1).map((p, i) => clampSlot({
        x: p.x, z: p.z, rot: i === 0 ? Math.PI : faceAudience(p.x, p.z)
    }));
    const rest = n - slots.length;
    if (rest <= 0) return slots;

    const maxPerArc = Math.min(maxCols(2.4), 8);
    const arcs = Math.ceil(rest / maxPerArc);
    for (let a = 0; a < arcs; a++) {
        const count = Math.min(maxPerArc, rest - a * maxPerArc);
        const radius = 3.5 + a * 2.1;
        const spread = Math.PI * 0.72;
        const zBase = FLOOR.centerZ + 2.2 + a * 1.4;
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const angle = -spread / 2 + spread * t;
            const x = Math.sin(angle) * radius;
            const z = zBase + Math.cos(angle) * radius * 0.22;
            slots.push(clampSlot({ x, z, rot: faceAudience(x, z) }));
        }
    }
    return slots.slice(0, n);
}

function layoutPyramid(n) {
    const slots = [clampSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI })];
    let rest = n - 1;
    let row = 1;
    while (rest > 0) {
        const cols = Math.min(row + 1, maxCols(2.3), rest);
        const mid = (cols - 1) / 2;
        const z = FLOOR.centerZ + row * ROW_DEPTH;
        for (let c = 0; c < cols; c++) {
            slots.push(clampSlot({ x: (c - mid) * 2.3, z, rot: faceAudience((c - mid) * 2, z) }));
            rest--;
        }
        row++;
    }
    return slots.slice(0, n);
}

function layoutHeart(n) {
    if (n <= 8) return layoutDiamond(n);
    const slots = [clampSlot({ x: 0, z: FLOOR.centerZ + 0.5, rot: Math.PI })];
    const rest = n - 1;
    const pts = [];
    for (let i = 0; i < rest; i++) {
        const t = (i / Math.max(1, rest - 1)) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push({ x: hx * 0.22, z: FLOOR.centerZ + 1.2 - hy * 0.16 });
    }
    pts.sort((a, b) => a.z - b.z || a.x - b.x);
    pts.forEach((p) => slots.push(clampSlot({ x: p.x, z: p.z, rot: faceAudience(p.x, p.z) })));
    return slots.slice(0, n);
}

function layoutFan(n) {
    const slots = [clampSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI })];
    const rest = n - 1;
    const rays = Math.min(7, Math.ceil(rest / 2));
    let placed = 0;
    for (let r = 0; r < rays && placed < rest; r++) {
        const depth = Math.min(3, Math.ceil((rest - placed) / (rays - r)));
        const spread = Math.PI * 0.55;
        const baseAngle = -spread / 2 + (r / Math.max(1, rays - 1)) * spread;
        for (let d = 0; d < depth && placed < rest; d++) {
            const radius = 2.8 + d * 2.2;
            const x = Math.sin(baseAngle) * radius;
            const z = FLOOR.centerZ + 1.5 + Math.cos(baseAngle) * radius * 0.35 + d * 0.5;
            slots.push(clampSlot({ x, z, rot: faceAudience(x, z) }));
            placed++;
        }
    }
    return slots.slice(0, n);
}

function layoutCross(n) {
    const slots = [clampSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI })];
    const rest = n - 1;
    const arms = [
        { dx: 0, dz: 1 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }
    ];
    let i = 0;
    let step = 1;
    while (i < rest) {
        const arm = arms[i % 4];
        const dist = 2.4 + Math.floor(i / 4) * 2.3;
        slots.push(clampSlot({
            x: arm.dx * dist * 2.2,
            z: FLOOR.centerZ + arm.dz * dist * 1.1,
            rot: faceAudience(arm.dx * dist, FLOOR.centerZ + arm.dz * dist)
        }));
        i++;
        step++;
    }
    return slots.slice(0, n);
}

function layoutTunnel(n) {
    const slots = [];
    const half = Math.ceil(n / 2);
    const left = layoutRows(half, { baseZ: FLOOR.centerZ, spacing: 2.35, starCenter: false });
    const right = layoutRows(n - half, { baseZ: FLOOR.centerZ, spacing: 2.35, starCenter: false });
    left.forEach((s, i) => slots.push(clampSlot({ x: s.x - 4.5, z: s.z, rot: 0.35 })));
    right.forEach((s, i) => slots.push(clampSlot({ x: s.x + 4.5, z: s.z, rot: -0.35 })));
    if (slots.length) slots[0] = clampSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI });
    return slots.slice(0, n);
}

function layoutRipple(n) {
    const slots = [clampSlot({ x: 0, z: FLOOR.centerZ, rot: Math.PI })];
    let rest = n - 1;
    let wave = 0;
    while (rest > 0) {
        const count = Math.min(maxCols(2.2), rest, 4 + wave * 2);
        const mid = (count - 1) / 2;
        const z = FLOOR.centerZ + (wave + 1) * ROW_DEPTH;
        const sway = (wave % 2) * 0.8;
        for (let c = 0; c < count; c++) {
            slots.push(clampSlot({
                x: (c - mid) * 2.2 + sway,
                z,
                rot: faceAudience((c - mid) * 2, z)
            }));
            rest--;
        }
        wave++;
    }
    return slots.slice(0, n);
}

/** Star at runway start; audience on L/R rails — clear center aisle, clear of DJ */
function layoutRunway(n) {
    const slots = [clampFormationSlot({ x: 0, z: Math.max(RUNWAY.startZ, formMinZ() + 0.5), rot: Math.PI })];
    const rest = n - 1;
    if (rest <= 0) return slots;

    const leftN = Math.ceil(rest / 2);
    const rightN = rest - leftN;
    const aisle = RUNWAY.aisleHalf;
    const startZ = Math.max(RUNWAY.startZ, formMinZ() + 0.5);
    const endZ = Math.min(RUNWAY.endZ, formMaxZ() - 0.2);

    function wingRails(count, side) {
        const out = [];
        if (count <= 0) return out;

        // Side rails only — no back-arc pile at stage corners
        const railRows = Math.max(2, Math.ceil(count / 2));
        const zSpan = Math.max(2.5, endZ - startZ - 2.5);
        let placed = 0;
        for (let r = 0; r < railRows && placed < count; r++) {
            const t = (r + 0.55) / (railRows + 0.6);
            const z = startZ + 0.8 + t * zSpan;
            const x = side * (aisle + 4.8 + (r % 2) * 1.6);
            out.push(clampFormationSlot({
                x,
                z,
                rot: side > 0 ? -Math.PI * 0.68 : Math.PI * 0.68
            }));
            placed++;
            if (placed < count) {
                out.push(clampFormationSlot({
                    x: x + side * 1.1,
                    z: z + 0.45,
                    rot: side > 0 ? -Math.PI * 0.72 : Math.PI * 0.72
                }));
                placed++;
            }
        }
        return out.slice(0, count);
    }

    return slots.concat(wingRails(leftN, -1), wingRails(rightN, 1)).slice(0, n);
}

function buildCrowdGridSlots(n) {
    return buildEvenFloorGrid(n);
}

function buildPatternLayout(patternId, n) {
    switch (patternId) {
        case 'v_shape': return layoutVShape(n);
        case 'arc_wide': return layoutArc(n);
        case 'line_front': return layoutRows(n, { forceRows: 1, starCenter: true });
        case 'diamond': return layoutDiamond(n);
        case 'wings': return layoutWings(n);
        case 'circle': return layoutConcentric(n);
        case 'stairs': return layoutStairs(n);
        case 'scatter': return layoutScatter(n);
        case 'double_row': return layoutDoubleRow(n);
        case 'chevron': return layoutChevron(n);
        case 'heart': return layoutHeart(n);
        case 'pyramid': return layoutPyramid(n);
        case 'semicircle': return layoutSemicircle(n);
        case 'fan': return layoutFan(n);
        case 'cross': return layoutCross(n);
        case 'tunnel': return layoutTunnel(n);
        case 'ripple': return layoutRipple(n);
        case 'grid':
            return buildEvenFloorGrid(n);
        default:
            return buildEvenFloorGrid(n);
    }
}

function buildSlots(patternId, count) {
    const n = Math.max(1, count);
    if (patternId === 'runway') {
        return pinCommanderCenter(
            layoutRunway(n).map((s) => clampFormationSlot(s)),
            'runway'
        );
    }
    let slots = buildPatternLayout(patternId, n).map((s) => clampFormationSlot(s));
    slots = ensureSlotCount(slots, n);
    slots = spreadSlots(slots, MIN_DIST);
    return pinCommanderCenter(slots, patternId);
}

/**
 * Place star at runway start and others on both sides.
 * Returns { start, end } world positions for the walk.
 */
export async function applyRunwayFormation(dancers, starId, duration = 1.4) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    await applyFormationPattern(dancers, starId, 'runway', duration, { skipHeld: true });
    if (star) {
        star.elevated = false;
        animateDancerTo(star, 0, RUNWAY.startZ, Math.PI, Math.min(duration, 1.1), 0);
        await waitTween(star, Math.min(duration, 1.1));
    }
    return {
        start: { x: 0, z: RUNWAY.startZ, rot: Math.PI },
        end: { x: 0, z: RUNWAY.endZ, rot: Math.PI }
    };
}

export function walkDancerAlong(dancer, from, to, duration = 4.5) {
    if (from) {
        dancer.elevated = false;
        dancer.baseY = 0;
        dancer.root.position.x = from.x;
        dancer.root.position.z = from.z;
    }
    animateDancerTo(dancer, to.x, to.z, to.rot ?? Math.PI, duration, 0);
    return waitTween(dancer, duration);
}

/** Pick a floor spot far from current position — used by zipline reposition */
export function pickZiplineDestination(dancer, dancers, seed = '') {
    const cx = dancer.root.position.x;
    const cz = dancer.root.position.z;
    const n = Math.max(10, dancers.length + 8);
    const slots = buildSlots('scatter', n);
    const minDist = 3.8;

    let candidates = slots.filter((s) => Math.hypot(s.x - cx, s.z - cz) >= minDist);

    if (!candidates.length) {
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + 0.4;
            const r = 5.5 + (i % 4) * 1.8;
            candidates.push(clampSlot({
                x: Math.sin(a) * r,
                z: FLOOR.centerZ + Math.cos(a) * r * 0.78,
                rot: faceAudience(Math.sin(a) * r, FLOOR.centerZ)
            }));
        }
    }

    let h = 0;
    const s = String(seed || dancer.profile?.id || 'zip');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

    candidates.sort((a, b) => {
        const da = Math.hypot(a.x - cx, a.z - cz);
        const db = Math.hypot(b.x - cx, b.z - cz);
        let scoreA = da;
        let scoreB = db;
        for (const other of dancers) {
            if (other === dancer) continue;
            const ox = other.root.position.x;
            const oz = other.root.position.z;
            if (Math.hypot(a.x - ox, a.z - oz) < 1.6) scoreA -= 8;
            if (Math.hypot(b.x - ox, b.z - oz) < 1.6) scoreB -= 8;
        }
        return scoreB - scoreA;
    });

    const pick = candidates[h % Math.min(6, candidates.length)] || candidates[0];
    return pick || clampSlot({ x: cx, z: cz, rot: Math.PI });
}

function assignFormationSlots(movable, slots, star) {
    const assignments = new Map();
    if (!movable.length || !slots.length) return assignments;

    const rest = movable.filter((d) => d !== star);
    if (star && movable.includes(star)) {
        assignments.set(star, slots[0]);
    }

    rest.sort((a, b) => {
        const ax = a.root.position.x;
        const az = a.root.position.z;
        const bx = b.root.position.x;
        const bz = b.root.position.z;
        const aa = Math.atan2(ax, az);
        const ba = Math.atan2(bx, bz);
        if (Math.abs(aa - ba) > 0.001) return aa - ba;
        return Math.hypot(ax, az) - Math.hypot(bx, bz);
    });

    const pool = slots.slice(star && movable.includes(star) ? 1 : 0);
    pool.sort((a, b) => a.z - b.z || a.x - b.x);
    rest.forEach((d, i) => {
        if (pool[i]) assignments.set(d, pool[i]);
    });
    return assignments;
}

export function applyFormationPattern(dancers, starId, patternId, duration = 1.5, opts = {}) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    const others = dancers.filter((d) => d !== star);
    const ordered = [star, ...others].filter(Boolean);
    // Everyone on main floor reshapes — only DJ booth stays put
    const movable = ordered.filter((d) => {
        if (!shouldHoldFormationPosition(d)) return true;
        return patternId === 'runway' && d === star;
    });
    if (!movable.length) return Promise.resolve();

    formationCommanderId = (movable[0] || star)?.profile?.id || null;
    formationPatternId = patternId;

    const slots = buildSlots(patternId, movable.length);
    const assignments = assignFormationSlots(movable, slots, star);

    const pending = movable.map((d, i) => {
        const isRunwayStar = patternId === 'runway' && d === star;
        if (shouldHoldFormationPosition(d) && !isRunwayStar) return Promise.resolve();
        const s = assignments.get(d);
        if (!s) return Promise.resolve();
        const ty = formationTargetY(s, patternId);
        const stagger = i * 0.03;
        animateDancerTo(d, s.x, s.z, s.rot ?? Math.PI, duration + stagger, ty);
        d.elevated = ty > 0.4;
        d.onDjBooth = false;
        d.homePos = { x: s.x, z: s.z, rot: s.rot ?? Math.PI, y: ty };
        return waitTween(d, duration + stagger);
    });

    return Promise.all(pending);
}

/** Solo show — star center, floor dancers form circle around them (DJ stays) */
export function applySoloCircleFormation(dancers, starId, duration = 1.4) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    const others = dancers.filter((d) => d !== star);
    const ordered = [star, ...others].filter(Boolean);
    const movable = ordered.filter((d) => !shouldHoldFormationPosition(d));
    if (!movable.length) return Promise.resolve();

    formationCommanderId = star?.profile?.id || null;
    formationPatternId = 'solo_circle';

    const slots = layoutSoloCircle(movable.length);
    const assignments = assignFormationSlots(movable, slots, star);

    const pending = movable.map((d, i) => {
        const s = assignments.get(d);
        if (!s) return Promise.resolve();
        const stagger = i * 0.03;
        if (d === star) {
            d.onDjBooth = false;
            d.elevated = false;
        }
        animateDancerTo(d, s.x, s.z, s.rot ?? Math.PI, duration + stagger, 0);
        return waitTween(d, duration + stagger);
    });
    return Promise.all(pending);
}

export function applyRandomFormation(dancers, starId, duration = 1.6, opts = {}) {
    const pool = FORMATION_PATTERN_IDS.filter((id) => id !== 'runway');
    const pick = pool[Math.floor(Math.random() * pool.length)] || 'grid';
    return applyFormationPattern(dancers, starId, pick, duration, opts);
}

export function applyFrontRow(dancers, starId, duration = 1.2) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    const hx = star.homePos?.x ?? star.root.position.x;
    star.elevated = false;
    animateDancerTo(star, hx, FRONT_Z, Math.PI * 0.95, duration, 0);
    return waitTween(star, duration);
}

/** Full-width DJ riser slot grid (uses entire stage width, avoids booth center) */
function buildDjBoothSlots() {
    const slots = [];
    const halfW = FLOOR_TILE.spanX / 2 - 1.0;
    const stepX = 1.95;
    const zRows = [
        DJ_DECK.z + 0.55,
        DJ_DECK.z + 1.25,
        DJ_DECK.z + 1.95,
        DJ_DECK.z + 2.65
    ];
    for (let x = -halfW; x <= halfW + 0.01; x += stepX) {
        const xi = Math.round(x * 10) / 10;
        for (const z of zRows) {
            if (Math.abs(xi) < 3.6 && z >= DJ_DECK.z - 0.2) continue;
            slots.push({ x: xi, z, y: DJ_DECK.y, rot: Math.PI });
        }
    }
    return slots;
}

/** Move dancer onto DJ riser — pick a free slot across full stage width */
export function applyDjBooth(dancers, starId, duration = 1.25) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    if (!star) return Promise.resolve();

    const slots = buildDjBoothSlots();
    const occupied = dancers
        .filter((d) => d !== star && ((d.onDjBooth) || (d.baseY || 0) >= DJ_DECK.y - 0.35))
        .map((d) => ({ x: d.root.position.x, z: d.root.position.z }));

    const MIN_DJ = 1.85;
    let best = slots[0];
    let bestScore = -Infinity;
    for (const slot of slots) {
        let minD = occupied.length ? Infinity : 12;
        for (const o of occupied) {
            minD = Math.min(minD, Math.hypot(o.x - slot.x, o.z - slot.z));
        }
        if (minD < MIN_DJ) continue;
        const prefer = -Math.abs(slot.x - (star.root.position.x || 0)) * 0.06;
        const score = minD + prefer;
        if (score > bestScore) {
            bestScore = score;
            best = slot;
        }
    }

    if (bestScore === -Infinity) {
        const n = occupied.length;
        const side = (star.root.position.x || 0) < 0 ? -1 : 1;
        const row = Math.floor(n / 8);
        const col = n % 8;
        best = {
            x: side * (5.5 + col * 1.95),
            z: DJ_DECK.z - 0.45 + row * 0.85,
            y: DJ_DECK.y,
            rot: Math.PI
        };
    }

    star.onDjBooth = true;
    star.elevated = true;
    star.setStagePriority?.(true);
    animateDancerTo(star, best.x, best.z, best.rot, duration, best.y);
    return waitTween(star, duration);
}

/** Place overflow guests on L/R floor wings (same level as center tiles) */
export function pickSideDeckSlot(occupied = [], preferSide = 0) {
    const sides = preferSide < 0
        ? ['left', 'right']
        : preferSide > 0
            ? ['right', 'left']
            : ['left', 'right'];
    const cols = 3;
    const rows = 4;
    const candidates = [];
    for (const wing of sides) {
        const cx = wing === 'left' ? SIDE_DECK.leftX : SIDE_DECK.rightX;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cx + (c - (cols - 1) / 2) * 2.35;
                const z = SIDE_DECK.z + (r - (rows - 1) / 2) * 2.2;
                candidates.push({
                    x,
                    z,
                    y: 0,
                    rot: Math.atan2(-x, -(z - 5)) * 0.85
                });
            }
        }
    }
    for (const slot of candidates) {
        const clash = occupied.some((p) => {
            const dx = (p.x ?? 0) - slot.x;
            const dz = (p.z ?? 0) - slot.z;
            return dx * dx + dz * dz < 1.8;
        });
        if (!clash) return slot;
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || {
        x: SIDE_DECK.leftX, z: SIDE_DECK.z, y: 0, rot: Math.PI
    };
}

export function getStageLinePositions(stageIds, dancers) {
    const count = stageIds.length;
    const cols = maxCols(2.2);
    const rows = Math.ceil(count / cols);
    const positions = [];

    stageIds.forEach((id, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const rowCount = Math.min(cols, count - row * cols);
        const mid = (rowCount - 1) / 2;
        const d = dancers.find((x) => x.profile.id === id);
        const hx = (d?.homePos?.x ?? 0) * 0.1;
        const raw = {
            x: (col - mid) * 2.2 + hx,
            // Front row first (audience), then fill backward
            z: FRONT_Z - row * 2.15,
            rot: Math.PI
        };
        const clamped = clampSlot(raw);
        positions.push({ id, x: clamped.x, z: clamped.z, rot: clamped.rot });
    });
    return positions;
}

export function applyStageLine(dancers, stageIds, duration = 1.3) {
    const positions = getStageLinePositions(stageIds, dancers);
    const pending = positions.map((pos, i) => {
        const d = dancers.find((x) => x.profile.id === pos.id);
        if (!d) return Promise.resolve();
        animateDancerTo(d, pos.x, pos.z, pos.rot, duration + i * 0.05);
        return waitTween(d, duration + i * 0.05);
    });
    return Promise.all(pending);
}

export function restoreDancerHome(dancer, duration = 1.4) {
    if (!dancer?.homePos) return Promise.resolve();
    dancer.onDjBooth = false;
    dancer.setStagePriority?.(false);
    const y = dancer.homePos.y != null ? dancer.homePos.y : 0;
    dancer.elevated = y > 0.4;
    animateDancerTo(dancer, dancer.homePos.x, dancer.homePos.z, dancer.homePos.rot, duration, y);
    return waitTween(dancer, duration);
}

export function restoreAllHome(dancers, duration = 1.6) {
    clearFormationState();
    const pending = dancers.map((d) => {
        if (shouldHoldFormationPosition(d)) return Promise.resolve();
        return restoreDancerHome(d, duration);
    });
    return Promise.all(pending);
}

export function applyFormation(dancers, formationId, starId, duration = 1.5) {
    const star = dancers.find((d) => d.profile.id === starId) || dancers[0];
    if (formationId === 'default') return restoreAllHome(dancers, duration);
    if (formationId === 'front_row') return applyFrontRow(dancers, starId, duration);
    if (formationId === 'dj_booth') return applyDjBooth(dancers, starId, duration);
    if (formationId === 'solo_show') return applySoloCircleFormation(dancers, starId, duration);
    if (formationId === 'stage') return applyStageLine(dancers, [starId], duration);
    if (formationId === 'formation_v') return applyFormationPattern(dancers, starId, 'v_shape', duration, { skipHeld: true });
    if (formationId === 'formation_arc') return applyFormationPattern(dancers, starId, 'arc_wide', duration, { skipHeld: true });
    return applyFormationPattern(dancers, starId, formationId, duration, { skipHeld: true });
}
