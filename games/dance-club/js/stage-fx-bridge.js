/**
 * Bridge for off-thread stage particle updates.
 */

export function createStageFxWorkerBridge(opts = {}) {
    const useWorker = opts.useWorker !== false;
    let worker = null;
    let ready = false;
    let inFlight = false;
    let seq = 0;
    let useFallback = !useWorker;
    const lastAlive = new Map();
    /** @type {Map<string, object>} */
    let poolsRef = null;

    if (useWorker) {
        try {
            worker = new Worker(new URL('./workers/stage-fx-worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                const msg = e.data || {};
                if (msg.type === 'ready') {
                    ready = true;
                    return;
                }
                if (msg.type === 'updated') {
                    inFlight = false;
                    applyBuffers(msg.buffers);
                    if (msg.alive) {
                        for (const [kind, on] of Object.entries(msg.alive)) {
                            lastAlive.set(kind, !!on);
                        }
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

    function bindPools(pools) {
        poolsRef = pools;
    }

    function applyBuffers(buffers = {}) {
        if (!poolsRef) return;
        for (const [kind, buf] of Object.entries(buffers)) {
            const pool = poolsRef[kind];
            if (!pool || !buf) continue;
            pool.pos = new Float32Array(buf.pos);
            pool.vel = new Float32Array(buf.vel);
            pool.life = new Float32Array(buf.life);
            pool.aLife = new Float32Array(buf.aLife);
            const geo = pool.points.geometry;
            geo.attributes.position.array = pool.pos;
            geo.attributes.aLife.array = pool.aLife;
            if (buf.aRot && pool.aRot) {
                pool.aRot = new Float32Array(buf.aRot);
                geo.attributes.aRot.array = pool.aRot;
            }
            geo.attributes.position.needsUpdate = true;
            geo.attributes.aLife.needsUpdate = true;
            if (pool.aRot) geo.attributes.aRot.needsUpdate = true;
        }
    }

    function isActive() {
        return !!worker && ready && !useFallback;
    }

    /** @returns {boolean} */
    function scheduleUpdate(activeKinds, dt) {
        if (!isActive() || inFlight || !activeKinds?.size || !poolsRef) return false;

        const kinds = [];
        const buffers = {};

        for (const kind of activeKinds) {
            const pool = poolsRef[kind];
            if (!pool) continue;
            kinds.push(kind);
            buffers[kind] = {
                count: pool.count,
                pos: pool.pos.buffer,
                vel: pool.vel.buffer,
                life: pool.life.buffer,
                aLife: pool.aLife.buffer,
                size: pool.size.buffer,
                aRot: pool.aRot ? pool.aRot.buffer : null
            };
        }

        if (!kinds.length) return false;

        inFlight = true;
        worker.postMessage({ type: 'update', seq: ++seq, dt, kinds, buffers });
        return true;
    }

    function wasAlive(kind) {
        return lastAlive.get(kind);
    }

    function dispose() {
        worker?.terminate();
        worker = null;
    }

    return { bindPools, isActive, scheduleUpdate, wasAlive, dispose };
}
