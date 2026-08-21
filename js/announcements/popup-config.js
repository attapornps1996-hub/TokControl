/**
 * TokControl Popup Announcement — shared config, templates, validation.
 * Extends the existing announcements record (displayType + popupConfig).
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TcAnnouncementPopup = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DISPLAY_TYPES = ['notice', 'banner', 'popup'];
    const ANNOUNCEMENT_TYPES = ['maintenance', 'alert', 'update', 'feature', 'notice'];
    const STATUSES = ['draft', 'scheduled', 'published', 'archived'];
    const MASCOT_POSITIONS = ['left', 'right', 'bottom-left', 'floating', 'overlap-card'];
    const MASCOT_ANIMS = ['none', 'float', 'bounce', 'fade-in', 'wiggle', 'pulse'];
    const CTA_ACTIONS = ['close', 'acknowledge', 'open_url', 'open_route', 'open_feature', 'callback', 'download'];
    const SECTION_TYPES = [
        'text_block', 'warning_list', 'feature_grid', 'schedule_card',
        'maintenance_window', 'cta_bar', 'info_box', 'bullet_list', 'icon_stat_cards', 'footer_note'
    ];

    const DEFAULT_STYLE = {
        primary: '#b026ff',
        secondary: '#ff26b0',
        accent: '#c4b5fd',
        background: '#12081f',
        border: 'rgba(176,38,255,.72)',
        glowIntensity: 72,
        radius: 28,
        sparkles: true,
        grid: true,
        orbit: true,
        cornerDeco: true,
        overlayOpacity: 72,
        overlayBlur: 12,
        cardOpacity: 92,
        typographyScale: 100,
        spacing: 'comfortable',
        alignment: 'left'
    };

    const DEFAULT_MASCOT = {
        enabled: true,
        pose: 'announce',
        imageUrl: '',
        position: 'left',
        scale: 100,
        rotation: 0,
        offsetX: -28,
        offsetY: 18,
        opacity: 100,
        zIndex: 4,
        animation: 'float',
        flip: false,
        shadow: true,
        glow: true,
        particles: true,
        shadowIntensity: 60,
        glowIntensity: 70,
        particleIntensity: 50,
        tagText: '',
        poses: { announce: '', alert: '', happy: '', wink: '' }
    };

    const DEFAULT_RULES = {
        showOnce: false,
        showOncePerVersion: false,
        showOncePerDay: false,
        showAgainAfterHours: 0,
        maxImpressions: 0,
        showOnLogin: true,
        showOnDashboard: true,
        routes: [],
        delayBeforeClose: 0,
        queuePriority: 50,
        blocking: false,
        requireAcknowledgement: false,
        overlayClickCloses: true,
        escCloses: true
    };

    function uid(prefix) {
        return (prefix || 'sec') + '_' + Math.random().toString(36).slice(2, 9);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function section(type, content, extra) {
        return Object.assign({
            id: uid(type),
            type,
            enabled: true,
            sortOrder: 0,
            content: content || {}
        }, extra || {});
    }

    function cta(type, text, actionType, actionValue, extra) {
        return Object.assign({
            id: uid('cta'),
            type: type || 'primary',
            text: text || 'รับทราบ',
            actionType: actionType || 'acknowledge',
            actionValue: actionValue || '',
            icon: 'check',
            style: type === 'secondary' ? 'secondary' : 'primary'
        }, extra || {});
    }

    const MASCOT_POSES = [
        { id: 'announce', label: 'ประกาศ', emoji: '📢' },
        { id: 'alert', label: 'เตือน', emoji: '⚠️' },
        { id: 'happy', label: 'ยิ้ม', emoji: '✨' },
        { id: 'wink', label: 'ขยิบ', emoji: '😉' }
    ];

    function buildTemplate(kind) {
        const base = {
            template: kind,
            badgeText: '',
            badgeIcon: 'campaign',
            subtitle: '',
            subtitle2: '',
            highlightText: '',
            titleIconLeft: '',
            titleIconRight: '',
            theme: 'neon-purple',
            popupSize: 'lg',
            locale: 'th',
            layout: {
                placement: 'center',
                mascotSide: 'left',
                columns: 1,
                closePosition: 'top-right',
                overlayClick: true,
                closeStyle: 'circle'
            },
            overlay: { enabled: true, blur: 12, opacity: 72 },
            close: { enabled: true, behavior: 'dismiss', delaySeconds: 0 },
            mascot: clone(DEFAULT_MASCOT),
            style: clone(DEFAULT_STYLE),
            sections: [],
            ctas: [],
            rules: clone(DEFAULT_RULES),
            targeting: {
                audienceType: 'all',
                roles: [],
                plans: [],
                locales: ['th'],
                appVersionMin: '',
                platform: 'all',
                firstLogin: false,
                featureFlags: []
            },
            schedule: {
                startAt: '',
                endAt: '',
                expectedFinishText: '',
                timezone: 'Asia/Bangkok',
                maintenanceStart: '',
                maintenanceEnd: ''
            }
        };

        if (kind === 'maintenance') {
            base.badgeText = 'ประกาศสำคัญ';
            base.badgeIcon = 'construction';
            base.subtitle = 'TokControl กำลังปิดปรับปรุงระบบชั่วคราว เพื่ออัปเดตโครงสร้างและเพิ่มความเสถียร กรุณารอจนครบกำหนดก่อนใช้งานต่อ';
            base.highlightText = '';
            base.titleIconLeft = '';
            base.titleIconRight = 'warning';
            base.layout.columns = 2;
            base.mascot.pose = 'announce';
            base.mascot.tagText = 'MAINTENANCE';
            base.mascot.position = 'left';
            base.mascot.scale = 118;
            base.rules.blocking = true;
            base.rules.requireAcknowledgement = true;
            base.close.behavior = 'ack-required';
            base.rules.overlayClickCloses = false;
            base.sections = [
                section('maintenance_window', {
                    title: 'กำหนดการปรับปรุงระบบ',
                    startLabel: 'เริ่มต้น',
                    endLabel: 'คาดว่าแล้วเสร็จ',
                    startAt: '',
                    endAt: '',
                    note: 'เวลาอาจมีการเปลี่ยนแปลงตามความเหมาะสม'
                }),
                section('info_box', {
                    icon: 'favorite',
                    text: 'ขออภัยในความไม่สะดวก หากมีปัญหาหลังเปิดระบบ กรุณาติดต่อทีมงานผ่านช่องทางทางการ'
                })
            ];
            base.ctas = [cta('primary', 'รับทราบแล้ว', 'acknowledge', '', { icon: 'check_circle' })];
        }

        if (kind === 'alert') {
            base.badgeText = 'แจ้งเตือน';
            base.badgeIcon = 'warning';
            base.subtitle = 'โปรดตรวจสอบข้อมูลบัญชีของท่านอย่างสม่ำเสมอ';
            base.subtitle2 = 'และอย่าหลงเชื่อลิงก์หรือข้อความจากแหล่งที่ไม่น่าเชื่อถือ';
            base.titleIconLeft = 'warning';
            base.titleIconRight = 'warning';
            base.layout.columns = 2;
            base.mascot.pose = 'alert';
            base.mascot.animation = 'pulse';
            base.mascot.scale = 112;
            base.rules.blocking = true;
            base.rules.requireAcknowledgement = true;
            base.close.behavior = 'ack-required';
            base.sections = [
                section('warning_list', {
                    items: [
                        { icon: 'verified_user', title: 'ตรวจสอบบัญชีของคุณ', body: 'ตรวจข้อมูลการใช้งาน และผูกอีเมล / เบอร์โทรให้เป็นปัจจุบัน' },
                        { icon: 'phishing', title: 'อย่าคลิกลิงก์แปลกปลอม', body: 'ระวังลิงก์หลอกลวง (Phishing) ที่อาจขโมยข้อมูลบัญชี' },
                        { icon: 'lock', title: 'เก็บข้อมูลส่วนตัวให้ปลอดภัย', body: 'ห้าเปิดเผยรหัสผ่านหรือ OTP แก่ผู้อื่นเด็ดขาด' }
                    ]
                }),
                section('info_box', {
                    icon: 'warning',
                    variant: 'hazard',
                    text: 'หากพบความผิดปกติ กรุณาเปลี่ยนรหัสผ่านทันที และติดต่อทีมงานผ่านช่องทางทางการของเราเท่านั้น'
                })
            ];
            base.ctas = [cta('primary', 'รับทราบ', 'acknowledge', '', { icon: 'check' })];
        }

        if (kind === 'update') {
            base.badgeText = 'ประกาศอัปเดต';
            base.badgeIcon = 'notifications';
            base.subtitle = 'ปรับปรุงฟีเจอร์ให้ใช้งานลื่นไหลขึ้น เพื่อประสบการณ์ที่ดีกว่าเดิม';
            base.layout.columns = 2;
            base.mascot.pose = 'happy';
            base.mascot.scale = 110;
            base.rules.showOncePerVersion = true;
            base.sections = [
                section('feature_grid', {
                    cards: [
                        { icon: 'speed', title: 'เร็วขึ้นกว่าเดิม', body: 'โหลดหน้าหลักและโอเวอร์เลย์ได้เร็วกว่าเวอร์ชันก่อน' },
                        { icon: 'palette', title: 'ดีไซน์ใหม่', body: 'โทนมืดนีออนอ่านง่ายขึ้นในทุกหน้าจอ' },
                        { icon: 'verified', title: 'เสถียรยิ่งขึ้น', body: 'แก้บัคสำคัญและเสริมความปลอดภัยของระบบ' }
                    ]
                })
            ];
            base.ctas = [cta('primary', 'ดูรายละเอียด', 'open_route', 'announcements', { icon: 'arrow_forward' })];
        }

        if (kind === 'feature') {
            base.badgeText = 'มีอะไรใหม่';
            base.badgeIcon = 'auto_awesome';
            base.subtitle = 'ปลดล็อกเครื่องมือใหม่สำหรับไลฟ์ของคุณ พร้อมให้ทดลองใช้งานแล้ววันนี้';
            base.highlightText = '';
            base.layout.columns = 2;
            base.mascot.pose = 'wink';
            base.mascot.animation = 'float';
            base.mascot.scale = 115;
            base.sections = [
                section('feature_grid', {
                    cards: [
                        { icon: 'rocket_launch', title: 'ปล่อยของใหม่', body: 'ฟีเจอร์พร้อมใช้ทันทีหลังอัปเดต' },
                        { icon: 'auto_fix_high', title: 'ปรับแต่งง่าย', body: 'ตั้งค่าได้ละเอียดโดยไม่รกหน้าจอ' },
                        { icon: 'login', title: 'เข้าถึงเร็ว', body: 'หาเมนูและเริ่มไลฟ์ได้ในไม่กี่คลิก' }
                    ]
                }),
                section('footer_note', {
                    icon: 'shield',
                    text: 'อัปเดตนี้ปลอดภัย และปิดการแจ้งเตือนได้หลังทดลองใช้'
                })
            ];
            base.ctas = [cta('primary', 'ลองใช้งาน', 'open_feature', 'gamecenter', { icon: 'cruelty_free' })];
        }

        if (kind === 'notice' || kind === 'custom') {
            base.template = kind === 'custom' ? 'custom' : 'notice';
            base.badgeText = 'ประกาศ';
            base.badgeIcon = 'campaign';
            base.sections = [
                section('text_block', { title: '', body: '' })
            ];
            base.ctas = [cta('primary', 'รับทราบ', 'close', '')];
        }

        base.sections.forEach((sec, i) => { sec.sortOrder = i; });
        return base;
    }

    const TEMPLATES = {
        maintenance: {
            id: 'maintenance',
            name: 'Maintenance',
            category: 'maintenance',
            title: 'ปิดปรับปรุงระบบชั่วคราว',
            previewHint: 'กำหนดการ + ขออภัย + ปุ่มรับทราบ'
        },
        alert: {
            id: 'alert',
            name: 'Alert',
            category: 'alert',
            title: 'แจ้งเตือนความปลอดภัย',
            previewHint: 'รายการคำเตือน + บังคับรับทราบ'
        },
        update: {
            id: 'update',
            name: 'Update',
            category: 'update',
            title: 'อัปเดตระบบใหม่เรียบร้อยแล้ว',
            previewHint: 'การ์ด 3 ใบ + ดูรายละเอียด'
        },
        feature: {
            id: 'feature',
            name: 'Feature',
            category: 'feature',
            title: 'เปิดตัวฟีเจอร์ใหม่',
            previewHint: 'มาสคอต + ไฮไลต์ฟีเจอร์'
        },
        custom: {
            id: 'custom',
            name: 'Custom',
            category: 'notice',
            title: 'ประกาศกำหนดเอง',
            previewHint: 'จัด section เองทั้งหมด'
        }
    };

    function defaultPopupConfig(kind) {
        return buildTemplate(ANNOUNCEMENT_TYPES.includes(kind) || kind === 'custom' ? kind : 'feature');
    }

    function parseJson(value, fallback) {
        if (value == null || value === '') return fallback;
        if (typeof value === 'object') return value;
        try { return JSON.parse(value); } catch (_) { return fallback; }
    }

    function mergePopupConfig(raw, kind) {
        const base = defaultPopupConfig(kind || (raw && raw.template) || 'feature');
        const src = raw && typeof raw === 'object' ? raw : {};
        const out = Object.assign(base, src);
        out.mascot = Object.assign(clone(DEFAULT_MASCOT), src.mascot || {});
        out.mascot.poses = Object.assign({ announce: '', alert: '', happy: '', wink: '' }, (src.mascot && src.mascot.poses) || {});
        if (out.mascot.imageUrl && out.mascot.pose && !out.mascot.poses[out.mascot.pose]) {
            out.mascot.poses[out.mascot.pose] = out.mascot.imageUrl;
        }
        out.style = Object.assign(clone(DEFAULT_STYLE), src.style || {});
        out.rules = Object.assign(clone(DEFAULT_RULES), src.rules || {});
        out.layout = Object.assign(base.layout, src.layout || {});
        out.overlay = Object.assign(base.overlay, src.overlay || {});
        out.close = Object.assign(base.close, src.close || {});
        out.targeting = Object.assign(base.targeting, src.targeting || {});
        out.schedule = Object.assign(base.schedule, src.schedule || {});
        out.sections = Array.isArray(src.sections) ? src.sections : base.sections;
        out.ctas = Array.isArray(src.ctas) && src.ctas.length ? src.ctas : base.ctas;
        return out;
    }

    function hydrateAnnouncement(row) {
        if (!row || typeof row !== 'object') return row;
        const popupConfig = mergePopupConfig(
            parseJson(row.popupConfig, null),
            row.announcementType || row.category || 'notice'
        );
        return Object.assign({}, row, {
            displayType: DISPLAY_TYPES.includes(row.displayType) ? row.displayType : (row.showPopup ? 'popup' : 'notice'),
            announcementType: ANNOUNCEMENT_TYPES.includes(row.announcementType)
                ? row.announcementType
                : (['maintenance', 'alert', 'update', 'feature'].includes(row.category) ? row.category : 'notice'),
            priority: Number(row.priority) || 0,
            locale: row.locale || 'th',
            popupConfig,
            ctaButtons: parseJson(row.ctaButtons, Array.isArray(row.ctaButtons) ? row.ctaButtons : []),
            important: !!(row.important === 1 || row.important === true),
            showPopup: !!(row.showPopup === 1 || row.showPopup === true || row.displayType === 'popup'),
            pinned: !!(row.pinned === 1 || row.pinned === true)
        });
    }

    function validateAnnouncement(payload) {
        const errors = [];
        const title = String(payload.title || '').trim();
        const message = String(payload.message || '').trim();
        const displayType = payload.displayType || 'notice';
        if (!title) errors.push({ field: 'title', message: 'กรุณากรอกหัวข้อ' });
        if (title.length > 120) errors.push({ field: 'title', message: 'หัวข้อยาวเกิน 120 ตัวอักษร' });
        if (!message && displayType !== 'popup') errors.push({ field: 'message', message: 'กรุณากรอกเนื้อหาประกาศ' });
        if (!DISPLAY_TYPES.includes(displayType)) errors.push({ field: 'displayType', message: 'รูปแบบการแสดงผลไม่ถูกต้อง' });
        if (payload.publishAt && payload.expireAt && new Date(payload.expireAt) <= new Date(payload.publishAt)) {
            errors.push({ field: 'expireAt', message: 'เวลาหมดอายุต้องอยู่หลังเวลาเผยแพร่' });
        }
        const cfg = payload.popupConfig;
        if (displayType === 'popup') {
            if (!cfg || typeof cfg !== 'object') errors.push({ field: 'popupConfig', message: 'ต้องเลือกเทมเพลตป๊อปอัป' });
            else {
                const rules = cfg.rules || {};
                const ctas = Array.isArray(cfg.ctas) ? cfg.ctas : [];
                if (rules.requireAcknowledgement && !ctas.some((c) => c && c.text)) {
                    errors.push({ field: 'cta', message: 'ป๊อปอัปที่บังคับรับทราบต้องมีปุ่ม CTA' });
                }
                const start = (cfg.schedule && cfg.schedule.maintenanceStart) || '';
                const end = (cfg.schedule && cfg.schedule.maintenanceEnd) || '';
                if (start && end && new Date(end) <= new Date(start)) {
                    errors.push({ field: 'schedule', message: 'เวลาปิดปรับปรุงไม่ถูกต้อง' });
                }
                ['primary', 'secondary', 'accent', 'background', 'border'].forEach((key) => {
                    const color = cfg.style && cfg.style[key];
                    if (color && !/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(color)) && !/^rgba?\(/i.test(String(color))) {
                        errors.push({ field: 'style.' + key, message: 'รหัสสีไม่ถูกต้อง' });
                    }
                });
            }
        }
        return { ok: errors.length === 0, errors };
    }

    function toStoredPopupConfig(cfg) {
        const merged = mergePopupConfig(cfg, cfg && cfg.template);
        return JSON.stringify(merged);
    }

    function applyTemplateToDraft(draft, templateId) {
        const next = defaultPopupConfig(templateId);
        if (!draft) return next;
        next.subtitle = draft.subtitle || next.subtitle;
        if (draft.mascot && draft.mascot.poses) next.mascot.poses = Object.assign({}, next.mascot.poses, draft.mascot.poses);
        if (draft.mascot && draft.mascot.imageUrl) next.mascot.imageUrl = draft.mascot.imageUrl;
        return next;
    }

    return {
        DISPLAY_TYPES,
        ANNOUNCEMENT_TYPES,
        STATUSES,
        MASCOT_POSITIONS,
        MASCOT_ANIMS,
        CTA_ACTIONS,
        SECTION_TYPES,
        MASCOT_POSES,
        TEMPLATES,
        DEFAULT_STYLE,
        DEFAULT_MASCOT,
        DEFAULT_RULES,
        uid,
        clone,
        section,
        cta,
        defaultPopupConfig,
        mergePopupConfig,
        hydrateAnnouncement,
        validateAnnouncement,
        parseJson,
        toStoredPopupConfig,
        applyTemplateToDraft
    };
}));
