/**
 * TokControl Cafe — Farmer's Delight orders + patience (Good Coffee / Great Pizza loop)
 *
 * ใช้ RCON ตัวโปรเจกต์: tools/rcon-client.js (ไม่ต้องติดตั้ง npm rcon)
 *
 * ตัวอย่าง:
 *   const { withRcon } = require('./tools/rcon-client');
 *   const Restaurant = require('./js/restaurantMapManager');
 *
 *   await withRcon({ host: '127.0.0.1', port: 25575, password: 'tokcontrol' }, async (rcon) => {
 *     await Restaurant.buildRestaurant(rcon);                       // สร้างร้าน
 *     await Restaurant.handleStreamEvent(rcon, 'CUSTOMER_ARRIVE');  // ลูกค้าเข้า
 *     await Restaurant.handleStreamEvent(rcon, 'ORDER_FOOD');
 *     await Restaurant.handleStreamEvent(rcon, 'KITCHEN_DISASTER');
 *     await Restaurant.handleStreamEvent(rcon, 'BONUS_REWARD');
 *     await Restaurant.tick(rcon, { playerName: 'Steve' });         // ตรวจโซน + เสิร์ฟ
 *   });
 *
 * CLI:
 *   node tools/restaurant-rcon.js build
 *   node tools/restaurant-rcon.js event CUSTOMER_ARRIVE
 *   node tools/restaurant-rcon.js tick Steve
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RestaurantMapManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TAG_CUSTOMER = 'tc_rs_customer';
    const TAG_ORDER = 'tc_rs_order';
    const SCORE_OBJ = 'tc_rs_money';
    const BOSSBAR_ID = 'tc_rs_order';
    const SAY_PREFIX = 'TC_RS';

    const DEFAULT_CONFIG = {
        origin: { x: 0, y: -60, z: 0, relativeToPlayer: false },
        queue: { minIntervalMs: 80 },
        cooldowns: {
            CUSTOMER_ARRIVE: 2500,
            ORDER_FOOD: 2000,
            KITCHEN_DISASTER: 8000,
            BONUS_REWARD: 4000,
            SERVE: 800
        },
        moneyPerServe: 15,
        missPenalty: 8,
        maxCustomers: 4,
        defaultPatienceMs: 45000,
        chefSpawn: { x: 5, y: 1, z: 6, yaw: -90 },
        zones: {},
        kitchenStations: {},
        counterBlocks: [],
        seats: [],
        tables: [],
        pantryChests: [],
        menu: [],
        pantryLoot: []
    };

    function deepMerge(base, extra) {
        if (!extra || typeof extra !== 'object') return { ...base };
        const out = Array.isArray(base) ? base.slice() : { ...base };
        for (const [k, v] of Object.entries(extra)) {
            if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] && !Array.isArray(out[k])) {
                out[k] = deepMerge(out[k], v);
            } else {
                out[k] = v;
            }
        }
        return out;
    }

    function pick(arr) {
        if (!arr || !arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    }

    function safeName(name) {
        const n = String(name || '').trim();
        if (n === '@p' || n === '@a' || n === '@s') return n;
        if (/^[A-Za-z0-9_]{1,16}$/.test(n)) return n;
        return '@p';
    }

    function safeItemId(id) {
        const s = String(id || '').trim().toLowerCase();
        if (/^[a-z0-9_]+:[a-z0-9_]+$/.test(s)) return s;
        return 'minecraft:bread';
    }

    function jsonText(text, extra = {}) {
        const payload = { text: String(text || ''), ...extra };
        return JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function acceptItems(menu) {
        if (!menu) return ['minecraft:bread'];
        return [menu.item, menu.fallback].filter(Boolean).map(safeItemId);
    }

    function recipeLine(menu) {
        const bits = (menu.ingredients || []).map((ing) => {
            const id = String(ing.item || '').replace(/^minecraft:/, '');
            return (ing.count > 1 ? ing.count + 'x ' : '') + id;
        });
        return bits.join(' + ') || (menu.labelTh || menu.label || '');
    }

    function parseOnlinePlayers(listBody) {
        const text = String(listBody || '');
        const m = text.match(/online:\s*(.+)$/im) || text.match(/:\s*([A-Za-z0-9_, ]+)\s*$/);
        if (!m) return [];
        return m[1].split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_]{1,16}$/.test(s));
    }

    function parsePos(body) {
        const m = String(body || '').match(/\[([-\d.]+)[dD]?,\s*([-\d.]+)[dD]?,\s*([-\d.]+)[dD]?\]/);
        if (!m) return null;
        return {
            x: Math.floor(Number(m[1])),
            y: Math.floor(Number(m[2])),
            z: Math.floor(Number(m[3]))
        };
    }

    function worldOf(origin, pt) {
        return {
            x: origin.x + Number(pt.x || 0),
            y: origin.y + Number(pt.y || 0),
            z: origin.z + Number(pt.z || 0)
        };
    }

    function xyz(p) {
        return `${p.x} ${p.y} ${p.z}`;
    }

    function signLine(text, color, bold) {
        return "'" + JSON.stringify({
            text: String(text || ''),
            color: color || 'black',
            bold: !!bold
        }).replace(/'/g, "\\'") + "'";
    }

    function wallSignCmd(x, y, z, facing, lines, dye) {
        const msgs = [0, 1, 2, 3].map((i) => signLine(lines[i] || '', i === 0 ? 'dark_red' : 'black', i === 0));
        return `setblock ${x} ${y} ${z} minecraft:oak_wall_sign[facing=${facing}]{front_text:{has_glowing_text:1b,color:"${dye || 'yellow'}",messages:[${msgs.join(',')}]},is_waxed:1b}`;
    }

    function itemFrameCmd(x, y, z, facing, item) {
        const face = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 }[String(facing || 'east')] ?? 5;
        return `summon item_frame ${x} ${y} ${z} {Facing:${face}b,Item:{id:"${safeItemId(item)}",count:1},Fixed:1b,Invulnerable:1b,Tags:["tc_rs_sign"]}`;
    }

    function zoneBox(origin, zone) {
        const a = worldOf(origin, zone.min);
        const b = worldOf(origin, zone.max);
        const min = {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            z: Math.min(a.z, b.z)
        };
        const max = {
            x: Math.max(a.x, b.x),
            y: Math.max(a.y, b.y),
            z: Math.max(a.z, b.z)
        };
        return {
            min,
            max,
            x: min.x,
            y: min.y,
            z: min.z,
            dx: Math.max(0, max.x - min.x),
            dy: Math.max(0, max.y - min.y),
            dz: Math.max(0, max.z - min.z)
        };
    }

    function entityInZoneSelector(playerName, box) {
        const who = safeName(playerName);
        return `${who}[x=${box.x},y=${box.y},z=${box.z},dx=${box.dx},dy=${box.dy},dz=${box.dz}]`;
    }

    // ── RCON helpers ──────────────────────────────────────────────
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

    function createQueue(minIntervalMs) {
        let chain = Promise.resolve();
        const gap = Math.max(0, Number(minIntervalMs) || 0);
        return {
            enqueue(fn) {
                const run = chain.then(async () => {
                    if (gap) await sleep(gap);
                    return fn();
                });
                chain = run.catch(() => null);
                return run;
            }
        };
    }

    function wrapQueuedRcon(rcon, queue) {
        return {
            send(command) {
                return queue.enqueue(() => sendSafe(rcon, command));
            }
        };
    }

    async function sendAll(rcon, commands, { stopOnError = false } = {}) {
        const results = [];
        const errors = [];
        for (const cmd of commands) {
            try {
                results.push(await rcon.send(cmd));
            } catch (err) {
                errors.push({ command: cmd, error: err.message || String(err) });
                if (stopOnError) throw err;
            }
        }
        return { ok: errors.length === 0, results, errors, count: results.length };
    }

    function loadConfigFromDisk(filePath) {
        if (typeof require !== 'function') return null;
        try {
            const fs = require('fs');
            const path = require('path');
            const p = filePath
                ? path.resolve(filePath)
                : path.join(__dirname, '..', 'data', 'restaurant_map_config.json');
            if (!fs.existsSync(p)) return null;
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (err) {
            return null;
        }
    }

    function createRestaurantController(userConfig) {
        const fileCfg = loadConfigFromDisk();
        const config = deepMerge(DEFAULT_CONFIG, deepMerge(fileCfg || {}, userConfig || {}));
        const queue = createQueue(config.queue?.minIntervalMs || 80);
        const lastEventAt = Object.create(null);
        const state = {
            origin: { x: Number(config.origin?.x) || 0, y: Number(config.origin?.y) || -60, z: Number(config.origin?.z) || 0 },
            originReady: false,
            customers: [],
            money: 0,
            lastZone: null,
            lastServeAt: 0,
            lastCraftAt: 0
        };

        function inCooldown(eventType) {
            const ms = Number(config.cooldowns?.[eventType] || 0);
            if (ms <= 0) return false;
            const now = Date.now();
            const last = lastEventAt[eventType] || 0;
            if (now - last < ms) return true;
            lastEventAt[eventType] = now;
            return false;
        }

        function qRcon(rcon) {
            return wrapQueuedRcon(rcon, queue);
        }

        async function blockIs(rcon, x, y, z, id) {
            try {
                const res = await sendSafe(rcon, `execute if block ${x} ${y} ${z} ${id}`);
                const body = String(res.body || res.message || '');
                if (/fail/i.test(body)) return false;
                return /passed|success/i.test(body);
            } catch (_) {
                return false;
            }
        }

        async function detectFloorY(rcon) {
            try { await sendSafe(rcon, 'forceload add -1 -1 2 1'); } catch (_) {}
            const probes = [-60, -59, -61, 4, 3, 5, 63, 64];
            for (const y of probes) {
                if (await blockIs(rcon, 0, y, 0, 'minecraft:grass_block')) return y;
            }
            for (const y of probes) {
                if (await blockIs(rcon, 0, y, 0, 'minecraft:dirt')) return y;
            }
            for (const y of probes) {
                if (await blockIs(rcon, 0, y, 0, 'minecraft:bedrock')) return y + 4;
            }
            return Number(config.origin?.y) || -60;
        }

        async function resolveOrigin(rcon, opts = {}) {
            if (state.originReady && !opts.force) return state.origin;
            const x = Number(config.origin?.x) || 0;
            const z = Number(config.origin?.z) || 0;
            const y = await detectFloorY(rcon);
            state.origin = { x, y, z };
            state.originReady = true;
            return state.origin;
        }

        function menuOf(idOrItem) {
            const key = String(idOrItem || '').toLowerCase();
            return (config.menu || []).find((m) => m.id === key || m.item === key || m.item?.endsWith(':' + key))
                || pick(config.menu);
        }

        function emptySeat() {
            const taken = new Set(state.customers.map((c) => c.seatId));
            return (config.seats || []).find((s) => !taken.has(s.id)) || null;
        }

        // ── 1) buildRestaurant — ร้านฟาสต์ฟู้ด เราเป็นพ่อครัว ────────
        function buildCommands(origin) {
            const k = zoneBox(origin, config.zones.KITCHEN_ZONE);
            const c = zoneBox(origin, config.zones.COUNTER_ZONE);
            const d = zoneBox(origin, config.zones.DINING_ZONE);
            const p = zoneBox(origin, config.zones.PANTRY_ZONE);
            const minX = Math.min(k.min.x, c.min.x, d.min.x, p.min.x);
            const maxX = Math.max(k.max.x, c.max.x, d.max.x, p.max.x);
            const minZ = Math.min(k.min.z, c.min.z, d.min.z, p.min.z);
            const maxZ = Math.max(k.max.z, c.max.z, d.max.z, p.max.z);
            const y0 = origin.y;
            const y1 = origin.y + 1;
            const y2 = origin.y + 2;
            const y3 = origin.y + 3;
            const y4 = origin.y + 4;
            const y5 = origin.y + 5;
            const chef = config.chefSpawn || { x: 5, y: 1, z: 6, yaw: -90 };
            const spawnX = origin.x + Number(chef.x || 5);
            const spawnZ = origin.z + Number(chef.z || 6);
            const spawnYaw = Number(chef.yaw);
            const yaw = Number.isFinite(spawnYaw) ? spawnYaw : -90;
            const menuWallX = c.max.x;
            const doorZ0 = origin.z + 6;
            const doorZ1 = origin.z + 9;
            const c0 = Math.floor(minX / 16) - 1;
            const c1 = Math.floor((maxX + 4) / 16) + 1;
            const zc0 = Math.floor(minZ / 16) - 1;
            const zc1 = Math.floor(maxZ / 16) + 1;
            const cmds = [
                'gamerule sendCommandFeedback false',
                'gamerule commandBlockOutput false',
                'gamerule spawnRadius 0',
                `forceload add ${c0} ${zc0} ${c1} ${zc1}`,
                `kill @e[tag=${TAG_CUSTOMER}]`,
                `kill @e[tag=${TAG_ORDER}]`,
                'kill @e[tag=tc_rs_sign]',
                `scoreboard objectives add ${SCORE_OBJ} dummy {"text":"Cafe $"}`,
                `scoreboard objectives setdisplay sidebar ${SCORE_OBJ}`,
                `fill ${minX} ${y1} ${minZ} ${maxX + 4} ${y5 + 1} ${maxZ} minecraft:air`,
                `fill ${minX} ${y0} ${minZ} ${maxX} ${y0} ${maxZ} minecraft:red_concrete`,
                `fill ${k.min.x} ${y0} ${k.min.z} ${k.max.x} ${y0} ${k.max.z} minecraft:polished_deepslate`,
                `fill ${c.min.x} ${y0} ${c.min.z} ${c.max.x} ${y0} ${c.max.z} minecraft:smooth_quartz`,
                `fill ${d.min.x} ${y0} ${d.min.z} ${d.max.x} ${y0} ${d.max.z} minecraft:white_concrete`,
                `fill ${p.min.x} ${y0} ${p.min.z} ${p.max.x} ${y0} ${p.max.z} minecraft:gray_concrete`,
                `fill ${d.min.x + 1} ${y0} ${origin.z + 6} ${maxX} ${y0} ${origin.z + 9} minecraft:red_concrete`,
                `fill ${maxX} ${y0} ${doorZ0} ${maxX + 4} ${y0} ${doorZ1} minecraft:yellow_concrete`,
                `fill ${minX} ${y1} ${minZ} ${maxX} ${y4} ${minZ} minecraft:red_concrete`,
                `fill ${minX} ${y1} ${maxZ} ${maxX} ${y4} ${maxZ} minecraft:red_concrete`,
                `fill ${minX} ${y1} ${minZ} ${minX} ${y4} ${maxZ} minecraft:red_concrete`,
                `fill ${maxX} ${y1} ${minZ} ${maxX} ${y4} ${maxZ} minecraft:red_concrete`,
                `fill ${minX} ${y4} ${minZ} ${maxX} ${y4} ${maxZ} minecraft:yellow_concrete`,
                `fill ${minX} ${y5} ${minZ} ${maxX} ${y5} ${maxZ} minecraft:red_concrete`,
                `fill ${origin.x + 2} ${y2} ${minZ} ${origin.x + 8} ${y3} ${minZ} minecraft:glass`,
                `fill ${origin.x + 16} ${y2} ${minZ} ${origin.x + 24} ${y3} ${minZ} minecraft:glass`,
                `fill ${origin.x + 16} ${y2} ${maxZ} ${origin.x + 24} ${y3} ${maxZ} minecraft:glass`,
                `fill ${maxX} ${y1} ${doorZ0} ${maxX} ${y3} ${doorZ1} minecraft:air`,
                `fill ${maxX} ${y4} ${doorZ0} ${maxX} ${y4} ${doorZ1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y1} ${doorZ0 - 1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y2} ${doorZ0 - 1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y3} ${doorZ0 - 1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y1} ${doorZ1 + 1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y2} ${doorZ1 + 1} minecraft:yellow_concrete`,
                `setblock ${maxX} ${y3} ${doorZ1 + 1} minecraft:yellow_concrete`,
                `fill ${k.max.x} ${y1} ${origin.z + 4} ${k.max.x} ${y2} ${origin.z + 8} minecraft:air`,
                `fill ${origin.x + 3} ${y5} ${origin.z + 3} ${origin.x + 7} ${y5} ${origin.z + 9} minecraft:sea_lantern`,
                `fill ${origin.x + 16} ${y5} ${origin.z + 4} ${origin.x + 24} ${y5} ${origin.z + 10} minecraft:sea_lantern`
            ];

            for (const st of config.kitchenStations.coffee || []) {
                const w = worldOf(origin, st);
                cmds.push(`setblock ${xyz(w)} minecraft:brewing_stand`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:light[level=12]`);
            }
            for (const st of config.kitchenStations.grill || []) {
                const w = worldOf(origin, st);
                cmds.push(`setblock ${xyz(w)} minecraft:smoker[facing=${st.facing || 'north'},lit=true]`);
                cmds.push(`setblock ${xyz(w)} farmersdelight:stove[facing=${st.facing || 'north'},lit=true]`);
                cmds.push(`execute unless block ${xyz(w)} farmersdelight:stove run setblock ${xyz(w)} minecraft:smoker[facing=${st.facing || 'north'},lit=true]`);
            }
            for (const st of config.kitchenStations.fryer || []) {
                const w = worldOf(origin, st);
                cmds.push(`setblock ${xyz(w)} minecraft:blast_furnace[facing=${st.facing || 'north'},lit=true]`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:campfire[lit=true]`);
            }
            for (const st of config.kitchenStations.soda || []) {
                const w = worldOf(origin, st);
                cmds.push(`setblock ${xyz(w)} minecraft:cauldron`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:hopper`);
            }
            cmds.push(
                `setblock ${origin.x + 2} ${y1} ${origin.z + 4} minecraft:crafting_table`,
                `setblock ${origin.x + 3} ${y1} ${origin.z + 4} minecraft:crafting_table`,
                wallSignCmd(origin.x + 1, y2, origin.z + 2, 'east', ['บาร์กาแฟ', 'COFFEE', 'Brewing Stand', 'โกโก้/ไซเดอร์'], 'brown'),
                wallSignCmd(origin.x + 1, y2, origin.z + 9, 'east', ['เตาอาหาร', 'GRILL', 'Smoker / Oven', 'เบอร์เกอร์/สเต็ก'], 'red')
            );

            for (const blk of config.counterBlocks || []) {
                const w = worldOf(origin, blk);
                cmds.push(`setblock ${xyz(w)} minecraft:smooth_quartz_stairs[facing=west,half=top]`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:light[level=12]`);
            }
            cmds.push(
                `setblock ${origin.x + 11} ${y1} ${origin.z + 2} minecraft:lectern[facing=east]`,
                wallSignCmd(origin.x + 12, y2, origin.z + 1, 'south', ['รับออเดอร์', 'ORDER HERE', 'วางอาหารที่เคาน์เตอร์', ''], 'yellow')
            );

            for (const t of config.tables || []) {
                const w = worldOf(origin, t);
                cmds.push(`setblock ${xyz(w)} minecraft:oak_fence`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:oak_pressure_plate`);
                cmds.push(`setblock ${w.x} ${w.y + 2} ${w.z} minecraft:lantern`);
            }
            for (const s of config.seats || []) {
                const w = worldOf(origin, s);
                cmds.push(`setblock ${xyz(w)} minecraft:oak_stairs[facing=east]`);
            }

            for (const chest of config.pantryChests || []) {
                const w = worldOf(origin, chest);
                cmds.push(`setblock ${xyz(w)} minecraft:chest[facing=south]`);
                cmds.push(`setblock ${w.x} ${w.y + 1} ${w.z} minecraft:barrel[facing=south]`);
            }
            cmds.push(wallSignCmd(origin.x + 1, y2, origin.z + 13, 'south', ['ตู้แช่', 'FRIDGE', 'วัตถุดิบ', ''], 'yellow'));

            const menu = config.menu || [];
            cmds.push(wallSignCmd(menuWallX, y3, origin.z + 2, 'east', ['TOK CAFE', 'COFFEE + FOOD', 'ดูสูตรบนป้าย', 'OPEN'], 'yellow'));
            for (let s = 0; s < Math.ceil(menu.length / 4); s++) {
                const chunk = menu.slice(s * 4, s * 4 + 4);
                const lines = chunk.map((m) => `${m.labelTh || m.label} $${m.price}`);
                cmds.push(wallSignCmd(menuWallX, y2, origin.z + 3 + s, 'east', lines, 'yellow'));
            }
            cmds.push(wallSignCmd(menuWallX, y3, origin.z + 10, 'east', ['คุณคือบาริสต้า', '1 ชงตามสูตร', '2 เสิร์ฟที่เคาน์เตอร์', 'อย่าให้หมดเวลา'], 'red'));

            menu.slice(0, 10).forEach((m, idx) => {
                cmds.push(itemFrameCmd(menuWallX + 1, y3, origin.z + 2 + idx, 'west', m.fallback || m.item));
            });

            cmds.push(
                `summon text_display ${menuWallX + 1} ${y3 + 0.8} ${origin.z + 6} {text:'{"text":"TOK CAFE","color":"gold","bold":true}',billboard:"center",shadow:1b,Tags:["tc_rs_sign"]}`,
                `summon text_display ${menuWallX + 1} ${y3 + 0.4} ${origin.z + 6} {text:'{"text":"COFFEE  /  FOOD","color":"red","bold":true}',billboard:"center",shadow:1b,Tags:["tc_rs_sign"]}`,
                wallSignCmd(maxX, y3, doorZ0, 'east', ['TOK CAFE', 'Good Coffee', 'Great Pizza', ''], 'yellow'),
                wallSignCmd(maxX, y3, doorZ1, 'east', ['เข้ามาเลย', 'คุณคือพ่อครัว', 'ครัวด้านใน', ''], 'yellow')
            );

            const kitItems = [
                ['minecraft:cocoa_beans', 16],
                ['minecraft:sugar', 16],
                ['minecraft:milk_bucket', 8],
                ['minecraft:apple', 16],
                ['minecraft:melon_slice', 16],
                ['minecraft:sweet_berries', 16],
                ['minecraft:bread', 16],
                ['minecraft:cooked_beef', 16],
                ['minecraft:cooked_chicken', 16],
                ['minecraft:cooked_porkchop', 16],
                ['minecraft:baked_potato', 16],
                ['minecraft:wheat', 16],
                ['minecraft:egg', 16],
                ['minecraft:honey_bottle', 8]
            ];
            kitItems.forEach(([id, n]) => cmds.push(`give @a ${id} ${n}`));
            (config.menu || []).forEach((m) => {
                if (m.item && String(m.item).startsWith('farmersdelight:')) {
                    cmds.push(`give @a ${m.item} 4`);
                }
            });
            cmds.push(
                'item replace entity @a armor.head with minecraft:leather_helmet',
                'item replace entity @a armor.chest with minecraft:leather_chestplate',
                `bossbar add ${BOSSBAR_ID} {"text":"Tok Cafe — รอออเดอร์"}`,
                `bossbar set ${BOSSBAR_ID} players @a`,
                `bossbar set ${BOSSBAR_ID} max 100`,
                `bossbar set ${BOSSBAR_ID} value 0`,
                `bossbar set ${BOSSBAR_ID} color white`,
                `scoreboard objectives add ${SCORE_OBJ} dummy {"text":"Cafe $"}`,
                `scoreboard objectives setdisplay sidebar ${SCORE_OBJ}`,
                `setworldspawn ${spawnX} ${y1} ${spawnZ}`,
                `spawnpoint @a ${spawnX} ${y1} ${spawnZ}`,
                `tp @a ${spawnX} ${y1} ${spawnZ} ${yaw} 10`,
                `title @a times 10 70 20`,
                `title @a title ${jsonText('TOK CAFE', { color: 'gold', bold: true })}`,
                `title @a subtitle ${jsonText('คุณคือบาริสต้า — ชงตามสูตร เสิร์ฟก่อนลูกค้าหมดใจ', { color: 'red' })}`,
                `tellraw @a ${jsonText('[Tok Cafe] ลูกค้าสั่ง → ยืนบาร์กาแฟ/เตาย่างถือวัตถุดิบครบ = ได้เมนู → เสิร์ฟที่เคาน์เตอร์', { color: 'gold' })}`,
                'playsound minecraft:block.note_block.bell master @a ~ ~ ~ 1 1.2'
            );
            return cmds;
        }

        async function buildRestaurant(rcon, opts = {}) {
            const origin = await resolveOrigin(rcon, { ...opts, force: true });
            const qr = qRcon(rcon);
            const built = await sendAll(qr, buildCommands(origin));
            state.customers = [];
            return { ...built, origin, message: `สร้างร้าน Tok Cafe ที่ ${origin.x} ${origin.y} ${origin.z} — คุณคือบาริสต้า` };
        }

        // ── 2) Stream events ──────────────────────────────────────
        async function spawnCustomer(rcon, payload = {}) {
            await resolveOrigin(rcon, payload);
            const seat = payload.seatId
                ? (config.seats || []).find((s) => s.id === payload.seatId)
                : emptySeat();
            if (!seat) {
                return { ok: false, skipped: true, reason: 'no_empty_seat', customers: state.customers.length };
            }
            if (state.customers.length >= (Number(config.maxCustomers) || 4)) {
                return { ok: false, skipped: true, reason: 'full', customers: state.customers.length };
            }
            const menu = menuOf(payload.menuId || payload.item) || pick(config.menu);
            if (!menu) return { ok: false, error: 'menu_empty' };

            const patienceMs = Number(payload.patienceMs || menu.patienceMs || config.defaultPatienceMs || 45000);
            const pos = worldOf(state.origin, seat);
            const name = jsonText(payload.customerName || payload.user || 'Customer', { color: 'gold' });
            const orderText = jsonText(menu.labelTh || menu.label, { color: 'yellow', bold: true });
            const recipe = recipeLine(menu);
            const qr = qRcon(rcon);
            const cmds = [
                `summon villager ${pos.x} ${pos.y} ${pos.z} {NoAI:1b,Silent:1b,Invulnerable:1b,PersistenceRequired:1b,CustomName:'${name}',CustomNameVisible:1b,Rotation:[${Number(seat.yaw) || 90}f,0f],Tags:["${TAG_CUSTOMER}","tc_rs_seat_${seat.id}","tc_rs_item_${menu.id}"],VillagerData:{profession:"minecraft:none",type:"minecraft:plains",level:1}}`,
                `summon text_display ${pos.x} ${pos.y + 2.2} ${pos.z} {text:'${orderText}',billboard:"center",shadow:1b,Tags:["${TAG_ORDER}","tc_rs_seat_${seat.id}"]}`,
                `title @a times 5 50 10`,
                `title @a title ${jsonText('NEW ORDER', { color: 'gold', bold: true })}`,
                `title @a subtitle ${jsonText(`${menu.labelTh || menu.label}  ·  ${recipe}`, { color: 'yellow' })}`,
                `tellraw @a ${JSON.stringify([
                    { text: '[Tok Cafe] ', color: 'gold' },
                    { text: String(payload.user || payload.username || 'customer'), color: 'aqua' },
                    { text: ' สั่ง ', color: 'white' },
                    { text: menu.labelTh || menu.label, color: 'yellow', bold: true },
                    { text: '  สูตร: ', color: 'gray' },
                    { text: recipe, color: 'white' }
                ])}`,
                `give @a paper 1`,
                `particle minecraft:happy_villager ${pos.x} ${pos.y + 1} ${pos.z} 0.4 0.4 0.4 0.02 18 force`,
                'playsound minecraft:entity.villager.yes master @a ~ ~ ~ 1 1'
            ];
            const res = await sendAll(qr, cmds);
            const customer = {
                seatId: seat.id,
                menuId: menu.id,
                item: menu.item,
                fallback: menu.fallback,
                station: menu.station || 'grill',
                ingredients: menu.ingredients || [],
                label: menu.labelTh || menu.label,
                recipe,
                price: Number(payload.price || menu.price || config.moneyPerServe),
                user: payload.user || payload.username || 'viewer',
                patienceMs,
                expiresAt: Date.now() + patienceMs
            };
            state.customers.push(customer);
            await syncBossbar(rcon);
            return { ...res, customer, origin: state.origin };
        }

        async function announceOrder(rcon, payload = {}) {
            const spawned = await spawnCustomer(rcon, payload);
            return spawned;
        }

        function firstOrder() {
            return state.customers[0] || null;
        }

        async function syncBossbar(rcon) {
            const qr = qRcon(rcon);
            const order = firstOrder();
            if (!order) {
                return sendAll(qr, [
                    `bossbar add ${BOSSBAR_ID} {"text":"Tok Cafe — ว่าง"}`,
                    `bossbar set ${BOSSBAR_ID} name {"text":"Tok Cafe — รอออเดอร์","color":"white"}`,
                    `bossbar set ${BOSSBAR_ID} players @a`,
                    `bossbar set ${BOSSBAR_ID} value 0`,
                    `bossbar set ${BOSSBAR_ID} color white`
                ]);
            }
            const left = Math.max(0, order.expiresAt - Date.now());
            const pct = Math.max(0, Math.min(100, Math.round((left / (order.patienceMs || 1)) * 100)));
            const color = pct > 55 ? 'green' : (pct > 25 ? 'yellow' : 'red');
            const sec = Math.ceil(left / 1000);
            const name = JSON.stringify({
                text: `${order.label}  ·  ${sec}s  ·  ${order.recipe}`,
                color: color === 'green' ? 'green' : (color === 'yellow' ? 'yellow' : 'red'),
                bold: true
            });
            return sendAll(qr, [
                `bossbar add ${BOSSBAR_ID} ${name}`,
                `bossbar set ${BOSSBAR_ID} name ${name}`,
                `bossbar set ${BOSSBAR_ID} players @a`,
                `bossbar set ${BOSSBAR_ID} max 100`,
                `bossbar set ${BOSSBAR_ID} value ${pct}`,
                `bossbar set ${BOSSBAR_ID} color ${color}`
            ]);
        }

        async function failOrder(rcon, customer, reason) {
            const penalty = Number(config.missPenalty || 8);
            state.money = Math.max(0, state.money - penalty);
            state.customers = state.customers.filter((c) => c.seatId !== customer.seatId);
            const qr = qRcon(rcon);
            const res = await sendAll(qr, [
                `kill @e[tag=tc_rs_seat_${customer.seatId}]`,
                `scoreboard players remove @a ${SCORE_OBJ} ${penalty}`,
                `playsound minecraft:entity.villager.no master @a ~ ~ ~ 1 0.8`,
                `title @a actionbar ${jsonText(`ลูกค้าหมดใจ! -$${penalty}  (${customer.label})`, { color: 'red', bold: true })}`
            ]);
            await syncBossbar(rcon);
            return { ...res, walked: true, reason, customer, money: state.money };
        }

        async function tickPatience(rcon) {
            const now = Date.now();
            const expired = state.customers.filter((c) => c.expiresAt && c.expiresAt <= now);
            const results = [];
            for (const c of expired) {
                results.push(await failOrder(rcon, c, 'patience'));
            }
            await syncBossbar(rcon);
            return { expired: expired.length, results };
        }

        async function kitchenDisaster(rcon, payload = {}) {
            await resolveOrigin(rcon, payload);
            const box = zoneBox(state.origin, config.zones.KITCHEN_ZONE);
            const cx = Math.floor((box.min.x + box.max.x) / 2);
            const cy = box.min.y + 1;
            const cz = Math.floor((box.min.z + box.max.z) / 2);
            const qr = qRcon(rcon);
            const title = jsonText('KITCHEN FIRE', { color: 'red', bold: true });
            return sendAll(qr, [
                `particle minecraft:flame ${cx} ${cy} ${cz} 1.6 0.4 1.6 0.02 80 force`,
                `particle minecraft:campfire_cosy_smoke ${cx} ${cy + 1} ${cz} 1.4 0.8 1.4 0.04 60 force`,
                `particle minecraft:lava ${cx} ${cy} ${cz} 0.8 0.1 0.8 0.01 20 force`,
                `playsound minecraft:item.firecharge.use master @a ${cx} ${cy} ${cz} 1 0.8`,
                `playsound minecraft:block.fire.ambient master @a ${cx} ${cy} ${cz} 1 1`,
                `title @a times 5 35 10`,
                `title @a title ${title}`,
                `title @a subtitle ${jsonText('ดับไฟที่ครัว!', { color: 'gold' })}`,
                `effect give @a[x=${box.x},y=${box.y},z=${box.z},dx=${box.dx},dy=${box.dy},dz=${box.dz}] minecraft:slowness 4 1 true`
            ]);
        }

        async function bonusReward(rcon, payload = {}) {
            await resolveOrigin(rcon, payload);
            const chests = config.pantryChests || [];
            if (!chests.length) return { ok: false, error: 'no_pantry_chest' };
            const lootPool = config.pantryLoot || [];
            const count = Math.max(1, Math.min(6, Number(payload.count || 3)));
            const qr = qRcon(rcon);
            const cmds = [];
            for (let i = 0; i < count; i++) {
                const chest = chests[i % chests.length];
                const loot = pick(lootPool) || { item: 'minecraft:bread', count: 8 };
                const w = worldOf(state.origin, chest);
                const slot = i % 27;
                const n = Math.max(1, Math.min(64, Number(loot.count || 8)));
                cmds.push(`item replace block ${xyz(w)} container.${slot} with ${safeItemId(loot.item)} ${n}`);
            }
            const pbox = zoneBox(state.origin, config.zones.PANTRY_ZONE);
            cmds.push(
                `particle minecraft:totem_of_undying ${pbox.x + pbox.dx / 2} ${pbox.y + 1} ${pbox.z + pbox.dz / 2} 0.8 0.5 0.8 0.2 25 force`,
                'playsound minecraft:entity.player.levelup master @a ~ ~ ~ 0.8 1.4',
                `title @a actionbar ${jsonText('วัตถุดิบเข้าคลังแล้ว!', { color: 'green' })}`
            );
            return sendAll(qr, cmds);
        }

        async function handleStreamEvent(rcon, eventType, payload = {}) {
            const type = String(eventType || '').trim().toUpperCase();
            if (!type) throw new Error('eventType is required');
            if (inCooldown(type) && !payload.force) {
                return { ok: true, skipped: true, reason: 'cooldown', eventType: type };
            }
            switch (type) {
                case 'CUSTOMER_ARRIVE':
                case 'CUSTOMER':
                    return spawnCustomer(rcon, payload);
                case 'ORDER_FOOD':
                case 'ORDER':
                    return announceOrder(rcon, payload);
                case 'KITCHEN_DISASTER':
                case 'DISASTER':
                case 'FIRE':
                    return kitchenDisaster(rcon, payload);
                case 'BONUS_REWARD':
                case 'BONUS':
                case 'PANTRY':
                    return bonusReward(rcon, payload);
                default:
                    throw new Error(`Unknown restaurant event: ${eventType}`);
            }
        }

        // ── 3) Zone detection + serve ─────────────────────────────
        async function checkPlayerZone(rcon, playerName) {
            await resolveOrigin(rcon, { playerName });
            const who = safeName(playerName);
            const qr = qRcon(rcon);
            const names = ['COFFEE_ZONE', 'GRILL_ZONE', 'KITCHEN_ZONE', 'COUNTER_ZONE', 'DINING_ZONE', 'PANTRY_ZONE'];
            const cmds = names
                .filter((n) => config.zones[n])
                .map((n) => {
                    const box = zoneBox(state.origin, config.zones[n]);
                    return `execute as ${entityInZoneSelector(who, box)} run data get entity @s UUID`;
                });
            const res = await sendAll(qr, cmds);
            const bodies = (res.results || []).map((x, i) => ({
                zone: names.filter((n) => config.zones[n])[i],
                body: String(x?.body || '')
            }));
            const hit = bodies.find((row) =>
                /has the following entity data/i.test(row.body)
                || /\[I;/.test(row.body)
                || /UUID/i.test(row.body)
            );
            const zone = hit ? hit.zone : null;
            state.lastZone = zone;
            return { ok: true, playerName: who, zone, origin: state.origin, raw: bodies.map((b) => b.body).join('\n') };
        }

        async function kitchenAmbient(rcon, playerName) {
            const who = safeName(playerName);
            const qr = qRcon(rcon);
            return sendAll(qr, [
                `execute at ${who} run particle minecraft:campfire_cosy_smoke ~ ~1.1 ~ 0.25 0.15 0.25 0.01 8 force`,
                `execute at ${who} run particle minecraft:smoke ~ ~1 ~ 0.15 0.05 0.15 0.005 4 force`
            ]);
        }

        async function clearCustomer(rcon, customer) {
            const qr = qRcon(rcon);
            return sendAll(qr, [
                `kill @e[tag=tc_rs_seat_${customer.seatId}]`
            ]);
        }

        async function tryCraftAtStation(rcon, playerName, zone) {
            if (!state.customers.length) return { ok: true, crafted: false, reason: 'no_orders' };
            if (Date.now() - state.lastCraftAt < (config.cooldowns.CRAFT || 900)) {
                return { ok: true, crafted: false, reason: 'cooldown' };
            }
            const who = safeName(playerName);
            const qr = qRcon(rcon);
            const stationFromZone = zone === 'COFFEE_ZONE' ? 'coffee' : (zone === 'GRILL_ZONE' ? 'grill' : null);

            for (const customer of state.customers.slice()) {
                const menu = menuOf(customer.menuId) || customer;
                const wantStation = menu.station || customer.station || 'grill';
                if (stationFromZone && wantStation !== stationFromZone) continue;
                const ings = menu.ingredients || customer.ingredients || [];
                if (!ings.length) continue;

                const cmds = [`tag ${who} remove tc_rs_craft`];
                let exec = `execute as ${who}`;
                for (const ing of ings) {
                    exec += ` if items entity @s container.* ${safeItemId(ing.item)}`;
                }
                exec += ` run tag ${who} add tc_rs_craft`;
                cmds.push(exec);
                cmds.push(`data get entity ${who} Tags`);
                const probe = await sendAll(qr, cmds);
                const body = (probe.results || []).map((x) => x?.body || '').join('\n');
                if (!/\btc_rs_craft\b/.test(body)) continue;

                state.lastCraftAt = Date.now();
                const finish = safeItemId(menu.fallback || menu.item || customer.fallback || customer.item);
                const fdItem = menu.item && String(menu.item).startsWith('farmersdelight:') ? menu.item : null;
                const after = [`tag ${who} remove tc_rs_craft`];
                for (const ing of ings) {
                    after.push(`clear ${who} ${safeItemId(ing.item)} ${Math.max(1, Number(ing.count) || 1)}`);
                }
                after.push(`give ${who} ${finish} 1`);
                if (fdItem) after.push(`give ${who} ${fdItem} 1`);
                after.push(`playsound minecraft:block.brewing_stand.brew master ${who} ~ ~ ~ 1 1`);
                after.push(`title @a actionbar ${jsonText(`ได้ ${menu.labelTh || menu.label} แล้ว — ไปเสิร์ฟที่เคาน์เตอร์`, { color: 'aqua', bold: true })}`);
                await sendAll(qr, after);
                return {
                    ok: true,
                    crafted: true,
                    customer,
                    item: finish,
                    label: menu.labelTh || menu.label
                };
            }
            return { ok: true, crafted: false, reason: 'ingredients_mismatch' };
        }

        async function tryServeAtCounter(rcon, playerName) {
            if (!state.customers.length) return { ok: true, served: false, reason: 'no_customers' };
            if (Date.now() - state.lastServeAt < (config.cooldowns.SERVE || 600)) {
                return { ok: true, served: false, reason: 'cooldown' };
            }
            const who = safeName(playerName);
            const qr = qRcon(rcon);
            for (const customer of state.customers.slice()) {
                const menu = menuOf(customer.menuId) || customer;
                const items = acceptItems(menu);
                const probeCmds = [`tag ${who} remove tc_rs_match`];
                for (const item of items) {
                    probeCmds.push(`execute as ${who} if items entity @s weapon.mainhand ${item} run tag ${who} add tc_rs_match`);
                    probeCmds.push(`execute as ${who} if items entity @s container.* ${item} run tag ${who} add tc_rs_match`);
                }
                probeCmds.push(`data get entity ${who} Tags`);
                const probe = await sendAll(qr, probeCmds);
                const body = (probe.results || []).map((x) => x?.body || '').join('\n');
                if (!/\btc_rs_match\b/.test(body)) continue;

                const pay = Number(customer.price || config.moneyPerServe);
                state.money += pay;
                state.lastServeAt = Date.now();
                await clearCustomer(rcon, customer);
                state.customers = state.customers.filter((c) => c.seatId !== customer.seatId);
                const clearItem = items[items.length - 1];
                await sendAll(qr, [
                    `tag ${who} remove tc_rs_match`,
                    ...items.map((item) => `clear ${who} ${item} 1`),
                    `scoreboard players add ${who} ${SCORE_OBJ} ${pay}`,
                    `playsound minecraft:entity.player.levelup master ${who} ~ ~ ~ 1 1.2`,
                    `playsound minecraft:entity.villager.yes master @a ~ ~ ~ 1 1.3`,
                    `title @a actionbar ${jsonText(`เสิร์ฟ ${customer.label}  +$${pay}`, { color: 'green', bold: true })}`
                ]);
                await syncBossbar(rcon);
                return {
                    ok: true,
                    served: true,
                    customer,
                    money: state.money,
                    remaining: state.customers.length,
                    unused: clearItem
                };
            }
            return { ok: true, served: false, reason: 'item_mismatch', waiting: state.customers.map((c) => c.label) };
        }

        async function tick(rcon, opts = {}) {
            const who = safeName(opts.playerName || '@p');
            const patience = await tickPatience(rcon);
            const zoneInfo = await checkPlayerZone(rcon, who);
            const extras = { zone: zoneInfo.zone, patience };
            if (zoneInfo.zone === 'COFFEE_ZONE' || zoneInfo.zone === 'GRILL_ZONE' || zoneInfo.zone === 'KITCHEN_ZONE') {
                extras.craft = await tryCraftAtStation(rcon, who, zoneInfo.zone);
                extras.kitchen = await kitchenAmbient(rcon, who);
            }
            if (zoneInfo.zone === 'COUNTER_ZONE') {
                extras.serve = await tryServeAtCounter(rcon, who);
            }
            return { ok: true, playerName: who, ...extras, money: state.money, customers: state.customers.length, waiting: state.customers.map((c) => c.label) };
        }

        async function getStatus(rcon) {
            const qr = qRcon(rcon);
            const list = await sendSafe(qr, 'list').catch(() => ({ body: '' }));
            return {
                ok: true,
                origin: state.origin,
                originReady: state.originReady,
                money: state.money,
                customers: state.customers.slice(),
                lastZone: state.lastZone,
                players: parseOnlinePlayers(list.body || ''),
                zones: Object.keys(config.zones || {}),
                menuCount: (config.menu || []).length
            };
        }

        async function clearAll(rcon) {
            const qr = qRcon(rcon);
            const res = await sendAll(qr, [
                `kill @e[tag=${TAG_CUSTOMER}]`,
                `kill @e[tag=${TAG_ORDER}]`,
                'kill @e[tag=tc_rs_sign]',
                `bossbar remove ${BOSSBAR_ID}`
            ]);
            state.customers = [];
            return res;
        }

        async function runAction(rcon, action, opts = {}) {
            const a = String(action || '').trim().toLowerCase();
            switch (a) {
                case 'build':
                case 'rs_build':
                case 'restaurant_build':
                    return buildRestaurant(rcon, opts);
                case 'customer':
                case 'rs_customer':
                case 'customer_arrive':
                    return handleStreamEvent(rcon, 'CUSTOMER_ARRIVE', opts);
                case 'order':
                case 'rs_order':
                case 'order_food':
                    return handleStreamEvent(rcon, 'ORDER_FOOD', opts);
                case 'disaster':
                case 'rs_disaster':
                case 'kitchen_disaster':
                case 'fire':
                    return handleStreamEvent(rcon, 'KITCHEN_DISASTER', opts);
                case 'bonus':
                case 'rs_bonus':
                case 'bonus_reward':
                case 'pantry':
                    return handleStreamEvent(rcon, 'BONUS_REWARD', opts);
                case 'tick':
                case 'rs_tick':
                    return tick(rcon, opts);
                case 'zone':
                case 'rs_zone':
                    return checkPlayerZone(rcon, opts.playerName || opts.player || '@p');
                case 'serve':
                case 'rs_serve':
                    return tryServeAtCounter(rcon, opts.playerName || opts.player || '@p');
                case 'craft':
                case 'rs_craft':
                    return tryCraftAtStation(rcon, opts.playerName || opts.player || '@p', opts.zone);
                case 'status':
                case 'rs_status':
                    return getStatus(rcon);
                case 'clear':
                case 'rs_clear':
                    return clearAll(rcon);
                default:
                    throw new Error(`Unknown Restaurant action: ${action}`);
            }
        }

        return {
            config,
            state,
            buildRestaurant,
            handleStreamEvent,
            checkPlayerZone,
            tick,
            tryServeAtCounter,
            kitchenAmbient,
            getStatus,
            clearAll,
            runAction
        };
    }

    const defaultController = createRestaurantController();

    function loadConfig(filePath) {
        const disk = loadConfigFromDisk(filePath);
        return deepMerge(DEFAULT_CONFIG, disk || {});
    }

    return {
        createRestaurantController,
        loadConfig,
        buildRestaurant: (...args) => defaultController.buildRestaurant(...args),
        handleStreamEvent: (...args) => defaultController.handleStreamEvent(...args),
        checkPlayerZone: (...args) => defaultController.checkPlayerZone(...args),
        tick: (...args) => defaultController.tick(...args),
        tryServeAtCounter: (...args) => defaultController.tryServeAtCounter(...args),
        getStatus: (...args) => defaultController.getStatus(...args),
        clearAll: (...args) => defaultController.clearAll(...args),
        runAction: (...args) => defaultController.runAction(...args),
        getState: () => defaultController.state,
        parseOnlinePlayers,
        DEFAULT_CONFIG
    };
}));
