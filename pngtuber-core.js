(function (global) {
    'use strict';

    const DEFAULT_SETTINGS = {
        enabled: true,
        captureMic: true,
        audioSource: 'overlay',
        idleImage: null,
        talkImage: null,
        blinkImage: null,
        actionImage: null,
        useBlink: true,
        micThresholdNorm: 0.02,
        micSmoothing: 0.2,
        micGain: 3.6,
        micDeviceId: '',
        bounceMode: 'soft',
        speakEffect: 'glow',
        auraColor: '#bc13fe',
        auraEnabled: true,
        scale: 1,
        flipX: false,
        widgetX: 14,
        widgetY: 78,
        widgetPosition: 'bottom-left',
        blinkMinSec: 3.5,
        blinkMaxSec: 8,
        blinkDurationMs: 140,
        hotkeyTalk: '',
        hotkeyAction: '',
        hotkeyBlink: '',
        manualState: null,
        throwGiftsEnabled: true,
        throwMinCoins: 1,
        throwVolume: 70,
        throwSpeed: 1
    };

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function migrateSettings(raw) {
        const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
        if (s.micThresholdNorm == null && s.micThreshold != null) {
            s.micThresholdNorm = clamp(Number(s.micThreshold) / 100, 0.005, 0.2);
        }
        if (s.micSmoothing == null && s.smoothRelease != null) {
            s.micSmoothing = clamp(Number(s.smoothRelease), 0.05, 0.95);
        }
        return s;
    }

    function mergeSettings(base, patch) {
        return migrateSettings({ ...(base || {}), ...(patch || {}) });
    }

    class PngTuberEngine {
        constructor(options) {
            options = options || {};
            this.settings = mergeSettings(options.settings);
            this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : function () {};
            this.onLevel = typeof options.onLevel === 'function' ? options.onLevel : function () {};
            this.state = 'idle';
            this.level = 0;
            this.smoothedLevel = 0;
            this.talking = false;
            this.remoteTalking = false;
            this.audioCtx = null;
            this.analyser = null;
            this.micStream = null;
            this.micSource = null;
            this.dataArray = null;
            this.rafId = null;
            this.blinkTimer = null;
            this.blinkEndTimer = null;
            this.running = false;
            this.micActive = false;
            this._lastTickMs = 0;
        }

        updateSettings(patch) {
            this.settings = mergeSettings(this.settings, patch);
            if (this.analyser) {
                this.analyser.smoothingTimeConstant = clamp(this.settings.micSmoothing || 0.2, 0.05, 0.95);
            }
            if (!this.settings.useBlink) this._clearBlinkTimers();
        }

        setManualState(state) {
            this.settings.manualState = state || null;
            this._emitState();
        }

        getDisplayState() {
            if (this.settings.manualState) return this.settings.manualState;
            if (this.state === 'action') return 'action';
            if (this.state === 'blink') return 'blink';
            // While capturing locally (panel preview / OBS self-capture), drive
            // talk state from the live mic. Overlay pages in "panel" mode with
            // no mic use remoteTalking from the desktop app instead.
            if (this.micActive) {
                return this.talking ? 'talk' : 'idle';
            }
            if (this.settings.audioSource === 'panel') {
                return this.remoteTalking ? 'talk' : 'idle';
            }
            return this.talking ? 'talk' : 'idle';
        }

        setRemoteTalking(value) {
            this.remoteTalking = !!value;
            this._emitState();
        }

        async startMic(deviceId) {
            this.stopMic();
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('เบราว์เซอร์ไม่รองรับไมโครโฟน');
            }
            const id = (deviceId && String(deviceId).trim()) || '';
            const tryGet = (audio) => navigator.mediaDevices.getUserMedia({ audio });
            // Cascade constraints — some devices / exclusive-mode apps reject AEC/NS/AGC
            // or exact deviceId. Prefer ideal deviceId so we still open a mic.
            const constraintSets = [];
            if (id) {
                constraintSets.push({ deviceId: { ideal: id } });
                constraintSets.push({
                    deviceId: { ideal: id },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                });
                constraintSets.push({ deviceId: { exact: id } });
            }
            // แบบเวอร์ชันเก่า: เปิดไมค์เริ่มต้นด้วย { audio: true }
            constraintSets.push(true);
            constraintSets.push({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            });

            let lastErr = null;
            for (const audio of constraintSets) {
                try {
                    this.micStream = await tryGet(audio);
                    lastErr = null;
                    break;
                } catch (err) {
                    lastErr = err;
                    this.micStream = null;
                }
            }
            if (!this.micStream) {
                const name = lastErr && (lastErr.name || lastErr.message) ? String(lastErr.name || lastErr.message) : '';
                if (/NotAllowed|Permission/i.test(name + (lastErr && lastErr.message || ''))) {
                    throw new Error('ไม่อนุญาตไมโครโฟน — เปิดสิทธิ์ไมค์ใน Windows / TokControl');
                }
                if (/NotReadable|AbortError|Busy|in use/i.test(name + (lastErr && lastErr.message || ''))) {
                    throw new Error('ไมค์ถูกใช้งานอยู่ (เช่น OBS Exclusive Mode) — ปิด Exclusive หรือเลือกไมค์อื่น');
                }
                if (/NotFound|DevicesNotFound/i.test(name + (lastErr && lastErr.message || ''))) {
                    throw new Error('ไม่พบไมโครโฟน — เสียบไมค์แล้วกดรีเฟรช');
                }
                throw lastErr || new Error('ไม่สามารถเปิดไมค์ได้');
            }

            const tracks = this.micStream.getAudioTracks();
            if (!tracks.length) {
                this.stopMic();
                throw new Error('สตรีมไมค์ไม่มีแทร็กเสียง');
            }
            tracks.forEach((t) => {
                try { t.enabled = true; } catch (e) { /* ignore */ }
            });

            const AC = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AC();
            if (this.audioCtx.state === 'suspended') {
                try { await this.audioCtx.resume(); } catch (e) { /* gesture may be required */ }
            }
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = clamp(this.settings.micSmoothing || 0.2, 0.05, 0.95);
            this.dataArray = new Uint8Array(this.analyser.fftSize);
            this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
            this.micSource.connect(this.analyser);
            this.micActive = true;
            // Keep context alive if Chromium suspends it after tab switches.
            if (typeof this.audioCtx.addEventListener === 'function') {
                this.audioCtx.addEventListener('statechange', () => {
                    if (this.micActive && this.audioCtx && this.audioCtx.state === 'suspended') {
                        this.audioCtx.resume().catch(() => {});
                    }
                });
            }
        }

        stopMic() {
            this.micActive = false;
            if (this.micStream) this.micStream.getTracks().forEach((track) => track.stop());
            this.micStream = null;
            this.micSource = null;
            this.analyser = null;
            this.dataArray = null;
            if (this.audioCtx) {
                try { this.audioCtx.close(); } catch (e) { /* ignore */ }
            }
            this.audioCtx = null;
        }

        start() {
            if (this.running) return;
            this.running = true;
            this._lastTickMs = 0;
            this._scheduleBlink();
            this._tick();
        }

        stop() {
            this.running = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this._clearBlinkTimers();
            this.stopMic();
        }

        _tick() {
            if (!this.running) return;
            const now = performance.now();
            if (this._lastTickMs > 0 && now - this._lastTickMs < 33) {
                this.rafId = requestAnimationFrame(() => this._tick());
                return;
            }
            this._lastTickMs = now;
            this._sampleMic();
            this._emitState();
            this.rafId = requestAnimationFrame(() => this._tick());
        }

        _sampleMic() {
            if (!this.micActive || !this.analyser || !this.dataArray) {
                this.level = 0;
                this.onLevel(0, this.smoothedLevel, false);
                return;
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
            }
            this.analyser.getByteTimeDomainData(this.dataArray);
            let sum = 0;
            let peak = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                const v = (this.dataArray[i] - 128) / 128;
                const abs = Math.abs(v);
                if (abs > peak) peak = abs;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / this.dataArray.length);
            // Blend RMS + peak so quiet mics still move the meter.
            const raw = Math.max(rms * 2.4, peak * 1.05);
            this.level = clamp(raw * (this.settings.micGain || 3.6), 0, 1);

            const threshold = this.settings.micThresholdNorm ?? 0.02;
            const smooth = clamp(this.settings.micSmoothing || 0.2, 0.05, 0.95);
            this.smoothedLevel += (this.level - this.smoothedLevel) * (this.talking ? smooth : smooth * 0.65);

            const wasTalking = this.talking;
            this.talking = this.smoothedLevel >= threshold;

            if (wasTalking && !this.talking && this.state === 'blink') this.state = 'idle';
            if (this.talking && this.state === 'blink') {
                this._clearBlinkTimers();
                this.state = 'idle';
            }
            if (this.state === 'action' && !this.settings.manualState) this.state = 'idle';

            this.onLevel(this.level, this.smoothedLevel, this.talking);
        }

        _emitState() {
            const next = this.getDisplayState();
            if (this.state !== 'blink' && this.state !== 'action') this.state = next;
            else if (this.settings.manualState) this.state = next;
            this.onStateChange(this.state, this.getDisplayState());
        }

        _clearBlinkTimers() {
            if (this.blinkTimer) clearTimeout(this.blinkTimer);
            if (this.blinkEndTimer) clearTimeout(this.blinkEndTimer);
            this.blinkTimer = null;
            this.blinkEndTimer = null;
        }

        _scheduleBlink() {
            this._clearBlinkTimers();
            if (!this.settings.useBlink || !this.settings.blinkImage) return;
            const minMs = Math.max(1, (this.settings.blinkMinSec || 3.5)) * 1000;
            const maxMs = Math.max(minMs + 500, (this.settings.blinkMaxSec || 8) * 1000);
            const wait = minMs + Math.random() * (maxMs - minMs);
            this.blinkTimer = setTimeout(() => {
                if (!this.running || this.talking || this.remoteTalking || this.settings.manualState) {
                    this._scheduleBlink();
                    return;
                }
                this.state = 'blink';
                this._emitState();
                this.blinkEndTimer = setTimeout(() => {
                    if (!this.talking && !this.remoteTalking && !this.settings.manualState) this.state = 'idle';
                    this._emitState();
                    this._scheduleBlink();
                }, Math.max(60, this.settings.blinkDurationMs || 140));
            }, wait);
        }

        destroy() {
            this.stop();
        }
    }

    function resolveImage(settings, state) {
        const s = mergeSettings(settings);
        if (state === 'talk' && s.talkImage) return resolveAssetUrl(s.talkImage);
        if (state === 'blink' && s.blinkImage) return resolveAssetUrl(s.blinkImage);
        if (state === 'action' && s.actionImage) return resolveAssetUrl(s.actionImage);
        return resolveAssetUrl(s.idleImage || s.talkImage || s.actionImage || '');
    }

    function stripToRelativeAssetUrl(src) {
        if (!src || typeof src !== 'string') return src || null;
        if (src.startsWith('data:') || src.startsWith('blob:')) return src;
        if (src.startsWith('/api/') || src.startsWith('/assets/')) return src;
        try {
            const parsed = new URL(src);
            if (parsed.pathname && parsed.pathname.startsWith('/api/')) return parsed.pathname + (parsed.search || '');
        } catch (e) { /* relative path */ }
        return src;
    }

    function resolveAssetUrl(src) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
            return src;
        }
        if (src.startsWith('/api/') || src.startsWith('/assets/')) {
            const origin = (typeof global !== 'undefined' && global.location && global.location.origin) ? global.location.origin : '';
            return origin ? origin + src : src;
        }
        return src;
    }

    function applyDomState(rootEl, auraEl, imgEl, settings, state, wrapEl) {
        if (!rootEl || !imgEl) return;
        const s = mergeSettings(settings);
        const display = state || 'idle';
        const talking = display === 'talk';
        const wrap = wrapEl || imgEl.parentElement;

        rootEl.style.display = s.enabled === false ? 'none' : 'block';
        rootEl.style.left = clamp(s.widgetX, 0, 100) + '%';
        rootEl.style.top = clamp(s.widgetY, 0, 100) + '%';
        const scale = Math.max(0.2, s.scale || 1);
        const flip = s.flipX ? ' scaleX(-1)' : '';
        rootEl.style.transform = 'translate(-50%, -50%) scale(' + scale + ')' + flip;

        const src = resolveImage(s, display);
        const resolved = src ? resolveAssetUrl(src) : '';
        if (wrap) {
            wrap.classList.toggle('pt-no-image', !resolved);
            wrap.classList.toggle('pt-loading', !!resolved && !imgEl.complete);
        }
        if (resolved) {
            const prev = imgEl.getAttribute('data-src') || '';
            if (prev !== resolved || !imgEl.naturalWidth) {
                imgEl.setAttribute('data-src', resolved);
                imgEl.removeAttribute('src');
                imgEl.src = resolved;
            }
            imgEl.style.display = 'block';
        } else {
            imgEl.removeAttribute('data-src');
            imgEl.removeAttribute('src');
            imgEl.style.display = 'none';
            imgEl.style.opacity = '0';
        }
        imgEl.onerror = () => {
            if (wrap) {
                wrap.classList.add('pt-no-image');
                wrap.classList.remove('pt-loading');
            }
            imgEl.style.opacity = '0';
            imgEl.style.display = 'none';
        };
        imgEl.onload = () => {
            if (wrap) {
                wrap.classList.remove('pt-no-image', 'pt-loading');
            }
            imgEl.style.opacity = resolved ? '1' : '0';
            imgEl.style.display = resolved ? 'block' : 'none';
        };

        imgEl.classList.remove('pt-bounce-soft', 'pt-bounce-lively', 'pt-fx-glow', 'pt-fx-pulse', 'pt-talking');
        if (talking) imgEl.classList.add('pt-talking');
        if (talking && s.bounceMode === 'soft') imgEl.classList.add('pt-bounce-soft');
        if (talking && s.bounceMode === 'lively') imgEl.classList.add('pt-bounce-lively');
        if (talking && s.speakEffect === 'glow') imgEl.classList.add('pt-fx-glow');
        if (talking && s.speakEffect === 'pulse') imgEl.classList.add('pt-fx-pulse');

        if (auraEl) {
            const showAura = s.auraEnabled !== false && talking && s.speakEffect !== 'none';
            auraEl.style.display = showAura ? 'block' : 'none';
            auraEl.style.background = 'radial-gradient(circle, ' + (s.auraColor || '#bc13fe') + '55 0%, transparent 70%)';
        }
    }

    function resolveGiftIconUrl(gift) {
        const candidates = [gift?.giftIcon, gift?.giftImage, gift?.imageUrl];
        for (const c of candidates) {
            if (!c || typeof c !== 'string') continue;
            if (c.startsWith('http') || c.startsWith('data:') || c.startsWith('//')) return c.startsWith('//') ? 'https:' + c : c;
            if (c.startsWith('/')) return resolveAssetUrl(c);
        }
        return '';
    }

    global.PngTuber = {
        DEFAULT_SETTINGS,
        migrateSettings,
        mergeSettings,
        PngTuberEngine,
        applyDomState,
        resolveImage,
        resolveAssetUrl,
        stripToRelativeAssetUrl,
        resolveGiftIconUrl
    };
})(typeof window !== 'undefined' ? window : global);
