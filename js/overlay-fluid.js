/**
 * Smooth fluid fill + counter animations for OBS overlays.
 */
(function (global) {
    'use strict';

    const FLUID_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const FLUID_DUR_MS = 1400;
    const FLUID_BAR_TRANS = `width 1.35s ${FLUID_EASE}, height 1.35s ${FLUID_EASE}, stroke-dashoffset 1.35s ${FLUID_EASE}, clip-path 1.45s ${FLUID_EASE}`;

    const numJobs = new WeakMap();

    function clampPct(pct) {
        return Math.max(0, Math.min(100, pct));
    }

    function parseNum(text) {
        const n = parseFloat(String(text || '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function cancelTween(el) {
        const job = numJobs.get(el);
        if (job && job.raf) cancelAnimationFrame(job.raf);
        numJobs.delete(el);
    }

    function tweenNumber(el, target, opts) {
        if (!el) return;
        const to = Number(target) || 0;
        const duration = opts?.duration ?? FLUID_DUR_MS;
        const format = opts?.format || ((n) => Math.round(n).toLocaleString());
        const from = el.dataset.ovNum != null ? parseFloat(el.dataset.ovNum) : parseNum(el.textContent);
        cancelTween(el);
        if (Math.abs(from - to) < 0.5) {
            el.textContent = format(to);
            el.dataset.ovNum = String(to);
            return;
        }
        const start = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const val = from + (to - from) * easeOutCubic(t);
            el.textContent = format(val);
            if (t < 1) numJobs.set(el, { raf: requestAnimationFrame(step) });
            else {
                el.dataset.ovNum = String(to);
                numJobs.delete(el);
            }
        };
        numJobs.set(el, { raf: requestAnimationFrame(step) });
    }

    function tweenPct(el, pct, opts) {
        tweenNumber(el, clampPct(pct), {
            duration: opts?.duration ?? 900,
            format: (n) => Math.round(n) + '%'
        });
    }

    function setBarWidth(el, pct) {
        if (!el) return;
        el.style.width = clampPct(pct) + '%';
    }

    function setBarHeight(el, pct) {
        if (!el) return;
        el.style.height = clampPct(pct) + '%';
    }

    function setGfillPct(root, pct) {
        if (!root) return;
        root.style.setProperty('--gfill-pct', clampPct(pct) + '%');
    }

    function setRingPct(circle, pct, radius) {
        if (!circle) return;
        const r = radius || 90;
        const circ = 2 * Math.PI * r;
        const offset = circ - (circ * clampPct(pct) / 100);
        circle.style.strokeDasharray = String(circ);
        circle.style.strokeDashoffset = String(offset);
    }

    function setArcPct(path, pct, arcLen) {
        if (!path) return;
        const len = arcLen || 314;
        const offset = len - (len * clampPct(pct) / 100);
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(offset);
    }

    function applyFluidBarStyle(el) {
        if (!el || el.dataset.ovFluidBar === '1') return;
        el.classList.add('ov-fluid-fill');
        el.style.transition = FLUID_BAR_TRANS;
        el.dataset.ovFluidBar = '1';
    }

    function formatPair(current, target) {
        return `${Math.round(current).toLocaleString()} / ${Math.round(target).toLocaleString()}`;
    }

    function tweenSlashPair(el, current, target, opts) {
        if (!el) return;
        const tar = Math.round(Number(target) || 0);
        tweenNumber(el, Number(current) || 0, {
            duration: opts?.duration,
            format: (n) => `${Math.round(n).toLocaleString()} / ${tar.toLocaleString()}`
        });
        el.dataset.ovCur = String(current);
    }

    global.OvFluid = {
        FLUID_EASE,
        FLUID_DUR_MS,
        FLUID_BAR_TRANS,
        tweenNumber,
        tweenPct,
        tweenSlashPair,
        setBarWidth,
        setBarHeight,
        setGfillPct,
        setRingPct,
        setArcPct,
        applyFluidBarStyle,
        formatPair,
        clampPct
    };
})(typeof window !== 'undefined' ? window : globalThis);
