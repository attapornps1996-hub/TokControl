/**
 * Admin Popup Announcement Editor — live preview, templates, mascot, rules.
 */
(function (global) {
    'use strict';

    const Cfg = global.TcAnnouncementPopup;
    const Render = global.TcPopupRenderer;
    if (!Cfg || !Render) return;

    const state = {
        draft: null,
        announcement: null,
        tab: 'content',
        previewMode: 'desktop',
        zoom: 100,
        dirty: false,
        lastValidation: { ok: true, errors: [] },
        layers: { bg: true, mascot: true, header: true, content: true, cta: true }
    };

    function esc(v) { return Render.esc(v); }
    function $(sel, root) { return (root || document).querySelector(sel); }

    function emptyAnnouncement() {
        return {
            id: null,
            title: Cfg.TEMPLATES.feature.title,
            message: 'ปลดล็อกประสบการณ์ใหม่ใน TokControl',
            summary: 'มีอะไรใหม่ในเวอร์ชันนี้',
            category: 'feature',
            displayType: 'popup',
            announcementType: 'feature',
            status: 'draft',
            audience: 'all',
            audienceConfig: '',
            priority: 50,
            locale: 'th',
            important: true,
            showPopup: true,
            showNotification: true,
            displayHome: true,
            pinned: false,
            publishAt: '',
            expireAt: '',
            timezone: 'Asia/Bangkok',
            popupConfig: Cfg.defaultPopupConfig('feature')
        };
    }

    function current() {
        if (!state.announcement) state.announcement = emptyAnnouncement();
        if (!state.announcement.popupConfig) state.announcement.popupConfig = Cfg.defaultPopupConfig(state.announcement.announcementType);
        return state.announcement;
    }

    function notifyChange() {
        state.dirty = true;
        validate();
        preview();
        const status = $('#tcPopedStatusText');
        if (status) status.textContent = current().status || 'draft';
    }

    function validate() {
        const item = current();
        const payload = Object.assign({}, item, {
            message: item.message || item.title,
            popupConfig: item.popupConfig
        });
        state.lastValidation = Cfg.validateAnnouncement(payload);
        const box = $('#tcPopedValidation');
        if (!box) return;
        if (state.lastValidation.ok) {
            box.textContent = '';
            return;
        }
        box.textContent = state.lastValidation.errors.map((e) => e.message).join(' · ');
    }

    function preview() {
        const stage = $('#tcPopedPreviewStage');
        if (!stage || !Render) return;
        const html = Render.renderPopup(current(), { mode: state.previewMode, lockClose: false });
        stage.innerHTML = html;
        const root = stage.querySelector('.tc-pop-root');
        if (root) {
            root.classList.add('is-preview');
            if (state.previewMode === 'mobile') root.classList.add('is-mobile');
            root.style.zoom = String((Number(state.zoom) || 100) / 100);
            if (!state.layers.bg) root.classList.add('hide-layer-bg');
            if (!state.layers.mascot) root.classList.add('hide-layer-mascot');
            if (!state.layers.header) root.classList.add('hide-layer-header');
            if (!state.layers.content) root.classList.add('hide-layer-content');
            if (!state.layers.cta) root.classList.add('hide-layer-cta');
        }
        const layers = $('#tcPopedLayers');
        if (layers) {
            const rows = [
                ['bg', 'พื้นหลัง'],
                ['mascot', 'มาสคอต'],
                ['header', 'หัวข้อ'],
                ['content', 'เนื้อหา'],
                ['cta', 'ปุ่ม CTA']
            ];
            layers.innerHTML = rows.map(([key, label]) =>
                `<label class="tc-poped-layer"><input type="checkbox" data-layer="${key}" ${state.layers[key] !== false ? 'checked' : ''}><span>${esc(label)}</span></label>`
            ).join('');
            layers.querySelectorAll('[data-layer]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    state.layers[cb.dataset.layer] = cb.checked;
                    preview();
                });
            });
        }
        const idEl = $('#tcPopedId');
        if (idEl) idEl.textContent = current().id ? ('POP-' + current().id) : 'POP-DRAFT';
        const titleLen = (current().title || '').length;
        const warn = $('#tcPopedPreviewWarn');
        if (warn) {
            const notes = [];
            if (titleLen > 42) notes.push('หัวข้อยาว อาจตัดบนมือถือ');
            if ((current().popupConfig.mascot.scale || 100) > 130 && state.previewMode === 'mobile') notes.push('มาสคอตใหญ่เกินไปในโหมดมือถือ');
            warn.textContent = notes.join(' · ');
        }
    }

    function applyTemplate(id) {
        const item = current();
        item.announcementType = id === 'custom' ? 'notice' : id;
        item.category = item.announcementType === 'notice' ? 'notice' : item.announcementType;
        item.popupConfig = Cfg.applyTemplateToDraft(item.popupConfig, id === 'custom' ? 'notice' : id);
        item.title = Cfg.TEMPLATES[id]?.title || item.title;
        notifyChange();
        renderForm();
    }

    function field(label, html, span) {
        return `<div class="tc-poped-field${span ? ' span-2' : ''}"><label>${esc(label)}</label>${html}</div>`;
    }

    function isAdminUi() {
        try { return typeof global.isCurrentUserAdmin === 'function' && !!global.isCurrentUserAdmin(); } catch (_) { return false; }
    }

    function chipRow(name, values, selected, labels) {
        return `<div class="tc-poped-chips" data-chip-group="${esc(name)}">${values.map((v) => {
            const label = (labels && labels[v]) || v;
            return `<button type="button" class="tc-poped-chip ${selected === v ? 'active' : ''}" data-chip="${esc(v)}">${esc(label)}</button>`;
        }).join('')}</div>`;
    }

    function rangeField(label, id, min, max, value, suffix) {
        return field(label, `<div class="tc-poped-range"><input id="${id}" type="range" min="${min}" max="${max}" value="${esc(value)}"><b data-range-out>${esc(value)}${suffix || ''}</b></div>`);
    }

    function sectionTypeLabel(type) {
        return ({
            text_block: 'ข้อความ',
            warning_list: 'การ์ดเตือน',
            feature_grid: 'การ์ดฟีเจอร์',
            icon_stat_cards: 'การ์ดไอคอน',
            schedule_card: 'กำหนดการ',
            maintenance_window: 'ช่วงปิดปรับปรุง',
            info_box: 'กล่องข้อมูล',
            bullet_list: 'รายการหัวข้อ',
            footer_note: 'ข้อความท้าย',
            cta_bar: 'แถบปุ่ม'
        })[type] || type;
    }

    function defaultSectionContent(type) {
        if (type === 'warning_list') return { items: [{ icon: 'verified_user', title: 'หัวข้อการ์ด', body: 'คำอธิบาย', href: '' }] };
        if (type === 'feature_grid' || type === 'icon_stat_cards') return { cards: [{ icon: 'auto_awesome', title: 'หัวข้อ', body: 'คำอธิบาย' }] };
        if (type === 'info_box') return { icon: 'info', text: 'ข้อความกล่องข้อมูล', variant: 'info' };
        if (type === 'maintenance_window' || type === 'schedule_card') {
            return { title: 'กำหนดการ', startLabel: 'เริ่มต้น', endLabel: 'คาดว่าแล้วเสร็จ', note: '', startAt: '', endAt: '' };
        }
        if (type === 'bullet_list') return { items: [{ icon: 'check', text: 'รายการ' }] };
        if (type === 'footer_note') return { icon: 'shield', text: 'ข้อความท้ายการ์ด' };
        return { title: '', body: 'ข้อความใหม่' };
    }

    function renderItemEditor(sec, item, idx) {
        item = item && typeof item === 'object' ? item : { text: String(item || '') };
        if (sec.type === 'warning_list') {
            return `<div class="tc-poped-item" data-item-idx="${idx}">
                <div class="tc-poped-item-head"><b>การ์ด ${idx + 1}</b><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-item-del>ลบ</button></div>
                <div class="tc-poped-grid">
                    ${field('ไอคอน (Material)', `<input data-item-field="icon" value="${esc(item.icon || '')}" placeholder="verified_user">`)}
                    ${field('หัวข้อ', `<input data-item-field="title" value="${esc(item.title || '')}">`)}
                    ${field('คำอธิบาย', `<textarea rows="2" data-item-field="body">${esc(item.body || '')}</textarea>`, true)}
                    ${field('ลิงก์เมื่อคลิก', `<input data-item-field="href" value="${esc(item.href || '')}" placeholder="https://... หรือเว้นว่าง">`, true)}
                </div>
            </div>`;
        }
        if (sec.type === 'feature_grid' || sec.type === 'icon_stat_cards') {
            return `<div class="tc-poped-item" data-item-idx="${idx}">
                <div class="tc-poped-item-head"><b>การ์ด ${idx + 1}</b><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-item-del>ลบ</button></div>
                <div class="tc-poped-grid">
                    ${field('ไอคอน', `<input data-item-field="icon" value="${esc(item.icon || '')}" placeholder="rocket_launch">`)}
                    ${field('หัวข้อ', `<input data-item-field="title" value="${esc(item.title || '')}">`)}
                    ${field('คำอธิบาย', `<textarea rows="2" data-item-field="body">${esc(item.body || '')}</textarea>`, true)}
                </div>
            </div>`;
        }
        const text = typeof item === 'string' ? item : (item.text || '');
        const iconName = typeof item === 'object' ? (item.icon || 'check') : 'check';
        return `<div class="tc-poped-item" data-item-idx="${idx}">
            <div class="tc-poped-item-head"><b>รายการ ${idx + 1}</b><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-item-del>ลบ</button></div>
            <div class="tc-poped-grid">
                ${field('ไอคอน', `<input data-item-field="icon" value="${esc(iconName)}">`)}
                ${field('ข้อความ', `<input data-item-field="text" value="${esc(text)}">`, true)}
            </div>
        </div>`;
    }

    function renderSectionEditors() {
        const secs = current().popupConfig.sections || [];
        if (!secs.length) return '<p class="adm-card-hint">ยังไม่มีบล็อกเนื้อหา — กดเพิ่มด้านล่าง</p>';
        return secs.map((sec, i) => {
            const c = sec.content || {};
            let body = '';
            if (sec.type === 'text_block') {
                body = `<div class="tc-poped-grid">
                    ${field('หัวข้อบล็อก', `<input data-sec-field="title" value="${esc(c.title || '')}">`)}
                    ${field('เนื้อหา', `<textarea rows="3" data-sec-field="body">${esc(c.body || '')}</textarea>`, true)}
                </div>`;
            } else if (sec.type === 'info_box') {
                body = `<div class="tc-poped-grid">
                    ${field('ไอคอน', `<input data-sec-field="icon" value="${esc(c.icon || 'info')}">`)}
                    ${field('สไตล์กล่อง', `<select data-sec-field="variant"><option value="info" ${c.variant !== 'hazard' ? 'selected' : ''}>ข้อมูล</option><option value="hazard" ${c.variant === 'hazard' ? 'selected' : ''}>ลายเตือน (แถบเฉียง)</option></select>`)}
                    ${field('ข้อความ', `<textarea rows="2" data-sec-field="text">${esc(c.text || '')}</textarea>`, true)}
                </div>`;
            } else if (sec.type === 'maintenance_window' || sec.type === 'schedule_card') {
                body = `<div class="tc-poped-grid">
                    ${field('หัวข้อกล่อง', `<input data-sec-field="title" value="${esc(c.title || '')}">`, true)}
                    ${field('ป้ายเริ่มต้น', `<input data-sec-field="startLabel" value="${esc(c.startLabel || 'เริ่มต้น')}">`)}
                    ${field('ป้ายสิ้นสุด', `<input data-sec-field="endLabel" value="${esc(c.endLabel || 'คาดว่าแล้วเสร็จ')}">`)}
                    ${field('เวลาเริ่ม (ถ้าไม่ใช้ตารางด้านบน)', `<input data-sec-field="startAt" value="${esc(c.startAt || '')}" placeholder="เว้นว่าง = ใช้เวลาในแท็บเวลา">`)}
                    ${field('เวลาสิ้นสุด', `<input data-sec-field="endAt" value="${esc(c.endAt || '')}">`)}
                    ${field('หมายเหตุท้ายกล่อง', `<input data-sec-field="note" value="${esc(c.note || c.datetimeLabel || '')}">`, true)}
                </div>`;
            } else if (sec.type === 'footer_note') {
                body = `<div class="tc-poped-grid">
                    ${field('ไอคอน', `<input data-sec-field="icon" value="${esc(c.icon || 'shield')}">`)}
                    ${field('ข้อความ', `<input data-sec-field="text" value="${esc(c.text || '')}">`, true)}
                </div>`;
            } else if (sec.type === 'warning_list' || sec.type === 'feature_grid' || sec.type === 'icon_stat_cards' || sec.type === 'bullet_list') {
                const list = sec.type === 'feature_grid' || sec.type === 'icon_stat_cards' ? (c.cards || []) : (c.items || []);
                body = list.map((item, idx) => renderItemEditor(sec, item, idx)).join('')
                    + `<button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-item-add>+ เพิ่มการ์ด / รายการ</button>`;
            } else {
                body = `<div class="tc-poped-grid">${field('เนื้อหา', `<textarea rows="2" data-sec-field="body">${esc(c.body || '')}</textarea>`, true)}</div>`;
            }
            return `<div class="tc-poped-sec" data-sec-id="${esc(sec.id)}">
                <div class="tc-poped-sec-row">
                    <input type="checkbox" ${sec.enabled !== false ? 'checked' : ''} data-sec-enabled title="แสดงบล็อกนี้">
                    <b>${esc(sectionTypeLabel(sec.type))}</b>
                    <span class="tc-poped-sec-type">${esc(sec.type)}</span>
                    <button type="button" data-sec-up ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้น">↑</button>
                    <button type="button" data-sec-down ${i === secs.length - 1 ? 'disabled' : ''} title="เลื่อนลง">↓</button>
                    <button type="button" data-sec-clone>คัดลอก</button>
                    <button type="button" data-sec-del>ลบ</button>
                </div>
                <div class="tc-poped-sec-body">${sec.enabled === false ? '<p class="adm-card-hint">บล็อกนี้ถูกซ่อน</p>' : body}</div>
            </div>`;
        }).join('');
    }

    function poseThumb(poseId, url) {
        if (url) return `<img src="${esc(url)}" alt="${esc(poseId)}" draggable="false">`;
        return Render.mascotSvg(poseId);
    }

    function bindValue(sel, path, kind) {
        const el = $(sel);
        if (!el) return;
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'range' || el.type === 'color' ? 'change' : 'input', () => {
            const item = current();
            const parts = path.split('.');
            let obj = item;
            for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
            const key = parts[parts.length - 1];
            if (kind === 'bool') obj[key] = !!el.checked;
            else if (kind === 'num') obj[key] = Number(el.value);
            else obj[key] = el.value;
            notifyChange();
        });
    }

    function renderTemplates() {
        return Object.values(Cfg.TEMPLATES).map((tpl) => `
            <button type="button" class="tc-poped-tpl ${current().popupConfig.template === tpl.id ? 'active' : ''}" data-pop-tpl="${esc(tpl.id)}">
                <b>${esc(tpl.name)}</b><small>${esc(tpl.previewHint)}</small>
            </button>`).join('');
    }

    function tabHtml(tab) {
        const item = current();
        const cfg = item.popupConfig;
        if (tab === 'content') {
            return `<div class="tc-poped-grid">
                ${field('หัวข้อหลัก', `<input id="tcPopTitle" maxlength="120" value="${esc(item.title)}">`, true)}
                ${field('ไอคอนซ้ายหัวข้อ', `<input id="tcPopIconLeft" value="${esc(cfg.titleIconLeft || '')}" placeholder="warning หรือเว้นว่าง">`)}
                ${field('ไอคอนขวาหัวข้อ', `<input id="tcPopIconRight" value="${esc(cfg.titleIconRight || '')}" placeholder="warning หรือเว้นว่าง">`)}
                ${field('หัวข้อรอง บรรทัด 1', `<input id="tcPopSubtitle" value="${esc(cfg.subtitle || '')}">`, true)}
                ${field('หัวข้อรอง บรรทัด 2', `<input id="tcPopSubtitle2" value="${esc(cfg.subtitle2 || '')}">`, true)}
                ${field('Highlight', `<input id="tcPopHighlight" value="${esc(cfg.highlightText || '')}">`, true)}
                ${field('เนื้อหาสำรอง (ถ้าไม่มีบล็อกข้อความ)', `<textarea id="tcPopBody" rows="3">${esc(item.message || '')}</textarea>`, true)}
                ${field('Badge', `<input id="tcPopBadge" value="${esc(cfg.badgeText || '')}">`)}
                ${field('Badge icon', `<input id="tcPopBadgeIcon" value="${esc(cfg.badgeIcon || '')}">`)}
                ${field('ประเภทประกาศ', `<select id="tcPopType">${Cfg.ANNOUNCEMENT_TYPES.map((t) => `<option ${item.announcementType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
                ${field('ภาษา', `<select id="tcPopLocale"><option value="th" ${item.locale === 'th' ? 'selected' : ''}>ไทย</option><option value="en" ${item.locale === 'en' ? 'selected' : ''}>English</option></select>`)}
            </div>
            <div class="tc-poped-sec-wrap">
                <div class="tc-poped-sec-head">
                    <label>บล็อกเนื้อหา — แก้ได้ทุกส่วน</label>
                    <div class="tc-poped-add-row">
                        <select id="tcPopAddSectionType">${Cfg.SECTION_TYPES.map((t) => `<option value="${esc(t)}">${esc(sectionTypeLabel(t))}</option>`).join('')}</select>
                        <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="tcPopAddSection">+ เพิ่มบล็อก</button>
                    </div>
                </div>
                <div id="tcPopSectionList">${renderSectionEditors()}</div>
            </div>`;
        }
        if (tab === 'mascot') {
            const m = cfg.mascot;
            m.poses = m.poses || { announce: '', alert: '', happy: '', wink: '' };
            const posLabels = { left: 'ซ้าย', right: 'ขวา', 'bottom-left': 'ล่างซ้าย', floating: 'ลอย', 'overlap-card': 'ทับการ์ด' };
            const animLabels = { none: 'ไม่มี', float: 'ลอย', bounce: 'เด้ง', 'fade-in': 'ค่อยปรากฏ', wiggle: 'ส่าย', pulse: 'เต้น' };
            return `<div class="tc-poped-grid">
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcMascotOn" ${m.enabled ? 'checked' : ''}> แสดงมาสคอต</label>
                <div class="span-2 tc-poped-pose-grid">${Cfg.MASCOT_POSES.map((p) => {
                    const url = m.poses[p.id] || '';
                    return `<div class="tc-poped-pose ${m.pose === p.id ? 'active' : ''}" data-pose="${esc(p.id)}">
                        <button type="button" class="tc-poped-pose-pick" data-pose-select="${esc(p.id)}">
                            <div class="tc-poped-pose-art">${poseThumb(p.id, url)}</div>
                            <span>${esc(p.emoji)} ${esc(p.label)}</span>
                        </button>
                        <label class="tc-poped-upload-btn">${url ? 'เปลี่ยนรูป' : 'อัปโหลด'}
                            <input type="file" accept="image/png,image/webp,image/gif" hidden data-pose-file="${esc(p.id)}">
                        </label>
                        ${url ? `<button type="button" class="tc-poped-pose-clear" data-pose-clear="${esc(p.id)}">ลบรูป</button>` : ''}
                    </div>`;
                }).join('')}</div>
                <p class="adm-card-hint span-2">อัปโหลด PNG / WEBP โปร่งใสแยกแต่ละท่า — กดการ์ดเพื่อเลือกท่าที่ใช้ในป๊อปอัปนี้</p>
                ${field('ตำแหน่ง', chipRow('position', Cfg.MASCOT_POSITIONS, m.position, posLabels), true)}
                ${field('Animation', chipRow('animation', Cfg.MASCOT_ANIMS, m.animation, animLabels), true)}
                ${field('ป้ายมาสคอต (เช่น MAINTENANCE)', `<input id="tcMascotTag" value="${esc(m.tagText || '')}">`, true)}
                ${rangeField('Scale %', 'tcMascotScale', 40, 180, m.scale, '%')}
                ${rangeField('Rotation', 'tcMascotRot', -30, 30, m.rotation, '°')}
                ${field('Offset X', `<input id="tcMascotX" type="number" value="${esc(m.offsetX)}">`)}
                ${field('Offset Y', `<input id="tcMascotY" type="number" value="${esc(m.offsetY)}">`)}
                ${rangeField('Opacity', 'tcMascotOp', 20, 100, m.opacity, '%')}
                ${field('Z-index', `<input id="tcMascotZ" type="number" min="0" max="20" value="${esc(m.zIndex)}">`)}
                <label class="tc-poped-check"><input type="checkbox" id="tcMascotFlip" ${m.flip ? 'checked' : ''}> Flip</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcMascotShadow" ${m.shadow ? 'checked' : ''}> Drop shadow</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcMascotGlow" ${m.glow ? 'checked' : ''}> Glow</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcMascotParts" ${m.particles ? 'checked' : ''}> Particles</label>
            </div>`;
        }
        if (tab === 'style') {
            const s = cfg.style;
            return `<div class="tc-poped-grid">
                ${field('Primary', `<input id="tcStPrimary" type="color" value="${/^#/.test(s.primary) ? s.primary.slice(0, 7) : '#b026ff'}">`)}
                ${field('Secondary', `<input id="tcStSecondary" type="color" value="${/^#/.test(s.secondary) ? s.secondary.slice(0, 7) : '#ff26b0'}">`)}
                ${field('Accent', `<input id="tcStAccent" type="color" value="${/^#/.test(s.accent) ? s.accent.slice(0, 7) : '#c4b5fd'}">`)}
                ${field('Background', `<input id="tcStBg" type="color" value="${/^#/.test(s.background) ? s.background.slice(0, 7) : '#12081f'}">`)}
                ${field('Glow', `<input id="tcStGlow" type="range" min="0" max="100" value="${esc(s.glowIntensity)}">`)}
                ${field('Radius', `<input id="tcStRadius" type="range" min="8" max="40" value="${esc(s.radius)}">`)}
                ${field('Overlay opacity', `<input id="tcStOverlay" type="range" min="20" max="90" value="${esc(s.overlayOpacity)}">`)}
                ${field('Card opacity', `<input id="tcStCard" type="range" min="60" max="100" value="${esc(s.cardOpacity)}">`)}
                ${field('Typography %', `<input id="tcStType" type="range" min="80" max="130" value="${esc(s.typographyScale)}">`)}
                ${field('ขนาดป๊อปอัป', `<select id="tcPopSize"><option>md</option><option>lg</option><option>xl</option></select>`)}
                <label class="tc-poped-check"><input type="checkbox" id="tcStSpark" ${s.sparkles ? 'checked' : ''}> Sparkles</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcStGrid" ${s.grid ? 'checked' : ''}> Grid</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcStOrbit" ${s.orbit ? 'checked' : ''}> Orbit</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcStCorner" ${s.cornerDeco ? 'checked' : ''}> Corner deco</label>
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcLayOverlayClick" ${cfg.layout.overlayClick !== false ? 'checked' : ''}> คลิกพื้นหลังเพื่อปิด</label>
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcCloseOn" ${cfg.close.enabled !== false ? 'checked' : ''}> แสดงปุ่ม X</label>
            </div>`;
        }
        if (tab === 'layout') {
            const l = cfg.layout;
            return `<div class="tc-poped-grid">
                ${field('ตำแหน่งจอ', `<select id="tcLayPlace"><option ${l.placement === 'center' ? 'selected' : ''}>center</option><option ${l.placement === 'top' ? 'selected' : ''}>top</option><option ${l.placement === 'bottom' ? 'selected' : ''}>bottom</option></select>`)}
                ${field('ปุ่มปิด', `<select id="tcLayClose"><option ${l.closePosition === 'top-right' ? 'selected' : ''}>top-right</option><option ${l.closePosition === 'top-left' ? 'selected' : ''}>top-left</option></select>`)}
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcLayOverlayClick" ${l.overlayClick !== false ? 'checked' : ''}> คลิกพื้นหลังเพื่อปิด</label>
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcCloseOn" ${cfg.close.enabled !== false ? 'checked' : ''}> แสดงปุ่ม X</label>
            </div>`;
        }
        if (tab === 'schedule') {
            const s = cfg.schedule;
            return `<div class="tc-poped-grid">
                ${field('Publish at', `<input id="tcPubAt" type="datetime-local" value="${esc(toLocal(item.publishAt))}">`)}
                ${field('Expire at', `<input id="tcExpAt" type="datetime-local" value="${esc(toLocal(item.expireAt))}">`)}
                ${field('Maintenance start', `<input id="tcMaintStart" type="datetime-local" value="${esc(toLocal(s.maintenanceStart))}">`)}
                ${field('Maintenance end', `<input id="tcMaintEnd" type="datetime-local" value="${esc(toLocal(s.maintenanceEnd))}">`)}
                ${field('Expected finish text', `<input id="tcMaintText" value="${esc(s.expectedFinishText)}">`, true)}
                ${field('Timezone', `<select id="tcTz"><option>Asia/Bangkok</option><option>UTC</option></select>`)}
            </div>`;
        }
        if (tab === 'audience') {
            const t = cfg.targeting;
            return `<div class="tc-poped-grid">
                ${field('กลุ่มเป้าหมาย', `<select id="tcAud"><option value="all">ทุกคน</option><option value="pro">PRO</option><option value="free">Free</option><option value="custom">Custom IDs</option></select>`)}
                ${field('User IDs', `<input id="tcAudIds" placeholder="id1,id2" value="${esc(item.audienceConfig)}">`, true)}
                ${field('แพลตฟอร์ม', `<select id="tcPlat"><option value="all">ทั้งหมด</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>`)}
                ${field('App version ขั้นต่ำ', `<input id="tcVerMin" value="${esc(t.appVersionMin)}">`)}
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcFirstLogin" ${t.firstLogin ? 'checked' : ''}> เฉพาะล็อกอินครั้งแรก</label>
            </div>`;
        }
        if (tab === 'rules') {
            const r = cfg.rules;
            return `<div class="tc-poped-grid">
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleOnce" ${r.showOnce ? 'checked' : ''}> แสดงครั้งเดียว</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleVersion" ${r.showOncePerVersion ? 'checked' : ''}> ครั้งเดียวต่อเวอร์ชัน</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleBlock" ${r.blocking ? 'checked' : ''}> Blocking</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleAck" ${r.requireAcknowledgement ? 'checked' : ''}> บังคับรับทราบ</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleLogin" ${r.showOnLogin ? 'checked' : ''}> แสดงตอนล็อกอิน</label>
                <label class="tc-poped-check"><input type="checkbox" id="tcRuleDash" ${r.showOnDashboard ? 'checked' : ''}> แสดงหน้าแดชบอร์ด</label>
                ${field('แสดงอีกครั้งหลัง (ชม.)', `<input id="tcRuleHours" type="number" min="0" value="${esc(r.showAgainAfterHours)}">`)}
                ${field('หน่วงก่อนปิด (วินาที)', `<input id="tcRuleDelay" type="number" min="0" value="${esc(r.delayBeforeClose)}">`)}
                ${field('Max impressions / user', `<input id="tcRuleMax" type="number" min="0" value="${esc(r.maxImpressions)}">`)}
                ${field('Queue priority', `<input id="tcRuleQueue" type="number" min="0" max="100" value="${esc(r.queuePriority)}">`)}
            </div>`;
        }
        if (tab === 'cta') {
            const primary = cfg.ctas[0] || Cfg.cta('primary', 'รับทราบ', 'acknowledge');
            const secondary = cfg.ctas[1];
            return `<div class="tc-poped-grid">
                ${field('ข้อความปุ่มหลัก', `<input id="tcCta1Text" value="${esc(primary.text)}">`)}
                ${field('ไอคอนปุ่มหลัก', `<input id="tcCta1Icon" value="${esc(primary.icon || 'check')}">`)}
                ${field('Action', `<select id="tcCta1Act">${Cfg.CTA_ACTIONS.map((a) => `<option ${primary.actionType === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`)}
                ${field('ค่า / URL / route', `<input id="tcCta1Val" value="${esc(primary.actionValue || '')}">`, true)}
                <label class="tc-poped-check span-2"><input type="checkbox" id="tcCta2On" ${secondary ? 'checked' : ''}> เปิดปุ่มรอง</label>
                ${field('ข้อความปุ่มรอง', `<input id="tcCta2Text" value="${esc(secondary && secondary.text || 'ปิด')}">`)}
                ${field('ไอคอนปุ่มรอง', `<input id="tcCta2Icon" value="${esc(secondary && secondary.icon || 'close')}">`)}
                ${field('Action รอง', `<select id="tcCta2Act">${Cfg.CTA_ACTIONS.map((a) => `<option ${secondary && secondary.actionType === a ? 'selected' : ''}>${a}</option>`).join('')}</select>`)}
                ${field('ค่า / URL ปุ่มรอง', `<input id="tcCta2Val" value="${esc(secondary && secondary.actionValue || '')}">`, true)}
            </div>`;
        }
        return `<div class="tc-poped-grid">
            ${field('สถานะ', `<select id="tcStatus"><option>draft</option><option>scheduled</option><option>published</option><option>archived</option></select>`)}
            <label class="tc-poped-check"><input type="checkbox" id="tcImportant" ${item.important ? 'checked' : ''}> ประกาศสำคัญ</label>
            <label class="tc-poped-check"><input type="checkbox" id="tcNotify" ${item.showNotification ? 'checked' : ''}> ส่งกระดิ่ง</label>
            <label class="tc-poped-check"><input type="checkbox" id="tcHome" ${item.displayHome ? 'checked' : ''}> แสดงหน้าแรก</label>
            <label class="tc-poped-check"><input type="checkbox" id="tcPinned" ${item.pinned ? 'checked' : ''}> Pin</label>
        </div>
        <p class="adm-card-hint" style="margin-top:10px">Revision จะถูกบันทึกทุกครั้งที่กดบันทึกหรือเผยแพร่</p>`;
    }

    function toLocal(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function bindTab() {
        const item = current();
        const cfg = item.popupConfig;
        if (state.tab === 'content') {
            bindValue('#tcPopTitle', 'title');
            $('#tcPopSubtitle')?.addEventListener('input', (e) => { cfg.subtitle = e.target.value; notifyChange(); });
            $('#tcPopSubtitle2')?.addEventListener('input', (e) => { cfg.subtitle2 = e.target.value; notifyChange(); });
            $('#tcPopIconLeft')?.addEventListener('input', (e) => { cfg.titleIconLeft = e.target.value; notifyChange(); });
            $('#tcPopIconRight')?.addEventListener('input', (e) => { cfg.titleIconRight = e.target.value; notifyChange(); });
            bindValue('#tcPopBody', 'message');
            $('#tcPopHighlight')?.addEventListener('input', (e) => { cfg.highlightText = e.target.value; notifyChange(); });
            $('#tcPopBadge')?.addEventListener('input', (e) => { cfg.badgeText = e.target.value; notifyChange(); });
            $('#tcPopBadgeIcon')?.addEventListener('input', (e) => { cfg.badgeIcon = e.target.value; notifyChange(); });
            bindValue('#tcPopType', 'announcementType');
            bindValue('#tcPopLocale', 'locale');
            const list = $('#tcPopSectionList');
            list?.addEventListener('click', onSectionClick);
            list?.addEventListener('change', (e) => {
                onSectionToggle(e);
                if (e.target.matches('[data-sec-field],[data-item-field]')) applySectionField(e.target);
            });
            list?.addEventListener('input', (e) => {
                if (e.target.matches('[data-sec-field],[data-item-field]')) applySectionField(e.target);
            });
            $('#tcPopAddSection')?.addEventListener('click', () => {
                const type = $('#tcPopAddSectionType')?.value || 'text_block';
                cfg.sections.push(Cfg.section(type, defaultSectionContent(type)));
                renderForm();
                notifyChange();
            });
        }
        if (state.tab === 'mascot') {
            const m = cfg.mascot;
            m.poses = m.poses || { announce: '', alert: '', happy: '', wink: '' };
            $('#tcMascotOn')?.addEventListener('change', (e) => { m.enabled = e.target.checked; notifyChange(); });
            document.querySelectorAll('[data-pose-select]').forEach((btn) => btn.addEventListener('click', () => {
                m.pose = btn.dataset.poseSelect;
                renderForm();
                notifyChange();
            }));
            document.querySelector('[data-chip-group="position"]')?.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-chip]');
                if (!chip) return;
                m.position = chip.dataset.chip;
                renderForm();
                notifyChange();
            });
            document.querySelector('[data-chip-group="animation"]')?.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-chip]');
                if (!chip) return;
                m.animation = chip.dataset.chip;
                renderForm();
                notifyChange();
            });
            $('#tcMascotTag')?.addEventListener('input', (e) => { m.tagText = e.target.value; notifyChange(); });
            ['Scale', 'Rot', 'X', 'Y', 'Op', 'Z'].forEach((key) => {
                const map = { Scale: 'scale', Rot: 'rotation', X: 'offsetX', Y: 'offsetY', Op: 'opacity', Z: 'zIndex' };
                const el = $('#tcMascot' + key);
                el?.addEventListener('input', (e) => {
                    m[map[key]] = Number(e.target.value);
                    const out = e.target.parentElement && e.target.parentElement.querySelector('[data-range-out]');
                    if (out) out.textContent = e.target.value + (key === 'Scale' || key === 'Op' ? '%' : key === 'Rot' ? '°' : '');
                    notifyChange();
                });
            });
            ['Flip', 'Shadow', 'Glow'].forEach((key) => {
                const map = { Flip: 'flip', Shadow: 'shadow', Glow: 'glow' };
                $('#tcMascot' + key)?.addEventListener('change', (e) => { m[map[key]] = e.target.checked; notifyChange(); });
            });
            $('#tcMascotParts')?.addEventListener('change', (e) => { m.particles = e.target.checked; notifyChange(); });
            document.querySelectorAll('[data-pose-file]').forEach((input) => input.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                const poseId = e.target.dataset.poseFile;
                if (!file || !poseId) return;
                if (!/^image\/(png|webp|gif)$/i.test(file.type)) {
                    toast('รองรับเฉพาะ PNG / WEBP / GIF โปร่งใส');
                    return;
                }
                if (file.size > 2.5 * 1024 * 1024) {
                    toast('ไฟล์ใหญ่เกินไป (สูงสุด 2.5MB)');
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    m.poses[poseId] = String(reader.result || '');
                    m.pose = poseId;
                    renderForm();
                    notifyChange();
                };
                reader.readAsDataURL(file);
            }));
            document.querySelectorAll('[data-pose-clear]').forEach((btn) => btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                m.poses[btn.dataset.poseClear] = '';
                renderForm();
                notifyChange();
            }));
        }
        if (state.tab === 'style') {
            const s = cfg.style;
            const color = (id, key) => $(id)?.addEventListener('input', (e) => { s[key] = e.target.value; notifyChange(); });
            color('#tcStPrimary', 'primary'); color('#tcStSecondary', 'secondary'); color('#tcStAccent', 'accent'); color('#tcStBg', 'background');
            $('#tcStGlow')?.addEventListener('input', (e) => { s.glowIntensity = Number(e.target.value); notifyChange(); });
            $('#tcStRadius')?.addEventListener('input', (e) => { s.radius = Number(e.target.value); notifyChange(); });
            $('#tcStOverlay')?.addEventListener('input', (e) => { s.overlayOpacity = Number(e.target.value); notifyChange(); });
            $('#tcStCard')?.addEventListener('input', (e) => { s.cardOpacity = Number(e.target.value); notifyChange(); });
            $('#tcStType')?.addEventListener('input', (e) => { s.typographyScale = Number(e.target.value); notifyChange(); });
            const size = $('#tcPopSize'); if (size) { size.value = cfg.popupSize || 'lg'; size.onchange = (e) => { cfg.popupSize = e.target.value; notifyChange(); }; }
            ['Spark', 'Grid', 'Orbit', 'Corner'].forEach((key) => {
                const map = { Spark: 'sparkles', Grid: 'grid', Orbit: 'orbit', Corner: 'cornerDeco' };
                $('#tcSt' + key)?.addEventListener('change', (e) => { s[map[key]] = e.target.checked; notifyChange(); });
            });
            $('#tcLayOverlayClick')?.addEventListener('change', (e) => { cfg.layout.overlayClick = e.target.checked; cfg.rules.overlayClickCloses = e.target.checked; notifyChange(); });
            $('#tcCloseOn')?.addEventListener('change', (e) => { cfg.close.enabled = e.target.checked; notifyChange(); });
        }
        if (state.tab === 'layout') {
            $('#tcLayPlace')?.addEventListener('change', (e) => { cfg.layout.placement = e.target.value; notifyChange(); });
            $('#tcLayClose')?.addEventListener('change', (e) => { cfg.layout.closePosition = e.target.value; notifyChange(); });
            $('#tcLayOverlayClick')?.addEventListener('change', (e) => { cfg.layout.overlayClick = e.target.checked; cfg.rules.overlayClickCloses = e.target.checked; notifyChange(); });
            $('#tcCloseOn')?.addEventListener('change', (e) => { cfg.close.enabled = e.target.checked; notifyChange(); });
        }
        if (state.tab === 'schedule') {
            const toIso = (v) => v ? new Date(v).toISOString() : '';
            $('#tcPubAt')?.addEventListener('change', (e) => { item.publishAt = toIso(e.target.value); notifyChange(); });
            $('#tcExpAt')?.addEventListener('change', (e) => { item.expireAt = toIso(e.target.value); notifyChange(); });
            $('#tcMaintStart')?.addEventListener('change', (e) => { cfg.schedule.maintenanceStart = toIso(e.target.value); notifyChange(); });
            $('#tcMaintEnd')?.addEventListener('change', (e) => { cfg.schedule.maintenanceEnd = toIso(e.target.value); notifyChange(); });
            $('#tcMaintText')?.addEventListener('input', (e) => { cfg.schedule.expectedFinishText = e.target.value; notifyChange(); });
            bindValue('#tcTz', 'timezone');
        }
        if (state.tab === 'audience') {
            const aud = $('#tcAud'); if (aud) { aud.value = item.audience || 'all'; aud.onchange = (e) => { item.audience = e.target.value; cfg.targeting.audienceType = e.target.value; notifyChange(); }; }
            bindValue('#tcAudIds', 'audienceConfig');
            $('#tcPlat')?.addEventListener('change', (e) => { cfg.targeting.platform = e.target.value; notifyChange(); });
            $('#tcVerMin')?.addEventListener('input', (e) => { cfg.targeting.appVersionMin = e.target.value; notifyChange(); });
            $('#tcFirstLogin')?.addEventListener('change', (e) => { cfg.targeting.firstLogin = e.target.checked; notifyChange(); });
        }
        if (state.tab === 'rules') {
            const r = cfg.rules;
            const chk = (id, key) => $(id)?.addEventListener('change', (e) => { r[key] = e.target.checked; notifyChange(); });
            chk('#tcRuleOnce', 'showOnce'); chk('#tcRuleVersion', 'showOncePerVersion'); chk('#tcRuleBlock', 'blocking');
            chk('#tcRuleAck', 'requireAcknowledgement'); chk('#tcRuleLogin', 'showOnLogin'); chk('#tcRuleDash', 'showOnDashboard');
            $('#tcRuleHours')?.addEventListener('input', (e) => { r.showAgainAfterHours = Number(e.target.value) || 0; notifyChange(); });
            $('#tcRuleDelay')?.addEventListener('input', (e) => { r.delayBeforeClose = Number(e.target.value) || 0; notifyChange(); });
            $('#tcRuleMax')?.addEventListener('input', (e) => { r.maxImpressions = Number(e.target.value) || 0; notifyChange(); });
            $('#tcRuleQueue')?.addEventListener('input', (e) => { r.queuePriority = Number(e.target.value) || 0; notifyChange(); });
        }
        if (state.tab === 'cta') {
            const syncCtas = () => {
                const primary = cfg.ctas[0] || Cfg.cta('primary', 'รับทราบ', 'acknowledge');
                primary.text = $('#tcCta1Text')?.value || 'รับทราบ';
                primary.actionType = $('#tcCta1Act')?.value || 'acknowledge';
                primary.actionValue = $('#tcCta1Val')?.value || '';
                primary.icon = $('#tcCta1Icon')?.value || 'check';
                cfg.ctas = [primary];
                if ($('#tcCta2On')?.checked) {
                    const second = Cfg.cta('secondary', $('#tcCta2Text')?.value || 'ปิด', $('#tcCta2Act')?.value || 'close', $('#tcCta2Val')?.value || '');
                    second.icon = $('#tcCta2Icon')?.value || 'close';
                    cfg.ctas.push(second);
                }
                notifyChange();
            };
            ['#tcCta1Text', '#tcCta1Act', '#tcCta1Val', '#tcCta1Icon', '#tcCta2On', '#tcCta2Text', '#tcCta2Act', '#tcCta2Icon', '#tcCta2Val'].forEach((sel) => {
                $(sel)?.addEventListener('input', syncCtas);
                $(sel)?.addEventListener('change', syncCtas);
            });
        }
        if (state.tab === 'publish') {
            bindValue('#tcStatus', 'status');
            $('#tcImportant')?.addEventListener('change', (e) => { item.important = e.target.checked; notifyChange(); });
            $('#tcNotify')?.addEventListener('change', (e) => { item.showNotification = e.target.checked; notifyChange(); });
            $('#tcHome')?.addEventListener('change', (e) => { item.displayHome = e.target.checked; notifyChange(); });
            $('#tcPinned')?.addEventListener('change', (e) => { item.pinned = e.target.checked; notifyChange(); });
            const st = $('#tcStatus'); if (st) st.value = item.status || 'draft';
        }
    }

    function applySectionField(el) {
        const row = el.closest('[data-sec-id]');
        if (!row) return;
        const sec = current().popupConfig.sections.find((s) => s.id === row.dataset.secId);
        if (!sec) return;
        sec.content = sec.content || {};
        if (el.dataset.secField) {
            sec.content[el.dataset.secField] = el.value;
            notifyChange();
            return;
        }
        const wrap = el.closest('[data-item-idx]');
        if (!wrap || !el.dataset.itemField) return;
        const key = (sec.type === 'feature_grid' || sec.type === 'icon_stat_cards') ? 'cards' : 'items';
        const arr = Array.isArray(sec.content[key]) ? sec.content[key] : [];
        const idx = Number(wrap.dataset.itemIdx);
        if (!arr[idx] || typeof arr[idx] !== 'object') arr[idx] = { text: String(arr[idx] || '') };
        arr[idx][el.dataset.itemField] = el.value;
        sec.content[key] = arr;
        notifyChange();
    }

    function onSectionToggle(event) {
        const row = event.target.closest('[data-sec-id]');
        if (!row || !event.target.matches('[data-sec-enabled]')) return;
        const sec = current().popupConfig.sections.find((s) => s.id === row.dataset.secId);
        if (sec) { sec.enabled = event.target.checked; notifyChange(); renderForm(); }
    }

    function onSectionClick(event) {
        const row = event.target.closest('[data-sec-id]');
        if (!row) return;
        const secs = current().popupConfig.sections;
        const i = secs.findIndex((s) => s.id === row.dataset.secId);
        if (i < 0) return;
        const sec = secs[i];
        if (event.target.closest('[data-item-add]')) {
            sec.content = sec.content || {};
            if (sec.type === 'feature_grid' || sec.type === 'icon_stat_cards') {
                sec.content.cards = sec.content.cards || [];
                sec.content.cards.push({ icon: 'auto_awesome', title: 'หัวข้อ', body: 'คำอธิบาย' });
            } else if (sec.type === 'bullet_list') {
                sec.content.items = sec.content.items || [];
                sec.content.items.push({ icon: 'check', text: 'รายการ' });
            } else {
                sec.content.items = sec.content.items || [];
                sec.content.items.push({ icon: 'verified_user', title: 'หัวข้อการ์ด', body: 'คำอธิบาย', href: '' });
            }
        } else if (event.target.closest('[data-item-del]')) {
            const wrap = event.target.closest('[data-item-idx]');
            const idx = Number(wrap && wrap.dataset.itemIdx);
            const key = (sec.type === 'feature_grid' || sec.type === 'icon_stat_cards') ? 'cards' : 'items';
            if (Array.isArray(sec.content[key]) && idx >= 0) sec.content[key].splice(idx, 1);
        } else if (event.target.closest('[data-sec-up]') && i > 0) {
            [secs[i - 1], secs[i]] = [secs[i], secs[i - 1]];
        } else if (event.target.closest('[data-sec-down]') && i < secs.length - 1) {
            [secs[i + 1], secs[i]] = [secs[i], secs[i + 1]];
        } else if (event.target.closest('[data-sec-clone]')) {
            const copy = Cfg.clone(sec);
            copy.id = Cfg.uid(copy.type);
            secs.splice(i + 1, 0, copy);
        } else if (event.target.closest('[data-sec-del]')) {
            secs.splice(i, 1);
        } else return;
        secs.forEach((s, idx) => { s.sortOrder = idx; });
        renderForm();
        notifyChange();
    }

    function toast(msg) {
        if (typeof global.showCustomMsg === 'function') global.showCustomMsg('info', 'Popup Editor', msg);
        else if (typeof global.showToast === 'function') global.showToast('info', 'Popup Editor', msg);
    }

    function renderForm() {
        const panel = $('#tcPopedPanel');
        if (!panel) return;
        panel.innerHTML = tabHtml(state.tab);
        bindTab();
        document.querySelectorAll('[data-pop-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.popTab === state.tab));
        document.querySelectorAll('[data-pop-tpl]').forEach((btn) => btn.classList.toggle('active', btn.dataset.popTpl === current().popupConfig.template));
        preview();
        validate();
    }

    function payloadFromDraft(status) {
        const item = current();
        item.displayType = 'popup';
        item.showPopup = true;
        item.important = item.important !== false;
        const cfg = item.popupConfig;
        if (cfg.schedule && cfg.schedule.maintenanceStart && (cfg.sections || []).some((s) => s.type === 'maintenance_window')) {
            cfg.sections.forEach((s) => {
                if (s.type === 'maintenance_window') {
                    s.content.startAt = cfg.schedule.maintenanceStart;
                    s.content.endAt = cfg.schedule.maintenanceEnd;
                }
            });
        }
        return {
            title: item.title,
            message: item.message || item.title,
            summary: item.summary || cfg.subtitle || '',
            category: item.category || item.announcementType || 'notice',
            displayType: 'popup',
            announcementType: item.announcementType || cfg.template || 'notice',
            priority: Number(item.priority) || 50,
            locale: item.locale || 'th',
            popupConfig: cfg,
            important: !!item.important,
            showPopup: true,
            showNotification: item.showNotification !== false,
            displayHome: item.displayHome !== false,
            pinned: !!item.pinned,
            status: status || item.status || 'draft',
            audience: item.audience || 'all',
            audienceConfig: item.audienceConfig || '',
            publishAt: item.publishAt || null,
            expireAt: item.expireAt || null,
            timezone: item.timezone || 'Asia/Bangkok',
            ctaButtons: (cfg.ctas || []).map((c) => ({ label: c.text, url: c.actionValue, icon: c.icon, style: c.style }))
        };
    }

    async function save(status) {
        const payload = payloadFromDraft(status);
        const check = Cfg.validateAnnouncement(payload);
        if (!check.ok) {
            toast(check.errors[0].message);
            return;
        }
        const api = global.TcPopupEditor._api;
        if (typeof api !== 'function') {
            toast('ยังเชื่อม API ไม่ได้');
            return;
        }
        const id = current().id;
        const result = await api(id ? `/api/admin/announcements/${encodeURIComponent(id)}` : '/api/admin/announcements', {
            method: id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (result && result.announcement) {
            load(result.announcement);
            state.dirty = false;
        }
        toast(status === 'published' ? 'เผยแพร่ป๊อปอัปแล้ว' : 'บันทึกร่างแล้ว');
        if (typeof global.loadAnnouncementManagement === 'function') {
            try { await global.loadAnnouncementManagement(); } catch (_) {}
        }
        return result;
    }

    function shellHtml() {
        const item = current();
        const idLabel = item.id ? ('POP-' + String(item.id)) : 'POP-DRAFT';
        return `<div class="tc-poped">
            <div class="tc-poped-top">
                <div>
                    <div class="tc-poped-crumb">ประกาศ <span>›</span> แก้ไขป๊อปอัป</div>
                    <h2>Popup Announcement Editor</h2>
                    <p>ปรับแต่งขั้นสูง · ควบคุมทุกองค์ประกอบได้ 100% ภายใต้ระบบประกาศเดิม</p>
                </div>
                <div class="tc-poped-actions">
                    <span class="tc-poped-status"><i class="tc-poped-dot"></i> สถานะ: <b id="tcPopedStatusText">${esc(item.status || 'draft')}</b></span>
                    ${isAdminUi() ? '<button type="button" class="admin-btn tc-poped-test" id="tcPopTestLive">ทดสอบป๊อปอัปจริง</button>' : ''}
                    <button type="button" class="admin-btn admin-btn-ghost" id="tcPopSaveDraft">บันทึกร่าง</button>
                    <button type="button" class="admin-btn admin-btn-ghost" id="tcPopPreviewBtn">ดูตัวอย่าง</button>
                    <button type="button" class="admin-btn admin-btn-accent tc-poped-publish" id="tcPopPublish">เผยแพร่</button>
                </div>
            </div>
            <div class="tc-poped-templates">${renderTemplates()}</div>
            <div class="tc-poped-form">
                <div class="tc-poped-tabs">
                    ${['content','mascot','style','schedule','cta','audience','rules','publish'].map((t) => {
                        const labels = { content:'เนื้อหา', mascot:'มาสคอต', style:'สไตล์', schedule:'เวลา', cta:'ปุ่ม / Action', audience:'กลุ่มเป้าหมาย', rules:'การมองเห็น', publish:'เผยแพร่' };
                        return `<button type="button" data-pop-tab="${t}" class="${state.tab === t ? 'active' : ''}">${labels[t]}</button>`;
                    }).join('')}
                </div>
                <div class="tc-poped-panel" id="tcPopedPanel"></div>
                <div class="tc-poped-warn" id="tcPopedValidation"></div>
            </div>
            <aside class="tc-poped-preview">
                <div class="tc-poped-preview-bar">
                    <div>
                        <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm ${state.previewMode === 'desktop' ? 'active' : ''}" data-pop-mode="desktop">Desktop</button>
                        <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm ${state.previewMode === 'mobile' ? 'active' : ''}" data-pop-mode="mobile">Mobile</button>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <select id="tcPopZoom"><option>75</option><option selected>100</option><option>125</option></select>
                        <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="tcPopFull" title="เต็มจอ">⛶</button>
                    </div>
                </div>
                <div class="tc-poped-canvas">
                    <div class="tc-poped-ruler" aria-hidden="true"></div>
                    <div class="tc-poped-preview-stage" id="tcPopedPreviewStage"></div>
                </div>
                <div class="tc-poped-layers" id="tcPopedLayers"></div>
                <div class="tc-poped-warn" id="tcPopedPreviewWarn" style="padding:0 12px 10px"></div>
            </aside>
            <div class="tc-poped-foot">
                <span>Auto-save ในเครื่อง · <b id="tcPopedId">${esc(idLabel)}</b> · v1</span>
                <div class="tc-poped-actions">
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="tcPopHistory">ประวัติแก้ไข</button>
                    ${isAdminUi() ? '<button type="button" class="admin-btn admin-btn-ghost admin-btn-sm tc-poped-test" id="tcPopTestLive2">ทดสอบป๊อปอัปจริง</button>' : ''}
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="tcPopDup">ทำสำเนา</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="tcPopSaveDraft2">บันทึกร่าง</button>
                </div>
            </div>
        </div>`;
    }

    function bindShell(root) {
        root.querySelector('.tc-poped-tabs')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pop-tab]');
            if (!btn) return;
            state.tab = btn.dataset.popTab;
            renderForm();
        });
        root.querySelector('.tc-poped-templates')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pop-tpl]');
            if (btn) applyTemplate(btn.dataset.popTpl);
        });
        root.querySelectorAll('[data-pop-mode]').forEach((btn) => btn.addEventListener('click', () => {
            state.previewMode = btn.dataset.popMode;
            root.querySelectorAll('[data-pop-mode]').forEach((b) => b.classList.toggle('active', b === btn));
            preview();
        }));
        $('#tcPopZoom')?.addEventListener('change', (e) => { state.zoom = Number(e.target.value) || 100; preview(); });
        $('#tcPopPreviewBtn')?.addEventListener('click', () => { preview(); toast('อัปเดตตัวอย่างด้านขวาแล้ว'); });
        const testLive = () => {
            if (!isAdminUi()) return toast('ปุ่มนี้สำหรับแอดมินเท่านั้น');
            if (global.TcPopupRuntime && typeof global.TcPopupRuntime.previewLive === 'function') {
                global.TcPopupRuntime.previewLive(current());
                toast('แสดงป๊อปอัปจริงทับหน้าจอแล้ว — ปิดได้ด้วยปุ่มรับทราบหรือ X');
            } else {
                toast('ยังโหลดระบบป๊อปอัปไม่ครบ');
            }
        };
        $('#tcPopTestLive')?.addEventListener('click', testLive);
        $('#tcPopTestLive2')?.addEventListener('click', testLive);
        $('#tcPopFull')?.addEventListener('click', () => {
            const stage = $('#tcPopedPreviewStage');
            if (stage && stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
        });
        $('#tcPopSaveDraft')?.addEventListener('click', () => save('draft'));
        $('#tcPopSaveDraft2')?.addEventListener('click', () => save('draft'));
        $('#tcPopPublish')?.addEventListener('click', () => save('published'));
        $('#tcPopDup')?.addEventListener('click', () => {
            current().id = null;
            current().title = (current().title || '') + ' (Copy)';
            current().status = 'draft';
            notifyChange();
            toast('ทำสำเนาในตัวแก้ไขแล้ว — กดบันทึกเพื่อสร้างรายการใหม่');
        });
        $('#tcPopHistory')?.addEventListener('click', async () => {
            const id = current().id;
            if (!id) return toast('บันทึกก่อนจึงจะมีประวัติ');
            const api = global.TcPopupEditor._api;
            try {
                const data = await api(`/api/admin/announcements/${encodeURIComponent(id)}/revisions`);
                const list = (data.list || []).slice(0, 12).map((row) => `${row.createdAt || ''} · ${row.action || 'updated'} · ${row.changedBy || ''}`).join('\n') || 'ยังไม่มี revision';
                toast(list);
            } catch (err) {
                toast(err.message || 'โหลดประวัติไม่สำเร็จ');
            }
        });
    }

    function mount(host, announcement) {
        const el = typeof host === 'string' ? document.querySelector(host) : host;
        if (!el) return;
        load(announcement || emptyAnnouncement());
        el.innerHTML = shellHtml();
        bindShell(el);
        renderForm();
        if (global.TcPopupRuntime && typeof global.TcPopupRuntime.ensureAdminTestFab === 'function') {
            global.TcPopupRuntime.ensureAdminTestFab();
        }
    }

    function open(host, announcement) {
        const el = typeof host === 'string' ? document.querySelector(host) : host;
        if (!el) return;
        if (announcement) load(announcement);
        else if (!state.announcement) load(emptyAnnouncement());
        if (!el.querySelector('.tc-poped')) {
            el.innerHTML = shellHtml();
            bindShell(el);
        }
        renderForm();
    }

    function load(announcement) {
        const src = announcement ? Cfg.hydrateAnnouncement(announcement) : emptyAnnouncement();
        if (!src.popupConfig) src.popupConfig = Cfg.defaultPopupConfig(src.announcementType || 'feature');
        src.displayType = src.displayType || 'popup';
        src.showPopup = true;
        state.announcement = src;
        state.dirty = false;
    }

    global.TcPopupEditor = {
        mount,
        open,
        load,
        current,
        save,
        applyTemplate,
        preview,
        _api: null
    };
})(typeof window !== 'undefined' ? window : globalThis);
