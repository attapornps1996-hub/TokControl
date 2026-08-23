const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const crypto = require('crypto');

try {
    require('./load-env').loadEnv();
} catch (e) {
    console.warn('[env] load failed:', e?.message || e);
}

const { createGiftEventGuard } = require('./gift_event_guard');
const cloudGiftEmitGuard = createGiftEventGuard({ debounceMs: 2000, endSettleMs: 700, softDedupeMs: 4000, dedupeTtlMs: 20000 });

let WebcastPushConnection, RoomIdRouteConfig, IsLiveRouteConfig, RouteConfig;

async function initTikTokConnector() {
    try {
        const legacyModule = await import('tiktok-live-connector/legacy');
        WebcastPushConnection = legacyModule.WebcastPushConnection;

        const mainModule = await import('tiktok-live-connector');
        RoomIdRouteConfig = mainModule.RoomIdRouteConfig;
        IsLiveRouteConfig = mainModule.IsLiveRouteConfig;
        RouteConfig = mainModule.RouteConfig;

        RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
        IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;
        console.log("TikTok Live Connector initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize TikTok Live Connector:", err);
    }
}
initTikTokConnector().catch(console.error);

// ใช้งาน Firestore Helper ที่สลับไป SQLite อัตโนมัติหากไม่มีกุญแจ GCP
const db = require('./firestore_helper');
const { normalizePopupFields, hydrateList, registerAnnouncementPopupApi, Popup } = require('./announcement_popup_api');
const registerAssetRoutes = require('./asset_routes');
const { registerPaymentRoutes } = require('./payments');
const { registerWidgetRoutes } = require('./widget_routes');
const { notifyPromoRedeem } = require('./admin_notify');
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
const { resolveKnownGiftId, hashGiftName, extractGiftIconUrl, pickFirstImageUrl } = require('./gifts_sync');
const {
    createFanClubRegistry,
    buildChatPayload,
    extractChatIdentity,
    isHeartMeGift,
    analyzeChatTeamStatus,
    normalizeWebcastGift,
    extractTotalLikeCount
} = require('./tiktok_chat_helpers');
const { getJwtSecret, getAdminSeedPassword } = require('./auth_secrets');
const { isAdminAccount, resolveAccountRole } = require('./admin_auth');
const { registerVerifyPinRoute } = require('./admin_pin');
const { registerCloudOAuthRoutes } = require('./cloud_oauth');
const { authRateLimitMiddleware } = require('./auth_rate_limit');
const { applySecurityHeaders, validatePasswordPolicy, validateUsernamePolicy } = require('./security_middleware');
const { blockSensitiveStatic } = require('./static_guard');
const { registerAuthEmailRoutes, validateEmailAddress } = require('./auth_email_routes');
const { registerProfileRoutes } = require('./profile_routes');
const { registerAchievementAdminRoutes } = require('./achievement_admin_routes');
const youtube = require('./youtube');
const { createYoutubeLiveService, registerYoutubeLiveRoutes } = require('./youtube_live');

const app = express();
app.set('trust proxy', true);
app.use((req, res, next) => {
    if (!process.env.K_SERVICE) return next();
    const proto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    if (proto === 'http') {
        return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    }
    next();
});
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

function parseProScopesForApi(raw) {
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
        return null;
    }
}

function buildCloudUserProfile(user) {
    const flags = getGameCenterFlags();
    const gcAccess = canAccessGameCenter(user, flags);
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || '',
        openId: user.openId || '',
        email: user.email || '',
        emailVerified: user.emailVerified === 1 || user.emailVerified === true || !!user.oauthProvider,
        streamToken: user.streamToken,
        isPro: user.isPro === 1 || user.isPro === true,
        proExpireAt: user.proExpireAt,
        proScopes: parseProScopesForApi(user.proScopes),
        entitlements: entitlementsForApi(user.entitlements),
        role: resolveAccountRole(user),
        createdAt: user.createdAt || '',
        access: {
            gameCenter: gcAccess,
            games: gamesAccessForApi(user, flags)
        }
    };
}

async function maybeConvertGameCenterPass(user) {
    if (!user?.username) return user;
    const patch = buildPassToProConversion(user);
    if (!patch) return user;
    const { convertedDays, ...fields } = patch;
    await db.updateUserFields(user.username, fields);
    console.log(`[gc-beta] Converted Early Access → PRO ${convertedDays}d for @${user.username}`);
    return { ...user, ...fields };
}

async function maybeBackfillSignupProTrial(user) {
    if (!user?.username) return { user, trialBackfill: false };
    const patch = buildSignupProTrialBackfill(user);
    if (!patch) return { user, trialBackfill: false };
    const { days, trialDays, ...fields } = patch;
    await db.updateUserFields(user.username, fields);
    console.log(`[signup-trial] Backfilled PRO trial ${trialDays || days}d for @${user.username}`);
    return { user: { ...user, ...fields }, trialBackfill: true, trialDays: trialDays || days };
}

app.use(cors({
    origin: (origin, callback) => {
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
        return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
}));
app.use(applySecurityHeaders);
app.use((req, res, next) => {
    const p = String(req.path || req.originalUrl || '');
    const envLimit = process.env.JSON_BODY_LIMIT;
    const limit = envLimit
        || ((/\/(verify-slip|assets\/upload)(\?|$)/.test(p)) ? '18mb' : '1mb');
    express.json({ limit })(req, res, next);
});
app.use((req, res, next) => {
    const p = String(req.path || req.originalUrl || '');
    const envLimit = process.env.JSON_BODY_LIMIT;
    const limit = envLimit
        || ((/\/(verify-slip|assets\/upload)(\?|$)/.test(p)) ? '18mb' : '1mb');
    express.urlencoded({ limit, extended: true })(req, res, next);
});

app.get('/api/health', (appReq, appRes) => {
    appRes.json({
        ok: true,
        service: 'pandy-backend',
        time: new Date().toISOString()
    });
});

app.get('/api/features', (_appReq, appRes) => {
    const flags = getGameCenterFlags();
    appRes.json({
        success: true,
        gameCenter: flags
    });
});

app.get('/api/app/version', (_appReq, appRes) => {
    let version = '2.1.20';
    try {
        const pkg = require('./package.json');
        version = pkg.version || version;
    } catch (e) {}
    appRes.json({ version });
});

app.get('/profile/:username', (_appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'index.html'));
});
app.get(['/profile', '/profile/'], (_appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/vendor/crypto-js.js', (_appReq, appRes) => {
    appRes.type('application/javascript');
    appRes.sendFile(path.join(__dirname, 'node_modules', 'crypto-js', 'crypto-js.js'));
});
app.get('/', (_appReq, appRes) => {
    appRes.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    appRes.set('Pragma', 'no-cache');
    appRes.sendFile(path.join(__dirname, 'download.html'));
});
app.get('/index.html', (_appReq, appRes) => {
    appRes.redirect(302, '/download');
});
app.use(blockSensitiveStatic);
app.use(express.static(path.join(__dirname), { index: false }));

// จัดเก็บข้อมูลเชื่อมต่อในระดับ Server
const activeTikTokConnections = {};
const activeTiktokSessions = {};
const fanClubRegistry = createFanClubRegistry({
    cachePath: path.join(__dirname, 'data', 'team_members_cache.json')
});

// สร้างบัญชีแอดมินจำลองเริ่มต้น
const seedAdmin = async () => {
    try {
        const adminUser = await db.getUser('Pandy_Puncheroo');
        const seedPassword = getAdminSeedPassword();
        if (!adminUser && seedPassword) {
            const hashedPassword = await bcrypt.hash(seedPassword, 10);
            const streamToken = crypto.randomBytes(16).toString('hex');
            await db.createUser('Pandy_Puncheroo', hashedPassword, streamToken, 1, null, { role: 'admin' });
            console.log('Seeded admin account Pandy_Puncheroo successfully on cloud!');
        } else if (adminUser) {
            if (seedPassword && process.env.ADMIN_SYNC_PASSWORD === '1') {
                const hashedPassword = await bcrypt.hash(seedPassword, 10);
                await db.updateUserPassword('Pandy_Puncheroo', hashedPassword);
                console.log('Synced Pandy_Puncheroo password from ADMIN_SEED_PASSWORD');
            }
        }
    } catch (e) {
        console.error('Error seeding admin account:', e);
    }
};
setTimeout(seedAdmin, 2000);

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

        const existingUser = await db.getUser(userCheck.value);
        if (existingUser) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }
        const emailTaken = await db.findUserByEmail(emailCheck.value);
        if (emailTaken) {
            return appRes.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const streamToken = crypto.randomBytes(16).toString('hex');
        const openId = Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
        const createdAt = new Date().toISOString();
        const trial = getSignupProTrialGrant();

        await db.createUser(
            userCheck.value,
            hashedPassword,
            streamToken,
            trial ? 1 : 0,
            trial ? trial.proExpireAt : null,
            {
                openId,
                createdAt,
                email: emailCheck.value,
                proScopes: trial ? trial.proScopes : null,
                role: 'user',
                emailVerified: 0
            }
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
        let user = await db.getUser(username);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        user = await maybeConvertGameCenterPass(user);
        const trialResult = await maybeBackfillSignupProTrial(user);
        user = trialResult.user;

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        appRes.json({
            success: true,
            token,
            user: buildCloudUserProfile(user),
            trialBackfill: !!trialResult.trialBackfill,
            trialDays: trialResult.trialDays || null
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

registerCloudOAuthRoutes(app, {
    db,
    jwtSecret: JWT_SECRET,
    buildUserProfile: buildCloudUserProfile,
    issueExtras: async (user) => {
        let u = await maybeConvertGameCenterPass(user);
        const trialResult = await maybeBackfillSignupProTrial(u);
        u = trialResult.user;
        return { user: u, trialBackfill: !!trialResult.trialBackfill, trialDays: trialResult.trialDays || null };
    }
});

async function getCloudAuthUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    let user = decoded.username ? await db.getUser(decoded.username) : null;
    if (!user && decoded.userId != null) user = await db.getUserById(decoded.userId);
    return user;
}

app.get('/api/friends', async (appReq, appRes) => {
    try {
        const user = await getCloudAuthUser(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const list = await db.listFriends(user.id);
        const incoming = await db.listIncomingFriendRequests(user.id);
        const outgoing = await db.listOutgoingFriendRequests(user.id);
        appRes.json({ success: true, list, incoming, outgoing });
    } catch (err) {
        console.error('[friends GET]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/friends', async (appReq, appRes) => {
    try {
        const user = await getCloudAuthUser(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const username = String(appReq.body?.username || '').trim();
        if (!username) return appRes.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้' });
        const result = await db.sendFriendRequest(user, username);
        if (result?.error) return appRes.status(400).json({ error: result.error });
        appRes.json({
            success: true,
            requested: !!result.requested,
            accepted: !!result.accepted,
            friend: result,
            message: result.accepted
                ? `ตอบรับคำขอจาก @${result.friendUsername || username} แล้ว — เป็นเพื่อนกันแล้ว`
                : `ส่งคำขอเป็นเพื่อนถึง @${username} แล้ว`
        });
    } catch (err) {
        console.error('[friends POST]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/friends/requests/:id/accept', async (appReq, appRes) => {
    try {
        const user = await getCloudAuthUser(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const result = await db.acceptFriendRequest(user, appReq.params.id);
        if (result?.error) return appRes.status(400).json({ error: result.error });
        appRes.json({ success: true, message: `เป็นเพื่อนกับ @${result.friendUsername} แล้ว` });
    } catch (err) {
        console.error('[friends accept]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/friends/requests/:id/reject', async (appReq, appRes) => {
    try {
        const user = await getCloudAuthUser(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const result = await db.rejectFriendRequest(user, appReq.params.id);
        if (result?.error) return appRes.status(400).json({ error: result.error });
        appRes.json({ success: true });
    } catch (err) {
        console.error('[friends reject]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.delete('/api/friends/:id', async (appReq, appRes) => {
    try {
        const user = await getCloudAuthUser(appReq);
        if (!user) return appRes.status(401).json({ error: 'No token' });
        const ok = await db.removeFriend(user.id, appReq.params.id);
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบรายการเพื่อน' });
        appRes.json({ success: true });
    } catch (err) {
        console.error('[friends DELETE]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ดึงข้อมูลโปรไฟล์
app.get('/api/profile', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        let user = decoded.username ? await db.getUser(decoded.username) : null;
        if (!user && decoded.userId != null) user = await db.getUserById(decoded.userId);
        if (!user) return appRes.status(404).json({ error: 'User not found' });
        user = await maybeConvertGameCenterPass(user);
        const trialResult = await maybeBackfillSignupProTrial(user);
        user = trialResult.user;
        appRes.json({
            success: true,
            user: buildCloudUserProfile(user),
            trialBackfill: !!trialResult.trialBackfill,
            trialDays: trialResult.trialDays || null
        });
    } catch (err) {
        console.error('Profile fetch error:', err);
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
        let user = decoded.username ? await db.getUser(decoded.username) : null;
        if (!user && decoded.userId != null) user = await db.getUserById(decoded.userId);
        if (!user) return appRes.status(404).json({ error: 'User not found' });
        const { displayName, avatarUrl } = appReq.body || {};
        const fields = {};
        if (typeof displayName === 'string') fields.displayName = displayName.trim().slice(0, 40);
        if (typeof avatarUrl === 'string') {
            const trimmed = avatarUrl.trim();
            if (trimmed.startsWith('data:') && trimmed.length > 900000) {
                return appRes.status(400).json({ error: 'รูปโปรไฟล์ใหญ่เกินไป กรุณาใช้รูปที่เล็กลง' });
            }
            fields.avatarUrl = trimmed.slice(0, 900000);
        }
        if (!Object.keys(fields).length) return appRes.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องการอัปเดต' });
        await db.updateUserFields(user.username, fields);
        const updated = await db.getUserById(user.id);
        if (!updated) return appRes.status(404).json({ error: 'User not found' });
        appRes.json({
            success: true,
            user: {
                id: updated.id,
                username: updated.username,
                displayName: updated.displayName || updated.username,
                avatarUrl: updated.avatarUrl || '',
                openId: updated.openId || '',
                email: updated.email || '',
                streamToken: updated.streamToken,
                isPro: updated.isPro === 1,
                proExpireAt: updated.proExpireAt,
                role: resolveAccountRole(updated),
                createdAt: updated.createdAt || ''
            }
        });
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
    getAuthUser: getCloudAuthUser
});

app.get('/api/config', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const config = await db.getUserConfig(decoded.userId);
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

        await db.saveUserConfig(decoded.userId, JSON.stringify(configData));
        appRes.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

function getCloudUserId(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        return jwt.verify(token, JWT_SECRET).userId;
    } catch (e) {
        return null;
    }
}

const youtubeLive = createYoutubeLiveService({ io, db, youtube, enablePolling: false });
registerYoutubeLiveRoutes(app, youtubeLive, async (req) => {
    const userId = getCloudUserId(req);
    if (userId == null) return null;
    let streamToken = '';
    try {
        const user = await db.getUserById(userId);
        streamToken = user?.streamToken || '';
    } catch (_) { /* ignore */ }
    return { userId, streamToken };
});

registerAssetRoutes(app, { getUserId: getCloudUserId });

const cloudIsAdminUser = async (userId) => {
    const user = await db.getUserById(userId);
    return isAdminAccount(user);
};

registerPaymentRoutes(app, {
    jwt,
    JWT_SECRET,
    getUserById: (userId) => db.getUserById(userId),
    updateUserProStatus: (username, isPro, proExpireAt) => db.updateUserProStatus(username, isPro, proExpireAt),
    updateUserFields: (username, fields) => {
        const patch = { ...fields };
        if (patch.entitlements != null && typeof patch.entitlements !== 'string') {
            patch.entitlements = JSON.stringify(patch.entitlements);
        }
        return db.updateUserFields(username, patch);
    },
    createPaymentOrder: (order) => db.createPaymentOrder(order),
    getPaymentOrder: (orderId) => db.getPaymentOrder(orderId),
    updatePaymentOrder: (orderId, fields) => db.updatePaymentOrder(orderId, fields),
    listPaymentOrders: (limit) => db.listPaymentOrders(limit),
    findPaymentOrderBySlipRef: (slipRef) => db.findPaymentOrderBySlipRef(slipRef),
    isAdminUser: cloudIsAdminUser,
    claimPaymentOrder: (orderId, fromStatuses) => db.claimPaymentOrder(orderId, fromStatuses)
});

registerAchievementAdminRoutes(app, {
    db,
    jwt,
    JWT_SECRET,
    isAdminUser: cloudIsAdminUser
});

// [ADMIN] ภาพรวมสมาชิก — ต้องมีบน cloud เพื่อให้แอดมินเห็นคนที่สมัครจากเครื่องอื่น
app.get('/api/admin/overview', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const now = Date.now();
        const users = await db.listUsers();
        const promos = await db.getPromoCodesList();
        const annCount = await db.countAnnouncements();

        const enrichedUsers = users.map((u) => {
            const isAdmin = isAdminAccount(u);
            const proActive = (u.isPro === 1 || u.isPro === true) && (!u.proExpireAt || new Date(u.proExpireAt).getTime() > now);
            let proScopes = ['all'];
            try {
                if (u.proScopes) {
                    const parsed = typeof u.proScopes === 'string' ? JSON.parse(u.proScopes) : u.proScopes;
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
                isPro: u.isPro === 1 || u.isPro === true,
                proActive,
                proExpireAt: u.proExpireAt || null,
                proScopes,
                entitlements: entitlementsForApi(u.entitlements),
                gameCenterAccess: canAccessGameCenter(u).allowed,
                createdAt: u.createdAt || '',
                role: isAdmin ? 'admin' : (proActive ? 'pro' : 'free')
            };
        });

        const codeRedemptions = (promos || [])
            .filter((p) => p.isUsed === 1 || p.isUsed === true)
            .map((p) => {
                let scopeList = [];
                try {
                    if (p.proScopes) {
                        scopeList = typeof p.proScopes === 'string' ? JSON.parse(p.proScopes) : p.proScopes;
                    }
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

        appRes.json({
            success: true,
            stats: {
                totalUsers: users.length,
                proActive: enrichedUsers.filter((u) => u.proActive).length,
                freeUsers: enrichedUsers.filter((u) => u.role === 'free').length,
                codesUsed: (promos || []).filter((p) => p.isUsed === 1 || p.isUsed === true).length,
                codesAvailable: (promos || []).filter((p) => !(p.isUsed === 1 || p.isUsed === true)).length,
                announcements: annCount,
                activeStreamers: 0
            },
            registeredUsers: enrichedUsers,
            proUsers: enrichedUsers.filter((u) => u.proActive),
            codeRedemptions,
            activeStreamers: []
        });
    } catch (err) {
        console.error('[admin/overview]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.post('/api/admin/grant-pro', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username, days, proScopes } = appReq.body || {};
        if (!username) return appRes.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้' });

        const user = await db.getUser(String(username).trim());
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้นี้ในระบบ' });

        const addDays = parseInt(days, 10) || 30;
        const base = user.proExpireAt && new Date(user.proExpireAt) > new Date()
            ? new Date(user.proExpireAt)
            : new Date();
        base.setDate(base.getDate() + addDays);
        let scopesJson = JSON.stringify(['all']);
        if (Array.isArray(proScopes) && proScopes.length) {
            const scopes = proScopes.includes('all') ? ['all'] : proScopes;
            scopesJson = JSON.stringify(scopes);
        }
        await db.updateUserFields(user.username, {
            isPro: 1,
            proExpireAt: base.toISOString(),
            proScopes: scopesJson
        });
        appRes.json({
            success: true,
            message: `มอบ PRO ${addDays} วันให้ @${user.username} สำเร็จ`,
            proExpireAt: base.toISOString(),
            proScopes: JSON.parse(scopesJson)
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

app.post('/api/admin/revoke-pro', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username } = appReq.body || {};
        const user = await db.getUser(String(username || '').trim());
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });

        await db.updateUserFields(user.username, { isPro: 0, proExpireAt: null, proScopes: null });
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
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username, days } = appReq.body || {};
        const user = await db.getUser(String(username || '').trim());
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });

        const entitlements = mergeGameCenterEntitlement(user.entitlements, {
            days: days == null || days === '' ? null : (Number.isFinite(Number(days)) ? Math.floor(Number(days)) : null),
            source: 'admin',
            planId: 'admin_grant'
        });
        await db.updateUserFields(user.username, {
            entitlements: JSON.stringify(entitlements)
        });
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
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }

        const { username } = appReq.body || {};
        const user = await db.getUser(String(username || '').trim());
        if (!user) return appRes.status(404).json({ error: 'ไม่พบผู้ใช้' });

        const entitlements = revokeGameCenterEntitlement(user.entitlements);
        await db.updateUserFields(user.username, {
            entitlements: JSON.stringify(entitlements)
        });
        appRes.json({
            success: true,
            message: `ถอน Game Center Pass ของ @${user.username} แล้ว`
        });
    } catch (err) {
        console.error('[admin/revoke-gamecenter]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

app.get('/api/admin/members', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const list = await db.listUsers();
        appRes.json({
            success: true,
            list: list.map((u) => ({
                id: u.id,
                username: u.username,
                isPro: u.isPro === 1 || u.isPro === true,
                proExpireAt: u.proExpireAt || null
            }))
        });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ดึงรายการของขวัญ TikTok ที่ถูกบันทึกทั้งหมด
app.get('/api/gifts', async (appReq, appRes) => {
    try {
        const list = await db.getAllGifts();
        // Sort manually by coins and name
        list.sort((a, b) => {
            if (a.diamondCount !== b.diamondCount) {
                return a.diamondCount - b.diamondCount;
            }
            return String(a.giftName).localeCompare(String(b.giftName));
        });
        appRes.json({ success: true, list });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการของขวัญ' });
    }
});

// รับของขวัญใหม่จาก client ทั่วโลกเพื่อรวมเข้าคลังกลาง
app.post('/api/gifts/sync', async (appReq, appRes) => {
    try {
        const expectedKey = String(process.env.GIFTS_SYNC_KEY || '').trim();
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
        const existing = await db.getGift(giftId, giftName);
        const nowStr = new Date().toISOString();
        const finalCoins = Math.max(1, parseInt(diamondCount, 10) || existing?.diamondCount || 1);
        const finalIcon = giftIcon || existing?.giftIcon || '';
        await db.saveGift(giftId, giftName, finalCoins, finalIcon, nowStr);
        io.emit('new_gift_discovered', { giftId, giftName, diamondCount: finalCoins, giftIcon: finalIcon });
        appRes.json({ success: true, action: existing ? 'update' : 'insert' });
    } catch (e) {
        console.error('[GiftsSync] cloud sync error:', e);
        appRes.status(500).json({ error: e.message });
    }
});

// [ADMIN] อัปเดตข้อมูลของขวัญ
app.post('/api/gifts/update', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { giftId, giftName, diamondCount, giftIcon } = appReq.body;
        if (!giftId || !giftName || isNaN(parseInt(diamondCount))) {
            return appRes.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
        }
        const nowStr = new Date().toISOString();
        await db.saveGift(giftId, giftName, parseInt(diamondCount), giftIcon || '', nowStr);
        io.emit('new_gift_discovered', { giftId, giftName, diamondCount, giftIcon });
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(500).json({ error: e.message });
    }
});

// [ADMIN] ลบของขวัญ
app.post('/api/gifts/delete', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { giftId, giftIds } = appReq.body || {};
        if (giftIds && Array.isArray(giftIds)) {
            if (!giftIds.length) return appRes.status(400).json({ error: 'ไม่พบ ID ของขวัญ' });
            await db.deleteGifts(giftIds);
            io.emit('new_gift_discovered', {});
            return appRes.json({ success: true, deleted: giftIds.length });
        }
        if (!giftId) {
            return appRes.status(400).json({ error: 'ไม่พบ ID ของขวัญ' });
        }
        await db.deleteGift(giftId);
        io.emit('new_gift_discovered', { giftId });
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(500).json({ error: e.message });
    }
});

// ตรวจสอบและใช้งานโปรโมโค้ด (Redeem Code)
function parseProScopesJson(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

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
        
        let user = decoded.username ? await db.getUser(decoded.username) : null;
        if (!user && decoded.userId != null) user = await db.getUserById(decoded.userId);
        if (!user) {
            return appRes.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });
        }
        
        const promo = await db.getPromoCode(code);
        if (!promo) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดไม่ถูกต้อง' });
        }
        
        if (Number(promo.isUsed) === 1) {
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

        const claimed = await db.claimPromoCode(code, user.id, user.username, nowStr);
        if (!claimed) {
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
            
            await db.updateUserFields(user.username, {
                isPro: 1,
                proExpireAt: newExpireStr,
                proScopes: scopesJson
            });
            
            const scopeHint = mergedScopes.includes('all')
                ? ''
                : ` (หมวด: ${mergedScopes.join(', ')})`;
            const proMsg = `คุณได้รับสิทธิ์ PRO เพิ่มอีก ${promo.val} วัน${scopeHint}!`;
            notifyPromoRedeem({ username: user.username, type: 'pro', val: promo.val, message: proMsg }).catch(() => {});
            return appRes.json({
                success: true,
                type: 'pro',
                val: promo.val,
                proExpireAt: newExpireStr,
                proScopes: mergedScopes,
                message: proMsg
            });
        }

        if (promo.type === 'gamecenter') {
            const entitlements = mergeGameCenterEntitlement(user.entitlements, {
                days: promo.val == null || Number(promo.val) <= 0 ? null : Number(promo.val),
                source: 'promo',
                planId: 'promo_code'
            });
            await db.updateUserFields(user.username, {
                entitlements: JSON.stringify(entitlements)
            });
            const dayHint = promo.val > 0 ? ` ${promo.val} วัน` : ' (ไม่หมดอายุ)';
            const gcMsg = `คุณได้รับ Game Center Early Access Pass${dayHint}!`;
            notifyPromoRedeem({ username: user.username, type: 'gamecenter', val: promo.val, message: gcMsg }).catch(() => {});
            return appRes.json({
                success: true,
                type: 'gamecenter',
                val: promo.val,
                entitlements: entitlementsForApi(entitlements),
                message: gcMsg
            });
        }

        if (promo.type === 'game') {
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
            await db.updateUserFields(user.username, {
                entitlements: JSON.stringify(entitlements)
            });
            const label = GAME_UNLOCK_LABELS[gameId] || gameId;
            const dayHint = days ? ` ${days} วัน` : ' (ไม่หมดอายุ)';
            const gameMsg = `ปลดล็อก ${label}${dayHint}!`;
            notifyPromoRedeem({ username: user.username, type: 'game', val: promo.val, message: gameMsg, gameId }).catch(() => {});
            return appRes.json({
                success: true,
                type: 'game',
                val: promo.val,
                gameId,
                gameName: label,
                entitlements: entitlementsForApi(entitlements),
                access: {
                    gameCenter: canAccessGameCenter({ ...user, entitlements: JSON.stringify(entitlements) }),
                    games: gamesAccessForApi({ ...user, entitlements: JSON.stringify(entitlements) })
                },
                message: gameMsg
            });
        }

        return appRes.status(400).json({ error: 'ประเภทโปรโมโค้ดไม่รองรับ' });
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบโปรโมโค้ด' });
    }
});

// บัญชีโปรโมโค้ดแอดมิน
app.post('/api/admin/promo/generate', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { type, val, code, proScopes, gameId } = appReq.body || {};
        if (!type || !code) {
            return appRes.status(400).json({ error: 'กรุณากรอกข้อมูลประเภท และรหัสรางวัลให้ครบถ้วน' });
        }
        if (val == null || val === '' || Number.isNaN(Number(val))) {
            return appRes.status(400).json({ error: 'กรุณาระบุมูลค่า / จำนวนวันให้ถูกต้อง' });
        }
        const existing = await db.getPromoCode(code);
        if (existing) return appRes.status(400).json({ error: 'รหัสรางวัลนี้มีอยู่แล้วในระบบ' });
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
        const nowStr = new Date().toISOString();
        await db.createPromoCode(String(code).toUpperCase(), type, Number(val), nowStr, scopesJson);
        appRes.json({ success: true, message: 'สร้างโค้ดรางวัลสำเร็จ!' });
    } catch (err) {
        appRes.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/promo/list', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const list = await db.getPromoCodesList();
        appRes.json({ success: true, list });
    } catch (err) {
        console.error('[admin/promo/list]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// ตรวจสอบ PIN แอดมิน (ปลดล็อกตั้งค่ากาชาเท่านั้น)
registerVerifyPinRoute(app, JWT_SECRET);

// [ADMIN] ประกาศ — เก็บบน Cloud/Firestore ให้ผู้ใช้ทุกคนรับได้
app.post('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const body = appReq.body || {};
        const {
            title, message, important, imageUrl, category, summary, ctaLabel, ctaUrl,
            contentHtml, ctaButtons, status, audience, audienceConfig, publishAt, expireAt,
            timezone, displayHome, showNotification, pinned, showPopup
        } = body;
        const popup = normalizePopupFields(body, {});
        const resolvedMessage = String(message || title || '').trim();
        if (!title || !resolvedMessage) {
            return appRes.status(400).json({ error: 'กรุณากรอกหัวข้อและข้อความประกาศ' });
        }
        const adminUser = decoded.username ? await db.getUser(decoded.username) : await db.getUserById(decoded.userId);
        const payload = await db.createAnnouncement({
            title: String(title).trim(),
            message: resolvedMessage,
            imageUrl: imageUrl ? String(imageUrl) : null,
            important: !!important,
            category,
            summary,
            ctaLabel,
            ctaUrl,
            contentHtml,
            ctaButtons,
            status,
            audience,
            audienceConfig,
            publishAt,
            expireAt,
            timezone,
            displayHome,
            showNotification,
            pinned,
            showPopup: popup.showPopup,
            displayType: popup.displayType,
            announcementType: popup.announcementType,
            priority: popup.priority,
            locale: popup.locale,
            popupConfig: popup.popupConfig,
            createdBy: adminUser?.username || 'admin'
        });
        // Push to any clients connected to the cloud socket hub.
        if (payload.status === 'published' && payload.showNotification !== false) {
            try { io.emit('app_announcement', payload); } catch (_) { /* ignore */ }
        }
        appRes.json({ success: true, announcement: payload });
    } catch (err) {
        console.error('[admin/announcements POST]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งประกาศ' });
    }
});

app.get('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const list = await db.listAnnouncements(50);
        appRes.json({ success: true, list: hydrateList(list) });
    } catch (err) {
        console.error('[admin/announcements GET]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.patch('/api/admin/announcements/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const adminUser = decoded.username ? await db.getUser(decoded.username) : await db.getUserById(decoded.userId);
        const patch = { ...(appReq.body || {}) };
        if (patch.archived === true || patch.status === 'archived') {
            patch.status = 'archived';
            patch.archivedAt = new Date().toISOString();
        }
        delete patch.archived;
        const announcement = await db.updateAnnouncement(
            appReq.params.id,
            patch,
            adminUser?.username || 'admin'
        );
        if (!announcement) return appRes.status(404).json({ error: 'ไม่พบประกาศนี้' });
        try { io.emit('app_announcement_updated', announcement); } catch (_) { /* ignore */ }
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
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const list = await db.listAnnouncementRevisions(appReq.params.id, 100);
        appRes.json({ success: true, list });
    } catch (err) {
        console.error('[admin/announcements revisions]', err);
        appRes.status(500).json({ error: 'โหลด Revision ไม่สำเร็จ' });
    }
});

app.delete('/api/admin/announcements/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const ok = await db.deleteAnnouncement(appReq.params.id);
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบประกาศนี้' });
        try { io.emit('app_announcement_removed', { id: appReq.params.id }); } catch (_) { /* ignore */ }
        appRes.json({ success: true, id: appReq.params.id });
    } catch (err) {
        console.error('[admin/announcements DELETE]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบประกาศ' });
    }
});

app.delete('/api/admin/announcements', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const deleted = await db.deleteAllAnnouncements();
        try { io.emit('app_announcements_cleared', {}); } catch (_) { /* ignore */ }
        appRes.json({ success: true, deleted });
    } catch (err) {
        console.error('[admin/announcements DELETE ALL]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบประกาศ' });
    }
});

registerAnnouncementPopupApi(app, {
    requireAdmin: async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) { res.status(401).json({ error: 'No token' }); return null; }
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            if (!(await cloudIsAdminUser(decoded.userId))) {
                res.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
                return null;
            }
            return { id: decoded.userId, username: decoded.username || 'admin', role: 'admin' };
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
    },
    requireUser: async (req, res) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) { res.status(401).json({ error: 'No token' }); return null; }
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            const user = decoded.username ? await db.getUser(decoded.username) : await db.getUserById(decoded.userId);
            return user || { id: decoded.userId, role: 'free' };
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
    },
    db,
    io
});

app.post('/api/announcements/:id/event', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const eventType = String(appReq.body?.eventType || '');
        if (!['view', 'read', 'reaction', 'share', 'cta_click', 'impression', 'viewed', 'dismissed', 'acknowledged', 'secondary_click'].includes(eventType)) {
            return appRes.status(400).json({ error: 'ข้อมูล event ไม่ถูกต้อง' });
        }
        await db.recordAnnouncementEvent(appReq.params.id, decoded.userId, eventType);
        appRes.json({ success: true });
    } catch (err) {
        console.error('[announcements event]', err);
        appRes.status(500).json({ error: 'บันทึก event ไม่สำเร็จ' });
    }
});

app.get('/api/announcements/recent', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const user = decoded.username ? await db.getUser(decoded.username) : await db.getUserById(decoded.userId);
        const now = new Date();
        const isPro = user?.role === 'pro' && (!user.proExpireAt || new Date(user.proExpireAt) > now);
        const candidates = await db.listAnnouncements(100);
        const list = candidates.filter((ann) => {
            const status = ann.status || 'published';
            if (!['published', 'scheduled'].includes(status) || ann.archivedAt) return false;
            if (ann.publishAt && new Date(ann.publishAt) > now) return false;
            if (ann.expireAt && new Date(ann.expireAt) <= now) return false;
            const audience = ann.audience || 'all';
            if (audience === 'all') return true;
            if (audience === 'pro') return isPro;
            if (audience === 'free') return !isPro;
            if (audience === 'group' || audience === 'custom') {
                const ids = String(ann.audienceConfig || '').split(',').map((x) => x.trim()).filter(Boolean);
                return ids.includes(String(decoded.userId));
            }
            return false;
        }).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).slice(0, 30);
        appRes.json({ success: true, list });
    } catch (err) {
        console.error('[announcements/recent]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// AE Presets — แอดมินเผยแพร่ / ผู้ใช้ Apply
app.post('/api/admin/ae-presets', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const { id, name, description, coverUrl, payload } = appReq.body || {};
        if (!name || !String(name).trim()) {
            return appRes.status(400).json({ error: 'กรุณาระบุชื่อพรีเซ็ต' });
        }
        if (!payload || typeof payload !== 'object') {
            return appRes.status(400).json({ error: 'กรุณาส่ง payload ของ Actions & Events' });
        }
        const adminUser = decoded.username ? await db.getUser(decoded.username) : await db.getUserById(decoded.userId);
        const preset = await db.upsertAePreset({
            id,
            name: String(name).trim(),
            description: description ? String(description) : '',
            coverUrl: coverUrl ? String(coverUrl) : null,
            payload: {
                actions: payload.actions && typeof payload.actions === 'object' ? payload.actions : {},
                events: payload.events && typeof payload.events === 'object' ? payload.events : {},
                screens: Array.isArray(payload.screens) ? payload.screens : []
            },
            createdBy: adminUser?.username || 'admin'
        });
        appRes.json({ success: true, preset: { id: preset.id, name: preset.name, description: preset.description, coverUrl: preset.coverUrl, updatedAt: preset.updatedAt } });
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
        const list = await db.listAePresets(100);
        appRes.json({ success: true, list });
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
        const preset = await db.getAePreset(appReq.params.id);
        if (!preset) return appRes.status(404).json({ error: 'ไม่พบพรีเซ็ต' });
        appRes.json({ success: true, preset });
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
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ' });
        }
        const ok = await db.deleteAePreset(appReq.params.id);
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบพรีเซ็ต' });
        appRes.json({ success: true, id: appReq.params.id });
    } catch (err) {
        console.error('[admin/ae-presets DELETE]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// ส่งรายงานบัค / ข้อเสนอแนะ (เก็บบน Cloud/Firestore)
app.post('/api/bug-reports', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนส่งรายงาน' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        let user = decoded.username ? await db.getUser(decoded.username) : null;
        if (!user && decoded.userId != null) user = await db.getUserById(decoded.userId);
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
        console.error('[bug-reports]', err);
        appRes.status(500).json({ error: 'ไม่สามารถส่งรายงานได้' });
    }
});

app.get('/api/admin/bug-reports', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const list = await db.listBugReports(200);
        appRes.json({ success: true, list });
    } catch (err) {
        console.error('[admin/bug-reports]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.patch('/api/admin/bug-reports/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }

        const { status, adminNote, priority, assignedTo, assignedName, note } = appReq.body || {};
        let actorUser = decoded.username ? await db.getUser(decoded.username) : null;
        if (!actorUser && decoded.userId != null) actorUser = await db.getUserById(decoded.userId);
        const ok = await db.updateBugReport(appReq.params.id, {
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
        const updated = await db.getBugReport(appReq.params.id);
        appRes.json({ success: true, report: updated });
    } catch (err) {
        console.error('[admin/bug-reports patch]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

app.delete('/api/admin/bug-reports/:id', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!(await cloudIsAdminUser(decoded.userId))) {
            return appRes.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
        }
        const ok = await db.deleteBugReport(appReq.params.id);
        if (!ok) return appRes.status(404).json({ error: 'ไม่พบรายงานนี้' });
        appRes.json({ success: true });
    } catch (err) {
        console.error('[admin/bug-reports delete]', err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดบนเซิร์ฟเวอร์' });
    }
});

// หน้าแรกบนคลาวด์เป็นหน้าดาวน์โหลด (ไม่เสิร์ฟแอปเดสก์ท็อปทั้งหน้าผ่านเว็บ)

app.get('/overlay', (appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'overlay.html'));
});

registerWidgetRoutes(app, {
    db,
    rootDir: __dirname,
    validateCid: async (cid) => {
        try {
            const user = await db.getUserByStreamToken(cid);
            return !!user;
        } catch (e) {
            return false;
        }
    }
});

// หน้า Landing สำหรับดาวน์โหลดโปรแกรม
app.get(['/download', '/download.html'], (appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'download.html'));
});

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
        return appRes.redirect(302, 'https://github.com/attapornps1996-hub/TokControl/releases/latest');
    }
});

// Browser ingest is desktop-only (bookmarklet → 127.0.0.1). Do not accept it on public Cloud Run.
app.post('/api/browser/event', (_appReq, appRes) => {
    appRes.status(403).json({
        success: false,
        error: 'Browser event ingest is disabled on Cloud. Use the TokControl desktop app (127.0.0.1).'
    });
});

const robloxProfileCache = new Map();
const ROBLOX_CACHE_MS = 60_000;
const { extractTikTokOwnerProfile } = require('./tiktok_profile');
const { resolveTikTokRoomId } = require('./tiktok_room_resolve');
const tiktokProfileCache = new Map();
const TIKTOK_PROFILE_CACHE_MS = 60_000;

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}

app.get('/api/tiktok/profile', async (appReq, appRes) => {
    try {
        const username = String(appReq.query.username || '').trim().replace(/^@+/, '');
        if (!username) {
            appRes.status(400).json({ error: 'username required' });
            return;
        }
        if (!WebcastPushConnection) {
            appRes.status(503).json({ error: 'TikTok connector ยังไม่พร้อม' });
            return;
        }
        const cacheKey = username.toLowerCase();
        const cached = tiktokProfileCache.get(cacheKey);
        if (cached && Date.now() - cached.at < TIKTOK_PROFILE_CACHE_MS) {
            appRes.json(cached.data);
            return;
        }

        const conn = new WebcastPushConnection(username, { enableExtendedGiftInfo: false, fetchRoomInfoOnConnect: false });
        let roomInfo = null;
        try {
            roomInfo = await conn.getRoomInfo();
        } catch (err) {
            try {
                const state = await conn.connect();
                roomInfo = state?.roomInfo || await conn.getRoomInfo().catch(() => null);
            } catch (e2) {
                throw err;
            } finally {
                try { conn.disconnect(); } catch (_) {}
            }
        }

        const profile = extractTikTokOwnerProfile(roomInfo, username);
        if (!profile.username) profile.username = username;
        tiktokProfileCache.set(cacheKey, { at: Date.now(), data: profile });
        appRes.json(profile);
    } catch (err) {
        console.error('[tiktok/profile]', err?.message || err);
        appRes.status(502).json({ error: 'ไม่สามารถดึงโปรไฟล์ TikTok ได้ (อาจออฟไลน์หรือ username ผิด)' });
    }
});

app.get('/api/roblox/profile', async (appReq, appRes) => {
    try {
        const username = String(appReq.query.username || '').trim().replace(/^@/, '');
        if (!username) {
            appRes.status(400).json({ error: 'username required' });
            return;
        }
        const cacheKey = username.toLowerCase();
        const cached = robloxProfileCache.get(cacheKey);
        if (cached && Date.now() - cached.at < ROBLOX_CACHE_MS) {
            appRes.json(cached.data);
            return;
        }

        const lookup = await fetchJson('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const user = lookup?.data?.[0];
        if (!user?.id) {
            appRes.status(404).json({ error: 'ไม่พบผู้ใช้ Roblox นี้' });
            return;
        }
        const userId = user.id;
        const [profile, friends, followers, following, thumb] = await Promise.all([
            fetchJson(`https://users.roblox.com/v1/users/${userId}`).catch(() => ({})),
            fetchJson(`https://friends.roblox.com/v1/users/${userId}/friends/count`).catch(() => ({ count: 0 })),
            fetchJson(`https://friends.roblox.com/v1/users/${userId}/followers/count`).catch(() => ({ count: 0 })),
            fetchJson(`https://friends.roblox.com/v1/users/${userId}/followings/count`).catch(() => ({ count: 0 })),
            fetchJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`).catch(() => ({ data: [] }))
        ]);
        const payload = {
            userId,
            username: user.name || username,
            displayName: profile.displayName || user.name || username,
            friends: friends.count || 0,
            followers: followers.count || 0,
            following: following.count || 0,
            avatarUrl: thumb?.data?.[0]?.imageUrl || ''
        };
        robloxProfileCache.set(cacheKey, { at: Date.now(), data: payload });
        appRes.json(payload);
    } catch (err) {
        console.error('[roblox/profile]', err?.message || err);
        appRes.status(502).json({ error: 'ไม่สามารถดึงข้อมูล Roblox ได้' });
    }
});

// Endpoint ปิดการใช้งานเมื่อรันบนคลาวด์
app.get('/api/open-tiktok-browser', (req, res) => {
    res.json({
        success: false,
        error: "Browser Mode is only supported when running the app locally. If you are using the cloud server, please open TikTok Live directly in your Chrome browser and run the TokControl bookmarklet manually."
    });
});

// ==========================================
// BROWSER MODE EVENT PROCESSOR
// ==========================================
async function processBrowserEvent(type, data) {
    const username = data && data.username ? data.username.toLowerCase() : '';
    const session = activeTiktokSessions[username];
    
    if (session) {
        if (type === 'gift') {
            let giftId = resolveKnownGiftId(data.giftName, data.giftId || 0);
            if (!giftId) {
                giftId = hashGiftName(data.giftName || '');
            }
            
            const POPULAR_TIKTOK_GIFTS = {
                'rose': 1, 'กุหลาบ': 1, 'ice cream': 1, 'ไอศกรีม': 1, 'tiktok': 1,
                'finger heart': 5, 'มินิฮาร์ท': 5, 'mic': 5, 'ไมค์': 5, 'panda': 5, 'แพนด้า': 5,
                'perfume': 20, 'น้ำหอม': 20, 'doughnut': 30, 'donut': 30, 'โดนัท': 30,
                'crown': 99, 'มงกุฎ': 99, 'confetti': 100, 'คอนเฟตติ': 100,
                'gold mine': 1000, 'เหมืองทอง': 1000
            };

            const nameLower = data.giftName ? data.giftName.toLowerCase().trim() : '';
            let diamondCount = 1;
            if (POPULAR_TIKTOK_GIFTS[nameLower]) {
                diamondCount = POPULAR_TIKTOK_GIFTS[nameLower];
            }

            try {
                const existingGift = await db.getGift(giftId, data.giftName);
                const nowStr = new Date().toISOString();
                const iconToSave = data.giftIcon || '';
                
                if (!existingGift) {
                    await db.saveGift(giftId, data.giftName, diamondCount, iconToSave, nowStr);
                    io.to(session.token).emit('new_gift_discovered', { giftId, giftName: data.giftName, diamondCount, giftIcon: iconToSave });
                }
            } catch (e) {
                console.error("Failed to dynamically save Browser Scraped Gift:", e);
            }

            io.to(session.token).emit('tiktok_gift', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl,
                giftName: data.giftName,
                giftId,
                giftIcon: data.giftIcon,
                diamondCount,
                repeatCount: data.repeatCount,
                totalCoins: diamondCount * data.repeatCount
            });
        } else if (type === 'chat') {
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
                likeCount: data.likeCount || 1,
                totalLikeCount: extractTotalLikeCount(data)
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
            io.to(session.token).emit('tiktok_notification', { type: 'connected', username: data.username });
        }
    }
}

// ==========================================
// SOCKET.IO GATEWAY & PERSISTENT TASK MANAGER
// ==========================================

const activePanels = {};
const panelSyncDebounce = {};

function requestPanelSyncDebounced(token) {
    if (!token) return;
    if (panelSyncDebounce[token]) return;
    panelSyncDebounce[token] = setTimeout(() => { delete panelSyncDebounce[token]; }, 2500);
    const panelId = activePanels[token];
    if (panelId) io.to(panelId).emit('request_panel_sync');
}

io.on('connection', (socket) => {
    console.log('Socket client connected to cloud:', socket.id);

    socket.on('join_panel', (token) => {
        socket.join(token);
        activePanels[token] = socket.id;
        console.log(`Panel joined room on cloud: ${token}`);
    });

    socket.on('join_overlay', (token) => {
        socket.join(token);
        console.log(`OBS Overlay joined room on cloud: ${token}`);
        requestPanelSyncDebounced(token);
    });

    socket.on('send_result', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_show_result', rest);
    });

    socket.on('send_win_status', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_win_status', rest);
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
        io.to(token).emit('overlay_play_cutscene', { videoData });
    });

    socket.on('send_stop_cutscene', (token) => {
        io.to(token).emit('overlay_stop_cutscene');
    });

    socket.on('send_reveal_card', (payload) => {
        const { token, ...rest } = payload;
        io.to(token).emit('overlay_reveal_card', rest);
    });

    socket.on('send_pity', ({ token, enabled, ss, maxSS, ssr, maxSSR }) => {
        io.to(token).emit('overlay_pity', { enabled, ss, maxSS, ssr, maxSSR });
    });

    socket.on('send_gift_rules', ({ token, giftRules }) => {
        io.to(token).emit('overlay_gift_rules', { giftRules });
    });

    socket.on('test_trigger_event', (payload) => {
        const token = payload.token;
        if (!token) return;

        if (payload.eventType === 'gift') {
            let giftIcon = payload.giftIcon || '';
            if (!giftIcon || !/^https?:/i.test(String(giftIcon))) {
                const name = String(payload.giftName || '').toLowerCase();
                const fallbacks = {
                    rose: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/rose.png~tplv-obj.image',
                    'finger heart': 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/finger_heart.png~tplv-obj.image',
                    tiktok: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/tiktok.png~tplv-obj.image'
                };
                giftIcon = fallbacks[name] || 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/rose.png~tplv-obj.image';
            }
            io.to(token).emit('tiktok_gift', {
                uniqueId: 'Test_User',
                nickname: 'ผู้ทดสอบระบบ',
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=Test`,
                giftName: payload.giftName || 'Gift',
                giftId: payload.giftId || '2272',
                giftIcon,
                diamondCount: payload.diamondCount || 1,
                repeatCount: payload.repeatCount || 1,
                totalCoins: (payload.diamondCount || 1) * (payload.repeatCount || 1),
                isTest: true
            });
        }
    });

    socket.on('overlay_test_clear', ({ token }) => {
        if (!token) return;
        io.to(token).emit('overlay_test_clear');
    });

    socket.on('overlay_test_begin', ({ token }) => {
        if (!token) return;
        io.to(token).emit('overlay_test_begin');
    });

    // รันการดักฟัง TikTok Live จากคลาวด์ 24 ชั่วโมง
    socket.on('connect_tiktok', async ({ token, username, userId, integrationMode }) => {
        const mode = integrationMode || 'direct';
        const userLower = username.toLowerCase();
        
        activeTiktokSessions[userLower] = { token, userId, socketId: socket.id };

        if (mode === 'browser') {
            socket.emit('tiktok_status', { connected: true, isLive: false, username, integrationMode: 'browser' });
            io.to(token).emit('tiktok_notification', { type: 'standby', username });
            return;
        }

        // หากมีการเชื่อมต่อที่รันค้างอยู่บนเซิร์ฟเวอร์ ให้เชื่อมต่อใหม่ทันที
        if (activeTikTokConnections[userId]) {
            try {
                activeTikTokConnections[userId].disconnect();
            } catch (e) {}
            delete activeTikTokConnections[userId];
        }

        try {
            console.log(`Cloud node connecting persistent listener to TikTok: @${username}`);
            const tiktokConnect = new WebcastPushConnection(username, { enableExtendedGiftInfo: true });
            tiktokConnect.username = username;
            activeTikTokConnections[userId] = tiktokConnect;

            socket.emit('tiktok_status', { connected: true, isLive: false, username, integrationMode: 'direct' });
            io.to(token).emit('tiktok_notification', { type: 'standby', username });

            let retryInterval = null;
            let connectInFlight = false;
            tiktokConnect.isLive = false;

            const emitLiveStatus = (extra = {}) => {
                tiktokConnect.isLive = true;
                const payload = {
                    connected: true,
                    isLive: true,
                    username,
                    integrationMode: 'direct',
                    ...extra
                };
                socket.emit('tiktok_status', payload);
                io.to(token).emit('tiktok_status', payload);
                io.to(token).emit('tiktok_notification', { type: 'connected', username });
            };

            const tryConnect = () => {
                if (!activeTikTokConnections[userId] || activeTikTokConnections[userId] !== tiktokConnect) return;
                if (tiktokConnect.isLive || connectInFlight) return;
                connectInFlight = true;

                (async () => {
                    let resolved = null;
                    try {
                        resolved = await resolveTikTokRoomId(username);
                        console.log(`[cloud tiktok room resolve @${username}]`, resolved);
                    } catch (e) {
                        console.warn(`[cloud tiktok room resolve @${username}]`, e?.message || e);
                    }
                    if (resolved && resolved.ok === false && resolved.error === 'user_not_found') {
                        throw Object.assign(new Error('user_not_found'), { name: 'InvalidUniqueIdError' });
                    }
                    const roomIdHint = resolved?.ok && resolved.roomId ? String(resolved.roomId) : undefined;
                    if (
                        resolved?.ok &&
                        resolved.isLive === false &&
                        roomIdHint &&
                        resolved.source !== 'html-profile'
                    ) {
                        throw Object.assign(new Error("The requested user isn't online :("), { name: 'UserOfflineError' });
                    }
                    const state = roomIdHint
                        ? await tiktokConnect.connect(roomIdHint)
                        : await tiktokConnect.connect();
                    console.log(`TikTok connected successfully on cloud for @${username}`);
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                    emitLiveStatus({ roomId: state?.roomId || roomIdHint || null });
                    try {
                        const roomInfo = await tiktokConnect.getRoomInfo();
                        const profile = extractTikTokOwnerProfile(roomInfo, username);
                        const avatar = profile.avatarUrl || roomInfo.owner?.avatar_large?.url_list[0] || '';
                        const nickname = profile.displayName || roomInfo.owner?.nickname || username;
                        emitLiveStatus({
                            nickname,
                            avatar,
                            displayName: nickname,
                            avatarUrl: avatar,
                            followerCount: profile.followerCount,
                            followingCount: profile.followingCount,
                            roomId: state?.roomId || roomIdHint || null
                        });
                    } catch (_) {}
                })().catch(err => {
                    const msg = String(err?.message || err || '');
                    const name = String(err?.name || '');
                    if (
                        name.includes('AlreadyConnected') ||
                        name.includes('AlreadyConnecting') ||
                        /already connected|already connecting/i.test(msg)
                    ) {
                        console.log(`TikTok connect skipped for @${username}: ${msg}`);
                        if (!tiktokConnect.isLive) emitLiveStatus();
                        return;
                    }
                    if (/user_not_found|InvalidUniqueId|Failed to retrieve Room ID/i.test(msg) || name.includes('InvalidUniqueId')) {
                        console.warn(`TikTok user missing for @${username}:`, msg);
                        tiktokConnect.isLive = false;
                        socket.emit('tiktok_status', {
                            connected: false,
                            isLive: false,
                            username,
                            note: 'user_not_found',
                            error: `ไม่พบบัญชี TikTok @${username}`,
                            integrationMode: 'direct'
                        });
                        return;
                    }
                    console.warn(`TikTok Stream offline for @${username}:`, msg);
                    tiktokConnect.isLive = false;
                    socket.emit('tiktok_status', { connected: true, isLive: false, username, note: 'offline', offlineError: msg, integrationMode: 'direct' });
                    if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                        retryInterval = setInterval(tryConnect, 15000);
                    }
                }).finally(() => {
                    connectInFlight = false;
                });
            };

            tryConnect();

            tiktokConnect.on('disconnected', () => {
                console.log(`TikTok disconnected for @${username}. Retrying...`);
                tiktokConnect.isLive = false;
                connectInFlight = false;
                socket.emit('tiktok_status', { connected: true, isLive: false, username, note: 'offline', offlineError: 'disconnected', integrationMode: 'direct' });
                if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                    retryInterval = setInterval(tryConnect, 15000);
                }
            });

            tiktokConnect.on('connected', (state) => {
                if (!tiktokConnect.isLive) {
                    console.log(`TikTok 'connected' event for @${username}, promoting to LIVE`);
                    emitLiveStatus({ roomId: state?.roomId || null });
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                }
            });

            tiktokConnect.on('chat', (data) => {
                const chatUser = data?.user || data;
                const payload = buildChatPayload(chatUser, data, userId, fanClubRegistry, {
                    tiktokUsername: username
                });
                const teamStatus = analyzeChatTeamStatus(chatUser, data, userId, fanClubRegistry, {
                    tiktokUsername: username
                });
                console.log(
                    `[Chat] User: ${payload.uniqueId} | HasTeamBadge: ${teamStatus.hasTeamBadge} | Registry: ${teamStatus.registryHit} | TeamLevel: ${teamStatus.teamLevel} | Passed: ${teamStatus.passed}`
                );
                io.to(token).emit('tiktok_chat', payload);
            });

            tiktokConnect.on('superFan', (sfData) => {
                fanClubRegistry.mark(userId, extractChatIdentity(sfData?.user, sfData), { tiktokUsername: username, level: 1 });
            });
            tiktokConnect.on('superFanJoin', (sfData) => {
                fanClubRegistry.mark(userId, extractChatIdentity(sfData?.user, sfData), { tiktokUsername: username, level: 1 });
            });

            tiktokConnect.on('gift', (data) => {
                try {
                    const norm = normalizeWebcastGift(data);
                    const giftId = norm.giftId;
                    const giftName = norm.giftName;
                    if (isHeartMeGift(giftId, giftName)) {
                        fanClubRegistry.mark(userId, {
                            uniqueId: norm.uniqueId,
                            nickname: norm.nickname,
                            userId: norm.userId,
                            avatar: norm.avatar
                        }, { tiktokUsername: username, level: 1 });
                    }

                    let giftIconUrl = extractGiftIconUrl(data)
                        || extractGiftIconUrl(data && (data.gift || data.giftDetails))
                        || pickFirstImageUrl(data.giftIcon)
                        || '';

                    const repeatCount = Math.max(1, Number(norm.repeatCount) || 1);
                    const repeatEnd = norm.repeatEnd === false ? false : true;
                    const payload = {
                        uniqueId: norm.uniqueId,
                        nickname: norm.nickname,
                        avatar: norm.avatar,
                        giftName,
                        giftId,
                        giftIcon: giftIconUrl,
                        diamondCount: norm.diamondCount,
                        repeatCount,
                        totalCoins: (Number(norm.diamondCount) || 0) * repeatCount,
                        giftType: Number(norm.giftType) === 1 || repeatEnd === false || repeatCount > 1 ? 1 : (Number(norm.giftType) || 0),
                        repeatEnd,
                        msgId: String(norm.msgId || '')
                    };
                    if (typeof cloudGiftEmitGuard !== 'undefined' && cloudGiftEmitGuard) {
                        cloudGiftEmitGuard.enqueue(payload, (finalGift) => {
                            io.to(token).emit('tiktok_gift', finalGift);
                        });
                    } else {
                        io.to(token).emit('tiktok_gift', payload);
                    }

                    db.getGift(giftId, giftName).then(async (existingGift) => {
                        if (!existingGift) {
                            const nowStr = new Date().toISOString();
                            await db.saveGift(giftId, giftName, norm.diamondCount, giftIconUrl, nowStr);
                            io.to(token).emit('new_gift_discovered', { giftId, giftName, diamondCount: norm.diamondCount, giftIcon: giftIconUrl });
                        } else if (giftIconUrl && (!existingGift.giftIcon || !String(existingGift.giftIcon).startsWith('http'))) {
                            await db.saveGift(giftId, giftName || existingGift.giftName, existingGift.diamondCount || norm.diamondCount, giftIconUrl, existingGift.createdAt || new Date().toISOString());
                            io.to(token).emit('new_gift_discovered', { giftId, giftName, diamondCount: norm.diamondCount, giftIcon: giftIconUrl });
                        }
                    }).catch((e) => {
                        console.error('Failed to dynamically save TikTok Gift:', e);
                    });
                } catch (err) {
                    console.error('[tiktok gift] parse/emit failed:', err?.message || err);
                }
            });

            tiktokConnect.on('social', (data) => {
                if (data.displayType.includes('follow')) {
                    io.to(token).emit('tiktok_follow', { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl });
                } else if (data.displayType.includes('share')) {
                    io.to(token).emit('tiktok_share', { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl });
                }
            });

            tiktokConnect.on('like', (data) => {
                io.to(token).emit('tiktok_like', {
                    uniqueId: data.uniqueId,
                    nickname: data.nickname,
                    likeCount: data.likeCount,
                    totalLikeCount: extractTotalLikeCount(data)
                });
            });

            tiktokConnect.on('member', (data) => {
                io.to(token).emit('tiktok_join', { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl });
            });

        } catch (error) {
            console.error('TikTok Setup Error:', error);
            socket.emit('tiktok_status', { connected: false, error: error.message, username });
        }
    });

    socket.on('disconnect_tiktok', ({ token, userId }) => {
        for (let username in activeTiktokSessions) {
            if (activeTiktokSessions[username].userId === userId) {
                delete activeTiktokSessions[username];
            }
        }
        if (activeTikTokConnections[userId]) {
            try {
                activeTikTokConnections[userId].disconnect();
            } catch (e) {}
            delete activeTikTokConnections[userId];
        }
        socket.emit('tiktok_status', { connected: false });
        io.to(token).emit('tiktok_notification', { type: 'disconnected' });
    });
});

server.listen(PORT, () => {
    console.log(`TokControl Cloud Backend server running on port ${PORT}`);
});
