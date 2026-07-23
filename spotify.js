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

function isConfigured() {
    return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET);
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
    return db.get('SELECT * FROM spotify_tokens WHERE userId = ?', [userId]);
}

async function saveTokens(db, userId, tokenData) {
    const expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000 - 60000;
    const existing = await getStoredTokens(db, userId);
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
        [userId, tokenData.access_token, refresh, expiresAt, tokenData.scope || SPOTIFY_SCOPES, new Date().toISOString()]
    );
}

async function deleteTokens(db, userId) {
    await db.run('DELETE FROM spotify_tokens WHERE userId = ?', [userId]);
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

async function spotifyApi(db, userId, method, path, data, params) {
    const token = await getValidAccessToken(db, userId);
    if (!token) throw new Error('Spotify not connected');
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
        const msg = e.response?.data?.error?.message || e.message;
        throw new Error(msg);
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
    const data = await spotifyApi(db, userId, 'get', '/search', null, {
        q: query,
        type: 'track',
        limit: 5
    });
    const items = data?.tracks?.items || [];
    return items.map(t => normalizeTrack(t));
}

async function getNowPlaying(db, userId) {
    try {
        const data = await spotifyApi(db, userId, 'get', '/me/player/currently-playing');
        if (!data || !data.item) return { playing: false, track: null, progressMs: 0 };
        return {
            playing: data.is_playing !== false,
            track: normalizeTrack(data.item),
            progressMs: data.progress_ms || 0
        };
    } catch (e) {
        if (e.message && e.message.includes('204')) return { playing: false, track: null, progressMs: 0 };
        return { playing: false, track: null, progressMs: 0, error: e.message };
    }
}

async function getPlayerState(db, userId) {
    try {
        const data = await spotifyApi(db, userId, 'get', '/me/player');
        if (!data || !data.item) return { playing: false, track: null, progressMs: 0 };
        return {
            playing: data.is_playing !== false,
            track: normalizeTrack(data.item),
            progressMs: data.progress_ms || 0
        };
    } catch (e) {
        if (e.message && (e.message.includes('204') || e.message.includes('No active device'))) {
            return { playing: false, track: null, progressMs: 0 };
        }
        return { playing: false, track: null, progressMs: 0 };
    }
}

async function addToQueue(db, userId, trackUri) {
    await spotifyApi(db, userId, 'post', '/me/player/queue', null, { uri: trackUri });
}

async function startPlayback(db, userId, trackUri) {
    await spotifyApi(db, userId, 'put', '/me/player/play', trackUri ? { uris: [trackUri] } : {});
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

module.exports = {
    isConfigured,
    getAuthUrl,
    exchangeCode,
    saveTokens,
    deleteTokens,
    getStoredTokens,
    getValidAccessToken,
    searchTrack,
    getNowPlaying,
    getPlayerState,
    addToQueue,
    startPlayback,
    skipTrack,
    pausePlayback,
    resumePlayback,
    normalizeTrack,
    SPOTIFY_REDIRECT_URI
};
