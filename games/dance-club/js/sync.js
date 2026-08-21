/**
 * Cross-window sync between Dance Club view (display) and control (settings).
 * View = engine host · Control = remote panel.
 */
const CHANNEL = 'tokcontrol-dance-club-v1';
const STORAGE_KEY = 'tokcontrol_dc_bus';

export function createSync(role = 'client') {
    const listeners = new Set();
    let bc = null;

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            bc = new BroadcastChannel(CHANNEL);
            bc.onmessage = (e) => dispatch(e.data);
        }
    } catch { /* private mode / old browser */ }

    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try { dispatch(JSON.parse(e.newValue)); } catch { /* ignore */ }
    });

    function dispatch(msg) {
        if (!msg || !msg.type) return;
        listeners.forEach((fn) => fn(msg));
    }

    function send(msg) {
        const payload = { ...msg, role, t: Date.now() };
        try { bc?.postMessage(payload); } catch { /* ignore */ }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
        return payload;
    }

    return {
        role,
        on(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        cmd(command, args = []) {
            return send({ type: 'cmd', command, args });
        },
        state(state) {
            return send({ type: 'state', state });
        },
        ping() {
            return send({ type: 'ping' });
        },
        pong() {
            return send({ type: 'pong' });
        }
    };
}
