const path = require('path');

let activeOverlaySession = { streamToken: null, userId: null, updatedAt: 0 };

const OVERLAY_ROUTE_DEFS = [
    { route: 'gacha/reveal', file: 'overlay.html', mode: 'gacha', title: 'Gacha Reveal Only', defaults: { showSponsor: '0', showTotal: '0', showPity: '0', showAlert: '0' } },
    { route: 'gacha/alerts', file: 'overlay.html', mode: 'gacha', title: 'Gacha + Alerts', defaults: { showSponsor: '0', showTotal: '0', showPity: '0', showAlert: '1' } },
    { route: 'gacha', file: 'overlay.html', mode: 'gacha', title: 'Gacha Full', defaults: { showSponsor: '1', showTotal: '1', showPity: '1', showAlert: '1' } },
    { route: 'reveal', file: 'overlay.html', mode: 'gacha', title: 'Card Reveal', defaults: { showSponsor: '0', showTotal: '0', showPity: '0', showAlert: '0' } },
    { route: 'wheel', file: 'random_win.html', mode: 'wheel', title: 'Random Wheel' },
    { route: 'win', file: 'overlay.html', mode: 'win', title: 'Win Counter' },
    { route: 'timer', file: 'overlay.html', mode: 'timer', title: 'Countdown Timer' },
    { route: 'vote', file: 'overlay.html', mode: 'vote', title: 'Vote / VS' },
    { route: 'songrequest', file: 'overlay.html', mode: 'songrequest', title: 'Song Request' },
    { route: 'credits', file: 'overlay.html', mode: 'credits', title: 'Stream Credits' },
    { route: 'alerts', file: 'overlay.html', mode: 'alerts', title: 'Gift Alerts' },
    { route: 'jar', file: 'overlay.html', mode: 'jar', title: 'Gift Jar' },
    { route: 'airdrop', file: 'overlay.html', mode: 'airdrop', title: 'Airdrop Mission' }
];

function isLocalOverlayRequest(req) {
    const ip = String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');
    const host = String(req.hostname || '').toLowerCase();
    return ip === '127.0.0.1' || ip === '::1' || host === 'localhost' || host === '127.0.0.1';
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

function registerOverlayRoutes(app, db, rootDir) {
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

    app.get('/api/overlay/urls', async (req, res) => {
        if (!isLocalOverlayRequest(req)) {
            return res.status(403).json({ success: false, error: 'Local access only' });
        }
        const port = req.socket.localPort || process.env.PORT || 3000;
        const host = `http://127.0.0.1:${port}`;
        const overlays = OVERLAY_ROUTE_DEFS.map((def) => ({
            route: def.route,
            title: def.title,
            mode: def.mode,
            url: `${host}/overlay/${def.route}`
        }));
        res.json({ success: true, baseUrl: host, overlays });
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
    OVERLAY_ROUTE_DEFS,
    isLocalOverlayRequest
};
