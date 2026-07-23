// Remove near-black background from generated jar image, producing a transparent PNG.
const sharp = require('sharp');
const path = require('path');

const SRC = 'C:\\Users\\USER\\.cursor\\projects\\c-Users-USER-Desktop-Pandy-App\\assets\\jar_victorian_base.png';
const OUT = path.join(__dirname, '..', 'assets', 'jar_victorian.png');

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

async function run() {
    const img = sharp(SRC).ensureAlpha();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    const LOW = 14;
    const HIGH = 46;
    const bowlCx = width * 0.5;
    const bowlCy = height * 0.58;
    const bowlR = width * 0.22;

    for (let i = 0; i < data.length; i += channels) {
        const px = (i / channels) % width;
        const py = Math.floor((i / channels) / width);
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = max;
        const sat = max > 0 ? (max - min) / max : 0;

        let alphaMul;
        if (lum <= LOW) alphaMul = 0;
        else if (lum >= HIGH) alphaMul = 1;
        else alphaMul = (lum - LOW) / (HIGH - LOW);

        // Remove the flat gray glass-reflection disc inside the bowl
        const dist = Math.hypot(px - bowlCx, py - bowlCy) / bowlR;
        if (alphaMul > 0 && dist < 1.05) {
            const centerWeight = 1 - clamp01(dist);
            const isGray = sat < 0.20;
            const isBright = lum > 55;
            if (isGray && isBright) {
                const fade = clamp01((lum - 55) / 130) * centerWeight;
                alphaMul *= 1 - fade * 0.95;
            }
        }

        const origA = channels > 3 ? data[i + 3] : 255;
        data[i + 3] = Math.round(origA * alphaMul);
    }

    await sharp(data, { raw: { width, height, channels } })
        .png()
        .toFile(OUT);

    console.log('Wrote', OUT, width, height, channels);
}

run().catch(err => { console.error(err); process.exit(1); });
