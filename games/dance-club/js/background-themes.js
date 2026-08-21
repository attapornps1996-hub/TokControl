/** Background theme catalog (no Three.js dependency). */
export const BACKGROUND_THEMES = [
    { id: 'retrowave', label: 'Retrowave Grid', tint: '#ff2e97', fog: '#12021f' },
    { id: 'nebula', label: 'Nebula Clouds', tint: '#7a4dff', fog: '#0a0620' },
    { id: 'tunnel', label: 'Neon Tunnel', tint: '#00e5ff', fog: '#02121a' },
    { id: 'equalizer', label: 'Equalizer Bars', tint: '#3affc0', fog: '#04140f' },
    { id: 'starfield', label: 'Starfield Warp', tint: '#8fb3ff', fog: '#04061a' },
    { id: 'city', label: 'City Skyline', tint: '#ff8a3d', fog: '#150818' },
    { id: 'plasma', label: 'Plasma Wash', tint: '#ff4d6d', fog: '#1a0414' },
    { id: 'strobefield', label: 'Strobe Field', tint: '#ffffff', fog: '#0d0d14' }
];

export const BACKGROUND_IDS = BACKGROUND_THEMES.map((t) => t.id);
