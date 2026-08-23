/**
 * Game Center authorization — Early Access beta + post-beta PRO inclusion.
 * Used by cloud_server.js, server.js, payments.js
 */
'use strict';

const VALID_MODES = new Set(['beta_addon', 'pro_included', 'public']);

/** Games that can be unlocked individually via promo codes / purchases */
const UNLOCKABLE_GAME_IDS = new Set(['repo', 'dance-club', 'fish-control', 'minecraft', 'tower-wars', 'farm-control', 'duck-control', 'restaurant-control']);

/** Fish / Box / Farm — ขายแยกในร้านค้า (PRO ไม่ปลดให้อัตโนมัติ) */
const STANDALONE_STORE_GAME_IDS = new Set(['fish-control', 'minecraft', 'farm-control']);

/** รวมใน PRO (ไม่ฟรี): REPO, Dance Club, Tower Wars, Duck Control — ต้อง PRO หรือโค้ดเกมนั้น */
const PRO_INCLUDED_GAME_IDS = new Set(['repo', 'dance-club', 'tower-wars', 'duck-control', 'restaurant-control']);

const GAME_UNLOCK_LABELS = {
    repo: 'R.E.P.O.',
    'dance-club': 'Dance Club',
    'fish-control': 'Fish Control',
    minecraft: 'Box Control',
    'tower-wars': 'Tower Wars',
    'farm-control': 'Farm Control',
    'duck-control': 'Duck Control',
    'restaurant-control': 'Restaurant Control'
};

/** End of beta day in Thailand (2026-08-06 23:59:59 ICT) */
const DEFAULT_BETA_ENDS_AT = '2026-08-06T16:59:59.999Z';
/** Signup PRO trial is off unless SIGNUP_PRO_TRIAL_ENABLED=1 */
const DEFAULT_SIGNUP_TRIAL_START = '2026-08-02T17:00:00.000Z';
const DEFAULT_SIGNUP_TRIAL_END = '2026-08-06T16:59:59.999Z';
const DEFAULT_EARLY_ACCESS_DAYS = 30;
const DEFAULT_SIGNUP_TRIAL_DAYS = 3;
const DEFAULT_GAME_UNLOCK_DAYS = 7;

function envFlagOn(name) {
    const v = String(process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function isSignupProTrialEnabled() {
    return envFlagOn('SIGNUP_PRO_TRIAL_ENABLED') || envFlagOn('SIGNUP_PRO_TRIAL_ENABLED');
}

function trialEnv(name, altName) {
    const a = process.env[name];
    const b = altName ? process.env[altName] : '';
    return (a && String(a).trim()) || (b && String(b).trim()) || '';
}

function parseIso(raw, fallback) {
    if (!raw) return new Date(fallback);
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : new Date(fallback);
}

function getBetaEndsAt() {
    return parseIso(process.env.GC_BETA_ENDS_AT, DEFAULT_BETA_ENDS_AT);
}

function isBetaPeriodActive(now = new Date()) {
    return now.getTime() <= getBetaEndsAt().getTime();
}

/**
 * Effective flags — after beta end date, force pro_included and hide GC purchase
 * even if env still says beta_addon.
 */
function getGameCenterFlags(now = new Date()) {
    const envMode = String(process.env.GC_ACCESS_MODE || 'beta_addon').trim();
    let mode = VALID_MODES.has(envMode) ? envMode : 'beta_addon';
    const betaEndsAt = getBetaEndsAt();
    const betaActive = now.getTime() <= betaEndsAt.getTime();

    if (!betaActive && mode === 'beta_addon') {
        mode = 'pro_included';
    }

    const purchaseEnabled = process.env.GC_PURCHASE_ENABLED !== '0'
        && mode === 'beta_addon'
        && betaActive;

    return {
        mode,
        purchaseEnabled,
        betaActive,
        betaEndsAt: betaEndsAt.toISOString(),
        earlyAccessDays: Number(process.env.GC_EARLY_ACCESS_DAYS) || DEFAULT_EARLY_ACCESS_DAYS,
        gameUnlockDays: Number(process.env.GC_GAME_UNLOCK_DAYS) || DEFAULT_GAME_UNLOCK_DAYS,
        signupTrial: getSignupTrialInfo(now)
    };
}

function getSignupTrialInfo(now = new Date()) {
    const start = parseIso(trialEnv('SIGNUP_PRO_TRIAL_START', 'SIGNUP_PRO_TRIAL_START'), DEFAULT_SIGNUP_TRIAL_START);
    const end = parseIso(trialEnv('SIGNUP_PRO_TRIAL_END', 'SIGNUP_PRO_TRIAL_END'), DEFAULT_SIGNUP_TRIAL_END);
    const days = Number(trialEnv('SIGNUP_PRO_TRIAL_DAYS', 'SIGNUP_PRO_TRIAL_DAYS')) || DEFAULT_SIGNUP_TRIAL_DAYS;
    const active = isSignupProTrialEnabled()
        && now.getTime() >= start.getTime()
        && now.getTime() <= end.getTime();
    return {
        active,
        days,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        enabled: isSignupProTrialEnabled()
    };
}

/** Grant fields for new signup — null unless trial is explicitly enabled */
function getSignupProTrialGrant(now = new Date()) {
    const info = getSignupTrialInfo(now);
    if (!info.active) return null;
    const expire = new Date(now);
    expire.setDate(expire.getDate() + info.days);
    return {
        isPro: 1,
        proExpireAt: expire.toISOString(),
        proScopes: JSON.stringify(['all']),
        days: info.days
    };
}

/**
 * Backfill PRO trial for accounts created during the signup window
 * before the Cloud deploy that started granting trial on signup.
 */
function buildSignupProTrialBackfill(user, now = new Date()) {
    if (!isSignupProTrialEnabled()) return null;
    if (!user || isAdminUser(user)) return null;
    if (isProActive(user, now)) return null;

    const created = user.createdAt ? new Date(user.createdAt) : null;
    if (!created || !Number.isFinite(created.getTime())) return null;

    const start = parseIso(trialEnv('SIGNUP_PRO_TRIAL_START', 'SIGNUP_PRO_TRIAL_START'), DEFAULT_SIGNUP_TRIAL_START);
    const end = parseIso(trialEnv('SIGNUP_PRO_TRIAL_END', 'SIGNUP_PRO_TRIAL_END'), DEFAULT_SIGNUP_TRIAL_END);
    const days = Number(trialEnv('SIGNUP_PRO_TRIAL_DAYS', 'SIGNUP_PRO_TRIAL_DAYS')) || DEFAULT_SIGNUP_TRIAL_DAYS;

    if (created.getTime() < start.getTime() || created.getTime() > end.getTime()) return null;

    const expire = new Date(created.getTime());
    expire.setDate(expire.getDate() + days);
    if (expire.getTime() <= now.getTime()) return null;

    return {
        isPro: 1,
        proExpireAt: expire.toISOString(),
        proScopes: user.proScopes || JSON.stringify(['all']),
        days: Math.max(1, Math.ceil((expire.getTime() - now.getTime()) / 86400000)),
        trialDays: days
    };
}

function parseEntitlements(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function parseProScopes(raw) {
    if (raw == null || raw === '') return null;
    if (Array.isArray(raw)) return raw.length ? raw : null;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
        return null;
    }
}

function isValidUnlockGameId(gameId) {
    return UNLOCKABLE_GAME_IDS.has(String(gameId || '').trim());
}

function normalizeUnlockGameId(raw) {
    const id = String(raw || '').trim();
    return isValidUnlockGameId(id) ? id : null;
}

/** Extract gameId from promo.proScopes JSON (first valid unlockable id) */
function gameIdFromPromoScopes(raw) {
    const scopes = parseProScopes(raw);
    if (!scopes) return null;
    for (const s of scopes) {
        const id = normalizeUnlockGameId(s);
        if (id) return id;
    }
    return null;
}

function isProActive(user, now = new Date()) {
    if (!user) return false;
    const isPro = user.isPro === 1 || user.isPro === true;
    if (!isPro) return false;
    if (!user.proExpireAt) return true;
    return new Date(user.proExpireAt) > now;
}

function hasLegacyGameCenterScope(user) {
    const scopes = parseProScopes(user?.proScopes);
    return !!(scopes && (scopes.includes('all') || scopes.includes('gamecenter')));
}

function hasGameCenterPass(user, now = new Date()) {
    const ent = parseEntitlements(user?.entitlements);
    const gc = ent.gameCenter;
    if (!gc?.active) return false;
    if (gc.convertedToProAt) return false;
    if (!gc.expireAt) return true;
    return new Date(gc.expireAt) > now;
}

function remainingPassDays(user, now = new Date()) {
    const ent = parseEntitlements(user?.entitlements);
    const gc = ent.gameCenter;
    if (!gc?.active || gc.convertedToProAt) return 0;
    if (gc.expireAt) {
        const ms = new Date(gc.expireAt).getTime() - now.getTime();
        return Math.max(0, Math.ceil(ms / 86400000));
    }
    return Number(process.env.GC_EARLY_ACCESS_DAYS) || DEFAULT_EARLY_ACCESS_DAYS;
}

function isAdminUser(user) {
    if (!user) return false;
    return user.role === 'admin' || user.isAdmin === true || user.isAdmin === 1;
}

function hasGameEntitlement(user, gameId, now = new Date()) {
    const id = normalizeUnlockGameId(gameId);
    if (!id || !user) return false;
    const ent = parseEntitlements(user.entitlements);
    const g = ent.games && ent.games[id];
    if (!g?.active) return false;
    if (!g.expireAt) return true;
    return new Date(g.expireAt) > now;
}

function listActiveGameEntitlements(user, now = new Date()) {
    const ent = parseEntitlements(user?.entitlements);
    const games = ent.games && typeof ent.games === 'object' ? ent.games : {};
    const out = {};
    for (const id of Object.keys(games)) {
        if (!isValidUnlockGameId(id)) continue;
        const g = games[id];
        if (!g?.active) continue;
        if (g.expireAt && new Date(g.expireAt) <= now) continue;
        out[id] = {
            active: true,
            expireAt: g.expireAt || null,
            source: g.source || null,
            grantedAt: g.grantedAt || null
        };
    }
    return out;
}

function hasAnyGameEntitlement(user, now = new Date()) {
    return Object.keys(listActiveGameEntitlements(user, now)).length > 0;
}

function isStandaloneStoreGame(gameId) {
    return STANDALONE_STORE_GAME_IDS.has(String(gameId || '').trim());
}

function isProIncludedGame(gameId) {
    return PRO_INCLUDED_GAME_IDS.has(String(gameId || '').trim());
}

/**
 * Full Game Center tab access (enter library) vs per-game play rights.
 * Reasons that mean PRO/pass (not single-game code): admin, public, pro_*, early_access_pass, legacy_*
 */
function hasFullGameCenterAccess(user, flags = getGameCenterFlags(), now = new Date()) {
    const access = canAccessGameCenter(user, flags, now);
    if (!access.allowed) return false;
    return access.reason !== 'game_unlock';
}

function canAccessGame(user, gameId, flags = getGameCenterFlags(), now = new Date()) {
    if (!user) return { allowed: false, reason: 'login_required' };
    if (isAdminUser(user)) return { allowed: true, reason: 'admin' };

    const id = normalizeUnlockGameId(gameId);
    if (!id) return { allowed: false, reason: 'invalid_game' };

    // Fish / Box / Farm — ต้องซื้อแยก (หรือมีโค้ดเกม)
    if (isStandaloneStoreGame(id)) {
        if (hasGameEntitlement(user, id, now)) {
            return { allowed: true, reason: 'game_unlock' };
        }
        return { allowed: false, reason: 'need_game_purchase' };
    }

    // REPO / Dance Club / Tower / Duck — ต้องเป็น PRO หรือมีโค้ดปลดล็อกเกมนั้น
    if (isProIncludedGame(id)) {
        if (isProActive(user, now)) {
            return { allowed: true, reason: 'pro_subscription' };
        }
        if (hasGameEntitlement(user, id, now)) {
            return { allowed: true, reason: 'game_unlock' };
        }
        return { allowed: false, reason: 'need_pro' };
    }

    if (hasFullGameCenterAccess(user, flags, now)) {
        const full = canAccessGameCenter(user, flags, now);
        return { allowed: true, reason: full.reason || 'full_access' };
    }

    if (hasGameEntitlement(user, id, now)) {
        return { allowed: true, reason: 'game_unlock' };
    }

    return { allowed: false, reason: 'need_game_unlock' };
}

function canAccessGameCenter(user, flags = getGameCenterFlags(), now = new Date()) {
    if (!user) return { allowed: false, reason: 'login_required' };
    if (isAdminUser(user)) return { allowed: true, reason: 'admin' };

    // แพ็กเกจสมาชิก (PRO) ที่ยังไม่หมดอายุ → ปลดล็อกทุกอย่าง
    if (isProActive(user, now)) return { allowed: true, reason: 'pro_subscription' };

    const mode = flags?.mode || 'beta_addon';

    if (mode === 'public') {
        return { allowed: true, reason: 'public' };
    }

    if (mode === 'pro_included') {
        if (hasGameCenterPass(user, now)) return { allowed: true, reason: 'legacy_pass' };
        if (hasLegacyGameCenterScope(user)) return { allowed: true, reason: 'legacy_scope' };
        if (hasAnyGameEntitlement(user, now)) return { allowed: true, reason: 'game_unlock' };
        return { allowed: false, reason: 'need_pro' };
    }

    // beta_addon — Early Access Pass หรือโค้ด/ซื้อเกมเดี่ยว
    if (hasGameCenterPass(user, now)) return { allowed: true, reason: 'early_access_pass' };
    if (hasAnyGameEntitlement(user, now)) return { allowed: true, reason: 'game_unlock' };
    return { allowed: false, reason: 'need_early_access_pass' };
}

function buildGameCenterEntitlement({ days = null, source = 'admin', planId = null, extendFrom = null } = {}) {
    const now = new Date();
    const grantedAt = now.toISOString();
    const passDays = days == null || days === ''
        ? (Number(process.env.GC_EARLY_ACCESS_DAYS) || DEFAULT_EARLY_ACCESS_DAYS)
        : Number(days);
    let expireAt = null;

    if (Number.isFinite(passDays) && passDays > 0) {
        const base = extendFrom && new Date(extendFrom) > now ? new Date(extendFrom) : new Date(now);
        base.setDate(base.getDate() + passDays);
        expireAt = base.toISOString();
    }

    return {
        gameCenter: {
            active: true,
            expireAt,
            source: source || 'admin',
            grantedAt,
            planId: planId || null
        }
    };
}

function mergeGameCenterEntitlement(existingRaw, grantOpts = {}) {
    const ent = parseEntitlements(existingRaw);
    const current = ent.gameCenter;
    const extendFrom = current?.expireAt && new Date(current.expireAt) > new Date()
        ? current.expireAt
        : null;
    const patch = buildGameCenterEntitlement({ ...grantOpts, extendFrom });
    return { ...ent, ...patch };
}

function revokeGameCenterEntitlement(existingRaw) {
    const ent = parseEntitlements(existingRaw);
    if (!ent.gameCenter) return ent;
    return {
        ...ent,
        gameCenter: {
            ...ent.gameCenter,
            active: false,
            revokedAt: new Date().toISOString()
        }
    };
}

function buildGameEntitlement({ gameId, days = null, source = 'promo', extendFrom = null } = {}) {
    const id = normalizeUnlockGameId(gameId);
    if (!id) return null;
    const now = new Date();
    const grantedAt = now.toISOString();
    const passDays = days == null || days === ''
        ? (Number(process.env.GC_GAME_UNLOCK_DAYS) || DEFAULT_GAME_UNLOCK_DAYS)
        : Number(days);
    let expireAt = null;
    if (Number.isFinite(passDays) && passDays > 0) {
        const base = extendFrom && new Date(extendFrom) > now ? new Date(extendFrom) : new Date(now);
        base.setDate(base.getDate() + passDays);
        expireAt = base.toISOString();
    }
    return {
        [id]: {
            active: true,
            expireAt,
            source: source || 'promo',
            grantedAt
        }
    };
}

function mergeGameEntitlement(existingRaw, { gameId, days = null, source = 'promo' } = {}) {
    const id = normalizeUnlockGameId(gameId);
    if (!id) return parseEntitlements(existingRaw);
    const ent = parseEntitlements(existingRaw);
    const games = { ...(ent.games && typeof ent.games === 'object' ? ent.games : {}) };
    const current = games[id];
    const extendFrom = current?.active && current.expireAt && new Date(current.expireAt) > new Date()
        ? current.expireAt
        : null;
    const patch = buildGameEntitlement({ gameId: id, days, source, extendFrom });
    if (!patch) return ent;
    return {
        ...ent,
        games: {
            ...games,
            ...patch
        }
    };
}

/**
 * After beta: convert remaining Early Access Pass days into PRO days.
 * Returns null if nothing to convert, otherwise patch fields for updateUserFields.
 */
function buildPassToProConversion(user, now = new Date()) {
    const flags = getGameCenterFlags(now);
    if (flags.betaActive || flags.mode === 'beta_addon') return null;

    const days = remainingPassDays(user, now);
    if (days <= 0) return null;

    const ent = parseEntitlements(user.entitlements);
    if (!ent.gameCenter?.active || ent.gameCenter.convertedToProAt) return null;

    const base = user.proExpireAt && new Date(user.proExpireAt) > now
        ? new Date(user.proExpireAt)
        : new Date(now);
    base.setDate(base.getDate() + days);

    const nextEnt = {
        ...ent,
        gameCenter: {
            ...ent.gameCenter,
            active: false,
            convertedToProAt: now.toISOString(),
            convertedDays: days
        }
    };

    return {
        isPro: 1,
        proExpireAt: base.toISOString(),
        proScopes: user.proScopes || JSON.stringify(['all']),
        entitlements: JSON.stringify(nextEnt),
        convertedDays: days
    };
}

function entitlementsForApi(raw) {
    const ent = parseEntitlements(raw);
    const gc = ent.gameCenter;
    const games = listActiveGameEntitlements({ entitlements: ent });
    return {
        gameCenter: gc ? {
            active: !!gc.active && !gc.convertedToProAt,
            expireAt: gc.expireAt || null,
            source: gc.source || null,
            grantedAt: gc.grantedAt || null,
            planId: gc.planId || null,
            convertedToProAt: gc.convertedToProAt || null,
            convertedDays: gc.convertedDays || null
        } : null,
        games
    };
}

function gamesAccessForApi(user, flags = getGameCenterFlags(), now = new Date()) {
    const out = {};
    for (const id of UNLOCKABLE_GAME_IDS) {
        out[id] = canAccessGame(user, id, flags, now);
    }
    return out;
}

module.exports = {
    getGameCenterFlags,
    getSignupTrialInfo,
    getSignupProTrialGrant,
    isSignupProTrialEnabled,
    buildSignupProTrialBackfill,
    parseEntitlements,
    canAccessGameCenter,
    canAccessGame,
    hasFullGameCenterAccess,
    buildGameCenterEntitlement,
    mergeGameCenterEntitlement,
    revokeGameCenterEntitlement,
    buildGameEntitlement,
    mergeGameEntitlement,
    hasGameEntitlement,
    hasAnyGameEntitlement,
    listActiveGameEntitlements,
    isValidUnlockGameId,
    normalizeUnlockGameId,
    gameIdFromPromoScopes,
    buildPassToProConversion,
    remainingPassDays,
    entitlementsForApi,
    gamesAccessForApi,
    hasGameCenterPass,
    isProActive,
    isAdminUser,
    isBetaPeriodActive,
    UNLOCKABLE_GAME_IDS,
    STANDALONE_STORE_GAME_IDS,
    PRO_INCLUDED_GAME_IDS,
    isStandaloneStoreGame,
    isProIncludedGame,
    GAME_UNLOCK_LABELS,
    DEFAULT_EARLY_ACCESS_DAYS,
    DEFAULT_GAME_UNLOCK_DAYS,
    DEFAULT_BETA_ENDS_AT
};
