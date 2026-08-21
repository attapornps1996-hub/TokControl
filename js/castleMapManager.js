/**
 * Castle Wars / Tower Wars — RCON → /tokcontrol tower …
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CastleMapManager = factory();
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
            if (!cmd) continue;
            try {
                results.push(await sendSafe(rcon, cmd));
            } catch (err) {
                errors.push({ command: cmd, error: err.message || String(err) });
                if (stopOnError) throw err;
            }
        }
        return { ok: errors.length === 0, results, errors, count: results.length };
    }

    function parseStatusFromBodies(results) {
        for (const r of results || []) {
            const body = String(r?.body || r?.message || r || '');
            const m = body.match(/\{[\s\S]*"blue"[\s\S]*"red"[\s\S]*\}/);
            if (m) {
                try { return JSON.parse(m[0]); } catch (_) {}
            }
        }
        return null;
    }

    async function buildCastleMap(rcon, opts = {}) {
        const prep = Math.max(15, parseInt(opts.seconds, 10) || 60);
        return sendAll(rcon, [`tokcontrol tower start ${prep}`]);
    }

    async function getStatus(rcon) {
        const res = await sendAll(rcon, ['tokcontrol tower status']);
        const status = parseStatusFromBodies(res.results);
        return { ...res, status };
    }

    /** team: 'blue'|'red'|null, kind: small|medium|large|cavalry|archer|mix|tnt|defender */
    async function spawnForTeam(rcon, team, kind = 'mix') {
        const t = String(team || 'blue').toLowerCase() === 'red' ? 'red' : 'blue';
        const k = String(kind || 'mix').toLowerCase();
        return sendAll(rcon, [`tokcontrol tower ${t} ${k}`]);
    }

    async function spawnEnemyWave(rcon, type = 'normal', opts = {}) {
        if (opts.team) return spawnForTeam(rcon, opts.team, type === 'boss' ? 'large' : (type === 'tnt' ? 'tnt' : 'mix'));
        const t = String(type || 'normal').toLowerCase();
        const testSuffix = opts.test ? ' test' : '';
        if (t === 'tnt') return sendAll(rcon, [`tokcontrol tower tnt${testSuffix}`]);
        if (t === 'boss') return sendAll(rcon, [`tokcontrol tower boss${testSuffix}`]);
        return sendAll(rcon, [`tokcontrol tower wave${testSuffix}`]);
    }

    async function applyDebuff(rcon) { return sendAll(rcon, ['tokcontrol tower debuff']); }
    async function spawnDefender(rcon, opts = {}) {
        if (opts.team) return spawnForTeam(rcon, opts.team, 'defender');
        return sendAll(rcon, [`tokcontrol tower defender${opts.test ? ' test' : ''}`]);
    }
    async function supplyResources(rcon) { return sendAll(rcon, ['tokcontrol tower supply']); }
    async function applyBuff(rcon) { return sendAll(rcon, ['tokcontrol tower buff']); }
    async function bigGiftEffect(rcon) { return sendAll(rcon, ['tokcontrol tower big']); }
    async function clearMobs(rcon) {
        return sendAll(rcon, [
            'kill @e[type=zombie]', 'kill @e[type=skeleton]', 'kill @e[type=husk]',
            'kill @e[type=horse]', 'kill @e[type=blaze]', 'kill @e[type=iron_golem]', 'kill @e[type=tnt]'
        ]);
    }

    async function runAction(rcon, action, opts = {}) {
        const a = String(action || '').trim().toLowerCase();
        switch (a) {
            case 'build': case 'tw_build': case 'castle_build':
                return buildCastleMap(rcon, opts);
            case 'status': case 'tw_status':
                return getStatus(rcon);
            case 'tw_wave_normal': case 'wave':
                return spawnEnemyWave(rcon, 'normal', opts);
            case 'tw_wave_tnt': case 'tnt':
                return spawnEnemyWave(rcon, 'tnt', opts);
            case 'tw_wave_boss': case 'boss':
                return spawnEnemyWave(rcon, 'boss', opts);
            case 'tw_debuff': case 'debuff':
                return applyDebuff(rcon);
            case 'tw_defender': case 'defender':
                return spawnDefender(rcon, opts);
            case 'tw_supply': case 'supply':
                return supplyResources(rcon);
            case 'tw_buff': case 'buff':
                return applyBuff(rcon);
            case 'tw_big': case 'big':
                return bigGiftEffect(rcon);
            case 'tw_clear':
                return clearMobs(rcon);
            case 'tw_test_wave':
                return spawnEnemyWave(rcon, 'normal', { test: true });
            case 'tw_test_tnt':
                return spawnEnemyWave(rcon, 'tnt', { test: true });
            case 'tw_test_boss':
                return spawnEnemyWave(rcon, 'boss', { test: true });
            case 'tw_test_defender':
                return spawnDefender(rcon, { test: true });
            case 'tw_blue_mix': case 'tw_test_blue':
                return spawnForTeam(rcon, 'blue', opts.kind || 'mix');
            case 'tw_red_mix': case 'tw_test_red':
                return spawnForTeam(rcon, 'red', opts.kind || 'mix');
            case 'tw_blue_small': return spawnForTeam(rcon, 'blue', 'small');
            case 'tw_blue_medium': return spawnForTeam(rcon, 'blue', 'medium');
            case 'tw_blue_large': return spawnForTeam(rcon, 'blue', 'large');
            case 'tw_blue_cavalry': return spawnForTeam(rcon, 'blue', 'cavalry');
            case 'tw_blue_archer': return spawnForTeam(rcon, 'blue', 'archer');
            case 'tw_blue_fire': return spawnForTeam(rcon, 'blue', 'fire');
            case 'tw_red_small': return spawnForTeam(rcon, 'red', 'small');
            case 'tw_red_medium': return spawnForTeam(rcon, 'red', 'medium');
            case 'tw_red_large': return spawnForTeam(rcon, 'red', 'large');
            case 'tw_red_cavalry': return spawnForTeam(rcon, 'red', 'cavalry');
            case 'tw_red_archer': return spawnForTeam(rcon, 'red', 'archer');
            case 'tw_red_fire': return spawnForTeam(rcon, 'red', 'fire');
            case 'tw_prep':
                return sendAll(rcon, [`tokcontrol tower prep ${Math.max(15, parseInt(opts.seconds, 10) || 60)}`]);
            case 'tw_begin': case 'tw_go': case 'tw_live':
                return sendAll(rcon, ['tokcontrol tower begin']);
            default:
                throw new Error(`Unknown Tower Wars action: ${action}`);
        }
    }

    return {
        buildCastleMap, getStatus, spawnForTeam, spawnEnemyWave,
        applyDebuff, spawnDefender, supplyResources, applyBuff, bigGiftEffect,
        clearMobs, runAction, sendAll, sendSafe, parseStatusFromBodies
    };
}));
