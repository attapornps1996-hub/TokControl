/**
 * ตรวจสอบสิทธิ์แอดมิน — ใช้ role ใน DB เท่านั้น (ไม่ให้ privilege จากชื่อผู้ใช้)
 */
const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'root', 'system', 'tokcontrol', 'support',
    'pandy_puncheroo'
]);

function isReservedUsername(username) {
    const name = String(username || '').trim().toLowerCase();
    return RESERVED_USERNAMES.has(name);
}

function isAdminAccount(user) {
    if (!user) return false;
    if (user.role === 'admin' || user.isAdmin === true || user.isAdmin === 1) return true;
    return false;
}

function resolveAccountRole(user) {
    if (!user) return 'free';
    if (isAdminAccount(user)) return 'admin';
    const isPro = user.isPro === 1 || user.isPro === true;
    if (isPro) {
        const exp = user.proExpireAt;
        if (!exp || new Date(exp) > new Date()) return 'pro';
    }
    return 'free';
}

module.exports = { isAdminAccount, resolveAccountRole, isReservedUsername, RESERVED_USERNAMES };
