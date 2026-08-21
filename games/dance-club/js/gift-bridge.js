/**
 * Receive TikTok gifts / dance-say from Game Center panel → Dance Club view.
 */
import { compactBeatMap } from './beat-intelligence.js';

const CHANNEL = 'tokcontrol-dance-club-gift-v1';
const STORAGE_KEY = 'tokcontrol_dc_gift_bus';

export function createGiftBridge(handlers = {}) {
    const onGift = typeof handlers === 'function' ? handlers : handlers.onGift;
    const onSay = typeof handlers === 'function' ? null : handlers.onSay;
    const onSpotify = typeof handlers === 'function' ? null : handlers.onSpotify;
    const onSpotifyBeatMap = typeof handlers === 'function' ? null : handlers.onSpotifyBeatMap;
    const onSpotifyProgress = typeof handlers === 'function' ? null : handlers.onSpotifyProgress;
    const giftListeners = new Set();
    const sayListeners = new Set();
    const spotifyListeners = new Set();
    const spotifyBeatMapListeners = new Set();
    const spotifyProgressListeners = new Set();
    let bc = null;
    let lastDedupKey = '';
    let lastDedupAt = 0;

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel(CHANNEL);
            bc.onmessage = (e) => dispatch(e.data);
        }
    } catch { /* ignore */ }

    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try { dispatch(JSON.parse(e.newValue)); } catch { /* ignore */ }
    });

    function dispatch(msg) {
        if (!msg) return;

        if (msg.type === 'dance_say') {
            const key = `say:${msg.t || 0}:${msg.say?.uniqueId || ''}:${msg.say?.text || ''}`;
            const now = Date.now();
            if (key === lastDedupKey && now - lastDedupAt < 900) return;
            lastDedupKey = key;
            lastDedupAt = now;
            sayListeners.forEach((fn) => fn(msg.say));
            if (typeof onSay === 'function') onSay(msg.say);
            return;
        }

        if (msg.type === 'spotify_now_playing') {
            const hasMap = !!(msg.track?.beatMap?.beats?.length);
            const key = `spotify:${msg.track?.id || ''}:${hasMap ? 'map' : 'meta'}`;
            const now = Date.now();
            if (key === lastDedupKey && now - lastDedupAt < 400) return;
            lastDedupKey = key;
            lastDedupAt = now;
            spotifyListeners.forEach((fn) => fn(msg.track));
            if (typeof onSpotify === 'function') onSpotify(msg.track);
            return;
        }

        if (msg.type === 'spotify_beat_map') {
            spotifyBeatMapListeners.forEach((fn) => fn(msg));
            if (typeof onSpotifyBeatMap === 'function') onSpotifyBeatMap(msg);
            return;
        }

        if (msg.type === 'spotify_progress') {
            spotifyProgressListeners.forEach((fn) => fn(msg));
            if (typeof onSpotifyProgress === 'function') onSpotifyProgress(msg);
            return;
        }

        if (msg.type !== 'tiktok_gift') return;

        const key = `${msg.t || 0}:${msg.gift?.uniqueId || ''}:${msg.rule?.effect || ''}`;
        const now = Date.now();
        if (key === lastDedupKey && now - lastDedupAt < 900) return;
        lastDedupKey = key;
        lastDedupAt = now;

        giftListeners.forEach((fn) => fn(msg.gift, msg.rule));
        if (typeof onGift === 'function') onGift(msg.gift, msg.rule);
    }

    return {
        on(fn) {
            giftListeners.add(fn);
            return () => giftListeners.delete(fn);
        },
        onSay(fn) {
            sayListeners.add(fn);
            return () => sayListeners.delete(fn);
        },
        onSpotify(fn) {
            spotifyListeners.add(fn);
            return () => spotifyListeners.delete(fn);
        },
        onSpotifyBeatMap(fn) {
            spotifyBeatMapListeners.add(fn);
            return () => spotifyBeatMapListeners.delete(fn);
        },
        onSpotifyProgress(fn) {
            spotifyProgressListeners.add(fn);
            return () => spotifyProgressListeners.delete(fn);
        }
    };
}

/** Called from Game Center panel when a gift matches a Dance Club trigger */
export function broadcastDcGift(gift, rule) {
    const payload = { type: 'tiktok_gift', gift, rule, t: Date.now() };
    try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(payload);
        bc.close();
    } catch { /* ignore */ }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
}

export function broadcastDcSay(say) {
    const payload = { type: 'dance_say', say, t: Date.now() };
    try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(payload);
        bc.close();
    } catch { /* ignore */ }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
}

export function broadcastDcSpotifyBeatMap(data) {
    const slim = { ...data };
    if (slim.beatMap) slim.beatMap = compactBeatMap(slim.beatMap);
    const payload = { type: 'spotify_beat_map', ...slim, t: Date.now() };
    try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(payload);
        bc.close();
    } catch { /* ignore */ }
}

export function broadcastDcSpotify(track) {
    const slim = {
        id: track?.id,
        uri: track?.uri,
        videoId: track?.videoId || null,
        provider: track?.provider
            || (track?.videoId || String(track?.uri || '').startsWith('youtube:') ? 'youtube' : 'spotify'),
        name: track?.name,
        artist: track?.artist,
        albumArt: track?.albumArt,
        requester: track?.requester,
        bpm: track?.bpm,
        progressMs: track?.progressMs,
        durationMs: track?.durationMs || 0,
        playing: track?.playing
    };
    const payload = { type: 'spotify_now_playing', track: slim, t: Date.now() };
    try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(payload);
        bc.close();
    } catch { /* ignore */ }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore — payload still delivered via BroadcastChannel */ }
}

export function broadcastDcSpotifyProgress(progressMs, playing = true) {
    const payload = { type: 'spotify_progress', progressMs, playing, t: Date.now() };
    try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(payload);
        bc.close();
    } catch { /* ignore */ }
}
