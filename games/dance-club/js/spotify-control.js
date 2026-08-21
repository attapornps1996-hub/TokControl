/**
 * Spotify panel for Dance Club control — search, play, stage sync.
 */
import { broadcastDcSpotify, broadcastDcSpotifyProgress, broadcastDcSpotifyBeatMap } from './gift-bridge.js';

const $ = (id) => document.getElementById(id);

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
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('เซิร์ฟเวอร์ไม่ตอบสนอง — รีสตาร์ทแอปแล้วลองใหม่');
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function bindSpotifyPanel({ onToast } = {}) {
    const badge = $('dcSpBadge');
    const resultsEl = $('dcSpResults');
    const msgEl = $('dcSpMsg');
    const nowEl = $('dcSpNowPlaying');
    const queueEl = $('dcSpQueueList');
    const queueCountEl = $('dcSpQueueCount');
    let lastSyncedId = null;
    let pollTimer = null;
    let searching = false;
    let lastSearchTracks = [];
    let spQueue = [];
    let isPlayingFromQueue = false;
    let lastProgressMs = 0;
    let nearEndArmed = false;
    let advanceLockUntil = 0;
    let lastTrackDuration = 0;
    let stuckNearEndCount = 0;
    let wasPlaying = false;
    let queueExternalSync = false;
    let lastExternalQueueTs = 0;
    let sharedQueueUpdatedAt = 0;
    let sharedQueuePushing = false;
    const QUEUE_KEY = 'tokcontrol_dc_sp_queue';
    const QUEUE_OWNER_KEY = 'tokcontrol_sr_queue_owner';
    const GIFT_CHANNEL = 'tokcontrol-dance-club-gift-v1';

    function queueFingerprint(queue) {
        return (queue || []).map((t) => `${t?.uri || ''}|${t?.requester || ''}`).join(';;');
    }

    function songRequestOwnsPlayback() {
        try {
            if (localStorage.getItem(QUEUE_OWNER_KEY) === 'songrequest') return true;
            if (localStorage.getItem('tokcontrol_sr_spotify_owner') === 'songrequest') return true;
        } catch { /* ignore */ }
        return false;
    }

    function applyExternalQueue(queue, ts, owner) {
        if (ts && ts < lastExternalQueueTs) return;
        lastExternalQueueTs = ts || Date.now();
        const next = Array.isArray(queue) ? queue.filter((t) => t?.uri) : [];
        spQueue = next;
        queueExternalSync = songRequestOwnsPlayback() || owner === 'songrequest';
        try {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(spQueue));
            if (owner) localStorage.setItem(QUEUE_OWNER_KEY, owner);
        } catch { /* ignore */ }
        renderQueue();
        if (queueExternalSync) {
            // Song Request owns playback — stop competing advance polls
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        } else {
            restartPoll();
        }
    }

    async function pushSharedQueue(source = 'danceclub') {
        sharedQueuePushing = true;
        try {
            const data = await spApi('/api/spotify/shared-queue', {
                method: 'PUT',
                body: JSON.stringify({ queue: spQueue, source })
            });
            if (data?.updatedAt) sharedQueueUpdatedAt = data.updatedAt;
            try {
                localStorage.setItem(QUEUE_KEY, JSON.stringify(spQueue));
                localStorage.setItem(QUEUE_OWNER_KEY, source);
            } catch { /* ignore */ }
            try {
                const bc = new BroadcastChannel(GIFT_CHANNEL);
                bc.postMessage({ type: 'spotify_queue_sync', queue: spQueue, owner: source, t: Date.now() });
                bc.close();
            } catch { /* ignore */ }
        } catch (e) {
            console.warn('[dc-spotify] push shared queue', e.message);
            saveQueueLocal();
        } finally {
            sharedQueuePushing = false;
        }
    }

    async function pullSharedQueue() {
        if (sharedQueuePushing) return;
        try {
            const data = await spApi('/api/spotify/shared-queue');
            if (!data || !Array.isArray(data.queue)) return;
            if ((data.updatedAt || 0) <= sharedQueueUpdatedAt) return;
            if (queueFingerprint(data.queue) === queueFingerprint(spQueue)) {
                sharedQueueUpdatedAt = data.updatedAt || sharedQueueUpdatedAt;
                return;
            }
            sharedQueueUpdatedAt = data.updatedAt || Date.now();
            applyExternalQueue(data.queue, sharedQueueUpdatedAt, data.source || 'shared');
        } catch {
            // fallback: localStorage bridge
            try {
                const raw = localStorage.getItem(QUEUE_KEY) || '[]';
                if (raw === lastSharedQueueJson) return;
                lastSharedQueueJson = raw;
                const owner = localStorage.getItem(QUEUE_OWNER_KEY) || 'shared';
                applyExternalQueue(JSON.parse(raw), Date.now(), owner);
            } catch { /* ignore */ }
        }
    }

    function bindExternalQueueSync() {
        try {
            const bc = new BroadcastChannel(GIFT_CHANNEL);
            bc.onmessage = (e) => {
                const msg = e.data;
                if (!msg?.type) return;
                if (msg.type === 'spotify_queue_sync') {
                    applyExternalQueue(msg.queue, msg.t, msg.owner || 'shared');
                    return;
                }
                if (msg.type === 'spotify_now_playing' && msg.track?.id) {
                    lastSyncedId = msg.track.id;
                    renderNowPlaying(msg.track);
                }
            };
        } catch { /* ignore */ }

        window.addEventListener('storage', (e) => {
            if (e.key === QUEUE_KEY && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    const owner = localStorage.getItem(QUEUE_OWNER_KEY) || 'shared';
                    applyExternalQueue(parsed, Date.now(), owner);
                } catch { /* ignore */ }
            }
        });
    }

    let lastSharedQueueJson = '';
    function pollSharedQueue() {
        void pullSharedQueue();
    }

    function loadQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            lastSharedQueueJson = raw || '[]';
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) spQueue = parsed.filter((t) => t?.uri);
            }
            queueExternalSync = songRequestOwnsPlayback();
        } catch { /* ignore */ }
        renderQueue();
        void pullSharedQueue();
    }

    function saveQueueLocal() {
        try { localStorage.setItem(QUEUE_KEY, JSON.stringify(spQueue)); } catch { /* ignore */ }
    }

    function saveQueue() {
        saveQueueLocal();
        void pushSharedQueue(songRequestOwnsPlayback() ? 'songrequest' : 'danceclub');
    }

    const toast = (t) => { if (onToast) onToast(t); };

    function setMsg(text, kind = '') {
        if (!msgEl) return;
        if (!text) {
            msgEl.textContent = '';
            msgEl.className = 'dc-spotify-msg';
            return;
        }
        msgEl.textContent = text;
        msgEl.className = 'dc-spotify-msg' + (kind ? ` ${kind}` : '');
    }

    function showLoading() {
        if (!resultsEl) return;
        resultsEl.innerHTML = '<div class="dc-hint dc-spotify-loading">🔍 กำลังค้นหา…</div>';
    }

    function showError(message) {
        setMsg(message, 'err');
        if (!resultsEl) return;
        resultsEl.innerHTML = `<div class="dc-hint dc-spotify-error">${esc(message)}</div>`;
    }

    function setBadge(kind, text) {
        if (!badge) return;
        badge.className = 'dc-spotify-badge ' + kind;
        badge.textContent = text;
    }

    async function fetchBpm(trackId) {
        try {
            const feat = await spApi(`/api/spotify/audio-features?id=${encodeURIComponent(trackId)}`);
            return feat.tempo ? Math.round(feat.tempo) : null;
        } catch {
            return null;
        }
    }

    async function fetchBeatMap(trackId) {
        try {
            const data = await spApi(`/api/spotify/audio-analysis?id=${encodeURIComponent(trackId)}`);
            if (data?.beats?.length) return { beats: data.beats, bpm: data.bpm, sections: data.sections };
        } catch { /* optional */ }
        return null;
    }

    async function enrichTrack(track) {
        const bpm = track.bpm ?? (await fetchBpm(track.id));
        const beatMap = await fetchBeatMap(track.id);
        return { ...track, bpm, beatMap };
    }

    async function syncTrackToStage(track, requester = 'Host', progressMs = 0) {
        if (!track?.id) return;

        const isYt = track.provider === 'youtube'
            || !!track.videoId
            || String(track.uri || '').startsWith('youtube:');
        const payload = {
            id: track.id,
            uri: track.uri,
            videoId: track.videoId || (isYt ? track.id : null),
            provider: isYt ? 'youtube' : (track.provider || 'spotify'),
            name: track.name,
            artist: track.artist,
            albumArt: track.albumArt,
            requester,
            bpm: track.bpm || (isYt ? 128 : null),
            progressMs,
            durationMs: track.durationMs || 0,
            playing: track.playing !== false
        };
        broadcastDcSpotify(payload);
        lastSyncedId = track.id;
        renderNowPlaying(payload);

        const pushBeatMap = (bpm, beatMap) => {
            if (!beatMap?.beats?.length) return;
            setTimeout(() => {
                if (track.id !== lastSyncedId) return;
                broadcastDcSpotifyBeatMap({ id: track.id, bpm, beatMap, progressMs });
            }, 500);
        };

        if (track.beatMap?.beats?.length) {
            pushBeatMap(track.bpm, track.beatMap);
            return payload;
        }

        // YouTube has no Spotify audio-analysis — keep default BPM beat clock only
        if (isYt) return payload;

        enrichTrack(track).then((enriched) => {
            if (!enriched?.id || enriched.id !== lastSyncedId) return;
            pushBeatMap(enriched.bpm, enriched.beatMap);
        }).catch(() => {});

        return payload;
    }

    function renderNowPlaying(track) {
        if (!nowEl) return;
        if (!track) {
            nowEl.innerHTML = '<div class="dc-hint">ยังไม่มีเพลง</div>';
            return;
        }
        nowEl.innerHTML = `
            <div class="dc-spotify-now-row">
                ${track.albumArt
                    ? `<img class="dc-spotify-art" src="${esc(track.albumArt)}" alt="">`
                    : '<div class="dc-spotify-art ph">🎵</div>'}
                <div class="dc-spotify-meta">
                    <div class="dc-spotify-title">${esc(track.name)}</div>
                    <div class="dc-spotify-artist">${esc(track.artist)}</div>
                    ${track.bpm ? `<div class="dc-spotify-bpm">${track.bpm} BPM</div>` : ''}
                </div>
            </div>
        `;
    }

    function renderResults(tracks) {
        lastSearchTracks = tracks || [];
        setMsg('');
        if (!resultsEl) return;
        if (!lastSearchTracks.length) {
            resultsEl.innerHTML = '<div class="dc-hint">ไม่พบเพลง — ลองคำค้นอื่น</div>';
            return;
        }
        setMsg(`พบ ${lastSearchTracks.length} เพลง — ▶ เล่น · ➕ เพิ่มคิว`, 'ok');
        resultsEl.innerHTML = lastSearchTracks.map((t, i) => `
            <div class="dc-spotify-item">
                ${t.albumArt
                    ? `<img class="dc-spotify-art sm" src="${esc(t.albumArt)}" alt="">`
                    : '<div class="dc-spotify-art sm ph">🎵</div>'}
                <div class="dc-spotify-meta">
                    <div class="dc-spotify-title">${esc(t.name)}</div>
                    <div class="dc-spotify-artist">${esc(t.artist)}</div>
                </div>
                <button type="button" class="dc-btn small dc-spotify-play" data-i="${i}" title="เล่นทันที">▶</button>
                <button type="button" class="dc-btn small dc-spotify-queue" data-i="${i}" title="เพิ่มคิว">➕</button>
            </div>
        `).join('');
    }

    function renderQueue() {
        if (queueCountEl) queueCountEl.textContent = spQueue.length;
        if (!queueEl) return;
        if (!spQueue.length) {
            queueEl.innerHTML = '<div class="dc-hint">กด ➕ จากผลค้นหาเพื่อเพิ่มคิว · ▶ เล่นทันที</div>';
            return;
        }
        queueEl.innerHTML = spQueue.map((t, i) => `
            <div class="dc-queue-item">
                <span class="dc-sp-queue-label">${i + 1}. ${esc(t.name)} — ${esc(t.artist)}</span>
                <button type="button" class="dc-queue-rm dc-sp-queue-rm" data-qi="${i}" title="ลบ">✕</button>
            </div>
        `).join('');
    }

    function addToQueue(track) {
        if (!track?.uri) return;
        queueExternalSync = songRequestOwnsPlayback();
        spQueue.push({ ...track });
        saveQueue();
        renderQueue();
        if (!queueExternalSync) restartPoll();
        setMsg(`➕ เพิ่มคิว: ${track.name}`, 'ok');
        toast(`➕ เข้าคิวร่วม: ${track.name}`);
    }

    async function refreshStatus() {
        try {
            const headers = await resolveAuthHeaders();
            if (!headers.Authorization) {
                setBadge('off', '● ล็อกอิน TokControl ก่อน');
                return false;
            }
            const cfg = await spApi('/api/spotify/config');
            if (!cfg.configured) {
                setBadge('off', '● Spotify API ยังไม่พร้อม');
                return false;
            }
            const st = await spApi('/api/spotify/status');
            if (st.connected) {
                setBadge('on', '● Spotify เชื่อมต่อแล้ว');
                return true;
            }
            setBadge('off', '● ยังไม่ได้เชื่อม Spotify');
            return false;
        } catch (e) {
            const msg = String(e.message || '');
            if (msg.includes('No token') || msg.includes('401')) {
                setBadge('off', '● ล็อกอิน TokControl ก่อน');
            } else {
                setBadge('off', '● ' + msg.slice(0, 40));
            }
            return false;
        }
    }

    async function playTrack(track, { fromQueue = false } = {}) {
        if (!track?.uri) return;
        const isYt = track.provider === 'youtube'
            || !!track.videoId
            || String(track.uri).startsWith('youtube:');
        if (isYt) {
            // Song Request owns YouTube audio — Dance Club only mirrors metadata/beat clock
            if (songRequestOwnsPlayback()) {
                await syncTrackToStage({
                    ...track,
                    provider: 'youtube',
                    requester: track.requester || 'YouTube'
                }, track.requester || 'YouTube', track.progressMs || 0);
                setMsg(`▶ ${track.name} — เล่นจาก Song Request (YouTube)`, 'ok');
                toast(`▶ ${track.name}`);
                return;
            }
            showError('เพลง YouTube เล่นผ่าน Song Request เท่านั้น');
            return;
        }
        setMsg('กำลังส่งคำสั่งเล่นไป Spotify…', '');
        try {
            const ok = await refreshStatus();
            if (!ok) {
                showError('เชื่อม Spotify ก่อน (กดปุ่มเชื่อมต่อ)');
                return;
            }
            await spApi('/api/spotify/play', {
                method: 'POST',
                body: JSON.stringify({ uri: track.uri })
            });
            isPlayingFromQueue = fromQueue;
            await syncTrackToStage({ ...track, requester: 'Host' }, 'Host', 0);
            setMsg(`▶ ${track.name} — ฟังจากแอป Spotify`, 'ok');
            toast(`▶ ${track.name}`);
            setTimeout(pollNowPlaying, 1200);
        } catch (e) {
            const msg = e.message || 'เล่นไม่สำเร็จ';
            showError(msg);
            toast('❌ ' + msg);
        }
    }

    async function playAt(index) {
        const track = lastSearchTracks[index];
        if (!track) return;
        await playTrack(track, { fromQueue: false });
    }

    async function playNextFromQueue() {
        if (!spQueue.length) return false;
        if (queueExternalSync) return false;
        if (Date.now() < advanceLockUntil) return false;
        advanceLockUntil = Date.now() + 1400;
        nearEndArmed = false;
        const next = spQueue.shift();
        saveQueue();
        renderQueue();
        toast(`▶ คิวถัดไป: ${next.name}`);
        await playTrack(next, { fromQueue: true });
        return true;
    }

    async function tryAdvanceQueue(track, progress, playing, duration) {
        queueExternalSync = songRequestOwnsPlayback();
        if (queueExternalSync) return false;
        if (!spQueue.length || Date.now() < advanceLockUntil) return false;

        const atEnd = duration > 0 && progress >= Math.max(0, duration - 3500);
        const pausedNearEnd = duration > 0 && !playing && progress >= Math.max(0, duration - 12000);
        const noTrack = !track && wasPlaying;
        const progressStuck = atEnd && Math.abs(progress - lastProgressMs) < 500;
        if (progressStuck) stuckNearEndCount++;
        else if (!atEnd) stuckNearEndCount = 0;

        const hardEnd = duration > 0 && progress >= Math.max(0, duration - 900);
        const ended = noTrack
            || hardEnd
            || (atEnd && (!playing || stuckNearEndCount >= 1))
            || pausedNearEnd
            || (wasPlaying && !playing && duration > 0 && progress >= duration - 12000);

        if (!ended) return false;

        wasPlaying = false;
        nearEndArmed = false;
        stuckNearEndCount = 0;
        return playNextFromQueue();
    }

    async function pollNowPlaying() {
        try {
            queueExternalSync = songRequestOwnsPlayback();
            const data = await spApi('/api/spotify/now-playing?fresh=1');
            const track = data.track;
            const progress = data.progressMs || 0;
            const playing = data.playing === true;
            const duration = track?.durationMs || lastTrackDuration || 0;

            if (track?.durationMs) lastTrackDuration = track.durationMs;

            if (!queueExternalSync && spQueue.length) {
                if (await tryAdvanceQueue(track, progress, playing, duration)) return;
            } else {
                stuckNearEndCount = 0;
                nearEndArmed = false;
            }

            if (track) {
                const live = playing && !(duration > 0 && progress >= Math.max(0, duration - 800));
                broadcastDcSpotifyProgress(progress, live);
                if (live) wasPlaying = true;
                else if (wasPlaying) wasPlaying = false;
                if (track.id !== lastSyncedId) {
                    nearEndArmed = false;
                    await syncTrackToStage({ ...track, requester: 'Host' }, 'Host', progress);
                } else {
                    renderNowPlaying(track);
                }
            } else {
                broadcastDcSpotifyProgress(0, false);
                if (playing) wasPlaying = true;
                else {
                    if (!queueExternalSync && wasPlaying && spQueue.length && Date.now() >= advanceLockUntil) {
                        wasPlaying = false;
                        await playNextFromQueue();
                        return;
                    }
                    wasPlaying = false;
                }
            }

            lastProgressMs = progress;
        } catch { /* ignore */ }
    }

    function ensurePoll() {
        if (pollTimer) return;
        if (queueExternalSync) return;
        const ms = spQueue.length
            ? (lastTrackDuration > 0 && lastProgressMs >= Math.max(0, lastTrackDuration - 12000) ? 450 : 900)
            : 8000;
        pollTimer = setInterval(pollNowPlaying, ms);
    }

    function restartPoll() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        queueExternalSync = songRequestOwnsPlayback();
        if (queueExternalSync) return;
        ensurePoll();
    }

    async function connectSpotify() {
        try {
            const cfg = await spApi('/api/spotify/config');
            if (!cfg.configured) {
                setBadge('off', '● Spotify API ยังไม่พร้อม');
                toast('⚠️ Spotify ยังตั้งค่าไม่ครบ — ลองอัปเดตแอปเป็นเวอร์ชันล่าสุดแล้วรีสตาร์ท');
                return;
            }
            const data = await spApi('/api/spotify/auth');
            if (window.PandyBridge?.openOAuthWindow) {
                window.PandyBridge.openOAuthWindow(data.url);
            } else {
                window.open(data.url, '_blank', 'width=500,height=700');
            }
            toast('ล็อกอิน Spotify แล้วกดรีเฟรช');
        } catch (e) {
            const msg = e.message || 'เชื่อมไม่สำเร็จ';
            setBadge('off', '● ' + msg.slice(0, 40));
            toast('❌ ' + msg);
        }
    }

    async function skipTrack() {
        try {
            if (spQueue.length) {
                await playNextFromQueue();
            } else {
                await spApi('/api/spotify/skip', { method: 'POST' });
                toast('⏭ ข้ามเพลง');
            }
            setTimeout(pollNowPlaying, 800);
        } catch (e) {
            toast('❌ ' + (e.message || 'ข้ามไม่สำเร็จ'));
        }
    }

    async function syncNow() {
        try {
            const data = await spApi('/api/spotify/now-playing');
            if (!data.track) {
                toast('ยังไม่มีเพลงที่เล่น');
                return;
            }
            lastSyncedId = null;
            await syncTrackToStage({ ...data.track, requester: 'Host' });
            toast('↻ Sync เวทีแล้ว');
        } catch (e) {
            toast('❌ ' + (e.message || 'Sync ไม่สำเร็จ'));
        }
    }

    $('dcSpSearchBtn')?.addEventListener('click', async () => {
        const q = $('dcSpSearch')?.value?.trim();
        if (!q || searching) return;
        const headers = await resolveAuthHeaders();
        if (!headers.Authorization) {
            showError('ล็อกอิน TokControl ในแอปหลักก่อน');
            toast('⚠️ ล็อกอิน TokControl ก่อน');
            return;
        }
        searching = true;
        $('dcSpSearchBtn')?.setAttribute('disabled', 'disabled');
        showLoading();
        setMsg('');
        try {
            const cfg = await spApi('/api/spotify/config');
            if (!cfg.configured) {
                showError('Spotify ยังตั้งค่าไม่ครบ — อัปเดตแอปเป็นเวอร์ชันล่าสุดแล้วรีสตาร์ท');
                return;
            }
            const data = await spApi(`/api/spotify/search?q=${encodeURIComponent(q)}`);
            renderResults(data.tracks || []);
            if (!data.tracks?.length) setMsg('ไม่พบเพลง', 'err');
        } catch (e) {
            const msg = e.message || 'ค้นหาไม่สำเร็จ';
            showError(msg);
            toast('❌ ' + msg);
        } finally {
            searching = false;
            $('dcSpSearchBtn')?.removeAttribute('disabled');
        }
    });

    $('dcSpSearch')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('dcSpSearchBtn')?.click();
    });

    resultsEl?.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.dc-spotify-play');
        if (playBtn) {
            playAt(Number(playBtn.dataset.i));
            return;
        }
        const queueBtn = e.target.closest('.dc-spotify-queue');
        if (queueBtn) {
            const track = lastSearchTracks[Number(queueBtn.dataset.i)];
            if (track) addToQueue(track);
        }
    });

    queueEl?.addEventListener('click', (e) => {
        const rm = e.target.closest('.dc-sp-queue-rm');
        if (!rm) return;
        queueExternalSync = songRequestOwnsPlayback();
        spQueue.splice(Number(rm.dataset.qi), 1);
        saveQueue();
        renderQueue();
        if (!queueExternalSync) restartPoll();
    });

    $('dcSpQueueClear')?.addEventListener('click', () => {
        queueExternalSync = songRequestOwnsPlayback();
        spQueue = [];
        saveQueue();
        renderQueue();
        if (!queueExternalSync) restartPoll();
        toast('ล้างคิวแล้ว');
    });

    $('dcSpRefresh')?.addEventListener('click', async () => {
        const ok = await refreshStatus();
        if (ok) {
            ensurePoll();
            await pollNowPlaying();
            toast('รีเฟรชแล้ว');
        }
    });

    $('dcSpConnect')?.addEventListener('click', connectSpotify);
    $('dcSpSkip')?.addEventListener('click', skipTrack);
    $('dcSpSyncNow')?.addEventListener('click', syncNow);

    loadQueue();
    bindExternalQueueSync();
    setInterval(pollSharedQueue, 1500);
    try {
        queueExternalSync = songRequestOwnsPlayback();
    } catch { /* ignore */ }
    void refreshStatus().then((ok) => {
        if (ok) {
            void pullSharedQueue();
            queueExternalSync = songRequestOwnsPlayback();
            if (!queueExternalSync) {
                ensurePoll();
                pollNowPlaying();
            } else {
                // Song Request owns playback — one sync of now-playing UI only (no advance loop)
                pollNowPlaying();
            }
        }
    }).catch(() => {
        setBadge('off', '● ตรวจสอบสถานะไม่สำเร็จ');
    });

    return { refreshStatus, ensurePoll };
}
