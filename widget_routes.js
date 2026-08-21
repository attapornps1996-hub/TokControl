/**
 * TokControl Widget routes — TikFinity-style /widget/:type?cid=
 * Serves overlay HTML with injected window.__TC_WIDGET__ bootstrap.
 */
const path = require('path');
const fs = require('fs');
const {
    OVERLAY_ROUTE_DEFS,
    validateStreamToken,
    getOverlaySettingsForToken
} = require('./overlay_routes');

const BRAND = 'TokControl';
const PUBLIC_SITE_BASE = String(
    process.env.TOKCONTROL_PUBLIC_SITE ||
    process.env.APP_PUBLIC_SITE ||
    'https://www.tokcontrol.com'
).replace(/\/$/, '');

/** Extra gallery / mode entries not always listed as pretty /overlay routes */
const EXTRA_WIDGET_DEFS = [
    { route: 'goal', file: 'overlay.html', mode: 'goal', title: 'Goal Overlay' },
    { route: 'lastx', file: 'overlay.html', mode: 'lastx', title: 'Last X Overlay' },
    { route: 'effects', file: 'overlay.html', mode: 'effects', title: 'Effects Overlay' },
    { route: 'showcase', file: 'overlay.html', mode: 'showcase', title: 'Showcase Overlay' },
    { route: 'actions', file: 'overlay.html', mode: 'actions', title: 'Actions Overlay' }
];

function buildWidgetTypeMap() {
    const map = Object.create(null);
    const add = (def) => {
        if (!def || !def.route) return;
        const key = String(def.route).replace(/^\/+/, '');
        map[key] = {
            type: key,
            file: def.file || 'overlay.html',
            mode: def.mode || key,
            title: def.title || key,
            defaults: def.defaults && typeof def.defaults === 'object' ? { ...def.defaults } : {},
            brand: BRAND
        };
    };
    OVERLAY_ROUTE_DEFS.forEach(add);
    EXTRA_WIDGET_DEFS.forEach(add);
    return map;
}

const WIDGET_TYPE_MAP = buildWidgetTypeMap();

const htmlCache = new Map();

function readWidgetHtml(rootDir, relFile) {
    const abs = path.join(rootDir, relFile);
    try {
        const stat = fs.statSync(abs);
        const cached = htmlCache.get(abs);
        if (cached && cached.mtime === stat.mtimeMs) return cached.html;
        const html = fs.readFileSync(abs, 'utf8');
        htmlCache.set(abs, { mtime: stat.mtimeMs, html });
        return html;
    } catch (e) {
        return null;
    }
}

function parseWidgetPathRest(rest) {
    const parts = String(rest || '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .split('/')
        .filter(Boolean);
    if (!parts.length) return { type: '', cid: null };
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && /^[a-f0-9]{16,}$/i.test(last)) {
        return { type: parts.slice(0, -1).join('/'), cid: last };
    }
    return { type: parts.join('/'), cid: null };
}

function isPreviewQuery(query) {
    const q = query || {};
    return q.preview === '1' || q.demo === '1' || q.card === '1';
}

function pickQueryExtras(query) {
    const q = query || {};
    const out = {};
    const keep = [
        'ovId', 'w', 'h', 'preview', 'demo', 'card', 'mute',
        'goalType', 'goalLayout', 'lastType', 'lastLayout',
        'effectType', 'showcaseType', 'srTheme', 'style',
        'rankLayout', 'giftLayout', 'fillLayout', 'carouselLayout',
        'cmLayout', 'govLayout', 'govRows', 'gnLayout', 'guessTheme',
        'tvtLayout', 'gcLayout', 'campaignTheme', 'fwLayout',
        'likeLayout', 'ttLayout', 'rbxLayout',
        'nobrand', 'brand', 'hideBrand', 'serverUrl'
    ];
    keep.forEach((k) => {
        if (q[k] !== undefined && q[k] !== null && q[k] !== '') out[k] = String(q[k]);
    });
    return out;
}

async function defaultValidateCid(db, cid) {
    if (!cid) return false;
    if (typeof validateStreamToken === 'function') {
        try {
            if (await validateStreamToken(db, cid)) return true;
        } catch (_) { /* fall through */ }
    }
    if (db && typeof db.getUserByStreamToken === 'function') {
        try {
            return !!(await db.getUserByStreamToken(cid));
        } catch (_) { /* fall through */ }
    }
    if (db && typeof db.get === 'function') {
        try {
            const row = await db.get('SELECT id FROM users WHERE streamToken = ?', [String(cid)]);
            return !!row;
        } catch (_) { /* fall through */ }
    }
    if (db && typeof db.listUsers === 'function') {
        try {
            const users = await db.listUsers();
            return (users || []).some((u) => String(u.streamToken || '') === String(cid));
        } catch (_) { /* fall through */ }
    }
    return false;
}

function buildBootstrap({ type, cid, def, query, settings }) {
    const extras = pickQueryExtras(query);
    return {
        brand: def.brand || BRAND,
        type,
        cid: cid || '',
        mode: def.mode,
        title: def.title,
        defaults: { ...(def.defaults || {}) },
        query: extras,
        settings: settings && typeof settings === 'object' ? settings : {},
        socketPath: '/socket.io',
        publicBase: PUBLIC_SITE_BASE
    };
}

function injectBootstrap(html, boot) {
    const json = JSON.stringify(boot).replace(/</g, '\\u003c');
    const tag =
        `<script>window.__TC_WIDGET__=${json};</script>\n` +
        `<script src="/js/overlay-widget-boot.js"></script>\n`;
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${tag}</head>`);
    }
    if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body([^>]*)>/i, `<body$1>${tag}`);
    }
    return tag + html;
}

function applyNoCache(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
}

function registerWidgetRoutes(app, deps = {}) {
    const {
        db,
        rootDir = path.join(__dirname),
        validateCid = null
    } = deps;

    const validate = typeof validateCid === 'function'
        ? validateCid
        : (cid) => defaultValidateCid(db, cid);

    async function resolveAndSend(req, res, typeRaw, cidRaw) {
        applyNoCache(res);
        const type = String(typeRaw || '').replace(/^\/+|\/+$/g, '');
        const def = WIDGET_TYPE_MAP[type];
        if (!def) {
            return res.status(404).type('text').send('Unknown widget type');
        }

        let cid = String(cidRaw || req.query.cid || req.query.token || '').trim();
        const preview = isPreviewQuery(req.query);

        if (!cid && !preview) {
            return res.status(400).type('text').send('Missing widget id (cid)');
        }
        if (cid) {
            const ok = await validate(cid);
            if (!ok) {
                return res.status(403).type('text').send('Invalid widget id');
            }
        }

        const ovId = String(req.query.ovId || '').trim();
        let settings = {};
        if (cid) {
            if (ovId) {
                settings = getOverlaySettingsForToken(cid, ovId) || {};
            } else {
                const all = getOverlaySettingsForToken(cid);
                settings = all && typeof all === 'object' && !Array.isArray(all) ? {} : {};
            }
        }

        const html = readWidgetHtml(rootDir, def.file);
        if (!html) {
            return res.status(500).type('text').send('Widget template missing');
        }

        const boot = buildBootstrap({ type, cid, def, query: req.query, settings });
        res.type('html').send(injectBootstrap(html, boot));
    }

    app.get('/api/widget/config', async (req, res) => {
        applyNoCache(res);
        const type = String(req.query.type || '').replace(/^\/+|\/+$/g, '');
        const cid = String(req.query.cid || req.query.token || '').trim();
        const ovId = String(req.query.ovId || '').trim();
        const def = type ? WIDGET_TYPE_MAP[type] : null;
        if (!type || !def) {
            return res.status(400).json({ success: false, error: 'type required' });
        }
        if (!cid) {
            return res.status(400).json({ success: false, error: 'cid required' });
        }
        if (!(await validate(cid))) {
            return res.status(403).json({ success: false, error: 'invalid cid' });
        }
        const settings = ovId
            ? (getOverlaySettingsForToken(cid, ovId) || {})
            : {};
        const boot = buildBootstrap({ type, cid, def, query: req.query, settings });
        res.json({ success: true, widget: boot });
    });

    app.get('/api/widget/types', (req, res) => {
        applyNoCache(res);
        const types = Object.keys(WIDGET_TYPE_MAP).sort().map((k) => ({
            type: k,
            mode: WIDGET_TYPE_MAP[k].mode,
            title: WIDGET_TYPE_MAP[k].title,
            file: WIDGET_TYPE_MAP[k].file
        }));
        res.json({ success: true, brand: BRAND, publicBase: PUBLIC_SITE_BASE, types });
    });

    // /widget/* — supports nested types (airdrop/alert) and optional path cid
    app.get(/^\/widget\/(.+)$/, async (req, res) => {
        try {
            const rest = req.params[0] || '';
            const parsed = parseWidgetPathRest(rest);
            if (!parsed.type) {
                return res.status(404).type('text').send('Unknown widget type');
            }
            await resolveAndSend(req, res, parsed.type, parsed.cid || null);
        } catch (e) {
            console.warn('[widget] serve failed:', e?.message || e);
            res.status(500).type('text').send('Widget error');
        }
    });
}

module.exports = {
    registerWidgetRoutes,
    WIDGET_TYPE_MAP,
    buildWidgetTypeMap,
    PUBLIC_SITE_BASE,
    BRAND,
    parseWidgetPathRest,
    defaultValidateCid
};
