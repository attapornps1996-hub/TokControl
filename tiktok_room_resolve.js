'use strict';

const https = require('https');
const http = require('http');

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function httpGet(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('http://') ? http : https;
        const req = lib.get(
            url,
            {
                headers: {
                    'User-Agent': UA,
                    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
                    Cookie: 'tt-target-idc=useast2a; store-country-code=th'
                },
                timeout: 15000
            },
            (res) => {
                const loc = res.headers.location;
                if (loc && res.statusCode >= 300 && res.statusCode < 400 && redirectsLeft > 0) {
                    const next = loc.startsWith('http') ? loc : new URL(loc, url).toString();
                    res.resume();
                    httpGet(next, redirectsLeft - 1).then(resolve, reject);
                    return;
                }
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode || 0,
                        body: Buffer.concat(chunks).toString('utf8')
                    });
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
    });
}

function extractRoomIdFromHtml(body) {
    if (!body) return null;
    const patterns = [
        /"roomId"\s*:\s*"(\d{8,})"/,
        /"roomId"\s*:\s*(\d{8,})/,
        /"room_id"\s*:\s*"(\d{8,})"/,
        /"room_id"\s*:\s*(\d{8,})/,
        /room_id=(\d{8,})/
    ];
    for (const re of patterns) {
        const m = body.match(re);
        if (m?.[1]) return m[1];
    }
    return null;
}

function extractLiveStatusFromHtml(body) {
    // TikTok liveRoom status: 2 = live (common)
    const m = body && body.match(/"status"\s*:\s*(\d+)/);
    return m ? Number(m[1]) : null;
}

/**
 * Resolve TikTok webcast roomId without relying solely on Euler/sign fallbacks.
 * Mirrors what older TokControl effectively needed: a real room id before WS connect.
 */
async function resolveTikTokRoomId(username) {
    const uniqueId = String(username || '')
        .trim()
        .replace(/^@+/, '')
        .replace(/^https?:\/\/(www\.)?tiktok\.com\/@+/i, '')
        .replace(/\/live\/?$/i, '')
        .replace(/[/?#].*$/, '')
        .trim();
    if (!uniqueId) {
        return { ok: false, error: 'empty_username' };
    }

    // 1) Official-ish JSON endpoint used by older scrapers
    try {
        const apiUrl =
            'https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=' +
            encodeURIComponent(uniqueId);
        const api = await httpGet(apiUrl);
        if (api.status === 200 && api.body) {
            const json = JSON.parse(api.body);
            const msg = String(json?.message || '');
            if (msg === 'user_not_found' || Number(json?.statusCode) === 19881007) {
                // continue to HTML — sometimes API is region-blocked while HTML still works
            } else {
                const liveRoom = json?.data?.liveRoom || json?.data?.live_room || null;
                const roomId =
                    String(
                        liveRoom?.roomId ||
                            liveRoom?.roomID ||
                            liveRoom?.room_id ||
                            json?.data?.user?.roomId ||
                            json?.data?.roomId ||
                            ''
                    ) || '';
                const status = Number(liveRoom?.status ?? liveRoom?.liveRoomStatus ?? 0);
                if (/^\d{8,}$/.test(roomId)) {
                    return {
                        ok: true,
                        roomId,
                        uniqueId,
                        source: 'api-live',
                        isLive: status === 2 || status === 4 || !status,
                        rawStatus: status || null
                    };
                }
            }
        }
    } catch (err) {
        // fall through
    }

    // 2) HTML /live page (works when JSON is blocked / WAF'd)
    try {
        const live = await httpGet(`https://www.tiktok.com/@${encodeURIComponent(uniqueId)}/live`);
        const roomId = extractRoomIdFromHtml(live.body);
        const status = extractLiveStatusFromHtml(live.body);
        if (roomId) {
            return {
                ok: true,
                roomId,
                uniqueId,
                source: 'html-live',
                isLive: status == null ? true : status === 2 || status === 4,
                rawStatus: status
            };
        }
    } catch (err) {
        // fall through
    }

    // 3) Profile page sometimes still embeds last room id
    try {
        const profile = await httpGet(`https://www.tiktok.com/@${encodeURIComponent(uniqueId)}`);
        const roomId = extractRoomIdFromHtml(profile.body);
        if (roomId) {
            return {
                ok: true,
                roomId,
                uniqueId,
                source: 'html-profile',
                isLive: false,
                rawStatus: null
            };
        }
        if (/user_not_found|"statusCode":10221|Couldn't find this account/i.test(profile.body || '')) {
            return { ok: false, uniqueId, error: 'user_not_found' };
        }
    } catch (err) {
        // fall through
    }

    return { ok: false, uniqueId, error: 'room_id_not_found' };
}

module.exports = {
    resolveTikTokRoomId,
    extractRoomIdFromHtml
};
