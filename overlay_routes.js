const path = require('path');
const fs = require('fs');

let activeOverlaySession = { streamToken: null, userId: null, updatedAt: 0 };
let overlaySettingsStore = {};
let overlaySettingsFilePath = null;
let overlaySettingsIo = null;

function initOverlaySettingsStore(rootDir) {
    overlaySettingsFilePath = path.join(rootDir, 'overlay_settings_cache.json');
    try {
        if (fs.existsSync(overlaySettingsFilePath)) {
            const raw = JSON.parse(fs.readFileSync(overlaySettingsFilePath, 'utf8'));
            overlaySettingsStore = raw && typeof raw === 'object' ? raw : {};
        }
    } catch (e) {
        overlaySettingsStore = {};
    }
}

function persistOverlaySettingsStore() {
    if (!overlaySettingsFilePath) return;
    try {
        fs.writeFileSync(overlaySettingsFilePath, JSON.stringify(overlaySettingsStore), 'utf8');
    } catch (e) { /* ignore */ }
}

async function validateStreamToken(db, token) {
    if (!token) return false;
    // The desktop panel is the authority for the currently active local
    // session. Its persisted login token can legitimately be newer than the
    // SQLite row after an app migration/reinstall, while Socket.IO is already
    // using that token successfully for overlays.
    if (activeOverlaySession.streamToken === String(token)) return true;
    try {
        const row = await db.get('SELECT id FROM users WHERE streamToken = ?', [String(token)]);
        return !!row;
    } catch (e) {
        return false;
    }
}

function setOverlaySettingsForToken(token, ovId, settings) {
    if (!token || !ovId) return false;
    const key = String(token);
    const id = String(ovId);
    if (!overlaySettingsStore[key]) overlaySettingsStore[key] = {};
    overlaySettingsStore[key][id] = settings && typeof settings === 'object' ? settings : {};
    persistOverlaySettingsStore();
    if (overlaySettingsIo) {
        overlaySettingsIo.to(key).emit('overlay_gallery_settings', { ovId: id, settings: overlaySettingsStore[key][id] });
    }
    return true;
}

function setAllOverlaySettingsForToken(token, all) {
    if (!token || !all || typeof all !== 'object') return false;
    const key = String(token);
    overlaySettingsStore[key] = { ...(overlaySettingsStore[key] || {}), ...all };
    persistOverlaySettingsStore();
    if (overlaySettingsIo) {
        overlaySettingsIo.to(key).emit('overlay_gallery_settings_bulk', { all: overlaySettingsStore[key] });
    }
    return true;
}

function getOverlaySettingsForToken(token, ovId) {
    if (!token) return null;
    const bucket = overlaySettingsStore[String(token)];
    if (!bucket) return null;
    if (ovId) return bucket[String(ovId)] || null;
    return bucket;
}

const OVERLAY_ROUTE_DEFS = [
    { route: 'gacha/reveal', file: 'overlay.html', mode: 'gacha', title: 'Gacha ผลสุ่ม + คะแนนรวม', defaults: { gachaPart: 'reveal' } },
    { route: 'gacha/alerts', file: 'overlay.html', mode: 'gacha', title: 'Gacha ป๊อปอัพของขวัญ', defaults: { gachaPart: 'alerts' } },
    { route: 'gacha/sponsor', file: 'overlay.html', mode: 'gacha', title: 'Gacha ป้าย Sponsor', defaults: { gachaPart: 'sponsor' } },
    { route: 'gacha/pity', file: 'overlay.html', mode: 'gacha', title: 'Gacha สถิติการันตี', defaults: { gachaPart: 'pity' } },
    { route: 'gacha', file: 'overlay.html', mode: 'gacha', title: 'Gacha Full', defaults: { gachaPart: 'full' } },
    { route: 'reveal', file: 'overlay.html', mode: 'gacha', title: 'Card Reveal', defaults: { gachaPart: 'reveal' } },
    { route: 'wheel', file: 'random_win.html', mode: 'wheel', title: 'Random Wheel' },
    { route: 'shuffle', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Shuffle', defaults: { overlay: '1', system: 'shuffle' } },
    { route: 'draw', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Draw', defaults: { overlay: '1', system: 'draw' } },
    { route: 'fan', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Fan', defaults: { overlay: '1', system: 'fan' } },
    { route: 'ripple', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Ripple', defaults: { overlay: '1', system: 'ripple' } },
    { route: 'deal', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Deal', defaults: { overlay: '1', system: 'deal' } },
    { route: 'orb', file: 'lucky_rituals.html', mode: 'ritual', title: 'Crystal Orb', defaults: { overlay: '1', system: 'orb' } },
    { route: 'coin', file: 'lucky_rituals.html', mode: 'ritual', title: 'Coin Flip', defaults: { overlay: '1', system: 'coin' } },
    { route: 'scroll', file: 'lucky_rituals.html', mode: 'ritual', title: 'Scroll Unroll', defaults: { overlay: '1', system: 'scroll' } },
    { route: 'portal', file: 'lucky_rituals.html', mode: 'ritual', title: 'Portal Pull', defaults: { overlay: '1', system: 'portal' } },
    { route: 'star', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Shuffle', defaults: { overlay: '1', system: 'shuffle' } },
    { route: 'alchemy', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Draw', defaults: { overlay: '1', system: 'draw' } },
    { route: 'capsule', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Fan', defaults: { overlay: '1', system: 'fan' } },
    { route: 'crystal', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Ripple', defaults: { overlay: '1', system: 'ripple' } },
    { route: 'orbital', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Deal', defaults: { overlay: '1', system: 'deal' } },
    { route: 'rift', file: 'lucky_rituals.html', mode: 'ritual', title: 'Crystal Orb', defaults: { overlay: '1', system: 'orb' } },
    { route: 'holo', file: 'lucky_rituals.html', mode: 'ritual', title: 'Coin Flip', defaults: { overlay: '1', system: 'coin' } },
    { route: 'relic', file: 'lucky_rituals.html', mode: 'ritual', title: 'Scroll Unroll', defaults: { overlay: '1', system: 'scroll' } },
    { route: 'rituals', file: 'lucky_rituals.html', mode: 'ritual', title: 'Lucky Draw Hub', defaults: { overlay: '1', system: 'shuffle' } },
    { route: 'cards', file: 'lucky_rituals.html', mode: 'ritual', title: 'Card Draw Hub', defaults: { overlay: '1', system: 'shuffle' } },
    { route: 'win', file: 'overlay.html', mode: 'win', title: 'Win Counter' },
    { route: 'timer', file: 'overlay.html', mode: 'timer', title: 'Countdown Timer' },
    { route: 'vote', file: 'vote-overlay.html', mode: 'vote', title: 'Vote Overlay' },
    { route: 'songrequest', file: 'overlay.html', mode: 'songrequest', title: 'Song Request' },
    { route: 'songrequest-h', file: 'overlay.html', mode: 'songrequest-h', title: 'Song Request (แนวนอน)' },
    { route: 'songrequest-skip', file: 'overlay.html', mode: 'sr-skip', title: 'Skip Vote Counter' },
    { route: 'songrequest-vinyl', file: 'overlay.html', mode: 'sr-vinyl', title: 'Song Request — Vinyl Spin' },
    { route: 'songrequest-ticker', file: 'overlay.html', mode: 'sr-ticker', title: 'Song Request — Broadcast Ticker' },
    { route: 'songrequest-split', file: 'overlay.html', mode: 'sr-split', title: 'Song Request — Split Stage' },
    { route: 'songrequest-deck', file: 'overlay.html', mode: 'sr-deck', title: 'Song Request — DJ Deck' },
    { route: 'songrequest-cassette', file: 'overlay.html', mode: 'sr-cassette', title: 'Song Request — Cassette' },
    { route: 'songrequest-spectrum', file: 'overlay.html', mode: 'sr-spectrum', title: 'Song Request — Spectrum EQ' },
    { route: 'songrequest-crt', file: 'overlay.html', mode: 'sr-crt', title: 'Song Request — CRT TV' },
    { route: 'songrequest-neonstack', file: 'overlay.html', mode: 'sr-neonstack', title: 'Song Request — Neon Stack' },
    { route: 'songrequest-film', file: 'overlay.html', mode: 'sr-film', title: 'Song Request — Film Reel' },
    { route: 'songrequest-skip-arc', file: 'overlay.html', mode: 'sr-skip-arc', title: 'Skip Vote — Arc Gauge' },
    { route: 'songrequest-skip-pixel', file: 'overlay.html', mode: 'sr-skip-pixel', title: 'Skip Vote — Pixel LCD' },
    { route: 'songrequest-skip-bolt', file: 'overlay.html', mode: 'sr-skip-bolt', title: 'Skip Vote — Lightning' },
    { route: 'songrequest-skip-stamp', file: 'overlay.html', mode: 'sr-skip-stamp', title: 'Skip Vote — Stamp Card' },
    { route: 'songrequest-skip-roulette', file: 'overlay.html', mode: 'sr-skip-roulette', title: 'Skip Vote — Roulette' },
    { route: 'songrequest-script-card', file: 'overlay.html', mode: 'sr-script-card', title: 'Song Request — Script Card' },
    { route: 'songrequest-script-panel', file: 'overlay.html', mode: 'sr-script-panel', title: 'Song Request — Script Panel' },
    { route: 'songrequest-script-ticker', file: 'overlay.html', mode: 'sr-script-ticker', title: 'Song Request — Script Ticker' },
    { route: 'songrequest-script-bar', file: 'overlay.html', mode: 'sr-script-bar', title: 'Song Request — Script Bar' },
    { route: 'sr-skip', file: 'overlay.html', mode: 'sr-skip', title: 'Skip Vote Counter' },
    { route: 'credits', file: 'overlay.html', mode: 'credits', title: 'Stream Credits' },
    { route: 'alerts', file: 'overlay.html', mode: 'alerts', title: 'Gift Alerts' },
    { route: 'jar', file: 'overlay.html', mode: 'jar', title: 'Gift Jar' },
    { route: 'airdrop', file: 'overlay.html', mode: 'airdrop', title: 'Airdrop (รวม)' },
    { route: 'airdrop/alert', file: 'overlay.html', mode: 'airdrop-alert', title: 'Airdrop แจ้งเตือน 9:16' },
    { route: 'airdrop/mission-v', file: 'overlay.html', mode: 'airdrop-mission-v', title: 'Airdrop ภารกิจเต็มจอ 9:16' },
    { route: 'airdrop/result', file: 'overlay.html', mode: 'airdrop-result', title: 'Airdrop ประกาศผล 9:16' },
    { route: 'airdrop/countdown', file: 'overlay.html', mode: 'airdrop-countdown', title: 'Airdrop นับถอยหลัง 16:9' },
    { route: 'airdrop/mission-h', file: 'overlay.html', mode: 'airdrop-mission-h', title: 'Airdrop ภารกิจแนวนอน 16:9' },
    { route: 'airdrop/mission', file: 'overlay.html', mode: 'airdrop-mission-h', title: 'Airdrop ภารกิจ 16:9 (legacy)' },
    { route: 'pngtuber', file: 'pngtuber.html', mode: 'pngtuber', title: 'PNGTuber' },
    { route: 'memory-match', file: 'games/memory-match/index.html', mode: 'memory-match', title: 'เกมจับคู่ (Memory Match)', defaults: { overlay: '1' } },
    { route: 'spot-diff', file: 'games/spot-diff/index.html', mode: 'spot-diff', title: 'จับผิดภาพ (Spot the Difference)', defaults: { overlay: '1' } },
    { route: 'dance-club', file: 'games/dance-club/index.html', mode: 'dance-club', title: 'Dance Club (3D Idle)', defaults: { overlay: '1' } },
    { route: 'fish-control', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Classic Capsule' },
    { route: 'fish-control/buoy', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Sea Buoy', defaults: { style: 'buoy' } },
    { route: 'fish-control/lcd', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Retro LCD', defaults: { style: 'lcd' } },
    { route: 'fish-control/reel', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Fishing Reel', defaults: { style: 'reel' } },
    { route: 'fish-control/tide', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Tide Meter', defaults: { style: 'tide' } },
    { route: 'fish-control/arcade', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Arcade Cabinet', defaults: { style: 'arcade' } },
    { route: 'fish-control/splash', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Ink Splash', defaults: { style: 'splash' } },
    { route: 'fish-control/dock', file: 'games/fish-control/overlay.html', mode: 'fish-control', title: 'Fish Control — Pier Board', defaults: { style: 'dock' } },
    { route: 'watch-party', file: 'games/watch-party/index.html', mode: 'watch-party', title: 'Watch Party', defaults: { display: '1' } },
    { route: 'watch-party/landscape', file: 'games/watch-party/index.html', mode: 'watch-party', title: 'Watch Party (แนวนอน)', defaults: { display: '1', landscape: '1', layout: 'landscape' } },
    { route: 'watch-party/portrait', file: 'games/watch-party/index.html', mode: 'watch-party', title: 'Watch Party (แนวตั้ง)', defaults: { display: '1', portrait: '1', layout: 'portrait-stack' } },
    { route: 'guessnumber', file: 'overlay.html', mode: 'guessnumber', title: 'Guess the Number' },
    { route: 'guess-number', file: 'overlay.html', mode: 'guessnumber', title: 'Guess the Number' },
    { route: 'teamvsteam', file: 'overlay.html', mode: 'teamvsteam', title: 'Team Vs Team' },
    { route: 'team-vs-team', file: 'overlay.html', mode: 'teamvsteam', title: 'Team Vs Team' },
    { route: 'giftcampaign', file: 'overlay.html', mode: 'giftcampaign', title: 'Gift Campaign' },
    { route: 'gift-campaign', file: 'overlay.html', mode: 'giftcampaign', title: 'Gift Campaign' }
];

function isLocalOverlayRequest(req) {
    const ip = String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
    const host = String(req.hostname || '').toLowerCase();
    return ip === '127.0.0.1'
        || ip === '::1'
        || host === 'localhost'
        || host === '127.0.0.1'
        || host.endsWith('.lhr.life')
        || host.endsWith('.localhost.run');
}

function setActiveOverlaySession(streamToken, userId) {
    if (!streamToken) return;
    activeOverlaySession = {
        streamToken: String(streamToken),
        userId: userId != null ? userId : null,
        updatedAt: Date.now()
    };
}

async function resolveOverlayStreamToken(db) {
    if (activeOverlaySession.streamToken) return activeOverlaySession.streamToken;
    try {
        const row = await db.get('SELECT streamToken FROM users ORDER BY id ASC LIMIT 1');
        return row?.streamToken || null;
    } catch (e) {
        return null;
    }
}

function registerOverlayRoutes(app, db, rootDir, io) {
    overlaySettingsIo = io || null;
    initOverlaySettingsStore(rootDir);
    const applyNoCache = (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
    };

    app.get('/api/overlay/session', async (req, res) => {
        if (!isLocalOverlayRequest(req)) {
            return res.status(403).json({ success: false, error: 'Local access only' });
        }
        try {
            const streamToken = await resolveOverlayStreamToken(db);
            if (!streamToken) {
                return res.status(404).json({
                    success: false,
                    error: 'No stream session found — please log in to the app first'
                });
            }
            res.json({ success: true, streamToken });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/overlay/settings', async (req, res) => {
        applyNoCache(res);
        const token = String(req.query.token || '').trim();
        const ovId = String(req.query.ovId || '').trim();
        if (!token) return res.status(400).json({ success: false, error: 'token required' });
        if (!(await validateStreamToken(db, token))) {
            return res.status(403).json({ success: false, error: 'invalid token' });
        }
        if (ovId) {
            const settings = getOverlaySettingsForToken(token, ovId);
            return res.json({ success: true, ovId, settings: settings || {} });
        }
        const all = getOverlaySettingsForToken(token) || {};
        res.json({ success: true, all });
    });

    app.put('/api/overlay/settings', async (req, res) => {
        const token = String(req.body?.token || '').trim();
        const ovId = String(req.body?.ovId || '').trim();
        const settings = req.body?.settings;
        if (!token || !ovId) return res.status(400).json({ success: false, error: 'token and ovId required' });
        if (!(await validateStreamToken(db, token))) {
            return res.status(403).json({ success: false, error: 'invalid token' });
        }
        setOverlaySettingsForToken(token, ovId, settings);
        res.json({ success: true, ovId });
    });

    app.put('/api/overlay/settings/bulk', async (req, res) => {
        const token = String(req.body?.token || '').trim();
        const all = req.body?.all;
        if (!token || !all || typeof all !== 'object') {
            return res.status(400).json({ success: false, error: 'token and all required' });
        }
        if (!(await validateStreamToken(db, token))) {
            return res.status(403).json({ success: false, error: 'invalid token' });
        }
        setAllOverlaySettingsForToken(token, all);
        res.json({ success: true, count: Object.keys(all).length });
    });

    app.get('/api/overlay/urls', async (req, res) => {
        if (!isLocalOverlayRequest(req)) {
            return res.status(403).json({ success: false, error: 'Local access only' });
        }
        const port = req.socket.localPort || process.env.PORT || 3000;
        // Match the Electron shell origin (127.0.0.1) so preview iframes are
        // never treated as cross-origin from legacy localhost URLs.
        const base = `http://127.0.0.1:${port}`;
        const streamToken = await resolveOverlayStreamToken(db);
        const buildUrl = (def) => {
            const params = new URLSearchParams();
            if (streamToken) params.set('cid', streamToken);
            params.set('w', '1920');
            params.set('h', '1080');
            return `${base}/widget/${def.route}?${params.toString()}`;
        };
        const overlays = OVERLAY_ROUTE_DEFS.map((def) => ({
            route: def.route,
            title: def.title,
            mode: def.mode,
            url: buildUrl(def)
        }));
        res.json({ success: true, baseUrl: base, streamToken, overlays });
    });

    const sorted = [...OVERLAY_ROUTE_DEFS].sort((a, b) => b.route.length - a.route.length);
    for (const def of sorted) {
        app.get(`/overlay/${def.route}`, (req, res) => {
            applyNoCache(res);
            res.sendFile(path.join(rootDir, def.file));
        });
    }

    app.get('/overlay', (req, res) => {
        applyNoCache(res);
        res.sendFile(path.join(rootDir, 'overlay.html'));
    });
}

module.exports = {
    registerOverlayRoutes,
    setActiveOverlaySession,
    resolveOverlayStreamToken,
    setOverlaySettingsForToken,
    setAllOverlaySettingsForToken,
    getOverlaySettingsForToken,
    validateStreamToken,
    OVERLAY_ROUTE_DEFS,
    isLocalOverlayRequest
};
