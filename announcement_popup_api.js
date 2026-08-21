/**
 * Extra announcement popup endpoints — shared by local server and cloud.
 */
const Popup = require('./js/announcements/popup-config.js');

function parseBool(value, fallback) {
    if (value === undefined) return fallback;
    return value ? 1 : 0;
}

function normalizePopupFields(body = {}, base = {}) {
    const displayType = Popup.DISPLAY_TYPES.includes(body.displayType)
        ? body.displayType
        : (body.showPopup ? 'popup' : (base.displayType || 'notice'));
    const announcementType = Popup.ANNOUNCEMENT_TYPES.includes(body.announcementType)
        ? body.announcementType
        : (['maintenance', 'alert', 'update', 'feature'].includes(body.category) ? body.category : (base.announcementType || 'notice'));
    let popupConfig = body.popupConfig;
    if (typeof popupConfig === 'string') {
        try { popupConfig = JSON.parse(popupConfig); } catch (_) { popupConfig = null; }
    }
    if (displayType === 'popup') {
        popupConfig = Popup.mergePopupConfig(popupConfig, announcementType);
    }
    return {
        displayType,
        announcementType,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : (Number(base.priority) || 0),
        locale: body.locale ? String(body.locale).slice(0, 12) : (base.locale || 'th'),
        popupConfig,
        showPopup: displayType === 'popup' ? 1 : parseBool(body.showPopup, base.showPopup ? 1 : 0)
    };
}

function hydrateList(list) {
    return (list || []).map((row) => Popup.hydrateAnnouncement(row));
}

function registerAnnouncementPopupApi(app, ctx) {
    const { requireAdmin, requireUser, db, io } = ctx;

    app.get('/api/admin/announcements/:id', async (req, res) => {
        try {
            const admin = await requireAdmin(req, res);
            if (!admin) return;
            const row = db.getAnnouncement
                ? await db.getAnnouncement(req.params.id)
                : await db.get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
            if (!row) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
            res.json({ success: true, announcement: Popup.hydrateAnnouncement(row) });
        } catch (err) {
            console.error('[admin/announcements GET id]', err);
            res.status(500).json({ error: 'โหลดประกาศไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/announcements/:id/duplicate', async (req, res) => {
        try {
            const admin = await requireAdmin(req, res);
            if (!admin) return;
            if (typeof db.duplicateAnnouncement === 'function') {
                const copy = await db.duplicateAnnouncement(req.params.id, admin.username || 'admin');
                if (!copy) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
                return res.json({ success: true, announcement: Popup.hydrateAnnouncement(copy) });
            }
            const src = await db.get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
            if (!src) return res.status(404).json({ error: 'ไม่พบประกาศนี้' });
            return res.status(501).json({ error: 'duplicate ยังไม่พร้อมบนโหมดนี้' });
        } catch (err) {
            console.error('[admin/announcements duplicate]', err);
            res.status(500).json({ error: 'ทำสำเนาไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/announcements/:id/archive', async (req, res) => {
        try {
            const admin = await requireAdmin(req, res);
            if (!admin) return;
            const patch = { status: 'archived', archivedAt: new Date().toISOString() };
            const announcement = typeof db.updateAnnouncement === 'function'
                ? await db.updateAnnouncement(req.params.id, patch, admin.username || 'admin')
                : null;
            if (!announcement && db.run) {
                await db.run(
                    'UPDATE announcements SET status = ?, archivedAt = ?, updatedAt = ? WHERE id = ?',
                    ['archived', patch.archivedAt, patch.archivedAt, req.params.id]
                );
            }
            try { io?.emit('app_announcement_updated', { id: req.params.id, status: 'archived' }); } catch (_) {}
            res.json({ success: true });
        } catch (err) {
            console.error('[admin/announcements archive]', err);
            res.status(500).json({ error: 'เก็บเข้าคลังไม่สำเร็จ' });
        }
    });

    app.post('/api/admin/announcements/:id/restore/:revisionId', async (req, res) => {
        try {
            const admin = await requireAdmin(req, res);
            if (!admin) return;
            if (typeof db.restoreAnnouncementRevision !== 'function') {
                return res.status(501).json({ error: 'restore ยังไม่พร้อม' });
            }
            const announcement = await db.restoreAnnouncementRevision(
                req.params.id,
                req.params.revisionId,
                admin.username || 'admin'
            );
            if (!announcement) return res.status(404).json({ error: 'ไม่พบ revision นี้' });
            res.json({ success: true, announcement: Popup.hydrateAnnouncement(announcement) });
        } catch (err) {
            console.error('[admin/announcements restore]', err);
            res.status(500).json({ error: 'กู้คืน revision ไม่สำเร็จ' });
        }
    });

    app.get('/api/announcements/active-popup', async (req, res) => {
        try {
            const user = await requireUser(req, res);
            if (!user) return;
            const now = new Date();
            const candidates = typeof db.listAnnouncements === 'function'
                ? await db.listAnnouncements(100)
                : await db.all(
                    `SELECT * FROM announcements
                     WHERE COALESCE(status, 'published') IN ('published', 'scheduled')
                       AND archivedAt IS NULL
                     ORDER BY priority DESC, pinned DESC, createdAt DESC LIMIT 80`
                );
            const isPro = user.role === 'pro' || user.isPro === 1 || user.isPro === true;
            const list = hydrateList(candidates).filter((ann) => {
                const status = ann.status || 'published';
                if (!['published', 'scheduled'].includes(status) || ann.archivedAt) return false;
                if (ann.publishAt && new Date(ann.publishAt) > now) return false;
                if (ann.expireAt && new Date(ann.expireAt) <= now) return false;
                if (!(ann.displayType === 'popup' || ann.showPopup)) return false;
                const audience = ann.audience || 'all';
                if (audience === 'pro' && !isPro && user.role !== 'admin') return false;
                if (audience === 'free' && isPro) return false;
                if (audience === 'group' || audience === 'custom') {
                    const ids = String(ann.audienceConfig || '').split(',').map((x) => x.trim()).filter(Boolean);
                    if (!ids.includes(String(user.id || user.userId))) return false;
                }
                return true;
            }).sort((a, b) => {
                const ac = a.popupConfig?.rules?.blocking ? 1 : 0;
                const bc = b.popupConfig?.rules?.blocking ? 1 : 0;
                if (bc !== ac) return bc - ac;
                return (Number(b.priority) || 0) - (Number(a.priority) || 0);
            });
            res.json({ success: true, popup: list[0] || null, queue: list.slice(0, 8) });
        } catch (err) {
            console.error('[announcements/active-popup]', err);
            res.json({ success: true, popup: null, queue: [] });
        }
    });
}

module.exports = {
    Popup,
    normalizePopupFields,
    hydrateList,
    registerAnnouncementPopupApi
};
