/**
 * Beat bridge — worker compacts large maps; tick always runs synchronously on main thread.
 */
import { createSpotifyBeatTracker, compactBeatMap } from './beat-intelligence.js';

export function createBeatWorkerBridge(opts = {}) {
    const useWorker = opts.useWorker !== false;
    let worker = null;
    let workerReady = false;
    let lastFrame = null;
    let loadSeq = 0;
    const fallback = createSpotifyBeatTracker();
    let useFallback = !useWorker;

    function applyMap(map, progressMs = 0) {
        fallback.load(map);
        fallback.setProgress(progressMs);
        lastFrame = fallback.tick();
    }

    if (useWorker) {
        try {
            worker = new Worker(new URL('./workers/beat-worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                const msg = e.data || {};
                if (msg.type === 'ready') workerReady = true;
                if (msg.type === 'loaded' && msg.compact) {
                    applyMap(msg.compact, msg.progressMs || 0);
                }
                if (msg.type === 'error') {
                    console.warn('[beat-bridge]', msg.error);
                    useFallback = true;
                }
            };
            worker.onerror = () => {
                useFallback = true;
            };
        } catch (err) {
            console.warn('[beat-bridge] worker unavailable', err);
            useFallback = true;
        }
    }

    return {
        isWorkerActive() {
            return !!worker && workerReady && !useFallback;
        },

        setStrongThreshold(v) {
            fallback.setStrongThreshold(v);
        },

        load(beatMap, progressMs = 0, bpm, strongThreshold) {
            loadSeq += 1;
            const seq = loadSeq;
            if (strongThreshold != null) fallback.setStrongThreshold(strongThreshold);

            const emptyMap = { beats: [], bpm: bpm || 128, __compact: true };

            if (!beatMap?.beats?.length) {
                applyMap(emptyMap, progressMs);
                return Promise.resolve({ seq, local: true });
            }

            if (useFallback || !worker) {
                applyMap(compactBeatMap(beatMap), progressMs);
                return Promise.resolve({ seq, local: true });
            }

            // BPM clock immediately; worker delivers compact map shortly after
            applyMap(emptyMap, progressMs);

            worker.postMessage({
                type: 'load',
                seq,
                beatMap,
                progressMs,
                bpm
            });

            return new Promise((resolve) => {
                const onMsg = (e) => {
                    if (e.data?.type === 'loaded' && e.data.seq === seq) {
                        worker.removeEventListener('message', onMsg);
                        resolve({ seq, local: false });
                    }
                    if (e.data?.type === 'error' && e.data.seq === seq) {
                        worker.removeEventListener('message', onMsg);
                        applyMap(compactBeatMap(beatMap), progressMs);
                        resolve({ seq, local: true, error: true });
                    }
                };
                worker.addEventListener('message', onMsg);
                setTimeout(() => {
                    worker.removeEventListener('message', onMsg);
                    if (!fallback || seq !== loadSeq) return;
                    applyMap(compactBeatMap(beatMap), progressMs);
                    resolve({ seq, local: true, timeout: true });
                }, 8000);
            });
        },

        setProgress(progressMs, playing = true) {
            fallback.setProgress(progressMs, playing);
        },

        setDurationMs(ms) {
            fallback.setDurationMs?.(ms);
        },

        /** Synchronous tick — required for lights/effects to stay on beat */
        requestTick() {
            lastFrame = fallback.tick();
            return lastFrame;
        },

        getFrame() {
            return lastFrame || fallback.tick();
        },

        getProgressMs() {
            return fallback.getProgressMs();
        },

        dispose() {
            worker?.terminate();
            worker = null;
        }
    };
}
