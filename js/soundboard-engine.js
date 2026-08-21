/**
 * TokControl Soundboard — audio engine + persistence (IndexedDB blobs, localStorage meta).
 * UI must not own playback; everything goes through window.TokSoundboard.
 */
(function (global) {
    'use strict';

    const META_KEY = 'tokcontrol_soundboard_v1';
    const DB_NAME = 'tokcontrol_soundboard';
    const DB_VERSION = 1;
    const BLOB_STORE = 'blobs';
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const ALLOWED_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'webm'];
    const ALLOWED_MIME = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
        'audio/ogg', 'application/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
        'audio/aac', 'audio/webm'
    ];
    const DEFAULT_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f'];
    const RESERVED_KEYS = new Set(['escape', 'tab', 'enter', 'f5', 'f12', 'meta', 'control', 'alt', 'shift']);
    const CATEGORIES = [
        { id: 'all', label: 'ทั้งหมด', icon: 'layers' },
        { id: 'sfx', label: 'เอฟเฟกต์', icon: 'volume' },
        { id: 'meme', label: 'มีม / คาเฟ', icon: 'smile' },
        { id: 'music', label: 'เพลง', icon: 'headphones' },
        { id: 'announce', label: 'ประกาศ', icon: 'mic' },
        { id: 'game', label: 'เกม', icon: 'gamepad' },
        { id: 'other', label: 'อื่น ๆ', icon: 'folder' },
        { id: 'favorites', label: 'รายการโปรด', icon: 'heart' }
    ];

    const DEFAULT_SETTINGS = {
        enabled: true,
        masterVolume: 86,
        muted: false,
        defaultPlaybackMode: 'oneshot',
        defaultFadeIn: 0,
        defaultFadeOut: 200,
        allowMultiple: true,
        maxConcurrent: 5,
        rememberVolume: true,
        globalPads: true,
        hideMiniPlayer: false,
        openShortcut: 'F8',
        stopShortcut: 'F9',
        lastCategory: 'all'
    };

    let db = null;
    let state = {
        sounds: [],
        playlists: [],
        settings: Object.assign({}, DEFAULT_SETTINGS),
        updatedAt: null
    };
    let readyResolve;
    const ready = new Promise((r) => { readyResolve = r; });
    const listeners = new Map();
    const objectUrls = new Map();
    const dataUrlCache = new Map();
    const voices = new Map();
    const holdKeys = new Map();
    let playlistJob = null;
    let lastPlayedId = null;
    let lastListIds = [];
    let hotkeysSuspended = 0;
    let pickerHost = null;
    let toastHost = null;

    function uid(prefix) {
        return (prefix || 'sb') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function emit(name, detail) {
        const set = listeners.get(name);
        if (set) set.forEach((fn) => {
            try { fn(detail); } catch (e) { console.warn('[Soundboard]', e); }
        });
        try {
            document.dispatchEvent(new CustomEvent('toksoundboard:' + name, { detail }));
        } catch (_) {}
    }

    function on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => off(name, fn);
    }

    function off(name, fn) {
        const set = listeners.get(name);
        if (set) set.delete(fn);
    }

    function toast(type, title, message) {
        if (typeof global.showCustomMsg === 'function') {
            try { global.showCustomMsg(type, title, message || ''); } catch (_) {}
        }
        ensureToastHost();
        const el = document.createElement('div');
        el.className = 'sb-toast sb-toast--' + (type || 'info');
        el.innerHTML = '<strong>' + escapeHtml(title || '') + '</strong>' +
            (message ? '<span>' + escapeHtml(message) + '</span>' : '');
        toastHost.appendChild(el);
        setTimeout(() => {
            el.classList.add('is-out');
            setTimeout(() => el.remove(), 280);
        }, 2600);
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function ensureToastHost() {
        if (!document.body) return;
        if (toastHost && document.body.contains(toastHost)) return;
        toastHost = document.getElementById('sbToastHost');
        if (!toastHost) {
            toastHost = document.createElement('div');
            toastHost.id = 'sbToastHost';
            toastHost.className = 'sb-toast-host';
            toastHost.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastHost);
        }
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains(BLOB_STORE)) {
                    d.createObjectStore(BLOB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IDB open failed'));
        });
    }

    function idbPut(id, blob, mime) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BLOB_STORE, 'readwrite');
            tx.objectStore(BLOB_STORE).put({ id, blob, mime: mime || blob.type || 'audio/mpeg' });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function idbGet(id) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BLOB_STORE, 'readonly');
            const req = tx.objectStore(BLOB_STORE).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    function idbDelete(id) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(BLOB_STORE, 'readwrite');
            tx.objectStore(BLOB_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function loadMeta() {
        try {
            const raw = localStorage.getItem(META_KEY);
            if (!raw) return emptyState();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return emptyState();
            parsed.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
            parsed.sounds = Array.isArray(parsed.sounds) ? parsed.sounds : [];
            parsed.playlists = Array.isArray(parsed.playlists) ? parsed.playlists : [];
            return parsed;
        } catch (_) {
            return emptyState();
        }
    }

    function emptyState() {
        return {
            sounds: [],
            playlists: [],
            settings: Object.assign({}, DEFAULT_SETTINGS),
            updatedAt: nowIso()
        };
    }

    function saveMeta() {
        state.updatedAt = nowIso();
        try {
            localStorage.setItem(META_KEY, JSON.stringify({
                sounds: state.sounds,
                playlists: state.playlists,
                settings: state.settings,
                updatedAt: state.updatedAt
            }));
        } catch (e) {
            console.warn('[Soundboard] persist failed', e);
        }
        emit('change', getState());
        try {
            if (typeof global.syncGlobalHotkeysToMain === 'function') global.syncGlobalHotkeysToMain();
        } catch (_) {}
    }

    function getState() {
        return {
            sounds: state.sounds.map((s) => Object.assign({}, s)),
            playlists: state.playlists.map((p) => Object.assign({}, p, { soundIds: (p.soundIds || []).slice() })),
            settings: Object.assign({}, state.settings),
            updatedAt: state.updatedAt
        };
    }

    function getSound(id) {
        return state.sounds.find((s) => s.id === id) || null;
    }

    function safeFilename(name) {
        const base = String(name || 'audio').replace(/\\/g, '/').split('/').pop();
        return base.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'audio';
    }

    function extOf(name) {
        const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return m ? m[1] : '';
    }

    function validateFile(file) {
        if (!file) return 'ไม่พบไฟล์';
        if (file.size <= 0) return 'ไฟล์ว่าง';
        if (file.size > MAX_FILE_BYTES) return 'ไฟล์ใหญ่เกิน 25 MB';
        const name = safeFilename(file.name);
        const ext = extOf(name);
        const mime = String(file.type || '').toLowerCase();
        const okExt = ALLOWED_EXT.includes(ext);
        const okMime = !mime || ALLOWED_MIME.includes(mime) || mime.startsWith('audio/');
        if (!okExt && !okMime) return 'รองรับเฉพาะ MP3, WAV, OGG, M4A, WEBM';
        if (!okExt && mime && !mime.startsWith('audio/')) return 'ชนิดไฟล์ไม่รองรับ';
        return null;
    }

    function probeDuration(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio();
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                try { URL.revokeObjectURL(url); } catch (_) {}
                audio.src = '';
                resolve(val);
            };
            audio.preload = 'metadata';
            audio.onloadedmetadata = () => finish(isFinite(audio.duration) ? audio.duration : 0);
            audio.onerror = () => finish(0);
            setTimeout(() => finish(0), 8000);
            audio.src = url;
        });
    }

    function nextHotkey() {
        const used = new Set(state.sounds.map((s) => normalizeHotkey(s.hotkey)).filter(Boolean));
        for (const key of DEFAULT_HOTKEYS) {
            if (!used.has(key)) return key;
        }
        return '';
    }

    function normalizeHotkey(key) {
        if (!key) return '';
        const k = String(key).trim();
        if (!k) return '';
        if (k.length === 1) return k.toLowerCase();
        return k;
    }

    function isReservedHotkey(key, exceptId) {
        const k = normalizeHotkey(key);
        if (!k) return false;
        if (RESERVED_KEYS.has(k.toLowerCase())) return true;
        const open = normalizeHotkey(state.settings.openShortcut || 'F8');
        const stop = normalizeHotkey(state.settings.stopShortcut || 'F9');
        if (k.toLowerCase() === open.toLowerCase() || k.toLowerCase() === stop.toLowerCase()) return true;
        try {
            if (typeof global.getAllResolvedAppHotkeys === 'function') {
                const items = global.getAllResolvedAppHotkeys() || [];
                for (const item of items) {
                    if (!item || !item.key) continue;
                    if (String(item.id || '').startsWith('sb:')) continue;
                    if (item.id === 'sb-toggle' || item.id === 'sb-stop') continue;
                    if (normalizeHotkey(item.key) === k) return true;
                }
            }
        } catch (_) {}
        return false;
    }

    function isHotkeyTaken(key, exceptId) {
        const k = normalizeHotkey(key);
        if (!k) return false;
        return state.sounds.some((s) => s.id !== exceptId && normalizeHotkey(s.hotkey) === k);
    }

    async function revokeUrl(id) {
        const url = objectUrls.get(id);
        if (url) {
            try { URL.revokeObjectURL(url); } catch (_) {}
            objectUrls.delete(id);
        }
        dataUrlCache.delete(id);
    }

    async function getObjectUrl(id) {
        if (objectUrls.has(id)) return objectUrls.get(id);
        const rec = await idbGet(id);
        if (!rec || !rec.blob) return null;
        const url = URL.createObjectURL(rec.blob);
        objectUrls.set(id, url);
        if (objectUrls.size > 24) {
            const first = objectUrls.keys().next().value;
            if (first && first !== id && !voices.has(first)) {
                try { URL.revokeObjectURL(objectUrls.get(first)); } catch (_) {}
                objectUrls.delete(first);
            }
        }
        return url;
    }

    async function getDataUrl(id) {
        if (dataUrlCache.has(id)) return dataUrlCache.get(id);
        const rec = await idbGet(id);
        if (!rec || !rec.blob) return null;
        const url = await blobToDataUrl(rec.blob);
        if (url && dataUrlCache.size < 8) dataUrlCache.set(id, url);
        return url;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    function clamp01(n) {
        const v = Number(n);
        if (!isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    }

    function masterGain() {
        if (state.settings.muted) return 0;
        return clamp01((state.settings.masterVolume || 0) / 100);
    }

    function effectiveVolume(sound, override) {
        const local = override != null ? override : (sound.volume != null ? sound.volume : 80);
        return clamp01(masterGain() * clamp01(local / 100));
    }

    function fadeTo(voice, target, ms) {
        return new Promise((resolve) => {
            const audio = voice.el;
            const from = audio.volume;
            const dur = Math.max(0, Number(ms) || 0);
            if (dur < 16 || Math.abs(from - target) < 0.01) {
                audio.volume = target;
                resolve();
                return;
            }
            const start = performance.now();
            const step = (t) => {
                if (voice.dead) { resolve(); return; }
                const p = Math.min(1, (t - start) / dur);
                audio.volume = from + (target - from) * p;
                if (p < 1) voice.fadeRaf = requestAnimationFrame(step);
                else resolve();
            };
            if (voice.fadeRaf) cancelAnimationFrame(voice.fadeRaf);
            voice.fadeRaf = requestAnimationFrame(step);
        });
    }

    function disposeVoice(playId, opts) {
        const voice = voices.get(playId);
        if (!voice) return;
        voice.dead = true;
        if (voice.fadeRaf) cancelAnimationFrame(voice.fadeRaf);
        try {
            voice.el.pause();
            voice.el.removeAttribute('src');
            voice.el.load();
        } catch (_) {}
        voices.delete(playId);
        if (!opts || !opts.silent) emit('playback', getActivePlayback());
    }

    function getActivePlayback() {
        const list = [];
        voices.forEach((v, playId) => {
            if (v.dead) return;
            const el = v.el;
            list.push({
                playId,
                soundId: v.soundId,
                name: v.name,
                paused: el.paused,
                currentTime: el.currentTime || 0,
                duration: isFinite(el.duration) ? el.duration : (v.duration || 0),
                volume: v.userVolume,
                icon: v.icon || 'volume'
            });
        });
        return list;
    }

    async function enforceConcurrency() {
        const allow = !!state.settings.allowMultiple;
        const max = allow ? Math.max(1, parseInt(state.settings.maxConcurrent, 10) || 5) : 1;
        while (voices.size >= max) {
            const oldest = voices.keys().next().value;
            if (!oldest) break;
            await stopPlayId(oldest, { fade: false });
        }
    }

    async function play(soundId, opts) {
        const options = opts || {};
        if (!state.settings.enabled && options.source !== 'action' && options.source !== 'alert' && !options.force) {
            toast('error', 'Soundboard ปิดอยู่', 'เปิดใช้งานในแท็บตั้งค่าการเล่น');
            return null;
        }
        const sound = getSound(soundId);
        if (!sound) {
            toast('error', 'ไม่สามารถเล่นเสียงได้', 'ไม่พบเสียงนี้');
            return null;
        }
        const mode = options.mode || sound.playbackMode || state.settings.defaultPlaybackMode || 'oneshot';

        if (mode === 'toggle') {
            const existing = [...voices.values()].find((v) => v.soundId === soundId && !v.dead);
            if (existing) {
                await stopPlayId(existing.playId);
                return null;
            }
        }

        if (mode === 'oneshot') {
            const existing = [...voices.values()].find((v) => v.soundId === soundId && !v.dead);
            if (existing && !state.settings.allowMultiple) {
                await stopPlayId(existing.playId, { fade: false });
            }
        }

        await enforceConcurrency();

        const url = await getObjectUrl(soundId);
        if (!url) {
            sound.error = true;
            saveMeta();
            toast('error', 'ไม่สามารถโหลดเสียงนี้ได้', sound.name);
            emit('error', { soundId, reason: 'load' });
            return null;
        }

        const playId = uid('play');
        const audio = new Audio();
        audio.preload = 'auto';
        const voice = {
            playId,
            soundId,
            name: sound.name,
            icon: sound.icon || categoryIcon(sound.categoryId),
            el: audio,
            userVolume: sound.volume != null ? sound.volume : 80,
            duration: sound.duration || 0,
            dead: false,
            fadeRaf: 0
        };
        voices.set(playId, voice);
        lastPlayedId = soundId;

        const fadeIn = options.fadeIn != null ? options.fadeIn : (sound.fadeIn != null ? sound.fadeIn : state.settings.defaultFadeIn);
        const fadeOut = options.fadeOut != null ? options.fadeOut : (sound.fadeOut != null ? sound.fadeOut : state.settings.defaultFadeOut);
        voice.fadeOut = fadeOut;
        const targetVol = effectiveVolume(sound, options.volume);
        audio.volume = fadeIn > 0 ? 0 : targetVol;
        audio.src = url;

        audio.onended = () => {
            disposeVoice(playId);
            if (playlistJob && playlistJob.waitingPlayId === playId) advancePlaylist();
        };
        audio.onerror = () => {
            sound.error = true;
            saveMeta();
            toast('error', 'ไฟล์เสียงไม่สามารถเล่นได้', sound.name);
            disposeVoice(playId);
            emit('error', { soundId, reason: 'play' });
        };
        audio.ontimeupdate = () => {
            if (!voice._tick || Date.now() - voice._tick > 180) {
                voice._tick = Date.now();
                emit('playback', getActivePlayback());
            }
        };

        try {
            await audio.play();
        } catch (e) {
            disposeVoice(playId);
            toast('error', 'ไม่สามารถเล่นเสียงได้', e.message || sound.name);
            emit('error', { soundId, reason: 'play', error: e });
            return null;
        }
        if (fadeIn > 0) fadeTo(voice, targetVol, fadeIn);
        emit('playback', getActivePlayback());
        return playId;
    }

    async function stopPlayId(playId, opts) {
        const voice = voices.get(playId);
        if (!voice) return;
        const fade = opts && opts.fade === false ? 0 : (voice.fadeOut || 0);
        if (fade > 40) {
            await fadeTo(voice, 0, fade);
        }
        disposeVoice(playId, opts);
    }

    async function stop(soundId) {
        const ids = [...voices.entries()].filter(([, v]) => v.soundId === soundId).map(([id]) => id);
        for (const id of ids) await stopPlayId(id);
    }

    async function pause(soundId) {
        voices.forEach((v) => {
            if (soundId && v.soundId !== soundId) return;
            try {
                if (v.el.paused) v.el.play().catch(() => {});
                else v.el.pause();
            } catch (_) {}
        });
        emit('playback', getActivePlayback());
    }

    async function pausePlayId(playId) {
        const v = voices.get(playId);
        if (!v) return;
        try {
            if (v.el.paused) await v.el.play();
            else v.el.pause();
        } catch (_) {}
        emit('playback', getActivePlayback());
    }

    async function stopAll() {
        playlistJob = null;
        const ids = [...voices.keys()];
        for (const id of ids) await stopPlayId(id, { fade: false, silent: true });
        emit('playback', getActivePlayback());
    }

    function setMasterVolume(val) {
        const n = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
        state.settings.masterVolume = n;
        if (state.settings.rememberVolume) saveMeta();
        else emit('change', getState());
        voices.forEach((v) => {
            const sound = getSound(v.soundId);
            if (sound) v.el.volume = effectiveVolume(sound, v.userVolume);
        });
        emit('playback', getActivePlayback());
    }

    function setMuted(muted) {
        state.settings.muted = !!muted;
        saveMeta();
        voices.forEach((v) => {
            const sound = getSound(v.soundId);
            if (sound) v.el.volume = effectiveVolume(sound, v.userVolume);
        });
        emit('playback', getActivePlayback());
    }

    function setTrackVolume(playId, vol) {
        const v = voices.get(playId);
        if (!v) return;
        v.userVolume = Math.max(0, Math.min(100, parseInt(vol, 10) || 0));
        const sound = getSound(v.soundId);
        v.el.volume = effectiveVolume(sound || { volume: v.userVolume }, v.userVolume);
        emit('playback', getActivePlayback());
    }

    function categoryIcon(catId) {
        const c = CATEGORIES.find((x) => x.id === catId);
        return (c && c.icon) || 'volume';
    }

    async function addSoundFromFile(file, meta, opts) {
        const err = validateFile(file);
        if (err) return { ok: false, error: err, filename: file && file.name };
        const filename = safeFilename(file.name);
        const existing = state.sounds.find((s) => s.filename === filename && s.fileSize === file.size);
        if (existing && !(opts && opts.replace)) {
            return { ok: false, duplicate: true, existingId: existing.id, filename };
        }
        const duration = await probeDuration(file);
        const id = (existing && opts && opts.replace) ? existing.id : uid('snd');
        const patch = meta || {};
        const record = Object.assign({}, existing || {}, {
            id,
            name: (patch.name || filename.replace(/\.[^.]+$/, '') || 'เสียงใหม่').slice(0, 80),
            filename,
            duration,
            format: extOf(filename).toUpperCase() || 'AUDIO',
            fileSize: file.size,
            categoryId: patch.categoryId || existing?.categoryId || guessCategory(filename, patch.name),
            tags: Array.isArray(patch.tags) ? patch.tags : (existing?.tags || []),
            favorite: !!(patch.favorite ?? existing?.favorite),
            hotkey: patch.hotkey != null ? normalizeHotkey(patch.hotkey) : (existing?.hotkey || nextHotkey()),
            volume: patch.volume != null ? patch.volume : (existing?.volume ?? 80),
            playbackMode: patch.playbackMode || existing?.playbackMode || state.settings.defaultPlaybackMode || 'oneshot',
            fadeIn: patch.fadeIn != null ? patch.fadeIn : (existing?.fadeIn ?? state.settings.defaultFadeIn),
            fadeOut: patch.fadeOut != null ? patch.fadeOut : (existing?.fadeOut ?? state.settings.defaultFadeOut),
            icon: patch.icon || existing?.icon || categoryIcon(patch.categoryId || existing?.categoryId || 'sfx'),
            error: false,
            createdAt: existing?.createdAt || nowIso(),
            updatedAt: nowIso()
        });
        if (record.hotkey && (isReservedHotkey(record.hotkey, id) || isHotkeyTaken(record.hotkey, id))) {
            record.hotkey = nextHotkey();
        }
        await idbPut(id, file, file.type);
        await revokeUrl(id);
        if (existing && opts && opts.replace) {
            const idx = state.sounds.findIndex((s) => s.id === id);
            state.sounds[idx] = record;
        } else {
            state.sounds.push(record);
        }
        saveMeta();
        return { ok: true, sound: record, replaced: !!(existing && opts && opts.replace) };
    }

    function guessCategory(filename, name) {
        const t = (filename + ' ' + (name || '')).toLowerCase();
        if (/meme|bruh|vine|airhorn|mlg|wow/.test(t)) return 'meme';
        if (/music|song|bgm|loop|theme|beat/.test(t)) return 'music';
        if (/announce|intro|outro|welcome|follow/.test(t)) return 'announce';
        if (/game|win|lose|level|coin|power/.test(t)) return 'game';
        if (/applause|cheer|crowd|boom|explode|laser|whoosh|sfx/.test(t)) return 'sfx';
        return 'sfx';
    }

    async function importFiles(fileList, opts) {
        const files = Array.from(fileList || []).filter(Boolean);
        const results = [];
        for (const file of files) {
            results.push(await addSoundFromFile(file, opts && opts.meta, opts));
        }
        return results;
    }

    function updateSound(id, patch) {
        const sound = getSound(id);
        if (!sound) return false;
        if (patch.hotkey != null) {
            const key = normalizeHotkey(patch.hotkey);
            if (key && isReservedHotkey(key, id)) {
                toast('error', 'ปุ่มนี้ถูกใช้งานแล้ว', 'คีย์นี้ถูกจองโดยระบบ');
                return false;
            }
            if (key && isHotkeyTaken(key, id)) {
                toast('error', 'ปุ่มนี้ถูกใช้งานแล้ว', formatHotkey(key));
                return false;
            }
            sound.hotkey = key;
        }
        const keys = ['name', 'categoryId', 'tags', 'favorite', 'volume', 'playbackMode', 'fadeIn', 'fadeOut', 'icon'];
        keys.forEach((k) => {
            if (patch[k] !== undefined) sound[k] = patch[k];
        });
        if (typeof sound.name === 'string') sound.name = sound.name.slice(0, 80);
        if (sound.volume != null) sound.volume = Math.max(0, Math.min(100, parseInt(sound.volume, 10) || 0));
        sound.updatedAt = nowIso();
        saveMeta();
        return true;
    }

    async function deleteSound(id) {
        await stop(id);
        state.sounds = state.sounds.filter((s) => s.id !== id);
        state.playlists.forEach((p) => {
            p.soundIds = (p.soundIds || []).filter((x) => x !== id);
        });
        await revokeUrl(id);
        try { await idbDelete(id); } catch (_) {}
        saveMeta();
        return true;
    }

    function toggleFavorite(id) {
        const sound = getSound(id);
        if (!sound) return false;
        sound.favorite = !sound.favorite;
        sound.updatedAt = nowIso();
        saveMeta();
        return sound.favorite;
    }

    function updateSettings(partial) {
        Object.assign(state.settings, partial || {});
        if (state.settings.maxConcurrent != null) {
            state.settings.maxConcurrent = Math.max(1, parseInt(state.settings.maxConcurrent, 10) || 1);
        }
        ['defaultFadeIn', 'defaultFadeOut', 'masterVolume'].forEach((k) => {
            if (state.settings[k] != null) state.settings[k] = Math.max(0, parseInt(state.settings[k], 10) || 0);
        });
        saveMeta();
        voices.forEach((v) => {
            const sound = getSound(v.soundId);
            if (sound) v.el.volume = effectiveVolume(sound, v.userVolume);
        });
        emit('playback', getActivePlayback());
    }

    function formatHotkey(key) {
        const k = normalizeHotkey(key);
        if (!k) return '';
        if (k.length === 1) return k.toUpperCase();
        return k;
    }

    function formatDuration(sec) {
        const n = Math.max(0, Math.round(Number(sec) || 0));
        const m = Math.floor(n / 60);
        const s = n % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function formatSize(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function getStats() {
        const total = state.sounds.length;
        const bytes = state.sounds.reduce((a, s) => a + (s.fileSize || 0), 0);
        const formats = [...new Set(state.sounds.map((s) => s.format).filter(Boolean))];
        return {
            total,
            bytes,
            spaceLabel: formatSize(bytes),
            formats: formats.length ? formats.join(', ') : 'MP3, WAV, OGG',
            updatedAt: state.updatedAt
        };
    }

    function searchSounds(query, categoryId) {
        const q = String(query || '').trim().toLowerCase();
        let list = state.sounds.slice();
        if (categoryId && categoryId !== 'all') {
            if (categoryId === 'favorites') list = list.filter((s) => s.favorite);
            else list = list.filter((s) => s.categoryId === categoryId);
        }
        if (q) {
            list = list.filter((s) => {
                const tags = (s.tags || []).join(' ');
                return (s.name || '').toLowerCase().includes(q)
                    || (s.filename || '').toLowerCase().includes(q)
                    || (s.categoryId || '').toLowerCase().includes(q)
                    || tags.toLowerCase().includes(q)
                    || (s.hotkey || '').toLowerCase() === q;
            });
        }
        lastListIds = list.map((s) => s.id);
        return list;
    }

    function createPlaylist(name) {
        const p = {
            id: uid('pl'),
            name: (name || 'เพลย์ลิสต์ใหม่').slice(0, 60),
            soundIds: [],
            lastPlayed: null,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
        state.playlists.push(p);
        saveMeta();
        return p;
    }

    function getPlaylist(id) {
        return state.playlists.find((p) => p.id === id) || null;
    }

    function renamePlaylist(id, name) {
        const p = getPlaylist(id);
        if (!p) return false;
        p.name = String(name || p.name).slice(0, 60);
        p.updatedAt = nowIso();
        saveMeta();
        return true;
    }

    function deletePlaylist(id) {
        if (playlistJob && playlistJob.playlistId === id) playlistJob = null;
        state.playlists = state.playlists.filter((p) => p.id !== id);
        saveMeta();
        return true;
    }

    function duplicatePlaylist(id) {
        const p = getPlaylist(id);
        if (!p) return null;
        const copy = {
            id: uid('pl'),
            name: (p.name + ' สำเนา').slice(0, 60),
            soundIds: (p.soundIds || []).slice(),
            lastPlayed: null,
            createdAt: nowIso(),
            updatedAt: nowIso()
        };
        state.playlists.push(copy);
        saveMeta();
        return copy;
    }

    function setPlaylistSounds(id, soundIds) {
        const p = getPlaylist(id);
        if (!p) return false;
        p.soundIds = (soundIds || []).filter((sid) => !!getSound(sid));
        p.updatedAt = nowIso();
        saveMeta();
        return true;
    }

    function playlistMeta(p) {
        const sounds = (p.soundIds || []).map(getSound).filter(Boolean);
        const duration = sounds.reduce((a, s) => a + (s.duration || 0), 0);
        return { count: sounds.length, duration, durationLabel: formatDuration(duration) };
    }

    function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }

    async function playPlaylist(id, opts) {
        const p = getPlaylist(id);
        if (!p) return;
        let ids = (p.soundIds || []).filter((sid) => !!getSound(sid));
        if (!ids.length) {
            toast('error', 'เพลย์ลิสต์ว่าง', 'เพิ่มเสียงก่อนเล่น');
            return;
        }
        if (opts && opts.shuffle) ids = shuffleInPlace(ids.slice());
        playlistJob = {
            playlistId: id,
            ids,
            index: 0,
            loop: !!(opts && opts.loop),
            waitingPlayId: null
        };
        p.lastPlayed = nowIso();
        saveMeta();
        await playNextInJob();
    }

    async function playNextInJob() {
        if (!playlistJob) return;
        if (playlistJob.index >= playlistJob.ids.length) {
            if (playlistJob.loop) playlistJob.index = 0;
            else { playlistJob = null; return; }
        }
        const sid = playlistJob.ids[playlistJob.index];
        const playId = await play(sid, { source: 'playlist' });
        playlistJob.waitingPlayId = playId;
        playlistJob.index += 1;
    }

    function advancePlaylist() {
        if (!playlistJob) return;
        playNextInJob();
    }

    function setLastList(ids) {
        lastListIds = ids || [];
    }

    function playAdjacent(dir) {
        const ids = lastListIds.length ? lastListIds : state.sounds.map((s) => s.id);
        if (!ids.length) return;
        const cur = lastPlayedId && ids.includes(lastPlayedId) ? ids.indexOf(lastPlayedId) : -1;
        let next = cur + dir;
        if (next < 0) next = ids.length - 1;
        if (next >= ids.length) next = 0;
        play(ids[next]);
    }

    function findSoundByHotkey(key) {
        const k = normalizeHotkey(key);
        if (!k) return null;
        return state.sounds.find((s) => normalizeHotkey(s.hotkey) === k) || null;
    }

    function getPadHotkeyItems() {
        return state.sounds
            .filter((s) => s.hotkey)
            .map((s) => ({
                id: 'sb:' + s.id,
                module: 'Soundboard',
                action: s.name,
                key: s.hotkey,
                defaultKey: s.hotkey,
                goto: 'soundboard',
                soundId: s.id
            }));
    }

    function typingTarget(el) {
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    let lastPadFire = { id: '', t: 0 };

    async function handlePadHotkey(soundId, phase, repeat) {
        if (hotkeysSuspended > 0) return;
        if (!state.settings.enabled) return;
        const sound = getSound(soundId);
        if (!sound) return;
        const mode = sound.playbackMode || state.settings.defaultPlaybackMode || 'oneshot';
        if (phase === 'up') {
            if (mode === 'hold') await stop(soundId);
            return;
        }
        if (repeat && mode === 'hold') return;
        const now = Date.now();
        if (lastPadFire.id === soundId && now - lastPadFire.t < 90) return;
        lastPadFire = { id: soundId, t: now };
        if (mode === 'hold') {
            const playing = [...voices.values()].some((v) => v.soundId === soundId && !v.dead);
            if (!playing) await play(soundId, { mode: 'hold' });
            return;
        }
        await play(soundId, { mode });
    }

    let lastToggleAt = 0;

    function togglePage() {
        const now = Date.now();
        if (now - lastToggleAt < 150) return;
        lastToggleAt = now;
        const view = document.getElementById('soundboardView');
        const isOn = view && view.classList.contains('active');
        if (typeof global.switchMainTab === 'function') {
            global.switchMainTab(isOn ? 'dashboard' : 'soundboard');
        }
    }

    function suspendHotkeys() { hotkeysSuspended += 1; }
    function resumeHotkeys() { hotkeysSuspended = Math.max(0, hotkeysSuspended - 1); }

    function ensurePicker() {
        if (pickerHost && document.body.contains(pickerHost)) return pickerHost;
        pickerHost = document.getElementById('sbPickerOverlay');
        if (pickerHost) return pickerHost;
        pickerHost = document.createElement('div');
        pickerHost.id = 'sbPickerOverlay';
        pickerHost.className = 'sb-overlay';
        pickerHost.setAttribute('aria-hidden', 'true');
        pickerHost.innerHTML = `
            <div class="sb-modal sb-modal--picker" role="dialog" aria-labelledby="sbPickerTitle">
                <div class="sb-modal-head">
                    <h3 id="sbPickerTitle">เลือกเสียงจาก Soundboard</h3>
                    <button type="button" class="sb-icon-btn" data-sb-picker-close aria-label="ปิด">×</button>
                </div>
                <div class="sb-modal-body">
                    <input type="search" class="sb-search" id="sbPickerSearch" placeholder="ค้นหาเสียง...">
                    <div class="sb-picker-list" id="sbPickerList"></div>
                </div>
            </div>`;
        pickerHost.addEventListener('click', (e) => {
            if (e.target === pickerHost || e.target.closest('[data-sb-picker-close]')) closePicker();
        });
        document.body.appendChild(pickerHost);
        return pickerHost;
    }

    let pickerCallback = null;

    function renderPickerList(query) {
        const list = document.getElementById('sbPickerList');
        if (!list) return;
        const sounds = searchSounds(query, 'all');
        if (!sounds.length) {
            list.innerHTML = '<div class="sb-empty-inline">ยังไม่มีเสียงใน Soundboard</div>';
            return;
        }
        list.innerHTML = sounds.map((s) => `
            <button type="button" class="sb-picker-item" data-id="${escapeHtml(s.id)}">
                <span class="sb-picker-ico" data-tc-icon="${escapeHtml(s.icon || 'volume')}" data-size="16"></span>
                <span class="sb-picker-name">${escapeHtml(s.name)}</span>
                <span class="sb-picker-meta">${escapeHtml(s.hotkey ? formatHotkey(s.hotkey) : '')} · ${formatDuration(s.duration)}</span>
            </button>`).join('');
        if (global.TcIcons) TcIcons.hydrateAll(list);
        list.querySelectorAll('[data-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sound = getSound(btn.getAttribute('data-id'));
                if (sound && pickerCallback) pickerCallback(sound);
                closePicker();
            });
        });
    }

    function openPicker(opts) {
        ensurePicker();
        pickerCallback = opts && opts.onPick ? opts.onPick : null;
        pickerHost.classList.add('is-open');
        pickerHost.setAttribute('aria-hidden', 'false');
        suspendHotkeys();
        const search = document.getElementById('sbPickerSearch');
        if (search) {
            search.value = '';
            search.oninput = () => renderPickerList(search.value);
            setTimeout(() => search.focus(), 40);
        }
        renderPickerList('');
    }

    function closePicker() {
        if (pickerHost) {
            pickerHost.classList.remove('is-open');
            pickerHost.setAttribute('aria-hidden', 'true');
        }
        pickerCallback = null;
        resumeHotkeys();
    }

    async function init() {
        try {
            db = await openDb();
        } catch (e) {
            console.warn('[Soundboard] IndexedDB failed', e);
            toast('error', 'Soundboard', 'เบราว์เซอร์ไม่รองรับที่เก็บไฟล์เสียง');
        }
        state = loadMeta();
        ensureToastHost();
        readyResolve();
        emit('ready', getState());
        try {
            if (typeof global.syncGlobalHotkeysToMain === 'function') global.syncGlobalHotkeysToMain();
        } catch (_) {}
        // Hold mode only — pad play / F8 / F9 ใช้ระบบฮอตคีย์ของแอป ห้าม capture ทั้งหน้า
        document.addEventListener('keyup', (e) => {
            if (hotkeysSuspended > 0) return;
            if (typingTarget(e.target)) return;
            const key = e.key === ' ' ? 'Space' : (e.key.length === 1 ? e.key.toLowerCase() : e.key);
            const sound = findSoundByHotkey(key);
            if (sound) handlePadHotkey(sound.id, 'up', false);
        });
    }

    global.addEventListener('beforeunload', () => {
        voices.forEach((v) => {
            try { v.el.pause(); } catch (_) {}
        });
        objectUrls.forEach((url) => {
            try { URL.revokeObjectURL(url); } catch (_) {}
        });
    });

    global.TokSoundboard = {
        ready,
        CATEGORIES,
        DEFAULT_HOTKEYS,
        MAX_FILE_BYTES,
        getState,
        getSounds: () => state.sounds.slice(),
        getPlaylists: () => state.playlists.slice(),
        getSettings: () => Object.assign({}, state.settings),
        getSound,
        getPlaylist,
        getStats,
        searchSounds,
        updateSettings,
        importFiles,
        addSoundFromFile,
        updateSound,
        deleteSound,
        toggleFavorite,
        play,
        pause,
        pausePlayId,
        stop,
        stopPlayId,
        stopAll,
        setMasterVolume,
        setMuted,
        setTrackVolume,
        getActivePlayback,
        getObjectUrl,
        getDataUrl,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        duplicatePlaylist,
        setPlaylistSounds,
        playlistMeta,
        playPlaylist,
        playAdjacent,
        setLastList,
        findSoundByHotkey,
        getPadHotkeyItems,
        handlePadHotkey,
        isReservedHotkey,
        isHotkeyTaken,
        normalizeHotkey,
        formatHotkey,
        formatDuration,
        formatSize,
        validateFile,
        togglePage,
        suspendHotkeys,
        resumeHotkeys,
        openPicker,
        closePicker,
        toast,
        on,
        off
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { init(); });
    } else {
        init();
    }
})(window);
