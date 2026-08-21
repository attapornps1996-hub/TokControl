/**
 * TokControl Camera Studio — Lucide-style SVG icons (stroke=2, no emoji)
 */
(function () {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';

    const PATHS = {
        camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        play: 'M5 3l14 9-14 9V3z',
        maximize: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
        sparkles: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z M5 16l.6 1.6L7 18.2 5.6 19 5 20.6 4.4 19 3 18.2l1.4-.6L5 16z',
        smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
        palette: 'M12 22a10 10 0 1 1 0-20c.8 0 1.5.7 1.5 1.5 0 .6-.3 1-.7 1.4-.4.4-.7.9-.7 1.6a2 2 0 0 0 2 2h1.2c2.6 0 4.7 2.1 4.7 4.7A7.8 7.8 0 0 1 12 22z M7.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M10.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M14.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17.5 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
        image: 'M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4 M21 15l-5-5L5 21 M9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
        tag: 'M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l7.3-7.3a1 1 0 0 0 0-1.4L12 2z M7 7h.01',
        zap: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
        droplet: 'M12 2.7a10.4 10.4 0 0 1 6.5 9.8c0 3.6-2.9 6.5-6.5 6.5S5.5 16.1 5.5 12.5A10.4 10.4 0 0 1 12 2.7z',
        layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
        cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
        sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
        search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
        heart: 'M19 14c1.5-1.4 2-3 2-4.8A4.4 4.4 0 0 0 16.5 5c-1.4 0-2.5.6-3.5 1.7C12 5.6 10.9 5 9.5 5A4.4 4.4 0 0 0 5 9.2c0 1.8.5 3.4 2 4.8L12 20l7-6z',
        plus: 'M12 5v14 M5 12h14',
        eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        eyeOff: 'M9.9 4.2A10.5 10.5 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.3 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20 M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
        refresh: 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6',
        alertTriangle: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
        shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
        crown: 'M2 8l4.5 4L12 4l5.5 8L22 8v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8z M6 20v-3 M18 20v-3',
        bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.7 1.7 0 0 0 3.4 0',
        coins: 'M8.5 14.5A4.5 4.5 0 1 0 8.5 5a4.5 4.5 0 0 0 0 9.5z M16 8.4a4.5 4.5 0 1 1 0 9.1 M8.5 8v3.5',
        more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
        settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
        upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
        chevronRight: 'M9 18l6-6-6-6',
        chevronDown: 'M6 9l6 6 6-6',
        check: 'M20 6L9 17l-5-5',
        scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z',
        circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
        wand: 'M15 4V2 M15 16v-2 M8.2 8.2l-1.4-1.4 M18.2 18.2l-1.4-1.4 M4 15H2 M16 15h-2 M8.2 15.8l-1.4 1.4 M18.2 5.8l-1.4 1.4 M12 12l8-8 M9.5 9.5l-6 6a1.4 1.4 0 0 0 0 2l.8.8a1.4 1.4 0 0 0 2 0l6-6',
        flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1.5-3C8.5 7.5 8 6 8 5c0 2-1.5 3.5-1.5 5.5A3.5 3.5 0 0 0 10 14c0 1.1-.5 1.5-1.5.5z M12 22c4-2.5 6-6.5 6-10.5C18 6 14 2 12 2S6 6 6 11.5C6 15.5 8 19.5 12 22z',
        rotateCcw: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
        wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.1 3.1z',
        book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
        link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1 M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1'
    };

    function svg(name, opts = {}) {
        const size = opts.size || 18;
        const cls = opts.className || 'cam-ico';
        const d = PATHS[name] || PATHS.circle;
        // Multi-path icons use space-separated path commands; draw as one path with fill none
        return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    }

    function iconEl(name, opts = {}) {
        const wrap = document.createElement('span');
        wrap.className = opts.wrapClass || 'cam-ico-wrap';
        wrap.innerHTML = svg(name, opts);
        return wrap;
    }

    const TAB_ICONS = {
        beauty: 'sparkles',
        face: 'smile',
        color: 'palette',
        background: 'image',
        sticker: 'tag',
        anim: 'zap',
        blur: 'droplet',
        overlay: 'layers',
        ai: 'wand',
        lut: 'sliders'
    };

    const CAT_ICONS = {
        face: 'smile',
        beauty: 'sparkles',
        color: 'palette',
        lut: 'sliders',
        background: 'image',
        blur: 'droplet',
        overlay: 'layers',
        sticker: 'tag',
        neon: 'zap',
        ai: 'cpu',
        funny: 'smile',
        anim: 'flame'
    };

    window.CamIcons = { svg, iconEl, PATHS, TAB_ICONS, CAT_ICONS, _full: true };
})();
