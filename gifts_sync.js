const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_SHARED_URL = 'https://raw.githubusercontent.com/attapornps1996-hub/TokControl/main/data/tiktok_gifts.json';

function getSharedGiftsUrl() {
    return (process.env.SHARED_GIFTS_URL || DEFAULT_SHARED_URL).trim();
}

function getSharedPushUrl() {
    return (process.env.SHARED_GIFTS_PUSH_URL || '').trim() || null;
}

function getSyncKey() {
    return (process.env.GIFTS_SYNC_KEY || '').trim() || null;
}

function fetchJson(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            timeout: 20000,
            headers: { 'User-Agent': 'TokControl-GiftsSync/1.0', Accept: 'application/json' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return fetchJson(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function postJson(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'User-Agent': 'TokControl-GiftsSync/1.0'
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Push timeout'));
        });
        req.write(payload);
        req.end();
    });
}

function loadBundledGifts() {
    const filePath = path.join(__dirname, 'data', 'tiktok_gifts.json');
    if (!fs.existsSync(filePath)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.gifts)) return parsed.gifts;
        if (parsed && Array.isArray(parsed.list)) return parsed.list;
    } catch (err) {
        console.warn('[GiftsSync] Failed to read bundled gifts:', err.message);
    }
    return [];
}

function extractGiftIconKey(giftIcon) {
    if (!giftIcon || typeof giftIcon !== 'string') return null;
    const url = giftIcon.trim();
    if (!url.startsWith('http')) return null;
    if (/dicebear\.com|bottts|avataaars|initials/i.test(url)) return null;

    const resourceMatch = url.match(/\/resource\/([a-f0-9]{32})/i);
    if (resourceMatch) return resourceMatch[1].toLowerCase();

    const hexMatch = url.match(/([a-f0-9]{32})/i);
    if (hexMatch) return hexMatch[1].toLowerCase();

    return null;
}

/** First usable http(s) URL from TikTok image objects / arrays / strings. */
function pickFirstImageUrl(...candidates) {
    for (const c of candidates) {
        if (!c) continue;
        if (typeof c === 'string') {
            const s = c.trim();
            if (/^https?:\/\//i.test(s) && !/dicebear\.com/i.test(s)) return s;
            continue;
        }
        if (Array.isArray(c)) {
            for (const item of c) {
                const found = pickFirstImageUrl(item);
                if (found) return found;
            }
            continue;
        }
        if (typeof c === 'object') {
            const found = pickFirstImageUrl(
                c.url_list,
                c.urlList,
                c.url,
                c.uri,
                c.src,
                c.giftImage,
                c.image,
                c.icon,
                c.thumbnail
            );
            if (found) return found;
        }
    }
    return '';
}

/**
 * Pull gift icon URL from raw TikTok Live gift payloads (v1 + v2 connector shapes).
 */
function extractGiftIconUrl(data, extras = {}) {
    if (!data || typeof data !== 'object') return '';
    const ext = data.extendedGiftInfo || extras.extendedGiftInfo || null;
    const details = data.giftDetails || data.gift || null;
    return pickFirstImageUrl(
        data.giftPictureUrl,
        data.giftIcon,
        data.giftImage,
        details?.giftImage,
        details?.image,
        details?.icon,
        data.gift?.image,
        data.gift?.icon,
        data.gift?.gift_image,
        ext?.image,
        ext?.icon,
        ext?.thumbnail,
        ext?.gift_image,
        extras.giftIconUrl,
        extras.giftIcon
    );
}

/**
 * Resolve icon + diamonds from in-memory room gift catalog (by id then name).
 */
function lookupRoomGiftMeta(mapOrList, giftId, giftName) {
    const id = String(giftId || '').trim();
    const name = String(giftName || '').toLowerCase().trim();
    const map = mapOrList && !Array.isArray(mapOrList) ? mapOrList : null;
    const list = Array.isArray(mapOrList)
        ? mapOrList
        : (map ? Object.values(map) : []);

    if (map && id && map[id]) {
        const hit = map[id];
        return {
            giftIconUrl: hit.giftIconUrl || hit.giftIcon || extractGiftIconUrl(hit) || '',
            diamondCount: parseInt(hit.diamondCount || hit.diamond_count || hit.cost || 0, 10) || 0,
            giftName: hit.giftName || hit.name || giftName
        };
    }

    for (const g of list) {
        const gid = String(g.giftId || g.id || '').trim();
        const gname = String(g.giftName || g.name || '').toLowerCase().trim();
        if ((id && gid === id) || (name && gname === name)) {
            return {
                giftIconUrl: g.giftIconUrl || g.giftIcon || extractGiftIconUrl(g) || pickFirstImageUrl(g.image, g.icon) || '',
                diamondCount: parseInt(g.diamondCount || g.diamond_count || g.cost || 0, 10) || 0,
                giftName: g.giftName || g.name || giftName
            };
        }
    }
    return null;
}

function hashGiftName(giftName) {
    const name = String(giftName || '').trim();
    let id = 0;
    for (let i = 0; i < name.length; i++) {
        id = (id << 5) - id + name.charCodeAt(i);
        id |= 0;
    }
    return Math.abs(id);
}

/** Canonical TikTok gift ids — browser scrape hashes names, so map popular gifts back. */
const KNOWN_TIKTOK_GIFT_IDS = {
    'rose bouquet': 199,
    'ช่อกุหลาบ': 199,
    'heart me': 7934,
    heartme: 7934,
    rose: 5655,
    กุหลาบ: 5655,
    rosa: 5655,
    tiktok: 5269,
    perfume: 5650,
    lion: 5659,
    universe: 6771,
    galaxy: 6097,
    gg: 6064,
    'ice cream cone': 5827,
    'ice cream': 5827
};

/**
 * Prefer real TikTok gift ids for popular gifts (esp. Rose=5655).
 * Longer name keys win so "Rose Bouquet" does not become Rose.
 */
function resolveKnownGiftId(giftName, fallbackId = 0) {
    const name = String(giftName || '').toLowerCase().trim();
    if (!name) return fallbackId || 0;
    if (KNOWN_TIKTOK_GIFT_IDS[name] != null) return KNOWN_TIKTOK_GIFT_IDS[name];
    const keys = Object.keys(KNOWN_TIKTOK_GIFT_IDS).sort((a, b) => b.length - a.length);
    for (const k of keys) {
        if (name.includes(k)) return KNOWN_TIKTOK_GIFT_IDS[k];
    }
    return fallbackId || 0;
}

function normalizeGift(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const giftId = parseInt(raw.giftId ?? raw.id ?? raw.gift_id, 10);
    const giftName = String(raw.giftName ?? raw.name ?? raw.gift_name ?? '').trim();
    if (!giftId || !giftName) return null;

    let giftIcon = raw.giftIcon ?? raw.gift_icon ?? raw.icon ?? '';
    if (giftIcon && typeof giftIcon === 'object') {
        if (Array.isArray(giftIcon.url_list) && giftIcon.url_list.length > 0) {
            giftIcon = giftIcon.url_list[0];
        } else if (giftIcon.url) {
            giftIcon = giftIcon.url;
        } else {
            giftIcon = '';
        }
    }
    giftIcon = String(giftIcon || '');
    if (giftIcon.startsWith('//')) giftIcon = 'https:' + giftIcon;

    return {
        giftId,
        giftName,
        diamondCount: Math.max(1, parseInt(raw.diamondCount ?? raw.diamond_count ?? raw.cost ?? 1, 10) || 1),
        giftIcon,
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

function dedupeGifts(gifts) {
    const map = new Map();
    const iconIndex = new Map();

    for (const raw of gifts) {
        const gift = normalizeGift(raw);
        if (!gift) continue;

        const iconKey = extractGiftIconKey(gift.giftIcon);
        if (iconKey && iconIndex.has(iconKey)) {
            const existingId = iconIndex.get(iconKey);
            const existing = map.get(existingId);
            if (existing) {
                if ((!existing.giftIcon || existing.giftIcon.startsWith('data:')) && gift.giftIcon) {
                    existing.giftIcon = gift.giftIcon;
                }
                if (existing.diamondCount <= 1 && gift.diamondCount > 1) {
                    existing.diamondCount = gift.diamondCount;
                }
                continue;
            }
        }

        const existing = map.get(gift.giftId);
        if (!existing) {
            map.set(gift.giftId, gift);
            if (iconKey) iconIndex.set(iconKey, gift.giftId);
            continue;
        }
        if ((!existing.giftIcon || existing.giftIcon.startsWith('data:')) && gift.giftIcon) {
            existing.giftIcon = gift.giftIcon;
        }
        if (existing.diamondCount <= 1 && gift.diamondCount > 1) {
            existing.diamondCount = gift.diamondCount;
        }
        if (iconKey) iconIndex.set(iconKey, existing.giftId);
    }
    return Array.from(map.values());
}

async function findExistingGift(db, gift) {
    if (!gift) return null;

    if (gift.giftId) {
        const byId = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ?', [gift.giftId]);
        if (byId) return byId;
    }

    if (gift.giftName) {
        const byName = await db.get(
            'SELECT * FROM tiktok_gifts WHERE LOWER(TRIM(giftName)) = LOWER(TRIM(?))',
            [gift.giftName]
        );
        if (byName) return byName;
    }

    const iconKey = extractGiftIconKey(gift.giftIcon);
    if (iconKey) {
        const byIcon = await db.get(
            'SELECT * FROM tiktok_gifts WHERE giftIcon IS NOT NULL AND giftIcon != "" AND giftIcon LIKE ?',
            [`%${iconKey}%`]
        );
        if (byIcon) return byIcon;
    }

    return null;
}

async function mergeGiftIntoDb(db, rawGift, options = {}) {
    const gift = normalizeGift(rawGift);
    if (!gift) return { action: 'skip' };

    const existing = await findExistingGift(db, gift);
    const nowStr = gift.createdAt || new Date().toISOString();

    if (!existing) {
        await db.run(
            'INSERT INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
            [gift.giftId, gift.giftName, gift.diamondCount, gift.giftIcon, nowStr]
        );
        if (!options.skipPush) {
            pushGiftToShared(gift).catch(() => {});
        }
        return { action: 'insert', gift };
    }

    let needsUpdate = false;
    let newIcon = existing.giftIcon || '';
    let newCount = existing.diamondCount || 1;

    if (gift.diamondCount > 1 && (!existing.diamondCount || existing.diamondCount <= 1)) {
        newCount = gift.diamondCount;
        needsUpdate = true;
    }
    if (gift.giftIcon && (!existing.giftIcon || existing.giftIcon.startsWith('data:') || existing.giftIcon.includes('dicebear.com'))) {
        newIcon = gift.giftIcon;
        needsUpdate = true;
    }
    // Fill empty icon whenever a real URL arrives later
    if (gift.giftIcon && /^https?:\/\//i.test(gift.giftIcon) && !existing.giftIcon) {
        newIcon = gift.giftIcon;
        needsUpdate = true;
    }
    // Prefer CDN webcast icon over placeholder / broken relative paths
    if (
        gift.giftIcon &&
        /^https?:\/\//i.test(gift.giftIcon) &&
        existing.giftIcon &&
        !/^https?:\/\/p\d+-webcast\.tiktokcdn\.com/i.test(existing.giftIcon) &&
        /^https?:\/\/p\d+-webcast\.tiktokcdn\.com/i.test(gift.giftIcon)
    ) {
        newIcon = gift.giftIcon;
        needsUpdate = true;
    }

    const mergedGift = {
        giftId: existing.giftId,
        giftName: existing.giftName,
        diamondCount: newCount,
        giftIcon: newIcon || gift.giftIcon || existing.giftIcon
    };

    if (!needsUpdate) {
        return { action: 'noop', gift: mergedGift };
    }

    await db.run(
        'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
        [newCount, newIcon, existing.giftId]
    );

    if (!options.skipPush) {
        pushGiftToShared(mergedGift).catch(() => {});
    }
    return { action: 'update', gift: mergedGift };
}

async function upsertTikTokGift(db, rawGift, emitCtx = null) {
    const result = await mergeGiftIntoDb(db, rawGift);
    if ((result.action === 'insert' || result.action === 'update') && emitCtx && emitCtx.io && emitCtx.token && result.gift) {
        emitCtx.io.to(emitCtx.token).emit('new_gift_discovered', result.gift);
    }
    return result;
}

async function fetchSharedCatalog() {
    const merged = [];
    const seen = new Set();

    try {
        const remote = await fetchJson(getSharedGiftsUrl());
        const remoteList = Array.isArray(remote) ? remote : (remote?.gifts || remote?.list || []);
        for (const item of remoteList) {
            const gift = normalizeGift(item);
            if (gift && !seen.has(gift.giftId)) {
                seen.add(gift.giftId);
                merged.push(gift);
            }
        }
        console.log(`[GiftsSync] Remote catalog: ${merged.length} gifts`);
    } catch (err) {
        console.warn('[GiftsSync] Remote catalog unavailable:', err.message);
    }

    for (const item of loadBundledGifts()) {
        const gift = normalizeGift(item);
        if (gift && !seen.has(gift.giftId)) {
            seen.add(gift.giftId);
            merged.push(gift);
        }
    }

    return dedupeGifts(merged);
}

async function syncSharedGiftsToLocal(db) {
    const gifts = await fetchSharedCatalog();
    if (!gifts.length) {
        console.log('[GiftsSync] No shared gifts to import');
        return { inserted: 0, updated: 0, total: 0 };
    }

    let inserted = 0;
    let updated = 0;
    for (const gift of gifts) {
        const result = await mergeGiftIntoDb(db, gift, { skipPush: true });
        if (result.action === 'insert') inserted++;
        if (result.action === 'update') updated++;
    }

    console.log(`[GiftsSync] Import complete: +${inserted} new, ~${updated} updated (${gifts.length} in catalog)`);
    return { inserted, updated, total: gifts.length };
}

function pushGiftToShared(gift) {
    const pushUrl = getSharedPushUrl();
    if (!pushUrl) return Promise.resolve(false);

    const normalized = normalizeGift(gift);
    if (!normalized) return Promise.resolve(false);

    const body = { ...normalized };
    const syncKey = getSyncKey();
    if (syncKey) body.syncKey = syncKey;

    return postJson(pushUrl, body)
        .then(() => {
            console.log(`[GiftsSync] Pushed gift to shared catalog: ${normalized.giftName} (${normalized.giftId})`);
            return true;
        })
        .catch((err) => {
            console.warn('[GiftsSync] Push failed:', err.message);
            return false;
        });
}

module.exports = {
    syncSharedGiftsToLocal,
    upsertTikTokGift,
    mergeGiftIntoDb,
    findExistingGift,
    pushGiftToShared,
    normalizeGift,
    extractGiftIconKey,
    extractGiftIconUrl,
    pickFirstImageUrl,
    lookupRoomGiftMeta,
    hashGiftName,
    resolveKnownGiftId,
    KNOWN_TIKTOK_GIFT_IDS,
    fetchSharedCatalog
};
