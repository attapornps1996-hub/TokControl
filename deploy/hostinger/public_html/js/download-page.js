/**
 * TokControl — Landing / Download Page
 * อนิเมชันขั้นสูง + โลโก้ใหม่ + ดึงรีลีสจาก GitHub
 */
(function () {
    'use strict';

    /** เวลาเปิดดาวน์โหลด (ms) — build:download-site จะตั้งเป็น now+1ชม. */
    const LAUNCH_AT_MS = 0;

    const GITHUB_OWNER = 'attapornps1996-hub';
    const GITHUB_REPO = 'TokControl';
    const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const SAME_ORIGIN_INSTALLER = '/api/download/latest';

    let downloadUrl = RELEASES_PAGE;
    let latestVersion = null;
    let countdownTimer = null;
    let downloadReady = false;

    function getLaunchAtMs() {
        if (LAUNCH_AT_MS <= 0) return 0;
        return LAUNCH_AT_MS;
    }

    function isLaunchLocked() {
        if (LAUNCH_AT_MS <= 0) return false;
        return Date.now() < LAUNCH_AT_MS;
    }

    function formatCountdown(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
    }

    function setBtnAsCountdown(btn, text) {
        if (!btn) return;
        btn.disabled = true;
        btn.classList.remove('dl-btn-primary');
        btn.classList.add('dl-btn-soon');
        btn.removeAttribute('data-burst');
        const icon = btn.querySelector('.dl-btn-icon');
        if (icon) icon.textContent = '⏳';
        const label = btn.querySelector('#dlHeroDownloadLabel, #dlMainDownloadLabel') || btn.querySelector('span:last-child');
        if (label) label.textContent = text;
    }

    function setBtnAsDownload(btn, text) {
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('dl-btn-soon');
        btn.classList.add('dl-btn-primary');
        btn.setAttribute('data-burst', '');
        const icon = btn.querySelector('.dl-btn-icon');
        if (icon) icon.textContent = '⬇';
        const label = btn.querySelector('#dlHeroDownloadLabel, #dlMainDownloadLabel') || btn.querySelector('span:last-child');
        if (label) label.textContent = text;
    }

    function applyCountdownMode(remainingMs) {
        document.body.classList.add('dl-soon');
        const label = `เปิดดาวน์โหลดใน ${formatCountdown(remainingMs)}`;
        const heroBtn = document.getElementById('dlHeroDownload');
        const mainBtn = document.getElementById('dlMainDownload');
        setBtnAsCountdown(heroBtn, label);
        setBtnAsCountdown(mainBtn, label);

        const navCta = document.getElementById('dlNavCta');
        if (navCta) {
            navCta.textContent = `⏳ ${formatCountdown(remainingMs)}`;
            navCta.classList.add('dl-nav-soon');
        }

        const heroCountdown = document.getElementById('dlHeroCountdown');
        const mainCountdown = document.getElementById('dlMainCountdown');
        if (heroCountdown) heroCountdown.textContent = formatCountdown(remainingMs);
        if (mainCountdown) mainCountdown.textContent = formatCountdown(remainingMs);

        setText('dlStatusVersion', 'เร็วๆ นี้');
        setText('dlStatusDate', 'รอเปิดดาวน์โหลด');
        setText('dlStatusSize', '—');
        setStatusPill(`⏳ ${formatCountdown(remainingMs)}`, 'soon');
    }

    function enableDownloadButtons() {
        ['dlHeroDownload', 'dlMainDownload'].forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn || btn.dataset.dlBound === '1') return;
            btn.dataset.dlBound = '1';
            btn.addEventListener('click', (e) => {
                if (btn.hasAttribute('data-burst')) burstAt(e.clientX, e.clientY);
                startDownload(btn);
            });
        });
    }

    async function applyDownloadMode() {
        if (downloadReady) return;
        downloadReady = true;
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }

        document.body.classList.remove('dl-soon');

        const navCta = document.getElementById('dlNavCta');
        if (navCta) {
            navCta.textContent = '⬇ ดาวน์โหลด';
            navCta.classList.remove('dl-nav-soon');
        }

        const heroEyebrow = document.getElementById('dlHeroEyebrow');
        if (heroEyebrow) heroEyebrow.textContent = 'FREE · WINDOWS';

        const ctaEyebrow = document.getElementById('dlCtaEyebrow');
        if (ctaEyebrow) ctaEyebrow.textContent = 'Download';

        const ctaTitle = document.getElementById('dlCtaTitle');
        if (ctaTitle) ctaTitle.textContent = 'ดาวน์โหลด TokControl ฟรี';

        const ctaDesc = document.getElementById('dlCtaDesc');
        if (ctaDesc) ctaDesc.textContent = 'ติดตั้งบน Windows 10 / 11 แล้วเชื่อมต่อ TikTok Live ได้ทันที — อัปเดตเวอร์ชันใหม่ผ่าน Auto Update ในโปรแกรม';

        enableDownloadButtons();
        await loadLatestRelease();

        const heroLabel = latestVersion
            ? `ดาวน์โหลด v${latestVersion} สำหรับ Windows`
            : 'ดาวน์โหลด TokControl สำหรับ Windows';
        const mainLabel = latestVersion
            ? `ดาวน์โหลด TokControl v${latestVersion}`
            : 'ดาวน์โหลด TokControl';

        setBtnAsDownload(document.getElementById('dlHeroDownload'), heroLabel);
        setBtnAsDownload(document.getElementById('dlMainDownload'), mainLabel);
        showToast('🎉 เปิดดาวน์โหลดแล้ว — กดปุ่มเพื่อเริ่มติดตั้ง');
    }

    function startLaunchCountdown() {
        const tick = () => {
            const remaining = getLaunchAtMs() - Date.now();
            if (remaining <= 0) {
                applyDownloadMode();
                return;
            }
            applyCountdownMode(remaining);
        };

        tick();
        countdownTimer = setInterval(tick, 1000);
    }

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFinePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // ---------- ดวงดาว ----------
    function buildStarfield() {
        const layer = document.getElementById('dlStars');
        if (!layer) return;
        layer.innerHTML = '';
        if (reduceMotion()) return;

        const count = window.innerWidth < 640 ? 55 : 110;
        const frag = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const star = document.createElement('span');
            const size = Math.random() < 0.78 ? 1 + Math.random() : 2 + Math.random() * 1.8;
            star.className = 'dl-star';
            star.style.width = size.toFixed(2) + 'px';
            star.style.height = size.toFixed(2) + 'px';
            star.style.left = (Math.random() * 100).toFixed(2) + '%';
            star.style.top = (Math.random() * 100).toFixed(2) + '%';
            star.style.setProperty('--dl-dur', (2.5 + Math.random() * 4.5).toFixed(2) + 's');
            star.style.setProperty('--dl-delay', (Math.random() * 6).toFixed(2) + 's');
            star.style.setProperty('--dl-peak', (0.4 + Math.random() * 0.55).toFixed(2));
            star.style.setProperty('--dl-drift', (22 + Math.random() * 30).toFixed(1) + 's');
            star.style.setProperty('--dx', ((Math.random() - 0.4) * 80).toFixed(1) + 'px');
            star.style.setProperty('--dy', (-30 - Math.random() * 90).toFixed(1) + 'px');
            if (size > 2) {
                star.style.background = Math.random() > 0.5 ? '#d566ff' : '#ff7ab0';
                star.style.boxShadow = '0 0 8px currentColor';
            }
            frag.appendChild(star);
        }
        layer.appendChild(frag);
    }

    // ---------- ดาวตก ----------
    function buildMeteors() {
        const layer = document.getElementById('dlMeteors');
        if (!layer || reduceMotion()) return;
        layer.innerHTML = '';
        const count = window.innerWidth < 640 ? 4 : 8;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const m = document.createElement('span');
            m.className = 'dl-meteor';
            m.style.left = (10 + Math.random() * 80).toFixed(1) + '%';
            m.style.top = (-5 - Math.random() * 20).toFixed(1) + '%';
            m.style.setProperty('--md', (2.2 + Math.random() * 3.5).toFixed(2) + 's');
            m.style.setProperty('--mde', (Math.random() * 8).toFixed(2) + 's');
            m.style.setProperty('--mx', (-180 - Math.random() * 220).toFixed(0) + 'px');
            m.style.setProperty('--my', (320 + Math.random() * 280).toFixed(0) + 'px');
            frag.appendChild(m);
        }
        layer.appendChild(frag);
    }

    // ---------- พาร์ทิเคิลลอยขึ้น ----------
    function buildParticles() {
        const layer = document.getElementById('dlParticles');
        if (!layer || reduceMotion()) return;
        layer.innerHTML = '';
        const count = window.innerWidth < 640 ? 12 : 24;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const p = document.createElement('span');
            const size = 2 + Math.random() * 4;
            p.className = 'dl-particle';
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = (Math.random() * 100).toFixed(1) + '%';
            p.style.bottom = (-5 - Math.random() * 20) + '%';
            p.style.setProperty('--pd', (10 + Math.random() * 16).toFixed(1) + 's');
            p.style.setProperty('--pde', (Math.random() * 12).toFixed(1) + 's');
            p.style.setProperty('--ppk', (0.25 + Math.random() * 0.5).toFixed(2));
            p.style.setProperty('--px2', ((Math.random() - 0.5) * 120).toFixed(1) + 'px');
            if (Math.random() > 0.55) p.style.background = 'rgba(255,0,80,.65)';
            frag.appendChild(p);
        }
        layer.appendChild(frag);
    }

    // ---------- สปาร์คโลโก้ ----------
    function buildLogoSparks() {
        const layer = document.getElementById('dlLogoSparks');
        if (!layer || reduceMotion()) return;
        layer.innerHTML = '';
        const spots = [
            { left: '12%', top: '10%' }, { left: '82%', top: '16%' },
            { left: '18%', top: '78%' }, { left: '78%', top: '72%' },
            { left: '50%', top: '4%' }, { left: '92%', top: '48%' },
            { left: '6%', top: '48%' }, { left: '58%', top: '88%' }
        ];
        const frag = document.createDocumentFragment();
        spots.forEach((s, i) => {
            const spark = document.createElement('span');
            spark.className = 'dl-spark';
            spark.style.left = s.left;
            spark.style.top = s.top;
            spark.style.setProperty('--sd', (1.8 + Math.random() * 2).toFixed(2) + 's');
            spark.style.animationDelay = (-i * 0.35).toFixed(2) + 's';
            frag.appendChild(spark);
        });
        layer.appendChild(frag);
    }

    // ---------- Cursor glow + parallax ----------
    function setupParallaxAndCursor() {
        if (reduceMotion() || !isFinePointer()) return;
        const glow = document.getElementById('dlCursorGlow');
        let raf = 0;
        let tx = 0;
        let ty = 0;

        window.addEventListener('mousemove', (e) => {
            if (glow) {
                glow.style.left = e.clientX + 'px';
                glow.style.top = e.clientY + 'px';
            }
            const nx = (e.clientX / window.innerWidth - 0.5) * 2;
            const ny = (e.clientY / window.innerHeight - 0.5) * 2;
            tx = nx * -18;
            ty = ny * -12;
            if (!raf) {
                raf = requestAnimationFrame(() => {
                    document.documentElement.style.setProperty('--px', tx.toFixed(2) + 'px');
                    document.documentElement.style.setProperty('--py', ty.toFixed(2) + 'px');
                    raf = 0;
                });
            }
        }, { passive: true });
    }

    // ---------- 3D tilt ----------
    function setupTilt() {
        if (reduceMotion() || !isFinePointer()) return;
        document.querySelectorAll('[data-tilt]').forEach((el) => {
            el.addEventListener('mousemove', (e) => {
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform = `perspective(1100px) rotateY(${px * 9}deg) rotateX(${-py * 9}deg)`;
            });
            el.addEventListener('mouseleave', () => { el.style.transform = ''; });
        });
    }

    // ---------- Navbar + 4-dot scroll flow ----------
    function setupNavScroll() {
        const nav = document.getElementById('dlNav');
        const flow = document.getElementById('dlScrollFlow');
        const nodes = flow ? flow.querySelectorAll('.dl-flow-node') : [];
        const lines = flow ? flow.querySelectorAll('.dl-flow-line') : [];
        let flowTimer = null;

        function updateFlow() {
            const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            const progress = window.scrollY / max;
            const segmentCount = nodes.length + lines.length;
            let cursor = progress * segmentCount;

            nodes.forEach((node, index) => {
                const nodeFill = Math.min(1, Math.max(0, cursor));
                node.style.setProperty('--fill', nodeFill.toFixed(3));
                node.classList.toggle('active', nodeFill >= 1);
                node.classList.toggle('partial', nodeFill > 0 && nodeFill < 1);
                cursor -= 1;

                if (index < lines.length) {
                    const lineFill = Math.min(1, Math.max(0, cursor));
                    lines[index].style.setProperty('--fill', lineFill.toFixed(3));
                    lines[index].classList.toggle('active', lineFill >= 1);
                    cursor -= 1;
                }
            });
        }

        function pulseFlow() {
            if (!flow) return;
            flow.classList.add('is-scrolling', 'is-flowing');
            clearTimeout(flowTimer);
            flowTimer = setTimeout(() => {
                flow.classList.remove('is-scrolling', 'is-flowing');
            }, 420);
        }

        function onScroll() {
            if (nav) nav.classList.toggle('scrolled', window.scrollY > 24);
            updateFlow();
            pulseFlow();
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('wheel', pulseFlow, { passive: true });
        onScroll();
    }

    // ---------- Reveal ----------
    function setupScrollReveal() {
        const items = document.querySelectorAll('.dl-reveal');
        if (!items.length) return;
        if (!('IntersectionObserver' in window)) {
            items.forEach((el) => el.classList.add('visible'));
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (!entry.isIntersecting) return;
                setTimeout(() => entry.target.classList.add('visible'), i * 70);
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
        items.forEach((el) => observer.observe(el));
    }

    // ---------- Counter ----------
    function setupCounters() {
        const items = document.querySelectorAll('.dl-count');
        if (!items.length) return;
        const animate = (el) => {
            const target = parseFloat(el.dataset.count) || 0;
            const start = performance.now();
            const dur = 1200;
            function frame(now) {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased) + (target >= 20 ? '+' : '');
                if (p < 1) requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        };
        if (!('IntersectionObserver' in window)) { items.forEach(animate); return; }
        const obs = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                animate(entry.target);
                obs.unobserve(entry.target);
            });
        }, { threshold: 0.5 });
        items.forEach((el) => obs.observe(el));
    }

    // ---------- Burst ----------
    function burstAt(x, y) {
        if (reduceMotion()) return;
        const colors = ['#bc13fe', '#ff0050', '#00d2ff', '#d566ff'];
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('span');
            p.className = 'dl-burst';
            p.style.left = x + 'px';
            p.style.top = y + 'px';
            p.style.background = colors[i % colors.length];
            document.body.appendChild(p);
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 120;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            p.animate([
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                { transform: `translate(${dx}px,${dy}px) scale(0)`, opacity: 0 }
            ], { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
        }
    }

    // ---------- Toast ----------
    let toastTimer = null;
    function showToast(message) {
        const toast = document.getElementById('dlToast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
    }

    const CLOUD_INSTALLER = 'https://pandy-backend-302414976454.asia-southeast1.run.app/api/download/latest';

    function resolveDownloadUrl(directGithubUrl) {
        const host = String(location.hostname || '').toLowerCase();
        if (host === '127.0.0.1' || host === 'localhost') {
            return SAME_ORIGIN_INSTALLER;
        }
        if (host === 'tokcontrol.com' || host === 'www.tokcontrol.com' || host.endsWith('.run.app')) {
            return SAME_ORIGIN_INSTALLER;
        }
        return CLOUD_INSTALLER || directGithubUrl || RELEASES_PAGE;
    }

    function formatBytes(bytes) {
        if (!bytes) return '—';
        const mb = bytes / (1024 * 1024);
        return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
    }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (e) {
            return '—';
        }
    }

    function setStatusPill(text, variant) {
        const pill = document.getElementById('dlStatusPill');
        if (!pill) return;
        pill.textContent = text;
        pill.className = 'dl-status-pill' + (variant ? ' ' + variant : '');
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    async function loadLatestRelease() {
        try {
            const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
            if (!res.ok) throw new Error('GitHub API ' + res.status);
            const data = await res.json();

            latestVersion = (data.tag_name || '').replace(/^v/i, '') || null;
            const installer = (data.assets || []).find((a) => /\.exe$/i.test(a.name));

            if (installer && installer.browser_download_url) {
                downloadUrl = resolveDownloadUrl(installer.browser_download_url);
                setText('dlStatusSize', formatBytes(installer.size));
            }

            if (latestVersion) {
                setText('dlStatusVersion', 'v' + latestVersion);
                setText('dlNavVersion', 'v' + latestVersion);
                setText('dlHeroDownloadLabel', `ดาวน์โหลด v${latestVersion} สำหรับ Windows`);
                setText('dlMainDownloadLabel', `ดาวน์โหลด TokControl v${latestVersion}`);
            }
            setText('dlStatusDate', formatDate(data.published_at));
            setStatusPill('✔ พร้อมดาวน์โหลด', '');
        } catch (err) {
            console.warn('[Download] โหลดข้อมูลรีลีสไม่สำเร็จ:', err.message);
            await loadLocalVersionFallback();
        }
    }

    async function loadLocalVersionFallback() {
        try {
            const res = await fetch('/api/app/version');
            const data = await res.json();
            if (data && data.version) {
                latestVersion = data.version;
                setText('dlStatusVersion', 'v' + data.version);
                setText('dlNavVersion', 'v' + data.version);
            }
        } catch (e) { /* skip */ }
        setStatusPill('⚠ ดาวน์โหลดผ่าน GitHub', 'error');
        downloadUrl = resolveDownloadUrl(RELEASES_PAGE);
        setText('dlStatusDate', 'ดูที่หน้า Releases');
    }

    function startDownload(button) {
        if (!downloadReady) {
            const remaining = getLaunchAtMs() - Date.now();
            showToast(`⏳ เปิดดาวน์โหลดใน ${formatCountdown(Math.max(0, remaining))}`);
            return;
        }
        if (!button || button.classList.contains('is-loading')) return;

        const label = button.querySelector('span:last-child');
        const originalText = label ? label.textContent : '';

        button.classList.add('is-loading');
        if (label) label.textContent = 'กำลังเริ่มดาวน์โหลด…';
        showToast('⬇ กำลังเริ่มดาวน์โหลด TokControl…');

        const targetUrl = downloadUrl || SAME_ORIGIN_INSTALLER;
        const isEdge = /Edg\//i.test(navigator.userAgent);
        const isDirectFile = /\.exe(\?|$)/i.test(targetUrl);
        const isCrossOrigin = (() => {
            try { return new URL(targetUrl, location.href).origin !== location.origin; }
            catch (e) { return true; }
        })();

        // Edge มักบล็อก <a download> ข้ามโดเมน — ใช้เปิดแท็บหรือ redirect same-origin
        if (isEdge || isCrossOrigin) {
            if (!isCrossOrigin || targetUrl.startsWith('/')) {
                window.location.assign(targetUrl);
            } else {
                const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer');
                if (!opened) window.location.assign(targetUrl);
            }
        } else if (isDirectFile) {
            const link = document.createElement('a');
            link.href = targetUrl;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }

        setTimeout(() => {
            button.classList.remove('is-loading');
            if (label) label.textContent = originalText;
            showToast(isDirectFile || !isCrossOrigin
                ? '✅ เริ่มดาวน์โหลดแล้ว — ตรวจสอบโฟลเดอร์ Downloads'
                : '🔗 เปิดหน้าดาวน์โหลดแล้ว — กด Save ถ้า Edge ถาม');
        }, 1800);
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (document.body.classList.contains('dl-protect')) {
            document.addEventListener('contextmenu', (e) => {
                const tag = (e.target && e.target.tagName) || '';
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
            });
            document.addEventListener('dragstart', (e) => {
                if (e.target && e.target.tagName === 'IMG') e.preventDefault();
            });
            document.addEventListener('selectstart', (e) => {
                const tag = (e.target && e.target.tagName) || '';
                if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
            });
        }

        setText('dlYear', new Date().getFullYear());
        buildStarfield();
        buildMeteors();
        buildParticles();
        buildLogoSparks();
        setupParallaxAndCursor();
        setupTilt();
        setupScrollReveal();
        setupNavScroll();
        setupCounters();
        startLaunchCountdown();

        let rz = null;
        window.addEventListener('resize', () => {
            clearTimeout(rz);
            rz = setTimeout(() => {
                buildStarfield();
                buildMeteors();
                buildParticles();
            }, 250);
        }, { passive: true });
    });
})();
