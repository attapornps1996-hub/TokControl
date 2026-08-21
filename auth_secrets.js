/**
 * Shared auth secrets — อ่านจาก environment (.env / Cloud Run env vars)
 * ค่า local ที่ยังไม่ตั้ง จะถูกสร้างครั้งเดียวแล้วเก็บใน data/ (อย่า commit)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');

const PLACEHOLDER_SECRETS = new Set([
    'change_me_to_a_long_random_secret',
    'change_me_admin_pin',
    'change_me_long_random_sync_key',
    'pandy_dev_only_not_for_production',
    'your_github_personal_access_token'
]);

function isPlaceholderSecret(value) {
    const s = String(value || '').trim();
    if (!s) return true;
    if (PLACEHOLDER_SECRETS.has(s)) return true;
    if (/^change_me/i.test(s)) return true;
    if (/^your_[a-z0-9_]+_here$/i.test(s)) return true;
    return false;
}

function readOrCreateLocalSecret(fileName, { bytes = 24, label = 'secret' } = {}) {
    const filePath = path.join(DATA_DIR, fileName);
    try {
        if (fs.existsSync(filePath)) {
            const existing = String(fs.readFileSync(filePath, 'utf8') || '').trim();
            if (existing) return existing;
        }
    } catch (e) { /* fall through */ }
    const generated = crypto.randomBytes(bytes).toString('hex');
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(filePath, generated + '\n', { encoding: 'utf8', mode: 0o600 });
        console.warn(`[auth] ${label} was unset — generated and saved to data/${fileName}`);
    } catch (e) {
        console.warn(`[auth] could not persist ${label}:`, e.message);
    }
    return generated;
}

function getJwtSecret() {
    const secret = String(process.env.JWT_SECRET || process.env.TOKCONTROL_JWT_SECRET || '').trim();
    const usable = secret && !isPlaceholderSecret(secret) ? secret : '';
    if (process.env.NODE_ENV === 'production') {
        if (!usable || usable.length < 24) {
            throw new Error('[auth] JWT_SECRET is missing, too short, or still a placeholder. Set a long random JWT_SECRET on Cloud Run.');
        }
        return usable;
    }
    if (usable) return usable;
    console.warn('[auth] JWT_SECRET is not set — using a generated local secret. Set JWT_SECRET in .env for local dev.');
    return readOrCreateLocalSecret('local-jwt-secret.txt', { bytes: 32, label: 'JWT_SECRET' });
}

function getAdminSeedPassword() {
    return String(process.env.ADMIN_SEED_PASSWORD || '').trim() || null;
}

/** PIN ปลดล็อกแอดมิน — ไม่ fallback เป็น 1234 อีกต่อไป */
function getAdminPin() {
    const fromEnv = String(process.env.ADMIN_PIN || '').trim();
    const usable = fromEnv && !isPlaceholderSecret(fromEnv) && fromEnv !== '1234' ? fromEnv : '';
    if (usable) return usable;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('[auth] ADMIN_PIN is required in production and must not be a placeholder (change_me_admin_pin / 1234)');
    }
    return readOrCreateLocalSecret('local-admin-pin.txt', { bytes: 3, label: 'ADMIN_PIN' }).slice(0, 6);
}

/** Shared token สำหรับ Paper plugin HTTP bridge (:8081) */
function getMcBridgeToken() {
    const fromEnv = String(process.env.TOKCONTROL_BRIDGE_TOKEN || process.env.MC_BRIDGE_TOKEN || '').trim();
    if (fromEnv) return fromEnv;
    return readOrCreateLocalSecret('mc-bridge-token.txt', { bytes: 24, label: 'TOKCONTROL_BRIDGE_TOKEN' });
}

/** รหัส RCON ของเซิร์ฟ Minecraft ที่แอปจัดการ */
function getMcRconPassword() {
    const fromEnv = String(process.env.MC_RCON_PASSWORD || '').trim();
    if (fromEnv) return fromEnv;
    return readOrCreateLocalSecret('mc-rcon-password.txt', { bytes: 12, label: 'MC_RCON_PASSWORD' });
}

/** คีย์ sync คลังของขวัญ — ว่าง = ปิด sync */
function getGiftsSyncKey() {
    return String(process.env.GIFTS_SYNC_KEY || '').trim();
}

module.exports = {
    getJwtSecret,
    getAdminSeedPassword,
    getAdminPin,
    getMcBridgeToken,
    getMcRconPassword,
    getGiftsSyncKey
};
