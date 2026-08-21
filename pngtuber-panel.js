(function () {
    'use strict';

    const PNGTUBER_WIDGET_PRESETS = {
        'bottom-left': { x: 14, y: 78 },
        'bottom-center': { x: 50, y: 82 },
        'bottom-right': { x: 86, y: 78 },
        'center-left': { x: 12, y: 50 },
        'center': { x: 50, y: 50 },
        'center-right': { x: 88, y: 50 }
    };

    const SLOT_KEYS = {
        idle: 'idleImage',
        talk: 'talkImage',
        blink: 'blinkImage',
        action: 'actionImage'
    };

    let pngtuberEngine = null;
    let pngtuberLastTalkEmit = null;
    let pngtuberHotkeyBound = false;
    let pngtuberPreviewWindow = null;
    let pngtuberMicStartToken = 0;
    let pngtuberMicStarting = null;

    function pngtuberDefaultSettings() {
        return { ...PngTuber.DEFAULT_SETTINGS };
    }

    function ensurePngTuberStore() {
        if (typeof window.getAdvConf === 'function') {
            const main = window.getAdvConf();
            if (main) window.advConf = main;
        }
        if (!window.advConf) window.advConf = {};
        window.advConf.pngtuber = PngTuber.migrateSettings(window.advConf.pngtuber || pngtuberDefaultSettings());
        return window.advConf.pngtuber;
    }

    function pngtuberBuildOverlayPayload(extra) {
        const s = ensurePngTuberStore();
        const rel = (url) => PngTuber.stripToRelativeAssetUrl(url);
        const payload = {
            token: (window.currentUser && currentUser.streamToken) || '',
            enabled: s.enabled,
            captureMic: s.captureMic,
            audioSource: s.audioSource,
            idleImage: rel(s.idleImage),
            talkImage: rel(s.talkImage),
            blinkImage: rel(s.blinkImage),
            actionImage: rel(s.actionImage),
            useBlink: s.useBlink,
            micThresholdNorm: s.micThresholdNorm,
            micSmoothing: s.micSmoothing,
            micGain: s.micGain,
            micDeviceId: s.micDeviceId,
            bounceMode: s.bounceMode,
            speakEffect: s.speakEffect,
            auraColor: s.auraColor,
            auraEnabled: s.auraEnabled,
            scale: s.scale,
            flipX: s.flipX,
            widgetX: s.widgetX,
            widgetY: s.widgetY,
            widgetPosition: s.widgetPosition,
            blinkMinSec: s.blinkMinSec,
            blinkMaxSec: s.blinkMaxSec,
            blinkDurationMs: s.blinkDurationMs,
            manualState: s.manualState,
            throwGiftsEnabled: (typeof window.isAppPro === 'function' && !window.isAppPro())
                ? false
                : (s.throwGiftsEnabled !== false),
            throwMinCoins: s.throwMinCoins ?? 1,
            throwVolume: s.throwVolume ?? 70,
            throwSpeed: s.throwSpeed ?? 1
        };
        return { ...payload, ...(extra || {}) };
    }

    async function pngtuberUploadAssetUrl(dataUrl) {
        const token = localStorage.getItem('pandy_token');
        if (!token) return dataUrl;
        const resp = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({ dataUrl })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || 'อัปโหลดรูปไม่สำเร็จ');
        return data.url;
    }

    async function pngtuberMigrateInlineImages() {
        const s = ensurePngTuberStore();
        const keys = ['idleImage', 'talkImage', 'blinkImage', 'actionImage'];
        let changed = false;
        for (const key of keys) {
            if (s[key] && typeof s[key] === 'string' && s[key].startsWith('data:')) {
                try {
                    s[key] = await pngtuberUploadAssetUrl(s[key]);
                    changed = true;
                } catch (e) {
                    console.warn('[PNGTuber] migrate image failed:', key, e.message);
                }
            }
        }
        if (changed) {
            if (typeof window.autoSave === 'function') autoSave();
            syncPngTuberToOverlay();
        }
    }

    function pngtuberUploadImage(slot, input) {
        const file = input && input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const key = SLOT_KEYS[slot] || 'idleImage';
            const card = document.querySelector('[data-pt-slot="' + slot + '"]');
            const prev = card && card.querySelector('.pt-slot-preview');
            try {
                const url = await pngtuberUploadAssetUrl(e.target.result);
                pngtuberUpdateSetting(key, url);
                if (prev) {
                    const resolved = PngTuber.resolveAssetUrl(url);
                    prev.setAttribute('data-src', resolved);
                    prev.onload = () => card.classList.add('has-image');
                    prev.onerror = () => {
                        card.classList.remove('has-image');
                        if (typeof showCustomMsg === 'function') {
                            showCustomMsg('error', 'โหลดรูปไม่สำเร็จ', 'อัปโหลดสำเร็จ แต่แสดงตัวอย่างไม่ได้ ลองรีเฟรชหน้า');
                        }
                    };
                    prev.src = resolved;
                }
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('success', 'อัปโหลดแล้ว', 'ส่งรูปไป OBS แล้ว');
                }
            } catch (err) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'อัปโหลดรูป', err.message || 'ไม่สำเร็จ');
                }
            }
        };
        reader.readAsDataURL(file);
        input.value = '';
    }

    function syncPngTuberToOverlay(extra) {
        if (!window.socket || !socket.connected || !window.currentUser || !currentUser.streamToken) return;
        const s = ensurePngTuberStore();
        const hasInline = ['idleImage', 'talkImage', 'blinkImage', 'actionImage'].some((k) => s[k] && String(s[k]).startsWith('data:'));
        if (hasInline) {
            pngtuberMigrateInlineImages().then(() => {
                socket.emit('send_pngtuber_status', pngtuberBuildOverlayPayload(extra));
            }).catch(() => {
                socket.emit('send_pngtuber_status', pngtuberBuildOverlayPayload(extra));
            });
            return;
        }
        socket.emit('send_pngtuber_status', pngtuberBuildOverlayPayload(extra));
    }

    function pngtuberUpdateSetting(key, val, opts) {
        opts = opts || {};
        if (key === 'throwGiftsEnabled' && val && typeof window.isAppPro === 'function' && !window.isAppPro()) {
            if (typeof window.showProUpgradePrompt === 'function') {
                window.showProUpgradePrompt('Avatar — Gift Throw');
            }
            const el = document.getElementById('pngtuberThrowEnabled');
            if (el) el.checked = false;
            return;
        }
        const s = ensurePngTuberStore();
        s[key] = val;
        if (!opts.skipSave && typeof window.autoSave === 'function') autoSave();
        if (!opts.skipSync) schedulePngTuberRender();
        if (pngtuberEngine) pngtuberEngine.updateSettings(s);
        if (key === 'micDeviceId' && s.captureMic !== false && isPngTuberTabActive()) {
            pngtuberStartPreviewMic();
        }
    }

    let pngtuberRenderTimer = null;

    function schedulePngTuberRender() {
        if (pngtuberRenderTimer) return;
        pngtuberRenderTimer = setTimeout(() => {
            pngtuberRenderTimer = null;
            renderPngTuberUI();
            syncPngTuberToOverlay();
        }, 60);
    }

    function pngtuberSliderUpdate(key, val, labelId, isPercent) {
        const el = document.getElementById(labelId);
        if (el) {
            if (key === 'micThresholdNorm') el.textContent = Number(val).toFixed(3);
            else if (key === 'micSmoothing') el.textContent = Number(val).toFixed(2);
            else if (key === 'scale') el.textContent = val + 'x';
            else if (key === 'widgetX' || key === 'widgetY') el.textContent = val + '%';
            else if (key === 'throwSpeed') el.textContent = val + 'x';
            else if (key === 'throwVolume' && isPercent) el.textContent = val + '%';
            else el.textContent = String(val);
        }
        pngtuberUpdateSetting(key, val);
    }

    function pngtuberSetWidgetPosition(pos) {
        const coords = PNGTUBER_WIDGET_PRESETS[pos] || PNGTUBER_WIDGET_PRESETS['bottom-left'];
        const s = ensurePngTuberStore();
        s.widgetPosition = pos;
        s.widgetX = coords.x;
        s.widgetY = coords.y;
        if (typeof window.autoSave === 'function') autoSave();
        renderPngTuberWidgetGrid();
        renderPngTuberUI();
        syncPngTuberToOverlay();
    }

    function pngtuberClearImage(slot) {
        const key = SLOT_KEYS[slot] || 'idleImage';
        pngtuberUpdateSetting(key, null);
        const card = document.querySelector('[data-pt-slot="' + slot + '"]');
        if (card) {
            card.classList.remove('has-image');
            const prev = card.querySelector('.pt-slot-preview');
            if (prev) {
                prev.removeAttribute('src');
                prev.removeAttribute('data-src');
            }
        }
    }

    function pngtuberEscapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pngtuberFriendlyMicLabel(device, index, liveTrackLabelById) {
        const id = String(device?.deviceId || '');
        if (liveTrackLabelById && liveTrackLabelById[id]) return liveTrackLabelById[id];
        const raw = String(device?.label || '').trim();
        if (raw) return raw;
        if (!id || id === 'default') return 'ไมค์เริ่มต้น (Default)';
        if (id === 'communications') return 'ไมค์ Communications';
        return 'ไมโครโฟน ' + (index + 1);
    }

    function pngtuberSetMicHint(text, isError) {
        const hint = document.getElementById('pngtuberMicDeviceHint');
        if (!hint) return;
        hint.textContent = text || '';
        hint.style.color = isError ? '#fca5a5' : 'rgba(200, 190, 230, 0.65)';
    }

    /** ถ้าเคยถูกแปลงเป็นปุ่ม — ดึง select กลับมาเป็น native */
    function pngtuberEnsureNativeMicSelect() {
        const select = document.getElementById('pngtuberMicDevice');
        if (!select) return null;
        select.classList.add('keep-native-select');
        select.classList.remove('ui-select-hidden');
        const wrap = select.closest('.ui-btn-select-wrap');
        if (wrap && wrap.parentNode) {
            wrap.parentNode.insertBefore(select, wrap);
            wrap.remove();
        }
        select.style.cssText = '';
        select.hidden = false;
        select.disabled = false;
        return select;
    }

    async function pngtuberEnsureMicPermission() {
        if (!navigator.mediaDevices?.getUserMedia) {
            return { ok: false, stream: null, error: 'เบราว์เซอร์ไม่รองรับ getUserMedia' };
        }

        try {
            if (window.PandyBridge?.askMicrophoneAccess) {
                await window.PandyBridge.askMicrophoneAccess();
            } else if (window.electron?.ipcRenderer?.invoke) {
                await window.electron.ipcRenderer.invoke('media-ask-microphone');
            }
        } catch (_) { /* optional */ }

        // แบบเวอร์ชันเก่า: เปิดไมค์เริ่มต้นด้วย { audio: true } ก่อน จึงจะได้รายชื่ออุปกรณ์
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            return { ok: true, stream, error: null };
        } catch (e) {
            const name = e && (e.name || e.message) ? String(e.name || e.message) : 'unknown';
            console.warn('[PNGTuber] mic permission failed', name);
            return { ok: false, stream: null, error: name };
        }
    }

    function pngtuberStopTempStream(stream) {
        if (!stream) return;
        try { stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* ignore */ }
    }

    function pngtuberSyncMicSelectUi(select) {
        if (!select) return;
        try {
            if (typeof select._refreshBtnSelect === 'function') select._refreshBtnSelect();
            else if (typeof window.refreshBtnSelect === 'function') window.refreshBtnSelect(select.id || select);
        } catch (_) { /* ignore */ }
    }

    function pngtuberCollectTrackLabels(streams) {
        const liveTrackLabelById = {};
        (streams || []).forEach((stream) => {
            if (!stream) return;
            try {
                (stream.getAudioTracks() || []).forEach((t) => {
                    const settings = (typeof t.getSettings === 'function') ? t.getSettings() : {};
                    const did = String(settings.deviceId || '');
                    const label = String(t.label || '').trim();
                    if (did && label) liveTrackLabelById[did] = label;
                    if (label && !did) liveTrackLabelById[''] = label;
                });
            } catch (_) { /* ignore */ }
        });
        return liveTrackLabelById;
    }

    async function pngtuberRefreshMicDevices(opts = {}) {
        const select = pngtuberEnsureNativeMicSelect();
        if (!select || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            pngtuberSetMicHint('ระบบนี้ไม่รองรับการดึงรายชื่อไมค์', true);
            return { count: 0, ok: false };
        }

        const forcePermission = opts.forcePermission !== false; // default true
        let tempStream = null;
        const btn = document.getElementById('pngtuberMicRefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '… กำลังโหลด';
        }
        pngtuberSetMicHint('กำลังขอสิทธิ์ไมค์และดึงรายชื่ออุปกรณ์…');

        try {
            let devices = [];
            try {
                devices = await navigator.mediaDevices.enumerateDevices();
            } catch (e) {
                devices = [];
            }
            let inputs = devices.filter((d) => d && d.kind === 'audioinput');
            const unlabeled = !inputs.length
                || inputs.every((d) => !String(d.deviceId || '').trim())
                || inputs.every((d) => !String(d.label || '').trim());
            const micLive = !!(pngtuberEngine && pngtuberEngine.micActive && pngtuberEngine.micStream);
            let permError = null;

            // แบบเวอร์ชันเก่า: getUserMedia ก่อน แล้ว enumerate เพื่อดึงชื่อไมค์จริง
            if (forcePermission || unlabeled) {
                if (micLive) {
                    await new Promise((r) => setTimeout(r, 80));
                } else {
                    const perm = await pngtuberEnsureMicPermission();
                    if (perm.ok) {
                        tempStream = perm.stream;
                        await new Promise((r) => setTimeout(r, 180));
                    } else {
                        permError = perm.error;
                    }
                }
                try {
                    devices = await navigator.mediaDevices.enumerateDevices();
                    inputs = devices.filter((d) => d && d.kind === 'audioinput');
                } catch (_) { /* keep previous list */ }
            }

            const liveTrackLabelById = pngtuberCollectTrackLabels([
                tempStream,
                pngtuberEngine && pngtuberEngine.micStream
            ]);

            const seen = new Set();
            const uniqueInputs = [];
            inputs.forEach((d) => {
                const id = String(d.deviceId || '');
                if (!id || seen.has(id)) return;
                seen.add(id);
                uniqueInputs.push(d);
            });

            // ถ้า enumerate ยังว่างแต่มีแทร็กจาก getUserMedia — เติมจาก track settings
            if (!uniqueInputs.length) {
                Object.keys(liveTrackLabelById).forEach((id) => {
                    if (!id || seen.has(id)) return;
                    seen.add(id);
                    uniqueInputs.push({ deviceId: id, kind: 'audioinput', label: liveTrackLabelById[id] });
                });
            }

            const s = ensurePngTuberStore();
            const prev = select.value || s.micDeviceId || '';
            const ids = new Set(uniqueInputs.map((d) => String(d.deviceId)));
            if (s.micDeviceId && !ids.has(String(s.micDeviceId))) {
                s.micDeviceId = '';
                if (typeof window.autoSave === 'function') autoSave();
            }

            const namedCount = uniqueInputs.filter(
                (d) => String(d.label || '').trim() || liveTrackLabelById[String(d.deviceId)]
            ).length;

            const options = ['<option value="">ไมค์เริ่มต้น (Default)</option>'];
            uniqueInputs.forEach((d, i) => {
                const id = String(d.deviceId || '');
                const hasLabel = !!String(d.label || '').trim() || !!liveTrackLabelById[id];
                // ซ่อน default/communications ปลอมเมื่อมีไมค์จริงแล้ว
                if ((id === 'default' || id === 'communications') && namedCount > 0 && !hasLabel) return;
                const label = pngtuberFriendlyMicLabel(d, i, liveTrackLabelById);
                const selected = prev === id || s.micDeviceId === id ? ' selected' : '';
                options.push(
                    '<option value="' + pngtuberEscapeHtml(id) + '"' + selected + '>' +
                    pngtuberEscapeHtml(label) + '</option>'
                );
            });

            select.innerHTML = options.join('');
            const nextVal = (s.micDeviceId && ids.has(String(s.micDeviceId)))
                ? s.micDeviceId
                : (prev && ids.has(String(prev)) ? prev : '');
            select.value = nextVal;
            s.micDeviceId = nextVal;
            pngtuberSyncMicSelectUi(select);

            if (uniqueInputs.length === 0) {
                options.push('<option value="" disabled>ไม่พบไมค์ — ตรวจสิทธิ์ไมโครโฟน</option>');
                select.innerHTML = options.join('');
                pngtuberSyncMicSelectUi(select);
                pngtuberSetMicHint(
                    permError
                        ? 'ขอสิทธิ์ไมค์ไม่สำเร็จ (' + permError + ') — อนุญาตไมค์ใน Windows แล้วกดรีเฟรช'
                        : 'ยังไม่พบไมค์ — ตรวจว่าไมค์เสียบอยู่ / ไม่ได้ถูก OBS Exclusive Mode แล้วกดรีเฟรช',
                    true
                );
                return { count: 0, ok: false, error: permError };
            }
            pngtuberSetMicHint('พบไมค์ ' + uniqueInputs.length + ' ตัว — เลือกอุปกรณ์แล้วเปิดจับเสียงได้');
            return { count: uniqueInputs.length, ok: true };
        } catch (e) {
            console.warn('[PNGTuber] enumerateDevices failed', e);
            pngtuberSetMicHint('ดึงรายชื่อไมค์ล้มเหลว: ' + (e && e.message ? e.message : String(e)), true);
            return { count: 0, ok: false, error: e };
        } finally {
            pngtuberStopTempStream(tempStream);
            if (tempStream) await new Promise((r) => setTimeout(r, 40));
            if (btn) {
                btn.disabled = false;
                btn.textContent = '↻ รีเฟรช';
            }
        }
    }

    /** ปุ่มรีเฟรชรายชื่อ — ขอสิทธิ์ใหม่ + อัปเดต dropdown */
    async function pngtuberRefreshMicList() {
        const s = ensurePngTuberStore();
        const result = await pngtuberRefreshMicDevices({ forcePermission: true });
        if (result && result.ok && s.captureMic !== false && isPngTuberTabActive()) {
            await pngtuberStartPreviewMic();
        }
        return result;
    }

    function pngtuberUpdateMicMeter(level, smoothed, talking) {
        const bar = document.getElementById('pngtuberMicBar');
        const label = document.getElementById('pngtuberMicLevel');
        const thr = document.getElementById('pngtuberMicThresholdLine');
        const live = ensurePngTuberStore();
        // Display gain so quiet mics still move the bar visibly
        const display = Math.min(1, Math.max(level || 0, (smoothed || 0) * 1.15));
        if (bar) bar.style.width = Math.min(100, display * 320) + '%';
        if (label) label.textContent = (level || 0).toFixed(3);
        if (thr) thr.style.left = Math.min(98, ((live.micThresholdNorm || 0.02) / 0.12) * 100) + '%';
        if (live.audioSource === 'panel' && window.socket && socket.connected && currentUser && currentUser.streamToken) {
            if (talking !== pngtuberLastTalkEmit) {
                pngtuberLastTalkEmit = talking;
                socket.emit('send_pngtuber_talk_state', { token: currentUser.streamToken, talking });
            }
        }
    }

    async function pngtuberStartPreviewMic() {
        const token = ++pngtuberMicStartToken;
        const s = ensurePngTuberStore();
        if (!pngtuberEngine) {
            pngtuberEngine = new PngTuber.PngTuberEngine({
                settings: { ...s },
                onStateChange: () => renderPngTuberUI(),
                onLevel: (level, smoothed, talking) => pngtuberUpdateMicMeter(level, smoothed, talking)
            });
        } else {
            pngtuberEngine.updateSettings({ ...s });
            pngtuberEngine.onLevel = (level, smoothed, talking) => pngtuberUpdateMicMeter(level, smoothed, talking);
        }
        const pill = document.getElementById('pngtuberMicStatusPill');
        if (pill) {
            pill.textContent = '◌ กำลังเปิดไมค์…';
            pill.classList.remove('live');
        }

        // Serialize starts so concurrent tab/device refreshes don't steal streams
        const prev = pngtuberMicStarting;
        let unlock;
        const gate = new Promise((resolve) => { unlock = resolve; });
        pngtuberMicStarting = gate;
        if (prev) {
            try { await prev; } catch (e) { /* ignore */ }
        }
        if (token !== pngtuberMicStartToken) {
            unlock();
            return;
        }

        try {
            await pngtuberEngine.startMic(s.micDeviceId || undefined);
            if (token !== pngtuberMicStartToken) {
                if (pngtuberEngine) pngtuberEngine.stopMic();
                return;
            }
            if (pngtuberEngine.audioCtx && pngtuberEngine.audioCtx.state === 'suspended') {
                await pngtuberEngine.audioCtx.resume();
            }
            if (token !== pngtuberMicStartToken) {
                if (pngtuberEngine) pngtuberEngine.stopMic();
                return;
            }
            pngtuberEngine.start();
            if (pill) {
                pill.textContent = '● กำลังฟังไมค์';
                pill.classList.add('live');
            }
            // Labels often appear only after an active mic stream exists
            pngtuberRefreshMicDevices().catch(() => {});
        } catch (e) {
            if (token !== pngtuberMicStartToken) return;
            if (pill) {
                pill.textContent = '○ เปิดไมค์ไม่สำเร็จ';
                pill.classList.remove('live');
            }
            const bar = document.getElementById('pngtuberMicBar');
            if (bar) bar.style.width = '0%';
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'ไมโครโฟน', e.message || 'ไม่สามารถเปิดไมค์ได้ — อนุญาตไมค์ใน Windows/แอป');
            }
        } finally {
            unlock();
        }
    }

    function pngtuberStopPreviewMic() {
        pngtuberMicStartToken++;
        if (pngtuberEngine) pngtuberEngine.stop();
        const pill = document.getElementById('pngtuberMicStatusPill');
        if (pill) {
            pill.textContent = '○ หยุดฟังไมค์';
            pill.classList.remove('live');
        }
        const bar = document.getElementById('pngtuberMicBar');
        if (bar) bar.style.width = '0%';
        const level = document.getElementById('pngtuberMicLevel');
        if (level) level.textContent = '0.000';
    }

    function pngtuberRetryMic() {
        return pngtuberRefreshMicList();
    }

    function pngtuberToggleCaptureMic() {
        const s = ensurePngTuberStore();
        const next = !s.captureMic;
        pngtuberUpdateSetting('captureMic', next);
        if (next && document.getElementById('pngtuberView')?.classList.contains('active')) {
            pngtuberStartPreviewMic();
        } else if (!next) {
            pngtuberStopPreviewMic();
        }
    }

    function pngtuberTestState(state, holdMs) {
        holdMs = holdMs || 900;
        if (pngtuberEngine) pngtuberEngine.setManualState(state);
        syncPngTuberToOverlay({ manualState: state });
        renderPngTuberUI();
        setTimeout(() => {
            if (pngtuberEngine) pngtuberEngine.setManualState(null);
            syncPngTuberToOverlay({ manualState: null });
            renderPngTuberUI();
        }, holdMs);
    }

    function renderPngTuberWidgetGrid() {
        const s = ensurePngTuberStore();
        document.querySelectorAll('[data-pngtuber-widget-pos]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.pngtuberWidgetPos === (s.widgetPosition || 'bottom-left'));
        });
    }

    function renderPngTuberSlots() {
        const s = ensurePngTuberStore();
        const liveState = pngtuberEngine ? pngtuberEngine.getDisplayState() : (s.manualState || 'idle');
        Object.entries(SLOT_KEYS).forEach(([slot, key]) => {
            const card = document.querySelector('[data-pt-slot="' + slot + '"]');
            if (!card) return;
            card.classList.toggle('active-state', slot === liveState);
            const prev = card.querySelector('.pt-slot-preview');
            const resolved = s[key] ? PngTuber.resolveAssetUrl(s[key]) : '';
            if (resolved) {
                if (prev && prev.getAttribute('data-src') !== resolved) {
                    prev.setAttribute('data-src', resolved);
                    prev.onload = () => card.classList.add('has-image');
                    prev.onerror = () => {
                        card.classList.remove('has-image');
                        if (typeof showCustomMsg === 'function') {
                            showCustomMsg('error', 'โหลดรูปไม่สำเร็จ', 'ไม่พบไฟล์รูปของสล็อตนี้ ลองอัปโหลดใหม่');
                        }
                    };
                    prev.src = resolved;
                } else if (prev) {
                    card.classList.add('has-image');
                }
            } else {
                card.classList.remove('has-image');
                if (prev) {
                    prev.removeAttribute('src');
                    prev.removeAttribute('data-src');
                }
            }
        });
    }

    function renderPngTuberUI() {
        const s = ensurePngTuberStore();

        const toggles = {
            pngtuberEnabled: s.enabled !== false,
            pngtuberCaptureMic: s.captureMic !== false,
            pngtuberUseBlink: !!s.useBlink,
            pngtuberFlipX: !!s.flipX,
            pngtuberAuraEnabled: s.auraEnabled !== false,
            pngtuberAudioOverlay: s.audioSource !== 'panel',
            pngtuberAudioPanel: s.audioSource === 'panel',
            pngtuberThrowEnabled: s.throwGiftsEnabled !== false
        };
        Object.entries(toggles).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!val;
        });

        const selects = {
            pngtuberBounceMode: s.bounceMode || 'soft',
            pngtuberSpeakEffect: s.speakEffect || 'glow'
        };
        Object.entries(selects).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        const fields = [
            ['pngtuberThreshold', s.micThresholdNorm ?? 0.02],
            ['pngtuberSmoothing', s.micSmoothing ?? 0.2],
            ['pngtuberScale', s.scale || 1],
            ['pngtuberPosX', s.widgetX || 14],
            ['pngtuberPosY', s.widgetY || 78],
            ['pngtuberAuraColor', s.auraColor || '#bc13fe'],
            ['pngtuberThrowMin', s.throwMinCoins ?? 1],
            ['pngtuberThrowSpeed', s.throwSpeed ?? 1],
            ['pngtuberThrowVol', s.throwVolume ?? 70]
        ];
        fields.forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        const labels = [
            ['pngtuberValThreshold', (s.micThresholdNorm ?? 0.02).toFixed(3)],
            ['pngtuberValSmoothing', (s.micSmoothing ?? 0.2).toFixed(2)],
            ['pngtuberValScale', (s.scale || 1) + 'x'],
            ['pngtuberValPosX', (s.widgetX || 14) + '%'],
            ['pngtuberValPosY', (s.widgetY || 78) + '%'],
            ['pngtuberValThrowMin', String(s.throwMinCoins ?? 1)],
            ['pngtuberValThrowSpeed', (s.throwSpeed ?? 1) + 'x'],
            ['pngtuberValThrowVol', (s.throwVolume ?? 70) + '%']
        ];
        labels.forEach(([id, text]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        });

        const urlEl = document.getElementById('pngtuberObsUrl');
        if (urlEl && typeof buildOverlayUrl === 'function') {
            urlEl.value = buildOverlayUrl('pngtuber');
        }

        renderPngTuberSlots();
        renderPngTuberWidgetGrid();

        const stageImg = document.getElementById('pngtuberStageImg');
        const aura = document.getElementById('pngtuberStageAura');
        if (stageImg) {
            const state = pngtuberEngine ? pngtuberEngine.getDisplayState() : 'idle';
            const src = PngTuber.resolveImage(s, state);
            if (src) {
                stageImg.src = src;
                stageImg.style.display = 'block';
            } else {
                stageImg.style.display = 'none';
            }
            const talking = state === 'talk';
            stageImg.classList.remove('pt-bounce-soft', 'pt-bounce-lively', 'pt-fx-glow', 'pt-fx-pulse', 'pt-talking');
            if (talking) stageImg.classList.add('pt-talking');
            if (talking && s.bounceMode === 'soft') stageImg.classList.add('pt-bounce-soft');
            if (talking && s.bounceMode === 'lively') stageImg.classList.add('pt-bounce-lively');
            if (talking && s.speakEffect === 'glow') stageImg.classList.add('pt-fx-glow');
            if (talking && s.speakEffect === 'pulse') stageImg.classList.add('pt-fx-pulse');
            const scale = Math.max(0.2, s.scale || 1);
            stageImg.style.transform = (s.flipX ? 'scaleX(-1) ' : '') + 'scale(' + scale + ')';
            if (aura) {
                const showAura = s.auraEnabled !== false && talking && s.speakEffect !== 'none';
                aura.style.display = showAura ? 'block' : 'none';
                aura.style.background = 'radial-gradient(circle, ' + (s.auraColor || '#bc13fe') + '55 0%, transparent 70%)';
            }
        }

        ['Talk', 'Action', 'Blink'].forEach((field) => {
            const el = document.getElementById('pngtuberHotkey' + field);
            if (el) el.value = s['hotkey' + field] || '';
        });

        const thr = document.getElementById('pngtuberMicThresholdLine');
        if (thr) thr.style.left = Math.min(95, ((s.micThresholdNorm || 0.02) / 0.12) * 100) + '%';

        const statePill = document.getElementById('pngtuberStatePill');
        if (statePill) {
            const st = pngtuberEngine ? pngtuberEngine.getDisplayState() : 'idle';
            const map = { idle: 'เงียบ', talk: 'พูด', blink: 'กระพริบ', action: 'ท่าทาง' };
            statePill.textContent = map[st] || st;
            statePill.dataset.state = st;
        }
    }

    function pngtuberBindHotkeys() {
        if (pngtuberHotkeyBound) return;
        pngtuberHotkeyBound = true;
        document.addEventListener('keydown', (e) => {
            const view = document.getElementById('pngtuberView');
            if (!view || !view.classList.contains('active')) return;
            if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            const s = ensurePngTuberStore();
            const code = e.code;
            if (s.hotkeyTalk && code === s.hotkeyTalk) { e.preventDefault(); pngtuberTestState('talk', 1200); }
            if (s.hotkeyAction && code === s.hotkeyAction) { e.preventDefault(); pngtuberTestState('action', 1200); }
            if (s.hotkeyBlink && code === s.hotkeyBlink) { e.preventDefault(); pngtuberTestState('blink', 400); }
        });
    }

    function pngtuberRecordHotkey(field) {
        const input = document.getElementById('pngtuberHotkey' + field);
        if (!input) return;
        input.value = 'กดปุ่ม...';
        input.classList.add('recording');
        const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const key = e.code;
            input.value = key;
            input.classList.remove('recording');
            pngtuberUpdateSetting('hotkey' + field, key);
            document.removeEventListener('keydown', handler, true);
        };
        document.addEventListener('keydown', handler, true);
    }

    function initPngTuberUI() {
        pngtuberBindHotkeys();
        renderPngTuberUI();
        if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function' && !window.__pngtuberDeviceChangeBound) {
            window.__pngtuberDeviceChangeBound = true;
            navigator.mediaDevices.addEventListener('devicechange', () => {
                const s = ensurePngTuberStore();
                // เสียบ/ถอดไมค์ — ดึงรายชื่อใหม่ทันที
                pngtuberRefreshMicDevices({ forcePermission: true }).finally(() => {
                    if (s.captureMic !== false && isPngTuberTabActive()) pngtuberStartPreviewMic();
                });
            });
        }
        pngtuberMigrateInlineImages().then(() => {
            syncPngTuberToOverlay();
        }).catch(() => {
            syncPngTuberToOverlay();
        });
        if (isPngTuberTabActive()) {
            pngtuberOnTabShown();
        }
    }

    function isPngTuberTabActive() {
        const view = document.getElementById('pngtuberView');
        return !!(view && view.classList.contains('active'));
    }

    function pngtuberOnTabShown() {
        const s = ensurePngTuberStore();
        pngtuberRefreshMicDevices({ forcePermission: true }).then(() => {
            if (!isPngTuberTabActive()) return;
            if (s.captureMic !== false) {
                pngtuberStartPreviewMic();
            }
        }).catch(() => {
            if (s.captureMic !== false && isPngTuberTabActive()) {
                pngtuberStartPreviewMic();
            }
        });
        syncPngTuberToOverlay();
    }

    function pngtuberOnTabHidden() {
        pngtuberStopPreviewMic();
    }

    function copyPngTuberOverlayLink() {
        const url = typeof buildOverlayUrl === 'function' ? buildOverlayUrl('pngtuber') : '';
        if (url && typeof copyToClipboard === 'function') copyToClipboard(url);
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'คัดลอกแล้ว', 'ลิงก์ Avatar Overlay สำหรับ OBS / TikTok Studio');
        }
    }

    function openPngTuberPreviewWindow() {
        const url = typeof buildOverlayUrl === 'function' ? buildOverlayUrl('pngtuber') : '';
        if (!url) return;
        syncPngTuberToOverlay();
        if (pngtuberPreviewWindow && !pngtuberPreviewWindow.closed) {
            pngtuberPreviewWindow.focus();
            syncPngTuberToOverlay();
            return;
        }
        pngtuberPreviewWindow = window.open(url, 'tokcontrol_pngtuber_preview', 'width=960,height=640,menubar=no,toolbar=no');
    }

    async function pngtuberResetSettings() {
        if (!(await tcConfirm('รีเซ็ตการตั้งค่า Avatar เป็นค่าเริ่มต้น? (รูปภาพจะยังอยู่)', { title: 'รีเซ็ต Avatar', icon: '🔄', okLabel: 'รีเซ็ต' }))) return;
        const keep = ensurePngTuberStore();
        advConf.pngtuber = {
            ...pngtuberDefaultSettings(),
            idleImage: keep.idleImage,
            talkImage: keep.talkImage,
            blinkImage: keep.blinkImage,
            actionImage: keep.actionImage,
            widgetPosition: keep.widgetPosition,
            widgetX: keep.widgetX,
            widgetY: keep.widgetY
        };
        initPngTuberUI();
        if (typeof showCustomMsg === 'function') showCustomMsg('success', 'รีเซ็ตแล้ว', 'คืนค่าการตั้งค่าแล้ว');
    }

    window.pngtuberDefaultSettings = pngtuberDefaultSettings;
    window.ensurePngTuberStore = ensurePngTuberStore;
    window.syncPngTuberToOverlay = syncPngTuberToOverlay;
    window.initPngTuberUI = initPngTuberUI;
    window.pngtuberUpdateSetting = pngtuberUpdateSetting;
    window.pngtuberSliderUpdate = pngtuberSliderUpdate;
    window.pngtuberSetWidgetPosition = pngtuberSetWidgetPosition;
    window.pngtuberUploadImage = pngtuberUploadImage;
    window.pngtuberClearImage = pngtuberClearImage;
    window.pngtuberToggleCaptureMic = pngtuberToggleCaptureMic;
    window.pngtuberStartPreviewMic = pngtuberStartPreviewMic;
    window.pngtuberStopPreviewMic = pngtuberStopPreviewMic;
    window.pngtuberRetryMic = pngtuberRetryMic;
    window.pngtuberRefreshMicList = pngtuberRefreshMicList;
    window.pngtuberTestState = pngtuberTestState;
    window.pngtuberRefreshMicDevices = pngtuberRefreshMicDevices;
    window.pngtuberRecordHotkey = pngtuberRecordHotkey;
    window.copyPngTuberOverlayLink = copyPngTuberOverlayLink;
    window.openPngTuberPreviewWindow = openPngTuberPreviewWindow;
    window.pngtuberOnTabShown = pngtuberOnTabShown;
    window.pngtuberOnTabHidden = pngtuberOnTabHidden;
    window.renderPngTuberUI = renderPngTuberUI;
    window.pngtuberResetSettings = pngtuberResetSettings;

    function switchPngTuberSettingsTab(tabName) {
        const tabs = ['images', 'mic', 'fx', 'layout'];
        tabs.forEach((t) => {
            const btn = document.getElementById('ptTab-' + t);
            const sec = document.getElementById('ptSec-' + t);
            if (btn) btn.classList.toggle('active', t === tabName);
            if (sec) {
                sec.style.display = t === tabName ? 'flex' : 'none';
                sec.classList.toggle('active', t === tabName);
            }
        });
        if (tabName === 'mic') {
            const s = ensurePngTuberStore();
            pngtuberRefreshMicDevices({ forcePermission: true }).finally(() => {
                if (s.captureMic !== false && isPngTuberTabActive()) {
                    pngtuberStartPreviewMic();
                }
            });
        }
    }
    window.switchPngTuberSettingsTab = switchPngTuberSettingsTab;

    function pngtuberTestThrow() {
        if (typeof window.isAppPro === 'function' && !window.isAppPro()) {
            if (typeof window.showProUpgradePrompt === 'function') window.showProUpgradePrompt('Avatar — Gift Throw');
            return;
        }
        if (!window.socket || !socket.connected || !window.currentUser?.streamToken) {
            if (typeof showCustomMsg === 'function') showCustomMsg('warning', 'ทดสอบ', 'กรุณาเชื่อมต่อก่อน');
            return;
        }
        socket.emit('pngtuber_test_throw', {
            token: currentUser.streamToken,
            uniqueId: 'test_throw',
            nickname: 'ทดสอบ',
            giftName: 'Rose',
            giftIcon: '🌹',
            diamondCount: 1,
            repeatCount: 1,
            totalCoins: 1
        });
        if (typeof showCustomMsg === 'function') showCustomMsg('info', 'ทดสอบ', 'ส่งของขวัญทดสอบไป Overlay แล้ว');
    }

    window.pngtuberTestThrow = pngtuberTestThrow;
})();
