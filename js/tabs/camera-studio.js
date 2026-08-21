/**
 * TokControl Camera Studio — mockup UI controller
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'tokcontrol_camera_studio_v3';
    const FRAME_CHANNEL = 'tokcontrol-camera-frames';
    const DEFAULT_SETTINGS = {
        deviceId: '',
        resolution: '1920x1080',
        preset: 'softBeauty',
        mirror: true,
        adjustTab: 'beauty',
        effectCat: 'beauty',
        libTab: 'all',
        favorites: ['softBeauty', 'purpleDream', 'clean', 'warmLight'],
        recent: ['softBeauty'],
        quickMode: 'streaming',
        layers: [
            { id: 'camera', name: 'Camera', visible: true },
            { id: 'background', name: 'Background', visible: true },
            { id: 'neon', name: 'Neon Frame', visible: false },
            { id: 'sticker', name: 'Sticker', visible: false },
            { id: 'particles', name: 'Particle Overlay', visible: false }
        ],
        params: null
    };

    let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    let stream = null;
    let pipeline = null;
    let rafId = 0;
    let outputActive = false;
    let recording = false;
    let mediaRecorder = null;
    let recordChunks = [];
    let lastBroadcastAt = 0;
    let fpsFrames = 0;
    let fpsLast = performance.now();
    let bc = null;
    let inited = false;

    function $(id) { return document.getElementById(id); }

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tokcontrol_camera_studio_v2');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...parsed };
            if (!Array.isArray(settings.favorites)) settings.favorites = DEFAULT_SETTINGS.favorites.slice();
            if (!Array.isArray(settings.layers)) settings.layers = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.layers));
        } catch (_) { /* ignore */ }
    }

    function saveSettings() {
        try {
            if (pipeline) settings.params = pipeline.getParams();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (_) { /* ignore */ }
    }

    function parseResolution(value) {
        const m = String(value || '1920x1080').match(/(\d+)\s*x\s*(\d+)/i);
        return { width: m ? parseInt(m[1], 10) : 1920, height: m ? parseInt(m[2], 10) : 1080 };
    }

    function getIpc() {
        try { return (window.electron || {}).ipcRenderer || null; } catch (_) { return null; }
    }

    async function ensureFilterLib() {
        // Always load cam-icons.js (full set) even if TcIcons stub set CamIcons early
        if (!window.CamIcons || !window.CamIcons._full) {
            await new Promise((resolve) => {
                const existing = document.querySelector('script[data-cam-icons]');
                if (existing) {
                    if (window.CamIcons && window.CamIcons._full) return resolve();
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => resolve(), { once: true });
                    return;
                }
                const el = document.createElement('script');
                el.src = '/js/camera/cam-icons.js';
                el.dataset.camIcons = '1';
                el.onload = () => resolve();
                el.onerror = () => resolve();
                document.head.appendChild(el);
            });
        }
        if (!window.TokControlFaceMesh) {
            await new Promise((resolve) => {
                const existing = document.querySelector('script[data-cam-face]');
                if (existing) {
                    if (window.TokControlFaceMesh) return resolve();
                    existing.addEventListener('load', () => resolve(), { once: true });
                    existing.addEventListener('error', () => resolve(), { once: true });
                    return;
                }
                const el = document.createElement('script');
                el.src = '/js/camera/face-mesh-warp.js';
                el.dataset.camFace = '1';
                el.onload = () => resolve();
                el.onerror = () => resolve();
                document.head.appendChild(el);
            });
        }
        if (window.CameraFilterPipeline) return;
        await new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-cam-filter]');
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }
            const el = document.createElement('script');
            el.src = '/js/camera/filter-pipeline.js';
            el.dataset.camFilter = '1';
            el.onload = () => resolve();
            el.onerror = () => reject(new Error('filter-pipeline failed'));
            document.head.appendChild(el);
        });
    }

    function ico(name, size) {
        return window.CamIcons ? CamIcons.svg(name, { size: size || 14 }) : '';
    }

    function hydrateTabIcons() {
        document.querySelectorAll('#camAdjustTabs .cam-tab-ico[data-ico]').forEach((el) => {
            el.innerHTML = ico(el.dataset.ico, 14);
        });
    }

    function currentParams() {
        return pipeline ? pipeline.getParams() : { ...(settings.params || CameraFilterPipeline.DEFAULT_PARAMS) };
    }

    function applyParamsToPipeline() {
        if (!pipeline) return;
        if (settings.params) pipeline.setParams(settings.params);
        else if (settings.preset && CameraFilterPipeline.PRESETS[settings.preset]) {
            pipeline.applyPreset(settings.preset);
            settings.params = pipeline.getParams();
        }
        pipeline.setMirror(!!settings.mirror);
        syncLayersToPipeline();
    }

    function syncLayersToPipeline() {
        if (!pipeline) return;
        const p = settings.params || currentParams();
        const bg = settings.layers.find((l) => l.id === 'background');
        const neon = settings.layers.find((l) => l.id === 'neon');
        const sticker = settings.layers.find((l) => l.id === 'sticker');
        const particles = settings.layers.find((l) => l.id === 'particles');

        if (!bg?.visible) pipeline.setBackground('none');
        else if (p.background && p.background !== 'none') pipeline.setBackground(p.background);

        if (neon?.visible) pipeline.setOverlay('neon');
        else if (particles?.visible) {
            pipeline.setOverlay(p.overlay && p.overlay !== 'none' ? p.overlay : 'sparkle');
        } else if (p.overlay && p.overlay !== 'none') pipeline.setOverlay(p.overlay);
        else pipeline.setOverlay('none');

        if (!sticker?.visible && sticker) {
            if (!p.sticker || p.sticker === 'none') pipeline.setSticker('none');
            else pipeline.setSticker(p.sticker);
        } else if (sticker?.visible) {
            pipeline.setSticker(p.sticker && p.sticker !== 'none' ? p.sticker : 'hearts');
        } else {
            pipeline.setSticker(p.sticker || 'none');
        }

        if (p.faceAnim) pipeline.setFaceAnim(p.faceAnim);
    }

    function isPickerTab(tab) {
        return tab === 'sticker' || tab === 'background' || tab === 'anim';
    }

    function renderPresets() {
        const row = $('camPresetRow');
        const picker = $('camPickerRow');
        if (!row || !window.CameraFilterPipeline) return;
        const tab = settings.adjustTab || 'beauty';

        if (isPickerTab(tab)) {
            row.hidden = true;
            if (picker) {
                picker.hidden = false;
                renderPicker(picker, tab);
            }
            return;
        }

        row.hidden = false;
        if (picker) picker.hidden = true;
        row.innerHTML = '';

        if (tab === 'color' || tab === 'lut') {
            const toneHost = document.createElement('div');
            toneHost.className = 'cam-tone-row';
            const params = currentParams();
            const activeTone = params.tone || 'normal';
            (CameraFilterPipeline.TONE_PRESETS || []).forEach((tone) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cam-tone-chip' + (activeTone === tone.id ? ' active' : '');
                btn.textContent = tone.label;
                btn.onclick = () => applyTone(tone.id);
                toneHost.appendChild(btn);
            });
            row.appendChild(toneHost);
        }

        const keys = (tab === 'color' || tab === 'lut')
            ? ['natural', 'softSkin', 'vintage', 'cyberpunk', 'bw', 'vhsGlitch']
            : Object.keys(CameraFilterPipeline.PRESET_META);

        keys.forEach((key) => {
            const meta = CameraFilterPipeline.PRESET_META[key];
            if (!meta) return;
            const fav = settings.favorites.includes(key);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cam-preset-card' + (settings.preset === key ? ' active' : '');
            card.dataset.preset = key;
            const [c1, c2] = meta.colors;
            card.innerHTML = `
                <span class="swatch" style="background:linear-gradient(135deg,${c1},${c2})"></span>
                <span class="label">${meta.label}</span>
                <span class="fav${fav ? ' on' : ''}" data-fav="${key}">${ico('heart', 10)}</span>
                ${settings.preset === key ? `<span class="check">${ico('check', 10)}</span>` : ''}`;
            card.onclick = (e) => {
                if (e.target?.dataset?.fav) {
                    e.stopPropagation();
                    toggleFavorite(key);
                    return;
                }
                applyPreset(key);
            };
            row.appendChild(card);
        });
    }

    function applyTone(toneId) {
        if (!pipeline || !CameraFilterPipeline.TONE_PRESETS) return;
        const intensity = currentParams().filterIntensity ?? 100;
        pipeline.applyTone(toneId, intensity);
        settings.params = pipeline.getParams();
        const tone = CameraFilterPipeline.TONE_PRESETS.find((t) => t.id === toneId);
        settings.preset = tone?.preset || 'custom';
        settings.recent = [settings.preset, ...(settings.recent || []).filter((x) => x !== settings.preset)].slice(0, 8);
        renderPresets();
        renderSliders();
        saveSettings();
    }

    function renderPicker(host, tab) {
        host.innerHTML = '';
        const params = currentParams();
        if (tab === 'sticker') {
            CameraFilterPipeline.STICKERS.forEach((item) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cam-picker-card' + ((params.sticker || 'none') === item.id ? ' active' : '');
                const stickerIco = {
                    none: 'circle', hearts: 'heart', stars: 'sparkles', blush: 'smile',
                    catEars: 'smile', glasses: 'scan', crown: 'crown', fire: 'flame',
                    sparkles: 'sparkles', rainbow: 'palette'
                };
                btn.innerHTML = `<span class="swatch">${ico(stickerIco[item.id] || 'tag', 20)}</span><span class="label">${item.label}</span>`;
                btn.onclick = () => setSticker(item.id);
                host.appendChild(btn);
            });
        } else if (tab === 'background') {
            CameraFilterPipeline.BACKGROUNDS.forEach((item) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cam-picker-card' + ((params.background || 'none') === item.id ? ' active' : '');
                btn.innerHTML = `<span class="swatch" style="background:linear-gradient(135deg,${item.colors[0]},${item.colors[1]})"></span><span class="label">${item.label}</span>`;
                btn.onclick = () => setBackground(item.id);
                host.appendChild(btn);
            });
        } else if (tab === 'anim') {
            CameraFilterPipeline.FACE_ANIMS.forEach((item) => {
                const iconMap = { none: 'circle', sparkle: 'sparkles', heartRain: 'heart', neonPulse: 'zap', bubble: 'droplet', confetti: 'flame' };
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cam-picker-card' + ((params.faceAnim || 'none') === item.id ? ' active' : '');
                btn.innerHTML = `<span class="swatch">${ico(iconMap[item.id] || 'sparkles', 20)}</span><span class="label">${item.label}</span>`;
                btn.onclick = () => setFaceAnim(item.id);
                host.appendChild(btn);
            });
        }
    }

    function renderSliders() {
        const tab = settings.adjustTab || 'beauty';
        const groups = CameraFilterPipeline.SLIDER_GROUPS[tab] || CameraFilterPipeline.SLIDER_GROUPS.beauty;
        const cols = [$('camSliderCol1'), $('camSliderCol2'), $('camSliderCol3')];
        const params = currentParams();
        cols.forEach((col, idx) => {
            if (!col) return;
            col.innerHTML = '';
            (groups[idx] || []).forEach((spec) => {
                const wrap = document.createElement('div');
                wrap.className = 'cam-slider-row';
                const val = params[spec.key] ?? 0;
                wrap.innerHTML = `<label>${spec.label} <span>${val}</span></label>
                    <input type="range" min="${spec.min}" max="${spec.max}" step="1" value="${val}" data-key="${spec.key}">`;
                const input = wrap.querySelector('input');
                const span = wrap.querySelector('span');
                input.oninput = () => {
                    const v = parseFloat(input.value);
                    span.textContent = String(v);
                    if (!settings.params) settings.params = { ...params };
                    settings.params[spec.key] = v;
                    settings.preset = 'custom';
                    if (pipeline) pipeline.setParams({ [spec.key]: v });
                    renderPresets();
                    saveSettings();
                };
                col.appendChild(wrap);
            });
        });
    }

    function renderEffectCats(filterText) {
        const host = $('camEffectCats');
        if (!host) return;
        const q = (filterText || '').trim().toLowerCase();
        const MAIN_CATS = ['face', 'beauty', 'color', 'lut', 'background', 'blur', 'overlay', 'sticker'];
        host.innerHTML = '';
        CameraFilterPipeline.EFFECT_CATS.forEach((cat) => {
            if (!q && !MAIN_CATS.includes(cat.id)) return;
            if (q && !cat.label.toLowerCase().includes(q) && !cat.id.includes(q)) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cam-effect-cat' + (settings.effectCat === cat.id ? ' active' : '');
            const iconName = (window.CamIcons?.CAT_ICONS && CamIcons.CAT_ICONS[cat.id]) || cat.icon || 'circle';
            btn.innerHTML = `${ico(iconName, 18)}<span>${cat.label}</span>`;
            btn.onclick = () => {
                settings.effectCat = cat.id;
                mapEffectCatToTab(cat.id);
                renderEffectCats(q);
                saveSettings();
            };
            host.appendChild(btn);
        });
    }

    function mapEffectCatToTab(catId) {
        const map = {
            face: 'face', beauty: 'beauty', color: 'color', lut: 'lut',
            background: 'background', blur: 'blur', overlay: 'overlay',
            neon: 'overlay', ai: 'ai', funny: 'sticker', sticker: 'sticker', anim: 'anim'
        };
        const tab = map[catId] || 'beauty';
        settings.adjustTab = tab;
        document.querySelectorAll('.cam-adjust-tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.tab === tab);
        });
        if (catId === 'neon') {
            if (!settings.params) settings.params = currentParams();
            settings.params.overlay = 'neon';
            settings.layers = settings.layers.map((l) => l.id === 'neon' ? { ...l, visible: true } : l);
            if (pipeline) pipeline.setOverlay('neon');
            renderLayers();
        }
        if (catId === 'funny') {
            setSticker('catEars');
            setFaceAnim('heartRain');
        }
        renderPresets();
        renderSliders();
    }

    function renderFavorites() {
        const row = $('camFavRow');
        if (!row) return;
        row.innerHTML = '';
        settings.favorites.forEach((key) => {
            const meta = CameraFilterPipeline.PRESET_META[key];
            if (!meta) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cam-fav-chip' + (settings.preset === key ? ' active' : '');
            btn.innerHTML = `${ico('heart', 12)} ${meta.label}`;
            btn.onclick = () => applyPreset(key);
            row.appendChild(btn);
        });
    }

    function renderLayers() {
        const list = $('camLayerList');
        if (!list) return;
        list.innerHTML = '';
        settings.layers.forEach((layer, i) => {
            const row = document.createElement('div');
            row.className = 'cam-layer-item' + (layer.visible ? '' : ' off');
            const idx = String(i + 1).padStart(2, '0');
            row.innerHTML = `<span class="idx">${idx}</span><span class="name">${layer.name}</span>
                <button type="button" title="Toggle">${ico(layer.visible ? 'eye' : 'eyeOff', 14)}</button>`;
            row.querySelector('button').onclick = () => {
                layer.visible = !layer.visible;
                syncLayersToPipeline();
                renderLayers();
                saveSettings();
            };
            list.appendChild(row);
        });
    }

    function renderQuickModes() {
        const host = $('camQuickModes');
        if (!host) return;
        const modes = [
            { id: 'streaming', label: 'Streaming', preset: 'streamPro' },
            { id: 'softSkin', label: 'Soft Skin', preset: 'softSkin' },
            { id: 'softBeauty', label: 'Soft Beauty', preset: 'softBeauty' },
            { id: 'natural', label: 'Normal', preset: 'natural' },
            { id: 'vintage', label: 'Vintage', preset: 'vintage' },
            { id: 'cyberpunk', label: 'Cyberpunk', preset: 'cyberpunk' },
            { id: 'bw', label: 'B&W', preset: 'bw' },
            { id: 'vhs', label: 'VHS', preset: 'vhsGlitch' }
        ];
        host.innerHTML = '';
        modes.forEach((m) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cam-quick-btn' + (settings.quickMode === m.id ? ' active' : '');
            btn.textContent = m.label;
            btn.onclick = () => {
                settings.quickMode = m.id;
                if (m.preset) applyPreset(m.preset);
                renderQuickModes();
                saveSettings();
            };
            host.appendChild(btn);
        });
    }

    function renderResPills() {
        document.querySelectorAll('.cam-res-pill').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.res === settings.resolution);
            btn.onclick = () => {
                settings.resolution = btn.dataset.res;
                const sel = $('camResolutionSelect');
                if (sel) sel.value = settings.resolution;
                renderResPills();
                saveSettings();
                if (stream) startPreview();
            };
        });
        const sel = $('camResolutionSelect');
        if (sel) sel.value = settings.resolution;
    }

    function toggleFavorite(key) {
        if (settings.favorites.includes(key)) {
            settings.favorites = settings.favorites.filter((x) => x !== key);
        } else {
            settings.favorites = [key, ...settings.favorites].slice(0, 12);
        }
        renderPresets();
        renderFavorites();
        saveSettings();
    }

    function applyPreset(name) {
        settings.preset = name;
        if (pipeline) {
            pipeline.applyPreset(name);
            settings.params = pipeline.getParams();
            syncLayersToPipeline();
        } else if (CameraFilterPipeline.PRESETS[name]) {
            settings.params = { ...CameraFilterPipeline.DEFAULT_PARAMS, ...CameraFilterPipeline.PRESETS[name] };
        }
        if (settings.params?.sticker && settings.params.sticker !== 'none') {
            settings.layers = settings.layers.map((l) => l.id === 'sticker' ? { ...l, visible: true } : l);
        }
        if (settings.params?.background && settings.params.background !== 'none') {
            settings.layers = settings.layers.map((l) => l.id === 'background' ? { ...l, visible: true } : l);
        }
        pushRecent(name);
        renderPresets();
        renderSliders();
        renderFavorites();
        renderLayers();
        saveSettings();
    }

    function setSticker(id) {
        if (!settings.params) settings.params = currentParams();
        settings.params.sticker = id;
        settings.preset = 'custom';
        settings.layers = settings.layers.map((l) => l.id === 'sticker' ? { ...l, visible: id !== 'none' } : l);
        if (pipeline) pipeline.setSticker(id);
        renderPresets();
        renderLayers();
        saveSettings();
    }

    function setBackground(id) {
        if (!settings.params) settings.params = currentParams();
        settings.params.background = id;
        settings.preset = 'custom';
        settings.layers = settings.layers.map((l) => l.id === 'background' ? { ...l, visible: true } : l);
        if (pipeline) pipeline.setBackground(id);
        renderPresets();
        renderLayers();
        saveSettings();
    }

    function setFaceAnim(id) {
        if (!settings.params) settings.params = currentParams();
        settings.params.faceAnim = id;
        settings.preset = 'custom';
        if (id !== 'none') {
            settings.layers = settings.layers.map((l) => l.id === 'particles' ? { ...l, visible: true } : l);
        }
        if (pipeline) pipeline.setFaceAnim(id);
        renderPresets();
        renderLayers();
        saveSettings();
    }

    function pushRecent(name) {
        settings.recent = [name, ...(settings.recent || []).filter((x) => x !== name)].slice(0, 8);
    }

    async function refreshDevices() {
        const select = $('camDeviceSelect');
        if (!select) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter((d) => d.kind === 'videoinput');
            select.innerHTML = '';
            if (!cams.length) {
                select.innerHTML = '<option value="">ไม่พบกล้อง</option>';
                return;
            }
            cams.forEach((d, i) => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.textContent = d.label || `Camera ${i + 1}`;
                select.appendChild(opt);
            });
            if (settings.deviceId && cams.some((c) => c.deviceId === settings.deviceId)) select.value = settings.deviceId;
            else {
                settings.deviceId = cams[0].deviceId;
                select.value = settings.deviceId;
            }
            select.onchange = () => {
                settings.deviceId = select.value;
                saveSettings();
                if (stream) startPreview();
            };
        } catch (_) {
            select.innerHTML = '<option value="">ขอสิทธิ์กล้องก่อน</option>';
        }
    }

    function setLive(on) {
        const el = $('camLiveBadge');
        if (el) el.classList.toggle('on', !!on);
        const btn = $('camBtnStartPreview');
        if (btn) {
            btn.innerHTML = on
                ? `${ico('circle', 14)} Stop Camera`
                : `${ico('play', 14)} Start Camera`;
        }
        const empty = $('camPreviewEmpty');
        if (empty) empty.classList.toggle('hide', !!on);
    }

    function setVcamUi(on) {
        const toggle = $('camVcamToggle');
        const label = $('camVcamLabel');
        if (toggle) toggle.checked = !!on;
        if (label) label.textContent = on ? 'ON' : 'OFF';
    }

    async function togglePreview() {
        if (stream) stopPreview();
        else await startPreview();
    }

    async function startPreview() {
        await ensureFilterLib();
        const video = $('camRawVideo');
        const canvas = $('camPreviewCanvas');
        if (!video || !canvas) return;

        stopLoop();
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }

        const resSelect = $('camResolutionSelect');
        if (resSelect && resSelect.value) settings.resolution = resSelect.value;
        const { width, height } = parseResolution(settings.resolution);
        canvas.width = width;
        canvas.height = height;
        const resPill = $('camResPill');
        if (resPill) resPill.textContent = `${width} × ${height}`;
        renderResPills();

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
                    width: { ideal: width },
                    height: { ideal: height },
                    frameRate: { ideal: settings.fps || 60, max: settings.fps || 60 }
                }
            });
        } catch (err) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เปิดกล้องไม่สำเร็จ', err.message || 'ตรวจสิทธิ์กล้อง');
            }
            return;
        }

        video.srcObject = stream;
        await video.play().catch(() => {});
        await refreshDevices();

        pipeline = CameraFilterPipeline.createPipeline(canvas);
        applyParamsToPipeline();
        try { pipeline.ensureFaceSystems?.(); } catch (_) { /* ignore */ }
        setLive(true);
        saveSettings();
        tick();
    }

    function stopLoop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    function stopPreview() {
        stopOutput(false);
        stopRecord(true);
        stopLoop();
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
        const video = $('camRawVideo');
        if (video) video.srcObject = null;
        pipeline = null;
        setLive(false);
        const fpsPill = $('camFpsPill');
        if (fpsPill) fpsPill.textContent = '— FPS';
    }

    function tick() {
        const video = $('camRawVideo');
        if (!pipeline || !video || !stream) return;
        pipeline.drawFrame(video);
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLast >= 1000) {
            const fpsPill = $('camFpsPill');
            if (fpsPill) fpsPill.textContent = `${fpsFrames} FPS`;
            fpsFrames = 0;
            fpsLast = now;
            const facePill = $('camFacePill');
            if (facePill) {
                const st = pipeline.getFaceStatus?.() || 'idle';
                const on = st === 'tracking' || st === 'ready';
                const label = on
                    ? 'Face Mesh ON'
                    : (st === 'fallback' ? 'Face Warp (geo)' : (st === 'no-face' ? 'No Face' : 'Face Tracking OFF'));
                facePill.innerHTML = `${ico('scan', 12)} ${label}`;
                facePill.dataset.state = on ? 'on' : 'off';
            }
        }
        if (outputActive) broadcastFrame();
        rafId = requestAnimationFrame(tick);
    }

    function getBroadcastChannel() {
        if (!bc) {
            try { bc = new BroadcastChannel(FRAME_CHANNEL); } catch (_) { bc = null; }
        }
        return bc;
    }

    function broadcastFrame() {
        const now = performance.now();
        if (now - lastBroadcastAt < 66) return;
        lastBroadcastAt = now;
        const canvas = $('camPreviewCanvas');
        if (!canvas) return;
        const channel = getBroadcastChannel();
        canvas.toBlob((blob) => {
            if (!blob) return;
            blob.arrayBuffer().then((buf) => {
                if (channel) {
                    try { channel.postMessage(buf); } catch (_) { /* ignore */ }
                }
                const ipc = getIpc();
                if (ipc && outputActive) {
                    const bytes = new Uint8Array(buf);
                    let binary = '';
                    const chunk = 0x8000;
                    for (let i = 0; i < bytes.length; i += chunk) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                    }
                    ipc.send('camera:vcam-frame', {
                        mime: 'image/jpeg',
                        data: btoa(binary),
                        width: canvas.width,
                        height: canvas.height
                    });
                }
            }).catch(() => {});
        }, 'image/jpeg', 0.72);
    }

    async function onVcamToggle(on) {
        if (on) await startOutput();
        else await stopOutput(true);
    }

    async function startOutput() {
        if (!stream) await startPreview();
        if (!stream) {
            setVcamUi(false);
            return;
        }
        outputActive = true;
        setVcamUi(true);
        const ipc = getIpc();
        if (ipc) {
            try {
                const result = await ipc.invoke('camera:vcam-start', {
                    width: $('camPreviewCanvas')?.width || 1920,
                    height: $('camPreviewCanvas')?.height || 1080,
                    fps: 30
                });
                updateVcamStatus(result);
            } catch (err) {
                console.warn('[CameraStudio] vcam-start', err);
            }
        } else {
            openMirrorWindow();
        }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'TokControl Virtual Cam', 'เปิดส่งภาพแล้ว — ใน OBS / TikTok Live Studio เลือก “TokControl Virtual Camera”');
        }
    }

    async function stopOutput(updateToggle) {
        outputActive = false;
        if (updateToggle !== false) setVcamUi(false);
        const ipc = getIpc();
        if (ipc) {
            try { await ipc.invoke('camera:vcam-stop'); } catch (_) { /* ignore */ }
        }
    }

    function openMirrorWindow() {
        const ipc = getIpc();
        if (ipc) ipc.send('camera:open-mirror');
        else window.open('/camera-mirror.html', 'TokControlCam', 'width=1280,height=720');
    }

    function copyMirrorUrl() {
        const url = $('camMirrorUrl')?.textContent || 'http://127.0.0.1:3000/camera-mirror.html';
        navigator.clipboard?.writeText(url).then(() => {
            if (typeof showCustomMsg === 'function') showCustomMsg('success', 'คัดลอกแล้ว', url);
        }).catch(() => {});
    }

    async function installVcamDriver() {
        const ipc = getIpc();
        if (!ipc) return;
        try {
            const result = await ipc.invoke('camera:vcam-install');
            updateVcamStatus(result);
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(result.ok ? 'success' : 'info', 'TokControl Virtual Cam', result.message || '');
            }
        } catch (err) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ติดตั้งไม่สำเร็จ', err.message || String(err));
        }
    }

    async function fixVcamDriver() {
        const ipc = getIpc();
        if (!ipc) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('info', 'TokControl Virtual Cam', 'ฟังก์ชันซ่อมแซมไดรเวอร์ใช้ได้ในแอป Desktop เท่านั้น');
            }
            return;
        }
        try {
            const result = await ipc.invoke('camera:vcam-fix');
            updateVcamStatus(result);
            if (typeof showCustomMsg === 'function') {
                showCustomMsg(result.ok ? 'success' : 'info', 'ซ่อมแซมไดรเวอร์', result.message || '');
            }
        } catch (err) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'ซ่อมแซมไม่สำเร็จ', err.message || String(err));
        }
    }

    async function showAntivirusHelp() {
        const ipc = getIpc();
        if (ipc) {
            try {
                await ipc.invoke('camera:vcam-antivirus-info');
                return;
            } catch (_) { /* fall through */ }
        }
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(
                'info',
                'Antivirus / Windows Defender',
                'TokControl Virtual Cam ลงทะเบียน DirectShow Filter (regsvr32) เพื่อให้ OBS / TikTok Studio เห็นกล้อง “TokControl Virtual Camera” — Antivirus อาจแจ้งเตือนเพราะขอสิทธิ์ Admin และลงทะเบียน DLL ระบบ ซึ่งเป็นเรื่องปกติ ให้เพิ่ม TokControl / TokControlCamera.dll ในรายการยกเว้นแล้วกดซ่อมแซมไดรเวอร์อีกครั้ง'
            );
        }
    }

    function updateVcamStatus(result) {
        const el = $('camVcamStatus');
        const alert = $('camVcamAlert');
        const installed = !!result?.installed;
        if (alert) alert.hidden = installed;
        if (el) {
            if (installed) {
                el.hidden = false;
                el.textContent = result?.message || 'สถานะไดรเวอร์: พบ TokControlCamera.dll';
                el.dataset.state = 'ok';
            } else {
                // Avoid duplicate warning cards — alert box is enough when missing
                el.hidden = true;
                el.dataset.state = 'missing';
                el.textContent = result?.message || '';
            }
        }
    }

    async function refreshVcamStatus() {
        const ipc = getIpc();
        if (!ipc) {
            updateVcamStatus({
                installed: false,
                message: 'โหมดเว็บ — ใช้ Mirror / Browser Source หรือเปิดแอป Desktop เพื่อติดตั้ง TokControlCamera.dll'
            });
            return;
        }
        try { updateVcamStatus(await ipc.invoke('camera:vcam-status')); }
        catch (_) {
            updateVcamStatus({
                installed: false,
                message: 'ยังไม่ได้ติดตั้งระบบกล้องเสมือน TokControl Virtual Cam (ไม่พบไฟล์ TokControlCamera.dll)'
            });
        }
    }

    function setMirror(on) {
        settings.mirror = !!on;
        if (pipeline) pipeline.setMirror(settings.mirror);
        saveSettings();
    }

    function resetAdjust() {
        applyPreset(settings.preset !== 'custom' ? settings.preset : 'natural');
    }

    function autoAdjust() {
        applyPreset('softBeauty');
        settings.quickMode = 'softBeauty';
        renderQuickModes();
    }

    function snapshot() {
        const canvas = $('camPreviewCanvas');
        if (!canvas || !stream) return;
        const a = document.createElement('a');
        a.download = `tokcontrol-cam-${Date.now()}.jpg`;
        a.href = canvas.toDataURL('image/jpeg', 0.92);
        a.click();
    }

    function toggleRecord() {
        if (recording) stopRecord(false);
        else startRecord();
    }

    function startRecord() {
        const canvas = $('camPreviewCanvas');
        if (!canvas || !stream) return;
        try {
            const cstream = canvas.captureStream(30);
            recordChunks = [];
            mediaRecorder = new MediaRecorder(cstream, { mimeType: 'video/webm;codecs=vp9' });
            mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordChunks, { type: 'video/webm' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `tokcontrol-cam-${Date.now()}.webm`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            };
            mediaRecorder.start(200);
            recording = true;
            $('camBtnRecord')?.classList.add('recording');
        } catch (err) {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Record', err.message || 'ไม่รองรับการอัด');
        }
    }

    function stopRecord(silent) {
        if (!recording) return;
        recording = false;
        $('camBtnRecord')?.classList.remove('recording');
        try { mediaRecorder?.stop(); } catch (_) { /* ignore */ }
        mediaRecorder = null;
        if (!silent && typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'Record', 'บันทึกคลิปแล้ว');
        }
    }

    function toggleFullscreen() {
        const stage = $('camStage');
        if (!stage) return;
        if (!document.fullscreenElement) stage.requestFullscreen?.();
        else document.exitFullscreen?.();
    }

    function showTutorial() {
        if (typeof showCustomMsg === 'function') {
            showCustomMsg(
                'info',
                'TokControl Camera Studio',
                '1) Start Camera 2) ปรับ Face / Beauty / Tone Filter 3) เปิด TokControl Virtual Cam 4) ใน OBS / TikTok Studio เลือก “TokControl Virtual Camera”'
            );
        }
    }

    function toggleSettings() {
        const guide = $('camTikTokGuide');
        if (guide) guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function exportSettings() {
        saveSettings();
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tokcontrol-camera-settings.json';
        a.click();
    }

    function importSettings() {
        $('camImportFile')?.click();
    }

    function onImportFile(input) {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || '{}'));
                settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...parsed };
                applyParamsToPipeline();
                renderAll();
                saveSettings();
                if (typeof showCustomMsg === 'function') showCustomMsg('success', 'Import', 'โหลดการตั้งค่าแล้ว');
            } catch (_) {
                if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Import', 'ไฟล์ไม่ถูกต้อง');
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    function addOverlayLayer() {
        const id = 'layer_' + Date.now();
        settings.layers.push({ id, name: 'Custom Overlay', visible: true });
        if (!settings.params) settings.params = currentParams();
        settings.params.overlay = 'sparkle';
        settings.params.faceAnim = settings.params.faceAnim || 'sparkle';
        if (pipeline) {
            pipeline.setOverlay('sparkle');
            pipeline.setFaceAnim(settings.params.faceAnim);
        }
        renderLayers();
        saveSettings();
    }

    function setLibTab(tab) {
        settings.libTab = tab;
        document.querySelectorAll('.cam-side-tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.lib === tab);
        });
        if (tab === 'recent') {
            const row = $('camFavRow');
            if (!row) return;
            row.innerHTML = '';
            (settings.recent || []).forEach((key) => {
                const meta = CameraFilterPipeline.PRESET_META[key];
                if (!meta) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cam-fav-chip';
                btn.textContent = meta.label;
                btn.onclick = () => applyPreset(key);
                row.appendChild(btn);
            });
        } else {
            renderFavorites();
        }
        saveSettings();
    }

    function filterEffects(q) {
        renderEffectCats(q);
    }

    function bindTabs() {
        document.querySelectorAll('.cam-adjust-tab').forEach((btn) => {
            btn.onclick = () => {
                settings.adjustTab = btn.dataset.tab;
                document.querySelectorAll('.cam-adjust-tab').forEach((el) => {
                    el.classList.toggle('active', el === btn);
                });
                renderPresets();
                renderSliders();
                saveSettings();
            };
        });
    }

    function renderAll() {
        renderResPills();
        renderPresets();
        renderSliders();
        renderEffectCats();
        renderFavorites();
        renderLayers();
        renderQuickModes();
        const mirror = $('camMirrorToggle');
        if (mirror) mirror.checked = !!settings.mirror;
        document.querySelectorAll('.cam-adjust-tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.tab === settings.adjustTab);
        });
        document.querySelectorAll('.cam-side-tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.lib === settings.libTab);
        });
        setVcamUi(outputActive);
    }

    async function init() {
        if (inited) {
            renderAll();
            await refreshDevices();
            await refreshVcamStatus();
            return;
        }
        await ensureFilterLib();
        loadSettings();
        hydrateTabIcons();
        bindTabs();
        const fpsSel = $('camFpsSelect');
        if (fpsSel) {
            fpsSel.value = String(settings.fps || 60);
            fpsSel.onchange = () => {
                settings.fps = parseInt(fpsSel.value, 10) || 60;
                saveSettings();
                if (stream) startPreview();
            };
        }
        document.querySelectorAll('#camFpsPills .cam-res-pill').forEach((btn) => {
            btn.classList.toggle('active', String(btn.dataset.fps) === String(settings.fps || 60));
        });
        const res = $('camResolutionSelect');
        if (res) {
            res.onchange = () => {
                settings.resolution = res.value;
                renderResPills();
                saveSettings();
                if (stream) startPreview();
            };
        }
        renderAll();
        await refreshDevices();
        await refreshVcamStatus();
        inited = true;
    }

    window.CameraStudio = {
        init,
        togglePreview,
        startPreview,
        stopPreview,
        startOutput,
        stopOutput,
        onVcamToggle,
        openMirrorWindow,
        copyMirrorUrl,
        installVcamDriver,
        fixVcamDriver,
        refreshVcamStatus,
        showAntivirusHelp,
        setMirror,
        resetAdjust,
        autoAdjust,
        snapshot,
        toggleRecord,
        toggleFullscreen,
        showTutorial,
        toggleSettings,
        exportSettings,
        importSettings,
        onImportFile,
        addOverlayLayer,
        setLibTab,
        filterEffects,
        applyPreset,
        applyTone,
        setFps(v) {
            settings.fps = parseInt(v, 10) || 60;
            const sel = $('camFpsSelect');
            if (sel) sel.value = String(settings.fps);
            document.querySelectorAll('#camFpsPills .cam-res-pill').forEach((btn) => {
                btn.classList.toggle('active', String(btn.dataset.fps) === String(settings.fps));
            });
            saveSettings();
            if (stream) startPreview();
        }
    };

    if (document.getElementById('cameraView')?.classList.contains('active')) init();
})();
