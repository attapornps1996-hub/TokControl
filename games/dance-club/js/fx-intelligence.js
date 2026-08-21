/**
 * Analyze beat context and pick stage FX that fit the current musical section.
 * Flash intensity (light → rapid) is handled separately via computeFlashTier().
 */

/** @type {Record<string, string[]>} */
const FX_POOLS = {
    calm: ['fadePulse', 'wave', 'buildUp', 'halfOff'],
    groove: ['alternate', 'evenOdd', 'tunnel', 'disco', 'fadePulse', 'wave'],
    intense: ['beatFlash', 'alternate', 'tunnel', 'disco', 'evenOdd'],
    drop: ['strongFlash', 'blackout', 'beatFlash', 'strobeStorm'],
    rapid: ['rapidFlash', 'strobeStorm', 'beatFlash', 'alternate']
};

export const MOOD_HOLD = { calm: 20, groove: 16, intense: 12, drop: 8, rapid: 6 };

/**
 * @param {object} audio
 * @returns {{ mood: string, density: number, energy: number, isRapid: boolean, isDrop: boolean, isCalm: boolean, bpm: number }}
 */
export function analyzeBeatContext(audio = {}) {
    const beatDensity = audio.beatDensity || 0;
    const energy = audio.energy ?? Math.max(audio.bass || 0, audio.beat || 0);
    const bpm = audio.bpm || 128;
    const bpmBoost = Math.max(0, Math.min(0.35, (bpm - 108) / 120));
    const density = beatDensity * 0.85 + bpmBoost;

    let mood = 'groove';
    if (density >= 0.58 && beatDensity > 0.42) mood = 'rapid';
    else if (audio.strongHit && energy > 0.68) mood = 'drop';
    else if (density >= 0.28 || (audio.hit && (audio.bass || 0) > 0.55)) mood = 'intense';
    else if (density < 0.12 && energy < 0.32 && (audio.beat || 0) < 0.4) mood = 'calm';

    return {
        mood,
        density,
        energy,
        bpm,
        isRapid: mood === 'rapid',
        isDrop: mood === 'drop',
        isCalm: mood === 'calm'
    };
}

export function getFxPoolForMood(mood) {
    return FX_POOLS[mood] || FX_POOLS.groove;
}

/**
 * Pick FX for section — holds same FX for many bars (stable), changes on mood shift.
 */
export function pickFxForContext(ctx, currentFx, { barsHeld = 0 } = {}) {
    const pool = getFxPoolForMood(ctx.mood);
    const minHold = MOOD_HOLD[ctx.mood] ?? 12;

    if (barsHeld < minHold && currentFx && currentFx !== 'off' && pool.includes(currentFx)) {
        return currentFx;
    }

    let next = currentFx;
    for (let n = 0; n < 14 && (next === currentFx || !pool.includes(next)); n++) {
        next = pool[Math.floor(Math.random() * pool.length)];
    }
    return pool.includes(next) ? next : pool[0];
}

/**
 * Flash intensity 0..1 — drives graduated strobe from gentle pulse to rapid flash.
 * Smoothed externally in scene rig.flashTier.
 */
export function computeFlashTier(audio = {}, beatDensity = 0) {
    const ctx = analyzeBeatContext({ ...audio, beatDensity });
    const energy = audio.energy ?? Math.max(audio.bass || 0, audio.beat || 0);
    const phase = audio.beatPhase ?? 1;
    const beatEnv = Math.pow(Math.max(0, 1 - phase), 2.2);

    let tier = ctx.density * 0.42 + energy * 0.28 + beatEnv * 0.22;
    if (ctx.isCalm) tier *= 0.3;
    else if (ctx.mood === 'groove') tier = 0.15 + tier * 0.55;
    else if (ctx.mood === 'intense') tier = 0.28 + tier * 0.55;
    else if (ctx.isDrop) tier = Math.max(tier, 0.5 + energy * 0.35);
    else if (ctx.isRapid) tier = Math.max(tier, 0.55 + ctx.density * 0.42);

    if (audio.strongHit) tier = Math.min(1, tier + 0.12);
    if (audio.hit) tier = Math.min(1, tier + 0.06);

    return Math.max(0, Math.min(1, tier));
}

export function describeFxContext(ctx) {
    const labels = {
        calm: 'ช่วงเงียบ — เฟด/คลื่น',
        groove: 'จังหวะปกติ — สลับ/ดิสโก้',
        intense: 'พลังงานสูง — แฟลช/ไล่',
        drop: 'ดรอป — แฟลชแรง/ดับ-ติด',
        rapid: 'บีทรัว — กระพริบรัวทั้งห้อง'
    };
    return labels[ctx.mood] || labels.groove;
}
