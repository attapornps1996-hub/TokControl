/**
 * Donate domain service — business logic (settings, slip verify, stats helpers).
 * Kept separate from HTTP routes for a clearer backend layout.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
    buildPromptPayQr,
    verifySlipWithSlipOK,
    parseDataUrlImage,
    getPaymentConfig
} = require('../payments');

const SLIP_MAX_AGE_MS = 30 * 60 * 1000;
const DONATE_ROOM_PREFIX = 'donate:';

function nowIso() {
    return new Date().toISOString();
}

function randomToken(bytes = 16) {
    return crypto.randomBytes(bytes).toString('hex');
}

function slugify(input) {
    // Hostname ห้ามใช้ "_" — แปลงเป็น "-" เสมอ
    const s = String(input || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, '-')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return s || `streamer-${randomToken(4)}`;
}

function normalizeName(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/^(คุณ|นาย|นางสาว|นาง|mr\.?|mrs\.?|miss|ms\.?)/i, '');
}

function namesMatch(a, b) {
    const na = normalizeName(a);
    const nb = normalizeName(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
}

function extractReceiverName(meta) {
    if (!meta || typeof meta !== 'object') return '';
    const r = meta.receiver || meta.to || meta.dest || {};
    return (
        r.displayName ||
        r.name ||
        r.accountName ||
        r.account ||
        meta.receiverName ||
        meta.toAccountName ||
        meta.toName ||
        meta.accountName ||
        ''
    );
}

function parseSlipTimestamp(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const candidates = [
        meta.transDate && meta.transTime ? `${meta.transDate} ${meta.transTime}` : null,
        meta.dateTime,
        meta.datetime,
        meta.transDateTime,
        meta.paidAt,
        meta.timestamp,
        meta.date
    ].filter(Boolean);

    for (const raw of candidates) {
        const s = String(raw).trim();
        const m1 = s.match(/^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2}):?(\d{2}):?(\d{2})?)?/);
        if (m1) {
            const d = new Date(
                Number(m1[1]),
                Number(m1[2]) - 1,
                Number(m1[3]),
                Number(m1[4] || 0),
                Number(m1[5] || 0),
                Number(m1[6] || 0)
            );
            if (!Number.isNaN(d.getTime())) return d;
        }
        const d2 = new Date(s);
        if (!Number.isNaN(d2.getTime())) return d2;
    }
    return null;
}

function amountsEqual(a, b, tolerance = 0.01) {
    return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function publicSettings(row) {
    if (!row) return null;
    return {
        donationSlug: row.donation_slug,
        overlayKey: row.overlay_key,
        promptpayId: row.promptpay_id || '',
        accountName: row.account_name || '',
        bankCode: row.bank_code || '',
        minDonation: Number(row.min_donation) || 10,
        minTtsAmount: Number(row.min_tts_amount) || 20,
        goalAmount: Number(row.goal_amount) || 1000,
        goalLabel: row.goal_label || 'เป้าหมายเดือนนี้',
        pageViews: Number(row.page_views) || 0,
        bio: row.bio || '',
        socialYoutube: row.social_youtube || '',
        socialTiktok: row.social_tiktok || '',
        socialFacebook: row.social_facebook || '',
        socialDiscord: row.social_discord || '',
        pageOnline: row.page_online == null ? true : !!Number(row.page_online),
        hasCustomSlipok: !!(row.slipok_branch_id && row.slipok_api_key),
        paymentReady: !!(String(row.promptpay_id || '').trim() && String(row.account_name || '').trim()),
        updatedAt: row.updated_at || null
    };
}

function getDonatePublicBaseDomain() {
    return String(process.env.DONATE_PUBLIC_BASE_DOMAIN || 'control.app')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '') || 'control.app';
}

/** โดเมนสาธารณะสำหรับลิงก์ OBS / แชร์
 * หมายเหตุ: www.tokcontrol.com ตอนนี้เป็น GitHub Pages (static) → /donate/* จะ 404
 * จึงใช้ Cloud Run เป็นค่าเริ่มต้นจนกว่าจะชี้โดเมนมาที่ Express backend
 */
function getPublicSiteBase() {
    const cloudFallback =
        String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '') ||
        'https://pandy-backend-302414976454.asia-southeast1.run.app';

    let raw = String(
        process.env.TOKCONTROL_PUBLIC_SITE_URL ||
        process.env.DONATE_WIDGET_BASE_URL ||
        cloudFallback
    )
        .trim()
        .replace(/\/$/, '');

    if (!raw) raw = cloudFallback;

    // กันเคสตั้งเป็น tokcontrol.com ทั้งที่ยังไม่มี API (GitHub Pages)
    const host = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    const forceMarketing =
        host === 'tokcontrol.com' ||
        host === 'www.tokcontrol.com';
    const hasApi = String(process.env.TOKCONTROL_PUBLIC_SITE_HAS_API || '').trim() === '1';
    if (forceMarketing && !hasApi) {
        return cloudFallback;
    }
    return raw;
}

function buildVanityDonateUrl(slug) {
    // เปิดเฉพาะเมื่อตั้ง DONATE_ENABLE_VANITY=1 และมี DNS wildcard จริง
    const enabled = String(process.env.DONATE_ENABLE_VANITY || '').trim() === '1';
    if (!enabled) return '';
    const s = String(slug || '').trim().toLowerCase();
    if (!s || s.includes('_')) return '';
    const domain = getDonatePublicBaseDomain();
    return `https://${s}.${domain}`;
}

function buildWidgetUrl(siteBase, type, slug) {
    const s = String(slug || '').trim().toLowerCase();
    const t = String(type || 'alert').trim().toLowerCase();
    return `${siteBase}/widget/${encodeURIComponent(t)}?slug=${encodeURIComponent(s)}`;
}

function buildPublicUrls(req, settings) {
    const site = getPublicSiteBase();
    const localBase = `${req.protocol}://${req.get('host')}`;
    const slug = slugify(settings.donation_slug || '');
    const vanity = buildVanityDonateUrl(slug);
    // ลิงก์หลักที่ใช้งานได้จริง: path บนโดเมนหลัก (ไม่พึ่ง subdomain DNS)
    const donatePublic = `${site}/donate/${encodeURIComponent(slug)}`;
    const pathFallback = `${localBase}/donate/${slug}`;
    return {
        donate: vanity || donatePublic,
        vanity,
        donatePath: pathFallback,
        donatePublic,
        overlay: buildWidgetUrl(site, 'alert', slug),
        alert: buildWidgetUrl(site, 'alert', slug),
        goal: buildWidgetUrl(site, 'goal', slug),
        leaderboard: buildWidgetUrl(site, 'leaderboard', slug),
        recent: buildWidgetUrl(site, 'recent', slug),
        alertLocal: buildWidgetUrl(localBase, 'alert', slug),
        goalLocal: buildWidgetUrl(localBase, 'goal', slug),
        leaderboardLocal: buildWidgetUrl(localBase, 'leaderboard', slug),
        recentLocal: buildWidgetUrl(localBase, 'recent', slug),
        siteBase: site,
        biolinkDashboard: `${site}/biolink/dashboard`,
        biolinkPublic: `${site}/biolink/u/${encodeURIComponent(slug)}`,
        biolinkLocal: `${localBase}/biolink/dashboard`,
        biolinkPublicLocal: `${localBase}/biolink/u/${encodeURIComponent(slug)}`,
        baseDomain: getDonatePublicBaseDomain(),
        vanityEnabled: !!vanity
    };
}

function buildSetupChecklist(settings, urls) {
    const paymentReady = !!(String(settings.promptpay_id || '').trim() && String(settings.account_name || '').trim());
    const hasSlug = !!String(settings.donation_slug || '').trim();
    const hasOverlay = !!String(settings.overlay_key || '').trim();
    return [
        { id: 'payment', label: 'ตั้งค่า PromptPay + ชื่อบัญชี', done: paymentReady },
        { id: 'link', label: 'สร้างลิงก์สาธารณะ (tokcontrol.com/donate/…)', done: hasSlug },
        { id: 'overlay', label: 'เตรียมลิงก์ Overlay สำหรับ OBS', done: hasOverlay },
        { id: 'share', label: 'แชร์ลิงก์ให้ผู้ชม', done: paymentReady && hasSlug, url: urls?.donate || null }
    ];
}

function ensureUploadsDir(rootDir) {
    const dir = path.join(rootDir, 'uploads', 'donations');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function saveSlipFile(rootDir, buffer, mime, donationId) {
    const dir = ensureUploadsDir(rootDir);
    let ext = 'jpg';
    if (String(mime || '').includes('png')) ext = 'png';
    else if (String(mime || '').includes('webp')) ext = 'webp';
    const fileName = `${donationId}.${ext}`;
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return `/uploads/donations/${fileName}`;
}

function donateRoom(overlayKey) {
    return DONATE_ROOM_PREFIX + String(overlayKey);
}

function donateRoomBySlug(slug) {
    return DONATE_ROOM_PREFIX + 'slug_' + String(slug || '').trim().toLowerCase();
}

function emitDonationToOverlay(io, settings, payload) {
    if (!io || !settings) return;
    const rooms = [];
    if (settings.overlay_key) rooms.push(donateRoom(settings.overlay_key));
    if (settings.donation_slug) rooms.push(donateRoomBySlug(settings.donation_slug));
    rooms.forEach((room) => io.to(room).emit('new_donation', payload));
}

function computeStats(rows, settings) {
    const list = rows || [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = now.getDay() || 7;
    const startOfWeek = startOfDay - (day - 1) * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const inRange = (fromMs) => list.filter((r) => new Date(r.created_at).getTime() >= fromMs);
    const sumIn = (fromMs) => inRange(fromMs).reduce((a, r) => a + Number(r.amount || 0), 0);
    const countIn = (fromMs) => inRange(fromMs).length;

    const totals = {
        today: sumIn(startOfDay),
        week: sumIn(startOfWeek),
        month: sumIn(startOfMonth),
        all: list.reduce((a, r) => a + Number(r.amount || 0), 0)
    };
    const counts = {
        today: countIn(startOfDay),
        week: countIn(startOfWeek),
        month: countIn(startOfMonth),
        all: list.length
    };

    const donorMap = new Map();
    for (const r of list) {
        const name = r.donor_name || 'ผู้ไม่ประสงค์ออกนาม';
        donorMap.set(name, (donorMap.get(name) || 0) + Number(r.amount || 0));
    }
    const topDonors = [...donorMap.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const goalAmount = Number(settings.goal_amount) || 1000;
    const monthTotal = totals.month;
    const recent = [...list]
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 8)
        .map((r) => ({
            donorName: r.donor_name,
            amount: Number(r.amount),
            message: r.message || '',
            createdAt: r.created_at
        }));

    return {
        totals,
        counts,
        visitors: {
            all: Number(settings.page_views) || 0
        },
        goal: {
            label: settings.goal_label || 'เป้าหมายเดือนนี้',
            amount: goalAmount,
            current: monthTotal,
            percent: goalAmount > 0 ? Math.min(100, Math.round((monthTotal / goalAmount) * 1000) / 10) : 0
        },
        topDonors,
        recent,
        verifiedCount: list.length
    };
}

async function ensureSettings(repo, user) {
    let row = await repo.getSettingsByUserId(user.id);
    if (row) {
        // แก้ slug เก่าที่มี "_" ให้เป็น "-" (DNS ใช้ไม่ได้)
        const fixed = slugify(row.donation_slug || '');
        if (fixed && fixed !== row.donation_slug) {
            const taken = await repo.getSettingsBySlug(fixed);
            if (!taken || String(taken.user_id) === String(user.id)) {
                await repo.updateSettings(user.id, { donation_slug: fixed, updated_at: nowIso() });
                row = await repo.getSettingsByUserId(user.id);
            }
        }
        return row;
    }
    const baseSlug = slugify(user.username || user.displayName || `u${user.id}`);
    let donationSlug = baseSlug;
    let tries = 0;
    while (await repo.getSettingsBySlug(donationSlug)) {
        tries += 1;
        donationSlug = `${baseSlug}-${tries}`;
        if (tries > 20) {
            donationSlug = `${baseSlug}-${randomToken(3)}`;
            break;
        }
    }
    const overlayKey = randomToken(24);
    const createdAt = nowIso();
    await repo.insertSettings({
        user_id: user.id,
        donation_slug: donationSlug,
        overlay_key: overlayKey,
        promptpay_id: '',
        account_name: '',
        bank_code: '',
        min_donation: 10,
        min_tts_amount: 20,
        goal_amount: 1000,
        goal_label: 'เป้าหมายเดือนนี้',
        updated_at: createdAt
    });
    return repo.getSettingsByUserId(user.id);
}

/**
 * Verify slip + persist donation. Returns { ok, status, error?, donation? }
 */
async function verifyAndRecordDonation(repo, { settings, rootDir, slug, amount, donorName, message, slipDataUrl, io }) {
    const min = Number(settings.min_donation) || 10;
    if (!(amount >= min)) {
        return { ok: false, status: 'rejected', error: `ยอดขั้นต่ำ ฿${min}` };
    }
    if (!settings.promptpay_id || !settings.account_name) {
        return { ok: false, status: 'rejected', error: 'สตรีมเมอร์ยังตั้งค่าบัญชีรับเงินไม่ครบ' };
    }

    const parsed = parseDataUrlImage(String(slipDataUrl || ''));
    if (!parsed?.buffer?.length) {
        return { ok: false, status: 'rejected', error: 'ไฟล์สลิปไม่ถูกต้อง' };
    }
    if (parsed.buffer.length > 8 * 1024 * 1024) {
        return { ok: false, status: 'rejected', error: 'ไฟล์สลิปใหญ่เกินไป (สูงสุด 8MB)' };
    }

    const donationId = crypto.randomUUID();
    const slipUrl = saveSlipFile(rootDir, parsed.buffer, parsed.mime, donationId);
    const createdAt = nowIso();

    const payCfg = getPaymentConfig();
    const branchId = String(settings.slipok_branch_id || payCfg.slipokBranchId || '').trim();
    const apiKey = String(settings.slipok_api_key || payCfg.slipokApiKey || '').trim();
    const slipokReady = !!(branchId && apiKey);
    const devAuto = process.env.NODE_ENV === 'production'
        ? false
        : (process.env.DONATE_DEV_AUTO_APPROVE === '1' || payCfg.devAutoApprove);

    let slipResult;
    if (slipokReady) {
        slipResult = await verifySlipWithSlipOK({
            branchId,
            apiKey,
            amount,
            imageBuffer: parsed.buffer,
            filename: parsed.filename
        });
    } else if (devAuto) {
        slipResult = {
            ok: true,
            ref: `DEV-DONATE-${crypto.createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 24)}`,
            amount,
            meta: {
                dev: true,
                receiver: { displayName: settings.account_name },
                transDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                transTime: new Date().toTimeString().slice(0, 8)
            }
        };
    } else {
        return {
            ok: false,
            status: 'rejected',
            error: 'ระบบตรวจสลิปยังไม่พร้อม (ยังไม่ได้ตั้งค่า SlipOK)',
            needsManual: true
        };
    }

    const rejectPersist = async (reason) => {
        await repo.insertDonation({
            id: donationId,
            streamer_id: settings.user_id,
            donor_name: donorName,
            amount,
            message,
            slip_url: slipUrl,
            trans_ref: slipResult?.ref
                ? `${slipResult.ref}-rejected-${donationId.slice(0, 8)}`
                : `rejected-${donationId}`,
            verification_status: 'rejected',
            reject_reason: reason,
            is_alerted: 0,
            created_at: createdAt
        });
        return { ok: false, status: 'rejected', error: reason };
    };

    if (!slipResult.ok) {
        return rejectPersist(slipResult.message || 'ตรวจสลิปไม่ผ่าน');
    }

    const meta = slipResult.meta || {};
    const slipAmount = slipResult.amount != null ? Number(slipResult.amount) : amount;
    if (!amountsEqual(slipAmount, amount)) {
        return rejectPersist(`ยอดในสลิป (฿${slipAmount}) ไม่ตรงกับที่ยอดที่กรอก (฿${amount})`);
    }

    const receiverName = extractReceiverName(meta);
    if (receiverName && !namesMatch(receiverName, settings.account_name)) {
        return rejectPersist(
            `ชื่อบัญชีรับเงินไม่ตรง (สลิป: ${receiverName} / ที่ตั้งค่า: ${settings.account_name})`
        );
    }

    const transRef = String(slipResult.ref || '').trim();
    if (!transRef) return rejectPersist('ไม่พบเลขอ้างอิงสลิป');

    const dup = await repo.findDonationByTransRef(transRef);
    if (dup) return rejectPersist('สลิปนี้ถูกใช้ไปแล้ว');

    const slipTs = parseSlipTimestamp(meta);
    if (slipTs) {
        const age = Date.now() - slipTs.getTime();
        if (age > SLIP_MAX_AGE_MS || age < -5 * 60 * 1000) {
            return rejectPersist('เวลาโอนเกิน 30 นาที หรือเวลาสลิปไม่ถูกต้อง');
        }
    } else if (!meta.dev) {
        console.warn('[donate] slip missing timestamp, allowing after SlipOK ok', donationId);
    }

    await repo.insertDonation({
        id: donationId,
        streamer_id: settings.user_id,
        donor_name: donorName,
        amount,
        message,
        slip_url: slipUrl,
        trans_ref: transRef,
        verification_status: 'verified',
        reject_reason: null,
        is_alerted: 0,
        created_at: createdAt
    });

    const donation = {
        id: donationId,
        streamer_id: settings.user_id,
        donor_name: donorName,
        amount,
        message,
        slip_url: slipUrl,
        trans_ref: transRef,
        verification_status: 'verified',
        is_alerted: 0,
        created_at: createdAt
    };

    if (io) {
        emitDonationToOverlay(io, settings, {
            id: donation.id,
            donorName: donation.donor_name,
            amount: Number(donation.amount),
            message: donation.message || '',
            createdAt: donation.created_at,
            minTtsAmount: Number(settings.min_tts_amount) || 20
        });
    }
    await repo.markAlerted(donationId);

    return {
        ok: true,
        status: 'verified',
        donation: {
            id: donationId,
            donorName,
            amount,
            message,
            createdAt
        }
    };
}

async function generateQrForStreamer(settings, amount) {
    const min = Number(settings.min_donation) || 10;
    if (!(amount > 0)) throw new Error('ยอดเงินไม่ถูกต้อง');
    if (amount < min) throw new Error(`ยอดขั้นต่ำ ฿${min}`);
    const promptpayId = String(settings.promptpay_id || '').replace(/\s+/g, '');
    if (!promptpayId) throw new Error('สตรีมเมอร์ยังไม่ได้ตั้งค่า PromptPay');
    const { payload, qrDataUrl } = await buildPromptPayQr(promptpayId, amount);
    return {
        amount,
        payload,
        qrDataUrl,
        accountName: settings.account_name || '',
        bankCode: settings.bank_code || ''
    };
}

function emitTestDonation(io, settings, payload) {
    if (!io || !settings) return;
    emitDonationToOverlay(io, settings, {
        id: `test-${Date.now()}`,
        donorName: payload.donorName || 'ทดสอบระบบ',
        amount: Number(payload.amount) || Number(settings.min_tts_amount) || 50,
        message: payload.message || 'นี่คือการทดสอบแจ้งเตือนโดเนท',
        createdAt: nowIso(),
        minTtsAmount: Number(settings.min_tts_amount) || 20
    });
}

module.exports = {
    DONATE_ROOM_PREFIX,
    SLIP_MAX_AGE_MS,
    nowIso,
    randomToken,
    slugify,
    publicSettings,
    donateRoom,
    donateRoomBySlug,
    emitDonationToOverlay,
    buildPublicUrls,
    buildWidgetUrl,
    buildVanityDonateUrl,
    getDonatePublicBaseDomain,
    getPublicSiteBase,
    buildSetupChecklist,
    computeStats,
    ensureSettings,
    verifyAndRecordDonation,
    generateQrForStreamer,
    emitTestDonation,
    buildPromptPayQr,
    parseDataUrlImage
};
