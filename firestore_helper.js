const path = require('path');
const fs = require('fs');

let db = null;
let isFirestore = false;

// ตรวจสอบข้อมูลสิทธิ์เชื่อมต่อ Google Cloud Platform
const credentialPath = path.join(__dirname, 'service-account.json');
const hasGcpEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG;

if (fs.existsSync(credentialPath) || hasGcpEnv) {
    try {
        const { Firestore } = require('@google-cloud/firestore');
        let config = {};
        if (fs.existsSync(credentialPath)) {
            config.keyFilename = credentialPath;
        }
        db = new Firestore(config);
        isFirestore = true;
        console.log("Cloud Database: Firestore initialized successfully.");
    } catch (err) {
        console.warn("Cloud Database: Failed to load @google-cloud/firestore, using SQLite fallback:", err.message);
    }
}

let sqliteDb = null;
if (!isFirestore) {
    console.log("Cloud Database: No GCP credentials found. Falling back to local SQLite.");
    sqliteDb = require('./database.js');
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
    async createUser(username, password, streamToken, isPro = 0, proExpireAt = null) {
        if (isFirestore) {
            const userRef = db.collection('users').doc();
            const userData = {
                username: String(username),
                password: String(password),
                streamToken: String(streamToken),
                isPro: parseInt(isPro) || 0,
                proExpireAt: proExpireAt
            };
            await userRef.set(userData);
            return { id: userRef.id, ...userData };
        } else {
            const res = await sqliteDb.run(
                'INSERT INTO users (username, password, streamToken, isPro, proExpireAt) VALUES (?, ?, ?, ?, ?)',
                [username, password, streamToken, isPro, proExpireAt]
            );
            return { id: res.id, username, password, streamToken, isPro, proExpireAt };
        }
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

    // 6. ตรวจสอบรหัสของขวัญ (Promo Codes)
    async getPromoCode(code) {
        if (isFirestore) {
            const doc = await db.collection('promo_codes').doc(String(code)).get();
            if (!doc.exists) return null;
            return doc.data();
        } else {
            return await sqliteDb.get('SELECT * FROM promo_codes WHERE code = ?', [code]);
        }
    },

    // 7. บันทึกการใช้งานรหัสของขวัญ (Redeem Promo Code)
    async redeemPromoCode(code, userId, username, redeemedAt) {
        if (isFirestore) {
            await db.collection('promo_codes').doc(String(code)).update({
                isUsed: 1,
                usedBy: String(userId),
                usedByName: String(username),
                usedAt: String(redeemedAt)
            });
            return true;
        } else {
            await sqliteDb.run(
                'UPDATE promo_codes SET isUsed = 1, usedBy = ?, usedByName = ?, usedAt = ? WHERE code = ?',
                [userId, username, redeemedAt, code]
            );
            return true;
        }
    },

    // 8. ดึงรายการรหัสของขวัญทั้งหมด (List Promo Codes)
    async getPromoCodesList() {
        if (isFirestore) {
            const snapshot = await db.collection('promo_codes').get();
            const list = [];
            snapshot.forEach(doc => {
                list.push(doc.data());
            });
            return list;
        } else {
            return await sqliteDb.all('SELECT * FROM promo_codes');
        }
    },

    // 9. สร้างรหัสของขวัญใหม่ (Create Promo Code)
    async createPromoCode(code, type, val, createdAt) {
        if (isFirestore) {
            await db.collection('promo_codes').doc(String(code)).set({
                code: String(code),
                type: String(type),
                val: parseInt(val) || 0,
                isUsed: 0,
                createdAt: String(createdAt)
            });
            return true;
        } else {
            await sqliteDb.run(
                'INSERT INTO promo_codes (code, type, val, isUsed, createdAt) VALUES (?, ?, ?, ?, ?)',
                [code, type, val, 0, createdAt]
            );
            return true;
        }
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
    }
};

module.exports = firestoreHelper;
