const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'data', 'emotes_cache.json');

function normalizeUsername(username) {
    return String(username || '').trim().replace(/^@+/, '').toLowerCase();
}

function readEmotesCache() {
    try {
        if (!fs.existsSync(CACHE_FILE)) return {};
        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
        console.warn('[EmotesCache] read failed:', err.message);
        return {};
    }
}

function writeEmotesCache(cache) {
    try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.warn('[EmotesCache] write failed:', err.message);
        return false;
    }
}

function getChannelEmotes(username) {
    const key = normalizeUsername(username);
    if (!key) return { username: '', lastUpdated: null, emotes: [], fromCache: true };
    const cache = readEmotesCache();
    const entry = cache[key];
    if (!entry) {
        return { username: key, lastUpdated: null, emotes: [], fromCache: true };
    }
    return {
        username: key,
        lastUpdated: entry.lastUpdated || null,
        emotes: Array.isArray(entry.emotes) ? entry.emotes : [],
        fromCache: true
    };
}

function pickImageUrl(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') {
        const s = raw.trim();
        return s.startsWith('http') ? s : '';
    }
    const deepLists = [];
    const pushList = (v) => {
        if (!v) return;
        if (typeof v === 'string' && v.startsWith('http')) deepLists.push(v);
        if (Array.isArray(v)) v.forEach(pushList);
        if (typeof v === 'object') {
            if (Array.isArray(v.url_list)) v.url_list.forEach(pushList);
            if (Array.isArray(v.urlList)) v.urlList.forEach(pushList);
            if (typeof v.url === 'string') pushList(v.url);
            if (typeof v.uri === 'string' && v.uri.startsWith('http')) pushList(v.uri);
        }
    };
    const candidates = [
        raw.image, raw.icon, raw.emote_image, raw.emoteImage,
        raw.display_image, raw.displayImage, raw.static_image, raw.staticImage,
        raw.emote?.image, raw.emote?.icon, raw.sticker?.image
    ];
    candidates.forEach(pushList);
    pushList(raw.url_list);
    pushList(raw.urlList);
    pushList(raw.imageUrl);
    pushList(raw.image_url);
    for (const url of deepLists) {
        if (typeof url === 'string' && url.startsWith('http')) return url;
    }
    return '';
}

function inferEmoteType(raw, typeHint) {
    if (typeHint === 'sub_emote' || typeHint === 'sticker') return typeHint;
    const explicit = String(raw.type || raw.emote_type || raw.emoteType || '').toLowerCase();
    if (explicit.includes('sticker')) return 'sticker';
    if (explicit.includes('sub')) return 'sub_emote';
    const emoteTypeNum = parseInt(raw.emote_type ?? raw.emoteType, 10);
    if (emoteTypeNum === 1) return 'sticker';
    if (raw.sticker_id || raw.stickerId) return 'sticker';
    if (raw.is_sticker || raw.isSticker) return 'sticker';
    return 'sub_emote';
}

function normalizeEmoteItem(raw, typeHint) {
    if (!raw || typeof raw !== 'object') return null;
    const nested = raw.emote && typeof raw.emote === 'object' ? raw.emote : raw;
    const id = String(
        nested.emote_id || nested.emoteId || nested.id || nested.emoji_id || nested.emojiId ||
        nested.sticker_id || nested.stickerId || raw.emote_id || raw.emoteId || raw.id || ''
    ).trim();
    if (!id) return null;
    const name = String(
        nested.display_name || nested.displayName || nested.name || nested.emote_name ||
        nested.emoteName || nested.alias || nested.text || nested.title || id
    ).trim();
    const imageUrl = pickImageUrl(nested) || pickImageUrl(raw);
    if (!imageUrl) {
        console.warn('[EmotesCache] skip emote without imageUrl id=', id, 'name=', name);
        return null;
    }
    return {
        id,
        name: name || id,
        type: inferEmoteType(nested, typeHint),
        imageUrl
    };
}

function mergeEmoteLists(targetMap, list, typeHint) {
    if (!list) return;
    const items = Array.isArray(list) ? list : (list.emotes || list.emote_list || list.list || []);
    if (!Array.isArray(items)) return;
    for (const raw of items) {
        const normalized = normalizeEmoteItem(raw, typeHint);
        if (!normalized) continue;
        const key = `${normalized.type}:${normalized.id}`;
        targetMap.set(key, normalized);
    }
}

function extractEmotesFromRoomInfo(roomInfo) {
    const map = new Map();
    const data = roomInfo?.data || roomInfo || {};
    mergeEmoteLists(map, data.all_emoji_list, 'sub_emote');
    mergeEmoteLists(map, data.emoji_list, 'sub_emote');
    mergeEmoteLists(map, data.biz_sticker_list, 'sticker');
    mergeEmoteLists(map, data.room_sticker_list, 'sticker');
    mergeEmoteLists(map, data.sticker_list, 'sticker');
    return Array.from(map.values());
}

function extractEmotesFromApiResponse(res) {
    const map = new Map();
    const data = res?.data || res || {};
    mergeEmoteLists(map, data.emotes, null);
    mergeEmoteLists(map, data.emote_list, null);
    mergeEmoteLists(map, data.emoji_list, 'sub_emote');
    mergeEmoteLists(map, data.sticker_list, 'sticker');
    mergeEmoteLists(map, data.list, null);
    if (Array.isArray(data)) mergeEmoteLists(map, data, null);
    return Array.from(map.values());
}

function extractEmotesFromLiveEvent(data) {
    const map = new Map();
    const lists = [
        data?.emoteList,
        data?.emote_list,
        data?.emotes
    ];
    for (const list of lists) mergeEmoteLists(map, list, null);
    return Array.from(map.values());
}

function extractEmotesFromChatEvent(data) {
    const map = new Map();
    mergeEmoteLists(map, data?.emotes, 'sub_emote');
    mergeEmoteLists(map, data?.emoteList, null);
    mergeEmoteLists(map, data?.emote_list, null);
    return Array.from(map.values());
}

async function fetchChannelEmotesFromConnector(tiktokConnect, username, roomId) {
    const map = new Map();
    const mergeFound = (items) => {
        for (const item of items || []) {
            if (!item?.id) continue;
            map.set(`${item.type}:${item.id}`, item);
        }
    };

    let roomInfo = null;
    try {
        if (typeof tiktokConnect.fetchRoomInfo === 'function') {
            roomInfo = await tiktokConnect.fetchRoomInfo(roomId);
        } else if (tiktokConnect.roomInfo) {
            roomInfo = tiktokConnect.roomInfo;
        }
    } catch (err) {
        console.warn(`[EmotesCache] fetchRoomInfo failed for @${username}:`, err.message);
    }
    if (roomInfo) mergeFound(extractEmotesFromRoomInfo(roomInfo));

    const apiPaths = [
        'room/emote/list/',
        'anchor/emote/list/',
        'user/emote/list/',
        'emote/list/',
        'subscription/emote/list/',
        'sticker/list/'
    ];
    const baseParams = {
        ...tiktokConnect.webClient.clientParams,
        room_id: roomId,
        unique_id: username
    };
    for (const apiPath of apiPaths) {
        for (const signRequest of [false, true]) {
            try {
                const res = await tiktokConnect.webClient.getJsonObjectFromWebcastApi(apiPath, baseParams, signRequest);
                const parsed = extractEmotesFromApiResponse(res);
                if (parsed.length) {
                    mergeFound(parsed);
                    console.log(`[EmotesCache] ${parsed.length} emotes via ${apiPath} (signed=${signRequest}) for @${username}`);
                }
            } catch (e) {
                // try next
            }
        }
    }

    return Array.from(map.values());
}

function setChannelEmotes(username, emotes, meta = {}) {
    const key = normalizeUsername(username);
    if (!key) return null;
    const cache = readEmotesCache();
    const prev = cache[key]?.emotes || [];
    const merged = new Map();
    for (const item of prev) {
        if (item?.id) merged.set(`${item.type || 'sub_emote'}:${item.id}`, item);
    }
    for (const item of emotes || []) {
        if (item?.id) merged.set(`${item.type || 'sub_emote'}:${item.id}`, item);
    }
    const payload = {
        lastUpdated: new Date().toISOString(),
        emotes: Array.from(merged.values()),
        source: meta.source || cache[key]?.source || 'unknown'
    };
    cache[key] = payload;
    writeEmotesCache(cache);
    return { username: key, ...payload, fromCache: false };
}

async function refreshChannelEmotes(tiktokConnect, username, roomId, options = {}) {
    const key = normalizeUsername(username);
    if (!key) {
        return { username: '', lastUpdated: null, emotes: [], fromCache: true, fetchFailed: true };
    }

    let fetched = [];
    let fetchFailed = false;
    if (tiktokConnect && roomId) {
        try {
            fetched = await fetchChannelEmotesFromConnector(tiktokConnect, key, roomId);
        } catch (err) {
            fetchFailed = true;
            console.warn(`[EmotesCache] fetch failed for @${key}:`, err.message);
        }
    } else {
        fetchFailed = true;
    }

    if (fetched.length) {
        const saved = setChannelEmotes(key, fetched, { source: options.source || 'live_fetch' });
        return { ...saved, fetchFailed: false };
    }

    const cached = getChannelEmotes(key);
    return { ...cached, fetchFailed };
}

function upsertEmotesFromLive(username, emotes, source = 'live_event') {
    const key = normalizeUsername(username);
    if (!key || !Array.isArray(emotes) || !emotes.length) return null;
    const normalized = emotes.map((e) => normalizeEmoteItem(e, e?.type)).filter(Boolean);
    if (!normalized.length) return null;
    return setChannelEmotes(key, normalized, { source });
}

module.exports = {
    CACHE_FILE,
    normalizeUsername,
    readEmotesCache,
    writeEmotesCache,
    getChannelEmotes,
    setChannelEmotes,
    normalizeEmoteItem,
    extractEmotesFromRoomInfo,
    extractEmotesFromLiveEvent,
    extractEmotesFromChatEvent,
    fetchChannelEmotesFromConnector,
    refreshChannelEmotes,
    upsertEmotesFromLive
};
