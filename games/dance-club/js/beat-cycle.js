/**
 * Beat-only cycle helper — all auto changes fire on audio.hit, never on bars.
 */
export function createBeatCycle(every = 8) {
    return { every: Math.max(1, every), count: 0 };
}

export function tickBeatCycle(cycle, audio, onFire) {
    if (!cycle || !audio?.hit || !audio?.playing) return false;
    cycle.count += 1;
    if (cycle.count >= cycle.every) {
        cycle.count = 0;
        if (typeof onFire === 'function') onFire();
        return true;
    }
    return false;
}

export function setBeatCycleEvery(cycle, every) {
    if (!cycle) return;
    cycle.every = Math.max(1, Number(every) || 8);
    cycle.count = 0;
}
