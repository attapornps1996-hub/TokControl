/**
 * Off-main-thread stage particle simulation (smoke, sparkle, fire, water, snow).
 */

const DECAY = { snow: 0.12, smoke: 0.1, sparkle: 0.45, default: 0.35 };
const MAX_Y = { smoke: 9.5, default: 18 };

function updatePool(kind, buf, dt) {
    const count = buf.count;
    const pos = new Float32Array(buf.pos);
    const vel = new Float32Array(buf.vel);
    const life = new Float32Array(buf.life);
    const aLife = new Float32Array(buf.aLife);
    const aRot = buf.aRot ? new Float32Array(buf.aRot) : null;
    const decay = DECAY[kind] ?? DECAY.default;
    const maxY = MAX_Y[kind] ?? MAX_Y.default;
    let anyAlive = false;

    for (let i = 0; i < count; i++) {
        if (life[i] <= 0) continue;
        anyAlive = true;
        const ix = i * 3;

        pos[ix] += vel[ix] * dt;
        pos[ix + 1] += vel[ix + 1] * dt;
        pos[ix + 2] += vel[ix + 2] * dt;

        if (kind === 'fire') vel[ix + 1] *= 1 - dt * 0.15;
        if (kind === 'smoke') {
            vel[ix + 1] *= 1 - dt * 0.08;
            vel[ix] *= 1 - dt * 0.04;
            if (aRot) aRot[i] += dt * (0.15 + vel[ix + 1] * 0.08);
        }
        if (kind === 'sparkle') vel[ix + 1] *= 1 - dt * 0.12;

        life[i] -= dt * decay;
        aLife[i] = life[i] > 0 ? life[i] : 0;

        if (pos[ix + 1] < -0.5 || pos[ix + 1] > maxY || life[i] <= 0) {
            life[i] = 0;
            aLife[i] = 0;
            pos[ix + 1] = -99;
        }
    }

    const out = { pos: pos.buffer, vel: vel.buffer, life: life.buffer, aLife: aLife.buffer };
    const xfer = [pos.buffer, vel.buffer, life.buffer, aLife.buffer];
    if (aRot) {
        out.aRot = aRot.buffer;
        xfer.push(aRot.buffer);
    }
    return { anyAlive, out, xfer };
}

self.onmessage = (e) => {
    const msg = e.data || {};
    try {
        if (msg.type === 'update') {
            const alive = {};
            const outBuffers = {};
            const transfer = [];

            for (const kind of msg.kinds || []) {
                const buf = msg.buffers?.[kind];
                if (!buf) continue;
                const res = updatePool(kind, buf, msg.dt || 0.016);
                alive[kind] = res.anyAlive;
                outBuffers[kind] = res.out;
                transfer.push(...res.xfer);
            }

            self.postMessage({ type: 'updated', seq: msg.seq || 0, alive, buffers: outBuffers }, transfer);
        }
    } catch (err) {
        self.postMessage({ type: 'error', error: String(err?.message || err), seq: msg.seq });
    }
};

self.postMessage({ type: 'ready' });
