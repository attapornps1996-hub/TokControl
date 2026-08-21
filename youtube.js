'use strict';

const https = require('https');

function hasApiKey() {
    return !!(process.env.YOUTUBE_API_KEY || '').trim();
}

function isConfigured() {
    return hasApiKey();
}

function extractVideoId(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    try {
        const u = new URL(raw);
        const host = (u.hostname || '').replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0];
            return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
        }
        if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            const v = u.searchParams.get('v');
            if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v') {
                const id = parts[1];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
            }
        }
    } catch (_) { /* not a URL */ }
    return null;
}

function taggedError(message, extra = {}) {
    const err = new Error(message);
    Object.assign(err, extra);
    return err;
}

function parseYoutubeError(status, body) {
    let reason = '';
    let message = '';
    try {
        const parsed = JSON.parse(body || '{}');
        const err = parsed.error || {};
        message = err.message || '';
        reason = (err.errors && err.errors[0] && err.errors[0].reason) || err.status || '';
    } catch (_) { /* ignore */ }
    const blob = `${reason} ${message}`;
    const extra = { youtubeStatus: status, youtubeReason: reason || '' };
    if (/quotaExceeded/i.test(blob)) {
        return taggedError('โควต้า YouTube Data API เต็มแล้ว ลองใหม่ภายหลัง', extra);
    }
    if (/^(liveChatEnded|liveChatNotFound)$/i.test(reason)) {
        return taggedError('liveChatEnded', extra);
    }
    if (/keyInvalid|accessNotConfigured/i.test(blob)) {
        return taggedError('YouTube API key ไม่ถูกต้องหรือยังไม่เปิด YouTube Data API v3', extra);
    }
    if (/handleNotFound|channelNotFound/i.test(reason)) {
        return taggedError('ไม่พบช่อง YouTube นี้ ตรวจ Channel ID / @handle อีกครั้ง', extra);
    }
    if (status === 404 || /^(notFound|liveChatNotFound|liveChatEnded)$/i.test(reason)) {
        return taggedError('ไม่พบห้องไลฟ์ หรือยังไม่ได้เปิดไลฟ์สด', {
            ...extra,
            youtubeStatus: status || 404,
            youtubeNotLive: true
        });
    }
    return taggedError(message || `YouTube API error ${status}${reason ? ` (${reason})` : ''}`, extra);
}

function isYoutubeNotLiveError(err) {
    if (!err) return false;
    if (err.youtubeNotLive) return true;
    const status = Number(err.youtubeStatus) || 0;
    const reason = String(err.youtubeReason || '');
    const msg = String(err.message || '');
    if (status === 404) return true;
    if (/^(liveChatEnded|liveChatNotFound|notFound)$/i.test(reason)) return true;
    if (/^liveChatEnded$/i.test(msg)) return true;
    if (/YouTube API error 404/i.test(msg)) return true;
    if (/ไม่พบห้องไลฟ์/i.test(msg)) return true;
    return false;
}

const YT_WAITING_LIVE_MSG = 'ไม่พบห้องไลฟ์ หรือยังไม่ได้เปิดไลฟ์สด';

function httpsJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(parseYoutubeError(res.statusCode, body));
                    return;
                }
                try {
                    resolve(JSON.parse(body || '{}'));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

const YT_PAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
    Cookie: 'CONSENT=YES+; SOCS=CAISNQgDEitibS1hZy1sZXZlbDEuR1VBR19QUk9EVUNUX1YxNxITEuABGAE'
};

function httpsGetFollow(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: YT_PAGE_HEADERS }, (res) => {
            const loc = res.headers.location;
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc && maxRedirects > 0) {
                const next = new URL(loc, url).toString();
                res.resume();
                httpsGetFollow(next, maxRedirects - 1).then(resolve, reject);
                return;
            }
            let body = '';
            res.on('data', (c) => {
                if (body.length < 2500000) body += c;
            });
            res.on('end', () => resolve({
                status: res.statusCode || 0,
                body,
                finalUrl: url
            }));
        });
        req.on('error', reject);
        req.setTimeout(12000, () => {
            req.destroy();
            reject(new Error('YouTube page timeout'));
        });
    });
}

function extractChannelIdFromHtml(html) {
    const text = String(html || '');
    const patterns = [
        /<meta\s+itemprop="channelId"\s+content="(UC[\w-]{22})"/i,
        /"channelId":"(UC[\w-]{22})"/,
        /"externalId":"(UC[\w-]{22})"/,
        /\/channel\/(UC[\w-]{22})/
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) return m[1];
    }
    return '';
}

function extractVideoIdFromHtml(html) {
    const text = String(html || '');
    const patterns = [
        /<link\s+rel="canonical"\s+href="[^"]*watch\?v=([a-zA-Z0-9_-]{11})"/i,
        /"videoId":"([a-zA-Z0-9_-]{11})"/,
        /watch\?v=([a-zA-Z0-9_-]{11})/
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[1]) return m[1];
    }
    return '';
}

function httpsPostJson(hostname, path, payload, headers = {}) {
    const body = JSON.stringify(payload || {});
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`YouTube search error ${res.statusCode}: ${data.slice(0, 200)}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data || '{}'));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function parseIsoDurationMs(iso) {
    const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
    if (!m) return 0;
    const h = parseInt(m[1] || '0', 10);
    const min = parseInt(m[2] || '0', 10);
    const s = parseInt(m[3] || '0', 10);
    return ((h * 3600) + (min * 60) + s) * 1000;
}

function normalizeYoutubeTrack(item, extra = {}) {
    if (!item && !extra.videoId) return null;
    const id = item?.id?.videoId || item?.id || extra.videoId;
    if (!id) return null;
    const sn = item?.snippet || {};
    const cd = item?.contentDetails || {};
    const durationMs = extra.durationMs != null
        ? extra.durationMs
        : parseIsoDurationMs(cd.duration);
    return {
        id: String(id),
        videoId: String(id),
        uri: `youtube:${id}`,
        provider: 'youtube',
        name: sn.title || extra.name || 'YouTube Video',
        artist: sn.channelTitle || extra.artist || 'YouTube',
        albumArt: sn.thumbnails?.high?.url
            || sn.thumbnails?.medium?.url
            || sn.thumbnails?.default?.url
            || extra.albumArt
            || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        durationMs: durationMs || 0,
        requester: extra.requester || null
    };
}

async function fetchOEmbed(videoId) {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const data = await httpsJson(url);
    return normalizeYoutubeTrack(null, {
        videoId,
        name: data.title || 'YouTube Video',
        artist: data.author_name || 'YouTube',
        albumArt: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationMs: 0
    });
}

async function fetchVideoDetails(ids) {
    const key = (process.env.YOUTUBE_API_KEY || '').trim();
    if (!key || !ids.length) return {};
    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.map(encodeURIComponent).join(',')}&key=${encodeURIComponent(key)}`;
    const data = await httpsJson(url);
    const map = {};
    (data.items || []).forEach((item) => {
        const t = normalizeYoutubeTrack(item);
        if (t) map[t.videoId] = t;
    });
    return map;
}

function walkCollectVideoRenderers(node, out, limit) {
    if (!node || out.length >= limit) return;
    if (Array.isArray(node)) {
        node.forEach((n) => walkCollectVideoRenderers(n, out, limit));
        return;
    }
    if (typeof node !== 'object') return;
    if (node.videoRenderer?.videoId) {
        const vr = node.videoRenderer;
        out.push({
            videoId: vr.videoId,
            name: (vr.title?.runs || []).map((r) => r.text).join('') || vr.title?.simpleText || 'YouTube Video',
            artist: (vr.ownerText?.runs || []).map((r) => r.text).join('') || 'YouTube',
            albumArt: vr.thumbnail?.thumbnails?.slice(-1)?.[0]?.url
                || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
            durationMs: 0
        });
        return;
    }
    Object.keys(node).forEach((k) => walkCollectVideoRenderers(node[k], out, limit));
}

async function searchViaInnertube(query, limit = 8) {
    const data = await httpsPostJson('www.youtube.com', '/youtubei/v1/search?prettyPrint=false', {
        context: {
            client: {
                clientName: 'WEB',
                clientVersion: '2.20240101.00.00',
                hl: 'th',
                gl: 'TH'
            }
        },
        query: String(query || '').trim()
    });
    const found = [];
    walkCollectVideoRenderers(data, found, Math.max(limit * 2, 16));
    const uniq = [];
    const seen = new Set();
    for (const item of found) {
        if (!item?.videoId || seen.has(item.videoId)) continue;
        seen.add(item.videoId);
        uniq.push(normalizeYoutubeTrack(null, item));
        if (uniq.length >= limit) break;
    }
    return uniq.filter(Boolean);
}

async function resolveByUrlOrId(input, requester) {
    const videoId = extractVideoId(input);
    if (!videoId) return null;
    try {
        if (isConfigured()) {
            const details = await fetchVideoDetails([videoId]);
            if (details[videoId]) {
                return { ...details[videoId], requester: requester || null };
            }
        }
        const track = await fetchOEmbed(videoId);
        if (track) track.requester = requester || null;
        return track;
    } catch (e) {
        return {
            id: videoId,
            videoId,
            uri: `youtube:${videoId}`,
            provider: 'youtube',
            name: 'YouTube Video',
            artist: 'YouTube',
            albumArt: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            durationMs: 0,
            requester: requester || null
        };
    }
}

async function searchVideos(query, limit = 8) {
    const q = String(query || '').trim();
    if (!q) return [];

    const byUrl = await resolveByUrlOrId(q);
    if (byUrl) return [byUrl];

    const key = (process.env.YOUTUBE_API_KEY || '').trim();
    if (key) {
        try {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${Math.min(Math.max(limit, 1), 15)}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
            const data = await httpsJson(searchUrl);
            const ids = (data.items || []).map((it) => it.id?.videoId).filter(Boolean);
            const details = await fetchVideoDetails(ids);
            const tracks = ids.map((id) => {
                if (details[id]) return details[id];
                const snItem = (data.items || []).find((it) => it.id?.videoId === id);
                return normalizeYoutubeTrack(snItem);
            }).filter(Boolean);
            if (tracks.length) return tracks;
        } catch (e) {
            console.warn('[youtube] Data API search failed, fallback Innertube:', e.message);
        }
    }

    const fallback = await searchViaInnertube(q, limit);
    if (!fallback.length) {
        throw new Error('ไม่พบวิดีโอบน YouTube สำหรับคำค้นนี้');
    }
    return fallback;
}

function getApiKey() {
    return String(process.env.YOUTUBE_API_KEY || '').trim();
}

async function youtubeApi(pathname, params = {}) {
    const key = getApiKey();
    if (!key) throw new Error('ยังไม่ได้ตั้ง YOUTUBE_API_KEY ใน .env');
    const usp = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
        const v = params[k];
        if (v == null || v === '') return;
        usp.set(k, String(v));
    });
    usp.set('key', key);
    const url = `https://www.googleapis.com/youtube/v3/${pathname}?${usp.toString()}`;
    const safeParams = { ...params };
    try {
        return await httpsJson(url);
    } catch (err) {
        const msg = String(err.message || err);
        console.warn('[youtube] API error', pathname, safeParams, {
            status: err.youtubeStatus || '',
            reason: err.youtubeReason || '',
            message: msg
        });
        if (/quota/i.test(msg)) throw taggedError('โควต้า YouTube Data API เต็มแล้ว ลองใหม่ภายหลัง', err);
        if (/liveChatEnded|ไม่พบช่อง/i.test(msg)) throw err;
        if (err.youtubeStatus === 401 || err.youtubeReason === 'keyInvalid') {
            throw taggedError('YouTube API key ไม่ถูกต้องหรือยังไม่เปิด YouTube Data API v3', err);
        }
        const notLiveCall = /^(search|videos|liveChatMessages|playlistItems)$/.test(pathname);
        if (notLiveCall && isYoutubeNotLiveError(err)) {
            throw taggedError('ไม่พบห้องไลฟ์ หรือยังไม่ได้เปิดไลฟ์สด', {
                youtubeStatus: err.youtubeStatus || 404,
                youtubeReason: err.youtubeReason || 'notFound',
                youtubeNotLive: true
            });
        }
        throw err;
    }
}

function parseChannelIdentifier(input) {
    const raw = String(input || '').trim();
    if (!raw) return { kind: 'empty' };
    try {
        const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
        const host = (u.hostname || '').replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'channel' && parts[1]) return { kind: 'id', value: parts[1] };
            if (parts[0] && parts[0].startsWith('@')) return { kind: 'handle', value: parts[0] };
            if (parts[0] === 'c' && parts[1]) return { kind: 'handle', value: parts[1] };
            if (parts[0] === 'user' && parts[1]) return { kind: 'handle', value: parts[1] };
            if (parts[0] === 'live' && parts[1] && /^UC[\w-]{22}$/.test(parts[1])) return { kind: 'id', value: parts[1] };
        }
    } catch (_) { /* not a URL */ }
    if (/^UC[\w-]{22}$/.test(raw)) return { kind: 'id', value: raw };
    const handle = raw.startsWith('@') ? raw : `@${raw.replace(/^@+/, '')}`;
    return { kind: 'handle', value: handle };
}

function channelFromItem(item, fallbackHandle) {
    const sn = item?.snippet || {};
    return {
        channelId: item.id,
        title: sn.title || '',
        customUrl: sn.customUrl || fallbackHandle || '',
        thumbnail: sn.thumbnails?.default?.url || sn.thumbnails?.medium?.url || ''
    };
}

async function resolveHandleViaPage(handle) {
    const url = `https://www.youtube.com/${handle.startsWith('@') ? handle : `@${handle}`}`;
    console.log('[youtube] resolve handle via page', url);
    const page = await httpsGetFollow(url);
    const channelId = extractChannelIdFromHtml(page.body);
    if (!channelId) {
        console.warn('[youtube] handle page had no channelId', { status: page.status, finalUrl: page.finalUrl });
        return null;
    }
    const titleMatch = String(page.body || '').match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    console.log('[youtube] resolved handle via page', { handle, channelId });
    return {
        channelId,
        title: titleMatch ? titleMatch[1] : '',
        customUrl: handle,
        thumbnail: ''
    };
}

async function resolveChannel(identifier) {
    const parsed = parseChannelIdentifier(identifier);
    if (parsed.kind === 'empty') throw new Error('กรุณากรอก Channel ID หรือ @handle');
    console.log('[youtube] resolveChannel', { input: identifier, kind: parsed.kind, value: parsed.value });

    if (parsed.kind === 'id') {
        if (hasApiKey()) {
            try {
                const data = await youtubeApi('channels', { part: 'id,snippet', id: parsed.value });
                const item = (data.items || [])[0];
                if (item?.id) return channelFromItem(item, parsed.value);
            } catch (err) {
                console.warn('[youtube] channels.list by id failed — using Channel ID directly', err.message);
            }
        }
        return { channelId: parsed.value, title: '', customUrl: '', thumbnail: '' };
    }

    const withAt = parsed.value.startsWith('@') ? parsed.value : `@${parsed.value}`;
    const withoutAt = withAt.replace(/^@/, '');
    if (hasApiKey()) {
        const attempts = [
            { forHandle: withAt },
            { forHandle: withoutAt }
        ];
        for (const params of attempts) {
            try {
                console.log('[youtube] channels.list forHandle', params.forHandle);
                const data = await youtubeApi('channels', { part: 'id,snippet', forHandle: params.forHandle });
                const item = (data.items || [])[0];
                console.log('[youtube] channels.list result', {
                    forHandle: params.forHandle,
                    count: (data.items || []).length,
                    channelId: item?.id || '',
                    title: item?.snippet?.title || ''
                });
                if (item?.id) return channelFromItem(item, withAt);
            } catch (err) {
                console.warn('[youtube] forHandle failed', params.forHandle, err.message, err.youtubeReason || '');
            }
        }
    }

    try {
        const pageCh = await resolveHandleViaPage(withAt);
        if (pageCh?.channelId) {
            if (hasApiKey()) {
                try {
                    const data = await youtubeApi('channels', { part: 'id,snippet', id: pageCh.channelId });
                    const item = (data.items || [])[0];
                    if (item?.id) return channelFromItem(item, withAt);
                } catch (_) { /* use scraped ids */ }
            }
            return pageCh;
        }
    } catch (err) {
        console.warn('[youtube] handle page fallback failed', err.message);
    }

    throw new Error('ไม่พบช่อง YouTube นี้ ตรวจ Channel ID / @handle อีกครั้ง');
}

function liveHitFromVideoItem(item) {
    if (!item?.id) return null;
    const sn = item.snippet || {};
    const live = item.liveStreamingDetails || {};
    const liveChatId = String(live.activeLiveChatId || '').trim();
    const broadcast = sn.liveBroadcastContent || '';
    const isLive = broadcast === 'live' || !!liveChatId;
    if (!isLive) return null;
    return {
        videoId: String(item.id),
        title: sn.title || '',
        channelTitle: sn.channelTitle || '',
        liveChatId,
        concurrentViewers: Number(live.concurrentViewers || 0) || 0,
        liveBroadcastContent: broadcast
    };
}

async function videosLiveDetailsByIds(videoIds) {
    const ids = [...new Set((videoIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const data = await youtubeApi('videos', {
        part: 'liveStreamingDetails,snippet,statistics',
        id: ids.join(',')
    });
    return data.items || [];
}

async function findLiveFromSearch(channelId) {
    const data = await youtubeApi('search', {
        part: 'id,snippet',
        channelId,
        eventType: 'live',
        type: 'video',
        maxResults: 5,
        order: 'date'
    });
    const items = data.items || [];
    const videoIds = items.map((it) => it.id?.videoId).filter(Boolean);
    console.log('[youtube] search.list live', {
        channelId,
        results: items.length,
        pageInfo: data.pageInfo || null,
        videoIds,
        titles: items.map((it) => it.snippet?.title || '')
    });
    if (!videoIds.length) return null;

    const detailsItems = await videosLiveDetailsByIds(videoIds);
    let liveWithoutChat = null;
    for (const item of detailsItems) {
        const hit = liveHitFromVideoItem(item);
        if (!hit) continue;
        if (hit.liveChatId) {
            console.log('[youtube] search.list → videos.list activeLiveChatId', {
                videoId: hit.videoId,
                liveChatId: hit.liveChatId,
                title: hit.title
            });
            return { ...hit, source: 'search.list' };
        }
        if (!liveWithoutChat) liveWithoutChat = { ...hit, source: 'search.list' };
    }
    if (liveWithoutChat) {
        console.warn('[youtube] live video has no activeLiveChatId (chat off / 24-7 / restricted)', {
            videoId: liveWithoutChat.videoId,
            title: liveWithoutChat.title,
            liveBroadcastContent: liveWithoutChat.liveBroadcastContent || ''
        });
        return liveWithoutChat;
    }
    console.log('[youtube] search.list videos are not currently live', { channelId, videoIds });
    return null;
}

async function findLiveFromRecentUploads(channelId) {
    const ch = await youtubeApi('channels', { part: 'contentDetails', id: channelId });
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) {
        console.log('[youtube] no uploads playlist for', channelId);
        return null;
    }
    const pl = await youtubeApi('playlistItems', {
        part: 'contentDetails',
        playlistId: uploads,
        maxResults: 10
    });
    const ids = (pl.items || []).map((it) => it.contentDetails?.videoId).filter(Boolean);
    if (!ids.length) return null;
    const vids = await youtubeApi('videos', {
        part: 'liveStreamingDetails,snippet',
        id: ids.join(',')
    });
    for (const item of vids.items || []) {
        const hit = liveHitFromVideoItem(item);
        if (hit) {
            console.log('[youtube] live from recent uploads', hit.videoId, hit.title);
            return { ...hit, source: 'uploads' };
        }
    }
    console.log('[youtube] recent uploads have no live video', { channelId, checked: ids.length });
    return null;
}

async function findLiveFromChannelPage(channelId, handle) {
    const urls = [
        channelId ? `https://www.youtube.com/channel/${channelId}/live` : '',
        handle ? `https://www.youtube.com/${String(handle).startsWith('@') ? handle : `@${handle}`}/live` : ''
    ].filter(Boolean);
    for (const url of urls) {
        try {
            console.log('[youtube] checking live page', url);
            const page = await httpsGetFollow(url);
            const videoId = extractVideoId(page.finalUrl) || extractVideoIdFromHtml(page.body);
            console.log('[youtube] live page result', {
                url,
                status: page.status,
                finalUrl: page.finalUrl,
                videoId: videoId || ''
            });
            if (!videoId) continue;
            const details = await getLiveStreamingDetails(videoId);
            if (details && (details.isLive || details.liveChatId)) {
                return {
                    videoId,
                    title: details.title || '',
                    channelTitle: details.channelTitle || '',
                    liveChatId: details.liveChatId || '',
                    source: 'channel-page'
                };
            }
            if (videoId && details && details.isLive === false && details.liveBroadcastContent === 'none') {
                continue;
            }
            if (videoId) {
                return {
                    videoId,
                    title: (details && details.title) || '',
                    channelTitle: (details && details.channelTitle) || '',
                    liveChatId: (details && details.liveChatId) || '',
                    source: 'channel-page'
                };
            }
        } catch (err) {
            console.warn('[youtube] live page failed', url, err.message);
        }
    }
    return null;
}

async function findActiveLiveVideo(channelId, opts = {}) {
    const cid = String(channelId || '').trim();
    if (!cid) return null;
    console.log('[youtube] findActiveLiveVideo', {
        channelId: cid,
        handle: opts.handle || '',
        hasApiKey: hasApiKey()
    });

    let searchHit = null;
    if (hasApiKey()) {
        try {
            searchHit = await findLiveFromSearch(cid);
            if (searchHit?.liveChatId) return searchHit;
        } catch (err) {
            console.warn('[youtube] search.list live failed', {
                channelId: cid,
                status: err.youtubeStatus || '',
                reason: err.youtubeReason || '',
                message: err.message
            });
            if (/โควต้า|quota/i.test(String(err.message || ''))) {
                console.warn('[youtube] search.list quota hit — falling back to uploads / live page');
            }
        }

        try {
            const fromUploads = await findLiveFromRecentUploads(cid);
            if (fromUploads?.liveChatId) return fromUploads;
            if (!searchHit && fromUploads?.videoId) searchHit = fromUploads;
        } catch (err) {
            console.warn('[youtube] uploads live fallback failed', err.message);
        }
    }

    try {
        const fromPage = await findLiveFromChannelPage(cid, opts.handle || '');
        if (fromPage?.liveChatId) return fromPage;
        if (!searchHit && fromPage?.videoId) searchHit = fromPage;
    } catch (err) {
        console.warn('[youtube] channel live page fallback failed', err.message);
    }

    if (searchHit?.videoId) {
        console.warn('[youtube] using live video without activeLiveChatId', {
            videoId: searchHit.videoId,
            source: searchHit.source || ''
        });
        return searchHit;
    }

    console.log('[youtube] no active live stream', cid);
    return null;
}

async function scrapeLiveFromWatchPage(videoId) {
    const id = String(videoId || '').trim();
    if (!id) return null;
    const page = await httpsGetFollow(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`);
    const body = String(page.body || '');
    const player = extractJsonObject(body, 'ytInitialPlayerResponse') || {};
    const initial = extractJsonObject(body, 'ytInitialData') || {};
    const vd = player.videoDetails || {};
    const micro = player.microformat?.playerMicroformatRenderer || {};
    const liveNow = micro.liveBroadcastDetails || {};
    const titleMatch = body.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const chat = pickContinuation(initial);
    const isLive = vd.isLive === true
        || vd.isLiveContent === true
        || liveNow.isLiveNow === true
        || /"isLiveNow"\s*:\s*true/.test(body)
        || !!chat.continuation;
    const title = vd.title
        || (titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : '');
    console.log('[youtube] watch page live scrape', {
        videoId: id,
        title,
        isLive,
        hasChatContinuation: !!chat.continuation
    });
    return {
        videoId: String(vd.videoId || id),
        title,
        channelTitle: vd.author || micro.ownerChannelName || '',
        liveChatId: '',
        concurrentViewers: Number(vd.viewCount || 0) || 0,
        actualStartTime: liveNow.startTimestamp || null,
        liveBroadcastContent: isLive ? 'live' : 'none',
        isLive,
        source: 'watch-page'
    };
}

async function getLiveStreamingDetails(videoId) {
    if (hasApiKey()) {
        try {
            const data = await youtubeApi('videos', {
                part: 'liveStreamingDetails,snippet,statistics',
                id: videoId
            });
            const item = (data.items || [])[0];
            if (!item) return null;
            const live = item.liveStreamingDetails || {};
            const sn = item.snippet || {};
            const liveChatId = String(live.activeLiveChatId || '').trim();
            const isLive = sn.liveBroadcastContent === 'live' || !!liveChatId;
            console.log('[youtube] videos.list liveStreamingDetails', {
                videoId,
                title: sn.title || '',
                liveBroadcastContent: sn.liveBroadcastContent || '',
                liveChatId,
                hasChat: !!liveChatId,
                isLive
            });
            return {
                videoId: String(item.id || videoId),
                title: sn.title || '',
                channelTitle: sn.channelTitle || '',
                liveChatId,
                concurrentViewers: Number(live.concurrentViewers || item.statistics?.viewCount || 0) || 0,
                actualStartTime: live.actualStartTime || null,
                liveBroadcastContent: sn.liveBroadcastContent || '',
                isLive
            };
        } catch (err) {
            if (isYoutubeNotLiveError(err)) {
                console.warn('[youtube] videos.list not live / 404', videoId, err.message);
                return null;
            }
            console.warn('[youtube] videos.list failed — scraping watch page', err.message);
        }
    }
    try {
        return await scrapeLiveFromWatchPage(videoId);
    } catch (err) {
        console.warn('[youtube] watch page scrape failed', videoId, err.message);
        return null;
    }
}

function extractJsonObject(html, marker) {
    const idx = String(html || '').indexOf(marker);
    if (idx < 0) return null;
    const start = html.indexOf('{', idx);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(start, i + 1));
                } catch (_) {
                    return null;
                }
            }
        }
    }
    return null;
}

function pickContinuation(node, out = { continuation: '', timeoutMs: 5000 }) {
    if (!node || out.found) return out;
    if (Array.isArray(node)) {
        node.forEach((n) => pickContinuation(n, out));
        return out;
    }
    if (typeof node !== 'object') return out;
    if (Array.isArray(node.continuations) && node.continuations[0]) {
        const x = node.continuations[0];
        const data = x.timedContinuationData || x.invalidationContinuationData || x.reloadContinuationData || {};
        if (data.continuation) {
            out.continuation = data.continuation;
            out.timeoutMs = Number(data.timeoutMs) || 5000;
            out.found = true;
            return out;
        }
    }
    Object.values(node).forEach((v) => pickContinuation(v, out));
    return out;
}

function runsText(runs) {
    return (runs || []).map((r) => r.text || '').join('');
}

function innertubeRendererToItem(key, renderer) {
    if (!renderer) return null;
    const authorDetails = {
        channelId: renderer.authorExternalChannelId || '',
        displayName: renderer.authorName?.simpleText || runsText(renderer.authorName?.runs) || 'youtube',
        profileImageUrl: renderer.authorPhoto?.thumbnails?.slice(-1)?.[0]?.url || '',
        isChatSponsor: JSON.stringify(renderer.authorBadges || []).toLowerCase().includes('member'),
        isChatModerator: JSON.stringify(renderer.authorBadges || []).toLowerCase().includes('moderator')
    };
    const publishedAt = renderer.timestampUsec
        ? new Date(Number(renderer.timestampUsec) / 1000).toISOString()
        : new Date().toISOString();
    const text = runsText(renderer.message?.runs)
        || renderer.headerPrimaryText?.simpleText
        || runsText(renderer.headerSubtext?.runs)
        || '';

    if (key === 'liveChatTextMessageRenderer') {
        return {
            snippet: {
                type: 'textMessageEvent',
                displayMessage: text,
                publishedAt,
                textMessageDetails: { messageText: text }
            },
            authorDetails
        };
    }
    if (key === 'liveChatPaidMessageRenderer' || key === 'liveChatPaidStickerRenderer') {
        const amountText = renderer.purchaseAmountText?.simpleText || '';
        const amount = parseFloat(String(amountText).replace(/[^\d.]/g, '')) || 0;
        return {
            snippet: {
                type: key === 'liveChatPaidStickerRenderer' ? 'superStickerEvent' : 'superChatEvent',
                displayMessage: text || amountText,
                publishedAt,
                superChatDetails: {
                    amountDisplayString: amountText,
                    amountMicros: Math.round(amount * 1e6),
                    currency: ''
                }
            },
            authorDetails
        };
    }
    if (
        key === 'liveChatMembershipItemRenderer'
        || key === 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer'
        || key === 'liveChatSponsorshipsGiftReceivedAnnouncementRenderer'
    ) {
        return {
            snippet: {
                type: 'newSponsorEvent',
                displayMessage: text,
                publishedAt
            },
            authorDetails
        };
    }
    return null;
}

async function getInnertubeChatContinuation(videoId) {
    const page = await httpsGetFollow(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
    const data = extractJsonObject(page.body, 'ytInitialData');
    const picked = pickContinuation(data);
    if (!picked.continuation) {
        console.warn('[youtube] innertube watch page has no live chat continuation', {
            videoId,
            status: page.status
        });
    } else {
        console.log('[youtube] innertube chat continuation ready', { videoId, timeoutMs: picked.timeoutMs });
    }
    return picked;
}

async function listLiveChatViaInnertube(videoId, continuation) {
    let token = String(continuation || '').trim();
    if (!token) {
        const first = await getInnertubeChatContinuation(videoId);
        token = first.continuation;
        if (!token) {
            return {
                items: [],
                unavailable: true,
                reason: 'innertube-no-continuation',
                pollingIntervalMillis: 8000,
                source: 'innertube'
            };
        }
    }
    const data = await httpsPostJson('www.youtube.com', '/youtubei/v1/live_chat/get_live_chat?prettyPrint=false', {
        context: {
            client: {
                clientName: 'WEB',
                clientVersion: '2.20240101.00.00',
                hl: 'th',
                gl: 'TH'
            }
        },
        continuation: token
    }, {
        Origin: 'https://www.youtube.com',
        Referer: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    });
    const live = data.continuationContents?.liveChatContinuation || {};
    const actions = live.actions || [];
    const items = [];
    actions.forEach((action) => {
        const rendererMap = action.addChatItemAction?.item || {};
        const key = Object.keys(rendererMap)[0];
        const item = innertubeRendererToItem(key, rendererMap[key]);
        if (item) items.push(item);
    });
    const next = pickContinuation(live);
    console.log('[youtube] innertube live chat', {
        videoId,
        actions: actions.length,
        mapped: items.length,
        timeoutMs: next.timeoutMs
    });
    return {
        items,
        nextPageToken: '',
        continuation: next.continuation || token,
        pollingIntervalMillis: Math.max(4000, next.timeoutMs || 5000),
        offlineAt: null,
        unavailable: false,
        source: 'innertube'
    };
}

async function listLiveChatMessages(liveChatId, pageToken, opts = {}) {
    const id = String(liveChatId || '').trim();
    const videoId = String(opts.videoId || '').trim();
    const preferInnertube = opts.source === 'innertube' || !!opts.continuation || !hasApiKey();

    if (!preferInnertube && id && hasApiKey()) {
        try {
            const data = await youtubeApi('liveChatMessages', {
                part: 'snippet,authorDetails',
                liveChatId: id,
                pageToken: pageToken || undefined,
                maxResults: 200
            });
            return {
                items: data.items || [],
                nextPageToken: data.nextPageToken || '',
                pollingIntervalMillis: Math.max(4000, Number(data.pollingIntervalMillis) || 5000),
                offlineAt: data.offlineAt || null,
                unavailable: false,
                source: 'data-api'
            };
        } catch (err) {
            const status = err.youtubeStatus || 0;
            const reason = err.youtubeReason || '';
            if (isYoutubeNotLiveError(err) || status === 403 || status === 400) {
                console.warn('[youtube] liveChatMessages.list 404/unavailable — falling back to page chat', {
                    liveChatId: id.length > 18 ? `${id.slice(0, 18)}…` : id,
                    videoId,
                    status,
                    reason,
                    message: err.message
                });
            } else {
                throw err;
            }
        }
    } else if (!id && !videoId) {
        return {
            items: [],
            nextPageToken: '',
            pollingIntervalMillis: 8000,
            offlineAt: null,
            unavailable: true,
            reason: 'missing-liveChatId'
        };
    }

    if (videoId) {
        try {
            return await listLiveChatViaInnertube(videoId, opts.continuation || '');
        } catch (err) {
            console.warn('[youtube] innertube live chat failed', err.message);
            return {
                items: [],
                nextPageToken: '',
                pollingIntervalMillis: 8000,
                offlineAt: null,
                unavailable: true,
                reason: 'innertube-failed',
                message: err.message,
                source: 'innertube'
            };
        }
    }

    return {
        items: [],
        nextPageToken: '',
        pollingIntervalMillis: 8000,
        offlineAt: null,
        unavailable: true,
        reason: 'notFound'
    };
}

module.exports = {
    isConfigured,
    hasApiKey,
    extractVideoId,
    searchVideos,
    resolveByUrlOrId,
    normalizeYoutubeTrack,
    youtubeApi,
    parseChannelIdentifier,
    resolveChannel,
    findActiveLiveVideo,
    getLiveStreamingDetails,
    listLiveChatMessages,
    isYoutubeNotLiveError,
    YT_WAITING_LIVE_MSG
};
