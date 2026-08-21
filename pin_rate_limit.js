/**
 * Rate limit สำหรับ /api/admin/verify-pin — ป้องกัน brute-force
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const buckets = new Map();

function getClientKey(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function getBucket(req) {
    const key = getClientKey(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
        bucket = { failures: 0, resetAt: now + WINDOW_MS };
        buckets.set(key, bucket);
    }
    return bucket;
}

function checkPinRateLimit(req) {
    const bucket = getBucket(req);
    if (bucket.failures >= MAX_FAILURES) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
        return { ok: false, retryAfterSec };
    }
    return { ok: true, remaining: MAX_FAILURES - bucket.failures };
}

function recordPinFailure(req) {
    const bucket = getBucket(req);
    bucket.failures += 1;
}

function clearPinRateLimit(req) {
    buckets.delete(getClientKey(req));
}

module.exports = { checkPinRateLimit, recordPinFailure, clearPinRateLimit };
