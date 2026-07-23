const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'tiktok-live-connector', 'dist', 'lib-Dgh9ZqfN.js');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf8');
const term = 'getJsonObjectFromWebcastApi';
let idx = 0;
while ((idx = fileContent.indexOf(term, idx)) !== -1) {
    console.log(`=== OCCURRENCE AT ${idx} ===`);
    console.log(fileContent.slice(idx - 100, idx + 600));
    idx += term.length;
}
