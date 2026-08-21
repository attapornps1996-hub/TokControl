/**
 * Demo dancers for Dance Club (avatar via dicebear CDN).
 */
export const DEMO_DANCERS = [
    { id: 'd1', name: 'Nova', handle: 'nova_live', seed: 'NovaClub', color: '#ff2d95' },
    { id: 'd2', name: 'Kai', handle: 'kai_beats', seed: 'KaiClub', color: '#00d2ff' },
    { id: 'd3', name: 'Mira', handle: 'mira_glow', seed: 'MiraClub', color: '#bc13fe' },
    { id: 'd4', name: 'Rex', handle: 'rex_drop', seed: 'RexClub', color: '#f1c40f' },
    { id: 'd5', name: 'Luna', handle: 'luna_wave', seed: 'LunaClub', color: '#2ecc71' },
    { id: 'd6', name: 'Ash', handle: 'ash_pulse', seed: 'AshClub', color: '#ff6b35' },
    { id: 'd7', name: 'Zeno', handle: 'zeno_bass', seed: 'ZenoClub', color: '#7ad3c4' },
    { id: 'd8', name: 'Pixie', handle: 'pixie_pop', seed: 'PixieClub', color: '#ff9ff3' },
    { id: 'd9', name: 'Dro', handle: 'dro_hz', seed: 'DroClub', color: '#54a0ff' },
    { id: 'd10', name: 'Yuki', handle: 'yuki_snow', seed: 'YukiClub', color: '#c8f7ff' },
    { id: 'd11', name: 'Bolt', handle: 'bolt_amp', seed: 'BoltClub', color: '#feca57' },
    { id: 'd12', name: 'Momo', handle: 'momo_step', seed: 'MomoClub', color: '#ff6b81' }
];

export function avatarUrl(seed) {
    return `https://api.dicebear.com/7.x/avataaars/png?seed=${encodeURIComponent(seed)}&size=256&backgroundColor=1a1030`;
}
