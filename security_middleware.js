/**
 * Security headers + basic hardening for Express
 */
function applySecurityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Overlay pages are intentionally embedded by the desktop app's preview
    // iframe. Electron loads the shell from 127.0.0.1 while older saved URLs
    // may use localhost, which X-Frame-Options treats as different origins.
    const requestPath = String(req.path || req.url || '').split('?')[0];
    const isEmbeddableOverlay = requestPath === '/overlay.html'
        || requestPath === '/overlay'
        || requestPath.startsWith('/overlay/');
    if (!isEmbeddableOverlay) {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Avatar Studio / Camera / TTS ต้องใช้ไมค์-กล้องในแอป — ห้ามปิดทิ้ง (เวอร์ชันเก่าไม่มี header นี้)
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=()');
    res.removeHeader('X-Powered-By');
    const proto = String(req.get('x-forwarded-proto') || req.protocol || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
    if (proto === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
    }
    next();
}

function validatePasswordPolicy(password) {
    const value = String(password || '');
    if (value.length < 8) {
        return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
    }
    if (value.length > 128) {
        return { ok: false, error: 'รหัสผ่านยาวเกินไป' };
    }
    return { ok: true };
}

function validateUsernamePolicy(username) {
    const value = String(username || '').trim();
    if (value.length < 3 || value.length > 24) {
        return { ok: false, error: 'ชื่อผู้ใช้ต้องมี 3–24 ตัวอักษร' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
        return { ok: false, error: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9 และ _' };
    }
    try {
        const { isReservedUsername } = require('./admin_auth');
        if (isReservedUsername(value)) {
            return { ok: false, error: 'ชื่อผู้ใช้นี้ถูกสงวนไว้ ไม่สามารถสมัครได้' };
        }
    } catch (_) {}
    return { ok: true, value };
}

module.exports = {
    applySecurityHeaders,
    validatePasswordPolicy,
    validateUsernamePolicy
};
