/**
 * TokDonate dashboard — HappyDonate-inspired full shell (lazy-loaded)
 */
(function () {
    'use strict';

    const TAB_META = {
        overview: { title: 'แดชบอร์ด', sub: 'สรุปยอด · จำนวนโดเนท · ผู้เข้าชม' },
        profile: { title: 'โปรไฟล์ของฉัน', sub: 'Bio · โซเชียล · สถานะ Online' },
        links: { title: 'ลิงก์สาธารณะ', sub: 'slug · คัดลอก · QR · พรีวิว' },
        widgets: { title: 'วิดเจ็ต OBS', sub: 'แจ้งเตือน · เป้าหมาย · ผู้สนับสนุน' },
        settings: { title: 'ช่องทางรับเงิน', sub: 'PromptPay · ชื่อบัญชี · ยอดขั้นต่ำ' },
        history: { title: 'ประวัติการรับเงิน', sub: 'รายการ verified / rejected' }
    };

    const SECTIONS = ['overview', 'profile', 'links', 'widgets', 'settings', 'history'];
    let lastPublicUrl = '';
    let cachedUrls = {};
    let toastTimer = null;
    let lastToastKey = '';
    let lastToastAt = 0;
    let authFailed = false;
    let slugCheckTimer = null;
    let slugAvailable = true;

    /** รับ token จาก URL (เปิดจาก desktop / deep link) แล้วเก็บ localStorage */
    function captureTokenFromUrl() {
        try {
            const params = new URLSearchParams(location.search || '');
            let token =
                params.get('token') ||
                params.get('access_token') ||
                params.get('auth') ||
                '';
            if (!token && location.hash) {
                const hash = location.hash.replace(/^#/, '');
                const hp = new URLSearchParams(hash.includes('=') ? hash : '');
                token = hp.get('token') || hp.get('access_token') || '';
                if (!token && hash.startsWith('token=')) token = decodeURIComponent(hash.slice(6));
            }
            if (token) {
                localStorage.setItem('pandy_token', token);
                try {
                    const clean =
                        location.pathname +
                        (location.hash && !location.hash.includes('token') ? location.hash : '');
                    history.replaceState({}, '', clean || location.pathname);
                } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    }

    function getAuthToken() {
        captureTokenFromUrl();
        return (
            (typeof localStorage !== 'undefined' && localStorage.getItem('pandy_token')) ||
            (window.currentUser && window.currentUser.token) ||
            ''
        );
    }

    function authHeaders() {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        return headers;
    }

    /**
     * Donate APIs ใช้ local Electron server เป็นหลัก
     * Authorization: Bearer <pandy_token> ทุกครั้ง
     */
    async function api(path, opts) {
        const headers = { ...authHeaders(), ...(opts && opts.headers) };
        const init = { ...opts, headers };
        const rawFetch = window.fetch;

        if (!headers.Authorization) {
            throw new Error('กรุณาเข้าสู่ระบบ');
        }

        let res;
        try {
            res = await rawFetch(path, init);
        } catch (netErr) {
            throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจว่า TokControl เปิดอยู่');
        }

        if (res.status === 404 && typeof path === 'string' && path.startsWith('/api/donate')) {
            const origin = (typeof location !== 'undefined' && location.origin) || '';
            if (origin) {
                try {
                    res = await rawFetch(origin + path, init);
                } catch (e) { /* keep */ }
            }
            if (res.status === 404 && typeof resolveTokControlServerUrl === 'function') {
                const cloud = resolveTokControlServerUrl().replace(/\/$/, '');
                if (cloud && cloud !== origin) {
                    try {
                        res = await rawFetch(cloud + path, init);
                    } catch (e) { /* keep */ }
                }
            }
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 401) authFailed = true;
            const msg =
                data.error ||
                (res.status === 404
                    ? 'ไม่พบ API โดเนท (HTTP 404) — รีสตาร์ทแอป'
                    : res.status === 401
                      ? 'กรุณาเข้าสู่ระบบ'
                      : res.status === 409
                        ? data.error || 'ชื่อลิงก์นี้ถูกใช้แล้ว'
                        : 'HTTP ' + res.status);
            throw new Error(msg);
        }
        authFailed = false;
        return data;
    }

    function money(n) {
        return '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    }

    function $(id) {
        return document.getElementById(id);
    }

    function setVal(id, v) {
        const el = $(id);
        if (el) el.value = v == null ? '' : String(v);
    }

    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    function setMsg(id, text, isErr) {
        const el = $(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isErr && !!text);
        el.classList.toggle('is-ok', !isErr && !!text);
    }

    function toast(message, type) {
        const key = String(type || '') + '|' + String(message || '');
        const now = Date.now();
        if (key === lastToastKey && now - lastToastAt < 2500) {
            setMsg('donateSettingsMsg', message, type === 'error');
            return;
        }
        lastToastKey = key;
        lastToastAt = now;

        let host = $('donateToastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'donateToastHost';
            host.className = 'hd-toast-host';
            const main = document.querySelector('.hd-main');
            if (main) main.appendChild(host);
            else document.body.appendChild(host);
        }
        const el = document.createElement('div');
        el.className = 'hd-toast-pop' + (type === 'error' ? ' is-error' : type === 'ok' ? ' is-ok' : '');
        el.textContent = message;
        host.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 280);
        }, 2800);
        setMsg('donateSettingsMsg', message, type === 'error');
        if (type !== 'error') setMsg('donateStatsMsg', '', false);
    }

    function setBusy(btnOrId, busy, labelBusy) {
        const el = typeof btnOrId === 'string' ? $(btnOrId) : btnOrId;
        if (!el) return;
        if (busy) {
            if (!el.dataset.label) el.dataset.label = el.textContent;
            el.disabled = true;
            el.classList.add('is-loading');
            el.textContent = labelBusy || 'กำลังบันทึก…';
        } else {
            el.disabled = false;
            el.classList.remove('is-loading');
            if (el.dataset.label) el.textContent = el.dataset.label;
        }
    }

    function switchDonateTab(tab) {
        const key = TAB_META[tab] ? tab : 'overview';
        document.querySelectorAll('.hd-nav-item').forEach((el) => {
            el.classList.toggle('active', el.dataset.tab === key);
        });
        SECTIONS.forEach((name) => {
            const sec = $('donateSec' + name.charAt(0).toUpperCase() + name.slice(1));
            if (sec) sec.style.display = name === key ? '' : 'none';
        });
        const meta = TAB_META[key];
        setText('donatePageTitle', meta.title);
        setText('donatePageSub', meta.sub);
        if (authFailed) return;
        if (key === 'overview') {
            loadSettings().then((ok) => {
                if (ok) loadStats();
            });
        } else if (key === 'history') {
            loadStats();
        } else {
            loadSettings();
        }
    }

    function syncProfileFields(s) {
        setVal('donateBio', s.bio);
        setVal('donateBioProfile', s.bio);
        setVal('donateSocialYoutube', s.socialYoutube);
        setVal('donateSocialYoutubeP', s.socialYoutube);
        setVal('donateSocialTiktok', s.socialTiktok);
        setVal('donateSocialTiktokP', s.socialTiktok);
        setVal('donateSocialFacebook', s.socialFacebook);
        setVal('donateSocialFacebookP', s.socialFacebook);
        setVal('donateSocialDiscord', s.socialDiscord);
        setVal('donateSocialDiscordP', s.socialDiscord);
        setVal('donatePageOnline', s.pageOnline === false ? '0' : '1');
        setVal('donatePageOnlineP', s.pageOnline === false ? '0' : '1');
    }

    function displayShareHost(urls, slug) {
        const publicUrl = urls.donatePublic || urls.donate || '';
        if (publicUrl) {
            return publicUrl.replace(/^https?:\/\//, '');
        }
        return 'www.tokcontrol.com/donate/' + (slug || '…');
    }

    function renderChecklist(list) {
        const el = $('donateChecklist');
        if (!el) return;
        const items = list || [];
        el.innerHTML = items.length
            ? items
                  .map(
                      (c) =>
                          '<li class="' +
                          (c.done ? 'done' : '') +
                          '"><span class="hd-check">' +
                          (c.done ? '✓' : '○') +
                          '</span><span>' +
                          escapeHtml(c.label) +
                          '</span></li>'
                  )
                  .join('')
            : '<li>กำลังโหลด…</li>';
    }

    function renderLinkCards(urls) {
        const wrap = $('donateLinkCards');
        if (!wrap) return;
        const cards = [
            { title: 'หน้าโดเนทสาธารณะ', desc: 'แชร์ให้ผู้ชมโอนเงิน', url: urls.donate, id: 'cardDonate' },
            { title: 'แจ้งเตือน OBS', desc: 'Browser Source แจ้งเตือน', url: urls.alert, id: 'cardAlert' },
            { title: 'แถบเป้าหมาย', desc: 'Browser Source Goal', url: urls.goal, id: 'cardGoal' },
            { title: 'โดเนทล่าสุด', desc: 'Recent donors', url: urls.recent, id: 'cardRecent' },
            { title: 'ลีดเดอร์บอร์ด', desc: 'Top Donors', url: urls.leaderboard, id: 'cardLb' }
        ];
        wrap.innerHTML = cards
            .map(
                (c) =>
                    '<div class="hd-widget-card"><h3>' +
                    escapeHtml(c.title) +
                    '</h3><p>' +
                    escapeHtml(c.desc) +
                    '</p><div class="hd-link-pill"><input id="' +
                    c.id +
                    '" type="text" readonly value="' +
                    escapeAttr(c.url || '') +
                    '" /><button type="button" class="hd-btn hd-btn-sm" onclick="donateCopyField(\'' +
                    c.id +
                    '\')">คัดลอก</button></div></div>'
            )
            .join('');
    }

    async function loadSettings() {
        try {
            const data = await api('/api/donate/settings');
            const s = data.settings || {};
            const urls = data.urls || {};
            cachedUrls = urls;
            lastPublicUrl = urls.donatePublic || urls.donate || urls.vanity || '';
            const baseDomain = urls.baseDomain || 'control.app';
            const shareHost = displayShareHost(urls, s.donationSlug);

            setVal('donatePromptpayId', s.promptpayId);
            setVal('donateAccountName', s.accountName);
            setVal('donateBankCode', s.bankCode || 'KBANK');
            setVal('donateMinDonation', s.minDonation);
            setVal('donateMinTts', s.minTtsAmount);
            setVal('donateGoalAmount', s.goalAmount);
            setVal('donateGoalLabel', s.goalLabel);
            syncProfileFields(s);
            setVal('donateSlug', s.donationSlug);
            setVal('donateOverlayKey', s.overlayKey);
            setSlugStatus('', '');
            setVal('donateUrlPublic', lastPublicUrl);
            setVal('donateUrlPublicOverview', lastPublicUrl);
            setVal('donateUrlOverlay', urls.overlay || urls.alert || '');
            setVal('donateUrlAlert', urls.alert || '');
            setVal('donateUrlGoal', urls.goal || '');
            setVal('donateUrlRecent', urls.recent || '');
            setVal('donateUrlLeaderboard', urls.leaderboard || '');

            setText('donateVanityDisplay', shareHost);
            setText('donateVanityOverview', shareHost);
            setText('donateSlugSuffix', '.' + baseDomain);
            setText(
                'donateSlugPreview',
                (urls.siteBase || '').replace(/^https?:\/\//, '') + '/donate/' + (s.donationSlug || 'your-name')
            );
            setText('donatePathFallback', urls.donatePath || '/donate/' + (s.donationSlug || ''));

            const sideName = (window.currentUser && (window.currentUser.displayName || window.currentUser.name)) || s.donationSlug || 'Streamer';
            setText('donateSideName', sideName);
            setText('donateSideHandle', '@' + (s.donationSlug || 'slug'));
            const av = $('donateSideAvatar');
            if (av && window.currentUser && window.currentUser.avatar) av.src = window.currentUser.avatar;
            else if (av && window.currentUser && window.currentUser.avatarUrl) av.src = window.currentUser.avatarUrl;

            renderChecklist(data.checklist);
            renderLinkCards(urls);
            setMsg('donateSettingsMsg', '', false);
            setMsg('donateStatsMsg', '', false);
            return true;
        } catch (e) {
            toast(e.message || 'โหลดตั้งค่าไม่สำเร็จ', 'error');
            return false;
        }
    }

    function readProfilePayload() {
        const bio = ($('donateBioProfile') && $('donateBioProfile').value) || ($('donateBio') && $('donateBio').value) || '';
        return {
            bio,
            social_youtube: ($('donateSocialYoutubeP') && $('donateSocialYoutubeP').value) || ($('donateSocialYoutube') && $('donateSocialYoutube').value) || '',
            social_tiktok: ($('donateSocialTiktokP') && $('donateSocialTiktokP').value) || ($('donateSocialTiktok') && $('donateSocialTiktok').value) || '',
            social_facebook: ($('donateSocialFacebookP') && $('donateSocialFacebookP').value) || ($('donateSocialFacebook') && $('donateSocialFacebook').value) || '',
            social_discord: ($('donateSocialDiscordP') && $('donateSocialDiscordP').value) || ($('donateSocialDiscord') && $('donateSocialDiscord').value) || '',
            page_online: (($('donatePageOnlineP') && $('donatePageOnlineP').value) || ($('donatePageOnline') && $('donatePageOnline').value) || '1') !== '0'
        };
    }

    async function saveSettings() {
        const btn = document.querySelector('#donateSecSettings .hd-btn-primary');
        setBusy(btn, true, 'กำลังบันทึก…');
        try {
            await api('/api/donate/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    promptpay_id: $('donatePromptpayId').value,
                    account_name: $('donateAccountName').value,
                    bank_code: $('donateBankCode').value,
                    min_donation: Number($('donateMinDonation').value),
                    min_tts_amount: Number($('donateMinTts').value),
                    goal_amount: Number($('donateGoalAmount').value),
                    goal_label: $('donateGoalLabel').value,
                    ...readProfilePayload()
                })
            });
            toast('บันทึกช่องทางรับเงินแล้ว', 'ok');
            await loadSettings();
        } catch (e) {
            toast(e.message || 'บันทึกไม่สำเร็จ', 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    async function saveProfile() {
        const btn = document.querySelector('#donateSecProfile .hd-btn-primary');
        setBusy(btn, true, 'กำลังบันทึก…');
        try {
            await api('/api/donate/settings', {
                method: 'PUT',
                body: JSON.stringify(readProfilePayload())
            });
            toast('บันทึกโปรไฟล์แล้ว', 'ok');
            await loadSettings();
        } catch (e) {
            toast(e.message || 'บันทึกไม่สำเร็จ', 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    async function regenOverlayKey() {
        if (!confirm('รีเซ็ต Overlay Key จะทำให้ลิงก์ OBS เดิมใช้ไม่ได้ ต้องการทำต่อหรือไม่?')) return;
        try {
            await api('/api/donate/settings/regen-overlay-key', { method: 'POST', body: '{}' });
            toast('รีเซ็ต Overlay Key แล้ว — คัดลอกลิงก์ใหม่ไปใส่ OBS', 'ok');
            await loadSettings();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    function setSlugStatus(text, kind) {
        const el = $('donateSlugStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('is-ok', 'is-error', 'is-wait');
        if (kind) el.classList.add(kind);
        slugAvailable = kind !== 'is-error';
    }

    function onSlugInput() {
        const input = $('donateSlug');
        let raw = (input && input.value) || '';
        if (raw.includes('_')) {
            raw = raw.replace(/_/g, '-');
            if (input) input.value = raw;
            setSlugStatus('แปลง "_" เป็น "-" แล้ว (DNS ห้ามใช้ขีดล่าง)', 'is-wait');
        }
        const preview = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'your-name';
        const host = ((cachedUrls && cachedUrls.siteBase) || location.origin || '')
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');
        setText('donateSlugPreview', host + '/donate/' + preview);
        clearTimeout(slugCheckTimer);
        if (!raw.trim()) {
            setSlugStatus('', '');
            return;
        }
        setSlugStatus('กำลังตรวจสอบชื่อ…', 'is-wait');
        slugCheckTimer = setTimeout(async () => {
            try {
                const check = await api('/api/donate/check-slug?slug=' + encodeURIComponent(raw.trim()));
                if (check.available) setSlugStatus('✓ ชื่อนี้ใช้ได้', 'is-ok');
                else setSlugStatus(check.error || 'ชื่อลิงก์นี้ถูกใช้แล้ว', 'is-error');
            } catch (e) {
                setSlugStatus(e.message || 'ตรวจชื่อไม่สำเร็จ', 'is-error');
            }
        }, 420);
    }

    function openBiolink() {
        const slug =
            ($('donateSlug') && $('donateSlug').value) ||
            (cachedUrls && cachedUrls.donatePublic && cachedUrls.donatePublic.split('/').pop()) ||
            (window.currentUser && (window.currentUser.name || window.currentUser.username)) ||
            'demo';
        const token = getAuthToken();
        const base = (location.origin || '').replace(/\/$/, '');
        const url =
            base +
            '/biolink/dashboard?u=' +
            encodeURIComponent(String(slug).replace(/_/g, '-')) +
            (token ? '&token=' + encodeURIComponent(token) : '');
        window.open(url, '_blank');
    }

    function openBiolinkPublic() {
        const slug =
            ($('donateSlug') && $('donateSlug').value) ||
            (cachedUrls && cachedUrls.donatePublic && cachedUrls.donatePublic.split('/').pop()) ||
            '';
        const local = (cachedUrls && cachedUrls.biolinkPublicLocal) ||
            (slug ? ((location.origin || '').replace(/\/$/, '') + '/biolink/u/' + encodeURIComponent(String(slug).replace(/_/g, '-'))) : '');
        const pub = cachedUrls && cachedUrls.biolinkPublic;
        const url = local || pub;
        if (!url) return toast('บันทึก slug ก่อน แล้วเปิดหน้า Bio ได้', 'error');
        window.open(url, '_blank');
    }

    function playPreview() {
        const el = $('donatePreviewAlert');
        if (!el) return;
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('play');
        toast('เล่นตัวอย่าง Alert แล้ว', 'ok');
        try {
            if (window.speechSynthesis) {
                const u = new SpeechSynthesisUtterance('ผู้โดเนทตัวอย่าง โดเนท 500 บาท ข้อความว่า ข้อความตัวอย่างจากผู้โดเนท');
                u.lang = 'th-TH';
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(u);
            }
        } catch (e) {}
    }

    async function regenSlug() {
        const btn = document.querySelector('#donateSecLinks .hd-slug-row .hd-btn-primary');
        let slug = ($('donateSlug').value || '').trim().replace(/_/g, '-');
        if ($('donateSlug')) $('donateSlug').value = slug;
        setBusy(btn, true, 'กำลังตรวจ…');
        try {
            if (slug) {
                const check = await api('/api/donate/check-slug?slug=' + encodeURIComponent(slug));
                if (check && check.available === false) {
                    setSlugStatus(check.error || 'ชื่อลิงก์นี้ถูกใช้แล้ว', 'is-error');
                    toast(check.error || 'ชื่อลิงก์นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น', 'error');
                    return;
                }
            }
            setBusy(btn, true, 'กำลังบันทึก…');
            await api('/api/donate/settings/regen-slug', {
                method: 'POST',
                body: JSON.stringify({ slug })
            });
            toast('บันทึกลิงก์โดเนทแล้ว', 'ok');
            setSlugStatus('✓ บันทึกแล้ว', 'is-ok');
            await loadSettings();
        } catch (e) {
            setSlugStatus(e.message, 'is-error');
            toast(e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    async function copyField(id) {
        const el = $(id);
        if (!el || !el.value) {
            toast('ยังไม่มีลิงก์ให้คัดลอก', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(el.value);
            toast('คัดลอกลิงก์แล้ว', 'ok');
        } catch (e) {
            el.select();
            document.execCommand('copy');
            toast('คัดลอกลิงก์แล้ว', 'ok');
        }
    }

    async function testAlert() {
        try {
            await api('/api/donate/test-alert', {
                method: 'POST',
                body: JSON.stringify({ amount: Number($('donateMinTts').value) || 50 })
            });
            toast('ส่งแจ้งเตือนทดสอบแล้ว — เปิด Browser Source เพื่อดู', 'ok');
            playPreview();
        } catch (e) {
            toast(e.message, 'error');
        }
    }

    function openPublicPage() {
        // พรีวิวในแอปใช้ path ท้องถิ่นเสมอ — ลิงก์แชร์เป็น tokcontrol.com
        let url = cachedUrls.donatePath || '';
        if (url && url.startsWith('/')) {
            url = (location.origin || '').replace(/\/$/, '') + url;
        }
        if (!url && lastPublicUrl) url = lastPublicUrl;
        if (url) window.open(url, '_blank');
        else toast('ยังไม่มีลิงก์ — บันทึก slug ในเมนูลิงก์สาธารณะก่อน', 'error');
    }

    function openOverlayPreview(kind) {
        const localMap = {
            alert: cachedUrls.alertLocal,
            goal: cachedUrls.goalLocal,
            recent: cachedUrls.recentLocal,
            leaderboard: cachedUrls.leaderboardLocal
        };
        // พรีวิวใช้ local ของแอป — ลิงก์คัดลอกเป็น tokcontrol.com
        let url = localMap[kind] || cachedUrls.alertLocal;
        if (!url) {
            const map = {
                alert: cachedUrls.alert,
                goal: cachedUrls.goal,
                recent: cachedUrls.recent,
                leaderboard: cachedUrls.leaderboard
            };
            url = map[kind] || cachedUrls.alert;
        }
        if (!url) return toast('ยังไม่มี slug — ไปสร้างลิงก์ก่อน', 'error');
        window.open(url, '_blank', 'width=900,height=500');
    }

    async function copyVanity() {
        const url = lastPublicUrl || cachedUrls.donate || '';
        if (!url) return toast('ยังไม่มีลิงก์', 'error');
        try {
            await navigator.clipboard.writeText(url);
            toast('คัดลอก ' + url.replace(/^https?:\/\//, '') + ' แล้ว', 'ok');
        } catch (e) {
            setVal('donateUrlPublic', url);
            copyField('donateUrlPublic');
        }
    }

    async function showLinkQr() {
        try {
            const data = await api('/api/donate/link-qr', {
                method: 'POST',
                body: JSON.stringify({ url: lastPublicUrl || cachedUrls.donate || '' })
            });
            const wrap = $('donateLinkQrWrap');
            const img = $('donateLinkQrImg');
            if (img) img.src = data.qrDataUrl;
            if (wrap) wrap.hidden = false;
            toast('สร้าง QR สำหรับแชร์ลิงก์แล้ว', 'ok');
            switchDonateTab('links');
        } catch (e) {
            toast(e.message || 'สร้าง QR ไม่สำเร็จ', 'error');
        }
    }

    async function loadStats() {
        if (authFailed) return false;
        try {
            const [stats, hist] = await Promise.all([
                api('/api/donate/stats'),
                api('/api/donate/history?limit=80')
            ]);
            setText('donateStatToday', money(stats.totals?.today));
            setText('donateStatWeek', money(stats.totals?.week));
            setText('donateStatMonth', money(stats.totals?.month));
            setText('donateStatAll', money(stats.totals?.all));
            setText('donateCountMonth', String(stats.counts?.month || 0));
            setText('donateCountAll', String(stats.counts?.all || 0));
            setText('donateVisitorsAll', String(stats.visitors?.all || 0));

            const goal = stats.goal || {};
            setText(
                'donateGoalText',
                (goal.label || 'เป้าหมาย') + ' — ' + money(goal.current) + ' / ' + money(goal.amount)
            );
            const fill = $('donateGoalFill');
            if (fill) fill.style.width = Math.min(100, Number(goal.percent) || 0) + '%';

            const leaders = $('donateLeaders');
            if (leaders) {
                const list = stats.topDonors || [];
                leaders.innerHTML = list.length
                    ? list
                          .map(
                              (d, i) =>
                                  '<li><span>' +
                                  (i + 1) +
                                  '. ' +
                                  escapeHtml(d.name) +
                                  '</span><strong>' +
                                  money(d.total) +
                                  '</strong></li>'
                          )
                          .join('')
                    : '<li style="opacity:.55">ยังไม่มีข้อมูล</li>';
            }

            const recent = $('donateRecentList');
            if (recent) {
                const list = stats.recent || [];
                recent.innerHTML = list.length
                    ? list
                          .map(
                              (d) =>
                                  '<li><div><strong>' +
                                  escapeHtml(d.donorName) +
                                  '</strong><span>' +
                                  escapeHtml(d.message || '') +
                                  '</span></div><em>' +
                                  money(d.amount) +
                                  '</em></li>'
                          )
                          .join('')
                    : '<li style="opacity:.55">ยังไม่มีการโดเนท</li>';
            }

            const tbody = $('donateHistoryBody');
            if (tbody) {
                const rows = hist.donations || [];
                tbody.innerHTML = rows.length
                    ? rows
                          .map(
                              (d) =>
                                  '<tr><td>' +
                                  escapeHtml(formatDate(d.createdAt)) +
                                  '</td><td>' +
                                  escapeHtml(d.donorName) +
                                  '</td><td>' +
                                  money(d.amount) +
                                  '</td><td>' +
                                  escapeHtml(d.message || '—') +
                                  '</td><td><span class="donate-status ' +
                                  escapeHtml(d.status) +
                                  '">' +
                                  escapeHtml(d.status) +
                                  '</span></td></tr>'
                          )
                          .join('')
                    : '<tr><td colspan="5" style="opacity:.65">ยังไม่มีประวัติ</td></tr>';
            }
            setMsg('donateStatsMsg', '', false);
            return true;
        } catch (e) {
            toast(e.message || 'โหลดสถิติไม่สำเร็จ', 'error');
            return false;
        }
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function formatDate(iso) {
        try {
            return new Date(iso).toLocaleString('th-TH');
        } catch (e) {
            return iso || '';
        }
    }

    async function initDonateUI() {
        captureTokenFromUrl();
        authFailed = false;
        lastToastKey = '';

        if (!(window.currentUser && window.currentUser.isLoggedIn) && !getAuthToken()) {
            if (typeof openLoginModal === 'function') openLoginModal();
            document.body.classList.remove('donate-mode');
            return;
        }
        document.body.classList.add('donate-mode');
        const hash = (location.hash || '').replace('#', '');
        if (hash === 'donate-stats' || hash === 'donate-history') switchDonateTab('history');
        else if (hash === 'donate-settings') switchDonateTab('settings');
        else if (hash === 'donate-links') switchDonateTab('links');
        else if (hash === 'donate-profile') switchDonateTab('profile');
        else if (hash === 'donate-widgets' || hash === 'donate-overlay') switchDonateTab('widgets');
        else switchDonateTab('overview');
    }

    function exitDonateDashboard() {
        document.body.classList.remove('donate-mode');
        if (typeof switchMainTab === 'function') switchMainTab('dashboard');
    }

    captureTokenFromUrl();

    window.initDonateUI = initDonateUI;
    window.exitDonateDashboard = exitDonateDashboard;
    window.switchDonateTab = switchDonateTab;
    window.donateSaveSettings = saveSettings;
    window.donateSaveProfile = saveProfile;
    window.donateRegenOverlayKey = regenOverlayKey;
    window.donateRegenSlug = regenSlug;
    window.donateCopyField = copyField;
    window.donateTestAlert = testAlert;
    window.donateRefreshStats = loadStats;
    window.donateOpenPublicPage = openPublicPage;
    window.donateCopyVanity = copyVanity;
    window.donateShowLinkQr = showLinkQr;
    window.donateOpenOverlayPreview = openOverlayPreview;
    window.donateOnSlugInput = onSlugInput;
    window.donatePlayPreview = playPreview;
    window.donateOpenBiolink = openBiolink;
    window.donateOpenBiolinkPublic = openBiolinkPublic;
})();
