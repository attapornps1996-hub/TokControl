/**
 * Super Battle Golf bridge — TokControl hosts InteractiveMod WS on :13715.
 * Game mod connects as client; we push event messages.
 */
'use strict';

const http = require('http');
const WebSocket = require('ws');

const DEFAULT_PORT = 13715;
const DEFAULT_HOST = '127.0.0.1';

let _server = null;
let _wss = null;
let _port = DEFAULT_PORT;
let _clients = new Set();
let _lastError = null;
let _startedAt = 0;

function encodeEventData({ eventId, username, lang, cost, extraInfo }) {
    const parts = [];
    const push = (k, v) => {
        if (v == null || v === '') return;
        parts.push(`${k}=${String(v).replace(/&/g, '%encode_amp%').replace(/=/g, '%encode_equal%')}`);
    };
    push('eventID', eventId);
    push('username', username || 'viewer');
    push('lang', lang || 'th');
    if (cost != null) push('cost', cost);
    if (extraInfo != null) push('extraInfo', extraInfo);
    return parts.join('&');
}

function buildEventMessage(opts) {
    return JSON.stringify({
        type: 'event',
        data: encodeEventData(opts)
    });
}

function getStatus() {
    return {
        ok: !!_wss,
        listening: !!(_server && _server.listening),
        host: DEFAULT_HOST,
        port: _port,
        clients: _clients.size,
        connected: _clients.size > 0,
        startedAt: _startedAt || null,
        lastError: _lastError,
        mod: 'TokControl_BattleGolf_Tiktoklive'
    };
}

function broadcast(text) {
    let n = 0;
    for (const ws of _clients) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(text);
                n += 1;
            } catch (_) { /* ignore */ }
        }
    }
    return n;
}

function sendEvent(opts) {
    const eventId = String(opts.eventId || opts.eventID || opts.id || '').trim();
    if (!eventId) return { ok: false, error: 'missing_eventId' };
    if (!_wss) {
        try { start(); } catch (err) {
            return { ok: false, error: err.message || 'start_failed' };
        }
    }
    const msg = buildEventMessage({
        eventId,
        username: opts.username || opts.user || 'viewer',
        lang: opts.lang || 'th',
        cost: opts.cost,
        extraInfo: opts.extraInfo
    });
    const sent = broadcast(msg);
    return {
        ok: true,
        queued: sent === 0,
        sent,
        clients: _clients.size,
        message: msg,
        mod: 'TokControl_BattleGolf_Tiktoklive'
    };
}

function start(port) {
    if (_wss && _server && _server.listening) {
        return getStatus();
    }
    stop();
    _port = Number(port) || DEFAULT_PORT;
    _lastError = null;

    _server = http.createServer((req, res) => {
        const url = req.url || '/';
        if (url.startsWith('/health') || url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(getStatus()));
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    });

    _wss = new WebSocket.Server({ server: _server });
    _wss.on('connection', (ws) => {
        _clients.add(ws);
        console.log(`[BattleGolf] client connected (${_clients.size})`);
        try {
            ws.send(JSON.stringify({ type: 'config', data: 'mod=TokControl_BattleGolf_Tiktoklive' }));
        } catch (_) { /* ignore */ }
        ws.on('close', () => {
            _clients.delete(ws);
            console.log(`[BattleGolf] client disconnected (${_clients.size})`);
        });
        ws.on('error', () => {
            _clients.delete(ws);
        });
        ws.on('message', () => { /* game→app chatter ignored for now */ });
    });

    _server.listen(_port, DEFAULT_HOST, () => {
        _startedAt = Date.now();
        console.log(`[BattleGolf] WebSocket listening on ws://${DEFAULT_HOST}:${_port}/`);
    });

    _server.on('error', (err) => {
        _lastError = err.message || String(err);
        console.error('[BattleGolf] server error:', _lastError);
        if (err.code === 'EADDRINUSE') {
            console.error('[BattleGolf] Port 13715 in use — close other apps using this port and retry');
        }
    });

    return getStatus();
}

function stop() {
    for (const ws of _clients) {
        try { ws.close(); } catch (_) { /* ignore */ }
    }
    _clients.clear();
    if (_wss) {
        try { _wss.close(); } catch (_) { /* ignore */ }
        _wss = null;
    }
    if (_server) {
        try { _server.close(); } catch (_) { /* ignore */ }
        _server = null;
    }
    _startedAt = 0;
    return { ok: true, stopped: true };
}

function parseCommand(command) {
    const raw = String(command || '').trim();
    if (!raw) return null;
    if (raw === 'ping' || raw === 'health') return { kind: 'health' };
    if (raw.startsWith('{')) {
        try {
            const j = JSON.parse(raw);
            const eventId = j.eventId || j.eventID || j.id || j.cmd || j.action;
            if (eventId && eventId !== 'ping' && eventId !== 'health') {
                return {
                    kind: 'event',
                    eventId: String(eventId),
                    username: j.username || j.user || 'viewer',
                    lang: j.lang || 'th',
                    cost: j.cost,
                    extraInfo: j.extraInfo
                };
            }
            if (j.cmd === 'ping' || j.action === 'health') return { kind: 'health' };
        } catch (_) { /* fall through */ }
    }
    // Plain event id or "eventID|user"
    const parts = raw.split('|');
    return {
        kind: 'event',
        eventId: parts[0].trim(),
        username: (parts[1] || 'viewer').trim(),
        lang: (parts[2] || 'th').trim()
    };
}

function executeCommand(command) {
    const parsed = parseCommand(command);
    if (!parsed) return { success: false, error: 'empty_command' };
    if (parsed.kind === 'health') {
        const st = getStatus();
        if (!st.listening) {
            try { start(); } catch (err) {
                return { success: false, error: err.message, ...getStatus() };
            }
        }
        const now = getStatus();
        return {
            success: true,
            ok: now.listening,
            message: now.connected ? 'game_connected' : 'listening_waiting_game',
            ...now
        };
    }
    const result = sendEvent(parsed);
    return {
        success: result.ok,
        ok: result.ok,
        message: result.ok ? (result.sent ? 'sent' : 'queued_no_client') : result.error,
        ...result
    };
}

module.exports = {
    DEFAULT_PORT,
    start,
    stop,
    getStatus,
    sendEvent,
    buildEventMessage,
    encodeEventData,
    executeCommand,
    parseCommand
};
