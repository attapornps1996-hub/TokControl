/**
 * Minimal Minecraft RCON client (Source RCON protocol).
 * No external deps — works with Paper/Spigot/Vanilla when enable-rcon=true.
 */
const net = require('net');

const TYPE_RESPONSE = 0;
const TYPE_COMMAND = 2;
const TYPE_LOGIN = 3;

function pack(requestId, type, body) {
    const payload = Buffer.from(String(body || ''), 'utf8');
    const len = 4 + 4 + payload.length + 2;
    const buf = Buffer.alloc(4 + len);
    buf.writeInt32LE(len, 0);
    buf.writeInt32LE(requestId, 4);
    buf.writeInt32LE(type, 8);
    payload.copy(buf, 12);
    buf.writeInt8(0, 12 + payload.length);
    buf.writeInt8(0, 13 + payload.length);
    return buf;
}

function readPackets(buffer) {
    const packets = [];
    let offset = 0;
    while (offset + 4 <= buffer.length) {
        const len = buffer.readInt32LE(offset);
        if (len < 10 || offset + 4 + len > buffer.length) break;
        const id = buffer.readInt32LE(offset + 4);
        const type = buffer.readInt32LE(offset + 8);
        const body = buffer.slice(offset + 12, offset + 4 + len - 2).toString('utf8');
        packets.push({ id, type, body });
        offset += 4 + len;
    }
    return { packets, rest: buffer.slice(offset) };
}

class RconClient {
    constructor({ host = '127.0.0.1', port = 25575, password = '', timeoutMs = 8000 } = {}) {
        this.host = host;
        this.port = Number(port) || 25575;
        this.password = String(password || '');
        this.timeoutMs = timeoutMs;
        this.socket = null;
        this.reqId = 1;
        this.buffer = Buffer.alloc(0);
        this.pending = new Map();
        this.authed = false;
    }

    connect() {
        if (this.socket && this.authed) return Promise.resolve(this);
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: this.host, port: this.port });
            this.socket = socket;
            this.buffer = Buffer.alloc(0);
            this.authed = false;

            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`RCON timeout connecting ${this.host}:${this.port}`));
            }, this.timeoutMs);

            socket.on('connect', async () => {
                try {
                    await this._login();
                    clearTimeout(timer);
                    resolve(this);
                } catch (e) {
                    clearTimeout(timer);
                    socket.destroy();
                    reject(e);
                }
            });

            socket.on('data', (chunk) => {
                this.buffer = Buffer.concat([this.buffer, chunk]);
                const { packets, rest } = readPackets(this.buffer);
                this.buffer = rest;
                for (const pkt of packets) {
                    const wait = this.pending.get(pkt.id);
                    if (wait) {
                        this.pending.delete(pkt.id);
                        wait.resolve(pkt);
                    }
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                for (const [, wait] of this.pending) wait.reject(err);
                this.pending.clear();
                reject(err);
            });

            socket.on('close', () => {
                this.authed = false;
                this.socket = null;
                for (const [, wait] of this.pending) wait.reject(new Error('RCON connection closed'));
                this.pending.clear();
            });
        });
    }

    _sendRaw(type, body) {
        return new Promise((resolve, reject) => {
            if (!this.socket) return reject(new Error('RCON not connected'));
            const id = this.reqId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('RCON command timeout'));
            }, this.timeoutMs);
            this.pending.set(id, {
                resolve: (pkt) => { clearTimeout(timer); resolve(pkt); },
                reject: (err) => { clearTimeout(timer); reject(err); }
            });
            this.socket.write(pack(id, type, body));
        });
    }

    async _login() {
        const pkt = await this._sendRaw(TYPE_LOGIN, this.password);
        if (pkt.id === -1) throw new Error('RCON auth failed — ตรวจรหัสใน server.properties');
        this.authed = true;
        return pkt;
    }

    async send(command) {
        if (!this.authed) await this.connect();
        const pkt = await this._sendRaw(TYPE_COMMAND, String(command || ''));
        return { ok: true, body: pkt.body || '', command: String(command || '') };
    }

    async sendMany(commands) {
        const results = [];
        for (const cmd of commands) {
            results.push(await this.send(cmd));
        }
        return results;
    }

    end() {
        if (this.socket) {
            try { this.socket.end(); } catch (e) {}
            this.socket = null;
        }
        this.authed = false;
    }
}

async function withRcon(opts, fn) {
    const client = new RconClient(opts);
    try {
        await client.connect();
        return await fn(client);
    } finally {
        client.end();
    }
}

module.exports = { RconClient, withRcon, TYPE_COMMAND, TYPE_LOGIN, TYPE_RESPONSE };
