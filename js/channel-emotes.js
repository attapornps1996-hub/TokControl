(function (global) {
    'use strict';

    const state = {
        username: '',
        emotes: [],
        lastUpdated: null,
        loaded: false,
        loading: null
    };

    function normalizeUsername(username) {
        return String(username || '').trim().replace(/^@+/, '').toLowerCase();
    }

    function getCurrentUsername() {
        if (typeof getTiktokUsernameValue === 'function') {
            const v = getTiktokUsernameValue();
            if (v) return normalizeUsername(v);
        }
        try {
            return normalizeUsername(localStorage.getItem('tokcontrol_tiktok_username') || '');
        } catch (e) {
            return '';
        }
    }

    function proxyEmoteUrl(url) {
        const u = String(url || '').trim();
        if (!u) return '';
        if (u.startsWith('/api/emotes/proxy')) return u;
        if (!/^https?:\/\//i.test(u)) return u;
        try {
            return `/api/emotes/proxy?url=${encodeURIComponent(u)}`;
        } catch (e) {
            return u;
        }
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isNumericEmoteId(value) {
        return /^\d{10,}$/.test(String(value || '').trim());
    }

    function getEmoteDisplayName(emote, fallbackId) {
        const id = String(fallbackId || emote?.id || '').trim();
        const raw = String(emote?.name || '').trim();
        if (raw && raw !== id && !isNumericEmoteId(raw)) return raw;
        const kind = emote?.type === 'sticker' ? 'สติกเกอร์' : 'Sub-Emote';
        if (id) return `${kind} · ${id.slice(-6)}`;
        return kind;
    }

    function emoteImgHtml(emote, altName) {
        const src = escapeHtml(proxyEmoteUrl(emote.imageUrl || emote.displayUrl || ''));
        if (!src) return '';
        const label = escapeHtml(altName || getEmoteDisplayName(emote, emote.id));
        return `<img class="tc-emote" src="${src}" alt="${label}" title="${label}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'">`;
    }

    function applyChannelEmotesPayload(payload) {
        if (!payload) return;
        const username = normalizeUsername(payload.username);
        if (username) state.username = username;
        if (Array.isArray(payload.emotes)) {
            state.emotes = payload.emotes.map((e) => ({
                ...e,
                imageUrl: e.imageUrl || '',
                displayUrl: proxyEmoteUrl(e.imageUrl || e.displayUrl || '')
            }));
            console.log(`[ChannelEmotes] loaded ${state.emotes.length} emote(s) for @${username || '?'}`);
        }
        state.lastUpdated = payload.lastUpdated || state.lastUpdated;
        state.loaded = true;
        document.dispatchEvent(new CustomEvent('channel-emotes-updated', {
            detail: { ...payload, emotes: state.emotes.slice() }
        }));
    }

    async function loadChannelEmotes(username) {
        const key = normalizeUsername(username || getCurrentUsername());
        if (!key) {
            state.username = '';
            state.emotes = [];
            state.loaded = true;
            return { username: '', emotes: [], lastUpdated: null };
        }
        if (state.loading && state.username === key) return state.loading;

        state.loading = (async () => {
            try {
                const res = await fetch(`/api/emotes?username=${encodeURIComponent(key)}`);
                const data = await res.json();
                if (res.ok && data.success) {
                    applyChannelEmotesPayload({
                        username: key,
                        emotes: data.emotes || [],
                        lastUpdated: data.lastUpdated || null,
                        fromCache: data.fromCache !== false
                    });
                    return { username: key, emotes: state.emotes, lastUpdated: state.lastUpdated };
                }
                console.warn('[ChannelEmotes] API error', res.status, data);
            } catch (err) {
                console.warn('[ChannelEmotes] load failed:', err.message);
            }
            state.username = key;
            state.loaded = true;
            return { username: key, emotes: state.emotes, lastUpdated: state.lastUpdated };
        })();

        try {
            return await state.loading;
        } finally {
            state.loading = null;
        }
    }

    function getChannelEmotesList(typeFilter) {
        const list = state.emotes || [];
        if (!typeFilter) return list.slice();
        return list.filter((e) => e.type === typeFilter);
    }

    function findChannelEmote(emoteId, type) {
        const id = String(emoteId || '');
        if (!id) return null;
        const list = state.emotes || [];
        if (type) {
            const typed = list.find((e) => String(e.id) === id && e.type === type);
            if (typed) return typed;
        }
        return list.find((e) => String(e.id) === id) || null;
    }

    function buildEmoteLookup(attachedEmotes) {
        const byName = new Map();
        const byId = new Map();
        const register = (e) => {
            if (!e) return;
            const id = String(e.id || '').trim();
            if (id) byId.set(id, e);
            const name = String(e.name || '').trim();
            if (name) byName.set(name.toLowerCase(), e);
        };
        (state.emotes || []).forEach(register);
        (Array.isArray(attachedEmotes) ? attachedEmotes : []).forEach(register);
        return { byName, byId };
    }

    function formatCommentHtml(comment, attachedEmotes) {
        const text = String(comment || '');
        const attached = Array.isArray(attachedEmotes) ? attachedEmotes.filter((e) => e && (e.imageUrl || e.displayUrl)) : [];
        const { byName, byId } = buildEmoteLookup(attached);
        const usedIds = new Set();

        let html = escapeHtml(text);

        // :shortcode: → <img>
        html = html.replace(/:([a-zA-Z0-9_\u0E00-\u0E7F.-]{1,40}):/g, (m, name) => {
            const em = byName.get(String(name).toLowerCase());
            if (!em || !(em.imageUrl || em.displayUrl)) return m;
            usedIds.add(String(em.id || em.name));
            return emoteImgHtml(em, `:${em.name || name}:`);
        });

        // bare numeric emote IDs (TikTok often sends these as chat text)
        html = html.replace(/\b(\d{15,})\b/g, (m, id) => {
            const em = byId.get(String(id));
            if (!em || !(em.imageUrl || em.displayUrl)) return m;
            usedIds.add(String(em.id || em.name));
            return emoteImgHtml(em, getEmoteDisplayName(em, id));
        });

        const extras = attached.filter((e) => !usedIds.has(String(e.id || e.name)));
        if (extras.length) {
            html += extras.map((e) => ` ${emoteImgHtml(e, getEmoteDisplayName(e, e.id))}`).join('');
        }
        return html;
    }

    function upsertChannelEmotes(emotes, username) {
        const list = Array.isArray(emotes) ? emotes : (emotes ? [emotes] : []);
        if (!list.length) return state.emotes.slice();
        const key = normalizeUsername(username || state.username || getCurrentUsername());
        if (key) state.username = key;
        const map = new Map((state.emotes || []).map((e) => [`${e.type || 'sub_emote'}:${e.id}`, e]));
        list.forEach((raw) => {
            if (!raw) return;
            const id = String(raw.id || raw.emoteId || '').trim();
            if (!id) return;
            const imageUrl = raw.imageUrl || raw.displayUrl || '';
            if (!imageUrl) return;
            const type = raw.type || raw.emoteType || 'sub_emote';
            const name = raw.name || raw.emoteName || id;
            map.set(`${type}:${id}`, {
                id,
                name,
                type,
                imageUrl,
                displayUrl: proxyEmoteUrl(imageUrl)
            });
        });
        state.emotes = Array.from(map.values());
        state.loaded = true;
        document.dispatchEvent(new CustomEvent('channel-emotes-updated', {
            detail: { username: state.username, emotes: state.emotes.slice(), lastUpdated: state.lastUpdated }
        }));
        return state.emotes.slice();
    }

    function bindUsernameWatcher() {
        const inputs = document.querySelectorAll('[data-tiktok-username-input]');
        inputs.forEach((el) => {
            el.addEventListener('change', () => loadChannelEmotes(el.value));
            el.addEventListener('blur', () => loadChannelEmotes(el.value));
        });
    }

    function initChannelEmotes() {
        bindUsernameWatcher();
        loadChannelEmotes(getCurrentUsername());
    }

    global.ChannelEmotes = {
        init: initChannelEmotes,
        load: loadChannelEmotes,
        apply: applyChannelEmotesPayload,
        upsert: upsertChannelEmotes,
        getList: getChannelEmotesList,
        find: findChannelEmote,
        proxyUrl: proxyEmoteUrl,
        formatCommentHtml,
        getDisplayName: getEmoteDisplayName,
        getState: () => ({ ...state, emotes: state.emotes.slice() })
    };
})(typeof window !== 'undefined' ? window : globalThis);
