const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// โหลด .env ถ้ามี (สำหรับ Spotify API keys)
try {
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const eq = trimmed.indexOf('=');
            if (eq < 1) return;
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim();
            if (key && process.env[key] === undefined) process.env[key] = val;
        });
    }
} catch (e) {}

let TikTokLiveConnection;
async function initTikTokConnector() {
    try {
        const module = await import('tiktok-live-connector');
        TikTokLiveConnection = module.TikTokLiveConnection;
        console.log("TikTok Live Connector initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize TikTok Live Connector:", err);
    }
}
initTikTokConnector().catch(console.error);
const db = require('./database');
const spotify = require('./spotify');

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

const JWT_SECRET = 'pandy_secret_key_8899';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
    }
    next();
});
app.use(express.static(path.join(__dirname)));

// ที่เก็บการเชื่อมต่อ TikTok Live ของสตรีมเมอร์แต่ละคน
// โครงสร้าง: { [userId]: WebcastPushConnection }
const activeTikTokConnections = {};
const activeTiktokSessions = {};
const activeTiktokWindows = {};
const activeGiftGalleries = {};

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

// ฟังก์ชั่นสำหรับสร้างบัญชีแอดมินเริ่มต้น (Pandy_Puncheroo / Newpasit1996)
const seedAdmin = async () => {
    try {
        const adminUser = await db.get('SELECT * FROM users WHERE username = ?', ['Pandy_Puncheroo']);
        if (!adminUser) {
            const hashedPassword = await bcrypt.hash('Newpasit1996', 10);
            const streamToken = crypto.randomBytes(16).toString('hex');
            await db.run(
                'INSERT INTO users (username, password, streamToken, isPro) VALUES (?, ?, ?, 1)',
                ['Pandy_Puncheroo', hashedPassword, streamToken]
            );
            console.log('Seeded admin account Pandy_Puncheroo successfully!');
        } else {
            // มั่นใจว่าบัญชีแอดมินจะมีสิทธิ์ PRO และไม่ติดล็อก
            await db.run('UPDATE users SET isPro = 1 WHERE username = ?', ['Pandy_Puncheroo']);
            console.log('Updated admin account Pandy_Puncheroo status to PRO!');
        }
    } catch (e) {
        console.error('Error seeding admin account:', e);
    }
};
// รอให้ตาราง SQLite ถูกสร้างเสร็จเรียบร้อยก่อนทำการ Seed ข้อมูล
setTimeout(seedAdmin, 1000);

// ==========================================
// API ENDPOINTS
// ==========================================

// สมัครสมาชิก
app.post('/api/signup', async (appReq, appRes) => {
    try {
        const { username, password } = appReq.body;
        if (!username || !password) {
            return appRes.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        // ตรวจสอบว่าผู้ใช้มีอยู่แล้วหรือไม่
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const streamToken = crypto.randomBytes(16).toString('hex');

        const result = await db.run(
            'INSERT INTO users (username, password, streamToken, createdAt) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, streamToken, new Date().toISOString()]
        );

        appRes.json({ success: true, message: 'สมัครสมาชิกสำเร็จ!' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// เข้าสู่ระบบ
app.post('/api/login', async (appReq, appRes) => {
    try {
        const { username, password } = appReq.body;
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        appRes.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                streamToken: user.streamToken,
                isPro: user.isPro === 1,
                proExpireAt: user.proExpireAt
            }
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ดึงโปรไฟล์
app.get('/api/profile', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const user = await db.get('SELECT id, username, streamToken, isPro, proExpireAt FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return appRes.status(404).json({ error: 'User not found' });
        
        appRes.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                streamToken: user.streamToken,
                isPro: user.isPro === 1,
                proExpireAt: user.proExpireAt
            }
        });
    } catch (err) {
        appRes.status(401).json({ error: 'Invalid token' });
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

function getAuthUserId(appReq) {
    const authHeader = appReq.headers.authorization;
    if (!authHeader) return null;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.userId;
    } catch (e) {
        return null;
    }
}

app.get('/api/spotify/config', (appReq, appRes) => {
    appRes.json({
        success: true,
        configured: spotify.isConfigured(),
        redirectUri: spotify.SPOTIFY_REDIRECT_URI
    });
});

app.get('/api/spotify/auth', (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    if (!spotify.isConfigured()) {
        return appRes.status(503).json({ error: 'Spotify API ยังไม่ได้ตั้งค่า — กรุณาตั้ง SPOTIFY_CLIENT_ID และ SPOTIFY_CLIENT_SECRET' });
    }
    const state = crypto.randomBytes(16).toString('hex');
    spotifyOAuthStates[state] = { userId, createdAt: Date.now() };
    appRes.json({ success: true, url: spotify.getAuthUrl(state) });
});

app.get('/api/spotify/callback', async (appReq, appRes) => {
    const { code, state, error } = appReq.query;
    if (error) {
        return appRes.send(`<html><body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:40px;"><h2>Spotify เชื่อมต่อไม่สำเร็จ</h2><p>${error}</p><p>ปิดหน้านี้แล้วกลับไปที่ Pandy App</p></body></html>`);
    }
    const session = spotifyOAuthStates[state];
    if (!session) {
        return appRes.status(400).send('Invalid OAuth state');
    }
    delete spotifyOAuthStates[state];
    try {
        const tokenData = await spotify.exchangeCode(code);
        await spotify.saveTokens(db, session.userId, tokenData);
        appRes.send(`<html><body style="background:#0d1a0d;color:#fff;font-family:sans-serif;text-align:center;padding:40px;"><h2 style="color:#1DB954;">✅ เชื่อมต่อ Spotify สำเร็จ!</h2><p>ปิดหน้านี้แล้วกลับไปที่ Pandy App</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
    } catch (e) {
        console.error('Spotify OAuth error:', e);
        appRes.status(500).send('Spotify OAuth failed: ' + e.message);
    }
});

app.get('/api/spotify/status', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    try {
        const row = await spotify.getStoredTokens(db, userId);
        if (!row) return appRes.json({ success: true, connected: false });
        const nowPlaying = await spotify.getPlayerState(db, userId);
        appRes.json({ success: true, connected: true, nowPlaying });
    } catch (e) {
        appRes.json({ success: true, connected: false, error: e.message });
    }
});

app.post('/api/spotify/disconnect', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    await spotify.deleteTokens(db, userId);
    appRes.json({ success: true });
});

app.get('/api/spotify/search', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    const q = (appReq.query.q || '').trim();
    if (!q) return appRes.status(400).json({ error: 'Missing query' });
    try {
        const tracks = await spotify.searchTrack(db, userId, q);
        appRes.json({ success: true, tracks });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/play', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    const { uri } = appReq.body || {};
    if (!uri) return appRes.status(400).json({ error: 'Missing track URI' });
    try {
        await spotify.startPlayback(db, userId, uri);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/queue', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    const { uri } = appReq.body || {};
    if (!uri) return appRes.status(400).json({ error: 'Missing track URI' });
    try {
        await spotify.addToQueue(db, userId, uri);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/skip', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    try {
        await spotify.skipTrack(db, userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/pause', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    try {
        await spotify.pausePlayback(db, userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.post('/api/spotify/resume', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    try {
        await spotify.resumePlayback(db, userId);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

app.get('/api/spotify/now-playing', async (appReq, appRes) => {
    const userId = getAuthUserId(appReq);
    if (!userId) return appRes.status(401).json({ error: 'No token' });
    try {
        const nowPlaying = await spotify.getPlayerState(db, userId);
        appRes.json({ success: true, ...nowPlaying });
    } catch (e) {
        appRes.status(400).json({ error: e.message });
    }
});

// ฟังก์ชันประมวลผลอีเวนต์ที่ส่งมาจาก Browser Mode (ทำงานทั้งผ่าน HTTP และ IPC)
async function processBrowserEvent(type, data) {
    const username = data && data.username ? data.username.toLowerCase() : '';
    const session = activeTiktokSessions[username];
    
    try {
        require('fs').appendFileSync(
            'C:\\Users\\USER\\Desktop\\Pandy App\\debug_events.log',
            `[Server Event] Time: ${new Date().toISOString()} | Type: ${type} | Username: ${username} | Session: ${session ? 'Found' : 'NOT FOUND'} | Data: ${JSON.stringify(data)}\n`
        );
    } catch(e) {}
    
    if (session) {
        if (type === 'gift') {
            // Generate a pseudo giftId from giftName
            let pseudoGiftId = 0;
            for (let i = 0; i < data.giftName.length; i++) {
                pseudoGiftId = (pseudoGiftId << 5) - pseudoGiftId + data.giftName.charCodeAt(i);
                pseudoGiftId |= 0;
            }
            pseudoGiftId = Math.abs(pseudoGiftId);
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
            } else {
                for (let key in POPULAR_TIKTOK_GIFTS) {
                    if (nameLower.includes(key)) {
                        diamondCount = POPULAR_TIKTOK_GIFTS[key];
                        break;
                    }
                }
            }

            // บันทึกของขวัญลงฐานข้อมูลแบบไดนามิก (บันทึกเสมอแม้จะไม่มีรูปภาพในช่วงแรก เพื่อไม่ให้การคำนวณเงื่อนไขและสถิติผิดพลาด)
            try {
                const existingGift = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ? OR giftName = ?', [pseudoGiftId, data.giftName]);
                const nowStr = new Date().toISOString();
                const iconToSave = data.giftIcon && data.giftIcon.trim() !== '' ? data.giftIcon : '';
                
                if (!existingGift) {
                    await db.run(
                        'INSERT INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
                        [pseudoGiftId, data.giftName, diamondCount, iconToSave, nowStr]
                    );
                    console.log(`Saved new Browser-Scraped Gift to DB: ${data.giftName} (ID: ${pseudoGiftId})`);
                    io.to(session.token).emit('new_gift_discovered', { giftId: pseudoGiftId, giftName: data.giftName, diamondCount: diamondCount, giftIcon: iconToSave });
                } else {
                    let needsUpdate = false;
                    let newIcon = existingGift.giftIcon;
                    let newCount = existingGift.diamondCount;

                    // อัปเดตราคาเหรียญหากราคาในตารางเป็นราคาเริ่มต้น (1) แต่เรามีราคาที่ถูกต้อง
                    if (diamondCount > 1 && existingGift.diamondCount === 1) {
                        newCount = diamondCount;
                        needsUpdate = true;
                    }
                    // อัปเดตรูปภาพของขวัญหากของเดิมไม่มี หรือของเดิมเป็นรูปจำลอง
                    if (iconToSave && (!existingGift.giftIcon || existingGift.giftIcon.startsWith('data:'))) {
                        newIcon = iconToSave;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        await db.run(
                            'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
                            [newCount, newIcon, existingGift.giftId]
                        );
                        console.log(`Updated Gift in DB: ${data.giftName} (Coins: ${newCount})`);
                        io.to(session.token).emit('new_gift_discovered', { giftId: existingGift.giftId, giftName: data.giftName, diamondCount: newCount, giftIcon: newIcon });
                    }
                }
            } catch (e) {
                console.error("Failed to dynamically save Browser Scraped Gift:", e);
            }

            // Emit gift event to overlay and panel!
            markGiftGalleryGiftReceived(session.userId, pseudoGiftId, data.repeatCount, data.giftName);
            io.to(session.token).emit('tiktok_gift', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl,
                giftName: data.giftName,
                giftId: pseudoGiftId,
                giftIcon: data.giftIcon,
                diamondCount: diamondCount,
                repeatCount: data.repeatCount,
                totalCoins: diamondCount * data.repeatCount
            });
        } else if (type === 'chat') {
            // Emit chat message to overlay and panel!
            io.to(session.token).emit('tiktok_chat', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                comment: data.comment,
                avatar: data.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${data.nickname}`
            });
        } else if (type === 'like') {
            io.to(session.token).emit('tiktok_like', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl || data.avatar || '',
                likeCount: data.likeCount || 1
            });
        } else if (type === 'follow') {
            io.to(session.token).emit('tiktok_follow', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl
            });
        } else if (type === 'share') {
            io.to(session.token).emit('tiktok_share', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl
            });
        } else if (type === 'join') {
            io.to(session.token).emit('tiktok_join', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl
            });
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
                activeTiktokSessions[sessionKey].avatar = data.avatar || '';
            }
            io.to(session.token).emit('tiktok_status', { 
                connected: true, 
                isLive: liveStatusVal, 
                username: data.username, 
                nickname: data.nickname, 
                avatar: data.avatar, 
                integrationMode: 'browser' 
            });
            if (liveStatusVal && data.username && session.userId) {
                fetchGiftGalleryBackground(session.userId, data.username, session.token);
            }
        } else if (type === 'browser_live_status') {
            const sessionKey = (data.username || '').toLowerCase();
            if (sessionKey && activeTiktokSessions[sessionKey]) {
                activeTiktokSessions[sessionKey].isLive = !!data.isLive;
                activeTiktokSessions[sessionKey].tiktokUsername = data.username;
            }
            io.to(session.token).emit('tiktok_status', { 
                connected: true, 
                isLive: data.isLive, 
                username: data.username, 
                integrationMode: 'browser' 
            });
            if (data.isLive && data.username && session.userId) {
                fetchGiftGalleryBackground(session.userId, data.username, session.token);
            }
        } else if (type === 'gift_discovered_from_panel') {
            // บันทึกหรืออัปเดตของขวัญที่ขูดจากแถบด้านล่างลงฐานข้อมูลโดยตรง
            try {
                const existingGift = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ? OR giftName = ?', [data.giftId, data.giftName]);
                const nowStr = new Date().toISOString();
                const iconToSave = data.giftIcon && data.giftIcon.trim() !== '' ? data.giftIcon : '';
                
                if (!existingGift) {
                    await db.run(
                        'INSERT INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
                        [data.giftId, data.giftName, data.diamondCount, iconToSave, nowStr]
                    );
                    console.log(`Saved new Panel-Scraped Gift to DB: ${data.giftName} (ID: ${data.giftId}, Coins: ${data.diamondCount})`);
                    io.to(session.token).emit('new_gift_discovered', { giftId: data.giftId, giftName: data.giftName, diamondCount: data.diamondCount, giftIcon: iconToSave });
                } else {
                    let needsUpdate = false;
                    let newIcon = existingGift.giftIcon;
                    let newCount = existingGift.diamondCount;

                    if (data.diamondCount > 1 && existingGift.diamondCount === 1) {
                        newCount = data.diamondCount;
                        needsUpdate = true;
                    }
                    if (iconToSave && (!existingGift.giftIcon || existingGift.giftIcon.startsWith('data:'))) {
                        newIcon = iconToSave;
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        await db.run(
                            'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
                            [newCount, newIcon, existingGift.giftId]
                        );
                        console.log(`Updated Panel-Scraped Gift in DB: ${data.giftName} (Coins: ${newCount})`);
                        io.to(session.token).emit('new_gift_discovered', { giftId: existingGift.giftId, giftName: data.giftName, diamondCount: newCount, giftIcon: newIcon });
                    }
                }
            } catch (e) {
                console.error("Failed to dynamically save Panel Scraped Gift:", e);
            }
        }
    }
}

// ผูกฟังก์ชันเข้ากับ IPC Main สำหรับดักจับข้อมูลจาก Preload Script โดยไม่ผ่านเครือข่ายอินเทอร์เน็ต
try {
    const { ipcMain } = require('electron');
    ipcMain.on('tiktok-event', async (event, { type, data }) => {
        console.log(`[IPC Event] Received TikTok data via secure IPC bridge: ${type}`);
        await processBrowserEvent(type, data);
    });
} catch (e) {
    console.log("Not running inside Electron Main Process, IPC Listener skipped.");
}

// รับข้อมูลแชท/ของขวัญจาก Bookmarklet (Browser mode - HTTP Fallback)
app.post('/api/browser/event', async (appReq, appRes) => {
    try {
        const { type, data } = appReq.body;
        await processBrowserEvent(type, data);
        appRes.json({ success: true });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'Internal server error' });
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
            title: 'TikTok Browser - Pandy App',
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

// สมัครสมาชิก Pro (แบบจำลองการซื้อ)
app.post('/api/buy-pro', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const expireDate = new Date();
        expireDate.setMonth(expireDate.getMonth() + 1); // 1 Month Pro

        await db.run(
            'UPDATE users SET isPro = 1, proExpireAt = ? WHERE id = ?',
            [expireDate.toISOString(), decoded.userId]
        );
        
        appRes.json({
            success: true,
            message: 'สมัครสมาชิก Pro สำเร็จแล้ว!',
            isPro: true,
            proExpireAt: expireDate.toISOString()
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ตรวจสอบสิทธิ์ว่าผู้ใช้งานเป็นผู้ดูแลระบบ (Admin) หรือไม่
const isAdminUser = async (userId) => {
    const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
    if (!user) return false;
    const name = user.username.toLowerCase();
    return name === 'admin' || user.username === 'Pandy_Puncheroo';
};

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
        
        const { type, val, code } = appReq.body;
        if (!type || !val || !code) {
            return appRes.status(400).json({ error: 'กรุณากรอกข้อมูลประเภท มูลค่า และรหัสรางวัลให้ครบถ้วน' });
        }
        
        const existing = await db.get('SELECT * FROM promo_codes WHERE code = ?', [code]);
        if (existing) {
            return appRes.status(400).json({ error: 'รหัสรางวัลนี้มีอยู่แล้วในระบบ' });
        }
        
        const createdAt = new Date().toISOString();
        await db.run(
            'INSERT INTO promo_codes (code, type, val, createdAt) VALUES (?, ?, ?, ?)',
            [code, type, val, createdAt]
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
        const users = await db.all('SELECT id, username, isPro, proExpireAt, createdAt FROM users ORDER BY id DESC');
        const promos = await db.all('SELECT * FROM promo_codes ORDER BY createdAt DESC');
        const announcements = await db.all('SELECT COUNT(*) as cnt FROM announcements');
        const annCount = announcements[0]?.cnt || 0;

        const enrichedUsers = users.map(u => {
            const isAdmin = u.username.toLowerCase() === 'admin' || u.username === 'Pandy_Puncheroo';
            const proActive = u.isPro === 1 && (!u.proExpireAt || new Date(u.proExpireAt).getTime() > now);
            return {
                id: u.id,
                username: u.username,
                isPro: u.isPro === 1,
                proActive,
                proExpireAt: u.proExpireAt,
                createdAt: u.createdAt,
                role: isAdmin ? 'admin' : (proActive ? 'pro' : 'free')
            };
        });

        const codeRedemptions = promos
            .filter(p => p.isUsed === 1)
            .map(p => ({
                code: p.code,
                type: p.type,
                val: p.val,
                usedBy: p.usedBy,
                usedByName: p.usedByName,
                usedAt: p.usedAt
            }));

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

        const { username, days } = appReq.body;
        if (!username) return appRes.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้' });

        const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });

        const addDays = parseInt(days) || 30;
        const base = user.proExpireAt && new Date(user.proExpireAt) > new Date() ? new Date(user.proExpireAt) : new Date();
        base.setDate(base.getDate() + addDays);
        await db.run('UPDATE users SET isPro = 1, proExpireAt = ? WHERE id = ?', [base.toISOString(), user.id]);

        appRes.json({ success: true, message: `มอบ PRO ${addDays} วันให้ @${user.username} สำเร็จ`, proExpireAt: base.toISOString() });
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

        const { title, message, important } = appReq.body;
        if (!title || !message) {
            return appRes.status(400).json({ error: 'กรุณากรอกหัวข้อและข้อความประกาศ' });
        }

        const adminUser = await db.get('SELECT username FROM users WHERE id = ?', [decoded.userId]);
        const createdAt = new Date().toISOString();
        const result = await db.run(
            'INSERT INTO announcements (title, message, important, createdAt, createdBy) VALUES (?, ?, ?, ?, ?)',
            [title.trim(), message.trim(), important ? 1 : 0, createdAt, adminUser?.username || 'admin']
        );

        const payload = {
            id: result.id,
            title: title.trim(),
            message: message.trim(),
            important: !!important,
            createdAt,
            createdBy: adminUser?.username || 'admin'
        };

        io.emit('app_announcement', payload);
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
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ดึงประกาศล่าสุด (ผู้ใช้ทั่วไป)
app.get('/api/announcements/recent', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET);

        const list = await db.all('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 30');
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
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
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Pandy App)' } }, (res) => {
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

// [ADMIN] อัปเดตข้อมูลของขวัญ (ชื่อ และ จำนวนเหรียญ)
app.post('/api/gifts/update', async (appReq, appRes) => {
    try {
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
        
        const user = await db.get('SELECT id, username, isPro, proExpireAt FROM users WHERE id = ?', [decoded.userId]);
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
            await db.run(
                "UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = ?",
                [user.id, user.username, nowStr, cleanCode]
            );
            return appRes.json({
                success: true,
                type: 'coin',
                val: promo.val,
                message: `คุณได้รับเหรียญรางวัลจำนวน ${promo.val} 🪙!`
            });
        } else if (promo.type === 'pro') {
            let currentExpire = user.proExpireAt ? new Date(user.proExpireAt) : new Date();
            if (currentExpire < new Date()) {
                currentExpire = new Date();
            }
            
            currentExpire.setDate(currentExpire.getDate() + promo.val);
            const newExpireStr = currentExpire.toISOString();
            
            await db.run(
                'UPDATE users SET isPro = 1, proExpireAt = ? WHERE id = ?',
                [newExpireStr, user.id]
            );
            
            await db.run(
                "UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = ?",
                [user.id, user.username, nowStr, cleanCode]
            );
            
            return appRes.json({
                success: true,
                type: 'pro',
                val: promo.val,
                proExpireAt: newExpireStr,
                message: `คุณได้รับสิทธิ์การใช้งาน PRO ระดับพิเศษเพิ่มอีก ${promo.val} วัน!`
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

app.get('/overlay', (appReq, appRes) => {
    appRes.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    appRes.set('Pragma', 'no-cache');
    appRes.sendFile(path.join(__dirname, 'overlay.html'));
});

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
        socket.join(token);
        console.log(`Panel joined room: ${token}`);
    });

    // เมื่อ OBS Overlay เข้าห้อง
    socket.on('join_overlay', (token) => {
        socket.join(token);
        console.log(`OBS Overlay joined room: ${token}`);
        io.to(token).emit('request_panel_sync');
    });

    // ส่งสัญญาณผลการสุ่มการ์ดจาก Panel ไปหา OBS Overlay
    socket.on('send_result', (payload) => {
        const { token, ...rest } = payload;
        const msg = `[${new Date().toISOString()}] Broadcast overlay_show_result to token: ${token}, count: ${rest.results ? rest.results.length : 0}\n`;
        try { require('fs').appendFileSync('error.log', msg); } catch(e){}
        console.log(`[Socket Server] Broadcast overlay_show_result to token: ${token}, count: ${rest.results ? rest.results.length : 0}`);
        io.to(token).emit('overlay_show_result', rest);
    });

    socket.on('send_win_status', (payload) => {
        const { token, ...rest } = payload;
        const msg = `[${new Date().toISOString()}] Broadcast overlay_win_status to token: ${token}, cur: ${rest.cur}\n`;
        try { require('fs').appendFileSync('error.log', msg); } catch(e){}
        console.log(`[Socket Server] Broadcast overlay_win_status to token: ${token}, cur: ${rest.cur}`);
        io.to(token).emit('overlay_win_status', rest);
    });

    socket.on('send_timer_status', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_timer_status', rest);
    });

    socket.on('send_total', ({ token, sum }) => {
        io.to(token).emit('overlay_show_total', { sum });
    });

    socket.on('send_hide_result', (token) => {
        io.to(token).emit('overlay_hide_result');
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

    socket.on('send_gift_rules', ({ token, giftRules, wheelGiftRules }) => {
        io.to(token).emit('overlay_gift_rules', { giftRules, wheelGiftRules });
    });

    socket.on('send_sound_alerts', ({ token, soundAlerts }) => {
        io.to(token).emit('overlay_sound_alerts', { soundAlerts });
    });

    socket.on('send_vote_status', (payload) => {
        const { token, ...rest } = payload;
        if (token) io.to(token).emit('overlay_vote_status', rest);
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
        const uniqueId = 'Test_User';
        const nickname = 'ผู้ทดสอบระบบ';
        
        if (payload.eventType === 'gift') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname,
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${uniqueId}`,
                giftName: payload.giftName || 'Gift',
                giftId: payload.giftId || '2272',
                giftIcon: payload.giftIcon || 'https://p16-webcast.tiktokcdn.com/img/webcast/rose.png',
                diamondCount: payload.diamondCount || 1,
                repeatCount: payload.repeatCount || 1,
                totalCoins: (payload.diamondCount || 1) * (payload.repeatCount || 1)
            };
            io.to(token).emit('tiktok_gift', dataObj);
        } else if (payload.eventType === 'like') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname,
                likeCount: payload.likeCount || 1
            };
            io.to(token).emit('tiktok_like', dataObj);
        } else if (payload.eventType === 'follow') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname
            };
            io.to(token).emit('tiktok_follow', dataObj);
        } else if (payload.eventType === 'share') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname
            };
            io.to(token).emit('tiktok_share', dataObj);
        } else if (payload.eventType === 'join') {
            const dataObj = {
                uniqueId: uniqueId,
                nickname: nickname
            };
            io.to(token).emit('tiktok_join', dataObj);
        }
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
            return;
        }

        try {
            // สร้าง Connection ใหม่ (Direct mode)
            const tiktokConnect = new TikTokLiveConnection(username, {
                enableExtendedGiftInfo: false
            });
            tiktokConnect.username = username;
            tiktokConnect.isLive = false;
            activeTikTokConnections[userId] = tiktokConnect;

            // ส่งสถานะเชื่อมต่อสำเร็จแบบสแตนด์บาย (รอไลฟ์สด) กลับไปที่ UI ทันที
            const statusObj = { connected: true, isLive: false, username, integrationMode: 'direct' };
            io.to(token).emit('tiktok_status', statusObj);
            socket.emit('tiktok_status', statusObj);
            io.to(token).emit('tiktok_notification', { type: 'standby', username });

            let retryInterval = null;

            const tryConnect = () => {
                tiktokConnect.connect().then(async state => {
                    console.log(`TikTok webcast connected successfully for user ${userId} (@${username}), roomId: ${state.roomId}`);
                    
                    // Fetch room gift catalog unsigned/signature-free
                    try {
                        console.log(`Fetching available gifts list unsigned for room ID: ${state.roomId}`);
                        const res = await tiktokConnect.webClient.getJsonObjectFromWebcastApi("gift/list/", {
                            ...tiktokConnect.webClient.clientParams,
                            room_id: state.roomId
                        }, false);
                        
                        if (res && res.data && Array.isArray(res.data.gifts)) {
                            const fetchedGifts = res.data.gifts;
                            console.log(`Fetched ${fetchedGifts.length} gifts from webcast API unsigned.`);
                            
                            tiktokConnect.fetchedGiftsMap = {};
                            tiktokConnect.roomGiftsList = fetchedGifts;
                            const nowStr = new Date().toISOString();
                            
                            for (const g of fetchedGifts) {
                                const giftId = String(g.id);
                                const giftName = g.name || '';
                                const diamondCount = parseInt(g.diamond_count || g.cost || 0);
                                let giftIconUrl = '';
                                if (g.image && Array.isArray(g.image.url_list) && g.image.url_list.length > 0) {
                                    giftIconUrl = g.image.url_list[0];
                                } else if (g.icon && Array.isArray(g.icon.url_list) && g.icon.url_list.length > 0) {
                                    giftIconUrl = g.icon.url_list[0];
                                }
                                
                                tiktokConnect.fetchedGiftsMap[giftId] = { giftId, giftName, diamondCount, giftIconUrl };
                                
                                // Auto insert/update the DB if we don't have this gift or if it has 0 coins or empty icon
                                try {
                                    const existingGift = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ?', [giftId]);
                                    if (!existingGift) {
                                        await db.run(
                                            'INSERT INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
                                            [giftId, giftName, diamondCount, giftIconUrl, nowStr]
                                        );
                                        const discPayload = { giftId, giftName, diamondCount, giftIcon: giftIconUrl };
                                        io.to(token).emit('new_gift_discovered', discPayload);
                                    } else {
                                        if ((!existingGift.diamondCount && diamondCount > 0) || (!existingGift.giftIcon && giftIconUrl)) {
                                            const finalCoins = existingGift.diamondCount || diamondCount;
                                            const finalIcon = existingGift.giftIcon || giftIconUrl;
                                            await db.run(
                                                'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
                                                [finalCoins, finalIcon, giftId]
                                            );
                                            const discPayload = { giftId, giftName: existingGift.giftName, diamondCount: finalCoins, giftIcon: finalIcon };
                                            io.to(token).emit('new_gift_discovered', discPayload);
                                        }
                                    }
                                } catch (dbErr) {
                                    console.error(`Error saving gift ${giftName} to DB:`, dbErr);
                                }
                            }
                        }
                    } catch (giftErr) {
                        console.error("Failed to fetch available gifts unsigned on connect:", giftErr);
                    }

                    try {
                        const galleryData = await fetchTikTokGiftGallery(
                            tiktokConnect,
                            username,
                            state.roomId,
                            tiktokConnect.roomGiftsList || []
                        );
                        if (galleryData) {
                            emitGiftGalleryLoaded(userId, token, galleryData);
                        } else {
                            console.log(`Gift gallery not available for @${username} (requires live session / gallery program)`);
                        }
                    } catch (galleryErr) {
                        console.warn("Failed to fetch gift gallery on connect:", galleryErr.message);
                    }

                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                        activeTikTokConnections[userId].retryInterval = null;
                    }
                    
                    const roomInfo = state.roomInfo;
                    const avatar = roomInfo?.data?.owner?.avatar_large?.url_list?.[0] || 
                                   roomInfo?.data?.owner?.avatar_medium?.url_list?.[0] || 
                                   roomInfo?.data?.owner?.avatar_thumb?.url_list?.[0] || '';
                    const nickname = roomInfo?.data?.owner?.nickname || username;
                    
                    tiktokConnect.isLive = true;
                    tiktokConnect.nickname = nickname;
                    tiktokConnect.avatar = avatar;
                    
                    const successStatus = { 
                        connected: true, 
                        isLive: true, 
                        username, 
                        nickname, 
                        avatar, 
                        integrationMode: 'direct' 
                    };
                    io.to(token).emit('tiktok_status', successStatus);
                    socket.emit('tiktok_status', successStatus);
                    io.to(token).emit('tiktok_notification', { type: 'connected', username });
                }).catch(err => {
                    console.warn(`TikTok stream currently offline for @${username}:`, err.message);
                    tiktokConnect.isLive = false;
                    
                    const offlineStatus = { 
                        connected: true, 
                        isLive: false, 
                        username, 
                        note: 'offline', 
                        integrationMode: 'direct' 
                    };
                    io.to(token).emit('tiktok_status', offlineStatus);
                    socket.emit('tiktok_status', offlineStatus);

                    if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                        retryInterval = setInterval(tryConnect, 15000);
                        activeTikTokConnections[userId].retryInterval = retryInterval;
                    }
                });
            };

            tryConnect();

            tiktokConnect.on('disconnected', () => {
                console.log(`TikTok stream disconnected for @${username}. Retrying in background...`);
                tiktokConnect.isLive = false;
                const disconnectStatus = { connected: true, isLive: false, username, note: 'offline', integrationMode: 'direct' };
                io.to(token).emit('tiktok_status', disconnectStatus);
                socket.emit('tiktok_status', disconnectStatus);
                if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                    retryInterval = setInterval(tryConnect, 15000);
                    activeTikTokConnections[userId].retryInterval = retryInterval;
                }
            });

            // ติดตาม Event ต่างๆ
            // 0. ยอดคนดู (roomUser)
            tiktokConnect.on('roomUser', (data) => {
                const viewerCount = parseInt(data.viewerCount || data.totalUser || 0);
                const payload = { viewerCount };
                io.to(token).emit('tiktok_viewer_count', payload);
            });

            // 1. ได้รับแชท (Chat message)
            tiktokConnect.on('chat', async (data) => {
                const roomSockets = io.sockets.adapter.rooms.get(token);
                const socketIds = roomSockets ? Array.from(roomSockets) : [];
                try {
                    require('fs').appendFileSync(
                        'C:\\Users\\USER\\Desktop\\Pandy App\\chat_gift_debug.log',
                        `[Chat Event] Time: ${new Date().toISOString()} | Room: ${token} | Sockets in Room: ${JSON.stringify(socketIds)} | Content: ${data.content}\n`
                    );
                } catch(e) {}
                const payload = {
                    uniqueId: data.user?.displayId || data.uniqueId || '',
                    nickname: data.user?.nickname || data.nickname || '',
                    comment: data.content || data.comment || '',
                    avatar: data.user?.avatarThumb?.urlList[0] || data.profilePictureUrl || ''
                };
                io.to(token).emit('tiktok_chat', payload);

                // --- AI Stream Assistant Integration ---
                const targetUserId = userId || 1;
                const chatMsg = (data.content || data.comment || '').trim();
                const senderName = data.user?.displayId || data.uniqueId || data.nickname || 'viewer';

                if (chatMsg) {
                    handleStreamChatAI(targetUserId, token, chatMsg, senderName).catch(err => {
                        console.error('handleStreamChatAI failed:', err.message);
                    });
                }
            });

            // 2. ได้รับของขวัญ (Gift event)
            tiktokConnect.on('gift', async (data) => {
                const repeatEnd = data.repeatEnd !== undefined ? data.repeatEnd : true;
                const giftType = data.giftType !== undefined ? data.giftType : 0;
                if (giftType === 1 && repeatEnd === false) {
                    return;
                }

                const uniqueId = data.user?.displayId || data.uniqueId || '';
                const nickname = data.user?.nickname || data.nickname || '';
                const avatar = data.user?.avatarThumb?.urlList[0] || data.profilePictureUrl || '';
                
                // Defensive parsing of giftId and giftName
                const giftId = data.giftId || data.gift?.id || data.gift?.gift_id || data.giftDetails?.giftId || '';
                const giftName = data.giftName || data.gift?.name || data.gift?.gift_name || data.giftDetails?.giftName || '';
                
                try {
                    require('fs').appendFileSync(
                        'C:\\Users\\USER\\Desktop\\Pandy App\\chat_gift_debug.log',
                        `[Gift Event] Time: ${new Date().toISOString()} | Token: ${token} | GiftName: ${giftName} | GiftId: ${giftId}\n`
                    );
                } catch(e) {}
                
                // Defensive parsing of diamond count (coins cost)
                const diamondCount = parseInt(data.diamondCount || data.gift?.diamond_count || data.gift?.diamonds || data.giftDetails?.diamondCount || data.gift?.cost || 0);
                const repeatCount = parseInt(data.repeatCount || data.comboCount || 1);

                // Defensive parsing of gift icon URL
                let giftIconUrl = '';
                if (data.giftImage?.urlList?.[0]) {
                    giftIconUrl = data.giftImage.urlList[0];
                } else if (data.giftDetails?.giftImage?.urlList?.[0]) {
                    giftIconUrl = data.giftDetails.giftImage.urlList[0];
                } else if (data.giftDetails?.giftImage?.url?.[0]) {
                    giftIconUrl = data.giftDetails.giftImage.url[0];
                } else if (data.gift?.icon?.url_list?.[0]) {
                    giftIconUrl = data.gift.icon.url_list[0];
                } else if (data.gift?.image?.url_list?.[0]) {
                    giftIconUrl = data.gift.image.url_list[0];
                } else if (data.giftPictureUrl) {
                    giftIconUrl = data.giftPictureUrl;
                } else if (data.giftIcon) {
                    if (typeof data.giftIcon === 'string') {
                        giftIconUrl = data.giftIcon;
                    } else if (Array.isArray(data.giftIcon.url_list) && data.giftIcon.url_list.length > 0) {
                        giftIconUrl = data.giftIcon.url_list[0];
                    }
                }

                // Check cache map first if the event has 0 coins or empty icon
                let finalDiamondCount = diamondCount;
                let finalIconUrl = giftIconUrl;
                
                if (tiktokConnect.fetchedGiftsMap && tiktokConnect.fetchedGiftsMap[String(giftId)]) {
                    const cached = tiktokConnect.fetchedGiftsMap[String(giftId)];
                    if (finalDiamondCount === 0 && cached.diamondCount > 0) {
                        finalDiamondCount = cached.diamondCount;
                    }
                    if (!finalIconUrl && cached.giftIconUrl) {
                        finalIconUrl = cached.giftIconUrl;
                    }
                }
                
                // If still missing, query the database fallback
                if (finalDiamondCount === 0 || !finalIconUrl) {
                    try {
                        const existingGift = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ?', [giftId]);
                        if (existingGift) {
                            if (finalDiamondCount === 0 && existingGift.diamondCount > 0) {
                                finalDiamondCount = existingGift.diamondCount;
                            }
                            if (!finalIconUrl && existingGift.giftIcon) {
                                finalIconUrl = existingGift.giftIcon;
                            }
                        }
                    } catch (dbErr) {
                        console.error("Error reading fallback from DB:", dbErr);
                    }
                }

                console.log(`Gift received for user ${userId} (@${username}): ${uniqueId} sent ${giftName} x${repeatCount} (${finalDiamondCount * repeatCount} coins)`);

                // Save to DB only if we have a valid numeric gift ID
                if (giftId && !isNaN(parseInt(giftId))) {
                    try {
                        const existingGift = await db.get('SELECT * FROM tiktok_gifts WHERE giftId = ?', [giftId]);
                        if (!existingGift) {
                            const nowStr = new Date().toISOString();
                            await db.run(
                                'INSERT INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
                                [giftId, giftName, finalDiamondCount, finalIconUrl, nowStr]
                            );
                            console.log(`Saved new TikTok Gift to DB: ${giftName} (ID: ${giftId})`);
                            const discPayload = { giftId: giftId, giftName: giftName, diamondCount: finalDiamondCount, giftIcon: finalIconUrl };
                            io.to(token).emit('new_gift_discovered', discPayload);
                        } else {
                            // If the gift exists, but its coins/image are missing (0 or empty), let's auto-repair it!
                            if ((!existingGift.diamondCount && finalDiamondCount > 0) || (!existingGift.giftIcon && finalIconUrl)) {
                                const finalCoins = existingGift.diamondCount || finalDiamondCount;
                                const finalIcon = existingGift.giftIcon || finalIconUrl;
                                await db.run(
                                    'UPDATE tiktok_gifts SET diamondCount = ?, giftIcon = ? WHERE giftId = ?',
                                    [finalCoins, finalIcon, giftId]
                                );
                                console.log(`Auto-repaired TikTok Gift ID ${giftId}: Coins = ${finalCoins}, Icon = ${finalIcon}`);
                                const discPayload = { giftId: giftId, giftName: existingGift.giftName, diamondCount: finalCoins, giftIcon: finalIcon };
                                io.to(token).emit('new_gift_discovered', discPayload);
                            }
                        }
                    } catch (e) {
                        console.error("Failed to dynamically save TikTok Gift:", e);
                    }
                }

                const payload = {
                    uniqueId: uniqueId,
                    nickname: nickname,
                    avatar: avatar,
                    giftName: giftName,
                    giftId: giftId,
                    giftIcon: finalIconUrl,
                    diamondCount: finalDiamondCount,
                    repeatCount: repeatCount,
                    totalCoins: finalDiamondCount * repeatCount
                };
                markGiftGalleryGiftReceived(userId, giftId, repeatCount, giftName);
                io.to(token).emit('tiktok_gift', payload);
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
                const payload = {
                    uniqueId: data.user?.displayId || data.uniqueId || '',
                    nickname: data.user?.nickname || data.nickname || '',
                    avatar: data.user?.avatarThumb?.urlList[0] || data.profilePictureUrl || ''
                };
                io.to(token).emit('tiktok_follow', payload);
            };

            const handleShare = (data) => {
                const payload = {
                    uniqueId: data.user?.displayId || data.uniqueId || '',
                    nickname: data.user?.nickname || data.nickname || '',
                    avatar: data.user?.avatarThumb?.urlList[0] || data.profilePictureUrl || ''
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
                const payload = {
                    uniqueId: data.user?.displayId || data.uniqueId || '',
                    nickname: data.user?.nickname || data.nickname || '',
                    avatar: data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || data.avatar || '',
                    likeCount: parseInt(data.likeCount || data.count || 1)
                };
                io.to(token).emit('tiktok_like', payload);
            });

            // 6. เข้าร่วมสตรีม (Join/Member event)
            tiktokConnect.on('member', (data) => {
                const payload = {
                    uniqueId: data.user?.displayId || data.uniqueId || '',
                    nickname: data.user?.nickname || data.nickname || '',
                    avatar: data.user?.avatarThumb?.urlList[0] || data.profilePictureUrl || ''
                };
                io.to(token).emit('tiktok_join', payload);
            });

            // บันทึกเก็บการเชื่อมต่อไว้
            activeTikTokConnections[userId] = tiktokConnect;

        } catch (error) {
            console.error('TikTok Setup Error:', error);
            const statusObj = { connected: false, error: error.message, username };
            io.to(token).emit('tiktok_status', statusObj);
            socket.emit('tiktok_status', statusObj);
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
    
    // Guest fallback: If token is missing, null, or undefined, use default user ID 1 (Pandy_Puncheroo)
    if (!token || token === 'null' || token === 'undefined') {
        req.user = { userId: 1 };
        return next();
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Guest fallback: If token verification fails, use default user ID 1 (Pandy_Puncheroo)
            req.user = { userId: 1 };
            return next();
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

// รันเซิร์ฟเวอร์
server.listen(PORT, () => {
    seedStarterMemoriesIfEmpty().catch(err => console.error('Failed to seed AI memories:', err.message));
    console.log(`Pandy App Web Server running on port ${PORT}`);
});

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
const { spawn } = require('child_process');

function startTunnel() {
    console.log("Initializing secure HTTPS tunnel (localhost.run)...");
    const tunnel = spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-R', '80:localhost:3000', 'nokey@localhost.run']);
    
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
        console.log(`Tunnel child process exited with code ${code}. Reconnecting in 10s...`);
        tunnelUrl = '';
        setTimeout(startTunnel, 10000);
    });
    
    tunnel.on('error', (err) => {
        console.error("Failed to start tunnel process:", err);
    });
}
setTimeout(startTunnel, 2000);

app.get('/api/tunnel-status', (req, res) => {
    res.json({ success: true, tunnelUrl });
});

app.get('/api/tts', (req, res) => {
    const text = req.query.text || '';
    if (!text.trim()) {
        return res.status(400).send('Text parameter is required');
    }
    const rate = parseFloat(req.query.rate) || 1.0;
    const pitch = parseFloat(req.query.pitch) || 1.0;
    
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(text)}`;
    
    res.setHeader('Content-Type', 'audio/mpeg');
    
    // If no rate/pitch change needed, just proxy directly to save CPU
    if (rate === 1.0 && pitch === 1.0) {
        const request = require('https').get(googleUrl, (googleRes) => {
            if (googleRes.statusCode !== 200) {
                console.error(`Google TTS responded with status: ${googleRes.statusCode}`);
                return res.status(googleRes.statusCode).send('Error fetching audio');
            }
            googleRes.pipe(res);
        });
        request.on('error', (err) => {
            console.error('TTS Proxy Error:', err);
            res.status(500).send('Error fetching audio');
        });
        return;
    }
    
    // Otherwise use FFmpeg to process rate and pitch
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    
    const command = ffmpeg()
        .input(googleUrl)
        .format('mp3');
        
    let filters = [];
    if (pitch !== 1.0) {
        filters.push(`asetrate=24000*${pitch.toFixed(2)}`);
        filters.push('aresample=24000');
    }
    
    // Relative tempo filter
    const relativeTempo = rate / pitch;
    let tempoFilters = [];
    let t = relativeTempo;
    while (t > 2.0) {
        tempoFilters.push("atempo=2.0");
        t /= 2.0;
    }
    while (t < 0.5) {
        tempoFilters.push("atempo=0.5");
        t /= 0.5;
    }
    if (t !== 1.0) {
        tempoFilters.push(`atempo=${t.toFixed(2)}`);
    }
    const tempoFilterStr = tempoFilters.join(',');
    if (tempoFilterStr) {
        filters.push(tempoFilterStr);
    }
    
    if (filters.length > 0) {
        command.audioFilters(filters);
    }
    
    command.on('error', (err) => {
        console.error('FFmpeg TTS error:', err.message);
    });
    
    command.pipe(res, { end: true });
});
