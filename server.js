const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const crypto = require('crypto');

// โหลด .env / resources/app.env (Spotify + OAuth keys สำหรับตัวติดตั้ง)
try {
    require('./load-env').loadEnv();
} catch (e) {
    console.warn('[env] load failed:', e?.message || e);
}

let TikTokLiveConnection;
let RoomIdRouteConfig;
let IsLiveRouteConfig;
let WebcastEvent;
let ControlEvent;
async function initTikTokConnector() {
    try {
        const module = await import('tiktok-live-connector');
        TikTokLiveConnection = module.TikTokLiveConnection;
        RoomIdRouteConfig = module.RoomIdRouteConfig;
        IsLiveRouteConfig = module.IsLiveRouteConfig;
        WebcastEvent = module.WebcastEvent;
        ControlEvent = module.ControlEvent;
        // เหมือน cloud_server / แนวทางที่เสถียรกว่า: ไม่พึ่ง Euler ดึง roomId
        if (RoomIdRouteConfig) RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
        if (IsLiveRouteConfig) IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;
        console.log("TikTok Live Connector initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize TikTok Live Connector:", err);
    }
}
initTikTokConnector().catch(console.error);
const db = require('./database');
const spotify = require('./spotify');
const youtube = require('./youtube');
const { createYoutubeLiveService, registerYoutubeLiveRoutes } = require('./youtube_live');
const oauthAuth = require('./oauth_auth');
const battleGolfBridge = require('./js/battle-golf-bridge');
const { syncSharedGiftsToLocal, upsertTikTokGift, findExistingGift, hashGiftName, resolveKnownGiftId, extractGiftIconUrl, pickFirstImageUrl, lookupRoomGiftMeta } = require('./gifts_sync');
const {
    getChannelEmotes,
    refreshChannelEmotes,
    upsertEmotesFromLive,
    extractEmotesFromLiveEvent,
    extractEmotesFromChatEvent
} = require('./emotes_cache');
const { registerOverlayRoutes, setActiveOverlaySession } = require('./overlay_routes');
const { registerWidgetRoutes } = require('./widget_routes');
const registerAssetRoutes = require('./asset_routes');
const { resolveUserIdFromRequest, resolveAuthContextFromRequest } = require('./auth_token');
const { registerPaymentRoutes } = require('./payments');
const {
    getGameCenterFlags,
    canAccessGameCenter,
    entitlementsForApi,
    gamesAccessForApi,
    mergeGameCenterEntitlement,
    mergeGameEntitlement,
    revokeGameCenterEntitlement,
    getSignupProTrialGrant,
    buildSignupProTrialBackfill,
    buildPassToProConversion,
    isValidUnlockGameId,
    gameIdFromPromoScopes,
    GAME_UNLOCK_LABELS
} = require('./game-center-access');
const {
    createFanClubRegistry,
    buildChatPayload,
    extractChatIdentity,
    isHeartMeGift,
    chatUserHasFanClubBadge,
    extractTeamMemberLevel,
    extractSubscriberFlag,
    extractSubscriberLevel,
    analyzeChatTeamStatus,
    normalizeWebcastGift,
    extractTotalLikeCount
} = require('./tiktok_chat_helpers');
const { getJwtSecret, getAdminSeedPassword, getMcBridgeToken, getGiftsSyncKey } = require('./auth_secrets');
const { isAdminAccount, resolveAccountRole } = require('./admin_auth');
const { registerVerifyPinRoute } = require('./admin_pin');
const { authRateLimitMiddleware } = require('./auth_rate_limit');
const { applySecurityHeaders, validatePasswordPolicy, validateUsernamePolicy } = require('./security_middleware');
const { blockSensitiveStatic } = require('./static_guard');
const { registerAuthEmailRoutes, validateEmailAddress } = require('./auth_email_routes');
const { registerProfileRoutes } = require('./profile_routes');
const { registerAchievementAdminRoutes } = require('./achievement_admin_routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8
});

const JWT_SECRET = getJwtSecret();
const PORT = process.env.PORT || 3000;
const DEBUG_EVENTS = process.env.DEBUG_EVENTS === '1';
const DEBUG_GIFTS = process.env.DEBUG_GIFTS === '1';
const MC_BRIDGE_TOKEN = (() => {
    try { return String(getMcBridgeToken() || '').trim(); } catch (e) { return ''; }
})();

/** ตรวจ JWT ของผู้ใช้ — รองรับ token จาก Cloud (login/profile ไป Cloud แต่ MC อยู่ local) */
async function requireUserAuth(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' });
        return null;
    }
    try {
        const ctx = await resolveAuthContextFromRequest(req);
        if (ctx?.userId != null) {
            return {
                userId: ctx.userId,
                username: ctx.username || undefined,
                streamToken: ctx.streamToken || undefined
            };
        }
    } catch (e) {
        console.warn('[auth] requireUserAuth:', e.message);
    }
    res.status(401).json({ error: 'token ไม่ถูกต้องหรือหมดอายุ' });
    return null;
}

function appendRuntimeLog(fileName, line) {
    if (fileName === 'debug_events.log' && !DEBUG_EVENTS) return;
    if (fileName === 'chat_gift_debug.log' && !DEBUG_GIFTS) return;
    try {
        fs.appendFileSync(path.join(__dirname, fileName), line);
    } catch (e) {}
}

app.use(cors({
    origin: (origin, callback) => {
        // Electron / same-origin / server-to-server often send no Origin
        if (!origin) return callback(null, true);
        const allow = String(process.env.CORS_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const defaults = [
            'http://127.0.0.1:3000',
            'http://localhost:3000',
            'https://tokcontrol.com',
            'https://www.tokcontrol.com'
        ];
        const list = allow.length ? allow : defaults;
        if (list.includes('*') || list.includes(origin)) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
}));
app.use(applySecurityHeaders);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '18mb' }));
app.use(express.urlencoded({ limit: process.env.JSON_BODY_LIMIT || '18mb', extended: true }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
    }
    next();
});
app.get('/profile/:username', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get(['/profile', '/profile/'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/vendor/crypto-js.js', (_req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'node_modules', 'crypto-js', 'crypto-js.js'));
});
app.use(blockSensitiveStatic);
app.use(express.static(path.join(__dirname)));

// ที่เก็บการเชื่อมต่อ TikTok Live ของสตรีมเมอร์แต่ละคน
// โครงสร้าง: { [userId]: WebcastPushConnection }
const activeTikTokConnections = {};
const activeTiktokSessions = {};
let overlayTestUserSeq = 150;
const activeTiktokWindows = {};
const activeGiftGalleries = {};
const fanClubRegistry = createFanClubRegistry({
    cachePath: path.join(__dirname, 'data', 'team_members_cache.json')
});
const recentBrowserGiftKeys = new Map();
const recentGiftRoomKeys = new Map();
const { createGiftEventGuard } = require('./gift_event_guard');
const serverGiftEmitGuard = createGiftEventGuard({ debounceMs: 2000, endSettleMs: 700, softDedupeMs: 4000, dedupeTtlMs: 20000 });

function shouldEmitGiftToRoom(roomToken, giftPayload, ttlMs = 4000) {
    if (!roomToken || !giftPayload) return false;
    const msgId = giftPayload.msgId || giftPayload.messageId || '';
    const user = String(giftPayload.uniqueId || '').toLowerCase().replace(/^@+/, '');
    const gname = String(giftPayload.giftName || '').toLowerCase().trim();
    const gid = String(giftPayload.giftId || '').trim();
    const rc = Math.max(1, Number(giftPayload.repeatCount) || 1);
    // Soft key by user+name — กัน Direct API + Browser เบิ้ลคนละ giftId
    const softKey = `${roomToken}:soft:${user}:${gname || gid || 'g'}`;
    const key = msgId ? `${roomToken}:msg:${msgId}` : softKey;
    const now = Date.now();
    const prevSoft = recentGiftRoomKeys.get(softKey);
    if (prevSoft && now - prevSoft < ttlMs) {
        const prevRc = recentGiftRoomKeys.get(softKey + ':rc') || 0;
        if (rc <= prevRc) return false;
    }
    const prev = recentGiftRoomKeys.get(key);
    if (prev && now - prev < ttlMs && key !== softKey) return false;
    recentGiftRoomKeys.set(key, now);
    recentGiftRoomKeys.set(softKey, now);
    recentGiftRoomKeys.set(softKey + ':rc', rc);
    if (recentGiftRoomKeys.size > 2000) {
        for (const [k, t] of recentGiftRoomKeys) {
            if (typeof t === 'number' && now - t > ttlMs * 2 && !String(k).endsWith(':rc')) {
                recentGiftRoomKeys.delete(k);
                recentGiftRoomKeys.delete(k + ':rc');
            }
        }
    }
    return true;
}

function emitTikTokGiftCoalesced(token, payload, opts = {}) {
    if (!token || !payload) return;
    serverGiftEmitGuard.enqueue(payload, (finalGift) => {
        if (!shouldEmitGiftToRoom(token, finalGift)) return;
        try {
            if (typeof opts.onFlush === 'function') opts.onFlush(finalGift);
        } catch (e) {
            console.warn('[gift coalesce] onFlush error:', e.message);
        }
        io.to(token).emit('tiktok_gift', finalGift);
    });
}

function shouldEmitBrowserGift(sessionUserId, data) {
    // Always allow into coalesce buffer — mid-combo updates must raise repeatCount.
    // Only drop identical probe bursts within a few hundred ms.
    const msgId = data?.msgId || data?.messageId || '';
    const rc = Math.max(1, Number(data?.repeatCount) || 1);
    const key = msgId
        ? `${sessionUserId}:msg:${msgId}`
        : `${sessionUserId}:${data?.uniqueId || ''}:${String(data?.giftId || data?.giftName || '').toLowerCase()}:x${rc}`;
    const now = Date.now();
    const prev = recentBrowserGiftKeys.get(key);
    if (prev && now - prev < 350) return false;
    recentBrowserGiftKeys.set(key, now);
    if (recentBrowserGiftKeys.size > 800) {
        for (const [k, t] of recentBrowserGiftKeys) {
            if (now - t > 30000) recentBrowserGiftKeys.delete(k);
        }
    }
    return true;
}

function buildAdminStreamerEntry(user, meta) {
    const tiktokUsername = meta.tiktokUsername || meta.username || '';
    const tiktokNickname = meta.nickname || meta.tiktokNickname || tiktokUsername;
    const tiktokAvatar = meta.avatar || meta.tiktokAvatar || (tiktokUsername
        ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(tiktokUsername)}`
        : '');
    return {
        username: user.username,
        tiktokUsername,
        tiktokNickname,
        tiktokAvatar,
        pandyAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username)}&backgroundColor=bc13fe`
    };
}

async function collectActiveLiveStreamers() {
    const list = [];
    const seenUserIds = new Set();

    for (const [userId, connection] of Object.entries(activeTikTokConnections)) {
        if (!connection.isLive) continue;
        const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
        if (!user) continue;
        seenUserIds.add(String(userId));
        list.push(buildAdminStreamerEntry(user, {
            username: connection.username,
            tiktokUsername: connection.username,
            nickname: connection.nickname,
            avatar: connection.avatar
        }));
    }

    for (const session of Object.values(activeTiktokSessions)) {
        if (!session.isLive || !session.userId || seenUserIds.has(String(session.userId))) continue;
        const user = await db.get('SELECT username FROM users WHERE id = ?', [session.userId]);
        if (!user) continue;
        seenUserIds.add(String(session.userId));
        list.push(buildAdminStreamerEntry(user, {
            tiktokUsername: session.tiktokUsername || session.username,
            nickname: session.nickname,
            avatar: session.avatar
        }));
    }

    return list;
}

const GIFT_GALLERY_CLASS_LABELS = {
    2000: 'A1', 1900: 'A2', 1800: 'A3',
    1500: 'B1', 1400: 'B2', 1300: 'B3', 1200: 'B4', 1100: 'B5',
    1000: 'C1', 900: 'C2', 800: 'C3', 700: 'C4', 600: 'C5',
    500: 'D1', 400: 'D2', 300: 'D3', 200: 'D4', 100: 'D5'
};

function giftGalleryClassLabel(classType, anchorLeague, galleryLeague) {
    if (anchorLeague) return String(anchorLeague);
    if (classType && GIFT_GALLERY_CLASS_LABELS[classType]) return GIFT_GALLERY_CLASS_LABELS[classType];
    if (galleryLeague) return String(galleryLeague);
    return '—';
}

function parseGiftGalleryGiftItem(g, receivedInStream) {
    const giftId = String(g.gift_id || g.giftId || g.id || '');
    const goalCount = parseInt(g.goal_count || g.sponsorship_require_count || g.goalCount || 0) || 0;
    const currentSent = parseInt(g.current_sent_count || g.currentSentCount || 0) || 0;
    const sponsored = !!(g.sponsored || g.lit);
    const received = sponsored || currentSent > 0 || !!receivedInStream;
    return {
        giftId,
        giftName: g.name || g.giftName || 'Gift',
        giftIcon: g.image_url || g.imageUrl || g.giftIcon || g.unlighted_image_url || '',
        unlitIcon: g.unlighted_image_url || g.unlightedImageUrl || '',
        coinPrice: parseInt(g.coin_price || g.diamond_count || g.diamondCount || 0) || 0,
        goalCount,
        currentSentCount: currentSent,
        sponsored,
        received,
        count: receivedInStream ? (receivedInStream.count || currentSent || 1) : currentSent,
        tagType: g.gallery_gift_tag_type != null ? g.gallery_gift_tag_type : (g.tagType != null ? g.tagType : null)
    };
}

function buildGiftGalleryPayload(raw, streamReceivedMap) {
    if (!raw) return null;
    const dataCandidates = [raw, raw.data, raw.data?.data, raw.response?.data].filter(Boolean);
    for (const data of dataCandidates) {
        if (!data || typeof data !== 'object') continue;
        const giftsRaw = data.normal_gifts || data.gifts;
        if (!Array.isArray(giftsRaw) || !giftsRaw.length) continue;

        const classType = data.class_type || data.classType || null;
        const tierLabel = giftGalleryClassLabel(classType, data.anchor_league || data.anchorLeague, data.gallery_league || data.galleryLeague);
        const gifts = giftsRaw.map(g => {
            const giftId = String(g.gift_id || g.giftId || g.id || '');
            const receivedInStream = streamReceivedMap && streamReceivedMap[giftId];
            return parseGiftGalleryGiftItem(g, receivedInStream);
        });

        const tierMap = {};
        gifts.forEach(g => {
            const subKey = g.tagType != null ? String(g.tagType) : '0';
            if (!tierMap[subKey]) tierMap[subKey] = { tagType: g.tagType, gifts: [] };
            tierMap[subKey].gifts.push(g);
        });
        const tiers = Object.values(tierMap).map((t, i) => ({
            tierLabel: Object.keys(tierMap).length > 1 ? `${tierLabel}-${i + 1}` : tierLabel,
            classType,
            anchorLeague: data.anchor_league || data.anchorLeague || tierLabel,
            galleryLeague: data.gallery_league || data.galleryLeague || '',
            gifts: t.gifts
        }));

        return {
            tierLabel,
            classType,
            anchorLeague: data.anchor_league || data.anchorLeague || tierLabel,
            galleryLeague: data.gallery_league || data.galleryLeague || '',
            periodStartsAt: data.current_period_starts_at || data.period_starts_at || data.periodStartsAt || null,
            periodEndsAt: data.current_period_ends_at || data.period_ends_at || data.periodEndsAt || null,
            totalGiftCount: data.total_gift_count || gifts.length,
            litGiftCount: gifts.filter(g => g.received).length,
            tiers,
            gifts,
            fetchedAt: new Date().toISOString(),
            source: raw.source || 'tiktok'
        };
    }
    return null;
}

function giftListItemIcon(g) {
    if (g.image?.url_list?.[0]) return g.image.url_list[0];
    if (g.icon?.url_list?.[0]) return g.icon.url_list[0];
    if (g.image?.urlList?.[0]) return g.image.urlList[0];
    if (g.icon?.urlList?.[0]) return g.icon.urlList[0];
    return '';
}

function isGalleryGiftFromList(g) {
    if (g.is_gallery_gift === true || g.isGalleryGift === true) return true;
    if (g.gift_label_icon || g.giftLabelIcon) return true;
    if (g.gift_label_type || g.giftLabelType) return true;
    if (g.gift_sponsor_info || g.giftSponsorInfo) return true;
    if (g.disable_gallery_banner === false && g.gift_label_type != null) return true;
    return false;
}

function normalizeRoomGiftForGallery(g) {
    const giftId = String(g.id || g.gift_id || g.giftId || '');
    const sponsor = g.gift_sponsor_info || g.giftSponsorInfo || {};
    const currentSent = parseInt(sponsor.current_count || sponsor.currentCount || g.current_sent_count || 0) || 0;
    const sponsored = !!(sponsor.sponsor_id || sponsor.sponsorId || g.sponsored);
    return {
        gift_id: giftId,
        giftId,
        name: g.name || g.giftName || 'Gift',
        image_url: giftListItemIcon(g),
        unlighted_image_url: giftListItemIcon(g),
        coin_price: parseInt(g.diamond_count || g.diamondCount || g.cost || 0) || 0,
        goal_count: parseInt(sponsor.left_count_to_sponsor || sponsor.leftCountToSponsor || 0) + currentSent || 1,
        current_sent_count: currentSent,
        sponsored,
        lit: sponsored || currentSent > 0,
        gallery_gift_tag_type: g.gift_label_type != null ? g.gift_label_type : (g.giftLabelType != null ? g.giftLabelType : null)
    };
}

function extractGalleryGiftsFromList(gifts) {
    if (!Array.isArray(gifts)) return [];
    const flagged = gifts.filter(isGalleryGiftFromList).map(normalizeRoomGiftForGallery);
    if (flagged.length) return flagged;
    const sorted = [...gifts].sort((a, b) =>
        (parseInt(b.diamond_count || b.diamondCount || 0) - parseInt(a.diamond_count || a.diamondCount || 0))
    );
    const picked = [];
    const buckets = [
        { label: 'A', min: 500 },
        { label: 'B', min: 100 },
        { label: 'C', min: 30 },
        { label: 'D', min: 5 }
    ];
    buckets.forEach((bucket, bi) => {
        const max = bi === 0 ? Infinity : buckets[bi - 1].min;
        const inBucket = sorted.filter(g => {
            const c = parseInt(g.diamond_count || g.diamondCount || 0) || 0;
            return c >= bucket.min && c < max;
        });
        inBucket.slice(0, 4).forEach(g => picked.push(normalizeRoomGiftForGallery(g)));
    });
    return picked.slice(0, 16);
}

function buildGalleryFromRoomGiftList(gifts, username, classTypeHint) {
    const galleryGifts = extractGalleryGiftsFromList(gifts);
    if (!galleryGifts.length) return null;
    const avgCoins = galleryGifts.reduce((s, g) => s + (g.coin_price || 0), 0) / galleryGifts.length;
    let classType = classTypeHint || null;
    if (!classType) {
        if (avgCoins >= 500) classType = 2000;
        else if (avgCoins >= 200) classType = 1500;
        else if (avgCoins >= 80) classType = 1000;
        else if (avgCoins >= 20) classType = 600;
        else classType = 300;
    }
    const payload = buildGiftGalleryPayload({
        data: {
            class_type: classType,
            anchor_league: giftGalleryClassLabel(classType),
            gifts: galleryGifts
        },
        source: 'room_gifts'
    }, null);
    if (payload) payload.username = username;
    return payload;
}

const pendingGalleryFetches = {};

async function fetchTikTokGiftGallery(tiktokConnect, username, roomId, roomGifts) {
    const paths = ['gift/gallery/', 'gift/gallery/info/', 'gift/gallery_entrance/', 'gift/gallery/entrance/'];
    const paramSets = [
        { ...tiktokConnect.webClient.clientParams, room_id: roomId },
        { ...tiktokConnect.webClient.clientParams, room_id: roomId, anchor_id: username },
        { ...tiktokConnect.webClient.clientParams, room_id: roomId, unique_id: username }
    ];
    for (const apiPath of paths) {
        for (const params of paramSets) {
            for (const signRequest of [false, true]) {
                try {
                    const res = await tiktokConnect.webClient.getJsonObjectFromWebcastApi(apiPath, params, signRequest);
                    const payload = buildGiftGalleryPayload(res, null);
                    if (payload) {
                        console.log(`Gift gallery fetched via ${apiPath} (signed=${signRequest}) for @${username}: tier ${payload.tierLabel}, ${payload.gifts.length} gifts`);
                        return payload;
                    }
                } catch (err) {
                    // try next
                }
            }
        }
    }
    if (process.env.SIGN_API_KEY || process.env.EULER_API_KEY) {
        try {
            const { fetchRoomGiftGalleryFromEulerRoute } = await import('tiktok-live-connector');
            const res = await fetchRoomGiftGalleryFromEulerRoute({
                uniqueId: username,
                webClient: tiktokConnect.webClient,
                apiClient: tiktokConnect.webClient.eulerApiInstance
            });
            const payload = buildGiftGalleryPayload(res, null);
            if (payload) {
                payload.source = 'euler';
                return payload;
            }
        } catch (err) {
            console.warn(`Euler gift gallery fetch failed for @${username}:`, err.message);
        }
    }
    if (roomGifts?.length) {
        const fallback = buildGalleryFromRoomGiftList(roomGifts, username);
        if (fallback) {
            console.log(`Gift gallery fallback from room gifts for @${username}: tier ${fallback.tierLabel}, ${fallback.gifts.length} gifts`);
            return fallback;
        }
    }
    return null;
}

async function fetchGiftGalleryBackground(userId, username, token) {
    if (!username || !TikTokLiveConnection) return null;
    if (pendingGalleryFetches[userId]) return pendingGalleryFetches[userId];

    pendingGalleryFetches[userId] = (async () => {
        let tempConnect = null;
        try {
            console.log(`Background gift gallery fetch starting for user ${userId} (@${username})`);
            tempConnect = new TikTokLiveConnection(username, { enableExtendedGiftInfo: false });
            const state = await tempConnect.connect();
            const roomId = state.roomId;
            let roomGifts = [];
            try {
                const res = await tempConnect.webClient.getJsonObjectFromWebcastApi('gift/list/', {
                    ...tempConnect.webClient.clientParams,
                    room_id: roomId
                }, false);
                if (res?.data?.gifts) roomGifts = res.data.gifts;
            } catch (e) {
                console.warn('Background gift list fetch failed:', e.message);
            }
            const galleryData = await fetchTikTokGiftGallery(tempConnect, username, roomId, roomGifts);
            if (galleryData) {
                emitGiftGalleryLoaded(userId, token, galleryData);
                return galleryData;
            }
            console.log(`Background gift gallery fetch: no data for @${username}`);
            return null;
        } catch (err) {
            console.warn(`Background gift gallery fetch failed for @${username}:`, err.message);
            return null;
        } finally {
            try { if (tempConnect) tempConnect.disconnect(); } catch (e) {}
            delete pendingGalleryFetches[userId];
        }
    })();
    return pendingGalleryFetches[userId];
}

function emitGiftGalleryLoaded(userId, token, gallery) {
    activeGiftGalleries[userId] = gallery;
    if (token) io.to(token).emit('gift_gallery_loaded', gallery);
}

function emitChannelEmotesLoaded(token, payload) {
    if (!token || !payload) return;
    io.to(token).emit('channel_emotes_loaded', payload);
}

function emitTeamMembersSynced(token, userId, tiktokUsername) {
    if (!token || !fanClubRegistry?.snapshot) return;
    try {
        const snap = fanClubRegistry.snapshot(userId, tiktokUsername);
        io.to(token).emit('team_members_synced', {
            userId: String(userId || ''),
            username: String(tiktokUsername || '').replace(/^@+/, '').toLowerCase(),
            members: snap.members || [],
            levels: snap.levels || {}
        });
        console.log(`[team_members] synced ${snap.members?.length || 0} members → room ${token}`);
    } catch (e) {
        console.warn('[team_members] sync failed:', e.message);
    }
}

async function syncChannelEmotesForUser(tiktokConnect, username, roomId, token, options = {}) {
    const key = String(username || '').trim().replace(/^@+/, '').toLowerCase();
    if (!key) return getChannelEmotes('');
    const result = await refreshChannelEmotes(tiktokConnect, key, roomId, options);
    if (token) {
        emitChannelEmotesLoaded(token, {
            username: key,
            emotes: result.emotes || [],
            lastUpdated: result.lastUpdated || null,
            fromCache: !!result.fetchFailed || result.fromCache !== false,
            fetchFailed: !!result.fetchFailed
        });
    }
    return result;
}

function markGiftGalleryGiftReceived(userId, giftId, count, giftName) {
    const gallery = activeGiftGalleries[userId];
    if (!gallery) return;
    const id = String(giftId || '');
    const nameLower = (giftName || '').toLowerCase().trim();
    let changed = false;
    const markGift = (g) => {
        const matchId = id && String(g.giftId) === id;
        const matchName = nameLower && (g.giftName || '').toLowerCase().trim() === nameLower;
        if (!matchId && !matchName) return;
        g.received = true;
        g.sponsored = true;
        g.count = (g.count || 0) + (count || 1);
        g.currentSentCount = Math.max(g.currentSentCount || 0, g.count);
        changed = true;
    };
    (gallery.gifts || []).forEach(markGift);
    (gallery.tiers || []).forEach(t => (t.gifts || []).forEach(markGift));
    if (changed) {
        gallery.litGiftCount = (gallery.gifts || []).filter(g => g.received).length;
        const session = Object.values(activeTiktokSessions).find(s => s.userId === userId);
        if (session?.token) io.to(session.token).emit('gift_gallery_loaded', gallery);
    }
}

// ฟังก์ชั่นสำหรับสร้างบัญชีแอดมินเริ่มต้น (ตั้งรหัสผ่านผ่าน ADMIN_SEED_PASSWORD ใน .env)
const seedAdmin = async () => {
    try {
        const adminUser = await db.get('SELECT * FROM users WHERE username = ?', ['Pandy_Puncheroo']);
        const seedPassword = getAdminSeedPassword();
        if (!adminUser && seedPassword) {
            const hashedPassword = await bcrypt.hash(seedPassword, 10);
            const streamToken = crypto.randomBytes(16).toString('hex');
            await db.run(
                'INSERT INTO users (username, password, streamToken, isPro, role) VALUES (?, ?, ?, 1, ?)',
                ['Pandy_Puncheroo', hashedPassword, streamToken, 'admin']
            );
            console.log('Seeded admin account Pandy_Puncheroo successfully!');
        } else if (adminUser && seedPassword && process.env.ADMIN_SYNC_PASSWORD === '1') {
            const hashedPassword = await bcrypt.hash(seedPassword, 10);
            await db.run('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, 'Pandy_Puncheroo']);
            console.log('Synced Pandy_Puncheroo password from ADMIN_SEED_PASSWORD');
        }
    } catch (e) {
        console.error('Error seeding admin account:', e);
    }
};
// รอให้ migration SQLite เสร็จก่อน seed แอดมิน
db.whenReady.then(() => seedAdmin()).catch((e) => console.error('seedAdmin schedule failed:', e));

const { issueVerifyToken } = registerAuthEmailRoutes(app, { db, jwtSecret: JWT_SECRET });

// ==========================================
// API ENDPOINTS
// ==========================================

// สมัครสมาชิก
app.post('/api/signup', authRateLimitMiddleware('signup'), async (appReq, appRes) => {
    try {
        const { username, password, email } = appReq.body;
        const userCheck = validateUsernamePolicy(username);
        if (!userCheck.ok) {
            return appRes.status(400).json({ error: userCheck.error });
        }
        const passCheck = validatePasswordPolicy(password);
        if (!passCheck.ok) {
            return appRes.status(400).json({ error: passCheck.error });
        }
        const emailCheck = validateEmailAddress(email);
        if (!emailCheck.ok) {
            return appRes.status(400).json({ error: emailCheck.error });
        }

        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [userCheck.value]);
        if (existingUser) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }
        const emailTaken = await db.findUserByEmail(emailCheck.value);
        if (emailTaken) {
            return appRes.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const streamToken = crypto.randomBytes(16).toString('hex');
        const openId = generateOpenId();
        const trial = getSignupProTrialGrant();

        await db.run(
            'INSERT INTO users (username, password, streamToken, isPro, proExpireAt, proScopes, createdAt, openId, email, emailVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                userCheck.value,
                hashedPassword,
                streamToken,
                trial ? 1 : 0,
                trial ? trial.proExpireAt : null,
                trial ? trial.proScopes : null,
                new Date().toISOString(),
                openId,
                emailCheck.value,
                0
            ]
        );

        let verifyInfo = null;
        try {
            verifyInfo = await issueVerifyToken(userCheck.value, emailCheck.value);
        } catch (mailErr) {
            console.warn('[signup] verify email:', mailErr?.message || mailErr);
        }

        const message = trial
            ? `สมัครสำเร็จ! ได้รับ PRO ทดลอง ${trial.days} วัน — ตรวจสอบอีเมลเพื่อยืนยันบัญชี`
            : 'สมัครสำเร็จ! ตรวจสอบอีเมลเพื่อยืนยันบัญชี';
        appRes.json({
            success: true,
            message,
            trialPro: !!trial,
            trialDays: trial ? trial.days : null,
            proExpireAt: trial ? trial.proExpireAt : null,
            emailVerificationSent: !!(verifyInfo?.sent?.ok)
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// เข้าสู่ระบบ
app.post('/api/login', authRateLimitMiddleware('login'), async (appReq, appRes) => {
    try {
        const { username, password } = appReq.body;
        let user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        await ensureUserOpenId(user);
        user = await maybeConvertGameCenterPassLocal(user);
        const trialResult = await maybeBackfillSignupProTrialLocal(user);
        user = trialResult.user;
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        setActiveOverlaySession(user.streamToken, user.id);
        appRes.json({
            success: true,
            token,
            user: buildUserProfile(user),
            trialBackfill: !!trialResult.trialBackfill,
            trialDays: trialResult.trialDays || null
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

const oauthLoginStates = {};

function generateOpenId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function ensureUserOpenId(user) {
    if (user.openId) return user;
    const openId = generateOpenId();
    await db.run('UPDATE users SET openId = ? WHERE id = ?', [openId, user.id]);
    user.openId = openId;
    return user;
}

function parseProScopesJson(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function buildUserProfile(user) {
    const scopes = parseProScopesJson(user.proScopes);
    const flags = getGameCenterFlags();
    const gcAccess = canAccessGameCenter(user, flags);
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || '',
        openId: user.openId || '',
        email: user.email || '',
        emailVerified: user.emailVerified === 1 || !!user.oauthProvider,
        streamToken: user.streamToken,
        isPro: user.isPro === 1,
        proExpireAt: user.proExpireAt,
        proScopes: scopes.length ? scopes : null,
        entitlements: entitlementsForApi(user.entitlements),
        role: resolveAccountRole(user),
        createdAt: user.createdAt || '',
        access: {
            gameCenter: gcAccess,
            games: gamesAccessForApi(user, flags)
        }
    };
}

async function maybeConvertGameCenterPassLocal(user) {
    if (!user?.username) return user;
    const patch = buildPassToProConversion(user);
    if (!patch) return user;
    const { convertedDays, ...fields } = patch;
    if (fields.entitlements !== undefined) {
        await db.run('UPDATE users SET isPro = ?, proExpireAt = ?, proScopes = ?, entitlements = ? WHERE username = ?', [
            fields.isPro,
            fields.proExpireAt,
            fields.proScopes,
            fields.entitlements,
            user.username
        ]);
    }
    console.log(`[gc-beta] Converted Early Access → PRO ${convertedDays}d for @${user.username}`);
    return { ...user, ...fields };
}

async function maybeBackfillSignupProTrialLocal(user) {
    if (!user?.username) return { user, trialBackfill: false };
    const patch = buildSignupProTrialBackfill(user);
    if (!patch) return { user, trialBackfill: false };
    const { days, trialDays, ...fields } = patch;
    await db.run('UPDATE users SET isPro = ?, proExpireAt = ?, proScopes = ? WHERE username = ?', [
        fields.isPro,
        fields.proExpireAt,
        fields.proScopes,
        user.username
    ]);
    console.log(`[signup-trial] Backfilled PRO trial ${trialDays || days}d for @${user.username}`);
    return { user: { ...user, ...fields }, trialBackfill: true, trialDays: trialDays || days };
}

async function issueUserAuthResponse(user) {
    await ensureUserOpenId(user);
    user = await maybeConvertGameCenterPassLocal(user);
    const trialResult = await maybeBackfillSignupProTrialLocal(user);
    user = trialResult.user;
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    setActiveOverlaySession(user.streamToken, user.id);
    return {
        token,
        user: buildUserProfile(user),
        trialBackfill: !!trialResult.trialBackfill,
        trialDays: trialResult.trialDays || null
    };
}

app.get('/api/auth/status', (appReq, appRes) => {
    appRes.json({
        success: true,
        google: oauthAuth.isGoogleConfigured(),
        discord: oauthAuth.isDiscordConfigured()
    });
});

app.get('/api/auth/google/start', authRateLimitMiddleware('oauth'), (appReq, appRes) => {
    if (!oauthAuth.isGoogleConfigured()) {
        return appRes.status(503).json({
            error: 'Google Login ยังไม่ได้ตั้งค่า — กรุณาตั้ง GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET ในไฟล์ .env'
        });
    }
    const state = crypto.randomBytes(16).toString('hex');
    oauthLoginStates[state] = { provider: 'google', createdAt: Date.now() };
    appRes.json({ success: true, url: oauthAuth.getGoogleAuthUrl(state) });
});

app.get('/api/auth/discord/start', authRateLimitMiddleware('oauth'), (appReq, appRes) => {
    if (!oauthAuth.isDiscordConfigured()) {
        return appRes.status(503).json({
            error: 'Discord Login ยังไม่ได้ตั้งค่า — กรุณาตั้ง DISCORD_CLIENT_ID และ DISCORD_CLIENT_SECRET ในไฟล์ .env'
        });
    }
    const state = crypto.randomBytes(16).toString('hex');
    oauthLoginStates[state] = { provider: 'discord', createdAt: Date.now() };
    appRes.json({ success: true, url: oauthAuth.getDiscordAuthUrl(state) });
});

function cleanupOAuthStates() {
    const now = Date.now();
    Object.keys(oauthLoginStates).forEach((key) => {
        if (now - oauthLoginStates[key].createdAt > 10 * 60 * 1000) delete oauthLoginStates[key];
    });
}

app.get('/api/auth/google/callback', async (appReq, appRes) => {
    cleanupOAuthStates();
    const { code, state, error } = appReq.query;
    if (error) {
        return appRes.redirect(`/auth-success.html?error=${encodeURIComponent(error)}`);
    }
    const session = oauthLoginStates[state];
    if (!session || session.provider !== 'google') {
        return appRes.status(400).send('Invalid OAuth state');
    }
    delete oauthLoginStates[state];
    try {
        const profile = await oauthAuth.exchangeGoogleCode(code);
        const user = await oauthAuth.findOrCreateOAuthUser(db, {
            provider: 'google',
            oauthId: profile.id,
            displayName: profile.name || profile.email,
            email: profile.email
        });
        const auth = await issueUserAuthResponse(user);
        appRes.redirect(`/auth-success.html?token=${encodeURIComponent(auth.token)}`);
    } catch (e) {
        console.error('Google OAuth error:', e);
        appRes.redirect(`/auth-success.html?error=${encodeURIComponent(e.message || 'Google login failed')}`);
    }
});

app.get('/api/auth/discord/callback', async (appReq, appRes) => {
    cleanupOAuthStates();
    const { code, state, error } = appReq.query;
    if (error) {
        return appRes.redirect(`/auth-success.html?error=${encodeURIComponent(error)}`);
    }
    const session = oauthLoginStates[state];
    if (!session || session.provider !== 'discord') {
        return appRes.status(400).send('Invalid OAuth state');
    }
    delete oauthLoginStates[state];
    try {
        const profile = await oauthAuth.exchangeDiscordCode(code);
        const displayName = profile.global_name || profile.username;
        const user = await oauthAuth.findOrCreateOAuthUser(db, {
            provider: 'discord',
            oauthId: profile.id,
            displayName,
            email: profile.email
        });
        const auth = await issueUserAuthResponse(user);
        appRes.redirect(`/auth-success.html?token=${encodeURIComponent(auth.token)}`);
    } catch (e) {
        console.error('Discord OAuth error:', e);
        appRes.redirect(`/auth-success.html?error=${encodeURIComponent(e.message || 'Discord login failed')}`);
    }
});

// ดึงโปรไฟล์
app.get('/api/profile', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        let user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return appRes.status(404).json({ error: 'User not found' });
        await ensureUserOpenId(user);
        user = await maybeConvertGameCenterPassLocal(user);
        const trialResult = await maybeBackfillSignupProTrialLocal(user);
        user = trialResult.user;
        
        appRes.json({
            success: true,
            user: buildUserProfile(user),
            trialBackfill: !!trialResult.trialBackfill,
            trialDays: trialResult.trialDays || null
        });
    } catch (err) {
        appRes.status(401).json({ error: 'Invalid token' });
    }
});

// อัปเดตโปรไฟล์
app.put('/api/profile', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return appRes.status(404).json({ error: 'User not found' });

        const { displayName, avatarUrl } = appReq.body || {};
        const fields = [];
        const values = [];
        if (typeof displayName === 'string') {
            fields.push('displayName = ?');
            values.push(displayName.trim().slice(0, 40));
        }
        if (typeof avatarUrl === 'string') {
            const trimmed = avatarUrl.trim();
            if (trimmed.startsWith('data:') && trimmed.length > 900000) {
                return appRes.status(400).json({ error: 'รูปโปรไฟล์ใหญ่เกินไป กรุณาใช้รูปที่เล็กลง' });
            }
            fields.push('avatarUrl = ?');
            values.push(trimmed.slice(0, 900000));
        }
        if (!fields.length) return appRes.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องการอัปเดต' });
        values.push(decoded.userId);
        await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        const updated = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        await ensureUserOpenId(updated);
        appRes.json({ success: true, user: buildUserProfile(updated) });
    } catch (err) {
        console.error('Profile update error:', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

registerProfileRoutes(app, {
    db,
    rateLimit: authRateLimitMiddleware,
    getPresence: async (user) => {
        let online = !!(user.streamToken && activePanels[user.streamToken]);
        let isLive = false;
        let tiktokUsername = '';
        for (const [username, session] of Object.entries(activeTiktokSessions)) {
            if (String(session.userId) !== String(user.id)) continue;
            online = true;
            if (session.isLive) {
                isLive = true;
                tiktokUsername = session.tiktokUsername || username;
            }
        }
        return { online, isLive, tiktokUsername };
    },
    getAuthUser: async (req) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        return db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    }
});

// ดึงข้อมูลคอนฟิกตู้สุ่ม
app.get('/api/config', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const config = await db.get('SELECT data FROM user_configs WHERE userId = ?', [decoded.userId]);
        if (!config) {
            return appRes.json({ success: true, config: null });
        }
        
        appRes.json({ success: true, config: JSON.parse(config.data) });
    } catch (err) {
        appRes.status(401).json({ error: 'Invalid token' });
    }
});

// บันทึกข้อมูลคอนฟิกตู้สุ่ม
app.post('/api/config', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { configData } = appReq.body;

        await db.run(
            'INSERT INTO user_configs (userId, data) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET data = excluded.data',
            [decoded.userId, JSON.stringify(configData)]
        );
        
        appRes.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// ==========================================
// SPOTIFY SONG REQUEST API
// ==========================================
const spotifyOAuthStates = {};

registerAssetRoutes(app, { getUserId: resolveUserIdFromRequest });

async function requireSpotifyAuth(appReq, appRes) {
    const ctx = await resolveAuthContextFromRequest(appReq);
    if (!ctx?.userId) {
        appRes.status(401).json({ error: 'No token' });
        return null;
    }
    return {
        userId: String(ctx.userId),
        username: ctx.username || null,
        streamToken: ctx.streamToken || null
    };
}

function resolvePngtuberStateDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'pngtuber_states');
        }
    } catch (e) { /* not electron */ }
    return path.join(process.cwd(), 'uploads', 'pngtuber_states');
}

const pngtuberStateDir = resolvePngtuberStateDir();
try { fs.mkdirSync(pngtuberStateDir, { recursive: true }); } catch (e) { /* ignore */ }

function safeOverlayTokenFile(token) {
    return String(token || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function savePngtuberStateToDisk(token, data) {
    if (!token || !data) return;
    try {
        fs.writeFileSync(path.join(pngtuberStateDir, safeOverlayTokenFile(token) + '.json'), JSON.stringify(data));
    } catch (e) {
        console.warn('[PNGTuber] save state failed:', e.message);
    }
}

function loadPngtuberStateFromDisk(token) {
    if (!token) return null;
    try {
        const filePath = path.join(pngtuberStateDir, safeOverlayTokenFile(token) + '.json');
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { /* ignore */ }
    return null;
}

const lastPngtuberStatusByToken = {};
const lastTimerStatusByToken = {};

app.get('/api/pngtuber/overlay-state', (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ success: false, error: 'no token' });
    const settings = lastPngtuberStatusByToken[token] || loadPngtuberStateFromDisk(token);
    res.json({ success: true, settings: settings || null });
});

app.get('/api/spotify/config', (appReq, appRes) => {
    appRes.json({
        success: true,
        configured: spotify.isConfigured(),
        redirectUri: spotify.SPOTIFY_REDIRECT_URI
    });
});

// Shared Spotify queue — Song Request + Dance Club ใช้คิวเดียวกัน
const spotifySharedQueues = new Map();

function normalizeSharedTrack(t) {
    if (!t) return null;
    const uri = t.uri || (t.videoId ? `youtube:${t.videoId}` : null) || (t.provider === 'youtube' && t.id ? `youtube:${t.id}` : null);
    if (!uri) return null;
    const provider = t.provider
        || (String(uri).startsWith('youtube:') || t.videoId ? 'youtube' : 'spotify');
    const videoId = t.videoId
        || (String(uri).startsWith('youtube:') ? String(uri).slice(8) : null)
        || (provider === 'youtube' ? t.id : null);
    return {
        id: t.id || videoId || null,
        uri,
        videoId: videoId || null,
        provider,
        name: t.name || 'Unknown',
        artist: t.artist || '',
        albumArt: t.albumArt || '',
        requester: t.requester || null,
        durationMs: t.durationMs || 0
    };
}

function getSharedSpotifyQueue(userId) {
    const key = String(userId || '');
    if (!spotifySharedQueues.has(key)) {
        spotifySharedQueues.set(key, { queue: [], updatedAt: 0, source: 'shared' });
    }
    return spotifySharedQueues.get(key);
}

function setSharedSpotifyQueue(userId, queue, source = 'shared') {
    const state = getSharedSpotifyQueue(userId);
    state.queue = (Array.isArray(queue) ? queue : []).map(normalizeSharedTrack).filter(Boolean);
    state.updatedAt = Date.now();
    state.source = source || 'shared';
    return state;
}

async function emitSharedSpotifyQueue(userId, streamTokenHint = null) {
    try {
        let streamToken = streamTokenHint || null;
        if (!streamToken) {
            const user = await db.get('SELECT streamToken FROM users WHERE id = ? OR CAST(id AS TEXT) = ?', [userId, String(userId)]);
            streamToken = user?.streamToken || null;
        }
        if (!streamToken) {
            const byName = await db.get(
                'SELECT streamToken FROM users WHERE username = (SELECT username FROM users WHERE CAST(id AS TEXT) = ? LIMIT 1)',
                [String(userId)]
            );
            streamToken = byName?.streamToken || null;
        }
        const state = getSharedSpotifyQueue(userId);
        const payload = {
            success: true,
            queue: state.queue,
            updatedAt: state.updatedAt,
            source: state.source
        };
        if (streamToken) io.to(streamToken).emit('spotify_shared_queue', payload);
        io.emit('spotify_shared_queue_user', { userId: String(userId), ...payload });
    } catch (e) {
        console.warn('[spotify] emit shared queue:', e.message);
    }
}

app.get('/api/spotify/shared-queue', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const state = getSharedSpotifyQueue(auth.userId);
    appRes.json({
        success: true,
        queue: state.queue,
        updatedAt: state.updatedAt,
        source: state.source
    });
});

app.put('/api/spotify/shared-queue', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const queue = appReq.body?.queue;
    const source = appReq.body?.source || 'shared';
    if (!Array.isArray(queue)) return appRes.status(400).json({ error: 'queue must be an array' });
    const state = setSharedSpotifyQueue(auth.userId, queue, source);
    await emitSharedSpotifyQueue(auth.userId, auth.streamToken);
    appRes.json({
        success: true,
        queue: state.queue,
        updatedAt: state.updatedAt,
        source: state.source
    });
});

app.post('/api/spotify/shared-queue/items', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const track = normalizeSharedTrack(appReq.body?.track || appReq.body);
    if (!track) return appRes.status(400).json({ error: 'Missing track uri' });
    const state = getSharedSpotifyQueue(auth.userId);
    state.queue.push(track);
    state.updatedAt = Date.now();
    state.source = appReq.body?.source || 'shared';
    await emitSharedSpotifyQueue(auth.userId, auth.streamToken);
    appRes.json({
        success: true,
        queue: state.queue,
        updatedAt: state.updatedAt,
        source: state.source
    });
});

app.get('/api/spotify/auth', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    if (!spotify.isConfigured()) {
        return appRes.status(503).json({ error: 'Spotify API ยังไม่ได้ตั้งค่า — กรุณาตั้ง SPOTIFY_CLIENT_ID และ SPOTIFY_CLIENT_SECRET' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    spotifyOAuthStates[state] = { userId: auth.userId, createdAt: Date.now() };
    appRes.json({ success: true, url: spotify.getAuthUrl(state) });
});

app.get('/api/spotify/callback', async (appReq, appRes) => {
    const { code, state, error } = appReq.query;
    if (error) {
        return appRes.send(`<html><body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:40px;"><h2>Spotify เชื่อมต่อไม่สำเร็จ</h2><p>${error}</p><p>ปิดหน้านี้แล้วกลับไปที่ TokControl</p></body></html>`);
    }
    const session = spotifyOAuthStates[state];
    if (!session) {
        return appRes.status(400).send('Invalid OAuth state');
    }
    delete spotifyOAuthStates[state];
    try {
        const tokenData = await spotify.exchangeCode(code);
        await spotify.saveTokens(db, String(session.userId), tokenData);
        appRes.send(`<html><body style="background:#0d1a0d;color:#fff;font-family:sans-serif;text-align:center;padding:40px;"><h2 style="color:#1DB954;">✅ เชื่อมต่อ Spotify สำเร็จ!</h2><p>ปิดหน้านี้แล้วกลับไปที่ TokControl</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
    } catch (e) {
        console.error('Spotify OAuth error:', e);
        appRes.status(500).send('Spotify OAuth failed: ' + e.message);
    }
});

app.get('/api/spotify/status', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    try {
        const connected = await spotify.isUserConnected(db, auth.userId);
        if (!connected) return appRes.json({ success: true, connected: false });
        const nowPlaying = await spotify.getPlayerState(db, auth.userId);
        appRes.json({ success: true, connected: true, nowPlaying });
    } catch (e) {
        appRes.json({ success: true, connected: false, error: e.message });
    }
});

app.post('/api/spotify/disconnect', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    await spotify.deleteTokens(db, auth.userId);
    appRes.json({ success: true });
});

app.get('/api/spotify/search', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    if (!spotify.isConfigured()) {
        return appRes.status(503).json({ error: 'Spotify API ยังไม่ได้ตั้งค่า' });
    }
    const q = (appReq.query.q || '').trim();
    if (!q) return appRes.status(400).json({ error: 'Missing query' });
    try {
        const tracks = await spotify.searchTrack(db, auth.userId, q);
        appRes.json({ success: true, tracks });
    } catch (e) {
        console.error('[spotify/search]', e.message);
        appRes.status(400).json({ error: e.message });
    }
});

app.get('/api/youtube/config', (appReq, appRes) => {
    appRes.json({ success: true, configured: youtube.isConfigured() });
});

const youtubeLive = createYoutubeLiveService({ io, db, youtube });
registerYoutubeLiveRoutes(app, youtubeLive, resolveAuthContextFromRequest);

async function handleYoutubeSearch(appReq, appRes) {
    try {
        const q = String((appReq.query && appReq.query.q) || (appReq.body && appReq.body.q) || '').trim();
        if (!q) return appRes.status(400).json({ error: 'Missing query' });
        const tracks = await youtube.searchVideos(q, 8);
        appRes.json({ success: true, tracks, count: tracks.length });
    } catch (e) {
        console.error('[youtube/search]', e.message);
        appRes.status(400).json({ error: e.message || 'YouTube search failed' });
    }
}

// Song Request YouTube — ไม่บังคับ JWT (เครื่อง local) เพื่อไม่ให้ค้นหาล้มเพราะ token/cloud mismatch
app.get('/api/youtube/search', handleYoutubeSearch);
app.post('/api/youtube/search', handleYoutubeSearch);

app.get('/api/youtube/resolve', async (appReq, appRes) => {
    try {
        const q = (appReq.query.q || appReq.query.url || '').trim();
        if (!q) return appRes.status(400).json({ error: 'Missing url' });
        const track = await youtube.resolveByUrlOrId(q);
        if (!track) return appRes.status(404).json({ error: 'ไม่พบวิดีโอ YouTube' });
        appRes.json({ success: true, track });
    } catch (e) {
        console.error('[youtube/resolve]', e.message);
        appRes.status(400).json({ error: e.message || 'YouTube resolve failed' });
    }
});

app.post('/api/spotify/play', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const { uri } = appReq.body || {};
    if (!uri) return appRes.status(400).json({ error: 'Missing track URI' });
    try {
        await spotify.startPlayback(db, auth.userId, uri);
        appRes.json({ success: true });
    } catch (e) {
        const msg = e.message || 'Play failed';
        if (/rate limit|429|ถี่เกิน/i.test(msg)) {
            const m = msg.match(/รอ\s*(\d+)/);
            return appRes.status(429).json({
                error: msg,
                retryAfterSec: m ? parseInt(m[1], 10) : 30
            });
        }
        appRes.status(400).json({ error: msg });
    }
});

app.post('/api/spotify/queue', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const { uri } = appReq.body || {};
    if (!uri) return appRes.status(400).json({ error: 'Missing track URI' });
    try {
        await spotify.addToQueue(db, auth.userId, uri);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/skip', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    try {
        await spotify.skipTrack(db, auth.userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/pause', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    try {
        await spotify.pausePlayback(db, auth.userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/volume', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const volume = appReq.body?.volume ?? appReq.body?.volumePercent;
    try {
        await spotify.setVolume(db, auth.userId, volume);
        appRes.json({ success: true, volume: Math.max(0, Math.min(100, Math.round(Number(volume) || 0))) });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/resume', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    try {
        await spotify.resumePlayback(db, auth.userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.get('/api/spotify/now-playing', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    try {
        const fresh = String(appReq.query.fresh || '') === '1';
        const nowPlaying = await spotify.getPlayerState(db, auth.userId, { fresh });
        appRes.json({ success: true, ...nowPlaying });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.get('/api/spotify/audio-features', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const id = String(appReq.query.id || '').trim();
    if (!id) return appRes.status(400).json({ error: 'Missing track id' });
    try {
        const features = await spotify.getAudioFeatures(db, auth.userId, id);
        appRes.json({ success: true, ...features });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.get('/api/spotify/audio-analysis', async (appReq, appRes) => {
    const auth = await requireSpotifyAuth(appReq, appRes);
    if (!auth) return;
    const id = String(appReq.query.id || '').trim();
    if (!id) return appRes.status(400).json({ error: 'Missing track id' });
    try {
        const analysis = await spotify.getAudioAnalysis(db, auth.userId, id);
        if (!analysis) return appRes.status(404).json({ error: 'Analysis not available' });
        appRes.json({ success: true, ...analysis });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

// ฟังก์ชันประมวลผลอีเวนต์ที่ส่งมาจาก Browser Mode
async function processBrowserEvent(type, data) {
    const username = data && data.username ? data.username.toLowerCase() : '';
    const session = activeTiktokSessions[username];
    
    try {
        appendRuntimeLog('debug_events.log',
            `[Server Event] Time: ${new Date().toISOString()} | Type: ${type} | Username: ${username} | Session: ${session ? 'Found' : 'NOT FOUND'} | Data: ${JSON.stringify(data)}\n`
        );
    } catch(e) {}
    
    if (session) {
        if (type === 'gift') {
            // Direct API อาจไม่ส่ง gift protobuf มา — รับจากหน้าต่างไลฟ์ด้วย
            // แล้วให้ coalesce/dedupe กันเบิ้ลกับ Direct
            if (!shouldEmitBrowserGift(session.userId, data)) return;
            const iconToSave = data.giftIcon && data.giftIcon.trim() !== '' ? data.giftIcon : '';

            // Prefer real TikTok ids (Rose=5655) over name-hash / stale DB rows
            let giftId = resolveKnownGiftId(data.giftName, data.giftId || 0);
            if (!giftId) {
                const existingByIcon = await findExistingGift(db, {
                    giftName: data.giftName,
                    giftIcon: iconToSave
                });
                if (existingByIcon) {
                    giftId = resolveKnownGiftId(data.giftName, existingByIcon.giftId);
                } else {
                    giftId = hashGiftName(data.giftName || '');
                }
            }

            // ค้นหามูลค่าเหรียญจริงของของขวัญ TikTok ยอดนิยม
            const POPULAR_TIKTOK_GIFTS = {
                'rose': 1, 'กุหลาบ': 1, 'ice cream': 1, 'ไอศกรีม': 1, 'tiktok': 1,
                'finger heart': 5, 'มินิฮาร์ท': 5, 'mic': 5, 'ไมค์': 5, 'panda': 5, 'แพนด้า': 5,
                'perfume': 20, 'น้ำหอม': 20, 'doughnut': 30, 'donut': 30, 'โดนัท': 30,
                'crown': 99, 'มงกุฎ': 99, 'confetti': 100, 'คอนเฟตติ': 100,
                'gold mine': 1000, 'เหมืองทอง': 1000, 'paper crane': 1, 'นกกระดาษ': 1,
                'hi': 5, 'สวัสดี': 5, 'double heart': 10, 'หัวใจคู่': 10,
                'rose bouquet': 199, 'ช่อกุหลาบ': 199, 'love balloon': 699, 'ลูกโป่งรัก': 699,
                'lion': 29999, 'สิงโต': 29999, 'universe': 44999, 'จักรวาล': 44999
            };

            const nameLower = data.giftName ? data.giftName.toLowerCase().trim() : '';
            let diamondCount = 1;
            if (POPULAR_TIKTOK_GIFTS[nameLower]) {
                diamondCount = POPULAR_TIKTOK_GIFTS[nameLower];
            }
            // Strict exact name only — no .includes() (กันชื่อคล้ายกันตั้ง diamond ผิด)

            // บันทึกของขวัญลงฐานข้อมูลแบบไดนามิก (บันทึกเสมอแม้จะไม่มีรูปภาพในช่วงแรก เพื่อไม่ให้การคำนวณเงื่อนไขและสถิติผิดพลาด)
            try {
                await upsertTikTokGift(db, {
                    giftId,
                    giftName: data.giftName,
                    diamondCount,
                    giftIcon: iconToSave
                }, { io, token: session.token });
            } catch (e) {
                console.error("Failed to dynamically save Browser Scraped Gift:", e);
            }

            // Emit gift event to overlay and panel!
            if (isHeartMeGift(giftId, data.giftName)) {
                fanClubRegistry.mark(session.userId, extractChatIdentity(null, data), {
                    tiktokUsername: username,
                    level: 1
                });
            }
            const giftIdentity = extractChatIdentity(null, data);
            const repeatCount = Math.max(1, parseInt(data.repeatCount, 10) || 1);
            const giftPayload = {
                uniqueId: giftIdentity.uniqueId || data.uniqueId || '',
                nickname: giftIdentity.nickname || data.nickname || '',
                avatar: giftIdentity.avatar || data.profilePictureUrl,
                giftName: data.giftName,
                giftId,
                giftIcon: data.giftIcon,
                diamondCount: diamondCount,
                repeatCount,
                totalCoins: diamondCount * repeatCount,
                // Browser scrape: treat as streak so debounce aggregates combo taps
                giftType: data.giftType != null ? Number(data.giftType) : 1,
                repeatEnd: data.repeatEnd === false || data.repeatEnd === 0 || data.repeatEnd === '0' ? false : true,
                msgId: data.msgId || data.messageId || ''
            };
            emitTikTokGiftCoalesced(session.token, giftPayload, {
                onFlush: (finalGift) => {
                    markGiftGalleryGiftReceived(session.userId, finalGift.giftId || giftId, finalGift.repeatCount, finalGift.giftName || data.giftName);
                }
            });
        } else if (type === 'chat') {
            const chatUser = data?.user || data;
            const identity = extractChatIdentity(chatUser, data);
            const badgeFan = !!data.isFanClub || !!data.hasFanClubBadge || chatUserHasFanClubBadge(chatUser, data);
            const regOpts = { tiktokUsername: username };
            const isFanClub = badgeFan || fanClubRegistry.has(session.userId, identity, regOpts);
            const teamMemberLevel = Math.max(
                extractTeamMemberLevel(chatUser, data),
                fanClubRegistry.getLevel(session.userId, identity, regOpts) || 0,
                (badgeFan || isFanClub) ? 1 : 0
            );
            const subscriberLevel = extractSubscriberLevel(chatUser, data);
            const teamStatus = analyzeChatTeamStatus(chatUser, data, session.userId, fanClubRegistry, regOpts);
            console.log(
                `[Chat] User: ${identity.uniqueId} | HasTeamBadge: ${teamStatus.hasTeamBadge} | Registry: ${teamStatus.registryHit} | TeamLevel: ${teamStatus.teamLevel} | Passed: ${teamStatus.passed}`
            );
            if (isFanClub) fanClubRegistry.mark(session.userId, identity, { ...regOpts, level: teamMemberLevel });
            io.to(session.token).emit('tiktok_chat', {
                uniqueId: identity.uniqueId || data.uniqueId || '',
                nickname: identity.nickname || data.nickname || '',
                userId: identity.userId || data.userId || '',
                comment: data.comment,
                avatar: identity.avatar || data.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${identity.nickname || identity.uniqueId || 'viewer'}`,
                isFanClub,
                hasFanClubBadge: badgeFan,
                teamMemberLevel,
                isSubscriber: !!data.isSubscriber || subscriberLevel > 0,
                subscriberLevel,
                isFollower: false,
                emotes: Array.isArray(data.emotes) ? data.emotes : []
            });
        } else if (type === 'like') {
            const identity = extractChatIdentity(null, data);
            io.to(session.token).emit('tiktok_like', {
                uniqueId: identity.uniqueId || data.uniqueId || '',
                nickname: identity.nickname || data.nickname || '',
                avatar: identity.avatar || data.profilePictureUrl || data.avatar || '',
                likeCount: data.likeCount || 1,
                totalLikeCount: extractTotalLikeCount(data)
            });
        } else if (type === 'follow') {
            const identity = extractChatIdentity(null, data);
            io.to(session.token).emit('tiktok_follow', {
                uniqueId: identity.uniqueId || data.uniqueId || '',
                nickname: identity.nickname || data.nickname || '',
                avatar: identity.avatar || data.profilePictureUrl
            });
        } else if (type === 'share') {
            const identity = extractChatIdentity(null, data);
            io.to(session.token).emit('tiktok_share', {
                uniqueId: identity.uniqueId || data.uniqueId || '',
                nickname: identity.nickname || data.nickname || '',
                avatar: identity.avatar || data.profilePictureUrl
            });
        } else if (type === 'join') {
            const identity = extractChatIdentity(null, data);
            const payload = {
                uniqueId: identity.uniqueId,
                nickname: identity.nickname,
                avatar: identity.avatar || data.profilePictureUrl,
                teamMemberLevel: Math.max(extractTeamMemberLevel(null, data), chatUserHasFanClubBadge(null, data) ? 1 : 0)
            };
            io.to(session.token).emit('tiktok_join', payload);
            if (chatUserHasFanClubBadge(null, data) || extractSubscriberFlag(null, data) || data.isSubscriber) {
                io.to(session.token).emit('tiktok_subscribe', payload);
            }
        } else if (type === 'browser_connected') {
            console.log(`Browser mode connected successfully for channel @${data.username}`);
            // Emit connection success events!
            io.to(session.token).emit('tiktok_notification', { type: 'connected', username: data.username });
            
            const liveStatusVal = data.isLive !== undefined ? data.isLive : true;
            const sessionKey = (data.username || '').toLowerCase();
            if (sessionKey && activeTiktokSessions[sessionKey]) {
                activeTiktokSessions[sessionKey].isLive = liveStatusVal;
                activeTiktokSessions[sessionKey].tiktokUsername = data.username;
                activeTiktokSessions[sessionKey].nickname = data.nickname || data.username;
                activeTiktokSessions[sessionKey].avatar = data.avatar || activeTiktokSessions[sessionKey].avatar || '';
            }
            io.to(session.token).emit('tiktok_status', { 
                connected: true, 
                isLive: liveStatusVal, 
                username: data.username, 
                nickname: data.nickname, 
                avatar: data.avatar, 
                avatarUrl: data.avatar,
                integrationMode: 'browser' 
            });
            if (!data.avatar || /dicebear\.com/i.test(String(data.avatar))) {
                attachHydratedHostProfile(io, null, session.token, {
                    username: data.username,
                    existingAvatar: data.avatar,
                    isLive: liveStatusVal,
                    integrationMode: 'browser'
                });
            }
            if (liveStatusVal && data.username && session.userId) {
                fetchGiftGalleryBackground(session.userId, data.username, session.token);
            }
        } else if (type === 'browser_live_status') {
            const sessionKey = (data.username || '').toLowerCase();
            const sess = sessionKey ? activeTiktokSessions[sessionKey] : null;
            if (sess) {
                sess.isLive = !!data.isLive;
                sess.tiktokUsername = data.username;
            }
            io.to(session.token).emit('tiktok_status', { 
                connected: true, 
                isLive: data.isLive, 
                username: data.username,
                nickname: sess?.nickname || data.nickname || data.username,
                avatar: sess?.avatar || data.avatar || '',
                avatarUrl: sess?.avatar || data.avatar || '',
                integrationMode: 'browser' 
            });
            if (!(sess?.avatar) && data.username) {
                attachHydratedHostProfile(io, null, session.token, {
                    username: data.username,
                    isLive: !!data.isLive,
                    integrationMode: 'browser'
                });
            }
            if (data.isLive && data.username && session.userId) {
                fetchGiftGalleryBackground(session.userId, data.username, session.token);
            }
        } else if (type === 'gift_discovered_from_panel') {
            // บันทึกหรืออัปเดตของขวัญที่ขูดจากแถบด้านล่างลงฐานข้อมูลโดยตรง
            try {
                const iconToSave = data.giftIcon && data.giftIcon.trim() !== '' ? data.giftIcon : '';
                await upsertTikTokGift(db, {
                    giftId: data.giftId,
                    giftName: data.giftName,
                    diamondCount: data.diamondCount,
                    giftIcon: iconToSave
                }, { io, token: session.token });
            } catch (e) {
                console.error("Failed to dynamically save Panel Scraped Gift:", e);
            }
        }
    }
}

// ผูกฟังก์ชันเข้ากับ IPC Main สำหรับดักจับข้อมูลจาก Preload Script โดยไม่ผ่านเครือข่ายอินเทอร์เน็ต
try {
    const { ipcMain } = require('electron');
    if (!global.__tokcontrolTiktokIpcBound) {
        global.__tokcontrolTiktokIpcBound = true;
        ipcMain.on('tiktok-event', async (event, { type, data }) => {
            console.log(`[IPC Event] Received TikTok data via secure IPC bridge: ${type}`);
            await processBrowserEvent(type, data);
        });
    }
} catch (e) {
    console.log("Not running inside Electron Main Process, IPC Listener skipped.");
}

function isLoopbackRequest(appReq) {
    const ip = String(appReq.ip || appReq.socket?.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
}

// รับข้อมูลแชท/ของขวัญจาก Bookmarklet (Browser mode - HTTP Fallback) — localhost เท่านั้น
app.post('/api/browser/event', async (appReq, appRes) => {
    try {
        if (!isLoopbackRequest(appReq)) {
            return appRes.status(403).json({ success: false, error: 'Browser ingest is localhost-only' });
        }
        const { type, data } = appReq.body;
        await processBrowserEvent(type, data);
        appRes.json({ success: true });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'Internal server error' });
    }
});

const { extractTikTokOwnerProfile, fillMissingAvatar, resolveStreamerProfile } = require('./tiktok_profile');
const { resolveTikTokRoomId } = require('./tiktok_room_resolve');

const tiktokProfileCache = new Map();
const TIKTOK_PROFILE_CACHE_MS = 60_000;

function emitTikTokStatusToClient(ioRef, socketRef, token, payload) {
    if (token) ioRef.to(token).emit('tiktok_status', payload);
    if (socketRef) socketRef.emit('tiktok_status', payload);
}

function attachHydratedHostProfile(ioRef, socketRef, token, opts) {
    const username = String(opts?.username || '').replace(/^@+/, '').trim();
    if (!username) return;
    const connection = opts.connection || null;
    const userId = opts.userId;
    resolveStreamerProfile(username, opts.roomInfo || null, connection?.avatar || opts.existingAvatar || '', connection)
        .then((profile) => {
            if (!profile?.avatarUrl) return;
            if (userId && connection && activeTikTokConnections[userId] && activeTikTokConnections[userId] !== connection) return;
            if (connection) {
                connection.avatar = profile.avatarUrl;
                connection.nickname = profile.displayName || connection.nickname || username;
            }
            const sessionKey = username.toLowerCase();
            if (activeTiktokSessions[sessionKey]) {
                activeTiktokSessions[sessionKey].avatar = profile.avatarUrl;
                activeTiktokSessions[sessionKey].nickname = profile.displayName || username;
            }
            emitTikTokStatusToClient(ioRef, socketRef, token, {
                connected: true,
                isLive: !!(connection?.isLive || opts.isLive),
                username,
                nickname: profile.displayName || username,
                displayName: profile.displayName || username,
                avatar: profile.avatarUrl,
                avatarUrl: profile.avatarUrl,
                followerCount: profile.followerCount,
                followingCount: profile.followingCount,
                integrationMode: opts.integrationMode || 'direct',
                roomId: opts.roomId || connection?.roomId || null
            });
        })
        .catch(() => {});
}

app.get('/api/tiktok/profile', async (appReq, appRes) => {
    try {
        const username = String(appReq.query.username || '').trim().replace(/^@+/, '');
        if (!username) {
            appRes.status(400).json({ error: 'username required' });
            return;
        }
        const cacheKey = username.toLowerCase();
        const cached = tiktokProfileCache.get(cacheKey);
        if (cached && Date.now() - cached.at < TIKTOK_PROFILE_CACHE_MS && cached.data?.avatarUrl) {
            appRes.json(cached.data);
            return;
        }

        let profile = { username, displayName: username, avatarUrl: '', followerCount: 0, followingCount: 0 };
        try {
            for (const conn of Object.values(activeTikTokConnections || {})) {
                if (String(conn?.username || '').toLowerCase() !== cacheKey) continue;
                let ri = null;
                try { ri = await conn.getRoomInfo(); } catch (e) {}
                if (ri) profile = extractTikTokOwnerProfile(ri, username);
                if (!profile.username) profile.username = username;
                if (conn.avatar && !profile.avatarUrl) profile.avatarUrl = conn.avatar;
                if (conn.nickname && (!profile.displayName || profile.displayName === username)) {
                    profile.displayName = conn.nickname;
                }
                break;
            }
        } catch (e) {}

        await fillMissingAvatar(profile, username);
        if (!profile.username) profile.username = username;
        if (profile.avatarUrl) {
            tiktokProfileCache.set(cacheKey, { at: Date.now(), data: profile });
            appRes.json(profile);
            return;
        }
        appRes.status(502).json({ error: 'ไม่สามารถดึงโปรไฟล์ TikTok ได้ (อาจออฟไลน์หรือ username ผิด)' });
    } catch (err) {
        console.error('[tiktok/profile]', err?.message || err);
        appRes.status(502).json({ error: 'ไม่สามารถดึงโปรไฟล์ TikTok ได้ (อาจออฟไลน์หรือ username ผิด)' });
    }
});

// เปิดบราวเซอร์ TikTok จาก Server (หลีกเลี่ยงข้อจำกัด require ใน frontend)
app.get('/api/open-tiktok-browser', (req, res) => {
    const { username, userId } = req.query;
    try {
        const { BrowserWindow } = require('electron');
        const path = require('path');
        const fs = require('fs');
        
        let url = 'https://www.tiktok.com/';
        if (username) {
            url = `https://www.tiktok.com/@${username}/live`;
        }
        
        console.log(`Opening TikTok browser from server for user ${userId}: ${url}`);
        
        // ปิดหน้าต่างบราวเซอร์เก่าของผู้ใช้นี้ก่อนหากเปิดค้างอยู่
        if (userId && activeTiktokWindows[userId]) {
            try {
                activeTiktokWindows[userId].close();
                console.log(`Closed previous TikTok window for user ${userId}`);
            } catch(e) {}
            delete activeTiktokWindows[userId];
        }

        const tkWin = new BrowserWindow({
            width: 1100,
            height: 750,
            title: 'TikTok Browser - TokControl',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: false
            }
        });
        
        if (userId) {
            activeTiktokWindows[userId] = tkWin;
            
            // ล้างอ้างอิงเมื่อหน้าต่างถูกปิดโดยผู้ใช้เอง
            tkWin.on('closed', () => {
                delete activeTiktokWindows[userId];
            });
        }

        const injectScript = () => {
            try {
                const scriptPath = path.join(__dirname, 'bookmarklet.js');
                if (fs.existsSync(scriptPath)) {
                    let script = fs.readFileSync(scriptPath, 'utf8');
                    script = `const injectedUsername = "${username.toLowerCase()}";\n` + script;
                    tkWin.webContents.executeJavaScript(`
                        window.injectedUsername = "${username.toLowerCase()}";
                        ${script}
                    `).catch(e => {
                        console.error("executeJavaScript error:", e);
                    });
                }
            } catch (e) {
                console.error("Failed to inject TikTok bookmarklet:", e);
            }
        };

        tkWin.webContents.on('dom-ready', injectScript);
        tkWin.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
            if (isMainFrame) {
                injectScript();
            }
        });

        tkWin.webContents.on('console-message', (event, level, message, line, sourceId) => {
            try {
                require('fs').appendFileSync(
                    path.join(__dirname, 'browser_console.log'),
                    `[Console] Level ${level} | Source ${sourceId}:${line} | Message: ${message}\n`
                );
            } catch(e) {}
        });

        tkWin.loadURL(url);
        
        res.json({ success: true });
    } catch (err) {
        console.error("Failed to open browser from server:", err);
        res.status(500).json({ error: err.message });
    }
});

// สมัครสมาชิก Pro — ใช้ระบบ PromptPay แทน (ดู /api/payments/*)
app.post('/api/buy-pro', async (appReq, appRes) => {
    appRes.status(410).json({
        error: 'endpoint นี้เลิกใช้แล้ว กรุณาใช้ระบบชำระเงิน PromptPay ในแอป',
        use: '/api/payments/create'
    });
});

// ตรวจสอบสิทธิ์ว่าผู้ใช้งานเป็นผู้ดูแลระบบ (Admin) หรือไม่
const isAdminUser = async (userId) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    return isAdminAccount(user);
};

registerAchievementAdminRoutes(app, {
    db,
    jwt,
    JWT_SECRET,
    isAdminUser
});

registerPaymentRoutes(app, {
    jwt,
    JWT_SECRET,
    getUserById: async (userId) => db.get('SELECT * FROM users WHERE id = ?', [userId]),
    updateUserProStatus: async (username, isPro, proExpireAt) => {
        const scopes = isPro ? JSON.stringify(['all']) : null;
        await db.run('UPDATE users SET isPro = ?, proExpireAt = ?, proScopes = ? WHERE username = ?', [isPro, proExpireAt, scopes, username]);
        return true;
    },
    updateUserFields: async (username, fields) => {
        if (fields.entitlements !== undefined) {
            const val = typeof fields.entitlements === 'string' ? fields.entitlements : JSON.stringify(fields.entitlements);
            await db.run('UPDATE users SET entitlements = ? WHERE username = ?', [val, username]);
        }
        return true;
    },
    createPaymentOrder: async (order) => {
        await db.run(
            `INSERT INTO payment_orders
            (id, userId, username, planId, days, amount, status, qrPayload, slipRef, slipMeta, createdAt, expiresAt, paidAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                order.id, String(order.userId), order.username, order.planId,
                order.days, order.amount, order.status || 'pending',
                order.qrPayload || null, order.slipRef || null, order.slipMeta || null,
                order.createdAt, order.expiresAt, order.paidAt || null
            ]
        );
        return true;
    },
    getPaymentOrder: async (orderId) => db.get('SELECT * FROM payment_orders WHERE id = ?', [orderId]),
    updatePaymentOrder: async (orderId, fields) => {
        const allowed = ['status', 'slipRef', 'slipMeta', 'paidAt', 'qrPayload', 'expiresAt'];
        const cols = allowed.filter((k) => fields[k] !== undefined);
        if (!cols.length) return false;
        await db.run(
            `UPDATE payment_orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            [...cols.map((c) => fields[c]), orderId]
        );
        return true;
    },
    listPaymentOrders: async (limit = 100) =>
        db.all('SELECT * FROM payment_orders ORDER BY createdAt DESC LIMIT ?', [Math.min(limit, 500)]),
    findPaymentOrderBySlipRef: async (slipRef) => {
        if (!slipRef) return null;
        return db.get('SELECT * FROM payment_orders WHERE slipRef = ?', [String(slipRef)]);
    },
    isAdminUser,
    claimPaymentOrder: async (orderId, fromStatuses) => {
        const allowed = Array.isArray(fromStatuses) && fromStatuses.length ? fromStatuses : ['pending'];
        const row = await db.get('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
        if (!row || !allowed.includes(row.status)) return null;
        const placeholders = allowed.map(() => '?').join(',');
        const result = await db.run(
            `UPDATE payment_orders SET status = ? WHERE id = ? AND status IN (${placeholders})`,
            ['processing', orderId, ...allowed]
        );
        if (!result || !result.changes) return null;
        return { ...row, status: 'processing' };
    }
});

// [ADMIN] สร้างรหัสรางวัล (Promo Code) ใหม่
app.post('/api/admin/promo/generate', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        
        const { type, val, code, proScopes, gameId } = appReq.body;
        if (!type || !code) {
            return appRes.status(400).json({ error: 'กรุณากรอกข้อมูลประเภท และรหัสรางวัลให้ครบถ้วน' });
        }
        if (val == null || val === '' || Number.isNaN(Number(val))) {
            return appRes.status(400).json({ error: 'กรุณาระบุมูลค่า / จำนวนวันให้ถูกต้อง' });
        }
        
        const existing = await db.get('SELECT * FROM promo_codes WHERE code = ?', [code]);
        if (existing) {
            return appRes.status(400).json({ error: 'รหัสรางวัลนี้มีอยู่แล้วในระบบ' });
        }

        let scopesJson = null;
        if (type === 'pro') {
            const scopes = Array.isArray(proScopes) && proScopes.length ? proScopes : ['all'];
            scopesJson = JSON.stringify(scopes.includes('all') ? ['all'] : scopes);
        } else if (type === 'game') {
            const gid = String(gameId || (Array.isArray(proScopes) ? proScopes[0] : '') || '').trim();
            if (!isValidUnlockGameId(gid)) {
                return appRes.status(400).json({ error: 'กรุณาเลือกเกมที่ต้องการปลดล็อก' });
            }
            if (Number(val) < 0) {
                return appRes.status(400).json({ error: 'จำนวนวันต้องไม่ติดลบ (0 = ไม่หมดอายุ)' });
            }
            scopesJson = JSON.stringify([gid]);
        }
        
        const createdAt = new Date().toISOString();
        await db.run(
            'INSERT INTO promo_codes (code, type, val, createdAt, proScopes) VALUES (?, ?, ?, ?, ?)',
            [code, type, Number(val), createdAt, scopesJson]
        );
        
        appRes.json({ success: true, message: 'สร้างโค้ดรางวัลสำเร็จ!' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างโค้ด' });
    }
});

// [ADMIN] ดึงรายการโค้ดรางวัลทั้งหมดและประวัติการใช้
app.get('/api/admin/promo/list', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        
        const list = await db.all('SELECT * FROM promo_codes ORDER BY createdAt DESC');
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// [ADMIN] ภาพรวมระบบ + รายชื่อสมาชิกแยกประเภท
app.get('/api/admin/overview', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const now = Date.now();
        const users = await db.all('SELECT id, username, email, displayName, avatarUrl, openId, oauthProvider, streamToken, isPro, proExpireAt, proScopes, createdAt FROM users ORDER BY id DESC');
        const promos = await db.all('SELECT * FROM promo_codes ORDER BY createdAt DESC');
        const announcements = await db.all('SELECT COUNT(*) as cnt FROM announcements');
        const annCount = announcements[0]?.cnt || 0;

        const enrichedUsers = users.map(u => {
            const isAdmin = u.role === 'admin' || u.isAdmin === true || u.isAdmin === 1;
            const proActive = u.isPro === 1 && (!u.proExpireAt || new Date(u.proExpireAt).getTime() > now);
            let proScopes = ['all'];
            try {
                if (u.proScopes) {
                    const parsed = JSON.parse(u.proScopes);
                    if (Array.isArray(parsed) && parsed.length) proScopes = parsed;
                }
            } catch (e) { /* keep default */ }
            return {
                id: u.id,
                username: u.username,
                email: u.email || '',
                displayName: u.displayName || u.username,
                avatarUrl: u.avatarUrl || '',
                openId: u.openId || '',
                oauthProvider: u.oauthProvider || '',
                streamTokenMasked: u.streamToken ? `${String(u.streamToken).slice(0, 10)}…` : '',
                isPro: u.isPro === 1,
                proActive,
                proExpireAt: u.proExpireAt,
                proScopes,
                createdAt: u.createdAt,
                role: isAdmin ? 'admin' : (proActive ? 'pro' : 'free')
            };
        });

        const codeRedemptions = promos
            .filter(p => p.isUsed === 1)
            .map(p => {
                let scopeList = [];
                try {
                    if (p.proScopes) scopeList = JSON.parse(p.proScopes);
                } catch (e) { /* ignore */ }
                return {
                    code: p.code,
                    type: p.type,
                    val: p.val,
                    proScopes: scopeList,
                    usedBy: p.usedBy,
                    usedByName: p.usedByName,
                    usedAt: p.usedAt
                };
            });

        const activeStreamers = await collectActiveLiveStreamers();

        appRes.json({
            success: true,
            stats: {
                totalUsers: users.length,
                proActive: enrichedUsers.filter(u => u.proActive).length,
                freeUsers: enrichedUsers.filter(u => u.role === 'free').length,
                codesUsed: promos.filter(p => p.isUsed === 1).length,
                codesAvailable: promos.filter(p => p.isUsed !== 1).length,
                announcements: annCount,
                activeStreamers: activeStreamers.length
            },
            registeredUsers: enrichedUsers,
            proUsers: enrichedUsers.filter(u => u.proActive),
            codeRedemptions,
            activeStreamers
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// รายการรูปทรงโหล (Gift Jar) ที่แอดมินออกแบบเอง — ผู้ใช้ทุกคนดึงมาใช้ได้ (อ่านอย่างเดียว)
const JAR_SHAPE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'jar_shapes');

function ensureJarShapeUploadDir() {
    if (!fs.existsSync(JAR_SHAPE_UPLOAD_DIR)) fs.mkdirSync(JAR_SHAPE_UPLOAD_DIR, { recursive: true });
}

function saveJarShapeImageFile(shapeId, dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
    ensureJarShapeUploadDir();
    const ext = dataUrl.includes('image/png') ? 'png' : (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'jpg' : 'webp');
    const safeId = String(shapeId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = safeId + '.' + ext;
    const filePath = path.join(JAR_SHAPE_UPLOAD_DIR, fileName);
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return '/uploads/jar_shapes/' + fileName;
}

function parseJarConfig3d(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function cleanJarConfig3d(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    const num = (v, def, min, max) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return def;
        return Math.max(min, Math.min(max, n));
    };
    const fit = cfg.imageFit || {};
    return {
        tiltX: num(cfg.tiltX, 0, -45, 45),
        tiltY: num(cfg.tiltY, 0, -45, 45),
        turnZ: num(cfg.turnZ, 0, -30, 30),
        perspective: num(cfg.perspective, 800, 400, 1400),
        jarOffsetX: num(cfg.jarOffsetX, 0, -30, 30),
        jarOffsetY: num(cfg.jarOffsetY, 0, -30, 30),
        jarScale: num(cfg.jarScale, 1, 0.5, 2),
        jarColor: typeof cfg.jarColor === 'string' && cfg.jarColor ? cfg.jarColor : '#bc13fe',
        glowEffect: cfg.glowEffect !== false,
        imageOpacity: num(cfg.imageOpacity, 1, 0.2, 1),
        imageFit: {
            x: num(fit.x, 0.05, 0, 0.4),
            y: num(fit.y, 0.06, 0, 0.4),
            w: num(fit.w, 0.9, 0.3, 1),
            h: num(fit.h, 0.88, 0.3, 1)
        },
        spawnSpread: num(cfg.spawnSpread, 0.86, 0.3, 1),
        dropFromY: num(cfg.dropFromY, 0.12, 0, 0.4)
    };
}

app.get('/api/jar-shapes/custom', async (appReq, appRes) => {
    try {
        const rows = await db.all('SELECT * FROM jar_custom_shapes ORDER BY createdAt DESC');
        const list = rows.map(r => {
            let points = [];
            try { points = JSON.parse(r.points || '[]'); } catch (e) { points = []; }
            return {
                id: r.id,
                name: r.name,
                icon: r.icon || '🫙',
                points,
                fillLimitRel: r.fillLimitRel != null ? r.fillLimitRel : null,
                bounceMode: r.bounceMode || null,
                jarImage: r.jarImage || null,
                config3d: parseJarConfig3d(r.config3d),
                createdBy: r.createdBy || null,
                createdAt: r.createdAt
            };
        });
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// [ADMIN] สร้าง/แก้ไขรูปทรงโหลกำหนดเอง แล้วเผยแพร่ให้ผู้ใช้ทุกคน
app.post('/api/admin/jar-shapes', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ success: false, error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ success: false, error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const { id, name, icon, points, fillLimitRel, bounceMode, jarImageData, config3d } = appReq.body;
        if (!name || !Array.isArray(points) || points.length < 2) {
            return appRes.status(400).json({ success: false, error: 'กรุณาระบุชื่อและกำหนดจุดเส้นโหลอย่างน้อย 2 จุด' });
        }

        const cleanPoints = points
            .map(p => ({ y: Math.max(0.05, Math.min(0.99, Number(p.y) || 0)), half: Math.max(0.04, Math.min(0.5, Number(p.half) || 0)) }))
            .sort((a, b) => a.y - b.y);
        const cleanConfig3d = cleanJarConfig3d(config3d);

        const shapeId = id && String(id).trim() ? String(id).trim() : ('cshape_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const now = new Date().toISOString();
        const existing = await db.get('SELECT id, createdAt, jarImage FROM jar_custom_shapes WHERE id = ?', [shapeId]);
        const user = await db.get('SELECT username FROM users WHERE id = ?', [decoded.userId]);

        let jarImageUrl = existing?.jarImage || null;
        if (jarImageData && String(jarImageData).startsWith('data:image/')) {
            jarImageUrl = saveJarShapeImageFile(shapeId, jarImageData);
        }

        if (existing) {
            await db.run(
                'UPDATE jar_custom_shapes SET name = ?, icon = ?, points = ?, fillLimitRel = ?, bounceMode = ?, jarImage = ?, config3d = ?, updatedAt = ? WHERE id = ?',
                [name, icon || '🫙', JSON.stringify(cleanPoints), fillLimitRel != null ? fillLimitRel : null, bounceMode || null, jarImageUrl, cleanConfig3d ? JSON.stringify(cleanConfig3d) : null, now, shapeId]
            );
        } else {
            await db.run(
                'INSERT INTO jar_custom_shapes (id, name, icon, points, fillLimitRel, bounceMode, jarImage, config3d, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [shapeId, name, icon || '🫙', JSON.stringify(cleanPoints), fillLimitRel != null ? fillLimitRel : null, bounceMode || null, jarImageUrl, cleanConfig3d ? JSON.stringify(cleanConfig3d) : null, user?.username || 'admin', now, now]
            );
        }

        appRes.json({ success: true, id: shapeId, jarImage: jarImageUrl, message: existing ? 'แก้ไขโหลกำหนดเองสำเร็จ' : 'บันทึกโหลกำหนดเองใหม่สำเร็จ' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกโหล' });
    }
});

// [ADMIN] ลบรูปทรงโหลกำหนดเอง
app.delete('/api/admin/jar-shapes/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ success: false, error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ success: false, error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { id } = appReq.params;
        await db.run('DELETE FROM jar_custom_shapes WHERE id = ?', [id]);
        appRes.json({ success: true, message: 'ลบโหลกำหนดเองแล้ว' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// [ADMIN] มอบสิทธิ์ PRO ให้ผู้ใช้
app.post('/api/admin/grant-pro', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username, days, proScopes } = appReq.body;
        if (!username) return appRes.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้' });

        const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });

        const addDays = parseInt(days) || 30;
        const base = user.proExpireAt && new Date(user.proExpireAt) > new Date() ? new Date(user.proExpireAt) : new Date();
        base.setDate(base.getDate() + addDays);
        let scopesJson = JSON.stringify(['all']);
        if (Array.isArray(proScopes) && proScopes.length) {
            const scopes = proScopes.includes('all') ? ['all'] : proScopes;
            scopesJson = JSON.stringify(scopes);
        }
        await db.run('UPDATE users SET isPro = 1, proExpireAt = ?, proScopes = ? WHERE id = ?', [base.toISOString(), scopesJson, user.id]);

        appRes.json({ success: true, message: `มอบ PRO ${addDays} วันให้ @${user.username} สำเร็จ`, proExpireAt: base.toISOString(), proScopes: JSON.parse(scopesJson) });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// [ADMIN] ยกเลิกสิทธิ์ PRO
app.post('/api/admin/revoke-pro', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username } = appReq.body;
        const user = await db.get('SELECT * FROM users WHERE username = ?', [(username || '').trim()]);
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });

        await db.run('UPDATE users SET isPro = 0, proExpireAt = NULL WHERE id = ?', [user.id]);
        appRes.json({ success: true, message: `ยกเลิก PRO ของ @${user.username} แล้ว` });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

app.post('/api/admin/grant-gamecenter', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }
        const { username, days } = appReq.body || {};
        const user = await db.get('SELECT * FROM users WHERE username = ?', [(username || '').trim()]);
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });
        const entitlements = mergeGameCenterEntitlement(user.entitlements, {
            days: days == null || days === '' ? null : (Number.isFinite(Number(days)) ? Math.floor(Number(days)) : null),
            source: 'admin',
            planId: 'admin_grant'
        });
        await db.run('UPDATE users SET entitlements = ? WHERE id = ?', [JSON.stringify(entitlements), user.id]);
        appRes.json({
            success: true,
            message: `มอบ Game Center Early Access ให้ @${user.username} แล้ว`,
            entitlements: entitlementsForApi(entitlements)
        });
    } catch (err) {
        console.error('[admin/grant-gamecenter]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

app.post('/api/admin/revoke-gamecenter', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }
        const { username } = appReq.body || {};
        const user = await db.get('SELECT * FROM users WHERE username = ?', [(username || '').trim()]);
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });
        const entitlements = revokeGameCenterEntitlement(user.entitlements);
        await db.run('UPDATE users SET entitlements = ? WHERE id = ?', [JSON.stringify(entitlements), user.id]);
        appRes.json({ success: true, message: `ถอน Game Center Pass ของ @${user.username} แล้ว` });
    } catch (err) {
        console.error('[admin/revoke-gamecenter]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

// [ADMIN] ดึงรายชื่อสมาชิกทั้งหมดและวันหมดอายุ PRO
app.get('/api/admin/members', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        
        const list = await db.all('SELECT id, username, isPro, proExpireAt FROM users ORDER BY id ASC');
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ตรวจสอบ PIN แอดมิน (ปลดล็อกตั้งค่ากาชาเท่านั้น — ไม่ให้สิทธิ์ Admin Panel)
registerVerifyPinRoute(app, JWT_SECRET);

async function getAuthUserFromRequest(appReq) {
    const authHeader = appReq.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
}

app.get('/api/friends', async (appReq, appRes) => {
    try {
        const user = await getAuthUserFromRequest(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const list = await db.all(
            'SELECT * FROM user_friends WHERE ownerId = ? ORDER BY createdAt DESC LIMIT 200',
            [String(user.id)]
        );
        const incoming = await db.all(
            "SELECT * FROM friend_requests WHERE toUserId = ? AND status = 'pending' ORDER BY createdAt DESC LIMIT 100",
            [String(user.id)]
        );
        const outgoing = await db.all(
            "SELECT * FROM friend_requests WHERE fromUserId = ? AND status = 'pending' ORDER BY createdAt DESC LIMIT 100",
            [String(user.id)]
        );
        appRes.json({ success: true, list, incoming, outgoing });
    } catch (err) {
        console.error('[friends GET]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.get('/api/friends/presence', async (appReq, appRes) => {
    try {
        const ids = String(appReq.query.ids || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 200);
        const presence = {};
        for (const id of ids) {
            let online = false;
            let isLive = false;
            let tiktokUsername = '';
            try {
                const friend = await db.get(
                    'SELECT id, streamToken, username FROM users WHERE id = ? OR CAST(id AS TEXT) = ?',
                    [id, String(id)]
                );
                if (friend?.streamToken && activePanels[friend.streamToken]) {
                    online = true;
                }
            } catch (e) {}
            for (const [uname, session] of Object.entries(activeTiktokSessions)) {
                if (String(session.userId) === String(id)) {
                    online = true;
                    if (session.isLive) {
                        isLive = true;
                        tiktokUsername = session.tiktokUsername || uname || '';
                    }
                }
            }
            presence[String(id)] = { online, isLive, tiktokUsername };
        }
        appRes.json({ success: true, presence });
    } catch (err) {
        console.error('[friends presence]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

async function localInsertFriendLink(ownerUser, friendUser) {
    const createdAt = new Date().toISOString();
    const result = await db.run(
        'INSERT INTO user_friends (ownerId, friendUserId, friendUsername, friendDisplayName, friendAvatarUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [
            String(ownerUser.id),
            String(friendUser.id),
            friendUser.username,
            friendUser.displayName || friendUser.username,
            friendUser.avatarUrl || null,
            createdAt
        ]
    );
    return result.id;
}

async function localRefreshFriendsCount(userId) {
    try {
        const uid = String(userId);
        const row = await db.get('SELECT COUNT(*) AS c FROM user_friends WHERE ownerId = ?', [uid]);
        const count = Number(row?.c || 0);
        if (typeof db.updateSocialProfile === 'function') {
            await db.updateSocialProfile(uid, { friendsCount: count });
        }
        return count;
    } catch (_) {
        return 0;
    }
}

async function localAfterFriendsLinked(userA, userB) {
    await localRefreshFriendsCount(userA.id);
    await localRefreshFriendsCount(userB.id);
    try {
        const { evaluateUserAchievements } = require('./achievement_evaluator');
        await evaluateUserAchievements(db, userA);
        await evaluateUserAchievements(db, userB);
    } catch (_) {}
}

app.post('/api/friends', async (appReq, appRes) => {
    try {
        const user = await getAuthUserFromRequest(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const username = String(appReq.body?.username || '').trim();
        if (!username) return appRes.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้' });
        const target = await db.get(
            'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
            [username]
        );
        if (!target) return appRes.status(400).json({ error: 'ไม่พบผู้ใช้นี้' });
        if (String(target.id) === String(user.id)) {
            return appRes.status(400).json({ error: 'ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้' });
        }
        if (await db.getBlockBetween(user.id, target.id)) {
            return appRes.status(403).json({ error: 'ไม่สามารถส่งคำขอเป็นเพื่อนได้' });
        }
        const already = await db.get(
            'SELECT id FROM user_friends WHERE ownerId = ? AND friendUserId = ?',
            [String(user.id), String(target.id)]
        );
        if (already) return appRes.status(400).json({ error: 'เป็นเพื่อนกันอยู่แล้ว' });

        const pendingOut = await db.get(
            "SELECT id FROM friend_requests WHERE fromUserId = ? AND toUserId = ? AND status = 'pending'",
            [String(user.id), String(target.id)]
        );
        if (pendingOut) return appRes.status(400).json({ error: 'ส่งคำขอไปแล้ว รอการตอบรับ' });

        const pendingIn = await db.get(
            "SELECT * FROM friend_requests WHERE fromUserId = ? AND toUserId = ? AND status = 'pending'",
            [String(target.id), String(user.id)]
        );
        if (pendingIn) {
            await db.run("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", [pendingIn.id]);
            await localInsertFriendLink(user, target);
            await localInsertFriendLink(target, user);
            await localAfterFriendsLinked(user, target);
            return appRes.json({
                success: true,
                accepted: true,
                message: `ตอบรับคำขอจาก @${target.username} แล้ว — เป็นเพื่อนกันแล้ว`
            });
        }

        const createdAt = new Date().toISOString();
        const result = await db.run(
            'INSERT INTO friend_requests (fromUserId, fromUsername, fromDisplayName, fromAvatarUrl, toUserId, toUsername, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                String(user.id),
                user.username,
                user.displayName || user.username,
                user.avatarUrl || null,
                String(target.id),
                target.username,
                'pending',
                createdAt
            ]
        );
        appRes.json({
            success: true,
            requested: true,
            message: `ส่งคำขอเป็นเพื่อนถึง @${target.username} แล้ว`,
            request: { id: result.id }
        });
    } catch (err) {
        console.error('[friends POST]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/friends/requests/:id/accept', async (appReq, appRes) => {
    try {
        const user = await getAuthUserFromRequest(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const req = await db.get('SELECT * FROM friend_requests WHERE id = ?', [appReq.params.id]);
        if (!req) return appRes.status(404).json({ error: 'ไม่พบคำขอ' });
        if (String(req.toUserId) !== String(user.id)) return appRes.status(403).json({ error: 'ไม่มีสิทธิ์ตอบรับคำขอนี้' });
        if (req.status !== 'pending') return appRes.status(400).json({ error: 'คำขอนี้ถูกจัดการแล้ว' });
        if (await db.getBlockBetween(user.id, req.fromUserId)) {
            return appRes.status(403).json({ error: 'ไม่สามารถตอบรับคำขอนี้ได้' });
        }
        await db.run("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", [req.id]);
        const fromUser = await db.get('SELECT * FROM users WHERE id = ? OR CAST(id AS TEXT) = ?', [req.fromUserId, String(req.fromUserId)])
            || { id: req.fromUserId, username: req.fromUsername, displayName: req.fromDisplayName, avatarUrl: req.fromAvatarUrl };
        const existsA = await db.get('SELECT id FROM user_friends WHERE ownerId = ? AND friendUserId = ?', [String(user.id), String(fromUser.id)]);
        if (!existsA) await localInsertFriendLink(user, fromUser);
        const existsB = await db.get('SELECT id FROM user_friends WHERE ownerId = ? AND friendUserId = ?', [String(fromUser.id), String(user.id)]);
        if (!existsB) await localInsertFriendLink(fromUser, user);
        await localAfterFriendsLinked(user, fromUser);
        appRes.json({ success: true, message: `เป็นเพื่อนกับ @${fromUser.username} แล้ว` });
    } catch (err) {
        console.error('[friends accept]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/friends/requests/:id/reject', async (appReq, appRes) => {
    try {
        const user = await getAuthUserFromRequest(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const req = await db.get('SELECT * FROM friend_requests WHERE id = ?', [appReq.params.id]);
        if (!req) return appRes.status(404).json({ error: 'ไม่พบคำขอ' });
        if (String(req.toUserId) !== String(user.id)) return appRes.status(403).json({ error: 'ไม่มีสิทธิ์' });
        await db.run("UPDATE friend_requests SET status = 'rejected' WHERE id = ?", [req.id]);
        appRes.json({ success: true });
    } catch (err) {
        console.error('[friends reject]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.delete('/api/friends/:id', async (appReq, appRes) => {
    try {
        const user = await getAuthUserFromRequest(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const row = await db.get(
            'SELECT * FROM user_friends WHERE id = ? AND ownerId = ?',
            [appReq.params.id, String(user.id)]
        );
        if (!row) return appRes.status(404).json({ error: 'ไม่พบรายการเพื่อน' });
        await db.run('DELETE FROM user_friends WHERE id = ? AND ownerId = ?', [appReq.params.id, String(user.id)]);
        await db.run(
            'DELETE FROM user_friends WHERE ownerId = ? AND friendUserId = ?',
            [String(row.friendUserId), String(user.id)]
        );
        await localRefreshFriendsCount(user.id);
        await localRefreshFriendsCount(row.friendUserId);
        appRes.json({ success: true });
    } catch (err) {
        console.error('[friends DELETE]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

const ANNOUNCEMENT_CATEGORIES = new Set(['update', 'news', 'promo', 'event', 'notice', 'maintenance', 'important', 'other', 'alert', 'feature']);
const ANNOUNCEMENT_STATUSES = new Set(['draft', 'scheduled', 'published', 'archived']);
const ANNOUNCEMENT_AUDIENCES = new Set(['all', 'free', 'pro', 'group', 'custom']);
const { normalizePopupFields, hydrateList, registerAnnouncementPopupApi, Popup } = require('./announcement_popup_api');

function normalizeAnnouncementInput(body = {}) {
    const ctaButtons = Array.isArray(body.ctaButtons)
        ? body.ctaButtons.slice(0, 3).map((cta) => ({
            label: String(cta?.label || '').trim().slice(0, 80),
            url: String(cta?.url || '').trim().slice(0, 500),
            icon: String(cta?.icon || '').trim().slice(0, 40),
            style: ['primary', 'secondary', 'danger'].includes(cta?.style) ? cta.style : 'primary'
        })).filter((cta) => cta.label)
        : [];
    const status = ANNOUNCEMENT_STATUSES.has(body.status) ? body.status : 'published';
    const publishAt = body.publishAt && !Number.isNaN(Date.parse(body.publishAt))
        ? new Date(body.publishAt).toISOString()
        : null;
    const expireAt = body.expireAt && !Number.isNaN(Date.parse(body.expireAt))
        ? new Date(body.expireAt).toISOString()
        : null;
    const out = {
        title: String(body.title || '').trim().slice(0, 120),
        message: String(body.message || '').trim().slice(0, 100000),
        summary: body.summary ? String(body.summary).trim().slice(0, 300) : null,
        category: ANNOUNCEMENT_CATEGORIES.has(body.category) ? body.category : 'notice',
        imageUrl: body.imageUrl ? String(body.imageUrl).slice(0, 7_000_000) : null,
        important: body.important ? 1 : 0,
        contentHtml: body.contentHtml ? String(body.contentHtml).slice(0, 200000) : null,
        ctaButtons,
        ctaLabel: ctaButtons[0]?.label || (body.ctaLabel ? String(body.ctaLabel).trim().slice(0, 80) : null),
        ctaUrl: ctaButtons[0]?.url || (body.ctaUrl ? String(body.ctaUrl).trim().slice(0, 500) : null),
        status,
        audience: ANNOUNCEMENT_AUDIENCES.has(body.audience) ? body.audience : 'all',
        audienceConfig: body.audienceConfig ? String(body.audienceConfig).slice(0, 5000) : null,
        publishAt: status === 'scheduled' ? publishAt : (publishAt || new Date().toISOString()),
        expireAt,
        timezone: body.timezone ? String(body.timezone).slice(0, 80) : 'Asia/Bangkok',
        displayHome: body.displayHome === false ? 0 : 1,
        showNotification: body.showNotification === false ? 0 : 1,
        pinned: body.pinned ? 1 : 0,
        showPopup: body.showPopup ? 1 : 0,
        displayType: 'notice',
        announcementType: 'notice',
        priority: 0,
        locale: 'th',
        popupConfig: null
    };
    const popup = normalizePopupFields(body, out);
    out.displayType = popup.displayType;
    out.announcementType = popup.announcementType;
    out.priority = popup.priority;
    out.locale = popup.locale;
    out.popupConfig = popup.popupConfig;
    out.showPopup = popup.showPopup;
    if (out.displayType === 'popup' && !out.message) out.message = out.title;
    return out;
}

// [ADMIN] ส่งประกาศถึงผู้ใช้ทั้งหมด
app.post('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const ann = normalizeAnnouncementInput(appReq.body);
        if (!ann.title || !ann.message) {
            return appRes.status(400).json({ error: 'กรุณากรอกหัวข้อและข้อความประกาศ' });
        }

        const adminUser = await db.get('SELECT username FROM users WHERE id = ?', [decoded.userId]);
        const createdAt = new Date().toISOString();
        const result = await db.run(
            `INSERT INTO announcements (
                title, message, imageUrl, important, category, summary, ctaLabel, ctaUrl,
                contentHtml, ctaButtons, status, audience, audienceConfig, publishAt, expireAt,
                timezone, displayHome, showNotification, pinned, showPopup, displayType, announcementType,
                priority, locale, popupConfig, createdAt, createdBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ann.title, ann.message, ann.imageUrl, ann.important, ann.category, ann.summary,
                ann.ctaLabel, ann.ctaUrl, ann.contentHtml, JSON.stringify(ann.ctaButtons),
                ann.status, ann.audience, ann.audienceConfig, ann.publishAt, ann.expireAt,
                ann.timezone, ann.displayHome, ann.showNotification, ann.pinned, ann.showPopup,
                ann.displayType, ann.announcementType, ann.priority, ann.locale,
                ann.popupConfig ? JSON.stringify(ann.popupConfig) : null,
                createdAt, adminUser?.username || 'admin'
            ]
        );

        const payload = {
            id: result.id,
            ...ann,
            important: !!ann.important,
            displayHome: !!ann.displayHome,
            showNotification: !!ann.showNotification,
            pinned: !!ann.pinned,
            showPopup: !!ann.showPopup,
            createdAt,
            createdBy: adminUser?.username || 'admin'
        };

        if (ann.status === 'published' && ann.showNotification) io.emit('app_announcement', payload);
        appRes.json({ success: true, announcement: payload });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งประกาศ' });
    }
});

// [ADMIN] ดึงประกาศทั้งหมด (สำหรับหน้าแอดมิน)
app.get('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const list = await db.all('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 50');
        appRes.json({ success: true, list: hydrateList(list) });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.patch('/api/admin/announcements/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const id = parseInt(appReq.params.id, 10);
        if (!id) return appRes.status(400).json({ error: 'รหัสประกาศไม่ถูกต้อง' });
        const oldValue = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
        if (!oldValue) return appRes.status(404).json({ error: 'ไม่พบประกาศนี้' });

        const patch = appReq.body || {};
        const allowed = [
            'title', 'message', 'summary', 'category', 'imageUrl', 'important', 'contentHtml',
            'ctaButtons', 'ctaLabel', 'ctaUrl', 'status', 'audience', 'audienceConfig',
            'publishAt', 'expireAt', 'timezone', 'displayHome', 'showNotification',
            'pinned', 'showPopup', 'displayType', 'announcementType', 'priority', 'locale', 'popupConfig'
        ];
        const values = {};
        allowed.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(patch, key)) values[key] = patch[key];
        });
        if (patch.archived === true || patch.status === 'archived') {
            values.status = 'archived';
            values.archivedAt = new Date().toISOString();
        }
        if (Array.isArray(values.ctaButtons)) values.ctaButtons = JSON.stringify(values.ctaButtons.slice(0, 3));
        if (values.popupConfig && typeof values.popupConfig === 'object') values.popupConfig = JSON.stringify(values.popupConfig);
        const popupNorm = normalizePopupFields(patch, oldValue);
        if (Object.prototype.hasOwnProperty.call(patch, 'displayType') || Object.prototype.hasOwnProperty.call(patch, 'popupConfig') || Object.prototype.hasOwnProperty.call(patch, 'showPopup')) {
            values.displayType = popupNorm.displayType;
            values.announcementType = popupNorm.announcementType;
            values.priority = popupNorm.priority;
            values.locale = popupNorm.locale;
            values.popupConfig = popupNorm.popupConfig ? JSON.stringify(popupNorm.popupConfig) : values.popupConfig;
            values.showPopup = popupNorm.showPopup;
        }
        ['important', 'displayHome', 'showNotification', 'pinned', 'showPopup'].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(values, key)) values[key] = values[key] ? 1 : 0;
        });
        values.updatedAt = new Date().toISOString();
        const entries = Object.entries(values);
        if (!entries.length) return appRes.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' });
        await db.run(
            `UPDATE announcements SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
            [...entries.map(([, value]) => value), id]
        );
        const adminUser = await db.get('SELECT username FROM users WHERE id = ?', [decoded.userId]);
        await db.run(
            'INSERT INTO announcement_revisions (announcementId, action, oldValue, newValue, changedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [id, 'updated', JSON.stringify(oldValue), JSON.stringify(values), adminUser?.username || 'admin', values.updatedAt]
        );
        const announcement = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
        io.emit('app_announcement_updated', announcement);
        appRes.json({ success: true, announcement });
    } catch (err) {
        console.error('[admin/announcements PATCH]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตประกาศ' });
    }
});

app.get('/api/admin/announcements/:id/revisions', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const id = parseInt(appReq.params.id, 10);
        const list = await db.all(
            'SELECT * FROM announcement_revisions WHERE announcementId = ? ORDER BY createdAt DESC LIMIT 100',
            [id]
        );
        appRes.json({ success: true, list });
    } catch (err) {
        console.error('[admin/announcements revisions]', err);
        appRes.status(500).json({ error: 'โหลด Revision ไม่สำเร็จ' });
    }
});

// [ADMIN] ลบประกาศ
app.delete('/api/admin/announcements/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const id = parseInt(appReq.params.id, 10);
        if (!id) return appRes.status(400).json({ error: 'รหัสประกาศไม่ถูกต้อง' });

        const result = await db.run('DELETE FROM announcements WHERE id = ?', [id]);
        if (!result.changes) return appRes.status(404).json({ error: 'ไม่พบประกาศนี้' });

        io.emit('app_announcement_removed', { id });
        appRes.json({ success: true, id });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบประกาศ' });
    }
});

// [ADMIN] ลบประกาศทั้งหมด
app.delete('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const result = await db.run('DELETE FROM announcements');
        io.emit('app_announcements_cleared', {});
        appRes.json({ success: true, deleted: result.changes || 0 });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบประกาศ' });
    }
});

function localRequireAdmin(req, res) {
    return (async () => {
        const authHeader = req.headers.authorization;
        if (!authHeader) { res.status(401).json({ error: 'No token' }); return null; }
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            if (!(await isAdminUser(decoded.userId))) {
                res.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
                return null;
            }
            const adminUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', [decoded.userId]);
            return { id: decoded.userId, username: adminUser?.username || 'admin', role: 'admin' };
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
    })();
}
function localRequireUser(req, res) {
    return (async () => {
        const authHeader = req.headers.authorization;
        if (!authHeader) { res.status(401).json({ error: 'No token' }); return null; }
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            const user = await db.get('SELECT id, username, role, isPro, proExpireAt FROM users WHERE id = ?', [decoded.userId]);
            return user || { id: decoded.userId, role: 'free' };
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
    })();
}
registerAnnouncementPopupApi(app, {
    requireAdmin: localRequireAdmin,
    requireUser: localRequireUser,
    db: {
        get: (...args) => db.get(...args),
        run: (...args) => db.run(...args),
        all: (...args) => db.all(...args),
        getAnnouncement: (id) => db.get('SELECT * FROM announcements WHERE id = ?', [id]),
        listAnnouncements: (lim) => db.all('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT ?', [Math.min(lim || 50, 200)]),
        async duplicateAnnouncement(id, changedBy) {
            const src = await db.get('SELECT * FROM announcements WHERE id = ?', [id]);
            if (!src) return null;
            const copy = normalizeAnnouncementInput({
                ...src,
                title: String(src.title || '') + ' (Copy)',
                status: 'draft',
                popupConfig: Popup.parseJson(src.popupConfig, src.popupConfig)
            });
            const createdAt = new Date().toISOString();
            const result = await db.run(
                `INSERT INTO announcements (
                    title, message, imageUrl, important, category, summary, ctaLabel, ctaUrl,
                    contentHtml, ctaButtons, status, audience, audienceConfig, publishAt, expireAt,
                    timezone, displayHome, showNotification, pinned, showPopup, displayType, announcementType,
                    priority, locale, popupConfig, createdAt, createdBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    copy.title, copy.message, copy.imageUrl, copy.important, copy.category, copy.summary,
                    copy.ctaLabel, copy.ctaUrl, copy.contentHtml, JSON.stringify(copy.ctaButtons || []),
                    'draft', copy.audience, copy.audienceConfig, copy.publishAt, copy.expireAt,
                    copy.timezone, copy.displayHome, copy.showNotification, copy.pinned, copy.showPopup,
                    copy.displayType, copy.announcementType, copy.priority, copy.locale,
                    copy.popupConfig ? JSON.stringify(copy.popupConfig) : src.popupConfig || null,
                    createdAt, changedBy
                ]
            );
            return { id: result.id, ...copy, status: 'draft', createdAt, createdBy: changedBy };
        }
    },
    io
});

// เวอร์ชันโปรแกรมปัจจุบัน
app.get('/api/app/version', (_appReq, appRes) => {
    try {
        const pkg = require('./package.json');
        // UI marketing version (electron-builder requires strict semver in package.json)
        const displayVersion = pkg.displayVersion || pkg.version || '0.0.0';
        appRes.json({
            success: true,
            version: displayVersion,
            buildVersion: pkg.version || '0.0.0',
            name: pkg.build?.productName || 'TokControl'
        });
    } catch (err) {
        appRes.json({ success: true, version: '0.0.0', name: 'TokControl' });
    }
});

app.get('/api/features', (_appReq, appRes) => {
    const flags = getGameCenterFlags();
    appRes.json({ success: true, gameCenter: flags });
});

// ส่งรายงานบัค / ข้อเสนอแนะ
app.post('/api/bug-reports', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนส่งรายงาน' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT id, username, displayName, avatarUrl FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return appRes.status(401).json({ error: 'ไม่พบบัญชีผู้ใช้' });

        const body = appReq.body || {};
        const trimmed = String(body.message || '').trim();
        if (!trimmed || trimmed.length < 10) {
            return appRes.status(400).json({ error: 'กรุณาอธิบายรายละเอียดอย่างน้อย 10 ตัวอักษร' });
        }
        const created = await db.createBugReport({
            userId: user.id,
            username: user.username,
            displayName: user.displayName || user.username,
            category: body.category,
            message: trimmed.slice(0, 2000),
            screenshotAssetId: body.screenshotAssetId || null,
            attachments: body.attachments,
            appVersion: body.appVersion || null,
            location: body.location,
            frequency: body.frequency,
            priority: body.priority,
            systemInfo: body.systemInfo,
            title: body.title,
            status: 'pending',
            createdAt: new Date().toISOString()
        });
        appRes.json({
            success: true,
            id: created.id,
            reportCode: created.reportCode,
            message: 'ส่งรายงานเรียบร้อยแล้ว ขอบคุณที่ช่วยพัฒนาโปรแกรม!'
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'ไม่สามารถส่งรายงานได้' });
    }
});

// [ADMIN] ดึงรายการรายงานบัคทั้งหมด
app.get('/api/admin/bug-reports', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const list = await db.listBugReports(200);
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// [ADMIN] อัปเดตสถานะรายงานบัค
app.patch('/api/admin/bug-reports/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const id = String(appReq.params.id || '').trim();
        if (!id) return appRes.status(400).json({ error: 'รหัสรายงานไม่ถูกต้อง' });

        const { status, adminNote, priority, assignedTo, assignedName, note } = appReq.body || {};
        const actorUser = await db.get('SELECT id, username, displayName FROM users WHERE id = ?', [decoded.userId]);
        const ok = await db.updateBugReport(id, {
            status,
            adminNote: adminNote != null ? String(adminNote).slice(0, 2000) : undefined,
            priority,
            assignedTo,
            assignedName,
            note
        }, {
            id: decoded.userId,
            name: actorUser?.displayName || actorUser?.username || decoded.username || 'Admin'
        });
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบรายงานนี้' });
        const updated = await db.getBugReport(id);
        appRes.json({ success: true, report: updated });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.delete('/api/admin/bug-reports/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const id = String(appReq.params.id || '').trim();
        if (!id) return appRes.status(400).json({ error: 'รหัสรายงานไม่ถูกต้อง' });
        const ok = await db.deleteBugReport(id);
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบรายงานนี้' });
        appRes.json({ success: true });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/announcements/:id/event', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const id = parseInt(appReq.params.id, 10);
        const eventType = String(appReq.body?.eventType || '');
        const eventToColumn = {
            view: 'views',
            read: 'reads',
            reaction: 'reactions',
            share: 'shares',
            cta_click: 'ctaClicks',
            impression: 'views',
            viewed: 'views',
            dismissed: 'reads',
            acknowledged: 'reads',
            secondary_click: 'ctaClicks'
        };
        const column = eventToColumn[eventType];
        if (!id || !column) return appRes.status(400).json({ error: 'ข้อมูล event ไม่ถูกต้อง' });
        if (eventType === 'view' || eventType === 'read') {
            const exists = await db.get(
                'SELECT id FROM announcement_events WHERE announcementId = ? AND userId = ? AND eventType = ? LIMIT 1',
                [id, String(decoded.userId), eventType]
            );
            if (exists) return appRes.json({ success: true, duplicate: true });
        }
        await db.run(
            'INSERT INTO announcement_events (announcementId, userId, eventType, createdAt) VALUES (?, ?, ?, ?)',
            [id, String(decoded.userId), eventType, new Date().toISOString()]
        );
        await db.run(`UPDATE announcements SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ?`, [id]);
        appRes.json({ success: true });
    } catch (err) {
        console.error('[announcements event]', err);
        appRes.status(500).json({ error: 'บันทึก event ไม่สำเร็จ' });
    }
});

// ดึงประกาศล่าสุด (ผู้ใช้ทั่วไป)
app.get('/api/announcements/recent', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await db.get('SELECT id, role, proExpireAt FROM users WHERE id = ?', [decoded.userId]);
        const now = new Date().toISOString();
        const candidates = await db.all(
            `SELECT * FROM announcements
             WHERE COALESCE(status, 'published') IN ('published', 'scheduled')
               AND (publishAt IS NULL OR publishAt <= ?)
               AND (expireAt IS NULL OR expireAt > ?)
               AND archivedAt IS NULL
             ORDER BY pinned DESC, createdAt DESC LIMIT 60`,
            [now, now]
        );
        const isPro = user?.role === 'pro' && (!user.proExpireAt || new Date(user.proExpireAt) > new Date());
        const list = candidates.filter((ann) => {
            const audience = ann.audience || 'all';
            if (audience === 'all') return true;
            if (audience === 'pro') return isPro;
            if (audience === 'free') return !isPro;
            if (audience === 'group' || audience === 'custom') {
                const ids = String(ann.audienceConfig || '').split(',').map((x) => x.trim()).filter(Boolean);
                return ids.includes(String(decoded.userId));
            }
            return false;
        }).slice(0, 30);
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

function sanitizeAePresetPayload(payload) {
    const src = payload && typeof payload === 'object' ? payload : {};
    return {
        actions: src.actions && typeof src.actions === 'object' ? src.actions : {},
        events: src.events && typeof src.events === 'object' ? src.events : {},
        screens: Array.isArray(src.screens) ? src.screens : []
    };
}

app.post('/api/admin/ae-presets', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { id, name, description, coverUrl, payload } = appReq.body || {};
        if (!name || !String(name).trim()) {
            return appRes.status(400).json({ error: 'กรุณาระบุชื่อพรีเซ็ต' });
        }
        if (!payload || typeof payload !== 'object') {
            return appRes.status(400).json({ error: 'กรุณาส่ง payload ของ Actions & Events' });
        }
        const presetId = id && String(id).trim()
            ? String(id).trim()
            : ('aep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const now = new Date().toISOString();
        const cleanPayload = sanitizeAePresetPayload(payload);
        const user = await db.get('SELECT username FROM users WHERE id = ?', [decoded.userId]);
        const existing = await db.get('SELECT id, createdAt, createdBy FROM ae_presets WHERE id = ?', [presetId]);
        if (existing) {
            await db.run(
                'UPDATE ae_presets SET name = ?, description = ?, coverUrl = ?, payload = ?, updatedAt = ? WHERE id = ?',
                [String(name).trim(), description ? String(description).trim() : '', coverUrl || null, JSON.stringify(cleanPayload), now, presetId]
            );
        } else {
            await db.run(
                'INSERT INTO ae_presets (id, name, description, coverUrl, payload, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [presetId, String(name).trim(), description ? String(description).trim() : '', coverUrl || null, JSON.stringify(cleanPayload), user?.username || 'admin', now, now]
            );
        }
        appRes.json({
            success: true,
            preset: {
                id: presetId,
                name: String(name).trim(),
                description: description ? String(description).trim() : '',
                coverUrl: coverUrl || null,
                updatedAt: now
            }
        });
    } catch (err) {
        console.error('[admin/ae-presets POST]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกพรีเซ็ต' });
    }
});

app.get('/api/ae-presets', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const list = await db.all(
            'SELECT id, name, description, coverUrl, createdBy, createdAt, updatedAt FROM ae_presets ORDER BY updatedAt DESC LIMIT 100'
        );
        appRes.json({ success: true, list: list || [] });
    } catch (err) {
        console.error('[ae-presets GET]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.get('/api/ae-presets/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const row = await db.get('SELECT * FROM ae_presets WHERE id = ?', [appReq.params.id]);
        if (!row) return appRes.status(404).json({ error: 'ไม่พบพรีเซ็ต' });
        let payload = {};
        try { payload = JSON.parse(row.payload || '{}'); } catch (_) { payload = {}; }
        appRes.json({
            success: true,
            preset: {
                id: row.id,
                name: row.name,
                description: row.description || '',
                coverUrl: row.coverUrl || null,
                payload,
                createdBy: row.createdBy || null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            }
        });
    } catch (err) {
        console.error('[ae-presets/:id GET]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.delete('/api/admin/ae-presets/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }
        await db.run('DELETE FROM ae_presets WHERE id = ?', [appReq.params.id]);
        appRes.json({ success: true, id: appReq.params.id });
    } catch (err) {
        console.error('[admin/ae-presets DELETE]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// [ADMIN] ดึงรายชื่อสมาชิกที่กำลังไลฟ์อยู่ในโปรแกรมปัจจุบัน
app.get('/api/admin/active-streamers', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        
        const list = await collectActiveLiveStreamers();
        
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสตรีมเมอร์ที่กำลังไลฟ์' });
    }
});

// MyInstants.com sound library (ค้นหา/เลือกแบบ on-demand — ไม่มี official API)
const MYINSTANTS_BASE = 'https://www.myinstants.com';
const MYINSTANTS_CATEGORIES = [
    { id: 'recent', label: 'ล่าสุด', path: '/en/recent/' },
    { id: 'memes', label: 'Memes', path: '/en/categories/memes/' },
    { id: 'games', label: 'Games', path: '/en/categories/games/' },
    { id: 'reactions', label: 'Reactions', path: '/en/categories/reactions/' },
    { id: 'sound-effects', label: 'Sound FX', path: '/en/categories/sound%20effects/' },
    { id: 'tiktok-trends', label: 'TikTok', path: '/en/categories/tiktok%20trends/' },
    { id: 'viral', label: 'Viral', path: '/en/categories/viral/' },
    { id: 'anime-manga', label: 'Anime', path: '/en/categories/anime%20%26%20manga/' }
];

function fetchMyInstantsHtml(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${MYINSTANTS_BASE}${pathOrUrl}`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (TokControl)' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchMyInstantsHtml(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(12000, () => req.destroy(new Error('MyInstants request timeout')));
    });
}

function parseMyInstantsHtml(html) {
    const results = [];
    const seen = new Set();
    const re = /onclick="play\('([^']+)',\s*'[^']+',\s*'([^']+)'\)"[\s\S]*?<a href="\/en\/instant\/([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
        const soundPath = match[1];
        const slug = match[3].replace(/\/$/, '');
        const name = match[4].trim();
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        results.push({
            slug,
            name,
            soundUrl: soundPath.startsWith('http') ? soundPath : `${MYINSTANTS_BASE}${soundPath}`
        });
    }
    return results;
}

app.get('/api/myinstants/categories', (appReq, appRes) => {
    appRes.json({ success: true, categories: MYINSTANTS_CATEGORIES });
});

app.get('/api/myinstants/search', async (appReq, appRes) => {
    try {
        const q = String(appReq.query.q || '').trim();
        if (!q) return appRes.status(400).json({ error: 'กรุณาระบุคำค้นหา' });
        const html = await fetchMyInstantsHtml(`/en/search/?name=${encodeURIComponent(q)}`);
        appRes.json({ success: true, list: parseMyInstantsHtml(html).slice(0, 40) });
    } catch (err) {
        console.error('MyInstants search error:', err.message);
        appRes.status(500).json({ error: 'ค้นหา MyInstants ไม่สำเร็จ' });
    }
});

app.get('/api/myinstants/browse', async (appReq, appRes) => {
    try {
        const category = String(appReq.query.category || 'recent').trim();
        const cat = MYINSTANTS_CATEGORIES.find(c => c.id === category) || MYINSTANTS_CATEGORIES[0];
        const html = await fetchMyInstantsHtml(cat.path);
        appRes.json({ success: true, category: cat.id, list: parseMyInstantsHtml(html).slice(0, 40) });
    } catch (err) {
        console.error('MyInstants browse error:', err.message);
        appRes.status(500).json({ error: 'โหลดหมวดหมู่ MyInstants ไม่สำเร็จ' });
    }
});

// ========== R.E.P.O. Mod Bridge (TokControl_REPO_Tiktoklive) ==========

function parseRepoBridgeUrl(host) {
    let raw = String(host || 'ws://127.0.0.1:8080').trim();
    if (raw.startsWith('ws://')) raw = 'http://' + raw.slice(5);
    else if (raw.startsWith('wss://')) raw = 'https://' + raw.slice(6);
    else if (!raw.startsWith('http')) raw = 'http://' + raw;
    const parsed = new URL(raw.endsWith('/') ? raw : raw + '/');
    return {
        hostname: parsed.hostname || '127.0.0.1',
        port: parseInt(parsed.port, 10) || 8080,
        pathPrefix: (parsed.pathname || '/').replace(/\/$/, '')
    };
}

const repoBridgeHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 16 });

function repoBridgeHttpRequest(host, { method = 'GET', path = '/health', body = null, timeoutMs = 8000 }) {
    return new Promise((resolve, reject) => {
        const { hostname, port, pathPrefix } = parseRepoBridgeUrl(host);
        const fullPath = ((pathPrefix || '') + path).replace(/\/{2,}/g, '/') || '/';
        const headers = {};
        let payload = null;
        if (body != null) {
            payload = typeof body === 'string' ? body : JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(payload);
        }
        // Paper plugin :8081 — ส่ง shared bridge token
        if (MC_BRIDGE_TOKEN && (String(port) === '8081' || /:8081\b/.test(String(host || '')))) {
            headers['X-TokControl-Token'] = MC_BRIDGE_TOKEN;
        }
        const req = http.request({
            hostname,
            port,
            path: fullPath,
            method,
            headers,
            timeout: timeoutMs,
            agent: repoBridgeHttpAgent
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let json = {};
                try { json = data ? JSON.parse(data) : {}; } catch (e) { json = { raw: data }; }
                resolve({ status: res.statusCode || 0, data: json });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (payload) req.write(payload);
        req.end();
    });
}

function isMinecraftBridgeHost(host) {
    const h = String(host || '');
    return /:8081\b/.test(h) || /minecraft/i.test(h);
}

function stopMinecraftTestBridgeSafe() {
    try {
        const bridge = require('./tools/minecraft-bridge-server');
        bridge.stopMinecraftTestBridge();
        return true;
    } catch (e) {
        return false;
    }
}

/** ไม่สตาร์ท test bridge อัตโนมัติ — จะแย่งพอร์ต 8081 จาก Paper plugin */
async function ensureMinecraftTestBridge() {
    return { ok: false, skipped: true, reason: 'disabled_use_paper_plugin' };
}

let mcBridgeRefusedLogAt = 0;

async function executeRepoBridgeCommand(host, command, opts = {}) {
    const cmd = String(command || '').trim();
    const bridgeHost = host || 'ws://127.0.0.1:8080';
    const label = opts.gameId === 'minecraft' || isMinecraftBridgeHost(bridgeHost) ? 'Minecraft' : 'REPO';
    if (label === 'Minecraft') {
        const mcStatus = mcLauncher ? mcLauncher.getMcServerStatus() : null;
        const paperActive = mcStatus && (mcStatus.running || mcStatus.installed);
        if (paperActive) {
            stopMinecraftTestBridgeSafe();
        }
    }
    try {
        if (cmd === 'ping' || cmd === 'health') {
            const res = await repoBridgeHttpRequest(bridgeHost, { method: 'GET', path: '/health' });
            const mod = String(res.data?.mod || '');
            const isTestBridge = mod.includes('TestBridge');
            const mcRunning = mcLauncher && mcLauncher.getMcServerStatus().running;
            if (label === 'Minecraft' && isTestBridge && mcRunning) {
                stopMinecraftTestBridgeSafe();
                return {
                    success: false,
                    method: 'http',
                    message: 'plugin_loading',
                    detail: res.data,
                    mod,
                    error: 'Test bridge blocked port — waiting for Paper plugin'
                };
            }
            const ok = res.status === 200 && (res.data.ok === true || res.data.success !== false) && !isTestBridge;
            return {
                success: ok,
                method: 'http',
                message: ok ? 'pong' : 'bridge_unreachable',
                detail: res.data,
                pendingWinDelta: Number(res.data?.pendingWinDelta || 0),
                mod: res.data.mod || (label === 'Minecraft' ? 'TokControl_Minecraft_TestBridge' : 'TokControl_REPO_Tiktoklive'),
                version: res.data?.version || ''
            };
        }
        const body = cmd.startsWith('{') ? cmd : cmd;
        const res = await repoBridgeHttpRequest(bridgeHost, { method: 'POST', path: '/', body });
        const ok = res.status === 200 && res.data.success !== false;
        return {
            success: ok,
            method: 'http',
            message: res.data.message || (ok ? 'ok' : 'failed'),
            detail: res.data.detail || res.data,
            pendingWinDelta: Number(res.data?.pendingWinDelta || 0),
            error: ok ? undefined : (res.data.message || 'spawn_failed')
        };
    } catch (err) {
        const isRefused = /ECONNREFUSED/i.test(err.message);
        if (!(label === 'Minecraft' && isRefused && (cmd === 'health' || cmd === 'ping'))) {
            console.warn(`[GameMod] ${label} bridge error:`, err.message);
        } else if (Date.now() - mcBridgeRefusedLogAt > 30000) {
            mcBridgeRefusedLogAt = Date.now();
            console.warn(`[GameMod] Minecraft plugin ยังไม่พร้อม (port 8081) — รอเซิร์ฟโหลดเสร็จ`);
        }
        if (label === 'Minecraft' && isRefused) {
            return { success: false, method: 'http', error: err.message, message: 'plugin_not_ready' };
        }
        return { success: false, method: 'http', error: err.message, message: err.message };
    }
}

// ── Memory Match game install ──────────────────────────────────────────────
function resolveMmGameDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'games', 'memory-match');
        }
    } catch (e) { /* not electron */ }
    return path.join(process.cwd(), 'games', 'memory-match');
}

function copyDirRecursive(src, dest) {
    const fs = require('fs');
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

app.get('/api/games/memory-match/status', (req, res) => {
    const fs = require('fs');
    const dest = resolveMmGameDir();
    const bundled = fs.existsSync(path.join(__dirname, 'games', 'memory-match', 'index.html'));
    const installed = fs.existsSync(path.join(dest, 'index.html')) || bundled;
    res.json({ success: true, installed, bundled, path: dest });
});

app.post('/api/games/memory-match/install', (req, res) => {
    const fs = require('fs');
    try {
        const src = path.join(__dirname, 'games', 'memory-match');
        const dest = resolveMmGameDir();
        if (!fs.existsSync(src)) {
            return res.status(404).json({ success: false, error: 'ไม่พบไฟล์เกมในแพ็กเกจ' });
        }
        copyDirRecursive(src, dest);
        console.log('[MemoryMatch] Installed to', dest);
        res.json({ success: true, path: dest });
    } catch (err) {
        console.warn('[MemoryMatch] install failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Minecraft Troll Server ─────────────────────────────────────────────────
const mcLauncher = (() => {
    try { return require('./tools/minecraft-server-launcher'); } catch (e) { return null; }
})();

app.get('/api/games/minecraft/status', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.query?.world || req.query?.mode || null;
        const ports = await mcLauncher.probeMcPorts();
        res.json({
            success: true,
            ...mcLauncher.getMcServerStatus(world ? { world } : {}),
            ...ports
        });
    } catch (e) {
        const world = req.query?.world || req.query?.mode || null;
        res.json({ success: true, ...mcLauncher.getMcServerStatus(world ? { world } : {}) });
    }
});

app.post('/api/games/minecraft/setup', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.body?.world || req.body?.mode || 'box';
        const result = await mcLauncher.setupMcServer({ world });
        res.json(result);
    } catch (err) {
        console.warn('[MC Server] setup failed:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/games/minecraft/progress', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const progress = typeof mcLauncher.getMcProgress === 'function'
            ? mcLauncher.getMcProgress()
            : { active: false, message: '' };
        res.json({ success: true, ...progress });
    } catch (e) {
        res.json({ success: true, active: false, message: '' });
    }
});

app.post('/api/games/minecraft/start', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.body?.world || req.body?.mode || 'box';
        const result = await mcLauncher.startMcServer({ world });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/games/minecraft/stop', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const result = await mcLauncher.stopMcServerAsync();
        res.json(result);
    } catch (e) {
        res.json(mcLauncher.stopMcServer());
    }
});

app.post('/api/games/minecraft/reset', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    // กันค้างทั้งแอป — ตอบภายในเวลาจำกัด
    const world = req.body?.world || req.body?.mode || 'box';
    let settled = false;
    const finish = (status, body) => {
        if (settled) return;
        settled = true;
        try { res.status(status).json(body); } catch (e) { /* headers sent */ }
    };
    const watchdog = setTimeout(() => {
        console.warn('[MC Server] reset timed out for', world);
        finish(504, { success: false, error: 'หมดเวลารีเซ็ตเซิร์ฟ — ลองปิดเซิร์ฟก่อน แล้วกดอีกครั้ง' });
    }, 75000);
    try {
        const result = await mcLauncher.resetMcServer({ world });
        clearTimeout(watchdog);
        finish(200, result);
    } catch (err) {
        clearTimeout(watchdog);
        console.warn('[MC Server] reset failed:', err.message);
        finish(500, { success: false, error: err.message });
    }
});

app.post('/api/games/minecraft/free-bridge', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    stopMinecraftTestBridgeSafe();
    res.json({ success: true, message: 'test bridge stopped' });
});

app.get('/api/games/minecraft/java-status', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        res.json({ success: true, ...mcLauncher.getJavaStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/games/minecraft/install-java', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const result = await mcLauncher.downloadAndOpenJavaInstaller();
        res.json({
            ...result,
            java: mcLauncher.getJavaStatus(),
            adoptiumUrl: mcLauncher.ADOPTIUM_PAGE || 'https://adoptium.net/temurin/releases/?version=21'
        });
    } catch (err) {
        console.warn('[MC Server] install-java failed:', err.message);
        res.status(500).json({
            success: false,
            openBrowser: true,
            url: 'https://adoptium.net/temurin/releases/?version=21',
            error: err.message
        });
    }
});

app.post('/api/games/minecraft/runtime', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const result = mcLauncher.saveMcRuntime({
            world: req.body?.world || req.body?.mode || 'box',
            xmsMb: req.body?.xmsMb,
            xmxMb: req.body?.xmxMb,
            levelName: req.body?.levelName
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/games/minecraft/server-properties', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.query?.world || req.query?.mode || 'box';
        res.json(mcLauncher.getServerPropertiesText(world));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/games/minecraft/server-properties', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.body?.world || req.body?.mode || 'box';
        const result = mcLauncher.setServerPropertiesText(world, req.body?.text || '');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/games/minecraft/set-jar', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    if (!mcLauncher) return res.status(500).json({ success: false, error: 'launcher missing' });
    try {
        const world = req.body?.world || req.body?.mode || 'box';
        const jarPath = req.body?.path || req.body?.jarPath;
        if (!jarPath) return res.status(400).json({ success: false, error: 'missing jar path' });
        res.json(mcLauncher.setCustomPaperJar(world, jarPath));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** ดึง pendingWinDelta จาก Paper plugin (:8081) — ใช้ sync WIN ของ Fish/Box Control */
app.get('/api/minecraft/win-delta', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    try {
        const result = await repoBridgeHttpRequest('http://127.0.0.1:8081', { method: 'GET', path: '/win-delta' });
        const data = result?.data || {};
        const delta = Number(data.pendingWinDelta || 0);
        res.json({
            success: result?.status === 200 && (data.ok === true || data.success !== false),
            pendingWinDelta: delta,
            mod: data.mod || ''
        });
    } catch (err) {
        res.json({ success: false, pendingWinDelta: 0, error: err.message });
    }
});

/** สถานะโควตาปลา / ซอมบี้ — สำหรับ OBS overlay + แผง Fish Control
 *  ใช้ /health (ไม่กิน win-delta) และไม่บังคับ JWT เพื่อให้ OBS อ่านได้
 */
app.get('/api/minecraft/fish-status', async (req, res) => {
    try {
        const result = await executeRepoBridgeCommand('http://127.0.0.1:8081', 'health', { gameId: 'minecraft' });
        const detail = result?.detail || {};
        const fish = detail.fish || result?.fish || null;
        const mc = mcLauncher ? mcLauncher.getMcServerStatus({ world: 'fish' }) : null;
        const ok = !!(result?.success && fish && fish.ok !== false);
        res.json({
            success: ok,
            fish: fish || { ok: false, remaining: 0, zombies: 0, goal: 35, caught: 0 },
            serverRunning: !!(mc && mc.running),
            otherModeRunning: !!(mc && mc.otherModeRunning),
            runningMode: mc?.runningMode || null,
            mod: result?.mod || detail.mod || ''
        });
    } catch (err) {
        res.json({
            success: false,
            fish: { ok: false, remaining: 0, zombies: 0, goal: 35, caught: 0 },
            error: err.message
        });
    }
});

app.get('/api/games/battle-golf/status', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    try {
        res.json({ success: true, ...battleGolfBridge.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/games/battle-golf/start', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    try {
        const port = Number(req.body?.port) || undefined;
        const st = battleGolfBridge.start(port);
        res.json({
            success: !!st.listening || !st.lastError,
            ...st,
            hint: st.lastError && /EADDRINUSE/i.test(st.lastError)
                ? 'พอร์ต 13715 ถูกใช้แล้ว — ปิด ChaosTricks.exe แล้วลองใหม่'
                : undefined
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            hint: /EADDRINUSE/i.test(err.message || '')
                ? 'พอร์ต 13715 ถูกใช้แล้ว — ปิด ChaosTricks.exe แล้วลองใหม่'
                : undefined
        });
    }
});

app.post('/api/games/battle-golf/stop', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    try {
        res.json({ success: true, ...battleGolfBridge.stop() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/games/battle-golf/catalog', async (req, res) => {
    if (!(await requireUserAuth(req, res))) return;
    try {
        const catalogPath = path.join(__dirname, 'data', 'battle_golf_catalog.json');
        const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        res.json({ success: true, catalog });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ส่งคำสั่งเสกของในเกม (RCON / File Drop / HTTP Bridge / REPO WebSocket / Battle Golf)
app.post('/api/game-mod/execute', async (appReq, appRes) => {
    if (!(await requireUserAuth(appReq, appRes))) return;
    const fs = require('fs');
    try {
        const { gameId, command, connection } = appReq.body || {};
        if (!command || !String(command).trim()) {
            return appRes.status(400).json({ error: 'ไม่มีคำสั่ง' });
        }

        const conn = connection || {};
        const cmd = String(command).trim();
        console.log(`[GameMod] game=${gameId} type=${conn.type || 'rcon'} cmd=${cmd.slice(0, 120)}`);

        // Super Battle Golf — TokControl hosts WS :13715 (game is client)
        if (gameId === 'battle-golf') {
            const result = battleGolfBridge.executeCommand(cmd);
            return appRes.json({
                success: result.success !== false && result.ok !== false,
                method: 'battle_golf_ws',
                ...result
            });
        }

        // R.E.P.O. / Minecraft / WebSocket bridge — ส่งผ่าน Node HTTP ไปที่มอดในเกม
        if (gameId === 'repo' || gameId === 'minecraft' || conn.type === 'websocket') {
            const bridgeOpts = { gameId };
            if (appReq.headers['x-fire-and-forget'] === '1') {
                executeRepoBridgeCommand(conn.host, cmd, bridgeOpts).catch((err) => {
                    console.warn('[GameMod] async bridge:', err.message);
                });
                return appRes.json({ success: true, queued: true, method: 'http_async' });
            }
            const result = await executeRepoBridgeCommand(conn.host, cmd, bridgeOpts);
            return appRes.json(result);
        }

        if (conn.type === 'file' && conn.filePath) {
            const dropDir = String(conn.filePath).trim();
            if (!dropDir) return appRes.status(400).json({ error: 'ไม่ได้ระบุโฟลเดอร์' });
            fs.mkdirSync(dropDir, { recursive: true });
            const filePath = path.join(dropDir, `tokcontrol_${Date.now()}.cmd`);
            fs.writeFileSync(filePath, cmd, 'utf8');
            return appRes.json({ success: true, method: 'file', path: filePath });
        }

        if (conn.type === 'http' && conn.host) {
            const targetUrl = String(conn.host).trim();
            try {
                const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://${targetUrl}`);
                const payload = JSON.stringify({ gameId, command: cmd });
                const lib = parsed.protocol === 'https:' ? https : http;
                await new Promise((resolve, reject) => {
                    const req = lib.request({
                        hostname: parsed.hostname,
                        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                        path: parsed.pathname + parsed.search,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
                        timeout: 5000
                    }, (res) => {
                        res.resume();
                        resolve();
                    });
                    req.on('error', reject);
                    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                    req.write(payload);
                    req.end();
                });
                return appRes.json({ success: true, method: 'http', url: targetUrl });
            } catch (httpErr) {
                console.warn('[GameMod] HTTP bridge failed:', httpErr.message);
                return appRes.json({ success: true, method: 'http', command: cmd, warning: httpErr.message });
            }
        }

        // RCON จริง (Fish Control / Tower Wars และเกมที่ใช้ conn.type=rcon)
        if (gameId === 'fish-control' || gameId === 'tower-wars' || gameId === 'farm-control' || gameId === 'restaurant-control' || conn.type === 'rcon') {
            try {
                const { withRcon } = require('./tools/rcon-client');
                const host = String(conn.host || '127.0.0.1').replace(/^https?:\/\//, '').split(':')[0] || '127.0.0.1';
                let port = Number(conn.port) || 25575;
                let password = String(conn.password || '').trim();
                const localMc = host === '127.0.0.1' || host === 'localhost';
                const worldByGame = {
                    'fish-control': 'fish',
                    'farm-control': 'farm',
                    'tower-wars': 'tower',
                    'restaurant-control': 'restaurant'
                };
                const world = worldByGame[gameId];
                if (localMc && world && mcLauncher) {
                    try {
                        const st = mcLauncher.getMcServerStatus({ world });
                        if (st?.rcon?.port) port = Number(st.rcon.port) || port;
                        if (st?.rcon?.password) password = String(st.rcon.password).trim() || password;
                    } catch (_) { /* keep typed password */ }
                }
                if (!password) {
                    try { password = require('./auth_secrets').getMcRconPassword(); } catch (_) {}
                }
                // รองรับ JSON action เช่น {"action":"fc_add_trash"} / {"action":"tw_build"} / {"action":"fm_fire"} / {"action":"rs_customer"}
                let commandsToRun = [cmd];
                if (cmd.startsWith('{')) {
                    let parsed = null;
                    try { parsed = JSON.parse(cmd); } catch (_) { parsed = null; }
                    if (parsed && (parsed.action || parsed.cmd)) {
                        const actionId = String(parsed.action || parsed.cmd || '');
                        const isTower = gameId === 'tower-wars'
                            || /^tw_|^cw_|^castle_/i.test(actionId);
                        const isFarm = gameId === 'farm-control'
                            || /^fm_|^farm_/i.test(actionId);
                        const isRestaurant = gameId === 'restaurant-control'
                            || /^rs_|^restaurant_/i.test(actionId);
                        let Manager;
                        if (isTower) Manager = require('./js/castleMapManager');
                        else if (isFarm) Manager = require('./js/farmMapManager');
                        else if (isRestaurant) Manager = require('./js/restaurantMapManager');
                        else Manager = require('./js/fishingMapManager');
                        const result = await withRcon({ host, port, password }, async (rcon) => {
                            return Manager.runAction(rcon, actionId, parsed);
                        });
                        return appRes.json({
                            success: result.ok !== false,
                            method: 'rcon',
                            message: isTower
                                ? 'tower_action'
                                : (isFarm ? 'farm_action' : (isRestaurant ? 'restaurant_action' : 'fish_action')),
                            detail: result,
                            host,
                            port
                        });
                    }
                    if (parsed?.command) commandsToRun = [String(parsed.command)];
                    if (Array.isArray(parsed?.commands)) commandsToRun = parsed.commands.map(String);
                }
                const bodies = [];
                await withRcon({ host, port, password }, async (rcon) => {
                    for (const c of commandsToRun) {
                        const out = await rcon.send(c);
                        bodies.push(out.body || '');
                    }
                });
                return appRes.json({
                    success: true,
                    method: 'rcon',
                    message: bodies.filter(Boolean).join('\n') || 'ok',
                    detail: { bodies },
                    host,
                    port
                });
            } catch (rconErr) {
                console.warn('[GameMod] RCON failed:', rconErr.message);
                return appRes.status(500).json({
                    success: false,
                    method: 'rcon',
                    error: rconErr.message,
                    message: rconErr.message
                });
            }
        }

        return appRes.json({ success: false, error: 'unsupported_connection_type' });
    } catch (err) {
        console.error('[GameMod] execute error:', err);
        appRes.status(500).json({ error: err.message });
    }
});

// ดึงรายการของขวัญ TikTok ที่ถูกตรวจพบทั้งหมดในระบบ
app.get('/api/gifts', async (appReq, appRes) => {
    try {
        const list = await db.all('SELECT * FROM tiktok_gifts ORDER BY diamondCount ASC, giftName ASC');
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการของขวัญ' });
    }
});

// รับของขวัญใหม่จาก client อื่นเพื่อรวมเข้าคลังกลาง (ใช้กับ cloud server หรือ sync ภายใน)
app.post('/api/gifts/sync', async (appReq, appRes) => {
    try {
        const expectedKey = getGiftsSyncKey();
        if (!expectedKey) {
            return appRes.status(503).json({ error: 'GIFTS_SYNC_KEY is not configured — sync disabled' });
        }
        if (appReq.body?.syncKey !== expectedKey) {
            return appRes.status(403).json({ error: 'Invalid sync key' });
        }
        const { giftId, giftName, diamondCount, giftIcon } = appReq.body || {};
        if (!giftId || !giftName) {
            return appRes.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
        }
        const result = await upsertTikTokGift(db, { giftId, giftName, diamondCount, giftIcon });
        if (result.action === 'insert' || result.action === 'update') {
            io.emit('new_gift_discovered', result.gift);
        }
        appRes.json({ success: true, action: result.action });
    } catch (err) {
        console.error('[GiftsSync] /api/gifts/sync error:', err);
        appRes.status(500).json({ error: err.message });
    }
});

app.get('/api/gift-gallery', async (appReq, appRes) => {
    try {
        const userId = appReq.query.userId || appReq.query.user_id;
        if (!userId) {
            return appRes.status(400).json({ success: false, error: 'ต้องระบุ userId' });
        }
        const gallery = activeGiftGalleries[userId] || null;
        appRes.json({ success: true, gallery });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงแกลเลอรีของขวัญ' });
    }
});

app.post('/api/gift-gallery/refresh', async (appReq, appRes) => {
    try {
        const { userId, username, token } = appReq.body || {};
        if (!userId || !username) {
            return appRes.status(400).json({ success: false, error: 'ต้องระบุ userId และ username' });
        }
        const gallery = await fetchGiftGalleryBackground(userId, username, token || null);
        appRes.json({ success: true, gallery: activeGiftGalleries[userId] || gallery || null });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ success: false, error: err.message || 'เกิดข้อผิดพลาดในการโหลดแกลเลอรี' });
    }
});

app.get('/api/emotes', async (appReq, appRes) => {
    try {
        const username = appReq.query.username || appReq.query.unique_id || '';
        const cached = getChannelEmotes(username);
        appRes.json({
            success: true,
            username: cached.username,
            emotes: cached.emotes || [],
            lastUpdated: cached.lastUpdated || null,
            fromCache: true
        });
    } catch (err) {
        console.error('[EmotesCache] /api/emotes error:', err);
        appRes.status(500).json({ success: false, error: err.message || 'เกิดข้อผิดพลาดในการดึงอีโมจิ' });
    }
});

/** Proxy emote/gift CDN images to avoid referrer / CORS blocks in overlay */
app.get('/api/emotes/proxy', async (appReq, appRes) => {
    try {
        const raw = String(appReq.query.url || '').trim();
        if (!raw || !/^https?:\/\//i.test(raw)) {
            return appRes.status(400).json({ success: false, error: 'invalid url' });
        }
        let parsed;
        try { parsed = new URL(raw); } catch {
            return appRes.status(400).json({ success: false, error: 'invalid url' });
        }
        const host = parsed.hostname.toLowerCase();
        const allowed = (
            host.endsWith('.tiktokcdn.com') || host.endsWith('.tiktokcdn-us.com')
            || host.endsWith('.tiktokv.com') || host.endsWith('.byteoversea.com')
            || host.endsWith('.ibyteimg.com') || host.endsWith('.musical.ly')
            || host.includes('tiktok') || host.includes('byteimg') || host.includes('bytedance')
        );
        if (!allowed) {
            return appRes.status(403).json({ success: false, error: 'host not allowed' });
        }
        const upstream = await fetch(raw, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://www.tiktok.com/',
                'Accept': 'image/*,*/*'
            }
        });
        if (!upstream.ok) {
            console.warn(`[EmotesProxy] ${upstream.status} for ${raw.slice(0, 120)}`);
            return appRes.status(upstream.status).end();
        }
        const ct = upstream.headers.get('content-type') || 'image/png';
        appRes.setHeader('Content-Type', ct);
        appRes.setHeader('Cache-Control', 'public, max-age=86400');
        appRes.setHeader('Access-Control-Allow-Origin', '*');
        const buf = Buffer.from(await upstream.arrayBuffer());
        appRes.send(buf);
    } catch (err) {
        console.error('[EmotesProxy] error:', err.message);
        appRes.status(502).json({ success: false, error: err.message || 'proxy failed' });
    }
});

app.get('/api/team-members', async (appReq, appRes) => {
    try {
        const userId = appReq.query.userId || appReq.query.user_id || '';
        const username = appReq.query.username || '';
        const snap = fanClubRegistry.snapshot(userId, username);
        appRes.json({ success: true, members: snap.members || [], levels: snap.levels || {} });
    } catch (err) {
        appRes.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/emotes/refresh', async (appReq, appRes) => {
    try {
        const { username, token, userId } = appReq.body || {};
        if (!username) {
            return appRes.status(400).json({ success: false, error: 'ต้องระบุ username' });
        }
        const conn = userId ? activeTikTokConnections[userId] : null;
        let roomId = conn?.roomId || null;
        if (!roomId && conn && typeof conn.fetchRoomId === 'function') {
            try { roomId = await conn.fetchRoomId(); } catch (e) {}
        }
        const result = await syncChannelEmotesForUser(conn, username, roomId, token || null, { source: 'manual_refresh' });
        appRes.json({
            success: true,
            username: result.username || String(username).replace(/^@+/, '').toLowerCase(),
            emotes: result.emotes || [],
            lastUpdated: result.lastUpdated || null,
            fromCache: !!result.fetchFailed,
            fetchFailed: !!result.fetchFailed
        });
    } catch (err) {
        console.error('[EmotesCache] /api/emotes/refresh error:', err);
        appRes.status(500).json({ success: false, error: err.message || 'เกิดข้อผิดพลาดในการรีเฟรชอีโมจิ' });
    }
});

// [ADMIN] อัปเดตข้อมูลของขวัญ (ชื่อ และ จำนวนเหรียญ)
app.post('/api/gifts/update', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { giftId, giftName, diamondCount } = appReq.body;
        if (!giftId || !giftName || isNaN(parseInt(diamondCount))) {
            return appRes.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
        }
        await db.run(
            'UPDATE tiktok_gifts SET giftName = ?, diamondCount = ? WHERE giftId = ?',
            [giftName, parseInt(diamondCount), giftId]
        );
        console.log(`Admin updated Gift ID ${giftId} to: ${giftName} (${diamondCount} coins)`);
        
        // ส่ง socket แจ้งหน้าจอทุกจอให้รีเฟรชลิสต์ทันที
        io.emit('new_gift_discovered', { giftId, giftName, diamondCount });
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(500).json({ error: e.message });
    }
});

// [ADMIN] ลบของขวัญออกจากฐานข้อมูล
app.post('/api/gifts/delete', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await isAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { giftId, giftIds } = appReq.body;
        if (giftIds && Array.isArray(giftIds)) {
            if (giftIds.length === 0) {
                return appRes.status(400).json({ error: 'ไม่พบ ID ของขวัญ' });
            }
            const placeholders = giftIds.map(() => '?').join(',');
            await db.run(`DELETE FROM tiktok_gifts WHERE giftId IN (${placeholders})`, giftIds);
            console.log(`Admin batch deleted Gift IDs:`, giftIds);
            io.emit('new_gift_discovered', {});
        } else {
            if (!giftId) {
                return appRes.status(400).json({ error: 'ไม่พบ ID ของขวัญ' });
            }
            await db.run('DELETE FROM tiktok_gifts WHERE giftId = ?', [giftId]);
            console.log(`Admin deleted Gift ID ${giftId}`);
            io.emit('new_gift_discovered', { giftId });
        }
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(500).json({ error: e.message });
    }
});

// [MEMBER] ตรวจสอบและใช้งานโปรโมโค้ด (Redeem Code)
app.post('/api/promo/redeem', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { code } = appReq.body;
        
        if (!code) {
            return appRes.status(400).json({ error: 'กรุณากรอกรหัสโปรโมโค้ด' });
        }
        
        const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (!user) {
            return appRes.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });
        }
        
        const cleanCode = code.replace(/[\s-]/g, '').toUpperCase();
        
        const promo = await db.get("SELECT * FROM promo_codes WHERE UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = ?", [cleanCode]);
        if (!promo) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดไม่ถูกต้อง' });
        }
        
        if (promo.isUsed === 1) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดนี้ถูกใช้งานไปแล้ว' });
        }
        
        const nowStr = new Date().toISOString();

        if (promo.type === 'coin') {
            return appRes.status(503).json({
                error: 'Control Point ยังไม่เปิดให้แลกด้วยโค้ด (SOON)',
                type: 'coin',
                soon: true
            });
        }

        if (promo.type === 'game') {
            const gameId = gameIdFromPromoScopes(promo.proScopes);
            if (!gameId || !isValidUnlockGameId(gameId)) {
                return appRes.status(400).json({ error: 'โค้ดเกมนี้ไม่ถูกต้อง (ไม่ระบุเกม)' });
            }
        }

        const claimResult = await db.run(
            "UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = ? AND (isUsed = 0 OR isUsed IS NULL)",
            [user.id, user.username, nowStr, cleanCode]
        );
        if (!claimResult || !claimResult.changes) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดนี้ถูกใช้งานไปแล้ว' });
        }

        if (promo.type === 'pro') {
            let currentExpire = user.proExpireAt ? new Date(user.proExpireAt) : new Date();
            if (currentExpire < new Date()) {
                currentExpire = new Date();
            }
            
            currentExpire.setDate(currentExpire.getDate() + promo.val);
            const newExpireStr = currentExpire.toISOString();

            const codeScopes = parseProScopesJson(promo.proScopes);
            let mergedScopes = codeScopes.includes('all') ? ['all'] : codeScopes;
            if (!mergedScopes.length) mergedScopes = ['all'];
            const scopesJson = JSON.stringify(mergedScopes);
            
            await db.run(
                'UPDATE users SET isPro = 1, proExpireAt = ?, proScopes = ? WHERE id = ?',
                [newExpireStr, scopesJson, user.id]
            );
            
            const scopeHint = mergedScopes.includes('all')
                ? ''
                : ` (หมวด: ${mergedScopes.join(', ')})`;
            return appRes.json({
                success: true,
                type: 'pro',
                val: promo.val,
                proExpireAt: newExpireStr,
                proScopes: mergedScopes,
                message: `คุณได้รับสิทธิ์ PRO เพิ่มอีก ${promo.val} วัน${scopeHint}!`
            });
        } else if (promo.type === 'gamecenter') {
            const entitlements = mergeGameCenterEntitlement(user.entitlements, {
                days: promo.val == null || Number(promo.val) <= 0 ? null : Number(promo.val),
                source: 'promo',
                planId: 'promo_code'
            });
            await db.run(
                'UPDATE users SET entitlements = ? WHERE id = ?',
                [JSON.stringify(entitlements), user.id]
            );
            const dayHint = promo.val > 0 ? ` ${promo.val} วัน` : ' (ไม่หมดอายุ)';
            return appRes.json({
                success: true,
                type: 'gamecenter',
                val: promo.val,
                entitlements: entitlementsForApi(entitlements),
                message: `คุณได้รับ Game Center Early Access Pass${dayHint}!`
            });
        } else if (promo.type === 'game') {
            const gameId = gameIdFromPromoScopes(promo.proScopes);
            if (!gameId || !isValidUnlockGameId(gameId)) {
                return appRes.status(400).json({ error: 'โค้ดเกมนี้ไม่ถูกต้อง (ไม่ระบุเกม)' });
            }
            const days = promo.val == null || Number(promo.val) <= 0 ? null : Number(promo.val);
            const entitlements = mergeGameEntitlement(user.entitlements, {
                gameId,
                days,
                source: 'promo'
            });
            await db.run(
                'UPDATE users SET entitlements = ? WHERE id = ?',
                [JSON.stringify(entitlements), user.id]
            );
            const label = GAME_UNLOCK_LABELS[gameId] || gameId;
            const dayHint = days ? ` ${days} วัน` : ' (ไม่หมดอายุ)';
            const userPatch = { ...user, entitlements: JSON.stringify(entitlements) };
            return appRes.json({
                success: true,
                type: 'game',
                val: promo.val,
                gameId,
                gameName: label,
                entitlements: entitlementsForApi(entitlements),
                access: {
                    gameCenter: canAccessGameCenter(userPatch),
                    games: gamesAccessForApi(userPatch)
                },
                message: `ปลดล็อก ${label}${dayHint}!`
            });
        } else {
            return appRes.status(400).json({ error: 'ประเภทโปรโมโค้ดไม่ถูกต้อง' });
        }
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบโปรโมโค้ด' });
    }
});

// หน้าหลักและหน้า Overlay เสิร์ฟไฟล์ปกติ
app.get('/', (appReq, appRes) => {
    appRes.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    appRes.set('Pragma', 'no-cache');
    appRes.sendFile(path.join(__dirname, 'index.html'));
});

// หน้า Landing สำหรับดาวน์โหลดโปรแกรม
app.get(['/download', '/download.html'], (appReq, appRes) => {
    appRes.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    appRes.set('Pragma', 'no-cache');
    appRes.sendFile(path.join(__dirname, 'download.html'));
});

// Redirect ไป installer ล่าสุด — ใช้แทน <a download> cross-origin (Edge บล็อก)
app.get('/api/download/latest', async (appReq, appRes) => {
    try {
        const owner = 'attapornps1996-hub';
        const repo = 'TokControl';
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
        const body = await new Promise((resolve, reject) => {
            https.get(apiUrl, {
                headers: {
                    'User-Agent': 'TokControl-Download',
                    Accept: 'application/vnd.github+json'
                }
            }, (r) => {
                let raw = '';
                r.on('data', (c) => { raw += c; });
                r.on('end', () => {
                    if (r.statusCode >= 400) {
                        reject(new Error(`GitHub API ${r.statusCode}`));
                        return;
                    }
                    try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
                });
            }).on('error', reject);
        });
        const asset = (body.assets || []).find((a) => /\.exe$/i.test(a.name));
        if (!asset?.browser_download_url) {
            return appRes.status(404).json({ error: 'ไม่พบไฟล์ติดตั้ง' });
        }
        appRes.set('Cache-Control', 'public, max-age=300');
        return appRes.redirect(302, asset.browser_download_url);
    } catch (e) {
        console.warn('[Download] latest redirect failed:', e?.message || e);
        return appRes.redirect(302, `https://github.com/attapornps1996-hub/TokControl/releases/latest`);
    }
});

registerOverlayRoutes(app, db, __dirname, io);
registerWidgetRoutes(app, { db, rootDir: __dirname, io });

// ==========================================
// ASSET OPTIMIZATION ENDPOINT
// รับไฟล์ Base64 → แปลง WebP (รูป) / WebM (วิดีโอ) ใน Background
// ==========================================
(function setupOptimizeRoute() {
    const sharp = require('sharp');
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    const os = require('os');
    const fs = require('fs');
    ffmpeg.setFfmpegPath(ffmpegPath);

    // ตัวจัดคิว optimization ไม่ให้ UI ค้าง
    const optimizeQueue = [];
    let isProcessing = false;

    async function processNext() {
        if (isProcessing || optimizeQueue.length === 0) return;
        isProcessing = true;
        const { resolve, reject, task } = optimizeQueue.shift();
        try {
            resolve(await task());
        } catch(e) {
            reject(e);
        }
        isProcessing = false;
        processNext();
    }

    function enqueue(task) {
        return new Promise((resolve, reject) => {
            optimizeQueue.push({ resolve, reject, task });
            processNext();
        });
    }

    app.post('/api/optimize-asset', async (req, res) => {
        try {
            const { dataUrl, mimeType } = req.body;
            if (!dataUrl || !mimeType) return res.status(400).json({ error: 'Missing dataUrl or mimeType' });

            const isImage = /^image\/(png|jpe?g|gif|bmp|tiff|webp)/.test(mimeType);
            const isVideo = /^video\/(mp4|mov|avi|quicktime|x-msvideo|x-matroska)/.test(mimeType);

            if (!isImage && !isVideo) {
                return res.json({ optimized: false, dataUrl });
            }

            // แปลง base64 → Buffer
            const base64Data = dataUrl.split(',')[1];
            const inputBuffer = Buffer.from(base64Data, 'base64');

            if (isImage) {
                const result = await enqueue(async () => {
                    const outputBuffer = await sharp(inputBuffer)
                        .rotate()
                        .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
                        .webp({ quality: 78 })
                        .toBuffer();
                    return 'data:image/webp;base64,' + outputBuffer.toString('base64');
                });
                return res.json({ optimized: true, dataUrl: result, mimeType: 'image/webp' });
            }

            if (isVideo) {
                const result = await enqueue(() => new Promise((resolve, reject) => {
                    const tmpIn = path.join(os.tmpdir(), `asset_in_${Date.now()}.mp4`);
                    const tmpOut = path.join(os.tmpdir(), `asset_out_${Date.now()}.webm`);
                    fs.writeFileSync(tmpIn, inputBuffer);
                    ffmpeg(tmpIn)
                        .outputOptions([
                            '-c:v libvpx-vp9',
                            '-crf 33',
                            '-b:v 0',
                            '-c:a libopus',
                            '-deadline realtime',
                            '-cpu-used 4'
                        ])
                        .output(tmpOut)
                        .on('end', () => {
                            try {
                                const outBuf = fs.readFileSync(tmpOut);
                                const outB64 = 'data:video/webm;base64,' + outBuf.toString('base64');
                                fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
                                resolve(outB64);
                            } catch(e) { reject(e); }
                        })
                        .on('error', (err) => {
                            try { fs.unlinkSync(tmpIn); } catch(e) {}
                            try { fs.unlinkSync(tmpOut); } catch(e) {}
                            reject(err);
                        })
                        .run();
                }));
                return res.json({ optimized: true, dataUrl: result, mimeType: 'video/webm' });
            }
        } catch(err) {
            console.error('[OptimizeAsset] Error:', err.message);
            // หากเกิดข้อผิดพลาด ส่งไฟล์เดิมกลับไปโดยไม่หยุดทำงาน
            return res.json({ optimized: false, dataUrl: req.body.dataUrl });
        }
    });
})();

// ==========================================
// SOCKET.IO REAL-TIME COMMUNICATION
// ==========================================

const activePanels = {};
const panelSyncDebounce = {};

function requestPanelSyncDebounced(token) {
    if (!token) return;
    if (panelSyncDebounce[token]) return;
    panelSyncDebounce[token] = setTimeout(() => { delete panelSyncDebounce[token]; }, 2500);
    const panelId = activePanels[token];
    if (panelId) {
        io.to(panelId).emit('request_panel_sync');
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // เมื่อสตรีมเมอร์ควบคุม (Panel) เข้าห้อง
    socket.on('join_panel', (token) => {
        // หากพบว่ามีการเข้าสู่ระบบซ้อนในแท็บอื่น/เบราเซอร์อื่น
        if (activePanels[token] && activePanels[token] !== socket.id) {
            io.to(activePanels[token]).emit('duplicate_login');
            console.log(`Force logout duplicate panel socket for token: ${token}`);
        }
        
        activePanels[token] = socket.id;
        socket.streamToken = token; // บันทึก token ไว้ใน socket instance
        setActiveOverlaySession(token);
        socket.join(token);
        console.log(`Panel joined room: ${token}`);
    });

    // เมื่อ OBS Overlay เข้าห้อง
    socket.on('join_overlay', (token) => {
        socket.join(token);
        console.log(`OBS Overlay joined room: ${token}`);
        requestPanelSyncDebounced(token);
        if (lastPngtuberStatusByToken[token]) {
            socket.emit('overlay_pngtuber_status', lastPngtuberStatusByToken[token]);
        }
        if (lastTimerStatusByToken[token]) {
            socket.emit('overlay_timer_status', lastTimerStatusByToken[token]);
        }
    });

    // ส่งสัญญาณผลการสุ่มการ์ดจาก Panel ไปหา OBS Overlay
    socket.on('send_result', (payload) => {
        const { token, ...rest } = payload;
        console.log(`[Socket Server] Broadcast overlay_show_result to token: ${token}, count: ${rest.results ? rest.results.length : 0}`);
        io.to(token).emit('overlay_show_result', rest);
    });

    socket.on('send_win_status', (payload) => {
        const { token, ...rest } = payload;
        console.log(`[Socket Server] Broadcast overlay_win_status to token: ${token}, cur: ${rest.cur}`);
        io.to(token).emit('overlay_win_status', rest);
    });

    socket.on('send_timer_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) {
            lastTimerStatusByToken[token] = rest;
            io.to(token).emit('overlay_timer_status', rest);
        }
    });

    socket.on('send_total', ({ token, sum }) => {
        io.to(token).emit('overlay_show_total', { sum });
    });

    socket.on('send_hide_result', (token) => {
        io.to(token).emit('overlay_hide_result');
    });

    socket.on('gacha_summary_ready', (payload) => {
        const token = payload?.token;
        if (token) io.to(token).emit('gacha_summary_ready', {});
    });

    socket.on('send_play_cutscene', ({ token, videoData }) => {
        console.log(`[Socket Server] Broadcast overlay_play_cutscene to token: ${token}`);
        io.to(token).emit('overlay_play_cutscene', { videoData });
    });

    socket.on('send_stop_cutscene', (token) => {
        console.log(`[Socket Server] Broadcast overlay_stop_cutscene to token: ${token}`);
        io.to(token).emit('overlay_stop_cutscene');
    });

    socket.on('send_reveal_card', (payload) => {
        const { token, ...rest } = payload;
        console.log(`[Socket Server] Broadcast overlay_reveal_card to token: ${token}, tier: ${rest.res ? rest.res.rule.tier : 'unknown'}`);
        io.to(token).emit('overlay_reveal_card', rest);
    });

    socket.on('send_pity', ({ token, enabled, ss, maxSS, ssr, maxSSR }) => {
        io.to(token).emit('overlay_pity', { enabled, ss, maxSS, ssr, maxSSR });
    });

    socket.on('send_gift_rules', ({ token, giftRules, wheelGiftRules, cardGiftRules }) => {
        io.to(token).emit('overlay_gift_rules', { giftRules, wheelGiftRules, cardGiftRules });
    });

    socket.on('send_sound_alerts', ({ token, soundAlerts }) => {
        io.to(token).emit('overlay_sound_alerts', { soundAlerts });
    });

    socket.on('send_actions_events', ({ token, actionsEvents }) => {
        io.to(token).emit('overlay_actions_events', { actionsEvents });
    });

    socket.on('play_action', ({ token, action }) => {
        if (!token || !action) return;
        io.to(token).emit('overlay_play_action', { action });
    });

    socket.on('stop_actions', ({ token, screen } = {}) => {
        if (!token) return;
        io.to(token).emit('overlay_stop_actions', {
            screen: Math.max(0, Math.min(8, parseInt(screen || '0', 10) || 0))
        });
    });

    // Admin announcements are stored on Cloud, but desktop clients listen on
    // the local Socket.IO hub. Relay so every open app receives them live.
    socket.on('broadcast_app_announcement', (payload) => {
        if (!payload || !payload.title) return;
        io.emit('app_announcement', payload);
    });
    socket.on('broadcast_app_announcement_removed', (payload) => {
        const id = payload?.id;
        if (!id) return;
        io.emit('app_announcement_removed', { id });
    });
    socket.on('broadcast_app_announcements_cleared', () => {
        io.emit('app_announcements_cleared', {});
    });

    socket.on('send_vote_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_vote_status', rest);
    });

    socket.on('send_game_overlay_status', (payload) => {
        const { token, ...rest } = payload || {};
        if (token) io.to(token).emit('overlay_game_status', rest);
    });

    socket.on('send_song_request_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_song_request_status', rest);
    });

    socket.on('send_airdrop_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_airdrop_status', rest);
    });

    socket.on('save_airdrop_widget_position', (payload) => {
        const { token, widgetX, widgetY, widgetKind } = payload || {};
        if (!token) return;
        const patch = widgetKind === 'countdown'
            ? { countdownWidgetPosition: 'custom', countdownWidgetX: widgetX, countdownWidgetY: widgetY }
            : { widgetPosition: 'custom', widgetX, widgetY };
        io.to(token).emit('airdrop_widget_position_saved', { widgetX, widgetY, widgetKind: widgetKind || 'mission' });
        io.to(token).emit('overlay_airdrop_status', patch);
    });

    socket.on('send_gacha_volume', (payload) => {
        const { token, volume } = payload || {};
        if (token) io.to(token).emit('overlay_gacha_volume', { volume });
    });

    socket.on('send_gift_jar_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_gift_jar_status', rest);
    });

    // Memory Match game relay
    socket.on('memory_match_action', (payload) => {
        const { token, action, user, amount } = payload || {};
        if (!token || !action) return;
        io.to(token).emit('memory_match_action', { action, user, amount });
    });

    socket.on('memory_match_sync', (payload) => {
        const { token, ...rest } = payload || {};
        if (!token) return;
        io.to(token).emit('memory_match_sync', rest);
    });

    socket.on('memory_match_state', (payload) => {
        const { token, state } = payload || {};
        if (!token || !state) return;
        socket.to(token).emit('memory_match_sync', { state });
    });

    socket.on('memory_match_win', (payload) => {
        const { token, wins } = payload || {};
        if (!token) return;
        io.to(token).emit('memory_match_win', { wins });
    });

    // Spot Diff game relay
    socket.on('spot_diff_action', (payload) => {
        const { token, action, user, amount } = payload || {};
        if (!token || !action) return;
        io.to(token).emit('spot_diff_action', { action, user, amount });
    });

    socket.on('spot_diff_sync', (payload) => {
        const { token, ...rest } = payload || {};
        if (!token) return;
        io.to(token).emit('spot_diff_sync', rest);
    });

    socket.on('spot_diff_state', (payload) => {
        const { token, state } = payload || {};
        if (!token || !state) return;
        socket.to(token).emit('spot_diff_sync', { state });
    });

    socket.on('spot_diff_win', (payload) => {
        const { token, wins } = payload || {};
        if (!token) return;
        io.to(token).emit('spot_diff_win', { wins });
    });

    socket.on('spot_diff_lose', (payload) => {
        const { token } = payload || {};
        if (!token) return;
        io.to(token).emit('spot_diff_lose', {});
    });

    socket.on('send_pngtuber_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) {
            lastPngtuberStatusByToken[token] = rest;
            savePngtuberStateToDisk(token, rest);
            io.to(token).emit('overlay_pngtuber_status', rest);
        }
    });

    socket.on('send_pngtuber_talk_state', (payload) => {
        const { token, talking } = payload || {};
        if (token) io.to(token).emit('overlay_pngtuber_talk_state', { talking: !!talking });
    });

    socket.on('pngtuber_test_throw', (payload) => {
        const { token, ...gift } = payload || {};
        if (!token) return;
        io.to(token).emit('tiktok_gift', gift);
    });

    socket.on('save_gift_jar_widget_position', (payload) => {
        const { token, widgetX, widgetY } = payload || {};
        if (!token) return;
        io.to(token).emit('gift_jar_widget_position_saved', { widgetX, widgetY });
        io.to(token).emit('overlay_gift_jar_status', { widgetPosition: 'custom', widgetX, widgetY });
    });

    socket.on('send_stream_credits', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_stream_credits', rest);
    });

    socket.on('request_gift_gallery', async ({ userId, username, token }) => {
        if (!userId || !username) return;
        await fetchGiftGalleryBackground(userId, username, token || null);
    });

    socket.on('play_sound_alert', ({ token, builtin, soundData, soundUrl, volume, soundName }) => {
        io.to(token).emit('overlay_play_sound_alert', { builtin, soundData, soundUrl, volume, soundName });
    });

    socket.on('play_credits_music', (payload) => {
        const { token, ...rest } = payload || {};
        if (token) io.to(token).emit('overlay_credits_music', rest);
    });

    socket.on('send_wheel_hide', (payload) => {
        const { token } = payload;
        io.to(token).emit('overlay_wheel_hide');
    });

    socket.on('send_wheel_show', (payload) => {
        const { token } = payload;
        io.to(token).emit('overlay_wheel_show');
    });

    socket.on('send_wheel_spin', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_wheel_spin', rest);
    });

    socket.on('send_wheel_batch', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_wheel_batch', rest);
    });

    socket.on('send_wheel_idle', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_wheel_idle', rest);
    });

    socket.on('send_ritual_play', (payload) => {
        const { token, ...rest } = payload || {};
        if (token) io.to(token).emit('overlay_ritual_play', rest);
    });
    socket.on('send_ritual_idle', (payload) => {
        const { token, ...rest } = payload || {};
        if (token) io.to(token).emit('overlay_ritual_idle', rest);
    });

    socket.on('client_error', (err) => {
        console.error(`\x1b[31m[OBS Overlay Client Error]\x1b[0m`, err);
        const logMsg = `[${new Date().toISOString()}] [Client Error] ${JSON.stringify(err)}\n`;
        try { require('fs').appendFileSync('error.log', logMsg); } catch(e){}
    });

    socket.on('client_log', (msg) => {
        console.log(`[OBS Overlay Log]`, msg);
        const logMsg = `[${new Date().toISOString()}] [Client Log] ${msg}\n`;
        try { require('fs').appendFileSync('error.log', logMsg); } catch(e){}
    });

    socket.on('test_trigger_event', (payload) => {
        console.log("Simulated test event:", payload);
        const token = payload.token;
        if (!token) return;
        const seq = ++overlayTestUserSeq;
        const uniqueId = `Test_User_${seq}`;
        const nickname = `Test User ${seq}`;
        const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(uniqueId)}&backgroundColor=bc13fe`;

        if (payload.eventType === 'gift') {
            const diamonds = payload.diamondCount || 1;
            const repeat = payload.repeatCount || 1;
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname,
                avatar,
                giftName: payload.giftName || 'Gift',
                giftId: payload.giftId || '5655',
                giftIcon: payload.giftIcon || (payload.giftName === 'Hearts' ? '💖' : '🌹'),
                diamondCount: diamonds,
                repeatCount: repeat,
                totalCoins: diamonds * repeat,
                isTest: true,
                testOverlayId: String(payload.ovId || '')
            };
            io.to(token).emit('tiktok_gift', dataObj);
        } else if (payload.eventType === 'like') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname,
                avatar,
                likeCount: payload.likeCount || 1,
                isTest: true,
                testOverlayId: String(payload.ovId || '')
            };
            io.to(token).emit('tiktok_like', dataObj);
        } else if (payload.eventType === 'follow') {
            const dataObj = { uniqueId, nickname, avatar, isTest: true, testOverlayId: String(payload.ovId || '') };
            io.to(token).emit('tiktok_follow', dataObj);
        } else if (payload.eventType === 'share') {
            const dataObj = { uniqueId, nickname, avatar, isTest: true, testOverlayId: String(payload.ovId || '') };
            io.to(token).emit('tiktok_share', dataObj);
        } else if (payload.eventType === 'join') {
            const dataObj = { uniqueId, nickname, avatar, isTest: true, testOverlayId: String(payload.ovId || '') };
            io.to(token).emit('tiktok_join', dataObj);
        } else if (payload.eventType === 'viewer_count') {
            const base = parseInt(payload.viewerCount, 10);
            const count = !isNaN(base) && base > 0 ? base : (180 + Math.floor(Math.random() * 80));
            io.to(token).emit('tiktok_viewer_count', {
                viewerCount: count,
                isTest: true,
                testOverlayId: String(payload.ovId || '')
            });
        }
    });

    socket.on('overlay_test_clear', ({ token, ovId }) => {
        if (!token) return;
        io.to(token).emit('overlay_test_clear', { testOverlayId: String(ovId || '') });
    });

    socket.on('overlay_test_begin', ({ token, ovId }) => {
        if (!token) return;
        io.to(token).emit('overlay_test_begin', { testOverlayId: String(ovId || '') });
    });

    // เมื่อร้องขอเชื่อมต่อ TikTok Live
    socket.on('connect_tiktok', async ({ token, username, userId, integrationMode }) => {
        const mode = integrationMode || 'direct';
        console.log(`User ${userId} requesting TikTok connection to username: ${username} (Mode: ${mode})`);
        
        // บันทึกเซสชันลงแผนผังสำหรับการส่งอีเวนต์กลับในภายหลัง
        activeTiktokSessions[username.toLowerCase()] = {
            token,
            userId,
            socketId: socket.id
        };

        // ตัดการเชื่อมต่อเก่า
        if (activeTikTokConnections[userId]) {
            try {
                if (activeTikTokConnections[userId].retryInterval) {
                    clearInterval(activeTikTokConnections[userId].retryInterval);
                }
                activeTikTokConnections[userId].disconnect();
            } catch (e) {}
            delete activeTikTokConnections[userId];
        }

        if (mode === 'browser') {
            // ส่งสถานะเชื่อมต่อสำเร็จแบบสแตนด์บาย (รอไลฟ์สดฝั่งบราวเซอร์) กลับไปที่ UI ทันที
            const statusObj = { connected: true, isLive: false, username, integrationMode: 'browser' };
            io.to(token).emit('tiktok_status', statusObj);
            socket.emit('tiktok_status', statusObj);
            io.to(token).emit('tiktok_notification', { type: 'standby', username });
            const cachedEmotes = getChannelEmotes(username);
            emitChannelEmotesLoaded(token, {
                username: cachedEmotes.username,
                emotes: cachedEmotes.emotes || [],
                lastUpdated: cachedEmotes.lastUpdated || null,
                fromCache: true
            });
            emitTeamMembersSynced(token, userId, username);
            attachHydratedHostProfile(io, socket, token, {
                username,
                userId,
                isLive: false,
                integrationMode: 'browser'
            });
            return;
        }

        try {
            // สร้าง Connection ใหม่ (Direct mode)
            // แนวทางเดียวกับเวอร์ชันเก่าบน GitHub: เปิด gift info หลังเชื่อมแล้ว
            // + resolve roomId เองก่อน connect (TikTok บล็อก Euler/API บ่อย)
            const signApiKey = String(process.env.SIGN_API_KEY || process.env.EULER_API_KEY || '').trim() || undefined;
            const tiktokConnect = new TikTokLiveConnection(username, {
                enableExtendedGiftInfo: false,
                processInitialData: true,
                // ปิดเช็ค roomInfo ตอน connect — กัน false offline ทั้งที่มี roomId จริง
                fetchRoomInfoOnConnect: false,
                ...(signApiKey ? { signApiKey } : {})
            });
            tiktokConnect.username = username;
            tiktokConnect.isLive = false;
            activeTikTokConnections[userId] = tiktokConnect;

            // ส่งสถานะเชื่อมต่อสำเร็จแบบสแตนด์บาย (รอไลฟ์สด) กลับไปที่ UI ทันที
            const statusObj = { connected: true, isLive: false, username, integrationMode: 'direct' };
            io.to(token).emit('tiktok_status', statusObj);
            socket.emit('tiktok_status', statusObj);
            io.to(token).emit('tiktok_notification', { type: 'standby', username });

            const cachedEmotes = getChannelEmotes(username);
            emitChannelEmotesLoaded(token, {
                username: cachedEmotes.username,
                emotes: cachedEmotes.emotes || [],
                lastUpdated: cachedEmotes.lastUpdated || null,
                fromCache: true
            });
            emitTeamMembersSynced(token, userId, username);
            attachHydratedHostProfile(io, socket, token, {
                username,
                userId,
                connection: tiktokConnect,
                isLive: false,
                integrationMode: 'direct'
            });

            let retryInterval = null;
            let connectInFlight = false;

            const emitLiveStatus = (state) => {
                const roomInfo = state?.roomInfo || null;
                const profile = extractTikTokOwnerProfile(roomInfo, username);
                const avatar = profile.avatarUrl ||
                    roomInfo?.data?.owner?.avatar_large?.url_list?.[0] ||
                    roomInfo?.data?.owner?.avatar_medium?.url_list?.[0] ||
                    roomInfo?.data?.owner?.avatar_thumb?.url_list?.[0] ||
                    tiktokConnect.avatar || '';
                const nickname = profile.displayName || roomInfo?.data?.owner?.nickname || tiktokConnect.nickname || username;

                tiktokConnect.isLive = true;
                tiktokConnect.nickname = nickname;
                tiktokConnect.avatar = avatar;

                const successStatus = {
                    connected: true,
                    isLive: true,
                    username,
                    nickname,
                    avatar,
                    displayName: nickname,
                    avatarUrl: avatar,
                    followerCount: profile.followerCount,
                    followingCount: profile.followingCount,
                    integrationMode: 'direct',
                    roomId: state?.roomId || tiktokConnect.roomId || null
                };
                io.to(token).emit('tiktok_status', successStatus);
                socket.emit('tiktok_status', successStatus);
                io.to(token).emit('tiktok_notification', { type: 'connected', username });
                if (!avatar || /dicebear\.com/i.test(String(avatar))) {
                    attachHydratedHostProfile(io, socket, token, {
                        username,
                        userId,
                        connection: tiktokConnect,
                        roomInfo,
                        isLive: true,
                        integrationMode: 'direct',
                        roomId: state?.roomId || tiktokConnect.roomId || null
                    });
                }
                return successStatus;
            };

            const loadLiveSideData = async (state) => {
                try {
                    console.log(`Fetching available gifts list unsigned for room ID: ${state.roomId}`);
                    const res = await tiktokConnect.webClient.getJsonObjectFromWebcastApi('gift/list/', {
                        ...tiktokConnect.webClient.clientParams,
                        room_id: state.roomId
                    }, false);

                    if (res && res.data && Array.isArray(res.data.gifts)) {
                        const fetchedGifts = res.data.gifts;
                        console.log(`Fetched ${fetchedGifts.length} gifts from webcast API unsigned.`);
                        tiktokConnect.fetchedGiftsMap = {};
                        tiktokConnect.roomGiftsList = fetchedGifts;
                        tiktokConnect.fetchedGiftsByName = {};
                        const queue = [...fetchedGifts];
                        const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
                            while (queue.length) {
                                const g = queue.shift();
                                if (!g) break;
                                const giftId = String(g.id);
                                const giftName = g.name || '';
                                const diamondCount = parseInt(g.diamond_count || g.diamondCount || g.cost || 0, 10) || 0;
                                const giftIconUrl = pickFirstImageUrl(g.image, g.icon, g.thumbnail) || '';
                                tiktokConnect.fetchedGiftsMap[giftId] = { giftId, giftName, diamondCount, giftIconUrl };
                                const n = String(giftName || '').toLowerCase().trim();
                                if (n) tiktokConnect.fetchedGiftsByName[n] = tiktokConnect.fetchedGiftsMap[giftId];
                                try {
                                    await upsertTikTokGift(db, { giftId, giftName, diamondCount, giftIcon: giftIconUrl }, { io, token });
                                } catch (dbErr) {
                                    console.error(`Error saving gift ${giftName} to DB:`, dbErr);
                                }
                            }
                        });
                        await Promise.all(workers);
                    }
                } catch (giftErr) {
                    console.error('Failed to fetch available gifts unsigned on connect:', giftErr);
                }

                try {
                    const galleryData = await fetchTikTokGiftGallery(
                        tiktokConnect,
                        username,
                        state.roomId,
                        tiktokConnect.roomGiftsList || []
                    );
                    if (galleryData) emitGiftGalleryLoaded(userId, token, galleryData);
                    else console.log(`Gift gallery not available for @${username} (requires live session / gallery program)`);
                } catch (galleryErr) {
                    console.warn('Failed to fetch gift gallery on connect:', galleryErr.message);
                }

                try {
                    await syncChannelEmotesForUser(tiktokConnect, username, state.roomId, token, { source: 'connect' });
                } catch (emoteErr) {
                    console.warn('Failed to fetch channel emotes on connect:', emoteErr.message);
                    const cached = getChannelEmotes(username);
                    emitChannelEmotesLoaded(token, {
                        username: cached.username,
                        emotes: cached.emotes || [],
                        lastUpdated: cached.lastUpdated || null,
                        fromCache: true,
                        fetchFailed: true
                    });
                }
            };

            const emitUserMissing = (detail) => {
                if (retryInterval) {
                    clearInterval(retryInterval);
                    retryInterval = null;
                    if (activeTikTokConnections[userId]) activeTikTokConnections[userId].retryInterval = null;
                }
                const failStatus = {
                    connected: false,
                    isLive: false,
                    username,
                    note: 'user_not_found',
                    offlineError: detail || 'user_not_found',
                    error: `ไม่พบบัญชี TikTok @${username} — ตรวจ uniqueId จากลิงก์โปรไฟล์ (เช่น tiktok.com/@thoksabai)`,
                    integrationMode: 'direct'
                };
                io.to(token).emit('tiktok_status', failStatus);
                socket.emit('tiktok_status', failStatus);
            };

            const tryConnect = () => {
                if (!activeTikTokConnections[userId] || activeTikTokConnections[userId] !== tiktokConnect) return;
                if (tiktokConnect.isLive) return;
                if (connectInFlight) return;
                connectInFlight = true;

                (async () => {
                    // เหมือนเวอร์ชันเก่าที่พึ่ง roomId จริง: ดึง roomId เองก่อน แล้วค่อย connect(roomId)
                    let resolved = null;
                    try {
                        resolved = await resolveTikTokRoomId(username);
                        console.log(`[tiktok room resolve @${username}]`, resolved);
                    } catch (resolveErr) {
                        console.warn(`[tiktok room resolve @${username}]`, resolveErr?.message || resolveErr);
                    }

                    if (resolved && resolved.ok === false && resolved.error === 'user_not_found') {
                        emitUserMissing(resolved.error);
                        return;
                    }

                    const roomIdHint = resolved?.ok && resolved.roomId ? String(resolved.roomId) : undefined;
                    // มี roomId แล้วให้ลอง connect เสมอ — อย่าตัดเพราะ status จาก API ไม่ชัวร์
                    // (เคยทำให้สถานะค้าง CONNECTED / NOT LIVE ทั้งที่ไลฟ์จริง)

                    const state = roomIdHint
                        ? await tiktokConnect.connect(roomIdHint)
                        : await tiktokConnect.connect();

                    console.log(`TikTok webcast connected successfully for user ${userId} (@${username}), roomId: ${state.roomId}`);
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                        if (activeTikTokConnections[userId]) activeTikTokConnections[userId].retryInterval = null;
                    }
                    // สำคัญ: ประกาศ LIVE ทันทีหลัง connect สำเร็จ ก่อนดึงแคตตาล็อกของขวัญ
                    emitLiveStatus(state);
                    try {
                        await loadLiveSideData(state);
                    } catch (sideErr) {
                        console.warn(`[tiktok side-data @${username}]`, sideErr?.message || sideErr);
                    }
                })().catch((err) => {
                    const msg = String(err?.message || err || '');
                    const name = String(err?.name || '');
                    const nestedMsgs = Array.isArray(err?.errors)
                        ? err.errors.map((e) => String(e?.message || e || '')).join(' | ')
                        : '';
                    const fullMsg = [msg, nestedMsgs].filter(Boolean).join(' | ');
                    if (
                        name.includes('AlreadyConnected') ||
                        name.includes('AlreadyConnecting') ||
                        /already connected|already connecting/i.test(fullMsg)
                    ) {
                        console.log(`TikTok connect skipped for @${username}: ${msg}`);
                        if (!tiktokConnect.isLive) {
                            emitLiveStatus({ roomId: tiktokConnect.roomId, roomInfo: null });
                        }
                        return;
                    }

                    const isUserMissing = /user_not_found|InvalidUniqueId|Failed to retrieve Room ID|user does not exist|couldn't find the user|room_id_not_found/i.test(fullMsg);
                    const isOffline = /isn't online|UserOffline|not currently live|USER_OFFLINE/i.test(fullMsg) || name.includes('UserOffline');

                    console.warn(`TikTok connect failed for @${username}:`, fullMsg || msg);
                    tiktokConnect.isLive = false;

                    if (isUserMissing && !isOffline) {
                        emitUserMissing(fullMsg || msg);
                        return;
                    }

                    const offlineStatus = {
                        connected: true,
                        isLive: false,
                        username,
                        note: isOffline ? 'offline' : 'connect_failed',
                        offlineError: fullMsg || msg,
                        integrationMode: 'direct'
                    };
                    io.to(token).emit('tiktok_status', offlineStatus);
                    socket.emit('tiktok_status', offlineStatus);
                    // เวอร์ชันเก่าบน GitHub retry ทุก 15 วินาที
                    if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                        retryInterval = setInterval(tryConnect, 15000);
                        activeTikTokConnections[userId].retryInterval = retryInterval;
                    }
                }).finally(() => {
                    connectInFlight = false;
                });
            };

            tryConnect();

            tiktokConnect.on('disconnected', () => {
                console.log(`TikTok stream disconnected for @${username}. Retrying in background...`);
                tiktokConnect.isLive = false;
                connectInFlight = false;
                const disconnectStatus = {
                    connected: true,
                    isLive: false,
                    username,
                    note: 'offline',
                    offlineError: 'disconnected',
                    integrationMode: 'direct'
                };
                io.to(token).emit('tiktok_status', disconnectStatus);
                socket.emit('tiktok_status', disconnectStatus);
                if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                    retryInterval = setInterval(tryConnect, 8000);
                    activeTikTokConnections[userId].retryInterval = retryInterval;
                }
            });

            tiktokConnect.on('connected', (state) => {
                if (!tiktokConnect.isLive) {
                    console.log(`TikTok 'connected' event for @${username}, promoting to LIVE`);
                    emitLiveStatus(state || { roomId: tiktokConnect.roomId, roomInfo: null });
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                        if (activeTikTokConnections[userId]) activeTikTokConnections[userId].retryInterval = null;
                    }
                }
            });

            // ติดตาม Event ต่างๆ
            const ensureLiveFromEvent = (reason) => {
                if (tiktokConnect.isLive) return;
                console.log(`TikTok live event '${reason}' for @${username} — promoting to LIVE`);
                emitLiveStatus({ roomId: tiktokConnect.roomId, roomInfo: null });
                if (retryInterval) {
                    clearInterval(retryInterval);
                    retryInterval = null;
                    if (activeTikTokConnections[userId]) activeTikTokConnections[userId].retryInterval = null;
                }
            };

            // 0. ยอดคนดู (roomUser)
            tiktokConnect.on('roomUser', (data) => {
                ensureLiveFromEvent('roomUser');
                const viewerCount = parseInt(data.viewerCount || data.totalUser || 0);
                const payload = { viewerCount };
                io.to(token).emit('tiktok_viewer_count', payload);
            });

            tiktokConnect.on('emote', (data) => {
                const identity = extractChatIdentity(data?.user, data);
                const emotes = extractEmotesFromLiveEvent(data);
                if (emotes.length) {
                    const updated = upsertEmotesFromLive(username, emotes, 'live_emote');
                    if (updated) {
                        emitChannelEmotesLoaded(token, {
                            username: updated.username,
                            emotes: updated.emotes || [],
                            lastUpdated: updated.lastUpdated || null,
                            fromCache: false
                        });
                    }
                }
                for (const emote of emotes) {
                    io.to(token).emit('tiktok_emote', {
                        uniqueId: identity.uniqueId,
                        nickname: identity.nickname,
                        avatar: identity.avatar,
                        emoteId: emote.id,
                        emoteName: emote.name,
                        emoteType: emote.type,
                        imageUrl: emote.imageUrl
                    });
                }
            });

            // 1. ได้รับแชท (Chat message)
            tiktokConnect.on('chat', async (data) => {
                ensureLiveFromEvent('chat');
                const roomSockets = io.sockets.adapter.rooms.get(token);
                const socketIds = roomSockets ? Array.from(roomSockets) : [];
                try {
                    appendRuntimeLog('chat_gift_debug.log',
                        `[Chat Event] Time: ${new Date().toISOString()} | Room: ${token} | Sockets in Room: ${JSON.stringify(socketIds)} | Content: ${data.content}\n`
                    );
                } catch(e) {}
                const chatUser = data?.user || data;
                const chatEmotes = extractEmotesFromChatEvent(data);
                const payload = buildChatPayload(chatUser, data, userId, fanClubRegistry, {
                    tiktokUsername: username,
                    emotes: chatEmotes.map((e) => ({
                        id: e.id,
                        name: e.name,
                        type: e.type,
                        imageUrl: e.imageUrl
                    }))
                });
                const teamStatus = analyzeChatTeamStatus(chatUser, data, userId, fanClubRegistry, {
                    tiktokUsername: username
                });
                console.log(
                    `[Chat] User: ${payload.uniqueId} | HasTeamBadge: ${teamStatus.hasTeamBadge} | Registry: ${teamStatus.registryHit} | TeamLevel: ${teamStatus.teamLevel} | Passed: ${teamStatus.passed}`
                );
                if (chatEmotes.length) {
                    const updated = upsertEmotesFromLive(username, chatEmotes, 'chat_emote');
                    if (updated) {
                        emitChannelEmotesLoaded(token, {
                            username: updated.username,
                            emotes: updated.emotes || [],
                            lastUpdated: updated.lastUpdated || null,
                            fromCache: false
                        });
                    }
                    for (const emote of chatEmotes) {
                        io.to(token).emit('tiktok_emote', {
                            uniqueId: payload.uniqueId,
                            nickname: payload.nickname,
                            avatar: payload.avatar,
                            emoteId: emote.id,
                            emoteName: emote.name,
                            emoteType: emote.type,
                            imageUrl: emote.imageUrl
                        });
                    }
                    console.log(`[Emotes] chat from @${payload.uniqueId}: ${chatEmotes.length} emote(s)`, chatEmotes.map((e) => e.name || e.id));
                }
                try {
                    appendRuntimeLog('chat_gift_debug.log',
                        `[Chat FanClub] user=${payload.uniqueId} nick=${payload.nickname} teamLv=${payload.teamMemberLevel} fan=${payload.isFanClub} sub=${payload.isSubscriber}\n`
                    );
                } catch (e) {}
                io.to(token).emit('tiktok_chat', payload);

                const chatMsg = (payload.comment || '').trim();
                const senderName = payload.uniqueId || payload.nickname || 'viewer';

                if (chatMsg) {
                    handleStreamChatAI(userId || 1, token, chatMsg, senderName).catch(err => {
                        console.error('handleStreamChatAI failed:', err.message);
                    });
                }
            });

            const markSuperFan = (sfData) => {
                fanClubRegistry.mark(userId, extractChatIdentity(sfData, sfData), {
                    tiktokUsername: username,
                    level: 1
                });
            };
            tiktokConnect.on('superFan', markSuperFan);
            tiktokConnect.on('superFanJoin', markSuperFan);

            // 2. ได้รับของขวัญ (Gift event) — flatten protobuf แล้ว emit ทันที (อย่ารอ DB)
            const handleTikTokGiftEvent = (data) => {
                try {
                    ensureLiveFromEvent('gift');
                    const norm = normalizeWebcastGift(data);
                    const uniqueId = norm.uniqueId || '';
                    const nickname = norm.nickname || uniqueId;
                    const avatar = norm.avatar || '';
                    const giftId = String(norm.giftId || '');
                    const giftName = String(norm.giftName || '');
                    const repeatCount = Math.max(1, Number(norm.repeatCount) || 1);
                    const repeatEnd = norm.repeatEnd === false ? false : true;
                    const giftType = Number(norm.giftType) === 1 || repeatEnd === false || repeatCount > 1
                        ? 1
                        : (Number(norm.giftType) || 0);

                    if (isHeartMeGift(giftId, giftName)) {
                        fanClubRegistry.mark(userId, {
                            uniqueId, nickname, userId: norm.userId, avatar
                        }, { tiktokUsername: username, level: 1 });
                    }

                    try {
                        appendRuntimeLog('chat_gift_debug.log',
                            `[Gift Event] Time: ${new Date().toISOString()} | Token: ${token} | GiftName: ${giftName} | GiftId: ${giftId} | x${repeatCount} | end=${repeatEnd}\n`
                        );
                    } catch (e) { /* ignore */ }

                    let finalDiamondCount = Math.max(0, Number(norm.diamondCount) || 0);
                    let finalIconUrl = extractGiftIconUrl(data)
                        || extractGiftIconUrl(data && (data.gift || data.giftDetails || data.extendedGiftInfo))
                        || '';

                    const roomMeta = lookupRoomGiftMeta(
                        tiktokConnect.fetchedGiftsMap || tiktokConnect.availableGifts || [],
                        giftId,
                        giftName
                    ) || lookupRoomGiftMeta(tiktokConnect.fetchedGiftsByName || {}, giftId, giftName);

                    if (roomMeta) {
                        if (!finalIconUrl && roomMeta.giftIconUrl) finalIconUrl = roomMeta.giftIconUrl;
                        if ((!finalDiamondCount || finalDiamondCount === 0) && roomMeta.diamondCount > 0) {
                            finalDiamondCount = roomMeta.diamondCount;
                        }
                    }

                    if (!finalIconUrl && Array.isArray(tiktokConnect.availableGifts)) {
                        const hit = tiktokConnect.availableGifts.find((x) =>
                            String(x.id) === String(giftId) ||
                            String(x.name || '').toLowerCase().trim() === String(giftName || '').toLowerCase().trim()
                        );
                        if (hit) {
                            finalIconUrl = pickFirstImageUrl(hit.image, hit.icon, hit.thumbnail) || finalIconUrl;
                            if ((!finalDiamondCount || finalDiamondCount === 0) && (hit.diamond_count || hit.diamondCount || hit.cost)) {
                                finalDiamondCount = parseInt(hit.diamond_count || hit.diamondCount || hit.cost || 0, 10) || finalDiamondCount;
                            }
                        }
                    }

                    const payload = {
                        uniqueId,
                        nickname,
                        avatar,
                        giftName,
                        giftId,
                        giftIcon: finalIconUrl,
                        diamondCount: finalDiamondCount,
                        repeatCount,
                        totalCoins: finalDiamondCount * repeatCount,
                        giftType,
                        repeatEnd,
                        msgId: String(norm.msgId || '')
                    };

                    console.log(`Gift received for user ${userId} (@${username}): ${uniqueId} sent ${giftName} x${repeatCount} (${payload.totalCoins} coins)${finalIconUrl ? ' [icon ok]' : ' [NO ICON]'}`);

                    emitTikTokGiftCoalesced(token, payload, {
                        onFlush: (finalGift) => {
                            markGiftGalleryGiftReceived(userId, finalGift.giftId || giftId, finalGift.repeatCount, finalGift.giftName || giftName);
                        }
                    });

                    // Persist catalog after emit — never block the live path
                    const persistId = giftId && !isNaN(parseInt(giftId, 10))
                        ? giftId
                        : ((giftName && finalIconUrl) ? (resolveKnownGiftId(giftName, giftId) || hashGiftName(giftName)) : '');
                    if (persistId) {
                        upsertTikTokGift(db, {
                            giftId: persistId,
                            giftName: giftName || persistId,
                            diamondCount: finalDiamondCount || 1,
                            giftIcon: finalIconUrl
                        }, { io, token }).catch((e) => {
                            console.error('Failed to dynamically save TikTok Gift:', e);
                        });
                    }
                } catch (err) {
                    console.error('[tiktok gift] parse/emit failed:', err?.message || err);
                    try {
                        emitTikTokGiftCoalesced(token, {
                            uniqueId: String(data?.uniqueId || data?.user?.uniqueId || ''),
                            nickname: String(data?.nickname || data?.user?.nickname || ''),
                            avatar: '',
                            giftName: String(data?.giftName || data?.gift?.name || 'Gift'),
                            giftId: String(data?.giftId || data?.gift?.id || ''),
                            giftIcon: extractGiftIconUrl(data) || '',
                            diamondCount: Number(data?.diamondCount) || 0,
                            repeatCount: Math.max(1, Number(data?.repeatCount) || 1),
                            totalCoins: 0,
                            giftType: 1,
                            repeatEnd: true,
                            msgId: ''
                        });
                    } catch (e2) {
                        console.error('[tiktok gift] last-ditch emit failed:', e2?.message || e2);
                    }
                }
            };

            const giftEventNames = new Set(['gift', 'WebcastGiftMessage']);
            if (WebcastEvent && WebcastEvent.GIFT) giftEventNames.add(WebcastEvent.GIFT);
            for (const ev of giftEventNames) {
                tiktokConnect.on(ev, handleTikTokGiftEvent);
            }
            const decodedEvt = (ControlEvent && ControlEvent.DECODED_DATA) || 'decodedData';
            tiktokConnect.on(decodedEvt, (payload) => {
                if (!payload || typeof payload !== 'object') return;
                const type = String(payload.type || payload.eventType || payload.event || '');
                if (type !== 'WebcastGiftMessage' && type !== 'gift' && !(WebcastEvent && type === WebcastEvent.GIFT)) return;
                const giftData = payload.data || payload.decodedData || payload.message;
                if (!giftData || typeof giftData !== 'object') return;
                handleTikTokGiftEvent(giftData);
            });

            // 3. กดไลฟ์จบ/ปิดไลฟ์
            tiktokConnect.on('streamEnd', () => {
                console.log(`TikTok Live ended for @${username}`);
                tiktokConnect.isLive = false;
                const statusObj = { connected: false, error: 'Live stream ended', username };
                io.to(token).emit('tiktok_status', statusObj);
                socket.emit('tiktok_status', statusObj);
                io.to(token).emit('tiktok_notification', { type: 'ended', username });
            });

            // 4. ติดตาม/แชร์ (Social events)
            const handleFollow = (data) => {
                const id = extractChatIdentity(data, data);
                const payload = {
                    uniqueId: id.uniqueId,
                    nickname: id.nickname,
                    avatar: id.avatar
                };
                io.to(token).emit('tiktok_follow', payload);
            };

            const handleShare = (data) => {
                const id = extractChatIdentity(data, data);
                const payload = {
                    uniqueId: id.uniqueId,
                    nickname: id.nickname,
                    avatar: id.avatar
                };
                io.to(token).emit('tiktok_share', payload);
            };

            tiktokConnect.on('follow', handleFollow);
            tiktokConnect.on('share', handleShare);
            tiktokConnect.on('social', (data) => {
                const displayType = data.displayType || data.common?.displayText?.key || '';
                if (displayType.includes('follow')) {
                    handleFollow(data);
                } else if (displayType.includes('share')) {
                    handleShare(data);
                }
            });

            // 5. กดถูกใจ (Like event)
            tiktokConnect.on('like', (data) => {
                ensureLiveFromEvent('like');
                const id = extractChatIdentity(data, data);
                const payload = {
                    uniqueId: id.uniqueId,
                    nickname: id.nickname,
                    avatar: id.avatar,
                    likeCount: parseInt(data.likeCount || data.count || 1),
                    totalLikeCount: extractTotalLikeCount(data)
                };
                io.to(token).emit('tiktok_like', payload);
            });

            // 6. เข้าร่วมสตรีม (Join/Member event)
            tiktokConnect.on('member', (data) => {
                ensureLiveFromEvent('member');
                const identity = extractChatIdentity(data, data);
                const regOpts = { tiktokUsername: username };
                if (chatUserHasFanClubBadge(null, data)) {
                    fanClubRegistry.mark(userId, identity, {
                        ...regOpts,
                        level: Math.max(1, extractTeamMemberLevel(data, data))
                    });
                }
                const teamMemberLevel = Math.max(extractTeamMemberLevel(data, data), chatUserHasFanClubBadge(null, data) ? 1 : 0);
                const payload = {
                    uniqueId: identity.uniqueId,
                    nickname: identity.nickname,
                    avatar: identity.avatar,
                    teamMemberLevel,
                    isFanClub: chatUserHasFanClubBadge(null, data) || fanClubRegistry.has(userId, identity, regOpts)
                };
                io.to(token).emit('tiktok_join', payload);
                if (chatUserHasFanClubBadge(null, data) || extractSubscriberFlag(data, data)) {
                    io.to(token).emit('tiktok_subscribe', payload);
                }
            });

            // บันทึกเก็บการเชื่อมต่อไว้
            activeTikTokConnections[userId] = tiktokConnect;

        } catch (error) {
            console.error('TikTok Setup Error:', error);
            const statusObj = { connected: false, error: error.message, username };
            io.to(token).emit('tiktok_status', statusObj);
            socket.emit('tiktok_status', statusObj);
            const cachedEmotes = getChannelEmotes(username);
            emitChannelEmotesLoaded(token, {
                username: cachedEmotes.username,
                emotes: cachedEmotes.emotes || [],
                lastUpdated: cachedEmotes.lastUpdated || null,
                fromCache: true,
                fetchFailed: true
            });
        }
    });

    // ตัดการเชื่อมต่อ TikTok Live
    socket.on('disconnect_tiktok', ({ token, userId }) => {
        let foundUsername = null;
        for (let username in activeTiktokSessions) {
            if (activeTiktokSessions[username].userId === userId) {
                foundUsername = username;
                delete activeTiktokSessions[username];
            }
        }

        // ปิดหน้าต่างบราวเซอร์ที่กำลังเปิดดักข้อมูลอยู่ของผู้นี้ด้วย
        if (userId && activeTiktokWindows[userId]) {
            try {
                activeTiktokWindows[userId].close();
                console.log(`Closed TikTok Browser window for user ${userId} upon disconnect`);
            } catch(e) {}
            delete activeTiktokWindows[userId];
        }

        if (activeTikTokConnections[userId]) {
            try {
                if (activeTikTokConnections[userId].retryInterval) {
                    clearInterval(activeTikTokConnections[userId].retryInterval);
                }
                const username = activeTikTokConnections[userId].username;
                activeTikTokConnections[userId].disconnect();
                console.log(`TikTok disconnected for user ${userId}`);
            } catch (e) {}
            delete activeTikTokConnections[userId];
        }
        

        
        console.log(`TikTok connection cleaned up for user ${userId}`);
        const statusObj = { connected: false, username: foundUsername || '' };
        io.to(token).emit('tiktok_status', statusObj);
        socket.emit('tiktok_status', statusObj);
        io.to(token).emit('tiktok_notification', { type: 'disconnected' });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (socket.streamToken && activePanels[socket.streamToken] === socket.id) {
            delete activePanels[socket.streamToken];
            console.log(`Cleaned up activePanel token on disconnect: ${socket.streamToken}`);
        }
    });
});

const axios = require('axios');

// ========== AI CHATBOT SHARED HELPERS ==========

const aiPendingQuestions = {}; // userId -> { question, askedAt }

function getGeminiApiKey(aiSettings) {
    let apiKey = aiSettings?.geminiApiKey || '';
    if (!apiKey.trim() || apiKey.startsWith('AIzaSy...')) {
        apiKey = process.env.GEMINI_API_KEY || '';
    }
    return apiKey.trim();
}

function tokenizeForMatch(text) {
    return (text || '').toLowerCase()
        .replace(/[^\u0E00-\u0E7Fa-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);
}

function scoreMemoryMatch(userInput, memory) {
    const input = (userInput || '').toLowerCase().trim();
    const kw = (memory.keyword || '').toLowerCase().trim();
    if (!kw) return 0;
    if (input === kw) return 200;
    if (input.includes(kw)) return 100 + kw.length;
    if (kw.includes(input) && input.length > 3) return 90;

    const inputTokens = tokenizeForMatch(input);
    const kwTokens = tokenizeForMatch(kw);
    if (!kwTokens.length) return 0;

    let overlap = 0;
    for (const t of kwTokens) {
        if (inputTokens.some(it => it.includes(t) || t.includes(it))) overlap++;
    }
    const ratio = overlap / kwTokens.length;
    if (ratio >= 0.6) return 60 + overlap * 8;
    if (ratio >= 0.4 && overlap >= 2) return 45 + overlap * 5;
    return 0;
}

function parseTeachCommand(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('!สอน') || trimmed.startsWith('!learn')) {
        const rest = trimmed.replace(/^!(?:สอน|learn)\s*/i, '').trim();
        if (!rest) return null;
        if (rest.includes('->')) {
            const parts = rest.split('->');
            return { keyword: parts[0].trim(), content: parts.slice(1).join('->').trim() };
        }
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx > 0) {
            return { keyword: rest.substring(0, spaceIdx).trim(), content: rest.substring(spaceIdx + 1).trim() };
        }
        return null;
    }

    const patterns = [
        /^(?:จำไว้(?:ว่า|นะ)?|บันทึก(?:ว่า|นะ)?)\s*(.+?)\s*(?:คือ|เป็น|=)\s*(.+)$/i,
        /^สอน(?:หน่อย)?(?:ว่า|นะ)?\s*(.+?)\s*(?:คือ|เป็น|=)\s*(.+)$/i,
        /^(.+?)\s+ตอบ(?:ว่า|ว่า)?\s+(.+)$/i,
        /^(.+?)\s+คำตอบ(?:คือ)?\s+(.+)$/i,
        /^(.+?)\s*[,，]\s*(?:คำตอบ|ตอบ)\s*(.+)$/i
    ];
    for (const re of patterns) {
        const m = trimmed.match(re);
        if (m && m[1]?.trim() && m[2]?.trim()) {
            return { keyword: m[1].trim(), content: m[2].trim() };
        }
    }

    return null;
}

function formatLocalPresetResponse(preset, content) {
    const presets = {
        pandy_funny: [
            `เรื่องนี้แพนดี้รู้ดีเหมียว! ${content} เหมียว~`,
            `อันนี้แพนดี้รู้นะเหมียว... คือ ${content} เหมียว!`,
            `เหมียว! จำได้ว่า ${content} เหมียว~`
        ],
        pandy_sweet: [
            `สำหรับเรื่องนี้ ${content} ค่ะ หวังว่าจะช่วยได้นะคะ`,
            `รายละเอียดคือ ${content} ค่ะ ยินดีช่วยเหลือเสมอค่ะ`,
            `แพนดี้จำได้ว่า ${content} ค่ะ`
        ],
        pandy_comedy: [
            `ฮั่นแน่! ถามเรื่องนี้หรอ? คำตอบก็คือ ${content} ครับพ้มมม ฮ่าๆ`,
            `ตึกโป๊ะ! ${content} ไงล่ะจ๊ะตัวเธอ`,
            `เรื่องนี้ง่ายมาก... ${content} ครับผม! 555`
        ],
        pandy_tough: [
            `เรื่องนี้งั้นเรอะ? ${content} จำใส่ใจไว้ด้วยล่ะ!`,
            `รู้แล้วเงียบไว้ล่ะ... ${content} เข้าใจไหม!`,
            `เฮ่ย! ${content} นั่นแหละคำตอบ!`
        ],
        custom: [`${content}`]
    };
    const templates = presets[preset] || presets.pandy_funny;
    return templates[Math.floor(Math.random() * templates.length)];
}

function getLocalPresetFallback(preset, hasPending = false) {
    if (hasPending) {
        const pendingHints = {
            pandy_funny: 'ยังไม่รู้เรื่องนี้เหมียว~ บอกคำตอบมาเลย เดี๋ยวแพนดี้จำให้! (เช่น พูดว่า "กะเพรา" หรือ "จำไว้ว่า กินข้าวอะไรดี คือ กะเพรา") เหมียว',
            pandy_sweet: 'แพนดี้ยังไม่ทราบเรื่องนี้ค่ะ บอกคำตอบมาได้เลยนะคะ แพนดี้จะจำไว้ให้ค่ะ',
            pandy_comedy: 'สมองบอดเรื่องนี้ครับ! บอกคำตอบมา เดี๋ยวจดให้ 555',
            pandy_tough: 'ไม่รู้! บอกคำตอบมาเลย จะจำให้!',
            custom: 'ยังไม่รู้คำตอบนี้ บอกคำตอบมาได้เลย ฉันจะจำไว้'
        };
        return pendingHints[preset] || pendingHints.pandy_funny;
    }
    const fallbacks = {
        pandy_funny: [
            'เรื่องนี้แพนดี้ยังไม่รู้เลยเหมียว~ บอกคำตอบมาเลย เดี๋ยวจำให้! หรือพิมพ์ "จำไว้ว่า [คำถาม] คือ [คำตอบ]" เหมียว',
            'เหมียว? สมองแพนดี้ยังว่างอยู่เหมียว สอนฉันได้นะ เช่น "กินข้าวอะไรดี ตอบ กะเพรา" เหมียว~'
        ],
        pandy_sweet: [
            'ขออภัยนะคะ แพนดี้ยังไม่มีข้อมูลเกี่ยวกับเรื่องนี้ค่ะ คุณสามารถพิมพ์ "จำไว้ว่า [คำถาม] คือ [คำตอบ]" เพื่อสอนแพนดี้ได้ค่ะ',
            'เรื่องนี้แพนดี้ยังไม่ทราบเลยค่ะ ลองป้อนข้อมูลให้แพนดี้ได้เรียนรู้ได้นะคะ'
        ],
        pandy_comedy: [
            'ตึกโป๊ะ! ข้อมูลนี้ตลับเมตรวัดไม่ถึงครับพี่น้อง 555 สอนผมหน่อยสิ!',
            'ฮ่าๆ เรื่องนี้สมองบอดสนิท ศิษย์ส่ายหน้าครับผม! ใครรู้บอกที'
        ],
        pandy_tough: [
            'ไม่รู้เฟ้ย! ข้อมูลไม่มีในหัว ไปสอนคีย์เวิร์ดมาใหม่เลยไป!',
            'ถามไรเนี่ย? สมองข้ายังไม่ได้เรียนเรื่องนี้เลย!'
        ],
        custom: ['ขออภัย ฉันยังไม่รู้จักข้อมูลส่วนนี้ คุณสามารถเพิ่มความจำให้ฉันได้']
    };
    const templates = fallbacks[preset] || fallbacks.pandy_funny;
    return templates[Math.floor(Math.random() * templates.length)];
}

function formatLearnConfirmReply(preset, keyword, content) {
    if (preset === 'pandy_funny') return `จำได้แล้วเหมียว! เรื่อง ${keyword} คือ ${content} เหมียว~`;
    if (preset === 'pandy_sweet') return `แพนดี้บันทึกเรื่อง ${keyword} เป็น ${content} เรียบร้อยค่ะ`;
    if (preset === 'pandy_comedy') return `จดแป๊บ! ${keyword} ตอบว่า ${content} จัดไปครับวัยรุ่น! 555`;
    if (preset === 'pandy_tough') return `จดไว้แล้ว! ${keyword} คือ ${content} อย่าลืมอีกล่ะ!`;
    return `บันทึกความจำ: ${keyword} คือ ${content}`;
}

async function getAISettingsForUser(userId) {
    const configRow = await db.get('SELECT data FROM user_configs WHERE userId = ?', [userId]);
    if (!configRow) return {};
    try {
        return JSON.parse(configRow.data).aiChatbotSettings || {};
    } catch {
        return {};
    }
}

async function saveAIMemory(keyword, content, streamToken) {
    const keywordClean = (keyword || '').trim().slice(0, 100);
    const contentClean = (content || '').trim().slice(0, 500);
    if (!keywordClean || !contentClean) return false;

    await db.run(
        `INSERT INTO ai_memories (keyword, content, createdAt)
         VALUES (?, ?, ?)
         ON CONFLICT(keyword)
         DO UPDATE SET content = excluded.content, createdAt = excluded.createdAt`,
        [keywordClean, contentClean, new Date().toISOString()]
    );

    if (streamToken) {
        io.to(streamToken).emit('ai_learned_memories', { keyword: keywordClean, content: contentClean });
    }
    return true;
}

async function findMatchedMemory(userInput) {
    const memories = await db.all('SELECT id, keyword, content FROM ai_memories');
    let best = null;
    let bestScore = 0;
    for (const m of memories) {
        const score = scoreMemoryMatch(userInput, m);
        if (score > bestScore) {
            bestScore = score;
            best = m;
        }
    }
    if (bestScore >= 40) {
        return { matched: best, allMemories: memories, matchScore: bestScore };
    }
    return { matched: null, allMemories: memories, matchScore: 0 };
}

async function tryLearnFromPendingAnswer(userId, userInput, streamToken, activePreset) {
    const pending = aiPendingQuestions[userId];
    if (!pending) return null;
    if (Date.now() - pending.askedAt > 10 * 60 * 1000) {
        delete aiPendingQuestions[userId];
        return null;
    }

    const trimmed = userInput.trim();
    if (!trimmed) return null;

    const looksLikeNewQuestion = /[?？]$/.test(trimmed) ||
        /\b(ไหม|หรือ|ทำไม|อย่างไร|ยังไง|อะไร|ใคร|ที่ไหน|เมื่อไหร่)\b/.test(trimmed);
    if (looksLikeNewQuestion && trimmed.length > 20) return null;

    const explicit = trimmed.match(/^(?:คำตอบ(?:คือ)?|ตอบ(?:ว่า)?)\s+(.+)$/i);
    const answer = (explicit ? explicit[1] : trimmed).trim();
    if (!answer || answer.length > 300) return null;

    await saveAIMemory(pending.question, answer, streamToken);
    delete aiPendingQuestions[userId];

    return {
        response: formatLearnConfirmReply(activePreset, pending.question, answer),
        memoriesMatched: [pending.question],
        learned: true
    };
}

async function callGeminiChat(userInput, aiSettings, memories) {
    const apiKey = getGeminiApiKey(aiSettings);
    if (!apiKey) return null;

    const systemPrompt = aiSettings.aiSystemPrompt || 'คุณคือแพนดี้บอทจอมกวน แสนซน ชอบพูดภาษาไทยลงท้ายด้วยเหมียว เสมอ';
    const model = aiSettings.aiModel || 'gemini-1.5-flash';
    const inputClean = userInput.toLowerCase().trim();

    let memoriesToUse = [];
    if (memories.length <= 50) {
        memoriesToUse = memories;
    } else {
        memoriesToUse = memories.filter(m => inputClean.includes(m.keyword.toLowerCase()));
    }

    let memoryPromptContext = '';
    if (memoriesToUse.length > 0) {
        memoryPromptContext = '\n\n[ความทรงจำที่บันทึกไว้]:\n' +
            memoriesToUse.map(m => `- ${m.keyword}: ${m.content}`).join('\n');
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await axios.post(geminiUrl, {
        contents: [{ role: 'user', parts: [{ text: userInput }] }],
        systemInstruction: { parts: [{ text: systemPrompt + memoryPromptContext }] }
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function seedStarterMemoriesIfEmpty() {
    const row = await db.get('SELECT COUNT(*) as cnt FROM ai_memories');
    if (row && row.cnt > 0) return;

    const starters = [
        { keyword: 'สวัสดี', content: 'สวัสดีเหมียว! ยินดีที่ได้คุยกันนะเหมียว~' },
        { keyword: 'ชื่ออะไร', content: 'ฉันชื่อแพนดี้บอท เหมียว! ผู้ช่วยสุดน่ารักของคุณ' },
        { keyword: 'กินข้าวอะไรดี', content: 'ลองกะเพรา ข้าวผัด หรือส้มตำก็อร่อยดีนะเหมียว~' },
        { keyword: 'ทำอะไรดี', content: 'ลองพักผ่อน ดูหนัง หรือมาคุยกับแพนดี้ก็สนุกดีเหมียว!' }
    ];
    const now = new Date().toISOString();
    for (const s of starters) {
        await db.run(
            'INSERT OR IGNORE INTO ai_memories (keyword, content, createdAt) VALUES (?, ?, ?)',
            [s.keyword, s.content, now]
        );
    }
    console.log('Seeded starter AI memories');
}

async function generateAIChatResponse(userId, userInput, options = {}) {
    const { streamToken } = options;
    const aiSettings = await getAISettingsForUser(userId);
    const aiBrainMode = aiSettings.aiBrainMode || 'local';
    const activePreset = aiSettings.aiPersonalityPreset || 'pandy_funny';

    const teachCmd = parseTeachCommand(userInput);
    if (teachCmd && teachCmd.keyword && teachCmd.content) {
        delete aiPendingQuestions[userId];
        await saveAIMemory(teachCmd.keyword, teachCmd.content, streamToken);
        return {
            response: formatLearnConfirmReply(activePreset, teachCmd.keyword, teachCmd.content),
            memoriesMatched: [teachCmd.keyword],
            learned: true
        };
    }

    const { matched: matchedMemory, allMemories: memories } = await findMatchedMemory(userInput);

    if (matchedMemory) {
        delete aiPendingQuestions[userId];
        return {
            response: formatLocalPresetResponse(activePreset, matchedMemory.content),
            memoriesMatched: [matchedMemory.keyword]
        };
    }

    const pendingLearn = await tryLearnFromPendingAnswer(userId, userInput, streamToken, activePreset);
    if (pendingLearn) return pendingLearn;

    if (aiBrainMode === 'local') {
        const useGeminiFallback = aiSettings.aiLocalGeminiFallback !== false;
        const autoLearn = aiSettings.aiLocalAutoLearn !== false;
        const apiKey = getGeminiApiKey(aiSettings);

        if (useGeminiFallback && apiKey) {
            try {
                const geminiAnswer = await callGeminiChat(userInput, aiSettings, memories);
                if (geminiAnswer) {
                    if (autoLearn) {
                        await saveAIMemory(userInput, geminiAnswer, streamToken);
                    }
                    delete aiPendingQuestions[userId];
                    return {
                        response: formatLocalPresetResponse(activePreset, geminiAnswer),
                        memoriesMatched: [],
                        learned: autoLearn,
                        fromGemini: true
                    };
                }
            } catch (geminiErr) {
                console.error('Local hybrid Gemini fallback failed:', geminiErr.message);
            }
        }

        aiPendingQuestions[userId] = { question: userInput, askedAt: Date.now() };
        return {
            response: getLocalPresetFallback(activePreset, true),
            memoriesMatched: [],
            pendingQuestion: true
        };
    }

    let apiKey = getGeminiApiKey(aiSettings);
    if (!apiKey) {
        throw new Error('กรุณากรอก Gemini API Key ในหัวข้อ "ตั้งค่าคีย์เชื่อมต่อ (Advanced API Key)" ด้านล่าง เพื่อเชื่อมต่อสมอง AI');
    }

    const aiResponse = await callGeminiChat(userInput, aiSettings, memories);
    if (!aiResponse) {
        throw new Error('ไม่สามารถประมวลผลคำตอบจาก Gemini ได้');
    }

    delete aiPendingQuestions[userId];

    const inputClean = userInput.toLowerCase().trim();
    let memoriesToUse = [];
    if (memories.length <= 50) {
        memoriesToUse = memories;
    } else {
        memoriesToUse = memories.filter(m => inputClean.includes(m.keyword.toLowerCase()));
    }

    const model = aiSettings.aiModel || 'gemini-1.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Background memory extraction (Gemini only)
    try {
        const extractionPrompt = `คุณคือระบบสกัดความจำ (Memory Extraction System)
วิเคราะห์บทสนทนาต่อไปนี้:
ผู้ใช้: "${userInput}"
AI: "${aiResponse}"

มีข้อมูลสำคัญใหม่ที่ผู้ใช้บอกเกี่ยวกับตัวเอง (เช่น ชื่อเล่น, งานอดิเรก, อายุ, ความชอบ) หรือไม่?
หากมี ให้ตอบเป็น JSON Array เท่านั้น: [{"keyword":"...","content":"..."}]
หากไม่มี ให้ตอบ [] เท่านั้น ห้ามใส่ markdown`;

        axios.post(geminiUrl, {
            contents: [{ role: 'user', parts: [{ text: extractionPrompt }] }]
        }, { headers: { 'Content-Type': 'application/json' } }).then(async (extRes) => {
            let text = extRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            text = text.trim().replace(/^```json\s*/, '').replace(/```$/, '').trim();
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const newlyLearned = [];
                    for (const item of parsed) {
                        if (item.keyword && item.content) {
                            await saveAIMemory(item.keyword, item.content, null);
                            newlyLearned.push({ keyword: item.keyword.trim(), content: item.content.trim() });
                        }
                    }
                    if (newlyLearned.length > 0 && streamToken) {
                        io.to(streamToken).emit('ai_learned_memories', { newlyLearned });
                    } else if (newlyLearned.length > 0) {
                        const userRow = await db.get('SELECT streamToken FROM users WHERE id = ?', [userId]);
                        if (userRow?.streamToken) {
                            io.to(userRow.streamToken).emit('ai_learned_memories', { newlyLearned });
                        }
                    }
                }
            } catch (jsonErr) {
                console.error('Failed to parse extracted memories JSON:', jsonErr.message);
            }
        }).catch(extErr => {
            console.error('Gemini memory extraction failed:', extErr.message);
        });
    } catch (memErr) {
        console.error('Memory extraction setup failed:', memErr.message);
    }

    return {
        response: aiResponse,
        memoriesMatched: memoriesToUse.map(m => m.keyword)
    };
}

async function handleStreamChatAI(userId, streamToken, chatMsg, senderName = '') {
    const teachCmd = parseTeachCommand(chatMsg);
    if (teachCmd && teachCmd.keyword && teachCmd.content) {
        await saveAIMemory(teachCmd.keyword, teachCmd.content, streamToken);
        const aiSettings = await getAISettingsForUser(userId);
        const reply = formatLearnConfirmReply(
            aiSettings.aiPersonalityPreset || 'pandy_funny',
            teachCmd.keyword,
            teachCmd.content
        );
        io.to(streamToken).emit('ai_speak_reply', {
            text: reply,
            fromLive: true,
            triggerUser: senderName,
            triggerComment: chatMsg
        });
        return;
    }

    const aiSettings = await getAISettingsForUser(userId);
    if (aiSettings.aiAutoChatRespond !== true) return;

    const inputMode = aiSettings.aiVoiceInputMode || 'both';
    if (inputMode === 'mic') return;

    const respondMode = aiSettings.aiAutoChatRespondMode || 'both';
    const activePreset = aiSettings.aiPersonalityPreset || 'pandy_funny';

    if (respondMode === 'keyword' || respondMode === 'both') {
        const { matched: matchedMemory } = await findMatchedMemory(chatMsg);
        if (matchedMemory) {
            const replyText = formatLocalPresetResponse(activePreset, matchedMemory.content);
            io.to(streamToken).emit('ai_speak_reply', {
                text: replyText,
                fromLive: true,
                triggerUser: senderName,
                triggerComment: chatMsg
            });
            return;
        }
        if (respondMode === 'keyword') return;
    }

    try {
        const result = await generateAIChatResponse(userId, chatMsg, { streamToken });
        if (result.response) {
            io.to(streamToken).emit('ai_speak_reply', {
                text: result.response,
                fromLive: true,
                triggerUser: senderName,
                triggerComment: chatMsg
            });
        }
    } catch (err) {
        console.error('Stream chat AI response failed:', err.message);
    }
}

// Helper to authenticate JWT token inside our routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ error: 'No token' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || !user?.userId) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// API: POST Chat with AI Chatbot
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    const { userInput } = req.body;
    const userId = req.user.userId;

    if (!userInput || !userInput.trim()) {
        return res.status(400).json({ error: 'Input message is required' });
    }

    try {
        await seedStarterMemoriesIfEmpty();
        const userRow = await db.get('SELECT streamToken FROM users WHERE id = ?', [userId]);
        const streamToken = userRow?.streamToken || null;
        const result = await generateAIChatResponse(userId, userInput.trim(), { streamToken });

        res.json({
            success: true,
            response: result.response,
            memoriesMatched: result.memoriesMatched || [],
            learned: result.learned === true
        });
    } catch (err) {
        console.error('AI Chat API Error:', err.response?.data || err.message);
        res.status(500).json({ error: 'การประมวลผล AI ล้มเหลว: ' + (err.response?.data?.error?.message || err.message) });
    }
});

// API: GET Memories
app.get('/api/ai/memories', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM ai_memories ORDER BY createdAt DESC');
        res.json({ success: true, memories: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch memories' });
    }
});

// API: POST Add/Update Memory Manually
app.post('/api/ai/memories', authenticateToken, async (req, res) => {
    const { keyword, content } = req.body;
    
    if (!keyword || !content || !keyword.trim() || !content.trim()) {
        return res.status(400).json({ error: 'Keyword and content are required' });
    }
    
    try {
        await db.run(
            `INSERT INTO ai_memories (keyword, content, createdAt) 
             VALUES (?, ?, ?) 
             ON CONFLICT(keyword) 
             DO UPDATE SET content = excluded.content, createdAt = excluded.createdAt`,
            [keyword.trim(), content.trim(), new Date().toISOString()]
        );
        res.json({ success: true, message: 'บันทึกความทรงจำสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save memory' });
    }
});

// API: DELETE Memory
app.delete('/api/ai/memories/:id', authenticateToken, async (req, res) => {
    const memoryId = req.params.id;
    try {
        await db.run('DELETE FROM ai_memories WHERE id = ?', [memoryId]);
        res.json({ success: true, message: 'ลบความทรงจำสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

// รันเซิร์ฟเวอร์ — แจ้ง Electron เมื่อพร้อม (กัน loadURL ก่อน listen)
// ถ้าพอร์ตถูกโปรเซสค้าง occupie ไว้ จะ retry ไม่ยอมหยุดที่ EADDRINUSE ครั้งเดียว
global.__tokControlServerReady = false;
function startTokControlHttpServer(attempt) {
    const maxAttempts = 25;
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            server.removeListener('listening', onListening);
            if (err && err.code === 'EADDRINUSE' && attempt < maxAttempts) {
                console.warn(`[Server] port ${PORT} in use — retry ${attempt + 1}/${maxAttempts}`);
                setTimeout(() => {
                    startTokControlHttpServer(attempt + 1).then(resolve, reject);
                }, 400);
                return;
            }
            console.error(`[Server] listen error on port ${PORT}:`, err && err.message);
            reject(err);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            global.__tokControlServerReady = true;
            seedStarterMemoriesIfEmpty().catch(err => console.error('Failed to seed AI memories:', err.message));
            syncSharedGiftsToLocal(db).catch(err => console.error('[GiftsSync] Startup sync failed:', err.message));
            youtubeLive.restoreEnabled().catch(err => console.warn('[youtube-live] restore:', err.message));
            console.log(`TokControl Web Server running on port ${PORT}`);
            resolve(PORT);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        try {
            server.listen(PORT, '127.0.0.1');
        } catch (err) {
            onError(err);
        }
    });
}
global.__tokControlServerReadyPromise = startTokControlHttpServer(0);

// ฟังก์ชั่นช่วยอัปเดตราคาเหรียญของขวัญในฐานข้อมูลให้ตรงตามความเป็นจริงเมื่อเปิดโปรแกรม
const migrateGifts = async () => {
    try {
        const POPULAR_TIKTOK_GIFTS = {
            'rose': 1, 'กุหลาบ': 1, 'ice cream': 1, 'ไอศกรีม': 1, 'tiktok': 1,
            'finger heart': 5, 'มินิฮาร์ท': 5, 'mic': 5, 'ไมค์': 5, 'panda': 5, 'แพนด้า': 5,
            'perfume': 20, 'น้ำหอม': 20, 'doughnut': 30, 'donut': 30, 'โดนัท': 30, 'drum pop': 30, 'กลอง': 30,
            'crown': 99, 'มงกุฎ': 99, 'confetti': 100, 'คอนเฟตติ': 100,
            'gold mine': 1000, 'เหมืองทอง': 1000
        };

        for (let name in POPULAR_TIKTOK_GIFTS) {
            const count = POPULAR_TIKTOK_GIFTS[name];
            await db.run(
                'UPDATE tiktok_gifts SET diamondCount = ? WHERE (LOWER(giftName) = ? OR LOWER(giftName) LIKE ?) AND diamondCount = 1',
                [count, name, `%${name}%`]
            );
        }
        console.log('Migrated/Updated gift coin values in DB successfully!');
    } catch(e) {
        console.error("Migration error:", e);
    }
};
setTimeout(migrateGifts, 1500);

// บันทึกลิงก์ HTTPS จาก secure tunnel
let tunnelUrl = '';
let tunnelProcess = null;
let tunnelReconnectTimer = null;
let tunnelShuttingDown = false;
const { spawn } = require('child_process');

function startTunnel() {
    if (tunnelShuttingDown) return;
    console.log("Initializing secure HTTPS tunnel (localhost.run)...");
    const tunnel = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', '80:localhost:3000', 'nokey@localhost.run']);
    tunnelProcess = tunnel;
    
    tunnel.stdout.on('data', (data) => {
        const str = data.toString();
        const match = str.match(/https:\/\/[a-zA-Z0-9_\-\.]+\.lhr\.life/);
        if (match) {
            tunnelUrl = match[0];
            console.log(`Secure HTTPS Tunnel active: ${tunnelUrl}`);
        }
    });

    tunnel.stderr.on('data', (data) => {
        const str = data.toString();
        const match = str.match(/https:\/\/[a-zA-Z0-9_\-\.]+\.lhr\.life/);
        if (match) {
            tunnelUrl = match[0];
            console.log(`Secure HTTPS Tunnel active (stderr): ${tunnelUrl}`);
        }
    });

    tunnel.on('close', (code) => {
        tunnelProcess = null;
        if (tunnelShuttingDown) return;
        console.log(`Tunnel child process exited with code ${code}. Reconnecting in 10s...`);
        tunnelUrl = '';
        tunnelReconnectTimer = setTimeout(startTunnel, 10000);
    });
    
    tunnel.on('error', (err) => {
        console.error("Failed to start tunnel process:", err);
    });
}
let electronPackaged = false;
try {
    const { app: electronApp } = require('electron');
    electronPackaged = !!(electronApp && electronApp.isPackaged);
} catch (e) {}
if (!electronPackaged && process.env.ENABLE_TUNNEL === '1') {
    setTimeout(startTunnel, 2000);
}

function disconnectAllTikTokSessions() {
    for (const [userId, connection] of Object.entries(activeTikTokConnections)) {
        try {
            if (connection?.retryInterval) clearInterval(connection.retryInterval);
            connection?.disconnect?.();
        } catch (e) {}
        delete activeTikTokConnections[userId];
    }
}

function shutdownTokControlBackend() {
    return new Promise((resolve) => {
        tunnelShuttingDown = true;
        disconnectAllTikTokSessions();
        if (tunnelReconnectTimer) {
            clearTimeout(tunnelReconnectTimer);
            tunnelReconnectTimer = null;
        }
        if (tunnelProcess) {
            try {
                tunnelProcess.removeAllListeners('close');
                tunnelProcess.kill();
            } catch (e) {}
            tunnelProcess = null;
        }
        try { io?.close(); } catch (e) {}
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try {
            server?.close(() => done());
        } catch (e) {
            done();
        }
        setTimeout(done, 1200);
    });
}

global.__shutdownTokControlBackend = shutdownTokControlBackend;

app.get('/api/tunnel-status', (req, res) => {
    res.json({ success: true, tunnelUrl });
});

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const TTS_VOICE_PRESETS = {
    'google-siri': { engine: 'google-siri', rate: 1.0 },
    google: { engine: 'google' },
    'google-fast': { engine: 'google', rate: 1.35, pitch: 1.0 },
    'google-slow': { engine: 'google', rate: 0.85, pitch: 1.0 },
    'google-high': { engine: 'google', rate: 1.0, pitch: 1.2 },
    'google-low': { engine: 'google', rate: 1.0, pitch: 0.85 },
    'th-TH-PremwadeeNeural': { engine: 'edge', voice: 'th-TH-PremwadeeNeural' },
    'th-TH-PremwadeeNeural-fast': { engine: 'edge', voice: 'th-TH-PremwadeeNeural', rate: 1.25, pitch: 1.0 },
    'th-TH-NiwatNeural': { engine: 'edge', voice: 'th-TH-NiwatNeural' },
    'th-TH-NiwatNeural-slow': { engine: 'edge', voice: 'th-TH-NiwatNeural', rate: 0.9, pitch: 1.0 }
};

function buildEdgeProsodyOptions(rate, pitch) {
    const options = {};
    const ratePct = Math.round((rate - 1) * 100);
    const pitchHz = Math.round((pitch - 1) * 12);
    if (ratePct !== 0) options.rate = `${ratePct > 0 ? '+' : ''}${ratePct}%`;
    if (pitchHz !== 0) options.pitch = `${pitchHz > 0 ? '+' : ''}${pitchHz}Hz`;
    return options;
}

async function synthesizeEdgeTts(text, voiceName, rate, pitch) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text, buildEdgeProsodyOptions(rate, pitch));
    const chunks = [];
    try {
        for await (const chunk of audioStream) chunks.push(chunk);
    } finally {
        tts.close();
    }
    const audio = Buffer.concat(chunks);
    if (!audio.length) throw new Error('Edge TTS returned empty audio');
    return audio;
}

function synthesizeGoogleSiriTts(text, rate) {
    return new Promise((resolve, reject) => {
        // Google Chrome Speech API v2 — เสียงสิริไทยตัวเดิม (ไม่ใช้ YOUTUBE_API_KEY)
        const GOOGLE_TTS_KEY = String(
            process.env.GOOGLE_TTS_API_KEY ||
            'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'
        ).trim();
        if (!GOOGLE_TTS_KEY || GOOGLE_TTS_KEY.startsWith('AIzaSy...')) {
            return reject(new Error('GOOGLE_TTS_API_KEY is not set'));
        }
        const lang = 'th-TH';
        const gender = 'female';
        const uiRate = Number.isFinite(rate) ? rate : 1.0;
        // UI 1.0x = speed 0.80 ตามตัวอย่างเสียงสิริเดิม
        // ถ้า client ส่ง 0.80 อยู่แล้ว ใช้เป็น speed ของ API ตรงๆ ไม่คูณซ้ำ
        const speed = uiRate <= 0.95
            ? Math.max(0.25, Math.min(1.5, uiRate))
            : Math.max(0.25, Math.min(1.5, 0.80 * uiRate));

        const url = 'https://www.google.com/speech-api/v2/synthesize'
          + '?key=' + GOOGLE_TTS_KEY
          + '&enc=mpeg'
          + '&lang=' + encodeURIComponent(lang)
          + '&text=' + encodeURIComponent(text)
          + '&speed=' + speed.toFixed(2)
          + '&pitch=0.50'
          + '&rate=48000'
          + '&gender=' + gender;

        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'audio/mpeg, audio/*'
          }
        };

        https.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Google TTS HTTP status ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (!buf.length) return reject(new Error('Google Siri TTS empty audio'));
                resolve(buf);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

function resolveTtsRequest(voiceKey, queryRate, queryPitch) {
    const preset = TTS_VOICE_PRESETS[voiceKey] || TTS_VOICE_PRESETS['google-siri'];
    const rate = Number.isFinite(queryRate) ? queryRate : (preset.rate ?? 1.0);
    const pitch = Number.isFinite(queryPitch) ? queryPitch : (preset.pitch ?? 1.0);
    return { preset, rate, pitch };
}

function proxyGoogleTts(text, rate, pitch, res) {
    // แนวทางเดียวกับเวอร์ชันเก่าบน GitHub: proxy Google Translate TTS
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(text)}`;
    const reqOpts = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
            'Referer': 'https://translate.google.com/'
        }
    };
    if (rate === 1.0 && pitch === 1.0) {
        const request = https.get(googleUrl, reqOpts, (googleRes) => {
            if (googleRes.statusCode !== 200) {
                console.error(`Google TTS responded with status: ${googleRes.statusCode}`);
                if (!res.headersSent) return res.status(googleRes.statusCode || 502).send('Error fetching audio');
                return;
            }
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'audio/mpeg');
            googleRes.pipe(res);
        });
        request.on('error', (err) => {
            console.error('TTS Proxy Error:', err);
            if (!res.headersSent) res.status(500).send('Error fetching audio');
        });
        return;
    }

    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    const command = ffmpeg()
        .input(googleUrl)
        .inputOptions(['-user_agent', reqOpts.headers['User-Agent']])
        .format('mp3');

    let filters = [];
    if (pitch !== 1.0) {
        filters.push(`asetrate=24000*${pitch.toFixed(2)}`);
        filters.push('aresample=24000');
    }

    const relativeTempo = rate / pitch;
    let tempoFilters = [];
    let t = relativeTempo;
    while (t > 2.0) {
        tempoFilters.push('atempo=2.0');
        t /= 2.0;
    }
    while (t < 0.5) {
        tempoFilters.push('atempo=0.5');
        t /= 0.5;
    }
    if (Math.abs(t - 1.0) > 0.01) {
        tempoFilters.push(`atempo=${t.toFixed(2)}`);
    }
    const tempoFilterStr = tempoFilters.join(',');
    if (tempoFilterStr) filters.push(tempoFilterStr);

    if (filters.length > 0) {
        command.audioFilters(filters);
    }

    command.on('error', (err) => {
        console.error('FFmpeg TTS error:', err.message);
        // FFmpeg พัง → ถอยไปส่งเสียงต้นฉบับแบบเวอร์ชันเก่า
        if (!res.headersSent) {
            proxyGoogleTts(text, 1.0, 1.0, res);
        }
    });

    command.pipe(res, { end: true });
}

app.get('/api/tts', async (req, res) => {
    const text = req.query.text || '';
    if (!text.trim()) {
        return res.status(400).send('Text parameter is required');
    }
    // map legacy / UI labels → engine keys
    let voiceKey = String(req.query.voice || 'google-siri').trim();
    if (
        !voiceKey ||
        voiceKey === 'Thai (Default)' ||
        voiceKey === 'Google Voice (ไทย)' ||
        voiceKey === 'Google Translate (ไทย)'
    ) {
        // ค่าเริ่มต้นเดิมของ TokControl = Google Siri ไทย
        voiceKey = 'google-siri';
    }
    const queryRate = parseFloat(req.query.rate);
    const queryPitch = parseFloat(req.query.pitch);
    let { preset, rate, pitch } = resolveTtsRequest(
        voiceKey,
        Number.isFinite(queryRate) ? queryRate : NaN,
        Number.isFinite(queryPitch) ? queryPitch : NaN
    );

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (preset.engine === 'edge' && preset.voice) {
            try {
                const audio = await synthesizeEdgeTts(text, preset.voice, rate, pitch);
                return res.send(audio);
            } catch (edgeErr) {
                console.warn('Edge TTS failed, fallback to Google Translate:', edgeErr.message);
                return proxyGoogleTts(text, 1.0, 1.0, res);
            }
        }
        if (preset.engine === 'google-siri') {
            try {
                const audio = await synthesizeGoogleSiriTts(text, rate);
                return res.send(audio);
            } catch (siriErr) {
                // ไม่มี API key / endpoint ล่ม → ใช้ Google Translate แบบเวอร์ชันเก่า
                console.warn('Google Siri TTS failed, fallback to Google Translate:', siriErr.message);
                return proxyGoogleTts(text, Number.isFinite(queryRate) ? queryRate : 1.0, Number.isFinite(queryPitch) ? queryPitch : 1.0, res);
            }
        }
        proxyGoogleTts(text, rate, pitch, res);
    } catch (err) {
        console.error('TTS error:', err.message);
        try {
            return proxyGoogleTts(text, 1.0, 1.0, res);
        } catch (e2) {
            if (!res.headersSent) res.status(500).send('Error fetching audio');
        }
    }
});

app.get('/api/tts/voices', async (req, res) => {
    try {
        const tts = new MsEdgeTTS();
        const voices = await tts.getVoices();
        const thVoices = voices
            .filter(v => String(v.Locale || '').startsWith('th'))
            .map(v => ({
                id: v.ShortName,
                label: v.FriendlyName || v.ShortName,
                gender: v.Gender,
                locale: v.Locale
            }));
        res.json({ success: true, voices: thVoices });
    } catch (err) {
        console.error('TTS voices error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
