/**
 * Admin Center — Reports workspace. Uses existing /api/admin/bug-reports.
 */
(function (global) {
    'use strict';

    const PAGE_KEY = 'tc_admin_report_page_size';
    const STATUS_LABEL = {
        pending: 'รอดำเนินการ',
        investigating: 'กำลังตรวจสอบ',
        resolved: 'แก้ไขแล้ว',
        closed: 'ปิดแล้ว'
    };
    const TYPE_LABEL = {
        bug: 'Bug',
        suggestion: 'ข้อเสนอแนะ',
        usability: 'การใช้งาน',
        other: 'อื่น ๆ'
    };
    const TYPE_EMOJI = { bug: '🐛', suggestion: '💡', usability: '❓', other: '⋯' };
    const PRI_LABEL = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };

    const state = {
        list: [],
        filtered: [],
        selected: new Set(),
        status: 'all',
        type: 'all',
        priority: 'all',
        query: '',
        sort: 'newest',
        page: 1,
        pageSize: Number(localStorage.getItem(PAGE_KEY) || 20) || 20,
        loading: false,
        error: '',
        detail: null,
        menu: null
    };
    let searchTimer = 0;

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function assetUrl(id) {
        if (!id) return '';
        if (typeof global.getCloudAssetUrl === 'function') return global.getCloudAssetUrl(id);
        return `/api/assets/${id}`;
    }
    function fmtDate(v) {
        if (!v) return '—';
        try {
            return new Date(v).toLocaleString('th-TH', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return String(v); }
    }
    function avatar(name) {
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'user')}&backgroundColor=bc13fe`;
    }
    function normalize(row) {
        const status = ({ open: 'pending', fixed: 'resolved' }[row.status] || row.status || 'pending');
        return { ...row, status };
    }
    function codeOf(row) {
        return row.reportCode || (`RPT-${String(row.id).padStart(4, '0')}`);
    }
    function titleOf(row) {
        return row.title || String(row.message || '').split(/[\n.]/)[0].slice(0, 80) || '—';
    }
    function authHeaders() {
        const token = localStorage.getItem('pandy_token');
        return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    }
    async function api(path, opts) {
        const res = await fetch(path, { ...opts, headers: { ...authHeaders(), ...(opts?.headers || {}) } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    function counts() {
        const list = state.list;
        return {
            all: list.length,
            pending: list.filter((r) => r.status === 'pending').length,
            investigating: list.filter((r) => r.status === 'investigating').length,
            resolved: list.filter((r) => r.status === 'resolved').length,
            closed: list.filter((r) => r.status === 'closed').length
        };
    }

    function applyFilter() {
        const q = state.query.trim().toLowerCase();
        let rows = state.list.slice();
        if (state.status !== 'all') rows = rows.filter((r) => r.status === state.status);
        if (state.type !== 'all') rows = rows.filter((r) => r.category === state.type);
        if (state.priority !== 'all') rows = rows.filter((r) => (r.priority || 'medium') === state.priority);
        if (q) {
            rows = rows.filter((r) => {
                const blob = [codeOf(r), r.username, r.displayName, r.message, r.title, r.id].join(' ').toLowerCase();
                return blob.includes(q);
            });
        }
        const priRank = { high: 3, medium: 2, low: 1 };
        const stRank = { pending: 4, investigating: 3, resolved: 2, closed: 1 };
        rows.sort((a, b) => {
            if (state.sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (state.sort === 'priority-high') return (priRank[b.priority] || 0) - (priRank[a.priority] || 0);
            if (state.sort === 'priority-low') return (priRank[a.priority] || 0) - (priRank[b.priority] || 0);
            if (state.sort === 'status') return (stRank[b.status] || 0) - (stRank[a.status] || 0);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        state.filtered = rows;
        const maxPage = Math.max(1, Math.ceil(rows.length / state.pageSize));
        if (state.page > maxPage) state.page = maxPage;
    }

    function pageRows() {
        const start = (state.page - 1) * state.pageSize;
        return state.filtered.slice(start, start + state.pageSize);
    }

    function typeBadge(cat) {
        const c = cat || 'bug';
        const ico = TYPE_EMOJI[c] || '🐛';
        return `<span class="adm2-badge adm2-badge-${esc(c)}">${ico} ${esc(TYPE_LABEL[c] || c)}</span>`;
    }
    function statusBadge(st) {
        const s = st || 'pending';
        return `<span class="adm2-st adm2-st-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
    }
    function priCell(p) {
        const v = p || 'medium';
        return `<span class="adm2-pri"><span class="adm2-dot adm2-dot-${esc(v)}"></span>${esc(PRI_LABEL[v] || v)}</span>`;
    }

    function renderKpis() {
        const c = counts();
        const root = document.getElementById('adm2RptKpis');
        if (!root) return;
        const items = [
            ['all', 'ทั้งหมด', c.all, 'purple'],
            ['pending', 'รอดำเนินการ', c.pending, 'red'],
            ['investigating', 'กำลังตรวจสอบ', c.investigating, 'yellow'],
            ['resolved', 'แก้ไขแล้ว', c.resolved, 'green'],
            ['closed', 'ปิดแล้ว', c.closed, 'blue']
        ];
        root.innerHTML = items.map(([id, label, n, tone]) =>
            `<button type="button" class="adm2-rpt-kpi${state.status === id || (id === 'all' && state.status === 'all') ? ' is-on' : ''}" data-tone="${tone}" data-kpi="${id}">
                <small>${esc(label)}</small><b>${n}</b>
            </button>`
        ).join('');
        root.querySelectorAll('[data-kpi]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.status = btn.dataset.kpi === 'all' ? 'all' : btn.dataset.kpi;
                state.page = 1;
                render();
            });
        });
    }

    function syncFilterUi() {
        const type = document.getElementById('adm2RptType');
        const pri = document.getElementById('adm2RptPri');
        const sort = document.getElementById('adm2RptSort');
        if (type) type.value = state.type;
        if (pri) pri.value = state.priority;
        if (sort) sort.value = state.sort;
        const box = document.getElementById('adm2RptChips');
        if (!box) return;
        const chips = [];
        if (state.status !== 'all') chips.push(['status', STATUS_LABEL[state.status]]);
        if (state.query) chips.push(['query', `ค้นหา: ${state.query}`]);
        box.innerHTML = chips.map(([k, label]) =>
            `<button type="button" class="adm2-rpt-chip" data-clear="${k}">${esc(label)} ×</button>`
        ).join('') + (chips.length ? '<button type="button" class="adm2-rpt-chip" data-clear="all">ล้างตัวกรอง</button>' : '');
        box.querySelectorAll('[data-clear]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.clear;
                if (k === 'all' || k === 'status') state.status = 'all';
                if (k === 'all' || k === 'query') {
                    state.query = '';
                    const inp = document.getElementById('adm2RptSearch');
                    if (inp) inp.value = '';
                }
                state.page = 1;
                render();
            });
        });
    }

    function renderTable() {
        const wrap = document.getElementById('adm2RptTableWrap');
        if (!wrap) return;
        if (state.loading) {
            wrap.innerHTML = `<div style="padding:18px;display:grid;gap:8px">${'<div class="adm2-skel"></div>'.repeat(8)}</div>`;
            return;
        }
        if (state.error) {
            wrap.innerHTML = `<div class="adm2-empty"><b>⚠ ไม่สามารถโหลดรายงานได้</b><small>${esc(state.error)}</small><button type="button" class="admin-btn admin-btn-ghost" id="adm2RptRetry">ลองใหม่</button></div>`;
            wrap.querySelector('#adm2RptRetry')?.addEventListener('click', reload);
            return;
        }
        applyFilter();
        const rows = pageRows();
        if (!rows.length) {
            const filtered = state.list.length && (state.query || state.status !== 'all' || state.type !== 'all' || state.priority !== 'all');
            wrap.innerHTML = `<div class="adm2-empty"><b>${filtered ? 'ไม่พบรายงานที่ตรงกับเงื่อนไข' : 'ยังไม่มีรายงาน'}</b><small>${filtered ? 'ลองเปลี่ยนตัวกรองหรือคำค้นหา' : 'เมื่อผู้ใช้ส่งรายงาน รายการจะแสดงที่นี่'}</small>${filtered ? '<button type="button" class="admin-btn admin-btn-ghost" id="adm2RptClear">ล้างตัวกรอง</button>' : ''}</div>`;
            wrap.querySelector('#adm2RptClear')?.addEventListener('click', () => {
                state.status = 'all'; state.type = 'all'; state.priority = 'all'; state.query = '';
                const inp = document.getElementById('adm2RptSearch');
                if (inp) inp.value = '';
                render();
            });
            return;
        }
        wrap.innerHTML = `<table class="adm2-rpt-table" aria-label="รายการรายงาน">
            <thead><tr>
                <th class="adm2-col-check"><input type="checkbox" id="adm2RptCheckAll" aria-label="เลือกทั้งหมด"></th>
                <th class="adm2-col-id">ID</th>
                <th class="adm2-col-user">ผู้รายงาน</th>
                <th class="adm2-col-type">ประเภท</th>
                <th class="adm2-col-title">หัวข้อ / รายละเอียด</th>
                <th class="adm2-col-pri">ความสำคัญ</th>
                <th class="adm2-col-st">สถานะ</th>
                <th class="adm2-col-date">วันที่รายงาน</th>
                <th class="adm2-col-act">จัดการ</th>
            </tr></thead>
            <tbody>${rows.map((r) => {
                const uid = String(r.id);
                const name = r.displayName || r.username || 'ผู้ใช้';
                return `<tr data-id="${esc(uid)}" class="${state.detail && String(state.detail.id) === uid ? 'is-open' : ''}">
                    <td class="adm2-col-check"><input type="checkbox" class="adm2-rpt-cb" data-id="${esc(uid)}" ${state.selected.has(uid) ? 'checked' : ''}></td>
                    <td class="adm2-col-id"><button type="button" class="adm2-rpt-id" data-open="${esc(uid)}" title="#${esc(codeOf(r))}">#${esc(codeOf(r))}</button></td>
                    <td class="adm2-col-user"><div class="adm2-rpt-user"><img src="${esc(avatar(name))}" alt=""><div class="adm2-rpt-user-txt"><b title="${esc(name)}">${esc(name)}</b><small title="@${esc(r.username || '')}">@${esc(r.username || '')}</small></div></div></td>
                    <td class="adm2-col-type">${typeBadge(r.category)}</td>
                    <td class="adm2-col-title"><span class="adm2-rpt-title" title="${esc(titleOf(r))}">${esc(titleOf(r))}</span></td>
                    <td class="adm2-col-pri">${priCell(r.priority)}</td>
                    <td class="adm2-col-st">
                        <select class="adm2-st-select adm2-st-${esc(r.status || 'pending')}" data-status-id="${esc(uid)}" aria-label="เปลี่ยนสถานะ">
                            ${Object.keys(STATUS_LABEL).map((s) => `<option value="${esc(s)}" ${r.status === s ? 'selected' : ''}>${esc(STATUS_LABEL[s])}</option>`).join('')}
                        </select>
                    </td>
                    <td class="adm2-col-date">${esc(fmtDate(r.createdAt))}</td>
                    <td class="adm2-col-act"><div class="adm2-rpt-actions">
                        <button type="button" class="adm2-icon-btn" data-open="${esc(uid)}" title="ดู" aria-label="ดู">👁</button>
                        <button type="button" class="adm2-icon-btn" data-more="${esc(uid)}" title="เพิ่มเติม" aria-label="เพิ่มเติม">⋮</button>
                    </div></td>
                </tr>`;
            }).join('')}</tbody></table>`;
        wrap.querySelector('#adm2RptCheckAll')?.addEventListener('change', (e) => {
            pageRows().forEach((r) => {
                if (e.target.checked) state.selected.add(String(r.id));
                else state.selected.delete(String(r.id));
            });
            render();
        });
        wrap.querySelectorAll('.adm2-rpt-cb').forEach((cb) => {
            cb.addEventListener('change', () => {
                if (cb.checked) state.selected.add(cb.dataset.id);
                else state.selected.delete(cb.dataset.id);
                renderBulk();
            });
        });
        wrap.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDetail(btn.dataset.open);
        }));
        wrap.querySelectorAll('[data-more]').forEach((btn) => btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e, btn.dataset.more);
        }));
        wrap.querySelectorAll('select[data-status-id]').forEach((sel) => {
            sel.addEventListener('change', () => patch(sel.getAttribute('data-status-id'), { status: sel.value }));
        });
    }

    function renderPager() {
        const el = document.getElementById('adm2RptPager');
        if (!el) return;
        const total = state.filtered.length;
        const start = total ? (state.page - 1) * state.pageSize + 1 : 0;
        const end = Math.min(total, state.page * state.pageSize);
        const pages = Math.max(1, Math.ceil(total / state.pageSize));
        el.innerHTML = `<span>แสดง ${start}–${end} จาก ${total} รายการ</span>
            <div class="adm2-rpt-pager">
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-pg="-1" ${state.page <= 1 ? 'disabled' : ''}>‹</button>
                <span>${state.page}</span>
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-pg="1" ${state.page >= pages ? 'disabled' : ''}>›</button>
                <select class="adm2-select" id="adm2RptPageSize" aria-label="จำนวนต่อหน้า">
                    ${[20, 50, 100].map((n) => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n} / หน้า</option>`).join('')}
                </select>
            </div>`;
        el.querySelectorAll('[data-pg]').forEach((btn) => btn.addEventListener('click', () => {
            state.page += Number(btn.dataset.pg);
            render();
        }));
        el.querySelector('#adm2RptPageSize')?.addEventListener('change', (e) => {
            state.pageSize = Number(e.target.value) || 20;
            localStorage.setItem(PAGE_KEY, String(state.pageSize));
            state.page = 1;
            render();
        });
    }

    function renderBulk() {
        const bar = document.getElementById('adm2RptBulk');
        if (!bar) return;
        const n = state.selected.size;
        bar.classList.toggle('show', n > 0);
        const count = bar.querySelector('[data-count]');
        if (count) count.textContent = `เลือก ${n} รายการ`;
    }

    function hideMenu() {
        if (state.menuDocHandler) {
            document.removeEventListener('pointerdown', state.menuDocHandler, true);
            state.menuDocHandler = null;
        }
        state.menu?.remove();
        state.menu = null;
    }

    function openMenu(ev, id) {
        ev.preventDefault();
        ev.stopPropagation();
        hideMenu();
        const menu = document.createElement('div');
        menu.className = 'adm2-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `
            <button type="button" data-act="pending">เปลี่ยนเป็นรอดำเนินการ</button>
            <button type="button" data-act="investigating">กำลังตรวจสอบ</button>
            <button type="button" data-act="resolved">แก้ไขแล้ว</button>
            <button type="button" data-act="closed">ปิดแล้ว</button>
            <button type="button" data-act="pri-high">Priority สูง</button>
            <button type="button" data-act="pri-medium">Priority กลาง</button>
            <button type="button" data-act="pri-low">Priority ต่ำ</button>
            <button type="button" data-act="assign">มอบหมายให้ฉัน</button>
            <button type="button" data-act="note">เพิ่มหมายเหตุ</button>
            <button type="button" data-act="delete">ลบรายงาน</button>`;
        document.body.appendChild(menu);
        const r = ev.currentTarget.getBoundingClientRect();
        menu.style.top = `${r.bottom + 4}px`;
        menu.style.left = `${Math.max(8, r.right - 200)}px`;
        const rect = menu.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8) {
            menu.style.top = `${Math.max(8, r.top - rect.height - 4)}px`;
        }
        if (rect.right > window.innerWidth - 8) {
            menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
        }
        state.menu = menu;
        const run = (act) => {
            hideMenu();
            if (act === 'delete') return deleteReport(id);
            if (act === 'note') return addNote(id);
            if (act === 'assign') return patch(id, { assignedTo: global.currentUser?.id, assignedName: global.currentUser?.username || global.currentUser?.name });
            if (String(act).startsWith('pri-')) return patch(id, { priority: String(act).slice(4) });
            return patch(id, { status: act });
        };
        menu.addEventListener('pointerdown', (e) => e.stopPropagation());
        menu.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                run(btn.getAttribute('data-act'));
            });
        });
        state.menuDocHandler = (e) => {
            if (state.menu && !state.menu.contains(e.target)) hideMenu();
        };
        setTimeout(() => document.addEventListener('pointerdown', state.menuDocHandler, true), 0);
    }

    async function patch(id, body) {
        try {
            const data = await api(`/api/admin/bug-reports/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            if (data.report) {
                const idx = state.list.findIndex((r) => String(r.id) === String(id));
                if (idx >= 0) state.list[idx] = normalize(data.report);
                if (state.detail && String(state.detail.id) === String(id)) state.detail = normalize(data.report);
            }
            render();
            if (state.detail) renderDrawer();
        } catch (err) {
            if (typeof global.showCustomMsg === 'function') global.showCustomMsg('error', 'อัปเดตไม่สำเร็จ', err.message);
        }
    }

    async function addNote(id) {
        const text = typeof global.tcPrompt === 'function'
            ? await global.tcPrompt('หมายเหตุสำหรับทีมงาน', { placeholder: 'เช่น ตรวจสอบ token แล้ว...' })
            : global.prompt('หมายเหตุสำหรับทีมงาน');
        if (!text || !String(text).trim()) return;
        await patch(id, { note: String(text).trim() });
    }

    async function deleteReport(id) {
        const ok = typeof global.tcConfirm === 'function'
            ? await global.tcConfirm('ลบรายงานนี้หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้')
            : global.confirm('ลบรายงานนี้หรือไม่?');
        if (!ok) return;
        try {
            await api(`/api/admin/bug-reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
            state.list = state.list.filter((r) => String(r.id) !== String(id));
            state.selected.delete(String(id));
            if (state.detail && String(state.detail.id) === String(id)) closeDetail();
            render();
        } catch (err) {
            if (typeof global.showCustomMsg === 'function') global.showCustomMsg('error', 'ลบไม่สำเร็จ', err.message);
        }
    }

    function openDetail(id) {
        state.detail = state.list.find((r) => String(r.id) === String(id)) || null;
        if (state.detail && !Array.isArray(state.detail.activity)) {
            const created = { at: state.detail.createdAt, type: 'created', actorName: state.detail.displayName || state.detail.username, message: 'ผู้ใช้ส่งรายงาน' };
            state.detail.activity = [created];
        }
        renderDrawer();
    }
    function closeDetail() {
        state.detail = null;
        const mask = document.getElementById('adm2RptMask');
        const drawer = document.getElementById('adm2RptDrawer');
        mask?.classList.remove('show');
        drawer?.classList.remove('show');
        if (mask) mask.setAttribute('aria-hidden', 'true');
        if (drawer) drawer.setAttribute('aria-hidden', 'true');
    }

    function renderDrawer() {
        const mask = document.getElementById('adm2RptMask');
        const drawer = document.getElementById('adm2RptDrawer');
        if (!mask || !drawer || !state.detail) {
            closeDetail();
            return;
        }
        const r = state.detail;
        const atts = Array.isArray(r.attachments) ? r.attachments : (r.screenshotAssetId ? [{ assetId: r.screenshotAssetId }] : []);
        const info = r.systemInfo || {};
        const notes = (r.activity || []).filter((a) => a.type === 'note');
        const activity = r.activity && r.activity.length ? r.activity : [{ at: r.createdAt, message: 'ผู้ใช้ส่งรายงาน', actorName: r.username }];
        drawer.innerHTML = `
            <div class="adm2-drawer-head">
                <div>
                    <b>#${esc(codeOf(r))}</b>
                    <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${typeBadge(r.category)}${priCell(r.priority)}${statusBadge(r.status)}</div>
                </div>
                <button type="button" class="adm2-icon-btn" id="adm2RptDrawerClose" aria-label="ปิด">✕</button>
            </div>
            <div class="adm2-drawer-body">
                <div class="adm2-rpt-user"><img src="${esc(avatar(r.displayName || r.username))}" alt=""><div><b>${esc(r.displayName || r.username)}</b><small>@${esc(r.username || '')} · ${esc(fmtDate(r.createdAt))}</small></div></div>
                <h4>ปัญหา</h4>
                <b>${esc(titleOf(r))}</b>
                <p style="white-space:pre-wrap;color:#cfc9dc;font-size:.82rem;margin:8px 0 0">${esc(r.message || '')}</p>
                ${r.location ? `<p class="adm2-muted">ส่วนที่เกิดปัญหา: ${esc(r.location)}</p>` : ''}
                ${r.frequency ? `<p class="adm2-muted">ความถี่: ${esc(r.frequency)}</p>` : ''}
                <h4>ไฟล์แนบ</h4>
                <div class="adm2-att">${atts.length ? atts.map((a) => {
                    const url = assetUrl(a.assetId);
                    const isVid = String(a.mime || '').startsWith('video/');
                    return `<a href="${esc(url)}" target="_blank" rel="noopener">${isVid ? `<video src="${esc(url)}"></video>` : `<img src="${esc(url)}" alt="${esc(a.name || '')}">`}</a>`;
                }).join('') : '<span class="adm2-muted">ไม่มีไฟล์แนบ</span>'}</div>
                <h4>ข้อมูลระบบ</h4>
                <div class="adm2-info-grid adm2-info-grid-open">
                    <div>เวอร์ชันแอป<b>${esc(info.appVersion || r.appVersion || '—')}</b></div>
                    <div>ระบบปฏิบัติการ<b>${esc(info.os || '—')}</b></div>
                    <div>อุปกรณ์<b>${esc(info.runtime || '—')}</b></div>
                    <div>ความละเอียด<b>${esc(info.screen || '—')}</b></div>
                    <div>หน้า<b>${esc(info.route || r.location || '—')}</b></div>
                    <div>เวลา<b>${esc(fmtDate(info.timestamp || r.createdAt))}</b></div>
                </div>
                <h4>ผู้รับผิดชอบ</h4>
                <p>${r.assignedName ? esc(r.assignedName) : '<span class="adm2-muted">ยังไม่ได้มอบหมาย</span>'}</p>
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2AssignMe">มอบหมายให้ฉัน</button>
                <h4>หมายเหตุสำหรับทีมงาน</h4>
                <div class="adm2-note-list">${notes.length ? notes.map((n) => `<div class="adm2-note"><b>${esc(n.actorName || 'Admin')}</b> · ${esc(fmtDate(n.at))}<div>${esc(n.message || '')}</div></div>`).join('') : '<span class="adm2-muted">ยังไม่มีหมายเหตุ</span>'}</div>
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2AddNote" style="margin-top:8px">เพิ่มหมายเหตุ</button>
                <h4>ไทม์ไลน์</h4>
                <ul class="adm2-timeline">${activity.map((a) => `<li><b>${esc(fmtDate(a.at))}</b><div>${esc(a.actorName || '')} — ${esc(a.message || a.type || '')}</div></li>`).join('')}</ul>
                <h4>เปลี่ยนสถานะ</h4>
                <label class="adm2-rpt-field" style="min-width:0">
                    <select class="adm2-st-select adm2-st-${esc(r.status || 'pending')}" id="adm2DrawerStatus">
                        ${Object.keys(STATUS_LABEL).map((s) => `<option value="${esc(s)}" ${r.status === s ? 'selected' : ''}>${esc(STATUS_LABEL[s])}</option>`).join('')}
                    </select>
                </label>
            </div>`;
        mask.classList.add('show');
        drawer.classList.add('show');
        mask.setAttribute('aria-hidden', 'false');
        drawer.setAttribute('aria-hidden', 'false');
        drawer.querySelector('#adm2RptDrawerClose')?.addEventListener('click', closeDetail);
        drawer.querySelector('#adm2AssignMe')?.addEventListener('click', () => patch(r.id, { assignedTo: global.currentUser?.id, assignedName: global.currentUser?.username || global.currentUser?.name }));
        drawer.querySelector('#adm2AddNote')?.addEventListener('click', () => addNote(r.id));
        drawer.querySelector('#adm2DrawerStatus')?.addEventListener('change', (e) => {
            patch(r.id, { status: e.target.value });
        });
        mask.onclick = closeDetail;
    }

    function exportCsv() {
        applyFilter();
        const rows = state.filtered;
        const header = ['Report ID', 'User', 'Display Name', 'Type', 'Title', 'Description', 'Priority', 'Status', 'Assigned', 'Created At', 'Updated At'];
        const lines = [header.join(',')].concat(rows.map((r) => [
            codeOf(r), r.username, r.displayName, r.category, titleOf(r), r.message, r.priority, r.status, r.assignedName, r.createdAt, r.updatedAt
        ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tokcontrol-reports-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function render() {
        applyFilter();
        renderKpis();
        syncFilterUi();
        renderTable();
        renderPager();
        renderBulk();
        if (global.AdminCenterV2?.state) global.AdminCenterV2.state.latestReports = state.list;
    }

    async function reload() {
        state.loading = true;
        state.error = '';
        renderTable();
        try {
            const data = await api('/api/admin/bug-reports');
            state.list = (data.list || []).map(normalize);
            state.loading = false;
            render();
        } catch (err) {
            state.loading = false;
            state.error = err.message || 'โหลดไม่สำเร็จ';
            render();
        }
    }

    async function bulkStatus() {
        const st = typeof global.tcPrompt === 'function'
            ? await global.tcPrompt('สถานะใหม่ (pending / investigating / resolved / closed)', { value: 'investigating' })
            : global.prompt('สถานะใหม่', 'investigating');
        if (!st) return;
        const ok = typeof global.tcConfirm === 'function'
            ? await global.tcConfirm(`เปลี่ยนสถานะ ${state.selected.size} รายการ เป็น ${st}?`)
            : global.confirm('ยืนยันเปลี่ยนสถานะรายการที่เลือก?');
        if (!ok) return;
        for (const id of [...state.selected]) await patch(id, { status: st });
        state.selected.clear();
        render();
    }

    function mount() {
        const sec = document.getElementById('adminSec-reports');
        if (!sec) return;
        if (sec.dataset.adm2RptReady === '4') {
            reload();
            return;
        }
        sec.dataset.adm2RptReady = '4';
        sec.classList.add('adm2-rpt-sec');
        sec.innerHTML = `
            <div class="adm2-rpt-kpis" id="adm2RptKpis"></div>
            <div class="adm2-rpt-tools">
                <input class="adm2-search" id="adm2RptSearch" type="search" placeholder="ค้นหา Report: รายละเอียด, ชื่อผู้ใช้ หรือ ID..." aria-label="ค้นหารายงาน">
                <div class="adm2-rpt-frow" id="adm2RptFilterRow">
                    <label class="adm2-rpt-field">ประเภท
                        <select class="adm2-rpt-select" id="adm2RptType">
                            <option value="all">ทั้งหมด</option>
                            <option value="bug">🐛 Bug</option>
                            <option value="suggestion">💡 ข้อเสนอแนะ</option>
                            <option value="usability">❓ การใช้งาน</option>
                            <option value="other">⋯ อื่น ๆ</option>
                        </select>
                    </label>
                    <label class="adm2-rpt-field">ความสำคัญ
                        <select class="adm2-rpt-select" id="adm2RptPri">
                            <option value="all">ทั้งหมด</option>
                            <option value="high">สูง</option>
                            <option value="medium">กลาง</option>
                            <option value="low">ต่ำ</option>
                        </select>
                    </label>
                    <label class="adm2-rpt-field">เรียง
                        <select class="adm2-rpt-select" id="adm2RptSort">
                            <option value="newest">ใหม่สุด</option>
                            <option value="oldest">เก่าสุด</option>
                            <option value="priority-high">Priority สูงสุด</option>
                            <option value="priority-low">Priority ต่ำสุด</option>
                            <option value="status">สถานะ</option>
                        </select>
                    </label>
                    <button type="button" class="adm2-rpt-fbtn" id="adm2RptExport">ส่งออกข้อมูล</button>
                    <button type="button" class="adm2-rpt-fbtn" id="adm2RptRefresh">รีเฟรช</button>
                </div>
            </div>
            <div class="adm2-rpt-chips" id="adm2RptChips"></div>
            <div class="adm2-rpt-table-wrap" id="adm2RptTableWrap"></div>
            <div class="adm2-rpt-foot" id="adm2RptPager"></div>
            <div class="adm2-rpt-bulk" id="adm2RptBulk"><span data-count>เลือก 0 รายการ</span>
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2BulkStatus">เปลี่ยนสถานะ</button>
                <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2BulkExport">ส่งออก</button>
            </div>
            <div class="adm2-drawer-mask" id="adm2RptMask" aria-hidden="true"></div>
            <aside class="adm2-drawer" id="adm2RptDrawer" role="dialog" aria-label="รายละเอียดรายงาน" aria-hidden="true"></aside>`;

        const search = document.getElementById('adm2RptSearch');
        search?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.query = search.value;
                state.page = 1;
                render();
            }, 220);
        });
        document.getElementById('adm2RptType')?.addEventListener('change', (e) => {
            state.type = e.target.value;
            state.page = 1;
            render();
        });
        document.getElementById('adm2RptPri')?.addEventListener('change', (e) => {
            state.priority = e.target.value;
            state.page = 1;
            render();
        });
        document.getElementById('adm2RptSort')?.addEventListener('change', (e) => {
            state.sort = e.target.value;
            render();
        });
        document.getElementById('adm2RptExport')?.addEventListener('click', exportCsv);
        document.getElementById('adm2RptRefresh')?.addEventListener('click', reload);
        document.getElementById('adm2BulkStatus')?.addEventListener('click', bulkStatus);
        document.getElementById('adm2BulkExport')?.addEventListener('click', exportCsv);
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (state.menu) { hideMenu(); return; }
            if (state.detail) closeDetail();
        });
        reload();
    }

    global.AdminReports = { mount, reload, state };
    global.loadAdminBugReports = reload;
    global.resolveBugReport = (id) => patch(id, { status: 'resolved' });
    global.reopenBugReport = (id) => patch(id, { status: 'pending' });
    global.mountAdminReports = mount;
})(window);
