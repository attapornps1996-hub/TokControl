/**
 * Direct WebSocket to R.E.P.O. mod.
 * Fire-and-forget — no HTTP round-trip, no waiting for response.
 */
(function (global) {
    const DEFAULT_WS = 'ws://127.0.0.1:8080/';
    let wsUrl = DEFAULT_WS;
    let ws = null;
    let reconnectTimer = null;
    let offlineQueue = [];

    function normalizeWsUrl(host) {
        let raw = String(host || DEFAULT_WS).trim();
        if (!raw) raw = DEFAULT_WS;
        if (raw.startsWith('http://')) raw = 'ws://' + raw.slice(7);
        else if (raw.startsWith('https://')) raw = 'wss://' + raw.slice(8);
        else if (!raw.startsWith('ws')) raw = 'ws://' + raw;
        if (!raw.endsWith('/')) raw += '/';
        return raw;
    }

    function connect(host) {
        wsUrl = normalizeWsUrl(host);
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        try {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                while (offlineQueue.length) {
                    try { ws.send(offlineQueue.shift()); } catch (e) { break; }
                }
            };
            ws.onclose = () => {
                ws = null;
                if (!reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        connect(wsUrl);
                    }, 600);
                }
            };
            ws.onerror = () => { /* onclose handles reconnect */ };
        } catch (e) {
            ws = null;
        }
    }

    function rawSend(payload) {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        connect(wsUrl);
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(text);
                return true;
            } catch (e) { /* fall through to queue */ }
        }
        offlineQueue.push(text);
        if (offlineQueue.length > 200) offlineQueue.shift();
        return false;
    }

    /** Fire-and-forget — send immediately (no rAF delay). */
    function sendInstant(command) {
        return rawSend(command);
    }

    function setHost(host) {
        const next = normalizeWsUrl(host);
        if (next === wsUrl && ws && ws.readyState === WebSocket.OPEN) return;
        wsUrl = next;
        try { if (ws) ws.close(); } catch (e) { /* ignore */ }
        ws = null;
        connect(wsUrl);
    }

    function isOpen() {
        return !!(ws && ws.readyState === WebSocket.OPEN);
    }

    global.RepoBridge = {
        connect,
        setHost,
        sendInstant,
        rawSend,
        isOpen,
        getUrl: () => wsUrl
    };
})(typeof window !== 'undefined' ? window : globalThis);
