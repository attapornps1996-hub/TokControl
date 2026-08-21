'use strict';

const crypto = require('crypto');

const TRIGGER_TYPES = new Set([
    'manual',
    'live_hours',
    'friends_count',
    'gifts_received',
    'pro_subscriptions',
    'account_age'
]);

const TRIGGER_UNITS = {
    account_age: new Set(['day', 'month', 'year']),
    live_hours: new Set(['hour']),
    friends_count: new Set(['count']),
    gifts_received: new Set(['count']),
    pro_subscriptions: new Set(['count']),
    manual: new Set([''])
};

function slugify(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9ก-๙]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'achievement';
}

function normalizeTrigger(body = {}) {
    const triggerType = String(body.triggerType || 'manual').trim();
    if (!TRIGGER_TYPES.has(triggerType)) {
        const err = new Error('ประเภทเงื่อนไขไม่ถูกต้อง');
        err.status = 400;
        throw err;
    }
    const triggerValue = Math.max(0, Number(body.triggerValue) || 0);
    let triggerUnit = String(body.triggerUnit || '').trim().toLowerCase();
    if (triggerType === 'account_age') {
        if (!TRIGGER_UNITS.account_age.has(triggerUnit)) triggerUnit = 'day';
    } else if (triggerType === 'live_hours') {
        triggerUnit = 'hour';
    } else if (triggerType === 'manual') {
        triggerUnit = '';
    } else {
        triggerUnit = 'count';
    }
    if (triggerType !== 'manual' && triggerValue <= 0) {
        const err = new Error('กรุณากำหนดค่าเงื่อนไขให้มากกว่า 0');
        err.status = 400;
        throw err;
    }
    return { triggerType, triggerValue, triggerUnit };
}

function registerAchievementAdminRoutes(app, deps) {
    const {
        db,
        jwt,
        JWT_SECRET,
        isAdminUser
    } = deps;

    async function requireAdmin(req, res) {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({ error: 'No token' });
            return null;
        }
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            if (!(await isAdminUser(decoded.userId))) {
                res.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกปฏิเสธ เฉพาะผู้ดูแลระบบเท่านั้น' });
                return null;
            }
            return decoded;
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
    }

    app.get('/api/admin/achievements', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const list = await db.listAchievementDefinitions({ includeInactive: true });
            const withCounts = await Promise.all(list.map(async (item) => {
                const unlocks = await db.listAchievementUnlocks(item.id, 300);
                return { ...item, unlockCount: unlocks.length };
            }));
            res.json({ success: true, achievements: withCounts });
        } catch (error) {
            res.status(500).json({ error: error.message || 'โหลดความสำเร็จไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/achievements', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const name = String(req.body?.name || '').trim();
            if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อความสำเร็จ' });
            const trigger = normalizeTrigger(req.body || {});
            const id = String(req.body?.id || `${slugify(name)}-${crypto.randomBytes(3).toString('hex')}`);
            const existing = await db.getAchievementDefinition(id);
            if (existing) return res.status(400).json({ error: 'รหัสความสำเร็จนี้มีอยู่แล้ว' });
            const row = await db.upsertAchievementDefinition({
                id,
                name,
                description: String(req.body?.description || '').trim(),
                icon: String(req.body?.icon || 'workspace_premium').trim() || 'workspace_premium',
                iconUrl: String(req.body?.iconUrl || '').trim(),
                points: Number(req.body?.points) || 0,
                active: req.body?.active !== false,
                ...trigger
            });
            res.json({ success: true, achievement: row });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'สร้างความสำเร็จไม่สำเร็จ' });
        }
    });

    app.put('/api/admin/achievements/:id', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const id = String(req.params.id || '').trim();
            const existing = await db.getAchievementDefinition(id);
            if (!existing) return res.status(404).json({ error: 'ไม่พบความสำเร็จ' });
            const name = String(req.body?.name || existing.name || '').trim();
            if (!name) return res.status(400).json({ error: 'กรุณาระบุชื่อความสำเร็จ' });
            const trigger = normalizeTrigger({
                triggerType: req.body?.triggerType ?? existing.triggerType,
                triggerValue: req.body?.triggerValue ?? existing.triggerValue,
                triggerUnit: req.body?.triggerUnit ?? existing.triggerUnit
            });
            const row = await db.upsertAchievementDefinition({
                id,
                name,
                description: String(req.body?.description ?? existing.description ?? '').trim(),
                icon: String(req.body?.icon ?? existing.icon ?? 'workspace_premium').trim() || 'workspace_premium',
                iconUrl: String(req.body?.iconUrl ?? existing.iconUrl ?? '').trim(),
                points: Number(req.body?.points ?? existing.points) || 0,
                active: req.body?.active === undefined ? existing.active !== 0 : !!req.body.active,
                createdAt: existing.createdAt,
                ...trigger
            });
            res.json({ success: true, achievement: row });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message || 'อัปเดตความสำเร็จไม่สำเร็จ' });
        }
    });

    app.delete('/api/admin/achievements/:id', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const id = String(req.params.id || '').trim();
            const existing = await db.getAchievementDefinition(id);
            if (!existing) return res.status(404).json({ error: 'ไม่พบความสำเร็จ' });
            await db.deleteAchievementDefinition(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message || 'ลบความสำเร็จไม่สำเร็จ' });
        }
    });

    app.get('/api/admin/achievements/:id/unlocks', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const id = String(req.params.id || '').trim();
            const existing = await db.getAchievementDefinition(id);
            if (!existing) return res.status(404).json({ error: 'ไม่พบความสำเร็จ' });
            const unlocks = await db.listAchievementUnlocks(id, Number(req.query.limit) || 100);
            res.json({ success: true, achievement: existing, unlocks });
        } catch (error) {
            res.status(500).json({ error: error.message || 'โหลดประวัติปลดล็อกไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/achievements/evaluate/:userId', async (req, res) => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const { evaluateUserAchievements } = require('./achievement_evaluator');
            const userId = String(req.params.userId || '').trim();
            const user = typeof db.getUserById === 'function'
                ? await db.getUserById(userId)
                : await db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
            const result = await evaluateUserAchievements(db, user);
            res.json({ success: true, ...result });
        } catch (error) {
            res.status(500).json({ error: error.message || 'ประเมินความสำเร็จไม่สำเร็จ' });
        }
    });

    app.post('/api/profile/achievements/sync', async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ error: 'No token' });
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = typeof db.getUserById === 'function'
                ? await db.getUserById(decoded.userId)
                : await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
            if (!user) return res.status(401).json({ error: 'Invalid user' });
            const { evaluateUserAchievements } = require('./achievement_evaluator');
            const result = await evaluateUserAchievements(db, user);
            const achievements = typeof db.listUserAchievements === 'function'
                ? await db.listUserAchievements(user.id, 200)
                : [];
            res.json({ success: true, ...result, achievements });
        } catch (error) {
            res.status(500).json({ error: error.message || 'ซิงก์ความสำเร็จไม่สำเร็จ' });
        }
    });
}

module.exports = { registerAchievementAdminRoutes, TRIGGER_TYPES };
