/**
 * Adaptive beat detection — strong beats from Spotify analysis or audio peaks.
 * Threshold: 0 = sensitive (many changes), 1 = default, 2 = only big drops.
 */

const MAX_BEATS_STORED = 480;

/** Trim large Spotify analysis payloads before sync / load. */
export function compactBeatMap(beatMap, maxBeats = MAX_BEATS_STORED) {
    if (!beatMap?.beats?.length) return beatMap;
    if (beatMap.__compact) return beatMap;
    let beats = beatMap.beats;
    if (beats.length > maxBeats) {
        const out = [];
        const step = beats.length / maxBeats;
        for (let i = 0; i < maxBeats; i++) {
            const b = beats[Math.floor(i * step)];
            out.push({
                start: b.start,
                confidence: b.confidence,
                loudness: b.loudness
            });
        }
        beats = out;
    } else {
        // Avoid full remap when already slim objects
        const sample = beats[0];
        const slim = sample
            && Object.prototype.hasOwnProperty.call(sample, 'start')
            && Object.keys(sample).length <= 4;
        if (!slim) {
            beats = beats.map((b) => ({
                start: b.start,
                confidence: b.confidence,
                loudness: b.loudness
            }));
        }
    }
    let sections = beatMap.sections;
    if (sections?.length > 64) {
        const step = sections.length / 64;
        sections = [];
        for (let i = 0; i < 64; i++) sections.push(beatMap.sections[Math.floor(i * step)]);
    }
    const out = { beats, bpm: beatMap.bpm, sections, __compact: true };
    return out;
}

/** @param {{start:number,confidence?:number,loudness?:number}[]} beats */
export function createSpotifyBeatTracker() {
    let beats = [];
    let progressMs = 0;
    let progressAt = 0;
    let lastIdx = -1;
    let fallbackBpm = 128;
    let clockRunning = true;
    let prevTickIdx = -1;
    let trackDurationMs = 0;
    /** @type {number} 0..2 */
    let strongThreshold = 0.4;

    function loudnessAt(sec, sections) {
        if (!sections?.length) return -20;
        for (const s of sections) {
            if (sec >= s.start && sec < s.start + (s.duration || 0)) return s.loudness ?? -20;
        }
        return -20;
    }

    function loudnessAtFast(sec, sections) {
        if (!sections?.length) return -20;
        let lo = 0;
        let hi = sections.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const s = sections[mid];
            const end = s.start + (s.duration || 0);
            if (sec < s.start) hi = mid - 1;
            else if (sec >= end) lo = mid + 1;
            else return s.loudness ?? -20;
        }
        return -20;
    }

    function seekToSec(sec) {
        if (!beats.length) {
            lastIdx = -1;
            return;
        }
        let lo = 0;
        let hi = beats.length - 1;
        let idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (beats[mid].start <= sec) {
                idx = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        lastIdx = idx;
    }

    /** Score a beat 0..1 from confidence + section loudness */
    function beatScore(bt, idx) {
        const conf = bt.confidence ?? 0.5;
        const loud = bt.loudness ?? -20;
        const loudN = Math.min(1, Math.max(0, (loud + 42) / 42));
        const downbeat = idx % 4 === 0 ? 0.14 : idx % 2 === 0 ? 0.06 : 0;
        return Math.min(1, conf * 0.55 + loudN * 0.45 + downbeat);
    }

    function isStrong(score) {
        // threshold 0 → need ~0.22, 0.55 → ~0.42, 1 → ~0.58, 2 → ~0.92
        const need = 0.22 + strongThreshold * 0.35;
        return score >= need;
    }

    return {
        load(map = {}) {
            const compact = map.__compact ? map : compactBeatMap(map);
            const raw = compact.beats || [];
            const needsSort = raw.length > 1 && raw[0].start > raw[raw.length - 1].start;
            beats = needsSort ? raw.slice().sort((a, b2) => a.start - b2.start) : raw;
            const sections = compact.sections;
            const needsLoudness = sections?.length && beats.some((bt) => bt.loudness == null);
            if (needsLoudness) {
                const sortedSections = sections.slice().sort((a, c) => a.start - c.start);
                beats = beats.map((bt) => ({
                    ...bt,
                    loudness: bt.loudness ?? loudnessAtFast(bt.start, sortedSections)
                }));
            }
            fallbackBpm = compact.bpm || map.bpm || 128;
            lastIdx = -1;
            prevTickIdx = -1;
        },
        setProgress(ms, running = true) {
            progressMs = Math.max(0, ms || 0);
            progressAt = performance.now();
            clockRunning = running !== false;
            seekToSec(progressMs / 1000);
            prevTickIdx = lastIdx;
        },
        setDurationMs(ms) {
            trackDurationMs = Math.max(0, Number(ms) || 0);
        },
        setClockRunning(on) {
            clockRunning = !!on;
        },
        getProgressMs() {
            if (!clockRunning || !progressAt) return progressMs;
            return progressMs + (performance.now() - progressAt);
        },
        setStrongThreshold(v) {
            strongThreshold = Math.max(0, Math.min(2, Number(v) || 0));
        },
        getStrongThreshold() {
            return strongThreshold;
        },
        reset() {
            lastIdx = -1;
            prevTickIdx = -1;
        },
        /** Returns beat frame fields for current playback position */
        tick() {
            if (!clockRunning) {
                return {
                    hit: false,
                    strongHit: false,
                    energy: 0,
                    beatIndex: Math.max(0, lastIdx),
                    beatPhase: 0,
                    bass: 0,
                    mid: 0,
                    treble: 0,
                    beat: 0,
                    analysed: false,
                    beforeFirstBeat: false,
                    afterLastBeat: false,
                    beatLive: false
                };
            }
            const now = performance.now();
            const sec = progressMs / 1000 + (now - progressAt) / 1000;
            const beatInterval = 60 / Math.max(60, Math.min(220, fallbackBpm));

            if (!beats.length) {
                const pastEnd = trackDurationMs > 0 && (sec * 1000) >= Math.max(0, trackDurationMs - 400);
                if (pastEnd || !clockRunning) {
                    return {
                        hit: false,
                        strongHit: false,
                        energy: 0,
                        beatIndex: Math.max(0, prevTickIdx),
                        beatPhase: 0,
                        bass: 0,
                        mid: 0,
                        treble: 0,
                        beat: 0,
                        analysed: false,
                        beforeFirstBeat: false,
                        afterLastBeat: true,
                        beatLive: false
                    };
                }
                const idx = Math.floor(sec / beatInterval);
                const phase = (sec % beatInterval) / beatInterval;
                const env = Math.pow(1 - phase, 2.2);
                const down = idx % 4 === 0;
                const half = idx % 2 === 0;
                const energy = down ? 0.85 : half ? 0.55 : 0.35;
                const hit = idx > prevTickIdx;
                prevTickIdx = idx;
                const strongHit = hit && down;
                return {
                    hit,
                    strongHit,
                    energy,
                    beatIndex: idx,
                    beatPhase: phase,
                    bass: env * (0.65 + energy * 0.45),
                    mid: env * (0.35 + energy * 0.3),
                    treble: env * (0.25 + energy * 0.2),
                    beat: env,
                    analysed: false,
                    beforeFirstBeat: false,
                    afterLastBeat: false,
                    beatLive: true
                };
            }

            seekToSec(sec);
            const firstStart = beats[0].start;
            const lastBeat = beats[beats.length - 1];
            const beforeFirstBeat = sec < firstStart;
            const afterLastBeat = sec > lastBeat.start + beatInterval * 1.45;
            const beatLive = !beforeFirstBeat && !afterLastBeat;

            if (!beatLive) {
                prevTickIdx = lastIdx;
                return {
                    hit: false,
                    strongHit: false,
                    energy: 0,
                    beatIndex: beforeFirstBeat ? -1 : Math.max(0, lastIdx),
                    beatPhase: beforeFirstBeat ? 1 : 0,
                    bass: 0,
                    mid: 0,
                    treble: 0,
                    beat: 0,
                    analysed: true,
                    beforeFirstBeat,
                    afterLastBeat,
                    beatLive: false
                };
            }

            const hit = lastIdx > prevTickIdx;
            prevTickIdx = lastIdx;

            let strongHit = false;
            let energy = 0;
            if (lastIdx >= 0) {
                const bt = beats[lastIdx];
                energy = beatScore(bt, lastIdx);
                if (hit && isStrong(energy)) strongHit = true;
            }

            const lastStart = lastIdx >= 0 ? beats[lastIdx].start : 0;
            const nextStart = lastIdx + 1 < beats.length
                ? beats[lastIdx + 1].start
                : lastStart + beatInterval;
            let span = Math.max(0.001, nextStart - lastStart);
            if (span > beatInterval * 1.65 || span < beatInterval * 0.5) {
                span = beatInterval;
            }
            const phase = Math.min(1, Math.max(0, (sec - lastStart) / span));
            const env = Math.pow(1 - phase, 2.2);
            const bass = env * (0.65 + energy * 0.45);
            const mid = env * (0.35 + energy * 0.3);
            const treble = env * (0.25 + energy * 0.2);

            return {
                hit,
                strongHit,
                energy,
                beatIndex: Math.max(0, lastIdx),
                beatPhase: phase,
                bass,
                mid,
                treble,
                beat: env,
                analysed: true,
                beforeFirstBeat: false,
                afterLastBeat: false,
                beatLive: true
            };
        }
    };
}

/** Rolling peak detector for analysed audio (file/mic/procedural) */
export function createPeakDetector() {
    let history = [];
    const maxHistory = 48;
    let strongThreshold = 0.4;

    return {
        setStrongThreshold(v) {
            strongThreshold = Math.max(0, Math.min(2, Number(v) || 0));
        },
        /** @returns {{ strongHit: boolean, energy: number }} */
        onset(rawBass, rawMid, sensitivity = 1) {
            const combined = rawBass * 0.7 + rawMid * 0.3;
            history.push(combined);
            if (history.length > maxHistory) history.shift();

            const sorted = [...history].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] || 0;
            const recent = history.slice(-6);
            const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);

            // Lower threshold = more sensitive. User strongThreshold raises the bar.
            const sens = Math.max(0.35, sensitivity);
            const baseMul = 1.15 + strongThreshold * 0.45;
            const strongMul = 1.28 + strongThreshold * 0.55;
            const threshold = median * (baseMul / sens) + 0.02;
            const strongBar = median * (strongMul / sens) + 0.03 + strongThreshold * 0.02;

            const energy = Math.min(1, combined / Math.max(0.08, avg + 0.05));
            const strongHit = combined > strongBar && combined > avg * (1.12 + strongThreshold * 0.12);

            return { strongHit, energy, above: combined > threshold };
        }
    };
}
