/**
 * Background system — a large cyclorama shader behind the stage plus a
 * matching fog/ambient tint. Every theme reacts to the audio frame and the
 * whole set can auto-cycle on musical phrases.
 */
import * as THREE from 'three';
import { BACKGROUND_THEMES, BACKGROUND_IDS } from './background-themes.js';

export { BACKGROUND_THEMES, BACKGROUND_IDS };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uBeatIndex;
uniform float uReact;
uniform float uBlend;      // 0..1 crossfade between uThemeA and uThemeB
uniform int   uThemeA;
uniform int   uThemeB;
uniform vec3  uTintA;
uniform vec3  uTintB;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.02;
        a *= 0.5;
    }
    return v;
}

/* ---------- themes ---------- */

vec3 retrowave(vec2 uv, vec3 tint, float pulse) {
    vec3 col = mix(vec3(0.05, 0.01, 0.12), vec3(0.28, 0.03, 0.35), uv.y);

    // Sun
    vec2 sc = uv - vec2(0.5, 0.52);
    sc.x *= 1.9;
    float d = length(sc);
    float sun = smoothstep(0.30, 0.28, d);
    float stripes = step(0.42, fract(uv.y * 34.0 - uTime * 0.25));
    sun *= mix(1.0, stripes, smoothstep(0.52, 0.42, uv.y));
    col = mix(col, mix(vec3(1.0, 0.85, 0.3), tint, uv.y * 1.4), sun);

    // Perspective floor grid
    if (uv.y < 0.42) {
        float persp = 1.0 / max(0.02, (0.42 - uv.y));
        float gx = abs(fract((uv.x - 0.5) * persp * 0.55) - 0.5);
        float gz = abs(fract(persp * 0.28 + uTime * (0.5 + pulse)) - 0.5);
        float line = smoothstep(0.46, 0.5, max(1.0 - gx * 6.0, 1.0 - gz * 6.0));
        col += tint * line * (0.5 + pulse * 1.4) * smoothstep(0.0, 0.42, uv.y + 0.1);
    }

    col += tint * pulse * 0.18;
    return col;
}

vec3 nebula(vec2 uv, vec3 tint, float pulse) {
    vec2 p = uv * vec2(2.4, 1.6);
    float f = fbm(p + vec2(uTime * 0.05, uTime * 0.03));
    float f2 = fbm(p * 1.7 - vec2(uTime * 0.04, 0.0));
    vec3 col = mix(vec3(0.02, 0.01, 0.09), tint * 0.9, smoothstep(0.25, 0.85, f));
    col += vec3(0.15, 0.05, 0.4) * f2 * (0.6 + pulse * 1.2);
    col *= 0.55 + pulse * 0.9;
    float stars = step(0.9975, hash(floor(uv * 700.0)));
    col += vec3(stars) * (0.5 + uTreble * 2.0);
    return col;
}

vec3 tunnel(vec2 uv, vec3 tint, float pulse) {
    vec2 p = (uv - 0.5) * vec2(2.0, 1.2);
    float r = length(p);
    float a = atan(p.y, p.x);
    float rings = fract(1.0 / max(0.05, r) * 0.35 - uTime * (0.6 + pulse * 1.5));
    float band = smoothstep(0.5, 0.95, rings);
    float spokes = 0.5 + 0.5 * sin(a * 12.0 + uTime * 1.4);
    vec3 col = mix(vec3(0.01, 0.02, 0.05), tint, band * (0.4 + spokes * 0.6));
    col *= smoothstep(1.3, 0.1, r) * (0.7 + pulse * 1.3);
    return col;
}

vec3 equalizer(vec2 uv, vec3 tint, float pulse) {
    float bars = 26.0;
    float idx = floor(uv.x * bars);
    float seed = hash(vec2(idx, 3.0));
    float h = 0.12
        + uBass * 0.55 * (0.5 + 0.5 * sin(idx * 0.7 + uTime * 2.0))
        + uMid * 0.4 * seed
        + uTreble * 0.35 * fract(seed * 7.0);
    h = clamp(h, 0.04, 0.95);
    float gap = smoothstep(0.06, 0.12, abs(fract(uv.x * bars) - 0.5) * 2.0);
    float bar = step(uv.y, h) * (1.0 - gap);
    vec3 hot = mix(tint, vec3(1.0, 1.0, 1.0), smoothstep(0.0, h, uv.y));
    vec3 col = vec3(0.02, 0.03, 0.05);
    col += hot * bar * (0.8 + pulse * 1.2);
    col += tint * bar * 0.25;
    // Reflection
    float refl = step(uv.y, h * 0.35) * (1.0 - gap) * 0.12;
    col += tint * refl;
    return col;
}

vec3 starfield(vec2 uv, vec3 tint, float pulse) {
    vec2 p = (uv - 0.5) * 2.0;
    vec3 col = vec3(0.01, 0.012, 0.03);
    for (int i = 0; i < 3; i++) {
        float layer = float(i) + 1.0;
        vec2 q = p * (1.0 + layer * 0.6);
        float t = uTime * (0.08 * layer) * (1.0 + pulse * 2.0);
        vec2 cell = floor(q * (18.0 * layer) + vec2(t * 12.0, 0.0));
        float s = step(0.985 - pulse * 0.006, hash(cell));
        col += vec3(s) * (0.35 / layer) * mix(vec3(1.0), tint, 0.4);
    }
    float glow = smoothstep(1.2, 0.0, length(p));
    col += tint * glow * pulse * 0.5;
    return col;
}

vec3 city(vec2 uv, vec3 tint, float pulse) {
    vec3 sky = mix(vec3(0.08, 0.02, 0.14), vec3(0.35, 0.1, 0.2), uv.y);
    vec3 col = sky;
    // Two parallax building layers
    for (int L = 0; L < 2; L++) {
        float lf = float(L);
        float scale = 14.0 + lf * 9.0;
        float bi = floor(uv.x * scale + lf * 3.0);
        float h = 0.16 + hash(vec2(bi, lf)) * (0.34 - lf * 0.1);
        float inside = step(uv.y, h);
        vec3 bcol = mix(vec3(0.03, 0.02, 0.06), vec3(0.08, 0.04, 0.12), lf);
        col = mix(col, bcol, inside);
        // Windows blink with treble
        vec2 wcell = floor(vec2(uv.x * scale * 4.0, uv.y * 60.0));
        float lit = step(0.62, hash(wcell + lf * 17.0));
        float blink = step(0.4, fract(hash(wcell) * 9.0 + uTime * 0.4 + uTreble * 2.0));
        col += tint * inside * lit * blink * (0.35 + pulse * 0.9);
    }
    col += tint * pulse * 0.12;
    return col;
}

vec3 plasma(vec2 uv, vec3 tint, float pulse) {
    vec2 p = uv * 4.0;
    float t = uTime * 0.5 + pulse * 2.0;
    float v = sin(p.x + t) + sin(p.y * 1.3 + t * 1.2)
            + sin((p.x + p.y) * 0.8 + t * 0.7)
            + sin(length(p - 2.0) * 2.0 - t * 1.5);
    v *= 0.25;
    vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + v * 3.14159 + uTime * 0.2);
    col = mix(col, tint, 0.45);
    col *= 0.35 + pulse * 0.9 + uMid * 0.5;
    return col;
}

vec3 strobefield(vec2 uv, vec3 tint, float pulse) {
    float flash = step(0.55, pulse);
    float bands = step(0.5, fract(uv.y * 18.0 - uTime * 2.0 + uBeatIndex * 0.25));
    vec3 col = vec3(0.015);
    col += vec3(bands) * flash * 0.7;
    col += tint * pulse * 0.55;
    float vign = smoothstep(1.1, 0.2, length(uv - 0.5) * 1.6);
    return col * vign;
}

vec3 themeColor(int id, vec2 uv, vec3 tint, float pulse) {
    if (id == 0) return retrowave(uv, tint, pulse);
    if (id == 1) return nebula(uv, tint, pulse);
    if (id == 2) return tunnel(uv, tint, pulse);
    if (id == 3) return equalizer(uv, tint, pulse);
    if (id == 4) return starfield(uv, tint, pulse);
    if (id == 5) return city(uv, tint, pulse);
    if (id == 6) return plasma(uv, tint, pulse);
    return strobefield(uv, tint, pulse);
}

void main() {
    float pulse = clamp((uBeat * 0.75 + uBass * 0.55) * uReact, 0.0, 1.6);
    vec3 a = themeColor(uThemeA, vUv, uTintA, pulse);
    vec3 col = a;
    if (uBlend > 0.001) {
        vec3 b = themeColor(uThemeB, vUv, uTintB, pulse);
        col = mix(a, b, uBlend);
    }
    // Gentle vignette so dancers stay readable
    col *= smoothstep(1.35, 0.25, length((vUv - 0.5) * vec2(1.1, 1.5)));
    gl_FragColor = vec4(col, 1.0);
}
`;

export function createBackground(scene, opts = {}) {
    const width = opts.width || 96;
    const height = opts.height || 40;

    const uniforms = {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
        uBeatIndex: { value: 0 },
        uReact: { value: 1 },
        uBlend: { value: 0 },
        uThemeA: { value: 0 },
        uThemeB: { value: 1 },
        uTintA: { value: new THREE.Color(BACKGROUND_THEMES[0].tint) },
        uTintB: { value: new THREE.Color(BACKGROUND_THEMES[1].tint) }
    };

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthWrite: false,
        toneMapped: false
    });

    // Curved cyclorama so it wraps behind the room
    const geo = new THREE.CylinderGeometry(width * 0.42, width * 0.42, height, 64, 1, true, -Math.PI * 0.9, Math.PI * 1.8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.material.side = THREE.BackSide;
    mesh.position.set(0, height * 0.26, 0);
    mesh.renderOrder = -10;
    scene.add(mesh);

    const state = {
        current: 0,
        next: 1,
        blending: false,
        blendT: 0,
        autoCycle: false,
        autoBeats: 16,
        beatCounter: 0,
        reactiveMode: 'ai',
        react: 1
    };

    function themeIndex(id) {
        const i = BACKGROUND_IDS.indexOf(id);
        return i < 0 ? 0 : i;
    }

    function applyTint(slot, idx) {
        const theme = BACKGROUND_THEMES[idx];
        uniforms[slot].value.set(theme.tint);
    }

    function setTheme(id, { instant = false } = {}) {
        const idx = typeof id === 'number' ? id : themeIndex(id);
        if (idx === state.current && !state.blending) return BACKGROUND_THEMES[idx];
        if (instant) {
            state.current = idx;
            state.blending = false;
            state.blendT = 0;
            uniforms.uThemeA.value = idx;
            uniforms.uBlend.value = 0;
            applyTint('uTintA', idx);
        } else {
            state.next = idx;
            state.blending = true;
            state.blendT = 0;
            uniforms.uThemeB.value = idx;
            applyTint('uTintB', idx);
        }
        const theme = BACKGROUND_THEMES[idx];
        if (scene.fog) scene.fog.color.set(theme.fog);
        return theme;
    }

    function nextTheme() {
        const target = (state.blending ? state.next : state.current) + 1;
        return setTheme(target % BACKGROUND_THEMES.length);
    }

    function randomTheme() {
        let idx = state.current;
        while (idx === state.current && BACKGROUND_THEMES.length > 1) {
            idx = Math.floor(Math.random() * BACKGROUND_THEMES.length);
        }
        return setTheme(idx);
    }

    function setAutoCycle(on, beats) {
        state.autoCycle = !!on;
        state.autoBeats = Math.max(1, Number(beats) || 16);
        state.beatCounter = 0;
        state.reactiveMode = on ? 'beats' : (state.reactiveMode === 'beats' ? 'off' : state.reactiveMode);
    }

    function setReactiveMode(mode) {
        const m = mode === 'beats' ? 'beats' : mode === 'off' ? 'off' : 'ai';
        state.reactiveMode = m;
        state.autoCycle = m === 'beats';
    }

    function setReactivity(v) {
        state.react = Math.max(0, Math.min(2, Number(v) || 0));
        uniforms.uReact.value = state.react;
    }

    function update(dt, audio = {}) {
        uniforms.uTime.value += dt;
        uniforms.uBass.value = audio.bass || 0;
        uniforms.uMid.value = audio.mid || 0;
        uniforms.uTreble.value = audio.treble || 0;
        uniforms.uBeat.value = audio.beat || 0;
        uniforms.uBeatIndex.value = audio.beatIndex || 0;

        if (state.blending) {
            state.blendT = Math.min(1, state.blendT + dt / 0.9);
            uniforms.uBlend.value = state.blendT;
            if (state.blendT >= 1) {
                state.current = state.next;
                uniforms.uThemeA.value = state.current;
                applyTint('uTintA', state.current);
                uniforms.uBlend.value = 0;
                state.blending = false;
                state.blendT = 0;
            }
        }

        if (state.reactiveMode === 'beats' && state.autoCycle && audio.playing && audio.hit) {
            state.beatCounter++;
            if (state.beatCounter >= state.autoBeats) {
                state.beatCounter = 0;
                if (!state.blending) randomTheme();
            }
        }
    }

    function currentTheme() {
        return BACKGROUND_THEMES[state.blending ? state.next : state.current];
    }

    return {
        mesh,
        material,
        setTheme,
        nextTheme,
        randomTheme,
        setAutoCycle,
        setReactiveMode,
        setReactivity,
        currentTheme,
        update,
        get autoCycle() { return state.autoCycle; },
        dispose() {
            geo.dispose();
            material.dispose();
            scene.remove(mesh);
        }
    };
}
