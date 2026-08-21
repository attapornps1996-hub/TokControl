#!/usr/bin/env node
/**
 * TokControl Minecraft Test Bridge
 * รันเดี่ยว: node tools/minecraft-bridge-server.js
 * หรือถูกสตาร์ทอัตโนมัติจาก server.js
 *
 * Paper plugin จริงควร implement protocol เดียวกันที่พอร์ต 8081
 */
const http = require('http');

const PORT = Number(process.env.MC_BRIDGE_PORT || 8081);

let _server = null;

function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            ok: true,
            success: true,
            mod: 'TokControl_Minecraft_TestBridge',
            version: '0.1.0'
        }));
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            let data = {};
            try { data = JSON.parse(body || '{}'); } catch (e) {
                data = { cmd: 'raw', raw: body };
            }
            const cmd = data.cmd || 'unknown';
            console.log(`[MC Bridge] ${new Date().toISOString()} cmd=${cmd}`, JSON.stringify(data));

            if (cmd === 'place_block') {
                console.log(`  → วาง ${data.block} x${data.count || 1} @ ${data.placement || 'near'} โดย @${data.user || '?'}`);
            } else if (cmd === 'place_trap') {
                console.log(`  → ทริก ${data.trap} @ ${data.placement || 'near'} โดย @${data.user || '?'}`);
            } else if (cmd === 'fill_line') {
                console.log(`  → ต่อเส้น ${data.block} ยาว ${data.length || 5} โดย @${data.user || '?'}`);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'ok', received: data }));
        });
        return;
    }

    res.writeHead(404);
    res.end('not found');
}

function startMinecraftTestBridge(port = PORT) {
    return new Promise((resolve) => {
        if (_server) {
            resolve({ ok: true, already: true, port });
            return;
        }
        _server = http.createServer(handleRequest);
        _server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[MC Bridge] พอร์ต ${port} ถูกใช้อยู่แล้ว — ใช้ bridge ที่มีอยู่`);
                _server = null;
                resolve({ ok: true, already: true, port, inUse: true });
                return;
            }
            console.warn('[MC Bridge] start failed:', err.message);
            _server = null;
            resolve({ ok: false, error: err.message, port });
        });
        _server.listen(port, '127.0.0.1', () => {
            console.log(`[MC Bridge] Test server listening on http://127.0.0.1:${port}`);
            console.log(`[MC Bridge] ตั้ง TokControl → Minecraft → Host: ws://127.0.0.1:${port}`);
            resolve({ ok: true, port });
        });
    });
}

function stopMinecraftTestBridge() {
    if (!_server) return;
    try { _server.close(); } catch (e) {}
    _server = null;
}

if (require.main === module) {
    startMinecraftTestBridge();
}

module.exports = { startMinecraftTestBridge, stopMinecraftTestBridge, PORT };
