/**
 * Gift Chute — สะพานลำเลียง (standalone overlay)
 * ของขวัญตกเป็นเส้นเดียว ช้าแบบหิมะ จางหายหลังครึ่งทาง
 */
(function (global) {
    'use strict';

    function normalizeChuteSettings(s) {
        s = s || {};
        return {
            chuteX: s.chuteX != null ? s.chuteX : 50,
            chuteWidth: s.chuteWidth || 72,
            fallSpeed: s.fallSpeed != null ? s.fallSpeed : 0.7,
            minCoins: s.minCoins != null ? s.minCoins : 1,
            maxOnScreen: s.maxOnScreen || 150,
            fadeStartRatio: s.fadeStartRatio != null ? s.fadeStartRatio : 0.5,
            showChute: s.showChute !== false
        };
    }

    function sizeForCoins(coins) {
        const c = Math.max(1, coins || 1);
        if (c >= 5000) return 24;
        if (c >= 1000) return 20;
        if (c >= 100) return 15;
        if (c >= 30) return 12;
        return 10;
    }

    class GiftChuteEngine {
        constructor(canvas, opts) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.settings = normalizeChuteSettings(opts);
            this.particles = [];
            this.imgCache = new Map();
            this._raf = null;
            this._resize();
        }

        _resize() {
            const w = window.innerWidth || 1920;
            const h = window.innerHeight || 1080;
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w;
                this.canvas.height = h;
            }
        }

        updateSettings(partial) {
            this.settings = normalizeChuteSettings({ ...this.settings, ...partial });
        }

        getLayout() {
            const w = this.canvas.width;
            const h = this.canvas.height;
            const s = this.settings;
            const chuteW = s.chuteWidth;
            const cx = (s.chuteX / 100) * w;
            const topY = h * 0.03;
            // Track always runs all the way down to the floor (bottom edge) —
            // never a jar/container that stops mid-screen.
            const bottomY = h - Math.max(6, h * 0.01);
            const mouthH = chuteW * 0.34;
            const trackTop = topY + mouthH * 0.65;
            return {
                cx, chuteW, topY, bottomY, mouthH, trackTop,
                left: cx - chuteW / 2,
                right: cx + chuteW / 2,
                fadeStart: trackTop + (bottomY - trackTop) * s.fadeStartRatio
            };
        }

        _getImg(url) {
            if (!url || typeof url !== 'string' || !url.trim()) return null;
            if (this.imgCache.has(url)) return this.imgCache.get(url);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => { img._ok = true; };
            img.onerror = () => { img._fail = true; };
            img.src = url;
            this.imgCache.set(url, img);
            return img;
        }

        _drawChute(layout) {
            if (!this.settings.showChute) return;
            const ctx = this.ctx;
            const { cx, chuteW, topY, bottomY, mouthH, trackTop, left } = layout;

            ctx.fillStyle = '#3d2818';
            ctx.beginPath();
            ctx.roundRect(cx - chuteW * 0.44, topY, chuteW * 0.88, mouthH, 4);
            ctx.fill();

            const g = ctx.createLinearGradient(left, trackTop, left + chuteW, bottomY);
            g.addColorStop(0, '#ebe0cc');
            g.addColorStop(0.5, '#d9cbb0');
            g.addColorStop(1, '#c4b498');
            ctx.fillStyle = g;
            ctx.fillRect(left, trackTop, chuteW, bottomY - trackTop);

            ctx.strokeStyle = 'rgba(60,45,30,0.28)';
            ctx.lineWidth = 2;
            ctx.strokeRect(left + 1, trackTop, chuteW - 2, bottomY - trackTop - 1);

            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(left + chuteW * 0.08, trackTop + 6, chuteW * 0.12, bottomY - trackTop - 12);

            // Floor plate — track visibly lands on the ground, no jar/container
            ctx.fillStyle = 'rgba(60,45,30,0.4)';
            ctx.beginPath();
            ctx.ellipse(cx, bottomY, chuteW * 0.62, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        _drawParticle(p) {
            const r = p.size;
            const img = p.giftIcon ? this._getImg(p.giftIcon) : null;
            const ready = img && img._ok && img.naturalWidth > 0 && !img._fail;
            if (ready) {
                this.ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
                return;
            }
            this.ctx.font = `${Math.round(r * 1.4)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const ph = (typeof global.GiftIconHelper !== 'undefined' && global.GiftIconHelper.PLACEHOLDER) || '';
            const phImg = ph ? this._getImg(ph) : null;
            if (phImg && phImg._ok && phImg.naturalWidth > 0) {
                this.ctx.drawImage(phImg, p.x - r, p.y - r, r * 2, r * 2);
                return;
            }
            this.ctx.fillStyle = 'rgba(255,255,255,0.35)';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, r * 0.85, 0, Math.PI * 2);
            this.ctx.fill();
        }

        spawnDrop(drop) {
            const s = this.settings;
            const coins = drop.coins || drop.diamondCount || drop.totalCoins || 1;
            if (coins < s.minCoins) return;
            const layout = this.getLayout();
            const count = Math.min(drop.repeatCount || 1, 6);
            const size = sizeForCoins(coins);

            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    // Never yank a still-visible particle off screen to make room —
                    // that reads as "falls then disappears". Just skip the overflow.
                    if (this.particles.length >= s.maxOnScreen) return;
                    this.particles.push({
                        y: layout.trackTop + 4,
                        vy: s.fallSpeed,
                        size,
                        giftIcon: drop.giftIcon || (global.GiftIconHelper ? global.GiftIconHelper.resolveGiftIcon(drop) : ''),
                        giftName: drop.giftName || ''
                    });
                }, i * 220);
            }
        }

        _tick() {
            this._resize();
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            const layout = this.getLayout();

            ctx.clearRect(0, 0, w, h);
            this._drawChute(layout);

            // Every particle shares the exact same x at any instant — a single,
            // strict line down the track (never multiple simultaneous columns).
            const sharedX = layout.cx + Math.sin(Date.now() / 1500) * 2;

            this.particles = this.particles.filter((p) => {
                p.y += p.vy;
                p.x = sharedX;

                let alpha = 1;
                if (p.y >= layout.fadeStart) {
                    const span = Math.max(1, layout.bottomY - layout.fadeStart);
                    alpha = 1 - (p.y - layout.fadeStart) / span;
                }
                if (alpha <= 0.02 || p.y > layout.bottomY) return false;

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                this._drawParticle(p);
                ctx.restore();
                return true;
            });

            this._raf = requestAnimationFrame(() => this._tick());
        }

        start() {
            if (this._raf) return;
            this._tick();
        }

        stop() {
            if (this._raf) cancelAnimationFrame(this._raf);
            this._raf = null;
        }

        destroy() {
            this.stop();
            this.particles = [];
        }
    }

    global.GiftChute = {
        GiftChuteEngine,
        normalizeChuteSettings,
        sizeForCoins
    };
})(typeof window !== 'undefined' ? window : global);
