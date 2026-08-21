/**
 * Auto-advance Dance Club Spotify queue — runs on the view page so the next
 * track plays even when the control panel is closed.
 */
import { broadcastDcSpotify, broadcastDcSpotifyBeatMap, broadcastDcSpotifyProgress } from './gift-bridge.js';

const QUEUE_KEY = 'tokcontrol_dc_sp_queue';
const QUEUE_OWNER_KEY = 'tokcontrol_sr_queue_owner';
const ADVANCE_LOCK_KEY = 'tokcontrol_dc_queue_advance_lock';

function authHeaders() {
    const token = localStorage.getItem('pandy_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

async function resolveAuthHeaders() {
    let headers = authHeaders();
    if (headers.Authorization) return headers;
    try {
        const token = await window.PandyBridge?.getAuthToken?.();
        if (token) {
            localStorage.setItem('pandy_token', token);
            headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        }
    } catch { /* ignore */ }
    return headers;
}

async function spApi(path, options = {}) {
    const headers = await resolveAuthHeaders();
    if (!headers.Authorization) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(path, {
            ...options,
            signal: ctrl.signal,
            headers: { ...headers, ...(options.headers || {}) }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function loadQueue() {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((t) => t?.uri) : [];
    } catch {
        return [];
    }
}

function saveQueue(queue) {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch { /* ignore */ }
}

function songRequestOwnsPlayback() {
    try {
        if (localStorage.getItem(QUEUE_OWNER_KEY) === 'songrequest') return true;
        if (localStorage.getItem('tokcontrol_sr_spotify_owner') === 'songrequest') return true;
    } catch { /* ignore */ }
    return false;
}

function readAdvanceLock() {
    try {
        return parseInt(sessionStorage.getItem(ADVANCE_LOCK_KEY) || '0', 10) || 0;
    } catch {
        return 0;
    }
}

function writeAdvanceLock(untilMs) {
    try {
        sessionStorage.setItem(ADVANCE_LOCK_KEY, String(untilMs));
    } catch { /* ignore */ }
}

async function fetchBeatMap(trackId) {
    try {
        const data = await spApi(`/api/spotify/audio-analysis?id=${encodeURIComponent(trackId)}`);
        if (data?.beats?.length) return { beats: data.beats, bpm: data.bpm, sections: data.sections };
    } catch { /* optional */ }
    return null;
}

async function syncTrackToStage(track, progressMs = 0) {
    if (!track?.id) return;
    const payload = {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artist,
        albumArt: track.albumArt,
        requester: track.requester || 'Host',
        bpm: track.bpm,
        progressMs,
        durationMs: track.durationMs || 0,
        playing: true
    };
    broadcastDcSpotify(payload);

    const beatMap = track.beatMap || (await fetchBeatMap(track.id));
    if (beatMap?.beats?.length) {
        setTimeout(() => {
            broadcastDcSpotifyBeatMap({
                id: track.id,
                bpm: track.bpm || beatMap.bpm,
                beatMap,
                progressMs
            });
        }, 120);
    }
}

function trackEnded(progress, playing, duration, wasPlaying) {
    if (!duration || duration <= 0) return !!wasPlaying && !playing;
    const atVeryEnd = progress >= Math.max(0, duration - 1200);
    if (atVeryEnd && !playing) return true;
    if (wasPlaying && !playing && progress >= Math.max(0, duration - 8000)) return true;
    return false;
}

/**
 * @param {{ onToast?: (msg: string) => void }} opts
 */
export function startSpotifyQueueWatcher(opts = {}) {
    const toast = (msg) => { if (typeof opts.onToast === 'function') opts.onToast(msg); };

    let pollTimer = null;
    let lastProgressMs = 0;
    let stuckNearEndCount = 0;
    let wasPlaying = false;
    let lastTrackDuration = 0;
    let advancing = false;
    let lastTrackId = null;

    async function playNextFromQueue() {
        if (advancing || songRequestOwnsPlayback()) return false;
        const lockUntil = readAdvanceLock();
        if (Date.now() < lockUntil) return false;
        const queue = loadQueue();
        if (!queue.length) return false;

        advancing = true;
        writeAdvanceLock(Date.now() + 1400);
        const next = queue.shift();
        saveQueue(queue);

        try {
            await spApi('/api/spotify/play', {
                method: 'POST',
                body: JSON.stringify({ uri: next.uri })
            });
            toast(`▶ คิวถัดไป: ${next.name}`);
            await syncTrackToStage(next, 0);
            wasPlaying = true;
            stuckNearEndCount = 0;
            lastTrackId = next.id || null;
            return true;
        } catch (e) {
            console.warn('[dc-queue] advance failed', e);
            queue.unshift(next);
            saveQueue(queue);
            writeAdvanceLock(Date.now() + 800);
            return false;
        } finally {
            advancing = false;
        }
    }

    async function tryAdvanceQueue(track, progress, playing, duration) {
        if (songRequestOwnsPlayback() || advancing) return false;
        if (!loadQueue().length) return false;
        if (Date.now() < readAdvanceLock()) return false;

        const atEnd = duration > 0 && progress >= Math.max(0, duration - 3500);
        const progressStuck = atEnd && Math.abs(progress - lastProgressMs) < 500;
        if (progressStuck) stuckNearEndCount++;
        else if (!atEnd) stuckNearEndCount = 0;

        const ended = trackEnded(progress, playing, duration, wasPlaying)
            || (!track && wasPlaying)
            || (atEnd && playing && stuckNearEndCount >= 2);

        if (!ended) return false;

        wasPlaying = false;
        stuckNearEndCount = 0;
        return playNextFromQueue();
    }

    function pollIntervalMs(duration = 0, progress = 0) {
        if (!loadQueue().length) return 8000;
        if (duration > 0 && progress >= Math.max(0, duration - 12000)) return 450;
        if (wasPlaying) return 900;
        return 1400;
    }

    function schedulePoll(delayMs) {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => {
            pollTimer = null;
            await poll();
            ensurePoll();
        }, delayMs);
    }

    async function poll() {
        if (songRequestOwnsPlayback()) return;
        const queue = loadQueue();
        if (!queue.length) {
            stuckNearEndCount = 0;
            return;
        }

        try {
            const data = await spApi('/api/spotify/now-playing?fresh=1');
            if (!data) return;

            const track = data.track;
            const progress = data.progressMs || 0;
            const playing = data.playing === true;
            const duration = track?.durationMs || lastTrackDuration || 0;
            if (track?.durationMs) lastTrackDuration = track.durationMs;
            if (track?.id) lastTrackId = track.id;

            if (await tryAdvanceQueue(track, progress, playing, duration)) return;

            const live = playing && !(duration > 0 && progress >= Math.max(0, duration - 800));
            broadcastDcSpotifyProgress(progress, live);
            if (live) wasPlaying = true;
            else if (wasPlaying && queue.length) {
                await tryAdvanceQueue(track, progress, playing, duration);
            }
            lastProgressMs = progress;
        } catch { /* ignore transient errors */ }
    }

    function ensurePoll() {
        if (songRequestOwnsPlayback()) return;
        if (!loadQueue().length) {
            schedulePoll(8000);
            return;
        }
        schedulePoll(pollIntervalMs(lastTrackDuration, lastProgressMs));
    }

    function restartPoll() {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        if (!songRequestOwnsPlayback()) {
            void poll();
            ensurePoll();
        }
    }

    window.addEventListener('storage', (e) => {
        if (e.key === QUEUE_KEY) restartPoll();
        if (e.key === QUEUE_OWNER_KEY && songRequestOwnsPlayback() && pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    });

    restartPoll();

    return {
        poll,
        restartPoll,
        tryAdvanceNow: () => playNextFromQueue(),
        onTrackEnded: () => {
            if (!loadQueue().length || songRequestOwnsPlayback()) return;
            void (async () => {
                if (await playNextFromQueue()) return;
                await poll();
            })();
        },
        stop() {
            if (pollTimer) clearTimeout(pollTimer);
            pollTimer = null;
        }
    };
}
