/** Shared palette / pattern metadata for scene + control panel */

export const PALETTE_LABELS = {
    neon: 'Neon', ice: 'Ice', sunset: 'Sunset', toxic: 'Toxic', mono: 'Mono',
    candy: 'Candy', ocean: 'Ocean', fire: 'Fire', galaxy: 'Galaxy', sakura: 'Sakura',
    cyber: 'Cyber', gold: 'Gold', blood: 'Blood', mint: 'Mint', violet: 'Violet'
};

export const PALETTE_IDS = Object.keys(PALETTE_LABELS);

export const PALETTE_SWATCH = {
    neon: '#ff2e97', ice: '#7fd7ff', sunset: '#ff6b35', toxic: '#aaff00', mono: '#ffffff',
    candy: '#ff6bcb', ocean: '#00b4d8', fire: '#ff4500', galaxy: '#9d4edd', sakura: '#ffb7c5',
    cyber: '#00ff9f', gold: '#ffd700', blood: '#dc143c', mint: '#98ff98', violet: '#9400d3'
};

export const PATTERN_LABELS = {
    sweep: 'Sweep', crossFan: 'Cross', chase: 'Chase', random: 'Random', lockCenter: 'Center',
    wave: 'Wave', pendulum: 'Pendulum', spiral: 'Spiral', ripple: 'Ripple', pulse: 'Pulse',
    orbit: 'Orbit', zigzag: 'Zigzag', breathe: 'Breathe', stadium: 'Stadium', laserScan: 'Laser'
};

export const PATTERN_IDS = Object.keys(PATTERN_LABELS);

export { DYNAMIC_FX_LABELS, DYNAMIC_FX_IDS } from './dynamic-light-fx.js';
