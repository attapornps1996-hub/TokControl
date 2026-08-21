(function adminCenterV2Bootstrap(global) {
    'use strict';

    const OLD_TABS = new Set(['overview', 'members', 'promo', 'payments', 'announce', 'gifts', 'reports']);
    const TAB_META = {
        overview: ['Dashboard', 'ภาพรวมระบบ', 'สถานะสมาชิก รายรับ ระบบ และกิจกรรมล่าสุด'],
        members: ['Members', 'จัดการสมาชิก', 'ค้นหา ตรวจสอบสิทธิ์ และจัดการสมาชิก'],
        promo: ['Promo Codes', 'โค้ดรางวัล', 'สร้างและตรวจสอบโค้ด PRO เหรียญ และเกม'],
        payments: ['Payments', 'การชำระเงิน', 'ตรวจสอบออเดอร์ สลิป และสถานะการมอบสิทธิ์'],
        announce: ['Announcements', 'ศูนย์จัดการประกาศ', 'สร้าง เผยแพร่ และวิเคราะห์ประกาศ'],
        gifts: ['Gift Inventory', 'คลังของขวัญ', 'ตรวจสอบของขวัญที่ระบบบันทึกจาก TikTok LIVE'],
        reports: ['Reports', 'จัดการรายงาน', 'ตรวจสอบและจัดการรายงานปัญหาจากผู้ใช้'],
        achievements: ['Achievements', 'จัดการความสำเร็จ', 'สร้างเงื่อนไข ไอคอน และติดตามการปลดล็อก'],
        features: ['Management', 'Features & Systems', 'สถานะฟีเจอร์และระบบที่ติดตั้งใน TokControl'],
        settings: ['Management', 'ตั้งค่า Admin Center', 'การแสดงผล การเชื่อมต่อ และความปลอดภัย'],
        activity: ['Management', 'Activity Logs', 'กิจกรรมผู้ดูแลในเซสชันและ Audit API'],
        api: ['Management', 'API & Webhook', 'ตรวจสอบ endpoint และสถานะการเชื่อมต่อ'],
        help: ['Support', 'Help Center', 'คู่มือการใช้งานและช่องทางช่วยเหลือ']
    };

    const state = {
        initialized: false,
        activeTab: 'overview',
        memberPage: 1,
        memberPageSize: 20,
        paymentFilter: 'all',
        paymentQuery: '',
        reportQuery: '',
        announcementTab: 'create',
        announcementMode: 'desktop',
        ctas: [],
        mediaDataUrl: '',
        mediaAssetId: '',
        mediaName: '',
        emojiCategory: 'recent',
        emojiSearch: '',
        sessionActivity: [],
        latestOverview: null,
        latestPayments: [],
        latestReports: [],
        latestAnnouncements: [],
        editingAnnouncementId: null,
        achievements: [],
        editingAchievementId: null,
        selectedAchievementIcon: 'workspace_premium',
        achievementUnlocks: [],
        achievementUnlockTarget: null
    };

    const EMOJI = {
        recent: [],
        favorites: ['🎉', '🔥', '💜', '✨', '🚀', '🎁', '⚠️', '✅'],
        smileys: ['😀','😃','😄','😁','😆','😅','😂','😊','😍','🥰','😘','😎','🤩','🥳','😢','😭','😡','🤔','🫡','🫶'],
        people: ['👋','👏','🙌','👍','👎','💪','🙏','🤝','👑','🧑‍💻','👨‍💻','👩‍💻','🧙','🦸','🕺','💃'],
        animals: ['🐼','🐻','🦊','🐱','🐶','🐰','🐯','🦁','🐸','🐵','🦄','🐲','🦋','🐝','🐳','🐬'],
        food: ['🍕','🍔','🍟','🌮','🍣','🍜','🍰','🍩','🍪','🍫','🍓','🍉','🥤','☕','🍻','🎂'],
        activities: ['⚽','🏀','🎮','🎯','🎲','🎸','🎤','🎧','🏆','🥇','🎨','🎬','🎪','🎉','🎊','🎁'],
        objects: ['💡','📱','💻','⌨️','🖥️','📷','🎥','🔔','📢','💎','🪙','🔒','🔑','🛠️','⚙️','🚀'],
        symbols: ['💜','❤️','💙','💚','💛','🧡','✨','🔥','⚡','✅','❌','⚠️','❗','❓','♻️','🔴'],
        flags: ['🇹🇭','🇺🇸','🇬🇧','🇯🇵','🇰🇷','🇨🇳','🇸🇬','🇵🇭','🇮🇩','🇲🇾','🇻🇳','🇦🇺','🇨🇦','🇩🇪','🇫🇷','🇧🇷']
    };

    const STICKERS = ['🎉','🚀','🔥','💜','👑','🎁','🥳','🤩','⚡','✅','⚠️','📢','🎮','🏆','💎','🪙'];
    const ALLOWED_TAGS = new Set(['P','BR','STRONG','B','EM','I','U','S','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','A','IMG','DIV','SPAN']);

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function authHeaders(extra) {
        const token = localStorage.getItem('pandy_token');
        return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    }

    async function api(path, options) {
        const opts = { ...(options || {}) };
        opts.headers = authHeaders(opts.headers);
        const res = await fetch(path, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    function icon(name) {
        return `<span class="material-symbols-outlined" aria-hidden="true">${esc(name)}</span>`;
    }

    function showToast(type, title, message) {
        if (typeof global.showCustomMsg === 'function') global.showCustomMsg(type, title, message || '');
    }

    async function confirmAction(message, options) {
        if (typeof global.tcConfirm === 'function') return global.tcConfirm(message, options || {});
        return global.confirm(message);
    }

    function recordActivity(action, target, status) {
        state.sessionActivity.unshift({
            action,
            target: target || 'Admin Center',
            status: status || 'success',
            at: new Date()
        });
        state.sessionActivity = state.sessionActivity.slice(0, 50);
        if (state.activeTab === 'activity') renderActivity();
        renderOverviewActivity();
    }

    function statCard(id, label, iconName, tone) {
        return `<div class="adm2-stat-card" data-tone="${esc(tone || '')}">
            <div class="adm2-stat-icon">${icon(iconName)}</div>
            <div><div class="adm2-stat-value" id="${esc(id)}">—</div><div class="adm2-stat-label">${esc(label)}</div></div>
            <div class="adm2-stat-trend">ข้อมูลล่าสุดจากระบบ</div>
        </div>`;
    }

    function statusBadge(status, label) {
        return `<span class="adm2-status" data-status="${esc(status || '')}">${esc(label || status || 'unknown')}</span>`;
    }

    function emptyState(title, description, actionHtml) {
        return `<div class="adm2-empty">${icon('inbox')}<b>${esc(title)}</b><small>${esc(description || '')}</small>${actionHtml || ''}</div>`;
    }

    function errorState(title, description, retry) {
        return `<div class="adm2-error">${icon('error')}<b>${esc(title)}</b><small>${esc(description || '')}</small>${retry ? `<button type="button" class="admin-btn admin-btn-ghost" onclick="${esc(retry)}">ลองอีกครั้ง</button>` : ''}</div>`;
    }

    function addStylesheet() {
        if (document.querySelector('link[href="/styles/admin-center-v2.css"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/styles/admin-center-v2.css';
        document.head.appendChild(link);
    }

    function enhanceSidebar() {
        const root = document.getElementById('adminView');
        const nav = root?.querySelector('.adm-sidebar-nav');
        const brand = root?.querySelector('.adm-sidebar-brand');
        if (!root || !nav || nav.dataset.adm2Ready) return;
        nav.dataset.adm2Ready = '1';

        const mainLabel = document.createElement('div');
        mainLabel.className = 'adm2-nav-group';
        mainLabel.textContent = 'Main';
        nav.insertBefore(mainLabel, nav.firstChild);

        const managementLabel = document.createElement('div');
        managementLabel.className = 'adm2-nav-group';
        managementLabel.textContent = 'Management';
        nav.appendChild(managementLabel);

        [
            ['achievements', 'military_tech', 'Achievements'],
            ['features', 'widgets', 'Features & Systems'],
            ['settings', 'settings', 'Settings'],
            ['activity', 'history', 'Activity Logs'],
            ['api', 'api', 'API & Webhook'],
            ['help', 'help', 'Help Center']
        ].forEach(([id, ico, label]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'adm-nav-btn';
            btn.id = `adminTab-${id}`;
            btn.title = label;
            btn.setAttribute('aria-label', label);
            btn.innerHTML = `<span class="adm-nav-ico material-symbols-outlined" aria-hidden="true">${ico}</span><span>${esc(label)}</span>`;
            btn.addEventListener('click', () => global.switchAdminTab(id));
            nav.appendChild(btn);
        });

        nav.querySelectorAll('.adm-nav-btn').forEach((btn) => {
            const text = btn.textContent.trim();
            if (!btn.title) btn.title = text;
            btn.setAttribute('aria-label', text);
        });

        if (brand && !brand.querySelector('.adm2-collapse')) {
            const collapse = document.createElement('button');
            collapse.type = 'button';
            collapse.className = 'adm2-collapse';
            collapse.title = 'พับ/ขยายเมนู Admin';
            collapse.setAttribute('aria-label', 'พับหรือขยายเมนู Admin');
            collapse.innerHTML = icon('left_panel_close');
            collapse.addEventListener('click', () => {
                root.classList.toggle('adm2-collapsed');
                const collapsed = root.classList.contains('adm2-collapsed');
                localStorage.setItem('tc_admin_sidebar_collapsed', collapsed ? '1' : '0');
                collapse.innerHTML = icon(collapsed ? 'left_panel_open' : 'left_panel_close');
            });
            brand.appendChild(collapse);
        }

        if (localStorage.getItem('tc_admin_sidebar_collapsed') === '1') {
            root.classList.add('adm2-collapsed');
            const collapse = brand?.querySelector('.adm2-collapse');
            if (collapse) collapse.innerHTML = icon('left_panel_open');
        }
    }

    function ensureManagementSections() {
        const content = document.querySelector('#adminView .adm-content');
        if (!content) return;
        ['achievements', 'features', 'settings', 'activity', 'api', 'help'].forEach((tab) => {
            if (document.getElementById(`adminSec-${tab}`)) return;
            const sec = document.createElement('div');
            sec.className = 'admin-section';
            sec.id = `adminSec-${tab}`;
            sec.innerHTML = `<div class="adm2-loading"><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div></div>`;
            content.appendChild(sec);
        });
    }

    function updateHeader(tab) {
        const meta = TAB_META[tab] || TAB_META.overview;
        const kicker = document.getElementById('adminHeaderKicker');
        const title = document.getElementById('adminHeaderTitle');
        const desc = document.getElementById('adminHeaderDesc');
        if (kicker) kicker.textContent = meta[0];
        if (title) title.textContent = meta[1];
        if (desc) desc.textContent = meta[2];
    }

    function activateAdminSection(tab) {
        document.querySelectorAll('#adminView .admin-section').forEach((sec) => {
            sec.classList.toggle('active', sec.id === `adminSec-${tab}`);
        });
        document.querySelectorAll('#adminView .adm-nav-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.id === `adminTab-${tab}`);
        });
    }

    function installTabRouter(attempt) {
        if (global.switchAdminTab?.__adm2Wrapped) return;
        const legacy = global.switchAdminTab;
        if (typeof legacy !== 'function') {
            if ((attempt || 0) < 20) setTimeout(() => installTabRouter((attempt || 0) + 1), 200);
            return;
        }
        const wrapped = function switchAdminTabV2(tab) {
            if (!TAB_META[tab] && typeof legacy === 'function') {
                return legacy.apply(this, arguments);
            }
            state.activeTab = tab;
            // Always hide every admin section first so Features/API/etc never leak onto other tabs.
            activateAdminSection(tab);
            updateHeader(tab);
            if (OLD_TABS.has(tab) && typeof legacy === 'function') {
                // Re-run legacy loaders without letting legacy overwrite section visibility incorrectly.
                try {
                    if (tab === 'overview' && typeof global.loadAdminOverview === 'function') global.loadAdminOverview();
                    if (tab === 'promo') {
                        if (typeof global.loadPromoCodesFromServer === 'function') global.loadPromoCodesFromServer();
                        if (typeof global.renderAdminProScopePicker === 'function') global.renderAdminProScopePicker();
                    }
                    if (tab === 'payments' && typeof global.loadAdminPayments === 'function') global.loadAdminPayments();
                    if (tab === 'announce' && typeof global.loadAdminAnnouncementsHistory === 'function') {
                        // CMS owns announce UI; keep history fetch soft.
                    }
                    if (tab === 'members' && typeof global.loadAdminMembersData === 'function') global.loadAdminMembersData();
                    if (tab === 'gifts' && typeof global.renderGiftDashboard === 'function') global.renderGiftDashboard();
                    if (tab === 'reports' && typeof global.loadAdminBugReports === 'function') global.loadAdminBugReports();
                    if (tab !== 'members') {
                        if (typeof global.closeAdminMemberDetail === 'function') global.closeAdminMemberDetail();
                    }
                } catch (err) {
                    console.warn('[AdminCenterV2] legacy loader', err);
                }
            }
            if (tab === 'overview') loadOverviewExtras();
            if (tab === 'members') setupMemberManagement();
            if (tab === 'promo') setupPromoManagement();
            if (tab === 'payments') setupPaymentManagement();
            if (tab === 'reports') setupReportManagement();
            if (tab === 'announce') initAnnouncementCms();
            if (tab === 'features') renderFeatures();
            if (tab === 'achievements') renderAchievements();
            if (tab === 'settings') renderSettings();
            if (tab === 'activity') renderActivity();
            if (tab === 'api') renderApi();
            if (tab === 'help') renderHelp();
            recordActivity('เปิดหน้า', TAB_META[tab]?.[1] || tab);
        };
        wrapped.__adm2Wrapped = true;
        wrapped.__legacy = legacy;
        global.switchAdminTab = wrapped;
    }

    function enhanceOverview() {
        const stats = document.getElementById('adminStatsGrid');
        if (stats && !document.getElementById('adm2StatRevenue')) {
            stats.insertAdjacentHTML('beforeend',
                statCard('adm2StatRevenue', 'รายรับที่ยืนยันแล้ว', 'payments', 'green') +
                statCard('adm2StatPending', 'รอชำระ / ตรวจสอบ', 'pending_actions', 'yellow') +
                statCard('adm2StatReports', 'รายงานทั้งหมด', 'report', 'red') +
                statCard('adm2StatActive', 'Active Users', 'online_prediction', 'cyan'));
        }

        const oldGrid = document.querySelector('#adminSec-overview .adm-dash-grid');
        if (oldGrid && !document.getElementById('adm2OverviewAnalytics')) {
            const analytics = document.createElement('div');
            analytics.id = 'adm2OverviewAnalytics';
            analytics.className = 'adm2-overview-grid';
            analytics.innerHTML = `
                <section class="adm2-analytics-card">
                    <div class="adm2-card-head">
                        <div><h3>User Activity</h3><p>สัดส่วนสมาชิกจากข้อมูลจริงล่าสุด</p></div>
                        <div class="adm2-range" aria-label="ช่วงเวลา"><button type="button">วันนี้</button><button type="button" class="active">7 วัน</button><button type="button">30 วัน</button></div>
                    </div>
                    <div class="adm2-chart" id="adm2UserChart">${emptyState('กำลังโหลดข้อมูล', 'รอข้อมูลสมาชิกจาก Admin API')}</div>
                </section>
                <section class="adm2-analytics-card">
                    <div class="adm2-card-head"><div><h3>Recent Activity</h3><p>กิจกรรมจริงในเซสชันนี้</p></div>${statusBadge('published', 'LIVE')}</div>
                    <div class="adm2-activity-list" id="adm2OverviewActivity"></div>
                </section>`;
            oldGrid.parentNode.insertBefore(analytics, oldGrid);
        }
    }

    function renderBars(items) {
        const max = Math.max(1, ...items.map((x) => Number(x.value) || 0));
        return `<div class="adm2-bars">${items.map((item) => {
            const height = Math.max(3, Math.round(((Number(item.value) || 0) / max) * 125));
            return `<div class="adm2-bar-group"><b>${esc(item.value)}</b><div class="adm2-bar" style="height:${height}px"></div><span>${esc(item.label)}</span></div>`;
        }).join('')}</div>`;
    }

    function renderOverviewActivity() {
        const box = document.getElementById('adm2OverviewActivity');
        if (!box) return;
        const items = state.sessionActivity.slice(0, 6);
        if (!items.length) {
            box.innerHTML = emptyState('ยังไม่มีกิจกรรมในเซสชัน', 'กิจกรรมที่ดำเนินการใน Admin Center จะแสดงที่นี่');
            return;
        }
        box.innerHTML = items.map((item) => `<div class="adm2-activity-item">
            <span class="adm2-activity-dot" style="${item.status === 'error' ? 'background:#ef4444' : ''}"></span>
            <div><b>${esc(item.action)}</b><small>${esc(item.target)}</small></div>
            <time>${item.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</time>
        </div>`).join('');
    }

    async function loadOverviewExtras() {
        enhanceOverview();
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value == null ? '—' : value;
        };
        try {
            const [overviewResult, paymentResult, reportResult] = await Promise.allSettled([
                api('/api/admin/overview'),
                api('/api/admin/payments'),
                api('/api/admin/bug-reports')
            ]);

            if (overviewResult.status === 'fulfilled') {
                const data = overviewResult.value;
                state.latestOverview = data;
                const s = data.stats || {};
                set('adm2StatActive', s.activeStreamers ?? (data.activeStreamers || []).length);
                const chart = document.getElementById('adm2UserChart');
                if (chart) chart.innerHTML = renderBars([
                    { label: 'ทั้งหมด', value: s.totalUsers || 0 },
                    { label: 'PRO', value: s.proActive || 0 },
                    { label: 'Free', value: s.freeUsers || 0 },
                    { label: 'Live', value: s.activeStreamers || 0 }
                ]);
            }

            if (paymentResult.status === 'fulfilled') {
                state.latestPayments = paymentResult.value.orders || [];
                const paid = state.latestPayments.filter((o) => ['paid', 'manual'].includes(o.status));
                const pending = state.latestPayments.filter((o) => o.status === 'pending');
                const revenue = paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
                set('adm2StatRevenue', `฿${revenue.toLocaleString('th-TH')}`);
                set('adm2StatPending', pending.length);
            } else {
                set('adm2StatRevenue', 'N/A');
                set('adm2StatPending', 'N/A');
            }

            if (reportResult.status === 'fulfilled') {
                state.latestReports = reportResult.value.list || reportResult.value.reports || [];
                set('adm2StatReports', state.latestReports.length);
                updateNavBadges();
            } else {
                set('adm2StatReports', 'N/A');
            }
        } catch (error) {
            const chart = document.getElementById('adm2UserChart');
            if (chart) chart.innerHTML = errorState('โหลด Analytics ไม่สำเร็จ', error.message, 'AdminCenterV2.loadOverviewExtras()');
        }
        renderOverviewActivity();
    }

    function updateNavBadges() {
        const reportBtn = document.getElementById('adminTab-reports');
        if (reportBtn) {
            let badge = reportBtn.querySelector('.adm2-nav-badge');
            const open = state.latestReports.filter((r) => !['resolved', 'closed', 'fixed'].includes(String(r.status || 'pending'))).length;
            if (!badge && open) {
                badge = document.createElement('span');
                badge.className = 'adm2-nav-badge';
                reportBtn.appendChild(badge);
            }
            if (badge) {
                badge.textContent = String(open);
                badge.hidden = !open;
            }
        }
    }

    function setupMemberManagement() {
        const main = document.querySelector('#adminSec-members .adm-members-main');
        if (!main) return;
        if (!main.dataset.adm2Ready) {
            main.dataset.adm2Ready = '1';
            const kpis = document.createElement('div');
            kpis.className = 'adm-stat-row';
            kpis.id = 'adm2MemberKpis';
            kpis.innerHTML =
                statCard('adm2MemberTotal', 'Total Members', 'groups', 'cyan') +
                statCard('adm2MemberPro', 'PRO', 'workspace_premium', 'yellow') +
                statCard('adm2MemberFree', 'Free', 'person', '') +
                statCard('adm2MemberActive', 'Active', 'online_prediction', 'green') +
                statCard('adm2MemberExpired', 'Expired PRO', 'event_busy', 'red');
            main.insertBefore(kpis, main.firstChild);
            const toolbar = main.querySelector('.adm-toolbar');
            if (toolbar && !document.getElementById('adm2MemberSort')) {
                const sort = document.createElement('select');
                sort.className = 'adm2-select';
                sort.id = 'adm2MemberSort';
                sort.setAttribute('aria-label', 'เรียงสมาชิก');
                sort.innerHTML = '<option value="newest">สมัครล่าสุด</option><option value="oldest">สมัครเก่าสุด</option><option value="name">ชื่อ A–Z</option><option value="pro">PRO ก่อน</option>';
                sort.addEventListener('change', () => {
                    state.memberPage = 1;
                    applyMemberDomControls();
                });
                toolbar.appendChild(sort);
            }
            ['adminMemberPanel-registered', 'adminMemberPanel-pro', 'adminMemberPanel-codes'].forEach((id) => {
                const panel = document.getElementById(id);
                if (!panel || panel.querySelector('.adm2-pagination')) return;
                const pager = document.createElement('div');
                pager.className = 'adm2-pagination';
                pager.dataset.for = id;
                panel.appendChild(pager);
            });
        }
        renderMemberKpis();
        if (typeof global.renderAdminMemberTables === 'function' && !global.renderAdminMemberTables.__adm2Wrapped) {
            const legacyRender = global.renderAdminMemberTables;
            const wrappedRender = function renderAdminMemberTablesV2() {
                const result = legacyRender.apply(this, arguments);
                setTimeout(applyMemberDomControls, 0);
                return result;
            };
            wrappedRender.__adm2Wrapped = true;
            global.renderAdminMemberTables = wrappedRender;
        }
        if (typeof global.switchAdminMemberFilter === 'function' && !global.switchAdminMemberFilter.__adm2Wrapped) {
            const legacyFilter = global.switchAdminMemberFilter;
            const wrappedFilter = function switchAdminMemberFilterV2(filter) {
                state.memberPage = 1;
                const result = legacyFilter.apply(this, arguments);
                setTimeout(applyMemberDomControls, 0);
                return result;
            };
            wrappedFilter.__adm2Wrapped = true;
            global.switchAdminMemberFilter = wrappedFilter;
        }
        // Wait for legacy table render, then paginate without MutationObserver (avoids freeze loop).
        setTimeout(applyMemberDomControls, 250);
        setTimeout(applyMemberDomControls, 900);
    }

    async function renderMemberKpis() {
        let data = state.latestOverview;
        if (!data) {
            try {
                data = await api('/api/admin/overview');
                state.latestOverview = data;
            } catch (_) { return; }
        }
        const users = data.registeredUsers || [];
        const now = new Date();
        const expired = users.filter((u) => u.proExpireAt && new Date(u.proExpireAt) <= now).length;
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        set('adm2MemberTotal', data.stats?.totalUsers ?? users.length);
        set('adm2MemberPro', data.stats?.proActive ?? (data.proUsers || []).length);
        set('adm2MemberFree', data.stats?.freeUsers ?? users.filter((u) => !u.proActive).length);
        set('adm2MemberActive', data.stats?.activeStreamers ?? (data.activeStreamers || []).length);
        set('adm2MemberExpired', expired);
    }

    function applyMemberDomControls() {
        if (state._memberPagingLock) return;
        state._memberPagingLock = true;
        try {
            const filter = (typeof global.adminMemberFilter === 'string' && global.adminMemberFilter)
                || document.querySelector('#adminSec-members .admin-chip.active')?.id?.replace('adminMemberChip-', '')
                || 'registered';
            const panel = document.getElementById(`adminMemberPanel-${filter}`)
                || document.querySelector('#adminSec-members .admin-card:not([style*="display: none"]):not([style*="display:none"])');
            if (!panel || panel.style.display === 'none') return;
            const body = panel.querySelector('tbody');
            const pager = panel.querySelector('.adm2-pagination');
            if (!body || !pager) return;
            const rows = [...body.querySelectorAll('tr')].filter((row) => !row.querySelector('.admin-empty'));
            // Only hide/show — never re-append rows (that caused infinite MutationObserver freeze).
            const pages = Math.max(1, Math.ceil(rows.length / state.memberPageSize) || 1);
            state.memberPage = Math.min(Math.max(1, state.memberPage), pages);
            rows.forEach((row, index) => {
                const start = (state.memberPage - 1) * state.memberPageSize;
                row.hidden = index < start || index >= start + state.memberPageSize;
            });
            pager.innerHTML = `<span>${rows.length ? `${(state.memberPage - 1) * state.memberPageSize + 1}–${Math.min(state.memberPage * state.memberPageSize, rows.length)} จาก ${rows.length}` : '0 รายการ'}</span>
                <div class="adm2-pagination-actions"><button type="button" data-page="prev" ${state.memberPage <= 1 ? 'disabled' : ''}>‹</button><button type="button" disabled>${state.memberPage}/${pages}</button><button type="button" data-page="next" ${state.memberPage >= pages ? 'disabled' : ''}>›</button></div>`;
            pager.onclick = (event) => {
                const dir = event.target?.dataset?.page;
                if (dir === 'prev') state.memberPage = Math.max(1, state.memberPage - 1);
                if (dir === 'next') state.memberPage = Math.min(pages, state.memberPage + 1);
                applyMemberDomControls();
            };
        } finally {
            state._memberPagingLock = false;
        }
    }

    function setupPaymentManagement() {
        const sec = document.getElementById('adminSec-payments');
        const card = sec?.querySelector('.admin-card');
        if (!card || card.dataset.adm2Ready) return;
        card.dataset.adm2Ready = '1';
        const kpis = document.createElement('div');
        kpis.className = 'adm-stat-row';
        kpis.style.marginBottom = '12px';
        kpis.innerHTML =
            statCard('adm2PayRevenue', 'Revenue', 'payments', 'green') +
            statCard('adm2PaySuccess', 'Successful', 'check_circle', 'cyan') +
            statCard('adm2PayPending', 'Pending', 'pending_actions', 'yellow') +
            statCard('adm2PayCancelled', 'Cancelled', 'cancel', 'red') +
            statCard('adm2PayRefund', 'Refund', 'currency_exchange', '');
        sec.insertBefore(kpis, card);
        const title = card.querySelector('.admin-card-title');
        const toolbar = document.createElement('div');
        toolbar.className = 'adm2-toolbar';
        toolbar.innerHTML = `<input class="adm2-search" type="search" id="adm2PaymentSearch" placeholder="ค้นหาผู้ใช้ แพ็กเกจ หรือ Transaction ID..." aria-label="ค้นหาการชำระเงิน">
            <select class="adm2-select" id="adm2PaymentStatus" aria-label="กรองสถานะ"><option value="all">ทุกสถานะ</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="manual">Manual</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select>`;
        title?.insertAdjacentElement('afterend', toolbar);
        toolbar.addEventListener('input', applyPaymentDomFilter);
        const body = document.getElementById('adminPaymentsBody');
        if (body) new MutationObserver(applyPaymentDomFilter).observe(body, { childList: true });
        loadPaymentKpis();
    }

    async function loadPaymentKpis() {
        try {
            const data = await api('/api/admin/payments');
            state.latestPayments = data.orders || [];
            const paid = state.latestPayments.filter((o) => ['paid', 'manual'].includes(o.status));
            const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            set('adm2PayRevenue', `฿${paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0).toLocaleString('th-TH')}`);
            set('adm2PaySuccess', paid.length);
            set('adm2PayPending', state.latestPayments.filter((o) => o.status === 'pending').length);
            set('adm2PayCancelled', state.latestPayments.filter((o) => ['cancelled', 'expired'].includes(o.status)).length);
            set('adm2PayRefund', state.latestPayments.filter((o) => o.status === 'refund' || o.status === 'refunded').length);
        } catch (_) {
            ['adm2PayRevenue','adm2PaySuccess','adm2PayPending','adm2PayCancelled','adm2PayRefund'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.textContent = 'N/A';
            });
        }
    }

    function setupPromoManagement() {
        const sec = document.getElementById('adminSec-promo');
        const cards = sec?.querySelectorAll('.admin-card');
        if (!sec || !cards?.length || sec.dataset.adm2Ready) return;
        sec.dataset.adm2Ready = '1';
        const kpis = document.createElement('div');
        kpis.className = 'adm-stat-row';
        kpis.style.marginBottom = '12px';
        kpis.innerHTML =
            statCard('adm2PromoTotal', 'Promo Codes', 'confirmation_number', '') +
            statCard('adm2PromoAvailable', 'Available', 'check_circle', 'green') +
            statCard('adm2PromoUsed', 'Used', 'redeem', 'yellow');
        sec.insertBefore(kpis, sec.firstChild);
        const tableCard = cards[cards.length - 1];
        const title = tableCard.querySelector('.admin-card-title');
        const toolbar = document.createElement('div');
        toolbar.className = 'adm2-toolbar';
        toolbar.innerHTML = `<input class="adm2-search" type="search" id="adm2PromoSearch" placeholder="ค้นหา code หรือ reward..."><select class="adm2-select" id="adm2PromoStatus"><option value="all">ทุกสถานะ</option><option value="available">Available</option><option value="used">Used</option></select>`;
        title?.insertAdjacentElement('afterend', toolbar);
        toolbar.addEventListener('input', applyPromoFilter);
        const body = document.getElementById('serverCodesContainer');
        if (body) new MutationObserver(applyPromoFilter).observe(body, { childList: true });
    }

    function applyPromoFilter() {
        const q = (document.getElementById('adm2PromoSearch')?.value || '').toLowerCase();
        const status = document.getElementById('adm2PromoStatus')?.value || 'all';
        const rows = [...document.querySelectorAll('#serverCodesContainer tr')].filter((row) => !row.querySelector('.admin-empty'));
        let used = 0;
        rows.forEach((row) => {
            const text = row.textContent.toLowerCase();
            const isUsed = text.includes('ใช้แล้ว') || text.includes('used');
            if (isUsed) used += 1;
            row.hidden = !((!q || text.includes(q)) && (status === 'all' || (status === 'used' ? isUsed : !isUsed)));
        });
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        set('adm2PromoTotal', rows.length);
        set('adm2PromoUsed', used);
        set('adm2PromoAvailable', rows.length - used);
    }

    function applyPaymentDomFilter() {
        const q = (document.getElementById('adm2PaymentSearch')?.value || '').trim().toLowerCase();
        const status = document.getElementById('adm2PaymentStatus')?.value || 'all';
        document.querySelectorAll('#adminPaymentsBody tr').forEach((row) => {
            if (row.querySelector('.admin-empty')) return;
            const text = row.textContent.toLowerCase();
            const matchQ = !q || text.includes(q);
            const matchStatus = status === 'all' || text.includes(status) ||
                (status === 'pending' && text.includes('รอชำระ')) ||
                (status === 'paid' && text.includes('จ่ายแล้ว')) ||
                (status === 'cancelled' && text.includes('ยกเลิก'));
            row.hidden = !(matchQ && matchStatus);
        });
    }

    function setupReportManagement() {
        if (typeof global.mountAdminReports === 'function') {
            global.mountAdminReports();
            return;
        }
        const sec = document.getElementById('adminSec-reports');
        if (!sec) return;
        sec.innerHTML = '<div class="admin-card"><div class="admin-empty">กำลังโหลดระบบรายงาน...</div></div>';
    }

    async function loadReportKpis() {
        try {
            const data = await api('/api/admin/bug-reports');
            state.latestReports = data.list || [];
            const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            set('adm2ReportTotal', state.latestReports.length);
            set('adm2ReportOpen', state.latestReports.filter((r) => ['open', 'pending', ''].includes(String(r.status || 'pending'))).length);
            set('adm2ReportInvestigating', state.latestReports.filter((r) => r.status === 'investigating').length);
            set('adm2ReportResolved', state.latestReports.filter((r) => ['resolved', 'fixed'].includes(r.status)).length);
            updateNavBadges();
        } catch (_) {}
    }

    function initAnnouncementCms() {
        const sec = document.getElementById('adminSec-announce');
        if (!sec) return;
        if (sec.dataset.adm2Ready) {
            loadAnnouncementManagement();
            refreshAnnouncementPreview();
            return;
        }
        sec.dataset.adm2Ready = '1';
        buildAnnouncementStudio(sec);
        loadAnnouncementManagement();
        refreshAnnouncementPreview();
    }

    function buildAnnouncementStudio(sec) {
        const existingTitle = document.getElementById('announceTitleInput')?.value || '';
        const existingSummary = document.getElementById('announceSummaryInput')?.value || '';
        const existingMessage = document.getElementById('announceMessageInput')?.value || '';
        const existingCtaLabel = document.getElementById('announceCtaLabelInput')?.value || '';
        const existingCtaUrl = document.getElementById('announceCtaUrlInput')?.value || '';
        const existingImportant = !!document.getElementById('announceImportantToggle')?.checked;

        sec.innerHTML = `
            <div class="adm2-ann-shell">
                <div class="adm2-ann-topbar">
                    <div class="adm2-ann-tabs" role="tablist">
                        <button type="button" class="adm2-ann-tab" data-ann-tab="popup" role="tab">${icon('campaign')} Popup Editor</button>
                        <button type="button" class="adm2-ann-tab active" data-ann-tab="create" role="tab">${icon('edit_note')} สร้างประกาศ</button>
                        <button type="button" class="adm2-ann-tab" data-ann-tab="manage" role="tab">${icon('list_alt')} จัดการประกาศ</button>
                        <button type="button" class="adm2-ann-tab" data-ann-tab="templates" role="tab">${icon('dashboard_customize')} เทมเพลตประกาศ</button>
                        <button type="button" class="adm2-ann-tab" data-ann-tab="analytics" role="tab">${icon('monitoring')} สถิติ & ประวัติ</button>
                    </div>
                    <div class="adm2-ann-actions">
                        <button type="button" class="admin-btn admin-btn-ghost" id="adm2AnnPreviewBtn">${icon('visibility')} ดูตัวอย่าง</button>
                        <button type="button" class="admin-btn admin-btn-ghost" id="adm2AnnSaveTemplateBtn">${icon('save')} บันทึกเป็นเทมเพลต</button>
                        <button type="button" class="admin-btn admin-btn-accent" id="adm2AnnPublishBtn">${icon('send')} บันทึก & เผยแพร่</button>
                    </div>
                </div>

                <div class="adm2-ann-pane" data-ann-pane="popup" hidden>
                    <div id="adm2PopupEditorHost"></div>
                </div>
                <div class="adm2-ann-pane" data-ann-pane="create">
                    <div class="adm2-ann-create-layout">
                        <section class="admin-card adm2-ann-info-card">
                            <div class="admin-card-title">ข้อมูลประกาศ</div>
                            <div class="adm2-ann-title-grid">
                                <div>
                                    <div class="adm2-field-head"><span class="field-label adm-label">หัวข้อในแอป</span><span class="adm2-counter" id="adm2TitleCounter">0/100</span></div>
                                    <input type="text" id="announceTitleInput" class="field-ui adm-field" maxlength="100" placeholder="🎉 อัปเดตระบบใหม่!" value="${esc(existingTitle)}">
                                </div>
                                <div>
                                    <div class="adm2-field-head"><span class="field-label adm-label">หัวข้อ Notification</span><span class="adm2-counter" id="adm2NotifCounter">0/60</span></div>
                                    <input type="text" id="announceSummaryInput" class="field-ui adm-field" maxlength="60" placeholder="สรุปสั้นสำหรับแจ้งเตือน" value="${esc(existingSummary)}">
                                </div>
                            </div>
                            <div>
                                <span class="field-label adm-label">หมวดประกาศ</span>
                                <select id="announceCategoryInput" class="field-ui adm-field keep-native-select">
                                    <option value="update">อัปเดตระบบ</option>
                                    <option value="news">ข่าวสาร</option>
                                    <option value="promo">โปรโมชั่น</option>
                                    <option value="event">กิจกรรม</option>
                                    <option value="notice" selected>แจ้งเตือน</option>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="important">สำคัญ</option>
                                    <option value="other">อื่น ๆ</option>
                                </select>
                            </div>
                            <div>
                                <span class="field-label adm-label">เนื้อหาประกาศ</span>
                                <textarea id="announceMessageInput" class="field-ui adm-field" hidden>${esc(existingMessage)}</textarea>
                                <div class="adm2-rte">
                                    <div class="adm2-rte-toolbar" role="toolbar" aria-label="เครื่องมือจัดรูปแบบประกาศ">
                                        <select data-rte-block aria-label="รูปแบบข้อความ"><option value="p">Text</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option></select>
                                        <span class="sep"></span>
                                        <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
                                        <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
                                        <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
                                        <button type="button" data-cmd="strikeThrough" title="Strike"><s>S</s></button>
                                        <span class="sep"></span>
                                        <button type="button" data-cmd="insertUnorderedList" title="Bullet">•</button>
                                        <button type="button" data-cmd="insertOrderedList" title="Number">1.</button>
                                        <button type="button" data-rte-check title="Checklist">☑</button>
                                        <button type="button" data-cmd="justifyLeft" title="Left">≡</button>
                                        <button type="button" data-cmd="justifyCenter" title="Center">≡</button>
                                        <button type="button" data-cmd="justifyRight" title="Right">≡</button>
                                        <span class="sep"></span>
                                        <button type="button" data-rte-quote title="Quote">❝</button>
                                        <button type="button" data-rte-link title="Link">🔗</button>
                                        <button type="button" data-rte-code title="Code">&lt;/&gt;</button>
                                        <button type="button" data-rte-divider title="Divider">―</button>
                                        <button type="button" data-rte-emoji title="Emoji">😊</button>
                                        <button type="button" data-rte-sticker title="Sticker">✨</button>
                                    </div>
                                    <div class="adm2-rte-body" id="adm2AnnouncementEditor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="เขียนเนื้อหาประกาศ..."></div>
                                </div>
                            </div>
                            <div>
                                <span class="field-label adm-label">สื่อ / รูปแบนเนอร์</span>
                                <input type="file" id="announceImageInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
                                <div class="adm2-media-drop" id="adm2MediaDrop" tabindex="0" role="button" aria-label="อัปโหลดรูปประกาศ">
                                    <div>${icon('cloud_upload')}<b>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</b><small>PNG, JPG, GIF, WEBP · สูงสุด 5 MB</small><div class="adm2-upload-progress"><i></i></div></div>
                                </div>
                                <div id="announceImagePreview" style="display:none;margin-top:8px;">
                                    <img id="announceImagePreviewImg" alt="" style="max-width:100%;max-height:160px;border-radius:10px;border:1px solid rgba(255,255,255,.1)">
                                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" style="margin-top:6px;" id="adm2ClearMedia">ลบรูป</button>
                                </div>
                            </div>
                            <div class="adm2-field-head"><span class="field-label adm-label">CTA Buttons (สูงสุด 3)</span><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2AddCta">+ เพิ่มปุ่ม</button></div>
                            <div class="adm2-cta-list" id="adm2CtaList"></div>
                            <input type="hidden" id="announceCtaLabelInput" value="${esc(existingCtaLabel)}">
                            <input type="hidden" id="announceCtaUrlInput" value="${esc(existingCtaUrl)}">
                            <label class="adm-check-row" style="margin-top:10px;"><input type="checkbox" id="announceImportantToggle" ${existingImportant ? 'checked' : ''}><span>ประกาศสำคัญ (แสดงกลางจอทันที)</span></label>
                        </section>

                        <section class="admin-card adm2-preview-card">
                            <div class="admin-card-title" style="justify-content:space-between">
                                <span>ตัวอย่างประกาศ</span>
                                <div class="adm2-preview-switch"><button type="button" class="active" data-preview-mode="desktop">Desktop</button><button type="button" data-preview-mode="mobile">Mobile</button></div>
                            </div>
                            <div class="adm2-preview-stage"><article class="adm2-preview-device" id="adm2AnnouncementPreview"></article></div>
                        </section>
                    </div>

                    <div class="adm2-ann-bottom-grid">
                        <section class="admin-card">
                            <div class="admin-card-title">ร่วมอิโมจิ & สติ๊กเกอร์</div>
                            <div class="adm2-picker-tabs" id="adm2InlinePickerTabs">
                                <button type="button" class="active" data-inline-picker="emoji">Emoji</button>
                                <button type="button" data-inline-picker="stickers">Stickers</button>
                                <button type="button" data-inline-picker="gif">GIF</button>
                            </div>
                            <input class="adm2-search" id="adm2InlinePickerSearch" type="search" placeholder="ค้นหา emoji / sticker..." style="width:100%;margin:8px 0;">
                            <div class="adm2-picker-grid" id="adm2InlinePickerGrid" style="max-height:180px;"></div>
                        </section>
                        <section class="admin-card">
                            <div class="admin-card-title">ตั้งค่าประกาศ</div>
                            <label class="adm2-check"><input type="checkbox" id="adm2DisplayHome" checked> แสดงบนหน้าแรก</label>
                            <label class="adm2-check"><input type="checkbox" id="adm2ShowNotification" checked> ส่ง Notification</label>
                            <label class="adm2-check"><input type="checkbox" id="adm2Pinned"> Pin Announcement</label>
                            <label class="adm2-check"><input type="checkbox" id="adm2ShowPopup"> Show popup</label>
                            <label class="adm2-check" style="margin-top:8px;">Publish <input type="datetime-local" id="adm2PublishAt" class="adm2-select" style="margin-left:auto"></label>
                            <label class="adm2-check">Expire <input type="datetime-local" id="adm2ExpireAt" class="adm2-select" style="margin-left:auto"></label>
                            <select id="adm2AnnStatus" class="adm2-select" style="width:100%;margin-top:8px;"><option value="published">Published</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option></select>
                            <select id="adm2Timezone" class="adm2-select" style="width:100%;margin-top:6px;"><option value="Asia/Bangkok">Asia/Bangkok</option><option value="UTC">UTC</option></select>
                        </section>
                        <section class="admin-card">
                            <div class="admin-card-title">กลุ่มเป้าหมาย</div>
                            <label class="adm2-check"><input type="radio" name="adm2AudienceRadio" value="all" checked> ทุกคน</label>
                            <label class="adm2-check"><input type="radio" name="adm2AudienceRadio" value="pro"> สมาชิก PRO เท่านั้น</label>
                            <label class="adm2-check"><input type="radio" name="adm2AudienceRadio" value="free"> สมาชิก Free</label>
                            <label class="adm2-check"><input type="radio" name="adm2AudienceRadio" value="custom"> Custom Audience</label>
                            <select id="adm2Audience" class="adm2-select" style="display:none"><option value="all">all</option><option value="pro">pro</option><option value="free">free</option><option value="group">group</option><option value="custom">custom</option></select>
                            <input id="adm2AudienceConfig" class="adm2-search" style="width:100%;margin-top:8px;display:none" placeholder="User IDs คั่นด้วย comma">
                        </section>
                        <section class="admin-card">
                            <div class="admin-card-title">สถิติการรับชม</div>
                            <div class="adm2-mini-stats" id="adm2CreateStats">
                                <div><b id="adm2CreateViews">0</b><span>Views</span></div>
                                <div><b id="adm2CreateReads">0</b><span>Reads</span></div>
                                <div><b id="adm2CreateReactions">0</b><span>Reactions</span></div>
                                <div><b id="adm2CreateShares">0</b><span>Shares</span></div>
                            </div>
                            <p class="adm-card-hint" style="margin:10px 0 0;">แสดงยอดจริงหลังเผยแพร่จาก event tracking</p>
                        </section>
                    </div>
                </div>

                <div class="adm2-ann-pane" data-ann-pane="manage" hidden></div>
                <div class="adm2-ann-pane" data-ann-pane="templates" hidden>
                    <div class="admin-card">${emptyState('ยังไม่มีเทมเพลต', 'กด “บันทึกเป็นเทมเพลต” จากหน้าสร้างประกาศ เพื่อเก็บเลย์เอาต์ไว้ใช้ซ้ำ')}</div>
                </div>
                <div class="adm2-ann-pane" data-ann-pane="analytics" hidden></div>
            </div>`;

        const editorBody = document.getElementById('adm2AnnouncementEditor');
        if (editorBody && existingMessage) editorBody.textContent = existingMessage;

        const rte = sec.querySelector('.adm2-rte');
        if (rte) bindRichEditor(rte);

        sec.querySelector('.adm2-ann-tabs')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ann-tab]');
            if (btn) switchAnnouncementPane(btn.dataset.annTab);
        });

        document.getElementById('adm2AnnPublishBtn')?.addEventListener('click', () => submitAnnouncement('published'));
        document.getElementById('adm2AnnPreviewBtn')?.addEventListener('click', () => {
            switchAnnouncementPane('create');
            refreshAnnouncementPreview();
            showToast('info', 'พรีวิว', 'อัปเดตตัวอย่างด้านขวาแล้ว');
        });
        document.getElementById('adm2AnnSaveTemplateBtn')?.addEventListener('click', saveAnnouncementTemplate);

        ['announceTitleInput', 'announceSummaryInput'].forEach((id) => {
            const input = document.getElementById(id);
            const counter = document.getElementById(id === 'announceTitleInput' ? 'adm2TitleCounter' : 'adm2NotifCounter');
            if (!input || !counter) return;
            const sync = () => { counter.textContent = `${input.value.length}/${input.maxLength}`; refreshAnnouncementPreview(); };
            input.addEventListener('input', sync);
            sync();
        });

        sec.querySelector('.adm2-preview-switch')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-preview-mode]');
            if (!btn) return;
            state.announcementMode = btn.dataset.previewMode;
            sec.querySelectorAll('[data-preview-mode]').forEach((x) => x.classList.toggle('active', x === btn));
            refreshAnnouncementPreview();
        });

        const drop = document.getElementById('adm2MediaDrop');
        const fileInput = document.getElementById('announceImageInput');
        drop?.addEventListener('click', () => fileInput?.click());
        drop?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); } });
        ['dragenter', 'dragover'].forEach((name) => drop?.addEventListener(name, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
        ['dragleave', 'drop'].forEach((name) => drop?.addEventListener(name, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
        drop?.addEventListener('drop', (e) => { const file = e.dataTransfer?.files?.[0]; if (file) processAnnouncementMedia(file); });
        fileInput?.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) processAnnouncementMedia(file); });
        document.getElementById('adm2ClearMedia')?.addEventListener('click', () => {
            state.mediaDataUrl = '';
            state.mediaAssetId = '';
            state.mediaName = '';
            if (fileInput) fileInput.value = '';
            const preview = document.getElementById('announceImagePreview');
            if (preview) preview.style.display = 'none';
            refreshAnnouncementPreview();
        });

        document.getElementById('adm2AddCta')?.addEventListener('click', addCta);
        state.ctas = existingCtaLabel ? [{ label: existingCtaLabel, url: existingCtaUrl, style: 'primary', icon: '' }] : [];
        if (!state.ctas.length) addCta();
        else renderCtas();

        sec.querySelectorAll('input[name="adm2AudienceRadio"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                const audience = sec.querySelector('input[name="adm2AudienceRadio"]:checked')?.value || 'all';
                const select = document.getElementById('adm2Audience');
                const config = document.getElementById('adm2AudienceConfig');
                if (select) select.value = audience;
                if (config) config.style.display = audience === 'custom' ? '' : 'none';
                refreshAnnouncementPreview();
            });
        });

        sec.addEventListener('input', refreshAnnouncementPreview);
        sec.addEventListener('change', refreshAnnouncementPreview);
        renderInlinePicker('emoji');
        document.getElementById('adm2InlinePickerTabs')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-inline-picker]');
            if (!btn) return;
            sec.querySelectorAll('[data-inline-picker]').forEach((x) => x.classList.toggle('active', x === btn));
            renderInlinePicker(btn.dataset.inlinePicker);
        });
        document.getElementById('adm2InlinePickerSearch')?.addEventListener('input', (e) => {
            state.emojiSearch = e.target.value.trim();
            const active = sec.querySelector('[data-inline-picker].active')?.dataset.inlinePicker || 'emoji';
            renderInlinePicker(active);
        });

        loadCreatePaneStats();
    }

    function renderInlinePicker(mode) {
        const grid = document.getElementById('adm2InlinePickerGrid');
        if (!grid) return;
        if (mode === 'gif') {
            grid.innerHTML = `<div style="grid-column:1/-1;display:flex;gap:6px;"><input class="adm2-search" id="adm2InlineGifUrl" type="url" placeholder="วาง URL รูป GIF / WEBP" style="flex:1"><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2InlineGifInsert">แทรก</button></div>`;
            document.getElementById('adm2InlineGifInsert')?.addEventListener('click', () => {
                const url = document.getElementById('adm2InlineGifUrl')?.value.trim() || '';
                if (!/^https?:\/\/.+\.(gif|webp)(\?.*)?$/i.test(url)) {
                    showToast('warning', 'URL ไม่ถูกต้อง', 'รองรับ GIF / WEBP ผ่าน HTTPS');
                    return;
                }
                insertIntoEditor(`<img src="${esc(url)}" alt="GIF">`, true);
            });
            return;
        }
        let list = mode === 'stickers' ? STICKERS : (EMOJI.favorites.concat(EMOJI.smileys, EMOJI.activities, EMOJI.symbols));
        if (state.emojiSearch) list = list.filter((item) => item.includes(state.emojiSearch));
        grid.innerHTML = [...new Set(list)].slice(0, 64).map((item) => `<button type="button" data-inline-item="${esc(item)}">${item}</button>`).join('');
        grid.onclick = (event) => {
            const btn = event.target.closest('[data-inline-item]');
            if (!btn) return;
            insertIntoEditor(btn.dataset.inlineItem);
            EMOJI.recent = [btn.dataset.inlineItem, ...EMOJI.recent.filter((x) => x !== btn.dataset.inlineItem)].slice(0, 24);
        };
    }

    function saveAnnouncementTemplate() {
        const payload = collectAnnouncementPayload('draft');
        if (!payload.title) {
            showToast('warning', 'ยังไม่มีหัวข้อ', 'กรอกหัวข้อก่อนบันทึกเทมเพลต');
            return;
        }
        const key = 'tc_admin_announcement_templates';
        let list = [];
        try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { list = []; }
        list.unshift({
            id: `tpl_${Date.now()}`,
            title: payload.title,
            summary: payload.summary,
            message: payload.message,
            contentHtml: payload.contentHtml,
            category: payload.category,
            ctaButtons: payload.ctaButtons,
            createdAt: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
        showToast('success', 'บันทึกเทมเพลตแล้ว', payload.title);
        renderAnnouncementTemplates();
        switchAnnouncementPane('templates');
    }

    function renderAnnouncementTemplates() {
        const pane = document.querySelector('[data-ann-pane="templates"]');
        if (!pane) return;
        let list = [];
        try { list = JSON.parse(localStorage.getItem('tc_admin_announcement_templates') || '[]'); } catch (_) { list = []; }
        if (!list.length) {
            pane.innerHTML = `<div class="admin-card">${emptyState('ยังไม่มีเทมเพลต', 'กด “บันทึกเป็นเทมเพลต” จากหน้าสร้างประกาศ')}</div>`;
            return;
        }
        pane.innerHTML = `<div class="admin-card"><div class="admin-card-title">เทมเพลตประกาศ</div><div class="adm2-feature-grid">${list.map((tpl) => `<article class="adm2-feature-card">
            <div class="adm2-feature-head"><span class="adm2-feature-icon">${icon('dashboard_customize')}</span><div><h3>${esc(tpl.title)}</h3>${statusBadge('draft', tpl.category || 'template')}</div></div>
            <p>${esc(tpl.summary || tpl.message || '')}</p>
            <div class="adm2-feature-meta"><span>${esc(formatDate(tpl.createdAt))}</span><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-use-template="${esc(tpl.id)}">ใช้เทมเพลต</button></div>
        </article>`).join('')}</div></div>`;
        pane.onclick = (event) => {
            const btn = event.target.closest('[data-use-template]');
            if (!btn) return;
            const tpl = list.find((x) => x.id === btn.dataset.useTemplate);
            if (!tpl) return;
            state.editingAnnouncementId = null;
            populateAnnouncementForm(tpl);
            switchAnnouncementPane('create');
            showToast('success', 'โหลดเทมเพลตแล้ว', tpl.title);
        };
    }

    function loadCreatePaneStats() {
        const totals = state.latestAnnouncements.reduce((sum, a) => {
            sum.views += Number(a.views || 0);
            sum.reads += Number(a.reads || 0);
            sum.reactions += Number(a.reactions || 0);
            sum.shares += Number(a.shares || 0);
            return sum;
        }, { views: 0, reads: 0, reactions: 0, shares: 0 });
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value.toLocaleString(); };
        set('adm2CreateViews', totals.views);
        set('adm2CreateReads', totals.reads);
        set('adm2CreateReactions', totals.reactions);
        set('adm2CreateShares', totals.shares);
    }

    function makeAnnouncementPane(name) {
        const pane = document.createElement('div');
        pane.className = 'adm2-ann-pane';
        pane.dataset.annPane = name;
        pane.hidden = true;
        pane.innerHTML = `<div class="admin-card"><div class="adm2-loading"><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div></div></div>`;
        return pane;
    }

    function switchAnnouncementPane(name) {
        state.announcementTab = name;
        document.querySelectorAll('#adminSec-announce .adm2-ann-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.annTab === name));
        document.querySelectorAll('#adminSec-announce .adm2-ann-pane').forEach((pane) => { pane.hidden = pane.dataset.annPane !== name; });
        if (name === 'manage') renderAnnouncementManagement();
        if (name === 'templates') renderAnnouncementTemplates();
        if (name === 'analytics') {
            renderAnnouncementAnalytics();
            // Merge revision history into analytics tab as "สถิติ & ประวัติ"
            const pane = document.querySelector('[data-ann-pane="analytics"]');
            if (pane && !pane.querySelector('#adm2RevisionMount')) {
                const mount = document.createElement('div');
                mount.id = 'adm2RevisionMount';
                mount.style.marginTop = '12px';
                pane.appendChild(mount);
                renderAnnouncementRevisionsInto(mount);
            }
        }
        if (name === 'create') {
            loadCreatePaneStats();
            refreshAnnouncementPreview();
        }
        if (name === 'popup') mountPopupEditor();
    }

    function mountPopupEditor(announcement) {
        const host = document.getElementById('adm2PopupEditorHost');
        if (!host || !global.TcPopupEditor) return;
        global.TcPopupEditor._api = api;
        if (typeof global.TcPopupEditor.open === 'function') {
            global.TcPopupEditor.open(host, announcement);
            return;
        }
        global.TcPopupEditor.mount(host, announcement);
    }

    async function renderAnnouncementRevisionsInto(pane) {
        if (!pane) return;
        pane.innerHTML = `<div class="admin-card"><div class="admin-card-title">Revision History</div>
            <div class="adm2-toolbar"><select class="adm2-select" id="adm2RevisionAnnouncement"><option value="">เลือกประกาศ...</option>${state.latestAnnouncements.map((a) => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}</select></div>
            <div id="adm2RevisionList">${emptyState('เลือกประกาศ', 'Revision จะถูกบันทึกเมื่อแก้ไขผ่าน PATCH API')}</div>
        </div>`;
        pane.querySelector('#adm2RevisionAnnouncement')?.addEventListener('change', async (event) => {
            const box = document.getElementById('adm2RevisionList');
            const id = event.target.value;
            if (!id) {
                box.innerHTML = emptyState('เลือกประกาศ', 'Revision จะถูกบันทึกเมื่อแก้ไขผ่าน PATCH API');
                return;
            }
            box.innerHTML = '<div class="adm2-loading"><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div></div>';
            try {
                const data = await api(`/api/admin/announcements/${encodeURIComponent(id)}/revisions`);
                const list = data.list || [];
                box.innerHTML = list.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>เวลา</th><th>Admin</th><th>Action</th><th>Old value</th><th>New value</th></tr></thead><tbody>${list.map((rev) => `<tr><td>${esc(formatDate(rev.createdAt))}</td><td>${esc(rev.changedBy || 'admin')}</td><td>${esc(rev.action || 'updated')}</td><td><code>${esc(truncateJson(rev.oldValue))}</code></td><td><code>${esc(truncateJson(rev.newValue))}</code></td></tr>`).join('')}</tbody></table></div>` : emptyState('ยังไม่มี Revision', 'ประกาศนี้ยังไม่เคยถูกแก้ไข');
            } catch (error) {
                box.innerHTML = errorState('โหลด Revision ไม่สำเร็จ', error.message);
            }
        });
    }

    // Studio is rebuilt wholesale for image-3 layout.

    function bindRichEditor(rte) {
        const body = rte.querySelector('.adm2-rte-body');
        const toolbar = rte.querySelector('.adm2-rte-toolbar');
        toolbar.addEventListener('mousedown', (event) => {
            if (event.target.closest('button')) event.preventDefault();
        });
        toolbar.addEventListener('click', async (event) => {
            const btn = event.target.closest('button');
            if (!btn) return;
            body.focus();
            if (btn.dataset.cmd) document.execCommand(btn.dataset.cmd, false, null);
            if (btn.hasAttribute('data-rte-check')) document.execCommand('insertHTML', false, '<p>☐ รายการตรวจสอบ</p>');
            if (btn.hasAttribute('data-rte-quote')) document.execCommand('formatBlock', false, 'blockquote');
            if (btn.hasAttribute('data-rte-code')) document.execCommand('formatBlock', false, 'pre');
            if (btn.hasAttribute('data-rte-divider')) document.execCommand('insertHorizontalRule', false, null);
            if (btn.hasAttribute('data-rte-link')) {
                const url = await promptText('ใส่ URL ลิงก์', 'https://');
                if (url) document.execCommand('createLink', false, url);
            }
            if (btn.hasAttribute('data-rte-emoji')) toggleEmojiPicker(btn);
            if (btn.hasAttribute('data-rte-sticker')) toggleStickerPicker(btn);
            syncRichEditor();
            if (!btn.hasAttribute('data-rte-emoji') && !btn.hasAttribute('data-rte-sticker')) {
                refreshAnnouncementPreview();
            }
        });
        toolbar.querySelector('[data-rte-block]')?.addEventListener('change', (event) => {
            body.focus();
            document.execCommand('formatBlock', false, event.target.value);
            syncRichEditor();
            refreshAnnouncementPreview();
        });
        body.addEventListener('input', () => {
            syncRichEditor();
            refreshAnnouncementPreview();
        });
        body.addEventListener('paste', (event) => {
            event.preventDefault();
            const text = event.clipboardData?.getData('text/plain') || '';
            document.execCommand('insertText', false, text);
            syncRichEditor();
            refreshAnnouncementPreview();
        });
    }

    function syncRichEditor() {
        const body = document.getElementById('adm2AnnouncementEditor');
        const hidden = document.getElementById('announceMessageInput');
        if (body && hidden) hidden.value = (body.innerText || '').trim();
    }

    async function promptText(label, value) {
        if (typeof global.tcPrompt === 'function') return global.tcPrompt(label, { value: value || '' });
        return global.prompt(label, value || '');
    }

    function sanitizeHtml(html) {
        try {
            const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
            const root = doc.body?.firstElementChild;
            if (!root) return '';
            const walk = (node) => {
                [...node.children].forEach((child) => {
                    if (!ALLOWED_TAGS.has(child.tagName)) {
                        walk(child);
                        child.replaceWith(...child.childNodes);
                        return;
                    }
                    [...child.attributes].forEach((attr) => {
                        const name = attr.name.toLowerCase();
                        const allowed = (child.tagName === 'A' && name === 'href') ||
                            (child.tagName === 'IMG' && ['src', 'alt'].includes(name)) ||
                            name === 'data-sticker';
                        if (!allowed) child.removeAttribute(attr.name);
                    });
                    if (child.tagName === 'A') {
                        const href = child.getAttribute('href') || '';
                        if (!/^(https?:|mailto:)/i.test(href)) child.removeAttribute('href');
                        else {
                            child.setAttribute('target', '_blank');
                            child.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                    if (child.tagName === 'IMG') {
                        const src = child.getAttribute('src') || '';
                        if (!/^(https?:|data:image\/(png|jpeg|gif|webp))/i.test(src)) child.remove();
                    }
                    walk(child);
                });
            };
            walk(root);
            return root.innerHTML || '';
        } catch (_) {
            return '';
        }
    }

    function positionPicker(picker, anchor) {
        if (!picker || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(330, window.innerWidth - 24);
        const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
        let top = rect.bottom + 8;
        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        picker.style.width = `${width}px`;
        requestAnimationFrame(() => {
            const h = picker.offsetHeight || 320;
            if (top + h > window.innerHeight - 12) {
                top = Math.max(12, rect.top - h - 8);
                picker.style.top = `${top}px`;
            }
        });
    }

    function toggleEmojiPicker(anchor) {
        const existing = document.getElementById('adm2EmojiPicker');
        if (existing) {
            closePickers();
            return;
        }
        closePickers();
        const picker = document.createElement('div');
        picker.className = 'adm2-picker';
        picker.id = 'adm2EmojiPicker';
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-label', 'เลือก Emoji');
        picker.innerHTML = `<div class="adm2-picker-head"><input class="adm2-picker-search" type="search" placeholder="ค้นหา Emoji..." aria-label="ค้นหา Emoji"><button type="button" class="adm2-picker-close" data-picker-close aria-label="ปิด">✕</button></div>
            <div class="adm2-picker-tabs">${Object.keys(EMOJI).map((key) => `<button type="button" data-emoji-cat="${key}" class="${key === state.emojiCategory ? 'active' : ''}" title="${key}">${key === 'recent' ? '🕘' : key === 'favorites' ? '⭐' : (EMOJI[key][0] || '•')}</button>`).join('')}</div>
            <div class="adm2-picker-grid"></div>`;
        document.body.appendChild(picker);
        positionPicker(picker, anchor);
        picker.querySelector('[data-picker-close]')?.addEventListener('click', closePickers);
        picker.querySelector('.adm2-picker-search').addEventListener('input', (e) => {
            state.emojiSearch = e.target.value.trim();
            renderEmojiGrid();
        });
        picker.querySelector('.adm2-picker-tabs').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-emoji-cat]');
            if (!btn) return;
            state.emojiCategory = btn.dataset.emojiCat;
            picker.querySelectorAll('[data-emoji-cat]').forEach((x) => x.classList.toggle('active', x === btn));
            renderEmojiGrid();
        });
        renderEmojiGrid();
        picker.querySelector('.adm2-picker-search')?.focus();
    }

    function renderEmojiGrid() {
        const picker = document.getElementById('adm2EmojiPicker');
        const grid = picker?.querySelector('.adm2-picker-grid');
        if (!grid) return;
        let list = EMOJI[state.emojiCategory] || [];
        if (state.emojiSearch) {
            list = Object.values(EMOJI).flat().filter((item) => item.includes(state.emojiSearch));
        }
        if (!list.length && state.emojiCategory === 'recent') list = EMOJI.favorites;
        grid.innerHTML = [...new Set(list)].map((emoji) => `<button type="button" data-emoji="${esc(emoji)}">${emoji}</button>`).join('');
        grid.onclick = (event) => {
            const btn = event.target.closest('[data-emoji]');
            if (!btn) return;
            insertIntoEditor(btn.dataset.emoji);
            EMOJI.recent = [btn.dataset.emoji, ...EMOJI.recent.filter((x) => x !== btn.dataset.emoji)].slice(0, 24);
            closePickers();
        };
    }

    function toggleStickerPicker(anchor) {
        const existing = document.getElementById('adm2StickerPicker');
        if (existing) {
            closePickers();
            return;
        }
        closePickers();
        const picker = document.createElement('div');
        picker.className = 'adm2-picker';
        picker.id = 'adm2StickerPicker';
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-label', 'เลือก Sticker');
        picker.innerHTML = `<div class="adm2-picker-head"><strong style="flex:1;color:#ddd;font-size:.68rem">Stickers / GIF</strong><button type="button" class="adm2-picker-close" data-picker-close aria-label="ปิด">✕</button></div>
            <div class="adm2-picker-tabs"><button type="button" class="active">Stickers</button><button type="button">GIF URL</button></div>
            <div class="adm2-picker-grid">${STICKERS.map((sticker) => `<button type="button" data-sticker="${sticker}" style="font-size:24px">${sticker}</button>`).join('')}</div>
            <div class="adm2-picker-head" style="margin-top:8px"><input class="adm2-picker-search" id="adm2GifUrl" type="url" placeholder="วาง URL รูป GIF / WEBP"><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2InsertGif">แทรก</button></div>`;
        document.body.appendChild(picker);
        positionPicker(picker, anchor);
        picker.querySelector('[data-picker-close]')?.addEventListener('click', closePickers);
        picker.querySelector('.adm2-picker-grid').onclick = (event) => {
            const btn = event.target.closest('[data-sticker]');
            if (!btn) return;
            insertIntoEditor(btn.dataset.sticker);
            closePickers();
        };
        picker.querySelector('#adm2InsertGif').onclick = () => {
            const url = picker.querySelector('#adm2GifUrl').value.trim();
            if (!/^https?:\/\/.+\.(gif|webp)(\?.*)?$/i.test(url)) {
                showToast('warning', 'URL ไม่ถูกต้อง', 'รองรับ URL ไฟล์ GIF หรือ WEBP ผ่าน HTTPS');
                return;
            }
            insertIntoEditor(`<img src="${esc(url)}" alt="GIF">`, true);
            closePickers();
        };
    }

    function closePickers() {
        document.querySelectorAll('#adm2EmojiPicker,#adm2StickerPicker').forEach((node) => node.remove());
    }

    function insertIntoEditor(content, html) {
        const editor = document.getElementById('adm2AnnouncementEditor');
        if (!editor) return;
        editor.focus();
        document.execCommand(html ? 'insertHTML' : 'insertText', false, content);
        syncRichEditor();
        refreshAnnouncementPreview();
    }

    function processAnnouncementMedia(file) {
        const allowed = ['image/png','image/jpeg','image/gif','image/webp'];
        if (!allowed.includes(file.type)) {
            showToast('error', 'ไฟล์ไม่รองรับ', 'รองรับ PNG, JPG, JPEG, GIF และ WEBP');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('error', 'ไฟล์ใหญ่เกินไป', 'ขนาดสูงสุด 5 MB');
            return;
        }
        const progress = document.querySelector('.adm2-upload-progress i');
        if (progress) progress.style.width = '25%';
        const reader = new FileReader();
        reader.onprogress = (event) => {
            if (progress && event.lengthComputable) progress.style.width = `${Math.round((event.loaded / event.total) * 90)}%`;
        };
        reader.onload = () => {
            state.mediaDataUrl = String(reader.result || '');
            state.mediaAssetId = '';
            state.mediaName = file.name;
            if (progress) progress.style.width = '100%';
            const previewWrap = document.getElementById('announceImagePreview');
            const previewImg = document.getElementById('announceImagePreviewImg');
            if (previewWrap && previewImg) {
                previewImg.src = state.mediaDataUrl;
                previewWrap.style.display = 'block';
            }
            refreshAnnouncementPreview();
            setTimeout(() => { if (progress) progress.style.width = '0'; }, 700);
        };
        reader.onerror = () => {
            if (progress) progress.style.width = '0';
            showToast('error', 'อ่านไฟล์ไม่สำเร็จ', 'กรุณาลองเลือกไฟล์อีกครั้ง');
        };
        reader.readAsDataURL(file);
    }

    function addCta() {
        if (state.ctas.length >= 3) {
            showToast('warning', 'เพิ่ม CTA ไม่ได้', 'ประกาศรองรับสูงสุด 3 ปุ่ม');
            return;
        }
        state.ctas.push({ label: '', url: '', style: 'primary', icon: '' });
        renderCtas();
    }

    function renderCtas() {
        const list = document.getElementById('adm2CtaList');
        if (!list) return;
        list.innerHTML = state.ctas.map((cta, index) => `<div class="adm2-cta-row" data-cta-index="${index}">
            <input type="text" value="${esc(cta.label)}" placeholder="ข้อความปุ่ม" maxlength="40" data-cta-field="label">
            <input type="url" value="${esc(cta.url)}" placeholder="https://..." data-cta-field="url">
            <select data-cta-field="style"><option value="primary" ${cta.style === 'primary' ? 'selected' : ''}>Primary</option><option value="secondary" ${cta.style === 'secondary' ? 'selected' : ''}>Secondary</option><option value="danger" ${cta.style === 'danger' ? 'selected' : ''}>Danger</option></select>
            <button type="button" class="admin-btn admin-btn-danger" data-remove-cta="${index}" aria-label="ลบ CTA">×</button>
        </div>`).join('');
        list.oninput = (event) => {
            const row = event.target.closest('[data-cta-index]');
            const field = event.target.dataset.ctaField;
            if (!row || !field) return;
            state.ctas[Number(row.dataset.ctaIndex)][field] = event.target.value;
            syncLegacyCta();
            refreshAnnouncementPreview();
        };
        list.onchange = list.oninput;
        list.onclick = (event) => {
            const button = event.target.closest('[data-remove-cta]');
            if (!button) return;
            state.ctas.splice(Number(button.dataset.removeCta), 1);
            renderCtas();
            syncLegacyCta();
            refreshAnnouncementPreview();
        };
        syncLegacyCta();
    }

    function syncLegacyCta() {
        const first = state.ctas[0] || {};
        const label = document.getElementById('announceCtaLabelInput');
        const url = document.getElementById('announceCtaUrlInput');
        if (label) label.value = first.label || '';
        if (url) url.value = first.url || '';
    }

    function collectAnnouncementPayload(statusOverride) {
        syncRichEditor();
        const editorEl = document.getElementById('adm2AnnouncementEditor');
        const rich = sanitizeHtml(editorEl?.innerHTML || '');
        const title = document.getElementById('announceTitleInput')?.value.trim() || '';
        const summary = document.getElementById('announceSummaryInput')?.value.trim() || '';
        const message = document.getElementById('announceMessageInput')?.value.trim()
            || (editorEl?.innerText || '').trim()
            || '';
        const statusSelect = document.getElementById('adm2AnnStatus')?.value || 'published';
        const publishAtRaw = document.getElementById('adm2PublishAt')?.value || '';
        const expireAtRaw = document.getElementById('adm2ExpireAt')?.value || '';
        const audienceRadio = document.querySelector('input[name="adm2AudienceRadio"]:checked')?.value;
        const audience = audienceRadio || document.getElementById('adm2Audience')?.value || 'all';
        const select = document.getElementById('adm2Audience');
        if (select) select.value = audience;
        return {
            title,
            summary,
            message,
            contentHtml: rich,
            category: document.getElementById('announceCategoryInput')?.value || 'notice',
            important: !!document.getElementById('announceImportantToggle')?.checked,
            imageUrl: state.mediaDataUrl || null,
            ctaLabel: state.ctas[0]?.label || '',
            ctaUrl: state.ctas[0]?.url || '',
            ctaButtons: state.ctas.filter((x) => x.label).slice(0, 3),
            status: statusOverride || statusSelect,
            audience,
            audienceConfig: ['group', 'custom'].includes(audience) ? (document.getElementById('adm2AudienceConfig')?.value || '') : '',
            publishAt: publishAtRaw ? new Date(publishAtRaw).toISOString() : null,
            expireAt: expireAtRaw ? new Date(expireAtRaw).toISOString() : null,
            timezone: document.getElementById('adm2Timezone')?.value || 'Asia/Bangkok',
            displayHome: !!document.getElementById('adm2DisplayHome')?.checked,
            showNotification: !!document.getElementById('adm2ShowNotification')?.checked,
            pinned: !!document.getElementById('adm2Pinned')?.checked,
            showPopup: !!document.getElementById('adm2ShowPopup')?.checked,
            displayType: document.getElementById('adm2ShowPopup')?.checked ? 'popup' : 'notice'
        };
    }

    function refreshAnnouncementPreview() {
        const box = document.getElementById('adm2AnnouncementPreview');
        if (!box || box.dataset.rendering === '1') return;
        box.dataset.rendering = '1';
        try {
            const data = collectAnnouncementPayload();
            const categories = {
                update: 'อัปเดตระบบ', news: 'ข่าวสาร', promo: 'โปรโมชั่น', event: 'กิจกรรม',
                notice: 'แจ้งเตือน', maintenance: 'Maintenance', important: 'สำคัญ', other: 'อื่น ๆ'
            };
            box.classList.toggle('mobile', state.announcementMode === 'mobile');
            const styleMap = { primary: '', secondary: ' data-style="secondary"', danger: ' data-style="danger"' };
            const ctaSource = (data.ctaButtons || []).filter((x) => x.label).length
                ? data.ctaButtons.filter((x) => x.label)
                : [{ label: 'ดูรายละเอียด', style: 'primary' }];
            const ctas = ctaSource.map((cta) => `<span class="adm2-preview-cta"${styleMap[cta.style] || ''}>${esc(cta.icon || '')} ${esc(cta.label || 'ปุ่ม')}</span>`).join('');
            const media = data.imageUrl
                ? `<img class="adm2-preview-media" src="${esc(data.imageUrl)}" alt="">`
                : '';
            const richHtml = data.contentHtml && data.contentHtml.trim()
                ? sanitizeHtml(data.contentHtml)
                : `<p class="adm2-preview-placeholder">${esc(data.message || 'เนื้อหาประกาศจะแสดงแบบเรียลไทม์เมื่อพิมพ์')}</p>`;
            box.innerHTML = `
                <div class="adm2-preview-card-ui">
                    <div class="adm2-preview-meta-row">
                        <span class="adm2-preview-avatar">${icon('campaign')}</span>
                        <div>
                            <b>Announcement from Admin</b>
                            <small>เมื่อสักครู่ · ${esc(categories[data.category] || data.category)}</small>
                        </div>
                        ${data.pinned ? '<span class="adm2-status" data-status="published">PINNED</span>' : ''}
                    </div>
                    <h2>${esc(data.title || 'หัวข้อประกาศ')}</h2>
                    <p class="adm2-preview-summary">${esc(data.summary || 'สรุปสั้นของประกาศจะแสดงที่นี่')}</p>
                    <div class="adm2-preview-rich">${richHtml}</div>
                    ${media}
                    <div class="adm2-preview-ctas">${ctas}</div>
                    <footer class="adm2-preview-footer">
                        <span>👍 ❤️ 🎉 😮</span>
                        <span>↗ Share</span>
                    </footer>
                </div>`;
        } catch (err) {
            console.warn('[AdminCenterV2] preview', err);
            box.innerHTML = `<div class="adm2-preview-card-ui"><h2>ตัวอย่างประกาศ</h2><p class="adm2-preview-summary">ไม่สามารถเรนเดอร์พรีวิวได้ — ลองพิมพ์เนื้อหาอีกครั้ง</p></div>`;
        } finally {
            delete box.dataset.rendering;
        }
    }

    async function submitAnnouncement(status) {
        const payload = collectAnnouncementPayload(status);
        if (!payload.title || !payload.message) {
            showToast('error', 'ข้อมูลไม่ครบ', 'กรุณากรอกหัวข้อและเนื้อหาประกาศ');
            return;
        }
        if (payload.status === 'scheduled' && !payload.publishAt) {
            showToast('warning', 'ยังไม่ได้กำหนดเวลา', 'Scheduled announcement ต้องมี Publish Date/Time');
            return;
        }
        if (payload.expireAt && payload.publishAt && new Date(payload.expireAt) <= new Date(payload.publishAt)) {
            showToast('error', 'ช่วงเวลาไม่ถูกต้อง', 'เวลาหมดอายุต้องอยู่หลังเวลาเผยแพร่');
            return;
        }
        const ok = await confirmAction(payload.status === 'draft' ? 'บันทึกประกาศนี้เป็น Draft?' : 'ยืนยันเผยแพร่ประกาศนี้?', {
            title: payload.status === 'draft' ? 'Save Draft' : 'Publish Announcement',
            icon: payload.status === 'draft' ? '📝' : '📢',
            okLabel: payload.status === 'draft' ? 'บันทึก' : 'เผยแพร่'
        });
        if (!ok) return;
        try {
            if (state.mediaDataUrl.startsWith('data:image/') && !state.mediaAssetId) {
                const uploaded = await api('/api/assets/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl: state.mediaDataUrl })
                });
                state.mediaAssetId = uploaded.assetId || '';
                if (!state.mediaAssetId) throw new Error('อัปโหลดรูปไม่สำเร็จ: ไม่ได้รับ assetId');
                payload.imageUrl = typeof global.getCloudAssetUrl === 'function'
                    ? global.getCloudAssetUrl(state.mediaAssetId)
                    : `/api/assets/${encodeURIComponent(state.mediaAssetId)}`;
            }
            const editing = state.editingAnnouncementId;
            await api(editing ? `/api/admin/announcements/${encodeURIComponent(editing)}` : '/api/admin/announcements', {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('success', editing ? 'อัปเดตประกาศแล้ว' : (payload.status === 'draft' ? 'บันทึก Draft แล้ว' : 'เผยแพร่ประกาศแล้ว'), payload.title);
            recordActivity(editing ? 'แก้ไขประกาศ' : (payload.status === 'draft' ? 'บันทึก Draft' : 'เผยแพร่ประกาศ'), payload.title);
            resetAnnouncementForm();
            await loadAnnouncementManagement();
            switchAnnouncementPane('manage');
        } catch (error) {
            showToast('error', 'บันทึกประกาศไม่สำเร็จ', error.message);
            recordActivity('บันทึกประกาศล้มเหลว', payload.title, 'error');
        }
    }

    function resetAnnouncementForm() {
        ['announceTitleInput','announceSummaryInput','announceMessageInput','adm2AudienceConfig','adm2PublishAt','adm2ExpireAt'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const editor = document.getElementById('adm2AnnouncementEditor');
        if (editor) editor.innerHTML = '';
        state.ctas = [];
        state.mediaDataUrl = '';
        state.mediaAssetId = '';
        state.mediaName = '';
        state.editingAnnouncementId = null;
        addCta();
        const important = document.getElementById('announceImportantToggle');
        if (important) important.checked = false;
        refreshAnnouncementPreview();
    }

    async function loadAnnouncementManagement() {
        try {
            const data = await api('/api/admin/announcements');
            state.latestAnnouncements = data.list || [];
            updateAnnouncementBadge();
            loadCreatePaneStats();
            if (state.announcementTab === 'manage') renderAnnouncementManagement();
            if (state.announcementTab === 'analytics') renderAnnouncementAnalytics();
            if (state.announcementTab === 'templates') renderAnnouncementTemplates();
        } catch (error) {
            const pane = document.querySelector('[data-ann-pane="manage"]');
            if (pane) pane.innerHTML = `<div class="admin-card">${errorState('โหลดประกาศไม่สำเร็จ', error.message, 'AdminCenterV2.loadAnnouncementManagement()')}</div>`;
        }
    }

    function updateAnnouncementBadge() {
        const btn = document.getElementById('adminTab-announce');
        if (!btn) return;
        let badge = btn.querySelector('.adm2-nav-badge');
        const drafts = state.latestAnnouncements.filter((a) => (a.status || 'published') === 'draft').length;
        if (!badge && drafts) {
            badge = document.createElement('span');
            badge.className = 'adm2-nav-badge';
            btn.appendChild(badge);
        }
        if (badge) {
            badge.textContent = drafts ? String(drafts) : '';
            badge.hidden = !drafts;
        }
    }

    function announcementStatus(item) {
        if (item.archivedAt || item.status === 'archived') return 'archived';
        if (item.expireAt && new Date(item.expireAt) <= new Date()) return 'expired';
        if (item.status === 'draft') return 'draft';
        if (item.status === 'scheduled' || (item.publishAt && new Date(item.publishAt) > new Date())) return 'scheduled';
        return 'published';
    }

    function renderAnnouncementManagement() {
        const pane = document.querySelector('[data-ann-pane="manage"]');
        if (!pane) return;
        const list = state.latestAnnouncements;
        pane.innerHTML = `<div class="admin-card">
            <div class="admin-card-title" style="justify-content:space-between"><span>จัดการประกาศ</span><button type="button" class="admin-btn admin-btn-accent admin-btn-sm" data-new-announcement>+ สร้างประกาศ</button></div>
            <div class="adm2-toolbar"><input type="search" class="adm2-search" id="adm2AnnSearch" placeholder="ค้นหาหัวข้อ เนื้อหา หรือผู้เขียน..."><select class="adm2-select" id="adm2AnnStatusFilter"><option value="all">ทุกสถานะ</option><option value="published">Published</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="expired">Expired</option><option value="archived">Archived</option></select><select class="adm2-select" id="adm2AnnCategoryFilter"><option value="all">ทุกหมวด</option><option value="update">อัปเดต</option><option value="feature">Feature</option><option value="alert">Alert</option><option value="news">ข่าวสาร</option><option value="promo">โปรโมชั่น</option><option value="event">กิจกรรม</option><option value="notice">แจ้งเตือน</option><option value="maintenance">Maintenance</option></select><select class="adm2-select" id="adm2AnnDisplayFilter"><option value="all">ทุกรูปแบบ</option><option value="popup">Popup</option><option value="banner">Banner</option><option value="notice">Notice</option></select></div>
            <div class="admin-table-wrap"><table class="admin-table adm2-ann-table"><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Audience</th><th>Views / Reads</th><th>Published</th><th>Expire</th><th>Actions</th></tr></thead><tbody id="adm2AnnTableBody"></tbody></table></div>
        </div>`;
        pane.querySelector('[data-new-announcement]').onclick = () => switchAnnouncementPane('create');
        pane.querySelector('.adm2-toolbar').addEventListener('input', renderAnnouncementRows);
        renderAnnouncementRows();
    }

    function renderAnnouncementRows() {
        const body = document.getElementById('adm2AnnTableBody');
        if (!body) return;
        const q = (document.getElementById('adm2AnnSearch')?.value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('adm2AnnStatusFilter')?.value || 'all';
        const categoryFilter = document.getElementById('adm2AnnCategoryFilter')?.value || 'all';
        const displayFilter = document.getElementById('adm2AnnDisplayFilter')?.value || 'all';
        const list = state.latestAnnouncements.filter((a) => {
            const status = announcementStatus(a);
            const display = a.displayType || (a.showPopup ? 'popup' : 'notice');
            const text = `${a.title || ''} ${a.summary || ''} ${a.message || ''} ${a.createdBy || ''}`.toLowerCase();
            return (!q || text.includes(q)) && (statusFilter === 'all' || status === statusFilter) && (categoryFilter === 'all' || a.category === categoryFilter) && (displayFilter === 'all' || display === displayFilter);
        });
        if (!list.length) {
            body.innerHTML = `<tr><td colspan="8">${emptyState('ยังไม่มีประกาศ', 'สร้างประกาศแรกหรือเปลี่ยนตัวกรอง')}</td></tr>`;
            return;
        }
        body.innerHTML = list.map((a) => {
            const status = announcementStatus(a);
            const display = a.displayType || (a.showPopup ? 'popup' : 'notice');
            const type = a.announcementType || a.category || 'notice';
            return `<tr data-ann-id="${esc(a.id)}">
                <td><div class="adm2-ann-title"><b>${a.pinned ? '📌 ' : ''}${esc(a.title)}</b><small>${esc(a.summary || a.message || '')}</small></div></td>
                <td>${statusBadge(display, display)} ${statusBadge(type, type)}</td>
                <td>${statusBadge(status, status)}</td>
                <td>${esc(a.audience || 'all')}</td>
                <td>${Number(a.views || 0).toLocaleString()} / ${Number(a.reads || 0).toLocaleString()}</td>
                <td>${esc(formatDate(a.publishAt || a.createdAt))}</td>
                <td>${esc(formatDate(a.expireAt))}</td>
                <td><div class="admin-row-actions">
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-ann-action="view">ดู</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-ann-action="edit">Edit</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-ann-action="duplicate">Duplicate</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-ann-action="pin">${a.pinned ? 'Unpin' : 'Pin'}</button>
                    <button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-ann-action="archive">Archive</button>
                    <button type="button" class="admin-btn admin-btn-danger admin-btn-sm" data-ann-action="delete">ลบ</button>
                </div></td>
            </tr>`;
        }).join('');
        body.onclick = handleAnnouncementAction;
    }

    async function handleAnnouncementAction(event) {
        const button = event.target.closest('[data-ann-action]');
        const row = event.target.closest('[data-ann-id]');
        if (!button || !row) return;
        const item = state.latestAnnouncements.find((a) => String(a.id) === row.dataset.annId);
        if (!item) return;
        const action = button.dataset.annAction;
        if (action === 'view') {
            showAnnouncementDetail(item);
            return;
        }
        if (action === 'edit') {
            if (item.displayType === 'popup' || item.showPopup || item.popupConfig) {
                switchAnnouncementPane('popup');
                mountPopupEditor(item);
                return;
            }
            state.editingAnnouncementId = item.id;
            populateAnnouncementForm(item);
            switchAnnouncementPane('create');
            return;
        }
        if (action === 'duplicate') {
            if (item.displayType === 'popup' || item.showPopup || item.popupConfig) {
                switchAnnouncementPane('popup');
                mountPopupEditor({ ...item, id: null, title: `${item.title || ''} (Copy)`, status: 'draft' });
                return;
            }
            state.editingAnnouncementId = null;
            populateAnnouncementForm({ ...item, title: `${item.title} (Copy)`, status: 'draft' });
            switchAnnouncementPane('create');
            return;
        }
        if (action === 'delete') {
            const ok = await confirmAction(`ลบประกาศ “${item.title}” ถาวร?`, { title: 'ลบประกาศ', icon: '🗑️', okLabel: 'ลบ' });
            if (!ok) return;
            try {
                await api(`/api/admin/announcements/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
                recordActivity('ลบประกาศ', item.title);
                await loadAnnouncementManagement();
                renderAnnouncementManagement();
            } catch (error) { showToast('error', 'ลบไม่สำเร็จ', error.message); }
            return;
        }
        const patch = action === 'pin'
            ? { pinned: !item.pinned }
            : { status: 'archived', archived: true };
        try {
            await api(`/api/admin/announcements/${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            recordActivity(action === 'pin' ? (item.pinned ? 'Unpin ประกาศ' : 'Pin ประกาศ') : 'Archive ประกาศ', item.title);
            await loadAnnouncementManagement();
            renderAnnouncementManagement();
        } catch (error) {
            showToast('error', 'อัปเดตประกาศไม่สำเร็จ', error.message);
        }
    }

    function showAnnouncementDetail(item) {
        const body = `<div style="text-align:left">
            ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin-bottom:12px">` : ''}
            <div style="color:#a78bfa;font-size:.7rem">${esc(item.category || 'notice')} · ${esc(announcementStatus(item))}</div>
            <h3 style="margin:5px 0;color:#fff">${esc(item.title)}</h3>
            <p style="color:#aaa;white-space:pre-wrap">${esc(item.message || '')}</p>
        </div>`;
        if (typeof global.showCenterModal === 'function') {
            global.showCenterModal('info', 'รายละเอียดประกาศ', body, '<button type="button" class="center-modal-btn" onclick="closeCenterModal()">ปิด</button>');
        }
    }

    function populateAnnouncementForm(item) {
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
        set('announceTitleInput', item.title);
        set('announceSummaryInput', item.summary);
        set('announceMessageInput', item.message);
        set('announceCategoryInput', item.category || 'notice');
        const editor = document.getElementById('adm2AnnouncementEditor');
        if (editor) editor.innerHTML = sanitizeHtml(item.contentHtml || `<p>${esc(item.message || '')}</p>`);
        state.mediaDataUrl = item.imageUrl || '';
        state.mediaAssetId = item.imageUrl ? 'existing' : '';
        try {
            state.ctas = Array.isArray(item.ctaButtons)
                ? item.ctaButtons.slice(0, 3)
                : JSON.parse(item.ctaButtons || '[]');
        } catch (_) { state.ctas = []; }
        if (!state.ctas.length && item.ctaLabel) state.ctas = [{ label: item.ctaLabel, url: item.ctaUrl || '', style: 'primary', icon: '' }];
        if (!state.ctas.length) state.ctas = [{ label: '', url: '', style: 'primary', icon: '' }];
        renderCtas();
        refreshAnnouncementPreview();
    }

    function renderAnnouncementAnalytics() {
        const pane = document.querySelector('[data-ann-pane="analytics"]');
        if (!pane) return;
        const totals = state.latestAnnouncements.reduce((sum, a) => {
            sum.views += Number(a.views || 0);
            sum.reads += Number(a.reads || 0);
            sum.reactions += Number(a.reactions || 0);
            sum.shares += Number(a.shares || 0);
            sum.ctaClicks += Number(a.ctaClicks || 0);
            return sum;
        }, { views: 0, reads: 0, reactions: 0, shares: 0, ctaClicks: 0 });
        const readRate = totals.views ? Math.round((totals.reads / totals.views) * 100) : 0;
        pane.innerHTML = `<div class="adm-stat-row">
            ${statCard('adm2AnnViews', 'Total Views', 'visibility', 'cyan')}
            ${statCard('adm2AnnReads', 'Unique Reads', 'mark_email_read', 'green')}
            ${statCard('adm2AnnRate', 'Read Rate', 'percent', 'yellow')}
            ${statCard('adm2AnnReactions', 'Reactions', 'favorite', 'pink')}
            ${statCard('adm2AnnShares', 'Shares', 'share', '')}
            ${statCard('adm2AnnClicks', 'CTA Clicks', 'ads_click', 'cyan')}
        </div>
        <div class="adm2-overview-grid"><section class="adm2-analytics-card"><div class="adm2-card-head"><div><h3>Announcement Performance</h3><p>ข้อมูลสะสมจาก event tracking ที่ backend รองรับ</p></div><div class="adm2-range"><button class="active">Today</button><button>7 Days</button><button>30 Days</button><button>Custom</button></div></div><div class="adm2-chart">${renderBars([
            { label: 'Views', value: totals.views }, { label: 'Reads', value: totals.reads }, { label: 'React', value: totals.reactions }, { label: 'CTA', value: totals.ctaClicks }
        ])}</div></section><section class="adm2-analytics-card">${emptyState('ยังไม่มี Time-series API', 'แสดงยอดสะสมจริงได้แล้ว ส่วนกราฟตามวันต้องใช้ event timestamp จาก backend')}</section></div>`;
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        set('adm2AnnViews', totals.views.toLocaleString());
        set('adm2AnnReads', totals.reads.toLocaleString());
        set('adm2AnnRate', `${readRate}%`);
        set('adm2AnnReactions', totals.reactions.toLocaleString());
        set('adm2AnnShares', totals.shares.toLocaleString());
        set('adm2AnnClicks', totals.ctaClicks.toLocaleString());
    }

    async function renderAnnouncementRevisions() {
        const pane = document.querySelector('[data-ann-pane="history"]');
        if (!pane) return;
        pane.innerHTML = `<div class="admin-card"><div class="admin-card-title">Revision History</div>
            <div class="adm2-toolbar"><select class="adm2-select" id="adm2RevisionAnnouncement"><option value="">เลือกประกาศ...</option>${state.latestAnnouncements.map((a) => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}</select></div>
            <div id="adm2RevisionList">${emptyState('เลือกประกาศ', 'Revision จะถูกบันทึกเมื่อแก้ไขผ่าน PATCH API')}</div>
        </div>`;
        pane.querySelector('#adm2RevisionAnnouncement')?.addEventListener('change', async (event) => {
            const box = document.getElementById('adm2RevisionList');
            const id = event.target.value;
            if (!id) {
                box.innerHTML = emptyState('เลือกประกาศ', 'Revision จะถูกบันทึกเมื่อแก้ไขผ่าน PATCH API');
                return;
            }
            box.innerHTML = '<div class="adm2-loading"><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div></div>';
            try {
                const data = await api(`/api/admin/announcements/${encodeURIComponent(id)}/revisions`);
                const list = data.list || [];
                box.innerHTML = list.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>เวลา</th><th>Admin</th><th>Action</th><th>Old value</th><th>New value</th></tr></thead><tbody>${list.map((rev) => `<tr><td>${esc(formatDate(rev.createdAt))}</td><td>${esc(rev.changedBy || 'admin')}</td><td>${esc(rev.action || 'updated')}</td><td><code>${esc(truncateJson(rev.oldValue))}</code></td><td><code>${esc(truncateJson(rev.newValue))}</code></td></tr>`).join('')}</tbody></table></div>` : emptyState('ยังไม่มี Revision', 'ประกาศนี้ยังไม่เคยถูกแก้ไข');
            } catch (error) {
                box.innerHTML = errorState('โหลด Revision ไม่สำเร็จ', error.message);
            }
        });
    }

    function truncateJson(value) {
        if (!value) return '—';
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return text.length > 180 ? `${text.slice(0, 180)}…` : text;
    }

    const ACHIEVEMENT_ICONS = [
        'workspace_premium', 'emoji_events', 'military_tech', 'stars', 'star', 'favorite',
        'groups', 'person_add', 'videocam', 'live_tv', 'schedule', 'visibility',
        'card_giftcard', 'redeem', 'diamond', 'loyalty', 'local_fire_department', 'bolt',
        'rocket_launch', 'sports_esports', 'handshake', 'verified', 'celebration', 'whatshot'
    ];

    const ACHIEVEMENT_TRIGGERS = [
        ['manual', 'กำหนดเอง / มอบด้วยมือ'],
        ['live_hours', 'ชั่วโมงไลฟ์สตรีมรวม'],
        ['friends_count', 'จำนวนเพื่อนในระบบ'],
        ['gifts_received', 'จำนวนของขวัญที่ได้รับ'],
        ['pro_subscriptions', 'จำนวนครั้งสมัครสมาชิก PRO'],
        ['account_age', 'ระยะเวลาใช้งานระบบ']
    ];

    function triggerLabel(type) {
        return ACHIEVEMENT_TRIGGERS.find((item) => item[0] === type)?.[1] || type || 'manual';
    }

    function triggerSummary(item) {
        const type = item.triggerType || 'manual';
        if (type === 'manual') return 'มอบด้วยมือ / ไม่มีเงื่อนไขอัตโนมัติ';
        const value = Number(item.triggerValue) || 0;
        const unit = item.triggerUnit || '';
        if (type === 'live_hours') return `ไลฟ์ครบ ${value} ชั่วโมง`;
        if (type === 'friends_count') return `มีเพื่อนครบ ${value} คน`;
        if (type === 'gifts_received') return `ได้รับของขวัญครบ ${value} ชิ้น`;
        if (type === 'pro_subscriptions') return `สมัคร PRO ครบ ${value} ครั้ง`;
        if (type === 'account_age') {
            const unitLabel = unit === 'year' ? 'ปี' : unit === 'month' ? 'เดือน' : 'วัน';
            return `ใช้งานระบบครบ ${value} ${unitLabel}`;
        }
        return `${triggerLabel(type)} ≥ ${value}`;
    }

    async function loadAchievements() {
        try {
            const data = await api('/api/admin/achievements');
            state.achievements = data.achievements || [];
            return state.achievements;
        } catch (err) {
            // fallback: force local origin if cloud rewrite somehow still hits
            if (String(err.message || '').includes('404')) {
                const token = localStorage.getItem('pandy_token');
                const res = await fetch(`${location.origin}/api/admin/achievements`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                state.achievements = data.achievements || [];
                return state.achievements;
            }
            throw err;
        }
    }

    async function loadAchievementUnlocks(id) {
        const data = await api(`/api/admin/achievements/${encodeURIComponent(id)}/unlocks`);
        state.achievementUnlockTarget = data.achievement || null;
        state.achievementUnlocks = data.unlocks || [];
        return state.achievementUnlocks;
    }

    function achievementFormHtml(item) {
        const editing = !!item;
        const icon = state.selectedAchievementIcon || item?.icon || 'workspace_premium';
        const triggerType = item?.triggerType || 'manual';
        const needsUnit = triggerType === 'account_age';
        const needsValue = triggerType !== 'manual';
        return `<form id="adm2AchievementForm" class="adm2-ach-form" data-edit-id="${esc(item?.id || '')}">
            <div class="adm2-ach-form-grid">
                <div class="adm2-form-field">
                    <label for="adm2AchName">ชื่อความสำเร็จ</label>
                    <input id="adm2AchName" class="adm2-search" type="text" maxlength="80" required value="${esc(item?.name || '')}" placeholder="เช่น People Magnet">
                </div>
                <div class="adm2-form-field">
                    <label for="adm2AchPoints">คะแนน (XP/Points)</label>
                    <input id="adm2AchPoints" class="adm2-search" type="number" min="0" step="1" value="${esc(item?.points ?? 100)}">
                </div>
                <div class="adm2-form-field full">
                    <label for="adm2AchDesc">คำอธิบาย</label>
                    <textarea id="adm2AchDesc" class="adm2-search adm2-ach-textarea" rows="3" maxlength="280" placeholder="อธิบายเงื่อนไขหรือความหมายของความสำเร็จ">${esc(item?.description || '')}</textarea>
                </div>
            </div>
            <div class="adm2-form-field">
                <label>เลือกไอคอน</label>
                <div class="adm2-ach-icons" id="adm2AchIconGrid" role="listbox" aria-label="ไอคอนความสำเร็จ">
                    ${ACHIEVEMENT_ICONS.map((name) => `<button type="button" class="adm2-ach-icon${icon === name ? ' selected' : ''}" data-ach-icon="${esc(name)}" title="${esc(name)}" aria-label="${esc(name)}"><span class="material-symbols-outlined">${esc(name)}</span></button>`).join('')}
                </div>
                <input type="hidden" id="adm2AchIcon" value="${esc(icon)}">
            </div>
            <div class="adm2-ach-trigger-box">
                <div class="adm2-card-head" style="margin-bottom:10px"><div><h3>เงื่อนไขขั้นสูง (Advanced Triggers)</h3><p>กำหนดประเภทและค่าตัวเลขเพื่อปลดล็อกอัตโนมัติ</p></div></div>
                <div class="adm2-ach-form-grid">
                    <div class="adm2-form-field">
                        <label for="adm2AchTriggerType">ประเภทเงื่อนไข</label>
                        <select id="adm2AchTriggerType" class="adm2-select">
                            ${ACHIEVEMENT_TRIGGERS.map(([value, label]) => `<option value="${value}" ${triggerType === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="adm2-form-field" id="adm2AchValueWrap" ${needsValue ? '' : 'hidden'}>
                        <label for="adm2AchTriggerValue">ค่าตัวเลข</label>
                        <input id="adm2AchTriggerValue" class="adm2-search" type="number" min="0" step="1" value="${esc(item?.triggerValue ?? 1)}">
                    </div>
                    <div class="adm2-form-field" id="adm2AchUnitWrap" ${needsUnit ? '' : 'hidden'}>
                        <label for="adm2AchTriggerUnit">หน่วยเวลา</label>
                        <select id="adm2AchTriggerUnit" class="adm2-select">
                            <option value="day" ${item?.triggerUnit === 'day' ? 'selected' : ''}>วัน</option>
                            <option value="month" ${item?.triggerUnit === 'month' ? 'selected' : ''}>เดือน</option>
                            <option value="year" ${item?.triggerUnit === 'year' ? 'selected' : ''}>ปี</option>
                        </select>
                    </div>
                    <div class="adm2-form-field">
                        <label for="adm2AchActive">สถานะ</label>
                        <select id="adm2AchActive" class="adm2-select">
                            <option value="1" ${item?.active === 0 || item?.active === false ? '' : 'selected'}>เปิดใช้งาน</option>
                            <option value="0" ${item?.active === 0 || item?.active === false ? 'selected' : ''}>ปิดใช้งาน</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="adm2-form-actions">
                ${editing ? `<button type="button" class="admin-btn admin-btn-ghost" id="adm2AchCancelEdit">ยกเลิกแก้ไข</button>` : ''}
                <button type="submit" class="admin-btn admin-btn-primary">${editing ? 'บันทึกการแก้ไข' : 'สร้างความสำเร็จ'}</button>
            </div>
        </form>`;
    }

    function bindAchievementForm() {
        const form = document.getElementById('adm2AchievementForm');
        if (!form || form.dataset.bound) return;
        form.dataset.bound = '1';

        const syncTriggerUi = () => {
            const type = document.getElementById('adm2AchTriggerType')?.value || 'manual';
            const valueWrap = document.getElementById('adm2AchValueWrap');
            const unitWrap = document.getElementById('adm2AchUnitWrap');
            if (valueWrap) valueWrap.hidden = type === 'manual';
            if (unitWrap) unitWrap.hidden = type !== 'account_age';
        };

        form.querySelector('#adm2AchTriggerType')?.addEventListener('change', syncTriggerUi);
        form.querySelector('#adm2AchIconGrid')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ach-icon]');
            if (!btn) return;
            state.selectedAchievementIcon = btn.dataset.achIcon;
            form.querySelectorAll('[data-ach-icon]').forEach((el) => el.classList.toggle('selected', el === btn));
            const hidden = document.getElementById('adm2AchIcon');
            if (hidden) hidden.value = state.selectedAchievementIcon;
        });
        form.querySelector('#adm2AchCancelEdit')?.addEventListener('click', () => {
            state.editingAchievementId = null;
            state.selectedAchievementIcon = 'workspace_premium';
            renderAchievements();
        });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                name: document.getElementById('adm2AchName')?.value?.trim(),
                description: document.getElementById('adm2AchDesc')?.value?.trim() || '',
                icon: document.getElementById('adm2AchIcon')?.value || 'workspace_premium',
                points: Number(document.getElementById('adm2AchPoints')?.value) || 0,
                triggerType: document.getElementById('adm2AchTriggerType')?.value || 'manual',
                triggerValue: Number(document.getElementById('adm2AchTriggerValue')?.value) || 0,
                triggerUnit: document.getElementById('adm2AchTriggerUnit')?.value || '',
                active: document.getElementById('adm2AchActive')?.value !== '0'
            };
            try {
                if (state.editingAchievementId) {
                    await api(`/api/admin/achievements/${encodeURIComponent(state.editingAchievementId)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast('success', 'อัปเดตแล้ว', 'บันทึกความสำเร็จเรียบร้อย');
                    recordActivity('แก้ไขความสำเร็จ', payload.name);
                } else {
                    await api('/api/admin/achievements', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    showToast('success', 'สร้างแล้ว', 'เพิ่มความสำเร็จใหม่เรียบร้อย');
                    recordActivity('สร้างความสำเร็จ', payload.name);
                }
                state.editingAchievementId = null;
                state.selectedAchievementIcon = 'workspace_premium';
                await renderAchievements();
            } catch (error) {
                showToast('error', 'ไม่สำเร็จ', error.message || 'บันทึกความสำเร็จไม่สำเร็จ');
            }
        });
        syncTriggerUi();
    }

    async function renderAchievements() {
        const sec = document.getElementById('adminSec-achievements');
        if (!sec) return;
        sec.innerHTML = `<div class="adm2-loading"><div class="adm2-skeleton" style="width:100%"></div><div class="adm2-skeleton" style="width:100%"></div></div>`;
        try {
            await loadAchievements();
        } catch (error) {
            sec.innerHTML = `<div class="admin-card">${emptyState('โหลดความสำเร็จไม่สำเร็จ', error.message || 'ตรวจสอบสิทธิ์แอดมินและการเชื่อมต่อ Cloud')}</div>`;
            return;
        }
        const editing = state.achievements.find((item) => item.id === state.editingAchievementId) || null;
        if (editing) state.selectedAchievementIcon = editing.icon || 'workspace_premium';
        const unlockTarget = state.achievementUnlockTarget;
        const unlocks = state.achievementUnlocks || [];
        sec.innerHTML = `<div class="adm2-ach-layout">
            <section class="admin-card">
                <div class="admin-card-title"><span>${editing ? 'แก้ไขความสำเร็จ' : 'สร้างความสำเร็จใหม่'}</span></div>
                ${achievementFormHtml(editing)}
            </section>
            <section class="admin-card">
                <div class="admin-card-title" style="justify-content:space-between">
                    <span>รายการความสำเร็จ (${state.achievements.length})</span>
                    <button type="button" class="admin-btn admin-btn-ghost" id="adm2AchRefresh">${icon('refresh')} รีเฟรช</button>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-table">
                        <thead><tr><th>ไอคอน</th><th>ชื่อ</th><th>เงื่อนไข</th><th>ปลดล็อก</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                        <tbody>
                            ${state.achievements.length ? state.achievements.map((item) => `<tr>
                                <td><span class="adm2-ach-table-icon material-symbols-outlined">${esc(item.icon || 'workspace_premium')}</span></td>
                                <td><b>${esc(item.name)}</b><div class="adm2-muted">${esc(item.description || '—')}</div></td>
                                <td>${esc(triggerSummary(item))}</td>
                                <td>${Number(item.unlockCount || 0).toLocaleString('th-TH')}</td>
                                <td>${statusBadge(item.active === 0 || item.active === false ? 'archived' : 'published', item.active === 0 || item.active === false ? 'ปิด' : 'เปิด')}</td>
                                <td class="adm2-ach-actions">
                                    <button type="button" class="admin-btn admin-btn-ghost" data-ach-edit="${esc(item.id)}">แก้ไข</button>
                                    <button type="button" class="admin-btn admin-btn-ghost" data-ach-logs="${esc(item.id)}">Tracking</button>
                                    <button type="button" class="admin-btn admin-btn-ghost" data-ach-delete="${esc(item.id)}">ลบ</button>
                                </td>
                            </tr>`).join('') : `<tr><td colspan="6">${emptyState('ยังไม่มีความสำเร็จ', 'สร้างรายการแรกจากฟอร์มด้านบน')}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
            <section class="admin-card adm2-ach-logs">
                <div class="admin-card-title" style="justify-content:space-between">
                    <span>Tracking & Logs ${unlockTarget ? `· ${esc(unlockTarget.name)}` : ''}</span>
                    ${unlockTarget ? `<button type="button" class="admin-btn admin-btn-ghost" id="adm2AchClearLogs">ล้างการเลือก</button>` : ''}
                </div>
                <div class="adm2-ach-eval" style="display:flex;gap:8px;align-items:center;margin:0 0 12px;flex-wrap:wrap">
                    <input type="text" id="adm2AchEvalUserId" class="admin-input" placeholder="User ID สำหรับ Evaluate" style="min-width:220px;flex:1">
                    <button type="button" class="admin-btn" id="adm2AchEvaluate">Evaluate</button>
                </div>
                ${!unlockTarget
                    ? emptyState('เลือกความสำเร็จเพื่อดู Tracking', 'กดปุ่ม Tracking ในตารางเพื่อดูผู้ใช้ที่ปลดล็อกแล้ว')
                    : `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ผู้ใช้</th><th>User ID</th><th>Progress</th><th>ปลดล็อกเมื่อ</th></tr></thead><tbody>
                        ${unlocks.length ? unlocks.map((row) => `<tr>
                            <td><div class="adm2-ach-user"><img src="${esc(row.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(row.username || row.userId)}`)}" alt=""><div><b>${esc(row.displayName || row.username || 'User')}</b><small>@${esc(row.username || '—')}</small></div></div></td>
                            <td>${esc(row.userId)}</td>
                            <td>${esc(row.progress ?? 100)}%</td>
                            <td>${esc(formatDate(row.unlockedAt))}</td>
                        </tr>`).join('') : `<tr><td colspan="4">${emptyState('ยังไม่มีผู้ปลดล็อก', 'เมื่อมีผู้ใช้ทำเงื่อนไขสำเร็จ รายชื่อจะแสดงที่นี่')}</td></tr>`}
                    </tbody></table></div>`}
            </section>
        </div>`;

        bindAchievementForm();
        sec.querySelector('#adm2AchRefresh')?.addEventListener('click', () => renderAchievements());
        sec.querySelector('#adm2AchClearLogs')?.addEventListener('click', () => {
            state.achievementUnlockTarget = null;
            state.achievementUnlocks = [];
            renderAchievements();
        });
        sec.querySelector('#adm2AchEvaluate')?.addEventListener('click', async () => {
            const userId = String(sec.querySelector('#adm2AchEvalUserId')?.value || '').trim();
            if (!userId) {
                showToast('warning', 'ระบุ User ID', 'ใส่ User ID ที่ต้องการประเมินเงื่อนไขความสำเร็จ');
                return;
            }
            try {
                const result = await api(`/api/admin/achievements/evaluate/${encodeURIComponent(userId)}`, { method: 'POST', body: '{}' });
                const unlocked = Array.isArray(result?.unlocked) ? result.unlocked.length : 0;
                showToast('success', 'Evaluate สำเร็จ', `ปลดล็อกใหม่ ${unlocked} รายการ · ประเมิน ${result?.evaluated || 0} เงื่อนไข`);
                if (state.achievementUnlockTarget?.id) await loadAchievementUnlocks(state.achievementUnlockTarget.id);
                await renderAchievements();
            } catch (error) {
                showToast('error', 'Evaluate ไม่สำเร็จ', error.message || '');
            }
        });
        sec.querySelectorAll('[data-ach-edit]').forEach((btn) => btn.addEventListener('click', () => {
            state.editingAchievementId = btn.dataset.achEdit;
            const item = state.achievements.find((row) => row.id === state.editingAchievementId);
            state.selectedAchievementIcon = item?.icon || 'workspace_premium';
            renderAchievements();
        }));
        sec.querySelectorAll('[data-ach-logs]').forEach((btn) => btn.addEventListener('click', async () => {
            try {
                await loadAchievementUnlocks(btn.dataset.achLogs);
                await renderAchievements();
            } catch (error) {
                showToast('error', 'โหลด Tracking ไม่สำเร็จ', error.message || '');
            }
        }));
        sec.querySelectorAll('[data-ach-delete]').forEach((btn) => btn.addEventListener('click', async () => {
            const id = btn.dataset.achDelete;
            const item = state.achievements.find((row) => row.id === id);
            const ok = await confirmAction(`ลบความสำเร็จ "${item?.name || id}" ? ประวัติปลดล็อกจะถูกลบด้วย`, { danger: true });
            if (!ok) return;
            try {
                await api(`/api/admin/achievements/${encodeURIComponent(id)}`, { method: 'DELETE' });
                if (state.editingAchievementId === id) state.editingAchievementId = null;
                if (state.achievementUnlockTarget?.id === id) {
                    state.achievementUnlockTarget = null;
                    state.achievementUnlocks = [];
                }
                showToast('success', 'ลบแล้ว', 'ลบความสำเร็จเรียบร้อย');
                recordActivity('ลบความสำเร็จ', item?.name || id);
                await renderAchievements();
            } catch (error) {
                showToast('error', 'ลบไม่สำเร็จ', error.message || '');
            }
        }));
    }

    function renderFeatures() {
        const sec = document.getElementById('adminSec-features');
        if (!sec) return;
        const installed = [
            ['Game Center', 'sports_esports', 'เกมและระบบ Interactive', !!document.getElementById('gamecenterView')],
            ['Actions & Events', 'bolt', 'ระบบ trigger และ action', !!document.getElementById('actionseventsView')],
            ['Sound Alerts', 'notifications', 'ระบบแจ้งเตือนเสียง', !!document.getElementById('soundalertsView')],
            ['Overlay Studio', 'grid_view', 'เครื่องมือ Browser Source', !!document.getElementById('overlaysView')],
            ['Donation', 'volunteer_activism', 'ระบบโดเนทและ overlay', !!document.getElementById('donateView')],
            ['TikTok LIVE', 'music_note', 'Live connector และ event bridge', typeof global.connectTikTokLive === 'function']
        ];
        sec.innerHTML = `<div class="adm2-feature-grid">${installed.map(([name, ico, desc, enabled]) => `<article class="adm2-feature-card">
            <div class="adm2-feature-head"><span class="adm2-feature-icon">${icon(ico)}</span><div><h3>${esc(name)}</h3>${statusBadge(enabled ? 'published' : 'archived', enabled ? 'Installed' : 'Unavailable')}</div></div>
            <p>${esc(desc)}</p><div class="adm2-feature-meta"><span>ตรวจจาก runtime ปัจจุบัน</span><span>${enabled ? 'Enabled' : 'Disabled'}</span></div>
        </article>`).join('')}</div>
        <div class="admin-card" style="margin-top:12px">${emptyState('Feature toggle API ยังไม่มี', 'แสดงสถานะจากระบบจริงแบบ read-only เพื่อไม่สร้าง toggle ที่บันทึกไม่ได้')}</div>`;
    }

    function renderSettings() {
        const sec = document.getElementById('adminSec-settings');
        if (!sec) return;
        const cloud = localStorage.getItem('pandy_cloud_url') || 'Cloud default';
        const collapsed = localStorage.getItem('tc_admin_sidebar_collapsed') === '1';
        sec.innerHTML = `<div class="adm2-settings-list">
            <section class="admin-card adm2-settings-section"><h3>General</h3>
                <div class="adm2-settings-row"><div><b>App name</b><small>ชื่อระบบปัจจุบัน</small></div><span>TokControl</span></div>
                <div class="adm2-settings-row"><div><b>Version</b><small>จาก package/runtime</small></div><span id="adm2SettingsVersion">—</span></div>
                <div class="adm2-settings-row"><div><b>Timezone</b><small>ใช้กับ Schedule</small></div><span>Asia/Bangkok</span></div>
            </section>
            <section class="admin-card adm2-settings-section"><h3>Appearance</h3>
                <div class="adm2-settings-row"><div><b>Theme</b><small>TokControl Dark</small></div>${statusBadge('published', 'Dark')}</div>
                <div class="adm2-settings-row"><div><b>Accent</b><small>Primary color</small></div><span style="color:#a78bfa">Purple</span></div>
                <div class="adm2-settings-row"><div><b>Sidebar</b><small>บันทึกในเครื่องนี้</small></div><button type="button" class="admin-btn admin-btn-ghost" id="adm2ToggleAdminSidebar">${collapsed ? 'ขยาย' : 'พับ'}</button></div>
            </section>
            <section class="admin-card adm2-settings-section"><h3>Notifications</h3>
                <div class="adm2-settings-row"><div><b>Announcements</b><small>รับประกาศจาก Cloud</small></div>${statusBadge('published', 'Enabled')}</div>
                <div class="adm2-settings-row"><div><b>Payment</b><small>ตาม API ที่เชื่อมต่อ</small></div>${statusBadge('published', 'Enabled')}</div>
                <div class="adm2-settings-row"><div><b>Reports</b><small>แสดง badge รายงานเปิด</small></div>${statusBadge('published', 'Enabled')}</div>
            </section>
            <section class="admin-card adm2-settings-section"><h3>Security & API</h3>
                <div class="adm2-settings-row"><div><b>Admin access</b><small>ตรวจด้วย JWT + role</small></div>${statusBadge('published', 'Protected')}</div>
                <div class="adm2-settings-row"><div><b>Cloud URL</b><small>${esc(cloud)}</small></div><button type="button" class="admin-btn admin-btn-ghost" onclick="switchAdminTab('overview')">จัดการ</button></div>
                <div class="adm2-settings-row"><div><b>API key</b><small>ไม่เปิดเผยจาก client</small></div>${statusBadge('archived', 'Server only')}</div>
            </section>
        </div>`;
        sec.querySelector('#adm2ToggleAdminSidebar')?.addEventListener('click', () => document.querySelector('#adminView .adm2-collapse')?.click());
        fetch('/api/app/version').then((r) => r.json()).then((data) => {
            const el = document.getElementById('adm2SettingsVersion');
            if (el) el.textContent = data.version || data.buildVersion || '—';
        }).catch(() => {});
    }

    function renderActivity() {
        const sec = document.getElementById('adminSec-activity');
        if (!sec) return;
        const rows = state.sessionActivity;
        sec.innerHTML = `<div class="admin-card">
            <div class="admin-card-title" style="justify-content:space-between"><span>Admin Activity</span>${statusBadge('scheduled', 'Session only')}</div>
            <div class="adm2-toolbar"><input class="adm2-search" type="search" id="adm2ActivitySearch" placeholder="ค้นหา action หรือ target..."><select class="adm2-select"><option>ทุกสถานะ</option><option>Success</option><option>Error</option></select></div>
            <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Timestamp</th><th>Admin</th><th>Action</th><th>Target</th><th>IP</th><th>Status</th></tr></thead><tbody>${rows.length ? rows.map((item) => `<tr><td>${esc(item.at.toLocaleString('th-TH'))}</td><td>${esc(global.currentUser?.username || 'Admin')}</td><td>${esc(item.action)}</td><td>${esc(item.target)}</td><td>—</td><td>${statusBadge(item.status === 'error' ? 'archived' : 'published', item.status)}</td></tr>`).join('') : `<tr><td colspan="6">${emptyState('ยังไม่มี Activity', 'รายการนี้เป็นกิจกรรมจริงในเซสชันปัจจุบัน')}</td></tr>`}</tbody></table></div>
        </div>
        <div class="admin-card" style="margin-top:12px">${emptyState('Persistent Audit API ยังไม่มี', 'IP, revision และ audit ข้ามเซสชันจะไม่ถูกสมมติขึ้นจนกว่า backend จะรองรับ')}</div>`;
    }

    async function renderApi() {
        const sec = document.getElementById('adminSec-api');
        if (!sec) return;
        const endpoints = [
            ['GET', '/api/admin/overview', 'Admin overview'],
            ['GET', '/api/admin/payments', 'Payment orders'],
            ['GET', '/api/admin/announcements', 'Announcement CMS'],
            ['GET', '/api/admin/bug-reports', 'Reports'],
            ['GET', '/api/admin/promo/list', 'Promo codes'],
            ['GET', '/api/features', 'Feature flags']
        ];
        sec.innerHTML = `<div class="admin-card"><div class="admin-card-title" style="justify-content:space-between"><span>API Health</span><button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" id="adm2TestApi">ทดสอบทั้งหมด</button></div><div id="adm2EndpointList">${endpoints.map(([method, path, desc]) => `<div class="adm2-endpoint" data-endpoint="${esc(path)}"><span class="adm2-method">${method}</span><div><code>${esc(path)}</code><small style="display:block;color:#555;font-size:.52rem">${esc(desc)}</small></div>${statusBadge('scheduled', 'Not tested')}</div>`).join('')}</div></div>
        <div class="admin-card" style="margin-top:12px"><div class="admin-card-title">Webhook</div>${emptyState('Webhook management API ยังไม่มี', 'ไม่แสดง API key หรือสร้าง webhook ปลอมจาก client')}</div>`;
        sec.querySelector('#adm2TestApi').onclick = async () => {
            for (const row of sec.querySelectorAll('[data-endpoint]')) {
                const badge = row.querySelector('.adm2-status');
                badge.dataset.status = 'scheduled';
                badge.textContent = 'Testing';
                try {
                    await api(row.dataset.endpoint);
                    badge.dataset.status = 'published';
                    badge.textContent = 'OK';
                } catch (error) {
                    badge.dataset.status = 'archived';
                    badge.textContent = error.message.includes('404') ? 'Unavailable' : 'Error';
                }
            }
        };
    }

    function renderHelp() {
        const sec = document.getElementById('adminSec-help');
        if (!sec) return;
        sec.innerHTML = `<div class="adm2-settings-list">
            <section class="admin-card adm2-settings-section"><h3>เริ่มต้นใช้งาน</h3><div class="adm2-settings-row"><div><b>Dashboard</b><small>ตรวจ KPI และสถานะระบบ</small></div>${icon('chevron_right')}</div><div class="adm2-settings-row"><div><b>Members</b><small>จัดการสิทธิ์ PRO และ Game Pass</small></div>${icon('chevron_right')}</div><div class="adm2-settings-row"><div><b>Announcements</b><small>สร้าง Draft, Schedule และ Publish</small></div>${icon('chevron_right')}</div></section>
            <section class="admin-card adm2-settings-section"><h3>Support</h3><div class="adm2-settings-row"><div><b>Discord</b><small>TokControl Community</small></div><button type="button" class="admin-btn admin-btn-ghost" onclick="window.open('https://discord.gg/pandyapp','_blank')">เปิด</button></div><div class="adm2-settings-row"><div><b>Download Center</b><small>เวอร์ชันล่าสุด</small></div><button type="button" class="admin-btn admin-btn-ghost" onclick="openDownloadPage()">เปิด</button></div><div class="adm2-settings-row"><div><b>Report issue</b><small>ส่งรายงานผ่านระบบเดิม</small></div><button type="button" class="admin-btn admin-btn-ghost" onclick="openReportModal()">รายงาน</button></div></section>
        </div>`;
    }

    function formatDate(value) {
        if (!value) return '—';
        try { return new Date(value).toLocaleString('th-TH'); } catch (_) { return '—'; }
    }

    function bindGlobalAccessibility() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closePickers();
        });
        document.addEventListener('pointerdown', (event) => {
            const picker = document.getElementById('adm2EmojiPicker') || document.getElementById('adm2StickerPicker');
            if (!picker) return;
            if (picker.contains(event.target)) return;
            if (event.target.closest('[data-rte-emoji],[data-rte-sticker]')) return;
            closePickers();
        }, true);
        window.addEventListener('resize', () => closePickers());
    }

    function init() {
        if (state.initialized) return;
        const root = document.getElementById('adminView');
        if (!root) return;
        state.initialized = true;
        addStylesheet();
        enhanceSidebar();
        ensureManagementSections();
        installTabRouter();
        enhanceOverview();
        bindGlobalAccessibility();
        recordActivity('เริ่ม Admin Center', 'TokControl Admin Center v2');
    }

    global.AdminCenterV2 = {
        init,
        state,
        statCard,
        statusBadge,
        emptyState,
        sanitizeHtml,
        loadOverviewExtras,
        loadAnnouncementManagement,
        collectAnnouncementPayload,
        refreshAnnouncementPreview,
        switchAnnouncementPane,
        mountPopupEditor,
        renderAnnouncementManagement,
        renderAnnouncementAnalytics,
        recordActivity
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window);
