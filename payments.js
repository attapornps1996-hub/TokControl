/**
 * TokControl in-app PRO payments — PromptPay QR + SlipOK verification.
 */
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const ORDER_TTL_MS = 15 * 60 * 1000;
const MAX_SLIP_BYTES = 8 * 1024 * 1024;

const DEFAULT_PLANS = [
    { id: 'pro30', label: 'PRO 30 วัน', days: 30, price: 9.99, productType: 'pro' },
    { id: 'pro90', label: 'PRO 90 วัน', days: 90, price: 19.99, productType: 'pro' },
    {
        id: 'game_fish_30',
        label: 'Fish Control (30 วัน)',
        days: 30,
        price: 399,
        currency: 'THB',
        productType: 'game',
        gameId: 'fish-control'
    },
    {
        id: 'game_box_30',
        label: 'Box Control (30 วัน)',
        days: 30,
        price: 399,
        currency: 'THB',
        productType: 'game',
        gameId: 'minecraft'
    },
    {
        id: 'game_farm_30',
        label: 'Farm Control (30 วัน)',
        days: 30,
        price: 399,
        currency: 'THB',
        productType: 'game',
        gameId: 'farm-control'
    },
    {
        id: 'game_pack3_30',
        label: 'GAME PACK 3 (30 วัน)',
        days: 30,
        price: 999,
        currency: 'THB',
        productType: 'game',
        gameIds: ['farm-control', 'fish-control', 'minecraft'],
        pack: true
    },
    {
        id: 'gc_early_access',
        label: 'Game Center Early Access Pass (30 วัน)',
        days: Number(process.env.GC_EARLY_ACCESS_DAYS) || 30,
        price: Number(process.env.GC_EARLY_ACCESS_PRICE_THB) || 299,
        currency: 'THB',
        productType: 'gamecenter_pass',
        betaOnly: true
    },
    { id: 'cp_15', label: 'Control Point · 15', days: null, price: 29, currency: 'THB', productType: 'coins', coins: 15 },
    { id: 'cp_30', label: 'Control Point · 30', days: null, price: 59, currency: 'THB', productType: 'coins', coins: 30 },
    { id: 'cp_50', label: 'Control Point · 50', days: null, price: 99, currency: 'THB', productType: 'coins', coins: 50 },
    { id: 'cp_110', label: 'Control Point · 110', days: null, price: 199, currency: 'THB', productType: 'coins', coins: 110 },
    { id: 'cp_250', label: 'Control Point · 250', days: null, price: 449, currency: 'THB', productType: 'coins', coins: 250 },
    { id: 'cp_700', label: 'Control Point · 700', days: null, price: 1299, currency: 'THB', productType: 'coins', coins: 700 }
];

/** PRO packs shown in Store subscription tab */
const STORE_PRO_PLAN_IDS = new Set(['pro30', 'pro90']);
/** Games sold separately (PRO ไม่ปลดให้) */
const STANDALONE_STORE_GAME_IDS = new Set(['fish-control', 'minecraft', 'farm-control']);

/**
 * แคตตาล็อกหน้าร้านแบบ hardcode — ใช้เมื่อ env/Cloud ยังไม่มีแพ็ก
 * (กันเคสสร้างออเดอร์แล้วได้ "ไม่พบแพ็กเกจ")
 */
function getBuiltinStorePlan(planId) {
    const id = String(planId || '').trim();
    if (!id) return null;
    return DEFAULT_PLANS.map(normalizePlanRow).find((p) => p.id === id) || null;
}

function resolveCheckoutPlan(planId, cfg) {
    const id = String(planId || '').trim();
    if (!id) return null;
    const rate = cfg?.usdThbRate || getUsdThbRate();
    let plan = (cfg?.plans || []).find((p) => p.id === id) || null;
    if (!plan) {
        plan = parsePlans(rate).find((p) => p.id === id) || null;
    }
    if (!plan) {
        const builtin = getBuiltinStorePlan(id);
        if (builtin) plan = enrichPlan(builtin, rate);
    }
    return plan || null;
}

const FX_CACHE_TTL_MS = Math.max(5, Number(process.env.PAYMENT_FX_CACHE_MINUTES) || 30) * 60 * 1000;
let fxCache = { rate: null, source: null, fetchedAt: 0 };

/** Fallback only when live FX APIs fail */
function getFallbackUsdThbRate() {
    const n = Number(process.env.PAYMENT_USD_THB_RATE);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10000) / 10000;
    return 36.5;
}

function getPriceCurrency() {
    const c = String(process.env.PAYMENT_PRICE_CURRENCY || 'USD').trim().toUpperCase();
    return c === 'THB' ? 'THB' : 'USD';
}

function roundMoney(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

async function fetchLiveUsdThbRate() {
    // 1) Frankfurter — Bank of Thailand provider when available
    try {
        const bot = await axios.get('https://api.frankfurter.dev/v1/latest', {
            params: { from: 'USD', to: 'THB' },
            timeout: 8000,
            validateStatus: () => true
        });
        const botRate = Number(bot.data?.rates?.THB);
        if (bot.status >= 200 && bot.status < 300 && Number.isFinite(botRate) && botRate > 0) {
            return { rate: Math.round(botRate * 10000) / 10000, source: 'frankfurter' };
        }
    } catch (e) {
        console.warn('[payments] frankfurter FX failed:', e.message);
    }

    // 2) ExchangeRate-API open access
    try {
        const er = await axios.get('https://open.er-api.com/v6/latest/USD', {
            timeout: 8000,
            validateStatus: () => true
        });
        const erRate = Number(er.data?.rates?.THB);
        if (er.status >= 200 && er.status < 300 && er.data?.result === 'success' && Number.isFinite(erRate) && erRate > 0) {
            return { rate: Math.round(erRate * 10000) / 10000, source: 'exchangerate-api' };
        }
    } catch (e) {
        console.warn('[payments] open.er-api FX failed:', e.message);
    }

    return null;
}

/**
 * Live USD→THB rate with short cache. Falls back to PAYMENT_USD_THB_RATE.
 */
async function resolveUsdThbRate({ force = false } = {}) {
    const now = Date.now();
    if (!force && fxCache.rate && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
        return {
            rate: fxCache.rate,
            source: fxCache.source || 'cache',
            cached: true,
            fetchedAt: fxCache.fetchedAt
        };
    }

    const live = await fetchLiveUsdThbRate();
    if (live) {
        fxCache = { rate: live.rate, source: live.source, fetchedAt: now };
        return { rate: live.rate, source: live.source, cached: false, fetchedAt: now };
    }

    const fallback = getFallbackUsdThbRate();
    // Keep serving last good live rate if still somewhat fresh (< 24h)
    if (fxCache.rate && (now - fxCache.fetchedAt) < 24 * 60 * 60 * 1000) {
        return {
            rate: fxCache.rate,
            source: `${fxCache.source || 'cache'}-stale`,
            cached: true,
            fetchedAt: fxCache.fetchedAt
        };
    }
    fxCache = { rate: fallback, source: 'fallback', fetchedAt: now };
    return { rate: fallback, source: 'fallback', cached: false, fetchedAt: now };
}

/** @deprecated use resolveUsdThbRate — sync fallback for helpers */
function getUsdThbRate() {
    return fxCache.rate || getFallbackUsdThbRate();
}

function toPromptPayAmount(listPrice, currency = getPriceCurrency(), rate = getUsdThbRate()) {
    const price = Number(listPrice) || 0;
    if (String(currency).toUpperCase() === 'THB') {
        return { amountThb: roundMoney(price), listPrice: roundMoney(price), listCurrency: 'THB', fxRate: 1 };
    }
    const amountThb = roundMoney(price * rate);
    return {
        amountThb,
        listPrice: roundMoney(price),
        listCurrency: 'USD',
        fxRate: rate
    };
}

function enrichPlan(plan, rate = getUsdThbRate()) {
    const planCurrency = String(plan.currency || getPriceCurrency()).toUpperCase() === 'THB' ? 'THB' : getPriceCurrency();
    const priced = toPromptPayAmount(plan.price, planCurrency, rate);
    return {
        ...plan,
        productType: plan.productType || 'pro',
        price: priced.listPrice,
        currency: priced.listCurrency,
        priceThb: priced.amountThb,
        fxRate: priced.fxRate
    };
}

function normalizePlanRow(p) {
    const productType = p.productType || 'pro';
    const daysRaw = p.days;
    const days = daysRaw == null || daysRaw === ''
        ? null
        : Math.max(1, parseInt(daysRaw, 10) || 0);
    const gameId = p.gameId ? String(p.gameId).trim() : null;
    const gameIds = Array.isArray(p.gameIds)
        ? p.gameIds.map((id) => String(id || '').trim()).filter(Boolean)
        : (gameId ? [gameId] : []);
    const coins = productType === 'coins'
        ? Math.max(1, parseInt(p.coins, 10) || 0)
        : null;
    return {
        id: String(p.id || '').trim(),
        label: String(p.label || p.id || 'PRO').trim(),
        days,
        price: Math.round((Number(p.price) || 0) * 100) / 100,
        currency: p.currency || undefined,
        productType,
        coins,
        gameId: productType === 'game' ? (gameId || gameIds[0] || null) : null,
        gameIds: productType === 'game' ? gameIds : [],
        pack: !!(p.pack || (gameIds.length > 1)),
        betaOnly: !!p.betaOnly
    };
}

function parsePlans(rate = getUsdThbRate()) {
    const { getGameCenterFlags } = require('./game-center-access');
    const gcFlags = getGameCenterFlags();
    const raw = (process.env.PAYMENT_PLANS || '').trim();
    const defaults = DEFAULT_PLANS.map(normalizePlanRow);
    let plans = defaults.slice();
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) {
                const fromEnv = parsed
                    .map(normalizePlanRow)
                    .filter((p) => p.id && p.price > 0 && (
                        p.productType === 'gamecenter_pass'
                        || p.productType === 'game'
                        || p.productType === 'coins'
                        || (p.days && p.days > 0)
                    ));
                if (fromEnv.length) {
                    // env ทับ id เดิม — แล้วเติมสินค้าหน้าร้านที่ขาด (pro30/pro90 + เกมแยก)
                    const byId = new Map();
                    for (const p of defaults) byId.set(p.id, p);
                    for (const p of fromEnv) byId.set(p.id, p);
                    plans = [...byId.values()];
                }
            }
        } catch (e) {
            console.warn('[payments] Invalid PAYMENT_PLANS JSON, using defaults');
        }
    }
    // ไม่โชว์แพ็ก PRO เก่าที่เลิกขายแล้ว
    plans = plans.filter((p) => !(p.productType === 'pro' && !STORE_PRO_PLAN_IDS.has(p.id)));
    if (!gcFlags.purchaseEnabled) {
        plans = plans.filter((p) => p.productType !== 'gamecenter_pass' && !p.betaOnly);
    }
    return plans.map((p) => enrichPlan(p, rate));
}

async function getPaymentConfigAsync() {
    const fx = await resolveUsdThbRate();
    const promptpayId = String(process.env.PROMPTPAY_ID || '').replace(/\s+/g, '');
    const promptpayName = String(process.env.PROMPTPAY_NAME || 'TokControl').trim() || 'TokControl';
    const slipokBranchId = String(process.env.SLIPOK_BRANCH_ID || '').trim();
    const slipokApiKey = String(process.env.SLIPOK_API_KEY || '').trim();
    const plans = parsePlans(fx.rate);
    const configured = Boolean(promptpayId);
    const slipokReady = Boolean(slipokBranchId && slipokApiKey);
    const devAutoApprove = process.env.NODE_ENV === 'production'
        ? false
        : process.env.PAYMENT_DEV_AUTO_APPROVE === '1';
    return {
        promptpayId,
        promptpayName,
        slipokBranchId,
        slipokApiKey,
        plans,
        configured,
        slipokReady,
        devAutoApprove,
        priceCurrency: getPriceCurrency(),
        usdThbRate: fx.rate,
        fxSource: fx.source,
        fxFetchedAt: fx.fetchedAt
    };
}

function getPaymentConfig() {
    const promptpayId = String(process.env.PROMPTPAY_ID || '').replace(/\s+/g, '');
    const promptpayName = String(process.env.PROMPTPAY_NAME || 'TokControl').trim() || 'TokControl';
    const slipokBranchId = String(process.env.SLIPOK_BRANCH_ID || '').trim();
    const slipokApiKey = String(process.env.SLIPOK_API_KEY || '').trim();
    const rate = getUsdThbRate();
    const plans = parsePlans(rate);
    const configured = Boolean(promptpayId);
    const slipokReady = Boolean(slipokBranchId && slipokApiKey);
    const devAutoApprove = process.env.NODE_ENV === 'production'
        ? false
        : process.env.PAYMENT_DEV_AUTO_APPROVE === '1';
    return {
        promptpayId,
        promptpayName,
        slipokBranchId,
        slipokApiKey,
        plans,
        configured,
        slipokReady,
        devAutoApprove,
        priceCurrency: getPriceCurrency(),
        usdThbRate: rate,
        fxSource: fxCache.source || 'fallback',
        fxFetchedAt: fxCache.fetchedAt || 0
    };
}

function maskPromptPayId(id) {
    const s = String(id || '');
    if (s.length <= 4) return '****';
    return `${s.slice(0, 3)}${'*'.repeat(Math.max(2, s.length - 5))}${s.slice(-2)}`;
}

function newOrderId() {
    return `PAY-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function computeProExpireAt(user, addDays) {
    const now = new Date();
    let base = user && user.proExpireAt ? new Date(user.proExpireAt) : now;
    if (Number.isNaN(base.getTime()) || base < now) base = now;
    base.setDate(base.getDate() + Math.max(1, parseInt(addDays, 10) || 0));
    return base.toISOString();
}

async function buildPromptPayQr(promptpayId, amount) {
    const payload = generatePayload(promptpayId, { amount: Number(amount) });
    const qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: { dark: '#000000', light: '#ffffff' }
    });
    return { payload, qrDataUrl };
}

async function verifySlipWithSlipOK({ branchId, apiKey, amount, imageBuffer, filename }) {
    const url = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`;
    const form = new FormData();
    form.append('files', imageBuffer, { filename: filename || 'slip.jpg', contentType: 'image/jpeg' });
    form.append('amount', String(amount));
    form.append('log', 'true');

    const res = await axios.post(url, form, {
        headers: {
            ...form.getHeaders(),
            'x-authorization': apiKey
        },
        timeout: 30000,
        maxContentLength: 20 * 1024 * 1024,
        validateStatus: () => true
    });

    const body = res.data || {};
    if (res.status >= 200 && res.status < 300 && body.success) {
        const data = body.data || {};
        const ref =
            data.transRef ||
            data.qrcodeData ||
            data.payload ||
            data.ref ||
            (data.transDate && data.amount != null ? `${data.transDate}_${data.amount}` : null);
        return {
            ok: true,
            ref: ref ? String(ref) : null,
            amount: data.amount != null ? Number(data.amount) : Number(amount),
            meta: data
        };
    }

    const code = body.code != null ? Number(body.code) : null;
    let message = body.message || body.msg || `SlipOK error (${res.status})`;
    if (code === 1012) message = 'สลิปนี้ถูกใช้งานไปแล้ว';
    else if (code === 1013) message = 'จำนวนเงินในสลิปไม่ตรงกับออเดอร์';
    else if (code === 1014) message = 'บัญชีผู้รับในสลิปไม่ตรงกับ PromptPay ของร้าน';
    return { ok: false, code, message, meta: body };
}

function parseDataUrlImage(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!m) return null;
    const mime = m[1] || 'image/jpeg';
    const buf = Buffer.from(m[2], 'base64');
    let ext = 'jpg';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('gif')) ext = 'gif';
    return { buffer: buf, mime, filename: `slip.${ext}` };
}

function parseOrderMeta(order) {
    try {
        if (!order?.slipMeta) return {};
        return typeof order.slipMeta === 'string' ? JSON.parse(order.slipMeta) : (order.slipMeta || {});
    } catch (e) {
        return {};
    }
}

function mergeOrderMeta(order, patch) {
    return JSON.stringify({ ...parseOrderMeta(order), ...patch });
}

function publicOrder(order, extra = {}) {
    if (!order) return null;
    const meta = parseOrderMeta(order);
    const listPrice = meta.listPrice != null ? Number(meta.listPrice) : null;
    const listCurrency = meta.listCurrency || null;
    const fxRate = meta.fxRate != null ? Number(meta.fxRate) : null;
    return {
        id: order.id,
        planId: order.planId,
        days: order.days,
        amount: order.amount,
        amountThb: Number(order.amount),
        listPrice,
        listCurrency,
        fxRate,
        productType: meta.productType || null,
        gameId: meta.gameId || null,
        gameIds: Array.isArray(meta.gameIds) ? meta.gameIds : null,
        status: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt || null,
        hasSlipImage: !!(meta.slipImageDataUrl || meta.slipImage),
        slipSha256: meta.slipSha256 || null,
        ...extra
    };
}

/** In-memory rate limit for payment endpoints */
const payRateBuckets = new Map();
function checkPayRateLimit(key, max, windowMs) {
    const now = Date.now();
    let b = payRateBuckets.get(key);
    if (!b || now > b.resetAt) {
        b = { n: 0, resetAt: now + windowMs };
        payRateBuckets.set(key, b);
    }
    if (b.n >= max) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
    }
    b.n += 1;
    return { ok: true };
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

const MAX_STORED_SLIP_CHARS = 350000; // ~260KB base64 data URL

function buildSlipStoragePatch(parsed, slipDataUrl, slipResult) {
    const patch = {
        slip: slipResult?.meta || {},
        slipMime: parsed?.mime || null,
        slipBytes: parsed?.buffer?.length || 0,
        slipSha256: parsed?.buffer ? crypto.createHash('sha256').update(parsed.buffer).digest('hex') : null
    };
    const raw = String(slipDataUrl || '');
    if (raw && raw.length <= MAX_STORED_SLIP_CHARS) {
        patch.slipImageDataUrl = raw;
    }
    return patch;
}

/**
 * Register payment routes on an Express app.
 * @param {import('express').Express} app
 * @param {object} deps
 */
function registerPaymentRoutes(app, deps) {
    const {
        jwt,
        JWT_SECRET,
        getUserById,
        updateUserProStatus,
        updateUserFields,
        createPaymentOrder,
        getPaymentOrder,
        updatePaymentOrder,
        listPaymentOrders,
        findPaymentOrderBySlipRef,
        isAdminUser,
        claimPaymentOrder
    } = deps;

    const {
        mergeGameCenterEntitlement,
        mergeGameEntitlement,
        entitlementsForApi,
        parseEntitlements
    } = require('./game-center-access');
    const { notifyPaymentPaid } = require('./admin_notify');

    async function authUser(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        if (!token) return null;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await getUserById(decoded.userId);
            if (!user) return null;
            return { decoded, user };
        } catch (e) {
            return null;
        }
    }

    async function expireIfNeeded(order) {
        if (!order || order.status !== 'pending') return order;
        const exp = order.expiresAt ? new Date(order.expiresAt).getTime() : 0;
        if (exp && Date.now() > exp) {
            await updatePaymentOrder(order.id, { status: 'cancelled' });
            return { ...order, status: 'cancelled' };
        }
        return order;
    }

    async function grantProForOrder(user, order) {
        const proExpireAt = computeProExpireAt(user, order.days);
        await updateUserProStatus(user.username, 1, proExpireAt);
        return { type: 'pro', proExpireAt };
    }

    async function grantGameCenterForOrder(user, order, plan) {
        if (!updateUserFields) throw new Error('updateUserFields not configured');
        const entitlements = mergeGameCenterEntitlement(user.entitlements, {
            days: plan?.days ?? order.days ?? null,
            source: 'purchase',
            planId: plan?.id || order.planId
        });
        await updateUserFields(user.username, {
            entitlements: typeof entitlements === 'string' ? entitlements : JSON.stringify(entitlements)
        });
        return {
            type: 'gamecenter_pass',
            entitlements: entitlementsForApi(entitlements)
        };
    }

    async function grantStandaloneGameForOrder(user, order, plan) {
        if (!updateUserFields) throw new Error('updateUserFields not configured');
        const meta = parseOrderMeta(order);
        const ids = [];
        if (Array.isArray(plan?.gameIds) && plan.gameIds.length) {
            for (const id of plan.gameIds) if (id) ids.push(String(id));
        } else if (Array.isArray(meta.gameIds) && meta.gameIds.length) {
            for (const id of meta.gameIds) if (id) ids.push(String(id));
        } else {
            const one = plan?.gameId || meta.gameId;
            if (one) ids.push(String(one));
        }
        if (!ids.length) throw new Error('missing gameId for game product');
        let entitlements = user.entitlements;
        for (const gameId of ids) {
            entitlements = mergeGameEntitlement(entitlements, {
                gameId,
                days: plan?.days ?? order.days ?? 30,
                source: 'purchase'
            });
        }
        await updateUserFields(user.username, {
            entitlements: typeof entitlements === 'string' ? entitlements : JSON.stringify(entitlements)
        });
        return {
            type: 'game',
            gameId: ids[0],
            gameIds: ids,
            entitlements: entitlementsForApi(entitlements)
        };
    }

    async function grantCoinsForOrder() {
        throw new Error('Control Point ยังไม่เปิดให้ซื้อ');
    }

    async function tryClaimOrder(order) {
        if (!order) return null;
        if (typeof claimPaymentOrder === 'function') {
            return claimPaymentOrder(order.id, ['pending']);
        }
        if (order.status !== 'pending') return null;
        await updatePaymentOrder(order.id, { status: 'processing' });
        return { ...order, status: 'processing' };
    }

    async function fulfillPaidOrder(user, order, cfg) {
        const plan = resolveCheckoutPlan(order.planId, cfg)
            || (cfg?.plans || []).find((p) => p.id === order.planId)
            || null;
        const productType = plan?.productType || parseOrderMeta(order).productType || 'pro';
        if (productType === 'gamecenter_pass') {
            return grantGameCenterForOrder(user, order, plan);
        }
        if (productType === 'game') {
            return grantStandaloneGameForOrder(user, order, plan);
        }
        if (productType === 'coins') {
            throw new Error('Control Point ยังไม่เปิดให้ซื้อ');
        }
        return grantProForOrder(user, order);
    }

    app.get('/api/payments/plans', async (req, res) => {
        try {
            const cfg = await getPaymentConfigAsync();
            res.json({
                success: true,
                configured: cfg.configured,
                slipokReady: cfg.slipokReady,
                priceCurrency: cfg.priceCurrency,
                usdThbRate: cfg.usdThbRate,
                fxSource: cfg.fxSource,
                fxFetchedAt: cfg.fxFetchedAt,
                plans: (cfg.plans || []).filter((p) => (p.productType || 'pro') !== 'coins'),
                discordUrl: 'https://discord.gg/pandyapp'
            });
        } catch (err) {
            console.error('[payments] plans', err);
            res.status(500).json({ error: 'ไม่สามารถโหลดแพ็กเกจได้' });
        }
    });

    app.post('/api/payments/create', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนซื้อ PRO' });

            const rate = checkPayRateLimit(`create:${auth.user.id}:${clientIp(req)}`, 12, 15 * 60 * 1000);
            if (!rate.ok) {
                res.set('Retry-After', String(rate.retryAfterSec));
                return res.status(429).json({ error: `สร้างออเดอร์บ่อยเกินไป — รอ ${rate.retryAfterSec} วินาที` });
            }

            // Fresh FX at checkout so PromptPay amount matches market rate
            await resolveUsdThbRate({ force: true });
            const cfg = await getPaymentConfigAsync();
            if (!cfg.configured) {
                return res.status(503).json({
                    error: 'ยังไม่ได้ตั้งค่า PromptPay บนเซิร์ฟเวอร์',
                    fallbackDiscord: true,
                    discordUrl: 'https://discord.gg/pandyapp'
                });
            }

            const planId = String(req.body?.planId || '').trim();
            const plan = resolveCheckoutPlan(planId, cfg);
            if (!plan) {
                return res.status(400).json({
                    error: 'ไม่พบแพ็กเกจที่เลือก',
                    planId,
                    hint: 'Cloud ยังไม่มีแพ็กนี้ในระบบ — ต้อง deploy/อัปเดต PAYMENT_PLANS'
                });
            }
            if ((plan.productType || 'pro') === 'coins') {
                return res.status(503).json({ error: 'Control Point ยังไม่เปิดให้ซื้อ (SOON)' });
            }

            const amountThb = Number(plan.priceThb) || toPromptPayAmount(plan.price, plan.currency).amountThb;
            if (!(amountThb > 0)) return res.status(400).json({ error: 'ยอดชำระไม่ถูกต้อง' });

            const { payload, qrDataUrl } = await buildPromptPayQr(cfg.promptpayId, amountThb);
            const now = new Date();
            const pricingMeta = {
                listPrice: plan.price,
                listCurrency: plan.currency || 'USD',
                fxRate: plan.fxRate || cfg.usdThbRate,
                amountThb,
                fxSource: cfg.fxSource,
                productType: plan.productType || 'pro',
                coins: plan.coins || null,
                gameId: plan.gameId || null,
                gameIds: Array.isArray(plan.gameIds) ? plan.gameIds : (plan.gameId ? [plan.gameId] : [])
            };
            const order = {
                id: newOrderId(),
                userId: String(auth.user.id),
                username: auth.user.username,
                planId: plan.id,
                days: plan.days,
                amount: amountThb,
                status: 'pending',
                qrPayload: payload,
                slipRef: null,
                slipMeta: JSON.stringify(pricingMeta),
                createdAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + ORDER_TTL_MS).toISOString(),
                paidAt: null
            };

            await createPaymentOrder(order);

            res.json({
                success: true,
                order: publicOrder(order),
                qrDataUrl,
                planLabel: plan.label,
                amountThb,
                listPrice: pricingMeta.listPrice,
                listCurrency: pricingMeta.listCurrency,
                fxRate: pricingMeta.fxRate,
                fxSource: pricingMeta.fxSource
            });
        } catch (err) {
            console.error('[payments] create', err);
            res.status(500).json({ error: 'สร้างออเดอร์ไม่สำเร็จ' });
        }
    });

    app.get('/api/payments/order/:id', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'No token' });

            let order = await getPaymentOrder(req.params.id);
            if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
            if (String(order.userId) !== String(auth.user.id) && !(await isAdminUser(auth.user.id))) {
                return res.status(403).json({ error: 'ไม่มีสิทธิ์ดูออเดอร์นี้' });
            }
            order = await expireIfNeeded(order);
            res.json({ success: true, order: publicOrder(order) });
        } catch (err) {
            console.error('[payments] get order', err);
            res.status(500).json({ error: 'โหลดออเดอร์ไม่สำเร็จ' });
        }
    });

    app.post('/api/payments/verify-slip', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

            const rate = checkPayRateLimit(`verify:${auth.user.id}:${clientIp(req)}`, 20, 15 * 60 * 1000);
            if (!rate.ok) {
                res.set('Retry-After', String(rate.retryAfterSec));
                return res.status(429).json({ error: `ตรวจสอบสลิปบ่อยเกินไป — รอ ${rate.retryAfterSec} วินาที` });
            }

            const orderId = String(req.body?.orderId || '').trim();
            const slipDataUrl = req.body?.slipDataUrl || req.body?.image || '';
            if (!orderId) return res.status(400).json({ error: 'ไม่พบหมายเลขออเดอร์' });

            let order = await getPaymentOrder(orderId);
            if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
            if (String(order.userId) !== String(auth.user.id)) {
                return res.status(403).json({ error: 'ออเดอร์นี้ไม่ใช่ของคุณ' });
            }
            order = await expireIfNeeded(order);
            if (order.status === 'paid' || order.status === 'manual') {
                const fresh = await getUserById(auth.user.id);
                const meta = parseOrderMeta(order);
                return res.json({
                    success: true,
                    alreadyPaid: true,
                    order: publicOrder(order),
                    isPro: meta.productType === 'pro' || (!meta.productType && !!fresh?.isPro),
                    proExpireAt: fresh?.proExpireAt || null,
                    entitlements: fresh?.entitlements ? (typeof entitlementsForApi === 'function' ? entitlementsForApi(parseEntitlements(fresh.entitlements)) : fresh.entitlements) : null,
                    productType: meta.productType || 'pro',
                    message: 'ออเดอร์นี้ชำระเงินแล้ว'
                });
            }
            if (order.status === 'processing') {
                return res.status(409).json({ error: 'ออเดอร์นี้กำลังมอบสิทธิ์ กรุณารอสักครู่แล้วรีเฟรช' });
            }
            if (order.status !== 'pending') {
                return res.status(400).json({ error: 'ออเดอร์หมดอายุหรือถูกยกเลิกแล้ว กรุณาสร้างออเดอร์ใหม่' });
            }

            const parsed = parseDataUrlImage(slipDataUrl);
            if (!parsed || !parsed.buffer?.length) {
                return res.status(400).json({ error: 'กรุณาอัปโหลดรูปสลิป (JPG/PNG)' });
            }
            if (parsed.buffer.length > MAX_SLIP_BYTES) {
                return res.status(400).json({ error: 'ไฟล์สลิปใหญ่เกินไป (สูงสุด 8MB)' });
            }

            const cfg = getPaymentConfig();
            let slipResult;

            if (cfg.slipokReady) {
                slipResult = await verifySlipWithSlipOK({
                    branchId: cfg.slipokBranchId,
                    apiKey: cfg.slipokApiKey,
                    amount: order.amount,
                    imageBuffer: parsed.buffer,
                    filename: parsed.filename
                });
            } else if (cfg.devAutoApprove) {
                slipResult = {
                    ok: true,
                    ref: `DEV-${order.id}`,
                    amount: order.amount,
                    meta: { dev: true }
                };
            } else {
                return res.status(503).json({
                    error: 'ยังไม่ได้ตั้งค่า SlipOK — อัปโหลดสลิปอัตโนมัติยังใช้ไม่ได้ กรุณาติดต่อแอดมินหรือ Discord',
                    fallbackDiscord: true,
                    discordUrl: 'https://discord.gg/pandyapp',
                    needsManual: true
                });
            }

            if (!slipResult.ok) {
                return res.status(400).json({ error: slipResult.message || 'ตรวจสอบสลิปไม่สำเร็จ' });
            }
            if (slipResult.amount != null && Number.isFinite(Number(slipResult.amount))) {
                const paid = Number(slipResult.amount);
                const expect = Number(order.amount);
                if (Math.abs(paid - expect) > 0.05) {
                    return res.status(400).json({ error: `ยอดในสลิปไม่ตรงกับออเดอร์ (ได้ ${paid} คาด ${expect})` });
                }
            }

            if (slipResult.ref) {
                const dup = await findPaymentOrderBySlipRef(slipResult.ref);
                if (dup && String(dup.id) !== String(order.id)) {
                    return res.status(400).json({ error: 'สลิปนี้ถูกใช้กับออเดอร์อื่นแล้ว' });
                }
            }

            const paidAt = new Date().toISOString();
            const slipPatch = buildSlipStoragePatch(parsed, slipDataUrl, slipResult);
            await updatePaymentOrder(order.id, {
                slipRef: slipResult.ref || order.id,
                slipMeta: mergeOrderMeta(order, { ...slipPatch, verifiedAt: paidAt, grantStatus: 'pending' })
            });
            order = await getPaymentOrder(order.id) || order;

            const claimed = await tryClaimOrder(order);
            if (!claimed) {
                const fresh = await getPaymentOrder(order.id);
                if (fresh && (fresh.status === 'paid' || fresh.status === 'manual')) {
                    const freshUser = await getUserById(auth.user.id);
                    const meta = parseOrderMeta(fresh);
                    return res.json({
                        success: true,
                        alreadyPaid: true,
                        order: publicOrder(fresh),
                        isPro: meta.productType === 'pro' || (!meta.productType && !!freshUser?.isPro),
                        proExpireAt: freshUser?.proExpireAt || null,
                        entitlements: freshUser?.entitlements ? (typeof entitlementsForApi === 'function' ? entitlementsForApi(parseEntitlements(freshUser.entitlements)) : freshUser.entitlements) : null,
                        productType: meta.productType || 'pro',
                        message: 'ออเดอร์นี้ชำระเงินแล้ว'
                    });
                }
                if (fresh && fresh.status === 'processing') {
                    return res.status(409).json({ error: 'ออเดอร์นี้กำลังมอบสิทธิ์ กรุณารอสักครู่แล้วรีเฟรช' });
                }
                return res.status(400).json({ error: 'ไม่สามารถล็อกออเดอร์ได้ กรุณาลองใหม่' });
            }
            order = claimed;

            const payCfg = await getPaymentConfigAsync();
            let reward;
            try {
                reward = await fulfillPaidOrder(auth.user, order, payCfg);
            } catch (grantErr) {
                console.error('[payments] grant failed after slip ok', grantErr);
                await updatePaymentOrder(order.id, {
                    status: 'pending',
                    slipMeta: mergeOrderMeta(order, {
                        ...slipPatch,
                        verifiedAt: paidAt,
                        grantStatus: 'failed',
                        grantError: String(grantErr.message || grantErr)
                    })
                });
                return res.status(500).json({
                    error: 'สลิปผ่านแล้ว แต่มอบสิทธิ์ไม่สำเร็จ — แอดมินจะตรวจสอบให้',
                    needsManual: true,
                    orderId: order.id
                });
            }

            await updatePaymentOrder(order.id, {
                status: 'paid',
                slipRef: slipResult.ref || order.id,
                slipMeta: mergeOrderMeta(order, {
                    ...slipPatch,
                    verifiedAt: paidAt,
                    grantStatus: 'ok',
                    productType: reward.type
                }),
                paidAt
            });

            const updatedOrder = await getPaymentOrder(order.id);
            notifyPaymentPaid({
                order: updatedOrder || order,
                username: auth.user.username,
                productType: reward.type,
                planLabel: (payCfg.plans || []).find((p) => p.id === order.planId)?.label || order.planId,
                via: 'auto'
            }).catch(() => {});

            const message = reward.type === 'gamecenter_pass'
                ? 'ชำระเงินสำเร็จ! ได้รับ Game Center Early Access Pass แล้ว'
                : reward.type === 'game'
                    ? `ชำระเงินสำเร็จ! ปลดล็อกเกมแล้ว (${(reward.gameIds || [reward.gameId]).filter(Boolean).join(', ') || 'game'})`
                    : reward.type === 'coins'
                        ? `ชำระเงินสำเร็จ! ได้รับ ${Number(reward.coins || 0).toLocaleString('en-US')} Control Point`
                    : `ชำระเงินสำเร็จ! ได้รับ PRO เพิ่ม ${order.days} วัน`;

            res.json({
                success: true,
                order: publicOrder(updatedOrder),
                isPro: reward.type === 'pro',
                proExpireAt: reward.proExpireAt || null,
                entitlements: reward.entitlements || null,
                gameId: reward.gameId || null,
                gameIds: reward.gameIds || null,
                coins: reward.coins || null,
                productType: reward.type,
                message
            });
        } catch (err) {
            console.error('[payments] verify-slip', err);
            res.status(500).json({ error: 'ตรวจสอบสลิปล้มเหลว กรุณาลองใหม่' });
        }
    });

    app.get('/api/admin/payments', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'No token' });
            if (!(await isAdminUser(auth.user.id))) {
                return res.status(403).json({ error: 'สิทธิ์แอดมินเท่านั้น' });
            }
            const list = await listPaymentOrders(100);
            const orders = [];
            for (const row of list) {
                orders.push(await expireIfNeeded(row));
            }
            res.json({ success: true, orders: orders.map((o) => {
                const meta = parseOrderMeta(o);
                return publicOrder(o, {
                    username: o.username,
                    slipRef: o.slipRef || null,
                    productType: meta.productType || null,
                    grantStatus: meta.grantStatus || null,
                    hasSlipImage: !!(meta.slipImageDataUrl || meta.slipImage)
                });
            }) });
        } catch (err) {
            console.error('[payments] admin list', err);
            res.status(500).json({ error: 'โหลดรายการชำระเงินไม่สำเร็จ' });
        }
    });

    app.get('/api/admin/payments/:id/slip', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'No token' });
            if (!(await isAdminUser(auth.user.id))) {
                return res.status(403).json({ error: 'สิทธิ์แอดมินเท่านั้น' });
            }
            const order = await getPaymentOrder(req.params.id);
            if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
            const meta = parseOrderMeta(order);
            const img = meta.slipImageDataUrl || meta.slipImage || null;
            if (!img) {
                return res.status(404).json({
                    error: 'ไม่มีรูปสลิปเก็บไว้',
                    slipRef: order.slipRef || null,
                    slipSha256: meta.slipSha256 || null,
                    slipMeta: meta.slip || null
                });
            }
            res.json({
                success: true,
                orderId: order.id,
                slipRef: order.slipRef || null,
                slipImageDataUrl: img,
                slipSha256: meta.slipSha256 || null
            });
        } catch (err) {
            console.error('[payments] admin slip', err);
            res.status(500).json({ error: 'โหลดสลิปไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/payments/:id/confirm', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'No token' });
            if (!(await isAdminUser(auth.user.id))) {
                return res.status(403).json({ error: 'สิทธิ์แอดมินเท่านั้น' });
            }

            let order = await getPaymentOrder(req.params.id);
            if (!order) return res.status(404).json({ error: 'ไม่พบออเดอร์' });
            if (order.status === 'paid' || order.status === 'manual') {
                return res.json({ success: true, message: 'ออเดอร์นี้ยืนยันไปแล้ว', order: publicOrder(order) });
            }

            const targetUser = await getUserById(order.userId);
            if (!targetUser) return res.status(404).json({ error: 'ไม่พบผู้ใช้ของออเดอร์' });

            if (order.status === 'pending') {
                const claimed = await tryClaimOrder(order);
                if (!claimed) {
                    const fresh = await getPaymentOrder(order.id);
                    if (fresh && (fresh.status === 'paid' || fresh.status === 'manual')) {
                        return res.json({ success: true, message: 'ออเดอร์นี้ยืนยันไปแล้ว', order: publicOrder(fresh) });
                    }
                    return res.status(409).json({ error: 'ออเดอร์นี้กำลังถูกยืนยันจากที่อื่น' });
                }
                order = claimed;
            } else if (order.status !== 'processing') {
                return res.status(400).json({ error: 'ออเดอร์นี้ยืนยันไม่ได้ในสถานะปัจจุบัน' });
            }

            const paidAt = new Date().toISOString();
            const cfg = await getPaymentConfigAsync();
            const existingMeta = parseOrderMeta(order);
            let reward;
            try {
                if (existingMeta.grantStatus === 'ok' && existingMeta.productType) {
                    reward = { type: existingMeta.productType, coins: existingMeta.coins || null };
                } else {
                    reward = await fulfillPaidOrder(targetUser, order, cfg);
                }
            } catch (grantErr) {
                console.error('[payments] admin confirm grant failed', grantErr);
                await updatePaymentOrder(order.id, { status: 'pending' });
                return res.status(500).json({ error: `มอบสิทธิ์ไม่สำเร็จ: ${grantErr.message || grantErr}` });
            }

            await updatePaymentOrder(order.id, {
                status: 'manual',
                slipRef: order.slipRef || `MANUAL-${auth.user.username}`,
                slipMeta: mergeOrderMeta(order, {
                    confirmedBy: auth.user.username,
                    note: req.body?.note || '',
                    verifiedAt: paidAt,
                    grantStatus: 'ok',
                    productType: reward.type
                }),
                paidAt
            });
            order = await getPaymentOrder(order.id);

            notifyPaymentPaid({
                order,
                username: targetUser.username,
                productType: reward.type,
                planLabel: (cfg.plans || []).find((p) => p.id === order.planId)?.label || order.planId,
                via: 'manual'
            }).catch(() => {});

            const message = reward.type === 'gamecenter_pass'
                ? `ยืนยันการชำระเงินและมอบ Game Center Pass ให้ @${targetUser.username} แล้ว`
                : reward.type === 'game'
                    ? `ยืนยันการชำระเงินและมอบเกม (${(reward.gameIds || [reward.gameId]).filter(Boolean).join(', ') || 'game'}) ให้ @${targetUser.username} แล้ว`
                    : reward.type === 'coins'
                        ? `ยืนยันการชำระเงินและมอบ ${Number(reward.coins || 0).toLocaleString('en-US')} Control Point ให้ @${targetUser.username} แล้ว`
                    : `ยืนยันการชำระเงินและมอบ PRO ให้ @${targetUser.username} แล้ว`;

            res.json({
                success: true,
                message,
                order: publicOrder(order, { username: order.username }),
                proExpireAt: reward.proExpireAt || null,
                entitlements: reward.entitlements || null,
                gameId: reward.gameId || null,
                gameIds: reward.gameIds || null,
                coins: reward.coins || null,
                productType: reward.type
            });
        } catch (err) {
            console.error('[payments] admin confirm', err);
            res.status(500).json({ error: 'ยืนยันออเดอร์ไม่สำเร็จ' });
        }
    });
}

module.exports = {
    registerPaymentRoutes,
    getPaymentConfig,
    getPaymentConfigAsync,
    resolveUsdThbRate,
    parsePlans,
    DEFAULT_PLANS,
    STORE_PRO_PLAN_IDS,
    STANDALONE_STORE_GAME_IDS,
    computeProExpireAt,
    toPromptPayAmount,
    getUsdThbRate,
    ORDER_TTL_MS,
    buildPromptPayQr,
    verifySlipWithSlipOK,
    parseDataUrlImage
};
