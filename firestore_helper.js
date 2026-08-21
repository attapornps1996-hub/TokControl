const path = require('path');
const fs = require('fs');

let db = null;
let isFirestore = false;

// ตรวจสอบข้อมูลสิทธิ์เชื่อมต่อ Google Cloud Platform
const credentialPath = path.join(__dirname, 'service-account.json');
const hasGcpEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG;
const isGcpRuntime = !!(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT);

if (fs.existsSync(credentialPath) || hasGcpEnv || isGcpRuntime) {
    try {
        const { Firestore } = require('@google-cloud/firestore');
        const config = {};
        if (fs.existsSync(credentialPath)) {
            config.keyFilename = credentialPath;
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            config.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
        db = new Firestore(config);
        isFirestore = true;
        console.log('Cloud Database: Firestore initialized successfully.');
    } catch (err) {
        console.warn('Cloud Database: Failed to load @google-cloud/firestore, using SQLite fallback:', err.message);
    }
}

let sqliteDb = null;
if (!isFirestore) {
    console.log('Cloud Database: No GCP credentials found. Falling back to local SQLite.');
    try {
        sqliteDb = require('./database.js');
    } catch (err) {
        console.error('Cloud Database: SQLite fallback unavailable:', err.message);
    }
}

function profileDocKey(value) {
    return encodeURIComponent(String(value)).replace(/\./g, '%2E');
}

function dmPair(a, b) {
    return [String(a), String(b)].sort();
}

const firestoreHelper = {
    // 1. ตรวจสอบและดึงข้อมูลผู้ใช้งาน (Users)
    async getUser(username) {
        if (isFirestore) {
            const snapshot = await db.collection('users')
                .where('username', '==', String(username))
                .limit(1)
                .get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } else {
            return await sqliteDb.get('SELECT * FROM users WHERE username = ?', [username]);
        }
    },

    // 2. สร้างบัญชีผู้ใช้งานใหม่ (Create User)
    async createUser(username, password, streamToken, isPro = 0, proExpireAt = null, extra = {}) {
        const createdAt = extra.createdAt || new Date().toISOString();
        const openId = extra.openId || null;
        if (isFirestore) {
            const userRef = db.collection('users').doc();
            const userData = {
                username: String(username),
                password: String(password),
                streamToken: String(streamToken),
                isPro: parseInt(isPro) || 0,
                proExpireAt: proExpireAt,
                createdAt: String(createdAt),
                openId: openId ? String(openId) : null,
                email: extra.email || null,
                displayName: extra.displayName || null,
                avatarUrl: extra.avatarUrl || null,
                oauthProvider: extra.oauthProvider || null,
                oauthId: extra.oauthId || null,
                proScopes: extra.proScopes || null,
                role: extra.role || 'user',
                emailVerified: extra.emailVerified != null ? (extra.emailVerified ? 1 : 0) : 0,
                emailVerifyToken: extra.emailVerifyToken || null,
                emailVerifyExpires: extra.emailVerifyExpires || null
            };
            await userRef.set(userData);
            return { id: userRef.id, ...userData };
        } else {
            const res = await sqliteDb.run(
                'INSERT INTO users (username, password, streamToken, isPro, proExpireAt, proScopes, createdAt, openId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [username, password, streamToken, isPro, proExpireAt, extra.proScopes || null, createdAt, openId]
            );
            return { id: res.id, username, password, streamToken, isPro, proExpireAt, proScopes: extra.proScopes || null, createdAt, openId };
        }
    },

    // 2b. รายชื่อผู้ใช้ทั้งหมด (Admin)
    async listUsers() {
        if (isFirestore) {
            const snapshot = await db.collection('users').get();
            return snapshot.docs.map((doc) => {
                const data = doc.data() || {};
                const { password, emailVerifyToken, emailVerifyCode, ...safe } = data;
                return { id: doc.id, ...safe };
            }).sort((a, b) => {
                const ta = Date.parse(a.createdAt || 0) || 0;
                const tb = Date.parse(b.createdAt || 0) || 0;
                if (tb !== ta) return tb - ta;
                return String(b.id).localeCompare(String(a.id));
            });
        }
        return await sqliteDb.all(
            'SELECT id, username, email, displayName, avatarUrl, openId, oauthProvider, streamToken, isPro, proExpireAt, proScopes, entitlements, createdAt FROM users ORDER BY id DESC'
        );
    },

    async updateUserPassword(username, hashedPassword) {
        return this.updateUserFields(username, { password: String(hashedPassword) });
    },

    async findUserByEmail(email) {
        const em = String(email || '').trim().toLowerCase();
        if (!em) return null;
        if (isFirestore) {
            const snapshot = await db.collection('users').where('email', '==', em).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return sqliteDb.get('SELECT * FROM users WHERE LOWER(email) = ?', [em]);
    },

    async findUserByEmailVerifyToken(token) {
        const t = String(token || '').trim();
        if (!t) return null;
        if (isFirestore) {
            const snapshot = await db.collection('users').where('emailVerifyToken', '==', t).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return sqliteDb.get('SELECT * FROM users WHERE emailVerifyToken = ?', [t]);
    },

    async findUserByPasswordResetToken(token) {
        const t = String(token || '').trim();
        if (!t) return null;
        if (isFirestore) {
            const snapshot = await db.collection('users').where('passwordResetToken', '==', t).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return sqliteDb.get('SELECT * FROM users WHERE passwordResetToken = ?', [t]);
    },

    // 2c. อัปเดตฟิลด์ผู้ใช้ตาม username
    async updateUserFields(username, fields) {
        const allowed = ['openId', 'email', 'displayName', 'avatarUrl', 'isPro', 'proExpireAt', 'proScopes', 'entitlements', 'createdAt', 'role', 'password', 'emailVerified', 'emailVerifyToken', 'emailVerifyCode', 'emailVerifyExpires', 'passwordResetToken', 'passwordResetExpires'];
        const patch = {};
        allowed.forEach((k) => {
            if (fields[k] !== undefined) patch[k] = fields[k];
        });
        if (!Object.keys(patch).length) return false;

        if (isFirestore) {
            const snapshot = await db.collection('users')
                .where('username', '==', String(username))
                .limit(1)
                .get();
            if (snapshot.empty) return false;
            await snapshot.docs[0].ref.update(patch);
            return true;
        }
        const cols = Object.keys(patch);
        await sqliteDb.run(
            `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE username = ?`,
            [...cols.map((c) => patch[c]), username]
        );
        return true;
    },

    // 3. อัปเดตสถานะสมาชิกโปร (Update Pro Status)
    async updateUserProStatus(username, isPro, proExpireAt) {
        if (isFirestore) {
            const snapshot = await db.collection('users')
                .where('username', '==', String(username))
                .limit(1)
                .get();
            if (snapshot.empty) return false;
            const doc = snapshot.docs[0];
            await doc.ref.update({
                isPro: parseInt(isPro) || 0,
                proExpireAt: proExpireAt
            });
            return true;
        } else {
            await sqliteDb.run(
                'UPDATE users SET isPro = ?, proExpireAt = ? WHERE username = ?',
                [isPro, proExpireAt, username]
            );
            return true;
        }
    },

    // 4. ดึงข้อมูลการตั้งค่าตู้สุ่ม (User Configs)
    async getUserConfig(userId) {
        if (isFirestore) {
            const doc = await db.collection('user_configs').doc(String(userId)).get();
            if (!doc.exists) return null;
            return doc.data();
        } else {
            return await sqliteDb.get('SELECT * FROM user_configs WHERE userId = ?', [userId]);
        }
    },

    // 5. บันทึก/อัปเดตการตั้งค่าตู้สุ่ม (Save User Configs)
    async saveUserConfig(userId, dataJson) {
        if (isFirestore) {
            await db.collection('user_configs').doc(String(userId)).set({
                userId: String(userId),
                data: String(dataJson)
            });
            return true;
        } else {
            await sqliteDb.run(
                'INSERT OR REPLACE INTO user_configs (userId, data) VALUES (?, ?)',
                [userId, dataJson]
            );
            return true;
        }
    },

    async getYoutubeLiveSettings(userId) {
        if (isFirestore) {
            const doc = await db.collection('youtube_live_settings').doc(String(userId)).get();
            if (!doc.exists) return null;
            return doc.data();
        }
        return sqliteDb.get('SELECT * FROM youtube_live_settings WHERE userId = ?', [String(userId)]);
    },

    async listEnabledYoutubeLiveSettings() {
        if (isFirestore) {
            const snap = await db.collection('youtube_live_settings').where('is_enabled', '==', 1).get();
            return snap.docs.map((d) => d.data());
        }
        return sqliteDb.all('SELECT * FROM youtube_live_settings WHERE is_enabled = 1');
    },

    async saveYoutubeLiveSettings(userId, fields) {
        const uid = String(userId);
        const prev = await this.getYoutubeLiveSettings(uid);
        const now = new Date().toISOString();
        const next = {
            userId: uid,
            youtube_identifier: fields.youtube_identifier != null ? String(fields.youtube_identifier) : (prev?.youtube_identifier || ''),
            channel_id: fields.channel_id != null ? String(fields.channel_id) : (prev?.channel_id || ''),
            channel_title: fields.channel_title != null ? String(fields.channel_title) : (prev?.channel_title || ''),
            is_enabled: fields.is_enabled != null ? (fields.is_enabled ? 1 : 0) : (prev?.is_enabled || 0),
            stream_token: fields.stream_token != null ? String(fields.stream_token) : (prev?.stream_token || ''),
            updated_at: now
        };
        if (isFirestore) {
            await db.collection('youtube_live_settings').doc(uid).set(next, { merge: true });
            return { ...next, is_enabled: !!next.is_enabled };
        }
        await sqliteDb.run(
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
        return { ...next, is_enabled: !!next.is_enabled };
    },

    // 6. ตรวจสอบรหัสของขวัญ (Promo Codes)
    normalizePromoCodeKey(code) {
        return String(code || '').replace(/[\s-]/g, '').toUpperCase();
    },

    async getPromoCode(code) {
        const normalized = this.normalizePromoCodeKey(code);
        if (!normalized) return null;

        if (isFirestore) {
            const candidates = [String(code || '').trim().toUpperCase(), normalized].filter(Boolean);
            for (const id of [...new Set(candidates)]) {
                const doc = await db.collection('promo_codes').doc(id).get();
                if (doc.exists) return { docId: doc.id, ...doc.data() };
            }
            const snapshot = await db.collection('promo_codes').get();
            for (const doc of snapshot.docs) {
                const stored = doc.data().code || doc.id;
                if (this.normalizePromoCodeKey(stored) === normalized) {
                    return { docId: doc.id, ...doc.data() };
                }
            }
            return null;
        }

        return await sqliteDb.get(
            "SELECT *, code AS docId FROM promo_codes WHERE UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = ?",
            [normalized]
        );
    },

    // 7. บันทึกการใช้งานรหัสของขวัญ (Redeem Promo Code)
    async redeemPromoCode(code, userId, username, redeemedAt) {
        const promo = await this.getPromoCode(code);
        const docId = promo?.docId || String(code);
        if (isFirestore) {
            await db.collection('promo_codes').doc(String(docId)).update({
                isUsed: 1,
                usedBy: String(userId),
                usedByName: String(username),
                usedAt: String(redeemedAt)
            });
            return true;
        }
        await sqliteDb.run(
            'UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE UPPER(REPLACE(REPLACE(code, \'-\', \'\'), \' \', \'\')) = ?',
            [userId, username, redeemedAt, this.normalizePromoCodeKey(code)]
        );
        return true;
    },

    async claimPromoCode(code, userId, username, redeemedAt) {
        const promo = await this.getPromoCode(code);
        if (!promo || Number(promo.isUsed) === 1) return null;
        const docId = promo.docId || promo.code;
        if (isFirestore) {
            const claimed = await db.runTransaction(async (t) => {
                const ref = db.collection('promo_codes').doc(String(docId));
                const snap = await t.get(ref);
                if (!snap.exists) return false;
                const data = snap.data() || {};
                if (Number(data.isUsed) === 1) return false;
                t.update(ref, {
                    isUsed: 1,
                    usedBy: String(userId),
                    usedByName: String(username),
                    usedAt: String(redeemedAt)
                });
                return true;
            });
            return claimed ? promo : null;
        }
        const result = await sqliteDb.run(
            'UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE UPPER(REPLACE(REPLACE(code, \'-\', \'\'), \' \', \'\')) = ? AND (isUsed = 0 OR isUsed IS NULL)',
            [userId, username, redeemedAt, this.normalizePromoCodeKey(code)]
        );
        if (!result || !result.changes) return null;
        return promo;
    },

    // 8. ดึงรายการรหัสของขวัญทั้งหมด (List Promo Codes)
    async getPromoCodesList() {
        if (isFirestore) {
            const snapshot = await db.collection('promo_codes').get();
            const list = [];
            snapshot.forEach((doc) => {
                list.push({ code: doc.id, ...doc.data() });
            });
            return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return await sqliteDb.all('SELECT * FROM promo_codes ORDER BY createdAt DESC');
    },

    // 9. สร้างรหัสของขวัญใหม่ (Create Promo Code)
    async createPromoCode(code, type, val, createdAt, proScopes = null) {
        const scopesJson = proScopes
            ? (typeof proScopes === 'string' ? proScopes : JSON.stringify(proScopes))
            : null;
        if (isFirestore) {
            await db.collection('promo_codes').doc(String(code)).set({
                code: String(code),
                type: String(type),
                val: parseInt(val, 10) || 0,
                isUsed: 0,
                createdAt: String(createdAt),
                proScopes: scopesJson
            });
            return true;
        }
        await sqliteDb.run(
            'INSERT INTO promo_codes (code, type, val, isUsed, createdAt, proScopes) VALUES (?, ?, ?, ?, ?, ?)',
            [code, type, val, 0, createdAt, scopesJson]
        );
        return true;
    },

    // 10. ตรวจสอบข้อมูลของขวัญที่เจอ (Get Gift)
    async getGift(giftId, giftName) {
        if (isFirestore) {
            // ค้นหาตาม ID หรือชื่อ
            if (giftId) {
                const doc = await db.collection('tiktok_gifts').doc(String(giftId)).get();
                if (doc.exists) return doc.data();
            }
            if (giftName) {
                const snapshot = await db.collection('tiktok_gifts')
                    .where('giftName', '==', String(giftName))
                    .limit(1)
                    .get();
                if (!snapshot.empty) return snapshot.docs[0].data();
            }
            return null;
        } else {
            return await sqliteDb.get('SELECT * FROM tiktok_gifts WHERE giftId = ? OR giftName = ?', [giftId, giftName]);
        }
    },

    // 11. บันทึกข้อมูลของขวัญใหม่ (Save Gift)
    async saveGift(giftId, giftName, diamondCount, giftIcon, createdAt) {
        if (isFirestore) {
            await db.collection('tiktok_gifts').doc(String(giftId)).set({
                giftId: parseInt(giftId),
                giftName: String(giftName),
                diamondCount: parseInt(diamondCount) || 1,
                giftIcon: String(giftIcon),
                createdAt: String(createdAt)
            });
            return true;
        } else {
            await sqliteDb.run(
                'INSERT OR REPLACE INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt) VALUES (?, ?, ?, ?, ?)',
                [giftId, giftName, diamondCount, giftIcon, createdAt]
            );
            return true;
        }
    },

    // 12. ดึงรายการของขวัญทั้งหมดที่ถูกบันทึก (List Gifts)
    async getAllGifts() {
        if (isFirestore) {
            const snapshot = await db.collection('tiktok_gifts').get();
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            return list;
        } else {
            return await sqliteDb.all('SELECT * FROM tiktok_gifts');
        }
    },

    async deleteGift(giftId) {
        if (giftId == null || giftId === '') return false;
        if (isFirestore) {
            await db.collection('tiktok_gifts').doc(String(giftId)).delete();
            return true;
        }
        await sqliteDb.run('DELETE FROM tiktok_gifts WHERE giftId = ?', [giftId]);
        return true;
    },

    async deleteGifts(giftIds) {
        const ids = (Array.isArray(giftIds) ? giftIds : []).map((id) => String(id)).filter(Boolean);
        if (!ids.length) return 0;
        if (isFirestore) {
            const batch = db.batch();
            ids.forEach((id) => batch.delete(db.collection('tiktok_gifts').doc(id)));
            await batch.commit();
            return ids.length;
        }
        const placeholders = ids.map(() => '?').join(',');
        await sqliteDb.run(`DELETE FROM tiktok_gifts WHERE giftId IN (${placeholders})`, ids);
        return ids.length;
    },

    // 13. ดึงผู้ใช้ตาม ID
    async getUserById(userId) {
        if (userId == null || userId === '') return null;
        if (isFirestore) {
            const doc = await db.collection('users').doc(String(userId)).get();
            if (doc.exists) return { id: doc.id, ...doc.data() };
            const snapshot = await db.collection('users').get();
            for (const d of snapshot.docs) {
                const data = d.data();
                if (String(data.id) === String(userId) || String(d.id) === String(userId)) {
                    return { id: d.id, ...data };
                }
            }
            return null;
        }
        return await sqliteDb.get('SELECT * FROM users WHERE id = ?', [userId]);
    },

    async getUserByStreamToken(streamToken) {
        const token = String(streamToken || '').trim();
        if (!token) return null;
        if (isFirestore) {
            const snapshot = await db.collection('users')
                .where('streamToken', '==', token)
                .limit(1)
                .get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return await sqliteDb.get('SELECT * FROM users WHERE streamToken = ?', [token]);
    },

    // 14. ออเดอร์ชำระเงิน
    async createPaymentOrder(order) {
        if (isFirestore) {
            await db.collection('payment_orders').doc(String(order.id)).set({
                id: String(order.id),
                userId: String(order.userId),
                username: String(order.username),
                planId: String(order.planId),
                days: parseInt(order.days, 10) || 0,
                amount: Number(order.amount) || 0,
                status: String(order.status || 'pending'),
                qrPayload: order.qrPayload || null,
                slipRef: order.slipRef || null,
                slipMeta: order.slipMeta || null,
                createdAt: String(order.createdAt),
                expiresAt: String(order.expiresAt),
                paidAt: order.paidAt || null
            });
            return true;
        }
        await sqliteDb.run(
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

    async getPaymentOrder(orderId) {
        if (isFirestore) {
            const doc = await db.collection('payment_orders').doc(String(orderId)).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        }
        return await sqliteDb.get('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
    },

    async updatePaymentOrder(orderId, fields) {
        const allowed = ['status', 'slipRef', 'slipMeta', 'paidAt', 'qrPayload', 'expiresAt'];
        const patch = {};
        allowed.forEach((k) => {
            if (fields[k] !== undefined) patch[k] = fields[k];
        });
        if (!Object.keys(patch).length) return false;

        if (isFirestore) {
            await db.collection('payment_orders').doc(String(orderId)).update(patch);
            return true;
        }
        const cols = Object.keys(patch);
        const sql = `UPDATE payment_orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
        await sqliteDb.run(sql, [...cols.map((c) => patch[c]), orderId]);
        return true;
    },

    async claimPaymentOrder(orderId, fromStatuses) {
        const allowed = Array.isArray(fromStatuses) && fromStatuses.length ? fromStatuses : ['pending'];
        if (isFirestore) {
            return db.runTransaction(async (t) => {
                const ref = db.collection('payment_orders').doc(String(orderId));
                const snap = await t.get(ref);
                if (!snap.exists) return null;
                const data = snap.data() || {};
                if (!allowed.includes(data.status)) return null;
                t.update(ref, { status: 'processing' });
                return { id: snap.id, ...data, status: 'processing' };
            });
        }
        const row = await sqliteDb.get('SELECT * FROM payment_orders WHERE id = ?', [orderId]);
        if (!row || !allowed.includes(row.status)) return null;
        const placeholders = allowed.map(() => '?').join(',');
        const result = await sqliteDb.run(
            `UPDATE payment_orders SET status = ? WHERE id = ? AND status IN (${placeholders})`,
            ['processing', orderId, ...allowed]
        );
        if (!result || !result.changes) return null;
        return { ...row, status: 'processing' };
    },

    async listPaymentOrders(limit = 100) {
        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
        if (isFirestore) {
            const snapshot = await db.collection('payment_orders').orderBy('createdAt', 'desc').limit(lim).get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        return await sqliteDb.all(
            'SELECT * FROM payment_orders ORDER BY createdAt DESC LIMIT ?',
            [lim]
        );
    },

    async findPaymentOrderBySlipRef(slipRef) {
        if (!slipRef) return null;
        if (isFirestore) {
            const snapshot = await db.collection('payment_orders')
                .where('slipRef', '==', String(slipRef))
                .limit(1)
                .get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return await sqliteDb.get('SELECT * FROM payment_orders WHERE slipRef = ?', [String(slipRef)]);
    },

    async createBugReport(report) {
        const helpers = require('./bug_report_helpers');
        const category = helpers.normalizeCategory(report.category);
        const createdAt = report.createdAt || new Date().toISOString();
        const activity = helpers.appendActivity([], helpers.buildActivityEntry(
            { id: report.userId, name: report.displayName || report.username },
            'created',
            { message: 'ผู้ใช้ส่งรายงาน' }
        ));
        const attachments = helpers.normalizeAttachments(report.attachments, report.screenshotAssetId);
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
            attachments,
            systemInfo: report.systemInfo && typeof report.systemInfo === 'object' ? report.systemInfo : {},
            activity,
            createdAt,
            updatedAt: createdAt
        };
        if (isFirestore) {
            const ref = db.collection('bug_reports').doc();
            await ref.set(row);
            return helpers.publicReport({ id: ref.id, ...row });
        }
        const result = await sqliteDb.run(
            `INSERT INTO bug_reports (
                userId, username, displayName, title, category, message, screenshotAssetId, appVersion,
                status, adminNote, location, frequency, priority, assignedTo, assignedName,
                attachments, systemInfo, activity, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.userId, row.username, row.displayName, row.title, row.category, row.message,
                row.screenshotAssetId, row.appVersion, row.status, row.adminNote, row.location,
                row.frequency, row.priority, row.assignedTo, row.assignedName,
                helpers.stringifyJson(row.attachments), helpers.stringifyJson(row.systemInfo),
                helpers.stringifyJson(row.activity), row.createdAt, row.updatedAt
            ]
        );
        return helpers.publicReport({ id: result.id, ...row });
    },

    async listBugReports(limit = 200) {
        const helpers = require('./bug_report_helpers');
        const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
        if (isFirestore) {
            const snapshot = await db.collection('bug_reports').orderBy('createdAt', 'desc').limit(lim).get();
            return snapshot.docs.map((d) => helpers.publicReport({ id: d.id, ...d.data() }));
        }
        const rows = await sqliteDb.all('SELECT * FROM bug_reports ORDER BY createdAt DESC LIMIT ?', [lim]);
        return (rows || []).map((r) => helpers.publicReport(r));
    },

    async getBugReport(id) {
        const helpers = require('./bug_report_helpers');
        if (isFirestore) {
            const doc = await db.collection('bug_reports').doc(String(id)).get();
            if (!doc.exists) return null;
            return helpers.publicReport({ id: doc.id, ...doc.data() });
        }
        const row = await sqliteDb.get('SELECT * FROM bug_reports WHERE id = ?', [id]);
        return helpers.publicReport(row);
    },

    async updateBugReport(id, fields, actor) {
        const helpers = require('./bug_report_helpers');
        const current = await this.getBugReport(id);
        if (!current) return false;
        const allowed = ['status', 'adminNote', 'priority', 'assignedTo', 'assignedName', 'title'];
        const patch = {};
        allowed.forEach((k) => {
            if (fields[k] !== undefined) patch[k] = fields[k];
        });
        if (patch.status !== undefined) patch.status = helpers.normalizeStatus(patch.status);
        if (patch.priority !== undefined) patch.priority = helpers.normalizePriority(patch.priority, current.category);
        let activity = Array.isArray(current.activity) ? current.activity.slice() : [];
        if (patch.status && patch.status !== current.status) {
            activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'status', {
                from: current.status,
                to: patch.status,
                message: `เปลี่ยนสถานะเป็น ${patch.status}`
            }));
        }
        if (patch.priority && patch.priority !== current.priority) {
            activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'priority', {
                from: current.priority,
                to: patch.priority,
                message: `เปลี่ยนความสำคัญเป็น ${patch.priority}`
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
            activity = helpers.appendActivity(activity, helpers.buildActivityEntry(actor, 'note', {
                message: note
            }));
        }
        patch.activity = activity;
        patch.updatedAt = new Date().toISOString();
        if (!Object.keys(patch).length) return false;
        if (isFirestore) {
            await db.collection('bug_reports').doc(String(id)).update(patch);
            return true;
        }
        const sqlPatch = { ...patch };
        if (sqlPatch.activity) sqlPatch.activity = helpers.stringifyJson(sqlPatch.activity);
        const cols = Object.keys(sqlPatch);
        const result = await sqliteDb.run(
            `UPDATE bug_reports SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            [...cols.map((c) => sqlPatch[c]), id]
        );
        return !!result.changes;
    },

    async deleteBugReport(id) {
        if (isFirestore) {
            await db.collection('bug_reports').doc(String(id)).delete();
            return true;
        }
        const result = await sqliteDb.run('DELETE FROM bug_reports WHERE id = ?', [id]);
        return !!result.changes;
    },

    async findOrCreateOAuthUser({ provider, oauthId, displayName, email }) {
        const pid = String(provider);
        const oid = String(oauthId);
        if (isFirestore) {
            const snapshot = await db.collection('users')
                .where('oauthProvider', '==', pid)
                .where('oauthId', '==', oid)
                .limit(1)
                .get();
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
        } else {
            const existing = await sqliteDb.get(
                'SELECT * FROM users WHERE oauthProvider = ? AND oauthId = ?',
                [pid, oid]
            );
            if (existing) return existing;
        }

        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        const sanitize = (raw) => {
            const base = String(raw || 'user')
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .slice(0, 24);
            return base || 'user';
        };
        let username = sanitize(displayName || email?.split('@')[0] || `${pid}_${oid}`);
        let suffix = 0;
        while (await this.getUser(username)) {
            suffix += 1;
            username = sanitize(`${displayName || 'user'}_${suffix}`);
        }

        const streamToken = crypto.randomBytes(16).toString('hex');
        const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        let trial = null;
        try {
            trial = require('./game-center-access').getSignupProTrialGrant();
        } catch (e) { /* optional */ }

        return this.createUser(username, password, streamToken, trial ? 1 : 0, trial ? trial.proExpireAt : null, {
            oauthProvider: pid,
            oauthId: oid,
            email: email || null,
            displayName: displayName || username,
            proScopes: trial ? trial.proScopes : null,
            emailVerified: email ? 1 : 0
        });
    },

    async listFriends(userId) {
        const uid = String(userId);
        if (isFirestore) {
            const snapshot = await db.collection('user_friends')
                .where('ownerId', '==', uid)
                .limit(200)
                .get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return await sqliteDb.all(
            'SELECT * FROM user_friends WHERE ownerId = ? ORDER BY createdAt DESC LIMIT 200',
            [uid]
        );
    },

    async listIncomingFriendRequests(userId) {
        const uid = String(userId);
        if (isFirestore) {
            const snapshot = await db.collection('friend_requests')
                .where('toUserId', '==', uid)
                .where('status', '==', 'pending')
                .limit(100)
                .get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return await sqliteDb.all(
            "SELECT * FROM friend_requests WHERE toUserId = ? AND status = 'pending' ORDER BY createdAt DESC LIMIT 100",
            [uid]
        );
    },

    async listOutgoingFriendRequests(userId) {
        const uid = String(userId);
        if (isFirestore) {
            const snapshot = await db.collection('friend_requests')
                .where('fromUserId', '==', uid)
                .where('status', '==', 'pending')
                .limit(100)
                .get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return await sqliteDb.all(
            "SELECT * FROM friend_requests WHERE fromUserId = ? AND status = 'pending' ORDER BY createdAt DESC LIMIT 100",
            [uid]
        );
    },

    async _areFriends(aId, bId) {
        if (isFirestore) {
            const snap = await db.collection('user_friends')
                .where('ownerId', '==', String(aId))
                .where('friendUserId', '==', String(bId))
                .limit(1)
                .get();
            return !snap.empty;
        }
        const row = await sqliteDb.get(
            'SELECT id FROM user_friends WHERE ownerId = ? AND friendUserId = ?',
            [String(aId), String(bId)]
        );
        return !!row;
    },

    async _insertFriendLink(owner, friend) {
        const row = {
            ownerId: String(owner.id),
            friendUserId: String(friend.id),
            friendUsername: friend.username,
            friendDisplayName: friend.displayName || friend.username,
            friendAvatarUrl: friend.avatarUrl || null,
            createdAt: new Date().toISOString()
        };
        if (isFirestore) {
            const ref = db.collection('user_friends').doc();
            await ref.set(row);
            return { id: ref.id, ...row };
        }
        const result = await sqliteDb.run(
            'INSERT INTO user_friends (ownerId, friendUserId, friendUsername, friendDisplayName, friendAvatarUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [row.ownerId, row.friendUserId, row.friendUsername, row.friendDisplayName, row.friendAvatarUrl, row.createdAt]
        );
        return { id: result.id, ...row };
    },

    async sendFriendRequest(fromUser, toUsername) {
        const target = await this.getUser(String(toUsername).trim());
        if (!target) return { error: 'ไม่พบผู้ใช้นี้' };
        if (String(target.id) === String(fromUser.id)) return { error: 'ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้' };
        if (await this.getBlockBetween(fromUser.id, target.id)) return { error: 'ไม่สามารถส่งคำขอเป็นเพื่อนได้' };
        if (await this._areFriends(fromUser.id, target.id)) return { error: 'เป็นเพื่อนกันอยู่แล้ว' };

        if (isFirestore) {
            const existing = await db.collection('friend_requests')
                .where('fromUserId', '==', String(fromUser.id))
                .where('toUserId', '==', String(target.id))
                .where('status', '==', 'pending')
                .limit(1)
                .get();
            if (!existing.empty) return { error: 'ส่งคำขอไปแล้ว รอการตอบรับ' };

            const reverse = await db.collection('friend_requests')
                .where('fromUserId', '==', String(target.id))
                .where('toUserId', '==', String(fromUser.id))
                .where('status', '==', 'pending')
                .limit(1)
                .get();
            if (!reverse.empty) {
                // มีคำขอกลับมาแล้ว — ยอมรับอัตโนมัติ
                return this.acceptFriendRequest(fromUser, reverse.docs[0].id);
            }

            const row = {
                fromUserId: String(fromUser.id),
                fromUsername: fromUser.username,
                fromDisplayName: fromUser.displayName || fromUser.username,
                fromAvatarUrl: fromUser.avatarUrl || null,
                toUserId: String(target.id),
                toUsername: target.username,
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            const ref = db.collection('friend_requests').doc();
            await ref.set(row);
            return { id: ref.id, ...row, requested: true };
        }

        const existing = await sqliteDb.get(
            "SELECT id FROM friend_requests WHERE fromUserId = ? AND toUserId = ? AND status = 'pending'",
            [String(fromUser.id), String(target.id)]
        );
        if (existing) return { error: 'ส่งคำขอไปแล้ว รอการตอบรับ' };

        const reverse = await sqliteDb.get(
            "SELECT id FROM friend_requests WHERE fromUserId = ? AND toUserId = ? AND status = 'pending'",
            [String(target.id), String(fromUser.id)]
        );
        if (reverse) {
            return this.acceptFriendRequest(fromUser, reverse.id);
        }

        const row = {
            fromUserId: String(fromUser.id),
            fromUsername: fromUser.username,
            fromDisplayName: fromUser.displayName || fromUser.username,
            fromAvatarUrl: fromUser.avatarUrl || null,
            toUserId: String(target.id),
            toUsername: target.username,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        const result = await sqliteDb.run(
            'INSERT INTO friend_requests (fromUserId, fromUsername, fromDisplayName, fromAvatarUrl, toUserId, toUsername, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [row.fromUserId, row.fromUsername, row.fromDisplayName, row.fromAvatarUrl, row.toUserId, row.toUsername, row.status, row.createdAt]
        );
        return { id: result.id, ...row, requested: true };
    },

    async acceptFriendRequest(user, requestId) {
        let req;
        if (isFirestore) {
            const ref = db.collection('friend_requests').doc(String(requestId));
            const doc = await ref.get();
            if (!doc.exists) return { error: 'ไม่พบคำขอ' };
            req = { id: doc.id, ...doc.data() };
            if (String(req.toUserId) !== String(user.id)) return { error: 'ไม่มีสิทธิ์ตอบรับคำขอนี้' };
            if (req.status !== 'pending') return { error: 'คำขอนี้ถูกจัดการแล้ว' };
            if (await this.getBlockBetween(user.id, req.fromUserId)) return { error: 'ไม่สามารถตอบรับคำขอนี้ได้' };
            await ref.update({ status: 'accepted' });
        } else {
            req = await sqliteDb.get('SELECT * FROM friend_requests WHERE id = ?', [requestId]);
            if (!req) return { error: 'ไม่พบคำขอ' };
            if (String(req.toUserId) !== String(user.id)) return { error: 'ไม่มีสิทธิ์ตอบรับคำขอนี้' };
            if (req.status !== 'pending') return { error: 'คำขอนี้ถูกจัดการแล้ว' };
            if (await this.getBlockBetween(user.id, req.fromUserId)) return { error: 'ไม่สามารถตอบรับคำขอนี้ได้' };
            await sqliteDb.run("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", [requestId]);
        }

        const fromUser = await this.getUserById(req.fromUserId) || {
            id: req.fromUserId,
            username: req.fromUsername,
            displayName: req.fromDisplayName,
            avatarUrl: req.fromAvatarUrl
        };
        const toUser = user;

        if (!(await this._areFriends(fromUser.id, toUser.id))) {
            await this._insertFriendLink(fromUser, toUser);
        }
        if (!(await this._areFriends(toUser.id, fromUser.id))) {
            await this._insertFriendLink(toUser, fromUser);
        }
        try {
            const fromFriends = await this.listFriends?.(fromUser.id) || [];
            const toFriends = await this.listFriends?.(toUser.id) || [];
            if (typeof this.updateSocialProfile === 'function') {
                await this.updateSocialProfile(fromUser.id, { friendsCount: fromFriends.length || 0 });
                await this.updateSocialProfile(toUser.id, { friendsCount: toFriends.length || 0 });
            }
        } catch (_) {}
        try {
            const { evaluateUserAchievements } = require('./achievement_evaluator');
            await evaluateUserAchievements(this, fromUser);
            await evaluateUserAchievements(this, toUser);
        } catch (_) {}
        return { success: true, accepted: true, friendUsername: fromUser.username };
    },

    async rejectFriendRequest(user, requestId) {
        if (isFirestore) {
            const ref = db.collection('friend_requests').doc(String(requestId));
            const doc = await ref.get();
            if (!doc.exists) return { error: 'ไม่พบคำขอ' };
            const req = doc.data();
            if (String(req.toUserId) !== String(user.id)) return { error: 'ไม่มีสิทธิ์' };
            await ref.update({ status: 'rejected' });
            return { success: true };
        }
        const req = await sqliteDb.get('SELECT * FROM friend_requests WHERE id = ?', [requestId]);
        if (!req) return { error: 'ไม่พบคำขอ' };
        if (String(req.toUserId) !== String(user.id)) return { error: 'ไม่มีสิทธิ์' };
        await sqliteDb.run("UPDATE friend_requests SET status = 'rejected' WHERE id = ?", [requestId]);
        return { success: true };
    },

    async addFriend(ownerId, friendUsername) {
        // เดิม: เพิ่มทันที — คงไว้เพื่อความเข้ากันได้ แต่แนะนำใช้ sendFriendRequest
        const owner = await this.getUserById(ownerId);
        if (!owner) return { error: 'ไม่พบบัญชี' };
        return this.sendFriendRequest(owner, friendUsername);
    },

    async removeFriend(ownerId, linkId) {
        const owner = String(ownerId);
        let friendUserId = null;
        if (isFirestore) {
            const ref = db.collection('user_friends').doc(String(linkId));
            const doc = await ref.get();
            if (!doc.exists || doc.data().ownerId !== owner) return false;
            friendUserId = doc.data().friendUserId;
            await ref.delete();
            const reverse = await db.collection('user_friends')
                .where('ownerId', '==', String(friendUserId))
                .where('friendUserId', '==', owner)
                .limit(1)
                .get();
            if (!reverse.empty) await reverse.docs[0].ref.delete();
            return true;
        }
        const row = await sqliteDb.get(
            'SELECT * FROM user_friends WHERE id = ? AND ownerId = ?',
            [linkId, owner]
        );
        if (!row) return false;
        friendUserId = row.friendUserId;
        await sqliteDb.run('DELETE FROM user_friends WHERE id = ? AND ownerId = ?', [linkId, owner]);
        await sqliteDb.run(
            'DELETE FROM user_friends WHERE ownerId = ? AND friendUserId = ?',
            [String(friendUserId), owner]
        );
        return true;
    },

    async createAnnouncement(row) {
        const data = {
            title: String(row.title),
            message: String(row.message),
            imageUrl: row.imageUrl ? String(row.imageUrl).slice(0, 500000) : null,
            important: row.important ? 1 : 0,
            category: ['update', 'news', 'promo', 'event', 'notice', 'maintenance', 'important', 'other'].includes(row.category) ? row.category : 'notice',
            summary: row.summary ? String(row.summary).slice(0, 300) : null,
            ctaLabel: row.ctaLabel ? String(row.ctaLabel).slice(0, 80) : null,
            ctaUrl: row.ctaUrl ? String(row.ctaUrl).slice(0, 500) : null,
            contentHtml: row.contentHtml ? String(row.contentHtml).slice(0, 200000) : null,
            ctaButtons: Array.isArray(row.ctaButtons) ? row.ctaButtons.slice(0, 3) : [],
            status: ['draft', 'scheduled', 'published', 'archived'].includes(row.status) ? row.status : 'published',
            audience: ['all', 'free', 'pro', 'group', 'custom'].includes(row.audience) ? row.audience : 'all',
            audienceConfig: row.audienceConfig ? String(row.audienceConfig).slice(0, 5000) : null,
            publishAt: row.publishAt || null,
            expireAt: row.expireAt || null,
            timezone: row.timezone || 'Asia/Bangkok',
            displayHome: row.displayHome !== false,
            showNotification: row.showNotification !== false,
            pinned: !!row.pinned,
            showPopup: !!row.showPopup,
            displayType: ['notice', 'banner', 'popup'].includes(row.displayType) ? row.displayType : (row.showPopup ? 'popup' : 'notice'),
            announcementType: ['maintenance', 'alert', 'update', 'feature', 'notice'].includes(row.announcementType) ? row.announcementType : (row.category || 'notice'),
            priority: Number(row.priority) || 0,
            locale: row.locale ? String(row.locale).slice(0, 12) : 'th',
            popupConfig: row.popupConfig && typeof row.popupConfig === 'object' ? row.popupConfig : (row.popupConfig ? row.popupConfig : null),
            archivedAt: row.archivedAt || null,
            updatedAt: row.updatedAt || null,
            views: Number(row.views) || 0,
            reads: Number(row.reads) || 0,
            reactions: Number(row.reactions) || 0,
            shares: Number(row.shares) || 0,
            ctaClicks: Number(row.ctaClicks) || 0,
            createdAt: row.createdAt || new Date().toISOString(),
            createdBy: row.createdBy || 'admin'
        };
        if (isFirestore) {
            const ref = db.collection('announcements').doc();
            await ref.set(data);
            return { id: ref.id, ...data };
        }
        const result = await sqliteDb.run(
            `INSERT INTO announcements (
                title, message, imageUrl, important, category, summary, ctaLabel, ctaUrl,
                contentHtml, ctaButtons, status, audience, audienceConfig, publishAt, expireAt,
                timezone, displayHome, showNotification, pinned, showPopup, displayType, announcementType,
                priority, locale, popupConfig, archivedAt, updatedAt,
                views, reads, reactions, shares, ctaClicks, createdAt, createdBy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.title, data.message, data.imageUrl, data.important, data.category, data.summary,
                data.ctaLabel, data.ctaUrl, data.contentHtml, JSON.stringify(data.ctaButtons),
                data.status, data.audience, data.audienceConfig, data.publishAt, data.expireAt,
                data.timezone, data.displayHome ? 1 : 0, data.showNotification ? 1 : 0,
                data.pinned ? 1 : 0, data.showPopup ? 1 : 0, data.displayType, data.announcementType,
                data.priority, data.locale,
                data.popupConfig ? (typeof data.popupConfig === 'string' ? data.popupConfig : JSON.stringify(data.popupConfig)) : null,
                data.archivedAt, data.updatedAt,
                data.views, data.reads, data.reactions, data.shares, data.ctaClicks,
                data.createdAt, data.createdBy
            ]
        );
        return { id: result.id, ...data };
    },

    async listAnnouncements(limit = 50) {
        const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        if (isFirestore) {
            const snapshot = await db.collection('announcements').orderBy('createdAt', 'desc').limit(lim).get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        return await sqliteDb.all('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT ?', [lim]);
    },

    async updateAnnouncement(id, patch, changedBy = 'admin') {
        const allowed = [
            'title', 'message', 'summary', 'category', 'imageUrl', 'important', 'contentHtml',
            'ctaButtons', 'ctaLabel', 'ctaUrl', 'status', 'audience', 'audienceConfig',
            'publishAt', 'expireAt', 'timezone', 'displayHome', 'showNotification',
            'pinned', 'showPopup', 'archivedAt', 'displayType', 'announcementType', 'priority', 'locale', 'popupConfig'
        ];
        const data = {};
        allowed.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(patch || {}, key)) data[key] = patch[key];
        });
        data.updatedAt = new Date().toISOString();
        if (isFirestore) {
            const ref = db.collection('announcements').doc(String(id));
            const snap = await ref.get();
            if (!snap.exists) return null;
            const oldValue = { id: snap.id, ...snap.data() };
            await ref.update(data);
            await ref.collection('revisions').add({
                action: 'updated',
                oldValue,
                newValue: data,
                changedBy,
                createdAt: data.updatedAt
            });
            return { ...oldValue, ...data };
        }
        const oldValue = await sqliteDb.get('SELECT * FROM announcements WHERE id = ?', [id]);
        if (!oldValue) return null;
        const entries = Object.entries(data);
        if (entries.length) {
            await sqliteDb.run(
                `UPDATE announcements SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
                [...entries.map(([key, value]) => {
                    if (key === 'ctaButtons' && Array.isArray(value)) return JSON.stringify(value);
                    if (key === 'popupConfig' && value && typeof value === 'object') return JSON.stringify(value);
                    if (['showPopup', 'displayHome', 'showNotification', 'pinned', 'important'].includes(key)) return value ? 1 : 0;
                    return value;
                }), id]
            );
        }
        await sqliteDb.run(
            'INSERT INTO announcement_revisions (announcementId, action, oldValue, newValue, changedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            [id, 'updated', JSON.stringify(oldValue), JSON.stringify(data), changedBy, data.updatedAt]
        );
        return { ...oldValue, ...data };
    },

    async listAnnouncementRevisions(id, limit = 50) {
        const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        if (isFirestore) {
            const snapshot = await db.collection('announcements').doc(String(id))
                .collection('revisions').orderBy('createdAt', 'desc').limit(lim).get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        return sqliteDb.all(
            'SELECT * FROM announcement_revisions WHERE announcementId = ? ORDER BY createdAt DESC LIMIT ?',
            [id, lim]
        );
    },

    async recordAnnouncementEvent(id, userId, eventType) {
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
        if (!column) return false;
        const createdAt = new Date().toISOString();
        if (isFirestore) {
            const ref = db.collection('announcements').doc(String(id));
            const eventId = `${String(userId || 'anonymous')}_${eventType}`;
            const eventRef = ref.collection('events').doc(eventId);
            await db.runTransaction(async (tx) => {
                const [annSnap, eventSnap] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
                if (!annSnap.exists) throw new Error('Announcement not found');
                const uniqueEvent = eventType === 'view' || eventType === 'read';
                if (uniqueEvent && eventSnap.exists) return;
                tx.set(eventRef, { userId: String(userId || ''), eventType, createdAt }, { merge: true });
                tx.update(ref, { [column]: Number(annSnap.data()?.[column] || 0) + 1 });
            });
            return true;
        }
        if (eventType === 'view' || eventType === 'read') {
            const exists = await sqliteDb.get(
                'SELECT id FROM announcement_events WHERE announcementId = ? AND userId = ? AND eventType = ? LIMIT 1',
                [id, String(userId || ''), eventType]
            );
            if (exists) return true;
        }
        await sqliteDb.run(
            'INSERT INTO announcement_events (announcementId, userId, eventType, createdAt) VALUES (?, ?, ?, ?)',
            [id, String(userId || ''), eventType, createdAt]
        );
        await sqliteDb.run(`UPDATE announcements SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = ?`, [id]);
        return true;
    },

    async countAnnouncements() {
        if (isFirestore) {
            const snapshot = await db.collection('announcements').get();
            return snapshot.size;
        }
        const row = await sqliteDb.get('SELECT COUNT(*) as cnt FROM announcements');
        return row?.cnt || 0;
    },

    async deleteAnnouncement(id) {
        if (isFirestore) {
            const ref = db.collection('announcements').doc(String(id));
            const doc = await ref.get();
            if (!doc.exists) return false;
            await ref.delete();
            return true;
        }
        const result = await sqliteDb.run('DELETE FROM announcements WHERE id = ?', [id]);
        return (result.changes || 0) > 0;
    },

    async deleteAllAnnouncements() {
        if (isFirestore) {
            const snapshot = await db.collection('announcements').get();
            const batch = db.batch();
            snapshot.docs.forEach((d) => batch.delete(d.ref));
            if (snapshot.docs.length) await batch.commit();
            return snapshot.docs.length;
        }
        const result = await sqliteDb.run('DELETE FROM announcements');
        return result.changes || 0;
    },

    async getAnnouncement(id) {
        if (isFirestore) {
            const snap = await db.collection('announcements').doc(String(id)).get();
            if (!snap.exists) return null;
            return { id: snap.id, ...snap.data() };
        }
        return sqliteDb.get('SELECT * FROM announcements WHERE id = ?', [id]);
    },

    async duplicateAnnouncement(id, changedBy = 'admin') {
        const src = await this.getAnnouncement(id);
        if (!src) return null;
        const copy = { ...src };
        delete copy.id;
        copy.title = String(src.title || '') + ' (Copy)';
        copy.status = 'draft';
        copy.createdAt = new Date().toISOString();
        copy.createdBy = changedBy;
        copy.updatedAt = copy.createdAt;
        copy.views = 0;
        copy.reads = 0;
        copy.reactions = 0;
        copy.shares = 0;
        copy.ctaClicks = 0;
        copy.archivedAt = null;
        return this.createAnnouncement(copy);
    },

    async restoreAnnouncementRevision(id, revisionId, changedBy = 'admin') {
        let snapshot = null;
        if (isFirestore) {
            const rev = await db.collection('announcements').doc(String(id)).collection('revisions').doc(String(revisionId)).get();
            if (!rev.exists) return null;
            snapshot = rev.data()?.oldValue || rev.data()?.snapshot || null;
        } else {
            const rev = await sqliteDb.get('SELECT * FROM announcement_revisions WHERE id = ? AND announcementId = ?', [revisionId, id]);
            if (!rev) return null;
            try { snapshot = JSON.parse(rev.oldValue || '{}'); } catch (_) { snapshot = null; }
        }
        if (!snapshot || typeof snapshot !== 'object') return null;
        const patch = { ...snapshot };
        delete patch.id;
        delete patch.createdAt;
        delete patch.createdBy;
        return this.updateAnnouncement(id, patch, changedBy);
    },

    async upsertAePreset(row) {
        const id = row.id && String(row.id).trim()
            ? String(row.id).trim()
            : ('aep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const now = new Date().toISOString();
        const data = {
            name: String(row.name || '').trim(),
            description: row.description ? String(row.description).trim().slice(0, 500) : '',
            coverUrl: row.coverUrl ? String(row.coverUrl).slice(0, 2000) : null,
            payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
            createdBy: row.createdBy || 'admin',
            createdAt: row.createdAt || now,
            updatedAt: now
        };
        if (isFirestore) {
            const ref = db.collection('ae_presets').doc(id);
            const existing = await ref.get();
            if (existing.exists) {
                const prev = existing.data() || {};
                data.createdAt = prev.createdAt || data.createdAt;
                data.createdBy = prev.createdBy || data.createdBy;
                await ref.set({ ...data }, { merge: true });
            } else {
                await ref.set(data);
            }
            return { id, ...data };
        }
        await sqliteDb.run(`
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
        const existing = await sqliteDb.get('SELECT id, createdAt, createdBy FROM ae_presets WHERE id = ?', [id]);
        const payloadJson = JSON.stringify(data.payload || {});
        if (existing) {
            await sqliteDb.run(
                'UPDATE ae_presets SET name = ?, description = ?, coverUrl = ?, payload = ?, updatedAt = ? WHERE id = ?',
                [data.name, data.description, data.coverUrl, payloadJson, data.updatedAt, id]
            );
            data.createdAt = existing.createdAt;
            data.createdBy = existing.createdBy || data.createdBy;
        } else {
            await sqliteDb.run(
                'INSERT INTO ae_presets (id, name, description, coverUrl, payload, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id, data.name, data.description, data.coverUrl, payloadJson, data.createdBy, data.createdAt, data.updatedAt]
            );
        }
        return { id, ...data };
    },

    async listAePresets(limit = 100) {
        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
        if (isFirestore) {
            const snapshot = await db.collection('ae_presets').orderBy('updatedAt', 'desc').limit(lim).get();
            return snapshot.docs.map((d) => {
                const data = d.data() || {};
                return {
                    id: d.id,
                    name: data.name,
                    description: data.description || '',
                    coverUrl: data.coverUrl || null,
                    createdBy: data.createdBy || null,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt
                };
            });
        }
        const rows = await sqliteDb.all(
            'SELECT id, name, description, coverUrl, createdBy, createdAt, updatedAt FROM ae_presets ORDER BY updatedAt DESC LIMIT ?',
            [lim]
        );
        return rows || [];
    },

    async getAePreset(id) {
        if (!id) return null;
        if (isFirestore) {
            const doc = await db.collection('ae_presets').doc(String(id)).get();
            if (!doc.exists) return null;
            return { id: doc.id, ...doc.data() };
        }
        const row = await sqliteDb.get('SELECT * FROM ae_presets WHERE id = ?', [String(id)]);
        if (!row) return null;
        let payload = {};
        try { payload = JSON.parse(row.payload || '{}'); } catch (_) { payload = {}; }
        return {
            id: row.id,
            name: row.name,
            description: row.description || '',
            coverUrl: row.coverUrl || null,
            payload,
            createdBy: row.createdBy || null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    },

    async deleteAePreset(id) {
        if (!id) return false;
        if (isFirestore) {
            const ref = db.collection('ae_presets').doc(String(id));
            const doc = await ref.get();
            if (!doc.exists) return false;
            await ref.delete();
            return true;
        }
        const result = await sqliteDb.run('DELETE FROM ae_presets WHERE id = ?', [String(id)]);
        return (result.changes || 0) > 0;
    },

    // —— Direct donate (streamer PromptPay) ——
    async donateGetSettingsByUserId(userId) {
        if (!userId && userId !== 0) return null;
        if (isFirestore) {
            const doc = await db.collection('streamer_settings').doc(String(userId)).get();
            if (!doc.exists) return null;
            return normalizeStreamerSettings({ user_id: doc.id, ...doc.data() });
        }
        return normalizeStreamerSettings(
            await sqliteDb.get('SELECT * FROM streamer_settings WHERE user_id = ?', [userId])
        );
    },

    async donateGetSettingsBySlug(slug) {
        const s = String(slug || '').trim().toLowerCase();
        if (!s) return null;
        if (isFirestore) {
            const snapshot = await db.collection('streamer_settings').where('donation_slug', '==', s).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return normalizeStreamerSettings({ user_id: doc.id, ...doc.data() });
        }
        return normalizeStreamerSettings(
            await sqliteDb.get('SELECT * FROM streamer_settings WHERE donation_slug = ?', [s])
        );
    },

    async donateGetSettingsByOverlayKey(key) {
        const k = String(key || '').trim();
        if (!k) return null;
        if (isFirestore) {
            const snapshot = await db.collection('streamer_settings').where('overlay_key', '==', k).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return normalizeStreamerSettings({ user_id: doc.id, ...doc.data() });
        }
        return normalizeStreamerSettings(
            await sqliteDb.get('SELECT * FROM streamer_settings WHERE overlay_key = ?', [k])
        );
    },

    async donateUpsertSettings(row) {
        const data = {
            donation_slug: row.donation_slug,
            overlay_key: row.overlay_key,
            promptpay_id: row.promptpay_id || '',
            account_name: row.account_name || '',
            bank_code: row.bank_code || '',
            min_donation: row.min_donation != null ? Number(row.min_donation) : 10,
            min_tts_amount: row.min_tts_amount != null ? Number(row.min_tts_amount) : 20,
            goal_amount: row.goal_amount != null ? Number(row.goal_amount) : 1000,
            goal_label: row.goal_label || 'เป้าหมายเดือนนี้',
            slipok_branch_id: row.slipok_branch_id || null,
            slipok_api_key: row.slipok_api_key || null,
            updated_at: row.updated_at || new Date().toISOString()
        };
        if (isFirestore) {
            await db.collection('streamer_settings').doc(String(row.user_id)).set({
                ...data,
                user_id: String(row.user_id)
            }, { merge: true });
            return normalizeStreamerSettings({ user_id: row.user_id, ...data });
        }
        await sqliteDb.run(
            `INSERT INTO streamer_settings
            (user_id, donation_slug, overlay_key, promptpay_id, account_name, bank_code,
             min_donation, min_tts_amount, goal_amount, goal_label, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.user_id, data.donation_slug, data.overlay_key, data.promptpay_id, data.account_name,
                data.bank_code, data.min_donation, data.min_tts_amount, data.goal_amount, data.goal_label,
                data.updated_at
            ]
        );
        return normalizeStreamerSettings({ user_id: row.user_id, ...data });
    },

    async donateUpdateSettings(userId, patch) {
        if (!userId && userId !== 0) return false;
        if (isFirestore) {
            const clean = { ...patch, user_id: String(userId) };
            await db.collection('streamer_settings').doc(String(userId)).set(clean, { merge: true });
            return true;
        }
        const cols = Object.keys(patch || {});
        if (!cols.length) return false;
        await sqliteDb.run(
            `UPDATE streamer_settings SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`,
            [...cols.map((c) => patch[c]), userId]
        );
        return true;
    },

    async donateInsertDonation(row) {
        const data = {
            id: row.id,
            streamer_id: String(row.streamer_id),
            donor_name: row.donor_name || 'ผู้ไม่ประสงค์ออกนาม',
            amount: Number(row.amount) || 0,
            message: row.message || '',
            slip_url: row.slip_url || null,
            trans_ref: row.trans_ref || null,
            verification_status: row.verification_status || 'pending',
            reject_reason: row.reject_reason || null,
            is_alerted: row.is_alerted ? 1 : 0,
            created_at: row.created_at || new Date().toISOString()
        };
        if (isFirestore) {
            if (data.trans_ref) {
                const dup = await db.collection('donations').where('trans_ref', '==', data.trans_ref).limit(1).get();
                if (!dup.empty) {
                    const err = new Error('UNIQUE constraint failed: donations.trans_ref');
                    throw err;
                }
            }
            await db.collection('donations').doc(String(data.id)).set(data);
            return data;
        }
        await sqliteDb.run(
            `INSERT INTO donations
            (id, streamer_id, donor_name, amount, message, slip_url, trans_ref,
             verification_status, reject_reason, is_alerted, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.id, row.streamer_id, data.donor_name, data.amount, data.message, data.slip_url,
                data.trans_ref, data.verification_status, data.reject_reason, data.is_alerted, data.created_at
            ]
        );
        return data;
    },

    async donateFindByTransRef(ref) {
        const r = String(ref || '').trim();
        if (!r) return null;
        if (isFirestore) {
            const snapshot = await db.collection('donations').where('trans_ref', '==', r).limit(1).get();
            if (snapshot.empty) return null;
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
        return sqliteDb.get('SELECT id FROM donations WHERE trans_ref = ?', [r]);
    },

    async donateMarkAlerted(id) {
        if (!id) return false;
        if (isFirestore) {
            await db.collection('donations').doc(String(id)).set({ is_alerted: 1 }, { merge: true });
            return true;
        }
        await sqliteDb.run('UPDATE donations SET is_alerted = 1 WHERE id = ?', [id]);
        return true;
    },

    async donateListVerified(streamerId) {
        if (isFirestore) {
            const snapshot = await db.collection('donations')
                .where('streamer_id', '==', String(streamerId))
                .where('verification_status', '==', 'verified')
                .get();
            return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        return sqliteDb.all(
            `SELECT amount, donor_name, created_at, verification_status
             FROM donations WHERE streamer_id = ? AND verification_status = 'verified'`,
            [streamerId]
        );
    },

    async donateListHistory(streamerId, { limit = 50, status } = {}) {
        const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        if (isFirestore) {
            const snapshot = await db.collection('donations')
                .where('streamer_id', '==', String(streamerId))
                .get();
            let rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (status === 'verified' || status === 'rejected' || status === 'pending') {
                rows = rows.filter((r) => r.verification_status === status);
            }
            rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
            return rows.slice(0, lim);
        }
        let sql = `SELECT id, donor_name, amount, message, slip_url, trans_ref,
                          verification_status, reject_reason, is_alerted, created_at
                   FROM donations WHERE streamer_id = ?`;
        const params = [streamerId];
        if (status === 'verified' || status === 'rejected' || status === 'pending') {
            sql += ' AND verification_status = ?';
            params.push(status);
        }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(lim);
        return sqliteDb.all(sql, params);
    },

    async donateIncrementPageViews(userId) {
        if (!userId && userId !== 0) return 0;
        if (isFirestore) {
            const ref = db.collection('streamer_settings').doc(String(userId));
            const doc = await ref.get();
            const cur = doc.exists ? Number(doc.data()?.page_views) || 0 : 0;
            const next = cur + 1;
            await ref.set({ page_views: next, user_id: String(userId) }, { merge: true });
            return next;
        }
        await sqliteDb.run(
            'UPDATE streamer_settings SET page_views = COALESCE(page_views, 0) + 1 WHERE user_id = ?',
            [userId]
        );
        const row = await sqliteDb.get('SELECT page_views FROM streamer_settings WHERE user_id = ?', [userId]);
        return Number(row?.page_views) || 0;
    },

    async getSocialProfile(userId) {
        if (!isFirestore) return sqliteDb.getSocialProfile(userId);
        const doc = await db.collection('user_profiles').doc(String(userId)).get();
        return {
            userId: String(userId), coverUrl: '', bio: '', level: 1, xp: 0, rank: '',
            lastActive: null, followersCount: 0, followingCount: 0, friendsCount: 0,
            achievementsCount: 0, streamsCount: 0,
            country: '', languages: '', contentTypes: '', streamGear: '', province: '',
            ...(doc.exists ? doc.data() : {})
        };
    },

    async updateSocialProfile(userId, fields) {
        if (!isFirestore) return sqliteDb.updateSocialProfile(userId, fields);
        const allowed = [
            'coverUrl', 'bio', 'level', 'xp', 'rank', 'lastActive', 'followersCount',
            'followingCount', 'friendsCount', 'achievementsCount', 'streamsCount',
            'country', 'province', 'languages', 'contentTypes', 'streamGear'
        ];
        const patch = { userId: String(userId), updatedAt: new Date().toISOString() };
        allowed.forEach((key) => { if (fields[key] !== undefined) patch[key] = fields[key]; });
        await db.collection('user_profiles').doc(String(userId)).set(patch, { merge: true });
        return this.getSocialProfile(userId);
    },

    async getProfilePrivacy(userId) {
        if (!isFirestore) return sqliteDb.getProfilePrivacy(userId);
        const doc = await db.collection('profile_privacy').doc(String(userId)).get();
        return {
            userId: String(userId),
            profileVisibility: 'public', socialVisibility: 'public',
            achievementsVisibility: 'public', streamsVisibility: 'public',
            activityVisibility: 'public', dmPermission: 'friends',
            ...(doc.exists ? doc.data() : {})
        };
    },

    async updateProfilePrivacy(userId, fields) {
        if (!isFirestore) return sqliteDb.updateProfilePrivacy(userId, fields);
        const allowed = [
            'profileVisibility', 'socialVisibility', 'achievementsVisibility',
            'streamsVisibility', 'activityVisibility', 'dmPermission'
        ];
        const patch = { userId: String(userId), updatedAt: new Date().toISOString() };
        allowed.forEach((key) => { if (fields[key] !== undefined) patch[key] = fields[key]; });
        await db.collection('profile_privacy').doc(String(userId)).set(patch, { merge: true });
        return this.getProfilePrivacy(userId);
    },

    async searchProfileUsers(query, limit = 20) {
        if (!isFirestore) return sqliteDb.searchProfileUsers(query, limit);
        const needle = String(query || '').trim().toLowerCase();
        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
        const users = await this.listUsers();
        return users.filter((user) => (
            String(user.username || '').toLowerCase().includes(needle) ||
            String(user.displayName || '').toLowerCase().includes(needle)
        )).sort((a, b) => {
            const ae = String(a.username || '').toLowerCase() === needle ? 0 : 1;
            const be = String(b.username || '').toLowerCase() === needle ? 0 : 1;
            return ae - be || String(a.username).localeCompare(String(b.username));
        }).slice(0, lim);
    },

    async listSocialConnections(userId) {
        if (!isFirestore) return sqliteDb.listSocialConnections(userId);
        const snapshot = await db.collection('social_connections').where('userId', '==', String(userId)).get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => String(a.platform).localeCompare(String(b.platform)));
    },

    async upsertSocialConnection(userId, row) {
        if (!isFirestore) return sqliteDb.upsertSocialConnection(userId, row);
        const id = `${profileDocKey(userId)}_${profileDocKey(row.platform)}`;
        const ref = db.collection('social_connections').doc(id);
        const existing = await ref.get();
        const now = new Date().toISOString();
        const data = {
            userId: String(userId), platform: row.platform, handle: row.handle || '',
            url: row.url || '', createdAt: existing.exists ? existing.data().createdAt : now,
            updatedAt: now
        };
        await ref.set(data);
        return { id, ...data };
    },

    async deleteSocialConnection(userId, platform) {
        if (!isFirestore) return sqliteDb.deleteSocialConnection(userId, platform);
        const ref = db.collection('social_connections').doc(`${profileDocKey(userId)}_${profileDocKey(platform)}`);
        const doc = await ref.get();
        if (!doc.exists) return false;
        await ref.delete();
        return true;
    },

    async areProfileFriends(aId, bId) {
        if (!isFirestore) return sqliteDb.areProfileFriends(aId, bId);
        return this._areFriends(aId, bId);
    },

    async getPendingFriendRequest(aId, bId) {
        if (!isFirestore) return sqliteDb.getPendingFriendRequest(aId, bId);
        const outgoing = await db.collection('friend_requests')
            .where('fromUserId', '==', String(aId)).where('toUserId', '==', String(bId)).limit(20).get();
        const incoming = await db.collection('friend_requests')
            .where('fromUserId', '==', String(bId)).where('toUserId', '==', String(aId)).limit(20).get();
        const rows = [...outgoing.docs, ...incoming.docs]
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => row.status === 'pending')
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return rows[0] || null;
    },

    async listMutualFriends(aId, bId, limit = 20) {
        if (!isFirestore) return sqliteDb.listMutualFriends(aId, bId, limit);
        const [a, b] = await Promise.all([this.listFriends(aId), this.listFriends(bId)]);
        const bIds = new Set(b.map((row) => String(row.friendUserId)));
        return a.filter((row) => bIds.has(String(row.friendUserId)))
            .slice(0, Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50))
            .map((row) => ({
                id: row.friendUserId, username: row.friendUsername,
                displayName: row.friendDisplayName, avatarUrl: row.friendAvatarUrl
            }));
    },

    async getBlockBetween(aId, bId) {
        if (!isFirestore) return sqliteDb.getBlockBetween(aId, bId);
        const refs = [
            db.collection('user_blocks').doc(`${profileDocKey(aId)}_${profileDocKey(bId)}`),
            db.collection('user_blocks').doc(`${profileDocKey(bId)}_${profileDocKey(aId)}`)
        ];
        const docs = await Promise.all(refs.map((ref) => ref.get()));
        const index = docs.findIndex((doc) => doc.exists);
        return index < 0 ? null : { id: docs[index].id, ...docs[index].data() };
    },

    async listUserBlocks(userId) {
        if (!isFirestore) return sqliteDb.listUserBlocks(userId);
        const snapshot = await db.collection('user_blocks').where('blockerId', '==', String(userId)).get();
        return Promise.all(snapshot.docs.map(async (doc) => {
            const row = doc.data();
            const user = await this.getUserById(row.blockedId);
            return {
                userId: row.blockedId, createdAt: row.createdAt,
                username: user?.username, displayName: user?.displayName, avatarUrl: user?.avatarUrl
            };
        }));
    },

    async blockUser(blockerId, blockedId) {
        if (!isFirestore) return sqliteDb.blockUser(blockerId, blockedId);
        const row = {
            blockerId: String(blockerId), blockedId: String(blockedId),
            createdAt: new Date().toISOString()
        };
        await db.collection('user_blocks')
            .doc(`${profileDocKey(blockerId)}_${profileDocKey(blockedId)}`).set(row);
        const [left, right, pendingA, pendingB] = await Promise.all([
            db.collection('user_friends').where('ownerId', '==', String(blockerId)).where('friendUserId', '==', String(blockedId)).get(),
            db.collection('user_friends').where('ownerId', '==', String(blockedId)).where('friendUserId', '==', String(blockerId)).get(),
            db.collection('friend_requests').where('fromUserId', '==', String(blockerId)).where('toUserId', '==', String(blockedId)).get(),
            db.collection('friend_requests').where('fromUserId', '==', String(blockedId)).where('toUserId', '==', String(blockerId)).get()
        ]);
        const batch = db.batch();
        [...left.docs, ...right.docs].forEach((doc) => batch.delete(doc.ref));
        [...pendingA.docs, ...pendingB.docs].filter((doc) => doc.data().status === 'pending')
            .forEach((doc) => batch.update(doc.ref, { status: 'rejected' }));
        await batch.commit();
        return true;
    },

    async unblockUser(blockerId, blockedId) {
        if (!isFirestore) return sqliteDb.unblockUser(blockerId, blockedId);
        const ref = db.collection('user_blocks').doc(`${profileDocKey(blockerId)}_${profileDocKey(blockedId)}`);
        const doc = await ref.get();
        if (!doc.exists) return false;
        await ref.delete();
        return true;
    },

    async createUserReport(row) {
        if (!isFirestore) return sqliteDb.createUserReport(row);
        const data = {
            reporterId: String(row.reporterId), reportedId: String(row.reportedId),
            reason: row.reason, details: row.details || '', status: 'open',
            createdAt: new Date().toISOString()
        };
        const ref = await db.collection('user_reports').add(data);
        return { id: ref.id, ...data };
    },

    async listUserAchievements(userId, limit = 100) {
        if (!isFirestore) return sqliteDb.listUserAchievements(userId, limit);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
        const snapshot = await db.collection('user_achievements').where('userId', '==', String(userId)).limit(lim).get();
        const rows = await Promise.all(snapshot.docs.map(async (doc) => {
            const unlocked = doc.data();
            const achievement = await db.collection('achievements').doc(String(unlocked.achievementId)).get();
            return achievement.exists ? { id: achievement.id, ...achievement.data(), ...unlocked } : null;
        }));
        return rows.filter(Boolean).sort((a, b) => String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || '')));
    },

    async listProfileAchievementCatalog(userId, limit = 100) {
        if (!isFirestore) return sqliteDb.listProfileAchievementCatalog(userId, limit);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
        const defs = await this.listAchievementDefinitions({ includeInactive: false });
        const snapshot = await db.collection('user_achievements').where('userId', '==', String(userId)).get();
        const byId = {};
        snapshot.docs.forEach((doc) => {
            const data = doc.data() || {};
            byId[String(data.achievementId || doc.id)] = data;
        });
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
    },

    async listAchievementDefinitions(opts = {}) {
        if (!isFirestore) return sqliteDb.listAchievementDefinitions(opts);
        const snapshot = await db.collection('achievements').get();
        let rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        if (!opts.includeInactive) rows = rows.filter((row) => row.active !== false && row.active !== 0);
        return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },

    async getAchievementDefinition(id) {
        if (!isFirestore) return sqliteDb.getAchievementDefinition(id);
        const doc = await db.collection('achievements').doc(String(id)).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    async deleteAchievementDefinition(id) {
        if (!isFirestore) return sqliteDb.deleteAchievementDefinition(id);
        const unlocks = await db.collection('user_achievements').where('achievementId', '==', String(id)).get();
        const batch = db.batch();
        unlocks.docs.forEach((doc) => batch.delete(doc.ref));
        batch.delete(db.collection('achievements').doc(String(id)));
        await batch.commit();
        return true;
    },

    async listAchievementUnlocks(achievementId, limit = 100) {
        if (!isFirestore) return sqliteDb.listAchievementUnlocks(achievementId, limit);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);
        const snapshot = await db.collection('user_achievements')
            .where('achievementId', '==', String(achievementId))
            .limit(lim)
            .get();
        const rows = await Promise.all(snapshot.docs.map(async (doc) => {
            const data = doc.data();
            if (!data.unlockedAt) return null;
            let username = '';
            let displayName = '';
            let avatarUrl = '';
            try {
                const user = await db.collection('users').doc(String(data.userId)).get();
                if (user.exists) {
                    const u = user.data() || {};
                    username = u.username || '';
                    displayName = u.displayName || username;
                    avatarUrl = u.avatarUrl || '';
                }
            } catch (_) {}
            return {
                userId: data.userId,
                progress: data.progress,
                unlockedAt: data.unlockedAt,
                username,
                displayName,
                avatarUrl
            };
        }));
        return rows.filter(Boolean).sort((a, b) => String(b.unlockedAt || '').localeCompare(String(a.unlockedAt || '')));
    },

    async upsertAchievementDefinition(row) {
        if (!isFirestore) return sqliteDb.upsertAchievementDefinition(row);
        const data = {
            name: row.name,
            description: row.description || '',
            iconUrl: row.iconUrl || '',
            icon: row.icon || 'workspace_premium',
            points: Number(row.points) || 0,
            triggerType: row.triggerType || 'manual',
            triggerValue: Number(row.triggerValue) || 0,
            triggerUnit: row.triggerUnit || '',
            active: row.active === false || row.active === 0 ? 0 : 1,
            createdAt: row.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await db.collection('achievements').doc(String(row.id)).set(data, { merge: true });
        return { id: String(row.id), ...data };
    },

    async upsertUserAchievement(userId, achievementId, fields = {}) {
        if (!isFirestore) return sqliteDb.upsertUserAchievement(userId, achievementId, fields);
        const progress = Math.min(Math.max(Number(fields.progress) || 0, 0), 100);
        const docId = `${profileDocKey(userId)}_${profileDocKey(achievementId)}`;
        const ref = db.collection('user_achievements').doc(docId);
        const existing = await ref.get();
        const prev = existing.exists ? existing.data() : {};
        let unlockedAt = fields.unlockedAt;
        if (unlockedAt === undefined) {
            if (prev.unlockedAt) unlockedAt = prev.unlockedAt;
            else unlockedAt = progress >= 100 ? new Date().toISOString() : null;
        }
        const data = {
            userId: String(userId),
            achievementId: String(achievementId),
            progress: Math.max(progress, Number(prev.progress) || 0),
            unlockedAt: prev.unlockedAt || unlockedAt
        };
        await ref.set(data, { merge: true });
        return true;
    },

    async createProfileActivity(userId, row) {
        if (!isFirestore) return sqliteDb.createProfileActivity(userId, row);
        const data = {
            userId: String(userId), type: row.type, title: row.title,
            details: row.details || '', metadata: row.metadata || null,
            createdAt: row.createdAt || new Date().toISOString()
        };
        const ref = await db.collection('profile_activity').add(data);
        return { id: ref.id, ...data };
    },

    async listProfileActivity(userId, limit = 30, before = null) {
        if (!isFirestore) return sqliteDb.listProfileActivity(userId, limit, before);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
        const snapshot = await db.collection('profile_activity').where('userId', '==', String(userId)).get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => !before || String(row.createdAt) < String(before))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, lim);
    },

    async listStreamSummaries(userId, limit = 20, before = null) {
        if (!isFirestore) return sqliteDb.listStreamSummaries(userId, limit, before);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const snapshot = await db.collection('stream_summaries').where('userId', '==', String(userId)).get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => !before || String(row.createdAt) < String(before))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, lim);
    },

    async createStreamSummary(userId, row) {
        if (!isFirestore) return sqliteDb.createStreamSummary(userId, row);
        const data = {
            userId: String(userId), title: row.title, game: row.game || '',
            platform: row.platform || '', startedAt: row.startedAt || null,
            endedAt: row.endedAt || null, durationSeconds: Number(row.durationSeconds) || 0,
            peakViewers: Number(row.peakViewers) || 0, totalViews: Number(row.totalViews) || 0,
            thumbnailUrl: row.thumbnailUrl || '', createdAt: row.createdAt || new Date().toISOString()
        };
        const ref = await db.collection('stream_summaries').add(data);
        return { id: ref.id, ...data };
    },

    async getDmConversation(conversationId) {
        if (!isFirestore) return sqliteDb.getDmConversation(conversationId);
        const doc = await db.collection('dm_conversations').doc(String(conversationId)).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    async getDmConversationBetween(aId, bId) {
        if (!isFirestore) return sqliteDb.getDmConversationBetween(aId, bId);
        const ids = dmPair(aId, bId);
        return this.getDmConversation(`dm_${profileDocKey(ids[0])}_${profileDocKey(ids[1])}`);
    },

    async ensureDmConversation(aId, bId) {
        if (!isFirestore) return sqliteDb.ensureDmConversation(aId, bId);
        const ids = dmPair(aId, bId);
        const id = `dm_${profileDocKey(ids[0])}_${profileDocKey(ids[1])}`;
        const ref = db.collection('dm_conversations').doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
            const now = new Date().toISOString();
            await ref.set({ participantA: ids[0], participantB: ids[1], createdAt: now, updatedAt: now, lastMessageAt: null });
        }
        return this.getDmConversation(id);
    },

    async listDmConversations(userId, limit = 50) {
        if (!isFirestore) return sqliteDb.listDmConversations(userId, limit);
        const uid = String(userId);
        const [a, b] = await Promise.all([
            db.collection('dm_conversations').where('participantA', '==', uid).get(),
            db.collection('dm_conversations').where('participantB', '==', uid).get()
        ]);
        const rows = await Promise.all([...a.docs, ...b.docs].map(async (doc) => {
            const row = { id: doc.id, ...doc.data() };
            const otherUserId = row.participantA === uid ? row.participantB : row.participantA;
            const other = await this.getUserById(otherUserId);
            const messages = await db.collection('dm_messages').where('conversationId', '==', row.id).get();
            const sorted = messages.docs.map((item) => ({ id: item.id, ...item.data() }))
                .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
            return {
                ...row, otherUserId, otherUsername: other?.username,
                otherDisplayName: other?.displayName, otherAvatarUrl: other?.avatarUrl,
                lastMessage: sorted[0]?.body || null,
                unreadCount: sorted.filter((message) => message.senderId !== uid && !message.readAt).length
            };
        }));
        return rows.sort((x, y) => String(y.lastMessageAt || y.updatedAt).localeCompare(String(x.lastMessageAt || x.updatedAt)))
            .slice(0, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100));
    },

    async listDmMessages(conversationId, limit = 50, before = null) {
        if (!isFirestore) return sqliteDb.listDmMessages(conversationId, limit, before);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const snapshot = await db.collection('dm_messages').where('conversationId', '==', String(conversationId)).get();
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => !before || String(row.createdAt) < String(before))
            .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, lim).reverse();
    },

    async createDmMessage(conversationId, senderId, body) {
        if (!isFirestore) return sqliteDb.createDmMessage(conversationId, senderId, body);
        const createdAt = new Date().toISOString();
        const data = {
            conversationId: String(conversationId), senderId: String(senderId),
            body, createdAt, readAt: null
        };
        const ref = await db.collection('dm_messages').add(data);
        await db.collection('dm_conversations').doc(String(conversationId))
            .update({ updatedAt: createdAt, lastMessageAt: createdAt });
        return { id: ref.id, ...data };
    },

    async markDmRead(conversationId, userId) {
        if (!isFirestore) return sqliteDb.markDmRead(conversationId, userId);
        const snapshot = await db.collection('dm_messages').where('conversationId', '==', String(conversationId)).get();
        const unread = snapshot.docs.filter((doc) => doc.data().senderId !== String(userId) && !doc.data().readAt);
        if (!unread.length) return 0;
        const batch = db.batch();
        const now = new Date().toISOString();
        unread.forEach((doc) => batch.update(doc.ref, { readAt: now }));
        await batch.commit();
        return unread.length;
    }
};

function normalizeStreamerSettings(row) {
    if (!row) return null;
    return {
        user_id: row.user_id,
        donation_slug: row.donation_slug,
        overlay_key: row.overlay_key,
        promptpay_id: row.promptpay_id || '',
        account_name: row.account_name || '',
        bank_code: row.bank_code || '',
        min_donation: row.min_donation != null ? Number(row.min_donation) : 10,
        min_tts_amount: row.min_tts_amount != null ? Number(row.min_tts_amount) : 20,
        goal_amount: row.goal_amount != null ? Number(row.goal_amount) : 1000,
        goal_label: row.goal_label || 'เป้าหมายเดือนนี้',
        slipok_branch_id: row.slipok_branch_id || null,
        slipok_api_key: row.slipok_api_key || null,
        page_views: Number(row.page_views) || 0,
        bio: row.bio || '',
        social_youtube: row.social_youtube || '',
        social_tiktok: row.social_tiktok || '',
        social_facebook: row.social_facebook || '',
        social_discord: row.social_discord || '',
        page_online: row.page_online == null ? 1 : Number(row.page_online) ? 1 : 0,
        updated_at: row.updated_at || null
    };
}

module.exports = firestoreHelper;
