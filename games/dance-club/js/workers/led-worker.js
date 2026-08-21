/**
 * Off-main-thread LED wall + floor tile color/level updates.
 */

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16) / 255,
        parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255
    ];
}

let wallMeta = [];
let tileMeta = [];
let paletteRgb = [];

self.onmessage = (e) => {
    const msg = e.data || {};
    try {
        if (msg.type === 'init') {
            if (msg.wallMeta) wallMeta = msg.wallMeta;
            if (msg.tileMeta) tileMeta = msg.tileMeta;
            if (msg.palette?.length) paletteRgb = msg.palette.map(hexToRgb);
            self.postMessage({ type: 'inited', seq: msg.seq || 0 });
            return;
        }

        if (msg.type === 'tick') {
            const {
                bass = 0, mid = 0, treble = 0, beat = 0, beatIndex = 0,
                master = 1, react = 1, colorShift = 0, time = 0,
                flashMod = 0, rapidLerp = 0.28, wallRows = 8,
                tileCols = 20, tileRows = 8, pushColors = true
            } = msg;

            const wallLevels = new Float32Array(msg.wallLevels);
            const tileLevels = new Float32Array(msg.tileLevels);
            const wallColors = new Float32Array(wallMeta.length * 3);
            const tileColors = new Float32Array(tileMeta.length * 3);
            const palLen = paletteRgb.length || 1;

            for (let i = 0; i < wallMeta.length; i++) {
                const st = wallMeta[i];
                const colWave = Math.sin(st.col * 0.55 + time * 2.2 + colorShift);
                const target = Math.max(
                    0,
                    bass * 1.1 * (1 - st.row / wallRows) +
                    mid * 0.8 * Math.abs(colWave) +
                    treble * 0.6 * ((st.col + st.row + beatIndex) % 3 === 0 ? 1 : 0.2) -
                    st.row * 0.06 +
                    flashMod * 0.85
                );
                wallLevels[i] += (target - wallLevels[i]) * rapidLerp;
                if (pushColors) {
                    const rgb = paletteRgb[(st.col + colorShift) % palLen];
                    const v = Math.min(0.95, wallLevels[i] * master * (0.45 + react * 0.4));
                    wallColors[i * 3] = rgb[0] * v;
                    wallColors[i * 3 + 1] = rgb[1] * v;
                    wallColors[i * 3 + 2] = rgb[2] * v;
                }
            }

            const cx = (tileCols - 1) / 2;
            const cz = (tileRows - 1) / 2;
            const chaseDiv = flashMod > 0.05 ? 2 : 4;
            const tileLerp = flashMod > 0.05 ? 0.55 : 0.3;

            for (let i = 0; i < tileMeta.length; i++) {
                const st = tileMeta[i];
                const dx = st.gx - cx;
                const dz = st.gz - cz;
                const dist = Math.sqrt(dx * dx + dz * dz);
                const ripple = Math.sin(dist * 0.9 - time * 4.5) * 0.5 + 0.5;
                const chase = ((st.gx + st.gz + beatIndex) % chaseDiv === 0) ? 1 : 0.25;
                let target = (0.04 + bass * 0.55 * ripple + beat * 0.42 * chase * react) * master;
                if (flashMod > 0.05) target += flashMod * 0.65 * master;
                tileLevels[i] += (target - tileLevels[i]) * tileLerp;
                if (pushColors) {
                    const rgb = paletteRgb[(st.gx + colorShift) % palLen];
                    tileColors[i * 3] = rgb[0] * tileLevels[i];
                    tileColors[i * 3 + 1] = rgb[1] * tileLevels[i];
                    tileColors[i * 3 + 2] = rgb[2] * tileLevels[i];
                }
            }

            const out = {
                type: 'ticked',
                seq: msg.seq || 0,
                pushColors,
                wallLevels: wallLevels.buffer,
                tileLevels: tileLevels.buffer
            };
            const xfer = [wallLevels.buffer, tileLevels.buffer];
            if (pushColors) {
                out.wallColors = wallColors.buffer;
                out.tileColors = tileColors.buffer;
                xfer.push(wallColors.buffer, tileColors.buffer);
            }
            self.postMessage(out, xfer);
        }
    } catch (err) {
        self.postMessage({ type: 'error', error: String(err?.message || err), seq: msg.seq });
    }
};

self.postMessage({ type: 'ready' });
