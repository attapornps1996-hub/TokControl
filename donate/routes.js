/**
 * Donate HTTP routes — thin layer over donate/service + donate/store.
 */
const path = require('path');
const { createDonateRepo } = require('./store');
const svc = require('./service');

function registerDonateRoutes(app, deps) {
    const {
        db,
        jwt,
        JWT_SECRET,
        io,
        rootDir = path.join(__dirname, '..')
    } = deps;

    const repo = createDonateRepo(db);
    const QRCode = require('qrcode');
    /** cache token → local user (ลดยิง cloud ซ้ำ) */
    const cloudAuthCache = new Map();

    function resolveCloudBaseUrl() {
        const raw = String(
            process.env.APP_PUBLIC_URL ||
            process.env.TOKCONTROL_CLOUD_URL ||
            process.env.TOKCONTROL_CLOUD_DEFAULT ||
            'https://pandy-backend-302414976454.asia-southeast1.run.app'
        ).trim().replace(/\/$/, '');
        return raw || 'https://pandy-backend-302414976454.asia-southeast1.run.app';
    }

    async function resolveLocalUserFromClaims(decoded) {
        let user = null;
        if (decoded.userId != null) {
            try { user = await repo.getUserById(decoded.userId); } catch (e) { user = null; }
        }
        const claimName = String(decoded.username || '').trim();
        if (!user && claimName && typeof repo.getUserByUsername === 'function') {
            try { user = await repo.getUserByUsername(claimName); } catch (e) { user = null; }
        }
        if (!user && claimName && typeof repo.ensureLocalUser === 'function') {
            try { user = await repo.ensureLocalUser({ username: claimName, displayName: claimName }); } catch (e) { user = null; }
        }
        if (!user) {
            const uname = claimName || `user_${decoded.userId}`;
            user = { id: decoded.userId, username: uname, displayName: uname, avatarUrl: null };
        }
        return user;
    }

    /**
     * Login อยู่บน Cloud → JWT ลงนามด้วย Cloud JWT_SECRET
     * TokDonate API รันบน local Electron → ถ้า verify ท้องถิ่นไม่ได้
     * ให้ยืนยัน token กับ Cloud /api/profile แล้วผูกเป็น user ท้องถิ่น
     */
    async function resolveViaCloudProfile(token) {
        const cached = cloudAuthCache.get(token);
        if (cached && cached.expiresAt > Date.now()) return cached.auth;

        const cloudBase = resolveCloudBaseUrl();
        let res;
        try {
            res = await fetch(`${cloudBase}/api/profile`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
            });
        } catch (e) {
            console.warn('[donate] cloud profile bridge failed:', e.message);
            return null;
        }
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        const profile = data.user || null;
        if (!profile) return null;
        const username = String(profile.username || profile.name || '').trim();
        const decoded = {
            userId: profile.id != null ? profile.id : profile.userId,
            username
        };
        const user = await resolveLocalUserFromClaims(decoded);
        const auth = { decoded, user };
        cloudAuthCache.set(token, { auth, expiresAt: Date.now() + 5 * 60 * 1000 });
        return auth;
    }

    // รองรับ {slug}.control.app → หน้าโดเนทสาธารณะ
    app.use((req, res, next) => {
        try {
            const host = String(req.hostname || '').toLowerCase();
            const base = svc.getDonatePublicBaseDomain();
            if (!host || !base || host === base || host === `www.${base}`) return next();
            if (!host.endsWith(`.${base}`)) return next();
            const slug = host.slice(0, -(base.length + 1));
            if (!slug || slug.includes('.') || !/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) {
                return next();
            }
            req.donateVanitySlug = slug;
            if (req.method === 'GET' && (req.path === '/' || req.path === '')) {
                return res.sendFile(path.join(rootDir, 'donate.html'));
            }
            return next();
        } catch (e) {
            return next();
        }
    });

    async function authUser(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        if (!token) return null;

        // 1) JWT ที่ลงนามด้วย secret ท้องถิ่น (login local / session เดียวกัน)
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await resolveLocalUserFromClaims(decoded);
            return { decoded, user };
        } catch (e) {
            /* fall through — มักเกิดเมื่อ token มาจาก Cloud คนละ JWT_SECRET */
        }

        // 2) Bridge: ยืนยันกับ Cloud แล้วผูก user ท้องถิ่น
        try {
            return await resolveViaCloudProfile(token);
        } catch (e) {
            console.warn('[donate] auth bridge error:', e.message);
            return null;
        }
    }

    app.get('/api/donate/public-config', (req, res) => {
        res.json({
            success: true,
            baseDomain: svc.getDonatePublicBaseDomain(),
            example: `pandypuncheroo.${svc.getDonatePublicBaseDomain()}`
        });
    });

    app.get('/donate/:slug', (req, res) => {
        res.sendFile(path.join(rootDir, 'donate.html'));
    });

    // OBS widgets — URL สะอาด: /widget/alert?slug=name
    app.get('/widget/:type', (req, res) => {
        const type = String(req.params.type || '').toLowerCase();
        const allowed = new Set(['alert', 'goal', 'leaderboard', 'recent', 'all']);
        if (!allowed.has(type)) return res.status(404).send('Unknown widget');
        res.sendFile(path.join(rootDir, 'donate_overlay.html'));
    });

    // legacy key-based overlay (ยังรองรับลิงก์เก่า)
    app.get('/overlay/donate/:key', (req, res) => {
        res.sendFile(path.join(rootDir, 'donate_overlay.html'));
    });

    app.get('/favicon.ico', (req, res) => {
        const ico = path.join(rootDir, 'icon.ico');
        const png = path.join(rootDir, 'assets', 'tokcontrol-icon.png');
        const fs = require('fs');
        if (fs.existsSync(ico)) return res.sendFile(ico);
        if (fs.existsSync(png)) return res.type('png').sendFile(png);
        return res.status(404).end();
    });

    app.get('/dashboard/settings', (req, res) => res.redirect('/#donate'));
    app.get('/dashboard/stats', (req, res) => res.redirect('/#donate-stats'));

    app.post('/api/donate/link-qr', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const settings = await svc.ensureSettings(repo, auth.user);
            const urls = svc.buildPublicUrls(req, settings);
            const target = String(req.body?.url || urls.donate || '').trim();
            if (!target) return res.status(400).json({ error: 'ไม่มีลิงก์' });
            const qrDataUrl = await QRCode.toDataURL(target, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 360,
                color: { dark: '#101820', light: '#ffffff' }
            });
            res.json({ success: true, url: target, qrDataUrl });
        } catch (err) {
            console.error('[donate] link-qr', err);
            res.status(500).json({ error: 'สร้าง QR ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/streamer/:slug', async (req, res) => {
        try {
            const settings = await repo.getSettingsBySlug(req.params.slug);
            if (!settings) return res.status(404).json({ error: 'ไม่พบหน้าโดเนทนี้' });
            let user = null;
            try { user = await repo.getUserById(settings.user_id); } catch (e) { user = null; }
            const displayName = (user && (user.displayName || user.username)) || settings.donation_slug || 'Streamer';
            const avatarUrl =
                (user && user.avatarUrl) ||
                `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=1a0f14`;
            res.json({
                success: true,
                streamer: {
                    id: user?.id || settings.user_id,
                    username: user?.username || settings.donation_slug,
                    displayName,
                    avatarUrl,
                    bio: settings.bio || '',
                    online: settings.page_online == null ? true : !!Number(settings.page_online),
                    social: {
                        youtube: settings.social_youtube || '',
                        tiktok: settings.social_tiktok || '',
                        facebook: settings.social_facebook || '',
                        discord: settings.social_discord || ''
                    }
                },
                slug: settings.donation_slug,
                minDonation: Number(settings.min_donation) || 10,
                minTtsAmount: Number(settings.min_tts_amount) || 20,
                bankCode: settings.bank_code || '',
                accountName: settings.account_name || '',
                ready: !!(settings.promptpay_id && settings.account_name)
            });
        } catch (err) {
            console.error('[donate] streamer', err);
            res.status(500).json({ error: 'โหลดข้อมูลไม่สำเร็จ' });
        }
    });

    app.post('/api/donate/generate-qr', async (req, res) => {
        try {
            const slug = String(req.body?.streamer_slug || req.body?.slug || '').trim().toLowerCase();
            const amount = Number(req.body?.amount);
            if (!slug) return res.status(400).json({ error: 'ต้องระบุ streamer_slug' });
            const settings = await repo.getSettingsBySlug(slug);
            if (!settings) return res.status(404).json({ error: 'ไม่พบหน้าโดเนทนี้' });
            const data = await svc.generateQrForStreamer(settings, amount);
            res.json({ success: true, ...data });
        } catch (err) {
            const msg = err.message || 'สร้าง QR ไม่สำเร็จ';
            const status = /ขั้นต่ำ|ไม่ถูกต้อง|PromptPay/.test(msg) ? 400 : 500;
            if (status === 500) console.error('[donate] generate-qr', err);
            res.status(status === 500 && /ตั้งค่า PromptPay/.test(msg) ? 503 : status).json({ error: msg });
        }
    });

    app.post('/api/donate/verify-slip', async (req, res) => {
        try {
            const slug = String(req.body?.streamer_slug || req.body?.slug || '').trim().toLowerCase();
            const amount = Number(req.body?.amount);
            const donorName =
                String(req.body?.donor_name || req.body?.donorName || '').trim() || 'ผู้ไม่ประสงค์ออกนาม';
            const message = String(req.body?.message || '').trim().slice(0, 500);
            const slipDataUrl = req.body?.slipDataUrl || req.body?.slip_data_url || req.body?.slip;

            if (!slug) return res.status(400).json({ error: 'ต้องระบุ streamer_slug' });
            if (!(amount > 0)) return res.status(400).json({ error: 'ยอดเงินไม่ถูกต้อง' });
            if (!slipDataUrl) return res.status(400).json({ error: 'กรุณาอัปโหลดสลิป' });

            const settings = await repo.getSettingsBySlug(slug);
            if (!settings) return res.status(404).json({ error: 'ไม่พบหน้าโดเนทนี้' });

            const result = await svc.verifyAndRecordDonation(repo, {
                settings,
                rootDir,
                slug,
                amount,
                donorName,
                message,
                slipDataUrl,
                io
            });

            if (!result.ok) {
                return res.status(400).json({
                    success: false,
                    error: result.error,
                    status: result.status,
                    needsManual: result.needsManual || false
                });
            }
            res.json({ success: true, status: 'verified', donation: result.donation });
        } catch (err) {
            console.error('[donate] verify-slip', err);
            if (String(err.message || '').includes('UNIQUE')) {
                return res.status(400).json({ error: 'สลิปนี้ถูกใช้ไปแล้ว', status: 'rejected' });
            }
            res.status(500).json({ error: 'ตรวจสอบสลิปไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/overlay/:key', async (req, res) => {
        try {
            const settings = await repo.getSettingsByOverlayKey(req.params.key);
            if (!settings) return res.status(404).json({ error: 'ไม่พบ overlay' });
            const user = await repo.getUserById(settings.user_id);
            res.json({
                success: true,
                minTtsAmount: Number(settings.min_tts_amount) || 20,
                streamerName: user?.displayName || user?.username || 'Streamer'
            });
        } catch (err) {
            res.status(500).json({ error: 'โหลด overlay ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/settings', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const settings = await svc.ensureSettings(repo, auth.user);
            const urls = svc.buildPublicUrls(req, settings);
            res.json({
                success: true,
                settings: svc.publicSettings(settings),
                urls,
                checklist: svc.buildSetupChecklist(settings, urls)
            });
        } catch (err) {
            console.error('[donate] get settings', err);
            res.status(500).json({ error: 'โหลดตั้งค่าไม่สำเร็จ' });
        }
    });

    app.post('/api/donate/track-view/:slug', async (req, res) => {
        try {
            const settings = await repo.getSettingsBySlug(req.params.slug);
            if (!settings) return res.status(404).json({ error: 'ไม่พบหน้าโดเนทนี้' });
            const views = await repo.incrementPageViews(settings.user_id);
            res.json({ success: true, pageViews: views });
        } catch (err) {
            res.status(500).json({ error: 'track ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/public/:key/widget', async (req, res) => {
        try {
            const settings = await repo.getSettingsByOverlayKey(req.params.key);
            if (!settings) return res.status(404).json({ error: 'ไม่พบ overlay' });
            const rows = (await repo.listVerified(settings.user_id)) || [];
            const stats = svc.computeStats(rows, settings);
            const user = await repo.getUserById(settings.user_id);
            res.json({
                success: true,
                streamerName: user?.displayName || user?.username || 'Streamer',
                minTtsAmount: Number(settings.min_tts_amount) || 20,
                goal: stats.goal,
                topDonors: stats.topDonors,
                recent: stats.recent,
                slug: settings.donation_slug
            });
        } catch (err) {
            res.status(500).json({ error: 'โหลด widget ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/public-by-slug/:slug/widget', async (req, res) => {
        try {
            const settings = await repo.getSettingsBySlug(req.params.slug);
            if (!settings) return res.status(404).json({ error: 'ไม่พบหน้าโดเนทนี้' });
            const rows = (await repo.listVerified(settings.user_id)) || [];
            const stats = svc.computeStats(rows, settings);
            let user = null;
            try { user = await repo.getUserById(settings.user_id); } catch (e) { user = null; }
            res.json({
                success: true,
                streamerName: user?.displayName || user?.username || settings.donation_slug || 'Streamer',
                minTtsAmount: Number(settings.min_tts_amount) || 20,
                goal: stats.goal,
                topDonors: stats.topDonors,
                recent: stats.recent,
                slug: settings.donation_slug
            });
        } catch (err) {
            console.error('[donate] public-by-slug widget', err);
            res.status(500).json({ error: 'โหลด widget ไม่สำเร็จ' });
        }
    });

    app.put('/api/donate/settings', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            await svc.ensureSettings(repo, auth.user);

            const body = req.body || {};
            const patch = {};
            const set = (col, val) => { patch[col] = val; };

            if (body.promptpay_id != null) set('promptpay_id', String(body.promptpay_id).replace(/\s+/g, ''));
            if (body.account_name != null) set('account_name', String(body.account_name).trim());
            if (body.bank_code != null) set('bank_code', String(body.bank_code).trim().toUpperCase());
            if (body.min_donation != null) {
                const v = Number(body.min_donation);
                if (!(v >= 1)) return res.status(400).json({ error: 'min_donation ต้อง >= 1' });
                set('min_donation', v);
            }
            if (body.min_tts_amount != null) {
                const v = Number(body.min_tts_amount);
                if (!(v >= 0)) return res.status(400).json({ error: 'min_tts_amount ไม่ถูกต้อง' });
                set('min_tts_amount', v);
            }
            if (body.goal_amount != null) {
                const v = Number(body.goal_amount);
                if (!(v >= 0)) return res.status(400).json({ error: 'goal_amount ไม่ถูกต้อง' });
                set('goal_amount', v);
            }
            if (body.goal_label != null) set('goal_label', String(body.goal_label).trim().slice(0, 80) || 'เป้าหมายเดือนนี้');
            if (body.slipok_branch_id != null) set('slipok_branch_id', String(body.slipok_branch_id).trim());
            if (body.slipok_api_key != null) set('slipok_api_key', String(body.slipok_api_key).trim());
            if (body.bio != null) set('bio', String(body.bio).trim().slice(0, 280));
            if (body.social_youtube != null) set('social_youtube', String(body.social_youtube).trim().slice(0, 200));
            if (body.social_tiktok != null) set('social_tiktok', String(body.social_tiktok).trim().slice(0, 200));
            if (body.social_facebook != null) set('social_facebook', String(body.social_facebook).trim().slice(0, 200));
            if (body.social_discord != null) set('social_discord', String(body.social_discord).trim().slice(0, 200));
            if (body.page_online != null) set('page_online', body.page_online ? 1 : 0);

            set('updated_at', svc.nowIso());
            await repo.updateSettings(auth.user.id, patch);
            const settings = await repo.getSettingsByUserId(auth.user.id);
            res.json({
                success: true,
                settings: svc.publicSettings(settings),
                urls: svc.buildPublicUrls(req, settings)
            });
        } catch (err) {
            console.error('[donate] put settings', err);
            res.status(500).json({ error: 'บันทึกตั้งค่าไม่สำเร็จ' });
        }
    });

    app.post('/api/donate/settings/regen-overlay-key', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            await svc.ensureSettings(repo, auth.user);
            await repo.updateSettings(auth.user.id, {
                overlay_key: svc.randomToken(24),
                updated_at: svc.nowIso()
            });
            const settings = await repo.getSettingsByUserId(auth.user.id);
            res.json({
                success: true,
                settings: svc.publicSettings(settings),
                urls: svc.buildPublicUrls(req, settings)
            });
        } catch (err) {
            console.error('[donate] regen overlay', err);
            res.status(500).json({ error: 'รีเซ็ต overlay key ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/check-slug', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const donationSlug = svc.slugify(req.query?.slug || '');
            if (!donationSlug) {
                return res.status(400).json({ error: 'กรุณาระบุชื่อลิงก์', available: false });
            }
            const owner = await repo.getSettingsBySlug(donationSlug);
            if (!owner) {
                return res.json({ success: true, available: true, slug: donationSlug });
            }
            const isOwn = String(owner.user_id) === String(auth.user.id);
            return res.json({
                success: true,
                available: isOwn,
                slug: donationSlug,
                error: isOwn ? null : 'ชื่อลิงก์นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น'
            });
        } catch (err) {
            console.error('[donate] check slug', err);
            res.status(500).json({ error: 'ตรวจชื่อลิงก์ไม่สำเร็จ' });
        }
    });

    app.post('/api/donate/settings/regen-slug', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            await svc.ensureSettings(repo, auth.user);

            const donationSlug = svc.slugify(req.body?.slug || auth.user.username);
            if (!donationSlug) {
                return res.status(400).json({ error: 'ชื่อลิงก์ไม่ถูกต้อง' });
            }

            const owner = await repo.getSettingsBySlug(donationSlug);
            // ของตัวเองที่ใช้อยู่แล้ว → ผ่านได้ / ของคนอื่น → ห้ามซ้ำ
            if (owner && String(owner.user_id) !== String(auth.user.id)) {
                return res.status(409).json({
                    error: 'ชื่อลิงก์นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น',
                    slug: donationSlug
                });
            }

            await repo.updateSettings(auth.user.id, {
                donation_slug: donationSlug,
                updated_at: svc.nowIso()
            });
            const settings = await repo.getSettingsByUserId(auth.user.id);
            res.json({
                success: true,
                settings: svc.publicSettings(settings),
                urls: svc.buildPublicUrls(req, settings)
            });
        } catch (err) {
            console.error('[donate] regen slug', err);
            res.status(500).json({ error: 'รีเซ็ต donation slug ไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/stats', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const settings = await svc.ensureSettings(repo, auth.user);
            const rows = (await repo.listVerified(auth.user.id)) || [];
            res.json({ success: true, ...svc.computeStats(rows, settings) });
        } catch (err) {
            console.error('[donate] stats', err);
            res.status(500).json({ error: 'โหลดสถิติไม่สำเร็จ' });
        }
    });

    app.get('/api/donate/history', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const status = String(req.query.status || '').trim();
            const rows = (await repo.listHistory(auth.user.id, { limit, status })) || [];
            res.json({
                success: true,
                donations: rows.map((r) => ({
                    id: r.id,
                    donorName: r.donor_name,
                    amount: Number(r.amount),
                    message: r.message || '',
                    slipUrl: r.slip_url,
                    transRef: r.trans_ref,
                    status: r.verification_status,
                    rejectReason: r.reject_reason,
                    isAlerted: !!r.is_alerted,
                    createdAt: r.created_at
                }))
            });
        } catch (err) {
            console.error('[donate] history', err);
            res.status(500).json({ error: 'โหลดประวัติไม่สำเร็จ' });
        }
    });

    app.post('/api/donate/test-alert', async (req, res) => {
        try {
            const auth = await authUser(req);
            if (!auth) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
            const settings = await svc.ensureSettings(repo, auth.user);
            svc.emitTestDonation(io, settings, {
                amount: req.body?.amount,
                donorName: req.body?.donor_name,
                message: req.body?.message
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'ส่งทดสอบไม่สำเร็จ' });
        }
    });
}

function attachDonateSockets(io, db) {
    let repo;
    try {
        repo = createDonateRepo(db);
    } catch (e) {
        console.warn('[donate] sockets disabled:', e.message);
        return;
    }

    io.on('connection', (socket) => {
        const qKey = socket.handshake.query?.key;
        const qSlug = socket.handshake.query?.slug;
        if (qKey) joinOverlay(socket, repo, String(qKey)).catch(() => {});
        else if (qSlug) joinOverlay(socket, repo, String(qSlug)).catch(() => {});

        socket.on('join_donate_overlay', async (id) => {
            try {
                await joinOverlay(socket, repo, id);
            } catch (e) {
                socket.emit('donate_overlay_error', { error: 'join failed' });
            }
        });
    });
}

async function joinOverlay(socket, repo, id) {
    const token = String(id || '').trim();
    if (!token) return;
    let row = await repo.getSettingsByOverlayKey(token);
    if (!row) row = await repo.getSettingsBySlug(token);
    if (!row) {
        socket.emit('donate_overlay_error', { error: 'invalid overlay id' });
        return;
    }
    const rooms = [];
    if (row.overlay_key) rooms.push(svc.donateRoom(row.overlay_key));
    if (row.donation_slug) rooms.push(svc.donateRoomBySlug(row.donation_slug));
    rooms.forEach((room) => socket.join(room));
    socket.donateOverlayKey = row.overlay_key;
    socket.donateSlug = row.donation_slug;
    socket.emit('donate_overlay_joined', { ok: true, slug: row.donation_slug });
    console.log(`[donate] overlay joined rooms ${rooms.join(', ')}`);
}

module.exports = {
    registerDonateRoutes,
    attachDonateSockets,
    DONATE_ROOM_PREFIX: svc.DONATE_ROOM_PREFIX
};
