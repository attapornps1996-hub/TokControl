/**
 * Bridge for off-thread LED wall + floor tile updates.
 */

export function createLedWorkerBridge(opts = {}) {
    const useWorker = opts.useWorker !== false;
    let worker = null;
    let ready = false;
    let inFlight = false;
    let seq = 0;
    let useFallback = !useWorker;
    let colorsReady = false;
    let colorFrameReady = false;

    let wallLevels = null;
    let tileLevels = null;
    let wallColors = null;
    let tileColors = null;

    if (useWorker) {
        try {
            worker = new Worker(new URL('./workers/led-worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                const msg = e.data || {};
                if (msg.type === 'ready') ready = true;
                if (msg.type === 'ticked') {
                    inFlight = false;
                    if (msg.wallLevels) wallLevels = new Float32Array(msg.wallLevels);
                    if (msg.tileLevels) tileLevels = new Float32Array(msg.tileLevels);
                    if (msg.pushColors && msg.wallColors) {
                        wallColors = new Float32Array(msg.wallColors);
                        tileColors = new Float32Array(msg.tileColors);
                        colorsReady = true;
                        colorFrameReady = true;
                    }
                }
                if (msg.type === 'error') {
                    inFlight = false;
                    useFallback = true;
                }
            };
            worker.onerror = () => {
                useFallback = true;
                inFlight = false;
            };
        } catch {
            useFallback = true;
        }
    }

    function isActive() {
        return !!worker && ready && !useFallback;
    }

    function init({ wallMeta, tileMeta, palette, wallCount, tileCount }) {
        wallLevels = new Float32Array(wallCount);
        tileLevels = new Float32Array(tileCount);
        wallColors = new Float32Array(wallCount * 3);
        tileColors = new Float32Array(tileCount * 3);
        colorsReady = false;

        if (!worker) return false;
        worker.postMessage({
            type: 'init',
            seq: ++seq,
            wallMeta,
            tileMeta,
            palette
        });
        return true;
    }

    function setPalette(palette) {
        if (!worker) return;
        worker.postMessage({ type: 'init', seq: ++seq, wallMeta: null, tileMeta: null, palette, paletteOnly: true });
    }

    /** @returns {boolean} */
    function scheduleTick(params) {
        if (!isActive() || inFlight || !wallLevels) return false;
        inFlight = true;
        worker.postMessage({
            type: 'tick',
            seq: ++seq,
            ...params,
            wallLevels: wallLevels.slice(),
            tileLevels: tileLevels.slice()
        });
        return true;
    }

    function takeColorFrame() {
        if (!colorFrameReady || !wallColors) return false;
        colorFrameReady = false;
        return true;
    }

    function getBuffers() {
        return { wallLevels, tileLevels, wallColors, tileColors, colorsReady };
    }

    function dispose() {
        worker?.terminate();
        worker = null;
    }

    return { isActive, init, setPalette, scheduleTick, takeColorFrame, getBuffers, dispose };
}
