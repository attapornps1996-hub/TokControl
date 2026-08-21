/**
 * แปลง Bearer token → userId (รองรับ token จาก Cloud เมื่อ JWT local ไม่ตรง)
 */
const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const axios = require('axios');
const { getJwtSecret } = require('./auth_secrets');

const CLOUD_PROFILE_URL = String(
    process.env.TOKCONTROL_CLOUD_URL || 'https://pandy-backend-302414976454.asia-southeast1.run.app'
).replace(/\/$/, '') + '/api/profile';

const profileCache = new Map();
const CACHE_MS = 60 * 1000;

function extractBearerToken(req) {
    const authHeader = req?.headers?.authorization;
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    return parts.length === 2 ? parts[1] : null;
}

function cacheGet(token) {
    const cached = profileCache.get(token);
    if (cached && cached.exp > Date.now()) return cached;
    return null;
}

function cacheSet(token, value) {
    profileCache.set(token, { ...value, exp: Date.now() + CACHE_MS });
}

async function fetchCloudProfile(token) {
    const cached = cacheGet(token);
    if (cached?.userId != null) return cached;

    try {
        const res = await axios.get(CLOUD_PROFILE_URL, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
            validateStatus: () => true
        });
        if (res.status >= 200 && res.status < 300 && res.data?.success && res.data.user?.id != null) {
            const user = res.data.user;
            const value = {
                userId: user.id,
                username: user.username || null,
                streamToken: user.streamToken || null
            };
            cacheSet(token, value);
            return value;
        }
    } catch (e) {
        console.warn('[auth_token] cloud profile lookup failed:', e.message);
    }
    return null;
}

async function resolveAuthContextFromToken(token) {
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        if (decoded?.userId != null) {
            return {
                userId: decoded.userId,
                username: decoded.username || null,
                streamToken: decoded.streamToken || null
            };
        }
    } catch (e) { /* try cloud */ }

    return fetchCloudProfile(token);
}

async function resolveUserIdFromToken(token) {
    const ctx = await resolveAuthContextFromToken(token);
    return ctx?.userId != null ? ctx.userId : null;
}

async function resolveUserIdFromRequest(req) {
    return resolveUserIdFromToken(extractBearerToken(req));
}

async function resolveAuthContextFromRequest(req) {
    return resolveAuthContextFromToken(extractBearerToken(req));
}

module.exports = {
    extractBearerToken,
    resolveUserIdFromToken,
    resolveUserIdFromRequest,
    resolveAuthContextFromToken,
    resolveAuthContextFromRequest
};
