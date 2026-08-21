/**
 * PNGTuber — Gift throw-at-avatar system
 * Spawns TikTok gift images flying toward the avatar with impact sound/effect.
 */
(function (global) {
    'use strict';

    const MAX_PROJECTILES = 12;
    let active = 0;
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function playImpactSound(volume, intensity) {
        const ctx = ensureAudio();
        if (!ctx) return;
        const vol = Math.max(0, Math.min(1, (volume || 70) / 100)) * (0.15 + intensity * 0.12);
        if (vol <= 0) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180 + intensity * 40, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.14);

        const noise = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        noise.buffer = buf;
        const nGain = ctx.createGain();
        noise.connect(nGain);
        nGain.connect(ctx.destination);
        nGain.gain.setValueAtTime(vol * 0.35, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        noise.start(now);
        noise.stop(now + 0.07);
    }

    function getAvatarCenter(rootEl) {
        if (!rootEl) return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.65 };
        const r = rootEl.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
    }

    function spawnEdgePoint(target, side) {
        const pad = 40;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const sides = side != null ? [side] : [0, 1, 2, 3];
        const pick = sides[Math.floor(Math.random() * sides.length)];
        switch (pick) {
            case 0: return { x: pad + Math.random() * (w - pad * 2), y: -pad };
            case 1: return { x: w + pad, y: pad + Math.random() * (h - pad * 2) };
            case 2: return { x: pad + Math.random() * (w - pad * 2), y: h + pad };
            default: return { x: -pad, y: pad + Math.random() * (h - pad * 2) };
        }
    }

    function createImpactFlash(layer, x, y, size) {
        const el = document.createElement('div');
        el.className = 'pt-throw-impact';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        layer.appendChild(el);
        setTimeout(() => el.remove(), 450);
    }

    function shakeAvatar(imgEl, intensity) {
        if (!imgEl) return;
        imgEl.classList.remove('pt-throw-hit');
        void imgEl.offsetWidth;
        imgEl.classList.add('pt-throw-hit');
        imgEl.style.setProperty('--pt-hit-intensity', String(Math.min(1.2, 0.4 + intensity * 0.15)));
        setTimeout(() => imgEl.classList.remove('pt-throw-hit'), 380);
    }

    function throwGift(options) {
        const {
            gift,
            settings,
            layerEl,
            avatarRootEl,
            avatarImgEl
        } = options;

        if (!layerEl || settings.throwGiftsEnabled === false) return;
        const coins = gift.totalCoins || (gift.diamondCount || 1) * (gift.repeatCount || 1) || 1;
        if (coins < (settings.throwMinCoins || 1)) return;
        if (active >= MAX_PROJECTILES) return;

        const iconUrl = global.PngTuber && PngTuber.resolveGiftIconUrl
            ? PngTuber.resolveGiftIconUrl(gift)
            : (gift.giftIcon || '');
        const size = Math.min(120, 44 + Math.log10(Math.max(1, coins)) * 22);
        const target = getAvatarCenter(avatarRootEl);
        const start = spawnEdgePoint(target);
        const speed = Math.max(0.5, settings.throwSpeed || 1);
        const duration = Math.max(350, 900 - Math.min(400, coins * 2)) / speed;

        const el = document.createElement('div');
        el.className = 'pt-throw-projectile';
        const img = document.createElement('img');
        img.alt = gift.giftName || 'gift';
        img.draggable = false;
        if (iconUrl && (iconUrl.startsWith('http') || iconUrl.startsWith('data:') || iconUrl.startsWith('/'))) {
            img.src = iconUrl.startsWith('/') ? PngTuber.resolveAssetUrl(iconUrl) : iconUrl;
        } else {
            el.textContent = iconUrl || '🎁';
            el.classList.add('pt-throw-emoji');
        }
        if (!el.classList.contains('pt-throw-emoji')) el.appendChild(img);
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.left = start.x + 'px';
        el.style.top = start.y + 'px';
        layerEl.appendChild(el);
        active++;

        const t0 = performance.now();
        const dx = target.x - start.x;
        const dy = target.y - start.y;
        const arc = 40 + Math.random() * 60;

        function frame(now) {
            const t = Math.min(1, (now - t0) / duration);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const x = start.x + dx * ease;
            const y = start.y + dy * ease - Math.sin(t * Math.PI) * arc;
            const rot = t * 360 * (dx > 0 ? 1 : -1);
            const sc = 0.6 + t * 0.5;
            el.style.transform = `translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`;
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                active--;
                const intensity = Math.min(1, coins / 500);
                playImpactSound(settings.throwVolume, intensity);
                createImpactFlash(layerEl, target.x, target.y, size * 1.4);
                shakeAvatar(avatarImgEl, intensity);
                el.classList.add('pt-throw-pop');
                setTimeout(() => el.remove(), 200);
            }
        }
        requestAnimationFrame(frame);
    }

    function bindThrowSocket(socket, getSettings, getElements) {
        if (!socket || socket._ptThrowBound) return;
        socket._ptThrowBound = true;
        socket.on('tiktok_gift', (gift) => {
            const target = String(gift?.testOverlayId || '').trim();
            let currentOverlayId = '';
            try {
                currentOverlayId = new URLSearchParams(window.location.search).get('ovId') || 'avatar-pngtuber';
            } catch (_) { /* standalone source */ }
            if (gift?.isTest && target && target !== currentOverlayId) return;
            const settings = getSettings();
            const els = getElements();
            if (!settings || !els) return;
            const count = Math.min(gift.repeatCount || 1, 5);
            for (let i = 0; i < count; i++) {
                setTimeout(() => throwGift({
                    gift,
                    settings,
                    layerEl: els.layer,
                    avatarRootEl: els.root,
                    avatarImgEl: els.img
                }), i * 120);
            }
        });
    }

    global.PngTuberThrow = {
        throwGift,
        bindThrowSocket,
        playImpactSound
    };
})(typeof window !== 'undefined' ? window : global);
