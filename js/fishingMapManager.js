/**
 * Fish Control Map — ท่าเรือตกปลา Interactive (TikTok Live → RCON)
 * rcon interface: { send(command: string): Promise<any> }
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FishingMapManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TRASH_ITEMS = [
        'minecraft:leather_boots',
        'minecraft:bowl',
        'minecraft:stick',
        'minecraft:rotten_flesh',
        'minecraft:bone',
        'minecraft:string',
        'minecraft:lily_pad',
        'minecraft:ink_sac',
        'minecraft:glass_bottle',
        'minecraft:tripwire_hook'
    ];

    const DISTRACTIONS = [
        { id: 'pufferfish', cmd: 'execute at @p run summon pufferfish ~2 ~-2 ~8' },
        { id: 'pufferfish2', cmd: 'execute at @p run summon pufferfish ~-2 ~-2 ~10' },
        { id: 'drowned', cmd: 'execute at @p run summon drowned ~3 ~-3 ~12' },
        { id: 'squid', cmd: 'execute at @p run summon squid ~-1 ~-3 ~9' }
    ];

    /** สถานะโควตาปลา (ฝั่ง Node — sync กับ plugin ผ่านคำสั่ง) */
    let fishGoal = 35;
    let fishCaughtSession = 0;

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function fmt(n) {
        return n === 0 ? '~' : `~${n}`;
    }

    function fillAtPlayer(x1, y1, z1, x2, y2, z2, block) {
        return `execute at @p run fill ${fmt(x1)} ${fmt(y1)} ${fmt(z1)} ${fmt(x2)} ${fmt(y2)} ${fmt(z2)} ${block}`;
    }

    function setAtPlayer(x, y, z, block) {
        return `execute at @p run setblock ${fmt(x)} ${fmt(y)} ${fmt(z)} ${block}`;
    }

    async function sendSafe(rcon, command) {
        if (!rcon || typeof rcon.send !== 'function') {
            throw new Error('rcon.send is required');
        }
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

    function remainingFish() {
        return Math.max(0, fishGoal - fishCaughtSession);
    }

    function getQuotaState() {
        return {
            goal: fishGoal,
            caught: fishCaughtSession,
            remaining: remainingFish()
        };
    }

    function syncQuotaFromServer(fish) {
        if (!fish || typeof fish !== 'object') return getQuotaState();
        if (fish.goal != null) fishGoal = Math.max(1, Math.min(999, Number(fish.goal) || fishGoal));
        if (fish.caught != null) fishCaughtSession = Math.max(0, Number(fish.caught) || 0);
        else if (fish.remaining != null) {
            fishCaughtSession = Math.max(0, fishGoal - Number(fish.remaining));
        }
        return getQuotaState();
    }

    /** ลบ UI เก่า (bossbar/sidebar) — HUD มุมซ้ายอยู่ฝั่ง plugin */
    function buildClearLegacyUiCommands() {
        return [
            'scoreboard objectives setdisplay sidebar',
            'scoreboard objectives remove fc_ui',
            'bossbar set minecraft:fc_quota visible false',
            'bossbar remove minecraft:fc_quota',
            'bossbar remove fc_quota',
            'title @a clear'
        ];
    }

    async function syncQuotaUi(rcon) {
        return sendAll(rcon, buildClearLegacyUiCommands());
    }

    async function initFishQuota(rcon, opts = {}) {
        fishGoal = Math.max(1, Math.min(999, parseInt(opts.goal, 10) || 35));
        fishCaughtSession = 0;
        return sendAll(rcon, [
            ...buildClearLegacyUiCommands(),
            'gamerule announceAdvancements false',
            `tokcontrol fish goal ${fishGoal}`
        ]);
    }

    async function increaseFishQuota(rcon, opts = {}) {
        const amount = Math.max(1, Math.min(99, parseInt(opts.amount ?? opts.count, 10) || 1));
        fishGoal = Math.min(999, fishGoal + amount);
        return sendAll(rcon, [`tokcontrol fish add ${amount}`]);
    }

    async function decreaseFishQuota(rcon, opts = {}) {
        const amount = Math.max(1, Math.min(99, parseInt(opts.amount ?? opts.count, 10) || 1));
        fishGoal = Math.max(0, fishGoal - amount);
        return sendAll(rcon, [`tokcontrol fish sub ${amount}`]);
    }

    async function giftPlusWin(rcon, opts = {}) {
        const amount = Math.max(1, Math.min(99, parseInt(opts.amount ?? opts.count, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish pluswin ${amount}`]);
    }

    async function giftMinusWin(rcon, opts = {}) {
        const amount = Math.max(1, Math.min(99, parseInt(opts.amount ?? opts.count, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish minuswin ${amount}`]);
    }

    async function refreshCaughtFromGame(rcon) {
        return sendAll(rcon, ['tokcontrol fish status']);
    }

    async function spawnZombies(rcon, opts = {}) {
        const count = Math.max(1, Math.min(30, parseInt(opts.amount ?? opts.count, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish zombie ${count}`]);
    }

    async function spawnGolem(rcon, opts = {}) {
        const count = Math.max(1, Math.min(20, parseInt(opts.amount ?? opts.count, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish golem ${count}`]);
    }

    async function clearGolems(rcon) {
        return sendAll(rcon, ['tokcontrol fish cleargolem']);
    }

    async function startAutoFish(rcon, opts = {}) {
        // seconds = ระยะที่บวกเข้าไป (สแต็กฝั่ง plugin); default 10 × จำนวนของขวัญ
        const qty = Math.max(1, Math.min(50, parseInt(opts.count ?? opts.qty, 10) || 1));
        const add = Math.max(1, Math.min(300,
            parseInt(opts.seconds, 10) > 0 ? parseInt(opts.seconds, 10) : (10 * qty)
        ));
        return sendAll(rcon, [`tokcontrol fish autofish ${add}`]);
    }

    /** Multi Catch: +1 fish per reel (stacks until round win). qty = how many +1 steps. */
    async function startMultiCatch(rcon, opts = {}) {
        const steps = Math.max(1, Math.min(20, parseInt(opts.amount ?? opts.count ?? opts.qty, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish multi ${steps}`]);
    }

    /** Multi Catch: −1 fish per reel (min x1). */
    async function startDemultiCatch(rcon, opts = {}) {
        const steps = Math.max(1, Math.min(20, parseInt(opts.amount ?? opts.count ?? opts.qty, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish demulti ${steps}`]);
    }

    async function spawnVillagerHelp(rcon, opts = {}) {
        const n = Math.max(1, Math.min(20, parseInt(opts.amount ?? opts.count ?? opts.qty, 10) || 1));
        return sendAll(rcon, [`tokcontrol fish villager ${n}`]);
    }

    async function buildFishingMap(rcon, opts = {}) {
        const goal = Math.max(1, Math.min(999, parseInt(opts.goal, 10) || 35));
        fishGoal = goal;
        fishCaughtSession = 0;
        // plugin สร้างท่าเรือวงกลม + รีเซ็ตรอบ · ลบ bossbar/sidebar เก่า
        return sendAll(rcon, [
            ...buildClearLegacyUiCommands(),
            'gamerule announceAdvancements false',
            'gamerule doMobLoot false',
            'gamerule doEntityDrops false',
            'gamerule doTileDrops false',
            'tokcontrol fish reset',
            `tokcontrol fish goal ${goal}`
        ]);
    }

    async function addTrash(rcon, opts = {}) {
        const count = Math.max(1, Math.min(8, parseInt(opts.count, 10) || 1));
        const commands = [];
        for (let i = 0; i < count; i++) {
            const item = opts.item || pick(TRASH_ITEMS);
            const ox = Math.floor(Math.random() * 7) - 3;
            const oz = 8 + Math.floor(Math.random() * 10);
            commands.push(
                `execute at @p run summon item ~${ox} ~-1 ~${oz} {Item:{id:"${item}",Count:1b},PickupDelay:40}`
            );
        }
        return sendAll(rcon, commands);
    }

    async function clearTrash(rcon, opts = {}) {
        const dist = Math.max(5, Math.min(40, parseInt(opts.distance, 10) || 16));
        return sendAll(rcon, [
            `execute at @p run kill @e[type=item,distance=..${dist}]`
        ]);
    }

    async function spawnDistraction(rcon, opts = {}) {
        const pickOne = opts.kind
            ? (DISTRACTIONS.find((d) => d.id === opts.kind) || pick(DISTRACTIONS))
            : pick(DISTRACTIONS);
        return sendAll(rcon, [pickOne.cmd]);
    }

    async function grantFishingBuff(rcon, opts = {}) {
        const seconds = Math.max(10, Math.min(600, parseInt(opts.seconds, 10) || 60));
        const modernRod =
            'give @p minecraft:fishing_rod[unbreakable={},enchantments={levels:{"minecraft:lure":5,"minecraft:luck_of_the_sea":3,"minecraft:unbreaking":3}},custom_name={"text":"เบ็ดเทพ","color":"light_purple","italic":false}] 1';
        const legacyRod =
            'give @p minecraft:fishing_rod{Unbreakable:1b,Enchantments:[{id:"minecraft:lure",lvl:5s},{id:"minecraft:luck_of_the_sea",lvl:3s},{id:"minecraft:unbreaking",lvl:3s}]} 1';
        const first = await sendAll(rcon, [modernRod], { stopOnError: false });
        if (first.errors.length) {
            await sendSafe(rcon, legacyRod).catch(() => null);
        }
        return sendAll(rcon, [
            `effect give @p minecraft:luck ${seconds} 1 true`
        ]);
    }

    async function clearDistracted(rcon, opts = {}) {
        const dist = Math.max(5, Math.min(40, parseInt(opts.distance, 10) || 20));
        return sendAll(rcon, [
            `execute at @p run kill @e[type=pufferfish,distance=..${dist}]`,
            `execute at @p run kill @e[type=drowned,distance=..${dist}]`,
            `execute at @p run kill @e[type=squid,distance=..${dist}]`,
            `execute at @p run kill @e[type=zombie,distance=..${dist}]`
        ]);
    }

    async function runAction(rcon, action, opts = {}) {
        const a = String(action || '').trim().toLowerCase();
        switch (a) {
            case 'build':
            case 'build_map':
            case 'fc_build':
                return buildFishingMap(rcon, opts);
            case 'add_trash':
            case 'fc_add_trash':
                return addTrash(rcon, opts);
            case 'clear_trash':
            case 'fc_clear_trash':
                return clearTrash(rcon, opts);
            case 'spawn_distraction':
            case 'fc_spawn_distraction':
                return spawnDistraction(rcon, opts);
            case 'grant_buff':
            case 'fc_grant_buff':
                return grantFishingBuff(rcon, opts);
            case 'clear_distracted':
            case 'fc_clear_distracted':
            case 'fc_clear_distractions':
                return clearDistracted(rcon, opts);
            case 'increase_fish':
            case 'fc_increase_fish':
            case 'add_fish_goal':
                return increaseFishQuota(rcon, opts);
            case 'decrease_fish':
            case 'fc_decrease_fish':
            case 'remove_fish_goal':
                return decreaseFishQuota(rcon, opts);
            case 'plus_win':
            case 'fc_plus_win':
            case 'fc_add_win':
                return giftPlusWin(rcon, opts);
            case 'minus_win':
            case 'fc_minus_win':
            case 'fc_sub_win':
                return giftMinusWin(rcon, opts);
            case 'init_quota':
            case 'fc_init_quota':
                return initFishQuota(rcon, opts);
            case 'refresh_quota':
            case 'fc_refresh_quota':
                return refreshCaughtFromGame(rcon);
            case 'spawn_zombie':
            case 'fc_spawn_zombie':
            case 'zombie':
                return spawnZombies(rcon, opts);
            case 'spawn_golem':
            case 'fc_spawn_golem':
            case 'golem':
                return spawnGolem(rcon, opts);
            case 'clear_golem':
            case 'fc_clear_golem':
            case 'cleargolem':
                return clearGolems(rcon);
            case 'auto_fish':
            case 'fc_auto_fish':
            case 'autofish':
            case 'fc_fishing_boost':
                return startAutoFish(rcon, opts);
            case 'multi_fish':
            case 'fc_multi_fish':
            case 'multicatch':
            case 'fc_x_catch':
                return startMultiCatch(rcon, opts);
            case 'demulti_fish':
            case 'fc_demulti_fish':
            case 'fc_unmulti':
            case 'demulticatch':
                return startDemultiCatch(rcon, opts);
            case 'villager_help':
            case 'fc_villager_help':
            case 'villager':
            case 'fc_helpfish':
                return spawnVillagerHelp(rcon, opts);
            case 'wall':
            case 'fc_wall':
            case 'fc_fishing_wall':
            case 'block_fishing':
                return startFishingWall(rcon, opts);
            default:
                throw new Error(`Unknown Fish Control action: ${action}`);
        }
    }

    async function startFishingWall(rcon, opts = {}) {
        const sec = Math.max(3, Math.min(60, parseInt(opts.seconds, 10) || 15));
        return sendAll(rcon, [`tokcontrol fish wall ${sec}`]);
    }

    return {
        TRASH_ITEMS,
        DISTRACTIONS,
        buildFishingMap,
        addTrash,
        clearTrash,
        spawnDistraction,
        grantFishingBuff,
        clearDistracted,
        increaseFishQuota,
        decreaseFishQuota,
        initFishQuota,
        refreshCaughtFromGame,
        spawnZombies,
        spawnGolem,
        clearGolems,
        startAutoFish,
        startMultiCatch,
        startDemultiCatch,
        spawnVillagerHelp,
        startFishingWall,
        syncQuotaUi,
        getQuotaState,
        syncQuotaFromServer,
        runAction,
        sendAll,
        sendSafe
    };
}));
