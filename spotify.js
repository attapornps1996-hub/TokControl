const axios = require('axios');
const querystring = require('querystring');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/spotify/callback';
const SPOTIFY_SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing'
].join(' ');

const playerStateCache = new Map();
const deviceCache = new Map();
const spotifyApiLastCall = new Map();
const userRateLimitUntil = new Map();
// Keep short — long TTL made Song Request miss "song ended → paused at 0:00"
const PLAYER_STATE_TTL_MS = 1200;
const DEVICE_CACHE_TTL_MS = 120000;
const SPOTIFY_MIN_INTERVAL_MS = 1500;

const PLACEHOLDER_IDS = new Set([
    'your_client_id_here',
    'your_spotify_client_id',
    'changeme',
    'xxx',
    'paste_here'
]);

function isPlaceholder(val) {
    const s = String(val || '').trim().toLowerCase();
    if (!s) return true;
    if (PLACEHOLDER_IDS.has(s)) return true;
    if (s.includes('your_client') || s.includes('your_spotify') || s.includes('paste')) return true;
    return false;
}

function isConfigured() {
    return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET
        && !isPlaceholder(SPOTIFY_CLIENT_ID)
        && !isPlaceholder(SPOTIFY_CLIENT_SECRET));
}

function getAuthUrl(state) {
    const params = querystring.stringify({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT_URI,
        scope: SPOTIFY_SCOPES,
        state,
        show_dialog: 'true'
    });
    return `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCode(code) {
    const body = querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI
    });
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post('https://accounts.spotify.com/api/token', body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`
        }
    });
    return res.data;
}

async function refreshToken(refreshTokenVal) {
    const body = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenVal
    });
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post('https://accounts.spotify.com/api/token', body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`
        }
    });
    return res.data;
}

async function getStoredTokens(db, userId) {
    if (db.ensureSpotifyTokensSchema) await db.ensureSpotifyTokensSchema();
    const uid = String(userId);
    return db.get('SELECT * FROM spotify_tokens WHERE userId = ?', [uid]);
}

async function saveTokens(db, userId, tokenData) {
    if (db.ensureSpotifyTokensSchema) await db.ensureSpotifyTokensSchema();
    const uid = String(userId);
    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000 - 60000;
    const existing = await getStoredTokens(db, uid);
    const refresh = tokenData.refresh_token || (existing && existing.refreshToken);
    await db.run(
        `INSERT INTO spotify_tokens (userId, accessToken, refreshToken, expiresAt, scope, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
           accessToken = excluded.accessToken,
           refreshToken = COALESCE(excluded.refreshToken, spotify_tokens.refreshToken),
           expiresAt = excluded.expiresAt,
           scope = excluded.scope,
           updatedAt = excluded.updatedAt`,
        [uid, tokenData.access_token, refresh, expiresAt, tokenData.scope || SPOTIFY_SCOPES, new Date().toISOString()]
    );
}

async function deleteTokens(db, userId) {
    if (db.ensureSpotifyTokensSchema) await db.ensureSpotifyTokensSchema();
    await db.run('DELETE FROM spotify_tokens WHERE userId = ?', [String(userId)]);
}

async function getValidAccessToken(db, userId) {
    const row = await getStoredTokens(db, userId);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt > Date.now()) return row.accessToken;
    if (!row.refreshToken) return null;
    try {
        const data = await refreshToken(row.refreshToken);
        await saveTokens(db, userId, data);
        return data.access_token;
    } catch (e) {
        console.error('Spotify token refresh failed:', e.message);
        return null;
    }
}

let appTokenCache = { token: null, expiresAt: 0 };

async function getAppAccessToken() {
    if (!isConfigured()) throw new Error('Spotify API not configured');
    if (appTokenCache.token && appTokenCache.expiresAt > Date.now()) return appTokenCache.token;
    const body = querystring.stringify({ grant_type: 'client_credentials' });
    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post('https://accounts.spotify.com/api/token', body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`
        }
    });
    appTokenCache = {
        token: res.data.access_token,
        expiresAt: Date.now() + ((res.data.expires_in || 3600) - 60) * 1000
    };
    return appTokenCache.token;
}

function spotifyErrorMessage(e) {
    const status = e.response?.status;
    const body = e.response?.data;
    const msg = body?.error?.message
        || (typeof body?.error === 'string' ? body.error : null)
        || body?.message
        || e.message
        || 'Spotify API error';

    if (/premium subscription required|developer.*premium|extended quota/i.test(msg)) {
        return 'Spotify บังคับ Premium — บัญชีที่สร้างแอปใน developer.spotify.com ต้องสมัคร Premium ก่อน (รอ 2–3 ชม. หลังสมัคร)';
    }
    if (status === 403 || /status code 403|forbidden/i.test(msg)) {
        return 'Spotify ปฏิเสธ (403) — บัญชีเจ้าของแอปใน Developer Dashboard ต้องเป็น Premium';
    }
    if (/no active device/i.test(msg)) {
        return 'Spotify ยังไม่เจอเครื่องเล่น — เปิดแอป Spotify แล้วกดเล่นเพลงอะไรก็ได้ 1 ครั้ง จากนั้นลองใหม่';
    }
    if (/too many requests|rate limit|429/i.test(msg)) {
        return 'Spotify เรียก API ถี่เกินไป — รอ 10–15 วินาทีแล้วลองใหม่';
    }
    if (/spotify not connected/i.test(msg)) {
        return 'ยังไม่ได้เชื่อม Spotify — กดปุ่มเชื่อมต่อ';
    }
    return msg;
}

async function appSpotifyApi(method, path, data, params) {
    const token = await getAppAccessToken();
    try {
        const res = await axios({
            method,
            url: `https://api.spotify.com/v1${path}`,
            headers: { Authorization: `Bearer ${token}` },
            data,
            params
        });
        return res.data;
    } catch (e) {
        throw new Error(spotifyErrorMessage(e));
    }
}

async function isUserConnected(db, userId) {
    if (!userId) return false;
    const token = await getValidAccessToken(db, userId);
    return !!token;
}

async function spotifyApi(db, userId, method, path, data, params) {
    const token = await getValidAccessToken(db, userId);
    if (!token) throw new Error('Spotify not connected');
    const uid = String(userId || '');
    const blockedUntil = userRateLimitUntil.get(uid) || 0;
    if (Date.now() < blockedUntil) {
        const sec = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
        throw new Error(`Spotify rate limit — รอ ${sec} วินาที`);
    }
    const now = Date.now();
    const last = spotifyApiLastCall.get(uid) || 0;
    const gap = now - last;
    if (gap < SPOTIFY_MIN_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, SPOTIFY_MIN_INTERVAL_MS - gap));
    }
    spotifyApiLastCall.set(uid, Date.now());
    try {
        const res = await axios({
            method,
            url: `https://api.spotify.com/v1${path}`,
            headers: { Authorization: `Bearer ${token}` },
            data,
            params
        });
        return res.data;
    } catch (e) {
        if (e.response?.status === 429) {
            const retrySec = parseInt(e.response.headers?.['retry-after'], 10) || 30;
            userRateLimitUntil.set(uid, Date.now() + retrySec * 1000);
            throw new Error(`Spotify rate limit — รอ ${retrySec} วินาที`);
        }
        throw new Error(spotifyErrorMessage(e));
    }
}

function normalizeTrack(item, requester) {
    if (!item) return null;
    const artists = (item.artists || []).map(a => a.name).join(', ');
    return {
        id: item.id,
        uri: item.uri,
        name: item.name,
        artist: artists,
        albumArt: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || '',
        durationMs: item.duration_ms || 0,
        requester: requester || null
    };
}

async function searchTrack(db, userId, query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const params = {
        q,
        type: 'track',
        limit: 10,
        market: process.env.SPOTIFY_MARKET || 'TH'
    };

    if (userId) {
        try {
            const data = await spotifyApi(db, userId, 'get', '/search', null, params);
            const items = data?.tracks?.items || [];
            if (items.length) return items.map((t) => normalizeTrack(t)).filter(Boolean);
        } catch (e) {
            const raw = e.response?.data?.error?.message || e.message || '';
            if (/premium subscription required|status code 403|Spotify Premium|Spotify ปฏิเสธ/i.test(raw)) {
                throw new Error(spotifyErrorMessage(e));
            }
        }
    }

    try {
        const data = await appSpotifyApi('get', '/search', null, params);
        const items = data?.tracks?.items || [];
        return items.map((t) => normalizeTrack(t)).filter(Boolean);
    } catch (e) {
        throw new Error(spotifyErrorMessage(e));
    }
}

function isRateLimitError(e) {
    const msg = String(e?.message || e?.response?.data?.error?.message || '');
    return /too many requests|rate limit|429|ถี่เกิน/i.test(msg);
}

async function getNowPlaying(db, userId, opts) {
    return getPlayerState(db, userId, opts);
}

async function getPlayerState(db, userId, opts = {}) {
    const key = String(userId || '');
    const fresh = !!opts.fresh;
    const cached = playerStateCache.get(key);
    if (!fresh && cached?.data && Date.now() - cached.at < PLAYER_STATE_TTL_MS) {
        return cached.data;
    }

    try {
        const data = await spotifyApi(db, userId, 'get', '/me/player');
        const result = !data || !data.item
            ? { playing: false, track: null, progressMs: 0 }
            : {
                // Must be strict — `!== false` treated paused/unknown as playing
                playing: !!data.is_playing,
                track: normalizeTrack(data.item),
                progressMs: data.progress_ms || 0
            };
        playerStateCache.set(key, { data: result, at: Date.now() });
        return result;
    } catch (e) {
        if (isRateLimitError(e)) {
            if (cached?.data) return cached.data;
            return { playing: false, track: null, progressMs: 0, rateLimited: true, error: e.message };
        }
        if (e.message && (e.message.includes('204') || e.message.includes('No active device'))) {
            const empty = { playing: false, track: null, progressMs: 0 };
            playerStateCache.set(key, { data: empty, at: Date.now() });
            return empty;
        }
        if (cached?.data) return cached.data;
        return { playing: false, track: null, progressMs: 0, error: e.message };
    }
}

function deviceRank(d) {
    if (!d || d.is_restricted) return -1;
    const type = String(d.type || '').toLowerCase();
    let score = 1;
    if (d.is_active) score += 100;
    if (type === 'computer') score += 40;
    else if (type === 'smartphone') score += 30;
    else if (type === 'speaker') score += 20;
    else if (type === 'tablet') score += 15;
    return score;
}

function sortDevices(devices) {
    return (devices || [])
        .filter((d) => d && d.id && !d.is_restricted)
        .sort((a, b) => deviceRank(b) - deviceRank(a));
}

async function pickDevice(db, userId, forceRefresh = false) {
    const key = String(userId || '');
    const cached = deviceCache.get(key);
    if (!forceRefresh && cached?.device && Date.now() - cached.at < DEVICE_CACHE_TTL_MS) {
        return cached.device;
    }

    let devices = [];
    try {
        devices = await getDevices(db, userId);
    } catch (e) {
        if (cached?.device) return cached.device;
        if (isRateLimitError(e)) return null;
        throw e;
    }

    const pick = sortDevices(devices)[0] || null;
    if (pick) {
        deviceCache.set(key, { device: pick, at: Date.now() });
    }
    return pick;
}

function isNoActiveDeviceError(e) {
    const msg = String(e?.message || e || '');
    if (/premium|ปฏิเสธ \(403\)|forbidden|subscription required/i.test(msg)) return false;
    return /no active device|ไม่พบอุปกรณ์|เปิด Spotify บนมือถือ|เปิดแอป Spotify|device not found|NO_ACTIVE_DEVICE/i.test(msg)
        || /\b404\b/.test(msg);
}

function isDeviceRetryableError(e) {
    const msg = String(e?.message || e || '');
    if (/premium|ปฏิเสธ \(403\)|forbidden|subscription required|rate limit|ถี่เกิน/i.test(msg)) return false;
    return isNoActiveDeviceError(e) || /not found|Restriction violated|already paused/i.test(msg);
}

async function getAudioAnalysis(db, userId, trackId) {
    if (!trackId) return null;
    let data;
    try {
        data = await appSpotifyApi('get', `/audio-analysis/${encodeURIComponent(trackId)}`);
    } catch (e) {
        try {
            data = await spotifyApi(db, userId, 'get', `/audio-analysis/${encodeURIComponent(trackId)}`);
        } catch {
            return null;
        }
    }
    if (!data) return null;

    const sections = (data.sections || []).map((s) => ({
        start: s.start,
        duration: s.duration,
        loudness: s.loudness,
        confidence: s.confidence
    }));

    const beats = [];
    let si = 0;
    for (const b of data.beats || []) {
        while (
            si < sections.length - 1
            && b.start >= sections[si].start + (sections[si].duration || 0)
        ) {
            si++;
        }
        const sec = sections[si];
        beats.push({
            start: b.start,
            duration: b.duration,
            confidence: b.confidence,
            loudness: (sec && b.start >= sec.start && b.start < sec.start + (sec.duration || 999))
                ? (sec.loudness ?? -18)
                : -18
        });
    }

    const maxBeats = 720;
    let trimmed = beats;
    if (beats.length > maxBeats) {
        trimmed = [];
        const step = beats.length / maxBeats;
        for (let i = 0; i < maxBeats; i++) trimmed.push(beats[Math.floor(i * step)]);
    }

    return {
        bpm: Math.round(data.track?.tempo || 0) || null,
        beats: trimmed,
        sections: sections.length > 96
            ? sections.filter((_, i) => i % Math.ceil(sections.length / 96) === 0).slice(0, 96)
            : sections,
        duration: data.track?.duration || 0
    };
}

async function addToQueue(db, userId, trackUri) {
    await spotifyApi(db, userId, 'post', '/me/player/queue', null, { uri: trackUri });
}

async function getDevices(db, userId) {
    const data = await spotifyApi(db, userId, 'get', '/me/player/devices');
    return data?.devices || [];
}

async function playOnDevice(db, userId, body, deviceId) {
    const params = deviceId ? { device_id: deviceId } : {};
    await spotifyApi(db, userId, 'put', '/me/player/play', body, params);
}

async function transferToDevice(db, userId, deviceId, play = false) {
    await spotifyApi(db, userId, 'put', '/me/player', {
        device_ids: [deviceId],
        play: !!play
    });
}

async function startPlayback(db, userId, trackUri) {
    const body = trackUri ? { uris: [trackUri] } : {};
    const uid = String(userId || '');
    playerStateCache.delete(uid);
    deviceCache.delete(uid);

    // 1) ลองเล่นบน active device โดยตรง
    try {
        await playOnDevice(db, userId, body, null);
        return;
    } catch (e) {
        if (isRateLimitError(e)) throw e;
        if (!isDeviceRetryableError(e)) throw e;
    }

    // 2) ดึงรายการ device แล้วลองทีละเครื่อง (transfer + play)
    let devices = [];
    try {
        devices = sortDevices(await getDevices(db, userId));
    } catch (e) {
        if (isRateLimitError(e)) throw e;
        devices = [];
    }

    if (!devices.length) {
        throw new Error(
            'Spotify ยังไม่เจอเครื่องเล่น — เปิดแอป Spotify บน PC/มือถือ แล้วกดเล่นเพลงอะไรก็ได้ 1 ครั้ง จากนั้นกลับมากดเล่นที่นี่อีกครั้ง'
        );
    }

    let lastErr = null;
    for (const device of devices) {
        try {
            // ปลุก device ให้เป็น active ก่อน แล้วค่อยสั่งเล่น URI
            try {
                await transferToDevice(db, userId, device.id, false);
            } catch (te) {
                console.warn('[spotify] transfer:', device.name || device.id, te.message);
            }
            await playOnDevice(db, userId, body, device.id);
            deviceCache.set(uid, { device, at: Date.now() });
            return;
        } catch (e) {
            lastErr = e;
            if (isRateLimitError(e)) throw e;
            if (/premium|ปฏิเสธ \(403\)|subscription required/i.test(String(e.message || ''))) throw e;
            console.warn('[spotify] play on', device.name || device.type, e.message);
        }
    }

    // 3) ลอง transfer พร้อม play:true เป็นทางสุดท้าย
    const fallback = devices[0];
    if (fallback) {
        try {
            await transferToDevice(db, userId, fallback.id, true);
            if (trackUri) {
                await playOnDevice(db, userId, body, fallback.id);
            }
            deviceCache.set(uid, { device: fallback, at: Date.now() });
            return;
        } catch (e) {
            lastErr = e;
        }
    }

    if (isNoActiveDeviceError(lastErr) || !lastErr) {
        throw new Error(
            'Spotify ยังไม่พร้อมเล่น — เปิดแอป Spotify ให้เห็นหน้าต่าง แล้วกดเล่น/พักเพลง 1 ครั้ง จากนั้นลองใหม่ที่ Dance Club'
        );
    }
    throw lastErr;
}

async function skipTrack(db, userId) {
    await spotifyApi(db, userId, 'post', '/me/player/next');
}

async function pausePlayback(db, userId) {
    await spotifyApi(db, userId, 'put', '/me/player/pause');
}

async function resumePlayback(db, userId) {
    await spotifyApi(db, userId, 'put', '/me/player/play');
}

async function getAudioFeatures(db, userId, trackId) {
    if (!trackId) return null;
    try {
        const data = await appSpotifyApi('get', `/audio-features/${encodeURIComponent(trackId)}`);
        if (!data) return null;
        return {
            tempo: data.tempo || null,
            energy: data.energy ?? null,
            danceability: data.danceability ?? null,
            key: data.key ?? null
        };
    } catch (e) {
        try {
            const data = await spotifyApi(db, userId, 'get', `/audio-features/${encodeURIComponent(trackId)}`);
            if (!data) return null;
            return {
                tempo: data.tempo || null,
                energy: data.energy ?? null,
                danceability: data.danceability ?? null,
                key: data.key ?? null
            };
        } catch {
            return null;
        }
    }
}

async function setVolume(db, userId, volumePercent) {
    const vol = Math.max(0, Math.min(100, Math.round(Number(volumePercent) || 0)));
    await spotifyApi(db, userId, 'put', '/me/player/volume', null, { volume_percent: vol });
}

module.exports = {
    isConfigured,
    getAuthUrl,
    exchangeCode,
    saveTokens,
    deleteTokens,
    getStoredTokens,
    getValidAccessToken,
    isUserConnected,
    searchTrack,
    getNowPlaying,
    getPlayerState,
    addToQueue,
    getDevices,
    startPlayback,
    skipTrack,
    pausePlayback,
    resumePlayback,
    setVolume,
    getAudioFeatures,
    getAudioAnalysis,
    normalizeTrack,
    SPOTIFY_REDIRECT_URI
};
