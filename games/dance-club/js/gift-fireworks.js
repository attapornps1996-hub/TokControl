/**
 * In-game TikTok gift fireworks (ported from overlay gift-firework effect).
 */
const FW_COLORS = ['#ff2d95', '#00e5ff', '#bc13fe', '#ffd23f', '#3affc0', '#ff6b35', '#ffffff'];

function pickColor(accent) {
    if (accent && Math.random() < 0.45) return accent;
    return FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
}

function ensureStyles() {
    if (document.getElementById('dc-fw-styles')) return;
    const style = document.createElement('style');
    style.id = 'dc-fw-styles';
    style.textContent = `
        #dcFireworkStage { position:fixed; inset:0; pointer-events:none !important; z-index:30; overflow:hidden; }
        .dc-fw-rocket {
            position:absolute; bottom:-20px; width:6px; height:6px; border-radius:50%;
            background:var(--fw-color,#ffcc00); box-shadow:0 0 12px var(--fw-color,#ffcc00);
            animation:dcFwRise var(--fw-rise-dur,0.8s) cubic-bezier(0.2,0.6,0.3,1) forwards;
            left:var(--fw-x,50%);
        }
        @keyframes dcFwRise {
            0% { transform:translate(0,0); opacity:1; }
            100% { transform:translate(var(--fw-dx,0), var(--fw-dy,-50vh)); opacity:0.9; }
        }
        .dc-fw-burst { position:absolute; transform:translate(-50%,-50%); width:0; height:0; pointer-events:none; }
        .dc-fw-spark {
            position:absolute; width:5px; height:5px; border-radius:50%;
            background:var(--fw-color,#fff); box-shadow:0 0 8px var(--fw-color,#fff);
            animation:dcFwSpark 1.8s ease-out forwards;
            transform:rotate(var(--fw-angle,0deg)) translateX(0);
        }
        @keyframes dcFwSpark {
            0% { opacity:1; transform:rotate(var(--fw-angle,0deg)) translateX(0) scale(1); }
            100% { opacity:0; transform:rotate(var(--fw-angle,0deg)) translateX(var(--fw-dist,80px)) scale(0.2); }
        }
        .dc-fw-sender {
            position:absolute; left:0; top:0; transform:translate(-50%,-50%);
            font:900 0.95rem Kanit,system-ui,sans-serif; color:#fff; white-space:nowrap;
            text-shadow:0 0 14px rgba(188,19,254,0.9),0 2px 8px rgba(0,0,0,0.85);
            padding:4px 12px; border-radius:18px; background:rgba(0,0,0,0.5);
            border:1px solid rgba(255,255,255,0.2); animation:dcFwSender 2.4s ease forwards;
            z-index:2;
        }
        @keyframes dcFwSender {
            0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); }
            15% { opacity:1; transform:translate(-50%,-50%) scale(1.05); }
            80% { opacity:1; }
            100% { opacity:0; transform:translate(-50%,-60%) scale(0.9); }
        }
    `;
    document.head.appendChild(style);
}

function spawnBurst(stage, xPct, yPct, giftInfo, color, scale = 1) {
    const burst = document.createElement('div');
    burst.className = 'dc-fw-burst';
    burst.style.left = xPct + '%';
    burst.style.top = yPct + '%';
    stage.appendChild(burst);

    const count = Math.round(28 * scale);
    for (let i = 0; i < count; i++) {
        const spark = document.createElement('div');
        spark.className = 'dc-fw-spark';
        const angle = (360 / count) * i + Math.random() * 12;
        const dist = (60 + Math.random() * 90) * scale;
        spark.style.setProperty('--fw-angle', angle + 'deg');
        spark.style.setProperty('--fw-dist', dist + 'px');
        spark.style.setProperty('--fw-color', color);
        burst.appendChild(spark);
    }

    const name = giftInfo.nickname || giftInfo.from || '';
    if (name) {
        const el = document.createElement('div');
        el.className = 'dc-fw-sender';
        el.textContent = `@${name} · ${giftInfo.giftName || '🎁'}`;
        burst.appendChild(el);
    }

    setTimeout(() => burst.remove(), 2800);
}

function launchOne(stage, giftInfo, accent, state) {
    state.active++;
    const coins = giftInfo.coins || 0;
    const scale = coins >= 1000 ? 1.35 : coins >= 100 ? 1.15 : 1;
    const color = pickColor(accent);
    const launchX = 12 + Math.random() * 76;
    const peakBottom = 42 + Math.random() * 22;
    const driftPct = (Math.random() * 10 - 5);
    const riseDur = 0.65 + Math.random() * 0.22;

    const rocket = document.createElement('div');
    rocket.className = 'dc-fw-rocket';
    rocket.style.setProperty('--fw-x', launchX + '%');
    rocket.style.setProperty('--fw-color', color);
    rocket.style.setProperty('--fw-dx', driftPct + 'vw');
    rocket.style.setProperty('--fw-dy', '-' + peakBottom + 'vh');
    rocket.style.setProperty('--fw-rise-dur', riseDur + 's');
    stage.appendChild(rocket);

    const riseMs = riseDur * 1000;
    setTimeout(() => {
        rocket.remove();
        const yTop = 100 - peakBottom;
        spawnBurst(stage, launchX + driftPct * 0.4, yTop, giftInfo, color, scale);
    }, riseMs);

    setTimeout(() => {
        state.active = Math.max(0, state.active - 1);
        processQueue(stage, state);
    }, riseMs + 3000);
}

function processQueue(stage, state) {
    const max = state.maxConcurrent;
    while (state.active < max && state.queue.length) {
        const item = state.queue.shift();
        launchOne(stage, item.giftInfo, item.accent, state);
    }
}

export function createGiftFireworks(container = null) {
    ensureStyles();
    const host = container || document.getElementById('dcApp') || document.body;
    let stage = host.querySelector?.('#dcFireworkStage') || document.getElementById('dcFireworkStage');
    if (!stage) {
        stage = document.createElement('div');
        stage.id = 'dcFireworkStage';
        host.appendChild(stage);
    }
    const state = { active: 0, queue: [], maxConcurrent: 5 };

    return {
        trigger(giftInfo, opts = {}) {
            const coins = giftInfo.coins || giftInfo.diamondCount || 0;
            const minCoins = opts.minCoins != null ? opts.minCoins : 0;
            if (coins < minCoins && minCoins > 0) return;
            const payload = {
                nickname: giftInfo.nickname || giftInfo.from || giftInfo.uniqueId,
                giftName: giftInfo.giftName || 'Gift',
                giftIcon: giftInfo.giftIcon,
                coins
            };
            if (state.active >= state.maxConcurrent) {
                if (state.queue.length < state.maxConcurrent * 3) {
                    state.queue.push({ giftInfo: payload, accent: opts.accent });
                }
                return;
            }
            launchOne(stage, payload, opts.accent || '#bc13fe', state);
        },
        setMaxConcurrent(n) {
            state.maxConcurrent = Math.max(1, n);
        }
    };
}
