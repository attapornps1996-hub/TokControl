import { ROOM, CEILING_SCREEN } from './room.js';
import { RUNWAY } from './formation.js?v=form-flat-1';

/** Camera shot presets — elevated / cinematic angles (no extreme low). */
const CEIL_LOOK = [CEILING_SCREEN.x, CEILING_SCREEN.y, CEILING_SCREEN.z];

export const CAMERA_SHOTS = [
    {
        id: 'wide', label: 'มุมกว้าง', icon: '🏟️',
        pos: [0, 12, 34], look: [0, 2.2, 0],
        fov: 62, move: { type: 'drift', amp: 2.8, speed: 0.1 }
    },
    {
        id: 'ultraWide', label: 'เวทีเต็ม', icon: '🌐',
        pos: [0, 16, 42], look: [0, 1.8, -1],
        fov: 66, move: { type: 'drift', amp: 3.2, speed: 0.08 }
    },
    {
        id: 'wingL', label: 'เวทีซ้าย', icon: '◀️',
        pos: [-22, 9.5, 12], look: [-17, 1.8, 2],
        fov: 58, move: { type: 'drift', amp: 2.0, speed: 0.12 }
    },
    {
        id: 'wingR', label: 'เวทีขวา', icon: '▶️',
        pos: [22, 9.5, 12], look: [17, 1.8, 2],
        fov: 58, move: { type: 'drift', amp: 2.0, speed: 0.12 }
    },
    {
        id: 'crowd', label: 'กลางฟลอร์', icon: '🕺',
        pos: [0, 8.5, 18], look: [0, 1.6, 0],
        fov: 58, move: { type: 'handheld', amp: 0.12, speed: 0.7 }
    },
    {
        id: 'crane', label: 'เครน', icon: '🎢',
        pos: [0, 16.5, 16], look: [0, 2.2, -3],
        fov: 52, move: { type: 'crane', amp: 4.6, speed: 0.16 }
    },
    {
        id: 'dollyL', label: 'ดอลลี่ ซ้าย', icon: '⬅️',
        pos: [-16, 6.2, 11], look: [1, 2.8, -3],
        fov: 54, move: { type: 'dolly', amp: 6.5, speed: 0.18 }
    },
    {
        id: 'dollyR', label: 'ดอลลี่ ขวา', icon: '➡️',
        pos: [16, 6.2, 11], look: [-1, 2.8, -3],
        fov: 54, move: { type: 'dolly', amp: -6.5, speed: 0.18 }
    },
    {
        id: 'highSide', label: 'มุมสูงข้าง', icon: '↗️',
        pos: [14, 12.5, 10], look: [0, 2.4, -2],
        fov: 50, move: { type: 'drift', amp: 1.8, speed: 0.14 }
    },
    {
        id: 'highSideL', label: 'มุมสูงซ้าย', icon: '↖️',
        pos: [-14, 12.5, 10], look: [0, 2.4, -2],
        fov: 50, move: { type: 'drift', amp: 1.8, speed: 0.14 }
    },
    {
        id: 'dutch', label: 'ดัตช์ เอียง', icon: '📐',
        pos: [-8, 7.2, 13], look: [1.2, 3.0, -3],
        fov: 55, roll: 0.16, move: { type: 'rollSway', amp: 0.12, speed: 0.45 }
    },
    {
        id: 'top', label: 'มุมสูง', icon: '🛸',
        pos: [0, 26, 5], look: [0, 0.8, -1],
        fov: 58, move: { type: 'spinTop', amp: 3.8, speed: 0.16 }
    },
    {
        id: 'stage', label: 'หลังเวที', icon: '🎛️',
        pos: [0, 7.5, -18], look: [0, 3.0, 3],
        fov: 54, move: { type: 'drift', amp: 1.6, speed: 0.15 }
    },
    {
        id: 'laser', label: 'ลอดลำแสง', icon: '⚡',
        pos: [-13, 10.5, -4], look: [3, 2.6, 4],
        fov: 58, move: { type: 'orbitArc', amp: 0.4, speed: 0.22 }
    },
    {
        id: 'closeup', label: 'โคลสอัพ', icon: '🔍',
        pos: [0, 4.2, 7.5], look: [0, 2.8, -1],
        fov: 32, move: { type: 'handheld', amp: 0.1, speed: 1.0 },
        randomTarget: true
    },
    {
        id: 'runwayName', label: 'รันเวย์ชื่อ', icon: '📛',
        pos: [0, 10, 14], look: [0, 6.2, ROOM.stageZ - 3.5],
        fov: 44, move: { type: 'drift', amp: 0.5, speed: 0.08 }
    },
    {
        id: 'runwayHigh', label: 'รันเวย์สูง', icon: '🎬',
        pos: [0, 20, 6], look: [0, 1.4, RUNWAY.endZ - 2.5],
        fov: 50, move: { type: 'drift', amp: 0.7, speed: 0.08 }
    },
    {
        id: 'runwayMid', label: 'รันเวย์กลาง', icon: '🎥',
        pos: [4.5, 12, 10], look: [0, 2.2, RUNWAY.endZ - 1.5],
        fov: 40, move: { type: 'handheld', amp: 0.06, speed: 0.9 }
    },
    {
        id: 'runwayEnd', label: 'รันเวย์โคลส', icon: '✨',
        pos: [0, 7.5, 12], look: [0, 2.6, RUNWAY.endZ - 0.8],
        fov: 34, move: { type: 'handheld', amp: 0.05, speed: 0.85 }
    },
    {
        id: 'hero', label: 'ฮีโร่ช็อต', icon: '🦸',
        pos: [3.5, 4.8, 9], look: [0, 2.8, -1],
        fov: 40, move: { type: 'dolly', amp: 2.2, speed: 0.2 }
    },
    {
        id: 'far', label: 'มุมไกล', icon: '🔭',
        pos: [0, 20, 50], look: [0, 2.0, 0],
        fov: 58, move: { type: 'drift', amp: 3.5, speed: 0.08 }
    },
    {
        id: 'stageYt', label: 'จอเวที', icon: '🖥️',
        pos: [0, 7.2, 17.5], look: [0, 7.1, ROOM.stageZ - 4.2],
        fov: 40
    },
    {
        id: 'topScreen', label: 'จอเพดาน', icon: '📺',
        pos: [0, 2.8, 6], look: CEIL_LOOK,
        fov: 38, move: { type: 'crane', amp: 0.6, speed: 0.05 }
    },
    {
        id: 'topScreenPush', label: 'เสยขึ้นเพดาน', icon: '⬆️',
        pos: [0, 4.2, 5.5], look: CEIL_LOOK,
        fov: 32, move: { type: 'crane', amp: 0.35, speed: 0.04 }
    },
    {
        id: 'farHigh', label: 'ไกลสูง', icon: '🛰️',
        pos: [0, 32, 28], look: [0, 1.5, 0],
        fov: 52, move: { type: 'drift', amp: 2.5, speed: 0.1 }
    },
    {
        id: 'drone', label: 'โดรนหมุน', icon: '🚁',
        pos: [22, 14, 22], look: [0, 2.2, 0],
        fov: 46, move: { type: 'droneOrbit', amp: 26, speed: 0.12 }
    },
    {
        id: 'droneFar', label: 'โดรนไกล', icon: '📡',
        pos: [32, 18, 30], look: [0, 2.0, -1],
        fov: 44, move: { type: 'droneOrbit', amp: 36, speed: 0.09 }
    },
    {
        id: 'orbit', label: 'ออร์บิทอิสระ', icon: '🖱️',
        free: true, fov: 52
    }
];

export const SHOT_IDS = CAMERA_SHOTS.map((s) => s.id);
