const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// กำหนดพาธของฐานข้อมูลให้อยู่ในโฟลเดอร์เก็บข้อมูล AppData ของผู้ใช้ เพื่อให้เขียนไฟล์ได้จริงและไม่สูญหายเมื่อปิดโปรแกรม
let dbPath;
try {
    const { app } = require('electron');
    if (app) {
        dbPath = path.join(app.getPath('userData'), 'database.db');
        console.log(`Using Electron persistent DB path: ${dbPath}`);
    } else {
        dbPath = path.join(__dirname, 'database.db');
    }
} catch (e) {
    dbPath = path.join(__dirname, 'database.db');
}
const db = new sqlite3.Database(dbPath);

// สร้างตารางข้อมูลเริ่มต้น
let readyResolve;
const whenReady = new Promise((resolve) => { readyResolve = resolve; });

function runMigrations(done) {
    db.all('PRAGMA table_info(users)', (err, cols) => {
        if (err) return done(err);
        const names = new Set((cols || []).map((c) => c.name));
        const alters = [];
        if (!names.has('createdAt')) alters.push("ALTER TABLE users ADD COLUMN createdAt TEXT");
        if (!names.has('oauthProvider')) alters.push("ALTER TABLE users ADD COLUMN oauthProvider TEXT");
        if (!names.has('oauthId')) alters.push("ALTER TABLE users ADD COLUMN oauthId TEXT");
        if (!names.has('email')) alters.push("ALTER TABLE users ADD COLUMN email TEXT");
        if (!names.has('displayName')) alters.push("ALTER TABLE users ADD COLUMN displayName TEXT");
        if (!names.has('avatarUrl')) alters.push("ALTER TABLE users ADD COLUMN avatarUrl TEXT");
        if (!names.has('openId')) alters.push('ALTER TABLE users ADD COLUMN openId TEXT');
        if (!names.has('role')) alters.push("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'free'");
        if (!names.has('proScopes')) alters.push('ALTER TABLE users ADD COLUMN proScopes TEXT');
        if (!names.has('entitlements')) alters.push('ALTER TABLE users ADD COLUMN entitlements TEXT');
        if (!names.has('emailVerified')) alters.push('ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0');
        if (!names.has('emailVerifyToken')) alters.push('ALTER TABLE users ADD COLUMN emailVerifyToken TEXT');
        if (!names.has('emailVerifyCode')) alters.push('ALTER TABLE users ADD COLUMN emailVerifyCode TEXT');
        if (!names.has('emailVerifyExpires')) alters.push('ALTER TABLE users ADD COLUMN emailVerifyExpires TEXT');
        if (!names.has('passwordResetToken')) alters.push('ALTER TABLE users ADD COLUMN passwordResetToken TEXT');
        if (!names.has('passwordResetExpires')) alters.push('ALTER TABLE users ADD COLUMN passwordResetExpires TEXT');

        let i = 0;
        const next = (alterErr) => {
            if (alterErr && !/duplicate column/i.test(String(alterErr.message || alterErr))) {
                return done(alterErr);
            }
            if (i >= alters.length) {
                if (!names.has('openId')) {
                    const nanoid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
                    db.all("SELECT id FROM users WHERE openId IS NULL OR openId = ''", (e2, rows) => {
                        if (!e2 && rows) {
                            rows.forEach((row) => {
                                db.run('UPDATE users SET openId = ? WHERE id = ?', [nanoid() + nanoid(), row.id]);
                            });
                        }
                        done();
                    });
                    return;
                }
                return done();
            }
            db.run(alters[i++], next);
        };
        next();
    });
}

/** Cloud user ids are strings — spotify_tokens must use TEXT keys */
function migrateSpotifyTokensToText(done) {
    db.all('PRAGMA table_info(spotify_tokens)', (err, cols) => {
        if (err) return done(err);
        if (!cols || !cols.length) return done();

        const userIdCol = cols.find((c) => c.name === 'userId');
        if (!userIdCol) return done();

        const type = String(userIdCol.type || '').toUpperCase();
        const needsMigrate = type !== 'TEXT' && type !== '';

        const finishMigrate = () => {
            // Probe: Cloud/Firestore ids are non-numeric strings — INTEGER column throws SQLITE_MISMATCH
            db.run(
                `INSERT INTO spotify_tokens (userId, accessToken, updatedAt)
                 VALUES ('__schema_probe__', 'x', datetime('now'))`,
                (probeErr) => {
                    if (probeErr && /datatype mismatch/i.test(String(probeErr.message || probeErr))) {
                        return runSpotifyTokensTableSwap(done);
                    }
                    if (!probeErr) {
                        db.run("DELETE FROM spotify_tokens WHERE userId = '__schema_probe__'");
                    }
                    if (needsMigrate) return runSpotifyTokensTableSwap(done);
                    done();
                }
            );
        };

        if (needsMigrate) return runSpotifyTokensTableSwap(done);
        finishMigrate();
    });
}

function runSpotifyTokensTableSwap(done) {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS spotify_tokens_text (
                userId TEXT PRIMARY KEY,
                accessToken TEXT NOT NULL,
                refreshToken TEXT,
                expiresAt INTEGER,
                scope TEXT,
                updatedAt TEXT
            )
        `);
        db.run(`
            INSERT OR IGNORE INTO spotify_tokens_text (userId, accessToken, refreshToken, expiresAt, scope, updatedAt)
            SELECT CAST(userId AS TEXT), accessToken, refreshToken, expiresAt, scope, updatedAt
            FROM spotify_tokens
        `, (copyErr) => {
            if (copyErr) {
                console.error('[database] spotify_tokens migrate copy:', copyErr);
                return done(copyErr);
            }
            db.run('DROP TABLE IF EXISTS spotify_tokens', (dropErr) => {
                if (dropErr) return done(dropErr);
                db.run('ALTER TABLE spotify_tokens_text RENAME TO spotify_tokens', (renameErr) => {
                    if (renameErr) return done(renameErr);
                    console.log('[database] Migrated spotify_tokens.userId to TEXT for Cloud auth');
                    done();
                });
            });
        });
    });
}

let spotifySchemaReady = false;
function ensureSpotifyTokensSchema() {
    if (spotifySchemaReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
        migrateSpotifyTokensToText((err) => {
            if (err) reject(err);
            else {
                spotifySchemaReady = true;
                resolve();
            }
        });
    });
}

db.serialize(() => {
    // ตารางผู้ใช้งาน
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            streamToken TEXT UNIQUE NOT NULL,
            isPro INTEGER DEFAULT 0,
            proExpireAt TEXT,
            role TEXT DEFAULT 'free'
        )
    `);

    runMigrations((migrationErr) => {
        if (migrationErr) console.error('[database] migration error:', migrationErr);
        db.run(`
            CREATE TABLE IF NOT EXISTS spotify_tokens (
                userId TEXT PRIMARY KEY,
                accessToken TEXT NOT NULL,
                refreshToken TEXT,
                expiresAt INTEGER,
                scope TEXT,
                updatedAt TEXT
            )
        `, (createErr) => {
            if (createErr) console.error('[database] spotify_tokens create:', createErr);
            migrateSpotifyTokensToText((migErr) => {
                if (migErr) console.error('[database] spotify_tokens migrate:', migErr);
                spotifySchemaReady = !migErr;
                readyResolve();
            });
        });
    });

    // ตารางบันทึกการตั้งค่าตู้สุ่มและของขวัญของผู้ใช้แต่ละคน
    db.run(`
        CREATE TABLE IF NOT EXISTS user_configs (
            userId INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ตารางบันทึกรหัสของขวัญ (Promo Codes)
    db.run(`
        CREATE TABLE IF NOT EXISTS promo_codes (
            code TEXT PRIMARY KEY,
            type TEXT NOT NULL, -- 'coin' หรือ 'pro'
            val INTEGER NOT NULL, -- จำนวนเหรียญ หรือ จำนวนวัน
            isUsed INTEGER DEFAULT 0,
            usedBy INTEGER,
            usedByName TEXT,
            usedAt TEXT,
            createdAt TEXT,
            FOREIGN KEY (usedBy) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // spotify_tokens สร้าง/ migrate ก่อน readyResolve() ด้านบนแล้ว

    // ตารางบันทึกรายชื่อของขวัญ TikTok ที่ถูกตรวจพบ
    db.run(`
        CREATE TABLE IF NOT EXISTS tiktok_gifts (
            giftId INTEGER PRIMARY KEY,
            giftName TEXT NOT NULL,
            diamondCount INTEGER,
            giftIcon TEXT,
            createdAt TEXT
        )
    `, () => {
        // ล้างข้อมูลเพื่อเริ่มต้นใหม่เพียงครั้งเดียว (One-time database cleanup)
        // เพื่อลบข้อมูลโปรไฟล์ผู้ใช้ที่ดักจับผิดพลาดออกไปทั้งหมดก่อนหน้านี้
        try {
            const markerPath = path.join(dbPath ? path.dirname(dbPath) : __dirname, '.db_cleaned_v3_marker');
            if (!fs.existsSync(markerPath)) {
                db.run('DELETE FROM tiktok_gifts');
                fs.writeFileSync(markerPath, 'cleaned');
                console.log("One-time database cleanup performed successfully.");
            }
        } catch (e) {
            console.error("One-time cleanup error:", e);
        }
    });

    // ตารางประกาศจากแอดมิน
    db.run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            imageUrl TEXT,
            important INTEGER DEFAULT 0,
            category TEXT DEFAULT 'notice',
            summary TEXT,
            ctaLabel TEXT,
            ctaUrl TEXT,
            contentHtml TEXT,
            ctaButtons TEXT,
            status TEXT DEFAULT 'published',
            audience TEXT DEFAULT 'all',
            audienceConfig TEXT,
            publishAt TEXT,
            expireAt TEXT,
            timezone TEXT DEFAULT 'Asia/Bangkok',
            displayHome INTEGER DEFAULT 1,
            showNotification INTEGER DEFAULT 1,
            pinned INTEGER DEFAULT 0,
            showPopup INTEGER DEFAULT 0,
            displayType TEXT DEFAULT 'notice',
            announcementType TEXT DEFAULT 'notice',
            priority INTEGER DEFAULT 0,
            locale TEXT DEFAULT 'th',
            popupConfig TEXT,
            archivedAt TEXT,
            updatedAt TEXT,
            views INTEGER DEFAULT 0,
            reads INTEGER DEFAULT 0,
            reactions INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            ctaClicks INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            createdBy TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS announcement_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            announcementId INTEGER NOT NULL,
            action TEXT NOT NULL,
            oldValue TEXT,
            newValue TEXT,
            changedBy TEXT,
            createdAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS announcement_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            announcementId INTEGER NOT NULL,
            userId TEXT,
            eventType TEXT NOT NULL,
            createdAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS announcement_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'notice',
            displayType TEXT DEFAULT 'popup',
            previewImage TEXT,
            configJson TEXT,
            isDefault INTEGER DEFAULT 0,
            createdBy TEXT,
            createdAt TEXT NOT NULL
        )
    `);

    // ตั้งค่าโดเนทตรงเข้าสตรีมเมอร์ (PromptPay + OBS overlay)
    db.run(`
        CREATE TABLE IF NOT EXISTS streamer_settings (
            user_id INTEGER PRIMARY KEY,
            donation_slug TEXT UNIQUE NOT NULL,
            overlay_key TEXT UNIQUE NOT NULL,
            promptpay_id TEXT,
            account_name TEXT,
            bank_code TEXT,
            min_donation REAL DEFAULT 10,
            min_tts_amount REAL DEFAULT 20,
            goal_amount REAL DEFAULT 1000,
            goal_label TEXT DEFAULT 'เป้าหมายเดือนนี้',
            slipok_branch_id TEXT,
            slipok_api_key TEXT,
            page_views INTEGER DEFAULT 0,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.all('PRAGMA table_info(streamer_settings)', (err, cols) => {
        if (err || !cols) return;
        const names = new Set(cols.map((c) => c.name));
        if (!names.has('page_views')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN page_views INTEGER DEFAULT 0');
        }
        if (!names.has('bio')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN bio TEXT DEFAULT ""');
        }
        if (!names.has('social_youtube')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN social_youtube TEXT DEFAULT ""');
        }
        if (!names.has('social_tiktok')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN social_tiktok TEXT DEFAULT ""');
        }
        if (!names.has('social_facebook')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN social_facebook TEXT DEFAULT ""');
        }
        if (!names.has('social_discord')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN social_discord TEXT DEFAULT ""');
        }
        if (!names.has('page_online')) {
            db.run('ALTER TABLE streamer_settings ADD COLUMN page_online INTEGER DEFAULT 1');
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS donations (
            id TEXT PRIMARY KEY,
            streamer_id INTEGER NOT NULL,
            donor_name TEXT DEFAULT 'ผู้ไม่ประสงค์ออกนาม',
            amount REAL NOT NULL,
            message TEXT,
            slip_url TEXT,
            trans_ref TEXT UNIQUE,
            verification_status TEXT NOT NULL DEFAULT 'pending',
            reject_reason TEXT,
            is_alerted INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (streamer_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS youtube_live_settings (
            userId TEXT PRIMARY KEY,
            youtube_identifier TEXT DEFAULT '',
            channel_id TEXT DEFAULT '',
            channel_title TEXT DEFAULT '',
            is_enabled INTEGER DEFAULT 0,
            stream_token TEXT DEFAULT '',
            updated_at TEXT
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_donations_streamer_created ON donations(streamer_id, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(verification_status)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ownerId TEXT NOT NULL,
            friendUserId TEXT NOT NULL,
            friendUsername TEXT NOT NULL,
            friendDisplayName TEXT,
            friendAvatarUrl TEXT,
            createdAt TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fromUserId TEXT NOT NULL,
            fromUsername TEXT NOT NULL,
            fromDisplayName TEXT,
            fromAvatarUrl TEXT,
            toUserId TEXT NOT NULL,
            toUsername TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            createdAt TEXT NOT NULL
        )
    `);

    // Gaming social profiles. Authentication secrets remain in users; public-facing
    // data is deliberately stored separately so it can be safely allowlisted.
    db.run(`
        CREATE TABLE IF NOT EXISTS user_profiles (
            userId TEXT PRIMARY KEY,
            coverUrl TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            rank TEXT DEFAULT '',
            lastActive TEXT,
            followersCount INTEGER DEFAULT 0,
            followingCount INTEGER DEFAULT 0,
            friendsCount INTEGER DEFAULT 0,
            achievementsCount INTEGER DEFAULT 0,
            streamsCount INTEGER DEFAULT 0,
            country TEXT DEFAULT '',
            province TEXT DEFAULT '',
            languages TEXT DEFAULT '',
            contentTypes TEXT DEFAULT '',
            streamGear TEXT DEFAULT '',
            updatedAt TEXT NOT NULL
        )
    `);
    db.all('PRAGMA table_info(user_profiles)', (err, cols) => {
        if (err || !Array.isArray(cols)) return;
        const names = new Set(cols.map((c) => c.name));
        const alters = [];
        if (!names.has('country')) alters.push("ALTER TABLE user_profiles ADD COLUMN country TEXT DEFAULT ''");
        if (!names.has('province')) alters.push("ALTER TABLE user_profiles ADD COLUMN province TEXT DEFAULT ''");
        if (!names.has('languages')) alters.push("ALTER TABLE user_profiles ADD COLUMN languages TEXT DEFAULT ''");
        if (!names.has('contentTypes')) alters.push("ALTER TABLE user_profiles ADD COLUMN contentTypes TEXT DEFAULT ''");
        if (!names.has('streamGear')) alters.push("ALTER TABLE user_profiles ADD COLUMN streamGear TEXT DEFAULT ''");
        alters.forEach((sql) => db.run(sql));
    });
    db.run(`
        CREATE TABLE IF NOT EXISTS profile_privacy (
            userId TEXT PRIMARY KEY,
            profileVisibility TEXT DEFAULT 'public',
            socialVisibility TEXT DEFAULT 'public',
            achievementsVisibility TEXT DEFAULT 'public',
            streamsVisibility TEXT DEFAULT 'public',
            activityVisibility TEXT DEFAULT 'public',
            dmPermission TEXT DEFAULT 'friends',
            updatedAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS social_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            platform TEXT NOT NULL,
            handle TEXT DEFAULT '',
            url TEXT DEFAULT '',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            UNIQUE(userId, platform)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            iconUrl TEXT DEFAULT '',
            icon TEXT DEFAULT 'workspace_premium',
            points INTEGER DEFAULT 0,
            triggerType TEXT DEFAULT 'manual',
            triggerValue REAL DEFAULT 0,
            triggerUnit TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        )
    `);
    db.all('PRAGMA table_info(achievements)', (err, cols) => {
        if (err || !Array.isArray(cols)) return;
        const names = new Set(cols.map((c) => c.name));
        const alters = [];
        if (!names.has('icon')) alters.push("ALTER TABLE achievements ADD COLUMN icon TEXT DEFAULT 'workspace_premium'");
        if (!names.has('triggerType')) alters.push("ALTER TABLE achievements ADD COLUMN triggerType TEXT DEFAULT 'manual'");
        if (!names.has('triggerValue')) alters.push('ALTER TABLE achievements ADD COLUMN triggerValue REAL DEFAULT 0');
        if (!names.has('triggerUnit')) alters.push("ALTER TABLE achievements ADD COLUMN triggerUnit TEXT DEFAULT ''");
        if (!names.has('active')) alters.push('ALTER TABLE achievements ADD COLUMN active INTEGER DEFAULT 1');
        if (!names.has('updatedAt')) alters.push('ALTER TABLE achievements ADD COLUMN updatedAt TEXT');
        alters.forEach((sql) => db.run(sql));
    });
    db.run(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            userId TEXT NOT NULL,
            achievementId TEXT NOT NULL,
            progress INTEGER DEFAULT 100,
            unlockedAt TEXT,
            PRIMARY KEY (userId, achievementId)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS profile_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            details TEXT DEFAULT '',
            metadata TEXT,
            createdAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS stream_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            game TEXT DEFAULT '',
            platform TEXT DEFAULT '',
            startedAt TEXT,
            endedAt TEXT,
            durationSeconds INTEGER DEFAULT 0,
            peakViewers INTEGER DEFAULT 0,
            totalViews INTEGER DEFAULT 0,
            thumbnailUrl TEXT DEFAULT '',
            createdAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            blockerId TEXT NOT NULL,
            blockedId TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            PRIMARY KEY (blockerId, blockedId)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS user_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporterId TEXT NOT NULL,
            reportedId TEXT NOT NULL,
            reason TEXT NOT NULL,
            details TEXT DEFAULT '',
            status TEXT DEFAULT 'open',
            createdAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS dm_conversations (
            id TEXT PRIMARY KEY,
            participantA TEXT NOT NULL,
            participantB TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            lastMessageAt TEXT,
            UNIQUE(participantA, participantB)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS dm_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversationId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            body TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            readAt TEXT
        )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_profile_activity_user_created ON profile_activity(userId, createdAt DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_stream_summaries_user_created ON stream_summaries(userId, createdAt DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reportedId, createdAt DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON dm_messages(conversationId, createdAt DESC)`);

    // ตารางรูปทรงโหล (Gift Jar) ที่แอดมินออกแบบเอง — เผยแพร่ให้ผู้ใช้ทุกคนเลือกใช้
    db.run(`
        CREATE TABLE IF NOT EXISTS jar_custom_shapes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            points TEXT NOT NULL,
            fillLimitRel REAL,
            bounceMode TEXT,
            createdBy TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT
        )
    `);

    // AE presets ที่แอดมินเผยแพร่ให้ผู้ใช้ Apply
    db.run(`
        CREATE TABLE IF NOT EXISTS ae_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            coverUrl TEXT,
            payload TEXT NOT NULL,
            createdBy TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )
    `);

    // migration: proScopes สำหรับ promo_codes
    db.all('PRAGMA table_info(promo_codes)', (err, cols) => {
        if (err || !cols) return;
        if (!cols.some((c) => c.name === 'proScopes')) {
            db.run('ALTER TABLE promo_codes ADD COLUMN proScopes TEXT');
        }
    });

    db.all('PRAGMA table_info(announcements)', (err, cols) => {
        if (err || !cols) return;
        if (!cols.some((c) => c.name === 'imageUrl')) {
            db.run('ALTER TABLE announcements ADD COLUMN imageUrl TEXT');
        }
        if (!cols.some((c) => c.name === 'category')) {
            db.run("ALTER TABLE announcements ADD COLUMN category TEXT DEFAULT 'notice'");
        }
        if (!cols.some((c) => c.name === 'summary')) {
            db.run('ALTER TABLE announcements ADD COLUMN summary TEXT');
        }
        if (!cols.some((c) => c.name === 'ctaLabel')) {
            db.run('ALTER TABLE announcements ADD COLUMN ctaLabel TEXT');
        }
        if (!cols.some((c) => c.name === 'ctaUrl')) {
            db.run('ALTER TABLE announcements ADD COLUMN ctaUrl TEXT');
        }
        const additions = [
            ['contentHtml', 'TEXT'],
            ['ctaButtons', 'TEXT'],
            ['status', "TEXT DEFAULT 'published'"],
            ['audience', "TEXT DEFAULT 'all'"],
            ['audienceConfig', 'TEXT'],
            ['publishAt', 'TEXT'],
            ['expireAt', 'TEXT'],
            ['timezone', "TEXT DEFAULT 'Asia/Bangkok'"],
            ['displayHome', 'INTEGER DEFAULT 1'],
            ['showNotification', 'INTEGER DEFAULT 1'],
            ['pinned', 'INTEGER DEFAULT 0'],
            ['showPopup', 'INTEGER DEFAULT 0'],
            ['archivedAt', 'TEXT'],
            ['updatedAt', 'TEXT'],
            ['views', 'INTEGER DEFAULT 0'],
            ['reads', 'INTEGER DEFAULT 0'],
            ['reactions', 'INTEGER DEFAULT 0'],
            ['shares', 'INTEGER DEFAULT 0'],
            ['ctaClicks', 'INTEGER DEFAULT 0'],
            ['displayType', "TEXT DEFAULT 'notice'"],
            ['announcementType', "TEXT DEFAULT 'notice'"],
            ['priority', 'INTEGER DEFAULT 0'],
            ['locale', "TEXT DEFAULT 'th'"],
            ['popupConfig', 'TEXT']
        ];
        additions.forEach(([name, type]) => {
            if (!cols.some((c) => c.name === name)) {
                db.run(`ALTER TABLE announcements ADD COLUMN ${name} ${type}`);
            }
        });
    });

    // migration: เพิ่มคอลัมน์รูปโหล + การตั้งค่า 3D ให้ตาราง jar_custom_shapes
    db.all("PRAGMA table_info(jar_custom_shapes)", (err, cols) => {
        if (err || !cols) return;
        if (!cols.some(c => c.name === 'jarImage')) {
            db.run("ALTER TABLE jar_custom_shapes ADD COLUMN jarImage TEXT");
        }
        if (!cols.some(c => c.name === 'config3d')) {
            db.run("ALTER TABLE jar_custom_shapes ADD COLUMN config3d TEXT");
        }
    });

    // ตารางออเดอร์ชำระเงินซื้อ PRO (PromptPay)
    db.run(`
        CREATE TABLE IF NOT EXISTS payment_orders (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            username TEXT NOT NULL,
            planId TEXT NOT NULL,
            days INTEGER NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            qrPayload TEXT,
            slipRef TEXT,
            slipMeta TEXT,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            paidAt TEXT
        )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_payment_orders_slip ON payment_orders(slipRef)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(createdAt)`);

    // ตารางรายงานบัค / ข้อเสนอแนะจากผู้ใช้
    db.run(`
        CREATE TABLE IF NOT EXISTS bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            username TEXT NOT NULL,
            category TEXT DEFAULT 'bug',
            message TEXT NOT NULL,
            screenshotAssetId TEXT,
            appVersion TEXT,
            status TEXT DEFAULT 'open',
            adminNote TEXT,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.all('PRAGMA table_info(bug_reports)', (err, cols) => {
        if (err) return;
        const names = new Set((cols || []).map((c) => c.name));
        const extra = [
            ['displayName', 'TEXT'],
            ['title', 'TEXT'],
            ['location', 'TEXT'],
            ['frequency', 'TEXT'],
            ['priority', "TEXT DEFAULT 'medium'"],
            ['assignedTo', 'TEXT'],
            ['assignedName', 'TEXT'],
            ['attachments', 'TEXT'],
            ['systemInfo', 'TEXT'],
            ['activity', 'TEXT'],
            ['updatedAt', 'TEXT']
        ];
        extra.forEach(([col, type]) => {
            if (!names.has(col)) db.run(`ALTER TABLE bug_reports ADD COLUMN ${col} ${type}`);
        });
    });

    // ตารางบันทึกความจำของ AI Chatbot แบบส่วนกลางเคลื่อนย้ายได้ (Shared Global Memories)
    db.run("SELECT userId FROM ai_memories LIMIT 1", (err) => {
        if (!err) {
            console.log("Migrating older ai_memories table to global schema...");
            db.run("DROP TABLE ai_memories", () => {
                db.run(`
                    CREATE TABLE IF NOT EXISTS ai_memories (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        keyword TEXT NOT NULL UNIQUE,
                        content TEXT NOT NULL,
                        createdAt TEXT
                    )
                `);
            });
        } else {
            db.run(`
                CREATE TABLE IF NOT EXISTS ai_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword TEXT NOT NULL UNIQUE,
                    content TEXT NOT NULL,
                    createdAt TEXT
                )
            `);
        }
    });
});

// ฟังก์ชั่น Helper สำหรับรัน Query และใช้ Promise
const dbQuery = {
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

dbQuery.whenReady = whenReady;
dbQuery.ensureSpotifyTokensSchema = ensureSpotifyTokensSchema;

dbQuery.getUser = (username) => dbQuery.get('SELECT * FROM users WHERE username = ?', [username]);
dbQuery.getUserById = (id) => dbQuery.get('SELECT * FROM users WHERE id = ?', [id]);
dbQuery.findUserByEmail = (email) => dbQuery.get('SELECT * FROM users WHERE LOWER(email) = ?', [String(email || '').trim().toLowerCase()]);
dbQuery.findUserByEmailVerifyToken = (token) => dbQuery.get('SELECT * FROM users WHERE emailVerifyToken = ?', [String(token || '').trim()]);
dbQuery.findUserByPasswordResetToken = (token) => dbQuery.get('SELECT * FROM users WHERE passwordResetToken = ?', [String(token || '').trim()]);
dbQuery.updateUserFields = async (username, fields) => {
    const allowed = ['openId', 'email', 'displayName', 'avatarUrl', 'isPro', 'proExpireAt', 'proScopes', 'entitlements', 'createdAt', 'role', 'password', 'emailVerified', 'emailVerifyToken', 'emailVerifyCode', 'emailVerifyExpires', 'passwordResetToken', 'passwordResetExpires'];
    const patch = {};
    allowed.forEach((k) => { if (fields[k] !== undefined) patch[k] = fields[k]; });
    if (!Object.keys(patch).length) return false;
    const cols = Object.keys(patch);
    await dbQuery.run(
        `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE username = ?`,
        [...cols.map((c) => patch[c]), username]
    );
    return true;
};

const PROFILE_DEFAULTS = Object.freeze({
    coverUrl: '', bio: '', level: 1, xp: 0, rank: '', lastActive: null,
    followersCount: 0, followingCount: 0, friendsCount: 0,
    achievementsCount: 0, streamsCount: 0,
    country: '', languages: '', contentTypes: '', streamGear: '', province: ''
});
const PRIVACY_DEFAULTS = Object.freeze({
    profileVisibility: 'public',
    socialVisibility: 'public',
    achievementsVisibility: 'public',
    streamsVisibility: 'public',
    activityVisibility: 'public',
    dmPermission: 'friends'
});

dbQuery.getSocialProfile = async (userId) => {
    const row = await dbQuery.get('SELECT * FROM user_profiles WHERE userId = ?', [String(userId)]);
    return { userId: String(userId), ...PROFILE_DEFAULTS, ...(row || {}) };
};

dbQuery.updateSocialProfile = async (userId, fields) => {
    const allowed = [
        'coverUrl', 'bio', 'level', 'xp', 'rank', 'lastActive', 'followersCount',
        'followingCount', 'friendsCount', 'achievementsCount', 'streamsCount',
        'country', 'province', 'languages', 'contentTypes', 'streamGear'
    ];
    const patch = {};
    allowed.forEach((key) => { if (fields[key] !== undefined) patch[key] = fields[key]; });
    const uid = String(userId);
    const now = new Date().toISOString();
    await dbQuery.run(
        'INSERT OR IGNORE INTO user_profiles (userId, updatedAt) VALUES (?, ?)',
        [uid, now]
    );
    if (Object.keys(patch).length) {
        const cols = Object.keys(patch);
        await dbQuery.run(
            `UPDATE user_profiles SET ${cols.map((key) => `${key} = ?`).join(', ')}, updatedAt = ? WHERE userId = ?`,
            [...cols.map((key) => patch[key]), now, uid]
        );
    }
    return dbQuery.getSocialProfile(uid);
};

dbQuery.getProfilePrivacy = async (userId) => {
    const row = await dbQuery.get('SELECT * FROM profile_privacy WHERE userId = ?', [String(userId)]);
    return { userId: String(userId), ...PRIVACY_DEFAULTS, ...(row || {}) };
};

dbQuery.updateProfilePrivacy = async (userId, fields) => {
    const allowed = Object.keys(PRIVACY_DEFAULTS);
    const patch = {};
    allowed.forEach((key) => { if (fields[key] !== undefined) patch[key] = fields[key]; });
    const uid = String(userId);
    const now = new Date().toISOString();
    await dbQuery.run(
        'INSERT OR IGNORE INTO profile_privacy (userId, updatedAt) VALUES (?, ?)',
        [uid, now]
    );
    if (Object.keys(patch).length) {
        const cols = Object.keys(patch);
        await dbQuery.run(
            `UPDATE profile_privacy SET ${cols.map((key) => `${key} = ?`).join(', ')}, updatedAt = ? WHERE userId = ?`,
            [...cols.map((key) => patch[key]), now, uid]
        );
    }
    return dbQuery.getProfilePrivacy(uid);
};

dbQuery.searchProfileUsers = async (query, limit = 20) => {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const needle = `%${String(query || '').trim().toLowerCase()}%`;
    return dbQuery.all(
        `SELECT id, username, displayName, avatarUrl, isPro, proExpireAt, role
         FROM users
         WHERE LOWER(username) LIKE ? OR LOWER(COALESCE(displayName, '')) LIKE ?
         ORDER BY CASE WHEN LOWER(username) = ? THEN 0 ELSE 1 END, username COLLATE NOCASE
         LIMIT ?`,
        [needle, needle, String(query || '').trim().toLowerCase(), lim]
    );
};

dbQuery.listSocialConnections = (userId) => dbQuery.all(
    'SELECT id, platform, handle, url, createdAt, updatedAt FROM social_connections WHERE userId = ? ORDER BY platform',
    [String(userId)]
);
dbQuery.upsertSocialConnection = async (userId, row) => {
    const now = new Date().toISOString();
    await dbQuery.run(
        `INSERT INTO social_connections (userId, platform, handle, url, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId, platform) DO UPDATE SET handle = excluded.handle, url = excluded.url, updatedAt = excluded.updatedAt`,
        [String(userId), row.platform, row.handle || '', row.url || '', now, now]
    );
    return dbQuery.get(
        'SELECT id, platform, handle, url, createdAt, updatedAt FROM social_connections WHERE userId = ? AND platform = ?',
        [String(userId), row.platform]
    );
};
dbQuery.deleteSocialConnection = async (userId, platform) => {
    const result = await dbQuery.run(
        'DELETE FROM social_connections WHERE userId = ? AND platform = ?',
        [String(userId), String(platform)]
    );
    return result.changes > 0;
};

dbQuery.areProfileFriends = async (aId, bId) => !!(await dbQuery.get(
    'SELECT id FROM user_friends WHERE ownerId = ? AND friendUserId = ? LIMIT 1',
    [String(aId), String(bId)]
));
dbQuery.getPendingFriendRequest = (aId, bId) => dbQuery.get(
    `SELECT * FROM friend_requests
     WHERE status = 'pending' AND ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))
     ORDER BY createdAt DESC LIMIT 1`,
    [String(aId), String(bId), String(bId), String(aId)]
);
dbQuery.listMutualFriends = (aId, bId, limit = 20) => dbQuery.all(
    `SELECT a.friendUserId AS id, u.username, u.displayName, u.avatarUrl
     FROM user_friends a
     JOIN user_friends b ON b.friendUserId = a.friendUserId AND b.ownerId = ?
     LEFT JOIN users u ON CAST(u.id AS TEXT) = a.friendUserId
     WHERE a.ownerId = ?
     ORDER BY COALESCE(u.displayName, u.username) COLLATE NOCASE LIMIT ?`,
    [String(bId), String(aId), Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)]
);

dbQuery.getBlockBetween = (aId, bId) => dbQuery.get(
    'SELECT * FROM user_blocks WHERE (blockerId = ? AND blockedId = ?) OR (blockerId = ? AND blockedId = ?) LIMIT 1',
    [String(aId), String(bId), String(bId), String(aId)]
);
dbQuery.listUserBlocks = async (userId) => dbQuery.all(
    `SELECT b.blockedId AS userId, b.createdAt, u.username, u.displayName, u.avatarUrl
     FROM user_blocks b LEFT JOIN users u ON CAST(u.id AS TEXT) = b.blockedId
     WHERE b.blockerId = ? ORDER BY b.createdAt DESC`,
    [String(userId)]
);
dbQuery.blockUser = async (blockerId, blockedId) => {
    const now = new Date().toISOString();
    await dbQuery.run(
        'INSERT OR IGNORE INTO user_blocks (blockerId, blockedId, createdAt) VALUES (?, ?, ?)',
        [String(blockerId), String(blockedId), now]
    );
    await dbQuery.run(
        'DELETE FROM user_friends WHERE (ownerId = ? AND friendUserId = ?) OR (ownerId = ? AND friendUserId = ?)',
        [String(blockerId), String(blockedId), String(blockedId), String(blockerId)]
    );
    await dbQuery.run(
        `UPDATE friend_requests SET status = 'rejected'
         WHERE status = 'pending' AND ((fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?))`,
        [String(blockerId), String(blockedId), String(blockedId), String(blockerId)]
    );
    return true;
};
dbQuery.unblockUser = async (blockerId, blockedId) => {
    const result = await dbQuery.run(
        'DELETE FROM user_blocks WHERE blockerId = ? AND blockedId = ?',
        [String(blockerId), String(blockedId)]
    );
    return result.changes > 0;
};
dbQuery.createUserReport = async (row) => {
    const createdAt = new Date().toISOString();
    const result = await dbQuery.run(
        'INSERT INTO user_reports (reporterId, reportedId, reason, details, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [String(row.reporterId), String(row.reportedId), row.reason, row.details || '', 'open', createdAt]
    );
    return { id: result.id, ...row, status: 'open', createdAt };
};

dbQuery.listUserAchievements = async (userId, limit = 100) => dbQuery.all(
    `SELECT a.id, a.name, a.description, a.iconUrl, a.icon, a.points, a.triggerType, a.triggerValue, a.triggerUnit,
            ua.progress, ua.unlockedAt
     FROM user_achievements ua JOIN achievements a ON a.id = ua.achievementId
     WHERE ua.userId = ? ORDER BY ua.unlockedAt DESC LIMIT ?`,
    [String(userId), Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200)]
);
dbQuery.listProfileAchievementCatalog = async (userId, limit = 100) => {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
    const defs = await dbQuery.listAchievementDefinitions({ includeInactive: false });
    const unlocked = await dbQuery.all(
        `SELECT achievementId, progress, unlockedAt FROM user_achievements WHERE userId = ?`,
        [String(userId)]
    );
    const byId = Object.fromEntries((unlocked || []).map((row) => [String(row.achievementId), row]));
    const catalog = (defs || []).map((def) => {
        const row = byId[String(def.id)] || {};
        const unlockedAt = row.unlockedAt || null;
        return {
            id: def.id,
            name: def.name,
            description: def.description || '',
            iconUrl: def.iconUrl || '',
            icon: def.icon || 'workspace_premium',
            points: Number(def.points) || 0,
            triggerType: def.triggerType || 'manual',
            triggerValue: Number(def.triggerValue) || 0,
            triggerUnit: def.triggerUnit || '',
            progress: Number(row.progress) || (unlockedAt ? 100 : 0),
            unlockedAt,
            unlocked: !!unlockedAt,
            locked: !unlockedAt
        };
    }).sort((a, b) => {
        if (!!a.unlockedAt !== !!b.unlockedAt) return a.unlockedAt ? -1 : 1;
        return String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || ''))
            || String(a.name || '').localeCompare(String(b.name || ''));
    });
    return catalog.slice(0, lim);
};
dbQuery.listAchievementDefinitions = async (opts = {}) => {
    const includeInactive = !!opts.includeInactive;
    const sql = includeInactive
        ? 'SELECT * FROM achievements ORDER BY createdAt DESC'
        : 'SELECT * FROM achievements WHERE COALESCE(active, 1) = 1 ORDER BY createdAt DESC';
    return dbQuery.all(sql);
};
dbQuery.getAchievementDefinition = async (id) => dbQuery.get('SELECT * FROM achievements WHERE id = ?', [String(id)]);
dbQuery.deleteAchievementDefinition = async (id) => {
    await dbQuery.run('DELETE FROM user_achievements WHERE achievementId = ?', [String(id)]);
    await dbQuery.run('DELETE FROM achievements WHERE id = ?', [String(id)]);
    return true;
};
dbQuery.listAchievementUnlocks = async (achievementId, limit = 100) => dbQuery.all(
    `SELECT ua.userId, ua.progress, ua.unlockedAt, u.username, u.displayName, u.avatarUrl
     FROM user_achievements ua
     LEFT JOIN users u ON CAST(u.id AS TEXT) = CAST(ua.userId AS TEXT)
     WHERE ua.achievementId = ? AND ua.unlockedAt IS NOT NULL
     ORDER BY ua.unlockedAt DESC
     LIMIT ?`,
    [String(achievementId), Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300)]
);
dbQuery.upsertAchievementDefinition = async (row) => {
    const now = new Date().toISOString();
    const createdAt = row.createdAt || now;
    await dbQuery.run(
        `INSERT INTO achievements (id, name, description, iconUrl, icon, points, triggerType, triggerValue, triggerUnit, active, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           iconUrl = excluded.iconUrl,
           icon = excluded.icon,
           points = excluded.points,
           triggerType = excluded.triggerType,
           triggerValue = excluded.triggerValue,
           triggerUnit = excluded.triggerUnit,
           active = excluded.active,
           updatedAt = excluded.updatedAt`,
        [
            row.id,
            row.name,
            row.description || '',
            row.iconUrl || '',
            row.icon || 'workspace_premium',
            Number(row.points) || 0,
            row.triggerType || 'manual',
            Number(row.triggerValue) || 0,
            row.triggerUnit || '',
            row.active === false || row.active === 0 ? 0 : 1,
            createdAt,
            now
        ]
    );
    return dbQuery.get('SELECT * FROM achievements WHERE id = ?', [row.id]);
};
dbQuery.upsertUserAchievement = async (userId, achievementId, fields = {}) => {
    const progress = Math.min(Math.max(Number(fields.progress) || 0, 0), 100);
    const existing = await dbQuery.get(
        'SELECT progress, unlockedAt FROM user_achievements WHERE userId = ? AND achievementId = ?',
        [String(userId), String(achievementId)]
    );
    let unlockedAt = fields.unlockedAt;
    if (unlockedAt === undefined) {
        if (existing?.unlockedAt) unlockedAt = existing.unlockedAt;
        else unlockedAt = progress >= 100 ? new Date().toISOString() : null;
    }
    await dbQuery.run(
        `INSERT INTO user_achievements (userId, achievementId, progress, unlockedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(userId, achievementId) DO UPDATE SET
           progress = excluded.progress,
           unlockedAt = COALESCE(user_achievements.unlockedAt, excluded.unlockedAt)`,
        [String(userId), String(achievementId), Math.max(progress, Number(existing?.progress) || 0), unlockedAt]
    );
    return true;
};
dbQuery.createProfileActivity = async (userId, row) => {
    const createdAt = row.createdAt || new Date().toISOString();
    const result = await dbQuery.run(
        'INSERT INTO profile_activity (userId, type, title, details, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [String(userId), row.type, row.title, row.details || '', row.metadata ? JSON.stringify(row.metadata) : null, createdAt]
    );
    return { id: result.id, userId: String(userId), ...row, createdAt };
};
dbQuery.listProfileActivity = async (userId, limit = 30, before = null) => {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    return before
        ? dbQuery.all('SELECT * FROM profile_activity WHERE userId = ? AND createdAt < ? ORDER BY createdAt DESC LIMIT ?', [String(userId), before, lim])
        : dbQuery.all('SELECT * FROM profile_activity WHERE userId = ? ORDER BY createdAt DESC LIMIT ?', [String(userId), lim]);
};
dbQuery.listStreamSummaries = async (userId, limit = 20, before = null) => {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    return before
        ? dbQuery.all('SELECT * FROM stream_summaries WHERE userId = ? AND createdAt < ? ORDER BY createdAt DESC LIMIT ?', [String(userId), before, lim])
        : dbQuery.all('SELECT * FROM stream_summaries WHERE userId = ? ORDER BY createdAt DESC LIMIT ?', [String(userId), lim]);
};
dbQuery.createStreamSummary = async (userId, row) => {
    const createdAt = row.createdAt || new Date().toISOString();
    const result = await dbQuery.run(
        `INSERT INTO stream_summaries
         (userId, title, game, platform, startedAt, endedAt, durationSeconds, peakViewers, totalViews, thumbnailUrl, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            String(userId), row.title, row.game || '', row.platform || '', row.startedAt || null,
            row.endedAt || null, Number(row.durationSeconds) || 0, Number(row.peakViewers) || 0,
            Number(row.totalViews) || 0, row.thumbnailUrl || '', createdAt
        ]
    );
    return { id: result.id, userId: String(userId), ...row, createdAt };
};

dbQuery.getDmConversation = (conversationId) => dbQuery.get(
    'SELECT * FROM dm_conversations WHERE id = ?',
    [String(conversationId)]
);
dbQuery.getDmConversationBetween = (aId, bId) => {
    const ids = [String(aId), String(bId)].sort();
    return dbQuery.get(
        'SELECT * FROM dm_conversations WHERE participantA = ? AND participantB = ?',
        ids
    );
};
dbQuery.ensureDmConversation = async (aId, bId) => {
    const ids = [String(aId), String(bId)].sort();
    const id = `dm_${Buffer.from(ids.join(':')).toString('base64url')}`;
    const now = new Date().toISOString();
    await dbQuery.run(
        `INSERT OR IGNORE INTO dm_conversations (id, participantA, participantB, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [id, ids[0], ids[1], now, now]
    );
    return dbQuery.getDmConversation(id);
};
dbQuery.listDmConversations = async (userId, limit = 50) => dbQuery.all(
    `SELECT c.*,
        CASE WHEN c.participantA = ? THEN c.participantB ELSE c.participantA END AS otherUserId,
        u.username AS otherUsername, u.displayName AS otherDisplayName, u.avatarUrl AS otherAvatarUrl,
        (SELECT body FROM dm_messages m WHERE m.conversationId = c.id ORDER BY m.createdAt DESC LIMIT 1) AS lastMessage,
        (SELECT COUNT(*) FROM dm_messages m WHERE m.conversationId = c.id AND m.senderId != ? AND m.readAt IS NULL) AS unreadCount
     FROM dm_conversations c
     LEFT JOIN users u ON CAST(u.id AS TEXT) = CASE WHEN c.participantA = ? THEN c.participantB ELSE c.participantA END
     WHERE c.participantA = ? OR c.participantB = ?
     ORDER BY COALESCE(c.lastMessageAt, c.updatedAt) DESC LIMIT ?`,
    [String(userId), String(userId), String(userId), String(userId), String(userId), Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)]
);
dbQuery.listDmMessages = async (conversationId, limit = 50, before = null) => {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const rows = before
        ? await dbQuery.all('SELECT * FROM dm_messages WHERE conversationId = ? AND createdAt < ? ORDER BY createdAt DESC LIMIT ?', [String(conversationId), before, lim])
        : await dbQuery.all('SELECT * FROM dm_messages WHERE conversationId = ? ORDER BY createdAt DESC LIMIT ?', [String(conversationId), lim]);
    return rows.reverse();
};
dbQuery.createDmMessage = async (conversationId, senderId, body) => {
    const createdAt = new Date().toISOString();
    const result = await dbQuery.run(
        'INSERT INTO dm_messages (conversationId, senderId, body, createdAt) VALUES (?, ?, ?, ?)',
        [String(conversationId), String(senderId), body, createdAt]
    );
    await dbQuery.run(
        'UPDATE dm_conversations SET updatedAt = ?, lastMessageAt = ? WHERE id = ?',
        [createdAt, createdAt, String(conversationId)]
    );
    return { id: result.id, conversationId: String(conversationId), senderId: String(senderId), body, createdAt, readAt: null };
};
dbQuery.getYoutubeLiveSettings = (userId) => dbQuery.get(
    'SELECT * FROM youtube_live_settings WHERE userId = ?',
    [String(userId)]
);
dbQuery.listEnabledYoutubeLiveSettings = () => dbQuery.all(
    'SELECT * FROM youtube_live_settings WHERE is_enabled = 1'
);
dbQuery.saveYoutubeLiveSettings = async (userId, fields) => {
    const uid = String(userId);
    const now = new Date().toISOString();
    const row = await dbQuery.getYoutubeLiveSettings(uid);
    const next = {
        youtube_identifier: fields.youtube_identifier != null ? String(fields.youtube_identifier) : (row?.youtube_identifier || ''),
        channel_id: fields.channel_id != null ? String(fields.channel_id) : (row?.channel_id || ''),
        channel_title: fields.channel_title != null ? String(fields.channel_title) : (row?.channel_title || ''),
        is_enabled: fields.is_enabled != null ? (fields.is_enabled ? 1 : 0) : (row?.is_enabled || 0),
        stream_token: fields.stream_token != null ? String(fields.stream_token) : (row?.stream_token || ''),
        updated_at: now
    };
    await dbQuery.run(
        `INSERT INTO youtube_live_settings
            (userId, youtube_identifier, channel_id, channel_title, is_enabled, stream_token, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(userId) DO UPDATE SET
            youtube_identifier = excluded.youtube_identifier,
            channel_id = excluded.channel_id,
            channel_title = excluded.channel_title,
            is_enabled = excluded.is_enabled,
            stream_token = excluded.stream_token,
            updated_at = excluded.updated_at`,
        [uid, next.youtube_identifier, next.channel_id, next.channel_title, next.is_enabled, next.stream_token, next.updated_at]
    );
    return { userId: uid, ...next, is_enabled: !!next.is_enabled };
};

dbQuery.markDmRead = async (conversationId, userId) => {
    const result = await dbQuery.run(
        'UPDATE dm_messages SET readAt = ? WHERE conversationId = ? AND senderId != ? AND readAt IS NULL',
        [new Date().toISOString(), String(conversationId), String(userId)]
    );
    return result.changes;
};

dbQuery.createBugReport = async (report) => {
    const helpers = require('./bug_report_helpers');
    const category = helpers.normalizeCategory(report.category);
    const createdAt = report.createdAt || new Date().toISOString();
    const attachments = helpers.normalizeAttachments(report.attachments, report.screenshotAssetId);
    const activity = helpers.appendActivity([], helpers.buildActivityEntry(
        { id: report.userId, name: report.displayName || report.username },
        'created',
        { message: 'ผู้ใช้ส่งรายงาน' }
    ));
    const row = {
        userId: String(report.userId),
        username: String(report.username),
        displayName: String(report.displayName || report.username || ''),
        title: String(report.title || helpers.deriveTitle(report.message) || ''),
        category,
        message: String(report.message),
        screenshotAssetId: report.screenshotAssetId || (attachments[0] && attachments[0].assetId) || null,
        appVersion: report.appVersion || null,
        status: helpers.normalizeStatus(report.status || 'pending'),
        adminNote: report.adminNote || null,
        location: String(report.location || ''),
        frequency: helpers.normalizeFrequency(report.frequency),
        priority: helpers.normalizePriority(report.priority, category) || helpers.defaultPriorityFor(category),
        assignedTo: report.assignedTo != null ? String(report.assignedTo) : '',
        assignedName: String(report.assignedName || ''),
        createdAt,
        updatedAt: createdAt
    };
    const result = await dbQuery.run(
        `INSERT INTO bug_reports (
            userId, username, displayName, title, category, message, screenshotAssetId, appVersion,
            status, adminNote, location, frequency, priority, assignedTo, assignedName,
            attachments, systemInfo, activity, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.userId, row.username, row.displayName, row.title, row.category, row.message,
            row.screenshotAssetId, row.appVersion, row.status, row.adminNote, row.location,
            row.frequency, row.priority, row.assignedTo, row.assignedName,
            helpers.stringifyJson(attachments), helpers.stringifyJson(report.systemInfo || {}),
            helpers.stringifyJson(activity), row.createdAt, row.updatedAt
        ]
    );
    return helpers.publicReport({ id: result.id, ...row, attachments, activity, systemInfo: report.systemInfo || {} });
};

dbQuery.listBugReports = async (limit = 200) => {
    const helpers = require('./bug_report_helpers');
    const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const rows = await dbQuery.all('SELECT * FROM bug_reports ORDER BY createdAt DESC LIMIT ?', [lim]);
    return (rows || []).map((r) => helpers.publicReport(r));
};

dbQuery.getBugReport = async (id) => {
    const helpers = require('./bug_report_helpers');
    const row = await dbQuery.get('SELECT * FROM bug_reports WHERE id = ?', [id]);
    return helpers.publicReport(row);
};

dbQuery.updateBugReport = async (id, fields, actor) => {
    const helpers = require('./bug_report_helpers');
    const current = await dbQuery.getBugReport(id);
    if (!current) return false;
    const patch = {};
    ['status', 'adminNote', 'priority', 'assignedTo', 'assignedName', 'title'].forEach((k) => {
        if (fields[k] !== undefined) patch[k] = fields[k];
    });
    if (patch.status !== undefined) patch.status = helpers.normalizeStatus(patch.status);
    if (patch.priority !== undefined) patch.priority = helpers.normalizePriority(patch.priority, current.category);
    let activity = Array.isArray(current.activity) ? current.activity.slice() : [];
    if (patch.status && patch.status !== current.status) {
        activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'status', {
            from: current.status, to: patch.status, message: `เปลี่ยนสถานะเป็น ${patch.status}`
        }));
    }
    if (patch.priority && patch.priority !== current.priority) {
        activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'priority', {
            from: current.priority, to: patch.priority, message: `เปลี่ยนความสำคัญเป็น ${patch.priority}`
        }));
    }
    if (patch.assignedTo !== undefined && String(patch.assignedTo) !== String(current.assignedTo || '')) {
        activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'assign', {
            to: patch.assignedName || patch.assignedTo,
            message: patch.assignedTo ? `มอบหมายให้ ${patch.assignedName || patch.assignedTo}` : 'ยกเลิกผู้รับผิดชอบ'
        }));
    }
    if (fields.note) {
        const note = String(fields.note).slice(0, 2000);
        patch.adminNote = note;
        activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'note', { message: note }));
    }
    patch.activity = helpers.stringifyJson(activity);
    patch.updatedAt = new Date().toISOString();
    const cols = Object.keys(patch);
    if (!cols.length) return false;
    const result = await dbQuery.run(
        `UPDATE bug_reports SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => patch[c]), id]
    );
    return !!result.changes;
};

dbQuery.deleteBugReport = async (id) => {
    const result = await dbQuery.run('DELETE FROM bug_reports WHERE id = ?', [id]);
    return !!result.changes;
};

module.exports = dbQuery;
