/**
 * Config-driven popup renderer — matches TokControl neon popup mockups.
 * Layout: mascot column left + content right; sections driven by popupConfig.
 */
(function (global) {
    'use strict';

    const Cfg = global.TcAnnouncementPopup;
    if (!Cfg) {
        console.warn('[popup-renderer] popup-config.js must load first');
        return;
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function icon(name, size) {
        const s = size || 18;
        return `<span class="material-symbols-outlined tc-pop-ico" style="font-size:${s}px" aria-hidden="true">${esc(name || 'campaign')}</span>`;
    }

    function mascotSvg(pose, uid) {
        const megaphone = pose === 'announce' || pose === 'happy';
        const warn = pose === 'alert';
        const wink = pose === 'wink';
        const id = String(uid || pose || 'm').replace(/[^a-z0-9_-]/gi, '');
        return `<svg class="tc-pop-mascot-svg" viewBox="0 0 220 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="tcHair-${id}" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0" stop-color="#f3e8ff"/><stop offset="1" stop-color="#7c3aed"/>
                </linearGradient>
                <linearGradient id="tcSkin-${id}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stop-color="#ffe4ef"/><stop offset="1" stop-color="#ffc1d8"/>
                </linearGradient>
            </defs>
            <ellipse cx="110" cy="262" rx="58" ry="10" fill="rgba(124,58,237,.28)"/>
            <path d="M52 118c8-52 42-86 78-88 28-2 62 18 72 58 8 32-2 58-18 74-8 22-28 38-54 40-36 4-70-18-78-84z" fill="url(#tcHair-${id})"/>
            <ellipse cx="108" cy="148" rx="46" ry="52" fill="url(#tcSkin-${id})"/>
            <ellipse cx="90" cy="146" rx="8" ry="${wink ? 2 : 10}" fill="#3b0764"/>
            <ellipse cx="128" cy="146" rx="8" ry="10" fill="#3b0764"/>
            <circle cx="93" cy="143" r="2.4" fill="#fff"/>
            <circle cx="131" cy="143" r="2.4" fill="#fff"/>
            <path d="M100 168c8 8 20 8 28 0" fill="none" stroke="#be185d" stroke-width="3" stroke-linecap="round"/>
            <ellipse cx="78" cy="160" rx="8" ry="4" fill="#fb7185" opacity=".55"/>
            <ellipse cx="140" cy="160" rx="8" ry="4" fill="#fb7185" opacity=".55"/>
            <path d="M84 198c8 28 52 34 72 8 10 18 8 42-6 54-28 22-70 10-80-18-6-18 2-34 14-44z" fill="#1e1b4b"/>
            <path d="M96 204c10 16 34 18 48 2" fill="none" stroke="#a78bfa" stroke-width="4"/>
            ${megaphone ? '<g transform="translate(148 150)"><rect x="0" y="-8" width="18" height="16" rx="3" fill="#f5d0fe"/><path d="M18 -14 L46 -22 L46 22 L18 14 Z" fill="#c026d3"/><circle cx="8" cy="0" r="4" fill="#7c3aed"/></g>' : ''}
            ${warn ? '<g transform="translate(154 86)"><path d="M16 2 L30 26 H2 Z" fill="#f472b6" stroke="#fff" stroke-width="2"/><rect x="14" y="10" width="4" height="8" rx="1" fill="#3b0764"/><circle cx="16" cy="22" r="1.6" fill="#3b0764"/></g>' : ''}
            <path d="M58 92c-8 10-18 8-22-2 10-8 20-10 22 2z" fill="url(#tcHair-${id})"/>
            <path d="M168 96c10 8 20 4 22-8-12-4-20 0-22 8z" fill="url(#tcHair-${id})"/>
        </svg>`;
    }

    function mascotProps(kind, m) {
        const tag = (m && m.tagText) || (kind === 'maintenance' ? 'MAINTENANCE' : '');
        if (kind === 'maintenance') {
            return `<div class="tc-pop-props" aria-hidden="true">
                <span class="prop gear">⚙</span>
                <span class="prop bolt">⚡</span>
                <span class="prop warn">⚠</span>
                <span class="prop cone">▲</span>
                ${tag ? `<span class="prop sign">${esc(tag)}</span>` : ''}
            </div>`;
        }
        if (kind === 'alert') {
            return `<div class="tc-pop-props" aria-hidden="true">
                <span class="prop bang">!</span>
                <span class="prop tri">△</span>
                <span class="prop spark">✦</span>
            </div>`;
        }
        return `<div class="tc-pop-props" aria-hidden="true">
            <span class="prop spark">✦</span>
            <span class="prop heart">♡</span>
            <span class="prop star">✧</span>
        </div>`;
    }

    function renderMascot(cfg, kind) {
        const m = cfg.mascot || {};
        if (!m.enabled) return '';
        const style = [
            `--tc-mascot-scale:${Number(m.scale) || 100}`,
            `--tc-mascot-x:${Number(m.offsetX) || 0}px`,
            `--tc-mascot-y:${Number(m.offsetY) || 0}px`,
            `--tc-mascot-rot:${Number(m.rotation) || 0}deg`,
            `--tc-mascot-op:${(Number(m.opacity) || 100) / 100}`,
            `z-index:${Number(m.zIndex) || 4}`
        ].join(';');
        const cls = [
            'tc-pop-mascot',
            'is-' + (m.position || 'left'),
            m.animation && m.animation !== 'none' ? 'anim-' + m.animation : '',
            m.flip ? 'is-flip' : '',
            m.glow ? 'has-glow' : '',
            m.shadow ? 'has-shadow' : ''
        ].filter(Boolean).join(' ');
        const pose = m.pose || 'announce';
        const poseUrl = (m.poses && m.poses[pose]) || m.imageUrl;
        const art = poseUrl
            ? `<img src="${esc(poseUrl)}" alt="" draggable="false">`
            : mascotSvg(pose, 'live');
        const spark = m.particles ? '<i class="tc-pop-particle a"></i><i class="tc-pop-particle b"></i><i class="tc-pop-particle c"></i>' : '';
        return `<div class="tc-pop-mascot-col"><div class="${cls}" style="${style}">${spark}${art}${mascotProps(kind, m)}</div></div>`;
    }

    function fmtWhen(value) {
        if (!value) return 'รอประกาศ';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return esc(String(value));
        return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function renderSection(sec, cfg, kind) {
        if (!sec || sec.enabled === false) return '';
        const c = sec.content || {};
        switch (sec.type) {
            case 'text_block':
                if (!c.body && !c.title) return '';
                return `<div class="tc-pop-text tc-pop-stagger">${c.title ? `<h4>${esc(c.title)}</h4>` : ''}<p>${esc(c.body || '')}</p></div>`;
            case 'schedule_card':
            case 'maintenance_window': {
                const start = c.startAt || cfg.schedule.maintenanceStart || cfg.schedule.startAt || '';
                const end = c.endAt || cfg.schedule.maintenanceEnd || cfg.schedule.endAt || cfg.schedule.expectedFinishText || '';
                return `<section class="tc-pop-schedule tc-pop-stagger">
                    <header>${icon('calendar_month')} <span>${esc(c.title || 'กำหนดการ')}</span></header>
                    <div class="tc-pop-schedule-grid">
                        <div><small>${esc(c.startLabel || 'เริ่มต้น')}</small><b>${fmtWhen(start)}</b></div>
                        <span class="tc-pop-arrow">→</span>
                        <div><small>${esc(c.endLabel || 'คาดว่าแล้วเสร็จ')}</small><b>${fmtWhen(end)}</b></div>
                    </div>
                    ${c.note || c.datetimeLabel ? `<footer>* ${esc(c.note || c.datetimeLabel)}</footer>` : ''}
                </section>`;
            }
            case 'info_box': {
                const hazard = c.variant === 'hazard' || (kind === 'alert' && c.variant !== 'info');
                return `<div class="tc-pop-infobox ${hazard ? 'is-hazard' : ''} tc-pop-stagger">${icon(c.icon || 'info')} <span>${esc(c.text || '')}</span></div>`;
            }
            case 'warning_list': {
                const items = Array.isArray(c.items) ? c.items : [];
                return `<div class="tc-pop-warn-list">${items.map((item) => `
                    <article class="tc-pop-warn-card tc-pop-stagger"${item.href ? ` data-tc-pop-link="${esc(item.href)}"` : ''}>
                        <span class="tc-pop-warn-ico">${icon(item.icon || 'warning', 22)}</span>
                        <div><h4>${esc(item.title || '')}</h4><p>${esc(item.body || '')}</p></div>
                        <span class="tc-pop-chevron">${item.showChevron === false ? '' : '›'}</span>
                    </article>`).join('')}</div>`;
            }
            case 'feature_grid':
            case 'icon_stat_cards': {
                const cards = Array.isArray(c.cards) ? c.cards : [];
                const hex = kind === 'feature';
                return `<div class="tc-pop-features">${cards.map((card) => `
                    <article class="tc-pop-feat-card ${hex ? 'is-hex' : ''} tc-pop-stagger">
                        <span class="tc-pop-feat-ico">${icon(card.icon || 'auto_awesome', 22)}</span>
                        <h4>${esc(card.title || '')}</h4>
                        <p>${esc(card.body || '')}</p>
                        ${hex ? `<span class="tc-pop-feat-ok">${icon('check_circle', 16)}</span>` : ''}
                    </article>`).join('')}</div>`;
            }
            case 'bullet_list': {
                const items = Array.isArray(c.items) ? c.items : [];
                return `<ul class="tc-pop-bullets">${items.map((item) => `<li class="tc-pop-stagger">${icon(item.icon || 'check')} <span>${esc(item.text || item)}</span></li>`).join('')}</ul>`;
            }
            case 'footer_note':
                return `<p class="tc-pop-footer-note tc-pop-stagger">${icon(c.icon || 'shield', 16)} ${esc(c.text || '')}</p>`;
            default:
                return c.body ? `<div class="tc-pop-text"><p>${esc(c.body)}</p></div>` : '';
        }
    }

    function renderCtas(cfg) {
        const list = (cfg.ctas || []).filter((c) => c && c.text);
        if (!list.length) return '';
        return `<div class="tc-pop-cta-row">${list.map((cta, i) => {
            const kind = cta.type === 'secondary' || cta.style === 'secondary' ? 'secondary' : 'primary';
            return `<button type="button" class="tc-pop-cta is-${kind}" data-tc-pop-cta="${esc(cta.id || String(i))}" data-action="${esc(cta.actionType || 'close')}" data-value="${esc(cta.actionValue || '')}">
                ${icon(cta.icon || 'check', 18)}<span>${esc(cta.text)}</span>
            </button>`;
        }).join('')}</div>`;
    }

    function titleDecor(kind, title, cfg) {
        const left = (cfg && cfg.titleIconLeft) || (kind === 'alert' ? 'warning' : '');
        const right = (cfg && cfg.titleIconRight) || (kind === 'alert' || kind === 'maintenance' ? 'warning' : '');
        return `${left ? icon(left, 22) : ''}<span>${esc(title)}</span>${right ? icon(right, 22) : ''}`;
    }

    function cssSafeColor(value, fallback) {
        const s = String(value || '').trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
        if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(s)) return s;
        return fallback;
    }

    function cssVars(style) {
        const s = Object.assign({}, Cfg.DEFAULT_STYLE, style || {});
        return [
            `--tc-pop-primary:${cssSafeColor(s.primary, '#b026ff')}`,
            `--tc-pop-secondary:${cssSafeColor(s.secondary, '#ff26b0')}`,
            `--tc-pop-accent:${cssSafeColor(s.accent, '#c4b5fd')}`,
            `--tc-pop-bg:${cssSafeColor(s.background, '#12081f')}`,
            `--tc-pop-border:${cssSafeColor(s.border, 'rgba(176,38,255,.72)')}`,
            `--tc-pop-glow:${Number(s.glowIntensity) || 70}`,
            `--tc-pop-radius:${Number(s.radius) || 28}px`,
            `--tc-pop-overlay:${(Number(s.overlayOpacity) || 72) / 100}`,
            `--tc-pop-blur:${Number(s.overlayBlur) || 12}px`,
            `--tc-pop-card-op:${(Number(s.cardOpacity) || 92) / 100}`,
            `--tc-pop-type:${(Number(s.typographyScale) || 100) / 100}`
        ].join(';');
    }

    function renderPopup(announcement, options) {
        const opts = options || {};
        const item = Cfg.hydrateAnnouncement(announcement || {});
        const cfg = item.popupConfig || Cfg.defaultPopupConfig(item.announcementType);
        const style = cfg.style || {};
        const kind = cfg.template || item.announcementType || 'notice';
        const mascotOn = !!(cfg.mascot && cfg.mascot.enabled !== false);
        const deco = [
            style.sparkles !== false ? 'has-sparkles' : '',
            style.grid !== false ? 'has-grid' : '',
            style.orbit !== false ? 'has-orbit' : '',
            style.cornerDeco !== false ? 'has-corners' : '',
            cfg.rules && cfg.rules.blocking ? 'is-blocking' : '',
            mascotOn ? 'has-mascot' : 'no-mascot',
            'size-' + (cfg.popupSize || 'lg'),
            'type-' + kind,
            'align-' + (style.alignment || 'left')
        ].filter(Boolean).join(' ');
        const title = item.title || 'ประกาศ';
        const subtitle = cfg.subtitle || item.summary || '';
        const closeEnabled = cfg.close && cfg.close.enabled !== false && !(opts.lockClose);
        const overlayClick = cfg.layout && cfg.layout.overlayClick !== false && !(cfg.rules && cfg.rules.blocking && cfg.rules.requireAcknowledgement);
        const sections = (cfg.sections || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const hasText = sections.some((s) => s.enabled !== false && s.type === 'text_block' && s.content && s.content.body);
        const bodyFallback = !hasText && item.message
            ? `<div class="tc-pop-text tc-pop-stagger"><p>${esc(item.message)}</p></div>`
            : '';
        const dots = kind === 'update'
            ? '<div class="tc-pop-dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>'
            : '';

        return `<div class="tc-pop-root ${deco}${opts.preview ? ' is-preview' : ''}${opts.mode === 'mobile' ? ' is-mobile' : ''}" style="${cssVars(style)}" data-popup-id="${esc(item.id || '')}" data-overlay-click="${opts.preview ? '0' : (overlayClick ? '1' : '0')}">
            <div class="tc-pop-backdrop" data-tc-pop-backdrop></div>
            <div class="tc-pop-stage" role="dialog" aria-modal="true" aria-labelledby="tc-pop-title">
                ${closeEnabled ? `<button type="button" class="tc-pop-close" data-tc-pop-close aria-label="ปิด">${icon('close', 18)}</button>` : ''}
                ${cfg.badgeText ? `<div class="tc-pop-badge">${icon(cfg.badgeIcon || 'campaign', 16)}<span>${esc(cfg.badgeText)}</span></div>` : ''}
                <div class="tc-pop-card">
                    ${mascotOn ? renderMascot(cfg, kind) : ''}
                    <div class="tc-pop-content">
                        <header class="tc-pop-head">
                            <h2 id="tc-pop-title">${titleDecor(kind, title, cfg)}</h2>
                            ${subtitle ? `<p class="tc-pop-sub">${esc(subtitle)}</p>` : ''}
                            ${cfg.subtitle2 ? `<p class="tc-pop-sub is-second">${esc(cfg.subtitle2)}</p>` : ''}
                            ${cfg.highlightText && kind !== 'maintenance' ? `<p class="tc-pop-highlight">${esc(cfg.highlightText)}</p>` : ''}
                        </header>
                        <div class="tc-pop-body">
                            ${bodyFallback}
                            ${sections.map((sec) => renderSection(sec, cfg, kind)).join('')}
                        </div>
                        ${renderCtas(cfg)}
                        ${dots}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function mountPopup(target, announcement, options) {
        const host = typeof target === 'string' ? document.querySelector(target) : target;
        if (!host) return null;
        host.innerHTML = renderPopup(announcement, options);
        return host.querySelector('.tc-pop-root');
    }

    global.TcPopupRenderer = { renderPopup, mountPopup, mascotSvg, esc, icon };
})(typeof window !== 'undefined' ? window : globalThis);
