/**
 * Export local tiktok_gifts → data/tiktok_gifts.json for GitHub shared catalog
 * Usage: node scratch/export_gifts_json.js
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'data', 'tiktok_gifts.json');
const dbPaths = [
    path.join(process.env.APPDATA || '', 'pandy-app', 'database.db'),
    path.join(root, 'database.db')
].filter(Boolean);

function openDb(dbPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dbPath)) return resolve(null);
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function main() {
    let rows = [];
    for (const dbPath of dbPaths) {
        const db = await openDb(dbPath);
        if (!db) continue;
        try {
            rows = await all(db, 'SELECT giftId, giftName, diamondCount, giftIcon, createdAt FROM tiktok_gifts ORDER BY diamondCount ASC, giftName ASC');
            if (rows.length) {
                console.log(`Exporting ${rows.length} gifts from: ${dbPath}`);
                break;
            }
        } finally {
            db.close();
        }
    }

    if (!rows.length) {
        console.error('No gifts found in any database. Connect TikTok LIVE first or check DB path.');
        process.exit(1);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`Saved ${rows.length} gifts to ${outPath}`);
    console.log('Commit and push data/tiktok_gifts.json to TokControl repo for all users to sync.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
