'use strict';

/**
 * YouTube Live Chat listener — resolve handle → live video → liveChatId, then poll.
 * Emits existing TikTok-shaped events so gacha / TTS / overlay keep working.
 */

const NOT_LIVE_MS = 40000;
const ERROR_BACKOFF_MS = 20000;
const FIRST_PAGE_MAX_AGE_MS = 20000;

function normalizeSettingsRow(row) {
    if (!row) {
        return {
            youtube_identifier: '',
            channel_id: '',
            channel_title: '',
            is_enabled: false,
            stream_token: '',
            updated_at: null
        };
    }
    return {
        youtube_identifier: row.youtube_identifier || '',
        channel_id: row.channel_id || '',
        channel_title: row.channel_title || '',
        is_enabled: !!(row.is_enabled === true || row.is_enabled === 1 || row.is_enabled === '1'),
        stream_token: row.stream_token || '',
        updated_at: row.updated_at || null
    };
}

function authorPayload(item) {
    const a = item.authorDetails || {};
    const uniqueId = a.channelId || a.displayName || 'youtube';
    return {
        uniqueId,
        nickname: a.displayName || uniqueId,
        avatar: a.profileImageUrl || '',
        userId: a.channelId || '',
        isFanClub: !!a.isChatSponsor,
        hasFanClubBadge: !!a.isChatSponsor,
        isSubscriber: !!a.isChatSponsor,
        isModerator: !!a.isChatModerator,
        platform: 'youtube'
    };
}

function superChatAmount(snippet) {
    const details = snippet.superChatDetails || snippet.superStickerDetails || {};
    const micros = Number(details.amountMicros) || 0;
    const amount = micros > 0 ? micros / 1e6 : 0;
    return {
        amount,
        display: details.amountDisplayString || (amount ? String(amount) : ''),
        currency: details.currency || '',
        diamondCount: Math.max(1, Math.round(amount) || 1)
    };
}

function createYoutubeLiveService({ io, db, youtube, enablePolling = true }) {
    const sessions = new Map();

    function publicStatus(userId) {
        const s = sessions.get(String(userId));
        if (!s) {
            return { connected: false, isLive: false, is_enabled: false, state: 'idle' };
        }
        return {
            connected: !!s.is_enabled,
            is_enabled: !!s.is_enabled,
            isLive: !!s.isLive,
            state: s.state || 'idle',
            youtube_identifier: s.youtube_identifier || '',
            channelId: s.channelId || '',
            channelTitle: s.channelTitle || '',
            videoId: s.videoId || '',
            videoTitle: s.videoTitle || '',
            viewers: s.viewers || 0,
            chatSource: s.chatSource || '',
            chatReady: !!(s.liveChatId || s.chatContinuation || s.chatSource === 'innertube'),
            error: s.error || '',
            message: s.message || ''
        };
    }

    function emitStatus(userId) {
        const s = sessions.get(String(userId));
        const token = s?.streamToken;
        if (!token || !io) return;
        const payload = publicStatus(userId);
        io.to(token).emit('youtube_status', payload);
    }

    function clearTimer(s) {
        if (s?.timer) {
            clearTimeout(s.timer);
            s.timer = null;
        }
    }

    function schedule(userId, ms) {
        const s = sessions.get(String(userId));
        if (!s || !s.is_enabled) return;
        clearTimer(s);
        s.timer = setTimeout(() => {
            tick(userId).catch((err) => {
                console.warn('[youtube-live]', err.message || err);
            });
        }, Math.max(2500, ms || NOT_LIVE_MS));
    }

    function emitMappedEvents(s, item) {
        const snippet = item.snippet || {};
        const type = snippet.type || '';
        const author = authorPayload(item);
        const publishedAt = snippet.publishedAt ? Date.parse(snippet.publishedAt) : Date.now();
        if (s.skipHistory && publishedAt && (Date.now() - publishedAt) > FIRST_PAGE_MAX_AGE_MS) return;

        const token = s.streamToken;
        if (!token || !io) return;

        if (type === 'textMessageEvent' || type === 'memberMilestoneChatEvent') {
            io.to(token).emit('tiktok_chat', {
                ...author,
                comment: snippet.displayMessage || snippet.textMessageDetails?.messageText || '',
                emotes: []
            });
        }

        if (type === 'superChatEvent' || type === 'superStickerEvent') {
            const money = superChatAmount(snippet);
            const giftName = type === 'superStickerEvent'
                ? `Super Sticker ${money.display}`.trim()
                : `Super Chat ${money.display}`.trim();
            io.to(token).emit('tiktok_gift', {
                ...author,
                giftName,
                giftId: type === 'superStickerEvent' ? 'yt-supersticker' : 'yt-superchat',
                giftIcon: author.avatar,
                diamondCount: money.diamondCount,
                repeatCount: 1,
                totalCoins: money.diamondCount,
                giftType: 0,
                repeatEnd: true,
                comment: snippet.displayMessage || '',
                platform: 'youtube'
            });
        }

        if (type === 'newSponsorEvent' || type === 'membershipGiftingEvent' || type === 'giftMembershipReceivedEvent') {
            io.to(token).emit('tiktok_follow', author);
            io.to(token).emit('youtube_member', {
                ...author,
                type,
                message: snippet.displayMessage || ''
            });
        }

        io.to(token).emit('youtube_event', {
            type,
            ...author,
            message: snippet.displayMessage || '',
            publishedAt: snippet.publishedAt || null
        });
    }

    function markWaiting(s, message) {
        s.isLive = false;
        s.liveChatId = '';
        s.pageToken = '';
        s.state = 'waiting';
        s.error = '';
        s.message = message || youtube.YT_WAITING_LIVE_MSG || 'ไม่พบห้องไลฟ์ หรือยังไม่ได้เปิดไลฟ์สด';
        emitStatus(s.userId);
    }

    function isNotLiveErr(err) {
        if (typeof youtube.isYoutubeNotLiveError === 'function') {
            return youtube.isYoutubeNotLiveError(err);
        }
        const msg = String(err && err.message || '');
        return Number(err && err.youtubeStatus) === 404 || /404|ไม่พบห้องไลฟ์|liveChatEnded|notFound/i.test(msg);
    }

    async function ensureLiveChat(s) {
        s.state = 'checking';
        s.error = '';
        s.message = 'Checking...';
        emitStatus(s.userId);

        try {
            if (!s.channelId) {
                console.log('[youtube-live] resolving channel', s.youtube_identifier);
                const ch = await youtube.resolveChannel(s.youtube_identifier);
                s.channelId = ch.channelId;
                s.channelTitle = ch.title || s.channelTitle;
                console.log('[youtube-live] resolved channel', {
                    identifier: s.youtube_identifier,
                    channelId: s.channelId,
                    title: s.channelTitle
                });
                await db.saveYoutubeLiveSettings(s.userId, {
                    channel_id: s.channelId,
                    channel_title: s.channelTitle
                });
            }

            // a) channelId ready → b) search.list live → c) videos.list liveChatId
            const live = await youtube.findActiveLiveVideo(s.channelId, {
                handle: s.youtube_identifier
            });
            if (!live?.videoId) {
                console.log('[youtube-live] no live broadcast', {
                    channelId: s.channelId,
                    handle: s.youtube_identifier
                });
                s.videoId = '';
                s.videoTitle = '';
                markWaiting(s);
                return false;
            }

            const details = await youtube.getLiveStreamingDetails(live.videoId);
            const liveChatId = String(details?.liveChatId || live.liveChatId || '').trim();
            const stillLive = !!(details?.isLive || details?.liveBroadcastContent === 'live' || liveChatId);

            if (!stillLive) {
                console.warn('[youtube-live] video is not a live broadcast with chat', {
                    videoId: live.videoId,
                    hasDetails: !!details,
                    liveBroadcastContent: details?.liveBroadcastContent || live.liveBroadcastContent || ''
                });
                s.videoId = live.videoId || '';
                s.videoTitle = live.title || details?.title || '';
                markWaiting(s, 'ไม่พบห้องไลฟ์ หรือยังไม่ได้เปิดไลฟ์สด');
                return false;
            }

            const chatChanged = s.liveChatId !== liveChatId;
            s.videoId = details?.videoId || live.videoId;
            s.videoTitle = details?.title || live.title || '';
            s.liveChatId = liveChatId;
            s.viewers = details?.concurrentViewers || live.concurrentViewers || 0;
            s.isLive = true;
            s.state = 'live';
            s.error = '';
            if (!liveChatId) {
                console.warn('[youtube-live] live video connected but activeLiveChatId is empty', {
                    videoId: s.videoId,
                    title: s.videoTitle,
                    liveBroadcastContent: details?.liveBroadcastContent || live.liveBroadcastContent || ''
                });
                s.message = s.videoTitle
                    ? `Live Found / Connected — ${s.videoTitle}`
                    : 'Live Found / Connected';
            } else {
                s.message = s.videoTitle
                    ? `Live Found / Connected — ${s.videoTitle}`
                    : 'Live Found / Connected';
                console.log('[youtube-live] connected', {
                    channelId: s.channelId,
                    videoId: s.videoId,
                    liveChatId: s.liveChatId,
                    title: s.videoTitle
                });
            }
            if (chatChanged) {
                s.pageToken = '';
                s.skipHistory = true;
                s.chatContinuation = '';
            }
            emitStatus(s.userId);
            return true;
        } catch (err) {
            console.warn('[youtube-live] ensureLiveChat', {
                channelId: s.channelId,
                status: err.youtubeStatus || '',
                reason: err.youtubeReason || '',
                message: err.message
            });
            if (/โควต้า|quota/i.test(String(err.message || ''))) {
                s.state = 'error';
                s.error = String(err.message || '');
                s.message = s.error;
                emitStatus(s.userId);
                return false;
            }
            if (/ไม่พบช่อง|กรุณากรอก/i.test(String(err.message || '')) && !isNotLiveErr(err)) {
                s.state = 'error';
                s.error = String(err.message || '');
                s.message = s.error;
                emitStatus(s.userId);
                return false;
            }
            s.videoId = s.videoId || '';
            s.videoTitle = s.videoTitle || '';
            markWaiting(s);
            return false;
        }
    }

    async function refreshLiveChatId(s) {
        if (!s?.videoId) return '';
        try {
            const details = await youtube.getLiveStreamingDetails(s.videoId);
            if (!details) return s.liveChatId || '';
            s.viewers = details.concurrentViewers || s.viewers || 0;
            if (details.title) s.videoTitle = details.title;
            const nextId = String(details.liveChatId || '').trim();
            const ended = details.liveBroadcastContent === 'none' && !nextId;
            if (ended) return null;
            if (nextId && nextId !== s.liveChatId) {
                console.log('[youtube-live] activeLiveChatId updated', {
                    videoId: s.videoId,
                    from: s.liveChatId ? `${String(s.liveChatId).slice(0, 16)}…` : '',
                    to: `${nextId.slice(0, 16)}…`
                });
                s.liveChatId = nextId;
                s.pageToken = '';
                s.skipHistory = true;
            } else if (!nextId) {
                console.warn('[youtube-live] videos.list has no activeLiveChatId', {
                    videoId: s.videoId,
                    liveBroadcastContent: details.liveBroadcastContent || ''
                });
            }
            return nextId;
        } catch (err) {
            console.warn('[youtube-live] refreshLiveChatId failed', err.message);
            return s.liveChatId || '';
        }
    }

    function keepConnected(s, extraMessage) {
        s.isLive = true;
        s.state = 'live';
        s.error = '';
        const base = s.videoTitle
            ? `Live Found / Connected — ${s.videoTitle}`
            : 'Live Found / Connected';
        s.message = extraMessage || base;
        emitStatus(s.userId);
    }

    async function tick(userId) {
        const s = sessions.get(String(userId));
        if (!s || !s.is_enabled) return;

        try {
            const canPollChat = !!(s.liveChatId || s.videoId);
            if (!canPollChat) {
                const ok = await ensureLiveChat(s);
                schedule(s.userId, (ok && (s.liveChatId || s.videoId)) ? 4000 : NOT_LIVE_MS);
                return;
            }

            if (!s.liveChatId && s.videoId) {
                s.chatSource = s.chatSource || 'innertube';
            }

            const page = await youtube.listLiveChatMessages(s.liveChatId, s.pageToken, {
                videoId: s.videoId,
                continuation: s.chatContinuation,
                source: s.chatSource || (!s.liveChatId ? 'innertube' : undefined)
            });
            if (page.source) s.chatSource = page.source;
            if (page.continuation) s.chatContinuation = page.continuation;
            if (page.unavailable) {
                console.warn('[youtube-live] chat poll unavailable, will retry', {
                    videoId: s.videoId,
                    liveChatId: s.liveChatId ? `${String(s.liveChatId).slice(0, 16)}…` : '',
                    status: page.status || 404,
                    reason: page.reason || '',
                    message: page.message || ''
                });
                s.pageToken = '';
                s.chatContinuation = '';
                const nextId = await refreshLiveChatId(s);
                if (nextId === null) {
                    markWaiting(s);
                    schedule(s.userId, NOT_LIVE_MS);
                    return;
                }
                keepConnected(s);
                schedule(s.userId, page.pollingIntervalMillis || 8000);
                return;
            }

            (page.items || []).forEach((item) => emitMappedEvents(s, item));
            s.skipHistory = false;
            s.pageToken = page.nextPageToken || s.pageToken;
            keepConnected(s);
            if (page.offlineAt) {
                console.log('[youtube-live] liveChatMessages offlineAt', page.offlineAt);
                const nextId = await refreshLiveChatId(s);
                if (nextId === null || !nextId) {
                    markWaiting(s);
                    schedule(s.userId, NOT_LIVE_MS);
                    return;
                }
                schedule(s.userId, NOT_LIVE_MS);
                return;
            }
            schedule(s.userId, page.pollingIntervalMillis || 5000);
        } catch (err) {
            const msg = String(err.message || err);
            console.warn('[youtube-live] tick error', {
                userId: s.userId,
                channelId: s.channelId,
                videoId: s.videoId || '',
                liveChatId: s.liveChatId ? `${String(s.liveChatId).slice(0, 16)}…` : '',
                status: err.youtubeStatus || '',
                reason: err.youtubeReason || '',
                message: msg
            });
            if (isNotLiveErr(err) || /liveChatEnded/i.test(msg) || /YouTube API error\s*404|\b404\b/i.test(msg)) {
                s.pageToken = '';
                if (s.videoId) {
                    const nextId = await refreshLiveChatId(s);
                    if (nextId !== null) {
                        keepConnected(s);
                        schedule(s.userId, 8000);
                        return;
                    }
                }
                markWaiting(s);
                schedule(s.userId, NOT_LIVE_MS);
                return;
            }
            if (/โควต้า|quota/i.test(msg)) {
                s.state = 'error';
                s.error = msg;
                s.message = msg;
                emitStatus(s.userId);
                schedule(s.userId, 120000);
                return;
            }
            if (s.isLive && s.videoId) {
                console.warn('[youtube-live] poll failed, keeping Connected and retrying', msg);
                keepConnected(s);
                schedule(s.userId, ERROR_BACKOFF_MS);
                return;
            }
            s.state = 'error';
            s.error = msg;
            s.message = msg;
            emitStatus(s.userId);
            schedule(s.userId, ERROR_BACKOFF_MS);
        }
    }

    async function start(userId, opts = {}) {
        const uid = String(userId);
        const saved = normalizeSettingsRow(await db.getYoutubeLiveSettings(uid));
        const identifier = String(opts.youtube_identifier != null ? opts.youtube_identifier : saved.youtube_identifier).trim();
        const enabled = opts.is_enabled != null ? !!opts.is_enabled : saved.is_enabled;
        let streamToken = opts.stream_token || saved.stream_token || '';
        if (!streamToken && typeof db.getUserById === 'function') {
            try {
                const user = await db.getUserById(uid);
                streamToken = user?.streamToken || '';
            } catch (_) { /* ignore */ }
        }

        let channelId = saved.channel_id || '';
        let channelTitle = saved.channel_title || '';
        let resolveError = '';

        if (identifier !== saved.youtube_identifier) {
            channelId = '';
            channelTitle = '';
        }

        if (enabled && identifier) {
            try {
                const ch = await youtube.resolveChannel(identifier);
                channelId = ch.channelId;
                channelTitle = ch.title || channelTitle;
                console.log('[youtube-live] saved channel', { identifier, channelId, channelTitle });
            } catch (err) {
                resolveError = err.message || String(err);
                channelId = '';
                channelTitle = '';
            }
        }

        const row = await db.saveYoutubeLiveSettings(uid, {
            youtube_identifier: identifier,
            channel_id: channelId,
            channel_title: channelTitle,
            is_enabled: enabled,
            stream_token: streamToken
        });

        const prev = sessions.get(uid);
        clearTimer(prev);

        if (!enabled) {
            sessions.delete(uid);
            if (streamToken && io) {
                io.to(streamToken).emit('youtube_status', {
                    connected: false,
                    is_enabled: false,
                    isLive: false,
                    state: 'idle',
                    youtube_identifier: identifier,
                    channelId,
                    channelTitle,
                    message: 'ปิด YouTube Live แล้ว'
                });
            }
            return { settings: row, status: publicStatus(uid), warning: resolveError || undefined };
        }

        if (!identifier) {
            return {
                settings: row,
                status: { ...publicStatus(uid), state: 'error', error: 'กรุณากรอก Channel ID หรือ @handle' },
                error: 'กรุณากรอก Channel ID หรือ @handle'
            };
        }

        if (resolveError) {
            const errSession = {
                userId: uid,
                is_enabled: true,
                youtube_identifier: identifier,
                channelId: '',
                channelTitle: '',
                streamToken,
                state: 'error',
                error: resolveError,
                message: resolveError,
                isLive: false
            };
            sessions.set(uid, errSession);
            emitStatus(uid);
            return { settings: row, status: publicStatus(uid), error: resolveError };
        }

        sessions.set(uid, {
            userId: uid,
            is_enabled: true,
            youtube_identifier: identifier,
            channelId,
            channelTitle,
            streamToken,
            videoId: '',
            videoTitle: '',
            liveChatId: '',
            pageToken: '',
            chatContinuation: '',
            chatSource: '',
            skipHistory: true,
            viewers: 0,
            isLive: false,
            state: 'checking',
            error: '',
            message: 'Checking...',
            timer: null
        });
        emitStatus(uid);
        if (!enablePolling) {
            const s = sessions.get(uid);
            if (s) {
                s.state = 'idle';
                s.message = 'บันทึกแล้ว — ฟังแชททำงานที่แอปเดสก์ท็อป';
                emitStatus(uid);
            }
            return { settings: row, status: publicStatus(uid) };
        }
        schedule(uid, 400);
        return { settings: row, status: publicStatus(uid) };
    }

    async function stop(userId) {
        return start(userId, { is_enabled: false });
    }

    async function restoreEnabled() {
        if (!enablePolling) return;
        if (typeof db.listEnabledYoutubeLiveSettings !== 'function') return;
        const rows = await db.listEnabledYoutubeLiveSettings();
        for (const row of rows || []) {
            try {
                await start(row.userId, {
                    youtube_identifier: row.youtube_identifier,
                    is_enabled: true,
                    stream_token: row.stream_token
                });
            } catch (err) {
                console.warn('[youtube-live] restore failed', row.userId, err.message);
            }
        }
    }

    async function getSettings(userId) {
        const row = normalizeSettingsRow(await db.getYoutubeLiveSettings(String(userId)).catch(() => null));
        return {
            settings: row,
            status: publicStatus(userId),
            configured: true,
            hasApiKey: typeof youtube.hasApiKey === 'function' ? youtube.hasApiKey() : youtube.isConfigured()
        };
    }

    return {
        normalizeSettingsRow,
        publicStatus,
        getSettings,
        start,
        stop,
        restoreEnabled,
        getStatus: publicStatus
    };
}

function registerYoutubeLiveRoutes(app, service, resolveAuthContextFromRequest) {
    async function requireUser(req, res) {
        const ctx = await resolveAuthContextFromRequest(req);
        if (!ctx?.userId) {
            res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            return null;
        }
        return ctx;
    }

    app.get('/api/youtube/live/settings', async (req, res) => {
        try {
            const ctx = await requireUser(req, res);
            if (!ctx) return;
            const data = await service.getSettings(ctx.userId);
            res.json({ success: true, ...data });
        } catch (err) {
            res.status(500).json({ error: err.message || 'โหลดตั้งค่า YouTube ไม่สำเร็จ' });
        }
    });

    app.get('/api/youtube/live/status', async (req, res) => {
        try {
            const ctx = await requireUser(req, res);
            if (!ctx) return;
            const data = await service.getSettings(ctx.userId);
            res.json({ success: true, status: data.status, configured: data.configured });
        } catch (err) {
            res.status(500).json({ error: err.message || 'โหลดสถานะ YouTube ไม่สำเร็จ' });
        }
    });

    app.post('/api/youtube/live/settings', async (req, res) => {
        try {
            const ctx = await requireUser(req, res);
            if (!ctx) return;
            const body = req.body || {};
            const identifier = String(body.youtube_identifier != null ? body.youtube_identifier : '').trim();
            const enabled = body.is_enabled === true || body.is_enabled === 1 || body.is_enabled === '1';
            const streamToken = ctx.streamToken || body.stream_token || '';

            if (enabled && !identifier) {
                return res.status(400).json({ error: 'กรุณากรอก Channel ID หรือ @handle' });
            }

            const result = await service.start(ctx.userId, {
                youtube_identifier: identifier,
                is_enabled: enabled,
                stream_token: streamToken
            });
            if (result.error && enabled) {
                return res.status(400).json({
                    success: false,
                    error: result.error,
                    settings: result.settings,
                    status: result.status,
                    configured: true,
                    hasApiKey: require('./youtube').hasApiKey()
                });
            }
            res.json({
                success: true,
                settings: result.settings,
                status: result.status,
                configured: true,
                hasApiKey: require('./youtube').hasApiKey(),
                warning: result.warning || undefined
            });
        } catch (err) {
            const msg = err.message || 'บันทึกตั้งค่า YouTube ไม่สำเร็จ';
            const code = /ไม่พบช่อง|กรุณากรอก|API key/i.test(msg) ? 400 : 500;
            res.status(code).json({ error: msg });
        }
    });
}

module.exports = {
    createYoutubeLiveService,
    normalizeSettingsRow,
    registerYoutubeLiveRoutes
};
