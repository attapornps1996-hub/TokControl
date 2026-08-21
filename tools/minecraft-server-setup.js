#!/usr/bin/env node
/** CLI wrapper for setup */
const { setupMcServer } = require('./minecraft-server-launcher');
setupMcServer().then((r) => {
    console.log(JSON.stringify(r, null, 2));
}).catch((e) => {
    console.error(e);
    process.exit(1);
});
