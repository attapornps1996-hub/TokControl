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
db.serialize(() => {
    // ตารางผู้ใช้งาน
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            streamToken TEXT UNIQUE NOT NULL,
            isPro INTEGER DEFAULT 0,
            proExpireAt TEXT
        )
    `);

    // เพิ่มคอลัมน์วันที่สมัคร (migration)
    db.all("PRAGMA table_info(users)", (err, cols) => {
        if (!err && cols && !cols.some(c => c.name === 'createdAt')) {
            db.run("ALTER TABLE users ADD COLUMN createdAt TEXT");
        }
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

    // ตาราง Spotify OAuth tokens (per user)
    db.run(`
        CREATE TABLE IF NOT EXISTS spotify_tokens (
            userId INTEGER PRIMARY KEY,
            accessToken TEXT NOT NULL,
            refreshToken TEXT,
            expiresAt INTEGER,
            scope TEXT,
            updatedAt TEXT,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

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
            important INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            createdBy TEXT
        )
    `);

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

module.exports = dbQuery;
