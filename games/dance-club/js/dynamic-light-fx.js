/**
 * Dynamic Lighting Effects — stage-wide beat-synced flashes, fades, alternates.
 */

export const DYNAMIC_FX_LABELS = {
    off: 'ปิด',
    beatFlash: 'แฟลชทั้งเวที',
    strongFlash: 'แฟลชดรอป',
    alternate: 'สลับ ซ-ข',
    evenOdd: 'คู่-คี่',
    fadePulse: 'เฟดตามบีท',
    strobeStorm: 'สโตรบถี่',
    rapidFlash: 'กระพริบรัว',
    blackout: 'ดับ-ติด',
    buildUp: 'บิลด์อัพ',
    wave: 'คลื่นไฟ',
    disco: 'ดิสโก้สุ่ม',
    tunnel: 'ไล่รอบเวที',
    halfOff: 'ครึ่งเวที'
};

export const DYNAMIC_FX_IDS = Object.keys(DYNAMIC_FX_LABELS);

const IDENTITY = () => 1;

function wrapGain(fn, fallback = 1) {
    if (typeof fn === 'function') return fn;
    const v = typeof fn === 'number' ? fn : fallback;
    return () => v;
}

const FLASH_FX = new Set(['rapidFlash', 'strobeStorm', 'beatFlash', 'strongFlash']);

/** Graduated flash overlay — spotlights stay smooth unless flash-type FX. */
function applyFlashTierOverlay(result, tier, ctx, time = 0, fxId = '') {
    if (!ctx.playing || tier < 0.05) {
        return { ...result, flashGate: true, flashMod: 0, flashTier: tier, _headStrobe: false, _roomStrobe: false };
    }

    const isFlashFx = FLASH_FX.has(fxId);
    const beat = ctx.beat || 0;
    const hit = !!ctx.hit;

    // Non-flash FX: moving heads pulse gently with beat — no rapid strobe gate
    if (!isFlashFx) {
        const swell = 1 + tier * beat * 0.22 + (hit ? tier * 0.1 : 0);
        return {
            ...result,
            master: result.master * swell,
            bloomBoost: result.bloomBoost + beat * tier * 0.18,
            strobeForce: result.strobeForce,
            flashGate: true,
            flashMod: tier * beat * 0.42 + (hit ? tier * 0.12 : 0),
            flashTier: tier,
            _headStrobe: false,
            _roomStrobe: tier > 0.48
        };
    }

    const t = tier * 0.78;
    if (t < 0.16) {
        return {
            ...result,
            master: result.master * (1 + t * 0.35) + beat * t * 0.4 + (hit ? t * 0.18 : 0),
            bloomBoost: result.bloomBoost + beat * t * 0.22,
            strobeForce: result.strobeForce || hit,
            flashGate: true,
            flashMod: t * beat * 0.38,
            flashTier: t,
            _headStrobe: false,
            _roomStrobe: t > 0.1
        };
    }

    const hz = 6 + t * 32;
    const duty = 0.26 + t * 0.46;
    const threshold = 1 - duty * 2;
    const gate = Math.sin(time * hz * Math.PI * 2) > threshold;
    const headGain = wrapGain(result.headGain);
    const washGain = wrapGain(result.washGain);
    const strobeGain = wrapGain(result.strobeGain);
    const flashBoost = t * (gate ? 0.52 : 0.06);

    return {
        ...result,
        master: gate
            ? result.master * (1 + flashBoost) + beat * 0.2 + (hit ? t * 0.28 : 0)
            : result.master * (0.22 + beat * 0.32 + (1 - t) * 0.28),
        strobeForce: result.strobeForce || gate,
        blackout: gate ? result.blackout * 0.4 : result.blackout + t * 0.04,
        headGain,
        washGain,
        strobeGain,
        bloomBoost: result.bloomBoost + (gate ? flashBoost * 0.65 : beat * t * 0.1),
        laserGain: gate ? Math.max(result.laserGain, 1.02 + t * 0.55) : result.laserGain * (0.45 + (1 - t) * 0.35),
        flashGate: gate,
        flashMod: gate ? t * 0.8 : t * beat * 0.1,
        flashTier: t,
        _headStrobe: true,
        _roomStrobe: true,
        _flashHz: hz,
        _flashThreshold: threshold,
        _flashBeat: beat,
        _flashT: t
    };
}

function materializeFx(result, headCount, washCount, strobeCount, time = 0) {
    const headGains = new Float32Array(Math.max(1, headCount));
    const washGains = new Float32Array(Math.max(1, washCount));
    const strobeGains = new Float32Array(Math.max(1, strobeCount));

    const headStrobe = result._headStrobe === true;
    const roomStrobe = result._roomStrobe === true;
    const hz = result._flashHz;
    const threshold = result._flashThreshold;
    const t = result._flashT ?? 0;
    const beat = result._flashBeat ?? 0;
    const hg = wrapGain(result.headGain);
    const wg = wrapGain(result.washGain);
    const sg = wrapGain(result.strobeGain);

    for (let i = 0; i < headCount; i++) {
        let g = hg(i, headCount);
        if (headStrobe && hz != null && t >= 0.16) {
            const flick = Math.sin(time * hz * 0.92 + i * 0.68) > threshold;
            g = flick ? Math.max(g, 0.78 + t * 0.52 + beat * 0.18) : g * (0.06 + (1 - t) * 0.22);
        }
        headGains[i] = g;
    }
    for (let i = 0; i < washCount; i++) {
        let g = wg(i, washCount);
        if (roomStrobe && hz != null && t >= 0.16) {
            const flick = Math.sin(time * hz * 0.78 + i * 1.05) > threshold;
            g = flick ? Math.max(g, 0.76 + t * 0.48 + beat * 0.15) : g * (0.07 + (1 - t) * 0.2);
        }
        washGains[i] = g;
    }
    for (let i = 0; i < strobeCount; i++) {
        let g = sg(i, strobeCount);
        if (roomStrobe && hz != null && t >= 0.16) {
            const flick = Math.sin(time * hz * 1.15 + i * 1.35) > threshold;
            g = flick ? Math.max(g, 0.88 + t * 0.55 + beat * 0.2) : g * (0.05 + (1 - t) * 0.18);
        }
        strobeGains[i] = g;
    }

    return {
        master: result.master,
        blackout: result.blackout,
        strobeForce: result.strobeForce,
        laserGain: result.laserGain,
        bloomBoost: result.bloomBoost,
        flashGate: result.flashGate !== false,
        flashMod: result.flashMod || 0,
        flashTier: result.flashTier ?? 0,
        headStrobe,
        headGains,
        washGains,
        strobeGains
    };
}

/**
 * @returns {{
 *   master: number,
 *   blackout: number,
 *   strobeForce: boolean,
 *   headGain: (i: number, count: number) => number,
 *   washGain: (i: number, count: number) => number,
 *   strobeGain: (i: number, count: number) => number,
 *   laserGain: number,
 *   bloomBoost: number
 * }}
 */
export function computeDynamicLightFx(fxId, audio = {}, time = 0, headCount = 12, washCount = 4) {
    const rawBeat = audio.beat || 0;
    const hit = !!audio.hit;
    const strongHit = !!audio.strongHit;
    const beatIndex = audio.beatIndex || 0;
    const phase = audio.beatPhase ?? 0;
    const bass = audio.bass || 0;
    const playing = !!audio.playing;
    const beatDensity = audio.beatDensity || 0;
    const flashTier = audio.flashTier ?? 0;
    const beat = playing
        ? Math.max(rawBeat, Math.pow(Math.max(0, 1 - phase), 2.2))
        : rawBeat;

    const base = {
        master: 1,
        blackout: 0,
        strobeForce: false,
        headGain: IDENTITY,
        washGain: IDENTITY,
        strobeGain: IDENTITY,
        laserGain: 1,
        bloomBoost: 0
    };

    if (!fxId || fxId === 'off' || !playing) {
        return materializeFx(base, headCount, washCount, audio.strobeCount || 8, time);
    }

    const evenBeat = beatIndex % 2 === 0;
    const quad = beatIndex % 4;
    const ctx = { beat, hit, strongHit, playing, beatDensity };

    let result = base;

    switch (fxId) {
        case 'beatFlash':
            result = {
                ...base,
                master: 0.55 + beat * 0.85 + (hit ? 0.35 : 0),
                bloomBoost: beat * 0.55 + (hit ? 0.25 : 0),
                strobeForce: hit,
                laserGain: 0.7 + beat * 0.6
            };
            break;

        case 'strongFlash':
            result = {
                ...base,
                master: strongHit ? 1.35 : 0.72 + beat * 0.28,
                bloomBoost: strongHit ? 0.75 : beat * 0.15,
                strobeForce: strongHit,
                laserGain: strongHit ? 1.4 : 0.65 + beat * 0.25
            };
            break;

        case 'alternate':
            result = {
                ...base,
                master: 0.82 + beat * 0.35,
                headGain: (i) => (i % 2 === (evenBeat ? 0 : 1) ? 1 : 0.48 + beat * 0.38),
                washGain: (i) => (i % 2 === (evenBeat ? 1 : 0) ? 1 : 0.42 + beat * 0.28),
                strobeGain: (i) => (i % 2 === (evenBeat ? 0 : 1) ? 1 : 0.35),
                laserGain: 0.75 + beat * 0.4
            };
            break;

        case 'evenOdd':
            result = {
                ...base,
                master: 0.78 + beat * 0.4,
                headGain: (i) => (i % 2 === 0 ? (evenBeat ? 1.05 : 0.5) : (evenBeat ? 0.5 : 1.05)),
                washGain: (i) => (i < washCount / 2 ? (evenBeat ? 1 : 0.45) : (evenBeat ? 0.45 : 1)),
                strobeGain: (i) => (i % 2 === (evenBeat ? 0 : 1) ? 1 : 0.4)
            };
            break;

        case 'fadePulse': {
            const pulse = 0.45 + 0.55 * Math.sin(phase * Math.PI);
            result = {
                ...base,
                master: 0.5 + pulse * 0.65 + bass * 0.25,
                bloomBoost: pulse * 0.35,
                laserGain: 0.6 + pulse * 0.5,
                headGain: () => 0.72 + pulse * 0.38,
                washGain: () => 0.65 + pulse * 0.45
            };
            break;
        }

        case 'strobeStorm': {
            const density = Math.max(beatDensity, hit ? 0.55 : 0.32);
            const hz = 28 + density * 24;
            result = {
                ...base,
                master: 0.65 + beat * 0.5,
                strobeForce: true,
                strobeGain: (i) => (Math.sin(time * hz + i * 1.7) > (0.15 - beat * 0.2) ? 1 : 0.06),
                headGain: (i) => (Math.sin(time * hz * 0.85 + i * 0.9) > 0 ? 0.85 + beat * 0.4 : 0.15),
                bloomBoost: beat * 0.45,
                laserGain: 0.8 + beat * 0.7
            };
            break;
        }

        case 'rapidFlash': {
            const density = Math.max(beatDensity, hit ? 0.55 : 0.32);
            const hz = 26 + density * 40 + (strongHit ? 12 : 0);
            const on = Math.sin(time * hz) > (0.06 - density * 0.12);
            result = {
                ...base,
                master: on ? 1.2 + beat * 0.45 + density * 0.25 : 0.18 + beat * 0.12,
                strobeForce: true,
                strobeGain: (i) => (Math.sin(time * hz * 1.08 + i * 1.35) > 0 ? 1 : 0.03),
                headGain: (i) => (Math.sin(time * hz * 0.85 + i * 0.65) > 0 ? 1.05 : 0.06),
                washGain: (i) => (Math.sin(time * hz * 0.72 + i * 0.9) > 0 ? 0.95 : 0.1),
                bloomBoost: on ? 0.55 + density * 0.4 : beat * 0.08,
                laserGain: on ? 1.25 + density * 0.5 : 0.3
            };
            break;
        }

        case 'blackout': {
            const dip = phase < 0.22 ? 1 - phase / 0.22 : 0;
            const rise = phase >= 0.22 ? Math.min(1, (phase - 0.22) / 0.35) : 0;
            const level = dip > 0 ? 1 - dip * 0.88 : 0.15 + rise * 0.85;
            result = {
                ...base,
                master: level + (hit ? 0.25 : 0),
                blackout: dip * 0.85,
                bloomBoost: rise * 0.4 + (hit ? 0.3 : 0),
                strobeForce: hit,
                laserGain: level
            };
            break;
        }

        case 'buildUp': {
            const cycle = (beatIndex % 16) / 16;
            const ramp = cycle * cycle;
            result = {
                ...base,
                master: 0.35 + ramp * 0.95 + beat * 0.35,
                bloomBoost: ramp * 0.5 + beat * 0.2,
                headGain: () => 0.4 + ramp * 0.75 + beat * 0.3,
                washGain: () => 0.35 + ramp * 0.8,
                laserGain: 0.5 + ramp * 0.9,
                strobeForce: cycle > 0.85 && hit
            };
            break;
        }

        case 'wave':
            result = {
                ...base,
                master: 0.75 + beat * 0.4,
                headGain: (i, count) => {
                    const pos = i / Math.max(1, count - 1);
                    const w = Math.sin(pos * Math.PI * 2 + time * 2.8 + beatIndex * 0.4);
                    return 0.2 + (w * 0.5 + 0.5) * 0.85 + beat * 0.25;
                },
                washGain: (i) => {
                    const w = Math.sin(i * 1.4 + time * 2.2 + beatIndex * 0.35);
                    return 0.25 + (w * 0.5 + 0.5) * 0.8;
                },
                bloomBoost: beat * 0.25
            };
            break;

        case 'disco': {
            const seed = beatIndex * 7919;
            result = {
                ...base,
                master: 0.7 + beat * 0.45 + (hit ? 0.2 : 0),
                headGain: (i) => (((seed + i * 9973) % 5) < 2 || hit ? 1 : 0.5 + beat * 0.38),
                washGain: (i) => (((seed + i * 6151) % 3) === 0 ? 1 : 0.2),
                strobeGain: (i) => (((seed + i * 3571) % 4) < 1 ? 1 : 0.05),
                strobeForce: hit && quad === 0,
                bloomBoost: hit ? 0.35 : beat * 0.2,
                laserGain: 0.7 + beat * 0.55
            };
            break;
        }

        case 'tunnel': {
            const chase = (beatIndex % headCount) / Math.max(1, headCount);
            result = {
                ...base,
                master: 0.8 + beat * 0.35,
                headGain: (i, count) => {
                    const dist = Math.abs(i / Math.max(1, count - 1) - chase);
                    return 0.15 + Math.max(0, 1 - dist * count * 0.55) * 0.95;
                },
                washGain: (i) => (i === quad % washCount ? 1 : 0.2 + beat * 0.2),
                bloomBoost: beat * 0.3
            };
            break;
        }

        case 'halfOff':
            result = {
                ...base,
                master: 0.85 + beat * 0.3,
                headGain: (i, count) => (i < count / 2 ? 1 : 0.1 + beat * 0.15),
                washGain: (i) => (i < washCount / 2 ? 0.12 : 1),
                laserGain: evenBeat ? 1.1 : 0.45
            };
            break;

        default:
            break;
    }

    return materializeFx(
        applyFlashTierOverlay(result, flashTier, { ...ctx, beat, phase, hit }, time, fxId),
        headCount,
        washCount,
        audio.strobeCount || 8,
        time
    );
}
