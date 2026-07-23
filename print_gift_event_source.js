const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'tiktok-live-connector', 'dist', 'lib-Dgh9ZqfN.js');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf8');
const term = 'WebcastGiftMessage';
let idx = 0;

while ((idx = fileContent.indexOf(term, idx)) !== -1) {
    const start = Math.max(0, idx - 400);
    const end = Math.min(fileContent.length, idx + term.length + 800);
    console.log(`\n=== MATCH AT POS ${idx} ===`);
    console.log(fileContent.slice(start, end));
    idx += term.length;
}
