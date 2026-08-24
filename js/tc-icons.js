/**
 * TokControl shared Lucide-style SVG icons (no emoji in UI chrome)
 */
(function (global) {
    'use strict';

    const PATHS = {
        user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
        lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
        eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        eyeOff: 'M9.9 4.2A10.5 10.5 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.3 3.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20',
        alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01',
        pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
        copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z',
        crown: 'M2 8l4.5 4L12 4l5.5 8L22 8v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8z M6 20v-3 M18 20v-3',
        video: 'M15 10l4.5-3v10L15 14v-4z M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
        image: 'M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4 M21 15l-5-5L5 21 M9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
        users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
        shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
        fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
        key: 'M21 2l-2 2m-7.6 7.6a5 5 0 1 1-2.8-2.8L19 4l3 3-3.5 1.5L17 11l-3.6-1.4z',
        logOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
        play: 'M5 3l14 9-14 9V3z',
        circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
        monitor: 'M2 4h20v12H2z M8 20h8 M12 16v4',
        chart: 'M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-9',
        message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        heart: 'M19 14c1.5-1.4 2-3 2-4.8A4.4 4.4 0 0 0 16.5 5c-1.4 0-2.5.6-3.5 1.7C12 5.6 10.9 5 9.5 5A4.4 4.4 0 0 0 5 9.2c0 1.8.5 3.4 2 4.8L12 20l7-6z',
        gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z',
        coins: 'M8.5 14.5A4.5 4.5 0 1 0 8.5 5a4.5 4.5 0 0 0 0 9.5z M16 8.4a4.5 4.5 0 1 1 0 9.1 M8.5 8v3.5',
        wifi: 'M5 12.5a9 9 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 20h.01',
        trophy: 'M6 9H4a2 2 0 0 1-2-2V5h4 M18 9h2a2 2 0 0 0 2-2V5h-4 M6 5h12v5a6 6 0 0 1-12 0V5z M12 16v3 M8 22h8',
        scroll: 'M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8v18z M8 3H6a2 2 0 0 0 0 4h2',
        gamepad: 'M6 12h4 M8 10v4 M15 13h.01 M18 11h.01 M2 10a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-4z',
        plug: 'M12 22v-5 M9 8V2 M15 8V2 M6 8h12v4a6 6 0 0 1-12 0V8z',
        list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
        mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3',
        bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.7 1.7 0 0 0 3.4 0',
        ghost: 'M9 10h.01 M15 10h.01 M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z',
        book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
        tv: 'M2 7h20v12H2z M17 2l-5 5-5-5',
        search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
        package: 'M16.5 9.4l-9-5.2 M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7L12 12l8.7-5 M12 22V12',
        target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
        sparkles: 'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
        smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
        palette: 'M12 22a10 10 0 1 1 0-20c.8 0 1.5.7 1.5 1.5 0 .6-.3 1-.7 1.4-.4.4-.7.9-.7 1.6a2 2 0 0 0 2 2h1.2c2.6 0 4.7 2.1 4.7 4.7A7.8 7.8 0 0 1 12 22z',
        tag: 'M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l7.3-7.3a1 1 0 0 0 0-1.4L12 2z M7 7h.01',
        zap: 'M13 2L3 14h8l-1 8 10-12h-8l1-8z',
        droplet: 'M12 2.7a10.4 10.4 0 0 1 6.5 9.8c0 3.6-2.9 6.5-6.5 6.5S5.5 16.1 5.5 12.5A10.4 10.4 0 0 1 12 2.7z',
        layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
        wand: 'M15 4V2 M15 16v-2 M8.2 8.2l-1.4-1.4 M18.2 18.2l-1.4-1.4 M4 15H2 M16 15h-2 M12 12l8-8',
        sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
        camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
        send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
        link: 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1 M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1',
        mapPin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        door: 'M13 4h3a2 2 0 0 1 2 2v14 M2 20h3 M13 20h9 M10 12v.01 M13 4.06V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.06A1 1 0 0 1 5 3h7a1 1 0 0 1 1 1.06z',
        star: 'M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z',
        volume: 'M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M19 5a9 9 0 0 1 0 14',
        folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
        refresh: 'M21 12a9 9 0 1 1-2.6-6.4 M21 3v6h-6',
        headphones: 'M3 14v3a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z M19 14v3a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z M3 14a9 9 0 0 1 18 0',
        bot: 'M12 8V4H8 M12 4h4 M6 12h12v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8z M9 16h.01 M15 16h.01 M2 12h4 M18 12h4',
        fish: 'M6.5 12c0 2.5 2 4.5 4.5 6 3-1.5 8-4 10-6-2-2-7-4.5-10-6-2.5 1.5-4.5 3.5-4.5 6z M8 12h.01',
        wheat: 'M2 22l8-8 M12 12l8-8 M7 17l2-2 M17 7l2-2 M9 11c2-2 4-3 6-3 M11 9c2-2 3-4 3-6',
        x: 'M18 6L6 18 M6 6l12 12',
        check: 'M20 6L9 17l-5-5',
        plus: 'M12 5v14 M5 12h14',
        settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
        flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1.5-3C8.5 7.5 8 6 8 5c0 2-1.5 3.5-1.5 5.5A3.5 3.5 0 0 0 10 14c0 1.1-.5 1.5-1.5.5z M12 22c4-2.5 6-6.5 6-10.5C18 6 14 2 12 2S6 6 6 11.5C6 15.5 8 19.5 12 22z',
        cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
        maximize: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
        scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0z',
        pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
        square: 'M5 5h14v14H5z',
        waveform: 'M3 12h2 M8 6v12 M13 3v18 M18 8v8 M22 12h-1'
    };

    /** Common emoji → icon name */
    const EMOJI_TO_ICON = {
        '👤': 'user', '✉️': 'mail', '🔒': 'lock', '👁': 'eye', '👁️': 'eye',
        '⚠️': 'alert', '⚠': 'alert', '✏️': 'pencil', '✏': 'pencil', '📋': 'copy',
        '👑': 'crown', '🎥': 'video', '🖼️': 'image', '🖼': 'image', '👥': 'users',
        '🛡️': 'shield', '🛡': 'shield', '📝': 'fileText', '🔑': 'key', '🚪': 'door',
        '▶️': 'play', '▶': 'play', '🔴': 'circle', '🖥️': 'monitor', '🖥': 'monitor',
        '📊': 'chart', '💬': 'message', '❤️': 'heart', '❤': 'heart', '♥️': 'heart',
        '💖': 'heart', '💗': 'heart', '💕': 'heart', '🎁': 'gift',
        '📶': 'wifi', '🏆': 'trophy', '📜': 'scroll', '🎮': 'gamepad', '🔌': 'plug',
        '🗣️': 'mic', '🗣': 'mic', '🔔': 'bell', '👻': 'ghost', '📖': 'book',
        '📺': 'tv', '🔍': 'search', '⬇️': 'download', '⬇': 'download', '📦': 'package',
        '🎯': 'target', '✨': 'sparkles', '⭐': 'star', '🌟': 'star', '🙂': 'smile',
        '😊': 'smile', '😋': 'smile', '🐷': 'smile', '🎨': 'palette', '🎀': 'tag',
        '💧': 'droplet', '🧩': 'layers', '🤖': 'bot', '🎞': 'sliders', '💾': 'save',
        '📤': 'send', '🔗': 'link', '📍': 'mapPin', '🌹': 'gift', '💚': 'heart',
        '😈': 'flame', '💡': 'zap', '🎧': 'headphones', '🔄': 'refresh', '🌾': 'wheat',
        '🎣': 'fish', '📷': 'camera', '⚙': 'settings', '⚙️': 'settings', '🔥': 'flame',
        '🌈': 'palette', '🐱': 'smile', '🕶': 'scan', '🌸': 'sparkles', '✦': 'sparkles',
        '🔇': 'volume', '🔊': 'volume', '⚡': 'zap', '📁': 'folder', '📂': 'folder',
        '⌨️': 'sliders', '⌨': 'sliders', '☝️': 'target', '👆': 'target', '🎬': 'video',
        '😀': 'smile', '😃': 'smile', '🎭': 'palette', '📽️': 'sliders', '📽': 'sliders',
        '🎲': 'gamepad', '👺': 'smile', '🧧': 'tag'
    };

    const FILLED_PATHS = {
        play: 'M8 5.14v14l11-7-11-7z',
        pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
        copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
        x: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z'
    };

    function svg(name, opts) {
        opts = opts || {};
        const size = opts.size || 16;
        const cls = opts.className || 'tc-ico';
        if (opts.filled && FILLED_PATHS[name]) {
            return `<svg class="${cls} tc-ico--filled" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${FILLED_PATHS[name]}"/></svg>`;
        }
        const d = PATHS[name] || PATHS.circle;
        const sw = opts.strokeWidth || (opts.bold ? 2.6 : 2);
        return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    }

    function iconHtml(nameOrEmoji, size) {
        const name = PATHS[nameOrEmoji] ? nameOrEmoji : (EMOJI_TO_ICON[nameOrEmoji] || 'circle');
        return svg(name, { size: size || 14 });
    }

    function replaceEmojisInText(text, size) {
        if (!text) return text;
        let out = String(text);
        // longer sequences first
        const keys = Object.keys(EMOJI_TO_ICON).sort((a, b) => b.length - a.length);
        keys.forEach((emo) => {
            if (out.indexOf(emo) === -1) return;
            out = out.split(emo).join(iconHtml(EMOJI_TO_ICON[emo], size));
        });
        return out;
    }

    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG', 'CANVAS']);

    function shouldSkip(el) {
        if (!el || el.nodeType !== 1) return true;
        if (SKIP.has(el.tagName)) return true;
        if (el.closest && el.closest('.tc-ico-skip,[data-no-icon-replace],code,pre,textarea,.dash-comment-list,.dash-gift-feed,.chat-bubble,.ov-root,#overlayRoot,.live-chat,#dashboardView,#dashDetailModalOverlay,.dash-detail-overlay,[data-keep-emoji],#unifiedGiftPickerOverlay,#aeStickerPickerOverlay,.adm-gifts-list,.ae-trigger-tile,.ae-keep-emoji,.ae-trigger-thumb,.gp-item-cost,.rp-trig-type-grid,.rp-trig-modal-panel,.trigger-icon,.rp-trig-gift-fallback,.rp-trig-gift-strip')) return true;
        return false;
    }

    function walkReplace(root, size) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentElement;
                if (shouldSkip(p)) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue || !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(node.nodeValue)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((textNode) => {
            const html = replaceEmojisInText(textNode.nodeValue, size);
            if (html === textNode.nodeValue) return;
            const span = document.createElement('span');
            span.className = 'tc-ico-inline';
            span.innerHTML = html;
            textNode.parentNode.replaceChild(span, textNode);
        });
    }

    function hydrateDataIcons(root) {
        (root || document).querySelectorAll('[data-tc-icon]').forEach((el) => {
            if (el.dataset.iconDone) return;
            if (el.closest && el.closest('#dashboardView,[data-keep-emoji],.tc-ico-skip,[data-no-icon-replace]')) return;
            const name = el.getAttribute('data-tc-icon') || el.dataset.tcIcon;
            el.innerHTML = svg(name, { size: Number(el.dataset.size) || 16 }) + (el.dataset.label ? ` ${el.dataset.label}` : '');
            el.dataset.iconDone = '1';
        });
    }

    function hydrateAll(root) {
        walkReplace(root || document.body, 14);
        hydrateDataIcons(root || document);
    }

    let obs;
    function startObserver() {
        if (obs || !document.body) return;
        obs = new MutationObserver((muts) => {
            muts.forEach((m) => {
                m.addedNodes.forEach((n) => {
                    if (n.nodeType === 1) {
                        walkReplace(n, 14);
                        hydrateDataIcons(n);
                    } else if (n.nodeType === 3 && n.parentElement && !shouldSkip(n.parentElement)) {
                        walkReplace(n.parentElement, 14);
                    }
                });
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    function boot() {
        hydrateAll(document.body);
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.TcIcons = {
        PATHS, EMOJI_TO_ICON, svg, iconHtml, replaceEmojisInText, hydrateAll, walkReplace
    };
    // Keep Camera Studio alias
    global.CamIcons = global.CamIcons || {
        svg: (name, opts) => svg(name, opts),
        TAB_ICONS: {
            beauty: 'sparkles', face: 'smile', color: 'palette', background: 'image',
            sticker: 'tag', anim: 'zap', blur: 'droplet', overlay: 'layers', ai: 'wand', lut: 'sliders'
        },
        CAT_ICONS: {
            face: 'smile', beauty: 'sparkles', color: 'palette', lut: 'sliders',
            background: 'image', blur: 'droplet', overlay: 'layers', sticker: 'tag',
            neon: 'zap', ai: 'cpu', funny: 'smile', anim: 'flame'
        }
    };
})(window);
