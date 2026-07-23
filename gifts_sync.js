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
    for (const raw of gifts) {
        const gift = normalizeGift(raw);
        if (!gift) continue;
        const existing = map.get(gift.giftId);
        if (!existing) {
            map.set(gift.giftId, gift);
            continue;
        }
        if ((!existing.giftIcon || existing.giftIcon.startsWith('data:')) && gift.giftIcon) {
            existing.giftIcon = gift.giftIcon;
        }
        if (existing.diamondCount <= 1 && gift.diamondCount > 1) {
            existing.diamondCount = gift.diamondCount;
        }
    }
    return Array.from(map.values());
}

async function mergeGiftIntoDb(db, rawGift, options = {}) {
    const gift = normalizeGift(rawGift);
    if (!gift) return { action: 'skip' };

    const existing = await db.get(
        'SELECT * FROM tiktok_gifts WHERE giftId = ? OR LOWER(giftName) = LOWER(?)',
        [gift.giftId, gift.giftName]
    );
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
    if (gift.giftIcon && (!existing.giftIcon || existing.giftIcon.startsWith('data:'))) {
        newIcon = gift.giftIcon;
        needsUpdate = true;
    }

    if (!needsUpdate) {
        return { action: 'noop', gift: { ...gift, giftId: existing.giftId, giftName: existing.giftName, diamondCount: existing.diamondCount, giftIcon: existing.giftIcon } };
    }

    await db.run(
        'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
        [newCount, newIcon, existing.giftId]
    );

    const updatedGift = {
        giftId: existing.giftId,
        giftName: existing.giftName,
        diamondCount: newCount,
        giftIcon: newIcon
    };
    if (!options.skipPush) {
        pushGiftToShared(updatedGift).catch(() => {});
    }
    return { action: 'update', gift: updatedGift };
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
    pushGiftToShared,
    normalizeGift,
    fetchSharedCatalog
};
