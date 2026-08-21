/**
 * Donate module entry — clear backend boundary for streamer donations.
 *
 * Layout:
 *   donate/index.js   — public exports
 *   donate/routes.js  — HTTP + Socket.IO wiring
 *   donate/service.js — business logic (QR, slip verify, stats)
 *   donate/store.js   — SQLite / Firestore persistence
 */
module.exports = require('./routes');
