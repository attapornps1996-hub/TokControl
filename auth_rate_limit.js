/**
 * Rate limit สำหรับ login / signup / OAuth start — ป้องกัน brute-force
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const buckets = new Map();

function getClientKey(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function getBucket(req, scope) {
    const key = `${scope}:${getClientKey(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
        bucket = { attempts: 0, resetAt: now + WINDOW_MS };
        buckets.set(key, bucket);
    }
    return bucket;
}

function checkAuthRateLimit(req, scope = 'auth') {
    const bucket = getBucket(req, scope);
    if (bucket.attempts >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
        return { ok: false, retryAfterSec };
    }
    return { ok: true, remaining: MAX_ATTEMPTS - bucket.attempts };
}

function recordAuthAttempt(req, scope = 'auth') {
    const bucket = getBucket(req, scope);
    bucket.attempts += 1;
}

function clearAuthRateLimit(req, scope = 'auth') {
    buckets.delete(`${scope}:${getClientKey(req)}`);
}

function authRateLimitMiddleware(scope = 'auth') {
    return (req, res, next) => {
        const rate = checkAuthRateLimit(req, scope);
        if (!rate.ok) {
            res.set('Retry-After', String(rate.retryAfterSec));
            return res.status(429).json({
                error: `ลองบ่อยเกินไป — รอ ${rate.retryAfterSec} วินาทีแล้วลองใหม่`
            });
        }
        recordAuthAttempt(req, scope);
        next();
    };
}

module.exports = {
    checkAuthRateLimit,
    recordAuthAttempt,
    clearAuthRateLimit,
    authRateLimitMiddleware
};
