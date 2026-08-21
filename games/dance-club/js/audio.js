/**
 * Audio engine for Dance Club.
 *
 * Sources:
 *   procedural  - built-in synth beat (no assets needed)
 *   file        - local audio file (full spectrum analysis)
 *   mic         - microphone / desktop capture (full spectrum analysis)
 *   youtube     - YouTube IFrame player
 *
 * NOTE on YouTube: the IFrame player renders audio in a cross-origin frame, so
 * the Web Audio API cannot tap its samples. For that source we drive visuals
 * from the BPM clock instead (set BPM manually or use tap tempo). Everything
 * downstream reads the same frame shape, so visuals behave identically.
 */

const YT_API_SRC = 'https://www.youtube.com/iframe_api';

import { createPeakDetector } from './beat-intelligence.js';
import { createBeatWorkerBridge } from './beat-bridge.js';

export function parseYouTubeId(input) {
    if (!input) return null;
    const raw = String(input).trim();
    if (/^[\w-]{11}$/.test(raw)) return raw;
    const patterns = [
        /[?&]v=([\w-]{11})/,
        /youtu\.be\/([\w-]{11})/,
        /youtube\.com\/embed\/([\w-]{11})/,
        /youtube\.com\/shorts\/([\w-]{11})/,
        /youtube\.com\/live\/([\w-]{11})/
    ];
    for (const re of patterns) {
        const m = raw.match(re);
        if (m) return m[1];
    }
    return null;
}

let ytApiPromise = null;
export function loadYouTubeApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) return resolve(window.YT);
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof prev === 'function') prev();
            resolve(window.YT);
        };
        const tag = document.createElement('script');
        tag.src = YT_API_SRC;
        tag.onerror = () => reject(new Error('ไม่สามารถโหลด YouTube IFrame API'));
        document.head.appendChild(tag);
        setTimeout(() => {
            if (!window.YT || !window.YT.Player) reject(new Error('YouTube API timeout'));
        }, 12000);
    });
    return ytApiPromise;
}

export function createAudioEngine(opts = {}) {
    const state = {
        mode: 'idle',
        playing: false,
        bpm: opts.bpm || 128,
        bpmLocked: false,      // true => ignore detected tempo, trust manual BPM
        beatDivision: 1,       // 1 = quarter, 2 = 8th, 0.5 = half
        sensitivity: 1,
        strongBeatThreshold: 0.4,
        beatIndex: 0,
        beatPhase: 0,
        lastBeatAt: 0,
        clockStart: 0,
        label: 'ยังไม่เล่นเพลง'
    };

    let ctx = null;
    let analyser = null;
    let freq = null;
    let master = null;
    let sourceNode = null;
    let mediaEl = null;
    let micStream = null;
    let procedural = null;
    let ytPlayer = null;
    let ytReady = false;
    const playlist = [];
    let playlistIndex = -1;

    const beatBridge = createBeatWorkerBridge({ useWorker: opts.useBeatWorker !== false });
    const peakDetector = createPeakDetector();
    beatBridge.setStrongThreshold(state.strongBeatThreshold);
    peakDetector.setStrongThreshold(state.strongBeatThreshold);
    let lastStrongHitAt = 0;

    const listeners = { beat: [], state: [], queue: [] };
    const emit = (name, payload) => (listeners[name] || []).forEach((fn) => fn(payload));
    const emitQueue = () => emit('queue', getQueue());
    const emitState = () => emit('state', getStatus());

    /* ------------------------- context ------------------------- */
    function ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            master = ctx.createGain();
            master.gain.value = opts.volume ?? 0.8;
            analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.72;
            freq = new Uint8Array(analyser.frequencyBinCount);
            master.connect(analyser);
            analyser.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function teardownSource() {
        if (procedural) {
            procedural.stop();
            procedural = null;
        }
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch { /* already detached */ }
            sourceNode = null;
        }
        if (mediaEl) {
            mediaEl.onended = null;
            mediaEl.pause();
            if (mediaEl.dataset.revoke) URL.revokeObjectURL(mediaEl.src);
            mediaEl = null;
        }
        if (micStream) {
            micStream.getTracks().forEach((t) => t.stop());
            micStream = null;
        }
        if (ytPlayer && ytReady) {
            try { ytPlayer.stopVideo(); } catch { /* player may be gone */ }
        }
    }

    /* --------------------- procedural synth --------------------- */
    function startProcedural() {
        ensureCtx();
        teardownSource();

        const bus = ctx.createGain();
        bus.gain.value = 0.9;
        bus.connect(master);

        let stopped = false;
        let step = 0;
        let nextTime = ctx.currentTime + 0.06;

        const kick = (time) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(45, time + 0.14);
            g.gain.setValueAtTime(1, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.26);
            osc.connect(g).connect(bus);
            osc.start(time);
            osc.stop(time + 0.28);
        };
        const hat = (time, gain = 0.22) => {
            const len = 0.05;
            const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = 7000;
            const g = ctx.createGain();
            g.gain.value = gain;
            src.connect(hp).connect(g).connect(bus);
            src.start(time);
        };
        const bassNote = (time, f) => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 520;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(0.32, time + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
            osc.frequency.value = f;
            osc.connect(lp).connect(g).connect(bus);
            osc.start(time);
            osc.stop(time + 0.24);
        };

        const notes = [55, 55, 82.4, 65.4, 55, 73.4, 82.4, 61.7];

        const schedule = () => {
            if (stopped) return;
            const spb = 60 / state.bpm;
            const stepDur = spb / 4;
            while (nextTime < ctx.currentTime + 0.25) {
                const s = step % 16;
                if (s % 4 === 0) kick(nextTime);
                hat(nextTime, s % 2 === 0 ? 0.16 : 0.1);
                if (s % 2 === 0) bassNote(nextTime, notes[(step >> 1) % notes.length]);
                nextTime += stepDur;
                step++;
            }
            procedural.timer = setTimeout(schedule, 60);
        };

        procedural = {
            timer: null,
            stop() {
                stopped = true;
                clearTimeout(procedural?.timer);
                bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
                setTimeout(() => { try { bus.disconnect(); } catch { /* noop */ } }, 400);
            }
        };
        schedule();

        state.mode = 'procedural';
        state.playing = true;
        state.label = `บีทในตัว ${state.bpm} BPM`;
        state.clockStart = performance.now();
        state.beatIndex = 0;
        emit('state', getStatus());
    }

    /** Beat clock for Spotify/YouTube Song Request sync — beat map in Web Worker (no local audio) */
    function startSpotifySync(trackLabel, bpm, beatMap, progressMs = 0, durationMs = 0, opts = {}) {
        if (state.mode !== 'spotify') teardownSource();
        if (bpm) state.bpm = bpm;
        state.mode = 'spotify';
        state.playing = true;
        const src = opts?.source === 'youtube' ? 'YouTube' : 'Spotify';
        state.label = trackLabel ? `${src} · ${String(trackLabel).slice(0, 28)}` : `${src} sync`;
        state.clockStart = performance.now();
        state.beatIndex = 0;
        state.lastBeatAt = state.clockStart;
        beatBridge.setDurationMs?.(durationMs || 0);
        void beatBridge.load(beatMap || null, progressMs, bpm || state.bpm || 128, state.strongBeatThreshold);
        setTimeout(() => emitState(), 0);
    }

    function upgradeSpotifyBeatMap(beatMap, progressMs = 0, bpm) {
        if (state.mode !== 'spotify' || !beatMap?.beats?.length) return;
        if (bpm) state.bpm = bpm;
        const progress = progressMs || 0;
        void beatBridge.load(beatMap, progress, bpm || state.bpm, state.strongBeatThreshold)
            .then(() => setTimeout(() => emitState(), 0));
    }

    function syncSpotifyProgress(progressMs, playing = true) {
        if (state.mode !== 'spotify') return;
        const ms = Math.max(0, progressMs || 0);
        beatBridge.setProgress(ms, playing);
        if (playing !== undefined) {
            const wasPlaying = state.playing;
            state.playing = !!playing;
            if (wasPlaying && !state.playing) {
                state.beatIndex = 0;
                state.beatPhase = 0;
                emitState();
            }
        }
    }

    function silentFrame() {
        return {
            bass: 0,
            mid: 0,
            treble: 0,
            beat: 0,
            hit: false,
            strongHit: false,
            energy: 0,
            beatIndex: 0,
            beatPhase: 0,
            bpm: Math.round(state.bpm),
            playing: false,
            mode: state.mode,
            analysed: false,
            beforeFirstBeat: false,
            afterLastBeat: false,
            beatLive: false
        };
    }

    /* ------------------------- local file / playlist ------------------------- */
    function revokeEntry(entry) {
        if (entry?.url) {
            try { URL.revokeObjectURL(entry.url); } catch { /* noop */ }
            entry.url = null;
        }
    }

    function getQueue() {
        return {
            items: playlist.map((p, i) => ({
                id: p.id,
                name: p.name,
                active: i === playlistIndex
            })),
            index: playlistIndex,
            length: playlist.length
        };
    }

    async function playPlaylistIndex(index) {
        if (index < 0 || index >= playlist.length) return false;
        ensureCtx();
        teardownSource();
        playlistIndex = index;
        const entry = playlist[index];
        if (!entry.url) entry.url = URL.createObjectURL(entry.file);

        const el = new Audio();
        el.src = entry.url;
        el.loop = playlist.length <= 1;
        el.crossOrigin = 'anonymous';
        mediaEl = el;
        sourceNode = ctx.createMediaElementSource(el);
        sourceNode.connect(master);

        el.onended = () => {
            if (playlistIndex < playlist.length - 1) {
                playPlaylistIndex(playlistIndex + 1);
            } else if (playlist.length === 1) {
                el.currentTime = 0;
                el.play().catch(() => {});
            } else {
                state.playing = false;
                state.label = 'คิวจบแล้ว';
                emitState();
                emitQueue();
            }
        };

        await el.play();
        state.mode = 'file';
        state.playing = true;
        state.label = entry.name;
        state.clockStart = performance.now();
        emitState();
        emitQueue();
        return true;
    }

    async function loadFile(file, { enqueue = false } = {}) {
        const entry = {
            id: `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: String(file.name || 'Track').replace(/\.[^.]+$/, ''),
            file,
            url: null
        };

        if (enqueue && (state.mode === 'file' || playlist.length)) {
            playlist.push(entry);
            emitQueue();
            if (!state.playing || state.mode !== 'file') {
                return playPlaylistIndex(playlist.length - 1);
            }
            return true;
        }

        playlist.forEach(revokeEntry);
        playlist.length = 0;
        playlist.push(entry);
        return playPlaylistIndex(0);
    }

    async function enqueueFiles(fileList) {
        const files = Array.from(fileList || []).filter((f) => f && f.type?.startsWith('audio'));
        if (!files.length) return getQueue();
        const startEmpty = !playlist.length;
        for (const file of files) {
            playlist.push({
                id: `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: String(file.name || 'Track').replace(/\.[^.]+$/, ''),
                file,
                url: null
            });
        }
        emitQueue();
        if (startEmpty || state.mode !== 'file' || !state.playing) {
            await playPlaylistIndex(startEmpty ? 0 : playlistIndex < 0 ? 0 : playlistIndex);
        }
        return getQueue();
    }

    function removeFromQueue(id) {
        const i = playlist.findIndex((p) => p.id === id);
        if (i < 0) return getQueue();
        const wasPlaying = i === playlistIndex;
        revokeEntry(playlist[i]);
        playlist.splice(i, 1);
        if (!playlist.length) {
            playlistIndex = -1;
            if (wasPlaying) stop();
            emitQueue();
            return getQueue();
        }
        if (i < playlistIndex) playlistIndex--;
        else if (wasPlaying) {
            const next = Math.min(i, playlist.length - 1);
            playPlaylistIndex(next);
        }
        emitQueue();
        return getQueue();
    }

    function clearQueue() {
        playlist.forEach(revokeEntry);
        playlist.length = 0;
        playlistIndex = -1;
        emitQueue();
        return getQueue();
    }

    function playNextInQueue() {
        if (playlistIndex < playlist.length - 1) return playPlaylistIndex(playlistIndex + 1);
        return false;
    }

    function playPrevInQueue() {
        if (playlistIndex > 0) return playPlaylistIndex(playlistIndex - 1);
        return false;
    }

    /* ------------------------- microphone ------------------------- */
    async function startMic() {
        ensureCtx();
        teardownSource();
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        sourceNode = ctx.createMediaStreamSource(micStream);
        // Analyse only — routing mic to speakers would feed back
        sourceNode.connect(analyser);
        state.mode = 'mic';
        state.playing = true;
        state.label = 'ไมค์ / เสียงระบบ';
        state.clockStart = performance.now();
        emit('state', getStatus());
        return true;
    }

    /* ------------------------- YouTube ------------------------- */
    /** Force lowest video quality — we only need audio for beat sync. */
    function forceYouTubeAudioQuality(player) {
        if (!player) return;
        try {
            if (typeof player.setPlaybackQuality === 'function') {
                player.setPlaybackQuality('tiny'); // 144p
            }
            if (typeof player.setPlaybackQualityRange === 'function') {
                player.setPlaybackQualityRange('tiny', 'tiny');
            }
        } catch { /* YouTube may ignore quality hints */ }
    }

    async function loadYouTube(urlOrId, mountEl) {
        const id = parseYouTubeId(urlOrId);
        if (!id) throw new Error('ลิงก์ YouTube ไม่ถูกต้อง');
        const YT = await loadYouTubeApi();
        teardownSource();

        if (!ytPlayer) {
            const host = mountEl || document.getElementById('ytMount');
            if (!host) throw new Error('ไม่พบที่ติดตั้ง YouTube player');
            ytReady = false;
            await new Promise((resolve, reject) => {
                ytPlayer = new YT.Player(host, {
                    // Small frame so YouTube prefers a low-res stream (audio-only use)
                    height: '90',
                    width: '160',
                    videoId: id,
                    playerVars: {
                        autoplay: 1,
                        controls: 1,
                        modestbranding: 1,
                        rel: 0,
                        playsinline: 1,
                        // Hint low quality where still honored
                        vq: 'tiny'
                    },
                    events: {
                        onReady: (e) => {
                            ytReady = true;
                            try {
                                e.target.unMute();
                                e.target.setVolume(100);
                            } catch { /* ignore */ }
                            forceYouTubeAudioQuality(e.target);
                            e.target.playVideo();
                            resolve();
                        },
                        onStateChange: (e) => {
                            if (e.data === YT.PlayerState.PLAYING
                                || e.data === YT.PlayerState.BUFFERING) {
                                forceYouTubeAudioQuality(e.target);
                            }
                            const playing = e.data === YT.PlayerState.PLAYING;
                            if (state.mode === 'youtube') {
                                state.playing = playing;
                                if (playing) state.clockStart = performance.now();
                                emit('state', getStatus());
                            }
                        },
                        onPlaybackQualityChange: (e) => {
                            // If YouTube upgrades quality, pull it back down
                            if (e.data && e.data !== 'tiny' && e.data !== 'small') {
                                forceYouTubeAudioQuality(e.target);
                            }
                        },
                        onError: () => reject(new Error('YouTube เล่นวิดีโอนี้ไม่ได้ (อาจถูกจำกัดสิทธิ์)'))
                    }
                });
            });
        } else {
            ytPlayer.loadVideoById({
                videoId: id,
                suggestedQuality: 'tiny'
            });
            forceYouTubeAudioQuality(ytPlayer);
            ytPlayer.playVideo();
        }

        state.mode = 'youtube';
        state.playing = true;
        state.label = 'YouTube • เสียง 144p • BPM';
        state.clockStart = performance.now();
        state.beatIndex = 0;
        emit('state', getStatus());
        return true;
    }

    function setYouTubeVolume(v) {
        if (ytPlayer && ytReady) ytPlayer.setVolume(Math.round(v * 100));
    }

    /* ------------------------- transport ------------------------- */
    function stop() {
        teardownSource();
        state.playing = false;
        state.mode = 'idle';
        state.label = 'หยุดแล้ว';
        emit('state', getStatus());
    }

    function togglePlay() {
        if (state.mode === 'youtube' && ytPlayer && ytReady) {
            if (state.playing) ytPlayer.pauseVideo();
            else ytPlayer.playVideo();
            return;
        }
        if (mediaEl) {
            if (state.playing) { mediaEl.pause(); state.playing = false; }
            else { mediaEl.play(); state.playing = true; state.clockStart = performance.now(); }
            emit('state', getStatus());
            return;
        }
        if (state.mode === 'procedural') stop();
        else startProcedural();
    }

    function setVolume(v) {
        if (master) master.gain.value = v;
        setYouTubeVolume(v);
    }

    /* ------------------------- BPM control ------------------------- */
    function setBpm(bpm) {
        const next = Math.min(220, Math.max(40, Number(bpm) || 128));
        state.bpm = next;
        state.clockStart = performance.now();
        state.beatIndex = 0;
        if (state.mode === 'procedural') state.label = `บีทในตัว ${next} BPM`;
        emit('state', getStatus());
    }

    function setBpmLocked(locked) {
        state.bpmLocked = !!locked;
        emit('state', getStatus());
    }

    function setBeatDivision(div) {
        state.beatDivision = Number(div) || 1;
        emit('state', getStatus());
    }

    function setSensitivity(v) {
        state.sensitivity = Math.max(0.2, Math.min(3, Number(v) || 1));
    }

    /** 0 = easy (many scene changes), 2 = hard (only big drops) */
    function setStrongBeatThreshold(v) {
        const t = Math.max(0, Math.min(2, Number(v) ?? 0.4));
        state.strongBeatThreshold = t;
        beatBridge.setStrongThreshold?.(t);
        peakDetector.setStrongThreshold?.(t);
    }

    const taps = [];
    function tapTempo() {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2200) taps.length = 0;
        taps.push(now);
        if (taps.length > 8) taps.shift();
        if (taps.length < 2) return null;
        let sum = 0;
        for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
        const avg = sum / (taps.length - 1);
        const bpm = Math.round(60000 / avg);
        if (bpm >= 40 && bpm <= 220) {
            setBpm(bpm);
            setBpmLocked(true);
            return bpm;
        }
        return null;
    }

    function resyncClock() {
        state.clockStart = performance.now();
        state.beatIndex = 0;
    }

    /* ------------------------- analysis ------------------------- */
    const bandAvg = (from, to) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += freq[i];
        return sum / Math.max(1, to - from) / 255;
    };

    let smBass = 0, smMid = 0, smTreble = 0;
    let bassHistory = new Array(43).fill(0);
    let historyIdx = 0;
    let beatEnv = 0;
    let lastDetectedBeat = 0;
    const detectedIntervals = [];

    function analyse() {
        analyser.getByteFrequencyData(freq);
        const n = analyser.frequencyBinCount;
        const rawBass = bandAvg(1, Math.floor(n * 0.06));
        const rawMid = bandAvg(Math.floor(n * 0.06), Math.floor(n * 0.28));
        const rawTreble = bandAvg(Math.floor(n * 0.28), Math.floor(n * 0.75));

        smBass += (rawBass - smBass) * 0.35;
        smMid += (rawMid - smMid) * 0.3;
        smTreble += (rawTreble - smTreble) * 0.28;

        // Rolling average energy for onset detection
        const avg = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
        bassHistory[historyIdx] = rawBass;
        historyIdx = (historyIdx + 1) % bassHistory.length;

        const now = performance.now();
        const threshold = avg * (1.28 / state.sensitivity) + 0.02;
        let hit = false;
        if (rawBass > threshold && now - lastDetectedBeat > 60000 / 220) {
            hit = true;
            if (lastDetectedBeat) {
                const dt = now - lastDetectedBeat;
                if (dt > 250 && dt < 1500) {
                    detectedIntervals.push(dt);
                    if (detectedIntervals.length > 12) detectedIntervals.shift();
                }
            }
            lastDetectedBeat = now;
            state.beatIndex++;
            state.lastBeatAt = now;
            beatEnv = 1;
            emit('beat', { index: state.beatIndex, energy: rawBass });
        }

        const peak = peakDetector.onset(rawBass, rawMid, state.sensitivity);
        const strongHit = hit && peak.strongHit;
        if (strongHit) lastStrongHitAt = now;

        // Track tempo from detected onsets unless the user locked BPM
        if (!state.bpmLocked && detectedIntervals.length >= 6) {
            const sorted = [...detectedIntervals].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const bpm = Math.round(60000 / median);
            if (bpm >= 60 && bpm <= 200 && Math.abs(bpm - state.bpm) > 1) {
                state.bpm += (bpm - state.bpm) * 0.25;
            }
        }

        beatEnv *= 0.86;
        const spb = 60000 / state.bpm / state.beatDivision;
        state.beatPhase = ((now - state.lastBeatAt) % spb) / spb;

        return {
            bass: smBass * state.sensitivity,
            mid: smMid * state.sensitivity,
            treble: smTreble * state.sensitivity,
            beat: beatEnv,
            hit,
            strongHit,
            energy: peak.energy,
            beatIndex: state.beatIndex,
            beatPhase: state.beatPhase,
            bpm: Math.round(state.bpm),
            playing: state.playing,
            mode: state.mode,
            analysed: true,
            beforeFirstBeat: false,
            afterLastBeat: false,
            beatLive: state.playing
        };
    }

    /** Spotify beat map frame (from audio-analysis) */
    function spotifyBeatFrame() {
        const tick = beatBridge.requestTick();
        const now = performance.now();
        if (tick.strongHit) {
            lastStrongHitAt = now;
            emit('beat', { index: tick.beatIndex, energy: tick.energy, strong: true });
        } else if (tick.hit) {
            emit('beat', { index: tick.beatIndex, energy: tick.energy });
        }
        state.beatIndex = tick.beatIndex;
        state.beatPhase = tick.beatPhase;

        return {
            bass: tick.bass * state.sensitivity,
            mid: tick.mid * state.sensitivity,
            treble: tick.treble * state.sensitivity,
            beat: tick.beat,
            hit: tick.hit,
            strongHit: tick.strongHit,
            energy: tick.energy,
            beatIndex: tick.beatIndex,
            beatPhase: tick.beatPhase,
            bpm: Math.round(state.bpm),
            playing: state.playing,
            mode: state.mode,
            analysed: tick.analysed,
            beforeFirstBeat: !!tick.beforeFirstBeat,
            afterLastBeat: !!tick.afterLastBeat,
            beatLive: tick.beatLive !== false,
            syncSec: beatBridge.getProgressMs?.() ? beatBridge.getProgressMs() / 1000 : 0
        };
    }

    /** Synthesised frame from the BPM clock (YouTube / idle fallback) */
    function clockFrame() {
        const now = performance.now();
        const spb = 60000 / state.bpm / state.beatDivision;
        const elapsed = now - state.clockStart;
        const idx = Math.floor(elapsed / spb);
        let hit = false;
        if (idx !== state.beatIndex) {
            hit = idx > state.beatIndex;
            state.beatIndex = idx;
            state.lastBeatAt = state.clockStart + idx * spb;
            if (hit) emit('beat', { index: idx, energy: 1 });
        }
        const phase = (elapsed % spb) / spb;
        state.beatPhase = phase;

        const env = state.playing ? Math.pow(1 - phase, 2.4) : 0;
        const bar = Math.floor(idx / 4);
        const bass = state.playing ? env * (0.72 + 0.2 * Math.sin(bar * 0.7)) : 0;
        const mid = state.playing ? (0.28 + 0.22 * Math.sin(elapsed * 0.0031)) * (0.5 + env * 0.6) : 0;
        const treble = state.playing
            ? (0.2 + 0.18 * Math.abs(Math.sin(elapsed * 0.0057))) * (0.4 + env * 0.7)
            : 0;

        const peak = peakDetector.onset(bass, mid, state.sensitivity);
        const every = state.strongBeatThreshold < 0.4 ? 2
            : state.strongBeatThreshold < 1.0 ? 4
            : state.strongBeatThreshold < 1.5 ? 8
            : 16;
        const strongHit = hit && (idx % every === 0 || peak.strongHit);

        return {
            bass: bass * state.sensitivity,
            mid: mid * state.sensitivity,
            treble: treble * state.sensitivity,
            beat: env,
            hit,
            strongHit,
            energy: peak.energy,
            beatIndex: state.beatIndex,
            beatPhase: phase,
            bpm: Math.round(state.bpm),
            playing: state.playing,
            mode: state.mode,
            analysed: false,
            beforeFirstBeat: false,
            afterLastBeat: false,
            beatLive: state.playing
        };
    }

    function update() {
        if (state.mode === 'spotify') {
            if (!state.playing) return silentFrame();
            return spotifyBeatFrame();
        }
        const canAnalyse = analyser && (state.mode === 'file' || state.mode === 'mic' || state.mode === 'procedural');
        if (canAnalyse && state.playing) return analyse();
        return clockFrame();
    }

    function getSpotifyProgress() {
        if (state.mode !== 'spotify') return null;
        return {
            progressMs: beatBridge.getProgressMs?.() ?? 0,
            playing: state.playing
        };
    }

    function getStatus() {
        return {
            mode: state.mode,
            playing: state.playing,
            bpm: Math.round(state.bpm),
            bpmLocked: state.bpmLocked,
            beatDivision: state.beatDivision,
            label: state.label
        };
    }

    return {
        update,
        getStatus,
        getQueue,
        startProcedural,
        startSpotifySync,
        upgradeSpotifyBeatMap,
        syncSpotifyProgress,
        getSpotifyProgress,
        loadFile,
        enqueueFiles,
        removeFromQueue,
        clearQueue,
        playPlaylistIndex,
        playNextInQueue,
        playPrevInQueue,
        startMic,
        loadYouTube,
        stop,
        togglePlay,
        setVolume,
        setBpm,
        setBpmLocked,
        setBeatDivision,
        setSensitivity,
        setStrongBeatThreshold,
        getStrongBeatThreshold: () => state.strongBeatThreshold,
        tapTempo,
        resyncClock,
        on(name, fn) {
            if (!listeners[name]) listeners[name] = [];
            listeners[name].push(fn);
            return () => {
                const arr = listeners[name];
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            };
        }
    };
}
