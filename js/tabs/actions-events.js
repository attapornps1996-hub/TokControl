/**
 * TokControl tab: Actions & Events (Tikfinity-style)
 * Loaded on demand via js/tab-loader.js
 */
(function () {
    'use strict';

    const FREE_ACTIONS_MAX = 5;
    const FREE_EVENTS_MAX = 5;
    const SCREEN_COUNT = 8;
    const TRIGGER_TYPES = {
        gift: { emoji: '🎁', icon: 'gift', label: 'ของขวัญเฉพาะ' },
        coins: { emoji: '🪙', icon: 'coins', label: 'เหรียญขั้นต่ำ' },
        like: { emoji: '❤️', icon: 'heart', label: 'ไลค์' },
        totallikes: { emoji: '💯', icon: 'heart', label: 'กดไลค์รวม' },
        sticker: { emoji: '💖', icon: 'smile', label: 'สติกเกอร์ช่อง' },
        follow: { emoji: '➕', icon: 'user', label: 'ติดตาม' },
        share: { emoji: '🔁', icon: 'link', label: 'แชร์' },
        join: { emoji: '👋', icon: 'door', label: 'เข้าห้อง' },
        command: { emoji: '💬', icon: 'message', label: 'คำสั่งแชท' }
    };
    const USER_FILTERS = {
        any: 'ทุกคน',
        follower: 'ผู้ติดตาม',
        moderator: 'แอดมิน',
        specific: 'ผู้ใช้เฉพาะ'
    };

    const ACTION_TYPE_DEFS = [
        { key: 'animation', label: 'Show Animation', icon: 'sparkles', upload: true },
        { key: 'picture', label: 'Show Picture / GIF', icon: 'image', upload: true },
        { key: 'sound', label: 'Play Audio', icon: 'volume', upload: true },
        { key: 'video', label: 'Play Video File', icon: 'video', upload: true },
        { key: 'tts', label: 'Read Text (TTS)', icon: 'mic', config: 'tts' },
        { key: 'keystroke', label: 'Simulate Keystrokes', icon: 'sliders', config: 'keystroke' },
        { key: 'alert', label: 'Show Alert', icon: 'message', soon: true },
        { key: 'chatbot', label: 'Chatbot Message', icon: 'bot', soon: true },
        { key: 'obs_scene', label: 'Switch OBS Scene', icon: 'sliders', soon: true },
        { key: 'webhook', label: 'Trigger WebHook', icon: 'link', soon: true }
    ];

    function aeIco(name, size, extra) {
        const opts = Object.assign({ size: size || 14 }, extra || {});
        if (window.TcIcons) return TcIcons.svg(name, opts);
        if (window.CamIcons) return CamIcons.svg(name, { size: opts.size });
        return '';
    }

    function proxyAeMediaUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        if (raw.startsWith('/api/emotes/proxy') || raw.startsWith('data:') || raw.startsWith('/')) return raw;
        if (window.ChannelEmotes && typeof ChannelEmotes.proxyUrl === 'function' && /^https?:\/\//i.test(raw)) {
            return ChannelEmotes.proxyUrl(raw);
        }
        if (/^https?:\/\//i.test(raw) && /tiktokcdn|byteimg|ibyteimg|musically|tiktokv|bytedance|byteoversea/i.test(raw)) {
            return '/api/emotes/proxy?url=' + encodeURIComponent(raw);
        }
        return raw;
    }

    function isAeImageUrl(url) {
        const s = String(url || '').trim();
        return /^(https?:|data:|\/\/|\/)/i.test(s) && !/dicebear\.com/i.test(s);
    }

    function resolveAeGiftIcon(giftId, giftName, stored) {
        if (isAeImageUrl(stored)) return String(stored).trim();
        if (window.GiftIconHelper && typeof GiftIconHelper.findInCatalog === 'function') {
            const fromCat = GiftIconHelper.findInCatalog(giftId, giftName);
            if (fromCat) return fromCat;
        }
        const g = (typeof popularGifts !== 'undefined' ? popularGifts : []).find((x) =>
            String(x.giftId) === String(giftId)
            || (giftName && String(x.name || x.giftName || '').toLowerCase() === String(giftName).toLowerCase())
        );
        const icon = g?.icon || g?.giftIcon || '';
        return isAeImageUrl(icon) ? icon : '';
    }

    function resolveAeGiftName(giftId, storedName) {
        if (storedName && !/^\d{8,}$/.test(String(storedName))) return String(storedName);
        const g = (typeof popularGifts !== 'undefined' ? popularGifts : []).find((x) => String(x.giftId) === String(giftId));
        if (g?.name || g?.giftName) return g.name || g.giftName;
        if (window.GiftIconHelper && typeof GiftIconHelper.getCatalog === 'function') {
            const hit = GiftIconHelper.getCatalog().find((x) => String(x.giftId) === String(giftId));
            if (hit?.giftName) return hit.giftName;
        }
        return storedName || giftId || '';
    }

    function resolveAeSticker(emoteId, storedIcon, storedName) {
        const em = window.ChannelEmotes?.find?.(emoteId) || null;
        const icon = isAeImageUrl(storedIcon) ? storedIcon : (em?.displayUrl || em?.imageUrl || '');
        const name = (storedName && !/^\d{10,}$/.test(String(storedName)))
            ? storedName
            : (window.ChannelEmotes?.getDisplayName?.(em, emoteId) || em?.name || storedName || emoteId || '');
        return { icon, name, em };
    }

    function aeTriggerThumbHtml(ev) {
        const t = TRIGGER_TYPES[ev.triggerType] || { emoji: '⚡', label: ev.triggerType };
        let img = '';
        if (ev.triggerType === 'gift') {
            img = proxyAeMediaUrl(resolveAeGiftIcon(ev.triggerValue, ev.giftName, ev.giftIcon));
        } else if (ev.triggerType === 'sticker') {
            img = proxyAeMediaUrl(resolveAeSticker(ev.triggerValue, ev.emoteIcon, ev.emoteName).icon);
        }
        if (img) {
            return `<img class="ae-trigger-thumb" src="${escapeHtml(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='inline';"><span class="ae-trigger-icon ae-keep-emoji" style="display:none">${escapeHtml(t.emoji || '⚡')}</span>`;
        }
        return `<span class="ae-trigger-icon ae-keep-emoji">${escapeHtml(t.emoji || '⚡')}</span>`;
    }

    const DEFAULT_KEYSTROKE = {
        sequence: '',
        ctrl: false,
        alt: false,
        shift: false,
        holdMs: 100,
        gameMode: false
    };

    const TRIGGER_VALUE_LABELS = {
        gift: '🎁 เลือกของขวัญ / ระบุ giftId',
        like: '❤️ จำนวนไลค์ในครั้งนั้น (เช่น 10)',
        totallikes: '💯 ยิงทุกๆ N ไลค์',
        follow: '➕ ไม่ต้องระบุ — ทุกครั้งที่ติดตาม',
        share: '🔁 ไม่ต้องระบุ — ทุกครั้งที่แชร์',
        join: '👋 ไม่ต้องระบุ — ทุกครั้งที่เข้าห้อง',
        command: '💬 คำสั่งแชท (เช่น /เริ่ม)',
        coins: '🪙 มูลค่าเหรียญขั้นต่ำ',
        sticker: '💖 เลือกสติกเกอร์ / อิโมจิประจำช่อง'
    };

    let aeTopTab = 'main';
    let aeSearchFilter = '';
    let aeEditingActionId = null;
    let aeEditingEventId = null;
    let aeEditingTimerId = null;
    let aeActionDraft = {};
    let aeEventDraft = {};
    let aeTimerDraft = {};
    let aeGiftPickerFor = null;
    let aeTimerTick = null;
    let aeTimerLastFire = {};
    let aeLikeCursors = {};
    let aeStickerPickerFor = null;

    function uid(prefix) {
        return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function decodeAeId(id) {
        if (id == null || id === '') return id;
        try { return decodeURIComponent(String(id)); } catch (e) { return String(id); }
    }

    function ensureActionsEventsStore() {
        if (!window.advConf) window.advConf = {};
        if (!advConf.actionsEvents) {
            advConf.actionsEvents = {
                enabled: true,
                actions: {},
                events: {},
                screens: Array.from({ length: SCREEN_COUNT }, () => ({ maxQueue: 5 })),
                timers: {}
            };
        }
        const ae = advConf.actionsEvents;
        if (!ae.actions) ae.actions = {};
        if (!ae.events) ae.events = {};
        if (!ae.timers) ae.timers = {};
        Object.entries(ae.actions).forEach(([id, a]) => {
            if (a && typeof a === 'object' && !a.id) a.id = id;
        });
        Object.entries(ae.events).forEach(([id, ev]) => {
            if (ev && typeof ev === 'object' && !ev.id) ev.id = id;
        });
        Object.values(ae.events).forEach((ev) => {
            if (!ev || ev.actionMode === 'single' || ev.actionMode === 'random') return;
            ev.actionMode = (ev.actionIds || []).length > 1 ? 'random' : 'single';
        });
        if (!Array.isArray(ae.screens) || ae.screens.length < SCREEN_COUNT) {
            const prev = ae.screens || [];
            ae.screens = Array.from({ length: SCREEN_COUNT }, (_, i) => prev[i] || { maxQueue: 5 });
        }
        if (ae.enabled === undefined) ae.enabled = true;
    }

    function getAeStore() {
        ensureActionsEventsStore();
        return advConf.actionsEvents;
    }

    function isAePro() {
        return typeof isAppPro === 'function' && isAppPro('actions');
    }

    function countActions() {
        return Object.keys(getAeStore().actions || {}).length;
    }

    function countEvents() {
        return Object.keys(getAeStore().events || {}).length;
    }

    function countEnabledActions() {
        const ae = getAeStore();
        return Object.values(ae.actions).filter((a) => a.enabled !== false).length;
    }

    function countEnabledEvents() {
        const ae = getAeStore();
        return Object.values(ae.events).filter((ev) => ev.enabled !== false).length;
    }

    function canAddAction() {
        if (isAePro()) return true;
        return countActions() < FREE_ACTIONS_MAX;
    }

    function canAddEvent() {
        if (isAePro()) return true;
        return countEvents() < FREE_EVENTS_MAX;
    }

    function canEnableAction() {
        if (isAePro()) return true;
        return countEnabledActions() < FREE_ACTIONS_MAX;
    }

    function canEnableEvent() {
        if (isAePro()) return true;
        return countEnabledEvents() < FREE_EVENTS_MAX;
    }

    async function saveActionsEventsToServer() {
        ensureActionsEventsStore();
        if (currentUser && currentUser.streamToken && typeof socket !== 'undefined') {
            socket.emit('send_actions_events', {
                token: currentUser.streamToken,
                actionsEvents: advConf.actionsEvents
            });
        }
        if (typeof autoSave === 'function') await autoSave();
    }

    function getActionById(id) {
        return getAeStore().actions[id] || null;
    }

    function getActionDescription(action) {
        if (!action) return '';
        if (action.description) return action.description;
        const parts = [];
        const m = action.media || {};
        if (m.animation && (action.animationName || action.animationUrl)) parts.push('Animation ' + (action.animationName || 'file'));
        if (m.picture && (action.imageName || action.imageUrl || action.imageData)) parts.push('Picture ' + (action.imageName || 'file'));
        if (m.sound && (action.soundName || action.soundUrl || action.builtin || action.soundData || action.soundboardId)) parts.push('Sound ' + (action.soundName || action.builtin || 'file'));
        if (m.video && (action.videoName || action.videoData)) parts.push('Video ' + (action.videoName || 'file'));
        if (m.tts) parts.push('TTS');
        if (m.keystroke) parts.push('Keystroke');
        return parts.join(', ') || '—';
    }

    function fillAePlaceholders(template, meta) {
        const m = meta || {};
        const map = {
            username: m.uniqueId || m.username || '',
            nickname: m.nickname || m.uniqueId || '',
            giftname: m.giftName || '',
            repeatcount: m.repeatCount != null ? String(m.repeatCount) : '',
            coins: m.coins != null ? String(m.coins) : (m.diamondCount != null ? String(m.diamondCount) : ''),
            likecount: m.likeCount != null ? String(m.likeCount) : (m.likes != null ? String(m.likes) : ''),
            totallikecount: m.totalLikeCount != null ? String(m.totalLikeCount) : '',
            comment: m.comment || '',
            submonth: m.subMonth != null ? String(m.subMonth) : ''
        };
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (all, key) => {
            const k = String(key || '').toLowerCase();
            return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : all;
        });
    }

    function runActionLocalEffects(action, meta) {
        if (!action || !action.media) return;
        if (action.media.tts) {
            const raw = action.ttsText || '{nickname}';
            const text = fillAePlaceholders(raw, meta).trim();
            if (text) {
                if (typeof window.ttsSpeakDirect === 'function') {
                    window.ttsSpeakDirect(text, { source: 'action', actionName: action.name });
                } else if (typeof window.testTTS === 'function') {
                    // fallback: temporarily set test input — avoid; log instead
                    console.warn('[AE] ttsSpeakDirect missing');
                }
            }
        }
        if (action.media.keystroke) {
            const ks = Object.assign({}, DEFAULT_KEYSTROKE, action.keystroke || {});
            const sequence = fillAePlaceholders(ks.sequence || '', meta);
            if (sequence.trim()) {
                runAeKeystrokes({
                    sequence,
                    ctrl: !!ks.ctrl,
                    alt: !!ks.alt,
                    shift: !!ks.shift,
                    holdMs: ks.holdMs || 100,
                    gameMode: !!ks.gameMode
                });
            }
        }
        if (action.media.sound && action.soundboardId && window.TokSoundboard) {
            TokSoundboard.play(action.soundboardId, { source: 'action' });
        }
    }

    async function runAeKeystrokes(opts) {
        try {
            const { ipcRenderer } = (window.electron || {});
            if (!ipcRenderer?.invoke) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'คีย์บอร์ด', 'จำลองคีย์ได้เฉพาะแอป TokControl บน Windows');
                }
                return { ok: false };
            }
            const result = await ipcRenderer.invoke('simulate-keystrokes', opts);
            if (!result || !result.ok) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'คีย์บอร์ด', (result && result.error) || 'จำลองคีย์ไม่สำเร็จ');
                }
                return result || { ok: false };
            }
            if (result.warning && typeof logToDashboard === 'function') {
                logToDashboard('⌨️ Keystroke: ' + result.warning, '#f1c40f');
            } else if (typeof logToDashboard === 'function') {
                logToDashboard('⌨️ Keystroke ส่งแล้ว (' + (result.mode || 'sendinput') + ')', '#2ecc71');
            }
            return result;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'คีย์บอร์ด', e.message || 'จำลองคีย์ได้เฉพาะแอป Electron บน Windows');
            }
            return { ok: false };
        }
    }

    function pickActionMedia(action, dataKeys, urlKeys) {
        const sniff = window.TokMediaSniff;
        const fix = (s) => (sniff && sniff.playableSrc) ? sniff.playableSrc(s) : s;
        const ok = (s) => {
            if (!s) return false;
            if (sniff && sniff.isUsableSrc) return sniff.isUsableSrc(s);
            const t = String(s);
            return t.slice(0, 5) === 'data:' || /^https?:\/\//i.test(t) || t.charAt(0) === '/' || /^blob:/i.test(t);
        };
        let data = null;
        let url = null;
        (dataKeys || []).forEach((k) => {
            if (data || url || !ok(action[k])) return;
            const v = fix(action[k]);
            if (String(v).slice(0, 5) === 'data:') data = v;
            else url = v;
        });
        if (!data && !url) {
            (urlKeys || []).forEach((k) => {
                if (data || url || !ok(action[k])) return;
                const v = fix(action[k]);
                if (String(v).slice(0, 5) === 'data:') data = v;
                else url = v;
            });
        }
        return { data, url };
    }

    function buildActionPayload(action, meta) {
        const pts = action.points || 0;
        const mode = action.pointsMode || 'none';
        const signedPts = mode === 'remove' ? -Math.abs(pts) : (mode === 'add' ? Math.abs(pts) : 0);
        const sound = pickActionMedia(action, ['soundData', 'soundData', 'audioData'], ['soundUrl', 'soundUrl', 'audioUrl']);
        const image = pickActionMedia(action, ['imageData', 'imageData'], ['imageUrl', 'imageUrl', 'pictureUrl']);
        const anim = pickActionMedia(action, ['animationData'], ['animationUrl', 'animationUrl']);
        const video = pickActionMedia(action, ['videoData'], ['videoUrl', 'videoUrl']);
        return {
            id: action.id,
            name: action.name,
            screen: action.screen || 1,
            duration: action.duration || 10,
            points: signedPts,
            pointsMode: mode,
            soundVolume: action.soundVolume != null ? action.soundVolume : (action.soundVolume != null ? action.soundVolume : 85),
            globalCooldown: action.globalCooldown || action.globalCooldown || 0,
            userCooldown: action.userCooldown || action.userCooldown || 0,
            fadeInOut: action.fadeInOut != null ? !!action.fadeInOut : action.fadeInOut !== false,
            repeatCombo: !!action.repeatCombo,
            skipOnNext: !!action.skipOnNext,
            media: action.media || {},
            description: getActionDescription(action),
            soundData: sound.data || action.soundData || null,
            soundUrl: sound.url || action.soundUrl || null,
            soundName: action.soundName || action.soundName || null,
            builtin: action.builtin || null,
            soundboardId: action.soundboardId || null,
            myinstantsSlug: action.myinstantsSlug || null,
            imageData: image.data || action.imageData || null,
            imageUrl: image.url || action.imageUrl || action.imageUrl || null,
            imageName: action.imageName || action.imageName || null,
            animationData: anim.data || action.animationData || null,
            animationUrl: anim.url || action.animationUrl || action.animationUrl || null,
            animationName: action.animationName || null,
            videoData: video.data || action.videoData || null,
            videoUrl: video.url || action.videoUrl || action.videoUrl || null,
            videoName: action.videoName || null,
            ttsText: action.ttsText || action.ttsText || null,
            keystroke: action.keystroke || null,
            meta: meta || {}
        };
    }

    function actionHasOverlayMedia(action) {
        const m = (action && action.media) || {};
        return !!(m.animation || m.picture || m.sound || m.video);
    }

    function playAction(actionId, meta) {
        const ae = getAeStore();
        const force = !!(meta && (meta.test || meta.force));
        if (!ae.enabled && !force) return;
        const action = ae.actions[actionId];
        if (!action) return;
        if (action.enabled === false && !force) return;
        runActionLocalEffects(action, meta || {});
        if (actionHasOverlayMedia(action) && currentUser && currentUser.streamToken && typeof socket !== 'undefined') {
            const emitPayload = (payload) => {
                socket.emit('play_action', {
                    token: currentUser.streamToken,
                    action: payload
                });
            };
            const payload = buildActionPayload(action, meta);
            if (action.soundboardId && window.TokSoundboard && !payload.soundData && !payload.soundUrl) {
                TokSoundboard.getDataUrl(action.soundboardId).then((url) => {
                    payload.soundData = url;
                    emitPayload(payload);
                }).catch(() => emitPayload(payload));
            } else {
                emitPayload(payload);
            }
        }
        if (typeof logToDashboard === 'function') {
            logToDashboard(`Action: ${action.name}`, '#bc13fe');
        }
    }

    function playActionsByIds(actionIds, meta) {
        (actionIds || []).forEach((id) => playAction(id, meta));
    }

    function getEventActionMode(ev) {
        if (ev?.actionMode === 'random' || ev?.actionMode === 'single') return ev.actionMode;
        return (ev?.actionIds || []).length > 1 ? 'random' : 'single';
    }

    function resolveEventActionIds(ev, ae) {
        const store = ae || getAeStore();
        const available = (ev?.actionIds || []).filter((id) => {
            const action = store.actions[id];
            return action && action.enabled !== false;
        });
        if (!available.length) return [];
        if (getEventActionMode(ev) === 'random') {
            return [available[Math.floor(Math.random() * available.length)]];
        }
        return [available[0]];
    }

    function normalizeTikTokUsername(value) {
        return String(value || '').trim().replace(/^@+/, '').toLowerCase();
    }

    function matchEventUserFilter(ev, user) {
        const filter = ev.userFilter || 'any';
        if (filter === 'any') return true;
        if (filter === 'follower') return !!(user && (user.isFollower || user.followRole));
        if (filter === 'moderator') return !!(user && (user.isModerator || user.userRole === 'moderator'));
        if (filter === 'specific') {
            const expected = normalizeTikTokUsername(ev.specificUsername);
            const actual = normalizeTikTokUsername(user?.uniqueId);
            return !!expected && !!actual && expected === actual;
        }
        return true;
    }

    function resolveGiftTriggerValue(gift) {
        return gift && gift.giftId != null ? String(gift.giftId) : '';
    }

    function fireResolvedEvent(ev, user, meta, times) {
        const n = Math.min(30, Math.max(1, Number(times) || 1));
        const ids = resolveEventActionIds(ev);
        if (!ids.length) return;
        const payload = Object.assign({}, user || {}, meta || {});
        for (let i = 0; i < n; i++) {
            if (i === 0) playActionsByIds(ids, payload);
            else setTimeout(() => playActionsByIds(resolveEventActionIds(ev), payload), i * 150);
        }
    }

    function fireEventsForTrigger(triggerType, triggerValue, increment, user, meta) {
        const ae = getAeStore();
        if (!ae.enabled) return;
        const inc = increment || 1;
        Object.values(ae.events).forEach((ev) => {
            if (!ev || ev.enabled === false) return;
            if (ev.triggerType !== triggerType) return;
            if (!matchEventUserFilter(ev, user)) return;
            const val = String(ev.triggerValue || '').trim();
            if (triggerType === 'gift') {
                const giftId = String(triggerValue || '');
                const giftName = (meta && meta.giftName) ? meta.giftName.toLowerCase().trim() : '';
                const matchId = val && giftId === val;
                const matchName = val && giftName && giftName === val.toLowerCase();
                if (!matchId && !matchName) return;
                fireResolvedEvent(ev, user, meta, 1);
                return;
            }
            if (triggerType === 'command') {
                const comment = String(triggerValue || '').trim().toLowerCase();
                if (!comment.includes(val.toLowerCase()) && comment !== val.toLowerCase()) return;
                fireResolvedEvent(ev, user, meta, 1);
                return;
            }
            if (triggerType === 'sticker') {
                const emoteId = String(triggerValue || '');
                const emoteName = String((meta && meta.emoteName) || '').toLowerCase().trim();
                const matchId = val && emoteId === val;
                const matchName = val && emoteName && emoteName === val.toLowerCase();
                if (!matchId && !matchName) return;
                fireResolvedEvent(ev, user, meta, 1);
                return;
            }
            if (triggerType === 'coins') {
                const min = Math.max(1, parseInt(val, 10) || 1);
                const coins = Number(inc) || 0;
                const mode = ev.coinFireMode || 'once';
                if (mode === 'exact') {
                    if (coins !== min) return;
                    fireResolvedEvent(ev, user, meta, 1);
                    return;
                }
                if (coins < min) return;
                const times = mode === 'multiply' ? Math.floor(coins / min) : 1;
                fireResolvedEvent(ev, user, meta, times);
                return;
            }
            if (triggerType === 'like') {
                const threshold = parseInt(val, 10) || 1;
                if (inc < threshold) return;
                fireResolvedEvent(ev, user, meta, 1);
                return;
            }
            if (triggerType === 'totallikes') {
                const n = Math.max(1, parseInt(val, 10) || 100);
                const mode = ev.likeCountMode === 'user' ? 'user' : 'room';
                const uid = normalizeTikTokUsername(user?.uniqueId || user?.nickname || 'viewer') || 'viewer';
                const cursorKey = mode === 'user' ? `user:${ev.id}:${uid}` : `room:${ev.id}`;
                const prev = Number(aeLikeCursors[cursorKey]) || 0;
                let next = prev;
                if (mode === 'room') {
                    const total = Number(meta?.totalLikeCount);
                    next = Number.isFinite(total) && total > 0
                        ? total
                        : prev + (Number(inc) || 0);
                } else {
                    next = prev + (Number(inc) || 0);
                }
                if (next < prev) {
                    aeLikeCursors[cursorKey] = next;
                    return;
                }
                const crossed = Math.floor(next / n) - Math.floor(prev / n);
                aeLikeCursors[cursorKey] = next;
                if (crossed < 1) return;
                fireResolvedEvent(ev, user, meta, crossed);
                return;
            }
            if (val && String(triggerValue) !== val) return;
            fireResolvedEvent(ev, user, meta, 1);
        });
    }

    function handleActionsEventsForGift(gift) {
        if (!gift) return;
        fireEventsForTrigger('gift', resolveGiftTriggerValue(gift), gift.repeatCount || 1, gift, {
            giftName: gift.giftName,
            uniqueId: gift.uniqueId,
            nickname: gift.nickname,
            repeatCount: gift.repeatCount || 1,
            coins: (gift.diamondCount || 0) * (gift.repeatCount || 1),
            diamondCount: gift.diamondCount || 0
        });
        const coins = (gift.diamondCount || 0) * (gift.repeatCount || 1);
        if (coins > 0) {
            fireEventsForTrigger('coins', String(coins), coins, gift, {
                giftName: gift.giftName,
                uniqueId: gift.uniqueId,
                nickname: gift.nickname,
                coins,
                diamondCount: gift.diamondCount || 0,
                repeatCount: gift.repeatCount || 1
            });
        }
    }

    function handleActionsEventsForEvent(eventType, increment, user) {
        const map = { like: 'like', follow: 'follow', share: 'share', join: 'join', totallikes: 'totallikes' };
        const t = map[eventType];
        if (!t) return;
        const meta = {
            uniqueId: user?.uniqueId,
            nickname: user?.nickname,
            likeCount: increment || 1,
            totalLikeCount: user?.totalLikeCount
        };
        if (t === 'like') {
            fireEventsForTrigger('like', '', increment || 1, user || {}, meta);
            fireEventsForTrigger('totallikes', '', increment || 1, user || {}, meta);
            return;
        }
        fireEventsForTrigger(t, '', increment || 1, user || {}, meta);
    }

    function handleActionsEventsForEmote(emote) {
        if (!emote) return;
        const emoteId = String(emote.emoteId || emote.id || '').trim();
        const emoteName = String(emote.emoteName || emote.name || '').trim();
        if (!emoteId && !emoteName) return;
        fireEventsForTrigger('sticker', emoteId || emoteName, 1, emote, {
            emoteId,
            emoteName,
            imageUrl: emote.imageUrl || emote.displayUrl || '',
            uniqueId: emote.uniqueId,
            nickname: emote.nickname
        });
    }

    function handleActionsEventsForChat(chat) {
        if (!chat || !chat.comment) return;
        fireEventsForTrigger('command', chat.comment, 1, chat, {
            comment: chat.comment,
            uniqueId: chat.uniqueId,
            nickname: chat.nickname
        });
    }

    function switchAeTopTab(tab) {
        if (tab === 'timers' || tab === 'simulator') tab = 'preset';
        aeTopTab = tab;
        ['main', 'screens', 'preset'].forEach((t) => {
            const btn = document.getElementById('aeTopTab-' + t);
            const sec = document.getElementById('aeSec-' + t);
            if (btn) btn.classList.toggle('active', t === tab);
            if (sec) sec.style.display = t === tab ? 'block' : 'none';
        });
        const searchWrap = document.getElementById('aeSearchWrap');
        if (searchWrap) searchWrap.style.display = tab === 'main' ? 'flex' : 'none';
        if (tab === 'main') {
            aePresetComposerMode = false;
            setAeEditorOverlayZ(false);
            renderAeActionsList();
            renderAeEventsList();
        }
        if (tab === 'screens') renderAeScreensList();
        if (tab === 'preset') {
            syncAePresetAdminUi();
            refreshAePresetsGallery();
        }
    }

    function aeAuthHeaders() {
        const token = localStorage.getItem('pandy_token');
        return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }

    function syncAePresetAdminUi() {
        const isAdmin = typeof isAppAdmin === 'function' && isAppAdmin();
        document.querySelectorAll('.ae-preset-admin-only').forEach((el) => {
            el.style.display = isAdmin ? '' : 'none';
        });
    }

    let aePresetCoverDataUrl = '';
    let aePresetExistingCoverUrl = '';
    let aePresetEditingId = '';
    let aePresetDraft = { actions: {}, events: {} };
    let aePresetComposerMode = false;

    function cloneJson(obj) {
        try { return JSON.parse(JSON.stringify(obj || {})); } catch (_) { return {}; }
    }

    function getComposerActionMap() {
        return aePresetComposerMode ? (aePresetDraft.actions || {}) : (getAeStore().actions || {});
    }

    function getComposerEventMap() {
        return aePresetComposerMode ? (aePresetDraft.events || {}) : (getAeStore().events || {});
    }

    function setAeEditorOverlayZ(active) {
        ['aeActionEditorOverlay', 'aeEventEditorOverlay', 'aeGiftPickerOverlay', 'aeKeystrokeOverlay'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (active) el.style.zIndex = '13050';
            else el.style.zIndex = '';
        });
    }

    function updateAePresetDraftSummary() {
        const el = document.getElementById('aePresetDraftSummary');
        if (!el) return;
        const actionCount = Object.keys(aePresetDraft.actions || {}).length;
        const eventCount = Object.keys(aePresetDraft.events || {}).length;
        el.textContent = actionCount || eventCount
            ? `แพ็กนี้จะมี ${actionCount} แอคชั่น · ${eventCount} อีเวนต์ — ผู้ใช้กด Apply แล้วตั้งค่าใน Actions & Events ทันที`
            : 'สร้างแอคชั่น/อีเวนต์ใหม่สำหรับเกมนี้ หรือกด "นำเข้า" จาก config ปัจจุบัน';
    }

    function renderAePresetDraftPicks() {
        const actionWrap = document.getElementById('aePresetActionPicks');
        const eventWrap = document.getElementById('aePresetEventPicks');
        const actions = Object.values(aePresetDraft.actions || {});
        const events = Object.values(aePresetDraft.events || {});

        if (actionWrap) {
            if (!actions.length) {
                actionWrap.innerHTML = '<div class="ae-picker-empty">ยังไม่มีแอคชั่นในพรีเซ็ต — กด "+ สร้างใหม่" เพื่อสร้างสำหรับเกมนี้</div>';
            } else {
                actionWrap.innerHTML = actions.map((a) => {
                    const id = String(a.id);
                    const mediaKeys = Object.keys(a.media || {}).filter((k) => a.media[k]).join(', ') || 'ไม่มีสื่อ';
                    return `<div class="ae-preset-pick-item ae-preset-pick-item--row">
                        <span>
                            <div class="ae-preset-pick-name-static">${escapeHtml(a.name || id)}</div>
                            <div class="ae-preset-pick-meta">Screen ${Number(a.screen) || 1} · ${escapeHtml(mediaKeys)}</div>
                        </span>
                        <span class="ae-preset-pick-tools">
                            <button type="button" class="snd-toolbar-btn" onclick="aePresetEditAction('${escapeHtml(id)}')">แก้ไข</button>
                            <button type="button" class="snd-toolbar-btn snd-toolbar-btn--danger" onclick="aePresetRemoveItem('actions','${escapeHtml(id)}')">ลบ</button>
                        </span>
                    </div>`;
                }).join('');
            }
        }

        if (eventWrap) {
            if (!events.length) {
                eventWrap.innerHTML = '<div class="ae-picker-empty">ยังไม่มีอีเวนต์ในพรีเซ็ต — กด "+ สร้างใหม่" แล้วผูกกับแอคชั่นในแพ็ก</div>';
            } else {
                eventWrap.innerHTML = events.map((ev) => {
                    const id = String(ev.id);
                    const trigger = `${TRIGGER_TYPES[ev.triggerType]?.emoji || ''} ${TRIGGER_TYPES[ev.triggerType]?.label || ev.triggerType || '-'}`.trim();
                    const actionN = Array.isArray(ev.actionIds) ? ev.actionIds.length : 0;
                    return `<div class="ae-preset-pick-item ae-preset-pick-item--row">
                        <span>
                            <div class="ae-preset-pick-name-static">${escapeHtml(ev.name || id)}</div>
                            <div class="ae-preset-pick-meta">${escapeHtml(trigger)} → ${actionN} action</div>
                        </span>
                        <span class="ae-preset-pick-tools">
                            <button type="button" class="snd-toolbar-btn" onclick="aePresetEditEvent('${escapeHtml(id)}')">แก้ไข</button>
                            <button type="button" class="snd-toolbar-btn snd-toolbar-btn--danger" onclick="aePresetRemoveItem('events','${escapeHtml(id)}')">ลบ</button>
                        </span>
                    </div>`;
                }).join('');
            }
        }
        updateAePresetDraftSummary();
    }

    function aePresetRemoveItem(kind, id) {
        const bucket = kind === 'events' ? aePresetDraft.events : aePresetDraft.actions;
        delete bucket[id];
        if (kind === 'actions') {
            Object.values(aePresetDraft.events || {}).forEach((ev) => {
                if (Array.isArray(ev.actionIds)) ev.actionIds = ev.actionIds.filter((x) => String(x) !== String(id));
            });
        }
        renderAePresetDraftPicks();
    }

    function aePresetToggleItem(kind, id, checked) {
        // retained for compatibility; draft now owns items directly
        if (!checked) aePresetRemoveItem(kind, id);
    }

    function aePresetRenameItem() { /* no-op: rename via editor */ }

    function aePresetToggleAll(kind, checked) {
        if (!checked) {
            if (kind === 'events') aePresetDraft.events = {};
            else aePresetDraft.actions = {};
            renderAePresetDraftPicks();
            return;
        }
        aePresetImportFromLive(kind);
    }

    function aePresetImportFromLive(kind) {
        const ae = getAeStore();
        if (kind === 'events') {
            aePresetDraft.events = { ...aePresetDraft.events, ...cloneJson(ae.events || {}) };
        } else {
            aePresetDraft.actions = { ...aePresetDraft.actions, ...cloneJson(ae.actions || {}) };
        }
        renderAePresetDraftPicks();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'นำเข้าแล้ว', kind === 'events' ? 'Events จาก config ปัจจุบัน' : 'Actions จาก config ปัจจุบัน');
        }
    }

    function aePresetCreateAction() {
        aePresetComposerMode = true;
        setAeEditorOverlayZ(true);
        openActionEditorModal(null);
    }

    function aePresetEditAction(id) {
        aePresetComposerMode = true;
        setAeEditorOverlayZ(true);
        openActionEditorModal(id);
    }

    function aePresetCreateEvent() {
        if (!Object.keys(aePresetDraft.actions || {}).length) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('warning', 'ยังไม่มีแอคชั่น', 'สร้างแอคชั่นในพรีเซ็ตก่อน แล้วค่อยสร้างอีเวนต์');
            }
            return;
        }
        aePresetComposerMode = true;
        setAeEditorOverlayZ(true);
        openEventEditorModal(null);
    }

    function aePresetEditEvent(id) {
        aePresetComposerMode = true;
        setAeEditorOverlayZ(true);
        openEventEditorModal(id);
    }

    function fillAePresetPublishForm(preset) {
        const nameEl = document.getElementById('aePresetName');
        const descEl = document.getElementById('aePresetDesc');
        const fileEl = document.getElementById('aePresetCoverFile');
        const prev = document.getElementById('aePresetCoverPreview');
        const title = document.getElementById('aePresetPublishTitle');
        const btn = document.getElementById('aePresetPublishBtn');
        if (nameEl) nameEl.value = preset?.name || '';
        if (descEl) descEl.value = preset?.description || '';
        if (fileEl) fileEl.value = '';
        aePresetCoverDataUrl = '';
        aePresetExistingCoverUrl = preset?.coverUrl || '';
        const coverSrc = aePresetExistingCoverUrl
            ? (typeof window.resolveMediaUrl === 'function' ? window.resolveMediaUrl(aePresetExistingCoverUrl) : aePresetExistingCoverUrl)
            : '';
        if (prev) {
            if (coverSrc) {
                prev.style.display = 'block';
                prev.style.backgroundImage = `url('${String(coverSrc).replace(/'/g, '%27')}')`;
            } else {
                prev.style.display = 'none';
                prev.style.backgroundImage = '';
            }
        }
        if (title) title.textContent = aePresetEditingId ? 'แก้ไขพรีเซ็ต' : 'ตั้งค่าพรีเซ็ตก่อนเผยแพร่';
        if (btn) btn.textContent = aePresetEditingId ? 'บันทึกการแก้ไข' : 'เผยแพร่พรีเซ็ต';
        setAePresetPublishStatus('');
        renderAePresetDraftPicks();
        const modal = document.getElementById('aePresetPublishModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    function openAePresetPublishModal() {
        if (typeof isAppAdmin === 'function' && !isAppAdmin()) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ไม่มีสิทธิ์', 'เฉพาะแอดมินเท่านั้น');
            return;
        }
        aePresetEditingId = '';
        aePresetExistingCoverUrl = '';
        aePresetComposerMode = true;
        aePresetDraft = { actions: {}, events: {} };
        fillAePresetPublishForm(null);
    }

    async function editAePreset(id) {
        if (!id) return;
        if (typeof isAppAdmin === 'function' && !isAppAdmin()) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ไม่มีสิทธิ์', 'เฉพาะแอดมินเท่านั้น');
            return;
        }
        try {
            const res = await fetch(`/api/ae-presets/${encodeURIComponent(id)}`, { headers: aeAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || 'โหลดพรีเซ็ตไม่สำเร็จ');
            const preset = data.preset || {};
            const payload = preset.payload && typeof preset.payload === 'object' ? preset.payload : {};
            aePresetEditingId = String(preset.id || id);
            aePresetComposerMode = true;
            aePresetDraft = {
                actions: cloneJson(payload.actions || {}),
                events: cloneJson(payload.events || {})
            };
            fillAePresetPublishForm(preset);
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'แก้ไขพรีเซ็ตไม่ได้', e.message || String(e));
        }
    }

    function closeAePresetPublishModal() {
        const modal = document.getElementById('aePresetPublishModal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        }
        aePresetComposerMode = false;
        aePresetEditingId = '';
        aePresetExistingCoverUrl = '';
        setAeEditorOverlayZ(false);
    }

    function onAePresetCoverPicked(ev) {
        const file = ev?.target?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            aePresetCoverDataUrl = String(reader.result || '');
            const prev = document.getElementById('aePresetCoverPreview');
            if (prev && aePresetCoverDataUrl) {
                prev.style.display = 'block';
                prev.style.backgroundImage = `url(${aePresetCoverDataUrl})`;
            }
        };
        reader.readAsDataURL(file);
    }

    function buildAePresetPayload() {
        const ae = getAeStore();
        const selectedActionIds = new Set(Object.keys(aePresetDraft.actions || {}));
        const actions = {};
        Object.keys(aePresetDraft.actions || {}).forEach((id) => {
            actions[id] = cloneJson(aePresetDraft.actions[id]);
        });
        const events = {};
        Object.keys(aePresetDraft.events || {}).forEach((id) => {
            const ev = cloneJson(aePresetDraft.events[id]);
            if (Array.isArray(ev.actionIds)) {
                ev.actionIds = ev.actionIds.filter((aid) => selectedActionIds.has(String(aid)));
            }
            events[id] = ev;
        });
        return {
            actions,
            events,
            screens: Array.isArray(ae.screens) ? cloneJson(ae.screens) : Array(8).fill({ maxQueue: 5 })
        };
    }

    async function uploadAePresetCover(dataUrl) {
        if (!dataUrl) return null;
        const res = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: aeAuthHeaders(),
            body: JSON.stringify({
                dataUrl,
                mimeType: String(dataUrl).split(';')[0].replace('data:', '') || 'image/png',
                purpose: 'cover'
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'อัปโหลดรูปปกไม่สำเร็จ');
        const raw = data.url || (data.assetId ? `/api/assets/${data.assetId}` : null);
        if (!raw) return null;
        return (typeof window.resolveMediaUrl === 'function' ? window.resolveMediaUrl(raw) : raw) || raw;
    }

    function setAePresetPublishStatus(text, kind) {
        const el = document.getElementById('aePresetPublishStatus');
        if (!el) return;
        if (!text) {
            el.hidden = true;
            el.textContent = '';
            el.classList.remove('is-error', 'is-ok');
            return;
        }
        el.hidden = false;
        el.textContent = text;
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-ok', kind === 'ok');
    }

    let aePresetPublishing = false;

    async function publishAePreset() {
        if (aePresetPublishing) return;
        if (typeof isAppAdmin === 'function' && !isAppAdmin()) {
            setAePresetPublishStatus('เฉพาะแอดมินเท่านั้น', 'error');
            return;
        }
        const name = String(document.getElementById('aePresetName')?.value || '').trim();
        const description = String(document.getElementById('aePresetDesc')?.value || '').trim();
        if (!name) {
            setAePresetPublishStatus('กรุณาใส่ชื่อพรีเซ็ต', 'error');
            return;
        }
        const payload = buildAePresetPayload();
        if (!Object.keys(payload.actions).length && !Object.keys(payload.events).length) {
            setAePresetPublishStatus('เลือกอย่างน้อย 1 แอคชั่นหรืออีเวนต์', 'error');
            return;
        }
        const btn = document.getElementById('aePresetPublishBtn');
        aePresetPublishing = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = aePresetEditingId ? 'กำลังบันทึก…' : 'กำลังเผยแพร่…';
        }
        setAePresetPublishStatus('กำลังอัปโหลดและบันทึกพรีเซ็ต…');
        try {
            let coverUrl = null;
            if (aePresetCoverDataUrl) coverUrl = await uploadAePresetCover(aePresetCoverDataUrl);
            const res = await fetch('/api/admin/ae-presets', {
                method: 'POST',
                headers: aeAuthHeaders(),
                body: JSON.stringify({
                    id: aePresetEditingId || undefined,
                    name,
                    description,
                    coverUrl: coverUrl || aePresetExistingCoverUrl || null,
                    payload
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `เผยแพร่ไม่สำเร็จ (${res.status})`);
            const wasEdit = !!aePresetEditingId;
            closeAePresetPublishModal();
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', wasEdit ? 'บันทึกแล้ว' : 'เผยแพร่แล้ว', name);
            }
            await refreshAePresetsGallery();
        } catch (e) {
            setAePresetPublishStatus(e.message || String(e), 'error');
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เผยแพร่ไม่สำเร็จ', e.message || String(e));
        } finally {
            aePresetPublishing = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = aePresetEditingId ? 'บันทึกการแก้ไข' : 'เผยแพร่พรีเซ็ต';
            }
        }
    }

    async function refreshAePresetsGallery() {
        const gallery = document.getElementById('aePresetGallery');
        if (!gallery) return;
        syncAePresetAdminUi();
        gallery.innerHTML = '<div class="ae-preset-state"><div class="ae-preset-state-icon">📦</div><div>กำลังโหลดพรีเซ็ต…</div></div>';
        try {
            const res = await fetch('/api/ae-presets', { headers: aeAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `โหลดพรีเซ็ตไม่สำเร็จ (${res.status})`);
            const list = Array.isArray(data.list) ? data.list : [];
            if (!list.length) {
                gallery.innerHTML = '<div class="ae-preset-state"><div class="ae-preset-state-icon">📦</div><div>ยังไม่มีพรีเซ็ต</div><div style="margin-top:6px;color:#666;font-size:0.78rem;">แอดมินสามารถสร้างแพ็กจากแอคชั่น/อีเวนต์ปัจจุบันได้</div></div>';
                return;
            }
            const isAdmin = typeof isAppAdmin === 'function' && isAppAdmin();
            gallery.innerHTML = list.map((p) => {
                const safeId = escapeHtml(String(p.id || ''));
                const coverSrc = p.coverUrl
                    ? (typeof window.resolveMediaUrl === 'function' ? window.resolveMediaUrl(p.coverUrl) : p.coverUrl)
                    : '';
                const poster = coverSrc
                    ? `<img src="${escapeHtml(String(coverSrc))}" alt="${escapeHtml(p.name || 'Preset')}" loading="lazy">`
                    : `<div class="gc-game-poster-fallback">📦</div>`;
                const adminBtns = isAdmin
                    ? `<button type="button" class="ae-preset-bar-btn ae-preset-bar-btn--edit" onclick="event.stopPropagation(); editAePreset('${safeId}')">แก้ไข</button>
                       <button type="button" class="ae-preset-bar-btn ae-preset-bar-btn--del" onclick="event.stopPropagation(); deleteAePreset('${safeId}')">ลบ</button>`
                    : '';
                return `<article class="gc-card ae-preset-gc-card">
                    <button type="button" class="gc-card-hit" onclick="applyAePreset('${safeId}')">
                        <div class="gc-game-poster">${poster}</div>
                        <div class="gc-card-meta">
                            <span class="gc-card-name">${escapeHtml(p.name || 'Untitled')}</span>
                            <span class="gc-card-desc">${escapeHtml(p.description || 'แพ็ก Actions & Events พร้อม Apply')}</span>
                        </div>
                    </button>
                    <div class="gc-card-bar ae-preset-gc-bar">
                        <span class="gc-card-state">Preset</span>
                        <div class="ae-preset-gc-actions">
                            <button type="button" class="ae-preset-bar-btn ae-preset-bar-btn--go" onclick="event.stopPropagation(); applyAePreset('${safeId}')">Apply</button>
                            ${adminBtns}
                        </div>
                    </div>
                </article>`;
            }).join('');
        } catch (e) {
            gallery.innerHTML = `<div class="ae-preset-state"><div class="ae-preset-state-icon">⚠️</div><div>${escapeHtml(e.message || 'โหลดไม่สำเร็จ')}</div><div style="margin-top:8px;"><button type="button" class="snd-toolbar-btn" onclick="refreshAePresetsGallery()">ลองใหม่</button></div></div>`;
        }
    }

    async function applyAePreset(id) {
        if (!id) return;
        try {
            const res = await fetch(`/api/ae-presets/${encodeURIComponent(id)}`, { headers: aeAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || 'โหลดพรีเซ็ตไม่สำเร็จ');
            const payload = data.preset?.payload || data.payload || {};
            const ae = getAeStore();
            if (payload.actions && typeof payload.actions === 'object') ae.actions = payload.actions;
            if (payload.events && typeof payload.events === 'object') ae.events = payload.events;
            if (Array.isArray(payload.screens)) ae.screens = payload.screens;
            saveActionsEventsToServer();
            if (typeof autoSave === 'function') autoSave();
            renderAeActionsList();
            renderAeEventsList();
            updateAeLimitUI();
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'Apply แล้ว', data.preset?.name || data.name || 'Preset');
            }
            switchAeTopTab('main');
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Apply ไม่สำเร็จ', e.message || String(e));
        }
    }

    async function deleteAePreset(id) {
        if (!id) return;
        if (typeof isAppAdmin === 'function' && !isAppAdmin()) return;
        if (!confirm('ลบพรีเซ็ตนี้?')) return;
        try {
            const res = await fetch(`/api/admin/ae-presets/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: aeAuthHeaders()
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || 'ลบไม่สำเร็จ');
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'ลบแล้ว', id);
            await refreshAePresetsGallery();
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ลบไม่สำเร็จ', e.message || String(e));
        }
    }

    function filterAeList(query) {
        aeSearchFilter = String(query || '').trim().toLowerCase();
        if (aeTopTab === 'main') {
            renderAeActionsList();
            renderAeEventsList();
        }
    }

    function updateActionsEventsSetting(key, val) {
        const ae = getAeStore();
        ae[key] = val;
        saveActionsEventsToServer();
    }

    function updateAeLimitUI() {
        const hint = document.getElementById('aeLimitHint');
        const addActionBtn = document.querySelector('#aeSec-main .ae-split-col--actions .ae-split-add');
        const addEventBtn = document.querySelector('#aeSec-main .ae-split-col--events .ae-split-add');
        const actionCount = countActions();
        const eventCount = countEvents();

        const setCreateBtn = (btn, atLimit, kind) => {
            if (!btn) return;
            btn.disabled = atLimit;
            btn.style.opacity = atLimit ? '0.45' : '';
            btn.title = atLimit
                ? `แพ็กฟรีเพิ่มได้สูงสุด ${kind === 'action' ? FREE_ACTIONS_MAX + ' แอคชั่น' : FREE_EVENTS_MAX + ' อีเวนต์'}`
                : '';
        };

        if (isAePro()) {
            if (hint) hint.style.display = 'none';
            setCreateBtn(addActionBtn, false, 'action');
            setCreateBtn(addEventBtn, false, 'event');
            return;
        }
        if (hint) {
            hint.style.display = 'block';
            hint.textContent = `แพ็กฟรี: แอคชั่น ${actionCount}/${FREE_ACTIONS_MAX} · อีเวนต์ ${eventCount}/${FREE_EVENTS_MAX} — อัปเกรด PRO เพื่อใช้ไม่จำกัด`;
        }
        setCreateBtn(addActionBtn, actionCount >= FREE_ACTIONS_MAX, 'action');
        setCreateBtn(addEventBtn, eventCount >= FREE_EVENTS_MAX, 'event');
    }

    function mediaCheckHtml(action) {
        const m = action.media || {};
        const icons = { animation: 'sparkles', picture: 'image', sound: 'volume', video: 'video' };
        return Object.entries(icons).map(([k, ic]) =>
            `<span class="ae-media-badge ${m[k] ? 'on' : ''}" title="${k}">${aeIco(ic, 12)}</span>`
        ).join('');
    }

    function renderAeActionsList() {
        const body = document.getElementById('aeActionsList');
        if (!body) return;
        const ae = getAeStore();
        const q = aeSearchFilter;
        const rows = Object.entries(ae.actions).filter(([, a]) => {
            if (!q) return true;
            const hay = `${a.name} ${getActionDescription(a)} Screen ${a.screen}`.toLowerCase();
            return hay.includes(q);
        });
        if (!rows.length) {
            body.innerHTML = `<div class="sa-v2-empty"><div class="sa-v2-empty-icon">${aeIco('zap', 36)}</div>ยังไม่มีแอคชั่น — กด "+ สร้างแอคชั่น" เพื่อเริ่มต้น</div>`;
            return;
        }
        body.innerHTML = rows.map(([id, a]) => {
            const disabled = a.enabled === false;
            const safeId = encodeURIComponent(String(a.id || id));
            const pts = a.points || 0;
            const ptsLabel = a.pointsMode === 'remove' ? `−${pts}` : (a.pointsMode === 'add' ? `+${pts}` : '0');
            return `<div class="ae-action-card ${disabled ? 'ae-row-disabled' : ''}">
                <div class="ae-action-card-tools">
                    <button type="button" class="ae-tool-btn ae-tool-play" onclick="testAction('${safeId}')" title="ทดสอบ">${aeIco('play', 15, { filled: true })}</button>
                    <button type="button" class="ae-tool-btn ae-tool-edit" onclick="openActionEditorModal('${safeId}')" title="แก้ไข">${aeIco('pencil', 15, { filled: true })}</button>
                    <button type="button" class="ae-tool-btn ae-tool-copy" onclick="duplicateAction('${safeId}')" title="คัดลอก">${aeIco('copy', 15, { filled: true })}</button>
                    <button type="button" class="ae-tool-btn ae-tool-del" onclick="removeAction('${safeId}')" title="ลบ">${aeIco('x', 15, { filled: true })}</button>
                </div>
                <div class="ae-action-card-main">
                    <div class="ae-action-card-name">${disabled ? '<span class="ae-badge-off">ปิด</span>' : ''}${escapeHtml(a.name || 'แอคชั่น')}</div>
                    <div class="ae-action-card-desc">${escapeHtml(getActionDescription(a))}</div>
                </div>
                <div class="ae-action-card-meta">
                    <span class="ae-meta-pill screen">${aeIco('tv', 12)} ${a.screen || 1}</span>
                    <span class="ae-meta-pill">${a.duration || 10}s</span>
                    <span class="ae-meta-pill points">${ptsLabel} pts</span>
                </div>
                <div class="ae-action-card-media">${mediaCheckHtml(a)}</div>
                <div class="ae-action-card-toggle">
                    <label class="switch" title="เปิด/ปิด"><input type="checkbox" ${disabled ? '' : 'checked'} onchange="toggleActionEnabled('${safeId}', this.checked)"><span class="slider"></span></label>
                </div>
            </div>`;
        }).join('');
    }

    function getEventTriggerDetail(ev) {
        let detail = ev.triggerValue || '';
        if (ev.triggerType === 'gift' && detail) {
            detail = resolveAeGiftName(detail, ev.giftName);
        }
        if (ev.triggerType === 'sticker' && detail) {
            detail = resolveAeSticker(detail, ev.emoteIcon, ev.emoteName).name;
        }
        if (ev.triggerType === 'like' && detail) detail = `${detail}+ ไลค์ / ครั้ง`;
        if (ev.triggerType === 'totallikes' && detail) {
            const mode = ev.likeCountMode === 'user' ? 'ต่อคน' : 'รวมห้อง';
            detail = `ทุก ${detail} ไลค์ (${mode})`;
        }
        if (ev.triggerType === 'coins' && detail) {
            const mode = ev.coinFireMode === 'multiply' ? 'คูณตามเหรียญ' : (ev.coinFireMode === 'exact' ? 'ตรงเป๊ะ' : 'ครั้งละ 1');
            detail = `${detail} 🪙 · ${mode}`;
        }
        return detail;
    }

    function getEventTriggerLabel(ev) {
        const t = TRIGGER_TYPES[ev.triggerType] || { emoji: '⚡', label: ev.triggerType };
        const detail = getEventTriggerDetail(ev);
        return `${t.emoji || ''} ${t.label}${detail ? ': ' + detail : ''}`.trim();
    }

    function getEventActionsLabel(ev) {
        const ae = getAeStore();
        return (ev.actionIds || []).map((id) => ae.actions[id]?.name || id).join(', ') || '—';
    }

    function getEventDisplayName(ev) {
        return String(ev?.name || '').trim() || getEventTriggerLabel(ev);
    }

    function getEventUserLabel(ev) {
        if (ev.userFilter === 'specific') {
            const username = normalizeTikTokUsername(ev.specificUsername);
            return username ? `เฉพาะ @${username}` : 'ผู้ใช้เฉพาะ';
        }
        return USER_FILTERS[ev.userFilter] || USER_FILTERS.any;
    }

    function renderAeEventsList() {
        const body = document.getElementById('aeEventsList');
        if (!body) return;
        const ae = getAeStore();
        const q = aeSearchFilter;
        const rows = Object.entries(ae.events).filter(([, ev]) => {
            if (!q) return true;
            const hay = `${getEventDisplayName(ev)} ${getEventTriggerLabel(ev)} ${getEventActionsLabel(ev)} ${getEventUserLabel(ev)}`.toLowerCase();
            return hay.includes(q);
        });
        if (!rows.length) {
            body.innerHTML = `<div class="sa-v2-empty"><div class="sa-v2-empty-icon">${aeIco('target', 36)}</div>ยังไม่มีอีเวนต์ — กด "+ สร้างอีเวนต์" เพื่อเชื่อม Trigger → Action</div>`;
            return;
        }
        body.innerHTML = rows.map(([id, ev]) => {
            const safeId = encodeURIComponent(String(ev.id || id));
            const disabled = ev.enabled === false;
            const t = TRIGGER_TYPES[ev.triggerType] || { icon: 'zap', label: ev.triggerType };
            const actions = (ev.actionIds || []).map((id) => ae.actions[id]?.name || id);
            const actionMode = getEventActionMode(ev);
            const modeLabel = actionMode === 'random' ? `สุ่ม 1 จาก ${actions.length}` : 'แอคชั่นเดียว';
            return `<div class="ae-event-card ${disabled ? 'ae-row-disabled' : ''}">
                <div class="ae-event-card-top">
                    <label class="switch ae-event-switch"><input type="checkbox" ${disabled ? '' : 'checked'} onchange="toggleEventEnabled('${safeId}', this.checked)"><span class="slider"></span></label>
                    <div class="ae-event-title-wrap">
                        <strong class="ae-event-name">${escapeHtml(getEventDisplayName(ev))}</strong>
                        <div class="ae-event-badges">
                            <span class="ae-user-badge">${escapeHtml(getEventUserLabel(ev))}</span>
                            <span class="ae-mode-badge ${actionMode}">${aeIco(actionMode === 'random' ? 'gamepad' : 'zap', 12)} ${escapeHtml(modeLabel)}</span>
                        </div>
                    </div>
                    <div class="ae-event-card-actions">
                        <button type="button" class="ae-tool-btn ae-tool-edit" onclick="openEventEditorModal('${safeId}')" title="แก้ไข">${aeIco('pencil', 15, { filled: true })}</button>
                        <button type="button" class="ae-tool-btn ae-tool-del" onclick="removeEvent('${safeId}')" title="ลบ">${aeIco('x', 15, { filled: true })}</button>
                    </div>
                </div>
                <div class="ae-event-flow">
                    <div class="ae-event-trigger-box ae-keep-emoji" data-keep-emoji>
                        ${aeTriggerThumbHtml(ev)}
                        <div>
                            <div class="ae-trigger-type">${escapeHtml(t.label)}</div>
                            <div class="ae-trigger-val">${escapeHtml(getEventTriggerDetail(ev) || t.label)}</div>
                        </div>
                    </div>
                    <div class="ae-event-arrow">→</div>
                    <div class="ae-event-actions-box">
                        ${actions.length ? actions.map((n) => `<span class="ae-action-chip">${aeIco(actionMode === 'random' ? 'gamepad' : 'zap', 11)} ${escapeHtml(n)}</span>`).join('') : '<span class="ae-action-chip empty">ยังไม่ได้เลือกแอคชั่น</span>'}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function buildAeScreenUrl(screenNum) {
        if (typeof buildOverlayUrl !== 'function') return '';
        return buildOverlayUrl('actions', { screen: String(screenNum) });
    }

    function renderAeScreensList() {
        const body = document.getElementById('aeScreensList');
        if (!body) return;
        const ae = getAeStore();
        body.innerHTML = Array.from({ length: SCREEN_COUNT }, (_, i) => {
            const n = i + 1;
            const sc = ae.screens[i] || { maxQueue: 5 };
            const url = buildAeScreenUrl(n);
            return `<div class="ae-screen-row">
                <div class="ae-screen-name">Screen ${n}</div>
                <div class="ae-screen-url">
                    <input type="text" class="field-ui ae-url-input" value="${escapeHtml(url)}" readonly id="aeScreenUrl-${n}">
                    <button type="button" class="snd-toolbar-btn" onclick="copyAeScreenUrl(${n})">📋 คัดลอก</button>
                </div>
                <div class="ae-screen-queue">
                    <label>คิวสูงสุด</label>
                    <input type="number" class="field-ui" min="1" max="20" value="${sc.maxQueue || 5}" onchange="updateScreenQueue(${n}, this.value)">
                </div>
                <div class="ae-screen-status" id="aeScreenStatus-${n}">—</div>
            </div>`;
        }).join('');
    }

    function renderAeTimersList() {
        const body = document.getElementById('aeTimersList');
        if (!body) return;
        const ae = getAeStore();
        const rows = Object.values(ae.timers);
        if (!rows.length) {
            body.innerHTML = '<div class="sa-v2-empty"><div class="sa-v2-empty-icon">⏱</div>ยังไม่มี Timer — กด "+ สร้าง Timer" เพื่อรันแอคชั่นตามช่วงเวลา</div>';
            return;
        }
        body.innerHTML = rows.map((tm) => {
            const safeId = escapeHtml(tm.id);
            const actionName = getActionById(tm.actionId)?.name || '—';
            return `<div class="ae-timer-row">
                <div>
                    <button type="button" class="ae-icon-btn" onclick="openTimerEditorModal('${safeId}')">✏️</button>
                    <button type="button" class="ae-icon-btn ae-del" onclick="removeTimer('${safeId}')">🗑</button>
                </div>
                <div><label class="switch" style="margin:0;"><input type="checkbox" ${tm.enabled !== false ? 'checked' : ''} onchange="toggleTimerEnabled('${safeId}', this.checked)"><span class="slider"></span></label></div>
                <div>${tm.intervalMinutes || 5} นาที</div>
                <div>${escapeHtml(actionName)}</div>
            </div>`;
        }).join('');
    }

    function populateAeSimGiftSelect() {
        const sel = document.getElementById('aeSimGiftSelect');
        if (!sel || sel.dataset.loaded === '1') return;
        const gifts = typeof popularGifts !== 'undefined' ? popularGifts : [];
        sel.innerHTML = '<option value="">เลือกของขวัญ...</option>' +
            gifts.slice(0, 200).map((g) => `<option value="${escapeHtml(String(g.giftId))}">${escapeHtml(g.name || g.giftName || g.giftId)}</option>`).join('');
        sel.dataset.loaded = '1';
    }

    function initActionsEventsUI() {
        ensureActionsEventsStore();
        const ae = getAeStore();
        const master = document.getElementById('aeMasterToggle');
        if (master) master.checked = ae.enabled !== false;
        updateAeLimitUI();
        switchAeTopTab(aeTopTab);
        renderAeActionsList();
        renderAeEventsList();
        startAeTimerLoop();
        saveActionsEventsToServer();
        if (window.GiftIconHelper && typeof GiftIconHelper.loadGiftCatalog === 'function') {
            GiftIconHelper.loadGiftCatalog().then(() => renderAeEventsList()).catch(() => {});
        }
        if (window.ChannelEmotes && typeof ChannelEmotes.load === 'function') {
            ChannelEmotes.load().then(() => renderAeEventsList()).catch(() => {});
        }
    }

    async function refreshActionsEventsAfterCatalog() {
        if (typeof ensureGiftCatalogLoaded === 'function') await ensureGiftCatalogLoaded();
        const sel = document.getElementById('aeSimGiftSelect');
        if (sel) sel.dataset.loaded = '';
        populateAeSimGiftSelect();
        renderAeEventsList();
    }

    // ---- Action CRUD ----
    function buildAeActionTypeList() {
        const wrap = document.getElementById('aeActionTypeList');
        if (!wrap) return;
        const m = aeActionDraft.media || {};
        wrap.innerHTML = ACTION_TYPE_DEFS.map((def) => {
            const checked = !!m[def.key];
            const soon = def.soon ? ' ae-type-soon' : '';
            const dis = def.soon ? 'disabled' : '';
            return `<label class="ae-type-item${soon}${checked ? ' active' : ''}">
                <input type="checkbox" ${dis} ${checked ? 'checked' : ''} onchange="toggleAeActionMedia('${def.key}', this.checked)">
                <span class="ae-type-icon">${aeIco(def.icon, 16)}</span>
                <span class="ae-type-label">${def.label}${def.soon ? ' <em>เร็วๆนี้</em>' : ''}</span>
            </label>`;
        }).join('');
    }

    function buildAeScreenPills() {
        const wrap = document.getElementById('aeScreenPills');
        if (!wrap) return;
        const cur = parseInt(aeActionDraft.screen, 10) || 1;
        wrap.innerHTML = Array.from({ length: SCREEN_COUNT }, (_, i) => {
            const n = i + 1;
            return `<button type="button" class="ae-screen-pill ${n === cur ? 'active' : ''}" onclick="selectAeScreen(${n})">${n}</button>`;
        }).join('');
    }

    function selectAeScreen(n) {
        aeActionDraft.screen = n;
        const hidden = document.getElementById('aeActionScreen');
        if (hidden) hidden.value = n;
        buildAeScreenPills();
        updateAeActionScreenHint();
    }

    function updateAeActionScreenHint() {
        const n = parseInt(aeActionDraft.screen, 10) || 1;
        const numEl = document.getElementById('aeActionScreenHintNum');
        const urlEl = document.getElementById('aeActionScreenUrl');
        const url = buildAeScreenUrl(n);
        if (numEl) numEl.textContent = n;
        if (urlEl) urlEl.textContent = url || '—';
    }

    function copyAeActionScreenUrl() {
        const url = document.getElementById('aeActionScreenUrl')?.textContent || '';
        copyAeUrl(url, 'URL ของ Screen');
    }

    function copyAeUrl(url, label) {
        if (!url || url === '—') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ยังไม่มี URL', 'กรุณาเข้าสู่ระบบก่อนคัดลอก');
            return;
        }
        if (typeof copyToClipboard === 'function') {
            copyToClipboard(url, true);
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'Copy URL แล้ว', label || 'Overlay URL');
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', label || 'Overlay URL');
        } catch (_) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'คัดลอกไม่ได้', 'กรุณาเลือก URL แล้วกด Ctrl+C');
        }
        textarea.remove();
    }

    function syncAePointsMode() {
        const mode = document.querySelector('input[name="aePointsMode"]:checked')?.value || 'none';
        const ptsEl = document.getElementById('aeActionPoints');
        if (ptsEl) {
            ptsEl.disabled = mode === 'none';
            if (mode === 'none') ptsEl.value = 0;
        }
        aeActionDraft.pointsMode = mode;
    }

    function syncAeUploadPanels() {
        const m = aeActionDraft.media || {};
        const kinds = ['sound', 'picture', 'animation', 'video'];
        let any = false;
        kinds.forEach((k) => {
            const zone = document.getElementById('aeUploadZone-' + k);
            if (zone) {
                const show = !!m[k];
                zone.style.display = show ? 'flex' : 'none';
                if (show) any = true;
            }
        });
        const ttsZone = document.getElementById('aeUploadZone-tts');
        if (ttsZone) {
            const show = !!m.tts;
            ttsZone.style.display = show ? 'flex' : 'none';
            if (show) any = true;
            const ta = document.getElementById('aeActionTtsText');
            if (ta && document.activeElement !== ta) ta.value = aeActionDraft.ttsText || '{nickname} ส่ง {giftname}';
        }
        const ksZone = document.getElementById('aeUploadZone-keystroke');
        if (ksZone) {
            const show = !!m.keystroke;
            ksZone.style.display = show ? 'flex' : 'none';
            if (show) any = true;
            updateAeKeystrokeSummary();
        }
        const ph = document.getElementById('aeUploadPlaceholder');
        if (ph) ph.style.display = any ? 'none' : 'flex';
    }

    function updateAeKeystrokeSummary() {
        const el = document.getElementById('aeActionKeystrokeLabel');
        if (!el) return;
        const ks = Object.assign({}, DEFAULT_KEYSTROKE, aeActionDraft.keystroke || {});
        const seq = String(ks.sequence || '').trim();
        if (!seq) {
            el.textContent = 'ยังไม่ได้ตั้งค่าคีย์';
            el.classList.remove('has-file');
            return;
        }
        const mods = [ks.ctrl && 'CTRL', ks.alt && 'ALT', ks.shift && 'SHIFT'].filter(Boolean).join('+');
        el.textContent = (mods ? mods + ' + ' : '') + (seq.length > 42 ? seq.slice(0, 42) + '…' : seq);
        el.classList.add('has-file');
    }

    function onAeTtsTextInput(val) {
        aeActionDraft.ttsText = String(val || '');
    }

    let aeKeystrokeDraft = null;

    function openAeKeystrokeModal() {
        if (!aeActionDraft.keystroke) aeActionDraft.keystroke = Object.assign({}, DEFAULT_KEYSTROKE);
        aeKeystrokeDraft = Object.assign({}, DEFAULT_KEYSTROKE, aeActionDraft.keystroke);
        const seq = document.getElementById('aeKsSequence');
        const hold = document.getElementById('aeKsHoldMs');
        const game = document.getElementById('aeKsGameMode');
        const ctrl = document.getElementById('aeKsCtrl');
        const alt = document.getElementById('aeKsAlt');
        const shift = document.getElementById('aeKsShift');
        if (seq) seq.value = aeKeystrokeDraft.sequence || '';
        if (hold) hold.value = aeKeystrokeDraft.holdMs || 100;
        if (game) game.checked = !!aeKeystrokeDraft.gameMode;
        if (ctrl) ctrl.checked = !!aeKeystrokeDraft.ctrl;
        if (alt) alt.checked = !!aeKeystrokeDraft.alt;
        if (shift) shift.checked = !!aeKeystrokeDraft.shift;
        const overlay = document.getElementById('aeKeystrokeOverlay');
        if (overlay) overlay.style.display = 'flex';
        try {
            const { ipcRenderer } = (window.electron || {});
            if (!ipcRenderer?.invoke) return;
            ipcRenderer.invoke('keystroke-autoit-available').then((ok) => {
                const hint = document.getElementById('aeKsAutoItHint');
                if (hint) hint.textContent = ok ? 'พบ AutoIt แล้ว' : 'ยังไม่พบ AutoIt3.exe (โหมดเกมจะ fallback เป็น SendInput)';
            }).catch(() => {});
        } catch (e) { /* browser */ }
    }

    function closeAeKeystrokeModal() {
        const overlay = document.getElementById('aeKeystrokeOverlay');
        if (overlay) overlay.style.display = 'none';
        aeKeystrokeDraft = null;
    }

    function aeKsInsertToken(token) {
        aeKsInsertInto('aeKsSequence', token);
    }

    function aeKsInsertInto(elId, token) {
        const seq = document.getElementById(elId);
        if (!seq) return;
        const start = seq.selectionStart != null ? seq.selectionStart : String(seq.value || '').length;
        const end = seq.selectionEnd != null ? seq.selectionEnd : start;
        const before = String(seq.value || '').slice(0, start);
        const after = String(seq.value || '').slice(end);
        seq.value = before + token + after;
        if (elId === 'aeActionTtsText') onAeTtsTextInput(seq.value);
        const pos = start + String(token).length;
        seq.focus();
        try { seq.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    }

    function saveAeKeystrokeFromModal() {
        const seq = document.getElementById('aeKsSequence');
        const hold = document.getElementById('aeKsHoldMs');
        aeActionDraft.keystroke = {
            sequence: (seq && seq.value) || '',
            ctrl: !!document.getElementById('aeKsCtrl')?.checked,
            alt: !!document.getElementById('aeKsAlt')?.checked,
            shift: !!document.getElementById('aeKsShift')?.checked,
            holdMs: parseInt(hold && hold.value, 10) || 100,
            gameMode: !!document.getElementById('aeKsGameMode')?.checked
        };
        if (!aeActionDraft.media) aeActionDraft.media = {};
        aeActionDraft.media.keystroke = true;
        buildAeActionTypeList();
        syncAeUploadPanels();
        closeAeKeystrokeModal();
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คีย์บอร์ด', 'บันทึกลำดับคีย์แล้ว');
    }

    async function testAeKeystrokeFromModal() {
        const seq = document.getElementById('aeKsSequence');
        const hold = document.getElementById('aeKsHoldMs');
        const opts = {
            sequence: (seq && seq.value) || '',
            ctrl: !!document.getElementById('aeKsCtrl')?.checked,
            alt: !!document.getElementById('aeKsAlt')?.checked,
            shift: !!document.getElementById('aeKsShift')?.checked,
            holdMs: parseInt(hold && hold.value, 10) || 100,
            gameMode: !!document.getElementById('aeKsGameMode')?.checked
        };
        if (!String(opts.sequence).trim()) {
            if (typeof showCustomMsg === 'function') showCustomMsg('warning', 'คีย์บอร์ด', 'ใส่คีย์หรือข้อความก่อนทดสอบ');
            return;
        }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('info', 'ทดสอบคีย์', 'จะส่งคีย์ใน 5 วินาที — สลับไปหน้าต่างเกม/แอปเป้าหมาย');
        }
        await new Promise((r) => setTimeout(r, 5000));
        await runAeKeystrokes(opts);
    }

    function fillActionModalFromDraft(a) {
        const nameEl = document.getElementById('aeActionName');
        const durEl = document.getElementById('aeActionDuration');
        const ptsEl = document.getElementById('aeActionPoints');
        const descEl = document.getElementById('aeActionDescription');
        const volEl = document.getElementById('aeActionVolume');
        const volLabel = document.getElementById('aeActionVolumeLabel');
        const gCd = document.getElementById('aeActionGlobalCd');
        const uCd = document.getElementById('aeActionUserCd');
        const fade = document.getElementById('aeActionFade');
        const combo = document.getElementById('aeActionRepeatCombo');
        const skip = document.getElementById('aeActionSkipNext');
        if (nameEl) nameEl.value = a?.name || '';
        if (durEl) durEl.value = a?.duration || 10;
        if (ptsEl) ptsEl.value = Math.abs(a?.points || 0);
        if (descEl) descEl.value = a?.description || '';
        if (volEl) volEl.value = a?.soundVolume != null ? a.soundVolume : 85;
        if (volLabel) volLabel.textContent = (a?.soundVolume != null ? a.soundVolume : 85) + '%';
        if (gCd) gCd.value = a?.globalCooldown || 0;
        if (uCd) uCd.value = a?.userCooldown || 0;
        if (fade) fade.checked = a ? a.fadeInOut !== false : true;
        if (combo) combo.checked = !!a?.repeatCombo;
        if (skip) skip.checked = !!a?.skipOnNext;
        const mode = a?.pointsMode || (a?.points < 0 ? 'remove' : (a?.points > 0 ? 'add' : 'none'));
        document.querySelectorAll('input[name="aePointsMode"]').forEach((r) => { r.checked = r.value === mode; });
        syncAePointsMode();
        selectAeScreen(a?.screen || 1);
    }

    function openActionEditorModal(id) {
        id = decodeAeId(id);
        if (!aePresetComposerMode && !id && !canAddAction()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Actions — แพ็กฟรีเพิ่มได้สูงสุด ${FREE_ACTIONS_MAX} แอคชั่น`);
            }
            return;
        }
        aeEditingActionId = id || null;
        const source = getComposerActionMap();
        const a = id ? source[id] : null;
        aeActionDraft = a ? JSON.parse(JSON.stringify(a)) : {
            media: { sound: true },
            screen: 1,
            duration: 10,
            points: 0,
            pointsMode: 'none',
            soundVolume: 85,
            globalCooldown: 0,
            userCooldown: 0,
            fadeInOut: true,
            repeatCombo: false,
            skipOnNext: false,
            ttsText: '{nickname} ส่ง {giftname}',
            keystroke: Object.assign({}, DEFAULT_KEYSTROKE)
        };
        if (!aeActionDraft.media) aeActionDraft.media = { sound: true };
        if (aeActionDraft.ttsText == null) aeActionDraft.ttsText = '{nickname} ส่ง {giftname}';
        if (!aeActionDraft.keystroke) aeActionDraft.keystroke = Object.assign({}, DEFAULT_KEYSTROKE);
        const title = document.getElementById('aeActionModalTitle');
        if (title) {
            title.textContent = aePresetComposerMode
                ? (id ? 'แก้ไขแอคชั่นในพรีเซ็ต' : 'สร้างแอคชั่นใหม่ในพรีเซ็ต')
                : (id ? 'แก้ไขแอคชั่น' : 'สร้างแอคชั่นใหม่');
        }
        fillActionModalFromDraft(aeActionDraft);
        buildAeActionTypeList();
        syncAeUploadPanels();
        updateAeActionFileLabels();
        updateAeActionScreenHint();
        const overlay = document.getElementById('aeActionEditorOverlay');
        if (overlay) {
            if (aePresetComposerMode) overlay.style.zIndex = '13050';
            overlay.style.display = 'flex';
        }
    }

    function closeActionEditorModal() {
        const overlay = document.getElementById('aeActionEditorOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            if (!aePresetComposerMode) overlay.style.zIndex = '';
        }
        aeEditingActionId = null;
    }

    function toggleAeActionMedia(key, checked) {
        if (!aeActionDraft.media) aeActionDraft.media = {};
        aeActionDraft.media[key] = !!checked;
        if (key === 'tts' && checked && !aeActionDraft.ttsText) {
            aeActionDraft.ttsText = '{nickname} ส่ง {giftname}';
        }
        if (key === 'keystroke' && checked) {
            if (!aeActionDraft.keystroke) aeActionDraft.keystroke = Object.assign({}, DEFAULT_KEYSTROKE);
            // Open configurator when enabling for the first time without a sequence
            if (!String(aeActionDraft.keystroke.sequence || '').trim()) {
                setTimeout(() => openAeKeystrokeModal(), 60);
            }
        }
        buildAeActionTypeList();
        syncAeUploadPanels();
    }

    function updateAeActionFileLabels() {
        const map = {
            sound: ['aeActionSoundLabel', 'soundName', 'soundUrl', 'builtin', 'soundboardId'],
            picture: ['aeActionImageLabel', 'imageName', 'imageUrl'],
            animation: ['aeActionAnimLabel', 'animationName', 'animationUrl'],
            video: ['aeActionVideoLabel', 'videoName']
        };
        Object.entries(map).forEach(([kind, [elId, ...keys]]) => {
            const el = document.getElementById(elId);
            if (!el) return;
            let name = '';
            keys.forEach((k) => { if (aeActionDraft[k]) name = aeActionDraft[k]; });
            if (kind === 'sound' && aeActionDraft.soundData && aeActionDraft.soundName) name = aeActionDraft.soundName;
            if (kind === 'sound' && aeActionDraft.soundboardId && aeActionDraft.soundName) name = 'Soundboard: ' + aeActionDraft.soundName;
            if (kind === 'sound' && aeActionDraft.soundUrl && aeActionDraft.soundName) name = 'MyInstants: ' + aeActionDraft.soundName;
            el.textContent = name || 'ยังไม่ได้เลือกไฟล์';
            el.classList.toggle('has-file', !!name);
        });
    }

    async function handleAeActionFileUpload(input, kind) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        input.value = '';
        try {
            let dataUrl = '';
            const sniffApi = window.TokMediaSniff;
            if (sniffApi && sniffApi.fileToDataUrl) {
                const r = await sniffApi.fileToDataUrl(file);
                const slot = kind === 'picture' ? 'picture' : kind;
                dataUrl = (r.sniff && r.sniff.kind === 'bin' && r.bytes && sniffApi.dataUrlForSlot)
                    ? sniffApi.dataUrlForSlot(r.bytes, slot)
                    : (r.dataUrl || '');
            } else {
                dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result || '');
                    reader.onerror = () => reject(reader.error || new Error('อ่านไฟล์ไม่ได้'));
                    reader.readAsDataURL(file);
                });
                if (sniffApi && sniffApi.rewriteDataUrl) dataUrl = sniffApi.rewriteDataUrl(dataUrl);
            }
            if (!dataUrl) throw new Error('ไฟล์ว่างหรืออ่านไม่ได้');
            const dataKey = kind === 'sound' ? 'soundData' : kind === 'picture' ? 'imageData' : kind === 'animation' ? 'animationData' : 'videoData';
            const nameKey = kind === 'sound' ? 'soundName' : kind === 'picture' ? 'imageName' : kind === 'animation' ? 'animationName' : 'videoName';
            aeActionDraft[dataKey] = dataUrl;
            aeActionDraft[nameKey] = file.name;
            if (kind === 'sound') { aeActionDraft.soundUrl = null; aeActionDraft.builtin = null; aeActionDraft.soundboardId = null; aeActionDraft.myinstantsSlug = null; }
            if (!aeActionDraft.media) aeActionDraft.media = {};
            aeActionDraft.media[kind] = true;
            buildAeActionTypeList();
            syncAeUploadPanels();
            updateAeActionFileLabels();
        } catch (err) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'อ่านไฟล์ไม่ได้', err.message || 'ลองไฟล์อื่น');
        }
    }

    function pickMyInstantsForAction() {
        if (typeof openSoundAlertMyInstantsModal !== 'function') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'MyInstants', 'ระบบเสียงยังไม่พร้อม');
            return;
        }
        openSoundAlertMyInstantsModal('action');
    }

    function applyAeMyInstantsPick(soundUrl, slug, name) {
        if (!aeActionDraft.media) aeActionDraft.media = {};
        aeActionDraft.media.sound = true;
        aeActionDraft.soundUrl = soundUrl || null;
        aeActionDraft.myinstantsSlug = slug || null;
        aeActionDraft.soundName = name || 'MyInstants';
        aeActionDraft.soundData = null;
        aeActionDraft.soundboardId = null;
        aeActionDraft.builtin = null;
        buildAeActionTypeList();
        syncAeUploadPanels();
        updateAeActionFileLabels();
    }

    function pickSoundboardForAction() {
        if (typeof isAppAdmin === 'function' && !isAppAdmin()) {
            if (typeof showSoonFeaturePrompt === 'function') showSoonFeaturePrompt('Soundboard');
            return;
        }
        if (!window.TokSoundboard) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Soundboard', 'ระบบเสียงยังไม่พร้อม');
            return;
        }
        TokSoundboard.openPicker({
            onPick: (sound) => {
                aeActionDraft.soundboardId = sound.id;
                aeActionDraft.soundName = sound.name;
                aeActionDraft.soundData = null;
                aeActionDraft.soundUrl = null;
                aeActionDraft.builtin = null;
                aeActionDraft.myinstantsSlug = null;
                if (!aeActionDraft.media) aeActionDraft.media = {};
                aeActionDraft.media.sound = true;
                buildAeActionTypeList();
                syncAeUploadPanels();
                updateAeActionFileLabels();
            }
        });
    }

    function saveActionFromModal() {
        const nameEl = document.getElementById('aeActionName');
        const screenEl = document.getElementById('aeActionScreen');
        const durEl = document.getElementById('aeActionDuration');
        const ptsEl = document.getElementById('aeActionPoints');
        const descEl = document.getElementById('aeActionDescription');
        const volEl = document.getElementById('aeActionVolume');
        const name = (nameEl && nameEl.value || '').trim();
        if (!name) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'กรุณากรอกชื่อแอคชั่น');
            return;
        }
        const id = decodeAeId(aeEditingActionId) || uid('ae');
        const mode = document.querySelector('input[name="aePointsMode"]:checked')?.value || 'none';
        const pts = parseInt(ptsEl && ptsEl.value, 10) || 0;
        const saved = {
            ...aeActionDraft,
            id,
            name,
            screen: parseInt(screenEl && screenEl.value, 10) || 1,
            duration: parseInt(durEl && durEl.value, 10) || 10,
            points: pts,
            pointsMode: mode,
            soundVolume: parseInt(volEl && volEl.value, 10) || 85,
            globalCooldown: parseInt(document.getElementById('aeActionGlobalCd')?.value, 10) || 0,
            userCooldown: parseInt(document.getElementById('aeActionUserCd')?.value, 10) || 0,
            fadeInOut: document.getElementById('aeActionFade')?.checked !== false,
            repeatCombo: !!document.getElementById('aeActionRepeatCombo')?.checked,
            skipOnNext: !!document.getElementById('aeActionSkipNext')?.checked,
            description: (descEl && descEl.value || '').trim(),
            ttsText: aeActionDraft.ttsText || '',
            keystroke: Object.assign({}, DEFAULT_KEYSTROKE, aeActionDraft.keystroke || {}),
            enabled: true
        };

        if (aePresetComposerMode) {
            const prev = aePresetDraft.actions[id];
            aePresetDraft.actions[id] = { ...(prev || {}), ...saved, enabled: prev ? prev.enabled !== false : true };
            closeActionEditorModal();
            renderAePresetDraftPicks();
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'บันทึกลงพรีเซ็ตแล้ว', name);
            return;
        }

        const ae = getAeStore();
        const prev = ae.actions[id];
        if (!aeEditingActionId && !canAddAction()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Actions — แพ็กฟรีเพิ่มได้สูงสุด ${FREE_ACTIONS_MAX} แอคชั่น`);
            }
            return;
        }
        ae.actions[id] = {
            ...(prev || {}),
            ...saved,
            enabled: prev ? prev.enabled !== false : true
        };
        saveActionsEventsToServer();
        closeActionEditorModal();
        renderAeActionsList();
        renderAeEventsList();
        updateAeLimitUI();
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'บันทึกแอคชั่นแล้ว', name);
    }

    async function removeAction(id) {
        id = decodeAeId(id);
        if (!(await tcConfirm('ลบแอคชั่นนี้?', { title: 'ลบแอคชั่น', icon: '🗑️', okLabel: 'ลบ' }))) return;
        const ae = getAeStore();
        delete ae.actions[id];
        Object.values(ae.events).forEach((ev) => {
            if (ev.actionIds) ev.actionIds = ev.actionIds.filter((x) => x !== id);
        });
        Object.values(ae.timers).forEach((tm) => {
            if (tm.actionId === id) tm.actionId = '';
        });
        saveActionsEventsToServer();
        renderAeActionsList();
        renderAeEventsList();
        renderAeTimersList();
        updateAeLimitUI();
    }

    function duplicateAction(id) {
        id = decodeAeId(id);
        const src = getActionById(id);
        if (!src) return;
        if (!canAddAction()) {
            if (typeof showProUpgradePrompt === 'function') showProUpgradePrompt(`Actions — แพ็กฟรีเพิ่มได้สูงสุด ${FREE_ACTIONS_MAX} แอคชั่น`);
            return;
        }
        const ae = getAeStore();
        const newId = uid('ae');
        ae.actions[newId] = { ...JSON.parse(JSON.stringify(src)), id: newId, name: (src.name || 'แอคชั่น') + ' (คัดลอก)' };
        saveActionsEventsToServer();
        renderAeActionsList();
        updateAeLimitUI();
    }

    function toggleActionEnabled(id, enabled) {
        id = decodeAeId(id);
        const a = getActionById(id);
        if (!a) return;
        if (enabled && a.enabled === false && !canEnableAction()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Actions — แพ็กฟรีเปิดใช้ได้สูงสุด ${FREE_ACTIONS_MAX} แอคชั่น`);
            }
            renderAeActionsList();
            return;
        }
        a.enabled = !!enabled;
        saveActionsEventsToServer();
        renderAeActionsList();
        updateAeLimitUI();
    }

    async function testAction(id) {
        id = decodeAeId(id);
        const action = getAeStore().actions[id];
        if (action && action.media && action.media.keystroke) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('info', 'ทดสอบคีย์', 'จะส่งคีย์ใน 5 วินาที — สลับไปหน้าต่างเกม/แอปเป้าหมาย');
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        playAction(id, { test: true });
    }

    function stopActionTests(screen) {
        if (!currentUser?.streamToken || typeof socket === 'undefined') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'หยุดไม่ได้', 'กรุณาเข้าสู่ระบบก่อน');
            return;
        }
        socket.emit('stop_actions', {
            token: currentUser.streamToken,
            screen: Math.max(0, Math.min(SCREEN_COUNT, parseInt(screen || '0', 10) || 0))
        });
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'หยุดการทดสอบแล้ว', 'ล้างภาพ เสียง วิดีโอ และคิวทั้งหมด');
    }

    // ---- Event CRUD ----
    function selectAeEventUser(val) {
        aeEventDraft.userFilter = val;
        const hidden = document.getElementById('aeEventUserFilter');
        if (hidden) hidden.value = val;
        document.querySelectorAll('#aeEventUserChips .ae-user-option').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.val === val);
        });
        const specificPanel = document.getElementById('aeEventSpecificUserPanel');
        if (specificPanel) specificPanel.style.display = val === 'specific' ? 'block' : 'none';
    }

    function selectAeEventTrigger(val) {
        aeEventDraft.triggerType = val;
        const hidden = document.getElementById('aeEventTriggerType');
        if (hidden) hidden.value = val;
        document.querySelectorAll('#aeEventTriggerChips .ae-trigger-tile').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.val === val);
        });
        syncAeEventTriggerUI();
    }

    function selectAeEventActionMode(mode) {
        aeEventDraft.actionMode = mode === 'random' ? 'random' : 'single';
        if (aeEventDraft.actionMode === 'single' && (aeEventDraft.actionIds || []).length > 1) {
            aeEventDraft.actionIds = [aeEventDraft.actionIds[0]];
        }
        document.querySelectorAll('#aeEventActionModes .ae-mode-card').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === aeEventDraft.actionMode);
        });
        renderAeEventActionPicker();
    }

    function updateAeEventGiftPreview() {
        const preview = document.getElementById('aeEventGiftPreview');
        const val = aeEventDraft.triggerValue || document.getElementById('aeEventTriggerValue')?.value || '';
        if (!preview) return;
        if (aeEventDraft.triggerType !== 'gift' || !val) {
            preview.style.display = 'none';
            return;
        }
        const name = resolveAeGiftName(val, aeEventDraft.giftName);
        const iconUrl = proxyAeMediaUrl(resolveAeGiftIcon(val, name, aeEventDraft.giftIcon));
        const icon = iconUrl
            ? `<img src="${escapeHtml(iconUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
            : aeIco('gift', 18);
        preview.style.display = 'flex';
        preview.innerHTML = `${icon}<span>${escapeHtml(name)}</span>`;
    }

    function openEventEditorModal(id) {
        id = decodeAeId(id);
        if (!aePresetComposerMode && !id && !canAddEvent()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Events — แพ็กฟรีเพิ่มได้สูงสุด ${FREE_EVENTS_MAX} อีเวนต์`);
            }
            return;
        }
        aeEditingEventId = id || null;
        const source = getComposerEventMap();
        const ev = id ? source[id] : null;
        aeEventDraft = ev ? JSON.parse(JSON.stringify(ev)) : {
            name: '',
            userFilter: 'any',
            specificUsername: '',
            triggerType: 'gift',
            triggerValue: '',
            coinFireMode: 'once',
            likeCountMode: 'room',
            actionMode: 'single',
            actionIds: []
        };
        if (!aeEventDraft.coinFireMode) aeEventDraft.coinFireMode = 'once';
        if (!aeEventDraft.likeCountMode) aeEventDraft.likeCountMode = 'room';
        aeEventDraft.actionMode = getEventActionMode(aeEventDraft);
        aeEventDraft.name = String(aeEventDraft.name || (ev ? getEventTriggerLabel(ev) : '')).trim();
        const title = document.getElementById('aeEventModalTitle');
        if (title) {
            title.textContent = aePresetComposerMode
                ? (id ? 'แก้ไขอีเวนต์ในพรีเซ็ต' : 'สร้างอีเวนต์ใหม่ในพรีเซ็ต')
                : (id ? 'แก้ไขอีเวนต์' : 'สร้างอีเวนต์ใหม่');
        }
        const nameEl = document.getElementById('aeEventName');
        if (nameEl) nameEl.value = aeEventDraft.name;
        const userEl = document.getElementById('aeEventSpecificUsername');
        if (userEl) userEl.value = aeEventDraft.specificUsername || '';
        const valEl = document.getElementById('aeEventTriggerValue');
        if (valEl) valEl.value = aeEventDraft.triggerValue || '';
        selectAeEventUser(aeEventDraft.userFilter || 'any');
        selectAeEventTrigger(aeEventDraft.triggerType || 'gift');
        selectAeEventActionMode(aeEventDraft.actionMode);
        selectAeCoinFireMode(aeEventDraft.coinFireMode || 'once');
        selectAeLikeCountMode(aeEventDraft.likeCountMode || 'room');
        updateAeEventGiftPreview();
        updateAeEventStickerPreview();
        const overlay = document.getElementById('aeEventEditorOverlay');
        if (overlay) {
            if (aePresetComposerMode) overlay.style.zIndex = '13050';
            overlay.style.display = 'flex';
        }
    }

    function closeEventEditorModal() {
        const overlay = document.getElementById('aeEventEditorOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            if (!aePresetComposerMode) overlay.style.zIndex = '';
        }
        aeEditingEventId = null;
    }

    function syncAeEventTriggerUI() {
        const type = aeEventDraft.triggerType || document.getElementById('aeEventTriggerType')?.value || 'gift';
        aeEventDraft.triggerType = type;
        const giftBtn = document.getElementById('aeEventGiftBtn');
        const stickerBtn = document.getElementById('aeEventStickerBtn');
        const valLabel = document.getElementById('aeEventTriggerValueLabel');
        const valInput = document.getElementById('aeEventTriggerValue');
        const coinsExtra = document.getElementById('aeEventCoinsExtra');
        const likesExtra = document.getElementById('aeEventTotalLikesExtra');
        const stickerExtra = document.getElementById('aeEventStickerExtra');
        const valueRow = document.getElementById('aeEventValueRow');
        if (giftBtn) giftBtn.style.display = type === 'gift' ? 'inline-flex' : 'none';
        if (stickerBtn) stickerBtn.style.display = type === 'sticker' ? 'inline-flex' : 'none';
        if (valLabel) valLabel.textContent = TRIGGER_VALUE_LABELS[type] || 'ค่า Trigger';
        if (coinsExtra) coinsExtra.style.display = type === 'coins' ? 'block' : 'none';
        if (likesExtra) likesExtra.style.display = type === 'totallikes' ? 'block' : 'none';
        if (stickerExtra) stickerExtra.style.display = type === 'sticker' ? 'block' : 'none';
        const suffix = document.getElementById('aeEventValueSuffix');
        if (suffix) {
            if (type === 'coins') {
                suffix.style.display = 'inline';
                suffix.textContent = '🪙 เหรียญ';
            } else if (type === 'totallikes') {
                suffix.style.display = 'inline';
                suffix.textContent = '💯 ไลค์';
            } else if (type === 'like') {
                suffix.style.display = 'inline';
                suffix.textContent = '❤️ ไลค์';
            } else {
                suffix.style.display = 'none';
                suffix.textContent = '';
            }
        }
        if (valInput) {
            const noVal = ['follow', 'share', 'join'].includes(type);
            const hideInput = type === 'sticker';
            valInput.style.display = hideInput ? 'none' : '';
            if (valueRow) valueRow.style.display = noVal ? 'none' : 'flex';
            valInput.placeholder = type === 'coins'
                ? 'เช่น 1'
                : (type === 'totallikes' ? 'เช่น 100' : (type === 'like' ? 'เช่น 10' : (type === 'command' ? '/เริ่ม' : 'ระบุค่า...')));
            valInput.disabled = noVal;
            if (noVal) valInput.value = '';
            if (type === 'coins' && !valInput.value) valInput.value = '1';
            if (type === 'totallikes' && !valInput.value) valInput.value = '100';
        }
        updateAeEventGiftPreview();
        updateAeEventStickerPreview();
    }

    function selectAeCoinFireMode(mode) {
        aeEventDraft.coinFireMode = mode === 'multiply' || mode === 'exact' ? mode : 'once';
        document.querySelectorAll('#aeEventCoinFireModes .ae-extra-opt').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === aeEventDraft.coinFireMode);
        });
    }

    function selectAeLikeCountMode(mode) {
        aeEventDraft.likeCountMode = mode === 'user' ? 'user' : 'room';
        document.querySelectorAll('#aeEventLikeCountModes .ae-extra-opt').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === aeEventDraft.likeCountMode);
        });
    }

    function updateAeEventStickerPreview() {
        const preview = document.getElementById('aeEventStickerPreview');
        if (!preview) return;
        const val = aeEventDraft.triggerValue || document.getElementById('aeEventTriggerValue')?.value || '';
        if (aeEventDraft.triggerType !== 'sticker' || !val) {
            preview.innerHTML = '<span class="ae-sticker-empty">ยังไม่ได้เลือกสติกเกอร์</span>';
            return;
        }
        const info = resolveAeSticker(val, aeEventDraft.emoteIcon, aeEventDraft.emoteName);
        const src = proxyAeMediaUrl(info.icon);
        const img = src
            ? `<img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
            : '💖';
        preview.innerHTML = `${img}<span>${escapeHtml(info.name)}</span>`;
    }

    function onAeEventTriggerTypeChange() {
        syncAeEventTriggerUI();
    }

    function renderAeEventActionPicker() {
        const wrap = document.getElementById('aeEventActionPicker');
        if (!wrap) return;
        const actionMap = getComposerActionMap();
        const selected = new Set(aeEventDraft.actionIds || []);
        const actions = Object.values(actionMap).sort((a, b) => {
            const selectedDiff = Number(selected.has(b.id)) - Number(selected.has(a.id));
            return selectedDiff || String(a.name || '').localeCompare(String(b.name || ''));
        });
        const mode = aeEventDraft.actionMode || 'single';
        const summary = document.getElementById('aeEventActionSummary');
        if (summary) {
            const count = selected.size;
            summary.innerHTML = mode === 'random'
                ? `<strong>${count}</strong> รายการในพูล — ระบบจะสุ่มเพียง 1 รายการต่อครั้ง`
                : count ? 'เลือกแอคชั่นสำหรับอีเวนต์นี้แล้ว' : 'เลือกแอคชั่นที่ต้องการให้ทำงาน';
            summary.classList.toggle('ready', count > 0);
        }
        if (!actions.length) {
            wrap.innerHTML = aePresetComposerMode
                ? '<div class="ae-picker-empty">ยังไม่มีแอคชั่นในพรีเซ็ต — สร้างแอคชั่นในพรีเซ็ตก่อน</div>'
                : '<div class="ae-picker-empty">ยังไม่มีแอคชั่น — สร้างแอคชั่นก่อนแล้วกลับมาเลือก</div>';
            return;
        }
        wrap.innerHTML = actions.map((a) => {
            const safeId = escapeHtml(a.id);
            const on = selected.has(a.id);
            const disabled = a.enabled === false;
            const m = a.media || {};
            const mediaTags = [
                m.sound ? aeIco('volume', 12) : '', m.picture ? aeIco('image', 12) : '',
                m.animation ? aeIco('sparkles', 12) : '', m.video ? aeIco('video', 12) : ''
            ].filter(Boolean).join(' ');
            return `<label class="ae-action-card-pick ${on ? 'selected' : ''} ${disabled ? 'disabled' : ''}">
                <input type="${mode === 'single' ? 'radio' : 'checkbox'}" name="${mode === 'single' ? 'aeEventSingleAction' : ''}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="toggleAeEventActionPick('${safeId}', this.checked)">
                <div class="ae-acp-body">
                    <span class="ae-acp-name">${aeIco('zap', 12)} ${escapeHtml(a.name || a.id)}</span>
                    <span class="ae-acp-meta">Screen ${a.screen || 1} · ${a.duration || 10}s ${mediaTags ? '· ' + mediaTags : ''}${disabled ? ' · ปิดใช้งาน' : ''}</span>
                </div>
            </label>`;
        }).join('');
    }

    function toggleAeEventActionPick(id, checked) {
        if (!aeEventDraft.actionIds) aeEventDraft.actionIds = [];
        if ((aeEventDraft.actionMode || 'single') === 'single') {
            aeEventDraft.actionIds = checked ? [id] : [];
        } else if (checked && !aeEventDraft.actionIds.includes(id)) {
            aeEventDraft.actionIds.push(id);
        } else {
            aeEventDraft.actionIds = aeEventDraft.actionIds.filter((x) => x !== id);
        }
        renderAeEventActionPicker();
    }

    function openAeGiftPickerForEvent() {
        aeGiftPickerFor = 'event';
        try {
            openAeGiftPickerModal();
        } catch (err) {
            console.warn('[ActionsEvents] gift picker', err);
            const overlay = document.getElementById('aeGiftPickerOverlay');
            if (overlay) overlay.style.display = 'flex';
            renderAeGiftPickerGrid('');
        }
    }

    function onAeGiftPicked(giftId, giftName, giftIcon) {
        if (aeGiftPickerFor === 'event') {
            const valEl = document.getElementById('aeEventTriggerValue');
            if (valEl) valEl.value = giftId;
            aeEventDraft.triggerValue = String(giftId);
            aeEventDraft.giftName = giftName || resolveAeGiftName(giftId, '');
            aeEventDraft.giftIcon = giftIcon || resolveAeGiftIcon(giftId, aeEventDraft.giftName, '');
            updateAeEventGiftPreview();
        }
        closeAeGiftPickerModal();
    }

    function openAeGiftPickerModal() {
        const picker = (typeof window !== 'undefined' && window.GiftPicker) ? window.GiftPicker : null;
        if (picker && typeof picker.open === 'function') {
            const selectedId = String(
                aeEventDraft.triggerValue || document.getElementById('aeEventTriggerValue')?.value || ''
            ).trim() || null;
            picker.open({
                title: '🎁 เลือกของขวัญสำหรับ Events',
                selectedId,
                onSelect: (gift) => onAeGiftPicked(
                    String(gift.giftId),
                    gift.giftName || String(gift.giftId),
                    gift.icon || gift.giftIcon || gift.giftPictureUrl || ''
                )
            });
            return;
        }
        const overlay = document.getElementById('aeGiftPickerOverlay');
        if (overlay) overlay.style.display = 'flex';
        renderAeGiftPickerGrid('');
    }

    function closeAeGiftPickerModal() {
        const overlay = document.getElementById('aeGiftPickerOverlay');
        if (overlay) overlay.style.display = 'none';
        aeGiftPickerFor = null;
    }

    function searchAeGiftPicker(q) {
        renderAeGiftPickerGrid(q);
    }

    function renderAeGiftPickerGrid(query) {
        const grid = document.getElementById('aeGiftPickerGrid');
        if (!grid) return;
        const gifts = typeof popularGifts !== 'undefined' ? popularGifts : [];
        const q = String(query || '').trim().toLowerCase();
        const filtered = gifts.filter((g) => {
            if (!q) return true;
            const name = (g.name || g.giftName || '').toLowerCase();
            return name.includes(q) || String(g.giftId).includes(q);
        }).slice(0, 80);
        grid.innerHTML = filtered.map((g) => {
            const id = String(g.giftId);
            const name = escapeHtml(g.name || g.giftName || id);
            const iconUrl = proxyAeMediaUrl(g.icon || g.giftIcon || '');
            const icon = iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : aeIco('gift', 18);
            const cost = Number(g.cost || g.diamondCount) || 0;
            return `<button type="button" class="ae-gift-pick ae-keep-emoji" onclick="onAeGiftPicked('${escapeHtml(id)}','${name}')">${icon}<span>${name}</span><small class="ae-gift-pick-cost">${cost} 🪙</small></button>`;
        }).join('') || '<div class="ae-picker-empty">ไม่พบของขวัญ</div>';
    }

    function openAeStickerPickerForEvent() {
        aeStickerPickerFor = 'event';
        const overlay = document.getElementById('aeStickerPickerOverlay');
        if (overlay) overlay.style.display = 'flex';
        renderAeStickerPickerGrid('');
        if (window.ChannelEmotes?.load) {
            ChannelEmotes.load().then(() => renderAeStickerPickerGrid(document.getElementById('aeStickerPickerSearch')?.value || '')).catch(() => {});
        }
    }

    document.addEventListener('channel-emotes-updated', () => {
        const overlay = document.getElementById('aeStickerPickerOverlay');
        if (overlay && overlay.style.display !== 'none') {
            renderAeStickerPickerGrid(document.getElementById('aeStickerPickerSearch')?.value || '');
        }
        if (aeEventDraft.triggerType === 'sticker') updateAeEventStickerPreview();
        renderAeEventsList();
    });

    function closeAeStickerPickerModal() {
        const overlay = document.getElementById('aeStickerPickerOverlay');
        if (overlay) overlay.style.display = 'none';
        aeStickerPickerFor = null;
    }

    function searchAeStickerPicker(q) {
        renderAeStickerPickerGrid(q);
    }

    function renderAeStickerPickerGrid(query) {
        const grid = document.getElementById('aeStickerPickerGrid');
        if (!grid) return;
        const list = window.ChannelEmotes?.getList?.() || [];
        const q = String(query || '').trim().toLowerCase();
        const filtered = list.filter((e) => {
            if (!q) return true;
            return String(e.name || '').toLowerCase().includes(q)
                || String(e.id || '').includes(q)
                || String(e.type || '').toLowerCase().includes(q);
        });
        if (!filtered.length) {
            grid.innerHTML = `<div class="ae-picker-empty">${list.length ? 'ไม่พบสติกเกอร์ที่ค้นหา' : 'ยังไม่มีสติกเกอร์ช่องนี้ — รอผู้ชมส่งอิโมจิ/สติกเกอร์ในไลฟ์ หรือเชื่อม TikTok Live ก่อน'}</div>`;
            return;
        }
        grid.innerHTML = filtered.map((e) => {
            const id = escapeHtml(String(e.id || ''));
            const name = escapeHtml(e.name || id);
            const src = escapeHtml(proxyAeMediaUrl(e.displayUrl || e.imageUrl || ''));
            const img = src ? `<img src="${src}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '💖';
            const kind = e.type === 'sticker' ? 'สติกเกอร์' : 'อิโมจิ';
            return `<button type="button" class="ae-sticker-pick" onclick="onAeStickerPicked('${id}')">${img}<span>${name}</span><small>${kind}</small></button>`;
        }).join('');
    }

    function onAeStickerPicked(stickerId) {
        if (aeStickerPickerFor === 'event') {
            const valEl = document.getElementById('aeEventTriggerValue');
            if (valEl) valEl.value = stickerId;
            const info = resolveAeSticker(stickerId, '', '');
            aeEventDraft.triggerValue = String(stickerId);
            aeEventDraft.emoteName = info.name || '';
            aeEventDraft.emoteIcon = info.em?.imageUrl || info.em?.displayUrl || info.icon || '';
            updateAeEventStickerPreview();
        }
        closeAeStickerPickerModal();
    }

    function saveEventFromModal() {
        const nameEl = document.getElementById('aeEventName');
        const userEl = document.getElementById('aeEventUserFilter');
        const specificUserEl = document.getElementById('aeEventSpecificUsername');
        const typeEl = document.getElementById('aeEventTriggerType');
        const valEl = document.getElementById('aeEventTriggerValue');
        const id = decodeAeId(aeEditingEventId) || uid('ev');
        const prev = aePresetComposerMode
            ? aePresetDraft.events[id]
            : getAeStore().events[id];
        if (!aePresetComposerMode && !aeEditingEventId && !canAddEvent()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Events — แพ็กฟรีเพิ่มได้สูงสุด ${FREE_EVENTS_MAX} อีเวนต์`);
            }
            return;
        }
        const name = String(nameEl?.value || '').trim();
        const userFilter = userEl?.value || 'any';
        const specificUsername = normalizeTikTokUsername(specificUserEl?.value);
        if (!name) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'กรุณาตั้งชื่ออีเวนต์');
            nameEl?.focus();
            return;
        }
        if (userFilter === 'specific' && !specificUsername) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'กรุณาระบุ TikTok username');
            specificUserEl?.focus();
            return;
        }
        const actionMode = aeEventDraft.actionMode === 'random' ? 'random' : 'single';
        const actionIds = actionMode === 'single'
            ? (aeEventDraft.actionIds || []).slice(0, 1)
            : (aeEventDraft.actionIds || []);
        const nextEvent = {
            ...(prev || {}),
            ...aeEventDraft,
            id,
            name,
            userFilter,
            specificUsername: userFilter === 'specific' ? specificUsername : '',
            triggerType: typeEl?.value || 'gift',
            triggerValue: (valEl?.value || '').trim(),
            coinFireMode: aeEventDraft.coinFireMode || 'once',
            likeCountMode: aeEventDraft.likeCountMode || 'room',
            actionMode,
            actionIds,
            enabled: prev ? prev.enabled !== false : true
        };
        if (nextEvent.triggerType === 'sticker' && !nextEvent.triggerValue) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'กรุณาเลือกสติกเกอร์ประจำช่อง');
            return;
        }
        if (nextEvent.triggerType === 'gift' && !nextEvent.triggerValue) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'กรุณาเลือกของขวัญ');
            return;
        }
        if (nextEvent.triggerType === 'coins' && !nextEvent.triggerValue) nextEvent.triggerValue = '1';
        if (nextEvent.triggerType === 'totallikes' && !nextEvent.triggerValue) nextEvent.triggerValue = '100';
        if (nextEvent.triggerType === 'gift') {
            nextEvent.giftName = aeEventDraft.giftName || resolveAeGiftName(nextEvent.triggerValue, nextEvent.giftName);
            nextEvent.giftIcon = aeEventDraft.giftIcon || resolveAeGiftIcon(nextEvent.triggerValue, nextEvent.giftName, nextEvent.giftIcon);
            delete nextEvent.emoteIcon;
            delete nextEvent.emoteName;
        } else if (nextEvent.triggerType === 'sticker') {
            const info = resolveAeSticker(nextEvent.triggerValue, aeEventDraft.emoteIcon || nextEvent.emoteIcon, aeEventDraft.emoteName || nextEvent.emoteName);
            nextEvent.emoteName = info.name;
            nextEvent.emoteIcon = info.em?.imageUrl || info.icon || nextEvent.emoteIcon || '';
            delete nextEvent.giftIcon;
            delete nextEvent.giftName;
        } else {
            delete nextEvent.giftIcon;
            delete nextEvent.giftName;
            delete nextEvent.emoteIcon;
            delete nextEvent.emoteName;
        }
        if (!nextEvent.actionIds.length) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เลือกอย่างน้อย 1 แอคชั่น');
            return;
        }
        if (actionMode === 'random' && nextEvent.actionIds.length < 2) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'โหมดสุ่มต้องเลือกอย่างน้อย 2 แอคชั่น');
            return;
        }

        if (aePresetComposerMode) {
            aePresetDraft.events[id] = nextEvent;
            closeEventEditorModal();
            renderAePresetDraftPicks();
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'บันทึกอีเวนต์ลงพรีเซ็ตแล้ว', name);
            return;
        }

        const ae = getAeStore();
        ae.events[id] = nextEvent;
        saveActionsEventsToServer();
        closeEventEditorModal();
        renderAeEventsList();
        updateAeLimitUI();
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'บันทึกอีเวนต์แล้ว');
    }

    async function removeEvent(id) {
        id = decodeAeId(id);
        if (!(await tcConfirm('ลบอีเวนต์นี้?', { title: 'ลบอีเวนต์', icon: '🗑️', okLabel: 'ลบ' }))) return;
        const ae = getAeStore();
        delete ae.events[id];
        saveActionsEventsToServer();
        renderAeEventsList();
        updateAeLimitUI();
    }

    function toggleEventEnabled(id, enabled) {
        id = decodeAeId(id);
        const ev = getAeStore().events[id];
        if (!ev) return;
        if (enabled && ev.enabled === false && !canEnableEvent()) {
            if (typeof showProUpgradePrompt === 'function') {
                showProUpgradePrompt(`Events — แพ็กฟรีเปิดใช้ได้สูงสุด ${FREE_EVENTS_MAX} อีเวนต์`);
            }
            renderAeEventsList();
            return;
        }
        ev.enabled = !!enabled;
        saveActionsEventsToServer();
        renderAeEventsList();
        updateAeLimitUI();
    }

    // ---- Screens ----
    function copyAeScreenUrl(n) {
        const input = document.getElementById('aeScreenUrl-' + n);
        const url = input?.value || buildAeScreenUrl(n);
        copyAeUrl(url, `Screen ${n}`);
    }

    function updateScreenQueue(n, val) {
        const ae = getAeStore();
        const idx = n - 1;
        if (!ae.screens[idx]) ae.screens[idx] = { maxQueue: 5 };
        ae.screens[idx].maxQueue = Math.max(1, Math.min(20, parseInt(val, 10) || 5));
        saveActionsEventsToServer();
    }

    // ---- Timers ----
    function openTimerEditorModal(id) {
        aeEditingTimerId = id || null;
        const ae = getAeStore();
        const tm = id ? ae.timers[id] : null;
        aeTimerDraft = tm ? JSON.parse(JSON.stringify(tm)) : { intervalMinutes: 5, actionId: '', enabled: true };
        const title = document.getElementById('aeTimerModalTitle');
        if (title) title.textContent = id ? 'แก้ไข Timer' : 'สร้าง Timer ใหม่';
        const intEl = document.getElementById('aeTimerInterval');
        const actEl = document.getElementById('aeTimerActionSelect');
        if (intEl) intEl.value = aeTimerDraft.intervalMinutes || 5;
        if (actEl) {
            const actions = Object.values(ae.actions);
            actEl.innerHTML = '<option value="">เลือกแอคชั่น...</option>' +
                actions.map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === aeTimerDraft.actionId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
        }
        const overlay = document.getElementById('aeTimerEditorOverlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function closeTimerEditorModal() {
        const overlay = document.getElementById('aeTimerEditorOverlay');
        if (overlay) overlay.style.display = 'none';
        aeEditingTimerId = null;
    }

    function saveTimerFromModal() {
        const intEl = document.getElementById('aeTimerInterval');
        const actEl = document.getElementById('aeTimerActionSelect');
        const actionId = actEl?.value || '';
        if (!actionId) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เลือกแอคชั่น');
            return;
        }
        const ae = getAeStore();
        const id = aeEditingTimerId || uid('tm');
        ae.timers[id] = {
            id,
            enabled: true,
            intervalMinutes: Math.max(1, parseInt(intEl?.value, 10) || 5),
            actionId
        };
        saveActionsEventsToServer();
        closeTimerEditorModal();
        renderAeTimersList();
    }

    async function removeTimer(id) {
        if (!(await tcConfirm('ลบ Timer นี้?', { title: 'ลบ Timer', icon: '🗑️', okLabel: 'ลบ' }))) return;
        delete getAeStore().timers[id];
        saveActionsEventsToServer();
        renderAeTimersList();
    }

    function toggleTimerEnabled(id, enabled) {
        const tm = getAeStore().timers[id];
        if (!tm) return;
        tm.enabled = !!enabled;
        saveActionsEventsToServer();
        renderAeTimersList();
    }

    function startAeTimerLoop() {
        if (aeTimerTick) clearInterval(aeTimerTick);
        aeTimerTick = setInterval(() => {
            const ae = getAeStore();
            if (!ae.enabled) return;
            if (typeof currentUser !== 'undefined' && currentUser && !currentUser.isLive) return;
            const now = Date.now();
            Object.values(ae.timers).forEach((tm) => {
                if (!tm || tm.enabled === false || !tm.actionId) return;
                const ms = (tm.intervalMinutes || 5) * 60 * 1000;
                const last = aeTimerLastFire[tm.id] || 0;
                if (now - last >= ms) {
                    aeTimerLastFire[tm.id] = now;
                    playAction(tm.actionId, { timer: true });
                }
            });
        }, 30000);
    }

    function resetAeLikeCursors() {
        aeLikeCursors = {};
    }

    // ---- Simulator ----
    function simulateAeEvent(type) {
        const handlers = {
            follow: () => handleActionsEventsForEvent('follow', 1, { uniqueId: 'test_user' }),
            share: () => handleActionsEventsForEvent('share', 1, { uniqueId: 'test_user' }),
            like: () => handleActionsEventsForEvent('like', 15, { uniqueId: 'test_user' }),
            join: () => handleActionsEventsForEvent('join', 1, { uniqueId: 'test_user' })
        };
        if (handlers[type]) handlers[type]();
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'จำลองอีเวนต์', type);
    }

    function simulateAeGift() {
        const sel = document.getElementById('aeSimGiftSelect');
        const giftId = sel?.value;
        if (!giftId) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'เลือกของขวัญก่อน');
            return;
        }
        const g = (typeof popularGifts !== 'undefined' ? popularGifts : []).find((x) => String(x.giftId) === giftId);
        handleActionsEventsForGift({
            giftId,
            giftName: g?.name || g?.giftName || giftId,
            repeatCount: 1,
            diamondCount: g?.diamondCount || 1,
            uniqueId: 'test_user',
            nickname: 'Test User'
        });
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'จำลองของขวัญ', g?.name || giftId);
    }

    // Expose globals for inline handlers
    window.ensureActionsEventsStore = ensureActionsEventsStore;
    window.initActionsEventsUI = initActionsEventsUI;
    window.refreshActionsEventsAfterCatalog = refreshActionsEventsAfterCatalog;
    window.switchAeTopTab = switchAeTopTab;
    window.filterAeList = filterAeList;
    window.updateActionsEventsSetting = updateActionsEventsSetting;
    window.updateAeLimitUI = updateAeLimitUI;
    window.refreshAePresetsGallery = refreshAePresetsGallery;
    window.openAePresetPublishModal = openAePresetPublishModal;
    window.editAePreset = editAePreset;
    window.closeAePresetPublishModal = closeAePresetPublishModal;
    window.onAePresetCoverPicked = onAePresetCoverPicked;
    window.publishAePreset = publishAePreset;
    window.applyAePreset = applyAePreset;
    window.deleteAePreset = deleteAePreset;
    window.aePresetToggleItem = aePresetToggleItem;
    window.aePresetRenameItem = aePresetRenameItem;
    window.aePresetToggleAll = aePresetToggleAll;
    window.aePresetCreateAction = aePresetCreateAction;
    window.aePresetEditAction = aePresetEditAction;
    window.aePresetCreateEvent = aePresetCreateEvent;
    window.aePresetEditEvent = aePresetEditEvent;
    window.aePresetRemoveItem = aePresetRemoveItem;
    window.aePresetImportFromLive = aePresetImportFromLive;
    window.openActionEditorModal = openActionEditorModal;
    window.closeActionEditorModal = closeActionEditorModal;
    window.saveActionFromModal = saveActionFromModal;
    window.removeAction = removeAction;
    window.duplicateAction = duplicateAction;
    window.toggleActionEnabled = toggleActionEnabled;
    window.testAction = testAction;
    window.stopActionTests = stopActionTests;
    window.toggleAeActionMedia = toggleAeActionMedia;
    window.handleAeActionFileUpload = handleAeActionFileUpload;
    window.pickSoundboardForAction = pickSoundboardForAction;
    window.pickMyInstantsForAction = pickMyInstantsForAction;
    window.applyAeMyInstantsPick = applyAeMyInstantsPick;
    window.onAeTtsTextInput = onAeTtsTextInput;
    window.openAeKeystrokeModal = openAeKeystrokeModal;
    window.closeAeKeystrokeModal = closeAeKeystrokeModal;
    window.aeKsInsertToken = aeKsInsertToken;
    window.aeKsInsertInto = aeKsInsertInto;
    window.saveAeKeystrokeFromModal = saveAeKeystrokeFromModal;
    window.testAeKeystrokeFromModal = testAeKeystrokeFromModal;
    window.selectAeScreen = selectAeScreen;
    window.syncAePointsMode = syncAePointsMode;
    window.copyAeActionScreenUrl = copyAeActionScreenUrl;
    window.openEventEditorModal = openEventEditorModal;
    window.closeEventEditorModal = closeEventEditorModal;
    window.saveEventFromModal = saveEventFromModal;
    window.removeEvent = removeEvent;
    window.toggleEventEnabled = toggleEventEnabled;
    window.onAeEventTriggerTypeChange = onAeEventTriggerTypeChange;
    window.selectAeEventUser = selectAeEventUser;
    window.selectAeEventTrigger = selectAeEventTrigger;
    window.selectAeEventActionMode = selectAeEventActionMode;
    window.selectAeCoinFireMode = selectAeCoinFireMode;
    window.selectAeLikeCountMode = selectAeLikeCountMode;
    window.toggleAeEventActionPick = toggleAeEventActionPick;
    window.openAeGiftPickerForEvent = openAeGiftPickerForEvent;
    window.openAeStickerPickerForEvent = openAeStickerPickerForEvent;
    window.closeAeStickerPickerModal = closeAeStickerPickerModal;
    window.searchAeStickerPicker = searchAeStickerPicker;
    window.onAeStickerPicked = onAeStickerPicked;
    window.closeAeGiftPickerModal = closeAeGiftPickerModal;
    window.searchAeGiftPicker = searchAeGiftPicker;
    window.onAeGiftPicked = onAeGiftPicked;
    window.copyAeScreenUrl = copyAeScreenUrl;
    window.updateScreenQueue = updateScreenQueue;
    window.openTimerEditorModal = openTimerEditorModal;
    window.closeTimerEditorModal = closeTimerEditorModal;
    window.saveTimerFromModal = saveTimerFromModal;
    window.removeTimer = removeTimer;
    window.toggleTimerEnabled = toggleTimerEnabled;
    window.simulateAeEvent = simulateAeEvent;
    window.simulateAeGift = simulateAeGift;
    window.handleActionsEventsForGift = handleActionsEventsForGift;
    window.handleActionsEventsForEvent = handleActionsEventsForEvent;
    window.handleActionsEventsForChat = handleActionsEventsForChat;
    window.handleActionsEventsForEmote = handleActionsEventsForEmote;
    window.resetAeLikeCursors = resetAeLikeCursors;
})();
