/**
 * Announcement popup API client — never throws into the UI.
 */
(function (global) {
    'use strict';

    function authHeaders() {
        const token = localStorage.getItem('pandy_token');
        return token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }

    async function request(path, options) {
        try {
            const res = await fetch(path, options);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            return data;
        } catch (err) {
            console.warn('[announcement.service]', path, err);
            return null;
        }
    }

    global.TcAnnouncementService = {
        fetchActivePopup() {
            return request('/api/announcements/active-popup', { headers: authHeaders() });
        },
        impression(id) {
            return request('/api/announcements/' + encodeURIComponent(id) + '/event', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventType: 'impression' })
            });
        },
        acknowledge(id) {
            return request('/api/announcements/' + encodeURIComponent(id) + '/event', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventType: 'acknowledged' })
            });
        },
        dismiss(id) {
            return request('/api/announcements/' + encodeURIComponent(id) + '/event', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventType: 'dismissed' })
            });
        },
        click(id, extra) {
            return request('/api/announcements/' + encodeURIComponent(id) + '/event', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ eventType: 'cta_click', meta: extra || {} })
            });
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
