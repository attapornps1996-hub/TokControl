#!/usr/bin/env node
/**
 * CLI — ควบคุมแมพร้านอาหารผ่าน RCON
 *
 *   node tools/restaurant-rcon.js build
 *   node tools/restaurant-rcon.js event CUSTOMER_ARRIVE
 *   node tools/restaurant-rcon.js event ORDER_FOOD --user Puncheroo
 *   node tools/restaurant-rcon.js event KITCHEN_DISASTER
 *   node tools/restaurant-rcon.js event BONUS_REWARD
 *   node tools/restaurant-rcon.js tick [PlayerName]
 *   node tools/restaurant-rcon.js zone [PlayerName]
 *   node tools/restaurant-rcon.js status
 *   node tools/restaurant-rcon.js clear
 *
 * Env / flags:
 *   --host 127.0.0.1 --port 25575 --password tokcontrol
 *   --config data/restaurant_map_config.json
 *   MC_RCON_HOST MC_RCON_PORT MC_RCON_PASSWORD
 */
const path = require('path');
const { withRcon } = require('./rcon-client');
const Restaurant = require('../js/restaurantMapManager');

function argVal(args, name, fallback) {
    const i = args.indexOf(name);
    if (i >= 0 && args[i + 1]) return args[i + 1];
    return fallback;
}

function parseArgs(argv) {
    const rest = argv.filter((a) => !a.startsWith('--') || false);
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            i++;
            continue;
        }
        positional.push(argv[i]);
    }
    return {
        host: argVal(argv, '--host', process.env.MC_RCON_HOST || '127.0.0.1'),
        port: Number(argVal(argv, '--port', process.env.MC_RCON_PORT || 25575)),
        password: String(argVal(argv, '--password', process.env.MC_RCON_PASSWORD || 'tokcontrol')),
        config: argVal(argv, '--config', path.join(__dirname, '..', 'data', 'restaurant_map_config.json')),
        user: argVal(argv, '--user', 'viewer'),
        player: argVal(argv, '--player', positional[2] || '@p'),
        positional
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cmd = String(args.positional[0] || '').toLowerCase();
    if (!cmd || cmd === 'help' || cmd === '-h') {
        console.log(`TokControl Restaurant RCON

Commands:
  build                         สร้างร้านตาม data/restaurant_map_config.json
  event <TYPE>                  CUSTOMER_ARRIVE | ORDER_FOOD | KITCHEN_DISASTER | BONUS_REWARD
  tick [player]                 ตรวจโซน + ควันครัว / เสิร์ฟที่เคาน์เตอร์
  zone [player]                 บอกว่าผู้เล่นอยู่โซนไหน
  serve [player]                ตรวจไอเทมในมือกับออเดอร์
  status                        สถานะลูกค้า / เงิน / origin
  clear                         ลบลูกค้าและป้ายออเดอร์

ตัวอย่าง:
  node tools/restaurant-rcon.js --host 127.0.0.1 --port 25575 --password tokcontrol build
  node tools/restaurant-rcon.js event CUSTOMER_ARRIVE
  node tools/restaurant-rcon.js tick Steve`);
        process.exit(0);
    }

    const fileCfg = Restaurant.loadConfig(args.config);
    const ctrl = Restaurant.createRestaurantController(fileCfg);
    const conn = { host: args.host, port: args.port, password: args.password };

    try {
        const result = await withRcon(conn, async (rcon) => {
            switch (cmd) {
                case 'build':
                    return ctrl.buildRestaurant(rcon, { playerName: args.player });
                case 'event': {
                    const type = args.positional[1];
                    if (!type) throw new Error('ใส่ event type เช่น CUSTOMER_ARRIVE');
                    return ctrl.handleStreamEvent(rcon, type, { user: args.user, playerName: args.player });
                }
                case 'tick':
                    return ctrl.tick(rcon, { playerName: args.positional[1] || args.player });
                case 'zone':
                    return ctrl.checkPlayerZone(rcon, args.positional[1] || args.player);
                case 'serve':
                    return ctrl.tryServeAtCounter(rcon, args.positional[1] || args.player);
                case 'status':
                    return ctrl.getStatus(rcon);
                case 'clear':
                    return ctrl.clearAll(rcon);
                default:
                    return ctrl.runAction(rcon, cmd, { playerName: args.player, user: args.user });
            }
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('[Restaurant RCON]', err.message || err);
        process.exit(1);
    }
}

main();
