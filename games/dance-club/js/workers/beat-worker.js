/**
 * Off-main-thread Spotify beat map compaction (tick stays on main thread).
 */
import { compactBeatMap } from '../beat-intelligence.js';

self.onmessage = (e) => {
    const msg = e.data || {};
    try {
        if (msg.type === 'load') {
            const compact = msg.beatMap?.beats?.length
                ? compactBeatMap(msg.beatMap)
                : { beats: [], bpm: msg.bpm || 128, __compact: true };
            self.postMessage({
                type: 'loaded',
                seq: msg.seq || 0,
                compact,
                progressMs: msg.progressMs || 0
            });
        }
    } catch (err) {
        self.postMessage({ type: 'error', error: String(err?.message || err), seq: msg.seq });
    }
};

self.postMessage({ type: 'ready' });
