/**
 * Dance Club — Panel-side Game Center integration + TikTok gift triggers
 */
(function (global) {
    'use strict';

    const DC_STORAGE_KEY = 'tokcontrol_dance_club';

    const DC_EFFECTS = {
        stage: { icon: '🕺', label: 'ลงสนาม', giftEmoji: '🎤' },
        float_camera: { icon: '🎥', label: 'ลอยตัว + กล้องจับ', giftEmoji: '🌹' },
        float: { icon: '🎈', label: 'ลอยตัว', giftEmoji: '💫' },
        front_row: { icon: '⬆️', label: 'แถวหน้า', giftEmoji: '💎' },
        dj_booth: { icon: '🎧', label: 'ขึ้นแท่น DJ', giftEmoji: '🎧' },
        solo: { icon: '⭐', label: 'โชว์เดี่ยว', giftEmoji: '🦁' },
        formation: { icon: '💫', label: 'แปรแถว', giftEmoji: '🌌' },
        wallpaper: { icon: '🖼️', label: 'แจกวาร์ป', giftEmoji: '🖼️' },
        zipline: { icon: '🪂', label: 'โหนสลิง', giftEmoji: '🪂' },
        spin: { icon: '🌀', label: 'หมุนตัว', giftEmoji: '🌀' },
        cannon: { icon: '🚀', label: 'ยิงขึ้นฟ้า', giftEmoji: '🚀' },
        fire: { icon: '🔥', label: 'เอฟเฟคไฟ', giftEmoji: '🔥' },
        snow: { icon: '❄️', label: 'หิมะตก', giftEmoji: '❄️' },
        runway: { icon: '👠', label: 'รันเวย์', giftEmoji: '👠' }
    };

    const GIFT_EMOJI = {
        rose: '🌹', tiktok: '🎵', perfume: '💐', lion: '🦁', universe: '🌌',
        galaxy: '🌌', heart: '❤️', finger: '👆', gg: '👏', ice: '🧊'
    };

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function giftEmojiFor(name) {
        const key = String(name || '').toLowerCase().trim();
        if (!key) return '🎁';
        for (const [k, em] of Object.entries(GIFT_EMOJI)) {
            if (key.includes(k)) return em;
        }
        return '🎁';
    }

    function getDcDefaultConfig() {
        return {
            enabled: false,
            fireworkOnAll: true,
            say: {
                enabled: true,
                prefix: '!ds',
                requireGift: true,
                giftId: '5655',
                giftName: 'Rose',
                giftIcon: '',
                duration: 10,
                maxLen: 48,
                cooldownSec: 8,
                chargesPerGift: 1
            },
            triggers: [
                { id: 1, enabled: true, type: 'gift', giftName: 'Rose', giftId: '5655', effect: 'float_camera', duration: 0, firework: true },
                { id: 2, enabled: true, type: 'gift', giftName: 'TikTok', giftId: '', effect: 'stage', duration: 0, firework: true },
                { id: 3, enabled: true, type: 'gift', giftName: 'Perfume', giftId: '', effect: 'front_row', duration: 6, firework: true },
                { id: 12, enabled: true, type: 'gift', giftName: 'Headphones', giftId: '', effect: 'dj_booth', duration: 10, firework: true },
                { id: 4, enabled: true, type: 'gift', giftName: 'Lion', giftId: '', effect: 'solo', duration: 10, firework: true },
                { id: 5, enabled: true, type: 'gift', giftName: 'Universe', giftId: '', effect: 'formation', duration: 12, firework: true },
                { id: 6, enabled: true, type: 'gift', giftName: 'Galaxy', giftId: '', effect: 'wallpaper', duration: 14, firework: true },
                { id: 7, enabled: true, type: 'gift', giftName: 'Dove', giftId: '', effect: 'zipline', duration: 8, firework: true },
                { id: 8, enabled: true, type: 'gift', giftName: 'Cap', giftId: '', effect: 'runway', duration: 14, firework: true },
                { id: 9, enabled: true, type: 'gift', giftName: 'GG', giftId: '', effect: 'fire', duration: 10, firework: true },
                { id: 10, enabled: true, type: 'gift', giftName: 'Ice Cream Cone', giftId: '', effect: 'snow', duration: 12, firework: true },
                { id: 11, enabled: true, type: 'follow', giftName: '', giftId: '', effect: 'stage', duration: 0, firework: true, cooldownSec: 0 }
            ]
        };
    }

    function normalizeDcTrigger(tr) {
        if (!tr || typeof tr !== 'object') return null;
        const type = tr.type === 'follow' ? 'follow' : 'gift';
        return {
            ...tr,
            type,
            enabled: tr.enabled !== false,
            firework: tr.firework !== false,
            duration: Math.max(0, Number(tr.duration) || 0),
            cooldownSec: Math.max(0, Math.min(3600, Number(tr.cooldownSec) || 0)),
            effect: tr.effect || (type === 'follow' ? 'stage' : 'float_camera'),
            giftName: tr.giftName || '',
            giftId: tr.giftId || '',
            giftIcon: tr.giftIcon || ''
        };
    }

    function ensureSayConfig(cfg) {
        const def = getDcDefaultConfig().say;
        if (!cfg.say || typeof cfg.say !== 'object') cfg.say = { ...def };
        else cfg.say = { ...def, ...cfg.say };
        return cfg.say;
    }

    const DC_TRIGGER_SCHEMA = 2;

    function mergeDefaultTriggersOnce(parsed) {
        if (!Array.isArray(parsed.triggers)) {
            parsed.triggers = getDcDefaultConfig().triggers.map((t) => ({ ...t }));
            parsed.triggerSchema = DC_TRIGGER_SCHEMA;
            return;
        }
        // User intentionally cleared the list — do not resurrect defaults
        if (!parsed.triggers.length) return;

        const schema = Number(parsed.triggerSchema) || 0;
        if (schema >= DC_TRIGGER_SCHEMA) return;

        const have = new Set(parsed.triggers.map((t) => `${t.type || 'gift'}:${t.effect}`));
        getDcDefaultConfig().triggers.forEach((d) => {
            const key = `${d.type || 'gift'}:${d.effect}`;
            if (!have.has(key)) {
                parsed.triggers.push({ ...d, id: Date.now() + Math.floor(Math.random() * 1000) });
            }
        });
        parsed.triggerSchema = DC_TRIGGER_SCHEMA;
    }

    function getDcConfig() {
        try {
            const raw = localStorage.getItem(DC_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const schemaBefore = Number(parsed.triggerSchema) || 0;
                mergeDefaultTriggersOnce(parsed);
                if ((Number(parsed.triggerSchema) || 0) !== schemaBefore) {
                    saveDcConfig(parsed);
                }
                // Migrate Rose → always use real TikTok id 5655
                (parsed.triggers || []).forEach((tr, i) => {
                    const n = normalizeDcTrigger(tr);
                    if (n) parsed.triggers[i] = n;
                    const name = String(parsed.triggers[i].giftName || '').toLowerCase();
                    if (
                        parsed.triggers[i].type === 'gift'
                        && (name === 'rose' || name.includes('กุหลาบ') || name === 'rosa')
                        && String(parsed.triggers[i].giftId || '') !== '5655'
                    ) {
                        parsed.triggers[i].giftId = '5655';
                    }
                });
                ensureSayConfig(parsed);
                return parsed;
            }
        } catch (e) {}
        return getDcDefaultConfig();
    }

    function saveDcConfig(cfg) {
        localStorage.setItem(DC_STORAGE_KEY, JSON.stringify(cfg));
    }

    function dcOpenGame() {
        try {
            const { ipcRenderer } = (window.electron || {});
            ipcRenderer.send('open-dance-club-game');
            return;
        } catch (e) {}
        window.open('/games/dance-club/index.html', 'dc-view', 'width=1100,height=720');
    }

    function dcOpenControl() {
        switchDcStagePanel(window.__dcStagePanel || 'music');
    }

    function dcOpenBoth() {
        dcOpenGame();
    }

    function dcCopyOverlayLink() {
        if (typeof copyOverlayRouteLink === 'function') {
            copyOverlayRouteLink('dance-club', {}, 'Dance Club Overlay');
        }
    }

    function dcToggleEnabled(checked) {
        if (typeof setGameLiveActive === 'function') {
            setGameLiveActive('dance-club', !!checked);
            return;
        }
        const cfg = getDcConfig();
        cfg.enabled = !!checked;
        saveDcConfig(cfg);
        if (checked && typeof setActiveGameModId === 'function') {
            setActiveGameModId('dance-club');
        }
    }

    function dcSetFireworkOnAll(checked) {
        const cfg = getDcConfig();
        cfg.fireworkOnAll = !!checked;
        saveDcConfig(cfg);
    }

    function broadcastDcGift(gift, rule) {
        const payload = { type: 'tiktok_gift', gift, rule, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
        try {
            localStorage.setItem('tokcontrol_dc_gift_bus', JSON.stringify(payload));
        } catch (e) {}
    }

    function broadcastDcSay(say) {
        const payload = { type: 'dance_say', say, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
        try {
            localStorage.setItem('tokcontrol_dc_gift_bus', JSON.stringify(payload));
        } catch (e) {}
    }

    function compactBeatMapForBus(beatMap) {
        if (!beatMap?.beats?.length) return beatMap;
        const beats = beatMap.beats;
        if (beats.length <= 300) return beatMap;
        const cap = 300;
        const out = [];
        for (let i = 0; i < cap; i++) {
            out.push(beats[Math.floor(i * (beats.length - 1) / (cap - 1))]);
        }
        return { ...beatMap, beats: out };
    }

    function broadcastDcSpotify(track) {
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
            progressMs: track?.progressMs || 0,
            durationMs: track?.durationMs || 0,
            playing: track?.playing
        };
        const payload = { type: 'spotify_now_playing', track: slim, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
        try {
            localStorage.setItem('tokcontrol_dc_gift_bus', JSON.stringify(payload));
        } catch (e) {}
    }

    function broadcastDcSpotifyBeatMap(data) {
        const slim = { ...data };
        if (slim.beatMap) slim.beatMap = compactBeatMapForBus(slim.beatMap);
        const payload = { type: 'spotify_beat_map', ...slim, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
    }

    function broadcastDcSpotifyQueue(queue, owner = 'songrequest') {
        const payload = { type: 'spotify_queue_sync', queue: queue || [], owner, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
        try {
            localStorage.setItem('tokcontrol_dc_sp_queue', JSON.stringify(queue || []));
            localStorage.setItem('tokcontrol_sr_queue_owner', owner);
        } catch (e) {}
    }

    function broadcastDcSpotifyProgress(progressMs, playing = true) {
        const payload = { type: 'spotify_progress', progressMs: progressMs || 0, playing: !!playing, t: Date.now() };
        try {
            const bc = new BroadcastChannel('tokcontrol-dance-club-gift-v1');
            bc.postMessage(payload);
            bc.close();
        } catch (e) {}
    }

    function syncSpotifyToDanceClub(track) {
        if (!track?.id) return;
        broadcastDcSpotify(track);
        if (track.beatMap?.beats?.length) {
            setTimeout(() => {
                broadcastDcSpotifyBeatMap({
                    id: track.id,
                    bpm: track.bpm,
                    beatMap: track.beatMap,
                    progressMs: track.progressMs || 0
                });
            }, 350);
        }
    }

    /** uniqueId → remaining say charges */
    const sayCharges = new Map();
    const sayCooldownUntil = new Map();

    function sayViewerKey(identity) {
        return String(identity?.uniqueId || identity?.userId || identity?.nickname || '')
            .trim()
            .toLowerCase();
    }

    function giftMatchesSayUnlock(say, gift) {
        if (!say.requireGift) return true;
        const hasId = say.giftId && String(say.giftId) === String(gift.giftId || '');
        if (hasId) return true;
        if (say.giftId) return false; // id configured but mismatch — do not fall back to loose name
        const gName = String(gift.giftName || '').toLowerCase().trim();
        const tName = String(say.giftName || '').toLowerCase().trim();
        if (!tName) return !say.giftId;
        return gName === tName;
    }

    function grantSayCharges(gift) {
        const cfg = getDcConfig();
        if (!cfg.enabled) return;
        const say = ensureSayConfig(cfg);
        if (!say.enabled || !say.requireGift) return;
        if (!giftMatchesSayUnlock(say, gift)) return;

        const key = sayViewerKey(gift);
        if (!key) return;
        const add = Math.max(1, Number(say.chargesPerGift) || 1) * Math.max(1, Number(gift.repeatCount) || 1);
        const prev = sayCharges.get(key) || 0;
        sayCharges.set(key, prev + add);

        if (typeof logToDashboard === 'function') {
            logToDashboard(
                `💬 Dance Say: @${gift.nickname || gift.uniqueId} ได้สิทธิ์พิมพ์ ${say.prefix || '!ds'} (เหลือ ${prev + add} ครั้ง)`,
                '#ff2d95'
            );
        }
    }

    function giftMatchesTrigger(tr, gift) {
        if (!tr || !gift) return false;
        if (typeof GiftEventGuard !== 'undefined' && GiftEventGuard.giftsStrictMatch) {
            return GiftEventGuard.giftsStrictMatch(tr, gift);
        }
        const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId || '');
        if (matchId) return true;
        if (tr.giftId) return false;
        const gName = String(gift.giftName || '').toLowerCase().trim();
        const tName = String(tr.giftName || '').toLowerCase().trim();
        return !!(tName && gName && gName === tName);
    }

    function handleDcGift(gift) {
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('dance-club').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('dance-club')) return false;
        const cfg = getDcConfig();
        if (!cfg.enabled) return false;

        grantSayCharges(gift);

        let matched = false;
        for (const tr of (cfg.triggers || [])) {
            if (tr.enabled === false) continue;
            if ((tr.type || 'gift') !== 'gift') continue;
            if (!giftMatchesTrigger(tr, gift)) continue;

            const rule = {
                effect: tr.effect || 'float_camera',
                duration: tr.duration || 0,
                firework: tr.firework !== false
            };
            broadcastDcGift(gift, rule);
            matched = true;

            if (typeof logToDashboard === 'function') {
                const fx = DC_EFFECTS[rule.effect] || { label: rule.effect, icon: '🎁' };
                logToDashboard(`🕺 Dance Club: @${gift.nickname || gift.uniqueId} → ${fx.icon} ${fx.label}`, '#bc13fe');
            }
        }

        if (!matched && cfg.fireworkOnAll) {
            broadcastDcGift(gift, { effect: null, firework: true });
        }

        return matched;
    }

    const dcFollowCooldownUntil = new Map();

    function handleDcFollow(user) {
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('dance-club')) return false;
        if (typeof canPlayGame === 'function') {
            if (!canPlayGame('dance-club').ok) return false;
        } else if (typeof isAppPro === 'function' && !isAppPro()) {
            return false;
        }
        const cfg = getDcConfig();
        if (!cfg.enabled) return false;

        const uid = String(user?.uniqueId || user?.userId || user?.nickname || '')
            .trim()
            .toLowerCase();
        const now = Date.now();
        let matched = false;

        for (const raw of (cfg.triggers || [])) {
            const tr = normalizeDcTrigger(raw);
            if (!tr || tr.enabled === false) continue;
            if (tr.type !== 'follow') continue;

            if (uid && tr.cooldownSec > 0) {
                const cdKey = `${tr.id}:${uid}`;
                const until = dcFollowCooldownUntil.get(cdKey) || 0;
                if (now < until) continue;
                dcFollowCooldownUntil.set(cdKey, now + tr.cooldownSec * 1000);
            }

            const rule = {
                effect: tr.effect || 'stage',
                duration: tr.duration || 0,
                firework: tr.firework !== false
            };
            const payload = {
                giftName: 'Follow',
                giftId: 'follow',
                nickname: user?.nickname || user?.uniqueId || 'Follower',
                uniqueId: user?.uniqueId || user?.userId || '',
                avatar: user?.avatar || user?.profilePictureUrl || '',
                diamondCount: 0,
                totalCoins: 0,
                isFollow: true
            };
            broadcastDcGift(payload, rule);
            matched = true;

            if (typeof logToDashboard === 'function') {
                const fx = DC_EFFECTS[rule.effect] || { label: rule.effect, icon: '👤' };
                logToDashboard(
                    `🕺 Dance Club: @${payload.nickname} ติดตาม → ${fx.icon} ${fx.label}`,
                    '#00d2ff'
                );
            }
        }

        return matched;
    }

    /**
     * Chat command: !ds สวัสดีค้าบ
     * Requires prior gift unlock when say.requireGift is on.
     */
    function handleDcChat(chat) {
        if (typeof isGameLiveActive === 'function' && !isGameLiveActive('dance-club')) return false;
        const cfg = getDcConfig();
        if (!cfg.enabled) return false;
        const say = ensureSayConfig(cfg);
        if (!say.enabled) return false;

        const comment = String(chat?.comment || '').trim();
        if (!comment) return false;

        const prefix = String(say.prefix || '!ds').trim();
        const lower = comment.toLowerCase();
        const prefLower = prefix.toLowerCase();
        if (!lower.startsWith(prefLower)) return false;

        let text = comment.slice(prefix.length).trim();
        // allow "!ds: hello" or "!ds=hello"
        if (/^[=:]/.test(text)) text = text.slice(1).trim();
        if (!text) {
            if (typeof logToDashboard === 'function') {
                logToDashboard(`💬 Dance Say: @${chat.nickname || chat.uniqueId} พิมพ์ ${prefix} แต่ไม่มีข้อความ`, '#888');
            }
            return true;
        }

        const maxLen = Math.max(4, Math.min(80, Number(say.maxLen) || 48));
        text = text.slice(0, maxLen);

        const key = sayViewerKey(chat);
        const now = Date.now();
        const cdUntil = sayCooldownUntil.get(key) || 0;
        if (now < cdUntil) {
            if (typeof logToDashboard === 'function') {
                logToDashboard(`💬 Dance Say: @${chat.nickname || chat.uniqueId} ติดคูลดาวน์`, '#888');
            }
            return true;
        }

        if (say.requireGift) {
            const charges = sayCharges.get(key) || 0;
            if (charges <= 0) {
                const need = say.giftName || 'ของขวัญที่กำหนด';
                if (typeof logToDashboard === 'function') {
                    logToDashboard(
                        `💬 Dance Say: @${chat.nickname || chat.uniqueId} ต้องส่ง ${need} ก่อน ถึงจะใช้ ${prefix} ได้`,
                        '#ff6b81'
                    );
                }
                return true;
            }
            sayCharges.set(key, charges - 1);
        }

        const cooldown = Math.max(0, Number(say.cooldownSec) || 0);
        if (cooldown > 0) sayCooldownUntil.set(key, now + cooldown * 1000);

        broadcastDcSay({
            text,
            nickname: chat.nickname || chat.uniqueId || 'Viewer',
            uniqueId: chat.uniqueId || '',
            avatar: chat.avatar || chat.profilePictureUrl || '',
            duration: Number(say.duration) || 10,
            accent: '#ff2d95'
        });

        if (typeof logToDashboard === 'function') {
            logToDashboard(`💬 Dance Say บนจอ: @${chat.nickname || chat.uniqueId} → “${text}”`, '#ff2d95');
        }
        return true;
    }

    function dcSaveSaySettingsFromUi() {
        const cfg = getDcConfig();
        const say = ensureSayConfig(cfg);
        const en = document.getElementById('dcSayEnabled');
        const req = document.getElementById('dcSayRequireGift');
        const prefix = document.getElementById('dcSayPrefix');
        const giftName = document.getElementById('dcSayGiftName');
        const giftId = document.getElementById('dcSayGiftId');
        const duration = document.getElementById('dcSayDuration');
        const maxLen = document.getElementById('dcSayMaxLen');
        const cooldown = document.getElementById('dcSayCooldown');
        const charges = document.getElementById('dcSayCharges');
        if (en) say.enabled = !!en.checked;
        if (req) say.requireGift = !!req.checked;
        if (prefix) say.prefix = String(prefix.value || '!ds').trim() || '!ds';
        if (giftName) say.giftName = String(giftName.value || '').trim();
        if (giftId) say.giftId = String(giftId.value || '').trim();
        if (duration) say.duration = Math.max(3, Math.min(60, Number(duration.value) || 10));
        if (maxLen) say.maxLen = Math.max(4, Math.min(80, Number(maxLen.value) || 48));
        if (cooldown) say.cooldownSec = Math.max(0, Math.min(120, Number(cooldown.value) || 0));
        if (charges) say.chargesPerGift = Math.max(1, Math.min(20, Number(charges.value) || 1));
        saveDcConfig(cfg);
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'บันทึกแล้ว', 'ตั้งค่า Dance Say อัปเดตแล้ว');
        }
    }

    function dcTestSay() {
        const cfg = getDcConfig();
        const say = ensureSayConfig(cfg);
        const input = document.getElementById('dcSayTestText');
        const text = (input && input.value.trim()) || 'สวัสดีค้าบบบบบบ';
        broadcastDcSay({
            text: text.slice(0, say.maxLen || 48),
            nickname: 'ทดสอบ',
            uniqueId: 'test_host',
            duration: say.duration || 10,
            accent: '#bc13fe'
        });
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('info', 'ทดสอบ Dance Say', text);
        }
    }

    let dcSayGiftPickMode = false;

    function dcOpenSayGiftPicker() {
        dcSayGiftPickMode = true;
        dcOpenGiftPicker('__say__');
    }

    function dcAddTrigger(type = 'gift') {
        const cfg = getDcConfig();
        if (!cfg.triggers) cfg.triggers = [];
        const isFollow = type === 'follow';
        cfg.triggers.push({
            id: Date.now(),
            enabled: true,
            type: isFollow ? 'follow' : 'gift',
            giftName: isFollow ? '' : '',
            giftId: '',
            effect: isFollow ? 'stage' : 'float_camera',
            duration: isFollow ? 0 : 6,
            firework: true,
            cooldownSec: 0
        });
        saveDcConfig(cfg);
        renderDcTriggers();
    }

    function dcRemoveTrigger(id) {
        const cfg = getDcConfig();
        const numId = Number(id);
        cfg.triggers = (cfg.triggers || []).filter((t) => Number(t.id) !== numId);
        saveDcConfig(cfg);
        renderDcTriggers();
    }

    function dcTriggerIdFrom(el) {
        const card = el?.closest?.('.dc-trigger-card');
        if (!card?.dataset?.id) return 0;
        return Number(card.dataset.id);
    }

    function dcUpdateTrigger(id, key, val) {
        const cfg = getDcConfig();
        const tr = (cfg.triggers || []).find((t) => Number(t.id) === Number(id));
        if (tr) {
            tr[key] = val;
            saveDcConfig(cfg);
            if (key === 'effect' || key === 'type') renderDcTriggers();
            else if (key === 'enabled') {
                const card = document.querySelector(`.dc-trigger-card[data-id="${id}"]`);
                if (card) card.classList.toggle('is-off', !val);
                const btn = card?.querySelector('.dc-trigger-enable');
                if (btn) btn.classList.toggle('on', !!val);
            } else if (key === 'giftName') {
                const icon = document.querySelector(`.dc-trigger-card[data-id="${id}"] .dc-trigger-gift-icon`);
                if (icon && !icon.querySelector('img')) icon.textContent = giftEmojiFor(val);
            }
        }
    }

    function dcSelectEffect(id, effect) {
        if (!effect || !DC_EFFECTS[effect]) return;
        dcUpdateTrigger(id, 'effect', effect);
        // Instant visual feedback without waiting for full re-render
        document.querySelectorAll(`.dc-trigger-card[data-id="${id}"] .dc-effect-pill`).forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.effect === effect);
        });
    }

    function dcToggleTriggerEnabled(id) {
        const cfg = getDcConfig();
        const tr = (cfg.triggers || []).find((t) => Number(t.id) === Number(id));
        if (tr) dcUpdateTrigger(id, 'enabled', !tr.enabled);
    }

    let testSeq = 0;
    let dcGiftPickTriggerId = null;
    let dcGiftCatalog = [];
    let dcGiftCatalogLoaded = false;
    let dcListBound = false;

    function ensureDcGiftModal() {
        if (document.getElementById('dcGiftPickerModal')) return;
        const modal = document.createElement('div');
        modal.id = 'dcGiftPickerModal';
        modal.className = 'dc-gift-modal';
        modal.innerHTML = `
            <div class="dc-gift-modal-panel" role="dialog" aria-label="เลือกของขวัญ">
                <div class="dc-gift-modal-head">
                    <h4>🎁 เลือกของขวัญ TikTok</h4>
                    <button type="button" class="dc-gift-modal-close" aria-label="ปิด">✕</button>
                </div>
                <input type="search" class="dc-gift-modal-search" placeholder="ค้นหาชื่อหรือราคาเหรียญ...">
                <div class="dc-gift-modal-grid"></div>
            </div>`;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) dcCloseGiftPicker();
        });
        modal.querySelector('.dc-gift-modal-close').addEventListener('click', dcCloseGiftPicker);
        modal.querySelector('.dc-gift-modal-search').addEventListener('input', (e) => {
            dcRenderGiftPicker(e.target.value);
        });
        modal.addEventListener('click', (e) => {
            const giftItem = e.target.closest('.dc-gift-pick-item');
            if (giftItem) {
                const img = giftItem.querySelector('img');
                dcPickGift(
                    giftItem.dataset.giftId,
                    giftItem.dataset.giftName,
                    img ? img.src : ''
                );
            }
        });
        document.body.appendChild(modal);
    }

    async function dcLoadGiftCatalog() {
        if (dcGiftCatalogLoaded && dcGiftCatalog.length) return dcGiftCatalog;
        if (global.popularGifts && global.popularGifts.length) {
            dcGiftCatalog = global.popularGifts.map((g) => ({
                giftId: g.giftId,
                giftName: g.giftName,
                cost: g.cost,
                icon: g.icon || ''
            }));
            dcGiftCatalogLoaded = true;
            return dcGiftCatalog;
        }
        try {
            const res = await fetch('/api/gifts');
            const data = await res.json();
            if (res.ok && data.list) {
                dcGiftCatalog = data.list.map((g) => ({
                    giftId: g.giftId,
                    giftName: g.giftName,
                    cost: g.diamondCount,
                    icon: g.giftIcon || ''
                }));
                dcGiftCatalogLoaded = true;
            }
        } catch (e) { /* ignore */ }
        return dcGiftCatalog;
    }

    function dcRenderGiftPicker(query = '') {
        const grid = document.querySelector('#dcGiftPickerModal .dc-gift-modal-grid');
        if (!grid) return;
        const q = String(query || '').trim().toLowerCase();
        const list = dcGiftCatalog.filter((g) => {
            if (!q) return true;
            return g.giftName.toLowerCase().includes(q) || String(g.cost).includes(q);
        }).slice(0, 60);

        if (!list.length) {
            grid.innerHTML = '<div class="dc-gift-modal-empty">ไม่พบของขวัญ — ลองพิมพ์ชื่ออื่น หรือพิมพ์เองในช่องข้อความ</div>';
            return;
        }

        grid.innerHTML = list.map((g) => {
            const isUrl = g.icon && (g.icon.startsWith('http') || g.icon.startsWith('data:'));
            const icon = isUrl
                ? `<img src="${esc(g.icon)}" alt="" onerror="this.style.display='none'">`
                : `<span>${esc(g.icon || '🎁')}</span>`;
            return `<button type="button" class="dc-gift-pick-item" data-gift-id="${esc(g.giftId)}" data-gift-name="${esc(g.giftName)}">
                ${icon}
                <span class="nm">${esc(g.giftName)}</span>
                <span class="cost">${g.cost} 🪙</span>
            </button>`;
        }).join('');
    }

    async function dcOpenGiftPicker(triggerId) {
        dcGiftPickTriggerId = triggerId;
        if (global.GiftPicker) {
            GiftPicker.open({
                title: '🎁 เลือกของขวัญ Dance Club',
                onSelect: (gift) => dcPickGift(gift.giftId, gift.giftName, gift.icon)
            });
            return;
        }
        ensureDcGiftModal();
        const modal = document.getElementById('dcGiftPickerModal');
        const search = modal.querySelector('.dc-gift-modal-search');
        if (search) search.value = '';
        modal.style.display = 'flex';
        const grid = modal.querySelector('.dc-gift-modal-grid');
        if (grid) grid.innerHTML = '<div class="dc-gift-modal-empty">⏳ กำลังโหลดของขวัญ...</div>';
        await dcLoadGiftCatalog();
        dcRenderGiftPicker();
    }

    function dcCloseGiftPicker() {
        const modal = document.getElementById('dcGiftPickerModal');
        if (modal) modal.style.display = 'none';
        dcGiftPickTriggerId = null;
        dcSayGiftPickMode = false;
    }

    function dcPickGift(giftId, giftName, icon) {
        if (dcSayGiftPickMode || dcGiftPickTriggerId === '__say__') {
            const cfg = getDcConfig();
            const say = ensureSayConfig(cfg);
            say.giftId = giftId || '';
            say.giftName = giftName || '';
            say.giftIcon = icon || '';
            saveDcConfig(cfg);
            const nameEl = document.getElementById('dcSayGiftName');
            const idEl = document.getElementById('dcSayGiftId');
            const iconEl = document.getElementById('dcSayGiftIcon');
            if (nameEl) nameEl.value = giftName || '';
            if (idEl) idEl.value = giftId || '';
            if (iconEl) {
                if (icon && (icon.startsWith('http') || icon.startsWith('data:'))) {
                    iconEl.innerHTML = `<img src="${esc(icon)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`;
                } else {
                    iconEl.textContent = giftEmojiFor(giftName);
                }
            }
            dcSayGiftPickMode = false;
            dcCloseGiftPicker();
            return;
        }
        if (!dcGiftPickTriggerId) return;
        const id = dcGiftPickTriggerId;
        const cfg = getDcConfig();
        const tr = (cfg.triggers || []).find((t) => String(t.id) === String(id));
        if (tr) {
            tr.giftId = giftId || '';
            tr.giftName = giftName || '';
            tr.giftIcon = icon || '';
            saveDcConfig(cfg);
        }
        const card = document.querySelector(`.dc-trigger-card[data-id="${id}"]`);
        if (card) {
            const input = card.querySelector('.dc-trigger-gift-input');
            if (input) input.value = giftName || '';
            const iconEl = card.querySelector('.dc-trigger-gift-icon');
            if (iconEl) {
                if (icon && (icon.startsWith('http') || icon.startsWith('data:'))) {
                    iconEl.innerHTML = `<img src="${esc(icon)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`;
                } else {
                    iconEl.textContent = giftEmojiFor(giftName);
                }
            }
        }
        dcCloseGiftPicker();
    }

    function bindDcTriggerList() {
        const list = document.getElementById('dcTriggerList');
        if (!list || dcListBound) return;
        dcListBound = true;
        list.addEventListener('click', (e) => {
            const pill = e.target.closest('button.dc-effect-pill[data-effect]');
            if (pill) {
                e.preventDefault();
                e.stopPropagation();
                const id = dcTriggerIdFrom(pill);
                if (id) dcSelectEffect(id, pill.dataset.effect);
                return;
            }

            const card = e.target.closest('.dc-trigger-card');
            if (!card) return;
            const id = Number(card.dataset.id);
            if (!id) return;

            if (e.target.closest('.dc-type-pill[data-type]')) {
                e.preventDefault();
                const typePill = e.target.closest('.dc-type-pill[data-type]');
                dcUpdateTrigger(id, 'type', typePill.dataset.type === 'follow' ? 'follow' : 'gift');
                return;
            }
            if (e.target.closest('.dc-trigger-test')) {
                e.preventDefault();
                dcTestTrigger(id);
                return;
            }
            if (e.target.closest('.dc-trigger-del')) {
                e.preventDefault();
                e.stopPropagation();
                dcRemoveTrigger(id);
                return;
            }
            if (e.target.closest('.dc-trigger-enable')) {
                e.preventDefault();
                dcToggleTriggerEnabled(id);
                return;
            }
            if (e.target.closest('.dc-trigger-gift-pick')) {
                const cfg = getDcConfig();
                const tr = (cfg.triggers || []).find((t) => Number(t.id) === id);
                if (tr && (tr.type || 'gift') === 'follow') return;
                dcOpenGiftPicker(id);
            }
        });
        list.addEventListener('change', (e) => {
            const card = e.target.closest('.dc-trigger-card');
            if (!card) return;
            const id = Number(card.dataset.id);
            if (!id) return;

            if (e.target.matches('.dc-trigger-gift-input')) {
                dcUpdateTrigger(id, 'giftName', e.target.value);
            } else if (e.target.matches('.dc-trigger-cooldown')) {
                dcUpdateTrigger(id, 'cooldownSec', Number(e.target.value) || 0);
            } else if (e.target.matches('.dc-trigger-meta input[type="number"]:not(.dc-trigger-cooldown)')) {
                dcUpdateTrigger(id, 'duration', Number(e.target.value));
            } else if (e.target.matches('.dc-trigger-meta input[type="checkbox"]')) {
                dcUpdateTrigger(id, 'firework', e.target.checked);
            }
        });
    }

    function dcTestTrigger(id) {
        const cfg = getDcConfig();
        const tr = normalizeDcTrigger((cfg.triggers || []).find((t) => Number(t.id) === Number(id)));
        if (!tr) return;

        const effect = tr.effect || 'float_camera';
        const rule = {
            effect,
            duration: tr.duration || 6,
            firework: false,
            skipToast: true
        };
        testSeq += 1;
        const testUid = `test_viewer_${testSeq}`;
        const gift = {
            giftName: tr.type === 'follow' ? 'Follow' : (tr.giftName || 'Test Gift'),
            nickname: tr.type === 'follow' ? `ติดตาม #${testSeq}` : `ทดสอบ #${testSeq}`,
            uniqueId: testUid,
            diamondCount: tr.type === 'follow' ? 0 : 20,
            totalCoins: tr.type === 'follow' ? 0 : 20,
            avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=dc_test_${testSeq}&size=256&backgroundColor=bc13fe`,
            isFollow: tr.type === 'follow'
        };

        broadcastDcGift(gift, rule);
    }

    function renderDcTriggers() {
        const list = document.getElementById('dcTriggerList');
        if (!list) return;
        bindDcTriggerList();
        const triggers = (getDcConfig().triggers || []).map(normalizeDcTrigger).filter(Boolean);

        if (!triggers.length) {
            list.innerHTML = '<div class="dc-trigger-empty">ยังไม่มีทริกเกอร์ — กดปุ่มด้านล่างเพื่อเพิ่ม</div>';
            return;
        }

        list.innerHTML = triggers.map((tr) => {
            const effect = tr.effect || 'float_camera';
            const tid = Number(tr.id);
            const isFollow = tr.type === 'follow';
            const pills = Object.entries(DC_EFFECTS).map(([k, v]) =>
                `<button type="button" class="dc-effect-pill${k === effect ? ' active' : ''}" data-effect="${k}">
                    <span class="ico">${v.icon}</span><span>${v.label}</span>
                </button>`
            ).join('');

            const giftIconHtml = isFollow
                ? '👤'
                : ((tr.giftIcon && (tr.giftIcon.startsWith('http') || tr.giftIcon.startsWith('data:')))
                    ? `<img src="${esc(tr.giftIcon)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`
                    : giftEmojiFor(tr.giftName));

            const sourceRow = isFollow
                ? `<div class="dc-trigger-follow-badge">👤 เมื่อมีผู้ติดตามใหม่</div>`
                : `<button type="button" class="dc-trigger-gift-pick" data-id="${tid}" title="เลือกของขวัญจากรายการ">
                        <span class="dc-trigger-gift-icon">${giftIconHtml}</span>
                        <span class="dc-gift-pick-hint">เลือก</span>
                    </button>
                    <input type="text" class="dc-trigger-gift-input" placeholder="ชื่อของขวัญ TikTok"
                        value="${esc(tr.giftName)}">`;

            return `
            <article class="dc-trigger-card${tr.enabled === false ? ' is-off' : ''}${isFollow ? ' is-follow' : ''}" data-id="${tid}" data-type="${tr.type}">
                <div class="dc-type-row">
                    <button type="button" class="dc-type-pill${!isFollow ? ' active' : ''}" data-type="gift">🎁 ของขวัญ</button>
                    <button type="button" class="dc-type-pill${isFollow ? ' active' : ''}" data-type="follow">👤 ติดตาม</button>
                </div>
                <div class="dc-trigger-top">
                    ${sourceRow}
                    <div class="dc-trigger-actions-top">
                        <button type="button" class="dc-trigger-enable${tr.enabled !== false ? ' on' : ''}"
                            title="${tr.enabled !== false ? 'เปิดใช้งาน' : 'ปิดอยู่'}">⚡</button>
                        <button type="button" class="dc-trigger-test">▶ เทส</button>
                        <button type="button" class="dc-trigger-del" title="ลบ">✕</button>
                    </div>
                </div>
                <div class="dc-effect-label">เอฟเฟกต์ในเกม</div>
                <div class="dc-effect-grid">${pills}</div>
                <div class="dc-trigger-meta">
                    <div class="dc-meta-field">
                        <label>ระยะเวลา</label>
                        <input type="number" min="0" max="60" value="${tr.duration || 0}" title="วินาที (0 = อัตโนมัติ)">
                        <label>วินาที</label>
                    </div>
                    ${isFollow ? `<div class="dc-meta-field">
                        <label>คูลดาวน์</label>
                        <input type="number" class="dc-trigger-cooldown" min="0" max="3600" value="${tr.cooldownSec || 0}" title="วินาทีต่อผู้ชม (0 = ไม่จำกัด)">
                        <label>วิ</label>
                    </div>` : ''}
                    <label class="dc-meta-chk">
                        <input type="checkbox" ${tr.firework !== false ? 'checked' : ''}>
                        <span>🎆 พลุ</span>
                    </label>
                </div>
            </article>`;
        }).join('');
    }

    function ensureDcControlEmbed(panel) {
        const frame = document.getElementById('dcControlEmbed');
        if (!frame) return;
        const base = frame.getAttribute('data-src') || '/games/dance-club/control.html?embed=1';
        const targetPanel = panel || window.__dcStagePanel || 'music';
        const nextSrc = base.includes('panel=')
            ? base.replace(/([?&])panel=[^&]*/, `$1panel=${encodeURIComponent(targetPanel)}`)
            : `${base}${base.includes('?') ? '&' : '?'}panel=${encodeURIComponent(targetPanel)}`;
        const cur = frame.getAttribute('src') || '';
        if (!cur || cur === 'about:blank') {
            frame.setAttribute('src', nextSrc);
            return;
        }
        try {
            frame.contentWindow?.postMessage({ type: 'dc-set-panel', panel: targetPanel }, '*');
        } catch (e) {}
    }

    function switchDcStagePanel(panel) {
        window.__dcStagePanel = panel || 'music';
        switchDcTopTab('settings');
        const titles = {
            music: 'Music & Beat',
            lights: 'Lights & Stage',
            bg: 'Background',
            camera: 'Camera',
            dancers: 'Dancers'
        };
        const titleEl = document.getElementById('dcStagePanelTitle');
        if (titleEl) titleEl.textContent = titles[panel] || 'Stage';
        const navMap = {
            music: 'dcNavMusic',
            lights: 'dcNavLights',
            bg: 'dcNavBg',
            camera: 'dcNavCamera',
            dancers: 'dcNavDancers'
        };
        Object.keys(navMap).forEach((key) => {
            document.getElementById(navMap[key])?.classList.toggle('active', key === panel);
        });
        ensureDcControlEmbed(panel);
    }

    function switchDcTriggerSection(section) {
        switchDcTopTab('trigger');
        const map = {
            launch: { sec: 'dcSectionLaunch', nav: 'dcNavLaunch' },
            rules: { sec: 'dcSectionRules', nav: 'dcNavRules' },
            say: { sec: 'dcSectionSay', nav: 'dcNavSay' },
            about: { sec: 'dcSectionAbout', nav: 'dcNavAbout' }
        };
        Object.keys(map).forEach((key) => {
            const { sec, nav } = map[key];
            document.getElementById(sec)?.classList.toggle('active', key === section);
            document.getElementById(nav)?.classList.toggle('active', key === section);
        });
        if (section === 'rules') renderDcTriggers();
    }

    function switchDcTopTab(tab) {
        const settingsPanel = document.getElementById('dcSettingsPanel');
        const triggerPanel = document.getElementById('dcTriggerPanel');
        document.getElementById('dcTabSettings')?.classList.toggle('active', tab === 'settings');
        document.getElementById('dcTabTrigger')?.classList.toggle('active', tab === 'trigger');
        if (settingsPanel) settingsPanel.style.display = tab === 'settings' ? 'flex' : 'none';
        if (triggerPanel) triggerPanel.style.display = tab === 'trigger' ? 'flex' : 'none';
        if (tab === 'settings') ensureDcControlEmbed(window.__dcStagePanel || 'music');
        if (tab === 'trigger') {
            const active = document.querySelector('#dcTriggerPanel .dc-trig-section.active');
            if (!active) switchDcTriggerSection('launch');
            else if (active.id === 'dcSectionRules') renderDcTriggers();
        }
    }

    function switchDcSection(section) {
        if (section === 'control' || section === 'music') {
            switchDcStagePanel('music');
            return;
        }
        if (['lights', 'bg', 'camera', 'dancers'].includes(section)) {
            switchDcStagePanel(section);
            return;
        }
        if (section === 'launch' || section === 'say' || section === 'about' || section === 'rules' || section === 'stage') {
            switchDcTriggerSection(section === 'stage' ? 'rules' : section);
            return;
        }
        switchDcTopTab('settings');
    }


    function renderDcProfile() {
        const enabledEl = document.getElementById('dcGameEnabled');
        const fwAllEl = document.getElementById('dcFireworkOnAll');
        if (enabledEl) {
            enabledEl.checked = typeof isGameLiveActive === 'function'
                ? isGameLiveActive('dance-club')
                : !!getDcConfig().enabled;
        }
        if (fwAllEl) fwAllEl.checked = getDcConfig().fireworkOnAll !== false;
        renderDcTriggers();

        const cfg = getDcConfig();
        const say = ensureSayConfig(cfg);
        const set = (id, val, prop = 'value') => {
            const el = document.getElementById(id);
            if (!el) return;
            if (prop === 'checked') el.checked = !!val;
            else el.value = val ?? '';
        };
        set('dcSayEnabled', say.enabled, 'checked');
        set('dcSayRequireGift', say.requireGift, 'checked');
        set('dcSayPrefix', say.prefix || '!ds');
        set('dcSayGiftName', say.giftName || '');
        set('dcSayGiftId', say.giftId || '');
        set('dcSayDuration', say.duration || 10);
        set('dcSayMaxLen', say.maxLen || 48);
        set('dcSayCooldown', say.cooldownSec ?? 8);
        set('dcSayCharges', say.chargesPerGift || 1);
        const iconEl = document.getElementById('dcSayGiftIcon');
        if (iconEl) {
            if (say.giftIcon && (say.giftIcon.startsWith('http') || say.giftIcon.startsWith('data:'))) {
                iconEl.innerHTML = `<img src="${esc(say.giftIcon)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`;
            } else {
                iconEl.textContent = giftEmojiFor(say.giftName || 'Rose');
            }
        }
        const hint = document.getElementById('dcSayHint');
        if (hint) {
            const p = say.prefix || '!ds';
            hint.textContent = say.requireGift
                ? `ผู้ชมส่ง ${say.giftName || 'ของขวัญที่กำหนด'} ก่อน → พิมพ์ ${p} ตามด้วยข้อความ เช่น ${p} สวัสดีค้าบบบบบบ`
                : `ผู้ชมพิมพ์ ${p} ตามด้วยข้อความได้เลย เช่น ${p} สวัสดีค้าบบบบบบ`;
        }
    }

    function dcTestEffect(effect) {
        broadcastDcGift({
            giftName: 'Test',
            nickname: 'ทดสอบ',
            diamondCount: 20,
            totalCoins: 20
        }, { effect, duration: 6, firework: true });
        if (typeof showCustomMsg === 'function') {
            const fx = DC_EFFECTS[effect] || { label: effect };
            showCustomMsg('info', 'ทดสอบ Dance Club', fx.label);
        }
    }

    global.getDcConfig = getDcConfig;
    global.saveDcConfig = saveDcConfig;
    global.dcOpenGame = dcOpenGame;
    global.dcOpenControl = dcOpenControl;
    global.dcOpenBoth = dcOpenBoth;
    global.dcCopyOverlayLink = dcCopyOverlayLink;
    global.dcToggleEnabled = dcToggleEnabled;
    global.dcSetFireworkOnAll = dcSetFireworkOnAll;
    global.handleDcGift = handleDcGift;
    global.handleDcFollow = handleDcFollow;
    global.handleDcChat = handleDcChat;
    global.renderDcProfile = renderDcProfile;
    global.switchDcSection = switchDcSection;
    global.switchDcTopTab = switchDcTopTab;
    global.switchDcStagePanel = switchDcStagePanel;
    global.switchDcTriggerSection = switchDcTriggerSection;
    global.dcAddTrigger = dcAddTrigger;
    global.dcRemoveTrigger = dcRemoveTrigger;
    global.dcUpdateTrigger = dcUpdateTrigger;
    global.dcSelectEffect = dcSelectEffect;
    global.dcToggleTriggerEnabled = dcToggleTriggerEnabled;
    global.dcTestTrigger = dcTestTrigger;
    global.dcTestEffect = dcTestEffect;
    global.dcOpenGiftPicker = dcOpenGiftPicker;
    global.dcCloseGiftPicker = dcCloseGiftPicker;
    global.dcSaveSaySettingsFromUi = dcSaveSaySettingsFromUi;
    global.dcTestSay = dcTestSay;
    global.dcOpenSayGiftPicker = dcOpenSayGiftPicker;
    global.syncSpotifyToDanceClub = syncSpotifyToDanceClub;
    global.syncSpotifyQueueToDanceClub = broadcastDcSpotifyQueue;
    global.syncSpotifyProgressToDanceClub = broadcastDcSpotifyProgress;
})(window);
