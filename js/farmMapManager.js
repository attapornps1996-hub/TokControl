/**
 * Farm Control Map — แมพฟาร์ม + datapack .mcfunction (TikTok Live → RCON)
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FarmMapManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    async function sendSafe(rcon, command) {
        if (!rcon || typeof rcon.send !== 'function') throw new Error('rcon.send is required');
        const cmd = String(command || '').trim();
        if (!cmd) throw new Error('empty command');
        try {
            return await rcon.send(cmd);
        } catch (err) {
            const e = new Error(`RCON failed: ${cmd} — ${err.message || err}`);
            e.cause = err;
            e.command = cmd;
            throw e;
        }
    }

    async function sendAll(rcon, commands, { stopOnError = false } = {}) {
        const results = [];
        const errors = [];
        for (const cmd of commands) {
            try {
                results.push(await sendSafe(rcon, cmd));
            } catch (err) {
                errors.push({ command: cmd, error: err.message || String(err) });
                if (stopOnError) throw err;
            }
        }
        return { ok: errors.length === 0, results, errors, count: results.length };
    }

    async function buildFarmMap(rcon) {
        return sendAll(rcon, ['tokcontrol farm start']);
    }

    async function getStatus(rcon) {
        const res = await sendAll(rcon, ['tokcontrol farm status']);
        let status = null;
        const bodies = (res.results || []).map((x) => x?.body || '').join('\n');
        const m = bodies.match(/\{[\s\S]*\}/);
        if (m) {
            try { status = JSON.parse(m[0]); } catch (_) {}
        }
        return { ...res, status };
    }

    function parseOnlinePlayers(listBody) {
        const text = String(listBody || '');
        // "There are 1 of a max of 20 players online: Steve"
        // "There are 2 of a max of 20 players online: Steve, Alex"
        const m = text.match(/online:\s*(.+)$/im) || text.match(/:\s*([A-Za-z0-9_, ]+)\s*$/);
        if (!m) return [];
        return m[1].split(',')
            .map((s) => s.trim())
            .filter((s) => /^[A-Za-z0-9_]{1,16}$/.test(s));
    }

    async function pickDecoratePlayer(rcon, preferred) {
        const listRes = await sendSafe(rcon, 'list');
        const players = parseOnlinePlayers(listRes.body || listRes.message || '');
        if (!players.length) {
            const err = new Error('ไม่มีผู้เล่นออนไลน์ — เข้าเซิร์ฟ Farm ก่อนแล้วกดโหมดแต่งแมพ');
            err.code = 'NO_PLAYER';
            throw err;
        }
        const want = String(preferred || 'Puncheroo').trim();
        const hit = players.find((p) => p.toLowerCase() === want.toLowerCase());
        if (hit) return hit;
        if (players.length === 1) return players[0];
        const err = new Error(
            `มีหลายคนในเซิร์ฟ (${players.join(', ')}) — เข้าด้วยชื่อ ${want} หรือให้อยู่คนเดียว`
        );
        err.code = 'MULTI_PLAYER';
        err.players = players;
        throw err;
    }

    async function toggleFarmAdminDecor(rcon, opts = {}) {
        const preferred = String(opts.player || opts.user || 'Puncheroo').trim();
        const target = await pickDecoratePlayer(rcon, preferred);

        // ให้ OP ก่อน — คำสั่ง tokcontrol เดิม default: op ทำให้ execute as เงียบล้มเหลว
        try { await sendSafe(rcon, `op ${target}`); } catch (_) {}

        // 1) คอนโซลโดยตรง (ปลั๊กอินใหม่รองรับ)
        const direct = await sendSafe(rcon, 'tokcontrol farm admin');
        const directBody = String(direct.body || '');
        // อย่า fallback เมื่อ body ว่าง — กันสลับโหมดซ้ำสองครั้ง
        const needExecute = /ใช้ในเกม|ต้องเข้าเกม|ไม่มีผู้เล่น|ไม่พบผู้เล่น|Unknown command|ไม่มีสิทธิ์|You do not have permission/i.test(directBody);

        let execBody = '';
        if (needExecute) {
            // 2) fallback: รันในฐานะผู้เล่น (JAR เก่า)
            const exec = await sendSafe(rcon, `execute as ${target} run tokcontrol farm admin`);
            execBody = String(exec.body || '');
        }

        const bodies = [directBody, execBody].filter(Boolean).join('\n');
        const failed = /ใช้ในเกม|ต้องเข้าเกม|ไม่มีผู้เล่น|ไม่พบผู้เล่น|ไม่มีสิทธิ์|ล้มเหลว/i.test(bodies)
            && !/โหมดแต่ง|Creative|ADMIN|เปิด|ปิด|สลับ/i.test(bodies);

        return {
            ok: !failed,
            target,
            results: [
                { body: directBody || (needExecute ? '' : `admin → ${target}`) },
                ...(execBody ? [{ body: execBody }] : [])
            ],
            errors: failed ? [{ error: bodies || `เปิดโหมดแต่งให้ ${target} ไม่สำเร็จ` }] : [],
            count: needExecute ? 2 : 1,
            message: failed
                ? (bodies || 'เปิดโหมดแต่งแมพไม่สำเร็จ')
                : `โหมดแต่งแมพสลับให้ ${target} — ควรได้ Creative + บิน`
        };
    }

    async function runAction(rcon, action, opts = {}) {
        const a = String(action || '').trim().toLowerCase();
        switch (a) {
            case 'build': case 'fm_build': case 'farm_build':
                return buildFarmMap(rcon);
            case 'status': case 'fm_status':
                return getStatus(rcon);
            case 'fm_fire': case 'fire': case 'disaster':
                return sendAll(rcon, ['tokcontrol farm fire']);
            case 'fm_cow': case 'cow':
                return sendAll(rcon, ['tokcontrol farm cow']);
            case 'fm_villager': case 'villager': case 'helper':
                return sendAll(rcon, ['tokcontrol farm villager']);
            case 'fm_wipe': case 'wipe':
                return sendAll(rcon, ['tokcontrol farm wipe']);
            case 'fm_flood': case 'flood':
                return sendAll(rcon, ['tokcontrol farm flood']);
            case 'fm_dragon': case 'dragon':
                return sendAll(rcon, ['tokcontrol farm dragon']);
            case 'fm_expand': case 'expand':
                return sendAll(rcon, [`tokcontrol farm expand ${Math.max(1, parseInt(opts.steps, 10) || 1)}`]);
            case 'fm_shrink': case 'shrink':
                return sendAll(rcon, [`tokcontrol farm shrink ${Math.max(1, parseInt(opts.steps, 10) || 1)}`]);
            case 'fm_snowman': case 'snowman':
                return sendAll(rcon, ['tokcontrol farm snowman']);
            case 'fm_blaze': case 'blaze': case 'fm_firethrower':
                return sendAll(rcon, ['tokcontrol farm blaze']);
            case 'fm_win': case 'win': case 'fm_abundance':
                return sendAll(rcon, ['tokcontrol farm win']);
            case 'fm_lose': case 'lose': case 'fm_kalpa':
                return sendAll(rcon, ['tokcontrol farm lose']);
            case 'fm_admin': case 'admin':
                return toggleFarmAdminDecor(rcon, opts);
            case 'fm_save': case 'save':
                return sendAll(rcon, ['tokcontrol farm save']);
            case 'fm_load': case 'load':
                return sendAll(rcon, ['tokcontrol farm load']);
            case 'fm_water': case 'water': case 'splash':
                return sendAll(rcon, ['tokcontrol farm water']);
            case 'fm_snow': case 'snow': case 'snowball': case 'fm_kit':
                return sendAll(rcon, ['tokcontrol farm snow']);
            case 'fm_plant_full': case 'fm_instant': case 'plant_full': case 'instant_plant': case 'fullgrow':
                return sendAll(rcon, ['tokcontrol farm plant_full']);
            case 'fm_jail': case 'fm_cage': case 'fm_stun': case 'jail': case 'cage': case 'stun': {
                const sec = Math.max(1, parseInt(opts.seconds, 10) || 10);
                return sendAll(rcon, [`tokcontrol farm jail ${sec}`]);
            }
            case 'fm_jail_add': case 'fm_stun_add': case 'jail_add': case 'stun_add': {
                const sec = Math.max(1, parseInt(opts.seconds, 10) || 10);
                return sendAll(rcon, [`tokcontrol farm jail_add ${sec}`]);
            }
            case 'fm_jail_sub': case 'fm_jail_reduce': case 'fm_stun_reduce': case 'jail_sub': case 'stun_reduce': {
                const sec = Math.max(1, parseInt(opts.seconds, 10) || 10);
                return sendAll(rcon, [`tokcontrol farm jail_sub ${sec}`]);
            }
            case 'fm_function': case 'function': {
                const path = String(opts.path || opts.fn || 'events/fire_disaster');
                return sendAll(rcon, [`tokcontrol farm function ${path}`]);
            }
            default:
                throw new Error(`Unknown Farm Control action: ${action}`);
        }
    }

    return { buildFarmMap, getStatus, runAction, sendAll, sendSafe, toggleFarmAdminDecor, parseOnlinePlayers };
}));
