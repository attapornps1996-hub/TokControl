/**
 * Stage atmosphere — fire, water, snow, smoke, floor sparkle.
 */
import * as THREE from 'three';

import { createStageFxWorkerBridge } from './stage-fx-bridge.js';

const EFFECTS = ['fire', 'water', 'snow', 'smoke', 'sparkle'];

const SOFT_VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
    vLife = aLife;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * (280.0 / -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
}
`;

const SOFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float soft = smoothstep(0.5, 0.08, d);
    float alpha = soft * vLife * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
}
`;

const SPARK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float glow = smoothstep(0.5, 0.15, d) * 0.55;
    float alpha = (core + glow) * vLife * uOpacity;
    if (alpha < 0.01) discard;
    vec3 col = mix(uColor, vec3(1.0, 0.95, 0.75), core * 0.65);
    gl_FragColor = vec4(col, alpha);
}
`;

const SMOKE_VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
attribute float aRot;
varying float vLife;
varying float vRot;
void main() {
    vLife = aLife;
    vRot = aRot;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(2.0, aSize * (340.0 / -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
varying float vRot;
void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float c = cos(vRot);
    float s = sin(vRot);
    uv = mat2(c, -s, s, c) * uv;
    uv.x *= 2.1;
    uv.y *= 0.48;
    float n1 = sin(uv.x * 7.5 + uv.y * 4.2 + vRot) * 0.5 + 0.5;
    float n2 = sin(uv.x * 13.0 - uv.y * 8.5 + vRot * 1.7) * 0.5 + 0.5;
    float n3 = sin(uv.x * 5.0 + uv.y * 11.0) * 0.5 + 0.5;
    float wisp = smoothstep(0.62, 0.02, abs(uv.y) + n1 * 0.28 + n3 * 0.12);
    wisp *= smoothstep(0.75, 0.08, abs(uv.x) * 0.55 + n2 * 0.22);
    float curl = smoothstep(0.5, 0.0, length(vec2(uv.x * 0.7, uv.y * 1.4 + n1 * 0.35)));
    float alpha = max(wisp, curl * 0.45) * vLife * uOpacity * (0.32 + n1 * 0.38);
    if (alpha < 0.01) discard;
    vec3 col = mix(uColor * 0.68, uColor * 1.08, wisp * 0.55 + n2 * 0.15);
    gl_FragColor = vec4(col, alpha * 0.82);
}
`;

function makeSoftMat(color, opacity, frag = SOFT_FRAG) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: opacity }
        },
        vertexShader: SOFT_VERT,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
    });
}

function makeSmokeMat(color, opacity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: opacity }
        },
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false
    });
}

function makePool(count, mat, withRot = false) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const aLife = new Float32Array(count);
    const size = new Float32Array(count);
    const aRot = withRot ? new Float32Array(count) : null;
    for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] = -99;
        life[i] = 0;
        aLife[i] = 0;
        size[i] = 1;
        if (aRot) aRot[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(aLife, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    if (aRot) geo.setAttribute('aRot', new THREE.BufferAttribute(aRot, 1));
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = withRot ? 3 : 4;
    return { points, pos, vel, life, aLife, size, aRot, count, alive: 0 };
}

export function createStageEffects(scene, opts = {}) {
    const fxBridge = createStageFxWorkerBridge({ useWorker: opts.useStageFxWorker !== false });
    const group = new THREE.Group();
    group.position.set(0, 0, opts.floorZ ?? 2);
    scene.add(group);

    const pools = {
        fire: makePool(140, makeSoftMat(0xff6622, 0.9, SPARK_FRAG)),
        water: makePool(140, makeSoftMat(0x66d4ff, 0.75, SOFT_FRAG)),
        snow: makePool(180, makeSoftMat(0xffffff, 0.85, SOFT_FRAG)),
        smoke: makePool(160, makeSmokeMat(0xb8bcc8, 0.58), true),
        sparkle: makePool(72, makeSoftMat(0xff9922, 0.9, SPARK_FRAG))
    };
    Object.values(pools).forEach((p) => group.add(p.points));
    fxBridge.bindPools(pools);

    const state = {
        active: new Set(),
        auto: false,
        autoBeat: 0,
        timed: new Map(),
        songChangeQuietUntil: 0,
        smokeEnabled: true,
        smokeOnSongChange: true,
        smokeCrowdMuted: false,
        crowdLevel: 0,
        smokeSweepUntil: 0,
        smokeSweepSide: 0,
        songStartAt: 0,
        lastSparkleAt: 0
    };

    function isSongChangeQuiet() {
        return performance.now() < state.songChangeQuietUntil;
    }

    function onSongChange() {
        state.songChangeQuietUntil = performance.now() + 4500;
    }

    function spawn(pool, kind, extra = {}) {
        const i = pool.alive % pool.count;
        pool.alive++;
        const ix = i * 3;

        if (kind === 'fire') {
            pool.pos[ix] = (Math.random() - 0.5) * 22;
            pool.pos[ix + 1] = 0.1 + Math.random() * 0.8;
            pool.pos[ix + 2] = (Math.random() - 0.5) * 10;
            pool.vel[ix] = (Math.random() - 0.5) * 0.5;
            pool.vel[ix + 1] = 2.2 + Math.random() * 2.8;
            pool.vel[ix + 2] = (Math.random() - 0.5) * 0.4;
            pool.size[i] = 0.7 + Math.random() * 0.9;
            pool.life[i] = 1;
            pool.aLife[i] = 1;
        } else if (kind === 'water') {
            pool.pos[ix] = (Math.random() - 0.5) * 28;
            pool.pos[ix + 1] = 9 + Math.random() * 5;
            pool.pos[ix + 2] = (Math.random() - 0.5) * 12;
            pool.vel[ix] = (Math.random() - 0.5) * 0.3;
            pool.vel[ix + 1] = -3.2 - Math.random() * 2.5;
            pool.vel[ix + 2] = (Math.random() - 0.5) * 0.3;
            pool.size[i] = 0.35 + Math.random() * 0.4;
            pool.life[i] = 1;
            pool.aLife[i] = 1;
        } else if (kind === 'smoke') {
            const side = extra.side ?? (Math.random() < 0.5 ? -1 : 1);
            const sweep = extra.sweep === true;
            const floor = extra.floor === true;
            if (floor) {
                pool.pos[ix] = (Math.random() - 0.5) * 20;
                pool.pos[ix + 1] = 0.05 + Math.random() * 0.35;
                pool.pos[ix + 2] = (Math.random() - 0.5) * 10;
                pool.vel[ix] = (Math.random() - 0.5) * 0.2;
                pool.vel[ix + 1] = 0.15 + Math.random() * 0.35;
                pool.vel[ix + 2] = (Math.random() - 0.5) * 0.15;
                pool.size[i] = 2.2 + Math.random() * 3.5;
                pool.life[i] = 1.1 + Math.random() * 0.4;
            } else if (sweep) {
                pool.pos[ix] = side * (12 + Math.random() * 4);
                pool.pos[ix + 1] = 0.2 + Math.random() * 1.8;
                pool.pos[ix + 2] = (Math.random() - 0.5) * 9;
                pool.vel[ix] = -side * (1.0 + Math.random() * 1.4);
                pool.vel[ix + 1] = 0.45 + Math.random() * 0.65;
                pool.vel[ix + 2] = (Math.random() - 0.5) * 0.3;
                pool.size[i] = 2.0 + Math.random() * 2.8;
                pool.life[i] = 1.0 + Math.random() * 0.25;
            } else {
                pool.pos[ix] = (Math.random() - 0.5) * 24;
                pool.pos[ix + 1] = 0.3 + Math.random() * 2.0;
                pool.pos[ix + 2] = (Math.random() - 0.5) * 8;
                pool.vel[ix] = (Math.random() - 0.5) * 0.35;
                pool.vel[ix + 1] = 0.4 + Math.random() * 0.6;
                pool.vel[ix + 2] = (Math.random() - 0.5) * 0.25;
                pool.size[i] = 1.8 + Math.random() * 2.6;
                pool.life[i] = 0.85 + Math.random() * 0.35;
            }
            pool.aLife[i] = pool.life[i];
            if (pool.aRot) pool.aRot[i] = Math.random() * Math.PI * 2;
        } else if (kind === 'sparkle') {
            pool.pos[ix] = extra.x ?? (Math.random() - 0.5) * 18;
            pool.pos[ix + 1] = 0.05 + Math.random() * 0.15;
            pool.pos[ix + 2] = extra.z ?? (Math.random() - 0.5) * 8;
            pool.vel[ix] = (Math.random() - 0.5) * 0.25;
            pool.vel[ix + 1] = 1.6 + Math.random() * 2.4;
            pool.vel[ix + 2] = (Math.random() - 0.5) * 0.2;
            pool.size[i] = 0.45 + Math.random() * 0.55;
            pool.life[i] = 0.7 + Math.random() * 0.3;
            pool.aLife[i] = pool.life[i];
        } else {
            pool.pos[ix] = (Math.random() - 0.5) * 28;
            pool.pos[ix + 1] = 10 + Math.random() * 5;
            pool.pos[ix + 2] = (Math.random() - 0.5) * 12;
            pool.vel[ix] = (Math.random() - 0.5) * 0.45;
            pool.vel[ix + 1] = -0.55 - Math.random() * 0.7;
            pool.vel[ix + 2] = (Math.random() - 0.5) * 0.35;
            pool.size[i] = 0.3 + Math.random() * 0.4;
            pool.life[i] = 1;
            pool.aLife[i] = 1;
        }

        pool.points.geometry.attributes.position.needsUpdate = true;
        pool.points.geometry.attributes.aLife.needsUpdate = true;
        pool.points.geometry.attributes.aSize.needsUpdate = true;
    }

    function clearPool(pool) {
        for (let i = 0; i < pool.count; i++) {
            pool.life[i] = 0;
            pool.aLife[i] = 0;
            pool.pos[i * 3 + 1] = -99;
            pool.size[i] = 0;
        }
        pool.alive = 0;
        pool.points.geometry.attributes.position.needsUpdate = true;
        pool.points.geometry.attributes.aLife.needsUpdate = true;
        pool.points.geometry.attributes.aSize.needsUpdate = true;
    }

    function setEffect(id, on = true) {
        if (on && isSongChangeQuiet() && ['fire', 'water', 'snow'].includes(id)) {
            return;
        }
        if (!id) {
            state.active.clear();
            Object.values(pools).forEach(clearPool);
            return;
        }
        if (on) state.active.add(id);
        else {
            state.active.delete(id);
            state.timed.delete(id);
            if (pools[id]) clearPool(pools[id]);
        }
    }

    function pulseEffect(id, seconds = 8) {
        if (isSongChangeQuiet() && ['fire', 'water', 'snow'].includes(id)) return;
        setEffect(id, true);
        state.timed.set(id, performance.now() + seconds * 1000);
        const pool = pools[id];
        if (pool) {
            const burst = id === 'snow' ? 80 : id === 'fire' ? 60 : id === 'sparkle' ? 24 : 40;
            for (let n = 0; n < burst; n++) spawn(pool, id);
        }
    }

    function clearAll() {
        state.active.clear();
        state.timed.clear();
        state.smokeSweepUntil = 0;
        Object.values(pools).forEach(clearPool);
    }

    function setSmokeEnabled(on) {
        state.smokeEnabled = !!on;
        if (!on) {
            state.active.delete('smoke');
            clearPool(pools.smoke);
        }
    }

    function setSmokeOnSongChange(on) {
        state.smokeOnSongChange = !!on;
    }

    function burstSmoke(count = 48) {
        if (!state.smokeEnabled || state.smokeCrowdMuted) return;
        state.active.add('smoke');
        const n = Math.min(count, 64);
        for (let i = 0; i < n; i++) spawn(pools.smoke, 'smoke');
    }

    function releaseSmokeOnSongChange() {
        if (!state.smokeOnSongChange || !state.smokeEnabled || state.smokeCrowdMuted) return;
        state.songStartAt = performance.now();
        state.active.add('smoke');
        state.smokeSweepUntil = performance.now() + 8000;

        // Immediate dense floor haze at song start
        for (let n = 0; n < 50; n++) spawn(pools.smoke, 'smoke', { floor: true });
        for (let n = 0; n < 16; n++) spawn(pools.smoke, 'smoke');

        // Side sweep into center after brief delay
        setTimeout(() => {
            if (!state.smokeEnabled) return;
            for (const side of [-1, 1]) {
                for (let n = 0; n < 40; n++) spawn(pools.smoke, 'smoke', { sweep: true, side });
            }
        }, 1600);
    }

    function toggleEffect(id) {
        if (state.active.has(id)) setEffect(id, false);
        else setEffect(id, true);
    }

    function setAuto(on) {
        state.auto = !!on;
        state.autoBeat = 0;
    }

    function burstSparkle() {
        const now = performance.now();
        if (now - state.lastSparkleAt < 280) return;
        state.lastSparkleAt = now;
        state.active.add('sparkle');
        for (let n = 0; n < 12; n++) spawn(pools.sparkle, 'sparkle');
    }

    function burstBackFinale() {
        state.active.add('fire');
        const until = performance.now() + 5500;
        state.timed.set('fire', until);
        for (let n = 0; n < 36; n++) {
            const pool = pools.fire;
            const i = pool.alive % pool.count;
            pool.alive++;
            const ix = i * 3;
            pool.pos[ix] = (Math.random() - 0.5) * 16;
            pool.pos[ix + 1] = 3 + Math.random() * 5;
            pool.pos[ix + 2] = -11 - Math.random() * 7;
            pool.vel[ix] = (Math.random() - 0.5) * 0.6;
            pool.vel[ix + 1] = 2.5 + Math.random() * 3;
            pool.vel[ix + 2] = (Math.random() - 0.5) * 0.35;
            pool.size[i] = 0.8 + Math.random() * 1.1;
            pool.life[i] = 1;
            pool.aLife[i] = 1;
        }
        pools.fire.points.geometry.attributes.position.needsUpdate = true;
    }

    function setCrowdLevel(n) {
        state.crowdLevel = Math.max(0, n | 0);
        const muteFx = state.crowdLevel >= 55;
        state.smokeCrowdMuted = muteFx;
        if (muteFx) {
            state.active.delete('smoke');
            clearPool(pools.smoke);
            state.smokeSweepUntil = 0;
        }
    }

    function update(dt, audio = {}) {
        const beat = audio.beat || 0;
        const playing = !!audio.playing;
        const beatLive = audio.beatLive !== undefined ? !!audio.beatLive : playing;
        const energy = playing && beatLive
            ? Math.max(0.35, ((audio.bass || 0) + (audio.mid || 0) + (audio.treble || 0)) / 3)
            : 0;

        if (!playing) {
            ['fire', 'water', 'snow', 'smoke', 'sparkle'].forEach((id) => {
                if (state.active.has(id)) setEffect(id, false);
            });
        }

        const now = performance.now();
        state.timed.forEach((until, id) => {
            if (now >= until) setEffect(id, false);
        });

        const songStartAge = state.songStartAt ? (now - state.songStartAt) / 1000 : 999;
        const heavyIntro = songStartAge < 35;

        if (state.smokeEnabled && !state.smokeCrowdMuted && playing && beatLive) {
            state.active.add('smoke');
            const baseRate = heavyIntro ? 14 : 4;
            const spawnChance = baseRate * dt * (0.65 + energy * 0.35);
            if (Math.random() < spawnChance) {
                spawn(pools.smoke, 'smoke', heavyIntro && Math.random() < 0.55 ? { floor: true } : {});
            }
        }

        if (playing && audio.strongHit && state.crowdLevel < 80) {
            burstSparkle();
        }

        if (!state.active.size) return;

        const workerHandled = fxBridge.isActive() && fxBridge.scheduleUpdate(state.active, dt);

        if (!workerHandled) {
        state.active.forEach((kind) => {
            const pool = pools[kind];
            if (!pool) return;

            if (playing && kind !== 'smoke' && kind !== 'sparkle') {
                const rate = kind === 'snow' ? 18
                    : kind === 'water' ? 14
                    : kind === 'fire' ? 16
                    : 0;
                const spawnChance = rate * dt * (0.55 + energy);
                if (rate > 0 && Math.random() < spawnChance) spawn(pool, kind);
            }

            let anyAlive = false;
            for (let i = 0; i < pool.count; i++) {
                if (pool.life[i] <= 0) continue;
                anyAlive = true;
                const ix = i * 3;

                pool.pos[ix] += pool.vel[ix] * dt;
                pool.pos[ix + 1] += pool.vel[ix + 1] * dt;
                pool.pos[ix + 2] += pool.vel[ix + 2] * dt;

                if (kind === 'fire') pool.vel[ix + 1] *= 1 - dt * 0.15;
                if (kind === 'smoke') {
                    pool.vel[ix + 1] *= 1 - dt * 0.08;
                    pool.vel[ix] *= 1 - dt * 0.04;
                    if (pool.aRot) pool.aRot[i] += dt * (0.15 + pool.vel[ix + 1] * 0.08);
                }
                if (kind === 'sparkle') pool.vel[ix + 1] *= 1 - dt * 0.12;

                const decay = kind === 'snow' ? 0.12
                    : kind === 'smoke' ? 0.1
                    : kind === 'sparkle' ? 0.45
                    : 0.35;
                pool.life[i] -= dt * decay;
                pool.aLife[i] = Math.max(0, pool.life[i]);

                const maxY = kind === 'smoke' ? 9.5 : 18;
                if (pool.pos[ix + 1] < -0.5 || pool.pos[ix + 1] > maxY || pool.life[i] <= 0) {
                    pool.life[i] = 0;
                    pool.aLife[i] = 0;
                    pool.pos[ix + 1] = -99;
                }
            }

            if (anyAlive) {
                pool.points.geometry.attributes.position.needsUpdate = true;
                pool.points.geometry.attributes.aLife.needsUpdate = true;
                pool.points.geometry.attributes.aSize.needsUpdate = true;
                if (pool.aRot) pool.points.geometry.attributes.aRot.needsUpdate = true;
            } else if (kind === 'sparkle') {
                state.active.delete('sparkle');
            }

            if (pool.points.material.uniforms?.uOpacity) {
                pool.points.material.uniforms.uOpacity.value = 0.75 + beat * 0.12;
            }
        });
        } else {
            for (const kind of state.active) {
                if (kind === 'sparkle' && fxBridge.wasAlive(kind) === false) {
                    state.active.delete('sparkle');
                }
            }
        }

        if (state.smokeSweepUntil > 0 && now > state.smokeSweepUntil) {
            state.smokeSweepUntil = 0;
            if (!state.smokeEnabled) setEffect('smoke', false);
        }
    }

    return {
        group,
        setEffect,
        pulseEffect,
        toggleEffect,
        setAuto,
        setSmokeEnabled,
        setSmokeOnSongChange,
        onSongChange,
        isSongChangeQuiet,
        burstSparkle,
        burstSmoke,
        releaseSmokeOnSongChange,
        burstBackFinale,
        clearAll,
        setCrowdLevel,
        update,
        effects: EFFECTS,
        get smokeEnabled() { return state.smokeEnabled; },
        get smokeOnSongChange() { return state.smokeOnSongChange; },
        dispose() {
            fxBridge.dispose();
            Object.values(pools).forEach((p) => {
                p.points.geometry.dispose();
                p.points.material.dispose();
            });
            scene.remove(group);
        }
    };
}
