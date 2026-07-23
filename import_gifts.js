const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 1. All target database paths
const dbPaths = [
    path.join(process.env.APPDATA, 'pandy-app', 'database.db'),
    path.join(__dirname, 'database.db'),
    path.join(__dirname, 'pandy-app-win32-x64', 'resources', 'app', 'database.db')
];

// 2. Read Gist file
const gistFilePath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\277669fd-dc99-42fd-a6d4-a2518f9e34cb\\.system_generated\\steps\\6972\\content.md';
if (!fs.existsSync(gistFilePath)) {
    console.error('Fetched Gist file does not exist!');
    process.exit(1);
}

const fileContent = fs.readFileSync(gistFilePath, 'utf8');
const jsonStartIndex = fileContent.indexOf('{');
if (jsonStartIndex === -1) {
    console.error('Could not find JSON start in the file!');
    process.exit(1);
}

const rawJson = fileContent.slice(jsonStartIndex);
let data;
try {
    data = JSON.parse(rawJson);
} catch (e) {
    console.error('Failed to parse JSON:', e);
    process.exit(1);
}

const gifts = data.gifts || [];
console.log(`Found ${gifts.length} gifts in JSON.`);

// Function to import into a database
function importIntoDb(dbPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dbPath)) {
            console.log(`Skipping DB path (does not exist): ${dbPath}`);
            return resolve();
        }

        console.log(`Importing into DB: ${dbPath}`);
        const db = new sqlite3.Database(dbPath);

        db.serialize(() => {
            // Ensure table exists
            db.run(`
                CREATE TABLE IF NOT EXISTS tiktok_gifts (
                    giftId INTEGER PRIMARY KEY,
                    giftName TEXT NOT NULL,
                    diamondCount INTEGER,
                    giftIcon TEXT,
                    createdAt TEXT
                )
            `);

            const stmt = db.prepare(`
                INSERT OR REPLACE INTO tiktok_gifts (giftId, giftName, diamondCount, giftIcon, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);

            let count = 0;
            const nowStr = new Date().toISOString();

            for (const g of gifts) {
                const giftId = parseInt(g.id);
                const giftName = g.name || '';
                const diamondCount = parseInt(g.diamond_count || 0);
                let giftIcon = '';

                if (g.icon && Array.isArray(g.icon.url_list) && g.icon.url_list.length > 0) {
                    giftIcon = g.icon.url_list[0];
                } else if (g.image && Array.isArray(g.image.url_list) && g.image.url_list.length > 0) {
                    giftIcon = g.image.url_list[0];
                }

                // Clean up URL if it starts with protocol-less formats or has templates
                if (giftIcon) {
                    if (giftIcon.startsWith('//')) {
                        giftIcon = 'https:' + giftIcon;
                    }
                }

                if (giftId && giftName) {
                    stmt.run(giftId, giftName, diamondCount, giftIcon, nowStr);
                    count++;
                }
            }

            stmt.finalize(() => {
                db.close((err) => {
                    if (err) reject(err);
                    else {
                        console.log(`--> Successfully imported ${count} gifts into: ${dbPath}`);
                        resolve();
                    }
                });
            });
        });
    });
}

// Run sequentially for all existing databases
async function main() {
    for (const p of dbPaths) {
        try {
            await importIntoDb(p);
        } catch (e) {
            console.error(`Error importing into ${p}:`, e);
        }
    }
    console.log('All imports completed successfully!');
}

main();
