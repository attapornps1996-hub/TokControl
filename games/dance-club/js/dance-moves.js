/**
 * Dance move library — goofy, twitchy, rubber-limb choreography.
 * Each move writes into a shared `pose` object so characters stay cheap.
 *
 * pose fields:
 *   armLZ / armRZ   shoulder swing (z)
 *   armLX / armRX   shoulder forward/back (x)
 *   elbowLZ/elbowRZ elbow bend
 *   legLZ / legRZ   hip swing
 *   kneeLZ/kneeRZ   knee bend
 *   headTilt        head roll
 *   headSpin        head yaw
 *   bodyY           vertical offset (hops / floats)
 *   bodyLean        whole-body roll
 *   squash          vertical squash-stretch (1 = neutral)
 */

/** Hard step function — makes motion snap instead of glide (robot feel) */
function stepped(v, steps) {
    return Math.round(v * steps) / steps;
}

/** Deterministic pseudo-noise so each dancer twitches differently */
function noise(x) {
    const s = Math.sin(x * 12.9898) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

export const DANCE_MOVES = {
    /* ---------------- Idle when music stops ---------------- */
    idle: {
        label: 'ยืนนิ่ง',
        apply(p) {
            p.armLZ = 0.35;
            p.armRZ = -0.35;
            p.armLX = 0.05;
            p.armRX = -0.05;
            p.elbowLZ = -0.15;
            p.elbowRZ = 0.15;
            p.legLZ = 0.04;
            p.legRZ = -0.04;
            p.kneeLZ = 0.05;
            p.kneeRZ = 0.05;
            p.headTilt = 0;
            p.headSpin = 0;
            p.bodyY = 0;
            p.bodyLean = 0;
            p.squash = 1;
        }
    },

    /* ---------------- Bouncy default ---------------- */
    bounce: {
        label: 'บาวน์ซ์',
        apply(p, c) {
            const s = Math.sin(c.t * 3.1);
            p.bodyY = Math.abs(s) * 0.13 * c.energy;
            p.squash = 1 - Math.abs(s) * 0.07 * c.energy;
            p.armLZ = 0.75 + s * 0.55 * c.energy;
            p.armRZ = -0.75 - s * 0.55 * c.energy;
            p.elbowLZ = -0.4 - c.mid * 0.6;
            p.elbowRZ = 0.4 + c.mid * 0.6;
            p.legLZ = s * 0.18;
            p.legRZ = -s * 0.18;
            p.kneeLZ = Math.max(0, s) * 0.5;
            p.kneeRZ = Math.max(0, -s) * 0.5;
            p.headTilt = s * 0.12;
        }
    },

    /* ---------------- Glitchy robot ---------------- */
    glitch: {
        label: 'กระตุก (Glitch)',
        apply(p, c) {
            const q = stepped(c.t * 0.6, 6);
            const n1 = noise(q + c.seed);
            const n2 = noise(q * 1.7 + c.seed + 5);
            const n3 = noise(q * 2.3 + c.seed + 11);
            p.armLZ = 0.4 + n1 * 1.5;
            p.armRZ = -0.4 + n2 * 1.5;
            p.elbowLZ = n3 * 1.2;
            p.elbowRZ = -n1 * 1.2;
            p.headTilt = n2 * 0.4;
            p.headSpin = stepped(n3 * 0.9, 4);
            p.bodyLean = n1 * 0.18;
            p.bodyY = Math.abs(n2) * 0.1;
            p.legLZ = n3 * 0.28;
            p.legRZ = -n2 * 0.28;
            p.kneeLZ = Math.abs(n1) * 0.6;
            p.kneeRZ = Math.abs(n2) * 0.6;
            p.squash = 1 + n3 * 0.06;
        }
    },

    /* ---------------- Jackhammer vibration ---------------- */
    jackhammer: {
        label: 'ดิ้นสั่น',
        apply(p, c) {
            const fast = Math.sin(c.t * 22);
            const slow = Math.sin(c.t * 2.2);
            p.bodyY = 0.05 + Math.abs(fast) * 0.05;
            p.squash = 1 + fast * 0.09;
            p.armLZ = 1.35 + fast * 0.3;
            p.armRZ = -1.35 - fast * 0.3;
            p.elbowLZ = -0.9 + fast * 0.35;
            p.elbowRZ = 0.9 - fast * 0.35;
            p.headTilt = fast * 0.16;
            p.bodyLean = slow * 0.14;
            p.legLZ = 0.14 + fast * 0.1;
            p.legRZ = -0.14 - fast * 0.1;
            p.kneeLZ = 0.45 + fast * 0.2;
            p.kneeRZ = 0.45 - fast * 0.2;
        }
    },

    /* ---------------- Floppy noodle arms ---------------- */
    noodle: {
        label: 'แขนยางยืด',
        apply(p, c) {
            const a = Math.sin(c.t * 4.2);
            const b = Math.cos(c.t * 3.1);
            p.armLZ = 1.6 + a * 1.1;
            p.armRZ = -1.6 + b * 1.1;
            p.armLX = b * 0.7;
            p.armRX = -a * 0.7;
            p.elbowLZ = Math.sin(c.t * 6.4) * 1.5;
            p.elbowRZ = Math.cos(c.t * 5.8) * 1.5;
            p.headTilt = a * 0.22;
            p.bodyLean = b * 0.16;
            p.bodyY = Math.abs(a) * 0.08 * c.energy;
            p.legLZ = b * 0.22;
            p.legRZ = a * 0.22;
            p.kneeLZ = 0.25 + Math.abs(a) * 0.3;
            p.kneeRZ = 0.25 + Math.abs(b) * 0.3;
        }
    },

    /* ---------------- Head spin flex ---------------- */
    headspin: {
        label: 'หัวหมุน',
        apply(p, c) {
            p.headSpin = c.t * 2.4;
            p.headTilt = Math.sin(c.t * 3) * 0.25;
            p.armLZ = 2.1 + Math.sin(c.t * 5) * 0.35;
            p.armRZ = -2.1 - Math.cos(c.t * 5) * 0.35;
            p.elbowLZ = -1.1;
            p.elbowRZ = 1.1;
            p.bodyY = 0.06 + Math.abs(Math.sin(c.t * 3)) * 0.1 * c.energy;
            p.squash = 1 - Math.sin(c.t * 3) * 0.05;
            p.legLZ = 0.3;
            p.legRZ = -0.3;
            p.kneeLZ = 0.35;
            p.kneeRZ = 0.35;
        }
    },

    /* ---------------- Side-to-side shuffle slide ---------------- */
    shuffle: {
        label: 'ชัฟเฟิล',
        apply(p, c) {
            const s = Math.sin(c.t * 3.6);
            const sq = Math.sign(s) * Math.pow(Math.abs(s), 0.4);
            p.bodyLean = sq * 0.26;
            p.bodyY = Math.abs(Math.sin(c.t * 7.2)) * 0.08;
            p.armLZ = 0.5 + sq * 1.4;
            p.armRZ = -0.5 + sq * 1.4;
            p.elbowLZ = -0.7 + sq * 0.5;
            p.elbowRZ = 0.7 + sq * 0.5;
            p.legLZ = sq * 0.5;
            p.legRZ = sq * 0.5;
            p.kneeLZ = 0.2 + Math.max(0, sq) * 0.6;
            p.kneeRZ = 0.2 + Math.max(0, -sq) * 0.6;
            p.headTilt = -sq * 0.2;
        }
    },

    /* ---------------- Kick / high-step ---------------- */
    kicker: {
        label: 'เตะขา',
        apply(p, c) {
            const beatish = Math.sin(c.t * 3);
            const lead = beatish > 0;
            const k = Math.abs(beatish);
            p.legLZ = lead ? -k * 1.15 : 0.1;
            p.legRZ = lead ? -0.1 : k * 1.15;
            p.kneeLZ = lead ? k * 0.5 : 0.3;
            p.kneeRZ = lead ? 0.3 : k * 0.5;
            p.armLZ = 1.0 + (lead ? k * 0.9 : -k * 0.4);
            p.armRZ = -1.0 - (lead ? -k * 0.4 : k * 0.9);
            p.elbowLZ = -0.5;
            p.elbowRZ = 0.5;
            p.bodyLean = beatish * 0.14;
            p.bodyY = k * 0.09;
            p.headTilt = -beatish * 0.14;
        }
    },

    /* ---------------- Sprinkler / lawnmower goof ---------------- */
    sprinkler: {
        label: 'สปริงเกลอร์',
        apply(p, c) {
            const sweep = Math.sin(c.t * 1.6);
            const tick = stepped(sweep, 8);
            p.armRZ = -2.4;
            p.elbowRZ = 1.5;
            p.armLZ = 1.2 + tick * 0.9;
            p.elbowLZ = -1.4;
            p.headSpin = tick * 0.85;
            p.headTilt = 0.18;
            p.bodyLean = tick * 0.2;
            p.bodyY = Math.abs(Math.sin(c.t * 5)) * 0.07 * c.energy;
            p.legLZ = 0.2;
            p.legRZ = -0.28;
            p.kneeLZ = 0.5;
            p.kneeRZ = 0.3;
        }
    },

    /* ---------------- Rag-doll flail ---------------- */
    flail: {
        label: 'สะบัดมั่ว',
        apply(p, c) {
            const n1 = noise(Math.floor(c.t * 9) + c.seed);
            const n2 = noise(Math.floor(c.t * 9) * 1.3 + c.seed + 3);
            const wob = Math.sin(c.t * 11);
            p.armLZ = 1.0 + n1 * 2.2;
            p.armRZ = -1.0 + n2 * 2.2;
            p.armLX = n2 * 1.0;
            p.armRX = n1 * 1.0;
            p.elbowLZ = n2 * 1.8;
            p.elbowRZ = n1 * 1.8;
            p.headTilt = wob * 0.3;
            p.bodyLean = n1 * 0.22;
            p.bodyY = Math.abs(wob) * 0.12 * c.energy;
            p.squash = 1 + wob * 0.08;
            p.legLZ = n2 * 0.35;
            p.legRZ = n1 * 0.35;
            p.kneeLZ = Math.abs(n1) * 0.7;
            p.kneeRZ = Math.abs(n2) * 0.7;
        }
    },

    /* ---------------- Slow-motion lean (contrast move) ---------------- */
    sway: {
        label: 'โยกช้า',
        apply(p, c) {
            const s = Math.sin(c.t * 1.1);
            p.bodyLean = s * 0.2;
            p.bodyY = Math.abs(Math.sin(c.t * 2.2)) * 0.05;
            p.armLZ = 1.9 + s * 0.4;
            p.armRZ = -1.9 + s * 0.4;
            p.elbowLZ = -0.5 + s * 0.3;
            p.elbowRZ = 0.5 + s * 0.3;
            p.headTilt = s * 0.25;
            p.legLZ = s * 0.1;
            p.legRZ = s * 0.1;
            p.kneeLZ = 0.15;
            p.kneeRZ = 0.15;
        }
    },

    /* ---------------- Gift hype (locked while focused) ---------------- */
    hype: {
        label: 'ไฮป์ (ได้ของขวัญ)',
        apply(p, c) {
            const fast = Math.sin(c.t * 14);
            const spin = c.t * 3.2;
            p.armLZ = 2.6 + fast * 0.4;
            p.armRZ = -2.6 - fast * 0.4;
            p.armLX = Math.sin(c.t * 9) * 0.5;
            p.armRX = -Math.sin(c.t * 9) * 0.5;
            p.elbowLZ = -1.3 + fast * 0.4;
            p.elbowRZ = 1.3 - fast * 0.4;
            p.headSpin = spin;
            p.headTilt = fast * 0.2;
            p.bodyY = 0.1 + Math.abs(Math.sin(c.t * 7)) * 0.16;
            p.squash = 1 + fast * 0.1;
            p.legLZ = 0.45 + fast * 0.15;
            p.legRZ = -0.45 - fast * 0.15;
            p.kneeLZ = 0.7;
            p.kneeRZ = 0.7;
        }
    },

    /* ---------------- Spin spotlight ---------------- */
    spin: {
        label: 'หมุนตัว',
        apply(p, c) {
            const s = Math.sin(c.t * 8);
            p.headSpin = c.t * 4.5;
            p.bodyLean = s * 0.15;
            p.armLZ = 1.8 + s * 0.6;
            p.armRZ = -1.8 - s * 0.6;
            p.elbowLZ = -0.9;
            p.elbowRZ = 0.9;
            p.bodyY = 0.08 + Math.abs(s) * 0.1;
            p.legLZ = 0.25;
            p.legRZ = -0.25;
            p.kneeLZ = 0.35;
            p.kneeRZ = 0.35;
        }
    },

    /* ---------------- Catwalk strut ---------------- */
    walk: {
        label: 'เดินรันเวย์',
        apply(p, c) {
            const step = Math.sin(c.t * 5.2);
            p.bodyY = Math.abs(step) * 0.06;
            p.bodyLean = step * 0.04;
            p.armLZ = 0.55 + step * 0.35;
            p.armRZ = -0.55 - step * 0.35;
            p.armLX = step * 0.25;
            p.armRX = -step * 0.25;
            p.elbowLZ = -0.35;
            p.elbowRZ = 0.35;
            p.legLZ = step * 0.45;
            p.legRZ = -step * 0.45;
            p.kneeLZ = Math.max(0, step) * 0.7;
            p.kneeRZ = Math.max(0, -step) * 0.7;
            p.headTilt = step * 0.06;
            p.squash = 1 - Math.abs(step) * 0.03;
        }
    }
};

export const MOVE_IDS = Object.keys(DANCE_MOVES);

export function moveLabel(id) {
    return (DANCE_MOVES[id] && DANCE_MOVES[id].label) || id;
}
