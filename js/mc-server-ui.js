/**
 * Shared Minecraft server setup UI for Box / Fish / Farm / Tower / Restaurant.
 * Install package first → Start server. Manual settings modal + Java 21 install.
 */
(function (global) {
    'use strict';

    const MODE_LABEL = {
        box: 'Box Control',
        fish: 'Fish Control',
        farm: 'Farm Control',
        tower: 'Tower Wars',
        restaurant: 'Restaurant Control'
    };

    let settingsWorld = 'box';
    let settingsJarPath = '';
    let propsEditorOpen = false;

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function modeLabel(world) {
        return MODE_LABEL[world] || world;
    }

    function fillRequirementBanner(el, data) {
        if (!el) return;
        const client = data?.requiredClient || '1.21.1';
        const paper = data?.paperVersion || client;
        const javaReq = data?.javaRequired || 21;
        const javaOk = data?.javaOk !== false;
        el.innerHTML = `
            <div class="mc-req-banner">
                <div class="mc-req-row">
                    <span class="mc-req-badge">Minecraft <b>${esc(client)}</b></span>
                    <span class="mc-req-badge">Paper <b>${esc(paper)}</b></span>
                    <span class="mc-req-badge ${javaOk ? 'is-ok' : 'is-warn'}">Java <b>${javaReq}+</b> ${javaOk ? 'พร้อม' : 'ยังไม่พบ'}</span>
                    <span class="mc-req-badge is-ok">ฟอนต์ <b>Prompt</b></span>
                </div>
                <p class="mc-req-hint">เข้าเกมด้วย Minecraft Java <b>${esc(client)}</b> · เซิร์ฟบังคับ Resource Pack ฟอนต์ Prompt · รันได้ทีละโหมด</p>
            </div>`;
    }

    function applyActionButtons(ids, data) {
        const installed = !!data?.installed;
        const running = !!data?.running;
        const otherBusy = !!data?.otherModeRunning;
        const javaOk = data?.javaOk !== false;
        const setupBtn = ids.setup && document.getElementById(ids.setup);
        const startBtn = ids.start && document.getElementById(ids.start);
        const stopBtn = ids.stop && document.getElementById(ids.stop);
        const resetBtn = ids.reset && document.getElementById(ids.reset);
        const javaBtn = ids.java && document.getElementById(ids.java);
        const settingsBtn = ids.settings && document.getElementById(ids.settings);
        const testBtn = ids.test && document.getElementById(ids.test);

        if (setupBtn) {
            setupBtn.style.display = (!installed && !running) ? '' : 'none';
            setupBtn.disabled = otherBusy;
            setupBtn.textContent = '📦 ดาวน์โหลด / ติดตั้งแพ็กเกจ';
        }
        if (startBtn) {
            startBtn.style.display = (installed && !running) ? '' : 'none';
            startBtn.disabled = otherBusy || !javaOk;
            startBtn.title = !javaOk
                ? `ต้องติดตั้ง Java ${data?.javaRequired || 21}+ ก่อน`
                : (otherBusy ? `ปิด ${data.otherModeLabel || 'โหมดอื่น'} ก่อน` : '');
            startBtn.textContent = '▶ เริ่มเซิร์ฟเวอร์';
        }
        if (stopBtn) stopBtn.style.display = (running || data?.anyRunning) ? '' : 'none';
        if (resetBtn) resetBtn.style.display = installed ? '' : 'none';
        if (testBtn) testBtn.style.display = installed ? '' : 'none';
        if (javaBtn) {
            javaBtn.style.display = javaOk ? 'none' : '';
            javaBtn.classList.toggle('gp-btn-primary', !javaOk);
            javaBtn.classList.toggle('gp-btn-secondary', !!javaOk);
        }
        if (settingsBtn) settingsBtn.style.display = '';
    }

    function formatStatusLine(data, world) {
        const label = modeLabel(world);
        const parts = [];
        parts.push(data.installed ? `✅ ติดตั้งเซิร์ฟ ${label} แล้ว` : `⬜ ยังไม่ติดตั้งเซิร์ฟ ${label}`);
        parts.push(`📁 ${data.levelName || ''}`);
        if (data.requiredClient) parts.push(`🎮 MC ${data.requiredClient}`);
        if (data.paperVersion) parts.push(`📄 Paper ${data.paperVersion}`);
        parts.push(data.javaOk === false
            ? `⚠️ ต้อง Java ${data.javaRequired || 21}+`
            : (data.javaOk ? `☕ Java ${data.javaMajor || 21}+` : ''));
        if (data.otherModeRunning) {
            parts.push(`⚠️ ${data.otherModeLabel || data.runningMode} กำลังรัน — ปิดก่อน`);
        } else {
            parts.push(data.running
                ? `🟢 เซิร์ฟ ${label} กำลังรัน`
                : (data.gamePortOpen ? '🟡 พอร์ต 25565 เปิด' : `⚫ เซิร์ฟ ${label} ปิด`));
        }
        if (data.xmxMb) parts.push(`RAM ${data.xmsMb || '?'}–${data.xmxMb} MB`);
        if (data.rcon?.enabled) parts.push(`🔌 RCON :${data.rcon.port || 25575}`);
        return parts.filter(Boolean).join(' · ');
    }

    function authHeaders(extra = {}) {
        const token = (typeof localStorage !== 'undefined' && localStorage.getItem('pandy_token')) || '';
        return {
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...extra
        };
    }

    async function apiFetch(url, options = {}) {
        const opts = { ...options };
        const baseHeaders = authHeaders(opts.headers || {});
        // POST/PUT with body defaults to JSON unless caller overrides
        if (opts.body && typeof opts.body === 'string' && !baseHeaders['Content-Type'] && !baseHeaders['content-type']) {
            baseHeaders['Content-Type'] = 'application/json';
        }
        opts.headers = baseHeaders;
        const res = await fetch(url, opts);
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }
        if (!res.ok) {
            const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
            err.status = res.status;
            err.data = data;
            if (res.status === 401 && typeof showCustomMsg === 'function') {
                showCustomMsg(
                    'warning',
                    'เซสชันหมดอายุ',
                    'ออกจากระบบแล้วเข้าสู่ระบบใหม่ แล้วกดติดตั้งอีกครั้ง'
                );
            }
            throw err;
        }
        return data == null ? { success: true } : data;
    }

    async function fetchStatus(world) {
        return apiFetch(`/api/games/minecraft/status?world=${encodeURIComponent(world)}`);
    }

    async function fetchProgress() {
        return apiFetch('/api/games/minecraft/progress');
    }

    function formatProgressLine(p) {
        if (!p) return '';
        const pct = Number.isFinite(Number(p.percent)) ? Math.round(Number(p.percent)) : null;
        const msg = String(p.message || p.phase || '').trim();
        if (!msg && pct == null) return '';
        const job = p.job === 'start' ? 'รัน' : (p.job === 'setup' ? 'โหลด' : (p.job || 'งาน'));
        const head = pct != null ? `${job} ${pct}%` : job;
        return msg ? `${head} · ${msg}` : head;
    }

    async function withProgress(jobPromise, onProgress) {
        if (typeof onProgress !== 'function') return jobPromise;
        let lastLine = '';
        const tick = async () => {
            try {
                const p = await fetchProgress();
                const line = formatProgressLine(p);
                if (line && line !== lastLine) {
                    lastLine = line;
                    onProgress(p, line);
                }
            } catch (e) { /* ignore poll errors */ }
        };
        await tick();
        const timer = setInterval(tick, 450);
        try {
            return await jobPromise;
        } finally {
            clearInterval(timer);
            await tick();
        }
    }

    async function setupServer(world, opts = {}) {
        const job = apiFetch('/api/games/minecraft/setup', {
            method: 'POST',
            body: JSON.stringify({ world })
        });
        return withProgress(job, opts.onProgress);
    }

    async function startServer(world, opts = {}) {
        const job = apiFetch('/api/games/minecraft/start', {
            method: 'POST',
            body: JSON.stringify({ world })
        });
        return withProgress(job, opts.onProgress);
    }

    async function stopServer() {
        return apiFetch('/api/games/minecraft/stop', { method: 'POST' });
    }

    async function resetServer(world) {
        return apiFetch('/api/games/minecraft/reset', {
            method: 'POST',
            body: JSON.stringify({ world })
        });
    }

    function copyJoinAddress(addr) {
        const text = String(addr || 'localhost:25565').trim();
        if (typeof copyToClipboard === 'function') {
            copyToClipboard(text);
            return true;
        }
        if (typeof copyTextToClipboard === 'function') {
            copyTextToClipboard(text);
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', text);
            return true;
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', text);
            }).catch(() => {
                fallbackCopyJoin(text);
            });
            return true;
        }
        return fallbackCopyJoin(text);
    }

    function fallbackCopyJoin(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', text);
            return true;
        } catch (e) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'คัดลอกไม่ได้', text);
            return false;
        }
    }

    async function openServerFolder(world) {
        try {
            const data = await fetchStatus(world || 'box');
            const folder = data?.path;
            if (!folder) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ยังไม่มีโฟลเดอร์', 'กดติดตั้งแพ็กเกจก่อน');
                }
                return false;
            }
            try {
                const { shell } = window.electron || {};
                if (!shell?.openPath) {
                    if (typeof showCustomMsg === 'function') {
                        showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', folder);
                    }
                    return false;
                }
                const result = await shell.openPath(folder);
                if (result) {
                    if (typeof showCustomMsg === 'function') {
                        showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', folder);
                    }
                }
                return true;
            } catch (e) { /* fall through */ }
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('info', 'โฟลเดอร์เซิร์ฟ', folder);
            }
            return true;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เปิดโฟลเดอร์ไม่ได้', e.message || String(e));
            }
            return false;
        }
    }

    async function openExternal(url) {
        try {
            const { ipcRenderer } = window.electron || {};
            if (ipcRenderer?.invoke) {
                await ipcRenderer.invoke('open-external-url', url);
                return;
            }
        } catch (e) { /* fall through */ }
        try { window.open(url, '_blank'); } catch (e2) { /* ignore */ }
    }

    async function installJava() {
        const stepsHtml = [
            '1) ดาวน์โหลด Adoptium Temurin JDK 21',
            '2) เปิดตัวติดตั้ง → กด Next จนจบ (แนะนำติ๊กเพิ่ม PATH ถ้ามี)',
            '3) กลับมาแอพ แล้วกด «ตรวจสอบ Java อีกครั้ง»'
        ].join('<br>');
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('info', 'ติดตั้ง Java 21', stepsHtml);
        }
        try {
            const data = await apiFetch('/api/games/minecraft/install-java', { method: 'POST' });
            if (data.openBrowser && data.url) {
                await openExternal(data.url);
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'เปิดหน้า Adoptium', 'ติดตั้ง JDK 21 แล้วกลับมากดตรวจสอบอีกครั้ง');
                }
            } else if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'เปิดตัวติดตั้งแล้ว', 'กด Next ในหน้าต่าง Adoptium จนจบ แล้วกลับมากดตรวจสอบ Java');
                }
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ดาวน์โหลดไม่สำเร็จ', data.error || 'ลองเปิดหน้า Adoptium แทน');
                if (data.url) await openExternal(data.url);
            }
            return data;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ดาวน์โหลดไม่สำเร็จ', e.message || 'ลองเปิดหน้า Adoptium แทน');
            }
            throw e;
        }
    }

    async function recheckJava() {
        const data = await apiFetch('/api/games/minecraft/java-status');
        if (typeof showCustomMsg === 'function') {
            if (data.javaOk) {
                showCustomMsg('success', 'Java พร้อม', `พบ Java ${data.javaMajor}+`);
            } else {
                showCustomMsg('warning', 'ยังไม่พบ Java 21+', 'ติดตั้งให้จบ แล้วลองใหม่ (หรือรีสตาร์ทแอพ)');
            }
        }
        return data;
    }

    function setRamChip(group, value) {
        const wrap = document.getElementById(group);
        if (!wrap) return;
        wrap.querySelectorAll('.mc-ram-chip').forEach((btn) => {
            btn.classList.toggle('is-active', String(btn.getAttribute('data-mb')) === String(value));
        });
    }

    async function openSettingsModal(world) {
        settingsWorld = world || 'box';
        settingsJarPath = '';
        propsEditorOpen = false;
        const modal = document.getElementById('gcMcServerSettingsModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.getElementById('mcSetPropsEditorWrap').style.display = 'none';
        const title = document.getElementById('mcSetTitle');
        if (title) title.textContent = `ตั้งค่าเซิร์ฟเวอร์ Minecraft · ${modeLabel(settingsWorld)}`;
        try {
            const data = await fetchStatus(settingsWorld);
            const jarLabel = document.getElementById('mcSetJarLabel');
            if (jarLabel) {
                jarLabel.textContent = data.jarLabel || (data.installed ? 'paper.jar' : 'ยังไม่ได้เลือกไฟล์');
            }
            const worldInput = document.getElementById('mcSetWorldName');
            if (worldInput) worldInput.value = data.levelName || '';
            const xms = document.getElementById('mcSetXms');
            const xmx = document.getElementById('mcSetXmx');
            if (xms) xms.value = String(data.xmsMb || 2048);
            if (xmx) xmx.value = String(data.xmxMb || 4096);
            setRamChip('mcSetXmsChips', data.xmsMb || 2048);
            setRamChip('mcSetXmxChips', data.xmxMb || 4096);
            const startBtn = document.getElementById('mcSetStartBtn');
            if (startBtn) {
                startBtn.disabled = !data.installed || !data.javaOk || !!data.running;
                startBtn.textContent = data.running ? 'เซิร์ฟกำลังรัน' : '▶ เริ่มเซิร์ฟเวอร์';
            }
            const warn = document.getElementById('mcSetJavaWarn');
            if (warn) warn.style.display = data.javaOk ? 'none' : '';
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'โหลดตั้งค่าไม่สำเร็จ', e.message || '');
            }
        }
    }

    function closeSettingsModal() {
        const modal = document.getElementById('gcMcServerSettingsModal');
        if (modal) modal.style.display = 'none';
    }

    async function pickJarFile() {
        try {
            if (!window.electron?.ipcRenderer?.invoke) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'เลือกไฟล์', 'ใช้ได้เฉพาะในแอพเดสก์ท็อป');
                }
                return;
            }
            const { ipcRenderer } = window.electron;
            const picked = await ipcRenderer.invoke('pick-jar-file');
            if (!picked?.ok || !picked.path) return;
            settingsJarPath = picked.path;
            const jarLabel = document.getElementById('mcSetJarLabel');
            if (jarLabel) jarLabel.textContent = picked.name || picked.path;
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เลือกไฟล์ไม่สำเร็จ', e.message || '');
            }
        }
    }

    async function saveSettingsFromModal(opts = {}) {
        const xms = parseInt(document.getElementById('mcSetXms')?.value, 10) || 2048;
        const xmx = parseInt(document.getElementById('mcSetXmx')?.value, 10) || 4096;
        const levelName = document.getElementById('mcSetWorldName')?.value || '';
        if (settingsJarPath) {
            const jarData = await apiFetch('/api/games/minecraft/set-jar', {
                method: 'POST',
                body: JSON.stringify({ world: settingsWorld, path: settingsJarPath })
            });
            if (!jarData.success) throw new Error(jarData.error || 'คัดลอก JAR ไม่สำเร็จ');
            settingsJarPath = '';
        }
        const data = await apiFetch('/api/games/minecraft/runtime', {
            method: 'POST',
            body: JSON.stringify({ world: settingsWorld, xmsMb: xms, xmxMb: xmx, levelName })
        });
        if (!data.success) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        if (propsEditorOpen) {
            const text = document.getElementById('mcSetPropsText')?.value || '';
            const propData = await apiFetch('/api/games/minecraft/server-properties', {
                method: 'POST',
                body: JSON.stringify({ world: settingsWorld, text })
            });
            if (!propData.success) throw new Error(propData.error || 'บันทึก server.properties ไม่สำเร็จ');
        }
        if (!opts.silent && typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'บันทึกแล้ว', 'รีสตาร์ทเซิร์ฟเวอร์เพื่อใช้ค่าใหม่');
        }
        return data;
    }

    async function togglePropsEditor() {
        const wrap = document.getElementById('mcSetPropsEditorWrap');
        if (!wrap) return;
        propsEditorOpen = !propsEditorOpen;
        wrap.style.display = propsEditorOpen ? '' : 'none';
        if (propsEditorOpen) {
            const data = await apiFetch(`/api/games/minecraft/server-properties?world=${encodeURIComponent(settingsWorld)}`);
            const ta = document.getElementById('mcSetPropsText');
            if (ta) ta.value = data.text || '';
        }
    }

    async function reinstallFromModal() {
        if (!confirm(`ติดตั้งใหม่เซิร์ฟ ${modeLabel(settingsWorld)}? โลกเดิมจะถูกลบ`)) return;
        try {
            await saveSettingsFromModal({ silent: true });
        } catch (e) { /* continue */ }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('info', 'กำลังติดตั้งใหม่', 'ดาวน์โหลดแพ็กเกจ…');
        }
        const data = await resetServer(settingsWorld);
        if (data.success) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('success', 'ติดตั้งใหม่แล้ว', modeLabel(settingsWorld));
            }
            await openSettingsModal(settingsWorld);
            global.dispatchEvent(new CustomEvent('mc-server-changed', { detail: { world: settingsWorld } }));
        } else if (typeof showCustomMsg === 'function') {
            showCustomMsg('error', 'ติดตั้งใหม่ไม่สำเร็จ', data.error || '');
        }
    }

    async function startFromModal() {
        try {
            await saveSettingsFromModal({ silent: true });
            const data = await startServer(settingsWorld);
            if (data.needJava) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('warning', 'ต้องใช้ Java 21+', 'กดติดตั้ง Java 21 ก่อน');
                }
                return;
            }
            if (data.success) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'กำลังเริ่มเซิร์ฟ', modeLabel(settingsWorld));
                }
                closeSettingsModal();
                global.dispatchEvent(new CustomEvent('mc-server-changed', { detail: { world: settingsWorld } }));
            } else if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เริ่มเซิร์ฟไม่สำเร็จ', data.error || '');
            }
        } catch (e) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ผิดพลาด', e.message || '');
            }
        }
    }

    function bindRamChips() {
        document.querySelectorAll('#mcSetXmsChips .mc-ram-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mb = btn.getAttribute('data-mb');
                const input = document.getElementById('mcSetXms');
                if (input) input.value = mb;
                setRamChip('mcSetXmsChips', mb);
            });
        });
        document.querySelectorAll('#mcSetXmxChips .mc-ram-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mb = btn.getAttribute('data-mb');
                const input = document.getElementById('mcSetXmx');
                if (input) input.value = mb;
                setRamChip('mcSetXmxChips', mb);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindRamChips);
    } else {
        bindRamChips();
    }

    async function announceViewer(user, message) {
        const name = String(user || 'viewer').replace(/^@/, '').slice(0, 24);
        let msg = String(message || 'ทริกเกอร์');
        try {
            msg = msg.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]+/u, '').trim() || msg;
        } catch (e) {
            msg = msg.replace(/^[^\w\u0E00-\u0E7F]+/, '').trim() || msg;
        }
        msg = msg.slice(0, 48);
        try {
            // ผ่าน server API (มี JWT + bridge token) — ไม่ยิง :8081 ตรงจากเบราว์เซอร์
            if (typeof executeGameModCommandDetailed === 'function') {
                await executeGameModCommandDetailed(
                    'minecraft',
                    JSON.stringify({ cmd: 'tc_announce', user: name, message: msg }),
                    { type: 'websocket', host: 'http://127.0.0.1:8081' },
                    { awaitResponse: false, fireAndForget: true }
                );
                return true;
            }
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null;
            await apiFetch('/api/game-mod/execute', {
                method: 'POST',
                body: JSON.stringify({
                    gameId: 'minecraft',
                    command: JSON.stringify({ cmd: 'tc_announce', user: name, message: msg }),
                    connection: { type: 'websocket', host: 'http://127.0.0.1:8081' }
                }),
                signal: ctrl ? ctrl.signal : undefined
            });
            if (timer) clearTimeout(timer);
            return true;
        } catch (e) {
            return false;
        }
    }

    global.McServerUI = {
        modeLabel,
        fillRequirementBanner,
        applyActionButtons,
        formatStatusLine,
        formatProgressLine,
        authHeaders,
        apiFetch,
        fetchStatus,
        fetchProgress,
        setupServer,
        startServer,
        stopServer,
        resetServer,
        copyJoinAddress,
        openServerFolder,
        installJava,
        recheckJava,
        openSettingsModal,
        closeSettingsModal,
        pickJarFile,
        saveSettingsFromModal,
        togglePropsEditor,
        reinstallFromModal,
        startFromModal,
        openExternal,
        announceViewer
    };

    global.closeMcServerSettingsModal = closeSettingsModal;
    global.mcSetPickJar = pickJarFile;
    global.mcSetToggleProps = togglePropsEditor;
    global.mcSetReinstall = reinstallFromModal;
    global.mcSetStart = startFromModal;
    global.mcSetSave = () => saveSettingsFromModal().catch((e) => {
        if (typeof showCustomMsg === 'function') showCustomMsg('error', 'บันทึกไม่สำเร็จ', e.message || '');
    });
    global.mcInstallJava = installJava;
    global.mcRecheckJava = recheckJava;
})(typeof window !== 'undefined' ? window : global);
