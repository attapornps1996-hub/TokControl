/**
 * TokControl Settings Import / Export
 * - Native .tokconfig / TokControl JSON
 * - TikFinity config converter
 * - BetterTok Desktop config converter
 */
(function (global) {
    'use strict';

    const FORMAT = {
        TOKCONTROL: 'tokcontrol',
        TIKFINITY: 'tikfinity',
        BETTERTOK: 'bettertok',
        TIKTOEARN: 'tiktoearn',
        UNKNOWN: 'unknown'
    };

    function deepClone(value) {
        if (value == null) return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (_) { /* fallthrough */ }
        }
        return JSON.parse(JSON.stringify(value));
    }

    function uid(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function asMap(input) {
        if (!input) return {};
        if (Array.isArray(input)) {
            const map = {};
            input.forEach((item, i) => {
                if (!item || typeof item !== 'object') return;
                const id = String(item.id || item.Id || item.key || item.Key || `item_${i}`);
                map[id] = Object.assign({}, item, { id });
            });
            return map;
        }
        if (typeof input === 'object') {
            const map = {};
            Object.keys(input).forEach((key) => {
                const item = input[key];
                if (!item || typeof item !== 'object') return;
                const id = String(item.id || item.Id || key);
                map[id] = Object.assign({}, item, { id });
            });
            return map;
        }
        return {};
    }

    function normalizeTriggerType(raw) {
        const t = String(raw || '').toLowerCase().replace(/[\s_-]+/g, '');
        const map = {
            gift: 'gift',
            gifts: 'gift',
            specificgift: 'gift',
            sticker: 'gift',
            emote: 'gift',
            like: 'like',
            likes: 'like',
            follow: 'follow',
            follower: 'follow',
            share: 'share',
            join: 'join',
            member: 'join',
            enter: 'join',
            roomenter: 'join',
            subscribe: 'subscribe',
            subscription: 'subscribe',
            sub: 'subscribe',
            coins: 'coins',
            diamonds: 'coins',
            diamond: 'coins',
            superchat: 'coins',
            donate: 'coins',
            donation: 'coins',
            newmember: 'subscribe',
            globallikes: 'globallikes',
            totallikes: 'globallikes',
            chat: 'command',
            comment: 'command',
            command: 'command',
            chatcommand: 'command'
        };
        return map[t] || 'gift';
    }

    function emptyActionsEvents() {
        return {
            enabled: true,
            actions: {},
            events: {},
            screens: Array.from({ length: 8 }, () => ({ maxQueue: 5 })),
            timers: {}
        };
    }

    function emptySoundAlerts() {
        return {
            enabled: true,
            globalVolume: 85,
            playOnOverlay: true,
            playMode: 'queue',
            rules: {}
        };
    }

    function firstNonEmpty() {
        for (let i = 0; i < arguments.length; i++) {
            const v = arguments[i];
            if (v != null && String(v).trim() !== '') return v;
        }
        return null;
    }

    function isDataUrl(s) {
        return typeof s === 'string' && s.slice(0, 5) === 'data:';
    }

    function isHttpUrl(s) {
        return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
    }

    function isAppUrl(s) {
        return typeof s === 'string' && (s.charAt(0) === '/' || /^blob:/i.test(s));
    }

    function isUsableMediaUrl(s) {
        return isDataUrl(s) || isHttpUrl(s) || isAppUrl(s);
    }

    function fileBaseName(s) {
        return String(s || '').replace(/\\/g, '/').split('/').pop().split('?')[0] || '';
    }

    function getMediaSniff() {
        if (typeof global !== 'undefined' && global.TokMediaSniff) return global.TokMediaSniff;
        try { return require('./media-sniff.js'); } catch (_) { return null; }
    }

    function rewriteMaybeDataUrl(s) {
        const sniff = getMediaSniff();
        if (isDataUrl(s) && sniff && sniff.rewriteDataUrl) return sniff.rewriteDataUrl(s);
        return s;
    }

    function canonicalizeAction(a) {
        if (!a || typeof a !== 'object') return a;
        const soundHref = firstNonEmpty(a.soundData, a.soundData, a.audioData, a.SoundData, a.soundUrl, a.soundUrl, a.audioUrl, a.AudioUrl, a.SoundUrl);
        if (!a.soundData && isDataUrl(soundHref)) a.soundData = rewriteMaybeDataUrl(soundHref);
        else if (a.soundData && isDataUrl(a.soundData)) a.soundData = rewriteMaybeDataUrl(a.soundData);
        if (!a.soundUrl && soundHref && isUsableMediaUrl(soundHref) && !isDataUrl(soundHref)) a.soundUrl = soundHref;
        if (!a.soundName) {
            a.soundName = firstNonEmpty(a.soundName, a.SoundFile, a.audioFile, a.file);
            if (!a.soundName && soundHref && !isDataUrl(soundHref)) a.soundName = fileBaseName(soundHref);
        }
        if (a.soundUrl && !isUsableMediaUrl(a.soundUrl)) {
            if (!a.soundName) a.soundName = fileBaseName(a.soundUrl);
            a.soundUrl = null;
        }

        const imageHref = firstNonEmpty(a.imageData, a.imageData, a.pictureData, a.imageUrl, a.imageUrl, a.pictureUrl, a.PictureUrl);
        if (!a.imageData && isDataUrl(imageHref)) a.imageData = rewriteMaybeDataUrl(imageHref);
        else if (a.imageData && isDataUrl(a.imageData)) a.imageData = rewriteMaybeDataUrl(a.imageData);
        if (!a.imageUrl && imageHref && isUsableMediaUrl(imageHref) && !isDataUrl(imageHref)) a.imageUrl = imageHref;
        if (!a.imageName) {
            a.imageName = firstNonEmpty(a.imageName, a.PictureFile, a.pictureFile);
            if (!a.imageName && imageHref && !isDataUrl(imageHref)) a.imageName = fileBaseName(imageHref);
        }
        if (a.imageUrl && !isUsableMediaUrl(a.imageUrl)) {
            if (!a.imageName) a.imageName = fileBaseName(a.imageUrl);
            a.imageUrl = null;
        }

        const animHref = firstNonEmpty(a.animationData, a.animationUrl, a.animationUrl, a.AnimationUrl, a.gifUrl);
        if (!a.animationData && isDataUrl(animHref)) a.animationData = rewriteMaybeDataUrl(animHref);
        else if (a.animationData && isDataUrl(a.animationData)) a.animationData = rewriteMaybeDataUrl(a.animationData);
        if (!a.animationUrl && animHref && isUsableMediaUrl(animHref) && !isDataUrl(animHref)) a.animationUrl = animHref;
        if (!a.animationName) {
            a.animationName = firstNonEmpty(a.animationName, a.AnimationFile);
            if (!a.animationName && animHref && !isDataUrl(animHref)) a.animationName = fileBaseName(animHref);
        }
        if (a.animationUrl && !isUsableMediaUrl(a.animationUrl)) {
            if (!a.animationName) a.animationName = fileBaseName(a.animationUrl);
            a.animationUrl = null;
        }

        const videoHref = firstNonEmpty(a.videoData, a.videoUrl, a.videoUrl, a.VideoUrl);
        if (!a.videoData && isDataUrl(videoHref)) a.videoData = rewriteMaybeDataUrl(videoHref);
        else if (a.videoData && isDataUrl(a.videoData)) a.videoData = rewriteMaybeDataUrl(a.videoData);
        if (!a.videoUrl && videoHref && isUsableMediaUrl(videoHref) && !isDataUrl(videoHref)) a.videoUrl = videoHref;
        if (!a.videoName) {
            a.videoName = firstNonEmpty(a.videoName, a.VideoFile);
            if (!a.videoName && videoHref && !isDataUrl(videoHref)) a.videoName = fileBaseName(videoHref);
        }
        if (a.videoUrl && !isUsableMediaUrl(a.videoUrl)) {
            if (!a.videoName) a.videoName = fileBaseName(a.videoUrl);
            a.videoUrl = null;
        }

        const tts = firstNonEmpty(a.ttsText, a.ttsText, a.textToSpeech, a.TTS);
        if (!a.ttsText && tts) a.ttsText = String(tts);
        if (a.soundVolume == null && a.soundVolume != null) a.soundVolume = a.soundVolume;
        if (a.fadeInOut == null && a.fadeInOut != null) a.fadeInOut = a.fadeInOut;
        if (a.globalCooldown == null && a.globalCooldown != null) a.globalCooldown = a.globalCooldown;
        if (a.userCooldown == null && a.userCooldown != null) a.userCooldown = a.userCooldown;

        if (!a.media || typeof a.media !== 'object') a.media = {};
        if (a.soundData || a.soundUrl || a.soundName) a.media.sound = true;
        if (a.imageData || a.imageUrl) a.media.picture = true;
        if (a.animationData || a.animationUrl) a.media.animation = true;
        if (a.videoData || a.videoUrl) a.media.video = true;
        if (a.ttsText) a.media.tts = true;
        if (a.keystroke) a.media.keystroke = true;
        return a;
    }

    function canonicalizeSoundRule(rule) {
        if (!rule || typeof rule !== 'object') return rule;
        const href = firstNonEmpty(rule.soundData, rule.SoundData, rule.soundUrl, rule.soundUrl, rule.url);
        if (!rule.soundData && isDataUrl(href)) rule.soundData = rewriteMaybeDataUrl(href);
        else if (rule.soundData && isDataUrl(rule.soundData)) rule.soundData = rewriteMaybeDataUrl(rule.soundData);
        if (!rule.soundUrl && href && isUsableMediaUrl(href) && !isDataUrl(href)) rule.soundUrl = href;
        if (!rule.soundName) {
            rule.soundName = firstNonEmpty(rule.soundName, rule.SoundFile, rule.file, rule.name);
            if (!rule.soundName && href && !isDataUrl(href)) rule.soundName = fileBaseName(href);
        }
        if (rule.soundUrl && !isUsableMediaUrl(rule.soundUrl)) {
            if (!rule.soundName) rule.soundName = fileBaseName(rule.soundUrl);
            rule.soundUrl = null;
        }
        return rule;
    }

    function mediaLookupKeys(name) {
        const base = fileBaseName(name).toLowerCase();
        if (!base) return [];
        const noExt = base.replace(/\.[^.]+$/, '');
        return noExt && noExt !== base ? [base, noExt] : [base];
    }

    function attachMediaLibrary(converted, mediaItems) {
        if (!converted || !Array.isArray(mediaItems) || !mediaItems.length) return converted;
        const sniff = getMediaSniff();
        const map = {};
        mediaItems.forEach((item) => {
            mediaLookupKeys(item.name).forEach((k) => { if (k) map[k] = item; });
        });
        function match(refs) {
            for (let i = 0; i < (refs || []).length; i++) {
                const keys = mediaLookupKeys(refs[i]);
                for (let j = 0; j < keys.length; j++) {
                    if (map[keys[j]]) return map[keys[j]];
                }
            }
            return null;
        }
        function asDataUrl(item, slot) {
            if (item.dataUrl) return rewriteMaybeDataUrl(item.dataUrl);
            const info = sniff && item.bytes ? sniff.sniff(item.bytes) : { mime: 'application/octet-stream', kind: 'bin' };
            let mime = info.mime;
            if (!info || info.kind === 'bin' || mime === 'application/octet-stream') {
                mime = slot === 'sound' ? 'audio/mpeg'
                    : slot === 'video' ? 'video/mp4'
                    : slot === 'animation' ? 'image/gif'
                    : 'image/png';
            }
            return sniff ? sniff.bytesToDataUrl(item.bytes, mime) : '';
        }
        const actions = converted.actionsEvents && converted.actionsEvents.actions;
        if (actions) {
            Object.keys(actions).forEach((id) => {
                const a = actions[id];
                const refs = a._mediaRefs || {};
                const soundHit = match([a.soundName, a.soundUrl, a.soundUrl].concat(refs.sound || []));
                if (soundHit && !a.soundData) {
                    a.soundData = asDataUrl(soundHit, 'sound');
                    a.soundName = a.soundName || fileBaseName(soundHit.name);
                    a.soundUrl = isUsableMediaUrl(a.soundUrl) ? a.soundUrl : null;
                }
                const picHit = match([a.imageName, a.imageUrl, a.imageUrl].concat(refs.picture || []));
                if (picHit && !a.imageData) {
                    a.imageData = asDataUrl(picHit, 'picture');
                    a.imageName = a.imageName || fileBaseName(picHit.name);
                    a.imageUrl = isUsableMediaUrl(a.imageUrl) ? a.imageUrl : null;
                }
                const animHit = match([a.animationName, a.animationUrl, a.animationUrl].concat(refs.animation || []));
                if (animHit && !a.animationData) {
                    a.animationData = asDataUrl(animHit, 'animation');
                    a.animationName = a.animationName || fileBaseName(animHit.name);
                    a.animationUrl = isUsableMediaUrl(a.animationUrl) ? a.animationUrl : null;
                }
                const vidHit = match([a.videoName, a.videoUrl, a.videoUrl].concat(refs.video || []));
                if (vidHit && !a.videoData) {
                    a.videoData = asDataUrl(vidHit, 'video');
                    a.videoName = a.videoName || fileBaseName(vidHit.name);
                    a.videoUrl = isUsableMediaUrl(a.videoUrl) ? a.videoUrl : null;
                }
                delete a._mediaRefs;
            });
        }
        const rules = converted.soundAlerts && converted.soundAlerts.rules;
        if (rules) {
            Object.keys(rules).forEach((id) => {
                const r = rules[id];
                const hit = match([r.soundName, r.soundUrl, r.file, r.SoundFile]);
                if (hit && !r.soundData) {
                    r.soundData = asDataUrl(hit, 'sound');
                    r.soundName = r.soundName || fileBaseName(hit.name);
                    r.soundUrl = isUsableMediaUrl(r.soundUrl) ? r.soundUrl : null;
                }
            });
        }
        return converted;
    }

    function canonicalizeConverted(converted) {
        if (!converted) return converted;
        if (converted.actionsEvents) {
            converted.actionsEvents = normalizeActionsEvents(converted.actionsEvents);
        }
        if (converted.soundAlerts) {
            converted.soundAlerts = normalizeSoundAlerts(converted.soundAlerts);
        }
        return converted;
    }

    function normalizeActionsEvents(ae) {
        const out = emptyActionsEvents();
        if (!ae || typeof ae !== 'object') return out;
        out.enabled = ae.enabled !== false;
        out.actions = asMap(ae.actions);
        out.events = asMap(ae.events);
        out.timers = asMap(ae.timers);
        Object.values(out.actions).forEach((a) => {
            canonicalizeAction(a);
            if (!a.media || typeof a.media !== 'object') a.media = {};
            if (a.screen == null) a.screen = 1;
            if (a.duration == null) a.duration = 10;
            if (a.enabled === undefined) a.enabled = true;
        });
        Object.values(out.events).forEach((ev) => {
            if (!Array.isArray(ev.actionIds)) {
                if (ev.actionId) ev.actionIds = [String(ev.actionId)];
                else if (Array.isArray(ev.actions)) ev.actionIds = ev.actions.map(String);
                else ev.actionIds = [];
            } else {
                ev.actionIds = ev.actionIds.map(String);
            }
            ev.triggerType = normalizeTriggerType(ev.triggerType || ev.type || ev.Type);
            if (ev.triggerValue == null) {
                ev.triggerValue = String(ev.value || ev.Value || ev.giftId || ev.GiftId || '');
            }
            if (ev.actionMode !== 'single' && ev.actionMode !== 'random') {
                ev.actionMode = ev.actionIds.length > 1 ? 'random' : 'single';
            }
            if (ev.enabled === undefined) ev.enabled = true;
        });
        if (Array.isArray(ae.screens) && ae.screens.length) {
            out.screens = Array.from({ length: 8 }, (_, i) => ae.screens[i] || { maxQueue: 5 });
        }
        return out;
    }

    function normalizeSoundAlerts(sa) {
        const out = emptySoundAlerts();
        if (!sa || typeof sa !== 'object') return out;
        out.enabled = sa.enabled !== false;
        out.globalVolume = sa.globalVolume != null ? sa.globalVolume : 85;
        out.playOnOverlay = sa.playOnOverlay !== false;
        out.playMode = sa.playMode || 'queue';
        out.rules = asMap(sa.rules);
        Object.values(out.rules).forEach(canonicalizeSoundRule);
        return out;
    }

    function stripRandomCoinRewards(rulesMap) {
        if (!rulesMap || typeof rulesMap !== 'object') return;
        Object.keys(rulesMap).forEach((key) => {
            if (rulesMap[key] && typeof rulesMap[key] === 'object') rulesMap[key].coins = 0;
        });
    }

    function normalizeAdvConfSlice(adv) {
        const out = deepClone(adv && typeof adv === 'object' ? adv : {}) || {};
        out.actionsEvents = normalizeActionsEvents(out.actionsEvents);
        out.soundAlerts = normalizeSoundAlerts(out.soundAlerts);
        stripRandomCoinRewards(out.giftRules);
        stripRandomCoinRewards(out.wheelGiftRules);
        return out;
    }

    function detectFormat(data) {
        if (!data || typeof data !== 'object') return FORMAT.UNKNOWN;
        if (data.format === 'tokcontrol' || data.app === 'TokControl' || data.tokcontrolVersion || data.streamProfiles) {
            return FORMAT.TOKCONTROL;
        }
        if (data.advConf && (data.advConf.actionsEvents || data.advConf.soundAlerts)) {
            return FORMAT.TOKCONTROL;
        }
        if (data.actionsEvents || (data.snapshot && data.snapshot.advConf)) {
            return FORMAT.TOKCONTROL;
        }

        if (
            data.tiktoearn != null || data.TikToEarn != null || data.app === 'TikToEarn' ||
            data.event_action != null || data.action_event != null || data.sound_event != null
        ) {
            return FORMAT.TIKTOEARN;
        }

        // Official TikFinity .tfc decrypted shape
        const ds = data.dynamicSettings;
        const hasOfficialDs = ds && typeof ds === 'object' && (
            ds.events != null || ds.soundsdatasource != null || ds.soundAlerts != null
        );
        if (hasOfficialDs || (Array.isArray(data.actions) && (data.sourceChannelId != null || data.version != null))) {
            return FORMAT.TIKFINITY;
        }

        const looksTik =
            data.Actions != null || data.Events != null ||
            data.actionsAndEvents != null || data.myActions != null ||
            data.TikFinity != null || data.tikfinity != null ||
            (Array.isArray(data.actions) && data.actions.some((a) => a && (a.actionTypes || a.ActionTypes || a.PlaySound != null || a.Screen != null || a.audioUrl || a.textToSpeech))) ||
            (data.actions && !Array.isArray(data.actions) && Object.values(data.actions).some((a) => a && (a.actionTypes || a.PlaySound != null || a.MinecraftCommand)));
        if (looksTik) return FORMAT.TIKFINITY;

        const looksBt =
            data.bettertok != null || data.BetterTok != null || data.BetterTokDesktop != null ||
            data.triggerGroups != null || data.widgetPack != null ||
            (Array.isArray(data.triggers) && Array.isArray(data.actions));
        if (looksBt) return FORMAT.BETTERTOK;

        if (data.actions && data.events) {
            const sampleEv = Array.isArray(data.events) ? data.events[0] : Object.values(data.events || {})[0];
            if (sampleEv && (sampleEv.Type != null || sampleEv.ActionIds || sampleEv.actionIds || sampleEv.triggerTypeId != null)) return FORMAT.TIKFINITY;
            if (sampleEv && (sampleEv.trigger || sampleEv.condition)) return FORMAT.BETTERTOK;
            return FORMAT.TIKFINITY;
        }
        return FORMAT.UNKNOWN;
    }

    function parseJsonMaybe(v, fallback) {
        if (v == null) return fallback;
        if (typeof v === 'object') return v;
        if (typeof v === 'string') {
            try { return JSON.parse(v); } catch (_) { return fallback; }
        }
        return fallback;
    }

    const TF_TRIGGER_TYPE = {
        1: 'share',
        3: 'coins',
        4: 'gift',
        6: 'join',
        7: 'like',
        9: 'follow',
        10: 'subscribe',
        11: 'command',
        13: 'command'
    };

    function convertOfficialTikfinityAction(raw, id) {
        const media = {};
        if (raw.audioUrl || raw.AudioUrl || raw.soundUrl || raw.audioData || raw.soundData) media.sound = true;
        if (raw.imageUrl || raw.pictureUrl || raw.imageData) media.picture = true;
        if (raw.animationUrl || raw.AnimationUrl || raw.animationData) media.animation = true;
        if (raw.videoUrl || raw.VideoUrl || raw.videoData) media.video = true;
        if (raw.textToSpeech || raw.TTS || raw.tts || raw.message || raw.Message) media.tts = true;
        if (raw.keystrokes || raw.Keystrokes) media.keystroke = true;
        if (!Object.keys(media).length) {
            if (raw.textToSpeech) media.tts = true;
            else media.sound = true;
        }
        const dyn = raw.dynamicConfig || {};
        const soundHref = raw.audioUrl || raw.AudioUrl || raw.soundUrl || raw.soundData || raw.audioData || null;
        const imageHref = raw.imageUrl || raw.pictureUrl || raw.imageData || null;
        const animHref = raw.animationUrl || raw.AnimationUrl || raw.animationData || null;
        const videoHref = raw.videoUrl || raw.VideoUrl || raw.videoData || null;
        return {
            id,
            name: String(raw.name || raw.Name || id),
            screen: Number(raw.screen || raw.Screen || 1) || 1,
            duration: Number(raw.duration || raw.Duration || 10) || 10,
            enabled: raw.active !== false && raw.Enabled !== false && raw.enabled !== false,
            points: 0,
            pointsMode: 'none',
            soundVolume: Number(raw.soundVolume || raw.volume || 85) || 85,
            globalCooldown: Number(dyn.cooldown || 0) || 0,
            userCooldown: Number(dyn.userCooldown || 0) || 0,
            fadeInOut: true,
            repeatCombo: false,
            skipOnNext: false,
            media,
            soundName: raw.soundName || fileBaseName(soundHref) || null,
            soundData: isDataUrl(soundHref) ? soundHref : (raw.soundData || raw.audioData || null),
            soundUrl: soundHref,
            imageName: raw.imageName || fileBaseName(imageHref) || null,
            imageData: isDataUrl(imageHref) ? imageHref : (raw.imageData || null),
            imageUrl: imageHref,
            animationName: raw.animationName || fileBaseName(animHref) || null,
            animationData: isDataUrl(animHref) ? animHref : (raw.animationData || null),
            animationUrl: animHref,
            videoName: raw.videoName || fileBaseName(videoHref) || null,
            videoData: isDataUrl(videoHref) ? videoHref : (raw.videoData || null),
            videoUrl: videoHref,
            ttsText: String(raw.textToSpeech || raw.TTS || raw.tts || raw.message || raw.Message || ''),
            keystroke: raw.keystrokes ? { sequence: String(raw.keystrokes) } : null,
            description: 'Imported from TikFinity',
            importedFrom: 'tikfinity',
            _mediaRefs: {
                sound: [soundHref, raw.soundName, raw.SoundFile],
                picture: [imageHref, raw.imageName, raw.PictureFile],
                animation: [animHref, raw.animationName, raw.AnimationFile],
                video: [videoHref, raw.videoName, raw.VideoFile]
            }
        };
    }

    function convertOfficialTikfinityEvent(raw, id, actionIdMap) {
        const tt = Number(raw.triggerTypeId || raw.Type || raw.type || 0);
        let triggerType = TF_TRIGGER_TYPE[tt] || normalizeTriggerType(raw.triggerType || raw.Type || 'gift');
        let triggerValue = '';
        if (tt === 4 || triggerType === 'gift') {
            triggerValue = String(raw.giftId || raw.GiftId || raw.giftName || raw.GiftName || raw.Value || raw.value || '');
        } else if (tt === 3 || triggerType === 'coins') {
            triggerValue = String(raw.minBarsAmount || raw.Value || raw.value || '');
            triggerType = 'coins';
        } else if (tt === 7 || triggerType === 'like') {
            triggerValue = String(raw.minLikesAmount || raw.Value || raw.value || '');
        } else if (tt === 11 || tt === 13 || triggerType === 'command') {
            triggerValue = String(raw.chatCmd || raw.Value || raw.value || '');
            triggerType = 'command';
        } else {
            triggerValue = String(raw.Value || raw.value || raw.giftId || '');
        }
        const srcIds = raw.actionIds || raw.ActionIds || raw.actions || [];
        const list = Array.isArray(srcIds) ? srcIds : [srcIds];
        const actionIds = list.filter((x) => x != null).map((aid) => actionIdMap[String(aid)] || String(aid));
        return {
            id,
            name: String(raw.name || raw.Name || (raw.giftName ? `Gift: ${raw.giftName}` : id)),
            triggerType,
            triggerValue,
            actionIds,
            actionMode: actionIds.length > 1 ? 'random' : 'single',
            userFilter: 'any',
            specificUsername: '',
            enabled: raw.active !== false && raw.Enabled !== false && raw.enabled !== false,
            importedFrom: 'tikfinity'
        };
    }

    function convertOfficialTikfinityConfig(data) {
        const ds = data.dynamicSettings || {};
        const actionMap = asMap(
            Array.isArray(data.actions) ? data.actions
                : (data.actions || data.Actions || [])
        );
        let rawEvents = parseJsonMaybe(ds.events, null);
        if (!rawEvents) {
            rawEvents = Array.isArray(data.events) ? data.events
                : (data.events || data.Events || []);
        }
        const eventMap = asMap(rawEvents);
        const rawSounds = parseJsonMaybe(ds.soundsdatasource, parseJsonMaybe(ds.soundAlerts, []));

        const actions = {};
        const actionIdMap = {};
        Object.keys(actionMap).forEach((oldKey, i) => {
            const raw = actionMap[oldKey] || {};
            const oldId = String(raw.id != null ? raw.id : (oldKey || (`act_${i}`)));
            const newId = uid('act');
            actionIdMap[oldId] = newId;
            actionIdMap[String(oldKey)] = newId;
            actions[newId] = convertOfficialTikfinityAction(raw, newId);
        });

        const events = {};
        Object.keys(eventMap).forEach((oldKey) => {
            const raw = eventMap[oldKey] || {};
            const newId = uid('ev');
            events[newId] = convertOfficialTikfinityEvent(raw, newId, actionIdMap);
        });

        const ae = normalizeActionsEvents({ actions, events });
        const sa = convertTikfinitySounds(rawSounds);
        return {
            format: FORMAT.TIKFINITY,
            actionsEvents: ae,
            soundAlerts: sa,
            username: data.sourceChannelId || data.username || data.tiktokUsername || null,
            meta: {
                actionCount: Object.keys(ae.actions).length,
                eventCount: Object.keys(ae.events).length,
                soundCount: Object.keys(sa.rules).length
            }
        };
    }

    function extractTikfinityBuckets(data) {
        const candidates = [
            data,
            data.TikFinity, data.tikfinity,
            data.actionsAndEvents, data.ActionsAndEvents,
            data.profile, data.Profile, data.export, data.Export,
            data.data, data.payload, data.settings, data.Settings
        ].filter(Boolean);

        let actions = null;
        let events = null;
        let sounds = null;

        function pick(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (!actions) {
                actions = obj.Actions || obj.actions || obj.myActions || obj.MyActions || null;
            }
            if (!events) {
                events = obj.Events || obj.events || obj.Triggers || obj.triggers || null;
            }
            if (!sounds) {
                sounds = obj.SoundAlerts || obj.soundAlerts || obj.Sounds || obj.sounds || null;
            }
            // nested AE pack
            const ae = obj.actionsAndEvents || obj.ActionsAndEvents;
            if (ae) {
                if (!actions) actions = ae.Actions || ae.actions || null;
                if (!events) events = ae.Events || ae.events || null;
                if (!sounds) sounds = ae.SoundAlerts || ae.soundAlerts || ae.Sounds || ae.sounds || null;
            }
        }

        candidates.forEach(pick);

        // Deep scan fallback (also try to fill missing sounds)
        if ((!actions || !events || !sounds) && data && typeof data === 'object') {
            const stack = [data];
            let guard = 0;
            while (stack.length && guard++ < 200) {
                const cur = stack.pop();
                if (!cur || typeof cur !== 'object') continue;
                pick(cur);
                if (actions && events && sounds) break;
                Object.keys(cur).forEach((k) => {
                    const v = cur[k];
                    if (v && typeof v === 'object') stack.push(v);
                });
            }
        }

        return { actions: actions || {}, events: events || {}, sounds };
    }

    function convertTikfinitySounds(sounds) {
        const sa = emptySoundAlerts();
        if (!sounds) return sa;
        const map = asMap(Array.isArray(sounds) ? sounds : (sounds.rules || sounds));
        Object.keys(map).forEach((id, i) => {
            const raw = map[id];
            const key = String(raw.giftId || raw.GiftId || raw.id || id || ('sa_' + i));
            sa.rules[key] = {
                id: key,
                name: String(raw.Name || raw.name || raw.giftName || raw.GiftName || key),
                enabled: raw.Enabled !== false && raw.enabled !== false,
                eventType: normalizeTriggerType(raw.Type || raw.type || raw.eventType || 'gift'),
                giftId: raw.giftId || raw.GiftId || null,
                giftName: raw.giftName || raw.GiftName || null,
                giftIcon: raw.giftIcon || raw.GiftIcon || null,
                threshold: Number(raw.Threshold || raw.threshold || raw.Amount || raw.amount || 1) || 1,
                volume: Number(raw.Volume || raw.volume || 80) || 80,
                soundName: raw.SoundFile || raw.soundName || raw.file || raw.name || null,
                soundUrl: raw.SoundUrl || raw.soundUrl || raw.url || raw.audioUrl || null,
                soundData: raw.SoundData || raw.soundData || raw.audioData || null,
                builtin: raw.builtin || null,
                importedFrom: 'tikfinity'
            };
        });
        return normalizeSoundAlerts(sa);
    }

    function convertTikfinityAction(raw, id) {
        const media = {};
        const actionTypes = raw.actionTypes || raw.ActionTypes || raw.types || {};
        const hasSound = !!(raw.PlaySound || raw.playSound || raw.sound || actionTypes.sound || actionTypes.Sound || raw.SoundFile);
        const hasPicture = !!(raw.ShowPicture || raw.showPicture || actionTypes.picture || actionTypes.Picture || raw.PictureFile || raw.image);
        const hasAnim = !!(raw.ShowAnimation || raw.showAnimation || actionTypes.animation || actionTypes.Animation || raw.AnimationFile);
        const hasVideo = !!(raw.PlayVideo || raw.playVideo || actionTypes.video || actionTypes.Video || raw.VideoFile);
        const hasTts = !!(raw.TTS || raw.tts || actionTypes.tts || actionTypes.TTS || raw.TtsText || raw.ttsText);
        const hasKey = !!(raw.Keystroke || raw.keystroke || actionTypes.keystroke);
        if (hasSound) media.sound = true;
        if (hasPicture) media.picture = true;
        if (hasAnim) media.animation = true;
        if (hasVideo) media.video = true;
        if (hasTts) media.tts = true;
        if (hasKey) media.keystroke = true;
        if (!Object.keys(media).length) media.sound = true;

        return {
            id,
            name: String(raw.Name || raw.name || raw.title || id),
            screen: Number(raw.Screen || raw.screen || raw.screenId || 1) || 1,
            duration: Number(raw.Duration || raw.duration || 10) || 10,
            enabled: raw.Enabled !== false && raw.enabled !== false,
            points: Number(raw.Points || raw.points || 0) || 0,
            pointsMode: raw.pointsMode || 'none',
            soundVolume: Number(raw.SoundVolume || raw.soundVolume || 85) || 85,
            globalCooldown: Number(raw.GlobalCooldown || raw.globalCooldown || 0) || 0,
            userCooldown: Number(raw.UserCooldown || raw.userCooldown || 0) || 0,
            fadeInOut: raw.FadeInOut !== false && raw.fadeInOut !== false,
            repeatCombo: !!(raw.RepeatWithCombo || raw.repeatCombo || raw.RepeatCombo),
            skipOnNext: !!(raw.SkipOnNext || raw.skipOnNext),
            media,
            soundName: raw.SoundFile || raw.soundName || raw.sound || null,
            soundData: raw.SoundData || raw.soundData || raw.audioData || null,
            soundUrl: raw.SoundUrl || raw.soundUrl || raw.audioUrl || null,
            imageName: raw.PictureFile || raw.imageName || null,
            imageData: raw.PictureData || raw.imageData || null,
            imageUrl: raw.PictureUrl || raw.imageUrl || raw.image || null,
            animationName: raw.AnimationFile || raw.animationName || null,
            animationData: raw.AnimationData || raw.animationData || null,
            animationUrl: raw.AnimationUrl || raw.animationUrl || null,
            videoName: raw.VideoFile || raw.videoName || null,
            videoData: raw.VideoData || raw.videoData || null,
            videoUrl: raw.VideoUrl || raw.videoUrl || null,
            ttsText: raw.TtsText || raw.ttsText || raw.TTSText || '',
            keystroke: raw.Keystroke || raw.keystroke || null,
            description: raw.Description || raw.description || 'Imported from TikFinity',
            importedFrom: 'tikfinity',
            _mediaRefs: {
                sound: [raw.SoundFile, raw.SoundUrl, raw.soundUrl, raw.audioUrl],
                picture: [raw.PictureFile, raw.PictureUrl, raw.imageUrl],
                animation: [raw.AnimationFile, raw.AnimationUrl, raw.animationUrl],
                video: [raw.VideoFile, raw.VideoUrl, raw.videoUrl]
            }
        };
    }

    function convertTikfinityEvent(raw, id, actionIdMap) {
        // Prefer official converter when numeric Type / triggerTypeId present
        const numericType = Number(raw.triggerTypeId != null ? raw.triggerTypeId : raw.Type);
        if (Number.isFinite(numericType) && numericType > 0 && TF_TRIGGER_TYPE[numericType]) {
            return convertOfficialTikfinityEvent(raw, id, actionIdMap);
        }
        const actionIds = [];
        const srcIds = raw.ActionIds || raw.actionIds || raw.Actions || raw.actions || raw.actionId || raw.ActionId;
        const list = Array.isArray(srcIds) ? srcIds : (srcIds != null ? [srcIds] : []);
        list.forEach((aid) => {
            const key = String(aid);
            actionIds.push(actionIdMap[key] || key);
        });
        return {
            id,
            name: String(raw.Name || raw.name || raw.title || id),
            triggerType: normalizeTriggerType(raw.triggerType || raw.TriggerType || raw.Type || raw.type || 'gift'),
            triggerValue: String(raw.Value || raw.value || raw.GiftId || raw.giftId || raw.threshold || ''),
            actionIds,
            actionMode: actionIds.length > 1 ? 'random' : 'single',
            userFilter: (raw.UserFilter || raw.userFilter || 'any').toLowerCase(),
            specificUsername: raw.SpecificUsername || raw.specificUsername || '',
            enabled: raw.Enabled !== false && raw.enabled !== false,
            importedFrom: 'tikfinity'
        };
    }

    function convertFromTikfinity(data) {
        // Official decrypted .tfc payload (only when real official fields exist)
        const ds = data && data.dynamicSettings;
        const hasOfficialDs = ds && typeof ds === 'object' && (
            ds.events != null || ds.soundsdatasource != null || ds.soundAlerts != null
        );
        const hasOfficialActions = Array.isArray(data.actions) && (data.version != null || hasOfficialDs);
        if (data && (hasOfficialDs || hasOfficialActions)) {
            return convertOfficialTikfinityConfig(data);
        }

        const { actions: rawActions, events: rawEvents, sounds } = extractTikfinityBuckets(data);
        const actionMap = asMap(rawActions);
        const eventMap = asMap(rawEvents);
        const actions = {};
        const actionIdMap = {};
        Object.keys(actionMap).forEach((oldId) => {
            const newId = uid('act');
            actionIdMap[oldId] = newId;
            // Prefer official field mapping when audioUrl/textToSpeech present
            const raw = actionMap[oldId];
            actions[newId] = (raw.audioUrl || raw.textToSpeech || raw.triggerTypeId != null)
                ? convertOfficialTikfinityAction(raw, newId)
                : convertTikfinityAction(raw, newId);
        });
        const events = {};
        Object.keys(eventMap).forEach((oldId) => {
            const newId = uid('ev');
            const raw = eventMap[oldId];
            events[newId] = (raw.triggerTypeId != null)
                ? convertOfficialTikfinityEvent(raw, newId, actionIdMap)
                : convertTikfinityEvent(raw, newId, actionIdMap);
        });

        const ae = normalizeActionsEvents({ actions, events });
        const sa = convertTikfinitySounds(sounds);
        return {
            format: FORMAT.TIKFINITY,
            actionsEvents: ae,
            soundAlerts: sa,
            username: data.sourceChannelId || data.username || data.tiktokUsername || data.TikTokUsername || null,
            general: null,
            meta: {
                actionCount: Object.keys(ae.actions).length,
                eventCount: Object.keys(ae.events).length,
                soundCount: Object.keys(sa.rules).length
            }
        };
    }

    function convertBetterTokAction(raw, id) {
        const media = {};
        const type = String(raw.type || raw.actionType || raw.kind || 'sound').toLowerCase();
        if (type.includes('sound') || type.includes('audio')) media.sound = true;
        else if (type.includes('image') || type.includes('picture') || type.includes('gif')) media.picture = true;
        else if (type.includes('anim')) media.animation = true;
        else if (type.includes('video')) media.video = true;
        else if (type.includes('tts') || type.includes('speak')) media.tts = true;
        else media.sound = true;
        return {
            id,
            name: String(raw.name || raw.title || id),
            screen: Number(raw.screen || raw.page || 1) || 1,
            duration: Number(raw.duration || raw.length || 10) || 10,
            enabled: raw.enabled !== false,
            media,
            soundName: raw.soundName || raw.file || null,
            soundData: raw.soundData || raw.audioData || null,
            soundUrl: raw.soundUrl || raw.url || raw.audioUrl || null,
            imageName: raw.imageName || raw.pictureName || null,
            imageData: raw.imageData || raw.pictureData || null,
            imageUrl: raw.imageUrl || raw.image || raw.pictureUrl || null,
            animationUrl: raw.animationUrl || raw.gifUrl || null,
            videoUrl: raw.videoUrl || null,
            ttsText: raw.ttsText || raw.text || '',
            description: raw.description || 'Imported from BetterTok',
            importedFrom: 'bettertok',
            _mediaRefs: {
                sound: [raw.soundName, raw.file, raw.soundUrl, raw.url],
                picture: [raw.imageName, raw.imageUrl, raw.image],
                animation: [raw.animationUrl, raw.gifUrl],
                video: [raw.videoUrl]
            }
        };
    }

    function convertBetterTokTrigger(raw, id, actionIdMap) {
        const linked = raw.actionIds || raw.actions || raw.actionId || raw.target || [];
        const list = Array.isArray(linked) ? linked : [linked];
        const actionIds = list.filter(Boolean).map((x) => actionIdMap[String(x)] || String(x));
        const cond = raw.condition || raw.trigger || raw;
        return {
            id,
            name: String(raw.name || raw.title || id),
            triggerType: normalizeTriggerType(cond.type || cond.event || raw.type || 'gift'),
            triggerValue: String(cond.value || cond.giftId || cond.threshold || raw.value || ''),
            actionIds,
            actionMode: actionIds.length > 1 ? 'random' : 'single',
            userFilter: 'any',
            enabled: raw.enabled !== false,
            importedFrom: 'bettertok'
        };
    }

    function convertFromBetterTok(data) {
        const root = data.BetterTok || data.bettertok || data.BetterTokDesktop || data;
        const actionMap = asMap(root.actions || root.Actions || []);
        const triggerMap = asMap(root.triggers || root.Triggers || root.events || root.Events || root.triggerGroups || []);
        const actions = {};
        const actionIdMap = {};
        Object.keys(actionMap).forEach((oldId) => {
            const newId = uid('act');
            actionIdMap[oldId] = newId;
            actions[newId] = convertBetterTokAction(actionMap[oldId], newId);
        });
        const events = {};
        Object.keys(triggerMap).forEach((oldId) => {
            const item = triggerMap[oldId];
            // triggerGroups may nest triggers
            if (Array.isArray(item.triggers)) {
                item.triggers.forEach((tr, i) => {
                    const newId = uid('ev');
                    events[newId] = convertBetterTokTrigger(Object.assign({ name: item.name }, tr), newId, actionIdMap);
                });
            } else {
                const newId = uid('ev');
                events[newId] = convertBetterTokTrigger(item, newId, actionIdMap);
            }
        });
        const ae = normalizeActionsEvents({ actions, events });
        return {
            format: FORMAT.BETTERTOK,
            actionsEvents: ae,
            soundAlerts: emptySoundAlerts(),
            meta: {
                actionCount: Object.keys(ae.actions).length,
                eventCount: Object.keys(ae.events).length,
                soundCount: 0
            }
        };
    }

    const TTE_EVENT_TYPE = {
        1: 'join',
        2: 'share',
        3: 'follow',
        4: 'like',
        5: 'gift',
        6: 'coins',
        7: 'command',
        8: 'coins',
        9: 'subscribe',
        10: 'subscribe',
        11: 'gift',
        12: 'gift',
        13: 'coins'
    };

    function tteAbsUrl(s) {
        const api = global.TikToEarnBin && global.TikToEarnBin.absMediaUrl;
        if (typeof api === 'function') return api(s);
        const v = String(s || '').trim();
        if (!v) return null;
        if (/^data:|^https?:\/\/|^blob:/i.test(v)) return v;
        if (v.charAt(0) === '/') return 'https://api.tiktoearn.com' + v;
        return v;
    }

    function tteScreenNum(raw) {
        const s = String((raw && (raw.action_screen || raw.screen || raw.Screen)) || '1');
        const m = s.match(/(\d+)/);
        const n = Number(m && m[1]);
        return n >= 1 ? n : 1;
    }

    function ttePickRoot(data) {
        if (!data || typeof data !== 'object') return data;
        return data.event_action || data.tiktoearn || data.TikToEarn || data.payload || data;
    }

    function convertTikToEarnAction(raw, id) {
        const imageHref = tteAbsUrl(firstNonEmpty(
            raw.action_image, raw.action_img, raw.action_picture, raw.action_gif,
            raw.overlay_image, raw.image, raw.imageUrl, raw.image_url
        ));
        const videoHref = tteAbsUrl(firstNonEmpty(
            raw.action_video, raw.action_mp4, raw.video, raw.videoUrl, raw.video_url
        ));
        const soundHref = tteAbsUrl(firstNonEmpty(
            raw.action_sound, raw.action_audio, raw.sound, raw.sound_file, raw.sound_url,
            raw.audioUrl, raw.audio_url
        ));
        const ttsOn = String(raw.action_tts_type || '') === '1' || !!(raw.action_tts_text || raw.ttsText);
        const keyOn = String(raw.action_simulate_type || '') === '1' || !!(raw.action_paramitor || raw.keystroke);
        const media = {};
        if (soundHref || isDataUrl(raw.soundData) || isDataUrl(raw.audioData)) media.sound = true;
        if (imageHref && /\.(gif|webp)(\?|$)/i.test(String(imageHref))) media.animation = true;
        else if (imageHref) media.picture = true;
        if (videoHref) media.video = true;
        if (ttsOn) media.tts = true;
        if (keyOn) media.keystroke = true;
        if (!Object.keys(media).length) media.sound = true;

        let keystroke = null;
        if (keyOn && raw.action_paramitor) {
            try {
                const seq = typeof raw.action_paramitor === 'string'
                    ? JSON.parse(raw.action_paramitor)
                    : raw.action_paramitor;
                keystroke = { sequence: seq };
            } catch (_) {
                keystroke = { sequence: String(raw.action_paramitor) };
            }
        }

        return {
            id,
            name: String(raw.action_name || raw.name || raw.event_name || id),
            screen: tteScreenNum(raw),
            duration: Number(raw.action_duration || raw.duration || 10) || 10,
            enabled: raw.enabled !== false && raw.action_status !== 0 && raw.action_status !== '0',
            points: Number(raw.action_win_point || 0) || 0,
            pointsMode: String(raw.action_win_tik) === '1' ? 'add' : 'none',
            soundVolume: Number(raw.action_volume || raw.volume || 85) || 85,
            globalCooldown: Number(raw.event_delay_sec || 0) || 0,
            userCooldown: 0,
            fadeInOut: true,
            repeatCombo: false,
            skipOnNext: false,
            media,
            soundName: raw.sound_name || fileBaseName(soundHref) || null,
            soundData: isDataUrl(soundHref) ? soundHref : (raw.soundData || raw.audioData || null),
            soundUrl: soundHref,
            imageName: raw.image_name || fileBaseName(imageHref) || null,
            imageData: isDataUrl(imageHref) ? imageHref : (raw.imageData || null),
            imageUrl: imageHref,
            animationName: null,
            animationData: null,
            animationUrl: (imageHref && media.animation) ? imageHref : null,
            videoName: fileBaseName(videoHref) || null,
            videoData: isDataUrl(videoHref) ? videoHref : null,
            videoUrl: videoHref,
            ttsText: String(raw.action_tts_text || raw.ttsText || ''),
            keystroke,
            description: 'Imported from TikToEarn',
            importedFrom: 'tiktoearn',
            _mediaRefs: {
                sound: [soundHref, raw.sound_name, raw.sound_file, raw.action_sound],
                picture: [imageHref, raw.action_image, raw.action_picture],
                animation: [raw.action_gif],
                video: [videoHref, raw.action_video]
            }
        };
    }

    function tteTriggerValue(raw, triggerType) {
        if (triggerType === 'gift') {
            if (String(raw.event_type) === '11') return '';
            return String(raw.gift_id || raw.giftId || raw.gift_name || raw.sticker_id || '');
        }
        if (triggerType === 'coins') return String(raw.event_min_coins || raw.event_like || raw.value || '');
        if (triggerType === 'like') return String(raw.event_like || raw.event_min_coins || '');
        if (triggerType === 'command') {
            if (Number(raw.event_comment_any) === 1) return '';
            return String(raw.event_comment_text || raw.value || '');
        }
        return String(raw.event_like || raw.value || raw.gift_id || '');
    }

    function convertFromTikToEarn(data) {
        const root = ttePickRoot(data) || {};
        const rows = Array.isArray(root.action_event) ? root.action_event
            : (Array.isArray(data && data.action_event) ? data.action_event : []);
        const soundRows = Array.isArray(root.sound_event) ? root.sound_event
            : (Array.isArray(data && data.sound_event) ? data.sound_event : []);

        const actions = {};
        const actionIdMap = {};
        const events = {};

        rows.forEach((raw, i) => {
            if (!raw || typeof raw !== 'object') return;
            const oldAct = String(raw.action_id || raw.ActionId || `act_${i}`);
            if (!actionIdMap[oldAct]) {
                const newId = uid('act');
                actionIdMap[oldAct] = newId;
                actions[newId] = convertTikToEarnAction(raw, newId);
            }
            const oldEv = String(raw.event_id || raw.EventId || `ev_${i}`);
            if (!events[oldEv]) {
                const ttNum = Number(raw.event_type || raw.eventType || 5);
                const triggerType = TTE_EVENT_TYPE[ttNum] || normalizeTriggerType(raw.triggerType || 'gift');
                events[oldEv] = {
                    id: oldEv,
                    name: String(raw.event_name || raw.name || (raw.gift_name ? `Gift: ${raw.gift_name}` : oldEv)),
                    triggerType,
                    triggerValue: tteTriggerValue(raw, triggerType),
                    actionIds: [],
                    actionMode: String(raw.trigger_type) === '2' || String(raw.event_type_action_random) === '1' ? 'random' : 'single',
                    userFilter: Number(raw.event_who) === 2 ? 'specific' : 'any',
                    specificUsername: String(raw.event_spacial_id || raw.event_special_id || '').replace(/^@/, ''),
                    enabled: raw.enabled !== false && raw.event_status !== 0 && raw.event_status !== '0',
                    importedFrom: 'tiktoearn'
                };
            }
            const mappedAct = actionIdMap[oldAct];
            if (mappedAct && events[oldEv].actionIds.indexOf(mappedAct) < 0) {
                events[oldEv].actionIds.push(mappedAct);
            }
        });

        const remappedEvents = {};
        Object.keys(events).forEach((oldId) => {
            const newId = uid('ev');
            const ev = events[oldId];
            ev.id = newId;
            remappedEvents[newId] = ev;
        });

        const ae = normalizeActionsEvents({ actions, events: remappedEvents });
        const sa = emptySoundAlerts();
        soundRows.forEach((raw, i) => {
            if (!raw || typeof raw !== 'object') return;
            const ttNum = Number(raw.event_type || 5);
            const triggerType = TTE_EVENT_TYPE[ttNum] || 'gift';
            const href = tteAbsUrl(firstNonEmpty(raw.sound_file, raw.sound_url, raw.sound, raw.file, raw.url));
            const key = String(raw.sound_id || raw.gift_id || raw.id || ('sa_' + i));
            sa.rules[key] = {
                id: key,
                name: String(raw.sound_name || raw.name || raw.gift_name || key),
                enabled: raw.enabled !== false,
                eventType: triggerType,
                giftId: raw.gift_id || raw.sticker_id || null,
                giftName: raw.gift_name || null,
                giftIcon: raw.gift_image || raw.gift_icon || null,
                threshold: Number(raw.event_min_coins || raw.event_like || 1) || 1,
                volume: Number(raw.volume || raw.sound_volume || 80) || 80,
                soundName: raw.sound_name || fileBaseName(href) || null,
                soundUrl: href,
                soundData: isDataUrl(href) ? href : (raw.soundData || null),
                importedFrom: 'tiktoearn'
            };
        });

        return {
            format: FORMAT.TIKTOEARN,
            actionsEvents: ae,
            soundAlerts: normalizeSoundAlerts(sa),
            username: root.tiktok_username || data.sourceChannelId || data.username || null,
            general: null,
            meta: {
                actionCount: Object.keys(ae.actions).length,
                eventCount: Object.keys(ae.events).length,
                soundCount: Object.keys(sa.rules).length
            }
        };
    }

    function convertFromTokControl(data) {
        let adv = null;
        if (data.advConf) adv = data.advConf;
        else if (data.snapshot && data.snapshot.advConf) adv = data.snapshot.advConf;
        else if (data.actionsEvents) adv = { actionsEvents: data.actionsEvents, soundAlerts: data.soundAlerts };
        else if (data.payload && data.payload.advConf) adv = data.payload.advConf;
        const normalized = normalizeAdvConfSlice(adv || {});
        return {
            format: FORMAT.TOKCONTROL,
            actionsEvents: normalized.actionsEvents,
            soundAlerts: normalized.soundAlerts,
            fullAdvConf: normalized,
            streamProfiles: data.streamProfiles || null,
            username: data.username || data.tiktokUsername || null,
            general: data.general || null,
            meta: {
                actionCount: Object.keys(normalized.actionsEvents.actions).length,
                eventCount: Object.keys(normalized.actionsEvents.events).length,
                soundCount: Object.keys(normalized.soundAlerts.rules).length
            }
        };
    }

    /** Filter converted import by TikFinity-style section checkboxes */
    function filterConvertedBySections(converted, sections) {
        const sec = Object.assign({
            username: true,
            general: true,
            soundAlerts: true,
            actions: true,
            events: true
        }, sections || {});
        const full = deepClone(converted || {});
        full.actionsEvents = normalizeActionsEvents(full.actionsEvents);
        full.soundAlerts = normalizeSoundAlerts(full.soundAlerts);
        const out = deepClone(full);
        // Events need their linked actions — keep referenced actions even if Actions unchecked
        if (sec.events && !sec.actions) {
            const keep = {};
            Object.values(out.actionsEvents.events || {}).forEach((ev) => {
                (ev.actionIds || []).forEach((aid) => {
                    const id = String(aid);
                    if (full.actionsEvents.actions[id]) keep[id] = deepClone(full.actionsEvents.actions[id]);
                });
            });
            out.actionsEvents.actions = keep;
        } else if (!sec.actions) {
            out.actionsEvents.actions = {};
        }
        if (!sec.events) out.actionsEvents.events = {};
        if (!sec.soundAlerts) out.soundAlerts = emptySoundAlerts();
        if (!sec.username) out.username = null;
        if (!sec.general) out.general = null;
        out.meta = {
            actionCount: Object.keys(out.actionsEvents.actions).length,
            eventCount: Object.keys(out.actionsEvents.events).length,
            soundCount: Object.keys(out.soundAlerts.rules).length
        };
        out._sections = sec;
        return out;
    }

    async function decodeImportText(raw) {
        let text = String(raw || '').replace(/^\uFEFF/, '').trim();
        if (!text) throw new Error('ไฟล์ว่าง');

        // TikFinity encrypted .tfc
        const tfc = global.TikfinityTfc;
        if (tfc && (tfc.looksLikeTfc(text) || (!text.startsWith('{') && !text.startsWith('[')))) {
            const dec = tfc.tryDecryptTfc(text);
            if (dec.ok) return dec.config;
            // If it looked like TFC, surface decrypt error instead of JSON error
            if (tfc.looksLikeTfc(text)) {
                throw new Error(dec.error || 'ถอดรหัสไฟล์ .tfc ไม่สำเร็จ');
            }
        }

        // Already JSON (including TikToEarn AES envelope)
        if (text.startsWith('{') || text.startsWith('[')) {
            const parsed = JSON.parse(text);
            return await unwrapTikToEarn(parsed);
        }

        // Base64-wrapped JSON
        try {
            const cleaned = text.replace(/\s+/g, '');
            if (/^[A-Za-z0-9+/=_-]+$/.test(cleaned) && cleaned.length > 16) {
                let b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
                while (b64.length % 4) b64 += '=';
                const decoded = (typeof atob === 'function')
                    ? atob(b64)
                    : Buffer.from(b64, 'base64').toString('utf8');
                const trimmed = String(decoded || '').trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    return JSON.parse(trimmed);
                }
                // Maybe nested encrypted tfc after base64
                if (tfc && tfc.looksLikeTfc(trimmed)) {
                    const dec2 = tfc.tryDecryptTfc(trimmed);
                    if (dec2.ok) return dec2.config;
                }
                try {
                    const again = JSON.parse(trimmed);
                    if (typeof again === 'string' && (again.trim().startsWith('{') || again.trim().startsWith('['))) {
                        return JSON.parse(again);
                    }
                    if (again && typeof again === 'object') return again;
                } catch (_) {}
            }
        } catch (_) {}

        // Last chance: try TFC decrypt anyway
        if (tfc) {
            const dec3 = tfc.tryDecryptTfc(text);
            if (dec3.ok) return dec3.config;
        }

        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(text.slice(start, end + 1));
        }
        throw new Error('ไม่ใช่ไฟล์ JSON/.tfc ที่อ่านได้');
    }

    function looksLikeTikToEarnEnvelope(obj) {
        const tte = global.TikToEarnBin;
        if (tte && typeof tte.isEnvelope === 'function') return tte.isEnvelope(obj);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        const alg = String(obj.alg || obj.algorithm || '').toUpperCase();
        return !!(obj.data && (alg === 'AES-256-CBC' || alg.indexOf('AES-256') === 0));
    }

    async function unwrapTikToEarn(data) {
        if (!looksLikeTikToEarnEnvelope(data)) return data;
        const tte = global.TikToEarnBin;
        if (tte && typeof tte.decryptEnvelope === 'function') {
            return await tte.decryptEnvelope(data);
        }
        throw new Error((tte && tte.DECRYPT_FAIL_MSG) || 'ไฟล์ TikToEarn .bin นี้เข้ารหัสอยู่ — โหลดโมดูลถอดรหัสไม่สำเร็จ');
    }

    async function parseImportFile(jsonText) {
        let data = (typeof jsonText === 'string' || jsonText instanceof String)
            ? await decodeImportText(jsonText)
            : await unwrapTikToEarn(jsonText);
        const format = detectFormat(data);
        let converted;
        if (format === FORMAT.TOKCONTROL) converted = convertFromTokControl(data);
        else if (format === FORMAT.TIKFINITY) converted = convertFromTikfinity(data);
        else if (format === FORMAT.BETTERTOK) converted = convertFromBetterTok(data);
        else if (format === FORMAT.TIKTOEARN) converted = convertFromTikToEarn(data);
        else {
            // last resort: try TikToEarn then TikFinity then BetterTok then TokControl
            converted = convertFromTikToEarn(data);
            if (!converted.meta.actionCount && !converted.meta.eventCount && !converted.meta.soundCount) {
                converted = convertFromTikfinity(data);
            }
            if (!converted.meta.actionCount && !converted.meta.eventCount && !converted.meta.soundCount) {
                converted = convertFromBetterTok(data);
            }
            if (!converted.meta.actionCount && !converted.meta.eventCount && !converted.meta.soundCount) {
                converted = convertFromTokControl(data);
            }
            if (converted.meta.actionCount || converted.meta.eventCount || converted.meta.soundCount) {
                converted.format = converted.format || FORMAT.TIKFINITY;
            } else {
                converted.format = FORMAT.UNKNOWN;
            }
        }
        canonicalizeConverted(converted);
        return { format: converted.format || format, data, converted };
    }

    function looksLikeConfigName(name) {
        return /\.(json|tfc|tokconfig|txt)$/i.test(name || '') || /tiktoearn/i.test(name || '');
    }

    async function parseImportFiles(fileList) {
        const sniffApi = getMediaSniff();
        const files = Array.from(fileList || []);
        if (!files.length) throw new Error('ไม่ได้เลือกไฟล์');
        const expanded = [];
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const buf = new Uint8Array(await f.arrayBuffer());
            const info = sniffApi ? sniffApi.sniff(buf) : { kind: 'bin' };
            const rel = f.webkitRelativePath || f.name || 'file';
            if (info.kind === 'zip' || /\.zip$/i.test(f.name || '')) {
                if (!sniffApi || !sniffApi.unzip) throw new Error('อ่านไฟล์ ZIP ไม่ได้');
                const entries = await sniffApi.unzip(buf);
                entries.forEach((e) => {
                    expanded.push({
                        name: e.name,
                        bytes: e.bytes,
                        sniff: sniffApi.sniff(e.bytes)
                    });
                });
            } else {
                expanded.push({ name: rel, bytes: buf, sniff: info });
            }
        }

        function bytesToImportText(bytes) {
            if (sniffApi && typeof sniffApi.bytesToText === 'function') return sniffApi.bytesToText(bytes);
            try { return new TextDecoder('utf-8').decode(bytes); } catch (_) { return ''; }
        }
        const configs = [];
        const media = [];
        expanded.forEach((item) => {
            const kind = item.sniff && item.sniff.kind;
            if (kind === 'json' || kind === 'tfc' || looksLikeConfigName(item.name)) {
                configs.push(item);
                return;
            }
            if (kind === 'audio' || kind === 'image' || kind === 'video') {
                media.push(item);
                return;
            }
            if (/\.bin$/i.test(item.name)) {
                try {
                    const text = bytesToImportText(item.bytes);
                    const trimmed = String(text || '').trim();
                    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
                        configs.push(item);
                        return;
                    }
                } catch (_) {}
                media.push(item);
                return;
            }
            try {
                const text = bytesToImportText(item.bytes);
                const trimmed = String(text || '').trim();
                if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') configs.push(item);
                else media.push(item);
            } catch (_) {
                media.push(item);
            }
        });

        if (!configs.length) {
            throw new Error('ไม่พบไฟล์ตั้งค่า (.tfc / .json / TikToEarn .bin) — เลือกไฟล์ config หรือทั้งโฟลเดอร์ที่มีไฟล์สื่อ .bin');
        }

        let parsed = null;
        let lastErr = null;
        for (let i = 0; i < configs.length; i++) {
            try {
                const text = bytesToImportText(configs[i].bytes);
                parsed = await parseImportFile(text);
                if (parsed && parsed.converted) break;
            } catch (err) {
                lastErr = err;
            }
        }
        if (!parsed || !parsed.converted) {
            throw lastErr || new Error('อ่านไฟล์ตั้งค่าไม่สำเร็จ');
        }
        if (media.length) attachMediaLibrary(parsed.converted, media);
        canonicalizeConverted(parsed.converted);
        parsed.mediaAttached = media.length;
        return parsed;
    }

    function countExportSections(adv) {
        const ae = normalizeActionsEvents(adv && adv.actionsEvents);
        const sa = normalizeSoundAlerts(adv && adv.soundAlerts);
        return {
            actions: Object.keys(ae.actions).length,
            events: Object.keys(ae.events).length,
            soundAlerts: Object.keys(sa.rules).length
        };
    }

    function buildExportPayload(opts) {
        opts = opts || {};
        const sections = Object.assign({
            username: true,
            general: true,
            soundAlerts: true,
            actions: true,
            events: true
        }, opts.sections || {});

        const getAdv = global.getAdvConf || (() => global.advConf);
        const advFull = normalizeAdvConfSlice(deepClone(getAdv() || {}));
        const aeFull = normalizeActionsEvents(advFull.actionsEvents);
        const saFull = normalizeSoundAlerts(advFull.soundAlerts);

        const aeOut = emptyActionsEvents();
        aeOut.enabled = aeFull.enabled;
        aeOut.screens = deepClone(aeFull.screens);
        aeOut.timers = sections.actions || sections.events ? deepClone(aeFull.timers) : {};
        if (sections.actions) aeOut.actions = deepClone(aeFull.actions);
        if (sections.events) aeOut.events = deepClone(aeFull.events);

        const saOut = emptySoundAlerts();
        if (sections.soundAlerts) {
            Object.assign(saOut, deepClone(saFull));
        }

        const username = sections.username
            ? (global.currentUser?.tiktokUsername || global.currentUser?.uniqueId || global.currentUser?.username || null)
            : null;

        const general = sections.general ? {
            currentTheme: global.currentTheme || 'galaxy',
            targetWin: typeof global.targetWin !== 'undefined' ? global.targetWin : null,
            aiChatbotSettings: deepClone(global.aiChatbotSettings || {})
        } : null;

        const profiles = opts.includeProfiles && global.streamProfilesStore
            ? deepClone(global.streamProfilesStore)
            : null;

        return {
            format: 'tokcontrol',
            app: 'TokControl',
            tokcontrolVersion: 1,
            exportedAt: new Date().toISOString(),
            sections,
            username,
            general,
            advConf: {
                actionsEvents: aeOut,
                soundAlerts: saOut
            },
            streamProfiles: profiles,
            meta: {
                actionCount: Object.keys(aeOut.actions).length,
                eventCount: Object.keys(aeOut.events).length,
                soundCount: Object.keys(saOut.rules).length,
                activeProfileId: profiles ? profiles.activeId : null
            }
        };
    }

    function mergeMaps(base, incoming, mode) {
        if (mode === 'overwrite') return deepClone(incoming || {});
        const out = deepClone(base || {}) || {};
        Object.keys(incoming || {}).forEach((id) => {
            let nextId = id;
            if (out[nextId]) nextId = uid(id.split('_')[0] || 'item');
            out[nextId] = deepClone(incoming[id]);
            out[nextId].id = nextId;
            // Remap event actionIds if needed — handled by caller for events
        });
        return out;
    }

    function mergeActionsEvents(existing, incoming, mode, sections) {
        const sec = Object.assign({ actions: true, events: true }, sections || {});
        const base = normalizeActionsEvents(existing);
        const inc = normalizeActionsEvents(incoming);
        if (mode === 'overwrite') {
            const out = deepClone(base);
            if (sec.actions) out.actions = deepClone(inc.actions);
            if (sec.events) out.events = deepClone(inc.events);
            out.enabled = inc.enabled !== false;
            if (sec.actions || sec.events) {
                out.timers = Object.assign({}, out.timers || {}, inc.timers || {});
            }
            return normalizeActionsEvents(out);
        }

        const actions = deepClone(base.actions);
        const actionIdMap = {};
        if (sec.actions) {
            Object.keys(inc.actions).forEach((id) => {
                let nextId = id;
                if (actions[nextId]) nextId = uid('act');
                actionIdMap[id] = nextId;
                actions[nextId] = deepClone(inc.actions[id]);
                actions[nextId].id = nextId;
            });
        }
        const events = deepClone(base.events);
        if (sec.events) {
            Object.keys(inc.events).forEach((id) => {
                let nextId = id;
                if (events[nextId]) nextId = uid('ev');
                const ev = deepClone(inc.events[id]);
                ev.id = nextId;
                ev.actionIds = (ev.actionIds || []).map((aid) => actionIdMap[aid] || aid);
                events[nextId] = ev;
            });
        }
        return normalizeActionsEvents({
            enabled: true,
            actions,
            events,
            screens: base.screens,
            timers: Object.assign({}, base.timers, (sec.actions || sec.events) ? inc.timers : {})
        });
    }

    function mergeSoundAlerts(existing, incoming, mode) {
        const base = normalizeSoundAlerts(existing);
        const inc = normalizeSoundAlerts(incoming);
        if (mode === 'overwrite') return inc;
        return normalizeSoundAlerts({
            enabled: base.enabled,
            globalVolume: base.globalVolume,
            playOnOverlay: base.playOnOverlay,
            playMode: base.playMode,
            rules: mergeMaps(base.rules, inc.rules, 'merge')
        });
    }

    function formatLabel(format) {
        if (format === FORMAT.TIKFINITY) return 'TikFinity';
        if (format === FORMAT.BETTERTOK) return 'BetterTok Desktop';
        if (format === FORMAT.TOKCONTROL) return 'TokControl';
        if (format === FORMAT.TIKTOEARN) return 'TikToEarn';
        return 'Unknown';
    }

    global.TokSettingsIO = {
        FORMAT,
        deepClone,
        detectFormat,
        parseImportFile,
        parseImportFiles,
        decodeImportText,
        buildExportPayload,
        countExportSections,
        convertFromTikfinity,
        convertFromBetterTok,
        convertFromTikToEarn,
        convertFromTokControl,
        normalizeActionsEvents,
        normalizeSoundAlerts,
        normalizeAdvConfSlice,
        mergeActionsEvents,
        mergeSoundAlerts,
        filterConvertedBySections,
        emptyActionsEvents,
        emptySoundAlerts,
        formatLabel,
        uid
    };
})(typeof window !== 'undefined' ? window : globalThis);
