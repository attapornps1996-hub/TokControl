/**
 * TokControl user bug-report workspace — uses existing /api/bug-reports + /api/assets/upload
 */
(function (global) {
    'use strict';

    const MAX_CHARS = 1000;
    const MAX_FILES = 6;
    const MAX_FILE_BYTES = 12 * 1024 * 1024;
    const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
    const FREQ_LABEL = {
        '': 'ไม่ระบุ',
        once: 'เกิดครั้งเดียว',
        sometimes: 'เกิดบางครั้ง',
        always: 'เกิดทุกครั้ง',
        unsure: 'ไม่แน่ใจ'
    };
    const LOCATIONS = [
        ['dashboard', 'Dashboard'],
        ['tiktok', 'TikTok LIVE'],
        ['credits', 'Stream Credits'],
        ['soundalerts', 'Sound Alerts'],
        ['soundboard', 'Soundboard'],
        ['actionsevents', 'Actions & Events'],
        ['songrequest', 'Song Request'],
        ['chatbot', 'AI Chatbot'],
        ['gamecontrol', 'Game Control'],
        ['gamelibrary', 'Game Library'],
        ['store', 'ร้านค้า'],
        ['profile', 'โปรไฟล์'],
        ['settings', 'การตั้งค่า'],
        ['other', 'อื่น ๆ']
    ];
    const NAV_TO_LOC = {
        dash: 'dashboard', dashboard: 'dashboard', vote: 'other', credits: 'credits',
        soundalerts: 'soundalerts', soundboard: 'soundboard', actionsevents: 'actionsevents', songrequest: 'songrequest',
        chatbot: 'chatbot', gamecontrol: 'gamecontrol', gamelibrary: 'gamelibrary',
        store: 'store', overlays: 'other', jar: 'other', channelpoints: 'other',
        win: 'other', timer: 'other', tts: 'other', pngtuber: 'other', camera: 'other',
        gacha: 'other', randomwin: 'other', airdrop: 'other', admin: 'settings'
    };

    let category = 'bug';
    let files = [];
    let lastFocus = null;
    let submitting = false;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function fmtSize(n) {
        const v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
        return (v / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function detectLocation() {
        const active = document.querySelector('.nav-item.active');
        const id = String(active?.id || '').replace(/^nav-/, '');
        return NAV_TO_LOC[id] || 'other';
    }

    let osLabel = '';

    function appVersionLabel() {
        const fromGlobal = String(global.APP_VERSION || '').trim();
        if (fromGlobal) return fromGlobal;
        const top = String($('topbarVersionLabel')?.textContent || '').replace(/^v/i, '').trim();
        if (top) return top;
        return String($('sidebarVersionLabel')?.textContent || '').replace(/^TokControl v/i, '').trim();
    }

    function detectOs() {
        if (osLabel) return osLabel;
        const ua = navigator.userAgent || '';
        const plat = navigator.userAgentData?.platform || '';
        if (/Windows/.test(ua) || plat === 'Windows') return 'Windows';
        if (/Mac OS X/.test(ua) || plat === 'macOS') return 'macOS';
        if (/Linux/.test(ua) || plat === 'Linux') return 'Linux';
        return plat || navigator.platform || '—';
    }

    function refreshOs() {
        const uaData = navigator.userAgentData;
        if (!uaData?.getHighEntropyValues) return;
        uaData.getHighEntropyValues(['platformVersion']).then((ua) => {
            const plat = uaData.platform || 'Windows';
            if (plat === 'Windows' && ua.platformVersion) {
                const major = parseInt(String(ua.platformVersion).split('.')[0], 10);
                osLabel = Number.isFinite(major) && major >= 13 ? 'Windows 11' : 'Windows 10';
            } else if (plat) osLabel = plat;
            renderSystem();
        }).catch(() => {});
    }

    function collectSystemInfo() {
        const loc = detectLocation();
        const locLabel = (LOCATIONS.find((x) => x[0] === loc) || [])[1] || loc;
        const ver = appVersionLabel();
        const cores = Number(navigator.hardwareConcurrency) || 0;
        const isDesk = /Electron/i.test(navigator.userAgent);
        const device = isDesk
            ? `Desktop${cores ? ` • ${cores} cores` : ''}`
            : `Browser • ${detectOs()}`;
        return {
            appVersion: ver,
            build: ver,
            os: detectOs(),
            runtime: device,
            userAgent: navigator.userAgent,
            screen: `${window.screen?.width || 0}×${window.screen?.height || 0}`,
            route: locLabel,
            timestamp: new Date().toISOString()
        };
    }

    function renderSystem() {
        const info = collectSystemInfo();
        const grid = $('rptSysGrid');
        if (!grid) return;
        const when = new Date(info.timestamp).toLocaleString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const rows = [
            ['เวอร์ชันแอป', info.appVersion || '—'],
            ['ระบบปฏิบัติการ', info.os || '—'],
            ['อุปกรณ์', info.runtime],
            ['วันที่และเวลา', when]
        ];
        grid.innerHTML = rows.map(([k, v]) => `<div class="rpt-sys-row">${esc(k)}<b>${esc(v)}</b></div>`).join('');
    }

    function setCategory(cat) {
        category = cat;
        document.querySelectorAll('.rpt-type').forEach((btn) => {
            btn.classList.toggle('is-on', btn.dataset.cat === cat);
            btn.setAttribute('aria-pressed', btn.dataset.cat === cat ? 'true' : 'false');
        });
    }

    function updateCounter() {
        const el = $('reportMessageInput');
        const count = $('rptCharCount');
        if (el && count) count.textContent = String((el.value || '').length);
        hideError();
    }

    function showError(msg) {
        const err = $('rptDescError');
        const ta = $('reportMessageInput');
        if (err) { err.textContent = msg; err.classList.add('show'); }
        if (ta) { ta.classList.add('is-error'); ta.setAttribute('aria-invalid', 'true'); }
    }
    function hideError() {
        $('rptDescError')?.classList.remove('show');
        const ta = $('reportMessageInput');
        if (ta) { ta.classList.remove('is-error'); ta.setAttribute('aria-invalid', 'false'); }
    }

    function renderFiles() {
        const box = $('rptFileList');
        if (!box) return;
        box.innerHTML = files.map((f, i) => {
            const url = f.previewUrl || '';
            const media = f.kind === 'video'
                ? `<video src="${esc(url)}" muted></video>`
                : `<img src="${esc(url)}" alt="">`;
            return `<div class="rpt-file${f.error ? ' is-bad' : ''}${f.kind === 'video' ? ' is-vid' : ''}">
                ${media}
                ${f.kind === 'video' ? '<span class="rpt-file-play">▶</span>' : ''}
                <button type="button" class="rpt-file-x" data-rm="${i}" aria-label="ลบไฟล์">×</button>
                <div class="rpt-file-meta">${esc(f.name)}<br>${esc(fmtSize(f.size))}${f.error ? '<br>' + esc(f.error) : ''}</div>
            </div>`;
        }).join('');
        box.querySelectorAll('[data-rm]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.rm);
                const item = files[idx];
                if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
                files.splice(idx, 1);
                renderFiles();
            });
        });
    }

    function addFiles(fileList) {
        [...fileList || []].forEach((file) => {
            if (files.length >= MAX_FILES) return;
            const mime = file.type || '';
            const item = { file, name: file.name, size: file.size, mime, kind: mime.startsWith('video/') ? 'video' : 'image', previewUrl: '', error: '' };
            if (!ACCEPT.includes(mime)) item.error = 'ชนิดไฟล์ไม่รองรับ';
            else if (file.size > MAX_FILE_BYTES) item.error = 'ไฟล์ใหญ่เกิน 12MB';
            else item.previewUrl = URL.createObjectURL(file);
            files.push(item);
        });
        renderFiles();
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
            reader.readAsDataURL(file);
        });
    }

    async function uploadAsset(dataUrl, mimeType, fileName) {
        const token = localStorage.getItem('pandy_token');
        const res = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ dataUrl, mimeType, fileName, purpose: 'report' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ');
        return { assetId: data.assetId, mime: data.mime || mimeType, name: fileName };
    }

    function closeDropdowns(except) {
        const keep = except?.getAttribute('data-dd') === 'freq' ? 'rptFrequencyMenu'
            : except?.getAttribute('data-dd') === 'loc' ? 'rptLocationMenu' : '';
        document.querySelectorAll('.rpt-dd').forEach((dd) => {
            if (except && dd === except) return;
            dd.classList.remove('is-open');
            const btn = dd.querySelector('.rpt-dd-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        ['rptFrequencyMenu', 'rptLocationMenu'].forEach((id) => {
            if (id === keep) return;
            const menu = $(id);
            if (!menu) return;
            menu.hidden = true;
            menu.classList.remove('is-open');
        });
    }

    function placeMenu(menu, btn) {
        if (!menu || !btn) return;
        document.body.appendChild(menu);
        menu.hidden = false;
        menu.classList.add('is-open');
        const r = btn.getBoundingClientRect();
        const maxH = 240;
        menu.style.position = 'fixed';
        menu.style.left = `${Math.max(8, r.left)}px`;
        menu.style.width = `${Math.max(r.width, 200)}px`;
        menu.style.zIndex = '40000';
        menu.style.maxHeight = `${maxH}px`;
        const below = window.innerHeight - r.bottom - 12;
        const openUp = below < 140 && r.top > below;
        if (openUp) {
            menu.style.top = 'auto';
            menu.style.bottom = `${window.innerHeight - r.top + 4}px`;
            menu.style.maxHeight = `${Math.min(maxH, r.top - 12)}px`;
        } else {
            menu.style.bottom = 'auto';
            menu.style.top = `${r.bottom + 4}px`;
            menu.style.maxHeight = `${Math.min(maxH, Math.max(120, below))}px`;
        }
    }

    function setDropdown(id, value) {
        const input = $(id);
        const dd = input?.closest('.rpt-dd');
        if (!input || !dd) return;
        input.value = value == null ? '' : value;
        const menuId = id === 'rptFrequency' ? 'rptFrequencyMenu' : 'rptLocationMenu';
        const menu = $(menuId);
        const opt = menu ? [...menu.querySelectorAll('.rpt-dd-opt')].find((el) => el.getAttribute('data-value') === String(value ?? '')) : null;
        const label = opt?.textContent?.trim() || (id === 'rptFrequency' ? FREQ_LABEL[value] : (LOCATIONS.find((x) => x[0] === value) || [])[1]) || 'ไม่ระบุ';
        const text = dd.querySelector('.rpt-dd-text');
        if (text) text.textContent = label;
        menu?.querySelectorAll('.rpt-dd-opt').forEach((el) => el.classList.toggle('is-on', el.getAttribute('data-value') === String(value ?? '')));
    }

    function toggleDropdown(dd) {
        const open = !dd.classList.contains('is-open');
        closeDropdowns(open ? dd : null);
        if (!open) return;
        dd.classList.add('is-open');
        const btn = dd.querySelector('.rpt-dd-btn');
        const menu = $(dd.getAttribute('data-dd') === 'freq' ? 'rptFrequencyMenu' : 'rptLocationMenu');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        placeMenu(menu, btn);
    }

    function trapFocus(e) {
        if (e.key !== 'Tab') return;
        const overlay = $('reportModalOverlay');
        if (!overlay?.classList.contains('active')) return;
        const nodes = [...overlay.querySelectorAll('button, textarea, select, input, [href]')].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function onKey(e) {
        if (e.key === 'Escape') {
            if (document.querySelector('.rpt-dd.is-open')) {
                e.stopPropagation();
                closeDropdowns();
                return;
            }
            close();
        }
        trapFocus(e);
    }

    function resetForm() {
        category = 'bug';
        files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        files = [];
        submitting = false;
        const msg = $('reportMessageInput');
        if (msg) msg.value = '';
        setDropdown('rptLocation', detectLocation());
        setDropdown('rptFrequency', '');
        $('rptSubmitBtn') && ($('rptSubmitBtn').disabled = false, $('rptSubmitBtn').textContent = '✈ ส่งรายงาน');
        $('rptFormView') && ($('rptFormView').hidden = false);
        $('rptSuccessView') && ($('rptSuccessView').hidden = true);
        hideError();
        setCategory('bug');
        updateCounter();
        renderFiles();
        renderSystem();
        closeDropdowns();
    }

    function open() {
        if (!global.currentUser?.isLoggedIn) {
            if (typeof global.showCustomMsg === 'function') {
                global.showCustomMsg('info', 'กรุณาเข้าสู่ระบบ', 'ต้องเข้าสู่ระบบก่อนส่งรายงาน');
            }
            if (typeof global.openLoginModal === 'function') global.openLoginModal();
            return;
        }
        lastFocus = document.activeElement;
        refreshOs();
        resetForm();
        const overlay = $('reportModalOverlay');
        overlay?.classList.add('active');
        overlay?.setAttribute('aria-hidden', 'false');
        setTimeout(() => $('reportMessageInput')?.focus(), 40);
        document.addEventListener('keydown', onKey);
    }

    function close() {
        closeDropdowns();
        $('reportModalOverlay')?.classList.remove('active');
        $('reportModalOverlay')?.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey);
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    async function submit() {
        if (submitting) return;
        const token = localStorage.getItem('pandy_token');
        if (!token) {
            open();
            return;
        }
        const message = String($('reportMessageInput')?.value || '').trim();
        if (message.length < 10) {
            showError('⚠ กรุณาอธิบายรายละเอียดปัญหาอย่างน้อย 10 ตัวอักษร');
            $('reportMessageInput')?.focus();
            return;
        }
        const validFiles = files.filter((f) => !f.error && f.file);
        submitting = true;
        const btn = $('rptSubmitBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังส่งรายงาน...'; }
        try {
            const attachments = [];
            for (const item of validFiles) {
                const dataUrl = await fileToDataUrl(item.file);
                const uploaded = await uploadAsset(dataUrl, item.mime, item.name);
                attachments.push({ ...uploaded, size: item.size });
            }
            const info = collectSystemInfo();
            const res = await fetch('/api/bug-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    category,
                    message: message.slice(0, MAX_CHARS),
                    screenshotAssetId: attachments[0]?.assetId || null,
                    attachments,
                    appVersion: info.appVersion,
                    location: $('rptLocation')?.value || info.route,
                    frequency: $('rptFrequency')?.value || '',
                    systemInfo: info,
                    title: message.split(/[\n.]/)[0].slice(0, 80)
                })
            });
            const raw = await res.text();
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch (_) {
                throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง');
            }
            if (!res.ok) throw new Error(data.error || 'ส่งรายงานไม่สำเร็จ');
            $('rptFormView').hidden = true;
            $('rptSuccessView').hidden = false;
            $('rptSuccessCode').textContent = data.reportCode ? `#${data.reportCode}` : (data.id != null ? `#RPT-${String(data.id).padStart(4, '0')}` : '');
            if (btn) btn.textContent = '✓ ส่งรายงานเรียบร้อยแล้ว';
        } catch (err) {
            submitting = false;
            if (btn) { btn.disabled = false; btn.textContent = '✈ ส่งรายงาน'; }
            if (typeof global.showCustomMsg === 'function') {
                global.showCustomMsg('error', 'ส่งไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาด');
            }
        }
    }

    function bind() {
        const overlay = $('reportModalOverlay');
        if (!overlay || overlay.dataset.rptBound) return;
        overlay.dataset.rptBound = '1';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelectorAll('.rpt-type').forEach((btn) => {
            btn.addEventListener('click', () => setCategory(btn.dataset.cat));
        });
        overlay.querySelectorAll('.rpt-dd').forEach((dd) => {
            dd.querySelector('.rpt-dd-btn')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleDropdown(dd);
            });
        });
        ['rptFrequencyMenu', 'rptLocationMenu'].forEach((menuId) => {
            $(menuId)?.querySelectorAll('.rpt-dd-opt').forEach((opt) => {
                opt.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const field = menuId === 'rptFrequencyMenu' ? 'rptFrequency' : 'rptLocation';
                    setDropdown(field, opt.getAttribute('data-value'));
                    closeDropdowns();
                });
            });
        });
        document.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.rpt-dd') || e.target.closest('.rpt-dd-menu')) return;
            closeDropdowns();
        });
        $('reportMessageInput')?.addEventListener('input', updateCounter);
        const drop = $('rptDrop');
        const input = $('reportImageInput');
        drop?.addEventListener('click', () => input?.click());
        drop?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
        });
        drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
        drop?.addEventListener('dragleave', () => drop.classList.remove('is-over'));
        drop?.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('is-over');
            addFiles(e.dataTransfer?.files);
        });
        input?.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
        $('rptSubmitBtn')?.addEventListener('click', submit);
        $('rptCancelBtn')?.addEventListener('click', close);
        $('rptCloseBtn')?.addEventListener('click', close);
        $('rptSuccessClose')?.addEventListener('click', close);
    }

    global.BugReportModal = { open, close, submit, setCategory };
    global.openReportModal = open;
    global.closeReportModal = close;
    global.setReportCategory = setCategory;
    global.submitBugReport = submit;
    global.handleReportImageSelect = function (el) { addFiles(el?.files); };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})(window);
