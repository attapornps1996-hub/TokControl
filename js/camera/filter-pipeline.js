/**
 * TokControl Camera Studio — beauty / face / sticker / background pipeline
 */
(function () {
    'use strict';

    const PRESETS = {
        natural: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, softBlur: 0, whitening: 0, sharpen: 0, vignette: 0, overlay: 'none', sticker: 'none', background: 'none', faceAnim: 'none', tone: 'normal', filterIntensity: 100 },
        none: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, softBlur: 0, whitening: 0, sharpen: 0, vignette: 0, faceSlim: 0, eyesEnlarge: 0, overlay: 'none', sticker: 'none', background: 'none', faceAnim: 'none', tone: 'normal', filterIntensity: 0, hdr: 0 },
        softBeauty: { brightness: 6, contrast: 4, saturation: -6, warmth: 8, softBlur: 45, whitening: 18, sharpen: 0, vignette: 8, faceSlim: 18, eyesEnlarge: 12, cheekbones: 10, overlay: 'none', tone: 'softSkin', filterIntensity: 85 },
        softSkin: { brightness: 8, contrast: 2, saturation: -8, warmth: 10, softBlur: 58, whitening: 24, sharpen: -2, faceSlim: 14, cheekbones: 8, tone: 'softSkin', filterIntensity: 90 },
        clean: { brightness: 8, contrast: 8, saturation: -4, warmth: 4, softBlur: 28, whitening: 22, sharpen: 10, faceSlim: 10, jawline: 12 },
        warm: { brightness: 4, contrast: 2, saturation: 8, warmth: 28, softBlur: 10, whitening: 6, vignette: 10 },
        cool: { brightness: 2, contrast: 4, saturation: 4, warmth: -26, softBlur: 8, whitening: 4, sharpen: 6 },
        rosy: { brightness: 6, contrast: 2, saturation: 16, warmth: 18, softBlur: 32, whitening: 20, cheekbones: 16, lipSize: 10, vignette: 12 },
        smooth: { brightness: 5, contrast: 0, saturation: -8, warmth: 6, softBlur: 62, whitening: 16, sharpen: -4, faceSlim: 22 },
        cute: { brightness: 10, contrast: 6, saturation: 18, warmth: 14, softBlur: 38, whitening: 28, eyesEnlarge: 28, noseSlim: 14, sticker: 'hearts', faceAnim: 'sparkle', overlay: 'sparkle' },
        neon: { brightness: 8, contrast: 18, saturation: 42, warmth: -10, softBlur: 5, sharpen: 12, vignette: 20, overlay: 'neon', faceAnim: 'neonPulse' },
        purpleDream: { brightness: 4, contrast: 10, saturation: 20, warmth: -8, softBlur: 22, whitening: 10, vignette: 28, overlay: 'purple', background: 'purpleStudio', sticker: 'stars' },
        warmLight: { brightness: 10, contrast: 4, saturation: 6, warmth: 34, softBlur: 14, whitening: 12 },
        coolBlue: { brightness: 4, contrast: 8, saturation: 10, warmth: -32, softBlur: 6, sharpen: 8, vignette: 14, overlay: 'cyan', background: 'blueStudio' },
        vintage: { brightness: -4, contrast: 12, saturation: -28, warmth: 22, softBlur: 12, vignette: 35, overlay: 'film', grain: 28, tone: 'vintage', filterIntensity: 100 },
        cyberpunk: { brightness: 6, contrast: 22, saturation: 35, warmth: -18, softBlur: 4, sharpen: 14, vignette: 28, tint: 16, overlay: 'neon', faceAnim: 'neonPulse', tone: 'cyberpunk', filterIntensity: 100 },
        bw: { brightness: 2, contrast: 16, saturation: -100, softBlur: 0, sharpen: 8, vignette: 25, tone: 'bw', filterIntensity: 100 },
        vhsGlitch: { brightness: 4, contrast: 18, saturation: -12, warmth: 8, softBlur: 6, vignette: 30, grain: 48, fade: 18, overlay: 'film', tone: 'vhs', filterIntensity: 100 },
        neonPurple: { brightness: 6, contrast: 14, saturation: 30, warmth: -12, softBlur: 8, whitening: 4, overlay: 'neon', faceAnim: 'neonPulse' },
        streamPro: { brightness: 5, contrast: 10, saturation: 4, warmth: 6, softBlur: 20, whitening: 10, sharpen: 8, faceSlim: 14, jawline: 16, eyebrow: 8 },
        idol: { brightness: 10, contrast: 6, saturation: 12, warmth: 12, softBlur: 48, whitening: 26, eyesEnlarge: 22, noseSlim: 18, faceSlim: 28, lipSize: 14, cheekbones: 18, sticker: 'blush' }
    };

    const PRESET_META = {
            natural: { label: 'Normal', colors: ['#2a2a35', '#6b7280'] },
            none: { label: 'None', colors: ['#111018', '#2a2438'] },
            softBeauty: { label: 'Soft Beauty', colors: ['#f9a8d4', '#c084fc'] },
        softSkin: { label: 'Soft Skin หน้าเนียน', colors: ['#fbcfe8', '#f9a8d4'] },
        clean: { label: 'Clean', colors: ['#e5e7eb', '#a5b4fc'] },
        warm: { label: 'Warm', colors: ['#fdba74', '#f59e0b'] },
        cool: { label: 'Cool', colors: ['#67e8f9', '#3b82f6'] },
        rosy: { label: 'Rosy', colors: ['#fb7185', '#f9a8d4'] },
        smooth: { label: 'Smooth', colors: ['#ddd6fe', '#fbcfe8'] },
        cute: { label: 'Cute', colors: ['#f0abfc', '#fda4af'] },
        neon: { label: 'Neon', colors: ['#22d3ee', '#a855f7'] },
        purpleDream: { label: 'Purple Dream', colors: ['#c084fc', '#7c3aed'] },
        warmLight: { label: 'Warm Light', colors: ['#fcd34d', '#fb923c'] },
        coolBlue: { label: 'Cool Blue', colors: ['#38bdf8', '#6366f1'] },
        vintage: { label: 'Vintage', colors: ['#a8a29e', '#78716c'] },
        cyberpunk: { label: 'Cyberpunk', colors: ['#22d3ee', '#f472b6'] },
        bw: { label: 'B&W', colors: ['#111', '#999'] },
        vhsGlitch: { label: 'VHS Glitch', colors: ['#4ade80', '#f87171'] },
        neonPurple: { label: 'Neon Purple', colors: ['#d946ef', '#7e22ce'] },
        streamPro: { label: 'Stream Pro', colors: ['#a78bfa', '#6366f1'] },
        idol: { label: 'Idol Glow', colors: ['#fda4af', '#c084fc'] }
    };

    /** Tone chips shown in Color / LUT tabs */
    const TONE_PRESETS = [
        { id: 'normal', label: 'Normal', preset: 'natural' },
        { id: 'softSkin', label: 'Soft Skin หน้าเนียน', preset: 'softSkin' },
        { id: 'vintage', label: 'Vintage', preset: 'vintage' },
        { id: 'cyberpunk', label: 'Cyberpunk', preset: 'cyberpunk' },
        { id: 'bw', label: 'B&W', preset: 'bw' },
        { id: 'vhs', label: 'VHS Glitch', preset: 'vhsGlitch' }
    ];

    /**
     * Modular LUT / shader registry — drop-in from GitHub CSS/SVG/WebGL/.png/.cube
     * registerLut({ id, label, type: 'css'|'lut3d'|'shader', url?, css?, apply?(ctx,w,h,intensity) })
     */
    const LUT_REGISTRY = {};

    function registerLut(def) {
        if (!def?.id) return false;
        LUT_REGISTRY[def.id] = { ...def };
        return true;
    }

    function listLuts() {
        return Object.values(LUT_REGISTRY);
    }

    // Built-in lightweight “LUT-like” tones (no external file required)
    registerLut({
        id: 'softSkin',
        label: 'Soft Skin',
        type: 'css',
        css: 'brightness(1.06) contrast(0.96) saturate(0.92)'
    });
    registerLut({
        id: 'vintage',
        label: 'Vintage',
        type: 'css',
        css: 'sepia(0.35) contrast(1.12) saturate(0.75) brightness(0.96)'
    });
    registerLut({
        id: 'cyberpunk',
        label: 'Cyberpunk',
        type: 'css',
        css: 'contrast(1.2) saturate(1.35) hue-rotate(-12deg)'
    });
    registerLut({
        id: 'bw',
        label: 'B&W',
        type: 'css',
        css: 'grayscale(1) contrast(1.15)'
    });
    registerLut({
        id: 'vhs',
        label: 'VHS Glitch',
        type: 'shader',
        apply(ctx, w, h, intensity) {
            const a = Math.max(0, Math.min(1, intensity));
            if (a < 0.02) return;
            ctx.save();
            ctx.globalAlpha = 0.08 + a * 0.18;
            ctx.fillStyle = '#4ade80';
            ctx.fillRect(0, Math.random() * h, w, 2 + Math.random() * 3);
            ctx.fillStyle = '#f87171';
            ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 2);
            ctx.globalAlpha = 0.05 + a * 0.12;
            ctx.drawImage(ctx.canvas, 2 + a * 3, 0, w, h, 0, 0, w, h);
            ctx.restore();
        }
    });

    const EFFECT_CATS = [
        { id: 'face', icon: 'smile', label: 'Face' },
        { id: 'beauty', icon: 'sparkles', label: 'Beauty' },
        { id: 'color', icon: 'palette', label: 'Color' },
        { id: 'lut', icon: 'sliders', label: 'LUT' },
        { id: 'background', icon: 'image', label: 'Background' },
        { id: 'blur', icon: 'droplet', label: 'Blur' },
        { id: 'overlay', icon: 'layers', label: 'Overlay' },
        { id: 'sticker', icon: 'tag', label: 'Sticker' },
        { id: 'neon', icon: 'zap', label: 'Neon' },
        { id: 'ai', icon: 'cpu', label: 'AI Effect' },
        { id: 'funny', icon: 'smile', label: 'Funny' },
        { id: 'anim', icon: 'flame', label: 'Anim' }
    ];

    const STICKERS = [
        { id: 'none', label: 'None', emoji: '∅' },
        { id: 'hearts', label: 'Hearts', emoji: '💕' },
        { id: 'stars', label: 'Stars', emoji: '⭐' },
        { id: 'blush', label: 'Blush', emoji: '🌸' },
        { id: 'catEars', label: 'Cat Ears', emoji: '🐱' },
        { id: 'glasses', label: 'Glasses', emoji: '🕶' },
        { id: 'crown', label: 'Crown', emoji: '👑' },
        { id: 'fire', label: 'Fire', emoji: '🔥' },
        { id: 'sparkles', label: 'Sparkle', emoji: '✨' },
        { id: 'rainbow', label: 'Rainbow', emoji: '🌈' }
    ];

    const BACKGROUNDS = [
        { id: 'none', label: 'None', colors: ['#121218', '#1c1c26'] },
        { id: 'purpleStudio', label: 'Purple Studio', colors: ['#2e1065', '#7c3aed'] },
        { id: 'blueStudio', label: 'Blue Studio', colors: ['#0c4a6e', '#38bdf8'] },
        { id: 'pinkStudio', label: 'Pink Studio', colors: ['#831843', '#f472b6'] },
        { id: 'darkStage', label: 'Dark Stage', colors: ['#050505', '#27272a'] },
        { id: 'neonGrid', label: 'Neon Grid', colors: ['#0f0a1a', '#a855f7'] },
        { id: 'sunset', label: 'Sunset', colors: ['#7c2d12', '#fb923c'] },
        { id: 'softWhite', label: 'Soft White', colors: ['#f8fafc', '#e2e8f0'] }
    ];

    const FACE_ANIMS = [
        { id: 'none', label: 'None' },
        { id: 'sparkle', label: 'Sparkle Dust' },
        { id: 'heartRain', label: 'Heart Rain' },
        { id: 'neonPulse', label: 'Neon Pulse' },
        { id: 'bubble', label: 'Bubbles' },
        { id: 'confetti', label: 'Confetti' }
    ];

    const SLIDER_GROUPS = {
        beauty: [
            [
                { key: 'brightness', label: 'Brightness', min: -40, max: 40 },
                { key: 'contrast', label: 'Contrast', min: -40, max: 40 }
            ],
            [
                { key: 'softBlur', label: 'Skin Smooth', min: 0, max: 100 },
                { key: 'faceSlim', label: 'Face Slim', min: 0, max: 100 }
            ]
        ],
        face: [
            [
                { key: 'faceSlim', label: 'Face Slim', min: 0, max: 100 },
                { key: 'jawline', label: 'Jawline', min: 0, max: 100 },
                { key: 'eyesEnlarge', label: 'Eye Size', min: 0, max: 100 },
                { key: 'noseSlim', label: 'Nose Slim', min: 0, max: 100 }
            ],
            [
                { key: 'cheekbones', label: 'Cheekbones', min: 0, max: 100 },
                { key: 'lipSize', label: 'Lips', min: -40, max: 40 },
                { key: 'chinLength', label: 'Chin', min: -40, max: 40 },
                { key: 'eyebrow', label: 'Brows', min: -40, max: 40 }
            ]
        ],
        color: [
            [
                { key: 'brightness', label: 'Brightness', min: -40, max: 40 },
                { key: 'contrast', label: 'Contrast', min: -40, max: 40 },
                { key: 'saturation', label: 'Saturation', min: -100, max: 60 },
                { key: 'warmth', label: 'Warmth', min: -40, max: 40 }
            ],
            [
                { key: 'tint', label: 'Tint', min: -40, max: 40 },
                { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
                { key: 'filterIntensity', label: 'Intensity', min: 0, max: 100 },
                { key: 'sharpen', label: 'Sharpen', min: -20, max: 40 }
            ]
        ],
        background: [
            [{ key: 'bgBlur', label: 'BG Soft Blur', min: 0, max: 100 }, { key: 'bgStrength', label: 'BG Strength', min: 0, max: 100 }],
            [{ key: 'vignette', label: 'Edge Darken', min: 0, max: 100 }],
            [{ key: 'fade', label: 'Atmosphere', min: 0, max: 100 }]
        ],
        blur: [
            [{ key: 'softBlur', label: 'Beauty Blur', min: 0, max: 100 }],
            [{ key: 'bgBlur', label: 'Background Blur', min: 0, max: 100 }],
            [{ key: 'vignette', label: 'Focus Vignette', min: 0, max: 100 }]
        ],
        ai: [
            [{ key: 'softBlur', label: 'AI Smooth', min: 0, max: 100 }, { key: 'faceSlim', label: 'AI Face Slim', min: 0, max: 100 }],
            [{ key: 'whitening', label: 'AI Glow', min: 0, max: 100 }, { key: 'eyesEnlarge', label: 'AI Eyes', min: 0, max: 100 }],
            [{ key: 'sharpen', label: 'AI Detail', min: -20, max: 40 }, { key: 'cheekbones', label: 'AI Contour', min: 0, max: 100 }]
        ],
        overlay: [
            [{ key: 'overlayStrength', label: 'Overlay Strength', min: 0, max: 100 }],
            [{ key: 'vignette', label: 'Frame Dark', min: 0, max: 100 }],
            [{ key: 'grain', label: 'Texture', min: 0, max: 100 }]
        ],
        sticker: [
            [{ key: 'stickerSize', label: 'Sticker Size', min: 20, max: 120 }],
            [{ key: 'stickerY', label: 'Position Y', min: -40, max: 40 }],
            [{ key: 'overlayStrength', label: 'Opacity', min: 0, max: 100 }]
        ],
        anim: [
            [{ key: 'animSpeed', label: 'Anim Speed', min: 20, max: 160 }],
            [{ key: 'animAmount', label: 'Density', min: 10, max: 100 }],
            [{ key: 'overlayStrength', label: 'Intensity', min: 0, max: 100 }]
        ],
        lut: [
            [{ key: 'filterIntensity', label: 'Intensity', min: 0, max: 100 }],
            [{ key: 'contrast', label: 'LUT Contrast', min: -20, max: 40 }],
            [{ key: 'warmth', label: 'LUT Tone', min: -40, max: 40 }]
        ]
    };

    const DEFAULT_PARAMS = {
        brightness: 0, contrast: 0, saturation: 0, warmth: 0, softBlur: 0,
        whitening: 0, sharpen: 0, vignette: 0, tint: 0, fade: 0, grain: 0,
        faceSlim: 0, faceLength: 0, eyesEnlarge: 0, eyeDistance: 0, eyeOuter: 0,
        noseBridge: 0, noseSlim: 0, jawline: 0, chinLength: 0,
        eyebrow: 0, cheekbones: 0, lipSize: 0, bodySlim: 0,
        bgBlur: 0, bgStrength: 55, overlayStrength: 55,
        stickerSize: 70, stickerY: 0, animSpeed: 80, animAmount: 50,
        filterIntensity: 100, tone: 'normal', activeLut: 'none', hdr: 0,
        overlay: 'none', sticker: 'none', background: 'none', faceAnim: 'none'
    };

    function createPipeline(canvas) {
        const ctx = canvas.getContext('2d', { alpha: false });
        const softCanvas = document.createElement('canvas');
        const softCtx = softCanvas.getContext('2d');
        const warpCanvas = document.createElement('canvas');
        const warpCtx = warpCanvas.getContext('2d');
        const glCanvas = document.createElement('canvas');
        let params = { ...DEFAULT_PARAMS };
        let mirror = true;
        let particles = [];
        let t0 = performance.now();
        let faceTracker = null;
        let glWarper = null;
        let faceMeshReady = false;

        function ensureFaceSystems() {
            if (!window.TokControlFaceMesh) return;
            if (!faceTracker) {
                faceTracker = window.TokControlFaceMesh.createTracker();
                faceTracker.init().then((ok) => { faceMeshReady = !!ok; }).catch(() => { faceMeshReady = false; });
            }
            if (!glWarper || glCanvas.width !== canvas.width || glCanvas.height !== canvas.height) {
                glCanvas.width = canvas.width || 1;
                glCanvas.height = canvas.height || 1;
                glWarper = window.TokControlFaceMesh.createWebGlWarper(glCanvas);
            }
        }

        function setParams(next) {
            params = { ...params, ...next };
        }

        function applyPreset(name) {
            const p = PRESETS[name] || PRESETS.natural;
            params = { ...DEFAULT_PARAMS, ...p };
            return { ...params };
        }

        function applyTone(toneId, intensity) {
            const tone = TONE_PRESETS.find((t) => t.id === toneId) || TONE_PRESETS[0];
            const base = PRESETS[tone.preset] || PRESETS.natural;
            const amt = Math.max(0, Math.min(100, intensity ?? params.filterIntensity ?? 100)) / 100;
            const blended = { ...DEFAULT_PARAMS };
            Object.keys(base).forEach((k) => {
                if (typeof base[k] === 'number' && typeof DEFAULT_PARAMS[k] === 'number') {
                    blended[k] = DEFAULT_PARAMS[k] + (base[k] - DEFAULT_PARAMS[k]) * amt;
                } else {
                    blended[k] = base[k];
                }
            });
            blended.tone = tone.id;
            blended.filterIntensity = Math.round(amt * 100);
            blended.activeLut = tone.id === 'normal' ? 'none' : tone.id;
            params = { ...params, ...blended };
            return { ...params };
        }

        function getParams() {
            return { ...params };
        }

        function setMirror(on) {
            mirror = !!on;
        }

        function setOverlay(id) {
            params.overlay = id || 'none';
        }

        function setSticker(id) {
            params.sticker = id || 'none';
        }

        function setBackground(id) {
            params.background = id || 'none';
        }

        function setFaceAnim(id) {
            params.faceAnim = id || 'none';
        }

        function getFaceStatus() {
            return faceTracker?.getStatus?.() || 'idle';
        }

        function buildCssFilter() {
            const intensity = Math.max(0, Math.min(100, params.filterIntensity ?? 100)) / 100;
            const hdr = (params.hdr || 0) / 100 * intensity;
            const b = 1 + ((params.brightness || 0) / 100 + (params.whitening || 0) / 280 + hdr * 0.12) * intensity;
            const c = 1 + ((params.contrast || 0) / 100 + (params.sharpen || 0) / 200 + hdr * 0.18) * intensity;
            const s = Math.max(0, 1 + ((params.saturation || 0) / 100) * intensity);
            const warmth = (params.warmth || 0) * intensity;
            const sepia = Math.min(0.4, Math.abs(warmth) / 110);
            const hue = warmth * 0.35 + (params.tint || 0) * 0.4 * intensity;
            const fade = 1 - Math.min(0.35, ((params.fade || 0) / 220) * intensity);
            let filter = `brightness(${b * fade}) contrast(${c}) saturate(${s}) sepia(${sepia}) hue-rotate(${hue}deg)`;
            const lutId = params.activeLut || params.tone;
            const lut = lutId && lutId !== 'none' && lutId !== 'normal' ? LUT_REGISTRY[lutId] : null;
            if (lut?.type === 'css' && lut.css && intensity > 0.02) {
                filter += ` ${lut.css}`;
            }
            return filter;
        }

        function drawBackground(w, h) {
            const id = params.background || 'none';
            if (id === 'none') return;
            const meta = BACKGROUNDS.find((b) => b.id === id);
            if (!meta) return;
            const strength = Math.max(0, Math.min(100, params.bgStrength ?? 55)) / 100;
            ctx.save();
            ctx.globalAlpha = 0.22 + strength * 0.55;
            const g = ctx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, meta.colors[0]);
            g.addColorStop(1, meta.colors[1]);
            ctx.globalCompositeOperation = 'soft-light';
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            if (id === 'neonGrid') {
                ctx.globalCompositeOperation = 'screen';
                ctx.globalAlpha = 0.12 + strength * 0.2;
                ctx.strokeStyle = '#a855f7';
                ctx.lineWidth = 1;
                for (let x = 0; x < w; x += 48) {
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                }
                for (let y = 0; y < h; y += 48) {
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
            }
            ctx.restore();
        }

        function applyFaceWarp(w, h, video) {
            ensureFaceSystems();
            if (faceTracker && video) faceTracker.requestDetect(video);

            const Face = window.TokControlFaceMesh;
            if (!Face || !Face.needsWarp(params)) return;

            const landmarks = faceTracker?.getLandmarks?.() || null;
            if (glWarper) {
                // Copy current frame into warp canvas then displace via WebGL
                warpCanvas.width = w;
                warpCanvas.height = h;
                warpCtx.clearRect(0, 0, w, h);
                warpCtx.drawImage(canvas, 0, 0);
                glCanvas.width = w;
                glCanvas.height = h;
                const ok = glWarper.draw(warpCanvas, landmarks, params, mirror);
                if (ok) {
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(glCanvas, 0, 0);
                    return;
                }
            }

            // Geometric fallback (no MediaPipe / no WebGL)
            const slim = (params.faceSlim || 0) / 100;
            const body = (params.bodySlim || 0) / 100;
            const chin = ((params.faceLength || params.chinLength || 0)) / 100;
            const jaw = (params.jawline || 0) / 100;
            if (slim < 0.02 && body < 0.02 && Math.abs(chin) < 0.02 && jaw < 0.02) return;

            warpCanvas.width = w;
            warpCanvas.height = h;
            warpCtx.clearRect(0, 0, w, h);
            warpCtx.drawImage(canvas, 0, 0);

            const sx = 1 - slim * 0.08 - body * 0.05 - jaw * 0.03;
            const sy = 1 + chin * 0.04;
            const dw = w * sx;
            const dh = h * sy;
            const dx = (w - dw) / 2;
            const dy = (h - dh) / 2 + (chin > 0 ? chin * h * 0.02 : chin * h * 0.015);

            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(warpCanvas, dx, dy, dw, dh);
        }

        function drawFaceMakeup(w, h) {
            const eyes = (params.eyesEnlarge || 0) / 100;
            const nose = (params.noseSlim || 0) / 100;
            const cheek = (params.cheekbones || 0) / 100;
            const lips = (params.lipSize || 0) / 100;
            const brow = (params.eyebrow || 0) / 100;
            if (eyes < 0.02 && nose < 0.02 && cheek < 0.02 && lips < 0.02 && Math.abs(brow) < 0.02) return;

            const cx = w * 0.5;
            const cy = h * 0.42;

            ctx.save();
            if (eyes > 0.02) {
                ctx.globalAlpha = eyes * 0.18;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.ellipse(cx - w * 0.09, cy - h * 0.02, w * 0.055 * (1 + eyes * 0.25), h * 0.028 * (1 + eyes * 0.3), 0, 0, Math.PI * 2);
                ctx.ellipse(cx + w * 0.09, cy - h * 0.02, w * 0.055 * (1 + eyes * 0.25), h * 0.028 * (1 + eyes * 0.3), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (nose > 0.02) {
                ctx.globalAlpha = nose * 0.12;
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.ellipse(cx, cy + h * 0.04, w * 0.018 * (1 - nose * 0.35), h * 0.05, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (cheek > 0.02) {
                ctx.globalAlpha = cheek * 0.22;
                ctx.fillStyle = '#fb7185';
                ctx.beginPath();
                ctx.ellipse(cx - w * 0.16, cy + h * 0.06, w * 0.06, h * 0.03, 0, 0, Math.PI * 2);
                ctx.ellipse(cx + w * 0.16, cy + h * 0.06, w * 0.06, h * 0.03, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (lips > 0.02) {
                ctx.globalAlpha = lips * 0.25;
                ctx.fillStyle = '#f43f5e';
                ctx.beginPath();
                ctx.ellipse(cx, cy + h * 0.14, w * 0.05 * (1 + lips * 0.2), h * 0.018 * (1 + lips * 0.35), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (Math.abs(brow) > 0.02) {
                ctx.globalAlpha = Math.abs(brow) * 0.35;
                ctx.strokeStyle = '#1f1f1f';
                ctx.lineWidth = Math.max(2, w * 0.004);
                const by = cy - h * 0.07 - brow * h * 0.03;
                ctx.beginPath();
                ctx.moveTo(cx - w * 0.14, by);
                ctx.quadraticCurveTo(cx - w * 0.09, by - h * 0.01, cx - w * 0.04, by);
                ctx.moveTo(cx + w * 0.04, by);
                ctx.quadraticCurveTo(cx + w * 0.09, by - h * 0.01, cx + w * 0.14, by);
                ctx.stroke();
            }
            ctx.restore();
        }

        function drawSticker(w, h) {
            const id = params.sticker || 'none';
            if (id === 'none') return;
            const meta = STICKERS.find((s) => s.id === id);
            if (!meta) return;
            const size = (Math.min(w, h) * (params.stickerSize || 70)) / 280;
            const yOff = ((params.stickerY || 0) / 100) * h * 0.35;
            const alpha = Math.max(0.2, Math.min(1, (params.overlayStrength ?? 55) / 100 + 0.25));
            const cx = w * 0.5;
            const cy = h * 0.28 + yOff;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (id === 'catEars') {
                ctx.fillText('🐱', cx - size * 1.1, cy - size * 0.2);
                ctx.fillText('🐱', cx + size * 1.1, cy - size * 0.2);
            } else if (id === 'glasses') {
                ctx.fillText('🕶', cx, cy + size * 0.6);
            } else if (id === 'blush') {
                ctx.globalAlpha = alpha * 0.7;
                ctx.fillStyle = '#fb7185';
                ctx.beginPath();
                ctx.ellipse(cx - w * 0.15, cy + h * 0.18, size * 0.45, size * 0.22, 0, 0, Math.PI * 2);
                ctx.ellipse(cx + w * 0.15, cy + h * 0.18, size * 0.45, size * 0.22, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha;
                ctx.fillText('🌸', cx, cy - size * 0.4);
            } else if (id === 'hearts') {
                ctx.fillText('💕', cx - size, cy);
                ctx.fillText('💗', cx + size, cy + size * 0.3);
                ctx.fillText('💖', cx, cy - size * 0.8);
            } else if (id === 'stars') {
                ctx.fillText('⭐', cx - size * 1.1, cy - size * 0.2);
                ctx.fillText('✨', cx + size * 1.1, cy);
                ctx.fillText('🌟', cx, cy - size);
            } else {
                ctx.fillText(meta.emoji, cx, cy);
            }
            ctx.restore();
        }

        function ensureParticles(w, h, count) {
            if (particles.length === count) return;
            particles = Array.from({ length: count }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 1 + Math.random() * 2.5,
                speed: 0.25 + Math.random() * 1.4,
                phase: Math.random() * Math.PI * 2,
                color: `hsl(${Math.random() * 360},80%,70%)`
            }));
        }

        function drawOverlay(w, h) {
            const kind = params.overlay || 'none';
            const strength = Math.max(0, Math.min(100, params.overlayStrength ?? 55)) / 100;
            if (kind === 'none' || strength < 0.02) return;

            ctx.save();
            if (kind === 'neon' || kind === 'purple' || kind === 'cyan') {
                const color = kind === 'purple' ? '#a855f7' : kind === 'cyan' ? '#22d3ee' : '#d946ef';
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.35 + strength * 0.45;
                ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.018);
                ctx.shadowColor = color;
                ctx.shadowBlur = 24;
                roundRect(ctx, 18, 18, w - 36, h - 36, 28);
                ctx.stroke();
            } else if (kind === 'sparkle') {
                ensureParticles(w, h, 28);
                ctx.globalAlpha = 0.35 + strength * 0.5;
                ctx.fillStyle = '#fff';
                particles.forEach((p) => {
                    p.y -= p.speed;
                    if (p.y < 0) p.y = h;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                });
            } else if (kind === 'film') {
                ctx.globalAlpha = 0.12 + strength * 0.2;
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h * 0.08);
                ctx.fillRect(0, h * 0.92, w, h * 0.08);
            }
            ctx.restore();
        }

        function drawFaceAnim(w, h) {
            const kind = params.faceAnim || 'none';
            if (kind === 'none') return;
            const amount = Math.max(10, Math.min(100, params.animAmount || 50));
            const speed = Math.max(20, Math.min(160, params.animSpeed || 80)) / 80;
            const strength = Math.max(0.15, Math.min(1, (params.overlayStrength ?? 55) / 100));
            const now = (performance.now() - t0) / 1000;
            const count = Math.round(12 + amount * 0.35);
            ensureParticles(w, h, count);

            ctx.save();
            ctx.globalAlpha = 0.35 + strength * 0.45;
            ctx.font = `${Math.max(12, Math.min(w, h) * 0.035)}px "Segoe UI Emoji",sans-serif`;
            ctx.textAlign = 'center';

            if (kind === 'sparkle' || kind === 'bubble') {
                particles.forEach((p, i) => {
                    p.y -= p.speed * speed;
                    p.x += Math.sin(now * 2 + p.phase) * 0.4;
                    if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
                    if (kind === 'bubble') {
                        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 3 + p.r * 2, 0, Math.PI * 2);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = '#fff';
                        ctx.fillText(i % 2 ? '✨' : '✦', p.x, p.y);
                    }
                });
            } else if (kind === 'heartRain') {
                particles.forEach((p, i) => {
                    p.y += p.speed * speed * 1.4;
                    if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
                    ctx.fillText(i % 3 === 0 ? '💖' : '💗', p.x, p.y);
                });
            } else if (kind === 'neonPulse') {
                const pulse = 0.5 + 0.5 * Math.sin(now * 3 * speed);
                ctx.strokeStyle = '#a855f7';
                ctx.globalAlpha = (0.2 + strength * 0.5) * pulse;
                ctx.lineWidth = 8 + pulse * 10;
                ctx.shadowColor = '#d946ef';
                ctx.shadowBlur = 30;
                roundRect(ctx, 24, 24, w - 48, h - 48, 32);
                ctx.stroke();
            } else if (kind === 'confetti') {
                particles.forEach((p) => {
                    p.y += p.speed * speed * 2;
                    p.x += Math.sin(now * 4 + p.phase) * 1.2;
                    if (p.y > h + 10) { p.y = -10; p.x = Math.random() * w; }
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x, p.y, 4 + p.r, 8 + p.r);
                });
            }
            ctx.restore();
        }

        function drawVignette(w, h) {
            const v = Math.max(0, Math.min(100, params.vignette || 0)) / 100;
            if (v < 0.02) return;
            const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, `rgba(0,0,0,${0.15 + v * 0.7})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }

        function drawGrain(w, h) {
            const g = Math.max(0, Math.min(100, params.grain || 0)) / 100;
            if (g < 0.03) return;
            const step = 5;
            ctx.save();
            ctx.globalAlpha = g * 0.16;
            for (let y = 0; y < h; y += step) {
                for (let x = 0; x < w; x += step) {
                    if (Math.random() > 0.75) {
                        const n = (Math.random() * 255) | 0;
                        ctx.fillStyle = `rgb(${n},${n},${n})`;
                        ctx.fillRect(x, y, step, step);
                    }
                }
            }
            ctx.restore();
        }

        function drawFrame(video) {
            if (!video || video.readyState < 2) return false;
            const w = canvas.width;
            const h = canvas.height;
            if (!w || !h) return false;

            ctx.save();
            ctx.filter = buildCssFilter();
            if (mirror) {
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, w, h);
            ctx.restore();

            applyFaceWarp(w, h, video);

            const soft = Math.max(0, Math.min(100, (params.softBlur || 0) + (params.bgBlur || 0) * 0.35)) / 100;
            if (soft > 0.02) {
                softCanvas.width = Math.max(1, (w * 0.4) | 0);
                softCanvas.height = Math.max(1, (h * 0.4) | 0);
                softCtx.filter = `blur(${3 + soft * 8}px)`;
                softCtx.drawImage(canvas, 0, 0, softCanvas.width, softCanvas.height);
                softCtx.filter = 'none';
                ctx.save();
                ctx.globalAlpha = soft * 0.5;
                ctx.globalCompositeOperation = 'soft-light';
                ctx.drawImage(softCanvas, 0, 0, w, h);
                ctx.restore();
                ctx.save();
                ctx.globalAlpha = soft * 0.2;
                ctx.drawImage(softCanvas, 0, 0, w, h);
                ctx.restore();
            }

            const warmth = params.warmth || 0;
            if (Math.abs(warmth) > 2) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.28, Math.abs(warmth) / 140);
                ctx.fillStyle = warmth > 0 ? '#ffb070' : '#70b0ff';
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
            }

            if ((params.whitening || 0) > 4) {
                ctx.save();
                ctx.globalAlpha = Math.min(0.22, params.whitening / 220);
                ctx.fillStyle = '#fff7ed';
                ctx.globalCompositeOperation = 'soft-light';
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
            }

            drawBackground(w, h);
            drawFaceMakeup(w, h);
            drawVignette(w, h);
            drawOverlay(w, h);
            drawSticker(w, h);
            drawFaceAnim(w, h);
            drawGrain(w, h);

            const lut = LUT_REGISTRY[params.activeLut] || LUT_REGISTRY[params.tone];
            if (lut?.type === 'shader' && typeof lut.apply === 'function') {
                lut.apply(ctx, w, h, (params.filterIntensity ?? 100) / 100);
            }
            return true;
        }

        return {
            setParams, applyPreset, applyTone, getParams, setMirror, setOverlay,
            setSticker, setBackground, setFaceAnim, getFaceStatus, drawFrame,
            canvas, ctx, ensureFaceSystems
        };
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    window.CameraFilterPipeline = {
        PRESETS,
        PRESET_META,
        TONE_PRESETS,
        EFFECT_CATS,
        SLIDER_GROUPS,
        DEFAULT_PARAMS,
        STICKERS,
        BACKGROUNDS,
        FACE_ANIMS,
        LUT_REGISTRY,
        registerLut,
        listLuts,
        createPipeline
    };
})();
