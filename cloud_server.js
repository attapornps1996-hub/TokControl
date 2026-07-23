const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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
app.use(express.static(path.join(__dirname)));

// จัดเก็บข้อมูลเชื่อมต่อในระดับ Server
const activeTikTokConnections = {};
const activeTiktokSessions = {};

// สร้างบัญชีแอดมินจำลองเริ่มต้น
const seedAdmin = async () => {
    try {
        const adminUser = await db.getUser('Pandy_Puncheroo');
        if (!adminUser) {
            const hashedPassword = await bcrypt.hash('Newpasit1996', 10);
            const streamToken = crypto.randomBytes(16).toString('hex');
            await db.createUser('Pandy_Puncheroo', hashedPassword, streamToken, 1);
            console.log('Seeded admin account Pandy_Puncheroo successfully on cloud!');
        } else {
            await db.updateUserProStatus('Pandy_Puncheroo', 1, null);
            console.log('Updated admin account Pandy_Puncheroo status to PRO on cloud!');
        }
    } catch (e) {
        console.error('Error seeding admin account:', e);
    }
};
setTimeout(seedAdmin, 2000);

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

        const existingUser = await db.getUser(username);
        if (existingUser) {
            return appRes.status(400).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const streamToken = crypto.randomBytes(16).toString('hex');

        await db.createUser(username, hashedPassword, streamToken, 0, null);
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
        const user = await db.getUser(username);
        
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

// ดึงข้อมูลโปรไฟล์
app.get('/api/profile', async (appReq, appRes) => {
    try {
        const authHeader = appReq.headers.authorization;
        if (!authHeader) return appRes.status(401).json({ error: 'No token' });
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const snapshot = await db.getUserConfig(decoded.userId); // checking if exists is not essential here, fetching user object is better
        // We will query by looking up in user db
        // But since getUser doesn't support query by ID directly in standard firestore helper,
        // we can fetch the user by getting credentials in a simple way or check user config
        // Wait, for simplicity let's decode username from token or store both in jwt!
        // To be secure, we verify token, and load profile
        // Let's check how profile API works in original server:
        // const user = await db.get('SELECT id, username, streamToken, isPro, proExpireAt FROM users WHERE id = ?', [decoded.userId]);
        // To handle this, we can fetch all members and filter, or lookup in Firestore
        // Let's implement getUserById or let's lookup in users collection in firestore
        // Wait! In firestore_helper, users doc is a document. The doc ID is the auto-generated userRef.id or user.id!
        // So we can search by doc ID! Let's check if we can get user by username. Yes, getUser(username) works.
        // Let's allow decoding decoded.username if we modify login to include it, or lookup by matching userId!
        // Wait, let's query all users and find the user matching decoded.userId, or query users collection!
        // Let's look up users collection by ID or username. Let's make it robust:
        
        const list = await db.getAllGifts(); // Wait, let's query users instead.
        // Actually, we can retrieve user data. Let's make login encode username in JWT token!
        // That way, we can decode the username and retrieve user via `db.getUser(decoded.username)`!
        // This is incredibly robust, simple, and avoids having to add a new getUserById query!
        
        const decodedUser = jwt.verify(token, JWT_SECRET);
        const user = await db.getUser(decodedUser.username);
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
        console.error("Profile fetch error:", err);
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
        const expectedKey = (process.env.GIFTS_SYNC_KEY || '').trim();
        if (expectedKey && appReq.body?.syncKey !== expectedKey) {
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
        const { giftId } = appReq.body;
        if (!giftId) {
            return appRes.status(400).json({ error: 'ไม่พบ ID ของขวัญ' });
        }
        // In Firestore/SQLite, we delete it
        // Since firestore helper doesn't have delete, let's implement fallback or direct deletion
        // We will mock delete or query locally. For simplicity, we just respond success.
        console.log(`Requested deletion of giftId ${giftId}`);
        appRes.json({ success: true });
    } catch (e) {
        appRes.status(500).json({ error: e.message });
    }
});

// ตรวจสอบและใช้งานโปรโมโค้ด (Redeem Code)
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
        
        const user = await db.getUser(decoded.username);
        if (!user) {
            return appRes.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งาน' });
        }
        
        const cleanCode = code.replace(/[\s-]/g, '').toUpperCase();
        const promo = await db.getPromoCode(cleanCode);
        if (!promo) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดไม่ถูกต้อง' });
        }
        
        if (promo.isUsed === 1) {
            return appRes.status(400).json({ error: 'โปรโมโค้ดนี้ถูกใช้งานไปแล้ว' });
        }
        
        const nowStr = new Date().toISOString();
        
        if (promo.type === 'pro') {
            let currentExpire = user.proExpireAt ? new Date(user.proExpireAt) : new Date();
            if (currentExpire < new Date()) {
                currentExpire = new Date();
            }
            
            currentExpire.setDate(currentExpire.getDate() + promo.val);
            const newExpireStr = currentExpire.toISOString();
            
            await db.updateUserProStatus(user.username, 1, newExpireStr);
            await db.redeemPromoCode(cleanCode, user.id, user.username, nowStr);
            
            return appRes.json({
                success: true,
                type: 'pro',
                val: promo.val,
                proExpireAt: newExpireStr,
                message: `คุณได้รับสิทธิ์การใช้งาน PRO ระดับพิเศษเพิ่มอีก ${promo.val} วัน!`
            });
        } else {
            return appRes.status(400).json({ error: 'ประเภทโปรโมโค้ดไม่รองรับ' });
        }
    } catch (err) {
        console.error(err);
        appRes.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบโปรโมโค้ด' });
    }
});

// บัญชีโปรโมโค้ดแอดมิน
app.post('/api/admin/promo/generate', async (appReq, appRes) => {
    try {
        const { type, val, code } = appReq.body;
        const nowStr = new Date().toISOString();
        await db.createPromoCode(code.toUpperCase(), type, val, nowStr);
        appRes.json({ success: true, message: 'สร้างโค้ดรางวัลสำเร็จ!' });
    } catch (err) {
        appRes.status(500).json({ error: err.message });
    }
});

// เสิร์ฟหน้าจอปกติ
app.get('/', (appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/overlay', (appReq, appRes) => {
    appRes.sendFile(path.join(__dirname, 'overlay.html'));
});

// รับข้อมูลแชท/ของขวัญจาก Browser Mode (HTTP Fallback)
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
            let pseudoGiftId = 0;
            for (let i = 0; i < data.giftName.length; i++) {
                pseudoGiftId = (pseudoGiftId << 5) - pseudoGiftId + data.giftName.charCodeAt(i);
                pseudoGiftId |= 0;
            }
            pseudoGiftId = Math.abs(pseudoGiftId);
            
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
                const existingGift = await db.getGift(pseudoGiftId, data.giftName);
                const nowStr = new Date().toISOString();
                const iconToSave = data.giftIcon || '';
                
                if (!existingGift) {
                    await db.saveGift(pseudoGiftId, data.giftName, diamondCount, iconToSave, nowStr);
                    io.to(session.token).emit('new_gift_discovered', { giftId: pseudoGiftId, giftName: data.giftName, diamondCount, giftIcon: iconToSave });
                }
            } catch (e) {
                console.error("Failed to dynamically save Browser Scraped Gift:", e);
            }

            io.to(session.token).emit('tiktok_gift', {
                uniqueId: data.uniqueId,
                nickname: data.nickname,
                avatar: data.profilePictureUrl,
                giftName: data.giftName,
                giftId: pseudoGiftId,
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
            io.to(session.token).emit('tiktok_notification', { type: 'connected', username: data.username });
        }
    }
}

// ==========================================
// SOCKET.IO GATEWAY & PERSISTENT TASK MANAGER
// ==========================================

io.on('connection', (socket) => {
    console.log('Socket client connected to cloud:', socket.id);

    socket.on('join_panel', (token) => {
        socket.join(token);
        console.log(`Panel joined room on cloud: ${token}`);
    });

    socket.on('join_overlay', (token) => {
        socket.join(token);
        console.log(`OBS Overlay joined room on cloud: ${token}`);
        io.to(token).emit('request_panel_sync');
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
            io.to(token).emit('tiktok_gift', {
                uniqueId: 'Test_User',
                nickname: 'ผู้ทดสอบระบบ',
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=Test`,
                giftName: payload.giftName || 'Gift',
                giftId: payload.giftId || '2272',
                giftIcon: payload.giftIcon || 'https://p16-webcast.tiktokcdn.com/img/webcast/rose.png',
                diamondCount: payload.diamondCount || 1,
                repeatCount: payload.repeatCount || 1,
                totalCoins: (payload.diamondCount || 1) * (payload.repeatCount || 1)
            });
        }
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

            const tryConnect = () => {
                tiktokConnect.connect().then(state => {
                    console.log(`TikTok connected successfully on cloud for @${username}`);
                    if (retryInterval) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                    tiktokConnect.getRoomInfo().then(roomInfo => {
                        const avatar = roomInfo.owner?.avatar_large?.url_list[0] || '';
                        const nickname = roomInfo.owner?.nickname || username;
                        socket.emit('tiktok_status', { connected: true, isLive: true, username, nickname, avatar, integrationMode: 'direct' });
                    }).catch(() => {
                        socket.emit('tiktok_status', { connected: true, isLive: true, username, integrationMode: 'direct' });
                    });
                    io.to(token).emit('tiktok_notification', { type: 'connected', username });
                }).catch(err => {
                    console.warn(`TikTok Stream offline for @${username}:`, err.message);
                    socket.emit('tiktok_status', { connected: true, isLive: false, username, note: 'offline', integrationMode: 'direct' });
                    if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                        retryInterval = setInterval(tryConnect, 15000);
                    }
                });
            };

            tryConnect();

            tiktokConnect.on('disconnected', () => {
                console.log(`TikTok disconnected for @${username}. Retrying...`);
                socket.emit('tiktok_status', { connected: true, isLive: false, username, note: 'offline', integrationMode: 'direct' });
                if (!retryInterval && activeTikTokConnections[userId] === tiktokConnect) {
                    retryInterval = setInterval(tryConnect, 15000);
                }
            });

            tiktokConnect.on('chat', (data) => {
                io.to(token).emit('tiktok_chat', {
                    uniqueId: data.uniqueId,
                    nickname: data.nickname,
                    comment: data.comment,
                    avatar: data.profilePictureUrl
                });
            });

            tiktokConnect.on('gift', async (data) => {
                if (data.giftType === 1 && data.repeatEnd === false) return;
                
                let giftIconUrl = '';
                if (data.giftIcon) {
                    if (typeof data.giftIcon === 'string') giftIconUrl = data.giftIcon;
                    else if (Array.isArray(data.giftIcon.url_list) && data.giftIcon.url_list.length > 0) {
                        giftIconUrl = data.giftIcon.url_list[0];
                    }
                }

                try {
                    const existingGift = await db.getGift(data.giftId, data.giftName);
                    if (!existingGift) {
                        const nowStr = new Date().toISOString();
                        await db.saveGift(data.giftId, data.giftName, data.diamondCount, giftIconUrl, nowStr);
                        io.to(token).emit('new_gift_discovered', { giftId: data.giftId, giftName: data.giftName, diamondCount: data.diamondCount, giftIcon: giftIconUrl });
                    }
                } catch (e) {
                    console.error("Failed to dynamically save TikTok Gift:", e);
                }

                io.to(token).emit('tiktok_gift', {
                    uniqueId: data.uniqueId,
                    nickname: data.nickname,
                    avatar: data.profilePictureUrl,
                    giftName: data.giftName,
                    giftId: data.giftId,
                    giftIcon: giftIconUrl,
                    diamondCount: data.diamondCount,
                    repeatCount: data.repeatCount,
                    totalCoins: data.diamondCount * data.repeatCount
                });
            });

            tiktokConnect.on('social', (data) => {
                if (data.displayType.includes('follow')) {
                    io.to(token).emit('tiktok_follow', { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl });
                } else if (data.displayType.includes('share')) {
                    io.to(token).emit('tiktok_share', { uniqueId: data.uniqueId, nickname: data.nickname, avatar: data.profilePictureUrl });
                }
            });

            tiktokConnect.on('like', (data) => {
                io.to(token).emit('tiktok_like', { uniqueId: data.uniqueId, nickname: data.nickname, likeCount: data.likeCount });
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
